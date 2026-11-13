// 館方投資外面世界（11-14，規劃 2.8f 第五節）：node test/casino_invest.test.cjs（npm test 也會跑）
// 莊家和預算池超過保留的部分每天投壹點；錢是搬給外面世界、不是燒掉；超過上限不買；跌過停損賣壹半、漲過停利賣三分之壹；虧太多暫停；外面世界吃緊暫停；日報寫昨天的。數字讀 NUM。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.NUM.casino.grants = []; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const D0 = "2026-11-14", D1 = "2026-11-15", D2 = "2026-11-16", SEC = "祕密";
const mk = (G, bank, budget) => { const h = G.casHouseFix(G.casHouseNew(), D0).house; if (bank != null) h.bankroll = bank; if (budget != null) h.budget = budget; G.casStockHouseFix(h); G.casStockRoll(h, D0, {}); return h; };
const inv = (G, h) => { const s = G.casBookSnap([], h, 0, null); return G.casBookTotal(s) - G.casBookMinted(s) + G.casBookBurned(s); };
const run = (G, h, day, b) => G.casInvestRun(h, G.casStockHouseFix(h), day, SEC, b || 0);
const cost = (G, h, pool) => Object.values(G.casInvestFix(h).pool[pool].cost).reduce((a, b) => a + b, 0);

T("沒超過保留的部分不投：莊家 ≤ reserve、預算池 ≤ budgetKeep；同壹天只跑壹次", G => {
  const C = G.NUM.casino.invest, h = mk(G, C.reserve, C.budgetKeep);
  assert.ok(run(G, h, D0).ran); assert.strictEqual(cost(G, h, "house"), 0); assert.strictEqual(cost(G, h, "budget"), 0);
  assert.ok(!run(G, h, D0).ran, "同壹天不重跑");
});
T("莊家超過 reserve 的部分每天投 dailyPct%：錢給外面世界（池子變多）、手續費進預算池、總帳守恆、不是燒掉", G => {
  const C = G.NUM.casino.invest, F = G.NUM.casino.stock.feePct, h = mk(G, C.reserve + 1000000000, C.budgetKeep), t0 = inv(G, h), w0 = h.world, b0 = h.budget, k0 = h.bankroll;
  run(G, h, D0);
  const spent = cost(G, h, "house"), fee = Math.ceil((spent) * F / 100);
  assert.ok(spent > 0 && spent <= Math.floor(1000000000 * C.dailyPct / 100), "不超過每天的量：" + spent);
  assert.strictEqual(h.world - w0, spent - (h.budget - b0), "外面世界收到股款（成本裡含手續費，手續費進預算池）");
  assert.ok(h.budget > b0, "手續費進預算池");
  assert.ok(k0 - h.bankroll >= spent, "莊家付了股款和手續費");
  assert.strictEqual(inv(G, h), t0, "守恆");
  assert.strictEqual(G.casBookBurned(G.casBookSnap([], h, 0, null)), 0, "不是燒掉");
  assert.ok(fee >= 0);
});
T("預算池超過 budgetKeep 的部分也投；預算池付給自己的手續費不用搬；守恆", G => {
  const C = G.NUM.casino.invest, h = mk(G, C.reserve, C.budgetKeep + 500000000), t0 = inv(G, h), w0 = h.world;
  run(G, h, D0);
  const spent = cost(G, h, "budget"); assert.ok(spent > 0 && spent <= Math.floor(500000000 * C.dailyPct / 100));
  assert.strictEqual(h.world, w0 + spent); assert.strictEqual(h.budget, C.budgetKeep + 500000000 - spent);
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
T("先賣：比成本跌 stopLossPct% 賣壹半、漲 takeProfitPct% 賣三分之壹；賣的錢外面世界付回池子，守恆", G => {
  const C = G.NUM.casino.invest, h = mk(G, C.reserve, C.budgetKeep), H = G.casStockHouseFix(h), I = G.casInvestFix(h), P = I.pool.house;
  const [a, b] = ["greeneye", "redclaw"];
  P.own[a] = 300; P.cost[a] = 300 * H.px[a] * 2;  // 現價只有成本的一半：跌 50% → 停損
  P.own[b] = 300; P.cost[b] = Math.floor(300 * H.px[b] / 1.5); // 現價是成本的 1.5 倍：漲 50% → 停利
  const t0 = inv(G, h), w0 = h.world, k0 = h.bankroll;
  run(G, h, D0);
  assert.strictEqual(P.own[a], 150, "停損賣壹半"); assert.strictEqual(P.own[b], 200, "停利賣三分之壹");
  assert.ok(h.world < w0 && h.bankroll > k0, "外面世界付回莊家");
  assert.strictEqual(inv(G, h), t0, "守恆");
});
T("外面世界吃緊（低於起始 10%）：暫停買進，賣出也受壹天最多付池子 1% 的上限", G => {
  const C = G.NUM.casino.invest, WC = G.NUM.casino.world, h = mk(G, C.reserve + 1000000000, C.budgetKeep);
  h.world = Math.floor(WC.start * WC.lowPct / 100) - 1;
  run(G, h, D0); assert.strictEqual(cost(G, h, "house"), 0, "不買"); assert.strictEqual(G.casInvestFix(h).cur.paused.house, "world");
  const H = G.casStockHouseFix(h), P = G.casInvestFix(h).pool.house; P.own.greeneye = 100000; P.cost.greeneye = 100000 * H.px.greeneye * 2;
  const w0 = h.world; run(G, h, D1);
  assert.ok(w0 - h.world <= Math.floor(w0 * WC.lowPayPct / 100), "賣出受 1% 上限");
});
T("虧太多（總賺賠虧超過 stopPct%）暫停買進 stopDays 天；日報寫昨天的買賣和持有", G => {
  const C = G.NUM.casino.invest, h = mk(G, C.reserve + 1000000000, C.budgetKeep), H = G.casStockHouseFix(h);
  run(G, h, D0); assert.ok(cost(G, h, "house") > 0);
  const P = G.casInvestFix(h).pool.house; P.pnl = -Math.floor(cost(G, h, "house") * 10); // 已實現虧很多
  run(G, h, D1); assert.ok(P.stopUntil && P.stopUntil > D1, "暫停到 " + P.stopUntil);
  assert.strictEqual(G.casInvestFix(h).cur.paused.house, "stop");
  const doc = (() => { const s0 = G.casBookSnap([], mk(G).bank ? mk(G) : mk(G), 0, D0), s1 = G.casBookSnap([], h, 0, D2); return { day: D2, at: 0, snap: s1, diff: G.casBookDiff(s0, s1), opening: 0 }; })();
  const v = G.casReportView(doc), txt = v.secs.map(x => x.lines.join("|")).join("\n");
  assert.ok(/昨天館方投資外面世界/.test(txt) && /買 /.test(txt), txt.slice(0, 400));
  assert.ok(/館方現在持有/.test(txt));
});
T("種子有祕密：同樣的祕密同樣的買法、不同的祕密隨機那壹成不同", G => {
  const C = G.NUM.casino.invest, run2 = sec => { const h = mk(G, C.reserve + 1000000000, C.budgetKeep); G.casInvestRun(h, G.casStockHouseFix(h), D0, sec, 0); return JSON.stringify(G.casInvestFix(h).pool.house.own); };
  assert.strictEqual(run2("甲"), run2("甲"));
  assert.ok([1, 2, 3, 4, 5, 6].some(i => run2("甲") !== run2("乙" + i)), "不同祕密有時不同");
});
console.log(`${pass} passed, ${fail} failed（館方投資）`);
process.exit(fail ? 1 : 0);
