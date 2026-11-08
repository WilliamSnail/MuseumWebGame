// ================================================================
//  邀請、隊伍、兩個人一起融合（多人版 M3）。規則在 shared/party.js、shared/logic3.js 的 fuseTogether。
//  狀態放 Realtime Database：
//    /invites/{iid}     邀請（只有 Functions 讀寫）。回覆了就刪掉；過期的在同一個人下次邀請時刪掉
//    /sent/{uid}/{iid}  這個人送出去、還沒回覆的邀請（to、kind、expires）：找自己的舊邀請用，不用在 /invites 建索引
//    /parties/{pid}     隊伍（隊員可以讀，畫面聽這裡；只有 Functions 寫）
//    /partyOf/{uid}     這個人現在在哪一隊（只有 Functions 讀寫）
//    /inbox/{uid}/{id}  給這個人的通知（invited、invite_closed、party、save_changed）
//  一起融合的結果：Functions 在同一個 Firestore 交易裡讀兩份存檔、算、兩份一起寫回（rev 各加一）。
// ================================================================
import "./options.js"; // 地區、initializeApp：一定要最先（見 options.js）
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getDatabase } from "firebase-admin/database";
import { randomUUID } from "node:crypto";
import { PARTY, PARTY_KINDS, canStartParty, fixParty, inviteOver, inviteProblem, newInvite, newParty, partyJoin, partyLeave, partyMembers, partyPick, partyReady, pruneProblem } from "./shared/party.js";
import { hashStr, mulberry32, setDayClock, setRng } from "./shared/logic.js";
import { fuseTogether } from "./shared/logic3.js";

const rtdb = () => getDatabase();
const now = () => Date.now();
const newId = () => randomUUID().replace(/-/g, "").slice(0, 20);
const bad = reason => new HttpsError("failed-precondition", reason);

async function memberOf(uid) {
  const s = await getFirestore().doc(`members/${uid}`).get();
  return s.exists ? s.data() : null;
}
async function needMember(req) {
  if (!req.auth) throw new HttpsError("unauthenticated", "要先登入");
  const m = await memberOf(req.auth.uid);
  if (!m) throw new HttpsError("permission-denied", "你不在邀請名單上");
  return { uid: req.auth.uid, nick: m.nick };
}
const inbox = (uid, msg) => rtdb().ref(`inbox/${uid}`).push(Object.assign({ at: now() }, msg));
const statusOf = async uid => (await rtdb().ref(`status/${uid}`).get()).val();
const isOffline = st => !st || st.state === "offline";

// 隊伍的改動一律用交易（兩個人同時按也不會亂）。fn(p) 回傳 { ok, reason }；不 ok 就不改
async function changeParty(pid, fn) {
  let reason = null, result = null;
  const tx = await rtdb().ref(`parties/${pid}`).transaction(cur => {
    if (cur === null) return cur; // 第一次拿到的可能是快取的空值，伺服器會再給一次真的
    const p = fixParty(cur);
    const r = fn(p);
    if (!r.ok) { reason = r.reason; return; }
    reason = null; result = r;
    return p;
  });
  if (reason) throw bad(reason);
  if (!tx.committed || !tx.snapshot.exists()) throw bad("找不到這個隊伍");
  return { party: fixParty(tx.snapshot.val()), result };
}
// /partyOf/{uid} 還指著這一隊才拿掉（他可能已經換到別隊了）
async function clearPartyOf(uid, pid) {
  const ref = rtdb().ref(`partyOf/${uid}`);
  if ((await ref.get()).val() === pid) await ref.remove();
}
// 把 uid 移出隊伍：沒人了就刪掉隊伍；還有人就通知他們「○○ 離開了隊伍」（why "offline"：斷線被移出去的）
async function leaveParty(pid, uid, nick, why) {
  const { party } = await changeParty(pid, p => partyLeave(p, uid));
  if (party.phase === "closed") await rtdb().ref(`parties/${pid}`).remove();
  else for (const m of partyMembers(party)) await inbox(m.id, Object.assign({ t: "party", pid, left: nick }, why ? { why } : {}));
  return party;
}
// 離開現在的隊伍（換隊、回邀請之前）
async function leaveCurrent(uid, nick) {
  const pid = (await rtdb().ref(`partyOf/${uid}`).get()).val();
  if (!pid) return;
  try { await leaveParty(pid, uid, nick); } catch (e) { /* 隊伍已經不在了，或已經不在隊伍裡 */ }
  await rtdb().ref(`partyOf/${uid}`).remove();
}
// 這個人現在當隊長、還沒開始、種類一樣的隊伍（沒有就是 null）
async function ledParty(uid, kind) {
  const pid = (await rtdb().ref(`partyOf/${uid}`).get()).val();
  if (!pid) return null;
  const p = fixParty((await rtdb().ref(`parties/${pid}`).get()).val());
  return p && p.phase === "lobby" && p.kind === kind && p.leader === uid ? p : null;
}

