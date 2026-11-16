// ================================================================
//  「往下／往右還有」的提示（11-16，翊文：「這個可以有提示讓玩家知道可以上下滑嗎」「財報可以上下滑但玩家不一定看的到」「左右滑也加」）
//  - 自動找畫面上可以捲、後面還有東西的框，不用每個廳各寫：
//      上下：整頁、或 overflow-y: auto／scroll 的框 → 底部淡出（.sy-more）、細滑桿、下緣小牌「⌄ 往下滑還有」
//      左右：overflow-x: auto／scroll 的列（頁籤、卡片、畫牆）→ 右邊淡出（.sx-more）、捲過後左邊也淡出（.sx-back）、右側小牌「往右滑還有 ›」
//  - 小牌：挑看得到的、最大的那個；捲了或 5 秒收起；同壹個框這次開網頁只提示壹次（整頁是每個廳各壹次）。有對話框（role=dialog）蓋著時只看對話框裡的。
//  - 只看 2140×1440 和手機直拿（翊文 11-16）。
// ================================================================
const MORE = 12, SHOW_MS = 5000, MIN_Y = 120, MIN_X = 160;
const told = new WeakSet(), toldPage = new Set();
const pills = { y: null, x: null }, pillFor = { y: null, x: null }, pillTimer = { y: 0, x: 0 };
let scanTimer = 0;

const isPage = el => el === document.scrollingElement;
const pageKey = () => "page:" + (document.body.dataset.screen || "");
const wasTold = el => (isPage(el) ? toldPage.has(pageKey()) : told.has(el));
const markTold = el => (isPage(el) ? toldPage.add(pageKey()) : told.add(el));
const moreY = el => el.scrollTop + el.clientHeight < el.scrollHeight - MORE;
const moreX = el => el.scrollLeft + el.clientWidth < el.scrollWidth - MORE;
const cssNum = k => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(k)) || 0;
const viewRect = el => (isPage(el) ? { left: 0, top: 0, width: innerWidth, height: innerHeight, right: innerWidth, bottom: innerHeight - cssNum("--status-real") - cssNum("--nav-h") } : el.getBoundingClientRect());
const topDialog = () => { const d = [...document.querySelectorAll("[role=dialog]")].filter(x => x.getClientRects().length); return d[d.length - 1] || null; };

function hidePill(ax) { const had = !!pillFor[ax]; if (pills[ax]) pills[ax].classList.remove("on"); pillFor[ax] = null; clearTimeout(pillTimer[ax]); if (had) later(); } // 收起後再找壹次：上下的收了才輪到左右的
function showPill(ax, el) {
  if (!pills[ax]) { const p = document.createElement("div"); p.className = "sy-pill sy-pill-" + ax; p.setAttribute("aria-hidden", "true"); p.textContent = ax === "y" ? "⌄ 往下滑還有" : "往右滑還有 ›"; document.body.append(p); pills[ax] = p; }
  const r = viewRect(el), p = pills[ax];
  if (ax === "y") { p.style.left = `${r.left + r.width / 2}px`; p.style.top = `${Math.min(r.bottom, innerHeight) - 10}px`; }
  else { p.style.left = `${Math.min(r.right, innerWidth) - 8}px`; p.style.top = `${r.top + r.height / 2}px`; }
  p.classList.add("on"); pillFor[ax] = el; markTold(el);
  clearTimeout(pillTimer[ax]); pillTimer[ax] = setTimeout(() => hidePill(ax), SHOW_MS);
}
function mark(el) {
  if (el.classList.contains("sy")) el.classList.toggle("sy-more", moreY(el));
  if (el.classList.contains("sx")) { el.classList.toggle("sx-more", moreX(el)); el.classList.toggle("sx-back", el.scrollLeft > MORE); }
}
function onScroll(e) {
  const el = e.target === document ? document.scrollingElement : e.target;
  if (!el || !el.classList) return;
  mark(el);
  for (const ax of ["y", "x"]) if (el === pillFor[ax]) hidePill(ax);
}
const watch = el => { if (!el.dataset.sxw) { el.dataset.sxw = "1"; el.addEventListener("scroll", onScroll, { passive: true }); } };
function scan() {
  scanTimer = 0;
  if (document.hidden) return;
  const page = document.scrollingElement, ys = [], xs = [];
  if (page && page.scrollHeight > innerHeight + MORE) ys.push(page);
  for (const el of document.body.querySelectorAll("*")) {
    const canY = el.clientHeight >= MIN_Y && el.scrollHeight > el.clientHeight + MORE, canX = el.clientWidth >= MIN_X && el.scrollWidth > el.clientWidth + MORE;
    if (!canY && !canX) continue;
    const cs = getComputedStyle(el), oy = cs.overflowY, ox = cs.overflowX;
    if (canY && (oy === "auto" || oy === "scroll")) { el.classList.add("sy"); watch(el); ys.push(el); }
    if (canX && (ox === "auto" || ox === "scroll")) { el.classList.add("sx"); watch(el); xs.push(el); }
    mark(el);
  }
  const dlg = topDialog();
  pick("y", ys, dlg, moreY, el => el.scrollTop > 4);
  pick("x", xs, dlg, moreX, el => el.scrollLeft > 4);
}
function pick(ax, list, dlg, more, moved) {
  const cur = pillFor[ax];
  if (cur && (!cur.isConnected || !more(cur))) hidePill(ax);
  if (pillFor.x || pillFor.y) return; // 壹次只放壹個小牌
  let best = null, area = 0;
  for (const el of list) {
    if (dlg && (isPage(el) || !dlg.contains(el))) continue;
    if (wasTold(el) || !more(el) || moved(el)) continue;
    const r = viewRect(el);
    if (!isPage(el) && (r.bottom <= 0 || r.top >= innerHeight || r.width < 120 || r.right <= 0 || r.left >= innerWidth)) continue;
    const a = r.width * (isPage(el) ? innerHeight : r.height);
    if (a > area) { best = el; area = a; }
  }
  if (best) showPill(ax, best);
}
function later() { if (!scanTimer) scanTimer = setTimeout(scan, 600); }
new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
addEventListener("resize", later);
document.addEventListener("scroll", onScroll, { passive: true });
later();
