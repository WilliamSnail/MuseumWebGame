// 把 content/world/units/*.json 打包成 shared/world_roster.js（伺服器和測試共用的單位名單，W3，決定 0086）。
// 只放算帳要用的欄位（id、名字、kind、parent、sector、share）。內容改了就跑 node tools/world_pack.cjs；npm test（test/world.test.cjs）會檢查有沒有跟上，copy_shared.cjs 也會順手跑。
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const KEEP = ["id", "name", "kind", "parent", "sector", "market", "share", "stocks"];
function roster(dir = path.join(ROOT, "content", "world", "units")) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith(".json")) continue;
    let o; try { o = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch (e) { console.error("世界單位：讀不出來", f, e.message); continue; }
    if (!o || typeof o.id !== "string") continue;
    const r = {}; KEEP.forEach(k => { if (o[k] !== undefined) r[k] = o[k]; });
    out.push(r);
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}
const HEAD = "// tools/world_pack.cjs 產生的，不要改（改 content/world/units/*.json，再跑 node tools/world_pack.cjs）。\n// 外面世界的單位名單（算帳用）：規則在 shared/world.js。\n";
const source = list => HEAD + "export const WORLD_UNITS = " + JSON.stringify(list, null, 1).replace(/\n\s*/g, "") + ";\n";
function write() { const f = path.join(ROOT, "shared", "world_roster.js"), s = source(roster()); if (!fs.existsSync(f) || fs.readFileSync(f, "utf8") !== s) fs.writeFileSync(f, s); return f; }
module.exports = { roster, source, write };
if (require.main === module) console.log("寫好了", write());
