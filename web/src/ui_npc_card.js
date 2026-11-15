// ================================================================
//  旅客卡（翊文 11-16：「做公用架構讓我們看旅客時，不管在哪邊…都可以點選來看他們的狀況，理智，金錢狀況等等的」；資料層 shared/npc_card.js、決定 0096）
//  - openNpcCard(id, name)：開壹張卡。資料 NET.call("casino", { act: "npcCard", id }) → { ok, card }；card 沒有＝劇情角色或查無此人，寫「查不到」。
//  - npcName(id, name)：把旅客的名字畫成「看得出能按」的小按鈕（虛線底線＋小箭頭），點了開卡。哪裡出現旅客名字都用它。
//  - ADDONS.npcCard = openNpcCard（後面的檔不用 import）。
//  理智只給分級（ui_stat.js 的 statBadge）、錢包只給分級；今天的行程只列已經開始的站。名字、出身、故事是資料裡的字，只用 h() 的字串（textContent）。
//  開發時沒登入：用假資料排版（玩家看不到）。
// ================================================================
import { NET } from "./net_firebase.js";
import { ADDONS, btn, closeOnOutside, h, miniLayer } from "./ui_core.js";
import { statBadge } from "./ui_stat.js";

const clock = ms => { const d = new Date(Number(ms) || 0); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const LIKE_KIND = { place: "愛去", rarity: "愛看", theme: "愛看" };

const FAKE = () => ({
  id: "fake-a", name: "夜班的畫商", kind: "visitor", kindLabel: "旅客", note: "白天睡覺，晚上才出來看畫。", story: "他說自己在找一幅十年前賣掉的畫，但不肯說是哪一幅。", job: null,
  likes: [{ type: "place", key: "food", label: "餐車" }, { type: "rarity", key: "珍藏", label: "珍藏" }, { type: "theme", key: "x", label: "夜色" }],
  san: { band: "uneasy", label: "不太穩", tone: "warn", hint: "有點睡不好" },
  money: { tier: "comfortable", tierLabel: "寬裕", perDay: 4200, spentToday: 1500, left: 2700, wallet: { band: "ok", label: "還行", tone: "neutral" } },
  where: { room: "casino", label: "賭場（被館友邀去玩牌）", until: Date.now() + 25 * 60000, at: "casino", invited: true },
  today: [{ place: "hall", room: "hall", label: "展廳", at: Date.now() - 3 * 3600000, until: Date.now() - 2 * 3600000, now: false }, { place: "food", room: "casino", label: "餐車", at: Date.now() - 2 * 3600000, until: Date.now() - 3600000, now: false }, { place: "bj", room: "casino", label: "21 點桌", at: Date.now() - 3600000, until: Date.now() + 25 * 60000, now: true }],
  arc: { step: 2, text: "他開始問起館裡有沒有舊的拍賣目錄。", news: "" }, arcDone: [{ step: 1, text: "他第一次走進展廳，站在最角落的畫前很久。" }],
  mood: "有點睡不好",
});

function row(label, ...kids) { return h("div", { class: "npk-row" }, h("b", { class: "npk-k" }, label), h("div", { class: "npk-v" }, ...kids)); }

function cardBody(c) {
  const parts = [];
  const head = h("div", { class: "npk-head" },
    h("h3", null, c.name, h("i", { class: "npk-kind k-" + c.kind }, c.kindLabel || "旅客")),
    c.job ? h("small", null, c.job.title) : null,
    c.note ? h("p", { class: "npk-note" }, c.note) : null);
  parts.push(head);
  if (c.san) parts.push(row("理智", statBadge(c.san, { hint: true })));
  else if (c.mood) parts.push(row("狀態", c.mood));
  if (c.money) {
    const m = c.money, pct = m.perDay > 0 ? Math.max(0, Math.min(100, Math.round((m.spentToday / m.perDay) * 100))) : 0;
    parts.push(row("錢",
      h("div", { class: "npk-money" }, h("span", null, m.tierLabel || ""), m.wallet ? statBadge({ label: "錢包" + m.wallet.label, tone: m.wallet.tone }) : null),
      h("div", { class: "npk-meter", role: "img", "aria-label": `今天花了 ${m.spentToday}，還剩 ${m.left}` }, h("i", { style: { width: pct + "%" } })),
      h("small", { class: "npk-sub" }, `今天最多花 ${m.perDay}，已花 ${m.spentToday}，還剩 ${m.left}`)));
  }
  parts.push(row("現在", c.where
    ? h("span", null, h("b", null, c.where.label), c.where.until ? `，待到 ${clock(c.where.until)}` : "", c.where.invited ? h("i", { class: "npk-inv" }, "被邀請的") : null)
    : h("span", { class: "npk-dim" }, "今天不在館裡")));
  if (c.today && c.today.length) parts.push(row("今天去過", h("ol", { class: "npk-trail" }, c.today.map(t => h("li", { class: t.now ? "now" : "" }, h("span", { class: "npk-t" }, clock(t.at)), h("span", null, t.label), t.now ? h("i", null, "現在") : null)))));
  if (c.likes && c.likes.length) parts.push(row("喜歡", h("div", { class: "npk-likes" }, c.likes.map(k => h("span", { class: "npk-like k-" + k.type }, h("small", null, LIKE_KIND[k.type] || ""), k.label)))));
  if (c.story || c.arc || (c.arcDone && c.arcDone.length)) {
    const arc = [];
    if (c.arc) arc.push(h("p", { class: "npk-arc now" }, h("b", null, "現在　"), c.arc.text, c.arc.news ? h("small", { class: "npk-news" }, c.arc.news) : null));
    if (c.arcDone && c.arcDone.length) arc.push(h("details", { class: "npk-done" }, h("summary", null, `前面的事（${c.arcDone.length}）`), c.arcDone.map(a => h("p", { class: "npk-arc" }, a.text))));
    parts.push(row("故事", c.story ? h("p", { class: "npk-story" }, c.story) : null, ...arc));
  }
  return parts;
}

export async function openNpcCard(id, name) {
  const m = miniLayer(name || "旅客", "");
  m.card.classList.add("npk-card");
  m.layer.classList.add("sp-top"); // 從牌桌、邀請視窗裡開，要蓋得住（牌桌 z 8800）
  closeOnOutside(m);
  m.card.querySelector(".sub").remove();
  const body = h("div", { class: "npk-body" }, h("p", { class: "npk-dim" }, "正在問……"));
  m.card.append(body, h("div", { class: "npk-acts" }, btn("關起來", () => m.close(), "ghost")));
  let c = null, why = "";
  try {
    if (import.meta.env.DEV && !NET.me) c = FAKE();
    else {
      const r = await NET.call("casino", { act: "npcCard", id });
      if (r && r.ok && r.card) c = r.card; else why = (r && r.reason) || "";
    }
  } catch (e) { why = (e && e.message) || "現在問不到。"; }
  if (!m.layer.isConnected) return;
  if (!c) { body.replaceChildren(h("p", { class: "npk-dim" }, why || "查不到這個人。")); return; }
  m.card.querySelector("h2").textContent = c.name;
  m.card.querySelector("h2").classList.add("npk-sr"); // 卡裡已經有大標題，這個只留給螢幕報讀
  body.replaceChildren(...cardBody(c));
}
ADDONS.npcCard = openNpcCard;

// 旅客的名字：虛線底線＋小箭頭，看得出能按。id 空的（劇情角色、沒有 id）就只寫字
export function npcName(id, name, opts) {
  const nm = String(name || "旅客");
  if (!id) return h("span", { class: "npk-name-plain" }, nm);
  return h("button", { type: "button", class: "npk-name" + (opts && opts.cls ? " " + opts.cls : ""), title: `看看 ${nm} 的狀況`, "aria-label": `${nm}，看他的狀況`, onClick: e => { e.stopPropagation(); openNpcCard(id, nm); } }, nm, h("i", { "aria-hidden": "true" }, "›"));
}
