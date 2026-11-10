// ================================================================
//  每週劇情的畫面（規則在 shared/story.js；規劃 docs/每週劇情.md；內容 content/weeks/，格式 content/README.md）
//  這個檔放：
//    「每週劇情」面板（選單、大廳、公佈欄的「前往」打開）：本週、每日任務、每週任務、週章、背包、劇情線、劇情回顧
//    起源室書架的頁籤（館藏、禁書、主線、每週劇情、節日）和合訂本
//    畫廊的「今日特展」、地下收藏庫的「本週異狀」和這週多出來的房間
//    大廳的小卡、狀態列的「追蹤」那一行、公佈欄的「本週地下收藏庫」公告
//    賭場的每週收藏（決定 0042）：劇情面板的「本週賭場收藏」、劇情線裡的一條「賭場收藏」、集滿後的小故事放書架的「每週劇情」（畫法在 ui_casino_week.js）
//  舊的檔只加幾行接口：ui_core.js（HOOKS.status、選單、狀態列的格子）、ui_screens1.js（大廳、畫廊、起源室）、ui_screens3.js（地下收藏庫）。
//  ui_core 不能 import 這個檔（它在後面）：這裡把自己登記進 ui_core 的 PANELS、HOOKS。
//  介面上的字照第 1 代用「壹」。
// ================================================================
import { NUM } from "../../shared/config.js";
import { activeQuirks, isFree, nowMs, todayStr } from "../../shared/logic.js";
import { NOTICE_EXTRA } from "../../shared/notices.js";
import { casWkBase } from "../../shared/casino_week.js";
import { casWkDefFor } from "../../shared/casino_wallet.js";
import { isFresh, markFresh } from "../../shared/fresh.js";
import { LINE_KINDS, bookHint, bookState, claimDayBonus, claimSpot, claimTask, claimWeekBonus, dayBonusState, isoWeek, itemDesc, itemName, itemUsable, lineById, markLinesSeen, readStoryBook, rewardText, roomOpen, sanitizeSvg, seasonName, seasonOf, setStoryHolidayOf, shelfTabOf, seasonLines, spotClaimed, startStoryRoom, storyLibrary, storyLines, storyNotice, storyPastWeeks, storyState, storyWeek, syncStory, taskCount, taskDone, taskGo, taskTarget, taskText, todayOf, trackLine, unclaimed, useStoryItem, viewShowWork, weekBonusState, weekLeftText, weekReview } from "../../shared/story.js";
import { ART } from "./art.js";
import { understoodCard, markText, ptMark } from "./ui_core.js";
import { $$, ADDONS, HOOKS, P, PANELS, UI, btn, cicon, freshMark, freshTag, go, h, icon, later, markFreshNav, miniLayer, navTo, note, noteCured, persist, placard, ptNode, quirkHereBox, rerender, sanFlow, sanShort, sanWords, snd, updateStatus } from "./ui_core.js";
import { casebookView, clueNew, clueSync, understandView } from "../../shared/clues.js";
import { FRESH_KEY } from "../../shared/fresh.js";
import { overlay } from "./ui_board.js";
import { eventListBox } from "./ui_events.js";
import { CAS_WK, weekBox, wkGotCount, wkNextText } from "./ui_casino_week.js";
import { bookGain, bookReader, roomHead } from "./ui_screens1.js";
import { holidayOf } from "../../shared/holidays.js";

// 節日接上每週劇情（11-09）：那一天是節日，週包的那天就帶著節日（名字、節日的話、藝術品），書和公告可以提到它
setStoryHolidayOf(holidayOf);

// ---------- 內容：content/weeks/ 下面所有的 json（帳本 content/story/ 不在這裡，不打包進網頁） ----------
const RAW = import.meta.glob("../../content/weeks/**/*.json", { eager: true, import: "default" });
export const STORY_LIB = storyLibrary(Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k.split("/content/weeks/")[1], v])));

// 今天這一週（照 todayStr()，台灣時間 05:00 換日、週一 05:00 換週）。同一天同一個備用週就用同一份
let weekCache = { key: null, W: null };
export function weekFor(today) {
  const label = isoWeek(today), rec = P && P.story && P.story.weeks && P.story.weeks[label];
  const key = today + "|" + ((rec && rec.fb) || "");
  if (weekCache.key !== key) weekCache = { key, W: storyWeek(STORY_LIB, today, P) };
  return weekCache.W;
}
export function curWeek() { return P && !isFree(P) ? weekFor(todayStr()) : null; }
// 賭場的每週收藏（決定 0042）：某一週的內容（沒有就 null）。一週只整理一次
const casDefs = {};
export function casinoDefOf(label, fb) {
  const key = label + "|" + (fb || "");
  if (!(key in casDefs)) casDefs[key] = casWkDefFor(STORY_LIB, label, fb);
  return casDefs[key];
}
export const weekCasino = W => (W ? casinoDefOf(W.label, W.fallback) : null);
const on = () => !!(P && !isFree(P));

// ---------- 下一步、任務的「前往」 ----------
export function goStep(step) {
  if (!step) return;
  if (step.panel && PANELS[step.panel]) { PANELS[step.panel](step.params); return; }
  if (!step.room) { note(step.text || "明天 05:00 之後再來看看。"); return; }
  if (step.params) go(step.room, step.params); else navTo(step.room);
}

