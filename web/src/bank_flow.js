// ================================================================
//  銀行「金流」頁籤（11-17 翊文：「做一個動態的 hub 完整顯示整個世界各項金流流動方向的即時動畫」）
//  資料：bankHall.flow（shared/casino_report.js 的 casFlowHub）＝ 今天 05:00 起每兩個地方之間的淨流向：{ edges: [{ from, to, amt, srcs: [{ src, label, amt }] }], bal }
//  畫法：節點排成橢圓、外面世界在中間；每條線壹條帶箭頭的線，線上有金色小圓片沿著方向跑（SVG 的 animateMotion，瀏覽器自己動，不用我們每格算；分頁在背景它會自己停）。
//        粗細＝今天流多少（取對數）、圓片數量跟著多壹點（上限 6 個壹條）。點線上的金額小牌或方塊，下面列出是哪些來源。
//  只給合計和來源標籤，沒有個別館友和 NPC 的名字。介面字用「壹」。
// ================================================================
import { h } from "./ui_core.js";

let NM = {}; // 這次畫的節點 id → { name, note, tier, org, bal, parent }（資料來自伺服器 flow.nodes：名單、單位、來源表變了就自己跟著變）
const fmt = n => Number(Math.round(n)).toLocaleString("en-US");
const short = n => { const a = Math.abs(n); return a >= 1e8 ? (a / 1e8).toFixed(a >= 1e9 ? 0 : 1).replace(/\.0$/, "") + " 億" : a >= 1e4 ? (a / 1e4).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, "") + " 萬" : fmt(a); };
const NS = "http://www.w3.org/2000/svg";
const s = (tag, attrs, ...kids) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) if (v != null) e.setAttribute(k, String(v)); kids.forEach(c => c && e.append(c)); return e; };
const SEL = { e: null, n: null, more: false, open: {} }; // e：選到的線（edges 的第幾條）、n：只看哪個地方 // 選到的：e0、e1…（線）或 n:house（方塊）
let timer = 0;
const still = () => !!(document.body && document.body.classList.contains("reduce-motion")) || (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);

