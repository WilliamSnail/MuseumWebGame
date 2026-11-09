// ================================================================
//  合作地下收藏庫（多人版 M4）。規則在 shared/coop.js、shared/coop_flow.js；這個檔只管讀寫。
//  放哪裡：
//    Firestore /coopRuns/{pid}            這一趟完整的狀態（data：JSON 字串）。只有 Functions 碰得到：線索、幻覺、地圖都在裡面
//    Realtime Database /coopView/{pid}/{uid}  給這個人看的樣子（viewFor，r：第幾版，j：JSON 字串）。只有他自己讀得到
//    Realtime Database /parties/{pid}     隊伍（準備區、phase）。隊員讀得到
//  每一步：Firestore 交易裡讀 run 和每個人的存檔 → setRng → coopAct → setRng(null) → run 和存檔一起寫回（rev 各加一）
//          → 交易成功才更新 /coopView、通知 save_changed。
//  交易可能重跑：種子只看 run.id、run.step、run.rev，重跑擲出來一樣。setRng 到換回來之間不能 await。
//  結果寫回下去的那一位參觀者：存檔上現在是別位的話，先換過去、算完換回來（決定 0018）。
// ================================================================
import "./options.js"; // 地區、initializeApp：一定要最先（見 options.js）
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { COOP, coopFix, coopMember, coopPresent, viewFor } from "./shared/coop.js";
import { coopAct, coopBegin } from "./shared/coop_flow.js";
import { coopSayBuild } from "./shared/coop_fun.js";
import { canStartParty, fixParty, newParty, partyBack, partyFloor, partyGuard, partyLeave, partyMembers } from "./shared/party.js";
import { ensureDay, hashStr, mulberry32, setRng, taipeiDay } from "./shared/logic.js";
import { switchVisitor } from "./shared/visitors.js";
import { bad, changeParty, clearPartyOf, inbox, leaveCurrent, ledParty, memberOf, needMember, newId, now, partyHooks, rtdb, statusOf } from "./party.js";

const runRef = pid => getFirestore().doc(`coopRuns/${pid}`);
const viewPath = (pid, uid) => `coopView/${pid}/${uid}`;

// 給每個人看的樣子。兩步差很近時，晚到的舊版不能蓋掉新的（r 比較大的留著）
async function publish(pid, run) {
  await Promise.all(run.members.filter(m => m.out !== "left").map(m => {
    const r = run.rev, j = JSON.stringify(viewFor(run, m.id));
    return rtdb().ref(viewPath(pid, m.id)).transaction(cur => (cur && cur.r > r ? undefined : { r, j }));
  }));
}

// 一步：交易裡讀 run、存檔，叫 coopAct，寫回
async function runStep(pid, uid, act, data = {}) {
  const db = getFirestore(), t = now();
  const log = (await rtdb().ref(`coopChatLog/${pid}`).get()).val() || {}; // 探險報告：搞笑的一刻（要先讀，交易裡不能讀 Realtime Database）
  const opt = { warps: Object.values(log), today: taipeiDay(t) };
  const res = await db.runTransaction(async tx => {
    const rs = await tx.get(runRef(pid));
    if (!rs.exists) throw bad("這壹趟已經結束了");
    const run = coopFix(JSON.parse(rs.data().data));
    const ids = coopPresent(run).map(m => m.id);
    const snaps = await Promise.all(ids.map(id => tx.get(db.doc(`saves/${id}`))));
    const Ss = {}, Ps = {}, revs = {}, backs = {};
    snaps.forEach((s, i) => {
      const id = ids[i];
      if (!s.exists) throw bad("有人的存檔不見了");
      Ss[id] = JSON.parse(s.data().data);
      const P = Ss[id].profiles && Ss[id].profiles.challenge, m = coopMember(run, id);
      if (!P) throw bad("有人的存檔不見了");
      backs[id] = P.vid;
      if (m.vid && P.vid !== m.vid) switchVisitor(P, m.vid); // 他換了參觀者：結果寫回下去的那一位
      Ps[id] = P;
      revs[id] = s.data().rev;
    });
    // 骰子：中間不 await
    setRng(mulberry32(hashStr(`${run.id}:${run.step}:${run.rev || 0}`)));
    let r;
    try { r = coopAct(run, Ps, uid, act, data, t, opt); } finally { setRng(null); }
    if (!r.ok) throw bad(r.reason);
    if (r.noop) return { r, run, saved: {} };
    ids.forEach(id => { if (backs[id] && Ps[id].vid !== backs[id]) switchVisitor(Ps[id], backs[id]); });
    run.rev = (run.rev || 0) + 1;
    tx.set(runRef(pid), { data: JSON.stringify(run), rev: run.rev, updatedAt: FieldValue.serverTimestamp() });
    const saved = {};
    if (r.saves) ids.forEach(id => {
      saved[id] = revs[id] + 1;
      tx.set(db.doc(`saves/${id}`), { data: JSON.stringify(Ss[id]), rev: saved[id], updatedAt: FieldValue.serverTimestamp() });
    });
    return { r, run, saved };
  });
  if (!res.r.noop) await afterStep(pid, res, uid, act);
  return res;
}
// 交易成功之後：更新畫面、通知、處理離隊、收尾
async function afterStep(pid, { r, run, saved }, uid, act) {
  await publish(pid, run);
  await Promise.all(Object.entries(saved).map(([id, rev]) => inbox(id, { t: "save_changed", rev, why: "coop" })));
  for (const id of r.dropped) {
    if (id === uid && act === "leave") continue; // 自己按離開：partyAction 接著會把他移出隊伍
    const m = coopMember(run, id);
    await rtdb().ref(viewPath(pid, id)).remove();
    await changeParty(pid, p => partyLeave(p, id)).catch(() => {});
    await clearPartyOf(id, pid);
    await inbox(id, { t: "coop_out", pid, why: "afk" });
    for (const o of coopPresent(run)) if (o.id !== id) await inbox(o.id, { t: "party", pid, left: m ? m.name : "隊友", why: "afk" });
  }
  if (r.ended) await rtdb().ref(`parties/${pid}`).update({ phase: "done" }).catch(() => {});
}

