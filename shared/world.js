// ================================================================
//  世界經濟的「世界文件」（W2，決定 0086，規劃 docs/世界經濟規劃.md 第 5、6 節）
//  純函式。伺服器每小時的排程（functions/world.js 的 worldTick，併進 auctionTick）呼叫 wdTick：換日第一次才寫，同一天再跑什麼都不做。
//  world/main：{ v, day, pool, grownSeen, last }
//    pool        已知世界的「備用池」：house.world（館的對外帳戶）以外的那一份。現在是 0，搬錢預設關閉（NUM.casino.worldDoc.gateway ＝ 0）。
//    grownSeen   上次看到的 house.led.mint.worldGrow 累計（算「這一次之間成長了多少」）
//    last        最近一天的紀錄（同 worldDays/{日期} 那份）
//  worldDays/{日期}：每天一份紀錄 { day, houseDay, world, pool, total, grown, growth, b }。**只觀察、不改莊家**：
//    成長（worldGrow）還是在莊家文件的換日（casHouseDaily）裡算，第一個碰到莊家的交易才算；排程不替它換日，因為換日會產生破產重開的事件、要由那個交易告訴玩家和 Discord。
//    之後（W3）單位分帳、成長按權重分，才把成長搬到排程。
//  搬錢（wdSettle）：house.world 和 pool 之間搬，總和不變。預設關閉；要開之前，casBookSnap 必須把 pool 算進總量（否則對帳差不是 0）。
// ================================================================
import { NUM } from "./config.js";
import { WORLD_UNITS } from "./world_roster.js";
import { WORLD_MARKETS } from "./world_markets.js";
import { WORLD_EVENTS } from "./world_events.js";
import { OUT_STOCKS } from "./stocks_text.js";
import { hashStr } from "./logic.js";
import { statBandOf, statView } from "./stat_view.js";

const wdN = v => (Number.isFinite(+v) ? Math.floor(+v) : 0);
const wdBox = v => !!v && typeof v === "object" && !Array.isArray(v);
const wdDayOk = d => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

export function wdNew() { return { v: 1, day: null, pool: 0, grownSeen: null, last: null }; }
// 讀回來的世界文件：補欄位、壞資料變回預設
export function wdFix(w) {
  const x = wdBox(w) ? w : wdNew();
  x.v = 1;
  x.day = wdDayOk(x.day) ? x.day : null;
  x.pool = Math.max(0, wdN(x.pool));
  x.grownSeen = x.grownSeen == null ? null : wdN(x.grownSeen);
  x.last = wdBox(x.last) ? x.last : null;
  return x;
}
// 莊家文件目前累計的成長（house.led.mint.worldGrow）
export const wdGrown = house => wdN(house && house.led && house.led.mint && house.led.mint.worldGrow);
// 已知世界現在總共多少：莊家的對外帳戶（house.world）加備用池
export const wdTotal = (house, w) => wdN(house && house.world) + wdN(w && w.pool);

// 換日第一次：回傳 { skip: true }（今天已經記過）或 { skip: false, w, rec }。house 不會被改
export function wdTick(wIn, house, day) {
  const w = wdFix(wIn);
  if (!wdDayOk(day)) return { skip: true, w };
  if (w.day === day) return { skip: true, w };
  const grown = wdGrown(house), growth = w.grownSeen == null ? null : Math.max(0, grown - w.grownSeen);
  const rec = { day, houseDay: wdDayOk(house && house.day) ? house.day : null, world: wdN(house && house.world), pool: w.pool, total: wdTotal(house, w), grown, growth, b: Math.round((+(house && house.econ && house.econ.b) || 0) * 1000) / 1000 };
  w.day = day; w.grownSeen = grown; w.last = rec;
  return { skip: false, w, rec };
}

// 搬錢：house.world 和 w.pool 之間，目標是讓 house.world ＝ min(總和, gateway)，其餘放備用池。gateway ≤ 0 ＝ 關閉，不搬。回傳搬了多少（正＝house.world → pool，負＝pool → house.world）
export function wdSettle(house, wIn, gateway = NUM.casino.worldDoc ? NUM.casino.worldDoc.gateway : 0) {
  const w = wdFix(wIn);
  if (!(gateway > 0) || !house) return 0;
  const total = wdTotal(house, w), want = Math.min(total, wdN(gateway)), move = wdN(house.world) - want; // move ＞ 0：house.world 多了，放進備用池
  if (!move) return 0;
  house.world = want; w.pool = total - want;
  wIn.pool = w.pool;
  return move;
}

// ================================================================
//  W3 分帳（決定 0086）：已知世界的錢（house.world）分成「頂層單位、家計、公共」。這只是帳上的分類，**不搬錢**：
//    house.wu ＝ { r: { id: 比例 }, adj: { id: 調整 } }。單位 i 現在有 floor(house.world × r_i) ＋ adj_i；公共＝house.world 減掉所有單位和家計（剩下的），所以總和永遠等於 house.world，不會對不上。
//    池子進出（館的各種來源）照比例攤（world × r 自己就會跟著變）；只有「指名的」會動 adj：每天成長按權重分（wuGrow）、新玩家的起始補助從文化部出（wuDebit）。
//    W4 起，NPC 來館花的錢從所屬集團出，會用 wuDebit。
//    公共（pub）是剩下的，所以指名的單位不夠出時由公共補；公共的比例（現在 16%）是緩衝。
// ================================================================
export const WU_HH = "u-household"; // 家計：沒有單位的人（學生、退休、自由業）
export const WU_EXT = "u-ext"; // 舊的「海外」單位（決定 0121）：決定 0126 起海外是並列的帳 house.ext，這個 id 只剩壹次性搬出（wuExtSplit）用
export const WU_PUB = "pub"; // 公共：剩下的（只在 wuAmounts 的結果裡，不存在 adj）
const wuBox = v => !!v && typeof v === "object" && !Array.isArray(v);
const wuTop = () => WORLD_UNITS.filter(u => u && u.parent == null);
// 初始比例：頂層單位用名單的 share，家計 NUM.casino.worldDoc.household，公共是剩下的
export function wuRatios() {
  const r = {}; let sum = 0;
  for (const u of wuTop()) { r[u.id] = +u.share || 0; sum += r[u.id]; }
  r[WU_HH] = +NUM.casino.worldDoc.household || 0; sum += r[WU_HH];
  r[WU_PUB] = Math.max(0, 1 - sum);
  return r;
}
// 讀回來的莊家：沒有 wu 就照現在的比例建（第一次：已知世界的錢照比例分）；壞資料變回預設
export function wuFix(house) {
  if (!wuBox(house)) return null;
  const x = wuBox(house.wu) && wuBox(house.wu.r) ? house.wu : (house.wu = { r: wuRatios(), adj: {} });
  if (!wuBox(x.adj)) x.adj = {};
  for (const id of Object.keys(x.r)) { x.r[id] = +x.r[id] || 0; if (id !== WU_PUB) x.adj[id] = wdN(x.adj[id]); }
  if (x.r[WU_PUB] == null) x.r[WU_PUB] = 0;
  if (x.r[WU_WAL] == null) { x.r[WU_WAL] = 0; x.adj[WU_WAL] = wdN(x.adj[WU_WAL]); } // NPC 錢包（W6）：比例 0，只有 adj
  return x;
}
// 決定 0126：把海外從已知世界（house.world）搬出來，變成並列的帳 house.ext（壹個莊家壹次，旗標 house.extSplit）。
//   E ＝ 舊的 u-ext 累計（house.wu.adj）。house.world 少 E、house.ext 多 E，全館總和不變；各集團、家計、NPC 錢包的帳不變（adj 補上 world 變小造成的 floor 差），公共也不變。
//   流水帳：led.world.extSplit ＝ −E、led.ext.extSplit ＝ +E（讓「世界的變化 ＝ 流水加成長」的檢查照樣成立）；舊的 led.world 累計不動（歷史）。回傳搬了多少
export function wuExtSplit(house) {
  if (!wuBox(house) || house.extSplit || house.world == null) return 0;
  const x = wuFix(house); if (!x) return 0;
  const E = wdN(x.adj[WU_EXT]), W = wdN(house.world);
  if (E) for (const id of Object.keys(x.r)) { if (id === WU_PUB || id === WU_EXT) continue; x.adj[id] = wdN(x.adj[id]) + Math.floor(W * x.r[id]) - Math.floor((W - E) * x.r[id]); }
  delete x.r[WU_EXT]; delete x.adj[WU_EXT];
  house.world = W - E; house.ext = wdN(house.ext) + E; house.extSplit = true;
  if (E) { if (!wuBox(house.led)) house.led = {}; for (const k of ["world", "ext"]) if (!wuBox(house.led[k])) house.led[k] = {}; house.led.world.extSplit = wdN(house.led.world.extSplit) - E; house.led.ext.extSplit = wdN(house.led.ext.extSplit) + E; }
  return E;
}
// house.world 已經從 before 變成現在：變多（少）的 n 全記在 id 這個單位，其他單位、錢包不動。總和仍等於池子（集團增資的錢進池子、館外股進出海外都用它）
export function wuCredit(house, before, id, n) {
  n = wdN(n); const x = wuFix(house); if (!x || !n || !(id in x.r) || id === WU_PUB) return 0;
  const deltas = {}; for (const k of Object.keys(x.r)) if (k !== WU_PUB) deltas[k] = k === id ? n : 0;
  wuMove(house, before, deltas); return n;
}
// 現在每個單位有多少（含 pub 公共）。總和 ＝ house.world
export function wuAmounts(house) {
  const x = wuFix(house), world = wdN(house.world), out = {}; let sum = 0;
  for (const id of Object.keys(x.r)) { if (id === WU_PUB) continue; out[id] = Math.floor(world * x.r[id]) + wdN(x.adj[id]); sum += out[id]; }
  out[WU_PUB] = world - sum;
  return out;
}
// house.world 從 before 變成現在：沒有指名的單位照比例變（floor 的差），指名的（deltas { id: 變多少 }）改成指名的數字；公共吃剩下的
function wuMove(house, before, deltas) {
  const x = wuFix(house), after = wdN(house.world);
  for (const id of Object.keys(x.r)) {
    if (id === WU_PUB || !(id in deltas)) continue;
    const base = Math.floor(after * x.r[id]) - Math.floor(before * x.r[id]);
    x.adj[id] = wdN(x.adj[id]) + wdN(deltas[id]) - base;
  }
}
// 每天成長 n 已經加進 house.world 了：按權重分給單位和家計（權重 ＝ 比例 ×（1＋行業係數×景氣 b）），公共吃剩下的。b ＝ house.econ.b
export function wuGrow(house, n) {
  n = wdN(n); const x = wuFix(house);
  if (!x || n <= 0) return 0;
  const b = Math.max(-1, Math.min(1, +(house.econ && house.econ.b) || 0)), coef = NUM.casino.worldDoc.sectorCoef || {}, sector = {}, mkOn = wmCfg() && wmCfg().on && wuBox(house.mk);
  for (const u of wuTop()) sector[u.id] = u.sector;
  const raw = {}; let tot = 0;
  for (const id of Object.keys(x.r)) { raw[id] = x.r[id] * Math.max(0, 1 + (id === WU_PUB || id === WU_HH ? 0 : (+coef[sector[id]] || 0)) * (mkOn && id !== WU_PUB && id !== WU_HH ? wmB(house, wmOfUnit(id)) : b)); tot += raw[id]; }
  if (!(tot > 0)) return 0;
  const deltas = {}; for (const id of Object.keys(x.r)) if (id !== WU_PUB) deltas[id] = Math.floor(n * raw[id] / tot);
  wuMove(house, wdN(house.world) - n, deltas);
  return n;
}
// NPC 的隸屬 → 帳上要扣哪個頂層單位（W4）：job.unit 往上找到頂層；沒有單位（學生、退休、自由業、沒寫）算家計
export function wuUnitOf(job) {
  if (!wuBox(job) || typeof job.unit !== "string") return WU_HH;
  const by = {}; for (const u of WORLD_UNITS) by[u.id] = u;
  let u = by[job.unit], n = 0; while (u && u.parent != null && n++ < 50) u = by[u.parent];
  return u ? u.id : WU_HH;
}
// 這個單位現在有多少（帳上）；沒有這個單位回 0
export function wuHave(house, id) { const a = wuAmounts(house); return id in a ? Math.max(0, a[id]) : 0; }
// 指名一個單位出錢 n（house.world 已經少了 n）：它最多出它現在有的，剩下的由公共出（別的單位不動）。回傳那個單位實際出了多少
export function wuDebit(house, id, n) {
  n = wdN(n); const x = wuFix(house);
  if (!x || n <= 0 || !(id in x.r) || id === WU_PUB) return 0;
  const before = wdN(house.world) + n, have = Math.max(0, Math.floor(before * x.r[id]) + wdN(x.adj[id])), take = Math.min(n, have);
  const deltas = {}; for (const k of Object.keys(x.r)) if (k !== WU_PUB) deltas[k] = k === id ? -take : 0; // 別的單位不動
  wuMove(house, before, deltas);
  return take;
}

