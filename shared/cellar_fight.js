// ================================================================
//  地下室改版：打怪物的規則（決定 0067，規劃 docs/地下室改版規劃.md 第四節）
//  翊文 11-12：「讓整個冒險更有趣，最好還有互動打怪物的部分」「預設都要能合作」
//  一開始就是 1～4 個人的版本：一個人下去＝一個人的隊伍（館方助手補位），沒有另一套單人規則。
//  回合制：怪物先亮出下一招（fight.intent），每個人各選一個行動，fightRound 一起結算。
//    結算順序固定：撤 → 招式 → 看穿 → 安撫 → 擋 → 推 → 怪物出招。所以同一回合有人看穿、有人推，當回合就加成。
//  純函式、同步：不碰 P、不碰畫面。這裡只改 fight，回傳「每個人要扣多少理智、哪隻倒下、哪個技能有用到」（fx），
//    真的套到存檔（applySan、受傷幾天、技能成長）由接進合作流程的那一步做（規劃第九節第 3 步）。
//  亂數都用 RNG（伺服器每一步之前 setRng）。數字在 config.js 的 NUM.fight、CELLAR_FOES；字在 content3.js 的 FOE_TEXT。
//
//  怎麼用：
//    seats ＝ [fightSeat(P, 帳號 id, 暱稱, [帶的佩佩 key]) …, fightHelperSeat(館方助手的佩佩)]
//    const f = fightStart("f1a", seats, { pressure: 全隊理智壓力的級數, rest: 這一層是不是第一次走 })
//    fightOptions(f, id)                 這個人現在可以選什麼、按了大概會怎樣（給畫面寫在按鈕上）
//    fightRound(f, { id: { act, for } }) 一回合；沒選、選了不能選的都當「擋」。回傳 { ok, fight, events, fx }
//    f.over：null（還在打）、"win"、"lose"（都倒了）、"flee"（逃跑成功，離開這一場）、"retreat"（有人撤回地面、剩下的都倒了或都撤了）、"away"（拖太久，怪物走了）
//    fx 的 san ＝真的要扣的理智；brave ＝被膽量擋掉的（壯膽，決定 0068）
//    picks 可以帶 tap（0／1／2）：這回合 fight.tap 是 true 才算，按得好「推」多一點點
//    fightAfter(f)                       打完：倒下的佩佩哪幾隻真的受傷
//    fightStart(每天的內容寫的怪物, seats) 第一個參數也可以是整份怪物（fightFoeCheck 檢查過的），不用改程式就能加新怪物
// ================================================================
import { CELLAR_FOES, NUM } from "./config.js";
import { FOE_TEXT } from "./content3.js";
import { RNG, clampN, fromKey, rollD100, rollExpr, maxExpr } from "./logic.js";
import { memberPower, skillOf } from "./logic3.js";

// 帽子、姿勢變成一場一次的招式（原本是自動觸發的能力）
export const FIGHT_MOVES = {
  cap: { cat: "帽子", v: "棒球帽" },      // 擋下這回合打到自己（或指定的隊友）的招
  crown: { cat: "帽子", v: "皇冠" },      // 推，骰子當最大
  tentacle: { cat: "帽子", v: "觸手帽" }, // 推，強度乘 tentacleMult，自己扣理智
  wizard: { cat: "帽子", v: "巫師帽" },   // 這回合每個人的推 +wizard
  beanie: { cat: "帽子", v: "毛帽" },     // 回理智（這一層第一次走才行）
  rest: { cat: "姿勢", v: "躺平" },       // 回理智（這一層第一次走才行）
  squat: { cat: "姿勢", v: "斯拉夫蹲" },  // 這回合自己的佩佩不會倒
  cheer: { cat: "姿勢", v: "比讚" },      // 下一回合每個人的推 +cheer
};
export const FIGHT_ACTS = ["push", "see", "calm", "guard", "flee", "retreat", "point"].concat(Object.keys(FIGHT_MOVES));

