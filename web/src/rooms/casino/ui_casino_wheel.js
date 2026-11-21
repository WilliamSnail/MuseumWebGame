// ================================================================
//  佩佩轉盤的畫面（決定 0150，翊文 11-21；規則 shared/casino/wheel.js，伺服器 casino act wheel）
//  25 格的盤：4 色 × 6 格＋1 個特別格（虹彩）。結果（落在哪壹格）由伺服器擲，畫面只演出來：盤轉到那壹格停下。
//  押法：顏色、稀有度、顏色×稀有度、特別格；也可以直接點盤上的壹格押單格。每種押法的機率、賠率、單筆上限都來自 sbInfo（ui_casino_sb.js）。
//  登記成賭場牌桌頁籤的第二個遊戲（ADDONS.casinoGame）；動畫是壹次性的（沒有無限循環）。
// ================================================================
import { casNum } from "../../../../shared/casino/core.js";
import { WHEEL_COLORS, WHEEL_RARITIES, WHEEL_SLOTS, WHEEL_SPECIAL } from "../../../../shared/casino/wheel.js";
import { ADDONS, h, snd, wait } from "../../core/ui_core.js";
import { casinoAct, casinoRefresh, casinoState } from "./ui_casino.js";
import { gameIntro, howTo } from "./ui_casino_felt.js";
import { sbAdd, sbBar, sbInfoLoad, sbList, sbNew, sbOpt, sbResult } from "./ui_casino_sb.js";

const COLOR = { 紅: "#B8322A", 綠: "#2E7D4A", 黃: "#D9B21C", 黑: "#26221F", 虹彩: "#8A5AB8" };
const MARK = { 普通: "", 稀有: "◆", 超稀有: "◆◆", 傳說: "★", 特別: "✦" };
const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs, ...kids) => { const n = document.createElementNS(NS, tag); for (const k in attrs || {}) n.setAttribute(k, attrs[k]); kids.forEach(c => c && n.append(c)); return n; };
const N = WHEEL_SLOTS.length, STEP = 360 / N;

