// ================================================================
//  館內公佈欄、信箱的畫面（翊文 11-08：「要像其他遊戲有個公佈欄」→「公佈欄和信箱」）
//  規則在 shared/notices.js、shared/mailbox.js；做法見規劃第四節「館內公佈欄」。
//  樣子（翊文 11-08：「應該可以在整個畫面最上面覆蓋，像真的公告欄一樣」）：
//    蓋在整個畫面上，導覽列、狀態列也蓋住。
//    公佈欄＝木框＋軟木板，公告是用圖釘釘上去的紙，沒讀的蓋著紅色火漆。信箱＝木框＋綠絨布，一封一個信封。
//  入口：導覽列的「公佈欄」頁籤、右上角「選單」裡的公佈欄和信箱（ui_core.js 的 buildNav）；
//        進館後有新公告會自己打開（ui_screens1.js 的 afterEnter → autoBoard）。
//  ui_core 不能 import 這個檔（它在後面），所以這裡把自己登記進 ui_core 的 PANELS。
// ================================================================
import { realTodayStr } from "../../shared/logic.js";
import { NOTICE_CATS, autoOpenPlan, isUnread, markAllRead, markRead, noticeState, noticeStatus, skipToday, visibleNotices } from "../../shared/notices.js";
import { claimAllMail, claimMail, daysLeft, giftText, mailList, pruneMail, syncMail, unclaimedCount } from "../../shared/mailbox.js";
import { FX } from "./fx.js";
import { P, PANELS, SAVE, UI, btn, go, h, icon, navTo, note, persist, snd, updateBoardBadges, updateStatus } from "./ui_core.js";

const md = s => s ? s.slice(5).replace("-", "/") : ""; // "2026-11-08" → "11/08"
const narrow = () => matchMedia("(max-width: 760px)").matches;
const TILT = [-1.2, .9, -.5, 1.1, -.8, .4]; // 紙釘上去不會剛好正正的

// 蓋在整個畫面上的木框。按 Esc、點框外面、按右上角的 X 都會關；按 Tab 只在框裡面轉
// ic：銅牌上的圖示（沒給就看 kind：信箱是信封，其他是卷軸）。館友、我的帳號（ui_login.js）、隊伍（ui_party.js）也用這個框
// onClose：關掉的時候要做的事（不給就只是關掉）
export function overlay(kind, title, label, ic, onClose) {
  // 同時只開一個框：先把開著的照正常的方式關掉（會叫它的 onClose，例如隊伍的框＝離開隊伍；鍵盤的監聽也會拿掉）
  document.querySelectorAll(".nb-layer").forEach(l => { if (l.nbClose) l.nbClose(); else l.remove(); });
  const back = document.activeElement;
  const top = h("div", { class: "nb-top" }), surface = h("div", { class: "nb-surface" }), foot = h("div", { class: "nb-foot" });
  const frame = h("div", { class: "nb-frame " + kind, tabindex: "-1" }, top, surface, foot);
  const layer = h("div", { class: "nb-layer", role: "dialog", "aria-modal": "true", "aria-label": label || title }, frame);
  const close = () => {
    if (!layer.isConnected) return;
    layer.remove();
    if (!document.querySelector(".nb-layer")) document.body.classList.remove("nb-open");
    document.removeEventListener("keydown", onKey, true);
    updateBoardBadges();
    if (onClose) { try { onClose(); } catch (e) { console.error("關掉框的時候出錯", e); } } // 例如：關掉隊伍的框＝離開隊伍（ui_party.js）
    const to = back && back.isConnected && back.offsetParent !== null ? back : document.querySelector(".menu-btn");
    if (to && to.focus) to.focus({ preventScroll: true });
  };
  const onKey = e => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== "Tab") return;
    const f = [...layer.querySelectorAll("button, a[href], input")].filter(el => !el.disabled && el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1], at = document.activeElement;
    if (e.shiftKey && (at === first || !layer.contains(at) || at === frame)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (at === last || !layer.contains(at))) { e.preventDefault(); first.focus(); }
  };
  const x = h("button", { type: "button", class: "nb-x", "aria-label": "關掉", title: "關掉（Esc）", onClick: () => close() }, icon("close"));
  const setTop = extra => top.replaceChildren(h("div", { class: "nb-plaque" }, icon(ic || (kind.includes("nb-mail") ? "mail" : "scroll")), h("h2", null, title)), h("div", { class: "nb-top-r" }, extra, x));
  document.addEventListener("keydown", onKey, true);
  layer.nbClose = close;
  layer.addEventListener("click", e => { if (e.target === layer) close(); });
  setTop(null);
  document.body.append(layer);
  document.body.classList.add("nb-open");
  frame.focus({ preventScroll: true });
  return { layer, frame, surface, foot, setTop, close };
}

