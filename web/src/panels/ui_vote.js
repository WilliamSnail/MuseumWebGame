// ================================================================
//  全館投票的畫面（決定 0162、0166）：帳上的空欄和那支筆。
//  伺服器是獨立的 Function：NET.call("storyVote", { op: "peek" } 或 { op: "vote", choice, name? })，兩種都回整包，畫面只照那壹包畫。
//  判斷在 shared/story/vote_screen.js、字在 vote_text.js；假回應在 web/src/core/mock_net.js（?mock&vote=…）。
//  入口（開投前壹天起才有）：大廳和任務板的卡（ADDONS.voteSlot）、舊大廳和導覽列的清單（ADDONS.voteItem）、館友證（ADDONS.votePass）。
//  只有在時間窗裡才問伺服器；別的畫面檔用 PANELS.vote、ADDONS 叫，不 import 這支。
//  只顯示比例，不顯示票數、不顯示誰投什麼、不排名。寫下的名字只有本人看得到。介面文字照第 1 代用「壹」。
// ================================================================
import { NUM } from "../../../shared/core/config.js";
import { isFree, nowMs } from "../../../shared/core/logic.js";
import { VOTE_SCREEN_TEXT } from "../../../shared/story/vote_text.js";
import { voteUiEntry, voteUiEver, voteUiForm, voteUiLeft, voteUiMode, voteUiName, voteUiOption, voteUiPages, voteUiPass, voteUiPhaseAt, voteUiSay, voteUiShaky, voteUiShares, voteUiShow, voteUiTimes, voteUiWhen, voteUiWhy } from "../../../shared/story/vote_screen.js";
import { NET } from "../core/net_firebase.js";
import { ADDONS, P, PANELS, UI, btn, every, h, note, snd, updateBoardBadges } from "../core/ui_core.js";
import { overlay } from "./ui_board.js";
import { weekUnderstood } from "./ui_story.js";

const VT = VOTE_SCREEN_TEXT;
const TTL = 5 * 60000, RETRY = 60000; // 問到的結果放多久、問失敗多久以後才自己再問
// 那支筆（自己畫的蘸水筆，筆尖在左邊）
const PEN = '<svg viewBox="0 0 160 30" xmlns="http://www.w3.org/2000/svg"><path d="M44 11L150 8.5Q159 15 150 21.5L44 19Z" fill="#5A2E1C" stroke="#2E1408"/><path d="M52 13L146 11.5" stroke="#C08A60" stroke-width="1.6" opacity=".6" fill="none"/><rect x="29" y="10" width="17" height="10" rx="1.5" fill="#C9A24E" stroke="#6E5020"/><path d="M29 10.5L2 15L29 19.5Z" fill="#E0CB98" stroke="#6E5020" stroke-linejoin="round"/><path d="M4 15H21" stroke="#3A2410" stroke-width=".9"/><circle cx="22.5" cy="15" r="1.7" fill="#3A2410"/></svg>';