// ---------- 每次 updateStatus：看有沒有新的書、做完的任務（ui_core 的 HOOKS.status 叫） ----------
// 第一次（剛進館）不跳提示，只標「新」：新的一天的東西由公佈欄說
let warm = false, queue = [], ticking = false;
export function storyTick() {
  if (!on()) { trackBar(); return; }
  const W = curWeek();
  if (!W) { trackBar(); return; }
  const today = todayStr();
  const ev = syncStory(P, W, today);
  // 撿到線索：壹句很淡的話，不說是哪件事（剛進館補記的不說）。晚壹點再說，不然會被「讀完了」的提示蓋掉
  const picked = clueNew(P, STORY_LIB, today);
  if (picked.length) {
    persist();
    if (warm) setTimeout(() => note((picked.length > 1 ? "有幾個地方，你多看了壹眼。" : picked[0].text) + "（記進了疑點簿）"), 1200);
  }
  const sh = showToday();
  if (sh) {
    const box = (P.fresh && P.fresh.gallery) || {}, key = SHOW_FRESH(today);
    Object.keys(box).forEach(k => { if (k.startsWith("show:") && k !== key) delete box[k]; }); // 前幾天的不留
    if (sh.unseen && !(key in box)) { markFresh(P, "gallery", key, UI.screen); markFreshNav(); persist(); }
  }
  const seen = clueSync(P, STORY_LIB, today); // 線索 → 你看懂了（集齊才有事件）
  if (seen.length) { seen.forEach(() => markFresh(P, "origin", FRESH_KEY.understood, UI.screen)); markFreshNav(); cards.push(...seen); persist(); }
  if (ev.length) {
    ev.forEach(e => { if (e.type === "storyBook") markFresh(P, "origin", "story:" + e.book.id, UI.screen); });
    if (warm) queue.push(...ev);
    persist();
  }
  warm = true;
  trackBar();
  menuBadge(W);
  // 不用 later：換畫面時 later 的計時器會被取消，ticking 就卡住，之後的事件全部不見
  if (queue.length && !ticking) { ticking = true; setTimeout(flushEvents, 0); }
  showCards();
}
// 「你看懂了」壹張壹張來，按了才換下壹張（翊文 11-09：「看懂會說你看懂了什麼」）。
// 載入存檔時就會集齊，那時還在標題畫面，要等進到遊戲才跳，不然玩家看不到
var cards = [], carding = false;
async function showCards() {
  if (carding || !cards.length || UI.screen === "title") return;
  carding = true;
  try { while (cards.length) await understoodCard(cards.shift()); }
  finally { carding = false; }
}
function flushEvents() {
  ticking = false;
  const ev = queue; queue = [];
  const W = curWeek();
  if (!W) return;
  ev.forEach(e => {
    if (e.type === "storyBook") {
      const l = lineById(W, e.book.line);
      note(`書架多了壹本：〈${e.book.title}〉（起源室的「${shelfName(shelfTabOf(l))}」）`, "good", 7000);
    } else if (e.type === "storyTask") {
      snd("bell");
      note(`任務完成：${taskText(e.task, W)}。到「每週劇情」領獎勵。`, "good");
    } else if (e.type === "storySpot") {
      snd("unlock");
      const r = claimSpot(P, W, e.room.id, todayStr());
      note(`找到了：${e.room.title}${r.ok && rewardText(r.reward) ? `　${rewardText(r.reward)}` : ""}${r.ok && r.grown ? `（${r.grown.skill} ${r.grown.before} → ${r.grown.after}）` : ""}`, "good");
      if (r.ok && r.reward.items.length) itemsFlow(r.reward.items);
      updateStatus();
    }
  });
  persist();
}
// 《看懂的事》的「這些週看懂的」：已經看懂的、快看懂的（只有拿到部分線索才列，不給 text）。起源室的書用（shared/clues.js）
export function weekUnderstood() { return P && !isFree(P) ? understandView(P, STORY_LIB, todayStr()) : { done: [], near: [] }; }
// 選單裡「每週劇情」的數字：可以領的獎勵（有新的劇情線、下一步只亮小點）
function claimables(W) {
  if (!W || W.past) return 0;
  let n = unclaimed(P, W).length;
  W.days.forEach(d => { if (dayBonusState(P, W, d.n) === "ready") n++; });
  if (weekBonusState(P, W) === "ready") n++;
  const cv = CAS_WK.view; // 賭場收藏集滿了、週章還沒領（伺服器給的進度，拿到過才知道）
  if (cv && cv.week === W.label && cv.done && !cv.claimed && weekCasino(W)) n++;
  return n;
}
function menuBadge(W) {
  const el = document.querySelector(".md-story");
  if (!el) return;
  const n = claimables(W), fresh = linesNow(W).some(l => l.fresh);
  const b = el.querySelector(".md-badge");
  const t = n ? `${n} 個可以領` : fresh ? "有新的下壹步" : "";
  if (b && b.textContent !== t) b.textContent = t;
  el.classList.toggle("has-badge", !!t);
}
// 狀態列的「追蹤」那一行（點了走過去）
export function trackBar() {
  const el = document.getElementById("st-follow");
  if (!el) return;
  const W = on() ? curWeek() : null;
  const l = W ? linesNow(W).find(x => x.tracked) : null;
  if (!l || !l.next) { el.hidden = true; return; }
  const txt = `追蹤：${l.next.text}`;
  if (el.dataset.t !== txt) {
    el.dataset.t = txt;
    el.replaceChildren(icon("sparkle"), h("span", { class: "st-follow-t" }, txt));
    el.title = `〈${l.name}〉的下壹步：${l.next.text}${l.next.room || l.next.panel ? "（點了過去）" : ""}`;
    el.setAttribute("aria-label", el.title);
  }
  el.onclick = () => goStep(l.next);
  el.hidden = false;
}

// ---------- 領獎勵：拿到的東西可以「馬上使用」 ----------
function claimFlow(r, after) {
  if (!r.ok) { snd("error"); note(r.reason, "bad"); return; }
  snd("coin");
  note(`領到了：${rewardText(r.reward)}`, "good");
  updateStatus(); persist();
  if (r.reward.items && r.reward.items.length) itemsFlow(r.reward.items, after);
  else if (after) after();
}
function itemsFlow(ids, after) {
  const m = miniLayer("拿到了", "可以馬上使用，也可以先收著（收著的在「每週劇情」最下面的背包裡）。");
  m.layer.classList.add("sp-top");
  const close = () => { m.close(); if (after) after(); };
  const list = h("div", { class: "sp-gotlist" });
  const draw = () => list.replaceChildren(...ids.map((id, i) => {
    const can = itemUsable(P, id), used = list.dataset["u" + i];
    return h("div", { class: "sp-got" }, h("b", null, itemName(id)), h("small", null, itemDesc(id)),
      used ? h("span", { class: "sp-used" }, icon("check"), " ", used)
        : can.ok ? btn("馬上使用", () => { const u = useStoryItem(P, id); if (!u.ok) { note(u.reason, "bad"); return; } snd("unlock"); list.dataset["u" + i] = u.text; note(`用了${itemName(id)}：${u.text}`, "good"); updateStatus(); persist(); draw(); }, "primary small")
          : h("span", { class: "sp-keep" }, can.reason));
  }));
  draw();
  m.card.append(list, btn("收著，關掉", close, "ghost"));
  m.layer.addEventListener("click", e => { if (e.target === m.layer) close(); });
  m.card.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  const f = m.card.querySelector(".btn"); if (f) f.focus();
}

