// 檢查維護日誌：node tools/check/log_check.cjs
//   1. 每一篇的檔名、開頭欄位、標題都對（格式見 維護日誌/範本.md）。
//   2. 加 --base <分支或 commit>（CI 的 PR 用）：這個 PR 改了程式（shared/、web/），就一定要新增一篇日誌。
const fs = require("fs"), path = require("path");
const { execSync, spawnSync } = require("child_process");
const { ROOT, listLogs, check } = require("./log_lib.cjs");

const errs = listLogs().flatMap(check);

// 總表 維護日誌/README.md 不進 git（11-16 起 .gitignore，npm run log:index 在本機產生給人看），這裡只檢查每篇的格式

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
