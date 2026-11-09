// ================================================================
//  參觀館友的展廳、送佩佩、伺服器的信（多人版 M2，docs/多人實作.md）。對方不在線也能用。
//  翊文 11-09：「之後可以參觀館友的展廳、送佩佩……也要加入立即可以使用的功能」→ 館友名片上直接有按鈕、做好就上線、收到的東西馬上能用、不用等對方在線。
//  規則在 shared/gifts.js、shared/mailbox.js、shared/visit.js；伺服器在 functions/visit.js。樣式在 css/visit.css。
//  - 館友小卡：「參觀展廳」「送佩佩」（登記在 ui_core.js 的 FRIEND_ACTIONS）。
//  - 走進館友的展廳：go("hall", { friend: { id, nick } })，SCREENS.hall 看到 friend 就叫這裡（ADDONS.friendHall）。
//    只畫內建的樣子（玩家自己的圖不上傳，規劃第一節第 5 點）；按讚、留言每天每間一次。
//  - 送佩佩：蓋在畫面上的木框。先選一隻，再按「送給 ○○」（送出去就拿不回來）。
//  - 信箱（ui_board.js）：ADDONS.serverMail 給它伺服器的信。領佩佩的那一封有「馬上使用」：擺上展廳、拿去融合。
//  - 誰來過：大廳一條（ADDONS.lobbyGuests，有新的才出現）、自己的展廳一塊（ADDONS.hallGuests）。
//  伺服器改了我的存檔（送佩佩、領信）：先 NET.flush()，回來 reloadSave()（docs/多人實作.md 原則 3）。
//  玩家打的字（暱稱、留言）只當資料：一律用 h() 的文字，不用 html。
// ================================================================
import { HALL_THEME_TEXT } from "../../shared/content.js";
import { canGive, cleanHallNote, giftCount, SOCIAL } from "../../shared/gifts.js";
import { NUM } from "../../shared/config.js";
import { FAILED, ROLLED, describePepe, describePillow, fromKey, isFree, nowMs, parsePillowKey } from "../../shared/logic.js";
import { ART } from "./art.js";
import { NET } from "./net_firebase.js";
import { $, ADDONS, FRIEND_ACTIONS, P, PANELS, UI, btn, collectionItems, go, h, holdItem, icon, itemHTML, note, rdot, rerender, showEvents, snd, updateBoardBadges, updateStatus } from "./ui_core.js";
import { overlay } from "./ui_board.js";
import { reloadSave } from "./ui_login.js";
import { roomHead } from "./ui_screens1.js";
import { learnText } from "../../shared/shop.js";

const md = d => (d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : ""); // "2026-11-09" → "11/9"
const arrow = () => h("span", { "aria-hidden": "true" }, "→");
const canGiftHere = () => !!P && !isFree(P);

// ---------- 走進館友的展廳 ----------
// 別人展台上的那一件：只畫內建的樣子，不套我圖庫裡的圖，也不看我的收藏
function slotArt(s) {
  if (s.kind === "pillow") {
    const pp = parsePillowKey(s.key);
    return ART.pillow(pp.pick, pp.print ? pp.print.pick : null, { failed: !!(pp.print && pp.print.kind === "failed"), perfect: !!s.printPerfect });
  }
  return ART.frog(fromKey(s.key), { failed: s.kind === "failed", perfect: !!s.perfect, fx: s.kind === "pepe" });
}
function slotLabel(s) {
  if (s.kind === "pillow") { const d = describePillow(s.key); return h("div", { class: "ped-label" }, h("b", null, d.title), h("span", null, d.printed)); }
  const pick = fromKey(s.key), d = describePepe(pick, { failed: s.kind === "failed" });
  const rarity = s.kind === "failed" ? FAILED : s.kind === "repaired" ? "修復品" : pick[ROLLED];
  return h("div", { class: "ped-label" }, h("b", null, (s.title ? `「${s.title}」` : "") + d.title), h("span", null, rdot(rarity), " ", rarity, s.perfect ? "・完美作品" : ""));
}
function friendPedestal(s, i, deco) {
  const block = h("div", { class: "ped-block" }, deco ? h("div", { class: "stand-deco", html: ART.standDeco(deco), "aria-hidden": "true" }) : null);
  return h("div", { class: "ped-slot" + (s ? " full" : "") + (deco ? " has-deco" : ""), "aria-label": s ? `展台 ${i + 1}` : `展台 ${i + 1}：空的` },
    h("div", { class: "ped-art", html: s ? slotArt(s) : "" }), block, s ? slotLabel(s) : h("div", { class: "ped-label empty" }, "空展台"));
}
const stillHere = params => UI.screen === "hall" && UI.params === params;

