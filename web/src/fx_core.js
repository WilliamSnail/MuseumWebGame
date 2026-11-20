// fx 的共用小工具（utilities）和 FX 物件 api。其他 fx_*.js 都從這裡拿。
// 11-20 從 fx.js 拆出來：內容照原樣搬（縮排也沒動，所以 tools/check/fx_report.cjs、test 掃字串的規則照舊）。

export const api = {};

  /* =========================================================== utilities */
  export const hasDOM = () => typeof document !== 'undefined' && !!document.body;
  export const reduced = () => {
    const s = api.settings || {};
    return !!s.reduceMotion || (hasDOM() && document.body.classList.contains('reduce-motion'));
  };
  export const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  export const rand = (a, b) => a + Math.random() * (b - a);
  export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  export const easeOut3 = (u) => 1 - Math.pow(1 - u, 3);
  export const EASE = 'cubic-bezier(.2,.7,.2,1)';
  const hasRAF = () => typeof requestAnimationFrame === 'function';
  export const raf = (cb) => (hasRAF() ? requestAnimationFrame(cb) : setTimeout(() => cb(now()), 16));
  export const caf = (id) => { if (!id) return; if (hasRAF()) cancelAnimationFrame(id); else clearTimeout(id); };
  let uidN = 0;
  export const uid = (p) => p + '-' + (++uidN);
  export const toneOf = (t) => (t === 'good' || t === 'bad' ? t : 'neutral');

  export function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  export function markRM(el) { if (el && el.classList) el.classList.toggle('fx-rm', reduced()); return el; }
  export function animate(el, frames, opts) {
    try { if (el && el.animate) return el.animate(frames, opts); } catch (e) { /* ignore */ }
    return null;
  }
  // run cb once when the animation ends (or after a safety timeout)
  export function afterAnim(a, ms, cb) {
    let done = false;
    const go = () => { if (!done) { done = true; cb(); } };
    if (a) { a.onfinish = go; a.oncancel = go; }
    setTimeout(go, ms + 80);
  }
  export function focusNoScroll(el) {
    if (!el || !el.focus) return;
    try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) { /* ignore */ } }
  }
  function focusables(root) {
    const sel = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    return Array.from(root.querySelectorAll(sel)).filter((n) => {
      if (n.disabled || !n.getClientRects().length) return false;
      const cs = getComputedStyle(n);
      return cs.visibility !== 'hidden' && cs.display !== 'none';
    });
  }
  export function trapTab(e, root, fallback) {
    const list = focusables(root);
    if (!list.length) { e.preventDefault(); focusNoScroll(fallback); return; }
    const first = list[0], last = list[list.length - 1], a = document.activeElement;
    const inside = root.contains(a) && a !== root;
    if (e.shiftKey) {
      if (!inside || a === first) { e.preventDefault(); focusNoScroll(last); }
    } else if (!inside || a === last) { e.preventDefault(); focusNoScroll(first); }
  }
