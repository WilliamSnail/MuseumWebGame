// 測試用的暫存資料夾（11-27，總督查到 %TEMP% 留了約 1.26 萬個 world-、notices-、tune-… 都是測試建了沒刪）。
// tmpDir("world-")：建壹個 %TEMP%\world-xxxx，程式結束時（正常、丟錯、process.exit 都會）整個刪掉。測試不要直接用 fs.mkdtempSync（npm test 會擋：test/tools/tmp_dir.test.cjs）。
const fs = require("fs"), os = require("os"), path = require("path");
const made = [];
let hooked = false;
function cleanAll() { while (made.length) { const d = made.pop(); try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* 刪不掉就算了 */ } } }
function tmpDir(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix || "pepetest-"));
  made.push(d);
  if (!hooked) { hooked = true; process.on("exit", cleanAll); }
  return d;
}
module.exports = { tmpDir, cleanAll };
