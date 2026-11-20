// 每日任務「伺服器看得到的」證據（決定 0146）：玩家真的做了賭場壹手、銀行存壹筆、餐車吃東西、參觀別人、送佩佩，
// 由各自的 Function 在成功之後記壹筆到 taskAct/{uid}.days[日期][種類]。領籌碼時（casino 的 taskChips）只付存檔說做完、而且這裡也有紀錄的。
// 只有伺服器寫（玩家的瀏覽器碰不到這份）；記不進去不影響原本的動作（只是少領壹次籌碼）。
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { weekIndex } from "./shared/logic3.js";
const ref = uid => getFirestore().doc("taskAct/" + uid);
const dayMinus = (day, n) => new Date(Date.parse(day + "T00:00:00Z") - n * 86400000).toISOString().slice(0, 10);

export async function markAct(uid, kind, day) {
  try { await ref(uid).set({ days: { [day]: { [kind]: true }, [dayMinus(day, 10)]: FieldValue.delete() } }, { merge: true }); }
  catch (e) { console.warn("taskAct 記不進去", kind, e && e.message); }
}
export async function readActs(uid, day) {
  try { const s = await ref(uid).get(); return (s.exists && s.data().days && s.data().days[day]) || {}; } catch (e) { return {}; }
}
// 送佩佩：同壹位這週只算壹次（分身互送刷不了）。回傳這次有沒有算
export async function markGift(uid, to, day) {
  try {
    const wk = weekIndex(day), s = await ref(uid).get(), g = (s.exists && s.data().gifts) || {};
    const ids = g.week === wk && Array.isArray(g.ids) ? g.ids : [];
    if (ids.includes(to)) return false;
    await ref(uid).set({ gifts: { week: wk, ids: ids.concat(to).slice(-30) } }, { merge: true });
    await markAct(uid, "gift", day);
    return true;
  } catch (e) { console.warn("taskAct 送佩佩記不進去", e && e.message); return false; }
}
