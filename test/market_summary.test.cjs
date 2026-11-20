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
T("跟上週比：轉熱、轉冷、沒變；沒有上週資料就不寫", () => {
  const s1 = G.wmSummary([{ name: "科技", band: "hot", prev: "plain" }, { name: "觀光", band: "cool", prev: "warm" }]).join("");
  assert.ok(s1.includes("跟上週比，科技轉熱，觀光轉冷"), s1);
  assert.ok(G.wmSummary([{ name: "科技", band: "warm", prev: "warm" }]).join("").includes("冷熱沒變"));
  assert.ok(!G.wmSummary([{ name: "科技", band: "warm" }]).join("").includes("上週"));
});
T("wmTick 換週時存上週最後壹天的值", () => {
  const h = {}; G.wmFix(h); h.mk.day = "2026-11-22"; h.mk.b.tech = 0.4; G.wmTick(h, "2026-11-23", {});
  assert.strictEqual(h.mk.lw.wk, "2026-11-23"); assert.strictEqual(h.mk.lw.b.tech, 0.4);
  const keep = JSON.stringify(h.mk.lw); G.wmTick(h, "2026-11-24", {}); assert.strictEqual(JSON.stringify(h.mk.lw), keep, "同壹週不覆蓋");
});
console.log(`${pass} passed, ${fail} failed（各行業景氣摘要）`);
process.exit(fail ? 1 : 0);