// ---------- 開始 ----------
async function startRun(me, pid) {
  // 先佔住：同一個交易裡檢查、改成 running（兩個人同時按只會跑一次）
  const { party } = await changeParty(pid, p => {
    if (p.kind !== "cellar") return { ok: false, reason: "這不是合作地下的隊伍" };
    const can = canStartParty(p, me.uid);
    if (!can.ok) return p.phase === "running" || p.phase === "done" ? { ok: false, reason: "已經開始了" } : can;
    p.phase = "running";
    delete p.fail;
    return { ok: true };
  });
  if (party.phase !== "running") throw bad("已經開始了");
  const list = partyMembers(party), db = getFirestore(), t = now(), today = taipeiDay(t);
  const id = `${pid}:${t}`;
  let run, saved = {};
  try {
    const out = await db.runTransaction(async tx => {
      const snaps = await Promise.all(list.map(m => tx.get(db.doc(`saves/${m.id}`))));
      const Ss = {}, revs = {};
      const members = list.map((m, i) => {
        const s = snaps[i];
        if (!s.exists) throw bad(`${m.nick} 還沒有存檔`);
        Ss[m.id] = JSON.parse(s.data().data);
        const P = Ss[m.id].profiles && Ss[m.id].profiles.challenge;
        if (!P) throw bad(`${m.nick} 要先用挑戰模式的參觀者進館`);
        ensureDay(P, today);
        revs[m.id] = s.data().rev;
        return { id: m.id, name: m.nick, P, keys: m.pick, guard: !!m.guard };
      });
      setRng(mulberry32(hashStr(`${id}:start`)));
      let r;
      try { r = coopBegin(members, party.floor || 1, today, t, { id, fun: true }); } finally { setRng(null); }
      if (!r.ok) throw bad(r.reason);
      r.run.rev = 1;
      tx.set(runRef(pid), { data: JSON.stringify(r.run), rev: 1, updatedAt: FieldValue.serverTimestamp() });
      const revOut = {};
      list.forEach(m => {
        revOut[m.id] = revs[m.id] + 1;
        tx.set(db.doc(`saves/${m.id}`), { data: JSON.stringify(Ss[m.id]), rev: revOut[m.id], updatedAt: FieldValue.serverTimestamp() });
      });
      return { run: r.run, revOut };
    });
    run = out.run; saved = out.revOut;
  } catch (e) {
    // 開始不了：回到準備的樣子，誰也沒扣東西。原因寫進隊伍，大家都看得到
    const err = e instanceof HttpsError ? e : new HttpsError("internal", "伺服器出錯了，誰都沒有扣東西，再試壹次");
    if (!(e instanceof HttpsError)) console.error("合作地下開始不了", e);
    await rtdb().ref(`parties/${pid}`).update({ phase: "lobby", fail: { reason: err.message, at: now() } });
    throw err;
  }
  await publish(pid, run);
  await Promise.all(Object.entries(saved).map(([uid, rev]) => inbox(uid, { t: "save_changed", rev, why: "coop" })));
  return { ok: true };
}

// ---------- 離隊的掛鉤（functions/party.js 的 leaveParty 叫） ----------
partyHooks.beforeLeave = async (pid, uid) => {
  const p = fixParty((await rtdb().ref(`parties/${pid}`).get()).val());
  if (!p || p.kind !== "cellar") return;
  await rtdb().ref(viewPath(pid, uid)).remove().catch(() => {});
  if (p.phase !== "running") return;
  try { await runStep(pid, uid, "leave"); }
  catch (e) { if (!(e instanceof HttpsError)) console.error("合作地下離隊出錯", e); } // 這一趟已經不在了：照樣離開隊伍
};
partyHooks.closed = async pid => {
  await clearRunStuff(pid);
};
async function clearRunStuff(pid) {
  await rtdb().ref().update({ [`coopView/${pid}`]: null, [`coopChat/${pid}`]: null, [`coopChatLog/${pid}`]: null, [`coopChatAt/${pid}`]: null }).catch(() => {});
  await runRef(pid).delete().catch(() => {});
}

