import "./options.js"; // 地區、initializeApp：一定要最先（見 options.js）
// ================================================================
//  管理員介面（第一版：只看不改，決定 0033）。規則都在 shared/admin.js，這裡只有讀資料。
//    adminCheck     登入後畫面問一次：我是不是管理員（決定選單要不要多「管理員」）
//    adminOverview  大家的進度：讀 members、saves、/status，算成摘要。不回傳 email、uid、整份存檔
//  誰是管理員：翊文在 Firestore 後台的 invites/{email} 那一筆加 admin: true（docs/Firebase做法.md 第八節）。程式裡不寫死任何 email、uid。
//  Firestore、Realtime Database 的規則沒有放寬：玩家的瀏覽器照舊讀不到別人的存檔，只有這裡（Admin SDK）讀得到。
// ================================================================
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getDatabase } from "firebase-admin/database";
import { adminEmail, adminOverviewOf, isAdminInvite } from "./shared/admin.js";
import { nowMs } from "./shared/logic.js";

async function isAdmin(auth) {
  const email = auth ? adminEmail(auth.token) : null;
  if (!email) return false;
  const inv = await getFirestore().doc(`invites/${email}`).get();
  return inv.exists && isAdminInvite(inv.data());
}
const toMs = t => (t && typeof t.toMillis === "function" ? t.toMillis() : null);

export const adminCheck = onCall(async req => ({ admin: await isAdmin(req.auth) }));

export const adminOverview = onCall(async req => {
  if (!(await isAdmin(req.auth))) throw new HttpsError("permission-denied", "沒有權限");
  const db = getFirestore();
  const [members, saves, status] = await Promise.all([db.collection("members").get(), db.collection("saves").get(), getDatabase().ref("status").get()]);
  const saveMap = {};
  saves.forEach(d => { saveMap[d.id] = { data: d.data().data, updatedAt: toMs(d.data().updatedAt) }; });
  return adminOverviewOf({
    members: members.docs.map(d => ({ uid: d.id, nick: d.data().nick, joinedAt: toMs(d.data().joinedAt) })),
    saves: saveMap,
    status: status.val(),
  }, nowMs());
});
