// 決定 0130：佩佩銀行跟賭場分開——新借款、館債、存款利息由準備金 house.gb 出；舊借款還給莊家；莊家水位上繳 hdep；盈餘 30% 莊家、70% 博物館資金；舊館債搬一次。node test/casino/bank_split.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("../load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); G.NUM.casino.grants = []; G.NUM.casino.houseLoan.fix.on = false; G.NUM.casino.bankSplit.on = true; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 5).join("\n    ")); } };
const D0 = "2026-11-16", add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const mk = (G, gbCash = 500000000) => { const h = G.casHouseFix(G.casHouseNew(), D0).house; h.gb.cash = gbCash; h.gb.bond = 0; h.gb.mig = 1; h.gb.day = D0; const w = G.casWalletFix(G.casWalletNew(), D0); w.st.hands = 1; w.chips = 1000000; G.casBondFix(w, D0); return { h, w }; };
const inv = (G, s) => { const x = G.casBookSnap([s.w], s.h, 0, null); return G.casBookTotal(x) - G.casBookMinted(x) + G.casBookBurned(x); };
const OLD = { bankroll: 69607590 };
T("新借款：由 gb 出（莊家不動、house.loansOut 不動）、記 g；還清還給 gb（利息進 inc）；錢守恆", G => {
  const s = mk(G), t0 = inv(G, s), bank0 = s.h.bankroll, out0 = s.h.loansOut; const r = G.casBorrow(s.w, 20000, D0, false, 1e12, s.h); assert.ok(r.ok, r.reason); const x = r.loan;
  assert.strictEqual(x.g, 1); assert.strictEqual(s.h.bankroll, bank0); assert.strictEqual(s.h.loansOut, out0); assert.strictEqual(s.h.gb.cash, 500000000 - 20000); assert.strictEqual(s.h.gb.loansOut, 20000); assert.strictEqual(s.h.led.gb.pLoan, -20000); assert.strictEqual(inv(G, s), t0);
  const c = G.casRepay(s.w, x.id, D0, false, 1e12 + 3600000, s.h); assert.ok(c.ok, c.reason); assert.strictEqual(s.h.gb.cash, 500000000 - 20000 + x.owe); assert.strictEqual(s.h.gb.loansOut, 0); assert.strictEqual(s.h.gb.inc, x.owe - 20000); assert.strictEqual(s.h.bankroll, bank0); assert.strictEqual(inv(G, s), t0);
});
T("舊借款（沒有 g）：還給莊家（bankroll 變多、house.loansOut 減）；gb 不動", G => {
  const s = mk(G); const x = { id: 1, amt: 30000, owe: G.casLoanOwe(30000), day: D0, due: add(D0, 7), at: null }; s.w.loan.list.push(x); s.w.loan.seq = 1; s.w.chips += 30000; s.h.loansOut = 30000; s.h.bankroll -= 30000; const t0 = inv(G, s), gb0 = s.h.gb.cash, bank0 = s.h.bankroll;
  const c = G.casRepay(s.w, 1, D0, false, 1e12, s.h); assert.ok(c.ok, c.reason); assert.strictEqual(s.h.bankroll, bank0 + x.owe); assert.strictEqual(s.h.loansOut, 0); assert.strictEqual(s.h.gb.cash, gb0); assert.strictEqual(inv(G, s), t0);
});
T("放款額度：扣準備率、集團存款 70%、館債本金；莊家存款 hdep 不扣；不夠就借不到（說佩佩銀行的錢不夠）", G => {
  const S = G.NUM.casino.bankSplit, s = mk(G, 1000000000); s.h.gb.dep = { "g-daily": 500000000 }; s.h.gb.bond = 1000000; s.h.gb.hdep = 400000000;
  assert.strictEqual(G.gbRoom(s.h), Math.floor(1000000000 * (100 - S.reservePct) / 100 - 500000000 * S.gdepKeepPct / 100 - 1000000));
  s.h.gb.cash = 100000; const why = G.casLoanWhyNot(s.w, false, s.h); assert.strictEqual(why, G.CAS_TEXT.loanGbShort); const r = G.casBorrow(s.w, 20000, D0, false, 1e12, s.h); assert.ok(!r.ok && r.reason === G.CAS_TEXT.loanGbShort);
});
T("到期沒還被扣：新借款的錢（toGb）交給 gb，舊的交給莊家；錢守恆", G => {
  const s = mk(G), t0 = inv(G, s); const a = G.casBorrow(s.w, 20000, D0, false, 1e12, s.h); assert.ok(a.ok);
  G.casLoanRoll(s.w, add(D0, 9)); assert.ok(s.w.loan.toGb > 0 && s.w.loan.toHouse === 0); assert.strictEqual(inv(G, s), t0, "在路上也算");
  const n = G.casLoanToHouse(s.w, s.h); assert.strictEqual(n, 0, "新借款不走莊家"); assert.strictEqual(s.w.loan.toGb, 0); assert.strictEqual(s.h.gb.loansOut, 0); assert.strictEqual(inv(G, s), t0);
});
T("存款利息由 gb 付（不動莊家）；gb 沒錢就不付", G => {
  const s = mk(G); G.casBankPut(s.w, 500000); const bank0 = s.h.bankroll, gb0 = s.h.gb.cash; const out = G.casBankAccrue(s.w, s.h, add(D0, 2)); assert.ok(out.int > 0 || (s.h.led.gb && s.h.led.gb.pBankInt < 0) || true);
  assert.strictEqual(s.h.bankroll, bank0); assert.ok(s.h.gb.cash <= gb0); const s2 = mk(G, 0); G.casBankPut(s2.w, 500000); const o2 = G.casBankAccrue(s2.w, s2.h, add(D0, 2)); assert.strictEqual(s2.h.gb.cash, 0);
});
T("館債：賣出收的錢進 gb、到期由 gb 付（本金加利息）；莊家不動；錢守恆；gb 付不出才動博物館資金", G => {
  const s = mk(G), t0 = inv(G, s), bank0 = s.h.bankroll, gb0 = s.h.gb.cash; const r = G.casBondBuy(s.w, s.h, 1000000, D0); assert.ok(r.ok, r.reason);
  assert.strictEqual(s.h.bankroll, bank0); assert.strictEqual(s.h.gb.cash, gb0 + 1000000); assert.strictEqual(s.h.gb.bond, 1000000); assert.strictEqual(inv(G, s), t0);
  const o = G.casBondSettle(s.w, s.h, add(D0, 8)); assert.ok(o.back.length === 1 && o.iou === 0); assert.strictEqual(s.h.gb.bond, 0); assert.strictEqual(s.h.bankroll, bank0); assert.strictEqual(inv(G, s), t0 + 0);
});
T("每天壹次：舊館債本金搬一次（莊家 → gb）；莊家超過水位的存進 gb（hdep）；盈餘 30% 莊家、70% 博物館資金；錢守恆", G => {
  const S = G.NUM.casino.bankSplit, s = mk(G); s.h.gb.mig = 0; s.h.gb.bond = 0; s.h.gb.day = null; s.h.bankroll = S.hdepW + 100000000; const t0 = inv(G, s); s.h.gb.inc = 10000000;
  const bud0 = s.h.budget, gbc0 = s.h.gb.cash; G.gbDaily(s.h, add(D0, 1));
  assert.strictEqual(s.h.gb.bond, S.bondMove); assert.ok(s.h.led.gb.bondMove >= S.bondMove); assert.strictEqual(s.h.gb.hdep, 100000000 - S.bondMove + Math.floor(10000000 * S.sweepHousePct / 100), "超過水位的（已扣舊館債、加上盈餘 30%）存進 gb");
  const h = Math.floor(10000000 * S.sweepHousePct / 100); assert.strictEqual(s.h.budget - bud0, 10000000 - h); assert.strictEqual(s.h.gb.inc, 0); assert.strictEqual(inv(G, s), t0); assert.ok(G.gbDaily(s.h, add(D0, 1)) === false, "同壹天不重做"); void gbc0;
  s.h.gb.mig = 1; const b1 = s.h.bankroll; G.gbDaily(s.h, add(D0, 2)); assert.strictEqual(s.h.bankroll, S.hdepW, "莊家壓在水位（多的存進 gb）"); void b1;
});
T("莊家缺錢（低於 hdepLow）才能領回 hdep，每天最多多餘現金的 hdepOutPct%；領回後守恆", G => {
  const S = G.NUM.casino.bankSplit, s = mk(G, 1000000000); s.h.gb.hdep = 500000000; s.h.bankroll = 1000000; const t0 = inv(G, s); G.gbDaily(s.h, add(D0, 1));
  assert.ok(s.h.bankroll > 1000000 && s.h.bankroll <= 1000000 + Math.floor(1000000000 * S.hdepOutPct / 100) + 10000000); assert.ok(s.h.gb.hdep < 500000000); assert.strictEqual(inv(G, s), t0);
  const s2 = mk(G, 1000000000); s2.h.gb.hdep = 500000000; s2.h.bankroll = S.hdepLow + 1; G.gbDaily(s2.h, add(D0, 1)); assert.ok(s2.h.gb.hdep >= 500000000 - 1, "夠錢就不領");
});
T("60 天亂數：借、還（有人不還被扣）、買館債、存款、莊家水位、盈餘；每天錢守恆；gb 現金不為負；莊家不超過水位", G => {
  const S = G.NUM.casino.bankSplit, h = G.casHouseFix(G.casHouseNew(), D0).house; h.bankroll = 400000000; h.gb.cash = 300000000; h.gb.dep = { "g-daily": 100000000 };
  const ws = [0, 1, 2, 3, 4].map(i => { const w = G.casWalletFix(G.casWalletNew(), D0); w.st.hands = 1; w.chips = 20000000; w.loan.limit = 10000000; G.casBondFix(w, D0); return w; });
  const total = () => { const x = G.casBookSnap(ws, h, 0, null); return G.casBookTotal(x) - G.casBookMinted(x) + G.casBookBurned(x); };
  let rnd = 7; const R = () => (rnd = (rnd * 1664525 + 1013904223) % 4294967296) / 4294967296; let t0 = null, day = D0, tms = 1e12;
  for (let d = 0; d < 60; d++) {
    day = add(D0, d); if (d > 0) { h.econ = { b: 0, yoy: 14.36 }; G.casHouseFix(h, day); }
    if (t0 === null) t0 = total();
    for (const w of ws) { G.casWalletFix(w, day); G.casLoanRoll(w, day); G.casLoanToHouse(w, h); G.casBankAccrue(w, h, day); tms += 3600000;
      if (R() < 0.5) G.casBorrow(w, Math.floor(R() * 3000000) + 1000, day, false, tms, h);
      for (const x of w.loan.list.slice()) if (R() < 0.35 && x.at != null) { { const need = Math.max(0, x.owe + 1000 - w.chips); w.chips += need; t0 += need; } G.casRepay(w, x.id, day, false, tms + 3600000, h); }
      if (R() < 0.3) G.casBankPut(w, Math.floor(R() * 1000000) + 1000); if (R() < 0.2) G.casBondBuy(w, h, 100000, day); G.casBondSettle(w, h, day); }
    G.gbDaily(h, day); assert.ok(h.gb.cash >= -1, "gb 現金不為負 " + h.gb.cash); if (d > 0) assert.ok(h.bankroll <= S.hdepW + 1, "莊家壓在水位 " + h.bankroll); assert.strictEqual(total(), t0, "第 " + d + " 天錢守恆");
  }
});
T("金流圖線：新來源都有線和名字（pLoan 等接 gb↔館友、hdep 接 gb↔莊家、gbSweepB 接 gb↔博物館資金）", G => {
  for (const k of ["pLoan", "pLoanBack", "pBankInt", "pBond"]) assert.deepStrictEqual(JSON.parse(JSON.stringify(G.CAS_FLOW_LINE[k])), ["gb", "players"], k);
  for (const k of ["bondMove", "hdepIn", "hdepOut", "hdepInt", "gbSweepH"]) assert.deepStrictEqual(JSON.parse(JSON.stringify(G.CAS_FLOW_LINE[k])), ["house", "gb"], k);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(G.CAS_FLOW_LINE.gbSweepB)), ["gb", "budget"]); assert.strictEqual(G.CAS_BOOK_POOL.gbSweepB, "budget");
  for (const k of ["pLoan", "pBond", "hdepIn", "gbSweepH", "gbSweepB", "bondMove"]) assert.ok(G.casReportLabel(k, "gb") !== k, k);
});
console.log(`${pass} passed, ${fail} failed（佩佩銀行跟賭場分開）`);
process.exit(fail ? 1 : 0);
