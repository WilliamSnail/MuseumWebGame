// ================================================================
//  探險報告掛展廳、貼交誼廳（好玩的機制 9）；留下痕跡（好玩的機制 7，不用同時在線）。規則在 shared/coop_trace.js。
//  放哪裡：
//    /lounge/{報告 id}       交誼廳：大家貼的探險報告。館友讀得到，只有 Functions 寫
//    存檔的 P.coopReports、P.hallReport：報告、掛在展廳的是哪一張（走 Firestore 交易，rev 加一，通知 save_changed）
// ================================================================
import "./options.js"; // 地區、initializeApp：一定要最先（見 options.js）
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { bad, inbox, needMember, now, rtdb } from "./party.js";

const LOUNGE_KEEP = 30; // 交誼廳留最近幾張

// 讀一份存檔、改、寫回（rev 加一）、通知他重新讀。fn(P) 回傳 { ok, reason, ...}；不 ok 就不寫
async function changeSave(uid, fn) {
  const db = getFirestore(), ref = db.doc(`saves/${uid}`);
  const out = await db.runTransaction(async tx => {
    const s = await tx.get(ref);
    if (!s.exists) throw bad("你還沒有存檔");
    const SAVE = JSON.parse(s.data().data), P = SAVE.profiles && SAVE.profiles.challenge;
    if (!P) throw bad("要先用挑戰模式的參觀者進館");
    const r = fn(P);
    if (!r.ok) throw bad(r.reason);
    const rev = s.data().rev + 1;
    if (r.write !== false) tx.set(ref, { data: JSON.stringify(SAVE), rev, updatedAt: FieldValue.serverTimestamp() });
    return Object.assign({}, r, { rev });
  });
  if (out.write !== false) await inbox(uid, { t: "save_changed", rev: out.rev, why: "coop" });
  return out;
}

async function hang(me, id) {
  await changeSave(me.uid, P => {
    if (id && !(P.coopReports || []).some(r => r.id === id)) return { ok: false, reason: "找不到這張報告" };
    P.hallReport = id || null;
    return { ok: true };
  });
  return { ok: true };
}
// 貼到交誼廳：報告從他自己的存檔拿（不收畫面送來的內容），同一趟只會有一張
async function post(me, id) {
  if (typeof id !== "string" || !id) throw new HttpsError("invalid-argument", "少了報告的號碼");
  const r = await changeSave(me.uid, P => {
    const rep = (P.coopReports || []).find(x => x.id === id);
    return rep ? { ok: true, rep, write: false } : { ok: false, reason: "找不到這張報告" };
  });
  const key = id.replace(/[.$#[\]/]/g, "_");
  await rtdb().ref(`lounge/${key}`).set({ id, by: me.uid, nick: me.nick, at: now(), report: JSON.parse(JSON.stringify(r.rep)) });
  const all = (await rtdb().ref("lounge").get()).val() || {};
  const old = Object.entries(all).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(LOUNGE_KEEP);
  if (old.length) await rtdb().ref("lounge").update(Object.fromEntries(old.map(([k]) => [k, null])));
  return { ok: true };
}

export const coopTrace = onCall(async req => {
  const me = await needMember(req);
  const { act, id } = req.data || {};
  if (act === "hang") return hang(me, id);
  if (act === "post") return post(me, id);
  throw new HttpsError("invalid-argument", "不認得的動作");
});
