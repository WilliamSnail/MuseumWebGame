// 預熱（翊文 11-09 回報常常「該申請未受回應」）：真實紀錄顯示新機器第壹次讀資料庫要 1.9～2.7 秒，之後只要 0.1～0.5 秒，
// 加上網路就超過 Discord 的 3 秒；常駐的機器每 15～20 分鐘會被換壹台，所以壹直碰到。這裡在開始接請求之前先連好。
// 只有 discordBot 自己啟動時才做（其他 Function 也會載入這個檔），模擬器不做；連不上最多等 8 秒，照樣開始接請求。
// 這是啟動時跑的，跟「回覆之後不要再做事」（test/discord_play.test.cjs）無關，所以放在獨立的檔。
import "./options.js";
import { getFirestore } from "firebase-admin/firestore";
import { getDatabase } from "firebase-admin/database";

if (process.env.FUNCTION_TARGET === "discordBot" && process.env.FUNCTIONS_EMULATOR !== "true") {
  const t0 = Date.now();
  const warm = Promise.all([getFirestore().doc("casinoHouse/main").get(), getDatabase().ref("casinoLive/seq").get()])
    .catch(e => console.error("discordBot：預熱出錯", e && e.message));
  await Promise.race([warm, new Promise(r => setTimeout(r, 8000))]);
  console.log("discordBot warm", `${Date.now() - t0}ms`);
}
