// 財經專員（決定 0093 第 3 件，shared/casino/advisor.js）：node test/casino_advisor.test.cjs（npm test 也會跑）
// 欠多少才算、借款延期（手續費、每筆壹次、到期前才行、不留到下次修復時被洗掉）、還款計畫的賣股順序、個人信（壹人壹封、好起來又欠了隔幾天再寄）、帳對得上。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.US_IDS.length = 0; G.NUM.casino.grants = []; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const D = "2026-11-14", ID = "greeneye";
const at = (d, h) => Date.parse(`${d}T${String(h).padStart(2, "0")}:30:00+08:00`);
const OPEN = at(D, 14);
const fresh = G => { const w = G.casWalletFix(G.casWalletNew(), D), house = G.casHouseFix(G.casHouseNew(), D).house; w.chips = 5000000000; G.casStockHouseFix(house); return { w, house }; };
const gap = (G, s, op) => G.casBookGap(G.casBookSnap([s.w], s.house, 0, null), op);
const borrowTo = (G, s, n) => { const x = G.casBorrow(s.w, n, D, false, OPEN, s.house); assert.ok(x.ok, x.reason); return x.loan; };

T("誰需要專員：錢包是負的（再小也算）、或沒還的借款本金加利息 ≥ minOwe；沒欠的不用", G => {
  const s = fresh(G); assert.strictEqual(G.casAdvisorDebt(s.w).need, false);
  s.w.chips = -1; assert.strictEqual(G.casAdvisorDebt(s.w).need, true); assert.strictEqual(G.casAdvisorDebt(s.w).neg, 1);
  const t = fresh(G); t.w.loan.limit = 3000000; borrowTo(G, t, 500000); assert.strictEqual(G.casAdvisorDebt(t.w).need, false, "借得少不用");
  const u = fresh(G); u.w.loan.limit = 3000000; borrowTo(G, u, 1000000); assert.strictEqual(G.casAdvisorDebt(u.w).need, true, "本金加利息過了門檻"); assert.ok(G.casAdvisorDebt(u.w).loan >= G.NUM.casino.advisor.minOwe);
});
T("延期：到期日多幾天、手續費加進要還的錢、每筆只能壹次、過了到期日不行；沒欠的擋掉；還的時候照新的錢還、帳對得上", G => {
  const s = fresh(G); s.w.loan.limit = 3000000; const x = borrowTo(G, s, 1000000), C = G.NUM.casino.advisor, owe0 = x.owe, due0 = x.due;
  const op = G.casBookOpening(G.casBookSnap([s.w], s.house, 0, null));
  const r = G.casAdvisorExtend(s.w, x.id, D); assert.ok(r.ok, r.reason);
  assert.strictEqual(r.fee, Math.ceil(owe0 * C.feePct / 100)); assert.strictEqual(x.owe, owe0 + r.fee); assert.ok(x.due > due0); assert.strictEqual(x.ext, 1);
  const again = G.casAdvisorExtend(s.w, x.id, D); assert.ok(!again.ok && /延壹次/.test(again.reason), again.reason);
  assert.ok(!G.casAdvisorExtend(s.w, 999, D).ok, "沒有這筆");
  const s2 = fresh(G); s2.w.loan.limit = 3000000; const y = borrowTo(G, s2, 1000000); const late = G.casAdvisorExtend(s2.w, y.id, y.due.replace(/\d\d$/, m => String(+m + 1).padStart(2, "0"))); assert.ok(!late.ok && /來不及/.test(late.reason), late.reason);
  const s3 = fresh(G); assert.ok(!G.casAdvisorExtend(s3.w, 1, D).ok, "沒欠不用專員");
  G.casWalletFix(s.w, D); assert.strictEqual(s.w.loan.list[0].ext, 1, "存檔修復之後延過的記號還在（不能洗掉再延）");
  const rep = G.casRepay(s.w, x.id, D, false, OPEN + G.NUM.casino.loan.repayAfterMin * 60000 + 1, s.house); assert.ok(rep.ok, rep.reason);
  assert.strictEqual(gap(G, s, op), 0, "帳對得上");
});
T("延期的手續費換成每天的利率不比借款本身低（延了不會比不延划算得多）", G => {
  const C = G.NUM.casino.advisor, L = G.NUM.casino.loan; assert.ok(C.feePct / C.extendDays >= L.interestPct / L.days, "手續費每天 " + C.feePct / C.extendDays + "% 不低於借款每天 " + L.interestPct / L.days + "%");
});
T("還款計畫：賣股的順序館內股在前、再館外股，各自市值大的在前；賣到剛好夠還；不夠就 enough=false；停盤的不排", G => {
  const s = fresh(G); G.casStockBuy(s.w, s.house, ID, 3000, D, OPEN); s.w.chips = -5000000;
  const p = G.casAdvisorPlan(s.w, s.house, D, OPEN); assert.strictEqual(p.need, true); assert.ok(p.sells.length >= 1 && p.sells[0].id === ID && p.sells[0].kind === "out");
  assert.ok(p.enough && p.sellTotal >= 5000000, "夠還"); assert.ok(p.sells[0].n <= p.sells[0].own);
  const q = fresh(G); q.w.chips = -5000000; const none = G.casAdvisorPlan(q.w, q.house, D, OPEN); assert.strictEqual(none.sells.length, 0); assert.strictEqual(none.enough, false);
  const r = fresh(G); G.casStockBuy(r.w, r.house, ID, 50, D, OPEN); r.w.chips = -50000000; const poor = G.casAdvisorPlan(r.w, r.house, D, OPEN); assert.strictEqual(poor.enough, false, "股票不夠還"); assert.strictEqual(poor.sells[0].n, poor.sells[0].own, "全賣");
  const loansPlan = fresh(G); loansPlan.w.loan.limit = 3000000; borrowTo(G, loansPlan, 1000000); const lp = G.casAdvisorPlan(loansPlan.w, loansPlan.house, D, OPEN); assert.strictEqual(lp.loans.length, 1); assert.ok(lp.loans[0].canExtend && lp.loans[0].fee > 0 && lp.loans[0].newDue > lp.loans[0].due);
});
T("賣股計畫只算還得了的欠款：剛借的借款還不能還，計畫的股數不能比賣股還債收的多（不然按同意會被擋）", G => {
  const s = fresh(G); G.casStockBuy(s.w, s.house, ID, 300, D, OPEN); s.w.loan.limit = 3000000; borrowTo(G, s, 1000000); s.w.chips = -1400000;
  const p = G.casAdvisorPlan(s.w, s.house, D, OPEN), owed = G.casDebtOwed(s.w, OPEN).total;
  assert.strictEqual(p.sellNeed, owed, "計畫要還的＝賣股還債收的欠款"); assert.ok(p.debt.total > owed, "借款還沒到能還的時候，畫面欠的比能賣來還的多");
  assert.ok(p.sells.length >= 1 && p.enough);
  const r = G.casSellForDebt(s.w, s.house, p.sells[0].id, p.sells[0].n, D, OPEN); assert.ok(r.ok, r.reason);
});
T("個人信：第壹次符合寄固定編號壹封；之後不重寄；好起來之後又欠了，隔 resendDays 天再寄（編號帶日期）；沒欠的不寄", G => {
  const s = fresh(G); assert.strictEqual(G.casAdvisorLetter(s.w, s.house, D, OPEN), null, "沒欠不寄");
  s.w.chips = -3000000; const a = G.casAdvisorLetter(s.w, s.house, D, OPEN); assert.ok(a && a.id === "advisor-first");
  assert.strictEqual(a.mail.from, G.CAS_ADVISOR.name); assert.ok(a.mail.note.includes(G.casNum(3000000)) && a.mail.gift.insp === 0 && a.mail.gift.mood === 0 && a.mail.claimed === false && a.mail.expire > a.mail.sent);
  assert.strictEqual(G.casAdvisorLetter(s.w, s.house, D, OPEN), null, "同壹天不重寄"); assert.strictEqual(G.casAdvisorLetter(s.w, s.house, "2026-12-30", OPEN), null, "還沒好起來過，不重寄");
  s.w.chips = 1000; assert.strictEqual(G.casAdvisorLetter(s.w, s.house, "2026-11-15", OPEN), null, "好起來了：記起來，不寄");
  s.w.chips = -100; assert.strictEqual(G.casAdvisorLetter(s.w, s.house, "2026-11-16", OPEN), null, "又欠了，但離上封才 2 天");
  const b = G.casAdvisorLetter(s.w, s.house, "2026-11-22", OPEN); assert.ok(b && b.id === "advisor-2026-11-22");
});
console.log(`財經專員：${pass} 過，${fail} 沒過`); process.exit(fail ? 1 : 0);
