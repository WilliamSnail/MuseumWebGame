// 把 content/map/館外.json 打包成 shared/map_data.js（圖書館「地圖」頁籤讀的點，11-16；規格 .claude/交接/主線拓展規劃稿.md 第伍節）。
// 網頁不能直接讀 content/，所以轉成壹個進 repo 的 js 檔。內容由排程在「揭露當天」寫進 content/map/館外.json（只增不減；後面的不能先寫）。
// 改了就跑 node tools/content/map_pack.cjs；npm test 會檢查有沒有跟上（test/web/map.test.cjs）。copy_shared.cjs 也會順手跑。
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const KEEP = ["id", "name", "layer", "from", "x", "y", "icon", "line", "npc", "need"]; // source 是給審的人看的，不進遊戲
function spots(file = path.join(ROOT, "content", "map", "館外.json")) {
  if (!fs.existsSync(file)) return [];
  let o; try { o = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { console.error("地圖：讀不出來", e.message); return []; }
  const list = o && Array.isArray(o.spots) ? o.spots : [];
  return list.filter(s => s && typeof s.id === "string").map(s => { const r = {}; KEEP.forEach(k => { if (s[k] !== undefined) r[k] = s[k]; }); return r; }).sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.id < b.id ? -1 : 1));
}
const HEAD = "// tools/content/map_pack.cjs 產生的，不要改（改 content/map/館外.json，再跑 node tools/content/map_pack.cjs）。\n// 館外地圖的點（揭露當天才寫進去）：規則在 shared/map.js，畫面在 web/src/ui_map.js。\n";
const source = list => HEAD + "export const MAP_SPOTS = " + JSON.stringify(list).replace(/\},\{/g, "},\n{") + ";\n";
function write() { const f = path.join(ROOT, "shared", "map_data.js"), s = source(spots()); if (!fs.existsSync(f) || fs.readFileSync(f, "utf8") !== s) fs.writeFileSync(f, s); return f; }
module.exports = { spots, source, write };
if (require.main === module) console.log("寫好了", write());
