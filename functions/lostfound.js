// ================================================================
//  招領（翊文 11-13；規則在 shared/lostfound.js，規劃 docs/銀行特展老主顧招領規劃.md 第四節）
//  lostSync   讀自己的存檔，把最近理智歸零的參觀者寫成公開的招領單：Realtime Database 的 lostFound/{id}（館友讀得到，只有這裡寫得動）。
//             已經有的不蓋掉（送回去的標記 back 要留著）。畫面登入後、換參觀者後叫。
//  lostReturn 送到招領處：同壹個交易改送的人的存檔（+靈感、記成看過）、寄壹封信給原本的館友（心情）、記下誰送回去的。
//             壹張只能送回去壹次：lostClaims/{id}（Firestore，只有 Functions 讀寫）。
//  給別人的只有招領單那幾個欄位（lostCards），不給整份存檔，也不給 email。
// ================================================================
import "./options.js"; // 地區、initializeApp：一定要最先（見 options.js）
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getDatabase } from "firebase-admin/database";
import { nowMs, todayStr } from "./shared/logic.js";
import { MAIL_DAYS } from "./shared/mailbox.js";
import { LOST_TEXT, lostCards, lostReturnStep } from "./shared/lostfound.js";

const db = () => getFirestore();
const rtdb = () => getDatabase();
const bad = reason => new HttpsError("failed-precondition", reason);
const saveRef = uid => db().doc(`saves/${uid}`);
const mailRef = (uid, id) => db().doc(`mail/${uid}/items/${id}`);
const claimRef = id => db().doc(`lostClaims/${id}`);
const ID_RE = /^[A-Za-z0-9_-]{1,140}$/;
async function needMember(req) {
  if (!req.auth) throw new HttpsError("unauthenticated", "要先登入");
  const s = await db().doc(`members/${req.auth.uid}`).get();
  if (!s.exists) throw new HttpsError("permission-denied", "你不在邀請名單上");
  return { uid: req.auth.uid, nick: s.data().nick };
}
async function notify(uid, msg) {
  try { await rtdb().ref(`inbox/${uid}`).push(Object.assign({ at: nowMs() }, msg)); }
  catch (e) { console.error("通知送不出去", e); }
}

export const lostSync = onCall(async req => {
  const me = await needMember(req);
  const snap = await saveRef(me.uid).get();
  if (!snap.exists) return { ok: true, n: 0 };
  let save = null;
  try { save = JSON.parse(snap.data().data); } catch (e) { return { ok: true, n: 0 }; }
  const cards = lostCards(save, me.uid, me.nick, todayStr(nowMs()));
  let n = 0;
  for (const c of cards) {
    try {
      const r = await rtdb().ref(`lostFound/${c.id}`).transaction(cur => (cur ? undefined : c)); // 有了就不動
      if (r.committed) n++;
    } catch (e) { console.warn("lostFound 寫不進去", c.id, e && e.message); }
  }
  return { ok: true, n };
});

export const lostReturn = onCall(async req => {
  const me = await needMember(req);
  const id = req.data && req.data.id;
  if (typeof id !== "string" || !ID_RE.test(id)) throw new HttpsError("invalid-argument", "招領單的編號不對");
  const card = (await rtdb().ref(`lostFound/${id}`).get()).val();
  if (!card || !card.owner || !ID_RE.test(String(card.owner))) throw bad(LOST_TEXT.gone);
  const today = todayStr(nowMs());
  const out = await db().runTransaction(async tx => {
    const [cs, snap] = await Promise.all([tx.get(claimRef(id)), tx.get(saveRef(me.uid))]);
    if (cs.exists) return { ok: false, reason: LOST_TEXT.done };
    if (!snap.exists) return { ok: false, reason: "還沒有存檔。" };
    const save = JSON.parse(snap.data().data);
    const P = save.profiles && save.profiles.challenge;
    const r = lostReturnStep({ card, me, finderP: P, today, mailDays: MAIL_DAYS });
    if (!r.ok) return r;
    const rev = snap.data().rev + 1;
    tx.set(saveRef(me.uid), { data: JSON.stringify(save), rev, updatedAt: FieldValue.serverTimestamp() });
    tx.set(claimRef(id), { by: me.uid, nick: me.nick, day: today, owner: card.owner, at: FieldValue.serverTimestamp() });
    tx.set(mailRef(card.owner, r.mail.id), Object.assign(JSON.parse(JSON.stringify(r.mail)), { fromId: me.uid, createdAt: FieldValue.serverTimestamp() }));
    return { ok: true, rev, insp: r.insp, line: r.line, owner: card.owner };
  });
  if (!out.ok) return out;
  try { await rtdb().ref(`lostFound/${id}/back`).set(String(me.nick || "館友").slice(0, 12)); } catch (e) { console.warn("lostFound 的 back 寫不進去", e && e.message); }
  await notify(me.uid, { t: "save_changed", rev: out.rev, why: "lost" });
  await notify(out.owner, { t: "mail_new", kind: "lost", from: "招領處", text: LOST_TEXT.mailTitle });
  return { ok: true, rev: out.rev, insp: out.insp, line: out.line };
});
