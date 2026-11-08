// ================================================================
//  佩佩博物館 4 的 Cloud Functions（決定 0021：部署改用 Firebase）
//  伺服器說了算的事都在這裡；規則照舊在 shared/（部署前 tools/copy_shared.cjs 複製進 functions/shared/）。
//  做法見 docs/Firebase做法.md 第三節。地區用台灣（asia-east1）。
// ================================================================
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getDatabase } from "firebase-admin/database";

setGlobalOptions({ region: "asia-east1", maxInstances: 5 });
initializeApp();

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
  const devOk = EMULATOR && email.endsWith("@dev.local");
  if (!devOk) {
    const inv = email ? await db.doc(`invites/${email}`).get() : null;
    if (!inv || !inv.exists || inv.data().disabled) throw new HttpsError("permission-denied", "你不在邀請名單上，請館長邀請你。");
  }
  const nick = cleanNick(auth.token.name || email.split("@")[0]);
  await ref.set({ nick, invisible: false, joinedAt: FieldValue.serverTimestamp() });
  await getDatabase().ref(`members/${auth.uid}`).set(true);
  return { nick, invisible: false, id: auth.uid };
});
