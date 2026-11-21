// ================================================================
//  轉盤、差壹畫共用的下注板（決定 0150；伺服器 casino act sbInfo／wheel／miscount，規則 shared/casino/side_bets.js）
//  這個檔只畫「伺服器給我的樣子」：每種押法的機率、賠率、單筆上限都來自 sbInfo；結果（spin）來自伺服器，畫面不算輸贏。
//  - sbInfoLoad：問壹次 sbInfo（兩個遊戲共用，同壹次進賭場只問壹次）
//  - sbBoard：押法按鈕（點壹下加壹個單位，按鈕上寫押了多少；有「−」退壹個）＋單位籌碼＋轉的按鈕
//  - sbResult：每筆輸贏
//  樣式在 css/casino_bj.css（前綴 sb-）。
// ================================================================
import { casNum } from "../../../../shared/casino/core.js";
import { NET } from "../../core/net_firebase.js";
import { btn, h } from "../../core/ui_core.js";
import { tipOn } from "../../core/ui_tip.js";

export const SB_UNITS = [100, 1000, 10000, 100000];
// 結果出來：把結果卡捲進賭場內文看得到的範圍（只捲 .cas-body，不連外層壹起捲）
export function sbShowResult() {
  setTimeout(() => {
    const el = document.querySelector(".sb-res"), body = el && el.closest(".cas-body");
    if (!body) return;
    const over = el.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom + 110;
    if (over > 0) body.scrollTo({ top: body.scrollTop + over, behavior: "smooth" });
  }, 80);
}
const pct = p => `${Math.round(p * 1000) / 10}%`;
const back = t => Math.round(t.p * t.mult * 100); // 平均每押 100 拿回幾
// 同壹次進賭場（casinoState 的 S）共用的 sbInfo：{ S, info, busy }
let CACHE = { S: null, info: null, busy: false };
export function sbInfoLoad(S, redraw) {
  if (CACHE.S !== S) CACHE = { S, info: null, busy: false };
  if (CACHE.info || CACHE.busy) return CACHE.info;
  const c = CACHE;
  c.busy = true;
  NET.call("casino", { act: "sbInfo" }).then(r => { if (CACHE === c) c.info = r && r.ok && r.info ? r.info : { failed: true }; }).catch(() => { if (CACHE === c) c.info = { failed: true }; }).then(() => { c.busy = false; if (CACHE === c) redraw(); });
  return null;
}
export const sbInfoReset = () => { CACHE = { S: null, info: null, busy: false }; };

export const sbNew = () => ({ bets: {}, unit: 1000, result: null });
export const sbCount = st => Object.keys(st.bets).filter(k => st.bets[k] > 0).length;
export const sbTotal = st => Object.values(st.bets).reduce((a, b) => a + (b > 0 ? b : 0), 0);
export const sbList = st => Object.keys(st.bets).filter(k => st.bets[k] > 0).map(id => ({ id, bet: st.bets[id] }));
// 點壹下：加壹個單位（不超過這種押法的單筆上限，不少於最少下注）
export function sbAdd(st, info, t) {
  const cur = st.bets[t.id] || 0;
  let next = Math.min(t.max, cur + Math.max(st.unit, info.minBet));
  if (next < info.minBet) next = info.minBet;
  st.bets[t.id] = next;
}
export function sbSub(st, info, t) {
  const cur = st.bets[t.id] || 0, next = cur - Math.max(st.unit, info.minBet);
  if (next < info.minBet) delete st.bets[t.id]; else st.bets[t.id] = next;
}
// 壹顆押法按鈕。cls：額外的 class（轉盤的顏色）；label：預設是伺服器給的名字
export function sbOpt(st, info, t, o) {
  const amt = st.bets[t.id] || 0, label = (o && o.label) || t.label;
  const b = h("button", { type: "button", class: "sb-opt" + (amt ? " on" : "") + (o && o.cls ? " " + o.cls : ""), disabled: o && o.busy ? true : null, "aria-pressed": String(!!amt) },
    h("b", null, label), h("small", null, `×${t.mult}・${pct(t.p)}`), amt ? h("i", { class: "sb-amt" }, casNum(amt)) : null);
  tipOn(b, { title: label, what: `中獎機率 ${pct(t.p)}，贏了拿 ${t.mult} 倍（含本金）。`, how: [`平均每押 100 拿回 ${back(t)}`, `這種押法單筆最多押 ${casNum(t.max)}`, "點壹下加壹個單位，再點再加；右邊的「−」退壹個"] });
  b.addEventListener("click", () => { sbAdd(st, info, t); o.onChange(); });
  if (!amt) return b;
  const minus = h("button", { type: "button", class: "sb-minus", "aria-label": `${label} 少押壹個單位`, disabled: o && o.busy ? true : null }, "−");
  minus.addEventListener("click", e => { e.stopPropagation(); sbSub(st, info, t); o.onChange(); });
  return h("span", { class: "sb-optwrap" }, b, minus);
}
// 單位籌碼＋總額＋按鈕。go：按下去做的事；goText：按鈕上的字；chips：錢包的籌碼
export function sbBar(st, info, o) {
  const total = sbTotal(st), n = sbCount(st);
  const why = !n ? "先點壹種押法" : n > info.maxBets ? `壹次最多押 ${info.maxBets} 種` : total > o.chips ? "籌碼不夠" : total > info.top ? `這壹轉總注最多 ${casNum(info.top)}` : null;
  const units = h("div", { class: "sb-units", role: "radiogroup", "aria-label": "每次加多少" }, SB_UNITS.filter(u => u >= info.minBet).map((u, i) => {
    const b = h("button", { type: "button", role: "radio", "aria-checked": String(st.unit === u), class: "bj-chip bj-c" + (i % 4) + (st.unit === u ? " sel" : ""), "aria-label": `每次加 ${casNum(u)}` }, h("span", null, casNum(u)));
    b.addEventListener("click", () => { st.unit = u; o.onChange(); });
    return b;
  }));
  return h("div", { class: "sb-bar" },
    h("p", { class: "sb-sum" }, n ? `押了 ${n} 種，共 ` : "還沒押。", n ? h("b", null, casNum(total)) : null, h("small", null, "　每次加：")),
    units,
    h("div", { class: "sb-go" }, btn("清掉", () => { st.bets = {}; o.onChange(); }, "small ghost", { disabled: !n || o.busy ? true : null }), btn(o.goText, o.go, "primary big", { disabled: why || o.busy ? true : null, title: why || "" })),
    why && n ? h("p", { class: "cas-hint" }, why) : null);
}
// 結果：每筆押法中不中、拿多少；總共賺賠多少
export function sbResult(spin, info) {
  if (!spin) return null;
  const name = id => { const t = (info.types || []).find(x => x.id === id); return t ? t.label : id; };
  return h("div", { class: "sb-res", role: "status" },
    h("ul", null, spin.rows.map(r => h("li", { class: r.hit ? "hit" : "miss" }, h("span", null, name(r.id)), h("small", null, `押 ${casNum(r.bet)}`), h("b", { class: r.hit ? "m-up" : "m-down" }, r.hit ? `+${casNum(r.pay - r.bet)}` : `−${casNum(r.bet)}`)))),
    h("p", { class: "sb-net" }, spin.net > 0 ? "這壹轉：" : spin.net < 0 ? "這壹轉：" : "這壹轉打平：", h("b", { class: spin.net > 0 ? "m-up" : spin.net < 0 ? "m-down" : "" }, spin.net > 0 ? `+${casNum(spin.net)}` : spin.net < 0 ? `−${casNum(-spin.net)}` : "0")));
}