// ---------- 「每週劇情」面板 ----------
const SP_TABS = [["week", "本週"], ["lines", "劇情線"], ["case", "疑點簿"], ["review", "劇情回顧"]];
export function openStory(o = {}) {
  if (!P) return;
  if (isFree(P)) { note("每週劇情在挑戰模式裡。"); return; }
  const m = overlay("nb-story", "每週劇情", "每週劇情和劇情線", "book");
  let tab = SP_TABS.some(t => t[0] === o.tab) ? o.tab : "week";
  const draw = () => {
    storyTick();
    const W = curWeek(), S = storyState(P);
    const lines = W ? linesNow(W) : [];
    const dots = { week: claimables(W) > 0, lines: lines.some(l => l.fresh) };
    m.setTop([h("span", { class: "sp-stamps", title: "做完每週任務拿的週章。會存起來，到兌換所換東西。" }, cicon("stamp"), ` 週章 ${S.stamps} 枚`), PANELS.shop ? btn([cicon("shop"), " 兌換所"], () => PANELS.shop(), "primary small sp-shop") : null]);
    const tabs = h("div", { class: "nb-tabs", role: "tablist", "aria-label": "每週劇情" }, SP_TABS.map(([id, name]) =>
      h("button", { type: "button", role: "tab", "aria-selected": String(id === tab), class: "nb-tab" + (id === tab ? " on" : ""), onClick: () => { tab = id; draw(); } },
        name, dots[id] ? h("span", { class: "nb-dot", "aria-label": id === "week" ? "有獎勵可以領" : "有新的下壹步" }) : null)));
    const body = tab === "week" ? weekPane(W, draw, m) : tab === "lines" ? linesPane(W, lines, draw, m) : tab === "case" ? casePane() : reviewPane(m);
    m.surface.replaceChildren(tabs, h("div", { class: "sp-body" }, body));
    if (tab === "lines") markLinesSeen(P, lines);
    persist();
  };
  draw();
  snd("flip");
}
const sec = (title, ...kids) => h("section", { class: "sp-sec" }, h("h3", null, title), ...kids);
// 疑點簿：只列問題和出處，不解釋（典藏冊「書和看懂的事」那頁也放這壹份，ui_pass.js，決定 0058）
const CB_KIND = { book: "書", room: "房間", work: "畫" };
export function casePane() {
  const v = casebookView(P, STORY_LIB, todayStr());
  if (!v.weeks.length) return h("p", { class: "nb-empty" }, "疑點簿還是空的。讀書、看今日特展、走地下收藏庫的時候，有些地方會讓你多看壹眼。");
  return [h("p", { class: "sp-note cb-lead" }, "這裡只記問題，和你在哪裡多看了壹眼。答案不在這裡。"),
    v.weeks.map(w => sec(`〈${w.title || w.week}〉${w.now ? "・這週" : ""}`,
      w.question ? h("p", { class: "cb-q" }, w.question) : null,
      w.got.length ? h("ul", { class: "cb-list" }, w.got.map(g => h("li", null, h("span", { class: "cb-kind" }, CB_KIND[g.kind] || "書"), h("b", null, g.title ? `〈${g.title}〉` : "沒有名字的地方"), h("small", null, `第 ${g.day} 天`))))
        : h("p", { class: "sp-note" }, "還沒有多看壹眼的地方。"),
      w.left ? h("p", { class: "sp-note" }, `這週還有 ${w.left} 個地方，你還沒留意到。`) : null)),
    v.near.length ? sec("快要想通的", v.near.map(x => h("p", { class: "uk-near" }, `有件事快看懂了：還差 ${x.left} 條。`, x.hint ? h("span", { class: "uk-hint" }, ptNode(x.hint)) : null))) : null];
}
function taskRow(W, t, draw, m) {
  const S = storyState(P), st = S.tasks[t.id] || {}, n = taskCount(P, W, t), tgt = taskTarget(t, W);
  const r = Object.assign({}, t.reward, { stamps: t.weekly ? NUM.story.stampPerTask : 0 });
  const where = taskGo(t, W);
  const act = st.claimed ? h("span", { class: "sp-claimed" }, icon("check"), " 領過了")
    : st.done ? btn("領獎勵", () => claimFlow(claimTask(P, W, t.id, todayStr()), draw), "primary small")
      : where && !W.past ? btn(["前往 ", h("span", { "aria-hidden": "true" }, "→")], () => { m.close(); goStep(where); }, "small") : null;
  return h("li", { class: "sp-task" + (st.done ? " done" : "") + (st.claimed ? " claimed" : "") },
    h("span", { class: "sp-check", "aria-hidden": "true" }, st.done ? icon("check") : null),
    h("span", { class: "sp-t-main" }, h("span", { class: "sp-t-text" }, taskText(t, W)), t.weekly && t.words ? h("small", { class: "sp-t-words" }, ptMark(t.words)) : null,
      t.giver === "yuga" && t.says ? h("small", { class: "sp-t-yuga" }, h("b", null, "Yuga Bot 交代："), t.says) : null, h("small", { class: "sp-t-r" }, rewardText(r))),
    h("span", { class: "sp-t-n" }, `${n}／${tgt}`), act);
}
function bonusRow(text, state, reward, claim) {
  return h("li", { class: "sp-task sp-bonus" + (state === "claimed" ? " claimed" : "") },
    h("span", { class: "sp-check", "aria-hidden": "true" }, icon("star")),
    h("span", { class: "sp-t-main" }, h("span", { class: "sp-t-text" }, text), h("small", { class: "sp-t-r" }, rewardText(reward))),
    h("span", { class: "sp-t-n" }),
    state === "claimed" ? h("span", { class: "sp-claimed" }, icon("check"), " 領過了") : state === "ready" ? btn("領獎勵", claim, "primary small") : h("span", { class: "sp-wait" }, state === "late" ? "補做的沒有" : "還沒"));
}
function weekPane(W, draw, m) {
  if (!W) return h("p", { class: "nb-empty" }, "這週還沒有地下收藏庫的劇情。");
  const S = storyState(P), d = todayOf(W), today = todayStr();
  const head = h("div", { class: "sp-head" },
    h("p", { class: "sp-kicker" }, `本週地下收藏庫・第 ${W.dayNo} 天／7 天・這週還剩 ${weekLeftText(nowMs(), W.start)}`),
    h("h2", null, `〈${W.title}〉`), W.summary.map(s => h("p", null, ptMark(s))),
    W.question ? h("p", { class: "sp-question" }, h("span", null, "本週疑點"), W.question) : null,
    h("div", { class: "sp-go" }, btn([icon("book"), " 起源室的書架"], () => { m.close(); go("origin", { tab: "weekly" }); }, "small"),
      d && d.show ? btn([icon("gallery"), ` 今日特展：${d.show.title}`], () => { m.close(); go("gallery", { show: true }); }, "small") : null,
      btn([icon("stairs"), " 地下收藏庫"], () => { m.close(); navTo("cellar"); }, "small")));
  const events = eventListBox(W.events);
  const cdef = weekCasino(W), casino = cdef ? weekBox(cdef, todayStr(), { after: draw }) : null; // 賭場的每週收藏（決定 0042）
  const anomaly = W.anomaly ? sec("本週異狀", h("div", { class: "sp-anomaly" }, h("b", null, W.anomaly.title), W.anomaly.text.map(s => h("p", null, ptMark(s))))) : null;
  const daily = d ? sec(`今天的每日任務（第 ${d.n} 天）`, h("ul", { class: "sp-tasks" }, d.daily.map(t => taskRow(W, t, draw, m)),
    bonusRow("3 個都做完，多壹份", dayBonusState(P, W, d.n), d.dailyBonus, () => claimFlow(claimDayBonus(P, W, d.n, today), draw))),
    h("p", { class: "sp-note" }, "前幾天沒做的，這週裡都可以補做，獎勵照領。「3 個都做完，多壹份」只給當天做完的。")) : null;
  const wbr = Object.assign({}, W.weeklyBonus, { stamps: (W.weeklyBonus.stamps || 0) + NUM.story.stampAllBonus });
  const weekly = sec("每週任務", h("ul", { class: "sp-tasks" }, W.weekly.map(t => taskRow(W, t, draw, m)),
    bonusRow("5 個都做完：這週限定的那份", weekBonusState(P, W), wbr, () => claimFlow(claimWeekBonus(P, W, today), draw))),
    h("p", { class: "sp-note" }, `每週任務做完壹個拿 ${NUM.story.stampPerTask} 枚週章，全部做完再多 ${NUM.story.stampAllBonus} 枚。週章會存起來，可以到兌換所換裝備、提升技能。`));
  // 前幾天的每日任務：沒做的可以補做，做完沒領的可以領（決定 0060）。全部領過的那天不列
  const open = t => !(S.tasks[t.id] && S.tasks[t.id].claimed);
  const back = W.days.filter(x => x.n < W.dayNo && (x.daily.some(open) || dayBonusState(P, W, x.n) === "ready"));
  const old = back.length ? sec("前幾天的每日任務（可以補做）", back.map(x => [h("h4", { class: "sp-day-h" }, `第 ${x.n} 天`),
    h("ul", { class: "sp-tasks" }, x.daily.filter(open).map(t => taskRow(W, t, draw, m)),
      bonusRow("3 個都在當天做完，多壹份", dayBonusState(P, W, x.n), x.dailyBonus, () => claimFlow(claimDayBonus(P, W, x.n, today), draw)))]),
    h("p", { class: "sp-note" }, "補做的任務獎勵照領、書照樣解開；每週任務的「每日任務全部做完」只算當天做完的天。")) : null;
  const bag = Object.entries(S.bag).filter(([, n]) => n > 0);
  const bagSec = sec("背包", bag.length ? h("ul", { class: "sp-bag" }, bag.map(([id, n]) => {
    const can = itemUsable(P, id);
    return h("li", null, h("b", null, `${itemName(id)} ×${n}`), h("small", null, itemDesc(id)),
      can.ok ? btn("使用", () => { const u = useStoryItem(P, id); if (!u.ok) { note(u.reason, "bad"); return; } snd("unlock"); note(`用了${itemName(id)}：${u.text}`, "good"); updateStatus(); persist(); draw(); }, "small") : h("span", { class: "sp-keep" }, can.reason));
  })) : h("p", { class: "sp-note" }, "還沒有東西。任務的獎勵（技能書、急救箱、材料）會放在這裡。"));
  return [head, events, anomaly, casino, daily, weekly, old, bagSec];
}
function lineCard(l, draw, m) {
  return h("li", { class: "sp-line" + (l.done ? " done" : "") + (l.tracked ? " tracked" : "") },
    h("div", { class: "sp-l-head" }, h("span", { class: "sp-l-kind" }, l.kindText), h("b", null, l.name), l.fresh ? h("span", { class: "nb-dot", "aria-label": "新的下壹步" }) : null),
    h("p", { class: "sp-l-prog" }, l.kind === "casino" ? `收到了 ${l.read}／${l.books} 件` : `讀了 ${l.read}／${l.books} 本`, l.kind === "main" || l.kind === "season" || l.kind === "casino" ? null : `・${l.done ? "走完了" : `第 ${Math.min(7, curWeek() ? curWeek().dayNo : 7)} 天／7 天`}`),
    l.next ? h("p", { class: "sp-l-next" }, h("span", null, "下壹步："), h("b", null, l.next.text)) : h("p", { class: "sp-l-next" }, l.done ? (l.kind === "casino" ? "這週的都收齊了。東西在賭場的「本週收藏」看得到。" : "這條線走完了，收進「劇情回顧」。") : ""),
    h("div", { class: "sp-l-act" },
      l.next && (l.next.room || l.next.panel) && !l.done ? btn(["前往 ", h("span", { "aria-hidden": "true" }, "→")], () => { m.close(); goStep(l.next); }, "primary small") : null,
      !l.done ? btn(l.tracked ? "不追蹤了" : "追蹤這條", () => { trackLine(P, l.id); persist(); trackBar(); draw(); }, l.tracked ? "ghost small" : "small") : null));
}
function linesPane(W, lines, draw, m) {
  if (!W || !lines.length) return h("p", { class: "nb-empty" }, "現在沒有進行中的劇情線。");
  return [h("p", { class: "sp-note sp-lines-help" }, "每條線寫著讀到哪、下壹步去哪裡。追蹤壹條，大廳和狀態列會寫它的下壹步，點了直接過去。"),
    h("ul", { class: "sp-lines" }, lines.map(l => lineCard(l, draw, m)))];
}
function reviewPane(m) {
  const past = storyPastWeeks(STORY_LIB, todayStr(), P), oldSeasons = seasonLines(P, allWeeks()).filter(l => l.done).reverse(); // 換季之後舊的季節線也收在這裡
  const W = curWeek(), nowDone = W ? storyLines(P, W).filter(l => l.done) : []; // 這週就走完的（週日讀完結局）：先列出來，不用等到下週
  if (!past.length && !oldSeasons.length && !nowDone.length) return h("p", { class: "nb-empty" }, "走完的劇情線會收在這裡，隨時可以回去重讀。這週的線要到週日才會走完。");
  return h("ul", { class: "sp-review" }, nowDone.map(l => h("li", null, h("span", { class: "sp-l-kind" }, `本週・${W.label}`), h("b", null, `〈${l.name}〉`), h("small", null, `讀了 ${l.read}／${l.books} 本`),
    btn("到書架看", () => { m.close(); go("origin", { tab: "weekly", week: W.label }); }, "small"))), oldSeasons.map(l => h("li", null, h("span", { class: "sp-l-kind" }, l.kindText), h("b", null, `〈${l.name}〉`), h("small", null, `讀了 ${l.read}／${l.books} 本`),
    btn("到書架看", () => { m.close(); go("origin", { tab: "season" }); }, "small"))), past.map(w => {
    const lines = storyLines(P, w);
    const read = w.books.filter(b => bookState(P, w, b) === "read").length;
    return h("li", null, h("span", { class: "sp-l-kind" }, `${seasonName(seasonOf(w.label))}・${w.label}`), h("b", null, `〈${w.title}〉`),
      h("small", null, `${lines.map(l => l.name).join("、")}・讀了 ${read}／${w.books.length} 本`),
      btn("到書架看", () => { m.close(); go("origin", { tab: "weekly", week: w.label }); }, "small"));
  }));
}

