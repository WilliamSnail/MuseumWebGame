// npm run fb：只留「做這個動作」那步、拿出數字、比兩次（tools/fb/fb_run.cjs，翊文 11-15：「需要的腳本都要寫，才能快速準確」）
const assert = require("assert");
const { stepLines, numbersOf, diffNumbers, parseArgs } = require("../../tools/fb/fb_run.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
T("只留做這個動作那步、拿掉雜訊", () => {
  const log = ["task\t裝套件\t2026-11-15T01:00:00Z added 3", "task\t做這個動作\t2026-11-15T01:00:01Z ##[group]Run x", "task\t做這個動作\t2026-11-15T01:00:02Z 莊家 1,000　博物館資金 2,000", "task\t做這個動作\t2026-11-15T01:00:02Z shell: /usr/bin/bash"].join("\n");
  assert.deepStrictEqual(stepLines(log), ["莊家 1,000　博物館資金 2,000"]);
});
T("同名的數字用行開頭分開（#1、#2）", () => {
  const n = numbersOf(["  #1　籌碼 10　沒還的借款 5", "  #2　籌碼 20"]);
  assert.strictEqual(n["#1·籌碼"], 10); assert.strictEqual(n["#2·籌碼"], 20); assert.strictEqual(n["#1·沒還的借款"], 5);
});
T("比兩次：變的、新出現的、不見的都列，壹樣就說壹樣", () => {
  const d = diffNumbers({ a: 1, b: 2, c: 3 }, { a: 1, b: 5, d: 4 }).join("\n");
  assert.ok(/△ b：2 → 5（\+3）/.test(d) && /＋ d：4/.test(d) && /－ c：3/.test(d) && !/ a：/.test(d));
  assert.deepStrictEqual(diffNumbers({ a: 1 }, { a: 1 }), ["（數字都壹樣）"]);
});
T("參數：名字只能安全的字、--show 不能跟動作壹起", () => {
  assert.throws(() => parseArgs(["house-ledger", "--save", "../x"]));
  assert.throws(() => parseArgs(["house-ledger", "--show", "a"]));
  assert.strictEqual(parseArgs(["house-ledger", "--save", "w4-前"]).save, "w4-前");
});
console.log(`npm run fb：${pass} 過，${fail} 沒過`); process.exit(fail ? 1 : 0);
