// ================================================================
//  合作地下收藏庫接上打怪物（地下室改版，決定 0067、0068；規劃 docs/地下室改版規劃.md 第九節第 3 步）
//  第一段先做「守門」：這一層的房間照舊探索完之後，多一場打這一層的守門；打贏才算走完這一層、拿第一次過關的獎勵。
//    逃跑成功、拖到怪物走掉：這一層不算走完，只能回地面（下次再來）。全隊都倒了：這一趟結束。
//  一個人也是走這一套（翊文 11-12 的回答 2A：一個人下去也走伺服器的合作流程）。
//  打怪的規則在 shared/cellar_fight.js（不碰存檔）；這個檔負責把結果套到每個人的 P：
//    理智（先扣膽量，剩下的走 coopSanHit：看懂檢定、發作、怪癖都照舊）、倒下的佩佩真的受傷、用到的技能記成長、打贏的靈感。
//  膽量（壯膽）是一趟一份：記在 run.members[].brave，開打時傳進去、每回合存回來。
//  run.gate ＝這一趟有沒有打守門（startCoop 的 opt.gate，伺服器照 NUM.ui.newCellar 開）；run.gateDone ＝ { 層數: true }
//  run.phase "fight"：run.fight ＝這一場；run.votes ＝ { 隊員 id: { act, for, tap } }
// ================================================================
import { NUM } from "./config.js";
import { addDays } from "./logic.js";
import { injureDaysOf } from "./logic3.js";
import { coopActive, coopFinish, coopFloorComplete, coopLeave, coopMember, coopNewEvents, coopSanGain, coopSanHit, coopSync, coopVoters } from "./coop.js";
import { coopRouteBack } from "./coop_route.js";
import { fightActors, fightCanAct, fightCourage, fightFoesOf, fightHelperSeat, fightIntentText, fightNameOf, fightOptions, fightRound, fightSeat, fightSeatOf, fightStart, fightWinInsp } from "./cellar_fight.js";

// 這一層還要不要打守門
export const coopGateDue = run => !!(run && run.gate && !run.trial && !(run.gateDone && run.gateDone[run.floor]) && fightFoesOf(run.floor, true)[0]);
// 從資料庫讀回來補欄位（空的陣列、空的物件會不見）
export function coopFightFix(run) {
  if (!run || typeof run !== "object") return run;
  run.gate = !!run.gate;
  if (!run.gateDone || typeof run.gateDone !== "object") run.gateDone = {};
  const f = run.fight;
  if (!f || typeof f !== "object") { run.fight = null; return run; }
  const arr = v => Array.isArray(v) ? v : v && typeof v === "object" ? Object.keys(v).sort((a, b) => a - b).map(k => v[k]) : [];
  f.seats = arr(f.seats);
  f.seats.forEach(s => { s.pepes = arr(s.pepes); if (!s.used || typeof s.used !== "object") s.used = {}; if (!s.skills || typeof s.skills !== "object") s.skills = {}; s.helper = !!s.helper; s.out = !!s.out; s.ghost = !!s.ghost; s.pepes.forEach(p => { p.down = !!p.down; p.perfect = !!p.perfect; }); });
  ["intent", "over", "last"].forEach(k => { if (f[k] === undefined) f[k] = null; });
  f.weak = !!f.weak; f.tap = !!f.tap; f.cheer = f.cheer || 0;
  return run;
}

// 開一場。foe ＝怪物的 id（或每天的內容寫的整份怪物）；kind ＝ "gate"
export function coopFightStart(run, Ps, foe, kind = "gate", rank = 1) {
  coopFightFix(run);
  const events = coopNewEvents(run), ms = coopVoters(run);
  if (!ms.length) return { ok: false, reason: "沒有人可以打" };
  const seats = ms.map(m => {
    const P = Ps[m.id];
    const s = fightSeat(P, m.id, m.name, m.keys.filter(k => !P.injured[k])); // 這一趟前面受傷的不上場
    s.brave = typeof m.brave === "number" ? m.brave : fightCourage(ms.length);
    m.brave = s.brave;
    return s;
  });
  const helpers = run.team.filter(it => it.helper);
  if (helpers.length) seats.push(fightHelperSeat(helpers));
  // 躺平、毛帽回理智：這一層有人是第一次走才可以（界線：不能下去一直刷）
  const rest = ms.some(m => !(Ps[m.id].cellar.floorsDone || {})[run.floor]);
  const fight = fightStart(foe, seats, { pressure: run.pressure ? run.pressure.lv : 0, rest, rank });
  if (!fight) return { ok: false, reason: "這隻怪物開不了" };
  run.fight = fight; run.fightKind = kind; run.phase = "fight"; run.room = null;
  run.step++;
  coopActive(run).forEach(m => events[m.id].push({ type: "fightStart", foe: fight.foe, name: fightNameOf(fight), boss: fight.boss, rank: fight.rank }));
  coopSync(run, Ps);
  return { ok: true, run, fight: true, events };
}