// ---------- 隊友斷線太久：伺服器自己看 /status 再移 ----------
async function pruneRun(me, pid, uid) {
  if (typeof uid !== "string" || !uid || uid === me.uid) throw new HttpsError("invalid-argument", "要說移出誰");
  const them = await memberOf(uid);
  if (them && them.invisible) return { ok: true, pruned: false, reason: "隱身的館友看不出在不在線" };
  const st = await statusOf(uid);
  if (st && st.state !== "offline") return { ok: true, pruned: false, reason: "還在線上" };
  if (st && typeof st.at === "number" && now() - st.at < COOP.offlineMs) return { ok: true, pruned: false, reason: "再等壹下" };
  const res = await runStep(pid, uid, "leave");
  await rtdb().ref(viewPath(pid, uid)).remove().catch(() => {});
  await changeParty(pid, p => partyLeave(p, uid)).catch(() => {});
  await clearPartyOf(uid, pid);
  const m = coopMember(res.run, uid);
  for (const o of coopPresent(res.run)) await inbox(o.id, { t: "party", pid, left: m ? m.name : "隊友", why: "offline" });
  await inbox(uid, { t: "coop_out", pid, why: "offline" });
  return { ok: true, pruned: true };
}

// ---------- Functions ----------
// 說話（機制 4）：只有短句和叫聲（翊文 11-09 貼的第 4 點「沒有打字」；決定 0020 的自由打字要不要，等翊文）。伺服器變形，畫面動不了。
// 紀錄：大家看到的放 /coopChat；變形前的原文放 /coopChatLog（只有伺服器，探險報告用）
async function say(me, pid, data) {
  const rs = await runRef(pid).get();
  if (!rs.exists) throw bad("這壹趟已經結束了");
  const run = coopFix(JSON.parse(rs.data().data)), t = now();
  // 送太快會擋：交易裡比上次的時間
  let tooFast = false;
  await rtdb().ref(`coopChatAt/${pid}/${me.uid}`).transaction(cur => {
    tooFast = !!(cur && t - cur < COOP.sayGapMs);
    return tooFast ? undefined : t;
  });
  if (tooFast) return { ok: false, reason: "說慢壹點" };
  setRng(mulberry32(hashStr(`${pid}:${me.uid}:${t}`)));
  let r;
  try { r = coopSayBuild(run, me.uid, data); } finally { setRng(null); }
  if (!r.ok) throw bad(r.reason);
  const ref = rtdb().ref(`coopChat/${pid}`).push();
  await ref.set({ by: me.uid, name: r.name, text: r.text, k: r.kind, id: r.id, at: t });
  if (r.warped) await rtdb().ref(`coopChatLog/${pid}/${ref.key}`).set({ by: me.uid, name: r.name, from: r.from, to: r.text, at: t });
  return { ok: true };
}

const FLOW_ACTS = ["vote", "knock", "carry", "guess", "ack", "floor", "tick", "resume"];
export const coopStep = onCall(async req => {
  const me = await needMember(req);
  const { pid, act, data } = req.data || {};
  // 開一隊（一個人也能下去）：已經當隊長、還沒開始的那一隊就用那一隊
  if (act === "open") {
    const led = await ledParty(me.uid, "cellar");
    if (led) return { pid: led.pid };
    await leaveCurrent(me.uid, me.nick);
    const id = newId();
    await rtdb().ref(`parties/${id}`).set(newParty({ pid: id, kind: "cellar", leader: me.uid, leaderNick: me.nick, now: now() }));
    await rtdb().ref(`partyOf/${me.uid}`).set(id);
    return { pid: id };
  }
  if (typeof pid !== "string" || !pid) throw new HttpsError("invalid-argument", "少了隊伍的號碼");
  if (act === "start") return startRun(me, pid);
  if (act === "setFloor") { await changeParty(pid, p => partyFloor(p, me.uid, data && data.floor)); return { ok: true }; }
  if (act === "setGuard") { await changeParty(pid, p => partyGuard(p, me.uid, !!(data && data.on))); return { ok: true }; }
  if (act === "setBest") {
    // 只拿來在準備區顯示「誰走到哪一層」；真的檢查在開始時照存檔算
    const best = data && Number.isInteger(data.best) ? data.best : 0;
    await changeParty(pid, p => { if (!p.members[me.uid]) return { ok: false, reason: "你不在這個隊伍裡" }; p.members[me.uid].best = best; return { ok: true }; });
    return { ok: true };
  }
  if (act === "again") {
    await changeParty(pid, p => partyBack(p, me.uid));
    await clearRunStuff(pid);
    return { ok: true };
  }
  if (act === "prune") return pruneRun(me, pid, data && data.uid);
  if (act === "say") return say(me, pid, data || {});
  if (FLOW_ACTS.includes(act)) {
    await runStep(pid, me.uid, act, data || {});
    return { ok: true };
  }
  throw new HttpsError("invalid-argument", "不認得的動作");
});
