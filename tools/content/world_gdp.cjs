// 已知世界的台灣總體經濟數字（content/economy.json）：node tools/content/world_gdp.cjs …（npm run world:gdp -- …）。決定 0086、規劃 docs/規劃/世界經濟規劃.md 第 7 節。
// 每日排劇情的排程只在「主計總處有新公布」時才用；沒有新公布就不要跑。不再手改 JSON：這支檢查格式、自動推 history、不讓日期倒退，再寫檔（JSON、縮排 2、結尾有換行）。
//   npm run world:gdp -- --quarter 2026Q4 --yoy 13.1 --published 2026-11-27 [--kind 初步統計] [--note 說明]
//   npm run world:gdp -- --quarter 2026Q3 --yoy 14.5 --published 2026-11-27 --kind 初步統計          同一季的修正：換掉最後一個
//   npm run world:gdp -- --nominal-year 26000000000000 --nominal-as-of 2026Q2 --source 主計總處        只記名目 GDP（台幣，一年）
//   --dry 只印差異不寫；--force：名目 GDP 一次變動超過 ±10% 時要加。只改 repo 的檔案，不碰正式站。
// 會擋：季別格式不對或比現在的舊、年增率不在 −30～40、公布日不是日期或比現在的早、history 超過 8 個、名目 GDP 不是正數或變動太大。
const fs = require("fs"), path = require("path");
const FILE = path.join(__dirname, "..", "..", "content", "economy.json");
const qn = q => { const m = /^(\d{4})Q([1-4])$/.exec(q || ""); return m ? +m[1] * 4 + +m[2] : null; };
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || "") && !isNaN(Date.parse(s));
function parse(argv) { const o = {}; for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a === "--dry" || a === "--force") o[a.slice(2)] = true; else if (a.startsWith("--")) o[a.slice(2)] = argv[++i]; else throw new Error(`看不懂「${a}」`); } return o; }
// 回傳新的 economy 物件（不寫檔）；錯了丟 Error
function apply(econ, o) {
  const e = JSON.parse(JSON.stringify(econ)), g = e.gdp;
  const wantQ = o.quarter !== undefined || o.yoy !== undefined || o.published !== undefined || o.kind !== undefined;
  if (wantQ) {
    if (o.quarter === undefined || o.yoy === undefined || o.published === undefined) throw new Error("更新 GDP 年增率要同時給 --quarter、--yoy、--published");
    const q = qn(o.quarter), cur = qn(g.quarter), yoy = +o.yoy;
    if (q === null) throw new Error(`季別「${o.quarter}」格式要像 2026Q4`);
    if (cur !== null && q < cur) throw new Error(`季別 ${o.quarter} 比現在的 ${g.quarter} 舊，不能倒退`);
    if (!Number.isFinite(yoy) || yoy <= -30 || yoy >= 40) throw new Error(`年增率 ${o.yoy} 要在 −30 到 40 之間（百分點，數字）`);
    if (!isDate(o.published)) throw new Error(`公布日「${o.published}」格式要像 2026-11-27`);
    if (g.published && o.published < g.published) throw new Error(`公布日 ${o.published} 比現在的 ${g.published} 早，不能倒退`);
    const h = Array.isArray(g.history) ? g.history.slice() : [];
    if (q === cur) h[h.length - 1] = yoy; else h.push(yoy);
    while (h.length > 4) h.shift(); // 近四季
    g.quarter = o.quarter; g.yoy = yoy; g.history = h; g.published = o.published;
    if (o.kind !== undefined) g.kind = o.kind;
    if (o.note !== undefined) g.note = o.note;
  }
  if (o["nominal-year"] !== undefined) {
    const v = +o["nominal-year"];
    if (!Number.isFinite(v) || v <= 0) throw new Error("--nominal-year 要是正數（台幣，一年）");
    const old = g.nominalYear;
    if (old && Math.abs(v - old) / old > 0.1 && !o.force) throw new Error(`名目 GDP 從 ${old} 變成 ${v}（超過 ±10%）：確定的話加 --force`);
    g.nominalYear = v;
    if (o["nominal-as-of"] !== undefined) g.nominalAsOf = o["nominal-as-of"];
    if (o.source !== undefined) g.source = o.source;
  }
  if (!wantQ && o["nominal-year"] === undefined) throw new Error("沒有要改的：給 --quarter/--yoy/--published，或 --nominal-year");
  if (!(g.history.length >= 2 && g.history.length <= 8) || g.history[g.history.length - 1] !== g.yoy) throw new Error("history 要有 2～8 個，而且最後一個等於 yoy");
  return e;
}
function main(argv, file = FILE, log = console.log) {
  const o = parse(argv), old = JSON.parse(fs.readFileSync(file, "utf8")), next = apply(old, o);
  const diff = []; for (const k of Object.keys(next.gdp)) if (JSON.stringify(next.gdp[k]) !== JSON.stringify(old.gdp[k])) diff.push(`  ${k}：${JSON.stringify(old.gdp[k])} → ${JSON.stringify(next.gdp[k])}`);
  if (!diff.length) { log("沒有差異，沒改。"); return next; }
  log((o.dry ? "（只印不寫）" : "✓ 寫好了 ") + "content/economy.json\n" + diff.join("\n"));
  if (!o.dry) fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
  return next;
}
module.exports = { main, apply };
if (require.main === module) { try { main(process.argv.slice(2)); } catch (e) { console.error("✗ " + e.message); process.exit(1); } }
