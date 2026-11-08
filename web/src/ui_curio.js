// =====================================================================
//  會動的珍品（翊文 11-08：越後面解開的東西要更有趣、能互動，而且要有提示說怎麼玩）
//  大廳的展示、手作坊的展台、做出來的揭曉、圖鑑的大圖：身上有這些選項的佩佩就能玩。
//  點牠、點帽子、點背景、點手上的東西，各有反應；旁邊會出現一行「可以互動」的提示。
//  要加新的：在 CURIOS 加一筆 { cat, opt, where, tap（點了會怎樣）, pass（游標移過去會怎樣）, idle（一直有的 class）, act }。
// =====================================================================
// ---------- 第 4 版：從別的檔拿的（從第 3 版轉成模組時自動產生；之後新增用到的名字就手動加） ----------
import { FX } from "./fx.js";
import { h, later, note, snd } from "./ui_core.js";

export const SVGNS = "http://www.w3.org/2000/svg";
export const svgEl = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); Object.keys(attrs || {}).forEach(k => e.setAttribute(k, attrs[k])); return e; };
export const curioReduced = () => document.body.classList.contains("reduce-motion");
// 重新播一次 CSS 動畫（SVG 元素沒有 offsetWidth，用 getBoundingClientRect 逼它重算）
export function replay(el, cls, ms) {
  if (!el) return;
  el.classList.remove(cls); el.getBoundingClientRect(); el.classList.add(cls);
  if (ms) setTimeout(() => el.classList.remove(cls), ms);
}
export const curioSay = (box, text, tone) => { if (FX.floatText) FX.floatText(box, text, tone || "neutral"); };

