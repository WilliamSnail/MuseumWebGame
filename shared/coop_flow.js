// ================================================================
//  合作地下收藏庫：伺服器走一趟的流程（多人版 M4）。規則在 shared/coop.js，這個檔只管「輪到誰、等多久、接下來是哪一步」。
//  functions/coop.js 每一步：讀 run 和每個人的存檔 → setRng → coopAct(...) → setRng(null) → 寫回。
//  純函式、同步；「現在」從外面傳進來（now，毫秒），不碰時鐘。
//
//  run.phase：vote（投票）→ result（看結果，大家按繼續或 20 秒）→ vote …… → floorDone（往下或回地面，投票）→ over（結束）
//  coopAct(run, Ps, uid, act, data, now) 的 act：
//    vote    data.choice：選項的號碼或 "retreat"。大家都投了就開票
//    ack     看完結果了。大家都按了就走下一步
//    floor   data.go："down"（往下一層）或 "up"（回地面）
//    knock   幽靈敲一下，data.choice：讓這個選項發抖（一間一次）
//    tick    時間到了（畫面請伺服器，伺服器自己看 run.deadline）：沒投的算棄權、沒按的不等了
//    resume  斷線回來：時間早就過了又沒有人催的話，再給一點時間
//    leave   離隊（uid 自己；斷線太久由伺服器代叫）
//  回傳 { ok, saves（存檔有沒有變）, dropped（這一步離隊的人）, ended（這一趟剛結束）, noop（什麼都沒變）} 或 { ok: false, reason }。
// ================================================================
import { coopKnock } from "./coop_fun.js";
import { COOP, canStartCoop, coopAdvance, coopContinue, coopEnd, coopFinish, coopFix, coopLeave, coopMember, coopPresent, coopResolve, coopRoom, coopVoters, startCoop } from "./coop.js";

// ---------- 每天前幾趟有獎勵（照帳號：P.coopDay 不跟著參觀者換，決定 0020） ----------
// 算一趟，回傳這一趟有沒有獎勵。P.coopDay ＝ { date, n }
export function coopTakeTurn(P, today) {
  const d = P.coopDay && P.coopDay.date === today ? P.coopDay : { date: today, n: 0 };
  d.n++;
  P.coopDay = d;
  return d.n <= COOP.dailyRewarded;
}
export const coopTurnsLeft = (P, today) => Math.max(0, COOP.dailyRewarded - (P && P.coopDay && P.coopDay.date === today ? P.coopDay.n : 0));

// ---------- 開始一趟 ----------
// members 跟 startCoop 一樣；能開始才算一趟（中途離開不退）
export function coopBegin(members, floor, today, now, opt = {}) {
  const can = canStartCoop(members, floor);
  if (!can.ok) return can;
  members.forEach(m => { m.rewarded = coopTakeTurn(m.P, today); });
  const s = startCoop(members, floor, opt);
  if (!s.ok) return s;
  s.run.at = now;
  coopArm(s.run, now);
  return s;
}

// ---------- 計時 ----------
export const coopPhaseMs = phase => ({ vote: COOP.voteMs, result: COOP.resultMs, floorDone: COOP.floorMs })[phase] || null;
export function coopArm(run, now) {
  const ms = coopPhaseMs(run.phase);
  run.votes = {}; run.acks = {};
  run.deadline = ms ? now + ms : null;
}
const everyVoted = run => { const vs = coopVoters(run); return vs.length > 0 && vs.every(m => run.votes[m.id] !== undefined); };
const everyAcked = run => { const ps = coopPresent(run); return ps.length > 0 && ps.every(m => run.acks[m.id]); };

