// ================================================================
//  股票（11-14，銀行第三步；翊文：「規劃好了我們就上線新的銀行體系讓大家玩，可以投資了」）
//  這壹步只做館外七支（shared/stocks_text.js 的 OUT_STOCKS，每天的真實漲跌由 shared/stocks.js 換算）。
//  館內五家店、槓桿、放空、當沖、盤中價格是後面幾步，規劃在 docs/經濟體系規劃.md 2.8。
//
//  錢怎麼動（shared/casino_book.js）：跟「外面世界」買賣（翊文 11-14：「股票不是跟"外面世界"買的嗎?」→「好更改」）。
//    買：股價×股數 流出館外（casBurn，來源 stockBuy），手續費進預算池（搬）。
//    賣：股價×股數 從館外進來（casMint，來源 stockSell），扣手續費進預算池（搬）。
//    莊家完全不出錢，所以沒有「全館持股 ≤ 莊家 50%」那種上限（以前莊家當對手盤時要有，莊家壹窮股市就停擺）。
//    外面世界就是整個台灣，接得住；要擋的是多頭時館裡的錢壹直變多（通膨），靠手續費、每天的 drag、每人每天賣出上限。
//    記帳照樣對得上：憑空的、消失的都有來源，日報看得到股市每天讓館裡多了或少了多少。
//
//  停盤：每支只在自己的盤中交易（台股 09:00～13:30、美股美東 09:30～16:00，也就是台灣晚上），盤外一律停，而且要等當天第壹個真實開盤價出來才開
//    （假日、美股國定假日抓不到開盤價就整天休市）。以前美股是「05:00 才動壹次、22:00～05:00 停盤」（11-14 規劃 2.8i 起改成盤中）。
//
//  上限：壹人壹天賣出 sellDay（擋多頭時壹口氣印太多錢）。
//
//  純函式：「今天」和「現在幾點」從參數來，不碰資料庫和 DOM。
//  莊家 house.stk：{ day, px: { id: 股價 }, prev: { id: 昨天的股價 }, held: { id: 全館持股 }, net: { day, n 今天全館淨賣出 } }
//  錢包 w.stk：{ own: { id: 股數 }, sold: { day, n 今天賣出的錢 }, fee 累計手續費, gain 累計賣出賺賠,
//    orders 掛單 [{ no, kind buy|sell|stop, id, n, px 限價或停損價, day 下單那天, exp 最後有效的那天, hold 鎖住的籌碼(只有 buy) }], seq, hold 鎖住的籌碼總和（錢還是玩家的，記帳算在 bkHeld）,
//    cx { day, n 今天取消幾次 }, notes 成交、取消的話（畫面下次拿到就說）}
//  限價單、停損單（規劃 2.8c，只做現股）：下單時鎖住籌碼（買）或股數（賣、停損）；每個價出來時 casStockMatch 照下單順序檢查；
//    成交價壹律用觸發的那個價（跳空比掛的價更好或更差都照它）。house.stk.hist { 日期: { id: 股價 } } 留最近幾天，隔幾天才上線的人，中間日子的價也算。
// ================================================================
import { NUM } from "./config.js";
import { casBurn, casCount, casMint } from "./casino_book.js";
import { IN_IDS, casInCostSeed, casInMatch, casInOrder, casInOrderHalt, casInPrice, casInSeen, casInValueApprox, casInView } from "./casino_stock_in.js";
import { CAS_STOCK_IN, IN_STOCKS } from "./stocks_in_text.js";
import { CAS_STOCK } from "./casino_text.js";
import { OUT_STOCKS } from "./stocks_text.js";
import { casFill, casNum } from "./casino.js";
import { outStockWeekend } from "./stocks.js";
import { TW_IDS, US_IDS, mkLen, usEarlyClose, stockIsTw, stockIsUs, twIdx, usIdx, usOpenMs } from "./stocks_tw.js";

const stBox = v => !!v && typeof v === "object" && !Array.isArray(v);
const stN = v => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
const stDay = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const stAddDays = (s, n) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const ORDER_KINDS = ["buy", "sell", "stop"];
export const STOCK_IDS = OUT_STOCKS.map(s => s.id);
const stDef = id => OUT_STOCKS.find(s => s.id === id) || null;

// 這支現在停盤嗎。台股、美股都是：只有自己的盤中、而且今天的第壹個價（真實開盤價）已經抓到才開；house.stk.tw／us 是 casStockIntraApply 算的狀態。
// 給不出時間（t 是 null，例如掛單成交）不擋；沒算過狀態（測試、舊程式）當作沒開。沒有市場的股票（現在名單裡沒有，只有測試把美股名單清空時會碰到）不擋。
const stMk = id => (stockIsTw(id) ? "tw" : stockIsUs(id) ? "us" : null);
export function casStockIdHalt(house, id, day, t) {
  if (t == null || !Number.isFinite(+t)) return false;
  const mk = stMk(id), T = mk && house && house.stk && house.stk[mk];
  if (!mk) return false;
  return !(T && T.day === day && T.st === "open");
}
const stHaltWhy = id => (stockIsTw(id) ? CAS_STOCK.twHalt : CAS_STOCK.usHalt);

