// ================================================================
//  館內五家店的股票（11-14，規劃 docs/規劃/經濟體系規劃.md 2.8a、2.8b、2.8e、2.8g；翊文：「05:00～23:30」「好，用 0.03」）
//  五家店：餐車 food、賭場牌桌 bj、委託櫃台 job、地下收藏庫 cellar、手作坊 craft。
//  跟館外股票（shared/casino/stock.js）分開，由莊家當對手盤（館裡自己的店）：買＝籌碼進莊家，賣＝莊家付；股價漲跌不搬錢。
//
//  價格怎麼來（決定 0113：下面是舊的算法，NUM.casino.stockIn.mkt.on ＝ false 時還用；現在預設是「真的市場」：
//    每家發行 mkt.Ns 股；旅客散客照那家店每 15 分鐘到店的人數下單、館友的買賣也推價（價格由淨買賣推：ln 價 += 淨買股數 ÷ depth）；每個價最多動 tickLim、壹天最多離開盤 dayLim；
//    開盤價 ＝ 昨天最後一個價；下面算出來的「開盤價」變成旅客心裡的「合理價」（H.open），旅客照它決定買賣；莊家當造市商（半個價差 half、持倉每個價回補 rho 給已知世界，來源 inMarket）。
//    價格序列存在 house.sin.m，由 casInAdvance 惰性推進（種子有祕密；館友的買賣在發生的那個價加進去））：
//    每天 05:00 的跳空 m ＝ k ×（昨天這家店「不同的人」數 a ÷ 前 avgDays 個有效日的平均 − 1）＋ moodPct% × 景氣 B ＋ 隨機 ±noise%，夾 ±jumpCap%。
//      有效日 ＝ 不同的人 ≥ minPeople 的那天；昨天不到 minPeople 人、或有效日不到 minDays 天：不調價（m ＝ 0）。
//      k ＝ 0.03（翊文 11-14）：K 大了，看盤的人預測活動量就能穩賺、或自己多去一次就能推高價格（test/sim/sim_stock_inhouse.cjs）。
//    開盤價 ＝ 前一天的收盤 ×（1 ＋ m）。
//    盤中：05:00～23:30 每 15 分鐘一個價（共 ticks 個），隨機漫步，整天標準差 daySd%，夾在開盤價 ±dayCap%。
//      不釘死收盤（釘死＝漲高一定會回來，反轉策略穩賺）；種子要有「只在伺服器」的祕密（secret）：repo 是公開的，
//      只用日期＋id 當種子，任何人都算得出整天的曲線。客戶端只拿到「到現在為止」的價。
//    23:30 到隔天 05:00 停盤，價格停在 23:30 的價。
//
//  存在哪：
//    錢包 w.use[store] ＝ 最後壹次用這家店的日期（壹天只算壹次）；w.sin ＝ { own: { id: 股數 }, sold: { day, n }, fee, seen: { id: 看過的價 } }
//    莊家 house.sin ＝ { day, open: { id: 開盤價 }, close: { id: 前一天收盤 }, jump: { id: 今天的跳空 }, quiet: { id: 今天不調價 }, use: { 日期: { 店: 人數 } },
//                      held: { id: 全館持股 }, net: { day, n 今天全館淨賣出（賣 − 買） } }
//
//  純函式：「今天」「現在幾點」「亂數的祕密」從參數來，不碰資料庫和 DOM。槓桿、放空、當沖、限價單是後面幾步（還沒做）。
// ================================================================
import { NUM } from "../core/config.js";
import { casSellCap, casSellTip } from "./credit.js";
import { casCount, casHouseMove, casHouseWorldIn, casHouseWorldOut, casPoolGain } from "./book.js";
import { casFill, casNum } from "./core.js";
import { hashStr, mulberry32 } from "../core/logic_base.js";
import { npcTrips } from "../npc/trip.js";
import { casNpcSpend, crowdShopCounts, npcShopArrive } from "../npc/spend.js";
import { CAS_STOCK_IN, IN_STOCKS } from "../stock/in_text.js";
import { CAS_STOCK } from "./text.js";

// 亂數的祕密：伺服器每次處理前用 casInSecret(...) 設進來（Functions 的 stocksTwSecret/main，玩家讀不到）。沒設的時候（網頁、測試）用壹個固定字串——網頁拿不到真的曲線，只拿到伺服器算好的價
let SECRET = "in-secret-unset";
export function casInSecret(s) { if (typeof s === "string" && s) SECRET = s; return SECRET; }
const inBox = v => !!v && typeof v === "object" && !Array.isArray(v);
const inN = v => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
const inDay = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const inAdd = (s, n) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const inDiff = (a, b) => { const f = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((f(b) - f(a)) / 86400000); };
export const IN_STORES = ["food", "bj", "job", "cellar", "craft"];
export const IN_IDS = IN_STOCKS.map(s => s.id);
const inDef = id => IN_STOCKS.find(s => s.id === id) || null;
// 證交稅（決定 0111）：跟館外台股同一個算法（shared/casino/stock.js 的 casStockTax）；館內股收，無條件進位、最少 1
const inTax = (gross, fee) => { const pc = Math.round(NUM.casino.stock.taxPct * 100); return pc > 0 && gross > 0 ? Math.min(Math.max(0, gross - fee), Math.max(1, Math.ceil(gross * pc / 10000))) : 0; };
const inFee = n => Math.ceil(n * NUM.casino.stock.feePct / 100);

// ---------- 這個人今天用過哪幾家店（算「不同的人」） ----------
// 壹個人壹天壹家只算壹次：回傳 true ＝ 這次是今天第壹次（有算進去）。house 沒給就只記錢包
export function casInUsed(w, house, store, day) {
  if (!inBox(w) || !IN_STORES.includes(store) || !inDay(day)) return false;
  if (!inBox(w.use)) w.use = {};
  if (w.use[store] === day) return false;
  w.use[store] = day;
  if (house) {
    const H = casInHouseFix(house);
    if (!inBox(H.use[day])) H.use[day] = {};
    H.use[day][store] = inN(H.use[day][store]) + 1;
  }
  return true;
}

// 這個人今天在這家店花了多少錢（算營收）：壹人壹天壹家最多算 NUM.casino.stockIn.revCap（館友自己砸錢推不動股價）。回傳這次算進去的錢。house 沒給就只記錢包
export function casInSpent(w, house, store, day, amount) {
  const C = NUM.casino.stockIn;
  amount = inN(amount);
  if (!inBox(w) || !IN_STORES.includes(store) || !inDay(day) || amount <= 0) return 0;
  if (!inBox(w.spent)) w.spent = {};
  if (!inBox(w.spent[store]) || w.spent[store].day !== day) w.spent[store] = { day, n: 0 };
  const take = Math.max(0, Math.min(amount, C.revCap - inN(w.spent[store].n)));
  if (take <= 0) return 0;
  w.spent[store].n = inN(w.spent[store].n) + take;
  if (house) {
    const H = casInHouseFix(house);
    if (!inBox(H.rev[day])) H.rev[day] = {};
    if (!inBox(H.rev[day][store])) H.rev[day][store] = { p: 0, x: 0 };
    H.rev[day][store].p = inN(H.rev[day][store].p) + take;
  }
  return take;
}

