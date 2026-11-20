// fx 的拖放：makeDraggable、makeDropTarget、drag。11-20 從 fx.js 拆出來，內容照原樣搬。
import { afterAnim, animate, api, caf, clamp, easeOut3, hasDOM, now, raf, reduced } from "./fx_core.js";
import { sound } from "./fx_sound.js";

  /* ======================================================== DRAG & DROP */
  export const drag = {
    shaky: false,
    get active() { return !!session; },
    cancel() { endDrag(false); },
  };
  const targetRecs = new WeakMap(); // element -> [records]; the DOM itself is the registry
  let session = null;
  let clickBlockUntil = 0, clickBlockT = 0;
  const NO_DRAG = 'button, a[href], input, select, textarea, label, [contenteditable=""], [contenteditable="true"], [data-fx-nodrag]';
  const SKIP_PROP = /^(transition|animation|pointer-events|cursor|will-change|view-transition|content-visibility)/;

  function accepts(rec, type, data) {
    const a = rec.accepts;
    if (typeof a === 'function') { try { return !!a(type, data); } catch (e) { return false; } }
    if (!a) return false;
    const list = Array.isArray(a) ? a : [a];
    return list.indexOf(type) >= 0 || list.indexOf('*') >= 0;
  }
  function hitTarget(x, y, type, data) {
    let nd = document.elementFromPoint(x, y);
    while (nd && nd !== document.documentElement) {
      const recs = targetRecs.get(nd);
      if (recs) for (let i = recs.length - 1; i >= 0; i--) if (accepts(recs[i], type, data)) return { el: nd, rec: recs[i] };
      nd = nd.parentElement;
    }
    return null;
  }
  function cloneGhost(src) {
    const c = src.cloneNode(true);
    c.removeAttribute('id');
    const S = [src].concat(Array.from(src.querySelectorAll('*')));
    const C = [c].concat(Array.from(c.querySelectorAll('*')));
    const lim = Math.min(S.length, C.length, 160);
    for (let i = 0; i < lim; i++) {
      const cs = getComputedStyle(S[i]), st = C[i].style;
      for (let j = 0; j < cs.length; j++) {
        const p = cs[j];
        if (SKIP_PROP.test(p)) continue;
        st.setProperty(p, cs.getPropertyValue(p));
      }
      if (S[i].tagName === 'CANVAS') { try { C[i].getContext('2d').drawImage(S[i], 0, 0); } catch (e) { /* ignore */ } }
    }
    if (c.style.display === 'inline') c.style.display = 'inline-block';
    return c;
  }

  export function makeDraggable(el, opts = {}) {
    if (!el || !hasDOM()) return () => {};
    const o = opts;
    el.classList.add('fx-draggable');
    if (o.panX) el.classList.add('fx-pan-x');
    el.setAttribute('draggable', 'false');
    const addedTab = !!o.onTap && !el.hasAttribute('tabindex') && !el.matches('button, a[href], input, select, textarea');
    if (addedTab) el.tabIndex = 0;
    let pend = null, bound = true;
    const getData = () => (typeof o.data === 'function' ? o.data(el) : o.data);

    function onDown(e) {
      if (session || pend || !bound) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.isPrimary === false) return;
      const it = e.target && e.target.closest ? e.target.closest(NO_DRAG) : null;
      if (it && it !== el && el.contains(it)) return;
      pend = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, pt: e.pointerType || 'mouse', timer: 0 };
      if (pend.pt !== 'mouse' && o.panX) pend.timer = setTimeout(() => { if (pend) begin(); }, 300);
      window.addEventListener('pointermove', onPMove, true);
      window.addEventListener('pointerup', onPUp, true);
      window.addEventListener('pointercancel', onPCancel, true);
    }
    function clearPend() {
      if (!pend) return;
      clearTimeout(pend.timer);
      window.removeEventListener('pointermove', onPMove, true);
      window.removeEventListener('pointerup', onPUp, true);
      window.removeEventListener('pointercancel', onPCancel, true);
      pend = null;
    }
    function onPMove(e) {
      if (!pend || e.pointerId !== pend.id) return;
      pend.x = e.clientX; pend.y = e.clientY;
      const dx = pend.x - pend.x0, dy = pend.y - pend.y0;
      if (Math.hypot(dx, dy) <= 5) return;
      if (pend.pt !== 'mouse' && o.panX && Math.abs(dy) <= Math.abs(dx) * 1.2) { clearPend(); return; } // let the strip scroll
      begin();
    }
    function onPUp(e) {
      if (!pend || e.pointerId !== pend.id) return;
      clearPend();
      if (o.onTap) { try { o.onTap(el, getData()); } catch (err) { console.error(err); } }
    }
    function onPCancel(e) { if (pend && e.pointerId === pend.id) clearPend(); }
    function begin() {
      const p = pend;
      clearPend();
      if (!p || !el.isConnected) return;
      startDrag(el, o, getData(), p);
    }
    function onTouchMove(e) { if (session && session.src === el && e.cancelable) e.preventDefault(); }
    function onCtx(e) { if (pend || (session && session.src === el)) e.preventDefault(); }
    function onNative(e) { e.preventDefault(); }
    const nativeKey = el.matches('button, a[href], input, select, textarea, summary');
    function onKey(e) {
      if (e.target !== el || !o.onTap || nativeKey) return; // buttons get a native click instead
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        try { o.onTap(el, getData()); } catch (err) { console.error(err); }
      }
    }
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('contextmenu', onCtx);
    el.addEventListener('dragstart', onNative);
    el.addEventListener('keydown', onKey);
    return function unbind() {
      if (!bound) return;
      bound = false;
      clearPend();
      if (session && session.src === el) endDrag(false);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('touchmove', onTouchMove, { passive: false });
      el.removeEventListener('contextmenu', onCtx);
      el.removeEventListener('dragstart', onNative);
      el.removeEventListener('keydown', onKey);
      el.classList.remove('fx-draggable', 'fx-pan-x', 'fx-dragging-src');
      if (addedTab) el.removeAttribute('tabindex');
    };
  }

  function startDrag(src, o, data, p) {
    const type = o.type || 'item';
    const rect = src.getBoundingClientRect();
    let ghost = null, custom = false;
    if (typeof o.ghost === 'function') {
      try { ghost = o.ghost(src, data); } catch (e) { ghost = null; }
      custom = !!(ghost && ghost.nodeType === 1);
    }
    if (!custom) ghost = cloneGhost(src);
    const srcFilter = custom ? '' : getComputedStyle(src).filter;
    ghost.classList.add('fx-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    const st = ghost.style;
    st.position = 'fixed'; st.margin = '0'; st.right = 'auto'; st.bottom = 'auto';
    st.transition = 'none'; st.animation = 'none'; st.pointerEvents = 'none';
    st.translate = 'none'; st.rotate = 'none'; st.scale = 'none';
    st.zIndex = '9800';
    st.filter = (srcFilter && srcFilter !== 'none' ? srcFilter + ' ' : '') +
      'drop-shadow(0 14px 20px rgba(29,29,27,.14)) drop-shadow(0 2px 4px rgba(29,29,27,.08))';
    const s = {
      src, o, type, data, ghost, custom, id: p.id, pt: p.pt, x: p.x, y: p.y, t0: now(),
      raf: 0, hoverEl: null, okEls: [], scroller: null, scrollerFor: null,
    };
    if (custom) {
      st.left = '0px'; st.top = '0px';
      document.body.appendChild(ghost);
      s.gw = ghost.offsetWidth; s.gh = ghost.offsetHeight;
      s.baseL = 0; s.baseT = 0;
      s.ax = s.gw / 2; s.ay = s.gh / 2 + (p.pt !== 'mouse' ? 18 : 0);
      s.ox = s.gw / 2; s.oy = s.gh / 2;
    } else {
      st.left = rect.left + 'px'; st.top = rect.top + 'px';
      st.width = rect.width + 'px'; st.height = rect.height + 'px';
      st.boxSizing = 'border-box'; st.maxWidth = 'none'; st.maxHeight = 'none'; st.minWidth = '0'; st.minHeight = '0';
      st.opacity = '1';
      document.body.appendChild(ghost);
      s.gw = rect.width; s.gh = rect.height;
      s.baseL = rect.left; s.baseT = rect.top;
      s.ax = p.x0; s.ay = p.y0;
      s.ox = p.x0 - rect.left; s.oy = p.y0 - rect.top;
    }
    st.transformOrigin = s.ox + 'px ' + s.oy + 'px';
    session = s;
    src.classList.add('fx-dragging-src');
    document.documentElement.classList.add('fx-dragging');
    document.querySelectorAll('.fx-drop-target').forEach((t) => {
      const recs = targetRecs.get(t);
      if (recs && recs.some((r) => accepts(r, type, data))) { t.classList.add('fx-drop-ok'); s.okEls.push(t); }
    });
    window.addEventListener('pointermove', onDragMove, true);
    window.addEventListener('pointerup', onDragUp, true);
    window.addEventListener('pointercancel', onDragCancel, true);
    window.addEventListener('keydown', onDragKey, true);
    window.addEventListener('blur', onDragBlur);
    window.addEventListener('click', blockClick, true);
    clearTimeout(clickBlockT);
    dragTick();
  }
  function onDragMove(e) {
    if (!session || e.pointerId !== session.id) return;
    session.x = e.clientX; session.y = e.clientY;
    if (e.pointerType !== 'mouse' && e.cancelable) e.preventDefault();
  }
  function onDragUp(e) { if (session && e.pointerId === session.id) { session.x = e.clientX; session.y = e.clientY; endDrag(true); } }
  function onDragCancel(e) { if (session && e.pointerId === session.id) endDrag(false); }
  function onDragKey(e) { if (session && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endDrag(false); } }
  function onDragBlur() { if (session) endDrag(false); }
  function blockClick(e) { if (now() < clickBlockUntil) { e.preventDefault(); e.stopPropagation(); clickBlockUntil = 0; } }

  function ghostTransform(tx, ty, rot, sc) {
    return 'translate3d(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px,0) rotate(' + rot.toFixed(2) + 'deg) scale(' + sc.toFixed(3) + ')';
  }
  function dragTick() {
    const s = session;
    if (!s) return;
    const t = now(), rm = reduced();
    const lift = rm ? 0 : easeOut3(clamp((t - s.t0) / 180, 0, 1));
    let jx = 0, jy = 0, rot = 0;
    if (api.drag && api.drag.shaky && !rm) { // "hands shaking"
      jx = 2.4 * Math.sin(t * 0.031) + 1.5 * Math.sin(t * 0.067 + 1.3) + 0.8 * Math.sin(t * 0.113);
      jy = 2.1 * Math.sin(t * 0.027 + 0.7) + 1.5 * Math.sin(t * 0.059 + 2.1) + 0.7 * Math.sin(t * 0.127 + 0.4);
      rot = 1.6 * Math.sin(t * 0.023) + 1.1 * Math.sin(t * 0.071 + 0.4);
    }
    s.tx = s.x - s.ax + jx; s.ty = s.y - s.ay + jy; s.rot = rot; s.sc = 1 + 0.08 * lift;
    s.ghost.style.transform = ghostTransform(s.tx, s.ty, s.rot, s.sc);
    const hit = hitTarget(s.x, s.y, s.type, s.data);
    const hel = hit ? hit.el : null;
    if (hel !== s.hoverEl) {
      if (s.hoverEl) s.hoverEl.classList.remove('fx-drop-hover');
      if (hel) hel.classList.add('fx-drop-hover');
      s.hoverEl = hel;
    }
    if (t - s.t0 > 300) autoScroll(s);
    s.raf = raf(dragTick);
  }
  function autoScroll(s) {
    const EDGE = 44, MAX = 14;
    const vh = window.innerHeight;
    let dy = 0;
    if (s.y < EDGE) dy = -MAX * (1 - s.y / EDGE);
    else if (s.y > vh - EDGE) dy = MAX * (1 - (vh - s.y) / EDGE);
    const under = document.elementFromPoint(s.x, s.y);
    if (under !== s.scrollerFor) {
      s.scrollerFor = under; s.scroller = null;
      let nd = under;
      while (nd && nd !== document.body && nd !== document.documentElement) {
        const cs = getComputedStyle(nd);
        const canX = /(auto|scroll)/.test(cs.overflowX) && nd.scrollWidth > nd.clientWidth + 1;
        const canY = /(auto|scroll)/.test(cs.overflowY) && nd.scrollHeight > nd.clientHeight + 1;
        if (canX || canY) { s.scroller = { el: nd, canX, canY }; break; }
        nd = nd.parentElement;
      }
    }
    const sc = s.scroller;
    if (sc && sc.el.isConnected) {
      const r = sc.el.getBoundingClientRect();
      const ex = Math.min(EDGE, r.width / 4), ey = Math.min(EDGE, r.height / 4);
      if (sc.canX) {
        if (s.x < r.left + ex) sc.el.scrollLeft -= MAX * (1 - (s.x - r.left) / ex);
        else if (s.x > r.right - ex) sc.el.scrollLeft += MAX * (1 - (r.right - s.x) / ex);
      }
      if (sc.canY) {
        if (s.y < r.top + ey) sc.el.scrollTop -= MAX * (1 - (s.y - r.top) / ey);
        else if (s.y > r.bottom - ey) sc.el.scrollTop += MAX * (1 - (r.bottom - s.y) / ey);
      }
    }
    if (dy) window.scrollBy(0, dy);
  }
  function endDrag(drop) {
    const s = session;
    if (!s) return;
    session = null;
    caf(s.raf);
    window.removeEventListener('pointermove', onDragMove, true);
    window.removeEventListener('pointerup', onDragUp, true);
    window.removeEventListener('pointercancel', onDragCancel, true);
    window.removeEventListener('keydown', onDragKey, true);
    window.removeEventListener('blur', onDragBlur);
    clickBlockUntil = now() + 400;
    clickBlockT = setTimeout(() => window.removeEventListener('click', blockClick, true), 450);
    document.documentElement.classList.remove('fx-dragging');
    if (s.hoverEl) s.hoverEl.classList.remove('fx-drop-hover');
    s.okEls.forEach((t) => t.classList.remove('fx-drop-ok'));
    const hit = drop ? hitTarget(s.x, s.y, s.type, s.data) : null;
    if (!hit) { flyBack(s, false); return; }
    const info = { x: s.x, y: s.y, type: s.type, source: s.src, target: hit.el, pointerType: s.pt };
    let res;
    try { res = hit.rec.onDrop ? hit.rec.onDrop(s.data, hit.el, info) : true; } catch (err) { console.error(err); res = false; }
    const settle = (v) => {
      s.ghost.classList.remove('fx-ghost-wait');
      if (v === false) { sound.play('error'); flyBack(s, true); } else absorb(s, hit.el);
    };
    if (res && typeof res.then === 'function') { s.ghost.classList.add('fx-ghost-wait'); res.then(settle, () => settle(false)); }
    else settle(res);
  }
  function restoreSrc(src) {
    if (!src.classList.contains('fx-dragging-src')) return;
    src.classList.remove('fx-dragging-src');
    if (src.isConnected && !reduced()) animate(src, [{ opacity: 0.35 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
  }
  function flyBack(s, rejected) {
    const g = s.ghost, src = s.src;
    const cur = ghostTransform(s.tx || 0, s.ty || 0, s.rot || 0, s.sc || 1);
    if (reduced() || !src.isConnected) {
      restoreSrc(src);
      afterAnim(animate(g, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }), 160, () => g.remove());
      return;
    }
    const r = src.getBoundingClientRect();
    const tx = s.custom ? r.left + r.width / 2 - s.gw / 2 - s.baseL : r.left - s.baseL;
    const ty = s.custom ? r.top + r.height / 2 - s.gh / 2 - s.baseT : r.top - s.baseT;
    const home = ghostTransform(tx, ty, 0, 1);
    const frames = [{ transform: cur }];
    if (rejected) { // small "no" shake where it was dropped
      frames.push({ transform: ghostTransform((s.tx || 0) - 7, s.ty || 0, 0, s.sc || 1), offset: 0.1 });
      frames.push({ transform: ghostTransform((s.tx || 0) + 6, s.ty || 0, 0, s.sc || 1), offset: 0.2 });
      frames.push({ transform: ghostTransform(s.tx || 0, s.ty || 0, 0, s.sc || 1), offset: 0.28, easing: 'cubic-bezier(.3,1.35,.5,1)' });
    } else frames[0].easing = 'cubic-bezier(.3,1.35,.5,1)'; // small overshoot = bounce home
    frames.push({ transform: home });
    const dur = rejected ? 560 : 380;
    const a = animate(g, frames, { duration: dur, fill: 'forwards' });
    afterAnim(a, dur, () => {
      restoreSrc(src);
      afterAnim(animate(g, [{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' }), 140, () => g.remove());
    });
  }
  function absorb(s, tEl) {
    const g = s.ghost, src = s.src;
    if (reduced() || !tEl.isConnected) {
      afterAnim(animate(g, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }), 160, () => { g.remove(); restoreSrc(src); });
      return;
    }
    const r = tEl.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, sc = 0.5;
    // visual centre = base + T + O + sc*(C - O)  ->  solve for T
    const tx = cx - s.baseL - s.ox - sc * (s.gw / 2 - s.ox);
    const ty = cy - s.baseT - s.oy - sc * (s.gh / 2 - s.oy);
    const a = animate(g, [
      { transform: ghostTransform(s.tx || 0, s.ty || 0, s.rot || 0, s.sc || 1), opacity: 1 },
      { transform: ghostTransform(tx, ty, 0, sc), opacity: 0 },
    ], { duration: 260, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
    afterAnim(a, 260, () => { g.remove(); restoreSrc(src); });
  }

  export function makeDropTarget(el, opts = {}) {
    if (!el) return () => {};
    const rec = opts;
    let arr = targetRecs.get(el);
    if (!arr) { arr = []; targetRecs.set(el, arr); }
    arr.push(rec);
    el.classList.add('fx-drop-target');
    if (session && accepts(rec, session.type, session.data)) { el.classList.add('fx-drop-ok'); session.okEls.push(el); }
    let bound = true;
    return function unbind() {
      if (!bound) return;
      bound = false;
      const a = targetRecs.get(el);
      if (a) {
        const i = a.indexOf(rec);
        if (i >= 0) a.splice(i, 1);
        if (!a.length) { targetRecs.delete(el); el.classList.remove('fx-drop-target', 'fx-drop-ok', 'fx-drop-hover'); }
      }
    };
  }