// ---------- 補欄位 ----------
export function casStockFix(w) {
  if (!stBox(w.stk)) w.stk = { own: {}, sold: { day: null, n: 0 }, fee: 0, gain: 0, orders: [], seq: 0, hold: 0, cx: { day: null, n: 0 }, notes: [] };
  const S = w.stk;
  if (!stBox(S.own)) S.own = {};
  for (const k of Object.keys(S.own)) { const n = stN(S.own[k]); if (n > 0 && STOCK_IDS.includes(k)) S.own[k] = n; else delete S.own[k]; }
  if (!stBox(S.sold)) S.sold = { day: null, n: 0 };
  S.sold.day = stDay(S.sold.day) ? S.sold.day : null;
  S.sold.n = stN(S.sold.n);
  if (!stBox(S.cost)) S.cost = {}; // 每支持股的總成本（買進花的錢 ＋ 買進手續費；賣出時照比例扣）。資本利得稅、畫面的單位成本、損益用
  for (const k of Object.keys(S.cost)) { const n = stN(S.cost[k]); if (n > 0 && S.own[k] > 0 && STOCK_IDS.includes(k)) S.cost[k] = n; else delete S.cost[k]; }
  S.fee = stN(S.fee);
  S.gain = Number.isFinite(+S.gain) ? Math.floor(+S.gain) : 0; // 可以是負的
  S.seq = stN(S.seq);
  S.orders = (Array.isArray(S.orders) ? S.orders : []).map(o => stBox(o) ? { no: stN(o.no), kind: o.kind, id: o.id, n: stN(o.n), px: stN(o.px), day: stDay(o.day) ? o.day : null, exp: stDay(o.exp) ? o.exp : null, hold: o.kind === "buy" ? stN(o.hold) : 0, at: o.at == null ? null : stN(o.at) } : null)
    .filter(o => o && ORDER_KINDS.includes(o.kind) && (stDef(o.id) || IN_IDS.includes(o.id)) && o.n > 0 && o.px > 0 && o.day && o.exp);
  S.hold = S.orders.reduce((a, o) => a + o.hold, 0); // 永遠由單算出來，不會和單對不上
  if (!stBox(S.cx)) S.cx = { day: null, n: 0 };
  S.cx.day = stDay(S.cx.day) ? S.cx.day : null; S.cx.n = stN(S.cx.n);
  S.peg = stN(S.peg); // 這個錢包換股數換到第幾次（house.stk.peg.ev 的 seq）
  if (!stBox(S.seen)) S.seen = {}; // 玩家上次看到的價（view 的 fresh 用）
  for (const k of Object.keys(S.seen)) { const n = stN(S.seen[k]); if (n > 0 && STOCK_IDS.includes(k)) S.seen[k] = n; else delete S.seen[k]; }
  S.notes = (Array.isArray(S.notes) ? S.notes : []).filter(x => typeof x === "string").slice(-8);
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
  if (!stBox(H.hist)) H.hist = {};
  for (const d of Object.keys(H.hist)) { if (!stDay(d) || !stBox(H.hist[d])) delete H.hist[d]; }
  for (const k of ["tw", "us"]) { // 台股、美股盤中（casStockIntraApply 算的，不是存檔的來源）
    if (!stBox(H[k])) H[k] = { day: null, st: "pre", from: 0, idx: 0, ser: {}, past: {}, pastFrom: {} };
    if (!stBox(H[k].ser)) H[k].ser = {};
    if (!stBox(H[k].past)) H[k].past = {};
    if (!stBox(H[k].pastFrom)) H[k].pastFrom = {};
  }
  // 照真實股價的比例（規劃 2.8h）：peg.done[id] ＝ 這支已經換成比例（記第幾次換的），peg.ev ＝ 換的紀錄（錢包照順序換股數）；real[id] ＝ 畫面要的真實價
  if (!stBox(H.peg)) H.peg = { seq: 0, done: {}, ev: [] };
  H.peg.seq = stN(H.peg.seq); if (!stBox(H.peg.done)) H.peg.done = {}; if (!Array.isArray(H.peg.ev)) H.peg.ev = [];
  H.peg.ev = H.peg.ev.filter(e => stBox(e) && stDef(e.id) && stN(e.from) > 0 && stN(e.to) > 0 && stN(e.seq) > 0).map(e => ({ seq: stN(e.seq), id: e.id, from: stN(e.from), to: stN(e.to) }));
  if (!stBox(H.real)) H.real = {};
  for (const k of Object.keys(H.real)) { const r = H.real[k]; if (!STOCK_IDS.includes(k) || !stBox(r) || !(+r.px > 0)) delete H.real[k]; else H.real[k] = { sym: typeof r.sym === "string" ? r.sym.slice(0, 12) : "", px: +r.px, chg: Number.isFinite(+r.chg) ? +r.chg : 0 }; }
  if (!stBox(H.net)) H.net = { day: null, n: 0 };
  H.net.day = stDay(H.net.day) ? H.net.day : null;
  H.net.n = Number.isFinite(+H.net.n) ? Math.floor(+H.net.n) : 0;
  return H;
}

// ---------- 換日調價 ----------
// 台股、美股都改成盤中（規劃 2.8d、2.8i）：當天的漲跌已經在盤中每分鐘動完、收盤價由 casStockTwSettle／casStockUsSettle 套上去，換日只剩 drag，不會再跳壹次（不然壹天動兩遍）。
// moves 參數留著只是舊程式還這樣叫，不看它。
// 每天扣 drag%（數值平衡 11-14：真實股市長期往上漂，不扣的話抱著就賺，手續費擋不住）。
// 同壹天只調壹次。回傳 { done, day, moves: { id: 真正用的漲跌 } }
// reals：{ id: { px 前壹個遊戲日最後壹次抓到的真實價（遊戲價已經算進去的）} }（casStockReals 算的）；沒給＝不換比例、不拉回（舊程式、測試）。
//   照真實比例（規劃 2.8h）：第壹次拿到某支的真實價時，把遊戲價換成「倍數 × 真實價」（H.peg.ev 記下，錢包照比例換股數）；
//   之後每天開盤把遊戲價往「倍數 × 真實價」拉回 lamPct% 的差距，壹天最多拉回 casStockPullMax（小於手續費加 drag，所以收盤前看差距也賺不到）。
export function casStockRoll(house, day, moves, reals) {
  const C = NUM.casino.stock, H = casStockHouseFix(house);
  if (!stDay(day) || H.day === day) return { done: false, day: H.day, moves: {} };
  const used = {};
  for (const id of STOCK_IDS) {
    const m = -C.drag / 100; // 換日不跳：開盤的跳空由開盤時真實的開盤價給，只扣 drag
    const before = H.px[id], real = reals && reals[id], mult = stPegMult(id);
    H.prev[id] = before;
    let px = Math.max(C.floor, Math.round(before * (1 + m)));
    if (real && real.px > 0 && mult > 0) {
      const target = Math.max(C.floor, Math.round(mult * real.px));
      if (!H.peg.done[id]) { // 第壹次：換成真實的比例
        H.peg.seq++; H.peg.done[id] = H.peg.seq; H.peg.ev.push({ seq: H.peg.seq, id, from: before, to: target });
        const scale = target / before;
        for (const d of Object.keys(H.hist)) if (H.hist[d][id] > 0) H.hist[d][id] = Math.max(C.floor, Math.round(H.hist[d][id] * scale));
        H.held[id] = Math.floor(stN(H.held[id]) * before / target);
        H.prev[id] = target;
        px = Math.max(C.floor, Math.round(target * (1 + m)));
      } else { // 之後：每天拉回壹部分
        const D = px / target - 1, cap = casStockPullMax(), pull = Math.max(-cap, Math.min(cap, -C.peg.lamPct / 100 * D));
        px = Math.max(C.floor, Math.round(px * (1 + pull)));
      }
    }
    H.px[id] = px;
    used[id] = m;
  }
  H.day = day;
  H.hist[day] = Object.assign({}, H.px); // 隔幾天才上線的人，掛單要照中間每天的價檢查
  for (const d of Object.keys(H.hist).sort().slice(0, -(C.order.days + 2))) delete H.hist[d];
  H.net = { day, n: 0 }; // 全館淨賣出每天重算
  return { done: true, day, moves: used };
}

