// 股票成交紀錄（翊文 11-20）：每個玩家錢包 w.tl 記最近 50 筆成交（環狀，超過就丟最舊的），館外股、館內股、集團股、槓桿都記。
// 只是「多記」，不改任何價格、手續費、稅、損益的算法。在成交那壹刻、跟改錢包的程式碼寫在同壹處（同壹個交易）。
// 短鍵名（50 筆約 4 KB）：d 日子、t 毫秒時間（掛單成交沒有就 0）、id 股票、m 市場（o 館外、i 館內、g 集團）、a 動作（b 買、s 賣、lo 槓桿開倉、lc 槓桿平倉）、
// n 股數、p 成交價、f 手續費、x 證交稅、g 這筆賣出的損益（賣出和平倉才有）、q 1＝掛單成交、r 1＝賣股還債、
// 槓桿：y 方向（l 做多、s 放空）、v 倍數、w 平倉的原因（close 手動、liq 強平、stop 停損、take 停利、flat 收盤自動）、mk 部位的市場（tw／us／in／grp）。
// 以前的成交沒有紀錄，不補，從上線那刻開始累積。
export const CAS_TRADE_MAX = 50;
export function casTradeLog(w, rec) {
  if (!w || typeof w !== "object") return;
  const r = {};
  for (const k of Object.keys(rec)) if (rec[k] !== undefined && rec[k] !== null && rec[k] !== false && rec[k] !== 0 || k === "t") r[k] = rec[k];
  if (!Array.isArray(w.tl)) w.tl = [];
  w.tl.push(r);
  if (w.tl.length > CAS_TRADE_MAX) w.tl = w.tl.slice(-CAS_TRADE_MAX);
}
// 掛單成交：照市價單的做法成交完，把剛記的那壹筆標成「掛單成交」
export function casTradeMarkOrder(w) {
  if (w && Array.isArray(w.tl) && w.tl.length) w.tl[w.tl.length - 1].q = 1;
}
