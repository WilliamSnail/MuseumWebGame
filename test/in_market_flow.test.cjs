// 館內股真的市場（mkt.on ＝ true）× 槓桿、放空、限價單、停損、強平、隔天才回來的掛單：node test/in_market_flow.test.cjs（npm test 也會跑）
// 照真的成交流程（casLevOpen／casLevClose／casLevSweep／casStockOrder／casStockMatch），價格是旅客散客推出來的；
// 「未來的價」用壹份複製的莊家先把整天推完當對照（旅客的單只看祕密種子，館友的槓桿、掛單不推價，所以對照跟真的壹樣）。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.NUM.casino.grants = []; G.NUM.casino.stockIn.mkt.on = true; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 5).join("\n    ")); } };
const SEC = "flow-secret", D0 = "2026-11-16", add = (d, n) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const at = (day, hh, mm = 0) => { const [y, m, d] = day.split("-").map(Number); return Date.UTC(y, m - 1, d, hh - 8, mm); };
const tick = (day, i) => at(day, 5, 0) + i * 15 * 60000;
const ctx = G => ({ list: G.NPC_ROSTER, counters: null });
const snap = (G, w, h) => G.casBookSnap([w], h, 0, null);
// 建好壹個有「昨天」的市場：換到 D0＋2 天，今天的價還沒推
const mkWorld = G => {
  G.casInSecret(SEC);
  const h = G.casHouseFix(G.casHouseNew(), D0).house; h.bankroll = 2000000000; const w = G.casWalletFix(G.casWalletNew(), D0); w.chips = 500000000;
  for (let i = 0; i <= 2; i++) G.casInRoll(h, add(D0, i), 0, SEC, {}, ctx(G));
  return { h, w, day: add(D0, 2) };
};
// 對照：複製莊家、把這一天推完，回這家店整天的價
const oracle = (G, h, day, id) => { const c = JSON.parse(JSON.stringify(h)); G.casInAdvance(c, add(day, 1), null, SEC); return G.casInHouseFix(c).m.ser[id].slice(); };
const first = (ser, from, f) => { for (let k = from; k < ser.length; k++) if (f(ser[k])) return k; return -1; };
const findDown = (ser, pct = 0) => { for (let i = 2; i < 60; i++) { const lo = Math.min(...ser.slice(i + 1)); if (lo < ser[i] * (1 - pct)) { const k = first(ser, i + 1, p => p <= lo); return { i, k, limit: lo, hit: ser[k] }; } } throw new Error("對照的價沒有下跌的段落"); };
const findUp = (ser, pct = 0) => { for (let i = 2; i < 60; i++) { const hi = Math.max(...ser.slice(i + 1)); if (hi > ser[i] * (1 + pct)) { const k = first(ser, i + 1, p => p >= hi); return { i, k, limit: hi, hit: ser[k] }; } } throw new Error("對照的價沒有上漲的段落"); };
const IN = "cellar"; // 旅客散客人數最多的店之一；找不到有動的就換
const pickStore = (G, h, day) => { for (const id of ["cellar", "food", "bj", "job", "craft"]) { const s = oracle(G, h, day, id); if (new Set(s).size > 8) return id; } return "food"; };
const px = (G, h, id, day, i) => G.casInPrice(h, id, day, tick(day, i), SEC).px;

T("對照的價 ＝ 真的價：館友不推價（槓桿、掛單）時，分好幾次碰到、壹次推完，價都壹樣", G => {
  const { h, w, day } = mkWorld(G), id = pickStore(G, h, day), ser = oracle(G, h, day, id);
  for (const i of [3, 20, 40, 74]) assert.strictEqual(px(G, h, id, day, i), ser[i], "第 " + i + " 個價");
});

T("槓桿做多開倉、平倉：用市場的價；損益 ＝ 價差 × 股數；帳守恆；莊家當對手盤", G => {
  const { h, w, day } = mkWorld(G), id = pickStore(G, h, day), ser = oracle(G, h, day, id), op = G.casBookOpening(snap(G, w, h)), i = 20, j = 60;
  const r = G.casLevOpen(w, h, { id, side: "long", lev: 2, qty: 10 }, day, tick(day, i), G.casLevSrc(h, day, tick(day, i), SEC)); assert.ok(r.ok, r.reason);
  assert.strictEqual(r.pos.entry, ser[i], "開倉價 ＝ 市場的價"); assert.strictEqual(G.casBookGap(snap(G, w, h), op), 0, "開倉守恆");
  const c = G.casLevClose(w, h, r.pos.no, day, tick(day, j), G.casLevSrc(h, day, tick(day, j), SEC)); assert.ok(c.ok, c.reason);
  assert.ok(!c.auto, "途中沒被強平、停損：" + c.auto); // 2 倍強平要掉 25%，價動不到
  assert.strictEqual(c.px, ser[j]); assert.strictEqual(c.pnl, (ser[j] - ser[i]) * 10, "損益 ＝ 價差 × 股數（有賺的上限另外測）");
  assert.strictEqual(G.casBookGap(snap(G, w, h), op), 0, "平倉守恆"); assert.strictEqual(w.lev.pos.length, 0);
});

