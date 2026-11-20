// 股票成交紀錄（11-20）：node test/stock/trade_log.test.cjs（npm test 也會跑）
// 館外股、館內股、槓桿的成交都記進 w.tl；最近 50 筆環狀；掛單成交標記；只多記、不改錢；50 筆的大小；view（新的在前、名字查好）。
const assert = require("assert");
const { load: load0 } = require("../load_shared.cjs");
const load = () => { const G = load0(); G.NUM.casino.stock.direct = false; G.NUM.casino.stockIn.mkt.on = false; G.NUM.casino.stockLev.levByCredit = [[0, 5]]; G.NUM.casino.grants = []; G.US_IDS.length = 0; return G; };
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const D = "2026-11-16", SEC = "test-secret", ID = "greeneye", IN = "food";
const at = (day, hh, mm = 0) => { const [y, m, d] = day.split("-").map(Number); return Date.UTC(y, m - 1, d, hh - 8, mm); };
const fresh = G => { const house = G.casHouseFix(G.casHouseNew(), D).house, w = G.casWalletFix(G.casWalletNew(), D); w.chips = 500000000; house.bankroll = 500000000; G.casStockHouseFix(house); return { w, house }; };

T("館外股：買、賣各記壹筆（價、股數、手續費、稅、損益），不改任何錢", G => {
  const { w, house } = fresh(G), t = at(D, 14);
  const rb = G.casStockBuy(w, house, ID, 10, D, t); assert.ok(rb.ok);
  const rs = G.casStockSell(w, house, ID, 10, D, t); assert.ok(rs.ok);
  assert.strictEqual(w.tl.length, 2);
  const b = w.tl[0], s = w.tl[1];
  assert.strictEqual(b.a, "b"); assert.strictEqual(b.m, "o"); assert.strictEqual(b.id, ID); assert.strictEqual(b.n, 10); assert.strictEqual(b.p, rb.px); assert.strictEqual(b.f, rb.fee); assert.strictEqual(b.d, D); assert.strictEqual(b.t, t);
  assert.strictEqual(s.a, "s"); assert.strictEqual(s.p, rs.px); assert.strictEqual(s.f, rs.fee); assert.strictEqual(s.x || 0, rs.tax); assert.strictEqual(s.g || 0, rs.profit);
  const v = G.casTradeView(w);
  assert.strictEqual(v.length, 2); assert.strictEqual(v[0].kind, "sell"); assert.strictEqual(v[1].kind, "buy", "新的在前");
  assert.ok(v[0].name && v[0].name !== ID, "名字查好"); assert.strictEqual(v[0].market, "out"); assert.strictEqual(v[0].lev, false); assert.strictEqual(v[1].profit, null); assert.strictEqual(v[0].profit, rs.profit - rs.tax, "畫面的損益是扣證交稅後的實際賺賠");
});
T("失敗的買賣不記", G => {
  const { w, house } = fresh(G); w.chips = 1;
  assert.ok(!G.casStockBuy(w, house, ID, 10, D, at(D, 14)).ok); assert.ok(!G.casStockSell(w, house, ID, 10, D, at(D, 14)).ok);
  assert.ok(!w.tl || w.tl.length === 0);
});
T("掛單成交：標 q（限價買）", G => {
  const { w, house } = fresh(G), t = at(D, 14), px = house.stk.px[ID];
  const o = G.casStockOrder(w, house, "buy", ID, 5, Math.floor(px * 0.9 * 100) / 100, D, t); assert.ok(o.ok, o.reason);
  house.stk.px[ID] = Math.floor(px * 0.8 * 100) / 100; // 價掉到限價以下
  G.casStockMatch(w, house, D, t);
  assert.strictEqual(w.tl.length, 1); assert.strictEqual(w.tl[0].a, "b"); assert.strictEqual(w.tl[0].q, 1);
  assert.strictEqual(G.casTradeView(w)[0].order, true);
});
T("館內股：買賣記 m＝i，賣的損益對得上", G => {
  const { w, house } = fresh(G); G.casInRoll(house, D, 0, SEC);
  const t = at(D, 10), rb = G.casInBuy(w, house, IN, 10, D, t, SEC); assert.ok(rb.ok, rb.reason);
  const rs = G.casInSell(w, house, IN, 10, D, t, SEC); assert.ok(rs.ok, rs.reason);
  assert.strictEqual(w.tl.length, 2); assert.strictEqual(w.tl[0].m, "i"); assert.strictEqual(w.tl[1].a, "s"); assert.strictEqual(w.tl[1].g || 0, rs.gross - rs.fee - (rb.cost + rb.fee), "損益 ＝ 賣出金額 − 手續費 − 買進成本（含買進手續費）");
  assert.strictEqual(G.casTradeView(w)[1].market, "in");
});
T("集團股：買賣記 m＝g、價是每股均價", G => {
  const G2 = load0({ __realMoney: true }); G2.NUM.casino.grants = []; G2.NUM.casino.world.expand = 0; G2.NUM.casino.world.growYoy = false; G2.NUM.casino.houseLoan.fix.on = false;
  const NOON = Date.parse(D + "T12:00:00+08:00"), h = G2.casHouseFix(G2.casHouseNew(), D).house; h.bankroll = 2e9; G2.gsAdvance(h, D, NOON); const w = G2.casWalletFix(G2.casWalletNew(), D); w.chips = 5e9;
  const b = G2.gsBuy(w, h, "g-daily", 1000, D, NOON); assert.ok(b.ok, b.reason); const r = G2.gsSell(w, h, "g-daily", 1000, D, NOON); assert.ok(r.ok, r.reason);
  assert.strictEqual(w.tl.length, 2); assert.strictEqual(w.tl[0].m, "g"); assert.strictEqual(w.tl[0].p, b.px); assert.strictEqual(w.tl[1].g || 0, r.profit);
  const v = G2.casTradeView(w); assert.strictEqual(v[0].market, "grp"); assert.ok(v[0].name && v[0].name !== "g-daily");
});
T("損益扣稅後：跟錢包實際變化對得上（館外股、館內股、集團股；舊紀錄也是）", G => {
  const { w, house } = fresh(G); const t = at(D, 14); G.casStockBuy(w, house, ID, 100, D, t); const c1 = w.chips; G.casStockSell(w, house, ID, 100, D, t);
  const x = w.tl[1]; assert.ok(x.x > 0, "館外股有證交稅");
  const net = w.chips - c1, paid = w.tl[0].p * 100 + w.tl[0].f;
  assert.strictEqual(G.casTradeView(w)[0].profit, net - paid, "實際賺賠 ＝ 實拿 − 成本");
  const v2 = G.casTradeView({ tl: [{ d: D, id: ID, m: "o", a: "s", n: 1, p: 100, f: 1, x: 5, g: 90 }, { d: D, id: "g-daily", m: "g", a: "s", n: 1, p: 100, f: 1, x: 5, g: 84 }] });
  assert.strictEqual(v2[1].profit, 85, "舊的館外股紀錄在 view 裡扣稅"); assert.strictEqual(v2[0].profit, 84, "集團股的 g 本來就扣過稅");
  const { w: w2, house: h2 } = fresh(G); G.casInRoll(h2, D, 0, SEC); const b = G.casInBuy(w2, h2, IN, 20, D, at(D, 10), SEC), c2 = w2.chips; const s = G.casInSell(w2, h2, IN, 20, D, at(D, 10), SEC);
  assert.strictEqual(G.casTradeView(w2)[0].profit, (w2.chips - c2) - (b.cost + b.fee), "館內股也對得上");
});
T("最近 50 筆：超過丟最舊的；50 筆大小在 5 KB 內", G => {
  const { w, house } = fresh(G), t = at(D, 14);
  for (let i = 0; i < 40; i++) { assert.ok(G.casStockBuy(w, house, ID, 1, D, t + i).ok); assert.ok(G.casStockSell(w, house, ID, 1, D, t + i).ok); }
  assert.strictEqual(w.tl.length, 50);
  assert.strictEqual(w.tl[49].t, t + 39); assert.strictEqual(w.tl[0].t, t + 15, "留下最後 50 筆（第 31～80 筆）");
  const size = Buffer.byteLength(JSON.stringify(w.tl));
  assert.ok(size < 5120, "50 筆 " + size + " 位元組");
  assert.strictEqual(G.casTradeView(w).length, 50);
});
T("槓桿：開倉、平倉各記壹筆（方向、倍數、原因、損益）", G => {
  const { w, house } = fresh(G), P = { px: { [IN]: 1000 }, idx: 28 };
  const src = { now: id => ({ px: P.px[id], idx: P.idx, open: true, lag: null, stale: false }), path: () => [], close: () => null };
  const r = G.casLevOpen(w, house, { id: IN, side: "long", lev: 5, qty: 100 }, D, at(D, 12), src); assert.ok(r.ok, r.reason);
  assert.strictEqual(w.tl.length, 1); assert.strictEqual(w.tl[0].a, "lo"); assert.strictEqual(w.tl[0].y, "l"); assert.strictEqual(w.tl[0].v, 5); assert.strictEqual(w.tl[0].n, 100);
  P.px[IN] = 1010;
  const c = G.casLevClose(w, house, r.pos.no, D, at(D, 13), src); assert.ok(c.ok, c.reason);
  assert.strictEqual(w.tl.length, 2); const l = w.tl[1]; assert.strictEqual(l.a, "lc"); assert.strictEqual(l.w, "close"); assert.strictEqual(l.p, 1010);
  const v = G.casTradeView(w); assert.strictEqual(v[0].lev, true); assert.strictEqual(v[0].kind, "close"); assert.strictEqual(v[0].side, "long"); assert.strictEqual(v[0].mult, 5); assert.strictEqual(v[0].why, "close");
  assert.strictEqual(v[1].kind, "open"); assert.strictEqual(v[1].profit, null);
});
T("舊錢包沒有 tl：view 是空的、不丟錯", G => {
  const w = G.casWalletFix(G.casWalletNew(), D); assert.deepStrictEqual(JSON.parse(JSON.stringify(G.casTradeView(w))), []); assert.deepStrictEqual(JSON.parse(JSON.stringify(G.casTradeView(null))), []);
});
console.log(`${pass} passed, ${fail} failed（股票成交紀錄）`);
process.exit(fail ? 1 : 0);
