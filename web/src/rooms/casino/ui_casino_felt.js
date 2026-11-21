// ================================================================
//  賭場牌桌頁籤的共用零件（11-21 牌桌重新設計，翊文選方向 C：左邊直排遊戲欄；docs/規劃/牌桌重新設計.md）
//  只畫畫面，不算規則、不碰伺服器：資料和動作都由呼叫的人傳進來（21 點在 ui_casino.js，轉盤、差壹畫、德州各自壹支檔）。
//  - gameNav：遊戲切換。電腦＝左邊直排（圖示＋字）；手機＝上面壹排大按鈕（圖示＋字、目前那個是金色實心，翊文：「手機版的切換遊戲明顯壹點」）
//  - bjTable／bjSeat：橢圓的牌桌，荷官在上、你在下，荷官的話是桌上的泡泡
//  - chipRow：圓的籌碼，點壹下加注
//  - gameIntro：每個遊戲第壹次坐下的玩法卡（只跳壹次，記在這個瀏覽器）
//  樣式在 css/casino_bj.css（前綴 bj-）。
// ================================================================
import { casNum } from "../../../../shared/casino/core.js";
import { CAS_GAME_INTRO, CAS_TIPS } from "../../../../shared/casino/text.js";
import { h, icon } from "../../core/ui_core.js";
import { tipOn } from "../../core/ui_tip.js";
import { noticeCard } from "../../panels/ui_party.js";

// 遊戲清單：games＝[{ id, name, ic }]；cur＝現在哪個；go(id)。只有壹個遊戲就不畫（回 null）
export function gameNav(games, cur, go, busy) {
  if (!games || games.length < 2) return null;
  return h("nav", { class: "bj-nav", "aria-label": "選遊戲" }, games.map(g => {
    const b = h("button", { type: "button", class: "bj-g" + (g.id === cur ? " on" : ""), "aria-pressed": String(g.id === cur), disabled: busy ? true : null }, icon(g.ic), h("span", { class: "bj-g-t" }, g.name));
    tipOn(b, CAS_TIPS["g_" + g.id]); b.addEventListener("click", () => go(g.id)); // 先接說明牌、再接點擊（手機長按顯示說明那壹下不算點擊）
    return b;
  }));
}
// 橢圓牌桌：bubble＝荷官最新壹句；dealer、you＝bjSeat 的結果；banner＝輸贏那壹條
export const bjTable = ({ bubble, dealer, you, banner }) => h("div", { class: "bj-table" },
  bubble ? h("p", { class: "bj-bubble", role: "status" }, bubble) : null, dealer, you, banner || null);
export const bjSeat = (cls, label, note, hand) => h("div", { class: "bj-seat " + cls }, h("div", { class: "bj-who" }, h("b", null, label), note ? h("small", null, note) : null), hand);
// 籌碼：list＝[100, 1000, …]；chips＝錢包有多少（不夠的灰掉）；onPick(n)；onAll()＝全下
export function chipRow(list, chips, onPick, onAll, busy) {
  const kids = list.map((n, i) => {
    const b = h("button", { type: "button", class: "bj-chip bj-c" + (i % 4), disabled: busy || n > chips ? true : null, "aria-label": "加注 " + casNum(n) }, h("span", null, casNum(n)));
    b.addEventListener("click", () => onPick(n));
    return b;
  });
  const all = h("button", { type: "button", class: "bj-chip bj-c4", disabled: busy || chips <= 0 ? true : null, "aria-label": "全下" }, h("span", null, "全下"));
  all.addEventListener("click", onAll);
  return h("div", { class: "bj-chips" }, kids, all);
}
// 第壹次坐下的玩法卡：id 見 CAS_GAME_INTRO。「怎麼玩」之後在各遊戲自己的頁面
export function gameIntro(id) {
  const t = CAS_GAME_INTRO[id];
  if (!t) return;
  try { if (localStorage.getItem("pm-cas-game-" + id)) return; localStorage.setItem("pm-cas-game-" + id, "1"); } catch (e) { return; }
  noticeCard({ who: t.name + "：", text: t.text, sub: t.sub, ms: 40000 });
}
// 「怎麼玩」：收起來的說明（規則、賠率）。lines＝壹行壹句
export const howTo = (lines, open) => h("details", { class: "bj-how", open: open ? true : null }, h("summary", null, icon("scroll"), " 怎麼玩"), lines.map(l => h("p", null, l)));
