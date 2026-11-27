// 每天傍晚的「台股收盤＋美股盤前」發到 Discord（翊文 11-27：「傍晚行情 這個還不錯，可以也排成發嗎」）。
// 不另開排程（Cloud Scheduler 超過免費的數量要收錢）：掛在 stock_div.js 的 stockDivTick（台灣每小時 :17），台灣 18 點那次叫 eveningRun。
// 組字在 shared/discord/evening.js；寫進 discordOutbox/evening-日期（outboxPut 用 create，同壹天只會寫進壹次），discordOutboxSend 撿起來發。
import { getFirestore } from "firebase-admin/firestore";
import { taipeiDay } from "../shared/core/logic.js";
import { OUT_STOCKS } from "../shared/stock/text.js";
import { TW_IDS, US_IDS, usEarlyClose, usNyDay } from "../shared/stock/tw.js";
import { dcEveningText } from "../shared/discord/evening.js";
import { TW_SYMBOLS } from "./stock_tw.js";
import { US_SYMBOLS } from "./stock_us.js";
import { outboxPut } from "../discord/discord_out.js";

export const EVENING_HOUR = 18; // 台灣幾點那次發（:17）
const NAMES = Object.fromEntries(OUT_STOCKS.map(s => [s.id, s.name]));
export const taipeiHour = ms => new Date(ms + 8 * 3600000).getUTCHours();

export function eveningText(tw, us, nowMs) {
  const usDay = usNyDay(nowMs);
  return dcEveningText({ day: taipeiDay(nowMs), usDay, tw, us, names: NAMES, twIds: TW_IDS, usIds: US_IDS, twSyms: TW_SYMBOLS, usSyms: US_SYMBOLS, early: usEarlyClose(usDay) });
}
export async function eveningRun(nowMs = Date.now(), dbx) {
  const D = dbx || getFirestore(), day = taipeiDay(nowMs);
  const [a, b] = await Promise.all([D.doc("stocksTw/latest").get(), D.doc("stocksUs/latest").get()]);
  const text = eveningText(a.exists ? a.data() : null, b.exists ? b.data() : null, nowMs);
  if (!text) return `傍晚行情 ${day}：今天兩邊都沒開，不發`;
  const ok = await outboxPut({ id: `evening-${day}`, kind: "evening", text });
  return `傍晚行情 ${day}：${ok ? "寫進去了" : "寫過了或寫不進去"}`;
}
