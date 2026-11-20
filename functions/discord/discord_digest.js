import "../options.js"; // 地區、initializeApp：一定要最先（見 options.js）
// ================================================================
//  每天台灣 20:00 發「今天的更新」到 Discord（翊文 11-15：每天壹則、晚上 8 點）
//  以前是 GitHub 的定時（.github/workflows/discord-digest.yml），11-15、11-16 都晚了 6～9 小時（11-16 那則隔天 05:32 才發）；
//  11-17 翊文同意改由伺服器排程（Cloud Scheduler 很準）。GitHub 那支只留手動。
//  組字：shared/discord/out.js 的 dcDigestPost（今天發布的館方公告，照分段列標題；沒有就不發）。
//  發送：寫進 discordOutbox/digest-日期（outboxPut），discordOutboxSend 撿起來發；同壹天只寫得進壹次，不會重發。
// ================================================================
import { onSchedule } from "firebase-functions/v2/scheduler";
import { outboxPut } from "./discord_out.js";
import { NOTICES, NOTICE_AREAS, noticeArea } from "../shared/game/notices.js";
import { taipeiDay } from "../shared/core/logic.js";
import { dcDigestPost } from "../shared/discord/out.js";

export async function digestRun(now = Date.now()) {
  const day = taipeiDay(now), text = dcDigestPost(NOTICES, day, noticeArea, NOTICE_AREAS);
  if (!text) return { day, sent: false, why: "今天沒有公告" };
  const ok = await outboxPut({ id: `digest-${day}`, kind: "digest", text });
  return { day, sent: ok, why: ok ? "" : "寫過了或寫不進去" };
}
export const discordDigestTick = onSchedule({ schedule: "0 20 * * *", timeZone: "Asia/Taipei", retryCount: 0, timeoutSeconds: 60 }, async () => {
  console.log("discordDigestTick", await digestRun());
});
