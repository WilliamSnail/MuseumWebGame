// 財報各行業景氣的白話摘要（11-20）：node test/market_summary.test.cjs
const assert = require("assert");
const { load } = require("./load_shared.cjs");
const G = load();
let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; } catch (e) { fail++; console.log("FAIL", n, "\n   ", e.message); } };
const m = (name, band) => ({ name, band });
T("有冷有熱：列出熱的和冷的、最熱最冷、影響", () => {
  const s = G.wmSummary([m("科技", "hot"), m("觀光", "low"), m("金融", "plain")]).join("");
  assert.ok(s.includes("科技正熱") && s.includes("觀光偏冷") && s.includes("最熱的是科技") && s.includes("觀光最冷") && s.includes("員工來館"), s);
  assert.ok(!/\d/.test(s), "不寫數字");
});
T("全部平穩：壹句、不講影響", () => { const s = G.wmSummary([m("科技", "plain"), m("觀光", "plain")]); assert.strictEqual(JSON.stringify(s), JSON.stringify(["各行業都很平穩，沒有特別冷或熱的。"])); });
T("全部回溫、全部偏冷", () => {
  assert.ok(G.wmSummary([m("a", "warm"), m("b", "hot")])[0].includes("都在回溫"));
  assert.ok(G.wmSummary([m("a", "cool"), m("b", "low")])[0].includes("都偏冷"));
});
T("超過 3 個熱的會收成「等 N 個」；沒資料回空陣列", () => {
  assert.ok(G.wmSummary(["a", "b", "c", "d"].map(x => m(x, "warm")).concat([m("e", "cool")]))[0].includes("等 4 個"));
  assert.strictEqual(JSON.stringify(G.wmSummary([])), JSON.stringify([])); assert.strictEqual(JSON.stringify(G.wmSummary(null)), JSON.stringify([]));
});
console.log(`${pass} passed, ${fail} failed（各行業景氣摘要）`);
process.exit(fail ? 1 : 0);
