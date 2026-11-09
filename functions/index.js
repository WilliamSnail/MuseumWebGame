// ================================================================
//  佩佩博物館 4 的 Cloud Functions（決定 0021：部署改用 Firebase）
//  伺服器說了算的事都在這裡；規則照舊在 shared/（部署前 tools/copy_shared.cjs 複製進 functions/shared/）。
//  做法見 docs/Firebase做法.md 第三節。地區用台灣（asia-east1）。
// ================================================================
import "./options.js"; // 地區、initializeApp：一定要最先（見 options.js）
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getDatabase } from "firebase-admin/database";
import { redeemJoin } from "./discord_data.js";
import { dcJoinCodeOf, dcText, dcVerifiedEmail } from "./shared/discord.js";


const EMULATOR = process.env.FUNCTIONS_EMULATOR === "true";

// 看不見的字：控制字元、零寬空白、方向控制、BOM。
// 用字碼判斷，不在原始碼裡寫反斜線 u 加上 2028 這種跳脫（11-08 這種寫法被工具換成真的換行字元，整個檔載不起來）。
function invisible(ch) {
  const n = ch.codePointAt(0);
  return n < 0x20 || n === 0x7f || (n >= 0x200b && n <= 0x200f) || (n >= 0x2028 && n <= 0x202e) || (n >= 0x2060 && n <= 0x206f) || n === 0xfeff;
}
// 暱稱：拿掉看不見的字、去頭尾空白，最多 12 個字
export function cleanNick(s) {
  const t = [...String(s || "")].filter(ch => !invisible(ch)).join("").trim();
  return [...t].slice(0, 12).join("") || "館友";
}

// ---------- 第一次登入：檢查邀請名單，建館友 ----------
// 邀請名單：Firestore 的 invites/{email}（只有管理員能改）。模擬器裡 @dev.local 的帳號不用邀請（開發用）。
export const join = onCall(async req => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "要先登入");
  const email = String(auth.token.email || "").toLowerCase();
  const db = getFirestore();
  const ref = db.doc(`members/${auth.uid}`);
  const snap = await ref.get();
  if (snap.exists) {
    await getDatabase().ref(`members/${auth.uid}`).set(true); // 兩邊要一樣（Realtime Database 的規則讀不到 Firestore）
    return { nick: snap.data().nick, invisible: !!snap.data().invisible, id: auth.uid };
  }
  // Discord 的加入連結（/pepe-加入，決定 0051）：網頁把 ?join=碼 傳進來。沒帶碼就完全不走這段。
  // 碼有效＝允許加入、建 invites（source: "discord"）和館友、順便綁定並發獎勵（discord_data.js 的交易，碼用掉就標記）。
  // 碼無效（過期、用過）：當作沒帶，走下面原本的邀請名單；帳號層級的拒絕（被停用、這個 Discord 已經換過帳號、今天名額滿）直接擋，連模擬器的 @dev.local 也一樣
  const joinCode = dcJoinCodeOf(req.data && req.data.code);
  let codeFail = "";
  if (joinCode) {
    const verified = dcVerifiedEmail(auth.token); // Google 驗證過的 email（跟管理員一樣的檢查）
    if (!verified) codeFail = dcText("joinNeedVerified");
    else {
      const nick = cleanNick(auth.token.name || verified.split("@")[0]);
      const r = await redeemJoin({ uid: auth.uid, email: verified, nick, code: joinCode, now: Date.now() });
      if (r.ok) {
        await getDatabase().ref(`members/${auth.uid}`).set(true);
        const m = r.member ? (await ref.get()).data() : { nick, invisible: false };
        return { nick: m.nick, invisible: !!m.invisible, id: auth.uid };
      }
      if (r.reason === "disabled") throw new HttpsError("permission-denied", dcText("joinWebDisabled"));
      if (r.reason === "used") throw new HttpsError("permission-denied", dcText("joinWebUsed"));
      if (r.reason === "full") throw new HttpsError("permission-denied", dcText("joinWebFull"));
      codeFail = dcText("joinWebBad");
    }
  }
  const devOk = EMULATOR && email.endsWith("@dev.local");
  if (!devOk) {
    const inv = email ? await db.doc(`invites/${email}`).get() : null;
    if (!inv || !inv.exists || inv.data().disabled) throw new HttpsError("permission-denied", codeFail || "你不在邀請名單上，請館長邀請你。");
  }
  const nick = cleanNick(auth.token.name || email.split("@")[0]);
  await ref.set({ nick, invisible: false, joinedAt: FieldValue.serverTimestamp() });
  await getDatabase().ref(`members/${auth.uid}`).set(true);
  return { nick, invisible: false, id: auth.uid };
});

// ---------- Discord 聯動第一步（決定 0051）：機器人入口 discordBot、遊戲裡的綁定 ----------
export { discordBot } from "./discord.js";
export { discordLinkCode, discordLinkState, discordUnlink } from "./discord_link.js";

// ---------- 邀請、隊伍、一起融合（M3）：寫在 party.js ----------
export { invite, inviteReply, partyAction } from "./party.js";

// ---------- 合作地下收藏庫（M4）：寫在 coop.js ----------
export { coopStep } from "./coop.js";
export { coopTrace } from "./coop_trace.js";
// ---------- 管理員介面（只看不改，決定 0033）：寫在 admin.js ----------
export { adminCheck, adminOverview } from "./admin.js";
// ---------- Hamachi 賭場（決定 0040）：寫在 casino.js ----------
export { casino } from "./casino.js";
export { casinoTable } from "./casino_table.js";
// ---------- 參觀展廳、送佩佩、伺服器的信（M2）：寫在 visit.js ----------
export { claimMail, hallAct, hallCall, sendGift, socialNews, visitHall, visitWeekly } from "./visit.js";
