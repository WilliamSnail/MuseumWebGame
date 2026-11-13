// 莊家跟整個經濟接軌（11-14，規劃 2.11、2.11a）：node test/casino_house.test.cjs（npm test 也會跑）
// 破產換日借錢重開（預算池、外面世界）、記債、利息、還債、莊家吃緊／破產時的最大注、壹天賠付上限、大禮包縮水；
// 借款額度上限、壹天升幾級、莊家的錢要夠才能借、全館未還本金上限、欠款中額度鎖、工作還款上限；守恆。數字讀 NUM。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.NUM.casino.grants = []; G.NUM.casino.houseLoan.cultureInterestPct = 0; /* 文化部利息另外在 casino_world.test 測 */ try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const D0 = "2026-11-14", D1 = "2026-11-15", add = (d, n) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const house = (G, bank, day = D0) => { const h = G.casHouseFix(G.casHouseNew(), day).house; h.bankroll = bank; return h; };
const wallet = (G, chips = 50000000, day = D0) => { const w = G.casWalletFix(G.casWalletNew(), day); w.chips = chips; w.st.hands = 1; return w; };
const total = (G, w, h) => G.casBookTotal(G.casBookSnap(Array.isArray(w) ? w : [w], h, 0, null));

T("破產換日：先跟預算池借閒錢的壹小部分，不夠再跟外面世界貸款，補到準備金；記成債；不是 mint reset", G => {
  const H = G.NUM.casino.houseLoan, h = house(G, -50000000); h.econ.perDay = 0;
  const t0 = G.casBookTotal(G.casBookSnap([], h, 0, null));
  const r = G.casHouseFix(h, D1);
  assert.strictEqual(r.house.bankroll, H.reserve, "補到準備金");
  const spare = G.NUM.casino.econ.budgetStart - Math.floor(G.NUM.casino.econ.budgetStart * H.budgetKeepPct / 100);
  const fromBudget = Math.min(H.reserve + 50000000, Math.floor(spare * H.budgetPct / 100), H.budgetMax);
  assert.strictEqual(r.house.debt.budget, fromBudget, "預算池借了 " + fromBudget);
  assert.strictEqual(r.house.debt.world, H.reserve + 50000000 - fromBudget, "剩下的外面世界貸款");
  assert.strictEqual(r.house.budget, G.NUM.casino.econ.budgetStart - fromBudget, "預算池少了");
  assert.ok(!(r.house.led.mint.reset), "沒有印錢補回");
  assert.strictEqual(r.house.led.flow.worldLoan, r.house.debt.world, "外面世界貸款記成從外面世界流進莊家"); assert.strictEqual(r.house.led.world.worldLoan, -r.house.debt.world, "外面世界的池子少了這麼多");
  assert.ok(/借/.test(r.reopen), r.reopen);
  assert.strictEqual(r.house.reopened, 1);
  // 守恆：預算池→莊家是搬，貸款是 mint
  assert.strictEqual(G.casBookTotal(G.casBookSnap([], r.house, 0, null)) - G.casBookMinted(G.casBookSnap([], r.house, 0, null)), t0, "錢只增加 mint 的部分");
});
T("預算池沒有閒錢（≤ 起始的壹半）就不借；外面世界的上限用完就停在負的（停業整頓）", G => {
  const H = G.NUM.casino.houseLoan, h = house(G, -50000000);
  h.budget = Math.floor(G.NUM.casino.econ.budgetStart * H.budgetKeepPct / 100); // 剛好壹半：沒有閒錢
  h.econ.perDay = 0; const w0 = H.creditMin - 1000000; h.debt.world = w0; // 外面世界只剩 100 萬可以借（扣掉壹天的利息）
  const r = G.casHouseFix(h, D1);
  const room = H.creditMin - (w0 + Math.ceil(w0 * H.interestPct / 100));
  assert.strictEqual(r.house.debt.budget, 0);
  assert.strictEqual(r.house.debt.world, H.creditMin, "借到上限為止");
  assert.strictEqual(r.house.bankroll, -50000000 + room, "還是負的");
  assert.strictEqual(r.reopen, G.CAS_TEXT.houseStillBroke);
  assert.strictEqual(r.house.reopened, 0, "沒重開");
});
T("外面世界的上限跟館內 GDP 和外部景氣掛鉤，最少 creditMin", G => {
  const H = G.NUM.casino.houseLoan, h = house(G, 0);
  assert.strictEqual(G.casHouseCredit(h), H.creditMin);
  h.econ.perDay = 100000000; h.econ.bExt = 0;
  assert.strictEqual(G.casHouseCredit(h), H.creditDays * 100000000);
  h.econ.bExt = 1; assert.strictEqual(G.casHouseCredit(h), Math.floor(H.creditDays * 100000000 * (1 + H.creditExtPct / 100)));
  h.econ.bExt = -1; assert.ok(G.casHouseCredit(h) < H.creditDays * 100000000);
  h.econ.perDay = "壞"; h.econ.bExt = NaN; assert.strictEqual(G.casHouseCredit(h), H.creditMin, "壞資料不丟錯");
});
T("外面世界貸款的利息記在債上（複利），不動莊家的錢；隔很多天最多算 30 天", G => {
  const H = G.NUM.casino.houseLoan, h = house(G, H.reserve); h.debt.world = 100000000;
  const r = G.casHouseFix(h, add(D0, 1)).house;
  assert.strictEqual(r.debt.world, 100000000 + Math.ceil(100000000 * H.interestPct / 100), "壹天的利息");
  assert.strictEqual(r.bankroll, H.reserve, "莊家的錢沒動");
  const h2 = house(G, H.reserve); h2.debt.world = 100000000;
  const r2 = G.casHouseFix(h2, add(D0, 400)).house;
  assert.ok(r2.debt.world < 100000000 * Math.pow(1 + H.interestPct / 100, 31), "最多算 30 天");
});
T("還債：換日時超過準備金的部分壹半拿去還，順序預算池→文化部→外面世界；外面世界和文化部的本金燒掉（house.led.burn），守恆", G => {
  const H = G.NUM.casino.houseLoan, h = house(G, H.reserve + 300000000);
  h.debt.budget = 30000000; h.debt.culture = 40000000; h.debt.world = 200000000;
  h.budget = 500000000 - 30000000;
  const snap0 = G.casBookSnap([], h, 0, null), t0 = G.casBookTotal(snap0) - G.casBookMinted(snap0) + G.casBookBurned(snap0);
  const r = G.casHouseFix(h, D1).house;
  const pay = Math.floor(300000000 * H.repayPct / 100);
  assert.strictEqual(r.debt.budget, 0, "先還預算池");
  assert.strictEqual(r.debt.culture, 0, "再還文化部");
  const world = Math.ceil(200000000 * H.interestPct / 100) + 200000000 - (pay - 30000000 - 40000000);
  assert.strictEqual(r.debt.world, world, "最後才是外面世界（先加壹天利息）");
  assert.strictEqual(r.bankroll, H.reserve + 300000000 - pay, "莊家的錢少了還掉的");
  assert.strictEqual(r.budget, 500000000, "預算池收回借出去的");
  assert.strictEqual(r.led.flow.cultureRepay, -40000000); assert.strictEqual(r.led.flow.worldRepay, -(pay - 70000000));
  const s1 = G.casBookSnap([], r, 0, null);
  assert.strictEqual(G.casBookTotal(s1) - G.casBookMinted(s1) + G.casBookBurned(s1), t0, "燒掉的有記帳，守恆");
  assert.strictEqual(G.casBookBurned(s1), 0, "還款是搬回外面世界，不是燒掉"); assert.strictEqual(r.world, G.NUM.casino.world.start + pay - 30000000 + G.NUM.casino.world.growBase, "外面世界收回還文化部＋外面世界的錢，加上今天成長");
});
T("莊家沒超過準備金就不還（虧錢的日子不還）", G => {
  const H = G.NUM.casino.houseLoan, h = house(G, H.reserve - 1000); h.debt.world = 5000000;
  const r = G.casHouseFix(h, D1).house;
  assert.strictEqual(r.bankroll, H.reserve - 1000);
  assert.ok(r.debt.world >= 5000000);
});
T("文化部借款：撥壹次，記成債（不計利息）；以前撥過沒記債的補記壹次；莊家賺了先還預算池、再還這個", G => {
  G.NUM.casino.grants = [{ id: "moc-t", amt: 1000000000, name: "文化部借款" }];
  const h = G.casHouseNew(); h.bankroll = -50000000;
  const r = G.casHouseFix(h, D0).house;
  assert.strictEqual(r.bankroll, 950000000); assert.strictEqual(r.led.flow.grant, 1000000000); assert.strictEqual(r.debt.culture, 1000000000); assert.strictEqual(r.world, G.NUM.casino.world.start - 1000000000, "撥款是外面世界的池子少 10 億");
  const again = G.casHouseFix(r, D0).house; assert.strictEqual(again.debt.culture, 1000000000, "不重複記");
  assert.strictEqual(again.led.flow.grant, 1000000000, "不重複撥");
  // 以前撥過（house.grants 有、沒有 grantDebt）
  const old = G.casHouseNew(); old.grants = { "moc-t": D0 }; old.led = { mint: { grant: 1000000000 }, flow: {} }; old.bankroll = 300000000; /* 以前是 mint，這次不補撥 */
  const o = G.casHouseFix(old, D0).house; assert.strictEqual(o.debt.culture, 1000000000, "補記壹次債"); assert.strictEqual(o.led.mint.grant, 1000000000, "以前的 mint 記錄不動"); assert.ok(!o.led.flow.grant, "沒有再撥");
  // 隔天莊家超過準備金：壹半拿去還文化部
  const n = G.casHouseFix(o, D1).house;
  assert.strictEqual(n.debt.culture, 1000000000 - Math.floor((300000000 - G.NUM.casino.houseLoan.reserve) * G.NUM.casino.houseLoan.repayPct / 100));
});
T("破產分級：健康不限；吃緊最大注、壹天賠付、壹包上限隨莊家的錢縮；破產最大注 betBroke、賠付 payBrokeFlat、壹包 drawFlat", G => {
  const R = G.NUM.casino.risk, N = G.NUM.casino, h = house(G, N.health.low);
  assert.strictEqual(G.casHouseLevel(h), "ok"); assert.strictEqual(G.casBetMax(h), N.maxBet); assert.strictEqual(G.casPayCap(h), null); assert.strictEqual(G.casDrawCap(h), null);
  h.bankroll = N.health.low - 1; assert.strictEqual(G.casHouseLevel(h), "tight");
  assert.strictEqual(G.casBetMax(h), Math.max(R.betMin, Math.floor(h.bankroll * R.betTightPct / 100)));
  assert.strictEqual(G.casPayCap(h), Math.floor(h.bankroll * R.payTightPct / 100) + R.payFlat);
  assert.strictEqual(G.casDrawCap(h), Math.max(R.drawFlat, Math.floor(h.bankroll / 2)));
  h.bankroll = 5000000; assert.strictEqual(G.casBetMax(h), R.betMin, "再窮也有最小的最大注");
  h.bankroll = 0; assert.strictEqual(G.casHouseLevel(h), "broke"); assert.strictEqual(G.casBetMax(h), R.betBroke); assert.strictEqual(G.casPayCap(h), R.payBrokeFlat); assert.strictEqual(G.casDrawCap(h), R.drawFlat);
  h.bankroll = -830000000; assert.strictEqual(G.casHouseLevel(h), "broke");
});
T("下注：破產時超過最大注被擋；今天賠付額度用完不收注；賠付額度只夠下的注會告訴玩家；贏的錢不收回", G => {
  const R = G.NUM.casino.risk, h = house(G, -1000), w = wallet(G, 500000000);
  const ctx = { w, house: h, round: null, P: null, day: D0, id: "r1" };
  let r = G.casStepDeal(ctx, String(R.betBroke + 1)); assert.ok(!r.ok && /最多/.test(r.reason), r.reason);
  assert.strictEqual(w.chips, 500000000, "沒扣錢");
  // 額度只剩壹點
  G.casPayAdd(h, D0, R.payBrokeFlat - 3 * 100000);
  r = G.casStepDeal(ctx, "500000"); assert.ok(!r.ok && /賠付額度只夠下/.test(r.reason), r.reason);
  G.casPayAdd(h, D0, 3 * 100000);
  r = G.casStepDeal(ctx, "100000"); assert.ok(!r.ok && r.reason === G.CAS_TEXT.payCapDone, "額度用完：" + r.reason);
  // 換日重算
  const ctx2 = { w, house: h, round: null, P: null, day: D1, id: "r2" };
  r = G.casStepDeal(ctx2, "100000"); assert.ok(r.ok, "隔天可以: " + r.reason);
  // 贏的賠付算進今天；輸的不算
  const h2 = house(G, -1000), w2 = wallet(G);
  G.casSettle(w2, h2, { bet: 100000, out: { payout: 200000, net: 100000, kind: "win" }, settled: false }, { day: D0 });
  assert.strictEqual(h2.pay.n, 100000);
  G.casSettle(w2, h2, { bet: 100000, out: { payout: 0, net: -100000, kind: "lose" }, settled: false }, { day: D0 });
  assert.strictEqual(h2.pay.n, 100000, "輸給莊家的不算賠付");
  // 健康的莊家完全不限
  const hh = house(G, 100000000), ww = wallet(G, 50000000);
  assert.ok(G.casStepDeal({ w: ww, house: hh, round: null, P: null, day: D0, id: "r3" }, String(G.NUM.casino.maxBet)).ok, "健康時最大注 1,000 萬");
});
T("大禮包：破產時壹包最多賠 drawFlat（五星縮水）、算進今天的賠付、額度用完剩下的包不開", G => {
  const R = G.NUM.casino.risk, h = house(G, -1000), w = wallet(G);
  w.tickets = 11; w.pk.left = 0;
  G.setRng(G.mulberry32(7));
  const r = G.casOpenPacks(w, h, 11, D0);
  assert.ok(r.ok, r.reason);
  assert.ok(r.packs.every(p => p.chips <= R.drawFlat), "每包不超過上限");
  const paid = r.packs.reduce((s, p) => s + p.chips, 0);
  assert.strictEqual(h.pay.n, paid);
  assert.ok(paid <= R.payBrokeFlat + R.drawFlat, "額度用完就停");
  if (r.packs.length < 11) assert.strictEqual(w.tickets, 11 - r.packs.length, "沒開的券還在");
  // 額度已經用完：什麼都不開
  const h2 = house(G, -1000), w2 = wallet(G); w2.tickets = 3; w2.pk.left = 0; G.casPayAdd(h2, D0, R.payBrokeFlat);
  const r2 = G.casOpenPacks(w2, h2, 3, D0); assert.ok(!r2.ok && r2.reason === G.CAS_TEXT.payCapDone); assert.strictEqual(w2.tickets, 3);
  // 健康：五星仍然可以賠 1 億
  const hh = house(G, 1000000000), ww = wallet(G); ww.tickets = 1; ww.pk.left = 0;
  assert.strictEqual(G.casDrawCap(hh), null);
});
T("借款：額度上限 capMax；準時還清 +50% 不超過上限", G => {
  const C = G.NUM.casino.loan, w = wallet(G), L = w.loan;
  L.limit = C.capMax - 1; assert.strictEqual(G.casLoanNext(L.limit), C.capMax, "不超過上限");
  assert.strictEqual(G.casLoanNext(C.capMax), C.capMax);
  const big = wallet(G); big.loan.limit = 985261311; const fixed = G.casWalletFix(big, D0); assert.strictEqual(fixed.loan.limit, C.capMax, "比上限高的額度立刻降下來");
});
T("借款：壹天最多升 levelPerDay 級；當天借當天還不升級；隔天還才升", G => {
  const C = G.NUM.casino.loan, h = house(G, 1000000000), w = wallet(G, 500000000);
  w.loan.limit = 1000000;
  // 當天借當天還：不升
  let r = G.casBorrow(w, 100000, D0, false, 1000, h); assert.ok(r.ok, r.reason);
  r = G.casRepay(w, null, D0, false, 1000 + C.repayAfterMin * 60000, h); assert.ok(r.ok, r.reason);
  assert.strictEqual(w.loan.limit, 1000000, "當天借當天還不升級");
  // 前壹天借、今天還：升，壹天最多 levelPerDay 級
  const ids = [];
  for (let i = 0; i < C.levelPerDay + 2; i++) { const b = G.casBorrow(w, 100000, D0, false, 2000 + i, h); assert.ok(b.ok, b.reason); ids.push(b.loan.id); }
  let limit = w.loan.limit, ups = 0;
  for (const id of ids) { const x = G.casRepay(w, id, D1, false, 99999999999, h); assert.ok(x.ok, x.reason); if (w.loan.limit > limit) { ups++; limit = w.loan.limit; } }
  assert.strictEqual(ups, C.levelPerDay, "壹天最多升 " + C.levelPerDay + " 級");
  // 隔天又可以升
  const b2 = G.casBorrow(w, 100000, D1, false, 5000, h); const x2 = G.casRepay(w, b2.loan.id, add(D1, 1), false, 99999999999, h);
  assert.ok(x2.ok && w.loan.limit > limit, "隔天又能升");
});
T("借款：莊家要有錢才能借（≤ 0 暫停）；不能借到莊家變負；全館未還本金 ≤ max(outMin, 莊家的錢 × outPct%)", G => {
  const C = G.NUM.casino.loan, w = wallet(G); w.loan.limit = 20000000;
  let h = house(G, 0); let r = G.casBorrow(w, 100000, D0, false, 1, h); assert.ok(!r.ok && r.reason === G.CAS_TEXT.loanHouseNone);
  h = house(G, -5); r = G.casBorrow(w, 100000, D0, false, 1, h); assert.ok(!r.ok, "破產暫停");
  assert.ok(G.casLoanWhyNot(w, false, h), "畫面問得到原因");
  // 莊家 1,000 萬、全館上限 max(500 萬, 300 萬)＝500 萬
  h = house(G, 10000000);
  r = G.casBorrow(w, 8000000, D0, false, 1, h); assert.ok(!r.ok && /最多/.test(r.reason), "超過上限被擋: " + r.reason);
  r = G.casBorrow(w, "max", D0, false, 1, h); assert.ok(r.ok, r.reason);
  assert.strictEqual(r.loan.amt, 5000000, "借滿＝全館上限");
  assert.strictEqual(h.loansOut, 5000000); assert.strictEqual(h.bankroll, 5000000);
  const w2 = wallet(G); w2.loan.limit = 20000000;
  r = G.casBorrow(w2, 100000, D0, false, 1, h); assert.ok(!r.ok && r.reason === G.CAS_TEXT.loanOutFull, "全館借滿了: " + r.reason);
  // 還回來就恢復
  const x = G.casRepay(w, null, D0, false, 99999999999, h); assert.ok(x.ok, x.reason); assert.strictEqual(h.loansOut, 0);
  // 莊家很有錢：上限跟著 30%
  const rich = house(G, 1000000000), w3 = wallet(G); w3.loan.limit = 20000000;
  assert.strictEqual(G.casBorrow(w3, "max", D0, false, 1, rich).loan.amt, 20000000, "額度 2,000 萬");
  assert.strictEqual(C.capMax, 20000000);
});
T("借款：到期被扣、交給莊家時，借出去的本金跟著減（不會永遠留在 loansOut）", G => {
  const h = house(G, 100000000), w = wallet(G, 0); w.loan.limit = 5000000;
  const b = G.casBorrow(w, 1000000, D0, false, 1, h); assert.ok(b.ok);
  assert.strictEqual(h.loansOut, 1000000);
  w.chips = 0;
  G.casLoanRoll(w, add(D0, G.NUM.casino.loan.days + 1)); // 到期沒還：直接扣
  assert.ok(w.chips < 0 && w.loan.toHouse > 0 && w.loan.toHouseAmt === 1000000);
  const n = G.casLoanToHouse(w, h); assert.strictEqual(n, b.loan.owe);
  assert.strictEqual(h.loansOut, 0); assert.strictEqual(w.loan.toHouseAmt, 0);
});
T("借款：欠款中（錢包是負的）額度鎖在壹開始的額度", G => {
  const C = G.NUM.casino.loan, w = wallet(G, -1000); w.loan.limit = 20000000;
  assert.strictEqual(G.casLoanLeft(w), C.limit);
  w.chips = 0; assert.strictEqual(G.casLoanLeft(w), 20000000);
});
T("地下工作還款：每天最多 work.payMax（欠 3 億不會三天印 3 億）；小額欠款還是 34%", G => {
  const W = G.NUM.casino.work;
  assert.strictEqual(G.casWorkPay({ base: 321488829 }), W.payMax);
  assert.strictEqual(G.casWorkPay({ base: 1000000 }), Math.ceil(1000000 * W.payPct / 100));
  assert.ok(W.payMax === 3000000);
});
T("守恆：破產、借錢重開、還債、借款整串走完，全館的錢 ＝ 開場 ＋ mint − burn", G => {
  const H = G.NUM.casino.houseLoan, h = house(G, -20000000), w = wallet(G, 30000000);
  const s0 = G.casBookSnap([w], h, 0, null), open = G.casBookOpening(s0);
  let day = D0;
  for (let i = 0; i < 6; i++) {
    day = add(day, 1); G.casHouseFix(h, day);
    if (h.bankroll > 0) { const b = G.casBorrow(w, 300000, day, false, 1, h); if (b.ok) G.casRepay(w, b.loan.id, day, false, 99999999999, h); }
    h.bankroll += 0; // 玩家輸給莊家
    const lose = Math.min(w.chips, 5000000); w.chips -= lose; G.casHouseMove(h, "bj", lose);
    assert.strictEqual(G.casBookGap(G.casBookSnap([w], h, 0, null), open), 0, "第 " + i + " 天守恆");
  }
  assert.ok(h.debt.world >= 0 && h.debt.budget >= 0);
});
T("舊的莊家文件（沒有 debt、loansOut、pay）補欄位；壞資料不丟錯", G => {
  const h = G.casHouseFix({ bankroll: 5, budget: 7, sea: 0, led: { mint: {}, flow: {} } }, D0).house;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(h.debt)), { budget: 0, culture: 0, world: 0 }); assert.strictEqual(h.loansOut, 0); assert.strictEqual(h.pay.n, 0);
  const bad = G.casHouseFix({ debt: "壞", pay: [], loansOut: "x", bankroll: "x" }, D0).house;
  assert.strictEqual(bad.debt.world, 0); assert.strictEqual(bad.loansOut, 0);
  assert.strictEqual(G.casHouseLevel(null), "broke");
});
T("日報：莊家欠的錢和借出去還沒收回的本金寫得出來；燒掉的有名字", G => {
  const h = house(G, 20000000); h.debt = { budget: 1000000, culture: 2000000, world: 3000000 }; h.loansOut = 4000000; h.led.burn = { worldRepay: 5 };
  const snap = G.casBookSnap([], h, 0, null), diff = G.casBookDiff(null, snap);
  const v = G.casReportView({ day: D0, snap, diff });
  const txt = JSON.stringify(v);
  assert.ok(/莊家欠的錢/.test(txt) && /文化部/.test(txt) && /借出去、還沒收回/.test(txt), "有債和借出去的");
  assert.ok(/莊家還外面世界貸款/.test(txt), "燒掉的有名字");
});
console.log(`莊家接軌：${pass} 過，${fail} 沒過`);
if (fail) process.exit(1);
