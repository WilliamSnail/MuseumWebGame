// 下單區的排版（11-27 翊文：「這個感覺有點都是文字不太好辨識」、試幾種排版）。
// unitRow／quickHead 是現在這版（分層上色）用的小零件；ticketBox 是另外兩種試排：b＝下單單（先填數量，壹顆大按鈕）、c＝拉桿（拖比例，壹顆大按鈕）。
// 試排只在開發時用網址 ?tl=b、?tl=c 看；翊文挑定之後留壹種、刪掉其他。不 import ui_bank.js（不准繞圈），要用的東西由 ui_bank.js 傳進來。
import { btn, h } from "../../core/ui_core.js";

export const unitRow = el => h("div", { class: "bank-unit" }, h("span", null, "下單方式"), el);
export const quickHead = side => h("p", { class: "bank-qh" }, side === "buy" ? "快速買（按了先跳確認）" : "快速賣（按了先跳確認）");
export const ticketKind = () => (import.meta.env.DEV ? new URLSearchParams(location.search).get("tl") : null);

const fmt = n => Number(n).toLocaleString("en-US");

// o = { kind: "b"|"c", side, max, price（顯示用的字）, sumOf(n), ask(n), state }
export function ticketBox(o) {
  const { kind, side, max, state: st } = o, buy = side === "buy", verb = buy ? "買進" : "賣出";
  const clamp = n => Math.max(0, Math.min(max, Math.floor(Number(n) || 0)));
  if (st.n === "" || st.n == null) st.n = Math.min(10, max);
  st.n = clamp(st.n);
  const sum = h("dl", { class: "bk-sum" }), go = btn("", () => { if (st.n > 0) o.ask(st.n); }, "bk-go side-" + side);
  const row = (k, v, cls) => h("div", { class: "bk-sum-r " + (cls || "") }, h("dt", null, k), h("dd", null, v));
  let input = null, slider = null, big = null;
  const paint = from => {
    const n = st.n, x = o.sumOf(n);
    if (input && from !== "input") input.value = String(n);
    if (slider && from !== "slider") slider.value = String(n);
    if (slider) slider.style.setProperty("--p", (max ? Math.round(n / max * 100) : 0) + "%");
    if (big) big.textContent = fmt(n);
    sum.replaceChildren(row("股價", o.price), row("手續費", n ? fmt(x.fee) : "0"), !buy && x.tax ? row("證交稅", fmt(x.tax)) : null, row(buy ? "要付" : "拿回", n ? fmt(x.total) : "0", "total"));
    go.textContent = n ? `${verb} ${fmt(n)} 股` : buy ? "錢不夠買壹股" : "沒有可以賣的";
    go.disabled = !n;
  };
  const set = (n, from) => { st.n = clamp(n); paint(from); };
  const chip = (label, n) => h("button", { type: "button", class: "bk-chip", disabled: max > 0 ? null : true, onClick: () => set(n) }, label);
  let pick;
  if (kind === "b") {
    input = h("input", { type: "number", inputmode: "numeric", class: "bk-big-in", min: "0", max: String(max), "aria-label": "股數", onInput: e => set(e.target.value, "input") });
    pick = [h("div", { class: "bk-field" }, h("button", { type: "button", class: "bk-step", "aria-label": "少壹股", onClick: () => set(st.n - 1) }, "−"), input, h("em", null, "股"), h("button", { type: "button", class: "bk-step", "aria-label": "多壹股", onClick: () => set(st.n + 1) }, "＋")),
      h("div", { class: "bk-chips" }, chip("10", 10), chip("100", 100), chip("1,000", 1000), chip(buy ? "買滿" : "全賣", max))];
  } else {
    big = h("b", null, "0");
    slider = h("input", { type: "range", class: "bk-slider side-" + side, min: "0", max: String(max), step: "1", "aria-label": "股數", onInput: e => set(e.target.value, "slider") });
    pick = [h("div", { class: "bk-bignum" }, h("button", { type: "button", class: "bk-step", "aria-label": "少壹股", onClick: () => set(st.n - 1) }, "−"), h("p", null, big, h("em", null, "股")), h("button", { type: "button", class: "bk-step", "aria-label": "多壹股", onClick: () => set(st.n + 1) }, "＋")),
      slider, h("p", { class: "bk-range-t" }, h("span", null, "0"), h("span", null, `最多 ${fmt(max)}`)),
      h("div", { class: "bk-chips" }, [25, 50, 75, 100].map(p => chip(p === 100 ? "全部" : p + "%", Math.floor(max * p / 100))))];
  }
  const box = h("div", { class: "bk-ticket " + kind }, pick, sum, go);
  paint();
  return box;
}