// ---------- 跟伺服器問到的（只放記憶體；換帳號就清掉） ----------
const BOX = { uid: null, view: null, at: 0, skew: 0, busy: null, errAt: 0 };
const DRAFT = { choice: null, name: "" }; // 還沒送出的：關掉再打開還在
// 開發用：模擬器實測時網址加 ?votenow=2026-12-13T10:00:00+08:00 假裝現在是什麼時候（呼叫時帶 testNow，正式站的伺服器不理它）
const devOffset = (() => {
  if (!import.meta.env.DEV) return null;
  const v = Date.parse(String(new URLSearchParams(location.search).get("votenow") || "").split(" ").join("+"));
  return Number.isFinite(v) ? v - Date.now() : null;
})();
const clientNow = () => (NET.voteNow ? NET.voteNow() : devOffset !== null ? Date.now() + devOffset : nowMs()); // NET.voteNow：假伺服器給的假時間
const voteClock = () => clientNow() + BOX.skew;
const times = () => voteUiTimes(BOX.view);
const can = () => !!(P && !isFree(P) && UI.net && NET.loggedIn);
function sameAccount() {
  const uid = (NET.me && NET.me.id) || null;
  if (BOX.uid === uid) return;
  Object.assign(BOX, { uid, view: null, at: 0, skew: 0, busy: null, errAt: 0 });
  Object.assign(DRAFT, { choice: null, name: "" });
}
async function ask(data) {
  sameAccount();
  const uid = BOX.uid;
  const r = await NET.call("storyVote", devOffset !== null ? Object.assign({ testNow: clientNow() }, data) : data);
  if (!r || !r.phase) throw new Error("storyVote 的回應看不懂");
  if (uid === BOX.uid) Object.assign(BOX, { view: r, at: Date.now(), errAt: 0, skew: Number.isFinite(r.now) ? r.now - clientNow() : 0 });
  return r;
}
function peek() {
  if (!BOX.busy) {
    BOX.busy = ask({ op: "peek" }).then(() => true, e => { BOX.errAt = Date.now(); console.warn("全館投票讀不到", e); return false; })
      .then(ok => { BOX.busy = null; if (ok) refresh(); return ok; });
  }
  return BOX.busy;
}
// 時間窗裡、手上的太舊（或照時間已經換段了）才問。ever：館友證用，公布很久以後也問得到
function ensure(ever) {
  if (!can()) return false;
  sameAccount();
  const now = voteClock(), t = times();
  if (!(ever ? voteUiEver(now, t) : voteUiShow(now, t))) return false;
  const age = Date.now() - BOX.at;
  const stale = !BOX.view || age > TTL || (voteUiPhaseAt(now, t) !== BOX.view.phase && age > 20000);
  if (stale && !BOX.busy && Date.now() - BOX.errAt > RETRY) peek();
  return true;
}

// ---------- 入口 ----------
function entry() {
  if (!can()) return null;
  sameAccount();
  const e = voteUiEntry(voteClock(), BOX.view);
  if (e) ensure(false);
  return e;
}
function entryCard(e) {
  return h("button", { type: "button", class: "vote-entry vote-k-" + e.key + (e.todo ? " todo" : ""), onClick: () => openVote() },
    h("span", { class: "vote-entry-pen", "aria-hidden": "true", html: PEN }),
    h("span", { class: "vote-entry-t" }, h("b", null, e.title), h("small", null, e.sub)),
    h("span", { class: "vote-entry-go" }, e.go, " ", h("span", { "aria-hidden": "true" }, "→")));
}
function fillSlot(el) {
  const e = entry();
  el.replaceChildren(...(e ? [entryCard(e)] : []));
  const lobby = el.closest(".l2"); if (lobby) lobby.classList.toggle("vote-on", !!e); // 大廳多了壹條：電腦的導覽圖縮壹點（css/vote.css）
}
// 大廳（where "lobby"）、任務板（"board"）放卡的位子：時間還沒到就是空的
ADDONS.voteSlot = where => {
  const el = h("div", { class: "vote-slot vote-slot-" + where });
  fillSlot(el);
  if (where === "lobby") { queueMicrotask(() => { const l = el.closest(".l2"); if (l) l.classList.toggle("vote-on", !!el.firstChild); }); every(() => { if (el.isConnected) fillSlot(el); }, 60000); }
  return el;
};
// 清單裡的壹項（ui_today.js 的 todayItems）：導覽列的數字、舊大廳的小牌子用
ADDONS.voteItem = () => {
  const e = entry();
  return e ? { key: "vote", ic: "scroll", title: e.title, sub: e.sub, todo: e.todo, label: e.go, go: () => openVote(), chip: VT.entry.chip } : null;
};
function refresh() {
  document.querySelectorAll(".vote-slot").forEach(fillSlot);
  updateBoardBadges();
}
// 館友證（只有自己的版本會叫）要的資料：寫下的名字、投了什麼、有沒有館史；版面在 ui_pass.js。redraw：問到了叫它重畫
ADDONS.votePass = redraw => {
  if (!ensure(true)) return null;
  if (BOX.busy) BOX.busy.then(ok => { if (ok) redraw(); });
  return voteUiPass(BOX.view);
};

