// 股票名字前面的 emoji（11-28，翊文：「discord上股票有emoji，遊戲上也可以顯示嗎」「好，都配」）。
// emoji 存在股票名單（shared/stock/text.js、shared/stock/in_text.js 的 emo），這裡只照 id 查。查不到的（集團股、別的）照原名。
// Discord 的晨間、傍晚行情也用同壹個 emo（shared/stock/text.js 的 OUT_NAMES_EMO）。
import { OUT_STOCKS } from "../../../../shared/stock/text.js";
import { IN_STOCKS } from "../../../../shared/stock/in_text.js";

const EMO = Object.fromEntries(OUT_STOCKS.concat(IN_STOCKS).filter(s => s.emo).map(s => [s.id, s.emo]));
// x：有 id、name 的東西（股票、持股、掛單）；回傳「🎮 綠眼顯卡」
export const stNm = x => (x && EMO[x.id] ? `${EMO[x.id]} ${x.name}` : x ? x.name : "");
