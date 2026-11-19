import "./options.js"; // 地區、initializeApp：一定要最先（見 options.js）
import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { taipeiDay } from "./shared/logic.js";
import { casPoolView } from "./shared/casino_bank.js";

// 館門口池子的水位（決定 0132、0133）：給每日排程讀的公開 JSON，Hosting 的 /data/pool.json 轉過來。
// 只有 { day, lv, dir, band, night, trace, hits }（跟 peek 回的 pool 壹樣）；不寫是誰、不寫淨值或金額；沒有登入也讀得到。快取 60 秒（night 看時間）。
let CACHE = { at: 0, body: null };
const EMPTY = day => ({ day, lv: null, dir: 0, band: null, night: false, trace: [], hits: 0 });
export const poolPublic = onRequest({ cors: true, memory: "256MiB", maxInstances: 2 }, async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") { res.set("Allow", "GET, HEAD"); return res.status(405).json({ error: "GET only" }); }
  try {
    const t = Date.now();
    if (!CACHE.body || t - CACHE.at > 60000) {
      const day = taipeiDay(t);
      const s = await getFirestore().doc("casinoHouse/main").get();
      const v = s.exists ? casPoolView(JSON.parse(s.data().data), day, t) : null;
      CACHE = { at: t, body: v ? Object.assign({ day }, v) : EMPTY(day) };
    }
    res.set("Cache-Control", "public, max-age=60");
    return res.status(200).json(CACHE.body);
  } catch (e) { console.error("poolPublic", e && e.message); return res.status(500).json({ error: "讀不到" }); }
});