// ---------- 補欄位 ----------
export function casInFix(w) {
  if (!inBox(w.sin)) w.sin = { own: {}, sold: { day: null, n: 0 }, fee: 0, seen: {} };
  const S = w.sin;
  if (!inBox(S.own)) S.own = {};
  for (const k of Object.keys(S.own)) { const n = inN(S.own[k]); if (n > 0 && IN_IDS.includes(k)) S.own[k] = n; else delete S.own[k]; }
  if (!inBox(S.sold)) S.sold = { day: null, n: 0 };
  S.sold.day = inDay(S.sold.day) ? S.sold.day : null; S.sold.n = inN(S.sold.n);
  if (!inBox(S.cost)) S.cost = {}; // 每家的總成本（買進花的錢 ＋ 買進手續費；賣出時照比例扣）。畫面的單位成本、損益用；館內股不抽資本利得稅
  for (const k of Object.keys(S.cost)) { const n = inN(S.cost[k]); if (n > 0 && S.own[k] > 0 && IN_IDS.includes(k)) S.cost[k] = n; else delete S.cost[k]; }
  S.fee = inN(S.fee);
  if (!inBox(S.seen)) S.seen = {};
  for (const k of Object.keys(S.seen)) { const n = inN(S.seen[k]); if (n > 0 && IN_IDS.includes(k)) S.seen[k] = n; else delete S.seen[k]; }
  return S;
}
export function casInHouseFix(house) {
  const C = NUM.casino.stockIn;
  if (!inBox(house.sin)) house.sin = { day: null, open: {}, close: {}, jump: {}, quiet: {}, use: {}, held: {}, net: { day: null, n: 0 } };
  const H = house.sin;
  H.day = inDay(H.day) ? H.day : null;
  for (const k of ["open", "close", "jump", "quiet", "use", "held"]) if (!inBox(H[k])) H[k] = {};
  for (const id of IN_IDS) {
    H.open[id] = Math.max(C.floor, inN(H.open[id]) || C.start);
    H.close[id] = Math.max(C.floor, inN(H.close[id]) || H.open[id]);
    H.jump[id] = Number.isFinite(+H.jump[id]) ? +H.jump[id] : 0;
    H.quiet[id] = !!H.quiet[id];
    H.held[id] = inN(H.held[id]);
  }
  for (const d of Object.keys(H.use)) { if (!inDay(d) || !inBox(H.use[d])) delete H.use[d]; else for (const s of Object.keys(H.use[d])) { const n = inN(H.use[d][s]); if (n > 0 && IN_STORES.includes(s)) H.use[d][s] = n; else delete H.use[d][s]; } }
  const days = Object.keys(H.use).sort(); // 只留最近 histDays 天
  for (const d of days.slice(0, Math.max(0, days.length - C.histDays))) delete H.use[d];
  // NPC（規劃 2.8k）：npc[日期][店] ＝ 那天去逛的 NPC 人數（換日時算好存起來，要用的人數都是「館友＋NPC」）；npcEv[日期] ＝ 劇情日那天的事 { store, name, n }
  if (!inBox(H.npc)) H.npc = {};
  for (const d of Object.keys(H.npc)) { if (!inDay(d) || !inBox(H.npc[d])) delete H.npc[d]; else for (const s of Object.keys(H.npc[d])) { const n = inN(H.npc[d][s]); if (IN_STORES.includes(s)) H.npc[d][s] = n; else delete H.npc[d][s]; } }
  const nd = Object.keys(H.npc).sort(); for (const d of nd.slice(0, Math.max(0, nd.length - C.histDays))) delete H.npc[d];
  // 營收（11-15，決定 0087）：rev[日期][店] ＝ { p 館友花的（每人每店每天封頂）, x NPC 和散客花的 }
  if (!inBox(H.rev)) H.rev = {};
  for (const d of Object.keys(H.rev)) { if (!inDay(d) || !inBox(H.rev[d])) delete H.rev[d]; else for (const s of Object.keys(H.rev[d])) { const e = H.rev[d][s]; if (IN_STORES.includes(s) && inBox(e)) H.rev[d][s] = { p: inN(e.p), x: inN(e.x) }; else delete H.rev[d][s]; } }
  const rd = Object.keys(H.rev).sort(); for (const d of rd.slice(0, Math.max(0, rd.length - C.histDays))) delete H.rev[d];
  if (!inBox(H.npcEv)) H.npcEv = {};
  for (const d of Object.keys(H.npcEv)) { const e = H.npcEv[d]; if (!inDay(d) || !inBox(e) || !IN_STORES.includes(e.store)) delete H.npcEv[d]; else H.npcEv[d] = { ...(e.burst ? { burst: true } : {}), store: e.store, name: typeof e.name === "string" ? e.name.slice(0, 40) : "", n: inN(e.n) }; }
  const ed = Object.keys(H.npcEv).sort(); for (const d of ed.slice(0, Math.max(0, ed.length - C.histDays))) delete H.npcEv[d];
  // 活動、突發事件多來的旅客（算平均時扣掉）：npcX[日期][店]；預告的活動結果：npcFest[日期] ＝ [{ store, name, ok, n }]
  if (!inBox(H.npcX)) H.npcX = {};
  for (const d of Object.keys(H.npcX)) { if (!inDay(d) || !inBox(H.npcX[d])) delete H.npcX[d]; else for (const s of Object.keys(H.npcX[d])) { const n = inN(H.npcX[d][s]); if (IN_STORES.includes(s) && n > 0) H.npcX[d][s] = n; else delete H.npcX[d][s]; } }
  const xd = Object.keys(H.npcX).sort(); for (const d of xd.slice(0, Math.max(0, xd.length - C.histDays))) delete H.npcX[d];
  if (!inBox(H.npcFest)) H.npcFest = {};
  for (const d of Object.keys(H.npcFest)) { const L = H.npcFest[d]; if (!inDay(d) || !Array.isArray(L)) delete H.npcFest[d]; else H.npcFest[d] = L.filter(e => inBox(e) && IN_STORES.includes(e.store)).slice(0, 2).map(e => ({ store: e.store, name: typeof e.name === "string" ? e.name.slice(0, 40) : "", ok: !!e.ok, n: inN(e.n) })); }
  const fd = Object.keys(H.npcFest).sort(); for (const d of fd.slice(0, Math.max(0, fd.length - C.histDays))) delete H.npcFest[d];
  // 前壹天的開盤價（掛單、停損停利隔天補查前壹天盤中碰過的價用；更早的不留）
  if (!inBox(H.pre)) H.pre = { day: null, open: {} };
  H.pre.day = inDay(H.pre.day) ? H.pre.day : null;
  if (!inBox(H.pre.open)) H.pre.open = {};
  for (const id of Object.keys(H.pre.open)) { const n = inN(H.pre.open[id]); if (n > 0 && IN_IDS.includes(id)) H.pre.open[id] = n; else delete H.pre.open[id]; }
  if (!inBox(H.net)) H.net = { day: null, n: 0 };
  // 盤中跟著人數走（決定 0094）：vis[日期][店] ＝ 那天時刻表上到店的人數（NPC ＋ 逛店的散客，房間即時人數看得到的那一部分）；ramps[日期][店] ＝ 那天盤中價的人數修正（每 RAMP_K 個價壹個點，單位萬分之一）
  if (!inBox(H.vis)) H.vis = {};
  for (const d of Object.keys(H.vis)) { if (!inDay(d) || !inBox(H.vis[d])) delete H.vis[d]; else for (const s of Object.keys(H.vis[d])) { const n = inN(H.vis[d][s]); if (IN_STORES.includes(s)) H.vis[d][s] = n; else delete H.vis[d][s]; } }
  const vd = Object.keys(H.vis).sort(); for (const d of vd.slice(0, Math.max(0, vd.length - C.histDays))) delete H.vis[d];
  if (!inBox(H.ramps)) H.ramps = {};
  for (const d of Object.keys(H.ramps)) { if (!inDay(d) || !inBox(H.ramps[d])) delete H.ramps[d]; else for (const s of Object.keys(H.ramps[d])) { const a = H.ramps[d][s]; if (IN_STORES.includes(s) && Array.isArray(a) && a.length) H.ramps[d][s] = a.slice(0, 40).map(x => (Number.isFinite(+x) ? Math.round(+x) : 0)); else delete H.ramps[d][s]; } }
  const rpd = Object.keys(H.ramps).sort(); for (const d of rpd.slice(0, Math.max(0, rpd.length - 2))) delete H.ramps[d]; // 今天和昨天的（掛單、槓桿看昨天的價用）
  H.net.day = inDay(H.net.day) ? H.net.day : null;
  H.net.n = Number.isFinite(+H.net.n) ? Math.floor(+H.net.n) : 0;
  inMarketFix(H);
  return H;
}
// ---------- 真的市場（決定 0113）：存在 house.sin.m ----------
// m ＝ { day 這份價格是哪一天的, ser { 店: [到現在每個價的收盤價] }, prev { day, ser } 昨天完整的, P { 店: 最後的價（小數）}, open { 店: 今天開盤（昨天收盤）}, inv { 店: 造市商持倉偏離 }, fp { 店: 旅客散客合計持股 },
//        arr { 店: [每個價到店的人數] } 今天的, vol { 店: 今天毛成交股數 }, net { 店: 今天旅客散客淨買股數 } }
function inMarketFix(H) {
  const C = NUM.casino.stockIn, T = C.ticks;
  if (!inBox(H.m)) H.m = { day: null };
  const M = H.m;
  M.day = inDay(M.day) ? M.day : null;
  const num = (o, def) => { if (!inBox(o)) o = {}; for (const id of IN_IDS) o[id] = Number.isFinite(+o[id]) ? +o[id] : def(id); return o; };
  const arr = (o, len) => { if (!inBox(o)) o = {}; for (const id of IN_IDS) o[id] = (Array.isArray(o[id]) ? o[id] : []).slice(0, len).map(x => (Number.isFinite(+x) ? Math.round(+x) : 0)); return o; };
  M.ser = arr(M.ser, T); M.arr = arr(M.arr, T);
  for (const id of IN_IDS) M.ser[id] = M.ser[id].map(x => Math.max(C.floor, x)); // 價至少 floor
  if (!inBox(M.prev)) M.prev = { day: null, ser: {} };
  M.prev.day = inDay(M.prev.day) ? M.prev.day : null; M.prev.ser = arr(M.prev.ser, T);
  M.P = num(M.P, id => H.open[id]); M.open = num(M.open, id => H.open[id]); M.inv = num(M.inv, () => 0); M.fp = num(M.fp, () => 0); M.vol = num(M.vol, () => 0); M.net = num(M.net, () => 0);
  for (const id of IN_IDS) { if (!(M.P[id] > 0)) M.P[id] = H.open[id]; if (!(M.open[id] > 0)) M.open[id] = H.open[id]; }
}

