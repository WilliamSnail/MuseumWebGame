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
// 草稿（W5）：從集團的狀態變化產生「某某減薪了」這類已經發生的新聞，給排程挑、改寫；不寫檔。events 來自 whNews（house.wh.ev），units 是名單（用名字和旗下股票）。
// 每則 { title, line, tone, ref, command }：command 是可以直接貼的 world:news add；寫進去之前仍會過 checkItem。
const DRAFT = { cut: { t: "減薪", line: "那邊的人說近來手頭比較緊。", tone: "down" }, squeeze: { t: "緊縮", line: "那邊的開銷收得很緊。", tone: "down" }, layoff: { t: "裁員", line: "那邊傳出壹批人要離開。", tone: "down" }, normal: { t: "恢復正常", line: "那邊的氣氛輕鬆了些。", tone: "up" } };
function draft(events, units, week = "<週>", day = "<幾>") {
  const by = new Map(units.map(u => [u.id, u]));
  return events.filter(e => DRAFT[e.to] && by.has(e.unit)).map(e => {
    const u = by.get(e.unit), d = DRAFT[e.to], title = u.name + d.t, ref = (u.stocks || []).slice(0, 3);
    return { title, line: u.name + d.line.replace("那邊", ""), tone: d.tone, ref, day: e.day, command: `npm run world:news -- add --week ${week} --day ${day} --title ${title} --line ${u.name}${d.line.replace("那邊", "")} --tone ${d.tone}${ref.length ? " --ref " + ref.join(",") : ""}` };
  });
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
module.exports = { main, checkItem, draft };
if (require.main === module && process.argv[2] === "draft") { // npm run world:news -- draft [--b -1] [--weeks 6] [--week 2026-W47 --day 3]
  try {
    const o = parse(process.argv.slice(3)), L = require("./world_lib.cjs"), { load } = require("../test/load_shared.cjs"), G = load({ __realMoney: true }), SM = require("./world_sim.cjs");
    const r = SM.sim(G, L.readNpcs(), { days: Math.max(1, Math.min(52, +o.weeks || 6)) * 7, b: o.b }), C = ctx(), us = L.readUnits();
    const items = draft(G.whNews(r.house, r.house.wh.day, 14), us, o.week, o.day), bad = [];
    items.forEach((x, i) => { const e = checkItem({ title: x.title, line: x.line, tone: x.tone, ref: x.ref }, C); if (e.length) bad.push(`${x.title}：${e.join("；")}`); console.log(`${i + 1}. [${x.tone}] ${x.title}｜${x.line}｜${x.day}
   ${x.command}`); });
    if (!items.length) console.log("最近兩週沒有集團換狀態，沒有草稿。"); if (bad.length) { bad.forEach(m => console.log("✗ 草稿不合格：" + m)); process.exit(1); }
    console.log("（草稿是模擬景氣算出來的，排程要看真的景氣再挑、改寫；不要照抄當成真的事件。）");
  } catch (e) { console.error("✗ " + e.message); process.exit(1); }
  return;
}
if (require.main === module && process.argv[2] !== "draft") { try { main(process.argv.slice(2)); } catch (e) { console.error("✗ " + e.message); process.exit(1); } }