T("槓桿放空開倉、平倉：價格跌賺、漲賠；帳守恆", G => {
  const { h, w, day } = mkWorld(G), id = pickStore(G, h, day), ser = oracle(G, h, day, id), op = G.casBookOpening(snap(G, w, h)), i = 15, j = 55;
  const r = G.casLevOpen(w, h, { id, side: "short", lev: 2, qty: 10 }, day, tick(day, i), G.casLevSrc(h, day, tick(day, i), SEC)); assert.ok(r.ok, r.reason);
  const c = G.casLevClose(w, h, r.pos.no, day, tick(day, j), G.casLevSrc(h, day, tick(day, j), SEC)); assert.ok(c.ok, c.reason);
  assert.ok(!c.auto, "沒被強平"); assert.strictEqual(c.pnl, (ser[i] - ser[j]) * 10, "放空：開倉價 − 平倉價");
  assert.strictEqual(G.casBookGap(snap(G, w, h), op), 0);
});

T("停損：做多設了停損價，價格掉到就在碰到的那個價平倉（why ＝ stop）；帳守恆", G => {
  const { h, w, day } = mkWorld(G), id = pickStore(G, h, day), ser = oracle(G, h, day, id), f = findDown(ser), op = G.casBookOpening(snap(G, w, h));
  const r = G.casLevOpen(w, h, { id, side: "long", lev: 2, qty: 10, stop: f.limit }, day, tick(day, f.i), G.casLevSrc(h, day, tick(day, f.i), SEC)); assert.ok(r.ok, r.reason);
  assert.strictEqual(G.casLevSweep(w, h, day, tick(day, f.i), G.casLevSrc(h, day, tick(day, f.i), SEC)).length, 0, "還沒碰到");
  const out = G.casLevSweep(w, h, day, tick(day, f.k), G.casLevSrc(h, day, tick(day, f.k), SEC));
  assert.strictEqual(out.length, 1); assert.strictEqual(out[0].why, "stop"); assert.strictEqual(out[0].px, f.hit); assert.strictEqual(w.lev.pos.length, 0); assert.strictEqual(G.casBookGap(snap(G, w, h), op), 0);
});

T("停利：做多設了停利價，價格漲到就平倉（why ＝ take）；放空設停利，價格跌到就平倉", G => {
  const { h, w, day } = mkWorld(G), id = pickStore(G, h, day), ser = oracle(G, h, day, id), up = findUp(ser), dn = findDown(ser), w2 = G.casWalletFix(G.casWalletNew(), D0); w2.chips = 500000000;
  const op = G.casBookOpening(G.casBookSnap([w, w2], h, 0, null));
  const r = G.casLevOpen(w, h, { id, side: "long", lev: 2, qty: 10, take: up.limit }, day, tick(day, up.i), G.casLevSrc(h, day, tick(day, up.i), SEC)); assert.ok(r.ok, r.reason);
  const o1 = G.casLevSweep(w, h, day, tick(day, up.k), G.casLevSrc(h, day, tick(day, up.k), SEC)); assert.strictEqual(o1.length, 1); assert.strictEqual(o1[0].why, "take"); assert.strictEqual(o1[0].px, up.hit);
  const r2 = G.casLevOpen(w2, h, { id, side: "short", lev: 2, qty: 10, take: dn.limit }, day, tick(day, dn.i), G.casLevSrc(h, day, tick(day, dn.i), SEC)); assert.ok(r2.ok, r2.reason);
  const o2 = G.casLevSweep(w2, h, day, tick(day, dn.k), G.casLevSrc(h, day, tick(day, dn.k), SEC)); assert.strictEqual(o2.length, 1); assert.strictEqual(o2[0].why, "take"); assert.strictEqual(o2[0].px, dn.hit);
  assert.strictEqual(G.casBookGap(G.casBookSnap([w, w2], h, 0, null), op), 0);
});

