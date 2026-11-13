// ================================================================
//  股票（11-14，銀行第三步；翊文：「規劃好了我們就上線新的銀行體系讓大家玩，可以投資了」）
//  這壹步只做館外七支（shared/stocks_text.js 的 OUT_STOCKS，每天的真實漲跌由 shared/stocks.js 換算）。
//  館內五家店、槓桿、放空、當沖、盤中價格是後面幾步，規劃在 docs/經濟體系規劃.md 2.8。
//
//  錢怎麼動（守恆，shared/casino_book.js）：莊家當對手盤。
//    買：錢包付 股價×股數 ＋ 手續費；股價×股數 進莊家（casHouseMove "stock"），手續費進預算池。
//    賣：莊家付 股價×股數；錢包拿 股價×股數 － 手續費，手續費進預算池。
//    股價漲跌不搬錢（持股市值是帳面的），所以總量永遠不變。
//
//  停盤（數值平衡 11-14）：真實美股台灣時間 22:30～05:00 就看得到收盤，遊戲 05:00 才調價。
//    不擋的話晚上看完盤再下單等於穩賺，所以台灣時間 22:00～05:00 不能買賣。
//
//  莊家的曝險上限（數值平衡 11-14）：全館持股總市值超過莊家的 exposePct% 就不能再買；
//    壹人壹天賣出上限 sellDay；全館壹天淨賣出上限 bankroll×netSellPct% ＋ netSellFlat；莊家 ≤ 0 停買、賣照付。
//
//  純函式：「今天」和「現在幾點」從參數來，不碰資料庫和 DOM。
//  莊家 house.stk：{ day, px: { id: 股價 }, prev: { id: 昨天的股價 }, held: { id: 全館持股 }, net: { day, n 今天全館淨賣出 } }
//  錢包 w.stk：{ own: { id: 股數 }, sold: { day, n 今天賣出的錢 }, fee 累計手續費, gain 累計賣出賺賠 }
// ================================================================
import { NUM } from "./config.js";
import { casCount, casHouseMove } from "./casino_book.js";
import { CAS_STOCK } from "./casino_text.js";
import { OUT_STOCKS } from "./stocks_text.js";
import { casFill, casNum } from "./casino.js";

const stBox = v => !!v && typeof v === "object" && !Array.isArray(v);
const stN = v => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
const stDay = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const STOCK_IDS = OUT_STOCKS.map(s => s.id);
const stDef = id => OUT_STOCKS.find(s => s.id === id) || null;

// 台灣現在幾點（0～23）。台灣是 UTC+8，沒有日光節約
export const casStockHour = t => (Number.isFinite(+t) ? Math.floor((+t / 3600000 + 8) % 24) : -1);
// 停盤中嗎：台灣 22:00～隔天 05:00。給不出時間（測試、舊程式）就當沒停盤
export function casStockHalt(t) {
  const h = casStockHour(t);
  if (h < 0) return false;
  return h >= NUM.casino.stock.haltFrom || h < NUM.casino.stock.haltTo;
}

// ---------- 補欄位 ----------
export function casStockFix(w) {
  if (!stBox(w.stk)) w.stk = { own: {}, sold: { day: null, n: 0 }, fee: 0, gain: 0 };
  const S = w.stk;
  if (!stBox(S.own)) S.own = {};
  for (const k of Object.keys(S.own)) { const n = stN(S.own[k]); if (n > 0 && STOCK_IDS.includes(k)) S.own[k] = n; else delete S.own[k]; }
  if (!stBox(S.sold)) S.sold = { day: null, n: 0 };
  S.sold.day = stDay(S.sold.day) ? S.sold.day : null;
  S.sold.n = stN(S.sold.n);
  S.fee = stN(S.fee);
  S.gain = Number.isFinite(+S.gain) ? Math.floor(+S.gain) : 0; // 可以是負的
  return S;
}
export function casStockHouseFix(house) {
  if (!stBox(house.stk)) house.stk = { day: null, px: {}, prev: {}, held: {}, net: { day: null, n: 0 } };
  const H = house.stk;
  H.day = stDay(H.day) ? H.day : null;
  for (const k of ["px", "prev", "held"]) if (!stBox(H[k])) H[k] = {};
  for (const id of STOCK_IDS) {
    H.px[id] = Math.max(NUM.casino.stock.floor, stN(H.px[id]) || NUM.casino.stock.start);
    H.prev[id] = Math.max(NUM.casino.stock.floor, stN(H.prev[id]) || H.px[id]);
    H.held[id] = stN(H.held[id]);
  }
  for (const k of Object.keys(H.px)) if (!STOCK_IDS.includes(k)) { delete H.px[k]; delete H.prev[k]; delete H.held[k]; }
  if (!stBox(H.net)) H.net = { day: null, n: 0 };
  H.net.day = stDay(H.net.day) ? H.net.day : null;
  H.net.n = Number.isFinite(+H.net.n) ? Math.floor(+H.net.n) : 0;
  return H;
}

