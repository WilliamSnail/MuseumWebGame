// ================================================================
//  差壹畫的畫面（決定 0150，翊文 11-21；規則 shared/casino/miscount.js，伺服器 casino act miscount）
//  荷官在紙上畫「正」字，數到壹個數；你押「剛好」「多壹畫」「少壹畫」，也可以押出錯在第幾畫。結果（kind、at、n）由伺服器擲，畫面只演出來。
//  不放謎底：台詞用 MISCOUNT_LINES 的草稿（氣氛：帳對不上），不解釋為什麼差壹畫。動畫是壹次性的（壹畫壹畫出現，沒有無限循環）。
//  登記成賭場牌桌頁籤的遊戲（ADDONS.casinoGame）。
// ================================================================
import { casNum } from "../../../../shared/casino/core.js";
import { MISCOUNT_LINES, MISCOUNT_STROKES } from "../../../../shared/casino/miscount.js";
import { ADDONS, h, snd, wait } from "../../core/ui_core.js";
import { casinoAct, casinoGiver, casinoRefresh, casinoState } from "./ui_casino.js";
import { gameIntro, howTo } from "./ui_casino_felt.js";
import { sbBar, sbInfoLoad, sbList, sbNew, sbOpt, sbResult, sbShowResult } from "./ui_casino_sb.js";

const NS = "http://www.w3.org/2000/svg";
const svg = (tag, attrs, ...kids) => { const n = document.createElementNS(NS, tag); for (const k in attrs || {}) n.setAttribute(k, attrs[k]); kids.forEach(c => c && n.append(c)); return n; };
// 「正」字的 5 畫（40×52 的格子）：橫、豎、中橫、左短豎、底橫
const STROKES = [[4, 6, 36, 6], [20, 6, 20, 46], [20, 22, 34, 22], [10, 22, 10, 36], [3, 46, 38, 46]];
const group = (n, o) => { // n：這壹組畫幾畫（1～5）；o.only：只畫第幾畫（多出來、少掉的那壹畫）；o.cls
  const s = svg("svg", { viewBox: "0 0 40 52", class: "mc-grp" + (o && o.cls ? " " + o.cls : ""), "aria-hidden": "true" });
  STROKES.forEach(([x1, y1, x2, y2], i) => {
    if (o && o.only) { if (i + 1 !== o.only) return; } else if (i >= n) return;
    s.append(svg("line", { x1, y1, x2, y2, class: "mc-stroke", "stroke-linecap": "round" }));
  });
  return s;
};
const pick = (list, seed) => list[Math.abs(seed | 0) % list.length];

let M = null; // 這個賭場階段的狀態：{ S, bets…, paper（紙的節點，只做壹次）, said, result }
const state = () => {
  const S = casinoState();
  if (!M || M.S !== S) M = Object.assign(sbNew(), { S, paper: null, say: "", busy: false, tick: 0 });
  return M;
};
function paperEl(st) {
  if (!st.paper) st.paper = h("div", { class: "mc-paper", role: "img", "aria-label": "荷官畫的正字" }, h("p", { class: "mc-empty" }, "押好之後，荷官開始畫。"));
  return st.paper;
}
// 壹畫壹畫畫出來；最後壹組之後，多的壹畫（紅）或少的壹畫（虛線）放在旁邊
async function draw(st, spin) {
  const { kind, at, n } = spin.outcome, p = st.paper;
  p.replaceChildren();
  const groups = Math.ceil(n / MISCOUNT_STROKES), box = h("div", { class: "mc-row" });
  p.append(box);
  for (let g = 0; g < groups; g++) {
    const cnt = Math.min(MISCOUNT_STROKES, n - g * MISCOUNT_STROKES);
    for (let k = 1; k <= cnt; k++) {
      const old = box.querySelector(`[data-g="${g}"]`); if (old) old.remove();
      const gr = group(k, { cls: "draw" }); gr.setAttribute("data-g", String(g));
      box.append(gr);
      snd("flip");
      await wait(150);
    }
  }
  if (kind !== "exact") {
    await wait(400);
    box.append(h("span", { class: "mc-plus" }, kind === "more" ? "＋" : "－"), group(0, { only: at, cls: kind === "more" ? "extra" : "gone" }));
    p.append(h("p", { class: "mc-note" }, kind === "more" ? `多了壹畫：出錯在第 ${at} 畫` : `少了壹畫：少的是第 ${at} 畫`));
  } else p.append(h("p", { class: "mc-note" }, `數到 ${n} 畫，剛好。`));
}
export function miscountPane() {
  const st = state(), S = casinoState(), w = S && S.w;
  gameIntro("miscount");
  const info = sbInfoLoad(S, casinoRefresh);
  if (!info) return h("p", { class: "nb-empty" }, "翻開本子……");
  const mc = info.failed ? null : info.miscount;
  if (!mc || !mc.on) return h("p", { class: "nb-empty" }, mc && !mc.on ? "荷官今天沒帶本子。" : "現在讀不到差壹畫的資料。");
  st.info = mc;
  const types = mc.types, byId = id => types.find(t => t.id === id);
  const busy = st.busy || (S && S.busy);
  const opts = ids => ids.map(byId).filter(Boolean).map(t => sbOpt(st, mc, t, { busy, onChange: casinoRefresh }));
  const sec = (title, kids, cls) => h("div", { class: "sb-sec " + (cls || "") }, h("h4", null, title), h("div", { class: "sb-opts" }, kids));
  const go = async () => {
    if (st.busy) return;
    const bets = sbList(st);
    st.busy = true; st.result = null;
    st.say = pick(MISCOUNT_LINES.open, ++st.tick + (Date.now() % 7));
    const r = await casinoAct("miscount", { bets }, async r => {
      await draw(st, r.spin);
      const o = r.spin.outcome;
      st.say = pick(o.kind === "exact" ? MISCOUNT_LINES.exact : MISCOUNT_LINES[o.kind], o.n + o.at);
      st.result = r.spin; st.bets = {};
      snd(r.spin.net > 0 ? "coin" : "error");
    });
    st.busy = false;
    if (!r || !r.ok) casinoRefresh(); else sbShowResult();
  };
  return [
    h("div", { class: "mc-stage" }, paperEl(st), h("p", { class: "wh-say", role: "status" }, st.say || (casinoGiver() || {}).text || "荷官翻開本子：「我畫，你押。」")),
    st.result ? sbResult(st.result, mc) : null,
    sec("數完之後", opts(["exact", "more", "less"]), "mc-main"),
    sec("出錯在第幾畫（只有多或少才會有）", opts([1, 2, 3, 4, 5].map(k => "at:" + k)), "mc-at"),
    sbBar(st, mc, { chips: w ? w.chips : 0, busy, onChange: casinoRefresh, go, goText: "數！" }),
    howTo([`荷官畫壹疊正字（5 到 20 畫），你猜數完「剛好」「多壹畫」還是「少壹畫」。剛好最常見，所以賠得少；多、少賠得多。`, `也可以押出錯在第幾畫（1～5）：猜中拿 ${(byId("at:1") || {}).mult || 12} 倍。平均每押 100 拿回 ${100 - Math.round(mc.edge * 100)}。`, `壹轉最多押 ${mc.maxBets} 種；總注最多 ${casNum(mc.top)}。`]),
  ];
}
ADDONS.casinoGame({ id: "miscount", name: "差壹畫", ic: "scroll", pane: miscountPane });
