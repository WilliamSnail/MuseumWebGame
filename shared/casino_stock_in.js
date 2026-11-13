// ================================================================
//  館內五家店的股票（11-14，規劃 docs/經濟體系規劃.md 2.8a、2.8b、2.8e、2.8g；翊文：「05:00～23:30」「好，用 0.03」）
//  五家店：餐車 food、賭場牌桌 bj、委託櫃台 job、地下收藏庫 cellar、手作坊 craft。
//  跟館外股票（shared/casino_stock.js）分開，由莊家當對手盤（館裡自己的店）：買＝籌碼進莊家，賣＝莊家付；股價漲跌不搬錢。
//
//  價格怎麼來：
//    每天 05:00 的跳空 m ＝ k ×（昨天這家店「不同的人」數 a ÷ 前 avgDays 個有效日的平均 − 1）＋ moodPct% × 景氣 B ＋ 隨機 ±noise%，夾 ±jumpCap%。
//      有效日 ＝ 不同的人 ≥ minPeople 的那天；昨天不到 minPeople 人、或有效日不到 minDays 天：不調價（m ＝ 0）。
//      k ＝ 0.03（翊文 11-14）：K 大了，看盤的人預測活動量就能穩賺、或自己多去一次就能推高價格（test/sim_stock_inhouse.cjs）。
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
import { NUM } from "./config.js";
import { casCount, casHouseMove } from "./casino_book.js";
import { casFill, casNum } from "./casino.js";
import { hashStr, mulberry32 } from "./logic.js";
import { CAS_STOCK_IN, IN_STOCKS } from "./stocks_in_text.js";

const inBox = v => !!v && typeof v === "object" && !Array.isArray(v);
const inN = v => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
const inDay = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const inAdd = (s, n) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const inDiff = (a, b) => { const f = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((f(b) - f(a)) / 86400000); };
export const IN_STORES = ["food", "bj", "job", "cellar", "craft"];
export const IN_IDS = IN_STOCKS.map(s => s.id);
const inDef = id => IN_STOCKS.find(s => s.id === id) || null;
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
    casCount(house, "inUse");
  }
  return true;
}

