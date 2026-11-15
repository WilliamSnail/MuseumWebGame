// ================================================================
//  世界經濟的「世界文件」（W2，決定 0086，規劃 docs/世界經濟規劃.md 第 5、6 節）
//  純函式。伺服器每小時的排程（functions/world.js 的 worldTick，併進 auctionTick）呼叫 wdTick：換日第一次才寫，同一天再跑什麼都不做。
//  world/main：{ v, day, pool, grownSeen, last }
//    pool        外面世界的「備用池」：house.world（館的對外帳戶）以外的那一份。現在是 0，搬錢預設關閉（NUM.casino.worldDoc.gateway ＝ 0）。
//    grownSeen   上次看到的 house.led.mint.worldGrow 累計（算「這一次之間成長了多少」）
//    last        最近一天的紀錄（同 worldDays/{日期} 那份）
//  worldDays/{日期}：每天一份紀錄 { day, houseDay, world, pool, total, grown, growth, b }。**只觀察、不改莊家**：
//    成長（worldGrow）還是在莊家文件的換日（casHouseDaily）裡算，第一個碰到莊家的交易才算；排程不替它換日，因為換日會產生破產重開的事件、要由那個交易告訴玩家和 Discord。
//    之後（W3）單位分帳、成長按權重分，才把成長搬到排程。
//  搬錢（wdSettle）：house.world 和 pool 之間搬，總和不變。預設關閉；要開之前，casBookSnap 必須把 pool 算進總量（否則對帳差不是 0）。
// ================================================================
import { NUM } from "./config.js";
import { WORLD_UNITS } from "./world_roster.js";

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
// 外面世界現在總共多少：莊家的對外帳戶（house.world）加備用池
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
//  W3 分帳（決定 0086）：外面世界的錢（house.world）分成「頂層單位、家計、公共」。這只是帳上的分類，**不搬錢**：
//    house.wu ＝ { r: { id: 比例 }, adj: { id: 調整 } }。單位 i 現在有 floor(house.world × r_i) ＋ adj_i；公共＝house.world 減掉所有單位和家計（剩下的），所以總和永遠等於 house.world，不會對不上。
//    池子進出（館的各種來源）照比例攤（world × r 自己就會跟著變）；只有「指名的」會動 adj：每天成長按權重分（wuGrow）、新玩家的起始補助從文化部出（wuDebit）。
//    W4 起，NPC 來館花的錢從所屬集團出，會用 wuDebit。
//    公共（pub）是剩下的，所以指名的單位不夠出時由公共補；公共的比例（現在 16%）是緩衝。
// ================================================================
export const WU_HH = "u-household"; // 家計：沒有單位的人（學生、退休、自由業）
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
// 讀回來的莊家：沒有 wu 就照現在的比例建（第一次：外面世界的錢照比例分）；壞資料變回預設
export function wuFix(house) {
  if (!wuBox(house)) return null;
  const x = wuBox(house.wu) && wuBox(house.wu.r) ? house.wu : (house.wu = { r: wuRatios(), adj: {} });
  if (!wuBox(x.adj)) x.adj = {};
  for (const id of Object.keys(x.r)) { x.r[id] = +x.r[id] || 0; if (id !== WU_PUB) x.adj[id] = wdN(x.adj[id]); }
  if (x.r[WU_PUB] == null) x.r[WU_PUB] = 0;
  return x;
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
  const b = Math.max(-1, Math.min(1, +(house.econ && house.econ.b) || 0)), coef = NUM.casino.worldDoc.sectorCoef || {}, sector = {};
  for (const u of wuTop()) sector[u.id] = u.sector;
  const raw = {}; let tot = 0;
  for (const id of Object.keys(x.r)) { raw[id] = x.r[id] * Math.max(0, 1 + (id === WU_PUB || id === WU_HH ? 0 : (+coef[sector[id]] || 0)) * b); tot += raw[id]; }
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
  for (const k of ["base", "idx", "h", "st"]) if (!wuBox(w[k])) w[k] = {};
  if (!Array.isArray(w.ev)) w.ev = [];
  w.ev = w.ev.filter(e => wuBox(e) && wdDayOk(e.day) && typeof e.unit === "string" && WH_STATES.includes(e.to)).slice(-20);
  for (const u of whUnits()) { const s = wuBox(w.st[u.id]) ? w.st[u.id] : (w.st[u.id] = {}); s.s = WH_STATES.includes(s.s) ? s.s : "normal"; s.low = Math.max(0, wdN(s.low)); }
  return w;
}
// 單位的旗下股票平均「相對第一次看到的價」；沒有股票或沒價回 null
function whIdx(u, px, base) {
  const r = []; for (const id of u.stocks || []) { const p = +(px && px[id]); if (!(p > 0)) continue; if (!(base[id] > 0)) base[id] = p; r.push(p / base[id]); }
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null;
}
// 換日呼叫（house.econ.b 是景氣，px 是 house.stk.px）。同一天不重複。回傳 true ＝ 這次有算
export function whTick(house, day, px) {
  const w = whFix(house), C = whCfg();
  if (!w || !wdDayOk(day) || w.day === day) return false;
  const b = whClamp(+(house.econ && house.econ.b) || 0, -1, 1), coef = NUM.casino.worldDoc.sectorCoef || {};
  for (const u of whUnits()) {
    const ix = whIdx(u, px, w.base); if (ix != null) { if (!wuBox(w.idx[u.id])) w.idx[u.id] = {}; w.idx[u.id][day] = Math.round(ix * 10000) / 10000; }
    const ds = wuBox(w.idx[u.id]) ? Object.keys(w.idx[u.id]).sort() : []; for (const d of ds.slice(0, Math.max(0, ds.length - 8))) delete w.idx[u.id][d];
    let chg = 0; if (ds.length >= 2) { const old = ds.find(d => d <= whAddDays(day, -7)) ? ds.filter(d => d <= whAddDays(day, -7)).pop() : ds[0]; const a = w.idx[u.id][old], c = w.idx[u.id][day]; if (a > 0 && c > 0 && old !== day) chg = c / a - 1; }
    w.h[u.id] = Math.round(whClamp(1 + b * (+coef[u.sector] || 0) + whClamp(chg, -C.chgCap, C.chgCap) * C.stockW, C.min, C.max) * 1000) / 1000;
  }
  const first = w.day === null;
  if (first || whIsMon(day)) { // 每週一看一次狀態
    for (const u of whUnits()) {
      const s = w.st[u.id], h = w.h[u.id], from = s.s;
      if (h >= C.cut) { s.s = "normal"; s.low = 0; }
      else if (h >= C.squeeze) { s.s = "cut"; s.low = 0; }
      else { s.low++; s.s = s.low >= C.layoffWeeks ? "layoff" : s.low >= C.squeezeWeeks ? "squeeze" : "cut"; }
      if (!first && s.s !== from) w.ev.push({ day, unit: u.id, to: s.s, from });
    }
    w.ev = w.ev.slice(-20);
  }
  w.day = day;
  return true;
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
const WH_TEXT = { normal: "恢復正常", cut: "減薪", squeeze: "緊縮", layoff: "裁員" };
const whName = id => { const u = WORLD_UNITS.find(x => x.id === id); return u ? u.name : id; };
// 已發生的事（最近 days 天內換狀態的）：給日報和市場新聞用。只寫發生過的，不預告
export function whNews(house, day, days = 1) {
  const w = house && wuBox(house.wh) ? house.wh : null; if (!w) return [];
  const from = whAddDays(day, -days);
  return w.ev.filter(e => e.day > from && e.day <= day).map(e => ({ day: e.day, unit: e.unit, to: e.to, text: `${whName(e.unit)}${WH_TEXT[e.to]}了` }));
}
// 財報「外面世界」卡的資料（只給分布，不列每家的數字）：{ day, states 各狀態幾個單位, bands h 的分布 [＜squeeze, squeeze～cut, cut～1.1, ≥1.1], avgMult 預算倍率平均, events 最近一週換狀態的 }
export function whCard(house, day) {
  const w = house && wuBox(house.wh) ? house.wh : null; if (!w) return null;
  const C = whCfg(), us = whUnits(), states = { normal: 0, cut: 0, squeeze: 0, layoff: 0 }, bands = [0, 0, 0, 0];
  us.forEach(u => { const s = w.st[u.id]; if (s) states[s.s]++; const h = +w.h[u.id]; if (h > 0) bands[h < C.squeeze ? 0 : h < C.cut ? 1 : h < 1.1 ? 2 : 3]++; });
  const avg = us.length ? us.reduce((a, u) => a + whMult(house, u.id), 0) / us.length : 1;
  return { day: w.day, states, bands, avgMult: Math.round(avg * 100) / 100, events: whNews(house, day || w.day, 7).map(e => ({ day: e.day, text: e.text })) };
}
