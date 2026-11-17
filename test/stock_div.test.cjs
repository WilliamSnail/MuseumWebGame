// 配股息（決定 0112）：node test/stock_div.test.cjs（npm test 也會跑）
// 除息日開始時持有的人領現金股利（外面世界付、扣股利所得稅進政府帳）；除息日當天才買的不領；配股（除權）多給股數、零股補現金；槓桿部位調整；守恆。
const assert = require("assert"), fs = require("fs"), path = require("path");
const { load } = require("./load_shared.cjs");
// functions/stock_div.js 直接取出 parseDivEvents 的原始碼來跑（不載入 firebase）
const src = fs.readFileSync(path.join(__dirname, "..", "functions", "stock_div.js"), "utf8");
const pi = src.indexOf("export function parseDivEvents("), pj = src.indexOf("\n}\n", src.indexOf("return [...m.values()]")) + 2;
const dayOf = (sec, tz) => new Date(sec * 1000).toLocaleDateString("en-CA", { timeZone: tz });
const parseDivEvents = new Function("dayOf", src.slice(pi, pj).replace("export function", "return function"))(dayOf);
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.US_IDS.length = 0; G.NUM.casino.grants = []; G.NUM.casino.stock.direct = false; G.NUM.casino.houseLoan.cultureDue = ""; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const D0 = "2026-11-16", D1 = "2026-11-17", ID = "handbrain", OPEN = d => Date.parse(`${d}T14:30:00+08:00`);
const fresh = (G, day = D0) => { const w = G.casWalletFix(G.casWalletNew(), day), house = G.casHouseFix(G.casHouseNew(), day).house; w.chips = 500000000; house.bankroll = 500000000; G.casStockHouseFix(house); house.stk.day = day; house.stk.px[ID] = 100; house.stk.prev[ID] = 100; return { w, house }; };
const snap = (G, s) => G.casBookSnap([s.w], s.house, 0, null);
const gap = (G, s, op) => G.casBookGap(snap(G, s), op);
const roll = (G, s, day) => { G.casStockHouseFix(s.house); s.house.stk.day = day; s.house.stk.hist[day] = Object.assign({}, s.house.stk.px); };
const give = (G, s, n) => { G.casStockFix(s.w); s.w.stk.own[ID] = (s.w.stk.own[ID] || 0) + n; s.w.stk.cost[ID] = (s.w.stk.cost[ID] || 0) + n * 100; s.house.stk.held[ID] = (s.house.stk.held[ID] || 0) + n; }; // 直接給持股（台股沒開盤不能買）
const ev = (kind, ex, x) => ({ id: ID, kind, ex, amt: kind === "div" ? x : 0, r: kind === "split" ? x : 0 });