// 這個賭場階段（casinoState 的 S）的狀態：押的注、結果、盤轉了多少度（累加，不倒轉）
let W = null;
const state = () => {
  const S = casinoState();
  if (!W || W.S !== S) W = Object.assign(sbNew(), { S, rot: 0, svg: null, g: null, busy: false, hitSlot: null });
  return W;
};
// 盤：SVG 只做壹次，之後每次重畫都放同壹個節點（不然轉到壹半被換掉）
function wheelEl(st, info) {
  if (st.svg) return st.svg;
  const R = 150, r = 54, cx = 160, cy = 160;
  const pt = (a, rad) => [cx + rad * Math.sin((a * Math.PI) / 180), cy - rad * Math.cos((a * Math.PI) / 180)];
  const g = el("g", { class: "wh-rot" });
  WHEEL_SLOTS.forEach((s, i) => {
    const a0 = i * STEP, a1 = (i + 1) * STEP, [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R), [x2, y2] = pt(a1, r), [x3, y3] = pt(a0, r);
    const path = el("path", { d: `M${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${r} ${r} 0 0 0 ${x3} ${y3} Z`, fill: COLOR[s.color], stroke: "#F3E3A8", "stroke-width": "1.5", class: "wh-cell", "data-i": String(i), role: "button", tabindex: "0", "aria-label": `第 ${i + 1} 格 ${s.color}${s.rar}` });
    const [tx, ty] = pt(a0 + STEP / 2, (R + r) / 2 + 12);
    const mark = el("text", { x: tx, y: ty, "text-anchor": "middle", "dominant-baseline": "middle", class: "wh-mark", transform: `rotate(${a0 + STEP / 2} ${tx} ${ty})` });
    mark.textContent = MARK[s.rar] || "";
    const [nx, ny] = pt(a0 + STEP / 2, R - 12);
    const num = el("text", { x: nx, y: ny, "text-anchor": "middle", "dominant-baseline": "middle", class: "wh-num", transform: `rotate(${a0 + STEP / 2} ${nx} ${ny})` });
    num.textContent = String(i + 1);
    g.append(path, mark, num);
  });
  const svg = el("svg", { viewBox: "0 0 320 320", class: "wh-svg", role: "group", "aria-label": "25 格轉盤" }, el("circle", { cx, cy, r: R + 6, fill: "none", stroke: "#7B5226", "stroke-width": "8" }), g,
    el("circle", { cx, cy, r: r - 4, fill: "#17432E", stroke: "#D6B25E", "stroke-width": "3" }), el("path", { d: "M160 4 L172 -8 L148 -8 Z", fill: "#F3E3A8", transform: "translate(0 14)", class: "wh-pointer" }));
  st.svg = svg; st.g = g;
  svg.addEventListener("click", e => { const c = e.target.closest && e.target.closest(".wh-cell"); if (c && !st.busy) { sbAdd(st, st.info || info, { id: "n:" + c.getAttribute("data-i"), max: ((st.info || info).types.find(t => t.id === "n:" + c.getAttribute("data-i")) || {}).max || 0 }); redraw(); } });
  return svg;
}
const redraw = () => casinoRefresh();
// 盤轉到那壹格：讓那壹格的中心停在最上面（指針的位置），多轉 4 圈
async function spinTo(st, slot) {
  st.rot += 360 * 4 + ((360 - ((st.rot % 360) + 360) % 360) % 360) - slot * STEP - STEP / 2;
  const g = st.g;
  if (!g) return;
  g.style.transition = "transform 3.2s cubic-bezier(.12,.6,.18,1)";
  g.style.transformOrigin = "160px 160px";
  g.style.transform = `rotate(${st.rot}deg)`;
  snd("flip");
  await wait(3300);
}
export function wheelPane() {
  const st = state(), S = casinoState(), w = S && S.w;
  gameIntro("wheel");
  const info = sbInfoLoad(S, redraw);
  if (!info) return h("p", { class: "nb-empty" }, "翻開轉盤……");
  const wh = info.failed ? null : info.wheel;
  if (!wh || !wh.on) return h("p", { class: "nb-empty" }, wh && !wh.on ? "轉盤今天休息。" : "現在讀不到轉盤的資料。");
  st.info = wh;
  const types = wh.types, byId = id => types.find(t => t.id === id);
  const busy = st.busy || (S && S.busy);
  const opts = ids => ids.map(id => byId(id)).filter(Boolean).map(t => sbOpt(st, wh, t, { busy, onChange: redraw, cls: "wh-" + (t.id.startsWith("c:") ? t.id.slice(2) : "") }));
  const colorIds = WHEEL_COLORS.map(c => "c:" + c), rarIds = WHEEL_RARITIES.map(r => "r:" + r);
  const comboIds = types.filter(t => t.id.startsWith("x:")).map(t => t.id);
  const special = byId("n:" + WHEEL_SPECIAL);
  const sec = (title, kids, cls) => h("div", { class: "sb-sec " + (cls || "") }, h("h4", null, title), h("div", { class: "sb-opts" }, kids));
  const go = async () => {
    if (st.busy) return;
    const bets = sbList(st);
    st.busy = true; st.result = null;
    const r = await casinoAct("wheel", { bets }, async r => { st.hitSlot = r.spin.outcome.slot; await spinTo(st, r.spin.outcome.slot); st.result = r.spin; st.bets = {}; snd(r.spin.net > 0 ? "coin" : "error"); });
    st.busy = false;
    if (!r || !r.ok) redraw();
  };
  const hit = st.result ? WHEEL_SLOTS[st.result.outcome.slot] : null;
  return [
    h("div", { class: "wh-stage" }, wheelEl(st, wh),
      h("p", { class: "wh-say", role: "status" }, hit ? `停在第 ${st.result.outcome.slot + 1} 格：${hit.color}・${hit.rar}` : "點下面的押法，或直接點盤上的壹格押單格。")),
    st.result ? sbResult(st.result, wh) : null,
    sec("顏色", opts(colorIds), "wh-colors"), sec("稀有度", opts(rarIds)), sec("顏色×稀有度", opts(comboIds), "wh-combos"),
    special ? sec("特別格", opts([special.id])) : null,
    sbBar(st, wh, { chips: w ? w.chips : 0, busy, onChange: redraw, go, goText: "轉！" }),
    howTo([`25 格：4 色 × 6 格，外加 1 個特別格（虹彩，沒押它的全輸）。稀有度：◆＝稀有、◆◆＝超稀有、★＝傳說。`, `每種押法的「×」是贏了拿回幾倍（含本金），旁邊是中獎機率；平均每押 100 拿回 ${100 - Math.round(wh.edge * 100)}。`, `壹轉最多押 ${wh.maxBets} 種；總注最多 ${casNum(wh.top)}；任何結果最多贏 ${casNum(wh.maxWin)}。`]),
  ];
}
ADDONS.casinoGame({ id: "wheel", name: "轉盤", ic: "star", pane: wheelPane });
