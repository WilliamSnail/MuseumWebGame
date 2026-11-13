// 跟 Yuga 借錢（決定 0064）：node test/loan.test.cjs（npm test 也會跑）
// 利息、額度、幾天內要還、到期直接扣到負的、準時還清額度變高、欠款中也能借、舊錢包。數字都讀 NUM.casino.loan。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 3).join("\n    ")); } };
const D = "2026-11-10";
const plus = (d, n) => { const [y, m, x] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, x + n)).toISOString().slice(0, 10); };
const mk = G => G.casWalletFix(null, D);

T("借：籌碼加本金，記壹筆本金加利息、days 天後到期", G => {
  const C = G.NUM.casino.loan, w = mk(G), c0 = w.chips;
  const r = G.casBorrow(w, "100,000", D);
  assert.ok(r.ok, r.reason);
  assert.strictEqual(w.chips, c0 + 100000);
  const x = w.loan.list[0];
  assert.strictEqual(x.amt, 100000);
  assert.strictEqual(x.owe, Math.ceil(100000 * (100 + C.interestPct) / 100));
  assert.strictEqual(x.due, plus(D, C.days));
  assert.ok(r.lines.join("").includes(String(C.interestPct)));
});

T("額度：沒還的本金加起來不能超過；超過就借到剩下的；借滿；用完了不能借", G => {
  const C = G.NUM.casino.loan, w = mk(G);
  assert.strictEqual(G.casLoanLeft(w), C.limit);
  assert.ok(G.casBorrow(w, C.limit - C.min, D).ok);
  const r = G.casBorrow(w, C.limit, D); // 只剩 C.min
  assert.ok(r.ok); assert.strictEqual(r.loan.amt, C.min);
  assert.strictEqual(G.casLoanLeft(w), 0);
  const no = G.casBorrow(w, "max", D);
  assert.ok(!no.ok && no.reason === G.CAS_TEXT.loanFull);
});

T("太少、亂打的不借；打牌中不借", G => {
  const C = G.NUM.casino.loan, w = mk(G);
  assert.ok(!G.casBorrow(w, C.min - 1, D).ok);
  assert.ok(!G.casBorrow(w, "abc", D).ok);
  assert.ok(!G.casBorrow(w, -5, D).ok);
  assert.ok(!G.casBorrow(w, 100000, D, true).ok, "打牌中");
  assert.strictEqual(w.loan.list.length, 0);
});

T("還：要壹次還清那筆；籌碼不夠不能還；準時還清額度多 limitPct%", G => {
  const C = G.NUM.casino.loan, w = mk(G);
  G.casBorrow(w, 200000, D);
  const owe = w.loan.list[0].owe;
  w.chips = owe - 1;
  assert.ok(!G.casRepay(w, null, D).ok);
  w.chips = owe;
  const r = G.casRepay(w, null, plus(D, C.days), false); // 最後壹天還，算準時（測試沒給時間：舊的借款當作馬上可以還）
  assert.ok(r.ok); assert.strictEqual(w.chips, 0);
  assert.strictEqual(w.loan.list.length, 0);
  assert.strictEqual(w.loan.limit, Math.ceil(C.limit * (100 + C.limitPct) / 100));
  assert.strictEqual(G.casLoanNext(G.casLoanNext(C.limit)), Math.ceil(Math.ceil(C.limit * (100 + C.limitPct) / 100) * (100 + C.limitPct) / 100), "壹次比壹次多");
  assert.strictEqual(w.loan.ok, 1);
  assert.ok(!G.casRepay(w, 99, plus(D, 1)).ok, "沒有這筆");
});

T("借了 repayAfterMin 分鐘之後才能還（照伺服器的時間）", G => {
  const C = G.NUM.casino.loan, w = mk(G), t0 = Date.parse("2026-11-10T04:00:00Z");
  G.casBorrow(w, 100000, D, false, t0);
  const x = w.loan.list[0];
  assert.strictEqual(x.at, t0);
  assert.strictEqual(G.casLoanView(w, D).list[0].from, t0 + C.repayAfterMin * 60000);
  const no = G.casRepay(w, null, D, false, t0 + (C.repayAfterMin - 1) * 60000);
  assert.ok(!no.ok && no.reason.includes(String(C.repayAfterMin)) && no.reason.includes("1 分鐘"), no.reason);
  assert.ok(G.casRepay(w, null, D, false, t0 + C.repayAfterMin * 60000).ok);
});