T("解析 Yahoo：現金股利、台股配股（記成 splits）、同一天的合併、沒有事件回空", () => {
  const j = { chart: { result: [{ events: { dividends: { a: { date: 1784005200, amount: 2 } }, splits: { b: { date: 1784005200, numerator: 1040, denominator: 1000 } } } }] } };
  const r = parseDivEvents(j, "wavefreight", true);
  assert.strictEqual(r.length, 2); assert.ok(r.some(e => e.kind === "div" && e.amt === 2 && /^2026-07-\d\d$/.test(e.ex))); assert.ok(r.some(e => e.kind === "split" && Math.abs(e.r - 1.04) < 1e-9));
  const two = { chart: { result: [{ events: { dividends: { a: { date: 1784005200, amount: 1 }, b: { date: 1784005300, amount: 0.5 } } } }] } };
  assert.deepStrictEqual(parseDivEvents(two, "x", true).map(e => e.amt), [1.5], "同一天兩筆合成一筆");
  assert.deepStrictEqual(parseDivEvents({ chart: { result: [{}] } }, "x", true), []); assert.deepStrictEqual(parseDivEvents(null, "x", true), []);
});
T("除息日開始時持有的人領股息：外面世界付、扣 30.11% 進政府帳；帳守恆；訊息", G => {
  const s = fresh(G), op = G.casBookOpening(snap(G, s));
  give(G, s, 1000);
  G.casStockPegSync(s.w, s.house); // 今天的持股記下來
  roll(G, s, D1); G.casStockSetDiv(s.house, { ev: [ev("div", D1, 2)] });
  const c0 = s.w.chips, g0 = s.house.gov || 0, w0 = s.house.world;
  G.casStockPegSync(s.w, s.house);
  const gross = 2000, tax = Math.ceil(gross * 3011 / 10000);
  assert.strictEqual(s.w.chips, c0 + gross - tax); assert.strictEqual(s.house.gov, g0 + tax); assert.strictEqual(s.house.world, w0 - gross);
  assert.strictEqual(s.house.led.world.dividend, -gross); assert.ok(s.w.stk.notes.some(n => n.includes("除息") && n.includes("2,000")), s.w.stk.notes.join("|"));
  assert.strictEqual(gap(G, s, op), 0, "守恆");
  const c1 = s.w.chips; G.casStockPegSync(s.w, s.house); assert.strictEqual(s.w.chips, c1, "同一筆只領一次");
});
T("除息日當天才買的不領；除息日開始時有、當天賣掉的還是領", G => {
  const s = fresh(G); give(G, s, 100);
  G.casStockPegSync(s.w, s.house); roll(G, s, D1);
  G.casStockPegSync(s.w, s.house); // 除息日第一次碰到：記下持股 100（事件還沒來）
  G.casStockSetDiv(s.house, { ev: [ev("div", D1, 3)] }); // 事件在當天稍晚才抓到
  s.w.stk.own[ID] = 900; // 事件已經知道，之後：賣掉 100 股、又買 900 股
  const c0 = s.w.chips; G.casStockPegSync(s.w, s.house);
  assert.strictEqual(s.w.chips - c0, 300 - Math.ceil(300 * 3011 / 10000), "只領開始時的 100 股（賣掉的 100 股也算，因為是開始時持有）");
});
T("錢包好幾天沒上線：事件晚到、持股沒變，照最早 ≥ 除息日的持股領；新錢包（沒股）領 0", G => {
  const s = fresh(G); give(G, s, 50); G.casStockPegSync(s.w, s.house);
  const D3 = "2026-11-20"; roll(G, s, D3); G.casStockSetDiv(s.house, { ev: [ev("div", D1, 1)] });
  const c0 = s.w.chips; G.casStockPegSync(s.w, s.house); assert.strictEqual(s.w.chips - c0, 50 - Math.ceil(50 * 3011 / 10000));
  const n = fresh(G); n.house.stk = s.house.stk; const c1 = n.w.chips; G.casStockPegSync(n.w, n.house); assert.strictEqual(n.w.chips, c1, "沒有持股不領");
});
T("股息換算：台股 ×1（小數兩位，捨去成整數）；美股照今天的匯率；美股稅率 30%", G => {
  const H = G.casStockHouseFix(fresh(G).house);
  assert.strictEqual(G.casStockDivPx(H, ID, 0.7), 0.7);
  assert.strictEqual(G.casStockDivTaxPct(ID), 30.11); G.US_IDS.push("greeneye"); assert.strictEqual(G.casStockDivTaxPct("greeneye"), 30);
  H.fx = 32; assert.strictEqual(G.casStockDivPx(H, "greeneye", 0.25), 8); G.US_IDS.length = 0;
  const s = fresh(G); give(G, s, 7); G.casStockPegSync(s.w, s.house); roll(G, s, D1); G.casStockSetDiv(s.house, { ev: [ev("div", D1, 0.7)] });
  const c0 = s.w.chips; G.casStockPegSync(s.w, s.house); const gross = Math.floor(0.7 * 7); // 4.9 → 4（捨去）
  assert.strictEqual(s.w.chips - c0, gross - Math.ceil(gross * 3011 / 10000));
});
T("配股（除權）：多給股數、零股補現金、總成本不變、守恆", G => {
  const s = fresh(G), op = G.casBookOpening(snap(G, s)); give(G, s, 1000); G.casStockPegSync(s.w, s.house);
  const cost0 = s.w.stk.cost[ID]; roll(G, s, D1); s.house.stk.px[ID] = 96.2; s.house.stk.hist[D1][ID] = 96.2; G.casStockSetDiv(s.house, { ev: [ev("split", D1, 1.04)] });
  const c0 = s.w.chips; G.casStockPegSync(s.w, s.house);
  assert.strictEqual(s.w.stk.own[ID], 1040); assert.strictEqual(s.w.stk.cost[ID], cost0, "總成本不變"); assert.strictEqual(s.w.chips, c0, "剛好整股沒有零股現金");
  const t = fresh(G); give(G, t, 7); G.casStockPegSync(t.w, t.house); roll(G, t, D1); t.house.stk.px[ID] = 96; t.house.stk.hist[D1][ID] = 96; G.casStockSetDiv(t.house, { ev: [ev("split", D1, 1.1)] });
  const op2 = G.casBookOpening(snap(G, t)), c1 = t.w.chips; G.casStockPegSync(t.w, t.house);
  assert.strictEqual(t.w.stk.own[ID], 7); assert.strictEqual(t.w.chips - c1, Math.floor((7 * 0.1 - 0) * 96), "7 × 0.1 ＝ 0.7 股，零股現金 ＝ floor(0.7 × 96) ＝ 67");
  assert.strictEqual(gap(G, t, op2), 0);
});
T("槓桿部位當天結束：換日平倉用除息前的收盤價，不受除息影響（不跨除息日，所以不調進場價）", G => {
  const s = fresh(G), src = { now: () => ({ px: 100, idx: 0, open: true, lag: null, stale: false }), path: () => [], close: () => 100 };
  const r = G.casLevOpen(s.w, s.house, { id: ID, side: "long", lev: 2, qty: 1000 }, D0, OPEN(D0), src); assert.ok(r.ok, r.reason);
  roll(G, s, D1); G.casStockSetDiv(s.house, { ev: [ev("div", D1, 2)] });
  const out = G.casLevSweep(s.w, s.house, D1, OPEN(D1), src);
  assert.strictEqual(out.length, 1); assert.strictEqual(out[0].px, 100); assert.strictEqual(out[0].pnl, 0, "用前一天收盤平倉，沒有被除息影響");
});
T("壞資料：事件欄位怪的被丟掉；舊錢包沒有 dv 欄位補得起來", G => {
  const s = fresh(G); G.casStockSetDiv(s.house, { ev: [{ id: "nope", kind: "div", ex: D1, amt: 1 }, { id: ID, kind: "div", ex: "bad", amt: 1 }, { id: ID, kind: "div", ex: D1, amt: -1 }, { id: ID, kind: "split", ex: D1, r: 0.5 }, ev("div", D1, 1)] });
  assert.strictEqual(s.house.stk.div.ev.length, 1);
  const w = G.casWalletFix(G.casWalletNew(), D0); delete w.stk; G.casStockFix(w); assert.deepStrictEqual(JSON.parse(JSON.stringify(w.stk.dv)), { done: {}, start: {}, last: null });
});
T("舊錢包第一次碰到：除息日在今天以前的事件（含 1 個月內的除權）不補領、不補配（不然持股會莫名變兩倍）；除息日 ＝ 今天的照領", G => {
  const s = fresh(G); give(G, s, 1000); G.casStockHouseFix(s.house); s.house.stk.day = "2026-11-17";
  delete s.w.stk.dv; // 上線前的舊錢包：沒有 dv
  G.casStockSetDiv(s.house, { ev: [ev("split", "2026-11-05", 2), ev("div", "2026-11-10", 5), ev("split", "2026-11-17", 1.1)] });
  const c0 = s.w.chips; G.casStockPegSync(s.w, s.house);
  assert.strictEqual(s.w.stk.own[ID], 1100, "只有今天除權的那張配：1000 × 0.1 ＝ 100 股；11-05 的 2 倍不補");
  assert.strictEqual(s.w.chips, c0, "11-10 的股息不補");
  // 錢包幾天沒上線：最後一次領息之後的事件照領
  const t = fresh(G); give(G, t, 10); t.house.stk.day = "2026-11-17"; G.casStockPegSync(t.w, t.house); roll(G, t, "2026-11-20"); G.casStockSetDiv(t.house, { ev: [ev("div", "2026-11-18", 10)] });
  const c1 = t.w.chips; G.casStockPegSync(t.w, t.house); assert.ok(t.w.chips > c1, "11-18 的股息在上次領息（11-17）之後，要領");
});
console.log(`stock_div.test：${pass} 過，${fail} 沒過`); process.exit(fail ? 1 : 0);
