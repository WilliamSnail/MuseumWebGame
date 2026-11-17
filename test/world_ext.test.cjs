// 決定 0121：館外股（台股、美股）是對外投資，錢記在「海外（真實市場）」，不進本地集團。node test/world_ext.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); G.NUM.casino.grants = []; G.NUM.casino.world.expand = 0; G.NUM.casino.world.growYoy = false; G.NUM.casino.houseLoan.fix.on = false; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
const mk = G => G.casHouseFix(G.casHouseNew(), "2026-11-16").house;
T("買股：池子變多，但錢只記在海外；本地集團、家計、公共、錢包都沒變；總和等於池子", G => {
  const h = mk(G), a0 = G.wuAmounts(h), w = { chips: 5000000 }; G.casWorldIn(w, h, "stockBuy", 1000000); const a1 = G.wuAmounts(h);
  assert.strictEqual(a1["u-ext"] - a0["u-ext"], 1000000); for (const k of Object.keys(a0)) if (k !== "u-ext") assert.strictEqual(a1[k], a0[k], k); assert.strictEqual(sum(a1), h.world);
});
T("賣股、股利：從海外付，可以是負的（館友賺真實市場的錢）；本地不變；總和仍等於池子", G => {
  const h = mk(G), w = { chips: 5000000 }; G.casWorldIn(w, h, "stockBuy", 1000000); const a0 = G.wuAmounts(h);
  const got = G.casWorldOut(w, h, "stockSell", 1500000, G.NUM.casino.world); const a1 = G.wuAmounts(h); assert.strictEqual(got, 1500000); assert.strictEqual(a1["u-ext"], -500000 + (a0["u-ext"] - 1000000));
  for (const k of Object.keys(a0)) if (k !== "u-ext") assert.strictEqual(a1[k], a0[k], k); assert.strictEqual(sum(a1), h.world);
  G.casWorldOut(w, h, "dividend", 1000, G.NUM.casino.world); assert.strictEqual(G.wuAmounts(h)["u-ext"], a1["u-ext"] - 1000);
});
T("不是股票的錢（NPC 花錢、門票）照舊照比例，不碰海外", G => {
  const h = mk(G), a0 = G.wuAmounts(h), w = { chips: 5000000 }; G.casWorldIn(w, h, "ticket", 100000); const a1 = G.wuAmounts(h); assert.strictEqual(a1["u-ext"], a0["u-ext"]); assert.strictEqual(sum(a1), h.world);
});
T("一次性搬家：以前累計進本地池子的股票錢（led.world 的股票來源淨額）搬到海外；只搬壹次；總和不變", G => {
  const h = mk(G); h.led = { world: { stockBuy: 3000000, stockSell: -1000000, dividend: -50000, npcFood: -777 } }; const w0 = h.world, a0 = G.wuAmounts(h); delete h.extFix; G.casHouseFix(h, "2026-11-16");
  const a1 = G.wuAmounts(h); assert.strictEqual(a1["u-ext"] - a0["u-ext"], 1950000, "只搬股票來源的淨額"); assert.strictEqual(h.world, w0); assert.strictEqual(sum(a1), h.world);
  G.casHouseFix(h, "2026-11-16"); assert.strictEqual(G.wuAmounts(h)["u-ext"], a1["u-ext"], "不會搬第二次");
});
T("金流頁籤：股票的線接到海外（w:u-ext），不再接到本地集團；海外有節點和名字", G => {
  const h = mk(G); const nodes = G.casFlowWorldNodes(h); const e = nodes.find(n => n.id === "w:u-ext"); assert.ok(e && e.name === "海外（真實市場）"); assert.deepStrictEqual(JSON.parse(JSON.stringify(G.CAS_FLOW_LINE.stockBuy)), ["w:u-ext", "players"]);
});
console.log(`${pass} passed, ${fail} failed（海外帳）`);
process.exit(fail ? 1 : 0);
