// ================================================================
//  邀請、隊伍、兩個人一起融合（多人版 M3）。規則在 shared/party.js、shared/logic3.js 的 fuseTogether。
//  狀態放 Realtime Database：
//    /invites/{iid}     邀請（只有 Functions 讀寫）
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
import { PARTY_KINDS, canStartParty, fixParty, inviteProblem, newInvite, newParty, partyJoin, partyLeave, partyMembers, partyPick, partyReady } from "./shared/party.js";
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
// 離開現在的隊伍（換隊、回邀請之前）
async function leaveCurrent(uid) {
  const pid = (await rtdb().ref(`partyOf/${uid}`).get()).val();
  if (!pid) return;
  try {
    const { party } = await changeParty(pid, p => (p.members[uid] ? partyLeave(p, uid) : { ok: true }));
    for (const m of partyMembers(party)) await inbox(m.id, { t: "party", pid });
  } catch (e) { /* 隊伍已經不在了 */ }
  await rtdb().ref(`partyOf/${uid}`).remove();
}

// ---------- 邀請 ----------
export const invite = onCall(async req => {
  const me = await needMember(req);
  const { to, kind } = req.data || {};
  if (!PARTY_KINDS.includes(kind)) throw new HttpsError("invalid-argument", "不認得的邀請");
  if (typeof to !== "string" || !to || to === me.uid) throw new HttpsError("invalid-argument", "要邀請別人");
  const them = await memberOf(to);
  if (!them) throw bad("找不到這位館友");
  const st = (await rtdb().ref(`status/${to}`).get()).val();
  if (!st || st.state === "offline") throw bad(`${them.nick} 現在不在線`);
  // 自己是隊長、隊伍還沒開始、種類一樣：邀請進同一隊
  let pid = (await rtdb().ref(`partyOf/${me.uid}`).get()).val();
  if (pid) {
    const p = fixParty((await rtdb().ref(`parties/${pid}`).get()).val());
    if (!p || p.phase !== "lobby" || p.kind !== kind || p.leader !== me.uid) pid = null;
  }
  const iid = newId();
  const inv = newInvite({ iid, kind, from: me.uid, fromNick: me.nick, to, toNick: them.nick, now: now(), pid });
  await rtdb().ref(`invites/${iid}`).set(inv);
  await inbox(to, { t: "invited", iid, kind, from: { id: me.uid, nick: me.nick }, expires: inv.expires });
  return { iid, expires: inv.expires, toNick: them.nick };
});

export const inviteReply = onCall(async req => {
  const me = await needMember(req);
  const { iid, accept } = req.data || {};
  if (typeof iid !== "string" || !iid) throw new HttpsError("invalid-argument", "少了邀請的號碼");
  const ref = rtdb().ref(`invites/${iid}`);
  const inv = (await ref.get()).val();
  const problem = inviteProblem(inv, me.uid, now());
  if (problem) throw bad(problem);
  if (!accept) {
    await ref.update({ state: "declined" });
    await inbox(inv.from, { t: "invite_closed", iid, reason: "declined", by: me.nick });
    return { ok: true };
  }
  await leaveCurrent(me.uid);
  let pid = inv.pid;
  let party = pid ? fixParty((await rtdb().ref(`parties/${pid}`).get()).val()) : null;
  if (!party || party.phase !== "lobby" || party.leader !== inv.from) {
    // 開一隊新的：邀請的人當隊長（他原本在別隊就先離開）
    const cur = (await rtdb().ref(`partyOf/${inv.from}`).get()).val();
    if (cur) await leaveCurrent(inv.from);
    pid = newId();
    party = newParty({ pid, kind: inv.kind, leader: inv.from, leaderNick: inv.fromNick, now: now() });
    await rtdb().ref(`parties/${pid}`).set(party);
    await rtdb().ref(`partyOf/${inv.from}`).set(pid);
  }
  await changeParty(pid, p => partyJoin(p, me.uid, me.nick, now()));
  await rtdb().ref(`partyOf/${me.uid}`).set(pid);
  await ref.update({ state: "accepted", pid });
  await inbox(inv.from, { t: "party", pid, joined: me.nick });
  return { ok: true, pid };
});

// ---------- 隊伍：選佩佩、準備、離開、開始 ----------
export const partyAction = onCall(async req => {
  const me = await needMember(req);
  const { pid, act, keys, ready } = req.data || {};
  if (typeof pid !== "string" || !pid) throw new HttpsError("invalid-argument", "少了隊伍的號碼");
  if (act === "start") return startParty(me, pid);
  if (act === "pick") await changeParty(pid, p => partyPick(p, me.uid, keys));
  else if (act === "ready") await changeParty(pid, p => partyReady(p, me.uid, !!ready));
  else if (act === "leave") {
    const { party } = await changeParty(pid, p => partyLeave(p, me.uid));
    await rtdb().ref(`partyOf/${me.uid}`).remove();
    if (party.phase === "closed") await rtdb().ref(`parties/${pid}`).remove();
    else for (const m of partyMembers(party)) await inbox(m.id, { t: "party", pid, left: me.nick });
  } else throw new HttpsError("invalid-argument", "不認得的動作");
  return { ok: true };
});

async function startParty(me, pid) {
  const pref = rtdb().ref(`parties/${pid}`);
  const p = fixParty((await pref.get()).val());
  const can = canStartParty(p, me.uid);
  if (!can.ok) throw bad(can.reason);
  if (p.kind !== "fusion") throw bad("這種隊伍還不能開始");
  // 先佔住（兩個人同時按只會跑一次）
  const lock = await pref.child("phase").transaction(ph => (ph === "lobby" ? "running" : undefined));
  if (!lock.committed) throw bad("已經開始了");
  const [a, b] = can.members;
  const db = getFirestore();
  try {
    const out = await db.runTransaction(async tx => {
      const ra = db.doc(`saves/${a.id}`), rb = db.doc(`saves/${b.id}`);
      const [sa, sb] = await Promise.all([tx.get(ra), tx.get(rb)]);
      if (!sa.exists || !sb.exists) throw bad("有人還沒有存檔");
      const SA = JSON.parse(sa.data().data), SB = JSON.parse(sb.data().data);
      const PA = SA.profiles && SA.profiles.challenge, PB = SB.profiles && SB.profiles.challenge;
      if (!PA || !PB) throw bad("兩個人都要在挑戰模式有參觀者");
      // 骰子：同一隊、同一次開始，種子一樣（交易重跑也算出同一隻）；中間不 await
      setRng(mulberry32(hashStr(`${pid}:${p.at}`)));
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
    const { r, revA, revB } = out;
    const side = (m, s) => ({ id: m.id, nick: m.nick, got: !!s.made, key: s.made ? s.made.key : null, failed: !!(s.made && s.made.failed), perfect: !!(s.made && s.made.perfect), san: s.san });
    const result = { child: r.child, title: r.title || null, recipe: r.recipe || null, mutations: (r.mutations || []).map(x => x.name), roll: r.roll ? r.roll.total : null, a: side(a, r.a), b: side(b, r.b), at: now() };
    await pref.update({ phase: "done", result });
    await inbox(a.id, { t: "save_changed", rev: revA, why: "fusion" });
    await inbox(b.id, { t: "save_changed", rev: revB, why: "fusion" });
    return { ok: true };
  } catch (e) {
    await pref.child("phase").set("lobby"); // 沒成功：回到準備的樣子，誰也沒扣東西
    if (e instanceof HttpsError) throw e;
    console.error("一起融合出錯", e);
    throw new HttpsError("internal", "伺服器出錯了，誰都沒有扣東西，再試壹次");
  }
}
