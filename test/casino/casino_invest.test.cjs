// 館方投資海外（11-14，規劃 2.8f 第五節）：node test/casino/casino_invest.test.cjs（npm test 也會跑）
// 莊家和博物館資金超過保留的部分每天投壹點；錢是搬給已知世界、不是燒掉；超過上限不買；跌過停損賣壹半、漲過停利賣三分之壹；虧太多暫停；已知世界吃緊暫停；日報寫昨天的。數字讀 NUM。
const assert = require("assert");
const { load } = require("../load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn, legacy = true) => { const G = load(); G.NUM.casino.grants = []; if (legacy) Object.assign(G.NUM.casino.invest, { mode: "chase", stopLossPct: 15, takeProfitPct: 30, stopPct: 10 });  /* 舊的追高策略（決定 0074）；新的平均買策略（決定 0099）另外測 */ try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const D0 = "2026-11-14", D1 = "2026-11-15", D2 = "2026-11-16", SEC = "祕密";
const mk = (G, bank, budget) => { const h = G.casHouseFix(G.casHouseNew(), D0).house; if (bank != null) h.bankroll = bank; if (budget != null) h.budget = budget; G.casStockHouseFix(h); G.casStockRoll(h, D0, {}); return h; };
const inv = (G, h) => { const s = G.casBookSnap([], h, 0, null); return G.casBookTotal(s) - G.casBookMinted(s) + G.casBookBurned(s); };
const run = (G, h, day, b) => G.casInvestRun(h, G.casStockHouseFix(h), day, SEC, b || 0);
const cost = (G, h, pool) => Object.values(G.casInvestFix(h).pool[pool].cost).reduce((a, b) => a + b, 0);

T("沒超過保留的部分不投：莊家 ≤ reserve、博物館資金 ≤ budgetKeep；同壹天只跑壹次", G => {
  const C = G.NUM.casino.invest, h = mk(G, C.reserve, C.budgetKeep);
  assert.ok(run(G, h, D0).ran); assert.strictEqual(cost(G, h, "house"), 0); assert.strictEqual(cost(G, h, "budget"), 0);
  assert.ok(!run(G, h, D0).ran, "同壹天不重跑");
});
T("莊家超過 reserve 的部分每天投 dailyPct%：錢給已知世界（池子變多）、手續費進博物館資金、總帳守恆、不是燒掉", G => {
  const C = G.NUM.casino.invest, F = G.NUM.casino.stock.feePct, h = mk(G, C.reserve + 1000000000, C.budgetKeep), t0 = inv(G, h), w0 = h.ext, b0 = h.budget, k0 = h.bankroll; // 決定 0126：館方投資的錢進海外（house.ext），不進已知世界
  run(G, h, D0);
  const spent = cost(G, h, "house"), fee = Math.ceil((spent) * F / 100);
  assert.ok(spent > 0 && spent <= Math.floor(1000000000 * C.dailyPct / 100), "不超過每天的量：" + spent);
  assert.strictEqual(h.ext - w0, spent - (h.budget - b0), "海外收到股款（成本裡含手續費，手續費進博物館資金）");
  assert.ok(h.budget > b0, "手續費進博物館資金");
  assert.ok(k0 - h.bankroll >= spent, "莊家付了股款和手續費");
  assert.strictEqual(inv(G, h), t0, "守恆");
  assert.strictEqual(G.casBookBurned(G.casBookSnap([], h, 0, null)), 0, "不是燒掉");
  assert.ok(fee >= 0);
});
T("博物館資金超過 budgetKeep 的部分也投；博物館資金付給自己的手續費不用搬；守恆", G => {
  const C = G.NUM.casino.invest, h = mk(G, C.reserve, C.budgetKeep + 500000000), t0 = inv(G, h), w0 = h.ext;
  run(G, h, D0);
  const spent = cost(G, h, "budget"); assert.ok(spent > 0 && spent <= Math.floor(500000000 * C.dailyPct / 100));
  assert.strictEqual(h.ext, w0 + spent); assert.strictEqual(h.budget, C.budgetKeep + 500000000 - spent);
  assert.strictEqual(inv(G, h), t0);
});
T("景氣好多投、差少投：dailyPct ×（1 ＋ extPct% × b）", G => {
  const C = G.NUM.casino.invest, a = mk(G, C.reserve + 2000000000, C.budgetKeep), z = mk(G, C.reserve + 2000000000, C.budgetKeep);
  run(G, a, D0, 1); run(G, z, D0, -1);
  assert.ok(cost(G, a, "house") > cost(G, z, "house"), "b=+1 比 b=−1 多");
});
T("持股成本合計不超過超過部分的 holdCapPct%（天天買也不超過）", G => {
  const C = G.NUM.casino.invest, ex = 1000000000, h = mk(G, C.reserve + ex, C.budgetKeep);
  let day = D0;
  for (let i = 0; i < 40; i++) { run(G, h, day, 0); day = new Date(Date.parse(day + "T00:00:00Z") + 86400000).toISOString().slice(0, 10); }
  assert.ok(cost(G, h, "house") <= Math.floor((ex) * C.holdCapPct / 100) + 1000000, "成本 " + cost(G, h, "house"));
});
T("先賣：比成本跌 stopLossPct% 賣壹半、漲 takeProfitPct% 賣三分之壹；賣的錢已知世界付回池子，守恆", G => {
  const C = G.NUM.casino.invest, h = mk(G, C.reserve, C.budgetKeep), H = G.casStockHouseFix(h), I = G.casInvestFix(h), P = I.pool.house;
  const [a, b] = ["greeneye", "redclaw"];
  P.own[a] = 300; P.cost[a] = 300 * H.px[a] * 2;  // 現價只有成本的一半：跌 50% → 停損
  P.own[b] = 300; P.cost[b] = Math.floor(300 * H.px[b] / 1.5); // 現價是成本的 1.5 倍：漲 50% → 停利
  const t0 = inv(G, h), w0 = h.ext, k0 = h.bankroll;
  run(G, h, D0);
  assert.strictEqual(P.own[a], 150, "停損賣壹半"); assert.strictEqual(P.own[b], 200, "停利賣三分之壹");
  assert.ok(h.ext < w0 && h.bankroll > k0, "海外付回莊家");
  assert.strictEqual(inv(G, h), t0, "守恆");
});
T("已知世界吃緊（低於起始 10%）：暫停買進；賣出的錢從海外付，不受池子上限（決定 0126）", G => {
  const C = G.NUM.casino.invest, WC = G.NUM.casino.world, h = mk(G, C.reserve + 1000000000, C.budgetKeep);
  h.world = Math.floor(WC.start * WC.lowPct / 100) - 1;
  run(G, h, D0); assert.strictEqual(cost(G, h, "house"), 0, "不買"); assert.strictEqual(G.casInvestFix(h).cur.paused.house, "world");
  const H = G.casStockHouseFix(h), P = G.casInvestFix(h).pool.house; P.own.greeneye = 100000; P.cost.greeneye = 100000 * H.px.greeneye * 2;
  const w0 = h.world, e0 = h.ext; run(G, h, D1);
  assert.strictEqual(h.world, w0, "已知世界不動"); assert.ok(e0 - h.ext > Math.floor(w0 * WC.lowPayPct / 100), "賣出不受已知世界 1% 的上限");
});
T("虧太多（總賺賠虧超過 stopPct%）暫停買進 stopDays 天；日報寫昨天的買賣和持有", G => {
  const C = G.NUM.casino.invest, h = mk(G, C.reserve + 1000000000, C.budgetKeep), H = G.casStockHouseFix(h);
  run(G, h, D0); assert.ok(cost(G, h, "house") > 0);
  const P = G.casInvestFix(h).pool.house; P.pnl = -Math.floor(cost(G, h, "house") * 10); // 已實現虧很多
  run(G, h, D1); assert.ok(P.stopUntil && P.stopUntil > D1, "暫停到 " + P.stopUntil);
  assert.strictEqual(G.casInvestFix(h).cur.paused.house, "stop");
  const doc = (() => { const s0 = G.casBookSnap([], mk(G).bank ? mk(G) : mk(G), 0, D0), s1 = G.casBookSnap([], h, 0, D2); return { day: D2, at: 0, snap: s1, diff: G.casBookDiff(s0, s1), opening: 0 }; })();
  const v = G.casReportView(doc), txt = v.secs.map(x => x.lines.join("|")).join("\n");
  assert.ok(/昨天館方投資海外/.test(txt) && /買 /.test(txt), txt.slice(0, 400));
  assert.ok(/館方現在持有/.test(txt));
});
T("種子有祕密：同樣的祕密同樣的買法、不同的祕密隨機那壹成不同", G => {
  const C = G.NUM.casino.invest, run2 = sec => { const h = mk(G, C.reserve + 1000000000, C.budgetKeep); G.casInvestRun(h, G.casStockHouseFix(h), D0, sec, 0); return JSON.stringify(G.casInvestFix(h).pool.house.own); };
  assert.strictEqual(run2("甲"), run2("甲"));
  assert.ok([1, 2, 3, 4, 5, 6].some(i => run2("甲") !== run2("乙" + i)), "不同祕密有時不同");
});
T("銀行的館方投資（延遲壹天）：日報那壹刻拍快照 house.invPub；持股合併兩個池子、成本、市值、損益；昨天買賣有成交價；bankHall 讀得到、沒快照是 null；快照之後的買賣不會立刻看到", G => {
  const C = G.NUM.casino.invest, h = mk(G, C.reserve + 1000000000, C.budgetKeep + 500000000), H = G.casStockHouseFix(h);
  run(G, h, D0); run(G, h, D1);
  const pub = G.casInvestPublic(h, D1); assert.ok(pub && pub.hold.length > 0 && pub.cost > 0); assert.strictEqual(pub.asOf, D1);
  const sumN = Object.values(G.casInvestFix(h).pool).reduce((s, P) => s + Object.values(P.own).reduce((a, b) => a + b, 0), 0); assert.strictEqual(pub.hold.reduce((s, x) => s + x.n, 0), sumN);
  for (const x of pub.hold) { assert.strictEqual(x.value, x.n * H.px[x.id]); assert.strictEqual(x.pnl, x.value - x.cost); assert.ok(x.name); }
  assert.strictEqual(pub.pnl, pub.value - pub.cost); assert.ok(pub.yesterday.length > 0 && pub.yesterday.every(y => y.px > 0 && (y.side === "buy" || y.side === "sell")), JSON.stringify(pub.yesterday));
  const w = G.casWalletFix(G.casWalletNew(), D1); assert.strictEqual(G.casBankHall(w, D1, h, Date.parse(D1 + "T12:00:00+08:00"), []).houseInv, null, "還沒有快照");
  h.invPub = pub; const bh = G.casBankHall(w, D1, h, Date.parse(D1 + "T12:00:00+08:00"), []); assert.ok(bh.houseInv && bh.houseInv.hold.length === pub.hold.length && bh.houseInv.asOf === D1);
  const before = JSON.stringify(bh.houseInv); run(G, h, D2); assert.strictEqual(JSON.stringify(G.casBankHall(w, D1, h, Date.parse(D1 + "T12:00:00+08:00"), []).houseInv), before, "快照之後館方再買賣，銀行看到的不變（延遲）");
});
const dayN = n => new Date(Date.parse(D0 + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
T("新策略（決定 0099）：每天平均買全部；比自己均價低 dip.pct% 以上的加碼；不夠 minDays 天不加碼；不追高、不停損停利；守恆", G => {
  const C = G.NUM.casino.invest, h = mk(G, C.reserve + 1000000000, C.budgetKeep), t0 = inv(G, h);
  assert.strictEqual(C.mode, "even"); assert.strictEqual(C.stopLossPct, 0); assert.strictEqual(C.takeProfitPct, 0);
  run(G, h, D0); const I = G.casInvestFix(h), P = I.pool.house, ids = Object.keys(P.own);
  assert.ok(ids.length >= 5, "平均買很多支"); const cs = ids.map(id => P.cost[id]); assert.ok(Math.max(...cs) / Math.min(...cs) < 1.5, "沒加碼（均價資料不夠）時每支差不多：" + cs.join());
  assert.ok(Object.values(I.hx).every(a => a.length === 1), "每天記壹個價"); assert.strictEqual(inv(G, h), t0, "守恆");
  for (let i = 1; i < C.dip.minDays; i++) run(G, h, dayN(i)); // 價不動，建立均價
  const H = G.casStockHouseFix(h), id0 = Object.keys(P.own)[0], before = JSON.parse(JSON.stringify(P.cost));
  H.px[id0] = Math.floor(H.px[id0] * 0.9); run(G, h, dayN(C.dip.minDays));
  const add = {}; for (const id of Object.keys(P.cost)) add[id] = P.cost[id] - (before[id] || 0);
  const others = Object.keys(add).filter(id => id !== id0 && add[id] > 0).map(id => add[id]), mine = add[id0];
  assert.ok(mine > Math.max(...others) * (C.dip.mult - 0.6), "跌深那支買得多（約 ×" + C.dip.mult + "）：" + mine + " vs " + Math.max(...others));
  assert.strictEqual(inv(G, h), t0, "守恆");
}, false);
T("新策略：不停損、不停利；跌 50% 也不賣；虧超過 stopPct 才暫停買進", G => {
  const C = G.NUM.casino.invest, h = mk(G, C.reserve + 1000000000, C.budgetKeep), H = G.casStockHouseFix(h), I = G.casInvestFix(h), P = I.pool.house;
  P.own.greeneye = 100000; P.cost.greeneye = 100000 * H.px.greeneye * 2;
  run(G, h, D0); assert.ok(P.own.greeneye >= 100000, "−50% 也不賣"); assert.ok(I.cur.paused.house === "stop", "虧超過 25%：暫停買進");
}, false);
// 11-17：股價換比例時館方持股沒跟著換（帳面 +57280%、假跌觸發停損）
const pegHouse = () => ({
  stk: { px: { flashcar: 12513.57, bigassembly: 218.75, handbrain: 3797.5 }, peg: { seq: 3, ev: [
    { seq: 1, id: "flashcar", from: 10161, to: 1590 }, { seq: 2, id: "bigassembly", from: 10000, to: 241 }, { seq: 3, id: "flashcar", from: 1561, to: 12859 }] } },
  inv: { day: "2026-11-17", pool: {
    house: { pnl: 0, stopUntil: "2026-11-23", own: { flashcar: 981, bigassembly: 76 }, cost: { flashcar: 1541930, bigassembly: 763800 } },
    budget: { pnl: 0, stopUntil: null, own: { handbrain: 9 }, cost: { handbrain: 34000 } } }, hx: {}, px: {}, lastPx: { flashcar: 1561, bigassembly: 241 } },
});
T("換比例校正（第壹次）：照平均成本對出從哪次開始沒換，往後補換；成本不變、清掉假的停損；換過的不動", G => {
  const h = pegHouse(), I = G.casInvestFix(h), P = I.pool.house;
  assert.strictEqual(P.own.flashcar, Math.floor(981 * 1561 / 12859), "成本約 1,572／股：在 ×4 那時買的，只補第 3 次");
  assert.strictEqual(P.own.bigassembly, Math.floor(76 * 10000 / 241), "成本約 10,050／股：起始價買的，補第 2 次");
  assert.strictEqual(P.cost.flashcar, 1541930); assert.strictEqual(P.stopUntil, null);
  assert.strictEqual(I.pool.budget.own.handbrain, 9, "成本 3,778／股對不上任何壹次的 from：不動");
  assert.strictEqual(I.pegSeq, 3); assert.strictEqual(I.lastPx.flashcar, 12859);
  const pub = G.casInvestPublic(h, "2026-11-17");
  assert.ok(Math.abs(pub.pnlPct) < 20, "帳面不會再是幾百倍：" + pub.pnlPct);
  const again = JSON.stringify(h.inv.pool); G.casInvestFix(h); assert.strictEqual(JSON.stringify(h.inv.pool), again, "再叫壹次不會再換");
}, false);
T("換比例（之後）：新的換比例事件，館方持股、均價歷史、最近的價都照比例換", G => {
  const h = pegHouse(); G.casInvestFix(h);
  h.inv.hx.flashcar = [12000, 12513.57]; h.inv.px.flashcar = 12513.57;
  h.stk.peg.ev.push({ seq: 4, id: "flashcar", from: 12513.57, to: 1251.36 }); h.stk.peg.seq = 4;
  const n0 = h.inv.pool.house.own.flashcar; G.casInvestFix(h);
  assert.strictEqual(h.inv.pool.house.own.flashcar, Math.floor(n0 * 12513.57 / 1251.36));
  assert.strictEqual(h.inv.hx.flashcar[1], 1251.36); assert.strictEqual(h.inv.px.flashcar, 1251.36); assert.strictEqual(h.inv.pegSeq, 4);
}, false);
console.log(`${pass} passed, ${fail} failed（館方投資）`);
process.exit(fail ? 1 : 0);