// 一則公告：釘在板子上的一張紙
function sheet(n, today, close) {
  const st = noticeStatus(n, today);
  const goCta = () => {
    close();
    if (n.cta.panel && PANELS[n.cta.panel]) PANELS[n.cta.panel]();
    else if (n.cta.params) go(n.cta.room, n.cta.params);
    else navTo(n.cta.room);
  };
  return h("article", { class: "nb-sheet" }, h("i", { class: "nb-pin l", "aria-hidden": "true" }), h("i", { class: "nb-pin r", "aria-hidden": "true" }),
    h("div", { class: "nb-tags" }, (n.tags || []).map(t => h("span", { class: "nb-tag" + (t === "重要" ? " hot" : "") }, t)), st ? h("span", { class: "nb-tag st" }, st) : null),
    h("h3", null, n.title),
    h("p", { class: "nb-date" }, n.weekly ? "這壹週" : `${md(n.publish)} 發布`),
    (n.sections || []).map(([name, lines]) => h("section", { class: "nb-sec" }, h("h4", null, `〓${name}〓`), lines.map(l => h("p", null, l)))),
    n.cta ? h("div", { class: "nb-cta" }, btn([n.cta.label, " ", h("span", { "aria-hidden": "true" }, "→")], goCta, "primary")) : null);
}

// ---------- 公佈欄 ----------
// o.focus：先打開哪一則；o.auto：進館時自己打開的（下面多「今天不再自動打開」）
export function openBoard(o = {}) {
  if (!SAVE) return;
  const today = realTodayStr(), state = noticeState(SAVE), list = visibleNotices(P, today);
  const focusN = o.focus ? list.find(n => n.id === o.focus) : null;
  let tab = focusN ? focusN.cat : NOTICE_CATS[0];
  let cur = focusN ? focusN.id : null;
  const m = overlay("nb-board", "館內公佈欄");
  const readAll = btn("全部標為已讀", () => { markAllRead(state, list); persist(); draw(); }, "small nb-readall");
  const draw = () => {
    const inTab = list.filter(n => n.cat === tab);
    if (cur && !inTab.some(n => n.id === cur)) cur = null;
    if (!cur && !narrow() && inTab.length) cur = inTab[0].id; // 電腦：右邊直接看第一則；手機：先看列表
    const post = cur ? list.find(n => n.id === cur) : null;
    if (post && isUnread(state, post)) { markRead(state, post); persist(); } // 點開內文才算讀過
    const anyUnread = list.some(n => isUnread(state, n));
    m.setTop(anyUnread ? readAll : null);
    const tabs = h("div", { class: "nb-tabs", role: "tablist", "aria-label": "公告的種類" }, NOTICE_CATS.map(c => {
      const un = list.filter(n => n.cat === c && isUnread(state, n)).length;
      return h("button", { type: "button", role: "tab", "aria-selected": String(c === tab), class: "nb-tab" + (c === tab ? " on" : ""), onClick: () => { tab = c; cur = null; draw(); } },
        c, un ? h("span", { class: "nb-dot", "aria-label": `${un} 則沒讀` }) : null);
    }));
    const slips = inTab.length ? inTab.map((n, i) => {
      const un = isUnread(state, n), tag = (n.tags || ["公告"])[0];
      return h("button", { type: "button", class: "nb-slip" + (n.id === cur ? " on" : "") + (un ? " unread" : ""), style: { "--tilt": TILT[i % TILT.length] + "deg" }, "aria-current": n.id === cur ? "true" : null, onClick: () => { cur = n.id; draw(); } },
        h("i", { class: "nb-pin", "aria-hidden": "true" }),
        h("span", { class: "nb-slip-row" }, h("span", { class: "nb-slip-tag" + (tag === "重要" ? " hot" : "") }, tag), h("span", { class: "nb-slip-d" }, n.weekly ? "這壹週" : md(n.publish))),
        h("span", { class: "nb-slip-t" }, n.title),
        un ? h("span", { class: "nb-wax", "aria-label": "沒讀" }) : null);
    }) : [h("p", { class: "nb-empty" }, "這裡還沒有公告。")];
    const reading = narrow() && post;
    const listCol = h("div", { class: "nb-list" }, slips);
    const readCol = post ? h("div", { class: "nb-read" }, reading ? btn(["← ", "回列表"], () => { cur = null; draw(); }, "small nb-back") : null, sheet(post, today, m.close))
      : narrow() ? null : h("div", { class: "nb-read empty" }, h("p", { class: "nb-empty" }, "點左邊的壹張來看。"));
    m.surface.replaceChildren(tabs, h("div", { class: "nb-body" + (reading ? " reading" : "") }, reading ? null : listCol, readCol));
    m.foot.replaceChildren(o.auto ? h("label", { class: "nb-skip" },
      (() => { const c = h("input", { type: "checkbox" }); c.checked = state.skip === today; c.addEventListener("change", () => { if (c.checked) skipToday(state, today); else delete state.skip; persist(); }); return c; })(),
      "今天不再自動打開") : null);
    updateBoardBadges();
  };
  draw();
  snd("flip");
}

