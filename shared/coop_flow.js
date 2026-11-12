// ================================================================
//  合作地下收藏庫：伺服器走一趟的流程（多人版 M4）。規則在 shared/coop.js，這個檔只管「輪到誰、等多久、接下來是哪一步」。
//  functions/coop.js 每一步：讀 run 和每個人的存檔 → setRng → coopAct(...) → setRng(null) → 寫回。
//  純函式、同步；「現在」從外面傳進來（now，毫秒），不碰時鐘。
//
//  run.phase：vote（投票）→ result（看結果，大家按繼續或 20 秒）→（carry 搬東西 → carried 看結果）→ vote ……
//             → （guess 猜住的是什麼）→ floorDone（往下或回地面，投票）→ over（結束）
//  coopAct(run, Ps, uid, act, data, now) 的 act：
//    vote    data.choice：選項的號碼或 "retreat"。大家都投了就開票
//    ack     看完結果了。大家都按了就走下一步
//    floor   data.go："down"（往下一層）或 "up"（回地面）
//    knock   幽靈敲一下，data.choice：讓這個選項發抖（一間一次）
//    carry   兩個人一起搬，data.side："L"、"R" 或 "skip"
//    guess   猜這一層住的是什麼，data.id：住客的 id
//    tick    時間到了（畫面請伺服器，伺服器自己看 run.deadline）：沒投的算棄權、沒按的不等了
//    resume  斷線回來：時間早就過了又沒有人催的話，再給一點時間
//    leave   離隊（uid 自己；斷線太久由伺服器代叫）
//  回傳 { ok, saves（存檔有沒有變）, dropped（這一步離隊的人）, ended（這一趟剛結束）, noop（什麼都沒變）} 或 { ok: false, reason }。
// ================================================================
import { coopCarryDo, coopCarryPick, coopGuess, coopKnock, coopMakeReport, coopSaveReport } from "./coop_fun.js";
import { eventExtraTurns, eventRunFix } from "./events.js";
import { trialById } from "./shop.js";
import { coopFightRound } from "./coop_fight.js";
import { coopRest, coopRouteBack, coopRouteGo, coopRouteOptions } from "./coop_route.js";
import { fightActors, fightSeatOf } from "./cellar_fight.js";
import { COOP, canStartCoop, coopAdvance, coopContinue, coopEnd, coopFinish, coopFix, coopLeave, coopMember, coopPresent, coopResolve, coopRoom, coopVoters, startCoop } from "./coop.js";

// ---------- 每天前幾趟有獎勵（照帳號：P.coopDay 不跟著參觀者換，決定 0020） ----------
// 算一趟，回傳這一趟有沒有獎勵。P.coopDay ＝ { date, n }
// extra：限時活動中開始的，這一天多幾趟有獎勵（決定 0041；最多 1 趟，不疊加）。活動外開始的趟不看 extra，所以多的那趟只在活動內拿得到
export function coopTakeTurn(P, today, extra = 0) {
  const d = P.coopDay && P.coopDay.date === today ? P.coopDay : { date: today, n: 0 };
  d.n++;
  P.coopDay = d;
  return d.n <= COOP.dailyRewarded + Math.min(1, Math.max(0, extra));
}
// 今天還剩幾趟有獎勵。boost：現在正在進行的合作活動（events.js 的 eventRunOf），有的話把多的那趟算進去
export const coopTurnsLeft = (P, today, boost) => Math.max(0, COOP.dailyRewarded + eventExtraTurns(eventRunFix(boost)) - (P && P.coopDay && P.coopDay.date === today ? P.coopDay.n : 0));

// ---------- 開始一趟 ----------
// members 跟 startCoop 一樣；能開始才算一趟（中途離開不退）
export function coopBegin(members, floor, today, now, opt = {}) {
  const tr = opt.trial ? trialById(opt.trial.id) : null;
  if (tr) { floor = tr.floor; opt = Object.assign({}, opt, { trial: Object.assign({ date: today }, opt.trial) }); }
  const can = canStartCoop(members, floor, !!tr);
  if (!can.ok) return can;
  if (tr) members.forEach(m => { m.rewarded = false; }); // 合作試煉（決定 0041）：拿的是技能成長，不算每天 3 趟、沒有靈感
  else {
    const extra = eventExtraTurns(eventRunFix(opt.event)); // 限時活動：開始這一刻在活動內，多 1 趟有獎勵
    members.forEach(m => { m.rewarded = coopTakeTurn(m.P, today, extra); });
  }
  const s = startCoop(members, floor, Object.assign({ day: today }, opt)); // day：今天的地圖（地下室改版）
  if (!s.ok) return s;
  s.run.at = now;
  coopArm(s.run, now);
  return s;
}

