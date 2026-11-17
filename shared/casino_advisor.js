// ================================================================
//  財經專員（決定 0093 第 3 件，翊文 11-15：「三件都做」）
//  欠了不少錢（錢包是負的，或沒還的借款加起來 ≥ NUM.casino.advisor.minOwe）的館友，銀行頁會出現金融集團的財經專員「梁安」（content/npc/v-advisor.json），
//  提一份還款計畫：①每筆借款可以延期（多給幾天，多加壹筆手續費，每筆最多壹次、還沒到期才行）②賣哪幾支股票最划算（館內股沒資本利得稅，先賣；再賣館外股）。
//  只有館友按了「同意」才動：延期走 casAdvisorExtend；賣股走賣股還債（casSellForDebt，決定 0093 第 2 件）。專員自己不動錢。
//  第壹次符合的時候寄壹封個人信（casAdvisorLetter，固定編號、壹人壹封）；好起來之後又欠了，隔至少 resendDays 天可以再寄（編號帶日期）。
//  純函式。
// ================================================================
import { NUM } from "./config.js";
import { casFill, casNum } from "./casino.js";
import { casStockFix, casStockHouseFix } from "./casino_stock.js";
import { IN_IDS, casInFix, casInPrice } from "./casino_stock_in.js";
import { casDebtOwed } from "./casino_debt.js";
import { casLoanSplitPlan } from "./casino_wallet.js";
import { IN_STOCKS } from "./stocks_in_text.js";
import { OUT_STOCKS } from "./stocks_text.js";
import { US_IDS } from "./stocks_tw.js";

