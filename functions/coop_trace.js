// ================================================================
//  探險報告掛展廳、貼交誼廳（好玩的機制 9）；留下痕跡（好玩的機制 7，不用同時在線）。規則在 shared/coop_trace.js。
//  放哪裡：
//    /lounge/{報告 id}       交誼廳：大家貼的探險報告。館友讀得到，只有 Functions 寫
//    存檔的 P.coopReports、P.hallReport：報告、掛在展廳的是哪一張（走 Firestore 交易，rev 加一，通知 save_changed）
//    /traces/rooms/{房間}/signs/{id}     留言牌。館友讀得到，只有 Functions 寫
//    /traces/rooms/{房間}/shadows/{id}   最後的影子
//    /traces/floors/{層}/wisps/{uid}     幽影：誰最近走過這一層、帶哪一隻
//    /traces/mine/{uid}/{id}             這個人留的牌子（找最舊的換掉用）
//    /traces/likes/{uid}                 還沒領的讚
// ================================================================
import "./options.js"; // 地區、initializeApp：一定要最先（見 options.js）
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { bad, inbox, needMember, newId, now, rtdb } from "./party.js";
import { claimLikes, likeProblem, newShadow, newSign, okWispKey, shadowsToDrop, signProblem, signsToDrop, traceRoomById } from "./shared/coop_trace.js";
import { coopMember } from "./shared/coop.js";
import { taipeiDay } from "./shared/logic.js";

const LOUNGE_KEEP = 30; // 交誼廳留最近幾張

// 讀一份存檔、改、寫回（rev 加一）、通知他重新讀。fn(P) 回傳 { ok, reason, ...}；不 ok 就不寫
async function changeSave(uid, fn) {
  const db = getFirestore(), ref = db.doc(`saves/${uid}`);
  const out = await db.runTransaction(async tx => {
    const s = await tx.get(ref);
    if (!s.exists) throw bad("你還沒有存檔");
    const SAVE = JSON.parse(s.data().data), P = SAVE.profiles && SAVE.profiles.challenge;
    if (!P) throw bad("要先用挑戰模式的參觀者進館");
    const r = fn(P);
    if (!r.ok) throw bad(r.reason);
    const rev = s.data().rev + 1;
    if (r.write !== false) tx.set(ref, { data: JSON.stringify(SAVE), rev, updatedAt: FieldValue.serverTimestamp() });
    return Object.assign({}, r, { rev });
  });
  if (out.write !== false) await inbox(uid, { t: "save_changed", rev: out.rev, why: "coop" });
  return out;
}