// ---------- 補欄位 ----------
export function casInFix(w) {
  if (!inBox(w.sin)) w.sin = { own: {}, sold: { day: null, n: 0 }, fee: 0, seen: {} };
  const S = w.sin;
  if (!inBox(S.own)) S.own = {};
  for (const k of Object.keys(S.own)) { const n = inN(S.own[k]); if (n > 0 && IN_IDS.includes(k)) S.own[k] = n; else delete S.own[k]; }
  if (!inBox(S.sold)) S.sold = { day: null, n: 0 };
  S.sold.day = inDay(S.sold.day) ? S.sold.day : null; S.sold.n = inN(S.sold.n);
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
  if (!inBox(H.net)) H.net = { day: null, n: 0 };
  H.net.day = inDay(H.net.day) ? H.net.day : null;
  H.net.n = Number.isFinite(+H.net.n) ? Math.floor(+H.net.n) : 0;
  return H;
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
export function casInSeries(open, day, id, secret) {
  const C = NUM.casino.stockIn, step = C.daySd / 100 / Math.sqrt(C.ticks - 1), rnd = mulberry32(hashStr(`${secret}|${day}|${id}|series`));
  const lo = open * (1 - C.dayCap / 100), hi = open * (1 + C.dayCap / 100), out = [Math.max(C.floor, Math.round(open))];
  let p = open;
  for (let i = 1; i < C.ticks; i++) { p = Math.max(lo, Math.min(hi, p * (1 + step * inGauss(rnd)))); out.push(Math.max(C.floor, Math.round(p))); }
  return out;
}

// ---------- 05:00 的跳空 ----------
// 昨天這家店不同的人數 a，對照前 avgDays 個「有效日」（人數 ≥ minPeople）的平均。回傳 { m, quiet }
export function casInJump(H, id, day, B, secret) {
  const C = NUM.casino.stockIn, y = inAdd(day, -1), a = inN(H.use[y] && H.use[y][id]);
  const valid = [];
  for (let i = 2; i <= C.histDays && valid.length < C.avgDays; i++) { const n = inN(H.use[inAdd(day, -i)] && H.use[inAdd(day, -i)][id]); if (n >= C.minPeople) valid.push(n); }
  if (a < C.minPeople || valid.length < C.minDays) return { m: 0, quiet: true };
  const avg = valid.reduce((s, x) => s + x, 0) / valid.length, rnd = mulberry32(hashStr(`${secret}|${day}|${id}|jump`));
  const b = Number.isFinite(+B) ? Math.max(-1, Math.min(1, +B)) : 0;
  const m = C.k * (a / avg - 1) + C.moodPct / 100 * b + (rnd() - 0.5) * 2 * C.noise / 100;
  return { m: Math.max(-C.jumpCap / 100, Math.min(C.jumpCap / 100, m)), quiet: false };
}

// 換日：算今天的開盤價。同壹天只算壹次；隔了好幾天（沒人來）壹天壹天補（最多 30 天，沒人去＝不調價）。
// B：景氣（house.econ.b）。回傳 { done, day, jump: { id: m } }
export function casInRoll(house, day, B, secret) {
  const C = NUM.casino.stockIn, H = casInHouseFix(house);
  if (!inDay(day) || H.day === day) return { done: false, day: H.day, jump: {} };
  if (H.day === null) { // 第壹天：照起始價開
    H.day = day;
    for (const id of IN_IDS) { H.close[id] = H.open[id]; H.jump[id] = 0; H.quiet[id] = true; }
    return { done: true, day, jump: {} };
  }
  let d = H.day;
  const n = Math.min(30, Math.max(1, inDiff(H.day, day)));
  for (let i = 0; i < n; i++) {
    const next = inAdd(d, 1);
    for (const id of IN_IDS) {
      const close = casInSeries(H.open[id], d, id, secret)[C.ticks - 1];
      const j = casInJump(H, id, next, B, secret);
      H.close[id] = close;
      H.jump[id] = j.m; H.quiet[id] = j.quiet;
      H.open[id] = Math.max(C.floor, Math.round(close * (1 + j.m)));
    }
    d = next;
  }
  H.day = day; // 隔了超過 30 天：直接當今天
  return { done: true, day, jump: Object.assign({}, H.jump) };
}

// 現在這支的價：{ px, idx, halted }。house 還沒算今天（H.day ≠ day）：用最後壹次算的開盤價
export function casInPrice(house, id, day, t, secret) {
  const C = NUM.casino.stockIn, H = casInHouseFix(house);
  if (!inDef(id)) return { px: 0, idx: null, halted: true };
  const idx = casInIdx(t), ser = casInSeries(H.open[id], H.day || day, id, secret);
  if (idx !== null) return { px: ser[Math.min(idx, ser.length - 1)], idx, halted: false };
  // 停盤（23:30～隔天 05:00，這段時間的「今天」還是前壹天）：價格停在最後壹個價。沒給時間（測試、舊程式）：開盤價，不當停盤
  return { px: t == null ? ser[0] : ser[C.ticks - 1], idx: null, halted: t != null };
}

// ---------- 買賣 ----------
const inHeld = (H, house) => IN_IDS.reduce((s, id) => s + inN(H.held[id]) * H.open[id], 0); // 全館持股市值（用開盤價估，夠用來擋上限）
// 莊家能接多少館內股（規劃 2.8e）：max(exposeFloor, 莊家的錢 × exposePct%)；莊家 ≤ 0 時不接
export const casInExposeCap = house => (house.bankroll > 0 ? Math.max(NUM.casino.stockIn.exposeFloor, Math.floor(house.bankroll * NUM.casino.stock.exposePct / 100)) : 0);
// 全館壹天淨賣出上限（規劃 2.8a 第 7 條）：max(莊家的錢, 0) × netSellPct% ＋ netSellFlat
const inNetCap = house => Math.floor(Math.max(0, house.bankroll) * NUM.casino.stock.netSellPct / 100) + NUM.casino.stock.netSellFlat;
const inNetToday = (H, day) => (H.net.day === day ? H.net.n : 0);
const inSoldToday = (S, day) => (S.sold.day === day ? S.sold.n : 0);
const inShares = v => Math.floor(Number(String(v == null ? "" : v).replace(/[,，\s]/g, "")));

export function casInBuy(w, house, id, shares, day, t, secret) {
  const C = NUM.casino.stockIn, S = casInFix(w), H = casInHouseFix(house), T = CAS_STOCK_IN;
  if (!inDef(id) || !inDay(day)) return { ok: false, reason: T.bad };
  if (H.day !== day) return { ok: false, reason: T.halt };
  const pr = casInPrice(house, id, day, t, secret);
  if (pr.halted) return { ok: false, reason: T.halt };
  if (!(house.bankroll > 0)) return { ok: false, reason: T.houseBroke };
  const n = inShares(shares);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: T.bad };
  const have = inN(S.own[id]);
  if (have + n > C.cap) return { ok: false, reason: casFill(T.cap, { n: casNum(C.cap), have: casNum(have) }) };
  const px = pr.px, cost = px * n, fee = inFee(cost);
  if (!(w.chips >= cost + fee)) return { ok: false, reason: T.poor };
  if (inHeld(H, house) + cost > casInExposeCap(house)) return { ok: false, reason: T.exposed };
  w.chips -= cost + fee;
  casHouseMove(house, "stockIn", cost); // 買進的錢進莊家（莊家當對手盤）
  house.budget += fee; casCount(house, "stockFee", fee); // 手續費進預算池（搬）
  S.own[id] = have + n; S.fee += fee;
  H.held[id] = inN(H.held[id]) + n;
  H.net = { day, n: inNetToday(H, day) - cost }; // 買進讓今天的淨賣出變少
  return { ok: true, n, px, cost, fee, lines: [casFill(T.buyOk, { name: inDef(id).name, n: casNum(n), px: casNum(px), cost: casNum(cost), fee: casNum(fee) })] };
}
export function casInSell(w, house, id, shares, day, t, secret) {
  const C = NUM.casino.stock, S = casInFix(w), H = casInHouseFix(house), T = CAS_STOCK_IN;
  if (!inDef(id) || !inDay(day)) return { ok: false, reason: T.bad };
  if (H.day !== day) return { ok: false, reason: T.halt };
  const pr = casInPrice(house, id, day, t, secret);
  if (pr.halted) return { ok: false, reason: T.halt };
  const have = inN(S.own[id]);
  if (have <= 0) return { ok: false, reason: T.none };
  const n = shares === "max" ? have : inShares(shares);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: T.bad };
  if (n > have) return { ok: false, reason: casFill(T.notEnough, { n: casNum(have) }) };
  const px = pr.px, gross = px * n, fee = inFee(gross), net = gross - fee;
  if (inSoldToday(S, day) + gross > C.sellDay) return { ok: false, reason: casFill(T.sellDay, { n: casNum(Math.max(0, C.sellDay - inSoldToday(S, day))) }) };
  if (inNetToday(H, day) + gross > inNetCap(house)) return { ok: false, reason: T.queue }; // 莊家付不過來，明天再賣
  casHouseMove(house, "stockIn", -gross);
  w.chips += net; house.budget += fee; casCount(house, "stockFee", fee);
  S.own[id] = have - n; if (S.own[id] <= 0) delete S.own[id];
  S.fee += fee; S.sold = { day, n: inSoldToday(S, day) + gross };
  H.held[id] = Math.max(0, inN(H.held[id]) - n);
  H.net = { day, n: inNetToday(H, day) + gross };
  return { ok: true, n, px, gross, fee, net, lines: [casFill(T.sellOk, { name: inDef(id).name, n: casNum(n), px: casNum(px), net: casNum(net), fee: casNum(fee) })] };
}

