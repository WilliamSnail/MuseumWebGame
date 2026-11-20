// 決定 0124：集團股的槓桿、放空、掛單（推價、莊家曝險、強平、換日、莊家付不起、掛單鎖錢和成交、守恆）。node test/stock/world_gstock_lev.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("../load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); G.NUM.casino.grants = []; G.NUM.casino.world.expand = 0; G.NUM.casino.world.growYoy = false; G.NUM.casino.houseLoan.fix.on = false; G.NUM.casino.stockLev.levByCredit = [[0, 5]]; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 6).join("\n    ")); } };
const D = "2026-11-16", D2 = "2026-11-17", at = (day, k) => Date.parse(day + "T05:00:00+08:00") + k * 900000 + 1000, NOON = at(D, 28);
const ID = "g-daily";
const setup = G => { const h = G.casHouseFix(G.casHouseNew(), D).house; h.bankroll = 59e6; G.gsAdvance(h, D, NOON); const w = G.casWalletFix(G.casWalletNew(), D); w.chips = 5e8; return { h, w }; };
const total = (G, w, h, day = D) => G.casBookTotal(G.casBookSnap([w], h, 0, day));
T("開多：成交價是推價的均價加半價差、價格上升、莊家庫存減少、保證金和手續費搬走；錢守恆", G => {
  const { h, w } = setup(G), t0 = total(G, w, h), U = h.gs.u[ID], P0 = U.P, chips0 = w.chips;
  const r = G.casLevOpen(w, h, { id: ID, side: "long", lev: 5, qty: 20000 }, D, NOON); assert.ok(r.ok, r.reason);
  assert.ok(U.P > P0 && U.i === -20000 && U.lv === 20000, "推價、莊家賣出 20000"); assert.ok(r.pos.entry > P0, "成交價高於推價前的現價"); assert.strictEqual(r.pos.mk, "grp");
  assert.strictEqual(chips0 - w.chips, r.pos.margin + r.cost.total); assert.strictEqual(total(G, w, h), t0, "全館總和不變（保證金還是玩家的）"); assert.ok(h.lev.grp === r.pos.notional);
});
T("放空：價格下降、莊家買進；平倉再推回去，來回只賠價差手續費；守恆", G => {
  const { h, w } = setup(G), t0 = total(G, w, h), U = h.gs.u[ID], P0 = U.P;
  const r = G.casLevOpen(w, h, { id: ID, side: "short", lev: 5, qty: 20000 }, D, NOON); assert.ok(r.ok, r.reason); assert.ok(U.P < P0 && U.i === 20000 && U.lv === -20000);
  const c = G.casLevClose(w, h, r.pos.no, D, NOON); assert.ok(c.ok, c.reason); assert.ok(c.pnl < 0 && c.pnl > -r.pos.margin, "同價來回賠價差"); assert.ok(Math.abs(U.P / P0 - 1) < 0.001, "價格推回去"); assert.strictEqual(U.i, 0); assert.strictEqual(U.lv, 0); assert.strictEqual(h.lev.grp, 0);
  assert.strictEqual(total(G, w, h), t0, "守恆");
});
T("上限：倍數 5、莊家曝險 20% 餘額（保底）、休市、錢不夠", G => {
  const { h, w } = setup(G); const px = h.gs.u[ID].P;
  assert.ok(!G.casLevOpen(w, h, { id: ID, side: "long", lev: 6, qty: 1000 }, D, NOON).ok, "6 倍不行");
  const cap = Math.max(G.NUM.casino.stockLev.houseFloor, Math.floor(h.bankroll * G.NUM.casino.stockLev.houseExposePct / 100)), big = Math.ceil(cap / px) + 1000;
  w.chips = 1e10; const x = G.casLevOpen(w, h, { id: ID, side: "long", lev: 5, qty: big }, D, NOON); assert.ok(!x.ok, "超過莊家曝險上限"); assert.ok(!G.casLevOpen(w, h, { id: ID, side: "long", lev: 5, qty: 100 }, D, Date.parse(D + "T03:00:00+08:00")).ok, "休市"); w.chips = 5;
  assert.ok(!G.casLevOpen(w, h, { id: ID, side: "long", lev: 5, qty: 1000 }, D, NOON).ok, "沒錢");
});
T("強平：價格被別人推到強平線以下，掃描時用碰到的價平倉，賠最多賠保證金；守恆", G => {
  const { h, w } = setup(G), W2 = G.casWalletFix(G.casWalletNew(), D); W2.chips = 5e9; W2.gs = { h: { [ID]: 1e9 }, cost: { [ID]: 1 }, sold: { day: null, n: 0 }, v: { day: null, n: {} }, seen: 0 };
  const r = G.casLevOpen(w, h, { id: ID, side: "long", lev: 5, qty: 20000 }, D, NOON); assert.ok(r.ok, r.reason); const t0 = total(G, w, h);
  const U = h.gs.u[ID]; U.P = r.pos.entry * 0.85; U.tp[29] = U.P; // 價格掉到強平線以下（模擬別人砸盤）
  const out = G.casLevSweep(w, h, D, at(D, 29)); assert.strictEqual(out.length, 1); assert.strictEqual(out[0].why, "liq"); assert.ok(out[0].back >= 0 && out[0].pnl >= -r.pos.margin); assert.strictEqual(w.lev.pos.length, 0); assert.strictEqual(U.lv, 0);
  assert.ok(total(G, w, h) === t0, "守恆"); void W2;
});
T("換日：部位是當天的，莊家庫存換日還原；昨天的部位用昨天的收盤價結算，不再動庫存和價格", G => {
  const { h, w } = setup(G); const r = G.casLevOpen(w, h, { id: ID, side: "long", lev: 5, qty: 20000 }, D, NOON); assert.ok(r.ok); const U = h.gs.u[ID];
  for (let k = 29; k < 75; k++) G.gsAdvance(h, D, at(D, k)); const close = Math.round(U.P * 100) / 100;
  G.gsAdvance(h, D2, at(D2, 1)); assert.strictEqual(U.lv, 0); assert.strictEqual(U.i, 0, "莊家庫存還原"); assert.strictEqual(h.lev.grp, 0); assert.strictEqual(U.hc[D], close);
  G.gsAdvance(h, D2, at(D2, 2)); const P2 = U.P, t0 = total(G, w, h, D2), out = G.casLevSweep(w, h, D2, at(D2, 2)); assert.strictEqual(out.length, 1); assert.strictEqual(out[0].px, close, "用昨天的收盤價"); assert.strictEqual(U.P, P2, "不推價"); assert.strictEqual(U.i, 0);
  assert.strictEqual(total(G, w, h, D2), t0, "守恆");
});
T("莊家付不起賺的錢：先跟博物館資金借，再不夠就少給；守恆", G => {
  const { h, w } = setup(G), U = h.gs.u[ID]; h.budget = 5e9; h.bankroll = 20e6;
  const r = G.casLevOpen(w, h, { id: ID, side: "long", lev: 5, qty: 30000 }, D, NOON); assert.ok(r.ok, r.reason);
  U.P = U.o = r.pos.entry * 1.04; U.tp[30] = U.P; h.bankroll = 1000; const t0 = total(G, w, h), debt0 = h.debt.budget || 0;
  const c = G.casLevClose(w, h, r.pos.no, D, at(D, 30)); assert.ok(c.ok, c.reason); assert.ok(c.pnl > 0); assert.ok(h.debt.budget > debt0, "跟博物館資金借"); assert.ok(h.bankroll >= 0); assert.strictEqual(total(G, w, h), t0);
  // 兩邊都沒有：少給
  h.bankroll = 20e6; const r2 = G.casLevOpen(w, h, { id: ID, side: "long", lev: 5, qty: 30000 }, D, at(D, 31)); if (r2.ok) { U.P = U.o = r2.pos.entry * 1.04; U.tp[32] = U.P; h.bankroll = 0; h.budget = 0; const t1 = total(G, w, h), c2 = G.casLevClose(w, h, r2.pos.no, D, at(D, 32)); assert.ok(c2.ok); assert.ok(c2.clipped > 0 || c2.pnl === 0, JSON.stringify(c2)); assert.strictEqual(total(G, w, h), t1); }
});
T("掛單：下單鎖錢鎖股、價格要更有利、取消退回、碰到價成交（成交價是碰到的價）、收盤沒成交取消；守恆", G => {
  const { h, w } = setup(G), t0 = total(G, w, h), P = h.gs.u[ID].P;
  assert.ok(!G.gsOrder(w, h, "buy", ID, 1000, P + 1, D, NOON).ok, "買價要低於現價"); const o = G.gsOrder(w, h, "buy", ID, 1000, P - 1, D, NOON); assert.ok(o.ok, o.reason); assert.ok(o.order.hold > 0 && w.gs.hold === o.order.hold); assert.strictEqual(total(G, w, h), t0, "鎖住的還是玩家的");
  const cx = G.gsCancel(w, h, o.order.no, D, NOON); assert.ok(cx.ok); assert.strictEqual(w.gs.orders.length, 0); assert.strictEqual(w.gs.hold, 0);
  // 成交：下低於現價的買單，價格掉下去
  const o2 = G.gsOrder(w, h, "buy", ID, 1000, P - 1, D, NOON); assert.ok(o2.ok); const U = h.gs.u[ID]; U.tp[o2.order.at + 1] = P - 2; U.P = P - 2; const m = G.casStockMatch(w, h, D, NOON); assert.ok(m.fills >= 1, JSON.stringify(m)); assert.strictEqual(w.gs.h[ID], 1000); assert.strictEqual(w.gs.orders.length, 0);
  // 賣單鎖股：掛了之後現股賣不掉鎖住的
  const o3 = G.gsOrder(w, h, "sell", ID, 1000, U.P + 5, D, NOON); assert.ok(o3.ok, o3.reason); assert.ok(!G.gsSell(w, h, ID, 1, D, NOON).ok, "全部都被鎖住了");
  // 收盤沒成交：取消
  const m2 = G.casStockMatch(w, h, D, at(D, 75)); assert.ok(m2.cancels >= 1); assert.strictEqual(w.gs.orders.length, 0);
  assert.ok(total(G, w, h) <= t0 && total(G, w, h) >= t0 - 1e7, "沒有憑空變錢（只是搬到莊家、手續費）"); void m;
});
console.log(`${pass} passed, ${fail} failed（集團股槓桿和掛單）`);
process.exit(fail ? 1 : 0);