// ---------- 時間：台灣現在是第幾個價 ----------
// 回傳 0～ticks−1（05:00 ＝ 0，23:30 ＝ ticks−1），營業時間以外是 null（停盤）；t 不是數字也是 null
export function casInIdx(t) {
  if (t == null || !Number.isFinite(+t)) return null;
  const C = NUM.casino.stockIn, min = (Math.floor(+t / 60000) + 480) % 1440; // 台灣時間，壹天的第幾分鐘
  const last = C.from + (C.ticks - 1) * C.step; // 最後壹個價的那壹分鐘（23:30）
  return min >= C.from && min <= last ? Math.floor((min - C.from) / C.step) : null;
}
export const casInHalt = t => (t == null || !Number.isFinite(+t) ? false : casInIdx(t) === null); // 給不出時間（測試、舊程式）當沒停盤

// ---------- 盤中價格（整天的曲線，種子有祕密） ----------
const inGauss = rnd => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
export function casInSeries(open, day, id, secret = SECRET) {
  const C = NUM.casino.stockIn, step = C.daySd / 100 / Math.sqrt(C.ticks - 1), rnd = mulberry32(hashStr(`${secret}|${day}|${id}|series`));
  const lo = open * (1 - C.dayCap / 100), hi = open * (1 + C.dayCap / 100), out = [Math.max(C.floor, Math.round(open))];
  let p = open;
  for (let i = 1; i < C.ticks; i++) { p = Math.max(lo, Math.min(hi, p * (1 + step * inGauss(rnd)))); out.push(Math.max(C.floor, Math.round(p))); }
  return out;
}

// ---------- 盤中跟著人數走（決定 0094，翊文 11-15：各房間人數全部照實際公開）----------
// 房間的即時人數公開之後，看人數就能猜明天的跳空、先卡位賺。所以讓盤中的價格「看得到＝已經漲了」：價格 ＝ 原本的曲線 × (1 ＋ 修正)，
//   修正 ＝ κ × (到店的人數到現在 − 平均到店人數 × 平常這個鐘點前到的比例)，κ ＝ k ÷ 平均人數（跟跳空的算法同一個斜率）。看到的人多、價格就已經往上走；之後的人數是平均，預期不會再變。
// 明天 05:00 的開盤價不變（還是 原本的收盤 ×（1 ＋ 跳空）），只是昨天的收盤現在包含了這個修正，所以 05:00 看到的缺口變小。名單、時刻表的任何一項沒有（測試、舊程式）：不修正。
const RAMP_K = 4;
const rampAt = (arr, i) => { const x = Math.max(0, i) / RAMP_K, lo = Math.min(Math.floor(x), arr.length - 1), hi = Math.min(lo + 1, arr.length - 1); return 1 + (arr[lo] + (arr[hi] - arr[lo]) * (x - lo)) / 10000; };
export function casInRampMake(H, day, secret, npcCtx) {
  const C = NUM.casino.stockIn;
  if (!(C.ramp > 0) || !(npcCtx && Array.isArray(npcCtx.list) && npcCtx.list.length) || !inDay(day)) return false;
  const arr = npcShopArrive(day, secret, npcCtx.list, npcCtx.counters), W = NUM.casino.npcSpend.npcWeights, WT = W.reduce((a, b) => a + b, 0), out = {}, cap = C.jumpCap / 100;
  const share = min => { let s = 0; for (let h = 0; h < W.length; h++) { const a = h * 60, b = a + 60; if (min >= b) s += W[h]; else if (min > a) s += W[h] * (min - a) / 60; } return s / WT; };
  for (const id of IN_STORES) {
    const valid = [], vis = [];
    for (let i = 1; i <= C.histDays && valid.length < C.avgDays; i++) { const d = inAdd(day, -i), n = inAvgTot(H, d, id), v = H.vis[d] && H.vis[d][id]; if (n >= C.minPeople && v !== undefined) { valid.push(n); vis.push(v); } }
    if (valid.length < C.minDays) continue;
    const avg = valid.reduce((s, x) => s + x, 0) / valid.length, vbar = vis.reduce((s, x) => s + x, 0) / vis.length, kap = C.k * C.ramp / avg, a = arr[id] || [], r = [];
    for (let j = 0; j * RAMP_K < C.ticks - 1 + RAMP_K; j++) {
      const min = j * RAMP_K * C.step; let v = 0; for (const e of a) { if (e.at <= min) v += e.n; else break; }
      r.push(Math.round(Math.max(-cap, Math.min(cap, kap * (v - vbar * share(min)))) * 10000));
    }
    out[id] = r;
  }
  H.ramps[day] = out;
  return true;
}
// 這天這家店的曲線（原本的曲線 × 人數修正）；沒有修正的日子跟 casInSeries 壹樣
export function casInSeriesR(H, open, day, id, secret = SECRET) {
  if (casInMktOn() && H && H.m) { // 真的市場：價格是推出來的（存在 H.m），不是算好的曲線。只回「已經走完的價」（今天到現在、昨天整天）；不知道的日子回空陣列
    if (H.m.day === day) return (H.m.ser[id] || []).slice();
    if (H.m.prev && H.m.prev.day === day) return (H.m.prev.ser[id] || []).slice();
    return [];
  }
  const C = NUM.casino.stockIn, ser = casInSeries(open, day, id, secret), r = H && H.ramps && H.ramps[day] && H.ramps[day][id];
  return r ? ser.map((p, i) => Math.max(C.floor, Math.round(p * rampAt(r, i)))) : ser;
}