// ---------- 邀請 ----------
export const invite = onCall(async req => {
  const me = await needMember(req);
  const { to, kind } = req.data || {};
  if (!PARTY_KINDS.includes(kind)) throw new HttpsError("invalid-argument", "不認得的邀請");
  if (typeof to !== "string" || !to || to === me.uid) throw new HttpsError("invalid-argument", "要邀請別人");
  const them = await memberOf(to);
  if (!them) throw bad("找不到這位館友");
  if (isOffline(await statusOf(to))) throw bad(`${them.nick} 現在不在線`);
  // 我之前送、還沒回覆的邀請（/sent/{uid}）：過期的順手刪掉；同一個人還有沒過期的，不要再送一張
  const t = now();
  const mine = (await rtdb().ref(`sent/${me.uid}`).get()).val() || {};
  const drop = {};
  for (const [id, iv] of Object.entries(mine)) {
    if (inviteOver(iv, t)) { drop[`invites/${id}`] = null; drop[`sent/${me.uid}/${id}`] = null; }
    else if (iv.to === to && iv.kind === kind) throw bad(`已經邀請 ${them.nick} 了，等他回覆`);
  }
  if (Object.keys(drop).length) await rtdb().ref().update(drop);
  // 自己是隊長、隊伍還沒開始、種類一樣：邀請進同一隊
  const led = await ledParty(me.uid, kind);
  const iid = newId();
  const inv = newInvite({ iid, kind, from: me.uid, fromNick: me.nick, to, toNick: them.nick, now: t, pid: led ? led.pid : null });
  await rtdb().ref().update({ [`invites/${iid}`]: inv, [`sent/${me.uid}/${iid}`]: { to, kind, expires: inv.expires, state: "open" } });
  await inbox(to, { t: "invited", iid, kind, from: { id: me.uid, nick: me.nick }, expires: inv.expires });
  return { iid, expires: inv.expires, toNick: them.nick };
});

