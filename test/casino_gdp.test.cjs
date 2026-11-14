// 館內 GDP 和景氣指數（11-13，數值平衡）：node test/casino_gdp.test.cjs（npm test 也會跑）
// 活動次數有記到、GDP 四塊的算法、成長率要兩段各 7 天、平滑、人太少不算、日報有一段景氣。數字讀 NUM。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.NUM.casino.grants = []; // 文化部補助另外測（casino_stock.test）
  try { G.setRng(G.mulberry32(9)); fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 5).join("\n    ")); } finally { G.setRng(null); } };
const D = "2026-11-14", D0 = D;
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

const ECON = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "content", "economy.json"), "utf8"));
T("content/economy.json 的格式（每日排劇情的排程會改它）：季別、年增率、最近四季、公布日；年增率在合理範圍", G => {
  const g = ECON.gdp;
  assert.ok(/^[0-9]{4}Q[1-4]$/.test(g.quarter), "quarter：" + g.quarter);
  assert.ok(typeof g.yoy === "number" && g.yoy > -30 && g.yoy < 40, "yoy：" + g.yoy);
  assert.ok(Array.isArray(g.history) && g.history.length >= 2 && g.history.length <= 8 && g.history.every(x => typeof x === "number" && x > -30 && x < 40));
  assert.strictEqual(g.history[g.history.length - 1], g.yoy, "history 最後一個是最新這一季");
  assert.ok(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(g.published));
  assert.ok(G.casGdpExt(ECON, g.published).ok);
});
T("外部景氣：最新一季對最近四季平均，差 extSpread 個百分點＝1；太久沒更新或資料壞掉＝0", G => {
  const K = G.NUM.casino.gdp, mk = (yoy, h, published = "2026-10-30") => ({ gdp: { quarter: "2026Q3", yoy, history: h, published } });
  const e = G.casGdpExt(mk(10, [10, 10, 10, 10])); assert.strictEqual(e.b, 0);
  const up = G.casGdpExt(mk(14, [10, 10, 10, 14])); near(up.mean, 11); near(up.b, Math.min(1, 3 / K.extSpread), 1e-3);
  assert.strictEqual(G.casGdpExt(mk(20, [1, 1, 1, 20])).b, 1); assert.strictEqual(G.casGdpExt(mk(-9, [10, 10, 10, -9])).b, -1);
  assert.strictEqual(G.casGdpExt(mk(5, [5]), "2026-11-01").b, 0, "只有一季沒辦法比");
  const old = G.casGdpExt(mk(14, [10, 10, 10, 14]), plus("2026-10-30", K.extStaleDays + 1)); assert.strictEqual(old.b, 0); assert.ok(old.stale);
  assert.strictEqual(G.casGdpExt(null).b, 0); assert.strictEqual(G.casGdpExt({ gdp: { history: "x" } }).b, 0);
});
T("景氣的影響：拚經濟撥款、門票、存款利率 ×(1 ± fxPct%)；沒有景氣（b＝0）完全照舊", G => {
  const K = G.NUM.casino.gdp, seq = (...xs) => { let i = 0; return () => xs[Math.min(i++, xs.length - 1)]; }, atR = r => (r + 0.5) / (G.NUM.casino.econ.rMax + 1);
  const play = b => { const w = G.casWalletFix(G.casWalletNew(), D), house = G.casHouseFix(G.casHouseNew(), D).house; house.econ.b = b; const r = G.casEconPlay(w, house, D, seq(atR(50), 0.3, 0.99)); return { r, house }; };
  const base = play(0).r.amount; assert.strictEqual(base, 50 * G.NUM.casino.econ.winPer);
  const hi = play(1).r; assert.strictEqual(hi.amount, Math.floor(base * (1 + K.fxPct / 100)));
  const lo = play(-1).r; assert.strictEqual(lo.amount, Math.floor(base * (1 - K.fxPct / 100)));
  assert.strictEqual(G.casFxMul({ econ: { b: 5 } }), 1 + K.fxPct / 100, "夾在 ±1"); assert.strictEqual(G.casFxMul(null), 1);
  const bank = b => { const w = G.casWalletFix(G.casWalletNew(), D), house = G.casHouseFix(G.casHouseNew(), D).house; house.econ.b = b; w.bank = { save: 1000000, terms: [], seq: 0, day: D, earned: 0, notes: [] }; G.casBankAccrue(w, house, plus(D, 1)); return w.bank.earned; };
  assert.strictEqual(bank(0), Math.floor(1000000 * G.NUM.casino.bank.savePct / 100));
  assert.strictEqual(bank(1), Math.floor(1000000 * G.NUM.casino.bank.savePct / 100 * (1 + K.fxPct / 100)));
});
T("政策：拚經濟成功抽到的政策持續到隔天；振興觀光門票多、整修地下地下撿多、撥款多／少；第三天失效", G => {
  const K = G.NUM.casino.gdp, mk = () => ({ w: G.casWalletFix(G.casWalletNew(), D), house: G.casHouseFix(G.casHouseNew(), D).house });
  assert.strictEqual(K.policyFx.length, G.CAS_ECON.policies.length, "每項政策都有對應的效果");
  const s = mk(); const seq = (...xs) => { let i = 0; return () => xs[Math.min(i++, xs.length - 1)]; }, atR = r => (r + 0.5) / (G.NUM.casino.econ.rMax + 1);
  const pol = idx => (idx + 0.5) / G.CAS_ECON.policies.length;
  const r = G.casEconPlay(s.w, s.house, D, seq(atR(50), pol(1), 0.99)); // 第 1 項：兩岸觀光客自由行 → tourism
  assert.strictEqual(r.fx, "tourism"); assert.ok(r.lines.some(l => l.includes("政策效果")));
  assert.strictEqual(G.casFxPolicy(s.house, D, "ticket"), 1 + K.polPct / 100); assert.strictEqual(G.casFxPolicy(s.house, plus(D, 1), "ticket"), 1 + K.polPct / 100);
  assert.strictEqual(G.casFxPolicy(s.house, plus(D, 2), "ticket"), 1, "第三天失效"); assert.strictEqual(G.casFxPolicy(s.house, D, "find"), 1);
  const t = (house, d) => { const w = G.casWalletFix(G.casWalletNew(), d), P = G.newProfile("challenge"); P.hallVisitors = 0; const { buildProfile } = require("./sim_cellar.cjs"); void buildProfile; return { w, P }; };
  void t;
  const tix = pol2 => { const house = G.casHouseFix(G.casHouseNew(), D).house; if (pol2) house.pol = { idx: 1, fx: "tourism", day: D }; G.casNpcLive(house, D, Infinity, "s", [], null); return { total: house.npcs.crowd.ticket }; }; // 11-14：門票改成到訪的人自己付（shared/npc_spend.js），政策照樣讓票價多壹成
  const a = tix(false), b = tix(true); assert.ok(a.total > 0 && b.total > a.total, `${a.total} → ${b.total}`);
  const f = (pol3) => { const w = G.casWalletFix(G.casWalletNew(), D), house = G.casHouseFix(G.casHouseNew(), D).house; if (pol3) house.pol = { idx: 5, fx: "cellar", day: D }; return G.casCellarFind(w, house, G.CELLAR[0].rooms[0].id, D, () => 0.01).found; };
  assert.ok(f(true) > f(false) && f(true) === Math.floor(f(false) * (1 + K.polPct / 100)));
  const tight = mk(); tight.house.pol = { idx: 7, fx: "tighten", day: D };
  assert.strictEqual(G.casEconPlay(tight.w, tight.house, D, seq(atR(50), 0.3, 0.99)).amount, Math.floor(50 * G.NUM.casino.econ.winPer * (1 - K.polPct / 100)));
});
T("日報景氣段：外面世界的景氣、景氣的影響、有效的政策", G => {
  const w = G.casWalletFix(G.casWalletNew(), D), house = G.casHouseFix(G.casHouseNew(), D).house;
  house.pol = { idx: 1, fx: "tourism", day: D };
  const snap = G.casBookSnap([w], house, 0, D); snap.pol = house.pol;
  const diff = G.casBookDiff(null, snap), idx = G.casGdpIndex([{ from: null, to: D, total: 0 }], 0, 5, 0.5);
  const sec = G.casReportView({ day: D, at: Date.UTC(2026, 10, 14), snap, diff, gdp: G.casGdpOf(diff), index: idx, ext: { ok: true, quarter: "2026Q3" } }).secs.find(s => s.t.includes("景氣"));
  const text = sec.lines.join("|");
  assert.ok(text.includes("外面世界的景氣：比前幾季熱") && text.includes("景氣的影響：拚經濟撥款") && text.includes("有效的政策") && text.includes("門票多一成"), text);
});
T("莊家缺錢保護：莊家少於 low 免費大禮包只發 lowPacks 包、破產只發 brokePacks 包；買來的券不受影響；錢回來就恢復", G => {
  const H = G.NUM.casino.health, D = G.NUM.casino.dailyPacks, mk = bank => { const w = G.casWalletFix(G.casWalletNew(), D0), house = G.casHouseFix(G.casHouseNew(), D0).house; house.bankroll = bank; return { w, house }; };
  const open = (s, n = 2) => G.casOpenPacks(s.w, s.house, n, D0);
  assert.strictEqual(G.casPackCut(null), 0); assert.strictEqual(G.casPackCut(mk(H.low).house), 0);
  let s = mk(H.low * 2); let r = open(s); assert.ok(r.ok && r.packs.length === D, "健康：全發");
  s = mk(H.low - 1); r = open(s); assert.ok(r.ok && r.packs.length === H.lowPacks, "缺錢：只發 lowPacks 包"); assert.ok(!open(s).ok); assert.ok(open(s).reason.includes("莊家現在缺錢"));
  s = mk(0); r = open(s); assert.strictEqual(r.ok, H.brokePacks > 0, "破產：brokePacks 包");
  s = mk(-5); s.w.tickets = 3; r = open(s, 2); assert.ok(r.ok && r.packs.length === 2 && s.w.tickets === 1 && s.w.pk.left === D, "破產時買來的券還能開，免費的不動");
  s = mk(H.low - 1); open(s); s.house.bankroll = H.low * 2; r = open(s); assert.ok(r.ok && r.packs.length === D - H.lowPacks, "錢回來就恢復（今天剩下的）");
});

