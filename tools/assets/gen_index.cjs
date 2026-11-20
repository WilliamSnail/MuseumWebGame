// 素材索引的清單部分：掃 web/public 和 web/src/assets 的圖，照用途分類，寫進 docs/素材/素材索引.md 的 AUTO 區。
// 用法：node tools/assets/gen_index.cjs        新增素材之後跑壹次（要改說明、用途、來源，改 docs/素材/素材標註.json 的規則）
//       node tools/assets/gen_index.cjs --check  只檢查：索引是不是最新、有幾個沒標註（npm test 可以接）
// 每個成品壹行：路徑、尺寸、是什麼、用途、現在哪些畫面用、從哪張原圖切的。「用在」是自動 grep web/src 找的。
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const INDEX = path.join(ROOT, "docs", "素材", "素材索引.md"), NOTES = path.join(ROOT, "docs", "素材", "素材標註.json");
const DIRS = ["web/public", "web/src/assets"], EXT = /\.(webp|png|jpe?g|svg)$/i;
const START = "<!-- AUTO:START（tools/assets/gen_index.cjs 產生，不要手改；改 docs/素材/素材標註.json） -->", END = "<!-- AUTO:END -->";

const walk = d => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : [];
function dims(p) { // 不靠套件讀圖片的寬高（png、webp、jpg）
  try {
    const b = fs.readFileSync(p);
    if (b.slice(1, 4).toString() === "PNG") return `${b.readUInt32BE(16)}×${b.readUInt32BE(20)}`;
    if (b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP") {
      const t = b.slice(12, 16).toString();
      if (t === "VP8 ") return `${b.readUInt16LE(26) & 0x3fff}×${b.readUInt16LE(28) & 0x3fff}`;
      if (t === "VP8L") { const v = b.readUInt32LE(21); return `${(v & 0x3fff) + 1}×${((v >> 14) & 0x3fff) + 1}`; }
      if (t === "VP8X") return `${(b.readUIntLE(24, 3)) + 1}×${(b.readUIntLE(27, 3)) + 1}`;
    }
    if (b[0] === 0xff && b[1] === 0xd8) { let i = 2; while (i < b.length) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1]; if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return `${b.readUInt16BE(i + 7)}×${b.readUInt16BE(i + 5)}`; i += 2 + b.readUInt16BE(i + 2); } }
  } catch (e) { /* 讀不到就空著 */ }
  return "";
}
// 用途分類（照檔名和資料夾猜；標註檔裡寫了 cat 就用標註的）
const CATS = ["框和邊條", "底和材質", "按鈕和標籤", "圖示和印章", "人物頭像", "品項和道具插畫", "房間和場景插畫", "怪物和特效", "地圖零件", "其他"];
function guessCat(rel) {
  const n = path.basename(rel).toLowerCase();
  if (/giver-/.test(n)) return "人物頭像";
  if (/\/map\//.test(rel)) return "地圖零件";
  if (/(foe-|fx-)/.test(n)) return "怪物和特效";
  if (/(stage-|land|port|^bg|room|map-b|nav-)/.test(n) && !/icon|ic-/.test(n)) return /nav-/.test(n) ? "圖示和印章" : "房間和場景插畫";
  if (/(food-|prop-|ped-|door|key|lantern|medallion)/.test(n)) return "品項和道具插畫";
  if (/(btn|button|tab|step-|tag|chip)/.test(n)) return "按鈕和標籤";
  if (/(corner|edge|bar|frame|9\.|orn|border|panel|banner|ribbon|scroll|notice|clip|rivet)/.test(n)) return "框和邊條";
  if (/(fill|tile|parch|counter|board|stone|wine|texture|card|damask|bg)/.test(n)) return "底和材質";
  if (/(icon|ic-|st-|seal|coin|ticket|dot|gem|lock|ring|medal|badge)/.test(n)) return "圖示和印章";
  return "其他";
}
function main() {
  const files = DIRS.flatMap(d => walk(path.join(ROOT, d))).filter(f => EXT.test(f)).map(f => path.relative(ROOT, f).split(path.sep).join("/")).sort();
  const notes = fs.existsSync(NOTES) ? JSON.parse(fs.readFileSync(NOTES, "utf8")).rules : [];
  const rules = notes.map(r => Object.assign({}, r, { re: new RegExp(r.match) }));
  const srcText = walk(path.join(ROOT, "web", "src")).filter(f => /\.(js|css|html)$/.test(f)).map(f => ({ f: path.relative(path.join(ROOT, "web", "src"), f).split(path.sep).join("/"), t: fs.readFileSync(f, "utf8") }));
  const idx = path.join(ROOT, "web", "index.html"); if (fs.existsSync(idx)) srcText.push({ f: "index.html", t: fs.readFileSync(idx, "utf8") });
  const usedBy = rel => {
    const pub = rel.replace(/^web\/public/, ""), base = path.basename(rel);
    const hit = srcText.filter(s => s.t.includes(pub) || (rel.startsWith("web/src/assets") && s.t.includes("assets/" + rel.split("/assets/")[1]))).map(s => s.f);
    return [...new Set(hit)].slice(0, 3).join("、");
  };
  const rows = files.map(rel => {
    const r = rules.find(x => x.re.test(rel)) || {};
    return { rel, dim: dims(path.join(ROOT, rel)), cat: r.cat || guessCat(rel), what: r.what || "", use: r.use || "", from: r.from || "", used: usedBy(rel), noted: !!r.what };
  });
  // 同一組（同樣的說明）收成壹行：檔名用「、」接起來，免得清單長到沒人看
  const out = [`共 ${rows.length} 個成品，${rows.filter(r => r.noted).length} 個有標註說明（沒標註的在最下面「待標註」）。`, ""];
  for (const cat of CATS) {
    const rs = rows.filter(r => r.cat === cat && r.noted); if (!rs.length) continue;
    out.push(`### ${cat}`, "", "| 檔（web/public 底下） | 尺寸 | 是什麼 | 可以用在 | 現在哪些畫面用 | 從哪切的 |", "|---|---|---|---|---|---|");
    const groups = new Map();
    rs.forEach(r => { const k = [r.what, r.use, r.from, r.used].join("|"); (groups.get(k) || groups.set(k, []).get(k)).push(r); });
    for (const g of groups.values()) {
      const a = g[0], names = g.map(r => "`" + r.rel.replace(/^web\/(public\/)?/, "") + "`").join("、");
      out.push(`| ${names} | ${[...new Set(g.map(r => r.dim))].join("、")} | ${a.what} | ${a.use} | ${a.used || "（還沒接）"} | ${a.from} |`);
    }
    out.push("");
  }
  const todo = rows.filter(r => !r.noted);
  if (todo.length) { out.push("### 待標註（還沒寫說明；寫在 docs/素材/素材標註.json 的規則裡）", "", todo.map(r => "`" + r.rel.replace(/^web\/(public\/)?/, "") + "`（猜是：" + r.cat + "）").join("、"), ""); }
  const block = `${START}\n${out.join("\n")}\n${END}`;
  let doc = fs.readFileSync(INDEX, "utf8");
  const a = doc.indexOf("<!-- AUTO:START"), b = doc.indexOf(END);
  const next = a >= 0 && b > a ? doc.slice(0, a) + block + doc.slice(b + END.length) : doc.replace(/\s*$/, "\n\n## 全部成品（自動產生）\n\n") + block + "\n";
  if (process.argv.includes("--check")) {
    if (next !== doc) { console.error("素材索引不是最新：跑 node tools/assets/gen_index.cjs"); process.exit(1); }
    console.log(`素材索引是最新（${rows.length} 個成品，${todo.length} 個沒標註）`); return;
  }
  fs.writeFileSync(INDEX, next);
  console.log(`寫好 docs/素材/素材索引.md：${rows.length} 個成品，${todo.length} 個沒標註`);
}
main();
