// 重新產生 維護日誌/README.md（總表）：npm run log:index
// 加 --check：只檢查總表是不是最新的，不寫檔（CI 用）
const fs = require("fs"), path = require("path");
const { ROOT, LOG_DIR, listLogs, parse } = require("./log_lib.cjs");

// 排序用固定的字碼順序，不用 localeCompare：不同版本的 Node 排中文不一樣（11-08：這台電腦 Node 24 過、GitHub 的 Node 22 說總表不是最新的）
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);

function build() {
  const rows = listLogs().map(f => {
    const p = parse(fs.readFileSync(f, "utf8"));
    const m = p ? p.meta : {};
    const rel = path.relative(LOG_DIR, f).split(path.sep).join("/");
    const topic = path.basename(f, ".md").split("_").slice(2).join("_");
    return { date: m.日期 || "", file: rel, line: `| ${m.日期 || "?"} | ${m.作者 || "?"} | ${m.AI || "?"} | ${m.類型 || "?"} | [${topic}](${encodeURI(rel)}) | ${m.狀態 || "?"} | ${m.版本 || "?"} |` };
  }).sort((a, b) => cmp(b.date + b.file, a.date + a.file));
  return [
    "# 維護日誌總表",
    "",
    "> 這個檔是程式產生的（`npm run log:index`），**不要手改**。要寫日誌，照 `範本.md` 在 `年份/` 資料夾新增一篇，再跑一次 `npm run log:index`。",
    "",
    "| 日期 | 作者 | AI | 類型 | 主題 | 狀態 | 版本 |",
    "|---|---|---|---|---|---|---|",
    ...rows.map(r => r.line),
    "",
  ].join("\n");
}

const out = path.join(LOG_DIR, "README.md");
const text = build();
if (process.argv.includes("--check")) {
  const now = fs.existsSync(out) ? fs.readFileSync(out, "utf8").replace(/\r\n/g, "\n") : "";
  if (now !== text) { console.error("維護日誌/README.md 不是最新的：請跑 npm run log:index"); process.exit(1); }
  console.log("總表是最新的");
} else {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(out, text);
  console.log(`寫好 ${path.relative(ROOT, out)}（${listLogs().length} 篇）`);
}
