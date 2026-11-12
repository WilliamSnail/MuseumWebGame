// ================================================================
//  走地下探險時撿到籌碼（決定 0047）
//  翊文 11-09：「讓地下探險劇情也有機會可以拿到一點點籌碼」
//  客戶端只能說「我走完這個房間了」（房間的 id）；有沒有、給多少，全部在這裡由伺服器的亂數決定。
//  防刷：每個帳號每個遊戲日（台灣 05:00 換日）最多撿 perDay 次；同一個房間同一天只擲一次（沒撿到也算）；房間 id 要是 CELLAR 裡真的有的。
//  記帳跟大禮包一樣：錢包的籌碼加、莊家（大家共用的那份）減，兩邊守恆；錢包的統計 st.finds（撿到幾次）、st.findChips（共幾枚）、st.chipsMax 一起更新。
//  沒進過賭場的玩家：錢包不存在時 Functions 的 casWalletFix 會建一份新的（跟狀態列 peek 看到的開場數字一樣），所以第一次進賭場不會再多給一次，也不會少。
//  錢包的欄位 cf：{ day, n 今天撿到幾次, rooms 今天擲過的房間 }；舊錢包沒有，這裡補。
//  純函式：亂數用 RNG（測試可以換，也可以從參數 rnd 傳）；「今天」從參數來。籌碼不是錢，這裡沒有任何換成現實東西的路。
// ================================================================
import { NUM } from "./config.js";
import { CAS_FIND_TEXT } from "./casino_text.js";
import { CELLAR } from "./content3.js";
import { RNG } from "./logic.js";

const cfBox = v => !!v && typeof v === "object" && !Array.isArray(v);
const cfNum = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
export const casFindRoomOk = id => typeof id === "string" && id.length <= 40 && CELLAR.some(f => f.rooms.some(r => r.id === id));
// 補欄位、換日歸零（壞資料也不丟錯）
export function casFindFix(w, day) {
  if (!cfBox(w.cf)) w.cf = { day, n: 0, rooms: [] };
  const cf = w.cf;
  if (cf.day !== day) { cf.day = day; cf.n = 0; cf.rooms = []; }
  cf.n = Math.max(0, Math.floor(cfNum(cf.n)));
  cf.rooms = Array.isArray(cf.rooms) ? cf.rooms.filter(x => typeof x === "string").slice(0, 100) : [];
  return cf;
}
// 今天還可以撿幾次
export function casFindLeft(w, day) {
  const C = NUM.casino.cellarFind;
  return Math.max(0, C.perDay - casFindFix(w, day).n);
}
// 走完一個房間：擲一次。
// 回傳 { ok: false, reason, dup?, capped? }（什麼都沒改）、{ ok: true, found: 0 }（擲了沒撿到，記下這個房間）、{ ok: true, found: 籌碼數, t: 第幾句 }
// boost：進行中的 cellarChips 限時活動（伺服器用自己的時間找，沒有就 null）：撿到的那次另外多 NUM.events.cellarChips 的 min～max，回傳裡的 bonus
export function casCellarFind(w, house, roomId, day, rnd = RNG, boost = null) {
  const C = NUM.casino.cellarFind;
  if (!C || typeof rnd !== "function") return { ok: false, reason: "沒有這個設定" };
  if (!casFindRoomOk(roomId)) return { ok: false, reason: "不認得這個房間" };
  const cf = casFindFix(w, day);
  if (cf.rooms.includes(roomId)) return { ok: false, dup: true, reason: "這個房間今天走過了" };
  if (cf.n >= C.perDay) return { ok: false, capped: true, reason: "今天撿夠了" };
  cf.rooms.push(roomId);
  if (!(rnd() < C.chance)) return { ok: true, found: 0 };
  const steps = Math.floor((C.max - C.min) / C.step) + 1;
  let found = Math.min(C.max, C.min + C.step * Math.min(steps - 1, Math.floor(rnd() * steps)));
  const t = Math.min(CAS_FIND_TEXT.lines.length - 1, Math.floor(rnd() * CAS_FIND_TEXT.lines.length));
  const B = boost && boost.kind === "cellarChips" ? NUM.events.cellarChips : null;
  const bonus = B ? B.min + B.step * Math.floor(rnd() * (Math.floor((B.max - B.min) / B.step) + 1)) : 0;
  found += bonus;
  cf.n++;
  w.chips += found;
  if (house) house.bankroll -= found; // 莊家出，跟大禮包一樣
  if (!cfBox(w.st)) w.st = {};
  w.st.finds = Math.floor(cfNum(w.st.finds)) + 1;
  w.st.findChips = Math.floor(cfNum(w.st.findChips)) + found;
  w.st.chipsMax = Math.max(cfNum(w.st.chipsMax), w.chips);
  return { ok: true, found, t, bonus };
}
