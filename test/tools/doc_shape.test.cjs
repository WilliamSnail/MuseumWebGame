// 狀態頁的寫法檢查（tools/check/doc_shape.cjs）：抓得到壞的、放得過好的。node test/tools/doc_shape.test.cjs
const assert = require("assert");
const D = require("../../tools/check/doc_shape.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };

T("現況：3～6 行過；太多、太少、沒有這段都擋", () => {
  const mk = n => "# 現況\n\n## 現況\n\n" + Array.from({ length: n }, (_, i) => `- 第 ${i} 行`).join("\n") + "\n\n## 接手先看\n\n- 不算\n";
  assert.deepStrictEqual(D.checkStatus(mk(4)), []);
  assert.strictEqual(D.checkStatus(mk(7)).length, 1);
  assert.strictEqual(D.checkStatus(mk(2)).length, 1);
  assert.strictEqual(D.checkStatus("# 現況\n\n- 沒有段\n").length, 1);
});
T("未來更新：段落裡每項要有狀態；縮排的子項、引言、段落外的不管", () => {
  const ok = "# 未來\n\n> - 引言\n- 段落外\n\n## 一\n\n- ⬜ **a**\n  - 子項\n- 🔶 b\n- ⏳ c\n";
  assert.deepStrictEqual(D.checkTodo(ok), []);
  const bad = D.checkTodo("## 一\n\n- **沒狀態**\n- ⬜ 有\n");
  assert.strictEqual(bad.length, 1); assert.ok(/:3：/.test(bad[0]), bad[0]);
});
T("repo 裡現在的兩份都過", () => {
  const fs = require("fs"), path = require("path"), R = path.join(__dirname, "..", "..", "docs");
  assert.deepStrictEqual(D.checkStatus(fs.readFileSync(path.join(R, "現況.md"), "utf8")), []);
  assert.deepStrictEqual(D.checkTodo(fs.readFileSync(path.join(R, "未來更新.md"), "utf8")), []);
});

console.log(`${pass} passed, ${fail} failed（狀態頁的寫法）`);
process.exit(fail ? 1 : 0);
