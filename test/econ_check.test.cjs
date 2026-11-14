// 經濟自我檢查腳本（tools/econ_check.cjs）：目前的 NUM 要全過；帳面摘要標得出異常。node test/econ_check.test.cjs（npm test 也會跑）
const assert = require("assert"), { spawnSync } = require("child_process"), fs = require("fs"), os = require("os"), path = require("path");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const run = args => spawnSync(process.execPath, [path.join(__dirname, "..", "tools", "econ_check.cjs")].concat(args), { encoding: "utf8" });
T("規則面：現在的 NUM 沒有「沒過」的項目（警告可以有）", () => { const r = run([]); assert.strictEqual(r.status, 0, r.stdout.slice(-1500)); assert.ok(/\d+ 項：\d+ 過、\d+ 警告、0 沒過/.test(r.stdout)); });
T("帳面：正常的帳沒有異常；吃緊、館債逾期、對帳差、莊家破產都會紅字", () => {
  const f = path.join(os.tmpdir(), "econ_" + process.pid + ".json"), W = 10000000000;
  const ok = { bankroll: 2e9, budget: 1e9, museum: 0, sea: 0, world: W, day: "2026-11-20", debt: { budget: 0, culture: 9e8, world: 0 }, led: { world: { stockBuy: 1000 } } };
  fs.writeFileSync(f, JSON.stringify(ok)); let r = run(["--ledger", f]); assert.strictEqual(r.status, 0, r.stdout); assert.ok(r.stdout.includes("沒有異常"));
  for (const [patch, re] of [[{ world: 100 }, /資金吃緊/], [{ cultureLate: 5 }, /逾期/], [{ bankroll: -1 }, /破產/], [{ bankroll: 1e6, budget: 1e6 }, /不夠還文化部館債/]]) {
    fs.writeFileSync(f, JSON.stringify(Object.assign({}, ok, patch))); r = run(["--ledger", f]); assert.strictEqual(r.status, 1); assert.ok(re.test(r.stdout), r.stdout);
  }
  fs.writeFileSync(f, JSON.stringify({ day: "2026-11-20", gap: 7, snap: { house: { bankroll: 1, budget: 1, museum: 0, sea: 0, world: W, debt: { budget: 0, culture: 0, world: 0 } } } })); r = run(["--ledger", f]); assert.ok(/對帳差不是 0/.test(r.stdout), r.stdout);
  fs.unlinkSync(f);
});
T("帳面：吃 econ-status 的輸出（ECON_HOUSE_JSON／ECON_REPORT_JSON 兩行），對帳差也看", () => {
  const f = path.join(os.tmpdir(), "econ2_" + process.pid + ".txt"), NL = "\n", h = { bankroll: 2e9, budget: 1e9, museum: 0, sea: 0, world: 10000000000, day: "2026-11-20", debt: { budget: 0, culture: 9e8, world: 0 }, led: { world: {} } };
  const mk = gap => ["雜訊", "ECON_HOUSE_JSON " + JSON.stringify(h), "ECON_REPORT_JSON " + JSON.stringify({ day: "2026-11-20", gap, house: h }), ""].join(NL);
  fs.writeFileSync(f, mk(0)); let r = run(["--ledger", f]); assert.strictEqual(r.status, 0, r.stdout); assert.ok(r.stdout.includes("對帳差 0"));
  fs.writeFileSync(f, mk(12)); r = run(["--ledger", f]); assert.strictEqual(r.status, 1); assert.ok(/對帳差不是 0/.test(r.stdout)); fs.unlinkSync(f);
});
console.log(`${pass} passed, ${fail} failed（經濟自我檢查）`);
process.exit(fail ? 1 : 0);
