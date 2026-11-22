// ================================================================
//  理智低的時候，畫廊、展廳、大廳慢慢多一些怪事（翊文 11-22：「這些在理智55以下就逐漸有」）
//  三段（門檻在 shared/core/config.js 的 NUM.sanFx.tiers，判斷在 shared/social/room_mood.js 的 sanFxTier）：
//    第 1 段（< 55）很輕，偶爾壹樣：畫廊有壹幅畫的角落多看你壹眼；展廳有壹隻佩佩把頭轉向你
//    第 2 段（< 40）多幾樣：眼睛同時出現兩處；白布從畫面上緣滑下壹點；大廳的「今日要聞」換成不是館員的口氣
//    第 3 段（< 25）最明顯：眼睛三處；白布滑得更下面；畫面四周壓暗
//  都是壹次性的小動作（CSS 動畫放完就拿掉，不用 infinite）；跟 ui_odd.js 的怪事（畫翻、黑影跟著游標、按鈕亂碼）、sanDread（音樂）、心跳是不同的壹層，門檻不衝突，對照見 docs/規劃/理智漸進變化.md。
//  自由模式、燈熄（理智歸零）、省電中、分頁在背景時不演。介面文字照第 1 代用「壹」。
//  入口：ui_core.js 的 updateStatus 叫 ADDONS.sanFx(理智, 是不是自由模式)。
// ================================================================
import { NUM } from "../../../shared/core/config.js";
import { SANFX_TEXT } from "../../../shared/core/systems_text.js";
import { sanFxTier } from "../../../shared/social/room_mood.js";
import { ADDONS, P, UI, h } from "../core/ui_core.js";

let tier = 0, timer = 0;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = list => list[Math.floor(Math.random() * list.length)];
const gone = (el, ms) => setTimeout(() => el && el.remove && el.remove(), ms);

// ---------- 小動作 ----------
// 畫廊：壹幅畫的角落多出壹雙眼睛，眨 3 下就消失
function eyes(n) {
  const frames = [...document.querySelectorAll(".exhibit:not(.locked) .frame:not(.covered)")].filter(f => !f.querySelector(".sf-eyes"));
  for (let i = 0; i < n && frames.length; i++) {
    const f = frames.splice(Math.floor(Math.random() * frames.length), 1)[0], e = h("span", { class: "sf-eyes", "aria-hidden": "true", style: { left: rnd(12, 68).toFixed(0) + "%", top: rnd(12, 62).toFixed(0) + "%" } }, h("i"), h("i"));
    f.append(e); gone(e, 4000);
  }
}
// 展廳：壹隻佩佩把頭轉向你
function turn(n) {
  const slots = [...document.querySelectorAll(".ped-slot.full:not(.sf-turn)")];
  for (let i = 0; i < n && slots.length; i++) {
    const s = slots.splice(Math.floor(Math.random() * slots.length), 1)[0];
    s.classList.add("sf-turn"); setTimeout(() => s.classList.remove("sf-turn"), 3200);
  }
}
// 白布從畫面上緣滑下壹點（滑多深看段）：--d 是滑下的高度
function cloth(depth) {
  const room = document.getElementById("room") || document.body;
  if (room.querySelector(".sf-cloth")) return;
  const c = h("div", { class: "sf-cloth", "aria-hidden": "true", style: { "--d": depth + "px", left: rnd(8, 60).toFixed(0) + "%" } });
  room.append(c); gone(c, 4600);
}
// 大廳：「今日要聞」換成不是館員的口氣，幾秒後變回來
function voice() {
  const box = document.querySelector(".l2-hl");
  if (!box || box.classList.contains("sf-voice")) return;
  const lab = box.querySelector("b"), old = lab ? lab.textContent : "";
  const line = h("span", { class: "sf-voice-t", role: "status" }, pick(SANFX_TEXT.lines));
  box.classList.add("sf-voice"); if (lab) lab.textContent = SANFX_TEXT.label; box.append(line);
  setTimeout(() => { box.classList.remove("sf-voice"); if (lab) lab.textContent = old; line.remove(); }, 4800);
}

// ---------- 排程 ----------
function fire() {
  timer = 0;
  const idle = document.hidden || document.body.classList.contains("resting") || document.body.classList.contains("lights-out") || UI.busy || !P;
  const scr = UI.screen;
  if (!idle && tier > 0) {
    const d = NUM.sanFx.cloth[tier - 1];
    if (scr === "gallery") { eyes(tier); if (tier >= 2 && Math.random() < 0.6) cloth(d); }
    else if (scr === "hall") { turn(tier); if (tier >= 2 && Math.random() < 0.6) cloth(d); }
    else if (scr === "lobby") { if (tier >= 2) { if (Math.random() < 0.5) voice(); else cloth(d); } else if (Math.random() < 0.5) cloth(Math.round(d)); }
  }
  schedule();
}
function schedule() {
  clearTimeout(timer); timer = 0;
  if (!tier) return;
  const g = NUM.sanFx.gap[tier - 1];
  timer = setTimeout(fire, rnd(g[0], g[1]) * 1000);
}
export function sanFxNow(kind, n = 1) { // 開發時手動叫壹次用（tools/dev/shot 的 --js 也用這個）
  if (kind === "eyes") eyes(n); else if (kind === "turn") turn(n); else if (kind === "cloth") cloth(n); else if (kind === "voice") voice();
}

ADDONS.sanFx = (san, free) => {
  const t = sanFxTier(free || !P ? null : san, !!(P && P.dark));
  for (let i = 1; i <= 3; i++) document.body.classList.toggle("sf" + i, t === i);
  if (t !== tier) { tier = t; schedule(); }
};
