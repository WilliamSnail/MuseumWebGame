// 館外股票資本利得稅 5%、持股明細欄位（11-14，規劃 2.8f 補）：node test/casino_stock_tax.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.US_IDS.length = 0; /* 用沒有盤中的股票（跟 casino_stock_order.test 一樣）測買賣機制 */ G.NUM.casino.grants = []; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const D = "2026-11-14", ID = "greeneye";
const fresh = G => { const w = G.casWalletFix(G.casWalletNew(), D), house = G.casHouseFix(G.casHouseNew(), D).house; w.chips = 500000000; G.casStockHouseFix(house); return { w, house }; };
const snap = (G, s) => G.casBookSnap([s.w], s.house, 0, null);
const setPx = (s, px) => { s.house.stk.px[ID] = px; };

T("賺錢的賣出抽 5%：稅 ＝ (拿到的錢 − 賣出手續費 − 成本) × 5%，進預算池，訊息有稅；帳對得上", G => {
  const s = fresh(G); setPx(s, 10000); const op = G.casBookOpening(snap(G, s));
  const b = G.casStockBuy(s.w, s.house, ID, 100, D, null); assert.ok(b.ok);
  assert.strictEqual(s.w.stk.cost[ID], 1000000 + 5000, "總成本含買進手續費");
  setPx(s, 12000); const b0 = s.house.budget, c0 = s.w.chips;
  const r = G.casStockSell(s.w, s.house, ID, 100, D, null); assert.ok(r.ok, r.reason);
  const gross = 1200000, fee = 6000, profit = gross - fee - 1005000, tax = Math.floor(profit * 0.05);
  assert.strictEqual(r.tax, tax); assert.strictEqual(r.net, gross - fee - tax); assert.strictEqual(s.w.chips, c0 + gross - fee - tax);
  assert.strictEqual(s.house.budget, b0 + fee + tax); assert.strictEqual(s.house.act.stockTax, tax);
  assert.ok(r.lines[0].includes("資本利得稅 " + G.casNum(tax)), r.lines[0]);
  assert.ok(!s.w.stk.cost[ID], "賣光就沒有成本記錄");
  assert.strictEqual(G.casBookGap(snap(G, s), op), 0);
});
T("賠錢不抽稅也不退；剛好打平不抽", G => {
  const s = fresh(G); setPx(s, 10000); G.casStockBuy(s.w, s.house, ID, 100, D, null);
  setPx(s, 9000); let r = G.casStockSell(s.w, s.house, ID, 100, D, null); assert.ok(r.ok); assert.strictEqual(r.tax, 0); assert.ok(r.lines[0].includes("資本利得稅 0"));
  const s2 = fresh(G); setPx(s2, 10000); G.casStockBuy(s2.w, s2.house, ID, 100, D, null); setPx(s2, 10050);
  r = G.casStockSell(s2.w, s2.house, ID, 100, D, null); assert.strictEqual(r.tax, 0, "賺的剛好被兩邊手續費吃掉，不抽");
});
T("分批賣用平均成本：兩次買不同價，賣一半只扣一半的總成本", G => {
  const s = fresh(G); setPx(s, 10000); G.casStockBuy(s.w, s.house, ID, 100, D, null); setPx(s, 20000); G.casStockBuy(s.w, s.house, ID, 100, D, null);
  const total = 1005000 + 2010000; assert.strictEqual(s.w.stk.cost[ID], total);
  setPx(s, 20000); const r = G.casStockSell(s.w, s.house, ID, 50, D, null); assert.ok(r.ok);
  const costOut = Math.floor(total * 50 / 200), profit = 1000000 - 5000 - costOut;
  assert.strictEqual(r.tax, Math.floor(profit * 0.05)); assert.strictEqual(s.w.stk.cost[ID], total - costOut);
  const r2 = G.casStockSell(s.w, s.house, ID, 150, D, null); assert.ok(r2.ok); assert.ok(!s.w.stk.cost[ID]);
  assert.strictEqual(s.w.stk.gain, (1000000 - 5000 - costOut) + (3000000 - 15000 - (total - costOut)), "累計賣出賺賠（扣稅前）");
});
T("限價單、停損單的賣出成交也抽稅（走同一條路）", G => {
  const s = fresh(G); setPx(s, 10000); G.casStockBuy(s.w, s.house, ID, 100, D, null);
  const o = G.casStockOrder(s.w, s.house, "sell", ID, 100, 12000, D, null); assert.ok(o.ok, o.reason);
  setPx(s, 12500); G.casStockMatch(s.w, s.house, D, null);
  assert.ok(!s.w.stk.own[ID]); assert.ok(s.house.act.stockTax > 0);
  assert.ok(s.w.stk.notes[s.w.stk.notes.length - 1].includes("資本利得稅"), s.w.stk.notes.join("|"));
});
T("舊持股沒有成本記錄：第壹次碰到（casStockPegSync）時成本 ＝ 當時的價 × 股數，之前的漲幅不抽", G => {
  const s = fresh(G); setPx(s, 10000); G.casStockFix(s.w); s.w.stk.own[ID] = 100;
  assert.strictEqual(s.w.stk.cost[ID], undefined);
  G.casStockPegSync(s.w, s.house); assert.strictEqual(s.w.stk.cost[ID], 1000000);
  setPx(s, 11000); const r = G.casStockSell(s.w, s.house, ID, 100, D, null);
  assert.strictEqual(r.tax, Math.floor((1100000 - 5500 - 1000000) * 0.05));
});
T("換股數（2.8h）：股數照比例換、總成本不變、單位成本跟著換", G => {
  const s = fresh(G); setPx(s, 10000); G.casStockBuy(s.w, s.house, ID, 100, D, null);
  const H = G.casStockHouseFix(s.house), cost0 = s.w.stk.cost[ID];
  H.peg.seq = 1; H.peg.ev.push({ seq: 1, id: ID, from: 10000, to: 5000 }); H.px[ID] = 5000;
  G.casStockPegSync(s.w, s.house);
  assert.strictEqual(s.w.stk.own[ID], 200); assert.strictEqual(s.w.stk.cost[ID], cost0);
  const v = G.casStockView(s.w, s.house, D, null), x = v.list.find(i => i.id === ID);
  assert.strictEqual(x.avgCost, cost0 / 200);
});
T("持股明細欄位：館外、館內壹樣的名字；數字對得上", G => {
  const s = fresh(G); setPx(s, 10000); G.casStockBuy(s.w, s.house, ID, 100, D, null); s.house.stk.prev[ID] = 9000; setPx(s, 11000);
  const v = G.casStockViewAll(s.w, s.house, D, null), x = v.list.find(i => i.id === ID);
  assert.strictEqual(x.mine, 100); assert.strictEqual(x.value, 1100000); assert.strictEqual(x.costTotal, 1005000); assert.strictEqual(x.avgCost, 10050);
  assert.strictEqual(x.dayChg, 100 * 2000); assert.ok(Math.abs(x.dayPct - 2000 / 9000) < 1e-9);
  assert.strictEqual(x.pnl, 95000); assert.ok(Math.abs(x.pnlPct - 95000 / 1005000) < 1e-9); assert.strictEqual(x.tax, 0.05); assert.strictEqual(v.taxPct, 0.05);
  const keys = ["mine", "value", "avgCost", "costTotal", "dayChg", "dayPct", "pnl", "pnlPct", "tax"], y = v.list.find(i => i.market === "in");
  for (const k of keys) assert.ok(k in y && k in x, "兩邊都要有 " + k);
  assert.strictEqual(y.mine, 0); assert.strictEqual(y.costTotal, 0); assert.strictEqual(y.tax, 0);
});
T("館內股也記成本（買、分批賣、顯示），但不抽稅", G => {
  G.casInSecret("s");
  const s = fresh(G); G.casInRoll(s.house, D, 0, "s"); const t = Date.UTC(2026, 10, 14, 6 - 8, 0);
  const b = G.casInBuy(s.w, s.house, "food", 100, D, t, "s"); assert.ok(b.ok, b.reason);
  assert.strictEqual(s.w.sin.cost.food, b.cost + b.fee);
  const op = G.casBookOpening(snap(G, s));
  const r = G.casInSell(s.w, s.house, "food", 40, D, t, "s", b.px * 2); assert.ok(r.ok, r.reason);
  assert.strictEqual(r.net, r.gross - r.fee, "館內股不抽稅"); assert.ok(!s.house.act || !s.house.act.stockTax);
  assert.strictEqual(s.w.sin.cost.food, (b.cost + b.fee) - Math.floor((b.cost + b.fee) * 40 / 100));
  const v = G.casInView(s.w, s.house, D, t, "s"), x = v.list.find(i => i.id === "food");
  assert.strictEqual(x.mine, 60); assert.strictEqual(x.costTotal, s.w.sin.cost.food);
});
console.log(`casino_stock_tax.test：${pass} 過，${fail} 沒過`);
if (fail) process.exit(1);
