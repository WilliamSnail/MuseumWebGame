// ================================================================
//  大廳導覽圖上的館友（翊文 11-09：「上線的館友目前在哪個房間可以在大廳導覽圖內顯示」）
//  規則在 shared/mates.js（名單 → 每間房有誰）。樣式在 css/mates.css。
//  - 每間房的下緣（放不下就上緣）一排小名牌：燈號＋暱稱；暫離的淡一點；放不下的寫「+N」。
//  - 不在圖上的：門口、設定放圖下面一行「在別處」；結局、黑房間、不認得的不顯示。
//  - 只更新導覽圖上的 <g class="fp-mates">，不重畫大廳（大廳每次重畫會換展示的佩佩、收掉滑鼠停著的提示、打斷教學）。
//  - 暱稱是玩家打的字：只用 textContent（createElementNS），不拼進字串。
//  - 名牌 pointer-events:none，點下去是房間的點擊；單機版（沒有 NET）、斷線時不畫。
//  ui_screens1.js 的大廳畫好導覽圖之後叫 ADDONS.planMates(plan)；名單有變時這裡自己更新。
// ================================================================
import { fitMates, matesByRoom } from "../../shared/mates.js";
import { NET } from "./net_firebase.js";
import { ADDONS, UI, h } from "./ui_core.js";

const NS = "http://www.w3.org/2000/svg";
const MAX_CHARS = 6;   // 名牌上最多幾個字，再長就「…」
const GAP = 4;
const plateH = fs => Math.round(fs * 1.3); // 名牌高度：手機版的房間只剩 24 左右的上下留白，不能再高
// 大廳自己的空地（導覽圖座標，跟 art.js 的 PLAN 對照）：電腦版是右下那塊，手機版是入口上面
const LOBBY_FREE = { land: [478, 452, 184, 112], port: [236, 740, 128, 112] };

const el = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};
const chars = s => [...String(s)];
const short = (s, n) => { const c = chars(s); return c.length > n ? c.slice(0, n - 1).join("") + "…" : s; };
const textW = (s, fs) => chars(s).reduce((w, c) => w + (c.charCodeAt(0) < 256 ? .6 : 1) * fs, 0);
const plateW = (s, fs) => Math.round(textW(s, fs) + fs * 1.9);

// 這間房的內容（圖示、房名、進度）佔到哪裡（導覽圖座標）：上下左右留白才放得下名牌
// 圖示有自己的 transform，getBBox 量不準，所以用畫面上的方框換算回導覽圖座標
function contentSpan(g, svg) {
  const sr = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
  if (!sr.width || !vb.width) return null;
  const k = vb.width / sr.width;
  let top = Infinity, bot = -Infinity, left = Infinity, right = -Infinity;
  for (const c of g.querySelectorAll(".fp-icon, .fp-label, .fp-prog")) {
    const b = c.getBoundingClientRect();
    if (!b.width && !b.height) return null;
    top = Math.min(top, (b.top - sr.top) * k); bot = Math.max(bot, (b.bottom - sr.top) * k);
    left = Math.min(left, (b.left - sr.left) * k); right = Math.max(right, (b.right - sr.left) * k);
  }
  return top === Infinity ? null : { top, bot, left, right };
}

// 排名牌：在 [x,y,w,h] 這塊空地，一行一行排，最後一行放不下的寫「+N」。回傳要畫的東西
function layout(list, box, fs, maxRows) {
  const [bx, by, bw, bh] = box, rh = plateH(fs), rows = Math.min(maxRows, Math.floor((bh + 2) / (rh + 2)));
  if (rows < 1 || !list.length) return null;
  const moreW = plateW("+99", fs);
  const items = list.map(m => ({ m, label: short(m.nick, MAX_CHARS) }));
  // 第 1 個放不下就把暱稱縮短（還有別人要留「+N」的位子）
  const one = items[0], keep = items.length > 1 ? GAP + moreW : 0;
  for (let n = chars(one.label).length; n > 2 && plateW(one.label, fs) + keep > bw; n--) one.label = short(one.m.nick, n);
  const out = [];
  let rest = items, row = 0;
  while (rest.length && row < rows) {
    const last = row === rows - 1, widths = rest.map(i => plateW(i.label, fs));
    const r = fitMates(rest, widths, bw, last ? moreW : 0, GAP);
    let n = r.shown.length;
    if (!last && !n) n = 1;
    const shown = rest.slice(0, n);
    let x = bx;
    for (const it of shown) { const w = Math.min(plateW(it.label, fs), bw); out.push({ it, x, y: by + row * (rh + 2), w, h: rh }); x += w + GAP; }
    rest = rest.slice(n);
    if (last && rest.length) { out.push({ more: rest.length, x, y: by + row * (rh + 2), w: moreW, h: rh }); rest = []; }
    row++;
  }
  return out;
}
function drawPlate(layer, p, fs, fresh) {
  const g = el("g", { class: "fp-mate" + (p.more ? " more" : p.count ? " online" : " " + p.it.m.status) + (fresh ? " is-new" : "") });
  g.append(el("rect", { class: "fp-mate-plate", x: p.x, y: p.y, width: p.w, height: p.h, rx: p.h / 2 }));
  if (p.count) { // 一格放不下任何名字：燈號＋人數
    g.append(el("circle", { class: "fp-mate-dot", cx: p.x + p.h * .5, cy: p.y + p.h / 2, r: fs * .26 }));
    g.append(el("text", { class: "fp-mate-t", x: p.x + p.h * .9, y: p.y + p.h * .72, "font-size": fs, "font-family": "inherit", "font-weight": 700 }, String(p.count)));
  } else if (p.more) g.append(el("text", { class: "fp-mate-t", x: p.x + p.w / 2, y: p.y + p.h * .72, "text-anchor": "middle", "font-size": fs, "font-family": "inherit" }, "+" + p.more));
  else {
    g.append(el("circle", { class: "fp-mate-dot", cx: p.x + p.h / 2, cy: p.y + p.h / 2, r: fs * .26 }));
    g.append(el("text", { class: "fp-mate-t", x: p.x + p.h * .9, y: p.y + p.h * .72, "font-size": fs, "font-family": "inherit" }, p.it.label));
  }
  layer.append(g);
}

