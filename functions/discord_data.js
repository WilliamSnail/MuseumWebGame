import "./options.js"; // 地區、initializeApp：一定要最先（見 options.js）
// ================================================================
//  Discord 聯動第一步的資料讀寫（決定 0051）。規則在 shared/discord.js；這個檔只管 Firestore 交易。
//  放哪裡（都只有 Functions 碰得到：firestore.rules 最後一條「一律不准」擋住瀏覽器）：
//    discordLinks/{discordId}     { uid, at }                      這個 Discord 帳號接著哪個遊戲帳號
//    discordUids/{uid}            { discordId, at }                反過來查（兩邊都唯一）
//    discordCodes/L{6 位數}       { uid, exp }                      綁定碼（遊戲裡拿）
//    discordCodes/u{uid}          { code }                          這個帳號現在有效的綁定碼（再拿壹個就把舊的作廢）
//    discordCodes/J{16 字}        { discordId, exp, used, usedAt }  自己加入的連結碼
//    discordCodes/j{discordId}    { code }                          這個 Discord 帳號現在有效的連結碼
//    discordTries/{discordId}     { n, since }                      綁定碼打錯幾次（暫時擋）
//    discordBonus/{uid}           { at, amount }                    綁定獎勵領過了。**解除綁定不會刪**，所以只送壹次
//    discordJoins/{discordId}     { uid, email, at } 或 { blocked: true, email }   這個 Discord 帳號靠連結加入過／被擋
//    discordJoinDay/{台灣日期}    { n }                             今天靠 Discord 加入幾人
//  獎勵：籌碼直接加進 casinoWallets/{uid}（沒進過賭場的人沒有錢包：用 casWalletFix 開壹個，開場籌碼照給，再加獎勵），
//    跟賭場的交易搶同壹份文件，Firestore 會讓其中壹邊重試，不會互相蓋掉。不從莊家扣（系統發的）。
//  所有函式回傳 { ok, … }；不是錯誤的失敗（碼不對、名額滿…）用 { ok: false, reason } 回，不丟錯。
// ================================================================
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { randomInt } from "node:crypto";
import { NUM } from "./shared/config.js";
import { taipeiDay } from "./shared/logic.js";
import { casWalletFix } from "./shared/casino_wallet.js";
import { casMint } from "./shared/casino_book.js";
import { dcExpireAt, dcExpired, dcJoinCodeMake, dcJoinFull, dcLinkCodeMake, dcLinkCodeOf, dcTriesFail, dcTriesState } from "./shared/discord.js";

const db = () => getFirestore();
const ref = path => db().doc(path);
const linkRef = id => ref(`discordLinks/${id}`);
const uidRef = uid => ref(`discordUids/${uid}`);
const codeRef = key => ref(`discordCodes/${key}`);
const triesRef = id => ref(`discordTries/${id}`);
const bonusRef = uid => ref(`discordBonus/${uid}`);
const joinRef = id => ref(`discordJoins/${id}`);
const joinDayRef = day => ref(`discordJoinDay/${day}`);
const walletRef = uid => ref(`casinoWallets/${uid}`);
const memberRef = uid => ref(`members/${uid}`);
const inviteRef = email => ref(`invites/${email}`);
export const rand = (a, b) => randomInt(a, b);

// 綁定獎勵：沒領過才送。要在交易裡「所有讀都做完之後」叫。回傳送了多少（領過了＝0）
function bonusWrites(tx, uid, bonusSnap, walletSnap, day, now) {
  if (bonusSnap.exists) return 0;
  const amount = NUM.discord.linkBonus;
  const w = casWalletFix(walletSnap.exists ? JSON.parse(walletSnap.data().data) : null, day);
  casMint(w, "discord", amount);
  if (w.chips > w.st.chipsMax) w.st.chipsMax = w.chips;
  tx.set(walletRef(uid), { data: JSON.stringify(w), updatedAt: FieldValue.serverTimestamp() });
  tx.set(bonusRef(uid), { at: now, amount });
  return amount;
}

