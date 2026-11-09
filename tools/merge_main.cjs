// 併 origin/main，只會「大家都往後加」的檔案自動解衝突（翊文 11-09：「自動收集各種可能多步驟但其實可以用腳本加速的地方，讓子代裡需要也可以共用這些腳本」）
//   npm run merge:main
// 自動解的：日誌索引（重新產生）、館方公告（兩邊都留）、測試清單（兩邊都留）。其他的衝突停下來，要人看。
const fs = require("fs"), path = require("path");
const { spawnSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
const INDEX = "維護日誌/README.md";
// 兩邊都留。notice：每則是 { … }，衝突裡的兩段開頭共用一個 "  {"，要補回去
const KEEP_BOTH = { "shared/notices.js": "notice", "test/run_all.cjs": "plain", "test/esm_smoke.mjs": "plain", "docs/現況.md": "plain", "tools/README.md": "plain" };
const canAuto = f => f === INDEX || !!KEEP_BOTH[f];

const MARK = /^<<<<<<< [^\n]*\n([\s\S]*?)^=======\n([\s\S]*?)^>>>>>>> [^\n]*\n/gm;
function keepBoth(text, how = "plain") {
  return text.replace(MARK, (m, ours, theirs) => (how === "notice" ? `${ours}  {\n${theirs}` : ours + theirs));
}
function git(args, opts = {}) {
  const r = spawnSync("git", ["-c", "core.quotepath=false", ...args], { cwd: ROOT, encoding: "utf8", input: opts.input });
  if (r.status !== 0 && !opts.ok) throw new Error(`git ${args[0]} 失敗：${(r.stdout + r.stderr).trim().slice(-400)}`);
  return r;
}
// 解得掉回傳解掉的檔案；解不掉丟錯（合併留在原狀，看得到衝突）
function resolveConflicts() {
  const files = git(["diff", "--name-only", "--diff-filter=U"]).stdout.split("\n").filter(Boolean);
  const stuck = files.filter(f => !canAuto(f));
  if (stuck.length) throw new Error(`這些要手動解：\n${stuck.join("\n")}`);
  files.filter(f => KEEP_BOTH[f]).forEach(f => {
    const p = path.join(ROOT, f);
    fs.writeFileSync(p, keepBoth(fs.readFileSync(p, "utf8"), KEEP_BOTH[f]));
    git(["add", f]);
  });
  if (files.includes(INDEX)) {
    spawnSync(process.execPath, ["tools/log_index.cjs"], { cwd: ROOT });
    git(["add", INDEX]);
  }
  return files;
}
function mergeMain(commitMsg = "併 main") {
  git(["fetch", "-q", "origin"]);
  const r = git(["merge", "--no-edit", "origin/main"], { ok: true });
  if (r.status === 0) return [];
  const files = resolveConflicts();
  git(["commit", "-q", "-F", "-"], { input: commitMsg + "\n" });
  return files;
}
if (require.main === module) {
  try { const f = mergeMain(); console.log(f.length ? `併好了，自動解了：${f.join("、")}` : "併好了。"); }
  catch (e) { console.error(e.message); process.exit(1); }
}
module.exports = { keepBoth, canAuto, mergeMain, resolveConflicts };
