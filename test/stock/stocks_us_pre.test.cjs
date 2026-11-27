// 美股盤前（決定 0159）：node test/stock/stocks_us_pre.test.cjs（npm test 也會跑）
// 美東 04:00 起就交易（盤前），正常盤 09:30 起，16:00 收；用真的設定（NUM.casino.stock.us）跑，不像 stocks_us.test.cjs 固定成正常盤。
const assert = require("assert");
const { load } = require("../load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.NUM.casino.grants = []; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const W = "2026-11-16", S = "2026-07-15", US = "greeneye", EARLY = "2026-11-27";
const iso = ms => new Date(ms).toISOString();
const twHM = ms => new Date(ms + 8 * 3600000).toISOString().slice(11, 16);
const mkHouse = (G, day) => { const house = G.casHouseFix(G.casHouseNew(), day).house; G.casStockHouseFix(house); G.casStockRoll(house, day, {}); return house; };

T("時間：美東 04:00 開始（冬令台灣 17:00、夏令 16:00），09:30 正常盤是第 reg 分鐘，16:00 收盤（台灣 05:00／04:00，同壹個遊戲日）", G => {
  const C = G.NUM.casino.stock.us;
  assert.strictEqual(C.open, 240); assert.strictEqual(C.reg, 330); assert.strictEqual(C.len, 720); assert.strictEqual(C.earlyLen, 540);
  assert.strictEqual(iso(G.usOpenMs(W)), "2026-11-16T09:00:00.000Z"); assert.strictEqual(twHM(G.usOpenMs(W)), "17:00");
  assert.strictEqual(iso(G.usOpenMs(S)), "2026-07-15T08:00:00.000Z"); assert.strictEqual(twHM(G.usOpenMs(S)), "16:00");
  assert.strictEqual(iso(G.usOpenMs(W) + C.reg * 60000), "2026-11-16T14:30:00.000Z", "正常盤 09:30 美東");
  assert.strictEqual(twHM(G.usOpenMs(W) + C.len * 60000), "05:00"); assert.strictEqual(twHM(G.usOpenMs(S) + C.len * 60000), "04:00");
  assert.strictEqual(G.taipeiDay(G.usOpenMs(W)), W, "盤前開始還是同壹個遊戲日"); assert.strictEqual(G.taipeiDay(G.usOpenMs(S) + C.len * 60000), S);
  assert.strictEqual(G.mkLen("us", EARLY), 540, "提早收盤日到 13:00 美東");
});
T("解析行情：盤前的 K 棒算進來（第壹根盤前的開盤價就是第壹個價），16:00 整那根起的盤後不算", G => {
  const o = G.usOpenMs(W), at = min => Math.floor((o + min * 60000) / 1000);
  const json = { chart: { result: [{ meta: { chartPreviousClose: 100 }, timestamp: [at(5), at(331), at(720), at(760)], indicators: { quote: [{ open: [101, 104, 150, 199], close: [102, 105, 150, 200] }] } }] } };
  const r = G.usParseChart(json, W, o + 400 * 60000);
  assert.strictEqual(r.open, 101); assert.strictEqual(r.px, 105); assert.strictEqual(r.prev, 100);
});
T("第壹個價：04:00 起每分鐘抓；美東 10:00（第 360 分鐘）還沒有才整天休市", G => {
  const doc = G.usDocNew(W);
  assert.strictEqual(G.usNeed(doc, 0).kind, "open"); assert.strictEqual(G.usNeed(doc, 359).kind, "open"); assert.strictEqual(G.usNeed(doc, 360).kind, "giveup");
});
T("盤前就能買賣：抓到第壹個價之後狀態 open、不停盤；view 帶 reg 給畫面標盤前", G => {
  const doc = G.usDocNew(W), house = mkHouse(G, W), ids = G.US_IDS;
  const got = px => Object.fromEntries(ids.map(id => [id, { open: px, prev: 100, px, lag: 0 }]));
  assert.ok(G.usApply(doc, G.usNeed(doc, 2), 2, got(101), "祕密"));
  for (let i = 3; i <= 20; i++) assert.ok(G.usApply(doc, G.usNeed(doc, i), i, got(101 + i / 100), "祕密"));
  const t = G.usOpenMs(W) + 20 * 60000 + 1000;
  const T0 = G.casStockUsApply(house, doc, W, t);
  assert.strictEqual(T0.st, "open"); assert.strictEqual(T0.from, 2);
  assert.strictEqual(G.casStockIdHalt(house, US, W, t), false, "盤前可以買賣");
  const v = G.casStockView(G.casWalletFix(G.casWalletNew(), W), house, W, t, []);
  assert.strictEqual(v.us.reg, 330); assert.strictEqual(v.us.len, 720);
  const h2 = mkHouse(G, W), t0 = G.usOpenMs(W) - 60000; assert.strictEqual(G.casStockUsApply(h2, G.usDocNew(W), W, t0).st, "pre"); assert.strictEqual(G.casStockIdHalt(h2, US, W, t0), true, "04:00 以前不能買賣");
});
T("文件大小：前幾天只有最近 serKeep 天留每分鐘的價，更早的只留收盤", G => {
  let d = G.usDocNew("2026-11-20");
  for (const x of ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-30"]) { d.openIdx = 0; d.ser = { [US]: [1, 1.01] }; d.R = { [US]: { px: 101 } }; d.prevReal = { [US]: 100 }; d = G.usDocRoll(d, x, 5); }
  const days = Object.keys(d.days).sort(), K = G.NUM.casino.stock.us.serKeep;
  assert.strictEqual(days.length, 5);
  days.forEach((x, i) => { assert.strictEqual(Object.keys(d.days[x].ser).length > 0, i >= days.length - K, x); assert.strictEqual(d.days[x].close[US], 101, x + " 收盤要留"); });
});

T("盤前報價（CNBC、Nasdaq，11-27）：盤前價、前收、成交時間；沒有盤前成交就用前收；合併成跟 Yahoo 壹樣的格式", G => {
  const c = G.usParseCnbcQuote({ last: "149.30", ExtendedMktQuote: { type: "PRE_MKT", last: "156.48", last_time: "2026-11-27T04:15:38.542-0500" } });
  assert.strictEqual(c.prev, 149.3); assert.strictEqual(c.px, 156.48); assert.strictEqual(new Date(c.tradeMs).toISOString(), "2026-11-27T09:15:38.542Z");
  const none = G.usParseCnbcQuote({ last: "37.13", ExtendedMktQuote: { type: "POST_MKT_PREV", last: "37.00" } });
  assert.strictEqual(none.px, 37.13, "還沒有盤前成交：用前收"); assert.strictEqual(none.tradeMs, null);
  assert.strictEqual(G.usParseCnbcQuote({ last: "壞" }), null); assert.strictEqual(G.usParseCnbcQuote(null), null);
  const n = G.usParseNasdaq({ data: { primaryData: { lastSalePrice: "$1,156.20", netChange: "+6.90", lastTradeTimestamp: "Nov 27, 2026 4:09 AM ET" } } });
  assert.strictEqual(n.px, 1156.2); assert.strictEqual(n.prev, 1149.3); assert.strictEqual(new Date(n.tradeMs).toISOString(), "2026-11-27T09:09:00.000Z");
  assert.strictEqual(G.usParseNasdaq({ data: {} }), null);
  const now = Date.parse("2026-11-27T09:17:38.542Z"), m = G.usPreMerge({ greeneye: c, bluefireyard: none, redclaw: null }, now);
  assert.deepStrictEqual(Object.keys(m).sort(), ["bluefireyard", "greeneye"]);
  assert.strictEqual(m.greeneye.open, 156.48); assert.strictEqual(m.greeneye.prev, 149.3);
  assert.ok(Math.abs(m.greeneye.lag - 2) < 1e-9 && m.bluefireyard.lag === m.greeneye.lag, "lag 取最新那筆，套到每壹支");
});
console.log(`${pass} passed, ${fail} failed（美股盤前）`);
process.exit(fail ? 1 : 0);
