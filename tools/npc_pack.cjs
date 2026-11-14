// 把 content/npc/*.json 打包成 shared/npc_roster.js（網頁和伺服器共用的館內 NPC 名單，11-14）。
// 網頁不能直接讀 content/（shared/logic.js 也要在 Node 測試裡跑），所以把名單轉成壹個進 repo 的 js 檔。
// 只放旅客（visitor）和委託人（client）：劇情角色（trace）不露臉、不進網頁（只在伺服器的 npc_list_data.js 裡）。
// 只放遊戲要用的欄位（沒有 budget）。內容改了就跑 node tools/npc_pack.cjs；npm test 會檢查有沒有跟上（test/npc.test.cjs）。copy_shared.cjs 也會順手跑。
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const KEEP = ["id", "name", "kind", "note", "story", "likes", "route", "arc", "casino"];
function roster(dir = path.join(ROOT, "content", "npc")) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith(".json")) continue;
    let o; try { o = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch (e) { console.error("NPC：讀不出來", f, e.message); continue; }
    if (!o || typeof o.id !== "string" || o.kind === "trace") continue;
    const r = {}; KEEP.forEach(k => { if (o[k] !== undefined) r[k] = o[k]; });
    if (Array.isArray(r.arc)) r.arc = r.arc.map(g => { const { early, ...rest } = g; return rest; }); // early 是給排程和審的人看的理由，不進遊戲
    out.push(r);
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}
const HEAD = "// tools/npc_pack.cjs 產生的，不要改（改 content/npc/*.json，再跑 node tools/npc_pack.cjs）。\n// 館內 NPC 名單（旅客、委託人；劇情角色不放）：網頁和伺服器共用，規則在 shared/npc.js。\n";
const source = list => HEAD + "export const NPC_ROSTER = " + JSON.stringify(list, null, 1).replace(/\n\s*/g, "") + ";\n";
function write() { const f = path.join(ROOT, "shared", "npc_roster.js"), s = source(roster()); if (!fs.existsSync(f) || fs.readFileSync(f, "utf8") !== s) fs.writeFileSync(f, s); return f; }
module.exports = { roster, source, write };
if (require.main === module) console.log("寫好了", write());