// 緊急的公告：進館時直接打開，按「我知道了」才算讀過
export function openUrgent(n) {
  const today = realTodayStr(), state = noticeState(SAVE);
  const m = overlay("nb-board urgent", "館方緊急公告", n.title);
  m.surface.replaceChildren(h("div", { class: "nb-one" }, sheet(n, today, m.close)));
  m.foot.replaceChildren(btn("我知道了", () => { markRead(state, n); persist(); m.close(); }, "primary"));
  snd("bell");
}

// ---------- 信箱 ----------
export function openMailbox() {
  if (!P) { note("先進館才有信箱。"); return; }
  const today = realTodayStr();
  syncMail(P, visibleNotices(P, today), today);
  pruneMail(P, today);
  persist();
  const m = overlay("nb-mail", "信箱");
  const draw = () => {
    const list = mailList(P, today), left = unclaimedCount(P, today);
    m.setTop(left ? btn(`全部領取（${left}）`, () => {
      const t = claimAllMail(P, today);
      snd("coin"); updateStatus(); persist();
      note(t.n ? `領了 ${t.n} 封${giftText(t) ? "：" + giftText(t) : ""}` : "沒有可以領的。", "good");
      draw();
    }, "primary small") : null);
    const envs = list.length ? list.map(x => {
      const act = x.claimed ? null : h("div", { class: "nb-env-act" }, h("small", null, `還有 ${daysLeft(x, today)} 天`), (() => {
        const b = btn("領取", () => {
          const r = claimMail(P, x.id, today);
          if (!r.ok) { snd("error"); note(r.reason, "bad"); return; }
          snd("coin");
          FX.floatText(b, giftText(r.gift) || "已領取", "good");
          if (r.free) note("自由模式不用靈感：信收下了。");
          updateStatus(); persist(); draw();
        }, "primary small");
        return b;
      })());
      return h("div", { class: "nb-env" + (x.claimed ? " claimed" : "") },
        x.claimed ? h("span", { class: "nb-env-stamp" }, "已領取") : h("span", { class: "nb-wax big", "aria-hidden": "true" }),
        h("div", { class: "nb-env-body" }, h("b", null, x.title), h("span", { class: "nb-env-from" }, `${x.from}・${md(x.sent)} 寄來`), x.note ? h("span", { class: "nb-env-note" }, x.note) : null,
          h("span", { class: "nb-env-gift" }, giftText(x.gift) || "（只有信，沒有附東西）")),
        act);
    }) : [h("p", { class: "nb-empty" }, "信箱是空的。")];
    m.surface.replaceChildren(h("p", { class: "nb-hint" }, "獎勵、補償，之後還有館友送的東西，都會寄到這裡。寄到之後 30 天沒領就會不見。"), h("div", { class: "nb-envs" }, envs));
    updateBoardBadges();
  };
  draw();
  snd("flip");
}

// ---------- 進館後自己打開（一次進館最多一次） ----------
let autoDone = false;
const busy = () => UI.busy || document.querySelector(".mini-layer, .ask, .nb-layer, .fx-overlay, .fx-roll-card, .fx-spot-card, .m-door");
export function autoBoard(tries = 0) {
  if (autoDone || !P || !SAVE) return;
  if (window.__PM_NODOOR__) return; // 開發用的 #畫面：不要自己跳出來擋住
  if (busy()) { if (tries < 15) setTimeout(() => autoBoard(tries + 1), 2000); return; }
  autoDone = true;
  UI.boardAutoDone = true; // 簽到卡（ui_signin.js）等公佈欄先決定好才跳（規劃第四節：維護 → 緊急 → 新公告 → 然後才是簽到）
  // 只有還在大廳才自己打開（11-08：玩家已經走去畫廊看畫了，公佈欄突然蓋上來很突兀）；沒打開的，選單上照樣有數字
  if (UI.screen !== "lobby") { updateBoardBadges(); return; }
  const today = realTodayStr(), list = visibleNotices(P, today), state = noticeState(SAVE);
  syncMail(P, list, today); persist(); updateBoardBadges();
  const plan = autoOpenPlan(state, list, today);
  if (plan.urgent || plan.open) UI.autoPopups = (UI.autoPopups || 0) + 1; // 一次登入最多自動跳 2 個視窗
  if (plan.urgent) openUrgent(plan.urgent);
  else if (plan.open) openBoard({ focus: plan.focus, auto: true });
}

PANELS.board = openBoard;
PANELS.mail = openMailbox;
PANELS.autoBoard = autoBoard;
