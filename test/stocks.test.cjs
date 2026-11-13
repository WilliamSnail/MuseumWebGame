// 館外股票的每日漲跌（11-13）：node test/stocks.test.cjs（npm test 也會跑）
// 名字表乾淨、漲跌縮放和上限、休市不動、週末不動、缺資料用前一天、資料到了沒、壞資料、抓資料腳本的整理。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
const F = require("../tools/stocks_fetch.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const ids = G => G.OUT_STOCKS.map(s => s.id);

T("名字表：6～8 檔、id 不重複、有名字有介紹、不寫真公司名和代號", G => {
  const L = G.OUT_STOCKS; assert.ok(L.length >= 6 && L.length <= 8);
  assert.strictEqual(new Set(ids(G)).size, L.length);
  const bad = /NVIDIA|AMD|Nasdaq|NASDAQ|TSMC|台積|Apple|Tesla|Microsoft|輝達|超微|蘋果公司|特斯拉|微軟|NVDA|AAPL|TSLA|MSFT|\b[A-Z]{3,5}\b|\d{4}\.TW/;
  L.forEach(s => { assert.ok(s.name && s.intro && ["stock", "index"].includes(s.kind)); assert.ok(!bad.test(s.name + s.intro), s.id); });
  assert.strictEqual(Object.keys(F.SYMBOLS).sort().join(), ids(G).sort().join(), "抓資料腳本和名字表的 id 要一樣");
});
T("縮放和上限：照真的、超過 10% 截斷、壞值當不動", G => {
  const C = G.OUT_STOCK_NUM;
  assert.ok(Math.abs(G.outStockMove(2) - 0.02 * C.scale) < 1e-12);
  assert.strictEqual(G.outStockMove(80), C.cap); assert.strictEqual(G.outStockMove(-80), -C.cap);
  [null, undefined, "3", NaN, Infinity].forEach(x => assert.strictEqual(G.outStockMove(x), 0));
});
const daily = { days: {
  "2026-11-09": { a: 1, b: 2 }, "2026-11-10": { a: -2, b: null }, "2026-11-11": { a: 3, b: 4 }, "2026-11-12": { a: 5, b: null },
} };
T("遊戲日期用前一天的市場：11-13 用 11-12", G => {
  const m = G.outStockMovesFor(daily, "2026-11-13", ["a", "b"]);
  assert.ok(Math.abs(m.a - G.outStockMove(5)) < 1e-12); assert.strictEqual(m.b, 0, "休市不動");
});
T("週末沒資料不動：11-14（六）用週五，11-15（日）、11-16（一）用六、日＝不動", G => {
  const d = { days: Object.assign({}, daily.days, { "2026-11-13": { a: 2, b: 2 } }) };
  assert.ok(G.outStockMovesFor(d, "2026-11-14", ["a"]).a !== 0);
  assert.strictEqual(G.outStockMovesFor(d, "2026-11-15", ["a"]).a, 0);
  assert.strictEqual(G.outStockMovesFor(d, "2026-11-16", ["a"]).a, 0);
});
T("平日整天沒資料＝缺：用最近一筆有數字的；完全沒有就不動；b 最近有數字的是 11-11 的 4", G => {
  const m = G.outStockMovesFor(daily, "2026-11-14", ["a", "b"]); // 市場日 11-13（五）沒資料
  assert.ok(Math.abs(m.a - G.outStockMove(5)) < 1e-12); assert.ok(Math.abs(m.b - G.outStockMove(4)) < 1e-12);
  assert.strictEqual(G.outStockMovesFor({ days: {} }, "2026-11-13", ["a"]).a, 0);
});
T("壞資料不丟錯", G => {
  [null, undefined, {}, { days: null }, { days: { "2026-11-12": "x" } }, 5].forEach(d => {
    const m = G.outStockMovesFor(d, "2026-11-13", ["a"]); assert.strictEqual(m.a, 0);
  });
});
T("資料到了沒", G => {
  assert.ok(G.outStockReady(daily, "2026-11-13")); assert.ok(!G.outStockReady(daily, "2026-11-14"));
  assert.ok(G.outStockReady(daily, "2026-11-15"), "前一天是週六，本來就沒有"); assert.ok(!G.outStockReady(null, "2026-11-13"));
});
T("股價換算：四捨五入、最低 1、壞值", G => {
  assert.strictEqual(G.outStockStep(100, 0.03), 103); assert.strictEqual(G.outStockStep(100, -0.1), 90);
  assert.strictEqual(G.outStockStep(1, -0.1), 1); assert.strictEqual(G.outStockStep("x", 0.1), 1);
});
T("抓資料腳本：parseChart 算漲跌、丟掉盤中、休市記 null、這天有家沒收盤整天先不寫", G => {
  const mk = (closes, startDay) => ({ chart: { result: [{ meta: { gmtoffset: 0, currentTradingPeriod: { regular: { start: Date.UTC(2026, 10, 20) / 1000, end: Date.UTC(2026, 10, 21) / 1000 } } },
    timestamp: closes.map((_, i) => Date.UTC(2026, 10, startDay + i, 14) / 1000), indicators: { quote: [{ close: closes }] } }] } });
  const now = Date.UTC(2026, 10, 14, 6) / 1000;
  const p = F.parseChart(mk([100, 110, null, 99], 9), now); // 9、10、11(空)、12
  assert.deepStrictEqual(p.pct, { "2026-11-10": 10, "2026-11-12": -10 }); assert.strictEqual(p.last, "2026-11-12");
  assert.strictEqual(F.parseChart(mk([100, 105], 20), Date.UTC(2026, 10, 20, 20) / 1000).pct["2026-11-21"], undefined, "盤中那根不算");
  const a = { pct: { "2026-11-10": 1, "2026-11-12": 2 }, last: "2026-11-12", today: "2026-11-14" };
  const b = { pct: { "2026-11-12": 3, "2026-11-13": 4 }, last: "2026-11-13", today: "2026-11-14" };
  const m = F.merge(null, { greeneye: a, redclaw: b, flashcar: null }, "t");
  assert.strictEqual(m.days["2026-11-10"].redclaw, null, "b 那天沒開市"); assert.strictEqual(m.days["2026-11-13"].greeneye, null); assert.ok(!("flashcar" in m.days["2026-11-12"]), "抓失敗的不寫");
  const a2 = Object.assign({}, a, { today: "2026-11-13" }); // a 的市場現在還是 11-13，11-13 還沒定
  assert.ok(!("2026-11-13" in F.merge(null, { greeneye: a2, redclaw: b }, "t").days));
  assert.deepStrictEqual(F.check(m), []); assert.ok(F.check({ days: { x: {} } }).length);
});
T("repo 裡的 content/stocks/daily.json 格式沒問題", G => {
  const d = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "content", "stocks", "daily.json"), "utf8"));
  assert.deepStrictEqual(F.check(d), []);
});
console.log(`${pass} passed, ${fail} failed（館外股票）`); process.exit(fail ? 1 : 0);
