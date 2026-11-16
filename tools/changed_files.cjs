// 「這次只改內容嗎」的判斷（11-16 每日排程優化二；以前寫在 tools/ship.cjs，現在 ship 和 CI 共用這壹份）
//   isContentFile(檔名)   內容路徑：content/、維護日誌/、.claude/（交接檔，不進遊戲），以及 shared/notices.js，
//                         和從 content 打包出來的 shared/npc_roster.js、shared/map_data.js
//   contentOnly(檔案清單) 每個檔案都在內容路徑裡才算；空的清單不算（沒東西就照舊全跑）
//   skipSlowEcon(檔案清單, 事件)  CI 要不要跳過最慢的那項「經濟自我檢查腳本」（約 114 秒）：
//                         只有「pull_request 而且只改內容」才跳過；其他事件（push 到 main、手動、部署前的最後一道）壹律全跑
//
// 在 CI 裡用：
//   node tools/changed_files.cjs --base origin/main --github-env
//   → 用 git diff 跟 base 比對；只改內容就把 SKIP_SLOW_ECON=1 寫進 $GITHUB_ENV，後面的 npm test（test/run_all.cjs）會跳過那壹項並印壹行說明。
//   任何壹步出問題（git 失敗、沒有 base、清單是空的）都不跳過：寧可多跑 2 分鐘，不要漏測。
//   --event NAME  事件名稱（預設拿環境變數 GITHUB_EVENT_NAME）。不是 pull_request 壹律不跳過。
const { spawnSync } = require("child_process");
const fs = require("fs"), path = require("path");

const CONTENT_PATH = /^(content\/|維護日誌\/|\.claude\/)|^shared\/(notices|npc_roster|map_data)\.js$/;
const norm = f => String(f || "").split("\\").join("/");
const isContentFile = f => CONTENT_PATH.test(norm(f));
const contentOnly = files => { const f = (files || []).filter(Boolean); return f.length > 0 && f.every(isContentFile); };
const skipSlowEcon = (files, event) => event === "pull_request" && contentOnly(files);

// git diff --name-only <base>...HEAD；失敗回 null（呼叫的人就不跳過）
function diffFiles(base, cwd) {
  const r = spawnSync("git", ["-c", "core.quotepath=false", "diff", "--name-only", `${base}...HEAD`], { cwd, encoding: "utf8" });
  if (r.error || r.status !== 0) return null;
  return r.stdout.split("\n").map(s => s.trim()).filter(Boolean);
}

function main() {
  const a = process.argv.slice(2), val = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  const base = val("--base"), event = val("--event") || process.env.GITHUB_EVENT_NAME || "";
  const root = val("--repo") || path.join(__dirname, ".."); // --repo：測試用，指到暫存的 git 資料夾
  if (!base) { console.log("沒給 --base：全跑，不跳過任何測試。"); return; }
  const files = diffFiles(base, root);
  if (!files) { console.log(`讀不到跟 ${base} 的差異：全跑，不跳過任何測試。`); return; }
  const skip = skipSlowEcon(files, event);
  console.log(`改了 ${files.length} 個檔（事件：${event || "沒有"}）：${skip ? "只改內容，之後的 npm test 會跳過經濟自我檢查（SKIP_SLOW_ECON=1）" : contentOnly(files) ? "只改內容，但這個事件要全跑" : "有程式檔，全跑"}`);
  if (skip && a.includes("--github-env")) {
    if (!process.env.GITHUB_ENV) throw new Error("--github-env 要在 GitHub Actions 裡用（沒有 GITHUB_ENV）");
    fs.appendFileSync(process.env.GITHUB_ENV, "SKIP_SLOW_ECON=1\n");
  }
}
if (require.main === module) { try { main(); } catch (e) { console.error("✗ " + e.message); process.exit(1); } }
module.exports = { CONTENT_PATH, isContentFile, contentOnly, skipSlowEcon, diffFiles };