// 參觀完成時叫一次（走進來、讀到展廳之後）。ctx：{ owner: { id, nick }, view, first（今天第一次來這間）, gain, learn }
// 跟館友學的接口（claude/兌換所和技能，合併時接）：伺服器的 visitHall 學到了就回傳 learn（functions/visit.js 的 LEARN_ON_VISIT），
// 跟館友學（決定 0032）：今天第一次走進這間展廳，伺服器叫 learnFromFriend；那一句話跟一起融合同一句（shared/shop.js 的 learnText）。要在參觀完成時多做什麼，加在 visitDone。
function visitDone(ctx) { /* 現在沒有要多做的 */ }
function visitLearnLine(learn, who) {
  if (!learn) return null;
  return h("p", { class: "fh-learn" + (learn.gained ? " got" : "") }, learnText(learn, who));
}

async function loadVisit(f, params) {
  const st = f.st;
  st.loading = true;
  st.err = null;
  try {
    await NET.flush().catch(() => {}); // 跟館友學可能改到我的存檔：先把我的送上去
    const r = await NET.call("visitHall", { owner: f.id });
    st.data = r;
    if (r.rev) await reloadSave(r.rev);
    visitDone({ owner: r.owner, view: r.view, first: r.first, gain: r.gain, learn: r.learn });
  } catch (e) { st.err = e.message || "走不進去，等壹下再試。"; }
  st.loading = false;
  if (stillHere(params)) rerender();
}
async function hallAct(f, params, kind, text) {
  const st = f.st;
  if (st.busy) return;
  st.busy = kind;
  if (stillHere(params)) rerender(); // 按鈕先變成「……」，伺服器可能要等幾秒
  try {
    const r = await NET.call("hallAct", { owner: f.id, kind, text });
    Object.assign(st.data, { likes: r.likes, notes: r.notes, mine: r.mine });
    if (kind === "note") { st.draft = ""; st.noteErr = ""; }
    snd(kind === "like" ? "coin" : "submit");
    note(kind === "like" ? `你給 ${st.data.owner.nick} 的展廳按了讚。` : "留言留好了。", "good");
  } catch (e) {
    snd("error");
    if (kind === "note") st.noteErr = e.message || "留不了。"; else note(e.message || "沒辦法。", "bad");
  }
  st.busy = false;
  if (stillHere(params)) rerender();
}
function friendHall(root, params) {
  const f = params.friend;
  const st = f.st || (f.st = { loading: false, data: null, err: null, draft: "", noteErr: "", busy: false });
  if (!st.data && !st.err && !st.loading) loadVisit(f, params);
  const tools = [btn("回我的展廳", () => go("hall", {}, { action: false }), "ghost"), PANELS.friends ? btn([icon("users"), " 館友"], () => PANELS.friends(), "ghost") : null];
  const d = st.data;
  if (!d) {
    root.append(roomHead(`${f.nick} 的展廳`, st.err ? "走不進去。" : "正在走進去……", ...tools),
      st.err ? h("div", { class: "fh-closed" }, h("p", null, st.err), btn("再試壹次", () => { st.err = null; rerender(); }, "primary")) : null);
    return;
  }
  const nick = d.owner.nick;
  if (!d.open) {
    root.append(roomHead(`${nick} 的展廳`, "還沒開館", ...tools), h("div", { class: "fh-closed" }, h("p", null, `${nick} 的展廳還沒開館：還沒有用挑戰模式進過館。`), h("p", { class: "sub" }, "等開館了再來看看。")));
    return;
  }
  const v = d.view, theme = v.theme ? HALL_THEME_TEXT[v.theme] : null;
  const hasAny = v.slots.some(Boolean);
  const plate = h("div", { class: "hall-limited" }, h("div", { class: "hall-plate" + (v.frame ? " lim-" + v.frame : "") },
    v.frame ? h("span", { class: "lim-c tl", html: ART.nameCorner(v.frame), "aria-hidden": "true" }) : null,
    v.frame ? h("span", { class: "lim-c br", html: ART.nameCorner(v.frame), "aria-hidden": "true" }) : null,
    h("small", null, "館主"), h("b", null, nick)));
  const wall = h("div", { class: "hall-wall" + (theme ? " themed" : "") },
    theme ? h("div", { class: "theme-name enter" }, h("h2", null, theme.name), h("p", null, theme.wall))
      : h("p", { class: "theme-hint" }, hasAny ? "牆上還沒有主題。" : "展台上還沒有東西。"));
  const room = h("div", { class: "hall-room visit" }, v.slots.map((s, i) => friendPedestal(s, i, s ? v.deco : null)));
  // 按讚、留言（每天每間一次；寫在用得到的地方）
  const like = d.mine.liked ? h("p", { class: "fh-done" }, icon("heart"), " 今天按過讚了，明天再來。")
    : btn([icon("heart"), st.busy === "like" ? " 按讚中……" : " 按讚"], () => hallAct(f, params, "like"), "primary", { disabled: st.busy || undefined });
  let noteBox;
  if (d.mine.noted) noteBox = h("p", { class: "fh-done" }, `你今天留的話：「${d.mine.noted}」明天可以再留壹句。`);
  else {
    const count = h("small", { class: "fh-count" }, `${[...st.draft].length}／${SOCIAL.noteMax}`);
    const err = h("p", { class: "fh-err", role: "alert" }, st.noteErr || "");
    const input = h("input", { class: "t-input fh-input", maxlength: String(SOCIAL.noteMax * 2), "aria-label": `給 ${nick} 留壹句話`, placeholder: "留壹句話" });
    input.value = st.draft;
    input.addEventListener("input", () => { st.draft = input.value; count.textContent = `${[...st.draft].length}／${SOCIAL.noteMax}`; });
    const form = h("form", { class: "fh-form" }, h("div", { class: "fh-form-row" }, input, h("button", { type: "submit", class: "btn small", disabled: st.busy || undefined }, st.busy === "note" ? "留言中……" : "留言")), h("div", { class: "fh-form-foot" }, err, count));
    form.addEventListener("submit", e => {
      e.preventDefault();
      const c = cleanHallNote(st.draft);
      if (!c.ok) { err.textContent = c.reason; st.noteErr = c.reason; snd("error"); return; }
      hallAct(f, params, "note", c.text);
    });
    noteBox = form;
  }
  const notes = d.notes.length ? d.notes.map(n => h("div", { class: "visitor" }, h("p", null, `「${n.text}」`), h("p", { class: "sub" }, `— ${n.nick}　${md(n.day)}`)))
    : [h("p", { class: "empty" }, "還沒有人留話。")];
  const side = h("aside", { class: "visitors fh-side" },
    h("div", { class: "fh-acts" }, h("p", { class: "fh-likes" }, icon("heart"), ` ${d.likes} 個讚`), like,
      h("p", { class: "fh-rule" }, `每天每間可以按讚壹次、留壹句話（${SOCIAL.noteMax} 字以內）。`), noteBox,
      d.first && d.gain ? h("p", { class: "fh-first" }, `你今天第壹次來：${nick} 的信箱多了壹封謝禮（靈感 +${d.gain}）。`) : null),
    h("h3", null, "館友留言"), notes);
  root.append(roomHead(`${nick} 的展廳`, `評分 ${v.score}／100`, ...tools), plate, wall, h("div", { class: "hall-wrap fh-wrap" }, room, side), visitLearnLine(d.learn, nick));
}
ADDONS.friendHall = friendHall;
FRIEND_ACTIONS.push({ id: "visit", label: "參觀展廳", show: () => !!P, run: p => go("hall", { friend: { id: p.id, nick: p.nick } }, { action: false }) });