// ---------- 「今天」清單（ui_today.js）要的 ----------
// 今天的每日任務壹條壹條（文字、做了沒、領了沒、進度、前往哪裡、Yuga Bot 交代的話）、每週任務做了幾個、可以領的獎勵。自由模式、沒有這週的劇情回 null
export function storyToday() {
  if (!on()) return null;
  const W = curWeek();
  if (!W) return null;
  const S = storyState(P), d = todayOf(W);
  const row = t => ({ id: t.id, text: taskText(t, W), done: taskDone(P, t), claimed: !!(S.tasks[t.id] && S.tasks[t.id].claimed), n: taskCount(P, W, t), tgt: taskTarget(t, W),
    go: W.past ? null : taskGo(t, W), yuga: t.giver === "yuga" && t.says ? t.says : "" });
  return { title: W.title, daily: (d ? d.daily : []).map(row), weekly: [W.weekly.filter(t => taskDone(P, t)).length, W.weekly.length], claim: claimables(W) };
}

// ---------- 大廳總覽（ui_hub.js）裡的那壹列：標題、剩幾天、劇情線的下壹步、按鈕。任務的數字在總覽的格子裡，這裡不重複 ----------
export function storyHub() {
  if (!on()) return null;
  const W = curWeek();
  if (!W) return null;
  const d = todayOf(W), lines = linesNow(W);
  const tracked = lines.find(l => l.tracked) || null, show = tracked || lines.find(l => l.next && !l.next.wait) || null;
  const fresh = lines.some(l => l.fresh);
  const pending = claimables(W) > 0 || fresh || (d ? d.daily : []).concat(W.weekly).some(t => !taskDone(P, t));
  return h("div", { class: "hub-row hub-story" },
    h("span", { class: "hst-head" }, h("small", null, icon("book"), `本週地下收藏庫・第 ${W.dayNo} 天・還剩 ${weekLeftText(nowMs(), W.start)}`),
      h("b", null, `〈${W.title}〉`, fresh ? h("span", { class: "nb-dot", "aria-label": "有新的下壹步" }) : null)),
    show && show.next ? h("button", { type: "button", class: "sl-track", onClick: () => goStep(show.next) }, icon("sparkle"),
      h("span", null, `${tracked ? "追蹤" : "劇情線"}〈${show.name}〉：`, h("b", null, show.next.text)), show.next.room || show.next.panel ? h("span", { class: "sl-arrow", "aria-hidden": "true" }, "→") : null) : null,
    h("div", { class: "hst-btns" }, btn("每週劇情", () => openStory(), "primary small" + (pending ? " sl-nudge" : "")), btn("劇情線", () => openStory({ tab: "lines" }), "small"), PANELS.shop ? btn("兌換所", () => PANELS.shop(), "small") : null));
}

