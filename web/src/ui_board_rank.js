// ================================================================
//  本週榜單的畫面（決定 0039）。跟公佈欄 ui_board.js 不一樣：這裡是排行榜。
//  翊文：「另外每周排行榜也可以用discord推送給大家看，並提供一些建議」；遊戲裡也看得到（只在館內，docs/界線.md 第 4 點）。
//  資料：boards/latest（tools/weekly_board.cjs 每週一寫的），每次打開讀一次。規則在 shared/board.js，樣式在 css/rank.css。
//  入口：右上角選單的「本週榜單」（ui_core.js 的 buildNav）。ui_core 不能 import 這個檔（它在後面）：這裡把自己登記進 PANELS。
//  暱稱是玩家打的字：一律當純文字放（不要用 h 的 html）。介面文字照第 1 代用「壹」。
// ================================================================
import { BOARD_TEXT } from "../../shared/content3.js";
import { NUM } from "../../shared/config.js";
import { fill } from "../../shared/logic.js";
import { boardGroups, boardPeriodText, boardValueText, boardViewOf } from "../../shared/board.js";
import { NET } from "./net_firebase.js";
import { PANELS, h, icon, snd, titleTag } from "./ui_core.js";
import { overlay } from "./ui_board.js";

const T = BOARD_TEXT;
const ICON = { codex: "codex", hall: "hall", deep: "stairs", books: "book", full: "calendar", stamps: "medal", table: "cards", ach: "star", donate: "gift", bust: "hand", econ: "exchange", god: "gem" }; // 遊戲裡用遊戲的圖示；emoji 是 Discord 公告用的（有些電腦畫出來是黑黑一塊）
const isMe = nick => !!(NET.me && NET.me.nick === nick);
const nameNode = (nick, title) => (title ? h("span", { class: "rk-who" }, h("span", { class: "rk-name" + (isMe(nick) ? " me" : "") }, nick), titleTag(title, "rk-ttl")) : h("span", { class: "rk-name" + (isMe(nick) ? " me" : "") }, nick));
// titles：跟 nicks 一一對上的稱號名字（決定 0050；榜單是當週算好存的，沒有稱號的人沒這個欄位）
const nameList = (nicks, titles) => nicks.flatMap((n, i) => (i ? ["、", nameNode(n, titles && titles[i])] : [nameNode(n, titles && titles[i])]));

// 一個榜：一張牌子。同分的排在同一列
function card(b) {
  const head = h("h3", null, icon(ICON[b.id] || "star"), h("span", null, b.title), b.all ? h("small", null, fill(T.fullNote, NUM.board.fullDays)) : b.sub ? h("small", null, b.sub) : null);
  if (!b.rows.length) return h("section", { class: "rk-card none" }, head, h("p", { class: "rk-none" }, "這週還沒有人上榜"));
  if (b.all) return h("section", { class: "rk-card" }, head, h("p", { class: "rk-all" }, nameList(b.rows.map(r => r.nick), b.rows.map(r => r.title || ""))));
  return h("section", { class: "rk-card" }, head, h("ol", { class: "rk-rows" }, boardGroups(b.rows).map(g =>
    h("li", { class: `rk-row r${g.rank}` }, h("span", { class: "rk-medal", "aria-label": `第 ${g.rank} 名` }, String(g.rank)), h("span", { class: "rk-names" }, nameList(g.nicks, g.titles)), h("b", { class: "rk-val" }, boardValueText(b.id, g.value))))));
}
function bodyOf(v) {
  const list = (title, cls, items) => (items.length ? h("section", { class: "rk-note " + cls }, h("h3", null, title), h("ul", null, items)) : null);
  return h("div", { class: "rk-body" },
    h("p", { class: "rk-period" }, fill(T.panelPeriod, boardPeriodText(v)), v.first ? h("small", null, T.panelFirst) : null, v.casFirst ? h("small", null, T.panelCasFirst) : null, v.live ? h("small", null, T.panelLive) : null),
    v.empty ? h("p", { class: "nb-empty" }, T.panelEmpty) : h("div", { class: "rk-grid" }, v.boards.map(card)),
    list(T.tipsHead, "tips", v.tips.map(t => h("li", null, t))),
    list(T.nudgesHead, "nudges", v.nudges.map(n => h("li", null, nameNode(n.nick), " ", n.text))),
    h("p", { class: "rk-where" }, T.panelWhere));
}

export async function openRank() {
  const m = overlay("nb-rank", T.panel, T.panelLabel, "star");
  const show = node => { if (m.layer.isConnected) m.surface.replaceChildren(node); };
  snd("flip");
  if (!NET.me) { show(h("p", { class: "nb-empty" }, T.panelLogin)); return; }
  show(h("p", { class: "nb-empty" }, T.panelLoading));
  try {
    const d = await NET.readBoard();
    const v = boardViewOf(d);
    show(v ? bodyOf(v) : h("p", { class: "nb-empty" }, T.panelNone));
  } catch (e) {
    show(h("p", { class: "nb-empty", role: "alert" }, T.panelError));
  }
}
PANELS.rank = openRank;