// ---------- 送佩佩 ----------
const NO_GIVE = { injured: "受傷了", in_cellar: "在地下", on_show: "在展台上" };
const GIFT_TABS = [["pepe", "佩佩"], ["failed", "失敗作"], ["repaired", "修復品"]];
export function openGift(friend) {
  if (!canGiftHere()) { note("要先用挑戰模式的參觀者進館，才能送佩佩。", "bad"); return; }
  const m = overlay("nb-gift", "送佩佩", `送佩佩給 ${friend.nick}`, "heart");
  let tab = "pepe", sel = null, busy = false, limit = NUM.guest.giftListMax, sent = null;
  const titleOf = it => {
    const e = it.kind === "pepe" ? P.pepes[it.key] : null;
    const d = describePepe(it.pick, { failed: it.kind === "failed" });
    return (e && e.title ? `「${e.title}」` : "") + d.title + (it.kind === "failed" ? "（失敗作）" : it.kind === "repaired" ? "（修復品）" : "");
  };
  const send = async () => {
    if (busy || !sel) return;
    busy = true;
    draw();
    try {
      await NET.flush().catch(() => {});
      const r = await NET.call("sendGift", { to: friend.id, item: { kind: sel.kind, key: sel.key } });
      await reloadSave(r.rev); // 伺服器已經從我的收藏拿掉了
      sent = r.text;
      sel = null;
      snd("coin");
      note(`寄出去了：${r.text}。${friend.nick} 的信箱多了壹封。`, "good");
      updateStatus();
    } catch (e) { snd("error"); note(e.message || "送不出去。", "bad"); }
    busy = false;
    if (m.layer.isConnected) draw();
  };
  const draw = () => {
    if (!m.layer.isConnected || !canGiftHere()) return;
    m.setTop(h("span", { class: "nf-count" }, `給 ${friend.nick}`));
    const items = collectionItems(tab).map(it => ({ it, can: canGive(P, it) }));
    items.sort((a, b) => (b.can.ok ? 1 : 0) - (a.can.ok ? 1 : 0)); // 送得出去的排前面
    if (sel && !items.some(x => x.it.key === sel.key && x.it.kind === sel.kind && x.can.ok)) sel = null;
    const tabs = h("div", { class: "nb-tabs" }, GIFT_TABS.map(([k, name]) => h("button", { type: "button", class: "nb-tab" + (k === tab ? " on" : ""), onClick: () => { tab = k; sel = null; limit = NUM.guest.giftListMax; draw(); } }, `${name} ${collectionItems(k).length}`)));
    const tile = ({ it, can }) => {
      const on = !!sel && sel.key === it.key && sel.kind === it.kind;
      const n = giftCount(P, it.kind, it.key);
      return h("button", { type: "button", class: "pt-opt gf-opt" + (on ? " on" : "") + (can.ok ? "" : " no"), title: can.ok ? describePepe(it.pick, { failed: it.kind === "failed" }).full : can.reason, "aria-pressed": String(on),
        onClick: () => { if (!can.ok) { snd("error"); note(can.reason, "bad"); return; } sel = on ? null : it; sent = null; draw(); } },
        h("span", { class: "pt-opt-art", html: itemHTML(it) }), h("span", { class: "pt-opt-t" }, titleOf(it)),
        h("span", { class: "gf-n" }, can.ok ? (n > 1 ? `有 ${n} 隻` : "最後壹隻") : NO_GIVE[can.code] || "不能送"));
    };
    const list = items.length ? h("div", { class: "pt-pick gf-pick" }, items.slice(0, limit).map(tile), items.length > limit ? btn(`再多列（還有 ${items.length - limit} 隻）`, () => { limit += NUM.guest.giftListMax; draw(); }, "small gf-more") : null)
      : h("p", { class: "nb-empty" }, tab === "pepe" ? "收藏裡還沒有佩佩：先去手作坊做壹隻。" : "這壹類還沒有東西。");
    let foot;
    if (sel) {
      const can = canGive(P, sel);
      const lines = [];
      if (can.last) lines.push("這是你最後壹隻：送出去之後，你的收藏和圖鑑就沒有牠了。");
      if (can.perfect) lines.push("牠是完美作品：完美會跟著送出去。");
      else if (sel.kind === "pepe" && P.pepes[sel.key] && P.pepes[sel.key].perfect) lines.push("你有好幾隻：送出去的是普通的那隻，完美的留在你這裡。");
      foot = h("div", { class: "gf-sel" }, h("span", { class: "gf-sel-art", html: itemHTML(sel) }),
        h("div", { class: "gf-sel-body" }, h("b", null, titleOf(sel)), lines.map(t => h("p", null, t)), h("p", null, "送出去就拿不回來。")),
        btn(busy ? "寄送中……" : `送給 ${friend.nick}`, send, "primary", { disabled: busy || undefined }));
    } else foot = h("p", { class: "pt-hint gf-hint" }, sent ? `寄出去了：${sent}。還要再送的話，再選壹隻。` : "先選壹隻。");
    m.surface.replaceChildren(h("div", { class: "pt-wrap gf-wrap" },
      h("p", { class: "nb-hint pt-intro" }, `寄到 ${friend.nick} 的信箱：他不在線也收得到，上線後自己領（${SOCIAL.mailDays} 天沒領就不見）。受傷的、在地下的不能送；擺在展台上的，只有壹隻要先拿下來。`),
      tabs, list, foot));
  };
  draw();
  snd("flip");
}
FRIEND_ACTIONS.push({ id: "gift", label: "送佩佩", show: () => canGiftHere(), run: p => openGift(p) });

