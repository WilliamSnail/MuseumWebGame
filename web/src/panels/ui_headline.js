// ================================================================
//  大廳的跑馬燈：今天的重要事件和經濟事件（翊文 11-15：「各種每日重要事件包括每日經濟事件的跑馬燈」）
//  清單怎麼排、每種最多幾則，只寫在 shared/story/headlines.js 的 todayHeadlines；這裡只收資料、畫、處理點擊。
//  - 每則可以點（跳到財報、公佈欄、賭場）；滑鼠移上去、鍵盤停在上面就停；
//  - 尊重「減少動態」：不捲，改成壹則壹則切換；沒有事件顯示壹句平常的話。
//  - 財報的資料（景氣、世界經濟換狀態、市場新聞、日報）要跟伺服器拿壹次 bankHall（登入了才有；壹天拿壹次），拿到才補進去。
// ================================================================
import { NET } from "../core/net_firebase.js";
import { eventBars, eventLeftText, eventRange, eventWhen } from "../../../shared/story/events.js";
import { HL_QUIET, orderHeadlines, todayHeadlines } from "../../../shared/story/headlines.js";
import { RNG, todayStr } from "../../../shared/core/logic.js";
import { visibleNotices } from "../../../shared/game/notices.js";
import { P, PANELS, UI, every, h, navTo } from "../core/ui_core.js";
import { allEvents } from "./ui_events.js";
import { bankHallView } from "../rooms/bank/ui_bank.js";

// 收資料（缺的欄位就沒有，todayHeadlines 會跳過）
// 開發的時候沒登入：用示範資料把跑馬燈畫出來（玩家看不到）
const fake = day => ({ policy: { name: "兩岸服務業協定", effect: "門票多一成", day, until: day }, econ: { news: "昨天的烤雞肉多賣了 300 份，餐車股今天小漲。", idx: 0.6, report: [["餐車", "賣出 412 份"], ["21 點", "共 380 手"]], world: { events: [{ day, text: "島上科技集團減薪了" }] } }, world: { days: [{ day, items: [{ title: "晶片股走強", line: "手機晶片帶頭", tone: "up" }] }] } });
export function headlineData(day) {
  const dev = import.meta.env.DEV && !NET.me ? fake(day) : null;
  const bh = dev || (UI.headBank && UI.headBank.day === day ? UI.headBank.v : null);
  const bars = eventBars(allEvents(), Date.now()).map(b => ({ phase: b.phase, title: b.ev.title, text: b.phase === "live" ? `${b.ev.title}・還剩 ${eventLeftText(b.left)}` : `${eventWhen(b.ev)} ${eventRange(b.ev)}・${b.ev.title}` }));
  let notices = [];
  try { notices = P ? visibleNotices(P, day) : []; } catch (e) { notices = []; }
  return { policy: UI.policy || (dev ? dev.policy : null), econ: bh ? bh.econ : null, market: bh && bh.world ? bh.world.days : null, events: bars, notices, upcoming: UI.upcoming || (dev ? [{ text: "11 月 17 日《餐車週》可能會辦，餐車的客人會多壹些。", date: "2999-01-01" }] : null) };
}
async function loadBank(day, redraw) {
  if (!NET.me || UI.headLoading || (UI.headBank && UI.headBank.day === day)) return;
  UI.headLoading = true;
  try { const r = await NET.call("casino", { act: "bankHall" }); if (r && r.bankHall) { UI.headBank = { day, v: bankHallView(r.bankHall) }; redraw(); } }
  catch (e) { /* 拿不到就只放別的，下次進大廳再試 */ }
  finally { UI.headLoading = false; }
}
function go(link) {
  if (link === "bank") { UI.bankTab = "report"; navTo("bank"); }
  else if (link === "casino") navTo("casino");
  else if (PANELS.board) PANELS.board(); // board、events：公佈欄（活動預告、公告都在那裡）
}

// 捲壹圈停壹下（11-17 翊文）：捲完壹圈停 HL_REST_MS 再捲。壹直捲的話大廳每秒畫 60 格，手機會熱；停的時候不耗電。
// 閒置省電中（body.resting，web/src/core/rest.js）先不捲，等玩家回來
export const HL_REST_MS = 20000;
function hlRest(track) {
  track.style.animationName = "none";
  const again = () => { if (!track.isConnected) return; if (document.body.classList.contains("resting")) { setTimeout(again, 3000); return; } track.style.animationName = ""; };
  setTimeout(again, HL_REST_MS);
}
export function headlineStrip() {
  const box = h("div", { class: "l2-strip l2-hl", role: "region", "aria-label": "今天的重要事件" });
  let key = "", timer = null, turn = null, cur = 0;
  const ranks = new Map(); // 這次進大廳洗好的順序（orderHeadlines）
  const reduce = () => document.body.classList.contains("reduce-motion");
  const draw = () => {
    if (!box.isConnected && key !== "") { clearInterval(timer); clearInterval(turn); return; }
    const day = todayStr(), list = orderHeadlines(todayHeadlines(headlineData(day), day), ranks, RNG), k = JSON.stringify(list.map(x => x.text)) + reduce();
    if (k === key) return;
    key = k; cur = 0;
    const item = (x, i) => h("button", { type: "button", class: "hl-i tone-" + x.tone + (x.upcoming ? " up" : "") + (i === 0 ? " cur" : ""), onClick: () => go(x.link) }, h("em", { "aria-hidden": "true" }), x.text);
    const items = list.length ? list : [{ text: HL_QUIET, tone: "neutral", link: "board" }];
    const track = h("div", { class: "hl-track", style: { animationDuration: Math.max(18, items.reduce((n, x) => n + x.text.length, 0) * 0.55) + "s" } }, items.map(item), reduce() || items.length < 2 ? null : items.map((x, i) => item(x, i + 99))); // 複製壹份接在後面，捲動才接得起來
    box.replaceChildren(h("b", null, "今日要聞"), h("div", { class: "hl-view" }, track));
    track.addEventListener("animationend", () => hlRest(track));
    box.classList.toggle("hl-still", reduce() || items.length < 2);
  };
  // 減少動態：壹則壹則切換
  turn = every(() => { if (!box.isConnected || !reduce()) return; const els = [...box.querySelectorAll(".hl-i")]; if (els.length < 2) return; cur = (cur + 1) % els.length; els.forEach((e, i) => e.classList.toggle("cur", i === cur)); }, 4500);
  timer = every(draw, 5000);
  draw();
  loadBank(todayStr(), () => { key = ""; draw(); });
  return box;
}
