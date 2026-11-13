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
//  停盤（數值平衡 11-14）：真實美股台灣時間 22:30～05:00 就看得到收盤，遊戲 05:00 才調價。
//    不擋的話晚上看完盤再下單等於穩賺，所以台灣時間 22:00～05:00 不能買賣。
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
import { CAS_STOCK } from "./casino_text.js";
import { OUT_STOCKS } from "./stocks_text.js";
import { casFill, casNum } from "./casino.js";

const stBox = v => !!v && typeof v === "object" && !Array.isArray(v);
const stN = v => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
const stDay = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const stAddDays = (s, n) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const ORDER_KINDS = ["buy", "sell", "stop"];
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
  if (!stBox(w.stk)) w.stk = { own: {}, sold: { day: null, n: 0 }, fee: 0, gain: 0, orders: [], seq: 0, hold: 0, cx: { day: null, n: 0 }, notes: [] };
  const S = w.stk;
  if (!stBox(S.own)) S.own = {};
  for (const k of Object.keys(S.own)) { const n = stN(S.own[k]); if (n > 0 && STOCK_IDS.includes(k)) S.own[k] = n; else delete S.own[k]; }
  if (!stBox(S.sold)) S.sold = { day: null, n: 0 };
  S.sold.day = stDay(S.sold.day) ? S.sold.day : null;
  S.sold.n = stN(S.sold.n);
  S.fee = stN(S.fee);
  S.gain = Number.isFinite(+S.gain) ? Math.floor(+S.gain) : 0; // 可以是負的
  S.seq = stN(S.seq);
  S.orders = (Array.isArray(S.orders) ? S.orders : []).map(o => stBox(o) ? { no: stN(o.no), kind: o.kind, id: o.id, n: stN(o.n), px: stN(o.px), day: stDay(o.day) ? o.day : null, exp: stDay(o.exp) ? o.exp : null, hold: o.kind === "buy" ? stN(o.hold) : 0 } : null)
    .filter(o => o && ORDER_KINDS.includes(o.kind) && stDef(o.id) && o.n > 0 && o.px > 0 && o.day && o.exp);
  S.hold = S.orders.reduce((a, o) => a + o.hold, 0); // 永遠由單算出來，不會和單對不上
  if (!stBox(S.cx)) S.cx = { day: null, n: 0 };
  S.cx.day = stDay(S.cx.day) ? S.cx.day : null; S.cx.n = stN(S.cx.n);
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
  H.hist[day] = Object.assign({}, H.px); // 隔幾天才上線的人，掛單要照中間每天的價檢查
  for (const d of Object.keys(H.hist).sort().slice(0, -(C.order.days + 2))) delete H.hist[d];
  H.net = { day, n: 0 }; // 全館淨賣出每天重算
  return { done: true, day, moves: used };
}

// ---------- 買賣 ----------
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
  if (casStockHalt(t)) return { ok: false, reason: CAS_STOCK.halt };
  const n = Math.floor(Number(String(shares == null ? "" : shares).replace(/[,，\s]/g, "")));
  if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: CAS_STOCK.bad };
  const px = H.px[id], cost = px * n, fee = stFee(cost);
  if (cost + fee > w.chips) return { ok: false, reason: CAS_STOCK.poor };
  casBurn(w, "stockBuy", cost); // 流出館外（給外面世界）
  w.chips -= fee; house.budget += fee; casCount(house, "stockFee", fee); // 手續費進預算池（搬，不是憑空；拚經濟也是這樣直接動預算池）
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
  const have0 = stN(S.own[id]), have = Math.max(0, have0 - stLocked(S, id)); // 掛單鎖住的股不能賣
  if (have0 <= 0) return { ok: false, reason: CAS_STOCK.none };
  if (have <= 0) return { ok: false, reason: casFill(CAS_STOCK.order.noShares, { n: 0 }) };
  let n = shares === "max" ? have : Math.floor(Number(String(shares == null ? "" : shares).replace(/[,，\s]/g, "")));
  if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: CAS_STOCK.bad };
  if (n > have) return { ok: false, reason: casFill(have0 > have ? CAS_STOCK.order.noShares : CAS_STOCK.notEnough, { n: casNum(have) }) };
  const px = H.px[id], gross = px * n, fee = stFee(gross), net = gross - fee;
  // 壹人壹天賣出上限
  if (stSoldToday(S, day) + gross > C.sellDay) return { ok: false, reason: casFill(CAS_STOCK.sellDay, { n: casNum(Math.max(0, C.sellDay - stSoldToday(S, day))) }) };
  casMint(w, "stockSell", gross); // 從館外進來（外面世界付）
  w.chips -= fee; house.budget += fee; casCount(house, "stockFee", fee);
  S.own[id] = have0 - n;
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
    return { id: d.id, name: d.name, line: d.intro, kind: "out", price, chg: prev > 0 ? (price - prev) / prev : 0, mine, value: price * mine, locked: stLocked(S, d.id), free: Math.max(0, mine - stLocked(S, d.id)),
      stale: old.includes(d.id) ? CAS_STOCK.stale : null };
  });
  return {
    list, fee: C.feePct / 100, halt: casStockHalt(t), haltFrom: C.haltFrom, haltTo: C.haltTo,
    total: list.reduce((s, x) => s + x.value, 0), feePaid: S.fee,
    exposeLeft: null, // 跟外面世界買賣（11-14）：沒有莊家的上限了
    bankroll: house.bankroll, houseBroke: false,
    sellLeft: Math.max(0, C.sellDay - stSoldToday(S, day)),
    orders: S.orders.map(o => ({ no: o.no, kind: o.kind, kindName: CAS_STOCK.order.kinds[o.kind], id: o.id, name: stDef(o.id).name, n: o.n, px: o.px, now: H.px[o.id], day: o.day, exp: o.exp, lock: o.kind === "buy" ? o.hold : 0, lockShares: o.kind === "buy" ? 0 : o.n })),
    orderLeft: Math.max(0, C.order.max - S.orders.length), orderMax: C.order.max, orderPerStock: C.order.perStock, orderDays: C.order.days,
    cancelLeft: Math.max(0, C.order.cancelDay - (S.cx.day === day ? S.cx.n : 0)), lockChips: S.hold,
    orderRule: CAS_STOCK.order.rule,
    soon: CAS_STOCK.soon, // 館內五家店、槓桿、放空、當沖還沒做
  };
}
// 存在股票裡的錢（記帳快照用：持股市值是帳面的，錢其實在莊家那裡，所以不加進總額）
export const casStockValue = (w, house) => { const S = casStockFix(w), H = casStockHouseFix(house); return STOCK_IDS.reduce((s, id) => s + H.px[id] * stN(S.own[id]), 0) + S.hold; }; // 鎖在買單裡的籌碼也算玩家的
export function casStockTakeNotes(w) { const S = casStockFix(w); const n = S.notes; S.notes = []; return n; }


