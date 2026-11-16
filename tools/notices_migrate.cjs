// 把舊的 shared/notices.js 裡的 NOTICES 陣列拆成 content/notices/<id>.json（一則一個檔），並把 notices.js 改成從 notices_data.js 讀。
//   node tools/notices_migrate.cjs        可以重跑：如果 shared/notices.js 又被帶回舊陣列（例如別的 PR 在拆檔前插了新公告、
//                                         合併後衝突，解掉衝突時留下 main 那一份），再跑一次就會把裡面的公告全拆出去（照陣列順序編 order）。
//   已經是新寫法（沒有陣列）就什麼都不做。
// 同一個 id 出現兩次（拆檔前有兩組）：留 v 比較大的，一樣大就留先出現的；位置用先出現的。印出來給人看。
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "shared", "notices.js");
const START = "export const NOTICES = [\n";

function extract(src) {
  const a = src.indexOf(START);
  if (a < 0) return null;
  const b = src.indexOf("\n];\n", a);
  if (b < 0) throw new Error("找不到 NOTICES 陣列的結尾（\\n];）");
  const list = new Function("return " + src.slice(a + "export const NOTICES = ".length, b + 3))();
  return { a, end: b + 4, list };
}
// 去重：回傳 { items: [{ n, order }], dups: [id] }
function dedupe(list) {
  const first = new Map(), best = new Map(), dups = [];
  list.forEach((n, i) => {
    if (!first.has(n.id)) { first.set(n.id, i); best.set(n.id, n); return; }
    if (!dups.includes(n.id)) dups.push(n.id);
    if ((n.v || 1) > (best.get(n.id).v || 1)) best.set(n.id, n);
  });
  return { items: [...first.entries()].map(([id, i]) => ({ n: best.get(id), order: i })), dups };
}
function fileText(n, order) { return JSON.stringify({ ...n, order }, null, 2) + "\n"; }
// 寫檔；回傳 { added, changed, same }
function writeFiles(items, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const r = { added: 0, changed: 0, same: 0 };
  for (const { n, order } of items) {
    const f = path.join(dir, n.id + ".json"), t = fileText(n, order);
    if (!fs.existsSync(f)) { fs.writeFileSync(f, t); r.added++; }
    else if (fs.readFileSync(f, "utf8") !== t) { fs.writeFileSync(f, t); r.changed++; }
    else r.same++;
  }
  return r;
}
const IMPORT = "// 公告資料：content/notices/<id>.json → tools/notices_build.cjs 合成這個檔（不進 git）\nimport { NOTICES_DATA } from \"./notices_data.js\";\n";
const REPLACEMENT = "// 館方公告的資料：一則一個檔 content/notices/<id>.json（npm run notice 加新的），tools/notices_build.cjs 合成 shared/notices_data.js\nexport const NOTICES = NOTICES_DATA;\n";
function rewriteSource(src, ex) {
  let out = src.slice(0, ex.a) + REPLACEMENT + src.slice(ex.end);
  if (!out.includes(IMPORT)) out = out.replace(/(import \{ holidayNotices \} from "\.\/holidays\.js";\n)/, "$1" + IMPORT);
  return out;
}
function migrate(srcFile = SRC, dir = path.join(ROOT, "content", "notices")) {
  const src = fs.readFileSync(srcFile, "utf8"), ex = extract(src);
  if (!ex) return null;
  const { items, dups } = dedupe(ex.list), r = writeFiles(items, dir);
  fs.writeFileSync(srcFile, rewriteSource(src, ex));
  return { total: ex.list.length, files: items.length, dups, ...r, ids: items.map(x => x.n.id) };
}
// 舊寫法的 notices.js 文字（例如拆檔前開的分支）：裡面 content/notices 還沒有的公告拆成檔（沒有 order、at = 現在，排在最前面）。回傳新增的 id
function rescue(oldSrc, dir = path.join(ROOT, "content", "notices")) {
  const ex = extract(oldSrc);
  if (!ex) return [];
  fs.mkdirSync(dir, { recursive: true });
  const added = [], at = new Date().toISOString();
  for (const { n } of dedupe(ex.list).items) {
    const f = path.join(dir, n.id + ".json");
    if (fs.existsSync(f)) continue;
    fs.writeFileSync(f, JSON.stringify({ ...n, at }, null, 2) + "\n");
    added.push(n.id);
  }
  return added;
}
module.exports = { extract, dedupe, writeFiles, migrate, fileText, rescue };
if (require.main === module) {
  try {
    const r = migrate();
    if (!r) { console.log("shared/notices.js 已經是新寫法（沒有 NOTICES 陣列），不用拆。"); process.exit(0); }
    console.log(`拆好了：陣列 ${r.total} 則 → ${r.files} 個檔（新 ${r.added}、改 ${r.changed}、沒變 ${r.same}）`);
    if (r.dups.length) console.log("重複的 id（只留一份）：" + r.dups.join("、"));
    require("./notices_build.cjs").write();
    console.log("shared/notices_data.js 也產生了。");
  } catch (e) { console.error("✗ " + e.message); process.exit(1); }
}
