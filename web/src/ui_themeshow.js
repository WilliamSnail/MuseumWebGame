// ================================================================
//  主題展辦完的畫面（決定 0035，docs/每週劇情.md 第十節）。規則在 shared/themeshow.js，樣式在 css/themeshow.css。
//  這個檔放：
//    展廳：牆下面的展期、三級和獎勵（ADDONS.hallShow）、牆上的海報、主題小卡上的獎牌（ADDONS.themeCard）
//    本週特展：到金拿什麼（ADDONS.weeklyShow）
//    手作坊：帽子那頁的一行字（ADDONS.hatNote）
//    起源室：書架的「策展」頁籤（ADDONS.curateShelf、ADDONS.curateCounts）
//    每次 updateStatus：看展期、換週，辦完蓋一張卡（HOOKS.themeShow）
//  ui_core 不能 import 這個檔（它在後面）：這裡把自己登記進 ui_core 的 ADDONS、HOOKS。
//  提示用現有的 note()，不亮小紅點；只有新的手記標「新」（跟每週劇情的新書一樣）。
//  介面上的字照第 1 代用「壹」。
// ================================================================
import { LIMITED_ITEMS, NUM } from "../../shared/config.js";
import { HALL_THEME_TEXT } from "../../shared/content.js";
import { WEEKLY_TEXT } from "../../shared/content3.js";
import { isFresh, markFresh, markFreshEvents } from "../../shared/fresh.js";
import { isFree, isUnlocked, todayStr } from "../../shared/logic.js";
import { limitedInfo, ownsLimited } from "../../shared/signin.js";
import { SHOW_NOTES, SHOW_POSTER_PICK, SHOW_THEMES, SHOW_TIER_NAME, hasShowPending, noteCounts, noteOpen, noteRead, readShowNote, showBox, showHintDue, showItemOf, showPosters, showRewards, showStatus, showTiers, showTitle, syncShow, takeShowPending, weekGold, weekItemOf } from "../../shared/themeshow.js";
import { ART } from "./art.js";
import { $$, ADDONS, HOOKS, P, UI, btn, freshMark, go, h, icon, later, miniLayer, note, persist, rerender, snd, updateStatus } from "./ui_core.js";
import { bookReader } from "./ui_screens1.js";
import { itemArt, useNow } from "./ui_signin.js";
import { shelfRow } from "./ui_story.js";

const on = () => !!(P && !isFree(P));
const themeName = t => (HALL_THEME_TEXT[t] || { name: t }).name;
const fullName = t => showTitle(themeName(t));
const md = d => (d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : "");
const busy = () => UI.busy || document.querySelector(".mini-layer, .ask, .nb-layer, .fx-overlay, .fx-roll-card, .fx-spot-card, .m-door");
const rewardWord = r => (r.kind === "mood" ? `心情 +${r.n}` : r.kind === "insp" ? `靈感 +${r.n}` : r.id ? limitedInfo(r.id).name : "限定配件");

