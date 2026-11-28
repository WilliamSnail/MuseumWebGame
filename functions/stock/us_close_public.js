import "../options.js"; // 地區、initializeApp：一定要最先（見 options.js）
// 美股昨夜收盤（翊文 11-27：每天早上在 Discord 發美股收盤的漲跌，「要實際數字，但是用遊戲風格發布」「就在那個時候順便發」）。
// 給 tools/content/announce.cjs 讀的公開 JSON（Hosting 的 /data/us_close.json 轉過來），跟今日館訊同壹個時間發。
// 遊戲名字加真實代號（11-27 翊文「順便把英文代號也放上來」）、遊戲價、漲跌，不寫誰；沒有昨夜那場（週末、假日、資料還沒收）回 text 空字串，那天就不發。快取 5 分鐘。
import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { addDays, taipeiDay } from "../shared/core/logic.js";
import { OUT_NAMES_EMO } from "../shared/stock/text.js";
import { US_IDS, usEarlyClose } from "../shared/stock/tw.js";
import { dcUsCloseText } from "../shared/discord/us_close.js";
import { US_SYMBOLS } from "./stock_us.js";

const NAMES = OUT_NAMES_EMO; // 名字前面有 emoji（11-28）
let CACHE = { at: 0, body: null };
// 台灣 day 那天早上要發的：美東 day 的前壹天那場（台灣早上時美股剛收的那場）
export function usCloseBody(doc, nowMs) {
  const day = taipeiDay(nowMs), want = addDays(day, -1);
  const text = doc && doc.day === want ? dcUsCloseText(doc, NAMES, US_IDS, usEarlyClose(doc.day), US_SYMBOLS) : "";
  return { day, session: want, text };
}
export const usClosePublic = onRequest({ cors: true, memory: "256MiB", maxInstances: 2 }, async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") { res.set("Allow", "GET, HEAD"); return res.status(405).json({ error: "GET only" }); }
  try {
    const t = Date.now();
    if (!CACHE.body || t - CACHE.at > 300000) {
      const s = await getFirestore().doc("stocksUs/latest").get();
      CACHE = { at: t, body: usCloseBody(s.exists ? s.data() : null, t) };
    }
    res.set("Cache-Control", "public, max-age=300");
    return res.status(200).json(CACHE.body);
  } catch (e) { console.error("usClosePublic", e && e.message); return res.status(500).json({ error: "讀不到" }); }
});