// ---------- 投票的畫面 ----------
// o（開發、截圖用，平常不帶）：tab "history"、pick 預先選哪個、name 名字、edit 直接進改票、confirm 打開確認框、send 直接送出
export function openVote(o = {}) {
  if (!P) return;
  if (!can()) { note(VT.off); return; }
  sameAccount();
  if (!voteUiEver(voteClock(), times())) return;
  const V = { tab: o.tab === "history" ? "history" : "vote", editing: !!o.edit, sending: false, loading: true, err: null, shaky: voteUiShaky(P.sanity, P.dark), shook: false, shakeT: null, confirm: null, live: null, timer: null };
  const cfg = NUM.story.vote;
  if (cfg.options.includes(o.pick)) DRAFT.choice = o.pick;
  if (typeof o.name === "string") DRAFT.name = o.name;
  const m = overlay("nb-vote", VT.title, `${VT.title}：帳上的空欄`, "scroll", () => { clearInterval(V.timer); clearTimeout(V.shakeT); closeConfirm(); });

  // 還沒按送出的改票：把現在這壹票先放進表單
  const startEdit = () => { const mine = BOX.view && BOX.view.mine; DRAFT.choice = mine ? mine.choice : null; DRAFT.name = mine ? mine.name || "" : ""; V.editing = true; V.err = null; draw(); snd("flip"); };
  const stopEdit = () => { V.editing = false; V.err = null; DRAFT.choice = null; DRAFT.name = ""; draw(); snd("flip"); };
  const load = async quiet => {
    V.loading = true;
    if (!quiet) { V.err = null; draw(); }
    try { await ask({ op: "peek" }); if (V.err && V.err.kind === "peek") V.err = null; }
    catch (e) { BOX.at = BOX.errAt = Date.now(); V.err = { kind: "peek", text: VT.net.peek }; console.warn("全館投票讀不到", e); }
    V.loading = false;
    draw(); refresh();
  };
  const submit = async data => {
    if (V.sending) return;
    V.sending = true; V.err = null; draw();
    try {
      const r = await ask(data);
      if (r.ok) { Object.assign(DRAFT, { choice: null, name: "" }); V.editing = false; snd("unlock"); }
      else {
        V.err = { kind: "why", why: r.why, text: voteUiWhy(r.why, r.reason) };
        if (!["noName", "longName", "badName", "badChoice"].includes(r.why)) V.editing = false; // 名字、選項的問題留在表單改；其他照伺服器現在的樣子畫
        snd("flip");
      }
    } catch (e) { V.err = { kind: "net", data, text: VT.net.vote }; console.warn("全館投票送不出去", e); }
    V.sending = false;
    draw(); refresh();
  };

  // ---------- 確認框 ----------
  function closeConfirm() { if (!V.confirm) return; const c = V.confirm; V.confirm = null; window.removeEventListener("keydown", c.key, true); c.el.remove(); if (c.back && c.back.isConnected) c.back.focus({ preventScroll: true }); }
  function openConfirm(data, edit) {
    closeConfirm();
    const C = VT.confirm, title = edit ? C.editTitle : C.title;
    const no = btn(C.no, () => closeConfirm(), "vote-no-btn"), yes = btn(C.yes, () => { closeConfirm(); submit(data); }, "primary vote-yes");
    const box = h("div", { class: "vote-confirm-box", role: "dialog", "aria-modal": "true", "aria-label": title },
      h("h3", null, title),
      h("dl", null, h("dt", null, C.choice), h("dd", null, voteUiOption(data.choice)), data.name ? [h("dt", null, C.name), h("dd", { class: "vote-ink" }, data.name)] : null),
      h("ul", null, VT.rules.map(r => h("li", null, voteUiSay(r, { n: cfg.changes })))),
      edit ? h("p", { class: "vote-last" }, C.last) : null,
      h("div", { class: "vote-btns" }, no, yes));
    const el = h("div", { class: "vote-confirm", onClick: e => { if (e.target === el) closeConfirm(); } }, box);
    // 掛在 window：比外框的鍵盤監聽早收到，Esc 只關確認框、Tab 只在兩顆按鈕之間
    const key = e => {
      if (!el.isConnected) { window.removeEventListener("keydown", key, true); return; }
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); closeConfirm(); }
      else if (e.key === "Tab") { e.preventDefault(); e.stopImmediatePropagation(); (document.activeElement === no ? yes : no).focus(); }
    };
    V.confirm = { el, key, back: document.activeElement };
    window.addEventListener("keydown", key, true);
    m.layer.append(el);
    no.focus({ preventScroll: true });
  }

  // ---------- 零件 ----------
  const left = (until, tpl, cls) => h("p", { class: cls || "vote-left-t", "data-vote-until": until, "data-vote-tpl": tpl }, voteUiSay(tpl, { left: voteUiLeft(until - voteClock()) }));
  const shake = () => (V.shaky && V.form && !V.shook ? " vote-shake" : ""); // 理智低、正在投：畫出來的時候抖壹下。只動位置，不改玩家選的、打的，也不擋點擊
  const ledgerText = (choice, name) => (choice === cfg.nameChoice ? name || VT.blankMark : choice ? VT.field[choice] : VT.blankMark);
  // 帳頁：上面幾列是看不清楚的舊墨跡，中間那格是空欄
  function ledger(text, filled, pen, title) {
    const old = w => h("div", { class: "vote-row", "aria-hidden": "true" }, h("span", null, h("i", { style: { width: w[0] + "%" } })), h("span", null, h("i", { style: { width: w[1] + "%" } })));
    const field = h("span", { class: "vote-field" + (filled ? " ink" : "") }, text);
    return { field, el: h("div", { class: "vote-ledger pen-" + (pen || "rest") }, h("h3", null, title || VT.ledger), old([62, 48]), old([45, 70]), old([70, 36]),
      h("div", { class: "vote-row vote-you" }, h("span", { "aria-hidden": "true" }, h("i", { style: { width: "55%" } })), field),
      h("div", { class: "vote-pen" + shake(), "aria-hidden": "true", html: PEN })) };
  }
  const pages = () => {
    const n = voteUiPages(weekUnderstood().near);
    return n ? h("div", { class: "vote-pages" }, h("span", null, voteUiSay(VT.pages.text, { n })),
      PANELS.pass ? btn([VT.pages.go, " ", h("span", { "aria-hidden": "true" }, "→")], () => { m.close(); PANELS.pass({ tab: "pepe" }); }, "small") : null) : null;
  };
  // 自己那壹票。帳頁那壹格已經寫著名字時不再寫壹次（公布以後帳頁寫的是全館的結果，withName 才把名字寫在這裡）
  const myTicket = (label, mine, withName) => {
    const named = mine.choice === cfg.nameChoice && mine.name;
    return h("dl", { class: "vote-ticket" }, h("dt", null, label), h("dd", null, voteUiOption(mine.choice)),
      named && withName ? [h("dt", null, VT.mine.name), h("dd", { class: "vote-ink" }, mine.name)] : null,
      named ? h("dd", { class: "vote-own" }, withName ? VT.mine.own : VT.mine.ownHere) : null);
  };

  function formPane(view, edit) {
    const mine = edit ? view.mine : null;
    const hint = h("p", { class: "vote-hint", "aria-live": "polite" }), send = btn(V.sending ? VT.sending : edit ? VT.sendEdit : VT.send, () => { const f = voteUiForm(DRAFT, mine); if (f.ok && !V.sending) openConfirm(f.data, edit); }, "primary vote-send");
    let counter = null, input = null;
    const list = h("div", { class: "vote-opts", role: "radiogroup", "aria-label": VT.title }, cfg.options.map(id => {
      const on = DRAFT.choice === id;
      const card = h("button", { type: "button", role: "radio", "aria-checked": String(on), class: "vote-opt" + (on ? " on" : "") + shake(), disabled: V.sending, dataset: { vote: id },
        onClick: () => { DRAFT.choice = id; V.err = null; draw(); snd("flip"); const i = m.surface.querySelector(".vote-name-in"); if (id === cfg.nameChoice && i) { i.scrollIntoView({ block: "nearest" }); if (matchMedia("(pointer: fine)").matches) i.focus(); } } },
        h("span", { class: "vote-opt-mark", "aria-hidden": "true" }), h("span", { class: "vote-opt-t" }, h("b", null, voteUiOption(id)), h("small", null, VT.desc[id])), on ? h("span", { class: "vote-opt-on", "aria-hidden": "true" }, VT.picked) : null);
      if (!on || id !== cfg.nameChoice) return card;
      counter = h("span", { class: "vote-count" });
      input = h("input", { type: "text", class: "vote-name-in" + shake(), autocomplete: "off", spellcheck: "false", enterkeyhint: "done", placeholder: VT.name.hold, disabled: V.sending,
        onInput: e => { DRAFT.name = e.target.value; if (V.err && V.err.kind === "why") { V.err = null; const a = m.surface.querySelector(".vote-alert"); if (a) a.remove(); } V.live(); },
        onKeydown: e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); input.blur(); send.click(); } } });
      input.value = DRAFT.name; // 不設 maxlength：太長不幫玩家砍字，只擋送出
      return [card, h("label", { class: "vote-name" }, h("span", { class: "vote-name-h" }, VT.name.label, counter), input)];
    }));
    const foot = h("div", { class: "vote-foot" }, h("div", { class: "vote-foot-t" }, left(view.closesAt, `${voteUiSay(VT.open.close, { when: voteUiWhen(view.closesAt) })}・${VT.open.left}`), hint),
      h("div", { class: "vote-btns" }, edit ? btn(VT.mine.cancel, stopEdit, "vote-cancel", { disabled: V.sending }) : null, send));
    // 打字、選擇的時候只換這幾個地方（整個重畫會打斷輸入法）
    V.live = () => {
      const f = voteUiForm(DRAFT, mine), nm = voteUiName(DRAFT.name);
      send.disabled = !f.ok || V.sending; hint.textContent = f.hint;
      if (counter) { counter.textContent = voteUiSay(VT.name.count, { n: nm.len, max: cfg.nameMax }); counter.classList.toggle("over", nm.why === "longName"); }
      if (V.field) { const t = ledgerText(DRAFT.choice, nm.name); V.field.textContent = t; V.field.classList.toggle("ink", !!DRAFT.choice); }
    };
    return { right:[h("p", { class: "vote-lead" }, VT.lead), list, pages()], foot };
  }
  function beforePane(view) {
    return [h("h3", { class: "vote-head" }, voteUiSay(VT.before.head, { when: voteUiWhen(view.opensAt) })), left(view.opensAt, VT.before.left, "vote-big-left"), h("p", { class: "vote-lead" }, VT.lead),
      h("p", { class: "vote-sub" }, VT.before.what),
      h("ul", { class: "vote-slips" }, cfg.options.map(id => h("li", null, h("b", null, voteUiOption(id)), h("small", null, VT.desc[id])))), pages()];
  }
  function minePane(view, locked) {
    return [h("h3", { class: "vote-head" }, VT.mine.head), myTicket(VT.mine.chose, view.mine),
      left(view.closesAt, `${voteUiSay(VT.open.close, { when: voteUiWhen(view.closesAt) })}・${VT.open.left}`),
      locked ? h("p", { class: "vote-locked" }, VT.mine.locked) : h("div", { class: "vote-change" }, h("span", null, voteUiSay(VT.mine.can, { n: view.changesLeft })), btn(VT.mine.change, startEdit, "primary")),
      locked ? null : pages()];
  }
  function countingPane(view) {
    return [h("h3", { class: "vote-head" }, VT.counting.head), h("p", { class: "vote-sub" }, voteUiSay(VT.counting.when, { when: voteUiWhen(view.resultAt) })), left(view.resultAt, VT.counting.left, "vote-big-left"),
      view.mine ? myTicket(VT.counting.mine, view.mine) : h("p", { class: "vote-none" }, VT.counting.none)];
  }
  const bars = list => h("ul", { class: "vote-bars" }, list.map(x => h("li", { class: x.win ? "win" : "" },
    h("span", { class: "vote-bar-l" }, x.label, x.win ? h("em", null, VT.result.written) : null), h("b", null, `${x.pct}%`),
    h("span", { class: "vote-bar", "aria-hidden": "true" }, h("i", { style: { width: x.pct + "%" } })))));
  function resultPane(view) {
    const r = view.result;
    const toHistory = h("div", { class: "vote-change" }, btn([VT.result.toHistory, " ", h("span", { "aria-hidden": "true" }, "→")], () => { V.tab = "history"; draw(); snd("flip"); }, "primary"));
    if (!r) return [h("p", { class: "vote-none" }, VT.result.wait), h("div", { class: "vote-change" }, btn(VT.net.retry, () => load(), "primary"))];
    const list = voteUiShares(r);
    return [h("p", { class: "vote-sub" }, VT.result.share), bars(list), list.every(x => !x.pct) ? h("p", { class: "vote-none" }, VT.result.nobody) : null,
      view.mine ? myTicket(VT.result.mine, view.mine, true) : h("p", { class: "vote-none" }, VT.result.none), toHistory];
  }
  function historyPane(view) {
    const list = Array.isArray(view.history) ? view.history : [];
    if (!list.length) return h("div", { class: "vote-empty" }, h("span", { class: "vote-empty-pen", "aria-hidden": "true", html: PEN }), h("p", null, VT.history.empty));
    return h("ol", { class: "vote-line" }, list.map(x => h("li", null, h("time", null, voteUiWhen(x.at)),
      h("article", null, h("h3", null, x.title || ""), h("p", { class: "vote-line-text" }, x.text || ""),
        x.share ? [h("p", { class: "vote-sub" }, VT.history.share), bars(voteUiShares(x))] : null))));
  }
  const alertBox = () => {
    const e = V.err;
    if (!e) return null;
    return h("div", { class: "vote-alert", role: "alert" }, h("span", null, e.text),
      e.kind === "peek" ? btn(VT.net.retry, () => load(), "small") : e.kind === "net" ? btn(VT.net.resend, () => submit(e.data), "small", { disabled: V.sending }) : null);
  };

  function draw() {
    if (!m.layer.isConnected) return;
    const view = BOX.view, mode = view ? voteUiMode(view) : null;
    if (view && mode !== "mine") V.editing = false;
    const form = mode === "pick" || (mode === "mine" && V.editing);
    V.form = form;
    if (!form) closeConfirm(); // 開著確認框的時候截止了：收掉
    const old = m.surface.querySelector(".vote-body"), keepY = old ? old.scrollTop : 0;
    const act = document.activeElement, typing = act && act.classList && act.classList.contains("vote-name-in") ? [act.selectionStart, act.selectionEnd] : null;
    const phaseTab = mode === "before" ? VT.tabs.before : mode === "counting" ? VT.tabs.counting : mode === "result" ? VT.tabs.result : VT.tabs.open;
    const tabs = h("div", { class: "nb-tabs vote-tabs", role: "tablist", "aria-label": VT.title }, [["vote", phaseTab], ["history", VT.tabs.history]].map(([id, name]) =>
      h("button", { type: "button", role: "tab", "aria-selected": String(V.tab === id), class: "nb-tab" + (V.tab === id ? " on" : ""), onClick: () => { V.tab = id; draw(); snd("flip"); } }, name)));
    let body, foot = null;
    V.field = null; V.live = null;
    if (!view) body = h("div", { class: "vote-wait" }, V.loading ? h("p", { class: "nb-empty" }, VT.net.loading) : alertBox());
    else if (V.tab === "history") body = [alertBox(), historyPane(view)];
    else {
      let pen = "rest", text = VT.blankMark, filled = false, title = "", right;
      if (form) { const f = formPane(view, mode === "mine"); right = f.right; foot = f.foot; pen = DRAFT.choice || "rest"; }
      else if (mode === "before") right = beforePane(view);
      else if (mode === "counting") right = countingPane(view);
      else if (mode === "result") { right = resultPane(view); if (view.result) { pen = view.result.winner; text = voteUiOption(view.result.winner); filled = true; title = VT.result.head; } } // 公布了：帳頁寫的是全館的結果
      else right = minePane(view, mode === "locked");
      if (view.mine && (mode === "mine" || mode === "locked" || mode === "counting") && !form) { pen = view.mine.choice; text = ledgerText(view.mine.choice, view.mine.name); filled = true; }
      const L = ledger(text, filled, pen, title);
      if (form) V.field = L.field;
      body = h("div", { class: "vote-grid vote-m-" + mode + (form ? " vote-form" : "") },
        h("div", { class: "vote-side" }, V.shaky && form ? h("p", { class: "vote-shaky" }, h("b", null, VT.shaky), h("small", null, VT.shakyNote)) : null, L.el),
        h("div", { class: "vote-main" }, alertBox(), right));
      if (V.shaky && form && !V.shook && !V.shakeT) V.shakeT = setTimeout(() => { V.shook = true; }, 1600); // 只在第壹次畫出表單時抖，之後重畫不再抖
    }
    m.surface.replaceChildren(tabs, h("div", { class: "vote-body" }, body), ...(foot ? [foot] : []));
    if (V.live) V.live();
    const now = m.surface.querySelector(".vote-body"); if (now) now.scrollTop = keepY;
    if (typing) { const i = m.surface.querySelector(".vote-name-in"); if (i && !i.disabled) { i.focus({ preventScroll: true }); i.setSelectionRange(typing[0], typing[1]); } }
  }

  // 倒數每秒換字；照時間換段了（開投、截止、公布）就重新問
  V.timer = setInterval(() => {
    if (!m.layer.isConnected) { clearInterval(V.timer); return; }
    const view = BOX.view;
    if (!view) return;
    const now = voteClock();
    m.surface.querySelectorAll("[data-vote-until]").forEach(el => { el.textContent = voteUiSay(el.dataset.voteTpl, { left: voteUiLeft(+el.dataset.voteUntil - now) }); });
    if (voteUiPhaseAt(now, times()) !== view.phase && !V.loading && !V.sending && Date.now() - BOX.at > 4000) load(true);
  }, 1000);
  snd("flip");
  load().then(() => {
    const mode = BOX.view && voteUiMode(BOX.view);
    if (!(o.confirm || o.send) || !(mode === "pick" || (mode === "mine" && V.editing))) return;
    const f = voteUiForm(DRAFT, mode === "mine" ? BOX.view.mine : null);
    if (!f.ok) return;
    if (o.send) submit(f.data); else openConfirm(f.data, mode === "mine");
  });
}
PANELS.vote = openVote;
