// 直接用真實價（11-14，規劃 2.8l）：node test/stocks_direct.test.cjs（npm test 也會跑）
// 每分鐘的真實價 → 遊戲價 ＝ 倍數 × 真實價；漲跌 ＝ 真實漲跌（同壹個前壹收盤）；超過 staleMin 分鐘沒有新價暫停買賣；第壹次換比例市值不變；持有成本取代 drag；補最近壹次收盤。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.NUM.casino.grants = []; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const W = "2026-11-16", W0 = "2026-11-15", TW = "handbrain", US = "greeneye";
const tAt = (idx) => Date.parse(W + "T09:00:00+08:00") + idx * 60000;
const mkHouse = (G, day) => { const house = G.casHouseFix(G.casHouseNew(), day).house; G.casStockHouseFix(house); G.casStockRoll(house, day, {}); return house; };
const feed = (G, doc, idx, px, lag) => { // 台股 handbrain 每分鐘壹個真實價；prev 固定 1000
  const need = G.twNeed(doc, idx);
  const got = { [TW]: { open: px, prev: 1000, px, lag: lag == null ? 0 : lag } };
  assert.ok(G.twApply(doc, need, idx, got, "祕密"), "要做成");
  return need;
};

T("直接模式：開盤後每分鐘都要抓（kind min）；開盤那分鐘的價 ＝ 真實開盤價 ÷ 前壹收盤", G => {
  const doc = G.twDocNew(W);
  assert.strictEqual(G.twNeed(doc, 3).kind, "open");
  const n0 = feed(G, doc, 3, 1010); assert.strictEqual(n0.kind, "open");
  assert.strictEqual(doc.ser[TW][3], 1.01);
  assert.strictEqual(G.twNeed(doc, 3), null, "同壹分鐘不重做");
  assert.strictEqual(JSON.stringify(G.twNeed(doc, 4)), JSON.stringify({ kind: "min", fetch: true }));
  feed(G, doc, 4, 1020); feed(G, doc, 5, 1005);
  assert.strictEqual(JSON.stringify(doc.ser[TW].slice(3)), JSON.stringify([1.01, 1.02, 1.005]));
  assert.strictEqual(doc.R[TW].px, 1005);
  assert.strictEqual(doc.last[TW], 5);
});
T("遊戲價 ＝ 倍數 × 真實價；遊戲漲跌和真實漲跌壹模壹樣（同壹個前壹收盤）", G => {
  const C = G.NUM.casino.stock, doc = G.twDocNew(W), house = mkHouse(G, W);
  house.stk.px[TW] = 777; house.stk.hist[W] = { ...house.stk.px }; // 故意讓昨天的遊戲價跟真實對不上（以前會漲跌 % 不壹致）
  feed(G, doc, 0, 1000); for (let i = 1; i <= 20; i++) feed(G, doc, i, 1000 + i * 3);
  G.casStockTwApply(house, doc, W, tAt(20));
  const H = house.stk;
  assert.strictEqual(H.px[TW], Math.round(C.peg.tw * 1060), "價 ＝ 倍數 × 1060");
  G.casStockSetReal(house, doc, null, W, { [TW]: "x" });
  const game = H.px[TW] / H.prev[TW] - 1, real = H.real[TW].chg;
  assert.ok(Math.abs(game - 0.06) < 1e-9 && Math.abs(real - 0.06) < 1e-9, `遊戲 ${game} 真實 ${real}`);
});
T("超過 staleMin 分鐘沒有新價：這支暫停買賣、價停在最後一個價；恢復後可以買", G => {
  const C = G.NUM.casino.stock, doc = G.twDocNew(W), house = mkHouse(G, W), w = G.casWalletFix(G.casWalletNew(), W); w.chips = 1e9;
  feed(G, doc, 0, 1000); feed(G, doc, 1, 1010);
  const miss = idx => { const need = G.twNeed(doc, idx); assert.ok(G.twApply(doc, need, idx, null, "祕密")); };
  for (let i = 2; i <= 1 + C.staleMin; i++) miss(i);
  G.casStockTwApply(house, doc, W, tAt(1 + C.staleMin));
  assert.ok(!doc.stale[TW], "還沒超過 staleMin");
  assert.strictEqual(house.stk.px[TW], Math.round(C.peg.tw * 1010), "價停在最後一個價");
  miss(2 + C.staleMin); G.casStockTwApply(house, doc, W, tAt(2 + C.staleMin));
  assert.ok(doc.stale[TW], "超過了");
  assert.ok(G.casStockIdHalt(house, TW, W, tAt(2 + C.staleMin)), "暫停");
  assert.ok(!G.casStockBuy(w, house, TW, 1, W, tAt(2 + C.staleMin)).ok, "買不了");
  feed(G, doc, 3 + C.staleMin, 1015); G.casStockTwApply(house, doc, W, tAt(3 + C.staleMin));
  assert.ok(!doc.stale[TW]); assert.ok(!G.casStockIdHalt(house, TW, W, tAt(3 + C.staleMin)));
  assert.ok(G.casStockBuy(w, house, TW, 1, W, tAt(3 + C.staleMin)).ok, "又可以買");
});
T("資料落後超過 staleMin 分鐘、或價離譜（超出 sane）都不收", G => {
  const C = G.NUM.casino.stock, doc = G.twDocNew(W);
  feed(G, doc, 0, 1000); feed(G, doc, 1, 1010, C.staleMin + 1); assert.strictEqual(doc.ser[TW][1], doc.ser[TW][0], "落後太久：價平的");
  feed(G, doc, 2, 1000 * (C.sane[1] + 1)); assert.strictEqual(doc.ser[TW][2], doc.ser[TW][0], "離譜的價不收");
  feed(G, doc, 3, 1020); assert.strictEqual(doc.ser[TW][3], 1.02);
});
T("第壹次換成直接用真實價：持股市值不變（股數照比例）；之後每天不再換；沒有 drag", G => {
  const C = G.NUM.casino.stock, house = mkHouse(G, W0), w = G.casWalletFix(G.casWalletNew(), W0);
  house.stk.px[TW] = 9876; house.stk.prev[TW] = 9876; house.stk.hist[W0] = { ...house.stk.px };
  w.stk = w.stk || {}; G.casStockFix(w); w.stk.own[TW] = 100; w.stk.cost[TW] = 987600; house.stk.held[TW] = 100;
  G.casStockRoll(house, W, {}, { [TW]: { px: 1000 } });
  const to = Math.round(C.peg.tw * 1000);
  assert.strictEqual(house.stk.px[TW], to, "價 ＝ 24 × 1000（沒扣 drag）"); assert.strictEqual(house.stk.prev[TW], to);
  assert.ok(house.stk.peg.dir[TW]);
  G.casStockPegSync(w, house);
  assert.strictEqual(w.stk.own[TW], Math.floor(100 * 9876 / to), "股數照比例");
  const n = house.stk.peg.ev.length;
  G.casStockRoll(house, "2026-11-17", {}, { [TW]: { px: 1010 } });
  assert.strictEqual(house.stk.peg.ev.length, n, "第二天不換");
  assert.strictEqual(house.stk.px[TW], Math.round(C.peg.tw * 1010), "價跟著真實");
});
T("持有成本：每過壹天，持股市值的 holdPct% 從錢包搬進預算池；守恆；第壹次只記起點", G => {
  const C = G.NUM.casino.stock, house = mkHouse(G, W0), w = G.casWalletFix(G.casWalletNew(), W0); w.chips = 5e8;
  G.casStockRoll(house, W, {}, { [TW]: { px: 1000 } }); G.casStockRoll(house, "2026-11-17", {}, { [TW]: { px: 1000 } });
  G.casStockPegSync(w, house);
  const buy = G.casStockBuy(w, house, TW, 1000, "2026-11-17", null); assert.ok(buy.ok);
  G.casStockPegSync(w, house); assert.strictEqual(w.stk.hold0, "2026-11-17", "第壹次只記起點");
  const c0 = w.chips, b0 = house.budget, snap0 = G.casBookSnap([w], house, 0, null), t0 = G.casBookTotal(snap0) - G.casBookMinted(snap0) + G.casBookBurned(snap0);
  G.casStockRoll(house, "2026-11-18", {}, { [TW]: { px: 1000 } });
  G.casStockPegSync(w, house);
  const mv = 1000 * house.stk.px[TW], cost = Math.floor(mv * C.holdPct / 100);
  assert.strictEqual(c0 - w.chips, cost); assert.strictEqual(house.budget - b0, cost, "進預算池");
  const snap1 = G.casBookSnap([w], house, 0, null); assert.strictEqual(G.casBookTotal(snap1) - G.casBookMinted(snap1) + G.casBookBurned(snap1), t0, "守恆");
  G.casStockPegSync(w, house); assert.strictEqual(c0 - w.chips, cost, "同壹天不重扣");
});
T("補最近壹次收盤：休市時也有真實價（casStockSetReal 看得到）；已經有的、今天的不覆蓋", G => {
  const doc = G.twDocNew("2026-11-15");
  assert.ok(G.twBackfill(doc, "2026-11-13", { [TW]: 1000 }, { [TW]: 990 }));
  assert.strictEqual(doc.days["2026-11-13"].close[TW], 1000);
  assert.ok(!G.twBackfill(doc, "2026-11-13", { [TW]: 5 }, { [TW]: 5 }), "已經有就不動"); assert.strictEqual(doc.days["2026-11-13"].close[TW], 1000);
  assert.ok(!G.twBackfill(doc, "2026-11-15", { [TW]: 5 }, {}), "今天的不補");
  assert.ok(!G.twBackfill(doc, "2026-11-12", { [TW]: -1 }, {}), "壞資料不寫");
  const house = mkHouse(G, W);
  G.casStockSetReal(house, doc, null, W, { [TW]: "2330" });
  assert.strictEqual(house.stk.real[TW].px, 1000); assert.ok(Math.abs(house.stk.real[TW].chg - (1000 / 990 - 1)) < 1e-9);
  const reals = G.casStockReals(Object.assign(house, {}), doc, null); // house.stk.day 還沒有 → 空，不丟錯
  assert.ok(reals && typeof reals === "object");
});

