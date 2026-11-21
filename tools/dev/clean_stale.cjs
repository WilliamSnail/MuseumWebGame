// 清掉搬家前留下的舊檔（11-20：架構整理後，好幾個工作副本的舊產生檔、舊資料夾讓測試、資料夾規矩、上線失敗了三次）。
//   node tools/dev/clean_stale.cjs        只列出來
//   node tools/dev/clean_stale.cjs --do   真的刪（ship 上線前會自己跑）
// 只刪「不在 git 裡」的東西：路徑在 STALE 清單上、而且 git ls-files 找不到它。進了 git 的、清單外的一律不碰。
// 以後再搬家，把舊位置加進 STALE。
const fs = require("fs"), path = require("path"), { spawnSync } = require("./child.cjs");
const ROOT = path.join(__dirname, "..", "..");
const STALE = [
  "維護日誌",                      // 11-20 搬到 docs/維護日誌/
  "docs/音效與特效總表.md",        // 11-20 搬到 docs/素材/
  "shared/notices_data.js",        // 11-20 搬到 shared/game/notices_data.js（產生檔）
  "shared/map_data.js",            // 11-20 搬到 shared/world/（產生檔）
  "shared/npc_roster.js",          // 11-20 搬到 shared/npc/roster.js（產生檔）
  "shared/world_roster.js",        // 11-20 搬到 shared/world/roster.js（產生檔）
  "shared/world_events.js",        // 11-20 搬到 shared/world/events.js（產生檔）
  "shared/world_markets.js",       // 11-20 搬到 shared/world/markets.js
];
const tracked = (p, root) => spawnSync("git", ["-c", "core.quotepath=false", "ls-files", "--", p], { cwd: root, encoding: "utf8" }).stdout.trim() !== "";
// 回傳要刪的路徑（相對 root）。純函式加 git 查詢，測試可以給別的 root
function staleList(root = ROOT) {
  return STALE.filter(p => fs.existsSync(path.join(root, p)) && !tracked(p, root));
}
function clean(root = ROOT, doIt = true) {
  const list = staleList(root);
  if (doIt) for (const p of list) fs.rmSync(path.join(root, p), { recursive: true, force: true });
  return list;
}
if (require.main === module) {
  const doIt = process.argv.includes("--do");
  const list = clean(ROOT, doIt);
  if (!list.length) console.log("沒有搬家前留下的舊檔");
  else console.log(`${doIt ? "刪掉" : "會刪"}搬家前留下的舊檔：${list.join("、")}`);
}
module.exports = { STALE, staleList, clean };
