// ================================================================
//  佩佩轉盤（決定 0150，翊文 11-21）：25 格＝ 4 色 × 6 ＋ 1 個特別格（虹彩）；押顏色、稀有度、顏色×稀有度、單格；對莊家，只給籌碼。
//  規則（賠率、限額、結算）在 shared/casino/side_bets.js，這裡只有「格子長怎樣、有哪些押法」。規劃和模擬：docs/規劃/新牌桌遊戲規劃.md、test/sim/sim_pepe_wheel.cjs
//  稀有度的格數照擲骰的比例（普通 60、稀有 28、超稀有 10、傳說 2）湊成 24 格：普通 14、稀有 6、超稀有 3、傳說 1。
//  押法 id：c:紅（顏色）、r:普通（稀有度）、x:紅普通（顏色×稀有度）、n:0～24（單格；第 24 格是特別格）。特別格沒押它的全輸。
// ================================================================
import { NUM } from "../core/config.js";
import { casSbInfo, casSbSpin } from "./side_bets.js";

export const WHEEL_COLORS = ["紅", "綠", "黃", "黑"];
export const WHEEL_RARITIES = ["普通", "稀有", "超稀有", "傳說"];
const LAYOUT = { 紅: ["普通", "普通", "普通", "普通", "稀有", "超稀有"], 綠: ["普通", "普通", "普通", "普通", "稀有", "超稀有"], 黃: ["普通", "普通", "普通", "稀有", "稀有", "超稀有"], 黑: ["普通", "普通", "普通", "稀有", "稀有", "傳說"] };
export const WHEEL_SLOTS = WHEEL_COLORS.flatMap(c => LAYOUT[c].map(r => ({ color: c, rar: r }))).concat([{ color: "虹彩", rar: "特別" }]);
export const WHEEL_SPECIAL = WHEEL_SLOTS.length - 1;
const slotHit = (s, i, id) => {
  const k = id.slice(0, 2), v = id.slice(2);
  return k === "c:" ? s.color === v : k === "r:" ? s.rar === v : k === "x:" ? s.color + s.rar === v : k === "n:" ? String(i) === v : false;
};
const cellTypes = () => {
  const T = [];
  WHEEL_COLORS.forEach(c => T.push({ id: "c:" + c, label: `${c}色` }));
  WHEEL_RARITIES.forEach(r => T.push({ id: "r:" + r, label: `稀有度：${r}` }));
  WHEEL_COLORS.forEach(c => [...new Set(LAYOUT[c])].forEach(r => T.push({ id: "x:" + c + r, label: `${c}色的${r}` })));
  WHEEL_SLOTS.forEach((s, i) => T.push({ id: "n:" + i, label: i === WHEEL_SPECIAL ? "特別格" : `第 ${i + 1} 格（${s.color}・${s.rar}）` }));
  return T;
};
export const WHEEL_DEF = {
  id: "wheel", name: "佩佩轉盤", types: cellTypes(),
  outcomes: WHEEL_SLOTS.map((s, i) => ({ w: 1, slot: i, color: s.color, rar: s.rar, hit: id => slotHit(s, i, id) })),
};
// 畫面要的資訊（格子、每種押法的賠率和單筆最多能押多少、壹轉總上限）
export const casWheelInfo = (house, day) => Object.assign(casSbInfo(WHEEL_DEF, NUM.casino.wheel, house, day), { slots: WHEEL_SLOTS });
// 轉壹次：bets＝[{ id, bet }]
export const casWheelSpin = (w, house, day, bets, rng) => casSbSpin(WHEEL_DEF, NUM.casino.wheel, w, house, day, bets, rng);