T("預算池硬下限：低到 budgetFloor，拚經濟成功完全不撥款（失敗照舊）；高一點只是凍結", G => {
  const C = G.NUM.casino.econ, seq = (...xs) => { let i = 0; return () => xs[Math.min(i++, xs.length - 1)]; }, atR = r => (r + 0.5) / (C.rMax + 1);
  const mk = b => { const w = G.casWalletFix(G.casWalletNew(), D), house = G.casHouseFix(G.casHouseNew(), D).house; house.budget = b; return { w, house }; };
  let s = mk(C.budgetFloor); let r = G.casEconPlay(s.w, s.house, D, seq(atR(50), 0.3, 0.99));
  assert.ok(r.win && r.amount === 0 && r.dead && s.house.budget === C.budgetFloor && s.house.bankroll === G.NUM.casino.houseStart); assert.ok(r.lines.some(l => l.includes("見底")));
  s = mk(C.budgetFloor + 1); r = G.casEconPlay(s.w, s.house, D, seq(atR(50), 0.3, 0.99)); assert.ok(r.amount > 0 && r.frozen && !r.dead);
  s = mk(C.budgetFloor); r = G.casEconPlay(s.w, s.house, D, seq(atR(10), 0.99)); assert.ok(!r.win && s.house.sea > 0, "失敗不受影響");
});
T("日報的莊家健康度：流入／流出比值，低於 0.6 寫失血；第一份不寫", G => {
  const w = G.casWalletFix(G.casWalletNew(), D), house = G.casHouseFix(G.casHouseNew(), D).house, a = G.casBookSnap([w], house, 0, D);
  G.casHouseMove(house, "pack", -1000); G.casHouseMove(house, "bj", 300);
  const b = G.casBookSnap([w], house, 0, plus(D, 1)), view = G.casReportView({ day: plus(D, 1), at: Date.UTC(2026, 10, 15), snap: b, diff: G.casBookDiff(a, b) });
  const text = view.secs[0].lines.join("|"); assert.ok(text.includes("比值 0.30") && text.includes("失血") && text.includes("免費大禮包每天少發"), text);
  const first = G.casReportView({ day: D, at: 0, snap: b, diff: G.casBookDiff(null, b) }); assert.ok(!first.secs[0].lines.join("").includes("健康度"));
});
console.log(`館內 GDP 和景氣指數：${pass} 過，${fail} 沒過`);
process.exit(fail ? 1 : 0);