// ---------- 照真實股價的比例（規劃 2.8h） ----------
const stPegMult = id => (stockIsTw(id) ? NUM.casino.stock.peg.tw : stockIsUs(id) ? NUM.casino.stock.peg.us : 0);
// 壹天最多拉回幾（小數）：2 × 手續費 − drag，小於來回手續費加 drag；手續費改了自動跟著降
export const casStockPullMax = () => Math.max(0, 2 * NUM.casino.stock.feePct - NUM.casino.stock.drag) / 100;
const stOkPx = v => typeof v === "number" && isFinite(v) && v > 0;
// 某壹天（prevDay）收盤時，遊戲價已經算進去的真實價：doc 是 stocksTw／stocksUs 的資料（今天的，或 days 裡收進去的）。回傳 { id: { px, prev } }
function stRealMap(doc, prevDay) {
  const out = {};
  if (!doc || !stDay(prevDay)) return out;
  let close = null, prev = null;
  if (doc.day === prevDay) { close = {}; for (const id of Object.keys(doc.R || {})) if (doc.R[id] && stOkPx(doc.R[id].px)) close[id] = doc.R[id].px; prev = doc.prevReal; }
  else if (doc.days && doc.days[prevDay]) { close = doc.days[prevDay].close; prev = doc.days[prevDay].prev; }
  if (!close) return out;
  for (const id of Object.keys(close)) if (stOkPx(close[id])) out[id] = { px: close[id], prev: prev && stOkPx(prev[id]) ? prev[id] : null };
  return out;
}
// 換日前呼叫：前壹個遊戲日（house.stk.day）收盤的真實價，台股美股合起來
export function casStockReals(house, tw, us) {
  const H = casStockHouseFix(house);
  return Object.assign({}, stRealMap(tw, H.day), stRealMap(us, H.day));
}
// 畫面要的真實價：只給「已經算進遊戲價」的那個（上壹個錨點，或還沒開盤時前壹收盤），不給即時的（不然不用看盤軟體就能搶跑）。syms：{ id: 代號 }（只有伺服器知道，shared 不寫死）
export function casStockSetReal(house, tw, us, day, syms) {
  const H = casStockHouseFix(house), sy = syms && typeof syms === "object" ? syms : {};
  for (const doc of [tw, us]) {
    if (!doc || typeof doc !== "object") continue;
    let src = null;
    if (doc.day === day && doc.R) src = { R: doc.R, prev: doc.prevReal };
    else {
      const old = doc.day && doc.day < day ? { R: doc.R, prev: doc.prevReal, day: doc.day } : null;
      const key = doc.days ? Object.keys(doc.days).filter(d => d < day && doc.days[d].close).sort().pop() : null;
      src = old && (!key || old.day >= key) ? old : key ? { R: Object.fromEntries(Object.entries(doc.days[key].close).map(([k, v]) => [k, { px: v }])), prev: doc.days[key].prev } : null;
    }
    if (!src || !src.R) continue;
    for (const id of Object.keys(src.R)) {
      if (!STOCK_IDS.includes(id) || !src.R[id] || !stOkPx(src.R[id].px)) continue;
      const px = src.R[id].px, pv = src.prev && stOkPx(src.prev[id]) ? src.prev[id] : null;
      H.real[id] = { sym: typeof sy[id] === "string" ? sy[id] : "", px, chg: pv ? px / pv - 1 : 0 };
    }
  }
}
// 錢包照 house.stk.peg.ev 換股數：市值不變（股數 × 舊價 ÷ 新價，除不盡的零頭用籌碼補，從外面世界來，記 stockRebase）；這支的掛單全部取消、鎖住的籌碼退回。
// 每個交易開頭（碰到錢包時）呼叫壹次，已經換過的不會再換
export function casStockPegSync(w, house) {
  const S = casStockFix(w), H = casStockHouseFix(house);
  stSeed(S, H);
  casInCostSeed(w, house); // 館內股的舊持股也補成本記錄
  for (const e of H.peg.ev.filter(x => x.seq > S.peg).sort((a, b) => a.seq - b.seq)) {
    const name = stDef(e.id).name;
    if (S.cost[e.id] == null && S.own[e.id] > 0) S.cost[e.id] = S.own[e.id] * e.from; // 換股數之前還沒有成本記錄：用換之前的價算；換股數時總成本不變（市值不變，零頭用籌碼補不算成本）
    for (const o of S.orders.filter(x => x.id === e.id)) stDrop(w, S, o);
    const sh = stN(S.own[e.id]);
    if (sh > 0) {
      const value = sh * e.from, ns = Math.floor(value / e.to), rem = value - ns * e.to;
      if (ns > 0) S.own[e.id] = ns; else delete S.own[e.id];
      if (rem > 0) casMint(w, "stockRebase", rem);
      stNote(S, casFill(CAS_STOCK.peg.split, { name, from: casNum(sh), to: casNum(ns), rem: casNum(rem) }));
    }
    S.peg = e.seq;
  }
  S.peg = Math.max(S.peg, H.peg.seq);
}