export const CAS_ADVISOR = {
  name: "財經專員 梁安",
  none: "你現在沒有需要排計畫的欠款。",
  noLoan: "找不到這筆借款。",
  late: "這筆已經過了到期日，來不及延期了。",
  once: "這筆已經延過期了，每筆只能延壹次。",
  split: "這筆轉成分期了，延期和分期只能選壹個。",
  done: "延期好了：這筆改成 {due} 到期，手續費 {fee} 加進要還的錢，現在要還 {owe}。",
  mailTitle: "財經專員的還款計畫",
  mailNote: "我是金融集團的財經專員梁安。你現在欠 {owed}（{part}）。我排了壹份計畫：{plan}。到銀行頁看，同意了才動，不同意就當我沒來過。",
  mailPlanExt: "借款可以延 {days} 天（每筆手續費 {pct}%）",
  mailPlanSell: "賣 {name} 就能還清",
  mailPlanSell2: "股票先賣館內股再賣館外股",
  mailPlanNone: "先去地下工作或等收入，我再幫你排",
  rulesTitle: "借款新規定：可以部分還、轉分期",
  rulesNote: "我是金融集團的財經專員梁安。借款有新規定，你手上還有借款，所以寫信告訴你：壹、可以「還壹部分」：先還利息、再還本金，壹次最少 {min}（剩下的 5%，最少 1,000），每筆最多 {max} 次；部分還款不算準時還清，額度不會升，整筆還清才升。二、借了壹天以上、本金 10 萬以上、沒延過期的，可以轉 2～4 期分期，每期隔 3～7 天（最多多 21 天），延後的部分照借款日利率收手續費（每天約 {fee}%）；分期和延期只能選壹個。三、賣股還債也可以只還壹部分。你的借款：{loans}。到銀行借款頁就能用。",
  rulesLoan: "借 {amt}、要還 {owe}、{due} 到期，轉 3 期（每 7 天）每期約 {each}、手續費共 {fee}",
  rulesMore: "還有 {n} 筆",
  partNeg: "錢包欠 {n}",
  partLoan: "借款共 {n}",
};
const adN = v => (Number.isFinite(+v) ? Math.floor(+v) : 0);
const advBox = w => { if (!w.adv || typeof w.adv !== "object") w.adv = { sent: 0, last: "", clear: true }; return w.adv; };
const advDayNum = s => { const [y, m, d] = String(s).split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
const advAddDays = (s, n) => new Date((advDayNum(s) + n) * 86400000).toISOString().slice(0, 10);
const advLoans = w => ((w && w.loan && Array.isArray(w.loan.list)) ? w.loan.list : []);

// 欠多少：{ neg 錢包的負數, loan 沒還的借款（本金加利息）, total, need 要不要專員 }
export function casAdvisorDebt(w) {
  const neg = Math.max(0, -adN(w && w.chips)), loan = advLoans(w).reduce((s, x) => s + adN(x.owe), 0);
  return { neg, loan, total: neg + loan, need: neg > 0 || neg + loan >= NUM.casino.advisor.minOwe };
}
// 這筆借款能不能延期：回 null ＝ 可以，不然回原因
export function casAdvisorWhyNot(x, day) {
  if (!x) return CAS_ADVISOR.noLoan;
  if (day > x.due) return CAS_ADVISOR.late;
  if (adN(x.ext) >= NUM.casino.advisor.maxExt) return CAS_ADVISOR.once;
  if (Array.isArray(x.plan) && x.plan.length) return CAS_ADVISOR.split; // 轉過分期的不能再延期（二選一）
  return null;
}
export const casAdvisorFee = x => Math.ceil(adN(x.owe) * NUM.casino.advisor.feePct / 100);
// 館友同意延期壹筆：到期日多 extendDays 天，手續費加進要還的錢（還的時候跟本金利息壹起回到莊家，所以帳不變）
export function casAdvisorExtend(w, id, day) {
  if (!casAdvisorDebt(w).need) return { ok: false, reason: CAS_ADVISOR.none };
  const x = advLoans(w).find(y => y.id === Math.floor(Number(id)));
  const why = casAdvisorWhyNot(x, day);
  if (why) return { ok: false, reason: why };
  const fee = casAdvisorFee(x);
  x.owe = adN(x.owe) + fee; x.due = advAddDays(x.due, NUM.casino.advisor.extendDays); x.ext = adN(x.ext) + 1;
  return { ok: true, loan: x, fee, lines: [casFill(CAS_ADVISOR.done, { due: x.due.slice(5), fee: casNum(fee), owe: casNum(x.owe) })] };
}

// 還款計畫（給畫面和信用）。day、t 用來看股價、停盤；house 可以沒有（沒有就不排賣股）
// 回傳 { need, debt, loans: [{ id, owe, due, canExtend, why, fee, newDue }], sells: [{ id, name, kind, own, px, value, n, covers }], sellTotal, enough }
//   sells 的順序就是建議賣的順序：館內股在前，館外股在後，各自市值大的在前；n ＝ 賣到剛好夠還（或全賣）要幾股
export function casAdvisorPlan(w, house, day, t) {
  const debt = casAdvisorDebt(w), C = NUM.casino.advisor;
  const ls = advLoans(w).slice().sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.id - b.id)).map(x => {
    const why = casAdvisorWhyNot(x, day);
    return { id: x.id, owe: adN(x.owe), due: x.due, canExtend: !why, why: why || "", fee: casAdvisorFee(x), newDue: advAddDays(x.due, C.extendDays) };
  });
  const sells = [], sellNeed = casDebtOwed(w, t).total; // 賣股只還得了「錢包的負數＋現在還得了的借款」（跟賣股還債一樣）；還沒到能還的借款不算，不然計畫會寫成賣太多被伺服器擋
  if (house) {
    const kOf = id => 1 - NUM.casino.stock.feePct / 100 - (US_IDS.includes(id) ? NUM.casino.stock.taxUs : NUM.casino.stock.taxPct) / 100, hold = []; // 賣 1 元拿到幾元：扣手續費和證交稅（決定 0111）
    for (const s of IN_STOCKS) { const own = adN(casInFix(w).own[s.id]); if (own <= 0) continue; const pr = casInPrice(house, s.id, day, t); if (pr.halted) continue; hold.push({ id: s.id, name: s.name, kind: "in", own, px: pr.px, k: kOf(s.id) }); }
    for (const s of OUT_STOCKS) { const own = adN(casStockFix(w).own[s.id]); if (own <= 0) continue; const px = casStockHouseFix(house).px[s.id]; if (!(px > 0)) continue; hold.push({ id: s.id, name: s.name, kind: "out", own, px, k: kOf(s.id) }); }
    hold.forEach(h => { h.value = Math.floor(h.own * h.px * h.k); });
    hold.sort((a, b) => (a.kind === b.kind ? b.value - a.value : a.kind === "in" ? -1 : 1));
    let need = sellNeed;
    for (const h of hold) { if (need <= 0) break; const n = Math.min(h.own, Math.max(1, Math.ceil(need / (h.px * h.k)))); const got = Math.floor(n * h.px * h.k); sells.push({ id: h.id, name: h.name, kind: h.kind, own: h.own, px: h.px, value: h.value, n, covers: got }); need -= got; }
  }
  const sellTotal = sells.reduce((s, x) => s + x.covers, 0);
  return { need: debt.need, debt, loans: ls, sells, sellTotal, sellNeed, enough: sellTotal >= sellNeed };
}

