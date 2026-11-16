// 股價小數兩位（決定 0108）：node test/stock_decimal.test.cjs（npm test 也會跑）
// 錢包的籌碼照舊整數；股價、進場價、強平價、停損停利用小數兩位。每次真的動錢（買賣、手續費、稅、損益、保證金）都在那一步取整數：
//   買進成本進位（玩家多付）、賣出收入捨去（玩家少拿）、手續費進位、稅捨去、損益四捨五入（對稱）。守恆（casBookGap）每一步都要是 0。
const assert = require("assert");
const load = () => { const G = require("./load_shared.cjs").load(); G.NUM.casino.stock.direct = false; G.NUM.casino.houseLoan.cultureDue = ""; G.NUM.casino.grants = []; G.NUM.casino.stockLev.levByCredit = [[0, 5]]; return G; };
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.US_IDS.length = 0; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const D = "2026-11-14", ID = "greeneye";
const at = (d, h) => Date.parse(`${d}T${String(h).padStart(2, "0")}:30:00+08:00`);
const OPEN = at(D, 14);
const fresh = (G, px) => { const w = G.casWalletFix(G.casWalletNew(), D), house = G.casHouseFix(G.casHouseNew(), D).house; w.chips = 500000000; house.bankroll = 500000000; G.casStockHouseFix(house); if (px != null) { house.stk.px[ID] = px; house.stk.prev[ID] = px; } return { w, house }; };
const snap = (G, s) => G.casBookSnap([s.w], s.house, 0, null);
const gap = (G, s, op) => G.casBookGap(snap(G, s), op);
const fakeSrc = P => ({ now: id => ({ px: P.px[id], idx: P.idx || 0, open: true, lag: null, stale: false }), path: (id, d, from) => (P.ser && P.ser[id] ? P.ser[id].slice(from + 1) : []), close: () => null });