// ---------- 每一種的反應 ----------
export function eyesAct(box, svg) { // 不可名狀：每點一下多睜開兩隻眼睛；睜到第 9 隻，全部一起閉上
  const n = box.__eyes || 0;
  if (n >= 9) return;
  for (let i = 0; i < 2; i++) {
    const a = Math.random() * Math.PI * 2, r = 62 + Math.random() * 30;
    const x = 100 + Math.cos(a) * r, y = 108 + Math.sin(a) * r * 0.9, s = 0.9 + Math.random() * 0.6, rot = Math.round(Math.random() * 40 - 20);
    const outer = svgEl("g", { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot}) scale(${s.toFixed(2)})`, class: "curio-eye-wrap" });
    const g = svgEl("g", { class: "f-void-eye curio-eye" });
    g.append(svgEl("path", { d: "M-10 0Q0-8 10 0Q0 8-10 0Z", fill: "#EDE7F6", stroke: "#2A2238", "stroke-width": ".8" }), svgEl("ellipse", { rx: "2.2", ry: "5", fill: "#2A2238" }));
    outer.append(g); svg.append(outer);
  }
  box.__eyes = n + 2;
  snd("eyeOpen");
  if (box.__eyes % 4 === 0) later(() => snd("whisper"), 120);
  if (box.__eyes >= 9) {
    later(() => { svg.classList.add("eyes-shut"); snd("whisper"); note("牠們一起閉上了眼睛。你鬆了一口氣。"); }, 500);
    later(() => { svg.querySelectorAll(".curio-eye-wrap").forEach(e => e.remove()); svg.classList.remove("eyes-shut"); box.__eyes = 0; }, 2600);
  }
}
export function gazeAt(box, e) { // 眼睛跟著游標：佩佩自己的瞳孔，和身邊那些眼睛
  const r = box.getBoundingClientRect();
  if (!r.width) return;
  const gx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2)));
  const gy = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 2)));
  box.style.setProperty("--gx", gx.toFixed(2)); box.style.setProperty("--gy", gy.toFixed(2));
  box.querySelectorAll(".f-void-eye").forEach(eye => {
    const er = eye.getBoundingClientRect(), dx = e.clientX - (er.left + er.width / 2), dy = e.clientY - (er.top + er.height / 2), d = Math.hypot(dx, dy) || 1;
    const p = eye.querySelector("ellipse");
    if (p) { p.setAttribute("cx", (dx / d * 3).toFixed(2)); p.setAttribute("cy", (dy / d * 1.6).toFixed(2)); }
  });
}
export const CURIOS = [
  { cat: "稀有度", opt: "不可名狀", where: "body", pass: "眼睛會跟著轉", tap: "會睜開更多眼睛", gaze: true, act: eyesAct },
  { cat: "稀有度", opt: "傳說級稀有", where: "body", tap: "光環轉起來", act: (box, svg) => { replay(svg, "halo-fast", 1600); if (FX.goldDust && !curioReduced()) FX.goldDust(box, 1200); snd("sparkle"); } },
  { cat: "心情", opt: "俄國8+9", where: "body", tap: "跟著節奏蹲", act: box => { replay(box, "curio-squat", 3300); snd("gopnik"); curioSay(box, "8+9！"); } },
  { cat: "心情", opt: "微醺", where: "body", idle: "curio-tipsy", note: "牠一直搖搖晃晃", tap: "打嗝", act: box => { replay(box, "curio-hic", 500); snd("hic"); curioSay(box, "嗝"); } },
  { cat: "心情", opt: "虔誠", where: "body", tap: "聽聽祝福", act: box => {
    if (!box.querySelector(".curio-halo")) { const halo = h("i", { class: "curio-halo", "aria-hidden": "true" }); box.append(halo); setTimeout(() => halo.remove(), 2600); }
    snd("choir");
  } },
  { cat: "顏色", opt: "虹彩", where: "body", idle: "curio-rainbow", pass: "左右移動，顏色會流動", rainbow: true, tap: "閃一下", act: box => { replay(box, "curio-shine", 1200); snd("shimmer"); } },
  { cat: "顏色", opt: "夜市金", where: "body", tap: "金光閃閃", act: box => { replay(box, "curio-shine", 1200); if (FX.goldDust && !curioReduced()) FX.goldDust(box, 1000); snd("coin"); later(() => snd("sparkle"), 180); } },
  { cat: "帽子", opt: "觸手帽", where: "帽子", hoverCls: "curio-wiggle", pass: "觸手會動", tap: "觸手縮起來", act: box => { replay(box, "curio-curl", 700); snd("squelch"); } },
  { cat: "帽子", opt: "皇冠", where: "帽子", tap: "皇冠閃一下", act: box => { replay(box, "curio-glint", 900); snd("sparkle"); } },
  { cat: "帽子", opt: "毛帽", where: "帽子", tap: "毛球彈一下", act: box => { replay(box, "curio-boing", 700); snd("puff"); } },
  { cat: "帽子", opt: "紳士帽", where: "帽子", tap: "脫帽致意", act: box => { replay(box, "curio-tip", 1200); snd("tip"); } },
  { cat: "姿勢", opt: "斯拉夫蹲", where: "body", tap: "蹲著彈兩下", skipIf: p => p.心情 === "俄國8+9", act: box => { replay(box, "curio-bob", 900); snd("hey"); } },
  { cat: "姿勢", opt: "倒立", where: "body", tap: "翻回來一下", act: box => { replay(box, "curio-flip", 1400); snd("whoop"); } },
  { cat: "背景", opt: "星空", where: "背景", idle: "curio-stars", note: "背景的星星會閃", tap: "看流星", act: (box, svg) => {
    const y = 30 + Math.random() * 50, line = svgEl("line", { x1: "190", y1: String(y), x2: "150", y2: String(y + 18), class: "curio-meteor" });
    svg.append(line); setTimeout(() => line.remove(), 1200); snd("twinkle");
  } },
  { cat: "背景", opt: "雪夜", where: "背景", tap: "下一陣雪", act: (box, svg) => {
    const g = svgEl("g", { class: "curio-snow", "pointer-events": "none" });
    for (let i = 0; i < 16; i++) g.append(svgEl("circle", { cx: (20 + Math.random() * 160).toFixed(1), cy: String(10 + Math.random() * 30), r: (1 + Math.random() * 1.8).toFixed(1), fill: "#fff", style: `animation-delay:${(Math.random() * 0.8).toFixed(2)}s` }));
    svg.append(g); setTimeout(() => g.remove(), 3000); snd("snow");
  } },
  { cat: "手上拿的東西", opt: "瓜子", where: "手上拿的東西", tap: "嗑瓜子", act: box => { replay(box, "curio-nibble", 500); snd("crack"); curioSay(box, "喀"); } },
  { cat: "手上拿的東西", opt: "小抱枕", where: "手上拿的東西", tap: "捏一捏", act: box => { replay(box, "curio-squish", 600); snd("hug"); } },
  { cat: "手上拿的東西", opt: "放大鏡", where: "手上拿的東西", tap: "用放大鏡看你", act: box => { replay(box, "curio-lens", 1100); snd("eyeOpen"); } },
];
export const CURIO_WHERE = { body: "點牠", 帽子: "點帽子", 背景: "點背景", 手上拿的東西: "點手上的東西" };

// ---------- 掛到一個佩佩的框上 ----------
export const CURIO_BOXES = new Set();
export function regionOf(e) {
  const t = e.target;
  if (!t || !t.closest) return "body";
  if (t.closest(".f-hat")) return "帽子";
  if (t.closest(".f-item")) return "手上拿的東西";
  if (t.closest(".f-bg")) return "背景";
  return "body";
}
export function curioHint(list) {
  const parts = [];
  Object.keys(CURIO_WHERE).forEach(w => {
    const taps = list.filter(c => c.where === w && c.tap).map(c => c.tap);
    if (taps.length) parts.push(`${CURIO_WHERE[w]}：${taps.join("、")}${w === "body" && taps.length > 1 ? "（每點一下換一種）" : ""}`);
  });
  const pass = list.filter(c => c.pass).map(c => c.pass);
  const touch = typeof matchMedia === "function" && matchMedia("(hover: none)").matches;
  if (pass.length) parts.unshift(`${touch ? "手指滑過去" : "游標移過去"}：${pass.join("、")}`);
  const notes = list.filter(c => c.note).map(c => c.note);
  if (notes.length) parts.unshift(notes.join("、"));
  return parts;
}
export function enliven(box, pick) {
  if (!box || !pick) return;
  const list = CURIOS.filter(c => pick[c.cat] === c.opt && !(c.skipIf && c.skipIf(pick)));
  box.__curios = list;
  box.classList.toggle("curio-box", list.length > 0);
  CURIOS.forEach(c => { if (c.idle) box.classList.remove(c.idle); });
  list.forEach(c => { if (c.idle) box.classList.add(c.idle); });
  box.__gaze = list.some(c => c.gaze);
  box.__rainbow = list.some(c => c.rainbow);
  box.__eyes = 0;
  if (!box.__gaze) { box.style.removeProperty("--gx"); box.style.removeProperty("--gy"); }
  if (list.length) CURIO_BOXES.add(box);
  // 提示：放在框的旁邊（同一層的最後面）
  let hint = box.__hint;
  if (!hint && list.length && box.parentElement) { hint = box.__hint = h("p", { class: "curio-hint", "aria-live": "polite" }); box.parentElement.append(hint); }
  if (hint) {
    const parts = curioHint(list);
    hint.hidden = !parts.length;
    hint.replaceChildren(...(parts.length ? [h("b", null, "✦ 可以互動"), ...parts.map(t => h("span", null, t))] : []));
  }
  if (box.__curioBound) return;
  box.__curioBound = true;
  box.addEventListener("click", e => {
    const all = box.__curios || [];
    if (!all.length) return;
    const svg = box.querySelector("svg");
    if (!svg) return;
    const w = regionOf(e);
    let todo = all.filter(c => c.where === w && w !== "body");
    if (!todo.length) {
      const body = all.filter(c => c.where === "body");
      if (body.length) { box.__ci = ((box.__ci == null ? -1 : box.__ci) + 1) % body.length; todo = [body[box.__ci]]; }
      else todo = all.slice(0, 1);
    }
    todo.forEach(c => { try { c.act(box, svg, e); } catch (err) { /* 互動壞了也不影響遊戲 */ } });
  });
  box.addEventListener("pointerenter", () => { (box.__curios || []).forEach(c => { if (c.hoverCls) box.classList.add(c.hoverCls); }); if (box.__rainbow) snd("shimmer"); });
  box.addEventListener("pointerleave", () => { CURIOS.forEach(c => { if (c.hoverCls) box.classList.remove(c.hoverCls); }); });
  box.addEventListener("pointermove", e => {
    if (!box.__rainbow) return;
    const r = box.getBoundingClientRect();
    box.style.setProperty("--hue", Math.round((e.clientX - r.left) / Math.max(1, r.width) * 360) + "deg");
    box.classList.add("hue-live");
  });
}
document.addEventListener("pointermove", e => {
  CURIO_BOXES.forEach(b => {
    if (!b.isConnected) { CURIO_BOXES.delete(b); return; }
    if (b.__gaze) gazeAt(b, e);
  });
}, { passive: true });
