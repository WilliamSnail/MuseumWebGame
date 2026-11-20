// 決定 0126：海外（真實市場）是跟已知世界並列的帳 house.ext（取代決定 0121 的 u-ext 單位）。node test/world/world_ext.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("../load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); G.NUM.casino.grants = []; G.NUM.casino.world.expand = 0; G.NUM.casino.world.growYoy = false; G.NUM.casino.houseLoan.fix.on = false; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
const mk = G => G.casHouseFix(G.casHouseNew(), "2026-11-16").house;
const tot = (G, h, w) => G.casBookTotal(G.casBookSnap([w], h, 0, h.day));
T("買股：錢進 house.ext，已知世界（house.world）、各集團、公共都沒變；流水記在 led.ext；錢守恆", G => {
  const h = mk(G), a0 = G.wuAmounts(h), world0 = h.world, w = G.casWalletFix(G.casWalletNew(), "2026-11-16"); w.chips = 5000000; const t0 = tot(G, h, w);
  G.casWorldIn(w, h, "stockBuy", 1000000); const a1 = G.wuAmounts(h);
  assert.strictEqual(h.ext, 1000000); assert.strictEqual(h.world, world0); assert.deepStrictEqual(a1, a0); assert.strictEqual(h.led.ext.stockBuy, 1000000); assert.ok(!(h.led.world && h.led.world.stockBuy)); assert.strictEqual(tot(G, h, w), t0); assert.strictEqual(sum(a1), h.world); assert.ok(!("u-ext" in a1));
});
T("賣股、股利、槓桿賺：從海外付，可以一直負下去（不受已知世界的池子和吃緊上限）；錢守恆", G => {
  const h = mk(G), w = G.casWalletFix(G.casWalletNew(), "2026-11-16"); w.chips = 5000000; G.casWorldIn(w, h, "stockBuy", 1000000); const world0 = h.world, t0 = tot(G, h, w);
  assert.strictEqual(G.casWorldOut(w, h, "stockSell", 1500000, G.NUM.casino.world), 1500000); assert.strictEqual(h.ext, -500000); assert.strictEqual(G.casWorldOut(w, h, "dividend", 1000, G.NUM.casino.world), 1000); assert.strictEqual(h.ext, -501000);
  h.world = 10; assert.strictEqual(G.casWorldOut(w, h, "stockLevWin", 77777777, G.NUM.casino.world), 77777777, "已知世界吃緊、只剩 10，海外照付"); assert.strictEqual(h.world, 10);
});
T("館方投資（博物館資金、莊家買賣館外股）也記海外：flow 照舊、錢守恆；賣出不受池子上限", G => {
  const h = mk(G), w = G.casWalletFix(G.casWalletNew(), "2026-11-16"); h.bankroll = 5e9; h.budget = 5e9; const world0 = h.world, t0 = tot(G, h, w);
  G.casHouseWorldIn(h, "houseInvestBuy", 1e9); G.casPoolWorldIn(h, "budget", "budgetInvestBuy", 2e9); assert.strictEqual(h.ext, 3e9); assert.strictEqual(h.world, world0); assert.strictEqual(h.led.flow.houseInvestBuy, -1e9); assert.strictEqual(h.led.flow.budgetInvestBuy, -2e9);
  G.casHouseWorldOut(h, "houseInvestSell", 4e9, G.NUM.casino.world); G.casPoolWorldOut(h, "budget", "budgetInvestSell", 1e9); assert.strictEqual(h.ext, -2e9); assert.strictEqual(h.bankroll, 5e9 - 1e9 + 4e9); assert.strictEqual(h.world, world0); assert.strictEqual(tot(G, h, w), t0);
});
T("不是股票的錢（NPC 花錢、門票）照舊進出已知世界、不碰海外", G => {
  const h = mk(G), w = { chips: 5000000 }; G.casWorldIn(w, h, "ticket", 100000); assert.strictEqual(h.ext, 0); assert.strictEqual(h.led.world.ticket, 100000);
});
T("一次性搬出：舊的 u-ext 累計搬到 house.ext；各集團、家計、NPC 錢包、公共的帳完全不變；已知世界少 E；只搬壹次；總和不變", G => {
  const h = mk(G), w = G.casWalletFix(G.casWalletNew(), "2026-11-16"); delete h.extSplit; h.ext = 0; h.extFix = true;
  const x = G.wuFix(h); x.r["u-ext"] = 0; x.adj["u-ext"] = 757000123; h.world += 757000123; h.led.world = { stockBuy: 800000000, stockSell: -42999877 }; // 舊格式：海外是 wu 的壹個單位、算在 world 裡
  const before = G.wuAmounts(h), world0 = h.world, t0 = tot(G, h, w);
  G.casHouseFix(h, "2026-11-16");
  const a1 = G.wuAmounts(h); assert.ok(!("u-ext" in a1)); for (const k of Object.keys(a1)) assert.strictEqual(a1[k], before[k], k); assert.strictEqual(h.ext, 757000123); assert.strictEqual(h.world, world0 - 757000123); assert.strictEqual(sum(a1), h.world); assert.strictEqual(tot(G, h, w), t0);
  assert.strictEqual(h.led.world.extSplit, -757000123); assert.strictEqual(h.led.ext.extSplit, 757000123); assert.strictEqual(h.led.world.stockBuy, 800000000, "舊流水不動");
  G.casHouseFix(h, "2026-11-16"); assert.strictEqual(h.ext, 757000123, "不會搬第二次"); assert.strictEqual(h.world, world0 - 757000123);
});
T("快照和對帳：casBookTotal 含海外；casBookDiff 有 ext 和 xflow；變化 ＝ 流水加起來", G => {
  const h = mk(G), w = G.casWalletFix(G.casWalletNew(), "2026-11-16"); w.chips = 5e6; const s0 = G.casBookSnap([w], h, 0, "2026-11-16");
  G.casWorldIn(w, h, "stockBuy", 1e6); G.casWorldOut(w, h, "stockSell", 4e5, G.NUM.casino.world); const s1 = G.casBookSnap([w], h, 0, "2026-11-17"), d = G.casBookDiff(s0, s1);
  assert.strictEqual(d.ext, 6e5); assert.deepStrictEqual(JSON.parse(JSON.stringify(d.xflow)), { stockBuy: 1e6, stockSell: -4e5 }); assert.strictEqual(G.casBookTotal(s1), G.casBookTotal(s0));
});
T("金流頁籤：股票的線接到 ext 節點（跟 world 並列），不再有 w:u-ext；館方投資接 ext", G => {
  const h = mk(G), nodes = G.casFlowWorldNodes(h); assert.ok(!nodes.find(n => n.id === "w:u-ext")); assert.ok(G.CAS_FLOW_NODES.find(n => n.id === "ext" && n.tier === 1 && /海外/.test(n.name)));
  for (const k of ["stockBuy", "stockSell", "stockRebase", "stockLevWin", "stockLevLoss", "dividend"]) assert.deepStrictEqual(JSON.parse(JSON.stringify(G.CAS_FLOW_LINE[k])), ["ext", "players"], k);
  for (const k of ["houseInvestBuy", "houseInvestSell", "houseInvFix"]) assert.deepStrictEqual(JSON.parse(JSON.stringify(G.CAS_FLOW_LINE[k])), ["ext", "house"], k);
  for (const k of ["budgetInvestBuy", "budgetInvestSell", "budgetInvFix"]) assert.deepStrictEqual(JSON.parse(JSON.stringify(G.CAS_FLOW_LINE[k])), ["ext", "budget"], k);
});
console.log(`${pass} passed, ${fail} failed（海外帳）`);
process.exit(fail ? 1 : 0);
