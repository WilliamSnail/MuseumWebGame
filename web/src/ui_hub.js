// ================================================================
//  大廳的總覽（翊文 11-10：「每樣都一整行太佔空間了，而且館友證也不在這裡……能不能我們整合，讓重要的事件一覽無遺」，決定 0061）
//  把原本各佔壹整行的四塊（下壹步、「今天」壹條、簽到、本週地下收藏庫）收成壹塊：
//    左邊：壹張小的館友證（暱稱、稱號、第幾天、收藏、週章），按了打開館友證和典藏冊。
//    右邊三列：下壹步｜今天的事壹件壹格（簽到、每日、每週、領獎勵、信箱、賭場、畫廊的今日特展）｜本週劇情（標題、剩幾天、劇情線的下壹步、按鈕）。
//  資料不另外存：格子跟「今天」清單同壹份（ui_today.js 的 todayChips），劇情那列在 ui_story.js（storyHub），節日和趣味節日在 ui_signin.js（hubExtras）。
//  自由模式沒有每日的事：這裡回 null，大廳照舊排（下壹步、節日）。
//  ui_core 不能 import 這個檔：這裡把自己登記進 ADDONS（lobbyHub、hubRefresh）。介面文字照第 1 代用「壹」。
// ================================================================
import { nextStep } from "../../shared/guide.js";
import { fromKey, isFree, num, todayStr } from "../../shared/logic.js";
import { passView } from "../../shared/pass.js";
import { storyState } from "../../shared/story.js";
import { NET } from "./net_firebase.js";
import { ADDONS, P, PANELS, UI, btn, cicon, freshTag, frogHTML, go, h, icon, navTo, titleTag } from "./ui_core.js";
import { hubExtras } from "./ui_signin.js";
import { showToday, storyHub } from "./ui_story.js";
import { openToday, todayChips, todayItems } from "./ui_today.js";

// 左邊的小館友證
function passCard() {
  const v = passView(P, { today: todayStr() }), c = v.card, top = v.pepe.recent[0];
  const nick = (UI.net && NET.me && NET.me.nick) || "館友";
  return h("button", { type: "button", class: "hub-pass", title: "打開館友證和典藏冊", onClick: () => PANELS.pass && PANELS.pass() },
    h("span", { class: "hp-top" }, h("span", null, "館友證"), h("span", { class: "hp-open" }, "典藏冊 →")),
    h("span", { class: "hp-main" },
      h("span", { class: "hp-photo", "aria-hidden": "true", html: top ? frogHTML(fromKey(top)) : "" }, top ? null : icon("user")),
      h("span", { class: "hp-id" },
        h("b", null, nick, c.title ? titleTag(c.title, "ps-ttl") : null),
        h("small", null, `第 ${c.dayNo} 天`, c.stamps !== null ? `・週章 ${c.stamps} 枚` : ""),
        h("small", null, `收藏 ${num(v.pepe.have)}／${num(v.pepe.total)}`))));
}

// 今天的事：壹件壹格。還沒做的亮著，做完的打勾變淡
function tile(c) {
  const [label, ...rest] = c.text.split(" ");
  const val = rest.join(" ") || (c.todo ? "還沒" : "好了");
  return h("button", { type: "button", class: "hub-tile" + (c.todo ? "" : " ok"), title: c.tip, onClick: () => c.go() },
    h("span", { class: "ht-ic", "aria-hidden": "true" }, icon(c.todo ? c.ic : "check")), h("b", null, val), h("small", null, label), c.fresh ? freshTag("corner") : null);
}
// 畫廊的今日特展（翊文 11-10：「畫廊有新的應該也要寫」）：每天換壹個主題，還有沒看的就亮著、掛「新」
function showChip() {
  const s = showToday();
  if (!s) return null;
  return { ic: "gallery", text: s.unseen ? `特展 ${s.unseen} 幅` : "特展 看完了", todo: s.unseen > 0, fresh: s.unseen > 0, tip: `畫廊的今日特展：${s.title}（${s.total - s.unseen}／${s.total} 幅看過）`, go: () => go("gallery", { show: true }) };
}

// 小館友證下面：兌換所（翊文 11-10：「大廳的也很不明顯」）
function shopBtn() {
  const n = storyState(P).stamps || 0;
  return h("button", { type: "button", class: "hub-shop" + (n ? " has" : ""), onClick: () => PANELS.shop && PANELS.shop() },
    h("span", { class: "hsh-ic", "aria-hidden": "true" }, cicon("shop")),
    h("span", { class: "hsh-t" }, h("b", null, "兌換所"), h("small", null, n ? `週章 ${n} 枚，可以去換` : "做每週任務拿週章")),
    h("span", { class: "hsh-go", "aria-hidden": "true" }, "→"));
}
export function lobbyHub() {
  if (!P || isFree(P)) return null;
  const step = nextStep(P), sc = showChip(), chips = todayChips().concat(sc ? [sc] : []).sort((a, b) => (b.todo ? 1 : 0) - (a.todo ? 1 : 0)), todo = todayItems().filter(x => x.todo).length, ex = hubExtras();
  const stepRow = step ? h("div", { class: "hub-row hub-step", role: "status" },
    h("span", { class: "hub-tag" }, icon("sparkle"), " 下壹步"),
    h("span", { class: "hs-body" }, h("b", null, step.text), h("small", null, step.why)),
    btn(["走過去 ", h("span", { "aria-hidden": "true" }, "→")], () => navTo(step.room), "primary small")) : null;
  const dayRow = h("div", { class: "hub-row hub-day" },
    h("button", { type: "button", class: "hub-today" + (todo ? "" : " done"), title: "打開今天的清單", onClick: () => openToday() },
      icon("calendar"), h("b", null, "今天"), h("small", null, todo ? `還有 ${todo} 件` : "都做完了")),
    h("div", { class: "hub-tiles" }, chips.map(tile)),
    ex.hol);
  return h("section", { class: "lobby-hub", "aria-label": "總覽：館友證、下壹步、今天要做的事、本週劇情" },
    h("div", { class: "hub-side" }, passCard(), PANELS.shop ? shopBtn() : null), h("div", { class: "hub-main" }, stepRow, dayRow, storyHub(), ex.fun));
}
ADDONS.lobbyHub = lobbyHub;

// 做完壹件、換日、賭場的讀到了：把大廳上的總覽換成現在的（不在大廳就沒有這個元素）
let busy = false;
ADDONS.hubRefresh = () => {
  if (busy) return;
  const old = document.querySelector(".lobby-hub");
  if (!old) return;
  busy = true;
  try { const now = lobbyHub(); if (now) old.replaceWith(now); else old.remove(); } finally { busy = false; }
};
