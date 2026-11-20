// ================================================================
//  銀行「金流」頁籤（11-17 翊文：「做一個動態的 hub 完整顯示整個世界各項金流流動方向的即時動畫」）
//  資料：bankHall.flow（shared/casino/report.js 的 casFlowHub）＝ 今天 05:00 起每兩個地方之間的淨流向：{ edges: [{ from, to, amt, srcs: [{ src, label, amt }] }], bal }
//  畫法：節點排成橢圓、已知世界在中間；每條線壹條帶箭頭的線，線上有金色小圓片沿著方向跑（SVG 的 animateMotion，瀏覽器自己動，不用我們每格算；分頁在背景它會自己停）。
//        粗細＝今天流多少（取對數）、圓片數量跟著多壹點（上限 6 個壹條）。點線上的金額小牌或方塊，下面列出是哪些來源。
//  只給合計和來源標籤，沒有個別館友和 NPC 的名字。介面字用「壹」。
// ================================================================
import { h } from "../../core/ui_core.js";

let NM = {}; // 這次畫的節點 id → { name, note, tier, org, bal, parent }（資料來自伺服器 flow.nodes：名單、單位、來源表變了就自己跟著變）
const fmt = n => Number(Math.round(n)).toLocaleString("en-US");
const short = n => { const a = Math.abs(n); return a >= 1e8 ? (a / 1e8).toFixed(a >= 1e9 ? 0 : 1).replace(/\.0$/, "") + " 億" : a >= 1e4 ? (a / 1e4).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, "") + " 萬" : fmt(a); };
const FRACS = Array.from({ length: 31 }, (_, i) => 0.5 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.03).filter(k => k > 0.04 && k < 0.96); // 金額牌沿線的候選位置：從中間往兩邊每 3% 一個
const sshort = n => (n < 0 ? "−" : "") + short(n); // 帶負號的短寫（海外帳可以是負的）
const NS = "http://www.w3.org/2000/svg";
const s = (tag, attrs, ...kids) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) if (v != null) e.setAttribute(k, String(v)); kids.forEach(c => c && e.append(c)); return e; };
const SEL = { e: null, n: null, kind: null, kindMore: false, path: [], dir: "" }; // path：現在放大到哪一層（[]＝全景、["world"]＝已知世界、["world", 集團id]＝單一集團、["org:…"]＝館裡）；dir：剛剛是放大還是縮小（過場用） // e：選到的線（edges 的第幾條）、n：只看哪個地方 // 選到的：e0、e1…（線）或 n:house（方塊）
let timer = 0;
const still = () => !!(document.body && document.body.classList.contains("reduce-motion")) || (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);

