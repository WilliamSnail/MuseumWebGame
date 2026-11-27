// 股票下單區（11-27 翊文：「這個感覺有點都是文字不太好辨識」；三種排版挑了 B「下單單」）：
// 先填數量（−／＋、快捷鍵），下面直接看要付或拿回多少，最後按壹顆大按鈕（紅買綠賣）才跳確認。按股數、按金額（零股）、集團股都用這壹個。
// 不 import ui_bank.js（不准繞圈）：算錢、確認、送出由呼叫的檔傳進來。
import { btn, h } from "../../core/ui_core.js";

const fmt = n => Number(n).toLocaleString("en-US");

// 按股數／按金額（只有館外股：台股、美股）
export const unitRow = el => h("div", { class: "bank-unit" }, el);
export const UNIT_TABS = [["n", [h("b", null, "按股數"), h("small", null, "買幾股")]], ["amt", [h("b", null, "按金額"), h("small", null, "不到壹股也能買")]]];

// 大數字欄：−／＋ 和單位。回 { el, show(v) }
function bigField({ aria, unit, onType, onStep, disabled, decimal }) {
  const input = h("input", { type: "number", inputmode: decimal ? "decimal" : "numeric", class: "bk-big-in", min: "0", step: decimal ? "0.01" : "1", placeholder: "0", "aria-label": aria, onInput: e => onType(e.target.value === "" ? "" : Number(e.target.value)) });
  const stepBtn = (d, text, tip) => h("button", { type: "button", class: "bk-step", "aria-label": tip, disabled: disabled ? true : null, onClick: () => onStep(d) }, text);
  return { el: h("div", { class: "bk-field" }, stepBtn(-1, "−", "少壹點"), input, h("em", null, unit), stepBtn(1, "＋", "多壹點")), show: v => { input.value = v === "" || v == null ? "" : String(v); } };
}
const label = text => (text ? h("p", { class: "bk-label" }, text) : null);
// 壹排大鈕：items = [[字, 按了做什麼, 不能按（true 或原因字串）, 選中（只有選壹個的那種給）]]
const chipRow = items => h("div", { class: "bk-chips" + (items.length > 4 ? " five" : "") }, items.map(([text, onClick, off, on]) => h("button", { type: "button", class: "bk-chip" + (on ? " on" : ""), "aria-pressed": on == null ? null : String(!!on), disabled: off ? true : null, title: typeof off === "string" ? off : null, onClick }, text)));
const sumRows = rows => rows.filter(Boolean).map(([k, v, cls]) => h("div", { class: "bk-sum-r " + (cls || "") }, h("dt", null, k), h("dd", null, v)));
const parts = () => ({ sum: h("dl", { class: "bk-sum" }), why: h("p", { class: "bk-why", role: "status" }) });
const showWhy = (el, text) => { el.textContent = text; el.hidden = !text; };
// 倍數那種「選壹個」的壹排大鈕：list = [[n, 鎖住的原因或空字串]]
export const pickRow = (title, list, cur, onPick, fmtN) => h("div", { class: "bk-sec" }, label(title), chipRow(list.map(([n, locked]) => [fmtN(n), () => onPick(n), locked, n === cur])));

// o = { side, state（{ v, all }，同壹支股、同壹種下法沿用打過的數字）, unit, max, step, start（第壹次的數字）, chips: [[字, 數字, 是不是「全部」]], rows(n) → [[名, 值, class]], why(n) → 不能下單的原因（能下就空字串）, goText(n), onGo(n, all) }
export function ticketBox(o) {
  const { side, state: st, max } = o;
  if (st.v == null) st.v = o.start || "";
  const num = () => { const n = Number(st.v); return Number.isInteger(n) && n > 0 ? n : 0; };
  const { sum, why } = parts();
  const go = btn("", () => { const n = num(); if (n && !o.why(n)) o.onGo(n, !!st.all); }, "bk-go side-" + side);
  const field = bigField({ aria: o.unit === "股" ? "股數" : "金額", unit: o.unit, disabled: !(max > 0), onStep: d => set(num() + d * o.step), onType: x => { st.v = x === "" ? "" : Math.floor(x); st.all = false; paint(true); } });
  const paint = typing => {
    if (!typing) field.show(st.v);
    const n = num(), bad = o.why(n), shown = bad && !o.keepRows ? 0 : n; // keepRows：不能下單也照樣算給你看（槓桿）
    showWhy(why, bad);
    sum.replaceChildren(...sumRows(o.rows(shown)));
    go.textContent = o.goText(shown);
    go.disabled = !n || !!bad || max < 1;
  };
  const set = (n, all) => { st.v = Math.max(0, Math.min(max, Math.floor(n))) || ""; st.all = !!all; paint(); };
  const box = h("div", { class: "bk-ticket" }, label(o.label), field.el, chipRow(o.chips.map(([text, n, all]) => [text, () => set(n, all), !(max > 0 && n <= max)])), o.extra || null, why, sum, go);
  box.paint = () => paint();
  paint();
  return box;
}

// 掛單：價格、股數兩個大數字欄，下面寫會先鎖住什麼，大按鈕送出
// o = { kind: "buy"|"sell"|"stop", state（{ opx, on }）, price（現價）, maxN(px), rows(px, n), why(px, n), onGo(px, n) }
export function orderTicket(o) {
  const { kind, state: f, price } = o, buy = kind === "buy", up = kind === "sell";
  const { sum, why } = parts(), px = () => (f.opx > 0 ? f.opx : 0), n = () => (Number.isInteger(f.on) && f.on > 0 ? f.on : 0);
  const cents = x => Math.max(0.01, Math.round(x * 100) / 100), one = price >= 100 ? Math.max(1, Math.round(price / 100)) : cents(price / 100); // −／＋ 壹次約現價的 1%
  const go = btn("", () => { if (px() && n() && !o.why(px(), n())) o.onGo(px(), n()); }, "bk-go side-" + (buy ? "buy" : "sell"));
  const pxField = bigField({ aria: "價格", unit: up ? "以上" : "以下", decimal: true, onStep: d => { f.opx = cents(px() + d * one); paint(); }, onType: x => { f.opx = x; paint("px"); } });
  const nField = bigField({ aria: "股數", unit: "股", onStep: d => { f.on = Math.max(0, n() + d); paint(); }, onType: x => { f.on = x === "" ? "" : Math.floor(x); paint("n"); } });
  const paint = typing => {
    if (typing !== "px") pxField.show(f.opx);
    if (typing !== "n") nField.show(f.on);
    const bad = o.why(px(), n());
    showWhy(why, bad);
    sum.replaceChildren(...sumRows(o.rows(px(), n())));
    go.textContent = (buy ? "掛限價買單" : up ? "掛限價賣單" : "掛停損賣單") + (n() ? "　" + fmt(n()) + " 股" : "");
    go.disabled = !px() || !n() || !!bad;
  };
  const box = h("div", { class: "bk-ticket" },
    label(buy ? "跌到多少就買" : up ? "漲到多少就賣" : "跌到多少就賣"), pxField.el,
    chipRow([1, 2, 5, 10].map(p => [(up ? "＋" : "−") + p + "%", () => { f.opx = cents(price * (1 + (up ? p : -p) / 100)); paint(); }])),
    label("股數"), nField.el,
    chipRow([["10", 10], ["100", 100], ["1,000", 1000], [buy ? "最多" : "全部", -1]].map(([text, k]) => [text, () => { f.on = k < 0 ? o.maxN(px()) : k; paint(); }])),
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