// ---------- 買賣 ----------
// 成本記錄（11-14，資本利得稅）：有持股卻沒有成本記錄的舊持股，成本 ＝ 第壹次碰到時的價 × 股數（之前的漲幅不抽稅）。每次碰到錢包（casStockPegSync）、買賣時補
const stSeed = (S, H) => { for (const id of Object.keys(S.own)) if (S.cost[id] == null && H.px[id] > 0) S.cost[id] = H.px[id] * S.own[id]; };
const stFee = n => Math.ceil(n * NUM.casino.stock.feePct / 100);
// 全館持股總市值（莊家曝險看這個）
export const casStockExposure = house => { const H = casStockHouseFix(house); return STOCK_IDS.reduce((s, id) => s + H.px[id] * H.held[id], 0); };
const stSoldToday = (S, day) => (S.sold.day === day ? S.sold.n : 0);
const stNetToday = (H, day) => (H.net.day === day ? H.net.n : 0);

const stLocked = (S, id) => S.orders.reduce((a, o) => a + (o.kind !== "buy" && o.id === id ? o.n : 0), 0);

// 買 shares 股。回傳 { ok, lines } 或 { ok:false, reason }
export function casStockBuy(w, house, id, shares, day, t) {
  const C = NUM.casino.stock, S = casStockFix(w), H = casStockHouseFix(house);
  if (!stDef(id) || !stDay(day)) return { ok: false, reason: CAS_STOCK.bad };
  if (casStockIdHalt(house, id, day, t)) return { ok: false, reason: stHaltWhy(id) };
  const n = Math.floor(Number(String(shares == null ? "" : shares).replace(/[,，\s]/g, "")));
  if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: CAS_STOCK.bad };
  const px = H.px[id], cost = px * n, fee = stFee(cost);
  if (cost + fee > w.chips) return { ok: false, reason: CAS_STOCK.poor };
  stSeed(S, H);
  casBurn(w, "stockBuy", cost); // 流出館外（給外面世界）
  w.chips -= fee; house.budget += fee; casCount(house, "stockFee", fee); // 手續費進預算池（搬，不是憑空；拚經濟也是這樣直接動預算池）
  S.own[id] = stN(S.own[id]) + n;
  S.cost[id] = stN(S.cost[id]) + cost + fee; // 總成本含買進手續費
  S.fee += fee;
  H.held[id] = stN(H.held[id]) + n;
  return { ok: true, n, px, cost, fee, lines: [casFill(CAS_STOCK.buyOk, { name: stDef(id).name, n: casNum(n), px: casNum(px), cost: casNum(cost), fee: casNum(fee) })] };
}

// 賣 shares 股（"max" ＝全賣）
export function casStockSell(w, house, id, shares, day, t) {
  const C = NUM.casino.stock, S = casStockFix(w), H = casStockHouseFix(house);
  if (!stDef(id) || !stDay(day)) return { ok: false, reason: CAS_STOCK.bad };
  if (casStockIdHalt(house, id, day, t)) return { ok: false, reason: stHaltWhy(id) };
  const have0 = stN(S.own[id]), have = Math.max(0, have0 - stLocked(S, id)); // 掛單鎖住的股不能賣
  if (have0 <= 0) return { ok: false, reason: CAS_STOCK.none };
  if (have <= 0) return { ok: false, reason: casFill(CAS_STOCK.order.noShares, { n: 0 }) };
  let n = shares === "max" ? have : Math.floor(Number(String(shares == null ? "" : shares).replace(/[,，\s]/g, "")));
  if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: CAS_STOCK.bad };
  if (n > have) return { ok: false, reason: casFill(have0 > have ? CAS_STOCK.order.noShares : CAS_STOCK.notEnough, { n: casNum(have) }) };
  const px = H.px[id], gross = px * n, fee = stFee(gross);
  stSeed(S, H);
  // 資本利得稅：賣出拿到的錢（扣賣出手續費）− 這 n 股的成本（總成本照股數比例，平均成本法）> 0 的部分抽 taxPct%（向下取整）；賠錢不抽也不退
  const costOut = n >= have0 ? stN(S.cost[id]) : Math.floor(stN(S.cost[id]) * n / have0), profit = gross - fee - costOut, tax = profit > 0 ? Math.floor(profit * C.taxPct / 100) : 0, net = gross - fee - tax;
  // 壹人壹天賣出上限
  if (stSoldToday(S, day) + gross > C.sellDay) return { ok: false, reason: casFill(CAS_STOCK.sellDay, { n: casNum(Math.max(0, C.sellDay - stSoldToday(S, day))) }) };
  casMint(w, "stockSell", gross); // 從館外進來（外面世界付）
  w.chips -= fee + tax; house.budget += fee + tax; casCount(house, "stockFee", fee);
  if (tax > 0) casCount(house, "stockTax", tax); // 稅進預算池（搬，不是 burn）；日報看 house.act.stockTax
  S.own[id] = have0 - n;
  if (S.own[id] <= 0) { delete S.own[id]; delete S.cost[id]; } else S.cost[id] = Math.max(1, stN(S.cost[id]) - costOut);
  S.gain += profit; // 累計賣出賺賠（扣稅前）
  S.fee += fee;
  S.sold = { day, n: stSoldToday(S, day) + gross };
  H.held[id] = Math.max(0, stN(H.held[id]) - n);
  H.net = { day, n: stNetToday(H, day) + gross };
  return { ok: true, n, px, gross, fee, tax, profit, net, lines: [casFill(CAS_STOCK.sellOk, { name: stDef(id).name, n: casNum(n), px: casNum(px), net: casNum(net), fee: casNum(fee), taxText: "，資本利得稅 " + casNum(tax) })] };
}

