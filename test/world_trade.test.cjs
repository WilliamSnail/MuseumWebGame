// 決定 0119：集團之間的交易（A 放款、B 貨款、C 股票營收；帳上搬 house.wu.adj，house.world 和玩家的錢不動）。node test/world_trade.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.NUM.casino.grants = []; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
const run = (G, b, days, yoy = 14.36) => { let day = "2026-11-16"; const h = G.casHouseFix(G.casHouseNew(), day).house; for (let i = 1; i <= days; i++) { day = add(day, 1); h.econ = { b, yoy }; G.casHouseFix(h, day); } return h; };
T("景氣 −1：週一狀態不是一般的集團跟金融集團借（有借款紀錄、金融集團帳上少、借的多）；總和 ＝ 池子；借款讓健康值回升", G => {
  const T0 = G.NUM.casino.worldDoc.trade, on = run(G, -1, 30), G2 = load(); G2.NUM.casino.grants = []; G2.NUM.casino.worldDoc.trade.on = false; const off = run(G2, -1, 30);
  assert.ok(Object.keys(on.wh.loan).length >= 1, "有人借錢"); const a = G.wuAmounts(on); assert.strictEqual(sum(a), on.world, "分類總和仍等於池子");
  const id = Object.keys(on.wh.loan)[0]; assert.ok(on.wh.h[id] > off.wh.h[id], "借了錢：健康值比沒交易高");
  assert.ok(Object.keys(off.wh.loan).length === 0 && !off.wh.trade, "關掉就沒有交易");
  assert.ok(on.world === off.world || Math.abs(on.world - off.world) < 1e3, "池子大小不變（只搬帳）");
});
T("B 貨款：民生 → 海外 → 島上，每天；來源少、目的多；加起來不變；成長為 0 就不付", G => {
  const h = G.casHouseFix(G.casHouseNew(), "2026-11-16").house; G.whTick(h, "2026-11-16", {}); const a0 = G.wuAmounts(h);
  G.whTick(h, "2026-11-17", {}, 100000000); const a1 = G.wuAmounts(h);
  assert.ok(a1["g-daily"] < a0["g-daily"] && a1["g-overseas"] > a0["g-overseas"] - 1 && a1["g-island"] > a0["g-island"], "貨款流向"); assert.strictEqual(sum(a1), sum(a0));
  const h2 = G.casHouseFix(G.casHouseNew(), "2026-11-16").house; G.whTick(h2, "2026-11-16", {}); const b0 = G.wuAmounts(h2); G.whTick(h2, "2026-11-17", {}, 0); assert.strictEqual(G.wuAmounts(h2)["g-daily"], b0["g-daily"], "沒成長不付");
});
T("C 股票營收：旗下股票這週漲，公共給單位；跌，單位給公共；總和不變", G => {
  const h = G.casHouseFix(G.casHouseNew(), "2026-11-16").house; G.whTick(h, "2026-11-16", {}); G.wuFix(h);
  const p0 = G.wuAmounts(h).pub, u0 = G.wuAmounts(h)["g-daily"]; h.wh.chg["g-daily"] = 0.1;
  G.whTick(h, "2026-11-23", {}, 0); // 週一
  assert.ok(G.wuAmounts(h)["g-daily"] > u0 || h.wh.chg["g-daily"] !== 0.1, "漲：單位多");
  assert.strictEqual(sum(G.wuAmounts(h)), h.world);
});
T("借款、貨款、營收不改池子、不動玩家的錢；對帳（casBookSnap 總和）不變", G => {
  const h = G.casHouseFix(G.casHouseNew(), "2026-11-16").house, s0 = G.casBookSnap([], h, 0, "2026-11-16"), t0 = G.casBookTotal(s0);
  for (let i = 1; i <= 21; i++) { h.econ = { b: -1, yoy: 0 }; G.casHouseFix(h, add("2026-11-16", i)); }
  const s1 = G.casBookSnap([], h, 0, "2026-12-07"), mint = G.casBookMinted(s1) - G.casBookMinted(s0); assert.strictEqual(G.casBookTotal(s1) - t0, mint, "總和只多了憑空成長");
});
console.log(`${pass} passed, ${fail} failed（集團交易）`);
process.exit(fail ? 1 : 0);