// ---------- 大廳的小卡（有總覽之後大廳不放了；留著給沒有總覽的情況） ----------
export function storyLobby() {
  if (!on()) return null;
  const W = curWeek();
  if (!W) return null;
  const S = storyState(P), d = todayOf(W), lines = linesNow(W);
  const tracked = lines.find(l => l.tracked) || null, show = tracked || lines.find(l => l.next && !l.next.wait) || null;
  const n = claimables(W), fresh = lines.some(l => l.fresh);
  const chip = (t, cls) => h("span", { class: "sl-chip" + (cls ? " " + cls : "") }, t);
  // 還有事做就每幾秒閃一下（翊文 11-09：「劇情按鈕可以幾秒閃一下，提示大家要來按嗎」）：獎勵、新的下壹步、任務沒做完。全做完就不閃
  const pending = n > 0 || fresh || (d ? d.daily : []).concat(W.weekly).some(t => !taskDone(P, t));
  const card = h("section", { class: "story-lobby", "aria-label": "本週地下收藏庫" },
    h("div", { class: "sl-head" }, h("span", { class: "sl-tag" }, icon("book"), " 本週地下收藏庫"), h("b", { class: "sl-title" }, `〈${W.title}〉`),
      h("span", { class: "sl-left" }, `第 ${W.dayNo} 天・這週還剩 ${weekLeftText(nowMs(), W.start)}`), fresh ? h("span", { class: "nb-dot", "aria-label": "有新的下壹步" }) : null),
    h("div", { class: "sl-stats" }, chip(`每日任務 ${d ? d.daily.filter(t => taskDone(P, t)).length : 0}／${d ? d.daily.length : 0}`), chip(`每週任務 ${W.weekly.filter(t => taskDone(P, t)).length}／${W.weekly.length}`),
      chip(`週章 ${S.stamps} 枚`), n ? chip(`${n} 個獎勵可以領`, "hot") : null),
    show && show.next ? h("button", { type: "button", class: "sl-track", onClick: () => goStep(show.next) }, icon("sparkle"),
      h("span", null, `${tracked ? "追蹤" : "劇情線"}〈${show.name}〉：`, h("b", null, show.next.text)), show.next.room || show.next.panel ? h("span", { class: "sl-arrow", "aria-hidden": "true" }, "→") : null) : null,
    h("div", { class: "sl-btns" }, btn("打開每週劇情", () => openStory(), "primary small" + (pending ? " sl-nudge" : "")), btn("劇情線", () => openStory({ tab: "lines" }), "small"), PANELS.shop ? btn("兌換所", () => PANELS.shop(), "small") : null));
  return card;
}