// ---------- 畫面要的 ----------
// 回傳 { list: [{ id, name, line, kind, price, chg, mine, value }], fee, halt, exposeLeft, sellLeft, total }
// stale：哪幾支今天沒有新資料（shared/stocks.js 的 outStockStale）。標出來，不要讓人以為真的沒漲跌
export function casStockView(w, house, day, t, stale) {
  const C = NUM.casino.stock, S = casStockFix(w), H = casStockHouseFix(house);
  const old = Array.isArray(stale) ? stale : [];
  const list = OUT_STOCKS.map(d => {
    const mk = stMk(d.id), tw = mk === "tw", price = H.px[d.id], mine = stN(S.own[d.id]);
    // 「今天」的漲跌跟今天的開盤基準比（盤中價就是從這個基準算的），不是跟 H.prev。11-14 翊文：紅爪晶片盤中壹路跌卻顯示 ▲0.4%——
    //   11-13 那天 05:00 換日還是舊做法（把前壹晚美股的漲跌套進價格），H.prev 是那之前的價，所以「今天」把昨晚的漲幅也算進來了
    const base = mk && H[mk] && H[mk].day === day && H.hist[day] && H.hist[day][d.id] > 0 ? H.hist[day][d.id] : 0, prev = base || H.prev[d.id];
    const costTotal = mine > 0 ? (S.cost[d.id] != null ? S.cost[d.id] : price * mine) : 0, dayChg = prev > 0 ? mine * (price - prev) : 0; // 持股明細（跟館內股同樣的欄位，casInView）：costTotal 總成本（含買進手續費；還沒有記錄的舊持股用現價）、avgCost 單位成本、dayChg 今天的市值變動（籌碼）、dayPct 今天的漲跌幅（比例）、pnl 未實現損益、pnlPct 損益比例
    return { id: d.id, name: d.name, line: d.intro, kind: "out", price, chg: prev > 0 ? (price - prev) / prev : 0, mine, value: price * mine,
      costTotal, avgCost: mine > 0 ? Math.round(costTotal / mine * 100) / 100 : 0, dayChg, dayPct: prev > 0 ? (price - prev) / prev : 0, pnl: price * mine - costTotal, pnlPct: costTotal > 0 ? (price * mine - costTotal) / costTotal : 0, tax: C.taxPct / 100, locked: stLocked(S, d.id), free: Math.max(0, mine - stLocked(S, d.id)),
      stale: old.includes(d.id) ? CAS_STOCK.stale : null,
      // 11-14（規劃 2.8d）：market "tw" 台股盤中會動；halted 這支現在不能買賣；twState 台股的狀態（pre 開盤前、pending 等開盤價、open、closed）；
      //   intraday 今天盤中每分鐘的價（從 intradayFrom 分鐘起，0 ＝ 09:00；其他股票是空陣列）；fresh 價格自從玩家上次按「看過了」之後變過
      //   11-14（規劃 2.8i）：美股也盤中了：usState 美股的狀態（pre、pending、open、closed；其他股是 null）；intraday／intradayFrom 美股 ＝ 從美東 09:30 起算的分鐘（0 ＝ 09:30）
      market: mk || "us", halted: casStockIdHalt(house, d.id, day, t), twState: tw ? H.tw.st : null, usState: mk === "us" ? H.us.st : null,
      intraday: mk && H[mk].day === day && Array.isArray(H[mk].ser[d.id]) ? H[mk].ser[d.id].slice() : [], intradayFrom: mk && H[mk].day === day ? H[mk].from : 0,
      fresh: S.seen[d.id] !== price,
      // 11-14（規劃 2.8h）：real 真實代號、已經算進遊戲價的真實價、真實漲跌 %（沒有資料是 null）；mult 遊戲價 ＝ 倍數 × 真實價
      real: H.real[d.id] ? Object.assign({}, H.real[d.id]) : null, mult: stPegMult(d.id) };
  });
  return {
    list, fee: C.feePct / 100, taxPct: C.taxPct / 100, halt: false, // halt：舊欄位，不再有全館停盤，看每支的 halted
    tw: { state: H.tw.day === day ? H.tw.st : "closed", from: C.tw.from, len: C.tw.len },
    us: { state: H.us.day === day ? H.us.st : "closed", from: C.us.open, len: mkLen("us", day), early: usEarlyClose(day) }, // from：美東當天 00:00 起算的分鐘（570 ＝ 09:30）；len 390 分鐘
    usOpenAt: usOpenMs(day), // 這個遊戲日美股開盤的毫秒（日光節約已算進去；畫面要顯示台灣時間幾點開盤用 new Date(usOpenAt)，收盤 ＝ usOpenAt ＋ len×60000）
   
    total: list.reduce((s, x) => s + x.value, 0), feePaid: S.fee,
    exposeLeft: null, // 跟外面世界買賣（11-14）：沒有莊家的上限了
    bankroll: house.bankroll, houseBroke: false,
    sellLeft: Math.max(0, C.sellDay - stSoldToday(S, day)),
    orders: S.orders.map(o => ({ no: o.no, market: IN_IDS.includes(o.id) ? "in" : stMk(o.id) || "us", kind: o.kind, kindName: CAS_STOCK.order.kinds[o.kind], id: o.id, name: stOrderName(o), n: o.n, px: o.px, now: IN_IDS.includes(o.id) ? casInPrice(house, o.id, day, t).px : H.px[o.id], day: o.day, exp: o.exp, lock: o.kind === "buy" ? o.hold : 0, lockShares: o.kind === "buy" ? 0 : o.n })),
    orderLeft: Math.max(0, C.order.max - S.orders.length), orderMax: C.order.max, orderPerStock: C.order.perStock, orderDays: C.order.days,
    cancelLeft: Math.max(0, C.order.cancelDay - (S.cx.day === day ? S.cx.n : 0)), lockChips: S.hold,
    orderRule: CAS_STOCK.order.rule,
    soon: CAS_STOCK.soon, // 館內五家店、槓桿、放空、當沖還沒做
  };
}
// 館外七支＋館內五家店壹起給畫面（館內店排前面）。館內股的格式：market "in"、intraday（每 inDay.step 分鐘一個價）、intradayFrom、halted、fresh；外層 inDay
export function casStockViewAll(w, house, day, t, stale) {
  const v = casStockView(w, house, day, t, stale), iv = casInView(w, house, day, t);
  v.list = iv.list.concat(v.list);
  v.inDay = iv.inDay; v.inCap = iv.cap; v.inSellLeft = iv.sellLeft; v.inExposeLeft = iv.exposeLeft; v.inRule = iv.rule;
  v.total += iv.total; v.feePaid += iv.feePaid;
  return v;
}
// 存在股票裡的錢（記帳快照用：持股市值是帳面的，錢其實在莊家那裡，所以不加進總額）
export const casStockValue = (w, house) => { const S = casStockFix(w), H = casStockHouseFix(house); return STOCK_IDS.reduce((s, id) => s + H.px[id] * stN(S.own[id]), 0) + S.hold + casInValueApprox(w, house); }; // 鎖在買單裡的籌碼也算玩家的
export function casStockTakeNotes(w) { const S = casStockFix(w); const n = S.notes; S.notes = []; return n; }


