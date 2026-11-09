// ================================================================
//  限時活動的畫面（決定 0041；規則 shared/events.js；內容寫在 content/weeks/<週>/week.json 的 events）
//  這個檔放：
//    大廳的一條（還沒開始寫「今晚 20:00～22:00：○○」，進行中會倒數，結束就消失；ui_screens1.js 的 ADDONS.lobbyEvent）
//    其他畫面用的小東西：現在有沒有哪一種活動（liveEvent）、「限時活動 ×1.5」的標籤（eventTagNode）、這週活動的清單（eventListBox）
//  「現在」用 nowMs()（網路時間，決定 0026），改電腦的時間沒用。合作的加成是伺服器判斷的（functions/coop.js），這裡只是顯示。
//  大廳那一條自己一秒更新一次，不跟著別人換房間、名單更新重畫，所以不會閃。
//  介面上的字用「壹」。
// ================================================================
import { nowMs } from "../../shared/logic.js";
import { eventBarText, eventBars, eventEffect, eventLeftText, eventListLine, eventLive, eventRange, eventRunOf, eventTag, eventWhen, eventsFromWeeks } from "../../shared/events.js";
import { ADDONS, every, h, icon } from "./ui_core.js";

// 只讀正式週的 week.json（備用週沒有日期，不會有活動）
const RAW = import.meta.glob("../../content/weeks/*/week.json", { eager: true, import: "default" });
let cache = null;
// 全部的活動（照開始時間排好）。第一次用到才整理（畫面檔載入時不碰別的檔）
export function allEvents() {
  if (!cache) cache = eventsFromWeeks(Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k.split("/content/weeks/")[1].split("/")[0], v])));
  return cache;
}
// 現在進行中的某一種活動，回傳「記下來的樣子」（events.js 的 eventRunOf）；沒有就是 null
export const liveEvent = kind => eventRunOf(eventLive(allEvents(), kind, nowMs()));
// 「限時活動 ×1.5」的小標籤。boost 是 eventRunOf 的樣子（run.event、房間的 extra.boost 也是）
export const eventTagNode = (boost, extra) => h("span", { class: "ev-tag", title: boost && boost.title ? `限時活動：${boost.title}` : "限時活動" }, icon("sparkle"), ` ${eventTag(boost)}`, extra ? ` ${extra}` : "");

// ---------- 大廳的一條 ----------
// 一直放著這個盒子（沒有活動就藏起來）：大廳開著的時候活動開始了，也會自己出現
function lobbyEventBar() {
  if (!allEvents().length) return null;
  const box = h("section", { class: "event-bar", "aria-label": "限時活動", hidden: true });
  let last = null, started = false;
  const draw = () => {
    if (started && !box.isConnected) { clearInterval(timer); return; } // 換了房間（或整個重畫），這一條不在了：停掉
    const bars = eventBars(allEvents(), nowMs()), text = JSON.stringify(bars.map(b => [b.phase, b.ev.id, b.phase === "live" ? eventLeftText(b.left) : eventBarText(b)]));
    if (text === last) return; // 字沒變就不動，不會閃
    last = text;
    box.hidden = !bars.length;
    box.replaceChildren(...bars.map(b => h("p", { class: "ev-line " + b.phase },
      h("span", { class: "ev-kick" }, icon("sparkle"), b.phase === "live" ? " 限時活動進行中" : " 限時活動預告"),
      h("b", null, b.ev.title),
      h("span", { class: "ev-when" }, b.phase === "live" ? `還剩 ${eventLeftText(b.left)}` : `${eventWhen(b.ev)} ${eventRange(b.ev)}`),
      h("small", { class: "ev-effect" }, eventEffect(b.ev), "　", b.ev.words))));
  };
  const timer = every(draw, 1000);
  draw();
  started = true;
  return box;
}
ADDONS.lobbyEvent = lobbyEventBar;

// ---------- 這週的活動清單（每週劇情面板用） ----------
export function eventListBox(events) {
  if (!events || !events.length) return null;
  return h("section", { class: "event-list", "aria-label": "這週的限時活動" },
    h("h3", null, icon("sparkle"), " 這週的限時活動"),
    h("ul", null, events.map(ev => h("li", null, h("b", null, ev.title), h("span", { class: "ev-when" }, eventListLine(ev).split("　")[0]), h("small", null, eventEffect(ev), "　", ev.words)))),
    h("p", { class: "sp-note" }, "時間到了就回到平常的樣子；沒趕上也不會少什麼。"));
}