// ---------- 馬上使用（信箱領到佩佩之後） ----------
function placeNow(item, close) {
  const it = { kind: item.kind, key: item.key, pick: fromKey(item.key) };
  close();
  if (P.hall.some(s => !s)) { go("hall", { place: it }); note("擺上展台了。", "good"); return; }
  go("hall"); // 展台都滿了：拿在手上，讓玩家自己挑要換哪壹座（不要蓋掉別的）
  holdItem(it);
}
function fuseNow(item, close) {
  close();
  const slots = UI.fusion || (UI.fusion = [null, null]);
  slots[slots[0] ? (slots[1] ? 0 : 1) : 0] = { key: item.key };
  go("fusion");
  note("放上融合台了：再選壹隻配對。", "good");
}
// 信箱裡已領取的那封：牠還在收藏裡，才有「馬上使用」
function useRow(gift, close) {
  if (!canGiftHere() || !gift || !giftCount(P, gift.kind, gift.key)) return null;
  return h("div", { class: "nb-env-act fh-use" }, h("small", null, "馬上使用"),
    btn(["擺上展廳 ", arrow()], () => placeNow(gift, close), "primary small"),
    gift.kind === "pepe" ? btn(["拿去融合 ", arrow()], () => fuseNow(gift, close), "small") : null);
}