// 個人信：第壹次符合寄固定編號的（advisor-first）；好起來之後又欠了，隔 resendDays 天可以再寄（編號 advisor-日期）。回 null ＝ 這次不寄；回 { id, mail } 並記在 w.adv
// 借款新規定的信（決定 0114，翊文 11-17）：還有借款沒還的館友，下一次碰到錢包時寄壹封（固定編號、每人壹封），帶自己的數字：每筆欠多少、哪天到期、轉 3 期每期約多少、手續費
export function casAdvisorRulesLetter(w, day, days = 30) {
  const A = advBox(w), L = advLoans(w);
  if (A.rules || !L.length) return null;
  A.rules = day;
  const C = NUM.casino.loan, rows = L.slice().sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.id - b.id)), show = rows.slice(0, 3).map(x => {
    const p = casLoanSplitPlan({ amt: adN(x.amt), owe: adN(x.owe), due: x.due }, 3, 7);
    return casFill(CAS_ADVISOR.rulesLoan, { amt: casNum(x.amt), owe: casNum(x.owe), due: x.due.slice(5), each: casNum(Math.round(p.plan.reduce((s, q) => s + q.owe, 0) / 3)), fee: casNum(p.fee) });
  });
  if (rows.length > 3) show.push(casFill(CAS_ADVISOR.rulesMore, { n: rows.length - 3 }));
  const min = Math.min(...rows.map(x => Math.min(adN(x.owe), Math.max(C.part.minAbs, Math.ceil(adN(x.owe) * C.part.minPct / 100)))));
  const id = "advisor-rules";
  return { id, mail: { id, from: CAS_ADVISOR.name, title: CAS_ADVISOR.rulesTitle, note: casFill(CAS_ADVISOR.rulesNote, { min: casNum(min), max: C.part.max, fee: (C.interestPct / C.days).toFixed(2), loans: show.join("；") }), gift: { insp: 0, mood: 0 }, sent: day, expire: advAddDays(day, days), claimed: false } };
}
export function casAdvisorLetter(w, house, day, t, days = 30) {
  const rl = casAdvisorRulesLetter(w, day, days);
  if (rl) return rl; // 新規定的信先寄；欠款的信下一次碰到再寄（它的條件沒被用掉）
  const A = advBox(w), d = casAdvisorDebt(w);
  if (!d.need) { A.clear = true; return null; }
  const first = !A.sent;
  if (!first && !(A.clear && A.last && advDayNum(day) - advDayNum(A.last) >= NUM.casino.advisor.resendDays)) return null;
  A.sent = adN(A.sent) + 1; A.last = day; A.clear = false;
  const plan = casAdvisorPlan(w, house, day, t), parts = [];
  if (d.neg > 0) parts.push(casFill(CAS_ADVISOR.partNeg, { n: casNum(d.neg) }));
  if (d.loan > 0) parts.push(casFill(CAS_ADVISOR.partLoan, { n: casNum(d.loan) }));
  const steps = [];
  if (plan.loans.some(x => x.canExtend)) steps.push(casFill(CAS_ADVISOR.mailPlanExt, { days: NUM.casino.advisor.extendDays, pct: NUM.casino.advisor.feePct }));
  if (plan.sells.length && plan.enough) steps.push(plan.sells.length === 1 ? casFill(CAS_ADVISOR.mailPlanSell, { name: plan.sells[0].name }) : CAS_ADVISOR.mailPlanSell2);
  else if (plan.sells.length) steps.push(CAS_ADVISOR.mailPlanSell2);
  if (!steps.length) steps.push(CAS_ADVISOR.mailPlanNone);
  const exp = advAddDays(day, days);
  const id = first ? "advisor-first" : "advisor-" + day;
  return { id, mail: { id, from: CAS_ADVISOR.name, title: CAS_ADVISOR.mailTitle, note: casFill(CAS_ADVISOR.mailNote, { owed: casNum(d.total), part: parts.join("、"), plan: steps.join("；") }), gift: { insp: 0, mood: 0 }, sent: day, expire: exp, claimed: false } };
}