// ---------- 起源室：書架的頁籤 ----------
export const ORIGIN_TABS = [["shelf", "館藏"], ["forbidden", "禁書"], ["mainline", "主線"], ["weekly", "每週劇情"], ["season", "季節"], ["holiday", "節日"], ["curate", "策展"]]; // 策展：主題展的手記（決定 0035，ui_themeshow.js）
const shelfName = id => (ORIGIN_TABS.find(t => t[0] === id) || [id, id])[1];
// 全部的週（今天這週＋以前的），舊的在前
let pastCache = { key: null, list: [] };
function allWeeks() {
  const W = curWeek(), today = todayStr(), key = today + "|" + Object.keys((P && P.story && P.story.weeks) || {}).length; // 每次 updateStatus 都會用到（季節線），一天算一次就好
  if (pastCache.key !== key) pastCache = { key, list: storyPastWeeks(STORY_LIB, today, P).reverse() };
  return W ? pastCache.list.concat([W]) : pastCache.list.slice();
}
// 現在看得到的劇情線：這週的＋還在走的季節線（換季之後舊的那條收進劇情回顧）
function linesNow(W) { return W ? storyLines(P, W).concat(seasonLines(P, allWeeks()).filter(l => !l.done), casinoLine(W) || []) : []; }
// 賭場的每週收藏也是一條可以追蹤的線（決定 0042）：下一步是「去賭場做哪件事」，進度是伺服器給的（拿不到就請他去賭場看）
function casinoLine(W) {
  const def = weekCasino(W);
  if (!def || W.past) return null;
  const S = storyState(P), id = "casino:" + W.label, view = CAS_WK.view, v = view && view.week === W.label ? view : null;
  const done = !!(v && v.done && v.claimed), t = done ? "" : wkNextText(def, view, todayStr());
  const first = v ? def.items.find(x => x.date <= todayStr() && !v.got[x.id]) : null;
  const key = done ? "done" : !v ? "view" : v.done ? "claim" : first ? first.id : "";
  return { id, name: def.title || "賭場收藏", kind: "casino", kindText: "賭場收藏", week: W.label, books: casWkBase(def).length, read: wkGotCount(def, view), next: t ? { text: t, panel: "casino", params: { tab: "week" } } : null,
    done, fresh: !done && !!t && S.seen[id] !== key, key, tracked: S.track === id, started: true };
}
const kindOfBook = (w, b) => { const l = lineById(w, b.line); return l ? l.kind : "week"; };
const tabOfBook = (w, b) => shelfTabOf({ kind: kindOfBook(w, b) });
// 每個頁籤：幾本（打得開的）、沒讀幾本、有沒有新的
function storyCounts() {
  const out = { mainline: [0, 0, 0], weekly: [0, 0, 0], season: [0, 0, 0], holiday: [0, 0, 0], curate: ADDONS.curateCounts ? ADDONS.curateCounts() : [0, 0, 0] };
  if (!on()) return out;
  allWeeks().forEach(w => w.books.forEach(b => {
    const st = bookState(P, w, b), c = out[tabOfBook(w, b)];
    if (!c || st === "locked") return;
    c[0]++; if (st === "open") c[1]++; if (isFresh(P, "origin", "story:" + b.id)) c[2]++;
  }));
  return out;
}
// counts：館藏、禁書的 [幾本, 沒讀幾本, 新的幾本]（ui_screens1.js 算好傳進來）
export function originTabs(tab, counts = {}) {
  const sc = storyCounts();
  return h("div", { class: "seg big-tabs origin-tabs", role: "tablist", "aria-label": "書架的分類" }, ORIGIN_TABS.map(([id, name]) => {
    const c = counts[id] || sc[id] || [0, 0, 0];
    const b = h("button", { type: "button", role: "tab", "aria-selected": String(id === tab), class: "seg-btn" + (id === tab ? " on" : ""), onClick: () => go("origin", { tab: id }, { action: false }) },
      h("span", null, name), h("span", { class: "tab-c", title: `${c[0]} 本，${c[1]} 本還沒讀` }, c[1] ? `${c[0]}・${c[1]} 沒讀` : String(c[0])));
    if (c[2]) b.append(freshTag("tab-fresh"));
    return b;
  }));
}
// 一排書，超過 NUM.story.shelfRow 本就分頁（手機也一樣，不會撐長）
export function shelfRow(key, label, spines, extra) {
  const per = NUM.story.shelfRow, pages = Math.max(1, Math.ceil(spines.length / per));
  const store = UI.shelfPage || (UI.shelfPage = {});
  let p = Math.min(store[key] || 0, pages - 1);
  const box = h("div", { class: "shelf story-shelf" }, h("span", { class: "shelf-label" }, label));
  const draw = () => {
    box.replaceChildren(h("span", { class: "shelf-label" }, label), ...(spines.length ? spines.slice(p * per, p * per + per) : [h("p", { class: "shelf-empty" }, extra || "這裡還沒有書。")]),
      pages > 1 ? h("div", { class: "shelf-pager" },
        h("button", { type: "button", class: "icon-btn", "aria-label": "上壹排", disabled: p === 0, onClick: () => { p--; store[key] = p; draw(); } }, icon("arrowLeft")),
        h("span", null, `${p + 1}／${pages}`),
        h("button", { type: "button", class: "icon-btn", "aria-label": "下壹排", disabled: p >= pages - 1, onClick: () => { p++; store[key] = p; draw(); } }, icon("arrowRight"))) : null);
  };
  draw();
  return box;
}
function spineFor(w, b, reader) {
  const st = bookState(P, w, b);
  const el = h("button", { type: "button", class: "spine story" + (st === "locked" ? " locked sealed" : "") + (st === "open" ? " lit" : "") + (b.ending ? " ending" : ""),
    "aria-label": st === "locked" ? `還打不開的書。${bookHint(w, b)}` : `〈${b.title}〉${st === "open" ? "（還沒讀）" : ""}` },
  h("span", { class: "spine-t" }, st === "locked" ? "？" : b.spine), st === "locked" ? icon("lock") : null);
  freshMark(el, st !== "locked" && isFresh(P, "origin", "story:" + b.id));
  el.addEventListener("click", () => {
    $$(".spine.on").forEach(x => x.classList.remove("on")); el.classList.add("on");
    openStoryBook(w, b, reader, el);
  });
  return el;
}
export function openStoryBook(w, b, reader, el) {
  const st = bookState(P, w, b);
  if (st === "locked") {
    snd("eerie", 1);
    reader.replaceChildren(h("div", { class: "book sealed-book" }, h("h2", { class: "book-title" }, "還打不開的書"), h("p", { class: "book-hint" }, icon("key"), " 怎麼打開"), h("p", { class: "sealed-hint" }, bookHint(w, b))));
    return;
  }
  const l = lineById(w, b.line);
  bookReader(reader, b.title, b.pages, { onEnd: () => {
    const r = readStoryBook(P, w, b.id, todayStr());
    if (r.first && r.insp) { bookGain(reader, `+${r.insp} 靈感`, "good"); snd("coin"); }
    if (r.first && b.ending) note(`〈${l ? l.name : w.title}〉走完了。`, "good");
    if (el) el.classList.remove("lit");
    storyTick(); updateStatus(); persist();
  } });
  const book = reader.querySelector(".book");
  if (book) book.insertBefore(h("p", { class: "book-from" }, `${l ? `${LINE_KINDS[l.kind] || ""}〈${l.name}〉・` : ""}${w.label}・第 ${b.day} 天`), book.children[1] || null);
}
// 賭場集滿的小故事（決定 0042）：領過週章（P.story.cas）才放上書架，過了那週還是讀得到
function casinoStory(w) {
  const def = weekCasino(w), S = storyState(P);
  return def && S.cas[w.label] && def.reward.story.pages.length ? { def, title: def.reward.story.title || "賭場的小故事", pages: def.reward.story.pages } : null;
}
function openCasinoStory(w, st, reader) {
  bookReader(reader, st.title, st.pages);
  const book = reader.querySelector(".book");
  if (book) book.insertBefore(h("p", { class: "book-from" }, `賭場收藏〈${st.def.title}〉・${w.label}`), book.children[1] || null);
}
function casinoSpine(w, reader) {
  const st = casinoStory(w);
  if (!st) return null;
  const el = h("button", { type: "button", class: "spine story casino", "aria-label": `賭場收藏的小故事：${st.title}` }, h("span", { class: "spine-t" }, "賭場"));
  el.addEventListener("click", () => { $$(".spine.on").forEach(x => x.classList.remove("on")); el.classList.add("on"); snd("flip"); openCasinoStory(w, st, reader); });
  return el;
}
// 一週（合訂本裡的一冊）：書的清單
function weekVolume(w, reader) {
  const items = w.books.map(b => {
    const st = bookState(P, w, b);
    return h("li", null, h("button", { type: "button", class: "vol-book" + (st === "open" ? " unread" : ""), onClick: () => openStoryBook(w, b, reader) },
      h("span", null, `第 ${b.day} 天`), h("b", null, st === "locked" ? "（還打不開）" : `〈${b.title}〉`), st === "read" ? icon("check") : null));
  });
  const cst = casinoStory(w);
  if (cst) items.push(h("li", null, h("button", { type: "button", class: "vol-book", onClick: () => openCasinoStory(w, cst, reader) }, h("span", null, "賭場"), h("b", null, `〈${cst.title}〉`))));
  reader.replaceChildren(h("div", { class: "book vol-book-list" }, h("h2", { class: "book-title" }, `〈${w.title}〉`),
    h("p", { class: "book-from" }, `${seasonName(seasonOf(w.label))}・${w.label}（${w.start.slice(5).replace("-", "/")} 起）`),
    w.summary.map(s => h("p", { class: "vol-sum" }, ptNode(s))), h("ol", { class: "vol-list" }, items)));
}
function seasonVolume(n, weeks, reader) {
  reader.replaceChildren(h("div", { class: "book vol-book-list" }, h("h2", { class: "book-title" }, `${seasonName(n)}合訂本`),
    h("p", { class: "book-from" }, `${weeks.length} 週。點壹週打開。`),
    h("ol", { class: "vol-list" }, weeks.map(w => h("li", null, h("button", { type: "button", class: "vol-book", onClick: () => weekVolume(w, reader) }, h("span", null, w.label), h("b", null, `〈${w.title}〉`)))))));
}
// 書架：主線、每週劇情、節日（館藏、禁書照舊在 ui_screens1.js）
export function storyShelf(tab, reader, params = {}) {
  if (tab === "curate" && ADDONS.curateShelf) return ADDONS.curateShelf(reader, params); // 策展手記（決定 0035）
  if (!on()) return h("div", { class: "shelf story-shelf" }, h("span", { class: "shelf-label" }, shelfName(tab)), h("p", { class: "shelf-empty" }, "每週劇情在挑戰模式裡。"));
  const W = curWeek(), weeks = allWeeks();
  if (params.week) { const w = weeks.find(x => x.label === params.week); if (w) later(() => weekVolume(w, reader), 0); }
  if (tab === "weekly") {
    const cur = W ? W.books.filter(b => tabOfBook(W, b) === "weekly").map(b => spineFor(W, b, reader)) : [];
    const cs = W ? casinoSpine(W, reader) : null; // 賭場集滿的小故事（領過週章才有）
    if (cs) cur.push(cs);
    const rows = [shelfRow("cur", W ? `本週〈${W.title}〉・第 ${W.dayNo} 天` : "本週", cur, "這週的書，每天 05:00 會多 1～2 本。")];
    const past = weeks.filter(w => w !== W);
    const sNow = W ? seasonOf(W.label) : null;
    const same = past.filter(w => seasonOf(w.label) === sNow).reverse();
    if (same.length) rows.push(shelfRow("season", `這壹季（${seasonName(sNow)}）`, same.map(w => {
      const el = h("button", { type: "button", class: "spine story vol", "aria-label": `${w.label}〈${w.title}〉` }, h("span", { class: "spine-t" }, w.title.slice(0, 6)), h("span", { class: "spine-m" }, w.label.slice(5)));
      el.addEventListener("click", () => { $$(".spine.on").forEach(x => x.classList.remove("on")); el.classList.add("on"); weekVolume(w, reader); });
      return el;
    })));
    const seasons = [...new Set(past.map(w => seasonOf(w.label)).filter(s => s !== sNow))].sort((a, b) => b - a);
    if (seasons.length) rows.push(shelfRow("bound", "合訂本", seasons.map(s => {
      const ws = past.filter(w => seasonOf(w.label) === s);
      const el = h("button", { type: "button", class: "spine story vol bound", "aria-label": `${seasonName(s)}合訂本` }, h("span", { class: "spine-t" }, seasonName(s)), h("span", { class: "spine-m" }, "合訂本"));
      el.addEventListener("click", () => { $$(".spine.on").forEach(x => x.classList.remove("on")); el.classList.add("on"); seasonVolume(s, ws, reader); });
      return el;
    })));
    return rows;
  }
  if (tab === "season") { // 季節線：一條線一排，新的在上面；過了那週還是可以補讀（決定 0037）
    const rows = seasonLines(P, weeks).reverse().map(l => shelfRow("season-" + l.id, `${l.name}${l.done ? "（走完了）" : ""}`, l.list.map(o => spineFor(o.w, o.b, reader))));
    return rows.length ? rows : [shelfRow("season", "季節", [], "壹年四季各壹條線，大約兩週壹本。第壹本寫好就會放在這裡。")];
  }
  const want = tab === "mainline" ? "main" : "holiday";
  const list = [];
  weeks.forEach(w => w.books.forEach(b => { if (kindOfBook(w, b) === want) list.push(spineFor(w, b, reader)); }));
  const empty = tab === "mainline" ? "地下收藏庫的大謎團，壹章壹本。每週劇情走到主線的時候，這裡會多壹本。" : "節日那週的故事會放在這裡。";
  return [shelfRow(tab, tab === "mainline" ? "主線" : "節日", list, empty)];
}