// ---------- 限價單、停損單（規劃 2.8c，只做現股） ----------
const stOrderName = o => (stDef(o.id) || IN_STOCKS.find(s => s.id === o.id)).name; // 館內店的單也在這張清單裡（shared/casino_stock_in.js 的 casInOrder）
const stKind = o => CAS_STOCK.order.kinds[o.kind];
const stNote = (S, line) => { S.notes.push(line); S.notes = S.notes.slice(-8); };
// 下單。kind：buy 限價買、sell 限價賣、stop 停損賣；px 限價（整數）。下單時價格要比現價「更有利」，不然就等於市價單（會變成偷看價格的洞）
export function casStockOrder(w, house, kind, id, shares, px, day, t) {
  if (IN_IDS.includes(id)) return casInOrder(w, house, kind, id, shares, px, day, t); // 館內五家店：莊家當對手盤（規劃 2.8g）
  const C = NUM.casino.stock, O = CAS_STOCK.order, S = casStockFix(w), H = casStockHouseFix(house);
  if (!ORDER_KINDS.includes(kind) || !stDef(id) || !stDay(day)) return { ok: false, reason: CAS_STOCK.bad };
  if (casStockIdHalt(house, id, day, t)) return { ok: false, reason: stHaltWhy(id) };
  const num = v => Math.floor(Number(String(v == null ? "" : v).replace(/[,，\s]/g, "")));
  const n = num(shares), p = num(px);
  if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(p) || p < C.floor) return { ok: false, reason: CAS_STOCK.bad };
  if (S.orders.length >= C.order.max) return { ok: false, reason: casFill(O.full, { n: C.order.max }) };
  if (S.orders.filter(o => o.id === id).length >= C.order.perStock) return { ok: false, reason: casFill(O.fullStock, { n: C.order.perStock }) };
  const now = H.px[id];
  if (kind === "sell" ? p <= now : p >= now) return { ok: false, reason: casFill(O.px, { px: casNum(now) }) };
  // 有效到當天收盤（規劃 2.8d、2.8i；台股 13:30、美股美東 16:00，沒成交就取消，exp ＝ 下單那天；美股的收盤在台灣隔天凌晨，但還是同壹個遊戲日）。沒有盤中的股票（現在只有測試會碰到）還是有效到下壹次換日調價
  const mk = stMk(id);
  const o = { no: ++S.seq, kind, id, n, px: p, day, exp: stAddDays(day, mk ? C.order.days - 1 : C.order.days), hold: 0, at: mk && H[mk].day === day && H[mk].st === "open" ? stN(H[mk].idx) : null }; // at：盤中下的單，記下是第幾分鐘，之後只檢查這之後的價
  if (kind === "buy") {
    o.hold = p * n + stFee(p * n);
    if (o.hold > w.chips) { S.seq--; return { ok: false, reason: CAS_STOCK.poor }; }
    w.chips -= o.hold; S.hold += o.hold;
  } else {
    const free = stN(S.own[id]) - stLocked(S, id);
    if (n > free) { S.seq--; return { ok: false, reason: casFill(O.noShares, { n: casNum(Math.max(0, free)) }) }; }
  }
  S.orders.push(o);
  const line = casFill(kind === "buy" ? O.buyOk : kind === "sell" ? O.sellOk : O.stopOk, { name: stOrderName(o), n: casNum(n), px: casNum(p), lock: casNum(o.hold) });
  return { ok: true, order: o, lines: [line] };
}
// 退回鎖住的籌碼，從清單拿掉
const stDrop = (w, S, o) => { if (o.hold > 0) { w.chips += o.hold; S.hold -= o.hold; o.hold = 0; } S.orders = S.orders.filter(x => x.no !== o.no); };
// 取消壹張（玩家自己取消：停盤不行、壹天最多 cancelDay 次、不收費）
export function casStockCancel(w, no, day, t, house) {
  const C = NUM.casino.stock, O = CAS_STOCK.order, S = casStockFix(w);
  const o = S.orders.find(x => x.no === stN(no));
  if (!o) return { ok: false, reason: O.noOrder };
  if (casInOrderHalt(o.id, t)) return { ok: false, reason: CAS_STOCK_IN.halt }; // 館內店休市（23:30～05:00）也不准取消
  if (house && casStockIdHalt(house, o.id, day, t)) return { ok: false, reason: stHaltWhy(o.id) }; // 休市時間不准取消（不然看著盤外的行情再取消就是偷看）
  if (S.cx.day !== day) S.cx = { day, n: 0 };
  if (S.cx.n >= C.order.cancelDay) return { ok: false, reason: casFill(O.cancelDay, { n: C.order.cancelDay }) };
  S.cx.n++;
  stDrop(w, S, o);
  return { ok: true, lines: [O.cancelOk] };
}
// 照價格檢查這個錢包所有的單（在換日調價之後、錢包被碰到時呼叫；以後盤中價格出來也呼叫同壹個）。
// 檢查的價：下單之後每天的收盤價（house.stk.hist）加上現價；單依下單順序處理，成交價壹律是觸發的那個價。
// 過期：超過最後有效日，或最後有效日的停盤時段（22:00）→ 取消退回。回傳 { fills, cancels }
export function casStockMatch(w, house, day, t) {
  const C = NUM.casino.stock, O = CAS_STOCK.order, S = casStockFix(w), H = casStockHouseFix(house);
  const out = { fills: 0, cancels: 0 };
  const inr = casInMatch(w, house, day, t); // 館內店的單另外檢查（15 分鐘的價）
  out.fills += inr.fills; out.cancels += inr.cancels;
  if (!stDay(day) || !S.orders.length) return out;
  // 成交時 casStockBuy／casStockSell 會再呼叫 casStockFix，把 S.orders 換成新的物件：不能拿壹開始的舊物件，要照單號每次重新找（11-14 測試發現：後面的單退了鎖卻刪不掉，變成幽靈單，下次又成交壹次）
  for (const no of S.orders.map(x => x.no).sort((a, b) => a - b)) {
    const o = S.orders.find(x => x.no === no);
    if (!o || IN_IDS.includes(o.id)) continue;
    // 要檢查的價：下單之後每天的價（不含超過最後有效日的）和現價
    const okPts = [];
    const mk = stMk(o.id), tw = !!mk, T = mk ? H[mk] : null; // tw：這支有盤中（台股、美股）
    for (const d of Object.keys(H.hist).filter(d => d >= o.day && d < day && d <= o.exp).sort()) {
      if (d > o.day && H.hist[d][o.id] > 0) okPts.push(H.hist[d][o.id]);
      if (tw && T.past[d] && Array.isArray(T.past[d][o.id])) { // 那天盤中每分鐘的價（規劃 2.8d、2.8i）；下單那天只看下單之後
        const from = T.pastFrom[d] || 0, after = d === o.day && o.at != null ? o.at : -1;
        T.past[d][o.id].forEach((p, i) => { if (from + i > after && p > 0) okPts.push(p); });
      }
    }
    if (day <= o.exp) {
      const ticks = tw && T.day === day && Array.isArray(T.ser[o.id]) && T.ser[o.id].length ? T.ser[o.id] : null;
      if (!ticks) { if (!tw || o.day < day) okPts.push(H.px[o.id]); }
      else {
        if (o.day < day && H.hist[day] && H.hist[day][o.id] > 0) okPts.push(H.hist[day][o.id]); // 今天開盤前的價（換日扣 drag 後）
        const after = o.day === day && o.at != null ? o.at : -1; // 當天下的單只看下單之後的價
        ticks.forEach((p, i) => { if (T.from + i > after && p > 0) okPts.push(p); });
      }
    }
    let hit = null;
    for (const p of okPts) if (o.kind === "buy" ? p <= o.px : o.kind === "sell" ? p >= o.px : p <= o.px) { hit = p; break; }
    if (hit == null) {
      // 過期：最後有效日的價已經調進來（H.day ≥ exp）而且沒成交；行情晚到就多等壹天
      const twDone = tw && (day > o.exp || (day === o.exp && T.day === day && T.st === "closed")); // 有盤中的股票：當天收盤就過期；隔天才回來也算
      if (twDone || (!tw && ((H.day && H.day >= o.exp) || day > stAddDays(o.exp, 1)))) { stDrop(w, S, o); stNote(S, casFill(O.expire, { name: stOrderName(o), kind: stKind(o), n: casNum(o.n) })); out.cancels++; }
      continue;
    }
    // 成交：先把鎖住的還回去，再照市價單的做法走壹遍（手續費、記帳都跟市價單壹樣）。用 hit 當成交價
    stDrop(w, S, o);
    const saved = H.px[o.id];
    H.px[o.id] = hit;
    const r = o.kind === "buy" ? casStockBuy(w, house, o.id, o.n, day, null) : casStockSell(w, house, o.id, o.n, day, null);
    H.px[o.id] = saved;
    if (r.ok) {
      out.fills++;
      stNote(S, o.kind === "buy" ? casFill(O.fillBuy, { name: stOrderName(o), n: casNum(r.n), px: casNum(r.px), cost: casNum(r.cost), fee: casNum(r.fee) })
        : casFill(O.fillSell, { name: stOrderName(o), kind: stKind(o), n: casNum(r.n), px: casNum(r.px), net: casNum(r.net), fee: casNum(r.fee), taxText: "，資本利得稅 " + casNum(r.tax) }));
    } else { out.cancels++; stNote(S, casFill(O.capCancel, { name: stOrderName(o), kind: stKind(o), n: casNum(o.n) })); }
  }
  return out;
}

