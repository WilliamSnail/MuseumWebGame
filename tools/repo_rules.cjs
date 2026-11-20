// 資料夾的規矩（11-20 架構整理，翊文：「要怎麼避免以後再發生這些問題」）。npm test 會跑，違規就失敗。
//   1. 最上層只放清單裡的東西（以前被誤 commit 過暫存檔 body_tmp.md）。真的要加新的最上層檔案／資料夾，改下面的 TOP 並在 PR 說明為什麼。
//   2. 模擬腳本只放 test/sim/（以前 test/ 平放 32 支，還有壹支是重複的舊版）。
//   3. shared/ 的賭場、合作、地下、Discord 檔放子資料夾（casino/、coop/、cellar/、discord/），不准再在 shared/ 第一層開 casino_xxx.js 這種。
//   4. 檔名不准用數字結尾（logic3.js、content4.js 這種看不出用途）。
//   5. 程式檔（shared/、web/src/、functions/ 第一層）單檔不超過 MAX_LINES 行；已經超過的列在 BIG，只准變小。
//   6. web/src 的 import 不准繞圈（shared/ 的繞圈由 tools/check_imports.cjs 擋）。
const { spawnSync } = require("child_process"), path = require("path");
const ROOT = path.join(__dirname, "..");
const TOP = [".firebaserc", ".github", ".gitignore", "AGENTS.md", "CLAUDE.md", "README.md", "assets", "content", "database.rules.json", "docs",
  "firebase.json", "firestore.indexes.json", "firestore.rules", "functions", "package-lock.json", "package.json", "shared", "test", "tools", "version.json",
  "vite.config.js", "web", "維護日誌"];
const fs = require("fs");
const MAX_LINES = 1200;
// 11-20 已經超過的：數字是現在的行數，只准變小（變小了就把這裡的數字改小；降到 1,200 以下就刪掉這行）
const BIG = { "web/src/ui_core.js": 1350, "web/src/fx_sound.js": 1323, "web/src/ui_bank.js": 1319 };
// 11-20 以前就有的數字檔名：之後改名了就從這裡拿掉
const OLD_NUM = ["web/src/ui_screens1.js", "web/src/ui_screens2.js", "web/src/ui_screens3.js", "web/src/ui_lobby2.js", "tools/gstock_lev_sim2.cjs"];
const CODE = /^(shared\/.*|web\/src\/[^/]+|functions\/[^/]+)\.(js|cjs|mjs)$/;
function check(files, readText = f => fs.readFileSync(path.join(ROOT, f), "utf8")) {
  const bad = [];
  const top = new Set(files.map(f => f.split("/")[0]));
  for (const t of top) if (!TOP.includes(t)) bad.push(`最上層多了「${t}」：不在 tools/repo_rules.cjs 的 TOP 清單（暫存檔不要 commit；真的要加就改清單）`);
  for (const f of files) if (/^test\/sim[^/]*\.c?js$/.test(f)) bad.push(`${f}：模擬腳本放 test/sim/`);
  for (const f of files) { const m = f.match(/^shared\/(casino|coop|cellar|discord)(_[^/]*)?\.js$/); if (m) bad.push(`${f}：放進 shared/${m[1]}/ 子資料夾`); }
  for (const f of files) if (/^(shared|web\/src|functions|tools)\/(.*\/)?[^/]*[a-z_]\d\.(js|cjs|mjs)$/i.test(f) && !OLD_NUM.includes(f)) bad.push(`${f}：檔名不要用數字結尾，取個看得出用途的名字`);
  for (const f of files) {
    if (!CODE.test(f) || /^functions\/shared\//.test(f)) continue;
    const n = readText(f).split("\n").length, cap = BIG[f] || MAX_LINES;
    if (n > cap) bad.push(`${f}：${n} 行，超過 ${cap} 行（照分段拆成幾支，見 AGENTS.md 第 4 節）`);
  }
  bad.push(...webCycles(files, readText));
  return bad;
}
// web/src 的 import 繞圈（A → B → … → A）
function webCycles(files, readText) {
  const web = files.filter(f => /^web\/src\/[^/]+\.js$/.test(f)), g = {};
  for (const f of web) g[f] = [...readText(f).matchAll(/from "\.\/([\w]+\.js)"/g)].map(m => "web/src/" + m[1]).filter(x => x !== f && web.includes(x));
  const out = [], state = {}, stack = [];
  const dfs = f => { state[f] = 1; stack.push(f); for (const d of g[f]) { if (state[d] === 1) out.push("web/src 的 import 繞圈了：" + [...stack.slice(stack.indexOf(d)), d].map(x => x.slice(8)).join(" → ") + "（共用的東西搬到下層的檔，或用 PANELS／ADDONS 登記）"); else if (!state[d]) dfs(d); } stack.pop(); state[f] = 2; };
  for (const f of web) if (!state[f]) dfs(f);
  return out;
}
if (require.main === module) {
  const r = spawnSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" });
  const files = r.stdout.split("\0").filter(Boolean);
  const bad = check(files);
  if (bad.length) { bad.forEach(b => console.log("✗ " + b)); console.log(`${bad.length} 個問題`); process.exit(1); }
  console.log(`資料夾的規矩：${files.length} 個檔都對`);
}
module.exports = { check, TOP, MAX_LINES, BIG };
