// 維護日誌的標題自動修（tools/check/log_fix.cjs，11-22）：node test/tools/log_fix.test.cjs
const assert = require("assert");
const { fixHeadings } = require("../../tools/check/log_fix.cjs");
const { HEADINGS } = require("../../tools/check/log_lib.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, e.message); } };
const HEAD = "---\n日期: 2026-11-22 10:24:18\n---\n\n# 標題\n\n";

T("11-22 那篇的寫法：三個近似標題改對、補上「還沒做、要注意」", () => {
  const src = HEAD + "## 為什麼改\n\n原話。\n\n## 改了什麼\n\n- 改了\n\n## 測了什麼、沒測什麼\n\n- 測了\n\n## 給下一個人\n\n- 坑\n";
  const r = fixHeadings(src);
  for (const h of HEADINGS) assert.ok(r.text.includes(h), "要有 " + h);
  assert.ok(r.text.indexOf("## 還沒做、要注意") < r.text.indexOf("## 給下一個人"), "補在「給下一個人」前面");
  assert.ok(r.text.includes("原話。") && r.text.includes("- 坑"), "內容不動");
  assert.strictEqual(r.fixed.length, 3);
});
T("都對的不動", () => {
  const src = HEAD + HEADINGS.map(h => h + "\n\n- x\n").join("\n");
  const r = fixHeadings(src);
  assert.strictEqual(r.text, src); assert.deepStrictEqual(r.fixed, []);
});
T("兩段可以空的：都漏了就補在最後，內容「- 沒有」", () => {
  const src = HEAD + "## 為什麼要改\n\n- a\n\n## 改了什麼\n\n- b\n\n## 怎麼確認的\n\n- c\n";
  const r = fixHeadings(src);
  for (const h of HEADINGS) assert.ok(r.text.includes(h), "要有 " + h);
  assert.ok(/## 還沒做、要注意\n\n- 沒有/.test(r.text) && /## 給下一個人\n\n- 沒有\n$/.test(r.text));
});
T("要有內容的三段不自動補（沒有近似的就留給檢查報錯）", () => {
  const r = fixHeadings(HEAD + "## 隨便寫的\n\n- a\n");
  assert.ok(!r.text.includes("## 為什麼要改") && !r.text.includes("## 改了什麼") && !r.text.includes("## 怎麼確認的"));
});
T("內文的字不會被當成標題改（只改 ## 開頭整行）", () => {
  const src = HEAD + "## 為什麼要改\n\n為什麼改這個？因為測試。\n\n## 改了什麼\n\n- 測試\n\n## 怎麼確認的\n\n- x\n\n## 還沒做、要注意\n\n- y\n\n## 給下一個人\n\n- z\n";
  assert.strictEqual(fixHeadings(src).text, src);
});
T("ship 跑測試前會先跑 log:fix", () => {
  const ship = require("fs").readFileSync(require("path").join(__dirname, "..", "..", "tools", "release", "ship.cjs"), "utf8");
  const a = ship.indexOf("log_fix.cjs\").fixChanged()"), b = ship.indexOf('run("npm", ["test"]');
  assert.ok(a > 0 && b > a, "fixChanged 要在 npm test 前面");
});

console.log(`log_fix：${pass} 過、${fail} 沒過`);
if (fail) process.exit(1);