// ---------- 換日調價 ----------
// moves：{ id: 小數 }（shared/stocks.js 的 outStockMovesFor 算的，已經夾過 ±10%）。
// 每天再扣 drag%（數值平衡 11-14：真實股市長期往上漂，不扣的話抱著就賺，手續費擋不住）。
// 同壹天只調壹次。回傳 { done, day, moves: { id: 真正用的漲跌 } }
export function casStockRoll(house, day, moves) {
  const C = NUM.casino.stock, H = casStockHouseFix(house);
  if (!stDay(day) || H.day === day) return { done: false, day: H.day, moves: {} };
  const used = {};
  for (const id of STOCK_IDS) {
    const raw = Number.isFinite(+(moves && moves[id])) ? +moves[id] : 0;
    const m = Math.max(-C.outCap / 100, Math.min(C.outCap / 100, raw - C.drag / 100));
    H.prev[id] = H.px[id];
    H.px[id] = Math.max(C.floor, Math.round(H.px[id] * (1 + m)));
    used[id] = m;
  }
  H.day = day;
  H.net = { day, n: 0 }; // 全館淨賣出每天重算
  return { done: true, day, moves: used };
}

// ---------- 買賣 ----------
const stFee = n => Math.ceil(n * NUM.casino.stock.feePct / 100);
// 全館持股總市值（莊家曝險看這個）
export const casStockExposure = house => { const H = casStockHouseFix(house); return STOCK_IDS.reduce((s, id) => s + H.px[id] * H.held[id], 0); };
const stSoldToday = (S, day) => (S.sold.day === day ? S.sold.n : 0);
const stNetToday = (H, day) => (H.net.day === day ? H.net.n : 0);

// 買 shares 股。回傳 { ok, lines } 或 { ok:false, reason }
export function casStockBuy(w, house, id, shares, day, t) {
  const C = NUM.casino.stock, S = casStockFix(w), H = casStockHouseFix(house);
  if (!stDef(id) || !stDay(day)) return { ok: false, reason: CAS_STOCK.bad };
  if (casStockHalt(t)) return { ok: false, reason: CAS_STOCK.halt };
  if (house.bankroll <= 0) return { ok: false, reason: CAS_STOCK.houseBroke };
  const n = Math.floor(Number(String(shares == null ? "" : shares).replace(/[,，\s]/g, "")));
  if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: CAS_STOCK.bad };
  const px = H.px[id], cost = px * n, fee = stFee(cost);
  if (cost + fee > w.chips) return { ok: false, reason: CAS_STOCK.poor };
  if (casStockExposure(house) + cost > Math.floor(house.bankroll * C.exposePct / 100)) return { ok: false, reason: CAS_STOCK.exposed };
  w.chips -= cost + fee;
  casHouseMove(house, "stock", cost);
  house.budget += fee; casCount(house, "stockFee", fee); // 手續費進預算池（錢包已經扣掉了，是搬不是憑空；拚經濟也是這樣直接動預算池）
  S.own[id] = stN(S.own[id]) + n;
  S.fee += fee;
  H.held[id] = stN(H.held[id]) + n;
  return { ok: true, n, px, cost, fee, lines: [casFill(CAS_STOCK.buyOk, { name: stDef(id).name, n: casNum(n), px: casNum(px), cost: casNum(cost), fee: casNum(fee) })] };
}

