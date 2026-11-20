// ================================================================
//  房間共用的小零件：房間標題、收藏抽屜、書（11-20 架構整理：從 ui_screens1.js 搬出來，解開 ui_screens1 ⇄ ui_screens2／3、ui_story 的 import 繞圈）
//  書裡 [[字|動作]] 的動作表 BOOK_ACTIONS 在這裡，內容由 ui_screens1.js 加進來
// ================================================================
import { CORE_TOTAL, clampN, num } from "../../shared/logic.js";
import { $$, ADDONS, HIDE_CHROME, P, UI, btn, h, icon, navTo, ptNode, snd } from "./ui_core.js";

export const BOOK_ACTIONS = {};

// 介面重塑（翊文 11-13，docs/規劃/介面整合規劃.md 第六步）：最下面收藏的抽屜。平常壹排縮圖，按銅拉環拉開才有頁籤和篩選（css/onescreen.css 的 .onescreen-drawer）
export function onescreenDrawer(strip, label = "你的收藏") {
  const drawer = h("div", { class: "onescreen-drawer" });
  // 11-16 翊文：「這個可以拉開的抽屜玩家不太知道可以當按鈕」：拉環上寫箭頭（關著 ▲、拉開 ▼ 收起）；玩家第壹次拉開以前，拉環輕輕發亮呼吸（記在 localStorage，拉過壹次就不再亮）
  const SEEN = "pm-drawer-seen", seen = () => { try { return localStorage.getItem(SEEN) === "1"; } catch (e) { return true; } };
  const arrow = h("i", { class: "op-arrow", "aria-hidden": "true" }, "▲"), txt = h("b", null, label);
  const pull = h("button", { type: "button", class: "onescreen-pull" + (seen() ? "" : " op-hint"), "aria-expanded": "false", title: "點這裡拉開：換頁籤、篩選" }, h("span", null, arrow, txt));
  pull.addEventListener("click", () => {
    const open = drawer.classList.toggle("open"); pull.setAttribute("aria-expanded", String(open));
    arrow.textContent = open ? "▼" : "▲"; txt.textContent = open ? "收起" : label;
    if (open) { pull.classList.remove("op-hint"); try { localStorage.setItem(SEEN, "1"); } catch (e) { /* ignore */ } }
  });
  drawer.append(pull, strip);
  return drawer;
}

export function roomHead(title, sub, ...extra) {
  const back = UI.screen && UI.screen !== "lobby" && !HIDE_CHROME.includes(UI.screen) && P ? btn([icon("lobby"), " 回大廳"], () => navTo("lobby"), "ghost small rh-back") : null;
  const ppl = P && ADDONS.roomPeople && UI.screen ? ADDONS.roomPeople(UI.screen) : null; // 這裡現在 N 人（11-16，ui_roomnow.js）
  return h("header", { class: "room-head" }, h("h1", null, title), sub ? h("p", { class: "sub" }, sub) : null, back || ppl ? h("div", { class: "rh-row" }, back, ppl) : null, extra.length ? h("div", { class: "head-tools" }, extra) : null); // 回大廳在標題下面靠左，每個房間同壹個位置
}

// 手機直拿：書打開時蓋住書架，書上面有「回書架」（電腦和橫拿不顯示，css/origin2.css）
export function bookBack(reader) {
  const main = reader.closest ? reader.closest(".origin-main") : null; if (!main) return null;
  main.classList.add("book-open");
  return h("button", { type: "button", class: "book-back", onClick: () => { main.classList.remove("book-open"); $$(".spine.on").forEach(x => x.classList.remove("on")); } }, icon("arrowLeft"), h("span", null, "回書架"));
}

export function bookReader(reader, title, pages, o = {}) {
  let i = 0;
  const page = h("div", { class: "page" });
  const count = h("span", { class: "page-n" });
  // 翊文 11-09：「翻頁箭頭可以明顯一點嗎」：金色按鈕，箭頭旁邊寫字
  const prev = h("button", { type: "button", class: "book-arrow prev", onClick: () => flip(-1) }, icon("arrowLeft"), h("span", null, "上壹頁"));
  const next = h("button", { type: "button", class: "book-arrow next", onClick: () => flip(1) }, h("span", null, "下壹頁"), icon("arrowRight"));
  const draw = () => {
    page.replaceChildren(...String(pages[i]).split("\n").map(l => bookLine(l)));
    if (o.aside && i === pages.length - 1) page.append(h("p", { class: "pl-aside" }, ptNode(o.aside)));
    count.textContent = `${i + 1}／${pages.length}`;
    prev.disabled = i === 0; next.disabled = i === pages.length - 1;
    page.classList.remove("enter"); void page.offsetWidth; page.classList.add("enter");
    if (i === pages.length - 1 && o.onEnd) { const f = o.onEnd; o.onEnd = null; f(); }
  };
  const flip = d => { const j = clampN(i + d, 0, pages.length - 1); if (j !== i) { i = j; snd("flip"); draw(); } };
  let sx = null;
  page.addEventListener("pointerdown", e => { sx = e.clientX; });
  page.addEventListener("pointerup", e => { if (sx != null && Math.abs(e.clientX - sx) > 40) flip(e.clientX < sx ? 1 : -1); sx = null; });
  const book = h("div", { class: "book", tabindex: "0", onKeydown: e => { if (e.key === "ArrowRight") flip(1); if (e.key === "ArrowLeft") flip(-1); } },
    h("h2", { class: "book-title" }, title), pages.some(p => /\[\[/.test(p)) ? h("p", { class: "book-hint" }, icon("sparkle"), " 書裡發亮的字可以點") : null,
    page, h("div", { class: "book-nav" }, prev, count, next), h("div", { class: "book-gains", "aria-live": "polite" }), bookBack(reader));
  reader.replaceChildren(book);
  draw();
  book.focus({ preventScroll: true });
}

export const BOOK_LINK = /\[\[(.+?)\|(.+?)\]\]/g;

export function bookLine(l) {
  const s = String(l).split("{圖鑑格數}").join(num(CORE_TOTAL));
  const parts = [];
  let last = 0, m;
  BOOK_LINK.lastIndex = 0;
  while ((m = BOOK_LINK.exec(s))) {
    if (m.index > last) parts.push(ptNode(s.slice(last, m.index)));
    const act = m[2], word = m[1];
    parts.push(h("button", { type: "button", class: "book-link", title: "點點看", onClick: e => { const f = BOOK_ACTIONS[act]; if (f) f(e.currentTarget); } }, word));
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push(ptNode(s.slice(last)));
  return h("p", null, parts);
}

// 讀書時得到、失去的東西：留在書的下面，不會消失
export function bookGain(reader, text, tone) {
  const g = reader && reader.querySelector(".book-gains");
  if (g) g.append(h("span", { class: "gain-chip " + (tone || "") }, text));
}
