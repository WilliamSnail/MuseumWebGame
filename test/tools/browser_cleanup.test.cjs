// 無頭瀏覽器關乾淨（11-27，總督查到 ui_check、shot_phone 留下 24 個 Edge、21 GB）：node test/tools/browser_cleanup.test.cjs（npm test 也會跑）
// 1. tools/ 裡開瀏覽器（--user-data-dir）的腳本，都要用 tools/dev/child.cjs 的 guardBrowser 或 killBrowserProfile 收尾。
// 2. killBrowserProfile 會刪掉暫存資料夾；沒給、給不存在的路徑不會丟錯。
const assert = require("assert"), fs = require("fs"), path = require("path"), os = require("os");
const C = require("../../tools/dev/child.cjs");
const ROOT = path.join(__dirname, "..", "..");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.name === "node_modules" ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : /\.c?js$/.test(e.name) ? [path.join(d, e.name)] : []));

T("開瀏覽器的腳本都用共用的關法", () => {
  const bad = walk(path.join(ROOT, "tools")).filter(f => !f.endsWith(path.join("dev", "child.cjs"))).filter(f => {
    const s = fs.readFileSync(f, "utf8");
    return /--user-data-dir/.test(s) && !/guardBrowser|killBrowserProfile/.test(s);
  }).map(f => path.relative(ROOT, f));
  assert.deepStrictEqual(bad, [], "這些腳本開了無頭瀏覽器，卻沒用 tools/dev/child.cjs 的 guardBrowser（或 killBrowserProfile）收尾：" + bad.join("、"));
});
T("killBrowserProfile 刪掉暫存資料夾；沒給、不存在都不丟錯", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "brtest_"));
  fs.writeFileSync(path.join(d, "x.txt"), "1");
  C.killBrowserProfile(d);
  assert.ok(!fs.existsSync(d), "資料夾要刪掉");
  C.killBrowserProfile(null); C.killBrowserProfile(path.join(os.tmpdir(), "brtest_沒有這個"));
});
T("guardBrowser 回傳的 close 只跑壹次", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "brtest_")); let n = 0;
  const close = C.guardBrowser(d, { kill: () => { n++; } });
  close(); close();
  assert.strictEqual(n, 1); assert.ok(!fs.existsSync(d));
});

console.log(`${pass} passed, ${fail} failed（無頭瀏覽器關乾淨）`);
process.exit(fail ? 1 : 0);
