import "../options.js"; // 地區、initializeApp：一定要最先（見 options.js）
import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { nwArcPublic } from "../shared/world/core.js";

// 旅客理智等級（決定 0103）：給每日排程讀的公開 JSON，Hosting 的 /data/npc_san.json 轉過來。
// 只有旅客 id 和分級（steady／tired／uneasy／edge），沒有玩家名字、不寫誰造成的；沒有登入也讀得到。快取 5 分鐘（週結算壹週壹次，不會變得比這快）。
let CACHE = { at: 0, body: null };
export const npcSan = onRequest({ cors: true, memory: "256MiB", maxInstances: 2 }, async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") { res.set("Allow", "GET, HEAD"); return res.status(405).json({ error: "GET only" }); }
  try {
    const t = Date.now();
    if (!CACHE.body || t - CACHE.at > 300000) {
      const s = await getFirestore().doc("casinoHouse/main").get();
      CACHE = { at: t, body: nwArcPublic(s.exists ? JSON.parse(s.data().data) : null) };
    }
    res.set("Cache-Control", "public, max-age=300");
    return res.status(200).json(CACHE.body);
  } catch (e) { console.error("npcSan", e && e.message); return res.status(500).json({ error: "讀不到" }); }
});