export const fightFoe = id => CELLAR_FOES.find(f => f.id === id) || null;
export const fightFoesOf = (floor, boss = false) => CELLAR_FOES.filter(f => f.floor === floor && !!f.boss === !!boss);
export const fightFoeName = id => (FOE_TEXT[id] || {}).name || "說不出名字的東西";
// 這一場的怪物：內建的照 id 找；每天的內容自己寫的（content/weeks 的 dN.json，規劃第十二節）整份放在 fight.custom
export const fightFoeOf = fight => (fight && fight.custom) || fightFoe(fight && fight.foe);
export const fightNameOf = fight => (fight && fight.custom && fight.custom.name) || fightFoeName(fight && fight.foe);
// 每天的內容寫的怪物要過這個檢查（之後接進 tools/week_check.cjs）：回傳問題的清單，沒問題是空的
//   { id, name, intro, floor, hp, mood?, color?, moves: [{ id, kind, text, san?, n?, w? }], boss?, hp2?, moves2?, phase2? }
export const FIGHT_CUSTOM = { hp: [10, 90], sanMax: 6, growMax: 10, moves: [2, 4], nameMax: 12, textMax: 40 };
export function fightFoeCheck(d) {
  const L = FIGHT_CUSTOM, bad = [];
  if (!d || typeof d !== "object" || Array.isArray(d)) return ["怪物要是壹個物件"];
  const str = (v, max) => typeof v === "string" && v.trim() && [...v].length <= max;
  if (!str(d.id, 40) || fightFoe(d.id)) bad.push("id 要有、不能跟內建的重複");
  if (!str(d.name, L.nameMax)) bad.push("name 要有，最多 " + L.nameMax + " 個字");
  if (!str(d.intro, L.textMax)) bad.push("intro 要有，最多 " + L.textMax + " 個字");
  if (/蛙|[Pp]epe/.test(JSON.stringify(d))) bad.push("怪物不是青蛙（界線）");
  const hpOk = v => Number.isInteger(v) && v >= L.hp[0] && v <= L.hp[1];
  if (!hpOk(d.hp)) bad.push("hp 要是 " + L.hp[0] + "～" + L.hp[1] + " 的整數");
  const movesOk = (ms, tag) => {
    if (!Array.isArray(ms) || ms.length < L.moves[0] || ms.length > L.moves[1]) { bad.push(tag + " 要有 " + L.moves[0] + "～" + L.moves[1] + " 招"); return; }
    ms.forEach((m, i) => {
      const at = tag + " 第 " + (i + 1) + " 招";
      if (!m || !str(m.id, 20) || !["hit", "scare", "all", "grow"].includes(m.kind)) { bad.push(at + " 的 id 或 kind 不對"); return; }
      if (!str(m.text, L.textMax)) bad.push(at + " 要有 text（下壹招的預告）");
      else if ((m.kind === "hit" || m.kind === "scare") && !m.text.includes("{x}")) bad.push(at + " 的 text 要寫 {x}（點到誰）");
      if ((m.kind === "scare" || m.kind === "all") && !(maxExpr(m.san) >= 1 && maxExpr(m.san) <= L.sanMax)) bad.push(at + " 的 san 最多扣 " + L.sanMax);
      if (m.kind === "grow" && !(Number.isInteger(m.n) && m.n >= 1 && m.n <= L.growMax)) bad.push(at + " 的 n 要是 1～" + L.growMax);
      if (m.w != null && !(m.w > 0 && m.w <= 5)) bad.push(at + " 的 w 要是 0～5");
    });
  };
  movesOk(d.moves, "moves");
  if (d.boss || d.hp2 != null || d.moves2) { if (!hpOk(d.hp2)) bad.push("守門要有 hp2"); movesOk(d.moves2, "moves2"); }
  return bad;
}
// 下一招的預告：{x} 換成被點到的人
export function fightIntentText(fight) {
  const it = fight && fight.intent;
  if (!it) return "";
  const mv = fight.custom ? (fight.custom.moves || []).concat(fight.custom.moves2 || []).find(m => m.id === it.move) : null;
  const t = (mv && mv.text) || ((FOE_TEXT[fight.foe] || {}).moves || {})[it.move] || "";
  const to = it.to ? fightSeatOf(fight, it.to) : null;
  return t.split("{x}").join(to ? to.name : "大家");
}

