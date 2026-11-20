// 證交所盤中回應的解析（11-16：大型股 z 常回 "-"，被當成沒新行情、標「未更新」）
// functions/ 的檔部署前才複製 shared，這裡直接取出 parseMis 和 TW_SYMBOLS 的原始碼來跑（不載入 firebase）
const assert = require("assert"), fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "..", "functions", "stock", "stock_tw.js"), "utf8");
const sym = /export const TW_SYMBOLS = (\{[^}]*\});/.exec(src)[1];
const i = src.indexOf("export function parseMis("), j = src.indexOf("\n}\n", i) + 2;
const TW = JSON.parse(sym.replace(/(\w+):/g, '"$1":'));
const parseMis = new Function("TW_SYMBOLS", src.slice(i, j).replace("export function", "return function"))(TW);
const now = Date.parse("2026-11-16T01:34:00Z"); // 台灣 09:34
const row = (c, z, a, b) => ({ c, d: "20261116", o: "1000", y: "990", z, a, b, t: "09:33:58" });
const out = parseMis({ msgArray: [
  row("2330", "1010.0000", "1015.0000_1020.0000_", "1005.0000_1000.0000_"),
  row("2454", "-", "1500.0000_1505.0000_", "1495.0000_1490.0000_"),
  row("2317", "-", "-", "200.5000_200.0000_"),
  row("2308", "-", "-", "-"),
  Object.assign(row("2412", "-", "0.0000_1120.0000_1125.0000_", "-"), {}),
] }, "20261116", now);
assert.strictEqual(out.islandforge.px, 1010, "有成交價就用成交價");
assert.strictEqual(out.handbrain.px, 1497.5, "沒有成交價：用買賣第壹檔的中間價");
assert.strictEqual(out.bigassembly.px, 200.5, "只有壹邊：用那壹邊");
assert.strictEqual(out.trianglepower.px, null, "兩邊都沒有、也不在漲跌停：當沒資料");
assert.strictEqual(out.linetower.px, 1120, "第壹檔是 0（市價單佔位）：跳過，取下壹個大於 0 的價");
const lock = parseMis({ msgArray: [Object.assign(row("2308", "-", "-", "-"), { h: "1200.0000", l: "1120.0000", u: "1360.0000", w: "1120.0000" })] }, "20261116", now);
assert.strictEqual(lock.trianglepower.px, 1120, "兩邊都沒有、今天最低＝跌停：用跌停價");
{ // 上櫃的用 otc_、上市用 tse_（合一 4743 是上櫃）
  const k = src.indexOf("export const TW_OTC"), l = src.indexOf(String.fromCharCode(10), src.indexOf("export const misCh"));
  const misCh = new Function(src.slice(k, l).replace("export const TW_OTC", "const TW_OTC").replace("export const misCh", "const misCh") + "; return misCh;")();
  assert.strictEqual(misCh("4743"), "otc_4743.tw"); assert.strictEqual(misCh("2330"), "tse_2330.tw");
}
console.log("6 passed, 0 failed（台股盤中解析）");