// ---------- 限價單、停損單（規劃 2.8c，只做現股） ----------
const stOrderName = o => stDef(o.id).name;
const stKind = o => CAS_STOCK.order.kinds[o.kind];
const stNote = (S, line) => { S.notes.push(line); S.notes = S.notes.slice(-8); };
// 下單。kind：buy 限價買、sell 限價賣、stop 停損賣；px 限價（整數）。下單時價格要比現價「更有利」，不然就等於市價單（會變成偷看價格的洞）
export function casStockOrder(w, house, kind, id, shares, px, day, t) {
  const C = NUM.casino.stock, O = CAS_STOCK.order, S = casStockFix(w), H = casStockHouseFix(house);
  if (!ORDER_KINDS.includes(kind) || !stDef(id) || !stDay(day)) return { ok: false, reason: CAS_STOCK.bad };
  if (casStockHalt(t)) return { ok: false, reason: O.halt };
  const num = v => Math.floor(Number(String(v == null ? "" : v).replace(/[,，s]/g, "")));
  const n = num(shares), p = num(px);
  if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(p) || p < C.floor) return { ok: false, reason: CAS_STOCK.bad };
  if (S.orders.length >= C.order.max) return { ok: false, reason: casFill(O.full, { n: C.order.max }) };
  if (S.orders.filter(o => o.id === id).length >= C.order.perStock) return { ok: false, reason: casFill(O.fullStock, { n: C.order.perStock }) };
  const now = H.px[id];
  if (kind === "sell" ? p <= now : p >= now) return { ok: false, reason: casFill(O.px, { px: casNum(now) }) };
  const o = { no: ++S.seq, kind, id, n, px: p, day, exp: stAddDays(day, C.order.days - 1), hold: 0 };
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
const stDrop = (w, S, o) => { if (o.hold > 0) { w.chips += o.hold; S.hold -= o.hold; o.hold = 0; } S.orders = S.orders.filter(x => x !== o); };
// 取消壹張（玩家自己取消：停盤不行、壹天最多 cancelDay 次、不收費）
export function casStockCancel(w, no, day, t) {
  const C = NUM.casino.stock, O = CAS_STOCK.order, S = casStockFix(w);
  if (casStockHalt(t)) return { ok: false, reason: O.halt };
  const o = S.orders.find(x => x.no === stN(no));
  if (!o) return { ok: false, reason: O.noOrder };
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
  if (!stDay(day) || !S.orders.length) return out;
  for (const o of S.orders.slice().sort((a, b) => a.no - b.no)) {
    // 要檢查的價：下單之後每天的價（不含超過最後有效日的）和現價
    const okPts = Object.keys(H.hist).filter(d => d > o.day && d < day && d <= o.exp).sort().map(d => H.hist[d][o.id]).filter(p => p > 0);
    if (day <= o.exp) okPts.push(H.px[o.id]);
    let hit = null;
    for (const p of okPts) if (o.kind === "buy" ? p <= o.px : o.kind === "sell" ? p >= o.px : p <= o.px) { hit = p; break; }
    if (hit == null) {
      if (day > o.exp || (day === o.exp && casStockHalt(t))) { stDrop(w, S, o); stNote(S, casFill(O.expire, { name: stOrderName(o), kind: stKind(o), n: casNum(o.n) })); out.cancels++; }
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
        : casFill(O.fillSell, { name: stOrderName(o), kind: stKind(o), n: casNum(r.n), px: casNum(r.px), net: casNum(r.net), fee: casNum(r.fee) }));
    } else { out.cancels++; stNote(S, casFill(O.capCancel, { name: stOrderName(o), kind: stKind(o), n: casNum(o.n) })); }
  }
  return out;
}
