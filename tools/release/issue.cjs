// 開 GitHub Issue（11-16 每日排程優化）：排程失敗時要「開 Issue 告訴翊文」，但雲端環境擋 GraphQL，gh issue create 跑不起來。
// 這個走 REST（POST /repos/{owner}/{repo}/issues，用 tools/release/gh_lib.cjs 的 gh api），雲端也能開。
//   npm run issue -- "標題" "內文"
//   npm run issue -- "標題" --body-file 檔案.md      內文太長時放檔案
//   npm run issue -- "標題" "內文" --label 排程      加標籤（沒有這個標籤 GitHub 會自動建；可以不加）
// 內文不用寫連結和 @人名（@ 會通知對方）；寫哪一天、哪一步、錯誤訊息最後幾行。印出 Issue 的網址。
const fs = require("fs");
const { ghRun, REPO } = require("./gh_lib.cjs");

// 把指令列整理成 { title, body, labels }（純函式，測試用）。打錯就丟錯，不會默默開出壞的 Issue
function parseArgs(argv) {
  const pos = [], o = { labels: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--body-file" || a === "--label") {
      if (argv[i + 1] === undefined) throw new Error(`${a} 後面要有內容`);
      if (a === "--label") o.labels.push(argv[++i]); else o.bodyFile = argv[++i];
    } else if (a.startsWith("--")) throw new Error(`沒有 ${a} 這個選項`);
    else pos.push(a);
  }
  o.title = String(pos[0] || "").trim();
  o.body = o.bodyFile ? fs.readFileSync(o.bodyFile, "utf8") : pos[1] !== undefined ? String(pos[1]) : "";
  if ([...o.title].length < 4) throw new Error('標題要寫清楚（至少 4 個字）：npm run issue -- "標題" "內文"');
  if (!o.body.trim()) throw new Error("內文不能空：寫哪一天、哪一步、為什麼（或 --body-file 檔案）");
  return { title: o.title, body: o.body.trim() + "\n", labels: o.labels };
}
// gh api 的參數（純函式，測試用）：-f 是字串欄位，內文含換行、引號都安全
function apiArgs(issue, repo = REPO) {
  return ["api", "-X", "POST", `repos/${repo}/issues`, "-f", `title=${issue.title}`, "-f", `body=${issue.body}`, ...issue.labels.flatMap(l => ["-f", `labels[]=${l}`]), "--jq", ".html_url"];
}
function create(issue) { return ghRun(apiArgs(issue)).out; }

if (require.main === module) {
  try { console.log("✓ 開好了：" + create(parseArgs(process.argv.slice(2)))); } catch (e) { console.error("✗ " + e.message); process.exit(1); }
}
module.exports = { parseArgs, apiArgs, create };
