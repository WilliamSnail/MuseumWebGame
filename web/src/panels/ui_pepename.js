// ================================================================
//  替佩佩取名（11-19，決定 0133；shared/logic.js 的 pepeRename）
//  P.pepes[key].nm ＝ 名字（≤12 字）。被「收走名字」的那隻：nm 空白、e.tk ＝ { no 館友號碼, day, stamp }。
//  畫面：
//   ① 圖鑑的說明、展台的卡：有名字就是銅名牌；沒名字有「替牠取名」；
//   ② 被收走的：空白名牌（沒字），翻過來（滑過去、點一下）背面打著號碼；
//   ③ 重新取過名（tk.stamp）：名字旁邊一枚小空心圓章。
//  口氣安靜：不解釋、不說誰收的。名字當純文字（textContent），不當 HTML。
// ================================================================
import { PEPE_NAME } from "../../../shared/config.js";
import { pepeRename } from "../../../shared/logic.js";
import { P, h, btn, icon, note, persist, snd } from "../core/ui_core.js";

const pad3 = n => String(Math.max(0, Math.floor(+n || 0))).padStart(3, "0");
// 這隻現在的名牌狀態：name 有字、blank 被收走沒字、stamp 重新取過名、no 館友號碼
export function pepeNm(key) {
  const e = P && P.pepes && P.pepes[key]; if (!e) return null;
  const tk = e.tk && typeof e.tk === "object" ? e.tk : null, nm = typeof e.nm === "string" ? e.nm : "";
  return { name: nm, blank: !nm && !!tk, stamp: !!(tk && tk.stamp && nm), no: tk ? tk.no : 0 };
}
// 小空心圓章（只有重新取過名的有）
export function pnmStamp() { return h("span", { class: "pnm-stamp", role: "img", "aria-label": "名牌旁邊壓了一枚空心的圓章", title: "圓章" }); }
// 名牌：有名字＝銅牌寫字；被收走＝空白，翻過來背面是號碼
export function pnmPlate(key, o = {}) {
  const s = pepeNm(key); if (!s || (!s.name && !s.blank)) return null;
  if (s.name) return h("span", { class: "pnm-plate named" + (o.mini ? " mini" : ""), title: s.name }, h("b", null, s.name), s.stamp ? pnmStamp() : null);
  const back = s.no ? "No." + pad3(s.no) : "No.---";
  const el = h("button", { type: "button", class: "pnm-plate blank" + (o.mini ? " mini" : ""), "aria-label": `空白的名牌，翻過來看，背面打著 ${back}`, title: "名牌是空的，翻過來看看" },
    h("span", { class: "pnm-face pnm-front" }, h("i", { class: "pnm-slot" })),
    h("span", { class: "pnm-face pnm-back" }, h("b", null, back)));
  el.addEventListener("click", e => { e.stopPropagation(); el.classList.toggle("flip"); });
  return el;
}
// 取名的小視窗：成功了呼叫 after()
export function askPepeName(key, label, after) {
  const e = P.pepes[key]; if (!e) return;
  const old = document.querySelector(".pnm-ask"); if (old) old.remove();
  const err = h("p", { class: "pnm-err", role: "alert" });
  const input = h("input", { class: "t-input pnm-input", type: "text", maxlength: String(PEPE_NAME.max), autocomplete: "off", spellcheck: "false", "aria-label": "佩佩的名字", placeholder: `最多 ${PEPE_NAME.max} 個字` });
  input.value = e.nm || "";
  const done = () => box.remove();
  const go = () => {
    const r = pepeRename(P, key, input.value);
    if (!r.ok) { err.textContent = r.reason || "這個名字不行"; snd("error"); input.focus(); return; }
    persist(); snd("submit"); done();
    note(`牠有名字了：${r.name}`, "good");
    if (after) after();
  };
  const box = h("div", { class: "ask pnm-ask enter", role: "dialog", "aria-label": "替佩佩取名" },
    h("p", { class: "pnm-ask-t" }, e.nm ? "換一個名字" : "替牠取個名字"), label ? h("p", { class: "sub pnm-ask-s" }, label) : null,
    input, err, h("div", { class: "ask-btns" }, btn("掛上去", go, "primary"), btn("先不用", done, "ghost")));
  box.addEventListener("keydown", ev => { if (ev.key === "Escape") done(); else if (ev.key === "Enter") { ev.preventDefault(); go(); } });
  document.body.append(box);
  input.focus(); input.select();
}
// 「替牠取名」按鈕（有名字了寫「改名」）
export function pnmButton(key, label, after, o = {}) {
  const s = pepeNm(key); if (!s) return null;
  const text = s.name ? "改名" : "替牠取名";
  if (o.icon) return h("button", { type: "button", class: "icon-btn pnm-edit", "aria-label": text, title: text, onClick: ev => { ev.stopPropagation(); askPepeName(key, label, after); } }, icon("scroll"));
  return btn(text, () => askPepeName(key, label, after), "small pnm-btn");
}
// 圖鑑說明牌下面的壹塊：名牌＋按鈕
export function pnmBlock(key, label, after) {
  const s = pepeNm(key); if (!s) return null;
  return h("div", { class: "pnm-block" }, pnmPlate(key) || h("span", { class: "pnm-none" }, "還沒有名字"), pnmButton(key, label, after));
}