// ---------- 真的市場：每個價怎麼算（決定 0113） ----------
export const casInMktOn = () => !!(NUM.casino.stockIn.mkt && NUM.casino.stockIn.mkt.on);
// 這天這家店每個價（15 分鐘）到店的人數：NPC 每站 1 位、逛店的散客壹組 n 位（shared/npc/spend.js 的 npcShopArrive）；沒有名單（測試、舊程式）全是 0（價格不動）
function inArrive(day, secret, npcCtx) {
  const C = NUM.casino.stockIn, out = {};
  for (const id of IN_IDS) out[id] = new Array(C.ticks).fill(0);
  if (!(npcCtx && Array.isArray(npcCtx.list) && npcCtx.list.length) || !inDay(day)) return out;
  const ar = npcShopArrive(day, secret, npcCtx.list, npcCtx.counters);
  for (const id of IN_STORES) for (const e of ar[id] || []) { const k = Math.max(0, Math.min(C.ticks - 1, Math.floor(e.at / C.step))); out[id][k] += e.n; }
  return out;
}
// 這一天開始：價格序列清空、開盤 ＝ 昨天最後一個價、人數換成這天的
function inMktStart(H, day, secret, npcCtx) {
  const M = H.m;
  M.day = day; M.arr = inArrive(day, secret, npcCtx);
  for (const id of IN_IDS) { M.ser[id] = []; M.open[id] = M.P[id]; M.vol[id] = 0; M.net[id] = 0; }
}
// 錢的另一邊是已知世界：旅客散客買（造市商收錢）＝ 已知世界 → 莊家；賣 ＝ 莊家 → 已知世界。莊家沒錢就付得出的部分（不憑空生錢）
function inSettle(house, N) {
  if (N > 0) casHouseWorldOut(house, "inMarket", N, NUM.casino.world);
  else if (N < 0) casHouseWorldIn(house, "inMarket", Math.min(-N, Math.max(0, Math.floor(house.bankroll))));
}
// 壹個價（第 k 個）：旅客散客下單 → 價格推一下 → 造市商回補。種子有祕密（玩家算不出旅客這個價下什麼單）
function inTickStep(house, H, id, day, k, secret) {
  const C = NUM.casino.stockIn, K = C.mkt, M = H.m, base = M.P[id], fv = H.open[id], rnd = mulberry32(hashStr(`${secret}|${day}|${id}|${k}|flow`));
  const n = M.arr[id][k] || 0, ser = M.ser[id], past = ser.length >= 8 ? ser[ser.length - 8] : 0, ret = past > 0 ? Math.log(base / past) : 0;
  let q = 0, gross = 0;
  for (let i = 0; i < n; i++) {
    const u = rnd(), sz = Math.min(K.sizeCap, Math.max(1, Math.round(K.size * Math.exp(0.6 * inGauss(rnd) - 0.18))));
    let dir;
    if (u < K.mixF) { const gap = Math.log(base / fv), pb = 0.5 - Math.max(-0.5, Math.min(0.5, gap / (2 * K.band))); dir = rnd() < pb ? 1 : -1; } // 基本面：便宜買、貴賣，偏離越大越一面倒
    else if (u < K.mixF + K.mixC) dir = ret > 0.002 ? 1 : ret < -0.002 ? -1 : (rnd() < 0.5 ? 1 : -1); // 追漲殺跌
    else dir = rnd() < 0.5 ? 1 : -1; // 雜訊
    if (dir > 0 && M.fp[id] > K.floatCap * K.Ns) continue; // 旅客散客合計持股上限（發行股數的 floatCap）
    if (dir < 0 && M.fp[id] < -K.floatShort * K.Ns) continue; // 賣空上限
    q += dir * sz; M.fp[id] += dir * sz; gross += sz;
  }
  const lo = Math.max(base * (1 - K.tickLim), M.open[id] * (1 - K.dayLim)), hi = Math.min(base * (1 + K.tickLim), M.open[id] * (1 + K.dayLim));
  const P = Math.max(C.floor, Math.max(lo, Math.min(hi, base * Math.exp(q / K.depth + K.walkSd * inGauss(rnd)))));
  M.inv[id] -= q; // 造市商逆向接：旅客散客淨買 ＝ 造市商賣出，持倉變負
  const avg = (base + P) / 2, agentCash = q * avg * (q > 0 ? 1 + K.half : 1 - K.half), dec = M.inv[id] * K.rho; // 價差：旅客散客付半個價差給造市商
  M.inv[id] -= dec; // 造市商把持倉的 rho 回補給已知世界（價格壓力慢慢回復）
  inSettle(house, Math.round(agentCash + dec * P));
  casCount(house, "inVol", Math.round(gross * avg));
  M.vol[id] += gross; M.net[id] += q; M.P[id] = P; ser.push(Math.max(C.floor, Math.round(P)));
}
// 把市場推進到現在：day 是現在的遊戲日、t 現在的毫秒。house.sin.day 還是舊的一天（還沒換日）就把那一天走完；沒給時間只走到開盤第一個價
export function casInAdvance(house, day, t, secret = SECRET) {
  if (!casInMktOn()) return;
  const C = NUM.casino.stockIn, H = casInHouseFix(house), M = H.m;
  if (!inDay(H.day)) return;
  if (M.day !== H.day) inMktStart(H, H.day, secret, null); // 舊資料第一次進來（上線那天）、或隔了很多天：這一天沒有人數資料，價格不動
  const idx = casInIdx(t), closed = t != null && Number.isFinite(+t) && idx === null;
  const target = inDay(day) && day > H.day ? C.ticks - 1 : idx !== null ? idx : (closed ? C.ticks - 1 : 0);
  for (const id of IN_IDS) while (M.ser[id].length <= target) inTickStep(house, H, id, H.day, M.ser[id].length, secret);
}
// 館友市價買賣的價格衝擊：q（買 ＋、賣 −）股。回傳 { ok, px 成交價（含半個價差、衝擊的一半）, maxN 超過漲跌停時最多還能買賣幾股, k, Pnew }；成功要再呼叫 inImpactApply
function inImpactQuote(H, id, t, q) {
  const C = NUM.casino.stockIn, K = C.mkt, M = H.m, idx = casInIdx(t), k = Math.max(0, Math.min(idx === null ? 0 : idx, M.ser[id].length - 1)), P = M.P[id];
  const base = k > 0 ? M.ser[id][k - 1] : M.open[id], lo = Math.max(base * (1 - K.tickLim), M.open[id] * (1 - K.dayLim)), hi = Math.min(base * (1 + K.tickLim), M.open[id] * (1 + K.dayLim));
  const Pn = P * Math.exp(q / K.depth);
  if (Pn > hi + 1e-9 || Pn < lo - 1e-9) { const lim = q > 0 ? hi : lo, maxN = Math.max(0, Math.floor(K.depth * Math.abs(Math.log(lim / P)) + 1e-9)); return { ok: false, maxN, k, Pnew: Pn }; }
  return { ok: true, px: Math.max(C.floor, Math.round(P * Math.exp(q / (2 * K.depth)) * (q > 0 ? 1 + K.half : 1 - K.half))), maxN: 0, k, Pnew: Pn };
}
function inImpactApply(H, id, q, quote) {
  const C = NUM.casino.stockIn, M = H.m;
  M.P[id] = Math.max(C.floor, quote.Pnew); M.ser[id][quote.k] = Math.max(C.floor, Math.round(M.P[id])); M.inv[id] -= q; M.vol[id] += Math.abs(q);
}

// ---------- 05:00 的跳空 ----------
// 昨天這家店不同的人數 a，對照前 avgDays 個「有效日」（人數 ≥ minPeople）的平均。回傳 { m, quiet }
// 那天這家店「不同的人」＝ 館友 ＋ NPC
const inTot = (H, d, id) => inN(H.use[d] && H.use[d][id]) + inN(H.npc && H.npc[d] && H.npc[d][id]);
// 算「平均」用的人數：扣掉活動、突發事件那天多來的旅客（H.npcX），不然壹次大事件會把之後 7 天的平均墊高，之後每天的跳空都偏負，被放空賺走
// 那天這家店的營收（館友的 ＋ NPC 和散客的）；沒有記錄回 null。算「平均」時照扣掉活動、突發多來的人的比例縮小
const inRev = (H, d, id) => { const e = H.rev && H.rev[d] && H.rev[d][id]; return e ? inN(e.p) + inN(e.x) : null; };
const inAvgTot = (H, d, id) => Math.max(0, inTot(H, d, id) - inN(H.npcX && H.npcX[d] && H.npcX[d][id]));
// 接下來幾天預告的活動（日報用）：festDays { 日期: [{ store, name }] }（content/weeks 的 week.json.fest）；回傳 day 起 ahead 天內的 [{ date, store, name }]
export function casInFestUp(festDays, day, ahead = NUM.casino.stockIn.festAhead) {
  const out = [];
  if (!inDay(day) || !inBox(festDays)) return out;
  for (let i = 0; i <= ahead; i++) { const d = inAdd(day, i); for (const f of Array.isArray(festDays[d]) ? festDays[d] : []) if (inBox(f) && IN_STORES.includes(f.store)) out.push({ date: d, store: f.store, name: typeof f.name === "string" ? f.name.slice(0, 40) : "" }); }
  return out;
}
// Poisson 亂數（用種子的亂數函式）
function inPois(rnd, lam) { const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L && k < 60); return k - 1; }
export function casInJump(H, id, day, B, secret = SECRET) {
  const C = NUM.casino.stockIn, y = inAdd(day, -1), a = inTot(H, y, id);
  const valid = [], revs = [];
  for (let i = 2; i <= C.histDays && valid.length < C.avgDays; i++) {
    const d = inAdd(day, -i), n = inAvgTot(H, d, id);
    if (n >= C.minPeople) { valid.push(n); const r = inRev(H, d, id), t = inTot(H, d, id); if (r !== null && t > 0) revs.push(r * n / t); }
  }
  if (a < C.minPeople || valid.length < C.minDays) return { m: 0, quiet: true };
  const avg = valid.reduce((s, x) => s + x, 0) / valid.length, rnd = mulberry32(hashStr(`${secret}|${day}|${id}|jump`));
  const b = Number.isFinite(+B) ? Math.max(-1, Math.min(1, +B)) : 0;
  // 人數那項；營收那項（昨天的營收有記錄、前面有營收記錄的有效日夠多、平均營收夠大才算）
  let f = a / avg - 1;
  const ry = inRev(H, y, id), avgR = revs.length >= C.minDays ? revs.reduce((s, x) => s + x, 0) / revs.length : 0;
  if (C.revWeight > 0 && ry !== null && avgR >= C.revMinAvg) f = (1 - C.revWeight) * f + C.revWeight * (ry / avgR - 1);
  const m = C.k * f + C.moodPct / 100 * b + (rnd() - 0.5) * 2 * C.noise / 100;
  return { m: Math.max(-C.jumpCap / 100, Math.min(C.jumpCap / 100, m)), quiet: false };
}

