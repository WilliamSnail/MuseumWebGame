// 莊家壹次性提前重開（決定 0141）：node test/house_early_reopen.test.cjs
const assert = require("assert");
const { load } = require("./load_shared.cjs");
const G = load({ __realMoney: true });
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
T("同壹天莊家為負：下次碰到就借到準備金、記債，只跑壹次，換日的其他步驟不跑", () => {
  const h = G.casHouseFix(G.casHouseNew(), "2026-11-20").house; h.rFix = false; h.cFix = true; h.wExp = true;
  const world0 = h.world, bud0 = h.budget; h.bankroll = -18756577;
  const r = G.casHouseFix(h, "2026-11-20");
  assert.ok(r.reopen && r.reopen.includes("借了"), "有重開文案：" + r.reopen);
  assert.strictEqual(h.bankroll, G.NUM.casino.houseLoan.reserve, "借到準備金");
  assert.ok(h.debt.budget + h.debt.world >= G.NUM.casino.houseLoan.reserve + 18756577 - 1, "記成債");
  assert.ok(h.rFix);
  h.bankroll = -5; const r2 = G.casHouseFix(h, "2026-11-20"); assert.strictEqual(h.bankroll, -5); assert.ok(!r2.reopen);
  assert.strictEqual(h.world + (h.debt.world ? 0 : 0) >= world0 - G.NUM.casino.houseLoan.reserve - 18756577, true);
});
console.log(fail ? `提前重開：${fail} 項沒過` : `提前重開：${pass} 項都過`); process.exit(fail ? 1 : 0);
