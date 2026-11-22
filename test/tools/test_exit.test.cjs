// 測試寫在 process.exit 後面的檢查（tools/check/test_exit.cjs，11-22）：node test/tools/test_exit.test.cjs（npm test 也會跑）
const assert = require("assert");
const { check, gather } = require("../../tools/check/test_exit.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const f = text => check([{ file: "x.test.cjs", text }]);

T("現在的 test/：沒有寫在 process.exit 後面的測試", () => assert.deepStrictEqual(check(gather()), []));
T("exit 後面有測試要擋、回報行號", () => { const r = f("T('a', () => {});\nconsole.log('x');\nprocess.exit(0);\nT('b', () => {});\n"); assert.strictEqual(r.length, 1); assert.strictEqual(r[0].line, 4); });
T("console.log 和 process.exit 寫同壹行也認得", () => assert.strictEqual(f("console.log('a'); process.exit(fail ? 1 : 0);\nT('b', () => {});\n").length, 1));
T("exit 後面只有空行、註解、結尾的 }) 不算", () => assert.deepStrictEqual(f("process.exit(0);\n\n// 完\n});\n"), []));
T("exit 在函式裡面（有縮排）不算最外層", () => assert.deepStrictEqual(f("function a() {\n  process.exit(1);\n}\nT('b', () => {});\n"), []));
T("沒有 process.exit 的檔案沒事", () => assert.deepStrictEqual(f("T('a', () => {});\n"), []));
console.log(fail ? `測試 exit 檢查：${fail} 項沒過` : `測試 exit 檢查：${pass} 項都過`); process.exit(fail ? 1 : 0);