// ---------- 伺服器的信、誰來過 ----------
let serverMail = [];    // 還沒領的信
let guests = null;      // { likes, unseen, list }：讀到之前是 null
let told = false;       // 這次登入說過「你不在的時候」了沒
let lastSeenCall = 0;
let soonTimer = null;
export async function refreshSocial(o = {}) {
  if (!UI.net) return null;
  const r = await NET.call("socialNews", o);
  serverMail = r.mail || [];
  guests = r.guests || null;
  if (o.seen && guests) guests.unseen = 0; // list 裡的 fresh 留著：這次畫面還標得出哪些是新的
  updateBoardBadges();
  drawLobbyGuests();
  drawHallGuests();
  return r;
}
function refreshSoon() {
  if (soonTimer) return;
  soonTimer = setTimeout(() => {
    soonTimer = null;
    const onMine = UI.screen === "hall" && !UI.params.friend && !UI.params.week && !UI.params.view;
    refreshSocial(onMine ? { seen: true } : {}).catch(() => {});
  }, 500);
}
// 領信：先把我的存檔送上去，伺服器在同一個交易放進存檔、把信標成領過，回來重新讀存檔
async function claimServer(ids) {
  if (!canGiftHere()) { snd("error"); note("自由模式收不了佩佩：回挑戰模式再領。", "bad"); return null; }
  try {
    await NET.flush().catch(() => {});
    const r = await NET.call("claimMail", { ids });
    if (r.done.length) await reloadSave(r.rev);
    const gone = new Set(r.done.map(x => x.id).concat(r.skipped.map(x => x.id))); // 領不了的（已經領過、過期）也不用再列
    serverMail = serverMail.filter(x => !gone.has(x.id));
    updateBoardBadges(); updateStatus();
    if (r.skipped.length) note(`有 ${r.skipped.length} 封領不了：${r.skipped[0].reason}`, "bad");
    if (r.events && r.events.length) setTimeout(() => showEvents(r.events), 400);
    return r.total;
  } catch (e) { snd("error"); note(e.message || "領不了，等壹下再試。", "bad"); return null; }
}
ADDONS.serverMail = { list: () => serverMail, refresh: () => refreshSocial(), claim: claimServer, useRow };
ADDONS.mailCount = () => serverMail.length;