// ---------- 遊戲裡：拿綁定碼、看狀態、解除 ----------
export async function makeLinkCode(uid, now) {
  return db().runTransaction(async tx => {
    const [us, old] = await Promise.all([tx.get(uidRef(uid)), tx.get(codeRef(`u${uid}`))]);
    if (us.exists) return { ok: false, reason: "linked" };
    let code = null;
    for (let i = 0; i < 10 && !code; i++) {
      const c = dcLinkCodeMake(rand), s = await tx.get(codeRef(`L${c}`));
      if (!s.exists || dcExpired(s.data().exp, now)) code = c;
    }
    if (!code) return { ok: false, reason: "busy" };
    if (old.exists && old.data().code && old.data().code !== code) tx.delete(codeRef(`L${old.data().code}`));
    const exp = dcExpireAt(now, NUM.discord.linkCodeMin);
    tx.set(codeRef(`L${code}`), { uid, exp });
    tx.set(codeRef(`u${uid}`), { code });
    return { ok: true, code, exp };
  });
}
export async function linkState(uid, now) {
  const us = await uidRef(uid).get();
  if (us.exists) return { linked: true, at: us.data().at || null };
  const u = await codeRef(`u${uid}`).get();
  if (u.exists && u.data().code) {
    const c = await codeRef(`L${u.data().code}`).get();
    if (c.exists && c.data().uid === uid && !dcExpired(c.data().exp, now)) return { linked: false, code: u.data().code, exp: c.data().exp };
  }
  return { linked: false };
}
export async function unlinkByUid(uid) {
  return db().runTransaction(async tx => {
    const us = await tx.get(uidRef(uid));
    if (!us.exists) return { ok: false, reason: "none" };
    tx.delete(uidRef(uid));
    tx.delete(linkRef(us.data().discordId));
    return { ok: true };
  });
}

// ---------- Discord：/pepe-綁定 碼 ----------
export async function linkByCode(discordId, text, now) {
  const day = taipeiDay(now), code = dcLinkCodeOf(text);
  return db().runTransaction(async tx => {
    const [tr, ls] = await Promise.all([tx.get(triesRef(discordId)), tx.get(linkRef(discordId))]);
    const st = dcTriesState(tr.exists ? tr.data() : null, now);
    if (st.blocked) return { ok: false, reason: "locked", waitMin: st.waitMin };
    if (ls.exists) return { ok: false, reason: "already" };
    const cs = code ? await tx.get(codeRef(`L${code}`)) : null;
    const bad = !cs || !cs.exists || dcExpired(cs.data().exp, now);
    if (bad) {
      tx.set(triesRef(discordId), dcTriesFail(tr.exists ? tr.data() : null, now));
      return { ok: false, reason: "badcode", left: Math.max(0, st.left - 1) };
    }
    const uid = cs.data().uid;
    const [us, ms, bs, ws] = await Promise.all([tx.get(uidRef(uid)), tx.get(memberRef(uid)), tx.get(bonusRef(uid)), tx.get(walletRef(uid))]);
    if (us.exists) return { ok: false, reason: "taken" };
    if (!ms.exists) return { ok: false, reason: "member" };
    tx.set(linkRef(discordId), { uid, at: now });
    tx.set(uidRef(uid), { discordId, at: now });
    tx.delete(codeRef(`L${code}`));
    tx.delete(codeRef(`u${uid}`));
    if (tr.exists) tx.delete(triesRef(discordId));
    const bonus = bonusWrites(tx, uid, bs, ws, day, now);
    return { ok: true, nick: ms.data().nick, bonus, uid };
  });
}

// ---------- Discord：/pepe-解除綁定 ----------
export async function unlinkByDiscord(discordId) {
  return db().runTransaction(async tx => {
    const ls = await tx.get(linkRef(discordId));
    if (!ls.exists) return { ok: false, reason: "none" };
    tx.delete(linkRef(discordId));
    tx.delete(uidRef(ls.data().uid));
    return { ok: true };
  });
}
export async function linkedUid(discordId) {
  const s = await linkRef(discordId).get();
  return s.exists ? s.data().uid : null;
}

