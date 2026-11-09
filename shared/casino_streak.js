// ================================================================
//  Hamachi 賭場：單人 21 點的連勝、連敗（決定 0049）
//  翊文 11-09：「21點連續贏會恢復一點心情，連續輸會降一點san值」
//  純函式：不碰資料庫。Functions 在結算的同一個交易裡叫 casSkStep，結果寫進錢包和存檔。
//  錢包的資料 w.sk：{ day, win 連贏幾把, lose 連輸幾把, mood 今天加了多少, san 今天扣了多少 }（舊錢包沒有，casSkFix 補）
//  規則（數字在 NUM.casino.streak，先照這樣，等翊文）：
//    - 贏（贏、黑傑克、五張過關）連贏 +1、連輸歸零；輸 連輸 +1、連贏歸零；平手不中斷也不累積。
//    - 連贏到門檻：心情加壹點點，連贏歸零重算。連輸到門檻：理智扣壹點，連輸歸零重算。
//    - 每天（台灣 05:00 換日）心情最多加 moodDay、理智最多扣 sanDay；到上限後計數照歸零，只是沒有效果。
//    - 心情照既有的上限 99。理智只直接扣、最低留到 1：不走 applySan（它會記「今天掉的理智」、可能觸發小缺點，
//      理智用完還會熄燈），所以這個扣法不會發作、不會熄燈、不會把人弄到不能玩。理智已經 1 以下（含熄燈）就不扣。
//    - 自由模式（isFree）、沒有存檔的人沒有效果，計數也不動。
// ================================================================
import { NUM } from "./config.js";
import { clampN, isFree } from "./logic.js";

const casSkNz = n => (Number.isFinite(+n) ? Math.max(0, Math.floor(+n)) : 0);
const CAS_SK_NUM = ["零", "壹", "兩", "三", "四", "五", "六", "七", "八", "九", "十"];
const casSkZh = n => (n >= 0 && n <= 10 ? CAS_SK_NUM[n] : String(n));
// 讀回來的錢包：補 sk，換日重算今天的份（連勝連敗的計數不跟著換日歸零）
export function casSkFix(w, day) {
  const s = w.sk && typeof w.sk === "object" && !Array.isArray(w.sk) ? w.sk : {};
  w.sk = { day: typeof s.day === "string" ? s.day : null, win: casSkNz(s.win), lose: casSkNz(s.lose), mood: casSkNz(s.mood), san: casSkNz(s.san) };
  if (day && w.sk.day !== day) { w.sk.day = day; w.sk.mood = 0; w.sk.san = 0; }
  return w.sk;
}
// 通知的文字（博物館和賭場的口吻，不提錢）
export function casSkLines(mood, san) {
  const C = NUM.casino.streak, out = [];
  if (mood > 0) out.push(`手氣順了${casSkZh(C.winN)}把，心情好了壹點（心情 +${mood}）`);
  if (san > 0) out.push(`連輸${casSkZh(C.loseN)}把，手心冒汗（理智 -${san}）`);
  return out;
}
// 打完壹手、錢算完之後叫：kind 是 casOutcome 的結果（win、blackjack、charlie、lose、push）。P 是挑戰模式的參觀者（沒有、或自由模式：什麼都不做）
// 只改 w.sk 和 P.mood、P.sanity。回傳 { mood, san, lines, changed }：mood、san 是這次真的加、扣的數目（changed：存檔有沒有動）
export function casSkStep(w, P, kind, day) {
  const none = { mood: 0, san: 0, lines: [], changed: false };
  const sk = casSkFix(w, day);
  if (!P || isFree(P)) return none;
  const C = NUM.casino.streak;
  if (kind === "win" || kind === "blackjack" || kind === "charlie") { sk.win++; sk.lose = 0; }
  else if (kind === "lose") { sk.lose++; sk.win = 0; }
  else return none; // 平手：不中斷也不累積
  let mood = 0, san = 0;
  if (sk.win >= C.winN) {
    sk.win = 0;
    const room = Math.min(C.moodDay - sk.mood, 99 - casSkNz(P.mood));
    mood = Math.max(0, Math.min(C.mood, room));
    if (mood) { P.mood = clampN(casSkNz(P.mood) + mood, 0, 99); sk.mood += mood; }
  }
  if (sk.lose >= C.loseN) {
    sk.lose = 0;
    const left = Number.isFinite(P.sanity) ? Math.floor(P.sanity) - 1 : 0; // 最低留 1
    san = Math.max(0, Math.min(C.san, C.sanDay - sk.san, left));
    if (san) { P.sanity -= san; sk.san += san; }
  }
  return { mood, san, lines: casSkLines(mood, san), changed: !!(mood || san) };
}
