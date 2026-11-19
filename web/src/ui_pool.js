// ================================================================
//  館門口的池子（11-19，決定 0132；伺服器 peek 多回 pool）
//  pool = { lv 0～24 格, dir -1/0/1, band low/mid/high/edge/over, night, trace 最近 7 天的 lv, hits }
//  畫面：館門口（大廳導覽圖最下面中間、八角大廳的正下方）壹個嵌在地上的石池，剖面：左邊壹道石階走下去，
//        石階上壹道舊刻線「門檻」；水面壹條橫線照 lv 高低；右牆有幾道舊水痕（trace）；lv≤3 池底露壹枚空心圓章；
//        night：大廳的燈暗壹格、石階上壹排濕腳印走到信箱前。
//  不寫數字、不寫是誰的錢、沒有說明。水面只有極慢的波紋（SVG animate，45 秒沒操作 rest.js 會停）。
//  沒有 pool（伺服器還沒給、或關掉）就什麼都不畫。
// ================================================================
import { ADDONS, UI } from "./ui_core.js";

const NS = "http://www.w3.org/2000/svg";
const THR = 24;               // 門檻（水位 ℓ＝1.0）＝lv 24＝池口那一格；edge／over 照伺服器給的 band，不用格數猜（PR 784）
const Y0 = 48, Y1 = 10, LVMAX = 24; // 池底、池口的 y；lv 滿格
const yOf = lv => Y0 - Math.max(0, Math.min(LVMAX, lv)) / LVMAX * (Y0 - Y1);
const el = (tag, attrs, ...kids) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) if (v != null) e.setAttribute(k, String(v)); kids.forEach(c => c && e.append(c)); return e; };