// 「小明、小華 來過你的展廳，留了 1 句話」
function guestWords(list) {
  const names = [...new Set(list.map(x => x.nick))];
  if (!names.length) return "";
  const notes = list.filter(x => x.note).length;
  return `${names.slice(0, 3).join("、")}${names.length > 3 ? ` 等 ${names.length} 位館友` : ""} 來過你的展廳${notes ? `，留了 ${notes} 句話` : ""}`;
}
// 進館時說壹次：你不在的時候發生了什麼（一則一則跳太吵，離線時累積的通知不跳）
function tellNews() {
  if (told) return;
  told = true;
  const parts = [];
  const words = guests ? guestWords(guests.list.filter(x => x.fresh)) : "";
  if (words) parts.push(words);
  if (serverMail.length) parts.push(`信箱有 ${serverMail.length} 封館友的信`);
  if (parts.length) note(`你不在的時候：${parts.join("；")}。`, "good");
}

// 大廳：有新的才出現
function drawLobbyGuests() {
  const box = $("#lobbyGuests");
  if (!box) return;
  const fresh = guests && guests.unseen ? guests.list.filter(x => x.fresh) : [];
  const n = serverMail.length;
  box.hidden = !fresh.length && !n;
  if (box.hidden) { box.replaceChildren(); return; }
  const last = fresh.find(x => x.note);
  box.replaceChildren(h("span", { class: "lf-tag" }, icon("users"), "館友來過"),
    h("div", { class: "lgu-body" }, fresh.length ? h("b", null, guestWords(fresh)) : null, last ? h("span", { class: "lgu-note" }, `${last.nick}：「${last.note}」`) : null, n ? h("span", { class: "lgu-note" }, `信箱有 ${n} 封館友的信。`) : null),
    fresh.length ? btn(["去展廳看 ", arrow()], () => go("hall"), "small") : null,
    n ? btn([icon("mail"), " 信箱"], () => PANELS.mail && PANELS.mail(), n && !fresh.length ? "primary small" : "small") : null);
}
ADDONS.lobbyGuests = () => {
  if (!UI.net || !P || isFree(P)) return null;
  const box = h("section", { class: "lobby-guests", id: "lobbyGuests", "aria-label": "館友來過", hidden: true });
  setTimeout(drawLobbyGuests, 0); // 畫面接上去之後才找得到 #lobbyGuests
  if (!told) refreshSocial().then(tellNews).catch(() => { told = false; });
  return box;
};

