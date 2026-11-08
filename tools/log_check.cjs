// 檢查維護日誌：node tools/log_check.cjs
//   1. 每一篇的檔名、開頭欄位、標題都對（格式見 維護日誌/範本.md）。
//   2. 總表 維護日誌/README.md 是最新的。
//   3. 加 --base <分支或 commit>（CI 的 PR 用）：這個 PR 改了程式（shared/、web/、server/、db/），就一定要新增一篇日誌。
const fs = require("fs"), path = require("path");
const { execSync, spawnSync } = require("child_process");
const { ROOT, listLogs, check } = require("./log_lib.cjs");

const errs = listLogs().flatMap(check);

// 總表
const idx = spawnSync(process.execPath, [path.join(__dirname, "log_index.cjs"), "--check"], { cwd: ROOT, encoding: "utf8" });
if (idx.status !== 0) errs.push((idx.stderr || idx.stdout).trim());

// PR 有改程式就要有日誌
const bi = process.argv.indexOf("--base");
if (bi > 0) {
  const base = process.argv[bi + 1];
  const changed = execSync(`git -c core.quotepath=false diff --name-only --diff-filter=ACMR ${base}...HEAD`, { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  const touchesCode = changed.some(f => /^(shared|web|server|db)\//.test(f));
  const addsLog = changed.some(f => /^維護日誌\/\d{4}\/.+\.md$/.test(f));
  if (touchesCode && !addsLog) errs.push("這個 PR 改了程式，但沒有新增維護日誌（維護日誌/年份/月-日_作者_主題.md）");
}

if (errs.length) { console.error(errs.join("\n")); console.error(`${errs.length} 個問題`); process.exit(1); }
console.log(`維護日誌 ${listLogs().length} 篇，格式都對`);
