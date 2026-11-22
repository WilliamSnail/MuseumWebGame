// 測試檔不准把測試寫在 process.exit 後面（11-22）：後面的測試永遠不會跑，卻看起來有（PR 1012 的測試就是這樣死了壹整天）。npm test 會跑。
// 規則：test/ 底下的檔案，最外層（行首）出現 process.exit( 之後，不准再有程式（空行、註解、結尾的 }) 不算）。
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");
function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(p, out); } else if (/\.(cjs|js|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}
// 回傳問題清單：[{ file, line, text }]。files：[{ file, text }]（測試用）
function check(files) {
  const bad = [];
  for (const { file, text } of files) {
    const L = text.split("\n"), i = L.findIndex(l => /^process\.exit\(/.test(l.replace(/^console\.log\([^;]*\);\s*/, "")));
    if (i < 0) continue;
    for (let k = i + 1; k < L.length; k++) {
      const l = L[k];
      if (!l.trim() || /^\s*\/\//.test(l) || /^\s*\}\)?;?\s*$/.test(l)) continue;
      bad.push({ file, line: k + 1, text: l.trim().slice(0, 60) });
      break;
    }
  }
  return bad;
}
function gather() { return walk(path.join(ROOT, "test")).map(f => ({ file: path.relative(ROOT, f).split(path.sep).join("/"), text: fs.readFileSync(f, "utf8") })); }
module.exports = { check, gather };
if (require.main === module) {
  const bad = check(gather());
  if (bad.length) { console.log(`測試寫在 process.exit 後面（不會執行）：${bad.length} 個檔案`); bad.forEach(b => console.log(`  ${b.file}:${b.line}：${b.text}`)); process.exit(1); }
  console.log("測試檔：沒有寫在 process.exit 後面的測試");
}
