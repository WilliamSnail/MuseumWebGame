// ================================================================
//  圖書館的「交談紀錄」（決定 0151，11-21 翊文：「跟 NPC 交談後的台詞，能夠在圖書館裡看」；規劃第 9 節）
//  六位交代人各一本：封面＝名字＋熟識度的級；點進去壹行壹句、按日期分組（今天、昨天、更早），新的在上面。
//  伺服器只記句子 id（casino act giver op log → { g: { 交代人id: [[第幾天, id], …] } }），這裡從 shared/npc/givers.js 查字：
//  內容改了字，紀錄跟著顯示新字；句子被拿掉，那壹行就不顯示。沒聽到的不顯示，也不顯示「共有幾句」。
//  id 格式見 ui_giver_talk.js；認得的：chat.*、away.*（字條）、errands（拜託）、gift.*（送禮反應）、story（小故事壹頁，3 句放壹起）。其他格式（旅客、串門子、牌桌）還沒有寫入，先不顯示。
//  登記成 ADDONS.giverLog（ui_screens1.js 的圖書館頁籤「交談紀錄」用）。樣式在 css/tasks.css（gv-log-）。
// ================================================================
import { GIVERS } from "../../../shared/npc/givers.js";
import { todayStr } from "../../../shared/core/logic_base.js";
import { giverName } from "../../../shared/story/core.js";
import { NET } from "../core/net_firebase.js";
import { ADDONS, btn, h } from "../core/ui_core.js";
import { tipOn } from "../core/ui_tip.js";
import { GV_LV, giverDayNo, giverFill, giverLoad, giverWatch } from "./ui_giver_talk.js";
import { travelerName, travelerText } from "./ui_traveler_talk.js";

const ORDER = ["yuga", "hall", "postman", "clerk", "scale", "number"];
const TIP = { title: "交談紀錄", what: "這裡記下他對你說過的話，同壹句只記壹次。" };
// id → { text, tag }（查不到回 null）
export function giverLogText(sid) {
  const p = String(sid).split(":"), G = GIVERS[p[0]];
  if (!G) return null;
  const path = p[1] || "", i = Number(p[2]);
  const pick = a => (Array.isArray(a) && Number.isInteger(i) && a[i] != null ? giverFill(a[i]) : null);
  let text = null, tag = null;
  if (path.startsWith("chat.")) text = pick((G.chat || {})[path.slice(5)]);
  else if (path.startsWith("away.")) { text = pick((G.away || {})[path.slice(5)]); tag = "字條"; }
  else if (path.startsWith("gift.")) { text = pick((G.gift || {})[path.slice(5)]); tag = "送禮"; }
  else if (path === "errands") { const e = (G.errands || [])[i]; text = e && e[p[3]] ? giverFill(e[p[3]]) : null; tag = "拜託"; }
  else if (path === "story") { const s = G.story && G.story.parts && G.story.parts[i]; text = s ? s.join("\n") : null; tag = "小故事"; }
  return text ? { text, tag } : null;
}
const dateOf = n => new Date(Date.parse("2026-01-01T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const dayLabel = n => { const t = giverDayNo(); return n === t ? "今天" : n === t - 1 ? "昨天" : dateOf(n); };

function bookPage(id, rows, back, name, resolve = giverLogText) {
  const lines = (rows || []).map(([d, sid]) => ({ d, r: resolve(sid) })).filter(x => x.r).reverse(); // 新的在上面
  const kids = [];
  let last = null;
  for (const x of lines) {
    const lab = x.d >= giverDayNo() - 1 ? dayLabel(x.d) : "更早・" + dateOf(x.d);
    if (lab !== last) { kids.push(h("h4", null, lab)); last = lab; }
    kids.push(h("li", { class: x.r.tag === "小故事" ? "page" : "" }, x.r.tag ? h("small", null, x.r.tag) : null, x.r.text.split("\n").map(t => h("span", { class: "gv-log-t" }, t))));
  }
  return h("div", { class: "gv-log-page" },
    h("div", { class: "gv-log-head" }, btn("‹ 回書架", back, "small ghost"), h("b", null, name || giverName(id))),
    lines.length ? h("ul", { class: "gv-log-list" }, kids) : h("p", { class: "nb-empty" }, "還沒聽他說過話。"));
}
export function giverLog() {
  const box = h("div", { class: "gv-log" });
  let data = null, trav = {}, failed = false, open = null, openT = null;
  const paint = () => {
    const head = h("p", { class: "nb-hint" }, "六位交代人說過的話，壹句只記壹次。");
    tipOn(head, TIP);
    if (!NET.loggedIn) return box.replaceChildren(head, h("p", { class: "nb-empty" }, "登入之後，這裡會記下他們對你說過的話。"));
    if (failed) return box.replaceChildren(head, h("p", { class: "nb-empty" }, "現在讀不到交談紀錄。"));
    if (!data) return box.replaceChildren(head, h("p", { class: "nb-empty" }, "翻開紀錄……"));
    if (open) return box.replaceChildren(bookPage(open, data[open], () => { open = null; paint(); }));
    if (openT === "*") { // 旅客交談：每位旅客壹頁（只列有可顯示句子的）
      const ids = Object.keys(trav).filter(k => (trav[k] || []).some(([, s]) => travelerText(k, s)));
      return box.replaceChildren(h("div", { class: "gv-log-head" }, btn("‹ 回書架", () => { openT = null; paint(); }, "small ghost"), h("b", null, "旅客交談")),
        ids.length ? h("div", { class: "gv-log-books" }, ids.map(k => h("button", { type: "button", class: "gv-log-book", onClick: () => { openT = k; paint(); } }, h("b", null, travelerName(k))))) : h("p", { class: "nb-empty" }, "還沒聽旅客說過話。"));
    }
    if (openT) return box.replaceChildren(bookPage(openT, trav[openT], () => { openT = "*"; paint(); }, travelerName(openT), s => travelerText(openT, s)));
    const info = giverLoad();
    const lv = id => { const v = info && (info.givers || []).find(g => g.id === id); return GV_LV[v ? v.lv : 0]; };
    box.replaceChildren(head, h("div", { class: "gv-log-books" }, ORDER.map(id => h("button", { type: "button", class: "gv-log-book", onClick: () => { open = id; paint(); } }, h("b", null, giverName(id)), h("small", null, lv(id)))), h("button", { type: "button", class: "gv-log-book", onClick: () => { openT = "*"; paint(); } }, h("b", null, "旅客交談"), h("small", null, "牌桌、地下"))));
  };
  box.paint = paint; giverWatch(box); // 熟識度讀回來要重畫（直接進這頁時六本不要都寫「陌生」）
  paint();
  if (NET.loggedIn) NET.call("casino", { act: "giver", op: "log" }).then(r => { if (r && r.ok && r.log) { data = r.log; trav = r.travelers || {}; } else failed = true; }).catch(() => { failed = true; }).then(paint);
  return box;
}
ADDONS.giverLog = giverLog;
