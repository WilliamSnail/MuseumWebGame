// ================================================================
//  交代人在自己待的地方說今天交代的那句（翊文 11-21：「荷官也是壹個任務交代人吧，沒有相應的互動嗎」→ 五位交代人壹起）
//  零件：giverNote(id)＝壹位交代人的字條（頭像、名字、在哪、現在說的那句：沒做完 says、做完換 done；今天沒交代他就回 null）。
//  giverStrip([id, …])＝把有話說的字條排在壹起（都沒有就回 null）。資料來自 ui_story.js 的 giverTaskLine（內容在每週的 daily 任務），位置照 ui_tasks.js 的 GIVER_WHERE。
//  放的地方：郵差＝地圖的信箱、站內信箱；店員＝任務板「其他要做的事」；阿秤＝地圖的夜市；
//  店員、阿秤（銀行）、號碼機（地下收藏庫）、荷官 Yuga Bot（賭場）＝房間頂上「這裡現在 N 人」那顆鈕的頭像，點開小框才看（roomGivers，下面 ROOM_GIVERS；11-22）；堂主＝餐車（ui_casino.js 的字條，原本就有）。
//  樣式在 css/tasks.css（前綴 gv-）。介面文字用「壹」。
// ================================================================
import { todayStr } from "../../../shared/core/logic_base.js";
import { giverName } from "../../../shared/story/core.js";
import { ADDONS, btn, closeOnOutside, h, miniLayer } from "../core/ui_core.js";
import { giverLoad, giverOffer, giverTalk, giverWatch } from "./ui_giver_talk.js";
import { giverTaskLine } from "./ui_story.js";
import { GIVER_WHERE, giverAv } from "./ui_tasks.js";

// 今天有交代就說那句；沒有交代也留著（可以聊、送佩佩）。互動（閒聊、熟識度、拜託、送佩佩）在 ui_giver_talk.js（11-21）
export function giverNote(id) {
  const gl = giverTaskLine(id), name = gl ? gl.name : giverName(id);
  return h("div", { class: "gv-note" + (gl && gl.done ? " done" : ""), role: "note" }, giverAv(id, { small: true }),
    h("div", { class: "gv-t" }, h("b", null, name), h("small", null, "・在" + (GIVER_WHERE[id] || "館裡")), gl ? h("p", null, gl.text) : null, giverTalk(id)));
}
// place：這個房間的地點名（巷口、銀行旁、夜市口…）；給了，那個時段剛好有人在這裡串門子，就多壹張兩位同框的卡（ui_giver_pair.js）
export function giverStrip(ids, place) {
  const list = ids.map(giverNote).filter(Boolean), pair = place && ADDONS.giverPair ? ADDONS.giverPair(place) : null;
  if (pair) list.push(pair);
  return list.length ? h("div", { class: "gv-strip" }, list) : null;
}
// 點任何提到交代人的地方（任務板、大廳的每日任務、房間的任務條、字條、串門子）：開他的卡（翊文 11-23：「讓任何提到代理人的地方都可以點進去」）
export function giverOpen(id) {
  const m = miniLayer(giverName(id), "");
  m.card.classList.add("hn-layer", "gv-open");
  m.layer.classList.add("sp-top"); // 從任務板、賭場這些面板裡開，要蓋得住
  closeOnOutside(m);
  m.card.querySelector(".sub").remove();
  const note = giverNote(id);
  m.card.append(note, h("div", { class: "rn-acts" }, btn("關起來", () => m.close(), "ghost")));
  giverLoad();
}
ADDONS.giverOpen = giverOpen;
ADDONS.giverStrip = giverStrip; // 各房間用 ADDONS.giverStrip([id]) 放（不用互相 import）

// 房間頂上那顆「這裡現在 N 人」的鈕帶交代人的頭像，點開小框才看他們（翊文 11-22：「交代人可以放在現在這裡有幾人的那個位置嗎」；手機上兩張大卡把銀行的財報推到螢幕外）
// 房間 id（畫面 id）→ 在那裡的交代人、串門子的地點名。ui_roomnow.js 用 ADDONS.roomGivers(房間) 讀；沒有交代人的房間回 null
const ROOM_GIVERS = { bank: { ids: ["clerk", "scale"], place: "銀行旁" }, cellar: { ids: ["number"] }, casino: { ids: ["yuga"], place: "牌桌邊" } };
const seen = new Set(); // 這次開網頁已經在小框裡看過的（日期＋交代人）：看過就不再亮小點
const seenKey = id => todayStr() + ":" + id;
// 有沒看過的：今天有交代還沒做完，或有臨時拜託還沒做完
const fresh = id => { if (seen.has(seenKey(id))) return false; const gl = giverTaskLine(id); return !!(gl && !gl.done) || giverOffer(id); };
export function roomGivers(room) {
  const g = ROOM_GIVERS[room];
  if (!g) return null;
  return { ids: g.ids, avatars: () => g.ids.map(id => giverAv(id, { small: true })), fresh: () => g.ids.some(fresh), strip: () => giverStrip(g.ids, g.place), seen: () => g.ids.forEach(id => seen.add(seenKey(id))), watch: el => { giverWatch(el); giverLoad(); } }; // watch：伺服器的拜託讀回來，要重畫那顆鈕（el 要有 paint）
}
ADDONS.roomGivers = roomGivers;
