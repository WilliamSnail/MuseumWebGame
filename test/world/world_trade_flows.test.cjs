// 決定 0127：集團之間的往來表（照名單長、狀態和景氣縮放）和佩佩銀行當集團的銀行（準備金 house.gb、存款、放款、向博物館資金借）。node test/world/world_trade_flows.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("../load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); G.NUM.casino.govSweep.on = false; /* 決定 0140：政府撥款另外在 gov_sweep.test 測 */ G.NUM.casino.grants = []; G.NUM.casino.houseLoan.fix.on = false; G.NUM.casino.worldDoc.market.on = false; G.NUM.casino.world.growYoy = false; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 5).join("\n    ")); } };
const add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
const D0 = "2026-11-16";
const mk = (G, b = 0) => { const h = G.casHouseFix(G.casHouseNew(), D0).house; h.econ = { b, yoy: 14.36 }; h.extFix = true; return h; };
const step = (G, h, day, b = 0) => { h.econ = { b, yoy: 14.36 }; G.casHouseFix(h, day); G.wtAdvance(h, day, Date.parse(day + "T05:00:00+08:00") + 95 * 900000 + 1000); };
const inv = (G, h) => { const s = G.casBookSnap([], h, 0, null); return G.casBookTotal(s) - G.casBookMinted(s) + G.casBookBurned(s); };
const kinds = h => new Set(Object.keys((h.led && h.led.units) || {}).map(k => k.split("|")[0]));
T("往來表：每天七種往來都有、各單位帳加公共還是等於池子；錢守恆；90 天沒有單位被掏空（帳 adj／池子在 ±6% 內）", G => {
  G.NUM.casino.worldDoc.trade.bank.on = false; const h = mk(G), t0 = inv(G, h); let day = D0;
  for (let i = 1; i <= 90; i++) { day = add(day, 1); step(G, h, day); }
  for (const k of ["tradeDaily", "tradeFee", "tradeResearch", "tradeDesign", "tradeTax", "tradeSubsidy", "tradeTech", "tradeGoods", "tradeHhGoods", "tradeHhTax", "tradeHhFee", "tradeWage"]) assert.ok(kinds(h).has(k), k);
  assert.strictEqual(sum(G.wuAmounts(h)), h.world); assert.strictEqual(inv(G, h), t0 + 0 * 1, "總和只多了憑空成長");
  const x = G.wuFix(h); for (const id of Object.keys(x.r)) if (id !== "pub" && x.r[id] > 0) assert.ok(Math.abs(x.adj[id] / Math.max(1, Math.floor(h.world * x.r[id]))) < 0.06, id + " " + x.adj[id]);
});
T("往來量：景氣好多、景氣差少；狀態不好的付款方付得少（緊縮 ×0.5）", G => {
  G.NUM.casino.worldDoc.trade.bank.on = false;
  const tot = b => { const h = mk(G, b); step(G, h, add(D0, 1), b); return Object.entries(h.led.units).filter(([k]) => /^trade(Daily|Fee|Research|Design|Tax|Subsidy|Tech)\|/.test(k)).reduce((a, [, v]) => a + v, 0); };
  const lo = tot(-1), mid = tot(0), hi = tot(1); assert.ok(lo < mid && mid < hi, `${lo} ${mid} ${hi}`);
  const h = mk(G), w = G.whFix(h); w.st["g-island"].s = "squeeze"; step(G, h, add(D0, 1)); const paid = Object.entries(h.led.units).filter(([k]) => k.startsWith("tradeFee|g-island|")).reduce((a, [, v]) => a + v, 0);
  const h2 = mk(G); step(G, h2, add(D0, 1)); const paid2 = Object.entries(h2.led.units).filter(([k]) => k.startsWith("tradeFee|g-island|")).reduce((a, [, v]) => a + v, 0);
  assert.ok(paid > 0 && paid < paid2 * 0.6, `${paid} ${paid2}`);
});
T("新增集團：表裡沒寫的（名單上有）照 flowDefault 付", G => {
  G.NUM.casino.worldDoc.trade.bank.on = false; G.NUM.casino.worldDoc.trade.flows = G.NUM.casino.worldDoc.trade.flows.filter(f => f.from !== "g-arts"); const h = mk(G); step(G, h, add(D0, 1));
  assert.ok(h.led.units["tradeDaily|g-arts|g-daily"] > 0 && h.led.units["tradeTax|g-arts|g-public"] > 0 && h.led.units["tradeFee|g-arts|g-finance"] > 0);
});
T("佩佩銀行：帳上有錢的集團存進來；準備金跟莊家分開；錢守恆；存款算進健康值；流水記在 led.gb、led.world", G => {
  const h = mk(G), t0 = inv(G, h), bank0 = h.bankroll, x = G.wuFix(h); x.adj["g-daily"] += 2e9; // 民生帳上多 20 億
  const w0 = G.wtWealth(h, "g-daily"); step(G, h, add(D0, 1)); const g = h.gb;
  assert.ok(g.dep["g-daily"] > 0 && g.cash === Object.values(g.dep).reduce((a, b) => a + b, 0) - Object.values(g.loan).reduce((a, b) => a + b, 0) + 0 || g.cash > 0, JSON.stringify(g)); assert.strictEqual(h.bankroll, bank0, "莊家沒動");
  assert.strictEqual(inv(G, h), t0, "守恆"); assert.ok(h.led.gb.groupDeposit > 0 && h.led.world.groupDeposit < 0 && h.led.gb.groupDeposit === -h.led.world.groupDeposit, "兩邊流水相反");
  assert.strictEqual(sum(G.wuAmounts(h)), h.world); assert.ok(G.wtWealth(h, "g-daily") >= w0 - 0.05, "存進去健康值沒掉（存款算資產）");
});
T("佩佩銀行：狀態不好的集團借款（文化部不借）、領回存款；準備金不夠向博物館資金借，利息和還款記帳；莊家不動；守恆", G => {
  const h = mk(G), x = G.wuFix(h), w = G.whFix(h); x.adj["g-daily"] += 2e9; step(G, h, add(D0, 1)); h.budget = 5e9; const t0 = inv(G, h), bank0 = h.bankroll, dep0 = h.gb.dep["g-daily"];
  w.st["g-daily"].s = "layoff"; w.st["g-finance"].s = "cut"; w.st["u-culture"] = { s: "cut", low: 0 }; step(G, h, add(D0, 2));
  assert.ok(h.gb.loan["g-finance"] > 0, "金融集團借了"); assert.ok(!h.gb.loan["u-culture"], "文化部不借"); assert.ok(h.gb.dep["g-daily"] < dep0, "民生領回一部分");
  assert.ok(h.gb.debt > 0 && h.budget < 5e9 + 1e8, "準備金不夠，向博物館資金借"); assert.ok(h.led.flow.groupBankLoan < 0 && h.led.gb.groupBankLoan > 0);
  assert.strictEqual(h.bankroll, bank0); assert.strictEqual(inv(G, h), t0, "守恆（換日的世界成長另算憑空）");
});
T("佩佩銀行：全館守恆（跑 30 天、景氣 −1，存款、領回、放款、利息、向博物館資金借和還都有）", G => {
  const h = mk(G, -1), x = G.wuFix(h); x.adj["g-daily"] += 3e9; x.adj["g-public"] += 1e9; const t0 = inv(G, h); let day = D0;
  for (let i = 1; i <= 30; i++) { day = add(day, 1); step(G, h, day, -1); }
  const L = h.led; assert.ok(L.gb.groupDeposit > 0 && L.gb.groupLoan < 0, JSON.stringify(L.gb)); assert.strictEqual(inv(G, h), t0, "總和只多了憑空成長"); assert.strictEqual(sum(G.wuAmounts(h)), h.world);
  const s = G.casBookSnap([], h, 0, day); assert.strictEqual(s.house.gb, h.gb.cash); assert.ok(s.house.gbx.dep >= 0);
});
console.log(`${pass} passed, ${fail} failed（集團往來和佩佩銀行）`);
process.exit(fail ? 1 : 0);
