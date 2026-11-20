// 政府帳併入公共機構（決定 0140）：node test/casino/gov_sweep.test.cjs（npm test 也會跑）
// 每天換日 house.gov 整筆搬進公共機構（g-public）的帳：gov 少 n、world 多 n、公共機構多 n、其他單位不動；
// 政府撥 30 億給文化部（贈款不記債）只搬帳上分類，壹次。
const assert = require("assert");
const { load } = require("../load_shared.cjs");
const G = load({ __realMoney: true });
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const mk = () => { const h = G.casHouseFix(G.casHouseNew(), "2026-11-20").house; return h; };
T("換日：政府帳整筆搬進公共機構，其他單位不動、守恆", () => {
  const h = mk(); G.NUM.casino.govSweep.cultureGrant = 0;
  const a0 = G.wuAmounts(h), w0 = h.world; h.gov = 123456;
  G.casHouseFix(h, "2026-11-21");
  const a1 = G.wuAmounts(h), n = h.led.world.govSweep;
  assert.strictEqual(n, 123456); assert.strictEqual(h.gov, 0);
  assert.strictEqual(h.led.flow.govSweep, -n);
  const dPub = a1["g-public"] - a0["g-public"], others = Object.keys(a1).filter(k => k !== "g-public" && k !== "pub").map(k => Math.abs(a1[k] - a0[k]));
  assert.ok(dPub >= n, `公共機構多 ${dPub}`);
  assert.ok(Math.max(...others) < n + 1e7 * 20, "別的單位只有正常成長");
  assert.strictEqual(Object.values(a1).reduce((x, y) => x + y, 0), h.world);
});
T("同壹天不搬兩次；關掉就不搬", () => {
  const h = mk(); h.gov = 500; G.casHouseFix(h, "2026-11-21"); h.gov = 700; G.casHouseFix(h, "2026-11-21"); assert.strictEqual(h.gov, 700);
  const h2 = mk(); G.NUM.casino.govSweep.on = false; h2.gov = 500; G.casHouseFix(h2, "2026-11-21"); assert.strictEqual(h2.gov, 500); G.NUM.casino.govSweep.on = true;
});
T("政府撥款 30 億給文化部：壹次、贈款、世界不動", () => {
  const h = mk(); G.NUM.casino.govSweep.cultureGrant = 3000000000; const a0 = G.wuAmounts(h), debt0 = JSON.stringify(h.debt);
  const n = G.govGrant(h); assert.strictEqual(n, 3000000000);
  const a1 = G.wuAmounts(h); assert.strictEqual(a1["u-culture"] - a0["u-culture"], n); assert.strictEqual(a0["g-public"] - a1["g-public"], n);
  assert.strictEqual(JSON.stringify(h.debt), debt0); assert.strictEqual(G.govGrant(h), 0);
});
console.log(fail ? `gov_sweep：${fail} 項沒過` : `gov_sweep：${pass} 項都過`); process.exit(fail ? 1 : 0);
