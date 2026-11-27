// 兩份狀態頁的寫法（11-27，翊文同意參考 hub 寫法；npm test 會擋）：
//   docs/現況.md：要有「## 現況」，底下的條列 3～6 行（一頁看完，不寫成流水帳；照日期的紀錄寫進維護日誌）。
//   docs/未來更新.md：「## 」段落裡最外層的每一項（行首「- 」）都要用狀態開頭：⬜ 還沒開始、🔶 做到一半、⏳ 等人或等時間、✅ 做完（做完應該刪掉）。
// 用法：node tools/check/doc_shape.cjs（有問題 exit 1）
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const MARKS = ["⬜", "🔶", "⏳", "✅"];

// 回傳問題清單（字串）
function checkStatus(text) {
  const L = text.split("\n"), i = L.findIndex(l => l.trim() === "## 現況");
  if (i < 0) return ["docs/現況.md：要有「## 現況」那一段（3～6 行）"];
  let n = 0;
  for (let k = i + 1; k < L.length && !/^## /.test(L[k]); k++) if (/^- /.test(L[k])) n++;
  return n >= 3 && n <= 6 ? [] : [`docs/現況.md：〈現況〉有 ${n} 行，要 3～6 行（多的寫進維護日誌或 docs/未來更新.md）`];
}
function checkTodo(text) {
  const out = [];
  let inSec = false;
  text.split("\n").forEach((l, k) => {
    if (/^## /.test(l)) { inSec = true; return; }
    if (!inSec || !/^- /.test(l)) return;
    if (!MARKS.some(m => l.startsWith("- " + m))) out.push(`docs/未來更新.md:${k + 1}：開頭要寫狀態（${MARKS.join(" ")}）：${l.slice(0, 40)}`);
  });
  return out;
}
module.exports = { checkStatus, checkTodo };

if (require.main === module) {
  const bad = checkStatus(fs.readFileSync(path.join(ROOT, "docs", "現況.md"), "utf8")).concat(checkTodo(fs.readFileSync(path.join(ROOT, "docs", "未來更新.md"), "utf8")));
  if (bad.length) { bad.forEach(b => console.log("✗ " + b)); process.exit(1); }
  console.log("狀態頁的寫法：現況 3～6 行、未來更新每項有狀態");
}