// 賣 shares 股（"max" ＝全賣）
export function casStockSell(w, house, id, shares, day, t) {
  const C = NUM.casino.stock, S = casStockFix(w), H = casStockHouseFix(house);
  if (!stDef(id) || !stDay(day)) return { ok: false, reason: CAS_STOCK.bad };
  if (casStockHalt(t)) return { ok: false, reason: CAS_STOCK.halt };
  const have = stN(S.own[id]);
  if (have <= 0) return { ok: false, reason: CAS_STOCK.none };
  let n = shares === "max" ? have : Math.floor(Number(String(shares == null ? "" : shares).replace(/[,，\s]/g, "")));
  if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: CAS_STOCK.bad };
  if (n > have) return { ok: false, reason: casFill(CAS_STOCK.notEnough, { n: casNum(have) }) };
  const px = H.px[id], gross = px * n, fee = stFee(gross), net = gross - fee;
  // 壹人壹天賣出上限
  if (stSoldToday(S, day) + gross > C.sellDay) return { ok: false, reason: casFill(CAS_STOCK.sellDay, { n: casNum(Math.max(0, C.sellDay - stSoldToday(S, day))) }) };
  // 全館壹天淨賣出上限（買會把額度加回來，所以是「淨」）
  const cap = Math.floor(Math.max(0, house.bankroll) * C.netSellPct / 100) + C.netSellFlat;
  if (stNetToday(H, day) + gross > cap) return { ok: false, reason: CAS_STOCK.queue };
  casHouseMove(house, "stock", -gross);
  w.chips += net;
  house.budget += fee; casCount(house, "stockFee", fee);
  S.own[id] = have - n;
  if (S.own[id] <= 0) delete S.own[id];
  S.fee += fee;
  S.sold = { day, n: stSoldToday(S, day) + gross };
  H.held[id] = Math.max(0, stN(H.held[id]) - n);
  H.net = { day, n: stNetToday(H, day) + gross };
  return { ok: true, n, px, gross, fee, net, lines: [casFill(CAS_STOCK.sellOk, { name: stDef(id).name, n: casNum(n), px: casNum(px), net: casNum(net), fee: casNum(fee) })] };
}

// ---------- 畫面要的 ----------
// 回傳 { list: [{ id, name, line, kind, price, chg, mine, value }], fee, halt, exposeLeft, sellLeft, total }
// stale：哪幾支今天沒有新資料（shared/stocks.js 的 outStockStale）。標出來，不要讓人以為真的沒漲跌
export function casStockView(w, house, day, t, stale) {
  const C = NUM.casino.stock, S = casStockFix(w), H = casStockHouseFix(house);
  const old = Array.isArray(stale) ? stale : [];
  const list = OUT_STOCKS.map(d => {
    const price = H.px[d.id], prev = H.prev[d.id], mine = stN(S.own[d.id]);
    return { id: d.id, name: d.name, line: d.intro, kind: "out", price, chg: prev > 0 ? (price - prev) / prev : 0, mine, value: price * mine,
      stale: old.includes(d.id) ? CAS_STOCK.stale : null };
  });
  return {
    list, fee: C.feePct / 100, halt: casStockHalt(t), haltFrom: C.haltFrom, haltTo: C.haltTo,
    total: list.reduce((s, x) => s + x.value, 0), feePaid: S.fee,
    exposeLeft: Math.max(0, Math.floor(house.bankroll * C.exposePct / 100) - casStockExposure(house)),
    bankroll: house.bankroll, houseBroke: house.bankroll <= 0, // 買不了的時候畫面要說清楚是哪個原因（翊文 11-14：有錢卻壹直說「籌碼不夠，或莊家手上的股票已經夠多了」）
    sellLeft: Math.max(0, C.sellDay - stSoldToday(S, day)),
    soon: CAS_STOCK.soon, // 館內五家店、槓桿、放空、當沖還沒做
  };
}
// 存在股票裡的錢（記帳快照用：持股市值是帳面的，錢其實在莊家那裡，所以不加進總額）
export const casStockValue = (w, house) => { const S = casStockFix(w), H = casStockHouseFix(house); return STOCK_IDS.reduce((s, id) => s + H.px[id] * stN(S.own[id]), 0); };