// 自己的展廳：誰來過、留了什麼話。看過了就不算新的
function hallGuestsBody() {
  if (!guests) return [h("h3", null, "館友來過"), h("p", { class: "hgu-none" }, "正在看訪客簿……")];
  const rows = guests.list.map(x => h("li", { class: "hgu-row" + (x.fresh ? " fresh" : "") },
    h("b", null, x.nick), h("small", null, md(x.day)), x.fresh ? h("span", { class: "hgu-new" }, "新") : null,
    x.like ? h("span", { class: "hgu-like" }, icon("heart"), " 按了讚") : null,
    x.note ? h("span", { class: "hgu-note" }, `「${x.note}」`) : (x.like ? null : h("span", { class: "hgu-just" }, "來看過"))));
  return [h("h3", null, "館友來過", h("small", null, guests.likes ? `累計 ${guests.likes} 個讚` : "")),
    rows.length ? h("ul", { class: "hgu-list" }, rows) : h("p", { class: "hgu-none" }, "還沒有館友來過。他們來參觀、按讚、留話，都會寫在這裡。")];
}
function drawHallGuests() {
  const box = $("#hallGuests");
  if (box) box.replaceChildren(...hallGuestsBody());
}
ADDONS.hallGuests = root => {
  if (!UI.net || !P || isFree(P)) return;
  const box = h("section", { class: "hall-guests", id: "hallGuests", "aria-label": "館友來過" }, ...hallGuestsBody());
  const head = root.querySelector(".hall-limited") || root.querySelector(".room-head");
  if (head) head.after(box); else root.prepend(box);
  // 重畫房間很頻繁（擺展台就重畫）：問伺服器最多壹分鐘壹次，或是有新的才問
  if (!guests || guests.unseen || nowMs() - lastSeenCall > 60000) {
    lastSeenCall = nowMs();
    refreshSocial({ seen: true }).catch(() => {});
  }
};

// ---------- 伺服器送來的通知 ----------
// 離線時累積的舊通知不一則一則跳（進館時 tellNews 一次說），只有剛剛發生的才跳
const recent = m => told && nowMs() - (m.at || 0) < 30000;
NET.on("message", m => {
  if (!m || !UI.net || (m.t !== "mail_new" && m.t !== "hall_news")) return;
  refreshSoon();
  if (!recent(m)) return;
  if (m.t === "mail_new") { snd("bell"); note(`${m.from} 送你壹隻佩佩：${m.text}。到信箱領。`, "good"); return; }
  if (m.what === "visit") note(`${m.from} 來參觀你的展廳${m.insp ? `：信箱多了壹封謝禮（靈感 +${m.insp}）` : ""}。`);
  else if (m.what === "like") note(`${m.from} 給你的展廳按了讚。`, "good");
  else if (m.what === "note") note(`${m.from} 在你的展廳留話：「${m.text}」`, "good");
});
NET.on("logout", () => {
  serverMail = [];
  guests = null;
  told = false;
  lastSeenCall = 0;
  if (soonTimer) { clearTimeout(soonTimer); soonTimer = null; }
});
