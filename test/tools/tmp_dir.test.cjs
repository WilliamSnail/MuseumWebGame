// 測試的暫存資料夾要用完就刪（11-27，總督查到 %TEMP% 留了約 1.26 萬個）：node test/tools/tmp_dir.test.cjs（npm test 也會跑）
// 1. test/ 裡不准直接用 fs.mkdtempSync，要用 test/tmp_dir.cjs 的 tmpDir（程式結束自動刪）。
// 2. tmpDir 建的資料夾，子程式結束後真的不見了。
const assert = require("assert"), fs = require("fs"), path = require("path"), cp = require("../../tools/dev/child.cjs");
const ROOT = path.join(__dirname, "..", "..");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(c|m)?js$/.test(e.name) ? [path.join(d, e.name)] : []));

T("test/ 不直接用 fs.mkdtempSync（用 tmpDir）", () => {
  const ok = [path.join("test", "tmp_dir.cjs"), path.join("test", "tools", "tmp_dir.test.cjs"), path.join("test", "tools", "browser_cleanup.test.cjs")];
  const bad = walk(path.join(ROOT, "test")).map(f => path.relative(ROOT, f)).filter(f => !ok.includes(f) && /mkdtempSync\(/.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
  assert.deepStrictEqual(bad, [], "這些測試直接建暫存資料夾、不會自己刪：改用 require(\"…/tmp_dir.cjs\").tmpDir(\"開頭-\")：" + bad.join("、"));
});
T("tmpDir 建的資料夾，程式結束（含 process.exit(1)）就刪掉", () => {
  const js = `const d=require(${JSON.stringify(path.join(ROOT, "test", "tmp_dir.cjs"))}).tmpDir("tmptest-");require("fs").writeFileSync(d+"/a.txt","1");console.log(d);process.exit(1);`;
  const r = cp.spawnSync(process.execPath, ["-e", js], { encoding: "utf8" });
  const d = (r.stdout || "").trim();
  assert.ok(d && d.includes("tmptest-"), "子程式要印出資料夾：" + r.stderr);
  assert.ok(!fs.existsSync(d), "結束後資料夾要不見：" + d);
});

console.log(`${pass} passed, ${fail} failed（測試的暫存用完就刪）`);
process.exit(fail ? 1 : 0);
