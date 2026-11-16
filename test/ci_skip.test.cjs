// 只改內容的 PR，CI 跳過最慢的那項「經濟自我檢查腳本」（11-16 每日排程優化二；tools/changed_files.cjs、test/run_all.cjs、.github/workflows）
// 重點：有任何程式檔、不是 pull_request、讀不到差異，壹律全跑；部署前的最後一道（deploy.yml）不能跳。
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const { spawnSync } = require("child_process");
const CF = require("../tools/changed_files.cjs");
const SHIP = require("../tools/ship.cjs");
const root = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");

let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack || e.message); } };

T("ship 和 CI 用同壹個判斷（ship 的 isContentFile／contentOnly 就是 changed_files 的）", () => {
  assert.strictEqual(SHIP.isContentFile, CF.isContentFile);
  assert.strictEqual(SHIP.contentOnly, CF.contentOnly);
});
T("skipSlowEcon：pull_request 而且全是內容才跳過", () => {
  const c = ["content/weeks/2026-W47/d2.json", "維護日誌/2026/a.md", "shared/map_data.js"];
  assert.strictEqual(CF.skipSlowEcon(c, "pull_request"), true);
  assert.strictEqual(CF.skipSlowEcon([...c, "tools/ship.cjs"], "pull_request"), false, "有程式檔就跑");
  assert.strictEqual(CF.skipSlowEcon([...c, "test/a.test.cjs"], "pull_request"), false);
  assert.strictEqual(CF.skipSlowEcon([...c, "functions/casino.js"], "pull_request"), false);
  assert.strictEqual(CF.skipSlowEcon([...c, ".github/workflows/ci.yml"], "pull_request"), false, "改工作流程也全跑");
  assert.strictEqual(CF.skipSlowEcon(c, "push"), false, "push 到 main 壹律全跑");
  assert.strictEqual(CF.skipSlowEcon(c, "workflow_dispatch"), false);
  assert.strictEqual(CF.skipSlowEcon(c, ""), false);
  assert.strictEqual(CF.skipSlowEcon(c, undefined), false);
  assert.strictEqual(CF.skipSlowEcon([], "pull_request"), false, "沒有檔案不算只改內容");
  assert.strictEqual(CF.skipSlowEcon(["content\\weeks\\a.json"], "pull_request"), true, "Windows 的斜線也認得");
});

// 真的在暫存的 git 資料夾跑壹次：只改內容 → GITHUB_ENV 寫進 SKIP_SLOW_ECON=1；加了程式檔 → 沒寫
function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-")), git = (...a) => { const r = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...a], { cwd: dir, encoding: "utf8" }); assert.strictEqual(r.status, 0, a.join(" ") + "\n" + r.stderr); };
  git("init", "-q", "-b", "main");
  fs.mkdirSync(path.join(dir, "content")); fs.mkdirSync(path.join(dir, "tools"));
  fs.writeFileSync(path.join(dir, "content", "a.json"), "{}"); fs.writeFileSync(path.join(dir, "tools", "x.cjs"), "1");
  git("add", "-A"); git("commit", "-q", "-m", "base"); git("checkout", "-q", "-b", "pr");
  return { dir, git };
}
function runCli(dir, event, envFile) {
  const r = spawnSync(process.execPath, [path.join(root, "tools", "changed_files.cjs"), "--base", "main", "--repo", dir, "--event", event, "--github-env"], { encoding: "utf8", env: { ...process.env, GITHUB_ENV: envFile } });
  return { out: r.stdout + r.stderr, code: r.status, env: fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "" };
}
T("CLI：只改內容的 PR 寫 SKIP_SLOW_ECON=1；有程式檔、push、讀不到 base 都不寫", () => {
  const { dir, git } = sandbox(), ef = path.join(dir, "env.txt");
  fs.writeFileSync(path.join(dir, "content", "a.json"), '{"x":1}'); fs.mkdirSync(path.join(dir, "維護日誌")); fs.writeFileSync(path.join(dir, "維護日誌", "l.md"), "x");
  git("add", "-A"); git("commit", "-q", "-m", "content");
  let r = runCli(dir, "pull_request", ef);
  assert.strictEqual(r.code, 0); assert.ok(r.env.includes("SKIP_SLOW_ECON=1"), r.out); assert.ok(r.out.includes("只改內容"), r.out);
  fs.rmSync(ef, { force: true });
  r = runCli(dir, "push", ef); assert.ok(!r.env.includes("SKIP_SLOW_ECON"), "push 不跳過：" + r.out);
  const bad = spawnSync(process.execPath, [path.join(root, "tools", "changed_files.cjs"), "--base", "nope", "--repo", dir, "--event", "pull_request", "--github-env"], { encoding: "utf8", env: { ...process.env, GITHUB_ENV: ef } });
  assert.strictEqual(bad.status, 0); assert.ok(!fs.existsSync(ef) && /全跑/.test(bad.stdout), "讀不到差異：全跑，不報錯");
  fs.writeFileSync(path.join(dir, "tools", "x.cjs"), "2"); git("add", "-A"); git("commit", "-q", "-m", "code");
  r = runCli(dir, "pull_request", ef); assert.ok(!r.env.includes("SKIP_SLOW_ECON"), "有程式檔：" + r.out); assert.ok(r.out.includes("有程式檔"), r.out);
});

