// 每天傍晚 18:17 發到 Discord 的那壹則（翊文 11-27）：上面是「今日館訊」（館方公告），下面是「傍晚行情」（台股收盤＋美股盤前）。
//   「傍晚行情 這個還不錯，可以也排成發嗎」→「還是這兩個整合壹起 就18:17發壹次」→「好啊」。以前 20:00 另外發館訊彙整（discord_digest.js），現在那支不發了。
// 不另開排程（Cloud Scheduler 超過免費的數量要收錢）：掛在 stock_div.js 的 stockDivTick（台灣每小時 :17），台灣 18 點那次叫 eveningRun。
// 館訊挑「最近 3 天發布、還沒發過的」公告（發過的 id 記在 discordDigest/seen），18:17 以後才上線的更新隔天那則補上。
// 組字：shared/discord/out.js（dcDigestPick、dcDigestText）、shared/discord/evening.js（dcEveningText）。
// 寫進 discordOutbox/evening-日期（outboxPut 用 create，同壹天只會寫進壹次），discordOutboxSend 撿起來發。兩邊都沒東西就不發。
import { getFirestore } from "firebase-admin/firestore";
import { taipeiDay } from "../shared/core/logic.js";
import { OUT_STOCKS } from "../shared/stock/text.js";
import { TW_IDS, US_IDS, usEarlyClose, usNyDay } from "../shared/stock/tw.js";
import { dcEveningText } from "../shared/discord/evening.js";
import { DC_DIGEST_SITE, dcDigestPick, dcDigestText } from "../shared/discord/out.js";
import { NOTICES, NOTICE_AREAS, noticeArea } from "../shared/game/notices.js";
import { TW_SYMBOLS } from "./stock_tw.js";
import { US_SYMBOLS } from "./stock_us.js";
import { outboxPut } from "../discord/discord_out.js";

export const EVENING_HOUR = 18; // 台灣幾點那次發（:17）
export const DIGEST_MAX = 1000; // 合併時館訊那段最多幾個字（Discord 壹則 2000 字，傍晚行情約 700 字）
const NAMES = Object.fromEntries(OUT_STOCKS.map(s => [s.id, s.name]));
export const taipeiHour = ms => new Date(ms + 8 * 3600000).getUTCHours();

export function eveningText(tw, us, nowMs) {
  const usDay = usNyDay(nowMs);
  return dcEveningText({ day: taipeiDay(nowMs), usDay, tw, us, names: NAMES, twIds: TW_IDS, usIds: US_IDS, twSyms: TW_SYMBOLS, usSyms: US_SYMBOLS, early: usEarlyClose(usDay) });
}
// 第壹次（還沒有 seen）：11-28 以前發布的公告都當成發過（11-27 以前每天 20:00 那則發過了）
export const SEEN_BEFORE = "2026-11-28";
export function seenStart(seenDoc) {
  if (seenDoc && Array.isArray(seenDoc.ids)) return seenDoc.ids;
  return NOTICES.filter(n => n && n.id && typeof n.publish === "string" && n.publish < SEEN_BEFORE).map(n => n.id);
}
// 組那壹則：{ text, picked }；兩邊都沒有回 text ""
export function eveningPost(tw, us, seenIds, nowMs) {
  const day = taipeiDay(nowMs), picked = dcDigestPick(NOTICES, day, seenIds);
  const digest = picked.length ? dcDigestText(NOTICES, day, noticeArea, NOTICE_AREAS, picked, DIGEST_MAX) : "";
  const market = eveningText(tw, us, nowMs);
  const parts = [digest, market].filter(Boolean);
  return { text: parts.length ? parts.join("\n\n━━━━━━━━━━\n\n") + `\n\n🎟 入館：${DC_DIGEST_SITE}` : "", picked: picked.map(n => n.id) };
}
export async function eveningRun(nowMs = Date.now(), dbx) {
  const D = dbx || getFirestore(), day = taipeiDay(nowMs), seenRef = D.doc("discordDigest/seen");
  const [a, b, c] = await Promise.all([D.doc("stocksTw/latest").get(), D.doc("stocksUs/latest").get(), seenRef.get()]);
  const seen = seenStart(c.exists ? c.data() : null);
  const { text, picked } = eveningPost(a.exists ? a.data() : null, b.exists ? b.data() : null, seen, nowMs);
  if (!text) return `傍晚那則 ${day}：沒有新公告、兩邊也都沒開，不發`;
  const ok = await outboxPut({ id: `evening-${day}`, kind: "evening", text });
  if (ok) await seenRef.set({ ids: seen.concat(picked).slice(-400), at: nowMs, day });
  return `傍晚那則 ${day}：${ok ? `寫進去了（公告 ${picked.length} 則）` : "寫過了或寫不進去"}`;
}
