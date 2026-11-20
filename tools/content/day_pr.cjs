// 今天的 PR 說明和維護日誌草稿（11-16 每日排程優化：以前 Claude 另外寫 PR 說明、日誌 JSON，格式要翻 tools/content/new_doc.cjs，還要手動貼警告）
//   npm run day:pr                       照今天（day_plan 的判斷）和 git diff（相對 origin/main）產生：
//                                          PR 說明 <暫存資料夾>/museum_day_pr/pr_body.md   → npm run ship -- --body-file 這個檔
//                                          日誌草稿 <暫存資料夾>/museum_day_pr/log.json   → npm run doc:new -- 這個檔（類型「內容」）
//   npm run day:pr -- --date 2026-11-18 --out 某資料夾
// 內容：這次加了什麼（書、任務、特展、新房間、market）、揭露節奏（只寫「第 N 次」，不寫細節）、子主旨（只寫名字）、
//   day:check --strict 的結果、檢查程式的警告（要貼進 PR）。只寫看得到的名字，不寫謎底。
//   草稿不進 repo（放系統暫存資料夾），要補充的話改完再丟給 ship／doc:new。
const fs = require("fs"), os = require("os"), path = require("path");
const { spawnSync } = require("child_process");
const { asList, isObj } = require("./day_lib.cjs");
const ROOT = path.join(__dirname, "..", "..");

