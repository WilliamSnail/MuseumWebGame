// ================================================================
//  交代人的熟識度、旅客 NPC 的好感度（決定 0151、0150 補充二；規劃 docs/規劃/交代人互動_數值和存檔.md、德州NPC和旅客好感度.md）
//  同壹套：存在伺服器錢包 w.npcRel[id] ＝ { xp, lv, day, today }（只升不降）。只換文字、稱號、和「旅客比較容易答應邀請」，不給籌碼、不給靈感。
//    kind "giver"：六位交代人（yuga、hall、postman、clerk、scale、number）；kind "traveler"：旅客 NPC（content/npc 的 id，不含 t- 劇情角色）。
//  today：{ xp 今天已加, <來源名>: 今天這個來源已經算過幾次 }，換日重設（xp、lv 不動）。
//  到 Lv3 發稱號：w.ach["npc:<id>"] ＝ { name, d }（第四類成就，名字由呼叫的人從伺服器的資料表查，不收玩家端的字）。
//  純函式：不碰 DOM、不碰亂數；日期由呼叫的人給（taipeiDay）。
// ================================================================
import { NUM } from "../core/config.js";

const nrN = v => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
const nrBox = o => !!o && typeof o === "object" && !Array.isArray(o);
export const NPC_REL_KINDS = ["giver", "traveler"];
export const NPC_REL_GIVERS = ["yuga", "hall", "postman", "clerk", "scale", "number"];
export const NPC_REL_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
// 稱號成就的 id（跟其他成就壹樣放在 w.ach；casAchInfo／casCleanTitle 認 "npc:" 開頭）
export const npcRelAchId = (id, tid) => "npc:" + id + (tid ? ":" + tid : ""); // 交代人的稱號是 npc:<交代人id>:<稱號id>（content/givers 的 title.id，11-22）；旅客照舊 npc:<旅客id>
export const npcRelKind = id => (NPC_REL_GIVERS.includes(id) ? "giver" : "traveler");
const cfg = kind => NUM.npcRel[kind === "giver" ? "giver" : "traveler"];

// 讀回來的錢包：補欄位、清掉壞的（最多留 NUM.npcRel.maxEntries 位）
export function npcRelFix(w) {
  if (!nrBox(w.npcDay)) w.npcDay = { day: null, g: 0, t: 0 }; // 今天送出去幾隻（g 交代人、t 旅客），換日重設（giver.js 用）。就地整理：呼叫的人手上拿著這個物件
  w.npcDay.day = typeof w.npcDay.day === "string" ? w.npcDay.day : null; w.npcDay.g = nrN(w.npcDay.g); w.npcDay.t = nrN(w.npcDay.t);
  if (!nrBox(w.npcRel)) w.npcRel = {};
  const ids = Object.keys(w.npcRel);
  for (const id of ids) {
    const e = w.npcRel[id];
    if (!NPC_REL_ID.test(id) || !nrBox(e)) { delete w.npcRel[id]; continue; }
    e.xp = nrN(e.xp); e.lv = npcRelLv(npcRelKind(id), e.xp);
    if (typeof e.day !== "string") e.day = null;
    if (!nrBox(e.today)) e.today = { xp: 0 };
  }
  const keep = Object.keys(w.npcRel);
  if (keep.length > NUM.npcRel.maxEntries) keep.sort((a, b) => w.npcRel[a].xp - w.npcRel[b].xp).slice(0, keep.length - NUM.npcRel.maxEntries).forEach(k => delete w.npcRel[k]);
  return w.npcRel;
}
// xp → 級（0～3）
export function npcRelLv(kind, xp) {
  const T = cfg(kind).lv;
  return T.reduce((lv, need, i) => (nrN(xp) >= need ? i + 1 : lv), 0);
}
// 這位的紀錄（沒有就建；日期不同就把 today 清掉）
function entry(w, id, day) {
  npcRelFix(w);
  let e = w.npcRel[id];
  if (!e) e = w.npcRel[id] = { xp: 0, lv: 0, day: null, today: { xp: 0 } };
  if (e.day !== day) { e.day = day; e.today = { xp: 0 }; }
  return e;
}
// 這位目前的樣子（畫面、答應率用；不改錢包）
export function npcRelView(w, id, day) {
  const kind = npcRelKind(id), C = cfg(kind), e = w && nrBox(w.npcRel) && nrBox(w.npcRel[id]) ? w.npcRel[id] : null;
  const xp = e ? nrN(e.xp) : 0, lv = npcRelLv(kind, xp), next = lv < 3 ? C.lv[lv] : null, t = e && e.day === day && nrBox(e.today) ? e.today : { xp: 0 };
  return { id, kind, xp, lv, next, left: next == null ? null : Math.max(0, next - xp), todayXp: nrN(t.xp), dayLeft: Math.max(0, C.dayCap - nrN(t.xp)), today: t };
}
// 好感度讓邀請比較容易答應（％，加在 baseP＋likeP 上、再乘額度係數；總機率照舊夾在 5～95）。只有旅客有
export function npcRelBonus(w, id) {
  const lv = npcRelView(w, id, null).lv;
  return NUM.npcRel.bondP[lv] || 0;
}
// 加熟識度。src：來源名（NUM.npcRel.<kind>.src 裡的）；xp：這次要加的（不給＝用來源的預設）；title：到 Lv3 要發的稱號名字、titleId：稱號 id（呼叫的人從伺服器的資料表查，title 沒給就不發稱號）
// 回傳 { ok, gained, xp, lv, up（升級了）, title（這次新發的稱號成就 id 或 null）, why（沒加的原因） }
export function npcRelAdd(w, id, day, src, opts = {}) {
  if (!w || typeof id !== "string" || !NPC_REL_ID.test(id)) return { ok: false, why: "bad_id", gained: 0 };
  const kind = npcRelKind(id), C = cfg(kind), S = C.src[src];
  if (!S) return { ok: false, why: "bad_src", gained: 0 };
  const e = entry(w, id, day), t = e.today, used = nrN(t[src]);
  if (used >= S.max) return { ok: true, gained: 0, xp: e.xp, lv: e.lv, up: false, title: null, why: "src_max" };
  const want = nrN(opts.xp != null ? opts.xp : S.xp), room = Math.max(0, C.dayCap - nrN(t.xp)), gained = Math.min(want, room);
  t[src] = used + 1; // 來源的次數照樣算（不然壹直按壹直試）
  if (gained <= 0) return { ok: true, gained: 0, xp: e.xp, lv: e.lv, up: false, title: null, why: "day_cap" };
  const before = e.lv;
  e.xp += gained; t.xp = nrN(t.xp) + gained; e.lv = npcRelLv(kind, e.xp);
  let title = null;
  if (e.lv >= 3 && typeof opts.title === "string" && opts.title.trim()) {
    const aid = npcRelAchId(id, opts.titleId);
    if (!nrBox(w.ach)) w.ach = {};
    if (!w.ach[aid] && !w.ach[npcRelAchId(id)]) { w.ach[aid] = { name: [...opts.title.trim()].slice(0, NUM.casino.titleMax).join(""), d: day }; title = aid; }
  }
  return { ok: true, gained, xp: e.xp, lv: e.lv, up: e.lv > before, title, why: null };
}
