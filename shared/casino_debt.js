// ================================================================
//  賣股還債（決定 0093 第 2 件，翊文 11-15：「三件都做」）
//  欠了錢（借款還沒還、或錢包是負的）的館友，可以把股票賣掉直接還債：不受「壹人壹天賣出上限」，賣的錢先補錢包的負數、再照到期順序還借款（要壹次還清壹筆）。
//    欠款 ＝ 錢包的負數（到期被扣掉的借款）＋ 現在還得了的借款（還沒到「借了幾分鐘後才能還」的不算）的本金加利息。
//    股數最多賣到「賣得的錢（扣手續費後）剛好夠還欠款」，不會賣過頭；手續費、館外股的資本利得稅照舊；館外股外面世界付、館內股莊家付，還給莊家的借款回到莊家（所以莊家不會被搬空）。
//    不算進壹人壹天的賣出額度（sold）和館內股的全館淨賣出（net）：賣的錢大半馬上還給莊家。
//  純函式。館外股、館內股都能賣。
// ================================================================
import { NUM } from "./config.js";
import { casFill, casNum } from "./casino.js";
import { casLoanFrom, casRepay } from "./casino_wallet.js";
import { casStockFix, casStockHouseFix, casStockSell } from "./casino_stock.js";
import { IN_IDS, casInFix, casInPrice, casInSell } from "./casino_stock_in.js";
import { OUT_STOCKS } from "./stocks_text.js";

export const CAS_DEBT = {
  none: "你現在沒有欠款，不用賣股票還債。",
  bad: "要賣哪一支、幾股？",
  noStock: "你沒有這支股票。",
  halt: "這支股票現在停盤，等開盤再賣。",
  tooMany: "你只欠{owed}，賣 {n} 股賣得太多了：最多賣 {max} 股。",
  done: "賣股還債：賣了 {n} 股，拿到 {net}，還了{paid}的欠款，還剩欠款{left}。",
};
const dN = v => (Number.isFinite(+v) ? Math.floor(+v) : 0);
// 現在還得了的借款（照到期順序）
const repayable = (w, t) => ((w && w.loan && Array.isArray(w.loan.list)) ? w.loan.list : []).filter(x => { const f = casLoanFrom(x); return !(f && Number.isFinite(t) && t < f); }).slice().sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.id - b.id));
// 欠款：{ neg 錢包的負數, loans [{ id, owe, due }]（還得了的，照到期順序）, total }
export function casDebtOwed(w, t) {
  const neg = Math.max(0, -dN(w && w.chips)), loans = repayable(w, t).map(x => ({ id: x.id, owe: dN(x.owe), due: x.due }));
  return { neg, loans, total: neg + loans.reduce((s, x) => s + x.owe, 0) };
}
// 畫面要的：有欠款才有「賣股還債」
export function casDebtView(w, t) { const d = casDebtOwed(w, t); return { owed: d.total, neg: d.neg, loans: d.loans.length, can: d.total > 0 }; }

// 賣 shares 股（"max" ＝賣到剛好夠還）還債。id 是館外或館內的股票
export function casSellForDebt(w, house, id, shares, day, t) {
  const D = casDebtOwed(w, t);
  if (D.total <= 0) return { ok: false, reason: CAS_DEBT.none };
  const isIn = IN_IDS.includes(id), isOut = OUT_STOCKS.some(s => s.id === id);
  if (!isIn && !isOut) return { ok: false, reason: CAS_DEBT.bad };
  const have0 = isIn ? dN(casInFix(w).own[id]) : dN(casStockFix(w).own[id]);
  if (have0 <= 0) return { ok: false, reason: CAS_DEBT.noStock };
  let px;
  if (isIn) { const pr = casInPrice(house, id, day, t); if (pr.halted) return { ok: false, reason: CAS_DEBT.halt }; px = pr.px; }
  else px = casStockHouseFix(house).px[id];
  const feePct = NUM.casino.stock.feePct / 100, perShare = px * (1 - feePct); // 賣 1 股拿到的錢（還沒扣稅，稅只會讓拿到的更少）
  const need = Math.max(1, Math.ceil(D.total / perShare)); // 剛好夠還要賣幾股
  const n = shares === "max" ? Math.min(need, have0) : Math.floor(Number(String(shares == null ? "" : shares).replace(/[,，\s]/g, "")));
  if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: CAS_DEBT.bad };
  if (n > need) return { ok: false, reason: casFill(CAS_DEBT.tooMany, { owed: casNum(D.total), n: casNum(n), max: casNum(need) }) };
  const r = isIn ? casInSell(w, house, id, n, day, t, undefined, undefined, { free: true }) : casStockSell(w, house, id, n, day, t, { free: true });
  if (!r.ok) return r;
  // 賣的錢已經進錢包（負的先補）；還得了的借款照到期順序壹筆壹筆還清
  const paid = []; let repaid = 0;
  for (const x of D.loans) { if (dN(w.chips) < x.owe) break; const rr = casRepay(w, x.id, day, false, t, house); if (!rr.ok) break; paid.push(x.id); repaid += x.owe; }
  const left = casDebtOwed(w, t).total;
  return { ok: true, n: r.n, px: r.px, gross: r.gross, fee: r.fee, tax: r.tax || 0, net: r.net, repaid, paidLoans: paid, left, chips: w.chips, lines: r.lines.concat([casFill(CAS_DEBT.done, { n: casNum(r.n), net: casNum(r.net), paid: casNum(D.total - left), left: casNum(left) })]) };
}