T("run_all：只有經濟自我檢查那壹項標 slowEcon；SKIP_SLOW_ECON=1 才跳過並印壹行說明", () => {
  const src = read("test/run_all.cjs");
  const tagged = src.split("\n").filter(l => l.includes('"slowEcon"') && l.trim().startsWith("["));
  assert.strictEqual(tagged.length, 1, "只能有壹項標 slowEcon");
  assert.ok(tagged[0].includes("test/econ_check.test.cjs") && tagged[0].includes("經濟自我檢查"));
  assert.ok(src.includes('process.env.SKIP_SLOW_ECON === "1"'), "只認 =1");
  assert.ok(src.includes("只改內容，跳過經濟自我檢查"));
});
T("ci.yml：PR 先比對差異（fetch-depth 0），只改內容就設 SKIP_SLOW_ECON；在 npm test 之前", () => {
  const ci = read(".github/workflows/ci.yml");
  assert.ok(/fetch-depth:\s*0/.test(ci) && ci.includes("on:\n  pull_request:"));
  const a = ci.indexOf("node tools/changed_files.cjs"), b = ci.indexOf("run: npm test");
  assert.ok(a > 0 && b > a, "判斷要在 npm test 之前");
  assert.ok(ci.includes("--base origin/${{ github.base_ref }}") && ci.includes("--github-env") && ci.includes("--event ${{ github.event_name }}"));
});
T("deploy.yml：部署前的最後壹道壹定跑全套（沒有判斷、沒有 SKIP_SLOW_ECON）", () => {
  const d = read(".github/workflows/deploy.yml");
  assert.ok(!d.includes("changed_files") && !/^\s*SKIP_SLOW_ECON/m.test(d) && !d.includes("--github-env"), "deploy.yml 不能跳測試");
  assert.ok(d.includes("run: npm test"), "還是跑 npm test");
  assert.ok(/deploy:\s*\n\s*needs: test/.test(d), "部署要等 test 過");
});
T("其他工作流程沒有人偷設 SKIP_SLOW_ECON", () => {
  fs.readdirSync(path.join(root, ".github", "workflows")).filter(f => f.endsWith(".yml") && f !== "ci.yml").forEach(f => assert.ok(!read(".github/workflows/" + f).includes("SKIP_SLOW_ECON=1"), f));
});

console.log(`${pass} passed, ${fail} failed（只改內容的 CI）`);
process.exit(fail ? 1 : 0);
