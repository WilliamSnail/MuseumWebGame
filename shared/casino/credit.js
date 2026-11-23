// ================================================================
//  信用等級（升級的點數在 shared/casino/stock_lev.js 的 w.lev.cr.pts）和「信用等級決定的上限」（決定 0093，翊文 11-15：「賣出上限隨信用等級」）
//  純函式，不碰資料庫。這個檔只讀 w.lev.cr.pts，不 import 別的規則檔，所以股票的賣出（casino/stock.js、casino/stock_in.js）和槓桿（casino/stock_lev.js）都能放心用，不會互相 import 成圈。
//    casCreditLevel(w)      現在信用幾級（0～maxLevel）
//    casSellCap(w)          壹人壹天賣出的上限 ＝ NUM.casino.stock.sellDay × 信用等級對應的倍數（NUM.casino.stock.sellMultByCredit ＝ [[等級 ≥, 倍數], …]，沒有符合的 ＝ 1）
//    casSellNext(w)         再升到哪一級可以賣更多：[等級, 上限]；已經最高 ＝ null
//    casSellTip(w)          畫面和錯誤訊息用的壹句：「信用升到 2 級可以賣到 5,000 萬。」；沒有 ＝ ""
//    casSellView(w, sold)   畫面用的 { sellLeft, sellCap, sellTip }；不限 ＝ null
//    sellDay 0 ＝ 壹人壹天賣出不限（決定 0154，翊文 11-23），casSellCap 回 Infinity
//  全館淨賣出上限（館內股、守住莊家）、海外的付得出來（館外股）照舊，不受信用等級影響。
// ================================================================
import { NUM } from "../core/config.js";

export const casCreditLevel = w => {
  const K = NUM.casino.stockLev.credit, p = w && w.lev && w.lev.cr ? +w.lev.cr.pts : 0;
  return Math.min(K.maxLevel, Math.floor(Math.max(0, Number.isFinite(p) ? p : 0) / K.ptsPerLevel));
};
const crTiers = () => (NUM.casino.stock.sellMultByCredit || []).filter(t => Array.isArray(t) && t[1] > 0).slice().sort((a, b) => a[0] - b[0]);
export function casSellCap(w) {
  if (!(NUM.casino.stock.sellDay > 0)) return Infinity; // sellDay 0 ＝ 不限（決定 0154，翊文 11-23 取消壹人壹天賣出上限）
  const lv = casCreditLevel(w); let m = 1;
  for (const [l, x] of crTiers()) if (lv >= l) m = x;
  return Math.floor(NUM.casino.stock.sellDay * m);
}
export function casSellNext(w) {
  const lv = casCreditLevel(w), cur = casSellCap(w);
  for (const [l, x] of crTiers()) if (l > lv && Math.floor(NUM.casino.stock.sellDay * x) > cur) return [l, Math.floor(NUM.casino.stock.sellDay * x)];
  return null;
}
const crMoney = n => (n >= 100000000 && n % 100000000 === 0 ? `${n / 100000000} 億` : n >= 10000 && n % 10000 === 0 ? `${(n / 10000).toLocaleString("en-US")} 萬` : n.toLocaleString("en-US"));
export const casSellTip = w => { const nx = casSellNext(w); return nx ? `信用升到 ${nx[0]} 級可以賣到 ${crMoney(nx[1])}。` : ""; };
export const casSellMoney = crMoney;
// 畫面用的三個欄位：不限的時候 sellLeft、sellCap 給 null（畫面看到 null 就不寫額度）
export function casSellView(w, sold) {
  const cap = casSellCap(w), on = Number.isFinite(cap);
  return { sellLeft: on ? Math.max(0, cap - sold) : null, sellCap: on ? cap : null, sellTip: on ? casSellTip(w) : "" };
}
