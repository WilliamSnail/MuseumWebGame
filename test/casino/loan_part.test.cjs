// 借款部分還款、分期（決定 0114）：node test/casino/loan_part.test.cjs（npm test 也會跑）
// 部分還款：先還利息、再還本金、不升信用、最低金額、次數上限；分期：條件、期表、手續費、逾期只扣那一期、額度只降一次、整筆還清的信用；賣股還債部分還；守恆。數字讀 NUM.casino.loan。
const assert = require("assert");
const { load } = require("../load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.US_IDS.length = 0; G.NUM.casino.grants = []; G.NUM.casino.stockIn.mkt.on = false; G.NUM.casino.houseLoan.cultureDue = ""; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const D = "2026-11-10", plus = (d, n) => { const [y, m, x] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, x + n)).toISOString().slice(0, 10); };
const at = (d, h) => Date.parse(`${d}T${String(h).padStart(2, "0")}:30:00+08:00`);
const mk = G => { const w = G.casWalletFix(G.casWalletNew(), D), h = G.casHouseFix(G.casHouseNew(), D).house; h.bankroll = 5000000000; w.loan.limit = 10000000; return { w, h }; };
const snap = (G, s) => G.casBookSnap([s.w], s.h, 0, null);
// 借 amt（t0 在 15 分鐘前，馬上可以還）
const borrow = (G, s, amt, day = D) => { const r = G.casBorrow(s.w, amt, day, false, at(day, 8), s.h); assert.ok(r.ok, r.reason); return r.loan; };
const T1 = day => at(day, 12);

T("部分還款：先還利息、再還本金；到期日不變；莊家收到、沒還的本金照還掉的本金減；帳守恆", G => {
  const s = mk(G), x = borrow(G, s, 1000000), op = G.casBookOpening(snap(G, s)), owe0 = x.owe, intr = owe0 - 1000000, l0 = s.h.loansOut, b0 = s.h.bankroll;
  const r = G.casRepayPart(s.w, x.id, 60000, D, false, T1(D), s.h); assert.ok(r.ok, r.reason);
  assert.strictEqual(r.interest, 60000); assert.strictEqual(r.principal, 0, "先還利息：本金沒動"); assert.strictEqual(x.amt, 1000000); assert.strictEqual(x.owe, owe0 - 60000);
  assert.strictEqual(s.h.bankroll, b0 + 60000); assert.strictEqual(s.h.loansOut, l0, "只還利息，借出去的本金還在"); assert.strictEqual(x.due, plus(D, G.NUM.casino.loan.days));
  const r2 = G.casRepayPart(s.w, x.id, intr - 60000 + 100000, D, false, T1(D), s.h); assert.ok(r2.ok, r2.reason);
  assert.strictEqual(r2.interest, intr - 60000); assert.strictEqual(r2.principal, 100000); assert.strictEqual(x.amt, 900000); assert.strictEqual(s.h.loansOut, l0 - 100000, "還了 10 萬本金");
  assert.strictEqual(x.owe, x.amt, "利息還完了：要還的 ＝ 本金"); assert.strictEqual(G.casBookGap(snap(G, s), op), 0);
  assert.strictEqual(x.parts, 2);
});

T("部分還款不升信用、不算準時還清；整筆還清才 ok++ 升額度（當天借當天還不升）", G => {
  const s = mk(G), x = borrow(G, s, 1000000), L = s.w.loan, lim0 = L.limit, ok0 = L.ok;
  assert.ok(G.casRepayPart(s.w, x.id, 200000, D, false, T1(D), s.h).ok);
  assert.strictEqual(L.limit, lim0); assert.strictEqual(L.ok, ok0, "部分還不算準時還清");
  const next = plus(D, 1), r = G.casRepay(s.w, x.id, next, false, at(next, 12), s.h); assert.ok(r.ok, r.reason);
  assert.strictEqual(L.ok, ok0 + 1); assert.ok(L.limit > lim0, "隔天整筆還清：升額度"); assert.strictEqual(L.list.length, 0);
});

T("最低一次還多少 max(1,000, 剩下 5%)、次數上限、付得起整筆就是整筆還清、錢不夠", G => {
  const s = mk(G), x = borrow(G, s, 1000000), P = G.NUM.casino.loan.part, min = G.casLoanPartMin(x);
  assert.strictEqual(min, Math.max(P.minAbs, Math.ceil(x.owe * P.minPct / 100)));
  assert.ok(!G.casRepayPart(s.w, x.id, min - 1, D, false, T1(D), s.h).ok, "比最低少被擋");
  for (let i = 0; i < P.max; i++) { const m = G.casLoanPartMin(x); assert.ok(G.casRepayPart(s.w, x.id, m, D, false, T1(D), s.h).ok, "第 " + (i + 1) + " 次"); }
  const many = G.casRepayPart(s.w, x.id, G.casLoanPartMin(x), D, false, T1(D), s.h); assert.ok(!many.ok && /最多/.test(many.reason), many.reason);
  const t = mk(G), y = borrow(G, t, 100000); t.w.chips = 50;
  assert.ok(!G.casRepayPart(t.w, y.id, 5000, D, false, T1(D), t.h).ok, "籌碼不夠");
  t.w.chips = 1000000; const full = G.casRepayPart(t.w, y.id, y.owe + 5, D, false, T1(D), t.h); assert.ok(full.ok); assert.strictEqual(t.w.loan.list.length, 0, "超過要還的 ＝ 整筆還清");
  assert.ok(!G.casRepayPart(t.w, y.id, 5000, D, false, at(D, 7), t.h).ok, "沒有這筆");
  const u = mk(G), z = borrow(G, u, 100000); assert.ok(!G.casRepayPart(u.w, z.id, 5000, D, false, at(D, 8) + 60000, u.h).ok, "借了 15 分鐘內不能還");
});

T("分期：條件（借 1 天後、本金 ≥ 10 萬、沒延期、沒到期、一次）；期表、手續費、總和對得上；額度（本金）不變", G => {
  const s = mk(G), x = borrow(G, s, 1000000), S = G.NUM.casino.loan.split;
  assert.ok(!G.casLoanSplit(s.w, x.id, 3, 7, D, s.h).ok, "當天不能轉（要借了 1 天）");
  const d1 = plus(D, 1); assert.ok(!G.casLoanSplit(s.w, x.id, 5, 7, d1, s.h).ok, "5 期超過"); assert.ok(!G.casLoanSplit(s.w, x.id, 3, 2, d1, s.h).ok, "間隔 2 天不行"); assert.ok(!G.casLoanSplit(s.w, x.id, 1, 7, d1, s.h).ok);
  const open0 = G.casLoanOpen(s.w), owe0 = x.owe, amt0 = x.amt, due0 = x.due;
  const r = G.casLoanSplit(s.w, x.id, 3, 7, d1, s.h); assert.ok(r.ok, r.reason);
  assert.strictEqual(x.plan.length, 3); assert.deepStrictEqual(Array.from(x.plan.map(p => p.due)), [due0, plus(due0, 7), plus(due0, 14)]); assert.strictEqual(x.due, due0, "第 1 期 ＝ 原本到期日");
  const rate = G.NUM.casino.loan.interestPct / G.NUM.casino.loan.days / 100, fee = x.plan.slice(1).reduce((a, p, i) => a + Math.ceil(p.amt * rate * 7 * (i + 1)), 0);
  assert.strictEqual(r.fee, fee, "手續費 ＝ 該期本金 × 日利率 × 延後天數"); assert.strictEqual(x.owe, owe0 + fee); assert.strictEqual(x.amt, amt0); assert.strictEqual(G.casLoanOpen(s.w), open0);
  assert.strictEqual(x.plan.reduce((a, p) => a + p.owe, 0), x.owe); assert.ok(x.plan.every(p => p.owe >= p.amt && p.amt > 0));
  assert.ok(!G.casLoanSplit(s.w, x.id, 2, 3, d1, s.h).ok, "已經轉過");
  const y = borrow(G, s, 50000); assert.ok(!G.casLoanSplit(s.w, y.id, 2, 3, d1, s.h).ok, "本金太小");
  const e = mk(G), z = borrow(G, e, 500000); z.ext = 1; assert.ok(!G.casLoanSplit(e.w, z.id, 2, 3, d1, e.h).ok, "延期過了");
  const f = mk(G), q = borrow(G, f, 500000); assert.ok(!G.casLoanSplit(f.w, q.id, 2, 3, plus(q.due, 1), f.h).ok, "已經到期了");
  const g = mk(G), v = borrow(G, g, 500000); g.h.debt.culture = 1000000000; g.h.bankroll = 1000; assert.ok(G.casLoanSplit(g.w, v.id, 2, 3, d1, g.h).ok, "莊家現金低也可以開分期（沒有暫停條件，只有總開關）");
  G.NUM.casino.loan.split.on = false; const o = mk(G), p = borrow(G, o, 500000); assert.ok(!G.casLoanSplit(o.w, p.id, 2, 3, d1, o.h).ok, "旗標關掉");
});

T("分期的借款：每期到期只扣那一期；額度只降一次；沒錢扣成負；整筆付完不算準時（不升級）；帳守恆", G => {
  const s = mk(G), x = borrow(G, s, 1000000); s.w.chips = 10000000; const d1 = plus(D, 1);
  assert.ok(G.casLoanSplit(s.w, x.id, 3, 3, d1, s.h).ok); const plan = x.plan.map(p => ({ ...p })), op = G.casBookOpening(snap(G, s));
  const lim0 = s.w.loan.limit, late0 = s.w.loan.late, c0 = s.w.chips;
  // 到期那一天結束前：不扣
  assert.strictEqual(G.casLoanRoll(s.w, x.due).length, 0);
  const day2 = plus(x.due, 1), out = G.casLoanRoll(s.w, day2); assert.strictEqual(out.length, 1, "第 1 期過了");
  assert.strictEqual(s.w.chips, c0 - plan[0].owe, "只扣第 1 期"); assert.strictEqual(x.plan.length, 2); assert.strictEqual(x.due, plan[1].due);
  assert.strictEqual(s.w.loan.late, late0 + 1); assert.strictEqual(s.w.loan.limit, Math.floor(lim0 * (100 - G.NUM.casino.loan.latePct) / 100), "額度降 10% 一次");
  G.casLoanToHouse(s.w, s.h); assert.strictEqual(G.casBookGap(snap(G, s), op), 0, "扣掉、交給莊家後守恆");
  // 隔很多天沒上線：第 2、3 期都過了壹起扣，額度不再降
  const lim1 = s.w.loan.limit, day9 = plus(plan[2].due, 2), out2 = G.casLoanRoll(s.w, day9);
  assert.strictEqual(s.w.chips, c0 - plan[0].owe - plan[1].owe - plan[2].owe); assert.strictEqual(s.w.loan.limit, lim1, "同一筆不再降"); assert.strictEqual(s.w.loan.list.length, 0, "分完了就沒有這筆");
  G.casLoanToHouse(s.w, s.h); assert.strictEqual(G.casBookGap(snap(G, s), op), 0); assert.strictEqual(s.h.loansOut >= 0, true);
  // 有壹期逾期、其餘提早整筆還清：額度不升（已經降過）
  const t = mk(G), y = borrow(G, t, 1000000); t.w.chips = 50000000; assert.ok(G.casLoanSplit(t.w, y.id, 2, 3, plus(D, 1), t.h).ok);
  G.casLoanRoll(t.w, plus(y.due, 1)); const limAfter = t.w.loan.limit, ok0 = t.w.loan.ok; const rr = G.casRepay(t.w, y.id, plus(y.due, 2), false, at(plus(y.due, 2), 12), t.h); assert.ok(rr.ok, rr.reason);
  assert.strictEqual(t.w.loan.ok, ok0, "逾期過的不算準時"); assert.strictEqual(t.w.loan.limit, limAfter, "不升級");
});

T("分期的借款：部分還款先還第 1 期、手續費當利息先還；整筆還清準時 ＝ 升級；存檔補欄位（舊借款沒有 plan）", G => {
  const s = mk(G), x = borrow(G, s, 1000000); s.w.chips = 50000000; const d1 = plus(D, 1);
  assert.ok(G.casLoanSplit(s.w, x.id, 2, 7, d1, s.h).ok); const p0 = { ...x.plan[0] }, p1 = { ...x.plan[1] }, op = G.casBookOpening(snap(G, s));
  const r = G.casRepayPart(s.w, x.id, p0.owe, d1, false, at(d1, 12), s.h); assert.ok(r.ok, r.reason);
  assert.strictEqual(x.plan.length, 1, "第 1 期還完了"); assert.strictEqual(x.due, p1.due); assert.strictEqual(x.owe, p1.owe); assert.strictEqual(G.casBookGap(snap(G, s), op), 0);
  const ok0 = s.w.loan.ok, lim0 = s.w.loan.limit, d2 = plus(d1, 1), f = G.casRepay(s.w, x.id, d2, false, at(d2, 12), s.h); assert.ok(f.ok, f.reason);
  assert.strictEqual(s.w.loan.ok, ok0 + 1); assert.ok(s.w.loan.limit > lim0);
  const w = G.casWalletFix(G.casWalletNew(), D); w.loan.list = [{ id: 1, amt: 1000, owe: 1090, day: D, due: plus(D, 7) }]; const L = G.casWalletFix(w, D).loan; assert.ok(!L.list[0].plan || !L.list[0].plan.length); assert.strictEqual(L.list[0].parts, 0);
  const bad = G.casWalletFix(G.casWalletNew(), D); bad.loan.list = [{ id: 1, amt: 100, owe: 109, day: D, due: plus(D, 7), plan: [{ due: "x", owe: 5 }, { due: plus(D, 7), owe: 60, amt: 50 }, { due: plus(D, 10), owe: 49, amt: 50 }] }];
  const y = G.casWalletFix(bad, D).loan.list[0]; assert.strictEqual(y.plan.length, 2, "壞的期丟掉"); assert.strictEqual(y.owe, 109); assert.strictEqual(y.due, plus(D, 7));
});

T("借款頁的資料：每筆多 parts、partMin、plan、splitWhy；split 摘要", G => {
  const s = mk(G), x = borrow(G, s, 1000000); G.casLoanSplit(s.w, x.id, 2, 3, plus(D, 1), s.h);
  const v = G.casLoanView(s.w, plus(D, 1)), e = v.list[0];
  assert.strictEqual(e.plan.length, 2); assert.ok(e.partMin >= 1000); assert.strictEqual(e.partMax, G.NUM.casino.loan.part.max); assert.ok(e.splitWhy); assert.ok(v.split.on && v.split.kMax === 4);
});

T("賣股還債也能部分還：賣的錢夠補負數、還前面的整筆，剩下的先還下一筆的利息再本金；帳守恆；莊家借出去的本金照減", G => {
  const ID = "greeneye", OPEN = at("2026-11-14", 14), D14 = "2026-11-14", s = { w: G.casWalletFix(G.casWalletNew(), D14), h: G.casHouseFix(G.casHouseNew(), D14).house };
  s.h.bankroll = 5000000000; s.w.chips = 5000000000; s.w.loan.limit = 10000000; G.casStockHouseFix(s.h); G.NUM.casino.stockIn.mkt.on = false;
  G.casStockBuy(s.w, s.h, ID, 200, D14, OPEN); const t0 = OPEN - 3600000;
  const a = G.casBorrow(s.w, 1000000, D14, false, t0, s.h), b = G.casBorrow(s.w, 3000000, D14, false, t0, s.h); assert.ok(a.ok && b.ok);
  const bOwe = b.loan.owe; s.w.chips = 0; const op = G.casBookOpening(G.casBookSnap([s.w], s.h, 0, null)), loans0 = s.h.loansOut;
  const r = G.casSellForDebt(s.w, s.h, ID, 200, D14, OPEN); assert.ok(r.ok, r.reason); // 200 股約 200 萬：夠還第 1 筆（109 萬），第 2 筆還一部分
  assert.strictEqual(s.w.loan.list.length, 1, "第 1 筆還清了"); const x = s.w.loan.list[0]; assert.ok(x.owe < bOwe, "第 2 筆部分還了：" + x.owe); assert.strictEqual(x.parts, 1);
  assert.ok(s.w.chips >= 0 && s.w.chips < 10000, "賣的錢都拿去還了，錢包幾乎是 0：" + s.w.chips);
  assert.ok(s.h.loansOut < loans0, "莊家借出去的本金減少"); assert.strictEqual(G.casBookGap(G.casBookSnap([s.w], s.h, 0, null), op), 0);
});

T("財經專員寄新規定的信：還有借款的人壹人壹封（advisor-rules），帶自己的數字；沒借款不寄；之後欠款的信照舊", G => {
  const s = mk(G), none = G.casAdvisorLetter(s.w, s.h, D, T1(D)); assert.strictEqual(none, null, "沒借款：不寄");
  const x = borrow(G, s, 1000000), a = G.casAdvisorLetter(s.w, s.h, D, T1(D)); assert.ok(a && a.id === "advisor-rules", a && a.id);
  assert.ok(a.mail.note.includes("部分") && a.mail.note.includes("分期") && a.mail.note.includes(G.casNum(x.owe)) && a.mail.note.includes(x.due.slice(5)), a.mail.note);
  const p = G.casLoanSplitPlan({ amt: x.amt, owe: x.owe, due: x.due }, 3, 7); assert.ok(a.mail.note.includes(G.casNum(p.fee)), "有手續費");
  const b = G.casAdvisorLetter(s.w, s.h, plus(D, 1), T1(plus(D, 1))); assert.ok(b && b.id === "advisor-first", "新規定的信只寄壹次，之後欠款的信照舊：" + (b && b.id));
});
console.log(`loan_part.test：${pass} 過，${fail} 沒過`); process.exit(fail ? 1 : 0);