// ---------- 座位 ----------
export function fightSeat(P, id, name, keys) {
  const pepes = (keys || []).map(k => { const e = P && P.pepes && P.pepes[k], pick = fromKey(k); return e && pick ? { key: k, pick, perfect: !!e.perfect, power: 0, down: false } : null; }).filter(Boolean);
  const skills = {};
  ["偵查", "神秘學", "說服"].forEach(s => { skills[s] = skillOf(P, s); });
  return { id, name: name || "", helper: false, san: P ? P.sanity : 0, brave: null, skills, pepes, used: {}, out: false, ghost: false };
}
// 館方助手：只會推，不扣理智
export function fightHelperSeat(items, name = "館方助手") {
  return { id: "helper", name, helper: true, san: 99, skills: {}, pepes: (items || []).map(it => ({ key: it.key, pick: it.pick, perfect: false, power: 0, down: false })), used: {}, out: false, ghost: false };
}
export const fightSeatOf = (fight, id) => fight.seats.find(s => s.id === id) || null;
export const fightUp = s => s.pepes.filter(p => !p.down);
export const fightPower = s => fightUp(s).reduce((n, p) => n + p.power, 0);
// 還能出手的人（不含館方助手）
export const fightCanAct = s => !!s && !s.helper && !s.out && !s.ghost;
export const fightActors = fight => fight.seats.filter(fightCanAct);
// 這個人有沒有這個招式（還站著的佩佩有那頂帽子、那個姿勢）
export const fightHasMove = (s, m) => !!FIGHT_MOVES[m] && fightUp(s).some(p => p.pick[FIGHT_MOVES[m].cat] === FIGHT_MOVES[m].v);

// 怪物的等級 1～3（守門不分等級，當 1）
export const fightRankOf = n => clampN(Math.floor(+n || 1), 1, NUM.fight.rankHp.length);
// 怪物的壓力照隊伍放大，再乘等級
export function fightHp(base, pepes, players, lv = 0, rank = 1) {
  const F = NUM.fight;
  return Math.max(1, Math.round(base * F.rankHp[fightRankOf(rank) - 1] * pepes / F.baseTeam * (1 + F.perPlayer * Math.max(0, players - 1))) + F.pressureHp * lv);
}
// 壯膽（翊文 11-12：「每多合作一個玩家就高五點的理智」）：每多一個真人隊友，每個人多 courage 點膽量。
// 膽量先替理智擋，這一趟用完就沒了、不寫進存檔（不然一直開隊伍就能刷理智；界線：理智歸零要算容易出現）
export const fightCourage = players => NUM.fight.courage * Math.max(0, Math.floor(players) - 1);
// 合作多給的靈感：每多一個真人隊友，打贏多 coopInsp；比較強的怪物多 rankInsp
export const fightWinInsp = (players, rank = 1) => NUM.fight.coopInsp * Math.max(0, Math.floor(players) - 1) + NUM.fight.rankInsp[fightRankOf(rank) - 1];
// 逃跑成功的機率（百分比）
export const fightFleeChance = fight => (fight.boss ? NUM.fight.fleeBoss : NUM.fight.flee);
function fiSize(fight) { return { pepes: fight.seats.reduce((n, s) => n + s.pepes.length, 0), players: fight.seats.filter(s => !s.helper).length }; }

// 抽下一招、點一個人。hit 可以點到館方助手，理智類的只點真人
function fiIntent(fight) {
  const foe = fightFoeOf(fight);
  const moves = (fight.phase === 2 && foe.moves2) || foe.moves;
  const total = moves.reduce((n, m) => n + (m.w || 1), 0);
  let x = RNG() * total, mv = moves[moves.length - 1];
  for (const m of moves) { x -= m.w || 1; if (x < 0) { mv = m; break; } }
  let to = null;
  if (mv.kind === "hit" || mv.kind === "scare") {
    const pool = fight.seats.filter(s => !s.out && !s.ghost && fightUp(s).length && (mv.kind === "hit" || !s.helper));
    to = pool.length ? pool[Math.min(pool.length - 1, Math.floor(RNG() * pool.length))].id : null;
  }
  return { move: mv.id, kind: mv.kind, to };
}
const fiMove = fight => { const foe = fightFoeOf(fight); return ((fight.phase === 2 && foe.moves2) || foe.moves).find(m => m.id === fight.intent.move) || null; };