// ---------- 每次 updateStatus：展期、換週 ----------
let pumpTimer = null, panelEl = null, panelKey = "", pendNoted = false;
const statusKey = today => { const st = showStatus(P, today); return [st.theme, st.day, st.score, st.doneTier, st.prev ? st.prev.theme : ""].join("|"); };
function showTick() {
  if (!on() || !P.day || UI.screen === "title" || UI.screen === "ending") return;
  const today = todayStr();
  const ev = syncShow(P, today);
  ev.forEach(e => {
    if (e.type === "showReset") note(`「${fullName(e.theme)}」換下來了（本來是第 ${e.day} 天）：今天換回來還能接著算，明天就重算。`, "bad", 8000);
    else if (e.type === "showBack") note(`換回「${fullName(e.theme)}」了：接著算，第 ${Math.min(e.day, NUM.show.days)}／${NUM.show.days} 天。`, "good");
  });
  if (ev.length) persist();
  if (UI.screen === "lobby" || UI.screen === "hall") {
    const st = showHintDue(P, today);
    if (st) { note(`${fullName(st.theme)}：再 1 天就辦完了（現在 ${st.score} 分${st.tier ? `，${SHOW_TIER_NAME[st.tier]}` : ""}）。`, "good", 8000); persist(); }
  }
  // 待在展廳過 05:00、分數變了（展廳不會自己重畫）：展期那一塊換新
  if (UI.screen === "hall" && panelEl && panelEl.isConnected && panelKey !== statusKey(today)) { const fresh = showPanel(); panelEl.replaceWith(fresh); panelEl = fresh; }
  pump();
}
// 辦完的卡片：等畫面有空（沒有別的框蓋著）、在大廳或展廳才蓋上來；一次登入最多自動跳 2 個視窗的規矩照舊，超過就等走進展廳
function pump() {
  if (pumpTimer) return;
  if (!hasShowPending(P)) { pendNoted = false; return; }
  const ready = window.__PM_NODOOR__ || UI.boardAutoDone; // 公佈欄、簽到先
  const here = UI.screen === "hall" || (UI.screen === "lobby" && ready && (UI.autoPopups || 0) < 2);
  // 這裡不能蓋卡片（別的房間、今天自動跳的視窗夠多了）：提示壹次，走進展廳才蓋
  if (!here && ready && !pendNoted && !busy()) { pendNoted = true; note("有壹場展覽辦完了：走進展廳看看。", "good", 8000); }
  if (!here || busy()) { pumpTimer = setTimeout(() => { pumpTimer = null; if (on()) pump(); }, 1500); return; }
  const e = takeShowPending(P);
  if (!e) return;
  persist();
  if (UI.screen === "lobby") UI.autoPopups = (UI.autoPopups || 0) + 1;
  if (e.type === "showDone") doneCard(e);
  else if (e.type === "weekDone") weekDoneFlow(e);
}
const gainLine = (g, close) => {
  if (g.kind === "mood") return h("li", { class: "ts-gain" }, icon("heart"), h("span", null, `心情 +${g.n}`));
  if (g.kind === "insp") return h("li", { class: "ts-gain" }, icon("sparkle"), h("span", null, `靈感 +${g.n}`));
  const it = limitedInfo(g.id);
  return h("li", { class: "ts-gain item" }, h("span", { class: "sg-item-art", html: itemArt(g.id), "aria-hidden": "true" }),
    h("span", { class: "ts-gain-t" }, h("b", null, it.name), h("small", null, g.dup ? `已經有了，換成靈感 +${g.insp}` : it.desc)),
    g.dup ? null : btn(["馬上使用 ", h("span", { "aria-hidden": "true" }, "→")], () => useNow(g.id, close), "primary small"));
};
// 辦完壹場
function doneCard(e) {
  markFreshEvents(P, e.events, UI.screen); // 手作坊的「新」
  if (e.note) markFresh(P, "origin", "show:" + e.theme, UI.screen); // 書架的「新」
  if (!e.up && !e.first) { // 再辦壹場、沒有比以前高：不蓋卡片
    note(`${fullName(e.theme)}又辦完壹場（${SHOW_TIER_NAME[e.tier]}，${e.score} 分）。這壹級拿過了，到 ${showTiers(e.theme)[e.tier]} 分才有新的。`, "good", 8000);
    later(pump, 400);
    return;
  }
  snd("bell");
  const m = miniLayer(`${fullName(e.theme)}辦完了`, `連續 ${NUM.show.days} 天，閉展那天 ${e.score} 分。牆上會留壹張海報。`);
  m.card.classList.add("ts-card");
  const close = () => { m.close(); persist(); updateStatus(); if (UI.screen === "hall") rerender(); later(pump, 300); }; // 展廳：海報、獎牌換新
  m.card.append(h("div", { class: "ts-medal t" + e.tier, "aria-label": `${SHOW_TIER_NAME[e.tier]}級` }, SHOW_TIER_NAME[e.tier]),
    e.gains.length ? h("ul", { class: "ts-gains" }, e.gains.map(g => gainLine(g, close))) : null,
    e.note ? h("p", { class: "ts-note-line" }, icon("book"), h("span", null, `策展手記多了壹篇：〈${SHOW_NOTES[e.theme].title}〉（起源室的「策展」）`)) : null,
    e.tier < 3 ? h("p", { class: "sub" }, `掛著不動就是下壹場：再 ${NUM.show.days} 天，到 ${showTiers(e.theme)[e.tier]} 分拿${SHOW_TIER_NAME[e.tier + 1]}。`) : null,
    h("div", { class: "ts-card-btns" },
      e.note ? btn("讀策展手記", () => { close(); go("origin", { tab: "curate", note: e.theme }); }, e.gains.some(g => g.kind === "item") ? "small" : "primary small") : null,
      btn("先收著", close, "ghost small")));
  updateStatus();
}
// 換週：上週的特展
function weekDoneFlow(e) {
  const T = WEEKLY_TEXT[e.theme] || { name: e.theme };
  markFreshEvents(P, e.events, UI.screen);
  if (!e.got) { note(`上週的特展「${T.name}」最高 ${e.best} 分，差 ${e.need - e.best} 分到金。`, "neutral", 8000); later(pump, 400); return; }
  snd("bell");
  const m = miniLayer(`上週的特展到金了`, `「${T.name}」最高 ${e.best} 分。`);
  m.card.classList.add("ts-card");
  const close = () => { m.close(); persist(); updateStatus(); later(pump, 300); };
  m.card.append(h("div", { class: "ts-medal t3", "aria-label": "金級" }, "金"), h("ul", { class: "ts-gains" }, gainLine({ kind: "item", id: e.item, dup: e.dup, insp: e.insp }, close)), h("div", { class: "ts-card-btns" }, btn("先收著", close, "ghost small")));
  updateStatus();
}

