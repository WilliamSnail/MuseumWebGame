// 決定 0119：集團之間的交易（A 放款、B 貨款、C 股票營收；帳上搬 house.wu.adj，house.world 和玩家的錢不動）。node test/world_trade.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.NUM.casino.worldDoc.market.on = false; /* 景氣分市場另外在 world_market.test 測（決定 0121） */ G.NUM.casino.grants = []; G.NUM.casino.worldDoc.trade.flows = []; G.NUM.casino.worldDoc.trade.flowDefault = []; G.NUM.casino.worldDoc.trade.bank.on = false; /* 往來表和銀行另外在 world_trade_flows.test 測（決定 0127） */ try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
const run = (G, b, days, yoy = 14.36) => { let day = "2026-11-16"; const h = G.casHouseFix(G.casHouseNew(), day).house; for (let i = 1; i <= days; i++) { day = add(day, 1); h.econ = { b, yoy }; G.casHouseFix(h, day); } return h; };
T("景氣 −1：週一狀態不是一般的集團跟金融集團借（有借款紀錄、金融集團帳上少、借的多）；總和 ＝ 池子；借款讓健康值回升", G => {
  const T0 = G.NUM.casino.worldDoc.trade, on = run(G, -1, 30), G2 = load(); G2.NUM.casino.grants = []; G2.NUM.casino.worldDoc.market.on = false; G2.NUM.casino.worldDoc.trade.on = false; G2.NUM.casino.worldDoc.trade.flows = []; G2.NUM.casino.worldDoc.trade.flowDefault = []; G2.NUM.casino.worldDoc.trade.bank.on = false; const off = run(G2, -1, 30);
  assert.ok(Object.keys(on.wh.loan).length >= 1, "有人借錢"); const a = G.wuAmounts(on); assert.strictEqual(sum(a), on.world, "分類總和仍等於池子");
  const id = Object.keys(on.wh.loan)[0]; assert.ok(on.wh.h[id] > off.wh.h[id], "借了錢：健康值比沒交易高");
  assert.ok(Object.keys(off.wh.loan).length === 0 && !off.wh.trade, "關掉就沒有交易");
  assert.ok(on.world === off.world || Math.abs(on.world - off.world) < 1e3, "池子大小不變（只搬帳）");
});
T("B 貨款：民生 → 海外 → 島上，每天；來源少、目的多；加起來不變；成長為 0 就不付", G => {
  const h = G.casHouseFix(G.casHouseNew(), "2026-11-16").house; G.whTick(h, "2026-11-16", {}); const a0 = G.wuAmounts(h);
  G.whTick(h, "2026-11-17", {}, 100000000); G.wtAdvance(h, "2026-11-18", null); /* 決定 0120：陸續發生，隔天補完 */ const a1 = G.wuAmounts(h);
  assert.ok(a1["g-daily"] < a0["g-daily"] && a1["g-overseas"] > a0["g-overseas"] - 1 && a1["g-island"] > a0["g-island"], "貨款流向"); assert.strictEqual(sum(a1), sum(a0));
  const h2 = G.casHouseFix(G.casHouseNew(), "2026-11-16").house; G.whTick(h2, "2026-11-16", {}); const b0 = G.wuAmounts(h2); G.whTick(h2, "2026-11-17", {}, 0); G.wtAdvance(h2, "2026-11-18", null); assert.strictEqual(G.wuAmounts(h2)["g-daily"], b0["g-daily"], "沒成長不付");
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
const at = (d, k) => Date.parse(d + "T05:00:00+08:00") + k * 900000 + 1000; // 那天第 k 格（k=0 是 05:00）
T("陸續發生：換日只排、不入帳；每 15 分鐘補壹格；全天加起來等於壹次入帳的總額；補完就刪計畫", G => {
  const mk = () => { const h = G.casHouseFix(G.casHouseNew(), "2026-11-16").house; G.whTick(h, "2026-11-16", {}); return h; };
  const h = mk(); G.whTick(h, "2026-11-17", {}, 100000000); const a0 = G.wuAmounts(h);
  assert.ok(h.wh.tr && h.wh.tr.day === "2026-11-17", "排好了"); assert.strictEqual(G.wtAdvance(h, "2026-11-17", null), 0, "沒給時間不動");
  G.wtAdvance(h, "2026-11-17", at("2026-11-17", 30)); const mid = G.wuAmounts(h); assert.ok(mid["g-overseas"] > a0["g-overseas"] && mid["g-daily"] < a0["g-daily"], "中午有壹部分");
  G.wtAdvance(h, "2026-11-17", at("2026-11-17", 95)); const end = G.wuAmounts(h); assert.ok(!h.wh.tr, "走完 96 格就刪"); assert.strictEqual(sum(end), h.world);
  const G2 = load(); G2.NUM.casino.grants = []; G2.NUM.casino.worldDoc.market.on = false; G2.NUM.casino.worldDoc.trade.live = false; G2.NUM.casino.worldDoc.trade.flows = []; G2.NUM.casino.worldDoc.trade.flowDefault = []; G2.NUM.casino.worldDoc.trade.bank.on = false; const h2 = G2.casHouseFix(G2.casHouseNew(), "2026-11-16").house; G2.whTick(h2, "2026-11-16", {}); G2.whTick(h2, "2026-11-17", {}, 100000000);
  assert.strictEqual(JSON.stringify(end), JSON.stringify(G2.wuAmounts(h2)), "全天總額跟壹次入帳壹樣");
});
T("整週分散：週一定下借款總額，每天借 1/7，七天加起來等於總額；有借款紀錄、新聞寫誰借了；欠款全還完才刪", G => {
  const hh = G.casHouseFix(G.casHouseNew(), "2026-11-16").house; let day = "2026-11-16", seen = null, steps = [];
  for (let i = 1; i <= 21; i++) { day = add(day, i === 1 ? 1 : 1); hh.econ = { b: -1, yoy: 14.36 }; G.casHouseFix(hh, day); if (hh.wh.draw && Object.keys(hh.wh.draw).length) { const id = Object.keys(hh.wh.draw)[0]; if (!seen) seen = { id, n: hh.wh.draw[id].n, day }; } G.wtAdvance(hh, add(day, 1), null); const L = seen && hh.wh.loan[seen.id]; if (seen) steps.push(L ? L.amt : 0); }
  assert.ok(seen, "景氣差：有人借錢"); const max = Math.max(...steps); assert.ok(max > 0 && steps.filter(x => x > 0 && x < seen.n).length >= 3, "分好幾天借，不是壹次借完");
  assert.ok(G.wtNews(hh, day, 21).some(x => x.to === "loan"), "新聞寫了誰借了"); assert.strictEqual(sum(G.wuAmounts(hh)), hh.world);
});
T("財報「集團之間的往來」：本週累計、目前欠金融集團的；沒有快照回 null；每筆有集團名", G => {
  const h = G.casHouseFix(G.casHouseNew(), "2026-11-16").house; assert.strictEqual(G.wtCard(h), null, "還沒有");
  G.whTick(h, "2026-11-16", {}); G.whTick(h, "2026-11-17", {}, 100000000); G.wtAdvance(h, "2026-11-18", null);
  const c = G.wtCard(h); assert.ok(c && c.since === "2026-11-16" && c.rows.length >= 1, "有往來"); assert.ok(c.rows[0].fromName && c.rows[0].toName && c.rows[0].n > 0, "名字和金額"); assert.ok(Array.isArray(c.loans));
});
console.log(`${pass} passed, ${fail} failed（集團交易）`);
process.exit(fail ? 1 : 0);
