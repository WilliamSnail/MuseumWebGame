// ================================================================
//  合作地下收藏庫的底層：房間、隊伍、傷害與回血、結算、存檔修復……
//  coop.js、coop/fun.js、coop/fight.js、coop/route.js 都要用，所以放在這裡（不 import 它們）。搬自原本的 coop.js。
// ================================================================
import { NUM } from "../core/config.js";
import { applySan, cellarFloor, clampN, fromKey, fullPick, gainSan, maxSan, pepeKey, understandCheck } from "../core/logic_base.js";
import { skillOf, traitHits, traitTag } from "../core/legacy.js";
import { eventRunFix } from "../story/events.js";
import { trialById } from "../core/shop.js";
import { cellarAdvance, limitedFx, teamHas, teamPower, understandLine } from "../core/systems.js";
import { gainQuirk, startBout } from "../core/logic.js";

// ---------- 數值（config.js 別人也在改，合作的數值先放這裡；模擬：node test/sim/sim_coop.cjs） ----------
export const COOP = {
  maxPlayers: 4,          // 一隊最多幾個人（一個人也能下去）
  eachMin: 1, eachMax: 2, // 每個人帶幾隻
  teamMin: 3,             // 隊伍至少幾隻：不夠由館方助手補
  teamMax: 6,             // 隊伍最多幾隻（舞台放得下 6 隻；4 個人只能有兩個人帶 2 隻）
  helperName: "館方助手", // 草稿，之後搬到 systems_text.js
  // 館方助手的佩佩：稀有（強度 2）、俄國8+9（不剋別人、也不被剋），強度很穩，不會太強
  helpers: [
    { 稀有度: "稀有", 心情: "俄國8+9", 顏色: "黃", 帽子: "沒有", 姿勢: "站著" },
    { 稀有度: "稀有", 心情: "俄國8+9", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" },
  ],
  // 強度門檻照隊伍放大：門檻 ＋（門檻 − dice）×（隻數 − 3）÷ 3 × scale ＋ perPlayer ×（人數 − 1），最後四捨五入
  //   3 隻、1 個人跟單人一樣。骰子（1D10，平均 5.5）不會因為人多變大，所以門檻裡「骰子那一份」不放大，只放大「要靠佩佩湊的那一份」。
  //   規劃寫的「門檻 × 隻數 ÷ 3」連骰子那份也放大，6 隻的時候比單人難很多。
  //   perPlayer：每個人都挑自己收藏裡最強的，人越多隊伍越強（3 個人各帶 1 隻，比 1 個人帶 3 隻強），所以每多一個人門檻再 +0.5。
  //   模擬（node test/sim/sim_coop.cjs）看過：2–4 人的強度勝算跟單人差不多（11-08 的日誌）。
  baseTeam: 3, dice: 5.5, scale: 1, perPlayer: 0.5,
  tentacleSan: "1D3",     // 觸手帽：每次強度檢定，帶牠的人扣這麼多理智（跟單人的一樣，systems.js 的 cellarResolve 寫死 1D3）
  // 全隊的理智壓力（好玩的機制 1）：看「全隊平均理智」（幽靈算 0、館方助手不算）。
  //   below ＝平均理智低於這個就是這一級；power ＝強度門檻多幾點；skill ＝技能檢定加減；failSan ＝失敗的人多扣幾點理智
  pressure: [
    { below: 40, lv: 1, power: 1, skill: -5, failSan: 0 },
    { below: 30, lv: 2, power: 2, skill: -10, failSan: 1 },
    { below: 20, lv: 3, power: 3, skill: -15, failSan: 2 },
  ],
  // 伺服器走一趟的時間（shared/coop/flow.js，docs/規劃/多人實作.md 的 M4）：投票 30 秒、棄權連 3 次離隊、斷線 60 秒
  voteMs: 30000, resultMs: 20000, floorMs: 30000, resumeMs: 15000,
  fightMs: 25000,          // 打怪物：每回合選行動的時間（地下室改版，決定 0067）
  maxSkips: 3,             // 連幾次沒投票算掛機、自動離隊
  offlineMs: 60000,        // 斷線多久才移出隊伍（伺服器自己看 /status 再確認）
  staleMs: 600000,         // 這麼久沒有人動：這一趟算結束（大家都走了，回來才收）
  dailyRewarded: 3,        // 每個帳號每天前幾趟有獎勵（決定 0020）
  // 每個人看到的不一樣（機制 2）：門上三個記號，每個人看到壹部分。選到三個都對上的選項有好處
  clue: { seekSkill: 50, power: 2, skill: 15, san: 2, insp: 1,   // seekSkill：偵查到這麼高多看到壹個；power：門檻 −2；skill：技能 +15；san：理智少扣 2；insp：過了多 1 靈感
    halluc: [{ below: 40, chance: 0.5 }, { below: 25, chance: 1 }] }, // 理智低於這個，有這個機率多看到壹個不存在的記號
  // 說的話變形（機制 4）：stutter ＝結巴的機率；swap ＝變成別句話的機率
  warp: [{ below: 40, stutter: 0.3, swap: 0.1 }, { below: 25, stutter: 0.5, swap: 0.3 }, { below: 12, stutter: 0.5, swap: 0.5 }],
  sayGapMs: 900,           // 短句、叫聲：壹句話之後要等多久（送太快會擋）
  typeGapMs: 2000,         // 自由打字：兩句之間要等多久（決定 0020、0036）
  // 湊證據（機制 3）：每間最多掉一個。win ＝過了掉的機率；lose ＝沒過掉的機率；理智低於 fakeBelow 的人找到的，有 fakeChance 是假的
  //   need ＝湊幾個才能猜；insp ＝猜對的靈感（＋層數 × perFloor）；wrongSan ＝猜錯全隊擲理智
  truth: { win: 1, lose: 0.5, fakeBelow: 30, fakeChance: 0.4, need: 3, insp: 6, perFloor: 2, wrongSan: "1/1D4", guessMs: 40000 },
  // 房間裡有東西（機制 5）：每間一個選項；選到又沒過，多扣這麼多理智。只有留守的人看得到
  hazard: { san: "1D3" },
  // 一起搬（機制 8）：每層一件。base ＋手工藝 ÷ skillDiv ＝不手滑的機率（百分比）；helper ＝館方助手的；insp ＋層數 ＝搬回來全隊的靈感；breakSan ＝摔碎了扣的；wake ＝吵醒之後下一間多加幾級門檻
  carry: { base: 60, skillDiv: 3, helper: 70, insp: 2, breakSan: "1D3", wake: 1, ms: 25000 },
  report: { lowSan: 15, keep: 12 }, // 探險報告：理智低於這個算「差點出事」；存幾張
};

// ---------- 小工具 ----------
export const coopMember = (run, id) => run.members.find(m => m.id === id) || null;
// 還在地下的人（離隊、幽靈回到地面、留在監視器前的都不算；還在走這一層的幽靈算）
export const coopActive = run => run.members.filter(m => !m.out && !m.guard);
// 還在這一趟裡的人：地下的＋留守的（要寫回存檔、要送畫面的都是這些人）
export const coopPresent = run => run.members.filter(m => !m.out);
// 能投票、能擲骰的人：還在地下、不是幽靈
export const coopCanAct = m => !!m && !m.out && !m.ghost && !m.guard;
export const coopVoters = run => run.members.filter(coopCanAct);
// 這一趟走的「層」：一般是地下收藏庫的一層；合作試煉（決定 0041）是只有一間房的小層（那一間試煉房間）
export function coopFloorOf(run) {
  if (!run) return null;
  const t = run.trial && trialById(run.trial.id);
  return t ? { floor: t.floor, name: t.title, rooms: [t] } : cellarFloor(run.floor);
}
export const coopRoom = run => { const f = run && coopFloorOf(run); return f ? f.rooms[run.idx] || null : null; };
export function coopHelperItem(i) {
  const h = COOP.helpers[i % COOP.helpers.length];
  const key = pepeKey(fullPick(h));
  return { owner: null, helper: true, key, pick: fromKey(key), perfect: false };
}
// 隊伍：還在的人帶的佩佩（照隊員順序）＋館方助手補到 teamMin 隻
export function coopTeam(run, Ps) {
  const team = [];
  coopActive(run).forEach(m => {
    const P = Ps[m.id];
    m.keys.forEach(k => { const e = P && P.pepes[k]; team.push({ owner: m.id, helper: false, key: k, pick: fromKey(k), perfect: !!(e && e.perfect) }); });
  });
  for (let i = 0; team.length < COOP.teamMin; i++) team.push(coopHelperItem(i));
  return team;
}
// 強度門檻放大（還沒加理智壓力）：n ＝隊伍幾隻（含館方助手），players ＝幾個人
export function coopTarget(target, n, players = 1) {
  return Math.round(target + (target - COOP.dice) * (n - COOP.baseTeam) / COOP.baseTeam * COOP.scale + COOP.perPlayer * Math.max(0, players - 1));
}
// 這一趟現在的強度門檻：放大＋全隊理智壓力
export function coopTargetOf(run, target) {
  const pr = run.pressure || coopPressure(run);
  return coopTarget(target, run.team.length, coopActive(run).length) + pr.power;
}
// 全隊的理智壓力：{ avg（平均理智，四捨五入到小數一位）, lv, power, skill, failSan }
export function coopPressure(run) {
  const ms = coopActive(run);
  const avg = ms.length ? ms.reduce((n, m) => n + (m.ghost ? 0 : m.san), 0) / ms.length : 0;
  let hit = null;
  COOP.pressure.forEach(p => { if (avg < p.below && (!hit || p.lv > hit.lv)) hit = p; });
  const woke = run.woken || 0; // 搬東西摔碎了（機制 8）：下一間多一點
  return { avg: Math.round(avg * 10) / 10, lv: hit ? hit.lv : 0, power: (hit ? hit.power : 0) + woke, skill: (hit ? hit.skill : 0) - 5 * woke, failSan: hit ? hit.failSan : 0, woke };
}
// 全隊的強度：每隻佩佩的強度、帽子和姿勢的全隊加成（看整隊）沿用 teamPower；
// 小優點「力氣大」、小缺點「沒力氣」每位隊員各算各的（幽靈不算：參觀者推不動了，佩佩還在推）
export function coopPower(run, Ps, room) {
  const tp = teamPower(null, run.team, room); // 不給 P：teamPower 只算佩佩和全隊加成，優缺點下面一位一位加
  let total = tp.total;
  const notes = tp.notes.slice();
  coopVoters(run).forEach(m => {
    const P = Ps[m.id];
    if (P) traitHits(P, "power").forEach(t => { total = Math.max(0, total + t.v); notes.push(`${m.name}：${traitTag(t)}`); });
  });
  return { total, parts: tp.parts.map(x => x.s), notes };
}
// 技能檢定由誰擲：能擲的人裡面這個技能最高的；一樣高的話領隊優先，再照隊員順序
export function coopRoller(run, Ps, skill) {
  let best = null, bestV = -1;
  coopVoters(run).forEach(m => {
    const v = skillOf(Ps[m.id], skill);
    if (v > bestV || (v === bestV && m.id === run.leader)) { best = m; bestV = v; }
  });
  return best ? best.id : null;
}
// 領隊每間輪一個人：照隊員順序找下一位能投票的
export function coopNextLeader(run) {
  const ms = run.members, i0 = ms.findIndex(m => m.id === run.leader);
  for (let k = 1; k <= ms.length; k++) { const m = ms[(i0 + k + ms.length) % ms.length]; if (coopCanAct(m)) { run.leader = m.id; return run.leader; } }
  run.leader = null;
  return null;
}
// 這一間每個選項的樣子（畫面寫「強度 12＋擲 1～10，要 ≥ 17」「由小明擲偵查 62%」用）
export function coopPreview(run, Ps) {
  const room = coopRoom(run);
  if (!room) return null;
  const tp = coopPower(run, Ps, room), pr = run.pressure || coopPressure(run);
  const gent = (teamHas(run.team, "帽子", "紳士帽") ? NUM.cellarFx.gent : 0) + limitedFx(run.team).skill;
  const choices = room.choices.map((c, i) => {
    const k = c.check, o = { i, type: k.type };
    if (k.type === "power") Object.assign(o, { base: k.target, target: coopTargetOf(run, k.target), power: tp.total });
    if (k.type === "skill") {
      const by = coopRoller(run, Ps, k.skill);
      Object.assign(o, { skill: k.skill, by, value: by ? clampN(skillOf(Ps[by], k.skill) + (k.mod || 0) + gent + pr.skill, 1, 99) : 0 });
    }
    if (k.type === "san") o.spec = k.spec;
    return o;
  });
  return { floor: run.floor, idx: run.idx, id: room.id, leader: run.leader, power: tp.total, parts: tp.parts, notes: tp.notes, choices };
}
// 每位隊員的理智、幽靈、壓力、房間的樣子跟 P 對齊（每一步最後叫）
export function coopSync(run, Ps) {
  run.members.forEach(m => { const P = Ps[m.id]; if (!P || m.out === "left" || m.out === "ghost") return; m.san = P.sanity; m.max = maxSan(P); m.myth = P.myth; });
  run.pressure = coopPressure(run);
  run.room = run.phase === "vote" ? coopPreview(run, Ps) : null;
  return run;
}
export function coopNewEvents(run) { const ev = {}; run.members.forEach(m => { ev[m.id] = []; }); return ev; }
export function coopFinish(run, why) { run.phase = "over"; run.over = why; run.room = null; return run; }
// 從資料庫讀回來的 run 補欄位：Realtime Database 不存空的陣列、空的物件和 null（存進去再讀出來就不見了），
// 陣列也可能變成 { 0: …, 1: … }。每一步開頭都先叫一次；整份存成 JSON 字串就不會有這個問題。
export const coopArr = v => Array.isArray(v) ? v : v && typeof v === "object" ? Object.keys(v).sort((a, b) => a - b).map(k => v[k]) : [];
export function coopFix(run) {
  if (!run || typeof run !== "object") return run;
  run.members = coopArr(run.members); run.team = coopArr(run.team); run.log = coopArr(run.log); run.cleared = coopArr(run.cleared);
  if (!run.used || typeof run.used !== "object") run.used = {};
  ["over", "next", "leader", "last", "room", "pressure", "deadline", "report", "summary"].forEach(k => { if (run[k] === undefined) run[k] = null; });
  if (!run.fresh || typeof run.fresh !== "object") run.fresh = {};
  if (!run.votes || typeof run.votes !== "object") run.votes = {};
  if (!run.acks || typeof run.acks !== "object") run.acks = {};
  run.step = run.step || 0;
  run.trial = run.trial && typeof run.trial === "object" && trialById(run.trial.id) ? run.trial : null; // 合作試煉（決定 0041）：{ id, skill, date, elig, fx }
  if (run.trial) { if (!run.trial.elig || typeof run.trial.elig !== "object") run.trial.elig = {}; if (!run.trial.fx || typeof run.trial.fx !== "object") run.trial.fx = null; }
  coopFightFix(run); // 打怪物（地下室改版）：run.gate、run.gateDone、run.fight
  coopRouteFix(run); // 地圖選路（地下室改版）：run.cmap、run.node、run.path
  run.event = eventRunFix(run.event); // 限時活動（決定 0041）：開始那一刻在活動內，這一趟就照活動算到走完
  run.members.forEach(m => {
    m.keys = coopArr(m.keys); m.ghost = !!m.ghost; m.guard = !!m.guard; m.out = m.out || null; m.rewarded = m.rewarded !== false; m.skips = m.skips || 0;
    if (!m.used || typeof m.used !== "object") m.used = {};
    m.got = Object.assign({ insp: 0, sanLoss: 0, sanGain: 0, myth: 0, rooms: 0 }, m.got);
    m.got.injured = coopArr(m.got.injured);
  });
  run.team.forEach(it => { it.owner = it.owner || null; it.helper = !!it.helper; it.perfect = !!it.perfect; });
  return run;
}

// ---------- 扣理智之後的事（單人的畫面 lossFlow 做的，這裡同步做完、收成事件） ----------
// 歸零 → 這一位變幽靈（不拿掉，這一層走完才回到地面）；一次掉 5 點以上 → 看懂檢定 → 看懂了就瘋狂發作；
// 一天掉超過 1/5 → 怪癖。地下收藏庫不會「不由自主做一件事」（單人也是 noInvoluntary）。花心情減半要問人，合作先不做。
export function coopSanHit(P, m, loss, src, parts, ev) {
  if (!P || !m || m.ghost || !(loss > 0)) return null;
  const from = P.sanity;
  const r = applySan(P, loss, src);
  m.got.sanLoss += r.loss;
  ev.push({ type: "sanLoss", loss: r.loss, from, to: P.sanity, parts: parts || null });
  if (r.zero) { m.ghost = true; ev.push({ type: "ghost", where: src }); return r; }
  if (r.temp) {
    const u = understandCheck(P);
    const e = { type: "understand", roll: u.roll, target: u.target, success: u.success };
    ev.push(e);
    if (u.success) {
      e.line = understandLine(P, src);
      const b = startBout(P);
      ev.push({ type: "bout", roll: b.roll, dur: b.dur, bout: b.bout });
    }
  }
  if (r.indef) { const g = gainQuirk(P); if (g) ev.push({ type: "quirk", quirk: g.quirk, from: g.from, to: g.to }); }
  return r;
}
export function coopSanGain(P, m, n, why, ev) {
  if (!P || !m || m.ghost || !(n > 0)) return 0;
  const g = gainSan(P, n);
  if (g) { m.got.sanGain += g; ev.push({ type: "sanGain", gain: g, why }); }
  return g;
}

// ---------- 走到下一間、一層走完 ----------
// 第一次走完一層的獎勵：直接叫單人的 cellarAdvance（借一個「最後一間」的 P.cellar.run 給它，算完放回原本的）。
// 這樣靈感、鑰匙、禁書、結局、P.cellar.best、floorsDone 都跟單人一模一樣；每個人各算各的「第一次」。
export function coopFloorReward(P, floor) {
  const keep = P.cellar.run, f = cellarFloor(floor);
  P.cellar.run = { floor, idx: f.rooms.length - 1, team: [], used: {}, log: [] };
  const a = cellarAdvance(P);
  P.cellar.run = keep;
  return a;
}

// ---------- 合作試煉：走完那一間，每個人各算各的 ----------
// 整層走完：每個人（還在走這一層的幽靈也算，他走過了）拿自己的第一次過關獎勵
export function coopFloorComplete(run, Ps, events) {
  const f = coopFloorOf(run);
  const floor = run.floor, rewards = {};
  run.idx = f.rooms.length - 1;
  coopActive(run).forEach(m => {
    const a = coopFloorReward(Ps[m.id], floor);
    if (a.first && a.reward && a.reward.insp) m.got.insp += a.reward.insp;
    rewards[m.id] = { first: a.first, reward: a.reward, ending: a.ending };
    events[m.id].push({ type: "floorDone", floor, first: a.first, reward: a.reward, ending: a.ending, next: a.next }, ...a.events);
  });
  run.cleared.push(floor);
  run.next = cellarFloor(floor + 1) ? floor + 1 : null;
  run.phase = "floorDone";
  run.last = Object.assign({}, run.last, { floorDone: floor, rewards });
  if (run.fun && coopCanGuess(run)) run.phase = "guess"; // 湊齊三個證據：先猜（機制 3）。B5 猜完才算結束
  else if (!run.next) coopFinish(run, "done"); // B5 走完了
  coopSync(run, Ps);
  return { ok: true, run, floorDone: true, floor, next: run.next, rewards, events };
}
// 有人中途離隊：他拿到的已經寫進他的 P；他的佩佩離開隊伍、館方助手補位；領隊交給下一位
export function coopLeave(run, Ps, id) {
  const m = run && coopMember(coopFix(run), id);
  if (!m || m.out) return { ok: false, reason: "他不在隊伍裡" };
  m.out = "left";
  run.step++;
  const events = coopNewEvents(run);
  run.team = coopTeam(run, Ps);
  if (run.leader === id) coopNextLeader(run);
  if (run.phase !== "over" && !coopVoters(run).some(x => !x.npc)) coopFinish(run, "lost"); // 只剩 NPC 在地下（找 NPC 下地下，決定 0149）也算全員離開
  coopSync(run, Ps);
  return { ok: true, run, events };
}

// ---------- 機制 3：湊證據猜真相 ----------
export const coopCanGuess = run => !!(!run.trial && run.truth && !run.truth.done && run.truth.found.length >= COOP.truth.need);
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

// 從資料庫讀回來補欄位（空的陣列會不見、陣列可能變成物件）
export function coopRouteFix(run) {
  if (!run || typeof run !== "object") return run;
  if (run.cmap && typeof run.cmap === "object") {
    const m = run.cmap;
    m.rows = coopArr(m.rows).map(r => coopArr(r));
    if (!m.links || typeof m.links !== "object") m.links = {};
    Object.keys(m.links).forEach(k => { m.links[k] = coopArr(m.links[k]); });
  } else run.cmap = null;
  run.path = coopArr(run.path);
  if (run.node === undefined) run.node = null;
  if (run.chest === undefined) run.chest = null;
  if (run.rest === undefined) run.rest = null;
  return run;
}