// d 那天各家店的 NPC 人數（沒算過才算，算了存進 H.npc）：每家 Poisson(npcLambda)，最多占這家店人數的 npcShareMax%（館友太少時更少）；
// 劇情日（npcDays：{ 日期: { store, name } }，content/weeks 的 week.json.npc）那天，那家店再多 round(b × 前 7 個有效日的平均)，b 在 npcBoostMin～npcBoostMax 隨機。
// 種子含伺服器祕密，玩家算不出；回傳 H.npc[d]
export function casInNpcFor(H, d, secret = SECRET, npcDays, npcCtx) {
  const C = NUM.casino.stockIn;
  if (!inDay(d)) return {};
  if (inBox(H.npc[d])) return H.npc[d];
  const out = {}, ev = npcDays && inBox(npcDays[d]) ? npcDays[d] : null;
  const trip = npcCtx && Array.isArray(npcCtx.list) && npcCtx.list.length ? npcTrips(d, secret, npcCtx.list, npcCtx.counters) : null; // 有名單：每位 NPC 各抽今天去哪幾家（npc_trip.js）；沒有：Poisson
  const crowdShop = crowdShopCounts(d, secret);
  if (trip && !inBox(H.vis[d])) { const ar = npcShopArrive(d, secret, npcCtx.list, npcCtx.counters); H.vis[d] = {}; for (const id of IN_STORES) H.vis[d][id] = ar[id].reduce((s, e) => s + e.n, 0); } // 房間即時人數看得到的那一部分（決定 0094）
  const fests = npcCtx && npcCtx.fest && Array.isArray(npcCtx.fest[d]) ? npcCtx.fest[d] : [], X = {};
  for (const id of IN_STORES) {
    const players = inN(H.use[d] && H.use[d][id]), rnd = mulberry32(hashStr(`${secret}|${d}|${id}|npc`));
    const cap = Math.max(Math.floor(players * C.npcShareMax / (100 - C.npcShareMax)), C.npcBase || 0); // 館友少的店，NPC、散客也至少能有 npcBase 位撐人氣（決定 0083）
    const walk = C.npcWalk > 0 ? inPois(mulberry32(hashStr(`${secret}|${d}|${id}|walk`)), C.npcWalk) : 0; // 常來逛的散客：不看館友人數，每家每天固定有（決定 0083）
    let n = Math.min(cap, (trip ? trip.counts[id] : inPois(rnd, C.npcLambda)) + (npcCtx && npcCtx.crowd !== false ? crowdShop[id] : 0) + walk); // 有名字的 NPC ＋ 逛店的散客（照人數），合計最多占 npcShareMax%
    if (ev && ev.store === id) {
      const valid = [];
      for (let i = 1; i <= C.histDays && valid.length < C.avgDays; i++) { const t = inAvgTot(H, inAdd(d, -i), id); if (t >= C.minPeople) valid.push(t); }
      const avg = valid.length ? valid.reduce((s, x) => s + x, 0) / valid.length : players, b = C.npcBoostMin + rnd() * (C.npcBoostMax - C.npcBoostMin);
      const extra = Math.round(Math.min(b, 0.33) * avg);
      n += extra; X[id] = (X[id] || 0) + extra;
      H.npcEv[d] = { store: id, name: typeof ev.name === "string" ? ev.name.slice(0, 40) : "", n: 0 };
    }
    if (!(ev && ev.store === id) && C.npcBurstPct > 0) { // 突發大事件（不預告）：獨立的亂數，不影響上面的抽法
      const br = mulberry32(hashStr(`${secret}|${d}|${id}|burst`));
      if (br() * 100 < C.npcBurstPct) {
        const valid = [];
        for (let i = 1; i <= C.histDays && valid.length < C.avgDays; i++) { const t = inAvgTot(H, inAdd(d, -i), id); if (t >= C.minPeople) valid.push(t); }
        if (valid.length) { const ex = Math.round(Math.min(C.npcBurstMax, C.npcBurstMin + br() * (C.npcBurstMax - C.npcBurstMin)) * valid.reduce((s, x) => s + x, 0) / valid.length); X[id] = (X[id] || 0) + ex; n += Math.round(Math.min(C.npcBurstMax, C.npcBurstMin + br() * (C.npcBurstMax - C.npcBurstMin)) * valid.reduce((s, x) => s + x, 0) / valid.length); if (!H.npcEv[d]) H.npcEv[d] = { store: id, name: "", n: 0, burst: true }; }
      }
    }
    // 預告的活動：這家店今天有活動，festP 的機率辦成（種子有祕密）
    for (const f of fests.filter(f => f && f.store === id).slice(0, 2)) {
      const fr = mulberry32(hashStr(`${secret}|${d}|${id}|fest`)), ok = fr() < C.festP;
      let extra = 0;
      if (ok) {
        const valid = [];
        for (let i = 1; i <= C.histDays && valid.length < C.avgDays; i++) { const t = inAvgTot(H, inAdd(d, -i), id); if (t >= C.minPeople) valid.push(t); }
        const avg = valid.length ? valid.reduce((s, x) => s + x, 0) / valid.length : players;
        extra = Math.round((C.festMin + fr() * (C.festMax - C.festMin)) * avg);
      }
      n += extra; X[id] = (X[id] || 0) + extra;
      if (!Array.isArray(H.npcFest[d])) H.npcFest[d] = [];
      H.npcFest[d].push({ store: id, name: typeof f.name === "string" ? f.name.slice(0, 40) : "", ok, n: extra });
    }
    out[id] = n;
  }
  for (const id of Object.keys(X)) if (X[id] > 0) { if (!inBox(H.npcX[d])) H.npcX[d] = {}; H.npcX[d][id] = X[id]; }
  H.npc[d] = out;
  if (H.npcEv[d]) H.npcEv[d].n = out[H.npcEv[d].store];
  return out;
}