T("強平：保證金剩 forcePct 就在碰到的那個價平倉（why ＝ liq，賠 ≤ 保證金）；帳守恆；壞帳只記次數", G => {
  G.NUM.casino.stockLev.forcePct = 99.8; // 讓正常的價動就碰得到強平（預設要掉 10%，市場的價不會這樣動）
  const { h, w, day } = mkWorld(G), id = pickStore(G, h, day), ser = oracle(G, h, day, id), f = findDown(ser, 0.003), op = G.casBookOpening(snap(G, w, h));
  const r = G.casLevOpen(w, h, { id, side: "long", lev: 2, qty: 10 }, day, tick(day, f.i), G.casLevSrc(h, day, tick(day, f.i), SEC)); assert.ok(r.ok, r.reason);
  const out = G.casLevSweep(w, h, day, tick(day, 74), G.casLevSrc(h, day, tick(day, 74), SEC));
  assert.strictEqual(out.length, 1); assert.ok(out[0].why === "liq" || out[0].why === "flat", out[0].why);
  assert.ok(out[0].back >= 0 && out[0].pnl >= -r.pos.margin, "賠不超過保證金"); assert.strictEqual(G.casBookGap(snap(G, w, h), op), 0);
});

T("限價買、限價賣、停損賣：鎖籌碼／股數、到價成交用觸發價、帳守恆、不會重複成交", G => {
  const { h, w, day } = mkWorld(G), id = pickStore(G, h, day), ser = oracle(G, h, day, id), dn = findDown(ser), up = findUp(ser), op = G.casBookOpening(snap(G, w, h));
  G.casInFix(w); w.sin.own[id] = 100; G.casInHouseFix(h).held[id] = 100; w.sin.cost[id] = 100 * ser[0];
  const b = G.casStockOrder(w, h, "buy", id, 10, dn.limit, day, tick(day, dn.i)); assert.ok(b.ok, b.reason);
  const s = G.casStockOrder(w, h, "sell", id, 40, up.limit, day, tick(day, up.i)); assert.ok(s.ok, s.reason);
  assert.strictEqual(G.casBookGap(snap(G, w, h), op), 0, "鎖錢守恆");
  let fills = 0; for (let k = 0; k <= 74; k++) { fills += G.casStockMatch(w, h, day, tick(day, k)).fills; }
  assert.strictEqual(fills, 2, "兩張都成交壹次"); assert.strictEqual(w.stk.orders.length, 0); assert.strictEqual(w.stk.hold, 0);
  assert.strictEqual(G.casBookGap(snap(G, w, h), op), 0, "成交後守恆");
  assert.strictEqual(w.sin.own[id], 100 + 10 - 40);
  assert.ok(w.stk.notes.length >= 2);
});

T("停損賣（館內股）：價格跌到就賣，成交價是觸發的那個價", G => {
  const { h, w, day } = mkWorld(G), id = pickStore(G, h, day), ser = oracle(G, h, day, id), f = findDown(ser), op = G.casBookOpening(snap(G, w, h));
  G.casInFix(w); w.sin.own[id] = 50; G.casInHouseFix(h).held[id] = 50; w.sin.cost[id] = 50 * ser[0];
  const o = G.casStockOrder(w, h, "stop", id, 50, f.limit, day, tick(day, f.i)); assert.ok(o.ok, o.reason);
  const c0 = w.chips; let m = 0; for (let k = f.i; k <= f.k; k++) m += G.casStockMatch(w, h, day, tick(day, k)).fills;
  assert.strictEqual(m, 1); assert.ok(!w.sin.own[id]);
  const gross = f.hit * 50, fee = Math.ceil(gross * G.NUM.casino.stock.feePct / 100), tax = Math.min(gross - fee, Math.max(1, Math.ceil(gross * 0.003)));
  assert.strictEqual(w.chips - c0, gross - fee - tax, "用觸發的價成交"); assert.strictEqual(G.casBookGap(snap(G, w, h), op), 0);
});

