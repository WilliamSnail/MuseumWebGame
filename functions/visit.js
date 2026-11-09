// ================================================================
//  參觀館友的展廳、送佩佩、伺服器的信（多人版 M2，docs/多人實作.md）。對方不在線也能用。
//  規則在 shared/gifts.js、shared/mailbox.js；一次呼叫要做的事在 shared/visit.js 的 step…（純函式，測試 test/visit.test.cjs）。
//  這裡只讀資料庫、叫 step、在同一個 Firestore 交易裡寫回去。
//  資料（都只有 Functions 讀寫，firestore.rules 沒開給瀏覽器）：
//    saves/{uid}             存檔。伺服器改了 rev 加一，再送 save_changed（原則 3）
//    halls/{uid}             訪客簿：誰哪一天來過、按讚、留言（格式見 shared/visit.js）
//    mail/{uid}/items/{id}   伺服器的信：送的佩佩、來訪的謝禮。領了標 claimed，不刪（資料庫只加不刪）
//    calls/{uid}/items/{id}  「請你去看我的展廳」：編號是 call-日期-請的人，所以一天一位只有一則。看過標 seen，不刪
//  通知（Realtime Database 的 /inbox/{uid}）：mail_new（有新的信）、hall_news（有人來過、按讚、留言）、hall_call（請你去看展廳）、save_changed。
//  給別人的只有展廳那一小部分（hallView＋cleanHallView）和本週特展那一小部分（weeklyView＋stepWeeklyView）：不給整份存檔，也不給 email。
// ================================================================
import "./options.js"; // 地區、initializeApp：一定要最先（見 options.js）
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getDatabase } from "firebase-admin/database";
import { randomUUID } from "node:crypto";
import { NUM } from "./shared/config.js";
import { dayPlus, hallView, weeklyView } from "./shared/gifts.js";
import { hashStr, migrateSave, mulberry32, nowMs, setRng, todayStr } from "./shared/logic.js";
import { weekIndex, weeklyTheme } from "./shared/logic3.js";
import { friendTalent, learnFromFriend } from "./shared/shop.js";
import { callId, callRow, cleanHallView, guestNews, mailRow, stepClaimMail, stepHallAct, stepHallCall, stepSendGift, stepVisitHall, stepWeeklyView } from "./shared/visit.js";

// ---------- 跟館友學（決定 0032，規則在 shared/shop.js） ----------
// 參觀者今天第一次走進這間展廳時叫一次：LEARN_ON_VISIT(我的 P, 主人的 P)，在交易裡，可以改「我的 P」。
// 回傳非 null：這裡會把我的存檔寫回去（rev 加一）、送 save_changed，回傳值放進 learn，畫面在 ui_visit.js 的 visitLearnLine 寫出來。
// 骰子：visitHall 算之前已經 setRng(同一位、同一間、同一天的種子)。
const LEARN_ON_VISIT = (myP, ownerP) => learnFromFriend(myP, friendTalent(ownerP));

const newId = () => randomUUID().replace(/-/g, "").slice(0, 20);
const bad = reason => new HttpsError("failed-precondition", reason);
const db = () => getFirestore();
const saveRef = uid => db().doc(`saves/${uid}`);
const bookRef = uid => db().doc(`halls/${uid}`);
const mailRef = (uid, id) => db().doc(`mail/${uid}/items/${id}`);
const callRef = (uid, id) => db().doc(`calls/${uid}/items/${id}`);
// 從瀏覽器來的編號：會拿去組路徑，不能有 /（模擬器和正式的 uid、信的編號都只有英數字和 -、_）
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
function idArg(x, what) {
  if (typeof x !== "string" || !ID_RE.test(x)) throw new HttpsError("invalid-argument", what);
  return x;
}
async function needMember(req) {
  if (!req.auth) throw new HttpsError("unauthenticated", "要先登入");
  const s = await db().doc(`members/${req.auth.uid}`).get();
  if (!s.exists) throw new HttpsError("permission-denied", "你不在邀請名單上");
  return { uid: req.auth.uid, nick: s.data().nick };
}
async function memberNick(uid) {
  const s = await db().doc(`members/${uid}`).get();
  return s.exists ? s.data().nick : null;
}
// 通知是附帶的：資料已經寫好了，通知送不出去不能算失敗（對方上線時讀 socialNews 一樣看得到）
async function notify(uid, msg) {
  try { await getDatabase().ref(`inbox/${uid}`).push(Object.assign({ at: nowMs() }, msg)); }
  catch (e) { console.error("通知送不出去", e); }
}
// 信放進資料庫的樣子。JSON 一次：拿掉 undefined（Firestore 不收）
const mailDoc = (mail, fromId) => Object.assign(JSON.parse(JSON.stringify(mail)), { fromId, createdAt: FieldValue.serverTimestamp() });
// 別人的展廳：先照規矩整理存檔（舊存檔的名字換新的），只讀不寫；再只取展廳那一小部分
function hallOf(saveSnap) {
  if (!saveSnap.exists) return { view: { open: false }, save: null };
  const raw = JSON.parse(saveSnap.data().data);
  let save = raw;
  try { save = migrateSave(raw); } catch (e) { console.error("舊存檔整理不了，照原樣讀", e); }
  return { view: cleanHallView(hallView(save)), save };
}