// 今天的檔摘要（純函式，測試用）
function summarizeDay(d) {
  if (!isObj(d)) return null;
  const works = asList(d.show && d.show.works);
  return {
    books: asList(d.books).map(b => ({ title: b.title || b.id, tag: b.ending ? "結局書" : /^main-s\d+$/.test(b.line || "") ? "主線章節書" : "" })),
    daily: asList(d.daily).map(t => t && t.kind).filter(Boolean),
    show: d.show && d.show.title || "", works: works.length, svg: works.filter(w => w && w.svg).length,
    adds: asList(d.adds).length, market: asList(d.market).length, real: asList(d.real).length, casino: isObj(d.casino),
  };
}
// 第幾次揭露：帳本已經是 revealed 的筆數（純函式，測試用）
const revealCount = ledger => asList(ledger && ledger.revealBeats && ledger.revealBeats.list).filter(b => b && b.status === "revealed" && !b.extra).length;
const subthemeNames = (ledger, rec) => {
  const list = asList(ledger && ledger.main && ledger.main.subthemes && ledger.main.subthemes.list), nm = id => (list.find(s => s && s.id === id) || {}).name || id;
  const st = rec && rec.subthemes; return st ? { main: st.main ? nm(st.main) : null, side: asList(st.side).map(nm) } : null;
};
// info：{ p, day, rec, ledger, files, strictOut（day:check --strict 的輸出）, warnings（警告字串陣列） }
function prBody(info) {
  const { p, day, rec, ledger, files = [], strictOut = "", warnings = [] } = info, s = summarizeDay(day), L = [];
  L.push("## 這次加了什麼", "", `- ${p.week} ${p.isMonday ? "週一（排這壹週：week.json、d1.json、靈感來源.md）" : `d${p.weekday}（${p.weekdayName}）的每日內容`}，日期 ${p.date}`);
  if (s) {
    L.push(`- 書 ${s.books.length} 本：${s.books.map(b => `《${b.title}》${b.tag ? "（" + b.tag + "）" : ""}`).join("、")}`);
    L.push(`- 每日任務 ${s.daily.length} 個（${s.daily.join("、")}）`);
    L.push(`- 今日特展《${s.show}》${s.works} 幅，其中 svg 新畫 ${s.svg} 幅${s.adds ? `；新房間 ${s.adds} 間` : "；沒有新房間"}`);
    L.push(`- 世界股市新聞 ${s.market} 則${p.market.weekend && !s.market ? "（週末休市）" : ""}；現實世界 real ${s.real} 則${s.casino ? "；賭場加碼壹段" : ""}`);
  }
  const other = files.filter(f => !/^content\/weeks\/.+\/(d\d|week)\.json$|靈感來源\.md$|^維護日誌\//.test(f));
  if (other.length) L.push(`- 另外改了：${other.slice(0, 8).join("、")}${other.length > 8 ? ` 等 ${other.length} 個檔` : ""}`);
  L.push("", "## 劇情節奏", "", `- ${p.beat.kind}${p.isBeatDay && p.beat.beat ? `；揭露節奏：第 ${revealCount(ledger)} 次` : ""}`);
  const st = subthemeNames(ledger, rec); if (st) L.push(`- 子主旨：主打 ${st.main || "（沒寫）"}${st.side.length ? "，陪襯 " + st.side.join("、") : ""}`);
  if (p.isMonday) L.push("- 靈感來源：見 content/weeks/" + p.week + "/靈感來源.md");
  L.push("", "## 檢查", "", "- `npm run day:check -- --strict`：" + (/✓ 全部通過/.test(strictOut) ? "全部通過" : strictOut ? "沒過，看下面" : "（沒跑到）"), "- 本機 npm test 和 build：只改內容時 ship 會跳過，CI 和部署照跑");
  if (warnings.length) L.push("", "## 檢查程式的警告（照貼）", "", ...warnings.map(w => `- ${w}`));
  else L.push("", "## 檢查程式的警告", "", "- 沒有警告");
  return L.join("\n") + "\n";
}
// 日誌草稿（new_doc.cjs 的 spec）
function logSpec(info) {
  const { p, day, files = [] } = info, s = summarizeDay(day);
  const scope = [...new Set(files.filter(f => f.startsWith("content/")))].slice(0, 12);
  return {
    topic: `每日劇情 ${p.week}${p.isMonday ? " 週一" : " d" + p.weekday}`, type: "內容", scope: scope.length ? scope : ["content/weeks/" + p.week],
    test: "npm run day:check -- --strict 通過；CI 全跑",
    ai: "Claude Opus 5.5（Claude Code 排程）",
    why: ["每日排程（決定 0031）：照帳本和 weeks.<週> 的安排，寫今天的內容"],
    changed: s ? [`${p.date}（${p.weekdayName}）：書 ${s.books.map(b => "《" + b.title + "》").join("、")}；每日任務 ${s.daily.length} 個；今日特展《${s.show}》${s.works} 幅（svg ${s.svg}）`, "帳本 content/story/帳本.json：今天的 hooks／ties／memes 等欄位用 ledger 腳本回填"] : ["（今天的檔沒有）"],
    checked: ["`npm run day:check -- --strict` 全部通過（內容 PR 本機跳過 npm test，CI 和部署照跑）"],
    todo: ["無。"], next: ["明天接今天 hooks 最後那行的鉤子"], related: ["docs/決定/0031-每週劇情全自動.md"],
  };
}

// ---------- 讀 git 和 day:check ----------
function changedFiles() {
  const git = args => spawnSync("git", ["-c", "core.quotepath=false", ...args], { cwd: ROOT, encoding: "utf8" }).stdout || "";
  const base = git(["merge-base", "origin/main", "HEAD"]).trim() || "origin/main";
  return [...new Set((git(["diff", "--name-only", base]) + "\n" + git(["ls-files", "--others", "--exclude-standard"])).split("\n").map(x => x.trim()).filter(Boolean))];
}
// day_check 輸出裡的警告行（純函式，測試用）
const warningLines = out => String(out || "").split("\n").map(x => x.trim()).filter(x => x.startsWith("警告 ")).map(x => x.slice(3));

function main() {
  const { load } = require("../../test/load_shared.cjs"), G = load(), a = process.argv.slice(2), opt = k => { const i = a.indexOf("--" + k); return i >= 0 ? a[i + 1] : undefined; };
  const { planDay, gatherFor } = require("./day_plan.cjs");
  const date = opt("date") || G.taipeiDay(Date.now()), ctx = gatherFor(date, G), p = planDay(ctx), pack = ctx.weeks[p.week];
  const day = pack && pack.days && pack.days[p.weekday] || null, rec = ctx.ledger && ctx.ledger.weeks && ctx.ledger.weeks[p.week] || null;
  const r = spawnSync(process.execPath, ["tools/content/day_check.cjs", "--strict", "--date", date], { cwd: ROOT, encoding: "utf8" }), out = (r.stdout || "") + (r.stderr || "");
  const info = { p, day, rec, ledger: ctx.ledger, files: changedFiles(), strictOut: out, warnings: warningLines(out) };
  const dir = opt("out") || path.join(os.tmpdir(), "museum_day_pr");
  fs.mkdirSync(dir, { recursive: true });
  const body = path.join(dir, "pr_body.md"), log = path.join(dir, "log.json");
  fs.writeFileSync(body, prBody(info)); fs.writeFileSync(log, JSON.stringify(logSpec(info), null, 2) + "\n");
  console.log(`PR 說明：${body}\n日誌草稿：${log}\n`);
  console.log(`接著：\n  npm run doc:new -- "${log}"\n  npm run ship -- --title "週劇情 ${p.week}${p.isMonday ? "" : " d" + p.weekday}" --body-file "${body}" --no-notice --after-deploy "gh workflow run discord-scheduled.yml --ref main"`);
  if (r.status !== 0) console.log("\n⚠ day:check --strict 沒過（PR 說明已經標「沒過」）：先改到過再 ship。");
}
if (require.main === module) { try { main(); } catch (e) { console.error("✗ " + e.message); process.exit(1); } }
module.exports = { summarizeDay, revealCount, subthemeNames, prBody, logSpec, warningLines };