// ---------- 展廳 ----------
function tierTrack(st, theme) {
  const tiers = showTiers(theme), rs = showRewards(theme);
  const bar = h("div", { class: "ts-bar", role: "img", "aria-label": `現在 ${st.score} 分` }, h("i", { style: { width: Math.min(100, st.score) + "%" } }),
    tiers.map((t, k) => h("span", { class: "ts-tick" + (st.score >= t ? " on" : ""), style: { left: t + "%" } }, h("b", null, SHOW_TIER_NAME[k + 1]))));
  const chips = rs.map(r => h("div", { class: "ts-chip t" + r.tier + (st.doneTier >= r.tier ? " got" : "") + (st.tier >= r.tier ? " lit" : "") },
    h("span", { class: "ts-chip-h" }, `${SHOW_TIER_NAME[r.tier]} ${tiers[r.tier - 1]} 分`),
    h("span", { class: "ts-chip-r" }, rewardWord(r), st.doneTier >= r.tier ? h("i", { class: "ts-ok", html: ART.icon("check"), "aria-label": "拿過了" }) : null)));
  return [bar, h("div", { class: "ts-chips" }, chips)];
}
function showPanel() {
  const today = todayStr(), st = showStatus(P, today), days = NUM.show.days;
  panelKey = statusKey(today);
  const box = h("section", { class: "ts-panel", "aria-label": "主題展的展期" });
  const prev = st.prev ? h("p", { class: "ts-prev" }, `今天換下了「${fullName(st.prev.theme)}」（本來是第 ${st.prev.day} 天）：今天換回來還能接著算，明天就重算。`) : null;
  if (!st.theme) {
    box.classList.add("idle");
    box.append(h("p", { class: "ts-idle" }, h("b", null, "辦壹場主題展："), `牆上同壹個主題掛滿 ${days} 天，分數到 ${NUM.show.tiers[0]} 以上，就算辦完。銅給心情，銀給靈感，金給限定配件；還有壹篇策展手記。`), prev || "");
    return box;
  }
  const head = h("div", { class: "ts-head" },
    h("b", { class: "ts-name" }, st.maxed ? fullName(st.theme) : `${fullName(st.theme)}：第 ${st.day}／${days} 天`),
    st.maxed ? null : h("span", { class: "ts-pips", "aria-hidden": "true" }, Array.from({ length: days }, (_, i) => h("i", { class: i < st.day ? "on" : "" }))));
  const left = st.maxed ? "這個主題辦到金了。換壹個主題再辦壹場吧。"
    : st.waiting ? `展期夠了，分數還差 ${st.need}：到 ${showTiers(st.theme)[0]} 分就辦完。`
    : st.left === 1 ? `再 1 天就辦完了（明天 05:00 之後打開，照那時候的分數算）。`
    : `再 ${st.left} 天就辦完了。`;
  const now = st.tier ? `現在 ${st.score} 分，${SHOW_TIER_NAME[st.tier]}。` : `現在 ${st.score} 分，還不到銅。`;
  const next = !st.maxed && st.nextTier ? `到 ${showTiers(st.theme)[st.nextTier - 1]} 分是${SHOW_TIER_NAME[st.nextTier]}。` : "";
  box.append(head, h("p", { class: "ts-left" }, left), h("p", { class: "ts-now" }, now, next), ...tierTrack(st, st.theme),
    st.maxed ? null : h("p", { class: "ts-warn" }, "牆上的主題換掉就重算（同壹天換回來不算）。多擺兩隻傳說級，牆上會變成「傳說殿堂」。"), prev || "");
  return box;
}
// 海報：辦完的展覽壹個主題壹張。o.list：別人的展廳傳進來（之後館友參觀用）
function poster(p) {
  const pick = Object.assign({}, SHOW_POSTER_PICK[p.theme] || {}), failed = !!pick.failed;
  delete pick.failed;
  if (p.tier >= 3 && showItemOf(p.theme)) pick.帽子 = showItemOf(p.theme).opt; // 辦到金的海報：戴著那件配件
  return h("div", { class: `ts-poster p-${p.theme} t${p.tier}`, title: (HALL_THEME_TEXT[p.theme] || {}).wall || "" },
    h("span", { class: "ts-p-art", html: ART.frog(pick, { failed }), "aria-hidden": "true" }),
    h("b", null, themeName(p.theme)),
    h("small", null, `${SHOW_TIER_NAME[p.tier]}・${p.score} 分${p.date ? `・${md(p.date)}` : ""}`));
}
export function posterWall(list) {
  if (!list.length) return null;
  return h("div", { class: "ts-wall" }, h("p", { class: "ts-wall-h" }, `辦過的展覽 ${list.length}／${SHOW_THEMES.length}`), h("div", { class: "ts-posters" }, list.map(poster)));
}
function hallShow(wall) {
  if (!on()) return;
  showTick();
  panelEl = showPanel();
  wall.after(...[panelEl, posterWall(showPosters(P))].filter(Boolean));
}
function themeCard(id) {
  if (!on()) return null;
  const d = showBox(P).done[id];
  if (!d) return null;
  return h("p", { class: `ts-card-medal t${d.tier}` }, `辦過：${SHOW_TIER_NAME[d.tier]}（${d.score} 分）`);
}

