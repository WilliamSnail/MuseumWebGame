// fx 的小工具：countTo（數字滾動）、toast、floatText、goldDust、spotlight、press。11-20 從 fx.js 拆出來，內容照原樣搬。
import { EASE, afterAnim, animate, caf, clamp, easeOut3, focusNoScroll, h, hasDOM, markRM, now, pick, raf, rand, reduced, toneOf, trapTab, uid } from "./fx_core.js";

  /* ============================================================ countTo */
  const counters = new WeakMap();
  const defFmt = (n) => n.toLocaleString('en-US');
  export function countTo(el, to, o = {}) {
    if (!el) return;
    const duration = o.duration != null ? o.duration : 600;
    const format = typeof o.format === 'function' ? o.format : defFmt;
    to = Number(to);
    if (!isFinite(to)) return;
    const ds = el.dataset || {};
    const had = ds.v != null && ds.v !== '' && isFinite(Number(ds.v));
    let from = had ? Number(ds.v) : to;
    const prev = counters.get(el);
    if (prev) { // continue from what is visible now
      const p = clamp((now() - prev.t0) / prev.dur, 0, 1);
      from = prev.from + (prev.to - prev.from) * easeOut3(p);
      if (Number.isInteger(prev.from) && Number.isInteger(prev.to)) from = Math.round(from);
      stopCounter(prev);
      counters.delete(el);
    }
    if (el.dataset) el.dataset.v = String(to);
    const final = String(format(to));
    if (!had || from === to || duration <= 0 || !hasDOM()) { el.textContent = final; return; }
    if (reduced()) {
      el.textContent = final;
      animate(el, [{ opacity: 0.3 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
      return;
    }
    const st = { from, to, t0: now(), dur: duration, timer: 0, raf: 0, anims: [] };
    counters.set(el, st);
    const ok = Number.isInteger(from) && Number.isInteger(to) && buildOdometer(el, st, format, final);
    if (!ok) tweenText(el, st, format);
    st.timer = setTimeout(() => {
      if (counters.get(el) !== st) return;
      counters.delete(el);
      caf(st.raf);
      el.textContent = final;
    }, duration + 40);
  }
  function stopCounter(st) {
    clearTimeout(st.timer);
    caf(st.raf);
    st.anims.forEach((a) => { try { a.cancel(); } catch (e) { /* ignore */ } });
  }
  function tweenText(el, st, format) {
    const ints = Number.isInteger(st.from) && Number.isInteger(st.to);
    const step = () => {
      const p = clamp((now() - st.t0) / st.dur, 0, 1);
      const v = st.from + (st.to - st.from) * easeOut3(p);
      el.textContent = String(format(ints ? Math.round(v) : Math.round(v * 100) / 100));
      st.raf = p < 1 ? raf(step) : 0;
    };
    step();
  }
  function buildOdometer(el, st, format, final) {
    const absTo = Math.abs(st.to), absFrom = Math.abs(st.from);
    const F = String(format(st.from));
    const dT = String(absTo), dF = String(absFrom);
    // locate the number inside the formatted text ("+3 靈感", "1,234／5,000", ...)
    const findNum = (str, digits) => {
      const re = /[0-9](?:[0-9,]*[0-9])?/g;
      let m;
      while ((m = re.exec(str))) if (m[0].replace(/,/g, '') === digits) return { i: m.index, s: m[0] };
      return null;
    };
    const tok = findNum(final, dT);
    if (!tok || !findNum(F, dF)) return false; // not an integer rendering: plain tween instead
    // measure the real line box (handles line-height: normal for CJK fonts)
    const probe = h('span', null, '0');
    probe.style.cssText = 'display:inline-block;line-height:inherit;padding:0;border:0;margin:0';
    el.appendChild(probe);
    let lh = probe.offsetHeight; // layout px, unaffected by ancestor transforms
    probe.remove();
    if (!isFinite(lh) || lh <= 0) { lh = parseFloat(getComputedStyle(el).lineHeight); }
    if (!isFinite(lh) || lh <= 0) return false;
    const wrap = h('span', 'fx-odo');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.height = lh + 'px';
    wrap.style.lineHeight = lh + 'px';
    const cell = (v, blank) => { const c = h('span', 'fx-odo-d', blank ? ' ' : String(v)); c.style.height = lh + 'px'; return c; };
    const column = (place) => {
      const p = Math.pow(10, place);
      const sv = Math.floor(absFrom / p), ev = Math.floor(absTo / p);
      const sBlank = place > 0 && absFrom < p, eBlank = place > 0 && absTo < p;
      const col = h('span', 'fx-odo-col');
      col.style.height = lh + 'px';
      const k = ev - sv;
      if (k === 0) { col.appendChild(cell(sv % 10, sBlank)); return col; }
      let n = Math.abs(k);
      if (n > 19) n = 10 + (n % 10);
      const dir = k > 0 ? 1 : -1, s0 = sv % 10;
      const seq = [];
      for (let j = 0; j <= n; j++) {
        const v = (((s0 + dir * j) % 10) + 10) % 10;
        seq.push(cell(v, (j === 0 && sBlank) || (j === n && eBlank)));
      }
      const strip = h('span', 'fx-odo-strip');
      (dir > 0 ? seq : seq.reverse()).forEach((c) => strip.appendChild(c));
      col.appendChild(strip);
      col.classList.add('is-moving');
      const y0 = dir > 0 ? 0 : -n * lh, y1 = dir > 0 ? -n * lh : 0;
      strip.style.transform = 'translateY(' + y1 + 'px)';
      const a = animate(strip, [{ transform: 'translateY(' + y0 + 'px)' }, { transform: 'translateY(' + y1 + 'px)' }], { duration: st.dur, easing: EASE });
      if (a) st.anims.push(a);
      return col;
    };
    const ch = (c) => { const sp = h('span', 'fx-odo-ch', c); sp.style.height = lh + 'px'; return sp; };
    const nodes = [];
    const chars = Array.from(tok.s);
    let place = 0;
    for (let i = chars.length - 1; i >= 0; i--) {
      const c = chars[i];
      if (c >= '0' && c <= '9') { nodes.unshift(column(place)); place++; } else nodes.unshift(ch(c));
    }
    for (let q = dT.length; q < dF.length; q++) nodes.unshift(column(q)); // digits that roll away (1,000 -> 999)
    const pre = final.slice(0, tok.i), post = final.slice(tok.i + tok.s.length);
    if (pre) wrap.appendChild(ch(pre));
    nodes.forEach((nd) => wrap.appendChild(nd));
    if (post) wrap.appendChild(ch(post));
    el.textContent = '';
    el.append(h('span', 'fx-sr', final), wrap);
    return true;
  }


  /* ============================================================== toast */
  let toastWrap = null;
  function flipList(container, mutate) {
    if (reduced()) { mutate(); return; }
    const before = new Map();
    Array.from(container.children).forEach((k) => before.set(k, k.getBoundingClientRect().top));
    mutate();
    Array.from(container.children).forEach((k) => {
      const b = before.get(k);
      if (b == null) return;
      const dy = b - k.getBoundingClientRect().top;
      if (Math.abs(dy) > 0.5) animate(k, [{ transform: 'translateY(' + dy + 'px)' }, { transform: 'translateY(0)' }], { duration: 240, easing: EASE });
    });
  }
  function dismissToast(t) {
    if (!t || t.classList.contains('is-out')) return;
    clearTimeout(t._fxT);
    t.classList.add('is-out');
    t.classList.remove('is-in');
    setTimeout(() => { if (t.parentNode) flipList(t.parentNode, () => t.remove()); }, reduced() ? 180 : 260);
  }
  export function toast(text, o = {}) {
    if (!hasDOM()) return () => {};
    const ms = o.ms != null ? o.ms : 2600;
    if (!toastWrap || !toastWrap.isConnected) {
      toastWrap = h('div', 'fx-toasts');
      toastWrap.setAttribute('role', 'status');
      toastWrap.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastWrap);
    }
    const w = toastWrap;
    markRM(w);
    const t = h('div', 'fx-toast fx-tone-' + toneOf(o.tone));
    const dot = h('span', 'fx-toast-dot');
    dot.setAttribute('aria-hidden', 'true');
    t.append(dot, h('span', 'fx-toast-text', String(text)));
    // 按鈕（例如「去看看」）：o.action = { label, run }。label 是純文字；按下去先做 run 再收掉這則
    if (o.action && typeof o.action.run === 'function') {
      const ab = h('button', 'fx-toast-act');
      ab.type = 'button';
      ab.textContent = String(o.action.label || '');
      ab.addEventListener('click', () => { try { o.action.run(); } catch (e) { console.error(e); } });
      t.append(ab);
    }
    flipList(w, () => w.appendChild(t));
    void t.offsetWidth;
    t.classList.add('is-in');
    const live = Array.from(w.children).filter((c) => !c.classList.contains('is-out'));
    while (live.length > 5) dismissToast(live.shift()); // 最多同時 5 則（原本 3 則，重要的說明會被擠掉）
    const close = () => dismissToast(t);
    t._fxT = setTimeout(close, ms);
    t.addEventListener('pointerenter', () => clearTimeout(t._fxT));
    t.addEventListener('pointerleave', () => { if (t.classList.contains('is-out')) return; clearTimeout(t._fxT); t._fxT = setTimeout(close, 3000); });
    t.addEventListener('click', close);
    return close;
  }


  /* ========================================================== floatText */
  let floatLayer = null;
  const recentFloat = new WeakMap();
  export function floatText(target, text, tone) {
    if (!hasDOM() || target == null) return;
    let x, y, k = 0;
    if (target.nodeType === 1) {
      if (!target.isConnected) return;
      const r = target.getBoundingClientRect();
      x = r.left + r.width / 2; y = r.top + r.height / 2;
      try { // a wide block holding short text: centre horizontally over the text itself
        const rg = document.createRange();
        rg.selectNodeContents(target);
        const cr = rg.getBoundingClientRect();
        if (cr.width > 0 && cr.width < r.width - 4 && cr.left >= r.left - 1 && cr.right <= r.right + 1) x = cr.left + cr.width / 2;
      } catch (e) { /* ignore */ }
      const prev = recentFloat.get(target), t = now();
      if (prev && t - prev.t < 450) k = Math.min(prev.k + 1, 3);
      recentFloat.set(target, { t, k });
    } else {
      x = Number(target.x); y = Number(target.y);
      if (!isFinite(x) || !isFinite(y)) return;
    }
    if (!floatLayer || !floatLayer.isConnected) {
      floatLayer = h('div', 'fx-float-layer');
      floatLayer.setAttribute('aria-hidden', 'true');
      document.body.appendChild(floatLayer);
    }
    const s = h('span', 'fx-float fx-tone-' + toneOf(tone), String(text));
    s.style.left = (x + (k ? (k % 2 ? 10 : -10) : 0)) + 'px';
    s.style.top = (y - k * 16) + 'px';
    floatLayer.appendChild(s);
    const rm = reduced(), base = 'translate(-50%,-50%) ';
    const frames = rm
      ? [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }]
      : [
        { opacity: 0, transform: base + 'translateY(6px) scale(.92)' },
        { opacity: 1, transform: base + 'translateY(-6px) scale(1)', offset: 0.18 },
        { opacity: 1, transform: base + 'translateY(-26px) scale(1)', offset: 0.66 },
        { opacity: 0, transform: base + 'translateY(-40px) scale(1)' },
      ];
    const dur = rm ? 900 : 1150;
    afterAnim(animate(s, frames, { duration: dur, easing: 'ease-out', fill: 'forwards' }), dur, () => s.remove());
  }


  /* ============================================================ goldDust */
  const DUST = ['#C99A2E', '#D9B458', '#B8892A', '#E6CC85', '#CFA544'];
  export function goldDust(host, ms = 2500) {
    if (!hasDOM() || reduced()) return () => {};
    host = host || document.body;
    const full = host === document.body || host === document.documentElement;
    const cv = document.createElement('canvas');
    cv.className = 'fx-dust' + (full ? ' fx-dust-fixed' : '');
    cv.setAttribute('aria-hidden', 'true');
    let restorePos = null;
    if (!full && getComputedStyle(host).position === 'static') { restorePos = host.style.position; host.style.position = 'relative'; }
    host.appendChild(cv);
    const w = full ? window.innerWidth : host.clientWidth;
    const hgt = full ? window.innerHeight : host.clientHeight;
    const ctx = cv.getContext && cv.getContext('2d');
    if (!ctx || w < 4 || hgt < 4) { cv.remove(); if (restorePos != null) host.style.position = restorePos; return () => {}; }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = clamp(Math.round((w * hgt) / 1900), 50, 240);
    const fall = clamp(hgt * 0.42, 40, 150); // px/s: crosses the host within the effect
    const mk = (initial) => ({
      x0: Math.random() * w,
      y: initial ? rand(-hgt * 0.6, hgt * 0.85) : rand(-24, -4),
      vy: fall * rand(0.55, 1.35),
      amp: rand(4, 16), fq: rand(0.6, 1.6), ph: rand(0, 6.28),
      r: 0.6 + Math.pow(Math.random(), 2) * 1.7,
      c: pick(DUST), a: rand(0.6, 1), tw: rand(2, 6),
      flake: Math.random() < 0.28, spin: rand(2, 7), rot: rand(0, 6.28),
    });
    const ps = Array.from({ length: count }, () => mk(true));
    const t0 = now();
    let last = t0, id = 0, stopped = false, safety = 0;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      caf(id);
      clearTimeout(safety);
      cv.remove();
      if (restorePos != null) host.style.position = restorePos;
    };
    const frame = () => {
      if (stopped) return;
      const tn = now(), el = tn - t0, dt = Math.min(0.05, (tn - last) / 1000);
      last = tn;
      if (el >= ms || !cv.isConnected) { stop(); return; }
      const fade = Math.min(1, el / 250) * Math.min(1, (ms - el) / 600);
      ctx.clearRect(0, 0, w, hgt);
      const ts = el / 1000;
      for (const p of ps) {
        p.y += p.vy * dt;
        if (p.y > hgt + 6) { if (el < ms - 900) Object.assign(p, mk(false)); else continue; }
        const x = p.x0 + Math.sin(ts * p.fq + p.ph) * p.amp;
        const tw = 0.6 + 0.4 * Math.sin(ts * p.tw + p.ph);
        ctx.globalAlpha = p.a * tw * fade;
        ctx.fillStyle = p.c;
        if (p.flake) {
          const sz = p.r * 1.6;
          ctx.save();
          ctx.translate(x, p.y);
          ctx.rotate(p.rot + ts * 0.8);
          ctx.scale(Math.cos(ts * p.spin + p.ph), 1);
          ctx.fillRect(-sz, -sz * 0.5, sz * 2, sz);
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(x, p.y, p.r, 0, 6.2832);
          ctx.fill();
          if (p.r > 1.45 && tw > 0.95) { // tiny glint
            ctx.globalAlpha = 0.5 * fade;
            ctx.fillStyle = '#FFF6DA';
            ctx.fillRect(x - p.r * 2.2, p.y - 0.3, p.r * 4.4, 0.6);
            ctx.fillRect(x - 0.3, p.y - p.r * 2.2, 0.6, p.r * 4.4);
          }
        }
      }
      ctx.globalAlpha = 1;
      id = raf(frame);
    };
    id = raf(frame);
    safety = setTimeout(stop, ms + 120); // also ends if frames are throttled
    return stop;
  }


  /* =========================================================== spotlight */
  let spot = null;
  function ensureVisible(el) {
    const r = el.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth) return;
    try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }); } catch (e) { el.scrollIntoView(); }
  }
  function placeSpot(s) {
    const vw = window.innerWidth, vh = window.innerHeight;
    let hx, hy, hw, hh, has = false;
    if (s.target && s.target.isConnected) {
      const r = s.target.getBoundingClientRect();
      if (r.width || r.height) { has = true; hx = r.left - 8; hy = r.top - 8; hw = r.width + 16; hh = r.height + 16; }
    }
    if (!has) { hx = vw / 2; hy = vh / 2; hw = 0; hh = 0; }
    const cw = s.card.offsetWidth, ch = s.card.offsetHeight;
    const key = [hx, hy, hw, hh, vw, vh, cw, ch].map((v) => Math.round(v)).join(',');
    if (key === s.key) return;
    s.key = key;
    const hs = s.hole.style;
    hs.left = hx + 'px'; hs.top = hy + 'px'; hs.width = hw + 'px'; hs.height = hh + 'px';
    s.hole.classList.toggle('is-empty', !has);
    const M = 12, G = 14;
    let cx, cy;
    if (!has) { cx = (vw - cw) / 2; cy = (vh - ch) / 2; }
    else {
      cx = clamp(hx + hw / 2 - cw / 2, M, Math.max(M, vw - cw - M));
      if (hy + hh + G + ch <= vh - M) cy = hy + hh + G;
      else if (hy - G - ch >= M) cy = hy - G - ch;
      else if (hx + hw + G + cw <= vw - M) { cx = hx + hw + G; cy = clamp(hy + hh / 2 - ch / 2, M, vh - ch - M); }
      else if (hx - G - cw >= M) { cx = hx - G - cw; cy = clamp(hy + hh / 2 - ch / 2, M, vh - ch - M); }
      else cy = vh - ch - M;
      cy = clamp(cy, M, Math.max(M, vh - ch - M)); // target off-screen: keep the card visible
    }
    s.card.style.left = Math.round(cx) + 'px';
    s.card.style.top = Math.round(cy) + 'px';
  }
  function buildSpot() {
    const s = { prevFocus: document.activeElement, target: undefined, key: '', resolve: null };
    s.root = h('div', 'fx-spot');
    s.root.setAttribute('role', 'dialog');
    s.root.setAttribute('aria-modal', 'true');
    s.root.setAttribute('aria-label', '導覽');
    s.hole = h('div', 'fx-spot-hole');
    s.card = h('div', 'fx-card fx-spot-card');
    s.text = h('div', 'fx-spot-text');
    s.text.id = uid('fx-st');
    s.root.setAttribute('aria-describedby', s.text.id);
    const foot = h('div', 'fx-spot-foot');
    s.dots = h('div', 'fx-spot-dots');
    s.dots.setAttribute('role', 'img');
    const btns = h('div', 'fx-spot-btns');
    s.skip = h('button', 'fx-btn fx-btn-quiet', '略過');
    s.next = h('button', 'fx-btn fx-btn-primary', '下一步');
    s.skip.type = s.next.type = 'button';
    btns.append(s.skip, s.next);
    foot.append(s.dots, btns);
    s.card.append(s.text, foot);
    s.root.append(s.hole, s.card);
    document.body.appendChild(s.root);
    s.skip.addEventListener('click', () => doneSpot(s, 'skip'));
    s.next.addEventListener('click', () => doneSpot(s, 'next'));
    s.root.addEventListener('pointerdown', (e) => {
      if (s.card.contains(e.target)) return;
      e.preventDefault();
      if (!reduced()) animate(s.card, [{ translate: '0 0' }, { translate: '0 -4px' }, { translate: '0 0' }], { duration: 260, easing: EASE });
    });
    s.onKey = (e) => {
      if (spot !== s || s.closing) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); doneSpot(s, 'skip'); }
      else if (e.key === 'Tab') { trapTab(e, s.card, s.next); e.stopPropagation(); }
    };
    document.addEventListener('keydown', s.onKey, true);
    const tick = () => { if (s.dead) return; placeSpot(s); s.raf = raf(tick); };
    s.raf = raf(tick);
    return s;
  }
  // 第 4 版（11-08）：外面要收掉導覽（例如換到標題畫面）。正在等的那一步拿到 r（預設 'skip'）
  export function spotlightEnd(r) {
    if (!spot) return;
    if (spot.resolve) doneSpot(spot, r || 'skip');
    else closeSpot(spot);
  }
  function doneSpot(s, r) {
    if (!s.resolve) return;
    const res = s.resolve;
    s.resolve = null;
    s.removeT = setTimeout(() => closeSpot(s), 140); // a following step within 140ms reuses the layer
    res(r);
  }
  function closeSpot(s) {
    if (s.closing || s.dead) return;
    s.closing = true;
    s.root.classList.remove('is-open');
    s.root.classList.add('is-closing');
    setTimeout(() => killSpot(s), reduced() ? 120 : 240);
  }
  function killSpot(s) {
    if (s.dead) return;
    s.dead = true;
    caf(s.raf);
    clearTimeout(s.removeT); clearTimeout(s.moveT);
    document.removeEventListener('keydown', s.onKey, true);
    s.root.remove();
    if (spot === s) spot = null;
    const pf = s.prevFocus;
    if (pf && pf.isConnected && pf !== document.body) focusNoScroll(pf);
  }
  export function spotlight(target, o = {}) {
    if (!hasDOM()) return Promise.resolve('skip');
    return new Promise((resolve) => {
      if (spot && (spot.closing || spot.dead)) killSpot(spot);
      if (spot && spot.resolve) { const r = spot.resolve; spot.resolve = null; r('skip'); } // superseded
      const fresh = !spot;
      if (fresh) spot = buildSpot();
      const s = spot;
      clearTimeout(s.removeT);
      s.resolve = resolve;
      markRM(s.root);
      const step = Math.max(1, (o.step | 0) || 1);
      const total = Math.max(step, (o.total | 0) || 1);
      s.text.textContent = '';
      if (o.text && o.text.nodeType) s.text.appendChild(o.text);
      else s.text.textContent = o.text == null ? '' : String(o.text);
      s.dots.textContent = '';
      for (let i = 1; i <= total; i++) s.dots.appendChild(h('span', 'fx-spot-dot' + (i === step ? ' is-on' : '')));
      s.dots.setAttribute('aria-label', '第 ' + step + ' 步，共 ' + total + ' 步');
      s.dots.style.display = total > 1 ? '' : 'none';
      s.next.textContent = step >= total ? '開始' : '下一步';
      const tgt = target && target.nodeType === 1 && target.isConnected ? target : null;
      const changed = s.target !== tgt;
      s.target = tgt;
      if (!fresh && changed && !reduced()) {
        s.hole.classList.add('is-moving');
        clearTimeout(s.moveT);
        s.moveT = setTimeout(() => s.hole.classList.remove('is-moving'), 420);
      }
      if (!fresh) { // restart the card's entrance
        s.card.style.transition = 'none';
        s.card.classList.remove('is-in');
        void s.card.offsetWidth;
        s.card.style.transition = '';
      }
      if (tgt) ensureVisible(tgt);
      s.key = '';
      placeSpot(s);
      if (fresh) void s.root.offsetWidth;
      s.root.classList.add('is-open');
      raf(() => { if (!s.dead) s.card.classList.add('is-in'); });
      focusNoScroll(s.next);
    });
  }


  /* =============================================================== press */
  export function press(el) {
    if (!el || !el.classList) return () => {};
    el.classList.add('fx-press');
    const down = (e) => { if (e.pointerType === 'mouse' && e.button !== 0) return; el.classList.add('is-pressed'); };
    const up = () => el.classList.remove('is-pressed');
    el.addEventListener('pointerdown', down);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => el.addEventListener(t, up));
    return () => {
      el.removeEventListener('pointerdown', down);
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => el.removeEventListener(t, up));
      el.classList.remove('fx-press', 'is-pressed');
    };
  }
