// ================================================================
//  銀行「金流」頁籤（11-17 翊文：「做一個動態的 hub 完整顯示整個世界各項金流流動方向的即時動畫」）
//  資料：bankHall.flow（shared/casino_report.js 的 casFlowHub）＝ 今天 05:00 起每兩個地方之間的淨流向：{ edges: [{ from, to, amt, srcs: [{ src, label, amt }] }], bal }
//  畫法：節點排成橢圓、外面世界在中間；每條線壹條帶箭頭的線，線上有金色小圓片沿著方向跑（SVG 的 animateMotion，瀏覽器自己動，不用我們每格算；分頁在背景它會自己停）。
//        粗細＝今天流多少（取對數）、圓片數量跟著多壹點（上限 6 個壹條）。點線上的金額小牌或方塊，下面列出是哪些來源。
//  只給合計和來源標籤，沒有個別館友和 NPC 的名字。介面字用「壹」。
// ================================================================
import { h } from "./ui_core.js";

const NODES = { world: "外面世界", house: "莊家", players: "館友", budget: "博物館資金", museum: "修繕基金", gov: "政府帳", sea: "海底", gen: "憑空" };
const NOTE = { world: "館外的旅客、散客、各集團、文化部", house: "Yuga Bot 的賭場錢", players: "所有館友的錢包合起來", budget: "館方行政、投資、還館債", museum: "門票七成，之後修繕和預算公投", gov: "證交稅、營業稅、娛樂稅", sea: "B4 水面底下，沉掉的錢", gen: "成長、擴充、開場：不是從哪個帳搬來的" };
const fmt = n => Number(Math.round(n)).toLocaleString("en-US");
const short = n => { const a = Math.abs(n); return a >= 1e8 ? (a / 1e8).toFixed(a >= 1e9 ? 0 : 1).replace(/\.0$/, "") + " 億" : a >= 1e4 ? (a / 1e4).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, "") + " 萬" : fmt(a); };
const NS = "http://www.w3.org/2000/svg";
const s = (tag, attrs, ...kids) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) if (v != null) e.setAttribute(k, String(v)); kids.forEach(c => c && e.append(c)); return e; };
const SEL = { e: null, n: null }; // e：選到的線（edges 的第幾條）、n：只看哪個地方 // 選到的：e0、e1…（線）或 n:house（方塊）
let timer = 0;
const still = () => !!(document.body && document.body.classList.contains("reduce-motion")) || (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);

// 版面（分層，不排圓圈）：最上憑空；第二層外面世界壹整條；第三層館友、莊家；第四層博物館資金、修繕基金、政府帳、海底。
// 線從上面那個方塊的下緣出去、接到下面那個的上緣；同壹邊有好幾條就平均分開，不會全擠在中間。同層（館友↔莊家）接左右邊。
const TIER = { gen: 0, world: 1, players: 2, house: 2, museum: 3, gov: 3, budget: 3, sea: 3 }, COLX = { gen: 0.5, world: 0.5, players: 0.27, house: 0.73, museum: 0.125, gov: 0.375, budget: 0.625, sea: 0.875 };
function layout(phone) {
  const W = phone ? 360 : 640, H = phone ? 560 : 470, bh = phone ? 46 : 46, ys = [bh / 2 + 6, H * 0.25, H * 0.56, H - bh / 2 - 6], pos = {};
  for (const id of Object.keys(TIER)) { const wide = id === "world", bw = wide ? W - 16 : id === "gen" ? (phone ? 90 : 110) : TIER[id] === 3 ? (phone ? 80 : 128) : (phone ? 100 : 150); pos[id] = { x: W * COLX[id], y: ys[TIER[id]], w: bw, h: wide ? bh + 4 : bh }; }
  return { W, H, pos };
}
// 每條線兩端的點
function anchors(edges, pos) {
  const side = {}, put = (id, dir, i, other) => (side[id + dir] = side[id + dir] || []).push({ i, ox: pos[other].x });
  edges.forEach((e, i) => { const A = pos[e.from], B = pos[e.to]; if (!A || !B) return; const ta = TIER[e.from], tb = TIER[e.to];
    if (ta === tb) { put(e.from, A.x < B.x ? "R" : "L", i, e.to); put(e.to, A.x < B.x ? "L" : "R", i, e.from); } else if (ta < tb) { put(e.from, "D", i, e.to); put(e.to, "U", i, e.from); } else { put(e.from, "U", i, e.to); put(e.to, "D", i, e.from); } });
  const pt = {};
  for (const [k, arr] of Object.entries(side)) {
    const id = k.slice(0, -1), dir = k.slice(-1), P = pos[id]; arr.sort((m, n) => m.ox - n.ox);
    arr.forEach((m, j) => { const f = (j + 1) / (arr.length + 1); const p = dir === "U" ? { x: P.x - P.w / 2 + P.w * f, y: P.y - P.h / 2 } : dir === "D" ? { x: P.x - P.w / 2 + P.w * f, y: P.y + P.h / 2 } : { x: P.x + (dir === "R" ? P.w / 2 : -P.w / 2), y: P.y - P.h / 2 + P.h * f }; (pt[m.i] = pt[m.i] || {})[id] = p; });
  }
  return pt;
}