// 玩家按了「看過了」：記下現在的價，之後 view 的 fresh 才會是 false（價格再變又變 true）
export function casStockSeen(w, house) {
  const S = casStockFix(w), H = casStockHouseFix(house);
  S.seen = {};
  for (const id of STOCK_IDS) S.seen[id] = H.px[id];
  return { ok: true, lines: [] };
}

// ---------- 台股、美股盤中（規劃 2.8d、2.8i） ----------
// 把伺服器抓價算好的盤中資料（Firestore stocksTw/latest、stocksUs/latest，shared/stocks_tw.js 的格式）套到莊家：
// 盤中那幾支的股價 ＝ 這個分鐘的價（今天開盤價 × rel），house.stk.tw／us 記今天的狀態和盤中每分鐘的價（畫面、掛單檢查用）。
// 每次錢包被碰到、在 casStockRoll 之後呼叫；沒有資料或還沒換日就只更新狀態。純函式：t 從參數來。
// 狀態 st：pre 開盤前、pending 開盤後等第壹個價（真實開盤價）、open、closed（收盤、超過 giveUp 分鐘沒抓到、週末假日）
const stTwPx = (base, rel) => Math.max(NUM.casino.stock.floor, Math.round(base * rel));
const MKT = { tw: { ids: TW_IDS, C: () => NUM.casino.stock.tw, idx: (t, day) => twIdx(t) }, us: { ids: US_IDS, C: () => NUM.casino.stock.us, idx: (t, day) => usIdx(t, day) } };
export function casStockIntraApply(house, mk, data, day, t) {
  const C = NUM.casino.stock, M = MKT[mk], MC = M.C(), H = casStockHouseFix(house), T = H[mk], tw = data;
  const m = M.idx(t, day);
  if (m == null || !stDay(day)) return T;
  const rolled = H.day === day;
  const rec = d => (tw && tw.day === d ? tw : tw && tw.days && tw.days[d]) || null; // d 那天的資料：{ openIdx, ser, closed }
  const cur = rolled ? rec(day) : null;
  let st;
  if (outStockWeekend(day) || !rolled) st = m < 0 ? "pre" : "closed";
  else if (m < 0) st = "pre";
  else if (cur && cur.openIdx != null) st = m < cur.openIdx ? "pending" : m < mkLen(mk, day) ? "open" : "closed";
  else if (cur && cur.closed) st = "closed";
  else st = m < MC.giveUp ? "pending" : "closed";
  T.day = day; T.st = st; T.from = 0; T.idx = 0; T.ser = {};
  T.lag = cur && cur.lag ? Object.assign({}, cur.lag) : {}; T.stale = cur && cur.stale ? Object.assign({}, cur.stale) : {}; // 真實行情落後幾分鐘、這段沒抓到真實價的（槓桿單的安全閥讀，shared/casino_stock_lev.js）
  // 今天換過日、卻沒有今天的基準價（11-13：換日在「記基準價」的程式上線之前跑的，美股第壹晚整晚畫不出盤中）：用現在的價補上。
  //   沒有基準價時盤中價不會動到 H.px（下面那段跑不到），所以這時的 H.px 就是今天換日後的開盤基準
  if (rolled && !H.hist[day]) H.hist[day] = Object.assign({}, H.px);
  if (cur && cur.openIdx != null && m >= cur.openIdx && H.hist[day]) {
    T.from = cur.openIdx; T.idx = Math.min(m, mkLen(mk, day));
    for (const id of M.ids) {
      const arr = cur.ser && cur.ser[id], base = H.hist[day][id];
      if (!Array.isArray(arr) || !arr.length || !(base > 0)) continue;
      const i = Math.min(T.idx, arr.length - 1);
      T.ser[id] = arr.slice(cur.openIdx, i + 1).map(r => stTwPx(base, r));
      if (T.ser[id].length) H.px[id] = T.ser[id][T.ser[id].length - 1];
    }
  }
  // 前幾天盤中的價（隔幾天才上線的人，掛單也要照中間每天盤中的價檢查）
  T.past = {}; T.pastFrom = {};
  const days = Object.keys(Object.assign({}, tw && tw.days, tw && tw.day ? { [tw.day]: 1 } : {})).filter(d => d < day && H.hist[d]).sort().slice(-(C.order.days + 1));
  for (const d of days) {
    const r = rec(d);
    if (!r || r.openIdx == null || !r.ser) continue;
    T.past[d] = {}; T.pastFrom[d] = r.openIdx;
    for (const id of M.ids) if (Array.isArray(r.ser[id]) && H.hist[d][id] > 0) T.past[d][id] = r.ser[id].slice(r.openIdx).map(x => stTwPx(H.hist[d][id], x));
  }
  return T;
}
// 台股（舊名字，測試和 functions 在用）
export const casStockTwApply = (house, tw, day, t) => casStockIntraApply(house, "tw", tw, day, t);
// 美股：t 是現在的毫秒，day 是遊戲日期 ＝ 美東日期
export const casStockUsApply = (house, us, day, t) => casStockIntraApply(house, "us", us, day, t);
// 換日調價之前，先把上一個遊戲日的收盤價套到莊家（沒人在收盤之後碰到莊家的話，house 裡還是盤中某個價；換日要從真正的收盤價算）。
// 台股：那天 14:00 台灣時間；美股：那天美東收盤（開盤 ＋ len 分鐘）之後 1 分鐘（冬令剛好是隔天 05:00 換日那一刻，所以一定要在這裡補，不能靠玩家剛好在收盤前碰到）
export function casStockTwSettle(house, tw, day) {
  const H = casStockHouseFix(house);
  if (!H.day || H.day === day || !stDay(day)) return;
  casStockTwApply(house, tw, H.day, Date.parse(H.day + "T14:00:00+08:00"));
}
export function casStockUsSettle(house, us, day) {
  const H = casStockHouseFix(house);
  if (!H.day || H.day === day || !stDay(day)) return;
  casStockUsApply(house, us, H.day, usOpenMs(H.day) + (mkLen("us", H.day) + 1) * 60000);
}

// 大廳導覽圖銀行的「新」（11-13，美術統籌要的）：館外有幾支股票的價格自從玩家上次按「看過了」之後變過。
//   跟 casStockView 的 fresh 同壹個算法，只回數字；價是莊家文件現在記的價（盤中最後碰到的那壹下），不另外讀行情
export function casStockFreshN(w, house) {
  const S = casStockFix(w), H = casStockHouseFix(house);
  return OUT_STOCKS.reduce((n, d) => n + (S.seen[d.id] !== H.px[d.id] ? 1 : 0), 0);
}
