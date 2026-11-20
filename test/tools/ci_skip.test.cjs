// CI 不再跳過任何測試（11-16 CI 和部署加速：經濟自我檢查不慢了，「只改內容就跳過」拿掉，
// 這樣部署才分得出「這個 tree 的 CI 是全套跑過的」，見 tools/release/deploy_gate.cjs）。
// 這裡守住：ci.yml、deploy.yml、run_all 都沒有偷偷跳測試；ship 還是用 changed_files 的內容判斷。
const assert = require("assert");
const fs = require("fs"), path = require("path");
const CF = require("../../tools/release/changed_files.cjs");
const SHIP = require("../../tools/release/ship.cjs");
const root = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");

let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack || e.message); } };

T("ship 的 isContentFile／contentOnly 就是 changed_files 的", () => {
  assert.strictEqual(SHIP.isContentFile, CF.isContentFile);
  assert.strictEqual(SHIP.contentOnly, CF.contentOnly);
  assert.strictEqual(CF.contentOnly(["content/weeks/a.json", "docs/維護日誌/2026/a.md"]), true);
  assert.strictEqual(CF.contentOnly(["content/a.json", "tools/release/ship.cjs"]), false);
  assert.strictEqual(CF.contentOnly([]), false, "沒有檔案不算只改內容");
  assert.strictEqual(CF.contentOnly(["content\\weeks\\a.json"]), true, "Windows 的斜線也認得");
});
T("run_all 沒有任何跳過測試的開關", () => {
  const src = read("test/run_all.cjs");
  assert.ok(!/SKIP_SLOW_ECON|slowEcon/.test(src), "run_all 不能再有跳過");
});
T("ci.yml 沒有跳過測試的步驟，而且一定跑 npm test 和打包", () => {
  const ci = read(".github/workflows/ci.yml");
  assert.ok(!/SKIP_SLOW_ECON|changed_files/.test(ci));
  assert.ok(ci.includes("run: npm test") && ci.includes("run: npm run build"));
});
T("deploy.yml：沒有 SKIP_SLOW_ECON、有跑 npm test，deploy 等 test 和 prepare 都成功", () => {
  const d = read(".github/workflows/deploy.yml");
  assert.ok(!/SKIP_SLOW_ECON|changed_files|--github-env/.test(d), "deploy.yml 不能用只改內容的跳過");
  assert.ok(d.includes("run: npm test"), "還是跑 npm test");
  assert.ok(/deploy:\s*\n\s*needs: \[test, prepare\]/.test(d), "部署要等 test 和 prepare");
  assert.ok(!/^\s*if:.*(always|cancelled)\(\)/m.test(d), "deploy 不能用 always() 蓋過 needs");
});
T("工作流程沒有人設 SKIP_SLOW_ECON", () => {
  fs.readdirSync(path.join(root, ".github", "workflows")).filter(f => f.endsWith(".yml")).forEach(f => assert.ok(!read(".github/workflows/" + f).includes("SKIP_SLOW_ECON"), f));
});

console.log(`${pass} passed, ${fail} failed（CI 不跳測試）`);
process.exit(fail ? 1 : 0);
