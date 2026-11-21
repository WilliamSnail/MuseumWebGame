// ================================================================
//  差壹畫（決定 0150，翊文 11-21）：荷官數壹疊正字，押「下壹次數完會不會差壹畫」。對莊家，只給籌碼。
//  押法 id：exact（剛好）、more（多壹畫）、less（少壹畫）、at:1～at:5（多或少的那壹畫出在「正」字的第幾筆；只有差壹畫時才會有）。
//  規則在 shared/casino/side_bets.js。規劃和模擬：docs/規劃/新牌桌遊戲規劃.md、test/sim/sim_pepe_wheel.cjs。
//  跟劇情的關係（翊文、延伸劇情世界要守的）：結果只靠伺服器的骰子，**不讀任何劇情資料**；台詞借「帳對不上」的氣氛，不放謎底（謎底只在帳本）。
//  台詞是草稿（MISCOUNT_LINES），延伸劇情世界可以換；結果裡只有 kind、at、n（數了幾筆），畫面自己挑台詞。
// ================================================================
import { NUM } from "../core/config.js";
import { RNG } from "../core/logic_base.js";
import { casSbInfo, casSbSpin } from "./side_bets.js";

export const MISCOUNT_STROKES = 5; // 正字 5 畫
const T = [{ id: "exact", label: "剛好" }, { id: "more", label: "多壹畫" }, { id: "less", label: "少壹畫" }].concat([1, 2, 3, 4, 5].map(k => ({ id: "at:" + k, label: `出錯在第 ${k} 畫` })));
// 結果：剛好（權重 pExact）＋ 多／少 × 第 k 畫（各 (100 − pExact) ÷ 10）。權重用整數 ×10，不留小數
const outcomes = () => {
  const px = NUM.casino.miscount.pExact, each = (100 - px) / 10, O = [{ w: px * 10, kind: "exact", at: 0, hit: id => id === "exact" }];
  for (const kind of ["more", "less"]) for (let k = 1; k <= MISCOUNT_STROKES; k++) O.push({ w: each * 10, kind, at: k, hit: id => id === kind || id === "at:" + k });
  return O;
};
// 每次都重做（NUM 在測試裡會改）
export const casMiscountDef = () => ({ id: "miscount", name: "差壹畫", types: T, outcomes: outcomes() });
export const casMiscountInfo = (house, day) => casSbInfo(casMiscountDef(), NUM.casino.miscount, house, day);
// 數壹疊：數出 n 筆正字（只是畫面上的樣子，5～20），n 跟結果無關
export const casMiscountSpin = (w, house, day, bets, rng = RNG) => {
  const r = casSbSpin(casMiscountDef(), NUM.casino.miscount, w, house, day, bets, rng);
  if (r.ok) r.outcome.n = 5 + Math.floor(rng() * 16);
  return r;
};
// 台詞草稿（每句 30 字內；延伸劇情世界可以改，換了就換這裡）。不放謎底
export const MISCOUNT_LINES = {
  open: ["荷官在紙上畫正字，筆尖停了壹下。", "「這壹疊，我數過了。」", "帳本旁邊的正字，又多了壹疊。"],
  exact: ["剛好。今天的帳是對的。", "數完了，壹筆不差。", "對上了。荷官鬆了壹口氣。"],
  more: ["多出壹畫。誰多寫的？", "怎麼多了壹畫……", "荷官把多的那畫擦掉了。"],
  less: ["少壹畫。差的那壹畫呢？", "數完少了壹畫，荷官皺眉。", "有壹畫不見了。"],
  at: ["就是這壹畫。", "出錯的是這壹畫。"],
};
