// 手機拿直的時候，請玩家轉橫（翊文 11-09：「手機介面改成橫向操作好了」，決定 0043）。
// 網頁鎖不了方向（iPhone 的 Safari 不能鎖；Android 只有全螢幕或裝成 App 才鎖得住），所以做兩件事：
//   1. 直拿的手機蓋一層提示（只用 CSS 判斷：orientation: portrait、寬 ≤ 760、pointer: coarse，轉橫就自己消失；電腦、平板、拉窄的視窗不受影響）。
//   2. 橫拿的版面在 css/landscape.css。
// 「先用直的」記在這台裝置（localStorage，不進存檔、不上傳）；設定頁可以再打開。
import { h } from "./ui_core.js";

const SKIP_KEY = "pepe_orient_skip";
let skipMem = false; // 不能寫 localStorage 的環境（無痕、被擋）：只記在這次
export function orientSkipped() {
  try { return localStorage.getItem(SKIP_KEY) === "1"; } catch (e) { return skipMem; }
}
export function setOrientSkip(on) {
  skipMem = !!on;
  try { if (on) localStorage.setItem(SKIP_KEY, "1"); else localStorage.removeItem(SKIP_KEY); } catch (e) { /* 只留在這次 */ }
  document.body.classList.toggle("orient-skip", !!on);
}
// Android 的第一次按鈕試一次鎖橫向：失敗（沒全螢幕、iPhone 沒這個功能）就算了，不丟錯、不強制全螢幕
let lockTried = false;
export function tryLockLandscape() {
  if (lockTried) return false;
  lockTried = true;
  try {
    const o = typeof screen !== "undefined" ? screen.orientation : null;
    if (!o || typeof o.lock !== "function" || !matchMedia("(pointer: coarse)").matches) return false;
    const p = o.lock("landscape");
    if (p && typeof p.catch === "function") p.catch(() => {});
    return true;
  } catch (e) { return false; }
}

const PHONE = `<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
  <g class="or-phone-body"><rect x="21" y="8" width="22" height="40" rx="4"/><path d="M29 12h6M30 43h4"/></g>
  <path class="or-arrow" d="M12 52a22 22 0 0 0 40 0M52 52l-1-8M52 52l-8-1" opacity=".75"/></svg>`;

function build() {
  if (document.getElementById("orient")) return;
  document.body.classList.toggle("orient-skip", orientSkipped());
  const skip = h("button", { type: "button", class: "btn ghost or-skip", onClick: () => setOrientSkip(true) }, "先用直的");
  const card = h("div", { class: "or-card" },
    h("div", { class: "or-icon", html: PHONE }),
    h("p", { class: "or-t" }, "把手機轉橫，比較好玩"),
    h("p", { class: "or-s" }, "館裡的畫面是橫著排的。直著也能玩，只是比較擠。"),
    skip);
  document.body.append(h("div", { id: "orient", class: "orient", role: "dialog", "aria-modal": "true", "aria-label": "請把手機轉橫" }, card));
  // 第一次按按鈕（進館、開始）試一次鎖橫向；按「先用直的」不算，也不鎖
  document.addEventListener("click", e => {
    if (lockTried || !e.target.closest) return;
    if (e.target.closest("#orient") || orientSkipped()) return;
    if (e.target.closest("button, .m-door, .btn")) tryLockLandscape();
  }, true);
}
if (typeof document !== "undefined") {
  if (document.body) build(); else document.addEventListener("DOMContentLoaded", build);
}