// 開打。o.pressure ＝全隊理智壓力的級數（0～3）；o.rest ＝這一層是不是第一次走（躺平、毛帽才能回理智）
export function fightStart(foeId, seats, o = {}) {
  const custom = foeId && typeof foeId === "object" ? foeId : null; // 每天的內容寫的怪物：整份傳進來（要先過 fightFoeCheck）
  if (custom && fightFoeCheck(custom).length) return null;
  const foe = custom || fightFoe(foeId);
  if (!foe || !Array.isArray(seats) || !seats.some(s => !s.helper && s.pepes.length)) return null;
  const lv = clampN(Math.floor(+o.pressure || 0), 0, 3);
  const rank = foe.boss ? 1 : fightRankOf(o.rank);
  const fight = { foe: foe.id, boss: !!foe.boss, rank, tap: false, phase: 1, phases: foe.hp2 ? 2 : 1, hp: 0, hpMax: 0, round: 1, weak: false, cheer: 0, rest: !!o.rest, lv, seats, intent: null, over: null, last: null };
  if (custom) fight.custom = custom;
  seats.forEach(s => { s.used = {}; s.out = false; s.ghost = !s.pepes.length; s.pepes.forEach(p => { p.down = false; p.power = memberPower(p, foe); }); });
  const z = fiSize(fight);
  // 膽量：這一趟帶進來的（接合作流程的那一步會傳）照用；沒有就照人數給
  seats.forEach(s => { if (!s.helper) s.brave = typeof s.brave === "number" && Number.isFinite(s.brave) ? Math.max(0, s.brave) : fightCourage(z.players); });
  fight.hpMax = fight.hp = fightHp(foe.hp, z.pepes, z.players, lv, rank);
  fight.intent = fiIntent(fight);
  return fight;
}

// 看穿、安撫的成功率（百分比）
export const fightSeeChance = s => clampN(Math.max(s.skills.偵查 || 0, s.skills.神秘學 || 0) + NUM.fight.seeMod, 5, 95);
export const fightCalmChance = s => clampN((s.skills.說服 || 0) + NUM.fight.calmMod, 5, 95);
// 推會扣多少：[最少, 最多]。mode："crown" 骰子當最大、"tentacle" 強度乘倍
export function fightPushRange(fight, s, mode = "", bonus = 0) {
  const F = NUM.fight, top = maxExpr(F.die);
  const base = fightPower(s) * (mode === "tentacle" ? F.tentacleMult : 1) + (fight.cheer || 0) + bonus;
  const mult = fight.weak && !s.helper ? F.weakMult : 1;
  const tap = fight.tap && !s.helper ? F.tap.great : 0; // 這回合可以按時機：最多再多這麼多
  return [Math.round((base + (mode === "crown" ? top : 1)) * mult), Math.round((base + top + tap) * mult)];
}

