// 館外股票的每日漲跌（11-13）：node test/stocks.test.cjs（npm test 也會跑）
// 名字表乾淨、漲跌縮放和上限、休市不動、週末不動、缺資料用前一天、資料到了沒、壞資料、抓資料腳本的整理。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
const F = require("../tools/stocks_fetch.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const ids = G => G.OUT_STOCKS.map(s => s.id);

T("名字表：6～8 檔、id 不重複、有名字有介紹、不寫真公司名和代號", G => {
  const L = G.OUT_STOCKS; assert.ok(L.length >= 6 && L.length <= 12);
  assert.strictEqual(new Set(ids(G)).size, L.length);
  const bad = /NVIDIA|AMD|Nasdaq|NASDAQ|TSMC|台積|Apple|Tesla|Microsoft|輝達|超微|蘋果公司|特斯拉|微軟|NVDA|AAPL|TSLA|MSFT|\b[A-Z]{3,5}\b|\d{4}\.TW/;
  L.forEach(s => { assert.ok(s.name && s.intro && ["stock", "index"].includes(s.kind)); assert.ok(!bad.test(s.name + s.intro), s.id); });
  assert.ok(Object.keys(F.SYMBOLS).every(k => ids(G).includes(k)), "抓資料腳本的 id 都要在名字表裡");
  assert.ok(ids(G).filter(i => !G.stockIsTw(i)).every(k => k in F.SYMBOLS), "美股和指數都要有每日資料（台股新增的 4 支走盤中，不靠每日資料）");
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
T("平日整天沒資料＝缺：不拿別天頂替，一律不動", G => {
  const m = G.outStockMovesFor(daily, "2026-11-14", ["a", "b"]); // 市場日 11-13（五）沒資料
  assert.strictEqual(m.a, 0, "不能拿 11-12 的 +5% 當 11-13 的漲跌"); assert.strictEqual(m.b, 0);
  assert.strictEqual(G.outStockMovesFor({ days: {} }, "2026-11-13", ["a"]).a, 0);
  const part = { days: { "2026-11-12": { a: 5 } } }; // 那天的資料裡少了 b
  assert.strictEqual(G.outStockMovesFor(part, "2026-11-13", ["a", "b"]).b, 0);
});
T("哪幾家沒有新資料：缺的算，休市（null）和週末不算", G => {
  assert.strictEqual(JSON.stringify(G.outStockStale(daily, "2026-11-14", ["a", "b"])), JSON.stringify(["a", "b"]), "平日整天沒資料");
  assert.strictEqual(JSON.stringify(G.outStockStale(daily, "2026-11-13", ["a", "b"])), JSON.stringify([]), "b 是休市 null，不算缺");
  assert.strictEqual(JSON.stringify(G.outStockStale({ days: { "2026-11-12": { a: 5 } } }, "2026-11-13", ["a", "b"])), JSON.stringify(["b"]), "那天少了 b");
  assert.strictEqual(JSON.stringify(G.outStockStale(daily, "2026-11-15", ["a"])), JSON.stringify([]), "前一天是週六");
  assert.strictEqual(JSON.stringify(G.outStockStale(null, "2026-11-13", ["a"])), JSON.stringify(["a"]));
});
T("資料斷了幾天：週末不算斷，超過容許天數要喊", G => {
  assert.strictEqual(G.outStockAgeDays(daily, "2026-11-13"), 0);
  assert.strictEqual(G.outStockAgeDays(daily, "2026-11-14"), 1, "11-13（五）該有卻沒有");
  assert.strictEqual(G.outStockAgeDays(daily, "2026-11-15"), 1, "週六、日不算，該有的最新是週五 11-13");
  assert.strictEqual(G.outStockAgeDays(daily, "2026-11-16"), 1);
  assert.strictEqual(G.outStockAgeDays(daily, "2026-11-20"), 7);
  assert.strictEqual(G.outStockAgeDays({ days: {} }, "2026-11-13"), Infinity); assert.strictEqual(G.outStockAgeDays(null, "2026-11-13"), Infinity);
  assert.ok(G.OUT_STOCK_NUM.staleDays >= 2, "週五資料要撐過週末；至少容許 2 天");
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
T("寫進資料庫的文件：只有 updated 和 days、格式壞的不寫", G => {
  const P = require("../tools/stocks_publish.cjs");
  const d = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "content", "stocks", "daily.json"), "utf8"));
  const doc = P.buildDoc(Object.assign({ extra: 1 }, d)); assert.strictEqual(Object.keys(doc).sort().join(), "days,updated");
  assert.throws(() => P.buildDoc({ days: { "2026-11-12": { nope: 1 } } })); assert.throws(() => P.buildDoc({ days: {} })); assert.throws(() => P.buildDoc(null));
});
T("全部休市的平日（假日）補一列 null；週末不補；抓失敗的家不寫", G => {
  const f = (pct, last) => ({ pct, last, today: "2026-11-30" });
  const m = F.merge(null, { greeneye: f({ "2026-11-25": 1, "2026-11-27": 2 }, "2026-11-27"), redclaw: f({ "2026-11-25": 1, "2026-11-27": 2 }, "2026-11-27"), flashcar: null }, "t");
  assert.deepStrictEqual(m.days["2026-11-26"], { greeneye: null, redclaw: null }, "11-26 兩家都沒有 K 棒＝休市");
  assert.ok(!("2026-11-28" in m.days) && !("2026-11-29" in m.days), "週末不補");
  const m2 = F.merge({ days: { "2026-11-26": { greeneye: 3 } } }, { greeneye: f({ "2026-11-25": 1 }, "2026-11-25") }, "t");
  assert.strictEqual(m2.days["2026-11-26"].greeneye, 3, "已經有的列不動");
  assert.deepStrictEqual(F.check(m), []);
});
T("抓資料腳本的 ageDays：和 shared 的 outStockAgeDays 對得上（台灣 05:00 換日）", G => {
  const at = iso => Date.parse(iso);
  for (const [iso, game] of [["2026-11-13T20:59:00Z", "2026-11-13"], ["2026-11-13T21:00:00Z", "2026-11-14"], ["2026-11-17T01:00:00Z", "2026-11-17"], ["2026-11-20T10:00:00Z", "2026-11-20"]]) {
    assert.strictEqual(F.ageDays(daily, at(iso)), G.outStockAgeDays(daily, game), iso);
  }
});
console.log(`${pass} passed, ${fail} failed（館外股票）`); process.exit(fail ? 1 : 0);
