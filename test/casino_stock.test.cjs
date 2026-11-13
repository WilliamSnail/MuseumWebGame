// 股票（11-14，館外七支）：node test/casino_stock.test.cjs（npm test 也會跑）
// 買賣守恆、手續費進預算池、換日調價和 drag、停盤時段、各種上限、舊錢包壞資料。數字讀 NUM。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const J = x => JSON.stringify(x); // load() 的沙箱裡做出來的陣列原型不同，deepStrictEqual 過不了
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const D = "2026-11-14", ID = "greeneye";
// 台灣時間某天幾點的毫秒（台灣是 UTC+8）
const at = (d, h) => Date.parse(`${d}T${String(h).padStart(2, "0")}:30:00+08:00`);
const OPEN = at(D, 14); // 停盤以外的時間
const fresh = G => { const w = G.casWalletFix(G.casWalletNew(), D), house = G.casHouseFix(G.casHouseNew(), D).house; w.chips = 500000000; G.casStockHouseFix(house); return { w, house }; };
const gap = (G, s, opening) => G.casBookGap(G.casBookSnap([s.w], s.house, 0, null), opening);
const open0 = (G, s) => G.casBookOpening(G.casBookSnap([s.w], s.house, 0, null));
const total = (G, s) => G.casBookTotal(G.casBookSnap([s.w], s.house, 0, null));