// 這個人現在可以選什麼。每一項：{ act, ok, why（不能選的原因）, lo、hi（推會扣多少）, chance（成功率）}
// 畫面把這些直接寫在按鈕上（規劃第八節：按之前就看得到會發生什麼）
export function fightOptions(fight, id) {
  const s = fight && fightSeatOf(fight, id);
  if (!s || fight.over || s.helper || s.out) return [];
  if (s.ghost) return [{ act: "point", ok: !s.used.point && !fight.weak, why: s.used.point ? "這場指過了" : fight.weak ? "弱點已經找到了" : "" }];
  const out = [];
  const pr = fightPushRange(fight, s);
  out.push({ act: "push", ok: true, lo: pr[0], hi: pr[1], tap: !!fight.tap });
  out.push({ act: "see", ok: !fight.weak, why: fight.weak ? "弱點已經找到了" : "", chance: fightSeeChance(s) });
  out.push({ act: "calm", ok: true, chance: fightCalmChance(s) });
  out.push({ act: "guard", ok: true });
  Object.keys(FIGHT_MOVES).forEach(m => {
    if (!fightHasMove(s, m)) return;
    const o = { act: m, move: true, ok: !s.used[m], why: s.used[m] ? "這場用過了" : "" };
    if ((m === "rest" || m === "beanie") && !fight.rest && o.ok) { o.ok = false; o.why = "這壹層回過了"; }
    if (m === "crown" || m === "tentacle") { const r = fightPushRange(fight, s, m); o.lo = r[0]; o.hi = r[1]; }
    out.push(o);
  });
  out.push({ act: "flee", ok: true, chance: fightFleeChance(fight) }); // 逃跑：離開這一場，要一半以上的人一起選
  out.push({ act: "retreat", ok: true });                              // 撤退：自己回地面
  return out;
}

