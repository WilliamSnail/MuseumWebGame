// 股票限價單、停損單（11-14，規劃 2.8c，只做現股）：node test/casino_stock_order.test.cjs（npm test 也會跑）
// 下單鎖籌碼／股數、成交價用觸發價（跳空）、過期、取消、上限、停盤、帳對得上、舊錢包。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const D = "2026-11-14", ID = "greeneye";
const at = (d, h) => Date.parse(`${d}T${String(h).padStart(2, "0")}:30:00+08:00`);
const OPEN = at(D, 14);
const addDay = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const fresh = G => { const w = G.casWalletFix(G.casWalletNew(), D), house = G.casHouseFix(G.casHouseNew(), D).house; w.chips = 500000000; G.casStockHouseFix(house); return { w, house }; };
const snap = (G, s) => G.casBookSnap([s.w], s.house, 0, null);
const gap = (G, s, opening) => G.casBookGap(snap(G, s), opening);
const open0 = (G, s) => G.casBookOpening(snap(G, s));
// 換日：直接把價改成某個數字，當作新的一天的價（跟 casStockRoll 一樣留 hist）
const newDay = (G, s, day, px) => { const H = s.house.stk; H.hist[H.day || D] = Object.assign({}, H.px); H.prev[ID] = H.px[ID]; H.px[ID] = px; H.day = day; H.hist[day] = Object.assign({}, H.px); };