T("隔天才回來的掛單：昨天盤中碰過價的算成交（用昨天的價），沒碰過的過期退回；帳守恆", G => {
  const { h, w, day } = mkWorld(G), id = pickStore(G, h, day), ser = oracle(G, h, day, id), f = findDown(ser), op = G.casBookOpening(snap(G, w, h));
  const c0 = w.chips;
  const hit = G.casStockOrder(w, h, "buy", id, 10, f.limit, day, tick(day, f.i)); assert.ok(hit.ok, hit.reason);
  const miss = G.casStockOrder(w, h, "buy", id, 5, Math.max(1, Math.min(...ser) - 50), day, tick(day, f.i)); assert.ok(miss.ok, miss.reason);
  // 整天沒碰錢包：隔天 05:00 換日、第壹次碰到
  const d1 = add(day, 1); G.casInRoll(h, d1, 0, SEC, {}, ctx(G));
  const m = G.casStockMatch(w, h, d1, at(d1, 5, 1));
  assert.strictEqual(m.fills, 1, "碰到價的那張成交"); assert.strictEqual(w.sin.own[id], 10);
  assert.strictEqual(w.chips, c0 - f.hit * 10 - Math.ceil(f.hit * 10 * 0.005), "用昨天碰到的價成交");
  assert.ok(m.cancels === 0 || w.stk.orders.length <= 1);
  // 沒碰過的那張：等到過期（最後有效日過了）退回鎖住的籌碼
  const d2 = add(d1, 3); G.casInRoll(h, add(d1, 1), 0, SEC, {}, ctx(G)); G.casInRoll(h, add(d1, 2), 0, SEC, {}, ctx(G)); G.casInRoll(h, d2, 0, SEC, {}, ctx(G));
  G.casStockMatch(w, h, d2, at(d2, 5, 1));
  assert.strictEqual(w.stk.orders.length, 0, "過期的取消"); assert.strictEqual(w.stk.hold, 0); assert.strictEqual(G.casBookGap(snap(G, w, h), op), 0);
});

T("隔天才回來的槓桿部位（還沒換日／已經換日）：用市場記的昨天收盤價平倉；帳守恆", G => {
  const { h, w, day } = mkWorld(G), id = pickStore(G, h, day), ser = oracle(G, h, day, id), op = G.casBookOpening(snap(G, w, h));
  const r = G.casLevOpen(w, h, { id, side: "long", lev: 1, qty: 10 }, day, tick(day, 30), G.casLevSrc(h, day, tick(day, 30), SEC)); assert.ok(r.ok, r.reason);
  const d1 = add(day, 1), t1 = at(d1, 5, 1);
  const out = G.casLevSweep(w, h, d1, t1, G.casLevSrc(h, d1, t1, SEC)); // 還沒換日：先掃描
  assert.strictEqual(out.length, 1); assert.strictEqual(out[0].px, ser[74], "收盤價 ＝ 那天最後壹個價"); assert.strictEqual(G.casBookGap(snap(G, w, h), op), 0);
  const { h: h2, w: w2, day: dd } = mkWorld(G), op2 = G.casBookOpening(snap(G, w2, h2));
  assert.ok(G.casLevOpen(w2, h2, { id, side: "short", lev: 1, qty: 10 }, dd, tick(dd, 30), G.casLevSrc(h2, dd, tick(dd, 30), SEC)).ok);
  const e1 = add(dd, 1); G.casInRoll(h2, e1, 0, SEC, {}, ctx(G)); // 已經換日
  const out2 = G.casLevSweep(w2, h2, e1, at(e1, 6), G.casLevSrc(h2, e1, at(e1, 6), SEC));
  assert.strictEqual(out2.length, 1); assert.strictEqual(out2[0].px, G.casInHouseFix(h2).close[id], "用莊家記的昨天收盤"); assert.strictEqual(G.casBookGap(snap(G, w2, h2), op2), 0);
});

T("館友的市價買賣推價以後，後面的槓桿、掛單看到的就是推過的價（不是對照）", G => {
  const { h, w, day } = mkWorld(G), id = pickStore(G, h, day), op = G.casBookOpening(snap(G, w, h)), t = tick(day, 20);
  const p0 = px(G, h, id, day, 20), b = G.casInBuy(w, h, id, 200, day, t, SEC); assert.ok(b.ok, b.reason);
  const p1 = G.casInPrice(h, id, day, t, SEC).px; assert.ok(p1 > p0, "買了價格往上：" + p0 + "→" + p1);
  const r = G.casLevOpen(w, h, { id, side: "long", lev: 2, qty: 5 }, day, t, G.casLevSrc(h, day, t, SEC)); assert.ok(r.ok, r.reason); assert.strictEqual(r.pos.entry, p1, "槓桿用推過的價");
  assert.strictEqual(G.casBookGap(snap(G, w, h), op), 0);
});

console.log(`in_market_flow.test：${pass} 過，${fail} 沒過`); process.exit(fail ? 1 : 0);
