// 資料夾的規矩（11-20 架構整理，翊文：「要怎麼避免以後再發生這些問題」）。npm test 會跑，違規就失敗。
//   1. 最上層只放清單裡的東西（以前被誤 commit 過暫存檔 body_tmp.md）。真的要加新的最上層檔案／資料夾，改下面的 TOP 並在 PR 說明為什麼。
//   2. 模擬腳本只放 test/sim/（以前 test/ 平放 32 支，還有壹支是重複的舊版）。
// 之後還會加：import 不准繞圈、單檔行數上限、shared/ 子資料夾（等架構整理第 5～7 項做完再開，見 AGENTS.md 第 4 節）。
const { spawnSync } = require("child_process"), path = require("path");
const ROOT = path.join(__dirname, "..");
const TOP = [".firebaserc", ".github", ".gitignore", "AGENTS.md", "CLAUDE.md", "README.md", "assets", "content", "database.rules.json", "docs", "drafts",
  "firebase.json", "firestore.indexes.json", "firestore.rules", "functions", "package-lock.json", "package.json", "shared", "test", "tools", "version.json",
  "vite.config.js", "web", "維護日誌", "規劃.md"];
function check(files) {
  const bad = [];
  const top = new Set(files.map(f => f.split("/")[0]));
  for (const t of top) if (!TOP.includes(t)) bad.push(`最上層多了「${t}」：不在 tools/repo_rules.cjs 的 TOP 清單（暫存檔不要 commit；真的要加就改清單）`);
  for (const f of files) if (/^test\/sim[^/]*\.c?js$/.test(f)) bad.push(`${f}：模擬腳本放 test/sim/`);
  return bad;
}
if (require.main === module) {
  const r = spawnSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" });
  const files = r.stdout.split("\0").filter(Boolean);
  const bad = check(files);
  if (bad.length) { bad.forEach(b => console.log("✗ " + b)); console.log(`${bad.length} 個問題`); process.exit(1); }
  console.log(`資料夾的規矩：${files.length} 個檔都對`);
}
module.exports = { check, TOP };
