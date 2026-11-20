// 把 content/notices/<id>.json（一則公告一個檔）合成 shared/notices_data.js（網頁、伺服器、測試共用）。
//   node tools/content/notices_build.cjs          產生 shared/notices_data.js（沒變就不寫，很快，可以重複跑）
//   node tools/content/notices_build.cjs --check  只檢查：每個檔格式對、沒有人又往 shared/notices.js 插舊的陣列
// shared/notices_data.js 不進 git（.gitignore）：npm test／dev／build／部署／CI 都會先跑這支（見 docs/規則/架構.md「公告」）。
// 為什麼一則一個檔：以前 NOTICES 是一個大陣列、新公告都插在同一行，同時上線的 PR 一直撞。現在每個 PR 加自己的檔，不會撞。
//
// 順序（跟以前「新的插在最上面」一樣）：
//   1. 沒有 order 的（npm run notice 新加的）排最前面：at（寫入時間）新的在前；
//   2. 有 order 的（遷移時照舊陣列的順序編的）照 order 由小到大。
//   畫面最後還是照發布日期新到舊排，這個順序只決定「同一天、同重要度」誰先。
// 舊陣列偵測：shared/notices.js 如果又出現 `export const NOTICES = [`（某個 PR 在公告拆檔之前開的、合併時帶回舊寫法），
//   這裡直接報錯並提示「請改用 npm run notice，或跑 node tools/content/notices_migrate.cjs 把它們拆出去」；不會默默吞掉。
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const DIR = path.join(ROOT, "content", "notices");
const OUT = path.join(ROOT, "shared", "notices_data.js");
const SRC = path.join(ROOT, "shared", "notices.js");
const OLD_ARRAY = /^export const NOTICES = \[/m;
const HEAD = "// tools/content/notices_build.cjs 產生的，不要改，也不進 git（改 content/notices/<id>.json，或用 npm run notice 加新的）。\n// 館方公告的資料；規則和函式在 shared/notices.js。\n";

function sortKey(a, b) {
  const ha = typeof a.order === "number", hb = typeof b.order === "number";
  if (ha !== hb) return ha ? 1 : -1;
  if (ha) return a.order - b.order || (a.id < b.id ? -1 : 1);
  return String(b.at || "").localeCompare(String(a.at || "")) || (a.id < b.id ? -1 : 1);
}
// 讀資料夾：回傳 { list（排好、拿掉 order／at）, errors }
function load(dir = DIR) {
  const errors = [], rows = [];
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith(".json")) continue;
    let o;
    try { o = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch (e) { errors.push(`${f}：讀不出來（${e.message}）`); continue; }
    const id = f.slice(0, -5);
    if (!o || typeof o !== "object" || Array.isArray(o)) { errors.push(`${f}：要是一個物件`); continue; }
    if (o.id !== id) errors.push(`${f}：id（${o.id}）要跟檔名一樣`);
    if (!o.title || typeof o.title !== "string") errors.push(`${f}：沒有 title`);
    if (o.sections !== undefined && !Array.isArray(o.sections)) errors.push(`${f}：sections 要是陣列`);
    rows.push(o);
  }
  rows.sort(sortKey);
  const list = rows.map(o => { const { order, at, ...rest } = o; return rest; });
  return { list, errors };
}
function source(list) { return HEAD + "export const NOTICES_DATA = [\n" + list.map(n => "  " + JSON.stringify(n)).join(",\n") + (list.length ? ",\n" : "") + "];\n"; }
// 舊寫法偵測：回傳錯誤訊息或 ""
function legacyProblem(srcFile = SRC) {
  if (!fs.existsSync(srcFile)) return "";
  return OLD_ARRAY.test(fs.readFileSync(srcFile, "utf8"))
    ? "shared/notices.js 裡又出現舊的 NOTICES 陣列（公告已經拆成 content/notices/<id>.json）。新公告請改用：npm run notice -- --area … --title … \"句子\"；已經插進 shared/notices.js 的，跑 node tools/content/notices_migrate.cjs 拆出去。"
    : "";
}
function write(dir = DIR, out = OUT, srcFile = SRC) {
  const bad = legacyProblem(srcFile); if (bad) throw new Error(bad);
  const { list, errors } = load(dir);
  if (errors.length) throw new Error("公告檔有問題：\n" + errors.join("\n"));
  const s = source(list);
  if (!fs.existsSync(out) || fs.readFileSync(out, "utf8") !== s) fs.writeFileSync(out, s);
  return list.length;
}
module.exports = { DIR, OUT, load, source, write, legacyProblem, sortKey };
if (require.main === module) {
  try {
    if (process.argv.includes("--check")) {
      const bad = legacyProblem(), { list, errors } = load();
      if (bad) errors.push(bad);
      if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
      console.log(`公告 ${list.length} 則，格式都對`);
    } else {
      const n = write();
      if (process.argv.includes("--verbose")) console.log(`寫好 shared/notices_data.js（${n} 則）`);
    }
  } catch (e) { console.error("✗ " + e.message); process.exit(1); }
}
