// ================================================================
//  合作地下收藏庫（多人版 M4）的規則：1–4 個人一隊，一起走地下收藏庫
//  翊文 11-08：
//    一隊 2–4 人、每人帶 1–2 隻（隊伍 3–6 隻）；一個人也能下去，館方助手補到至少 3 隻。
//    不限次數，獎勵每天前 3 趟（伺服器算「每天」，這裡只收每位隊員的 rewarded）；第一次過關的獎勵照舊。
//    好玩的機制這次做 1（全隊的理智壓力）；2、4、6 先把位子留好：viewFor（每個人看到的）、ghost（理智歸零的隊員）。
//  純函式、同步（中間沒有 await）：伺服器每一步之前 setRng(這一隊的骰子)，算完換回來（docs/多人實作.md 第四節）。
//  算法沿用單人的：強度 memberPower、teamPower；技能 skillCheck；理智 sanCheck、applySan；
//    第一次走完一層的獎勵直接叫 cellarAdvance。單人的地下照舊用 logic3.js 的函式，這個檔不改它們。
//
//  伺服器怎麼用：
//    members ＝ [{ id: 帳號 id, name: 暱稱, P: 他的存檔（現在那位參觀者）, keys: [帶的佩佩 key，1–2 個], rewarded: 今天還拿不拿獎勵 }]
//    第一個人是隊長（第一間的領隊）。
//    const s = startCoop(members, 層數)          → { ok, run, events } 或 { ok: false, reason, who }
//    Ps ＝ { 隊員 id: 他的 P }                    之後每一步都要傳。run 裡沒有 P，可以直接存、直接送給畫面。
//    coopResolve(run, Ps, votes)                 votes ＝ { 隊員 id: 選項的號碼 或 "retreat" }；開票、擲骰、結果套到每個人
//    coopAdvance(run, Ps)                        走到下一間；整層走完給每個人第一次過關的獎勵
//    coopContinue(run, Ps)                       走完一層之後往下一層（幽靈先回到地面）
//    coopEnd(run, Ps, "retreat")                 撤退或回到地面；回傳每個人這一趟拿了什麼、誰變幽靈
//    coopLeave(run, Ps, id)                      有人中途離隊（斷線太久、掛機）
//    viewFor(run, id)                            送給這位隊員的樣子
//  每一步回傳 { ok, run, events: { 隊員 id: [事件...] } }；不行就 { ok: false, reason }。
//  骰子：伺服器每一步之前 setRng(mulberry32(hashStr(隊伍 id ＋ ":" ＋ run.step)))，算完 setRng(null)。run.step 每一步加一。
//  run 從資料庫讀回來可以直接傳（每一步開頭會先 coopFix 補回 Realtime Database 弄掉的空陣列、空物件）。
//  run.phase：vote（等大家投票）→ result（看結果）→ vote …… → floorDone（這一層走完）→ over（結束，run.over 寫為什麼）
// ================================================================
import { NUM } from "./config.js";
import { addDays, addMyth, applySan, clampN, fromKey, fullPick, gainQuirk, gainSan, isFree, maxSan, pepeKey, pickOne, rollExpr, sanCheck, startBout, understandCheck } from "./logic.js";
import { cellarAdvance, cellarFloor, injureDaysOf, skillCheck, skillOf, teamHas, teamPower, understandLine } from "./logic3.js";
import { cellarDarkLoss, traitHits, traitTag } from "./legacy.js";
import { eventRunFix } from "./events.js";
import { trialById, trialState, trialWin } from "./shop.js";
import { coopCanGuess, coopCarryDue, coopCheckFun, coopFilterView, coopPlanRoom, coopRoomDone, coopStart } from "./coop_fun.js";
import { coopFightFix, coopFightStart, coopFightView, coopGateDue } from "./coop_fight.js";
import { fightFoesOf } from "./cellar_fight.js";
import { coopRouteBack, coopRouteBegin, coopRouteFix, coopRouteMapView, coopRouteOn } from "./coop_route.js";