// ---------- 走進館友的展廳 ----------
export const visitHall = onCall(async req => {
  const me = await needMember(req);
  const owner = idArg(req.data && req.data.owner, "要說參觀誰");
  const nick = await memberNick(owner);
  if (!nick) throw bad("找不到這位館友");
  const t = nowMs(), today = todayStr(t); // Functions 裡 nowMs() 就是伺服器的時間（docs/Firebase做法.md 第三節）
  const { view, save: ownerSave } = hallOf(await saveRef(owner).get());
  const out = await db().runTransaction(async tx => {
    const bookSnap = await tx.get(bookRef(owner));
    const mySnap = LEARN_ON_VISIT && view.open ? await tx.get(saveRef(me.uid)) : null;
    const mySave = mySnap && mySnap.exists ? JSON.parse(mySnap.data().data) : null;
    setRng(mulberry32(hashStr(`${me.uid}:${owner}:${today}`)));
    let r;
    try { r = stepVisitHall({ view, book: bookSnap.exists ? bookSnap.data() : null, me, owner, today, at: t, learn: LEARN_ON_VISIT, mySave, ownerSave }); }
    finally { setRng(null); }
    if (!r.ok) throw bad(r.reason);
    if (r.book) tx.set(bookRef(owner), r.book);
    if (r.mail) tx.set(mailRef(owner, r.mail.id), mailDoc(r.mail, me.uid));
    let rev = 0;
    if (r.learn && mySnap && mySnap.exists) { // 跟館友學改到了我的存檔
      rev = mySnap.data().rev + 1;
      tx.set(saveRef(me.uid), { data: JSON.stringify(mySave), rev, updatedAt: FieldValue.serverTimestamp() });
    }
    return Object.assign(r, { rev });
  });
  if (out.first) await notify(owner, { t: "hall_news", what: "visit", from: me.nick, insp: out.gain });
  if (out.rev) await notify(me.uid, { t: "save_changed", rev: out.rev, why: "visit" });
  return JSON.parse(JSON.stringify({ owner: { id: owner, nick }, open: out.open, view: out.view, first: out.first, gain: out.gain, likes: out.likes, notes: out.notes, mine: out.mine, learn: out.learn, rev: out.rev }));
});

// ---------- 按讚、留言 ----------
export const hallAct = onCall(async req => {
  const me = await needMember(req);
  const { kind, text } = req.data || {};
  const owner = idArg(req.data && req.data.owner, "要說是誰的展廳");
  if (!(await memberNick(owner))) throw bad("找不到這位館友");
  const t = nowMs(), today = todayStr(t); // Functions 裡 nowMs() 就是伺服器的時間（docs/Firebase做法.md 第三節）
  const { view } = hallOf(await saveRef(owner).get());
  const out = await db().runTransaction(async tx => {
    const bookSnap = await tx.get(bookRef(owner));
    const r = stepHallAct({ open: view.open, book: bookSnap.exists ? bookSnap.data() : null, kind, text, me, owner, today, at: t });
    if (!r.ok) throw bad(r.reason);
    tx.set(bookRef(owner), r.book);
    if (r.mail) tx.set(mailRef(owner, r.mail.id), mailDoc(r.mail, me.uid));
    return r;
  });
  await notify(owner, Object.assign({ t: "hall_news", what: kind, from: me.nick, insp: out.gain }, kind === "note" ? { text: out.text } : {}));
  return { ok: true, likes: out.likes, notes: out.notes, mine: out.mine };
});