// 換日：算今天的開盤價。同壹天只算壹次；隔了好幾天（沒人來）壹天壹天補（最多 30 天，沒人去＝不調價）。
// B：景氣（house.econ.b）。回傳 { done, day, jump: { id: m } }
export function casInRoll(house, day, B, secret = SECRET, npcDays, npcCtx) {
  const C = NUM.casino.stockIn, H = casInHouseFix(house);
  if (!inDay(day) || H.day === day) return { done: false, day: H.day, jump: {} };
  if (H.day === null) { // 第壹天：照起始價開
    H.day = day;
    for (const id of IN_IDS) { H.close[id] = H.open[id]; H.jump[id] = 0; H.quiet[id] = true; }
    if (casInMktOn()) { for (const id of IN_IDS) { H.m.P[id] = H.open[id]; H.m.open[id] = H.open[id]; } inMktStart(H, day, secret, npcCtx); }
    return { done: true, day, jump: {} };
  }
  let d = H.day, pre = null;
  const n = Math.min(30, Math.max(1, inDiff(H.day, day)));
  for (let i = 0; i < n; i++) {
    const next = inAdd(d, 1);
    pre = { day: d, open: Object.assign({}, H.open) }; // 這壹天的開盤價（還沒被換掉）
    if (npcCtx && Array.isArray(npcCtx.list) && npcCtx.list.length) casNpcSpend(house, d, secret, npcCtx.list, npcCtx.counters); // NPC 這壹天付的門票、店裡花的錢（已知世界的錢，shared/npc/spend.js）
    if (house.npcs && house.npcs.day === d && inBox(house.npcs.shopBy)) { // 這壹天 NPC 和散客在各家店花的錢，記進營收（決定 0087）
      for (const st of IN_STORES) { const b = house.npcs.shopBy[st], x = inBox(b) ? inN(b.npc) + inN(b.crowd) : 0; if (!inBox(H.rev[d])) H.rev[d] = {}; if (!inBox(H.rev[d][st])) H.rev[d][st] = { p: 0, x: 0 }; H.rev[d][st].x = x; }
    }
    casInNpcFor(H, d, secret, npcDays, npcCtx); // 這壹天去逛的 NPC（算進這壹天「不同的人」，明天的跳空看它）
    const mkt = casInMktOn();
    if (mkt) { // 真的市場：先把這壹天的價走完（旅客散客照這天的人數下單）
      if (H.m.day !== d) inMktStart(H, d, secret, null); // 舊資料第壹次進來：這壹天沒有人數資料，價格不動
      for (const id of IN_IDS) while (H.m.ser[id].length < C.ticks) inTickStep(house, H, id, d, H.m.ser[id].length, secret);
    }
    for (const id of IN_IDS) {
      const close = mkt ? H.m.P[id] : casInSeries(H.open[id], d, id, secret)[C.ticks - 1]; // 原本的收盤（舊做法：明天的開盤價從它來）
      const j = casInJump(H, id, next, B, secret);
      H.close[id] = Math.max(C.floor, mkt ? H.m.ser[id][C.ticks - 1] : casInSeriesR(H, H.open[id], d, id, secret)[C.ticks - 1]); // 畫面上的收盤
      H.jump[id] = j.m; H.quiet[id] = j.quiet;
      // 真的市場：H.open 變成「合理價」（旅客心裡的價，每天照昨天的人數、營收、景氣、事件調），不是開盤價；開盤價 ＝ 昨天最後一個價（不跳空）
      H.open[id] = Math.max(C.floor, Math.round((mkt ? H.open[id] : close) * (1 + j.m)));
    }
    if (mkt) { // 昨天的整天留給掛單、槓桿補查；今天開始
      H.m.prev = { day: d, ser: Object.fromEntries(IN_IDS.map(id => [id, H.m.ser[id].slice()])) };
      inMktStart(H, next, secret, npcCtx);
    }
    d = next;
  }
  H.pre = pre && pre.day === inAdd(day, -1) ? pre : { day: null, open: {} }; // 只留「昨天」的開盤價；隔很多天沒人碰的，昨天本身沒有記錄
  H.day = day; // 隔了超過 30 天：直接當今天
  if (casInMktOn() && H.m.day !== day) { H.m.prev = { day: null, ser: {} }; inMktStart(H, day, secret, npcCtx); } // 隔太多天：昨天的不留
  if (!casInMktOn()) casInRampMake(H, day, secret, npcCtx); // 今天盤中的人數修正（今天的時刻表算得出來；沒有名單就不修正）
  const rk = Object.keys(H.ramps).sort(); for (const d0 of rk) if (d0 !== day && d0 !== inAdd(day, -1)) delete H.ramps[d0];
  return { done: true, day, jump: Object.assign({}, H.jump) };
}

// 現在這支的價：{ px, idx, halted }。house 還沒算今天（H.day ≠ day）：用最後壹次算的開盤價
export function casInPrice(house, id, day, t, secret = SECRET) {
  const C = NUM.casino.stockIn, H = casInHouseFix(house);
  if (!inDef(id)) return { px: 0, idx: null, halted: true };
  casInAdvance(house, day, t, secret);
  const idx = casInIdx(t), ser = casInSeriesR(H, H.open[id], H.day || day, id, secret);
  if (!ser.length) return { px: H.open[id], idx, halted: idx === null && t != null };
  if (idx !== null) return { px: ser[Math.min(idx, ser.length - 1)], idx, halted: false };
  // 停盤（23:30～隔天 05:00，這段時間的「今天」還是前壹天）：價格停在最後壹個價。沒給時間（測試、舊程式）：開盤價，不當停盤
  return { px: t == null ? ser[0] : ser[C.ticks - 1], idx: null, halted: t != null };
}

// ---------- 買賣 ----------
// 有持股卻沒有成本記錄的舊持股：成本 ＝ 第壹次碰到時的價（今天的開盤價）× 股數
export function casInCostSeed(w, house) { const S = casInFix(w), H = casInHouseFix(house); for (const id of Object.keys(S.own)) if (S.cost[id] == null) S.cost[id] = H.open[id] * S.own[id]; }
const inHeld = (H, house) => IN_IDS.reduce((s, id) => s + inN(H.held[id]) * H.open[id], 0); // 全館持股市值（用開盤價估，夠用來擋上限）
// 莊家能接多少館內股（規劃 2.8e）：max(exposeFloor, 莊家的錢 × exposePct%)；莊家 ≤ 0 時不接
export const casInExposeCap = house => (house.bankroll > 0 ? Math.max(NUM.casino.stockIn.exposeFloor, Math.floor(house.bankroll * NUM.casino.stock.exposePct / 100)) : 0);
// 全館壹天淨賣出上限（規劃 2.8a 第 7 條）：max(莊家的錢, 0) × netSellPct% ＋ netSellFlat
const inNetCap = house => Math.floor(Math.max(0, house.bankroll) * NUM.casino.stock.netSellPct / 100) + NUM.casino.stock.netSellFlat;
const inNetToday = (H, day) => (H.net.day === day ? H.net.n : 0);
const inSoldToday = (S, day) => (S.sold.day === day ? S.sold.n : 0);
// 館內股被掛單（限價賣、停損賣）鎖住的股數。掛單記在 w.stk.orders（跟館外股同壹張清單，單號、張數上限、取消次數共用）
const inLocked = (w, id) => (inBox(w.stk) && Array.isArray(w.stk.orders) ? w.stk.orders.reduce((a, o) => a + (o && o.kind !== "buy" && o.id === id ? inN(o.n) : 0), 0) : 0);
const inShares = v => Math.floor(Number(String(v == null ? "" : v).replace(/[,，\s]/g, "")));