// ---------- 走下一步（都會改 out） ----------
function afterRule(run, r, out) { if (r && r.events) run.fresh = r.events; out.saves = true; }
function doResolve(run, Ps, now, out) {
  const votes = run.votes || {};
  coopVoters(run).forEach(m => { m.skips = votes[m.id] === undefined ? (m.skips || 0) + 1 : 0; });
  const r = coopResolve(run, Ps, votes);
  if (!r.ok) return r;
  afterRule(run, r, out);
  coopVoters(run).filter(m => m.skips >= COOP.maxSkips).forEach(m => { coopLeave(run, Ps, m.id); out.dropped.push(m.id); }); // 掛機：連 3 次沒投
  coopArm(run, now);
  return r;
}
function doAdvance(run, Ps, now, out) {
  const r = coopAdvance(run, Ps);
  if (!r.ok) return r;
  afterRule(run, r, out);
  coopArm(run, now);
  return r;
}
function doFloor(run, Ps, now, out) {
  const count = { down: 0, up: 0 };
  coopVoters(run).forEach(m => { const v = run.votes[m.id]; if (v === "down" || v === "up") count[v]++; });
  const go = count.down > count.up ? "down" : count.up > count.down ? "up" : run.votes[run.leader] === "down" ? "down" : "up"; // 平手領隊；都沒投就回地面
  if (go === "down") {
    const r = coopContinue(run, Ps);
    if (!r.ok) return r;
    afterRule(run, r, out);
  } else {
    coopFinish(run, "done");
    run.step++;
  }
  coopArm(run, now);
  return { ok: true };
}
// 這一趟結束了：收尾只做一次
function wrapUp(run, Ps, out, now) {
  if (run.phase !== "over" || run.ended) return;
  const e = coopEnd(run, Ps, run.over || "done");
  run.ended = true;
  run.summary = e.summary;
  run.deadline = null;
  run.at = now;
  out.ended = true;
  out.saves = true;
}

// ---------- 一個動作 ----------
export function coopAct(run, Ps, uid, act, data = {}, now = 0) {
  coopFix(run);
  run.fresh = {}; // 這一步給每個人的事件（上一步的不能再送一次）
  const out = { ok: true, saves: false, dropped: [], ended: false, noop: false };
  const m = coopMember(run, uid);
  if (act !== "tick" && (!m || (m.out && act !== "leave"))) return { ok: false, reason: "你不在這壹趟裡" };
  if (run.ended) { out.noop = true; return out; }
  // 太久沒有人動（大家都走了）：回來的人一碰，這一趟就結束，走到哪算到哪
  if (run.at && now - run.at > COOP.staleMs) {
    coopFinish(run, "stale");
    wrapUp(run, Ps, out, now);
    return out;
  }
  let r = null;
  if (act === "vote") {
    if (run.phase !== "vote") return { ok: false, reason: "現在不是投票的時候" };
    if (!m || m.ghost || m.guard) return { ok: false, reason: "你現在不能投票" };
    const room = coopRoom(run), v = data.choice;
    if (v !== "retreat" && !(Number.isInteger(v) && room && room.choices[v])) return { ok: false, reason: "沒有這個選項" };
    run.votes[uid] = v;
    if (everyVoted(run)) r = doResolve(run, Ps, now, out);
  } else if (act === "knock") {
    const k = coopKnock(run, uid, data.choice);
    if (!k.ok) return k;
  } else if (act === "ack") {
    if (run.phase !== "result") { out.noop = true; return out; }
    run.acks[uid] = true;
    if (everyAcked(run)) r = doAdvance(run, Ps, now, out);
  } else if (act === "floor") {
    if (run.phase !== "floorDone") return { ok: false, reason: "現在不用決定這個" };
    if (!m || m.ghost || m.guard) return { ok: false, reason: "你現在不能投票" };
    if (data.go !== "down" && data.go !== "up") return { ok: false, reason: "要往下還是回地面" };
    run.votes[uid] = data.go;
    if (everyVoted(run)) r = doFloor(run, Ps, now, out);
  } else if (act === "tick") {
    if (!run.deadline || now < run.deadline - 300) { out.noop = true; return out; } // 伺服器自己看時間：還沒到就不做
    if (run.phase === "vote") r = doResolve(run, Ps, now, out);
    else if (run.phase === "result") r = doAdvance(run, Ps, now, out);
    else if (run.phase === "floorDone") r = doFloor(run, Ps, now, out);
    else { out.noop = true; return out; }
  } else if (act === "resume") {
    if (m) m.skips = 0;
    if (run.deadline && now > run.deadline) run.deadline = now + COOP.resumeMs; // 時間過了還沒人催＝沒有別人在線：等他看一下
  } else if (act === "leave") {
    if (!m || m.out) { out.noop = true; return out; }
    delete run.votes[uid]; delete run.acks[uid];
    r = coopLeave(run, Ps, uid);
    if (!r.ok) return r;
    out.dropped.push(uid);
    // 他是最後一個還沒投的：不用再等了
    if (run.phase === "vote" && everyVoted(run)) r = doResolve(run, Ps, now, out);
    else if (run.phase === "floorDone" && everyVoted(run)) r = doFloor(run, Ps, now, out);
    else if (run.phase === "result" && everyAcked(run)) r = doAdvance(run, Ps, now, out);
  } else return { ok: false, reason: "不認得的動作" };
  if (r && r.ok === false) return r;
  run.at = now;
  wrapUp(run, Ps, out, now);
  return out;
}