T("台股收盤：13:30 後再抓壹次官方收盤價，最後壹分鐘改成它（只抓壹到兩次）；13:25 起不能新開槓桿", G => {
  const doc = G.twDocNew(W);
  feed(G, doc, 0, 1000); for (let i = 1; i <= 270; i++) feed(G, doc, i, 1000 + i % 7);
  assert.strictEqual(G.twNeed(doc, 270), null);
  assert.strictEqual(JSON.stringify(G.twNeed(doc, 271)), JSON.stringify({ kind: "fin", fetch: true }));
  assert.ok(G.twApply(doc, G.twNeed(doc, 271), 271, { [TW]: { open: 1, prev: 1000, px: 1033, lag: 0 } }, "祕密"));
  assert.strictEqual(doc.ser[TW][270], 1.033, "最後壹分鐘 ＝ 官方收盤價"); assert.ok(doc.fin); assert.strictEqual(G.twNeed(doc, 272), null, "只做壹次");
  const d2 = G.twDocNew(W); feed(G, d2, 0, 1000); for (let i = 1; i <= 270; i++) feed(G, d2, i, 1000);
  G.twApply(d2, G.twNeed(d2, 271), 271, null, "祕密"); assert.ok(!d2.fin, "抓不到再試"); G.twApply(d2, G.twNeed(d2, 272), 272, null, "祕密"); assert.ok(d2.fin, "第二次還抓不到就算了");
  // 13:25 不能新開
  const C = G.NUM.casino.stock.tw; assert.strictEqual(C.noOpenIdx, 265);
  const w = G.casWalletFix(G.casWalletNew(), W); w.chips = 5e8; const house = mkHouse(G, W); house.bankroll = 5e8;
  const src = { now: id => ({ px: 24000, idx: 260, open: true, lag: 0, stale: false }), path: () => [], close: () => null };
  const at = idx => Date.parse(W + "T09:00:00+08:00") + idx * 60000;
  const ok = G.casLevOpen(w, house, { id: TW, side: "long", lev: 2, qty: 1 }, W, at(264), src); assert.ok(ok.ok, ok.reason);
  const no = G.casLevOpen(w, house, { id: TW, side: "long", lev: 2, qty: 1 }, W, at(265), src); assert.ok(!no.ok && /13:25/.test(no.reason), no.reason);
});

console.log(`${pass} passed, ${fail} failed（直接用真實價）`);
process.exit(fail ? 1 : 0);
