import "./options.js"; // 地區、initializeApp：一定要最先（見 options.js）
// ================================================================
//  遊戲裡的「綁定 Discord」（決定 0051）：館友在「我的帳號」拿 6 位數的碼，到 Discord 打 /pepe-綁定 碼。
//    discordLinkCode   拿碼（10 分鐘、只能用壹次；再拿壹個舊的就作廢）。已經綁定了就不給
//    discordLinkState  看狀態：configured（伺服器那邊設好了沒）、linked、有效的碼和剩餘時間。畫面據此決定顯示什麼
//    discordUnlink     解除綁定（獎勵不會再送）
//  資料怎麼放、交易怎麼寫：discord_data.js。沒設定 Discord（discord_config.js 空的）：configured 是 false，不給碼。
// ================================================================
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { discordConfig } from "./discord_config.js";
import { linkState, makeLinkCode, unlinkByUid } from "./discord_data.js";
import { needMember, now as nowMs } from "./party.js";
import { NUM } from "./shared/config.js";

export const discordLinkState = onCall(async req => {
  const me = await needMember(req);
  const cfg = await discordConfig();
  if (!cfg.ok) return { configured: false, linked: false };
  return Object.assign({ configured: true, ttlMin: NUM.discord.linkCodeMin }, await linkState(me.uid, nowMs()));
});

export const discordLinkCode = onCall(async req => {
  const me = await needMember(req);
  if (!(await discordConfig()).ok) throw new HttpsError("failed-precondition", "Discord 聯動還沒開通");
  const r = await makeLinkCode(me.uid, nowMs());
  if (!r.ok) throw new HttpsError("failed-precondition", r.reason === "linked" ? "已經綁定 Discord 了" : "現在拿不到碼，等壹下再試");
  return { code: r.code, exp: r.exp, ttlMin: NUM.discord.linkCodeMin };
});

export const discordUnlink = onCall(async req => {
  const me = await needMember(req);
  const r = await unlinkByUid(me.uid);
  return { ok: r.ok };
});