// 一回合：picks ＝ { 隊員 id: { act, for, tap } }（沒選的當「擋」）。結果套到每個人的存檔
export function coopFightRound(run, Ps, picks) {
  coopFightFix(run);
  if (!run || run.phase !== "fight" || !run.fight) return { ok: false, reason: "現在沒有在打" };
  const fight = run.fight, events = coopNewEvents(run);
  run.step++;
  // 已經離隊的人：座位算走了
  fight.seats.forEach(s => { const m = coopMember(run, s.id); if (!s.helper && (!m || m.out)) s.out = true; });
  const before = {}, hpBefore = fight.hp, hpMaxBefore = fight.hpMax, phaseBefore = fight.phase; // 畫面演出從這一回合開始時的壓力演起
  fight.seats.forEach(s => { before[s.id] = s.out; });
  const r = fightRound(fight, picks || {});
  if (!r.ok) return r;
  const players = fight.seats.filter(s => !s.helper).length;
  Object.keys(r.fx).forEach(id => {
    const x = r.fx[id], P = Ps[id], m = coopMember(run, id), seat = fightSeatOf(fight, id);
    if (!P || !m) return;
    const ev = events[id];
    if (x.brave) ev.push({ type: "brave", n: x.brave, left: seat.brave });
    if (x.san) coopSanHit(P, m, x.san, `cellar:${run.floor}g`, null, ev);
    if (x.gain) coopSanGain(P, m, x.gain, "rest", ev);
    x.ticks.forEach(s => { if (P.skillTicks) P.skillTicks[s] = true; });
    x.downs.forEach(key => { // 倒下的是真的受傷（翊文 11-12）
      const days = injureDaysOf(P), until = addDays(P.day.date, days);
      P.injured[key] = until; m.got.injured.push(key);
      ev.push({ type: "injured", key, days, until });
    });
    m.brave = seat.brave;
    seat.san = P.sanity; // 理智以存檔的為準（有上限、有看懂檢定）
    if (m.ghost) seat.ghost = true;
  });
  // 這回合選「撤」的人：帶著拿到的回地面
  fight.seats.forEach(s => { if (!s.helper && s.out && !before[s.id]) { const m = coopMember(run, s.id); if (m && !m.out) coopLeave(run, Ps, s.id); } });
  const shared = { type: "fightRound", round: fight.round, hp: fight.hp, hpMax: fight.hpMax, phase: fight.phase, hpBefore, hpMaxBefore, phaseBefore, events: r.events, over: fight.over };
  run.members.forEach(m => { if (events[m.id]) events[m.id].push(shared); });
  run.last = { fight: true, round: shared };
  if (!fight.over) { coopSync(run, Ps); return { ok: true, run, events }; }
  // 打完了
  const kind = run.fightKind || "gate", floor = run.floor;
  run.fightLast = { foe: fight.foe, name: fightNameOf(fight), over: fight.over, last: fight.last, rounds: fight.round, rank: fight.rank, kind };
  run.fight = null;
  if (fight.over === "win") {
    const insp = fightWinInsp(players, fight.rank);
    coopActive(run).forEach(m => {
      const P = Ps[m.id];
      if (insp > 0 && m.rewarded && P) { P.insp += insp; m.got.insp += insp; events[m.id].push({ type: "fightWin", insp, last: fight.last }); }
      else events[m.id].push({ type: "fightWin", insp: 0, last: fight.last });
    });
    if (kind === "gate") {
      run.gateDone[floor] = true;
      const done = coopFloorComplete(run, Ps, events);
      return Object.assign(done, { fightOver: "win" });
    }
    if (kind === "foe") return Object.assign(coopRouteBack(run, Ps, events), { fightOver: "win" }); // 路上的怪物：打贏繼續選路
  } else if (fight.over === "lose" || fight.over === "retreat" || !coopVoters(run).length) {
    coopFinish(run, fight.over === "retreat" ? "retreat" : "lost");
  } else if (kind === "foe") {
    // 路上的怪物：逃掉、牠自己走掉都沒關係，繼續選路（沒有獎勵）
    run.last = Object.assign({}, run.last, { fled: fight.over, foe: true });
    return Object.assign(coopRouteBack(run, Ps, events), { fightOver: fight.over });
  } else {
    // 逃跑成功、怪物走掉：這一層不算走完，只能回地面
    run.next = null;
    run.phase = "floorDone";
    run.last = Object.assign({}, run.last, { fled: fight.over });
  }
  coopSync(run, Ps);
  return { ok: true, run, events, fightOver: fight.over };
}

// 這一回合的結算要演多久（毫秒）：演完才開始倒數，伺服器加進下一回合的期限（翊文 11-12：「演完才開始倒數」）
export function coopReplayMs(run) {
  const ev = (run && run.last && run.last.round && run.last.round.events) || [], F = NUM.fight;
  return ev.length ? Math.min(F.replayMax, ev.length * F.replayStep + F.replayTail) : 0;
}
// 送給畫面的：這個人現在可以選什麼、下一招的字、怪物的名字（規劃第八節：按之前就看得到會發生什麼）
export function coopFightView(run, id) {
  const f = run && run.fight;
  if (!f) return null;
  const seat = fightSeatOf(f, id);
  return { name: fightNameOf(f), intent: fightIntentText(f), options: seat ? fightOptions(f, id) : [], can: fightCanAct(seat), waiting: fightActors(f).filter(s => !(run.votes && run.votes[s.id])).map(s => s.id), fleeNeed: Math.ceil(fightActors(f).length / 2), limit: NUM.fight.maxRounds };
}