// 把 pool 畫成壹個 <svg>（純畫圖，沒有任何文字）
export function poolSvg(pool) {
  const lv = Math.max(0, Math.min(LVMAX, Math.round(+pool.lv || 0))), dir = pool.dir > 0 ? 1 : pool.dir < 0 ? -1 : 0, band = pool.band || "mid";
  const ys = yOf(Math.max(lv, 0.8)), over = band === "over", edge = band === "edge";
  const svg = el("svg", { class: "pool-svg", viewBox: "0 0 200 56", role: "img", "aria-label": "館門口的池子", preserveAspectRatio: "xMidYMax meet" });
  const wy = over ? Y1 - 1 : ys;
  const water = [
    el("rect", { x: 8, y: wy, width: 164, height: Y0 - wy + 1, fill: "url(#pool-w)", opacity: ".95" }),
    el("rect", { x: 8, y: wy, width: 164, height: 5, fill: "#3A807A", opacity: ".35" })];
  // 石階（壹階壹階往下）、池緣、右牆
  const steps = el("polygon", { points: "6,10 20,10 20,20 28,20 28,30 34,30 34,50 6,50", fill: "url(#pool-s)", stroke: "#8A7452", "stroke-width": ".8" });
  const lip = el("rect", { x: 4, y: 4, width: 172, height: 6, fill: "url(#pool-s)", stroke: "#8A7452", "stroke-width": ".8" });
  const joints = [...Array.from({ length: 9 }, (_, i) => el("path", { d: `M${24 + i * 18} 4 V10`, stroke: "#2E261D", "stroke-width": ".6", opacity: ".7" })), el("path", { d: "M6 10 H20 M20 20 H28 M28 30 H34", stroke: "#B9A27A", "stroke-width": ".8", opacity: ".6" }), el("path", { d: "M6 24 H18 M6 37 H26 M12 44 H30", stroke: "#2E261D", "stroke-width": ".5", opacity: ".6" })];
  const wall = el("rect", { x: 172, y: 4, width: 8, height: 46, fill: "url(#pool-s)", stroke: "#8A7452", "stroke-width": ".8" });
  const floor = el("rect", { x: 4, y: 48, width: 176, height: 4, fill: "#3A3128", stroke: "#8A7452", "stroke-width": ".8" });
  // 門檻：石階上壹道舊刻線（磨損的，斷斷續續），旁邊是來過幾次的刮痕
  const ty = yOf(THR), hits = Math.max(0, Math.min(5, Math.round(+pool.hits || 0)));
  const groove = el("path", { d: `M6 ${ty + 3} H34`, stroke: "#E2C98A", "stroke-width": "1", "stroke-dasharray": "5 1.5 2 1.5", opacity: ".85", fill: "none" });
  const scratches = Array.from({ length: hits }, (_, i) => el("path", { d: `M${9 + i * 2.6} ${ty + 4} l.6 4.2`, stroke: "#C9B98F", "stroke-width": ".7", opacity: ".7", fill: "none" }));
  // 右牆的舊水痕（最近 7 天水到過哪裡）
  const trace = (Array.isArray(pool.trace) ? pool.trace : []).slice(-7).map((v, i) => el("path", { d: `M${164 + (i % 2) * 2} ${yOf(+v || 0)} H172`, stroke: "#A9D8D2", "stroke-width": ".6", opacity: ".35" }));
  // 水面：壹條橫線（極慢的波紋）；dir 非 0 時，上壹次的水位留壹條淡淡的濕痕
  const wave = a => `M20 ${wy} Q60 ${wy - a} 100 ${wy} T172 ${wy}`;
  const surface = el("path", { d: wave(0.5), stroke: edge || over ? "#E9FFF8" : "#A9E6DC", "stroke-width": edge || over ? "1.5" : "1.2", fill: "none", opacity: edge || over ? ".95" : ".8" },
    el("animate", { attributeName: "d", dur: "11s", repeatCount: "indefinite", values: `${wave(0.5)};${wave(-0.5)};${wave(0.5)}`, calcMode: "spline", keySplines: ".4 0 .6 1;.4 0 .6 1", keyTimes: "0;.5;1" }));
  const prev = dir && lv > 0 && lv < LVMAX ? el("path", { d: `M36 ${yOf(lv - dir)} H170`, stroke: "#A9E6DC", "stroke-width": ".6", "stroke-dasharray": "2 3", opacity: ".38", fill: "none" }) : null;
  const glow = edge || over ? el("rect", { x: 34, y: wy - 2, width: 138, height: 4, fill: "#BFF5E8", opacity: ".14" }) : null;
  const sheen = over ? [el("rect", { x: 6, y: 3, width: 168, height: 1.6, fill: "#9FE0D6", opacity: ".5", rx: ".8" }), el("circle", { cx: 12, cy: 11.5, r: ".9", fill: "#9FE0D6", opacity: ".7" }), el("circle", { cx: 15, cy: 13.2, r: ".7", fill: "#9FE0D6", opacity: ".5" })] : [];
  // lv≤3：池底露壹枚空心圓章
  const coin = lv <= 3 ? [el("circle", { cx: 104, cy: 44.4, r: 3.4, fill: "none", stroke: "#D6B25E", "stroke-width": ".9", opacity: ".8" }), el("circle", { cx: 104, cy: 44.4, r: 1.5, fill: "none", stroke: "#D6B25E", "stroke-width": ".6", opacity: ".6" })] : [];
  // 信箱：池子右邊的小木柱和壹個信箱
  const mail = [el("rect", { x: 188, y: 14, width: 1.8, height: 36, fill: "#3A2A1E" }), el("rect", { x: 183, y: 9, width: 12, height: 8, rx: "2", fill: "#6A4A2A", stroke: "#B08A3E", "stroke-width": ".7" }), el("rect", { x: 186, y: 12, width: 6, height: 1.2, fill: "#1B120C" })];
  // night：石階上壹排濕腳印，從池口走到信箱前（越走越淡）
  const prints = pool.night ? Array.from({ length: 8 }, (_, i) => { const x = 40 + i * 17.5, y = 6.4 + (i % 2 ? 1.2 : -1.2); return el("ellipse", { cx: x, cy: y, rx: 2.2, ry: 1.1, fill: "#8FD8CE", opacity: (0.75 - i * 0.07).toFixed(2), transform: `rotate(${i % 2 ? 8 : -8} ${x} ${y})` }); }) : [];
  const drip = pool.night ? [el("circle", { cx: 30, cy: 7, r: ".9", fill: "#8FD8CE", opacity: ".7" }), el("circle", { cx: 34.5, cy: 7.6, r: ".6", fill: "#8FD8CE", opacity: ".5" })] : [];
  svg.append(el("defs", null, el("linearGradient", { id: "pool-w", x1: 0, y1: 0, x2: 0, y2: 1 }, el("stop", { offset: "0", "stop-color": "#2C7571" }), el("stop", { offset: "1", "stop-color": "#102F32" })), el("linearGradient", { id: "pool-s", x1: 0, y1: 0, x2: 0, y2: 1 }, el("stop", { offset: "0", "stop-color": "#6E5F4B" }), el("stop", { offset: "1", "stop-color": "#3E352B" })), el("clipPath", { id: "pool-clip" }, el("rect", { x: 6, y: 10, width: 166, height: 38 }))));
  svg.append(el("g", { "clip-path": "url(#pool-clip)" }, ...water, glow, prev, surface, ...coin, ...trace), steps, lip, wall, floor, ...joints, groove, ...scratches, ...sheen, ...mail, ...prints, ...drip);
  return svg;
}

// 大廳導覽圖（.l2-map）上放壹個：位置在八角大廳正下方、銀行小門廳外面（橫式 1024×572、直式 572×1024 的底圖）
function mount(map, portrait) {
  const pool = UI.pool;
  if (!pool || typeof pool !== "object") return null;
  const box = document.createElement("div");
  box.className = "pool-door" + (portrait ? " port" : "");
  box.append(poolSvg(pool));
  map.classList.toggle("pool-night", !!pool.night);
  map.append(box);
  return box;
}
ADDONS.poolMount = mount;
// peek 讀到 pool：存起來，大廳開著就換掉那壹塊（沒開就等下次畫大廳）
ADDONS.poolPeek = pool => {
  const next = pool && typeof pool === "object" ? pool : null;
  if (JSON.stringify(next) === JSON.stringify(UI.pool || null)) return;
  UI.pool = next;
  const map = document.querySelector(".l2-map"); if (!map) return;
  const old = map.querySelector(".pool-door"); if (old) old.remove();
  map.classList.remove("pool-night");
  if (next) mount(map, map.classList.contains("port"));
};
