// ================================================================
//  德州撲克的牌力（決定 0150）：7 張取最好的 5 張牌型。純函式，不碰亂數。
//  牌的編號跟 21 點壹樣（shared/casino/core.js）：0～51，點數 c % 13（0＝A、1＝2 … 12＝K）、花色 floor(c / 13)，所以畫面可以直接用 21 點的牌。
//  回傳壹個可以比大小的數字：類別 × 15^5 ＋ 五個踢腳（高的在前）。類別：0 高牌、1 壹對、2 兩對、3 三條、4 順子、5 同花、6 葫蘆、7 四條、8 同花順（A 高的同花順就是皇家同花順）。
// ================================================================
export const HOLDEM_HAND_NAMES = ["高牌", "壹對", "兩對", "三條", "順子", "同花", "葫蘆", "四條", "同花順"];
const hdEnc = (cat, arr) => { let v = cat; for (let i = 0; i < 5; i++) v = v * 15 + (arr[i] || 0); return v; };
const hdRank = c => (c % 13 + 12) % 13; // 0＝2 … 12＝A（A 最大）
// rs：點數（0＝2 … 12＝A）；回傳順子最高的那張（A2345 的最高是 5＝3），沒有回 -1
function hdStraightHi(rs) {
  const has = new Array(14).fill(false);
  rs.forEach(r => { has[r + 1] = true; if (r === 12) has[0] = true; });
  for (let h = 13; h >= 4; h--) if (has[h] && has[h - 1] && has[h - 2] && has[h - 3] && has[h - 4]) return h - 1;
  return -1;
}
export function holdemScore(cards) {
  const cnt = new Array(13).fill(0), suits = [[], [], [], []];
  for (const c of cards) { const r = hdRank(c); cnt[r]++; suits[Math.floor(c / 13)].push(r); }
  const fs = suits.find(a => a.length >= 5);
  if (fs) { const h = hdStraightHi(fs); if (h >= 0) return hdEnc(8, [h]); }
  const g = [];
  for (let r = 12; r >= 0; r--) if (cnt[r]) g.push([cnt[r], r]);
  g.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const kick = (skip, n) => g.filter(x => !skip.includes(x[1])).map(x => x[1]).slice(0, n);
  if (g[0][0] === 4) return hdEnc(7, [g[0][1]].concat(kick([g[0][1]], 1)));
  if (g[0][0] === 3 && g[1] && g[1][0] >= 2) return hdEnc(6, [g[0][1], g[1][1]]);
  if (fs) return hdEnc(5, fs.slice().sort((a, b) => b - a).slice(0, 5));
  const sh = hdStraightHi(cards.map(hdRank));
  if (sh >= 0) return hdEnc(4, [sh]);
  if (g[0][0] === 3) return hdEnc(3, [g[0][1]].concat(kick([g[0][1]], 2)));
  if (g[0][0] === 2 && g[1] && g[1][0] === 2) return hdEnc(2, [g[0][1], g[1][1]].concat(kick([g[0][1], g[1][1]], 1)));
  if (g[0][0] === 2) return hdEnc(1, [g[0][1]].concat(kick([g[0][1]], 3)));
  return hdEnc(0, g.slice(0, 5).map(x => x[1]));
}
export const holdemCat = sc => Math.floor(sc / Math.pow(15, 5));
export const holdemName = sc => HOLDEM_HAND_NAMES[holdemCat(sc)];
// 給畫面的短描述（「你現在：壹對 K」）：cards 是我的底牌加已翻開的公共牌（至少 2 張）。純函式；只用自己看得到的牌
const HD_RANK_NAMES = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export function holdemDescribe(cards) {
  if (!cards || cards.length < 2) return "";
  const sc = holdemScore(cards), cat = holdemCat(sc), d = i => Math.floor(sc / Math.pow(15, 4 - i)) % 15, R = i => HD_RANK_NAMES[d(i)];
  if (cat === 8) return d(0) === 12 ? "皇家同花順" : `同花順（${R(0)} 高）`;
  if (cat === 7) return `四條 ${R(0)}`;
  if (cat === 6) return `葫蘆（${R(0)} 帶 ${R(1)}）`;
  if (cat === 5) return `同花（${R(0)} 高）`;
  if (cat === 4) return `順子（${R(0)} 高）`;
  if (cat === 3) return `三條 ${R(0)}`;
  if (cat === 2) return `兩對（${R(0)}、${R(1)}）`;
  if (cat === 1) return `壹對 ${R(0)}`;
  return `高牌 ${R(0)}`;
}