// ================================================================
//  W5 連動（決定 0086，規劃 docs/世界經濟規劃.md 第 4 節）：每個頂層單位每天算一個健康值 h，每週一換狀態（一般／減薪／緊縮／裁員），
//  狀態決定 NPC 來館花錢的預算倍率（只動預算，不動 NPC 在不在場；全館不會一夜變空）。house.wh ＝ { day, base, idx, h, st, ev }。
//    h ＝ clamp(1 ＋ 景氣 b × 行業係數 ＋ 旗下館外股票這一週的漲跌 × stockW, min, max)；文化部固定 1.0、家計沒有 h（倍率 1）。
//    狀態（每週一看一次）：h ≥ cut → 一般（倍率 1～upMax）；squeeze ≤ h ＜ cut → 減薪 ×0.8；h ＜ squeeze → 連續 squeezeWeeks 週緊縮 ×0.5，連續 layoffWeeks 週裁員 ×0.3；下限 floor。
//    股價用「昨天以前」的價（house.stk.px 在換日算好之後的現價，不是盤中），每天最多留 8 天，週漲跌 ＝ 現在對 7 天前，夾在 ±chgCap（換股數比例時不會讓 h 暴衝）。
// ================================================================
export const WH_STATES = ["normal", "cut", "squeeze", "layoff"];
const whCfg = () => NUM.casino.worldDoc.health;
const whClamp = (v, a, b) => Math.max(a, Math.min(b, v));
const whIsMon = day => new Date(day + "T00:00:00Z").getUTCDay() === 1;
const whUnits = () => wuTop().filter(u => u.kind !== "story");
export function whFix(house) {
  if (!wuBox(house)) return null;
  const w = wuBox(house.wh) ? house.wh : (house.wh = {});
  w.day = wdDayOk(w.day) ? w.day : null;
  for (const k of ["base", "idx", "h", "st", "unrest", "chg", "loan"]) if (!wuBox(w[k])) w[k] = {};
  for (const k of Object.keys(w.loan)) { const L = w.loan[k]; if (!wuBox(L) || !(wdN(L.amt) > 0)) delete w.loan[k]; else { L.amt = wdN(L.amt); L.day = wdDayOk(L.day) ? L.day : null; } }
  for (const k of Object.keys(w.unrest)) w.unrest[k] = whClamp(wdN(w.unrest[k]), 0, 100);
  w.mood = wuBox(w.mood) && wdDayOk(w.mood.day) ? { day: w.mood.day, v: whClamp(wdN(w.mood.v), 0, 100), prev: w.mood.prev == null ? null : whClamp(wdN(w.mood.prev), 0, 100) } : null;
  if (!Array.isArray(w.ev)) w.ev = [];
  w.ev = w.ev.filter(e => wuBox(e) && wdDayOk(e.day) && typeof e.unit === "string" && WH_STATES.includes(e.to)).slice(-20);
  for (const u of whUnits()) { const s = wuBox(w.st[u.id]) ? w.st[u.id] : (w.st[u.id] = {}); s.s = WH_STATES.includes(s.s) ? s.s : "normal"; s.low = Math.max(0, wdN(s.low)); }
  return w;
}
// 單位的旗下股票平均「相對第一次看到的價」；沒有股票或沒價回 null
function whIdx(u, px, base) {
  const r = []; for (const id of (u.stocks || []).concat(["gs-" + u.id])) { const p = +(px && px[id]); if (!(p > 0)) continue; if (!(base[id] > 0)) base[id] = p; r.push(p / base[id]); }
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null;
}
// 換日呼叫（house.econ.b 是景氣，px 是 house.stk.px）。同一天不重複。回傳 true ＝ 這次有算
export function whTick(house, day, px, grown = 0) {
  const w = whFix(house), C = whCfg();
  if (!w || !wdDayOk(day) || w.day === day) return false;
  wtAdvance(house, day, null); // 前壹天排的沒走完的，先補完（換日那壹刻）
  wmTick(house, day, px); // 各市場今天的景氣（決定 0121）：先算，這天的健康值、成長、氣氛都用它
  if (house.gs && house.gs.u && Object.keys(house.gs.u).length) { px = Object.assign({}, px); for (const k of Object.keys(house.gs.u)) px["gs-" + k] = house.gs.u[k].P; } // 集團自己的股價也算進健康值的股價項（決定 0121，股價 → 經濟，上限照現有 stockW×chgCap）
  const b = whClamp(+(house.econ && house.econ.b) || 0, -1, 1), coef = NUM.casino.worldDoc.sectorCoef || {};
  for (const u of whUnits()) {
    const ix = whIdx(u, px, w.base); if (ix != null) { if (!wuBox(w.idx[u.id])) w.idx[u.id] = {}; w.idx[u.id][day] = Math.round(ix * 10000) / 10000; }
    const ds = wuBox(w.idx[u.id]) ? Object.keys(w.idx[u.id]).sort() : []; for (const d of ds.slice(0, Math.max(0, ds.length - 8))) delete w.idx[u.id][d];
    let chg = 0; if (ds.length >= 2) { const old = ds.find(d => d <= whAddDays(day, -7)) ? ds.filter(d => d <= whAddDays(day, -7)).pop() : ds[0]; const a = w.idx[u.id][old], c = w.idx[u.id][day]; if (a > 0 && c > 0 && old !== day) chg = c / a - 1; }
    w.chg[u.id] = Math.round(chg * 10000) / 10000;
    w.h[u.id] = Math.round(whClamp(1 + (wmCfg() && wmCfg().on && wuBox(house.mk) ? wmB(house, wmOfUnit(u.id)) : b) * (+coef[u.sector] || 0) + whClamp(chg, -C.chgCap, C.chgCap) * C.stockW + wtWealth(house, u.id), C.min, C.max) * 1000) / 1000;
  }
  wtDaily(house, day, grown);
  const U = NUM.casino.worldDoc.unrest;
  for (const u of whUnits()) { const cur = whUnrest(house, u.id); w.unrest[u.id] = whClamp(cur + (cur > U.start ? -Math.min(U.back, cur - U.start) : cur < U.start ? Math.min(U.back, U.start - cur) : 0), 0, 100); } // 每天往平常靠（慣性：事件的影響拖幾天）
  const EV = NUM.casino.worldDoc.events; // 排程填的事件（劇情決定的欄位）和壞消息：從上次算到今天，每壹天都套用壹次（隔了幾天沒人來也不漏）
  for (let i = Math.min(14, w.day && w.day < day ? Math.round((Date.parse(day) - Date.parse(w.day)) / 86400000) : 1) - 1; i >= 0; i--) {
    const d = whAddDays(day, -i), e = WORLD_EVENTS[d]; if (!e) continue;
    for (const id of Object.keys(e.unrest || {})) whUnrestAdd(house, id, whClamp(e.unrest[id], -EV.unrestMax, EV.unrestMax));
    for (const u of whUnits()) if ((e.down || []).some(s => (u.stocks || []).includes(s))) whUnrestAdd(house, u.id, EV.downPush); // 旗下股票有壞消息：壹個集團壹天最多壹次
  }
  const first = w.day === null;
  const isMon = first || whIsMon(day);
  if (isMon) { wtWeekSnap(house, day); wtWeekStart(house, day); } // 週一先看上週借的要不要還、股票營收
  if (first || whIsMon(day)) { // 每週一看一次狀態
    for (const u of whUnits()) {
      const s = w.st[u.id], h = w.h[u.id], from = s.s;
      if (h >= C.cut) { s.s = "normal"; s.low = 0; }
      else if (h >= C.squeeze) { s.s = "cut"; s.low = 0; }
      else { s.low++; s.s = s.low >= C.layoffWeeks ? "layoff" : s.low >= C.squeezeWeeks ? "squeeze" : "cut"; }
      if (!first && s.s !== from) { w.ev.push({ day, unit: u.id, to: s.s, from }); w.unrest[u.id] = whClamp(whUnrest(house, u.id) + (U[s.s] || 0), 0, 100); } // 換狀態：推一下集體不安
    }
    w.ev = w.ev.slice(-20);
    wtLoanTake(house, day); // 狀態出來後，不是一般的集團跟金融集團借
    wtTranche(house, day); // 週一新定下的借款、還款，今天就排第壹筆
  }
  w.day = day;
  const old = w.mood; w.mood = { day, v: whMood(house, day), prev: old && old.day === whAddDays(day, -1) ? old.v : null }; // prev ＝昨天的氣氛（散客類型權重用，換日前後都是同壹個數字）
  return true;
}
// 集團的集體不安（沒有紀錄 ＝ 平常的值）；排程填的劇情事件用 whUnrestAdd 推（劇情決定的欄位，之後接）
export const whUnrest = (house, id) => { const v = house && house.wh && house.wh.unrest ? house.wh.unrest[id] : undefined; return v == null ? NUM.casino.worldDoc.unrest.start : whClamp(wdN(v), 0, 100); };
export function whUnrestAdd(house, id, n) { const w = whFix(house); if (!w || !(id in w.st)) return null; w.unrest[id] = whClamp(whUnrest(house, id) + wdN(n), 0, 100); return w.unrest[id]; }
// 散客的展廳氣氛：無狀態，每天由景氣、NPC 平均理智、有幾個集團減薪以上、週末算出來（不動錢）
export function whMood(house, day) {
  const M = NUM.casino.worldDoc.mood, S = NUM.casino.worldDoc.san, w = house && house.wh, n = Math.max(1, Object.keys((house && house.npcw && house.npcw.bal) || {}).length);
  const dev = Object.values((house && house.npcw && house.npcw.san) || {}).reduce((a, v) => a + (wdN(v) - S.start), 0), trouble = w && w.st ? Object.values(w.st).filter(s => s.s !== "normal").length : 0;
  const wd = new Date(day + "T00:00:00Z").getUTCDay(), b = wmCfg() && wmCfg().on && house && wuBox(house.mk) && house.mk.day ? whClamp(wmTotal(house), -1, 1) : whClamp(+(house && house.econ && house.econ.b) || 0, -1, 1);
  const ev = WORLD_EVENTS[day] && WORLD_EVENTS[day].mood ? whClamp(WORLD_EVENTS[day].mood, -NUM.casino.worldDoc.events.moodMax, NUM.casino.worldDoc.events.moodMax) : 0;
  return whClamp(Math.round(M.base + M.b * b + M.san * (dev / n) + M.trouble * trouble + (wd === 0 || wd === 6 ? M.weekend : 0) + ev), 0, 100);
}
function whAddDays(day, n) { return new Date(Date.parse(day + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10); }
// NPC 預算倍率：一般 1～upMax（h 高時多一點）、減薪、緊縮、裁員；文化部、家計、沒有的單位 ＝ 1；最低 floor
export function whMult(house, unitId) {
  const w = house && wuBox(house.wh) ? house.wh : null, C = whCfg();
  if (!w || !wuBox(w.st) || !wuBox(w.st[unitId])) return 1;
  const s = w.st[unitId].s, h = +w.h[unitId] || 1;
  const m = s === "normal" ? whClamp(h, 1, C.upMax) : (C.mult[s] || 1);
  return Math.max(C.floor, m);
}
// ---------- 景氣分市場（決定 0121）：每個市場自己的景氣指數 b（−1～+1），接真實台股／美股、放大、會回平均 ----------
// house.mk = { day, c 共同因子, b: { 市場: 數 }, p: { 股票 id: 昨天收盤價 }, f: { NPC id: 今天來館倍率 }, g: 昨天的 f }
const wmCfg = () => NUM.casino.worldDoc.market;
const wmGauss = key => { const u1 = ((hashStr(key + "|a") % 1000000) + 0.5) / 1000000, u2 = ((hashStr(key + "|b") % 1000000) + 0.5) / 1000000; return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
export const wmDef = id => WORLD_MARKETS.find(m => m.id === id) || null;
// 單位在哪個市場：自己寫的 market，沒有就用 sector；名單裡沒有的當「公共」
export function wmOfUnit(unitId) { const u = WORLD_UNITS.find(x => x.id === unitId); const id = u && (u.market || u.sector); return wmDef(id) ? id : "public"; }
export function wmFix(house) {
  if (!wuBox(house)) return null;
  const m = wuBox(house.mk) ? house.mk : (house.mk = {});
  m.day = wdDayOk(m.day) ? m.day : null; m.c = Number.isFinite(+m.c) ? whClamp(+m.c, -1, 1) : 0;
  for (const k of ["b", "p", "f", "g"]) if (!wuBox(m[k])) m[k] = {};
  for (const d of WORLD_MARKETS) m.b[d.id] = Number.isFinite(+m.b[d.id]) ? whClamp(+m.b[d.id], -1, 1) : 0;
  return m;
}
export const wmB = (house, id) => { const m = house && wuBox(house.mk) ? house.mk : null; return m && Number.isFinite(+m.b[id]) ? +m.b[id] : 0; };
export const wmTotal = house => WORLD_MARKETS.length ? WORLD_MARKETS.reduce((a, d) => a + wmB(house, d.id), 0) / WORLD_MARKETS.length : 0;
// 真實市場昨天到今天的漲跌（%）：anchor 那個市場的館外股平均。沒有價就 0
function wmReal(m, px, anchor, cats) {
  const C = wmCfg(); if (anchor !== "tw" && anchor !== "us") return 0;
  // cats（決定 0134）：這個市場只看那幾類的館外股（自然資源）；沒寫就是 anchor 市場裡「預設」的那幾支（ext 的新股不算，11-19 新增的 18 支不改既有市場的景氣）
  const r = []; for (const s of OUT_STOCKS) { if (s.market !== anchor || (Array.isArray(cats) && cats.length ? !cats.includes(s.cat) : s.ext)) continue; const p = +(px && px[s.id]), q = +m.p[s.id]; if (p > 0 && q > 0) r.push((p / q - 1) / (s.mult > 1 ? s.mult : 1)); }
  return r.length ? whClamp(100 * r.reduce((a, b) => a + b, 0) / r.length, -C.realCap, C.realCap) : 0;
}
// 換日呼叫：算每個市場今天的景氣，再算每位 NPC 今天的來館倍率。同壹天不重複；隔幾天沒人來，每天都走壹步（真實漲跌只算最後那天）
export function wmTick(house, day, px) {
  const C = wmCfg(), m = wmFix(house); if (!C || !C.on || !m || !wdDayOk(day) || m.day === day) return false;
  const gap = m.day && m.day < day ? Math.max(1, Math.min(14, Math.round((Date.parse(day) - Date.parse(m.day)) / 86400000))) : 1;
  // 上週的景氣（11-20 翊文：「加上跟上週比」）：換週那天，先把更新前的值（上週最後壹天）存成 lw，財報照它比
  { const wd = new Date(day + "T00:00:00Z").getUTCDay(), mon = whAddDays(day, -((wd + 6) % 7)); if (!wuBox(m.lw) || m.lw.wk !== mon) m.lw = { wk: mon, b: m.day ? Object.assign({}, m.b) : null }; }
  const real = {}; for (const d of WORLD_MARKETS) real[d.id] = wmReal(m, px, d.anchor, d.cats);
  for (let i = gap - 1; i >= 0; i--) {
    const dd = whAddDays(day, -i); m.c = whClamp(C.common * m.c + C.commonSd * wmGauss(dd + "|common"), -1, 1);
    for (const d of WORLD_MARKETS) m.b[d.id] = Math.round(Math.tanh((1 - d.kappa) * m.b[d.id] + (i === 0 ? real[d.id] * d.beta * C.amp : 0) + d.rho * m.c + d.sd * wmGauss(dd + "|" + d.id) * 0.5) * 1000) / 1000;
  }
  for (const s of OUT_STOCKS) { const p = +(px && px[s.id]); if (p > 0) m.p[s.id] = p; }
  m.g = m.f; m.f = {}; m.day = day;
  return true;
}
// 來館頻率倍率（旅客、散客）和花錢意願倍率：1 ＋ k × 市場景氣，夾在範圍內。沒資料或關掉 ＝ 1
const wmMul = (b, k, lo, hi) => whClamp(1 + k * b, lo, hi);
export function wmVisit(house, id) { const C = wmCfg(); return C && C.on ? wmMul(wmB(house, id), C.visitK, C.visitLo, C.visitHi) : 1; }
export function wmSpend(house, id) { const C = wmCfg(); return C && C.on ? wmMul(wmB(house, id), C.spendK, C.spendLo, C.spendHi) : 1; }
// 這位 NPC 受哪個市場影響：所屬集團的市場；沒有集團的（學生、退休、自由）看總景氣
export function wmOfNpc(house, n) { const u = nwUnitOf(house, n); return u && u !== WU_HH && u !== WU_PUB && WORLD_UNITS.some(x => x.id === u) ? wmOfUnit(u) : null; }
export function wmNpcMul(house, n, kind) {
  const C = wmCfg(); if (!C || !C.on) return 1;
  const id = wmOfNpc(house, n), b = id ? wmB(house, id) : wmTotal(house), solace = Array.isArray(C.solace) && C.solace.includes(n && n.id);
  if (kind === "visit") return solace && b < 0 ? whClamp(1 - C.solaceK * b, 1, C.visitHi) : wmMul(b, C.visitK, C.visitLo, C.visitHi); // 愛解悶的：景氣差反而多來（最多 +solaceK×|b|）
  return wmMul(b, C.spendK, C.spendLo, C.spendHi);
}
// 每位 NPC 今天的來館倍率寫進 house.npcc.mkv（npcCounters 帶給行程用，伺服器和網頁都看得到同壹份）；mkv.g 是昨天的（補算昨天用）
export function wmWriteVisit(house, day, list) {
  const m = wmFix(house), C = wmCfg(); if (!m || !C || !C.on || m.day !== day) return false;
  if (!wuBox(house.npcc)) house.npcc = { comm: 0, hall: 0 };
  if (wuBox(house.npcc.mkv) && house.npcc.mkv.day === day) return false; // 今天寫過了
  const f = {}; for (const n of list || []) { const v = Math.round(wmNpcMul(house, n, "visit") * 1000) / 1000; if (v !== 1) f[n.id] = v; }
  m.f = f; house.npcc.mkv = { day, f, g: m.g || {} };
  return true;
}
// ---------- 集團之間的交易（決定 0119）：只搬帳上的分類（house.wu.adj），house.world、玩家的錢、門票、大禮包、借款都不動 ----------
const wtCfg = () => NUM.casino.worldDoc.trade;
const WT_FIN = "g-finance";
// 單位 id 帳上「比照比例應有的」＝ floor(world × r)
const wtBase = (house, id) => { const x = wuFix(house); return x && id in x.r ? Math.floor(wdN(house.world) * x.r[id]) : 0; };
// 帳上的錢比應有的多或少多少（比例，夾在 ±dCap），乘 wealthW ＝ 健康值多或少幾。借來的錢也算（所以借款會讓健康值先回升，還款再回去）
export function wtWealth(house, id) {
  const T = wtCfg(); if (!T || !T.on) return 0;
  const x = wuFix(house), base = wtBase(house, id); if (!x || !(base > 0)) return 0;
  const rec = id === WT_FIN && wuBox(house.wh) && wuBox(house.wh.loan) ? Object.values(house.wh.loan).reduce((a, L) => a + wdN(L && L.amt), 0) : 0; // 金融集團借出去的算它的資產（不然借越多越窮）
  const dep = wuBox(house.gb) && wuBox(house.gb.dep) ? wdN(house.gb.dep[id]) : 0; // 存在佩佩銀行的也是集團的資產（決定 0127），不然存進去健康值會掉
  return whClamp((wdN(x.adj[id]) + rec + dep) / base, -T.dCap, T.dCap) * T.wealthW;
}
// 帳上搬：from 單位 → to 單位（adj），最多搬 from 現有的；回傳搬了多少。總和不變
// 每壹筆也記在 house.led.units["種類|from|to"]（累計），銀行金流頁籤（shared/casino_report.js 的 casFlowHub）算今天集團之間的線用；kind 是 "trade…"，名字在 CAS_FLOW_UNIT
export function wtLed(house, kind, from, to, n) { if (!(n > 0)) return; const L = (house.led = wuBox(house.led) ? house.led : {}), U = (L.units = wuBox(L.units) ? L.units : {}), k = kind + "|" + from + "|" + to; U[k] = wdN(U[k]) + n; }
function wtMove(house, from, to, n, kind) {
  n = wdN(n); const x = wuFix(house);
  if (!x || n <= 0 || from === to || from === WU_PUB || to === WU_PUB || !(from in x.r) || !(to in x.r)) return 0;
  const take = Math.min(n, wuHave(house, from)); if (take <= 0) return 0;
  x.adj[from] = wdN(x.adj[from]) - take; x.adj[to] = wdN(x.adj[to]) + take; wtLed(house, kind, from, to, take);
  return take;
}
const wtLog = (w, day, t) => { if (!Array.isArray(w.trade)) w.trade = []; w.trade.push({ day, t }); w.trade = w.trade.slice(-20); };
// ---------- 集團之間的往來表和佩佩銀行（決定 0127）----------
const wtTop = () => WORLD_UNITS.filter(u => u && u.parent == null).map(u => u.id);
const wtB = (house, id) => { const C = wmCfg(); return C && C.on && wuBox(house.mk) && house.mk.day ? wmB(house, wmOfUnit(id)) : whClamp(+(house.econ && house.econ.b) || 0, -1, 1); }; // 付款方所在市場的景氣
// 往來表：照名單長（flows 裡有的照寫，名單上有、表裡沒寫的集團照 flowDefault）。每天排進 wh.tr（陸續發生）
function wtFlowsDaily(house, day) {
  const T = wtCfg(); if (!T || !T.on || !Array.isArray(T.flows)) return;
  const ids = new Set(wtTop().concat([WU_HH])), list = T.flows.slice(), seen = new Set(T.flows.map(f => f.from));
  if (Array.isArray(T.flowDefault)) for (const id of ids) if (!seen.has(id)) for (const d of T.flowDefault) if (d.to !== id) list.push({ k: d.k, from: id, to: d.to, pct: d.pct });
  for (const f of list) {
    if (!ids.has(f.from) || !ids.has(f.to) || f.from === f.to || !(f.pct > 0)) continue;
    const n = Math.floor(wtBase(house, f.from) * f.pct / 100 * whMult(house, f.from) * Math.max(0, 1 + T.bK * wtB(house, f.from)));
    if (n > 0) wtGo(house, day, f.k, f.from, f.to, n);
  }
}
// 銀行準備金（house.gb）：{ cash, debt 欠博物館資金的, dep: { 單位: 存款 }, loan: { 單位: 放款 } }。存款、放款是備忘（錢在 cash 或單位的帳上），只有 cash 算進全館的錢
export function gbFix(house) {
  if (!wuBox(house)) return null;
  const g = wuBox(house.gb) ? house.gb : (house.gb = {}); g.cash = wdN(g.cash); g.debt = Math.max(0, wdN(g.debt));
  g.loansOut = Math.max(0, wdN(g.loansOut)); g.bond = Math.max(0, wdN(g.bond)); g.hdep = Math.max(0, wdN(g.hdep)); g.inc = wdN(g.inc); // 決定 0130：新借款本金、館債本金、莊家存款、今天的利息淨收入
  for (const k of ["dep", "loan"]) { if (!wuBox(g[k])) g[k] = {}; for (const id of Object.keys(g[k])) { g[k][id] = Math.max(0, wdN(g[k][id])); if (!g[k][id]) delete g[k][id]; } }
  return g;
}
const gbLed = (house, box, src, n) => { if (!n) return; if (!wuBox(house.led)) house.led = {}; if (!wuBox(house.led[box])) house.led[box] = {}; house.led[box][src] = wdN(house.led[box][src]) + n; };
// ---------- 佩佩銀行跟賭場分開（決定 0130）：館友借款、館債、存款利息改由 gb 出錢；莊家水位上繳 hdep；盈餘 30% 莊家、70% 博物館資金 ----------
// gb 多的欄位：loansOut（新借款借出去沒收回的本金）、bond（館債欠館友的本金）、hdep（gb 欠莊家的存款）、inc（今天累計的利息收入減支出，換日分盈餘）、mig、day
const gbSp = () => NUM.casino.bankSplit;
export const gbSplitOn = house => !!(gbSp() && gbSp().on && wuBox(house));
// 放款額度：現金 ×（1 − 準備率）− 集團存款 × gdepKeepPct% − 館債本金（館友存款本金還在錢包裡，不算；莊家存款 hdep 不扣：是自己人的資本）
export function gbRoom(house) {
  const S = gbSp(), g = gbFix(house); if (!S || !g) return 0;
  const gd = Object.values(g.dep).reduce((a, v) => a + v, 0);
  return Math.max(0, Math.floor(g.cash * (100 - S.reservePct) / 100 - gd * S.gdepKeepPct / 100 - g.bond));
}
// 借出去（館友借款）：gb 現金 → 館友錢包（呼叫的人自己加錢包的籌碼）
export function gbLend(house, n, src = "pLoan") { const g = gbFix(house); n = wdN(n); if (n <= 0) return 0; g.cash -= n; g.loansOut += n; gbLed(house, "gb", src, -n); return n; }
// 收回（館友還款、到期被扣）：owe 進 gb 現金，principal 是本金（利息 ＝ owe − principal 進 inc）
export function gbCollect(house, owe, principal, src = "pLoanBack") { const g = gbFix(house); owe = wdN(owe); principal = Math.min(wdN(principal), owe); if (owe <= 0) return 0; g.cash += owe; g.loansOut = Math.max(0, g.loansOut - principal); g.inc += owe - principal; gbLed(house, "gb", src, owe); return owe; }
// 付利息（館友存款、館債）：gb 現金付得出多少付多少，回傳實付
export function gbPay(house, want, src) { const g = gbFix(house); const n = Math.min(wdN(want), Math.max(0, g.cash)); if (n <= 0) return 0; g.cash -= n; g.inc -= n; gbLed(house, "gb", src, -n); return n; }
// 館債：賣出收的錢進 gb（本金記在 g.bond）、到期付出去（本金先、利息後；付不出的回傳 short 給呼叫的人開憑證）
export function gbBondIn(house, n) { const g = gbFix(house); n = wdN(n); if (n <= 0) return 0; g.cash += n; g.bond += n; gbLed(house, "gb", "pBond", n); return n; }
export function gbBondPay(house, owe, principal) { const g = gbFix(house); const n = Math.min(wdN(owe), Math.max(0, g.cash)); if (n <= 0) return 0; const pr = Math.min(n, wdN(principal), g.bond); g.cash -= n; g.bond -= pr; g.inc -= n - pr; gbLed(house, "gb", "pBond", -n); return n; }
// 每天（換日第一次碰到莊家）：舊館債本金搬一次、莊家的存款利息、水位上繳、莊家缺錢時領回、盈餘分配
// 政府帳併入公共機構（決定 0140）：house.gov 每天搬進已知世界，記在公共機構（g-public）的帳上。是搬，不是憑空：
//   gov 少 n、house.world 多 n、公共機構的 adj 多 n（其他單位不動）。流水：flow.govSweep ＝ −n（政府帳的角度），led.world.govSweep ＝ +n。每天壹次（house.govDay 擋）。回傳搬了多少
export function govSweep(house, day) {
  const S = NUM.casino.govSweep; if (!S || !S.on || !wuBox(house) || house.world == null || !wdDayOk(day) || house.govDay === day) return 0;
  house.govDay = day;
  let n = Math.floor(Math.max(0, wdN(house.gov)) * Math.max(0, Math.min(100, +S.pct || 0)) / 100);
  if (S.capPct > 0) n = Math.min(n, Math.floor(wtBase(house, "g-public") * S.capPct / 100));
  if (n <= 0) return 0;
  const before = wdN(house.world); house.gov = wdN(house.gov) - n; house.world = before + n;
  gbLed(house, "flow", "govSweep", -n); gbLed(house, "world", "govSweep", n);
  wuCredit(house, before, "g-public", n);
  return n;
}
// 政府撥款給文化部（決定 0140，翊文 11-20）：公共機構的帳壹次搬 cultureGrant 給文化部，贈款、不記債；只動帳上分類（adj），house.world 不動。house.govGrant 擋重複；公共機構帳上不夠就搬得出的。回傳搬了多少
export function govGrant(house) {
  const S = NUM.casino.govSweep; if (!S || !S.on || !wuBox(house) || house.world == null || house.govGrant || !(S.cultureGrant > 0)) return 0;
  const n = wtMove(house, "g-public", "u-culture", S.cultureGrant, "tradeGovGrant"); if (n > 0) house.govGrant = n; return n;
}
export function gbDaily(house, day) {
  const S = gbSp(), g = gbFix(house); if (!S || !S.on || !g || !wdDayOk(day) || g.day === day) return false;
  g.day = day;
  if (!g.mig) { g.mig = 1; const n = Math.max(0, Math.min(wdN(S.bondMove), Math.max(0, wdN(house.bankroll)))); if (n > 0) { house.bankroll -= n; gbLedFlow(house, "bondMove", -n); g.cash += n; g.bond += n; gbLed(house, "gb", "bondMove", n); } } // 舊的沒到期的館債本金：莊家搬現金給 gb（金額查正式站，11-19 ＝ 2,100,000）
  const gd = Object.values(g.dep).reduce((a, v) => a + v, 0), keep = Math.floor(gd * S.gdepKeepPct / 100) + g.bond;
  if (g.hdep > 0) { const iv = Math.min(Math.floor(g.hdep * S.hdepRate / 100), Math.max(0, g.cash)); if (iv > 0) { g.cash -= iv; g.inc -= iv; house.bankroll += iv; gbLedFlow(house, "hdepInt", iv); gbLed(house, "gb", "hdepInt", -iv); } } // gb 付莊家存款的利息
  if (g.inc > 0) { const s = Math.min(g.inc, Math.max(0, g.cash - keep)); if (s > 0) { const h = Math.floor(s * S.sweepHousePct / 100), b = s - h; g.cash -= s; g.inc -= s; house.bankroll += h; gbLedFlow(house, "gbSweepH", h); gbLed(house, "gb", "gbSweepH", -h); house.budget = wdN(house.budget) + b; gbLedFlow(house, "gbSweepB", b); gbLed(house, "gb", "gbSweepB", -b); } } // 盈餘：30% 莊家、70% 博物館資金
  if (wdN(house.bankroll) > S.hdepW) { const x = wdN(house.bankroll) - S.hdepW; house.bankroll -= x; gbLedFlow(house, "hdepIn", -x); g.cash += x; g.hdep += x; gbLed(house, "gb", "hdepIn", x); } // A：莊家水位上繳
  else if (wdN(house.bankroll) < S.hdepLow && g.hdep > 0) { // B：莊家缺錢才領回，每天最多 gb 多餘現金的 hdepOutPct%
    const avail = Math.max(0, g.cash - keep), take = Math.min(g.hdep, Math.floor(avail * S.hdepOutPct / 100), S.hdepLow - wdN(house.bankroll)); if (take > 0) { g.cash -= take; g.hdep -= take; house.bankroll += take; gbLedFlow(house, "hdepOut", take); gbLed(house, "gb", "hdepOut", -take); }
  }
  return true;
}
const gbLedFlow = (house, src, n) => gbLed(house, "flow", src, n); // 莊家（或博物館資金，用 CAS_BOOK_POOL 分）的角度：正＝進這個帳
// 單位 → 準備金（存款、還款）
function gbIn(house, unit, n, src) { const g = gbFix(house); n = Math.min(wdN(n), Math.max(0, wuHave(house, unit))); if (n <= 0) return 0; house.world = wdN(house.world) - n; wuDebit(house, unit, n); g.cash += n; gbLed(house, "world", src, -n); gbLed(house, "gb", src, n); return n; }
// 準備金 → 單位（領回、放款）
function gbOut(house, unit, n, src) { const g = gbFix(house); n = Math.min(wdN(n), Math.max(0, g.cash)); if (n <= 0) return 0; const before = wdN(house.world); house.world = before + n; wuCredit(house, before, unit, n); g.cash -= n; gbLed(house, "world", src, n); gbLed(house, "gb", src, -n); return n; }
// 博物館資金 → 準備金（銀行借的）
function gbBorrow(house, n, src) { const g = gbFix(house); n = wdN(n); if (n <= 0) return 0; house.budget = wdN(house.budget) - n; g.cash += n; g.debt += n; gbLed(house, "flow", src, -n); gbLed(house, "gb", src, n); return n; }
// 準備金 → 博物館資金（還本金 isDebt、付利息）
function gbRepay(house, n, src, isDebt) { const g = gbFix(house); n = Math.min(wdN(n), Math.max(0, g.cash)); if (isDebt) n = Math.min(n, g.debt); if (n <= 0) return 0; house.budget = wdN(house.budget) + n; g.cash -= n; if (isDebt) g.debt -= n; gbLed(house, "flow", src, n); gbLed(house, "gb", src, -n); return n; }
// 博物館資金 ↔ 單位：存款利息（博物館資金付給集團）、放款利息（集團付進博物館資金）
function gbInt(house, unit, n, pay) {
  n = wdN(n); if (n <= 0) return 0;
  if (pay) { n = Math.min(n, Math.max(0, wdN(house.budget))); if (n <= 0) return 0; const before = wdN(house.world); house.budget = wdN(house.budget) - n; house.world = before + n; wuCredit(house, before, unit, n); gbLed(house, "flow", "groupIntDep", -n); gbLed(house, "world", "groupIntDep", n); }
  else { n = Math.min(n, Math.max(0, wuHave(house, unit))); if (n <= 0) return 0; house.world = wdN(house.world) - n; wuDebit(house, unit, n); house.budget = wdN(house.budget) + n; gbLed(house, "flow", "groupIntLoan", n); gbLed(house, "world", "groupIntLoan", -n); }
  return n;
}
function wtBankDaily(house, day) {
  const T = wtCfg(), B = T && T.bank, w = whFix(house); if (!B || !B.on || !w) return;
  const g = gbFix(house), x = wuFix(house), mon = new Date(day + "T00:00:00Z").getUTCDay() === 1;
  for (const u of wtTop()) {
    const st = w.st[u] ? w.st[u].s : "normal", base = Math.max(1, wtBase(house, u)), dep = g.dep[u] || 0, loan = g.loan[u] || 0;
    if (dep > 0) gbInt(house, u, Math.floor(dep * B.depRate / 100), true);
    if (loan > 0) gbInt(house, u, Math.ceil(loan * B.loanRate / 100), false);
    if (st === "normal") { // 存：帳上超過 depFloor 的部分存 depShare%，上限池子的 depCap%
      const ratio = wdN(x.adj[u]) / base, room = Math.floor(base * B.depCap / 100) - dep, want = Math.floor((ratio - B.depFloor) * base * B.depShare / 100), n = gbIn(house, u, Math.max(0, Math.min(want, room)), "groupDeposit");
      if (n > 0) g.dep[u] = dep + n;
      if (loan > 0 && mon && wdN(x.adj[u]) > 0) { const back = gbIn(house, u, loan, "groupRepay"); if (back > 0) { g.loan[u] = loan - back; if (g.loan[u] <= 0) delete g.loan[u]; } } // 週一帳上回正就還
    } else { // 不好：把存款領回（每天 1/3；準備金不夠先向博物館資金借）；還沒借的借（文化部不借）
      if (dep > 0) {
        const want = Math.ceil(dep / 3); if (want > g.cash && B.budgetMax > 0) gbBorrow(house, Math.min(want - g.cash, Math.max(0, Math.floor(Math.max(0, wdN(house.budget)) * B.budgetMax / 100) - g.debt)), "groupBankLoan");
        const n = gbOut(house, u, want, "groupWithdraw"); if (n > 0) { g.dep[u] = dep - n; if (g.dep[u] <= 0) delete g.dep[u]; }
      }
      if (!loan && u !== "u-culture") {
        const want = Math.floor(base * B.loanPct / 100); let cap = Math.floor(Math.max(0, g.cash) * (100 - B.reservePct) / 100);
        if (want > cap && B.budgetMax > 0) { const room = Math.max(0, Math.floor(Math.max(0, wdN(house.budget)) * B.budgetMax / 100) - g.debt), b2 = Math.min(want - cap, room); if (b2 > 0) { gbBorrow(house, b2, "groupBankLoan"); cap += b2; } }
        const n = gbOut(house, u, Math.min(want, cap), "groupLoan"); if (n > 0) { g.loan[u] = n; wtLog(w, day, u + " 向佩佩銀行借 " + n); }
      }
    }
  }
  if (g.debt > 0) { gbRepay(house, Math.floor(g.debt * B.debtRate / 100), "groupBankInt", false); const d0 = Object.values(g.dep).reduce((a, v) => a + v, 0); gbRepay(house, Math.max(0, g.cash - Math.floor(d0 * B.reservePct / 100)), "groupBankRepay", true); } // 利息、有錢就還博物館資金（留準備金）
}
// 每天：B 貨款（來源集團今天分到的成長 × pct% × 健康值）、A 借款利息
function wtDaily(house, day, grown) {
  const T = wtCfg(), w = whFix(house); if (!T || !T.on || !w) return;
  const x = wuFix(house), g = wdN(grown), world = Math.max(1, wdN(house.world));
  if (g > 0) for (const t of T.goods) { const h = whClamp(+w.h[t.from] || 1, 0.6, 1.2), n = Math.floor(g * (x.r[t.from] || 0) * t.pct / 100 * h); wtGo(house, day, "tradeGoods", t.from, t.to, n); }
  for (const id of Object.keys(w.loan)) { const L = w.loan[id], iv = Math.max(1, Math.ceil(L.amt * T.loan.ratePct / 100)); wtGo(house, day, "tradeInterest", id, WT_FIN, iv); }
  wtFlowsDaily(house, day); wtBankDaily(house, day);
  wtTranche(house, day);
}
// ---------- 陸續發生（決定 0120，trade.live）：每天 96 格（05:00 起每 15 分鐘壹格），換日時只「排」，碰到莊家文件時補算到現在 ----------
// house.wh.tr = { day, plan: { 鍵: { k 種類, f 從, t 到, n 全天總額（有正負：只有 tradeRev，＞0 公共給單位）, p 已搬 } }, ev: [{ e "loan"|"repay", u, at 第幾格, done }] }
// 每格的份量照「白天多、夜裡少」的形狀加壹點固定的隨機（鍵＋格數雜湊，不用 RNG，同壹天同壹筆永遠壹樣）；全天加起來等於原本壹次入帳的總額
const WT_N = 96;
const wtHash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 100000; };
const wtWt = (key, i) => (0.4 + 0.6 * Math.sin(Math.PI * (i + 0.5) / WT_N)) * (0.6 + 0.8 * wtHash(key + "|" + i));
const wtCum = (key, k) => { let a = 0, t = 0; for (let i = 0; i < WT_N; i++) { const v = wtWt(key, i); t += v; if (i < k) a += v; } return a / t; };
const wtExec = (house, kind, from, to, n) => from === WU_PUB ? wtPub(house, to, n) : to === WU_PUB ? -wtPub(house, from, -n) : wtMove(house, from, to, n, kind);
// 排壹筆（live 關了就當場搬）。n 可以是負的（只有 tradeRev：單位給公共，這時 f、t 照「公共 → 單位」寫、n 是負的）
function wtGo(house, day, kind, from, to, n) {
  const T = wtCfg(), w = whFix(house); n = Math.floor(wdN(n)); if (!n) return 0;
  if (!T.live) return wtExec(house, kind, from, to, n);
  const tr = wtTr(w, day); tr.plan[kind + "|" + from + "|" + to] = { k: kind, f: from, t: to, n, p: 0 }; return n;
}
// 搬完壹小筆後記帳：借款加到欠款、還款扣掉（欠完就刪、寫壹句「還款」）
function wtAfter(house, w, day, P, moved) {
  if (P.k === "tradeLoan" && moved > 0) { const u = P.t, L = w.loan[u] || (w.loan[u] = { amt: 0, day }); L.amt += moved; }
  else if (P.k === "tradeRepay" && moved > 0) { const u = P.f, L = w.loan[u]; if (L) { L.amt -= moved; if (L.amt <= 0) { delete w.loan[u]; wtLog(w, day, u + " 還款"); } } }
}
function wtTr(w, day) { if (!wuBox(w.tr) || w.tr.day !== day) w.tr = { day, plan: {}, ev: [] }; return w.tr; }
// 補算：碰到莊家文件時呼叫（t ＝ 現在的毫秒）；排的日子過了就全部補完
export function wtAdvance(house, day, t) {
  const T = wtCfg(), w = house && wuBox(house.wh) ? house.wh : null; if (!T || !T.on || !T.live || !w || !wuBox(w.tr)) return 0;
  const tr = w.tr; let k = WT_N;
  if (tr.day === day) { if (t == null || !Number.isFinite(+t)) return 0; const min = (Math.floor(+t / 60000) + 480) % 1440; k = Math.max(0, Math.min(WT_N, Math.floor(((min - 300 + 1440) % 1440) / 15) + 1)); }
  else if (tr.day > day) return 0;
  let moved = 0;
  for (const key of Object.keys(tr.plan)) {
    const P = tr.plan[key], goal = Math.floor(Math.abs(P.n) * (k >= WT_N ? 1 : wtCum(tr.day + "|" + key, k))), d = goal - P.p; if (d <= 0) continue;
    P.p = goal; const m = Math.abs(wtExec(house, P.k, P.f, P.t, P.n > 0 ? d : -d)); moved += m; wtAfter(house, w, tr.day, P, m);
  }
  if (k >= WT_N) delete w.tr;
  return moved;
}
const WT_WEEK = 7;
// 整週分散的借款、還款：每天排壹筆小的（週一定下的總額 ÷ 7，最後壹天補零頭）；每天每筆只排壹次（last）
function wtTranche(house, day) {
  const T = wtCfg(), w = whFix(house); if (!T || !T.on || !T.live || !w) return;
  for (const [box, kind, from, to] of [["draw", "tradeLoan", WT_FIN, null], ["rep", "tradeRepay", null, WT_FIN]]) {
    if (!wuBox(w[box])) continue;
    for (const id of Object.keys(w[box])) {
      const D = w[box][id]; if (D.last === day) continue;
      const n = D.left <= 1 ? D.n - D.taken : Math.floor(D.n / WT_WEEK); D.last = day; D.left--; D.taken += n;
      if (D.left <= 0) delete w[box][id];
      wtGo(house, day, kind, from || id, to || id, n);
    }
  }
}
const wtAt = (day, key) => Math.floor(wtHash(day + "|" + key) * (WT_N - 6)); // 單筆事件發生在當天的第幾格（最後 6 格不排，留給補算）
// 公共 ↔ 單位（C 股票營收）：n > 0 公共給單位、n < 0 單位給公共；公共是剩下的，所以只改單位的 adj
function wtPub(house, id, n) {
  const x = wuFix(house); if (!x || !(id in x.r) || id === WU_PUB) return 0; n = wdN(n);
  if (n > 0) n = Math.min(n, Math.max(0, wuAmounts(house)[WU_PUB])); else n = -Math.min(-n, wuHave(house, id));
  x.adj[id] = wdN(x.adj[id]) + n; if (n > 0) wtLed(house, "tradeRev", WU_PUB, id, n); else wtLed(house, "tradeRev", id, WU_PUB, -n); return n;
}
// 週一（狀態之前）：A 的還款（健康值扣掉借款帶來的那一塊，仍 ≥ repayH 才還）、C 股票營收
function wtWeekStart(house, day) {
  const T = wtCfg(), w = whFix(house); if (!T || !T.on || !w) return;
  for (const id of Object.keys(w.loan)) {
    const L = w.loan[id], base = Math.max(1, wtBase(house, id)), adj = wdN(wuFix(house).adj[id]);
    const hNo = (+w.h[id] || 1) - whClamp(adj / base, -T.dCap, T.dCap) * T.wealthW + whClamp((adj - L.amt) / base, -T.dCap, T.dCap) * T.wealthW; // 不含借款的健康值
    if (hNo >= T.loan.repayH) { if (T.live) { if (!wuBox(w.rep)) w.rep = {}; w.rep[id] = { n: L.amt, left: WT_WEEK, taken: 0, last: null }; } else { const n = wtMove(house, id, WT_FIN, L.amt, "tradeRepay"); if (n >= L.amt) { delete w.loan[id]; wtLog(w, day, id + " 還款"); } else L.amt -= n; } }
  }
  for (const u of whUnits()) { const c = +w.chg[u.id] || 0; if (!c) continue; wtGo(house, day, "tradeRev", WU_PUB, u.id, Math.floor(wtBase(house, u.id) * T.revPct / 100 * c)); } // 旗下股票漲：公共給單位；跌：單位給公共
}
// 週一（狀態出來後）：狀態不是一般的集團，跟金融集團借自己池子的 pct%（金融集團最多借出自己現有的 finPct%）；已經有借款的不再借
function wtLoanTake(house, day) {
  const T = wtCfg(), w = whFix(house); if (!T || !T.on || !w) return;
  for (const u of whUnits()) {
    if (u.id === WT_FIN || w.st[u.id].s === "normal" || w.loan[u.id] || (wuBox(w.draw) && w.draw[u.id])) continue;
    if (T.live) { // 整週分散：週一定下要借多少，之後每天借 1/7（最後壹天補零頭）
      const n = Math.min(Math.floor(wtBase(house, u.id) * T.loan.pct / 100), Math.floor(wuHave(house, WT_FIN) * T.loan.finPct / 100));
      if (n >= WT_WEEK) { if (!wuBox(w.draw)) w.draw = {}; w.draw[u.id] = { n, left: WT_WEEK, taken: 0, last: null }; wtLog(w, day, u.id + " 借 " + n); }
      continue;
    }
    const want = Math.floor(wtBase(house, u.id) * T.loan.pct / 100), cap = Math.floor(wuHave(house, WT_FIN) * T.loan.finPct / 100), n = wtMove(house, WT_FIN, u.id, Math.min(want, cap), "tradeLoan");
    if (n > 0) { w.loan[u.id] = { amt: n, day }; wtLog(w, day, u.id + " 借 " + n); }
  }
}
// 集團之間的借款（最近 days 天內的）：給日報和市場新聞用；只寫發生過的（誰借了、誰還了），不寫金額太細
export function wtNews(house, day, days = 1) {
  const w = house && wuBox(house.wh) ? house.wh : null; if (!w || !Array.isArray(w.trade)) return [];
  const from = whAddDays(day, -days);
  return w.trade.filter(e => e && e.day > from && e.day <= day).map(e => { const m = /^([a-z0-9-]+) (借|還款)/.exec(e.t || ""); return m ? { day: e.day, unit: m[1], to: m[2] === "借" ? "loan" : "repay", text: `${whName(m[1])}${m[2] === "借" ? "跟金融集團借了錢" : "還了金融集團的借款"}` } : null; }).filter(Boolean);
}
// ---------- 財報的「集團之間的往來」（決定 0120）：本週（週一 05:00 起）累計、目前欠金融集團的。不列個人，集團是虛構的 ----------
// house.wh.wk = { day: 這個週一, u: 當時 house.led.units 的快照 }
function wtWeekSnap(house, day) { const w = whFix(house); if (!w) return; w.wk = { day, u: Object.assign({}, house.led && house.led.units) }; }
// 回傳 { since 這週從哪天起, rows: [{ k 種類, from, to, n }]（本週累計，大的在前）, loans: [{ unit, name, amt, day }] }；還沒有快照回 null
export function wtCard(house) {
  const T = wtCfg(), w = house && wuBox(house.wh) ? house.wh : null; if (!T || !T.on || !w || !wuBox(w.wk)) return null;
  const cur = (house.led && house.led.units) || {}, rows = [];
  for (const key of Object.keys(cur)) { const n = Math.floor(wdN(cur[key]) - wdN(w.wk.u[key])); if (n <= 0 || !key.startsWith("trade")) continue; const [k, from, to] = key.split("|"); rows.push({ k, from, to, fromName: from === WU_PUB ? "公共" : whName(from), toName: to === WU_PUB ? "公共" : whName(to), n }); }
  rows.sort((a, b) => b.n - a.n);
  const loans = Object.keys(w.loan || {}).map(id => ({ unit: id, name: whName(id), amt: Math.floor(wdN(w.loan[id].amt)), day: w.loan[id].day })).sort((a, b) => b.amt - a.amt);
  return { since: w.wk.day, rows, loans };
}
const WH_TEXT = { normal: "恢復正常", cut: "減薪", squeeze: "緊縮", layoff: "裁員" };
export const whName = id => { const u = WORLD_UNITS.find(x => x.id === id); return u ? u.name : id; };
// 已發生的事（最近 days 天內換狀態的）：給日報和市場新聞用。只寫發生過的，不預告
export function whNews(house, day, days = 1) {
  const w = house && wuBox(house.wh) ? house.wh : null; if (!w) return [];
  const from = whAddDays(day, -days);
  return w.ev.filter(e => e.day > from && e.day <= day).map(e => ({ day: e.day, unit: e.unit, to: e.to, text: `${whName(e.unit)}${WH_TEXT[e.to]}了` }));
}

// 財報「各行業的景氣」上面的兩三句白話摘要（11-20 翊文：「景氣市場在財報有沒有文字敘述?」→「好，加摘要」）。
// 只從各市場的分級組字（不寫數字、不寫死市場名），新增市場自己跟著長
const WM_ORDER = ["low", "cool", "plain", "warm", "hot"];
export function wmSummary(markets) {
  const ms = (markets || []).filter(m => m && WM_ORDER.includes(m.band)); if (!ms.length) return [];
  const pick = bs => ms.filter(m => bs.includes(m.band)).map(m => m.name), join = a => a.length > 3 ? a.slice(0, 3).join("、") + `等 ${a.length} 個` : a.join("、");
  const hot = pick(["hot", "warm"]), cold = pick(["low", "cool"]), flat = pick(["plain"]), out = [];
  if (hot.length && cold.length) out.push(`${join(hot)}正熱，${join(cold)}偏冷，各行業冷熱不壹。`);
  else if (hot.length) out.push(hot.length === ms.length ? "各行業都在回溫，整體景氣不錯。" : `${join(hot)}正熱，其他行業平穩。`);
  else if (cold.length) out.push(cold.length === ms.length ? "各行業都偏冷，整體景氣低迷。" : `${join(cold)}偏冷，其他行業平穩。`);
  else out.push("各行業都很平穩，沒有特別冷或熱的。");
  const top = ms.slice().sort((a, b) => WM_ORDER.indexOf(b.band) - WM_ORDER.indexOf(a.band));
  if (top[0].band === "hot") out.push(`最熱的是${top[0].name}。`);
  if (top[top.length - 1].band === "low") out.push(`${top[top.length - 1].name}最冷，那壹行的人來館少、花得也省。`);
  const up = ms.filter(m => WM_ORDER.includes(m.prev) && WM_ORDER.indexOf(m.band) > WM_ORDER.indexOf(m.prev)).map(m => m.name), down = ms.filter(m => WM_ORDER.includes(m.prev) && WM_ORDER.indexOf(m.band) < WM_ORDER.indexOf(m.prev)).map(m => m.name);
  if (ms.some(m => WM_ORDER.includes(m.prev))) out.push(up.length || down.length ? `跟上週比，${[up.length ? join(up) + "轉熱" : "", down.length ? join(down) + "轉冷" : ""].filter(Boolean).join("，")}。` : "跟上週比，各行業冷熱沒變。");
  if (hot.length || cold.length) out.push("景氣熱的行業，員工來館比較勤、花錢比較大方，對應的集團股也比較有力；冷的反過來。");
  return out;
}
// 財報「已知世界」卡的資料（只給分布，不列每家的數字）：{ day, states 各狀態幾個單位, bands h 的分布 [＜squeeze, squeeze～cut, cut～1.1, ≥1.1], avgMult 預算倍率平均, events 最近一週換狀態的 }
export function whCard(house, day) {
  const w = house && wuBox(house.wh) ? house.wh : null; if (!w) return null;
  const C = whCfg(), us = whUnits(), states = { normal: 0, cut: 0, squeeze: 0, layoff: 0 }, bands = [0, 0, 0, 0];
  us.forEach(u => { const s = w.st[u.id]; if (s) states[s.s]++; const h = +w.h[u.id]; if (h > 0) bands[{ tight: 0, weak: 1, normal: 2, strong: 3 }[statBandOf("unitHealth", h)]]++; }); // 分級只寫在 stat_view.js
  const avg = us.length ? us.reduce((a, u) => a + whMult(house, u.id), 0) / us.length : 1;
  const un = [0, 0, 0, 0]; us.forEach(u => { un[{ calm: 0, stir: 1, uneasy: 2, turmoil: 3 }[statBandOf("unitUnrest", whUnrest(house, u.id))]]++; });
  const lw = wuBox(house.mk) && wuBox(house.mk.lw) && wuBox(house.mk.lw.b) ? house.mk.lw.b : null;
  const mk = wuBox(house.mk) ? WORLD_MARKETS.map(d => { const v = statView("marketB", null, wmB(house, d.id)), pv = lw && Number.isFinite(+lw[d.id]) ? statView("marketB", null, +lw[d.id]) : null; return v ? { id: d.id, name: d.name, band: v.band, label: v.label, tone: v.tone, prev: pv ? pv.band : null } : null; }).filter(Boolean) : []; // 各市場景氣只給分級（決定 0121）
  return { day: w.day, states, bands, unrestBands: un, markets: mk, marketSummary: wmSummary(mk), mood: w.mood ? { v: w.mood.v, band: statBandOf("crowdMood", w.mood.v) } : null, avgMult: Math.round(avg * 100) / 100, events: whNews(house, day || w.day, 7).map(e => ({ day: e.day, text: e.text })).concat(wtNews(house, day || w.day, 7)) };
}

// ================================================================
//  W6 NPC 錢包和換工作（決定 0086，規劃 docs/世界經濟規劃.md 3.3 階段 B）
//  house.npcw ＝ { day, bal: { NPC id: 錢包裡有多少 }, lay: { id: { since } }, job: { id: { unit, since } }, ev: [{ day, npc, from, to, t }] }
//  錢包的錢在帳上是已知世界分類裡的壹個成員「u-wallets」（比例 0，只有 adj），所以總和仍等於 house.world；**沒有憑空多錢**：
//    每天發薪（nwPayday）：把每位 NPC 的錢包補到「今天預算 × targetDays 天」（預算 ＝ perDay × dayPct% × 所屬集團的 W5 倍率），從所屬集團出（集團的錢不夠就少補）；多出來的（倍率降了）退回集團。
//    NPC 來館花錢（nwSpend）：從錢包出（錢包不夠就當天不花），錢離開已知世界到館。錢包有上限、每天補回，所以不會無限長、也不會歸零（最少剩 targetDays−1 天的預算）。
//  換工作（每週一，接 W5）：所屬集團進入「裁員」時，集團裡有職位的 NPC 每人 layoffPct% 被裁；被裁的每週 findPct% 找到新工作（景氣一般的集團，照比例抽），滿 joinWeeks 週一定找到；原本的集團恢復了就直接回去。
//    W5 還沒有資料（house.wh 不存在）時什麼都不換、倍率 1，照常運作。
// ================================================================
export const WU_WAL = "u-wallets";
const nwDays = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
export function nwFix(house) {
  if (!wuBox(house)) return null;
  const w = wuBox(house.npcw) ? house.npcw : (house.npcw = {});
  w.day = wdDayOk(w.day) ? w.day : null;
  for (const k of ["bal", "lay", "job", "san", "hist", "arc", "poke"]) if (!wuBox(w[k])) w[k] = {};
  w.sanDay = wdDayOk(w.sanDay) ? w.sanDay : null;
  for (const id of Object.keys(w.bal)) { const n = wdN(w.bal[id]); if (n > 0) w.bal[id] = n; else delete w.bal[id]; }
  if (!Array.isArray(w.ev)) w.ev = [];
  w.ev = w.ev.filter(e => wuBox(e) && wdDayOk(e.day) && typeof e.npc === "string").slice(-20);
  return w;
}
export const nwBal = (house, id) => wdN(house && house.npcw && house.npcw.bal && house.npcw.bal[id]);
export const nwTotal = house => Object.values((house && house.npcw && house.npcw.bal) || {}).reduce((a, b) => a + wdN(b), 0);
// 這位 NPC 現在算哪個頂層集團：換過工作用新的，沒有就用名單的（沒有單位 ＝ 家計）
export function nwUnitOf(house, n) {
  const j = house && house.npcw && wuBox(house.npcw.job) && house.npcw.job[n && n.id];
  return j && typeof j.unit === "string" ? wuUnitOf({ unit: j.unit }) : wuUnitOf(n && n.job);
}
// 來館花錢：錢包出 n（house.world 已經少了 n）。回傳錢包實際出了多少
export function nwSpend(house, id, n) {
  n = wdN(n); const w = nwFix(house);
  if (!w || n <= 0) return 0;
  const take = Math.min(n, nwBal(house, id), wuHave(house, WU_WAL)); if (take <= 0) return 0;
  const before = wdN(house.world) + n, x = wuFix(house), deltas = {}; for (const k of Object.keys(x.r)) if (k !== WU_PUB) deltas[k] = k === WU_WAL ? -take : 0;
  wuMove(house, before, deltas); w.bal[id] = nwBal(house, id) - take; if (w.bal[id] <= 0) delete w.bal[id];
  return take;
}
// 在集團和錢包之間搬 n（正：集團 → 錢包；負：錢包 → 集團）。house.world 不變
function nwMove(house, unitId, id, n) {
  const x = wuFix(house), w = nwFix(house), world = wdN(house.world), deltas = {}; for (const k of Object.keys(x.r)) if (k !== WU_PUB) deltas[k] = 0;
  if (!(unitId in x.r) || unitId === WU_PUB) return 0;
  const m = n > 0 ? Math.min(n, wuHave(house, unitId)) : -Math.min(-n, nwBal(house, id), wuHave(house, WU_WAL)); if (!m) return 0;
  deltas[unitId] = -m; deltas[WU_WAL] = m; wuMove(house, world, deltas); w.bal[id] = nwBal(house, id) + m; if (w.bal[id] <= 0) delete w.bal[id];
  if (m > 0) wtLed(house, "wageNpc", unitId, WU_WAL, m); else wtLed(house, "wageBack", WU_WAL, unitId, -m); // 金流圖（決定 0128）：發薪水、多的退回，只記帳（累計，不是每人壹筆）
  return m;
}
// 每天第一次：發薪（補錢包）；週一接 W5 換工作。list ＝ 有 budget 的 NPC 名單（伺服器的 NPC_LIST）。同一天不重複。回傳 true ＝ 這次有做
export function nwPayday(house, day, list) {
  const w = nwFix(house), C = NUM.casino.worldDoc.wallet, P = NUM.casino.npcSpend;
  if (!w || !C || !C.on || !wdDayOk(day) || (w.day && day <= w.day) || !Array.isArray(list)) return false;
  w.day = day;
  const people = list.filter(n => wuBox(n) && n.kind !== "trace" && n.budget && n.budget.perDay > 0);
  if (house.wh && whIsMon(day)) nwJobs(house, day, people);
  for (const n of people) {
    const u = nwUnitOf(house, n), target = Math.floor(n.budget.perDay * nwBudgetMult(house, n, u) * P.dayPct / 100) * C.targetDays, bal = nwBal(house, n.id);
    if (bal < target) nwMove(house, u, n.id, target - bal); else if (bal > target) nwMove(house, u, n.id, -(bal - target));
  }
  return true;
}
// 換工作（每週一）：只動 house.npcw.lay、house.npcw.job、ev
function nwJobs(house, day, people) {
  const w = nwFix(house), C = NUM.casino.worldDoc.wallet, st = house.wh.st || {}, tops = wuTop().filter(u => u.kind !== "story");
  for (const n of people) {
    if (!(n.job && n.job.unit)) continue; // 學生、退休、自由業不換
    const cur = nwUnitOf(house, n), home = wuUnitOf(n.job), s = st[cur] && st[cur].s, hash = k => (hashStr(`${n.id}|${day}|${k}`) % 1000) / 10; // 0～100
    if (w.lay[n.id]) {
      if (st[home] && st[home].s === "normal" && cur === home) { delete w.lay[n.id]; continue; } // 原本的集團恢復了
      const weeks = Math.floor(nwDays(w.lay[n.id].since, day) / 7);
      if (weeks >= C.joinWeeks || hash("find") < C.findPct) {
        const ok = tops.filter(u => u.id !== cur && st[u.id] && st[u.id].s === "normal"); if (!ok.length) continue;
        let r = (hashStr(`${n.id}|${day}|pick`) % 100000) / 100000 * ok.reduce((a, u) => a + u.share, 0), pick = ok[ok.length - 1]; for (const u of ok) { r -= u.share; if (r < 0) { pick = u; break; } }
        w.job[n.id] = { unit: pick.id, since: day }; delete w.lay[n.id]; w.ev.push({ day, npc: n.id, from: cur, to: pick.id, t: "move" });
      }
    } else if (s === "layoff" && hash("lay") < C.layoffPct) { w.lay[n.id] = { since: day }; w.ev.push({ day, npc: n.id, from: cur, to: null, t: "lay" }); }
  }
  w.ev = w.ev.slice(-20);
}
// 已發生的換工作（最近 days 天）：給日報用。npcName(id) 由呼叫的人給（名單在別的檔）
export function nwNews(house, day, npcName, days = 1) {
  const w = house && wuBox(house.npcw) ? house.npcw : null; if (!w || !Array.isArray(w.ev)) return [];
  const from = whAddDays(day, -days), nm = id => (WORLD_UNITS.find(u => u.id === id) || {}).name || id;
  return w.ev.filter(e => e.day > from && e.day <= day).map(e => ({ day: e.day, npc: e.npc, text: e.t === "lay" ? `${npcName(e.npc)}被${nm(e.from)}裁員了` : `${npcName(e.npc)}到${nm(e.to)}工作了` }));
}

// ================================================================
//  NPC 理智（決定 0090 第一步，docs/理智值提案.md 第 1 節）：house.npcw.san[NPC id] ＝ 0～100，沒有紀錄 ＝ 初始值（NUM.casino.worldDoc.san.start）。累積型：
//    每天收盤時（casNpcLive 的整天結算）照那天的行程加減：去地下 −2（一天最多 −4）、去餐車 +1、完全沒來館 +3（休息；這兩項只補到初始值為止）、自然往初始值靠 1；被裁 −8、找到新工作 +5（W6 的 ev，那天發生的）；
//    排程填的 sanEvents（劇情決定的欄位，之後接）。一天最多變 ±daily（排程和換工作的事件不算）。夾 0～100。
//  理智低的影響（只放小的）：< lowRoute 不去地下（那一站不花錢）；< lowStars 展廳評價少 1 顆星；< lowBudget 預算 ×budgetMult（再乘 W5 的倍率，總倍率仍 ≥ health.floor）。
//  玩家看得到數字和分級（statView 的 npcSan，翊文 11-15 第 3 題）。
// ================================================================
export const nwSan = (house, id) => { const v = house && house.npcw && wuBox(house.npcw.san) ? house.npcw.san[id] : undefined; return v == null ? NUM.casino.worldDoc.san.start : whClamp(wdN(v), 0, 100); };
// 預算倍率：集團的 W5 倍率 ×（理智低時 budgetMult），不低於 health.floor
export function nwBudgetMult(house, n, unitId) {
  const S = NUM.casino.worldDoc.san, m = whMult(house, unitId) * (nwSan(house, n && n.id) < S.lowBudget ? S.budgetMult : 1) * wmNpcMul(house, n, "spend");
  return Math.max(NUM.casino.worldDoc.health.floor, m);
}
// 收盤：照那天的行程更新每位的理智。visits ＝ npcVisitsToday 的結果；people ＝ 有預算的 NPC；extra ＝ { id: 排程填的數字 }（可以沒有）。同一天不重複
export function nwSanDay(house, day, visits, people, extra = (WORLD_EVENTS[day] && WORLD_EVENTS[day].san) || {}) {
  const w = nwFix(house), S = NUM.casino.worldDoc.san;
  if (!w || !wdDayOk(day) || (w.sanDay && day <= w.sanDay)) return false;
  w.sanDay = day; if (!wuBox(w.san)) w.san = {};
  const by = {}; for (const v of visits || []) (by[v.id] || (by[v.id] = [])).push(v.place);
  const ev = w.ev.filter(e => e.day === day);
  for (const n of people) {
    const id = n.id, places = by[id] || [], cur = nwSan(house, id);
    let d = 0;
    d += Math.max(S.cellarMax, places.filter(p => p === "cellar").length * S.cellar);
    let heal = (places.includes("food") ? S.food : 0) + (!places.length ? S.rest : 0); // 休息、餐車只能補到初始值，不會補過頭（不然沒來的人會慢慢變成 100）
    if (cur + d < S.start) d += Math.min(heal, S.start - (cur + d));
    const un = whUnrest(house, nwUnitOf(house, n)), UN = NUM.casino.worldDoc.unrest, eb = un >= UN.reverse ? -S.back : un >= UN.slow ? 0 : S.back; // 旗下集團很不安：自然回復停下來，更不安就反過來往下
    d += cur + d < S.start ? eb : cur + d > S.start ? -Math.max(0, eb) : 0;
    d += nwPokeNet(w, day, id); // 玩家互動（賭場邀請輸贏、委託）：今天的淨額，算進一天最多 ±daily 裡
    d = whClamp(d, -S.daily, S.daily);
    for (const e of ev) if (e.npc === id) d += e.t === "lay" ? S.lay : S.job;
    d += whClamp(wdN(extra[id]), -NUM.casino.worldDoc.events.sanMax, NUM.casino.worldDoc.events.sanMax); // 排程填的（劇情決定的欄位），不算進一天最多 ±10
    const nv = whClamp(cur + d, 0, 100); if (nv === S.start) delete w.san[id]; else w.san[id] = nv;
    if (nwArcTracked(n)) { const hs = Array.isArray(w.hist[id]) ? w.hist[id] : []; hs.push(nv); w.hist[id] = hs.slice(-NUM.casino.worldDoc.branch.histDays); } // 只存有 variants 的旅客的收盤理智（7 個整數）
  }
  if (wuBox(w.poke)) for (const k of Object.keys(w.poke)) if (nwDays(k, day) >= 2) delete w.poke[k]; // 舊的互動紀錄不留
  return true;
}

// ================================================================
//  旅客理智分岔（決定 0097，規劃稿第柒節）：玩家跟旅客互動 → 當天理智的小幅加減（nwPoke，記在 house.npcw.poke[日期]）→ 收盤進 nwSanDay（算進一天最多 ±10）
//  → 有 variants 的旅客存最近 7 天的收盤理智（house.npcw.hist）→ 每段第 1 週的週一早上週結算（nwArcWeek）→ 狀態 house.npcw.arc[id] = { st, prev, rec, since, end? }
//  → nwArcVariant(step, st) 決定這一步用哪一句。不看有幾位玩家（翊文 11-16：「理智只有一個，任何一個玩家都可以影響他」）；防刷靠每人每天上限、7 天均線、先有預兆、一段才結算一次。不動錢、不獎勵、不報名字。
// ================================================================
const ARC_RANK = { steady: 0, tired: 1, uneasy: 2, edge: 3 };
// 要不要追蹤這位旅客的分岔（所有有名字的旅客，劇情角色 trace 不算；排程可以對任何旅客觸發 edge，不預先指定，翊文 11-16）
export const nwArcTracked = n => !!n && typeof n.id === "string" && n.kind !== "trace";
// 今天（day）這位旅客被玩家互動加減的淨額
export const nwPokeNet = (w, day, id) => (wuBox(w && w.poke) && wuBox(w.poke[day]) && wuBox(w.poke[day].by) && wuBox(w.poke[day].by[id]) ? wdN(w.poke[day].by[id].net) : 0);
// 賭場邀請的那一手 → 互動種類（贏、二十一點、輸、爆；平手不算）
export const nwPokeKind = out => (!wuBox(out) ? null : out.kind === "win" || out.kind === "charlie" ? "win" : out.kind === "blackjack" ? "blackjack" : out.kind === "lose" ? (out.why === "bust" ? "bust" : "lose") : null);
// 記一件互動：uid 這位玩家在 day 對旅客 id 做了 kind（win、blackjack、lose、bust、jobDone、jobFail）。回傳這次真的算了多少（被上限擋掉是 0）。
// 上限：同一位玩家對同一位旅客一天最多 perUidNpc 件、淨額夾 ±netUidNpc；同一位玩家一天全館最多 perUid 件；全館對同一位旅客一天最多 ±perNpc。連輸（上一件也是輸）算 loseRow。
export function nwPoke(house, day, uid, id, kind) {
  const w = nwFix(house), B = NUM.casino.worldDoc.branch;
  if (!w || !B || !B.on || !wdDayOk(day) || typeof uid !== "string" || !uid || uid === "__proto__" || typeof id !== "string" || !id || id === "__proto__") return 0;
  const base = wdN(B.delta[kind]); if (!base) return 0;
  if (!wuBox(w.poke[day])) w.poke[day] = { by: {}, uidN: {} };
  for (const k of Object.keys(w.poke)) if (nwDays(k, day) >= 2) delete w.poke[k];
  const P = w.poke[day], nb = wuBox(P.by[id]) ? P.by[id] : (P.by[id] = { net: 0, uid: {} }), u = wuBox(nb.uid[uid]) ? nb.uid[uid] : (nb.uid[uid] = { n: 0, net: 0, last: "" });
  if (u.n >= B.perUidNpc || wdN(P.uidN[uid]) >= B.perUid) return 0;
  let d = kind === "lose" && u.last === "lose" ? wdN(B.delta.loseRow) : base;
  d = whClamp(u.net + d, -B.netUidNpc, B.netUidNpc) - u.net;
  d = whClamp(nb.net + d, -B.perNpc, B.perNpc) - nb.net;
  u.n++; P.uidN[uid] = wdN(P.uidN[uid]) + 1; u.last = kind; u.net += d; nb.net += d;
  return d;
}
// 第幾段（0 起；還沒開始 ＝ -1）
export function nwArcSeg(day) { const B = NUM.casino.worldDoc.branch; if (!wdDayOk(day)) return -1; const n = nwDays(B.segStart, day); return n < 0 ? -1 : Math.floor(n / B.segDays); }
// 分級：最近 histDays 天收盤理智的平均（四捨五入）→ 分級代碼；資料少於 minDays 天 ＝ null
export function nwArcBand(hist) {
  const B = NUM.casino.worldDoc.branch, h = Array.isArray(hist) ? hist.slice(-B.histDays).map(wdN) : [];
  return h.length < B.minDays ? null : statBandOf("npcSan", Math.round(h.reduce((a, b) => a + b, 0) / h.length));
}
// 週結算：closedDay 是剛收盤的那天；它的隔天如果是新的一段（第 1 週的週一），每位有 variants 的旅客結算一次（冪等：house.npcw.arcSeg）。
// 規則：edge 要前一次結算已經是 uneasy 以上（先有預兆）；uneasy 以上要恢復，要連續 recoverN 次結算的平均都回到有點累以上；結局（nwArcEnd）之後不再恢復。回傳這次有變的 [{ id, from, to }]
export function nwArcWeek(house, closedDay, people) {
  const w = nwFix(house), B = NUM.casino.worldDoc.branch; if (!w || !B || !B.on || !wdDayOk(closedDay)) return [];
  const next = new Date(Date.parse(closedDay + "T00:00:00Z") + 86400000).toISOString().slice(0, 10), seg = nwArcSeg(next);
  if (seg < 0 || wdN(w.arcSeg == null ? -1 : w.arcSeg) >= seg || nwDays(B.segStart, next) % B.segDays !== 0) return [];
  w.arcSeg = seg; const out = [];
  for (const n of people || []) {
    if (!nwArcTracked(n)) continue;
    const raw = nwArcBand(w.hist[n.id]); if (!raw) continue;
    const a = wuBox(w.arc[n.id]) ? w.arc[n.id] : { st: "steady", prev: "steady", rec: 0, since: null }, from = a.st;
    if (a.end) continue;
    let to = raw;
    if (to === "edge" && ARC_RANK[from] < 2) to = "uneasy";
    if (ARC_RANK[from] >= 2 && ARC_RANK[to] < 2) { a.rec = wdN(a.rec) + 1; if (a.rec < B.recoverN) to = from; else a.rec = 0; } else a.rec = 0;
    if (to !== from) { a.prev = from; a.st = to; a.since = next; out.push({ id: n.id, from, to }); }
    w.arc[n.id] = a;
  }
  return out;
}
// 給排程讀的（決定 0103）：公開的 JSON（不寫玩家名字、不寫誰造成的）。{ asOf: 最近一次結算的段首日期或 null, seg, levels: { id: { now（最近 7 天均線的分級，資料不夠 null）, st（最近一次週結算的分級）, prev（前一次的）, since, end? } }, edge: [st 是 edge 又還沒走結局的 id], newEdge: [這次結算「前一次是 uneasy 以上、這次 edge」的 id] }
export function nwArcPublic(house, day) {
  const w = house && house.npcw && wuBox(house.npcw) ? house.npcw : null, B = NUM.casino.worldDoc.branch, out = { asOf: null, seg: null, levels: {}, edge: [], newEdge: [] };
  if (!w || !B) return out;
  const hist = wuBox(w.hist) ? w.hist : {}, arc = wuBox(w.arc) ? w.arc : {}, seg = wdN(w.arcSeg == null ? -1 : w.arcSeg);
  out.seg = seg >= 0 ? seg : null; out.asOf = seg >= 0 ? new Date(Date.parse(B.segStart + "T00:00:00Z") + seg * B.segDays * 86400000).toISOString().slice(0, 10) : null;
  const ids = Array.from(new Set(Object.keys(hist).concat(Object.keys(arc)))).sort();
  for (const id of ids) {
    if (id === "__proto__") continue;
    const a = wuBox(arc[id]) ? arc[id] : null, st = a && ARC_RANK[a.st] != null ? a.st : "steady", prev = a && ARC_RANK[a.prev] != null ? a.prev : "steady";
    const x = { now: nwArcBand(hist[id]), st, prev, since: a && wdDayOk(a.since) ? a.since : null }; if (a && a.end) x.end = true;
    out.levels[id] = x;
    if (st === "edge" && !x.end) out.edge.push(id);
    if (st === "edge" && ARC_RANK[prev] >= 2 && x.since === out.asOf) out.newEdge.push(id);
  }
  return out;
}
// 排程觸發的結局（edge 那一步）之後：不再恢復
export function nwArcEnd(house, id, day) { const w = nwFix(house); if (!w || typeof id !== "string" || !id || id === "__proto__") return false; const a = wuBox(w.arc[id]) ? w.arc[id] : (w.arc[id] = { st: "edge", prev: "uneasy", rec: 0, since: day || null }); a.st = "edge"; a.end = true; return true; }
export const nwArcState = (house, id) => (house && house.npcw && wuBox(house.npcw.arc) && wuBox(house.npcw.arc[id]) && ARC_RANK[house.npcw.arc[id].st] != null ? house.npcw.arc[id].st : "steady");
// 這一步在這個狀態下怎麼走：{ text, news, action（null／"hold"／"skip"／"alt"）, delay（週，0 或 1）, edge, state }
// steady 可選 variants.steady；tired 換句子（可 delay 1 週）；uneasy／edge：hold、skip 或 alt（暫停最多一段，由呼叫的人管）。
// 掛了主線揭露的步（beat）只能換句子（steady／tired），uneasy／edge 一律當 tired（不暫停、不跳、不延後），不然揭露的管道會掉。
export function nwArcVariant(step, st) {
  const v = wuBox(step) && wuBox(step.variants) ? step.variants : null, state = ARC_RANK[st] != null ? st : "steady", r = { text: wuBox(step) ? step.text : "", news: wuBox(step) ? step.news : "", action: null, delay: 0, edge: state === "edge", state };
  if (!v || (state === "steady" && !wuBox(v.steady))) return r;
  const use = x => { if (typeof x.text === "string" && x.text) r.text = x.text; if (typeof x.news === "string" && x.news) r.news = x.news; };
  const beat = !!(step && step.beat);
  if (state === "steady") { use(v.steady); return r; }
  if (state === "tired" || beat) { const x = wuBox(v.tired) ? v.tired : null; if (x) { use(x); if (!beat) r.delay = whClamp(wdN(x.delay), 0, 1); } return r; }
  const x = wuBox(v.uneasy) ? v.uneasy : null;
  r.action = x && ["hold", "skip", "alt"].includes(x.action) ? x.action : "hold";
  if (x && r.action !== "skip") use(x);
  return r;
}
// 給畫面的：{ NPC id: [數字, 分級代碼] }（只放不是初始值的，沒有的畫面當初始值）
export function nwSanPublic(house) {
  const w = house && house.npcw && wuBox(house.npcw.san) ? house.npcw.san : {}, out = {};
  for (const id of Object.keys(w)) out[id] = [wdN(w[id]), statBandOf("npcSan", w[id])];
  return out;
}

// 這壹天的散客類型權重看的氣氛：「昨天的」氣氛。換日後第壹個碰莊家的人還沒觸發換日時（mood.day 還是昨天）和觸發之後（mood.day 是今天、昨天的在 prev）都回同壹個數字；差超過壹天或還沒算過 ＝ null（照平常）
export function whCrowdMood(house, day) {
  const m = house && house.wh && house.wh.mood; if (!m || !wdDayOk(m.day) || !wdDayOk(day)) return null;
  if (m.day === day) return m.prev == null ? null : wdN(m.prev);
  return m.day === whAddDays(day, -1) ? wdN(m.v) : null;
}
// 給畫面的今天的展廳氣氛：[數字, 分級代碼]；還沒算過 ＝ null
export function whMoodPublic(house) { const m = house && house.wh && house.wh.mood; return m && Number.isFinite(+m.v) ? [wdN(m.v), statBandOf("crowdMood", m.v)] : null; }
