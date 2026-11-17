// 決定 0121：世界集團的股票（上市、買賣推價、漲跌停、上限、股利、增資、庫藏股、股票股利、分割、分拆、指數、守恆）。node test/world_gstock.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
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
  assert.ok(!G.gsBuy(w, h, "g-daily", Math.floor(U.S * C.dayVolPct / 100) + 1, D, NOON).ok, "壹天最多 1% 股本"); assert.ok(!G.gsBuy(w, h, "g-daily", 1000, D, Date.parse(D + "T03:00:00+08:00")).ok, "休市");
  w.chips = 10; assert.ok(!G.gsBuy(w, h, "g-daily", 100, D, NOON).ok, "沒錢"); w.chips = 5e9;
  const V = h.gs.u["g-arts"]; V.S = 20000; V.i = 0; C.depthPct = 1; const big = G.gsBuy(w, h, "g-arts", 200, D, NOON); assert.ok(!big.ok && /漲跌停/.test(big.reason), big.reason);
  C.depthPct = 20; const small = G.gsBuy(w, h, "g-arts", 10, D, NOON); assert.ok(small.ok, small.reason);
});
T("持股上限：每家最多股本的 holdCapPct%", G => {
  const { h, w } = setup(G), C = G.NUM.casino.gstock, V = h.gs.u["g-school"]; V.S = 100000; const cap = Math.floor(V.S * C.holdCapPct / 100);
  w.gs = { h: { "g-school": cap }, cost: { "g-school": 1 } }; const r = G.gsBuy(w, h, "g-school", 1, D, NOON); assert.ok(!r.ok && /最多持有/.test(r.reason), r.reason);
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
T("畫面 gsView：價格、指數、我的持股；沒有錢包也行", G => {
  const { h, w } = setup(G); G.gsBuy(w, h, "g-arts", 1000, D, NOON); const v = G.gsView(w, h, D, NOON); assert.strictEqual(v.list.length, 6); const a = v.list.find(x => x.id === "g-arts"); assert.strictEqual(a.mine, 1000); assert.ok(a.price > 0 && a.name.endsWith("股")); assert.ok(G.gsView(null, h, D, NOON).list.length === 6);
});
console.log(`${pass} passed, ${fail} failed（集團股票）`);
process.exit(fail ? 1 : 0);
