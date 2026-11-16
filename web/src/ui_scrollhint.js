// ================================================================
//  「往下還有」的提示（11-16，翊文：「這個可以有提示讓玩家知道可以上下滑嗎」「上下滑」）
//  - 自動找畫面上可以上下捲、下面還有東西的區塊（整頁本身、或各廳裡 overflow-y: auto 的框），不用每個廳各寫。
//  - 下面還有：框的底部淡出壹點（css .sy-more），框的下緣跳出壹個小牌「⌄ 往下滑還有」；捲過、或 5 秒後收起來，同壹個框這次開網頁只提示壹次。
//  - 只看 2140×1440 和手機直拿（翊文 11-16）；兩種都會出現（電腦版的框也可能捲）。
// ================================================================
const MIN_H = 120, MORE = 12, SHOW_MS = 5000;
const told = new WeakSet(), toldPage = new Set(); // 這次開網頁已經提示過的框；整頁照「哪個廳」各算壹次
const pageKey = () => "page:" + (document.body.dataset.screen || "");
const wasTold = el => (isPage(el) ? toldPage.has(pageKey()) : told.has(el));
const topDialog = () => { const d = [...document.querySelectorAll("[role=dialog]")].filter(x => x.getClientRects().length); return d[d.length - 1] || null; };
let pill = null, pillFor = null, pillTimer = 0, scanTimer = 0;

const isPage = el => el === document.scrollingElement;
const moreBelow = el => el.scrollTop + el.clientHeight < el.scrollHeight - MORE;
const viewRect = el => (isPage(el) ? { left: 0, width: innerWidth, bottom: innerHeight - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--status-real")) || 0) - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 0) } : el.getBoundingClientRect());

function hidePill() { if (pill) pill.classList.remove("on"); pillFor = null; clearTimeout(pillTimer); }
function showPill(el) {
  if (!pill) { pill = document.createElement("div"); pill.className = "sy-pill"; pill.setAttribute("aria-hidden", "true"); pill.textContent = "⌄ 往下滑還有"; document.body.append(pill); }
  const r = viewRect(el), bottom = Math.min(r.bottom, innerHeight) - 10;
  pill.style.left = `${r.left + r.width / 2}px`; pill.style.top = `${bottom}px`;
  pill.classList.add("on"); pillFor = el; if (isPage(el)) toldPage.add(pageKey()); else told.add(el);
  clearTimeout(pillTimer); pillTimer = setTimeout(hidePill, SHOW_MS);
}
function onScroll(e) {
  const el = e.target === document ? document.scrollingElement : e.target;
  if (!el || !el.classList) return;
  if (el.classList.contains("sy")) el.classList.toggle("sy-more", moreBelow(el));
  if (el === pillFor) hidePill();
}
function scan() {
  scanTimer = 0;
  if (document.hidden) return;
  const page = document.scrollingElement, list = [];
  if (page && page.scrollHeight > innerHeight + MORE) list.push(page);
  for (const el of document.body.querySelectorAll("*")) {
    if (el.clientHeight < MIN_H || el.scrollHeight <= el.clientHeight + MORE) continue;
    const oy = getComputedStyle(el).overflowY;
    if (oy !== "auto" && oy !== "scroll") continue;
    if (!el.classList.contains("sy")) { el.classList.add("sy"); el.addEventListener("scroll", onScroll, { passive: true }); }
    el.classList.toggle("sy-more", moreBelow(el));
    list.push(el);
  }
  // 小牌：挑看得到的、最大的、還沒提示過、下面還有、還沒捲過的那個框
  if (pillFor && (!pillFor.isConnected || !moreBelow(pillFor))) hidePill();
  if (pillFor) return;
  let best = null, area = 0;
  const dlg = topDialog(); // 有對話框蓋著：只看對話框裡的框
  for (const el of list) {
    if (dlg && (isPage(el) || !dlg.contains(el))) continue;
    if (wasTold(el) || !moreBelow(el) || el.scrollTop > 4) continue;
    const r = viewRect(el), a = r.width * (isPage(el) ? innerHeight : r.height);
    if (!isPage(el) && (r.bottom <= 0 || r.top >= innerHeight || r.width < 120)) continue;
    if (a > area) { best = el; area = a; }
  }
  if (best) showPill(best);
}
const later = () => { if (!scanTimer) scanTimer = setTimeout(scan, 600); };
new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
addEventListener("resize", later);
document.addEventListener("scroll", onScroll, { passive: true });
later();