export const inviteReply = onCall(async req => {
  const me = await needMember(req);
  const { iid, accept } = req.data || {};
  if (typeof iid !== "string" || !iid) throw new HttpsError("invalid-argument", "少了邀請的號碼");
  const inv = (await rtdb().ref(`invites/${iid}`).get()).val();
  const problem = inviteProblem(inv, me.uid, now());
  if (problem) throw bad(problem);
  const closeInvite = () => rtdb().ref().update({ [`invites/${iid}`]: null, [`sent/${inv.from}/${iid}`]: null }); // 回覆了：兩邊的紀錄都刪掉
  if (!accept) {
    await closeInvite();
    await inbox(inv.from, { t: "invite_closed", iid, reason: "declined", by: me.nick });
    return { ok: true };
  }
  if (isOffline(await statusOf(inv.from))) {
    await closeInvite();
    throw bad(`${inv.fromNick} 已經離線了`);
  }
  // 加進哪一隊：邀請時記下的那一隊；不行的話，邀請的人現在當隊長的那一隊（他同時邀了好幾個人）；都沒有就開一隊新的
  let party = inv.pid ? fixParty((await rtdb().ref(`parties/${inv.pid}`).get()).val()) : null;
  if (!party || party.phase !== "lobby" || party.leader !== inv.from) party = await ledParty(inv.from, inv.kind);
  if (party && !party.members[me.uid] && Object.keys(party.members).length >= PARTY.maxMembers[party.kind]) {
    await closeInvite();
    await inbox(inv.from, { t: "invite_closed", iid, reason: "full", by: me.nick });
    throw bad(`${inv.fromNick} 的隊伍滿了`);
  }
  if (!(party && party.members[me.uid])) await leaveCurrent(me.uid, me.nick); // 已經在這一隊（例如重新整理過、框不見了）就不用先離開
  let pid = party ? party.pid : null;
  if (!pid) {
    // 開一隊新的：邀請的人當隊長（他原本在別隊就先離開）
    await leaveCurrent(inv.from, inv.fromNick);
    pid = newId();
    await rtdb().ref(`parties/${pid}`).set(newParty({ pid, kind: inv.kind, leader: inv.from, leaderNick: inv.fromNick, now: now() }));
    await rtdb().ref(`partyOf/${inv.from}`).set(pid);
  }
  await changeParty(pid, p => partyJoin(p, me.uid, me.nick, now()));
  await rtdb().ref(`partyOf/${me.uid}`).set(pid);
  await closeInvite();
  await inbox(inv.from, { t: "party", pid, iid, joined: me.nick });
  return { ok: true, pid };
});

// ---------- 隊伍：選佩佩、準備、離開、移出斷線的人、開始 ----------
export const partyAction = onCall(async req => {
  const me = await needMember(req);
  const { pid, act, keys, ready, uid } = req.data || {};
  if (typeof pid !== "string" || !pid) throw new HttpsError("invalid-argument", "少了隊伍的號碼");
  if (act === "start") return startParty(me, pid);
  if (act === "prune") return pruneMember(me, pid, uid);
  if (act === "pick") await changeParty(pid, p => partyPick(p, me.uid, keys));
  else if (act === "ready") await changeParty(pid, p => partyReady(p, me.uid, !!ready));
  else if (act === "leave") {
    await leaveParty(pid, me.uid, me.nick);
    await clearPartyOf(me.uid, pid);
  } else throw new HttpsError("invalid-argument", "不認得的動作");
  return { ok: true };
});

// 隊友斷線了（畫面看到他離線超過 PARTY.offlineWaitMs 才叫）：伺服器自己再看一次 /status，真的斷線了才移出去
async function pruneMember(me, pid, uid) {
  if (typeof uid !== "string" || !uid || uid === me.uid) throw new HttpsError("invalid-argument", "要說移出誰");
  const p = fixParty((await rtdb().ref(`parties/${pid}`).get()).val());
  if (!p || !p.members[me.uid]) throw bad("你不在這個隊伍裡");
  const m = p.members[uid];
  if (!m) return { ok: true, pruned: false, reason: "他已經不在隊伍裡了" };
  const them = await memberOf(uid);
  const problem = pruneProblem(await statusOf(uid), !!(them && them.invisible), now());
  if (problem) return { ok: true, pruned: false, reason: problem };
  try { await leaveParty(pid, uid, m.nick, "offline"); }
  catch (e) { return { ok: true, pruned: false, reason: e.message }; } // 同時有別人移過了
  await clearPartyOf(uid, pid);
  return { ok: true, pruned: true };
}