// ---------- 畫廊：今日特展 ----------
const SHOW_FRESH = day => "show:" + day;
// 今天的特展：標題、幾幅、還有幾幅沒看（大廳的總覽、「新」的標記用）。今天沒有特展就是 null
export function showToday() {
  if (!on()) return null;
  const W = curWeek(), d = W ? todayOf(W) : null;
  if (!d || !d.show) return null;
  const S = storyState(P);
  return { title: d.show.title, total: d.show.works.length, unseen: d.show.works.filter(w => !S.works[w.id]).length };
}
export function galleryTabs(active) {
  if (!on()) return null;
  const W = curWeek(), d = todayOf(W);
  if (!d || !d.show) return null;
  const S = storyState(P), unseen = d.show.works.filter(w => !S.works[w.id]).length;
  return h("div", { class: "seg hall-tabs big-tabs gallery-tabs" },
    h("button", { type: "button", class: "seg-btn" + (active === "main" ? " on" : ""), onClick: () => go("gallery", {}, { action: false }) }, icon("gallery"), h("span", null, "常設展")),
    h("button", { type: "button", class: "seg-btn" + (active === "show" ? " on" : ""), onClick: () => go("gallery", { show: true }, { action: false }) }, icon("star"), h("span", null, `今日特展：${d.show.title}`),
      unseen ? h("span", { class: "tab-c" }, `${unseen} 幅沒看`) : null, unseen && isFresh(P, "gallery", SHOW_FRESH(todayStr())) ? freshTag() : null));
}
let svgSeq = 0;
function workArt(w) {
  if (w.svg != null) { // 排程畫的新畫：畫面再淨化一次（不能只靠檢查程式）；每次畫都換 id 前綴，同一幅畫兩次也不會撞到
    const r = sanitizeSvg(w.svg, `ws${++svgSeq}-`);
    return r.ok ? r.svg : ART.exhibit("none");
  }
  const shadow = (w.fx || []).includes("shadow");
  if (w.art === "frog") return ART.frog(Object.assign({}, w.pick), { silhouette: shadow, noBg: shadow });
  return ART.exhibit(w.art, { variant: w.variant || 0 });
}
const frameCls = w => `frame st-frame fr-${w.frame || "gold"} art-${w.svg != null ? "svg" : w.art === "frog" ? "frog" : w.art}` + (w.fx || []).map(f => " fx-" + f).join("");
// 畫廊的「今日特展」頁（SCREENS.gallery 的 params.show）。沒有今日特展就回傳 false（畫廊照常畫）
export function storyShow(root) {
  if (!on()) return false;
  const W = curWeek(), d = todayOf(W);
  if (!d || !d.show) return false;
  const S = storyState(P), show = d.show, today = todayStr();
  root.append(roomHead("畫廊", `今日特展：${show.title}`), galleryTabs("show"));
  root.append(h("div", { class: "limit-box" },
    h("p", null, icon("star"), ptMark(show.intro)),
    h("p", null, icon("sparkle"), h("span", null, "第壹次看壹幅：", h("b", { class: "em good" }, `+${NUM.story.showInsp[0]}～+${NUM.story.showInsp[1]} 靈感`), `（要擲理智的比較多）。今日特展壹天最多拿 ${NUM.story.showInspDay} 靈感，今天拿了 ${S.showInsp[today] || 0}。`)),
    h("p", null, icon("hourglass"), h("span", null, "今日特展明天 05:00 換壹個主題。這週前幾天的畫收在下面：只能看，不給靈感，補做任務用。"))));
  if (activeQuirks(P).some(q => q.task === "calm")) root.append(quirkHereBox("calm")); // 怪癖的治法是「看壹幅不可怕的畫」（決定 0027）
  const corridor = h("div", { class: "corridor show-corridor", tabindex: "0", "aria-label": "今日特展，可以左右滑動" }, show.works.map(w => workItem(W, w)));
  corridor.addEventListener("wheel", e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { corridor.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  root.append(corridor);
  const review = weekReview(W);
  if (review.length) root.append(h("h2", { class: "show-review-h" }, W.dayNo >= 7 ? "本週回顧展" : "這週前幾天的畫"), h("p", { class: "hint" }, "這週前幾天的畫。只能看，不給靈感。"),
    h("div", { class: "corridor show-corridor small" }, review.map(w => workItem(W, w))));
  root.append(h("p", { class: "hint" }, "用滑鼠滾輪或手指左右滑，點壹幅靠近看。"));
  return true;
}
function workItem(W, w) {
  const S = storyState(P), seen = !!S.works[w.id];
  const frame = h("div", { class: frameCls(w), html: workArt(w) + (seen ? "" : '<div class="ex-cover" aria-hidden="true"><span>還沒看過</span></div>') });
  if (!seen) frame.classList.add("covered");
  const cap = h("div", { class: "ex-cap" }, ptNode(w.title, "ex-title"),
    w.san ? h("span", { class: "ex-san", title: `看的時候擲 1～100，擲出 ≤ 你的理智就算成功：${sanWords(w.san)}` }, `理智 ${sanShort(w.san)}`) : null,
    seen ? h("span", { class: "ex-insp" }, icon("check"), " 看過了") : h("span", { class: "ex-new" }, "沒看過"));
  const item = h("button", { type: "button", class: "exhibit show-work", "aria-label": w.title + (seen ? "" : "（還沒看過）") }, frame, cap);
  item.addEventListener("click", () => focusWork(W, w));
  return item;
}
async function focusWork(W, w) {
  if (UI.busy) return;
  UI.busy = true;
  const host = document.getElementById("room");
  const info = h("div", { class: "focus-info" }), gains = h("div", { class: "focus-gains", "aria-live": "polite" });
  const gain = (t, tone) => gains.append(h("span", { class: "gain-chip " + (tone || "") }, t));
  const closeBtn = btn("回特展", () => close(), "ghost");
  const layer = h("div", { class: "focus-layer", role: "dialog", "aria-label": w.title },
    h("div", { class: "focus-inner" }, h("div", { class: frameCls(w) + " focus-art", html: workArt(w) }), info), h("div", { class: "focus-actions" }, closeBtn));
  let closed = false;
  const onKey = e => { if (e.key === "Escape" && !document.querySelector(".fx-overlay")) close(); };
  const close = () => { if (closed) return; closed = true; layer.remove(); document.removeEventListener("keydown", onKey); UI.busy = false; if (UI.screen === "gallery") rerender(); };
  document.addEventListener("keydown", onKey);
  UI.cleanup.push(() => { if (closed) return; closed = true; document.removeEventListener("keydown", onKey); UI.busy = false; });
  host.append(layer);
  requestAnimationFrame(() => layer.classList.add("in"));
  try {
    closeBtn.disabled = true;
    const v = viewShowWork(P, W, w.id, todayStr());
    snd("flip");
    info.replaceChildren(placard([w.title].concat(w.lines || []), { cls: "big" }), gains);
    if (v.insp) { gain(`+${v.insp} 靈感`, "good"); snd("coin"); }
    else if (v.first && v.capped) gain(`今日特展的靈感今天拿完了（壹天 ${NUM.story.showInspDay}）`, "");
    if (v.cured.length) { v.cured.filter(c => !c.step).forEach(() => gain("治好了怪癖", "good")); noteCured(v.cured); }
    updateStatus(); persist();
    if (v.san) {
      snd("eerie");
      const res = await sanFlow(v.san, "show:" + w.id, w.title, { anchor: gains });
      if (res && !closed) gain(res.loss ? `理智 −${res.loss}` : "理智沒有掉", res.loss ? "bad" : "good");
      if (res && res.ev && res.ev.zero) { close(); return; }
      if (res && res.involuntary === "backout") { if (!closed) { close(); go("lobby"); } return; }
    }
    storyTick(); updateStatus(); persist();
  } finally {
    closeBtn.disabled = false;
    if (!closed) closeBtn.focus();
  }
}

// ---------- 地下收藏庫：本週異狀、這週多出來的地方 ----------
export function storyCellarBox() {
  if (!on()) return null;
  const W = curWeek();
  if (!W || (!W.anomaly && !W.rooms.length)) return null;
  const S = storyState(P);
  const team = (UI.cellarTeam || []).filter(Boolean);
  const card = r => {
    const found = !!S.spots[r.id], open = roomOpen(P, r);
    const go_ = () => {
      if (team.length < 3) { snd("error"); note("先在下面放滿 3 隻隊員，再進去。", "bad"); return; }
      const res = startStoryRoom(P, W, r.id, UI.cellarTeam);
      if (!res.ok) { snd("error"); note(res.reason, "bad"); return; }
      snd("whoosh"); persist(); rerender(); window.scrollTo(0, 0);
    };
    return h("li", { class: "sc-room" + (found ? " found" : "") + (open ? "" : " locked") + (r.anomaly ? " anomaly" : "") },
      h("span", { class: "sc-floor" }, `B${r.floor}`),
      h("span", { class: "sc-body" }, h("b", null, found ? r.title : r.hint), h("small", null, found ? markText(`找到了${spotClaimed(P, W, r.id) && rewardText(r.reward) ? `（${rewardText(r.reward)}）` : ""}`) : !open ? `要先走到 B${r.floor}` : r.anomaly ? "本週異狀" : `第 ${r.day} 天多出來的地方`)),
      open ? btn([icon("stairs"), found ? " 再去壹次" : " 帶隊伍進去"], go_, found ? "ghost small" : "primary small") : h("span", { class: "sc-lock" }, icon("lock")));
  };
  return h("section", { class: "story-cellar", "aria-label": "本週異狀" },
    W.anomaly ? h("div", { class: "sc-anomaly" }, h("p", { class: "sc-kicker" }, icon("eye"), " 本週異狀"), h("b", null, W.anomaly.title), W.anomaly.text.map(t => h("p", null, ptMark(t)))) : null,
    W.rooms.length ? h("ul", { class: "sc-rooms" }, W.rooms.map(card)) : null,
    h("p", { class: "sc-hint" }, markText("用下面挑好的 **3 隻**進去，只走那壹間；**過了就算找到**。已經走過的樓層，也可能多出新的地方。")));
}

// ---------- 登記進 ui_core、公佈欄 ----------
PANELS.story = openStory;
HOOKS.status = storyTick;
NOTICE_EXTRA.push((p, today) => {
  if (!p || isFree(p)) return null;
  const W = p === P ? weekFor(today) : storyWeek(STORY_LIB, today, p);
  return storyNotice(W, today, nowMs());
});