// px0：掛單成交時給的價（觸發的那個價，不看現在幾點）；平常不給
export function casInBuy(w, house, id, shares, day, t, secret = SECRET, px0) {
  const C = NUM.casino.stockIn, S = casInFix(w), H = casInHouseFix(house), T = CAS_STOCK_IN;
  if (!inDef(id) || !inDay(day)) return { ok: false, reason: T.bad };
  if (H.day !== day) return { ok: false, reason: T.halt };
  const pr = px0 > 0 ? { px: px0, halted: false } : casInPrice(house, id, day, t, secret);
  if (pr.halted) return { ok: false, reason: T.halt };
  if (!(house.bankroll > 0)) return { ok: false, reason: T.houseBroke };
  const n = inShares(shares);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: T.bad };
  const have = inN(S.own[id]);
  if (have + n > C.cap) return { ok: false, reason: casFill(T.cap, { n: casNum(C.cap), have: casNum(have) }) };
  let px = pr.px, imp = null;
  if (casInMktOn() && !(px0 > 0)) { imp = inImpactQuote(H, id, t, n); if (!imp.ok) return { ok: false, reason: imp.maxN > 0 ? casFill(T.limit, { n: casNum(imp.maxN), dir: "買" }) : casFill(T.limit0, { dir: "漲" }) }; px = imp.px; } // 價格衝擊：買的人多報價往上，成交價含半個價差
  const cost = px * n, fee = inFee(cost);
  if (!(w.chips >= cost + fee)) return { ok: false, reason: T.poor };
  if (inHeld(H, house) + cost > casInExposeCap(house)) return { ok: false, reason: T.exposed };
  casInCostSeed(w, house);
  if (imp) inImpactApply(H, id, n, imp);
  w.chips -= cost + fee;
  S.cost[id] = inN(S.cost[id]) + cost + fee; // 總成本含買進手續費
  casHouseMove(house, "stockIn", cost); // 買進的錢進莊家（莊家當對手盤）
  casPoolGain(house, "budget", "stockFee", fee); casCount(house, "stockFee", fee); // 手續費進博物館資金（搬）
  S.own[id] = have + n; S.fee += fee;
  H.held[id] = inN(H.held[id]) + n;
  H.net = { day, n: inNetToday(H, day) - cost }; // 買進讓今天的淨賣出變少
  return { ok: true, n, px, cost, fee, lines: [casFill(T.buyOk, { name: inDef(id).name, n: casNum(n), px: casNum(px), cost: casNum(cost), fee: casNum(fee) })] };
}
// opts.free ＝賣股還債（shared/casino/debt.js）：不受壹人壹天賣出上限和全館淨賣出上限、不算進今天賣出的額度
export function casInSell(w, house, id, shares, day, t, secret = SECRET, px0, opts) {
  const free = !!(opts && opts.free);
  const C = NUM.casino.stock, S = casInFix(w), H = casInHouseFix(house), T = CAS_STOCK_IN;
  if (!inDef(id) || !inDay(day)) return { ok: false, reason: T.bad };
  if (H.day !== day) return { ok: false, reason: T.halt };
  const pr = px0 > 0 ? { px: px0, halted: false } : casInPrice(house, id, day, t, secret);
  if (pr.halted) return { ok: false, reason: T.halt };
  const have0 = inN(S.own[id]), have = Math.max(0, have0 - inLocked(w, id)); // 掛單鎖住的股不能賣
  if (have0 <= 0) return { ok: false, reason: T.none };
  if (have <= 0) return { ok: false, reason: casFill(CAS_STOCK.order.noShares, { n: 0 }) };
  const n = shares === "max" ? have : inShares(shares);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: T.bad };
  if (n > have) return { ok: false, reason: casFill(have0 > have ? CAS_STOCK.order.noShares : T.notEnough, { n: casNum(have) }) };
  let px = pr.px, imp = null;
  if (casInMktOn() && !(px0 > 0)) { imp = inImpactQuote(H, id, t, -n); if (!imp.ok) return { ok: false, reason: imp.maxN > 0 ? casFill(T.limit, { n: casNum(imp.maxN), dir: "賣" }) : casFill(T.limit0, { dir: "跌" }) }; px = imp.px; } // 價格衝擊：賣的人多報價往下，成交價扣半個價差
  const gross = px * n, fee = inFee(gross), tax = inTax(gross, fee), net = gross - fee - tax;
  if (!free && inSoldToday(S, day) + gross > casSellCap(w)) return { ok: false, reason: casFill(T.sellDay, { n: casNum(Math.max(0, casSellCap(w) - inSoldToday(S, day))), up: casSellTip(w) }) };
  if (!free && inNetToday(H, day) + gross > inNetCap(house)) return { ok: false, reason: T.queue }; // 莊家付不過來，明天再賣
  casInCostSeed(w, house);
  if (imp) inImpactApply(H, id, -n, imp);
  const costOut = n >= have0 ? inN(S.cost[id]) : Math.floor(inN(S.cost[id]) * n / have0);
  casHouseMove(house, "stockIn", -gross);
  w.chips += net; casPoolGain(house, "budget", "stockFee", fee); casCount(house, "stockFee", fee);
  if (tax > 0) { casPoolGain(house, "gov", "stockTax", tax); casCount(house, "stockTax", tax); } // 證交稅進政府帳
  S.own[id] = have0 - n; if (S.own[id] <= 0) { delete S.own[id]; delete S.cost[id]; } else S.cost[id] = Math.max(1, inN(S.cost[id]) - costOut);
  S.fee += fee; if (!free) S.sold = { day, n: inSoldToday(S, day) + gross };
  H.held[id] = Math.max(0, inN(H.held[id]) - n);
  if (!free) H.net = { day, n: inNetToday(H, day) + gross };
  return { ok: true, n, px, gross, fee, tax, net, lines: [casFill(T.sellOk, { name: inDef(id).name, n: casNum(n), px: casNum(px), net: casNum(net), fee: casNum(fee), taxText: tax > 0 ? "，證交稅 " + casNum(tax) : "" })] };
}

// ---------- 限價單、停損單（11-14，規劃 2.8c、2.8g：跟館外股壹樣，對手盤是莊家） ----------
// 單記在 w.stk.orders（kind buy 限價買、sell 限價賣、stop 停損賣；id 是館內店），單號 w.stk.seq、鎖住的籌碼 w.stk.hold、取消次數 w.stk.cx、成交的話 w.stk.notes 都跟館外股共用。
// 下單時鎖住籌碼（買）或股數（賣、停損）；有效到當天 23:30 收盤，沒成交就取消退回。
// 對照的價：下單之後每個 15 分鐘的價（casInSeries）；成交價用觸發的那個價（跳空比掛的更好或更差都照那個價）；成交時照市價單的做法走壹遍，莊家的上限（曝險、全館淨賣出）、
// 壹人壹家 cap、壹天賣出上限擋住就取消退回（跟館外股壹樣）。
const inOrdBox = w => {
  if (!inBox(w.stk)) w.stk = { own: {}, sold: { day: null, n: 0 }, fee: 0, gain: 0, orders: [], seq: 0, hold: 0, cx: { day: null, n: 0 }, notes: [] };
  const S = w.stk;
  if (!Array.isArray(S.orders)) S.orders = [];
  S.seq = inN(S.seq); S.hold = inN(S.hold);
  if (!inBox(S.cx)) S.cx = { day: null, n: 0 };
  if (!Array.isArray(S.notes)) S.notes = [];
  return S;
};
const inNote = (S, line) => { S.notes.push(line); S.notes = S.notes.slice(-8); };
const inDrop = (w, S, o) => { if (o.hold > 0) { w.chips += o.hold; S.hold = Math.max(0, S.hold - o.hold); o.hold = 0; } S.orders = S.orders.filter(x => x.no !== o.no); };
const inKindName = k => CAS_STOCK.order.kinds[k];
export function casInOrder(w, house, kind, id, shares, px, day, t, secret = SECRET) {
  const C = NUM.casino.stock, O = CAS_STOCK.order, T = CAS_STOCK_IN, S = inOrdBox(w), H = casInHouseFix(house), Z = casInFix(w);
  if (!["buy", "sell", "stop"].includes(kind) || !inDef(id) || !inDay(day)) return { ok: false, reason: T.bad };
  if (H.day !== day) return { ok: false, reason: T.halt };
  const pr = casInPrice(house, id, day, t, secret);
  if (pr.halted || pr.idx === null) return { ok: false, reason: T.halt };
  const num = v => Math.floor(Number(String(v == null ? "" : v).replace(/[,，\s]/g, "")));
  const n = num(shares), p = num(px);
  if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(p) || p < NUM.casino.stockIn.floor) return { ok: false, reason: T.bad };
  if (S.orders.length >= C.order.max) return { ok: false, reason: casFill(O.full, { n: C.order.max }) };
  if (S.orders.filter(o => o.id === id).length >= C.order.perStock) return { ok: false, reason: casFill(O.fullStock, { n: C.order.perStock }) };
  const now = pr.px;
  if (kind === "sell" ? p <= now : p >= now) return { ok: false, reason: casFill(O.px, { px: casNum(now) }) };
  const o = { no: S.seq + 1, kind, id, n, px: p, day, exp: inAdd(day, C.order.days - 1), hold: 0, at: pr.idx };
  if (kind === "buy") {
    if (inN(Z.own[id]) + n > NUM.casino.stockIn.cap) return { ok: false, reason: casFill(T.cap, { n: casNum(NUM.casino.stockIn.cap), have: casNum(inN(Z.own[id])) }) };
    o.hold = p * n + inFee(p * n);
    if (o.hold > w.chips) return { ok: false, reason: T.poor };
    w.chips -= o.hold; S.hold += o.hold;
  } else {
    const free = inN(Z.own[id]) - inLocked(w, id);
    if (n > free) return { ok: false, reason: casFill(O.noShares, { n: casNum(Math.max(0, free)) }) };
  }
  S.seq += 1; S.orders.push(o);
  return { ok: true, order: o, lines: [casFill(kind === "buy" ? O.buyOk : kind === "sell" ? O.sellOk : O.stopOk, { name: inDef(id).name, n: casNum(n), px: casNum(p), lock: casNum(o.hold) })] };
}
// 玩家取消壹張館內股的單時，休市中不行（casStockCancel 呼叫；其他規則在那邊）
export const casInOrderHalt = (id, t) => !!inDef(id) && t != null && Number.isFinite(+t) && casInIdx(t) === null;
// 照價格檢查這個錢包所有館內股的單（casStockMatch 呼叫，在 casInRoll 之後、錢包被碰到時）。回傳 { fills, cancels }
export function casInMatch(w, house, day, t, secret = SECRET) {
  const O = CAS_STOCK.order, S = inOrdBox(w), H = casInHouseFix(house), out = { fills: 0, cancels: 0 };
  if (!inDay(day) || H.day !== day) return out; // 今天的價還沒算：等
  casInAdvance(house, day, t, secret);
  const idx = casInIdx(t), closed = t != null && Number.isFinite(+t) && idx === null, last = idx !== null ? idx : closed ? NUM.casino.stockIn.ticks - 1 : 0; // 今天看到第幾個價；沒給時間（測試）只看開盤價
  for (const no of S.orders.map(x => x.no).sort((a, b) => a - b)) {
    const o = S.orders.find(x => x.no === no);
    if (!o || !inDef(o.id)) continue;
    // 要檢查的價：下單那天（昨天的開盤價記在 H.pre，更早的不知道）下單之後的價，加上今天到現在的價
    const ser = d => (casInMktOn() ? casInSeriesR(H, 0, d, o.id, secret) : d === H.day ? casInSeriesR(H, H.open[o.id], d, o.id, secret) : H.pre.day === d && H.pre.open[o.id] > 0 ? casInSeriesR(H, H.pre.open[o.id], d, o.id, secret) : null);
    const pts = [];
    for (const d of [inAdd(day, -1), day]) {
      if (d < o.day || d > o.exp) continue;
      const a = ser(d); if (!a) continue;
      for (let i = (d === o.day && o.at != null ? o.at + 1 : 0); i <= (d === day ? last : a.length - 1); i++) pts.push(a[i]);
    }
    const hit = pts.find(p => (o.kind === "sell" ? p >= o.px : p <= o.px)); // 限價買、停損：碰到或低於；限價賣：碰到或高於
    if (hit === undefined) {
      if (day > o.exp || (day === o.exp && closed)) { inDrop(w, S, o); inNote(S, casFill(O.expire, { name: inDef(o.id).name, kind: inKindName(o.kind), n: casNum(o.n) })); out.cancels++; }
      continue;
    }
    // 成交：先把鎖住的還回去，再照市價單的做法走壹遍（手續費、記帳、上限都跟市價單壹樣），用 hit 當成交價
    inDrop(w, S, o);
    const r = o.kind === "buy" ? casInBuy(w, house, o.id, o.n, day, null, secret, hit) : casInSell(w, house, o.id, o.n, day, null, secret, hit);
    if (r.ok) {
      out.fills++;
      inNote(S, o.kind === "buy" ? casFill(O.fillBuy, { name: inDef(o.id).name, n: casNum(r.n), px: casNum(r.px), cost: casNum(r.cost), fee: casNum(r.fee) })
        : casFill(O.fillSell, { name: inDef(o.id).name, kind: inKindName(o.kind), n: casNum(r.n), px: casNum(r.px), net: casNum(r.net), fee: casNum(r.fee), taxText: r.tax > 0 ? "，證交稅 " + casNum(r.tax) : "" }));
    } else { out.cancels++; inNote(S, casFill(O.capCancel, { name: inDef(o.id).name, kind: inKindName(o.kind), n: casNum(o.n) })); }
  }
  return out;
}