async function hang(me, id) {
  await changeSave(me.uid, P => {
    if (id && !(P.coopReports || []).some(r => r.id === id)) return { ok: false, reason: "找不到這張報告" };
    P.hallReport = id || null;
    return { ok: true };
  });
  return { ok: true };
}
// 貼到交誼廳：報告從他自己的存檔拿（不收畫面送來的內容），同一趟只會有一張
async function post(me, id) {
  if (typeof id !== "string" || !id) throw new HttpsError("invalid-argument", "少了報告的號碼");
  const r = await changeSave(me.uid, P => {
    const rep = (P.coopReports || []).find(x => x.id === id);
    return rep ? { ok: true, rep, write: false } : { ok: false, reason: "找不到這張報告" };
  });
  const key = id.replace(/[.$#[\]/]/g, "_");
  await rtdb().ref(`lounge/${key}`).set({ id, by: me.uid, nick: me.nick, at: now(), report: JSON.parse(JSON.stringify(r.rep)) });
  const all = (await rtdb().ref("lounge").get()).val() || {};
  const old = Object.entries(all).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(LOUNGE_KEEP);
  if (old.length) await rtdb().ref("lounge").update(Object.fromEntries(old.map(([k]) => [k, null])));
  return { ok: true };
}

// ---------- 留言牌 ----------
// 要走過這一間才能留（存檔的 P.cellar.cleared）。字都是清單上的。超過 10 則，最舊的被換掉
async function sign(me, room, tpl, word) {
  const problem = signProblem(room, tpl, word);
  if (problem) throw bad(problem);
  const s = await getFirestore().doc(`saves/${me.uid}`).get();
  const P = s.exists ? (JSON.parse(s.data().data).profiles || {}).challenge : null;
  if (!P || !P.cellar || !P.cellar.cleared || !P.cellar.cleared[room]) throw bad("要先走過這壹間");
  const mine = (await rtdb().ref(`traces/mine/${me.uid}`).get()).val() || {};
  const upd = {};
  signsToDrop(mine).forEach(x => { upd[`traces/rooms/${x.room}/signs/${x.id}`] = null; upd[`traces/mine/${me.uid}/${x.id}`] = null; });
  const id = newId(), t = now();
  upd[`traces/rooms/${room}/signs/${id}`] = newSign({ id, uid: me.uid, nick: me.nick, room, tpl, word, now: t });
  upd[`traces/mine/${me.uid}/${id}`] = { room, at: t };
  await rtdb().ref().update(upd);
  return { ok: true, id };
}
async function like(me, room, id) {
  if (!traceRoomById(room) || typeof id !== "string" || !/^[0-9a-f]+$/.test(id)) throw new HttpsError("invalid-argument", "沒有這塊牌子");
  let problem = null, owner = null;
  const tx = await rtdb().ref(`traces/rooms/${room}/signs/${id}`).transaction(cur => {
    if (cur === null) return cur; // 第一次拿到的可能是空值，伺服器會再給一次真的
    problem = likeProblem(cur, me.uid);
    if (problem) return;
    owner = cur.by;
    cur.likes = (cur.likes || 0) + 1;
    cur.likedBy = Object.assign({}, cur.likedBy, { [me.uid]: true });
    return cur;
  });
  if (problem) throw bad(problem);
  if (!tx.committed || !tx.snapshot.exists()) throw bad("這塊牌子不見了");
  await rtdb().ref(`traces/likes/${owner}`).transaction(n => (n || 0) + 1);
  return { ok: true };
}
// 領讚的靈感：一天有上限，領不完的留給明天
async function claim(me) {
  const ref = rtdb().ref(`traces/likes/${me.uid}`);
  const n = (await ref.get()).val() || 0;
  if (!(n > 0)) return { ok: true, gain: 0 };
  const today = taipeiDay(now());
  const r = await changeSave(me.uid, P => { const c = claimLikes(P, n, today); return { ok: true, gain: c.gain, left: c.left, write: c.gain > 0 }; });
  await ref.transaction(cur => Math.max(0, (cur || 0) - (n - r.left)) || null);
  return { ok: true, gain: r.gain };
}
// ---------- 最後的影子、幽影 ----------
async function addShadow(room, s) {
  const ref = rtdb().ref(`traces/rooms/${room}/shadows`);
  await ref.push(s);
  const drop = shadowsToDrop((await ref.get()).val());
  if (drop.length) await ref.update(Object.fromEntries(drop.map(k => [k, null])));
}
// 單人：理智在這一間歸零了（伺服器自己看存檔；字從房間的選項拿）
async function shadow(me, room, choice) {
  if (!traceRoomById(room)) throw bad("沒有這壹間");
  const s = await getFirestore().doc(`saves/${me.uid}`).get();
  const P = s.exists ? (JSON.parse(s.data().data).profiles || {}).challenge : null;
  if (!P || !P.dark) return { ok: true, added: false }; // 他的存檔沒有歸零：不留
  await addShadow(room, newShadow({ nick: me.nick, room, choice, now: now() }));
  return { ok: true, added: true };
}
// 單人走完一層
async function pass(me, floor, key) {
  if (!Number.isInteger(floor) || floor < 1 || floor > 9 || !okWispKey(key)) throw new HttpsError("invalid-argument", "不認得");
  await rtdb().ref(`traces/floors/${floor}/wisps/${me.uid}`).set({ nick: me.nick, key, at: now() });
  return { ok: true };
}
// 合作走完一趟（functions/coop.js 叫）：在哪裡倒下的留影子，走過的層留幽影
export async function traceRunEnd(run) {
  const s = run.stats;
  if (!s) return;
  const t = now();
  for (const g of s.ghosts || []) {
    const m = coopMember(run, g.id);
    const sh = newShadow({ nick: m ? m.name : "館友", room: g.roomId, choice: g.choice, now: t });
    if (sh) await addShadow(g.roomId, sh);
  }
  const floors = [...new Set((s.rooms || []).map(r => r.floor))], upd = {};
  run.members.filter(m => !m.guard && m.keys && m.keys.length).forEach(m => {
    floors.forEach(f => { if (okWispKey(m.keys[0])) upd[`traces/floors/${f}/wisps/${m.id}`] = { nick: m.name, key: m.keys[0], at: t }; });
  });
  if (Object.keys(upd).length) await rtdb().ref().update(upd);
}

export const coopTrace = onCall(async req => {
  const me = await needMember(req);
  const { act, id, room, tpl, word, choice, floor, key } = req.data || {};
  if (act === "hang") return hang(me, id);
  if (act === "post") return post(me, id);
  if (act === "sign") return sign(me, room, tpl, word);
  if (act === "like") return like(me, room, id);
  if (act === "claim") return claim(me);
  if (act === "shadow") return shadow(me, room, choice);
  if (act === "pass") return pass(me, floor, key);
  throw new HttpsError("invalid-argument", "不認得的動作");
});