let prevIds = {}; // 房間 → 上次在那裡的人（新來的才淡入，其他的不動）
function sync() {
  if (!UI.net) return; // 單機版：畫面跟以前一樣
  const svg = document.querySelector(".plan svg.fp");
  if (!svg || UI.screen !== "lobby") return;
  const plan = svg.parentNode;
  const on = NET.state === "online";
  const by = on ? matesByRoom(NET.roster) : null;
  const portrait = plan.classList.contains("portrait");
  // 名單沒變就不動（滑鼠停著的、淡入的都不被打斷）
  const sig = by ? JSON.stringify([portrait, Object.keys(by).map(k => [k, by[k].map(m => [m.id, m.nick, m.status, m.where || "", m.title || ""])])]) : "";
  if (plan.dataset.mates === sig) return;
  plan.dataset.mates = sig;
  svg.querySelector(".fp-mates")?.remove();
  plan.querySelector(".plan-else")?.remove();
  for (const g of svg.querySelectorAll(".fp-room")) { // 房間的朗讀文字（aria-label）：加上「館友在這裡」
    if (g.dataset.lab0 === undefined) g.dataset.lab0 = g.getAttribute("aria-label") || "";
    g.setAttribute("aria-label", g.dataset.lab0);
  }
  const layer = el("g", { class: "fp-mates", "pointer-events": "none" });
  svg.append(layer);
  if (!by) return;
  const fs = portrait ? 17 : 15, now = {};
  const place = (key, list, box, maxRows) => {
    now[key] = list.map(m => m.id);
    const lay = layout(list, box, fs, maxRows);
    if (lay) for (const p of lay) drawPlate(layer, p, fs, p.it && !(prevIds[key] || []).includes(p.it.m.id));
    return !!lay;
  };
  for (const g of svg.querySelectorAll(".fp-room[data-room]")) {
    const key = g.dataset.room, list = by[key];
    if (!list || !list.length) continue;
    g.setAttribute("aria-label", `${g.dataset.lab0}（館友在這裡：${list.map(m => m.nick + (m.title ? `，稱號${m.title}` : "")).join("、")}）`);
    const r = g.querySelector(".fp-shape"), x = +r.getAttribute("x"), y = +r.getAttribute("y"), w = +r.getAttribute("width"), hh = +r.getAttribute("height");
    const sp = contentSpan(g, svg), pad = 5, ph = plateH(fs);
    if (!sp) { now[key] = list.map(m => m.id); continue; } // 量不到（畫面沒顯示）：先不畫
    // 放哪裡：下緣有空位放下緣（最多 2 行），不然上緣，不然內容旁邊空的那一邊（一行），都沒有就右下角一顆人數
    const below = y + hh - 2 - sp.bot, above = sp.top - (y + 2), rightW = x + w - 4 - (sp.right + 6), leftW = sp.left - 6 - (x + 4), cy = y + hh / 2 - ph / 2;
    const tries = [], tall = Math.min(2 * ph + 2, 99);
    if (below >= ph) tries.push([[x + pad, y + hh - 2 - Math.min(below, tall), w - pad * 2, Math.min(below, tall)], 2]);
    if (above >= ph) tries.push([[x + pad, y + 2, w - pad * 2, Math.min(above, tall)], 2]);
    if (rightW >= 60) tries.push([[sp.right + 6, cy, rightW, ph], 1]);
    if (leftW >= 60) tries.push([[x + 4, cy, leftW, ph], 1]);
    if (!tries.some(([box, rows]) => place(key, list, box, rows))) {
      now[key] = list.map(m => m.id);
      drawPlate(layer, { count: list.length, x: x + w - 42, y: y + hh - ph - 4, w: Math.round(ph * 1.5), h: ph }, fs, false);
    }
  }
  if (by.lobby.length) place("lobby", by.lobby, LOBBY_FREE[portrait ? "port" : "land"], portrait ? 4 : 3);
  prevIds = now;
  if (by.elsewhere.length) {
    const names = by.elsewhere.slice(0, 4).map(m => `${m.nick}${m.title ? `「${m.title}」` : ""}（${m.where.slice(1)}）`).join("、") + (by.elsewhere.length > 4 ? ` 等 ${by.elsewhere.length} 位` : "");
    plan.append(h("p", { class: "plan-else" }, "在別處：", names));
  }
}

ADDONS.planMates = plan => { // 大廳畫好導覽圖時叫：等圖放進畫面再量
  if (!UI.net) return;
  requestAnimationFrame(() => { if (plan.isConnected) sync(); });
};
NET.on("roster", sync);
NET.on("status", sync);
