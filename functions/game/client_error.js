// ================================================================
//  前端錯誤回報的伺服器端（決定 0125，shared/client_error.js）。
//  網頁把清乾淨的錯誤丟進來；這裡再清壹次、限流、同壹天同樣的訊息次數加壹。
//  存在獨立集合 clientErrors（不碰 house、不碰任何人的存檔）。Firestore 規則沒開這個集合，網頁讀寫不了，只有這支函式和固定動作 client-errors 看得到。
//  限流：每個人（IP 加當天，雜湊過、只留 16 碼）每分鐘 5 筆；全站每天最多 400 種不同的錯誤。超過就默默丟掉（回 ok 但 dropped）。
//  7 天過期：文件有 expireAt。Firestore 的 TTL 要翊文在主控台開壹次（docs/操作/伺服器除錯.md）；沒開的話，這支函式每次寫入順手刪最多 10 筆過期的。
// ================================================================
import "../options.js";
import { createHash } from "node:crypto";
import { onCall } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { CLIENT_ERR, clientErrClean, clientErrKey, clientErrQuota } from "../shared/client_error.js";

const dayOf = ms => new Date(ms + 8 * 3600000).toISOString().slice(0, 10); // 台灣日期
export const clientError = onCall(async req => {
  const c = clientErrClean(req.data);
  if (!c) return { ok: true, dropped: "empty" };
  const raw = req.rawRequest || {}, fwd = raw.headers && raw.headers["x-forwarded-for"], ip = String(fwd ? String(fwd).split(",")[0] : raw.ip || "").trim();
  const now = Date.now(), day = dayOf(now), who = createHash("sha256").update(ip + "|" + day + "|ce").digest("hex").slice(0, 16);
  const db = getFirestore(), qRef = db.doc(`clientErrorQuota/${who}`), dRef = db.doc(`clientErrorQuota/day_${day}`), eRef = db.doc(`clientErrors/${clientErrKey(c, day)}`);
  const expireAt = Timestamp.fromMillis(now + CLIENT_ERR.ttlDays * 86400000);
  const out = await db.runTransaction(async t => {
    const [q, d, e] = await Promise.all([t.get(qRef), t.get(dRef), t.get(eRef)]);
    const step = clientErrQuota(q.exists ? q.data() : null, now);
    if (!step.ok) return { ok: true, dropped: "rate" };
    if (!e.exists && d.exists && (d.data().n || 0) >= CLIENT_ERR.dayCap) return { ok: true, dropped: "cap" };
    t.set(qRef, Object.assign({}, step.rec, { expireAt }));
    if (e.exists) t.update(eRef, { n: FieldValue.increment(1), lastAt: Timestamp.fromMillis(now), expireAt });
    else { t.set(eRef, Object.assign({ day, n: 1, firstAt: Timestamp.fromMillis(now), lastAt: Timestamp.fromMillis(now), expireAt }, c)); t.set(dRef, { n: FieldValue.increment(1), expireAt }, { merge: true }); }
    return { ok: true };
  });
  try { // 沒開 TTL 的話順手清（最多 10 筆，失敗不影響回報）
    for (const col of ["clientErrors", "clientErrorQuota"]) { const old = await db.collection(col).where("expireAt", "<", Timestamp.fromMillis(now)).limit(10).get(); await Promise.all(old.docs.map(x => x.ref.delete())); }
  } catch (e) { /* 清不掉就下次 */ }
  return out;
});