async function startParty(me, pid) {
  const pref = rtdb().ref(`parties/${pid}`);
  // 先佔住：在同一個交易裡檢查能不能開始、把 phase 改成 running（兩個人同時按只會跑一次）。
  // 交易第一次拿到的常常是空值（Functions 手上沒有快取），changeParty 會回傳空值讓伺服器給真的再跑一次（11-09 修：原本直接放棄，每次都說「已經開始了」）
  const { party } = await changeParty(pid, p => {
    const can = canStartParty(p, me.uid);
    if (!can.ok) return p.phase === "running" || p.phase === "done" ? { ok: false, reason: "已經開始了" } : can;
    if (p.kind !== "fusion") return { ok: false, reason: "這種隊伍還不能開始" };
    p.phase = "running";
    delete p.fail;
    return { ok: true };
  });
  if (party.phase !== "running") throw bad("已經開始了");
  const [a, b] = partyMembers(party);
  const db = getFirestore();
  let out;
  try {
    out = await db.runTransaction(async tx => {
      const ra = db.doc(`saves/${a.id}`), rb = db.doc(`saves/${b.id}`);
      const [sa, sb] = await Promise.all([tx.get(ra), tx.get(rb)]);
      if (!sa.exists || !sb.exists) throw bad("有人還沒有存檔");
      const SA = JSON.parse(sa.data().data), SB = JSON.parse(sb.data().data);
      const PA = SA.profiles && SA.profiles.challenge, PB = SB.profiles && SB.profiles.challenge;
      if (!PA || !PB) throw bad("兩個人都要在挑戰模式有參觀者");
      // 骰子：同一隊、同一次開始，種子一樣（交易重跑也算出同一隻）；中間不 await
      setRng(mulberry32(hashStr(`${pid}:${party.at}`)));
      setDayClock(() => (PA.day && PA.day.date) || null);
      let r;
      try { r = fuseTogether(PA, { kind: "pepe", key: a.pick[0] }, PB, { kind: "pepe", key: b.pick[0] }); }
      finally { setRng(null); setDayClock(null); }
      if (!r.ok) throw bad(`${r.who === "a" ? a.nick : b.nick}：${r.reason}`);
      const revA = sa.data().rev + 1, revB = sb.data().rev + 1;
      tx.set(ra, { data: JSON.stringify(SA), rev: revA, updatedAt: FieldValue.serverTimestamp() });
      tx.set(rb, { data: JSON.stringify(SB), rev: revB, updatedAt: FieldValue.serverTimestamp() });
      return { r, revA, revB };
    });
  } catch (e) {
    // 沒成功：回到準備的樣子，誰也沒扣東西。原因寫進隊伍（fail），兩個人的畫面都看得到（不只按開始的隊長）
    const err = e instanceof HttpsError ? e : new HttpsError("internal", "伺服器出錯了，誰都沒有扣東西，再試壹次");
    if (!(e instanceof HttpsError)) console.error("一起融合出錯", e);
    await pref.update({ phase: "lobby", fail: { reason: err.message, at: now() } });
    throw err;
  }
  // 到這裡兩份存檔已經寫好了：後面就算出錯，也不能說「沒扣東西」
  const { r, revA, revB } = out;
  const side = (m, s) => ({ id: m.id, nick: m.nick, got: !!s.made, key: s.made ? s.made.key : null, failed: !!(s.made && s.made.failed), perfect: !!(s.made && s.made.perfect), san: s.san });
  const result = { child: r.child, title: r.title || null, recipe: r.recipe || null, mutations: (r.mutations || []).map(x => x.name), roll: r.roll ? r.roll.total : null, a: side(a, r.a), b: side(b, r.b), at: now() };
  try { await pref.update({ phase: "done", result: JSON.parse(JSON.stringify(result)) }); } // JSON 一次：拿掉 undefined（Realtime Database 不收）
  catch (e) { console.error("一起融合：存檔寫好了，結果寫不進隊伍", e); }
  await inbox(a.id, { t: "save_changed", rev: revA, why: "fusion" });
  await inbox(b.id, { t: "save_changed", rev: revB, why: "fusion" });
  return { ok: true };
}