// ---------- 畫面要的 ----------
// 回傳 { list: [{ id, name, line, kind, market: "in", price, chg, mine, value, halted, intraday, intradayFrom, fresh, stale, quiet, jump }], inDay: { from, len, step }, ... }
// intraday：今天 05:00 到現在每 15 分鐘的價（不給未來的）；intradayFrom：從第幾個價開始（0 ＝ 05:00）。chg：跟昨天收盤比
export function casInView(w, house, day, t, secret = SECRET) {
  const C = NUM.casino.stockIn, S = casInFix(w), H = casInHouseFix(house);
  if (H.day === day) casInAdvance(house, day, t, secret);
  const ready = H.day === day, idx = casInIdx(t), closed = t != null && Number.isFinite(+t) && idx === null, MK = casInMktOn() ? NUM.casino.stockIn.mkt : null;
  const list = IN_STOCKS.map(d => {
    const ser = ready ? casInSeriesR(H, H.open[d.id], day, d.id, secret) : [], upto = idx !== null ? idx : (closed ? ser.length - 1 : 0);
    const price = ready ? ser[Math.min(upto, ser.length - 1)] : H.open[d.id], mine = inN(S.own[d.id]);
    const prev = H.close[d.id], costTotal = mine > 0 ? (S.cost[d.id] != null ? S.cost[d.id] : price * mine) : 0; // 持股明細欄位跟館外股壹樣（casStockView）；prev ＝ 昨天收盤
    return { id: d.id, name: d.name, line: d.intro, kind: "in", market: "in", price, chg: prev > 0 ? (price - prev) / prev : 0, mine, value: price * mine,
      costTotal, avgCost: mine > 0 ? Math.round(costTotal / mine * 100) / 100 : 0, dayChg: prev > 0 ? mine * (price - prev) : 0, dayPct: prev > 0 ? (price - prev) / prev : 0, pnl: price * mine - costTotal, pnlPct: costTotal > 0 ? (price * mine - costTotal) / costTotal : 0, tax: NUM.casino.stock.taxPct / 100,
      halted: !ready || (t != null && idx === null), intraday: ready ? ser.slice(0, upto + 1) : [], intradayFrom: 0, fresh: S.seen[d.id] !== price, stale: null, quiet: !!H.quiet[d.id], jump: H.jump[d.id],
      // 真的市場（決定 0113）：發行股數、資本額、今天的毛成交股數和旅客散客淨買股數、合理價（旅客心裡的價，公開）
      ...(MK ? { shares: MK.Ns, cap: MK.Ns * price, vol: H.m.day === day ? Math.round(H.m.vol[d.id]) : 0, net: H.m.day === day ? Math.round(H.m.net[d.id]) : 0, fv: H.open[d.id] } : {}) };
  });
  return { list, inDay: { from: C.from, len: C.ticks, step: C.step }, cap: C.cap, total: list.reduce((s, x) => s + x.value, 0), feePaid: S.fee, feePct: NUM.casino.stock.feePct / 100,
    sellLeft: Math.max(0, casSellCap(w) - inSoldToday(S, day)), sellCap: casSellCap(w), sellTip: casSellTip(w), exposeLeft: Math.max(0, casInExposeCap(house) - inHeld(H, house)), mkt: MK ? { Ns: MK.Ns, tickLim: MK.tickLim, dayLim: MK.dayLim, half: MK.half } : null, bankroll: house.bankroll, houseBroke: !(house.bankroll > 0), rule: CAS_STOCK_IN.rule };
}
// 玩家按「看過了」：記下現在的價（fresh 用）
export function casInSeen(w, house, day, t, secret = SECRET) {
  const S = casInFix(w);
  for (const d of IN_STOCKS) { const p = casInPrice(house, d.id, day, t, secret).px; if (p > 0) S.seen[d.id] = p; }
}
// 存在館內股票的錢（記帳快照用）：持股市值是帳面的，錢其實在莊家那裡，所以不加進總額——只給畫面看
export const casInValue = (w, house, day, t, secret = SECRET) => { const S = casInFix(w); return IN_IDS.reduce((s, id) => s + inN(S.own[id]) * casInPrice(house, id, day, t, secret).px, 0); };
// 存在館內股票的錢（記帳快照、銀行廳的「持股合計」用）：不知道現在幾點時，用今天的開盤價估
export const casInValueApprox = (w, house) => { const S = casInFix(w), H = casInHouseFix(house); return IN_IDS.reduce((s, id) => s + inN(S.own[id]) * H.open[id], 0); };