const KIND_SHOW = 6; // 往來種類按鈕預設只列最大的幾種，其他收進「更多」
// 往來種類（篩選用）：集團之間的往來照 src 的種類（tradeGoods…）；發薪水（wageNpc、wageBack）合成「薪水」；NPC 和散客花錢（沒有 | 的來源）合成「館內消費」
const catOf = x => { const k = String(x.src).split("|")[0]; return /^wage/.test(k) ? { k: "wage", label: "薪水（集團↔NPC 錢包、家計）" } : String(x.src).includes("|") ? { k, label: x.label || k } : { k: "spend", label: "館內消費（NPC、散客）" }; };
// 層級（11-17 翊文：「需要可以做縮放各層級的交易」）：全景（已知世界、佩佩博物館各是壹塊）→ 已知世界（各集團一塊，集團之間的往來看得到）→ 單一集團（它的子公司和它所有的進出）；另壹邊：全景 → 佩佩博物館（館裡的各帳）
const wOpen = () => SEL.path[0] === "world", focusId = () => (SEL.path[0] === "world" ? SEL.path[1] || null : null);
const isOpen = id => (id.startsWith("org:") ? SEL.path[0] === id : id === focusId());
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
  const vis = id => { if (id.startsWith("w:") && !wOpen()) return "world"; const n = by[id]; if (!n) return id; if (n.parentOrg && !isOpen(n.parentOrg)) return n.parentOrg; const chain = []; for (let p = n.parent; p && p !== "world" && by[p]; p = by[p].parent) chain.unshift(p); for (const a of chain) if (!isOpen(a)) return a; return id; };
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
// 版面（分層，全部照資料排）：同壹層的方塊平均分寬度；已知世界那壹條裡面放各集團的小方塊（有子公司的點了展開；太多收成「其他」）；展開的 org 外面框壹個框。
// 線從上面那個方塊的下緣出去、接到下面那個的上緣；同壹邊有好幾條就平均分開。同層接左右邊。
function layout(phone, V) {
  if (focusId()) return layoutFocus(phone, V, focusId());
  const nodes = V.nodes, W = phone ? 360 : 720, base = nodes.filter(n => !n.parent), kids = nodes.filter(n => n.parent === "world"), bh = phone ? 46 : 54, gap = phone ? 52 : 62;
  const frameOrgs = [...new Set(base.filter(n => n.org && !n.isOrg).map(n => n.org))], hasOrg = frameOrgs.length > 0, tiers = [...new Set(base.map(n => n.tier))].sort((a, b) => a - b), pos = {}, tierOf = {}, frames = [];
  const wo = wOpen(), chips = wo ? kids.map(k => Object.assign({}, k, { depth: 0 })) : []; // 放大到已知世界才畫各集團（全部都畫，集團之間的線才看得到）
  const cols = phone ? 2 : 3, gx = phone ? 52 : 70, gy = 56, cw = (W - 16 - gx * (cols + 1)) / cols, ch = 34, rows = Math.ceil(chips.length / cols);
  let y = 0;
  for (const t of tiers) {
    const all = base.filter(n => n.tier === t).map((n, i) => [n, i]).sort((p, q) => ((p[0].org && !p[0].isOrg ? 1 : 0) - (q[0].org && !q[0].isOrg ? 1 : 0)) || p[1] - q[1]).map(p => p[0]), split = chips.length > 0 && all.some(n => n.id === "world") && all.length > 1; // 已知世界展開成各集團時很寬，同一層的海外（ext）改放在它正下面壹排
    const ns = split ? all.filter(n => n.id === "world") : all, side = split ? all.filter(n => n.id !== "world") : [], isBand = ns.some(n => n.id === "world"), hh = isBand ? (chips.length ? 60 + rows * (ch + gy) - gy + 14 : bh + 4) : bh;
    if (y) y += gap + (hasOrg && ns.some(n => n.org && !n.isOrg) && !base.some(n => n.org && !n.isOrg && n.tier === t - 1) ? 14 : 0); else y = 8;
    const cy = y + hh / 2; y += hh;
    ns.forEach((n, i) => { const w = isBand && chips.length ? W - 16 : Math.min(phone ? 100 : 170, (W - 16) / ns.length - 10); pos[n.id] = { x: W * (i + 0.5) / ns.length, y: cy, w, h: hh }; tierOf[n.id] = t; });
    if (side.length) { y += gap * 0.6; const cy2 = y + bh / 2; y += bh; side.forEach((n, i) => { pos[n.id] = { x: W * (i + 0.5) / side.length, y: cy2, w: Math.min(phone ? 150 : 220, (W - 16) / side.length - 10), h: bh }; tierOf[n.id] = t + 0.5; }); } // t＋0.5：跟上面那條帶子之間的線走上下邊
    if (isBand) { const top = cy - hh / 2; chips.forEach((c, i) => { const r = Math.floor(i / cols), k = i % cols; pos[c.id] = { x: 8 + gx + cw / 2 + k * (cw + gx), y: top + 60 + r * (ch + gy) + ch / 2, w: cw, h: ch, chip: true }; tierOf[c.id] = t; }); }
  }
  const H = y + 8;
  for (const o of frameOrgs) { const ps = base.filter(n => n.org === o && !n.isOrg).map(n => pos[n.id]), x0 = Math.min(...ps.map(p => p.x - p.w / 2)) - 8, x1 = Math.max(...ps.map(p => p.x + p.w / 2)) + 8, y0 = Math.min(...ps.map(p => p.y - p.h / 2)) - 22, y1 = Math.max(...ps.map(p => p.y + p.h / 2)) + 8; frames.push({ id: o, x: x0, y: y0, w: x1 - x0, h: y1 - y0 }); }
  return { W, H, pos, tierOf, frames, chips, nodes };
}
// 單一集團那一層：上面放「錢從哪裡來」的對象、中間是這個集團（有子公司就框起來，子公司各一塊）、下面放「錢往哪裡去」的對象
function layoutFocus(phone, V, fid) {
  const W = phone ? 360 : 720, bh = phone ? 46 : 54, gap = phone ? 56 : 68, kids = V.nodes.filter(n => n.parent === fid), S = new Set([fid, ...kids.map(k => k.id)]);
  const up = [], down = [];
  for (const e of V.edges) { const inS = S.has(e.to), o = inS ? e.from : e.to; if (S.has(o) || up.includes(o) || down.includes(o)) continue; (inS ? up : down).push(o); }
  const pos = {}, tierOf = {}, frames = [], nodes = []; let y = 8;
  const row = (ids, t) => { const cy = y + bh / 2; ids.forEach((id, i) => { pos[id] = { x: W * (i + 0.5) / ids.length, y: cy, w: Math.min(phone ? 100 : 170, (W - 16) / ids.length - 10), h: bh }; tierOf[id] = t; nodes.push(V.by[id] || { id, name: id }); }); y += bh; };
  if (up.length) { row(up, 0); y += gap; }
  if (kids.length) {
    const fh = 26 + bh + 12, top = y; pos[fid] = { x: W / 2, y: top + fh / 2, w: W - 16, h: fh, holder: true }; tierOf[fid] = 1;
    kids.forEach((k, i) => { pos[k.id] = { x: W * (i + 0.5) / kids.length, y: top + 26 + bh / 2, w: Math.min(phone ? 100 : 150, (W - 40) / kids.length - 10), h: bh }; tierOf[k.id] = 1; nodes.push(k); });
    frames.push({ id: fid, title: (V.by[fid] && V.by[fid].name) || fid, x: 8, y: top, w: W - 16, h: fh }); y += fh;
  } else row([fid], 1);
  if (down.length) { y += gap; row(down, 2); }
  return { W, H: y + 8, pos, tierOf, frames, chips: [], nodes, focus: fid };
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

// 已知世界那層，集團方塊排成格子：兩端都是格子裡的方塊時，線只走「方塊中間的空隙」（欄和欄之間、列和列之間），從來源方塊的邊出發、停在目標方塊的邊上，不穿過、不貼著別的方塊。
// 同壹列相鄰＝直線；同壹欄相鄰＝直線；隔壁欄＝壹個 Z（兩次轉折）；其他＝沿列縫、欄縫走（最多三次轉折）。同壹條縫上的線錯開幾個像素。
function routeGrid(e, pos, i) {
  const A = pos[e.from], B = pos[e.to]; if (!A || !B || !A.chip || !B.chip) return null;
  const chips = Object.values(pos).filter(r => r.chip), uniq = k => [...new Set(chips.map(r => Math.round(r[k])))].sort((p, q) => p - q), xs = uniq("x"), ys = uniq("y");
  const ca = xs.indexOf(Math.round(A.x)), cb = xs.indexOf(Math.round(B.x)), ra = ys.indexOf(Math.round(A.y)), rb = ys.indexOf(Math.round(B.y)); if (ca < 0 || cb < 0 || ra < 0 || rb < 0) return null;
  const sp = ((i * 7) % 5 - 2) * 8, mid = (a, b) => (a + b) / 2, gx = c => (c < 0 ? xs[0] - A.w / 2 - 10 : c >= xs.length - 1 ? xs[xs.length - 1] + A.w / 2 + 10 : mid(xs[c] + A.w / 2, xs[c + 1] - A.w / 2)), gy = r => (r < 0 ? ys[0] - A.h / 2 - 12 : r >= ys.length - 1 ? ys[ys.length - 1] + A.h / 2 + 12 : mid(ys[r] + A.h / 2, ys[r + 1] - A.h / 2));
  const dx = Math.sign(cb - ca), dy = Math.sign(rb - ra), P = (x, y) => ({ x, y });
  const side = (R, d, off) => P(R.x + d * R.w / 2, R.y + off), vert = (R, d, off) => P(R.x + off, R.y + d * R.h / 2);
  if (ra === rb && Math.abs(cb - ca) === 1) return [side(A, dx, sp), side(B, -dx, sp)];
  if (ca === cb && Math.abs(rb - ra) === 1) return [vert(A, dy, sp), vert(B, -dy, sp)];
  if (ra === rb) { const y = gy(ra) + sp; return [vert(A, 1, sp * 2), P(A.x + sp * 2, y), P(B.x + sp * 2, y), vert(B, 1, sp * 2)]; } // 同列不相鄰：從下面的列縫繞過去
  if (ca === cb) { const x = gx(ca) + sp; return [side(A, 1, sp), P(x, A.y + sp), P(x, B.y + sp), side(B, 1, sp)]; } // 同欄不相鄰：從右邊的欄縫繞過去
  if (Math.abs(cb - ca) === 1) { const x = gx(Math.min(ca, cb)) + sp; return [side(A, dx, sp), P(x, A.y + sp), P(x, B.y + sp), side(B, -dx, sp)]; }
  const y = gy(dy > 0 ? ra : ra - 1) + sp, x = gx(dx > 0 ? cb - 1 : cb) + sp; // 其他：A 往 B 的方向出到列縫，沿列縫走到 B 旁邊的欄縫，再沿欄縫走到 B 的高度，從側邊進去
  return [vert(A, dy, sp), P(A.x + sp, y), P(x, y), P(x, B.y + sp), side(B, -dx, sp)];
}
// 不同層的方塊之間：全部走直角線。從上面方塊的下緣垂直出去 → 進層和層之間的橫縫 → 橫走到目標的 x → 垂直進下面方塊的上緣；中間隔了別層，垂直那段會碰到方塊時，改在空的 x 位置下去（再多兩個轉折）。
function routeOrtho(pa, pb, e, pos, W, i) {
  const A0 = pos[e.from], B0 = pos[e.to]; if (!A0 || !B0 || (A0.chip && B0.chip)) return null;
  if (A0.chip || B0.chip) { // 壹端在集團格子裡、另壹端在格子外：先從格子旁邊的欄縫走到已知世界那條帶子的下面，再走直角線
    const ch = A0.chip ? A0 : B0, out = A0.chip ? B0 : A0, band = pos.world; if (!band || out.holder) return null;
    const bandBottom = band.y + band.h / 2, down = out.y > bandBottom, toward = out.x >= ch.x ? 1 : -1, sg = toward, gxx = ch.x + sg * (ch.w / 2 + 35) + ((i * 7) % 5 - 2) * 5, off = ((i * 7) % 5 - 2) * 5;
    const ly = down ? bandBottom + 16 + off : band.y - band.h / 2 - 16 + off, ox = (A0.chip ? pb : pa).x, oy = out.y + (down ? -out.h / 2 : out.h / 2);
    const mid = [{ x: ch.x + sg * ch.w / 2, y: ch.y + off }, { x: gxx, y: ch.y + off }, { x: gxx, y: ly }, { x: ox, y: ly }, { x: ox, y: oy }];
    return A0.chip ? mid : mid.slice().reverse();
  }
  const A = A0, B = B0; if (A.holder || B.holder) return null;
  const dir = B.y > A.y ? 1 : -1, ay = A.y + dir * A.h / 2, by = B.y - dir * B.h / 2;
  if (Math.abs(pa.y - ay) > 1 || Math.abs(pb.y - by) > 1 || Math.abs(B.y - A.y) < 20) return null; // 不是上下接的（同壹層左右接）交給原本的
  const off = ((i * 7) % 5 - 2) * 5, obs = Object.entries(pos).filter(([id, r]) => !r.chip && !r.holder && id !== e.from && id !== e.to).map(([, r]) => r);
  const lo = Math.min(ay, by), hi = Math.max(ay, by), between = obs.filter(r => r.y + r.h / 2 > lo && r.y - r.h / 2 < hi);
  const hitX = (x, y0, y1) => between.some(r => x > r.x - r.w / 2 - 6 && x < r.x + r.w / 2 + 6 && r.y + r.h / 2 > Math.min(y0, y1) && r.y - r.h / 2 < Math.max(y0, y1));
  const ly = ay + dir * (16 + off), ly2 = by - dir * (16 - off);
  if (!between.length || !hitX(pb.x, ly, by)) return [pa, { x: pa.x, y: (between.length ? ly : (ay + by) / 2 + off) }, { x: pb.x, y: (between.length ? ly : (ay + by) / 2 + off) }, pb];
  let xf = null; for (let k = 0; k < 80 && xf == null; k++) for (const sg of [1, -1]) { const x = pb.x + sg * k * 8; if (x > 8 && x < W - 8 && !hitX(x, ly, ly2)) { xf = x; break; } }
  if (xf == null) return null;
  return [pa, { x: pa.x, y: ly }, { x: xf, y: ly }, { x: xf, y: ly2 }, { x: pb.x, y: ly2 }, pb];
}
// 線不穿過別的方塊：直線會碰到中間的方塊（不是兩端、不是已知世界裡的小方塊要繞開的那條帶子）就繞到它的左邊或右邊（同壹排就繞到上面）
function route(pa, pb, e, pos, W) {
  const chips2 = !!(pos[e.from] && pos[e.from].chip && pos[e.to] && pos[e.to].chip), m = chips2 ? 20 : 10, chipEnd = e.from.startsWith("w:") || e.to.startsWith("w:");
  const obs = Object.entries(pos).filter(([id, r]) => !r.holder && (chips2 || !r.chip) && id !== e.from && id !== e.to && !(chipEnd && id === "world")).map(([, r]) => r);
  const hits = r => { for (let k = 0; k <= 40; k++) { const t = k / 40, x = pa.x + (pb.x - pa.x) * t, y = pa.y + (pb.y - pa.y) * t; if (Math.abs(x - r.x) < r.w / 2 + 2 && Math.abs(y - r.y) < r.h / 2 + 2) return true; } return false; };
  const bad = obs.filter(hits).sort((p, q) => (pb.y >= pa.y ? p.y - q.y : q.y - p.y)); if (!bad.length) return [pa, pb];
  const pts = [pa], flat = Math.abs(pa.y - pb.y) < 2;
  for (const r of (flat ? bad.sort((p, q) => (pb.x >= pa.x ? p.x - q.x : q.x - p.x)) : bad)) {
    if (flat) { const y = r.y - r.h / 2 - m, a = r.x - r.w / 2 - m, b = r.x + r.w / 2 + m, fw = pb.x >= pa.x; pts.push({ x: fw ? a : b, y: pa.y }, { x: fw ? a : b, y }, { x: fw ? b : a, y }, { x: fw ? b : a, y: pa.y }); continue; }
    const L = r.x - r.w / 2 - m, R = r.x + r.w / 2 + m, last = pts[pts.length - 1], sx = Math.abs(last.x - L) + Math.abs(pb.x - L) <= Math.abs(last.x - R) + Math.abs(pb.x - R) ? L : R, down = pb.y >= pa.y, y0 = down ? r.y - r.h / 2 - m : r.y + r.h / 2 + m, y1 = down ? r.y + r.h / 2 + m : r.y - r.h / 2 - m, cx = Math.max(8, Math.min(W - 8, sx));
    pts.push({ x: cx, y: y0 }, { x: cx, y: y1 });
  }
  pts.push(pb); return pts;
}
const polyD = pts => pts.map((p, i) => (i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1)).join(" ");
const polyLen = pts => pts.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);
const polyAt = (pts, f) => { let want = polyLen(pts) * f; for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); if (want <= l || i === pts.length - 1) { const t = l ? Math.min(1, want / l) : 0; return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t }; } want -= l; } return pts[0]; };
// 這個方塊可以點進去放大嗎：已知世界（還沒放大時）、佩佩博物館（還沒進去時）、有子公司的集團（不是正在看的那個）
const zoomable = (V, id) => (id === "world" ? !wOpen() : id.startsWith("org:") ? SEL.path[0] !== id : id.startsWith("w:") && V.hasKids(id) && id !== focusId());
const ftitle = (V, f) => f.title || (V.orgs && V.orgs[f.id]) || f.id;
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
  const zgo = id => { SEL.dir = "in"; SEL.path = id === "world" ? ["world"] : id.startsWith("org:") ? [id] : ["world", id]; SEL.n = null; SEL.e = null; draw(); }; // 放大到這個方塊
  const zout = () => { if (!SEL.path.length) return; SEL.dir = "out"; SEL.path = SEL.path.length > 1 ? SEL.path.slice(0, -1) : []; SEL.n = null; SEL.e = null; draw(); }; // 回上一層
  let zcool = 0; // 電腦按住 Ctrl（或 ⌘）滾輪、手機兩指捲動：放大或縮小（頁面本身的捲動照舊）
  mapBox.addEventListener("wheel", ev => { if (!(ev.ctrlKey || ev.metaKey)) return; ev.preventDefault(); if (Date.now() < zcool) return; zcool = Date.now() + 450; if (ev.deltaY < 0) { if (!SEL.path.length) zgo("world"); } else zout(); }, { passive: false });
  const ptr = new Map(), pd = () => { const a = [...ptr.values()]; return a.length === 2 ? Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]) : 0; }; let d0 = 0;
  mapBox.addEventListener("pointerdown", ev => { if (ev.pointerType !== "touch") return; ptr.set(ev.pointerId, [ev.clientX, ev.clientY]); d0 = pd(); });
  mapBox.addEventListener("pointermove", ev => { if (!ptr.has(ev.pointerId)) return; ptr.set(ev.pointerId, [ev.clientX, ev.clientY]); const d = pd(); if (!d || !d0 || Date.now() < zcool) return; if (d / d0 > 1.35) { zcool = Date.now() + 600; d0 = d; if (!SEL.path.length) zgo("world"); } else if (d / d0 < 0.74) { zcool = Date.now() + 600; d0 = d; zout(); } });
  const pup = ev => { ptr.delete(ev.pointerId); d0 = 0; }; mapBox.addEventListener("pointerup", pup); mapBox.addEventListener("pointercancel", pup);
  const draw = () => {
    if (SEL.path[1] && !(F.nodes || []).some(n => n.id === SEL.path[1])) SEL.path = SEL.path.slice(0, 1); // 資料變了（集團改名、拆掉）就退一層
    if (SEL.path[0] && SEL.path[0] !== "world" && !(F.orgs || {})[SEL.path[0].slice(4)]) SEL.path = [];
    const V = prep(F); NM = Object.assign({}, V.by); V.nodes.forEach(n => (NM[n.id] = n));
    // 往來變多（決定 0127，約 24 條集團之間的線）：已知世界那層預設只畫最大的 8 條集團之間的線；選壹個種類只畫那壹種；點壹個集團方塊只畫跟它有關的。沒畫出來的都還在右邊流向一覽裡。
    let hidden = 0, kinds = [];
    if (wOpen() && !focusId()) {
      const kindOf = e => (e.srcs[0] && e.srcs[0].src ? String(e.srcs[0].src).split("|")[0] : ""), isCC = e => e.from.startsWith("w:") || e.to.startsWith("w:"); // 碰到已知世界裡任何壹個單位的線都歸這裡（集團之間、發薪水、NPC 和散客花錢…）
      const cc = V.edges.filter(isCC), sum = new Map(); const labelOf = new Map(); cc.forEach(e => e.srcs.forEach(x => { const c = catOf(x); labelOf.set(c.k, c.label); sum.set(c.k, (sum.get(c.k) || 0) + Math.abs(x.amt)); }));
      kinds = [...sum.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n, label: labelOf.get(k) || k }));
      if (SEL.kind && !sum.has(SEL.kind)) SEL.kind = null;
      const keepTop = new Set(cc.slice().sort((a, b) => b.amt - a.amt).slice(0, 8));
      const before = V.edges.length;
      V.edges = V.edges.filter(e => !isCC(e) || (SEL.n ? (e.from === SEL.n || e.to === SEL.n) : SEL.kind ? e.srcs.some(x => catOf(x).k === SEL.kind) : keepTop.has(e)));
      hidden = before - V.edges.length;
      void kindOf;
    }
    const fid = focusId(); if (fid) { const S = new Set([fid, ...V.nodes.filter(n => n.parent === fid).map(n => n.id)]); V.edges = V.edges.filter(e => S.has(e.from) || S.has(e.to)); }
    const L = layout(phone, V), edges = V.edges, PT = anchors(edges, L.pos, L.tierOf), max = Math.max(...edges.map(e => e.amt), 1), lg = a => Math.log1p(a) / Math.log1p(max);
    if (SEL.e != null && !edges[SEL.e]) SEL.e = null; if (SEL.n && !L.pos[SEL.n]) SEL.n = null;
    const svg = s("svg", { class: "bank-flow-svg", viewBox: "0 0 " + L.W + " " + L.H, role: "group", "aria-label": "今天的金流：" + edges.slice(0, 6).map(e => name(e.from) + "到" + name(e.to) + " " + short(e.amt)).join("、") });
    svg.append(s("defs", null, ...["", "-on"].map(sfx => s("marker", { id: "bfa" + sfx, viewBox: "0 0 10 10", refX: 8, refY: 5, markerUnits: "userSpaceOnUse", markerWidth: 12, markerHeight: 12, orient: "auto" }, s("path", { d: "M0 0 L10 5 L0 10 z", fill: sfx ? "#FFF3C4" : "#D6B25E" })))));
    const lines = [], pills = [], dotsEl = [], taken = []; let dots = 0; // taken：已經放好的金額牌（後面的牌要錯開，不疊在壹起）
    edges.forEach((e, i) => {
      const pa = PT[i] && PT[i][e.from], pb = PT[i] && PT[i][e.to]; if (!pa || !pb) return;
      const on = SEL.e === i, dim = SEL.n && e.from !== SEL.n && e.to !== SEL.n, wd = 1.4 + 4.6 * lg(e.amt), pts = routeGrid(e, L.pos, i) || routeOrtho(pa, pb, e, L.pos, L.W, i) || route(pa, pb, e, L.pos, L.W), d = polyD(pts);
      lines.push(s("path", { d, class: "bank-flow-line" + (on ? " on" : "") + (dim ? " dim" : ""), "stroke-width": wd.toFixed(1), "marker-end": "url(#bfa" + (on ? "-on" : "") + ")", fill: "none" }));
      lines.push(s("path", { d, class: "bank-flow-hit", "stroke-width": 22, fill: "none", tabindex: 0, role: "button", "aria-label": name(e.from) + "到" + name(e.to) + "，今天 " + fmt(e.amt) + "，看來源", "data-i": i }));
      const n = move && !dim ? Math.min(5, 2 + Math.round(lg(e.amt) * 3)) : 0, len = polyLen(pts), dur = Math.max(2.4, len / 60);
      for (let k = 0; k < n && dots < 70; k++, dots++) dotsEl.push(s("circle", { r: (2.4 + 1.2 * lg(e.amt)).toFixed(1), class: "bank-flow-dot" }, s("animateMotion", { path: d, dur: dur.toFixed(2) + "s", begin: "-" + ((k / n) * dur).toFixed(2) + "s", repeatCount: "indefinite", calcMode: "linear" })));
      const t = short(e.amt), w = 12 + t.length * 7.4, chipEdge = !!(L.pos[e.from] && L.pos[e.from].chip && L.pos[e.to] && L.pos[e.to].chip), rects = Object.entries(L.pos).filter(([id, r]) => !r.holder && (chipEdge ? r.chip && id !== e.from && id !== e.to : !r.chip)).map(([, r]) => r).concat(chipEdge && L.pos.world ? [{ x: L.pos.world.x, y: L.pos.world.y - L.pos.world.h / 2 + 22, w: L.pos.world.w, h: 44 }] : []).concat(L.frames.map(f => ({ x: f.x + 6 + (24 + ftitle(V, f).length * 15 + 30) / 2, y: f.y + 11, w: 24 + ftitle(V, f).length * 15 + 30, h: 18 }))), hit = (x, y) => rects.some(r => Math.abs(x - r.x) < r.w / 2 + w / 2 && Math.abs(y - r.y) < r.h / 2 + 12);
      const hitTaken = (x, y) => taken.some(q => Math.abs(x - q.x) < (q.w + w) / 2 + 3 && Math.abs(y - q.y) < 23);
      let mx = polyAt(pts, 0.5).x, my = polyAt(pts, 0.5).y, found = false;
      for (const pass of [true, false]) { let best = null, bd = -1; for (const k of FRACS) { const q = polyAt(pts, k); if (hit(q.x, q.y)) continue; if (pass) { if (!hitTaken(q.x, q.y)) { mx = q.x; my = q.y; found = true; break; } } else { const d = taken.reduce((m, t) => Math.min(m, Math.hypot(q.x - t.x, (q.y - t.y) * 2)), 1e9); if (d > bd) { bd = d; best = q; } } } if (!pass && best) { mx = best.x; my = best.y; found = true; } if (found) break; } // 金額小牌不蓋到方塊、也不疊到別張小牌：先找兩樣都不碰的位置；找不到就挑離別張最遠的
      taken.push({ x: mx, y: my, w });
      pills.push(s("g", { class: "bank-flow-pill" + (on ? " on" : "") + (dim ? " dim" : ""), transform: "translate(" + mx.toFixed(1) + " " + my.toFixed(1) + ")", "data-i": i }, s("rect", { x: -w / 2, y: -10, width: w, height: 20, rx: 10 }), s("text", { "text-anchor": "middle", y: 4.3 }, t)));
    });
    L.frames.forEach(f => svg.append(s("g", { class: "bank-flow-frame", tabindex: 0, role: "button", "aria-label": ftitle(V, f) + "，回上一層" }, s("rect", { x: f.x, y: f.y, width: f.w, height: f.h, rx: 12 }))));
    const draw1 = n => { // 方塊（大的）和已知世界裡的小方塊（chip）
      const id = n.id, p = L.pos[id]; if (!p) return;
      const kidsOf = zoomable(V, id), on = SEL.n === id, bal = V.bal[id] != null ? V.bal[id] : n.bal, small = !!p.chip, band = id === "world" && L.chips.length > 0, label = name(id) + (kidsOf ? " ▸" : "");
      svg.append(s("g", { class: "bank-flow-node-g" + (on ? " on" : "") + (id === "gen" ? " ghost" : "") + (small ? " chip" : "") + (id === L.focus ? " focus" : "") + (kidsOf ? " kids" : ""), transform: "translate(" + p.x.toFixed(1) + " " + p.y.toFixed(1) + ")", tabindex: 0, role: "button", "aria-label": kidsOf ? name(id) + "，放大看裡面" : name(id) + "，只看這裡的進出", "data-n": id, "data-k": kidsOf ? "1" : null },
        s("rect", { x: -p.w / 2, y: -p.h / 2, width: p.w, height: p.h, rx: small ? 7 : 9 }), ...(band ? [s("text", { class: "n", "text-anchor": "middle", y: -p.h / 2 + 20 }, name(id) + (bal != null ? "　" + sshort(bal) : ""))] : [s("text", { class: "n", "text-anchor": "middle", y: bal != null ? -2 : 5 }, label), bal != null ? s("text", { class: "b" + (bal < 0 ? " neg" : ""), "text-anchor": "middle", y: small ? 12 : 14 }, sshort(bal)) : null])));
    };
    (L.focus ? L.nodes : L.nodes.filter(n => !n.parent)).forEach(draw1);
    svg.append(...lines, ...dotsEl); // 線畫在方塊和已知世界那條帶子的上面（集團之間的線在帶子裡面）
    L.frames.forEach(f => { const t = "◂ " + ftitle(V, f), w = 24 + t.length * 15; svg.append(s("g", { class: "bank-flow-ftitle", tabindex: 0, role: "button", "aria-label": ftitle(V, f) + "，回上一層" }, s("rect", { x: f.x + 6, y: f.y + 2, width: w, height: 18, rx: 9 }), s("text", { x: f.x + 14, y: f.y + 15 }, t))); }); // 框的標題畫在線的上面，不被線蓋住
    L.chips.forEach(draw1);
    svg.append(...pills); // 金額小牌在最上面（好點）
    const act = (el, f) => { el.addEventListener("click", f); el.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); f(); } }); };
    svg.querySelectorAll(".bank-flow-hit").forEach(el => act(el, () => pick({ n: SEL.n, e: +el.dataset.i })));
    svg.querySelectorAll(".bank-flow-pill").forEach(el => act(el, () => pick({ n: SEL.n, e: +el.dataset.i })));
    svg.querySelectorAll(".bank-flow-frame, .bank-flow-ftitle").forEach(el => act(el, () => zout()));
    svg.querySelectorAll(".bank-flow-node-g").forEach(el => act(el, () => { const id = el.dataset.n; if (el.dataset.k) { zgo(id); return; } pick({ n: SEL.n === id ? null : id, e: null }); }));
    const crumbs = [["全景", []]]; if (wOpen()) crumbs.push(["已知世界", ["world"]]); if (fid) crumbs.push([name(fid), ["world", fid]]); if (SEL.path[0] && SEL.path[0] !== "world") crumbs.push([(V.orgs[SEL.path[0].slice(4)]) || SEL.path[0], SEL.path.slice()]);
    const bar = h("div", { class: "bank-flow-bar" }, h("nav", { class: "bank-flow-crumbs", "aria-label": "現在看哪一層" }, ...crumbs.flatMap(([t, p], i) => (i === crumbs.length - 1 ? [h("b", { class: "bank-flow-here", "aria-current": "true" }, t)] : [h("button", { type: "button", class: "bank-flow-crumb", onClick: () => { SEL.dir = "out"; SEL.path = p; SEL.n = null; SEL.e = null; draw(); } }, t), h("i", { "aria-hidden": "true" }, "›")]))),
      h("div", { class: "bank-flow-zoom" }, h("button", { type: "button", class: "bank-flow-zb", "aria-label": "縮小，回上一層", title: SEL.path.length ? "縮小，回上一層" : "已經是全景", disabled: SEL.path.length ? null : true, onClick: () => zout() }, h("b", null, "－"), h("span", null, "縮小")),
        h("button", { type: "button", class: "bank-flow-zb", "aria-label": "放大到已知世界", title: SEL.path.length ? "點有 ▸ 的方塊放大" : "放大到已知世界", disabled: SEL.path.length ? true : null, onClick: () => zgo("world") }, h("b", null, "＋"), h("span", null, "放大"))));
    if (SEL.dir) { svg.classList.add(SEL.dir === "in" ? "zin" : "zout"); SEL.dir = ""; }
    const kbar = kinds.length ? h("div", { class: "bank-flow-kinds", role: "group", "aria-label": "往來種類" }, h("span", null, "往來種類"), h("button", { type: "button", class: "bank-flow-kind" + (!SEL.kind ? " on" : ""), "aria-pressed": String(!SEL.kind), onClick: () => { SEL.kind = null; SEL.n = null; SEL.e = null; draw(); } }, "最大的 8 條"),
      ...(SEL.kindMore ? kinds : kinds.filter((k, i) => i < KIND_SHOW || k.k === SEL.kind)).map(k => h("button", { type: "button", class: "bank-flow-kind" + (SEL.kind === k.k ? " on" : ""), "aria-pressed": String(SEL.kind === k.k), onClick: () => { SEL.kind = SEL.kind === k.k ? null : k.k; SEL.n = null; SEL.e = null; draw(); } }, k.label, h("small", null, short(k.n)))),
      kinds.length > KIND_SHOW ? h("button", { type: "button", class: "bank-flow-kind more", "aria-expanded": String(SEL.kindMore), onClick: () => { SEL.kindMore = !SEL.kindMore; draw(); } }, SEL.kindMore ? "收起 ▴" : "更多 " + (kinds.length - KIND_SHOW) + " 種 ▾") : null,
      hidden ? h("em", null, "還有 " + hidden + " 條沒畫（選種類或點集團方塊看）") : null) : null;
    mapBox.replaceChildren(...[bar, kbar, svg].filter(Boolean));
    side.replaceChildren(listBox({ edges, bal: V.bal }, SEL, pick));
  };
  draw();
  box.append(mapBox, side);
  return panel("金流", "今天 05:00 起", box, h("p", { class: "bank-hint" }, "圓片跑的方向＝錢走的方向，線越粗今天流得越多。點金額小牌看來源；點方塊只看那個地方的進出。有 ▸ 的方塊（已知世界、各集團、佩佩博物館）點了放大一層，上面的路徑或「－」回上一層；電腦按住 Ctrl 滾輪、手機兩指分開／靠攏也能縮放。都是合計，不會列個別的人。"));
}