// ---------- 數值（config.js 別人也在改，合作的數值先放這裡；模擬：node test/sim_coop.cjs） ----------
export const COOP = {
  maxPlayers: 4,          // 一隊最多幾個人（一個人也能下去）
  eachMin: 1, eachMax: 2, // 每個人帶幾隻
  teamMin: 3,             // 隊伍至少幾隻：不夠由館方助手補
  teamMax: 6,             // 隊伍最多幾隻（舞台放得下 6 隻；4 個人只能有兩個人帶 2 隻）
  helperName: "館方助手", // 草稿，之後搬到 content3.js
  // 館方助手的佩佩：稀有（強度 2）、俄國8+9（不剋別人、也不被剋），強度很穩，不會太強
  helpers: [
    { 稀有度: "稀有", 心情: "俄國8+9", 顏色: "黃", 帽子: "沒有", 姿勢: "站著" },
    { 稀有度: "稀有", 心情: "俄國8+9", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" },
  ],
  // 強度門檻照隊伍放大：門檻 ＋（門檻 − dice）×（隻數 − 3）÷ 3 × scale ＋ perPlayer ×（人數 − 1），最後四捨五入
  //   3 隻、1 個人跟單人一樣。骰子（1D10，平均 5.5）不會因為人多變大，所以門檻裡「骰子那一份」不放大，只放大「要靠佩佩湊的那一份」。
  //   規劃寫的「門檻 × 隻數 ÷ 3」連骰子那份也放大，6 隻的時候比單人難很多。
  //   perPlayer：每個人都挑自己收藏裡最強的，人越多隊伍越強（3 個人各帶 1 隻，比 1 個人帶 3 隻強），所以每多一個人門檻再 +0.5。
  //   模擬（node test/sim_coop.cjs）看過：2–4 人的強度勝算跟單人差不多（11-08 的日誌）。
  baseTeam: 3, dice: 5.5, scale: 1, perPlayer: 0.5,
  tentacleSan: "1D3",     // 觸手帽：每次強度檢定，帶牠的人扣這麼多理智（跟單人的一樣，logic3.js 的 cellarResolve 寫死 1D3）
  // 全隊的理智壓力（好玩的機制 1）：看「全隊平均理智」（幽靈算 0、館方助手不算）。
  //   below ＝平均理智低於這個就是這一級；power ＝強度門檻多幾點；skill ＝技能檢定加減；failSan ＝失敗的人多扣幾點理智
  pressure: [
    { below: 40, lv: 1, power: 1, skill: -5, failSan: 0 },
    { below: 30, lv: 2, power: 2, skill: -10, failSan: 1 },
    { below: 20, lv: 3, power: 3, skill: -15, failSan: 2 },
  ],
  // 伺服器走一趟的時間（shared/coop_flow.js，docs/多人實作.md 的 M4）：投票 30 秒、棄權連 3 次離隊、斷線 60 秒
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
// 這位隊員帶的佩佩有沒有某個選項（棒球帽、觸手帽是誰的）
export const coopOwns = (run, id, cat, v) => run.team.some(it => it.owner === id && it.pick[cat] === v);
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
  const gent = teamHas(run.team, "帽子", "紳士帽") ? 10 : 0;
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

// ---------- 建一趟 ----------
// 檢查。層數看每位自己的 P.cellar.best（每個人都要走過上一層）：
//   鑰匙、禁書、結局是照順序一層一層拿的，跟單人一樣；老手還是可以陪新手走淺的層（老手只拿「再走一次」的靈感）。
export function canStartCoop(members, floor, trial) {
  if (!Array.isArray(members) || !members.length || members.length > COOP.maxPlayers) return { ok: false, reason: `一隊 1–${COOP.maxPlayers} 個人` };
  if (!cellarFloor(floor)) return { ok: false, reason: "這一層還沒開放" };
  const ids = new Set();
  let total = 0;
  if (trial && members.some(m => m && m.guard)) return { ok: false, reason: "試煉房間只有壹間，沒有人留守" };
  if (members.filter(m => m && m.guard).length > 1) return { ok: false, reason: "只能有壹個人留守" };
  if (members.every(m => m && m.guard)) return { ok: false, reason: "要有人下去" };
  for (const m of members) {
    const who = m && m.id;
    if (!m || typeof m.id !== "string" || !m.id || ids.has(m.id)) return { ok: false, reason: "隊員的帳號重複了", who };
    ids.add(m.id);
    const P = m.P, name = m.name || m.id;
    if (!P || !P.pepes || !P.cellar) return { ok: false, reason: `${name} 的存檔讀不到`, who };
    if (isFree(P)) return { ok: false, reason: `${name} 在自由模式，不能一起下去`, who };
    if (!P.day) return { ok: false, reason: `${name} 的存檔還沒有「今天」（伺服器先跑 ensureDay）`, who };
    if (P.sanity <= 0) return { ok: false, reason: `${name} 的理智已經歸零了`, who };
    if (m.guard) continue; // 留守的人不下去：不帶佩佩、也不看他走到哪一層
    if (floor > (P.cellar.best || 0) + 1) return { ok: false, reason: `${name} 要先走過 B${floor - 1}`, who };
    const keys = Array.isArray(m.keys) ? m.keys : [];
    if (keys.length < COOP.eachMin || keys.length > COOP.eachMax || new Set(keys).size !== keys.length) return { ok: false, reason: `${name} 要帶 ${COOP.eachMin}–${COOP.eachMax} 隻不一樣的佩佩`, who };
    for (const k of keys) {
      if (!P.pepes[k] || !fromKey(k)) return { ok: false, reason: `${name} 的收藏裡沒有這隻佩佩`, who };
      if (P.injured[k]) return { ok: false, reason: `${name} 帶的佩佩受傷了，還不能下去`, who };
    }
    total += keys.length;
  }
  if (total > COOP.teamMax) return { ok: false, reason: `隊伍最多 ${COOP.teamMax} 隻（現在 ${total} 隻）` };
  return { ok: true, total, helpers: Math.max(0, COOP.teamMin - total) };
}
// opt.trial：{ id, date }＝走的是試煉房間（決定 0041）：只有那一間，過了每個人各算各的技能成長；opt.today 之外要有 date（算「這週拿過了沒」用的那天）
// opt.event：開始那一刻正在進行的限時活動（events.js 的 eventRunOf；沒有就是 null）。opt.fun：打開好玩的機制（線索、幻覺、證據、留守的地圖、搬東西、報告）；伺服器都開，舊的測試、模擬不開就跟原本一模一樣。opt.id：這一趟的編號
export function startCoop(members, floor, opt = {}) {
  const tr = opt.trial ? trialById(opt.trial.id) : null;
  if (opt.trial && !tr) return { ok: false, reason: "沒有這間試煉房間" };
  if (tr) floor = tr.floor; // 試煉房間在哪一層就在哪一層
  const can = canStartCoop(members, floor, !!tr);
  if (!can.ok) return can;
  const Ps = {};
  const first = members.find(m => !m.guard);
  const run = {
    v: 1, id: opt.id || null, fun: !!opt.fun, gate: !!opt.gate && !tr, gateDone: {}, fight: null, day: opt.day || null, cmap: null, node: null, path: [], chest: null, rest: null, event: eventRunFix(opt.event), trial: null, step: 0, floor, idx: 0, phase: "vote", over: null, next: null,
    leader: first.id, votes: {}, acks: {}, deadline: null, report: null,
    members: members.map(m => {
      Ps[m.id] = m.P;
      return { id: m.id, name: m.name || m.id, keys: m.guard ? [] : m.keys.slice(), rewarded: m.rewarded !== false, job: m.P.job || null, vid: m.P.vid || null, guard: !!m.guard, skips: 0,
        ghost: false, out: null, san: m.P.sanity, max: maxSan(m.P), myth: m.P.myth, startSan: m.P.sanity, used: {},
        got: { insp: 0, sanLoss: 0, sanGain: 0, myth: 0, injured: [], rooms: 0 } };
    }),
    team: [], used: {}, pressure: null, room: null, last: null, log: [], cleared: [],
  };
  if (tr) {
    // 每個人這間試煉現在算不算（開始前先給畫面看：資格不合的人可以陪打，但不拿成長）；過關那一刻會再查一次
    const date = opt.trial.date || (members[0].P.day && members[0].P.day.date);
    run.trial = { id: tr.id, skill: tr.skill, date, elig: {}, fx: null };
    members.forEach(m => { const st = trialState(m.P, tr.id, date); run.trial.elig[m.id] = { state: st.state, reason: st.reason }; });
  }
  run.team = coopTeam(run, Ps);
  if (run.fun) coopStart(run, Ps);
  if (coopRouteOn(run)) coopRouteBegin(run, Ps); // 地下室改版：先選路（coop_route.js）
  members.forEach(m => { if (!m.guard && m.P.visit) m.P.visit.deepest = Math.max(m.P.visit.deepest || 0, floor); }); // 走到地下第幾層（歷任參觀者牆），跟 startCellar 一樣
  coopSync(run, Ps);
  return { ok: true, run, events: coopNewEvents(run) };
}

// ---------- 投票 ----------
// votes ＝ { 隊員 id: 選項的號碼（0 開始）或 "retreat"（撤退） }；沒投、投了不存在的選項、幽靈投的，都算棄權。
// 多數決；平手由這一間的領隊決定：tieBreak（伺服器另外問領隊的）→ 領隊自己投的 → 平手裡的「安全」選項 → 平手裡號碼最小的。
// 大家都棄權：所有選項算平手（不會自己撤退）。
export function coopTally(run, votes, tieBreak) {
  const room = coopRoom(run), n = room ? room.choices.length : 0;
  const norm = v => {
    if (v === "retreat") return "retreat";
    const x = typeof v === "string" && /^\d+$/.test(v) ? +v : v;
    return Number.isInteger(x) && x >= 0 && x < n ? x : null;
  };
  const cast = {}, abstain = [], count = new Map();
  coopVoters(run).forEach(m => {
    const v = norm(votes ? votes[m.id] : undefined);
    if (v === null) { abstain.push(m.id); return; }
    cast[m.id] = v; count.set(v, (count.get(v) || 0) + 1);
  });
  const top = Math.max(0, ...count.values());
  let tied = top ? [...count.keys()].filter(v => count.get(v) === top) : room.choices.map((c, i) => i);
  tied = tied.sort((a, b) => (a === "retreat") - (b === "retreat") || a - b);
  let pick, by;
  if (tied.length === 1) { pick = tied[0]; by = "majority"; }
  else {
    const tb = norm(tieBreak), lv = run.leader in cast ? cast[run.leader] : null;
    const safe = tied.find(v => v !== "retreat" && room.choices[v].check.type === "none");
    if (tb !== null && tied.includes(tb)) { pick = tb; by = "leader"; }
    else if (lv !== null && tied.includes(lv)) { pick = lv; by = "leader"; }
    else if (safe !== undefined) { pick = safe; by = "safe"; }
    else { pick = tied[0]; by = "first"; }
  }
  return { votes: cast, abstain, counts: [...count.entries()].map(([v, k]) => ({ v, n: k })), tied: tied.length > 1 ? tied : [], pick, by, leader: run.leader };
}

// ---------- 擲骰 ----------
// 強度：全隊一起擲一次。技能：技能最高的人擲。理智：每個人各自擲（幽靈不擲）。皇冠全隊一層重擲一次。
export function coopCheck(run, Ps, room, ch, bonus = null) {
  const k = ch.check, pr = run.pressure || coopPressure(run);
  const out = { type: k.type, success: true, roll: null, total: null, target: null, rerolled: false, notes: [] };
  if (bonus) out.clue = true;
  const crown = () => { if (run.used.crown || !teamHas(run.team, "帽子", "皇冠")) return false; run.used.crown = true; out.rerolled = true; out.notes.push("皇冠號令：重擲一次"); return true; };
  if (k.type === "power") {
    const tp = coopPower(run, Ps, room);
    out.power = tp.total; out.notes = tp.notes.slice(); out.base = k.target;
    out.target = coopTargetOf(run, k.target) - (bonus ? bonus.power : 0);
    if (bonus) out.notes.push(`記號對上了：門檻 −${bonus.power}`);
    out.roll = rollExpr("1D10"); out.total = tp.total + out.roll.total; out.success = out.total >= out.target;
    if (!out.success && crown()) { out.firstRoll = out.roll; out.roll = rollExpr("1D10"); out.total = tp.total + out.roll.total; out.success = out.total >= out.target; }
    out.tentacle = coopVoters(run).filter(m => coopOwns(run, m.id, "帽子", "觸手帽")).map(m => m.id); // 這幾個人要付理智
  } else if (k.type === "skill") {
    const by = coopRoller(run, Ps, k.skill), P = Ps[by];
    const gent = teamHas(run.team, "帽子", "紳士帽") ? 10 : 0;
    const mod = (k.mod || 0) + gent + pr.skill + (bonus ? bonus.skill : 0);
    if (bonus) out.notes.push(`記號對上了：技能 +${bonus.skill}`);
    if (gent) out.notes.push("紳士帽的禮貌 +10");
    if (pr.skill) out.notes.push(`理智壓力 ${pr.skill}`);
    let sc = skillCheck(P, k.skill, mod);
    out.by = by; out.skill = k.skill; out.roll = sc.roll; out.target = sc.target; out.success = !!sc.success;
    if (!out.success && crown()) { out.firstRoll = out.roll; sc = skillCheck(P, k.skill, mod); out.roll = sc.roll; out.success = !!sc.success; }
  } else if (k.type === "san") {
    out.spec = k.spec; out.san = {};
    coopVoters(run).forEach(m => {
      const r = sanCheck(Ps[m.id], k.spec, "cellar:" + room.id);
      if (bonus && r.loss) r.loss = Math.max(0, r.loss - bonus.san); // 記號對上了：少扣一點
      out.san[m.id] = r;
    });
    const rs = Object.values(out.san);
    out.passed = rs.filter(r => r.success).length;
    out.success = rs.length > 0 && out.passed === rs.length; // 記錄用：每個人都過才算「全隊過了」；結果是一個人一個人算的
  }
  return out;
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
// 受傷：斯拉夫蹲全隊一層擋一次 → 還沒用過的棒球帽（帶的人一層一次）擋 → 從 pool 裡挑一隻受傷（館方助手不會受傷）
export function coopInjure(run, Ps, pool, events) {
  const tell = e => coopActive(run).forEach(m => events[m.id].push(e));
  if (teamHas(run.team, "姿勢", "斯拉夫蹲") && !run.used.squat) { run.used.squat = true; const e = { type: "blocked", what: "squat" }; tell(e); return e; }
  const cap = coopActive(run).find(m => !m.used.cap && coopOwns(run, m.id, "帽子", "棒球帽"));
  if (cap) { cap.used.cap = true; const e = { type: "blocked", what: "cap", by: cap.id }; tell(e); return e; }
  const hurt = pickOne(pool.filter(it => !it.helper && it.owner));
  if (!hurt) return null;
  const P = Ps[hurt.owner], m = coopMember(run, hurt.owner);
  const days = injureDaysOf(P), until = addDays(P.day.date, days);
  P.injured[hurt.key] = until;
  m.got.injured.push(hurt.key);
  events[hurt.owner].push({ type: "injured", key: hurt.key, days, until });
  return { type: "injured", owner: hurt.owner, key: hurt.key, days, until };
}

// ---------- 結果套到每個人 ----------
// 強度、技能：全隊同一個結果。理智：每個人照自己擲的結果。
// 每個人：靈感（第一次過這一間拿全部；再走一次拿 NUM.cellarRepeatInsp，rewarded: false 的人不拿）、理智、佩佩神話、
//   第一次走這一間的躺平、毛帽回理智，都記在他自己的 P（P.cellar.won、cleared）。
// 幽靈：還拿靈感、佩佩還會受傷；理智不再變、不拿佩佩神話（參觀者已經不在了，收藏和靈感是博物館的）。
export function coopApply(run, Ps, room, ch, check, events) {
  const src = "cellar:" + room.id, pr = run.pressure || coopPressure(run);
  const fx = { members: {}, injured: [], blocked: [] };
  const pending = [];
  coopActive(run).forEach(m => {
    const P = Ps[m.id], ev = events[m.id];
    const f = { success: null, insp: 0, sanLoss: 0, sanGain: 0, myth: 0, blocked: [], dark: 0, pressure: 0 };
    fx.members[m.id] = f;
    m.got.rooms++;
    let ok = check.success;
    if (check.type === "san") {
      const r = check.san[m.id];
      if (r) {
        ok = r.success;
        ev.push({ type: "sanCheck", spec: r.spec, roll: r.roll, target: P.sanity, success: r.success, fumble: r.fumble, loss: r.loss, expr: r.expr, habituated: r.habituated });
        // 怕黑多扣、探險燈少扣（dark 可能是負的，決定 0032）：先算總共扣幾點，再分成兩次扣
        const extra = !r.success ? pr.failSan : 0, dark = cellarDarkLoss(P, r.loss + extra);
        const total = r.loss + extra + dark, first = Math.min(r.loss, total);
        coopSanHit(P, m, first, src, { check: first }, ev);
        f.pressure = extra; f.dark = dark;
        if (total - first) coopSanHit(P, m, total - first, src, { pressure: extra, dark }, ev);
      }
      if (!r || m.ghost) { f.success = r ? r.success : null; P.cellar.cleared[room.id] = true; return; } // 幽靈沒有擲，也沒有結果
    }
    f.success = ok;
    if (ok && run.trial) m.trialOk = true; // 合作試煉：這一位過關了（走完那一刻照他自己的資格算成長）
    const o = (ok ? ch.success : ch.fail) || {};
    const firstWin = ok && !P.cellar.won[room.id];
    const firstClear = !P.cellar.cleared[room.id];
    if (o.insp) {
      f.insp = firstWin ? o.insp : (m.rewarded ? NUM.cellarRepeatInsp : 0);
      if (f.insp) { P.insp += f.insp; m.got.insp += f.insp; ev.push({ type: "insp", gain: f.insp, first: firstWin, why: firstWin ? "第一次過這一間" : "再走一次" }); }
    }
    if (ok) P.cellar.won[room.id] = true;
    if (!m.ghost) {
      let loss = 0;
      const parts = {};
      if (o.san) {
        const s = String(o.san).trim();
        if (s.startsWith("+")) { if (firstWin) f.sanGain += coopSanGain(P, m, rollExpr(s.slice(1)).total, "room", ev); }
        else {
          const l = rollExpr(s).total;
          if (l > 0 && !m.used.cap && coopOwns(run, m.id, "帽子", "棒球帽")) { m.used.cap = true; f.blocked.push("cap"); ev.push({ type: "blocked", what: "cap", by: m.id }); }
          else { loss += l; parts.room = l; }
        }
      }
      if (check.type === "power" && check.tentacle && check.tentacle.includes(m.id)) { const t = rollExpr(COOP.tentacleSan).total; loss += t; parts.tentacle = t; }
      if (!ok && (check.type === "power" || check.type === "skill") && pr.failSan) { loss += pr.failSan; parts.pressure = f.pressure = pr.failSan; } // 理智檢定的房間在上面擲完就加過了
      const dark = cellarDarkLoss(P, loss);
      if (dark) { loss += dark; parts.dark = f.dark = dark; }
      f.sanLoss = loss;
      if (o.myth) { f.myth = o.myth; m.got.myth += o.myth; ev.push({ type: "myth", gain: o.myth }); ev.push(...addMyth(P, o.myth)); }
      // 躺平、毛帽（看整隊）：每一層每個人第一次走的那間各回 1D3
      if (firstClear && !run.trial) {
        if (teamHas(run.team, "姿勢", "躺平") && !m.used.rest) { m.used.rest = true; f.sanGain += coopSanGain(P, m, rollExpr(NUM.cellarRest).total, "躺平", ev); }
        if (teamHas(run.team, "帽子", "毛帽") && !m.used.beanie) { m.used.beanie = true; f.sanGain += coopSanGain(P, m, rollExpr(NUM.cellarRest).total, "毛帽", ev); }
      }
      if (loss) pending.push([P, m, loss, parts, ev]);
    }
    // 理智檢定的房間：誰的結果要受傷，就從他自己的佩佩挑（現在的房間都沒有，先留著）
    if (check.type === "san" && o.injure) {
      const r = coopInjure(run, Ps, run.team.filter(it => it.owner === m.id), events);
      if (r && r.type === "injured") fx.injured.push(r); else if (r) fx.blocked.push(r.what);
    }
    P.cellar.cleared[room.id] = true;
  });
  // 強度、技能：結果要受傷的話，全隊只有一隻受傷（房間的字都是「壓到壹隻佩佩」）
  if (check.type !== "san") {
    const o = (check.success ? ch.success : ch.fail) || {};
    if (o.injure) {
      const r = coopInjure(run, Ps, run.team, events);
      if (r && r.type === "injured") fx.injured.push(r); else if (r) fx.blocked.push(r.what);
    }
  }
  pending.forEach(([P, m, loss, parts, ev]) => coopSanHit(P, m, loss, src, parts, ev));
  // 留守的人：照再走一次算靈感（今天有獎勵才拿）；不扣理智、不受傷、不算走過這一間
  run.members.filter(m => m.guard && !m.out).forEach(m => {
    const o = (check.success ? ch.success : ch.fail) || {};
    if (o.insp && m.rewarded && Ps[m.id]) { Ps[m.id].insp += NUM.cellarRepeatInsp; m.got.insp += NUM.cellarRepeatInsp; events[m.id].push({ type: "insp", gain: NUM.cellarRepeatInsp, first: false, why: "留守" }); }
    m.got.rooms++;
  });
  return fx;
}

// ---------- 一間房：開票 → 擲骰 → 套結果 ----------
// opt.tieBreak ＝平手時伺服器另外問領隊的選項（沒有就照 coopTally 的順序決定）
export function coopResolve(run, Ps, votes, opt = {}) {
  coopFix(run);
  if (!run || run.phase !== "vote") return { ok: false, reason: "現在不是投票的時候" };
  const room = coopRoom(run);
  if (!room) return { ok: false, reason: "找不到這一間" };
  if (coopActive(run).some(m => !Ps[m.id])) return { ok: false, reason: "少了隊員的存檔" };
  const events = coopNewEvents(run);
  run.step++;
  const vote = coopTally(run, votes, opt.tieBreak);
  if (vote.pick === "retreat") {
    run.last = { floor: run.floor, room: room.id, choice: "retreat", vote, check: null, fx: null, events };
    coopFinish(run, "retreat");
    coopSync(run, Ps);
    return { ok: true, run, retreat: true, vote, events };
  }
  const ch = room.choices[vote.pick];
  const check = coopCheck(run, Ps, room, ch, run.fun ? coopCheckFun(run, vote.pick) : null);
  const fx = coopApply(run, Ps, room, ch, check, events);
  run.last = { floor: run.floor, room: room.id, choice: vote.pick, vote, check, fx, events };
  run.log.push({ floor: run.floor, room: room.id, choice: vote.pick, type: check.type, success: check.success });
  if (run.fun) coopRoomDone(run, Ps, room, ch, vote, check, fx, events);
  run.phase = "result";
  if (!coopVoters(run).length) coopFinish(run, "lost"); // 大家都變幽靈了：這一趟到這裡
  coopSync(run, Ps);
  return { ok: true, run, vote, check, fx, events };
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
// 沒過的、變幽靈的不算；過了的人照他自己的資格（樓層走過沒、有沒有技能、技能到上限沒、這週拿過沒）算：
// 合格的才 trialWin（記進他自己的 P.shop.trials，一間一週一次，不會多扣）；不合格的陪打，看得到原因。
// 限時活動（run.event 是 trialBoost）：成長 ×倍率，開始那一刻記下來就照它算到走完。結果寫進 run.trial.fx 給畫面。
export function coopTrialDone(run, Ps, events) {
  const T = run.trial, boost = run.event && run.event.kind === "trialBoost" ? run.event : null;
  T.fx = {};
  run.members.filter(m => !m.out || m.out === "ghost").forEach(m => {
    const P = Ps[m.id];
    if (!P) return;
    if (m.ghost || !m.trialOk) { T.fx[m.id] = { state: m.ghost ? "ghost" : "fail" }; return; }
    const st = trialState(P, T.id, T.date);
    if (st.state !== "open") { T.fx[m.id] = { state: "noGrow", reason: st.reason }; return; }
    const g = trialWin(P, { id: T.id, trial: T.skill, boost }, T.date);
    T.fx[m.id] = g ? { state: "grown", skill: g.skill, before: g.before, after: g.after, boost: !!g.boost } : { state: "noGrow", reason: "這週拿過了" };
    if (g) events[m.id].push({ type: "trial", skill: g.skill, before: g.before, after: g.after });
  });
  run.cleared.push(run.floor);
  run.idx = 0;
  coopFinish(run, "done");
  coopSync(run, Ps);
  return { ok: true, run, floorDone: true, trialDone: true, floor: run.floor, next: null, rewards: {}, events };
}
export function coopAdvance(run, Ps) {
  coopFix(run);
  if (!run || (run.phase !== "result" && run.phase !== "carried")) return { ok: false, reason: "還沒擲完這一間" };
  const events = coopNewEvents(run);
  run.step++;
  const f = coopFloorOf(run);
  if (run.fun && run.phase === "result" && coopCarryDue(run)) { // 這一間有要搬的東西（機制 8）
    run.phase = "carry";
    coopSync(run, Ps);
    return { ok: true, run, carry: true, events };
  }
  if (coopRouteOn(run) && run.cmap) return coopRouteBack(run, Ps, events); // 地下室改版：這一間走完，回到地圖選下一個點
  run.idx++;
  if (run.idx < f.rooms.length) {
    coopNextLeader(run);
    run.phase = "vote";
    if (run.fun) coopPlanRoom(run, Ps);
    coopSync(run, Ps);
    return { ok: true, run, floorDone: false, events };
  }
  if (run.trial) return coopTrialDone(run, Ps, events); // 合作試煉：沒有「第一次走完這一層」的獎勵，只有各人的技能成長
  // 地下室改版（決定 0067）：房間都探索完了，先打這一層的守門；打贏才算走完（coop_fight.js 打贏之後叫 coopFloorComplete）
  if (coopGateDue(run) && coopVoters(run).length) {
    run.idx = f.rooms.length - 1;
    const g = coopFightStart(run, Ps, fightFoesOf(run.floor, true)[0].id, "gate");
    if (g.ok) { Object.keys(g.events).forEach(id => { events[id] = (events[id] || []).concat(g.events[id]); }); return { ok: true, run, fight: true, floorDone: false, events }; }
  }
  return coopFloorComplete(run, Ps, events);
}
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
// 往下一層：幽靈先回到地面（他的佩佩也跟著上去），隊伍重排、館方助手重補，這一層用過的帽子、姿勢重算
export function coopContinue(run, Ps) {
  coopFix(run);
  if (!run || run.phase !== "floorDone" || !run.next) return { ok: false, reason: "現在不能往下走" };
  const events = coopNewEvents(run);
  run.step++;
  run.members.forEach(m => { if (!m.out && m.ghost) { m.out = "ghost"; events[m.id].push({ type: "surface" }); } });
  if (!coopVoters(run).length) { coopFinish(run, "lost"); coopSync(run, Ps); return { ok: true, run, events }; }
  run.floor = run.next; run.idx = 0; run.next = null; run.used = {};
  run.members.forEach(m => { m.used = {}; });
  run.team = coopTeam(run, Ps);
  coopNextLeader(run);
  run.phase = "vote";
  if (run.fun) coopStart(run, Ps);
  if (coopRouteOn(run)) coopRouteBegin(run, Ps); // 地下室改版：新的一層先選路
  coopSync(run, Ps);
  return { ok: true, run, events };
}
// 回到地面、撤退：獎勵照走到的算（每一間的結果已經套進每個人的 P 了；這一層沒走完就沒有過關獎勵）。
// 回傳每個人這一趟拿了什麼；ghosts ＝理智歸零的人，伺服器接著跑理智歸零的流程（結局、換下一位參觀者）。
export function coopEnd(run, Ps, why = "done") {
  if (!run) return { ok: false, reason: "沒有這一趟" };
  coopFix(run);
  if (run.phase !== "over") { coopFinish(run, why); run.step++; }
  coopBagSettle(run, Ps);
  coopSync(run, Ps);
  const summary = run.members.map(m => ({ id: m.id, name: m.name, ghost: m.ghost, out: m.out, startSan: m.startSan, san: m.san, got: m.got }));
  return { ok: true, run, summary, ghosts: run.members.filter(m => m.ghost).map(m => m.id), cleared: run.cleared.slice() };
}
// 背包（地下室改版，規劃第五節；翊文 11-12：「會加背包和撤退的代價」）：這一趟拿到的靈感都算在背包裡（m.got.insp）。
//   大家一起撤、走完回地面：全拿。自己先走（out "left"）：帶著自己的背包回去，不扣。留守的人在地面上，不扣。
//   全隊都倒了（over "lost"）：每個人的背包剩一半，扣掉的從靈感拿回來（不會扣到負的）。第一次走完一層的鑰匙、禁書不扣。
//   只有新的地下室（run.gate）才算；太久沒人動自己結束的（stale）不算倒下。只算一次（run.bagDone）
export function coopBagSettle(run, Ps) {
  if (!run || run.over !== "lost" || !run.gate || run.bagDone) return [];
  run.bagDone = true;
  const out = [];
  run.members.forEach(m => {
    if (m.out === "left" || m.guard) return;
    const P = Ps[m.id], lose = Math.floor((m.got.insp || 0) / NUM.cellarMap.bagKeep);
    if (!P || lose <= 0) return;
    const take = Math.min(lose, Math.max(0, P.insp));
    P.insp -= take; m.got.insp -= take; m.got.bagLost = take;
    out.push({ id: m.id, lost: take });
  });
  return out;
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
  if (run.phase !== "over" && !coopVoters(run).length) coopFinish(run, "lost");
  coopSync(run, Ps);
  return { ok: true, run, events };
}

// ---------- 送給每個人的樣子 ----------
// 現在大家看到的都一樣（整份狀態）。之後做「每個人看到的不一樣」（線索分開給、理智低的人看到幻覺）就改這裡：
//   這裡是唯一送出去的出口，不該看到的東西在這裡拿掉，打開開發者工具也看不到。
export function viewFor(run, id) {
  if (!run || !coopMember(coopFix(run), id)) return null;
  const v = JSON.parse(JSON.stringify(run));
  v.me = id;
  if (v.last && v.last.events) v.last.events = { [id]: v.last.events[id] || [] }; // 事件只給他自己的
  v.fresh = (run.fresh && run.fresh[id]) || [];
  if (run.fun) coopFilterView(v, run, id); // 不該看到的東西在這裡拿掉：線索、幻覺、地圖（coop_fun.js）
  if (run.phase === "fight" && run.fight) { v.fightView = coopFightView(run, id); v.votes = { [id]: (run.votes || {})[id] || null }; } // 打怪物：別人選了什麼結算前看不到，只知道誰選好了（fightView.waiting）
  if (run.cmap) v.cmap = coopRouteMapView(run); // 地圖（地下室改版；v.map 是留守看的房間地圖，不一樣）：只給種類和等級，不寫怪物是誰
  return v;
}