T("限價買：鎖住籌碼（限價×股數＋手續費），總錢不變", G => {
  const s = fresh(G), op = open0(G, s), px = s.house.stk.px[ID], c0 = s.w.chips;
  const r = G.casStockOrder(s.w, s.house, "buy", ID, 10, px - 100, D, OPEN);
  assert.ok(r.ok, r.reason);
  const lock = (px - 100) * 10 + Math.ceil((px - 100) * 10 * G.NUM.casino.stock.feePct / 100);
  assert.strictEqual(s.w.chips, c0 - lock); assert.strictEqual(s.w.stk.hold, lock);
  assert.strictEqual(gap(G, s, op), 0, "鎖住的籌碼記帳還算玩家的");
  const v = G.casStockView(s.w, s.house, D, OPEN);
  assert.strictEqual(v.orders.length, 1); assert.strictEqual(v.lockChips, lock); assert.strictEqual(v.orders[0].lock, lock);
});
T("下單價格要比現價有利；停盤不能下單；張數上限", G => {
  const s = fresh(G), px = s.house.stk.px[ID];
  assert.ok(!G.casStockOrder(s.w, s.house, "buy", ID, 1, px, D, OPEN).ok, "限價買 ≥ 現價不行");
  assert.ok(!G.casStockOrder(s.w, s.house, "sell", ID, 1, px + 1, D, OPEN).ok, "沒有股不能賣");
  assert.ok(!G.casStockOrder(s.w, s.house, "stop", ID, 1, px + 1, D, OPEN).ok);
  const h = G.casStockOrder(s.w, s.house, "buy", ID, 1, px - 1, D, at(D, 23));
  assert.ok(!h.ok && h.reason.includes("停盤"));
  for (let i = 0; i < 3; i++) assert.ok(G.casStockOrder(s.w, s.house, "buy", ID, 1, px - 1 - i, D, OPEN).ok);
  assert.ok(!G.casStockOrder(s.w, s.house, "buy", ID, 1, px - 9, D, OPEN).ok, "同壹支最多 3 張");
  const ids = G.STOCK_IDS.filter(x => x !== ID);
  let n = 3;
  for (const id of ids) for (let i = 0; i < 3 && n < 10; i++) { assert.ok(G.casStockOrder(s.w, s.house, "buy", id, 1, s.house.stk.px[id] - 1, D, OPEN).ok); n++; }
  assert.strictEqual(s.w.stk.orders.length, 10);
  assert.ok(!G.casStockOrder(s.w, s.house, "buy", ids[ids.length - 1], 1, 1, D, OPEN).ok, "最多 10 張");
});
T("限價賣、停損賣鎖住股數：鎖住的不能市價賣，也不能重複掛", G => {
  const s = fresh(G), px = s.house.stk.px[ID];
  G.casStockBuy(s.w, s.house, ID, 10, D, OPEN);
  assert.ok(G.casStockOrder(s.w, s.house, "sell", ID, 6, px + 100, D, OPEN).ok);
  assert.ok(G.casStockOrder(s.w, s.house, "stop", ID, 4, px - 100, D, OPEN).ok);
  assert.ok(!G.casStockOrder(s.w, s.house, "stop", ID, 1, px - 100, D, OPEN).ok, "10 股都鎖了");
  assert.ok(!G.casStockSell(s.w, s.house, ID, 1, D, OPEN).ok, "鎖住的不能賣");
  const v = G.casStockView(s.w, s.house, D, OPEN).list.find(x => x.id === ID);
  assert.strictEqual(v.locked, 10); assert.strictEqual(v.free, 0); assert.strictEqual(v.mine, 10);
});
T("限價買成交：價格跌破就買，鎖多的退回，用觸發價（跳空比限價更便宜）；帳對得上", G => {
  const s = fresh(G), op = open0(G, s), px = s.house.stk.px[ID], lim = px - 500;
  G.casStockOrder(s.w, s.house, "buy", ID, 10, lim, D, OPEN);
  const D2 = addDay(D, 1), gapPx = px - 2000;
  newDay(G, s, D2, gapPx);
  const m = G.casStockMatch(s.w, s.house, D2, at(D2, 10));
  assert.strictEqual(m.fills, 1);
  assert.strictEqual(s.w.stk.own[ID], 10); assert.strictEqual(s.w.stk.orders.length, 0); assert.strictEqual(s.w.stk.hold, 0);
  assert.strictEqual(s.w.led.burn.stockBuy, gapPx * 10, "按跳空後的價買，不是限價");
  assert.strictEqual(gap(G, s, op), 0);
  assert.strictEqual(G.casStockTakeNotes(s.w).length, 1);
});
T("停損賣：跳空穿過停損價，按跳空後的價賣（不抹掉損失）", G => {
  const s = fresh(G), op = open0(G, s), px = s.house.stk.px[ID];
  G.casStockBuy(s.w, s.house, ID, 10, D, OPEN);
  G.casStockOrder(s.w, s.house, "stop", ID, 10, px - 300, D, OPEN);
  const D2 = addDay(D, 1), low = px - 1000;
  newDay(G, s, D2, low);
  const before = s.w.chips;
  const m = G.casStockMatch(s.w, s.house, D2, at(D2, 10));
  assert.strictEqual(m.fills, 1);
  assert.strictEqual(s.w.led.mint.stockSell, low * 10, "按跳空後的價賣，不是停損價");
  assert.ok(s.w.chips > before);
  assert.strictEqual(s.w.stk.own[ID] || 0, 0);
  assert.strictEqual(gap(G, s, op), 0);
});
T("限價賣：漲到才賣；沒到就留著；隔幾天才上線也會照中間的日子檢查", G => {
  const s = fresh(G), op = open0(G, s), px = s.house.stk.px[ID];
  G.casStockBuy(s.w, s.house, ID, 5, D, OPEN);
  G.casStockOrder(s.w, s.house, "sell", ID, 5, px + 500, D, OPEN);
  assert.strictEqual(G.casStockMatch(s.w, s.house, D, OPEN).fills, 0, "現價沒到");
  newDay(G, s, addDay(D, 1), px + 800); // 第二天漲過
  newDay(G, s, addDay(D, 2), px - 400); // 第三天又跌回來，人到這時才上線
  const m = G.casStockMatch(s.w, s.house, addDay(D, 2), at(addDay(D, 2), 10));
  assert.strictEqual(m.fills, 1, "第二天的價有到");
  assert.strictEqual(s.w.led.mint.stockSell, (px + 800) * 5, "用當天的價成交");
  assert.strictEqual(gap(G, s, op), 0);
});
T("過期：有效 1 天，今天下的單看明天 05:00 的價，沒成交就取消退回（翊文 11-13）", G => {
  const s = fresh(G), op = open0(G, s), px = s.house.stk.px[ID], c0 = s.w.chips;
  G.casStockOrder(s.w, s.house, "buy", ID, 10, px - 500, D, OPEN);
  const D2 = addDay(D, 1), D3 = addDay(D, 2);
  assert.strictEqual(G.casStockMatch(s.w, s.house, D, at(D, 23)).cancels, 0, "當天 23:00 還有效（明天的價還沒來）");
  assert.strictEqual(G.casStockMatch(s.w, s.house, D2, at(D2, 5)).cancels, 0, "隔天行情還沒調進來：等");
  newDay(G, s, D2, px);
  const m = G.casStockMatch(s.w, s.house, D2, at(D2, 6));
  assert.strictEqual(m.cancels, 1, "隔天的價沒觸發：取消");
  assert.strictEqual(s.w.chips, c0); assert.strictEqual(s.w.stk.hold, 0);
  assert.strictEqual(gap(G, s, op), 0);
  assert.ok(G.casStockTakeNotes(s.w)[0].includes("取消"));
  // 隔天的價有觸發：成交
  const u = fresh(G); const p0 = u.house.stk.px[ID]; G.casStockOrder(u.w, u.house, "buy", ID, 1, p0 - 500, D, OPEN);
  newDay(G, u, D2, p0 - 600);
  assert.strictEqual(G.casStockMatch(u.w, u.house, D2, at(D2, 6)).fills, 1, "隔天跌到限價以下：成交");
  // 第 3 天才上線的人：隔天的價有算，第 3 天的低價不算
  const t = fresh(G); G.casStockOrder(t.w, t.house, "buy", ID, 1, t.house.stk.px[ID] - 500, D, OPEN);
  newDay(G, t, D2, t.house.stk.px[ID]); newDay(G, t, D3, 1);
  assert.strictEqual(G.casStockMatch(t.w, t.house, D3, at(D3, 10)).fills, 0, "過期後的低價不算");
  assert.strictEqual(t.w.stk.orders.length, 0);
});
T("取消：退回、不收費、停盤不行、一天 20 次", G => {
  const s = fresh(G), op = open0(G, s), px = s.house.stk.px[ID], c0 = s.w.chips;
  const o = G.casStockOrder(s.w, s.house, "buy", ID, 10, px - 1, D, OPEN).order;
  assert.ok(!G.casStockCancel(s.w, o.no, D, at(D, 23)).ok, "停盤不能取消");
  assert.ok(G.casStockCancel(s.w, o.no, D, OPEN).ok);
  assert.strictEqual(s.w.chips, c0); assert.strictEqual(gap(G, s, op), 0);
  assert.ok(!G.casStockCancel(s.w, o.no, D, OPEN).ok, "已經取消了");
  for (let i = 1; i < 20; i++) { const r = G.casStockOrder(s.w, s.house, "buy", ID, 1, px - 1, D, OPEN); assert.ok(G.casStockCancel(s.w, r.order.no, D, OPEN).ok); }
  const r = G.casStockOrder(s.w, s.house, "buy", ID, 1, px - 1, D, OPEN);
  assert.ok(!G.casStockCancel(s.w, r.order.no, D, OPEN).ok, "第 21 次不行");
  assert.strictEqual(G.casStockView(s.w, s.house, D, OPEN).cancelLeft, 0);
  assert.ok(G.casStockCancel(s.w, r.order.no, addDay(D, 1), at(addDay(D, 1), 10)).ok, "隔天重算");
});
T("賣出額度不夠：成交時取消退股（不排隊）", G => {
  const s = fresh(G), px = s.house.stk.px[ID];
  s.w.chips = 5000000000; G.casStockBuy(s.w, s.house, ID, 1000, D, OPEN);
  G.casStockOrder(s.w, s.house, "sell", ID, 1000, px + 100, D, OPEN);
  s.w.stk.sold = { day: addDay(D, 1), n: G.NUM.casino.stock.sellDay }; // 明天的額度已經用完
  newDay(G, s, addDay(D, 1), px + 200);
  const m = G.casStockMatch(s.w, s.house, addDay(D, 1), at(addDay(D, 1), 10));
  assert.strictEqual(m.fills, 0); assert.strictEqual(m.cancels, 1);
  assert.strictEqual(s.w.stk.orders.length, 0); assert.strictEqual(s.w.stk.own[ID], 1000);
});
T("舊錢包沒有 orders、壞資料", G => {
  const w = G.casWalletFix(G.casWalletNew(), D);
  w.stk = { own: { [ID]: 3 }, sold: { day: null, n: 0 }, fee: 0, gain: 0 };
  assert.strictEqual(G.casStockFix(w).orders.length, 0);
  w.stk.orders = [null, { kind: "x" }, { no: 1, kind: "buy", id: ID, n: 2, px: 50, day: D, exp: D, hold: 100 }, { no: 2, kind: "sell", id: "nope", n: 1, px: 5, day: D, exp: D }];
  const S = G.casStockFix(w);
  assert.strictEqual(S.orders.length, 1); assert.strictEqual(S.hold, 100);
});
T("壹次撮合兩張單都成交：後面那張也要真的刪掉，不會變幽靈單再成交壹次（11-14 實測發現）", G => {
  const s = fresh(G), op = open0(G, s), px = s.house.stk.px[ID];
  G.casStockBuy(s.w, s.house, ID, 5, D, OPEN);
  G.casStockOrder(s.w, s.house, "stop", ID, 3, px - 500, D, OPEN);
  G.casStockOrder(s.w, s.house, "buy", ID, 10, px - 1000, D, OPEN);
  s.house.stk.px[ID] = px - 2000;
  const m = G.casStockMatch(s.w, s.house, D, OPEN);
  assert.strictEqual(m.fills, 2);
  assert.strictEqual(s.w.stk.orders.length, 0, "兩張都要刪掉");
  assert.strictEqual(G.casStockFix(s.w).hold, 0); assert.strictEqual(s.w.stk.own[ID], 12);
  const again = G.casStockMatch(s.w, s.house, D, OPEN);
  assert.strictEqual(again.fills, 0, "不會再成交壹次");
  assert.strictEqual(gap(G, s, op), 0);
});
T("壹次撮合：前面的成交、後面的過期，退回的鎖也要真的刪掉單", G => {
  const s = fresh(G), op = open0(G, s), px = s.house.stk.px[ID];
  G.casStockBuy(s.w, s.house, ID, 5, D, OPEN);
  G.casStockOrder(s.w, s.house, "stop", ID, 3, px - 500, D, OPEN);
  G.casStockOrder(s.w, s.house, "buy", ID, 10, px - 3000, D, OPEN);
  // 隔天跌了（hist 有那天的價），再隔壹天才上線：停損吃到跌的那天，買單沒到價、也過了有效日，退回去刪掉
  const D1 = addDay(D, 1), D2 = addDay(D, 2);
  s.house.stk.hist[D1] = Object.assign({}, s.house.stk.px, { [ID]: px - 1000 });
  s.house.stk.day = D1; // 有效日的價已經調進來
  const m = G.casStockMatch(s.w, s.house, D2, at(D2, 10));
  assert.strictEqual(m.fills, 1); assert.strictEqual(m.cancels, 1);
  assert.strictEqual(s.w.stk.orders.length, 0); assert.strictEqual(G.casStockFix(s.w).hold, 0);
  assert.strictEqual(gap(G, s, op), 0);
});
console.log(`casino_stock_order.test：${pass} 過，${fail} 沒過`);
if (fail) process.exit(1);