// ---------- 本週特展 ----------
function weeklyShow(W) {
  if (!on()) return h("div");
  const it = weekItemOf(W.theme), need = weekGold(W.theme);
  const box = h("section", { class: "ts-panel week" });
  if (!it) { box.append(h("p", { class: "ts-idle" }, `這週特展的限定配件還在做。分數照樣記下來；到 ${need} 分就是金。`)); return box; }
  const info = limitedInfo(it.id), have = ownsLimited(P, it.id), ok = W.best >= need;
  box.append(h("div", { class: "ts-week" }, h("span", { class: "sg-item-art", html: itemArt(it.id), "aria-hidden": "true" }),
    h("div", null, h("b", { class: "ts-name" }, `到金（${need} 分）：${info.name}`),
      h("p", { class: "ts-left" }, ok ? "到金了！週日過完（週壹 05:00 換週）就拿得到。" : `這週最高 ${W.best} 分，還差 ${need - W.best} 分。週日過完（週壹 05:00 換週）照最高分算。`),
      have ? h("p", { class: "ts-now" }, `已經有了：到金換成靈感 +${NUM.signin.dupInsp}。`) : null)));
  return box;
}

// ---------- 手作坊 ----------
function hatNote() {
  const items = LIMITED_ITEMS.filter(x => x.from), got = items.filter(x => ownsLimited(P, x.id)).length;
  return h("p", { class: "card-note" }, `主題展限定配件 ${got}／${items.length}：主題展、每週特展辦到金才拿得到。耳環、項鍊、圍巾這些也戴在這壹頁，壹次戴壹樣。`);
}

