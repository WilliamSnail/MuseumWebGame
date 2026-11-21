// ================================================================
//  德州撲克桌上旅客 NPC 怎麼打（決定 0150 補充二）：「像一個會玩的路人」，不求強。純函式，亂數用 RNG()（測試固定骰子）。
//  只看得到自己的底牌、公共牌、底池、要跟多少，不偷看別人的牌、不讀牌堆。風格跟 21 點壹樣（content/npc/<id>.json 的 casino.style，沒寫＝basic）。
//  回傳 { a: "fold"｜"check"｜"call"｜"raise"｜"allin", to }；呼叫的人（holdem.js）照規則執行，不合規就退成蓋牌／過牌。
// ================================================================
import { RNG } from "../core/logic_base.js";
import { holdemCat, holdemScore } from "./holdem_eval.js";

// 風格：play 起手牌要幾級以上才玩（0～4）、call 翻牌後至少要幾級才跟（0 沒有、1 壹對、2 兩對以上、3 三條以上…）、raise 有牌時加注的機率、bluff 沒人下注時詐唬的機率、shove 起手或牌型夠大就全下的最低級
export const HD_NPC_STYLE = {
  careful: { play: 3, call: 1, raise: 0.2, bluff: 0, shove: 5 },
  basic: { play: 2, call: 1, raise: 0.35, bluff: 0.05, shove: 4 },
  bold: { play: 1, call: 1, raise: 0.55, bluff: 0.15, shove: 3 },
  wild: { play: 0, call: 0, raise: 0.45, bluff: 0.3, shove: 3 },
};
const npcRankOf = c => (c % 13 + 12) % 13; // 0＝2 … 12＝A
// 起手牌的級（0～4）：對子大的 4、AK／AQ／大對子 3、有 A 或同花連張或兩張都是大牌 2、同花或連張 1、其他 0
export function hdNpcPre(hole) {
  const [a, b] = hole.map(npcRankOf), hi = Math.max(a, b), lo = Math.min(a, b), suited = Math.floor(hole[0] / 13) === Math.floor(hole[1] / 13), gap = hi - lo;
  if (a === b) return hi >= 8 ? 4 : hi >= 4 ? 3 : 2; // 對 10 以上 4、對 6 以上 3、小對子 2
  if (hi === 12 && lo >= 10) return 3; // AK、AQ
  if (hi === 12 || (hi >= 9 && lo >= 9) || (suited && gap <= 2 && lo >= 5)) return 2;
  if (suited || gap <= 2) return 1;
  return 0;
}
// 翻牌後的級：0 沒有（高牌、或只有桌上公共牌的牌型）、1 壹對（用到自己的牌）、2 兩對、3 三條、4 順子、5 同花以上；聽牌（差壹張同花）算 1
export function hdNpcMade(hole, board) {
  const all = hole.concat(board), cat = holdemCat(holdemScore(all)), bcat = board.length >= 3 ? holdemCat(holdemScore(board)) : 0;
  let lv = cat > bcat ? Math.min(5, cat) : 0;
  if (lv === 0 && cat === 1 && bcat === 0) lv = 1;
  const bySuit = [0, 0, 0, 0]; all.forEach(c => { bySuit[Math.floor(c / 13)]++; });
  const draw = board.length < 5 && bySuit.some((n, i) => n === 4 && hole.some(c => Math.floor(c / 13) === i));
  return { lv: Math.max(lv, draw ? 1 : 0), draw };
}
// info：{ hole, board, toCall, pot, bet（這條街自己已投入）, curBet, minTo, maxTo, bb }；style：HD_NPC_STYLE 的 key；rnd：亂數函式（預設 RNG）
export function hdNpcPlan(style, info, rnd = RNG) {
  const S = HD_NPC_STYLE[style] || HD_NPC_STYLE.basic, { hole, board, toCall, pot, minTo, maxTo, bb } = info, pre = board.length === 0;
  const lv = pre ? hdNpcPre(hole) : hdNpcMade(hole, board).lv, strong = pre ? lv : lv + (lv >= 3 ? 1 : 0); // 翻牌後三條以上算進攻等級再高壹點
  const canRaise = maxTo > info.curBet, sized = f => Math.max(minTo, Math.min(maxTo, info.bet + toCall + Math.floor(Math.max(bb, pot) * f)));
  const raise = (f) => (maxTo <= minTo || f > 1.2 ? { a: "allin", to: maxTo } : { a: "raise", to: sized(f) });
  if (toCall <= 0) { // 沒人下注：有牌就下注、沒牌偶爾詐唬、不然過牌
    if (strong >= S.shove && rnd() < 0.25) return { a: "allin", to: maxTo };
    if (canRaise && ((lv >= (pre ? S.play + 1 : 2) && rnd() < S.raise) || rnd() < S.bluff)) return raise(0.5 + rnd() * 0.5);
    return { a: "check", to: 0 };
  }
  const cheap = toCall <= 2 * bb || toCall <= pot * 0.2, play = pre ? lv >= S.play : lv >= S.call;
  if (!play && !(cheap && rnd() < 0.5)) return { a: "fold", to: 0 }; // 不夠格：便宜的跟看看，不然蓋牌
  if (strong >= S.shove && toCall >= maxTo * 0.4) return { a: "allin", to: maxTo }; // 大牌遇到大注：全下
  if (canRaise && lv >= (pre ? S.play + 1 : 2) && rnd() < S.raise) return raise(0.6 + rnd() * 0.6);
  if (toCall >= pot * 0.8 && lv < (pre ? 3 : 2)) return { a: "fold", to: 0 }; // 壹對以下遇到很大的注
  return { a: "call", to: 0 };
}
