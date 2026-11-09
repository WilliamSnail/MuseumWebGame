// ================================================================
//  稱號到處看得到（決定 0050）
//  翊文：「獲得的稱號 可以再其他看館友資訊的地方也看的到嗎，不是只是展廳看的到」
//  稱號是賭場的成就（決定 0040、0042）：玩家在賭場挑一個戴著，展廳上顯示的就是那一個（P.casinoTitle）。
//  這個檔只有純函式：不碰 Firebase、不碰畫面。
//    titlePublish(錢包, 存檔)   伺服器（functions/casino.js）用：現在要公開的稱號 { id, name } 或 null。錢包只有 Functions 寫得動，所以不信存檔裡的名字
//    titlesFromDb(原始資料)     瀏覽器讀 Realtime Database 的 titles：{ uid: { id, name } }，不對的丟掉
//    titleName(稱號)            畫面上放的字：沒有、壞掉的回傳空字串（沒稱號的人版面不變）
//  公開的只有「稱號的 id 和名字」一個欄位；email、理智、怪癖、靈感都不在裡面（docs/界線.md）。
//  放在 Realtime Database 的 titles/{uid}：只有 Functions 寫得動，館友讀得到（database.rules.json）。
// ================================================================
import { NUM } from "./config.js";
import { isFree } from "./logic.js";
import { casAchInfo, casCleanTitle, casShortName } from "./casino_wallet.js";

// 一次最多讀幾個人的稱號（館友名單的上限，防止壞資料把畫面拖慢）
export const TITLES_MAX = 500;

// 現在要公開的稱號。展廳現在的邏輯：要有挑戰模式的存檔（P），而且錢包裡真的有這個成就
// w：錢包（casWalletFix 之後的）；P：挑戰模式的存檔（可以是 null）
export function titlePublish(w, P) {
  if (!w || !P || typeof P !== "object" || isFree(P)) return null;
  const id = w.title;
  if (typeof id !== "string" || !w.ach || !w.ach[id]) return null;
  const info = casAchInfo(w, id);
  return info ? casCleanTitle({ id: info.id, name: info.name }) : null;
}

// Realtime Database 的 titles 讀回來的樣子 → { uid: { id, name } }。uid 只收短短的英數字，稱號走 casCleanTitle（只認清單上的 id 和短短的純文字名字）
export function titlesFromDb(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  let n = 0;
  for (const uid of Object.keys(raw)) {
    if (n >= TITLES_MAX) break;
    if (uid === "__proto__" || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) continue;
    const t = casCleanTitle(raw[uid]);
    if (t) { out[uid] = t; n++; }
  }
  return out;
}

// 已經整理好的名字字串（每週榜單裡存的）：只清掉怪字、限字數；不是字串就空字串
export const titleText = s => (typeof s === "string" ? casShortName(s) : "");
// 畫面上放的字：t 是 { id, name }（走 casCleanTitle，只認清單上的 id）；最多 NUM.casino.titleMax 個字；沒有就空字串
export function titleName(t) {
  const c = casCleanTitle(t);
  return c ? [...c.name].slice(0, NUM.casino.titleMax).join("") : "";
}