T("到期沒還：隔天換日直接扣，扣到負的也扣；額度降 latePct%；記下欠款從哪天開始；有壹句 Yuga 來收錢", G => {
  const C = G.NUM.casino.loan, w = mk(G);
  G.casBorrow(w, 500000, D);
  w.loan.limit = C.limit * 3;
  const owe = w.loan.list[0].owe;
  w.chips = 1000;
  G.casWalletFix(w, plus(D, C.days)); // 最後壹天還沒到期
  assert.strictEqual(w.loan.list.length, 1); assert.strictEqual(w.chips, 1000);
  const late = plus(D, C.days + 2); // 隔了兩天才回來
  G.casWalletFix(w, late);
  assert.strictEqual(w.loan.list.length, 0);
  assert.strictEqual(w.chips, 1000 - owe);
  assert.ok(w.chips < 0);
  assert.strictEqual(w.loan.limit, Math.floor(C.limit * 3 * (100 - C.latePct) / 100), "降 latePct%，不是退回壹開始的");
  assert.strictEqual(w.loan.late, 1);
  assert.strictEqual(w.loan.debtSince, plus(D, C.days + 1), "從到期的隔天算");
  assert.strictEqual(G.casLoanView(w, late).debtDays, 1);
  assert.strictEqual(G.casLoanTakeNotes(w).length, 1);
  assert.strictEqual(w.loan.notes.length, 0);
  // 同壹天再讀壹次不會再扣
  G.casWalletFix(w, late); assert.strictEqual(w.chips, 1000 - owe);
});

T("欠款中（籌碼是負的）也可以借（翊文 11-10），壹樣受額度限制；回到 0 以上就沒有欠款日期", G => {
  const w = mk(G);
  w.chips = -10; w.loan.debtSince = D;
  assert.ok(G.casBorrow(w, 100000, D).ok);
  assert.strictEqual(w.chips, 100000 - 10);
  w.chips = -10; w.loan.limit = 100000;
  assert.ok(!G.casBorrow(w, 100000, D).ok, "額度用完");
  w.chips = 0; G.casWalletFix(w, D);
  assert.strictEqual(w.loan.debtSince, null);
});

T("舊錢包沒有 loan：補上，額度是壹開始的；壞掉的借款丟掉；負的籌碼留著", G => {
  const C = G.NUM.casino.loan;
  const w = G.casWalletFix({ chips: -500, rel: { day: D, n: 2 }, loan: { list: [{ amt: "x" }, { id: 1, amt: 100, owe: 110, day: D, due: plus(D, 3) }] } }, D);
  assert.strictEqual(w.chips, -500);
  assert.strictEqual(w.loan.list.length, 1);
  assert.strictEqual(w.loan.limit, C.limit);
  assert.strictEqual(w.loan.debtSince, D);
  const v = G.casWalletView(G.casWalletFix(null, D), D);
  assert.ok(v.loan && v.loan.left === C.limit && Array.isArray(v.loan.list) && v.loan.why === null);
});

T("Discord 的借（casRelief）：壹次借 NUM.casino.loan.discord，額度不夠借剩下的", G => {
  const C = G.NUM.casino.loan, w = mk(G);
  assert.strictEqual(G.casRelief(w, D).loan.amt, Math.min(C.discord, C.limit));
  w.loan.limit = C.discord + C.min; // 剩 C.min
  assert.strictEqual(G.casRelief(w, D).loan.amt, C.min);
});

T("決定 0071：借的錢從莊家出、還的本金加利息回莊家、到期被扣的下次碰到莊家時交過去", G => {
  const w = G.casWalletFix(null, D), house = G.casHouseNew(), h0 = house.bankroll;
  const r = G.casBorrow(w, 100000, D, false, null, house);
  assert.ok(r.ok); assert.strictEqual(house.bankroll, h0 - 100000);
  w.loan.list[0].at = null; // 不用等 repayAfterMin
  const back = G.casRepay(w, null, D, false, null, house);
  assert.ok(back.ok); assert.strictEqual(house.bankroll, h0 - 100000 + back.loan.owe, "本金加利息回莊家");
  // 到期沒還：換日扣籌碼，記在 toHouse；碰到莊家時交過去
  const w2 = G.casWalletFix(null, D), h2 = G.casHouseNew(), b2 = h2.bankroll;
  const x = G.casBorrow(w2, 100000, D, false, null, h2).loan;
  const later = G.casAddDaysForTest ? G.casAddDaysForTest(x.due, 1) : null;
  const day2 = later || (d => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10); })(x.due);
  G.casWalletFix(w2, day2);
  assert.strictEqual(w2.loan.toHouse, x.owe);
  assert.strictEqual(G.casLoanToHouse(w2, h2), x.owe);
  assert.strictEqual(h2.bankroll, b2 - 100000 + x.owe); assert.strictEqual(w2.loan.toHouse, 0);
  assert.strictEqual(G.casLoanToHouse(w2, h2), 0, "交過就沒了");
  const old = G.casWalletFix(null, D); delete old.loan.toHouse; G.casWalletFix(old, D); assert.strictEqual(old.loan.toHouse, 0, "舊錢包補 0");
});
console.log(`loan.test：${pass} 過，${fail} 沒過`);
if (fail) process.exit(1);
