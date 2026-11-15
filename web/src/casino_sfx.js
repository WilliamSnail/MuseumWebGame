// ================================================================
//  賭桌的音效（翊文 11-15：「賭桌上各種動作也應該要有音效」）：單人 21 點（ui_casino.js）和同桌（ui_casino_table.js）共用，名字和音量只寫這壹處。
//  casSfx(kind)：bet 下注、deal 發牌、hit 要牌、stand 停牌、dealer 莊家翻／補壹張、turn 輪到你、
//                win 贏、bigWin 黑傑克／五張過關、push 平手、lose 輸、bust 爆牌。
//  用現有的合成音（flip、click、coin、error）加 shared/sfx_files.js 裡的音效檔（coin-drop、coin-payout…）；靜音、#畫面 自動靜音都沿用 snd／sndFile。
//  聲音 AI 聽不到：音量是照其他地方的用法抓的，要翊文聽聽看。
// ================================================================
import { snd, sndFile } from "./ui_core.js";

const WAIT = ms => new Promise(r => setTimeout(r, ms));
export function casSfx(kind) {
  switch (kind) {
    case "bet": sndFile("coin-drop", 0.35); break;
    case "deal": snd("flip"); WAIT(140).then(() => snd("flip")); WAIT(300).then(() => snd("flip")); break; // 發牌：三張牌滑出去
    case "hit": snd("flip"); break;
    case "stand": snd("click"); break;
    case "dealer": snd("flip"); break;
    case "turn": snd("click"); break;
    case "win": snd("coin"); sndFile("coin-payout", 0.4); break;
    case "bigWin": snd("coin"); sndFile("coin-payout-big", 0.45); WAIT(250).then(() => sndFile("crowd-cheer", 0.25)); break;
    case "push": snd("click"); WAIT(120).then(() => snd("click")); break;
    case "lose": snd("error"); break;
    case "bust": snd("error"); WAIT(160).then(() => snd("error")); break;
    default: break;
  }
}
// 這手的結果 → 哪壹種音效（out 是伺服器給的 { kind, why }）
export const casOutSfx = out => (!out ? null : out.why === "bust" ? "bust" : out.kind === "lose" ? "lose" : out.kind === "push" ? "push" : out.kind === "blackjack" || out.kind === "charlie" ? "bigWin" : "win");
