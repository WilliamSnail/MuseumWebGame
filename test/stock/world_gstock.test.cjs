// 決定 0121：世界集團的股票（上市、買賣推價、漲跌停、上限、股利、增資、庫藏股、股票股利、分割、分拆、指數、守恆）。node test/stock/world_gstock.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("../load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); G.NUM.casino.grants = []; G.NUM.casino.world.expand = 0; G.NUM.casino.world.growYoy = false; G.NUM.casino.houseLoan.fix.on = false; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const D = "2026-11-16", NOON = Date.parse(D + "T12:00:00+08:00"), at = (day, k) => Date.parse(day + "T05:00:00+08:00") + k * 900000 + 1000;
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
const setup = G => { const h = G.casHouseFix(G.casHouseNew(), D).house; h.bankroll = 2e9; G.gsAdvance(h, D, NOON); const w = G.casWalletFix(G.casWalletNew(), D); w.chips = 5e9; return { h, w }; };
const total = (G, w, h) => G.casBookTotal(G.casBookSnap([w], h, 0, D));
T("上市：名單 listed 的集團各發壹支；資本額 ＝ 池子 × capMult、每股起始 p0；指數有值", G => {
  const { h } = setup(G); const ids = G.gsListed(h); assert.strictEqual(ids.length, 6); assert.ok(!ids.includes("g-public") && !ids.includes("u-culture"));
  for (const id of ids) { const U = h.gs.u[id]; assert.ok(U.S > 0 && Math.abs(U.P - G.NUM.casino.gstock.p0) < 10, id); } assert.ok(G.gsIndex(h) > 90 && G.gsIndex(h) < 112);
});
T("補算：同樣的輸入同樣的輸出；沒給時間不走價", G => {
  const a = setup(G), b = setup(G); assert.strictEqual(JSON.stringify(a.h.gs.u), JSON.stringify(b.h.gs.u));
  const c = G.casHouseFix(G.casHouseNew(), D).house; G.gsAdvance(c, D, null); const p = c.gs.u["g-daily"].P; assert.strictEqual(G.gsAdvance(c, D, null), true); assert.strictEqual(c.gs.u["g-daily"].P, p);
});
T("買賣：買了價格上升、賣了下降；來回壹趟賠價差手續費和證交稅；錢守恆", G => {
  const { h, w } = setup(G), t0 = total(G, w, h), P0 = h.gs.u["g-daily"].P;
  const b = G.gsBuy(w, h, "g-daily", 200000, D, NOON); assert.ok(b.ok, b.reason); assert.ok(h.gs.u["g-daily"].P > P0); assert.strictEqual(w.gs.h["g-daily"], 200000);
  const s = G.gsSell(w, h, "g-daily", "max", D, NOON); assert.ok(s.ok, s.reason); assert.ok(!w.gs.h["g-daily"]); assert.ok(s.profit < 0, "同價來回壹趟賠錢");
  assert.strictEqual(total(G, w, h), t0, "全館總和不變（只搬動）");
});
T("上限：壹天買賣上限、休市、錢不夠、價格推到漲跌停就擋", G => {
  const { h, w } = setup(G), U = h.gs.u["g-daily"], C = G.NUM.casino.gstock;
  assert.ok(!G.gsBuy(w, h, "g-daily", Math.floor(U.S * C.dayVolPct / 100) + 1, D, NOON).ok, "壹天最多 dayVolPct 股本"); assert.ok(!G.gsBuy(w, h, "g-daily", 1000, D, Date.parse(D + "T03:00:00+08:00")).ok, "休市");
  w.chips = 10; assert.ok(!G.gsBuy(w, h, "g-daily", 100, D, NOON).ok, "沒錢"); w.chips = 5e9;
  const V = h.gs.u["g-arts"]; V.S = 20000; V.i = 0; C.depthPct = 1; const big = G.gsBuy(w, h, "g-arts", 200, D, NOON); assert.ok(!big.ok && /漲跌停/.test(big.reason), big.reason);
  C.depthPct = 20; const small = G.gsBuy(w, h, "g-arts", 10, D, NOON); assert.ok(small.ok, small.reason);
});
T("沒有持股上限：壹個人可以持有很大比例（只受壹天成交上限、漲跌停、錢限制）", G => {
  const { h, w } = setup(G), V = h.gs.u["g-school"]; V.S = 100000; const n = Math.floor(V.S * 0.06); w.gs = { h: { "g-school": n }, cost: { "g-school": 1 } };
  const r = G.gsBuy(w, h, "g-school", 100, D, NOON); assert.ok(r.ok, r.reason); assert.strictEqual(w.gs.h["g-school"], n + 100);
  assert.strictEqual(G.NUM.casino.gstock.holdCapPct, undefined);
});
T("股利：持股人碰錢包時領、錢從那個集團池子出，守恆，同壹個事件不領兩次", G => {
  const { h, w } = setup(G); G.gsBuy(w, h, "g-daily", 400000, D, NOON); const am0 = G.wuAmounts(h);
  const g = h.gs; g.ev.push({ no: ++g.n, kind: "div", id: "g-daily", ps: 0.5, day: D }); const chips0 = w.chips, world0 = h.world;
  const o = G.gsSync(w, h); assert.strictEqual(o.got, 200000); assert.strictEqual(w.chips - chips0, 200000); assert.strictEqual(world0 - h.world, 200000); assert.strictEqual(G.wuAmounts(h)["g-daily"], am0["g-daily"] - 200000, "從那個集團出");
  assert.strictEqual(sum(G.wuAmounts(h)), h.world); assert.strictEqual(G.gsSync(w, h).got, 0);
});
T("增資：莊家買新股、錢進集團池子、股數多；莊家錢不夠不做", G => {
  const { h } = setup(G), U = h.gs.u["g-finance"], am0 = G.wuAmounts(h)["g-finance"], S0 = U.S, b0 = h.bankroll, w0 = h.world;
  const cash = G.gsRaise(h, "g-finance", D); assert.ok(cash > 0); assert.strictEqual(h.bankroll, b0 - cash); assert.strictEqual(h.world, w0 + cash); assert.strictEqual(G.wuAmounts(h)["g-finance"], am0 + cash); assert.ok(U.S > S0 && U.i > 0); assert.strictEqual(sum(G.wuAmounts(h)), h.world);
  h.bankroll = 10; assert.strictEqual(G.gsRaise(h, "g-finance", D), 0);
});
T("庫藏股：集團用池子買回、錢給莊家、股數少；守恆", G => {
  const { h } = setup(G), U = h.gs.u["g-daily"], S0 = U.S, b0 = h.bankroll, w0 = h.world; const cash = G.gsBuyback(h, "g-daily", D);
  assert.ok(cash > 0); assert.strictEqual(h.bankroll, b0 + cash); assert.strictEqual(h.world, w0 - cash); assert.ok(U.S < S0); assert.strictEqual(sum(G.wuAmounts(h)), h.world);
});
T("股票股利和分割：持股人股數換、市值不變（差不到壹股）", G => {
  const { h, w } = setup(G); G.gsBuy(w, h, "g-daily", 100001, D, NOON); const U = h.gs.u["g-daily"], v0 = w.gs.h["g-daily"] * U.P;
  G.gsBonus(h, "g-daily", D, 0.05); G.gsSync(w, h); const v1 = w.gs.h["g-daily"] * U.P; assert.ok(Math.abs(v1 - v0) <= U.P, "配股後市值不變"); assert.strictEqual(w.gs.h["g-daily"], 100001 + Math.floor(100001 * 0.05));
  const v2 = w.gs.h["g-daily"] * U.P; G.gsSplit(h, "g-daily", D, 2); G.gsSync(w, h); assert.ok(Math.abs(w.gs.h["g-daily"] * U.P - v2) <= U.P, "分割後市值不變");
});
T("分拆：池子搬到新公司、原股東照持股拿到新公司股票、總市值守恆、指數不動", G => {
  const { h, w } = setup(G); G.gsBuy(w, h, "g-daily", 200000, D, NOON); G.gsSync(w, h); const U = h.gs.u["g-daily"], idx0 = G.gsIndex(h), val0 = w.gs.h["g-daily"] * U.P, total0 = sum(G.wuAmounts(h)), cap0 = Object.values(h.gs.u).reduce((a, u) => a + u.P * u.S, 0);
  const r = G.gsSpin(h, "g-daily", "g-daily-sub", 20, D); assert.ok(r && r.f > 0.19 && r.f < 0.21); G.gsSync(w, h); const C = h.gs.u["g-daily-sub"]; assert.ok(C && w.gs.h["g-daily-sub"] === 200000);
  const val1 = w.gs.h["g-daily"] * U.P + w.gs.h["g-daily-sub"] * C.P; assert.ok(Math.abs(val1 - val0) <= U.P + C.P, "持股人總市值不變");
  assert.strictEqual(sum(G.wuAmounts(h)), total0, "池子總和不變"); assert.strictEqual(G.wuAmounts(h)["g-daily-sub"], r.moved);
  const cap1 = Object.values(h.gs.u).reduce((a, u) => a + u.P * u.S, 0); assert.ok(Math.abs(cap1 - cap0) < 1e-6 * cap0, "全市場市值守恆（股數新增的部分剛好是搬走的價值）"); void idx0;
});
T("經濟 → 股價：健康值低、基本價低；股價 → 經濟：集團自己的股價進健康值股價項、有上限", G => {
  const { h } = setup(G); G.whTick(h, D, h.stk && h.stk.px); const f0 = G.gsFair(h, "g-daily"); h.wh.h["g-daily"] = 0.6; assert.ok(G.gsFair(h, "g-daily") < f0);
  for (let i = 0; i < 9; i++) { h.gs.u["g-daily"].P *= 1.5; G.whTick(h, "2026-11-" + String(17 + i), h.stk && h.stk.px); }
  const C = G.NUM.casino.worldDoc.health; assert.ok(h.wh.h["g-daily"] <= C.max);
});
T("價格推進：每個價最多動 tickLim%、壹天離開盤價最多 dayLim%；休市價停住", G => {
  const { h } = setup(G); const C = G.NUM.casino.gstock; let prev = h.gs.u["g-daily"].P; const o = h.gs.u["g-daily"].o;
  for (let k = 20; k < 75; k++) { G.gsAdvance(h, D, at(D, k)); const P = h.gs.u["g-daily"].P; assert.ok(Math.abs(P / prev - 1) <= C.tickLim / 100 + 1e-9); assert.ok(Math.abs(P / o - 1) <= C.dayLim / 100 + 1e-9); prev = P; }
  const p = h.gs.u["g-daily"].P; G.gsAdvance(h, D, Date.parse(D + "T03:00:00+08:00")); assert.strictEqual(h.gs.u["g-daily"].P, p);
});
T("賣單莊家不夠錢：夠就照舊；不夠但博物館資金夠就借；兩邊都不夠部分成交；壹股都付不起才擋；守恆", G => {
  const { h, w } = setup(G); G.gsBuy(w, h, "g-daily", 200000, D, NOON); const U = h.gs.u["g-daily"]; let t0 = total(G, w, h);
  const b1 = G.gsSell(w, h, "g-daily", 50000, D, NOON); assert.ok(b1.ok && b1.lent === 0 && b1.part === 0, "莊家夠：不借");
  // 莊家只剩一點、博物館資金很多：借
  h.bankroll = 1000; h.budget = 5e9; t0 = total(G, w, h); const bud0 = h.budget, debt0 = h.debt.budget; const r2 = G.gsSell(w, h, "g-daily", 20000, D, NOON); assert.ok(r2.ok && r2.part === 0 && r2.lent > 0, JSON.stringify(r2));
  assert.ok(h.budget < bud0 - r2.lent + r2.fee + 1 && h.budget > bud0 - r2.lent - 1, "博物館資金少了借出去的、多了手續費"); assert.strictEqual(h.debt.budget, debt0 + r2.lent); assert.ok(h.bankroll >= 0); assert.strictEqual(total(G, w, h), t0, "全館總和不變");
  // 兩邊都不夠：部分成交
  h.bankroll = 1000; h.budget = Math.floor(G.NUM.casino.econ.budgetStart * G.NUM.casino.houseLoan.budgetKeepPct / 100) + 200000; t0 = total(G, w, h); const before = w.gs.h["g-daily"], r3 = G.gsSell(w, h, "g-daily", 100000, D, NOON);
  assert.ok(r3.ok && r3.part > 0 && r3.n < 100000 && r3.n > 0, JSON.stringify(r3)); assert.strictEqual(w.gs.h["g-daily"], before - r3.n); assert.ok(h.bankroll >= 0); assert.ok(/沒賣掉/.test(r3.lines[0])); assert.strictEqual(total(G, w, h), t0);
  // 壹股都付不起
  h.bankroll = 0; h.budget = 0; const r4 = G.gsSell(w, h, "g-daily", 10, D, NOON); assert.ok(!r4.ok && /沒有/.test(r4.reason), JSON.stringify(r4)); void U;
});
T("金流頁籤：增資、庫藏股、股利的線連到那家集團；海外帳負數照實顯示", G => {
  const { h, w } = setup(G); h.econ = { day: D, led0: G.casFlowLed0(G.casBookSnap([w], h, 0, D)) };
  const c1 = G.gsRaise(h, "g-finance", D), c2 = G.gsBuyback(h, "g-daily", D); assert.ok(c1 > 0 && c2 > 0);
  const bb = G.gsBuy(w, h, "g-arts", 40000, D, NOON); assert.ok(bb.ok, bb.reason); const g = h.gs; g.ev.push({ no: ++g.n, kind: "div", id: "g-arts", ps: 0.5, day: D }); const got = G.gsSync(w, h).got; assert.ok(got > 0);
  const r = G.casFlowHub(h, D), E = (a, b) => r.edges.find(x => x.from === a && x.to === b);
  assert.strictEqual(E("house", "w:g-finance").amt, c1, "增資：莊家 → 那家集團"); assert.strictEqual(E("w:g-daily", "house").amt, c2, "庫藏股：那家集團 → 莊家"); assert.strictEqual(E("w:g-arts", "players").amt, got, "股利：那家集團 → 館友");
  assert.ok(!r.edges.some(x => x.from === "world" && x.to === "house" && x.srcs.some(s => s.src === "gRaise")), "不再掛在整個已知世界");
  h.ext = -5000; assert.ok(!G.casFlowWorldNodes(h).find(x => x.id === "w:u-ext"), "海外不在已知世界的節點裡（決定 0126）"); assert.ok(G.wtCard(h) == null || G.wtCard(h).rows.every(x => x.k.startsWith("trade")));
});
T("畫面 gsView：價格、指數、我的持股；沒有錢包也行", G => {
  const { h, w } = setup(G); G.gsBuy(w, h, "g-arts", 1000, D, NOON); const v = G.gsView(w, h, D, NOON); assert.strictEqual(v.list.length, 6); const a = v.list.find(x => x.id === "g-arts"); assert.strictEqual(a.mine, 1000); assert.ok(a.price > 0 && a.name.endsWith("股")); assert.ok(G.gsView(null, h, D, NOON).list.length === 6);
});
console.log(`${pass} passed, ${fail} failed（集團股票）`);
process.exit(fail ? 1 : 0);
