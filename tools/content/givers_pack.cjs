// 把 content/givers/*.json 打包成 shared/npc/givers.js（網頁和伺服器共用的交代人互動資料，決定 0151）。
// 網頁、Functions 都讀不到 content/，所以轉成進 repo 的 js 檔。整份放（台詞、小故事、拜託、送禮喜好都要給畫面用）。
// 內容改了就跑 node tools/content/givers_pack.cjs；npm test 會檢查有沒有跟上（test/tools/givers_pack.test.cjs）。copy_shared.cjs 也會順手跑。
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");
function givers(dir = path.join(ROOT, "content", "givers")) {
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue; // _ids.json 是句數紀錄，不打包
    let o; try { o = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch (e) { console.error("交代人：讀不出來", f, e.message); continue; }
    if (!o || typeof o.id !== "string") continue;
    out[o.id] = o;
  }
  return out;
}
const HEAD = "// tools/content/givers_pack.cjs 產生的，不要改（改 content/givers/*.json，再跑 node tools/content/givers_pack.cjs）。\n// 交代人互動資料（閒聊、小故事、拜託、送禮喜好）：網頁和伺服器共用，規則在 shared/social/giver.js。\n";
const source = g => HEAD + "export const GIVERS = " + JSON.stringify(g) + ";\n";
function write() { const f = path.join(ROOT, "shared", "npc", "givers.js"), s = source(givers()); if (!fs.existsSync(f) || fs.readFileSync(f, "utf8") !== s) fs.writeFileSync(f, s); return f; }
module.exports = { givers, source, write };
if (require.main === module) console.log("寫好了", write());
