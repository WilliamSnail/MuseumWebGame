// 文化部館債 30 天內還清（11-14，翊文）：node test/casino_culture.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.NUM.casino.grants = []; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const mk = (G, bank, day) => { const h = G.casHouseFix(G.casHouseNew(), day).house; h.bankroll = bank; h.debt.culture = 1000000000; return h; };
const inv = (G, h) => { const s = G.casBookSnap([], h, 0, null); return G.casBookTotal(s) - G.casBookMinted(s) + G.casBookBurned(s); };

T("錢夠：每天至少還 剩餘本息 ÷ 剩下天數，30 天還清；還的錢回外面世界；守恆", G => {
  const H = G.NUM.casino.houseLoan, D0 = add(H.cultureDue, -30); let h = mk(G, 6000000000, D0);
  const t0 = inv(G, h), w0 = h.world; let day = D0;
  for (let i = 0; i < 31 && h.debt.culture > 0; i++) { day = add(day, 1); h = G.casHouseFix(h, day).house; }
  assert.strictEqual(h.debt.culture, 0, "到期日前還清，" + day); assert.ok(day <= H.cultureDue);
  assert.ok(!h.cultureLate); assert.ok(h.world > w0);
  const s = G.casBookSnap([], h, 0, null); assert.strictEqual(G.casBookTotal(s) - G.casBookMinted(s) + G.casBookBurned(s), t0 + G.casBookMinted(s) - 0 - (G.casBookMinted(s)) , "守恆");
});
T("莊家的錢不夠：預算池先墊（莊家欠預算池），還不夠記逾期，不印錢", G => {
  const H = G.NUM.casino.houseLoan, D0 = add(H.cultureDue, -10), h0 = mk(G, 0, D0); h0.budget = 20000000; h0.debt.culture = 1000000000;
  const need = Math.ceil(1000000000 * (1 + H.cultureInterestPct / 100) / 10);
  const h = G.casHouseFix(h0, add(D0, 1)).house;
  assert.ok(h.debt.budget > 0, "預算池墊了"); assert.ok(h.cul.late > 0 && h.cultureLate > 0, "還是不夠，記逾期"); assert.ok(h.cul.paid < need);
  assert.ok(h.budget >= 0 && h.bankroll >= 0, "沒有印錢");
});
T("到期日當天全部要還；日報寫「文化部館債：剩…天後到期，今天還了…」", G => {
  const H = G.NUM.casino.houseLoan, h = mk(G, 3000000000, add(H.cultureDue, -1));
  const r = G.casHouseFix(h, H.cultureDue).house; assert.strictEqual(r.debt.culture, 0);
  const h2 = mk(G, 200000000, add(H.cultureDue, -10)), r2 = G.casHouseFix(h2, add(H.cultureDue, -9)).house;
  const s0 = G.casBookSnap([], mk(G, 200000000, add(H.cultureDue, -10)), 0, add(H.cultureDue, -10)), s1 = G.casBookSnap([], r2, 0, add(H.cultureDue, -9));
  const v = G.casReportView({ day: add(H.cultureDue, -9), at: 0, snap: s1, diff: G.casBookDiff(s0, s1), opening: 0 }), txt = v.secs.map(x => x.lines.join("|")).join("\n");
  assert.ok(/文化部館債：剩 .*9 天後到期.*今天還了/.test(txt), txt.slice(0, 500));
});
T("館方投資不動還款要用的錢（莊家超過準備金的部分扣掉文化部館債才算可投）", G => {
  const C = G.NUM.casino.invest, h = G.casHouseFix(G.casHouseNew(), "2026-11-14").house; h.bankroll = C.reserve + 500000000; h.debt.culture = 500000000;
  G.casStockHouseFix(h); G.casStockRoll(h, "2026-11-14", {}); G.casInvestRun(h, G.casStockHouseFix(h), "2026-11-14", "s", 0);
  assert.strictEqual(Object.keys(G.casInvestFix(h).pool.house.own).length, 0, "沒有可投的");
});
T("館方投資：預算池要墊文化部館債的部分不能拿去投資（預算池可投 ＝ 超過保留金 − (館債 − 莊家現金)）", G => {
  const C = G.NUM.casino.invest, h = G.casHouseFix(G.casHouseNew(), "2026-11-14").house; h.bankroll = C.reserve; h.budget = C.budgetKeep + 450000000; h.debt.culture = 883000000;
  G.casStockHouseFix(h); G.casStockRoll(h, "2026-11-14", {}); G.casInvestRun(h, G.casStockHouseFix(h), "2026-11-14", "s", 0);
  assert.strictEqual(Object.keys(G.casInvestFix(h).pool.budget.own).length, 0, "館債要墊的錢大於預算池超過保留的部分：不投");
  h.debt.culture = 0; h.day = "2026-11-15"; G.casInvestRun(h, G.casStockHouseFix(h), "2026-11-15", "s", 0); assert.ok(Object.keys(G.casInvestFix(h).pool.budget.own).length > 0, "沒館債就照投");
});
T("日報對帳基準（casBookOpeningNext）：外面世界有帳的那天加「起始」不是餘額；已經加錯的壹次校正；之後不再動", G => {
  const WS = G.NUM.casino.world.start, mkSnap = w => ({ chips: 0, transit: 0, bank: 0, inplay: 0, mint: {}, burn: {}, house: { bankroll: 5, budget: 0, sea: 0, museum: 0, world: w, mint: {}, flow: {}, burn: {} } });
  let r = G.casBookOpeningNext({ opening: 1000, gap: 0, snap: mkSnap(null) }, mkSnap(WS + 764291250), WS); assert.strictEqual(r.opening, 1000 + WS); assert.strictEqual(r.fix, 0);
  r = G.casBookOpeningNext({ opening: 1000 + WS + 764291250, gap: -764291250, snap: mkSnap(WS + 764291250) }, mkSnap(WS + 800000000), WS); assert.strictEqual(r.opening, 1000 + WS, "壹次校正掉前壹份的差額"); assert.strictEqual(r.fix, -764291250);
  r = G.casBookOpeningNext({ opening: 1000 + WS, gap: 0, wfix: true, snap: mkSnap(WS) }, mkSnap(WS), WS); assert.strictEqual(r.opening, 1000 + WS); assert.strictEqual(r.fix, 0);
  r = G.casBookOpeningNext({ opening: 1000 + WS, gap: 55, wfix: true, snap: mkSnap(WS) }, mkSnap(WS), WS); assert.strictEqual(r.fix, 0, "已經校正過：之後的差額不再被吃掉");
  assert.ok(G.casBookOpeningNext(null, mkSnap(WS), WS).opening > 0);
});
console.log(`${pass} passed, ${fail} failed（文化部館債）`);
process.exit(fail ? 1 : 0);
