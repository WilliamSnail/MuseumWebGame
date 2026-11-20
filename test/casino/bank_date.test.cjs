// 銀行頁的日期防呆（11-20）：mdShift 日期壞掉回「—」不丟錯；ui_bank.js 不再直接用 toISOString／Date.parse（11-18 玩家的 Invalid time value）
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { load } = require("../load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(load()); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };

T("mdShift：正常日期加天數、跨月跨年", G => {
  assert.strictEqual(G.mdShift("2026-11-22", 0), "11-22");
  assert.strictEqual(G.mdShift("2026-11-22", 3), "11-25");
  assert.strictEqual(G.mdShift("2026-11-29", 3), "12-02");
  assert.strictEqual(G.mdShift("2026-12-30", 3), "01-02");
  assert.strictEqual(G.mdShift("2026-03-01", -1), "02-28");
});
T("mdShift：空的、undefined、null、已經縮成 MM-DD、亂字、不存在的格式，都回「—」不丟錯", G => {
  for (const bad of ["", undefined, null, "11-22", "abc", "2026-1-2", "2026/11/22", 0, NaN, {}, [], "2026-11-22T00:00:00Z"]) assert.strictEqual(G.mdShift(bad, 3), "—", String(bad));
});
T("mdShift：天數不是數字回「—」；日期超出範圍也不丟錯", G => {
  assert.strictEqual(G.mdShift("2026-11-22", NaN), "—");
  assert.strictEqual(G.mdShift("2026-11-22", "x"), "—");
  assert.doesNotThrow(() => G.mdShift("9999-99-99", 1e15));
  assert.strictEqual(G.mdShift("2026-11-22", 1e15), "—"); // 超過 JS 日期範圍
});
T("銀行頁（web/src/ui_bank.js）沒有直接用 toISOString、Date.parse：日期都走 mdShift", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "web", "src", "ui_bank.js"), "utf8");
  assert.ok(!/toISOString\s*\(/.test(src), "ui_bank.js 不要直接用 toISOString（日期壞掉會丟 RangeError），改用 mdShift");
  assert.ok(!/Date\.parse\s*\(/.test(src), "ui_bank.js 不要直接用 Date.parse（結果 NaN 再丟給 Date 就壞），改用 mdShift");
});
console.log(`銀行頁日期防呆：${pass} 過，${fail} 沒過`); process.exit(fail ? 1 : 0);
