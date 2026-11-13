// 館內 GDP 和景氣指數（11-13，數值平衡）：node test/casino_gdp.test.cjs（npm test 也會跑）
// 活動次數有記到、GDP 四塊的算法、成長率要兩段各 7 天、平滑、人太少不算、日報有一段景氣。數字讀 NUM。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { G.setRng(G.mulberry32(9)); fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 5).join("\n    ")); } finally { G.setRng(null); } };
const D = "2026-11-14";
const plus = (d, n) => { const [y, m, x] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, x + n)).toISOString().slice(0, 10); };
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

T("活動次數：餐車、21 點手數、拚經濟成功／失敗、門票人數都記在 house.act，快照相減看得到", G => {
  const w = G.casWalletFix(G.casWalletNew(), D), house = G.casHouseFix(G.casHouseNew(), D).house;
  const a = G.casBookSnap([w], house, 0, D);
  G.casOpenPacks(w, house, 2, D); G.casBuy(w, house, 1, D);
  const seq = (...xs) => { let i = 0; return () => xs[Math.min(i++, xs.length - 1)]; }, atR = r => (r + 0.5) / (G.NUM.casino.econ.rMax + 1);
  G.casEconPlay(w, house, D, seq(atR(50), 0.3, 0.99)); G.casEconPlay(w, house, D, seq(atR(10), 0.99));
  const round = { bet: 1000, out: { payout: 0 }, settled: false }; G.casSettle(w, house, round, { day: D });
  const d = G.casBookDiff(a, G.casBookSnap([w], house, 0, D));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(d.act)), { food: 1, econWin: 1, econFail: 1, bjHands: 1 });
  assert.strictEqual(d.active7, 1, "今天來過的人");
});
T("過去 7 天有幾個人：seen 7 天內算，更早的不算；舊錢包沒有 seen 不算", G => {
  const a = G.casWalletFix(G.casWalletNew(), D), b = G.casWalletFix(G.casWalletNew(), plus(D, -6)), c = G.casWalletFix(G.casWalletNew(), plus(D, -7));
  const house = G.casHouseFix(G.casHouseNew(), D).house, old = G.casWalletFix({ v: 1, chips: 1 }, null);
  assert.strictEqual(G.casBookSnap([a, b, c, old], house, 0, D).active7, 2);
});
T("GDP 四塊：消費、投資、政府支出、淨出口，用次數乘標準值（不看賺賠金額）", G => {
  const K = G.NUM.casino.gdp;
  const g = G.casGdpOf({ act: { food: 3, bjHands: 10, econWin: 2, econFail: 4 }, bank: 10000000, mint: { ticket: 300 }, houseMint: { ticketBudget: 200, ticketMuseum: 500 } });
  assert.strictEqual(g.C, 3 * K.foodAvg + 10 * K.bjHand); assert.strictEqual(g.G, 2 * K.econWin);
  assert.strictEqual(g.I, Math.floor(10000000 * K.investPct / 100)); assert.strictEqual(g.NX, 1000 - 4 * K.econSink);
  assert.strictEqual(g.total, g.C + g.I + g.G + g.NX);
  assert.strictEqual(G.casGdpOf({ act: {}, bank: -5000000 }).I, 0, "存款減少不算負的投資");
  assert.strictEqual(G.casGdpOf(null).total, 0);
});
const series = (G, vals, end = D) => vals.map((v, i) => ({ from: i ? plus(end, -(vals.length - i)) : null, to: plus(end, -(vals.length - 1 - i)), total: v }));
T("成長率：兩段各 7 天才算；不夠 14 天 g＝null、指數維持昨天的", G => {
  const r = G.casGdpIndex(series(G, Array(10).fill(100)), 0.4, 5);
  assert.strictEqual(r.g, null); near(r.bIn, 0.4);
  assert.strictEqual(G.casGdpIndex([], 0, 5).b, 0);
});
T("成長率＝近 7 天合計對前 7 天合計；剛好 +10% ＝ 指數 1；一路平滑", G => {
  const flat = series(G, [...Array(7).fill(100), ...Array(7).fill(110)]);
  const r = G.casGdpIndex(flat, 0, 5); near(r.g, 0.1); near(r.bIn, 0.5, 1e-3); near(r.b, 0.25, 1e-3);
  assert.strictEqual(r.label, "景氣普通");
  const up = G.casGdpIndex(series(G, [...Array(7).fill(100), ...Array(7).fill(200)]), 1, 5); near(up.bIn, 1, 1e-3); assert.strictEqual(up.label, "景氣好", "館內指數 1 ＋ 外部 0 ＝ 0.5 > 0.3");
  const full = G.casGdpIndex(series(G, [...Array(7).fill(100), ...Array(7).fill(200)]), 1, 5, 1); near(full.b, 1, 1e-3); assert.strictEqual(full.label, "景氣好");
  const down = G.casGdpIndex(series(G, [...Array(7).fill(100), ...Array(7).fill(50)]), -1, 5, -1); near(down.b, -1, 1e-3); assert.strictEqual(down.label, "景氣差");
  const same = G.casGdpIndex(series(G, Array(14).fill(100)), 1, 5); near(same.g, 0); near(same.bIn, 0.5, 1e-3);
});
T("過去 7 天來的人少於 minPeople：館內指數 0（樣本太少）", G => {
  const r = G.casGdpIndex(series(G, [...Array(7).fill(100), ...Array(7).fill(200)]), 1, G.NUM.casino.gdp.minPeople - 1);
  assert.strictEqual(r.bIn, 0); assert.strictEqual(r.b, 0);
});
T("很久沒人看日報：一份蓋好幾天，平均分到每一天", G => {
  const hist = [{ from: null, to: plus(D, -14), total: 100 }, { from: plus(D, -14), to: plus(D, -7), total: 700 }, { from: plus(D, -7), to: D, total: 1400 }];
  const r = G.casGdpIndex(hist, 0, 5);
  near(r.g, 1, 1e-9); assert.strictEqual(r.perDay, 200);
});
T("日報有「景氣」一段；第一份沒有 gdp 就沒有這一段", G => {
  const w = G.casWalletFix(G.casWalletNew(), D), house = G.casHouseFix(G.casHouseNew(), D).house;
  const snap = G.casBookSnap([w], house, 0, D), diff = G.casBookDiff(null, snap);
  const base = { day: D, at: Date.UTC(2026, 10, 14), snap, diff };
  assert.ok(!G.casReportView(base).secs.some(s => s.t.includes("景氣")));
  const view = G.casReportView(Object.assign({}, base, { gdp: G.casGdpOf(diff), index: G.casGdpIndex([{ from: null, to: D, total: 0 }], 0, 1) }));
  const sec = view.secs.find(s => s.t.includes("景氣"));
  assert.ok(sec && sec.lines[0].includes("景氣普通") && sec.lines.join("").includes("14 天") && sec.lines.join("").includes("來的人太少"));
});
console.log(`館內 GDP 和景氣指數：${pass} 過，${fail} 沒過`);
process.exit(fail ? 1 : 0);
