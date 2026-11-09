// ================================================================
//  Discord 聯動的設定（決定 0051）。這三個都不是密碼（Application ID、Public Key、伺服器 ID 是 Discord 開發者頁面和網址上看得到的），可以放 repo。
//  翊文 11-09 給的。留空字串的時候，discordBot 回 503，其他 Function 不受影響，遊戲裡也不會出現「綁定 Discord」。
//  Bot token **不放這裡**、不進 repo（第一步用不到 token）。
//
//  模擬器（FUNCTIONS_EMULATOR === "true"）才會用測試設定，正式環境永遠用下面的常數：
//    環境變數 DISCORD_TEST_PUBLIC_KEY（64 個十六進位字）、DISCORD_TEST_GUILD_ID（數字），
//    或模擬器 Firestore 的 discordTest/config（tools/discord_fake.cjs 每次跑會產生新的金鑰組放進去）。
// ================================================================
import { getFirestore } from "firebase-admin/firestore";

export const DISCORD = {
  applicationId: "300999289197428737", // Application ID（註冊指令用，tools/discord_commands.cjs 從環境變數讀，這裡只是記錄）
  publicKey: "b3c10a482cc94d6d2e53c95701af8c0758e42e5a1e17b6ac04d0f7864a3a1075", // Public Key：64 個十六進位字，驗 Discord 簽名用
  guildId: "291221925571854347", // 佩佩博物館 Discord 伺服器的 ID：只接受這個伺服器來的指令
};

const EMULATOR = () => process.env.FUNCTIONS_EMULATOR === "true";
const okKey = k => typeof k === "string" && /^[0-9a-fA-F]{64}$/.test(k);
const okGuild = g => typeof g === "string" && /^\d{5,25}$/.test(g);

// 回傳 { ok, publicKey, guildId, test }。ok＝兩個都設好了
export async function discordConfig() {
  let publicKey = DISCORD.publicKey, guildId = DISCORD.guildId, test = false;
  if (EMULATOR()) {
    let tk = process.env.DISCORD_TEST_PUBLIC_KEY, tg = process.env.DISCORD_TEST_GUILD_ID;
    if (!okKey(tk) || !okGuild(tg)) {
      try { const s = await getFirestore().doc("discordTest/config").get(); if (s.exists) { tk = s.data().publicKey; tg = s.data().guildId; } } catch (e) { /* 沒有就用常數 */ }
    }
    if (okKey(tk) && okGuild(tg)) { publicKey = tk; guildId = tg; test = true; }
  }
  return { ok: okKey(publicKey) && okGuild(guildId), publicKey, guildId, test };
}
