// ================================================================
//  畫面：共用的部分（導覽列、狀態列、燈光、理智檢定流程）
// ================================================================
// ---------- 第 4 版：從別的檔拿的（從第 3 版轉成模組時自動產生；之後新增用到的名字就手動加） ----------
import { NUM } from "../../shared/config.js";
import { HALL_THEME_TEXT, INVOLUNTARY, MADNESS_TEXT, QUIRK_TEXT, SAN_ASIDES } from "../../shared/content.js";
import { BOOK4, FUSION_TEXT, QUIRK_TASK_TEXT } from "../../shared/content3.js";
import { ART } from "./art.js";
import { FX } from "./fx.js";
import { FAILED, FIT_KEY, IMG_KEY, ROLLED, SAVE_KEY, activeQuirks, allOpts, applySan, baseOpts, calmExhibits, clampN, dailyCommissions, describePepe, describePillow, endingDue, ensureDay, exhibitById, expireQuirks, fill, finishMake, fromKey, gainQuirk, gameDayNo, halveCost, halved, involuntary, isFree, knownTotal, maxSan, miniLeft, nowMs, num, pad, parseDice, parsePillowKey, possibilities, quirkMinsLeft, quirkName, realTodayStr, sanCheck, secToNextDay, splitSan, startBout, tickAction, understandCheck } from "../../shared/logic.js";
import { hasTalent, skillCheck, understandLine } from "../../shared/logic3.js";
import { FRESH_KEY, badgeOpens, enterFreshRoom, freshRooms, leaveFreshRoom, markFresh, markFreshEvents, scanFresh } from "../../shared/fresh.js";
import { boardBadge, noticeState, visibleNotices } from "../../shared/notices.js";
import { syncMail, unclaimedCount } from "../../shared/mailbox.js";
import { NET } from "./net_firebase.js"; // 決定 0021：改接 Firebase（介面跟 net.js 一樣）

export let SAVE = null, P = null, IMG = {}, FIT = { hatY: 0, hatS: 1, handX: 0, handY: 0 };
// 第 4 版：模組之間不能直接改別人的變數，別的檔要改這四個，一律用下面的 setter
export function setSave(v) { SAVE = v; return v; }
export function setP(v) { P = v; return v; }
export function setImg(v) { IMG = v; return v; }
export function setFit(v) { FIT = v; return v; }
export const UI = { screen: "title", params: {}, held: null, undo: [], timers: [], lastInput: Date.now(), busy: false, cleanup: [] };
export const RCOLOR = { 普通: "var(--r-common)", 稀有: "var(--r-rare)", 超稀有: "var(--r-epic)", 傳說級稀有: "var(--r-legend)", 不可名狀: "var(--r-eldritch)", 失敗作: "#B9B4AA", 修復品: "#9C8A6A" };
export const ROOM_NAMES = { lobby: "大廳", gallery: "畫廊", origin: "起源室", workshop: "手作坊", fusion: "融合室", pillow: "抱枕工作台", commission: "委託櫃台", codex: "圖鑑室", hall: "我的展廳", cellar: "地下收藏庫", office: "館長室", library: "圖庫", settings: "設定" };
export const NAV_ROOMS = [["lobby", "大廳"], ["gallery", "畫廊"], ["origin", "起源"], ["workshop", "手作坊"], ["fusion", "融合"], ["pillow", "抱枕"], ["hall", "展廳"], ["codex", "圖鑑"], ["cellar", "地下"], ["office", "館長室"]];
export const SCREENS = {};
// 蓋在畫面上的面板（公佈欄、信箱…）：後面的檔（ui_board.js）載入時登記進來，ui_core 只負責叫（ui_core 不能 import 後面的檔）
export const PANELS = {};
// 館友小卡上的按鈕（參觀展廳、送佩佩、邀請一起融合……）：各自的檔登記進來，館友名單（ui_login.js）照順序畫。
// 一筆：{ id, label, show(p), run(p) }；p 是名單上的一位（id、nick、status、room）。show 不給就是都顯示。
export const FRIEND_ACTIONS = [];

// ---------- 建 DOM 的小工具 ----------
// 瀏覽器的 append / replaceChildren 會把 null 印成「null」字樣；這裡先把 null、false 濾掉
if (typeof Element !== "undefined") {
  ["append", "prepend", "replaceChildren"].forEach(name => {
    const orig = Element.prototype[name];
    if (!orig || orig.__pm) return;
    const f = function (...kids) { return orig.apply(this, kids.filter(k => k != null && k !== false)); };
    f.__pm = true;
    Element.prototype[name] = f;
  });
}
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k === "text") el.textContent = v;
    else if (k === "style" && typeof v === "object") Object.entries(v).forEach(([sk, sv]) => { if (sk.startsWith("--")) el.style.setProperty(sk, String(sv)); else el.style[sk] = sv; }); // CSS 變數（--i）要用 setProperty
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const icon = (name, cls) => h("span", { class: "ic " + (cls || ""), html: ART.icon(name), "aria-hidden": "true" });
export const btn = (label, onClick, cls = "", extra = {}) => h("button", Object.assign({ class: "btn " + cls, type: "button", onClick }, extra), label);
export const wait = ms => new Promise(r => setTimeout(r, motionOff() ? Math.min(ms, 120) : ms));
export const motionOff = () => document.body.classList.contains("reduce-motion");
export function later(fn, ms) { const t = setTimeout(fn, ms); UI.timers.push(t); return t; }
export function every(fn, ms) { const t = setInterval(fn, ms); UI.timers.push(t); return t; }
export function clearTimers() { UI.timers.forEach(t => { clearTimeout(t); clearInterval(t); }); UI.timers = []; UI.cleanup.forEach(f => { try { f(); } catch (e) { /* 已經拿掉了 */ } }); UI.cleanup = []; }
// 提示壹律至少 6.5 秒，字越多留越久（翊文 11-08：「你一天內掉太多理智了」這種說明太快消失，至少要 6 秒）
export const note = (text, tone, ms) => FX.toast(text, { tone, ms: Math.max(ms || 0, 6500, 2600 + String(text).length * 90) });
export const snd = (n, a) => FX.sound.play(n, a);

// 說明牌上的字：偏執發作時都寫「牠們在看你」，理智低時偶爾歪掉、錯字
export const TYPO = { 佩: "珮", 的: "旳", 你: "妳", 是: "昰", 看: "着", 了: "子", 這: "这", 一: "－", 隻: "只", 心: "忄" };
export function pt(text) {
  if (!P || isFree(P)) return text;
  if (P.bout && P.bout.i === 3) return "牠們在看你";
  if (P.sanity < 40 && Math.random() < 0.35) {
    const chars = [...text];
    const n = 1 + Math.floor(Math.random() * 2);
    for (let k = 0; k < n; k++) {
      const i = Math.floor(Math.random() * chars.length);
      if (TYPO[chars[i]]) chars[i] = TYPO[chars[i]];
      else if (/[一-鿿]/.test(chars[i])) chars.splice(i, 0, chars[i]);
    }
    return chars.join("");
  }
  return text;
}
export function ptNode(text, cls) {
  const s = pt(text);
  const glitch = P && !isFree(P) && P.sanity < 40 && s !== text;
  return h("span", { class: (cls || "") + (glitch ? " glitch" : "") }, s);
}

// ---------- 畫青蛙、抱枕（套上發作效果和圖庫） ----------
export function frogHTML(pick, o = {}) {
  let pk = pick;
  const extra = {};
  if (P && P.bout && P.bout.i === 7) { pk = Object.assign({}, pick, { 心情: P.bout.emo }); extra.extreme = true; }
  return ART.frog(pk, Object.assign({ custom: IMG, fit: FIT }, extra, o));
}
export function itemHTML(item, o = {}) {
  if (!item) return "";
  if (item.kind === "repaired") return frogHTML(item.pick || fromKey(item.key), Object.assign({ failed: false }, o));
  if (item.kind === "pillow") {
    const pp = parsePillowKey(item.key);
    let pr = pp.print ? pp.print.pick : null;
    const extra = {};
    if (pr && P && P.bout && P.bout.i === 7) { pr = Object.assign({}, pr, { 心情: P.bout.emo }); }
    return ART.pillow(pp.pick, pr, Object.assign({ custom: IMG, fit: FIT, failed: !!(pp.print && pp.print.kind === "failed"), perfect: !!(pp.print && P && (P.pepes[pp.print.key] || {}).perfect) }, extra, o));
  }
  const pick = item.pick || fromKey(item.key);
  return frogHTML(pick, Object.assign({ failed: item.kind === "failed", perfect: !!item.perfect }, o));
}
export function itemTitle(item) {
  if (item.kind === "pillow") return describePillow(item.key).title;
  if (item.kind === "repaired") return describePepe(item.pick || fromKey(item.key)).title + "（修復品）";
  const e = item.kind === "pepe" && P && P.pepes[item.key];
  if (e && e.title) return `「${e.title}」` + describePepe(item.pick || fromKey(item.key)).title;
  const d = describePepe(item.pick || fromKey(item.key), { failed: item.kind === "failed" });
  return item.kind === "failed" ? d.title + "（失敗作）" : d.title;
}
export function rdot(r) { return h("i", { class: "rdot", style: { background: RCOLOR[r] || "var(--r-common)" }, title: r }); }

