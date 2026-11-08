// 換下一個版本號：npm run version:bump
// 版本號是「台灣日期-當天第幾次」，例如 2026.11.08-1、2026.11.08-2；隔天從 -1 開始。
// 部署前換一次，設定頁和管理介面看得到現在是哪一版；同時在 git 打一樣名字的標籤（tag）。
const fs = require("fs"), path = require("path");

const file = path.join(__dirname, "..", "version.json");
const cur = JSON.parse(fs.readFileSync(file, "utf8")).version || "";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" })
  .format(new Date()).replace(/-/g, ".");
const m = cur.match(/^(\d{4}\.\d{2}\.\d{2})-(\d+)$/);
const next = m && m[1] === today ? `${today}-${+m[2] + 1}` : `${today}-1`;
fs.writeFileSync(file, JSON.stringify({ version: next }) + "\n");
console.log(`${cur || "（沒有）"} → ${next}`);
