// ================================================================
//  壹般的說明牌（翊文 11-21：「教學也要有，像是滑鼠壹過去理智或心情會顯示怎麼獲得那樣」）
//  樣子和狀態列的說明牌同壹個（.st-tip，ui_core.js 的 tipShow）：滑鼠移上去、鍵盤選到顯示；手機長按顯示（長按後那壹下點擊不算）。
//  tipOn(元素, { title, what, how })：what、how 的字可以用 **粗體** 標記。賭場的頁籤用。
// ================================================================
import { h, markText } from "./ui_core.js";

let box = null, owner = null;
export function tipOff() { if (box) box.hidden = true; owner = null; }
function show(el, t) {
  if (!box || !box.isConnected) { box = h("div", { class: "st-tip", id: "ui-tip", role: "tooltip", hidden: true }); document.body.append(box); }
  owner = el;
  box.replaceChildren(h("b", { class: "st-tip-t" }, t.title), h("p", null, markText(t.what)), t.how ? h("ul", null, t.how.map(x => h("li", null, markText(x)))) : null);
  box.hidden = false;
  const r = el.getBoundingClientRect(), w = box.offsetWidth, bh = box.offsetHeight;
  box.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
  box.style.bottom = "auto";
  box.style.top = (r.bottom + 8 + bh > innerHeight ? Math.max(8, r.top - bh - 8) : r.bottom + 8) + "px";
}
export function tipOn(el, t) {
  if (!el || !t) return el;
  let timer = null, held = false;
  el.addEventListener("pointerenter", e => { if (e.pointerType !== "touch") show(el, t); });
  el.addEventListener("pointerleave", e => { if (e.pointerType !== "touch") tipOff(); });
  el.addEventListener("focus", () => show(el, t));
  el.addEventListener("blur", tipOff);
  el.addEventListener("pointerdown", e => { if (e.pointerType !== "touch") return; held = false; timer = setTimeout(() => { held = true; show(el, t); }, 450); });
  const cancel = () => { clearTimeout(timer); };
  el.addEventListener("pointerup", cancel); el.addEventListener("pointercancel", cancel); el.addEventListener("pointermove", cancel);
  el.addEventListener("click", e => { if (held) { e.preventDefault(); e.stopImmediatePropagation(); held = false; } }, true);
  el.addEventListener("contextmenu", e => { if (held) e.preventDefault(); });
  return el;
}
document.addEventListener("click", () => { if (box && !box.hidden) tipOff(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") tipOff(); });