// 說明牌：粗體標題、第二行、第三行（稀有度色點最後亮）
export function placard(lines, o = {}) {
  const box = h("div", { class: "placard" + (o.gold ? " gold" : "") + (o.cls ? " " + o.cls : "") });
  lines.forEach((l, i) => {
    if (l == null) return;
    if (l.nodeType) { box.append(l); return; }
    box.append(h("div", { class: i === 0 ? "pl-title" : "pl-line" }, ptNode(String(l))));
  });
  return box;
}
export function pepePlacard(pick, o = {}) {
  const d = describePepe(pick, { failed: o.failed });
  const third = h("div", { class: "pl-line pl-r" }, rdot(d.rarity), " ", d.rarity, d.no ? "　" + d.no : "");
  return placard([d.title, d.extra, third].concat(o.more || []), { gold: o.perfect, cls: o.cls });
}

// ---------- 存檔 ----------
export function readJSON(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
// 存檔。登入了（UI.net，ui_login.js 讀到伺服器的存檔之後才設）：送到伺服器（3 秒內存好幾次只送一次）。
// 沒登入（標題畫面、開發用的 #畫面）：照舊存在這台電腦。
// 登入後不寫這台電腦的舊存檔：留著給「搬上去」用，也不會被兩個分頁（兩個帳號）互相蓋掉。
export function persist() {
  if (UI.net) { NET.saveSoon(SAVE); return; }
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { /* 預覽環境可能不能存 */ }
}
// 馬上存，不等 saveSoon 的幾秒：抽到的東西（小優點、小缺點）不能因為馬上重新整理就重抽（決定 0028）
export function persistNow() {
  persist();
  if (UI.net && NET.flush) NET.flush().catch(() => {});
}
// 告訴伺服器「我在哪個房間」：房間代號照 server/protocol.md（小寫英文開頭，最多 32 字）
export function netRoom(name) {
  const r = String(name || "").toLowerCase();
  return /^[a-z][a-z0-9_:-]{0,31}$/.test(r) ? r : "lobby";
}
// 館友名單上的「在哪裡」寫成字
export function roomLabel(room) {
  if (!room) return "在館裡";
  if (room === "title") return "在門口";
  if (room.startsWith("cellar")) return "在地下收藏庫";
  if (room === "reveal") return "在手作坊";
  return ROOM_NAMES[room] ? "在" + ROOM_NAMES[room] : "在館裡";
}
export function saveImages() {
  try { localStorage.setItem(IMG_KEY, JSON.stringify(IMG)); return true; }
  catch (e) { note("圖存不下（太多或太大），關掉網頁後要重選。", "bad"); return false; }
}
export function saveFit() { try { localStorage.setItem(FIT_KEY, JSON.stringify(FIT)); } catch (e) { /* 只留在這次 */ } }
export function useProfile(mode) {
  SAVE.current = mode;
  P = SAVE.profiles[mode];
  const d = ensureDay(P);
  UI.pendingRecovery = !!(d && !d.firstEver);
  UI.pendingGrowth = UI.pendingRecovery;
  persist();
  buildStatus();
  applyBodyState();
}

// ---------- 導覽列 ----------
// 導覽列的圖示（翊文 11-08：「這個也可以加 icon 嗎」）；手機的選單也用同壹套
export const NAV_ICON = { lobby: "lobby", gallery: "gallery", origin: "origin", workshop: "workshop", fusion: "fusion", pillow: "pillow", hall: "hall", codex: "codex", cellar: "stairs", office: "office",
  commission: "commission", library: "library", settings: "gear" };
// 公佈欄、信箱是蓋在整個畫面上的（ui_board.js 登記在 PANELS），不是房間
export function openPanel(name) {
  if (!P) { go("title"); return; }
  if (PANELS[name]) PANELS[name]();
}
export function buildNav() {
  const nav = $("#nav");
  const roomLink = ([id, name]) => h("a", { href: "#", class: "nav-link", dataset: { room: id, name: ROOM_NAMES[id] || name }, onClick: e => { e.preventDefault(); navTo(id); } }, icon(NAV_ICON[id] || "sparkle"), h("span", { class: "nl-t" }, name), freshTag("nav-fresh"));
  // 館內公佈欄（翊文 11-08：「應該也要是個 TAB，放在下面玩家注意不到」）：跟房間排在一起，放在大廳右邊。
  // 按了不換房間，是把公佈欄蓋在整個畫面上（「像真的公告欄一樣」）。火漆印＝有沒讀的重要公告；小圓點＝有沒讀的
  const boardTab = h("a", { href: "#", class: "nav-link nav-board", "aria-haspopup": "dialog", dataset: { name: "館內公佈欄" }, onClick: e => { e.preventDefault(); openPanel("board"); } },
    icon("scroll"), h("span", { class: "nl-t" }, "公佈欄"), h("span", { class: "nb-seal", "aria-hidden": "true" }), h("span", { class: "nb-dot", "aria-hidden": "true" }));
  const tabs = NAV_ROOMS.map(roomLink);
  tabs.splice(1, 0, boardTab);
  const links = h("nav", { class: "nav-links", "aria-label": "房間" }, tabs);
  const sound = h("button", { class: "icon-btn", id: "soundBtn", type: "button", "aria-label": "聲音", onClick: () => { SAVE.settings.muted = !SAVE.settings.muted; applySettings(); persist(); } });
  // 選單（翊文 11-08：「可以做漢堡菜單，把設定和公告相關的放進去」）。每個寬度都有，放在右上角。
  // 三條線旁邊寫「選單」兩個字（NN/g：只有圖示，不常上網的人認不出來）。
  // 裡面有東西沒看（沒讀的公告、沒領的信），按鈕上就有數字：藏起來的東西才不會被忘記。手機上房間也在這裡面
  const menu = h("button", { class: "icon-btn menu-btn", type: "button", "aria-label": "選單", "aria-expanded": "false", "aria-controls": "navDrawer", onClick: () => toggleMenu() },
    icon("menu"), h("span", { class: "menu-t" }, "選單"), h("span", { class: "menu-n", "aria-hidden": "true" }), freshTag("nav-fresh menu-fresh"));
  const brand = h("a", { href: "#", class: "brand", onClick: e => { e.preventDefault(); navTo("lobby"); } }, "PEPE MUSEUM");
  const item = (cls, ic, label, fn) => h("button", { type: "button", class: "md-item " + cls, onClick: () => { toggleMenu(false); fn(); } }, icon(ic), h("span", { class: "md-t" }, label), h("span", { class: "md-badge" }));
  const roomItem = ([id, name]) => h("a", { href: "#", class: "nav-drawer-link md-item", dataset: { room: id, name }, onClick: e => { e.preventDefault(); toggleMenu(false); navTo(id); } }, icon(NAV_ICON[id] || "sparkle"), h("span", { class: "md-t" }, name), freshTag("nav-fresh"));
  const drawer = h("div", { class: "nav-drawer", id: "navDrawer", hidden: true, role: "region", "aria-label": "選單" },
    h("p", { class: "md-h" }, "公告與信件"),
    h("div", { class: "md-group" }, item("md-board", "scroll", "館內公佈欄", () => openPanel("board")), item("md-mail", "mail", "信箱", () => openPanel("mail"))),
    h("p", { class: "md-h md-rooms-h" }, "房間"),
    h("div", { class: "md-group md-rooms" }, Object.entries(ROOM_NAMES).filter(([id]) => id !== "settings").map(roomItem)),
    // 館友和帳號（M1，登入了才出現）
    h("p", { class: "md-h md-net", hidden: true }, "館友與帳號"),
    h("div", { class: "md-group md-net", hidden: true }, item("md-friends", "users", "館友", () => openPanel("friends")), item("md-switch", "refresh", "換參觀者", () => go("title", {}, { action: false })), item("md-account", "user", "我的帳號", () => openPanel("account"))),
    h("p", { class: "md-h" }, "設定"),
    h("div", { class: "md-group" }, roomItem(["settings", ROOM_NAMES.settings])));
  nav.replaceChildren(brand, links, h("div", { class: "nav-tools" }, sound, menu), drawer);
  if (!UI.menuWired) {
    UI.menuWired = true;
    // 點選單外面就關起來
    document.addEventListener("click", e => { const d = $("#navDrawer"); if (d && !d.hidden && !e.target.closest("#navDrawer, .menu-btn")) toggleMenu(false); });
  }
  applySettings();
  markFreshNav();
  updateBoardBadges();
}
export function toggleMenu(force) {
  const d = $("#navDrawer"), b = $(".menu-btn");
  if (!d || !b) return;
  const open = force != null ? force : d.hidden;
  if (open === !d.hidden) return;
  const hadFocus = d.contains(document.activeElement);
  d.hidden = !open;
  b.setAttribute("aria-expanded", String(open));
  b.classList.toggle("on", open);
  if (open) { updateBoardBadges(); const f = d.querySelector(".md-item"); if (f) f.focus({ preventScroll: true }); }
  else if (hadFocus) b.focus({ preventScroll: true });
}
export function navTo(room) {
  if (!P) { go("title"); return; }
  if (P.dark && room !== "settings") { note("燈熄了，什麼都看不到。", "bad"); return; }
  go(room);
}
export function markNav() {
  $$(".nav-link, .nav-drawer-link").forEach(a => a.classList.toggle("on", a.dataset.room === UI.screen || (UI.screen === "reveal" && a.dataset.room === "workshop")));
  markFreshNav();
}

// ---------- 新解開的東西（翊文 11-08：「玩家新解開的東西應該介面上要有提示有那個地方解開了」） ----------
// 規則在 shared/fresh.js。這裡：導覽列的「新」、房間裡的小牌子、提示寫在哪裡
// 不用紅點（規劃：紅點太多大家就不看了）：只有房間裡「真的有新東西、還沒進去看」時，名字旁邊才有金色的「新」
export const FRESH_TAB = { recipes: "配方", badges: "徽章", upgrades: "工坊升級" };
export function freshTag(cls) { return h("span", { class: "fresh-tag" + (cls ? " " + cls : ""), title: "新解開的", "aria-hidden": "true" }, "新"); }
// 掛在那件東西上（卡片、畫、書背……）：右上角壹塊小牌子
export function freshMark(el, on) {
  if (!on || !el) return el;
  el.classList.add("has-fresh");
  el.append(freshTag("corner"));
  const lab = el.getAttribute("aria-label");
  if (lab) el.setAttribute("aria-label", lab + "（新解開的）");
  return el;
}
// 提示上寫的「在哪裡」：到手作坊、到圖鑑室的「徽章」頁；人就在那個房間的話寫「在這裡」
export function freshWhere(room, tab) {
  const t = tab ? `的「${FRESH_TAB[tab] || tab}」頁` : "";
  return UI.screen === room ? `在這裡${t}` : `到${ROOM_NAMES[room] || room}${t}`;
}
// 狀態變了就看看有沒有新東西（買得起的升級、剛能解鎖的選項），再更新導覽列
export function syncFresh() {
  if (P) scanFresh(P, UI.screen);
  markFreshNav();
}
export function markFreshNav() {
  if (typeof document === "undefined") return;
  const rooms = P ? freshRooms(P) : {};
  let any = false;
  $$(".nav-link, .nav-drawer-link").forEach(a => {
    const n = rooms[a.dataset.room] || 0, name = a.dataset.name || "";
    if (n) any = true;
    if (a.classList.contains("has-fresh") === !!n) return;
    a.classList.toggle("has-fresh", !!n);
    if (n) { a.title = `${name}：有新解開的東西`; a.setAttribute("aria-label", `${name}（有新解開的東西）`); }
    else { a.removeAttribute("title"); a.removeAttribute("aria-label"); }
  });
  const mb = $(".menu-btn");
  if (mb) { mb.classList.toggle("has-fresh", any); labelMenu(); }
}

// ---------- 要花靈感的按鈕（翊文 11-08：按鈕寫「花 N 靈感」，旁邊顯示現在有多少） ----------
export const costText = (verb, n) => `${verb}（花 ${n} 靈感）`;
export function inspHave(need) {
  const el = h("p", { class: "insp-have", dataset: { need: need == null ? "" : String(need) } }, "你現在有 ", h("b", null, num(P.insp)), " 靈感", h("span", { class: "ih-short" }));
  refreshInspHave(el);
  return el;
}
export function refreshInspHave(el) {
  if (!P) return;
  const need = el.dataset.need === "" ? null : +el.dataset.need, short = need != null && P.insp < need;
  el.querySelector("b").textContent = num(P.insp);
  el.querySelector(".ih-short").textContent = short ? `，還差 ${need - P.insp}` : "";
  el.classList.toggle("short", short);
}

// ---------- 聲音跟著狀態走（翊文 11-08） ----------
// 環境音：看在哪個房間；理智歸零後是遠處的低音鼓；心跳：理智 30 以下；耳鳴：瘋狂發作中；不安的低鳴：理智 40 以下越低越明顯
export const AMB_OF = { gallery: "gallery", cellar: "cellar", fusion: "fusion", lobby: "lobby", workshop: "workshop", reveal: "workshop", pillow: "pillow", commission: "commission",
  codex: "codex", hall: "hall", origin: "origin", library: "library", office: "office", settings: "room", title: "title", ending: null }; // 翊文 11-08：每個房間都有自己的背景音
// 低語：理智越低，越多聲音疊在壹起（翊文 11-08）。50 以上 2 個，40–49：3，30–39：4，20–29：5，10–19：6，1–9：7，0：8
export const whisperLayers = () => !P || isFree(P) || P.sanity >= 50 ? 2 : P.sanity <= 0 ? 8 : Math.min(7, 3 + Math.floor((49 - P.sanity) / 10));
export function audioState() {
  const S = FX.sound;
  if (!S || !S.ambient) return;
  if (S.setWhisperLayers) S.setWhisperLayers(whisperLayers());
  const live = !!(P && !isFree(P)), scr = UI.screen;
  let amb = scr === "title" ? "title" : P ? (scr in AMB_OF ? AMB_OF[scr] : "room") : null;
  if (live && P.dark && scr !== "ending") amb = "zero";
  if (scr === "ending" && UI.params && UI.params.id === "russia8") amb = "zero";
  S.ambient(amb);
  S.heart(live && !P.dark && scr !== "ending" ? P.sanity : null);
  S.tinnitus(!!(live && P.bout && scr !== "ending"));
  S.unease(live && !P.dark && scr !== "ending" ? Math.max(0, (40 - P.sanity) / 40) : 0);
}
// 理智回升、心情升降的聲音：跟上一次看到的數字比（換參觀者、一打開遊戲時不響）
export function audioTrack(instant) {
  const A = UI.au || (UI.au = {});
  if (P && !isFree(P)) {
    if (A.p === P && A.visitor === P.visitor && !instant) {
      if (P.sanity > A.san) snd("sanUp");
      const t = Date.now();
      if (P.mood !== A.mood && t - (A.moodT || 0) > 450) { snd(P.mood > A.mood ? "moodUp" : "moodDown"); A.moodT = t; }
    }
    A.p = P; A.visitor = P.visitor; A.san = P.sanity; A.mood = P.mood;
  } else A.p = null;
  audioState();
}

// ---------- 狀態列 ----------
export function buildStatus() {
  const st = $("#status");
  if (!P) { st.replaceChildren(); return; }
  const free = isFree(P);
  const bar = (id, label) => h("div", { class: "st-item st-bar", id: "st-" + id, title: label },
    h("span", { class: "st-label" }, label), h("span", { class: "st-track" }, h("i", { class: "st-fill" }), h("i", { class: "st-dot" })), h("span", { class: "st-val" }, h("b", { class: "st-num" }, "0"), h("small", { class: "st-max" }, "／99")));
  const numItem = (id, label, onClick) => h(onClick ? "button" : "div", { class: "st-item", id: "st-" + id, type: onClick ? "button" : null, onClick },
    h("span", { class: "st-label" }, label), h("b", { class: "st-num" }, "0"));
  const day = h("div", { class: "st-item st-day", id: "st-day" }, h("span", { class: "st-label" }, "天數"), h("b", { class: "st-num" }, "第 001 天"), h("b", { class: "st-num-s" }, "001天"), h("small", { class: "st-left" }, ""), h("small", { class: "st-left-s" }, "")); // 翊文 11-08：天數＋還有多久換日（-s 是手機用的短版）
  const items = free
    ? [day, h("div", { class: "st-item st-mode" }, "自由模式"), numItem("poss", "可能性"), numItem("own", "收藏"), numItem("jobs", "委託", () => navTo("commission"))]
    : [day, bar("mood", "心情"), bar("san", "理智"), numItem("insp", "靈感"), numItem("poss", "可能性"), numItem("jobs", "委託", () => navTo("commission"))];
  const extra = h("div", { class: "st-extra", id: "st-extra" });
  const dots = h("div", { class: "st-bout", id: "st-bout", "aria-live": "polite" });
  const toggle = h("button", { class: "st-toggle", type: "button", "aria-label": "展開狀態", onClick: () => st.classList.toggle("open") }, icon("info"));
  st.replaceChildren(h("div", { class: "st-row" }, items, extra, dots), toggle);
  updateStatus(true);
  watchStatusHeight();
}
// 狀態列真正的高度 → CSS 變數 --status-real（翊文 11-08 介面檢查第 3 項）：
// 狀態列在某些寬度會排成兩排，原本各頁底下的留白、跳出的視窗都照固定的 --status-h 算，就被蓋住。
// 手機上點 ⓘ 展開狀態列時不更新（那是暫時蓋在上面的）。
let statusRO = null;
export function watchStatusHeight() {
  const st = $("#status");
  if (!st || statusRO || typeof ResizeObserver === "undefined") return;
  statusRO = new ResizeObserver(() => {
    if (st.hidden || st.classList.contains("open")) return;
    const hgt = Math.round(st.getBoundingClientRect().height);
    if (hgt > 0) document.documentElement.style.setProperty("--status-real", hgt + "px");
  });
  statusRO.observe(st);
}
// 狀態列的「第 001 天」和「還有 N 小時換日」；每秒由 boot.js 的 tick() 呼叫，只在字變了才改。
// 11-09 起一天＝台灣時間 05:00 到隔天 05:00（決定 0019）：第 N 天從第一次進館那天算，倒數算到下一個 05:00
export function updateDayClock() {
  const dEl = P && $("#st-day");
  if (!dEl) return;
  const no = pad(gameDayNo(P), 3), left = secToNextDay();
  const hrs = Math.floor(left / 3600), mins = Math.max(1, Math.ceil(left / 60));
  const leftText = hrs >= 1 ? `還有 ${hrs} 小時換日` : `還有 ${mins} 分鐘換日`;
  const shortLeft = hrs >= 1 ? `${hrs}小時後` : `${mins}分後`;
  [[".st-num", `第 ${no} 天`], [".st-num-s", `${no}天`], [".st-left", leftText], [".st-left-s", shortLeft]].forEach(([q, t]) => { const e = $(q, dEl); if (e && e.textContent !== t) e.textContent = t; });
  const tip = `第 ${no} 天（你第壹次進館那天是第 1 天）。台灣時間每天 05:00 換壹天，週壹 05:00 換週，大家都壹樣。`;
  if (dEl.title !== tip) dEl.title = tip;
}
// 公佈欄頁籤的火漆印、選單裡的「N 則沒讀／N 封沒領」、選單按鈕上的數字（updateStatus 每次都更新；公告附的獎勵也在這裡寄進信箱）
export function updateBoardBadges() {
  const tab = $(".nav-board"), mb = $(".menu-btn");
  if (!tab || !SAVE) return;
  const today = realTodayStr(), list = visibleNotices(P, today), badge = boardBadge(noticeState(SAVE), list);
  const mails = P ? (syncMail(P, list, today), unclaimedCount(P, today)) : 0;
  const boardTxt = badge.count ? `${badge.count} 則沒讀` : "";
  tab.classList.toggle("has-seal", badge.seal);
  tab.classList.toggle("has-dot", !badge.seal && badge.count > 0);
  tab.setAttribute("aria-label", boardTxt ? `館內公佈欄（${boardTxt}${badge.seal ? "，有重要的" : ""}）` : "館內公佈欄");
  tab.title = badge.seal ? "館內公佈欄：有重要的公告還沒看" : boardTxt ? `館內公佈欄：${boardTxt}` : "館內公佈欄";
  const setItem = (sel, txt, hot) => {
    const el = $(sel);
    if (!el) return;
    $(".md-badge", el).textContent = txt;
    el.classList.toggle("has-badge", !!txt);
    el.classList.toggle("hot", !!hot);
  };
  setItem(".md-board", boardTxt, badge.seal);
  updateNetMenu();
  setItem(".md-mail", mails ? `${mails} 封沒領` : "", false);
  if (mb) {
    const n = badge.count + mails;
    mb.dataset.n = String(n);
    mb.classList.toggle("has-n", n > 0);
    mb.classList.toggle("has-seal", badge.seal);
    $(".menu-n", mb).textContent = n > 99 ? "99+" : n ? String(n) : "";
    labelMenu();
  }
}
// 選單裡的「館友（N 人在線）」「我的帳號（暱稱）」：登入了才出現
export function updateNetMenu() {
  const on = !!UI.net;
  $$(".md-net").forEach(el => { el.hidden = !on; });
  if (!on) return;
  const n = NET.roster.filter(p => !p.me && p.status !== "offline").length;
  const f = $(".md-friends"), a = $(".md-account");
  if (f) { $(".md-badge", f).textContent = n ? n + " 人在線" : ""; f.classList.toggle("has-badge", n > 0); }
  if (a) $(".md-badge", a).textContent = NET.me ? NET.me.nick : "";
}
// 選單按鈕給螢幕閱讀器念的字：裡面有幾件沒看、（手機）有沒有新解開的房間
function labelMenu() {
  const mb = $(".menu-btn");
  if (!mb) return;
  const bits = [], n = +(mb.dataset.n || 0);
  if (mb.classList.contains("has-seal")) bits.push("有重要公告");
  if (n) bits.push(`${n} 件還沒看`);
  if (mb.classList.contains("has-fresh") && matchMedia("(max-width: 760px)").matches) bits.push("有新解開的東西");
  mb.setAttribute("aria-label", bits.length ? `選單（${bits.join("、")}）` : "選單");
}
export function updateStatus(instant) {
  audioTrack(instant);
  syncFresh();
  updateBoardBadges();
  if (!P || !$("#status .st-row")) return;
  const amnesia = P.bout && P.bout.i === 0;
  const set = (id, val, text) => {
    const el = $("#st-" + id + " .st-num");
    if (!el) return;
    if (amnesia) { el.textContent = "??"; el.dataset.v = ""; return; }
    if (text != null) { el.textContent = text; return; }
    if (instant || el.textContent === "??") { el.textContent = num(val); el.dataset.v = val; } else FX.countTo(el, val);
  };
  const setBar = (id, v, max) => {
    const box = $("#st-" + id);
    if (!box) return;
    const pct = amnesia ? 50 : clampN(v / max * 100, 0, 100);
    box.style.setProperty("--p", pct + "%");
  };
  updateDayClock();
  const jobs = dailyCommissions(P, P.day.date).filter(c => !c.done).length;
  if (isFree(P)) {
    set("poss", 0, `${num(possibilities(P))} 種`);
    set("own", Object.keys(P.pepes).length);
  } else {
    set("mood", P.mood); setBar("mood", P.mood, 99);
    set("san", P.sanity); setBar("san", P.sanity, 99);
    $("#st-san").style.setProperty("--max", (maxSan(P) / 99 * 100) + "%");
    const sm = $("#st-san .st-max"); if (sm) sm.textContent = amnesia ? "／??" : `／${maxSan(P)}`;
    set("insp", P.insp);
    $$(".insp-have").forEach(refreshInspHave);
    const poss = $("#st-poss .st-num");
    if (poss) {
      const v = possibilities(P);
      if (amnesia) poss.textContent = "??";
      else if (instant) { poss.dataset.v = v; poss.textContent = `${num(v)}／${num(knownTotal(P))}`; }
      else FX.countTo(poss, v, { format: n => `${num(n)}／${num(knownTotal(P))}` });
    }
  }
  set("jobs", 0, String(jobs));
  const jb = $("#st-jobs"); if (jb) jb.classList.toggle("has", jobs > 0);
  const extra = $("#st-extra");
  if (extra) {
    const chips = [];
    if (P.myth > 0) chips.push(h("span", { class: "chip", title: `理智上限＝99－佩佩神話＝${maxSan(P)}` }, `神話 ${P.myth}`));
    // 怪癖：名字＋要做的那件事＋剩幾分鐘（決定 0027；剩幾分鐘由 quirkTick 每分鐘換字，不重畫）
    activeQuirks(P).forEach(q => chips.push(h("button", { type: "button", class: "chip warn qk-chip", title: `${quirkName(q)}：${quirkEffects(q).map(e => e[1]).join("；")}。${quirkCureText(q)}（點壹下看詳細）`, onClick: () => showQuirks() },
      icon("eye"), h("span", { class: "qk-chip-n" }, quirkName(q)), h("small", { class: "qk-chip-sub" }, QUIRK_TASK_TEXT[q.task] ? QUIRK_TASK_TEXT[q.task].chip + "・" : "", quirkLeftNode(q, "s")))));
    extra.replaceChildren(...chips);
  }
  const dots = $("#st-bout");
  if (dots) {
    if (P.bout) {
      const name = MADNESS_TEXT[P.bout.i].name;
      dots.replaceChildren(h("span", { class: "bout-name" }, name), ...Array.from({ length: Math.min(P.bout.left, 10) }, () => h("i", { class: "bout-dot" })));
      dots.title = `瘋狂發作：${name}，還剩 ${P.bout.left} 個動作`;
    } else dots.replaceChildren();
  }
}

// ---------- 燈光、身體狀態 ----------
export function mixHex(a, b, t) {
  const pa = a.match(/\w\w/g).map(x => parseInt(x, 16)), pb = b.match(/\w\w/g).map(x => parseInt(x, 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
export function applyBodyState() {
  const b = document.body, root = document.documentElement;
  const s = P ? P.sanity : 99;
  const free = !P || isFree(P);
  const t = free || s >= 70 ? 0 : (70 - s) / 70;
  root.style.setProperty("--wallNow", mixHex("4A1E26", "1E2832", t));
  root.style.setProperty("--dim", (t * 0.42).toFixed(3));
  b.classList.toggle("lowsan", !free && s < 40 && s > 0);
  b.classList.toggle("dark", !!(P && P.dark && !free) && UI.screen !== "ending");
  b.classList.toggle("bout", !!(P && P.bout));
  for (let i = 0; i < 10; i++) b.classList.toggle("bout-" + i, !!(P && P.bout && P.bout.i === i));
  FX.drag.shaky = !!(P && P.bout && P.bout.i === 1);
  b.classList.toggle("watching", !free && ((s < 40) || !!(P.bout && P.bout.i === 3)));
  if (!b.classList.contains("watching")) { root.style.setProperty("--gx", "0"); root.style.setProperty("--gy", "0"); }
  b.classList.toggle("free-mode", !!(P && free));
}
export function applySettings() {
  const s = SAVE.settings;
  FX.settings.muted = !!s.muted || !!UI.testMute; // UI.testMute：開發時的測試分頁不出聲（boot.js）
  const vol = s.vol || {};
  if (s.vol && !s.vol.touched && s.vol.amb === 70) s.vol.amb = 100; // 以前的預設是 70，沒拉過就跟著改成 100
  [["sfx", 100], ["amb", 100], ["heart", 100]].forEach(([k, d]) => { if (FX.sound.setVolume) FX.sound.setVolume(k, (vol[k] == null ? d : vol[k]) / 100); });
  if (FX.sound.sync) FX.sound.sync();
  FX.settings.reduceMotion = !!s.reduceMotion;
  document.body.classList.toggle("reduce-motion", !!s.reduceMotion);
  document.body.classList.remove("font-s", "font-m", "font-l");
  document.body.classList.add("font-" + (s.font || "m"));
  const sb = $("#soundBtn");
  if (sb) { sb.replaceChildren(icon(s.muted ? "mute" : "sound")); sb.setAttribute("aria-label", s.muted ? "打開聲音" : "靜音"); }
}

// ---------- 換畫面 ----------
export const HIDE_CHROME = ["title", "ending", "darkroom"];
export function go(name, params = {}, opts = {}) {
  clearTimers();
  clearHeld();
  // 擲完骰還沒按「就這樣」就離開：照現在的結果做好，不讓靈感白花
  const pm = UI.pendingMake;
  if (pm && !pm.done && P) {
    pm.done = true;
    const r = finishMake(P, pm.pick, { natural: pm.natural, spent: pm.spent, pushed: pm.pushed, fusion: pm.fusion || null });
    later(() => { note(`你離開前，作品已經做好放進收藏了：${describePepe(r.pick, { failed: r.failed }).full}`); showEvents(r.events); }, 300);
  }
  UI.pendingMake = null;
  const prev = UI.screen;
  // 換房間：上壹個房間留下的「忙碌中」一律清掉（11-08：看畫時發作「昏倒」「驚慌逃跑」「想看起源」直接換畫面，看畫的框沒關，忙碌中一直留著，之後看畫、翻禁書都沒反應）
  if (prev !== name) UI.busy = false;
  UI.screen = name; UI.params = params;
  document.body.dataset.screen = name;
  if (UI.net) NET.where(netRoom(name)); // 館友名單上的「在哪裡」
  if (P && P.news && P.news[name]) { delete P.news[name]; }
  // 新解開的東西：離開的房間把這次看過的小牌子拿掉；進來的房間導覽列的「新」消失、小牌子這次還在（同壹個畫面換頁籤不算進出）
  if (P && prev !== name) { leaveFreshRoom(P, prev); enterFreshRoom(P, name); }
  render();
  window.scrollTo(0, 0);
  // 換房間：木地板上兩步（標題、結局、黑房間不算）
  if (prev && prev !== name && P && !HIDE_CHROME.includes(name) && !HIDE_CHROME.includes(prev)) snd("steps");
  audioState();
  if (P && opts.action !== false && prev !== name && !HIDE_CHROME.includes(name) && name !== "settings") actionTick();
  if (P) persist();
}
export function render() {
  const room = $("#room");
  const chrome = !HIDE_CHROME.includes(UI.screen);
  $("#nav").hidden = !chrome; $("#status").hidden = !chrome || !P;
  document.body.classList.toggle("chrome", chrome);
  markNav();
  if (P) scanFresh(P, UI.screen); // 先看有沒有新東西，畫面上的小牌子才畫得到
  const screen = h("section", { class: "screen enter scr-" + UI.screen, "aria-label": ROOM_NAMES[UI.screen] || "" });
  // 動畫結束就拿掉 transform，不然裡面 position: fixed 的東西會被框在這一區
  screen.addEventListener("animationend", e => { if (e.target === screen) screen.classList.remove("enter"); });
  (SCREENS[UI.screen] || SCREENS.lobby)(screen, UI.params);
  room.replaceChildren(screen);
  updateStatus(true);
  applyBodyState();
}
export function rerender() { const y = window.scrollY; render(); window.scrollTo(0, y); }
// 每個動作：瘋狂發作倒數
export function actionTick() {
  const r = tickAction(P);
  if (r && r.ended) {
    const t = MADNESS_TEXT[r.ended.i];
    note(fill(t.end, r.ended.opt || ""), "good");
    applyBodyState();
    if (UI.screen !== "reveal") rerender();
  }
  updateStatus();
}

// ---------- 拿起來再放（鍵盤、手機點選的拖曳替代做法） ----------
export function holdItem(item, el) {
  clearHeld();
  UI.held = item;
  if (el) el.classList.add("held");
  document.body.classList.add("holding");
  note(`拿起「${itemTitle(item)}」，再點要放的地方（按 Esc 放下）`);
}
export function clearHeld() {
  UI.held = null;
  document.body.classList.remove("holding");
  $$(".held").forEach(e => e.classList.remove("held"));
}
export const typeOf = item => item.kind === "pillow" ? "pillow" : "pepe";
export function placeTarget(el, accepts, onDrop) {
  UI.cleanup.push(FX.makeDropTarget(el, { accepts, onDrop: (data, t, info) => onDrop(data, info) }));
  const tryHeld = () => {
    if (!UI.held || !accepts.includes(typeOf(UI.held))) return false;
    const r = onDrop(UI.held, null);
    if (r !== false) clearHeld();
    return true;
  };
  el.addEventListener("click", e => { if (tryHeld()) e.stopPropagation(); });
  el.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && tryHeld()) e.preventDefault(); });
  if (!el.hasAttribute("tabindex")) el.tabIndex = 0;
}

// ---------- 收藏列（橫向滑動，可以拖） ----------
export function collectionItems(kind) {
  if (kind === "repaired") return Object.keys(P.repaired || {}).map(key => ({ kind: "repaired", key, pick: fromKey(key) })).filter(i => i.pick);
  if (kind === "pepe") return Object.entries(P.pepes).sort((a, b) => (b[1].s || 0) - (a[1].s || 0)).map(([key, e]) => ({ kind: "pepe", key, pick: fromKey(key), perfect: !!e.perfect })).filter(i => i.pick);
  if (kind === "failed") return Object.keys(P.failed).map(key => ({ kind: "failed", key, pick: fromKey(key) })).filter(i => i.pick);
  return Object.keys(P.pillows).map(key => ({ kind: "pillow", key }));
}
export function collectionStrip(o) {
  const tabs = o.tabs || ["pepe", "failed", "pillow"];
  const names = { pepe: "佩佩", failed: "失敗作", pillow: "抱枕", repaired: "修復品" };
  let cur = o.start || tabs[0];
  let limit = 40;
  let sortBy = o.sorts ? o.sorts[0][0] : null; // o.sorts：[[id, 名字, 比較函式]]
  const filt = { 顏色: "", 姿勢: "" }; // 收藏列的篩選（翊文 11-08）：空字串 ＝ 全部
  const pickOf = it => it.kind === "pillow" ? ((parsePillowKey(it.key).print || {}).pick || null) : it.pick;
  const wrap = h("div", { class: "strip-wrap" });
  const head = h("div", { class: "strip-head" });
  const strip = h("div", { class: "strip", role: "list" });
  const fillStrip = () => {
    const all = collectionItems(cur);
    let items = all.filter(it => Object.entries(filt).every(([c, v]) => !v || (pickOf(it) || {})[c] === v));
    // 顏色、姿勢的下拉選單：只列出這個頁籤裡有的
    const filterSel = c => {
      const have = new Set(all.map(it => (pickOf(it) || {})[c]).filter(Boolean));
      if (have.size < 2 && !filt[c]) return null;
      const opts = allOpts(c).filter(n => have.has(n)).concat([...have].filter(n => !allOpts(c).includes(n)));
      const sel = h("select", { class: "strip-filter" + (filt[c] ? " on" : ""), "aria-label": "篩選" + c },
        h("option", { value: "" }, `${c}：全部`), ...opts.map(n => h("option", { value: n }, `${c}：${n}`)));
      sel.value = filt[c];
      sel.addEventListener("change", () => { filt[c] = sel.value; limit = 40; fillStrip(); });
      return sel;
    };
    const srt = o.sorts && o.sorts.find(s => s[0] === sortBy);
    if (srt && srt[2]) items = items.slice().sort(srt[2]);
    head.replaceChildren(
      h("span", { class: "strip-title" }, (o.titles && o.titles[cur]) || o.title || "你的收藏"), // o.titles：每個頁籤自己的標題（11-08，抱枕工作台）
      tabs.length > 1 ? h("div", { class: "seg" }, tabs.map(t => h("button", { type: "button", class: "seg-btn" + (t === cur ? " on" : ""), onClick: () => { cur = t; limit = 40; fillStrip(); } }, `${names[t]} ${collectionItems(t).length}`))) : null,
      o.sorts ? h("div", { class: "seg strip-sort" }, o.sorts.map(([id, label]) => h("button", { type: "button", class: "seg-btn" + (id === sortBy ? " on" : ""), onClick: () => { sortBy = id; fillStrip(); } }, label))) : null,
      h("div", { class: "strip-filters" }, filterSel("顏色"), filterSel("姿勢"), filt.顏色 || filt.姿勢 ? h("span", { class: "strip-count" }, `符合 ${items.length} 件`) : null),
      (o.hints && o.hints[cur]) || o.hint ? h("span", { class: "strip-hint" }, (o.hints && o.hints[cur]) || o.hint) : null);
    if (!items.length && all.length) { strip.replaceChildren(h("p", { class: "empty" }, "沒有符合篩選的。把上面的「顏色」「姿勢」改回「全部」看看。")); return; }
    if (!items.length) {
      strip.replaceChildren(h("p", { class: "empty" }, cur === "pillow" ? "還沒有抱枕，去抱枕工作台做一個。" : cur === "failed" ? `還沒有失敗作（擲出 ${NUM.fumbleFrom}–100 才會有）。` : "還沒有佩佩，去手作坊做一隻。"));
      return;
    }
    const els = items.slice(0, limit).map(item => {
      const rr = item.kind === "pillow" ? (parsePillowKey(item.key).print ? parsePillowKey(item.key).print.pick[ROLLED] : "普通") : item.kind === "failed" ? FAILED : item.kind === "repaired" ? "修復品" : item.pick[ROLLED];
      const hurt = item.kind === "pepe" && P.injured && P.injured[item.key];
      const el = h("button", { type: "button", class: "strip-item" + (o.selected && o.selected(item) ? " on" : "") + (item.perfect ? " perfect" : "") + (hurt ? " hurt" : "") + (o.meta ? " has-meta" : ""), role: "listitem", "aria-label": itemTitle(item), title: itemTitle(item), dataset: { r: rr } },
        h("span", { class: "si-art", html: itemHTML(item) }),
        o.meta ? o.meta(item) : null, // 每隻底下的小卡（地下收藏庫挑隊員用）
        item.kind !== "pillow" ? rdot(rr) : null, o.badge ? o.badge(item) : null, hurt ? h("span", { class: "si-hurt", title: "受傷了" }, "傷") : null);
      const pickIt = () => o.onPick ? o.onPick(item, el) : holdItem(item, el);
      if (o.drag) {
        UI.cleanup.push(FX.makeDraggable(el, { type: typeOf(item), data: item, panX: true, onTap: pickIt }));
        el.addEventListener("click", e => { if (e.detail === 0) pickIt(); }); // 鍵盤 Enter／空白鍵
      } else el.addEventListener("click", () => o.onPick && o.onPick(item, el));
      return el;
    });
    if (items.length > limit) els.push(h("button", { type: "button", class: "strip-more", onClick: () => { limit += 60; fillStrip(); } }, `還有 ${items.length - limit} 件`));
    strip.replaceChildren(...els);
  };
  strip.addEventListener("wheel", e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { strip.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  fillStrip();
  wrap.append(head, strip);
  wrap.refresh = fillStrip;
  return wrap;
}

// ---------- 每天的上限：寫在用得到的地方（翊文 11-08：「這些好像都沒有解釋」） ----------
// left 是 0 時變紅，提醒明天再來
// sub：第二行的小字（翊文 11-08：融合室那句太長、看不清楚 → 重點壹行、說明壹行）
export function limitPill(text, left, sub) {
  return h("div", { class: "day-limit" + (left === 0 ? " out" : "") }, icon("hourglass"), h("span", null, h("b", null, text), sub ? h("small", null, sub) : null));
}
export const miniPill = game => isFree(P) ? null : limitPill(miniLeft(P, game) ? `這個小遊戲今天還能拿 ${miniLeft(P, game)} 次靈感（每個小遊戲壹天 ${NUM.miniPerDay} 次）` : `這個小遊戲今天的靈感拿完了（壹天 ${NUM.miniPerDay} 次），明天再來`, miniLeft(P, game));

// ---------- 小問題（不是彈出視窗，從下方滑上來） ----------
export function ask(text, yes = "好", no = "不用") {
  return new Promise(res => {
    const done = v => { box.remove(); res(v); };
    const box = h("div", { class: "ask enter", role: "dialog", "aria-label": text },
      h("p", null, text), h("div", { class: "ask-btns" }, btn(yes, () => done(true), "primary"), btn(no, () => done(false), "ghost")));
    box.addEventListener("keydown", e => { if (e.key === "Escape") done(false); });
    document.body.append(box);
    box.querySelector("button").focus();
  });
}

// ---------- 事件提示（徽章、解鎖、新章節…） ----------
export async function showEvents(events) {
  // 新解開的東西先記在哪個房間（導覽列、大廳導覽圖、房間裡的小牌子），提示上也寫清楚去哪裡找（翊文 11-08）
  if (P) markFreshEvents(P, events, UI.screen);
  for (const e of events || []) {
    if (e.type === "badge") {
      P.news.codex = true; snd("unlock");
      const opens = badgeOpens(P, e.id); // 例如「四種心情」→ 手作坊的「黑」可以花靈感解鎖了
      note(`徽章「${e.name}」${e.insp ? `　+${e.insp} 靈感` : ""}：${freshWhere("codex", "badges")}看${opens.length ? `。手作坊的「${opens.join("」「")}」可以解鎖了` : ""}`, "good");
    }
    else if (e.type === "unlock") {
      snd("unlock");
      if (e.how === "myth") later(() => snd("eerie"), 350);
      const why = { myth: "佩佩神話打開了禁忌選項", free: "完美作品的獎勵", mutant: "突變", gift: "委託人送你", cellar: "地下收藏庫的獎勵", recipe: "配方" }[e.how] || "解鎖";
      const here = UI.screen === "workshop" ? "在這裡" : "在手作坊";
      const use = e.cat === ROLLED ? `${here}做佩佩時擲得到了` : `${freshWhere("workshop")}就能用`;
      note(`${why}：新的${e.cat}「${e.name}」，${use}（可能性 ${num(e.from)} → ${num(e.to)}）`, "good");
    }
    else if (e.type === "chapter") note(`起源室的書架上，第 ${e.id} 章亮了起來`, "good");
    else if (e.type === "exhibit") { later(() => snd("eerie", 0), 200); const ex = exhibitById(e.id); note(`畫廊多了一件展品：${ex ? ex.title : ""}`, "good"); }
    else if (e.type === "row") note(`「${e.opt}」整類全收集：理智 +${e.gain}（擲 ${diceWords(e.roll.spec)}）`, "good");
    else if (e.type === "theme") { const t = HALL_THEME_TEXT[e.id]; note(`展廳成立主題「${t ? t.name : e.id}」`, "good"); }
    else if (e.type === "insp") note(`${e.why}：+${e.gain} 靈感`, "good");
    else if (e.type === "recipe") { snd("bell"); note(`${fill(FUSION_TEXT.recipe, e.name)}${freshWhere("codex", "recipes")}看。`, "good"); P.news.codex = true; }
    else if (e.type === "key") {
      snd("unlock");
      const cat = e.key === "bg" ? "背景" : "手上拿的東西";
      note(`拿到「${cat}」的鑰匙：${UI.screen === "workshop" ? "這裡" : "手作坊"}多了「${cat}」頁（可能性 ${num(e.from)} → ${num(e.to)}，已知的組合變成 ${num(e.total)} 種）`, "good");
    }
    else if (e.type === "book") {
      snd("eerie", 0);
      const title = e.title || (BOOK4 && e.id === BOOK4.id ? BOOK4.title : ""); // 地下收藏庫 B2 給的那本，事件裡沒有書名
      note(title ? `起源室的禁書架上，多了壹本書：《${title}》` : "起源室的禁書架上，多了壹本書。", "good", 7000);
    }
    // floor（地下收藏庫下壹層開放）：走完那層的牌子已經寫了「繼續往下到 B…」，不另外跳提示，只在樓層牌子上標「新」
  }
  updateStatus();
  persist();
  await checkEnding();
}
export async function checkEnding() {
  if (!P) return;
  if (P.dark && !isFree(P)) { if (UI.screen !== "darkroom" && UI.screen !== "ending") { await wait(400); go("darkroom", {}, { action: false }); } return; }
  const e = endingDue(P);
  if (e && e !== "russia8" && UI.screen !== "ending") { await wait(900); go("ending", { id: e }, { action: false }); }
}

// ---------- 骰子寫法換成白話（翊文 11-08：「扣理智的那些方法計算可以再簡單解說一點嗎，好像有點複雜」） ----------
// 介面上不再出現「1/1D6」「d100」這種寫法，壹律用這三個：
//   diceWords("1D6") → "1～6"、diceWords("2D6") → "2～12"、diceWords("3") → "3"
//   sanWords("1/1D6") → "成功扣 1 點，失敗扣 1～6 點"；sanWords("0/1D3") → "成功不扣，失敗扣 1～3 點"
//   sanShort("1/1D8") → "成功 −1、失敗 −1～8"（牌子、按鈕上字少的地方用）
export function diceWords(expr) { const p = parseDice(expr); return p.m ? (p.n === 1 ? `1～${p.m}` : `${p.n}～${p.n * p.m}`) : String(p.flat); }
export function sanWords(spec) { const [a, b] = splitSan(spec); const one = x => { const w = diceWords(x); return w === "0" ? "不扣" : `扣 ${w} 點`; }; return `成功${one(a)}，失敗${one(b)}`; }
export function sanShort(spec) { const [a, b] = splitSan(spec); const one = x => { const w = diceWords(x); return w === "0" ? "不扣" : ` −${w}`; }; return `成功${one(a)}、失敗${one(b)}`; }

// ---------- 理智檢定的完整流程（系統 F） ----------
export async function sanFlow(spec, src, title, o = {}) {
  if (!P || isFree(P)) return null;
  const r = sanCheck(P, spec, src);
  const sub = `${title}：擲 1～100，擲出 ≤ ${P.sanity}（你現在的理智）就算成功。${sanWords(spec)}。`;
  const lossText = r.loss === 0 ? "理智沒有掉" : `理智 −${r.loss}`;
  const out = r.success ? `成功。${lossText}` : `${r.fumble ? "大失敗！" : "失敗。"}${lossText}${r.lossRoll.flat ? "" : `（在 ${diceWords(r.expr)} 裡擲出 ${r.lossRoll.total}）`}`;
  snd("sanPre");
  await FX.rollOverlay({ title: "理智檢定", sub, spec: "d100", result: r.roll, hold: String(src || "").startsWith("book:") ? 6000 : undefined, outcome: { text: out + (r.habituated ? "　" + SAN_ASIDES.habituated : ""), tone: r.success ? "good" : "bad", sound: r.success ? "sanOk" : "sanBad" } });
  let loss = r.loss;
  if (o.occult && loss > 0 && hasTalent(P, "神秘學")) {
    const sc = skillCheck(P, "神秘學");
    note(`神秘學 ${sc.roll.total} ≤ ${sc.target}？${sc.success ? "成功：你知道該往哪裡看，損失減半" : "失敗"}`, sc.success ? "good" : "neutral");
    if (sc.success) loss = Math.ceil(loss / 2);
  }
  if (!r.success && loss >= 2 && P.mood >= halveCost(loss)) {
    if (await ask(`花 ${halveCost(loss)} 點心情，把這次掉的理智減半（${loss} → ${halved(loss)}）？`, "減半", "不用")) {
      P.mood -= halveCost(loss); loss = halved(loss);
    }
  }
  const res = { r, loss, ev: null, involuntary: null };
  res.ev = await lossFlow(loss, src, o, () => {
    if (!r.success && !o.noInvoluntary) {
      const inv = involuntary(P);
      res.involuntary = inv;
      note(INVOLUNTARY[inv], "bad");
      return inv === "blink" ? (async () => { document.body.classList.add("blink"); await wait(1100); document.body.classList.remove("blink"); })() : null;
    }
    return null;
  });
  return res;
}
// 扣理智之後：歸零、看懂檢定、瘋狂發作、怪癖（直接扣理智的地方也走這裡）
export async function lossFlow(loss, src, o = {}, beforeTemp) {
  const ev = applySan(P, loss, src);
  if (loss) { FX.floatText(o.anchor || { x: innerWidth / 2, y: innerHeight / 2 }, `理智 −${loss}`, "bad"); snd("sanDrop", loss); }
  updateStatus(); applyBodyState(); persist();
  if (ev.zero) { snd("lightsOut"); note(SAN_ASIDES.bottomedOut, "bad"); await checkEnding(); return ev; }
  if (beforeTemp) { const p = beforeTemp(); if (p) await p; }
  if (ev.temp) {
    const u = understandCheck(P);
    await FX.rollOverlay({ title: "看懂檢定", sub: `壹次掉了 ${loss} 點，掉太多了。再擲壹次，看你「看懂了沒」：擲出 ≤ ${u.target} 就是看懂了，會暫時發瘋；擲得比它大就沒事。（50＋佩佩神話，懂得越多越容易看懂）`, spec: "d100", result: u.roll,
      outcome: { text: u.success ? "你看懂了。" : "你沒看懂。暫時沒事。", tone: u.success ? "bad" : "good" } });
    if (u.success) { await understandFlow(src || o.uk); await boutFlow(); }
  }
  if (ev.indef) {
    const g = gainQuirk(P);
    if (g) await quirkGainFlow(g); // 11-08：原本只有壹則提示，改成蓋壹張卡片
  }
  updateStatus(); applyBodyState(); persist();
  return ev;
}
// ---------- 怪癖：效果寫清楚、得到時大大地顯示（翊文 11-08：「這類型獲得的也要顯示明顯一點」） ----------
// 回傳 [[tone, 句子], ...]；good＝對你有利（綠）、bad＝不利（紅）
export function quirkEffects(q) {
  if (q.type === "mania") {
    const c = NUM.costPepe;
    return [["good", `做「${q.opt}」的佩佩：少花 1 靈感（${c} → ${c - 1}）`], ["bad", `做其他的佩佩：多花 1 靈感（${c} → ${c + 1}）`]];
  }
  return [["bad", q.opt ? `手作坊不敢選「${q.opt}」：可能性變少` : `「${q.cat}」只敢選「${baseOpts(q.cat)[0]}」：可能性變少`]];
}
// ---------- 怪癖的治法：做完壹件事就好，不然 NUM.quirkMinutes 分鐘後自己消失（翊文 11-08，決定 0027；原本是連續 3 天抱抱枕） ----------
// 規則在 shared/logic.js（q.task、q.until、cureByTask、expireQuirks）；文字在 content3.js 的 QUIRK_TASK_TEXT
export const QUIRK_TASK_ICON = { hug: "pillow", deliver: "commission", calm: "gallery" };
// 「到畫廊看壹幅不可怕的畫就好了。」；這個怪癖沒有治法（得到時都做不到）是空字串
export function quirkCureText(q) {
  const t = q && QUIRK_TASK_TEXT[q.task];
  return t ? `到${t.where}${t.act}就好了。` : "";
}
// 再說清楚壹點：不可怕的畫寫出是哪幾幅
export function quirkHint(q) {
  const t = q && QUIRK_TASK_TEXT[q.task];
  if (!t) return "";
  return q.task === "calm" ? fill(t.hint, calmExhibits(P).map(ex => `「${ex.title}」`).join("、")) : t.hint;
}
// 剩幾分鐘：fmt "s"＝「18 分」（狀態列）、"n"＝「18 分鐘」（接在句子裡）、其他＝「還剩 18 分鐘」。data-until 讓 refreshQuirkLeft 每分鐘換字，不用重畫畫面
export function quirkLeftText(q, fmt, now = nowMs()) { const n = quirkMinsLeft(q, now); return fmt === "s" ? `${n} 分` : fmt === "n" ? `${n} 分鐘` : `還剩 ${n} 分鐘`; }
export function quirkLeftNode(q, fmt = "l") {
  return h("span", { class: "qk-left", dataset: { until: String(q.until), fmt } }, quirkLeftText(q, fmt));
}
export function refreshQuirkLeft() {
  const now = nowMs();
  $$(".qk-left[data-until]").forEach(el => { const t = quirkLeftText({ until: Number(el.dataset.until) }, el.dataset.fmt, now); if (el.textContent !== t) el.textContent = t; });
}
// 卡片（得到時蓋的、狀態列點開的、館長室名片上的）：效果、怎麼治好、剩幾分鐘
export function quirkCard(q) {
  const t = QUIRK_TASK_TEXT[q.task];
  return h("div", { class: "quirk-card " + q.type },
    h("div", { class: "qk-head" }, icon("eye"), h("b", { class: "qk-name" }, quirkName(q)), h("span", { class: "qk-type" }, q.type === "mania" ? "狂熱" : "恐懼症")),
    h("p", { class: "qk-flavor" }, fill(QUIRK_TEXT[q.type].gain, q.opt || q.cat)),
    h("ul", { class: "qk-fx" }, quirkEffects(q).map(([tone, s]) => h("li", { class: tone }, s))),
    t ? h("p", { class: "qk-cure" }, icon(QUIRK_TASK_ICON[q.task] || "check"), h("span", null, h("b", null, "怎麼治好："), quirkCureText(q), h("small", { class: "qk-hint" }, quirkHint(q)))) : null,
    h("p", { class: "qk-time" }, icon("hourglass"), h("span", null, h("b", null, t ? "沒做的話：" : "等它過去："), quirkLeftNode(q), "，時間到自己消失。")));
}
// 房間裡壹塊說明：在這裡做得到哪些怪癖的治法（抱枕工作台、委託櫃台、畫廊）
export function quirkHereBox(task) {
  if (!P || isFree(P)) return null;
  const qs = activeQuirks(P).filter(q => q.task === task);
  if (!qs.length) return null;
  const t = QUIRK_TASK_TEXT[task];
  return h("div", { class: "qk-here", role: "note" }, icon(QUIRK_TASK_ICON[task] || "check"),
    h("div", { class: "qk-here-lines" }, qs.map(q => h("span", null, h("b", null, `在這裡${t.act}，就能治好「${quirkName(q)}」`), "（不然 ", quirkLeftNode(q, "n"), "後也會自己消失）。")),
      h("small", null, quirkHint(qs[0]))));
}
// 治好了：壹個壹則提示（hug、deliver、viewExhibit 回傳的 cured）
export function noteCured(list) {
  (list || []).forEach(c => note(`治好了「${quirkName(c.quirk)}」：${c.to !== c.from ? `可能性 ${num(c.from)} → ${num(c.to)}` : fill(QUIRK_TEXT[c.quirk.type].cure, c.quirk.opt || c.quirk.cat)}`, "good"));
}
// 時間到（boot.js 的 tick 每秒叫）：拿掉、跳提示；有用到怪癖的房間，等沒有視窗蓋著時重畫壹次。
// 剩幾分鐘：每秒看壹下，只有數字變了才換字（所以畫面上壹分鐘換壹次）。不重畫畫面。
// 不能只在「時鐘換分」時才換：每個怪癖到期的秒數不壹樣，那樣同壹個畫面上會差 1 分鐘
export const QUIRK_SCREENS = ["workshop", "office", "pillow", "commission", "gallery"];
export function quirkTick() {
  if (!P || isFree(P)) return;
  const gone = expireQuirks(P);
  if (gone.length) {
    gone.forEach(g => note(`「${quirkName(g.quirk)}」自己消失了。${fill(QUIRK_TEXT[g.quirk.type].cure, g.quirk.opt || g.quirk.cat)}`, "good"));
    UI.quirkRedraw = QUIRK_SCREENS.includes(UI.screen);
    updateStatus(); persist();
  }
  if (UI.quirkRedraw && !UI.busy && UI.screen !== "reveal" && !$(".mini-layer") && !$(".fx-overlay")) {
    UI.quirkRedraw = false;
    if (QUIRK_SCREENS.includes(UI.screen)) rerender();
  }
  refreshQuirkLeft();
}
export function quirkLayer(title, sub, body, cls = "qk-modal", okText = "知道了") {
  return new Promise(res => {
    const m = miniLayer(title, sub);
    m.card.classList.add(cls);
    const close = () => { m.close(); res(); };
    m.card.append(...body, btn(okText, close, "primary"));
    m.layer.addEventListener("click", e => { if (e.target === m.layer) close(); });
    m.card.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
    m.card.querySelector(".btn.primary").focus();
  });
}
// 得到怪癖：蓋壹張卡片在畫面上
export function quirkGainFlow(g) {
  snd("eerie");
  return quirkLayer("你得到了怪癖", "壹天內掉的理智，超過了當天理智的 1/5。",
    [quirkCard(g.quirk), g.to !== g.from ? h("p", { class: "qk-poss" }, `可能性 ${num(g.from)} → ${num(g.to)}`) : null]);
}
// 狀態列的怪癖小牌子：點了看全部怪癖
export function showQuirks() {
  if (!P || !activeQuirks(P).length) return;
  return quirkLayer("你的怪癖", `做完卡片上寫的那件事就好；沒做的話，${NUM.quirkMinutes} 分鐘後自己消失。館長室的參觀者名片也看得到。`, activeQuirks(P).map(q => quirkCard(q)));
}
// 手作坊：做這隻會因為怪癖多花或少花幾靈感
export function quirkMakeBox(pick) {
  if (!P || isFree(P) || !activeQuirks(P).length) return null;
  return h("div", { class: "qm-box", role: "note" }, activeQuirks(P).map(q => {
    const name = h("b", { class: "qm-name" }, icon("eye"), quirkName(q));
    if (q.type !== "mania") return h("div", { class: "qm-row bad" }, name, h("span", { class: "qm-fx" }, quirkEffects(q)[0][1])); // 恐懼症的治法寫在卡片上面的 afraidBar
    const hit = pick[q.cat] === q.opt;
    return h("div", { class: "qm-row " + (hit ? "good" : "bad") }, name,
      h("span", { class: "qm-fx" }, hit ? `這隻是「${q.opt}」：少花 1 靈感！` : `這隻不是「${q.opt}」：多花 1 靈感`),
      hit ? null : h("span", { class: "qm-tip" }, `換成「${q.opt}」只要 ${NUM.costPepe - 1} 靈感`),
      h("span", { class: "qm-tip" }, quirkCureText(q) ? `${quirkCureText(q)}不然 ` : "", quirkLeftNode(q, "n"), "後自己消失。")); // 狂熱的治法（11-09，決定 0027）
  }));
}
// 看懂了什麼（翊文 11-08）：蓋壹張紫色的卡片，再發作；第壹次看懂的記進起源室的《看懂的事》
export function understandFlow(src) {
  const u = understandLine(P, src);
  if (u.isNew) { markFresh(P, "origin", FRESH_KEY.understood, UI.screen); markFreshNav(); } // 起源室書架上的《看懂的事》多了壹件
  persist();
  snd("eerie", 2);
  return quirkLayer("你看懂了", u.from ? `來自：${u.from}` : "", [
    h("p", { class: "uk-text" }, ptNode(u.text)),
    h("p", { class: "uk-note" }, u.isNew ? `這件事記進了起源室書架上的《看懂的事》（${u.n}／${u.total}）。` : u.id ? "你早就看懂過這件事了。只是又想起來了。" : "這件事太大了，記不下來。"),
  ], "uk-modal", "我寧可沒看懂");
}
export async function boutFlow() {
  const b = startBout(P);
  const t = MADNESS_TEXT[b.bout.i];
  await FX.rollOverlay({ title: "瘋狂發作", sub: "擲 1D10 查表", spec: "1D10", result: b.roll, outcome: { text: `${b.roll.total}．${t.name}　${fill(t.start, b.bout.opt || "")}`, tone: "bad" } });
  applyBodyState(); updateStatus(); persist();
  const i = b.bout.i;
  if (i === 4) { await wait(500); go("origin", {}, { action: false }); }
  else if (i === 5) { document.body.classList.add("faint"); await wait(1300); document.body.classList.remove("faint"); go("lobby", {}, { action: false }); }
  else if (i === 6) { document.body.classList.add("flee"); await wait(650); document.body.classList.remove("flee"); go("lobby", {}, { action: false }); }
  else if (UI.screen !== "gallery" && UI.screen !== "origin") rerender();
  return b;
}

// ---------- 視線（理智低、偏執時，展品轉頭看你） ----------
export function trackGaze(e) {
  const x = e.clientX, y = e.clientY;
  const root = document.documentElement;
  root.style.setProperty("--mx", x + "px");
  root.style.setProperty("--my", y + "px");
  if (!document.body.classList.contains("watching")) return;
  root.style.setProperty("--gx", ((x / innerWidth - 0.5) * 2).toFixed(2));
  root.style.setProperty("--gy", ((y / innerHeight - 0.5) * 2).toFixed(2));
}

// ---------- 從別的檔搬過來的（第 4 版：讓 ui_core 不必 import 後面的檔） ----------
// 以前是「遊戲裡一天玩幾分鐘」（設定頁的「壹天多長」）。11-09 起一律真實的一天（決定 0019），永遠回 0（＝真實的一天）。
// 留著是給還在叫它的地方；SAVE.settings.dayMin 也留著，只是不用
export const dayMins = () => 0;
// 小遊戲共用的框（原本在 ui_screens2.js）
export function miniLayer(title, sub) {
  const card = h("div", { class: "mini-card enter", role: "dialog", "aria-label": title }, h("h2", null, title), h("p", { class: "sub" }, sub));
  const layer = h("div", { class: "mini-layer" }, card);
  document.body.append(layer);
  return { layer, card, close: () => layer.remove() };
}
