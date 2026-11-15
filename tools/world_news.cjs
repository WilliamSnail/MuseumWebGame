// 世界股市新聞（每天 dN.json 的 market）的寫入：node tools/world_news.cjs …（npm run world:news -- …）。決定 0086；規矩在 content/排程說明.md 一之十、tools/week_check.cjs。
// 排程不再手改 JSON：一則一則加，每則先檢查（字數、tone、ref、真實名字和預測買賣的字、數字、符號），加滿 3～5 則用 check 確認。
//   npm run world:news -- add --week 2026-W47 --day 3 --title 標題 --line 內容 --tone up|down|flat [--ref handbrain,greeneye]
//   npm run world:news -- list --week 2026-W47 --day 3
//   npm run world:news -- check --week 2026-W47 --day 3     要 3～5 則（沒有合適的就整個不寫，不要湊數）
//   npm run world:news -- clear --week 2026-W47 --day 3     整個 market 拿掉
//   加 --dry 只印不寫。備用的一天（spare）不能寫。只改 repo 的檔案。
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
function parse(argv) { const o = { _: [] }; for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a === "--dry") o.dry = true; else if (a.startsWith("--")) o[a.slice(2)] = argv[++i]; else o._.push(a); } return o; }
const len = s => [...String(s)].length;
// 檢查一則。回傳錯誤字串陣列
function checkItem(x, { W, stockIds, names, banned }) {
  const e = [];
  if (!x || typeof x !== "object") return ["要是 { title, line, tone, ref }"];
  Object.keys(x).filter(k => !["title", "line", "tone", "ref"].includes(k)).forEach(k => e.push(`不認得的欄位「${k}」`));
  for (const [k, max] of [["title", W.title], ["line", W.line]]) { const t = x[k]; if (typeof t !== "string" || !t.trim() || len(t) > max) e.push(`${k} 要是 1～${max} 字`); }
  if (!W.tones.includes(x.tone)) e.push(`tone 要是 ${W.tones.join("、")} 其中一個`);
  if (x.ref !== undefined) { const r = Array.isArray(x.ref) ? x.ref : [x.ref]; if (r.length > 3) e.push("ref 最多 3 個"); r.forEach(id => { if (!stockIds.includes(id)) e.push(`ref「${id}」不是館外股票 id（${stockIds.join("、")}）`); }); }
  [x.title, x.line].forEach(t => {
    if (typeof t !== "string") return;
    const bare = names.reduce((a, n) => a.split(n).join(""), t), hit = banned.find(b => bare.includes(b));
    if (hit) e.push(`有不能寫的字「${hit}」（真實名字、預測、買賣建議）`);
    if (/[0-9０-９%％]/.test(t)) e.push("不要寫數字和百分比（不能像真實的價格）");
    if (/[@<>`*_~|\\]|:\/\//.test(t)) e.push("不要有連結、@、markdown 符號");
    if (/[A-Za-z]/.test(t)) e.push("畫面不寫英文字母");
  });
  return e;
}
function ctx() {
  const { load } = require("../test/load_shared.cjs"), G = load(), { MARKET_BANNED } = require("./week_check.cjs");
  return { W: G.WORLD_NEWS, stockIds: G.OUT_STOCKS.map(s => s.id), names: G.OUT_STOCKS.map(s => s.name).concat(G.IN_STOCKS.map(s => s.name)), banned: MARKET_BANNED };
}
function main(argv, weeksDir = path.join(ROOT, "content", "weeks"), c = null, log = console.log) {
  const o = parse(argv), cmd = o._[0], C = c || ctx();
  if (!o.week || !o.day) throw new Error("要寫 --week 2026-W47 --day 3");
  const file = path.join(weeksDir, o.week, `d${+o.day}.json`);
  if (!fs.existsSync(file)) throw new Error(`沒有 ${path.relative(ROOT, file)}`);
  const raw = fs.readFileSync(file, "utf8"), d = JSON.parse(raw), tail = raw.endsWith("\n") ? "\n" : "";
  if (d.spare) throw new Error("備用的一天不能寫 market（那不是真的某一天）");
  const save = () => { if (!o.dry) fs.writeFileSync(file, JSON.stringify(d, null, 2) + tail); };
  const list = Array.isArray(d.market) ? d.market : [];
  if (cmd === "list") { list.forEach((x, i) => log(`${i + 1}. [${x.tone}] ${x.title}｜${x.line}${x.ref ? "｜" + [].concat(x.ref).join(",") : ""}`)); log(`${list.length} 則`); return list; }
  if (cmd === "check") { const errs = []; if (list.length < C.W.min || list.length > C.W.max) errs.push(`要 ${C.W.min}～${C.W.max} 則（現在 ${list.length}；沒有合適的就整個不寫）`); list.forEach((x, i) => checkItem(x, C).forEach(m => errs.push(`第 ${i + 1} 則：${m}`))); if (errs.length) throw new Error(errs.join("\n  ")); log(`✓ ${list.length} 則都對`); return list; }
  if (cmd === "clear") { delete d.market; save(); log((o.dry ? "（只印不寫）" : "✓ ") + "market 拿掉了"); return []; }
  if (cmd === "add") {
    const x = { title: o.title, line: o.line, tone: o.tone }; if (o.ref) x.ref = o.ref.split(",").filter(Boolean);
    const errs = checkItem(x, C); if (errs.length) throw new Error("這則不合格，沒寫：\n  " + errs.join("\n  "));
    if (list.some(y => y.title === x.title || y.line === x.line)) throw new Error("同一天內容不重複");
    if (list.length >= C.W.max) throw new Error(`最多 ${C.W.max} 則`);
    d.market = list.concat([x]); save(); log((o.dry ? "（只印不寫）" : "✓ 寫好了 ") + `第 ${d.market.length} 則：${x.title}`); return d.market;
  }
  throw new Error("用法：add --week --day --title --line --tone [--ref]｜list｜check｜clear（加 --dry 只印不寫）");
}
module.exports = { main, checkItem };
if (require.main === module) { try { main(process.argv.slice(2)); } catch (e) { console.error("✗ " + e.message); process.exit(1); } }
