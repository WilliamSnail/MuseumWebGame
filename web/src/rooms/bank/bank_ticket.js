// 股票下單區（11-27 翊文：「這個感覺有點都是文字不太好辨識」；三種排版挑了 B「下單單」）：
// 先填數量（−／＋、快捷鍵），下面直接看要付或拿回多少，最後按壹顆大按鈕（紅買綠賣）才跳確認。按股數、按金額（零股）、集團股都用這壹個。
// 不 import ui_bank.js（不准繞圈）：算錢、確認、送出由呼叫的檔傳進來。
import { btn, h } from "../../core/ui_core.js";

const fmt = n => Number(n).toLocaleString("en-US");

// 交易方式分頁（現股／槓桿・放空／掛單）：每顆下面壹行小字說它做什麼，看得出是三顆可以按的鈕
const KIND_SUB = { spot: "直接買賣", lev: "借錢放大・看跌", order: "到價才成交" };
export const tradeTabs = list => list.map(([k, t, dis]) => [k, [h("b", null, t), h("small", null, KIND_SUB[k] || "")], dis]);
// 按股數／按金額（只有館外股：台股、美股）
export const unitRow = el => h("div", { class: "bank-unit" }, el);
export const UNIT_TABS = [["n", [h("b", null, "按股數"), h("small", null, "買幾股")]], ["amt", [h("b", null, "按金額"), h("small", null, "不到壹股也能買")]]];

// o = { side, state（{ v, all }，同壹支股、同壹種下法沿用打過的數字）, unit, max, step, start（第壹次的數字）, chips: [[字, 數字, 是不是「全部」]], rows(n) → [[名, 值, class]], why(n) → 不能下單的原因（能下就空字串）, goText(n), onGo(n, all) }
export function ticketBox(o) {
  const { side, state: st, max } = o;
  if (st.v == null) st.v = o.start || "";
  const num = () => { const n = Number(st.v); return Number.isInteger(n) && n > 0 ? n : 0; };
  const sum = h("dl", { class: "bk-sum" }), why = h("p", { class: "bk-why", role: "status" });
  const go = btn("", () => { const n = num(); if (n && !o.why(n)) o.onGo(n, !!st.all); }, "bk-go side-" + side);
  const input = h("input", { type: "number", inputmode: "numeric", class: "bk-big-in", min: "1", step: "1", placeholder: "0", "aria-label": o.unit === "股" ? "股數" : "金額",
    onInput: e => { st.v = e.target.value === "" ? "" : Math.floor(Number(e.target.value)); st.all = false; paint(true); } });
  const paint = typing => {
    if (!typing) input.value = st.v === "" ? "" : String(st.v);
    const n = num(), bad = o.why(n);
    why.textContent = bad; why.hidden = !bad;
    sum.replaceChildren(...o.rows(bad ? 0 : n).filter(Boolean).map(([k, v, cls]) => h("div", { class: "bk-sum-r " + (cls || "") }, h("dt", null, k), h("dd", null, v))));
    go.textContent = o.goText(bad ? 0 : n);
    go.disabled = !n || !!bad || max < 1;
  };
  const set = (n, all) => { st.v = Math.max(0, Math.min(max, Math.floor(n))) || ""; st.all = !!all; paint(); };
  const stepBtn = (d, label, aria) => h("button", { type: "button", class: "bk-step", "aria-label": aria, disabled: max > 0 ? null : true, onClick: () => set(num() + d * o.step) }, label);
  const box = h("div", { class: "bk-ticket" },
    h("div", { class: "bk-field" }, stepBtn(-1, "−", "少壹點"), input, h("em", null, o.unit), stepBtn(1, "＋", "多壹點")),
    h("div", { class: "bk-chips" }, o.chips.map(([label, n, all]) => h("button", { type: "button", class: "bk-chip", disabled: max > 0 && n <= max ? null : true, onClick: () => set(n, all) }, label))),
    why, sum, go);
  paint();
  return box;
}

// 按股數的下單單：買滿／全賣、手續費和稅照 sumOf 算（現股、集團股共用；集團股手續費照成交算，sumOf 回的 fee 是 null）
// o = { side, cur, max, priceText, sumOf(n) → { fee, tax, total }, ask(n, sendN), state }
export function shareTicket(o) {
  const { side, max } = o, buy = side === "buy", verb = buy ? "買進" : "賣出";
  return ticketBox({
    side, state: o.state, unit: "股", max, step: 1, start: max > 0 ? Math.min(10, max) : "",
    chips: [["10", 10], ["100", 100], ["1,000", 1000], [buy ? "買滿" : "全賣", max, true]],
    why: n => (max < 1 ? "" : n > max ? `最多只能${buy ? "買" : "賣"} ${fmt(max)} 股。` : ""),
    rows: n => {
      const x = n ? o.sumOf(n) : null;
      return [["股價", o.priceText], x && x.fee != null ? ["手續費", fmt(x.fee)] : null, x && !buy && x.tax ? ["證交稅", fmt(x.tax)] : null,
        [buy ? "要付（約）" : "拿回（約）", x ? fmt(x.total) : "—", "total"], x && x.fee == null ? ["手續費照成交算", "", "note"] : null, [buy ? "最多買得起" : "最多可賣", `${fmt(max)} 股`, "note"]];
    },
    goText: n => (n ? `${verb} ${fmt(n)} 股` : max < 1 ? (buy ? "現在不能買" : "現在不能賣") : "先填股數"),
    onGo: (n, all) => o.ask(n, !buy && all && n === max ? "max" : n),
  });
}