T("停盤：台灣 22:00～05:00 不能買賣，白天可以", G => {
  const C = G.NUM.casino.stock;
  assert.strictEqual(C.haltFrom, 22); assert.strictEqual(C.haltTo, 5);
  assert.strictEqual(G.casStockHalt(at(D, 23)), true, "晚上 23 點停盤");
  assert.strictEqual(G.casStockHalt(at(D, 3)), true, "凌晨 3 點停盤");
  assert.strictEqual(G.casStockHalt(at(D, 14)), false, "下午不停盤");
  assert.strictEqual(G.casStockHalt(at(D, 5)), false, "05:30 開盤");
  assert.strictEqual(G.casStockHalt(null), false, "沒給時間就不擋（舊程式、測試）");
  const s = fresh(G);
  const r = G.casStockBuy(s.w, s.house, ID, 1, D, at(D, 23));
  assert.ok(!r.ok && r.reason.includes("停盤"));
});
T("買：股價流出館外（記成消失、來源 stockBuy），手續費進預算池；莊家不動；帳對得上", G => {
  const C = G.NUM.casino.stock, s = fresh(G), op = open0(G, s), c0 = s.w.chips, h0 = s.house.bankroll, b0 = s.house.budget;
  const px = s.house.stk.px[ID];
  const r = G.casStockBuy(s.w, s.house, ID, 10, D, OPEN);
  assert.ok(r.ok, r.reason);
  const cost = px * 10, fee = Math.ceil(cost * C.feePct / 100);
  assert.strictEqual(s.w.chips, c0 - cost - fee);
  assert.strictEqual(s.house.bankroll, h0, "莊家不出錢也不收錢（跟外面世界買）");
  assert.strictEqual(s.house.budget, b0 + fee);
  assert.strictEqual(s.w.led.burn.stockBuy, cost, "流出館外記成消失");
  assert.strictEqual(gap(G, s, op), 0, "帳對得上");
  assert.strictEqual(s.w.stk.own[ID], 10);
});
T("賣：從館外進來（記成憑空、來源 stockSell），手續費進預算池；莊家不動；帳對得上；賣光清掉欄位", G => {
  const C = G.NUM.casino.stock, s = fresh(G);
  G.casStockBuy(s.w, s.house, ID, 10, D, OPEN);
  const op = open0(G, s), c0 = s.w.chips, h0 = s.house.bankroll, px = s.house.stk.px[ID];
  const r = G.casStockSell(s.w, s.house, ID, "max", D, OPEN);
  assert.ok(r.ok, r.reason);
  const gross = px * 10, fee = Math.ceil(gross * C.feePct / 100);
  assert.strictEqual(s.w.chips, c0 + gross - fee);
  assert.strictEqual(s.house.bankroll, h0, "莊家不付錢");
  assert.strictEqual(s.w.led.mint.stockSell, gross, "從館外進來記成憑空");
  assert.strictEqual(gap(G, s, op), 0, "帳對得上");
  assert.strictEqual(s.w.stk.own[ID], undefined, "賣光就不留欄位");
  assert.ok(!G.casStockSell(s.w, s.house, ID, 1, D, OPEN).ok, "沒有了就不能賣");
});
T("買了馬上賣壹定虧（手續費兩次）", G => {
  const s = fresh(G), c0 = s.w.chips;
  G.casStockBuy(s.w, s.house, ID, 100, D, OPEN);
  G.casStockSell(s.w, s.house, ID, "max", D, OPEN);
  assert.ok(s.w.chips < c0, "來回壹趟要虧手續費");
});
T("換日調價：照真實漲跌，再扣 drag，夾在 ±outCap；同壹天只調壹次", G => {
  const C = G.NUM.casino.stock, s = fresh(G);
  const px0 = s.house.stk.px[ID];
  const r = G.casStockRoll(s.house, D, { [ID]: 0.02 });
  assert.ok(r.done);
  const m = 0.02 - C.drag / 100;
  assert.strictEqual(s.house.stk.px[ID], Math.round(px0 * (1 + m)));
  assert.strictEqual(s.house.stk.prev[ID], px0);
  assert.strictEqual(G.casStockRoll(s.house, D, { [ID]: 0.5 }).done, false, "同壹天不再調");
  const s2 = fresh(G); G.casStockRoll(s2.house, D, { [ID]: 5 });
  assert.strictEqual(s2.house.stk.px[ID], Math.round(10000 * (1 + C.outCap / 100)), "夾在上限");
  const s3 = fresh(G); G.casStockRoll(s3.house, D, { [ID]: -5 });
  assert.strictEqual(s3.house.stk.px[ID], Math.round(10000 * (1 - C.outCap / 100)), "跌也夾");
  const s4 = fresh(G); s4.house.stk.px[ID] = 1; G.casStockRoll(s4.house, D, { [ID]: -1 });
  assert.ok(s4.house.stk.px[ID] >= C.floor, "不會跌到 0");
});
T("什麼都不動的時候，每天會慢慢扣 drag（抱著不會穩賺）", G => {
  const C = G.NUM.casino.stock, s = fresh(G);
  let day = D, px = s.house.stk.px[ID];
  for (let i = 1; i <= 30; i++) { day = `2026-12-${String(i).padStart(2, "0")}`; G.casStockRoll(s.house, day, {}); }
  assert.ok(s.house.stk.px[ID] < px, `30 天後要比 ${px} 低，實際 ${s.house.stk.px[ID]}`);
});
T("上限：莊家窮也買得了（跟外面世界買）；壹人壹天賣出上限還在", G => {
  const s = fresh(G); s.house.bankroll = -100; // 莊家破產
  assert.ok(G.casStockBuy(s.w, s.house, ID, 1000, D, OPEN).ok, "莊家破產也照買（11-14：以前莊家壹窮股市就停擺）");
  const s3 = fresh(G);
  G.casStockBuy(s3.w, s3.house, ID, 5000, D, OPEN); // 5,000 萬
  const sold = G.casStockSell(s3.w, s3.house, ID, 2000, D, OPEN); // 2,000 萬，剛好上限
  assert.ok(sold.ok, sold.reason);
  const over = G.casStockSell(s3.w, s3.house, ID, 1, D, OPEN);
  assert.ok(!over.ok && over.reason.includes("2,000 萬"), "超過壹天賣出上限");
});
T("畫面要的：行情、漲跌、我的持股、停盤", G => {
  const s = fresh(G);
  G.casStockBuy(s.w, s.house, ID, 3, D, OPEN);
  G.casStockRoll(s.house, "2026-11-15", { [ID]: 0.05 });
  const v = G.casStockView(s.w, s.house, "2026-11-15", OPEN);
  assert.strictEqual(v.list.length, 7);
  const x = v.list.find(y => y.id === ID);
  assert.strictEqual(x.mine, 3); assert.ok(x.chg > 0); assert.strictEqual(x.value, x.price * 3);
  assert.strictEqual(v.total, x.value, "只有這支有持股");
  assert.strictEqual(v.halt, false);
  assert.strictEqual(G.casStockView(s.w, s.house, D, at(D, 23)).halt, true);
});
T("舊錢包、壞資料：補欄位，不丟錯", G => {
  const w = G.casWalletFix(G.casWalletNew(), D); delete w.stk;
  assert.strictEqual(J(G.casStockFix(w).own), J({}));
  w.stk = { own: { [ID]: "x", nope: 5, redclaw: 3 }, sold: 7, fee: "a", gain: "b" };
  const S = G.casStockFix(w);
  assert.strictEqual(S.own[ID], undefined, "壞數字丟掉");
  assert.strictEqual(S.own.nope, undefined, "不認得的股票丟掉");
  assert.strictEqual(S.own.redclaw, 3);
  assert.strictEqual(S.fee, 0); assert.strictEqual(S.gain, 0);
  const house = G.casHouseFix(G.casHouseNew(), D).house;
  house.stk = { px: { [ID]: "bad", nope: 1 }, held: null };
  const H = G.casStockHouseFix(house);
  assert.strictEqual(H.px[ID], G.NUM.casino.stock.start, "壞股價回到起始");
  assert.strictEqual(H.px.nope, undefined);
  assert.doesNotThrow(() => G.casStockRoll(house, "bad", {}));
  assert.doesNotThrow(() => G.casStockView(w, house, D, OPEN));
});
T("每支照自己的資料動，不會七支全部壹樣（11-14：股票清單讀到空的，全變 9,996）", G => {
  const C = G.NUM.casino.stock, s = fresh(G);
  // 真的資料長這樣：每支的漲跌都不同
  const daily = { days: { "2026-11-12": { greeneye: -4.34, redclaw: 5.86, nightindex: -0.39, islandforge: -2.3, silverapple: -0.21, flashcar: 1.69, squarewin: 0.36 } } };
  assert.strictEqual(G.outStockReady(daily, "2026-11-13"), true, "前壹天有資料就算到了");
  const moves = G.outStockMovesFor(daily, "2026-11-13", G.STOCK_IDS);
  assert.strictEqual(Object.keys(moves).length, G.STOCK_IDS.length, "每支都要有");
  assert.ok(new Set(Object.values(moves)).size > 1, "漲跌不能全部壹樣");
  G.casStockRoll(s.house, "2026-11-13", moves);
  const px = G.STOCK_IDS.map(id => s.house.stk.px[id]);
  assert.ok(new Set(px).size > 1, "股價不能全部壹樣：" + px.join(","));
  assert.ok(s.house.stk.px.greeneye < s.house.stk.px.redclaw, "跌的要比漲的低");
  // 清單給空的（以前的 bug）：全部只剩 drag，七支壹模壹樣
  const s2 = fresh(G);
  G.casStockRoll(s2.house, "2026-11-13", G.outStockMovesFor(daily, "2026-11-13", []));
  assert.strictEqual(new Set(G.STOCK_IDS.map(id => s2.house.stk.px[id])).size, 1, "空清單的話就會全部壹樣，這就是當時的災情");
  assert.strictEqual(s2.house.stk.px.greeneye, Math.round(C.start * (1 - C.drag / 100)), "9,996");
});
T("畫面：莊家的錢不影響能不能買（exposeLeft 是 null、houseBroke 是 false）", G => {
  const s1 = fresh(G); s1.house.bankroll = -5;
  const v = G.casStockView(s1.w, s1.house, D, OPEN);
  assert.strictEqual(v.exposeLeft, null); assert.strictEqual(v.houseBroke, false);
});
console.log(`casino_stock.test：${pass} 過，${fail} 沒過`);
if (fail) process.exit(1);