const name = id => NODES[id] || id;
// 右邊（手機在下面）的「流向一覽」：每條線壹列「從 → 到　金額」，點開看來源；點方塊就只列那個地方的進出
function listBox(F, sel, pick) {
  const edges = F.edges, nid = sel.n, rows = edges.map((e, i) => ({ e, i })).filter(x => !nid || x.e.from === nid || x.e.to === nid);
  const head = nid ? (() => { const inn = rows.filter(x => x.e.to === nid).reduce((n, x) => n + x.e.amt, 0), out = rows.filter(x => x.e.from === nid).reduce((n, x) => n + x.e.amt, 0), bal = F.bal && F.bal[nid];
    return h("div", { class: "bank-flow-head" }, h("h4", null, name(nid), h("small", null, NOTE[nid] || "")), h("p", { class: "bank-flow-sum" }, bal != null ? h("span", null, "現在 ", h("b", { class: "bank-tab-num" }, fmt(bal))) : null, h("span", null, "今天進 ", h("b", { class: "bank-tab-num up" }, fmt(inn))), h("span", null, "今天出 ", h("b", { class: "bank-tab-num down" }, fmt(out)))), h("button", { type: "button", class: "bank-flow-node", onClick: () => pick({ n: null, e: null }) }, "‹ 看全部")); })()
    : h("div", { class: "bank-flow-head" }, h("h4", null, "流向一覽", h("small", null, "今天 05:00 起，兩個地方之間的淨流向，大的在上")));
  return h("div", { class: "bank-flow-box" }, head, rows.length ? h("ul", { class: "bank-flow-l" }, rows.map(({ e, i }) => { const on = sel.e === i;
    return h("li", { class: on ? "on" : "" }, h("button", { type: "button", class: "bank-flow-row", "aria-expanded": String(on), onClick: () => pick({ n: nid, e: on ? null : i }) },
      h("span", { class: "bank-flow-ft" }, name(e.from), h("i", { "aria-hidden": "true" }, "→"), name(e.to)), h("b", { class: "bank-tab-num" }, fmt(e.amt)), h("em", { "aria-hidden": "true" }, on ? "▾" : "▸")),
      on ? h("ul", { class: "bank-flow-src" }, e.srcs.map(x => h("li", null, h("span", null, x.label, x.amt < 0 ? h("small", null, "（反方向：" + name(e.to) + " → " + name(e.from) + "）") : null), h("b", { class: "bank-tab-num " + (x.amt < 0 ? "down" : "") }, (x.amt < 0 ? "−" : "") + fmt(Math.abs(x.amt)))))) : null); })) : h("p", { class: "bank-hint" }, "今天這個地方沒有進出。"));
}

