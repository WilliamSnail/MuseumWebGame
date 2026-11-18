// 文化部館債 30 天內還清（11-14，翊文）：node test/casino_culture.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.NUM.casino.grants = []; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const mk = (G, bank, day) => { const h = G.casHouseFix(G.casHouseNew(), day).house; h.bankroll = bank; h.debt.culture = 1000000000; return h; };
const inv = (G, h) => { const s = G.casBookSnap([], h, 0, null); return G.casBookTotal(s) - G.casBookMinted(s) + G.casBookBurned(s); };

T("錢夠：每天至少還 剩餘本息 ÷ 剩下天數，30 天還清；還的錢回已知世界；守恆", G => {
  const H = G.NUM.casino.houseLoan, D0 = add(H.cultureDue, -30); let h = mk(G, 6000000000, D0);
  const t0 = inv(G, h), w0 = h.world; let day = D0;
  for (let i = 0; i < 31 && h.debt.culture > 0; i++) { day = add(day, 1); h = G.casHouseFix(h, day).house; }
  assert.strictEqual(h.debt.culture, 0, "到期日前還清，" + day); assert.ok(day <= H.cultureDue);
  assert.ok(!h.cultureLate); assert.ok(h.world > w0);
  const s = G.casBookSnap([], h, 0, null); assert.strictEqual(G.casBookTotal(s) - G.casBookMinted(s) + G.casBookBurned(s), t0 + G.casBookMinted(s) - 0 - (G.casBookMinted(s)) , "守恆");
});
T("莊家的錢不夠：博物館資金先付（不記成莊家欠博物館資金），還不夠記逾期，不印錢", G => {
  const H = G.NUM.casino.houseLoan, D0 = add(H.cultureDue, -10), h0 = mk(G, 0, D0); h0.budget = H.cultureKeep + 20000000; h0.debt.culture = 1000000000;
  const need = Math.ceil(1000000000 * (1 + H.cultureInterestPct / 100) / 10);
  const h = G.casHouseFix(h0, add(D0, 1)).house;
  assert.strictEqual(h.cul.budget, 20000000, "博物館資金先付超過保留金的部分"); assert.strictEqual(h.debt.budget, 0, "不記成莊家欠博物館資金"); assert.ok(h.cul.late > 0 && h.cultureLate > 0, "還是不夠，記逾期"); assert.ok(h.cul.paid < need);
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
T("館方投資：博物館資金要墊文化部館債的部分不能拿去投資（博物館資金可投 ＝ 超過保留金 − (館債 − 莊家現金)）", G => {
  const C = G.NUM.casino.invest, h = G.casHouseFix(G.casHouseNew(), "2026-11-14").house; h.bankroll = C.reserve; h.budget = C.budgetKeep + 450000000; h.debt.culture = 883000000;
  G.casStockHouseFix(h); G.casStockRoll(h, "2026-11-14", {}); G.casInvestRun(h, G.casStockHouseFix(h), "2026-11-14", "s", 0);
  assert.strictEqual(Object.keys(G.casInvestFix(h).pool.budget.own).length, 0, "館債要墊的錢大於博物館資金超過保留的部分：不投");
  h.debt.culture = 0; h.day = "2026-11-15"; G.casInvestRun(h, G.casStockHouseFix(h), "2026-11-15", "s", 0); assert.ok(Object.keys(G.casInvestFix(h).pool.budget.own).length > 0, "沒館債就照投");
});
T("日報對帳基準（casBookOpeningNext）：已知世界有帳的那天加「起始」不是餘額；已經加錯的壹次校正；之後不再動", G => {
  const WS = G.NUM.casino.world.start, mkSnap = w => ({ chips: 0, transit: 0, bank: 0, inplay: 0, mint: {}, burn: {}, house: { bankroll: 5, budget: 0, sea: 0, museum: 0, world: w, mint: {}, flow: {}, burn: {} } });
  let r = G.casBookOpeningNext({ opening: 1000, gap: 0, snap: mkSnap(null) }, mkSnap(WS + 764291250), WS); assert.strictEqual(r.opening, 1000 + WS); assert.strictEqual(r.fix, 0);
  r = G.casBookOpeningNext({ opening: 1000 + WS + 764291250, gap: -764291250, snap: mkSnap(WS + 764291250) }, mkSnap(WS + 800000000), WS); assert.strictEqual(r.opening, 1000 + WS, "壹次校正掉前壹份的差額"); assert.strictEqual(r.fix, -764291250);
  r = G.casBookOpeningNext({ opening: 1000 + WS, gap: 0, wfix: true, snap: mkSnap(WS) }, mkSnap(WS), WS); assert.strictEqual(r.opening, 1000 + WS); assert.strictEqual(r.fix, 0);
  r = G.casBookOpeningNext({ opening: 1000 + WS, gap: 55, wfix: true, snap: mkSnap(WS) }, mkSnap(WS), WS); assert.strictEqual(r.fix, 0, "已經校正過：之後的差額不再被吃掉");
  assert.ok(G.casBookOpeningNext(null, mkSnap(WS), WS).opening > 0);
});
T("墊付不低於博物館資金保留金：博物館資金剛好在保留金上時不墊，全記逾期；超過的部分才墊", G => {
  const H = G.NUM.casino.houseLoan, D0 = add(H.cultureDue, -10), h0 = mk(G, 0, D0); h0.budget = H.cultureKeep + 30000000; h0.debt.culture = 1000000000;
  const h = G.casHouseFix(h0, add(D0, 1)).house;
  assert.ok(h.budget >= H.cultureKeep, "博物館資金沒被墊到保留金以下：" + h.budget); assert.strictEqual(h.cul.budget, 30000000, "只付超過保留金的部分"); assert.strictEqual(h.debt.budget, 0);
  assert.ok(h.cul.late > 0 && h.cultureLate > 0, "不夠的記逾期");
  const h1 = mk(G, 0, D0); h1.budget = H.cultureKeep; const r = G.casHouseFix(h1, add(D0, 1)).house; assert.strictEqual(r.cul.budget, 0); assert.strictEqual(r.budget, H.cultureKeep); assert.ok(r.cul.late > 0);
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
T("決定 0116：博物館資金碰到保留金後，莊家只付他超過 cultureBankMin 的部分；期限內莊家賺的錢不拿去還館債（除了超過的）；期限過了才還", G => {
  const H = G.NUM.casino.houseLoan, D0 = add(H.cultureDue, -10);
  const a = mk(G, H.cultureBankMin + 40000000, D0); a.budget = H.cultureKeep; a.debt.culture = 1000000000;
  const ra = G.casHouseFix(a, add(D0, 1)).house; assert.ok(ra.cul.paid > 0 && ra.cul.budget === 0); assert.ok(ra.bankroll >= H.cultureBankMin - 1, "莊家留在 cultureBankMin 以上：" + ra.bankroll);
  const b = mk(G, H.cultureBankMin - 1000, D0); b.budget = H.cultureKeep; b.debt.culture = 1000000000;
  const rb = G.casHouseFix(b, add(D0, 1)).house; assert.strictEqual(rb.cul.paid, 0, "莊家沒到門檻：不付"); assert.ok(rb.cul.late > 0); assert.strictEqual(rb.bankroll, b.bankroll);
  const c = mk(G, H.reserve + 200000000 - 1000000000 + 1000000000 - 0, D0); c.bankroll = H.cultureBankMin - 5000000; c.budget = H.cultureKeep; c.debt.culture = 1000000000;
  assert.strictEqual(G.casHouseFix(c, add(D0, 1)).house.cul.paid, 0, "期限內莊家賺的錢（超過準備金但沒到門檻）不拿去還館債");
  assert.strictEqual(H.cultureExtDays, 60);
});
T("決定 0116：全館大禮包壹天付出到 packDayCap 之後，當天的包只發 1～3 星；隔天恢復；有記帳", G => {
  const C = G.NUM.casino, day = "2026-11-17", h = G.casHouseFix(G.casHouseNew(), day).house; h.bankroll = 5000000000;
  const mkW = () => { const w = G.casWalletNew ? G.casWalletNew() : null; return w; };
  G.setRng(() => 0.999); // 骰到最大：不封頂會是五星
  const cap = C.packDayCap; assert.strictEqual(cap, 30000000);
  const w = G.casWalletFix ? G.casWalletFix({}, day) : mkW(); w.pk.left = 50; w.pk.day = day;
  assert.ok(!G.casPackCapped(h, day)); const r1 = G.casOpenPacks(w, h, 1, day); assert.strictEqual(r1.packs[0].stars, 5, "沒到上限：照骰");
  assert.ok(G.casPackCapped(h, day), "壹包 1 億已經超過上限");
  const r2 = G.casOpenPacks(w, h, 3, day); assert.ok(r2.packs.every(p => p.stars <= 3), "到上限：只發 1～3 星");
  assert.ok(!G.casPackCapped(h, "2026-11-18"), "隔天恢復"); G.setRng(null);
});
T("決定 0118：館債那期（舊規則莊家多付的）一次性由博物館資金補撥給莊家；只做壹次（cFix）；不改館債餘額；博物館資金不夠就不做；關掉就不做；總和守恆", G => {
  const F = G.NUM.casino.houseLoan.fix, K = G.NUM.casino.houseLoan.cultureKeep, mk2 = () => { const h = G.casHouseFix(G.casHouseNew(), "2026-11-17").house; h.cul = { paid: 13393619, late: 0, budget: 0, day: "2026-11-17", due: "2027-01-12" }; h.debt.culture = 900000000; h.bankroll = 26914584; h.budget = K + 100000000; return h; };
  const h = mk2(), b0 = h.budget, d0 = h.debt.culture, s0 = G.casBookSnap([], h, 0, "2026-11-17");
  const r = G.casHouseFix(h, "2026-11-17").house; assert.strictEqual(r.bankroll, 26914584 + F.amt); assert.strictEqual(r.budget, b0 - F.amt); assert.strictEqual(r.debt.culture, d0); assert.ok(r.cFix); assert.strictEqual(r.led.flow.budgetFix, F.amt);
  const r2 = G.casHouseFix(r, "2026-11-17").house; assert.strictEqual(r2.bankroll, 26914584 + F.amt, "只做壹次");
  const s1 = G.casBookSnap([], r, 0, "2026-11-17"); assert.strictEqual(G.casBookTotal(s1) - G.casBookTotal(s0), 0, "總和不變（搬動，不是憑空）");
  const w = mk2(); w.budget = K + F.amt - 1; assert.strictEqual(G.casHouseFix(w, "2026-11-17").house.bankroll, 26914584, "博物館資金不夠：不做");
  G.NUM.casino.houseLoan.fix.on = false; assert.strictEqual(G.casHouseFix(mk2(), "2026-11-17").house.bankroll, 26914584, "關掉：不做");
});
console.log(`${pass} passed, ${fail} failed（文化部館債）`);
process.exit(fail ? 1 : 0);