T("價取到小數兩位：stPx、stCents、買進進位、賣出捨去、市值捨去", G => {
  assert.strictEqual(G.stPx(56.374), 56.37); assert.strictEqual(G.stPx(56.375), 56.38); assert.strictEqual(G.stPx(-3), 0); assert.strictEqual(G.stPx("x"), 0);
  assert.strictEqual(G.stCents(56.37), 5637);
  assert.strictEqual(G.stBuyCost(56.37, 3), Math.ceil(169.11)); assert.strictEqual(G.stSellGet(56.37, 3), 169); assert.strictEqual(G.stValue(56.37, 3), 169);
  assert.strictEqual(G.stBuyCost(56.5, 2), 113); assert.strictEqual(G.stSellGet(56.5, 2), 113, "剛好整數不多不少");
  assert.strictEqual(G.stBuyCost(0.29, 100), 29, "浮點：0.29 × 100 不能變 29.000000000000004 進位成 30");
  assert.ok(G.casPx(56.4) === "56.40" && G.casPx(56) === "56" && G.casPx(1234.5) === "1,234.50");
});
T("買賣：小數價的成本進位、收入捨去、手續費進位、稅捨去；錢包全是整數；帳對得上", G => {
  const C = G.NUM.casino.stock, s = fresh(G, 56.37), op = G.casBookOpening(snap(G, s));
  const r = G.casStockBuy(s.w, s.house, ID, 7, D, OPEN);
  assert.ok(r.ok, r.reason); assert.strictEqual(r.px, 56.37);
  const cost = Math.ceil(5637 * 7 / 100), fee = Math.ceil(cost * C.feePct / 100);
  assert.strictEqual(r.cost, cost); assert.strictEqual(r.fee, fee); assert.ok(Number.isInteger(s.w.chips) && Number.isInteger(s.w.stk.cost[ID]));
  assert.strictEqual(s.w.stk.cost[ID], cost + fee); assert.strictEqual(gap(G, s, op), 0, "買完守恆");
  s.house.stk.px[ID] = 57.91;
  const q = G.casStockSell(s.w, s.house, ID, "max", D, OPEN);
  assert.ok(q.ok, q.reason);
  const gross = Math.floor(5791 * 7 / 100), sfee = Math.ceil(gross * C.feePct / 100), profit = gross - sfee - (cost + fee), tax = Math.ceil(gross * C.taxPct / 100);
  assert.strictEqual(q.gross, gross); assert.strictEqual(q.fee, sfee); assert.strictEqual(q.tax, tax); assert.strictEqual(q.net, gross - sfee - tax);
  assert.ok(Number.isInteger(s.w.chips)); assert.strictEqual(gap(G, s, op), 0, "賣完守恆");
});
T("來回一次不會憑空多出錢：同價買了馬上賣，玩家只會少（進位加捨去加手續費），不會多", G => {
  for (const px of [56.37, 0.37, 141.49, 1235.01, 30.01]) for (const n of [1, 3, 7, 13, 101]) {
    const s = fresh(G, px), c0 = s.w.chips, op = G.casBookOpening(snap(G, s));
    assert.ok(G.casStockBuy(s.w, s.house, ID, n, D, OPEN).ok);
    assert.ok(G.casStockSell(s.w, s.house, ID, n, D, OPEN).ok);
    assert.ok(s.w.chips <= c0, `px ${px} n ${n}：來回後 ${s.w.chips - c0}`); assert.strictEqual(gap(G, s, op), 0);
  }
});
T("掛單：小數價；買單鎖的籌碼是整數；成交用觸發的價；退回、帳都對", G => {
  const s = fresh(G, 56.37), op = G.casBookOpening(snap(G, s)), h = s.house;
  const o = G.casStockOrder(s.w, h, "buy", ID, 10, "55.5", D, OPEN);
  assert.ok(o.ok, o.reason); assert.strictEqual(o.order.px, 55.5);
  const hold = Math.ceil(5550 * 10 / 100); assert.strictEqual(o.order.hold, hold + Math.ceil(hold * G.NUM.casino.stock.feePct / 100));
  assert.ok(Number.isInteger(s.w.stk.hold)); assert.strictEqual(gap(G, s, op), 0, "掛單鎖錢守恆");
  const bad = G.casStockOrder(s.w, h, "buy", ID, 1, "56.37", D, OPEN); assert.ok(!bad.ok, "買價不低於現價不給掛");
  h.stk.px[ID] = 55.12; h.stk.hist[D] = Object.assign({}, h.stk.hist[D], { [ID]: 55.12 });
  const m = G.casStockMatch(s.w, h, D, OPEN); assert.strictEqual(m.fills, 1, "價到了成交");
  assert.strictEqual(s.w.stk.own[ID], 10); assert.strictEqual(s.w.stk.hold, 0); assert.strictEqual(gap(G, s, op), 0);
});
T("看過了：價有小數也比得對（fresh）", G => {
  const s = fresh(G, 56.37); G.casStockSeen(s.w, s.house);
  const v = G.casStockViewAll(s.w, s.house, D, OPEN, []); assert.ok(v.list.filter(x => x.kind === "out").every(x => x.fresh === false));
  s.house.stk.px[ID] = 56.38; assert.strictEqual(G.casStockViewAll(s.w, s.house, D, OPEN, []).list.find(x => x.id === ID).fresh, true);
});
T("槓桿：小數進場價、部位進位、保證金進位、強平價是小數、損益四捨五入；做多做空守恆", G => {
  for (const side of ["long", "short"]) {
    const s = fresh(G, 56.37), op = G.casBookOpening(snap(G, s)), src = fakeSrc({ px: { [ID]: 56.37 }, idx: 5 });
    G.US_IDS.push(ID);
    const r = G.casLevOpen(s.w, s.house, { id: ID, side, lev: 5, qty: 123 }, D, OPEN, src);
    assert.ok(r.ok, r.reason); const p = r.pos;
    assert.strictEqual(p.entry, 56.37); assert.strictEqual(p.notional, Math.ceil(5637 * 123 / 100)); assert.strictEqual(p.margin, Math.ceil(p.notional / 5));
    const lq = G.casLevLiqPx(p); assert.ok(Math.abs(lq * 100 - Math.round(lq * 100)) < 1e-6, "強平價是小數兩位"); assert.ok(G.casLevHit(p, lq)); assert.ok(!G.casLevHit(p, side === "long" ? lq + 0.01 : lq - 0.01), "再靠近一分就不碰到");
    assert.ok(Number.isInteger(s.w.chips) && Number.isInteger(s.w.lev.hold)); assert.strictEqual(gap(G, s, op), 0, "開倉守恆");
    const px2 = 58.04, c = G.casLevClose(s.w, s.house, p.no, D, OPEN, fakeSrc({ px: { [ID]: px2 }, idx: 6 }));
    assert.ok(c.ok, c.reason); const want = Math.round((side === "long" ? 5804 - 5637 : 5637 - 5804) * 123 / 100);
    assert.strictEqual(c.pnl, want); assert.ok(Number.isInteger(c.back) && Number.isInteger(c.fee)); assert.strictEqual(gap(G, s, op), 0, "平倉守恆");
  }
});
T("槓桿：停損、停利可以填小數；casLevSizeOf 用分算整股", G => {
  const z = G.casLevSizeOf(100000, 5, 56.37); assert.strictEqual(z.qty, Math.floor(100000 * 5 * 100 / 5637)); assert.strictEqual(z.notional, Math.ceil(5637 * z.qty / 100));
  const s = fresh(G, 56.37), op = G.casBookOpening(snap(G, s)); G.US_IDS.push(ID);
  const r = G.casLevOpen(s.w, s.house, { id: ID, side: "long", lev: 2, qty: 1000, stop: "54.55", take: 60.25 }, D, OPEN, fakeSrc({ px: { [ID]: 56.37 }, idx: 5 }));
  assert.ok(r.ok, r.reason); assert.strictEqual(r.pos.stop, 54.55); assert.strictEqual(r.pos.take, 60.25);
  const bad = G.casLevOpen(s.w, s.house, { id: ID, side: "long", lev: 2, qty: 10, stop: 56.37 }, D, OPEN + 1, fakeSrc({ px: { [ID]: 56.37 }, idx: 5 })); assert.ok(!bad.ok, "停損要低於現價");
  const sw = G.casLevSweep(s.w, s.house, D, OPEN + 60000, fakeSrc({ px: { [ID]: 54.5 }, idx: 9, ser: { [ID]: [56.37, 56.37, 56.37, 56.37, 56.37, 56.37, 56, 55.5, 55, 54.5] } }));
  assert.ok(sw.length === 1 && sw[0].why === "stop" && sw[0].px === 54.5, "跌破停損價平倉（第壹個碰到的價）：" + JSON.stringify(sw.map(x => [x.why, x.px])));
  assert.strictEqual(gap(G, s, op), 0);
});
T("舊存檔：整數價照常讀；壞價被清成合法的；掛單價取兩位", G => {
  const s = fresh(G); s.house.stk.px[ID] = "abc"; const H = G.casStockHouseFix(s.house); assert.ok(H.px[ID] > 0);
  const w = s.w; w.stk = { own: { [ID]: 5 }, cost: { [ID]: 1000 }, orders: [{ no: 1, kind: "sell", id: ID, n: 1, px: 77.456, day: D, exp: D, hold: 0 }] };
  G.casStockFix(w); assert.strictEqual(w.stk.orders[0].px, 77.46);
});
console.log(`stock_decimal.test：${pass} 過，${fail} 沒過`); process.exit(fail ? 1 : 0);