// 展開／收起：SEL.open[id]。外面世界的集團（有子公司的）預設收起；佩佩博物館（org:…）預設展開。
const isOpen = id => (SEL.open[id] != null ? SEL.open[id] : id.startsWith("org:"));
// 把伺服器的資料變成這次要畫的：收起來的集團／org 把底下的點和線併到它身上，展開了就各自畫
function prep(F) {
  const raw = (F.nodes || []).map(n => Object.assign({}, n)), by = {}, orgs = F.orgs || {}, bal = F.bal || {}; raw.forEach(n => (by[n.id] = n));
  const first = {}; // org → 第壹個成員（收起來時，org 方塊放在它的位置）
  for (const o of Object.keys(orgs)) {
    const ms = raw.filter(n => n.org === o); if (!ms.length) continue;
    const id = "org:" + o; by[id] = { id, name: orgs[o], tier: ms[0].tier, isOrg: true, note: "含 " + ms.map(m => m.name).join("、"), bal: ms.reduce((n, m) => n + (+bal[m.id] || 0), 0), kids: ms.map(m => m.id) };
    ms.forEach(m => (m.parentOrg = id)); first[id] = ms[0].id;
  }
  const nodes = [];
  for (const n of raw) { if (!n.parentOrg) { nodes.push(n); continue; } if (isOpen(n.parentOrg)) nodes.push(n); else if (first[n.parentOrg] === n.id) nodes.push(by[n.parentOrg]); }
  const vis = id => { const n = by[id]; if (!n) return id; if (n.parentOrg && !isOpen(n.parentOrg)) return n.parentOrg; const chain = []; for (let p = n.parent; p && p !== "world" && by[p]; p = by[p].parent) chain.unshift(p); for (const a of chain) if (!isOpen(a)) return a; return id; };
  const acc = {};
  for (const e of F.edges) {
    const f = vis(e.from), t = vis(e.to); if (f === t) continue;
    const key = [f, t].sort().join("|"), a = key.split("|")[0], sg = f === a ? 1 : -1, p = acc[key] || (acc[key] = { a, b: key.split("|")[1], srcs: [] });
    for (const x of e.srcs) p.srcs.push({ src: x.src, label: x.label, amt: sg * x.amt });
  }
  const edges = [];
  for (const p of Object.values(acc)) { const net = p.srcs.reduce((n, x) => n + x.amt, 0); if (!net) continue; const fw = net >= 0; edges.push({ from: fw ? p.a : p.b, to: fw ? p.b : p.a, amt: Math.abs(net), srcs: p.srcs.map(x => ({ src: x.src, label: x.label, amt: fw ? x.amt : -x.amt })).sort((x, y) => Math.abs(y.amt) - Math.abs(x.amt)) }); }
  edges.sort((x, y) => y.amt - x.amt);
  return { nodes, edges, bal, orgs, by, hasKids: id => raw.some(n => n.parent === id) || !!(by[id] && by[id].isOrg) };
}
// 版面（分層，全部照資料排）：同壹層的方塊平均分寬度；外面世界那壹條裡面放各集團的小方塊（有子公司的點了展開；太多收成「其他」）；展開的 org 外面框壹個框。
// 線從上面那個方塊的下緣出去、接到下面那個的上緣；同壹邊有好幾條就平均分開。同層接左右邊。
const MORE = "w:more";
function layout(phone, V, need) {
  const nodes = V.nodes, W = phone ? 360 : 720, base = nodes.filter(n => !n.parent), kids = nodes.filter(n => n.parent === "world"), bh = phone ? 46 : 54, gap = phone ? 52 : 62;
  const frameOrgs = [...new Set(base.filter(n => n.org && !n.isOrg).map(n => n.org))], hasOrg = frameOrgs.length > 0, tiers = [...new Set(base.map(n => n.tier))].sort((a, b) => a - b), pos = {}, tierOf = {}, frames = [];
  const K = SEL.more ? 99 : phone ? 6 : 8, show = kids.filter(k => need.has(k.id)); for (const k of kids) if (show.length < K && !show.includes(k)) show.push(k);
  const rest = kids.filter(k => !show.includes(k)), chips = [];
  const walk = (n, depth) => { chips.push(Object.assign({}, n, { depth })); if (isOpen(n.id)) nodes.filter(c => c.parent === n.id).forEach(c => walk(c, depth + 1)); };
  show.forEach(k => walk(k, 0));
  if (rest.length) { const m = { id: MORE, name: "其他 " + rest.length, more: true, tier: 1, parent: "world", bal: rest.reduce((n, x) => n + (x.bal || 0), 0), depth: 0 }; chips.push(m); NM[MORE] = m; }
  const cols = phone ? 3 : 5, cw = (W - 16 - 8 * (cols + 1)) / cols, ch = 34, rows = Math.ceil(chips.length / cols);
  let y = 0;
  for (const t of tiers) {
    const ns = base.filter(n => n.tier === t), isBand = ns.some(n => n.id === "world"), hh = isBand ? (chips.length ? 30 + rows * (ch + 6) + 4 : bh + 4) : bh;
    if (y) y += gap + (hasOrg && ns.some(n => n.org && !n.isOrg) && !base.some(n => n.org && !n.isOrg && n.tier === t - 1) ? 14 : 0); else y = 8;
    const cy = y + hh / 2; y += hh;
    ns.forEach((n, i) => { const w = isBand ? W - 16 : Math.min(phone ? 100 : 170, (W - 16) / ns.length - 10); pos[n.id] = { x: W * (i + 0.5) / ns.length, y: cy, w, h: hh }; tierOf[n.id] = t; });
    if (isBand) { const top = cy - hh / 2; chips.forEach((c, i) => { const r = Math.floor(i / cols), k = i % cols; pos[c.id] = { x: 16 + cw / 2 + k * (cw + 8), y: top + 30 + r * (ch + 6) + ch / 2, w: cw, h: ch, chip: true }; tierOf[c.id] = t; }); }
  }
  const H = y + 8;
  for (const o of frameOrgs) { const ps = base.filter(n => n.org === o && !n.isOrg).map(n => pos[n.id]), x0 = Math.min(...ps.map(p => p.x - p.w / 2)) - 8, x1 = Math.max(...ps.map(p => p.x + p.w / 2)) + 8, y0 = Math.min(...ps.map(p => p.y - p.h / 2)) - 22, y1 = Math.max(...ps.map(p => p.y + p.h / 2)) + 8; frames.push({ id: o, x: x0, y: y0, w: x1 - x0, h: y1 - y0 }); }
  return { W, H, pos, tierOf, frames, chips, nodes };
}
// 每條線兩端的點
function anchors(edges, pos, tierOf) {
  const side = {}, put = (id, dir, i, other) => (side[id + "|" + dir] = side[id + "|" + dir] || []).push({ i, ox: pos[other].x });
  edges.forEach((e, i) => { const A = pos[e.from], B = pos[e.to]; if (!A || !B) return; const ta = tierOf[e.from], tb = tierOf[e.to];
    if (ta === tb) { put(e.from, A.x < B.x ? "R" : "L", i, e.to); put(e.to, A.x < B.x ? "L" : "R", i, e.from); } else if (ta < tb) { put(e.from, "D", i, e.to); put(e.to, "U", i, e.from); } else { put(e.from, "U", i, e.to); put(e.to, "D", i, e.from); } });
  const pt = {};
  for (const [k, arr] of Object.entries(side)) {
    const [id, dir] = k.split("|"), P = pos[id]; arr.sort((m, n) => m.ox - n.ox);
    arr.forEach((m, j) => { const f = (j + 1) / (arr.length + 1); const p = dir === "U" ? { x: P.x - P.w / 2 + P.w * f, y: P.y - P.h / 2 } : dir === "D" ? { x: P.x - P.w / 2 + P.w * f, y: P.y + P.h / 2 } : { x: P.x + (dir === "R" ? P.w / 2 : -P.w / 2), y: P.y - P.h / 2 + P.h * f }; (pt[m.i] = pt[m.i] || {})[id] = p; });
  }
  return pt;
}