// ---------- 比每週特展：只回對方這週特展那一小部分（唯讀，不算來訪、不寄信） ----------
export const visitWeekly = onCall(async req => {
  const me = await needMember(req);
  const owner = idArg(req.data && req.data.owner, "要選壹位館友");
  if (owner === me.uid) throw bad("這是你自己的特展。");
  const nick = await memberNick(owner); // 一定要是館友（members 裡有的人）
  if (!nick) throw bad("找不到這位館友");
  const today = todayStr(nowMs());
  const snap = await saveRef(owner).get();
  let save = null;
  if (snap.exists) {
    const raw = JSON.parse(snap.data().data);
    save = raw;
    try { save = migrateSave(raw); } catch (e) { console.error("舊存檔整理不了，照原樣讀", e); }
  }
  const r = stepWeeklyView({ view: weeklyView(save), me, owner, week: weekIndex(today), theme: weeklyTheme(today) });
  if (!r.ok) throw bad(r.reason);
  return JSON.parse(JSON.stringify({ owner: { id: owner, nick }, open: r.open, started: r.started, week: r.week, theme: r.theme, best: r.best, slots: r.slots }));
});

// ---------- 請館友來看我的展廳：沒有獎勵；一天一位一次 ----------
export const hallCall = onCall(async req => {
  const me = await needMember(req);
  const to = idArg(req.data && req.data.to, "要選壹位館友");
  if (to === me.uid) throw bad("不能請自己。");
  const toNick = await memberNick(to);
  if (!toNick) throw bad("找不到這位館友");
  const t = nowMs(), today = todayStr(t);
  const { view } = hallOf(await saveRef(me.uid).get()); // 我的展廳開館了才有東西可看
  await db().runTransaction(async tx => {
    const ref = callRef(to, callId(today, me.uid));
    const had = await tx.get(ref);
    const r = stepHallCall({ open: view.open, had: had.exists, me, to, today, at: t });
    if (!r.ok) throw bad(r.reason);
    tx.set(ref, Object.assign({}, r.call, { createdAt: FieldValue.serverTimestamp() }));
  });
  await notify(to, { t: "hall_call", from: me.nick, fromId: me.uid });
  return { ok: true, toNick };
});

// ---------- 我的新消息：還沒領的信、誰來過我的展廳、誰請我去看展廳 ----------
// seen: true：我看過了（把訪客簿的 seenAt 改成現在）。回傳的 fresh、unseen 是改之前的，畫面才標得出哪些是新的
// seenCalls: [通知編號]：這幾則「請你去看展廳」我處理過了（標 seen，不刪）。只回今天、昨天還沒處理的
export const socialNews = onCall(async req => {
  const me = await needMember(req);
  const t = nowMs(), today = todayStr(t); // Functions 裡 nowMs() 就是伺服器的時間（docs/Firebase做法.md 第三節）
  const seenCalls = Array.isArray(req.data && req.data.seenCalls) ? [...new Set(req.data.seenCalls.slice(0, 20).filter(x => typeof x === "string" && ID_RE.test(x)))] : [];
  if (seenCalls.length) {
    const snaps = await db().getAll(...seenCalls.map(id => callRef(me.uid, id)));
    await Promise.all(snaps.filter(s => s.exists).map(s => s.ref.update({ seen: true })));
  }
  const [mailSnap, bookSnap, callSnap] = await Promise.all([
    db().collection(`mail/${me.uid}/items`).where("claimed", "==", false).limit(NUM.guest.mailListMax).get(),
    bookRef(me.uid).get(),
    db().collection(`calls/${me.uid}/items`).where("seen", "==", false).limit(NUM.guest.callListMax * 3).get(),
  ]);
  const calls = callSnap.docs.map(d => callRow(d.data(), d.id)).filter(c => c && c.day >= dayPlus(today, -1)).sort((a, b) => b.at - a.at).slice(0, NUM.guest.callListMax);
  const mail = mailSnap.docs.map(d => mailRow(d.data())).filter(m => m && m.expire >= today).sort((a, b) => b.sent.localeCompare(a.sent));
  const guests = guestNews(bookSnap.exists ? bookSnap.data() : null);
  if (req.data && req.data.seen && bookSnap.exists && guests.unseen) await bookRef(me.uid).set({ seenAt: t }, { merge: true });
  return JSON.parse(JSON.stringify({ mail, guests, calls, today }));
});

