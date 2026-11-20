// 閒置省電（11-17 玩家反應：手機跟電腦都很吃效能，會慢慢熱起來）。
// 量出來的原因（tools/dev/perf_idle.cjs）：只要畫面上有壹個「無限循環」的動畫在跑（光暈、跑馬燈、金流的小圓片），
// 瀏覽器就每秒畫 60 格；大廳放著不動 5 秒做了 7264 ms 的工作，全部停掉只剩 414 ms。停掉其中壹個沒用，要全部停。
// 做法：玩家 REST_MS 沒操作（點、按鍵、滾輪、移動滑鼠、摸螢幕）→ 把無限循環的動畫（CSS、Web Animations、SVG 的 animate）全部暫停；
// 壹有操作就接著動。只停無限循環的：會結束的動畫（換畫面、提示卡進場）照跑，不會卡住等 animationend 的程式。
// 暫停期間換了畫面、多出新的動畫：每 CHECK_MS 再掃壹次補停。
export const REST_MS = 45000, CHECK_MS = 3000;
const WAKE = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"];

export function restLoop(doc = document, now = () => Date.now()) {
  let last = now(), resting = false, held = new Set();
  const infinite = a => { try { return a.playState === "running" && a.effect && a.effect.getComputedTiming().iterations === Infinity; } catch (e) { return false; } };
  const svgs = () => [...doc.querySelectorAll("svg")].filter(s => s.pauseAnimations && !s.animationsPaused() && s.querySelector("animate, animateMotion, animateTransform"));
  const hush = () => {
    for (const a of doc.getAnimations ? doc.getAnimations() : []) if (infinite(a)) { a.pause(); held.add(a); }
    for (const s of svgs()) { s.pauseAnimations(); held.add(s); }
  };
  const wake = () => {
    last = now();
    if (!resting) return;
    resting = false; doc.body && doc.body.classList.remove("resting");
    for (const x of held) { try { if (x.unpauseAnimations) x.unpauseAnimations(); else x.play(); } catch (e) { /* 已經不在畫面上 */ } }
    held = new Set();
  };
  const check = () => {
    if (!resting && now() - last < REST_MS) return;
    if (!resting) { resting = true; doc.body && doc.body.classList.add("resting"); }
    hush();
  };
  WAKE.forEach(ev => doc.addEventListener(ev, wake, { passive: true, capture: true }));
  const timer = setInterval(check, CHECK_MS);
  return { check, wake, get resting() { return resting; }, stop() { clearInterval(timer); WAKE.forEach(ev => doc.removeEventListener(ev, wake, { capture: true })); } };
}