// ---------- 計時 ----------
export const coopPhaseMs = phase => ({ route: COOP.voteMs, rest: COOP.voteMs, chest: COOP.resultMs, fight: COOP.fightMs, vote: COOP.voteMs, result: COOP.resultMs, carried: COOP.resultMs, floorDone: COOP.floorMs, carry: COOP.carry.ms, guess: COOP.truth.guessMs })[phase] || null;
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
  if (go === "down" && run.next) { // 沒有下一層可以走（最底層，或守門沒打贏）：投往下也是回地面
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
// 打怪物的一回合：大家都選了（或時間到）就結算。沒選的當「擋」，不算掛機（打怪的時候站著不動也是一種選擇）
const everyPicked = run => { const as = run.fight ? fightActors(run.fight).filter(s => { const m = coopMember(run, s.id); return m && !m.out; }) : []; return as.every(s => run.votes[s.id] !== undefined); }; // 已經離隊的人不用等
function doFight(run, Ps, now, out) {
  const r = coopFightRound(run, Ps, run.votes || {});
  if (!r.ok) return r;
  afterRule(run, r, out);
  if (run.phase !== "over") coopArm(run, now);
  return r;
}
// 地圖選路（地下室改版）：大家都投了下一個點、休息都選了、寶箱看完了
function doRoute(run, Ps, now, out) {
  const votes = run.votes || {};
  coopVoters(run).forEach(m => { m.skips = votes[m.id] === undefined ? (m.skips || 0) + 1 : 0; });
  const r = coopRouteGo(run, Ps, votes);
  if (!r.ok) return r;
  afterRule(run, r, out);
  coopVoters(run).filter(m => m.skips >= COOP.maxSkips).forEach(m => { coopLeave(run, Ps, m.id); out.dropped.push(m.id); }); // 掛機：連 3 次沒投
  if (run.phase !== "over") coopArm(run, now);
  return r;
}
function doRest(run, Ps, now, out) {
  const r = coopRest(run, Ps, run.votes || {});
  if (!r.ok) return r;
  afterRule(run, r, out);
  if (run.phase !== "over") coopArm(run, now);
  return r;
}
function doChestDone(run, Ps, now, out) {
  const r = coopRouteBack(run, Ps);
  afterRule(run, r, out);
  if (run.phase !== "over") coopArm(run, now);
  return r;
}
function doCarry(run, Ps, now, out) {
  const r = coopCarryDo(run, Ps);
  if (!r.ok) return r;
  afterRule(run, r, out);
  if (run.phase !== "over") coopArm(run, now);
  return r;
}
function doGuess(run, Ps, now, out) {
  const r = coopGuess(run, Ps, run.votes || {});
  if (!r.ok) return r;
  afterRule(run, r, out);
  coopArm(run, now);
  return r;
}
// 這一趟結束了：收尾只做一次
function wrapUp(run, Ps, out, now, opt) {
  if (run.phase !== "over" || run.ended) return;
  const e = coopEnd(run, Ps, run.over || "done");
  run.ended = true;
  run.summary = e.summary;
  if (run.fun) {
    run.report = coopMakeReport(run, (opt && opt.warps) || [], (opt && opt.today) || null);
    coopPresentSave(run, Ps);
  }
  run.deadline = null;
  run.at = now;
  out.ended = true;
  out.saves = true;
}

// 報告存進每個人的存檔（還在的人）
function coopPresentSave(run, Ps) { coopPresent(run).forEach(m => { if (Ps[m.id]) coopSaveReport(Ps[m.id], run.report); }); }

// ---------- 一個動作 ----------
// opt ＝ { warps: 變形的句子（探險報告用）, today }
export function coopAct(run, Ps, uid, act, data = {}, now = 0, opt = null) {
  coopFix(run);
  run.fresh = {}; // 這一步給每個人的事件（上一步的不能再送一次）
  const out = { ok: true, saves: false, dropped: [], ended: false, noop: false };
  const m = coopMember(run, uid);
  if (act !== "tick" && (!m || (m.out && act !== "leave"))) return { ok: false, reason: "你不在這壹趟裡" };
  if (run.ended) { out.noop = true; return out; }
  // 太久沒有人動（大家都走了）：回來的人一碰，這一趟就結束，走到哪算到哪
  if (run.at && now - run.at > COOP.staleMs) {
    coopFinish(run, "stale");
    wrapUp(run, Ps, out, now, opt);
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
  } else if (act === "route") {
    if (run.phase !== "route") return { ok: false, reason: "現在不是選路的時候" };
    if (!m || m.ghost || m.guard) return { ok: false, reason: "你現在不能投票" };
    if (typeof data.node !== "string" || (data.node !== "retreat" && !coopRouteOptions(run).includes(data.node))) return { ok: false, reason: "那裡走不過去" };
    run.votes[uid] = data.node;
    if (everyVoted(run)) r = doRoute(run, Ps, now, out);
  } else if (act === "rest") {
    if (run.phase !== "rest") return { ok: false, reason: "現在不是休息的時候" };
    if (!m || m.ghost || m.guard) return { ok: false, reason: "你現在不能選" };
    if (data.pick !== "san" && data.pick !== "heal") return { ok: false, reason: "要選回理智或治傷" };
    run.votes[uid] = data.pick;
    if (everyVoted(run)) r = doRest(run, Ps, now, out);
  } else if (act === "fight") {
    if (run.phase !== "fight" || !run.fight) return { ok: false, reason: "現在沒有在打" };
    const seat = fightSeatOf(run.fight, uid);
    if (!seat || seat.out) return { ok: false, reason: "你不在這壹場裡" };
    if (typeof data.act !== "string" || data.act.length > 20) return { ok: false, reason: "要選壹個行動" };
    run.votes[uid] = { act: data.act, for: typeof data.for === "string" ? data.for.slice(0, 80) : null, tap: data.tap === 2 ? 2 : data.tap === 1 ? 1 : 0 };
    if (everyPicked(run)) r = doFight(run, Ps, now, out);
  } else if (act === "knock") {
    const k = coopKnock(run, uid, data.choice);
    if (!k.ok) return k;
  } else if (act === "carry") {
    if (run.phase !== "carry") return { ok: false, reason: "現在不用搬" };
    const k = coopCarryPick(run, uid, data.side);
    if (!k.ok) return k;
    if (coopVoters(run).every(x => run.carry.picks[x.id] !== undefined)) r = doCarry(run, Ps, now, out);
  } else if (act === "guess") {
    if (run.phase !== "guess") return { ok: false, reason: "現在不用猜" };
    if (!m || m.ghost || m.guard) return { ok: false, reason: "你現在不能投票" };
    if (typeof data.id !== "string" || !data.id) return { ok: false, reason: "要猜壹個" };
    run.votes[uid] = data.id;
    if (everyVoted(run)) r = doGuess(run, Ps, now, out);
  } else if (act === "ack") {
    if (run.phase !== "result" && run.phase !== "carried" && run.phase !== "chest") { out.noop = true; return out; }
    run.acks[uid] = true;
    if (everyAcked(run)) r = run.phase === "chest" ? doChestDone(run, Ps, now, out) : doAdvance(run, Ps, now, out);
  } else if (act === "floor") {
    if (run.phase !== "floorDone") return { ok: false, reason: "現在不用決定這個" };
    if (!m || m.ghost || m.guard) return { ok: false, reason: "你現在不能投票" };
    if (data.go !== "down" && data.go !== "up") return { ok: false, reason: "要往下還是回地面" };
    run.votes[uid] = data.go;
    if (everyVoted(run)) r = doFloor(run, Ps, now, out);
  } else if (act === "tick") {
    if (!run.deadline || now < run.deadline - 300) { out.noop = true; return out; } // 伺服器自己看時間：還沒到就不做
    if (run.phase === "vote") r = doResolve(run, Ps, now, out);
    else if (run.phase === "route") r = doRoute(run, Ps, now, out);
    else if (run.phase === "rest") r = doRest(run, Ps, now, out);
    else if (run.phase === "chest") r = doChestDone(run, Ps, now, out);
    else if (run.phase === "fight") r = doFight(run, Ps, now, out);
    else if (run.phase === "result" || run.phase === "carried") r = doAdvance(run, Ps, now, out);
    else if (run.phase === "floorDone") r = doFloor(run, Ps, now, out);
    else if (run.phase === "carry") r = doCarry(run, Ps, now, out);
    else if (run.phase === "guess") r = doGuess(run, Ps, now, out);
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
    else if (run.phase === "route" && everyVoted(run)) r = doRoute(run, Ps, now, out);
    else if (run.phase === "rest" && everyVoted(run)) r = doRest(run, Ps, now, out);
    else if (run.phase === "chest" && everyAcked(run)) r = doChestDone(run, Ps, now, out);
    else if (run.phase === "fight" && run.fight && everyPicked(run)) r = doFight(run, Ps, now, out);
    else if (run.phase === "floorDone" && everyVoted(run)) r = doFloor(run, Ps, now, out);
    else if ((run.phase === "result" || run.phase === "carried") && everyAcked(run)) r = doAdvance(run, Ps, now, out);
    else if (run.phase === "guess" && everyVoted(run)) r = doGuess(run, Ps, now, out);
    else if (run.phase === "carry" && coopVoters(run).length && coopVoters(run).every(x => run.carry.picks[x.id] !== undefined)) r = doCarry(run, Ps, now, out);
  } else return { ok: false, reason: "不認得的動作" };
  if (r && r.ok === false) return r;
  run.at = now;
  wrapUp(run, Ps, out, now, opt);
  return out;
}