// ---------- 送佩佩：同一個交易從我的收藏拿掉、寄進對方的信箱 ----------
export const sendGift = onCall(async req => {
  const me = await needMember(req);
  const to = idArg(req.data && req.data.to, "要選壹位館友");
  const item = req.data && req.data.item;
  if (to === me.uid) throw bad("不能送給自己。");
  const toNick = await memberNick(to);
  if (!toNick) throw bad("找不到這位館友");
  const today = todayStr(nowMs()), mailId = "gift-" + newId();
  const out = await db().runTransaction(async tx => {
    const ref = saveRef(me.uid), snap = await tx.get(ref);
    if (!snap.exists) throw bad("還沒有存檔。");
    const save = JSON.parse(snap.data().data);
    const r = stepSendGift({ save, item, me, to, today, mailId });
    if (!r.ok) throw bad(r.reason);
    const rev = snap.data().rev + 1;
    tx.set(ref, { data: JSON.stringify(save), rev, updatedAt: FieldValue.serverTimestamp() });
    tx.set(mailRef(to, mailId), mailDoc(r.mail, me.uid));
    return { rev, gift: r.gift, text: r.text };
  });
  await notify(me.uid, { t: "save_changed", rev: out.rev, why: "gift" });
  await notify(to, { t: "mail_new", kind: "gift", from: me.nick, text: out.text });
  return { ok: true, rev: out.rev, gift: out.gift, text: out.text, toNick };
});

// ---------- 領信：同一個交易把東西放進我的存檔、把信標成領過 ----------
export const claimMail = onCall(async req => {
  const me = await needMember(req);
  const raw = req.data && req.data.ids;
  if (!Array.isArray(raw) || !raw.length || raw.length > NUM.guest.claimMax) throw new HttpsError("invalid-argument", "要說領哪幾封");
  const ids = [...new Set(raw.map(x => idArg(x, "信的編號不對")))];
  const today = todayStr(nowMs());
  const out = await db().runTransaction(async tx => {
    const ref = saveRef(me.uid);
    const [snap, ...docs] = await Promise.all([tx.get(ref), ...ids.map(id => tx.get(mailRef(me.uid, id)))]);
    if (!snap.exists) throw bad("還沒有存檔。");
    const save = JSON.parse(snap.data().data);
    // 收到佩佩可能解開徽章、整類全收集（要擲骰）。種子固定：交易重跑也算出一樣的；中間不 await
    setRng(mulberry32(hashStr(`${me.uid}:${ids.join(",")}`)));
    let r;
    try { r = stepClaimMail({ save, mails: docs.map((d, i) => (d.exists ? Object.assign({}, d.data(), { id: ids[i] }) : { id: ids[i], gone: true })), today }); }
    finally { setRng(null); }
    if (!r.ok) throw bad(r.reason);
    let rev = snap.data().rev;
    if (r.done.length) {
      rev += 1;
      tx.set(ref, { data: JSON.stringify(save), rev, updatedAt: FieldValue.serverTimestamp() });
      r.done.forEach(x => tx.update(mailRef(me.uid, x.id), { claimed: true, claimedAt: FieldValue.serverTimestamp() }));
    }
    return Object.assign(r, { rev });
  });
  if (out.done.length) await notify(me.uid, { t: "save_changed", rev: out.rev, why: "mail" });
  return JSON.parse(JSON.stringify({ ok: true, rev: out.rev, done: out.done, skipped: out.skipped, events: out.events, total: out.total }));
});