// 一回合。picks ＝ { 帳號 id: { act, for（擋、棒球帽要幫誰，可以不寫）} }
// 回傳 { ok, fight, events: [...照發生的順序], fx: { id: { san 扣多少, gain 回多少, downs: [倒下的 key], ticks: [用到的技能] } } }
export function fightRound(fight, picks) {
  if (!fight || fight.over) return { ok: false, reason: "這壹場已經結束了" };
  const F = NUM.fight, ev = [], fx = {};
  const fxOf = id => fx[id] || (fx[id] = { san: 0, brave: 0, gain: 0, downs: [], ticks: [] });
  // 扣理智：膽量先擋，擋不完的才真的扣。回傳真的扣了多少
  const lose = (s, n) => { const a = Math.min(Math.max(0, s.brave || 0), n); s.brave = (s.brave || 0) - a; const x = fxOf(s.id); x.brave += a; x.san += n - a; s.san -= n - a; return n - a; };
  const foe = fightFoeOf(fight);
  const acts = {};
  // 每個人選的：不能選的、沒選的都當「擋」
  fight.seats.forEach(s => {
    if (s.helper) { if (!s.out && fightUp(s).length) acts[s.id] = { act: "push" }; return; }
    if (s.out) return;
    const p = (picks && picks[s.id]) || null, opts = fightOptions(fight, s.id);
    const hit = p && opts.find(o => o.act === p.act && o.ok);
    if (hit) acts[s.id] = { act: p.act, for: typeof p.for === "string" && fightSeatOf(fight, p.for) ? p.for : null, tap: fight.tap ? (p.tap === 2 ? 2 : p.tap === 1 ? 1 : 0) : 0 };
    else if (!s.ghost) { acts[s.id] = { act: "guard", for: null, auto: true }; ev.push({ t: "auto", id: s.id }); }
  });
  const doing = act => fight.seats.filter(s => acts[s.id] && acts[s.id].act === act);
  const actingBefore = fightActors(fight).length;
  // 逃跑：一半以上的人選了才擲；成功就離開這一場（沒有獎勵），這回合怪物打不到
  const fleers = doing("flee");
  if (fleers.length) {
    const enough = fleers.length * 2 >= actingBefore, target = fightFleeChance(fight);
    const roll = enough ? rollD100().total : null, ok = enough && roll <= target;
    ev.push({ t: "flee", ids: fleers.map(s => s.id), enough, roll, target, ok });
    if (ok) { fight.over = "flee"; fight.intent = null; fight.cheer = 0; fight.tap = false; ev.push({ t: "over", over: "flee" }); return { ok: true, fight, events: ev, fx, foeActed: false }; }
  }
  // 撤：先走，怪物這回合打不到
  doing("retreat").forEach(s => { s.out = true; ev.push({ t: "retreat", id: s.id }); });
  // 招式
  let bonus = 0, cheerNext = 0;
  const shield = {}, firm = {}, guard = {};
  doing("point").forEach(s => { s.used.point = true; fight.weak = true; ev.push({ t: "point", id: s.id }); });
  doing("wizard").forEach(s => { s.used.wizard = true; bonus += F.wizard; ev.push({ t: "move", id: s.id, move: "wizard", n: F.wizard }); });
  doing("cheer").forEach(s => { s.used.cheer = true; cheerNext += F.cheer; ev.push({ t: "move", id: s.id, move: "cheer", n: F.cheer }); });
  doing("squat").forEach(s => { s.used.squat = true; firm[s.id] = true; ev.push({ t: "move", id: s.id, move: "squat" }); });
  doing("cap").forEach(s => { s.used.cap = true; shield[acts[s.id].for || s.id] = s.id; ev.push({ t: "move", id: s.id, move: "cap", for: acts[s.id].for || s.id }); });
  ["rest", "beanie"].forEach(m => doing(m).forEach(s => { s.used[m] = true; const n = rollExpr(F.rest).total; fxOf(s.id).gain += n; s.san += n; ev.push({ t: "move", id: s.id, move: m, n }); }));
  // 看穿
  doing("see").forEach(s => {
    const target = fightSeeChance(s), roll = rollD100().total, ok = roll <= target;
    const skill = (s.skills.偵查 || 0) >= (s.skills.神秘學 || 0) ? "偵查" : "神秘學";
    if (ok) { fight.weak = true; fxOf(s.id).ticks.push(skill); }
    ev.push({ t: "see", id: s.id, skill, roll, target, ok });
  });
  // 安撫：成功的人數決定怪物這一招變弱還是取消；每成功一次順便減一點壓力
  let calmed = 0;
  doing("calm").forEach(s => {
    const target = fightCalmChance(s), roll = rollD100().total, ok = roll <= target;
    if (ok) { calmed++; fight.hp -= F.calmHp; fxOf(s.id).ticks.push("說服"); fight.last = s.id; }
    ev.push({ t: "calm", id: s.id, roll, target, ok, n: ok ? F.calmHp : 0 });
  });
  // 擋
  doing("guard").forEach(s => { guard[s.id] = acts[s.id].for || s.id; if (!acts[s.id].auto) ev.push({ t: "guard", id: s.id, for: guard[s.id] }); });
  // 推（含皇冠、觸手帽）
  ["push", "crown", "tentacle"].forEach(a => doing(a).forEach(s => {
    if (!fightUp(s).length) return;
    if (a !== "push") s.used[a] = true;
    const die = a === "crown" ? maxExpr(F.die) : rollExpr(F.die).total;
    const tap = s.helper ? 0 : [0, F.tap.good, F.tap.great][acts[s.id].tap || 0];
    const base = fightPower(s) * (a === "tentacle" ? F.tentacleMult : 1) + (fight.cheer || 0) + bonus + tap;
    const weak = fight.weak && !s.helper;
    const n = Math.max(0, Math.round((base + die) * (weak ? F.weakMult : 1)));
    fight.hp -= n;
    if (!s.helper) fight.last = s.id;
    const e = { t: "push", id: s.id, mode: a, die, n, weak, tap };
    if (a === "tentacle") { const loss = rollExpr(F.tentacleSan).total; e.san = lose(s, loss); e.brave = loss - e.san; }
    ev.push(e);
  }));
  // 壓到零：過了，或進第二階段（這回合怪物不出招）
  let acted = false;
  if (fight.hp <= 0) {
    if (fight.phase < fight.phases) {
      const z = fiSize(fight);
      fight.phase = 2; fight.weak = false;
      fight.hpMax = fight.hp = fightHp(foe.hp2, z.pepes, z.players, fight.lv, fight.rank);
      ev.push({ t: "phase", phase: 2, hp: fight.hp });
    } else { fight.hp = 0; fight.over = "win"; ev.push({ t: "win", last: fight.last }); }
  } else {
    // 怪物出招
    const mv = fiMove(fight), it = fight.intent;
    const need = Math.max(1, Math.ceil(actingBefore / 2));
    const cancel = calmed >= need, soft = calmed > 0 && !cancel;
    acted = true;
    const half = n => Math.ceil(n / 2);
    const sanHit = (s, n, guarded) => {
      let loss = n + (fight.lv >= F.pressureSan ? 1 : 0) + F.rankSan[fightRankOf(fight.rank) - 1];
      if (guarded) loss = half(loss);
      if (soft) loss = half(loss);
      return lose(s, loss);
    };
    if (!mv || cancel) ev.push({ t: "foe", move: it.move, kind: it.kind, cancel: true });
    else if (mv.kind === "grow") {
      const n = soft ? half(mv.n) : mv.n;
      fight.hp = Math.min(fight.hpMax, fight.hp + n);
      ev.push({ t: "foe", move: mv.id, kind: "grow", n, soft });
    } else if (mv.kind === "all") {
      const hits = [];
      fightActors(fight).forEach(s => {
        if (shield[s.id]) { hits.push({ id: s.id, blocked: shield[s.id] }); return; }
        hits.push({ id: s.id, san: sanHit(s, rollExpr(mv.san).total, guard[s.id] === s.id) });
      });
      ev.push({ t: "foe", move: mv.id, kind: "all", hits, soft });
    } else {
      // 點一個人：有人幫他擋就打到擋的人身上
      let t = it.to ? fightSeatOf(fight, it.to) : null;
      const e = { t: "foe", move: mv.id, kind: mv.kind, to: it.to, soft };
      if (!t || t.out || t.ghost) e.miss = true;
      else if (shield[t.id]) e.blocked = shield[t.id];
      else {
        const helper = fight.seats.find(s => s.id !== t.id && guard[s.id] === t.id && !s.out && !s.ghost);
        if (helper) { e.cover = helper.id; t = helper; }
        const guarded = !!helper || guard[t.id] === t.id;
        e.hit = t.id;
        if (mv.kind === "scare") e.san = sanHit(t, rollExpr(mv.san).total, guarded);
        else if (firm[t.id]) e.blocked = t.id;
        else if ((guarded && RNG() < F.guardDodge) || (soft && RNG() < F.softDodge)) e.dodge = true;
        else {
          const up = fightUp(t);
          if (up.length) { const p = up[Math.min(up.length - 1, Math.floor(RNG() * up.length))]; p.down = true; e.down = p.key; if (!t.helper) fxOf(t.id).downs.push(p.key); }
        }
      }
      ev.push(e);
    }
  }
  // 倒下：帶的佩佩都倒了，或理智用完
  fight.seats.forEach(s => {
    if (s.helper || s.out || s.ghost) return;
    if (!fightUp(s).length || s.san <= 0) { s.ghost = true; ev.push({ t: "ghost", id: s.id, why: s.san <= 0 ? "san" : "down" }); }
  });
  fight.cheer = cheerNext;
  if (!fight.over) {
    const humans = fight.seats.filter(s => !s.helper);
    if (!fightActors(fight).length) fight.over = humans.some(s => s.out) ? "retreat" : "lose";
    else if (fight.round >= F.maxRounds) fight.over = "away";
    if (fight.over) ev.push({ t: "over", over: fight.over });
  }
  if (!fight.over) {
    fight.round++; fight.intent = fiIntent(fight);
    // 下一回合可不可以按時機（「有時候 B」）：這回合剛找到弱點一定可以，不然照機率
    const found = ev.some(e => (e.t === "see" && e.ok) || e.t === "point");
    fight.tap = RNG() < F.tap.chance || found;
  } else { fight.intent = null; fight.tap = false; }
  return { ok: true, fight, events: ev, fx, foeActed: acted };
}

// 打完：倒下的佩佩，每一隻有 NUM.fight.injure 的機率真的受傷（要休息幾天由接的那一步用 injureDaysOf 算）
export function fightAfter(fight) {
  const out = {};
  fight.seats.forEach(s => {
    if (s.helper) return;
    const injured = [], fine = [];
    s.pepes.forEach(p => { if (p.down) (RNG() < NUM.fight.injure ? injured : fine).push(p.key); });
    out[s.id] = { injured, fine, ghost: !!s.ghost, out: !!s.out };
  });
  return out;
}