const name = id => (NM[id] && NM[id].name) || id, balOf = (F, id) => (F.bal && F.bal[id] != null ? F.bal[id] : NM[id] && NM[id].bal != null ? NM[id].bal : null);
// 右邊（手機在下面）的「流向一覽」：每條線壹列「從 → 到　金額」，點開看來源；點方塊就只列那個地方的進出
function listBox(F, sel, pick) {
  const edges = F.edges, nid = sel.n, rows = edges.map((e, i) => ({ e, i })).filter(x => !nid || x.e.from === nid || x.e.to === nid);
  const head = nid ? (() => { const inn = rows.filter(x => x.e.to === nid).reduce((n, x) => n + x.e.amt, 0), out = rows.filter(x => x.e.from === nid).reduce((n, x) => n + x.e.amt, 0), bal = balOf(F, nid);
    return h("div", { class: "bank-flow-head" }, h("h4", null, name(nid), h("small", null, (NM[nid] && NM[nid].note) || "")), h("p", { class: "bank-flow-sum" }, bal != null ? h("span", null, "現在 ", h("b", { class: "bank-tab-num" }, fmt(bal))) : null, h("span", null, "今天進 ", h("b", { class: "bank-tab-num up" }, fmt(inn))), h("span", null, "今天出 ", h("b", { class: "bank-tab-num down" }, fmt(out)))), h("button", { type: "button", class: "bank-flow-node", onClick: () => pick({ n: null, e: null }) }, "‹ 看全部")); })()
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
  const phone = typeof window !== "undefined" && window.innerWidth < 760, move = !still();
  const box = h("div", { class: "bank-flow" }), mapBox = h("div", { class: "bank-flow-map" }), side = h("div", { class: "bank-flow-side" });
  const pick = o => { SEL.e = o.e; SEL.n = o.n; draw(); };
  const draw = () => {
    const V = prep(F); NM = Object.assign({}, V.by); V.nodes.forEach(n => (NM[n.id] = n));
    const L = layout(phone, V, new Set(V.edges.flatMap(e => [e.from, e.to]).filter(id => id.startsWith("w:")))), edges = V.edges, PT = anchors(edges, L.pos, L.tierOf), max = Math.max(...edges.map(e => e.amt), 1), lg = a => Math.log1p(a) / Math.log1p(max);
    if (SEL.e != null && !edges[SEL.e]) SEL.e = null; if (SEL.n && !L.pos[SEL.n]) SEL.n = null;
    const svg = s("svg", { class: "bank-flow-svg", viewBox: "0 0 " + L.W + " " + L.H, role: "group", "aria-label": "今天的金流：" + edges.slice(0, 6).map(e => name(e.from) + "到" + name(e.to) + " " + short(e.amt)).join("、") });
    svg.append(s("defs", null, ...["", "-on"].map(sfx => s("marker", { id: "bfa" + sfx, viewBox: "0 0 10 10", refX: 8, refY: 5, markerUnits: "userSpaceOnUse", markerWidth: 12, markerHeight: 12, orient: "auto" }, s("path", { d: "M0 0 L10 5 L0 10 z", fill: sfx ? "#FFF3C4" : "#D6B25E" })))));
    const lines = [], pills = [], dotsEl = []; let dots = 0;
    edges.forEach((e, i) => {
      const pa = PT[i] && PT[i][e.from], pb = PT[i] && PT[i][e.to]; if (!pa || !pb) return;
      const on = SEL.e === i, dim = SEL.n && e.from !== SEL.n && e.to !== SEL.n, wd = 1.4 + 4.6 * lg(e.amt), d = "M" + pa.x.toFixed(1) + " " + pa.y.toFixed(1) + " L" + pb.x.toFixed(1) + " " + pb.y.toFixed(1);
      lines.push(s("path", { d, class: "bank-flow-line" + (on ? " on" : "") + (dim ? " dim" : ""), "stroke-width": wd.toFixed(1), "marker-end": "url(#bfa" + (on ? "-on" : "") + ")", fill: "none" }));
      lines.push(s("path", { d, class: "bank-flow-hit", "stroke-width": 22, fill: "none", tabindex: 0, role: "button", "aria-label": name(e.from) + "到" + name(e.to) + "，今天 " + fmt(e.amt) + "，看來源", "data-i": i }));
      const n = move && !dim ? Math.min(5, 2 + Math.round(lg(e.amt) * 3)) : 0, len = Math.hypot(pb.x - pa.x, pb.y - pa.y), dur = Math.max(2.4, len / 60);
      for (let k = 0; k < n && dots < 70; k++, dots++) dotsEl.push(s("circle", { r: (2.4 + 1.2 * lg(e.amt)).toFixed(1), class: "bank-flow-dot" }, s("animateMotion", { path: d, dur: dur.toFixed(2) + "s", begin: "-" + ((k / n) * dur).toFixed(2) + "s", repeatCount: "indefinite", calcMode: "linear" })));
      const t = short(e.amt), w = 12 + t.length * 7.4, rects = Object.values(L.pos).filter(r => !r.chip), hit = (x, y) => rects.some(r => Math.abs(x - r.x) < r.w / 2 + w / 2 && Math.abs(y - r.y) < r.h / 2 + 12);
      let mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2; for (const k of [0.5, 0.42, 0.58, 0.35, 0.65, 0.3, 0.7]) { const x = pa.x + (pb.x - pa.x) * k, y = pa.y + (pb.y - pa.y) * k; if (!hit(x, y)) { mx = x; my = y; break; } } // 金額小牌不蓋到方塊：沿線找壹個空的位置
      pills.push(s("g", { class: "bank-flow-pill" + (on ? " on" : "") + (dim ? " dim" : ""), transform: "translate(" + mx.toFixed(1) + " " + my.toFixed(1) + ")", "data-i": i }, s("rect", { x: -w / 2, y: -10, width: w, height: 20, rx: 10 }), s("text", { "text-anchor": "middle", y: 4.3 }, t)));
    });
    L.frames.forEach(f => svg.append(s("g", { class: "bank-flow-frame", "data-org": "org:" + f.id, tabindex: 0, role: "button", "aria-label": (V.orgs[f.id] || f.id) + "，收起來" }, s("rect", { x: f.x, y: f.y, width: f.w, height: f.h, rx: 12 }), s("text", { x: f.x + 12, y: f.y + 15 }, "▾ " + (V.orgs[f.id] || f.id)))));
    svg.append(...lines, ...dotsEl);
    const draw1 = n => { // 方塊（大的）和外面世界裡的小方塊（chip）
      const id = n.id, p = L.pos[id]; if (!p) return;
      const kidsOf = V.hasKids(id) && !n.more, op = kidsOf && isOpen(id), on = SEL.n === id, bal = n.more ? n.bal : (V.bal[id] != null ? V.bal[id] : n.bal), small = !!p.chip, band = id === "world" && L.chips.length > 0, label = name(id) + (kidsOf ? (op ? " ▾" : " ▸") : "");
      svg.append(s("g", { class: "bank-flow-node-g" + (on ? " on" : "") + (id === "gen" ? " ghost" : "") + (small ? " chip" : "") + (n.more ? " more" : "") + (n.depth ? " sub" : "") + (kidsOf ? " kids" : ""), transform: "translate(" + p.x.toFixed(1) + " " + p.y.toFixed(1) + ")", tabindex: 0, role: "button", "aria-label": n.more ? "展開其他集團" : kidsOf ? name(id) + (op ? "，收起子公司" : "，展開子公司") : name(id) + "，只看這裡的進出", "data-n": id, "data-k": kidsOf ? "1" : null },
        s("rect", { x: -p.w / 2, y: -p.h / 2, width: p.w, height: p.h, rx: small ? 7 : 9 }), ...(band ? [s("text", { class: "n", "text-anchor": "middle", y: -p.h / 2 + 20 }, name(id) + (bal != null ? "　" + short(bal) : ""))] : [s("text", { class: "n", "text-anchor": "middle", y: bal != null && !n.more ? -2 : 5 }, label), bal != null && !n.more ? s("text", { class: "b", "text-anchor": "middle", y: small ? 12 : 14 }, short(bal)) : null])));
    };
    L.nodes.filter(n => !n.parent).forEach(draw1); L.chips.forEach(draw1);
    svg.append(...pills); // 金額小牌在最上面（好點）
    const act = (el, f) => { el.addEventListener("click", f); el.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); f(); } }); };
    svg.querySelectorAll(".bank-flow-hit").forEach(el => act(el, () => pick({ n: SEL.n, e: +el.dataset.i })));
    svg.querySelectorAll(".bank-flow-pill").forEach(el => act(el, () => pick({ n: SEL.n, e: +el.dataset.i })));
    svg.querySelectorAll(".bank-flow-frame").forEach(el => act(el, () => { SEL.open[el.dataset.org] = false; SEL.n = null; SEL.e = null; draw(); }));
    svg.querySelectorAll(".bank-flow-node-g").forEach(el => act(el, () => { const id = el.dataset.n; if (id === MORE) { SEL.more = true; draw(); return; } if (el.dataset.k) { SEL.open[id] = !isOpen(id); SEL.n = null; SEL.e = null; draw(); return; } pick({ n: SEL.n === id ? null : id, e: null }); }));
    mapBox.replaceChildren(svg);
    side.replaceChildren(listBox({ edges, bal: V.bal }, SEL, pick));
  };
  draw();
  box.append(mapBox, side);
  return panel("金流", "今天 05:00 起", box, h("p", { class: "bank-hint" }, "圓片跑的方向＝錢走的方向，線越粗今天流得越多。點金額小牌看來源；點方塊只看那個地方的進出；有 ▸ 的是集團或佩佩博物館，點了展開子公司，再點收起。都是合計，不會列個別的人。"));
}