// ---------- 畫面要的 ----------
// 回傳 { list: [{ id, name, line, kind, market: "in", price, chg, mine, value, halted, intraday, intradayFrom, fresh, stale, quiet, jump }], inDay: { from, len, step }, ... }
// intraday：今天 05:00 到現在每 15 分鐘的價（不給未來的）；intradayFrom：從第幾個價開始（0 ＝ 05:00）。chg：跟昨天收盤比
export function casInView(w, house, day, t, secret) {
  const C = NUM.casino.stockIn, S = casInFix(w), H = casInHouseFix(house);
  const ready = H.day === day, idx = casInIdx(t), closed = t != null && Number.isFinite(+t) && idx === null;
  const list = IN_STOCKS.map(d => {
    const ser = ready ? casInSeries(H.open[d.id], day, d.id, secret) : [], upto = idx !== null ? idx : (closed ? ser.length - 1 : 0);
    const price = ready ? ser[Math.min(upto, ser.length - 1)] : H.open[d.id], mine = inN(S.own[d.id]);
    return { id: d.id, name: d.name, line: d.intro, kind: "in", market: "in", price, chg: H.close[d.id] > 0 ? (price - H.close[d.id]) / H.close[d.id] : 0, mine, value: price * mine,
      halted: !ready || (t != null && idx === null), intraday: ready ? ser.slice(0, upto + 1) : [], intradayFrom: 0, fresh: S.seen[d.id] !== price, stale: null, quiet: !!H.quiet[d.id], jump: H.jump[d.id] };
  });
  return { list, inDay: { from: C.from, len: C.ticks, step: C.step }, cap: C.cap, total: list.reduce((s, x) => s + x.value, 0), feePaid: S.fee, feePct: NUM.casino.stock.feePct / 100,
    sellLeft: Math.max(0, NUM.casino.stock.sellDay - inSoldToday(S, day)), exposeLeft: Math.max(0, casInExposeCap(house) - inHeld(H, house)), bankroll: house.bankroll, houseBroke: !(house.bankroll > 0), rule: CAS_STOCK_IN.rule };
}
// 玩家按「看過了」：記下現在的價（fresh 用）
export function casInSeen(w, house, day, t, secret) {
  const S = casInFix(w);
  for (const d of IN_STOCKS) { const p = casInPrice(house, d.id, day, t, secret).px; if (p > 0) S.seen[d.id] = p; }
}
// 存在館內股票的錢（記帳快照用）：持股市值是帳面的，錢其實在莊家那裡，所以不加進總額——只給畫面看
export const casInValue = (w, house, day, t, secret) => { const S = casInFix(w); return IN_IDS.reduce((s, id) => s + inN(S.own[id]) * casInPrice(house, id, day, t, secret).px, 0); };