// ---------- Discord：/pepe-加入 ----------
// 回傳 { ok: true, code } 或 { ok: false, reason: "member"|"full"|"blocked"|"used" }
export async function startJoin(discordId, now) {
  const day = taipeiDay(now);
  return db().runTransaction(async tx => {
    const [ls, js, ds, oldJ] = await Promise.all([tx.get(linkRef(discordId)), tx.get(joinRef(discordId)), tx.get(joinDayRef(day)), tx.get(codeRef(`j${discordId}`))]);
    // 停用的人不能靠 Discord 回來（也不能再發連結）
    if (js.exists) {
      const j = js.data();
      if (j.blocked) return { ok: false, reason: "blocked" };
      if (j.email) { const inv = await tx.get(inviteRef(j.email)); if (inv.exists && inv.data().disabled) return { ok: false, reason: "blocked" }; }
    }
    // 已經是館友（綁定過的，或之前靠連結加入的）
    if (ls.exists) { const m = await tx.get(memberRef(ls.data().uid)); if (m.exists) return { ok: false, reason: "member" }; }
    if (js.exists && js.data().uid) {
      const m = await tx.get(memberRef(js.data().uid));
      return { ok: false, reason: m.exists ? "member" : "used" };
    }
    if (dcJoinFull(ds.exists ? ds.data().n : 0)) return { ok: false, reason: "full" };
    let code = null;
    for (let i = 0; i < 5 && !code; i++) { const c = dcJoinCodeMake(rand), s = await tx.get(codeRef(`J${c}`)); if (!s.exists) code = c; }
    if (!code) return { ok: false, reason: "busy" };
    if (oldJ.exists && oldJ.data().code) tx.delete(codeRef(`J${oldJ.data().code}`));
    const exp = dcExpireAt(now, NUM.discord.joinCodeMin);
    tx.set(codeRef(`J${code}`), { discordId, exp, used: false });
    tx.set(codeRef(`j${discordId}`), { code });
    return { ok: true, code, exp };
  });
}

// ---------- 網頁：join 帶著連結碼 ----------
// 沒有帶碼的 join 完全不走這裡。已經是館友的，碼不會被用掉（ok: true, member: true）。
// 回傳 { ok: true, bonus } 或 { ok: false, reason: "badcode"|"disabled"|"used"|"full" }
export async function redeemJoin({ uid, email, nick, code, now }) {
  const day = taipeiDay(now);
  return db().runTransaction(async tx => {
    const ms = await tx.get(memberRef(uid));
    if (ms.exists) return { ok: true, member: true, bonus: 0 };
    const cs = await tx.get(codeRef(`J${code}`));
    if (!cs.exists || cs.data().used || dcExpired(cs.data().exp, now)) return { ok: false, reason: "badcode" };
    const discordId = cs.data().discordId;
    const [inv, js, ls, us, ds, bs, ws] = await Promise.all([tx.get(inviteRef(email)), tx.get(joinRef(discordId)), tx.get(linkRef(discordId)), tx.get(uidRef(uid)), tx.get(joinDayRef(day)), tx.get(bonusRef(uid)), tx.get(walletRef(uid))]);
    if (inv.exists && inv.data().disabled) { // 被管理員停用：回不來，這個 Discord 帳號也不能再用 /pepe-加入
      tx.set(joinRef(discordId), { blocked: true, email, at: now });
      return { ok: false, reason: "disabled" };
    }
    if ((js.exists && (js.data().uid || js.data().blocked)) || ls.exists || us.exists) return { ok: false, reason: "used" };
    if (dcJoinFull(ds.exists ? ds.data().n : 0)) return { ok: false, reason: "full" };
    tx.set(memberRef(uid), { nick, invisible: false, joinedAt: FieldValue.serverTimestamp() });
    if (!inv.exists) tx.set(inviteRef(email), { source: "discord", createdAt: FieldValue.serverTimestamp() });
    tx.update(codeRef(`J${code}`), { used: true, usedAt: now });
    tx.delete(codeRef(`j${discordId}`));
    tx.set(joinRef(discordId), { uid, email, at: now });
    tx.set(joinDayRef(day), { n: (ds.exists ? ds.data().n || 0 : 0) + 1 });
    tx.set(linkRef(discordId), { uid, at: now });
    tx.set(uidRef(uid), { discordId, at: now });
    const bonus = bonusWrites(tx, uid, bs, ws, day, now);
    return { ok: true, bonus, discordId };
  });
}
