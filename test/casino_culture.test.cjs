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
  const H = G.NUM.casino.houseLoan, D0 = add(H.cultureDue, -10), h0 = mk(G, 0, D0); h0.budget = H.cultureKeep + 20000000; h0.debt.culture = 1000000000;
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
T("墊付不低於預算池保留金：預算池剛好在保留金上時不墊，全記逾期；超過的部分才墊", G => {
  const H = G.NUM.casino.houseLoan, D0 = add(H.cultureDue, -10), h0 = mk(G, 0, D0); h0.budget = H.cultureKeep + 30000000; h0.debt.culture = 1000000000;
  const h = G.casHouseFix(h0, add(D0, 1)).house;
  assert.ok(h.budget >= H.cultureKeep, "預算池沒被墊到保留金以下：" + h.budget); assert.strictEqual(h.debt.budget, 30000000, "只墊超過保留金的部分");
  assert.ok(h.cul.late > 0 && h.cultureLate > 0, "不夠的記逾期");
  const h1 = mk(G, 0, D0); h1.budget = H.cultureKeep; const r = G.casHouseFix(h1, add(D0, 1)).house; assert.strictEqual(r.debt.budget, 0); assert.strictEqual(r.budget, H.cultureKeep); assert.ok(r.cul.late > 0);
});
T("到期日自動展延壹次 30 天：到期日剩下的接著按剩下天數分期；展延過、期限也過了就不再設到期日（只靠莊家賺到的錢壹半還債）；不印錢", G => {
  const H = G.NUM.casino.houseLoan, ext = add(H.cultureDue, H.cultureExtDays);
  assert.strictEqual(G.casCultureDue({}), H.cultureDue); assert.strictEqual(G.casCultureDue({ cultureExt: true }), ext);
  let h = mk(G, 0, add(H.cultureDue, -1)); h.budget = H.cultureKeep; h.debt.culture = 900000000;
  h = G.casHouseFix(h, H.cultureDue).house;
  assert.ok(h.cultureExt, "到期日自動展延"); assert.strictEqual(h.cul.due, ext); assert.ok(h.debt.culture > 0, "展延：沒有被要求壹次付清");
  const need = Math.ceil(900000000 * (1 + H.cultureInterestPct / 100) / (H.cultureExtDays + 1)); assert.ok(h.cul.late <= need + 1 && h.cul.late >= need - 1 - 0, "當天只要壹期：" + h.cul.late + " vs " + need);
  const h2 = G.casHouseFix(h, add(ext, 3)).house; assert.ok(h2.cul.late === 0 && h2.cul.paid === 0, "展延期限過了：不再分期"); assert.ok(h2.cultureExt && G.casCultureDue(h2) === ext);
  const d0 = h2.debt.culture; h2.bankroll = G.NUM.casino.houseLoan.reserve + 200000000; const h3 = G.casHouseFix(h2, add(ext, 4)).house; assert.ok(h3.debt.culture < d0, "莊家賺到超過準備金：壹半還債");
  const w = mk(G, 0, add(H.cultureDue, -1)); w.debt.culture = 0; assert.ok(!G.casHouseFix(w, H.cultureDue).house.cultureExt, "沒有欠就不展延");
});
console.log(`${pass} passed, ${fail} failed（文化部館債）`);
process.exit(fail ? 1 : 0);