// ---------- 起源室：策展手記 ----------
function themeKnown(t) { return t !== "russia8" || isUnlocked(P, "心情", "俄國8+9") || noteOpen(P, t); } // 還沒見過 8+9 的人不列（跟主題小卡壹樣）
function noteSpine(theme, reader) {
  const N = SHOW_NOTES[theme], open = noteOpen(P, theme), unread = open && !noteRead(P, theme);
  const el = h("button", { type: "button", class: "spine story" + (open ? "" : " locked sealed") + (unread ? " lit" : ""),
    "aria-label": open ? `〈${N.title}〉${unread ? "（還沒讀）" : ""}` : "還沒辦過的展覽的手記", dataset: { note: theme } },
  h("span", { class: "spine-t" }, open ? N.spine : "？"), open ? null : icon("lock"));
  freshMark(el, open && isFresh(P, "origin", "show:" + theme));
  el.addEventListener("click", () => {
    $$(".spine.on").forEach(x => x.classList.remove("on")); el.classList.add("on");
    openNote(theme, reader, el);
  });
  return el;
}
function openNote(theme, reader, el) {
  const N = SHOW_NOTES[theme];
  if (!noteOpen(P, theme)) {
    snd("eerie", 1);
    reader.replaceChildren(h("div", { class: "book sealed-book" }, h("h2", { class: "book-title" }, "這場展覽還沒辦過"), h("p", { class: "book-hint" }, icon("key"), " 怎麼打開"),
      h("p", { class: "sealed-hint" }, `在展廳把「${fullName(theme)}」掛滿 ${NUM.show.days} 天，分數到 ${showTiers(theme)[0]} 以上（銅）。`)));
    return;
  }
  bookReader(reader, N.title, N.pages, { onEnd: () => {
    readShowNote(P, theme, todayStr());
    if (el) el.classList.remove("lit");
    persist();
  } });
  const d = showBox(P).done[theme], book = reader.querySelector(".book");
  if (book && d) book.insertBefore(h("p", { class: "book-from" }, `策展手記・${SHOW_TIER_NAME[d.tier]}・最高 ${d.score} 分・辦完 ${d.runs} 場`), book.children[1] || null);
}
function curateShelf(reader, params) {
  if (!on()) return h("div", { class: "shelf story-shelf" }, h("span", { class: "shelf-label" }, "策展"), h("p", { class: "shelf-empty" }, "策展手記在挑戰模式裡。"));
  const list = SHOW_THEMES.filter(themeKnown);
  if (params.note && list.includes(params.note)) { const t = params.note; params.note = null; later(() => openNote(t, reader, document.querySelector(`.spine[data-note="${t}"]`)), 0); }
  return [shelfRow("curate", "策展手記", list.map(t => noteSpine(t, reader)))];
}
function curateCounts() {
  if (!on()) return [0, 0, 0];
  const [a, b] = noteCounts(P);
  return [a, b, SHOW_THEMES.filter(t => noteOpen(P, t) && isFresh(P, "origin", "show:" + t)).length];
}

ADDONS.hallShow = hallShow;
ADDONS.themeCard = themeCard;
ADDONS.weeklyShow = weeklyShow;
ADDONS.hatNote = hatNote;
ADDONS.curateShelf = curateShelf;
ADDONS.curateCounts = curateCounts;
HOOKS.themeShow = showTick;