// v.flow：伺服器的資料（或 null＝今天的帳還沒開始記）；deps：{ panel, reload }（reload＝再跟銀行拿壹次，之後這頁會重畫）
export function flowPane(v, deps) {
  const F = v.flow, panel = deps.panel;
  clearTimeout(timer);
  const tick = () => { if (!document.querySelector(".bank-flow")) return; if (document.hidden) { timer = setTimeout(tick, 45000); return; } deps.reload(); };
  timer = setTimeout(tick, 45000); // 即時：開著就每 45 秒重拿壹次（只在這個頁籤、分頁在前景；沒開這頁就不再排）
  if (!F || !F.edges) return panel("金流", "今天 05:00 起", h("p", { class: "bank-empty" }, "今天的帳還沒開始記，等銀行把今天的第壹份帳結算好（每天 05:00 之後第壹個人進來時）就會有。"));
  if (!F.edges.length) return panel("金流", "今天 05:00 起", h("p", { class: "bank-empty" }, "今天到目前沒有錢在動。"));
  const phone = typeof window !== "undefined" && window.innerWidth < 760, L = layout(phone), edges = F.edges, max = Math.max(...edges.map(e => e.amt), 1), lg = a => Math.log1p(a) / Math.log1p(max), PT = anchors(edges, L.pos);
  if (SEL.e != null && !edges[SEL.e]) SEL.e = null;
  const box = h("div", { class: "bank-flow" }), svg = s("svg", { class: "bank-flow-svg", viewBox: "0 0 " + L.W + " " + L.H, role: "group", "aria-label": "今天的金流：" + edges.slice(0, 6).map(e => name(e.from) + "到" + name(e.to) + " " + short(e.amt)).join("、") });
  const side = h("div", { class: "bank-flow-side" });
  const pick = o => { SEL.e = o.e; SEL.n = o.n; draw(); };
  const move = !still();
  const draw = () => {
    svg.replaceChildren();
    svg.append(s("defs", null, ...["", "-on"].map(sfx => s("marker", { id: "bfa" + sfx, viewBox: "0 0 10 10", refX: 8, refY: 5, markerUnits: "userSpaceOnUse", markerWidth: 12, markerHeight: 12, orient: "auto" }, s("path", { d: "M0 0 L10 5 L0 10 z", fill: sfx ? "#FFF3C4" : "#D6B25E" })))));
    const lines = [], pills = [], chips = []; let dots = 0;
    edges.forEach((e, i) => {
      const pa = PT[i] && PT[i][e.from], pb = PT[i] && PT[i][e.to]; if (!pa || !pb) return;
      const on = SEL.e === i, dim = (SEL.n && e.from !== SEL.n && e.to !== SEL.n) || (SEL.e != null && !on && false), wd = 1.4 + 4.6 * lg(e.amt), d = "M" + pa.x.toFixed(1) + " " + pa.y.toFixed(1) + " L" + pb.x.toFixed(1) + " " + pb.y.toFixed(1);
      lines.push(s("path", { d, class: "bank-flow-line" + (on ? " on" : "") + (dim ? " dim" : ""), "stroke-width": wd.toFixed(1), "marker-end": "url(#bfa" + (on ? "-on" : "") + ")", fill: "none" }));
      lines.push(s("path", { d, class: "bank-flow-hit", "stroke-width": 22, fill: "none", tabindex: 0, role: "button", "aria-label": name(e.from) + "到" + name(e.to) + "，今天 " + fmt(e.amt) + "，看來源", "data-i": i }));
      const n = move && !dim ? Math.min(5, 2 + Math.round(lg(e.amt) * 3)) : 0, len = Math.hypot(pb.x - pa.x, pb.y - pa.y), dur = Math.max(2.4, len / 60);
      for (let k = 0; k < n && dots < 70; k++, dots++) chips.push(s("circle", { r: (2.4 + 1.2 * lg(e.amt)).toFixed(1), class: "bank-flow-dot" }, s("animateMotion", { path: d, dur: dur.toFixed(2) + "s", begin: "-" + ((k / n) * dur).toFixed(2) + "s", repeatCount: "indefinite", calcMode: "linear" })));
      const t = short(e.amt), w = 12 + t.length * 7.4, mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
      pills.push(s("g", { class: "bank-flow-pill" + (on ? " on" : "") + (dim ? " dim" : ""), transform: "translate(" + mx.toFixed(1) + " " + my.toFixed(1) + ")", "data-i": i }, s("rect", { x: -w / 2, y: -10, width: w, height: 20, rx: 10 }), s("text", { "text-anchor": "middle", y: 4.3 }, t)));
    });
    svg.append(...lines, ...chips);
    Object.keys(NODES).forEach(id => {
      const p = L.pos[id], on = SEL.n === id, bal = F.bal && F.bal[id];
      svg.append(s("g", { class: "bank-flow-node-g" + (on ? " on" : "") + (id === "gen" ? " ghost" : ""), transform: "translate(" + p.x.toFixed(1) + " " + p.y.toFixed(1) + ")", tabindex: 0, role: "button", "aria-label": name(id) + "，只看這裡的進出", "data-n": id },
        s("rect", { x: -p.w / 2, y: -p.h / 2, width: p.w, height: p.h, rx: 9 }), s("text", { class: "n", "text-anchor": "middle", y: bal != null ? -3 : 5 }, name(id)), bal != null ? s("text", { class: "b", "text-anchor": "middle", y: 14 }, short(bal)) : null));
    });
    svg.append(...pills); // 金額小牌在最上面（好點）
    const act = (el, f) => { el.addEventListener("click", f); el.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); f(); } }); };
    svg.querySelectorAll(".bank-flow-hit").forEach(el => act(el, () => pick({ n: SEL.n, e: +el.dataset.i })));
    svg.querySelectorAll(".bank-flow-pill").forEach(el => act(el, () => pick({ n: SEL.n, e: +el.dataset.i })));
    svg.querySelectorAll(".bank-flow-node-g").forEach(el => act(el, () => pick({ n: SEL.n === el.dataset.n ? null : el.dataset.n, e: null })));
    side.replaceChildren(listBox(F, SEL, pick));
  };
  draw();
  box.append(h("div", { class: "bank-flow-map" }, svg), side);
  return panel("金流", "今天 05:00 起", box, h("p", { class: "bank-hint" }, "圓片跑的方向＝錢走的方向，線越粗今天流得越多。點金額小牌看來源，點方塊只看那個地方的進出。都是合計，不會列個別的人。"));
}
