// ================================================================
//  留下痕跡給別人（好玩的機制 7，像 Dark Souls）：不用同時在線，單人走地下也看得到。
//  純函式。伺服器在 functions/coop_trace.js；畫面在 web/src/ui_trace.js。
//  - 留言牌：固定格式（「前面有＿＿」「試試＿＿」「別相信＿＿」，字從清單選，不能打字）。每人最多 10 則，舊的被換掉。可以騙人。
//    別人走到這間看得到，可以按讚；被讚的人下次進地下收藏庫拿一點靈感（一天有上限）。
//  - 最後的影子：館友在哪一間理智歸零，那裡留一個影子，點了看他最後選了什麼。
//  - 幽影：最近有館友走過這一層，房間裡偶爾看到他的佩佩半透明地走過去。
// ================================================================
import { fromKey, todayStr } from "./logic.js";
import { CELLAR } from "./content3.js";

export const TRACE = {
  signMax: 10,        // 每人最多幾則，舊的被換掉
  roomShow: 8,        // 一間房最多顯示幾則
  likeInsp: 1,        // 一個讚拿幾點靈感
  likeDayMax: 5,      // 按讚的靈感一天最多拿幾點
  shadowKeep: 5,      // 一間房留幾個影子
  wispDays: 7,        // 幾天內走過的才看得到幽影
  wispChance: 0.35,   // 走進一間房，幾成機率看到幽影
};
export const SIGN_TEMPLATES = [
  { id: "ahead", text: "前面有{x}", words: ["東西", "好東西", "很大的東西", "出口", "幻覺", "寶物", "牠"] },
  { id: "try", text: "試試{x}", words: ["推開", "看仔細", "不要動", "撤退", "壹起抬", "相信隊友", "別選甲"] },
  { id: "dont", text: "別相信{x}", words: ["箱子", "門", "地板", "館方助手", "上壹個人", "這塊牌子", "自己的眼睛"] },
];
export function signTemplate(tpl) { return SIGN_TEMPLATES.find(x => x.id === tpl) || null; }
export function signText(tpl, word) {
  const t = signTemplate(tpl);
  return t ? t.text.split("{x}").join(word) : "";
}
export function traceRoomById(id) {
  for (const f of CELLAR) { const r = f.rooms.find(x => x.id === id); if (r) return { room: r, floor: f.floor }; }
  return null;
}
// 這則留言牌能不能留。可以回 null，不行回傳原因
export function signProblem(room, tpl, word) {
  if (!traceRoomById(room)) return "沒有這壹間";
  const t = signTemplate(tpl);
  if (!t) return "沒有這種牌子";
  if (!t.words.includes(word)) return "牌子上只能寫清單上的字";
  return null;
}
// 我已經有的（{ id: { room, at } }）：再留一則要換掉哪幾則（最舊的先走，留下來的加新的不超過 signMax）
export function signsToDrop(mine) {
  const list = Object.entries(mine || {}).map(([id, x]) => ({ id, room: x.room, at: x.at || 0 })).sort((a, b) => a.at - b.at);
  return list.slice(0, Math.max(0, list.length - (TRACE.signMax - 1)));
}
export function newSign({ id, uid, nick, room, tpl, word, now }) {
  return { id, by: uid, nick, room, tpl, word, at: now, likes: 0 };
}
// 按讚：不能讚自己；一個人一則一次。可以回 null，不行回傳原因
export function likeProblem(sign, uid) {
  if (!sign) return "這塊牌子不見了";
  if (sign.by === uid) return "不能讚自己的牌子";
  if (sign.likedBy && sign.likedBy[uid]) return "你已經讚過了";
  return null;
}
// 領按讚的靈感：n 個讚，今天還能拿多少。沒領完的就留給明天。回傳 { gain, left }
export function claimLikes(P, n, today = todayStr()) {
  const d = P.coopLikeDay && P.coopLikeDay.date === today ? P.coopLikeDay : { date: today, n: 0 };
  const room = Math.max(0, TRACE.likeDayMax - d.n);
  const take = Math.min(room, Math.max(0, n));
  const gain = take * TRACE.likeInsp;
  d.n += take;
  P.coopLikeDay = d;
  P.insp += gain;
  return { gain, left: Math.max(0, n - take) };
}
// 影子：誰在這裡倒下、最後選了什麼（字從房間的選項拿，不收畫面送來的字）
export function newShadow({ nick, room, choice, now }) {
  const r = traceRoomById(room);
  if (!r) return null;
  const c = Number.isInteger(choice) ? r.room.choices[choice] : null;
  return { nick, room, floor: r.floor, title: r.room.title, choice: c ? c.label : null, at: now };
}
// 影子太多：留最新的幾個，回傳要拿掉的 id
export function shadowsToDrop(all) {
  return Object.entries(all || {}).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(TRACE.shadowKeep).map(([id]) => id);
}
// 幽影：這一層最近有誰走過（不算自己）。all ＝ { uid: { nick, key, at } }
export function recentWisps(all, meId, now) {
  const limit = TRACE.wispDays * 86400000;
  return Object.entries(all || {}).filter(([id, w]) => id !== meId && w && typeof w.at === "number" && now - w.at <= limit && fromKey(w.key)).map(([id, w]) => Object.assign({ id }, w));
}
export const okWispKey = key => typeof key === "string" && key.length <= 120 && !!fromKey(key);
