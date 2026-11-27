// 零碎股：照金額買賣（決定 0160）：node test/stock/casino_stock_frac.test.cjs（npm test 也會跑）
// 買：給金額（含手續費）買到萬分之壹股；賣：給金額或全賣（含零碎）；整數股的規則照舊；帳對得上；換比例時零碎股換成籌碼。
const assert = require("assert");
const { load } = require("../load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.US_IDS.length = 0; /* 用沒有盤中的股票測買賣機制（跟 casino_stock_tax.test 壹樣） */ G.NUM.casino.grants = []; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const D = "2026-11-14", ID = "greeneye";
const fresh = G => { const w = G.casWalletFix(G.casWalletNew(), D), house = G.casHouseFix(G.casHouseNew(), D).house; w.chips = 500000000; G.casStockHouseFix(house); return { w, house }; };
const snap = (G, s) => G.casBookSnap([s.w], s.house, 0, null);
const setPx = (s, px) => { s.house.stk.px[ID] = px; };

T("照金額買：花的錢（含手續費）不超過給的金額，買到整數股加零碎股；成本、市值、帳對得上", G => {
  const s = fresh(G); setPx(s, 19234.56); const op = G.casBookOpening(snap(G, s)), c0 = s.w.chips;
  const r = G.casStockBuyAmt(s.w, s.house, ID, 100000, D, null); assert.ok(r.ok, r.reason);
  const spent = c0 - s.w.chips; assert.ok(spent <= 100000 && spent > 99990, "花了 " + spent);
  assert.strictEqual(s.w.stk.own[ID], 5); assert.ok(s.w.stk.frac[ID] > 0 && s.w.stk.frac[ID] < 10000, "零碎 " + s.w.stk.frac[ID]);
  assert.strictEqual(s.w.stk.cost[ID], spent, "總成本 ＝ 花的錢");
  const v = G.casStockView(s.w, s.house, D, null, []).list.find(x => x.id === ID);
  assert.strictEqual(v.mine, 5); assert.ok(v.frac > 0 && v.frac < 1); assert.ok(Math.abs(v.value - 19234.56 * (5 + v.frac)) < 2, "市值含零碎 " + v.value);
  assert.ok(/5\.\d+ 股/.test(r.lines[0]), r.lines[0]);
  assert.strictEqual(G.casBookGap(snap(G, s), op), 0);
});
T("零碎股累積到壹股就併進整數股；太小的金額買不到", G => {
  const s = fresh(G); setPx(s, 10000);
  for (let i = 0; i < 3; i++) assert.ok(G.casStockBuyAmt(s.w, s.house, ID, 5000, D, null).ok);
  assert.strictEqual(s.w.stk.own[ID], 1, "三次 0.5 股左右 → 1 股多");
  assert.ok(s.w.stk.frac[ID] > 0);
  const tiny = G.casStockBuyAmt(s.w, s.house, ID, 1, D, null); assert.ok(!tiny.ok, "1 籌碼買不到（萬分之壹股要 1 籌碼加手續費）");
  assert.ok(!G.casStockBuyAmt(s.w, s.house, ID, s.w.chips + 1, D, null).ok, "超過手上的籌碼");
});
T("照金額賣、全賣連零碎壹起賣；賣完成本清掉、帳對得上", G => {
  const s = fresh(G); setPx(s, 10000); const op = G.casBookOpening(snap(G, s));
  assert.ok(G.casStockBuyAmt(s.w, s.house, ID, 25000, D, null).ok);
  const units = s.w.stk.own[ID] * 10000 + s.w.stk.frac[ID];
  const r = G.casStockSellAmt(s.w, s.house, ID, 3000, D, null); assert.ok(r.ok, r.reason); assert.strictEqual(r.gross, 3000);
  assert.strictEqual(s.w.stk.own[ID] * 10000 + (s.w.stk.frac[ID] || 0), units - 3000);
  assert.ok(!G.casStockSellAmt(s.w, s.house, ID, 999999, D, null).ok, "賣超過持有的");
  const all = G.casStockSell(s.w, s.house, ID, "max", D, null); assert.ok(all.ok, all.reason);
  assert.ok(!s.w.stk.own[ID] && !s.w.stk.frac[ID] && !s.w.stk.cost[ID], "全賣：整數、零碎、成本都清掉");
  assert.strictEqual(s.house.stk.held[ID], 0, "莊家記的持股也歸零");
  assert.strictEqual(G.casBookGap(snap(G, s), op), 0);
});
T("整數股照舊：有零碎時賣幾股，成本照單位比例扣、零碎還在", G => {
  const s = fresh(G); setPx(s, 10000);
  assert.ok(G.casStockBuyAmt(s.w, s.house, ID, 25000, D, null).ok);
  const f = s.w.stk.frac[ID], c = s.w.stk.cost[ID], units = 20000 + f;
  const r = G.casStockSell(s.w, s.house, ID, 2, D, null); assert.ok(r.ok, r.reason);
  assert.ok(!s.w.stk.own[ID]); assert.strictEqual(s.w.stk.frac[ID], f, "零碎還在");
  assert.strictEqual(s.w.stk.cost[ID], c - Math.floor(c * 20000 / units), "成本照單位比例扣");
});
T("存檔修復：壞的零碎值丟掉；有零碎沒整數股的成本留著", G => {
  const s = fresh(G); G.casStockFix(s.w); s.w.stk.frac = { [ID]: 4321, nope: 5, bad: 20000 }; s.w.stk.cost = { [ID]: 999 };
  G.casStockFix(s.w);
  assert.deepStrictEqual(Object.keys(s.w.stk.frac), [ID]); assert.strictEqual(s.w.stk.cost[ID], 999);
});
T("館內股不能照金額買（只有館外股）", G => {
  const s = fresh(G); const id = G.IN_IDS[0];
  assert.ok(!G.casStockBuyAmt(s.w, s.house, id, 10000, D, null).ok);
});

console.log(`${pass} passed, ${fail} failed（零碎股）`);
process.exit(fail ? 1 : 0);
