/* =============================================================================
   fx.js - 佩佩博物館 2 進階版 - interaction & effects toolkit
   -----------------------------------------------------------------------------
   Exactly one global: FX.  Plain ES2020, no imports, no network, no assets.
   Nothing here touches document/window at load time (safe to load in Node);
   every DOM / Web Audio access happens inside functions.
   Settings are read at call time from FX.settings and body.reduce-motion.
   ========================================================================== */
export const FX = (() => {
  'use strict';

  const api = {};

  /* =========================================================== utilities */
  const hasDOM = () => typeof document !== 'undefined' && !!document.body;
  const reduced = () => {
    const s = api.settings || {};
    return !!s.reduceMotion || (hasDOM() && document.body.classList.contains('reduce-motion'));
  };
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const easeOut3 = (u) => 1 - Math.pow(1 - u, 3);
  const EASE = 'cubic-bezier(.2,.7,.2,1)';
  const hasRAF = () => typeof requestAnimationFrame === 'function';
  const raf = (cb) => (hasRAF() ? requestAnimationFrame(cb) : setTimeout(() => cb(now()), 16));
  const caf = (id) => { if (!id) return; if (hasRAF()) cancelAnimationFrame(id); else clearTimeout(id); };
  let uidN = 0;
  const uid = (p) => p + '-' + (++uidN);
  const toneOf = (t) => (t === 'good' || t === 'bad' ? t : 'neutral');

  function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function markRM(el) { if (el && el.classList) el.classList.toggle('fx-rm', reduced()); return el; }
  function animate(el, frames, opts) {
    try { if (el && el.animate) return el.animate(frames, opts); } catch (e) { /* ignore */ }
    return null;
  }
  // run cb once when the animation ends (or after a safety timeout)
  function afterAnim(a, ms, cb) {
    let done = false;
    const go = () => { if (!done) { done = true; cb(); } };
    if (a) { a.onfinish = go; a.oncancel = go; }
    setTimeout(go, ms + 80);
  }
  function focusNoScroll(el) {
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
  function trapTab(e, root, fallback) {
    const list = focusables(root);
    if (!list.length) { e.preventDefault(); focusNoScroll(fallback); return; }
    const first = list[0], last = list[list.length - 1], a = document.activeElement;
    const inside = root.contains(a) && a !== root;
    if (e.shiftKey) {
      if (!inside || a === first) { e.preventDefault(); focusNoScroll(last); }
    } else if (!inside || a === last) { e.preventDefault(); focusNoScroll(first); }
  }

  /* =============================================================== SOUND */
  // 全部即時合成（Web Audio），沒有音效檔。三條音軌：sfx 效果音、amb 環境音、heart 心跳與耳鳴（翊文 11-08：三組都做）
  const sound = (() => {
    let ac = null, out = null, bus = null, nbuf = null, dead = false, unlocked = false;
    let whisperN = 2; // 低語要疊幾個聲音（畫面那邊照理智設定，setWhisperLayers）
    const last = Object.create(null);
    const vol = { sfx: 1, amb: 1, heart: 1 };
    const MASTER = 0.55;

    function chain(c) {
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -22; comp.knee.value = 16; comp.ratio.value = 3;
      comp.attack.value = 0.003; comp.release.value = 0.25;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 9000; lp.Q.value = 0.5;
      const o = c.createGain(); o.gain.value = MASTER;
      o.connect(lp); lp.connect(comp); comp.connect(c.destination);
      const b = {};
      ['sfx', 'amb', 'heart'].forEach((k) => { b[k] = c.createGain(); b[k].gain.value = vol[k]; b[k].connect(o); });
      return { o, b };
    }
    function ctx() {
      if (dead) return null;
      if (!ac) {
        const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
        if (!AC) { dead = true; return null; }
        try { ac = new AC(); const ch = chain(ac); out = ch.o; bus = ch.b; } catch (e) { dead = true; ac = null; return null; }
      }
      if (ac.state === 'suspended' && ac.resume) {
        try { const p = ac.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
      }
      return ac;
    }
    function noiseBuf() {
      if (nbuf) return nbuf;
      const len = Math.floor(ac.sampleRate * 1.5);
      nbuf = ac.createBuffer(1, len, ac.sampleRate);
      const d = nbuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return nbuf;
    }
    function env(p, t, a, peak, d) {
      p.setValueAtTime(0.0001, t);
      p.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
      p.exponentialRampToValueAtTime(0.0001, t + a + d);
    }
    // o: { type, f, f2, glide, g (peak gain), a (attack), d (decay), to (output node) }
    function tone(t, o) {
      const osc = ac.createOscillator();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.f, t);
      if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide || o.d));
      const g = ac.createGain(), a = o.a || 0.004;
      env(g.gain, t, a, o.g, o.d);
      osc.connect(g); g.connect(o.to || bus.sfx);
      osc.start(t); osc.stop(t + a + o.d + 0.05);
    }
    // oscillator through a lowpass that opens up (brass-like). o: tone options + { lp, lp2, lpGlide, q }
    function tonef(t, o) {
      const osc = ac.createOscillator();
      osc.type = o.type || 'sawtooth';
      osc.frequency.setValueAtTime(o.f, t);
      if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide || o.d));
      const f = ac.createBiquadFilter();
      f.type = 'lowpass'; f.Q.value = o.q || 0.8;
      f.frequency.setValueAtTime(o.lp || 1200, t);
      if (o.lp2) f.frequency.exponentialRampToValueAtTime(o.lp2, t + (o.lpGlide || 0.1));
      const g = ac.createGain(), a = o.a || 0.004;
      env(g.gain, t, a, o.g, o.d);
      osc.connect(f); f.connect(g); g.connect(o.to || bus.sfx);
      osc.start(t); osc.stop(t + a + o.d + 0.05);
    }
    // a wobbling pitch (for mutations). o: { f, depth, rate, g, d }
    function warble(t, o) {
      const osc = ac.createOscillator();
      osc.type = 'triangle';
      const n = 96, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) curve[i] = o.f * (1 + o.depth * Math.sin((i / (n - 1)) * o.d * o.rate * Math.PI * 2));
      osc.frequency.setValueCurveAtTime(curve, t, o.d);
      const g = ac.createGain();
      env(g.gain, t, 0.02, o.g, o.d);
      osc.connect(g); g.connect(o.to || bus.sfx);
      osc.start(t); osc.stop(t + o.d + 0.1);
    }
    // filtered noise burst. o: { type, f, f2, glide, q, g, a, d, to }
    function noise(t, o) {
      const src = ac.createBufferSource();
      src.buffer = noiseBuf(); src.loop = true;
      const f = ac.createBiquadFilter();
      f.type = o.type || 'bandpass';
      f.frequency.setValueAtTime(o.f, t);
      if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide || o.d));
      f.Q.value = o.q != null ? o.q : 1;
      const g = ac.createGain(), a = o.a || 0.003;
      env(g.gain, t, a, o.g, o.d);
      src.connect(f); f.connect(g); g.connect(o.to || bus.sfx);
      src.start(t, Math.random()); src.stop(t + a + o.d + 0.05);
    }

    const R = {
      click(t) {
        noise(t, { type: 'bandpass', f: 3600, q: 2.5, g: 0.16, a: 0.001, d: 0.022 });
        tone(t, { type: 'triangle', f: 2100, g: 0.035, a: 0.001, d: 0.025 });
      },
      flip(t) {
        noise(t, { type: 'bandpass', f: 1400, f2: 4200, q: 0.8, g: 0.12, a: 0.05, d: 0.2 });
        noise(t + 0.14, { type: 'highpass', f: 2600, q: 0.7, g: 0.05, a: 0.01, d: 0.09 });
      },
      unlock(t) {
        tone(t, { f: 659.25, g: 0.09, a: 0.012, d: 0.24 });
        tone(t, { f: 1318.5, g: 0.015, a: 0.012, d: 0.16 });
        tone(t + 0.11, { f: 987.77, g: 0.09, a: 0.012, d: 0.42 });
        tone(t + 0.11, { f: 1975.5, g: 0.014, a: 0.012, d: 0.25 });
      },
      submit(t) {
        tone(t, { f: 150, f2: 62, glide: 0.14, g: 0.28, a: 0.004, d: 0.2 });
        noise(t, { type: 'lowpass', f: 900, f2: 300, q: 0.6, g: 0.14, a: 0.002, d: 0.08 });
      },
      stamp(t) {
        noise(t, { type: 'highpass', f: 2400, q: 0.7, g: 0.05, a: 0.001, d: 0.012 });
        noise(t + 0.004, { type: 'lowpass', f: 1500, f2: 260, q: 0.8, g: 0.22, a: 0.002, d: 0.11 });
        tone(t + 0.004, { f: 118, f2: 46, glide: 0.16, g: 0.32, a: 0.003, d: 0.22 });
      },
      bell(t) {
        const f0 = 392; // G4 - partials of a struck bell, upper ones die first
        [[0.5, 0.03, 2.6], [1, 0.11, 2.3], [1.0035, 0.045, 2.0], [2, 0.04, 1.5], [2.76, 0.03, 1.05],
          [3.02, 0.018, 0.9], [5.4, 0.011, 0.55], [8.93, 0.005, 0.32]]
          .forEach(([r, g, d]) => tone(t, { f: f0 * r, g, d, a: 0.004 }));
        noise(t, { type: 'bandpass', f: 3200, q: 1.2, g: 0.025, a: 0.001, d: 0.03 });
      },
      dice(t) {
        let tt = t;
        const n = 7 + ((Math.random() * 3) | 0);
        for (let i = 0; i < n; i++) {
          const k = 1 - i / (n + 2);
          noise(tt, { type: 'bandpass', f: rand(1700, 4200), q: rand(3.5, 7), g: 0.2 * k, a: 0.001, d: rand(0.016, 0.032) });
          tone(tt, { type: 'triangle', f: rand(650, 1300), g: 0.022 * k, a: 0.001, d: 0.022 });
          tt += rand(0.026, 0.06) * (1 + i * 0.14);
        }
      },
      hug(t) {
        noise(t, { type: 'lowpass', f: 900, f2: 240, q: 0.6, g: 0.22, a: 0.035, d: 0.32 });
        tone(t, { f: 190, f2: 120, g: 0.04, a: 0.03, d: 0.2 });
      },
      error(t) {
        tone(t, { f: 233, f2: 196, glide: 0.16, g: 0.11, a: 0.012, d: 0.2 });
        tone(t, { f: 466, f2: 392, glide: 0.16, g: 0.015, a: 0.012, d: 0.14 });
      },
      whoosh(t) {
        noise(t, { type: 'bandpass', f: 320, f2: 1700, glide: 0.24, q: 0.9, g: 0.13, a: 0.13, d: 0.3 });
      },
      coin(t) {
        tone(t, { f: 1567.98, g: 0.05, a: 0.003, d: 0.28 });
        tone(t + 0.075, { f: 2093, g: 0.045, a: 0.003, d: 0.5 });
        tone(t + 0.075, { f: 4186, g: 0.006, a: 0.003, d: 0.2 });
      },
      // k: loudness (1 = the old single heartbeat), to: output (the heart track for the loop)
      heartbeat(t, k, to) {
        const s = k || 1;
        const beat = (tt, g) => {
          tone(tt, { f: 68, f2: 42, glide: 0.14, g, a: 0.008, d: 0.17, to });
          tone(tt, { f: 136, f2: 84, glide: 0.1, g: g * 0.18, a: 0.008, d: 0.09, to });
          noise(tt, { type: 'lowpass', f: 220, q: 0.7, g: g * 0.3, a: 0.006, d: 0.07, to });
        };
        beat(t, 0.42 * s); beat(t + 0.27, 0.3 * s);
      },

      // ---------- 理智 ----------
      sanPre(t) { // 擲理智檢定前：一聲低音「咚」
        tone(t, { f: 96, f2: 48, glide: 0.3, g: 0.34, a: 0.006, d: 0.42 });
        noise(t, { type: 'lowpass', f: 260, q: 0.7, g: 0.12, a: 0.004, d: 0.12 });
      },
      sanOk(t) { // 成功：放鬆的吐氣
        noise(t, { type: 'bandpass', f: 1300, f2: 380, glide: 0.6, q: 0.7, g: 0.11, a: 0.12, d: 0.6 });
        tone(t + 0.05, { f: 392, g: 0.03, a: 0.08, d: 0.6 });
        tone(t + 0.05, { f: 493.88, g: 0.025, a: 0.08, d: 0.6 });
      },
      sanBad(t) { // 失敗：兩個不和諧的音
        tone(t, { type: 'triangle', f: 311.13, f2: 293.66, glide: 0.7, g: 0.09, a: 0.01, d: 0.7 });
        tone(t, { type: 'triangle', f: 329.63, f2: 311.13, glide: 0.7, g: 0.08, a: 0.01, d: 0.7 });
        tone(t, { f: 155.56, g: 0.06, a: 0.01, d: 0.5 });
      },
      sanDrop(t, n) { // 扣理智：往下滑的低沉嗡鳴；掉越多越長，5 點以上加不和諧的泛音和低頻轟鳴
        n = Math.max(1, Math.min(+n || 1, 12));
        const big = n >= 5, len = 0.38 + Math.min(n, 10) * 0.09, f0 = big ? 180 : 230;
        tone(t, { type: 'triangle', f: f0, f2: f0 * 0.38, glide: len, g: 0.16, a: 0.02, d: len });
        tone(t, { f: f0 / 2, f2: f0 * 0.19, glide: len, g: 0.2, a: 0.02, d: len });
        if (big) {
          tone(t, { type: 'sawtooth', f: f0 * 1.414, f2: f0 * 0.5, glide: len, g: 0.035, a: 0.03, d: len });
          noise(t, { type: 'lowpass', f: 420, f2: 90, glide: len, q: 1.5, g: 0.16, a: 0.05, d: len });
        }
      },
      sanUp(t) { // 理智回升：溫暖的上行音
        [[392, 0], [493.88, 0.08], [587.33, 0.16]].forEach(([f, dt]) => {
          tone(t + dt, { f, g: 0.06, a: 0.03, d: 0.55 });
          tone(t + dt, { f: f * 2, g: 0.008, a: 0.03, d: 0.3 });
        });
      },
      moodUp(t) {
        tone(t, { type: 'triangle', f: 783.99, g: 0.05, a: 0.005, d: 0.12 });
        tone(t + 0.07, { type: 'triangle', f: 1046.5, g: 0.05, a: 0.005, d: 0.2 });
      },
      moodDown(t) {
        tone(t, { type: 'triangle', f: 659.25, g: 0.045, a: 0.005, d: 0.12 });
        tone(t + 0.08, { type: 'triangle', f: 493.88, g: 0.045, a: 0.005, d: 0.24 });
      },
      lightsOut(t) { // 理智歸零：燈熄的「啪」，電的嗡嗡聲慢慢沒了
        noise(t, { type: 'highpass', f: 2500, q: 0.8, g: 0.3, a: 0.001, d: 0.02 });
        noise(t + 0.006, { type: 'bandpass', f: 900, q: 1.2, g: 0.2, a: 0.001, d: 0.05 });
        tone(t + 0.01, { f: 70, f2: 35, glide: 0.4, g: 0.3, a: 0.004, d: 0.45 });
        [60, 120, 180].forEach((f, i) => tone(t, { type: 'sawtooth', f, f2: f * 0.7, glide: 1.4, g: 0.02 / (i + 1), a: 0.002, d: 1.4 }));
      },

      // ---------- 稀有度揭曉 ----------
      revCommon(t) {
        tone(t, { f: 1046.5, g: 0.07, a: 0.003, d: 0.5 });
        tone(t, { f: 2093, g: 0.01, a: 0.003, d: 0.25 });
      },
      revRare(t) {
        [[1046.5, 0], [1318.5, 0.11]].forEach(([f, dt]) => {
          tone(t + dt, { f, g: 0.07, a: 0.003, d: 0.6 });
          tone(t + dt, { f: f * 2, g: 0.01, a: 0.003, d: 0.3 });
        });
      },
      revSuper(t) {
        [[1046.5, 0], [1318.5, 0.09], [1567.98, 0.18], [2093, 0.27]].forEach(([f, dt]) => tone(t + dt, { f, g: 0.065, a: 0.003, d: 0.7 }));
        noise(t + 0.27, { type: 'highpass', f: 6000, q: 0.5, g: 0.03, a: 0.2, d: 0.6 });
      },
      revLegend(t) { // 一小段號角＋鐘聲＋閃亮
        const brass = (tt, f, d, g) => {
          tonef(tt, { type: 'sawtooth', f, g, a: 0.04, d, lp: 900, lp2: 2600, lpGlide: 0.12 });
          tonef(tt, { type: 'sawtooth', f: f * 1.005, g: g * 0.6, a: 0.04, d, lp: 900, lp2: 2400, lpGlide: 0.12 });
        };
        brass(t, 392, 0.18, 0.06); brass(t + 0.17, 523.25, 0.18, 0.06);
        brass(t + 0.34, 659.25, 0.9, 0.07); brass(t + 0.34, 783.99, 0.9, 0.05);
        R.bell(t + 0.34);
        noise(t + 0.34, { type: 'highpass', f: 7000, q: 0.5, g: 0.035, a: 0.3, d: 1.0 });
      },
      revFailed(t) { // 失敗作：洩氣的「噗」
        noise(t, { type: 'lowpass', f: 500, f2: 120, glide: 0.25, q: 2, g: 0.25, a: 0.01, d: 0.3 });
        tone(t, { type: 'triangle', f: 196, f2: 92, glide: 0.3, g: 0.08, a: 0.01, d: 0.35 });
      },
      crit01(t) { // 擲出 01：一串往上的亮音＋鐘聲
        [2093, 2637, 3136, 4186, 5274].forEach((f, i) => tone(t + i * 0.045, { f, g: 0.04, a: 0.002, d: 0.4 }));
        R.bell(t + 0.2);
      },
      fumble100(t) { // 擲出 100：往下滑的「哇、哇、哇——」
        [[233.08, 0], [220, 0.32], [207.65, 0.64]].forEach(([f, dt]) => tonef(t + dt, { type: 'sawtooth', f, f2: f * 0.97, g: 0.06, a: 0.03, d: 0.26, lp: 700, lp2: 1500, lpGlide: 0.1 }));
        tonef(t + 0.96, { type: 'sawtooth', f: 196, f2: 185, glide: 0.8, g: 0.06, a: 0.03, d: 0.9, lp: 650, lp2: 1300, lpGlide: 0.4 });
      },

      // ---------- 地下收藏庫 ----------
      drum(t) { // 強度檢定：三下越來越重的鼓
        [[0, 98, 0.5], [0.16, 110, 0.55], [0.32, 131, 0.7]].forEach(([dt, f, k]) => {
          tone(t + dt, { f: f * 1.6, f2: f, glide: 0.08, g: 0.3 * k, a: 0.003, d: 0.22 });
          noise(t + dt, { type: 'bandpass', f: 600, q: 0.9, g: 0.12 * k, a: 0.002, d: 0.06 });
        });
      },
      hurt(t) { // 受傷：悶悶的「咚」
        tone(t, { f: 92, f2: 38, glide: 0.25, g: 0.38, a: 0.003, d: 0.3 });
        noise(t, { type: 'lowpass', f: 300, q: 0.8, g: 0.2, a: 0.002, d: 0.14 });
      },
      block(t) { // 擋下來：清脆的金屬聲
        [1780, 2650, 3910].forEach((f, i) => tone(t, { f, g: 0.05 / (i + 1), a: 0.001, d: 0.35 - i * 0.08 }));
        noise(t, { type: 'highpass', f: 3500, q: 0.7, g: 0.12, a: 0.001, d: 0.03 });
      },
      fanfare(t) { // 整層走完：短號角
        const b = (tt, f, d) => tonef(tt, { type: 'sawtooth', f, g: 0.05, a: 0.03, d, lp: 1000, lp2: 2400, lpGlide: 0.1 });
        b(t, 523.25, 0.13); b(t + 0.13, 523.25, 0.13); b(t + 0.26, 659.25, 0.13);
        b(t + 0.39, 783.99, 0.7); b(t + 0.39, 1046.5, 0.7);
      },

      // ---------- 融合 ----------
      fuse(t) { // 融合：低低地湧起，一串往上的全音階亮音，最後一聲帶點不安的玻璃鐘
        tone(t, { f: 55, f2: 110, glide: 1.2, g: 0.12, a: 0.5, d: 1.0 });
        tone(t, { type: 'triangle', f: 82.4, f2: 164.8, glide: 1.2, g: 0.05, a: 0.5, d: 1.0 });
        [523.25, 587.33, 659.25, 739.99, 830.61, 932.33].forEach((f, i) => tone(t + 0.25 + i * 0.1, { f, g: 0.03, a: 0.01, d: 0.9 }));
        noise(t, { type: 'bandpass', f: 400, f2: 3000, glide: 1.1, q: 3, g: 0.05, a: 0.6, d: 0.6 });
        [[440, 0.06, 2.0], [622.25, 0.035, 1.8], [1214, 0.012, 1.0], [1717, 0.008, 0.7]].forEach(([f, g, d]) => tone(t + 1.0, { f, g, a: 0.005, d }));
      },
      mutate(t) { // 突變：怪怪的、抖動的音
        warble(t, { f: 620, depth: 0.18, rate: 9, g: 0.06, d: 0.6 });
        warble(t + 0.05, { f: 930, depth: 0.22, rate: 13, g: 0.03, d: 0.5 });
      },
      // ---------- 看到奇怪的東西：神秘的聲音（5 種，k 不給就隨機） ----------
      eerie(t, k) {
        const v = k == null ? (Math.random() * 5) | 0 : k % 5;
        if (v === 0) { // 倒著響的鐘：慢慢湧起，突然停住
          [[392, 0.05], [1082, 0.02], [2117, 0.01], [196, 0.04]].forEach(([f, g]) => tone(t, { f, g, a: 1.0, d: 0.08 }));
          noise(t + 0.3, { type: 'highpass', f: 4000, q: 0.6, g: 0.02, a: 0.7, d: 0.1 });
        } else if (v === 1) { // 玻璃顫音：兩個很接近的高音互相拍打
          tone(t, { f: 1661, g: 0.025, a: 0.3, d: 1.8 });
          tone(t, { f: 1700, g: 0.022, a: 0.35, d: 1.7 });
          warble(t + 0.2, { f: 2489, depth: 0.01, rate: 6, g: 0.01, d: 1.4 });
        } else if (v === 2) { // 低語＋低鳴
          R.whisper(t);
          tone(t, { f: 73.4, f2: 69.3, glide: 1.6, g: 0.07, a: 0.6, d: 1.2 });
        } else if (v === 3) { // 遠處的門：嘎——一聲，再悶悶地關上
          tonef(t, { type: 'sawtooth', f: 92, f2: 71, glide: 1.0, g: 0.04, a: 0.08, d: 1.0, lp: 500, q: 6 });
          warble(t, { f: 300, depth: 0.08, rate: 18, g: 0.012, d: 0.9 });
          tone(t + 1.05, { f: 70, f2: 40, glide: 0.2, g: 0.16, a: 0.004, d: 0.3 });
          noise(t + 1.05, { type: 'lowpass', f: 400, q: 0.8, g: 0.08, a: 0.002, d: 0.12 });
        } else { // 不和諧的和弦：三全音慢慢冒出來
          tone(t, { f: 220, g: 0.04, a: 0.4, d: 1.5 });
          tone(t, { f: 311.13, g: 0.035, a: 0.5, d: 1.4 });
          tone(t + 0.15, { f: 466.16, g: 0.015, a: 0.5, d: 1.2 });
          noise(t, { type: 'bandpass', f: 300, f2: 1200, glide: 1.4, q: 5, g: 0.025, a: 0.6, d: 0.9 });
        }
      },
      // ---------- 互動珍品（點佩佩、帽子、背景、手上的東西） ----------
      // 有人在背後低語（翊文 11-08：太小聲 → 不像人 → 要神秘 → 要像在背後 → 「還是高音的音效，不像人聲的低語」）
      // - 照人說話的方式做：聲源是「氣聲＋壹點點低沉人聲（約 100 Hz，句尾往下掉）」，經過三個嘴型共鳴，母音之間滑過去
      //   人聲比例只能壹點點（0.035）：給到 0.16 時翊文說「變得有點像吼叫」
      // - 共鳴要寬（Q 4–9）：太窄會變成高高的口哨音（舊版的問題）；整體低通 3.6 kHz，嘶、噓改小、改低
      // - 在背後：HRTF 立體聲方位放在左後方或右後方，說話時慢慢繞到正後方（戴耳機最明顯）
      // - 細節：開口前吸壹口氣、講完吐壹口氣；另壹側後方有壹個更低沉、慢半拍的聲音跟著說；底下壹層極輕的低音
      whisper(t, layers) {
        const N = Math.max(2, Math.min(8, Math.round(layers || whisperN))); // 幾個聲音疊在壹起（理智越低越多）
        // 女聲（翊文 11-08：「低語能不能改成像是女生音頻的低語」）：嘴型共鳴比男聲高約兩成
        const VOW = [[850, 1220, 2810], [310, 2790, 3310], [370, 950, 2670], [560, 2320, 2950], [540, 920, 2680], [690, 1600, 2800]]; // 啊 咿 嗚 欸 喔 唉
        const CONS = ['s', 'sh', 't', 'h', 'k', '', 'h', 'm'];
        const side = Math.random() < 0.5 ? -1 : 1;
        const place = (x, z, x2, z2, dur) => { // listener 面向 -z，所以 z > 0 是背後
          if (!ac.createPanner) { const sp = ac.createStereoPanner ? ac.createStereoPanner() : null; if (sp) { sp.pan.value = x; sp.connect(bus.sfx); return sp; } return bus.sfx; }
          const pn = ac.createPanner();
          pn.panningModel = 'HRTF'; pn.distanceModel = 'inverse'; pn.refDistance = 1; pn.rolloffFactor = 1;
          if (pn.positionX) { pn.positionX.setValueAtTime(x, t); pn.positionZ.setValueAtTime(z, t); pn.positionY.setValueAtTime(0.05, t); pn.positionX.linearRampToValueAtTime(x2, t + dur); pn.positionZ.linearRampToValueAtTime(z2, t + dur); }
          else pn.setPosition(x, 0.05, z);
          pn.connect(bus.sfx);
          return pn;
        };
        // 壹個人要說的話：兩句，第二句短壹點；每句的音高往下掉。rate ＞ 1 說得慢、＜ 1 說得快
        // 每個音節的氣音 0.26–0.42 秒（翊文 11-08：「每壹段的氣音還是太短了」；原本 0.11–0.2 秒）
        const makePlan = (start, rate, nA, nB) => {
          const syl = [];
          let at = start;
          const phrase = (n, base) => {
            for (let i = 0; i < n; i++) {
              const c = CONS[(Math.random() * CONS.length) | 0], cd = c ? (c === 't' || c === 'k' ? 0.04 : 0.09) : 0, d = rand(0.26, 0.42) * rate * (i === n - 1 ? 1.6 : 1);
              syl.push({ at, cd, v: VOW[(Math.random() * VOW.length) | 0], c, d, k: base * rand(0.75, 1.05) * (i % 3 === 0 ? 1.15 : 1), p: 1.08 - 0.2 * i / Math.max(1, n - 1) });
              at += cd + d + rand(0.03, 0.08) * rate;
            }
          };
          phrase(nA, 1); if (nB) { at += rand(0.35, 0.55) * rate; phrase(nB, 0.85); }
          return { syl, at };
        };
        const main = makePlan(0.45, 1, 4 + ((Math.random() * 3) | 0), 2 + ((Math.random() * 3) | 0)); // 0.45 秒：先吸壹口氣
        const dur = main.at + 0.5;
        const near = place(0.55 * side, 0.45, 0.12 * side, 0.6, dur);   // 左後方（或右後方）慢慢繞到正後方
        const far = place(-0.6 * side, 0.7, -0.3 * side, 0.8, dur);    // 另壹側後方
        // 壹個說話的人：氣聲＋壹點點人聲 → 三個嘴型共鳴 → 音量包絡 → 低通 → 方位。bright：氣聲有多亮（Hz）
        // mel：每個音節的音高照這串倍數走（像哼著調子），沒有就是壹般說話（句尾往下掉）
        const speak = (t0, fs, pitch, voiced, gk, to, pl, bright = 4500, mel = null) => {
          const c = ac, end = t0 + pl.at + 0.4;
          const src = c.createBufferSource(); src.buffer = noiseBuf(); src.loop = true;
          const blp = c.createBiquadFilter(); blp.type = 'lowpass'; blp.frequency.value = bright;
          const mix = c.createGain();
          src.connect(blp); blp.connect(mix);
          const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(pitch, t0);
          const olp = c.createBiquadFilter(); olp.type = 'lowpass'; olp.frequency.value = 1800;
          const og = c.createGain(); og.gain.value = voiced;
          o.connect(olp); olp.connect(og); og.connect(mix);
          const env = c.createGain(); env.gain.setValueAtTime(0, t0);
          const F = [0, 1, 2].map((n) => { const b = c.createBiquadFilter(); b.type = 'bandpass'; b.Q.value = [4, 7, 9][n]; b.frequency.setValueAtTime(pl.syl[0].v[n] * fs, t0); const g = c.createGain(); g.gain.value = [1, 0.6, 0.28][n]; mix.connect(b); b.connect(g); g.connect(env); return b; });
          const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(4200, bright);
          env.connect(lp); lp.connect(to);
          pl.syl.forEach((x, si) => {
            const tt = t0 + x.at, v0 = tt + x.cd, k = x.k * gk;
            x.v.forEach((f, n) => F[n].frequency.setTargetAtTime(f * fs, tt, 0.035));        // 嘴型慢慢變過去
            o.frequency.setTargetAtTime(mel ? pitch * mel[si % mel.length] : pitch * x.p * rand(0.97, 1.03), tt, mel ? 0.09 : 0.05); // 音高（句尾往下掉；mel 就照調子滑過去）
            if (x.c === 'm') env.gain.setTargetAtTime(0.35 * k, tt, 0.02);                    // 「嗯」：嘴巴閉著先出聲
            env.gain.setTargetAtTime(k, v0, 0.07);                                         // 慢慢出氣，不要衝出來
            env.gain.setTargetAtTime(0.15 * k, v0 + x.d * 0.75, 0.07);                       // 音節之間留壹點氣
            if (x.c === 's') noise(tt, { type: 'bandpass', f: 4300 * fs, q: 2, g: 0.022 * k, a: 0.012, d: 0.06, to });
            else if (x.c === 'sh') noise(tt, { type: 'bandpass', f: 2300 * fs, q: 1.8, g: 0.03 * k, a: 0.014, d: 0.07, to });
            else if (x.c === 't' || x.c === 'k') noise(tt, { type: 'bandpass', f: (x.c === 't' ? 3000 : 1500) * fs, q: 1.2, g: 0.05 * k, a: 0.002, d: 0.018, to });
          });
          env.gain.setTargetAtTime(0, t0 + pl.at - 0.05, 0.06);
          src.start(t0, Math.random()); o.start(t0); src.stop(end); o.stop(end);
        };
        // 哼歌（翊文 11-08：「另壹個女聲聽不出來」「邊說邊哼……還是聽不太到」）：閉著嘴的「嗯——」，有壹點顫音，
        // 慢慢唱壹段小調的搖籃曲（Claude 自己寫的）；每個音之間滑過去，音和音之間輕輕弱下來
        const hum = (t0, to, len) => {
          const c = ac, base = 262 * rand(0.97, 1.03), step = 0.55;
          const TUNE = [1, 1.189, 1.335, 1.189, 1, 0.891, 1, 0.749, 0.891, 1]; // C、降E、F、降E、C、降B、C、G、降B、C
          const o = c.createOscillator(), o2 = c.createOscillator(); o.type = 'triangle'; o2.type = 'sine';
          const g2 = c.createGain(); g2.gain.value = 0.35;
          const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200; lp.Q.value = 0.7;
          const g = c.createGain(); g.gain.setValueAtTime(0, t0);
          const vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = 5.2; vg.gain.value = 3.5;
          vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.detune);
          o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(to);
          const n = Math.max(3, Math.floor(len / step));
          for (let i = 0; i < n; i++) {
            const tt = t0 + i * step, f = base * TUNE[i % TUNE.length];
            o.frequency.setTargetAtTime(f, tt, 0.06); o2.frequency.setTargetAtTime(f * 2, tt, 0.06);
            g.gain.setTargetAtTime(0.021, tt, 0.08); g.gain.setTargetAtTime(0.013, tt + step * 0.7, 0.06); // 0.05 時整個低語大了壹倍、蓋過大家，降到跟主聲音差不多
          }
          g.gain.setTargetAtTime(0, t0 + n * step, 0.25);
          const end = t0 + n * step + 1.2;
          [o, o2, vib].forEach((x) => { x.start(t0); x.stop(end); });
          return n * step;
        };
        noise(t, { type: 'bandpass', f: 600, f2: 1100, glide: 0.38, q: 0.8, g: 0.12, a: 0.34, d: 0.06, to: near }); // 吸氣
        speak(t, 1, 210, 0.035, N > 4 ? 0.42 : 0.5, near, main); // 背後那個；人聲只留壹點點，太多會像吼叫（翊文 11-08）
        speak(t + 0.14, 0.9, 180, 0.05, 0.16, far, main);          // 另壹側更遠、更低沉的那個，跟著說同樣的話（像回聲）
        // 理智越低，越多「別人」加進來（翊文 11-08：疊加要聽得出是不同的聲音）：
        // 每個人說自己的話、自己的快慢，壹個接壹個進來，進來前先吸壹口氣
        const MORE = [ // [嘴型比例, 音高 Hz, 人聲比例, 音量, x, z（> 0 是背後）, 幾秒後進來, 說話快慢, 氣聲亮度, 音高照調子走, 哼歌]
          [1.12, 262, 0.04, 0.3, -0.2, 0.3, 0.4, 1.3, 5000, [1, 1.19, 1.33, 1.12, 0.89, 1], true], // 另壹個女聲：邊說邊哼搖籃曲，很近，就在腦後；第壹個加進來（理智 50 以下）
          [0.76, 115, 0.07, 0.32, -1.0, 0.15, 0.35, 1.2, 3000],  // 沙啞低沉的男聲，貼在左耳
          [1.25, 285, 0.02, 0.27, 1.0, 0.2, 0.7, 0.75, 5600],    // 細細的高音，貼在右耳，說得快
          [0.7, 88, 0.09, 0.3, 0.1, 1.4, 1.0, 1.4, 2600],        // 很低的喃喃，遠遠的正後方，說得慢
          [0.95, 160, 0.05, 0.28, 0.75, 0.85, 1.3, 0.7, 4000],   // 中性的聲音，右後方，說得很急
          [1.32, 320, 0.02, 0.25, -0.35, 0.5, 0.85, 0.85, 6000], // 像小孩，左後方，輕輕的
        ];
        let tail = dur;
        MORE.slice(0, N - 2).forEach(([fs, pch, v, g, x, z, dl, rate, bright, mel, hums]) => {
          const d0 = dl + rand(-0.08, 0.08), pl = makePlan(0.05, rate, 2 + ((Math.random() * 4) | 0), (Math.random() * 3) | 0);
          const to = place(x * side, z, x * side * 0.8, z + 0.2, pl.at + 0.6);
          noise(t + d0 - 0.2, { type: 'bandpass', f: 500 * fs, f2: 1000 * fs, glide: 0.2, q: 0.8, g: 0.05, a: 0.18, d: 0.05, to }); // 這個人也先吸壹口氣
          speak(t + d0, fs, pch * rand(0.97, 1.03), v, g, to, pl, bright, mel);
          const hl = hums ? hum(t + d0 + 0.1, to, Math.max(pl.at, dur - d0)) : 0; // 從開口哼到大家都說完
          tail = Math.max(tail, d0 + pl.at + 0.5, d0 + hl + 0.6);
        });
        noise(t + main.at, { type: 'bandpass', f: 1100, f2: 500, glide: 0.45, q: 0.7, g: 0.14, a: 0.04, d: 0.45, to: near }); // 吐氣
        tone(t + 0.3, { f: 73.42, g: 0.014, a: 0.6, d: tail });
        tone(t + 0.4, { f: 103.83, g: 0.009, a: 0.6, d: tail - 0.2 });
      },
      eyeOpen(t) { // 一隻眼睛睜開：濕濕的小「啵」
        tone(t, { f: 900, f2: 1500, glide: 0.05, g: 0.045, a: 0.002, d: 0.08 });
        noise(t, { type: 'highpass', f: 3000, q: 0.7, g: 0.025, a: 0.001, d: 0.02 });
      },
      squelch(t) { // 觸手縮起來
        noise(t, { type: 'lowpass', f: 650, f2: 180, glide: 0.22, q: 8, g: 0.16, a: 0.01, d: 0.26 });
        warble(t, { f: 140, depth: 0.3, rate: 12, g: 0.05, d: 0.3 });
      },
      hic(t) { // 微醺：打嗝
        tone(t, { type: 'triangle', f: 600, f2: 1250, glide: 0.05, g: 0.07, a: 0.002, d: 0.08 });
        noise(t, { type: 'bandpass', f: 1800, q: 3, g: 0.05, a: 0.001, d: 0.04 });
      },
      choir(t) { // 虔誠：輕輕的「啊——」
        [[220, 0.04], [277.18, 0.032], [329.63, 0.03], [440, 0.018]].forEach(([f, g]) => { tone(t, { f, g, a: 0.4, d: 1.4 }); tone(t, { f: f * 1.004, g: g * 0.6, a: 0.45, d: 1.3 }); });
        noise(t, { type: 'highpass', f: 5000, q: 0.5, g: 0.012, a: 0.4, d: 1.0 });
      },
      shimmer(t) { // 虹彩：一串細碎的亮音
        for (let i = 0; i < 6; i++) tone(t + i * 0.03, { f: rand(2500, 5000), g: 0.015, a: 0.002, d: 0.3 });
      },
      sparkle(t) { // 閃一下
        [2637, 3136, 4186].forEach((f, i) => tone(t + i * 0.05, { f, g: 0.035, a: 0.002, d: 0.35 }));
      },
      puff(t) { // 毛帽的毛球彈一下
        noise(t, { type: 'lowpass', f: 700, f2: 200, q: 0.8, g: 0.1, a: 0.01, d: 0.12 });
        tone(t, { f: 300, f2: 180, glide: 0.1, g: 0.03, a: 0.005, d: 0.1 });
      },
      tip(t) { // 紳士帽：脫帽致意的「叮咚」
        tone(t, { f: 783.99, g: 0.05, a: 0.005, d: 0.3 });
        tone(t + 0.16, { f: 659.25, g: 0.05, a: 0.005, d: 0.45 });
      },
      hey(t) { // 斯拉夫蹲：嘿！
        tonef(t, { type: 'sawtooth', f: 180, f2: 235, glide: 0.08, g: 0.06, a: 0.01, d: 0.16, lp: 1400 });
        noise(t, { type: 'bandpass', f: 1200, q: 2, g: 0.05, a: 0.005, d: 0.1 });
      },
      whoop(t) { // 倒立的翻回來：往上滑的「咻——」
        tone(t, { f: 300, f2: 900, glide: 0.3, g: 0.06, a: 0.02, d: 0.35 });
      },
      twinkle(t) { // 星星、流星
        tone(t, { f: 3136, g: 0.03, a: 0.002, d: 0.3 });
        tone(t + 0.08, { f: 4186, g: 0.025, a: 0.002, d: 0.4 });
      },
      snow(t) { // 下雪：很輕的沙沙聲
        noise(t, { type: 'highpass', f: 5000, q: 0.5, g: 0.03, a: 0.2, d: 0.8 });
        tone(t + 0.1, { f: 2093, g: 0.01, a: 0.01, d: 0.5 }); tone(t + 0.3, { f: 2637, g: 0.008, a: 0.01, d: 0.5 });
      },
      crack(t) { // 嗑瓜子：喀
        noise(t, { type: 'highpass', f: 2000, q: 2, g: 0.2, a: 0.001, d: 0.02 });
        noise(t + 0.03, { type: 'bandpass', f: 3500, q: 4, g: 0.1, a: 0.001, d: 0.015 });
      },
      gopnik(t) { // 俄國8+9：一小節低音鼓（節奏自己寫的，不是任何現成的歌）
        const beat = 0.4, notes = [55, 55, 65.41, 55, 49, 49, 58.27, 49];
        notes.forEach((f, i) => {
          const tt = t + i * beat;
          tone(tt, { f: 150, f2: 45, glide: 0.12, g: 0.2, a: 0.003, d: 0.22 });
          tonef(tt + beat / 2, { type: 'sawtooth', f: f * 2, g: 0.05, a: 0.005, d: 0.15, lp: 900 });
          noise(tt + beat / 2, { type: 'highpass', f: 7000, q: 0.7, g: 0.03, a: 0.001, d: 0.03 });
        });
      },
      steps(t) { // 換房間：木地板上兩步
        [0, 0.3].forEach((dt, i) => {
          noise(t + dt, { type: 'lowpass', f: 650, q: 0.8, g: 0.09 - i * 0.02, a: 0.003, d: 0.07 });
          tone(t + dt, { f: 150, f2: 95, glide: 0.06, g: 0.06 - i * 0.015, a: 0.002, d: 0.08 });
        });
      },
    };

    // ---------- 會一直響的：環境音、心跳、耳鳴、不安的低鳴 ----------
    const want = { amb: null, heart: null, tinnitus: false, unease: 0 };
    let ambNow = null, heartStop = null, tinNow = null, droneNow = null;
    const isOn = (k) => unlocked && !dead && !(api.settings && api.settings.muted) && vol[k] > 0;
    function every(fn, delay) { // 先跑一次，之後照 delay() 的毫秒數一直跑
      let alive = true, id = null;
      const tick = () => { if (!alive) return; try { fn(); } catch (e) { /* ignore */ } id = setTimeout(tick, delay()); };
      tick();
      return () => { alive = false; clearTimeout(id); };
    }
    function loopNoise(c) { const s = c.createBufferSource(); s.buffer = noiseBuf(); s.loop = true; return s; }
    function lfo(c, rate, depth, param) {
      const o = c.createOscillator(); o.frequency.value = rate;
      const g = c.createGain(); g.gain.value = depth;
      o.connect(g); g.connect(param); o.start();
      return o;
    }
    function bed(c, to, type, f, q, gain) { // looping filtered noise
      const n = loopNoise(c), fl = c.createBiquadFilter(), v = c.createGain();
      fl.type = type; fl.frequency.value = f; fl.Q.value = q; v.gain.value = gain;
      n.connect(fl); fl.connect(v); v.connect(to); n.start(0, Math.random());
      return { n, fl, v };
    }
    // 環境音的小零件：遠處的人聲、遠處的腳步
    function murmur(c, to, level) {
      const nodes = [];
      [[320, 0.13], [540, 0.21], [820, 0.17]].forEach(([f, r], i) => {
        const b = bed(c, to, 'bandpass', f, 5, level * (i === 1 ? 1 : 0.7));
        nodes.push(b.n, lfo(c, r, level * 0.6, b.v.gain), lfo(c, r * 0.7, f * 0.15, b.fl.frequency));
      });
      return nodes;
    }
    function farSteps(c, to, gg) {
      const t = c.currentTime + 0.1, n = 2 + ((Math.random() * 3) | 0), gap = rand(0.42, 0.55);
      for (let i = 0; i < n; i++) {
        noise(t + i * gap, { type: 'bandpass', f: rand(500, 800), q: 1.2, g: gg, a: 0.003, d: 0.06, to });
        tone(t + i * gap, { f: 120, f2: 80, glide: 0.05, g: gg * 0.6, a: 0.002, d: 0.06, to });
      }
    }
    function echoSend(c, g, time, fbk) {
      const dl = c.createDelay(1), fb = c.createGain(), send = c.createGain();
      dl.delayTime.value = time; fb.gain.value = fbk;
      send.connect(g); send.connect(dl); dl.connect(fb); fb.connect(dl); fb.connect(g);
      return send;
    }
    const AMB = {
      // ---- 翊文 11-08：每個房間都有自己的背景音 ----
      // 大廳：優雅、慢慢走的博物館門廳音樂（Claude 自己寫的，不是任何現成的歌）。
      // 11-08 翊文：「大廳也可以有音樂嗎」→ 原本只有遠處的人聲和腳步，加上音樂，人聲、腳步改小留著。
      // D 大調 D → G → Em → A ｜ D → F#m → G → A，豎琴分解和弦＋長笛般的旋律＋很輕的弦樂墊底，壹圈 8 小節約 19 秒。
      // 大廳待最久，所以不要太吵：慢、圓、沒有鼓。
      lobby(c, g) {
        const E8 = 0.3;
        const ARP = {
          D: [146.83, 220, 293.66, 369.99, 440, 369.99, 293.66, 220], G: [196, 293.66, 392, 493.88, 587.33, 493.88, 392, 293.66],
          Em: [164.81, 246.94, 329.63, 392, 493.88, 392, 329.63, 246.94], A: [220, 329.63, 440, 554.37, 659.25, 554.37, 440, 329.63],
          Fm: [185, 277.18, 369.99, 440, 554.37, 440, 369.99, 277.18],
        };
        const PAD = { D: [293.66, 369.99, 440], G: [293.66, 392, 493.88], Em: [329.63, 392, 493.88], A: [329.63, 440, 554.37], Fm: [277.18, 369.99, 440] };
        const PROG = ['D', 'G', 'Em', 'A', 'D', 'Fm', 'G', 'A'];
        const MEL = [ // 每小節 4 拍；0 ＝前壹個音繼續響
          [739.99, 0, 659.25, 587.33], [587.33, 0, 493.88, 0], [659.25, 587.33, 493.88, 392], [440, 0, 0, 0],
          [587.33, 0, 739.99, 880], [880, 0, 739.99, 659.25], [587.33, 0, 659.25, 739.99], [659.25, 0, 0, 0],
        ];
        const send = echoSend(c, g, 0.45, 0.3);
        let next = c.currentTime + 0.1, bar = 0;
        const play = (t0, b) => {
          const ch = PROG[b];
          ARP[ch].forEach((f, i) => { const t = t0 + i * E8; tone(t, { f, g: 0.032, a: 0.004, d: 0.9, to: send }); tone(t, { f: f * 2, g: 0.008, a: 0.003, d: 0.35, to: send }); }); // 豎琴
          const m = MEL[b];
          m.forEach((f, i) => { // 長笛：慢慢吹進來，響到下壹個音
            if (!f) return;
            let len = 1; while (i + len < m.length && !m[i + len]) len++;
            const t = t0 + i * E8 * 2;
            tone(t, { f, g: 0.045, a: 0.07, d: len * E8 * 2 + 0.5, to: send });
            tone(t, { f: f * 2, g: 0.005, a: 0.08, d: len * E8 * 2, to: send });
          });
          PAD[ch].forEach((f) => tone(t0, { f, g: 0.007, a: 1, d: E8 * 8 + 0.6, to: g })); // 弦樂墊底
        };
        const sched = every(() => { while (next < c.currentTime + 3) { play(next, bar); bar = (bar + 1) % PROG.length; next += E8 * 8; } }, () => 1000);
        const steps = every(() => farSteps(c, g, 0.01), () => rand(8000, 15000));
        return { nodes: [...murmur(c, g, 0.006)], timers: [sched, steps] };
      },
      // 手作坊：輕快的木琴＋撥弦低音（Claude 自己寫的，不是任何現成的歌）。
      // 11-08 翊文：「手作坊的音樂聽不太到，可以換壹首嗎」→ 原本只有剪刀、鉛筆、敲木頭的零星聲音，換成真的音樂。
      // F 大調，F → Dm → B♭ → C 四小節壹輪，旋律 A、B 兩段輪流（壹圈 8 小節約 17 秒）；低音放在 116–262 Hz，筆電喇叭也聽得到
      workshop(c, g) {
        const E8 = 0.27; // 八分音符
        const BASS = [[174.61, 261.63], [146.83, 220], [116.54, 174.61], [130.81, 196]]; // 每小節：根音、五度
        const CHORD = [[349.23, 440, 523.25], [293.66, 349.23, 440], [293.66, 349.23, 466.16], [329.63, 392, 523.25]];
        const MEL = [
          [523.25, 0, 440, 523.25, 698.46, 0, 659.25, 587.33], [523.25, 0, 440, 0, 587.33, 0, 523.25, 440],
          [466.16, 0, 587.33, 698.46, 0, 587.33, 523.25, 466.16], [440, 392, 0, 329.63, 392, 0, 523.25, 0],
          [698.46, 0, 659.25, 698.46, 783.99, 0, 698.46, 659.25], [587.33, 0, 440, 0, 587.33, 659.25, 698.46, 0],
          [587.33, 0, 466.16, 587.33, 523.25, 0, 466.16, 440], [392, 0, 523.25, 0, 329.63, 0, 349.23, 0],
        ];
        const send = echoSend(c, g, E8 * 3, 0.18);
        let next = c.currentTime + 0.1, bar = 0;
        const play = (t0, b) => {
          const ch = b % 4;
          MEL[b].forEach((f, i) => { // 木琴：圓的基音＋很短的亮泛音
            if (!f) return;
            const t = t0 + i * E8;
            tone(t, { f, g: 0.065, a: 0.002, d: 0.55, to: send });
            tone(t, { f: f * 3.98, g: 0.008, a: 0.001, d: 0.07, to: send });
          });
          [0, 2, 4, 6].forEach((i, k) => { // 撥弦低音：根音、五度、根音、五度
            const f = BASS[ch][k % 2], t = t0 + i * E8;
            tone(t, { type: 'triangle', f, g: 0.06, a: 0.004, d: 0.3, to: g });
            tone(t, { f: f * 2, g: 0.018, a: 0.004, d: 0.18, to: g });
          });
          [2, 6].forEach((i) => CHORD[ch].forEach((f) => tone(t0 + i * E8 + 0.01, { type: 'triangle', f, g: 0.014, a: 0.003, d: 0.16, to: g }))); // 反拍的小和弦
          if (b % 2 === 0) noise(t0 + 4 * E8, { type: 'highpass', f: 6000, q: 0.7, g: 0.008, a: 0.001, d: 0.03, to: g }); // 輕輕的沙鈴
        };
        const sched = every(() => { while (next < c.currentTime + 3) { play(next, bar); bar = (bar + 1) % MEL.length; next += E8 * 8; } }, () => 1000);
        const snip = every(() => { const t = c.currentTime + 0.05; [0, 0.09].forEach((dt) => noise(t + dt, { type: 'highpass', f: 3500, q: 1.5, g: 0.018, a: 0.001, d: 0.025, to: g })); }, () => rand(7000, 14000)); // 偶爾剪刀喀擦
        return { nodes: [], timers: [sched, snip] };
      },
      // 抱枕工作台：軟綿綿的搖籃曲小圓舞曲（Claude 自己寫的，不是任何現成的歌）。
      // 11-08 翊文：「抱枕區音樂也要」→ 原本只有布料聲和縫紉機，換成真的音樂，布料聲、縫紉機留著當點綴。
      // G 大調 3/4 拍，G → Em → C → D 四小節壹輪，旋律 A、B 兩段輪流（壹圈 8 小節 12 秒）；鋼片琴的旋律，底下「嗯—啪—啪」
      pillow(c, g) {
        const E8 = 0.25; // 八分音符；壹小節 6 個
        const BASS = [196, 164.81, 130.81, 146.83];
        const CHORD = [[246.94, 293.66, 392], [246.94, 329.63, 392], [261.63, 329.63, 392], [293.66, 369.99, 440]];
        const MEL = [
          [493.88, 0, 0, 587.33, 523.25, 493.88], [440, 0, 0, 392, 0, 329.63], [392, 0, 0, 523.25, 0, 493.88], [440, 0, 0, 0, 0, 0],
          [587.33, 0, 0, 493.88, 0, 587.33], [659.25, 0, 0, 587.33, 0, 493.88], [523.25, 0, 493.88, 440, 0, 392], [369.99, 0, 440, 0, 392, 0],
        ];
        const send = echoSend(c, g, E8 * 1.5, 0.25);
        let next = c.currentTime + 0.1, bar = 0;
        const play = (t0, b) => {
          const ch = b % 4;
          MEL[b].forEach((f, i) => { // 鋼片琴：圓圓的、慢慢消失
            if (!f) return;
            const t = t0 + i * E8;
            tone(t, { f, g: 0.06, a: 0.003, d: 1.1, to: send });
            tone(t, { f: f * 2, g: 0.011, a: 0.002, d: 0.45, to: send });
          });
          tone(t0, { type: 'triangle', f: BASS[ch], g: 0.055, a: 0.01, d: 0.9, to: g }); // 嗯
          tone(t0, { f: BASS[ch] * 2, g: 0.016, a: 0.01, d: 0.5, to: g });
          [2, 4].forEach((i) => CHORD[ch].forEach((f) => tone(t0 + i * E8, { type: 'triangle', f, g: 0.013, a: 0.01, d: 0.4, to: g }))); // 啪、啪
        };
        const sched = every(() => { while (next < c.currentTime + 3) { play(next, bar); bar = (bar + 1) % MEL.length; next += E8 * 6; } }, () => 1000);
        const rustle = every(() => noise(c.currentTime + 0.05, { type: 'bandpass', f: rand(1200, 2400), q: 0.8, g: 0.014, a: 0.15, d: 0.35, to: g }), () => rand(5000, 9000));
        const sew = every(() => { const t = c.currentTime + 0.1; for (let i = 0; i < 12; i++) { tone(t + i * 0.075, { type: 'triangle', f: 210, g: 0.012, a: 0.002, d: 0.04, to: g }); noise(t + i * 0.075, { type: 'highpass', f: 2500, q: 1, g: 0.008, a: 0.001, d: 0.02, to: g }); } }, () => rand(18000, 30000));
        return { nodes: [], timers: [sched, rustle, sew] };
      },
      commission(c, g) { // 委託櫃台：翻紙、蓋章，偶爾壹聲櫃台鈴
        const room = bed(c, g, 'lowpass', 220, 0.5, 0.03);
        const paper = every(() => noise(c.currentTime + 0.05, { type: 'bandpass', f: rand(1800, 3200), f2: rand(900, 1500), glide: 0.2, q: 1, g: 0.022, a: 0.04, d: 0.22, to: g }), () => rand(2500, 6000));
        const stampT = every(() => { const t = c.currentTime + 0.05; tone(t, { f: 110, f2: 55, glide: 0.1, g: 0.05, a: 0.002, d: 0.12, to: g }); noise(t, { type: 'lowpass', f: 900, q: 0.7, g: 0.03, a: 0.002, d: 0.05, to: g }); }, () => rand(9000, 18000));
        const ding = every(() => { if (Math.random() < 0.6) return; const t = c.currentTime + 0.05; tone(t, { f: 2093, g: 0.014, a: 0.002, d: 0.9, to: g }); tone(t, { f: 4186, g: 0.004, a: 0.002, d: 0.4, to: g }); }, () => rand(20000, 35000));
        return { nodes: [room.n], timers: [paper, stampT, ding] };
      },
      codex(c, g) { // 圖鑑室：很安靜，時鐘滴答，偶爾翻頁
        const room = bed(c, g, 'lowpass', 180, 0.5, 0.03);
        let tk = 0;
        const clock = every(() => noise(c.currentTime + 0.05, { type: 'bandpass', f: tk++ % 2 ? 2600 : 3200, q: 6, g: 0.012, a: 0.001, d: 0.02, to: g }), () => 1000);
        const page = every(() => noise(c.currentTime + 0.05, { type: 'bandpass', f: 1400, f2: 4000, q: 0.8, g: 0.015, a: 0.05, d: 0.2, to: g }), () => rand(7000, 14000));
        return { nodes: [room.n], timers: [clock, page] };
      },
      // 起源室：古老、神秘、慢慢的（Claude 自己寫的，不是任何現成的歌）。
      // 11-08 翊文：「這裡怎麼沒有起源室？還有他的音樂呢」→ 原本只有老時鐘、木頭嘎吱、翻頁，加上音樂，這些留著當點綴。
      // D 小調（多利安），Dm → C → B♭ → A，風琴般的和弦墊底，豎琴般的旋律有長長的回音；老時鐘跟著拍子走（每拍滴、答）
      origin(c, g) {
        const Q = 0.8; // 四分音符
        const PAD = [[146.83, 220, 293.66, 349.23], [130.81, 196, 261.63, 329.63], [116.54, 174.61, 233.08, 293.66], [110, 164.81, 220, 277.18]];
        const MEL = [
          [587.33, 0, 698.46, 659.25], [523.25, 0, 0, 0], [466.16, 523.25, 587.33, 0], [554.37, 0, 0, 0],
          [880, 0, 783.99, 698.46], [659.25, 0, 523.25, 0], [587.33, 0, 466.16, 523.25], [440, 0, 0, 0],
        ];
        const send = echoSend(c, g, 0.6, 0.35);
        let next = c.currentTime + 0.1, bar = 0, tk = 0;
        const play = (t0, b) => {
          PAD[b % 4].forEach((f) => { tone(t0, { f, g: 0.013, a: 1.2, d: Q * 4 + 0.8, to: g }); tone(t0, { f: f * 3, g: 0.0025, a: 1.4, d: Q * 4, to: g }); }); // 風琴
          MEL[b].forEach((f, i) => {
            if (!f) return;
            const t = t0 + i * Q;
            tone(t, { f, g: 0.05, a: 0.004, d: 2, to: send });
            tone(t, { f: f * 2, g: 0.008, a: 0.003, d: 0.6, to: send });
          });
          for (let i = 0; i < 4; i++) { const t = t0 + i * Q; tone(t, { type: 'triangle', f: tk++ % 2 ? 900 : 1100, g: 0.008, a: 0.001, d: 0.05, to: g }); noise(t, { type: 'bandpass', f: 1800, q: 4, g: 0.006, a: 0.001, d: 0.02, to: g }); } // 滴、答
        };
        const sched = every(() => { while (next < c.currentTime + 3) { play(next, bar); bar = (bar + 1) % MEL.length; next += Q * 4; } }, () => 1000);
        const creak = every(() => tonef(c.currentTime + 0.05, { type: 'sawtooth', f: rand(110, 160), f2: rand(80, 120), glide: 0.6, g: 0.01, a: 0.1, d: 0.6, lp: 700, q: 6, to: g }), () => rand(14000, 24000));
        const page = every(() => noise(c.currentTime + 0.05, { type: 'bandpass', f: 1400, f2: 4000, q: 0.8, g: 0.012, a: 0.05, d: 0.2, to: g }), () => rand(12000, 20000));
        return { nodes: [], timers: [sched, creak, page] };
      },
      hall(c, g) { // 我的展廳：明亮壹點的弦樂和聲，遠處有人聲
        const room = bed(c, g, 'lowpass', 200, 0.5, 0.025);
        const CH = [[293.66, 369.99, 440], [329.63, 415.3, 493.88], [261.63, 329.63, 392], [293.66, 349.23, 440]];
        let k = 0;
        const pad = every(() => { const t = c.currentTime + 0.05, ch = CH[k++ % CH.length]; ch.forEach((f) => { tone(t, { f, g: 0.011, a: 2, d: 4.4, to: g }); tone(t, { f: f * 2, g: 0.003, a: 2.2, d: 3.6, to: g }); }); }, () => 5000);
        return { nodes: [room.n, ...murmur(c, g, 0.008)], timers: [pad] };
      },
      library(c, g) { // 圖庫：音樂盒，五聲音階隨意彈，有回音
        const send = echoSend(c, g, 0.36, 0.35);
        const NOTES = [1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093];
        const box = every(() => { const t = c.currentTime + 0.05, f = NOTES[(Math.random() * NOTES.length) | 0]; tone(t, { f, g: 0.02, a: 0.002, d: 1.1, to: send }); tone(t, { f: f * 3, g: 0.003, a: 0.002, d: 0.4, to: send }); }, () => rand(900, 2600));
        return { nodes: [], timers: [box] };
      },
      office(c, g) { // 館長室：落地鐘、羽毛筆、壁爐
        const fire = bed(c, g, 'lowpass', 300, 0.7, 0.03);
        let tk = 0;
        const clock = every(() => { const t = c.currentTime + 0.05; tone(t, { type: 'triangle', f: tk++ % 2 ? 420 : 520, g: 0.016, a: 0.001, d: 0.12, to: g }); noise(t, { type: 'bandpass', f: 1200, q: 5, g: 0.01, a: 0.001, d: 0.03, to: g }); }, () => 1000);
        const quill = every(() => { const t = c.currentTime + 0.1; for (let i = 0; i < 3; i++) noise(t + i * 0.18, { type: 'bandpass', f: rand(3000, 4500), q: 4, g: 0.012, a: 0.01, d: 0.12, to: g }); }, () => rand(6000, 12000));
        const crackle = every(() => noise(c.currentTime + 0.02, { type: 'highpass', f: rand(1500, 3500), q: 1, g: rand(0.006, 0.02), a: 0.001, d: rand(0.008, 0.02), to: g }), () => rand(200, 900));
        return { nodes: [fire.n], timers: [clock, quill, crackle] };
      },
      title(c, g) { // 開場：音樂盒的旋律（Claude 自己寫的，不是任何現成的歌）
        const send = echoSend(c, g, 0.42, 0.32);
        const MEL = [659.25, 783.99, 880, 783.99, 659.25, 587.33, 523.25, 587.33, 659.25, 523.25, 440, 523.25, 587.33, 0, 0, 0];
        const beat = 0.42;
        let next = c.currentTime + 0.05;
        const bar = (t0) => MEL.forEach((f, i) => {
          if (!f) return;
          const t = t0 + i * beat;
          tone(t, { f, g: 0.05, a: 0.002, d: 1.1, to: send });
          tone(t, { f: f * 2.01, g: 0.009, a: 0.002, d: 0.5, to: send });
          if (i % 4 === 0) tone(t, { f: f / 2, g: 0.022, a: 0.01, d: 1.3, to: send });
        });
        // 底下柔和的和弦：前半 Am、後半 F → G（翊文 11-08：原本太小聲，聽不太到）
        const pad = (t0) => [[0, [220, 261.63, 329.63]], [3.36, [174.61, 220, 261.63]], [5.04, [196, 246.94, 293.66]]].forEach(([dt, ch]) =>
          ch.forEach((f) => tone(t0 + dt, { f, g: 0.014, a: 0.8, d: dt ? 1.9 : 2.8, to: send })));
        const sched = every(() => { while (next < c.currentTime + 3) { bar(next); pad(next); next += beat * MEL.length; } }, () => 1000);
        return { nodes: [], timers: [sched] };
      },
      room(c, g) { // 一般房間：很輕的空間底噪
        const b = bed(c, g, 'lowpass', 240, 0.5, 0.05);
        return { nodes: [b.n, lfo(c, 0.05, 60, b.fl.frequency)], timers: [] };
      },
      gallery(c, g) { // 畫廊：很輕的弦樂和聲慢慢起落，偶爾遠處的腳步回音
        const room = bed(c, g, 'lowpass', 160, 0.5, 0.03);
        const dl = c.createDelay(1), fb = c.createGain(), send = c.createGain();
        dl.delayTime.value = 0.31; fb.gain.value = 0.38;
        send.connect(g); send.connect(dl); dl.connect(fb); fb.connect(dl); fb.connect(g);
        const CH = [[261.63, 329.63, 392], [220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66]]; // C、Am、F、G
        let k = 0;
        const pad = every(() => {
          const t = c.currentTime + 0.05, ch = CH[k++ % CH.length];
          ch.forEach((f) => { tone(t, { f, g: 0.012, a: 2.2, d: 4.6, to: send }); tone(t, { f: f * 1.003, g: 0.007, a: 2.4, d: 4.4, to: send }); });
        }, () => 5200);
        const steps = every(() => {
          if (Math.random() < 0.35) return;
          const t = c.currentTime + 0.1, n = 2 + ((Math.random() * 3) | 0), gap = rand(0.42, 0.55), gg = rand(0.012, 0.022);
          for (let i = 0; i < n; i++) {
            noise(t + i * gap, { type: 'bandpass', f: rand(500, 800), q: 1.2, g: gg, a: 0.003, d: 0.06, to: send });
            tone(t + i * gap, { f: 120, f2: 80, glide: 0.05, g: gg * 0.6, a: 0.002, d: 0.06, to: send });
          }
        }, () => rand(6500, 13000));
        return { nodes: [room.n], timers: [pad, steps] };
      },
      cellar(c, g) { // 地下收藏庫：風聲＋滴水
        const b = bed(c, g, 'bandpass', 420, 1.1, 0.07);
        const nodes = [b.n, lfo(c, 0.11, 260, b.fl.frequency), lfo(c, 0.17, 0.03, b.v.gain)];
        const drip = every(() => {
          const t = c.currentTime + 0.05, f = rand(1250, 1900);
          tone(t, { f, f2: f * 1.7, glide: 0.04, g: 0.05, a: 0.002, d: 0.16, to: g });
          tone(t + 0.22, { f, f2: f * 1.7, glide: 0.04, g: 0.014, a: 0.002, d: 0.14, to: g });
        }, () => rand(1400, 4500));
        return { nodes, timers: [drip] };
      },
      fusion(c, g) { // 融合室：神秘的低鳴（會慢慢「呼吸」），偶爾冒出帶回音的玻璃音
        const lp = c.createBiquadFilter(), dg = c.createGain();
        lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 3; dg.gain.value = 0.011;
        lp.connect(dg); dg.connect(g);
        const o1 = c.createOscillator(), o2 = c.createOscillator(), o3 = c.createOscillator();
        o1.type = 'sawtooth'; o1.frequency.value = 55; o2.type = 'sawtooth'; o2.frequency.value = 55.4; o3.type = 'triangle'; o3.frequency.value = 82.4;
        [o1, o2, o3].forEach((o) => { o.connect(lp); o.start(); });
        const breath = bed(c, g, 'bandpass', 900, 4, 0.008);
        const dl = c.createDelay(1), fb = c.createGain(), send = c.createGain();
        dl.delayTime.value = 0.43; fb.gain.value = 0.45;
        send.connect(g); send.connect(dl); dl.connect(fb); fb.connect(dl); fb.connect(g);
        const NOTES = [880, 932.33, 1108.73, 1318.51, 1396.91, 1760];
        const glass = every(() => {
          const t = c.currentTime + 0.05, f = NOTES[(Math.random() * NOTES.length) | 0];
          tone(t, { f, g: 0.022, a: 0.01, d: 2.4, to: send });
          tone(t, { f: f * 2.76, g: 0.006, a: 0.01, d: 1.2, to: send });
        }, () => rand(2600, 6500));
        return { nodes: [o1, o2, o3, lfo(c, 0.06, 180, lp.frequency), breath.n, lfo(c, 0.09, 500, breath.fl.frequency)], timers: [glass] };
      },
      zero(c, g) { // 理智歸零：遠處傳來的低音鼓（節奏自己寫的）
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.7;
        const dl = c.createDelay(0.5), fb = c.createGain(); dl.delayTime.value = 0.13; fb.gain.value = 0.28;
        lp.connect(g); lp.connect(dl); dl.connect(fb); fb.connect(dl); fb.connect(g);
        const beat = 0.4, notes = [55, 55, 65.41, 55, 49, 49, 58.27, 49];
        let next = c.currentTime + 0.1;
        const bar = (t0) => notes.forEach((f, i) => {
          const t = t0 + i * beat;
          tone(t, { f: 150, f2: 45, glide: 0.12, g: 0.13, a: 0.003, d: 0.22, to: lp });
          tone(t + beat / 2, { type: 'sawtooth', f, g: 0.05, a: 0.005, d: 0.15, to: lp });
        });
        const sched = every(() => { while (next < c.currentTime + 3.6) { bar(next); next += beat * notes.length; } }, () => 1000);
        return { nodes: [], timers: [sched], extra: [lp, dl, fb] };
      },
    };
    function startAmb(type) {
      const c = ac;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(1, c.currentTime + (type === 'title' ? 0.3 : 1.5)); // 開場音樂要馬上聽得到
      g.connect(bus.amb);
      const hnd = AMB[type](c, g);
      return {
        type,
        timers: hnd.timers,
        stop() {
          const t = c.currentTime;
          (hnd.timers || []).forEach((s) => s());
          try { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2); } catch (e) { /* ignore */ }
          setTimeout(() => { (hnd.nodes || []).forEach((n) => { try { n.stop(); } catch (e) { /* ignore */ } }); try { g.disconnect(); } catch (e) { /* ignore */ } }, 1400);
        },
      };
    }
    // 理智越低越明顯的不安低鳴：兩個很接近的音互相「打架」（每秒拍打 3 次）。
    // 11-08 改：原本只有 55 Hz 的正弦波，筆電喇叭放不出來；現在用鋸齒波，讓 110–450 Hz 的泛音透出來
    function startDrone() {
      const c = ac, g = c.createGain();
      g.gain.value = 0.0001; g.connect(bus.amb);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 4; lp.connect(g);
      const o1 = c.createOscillator(), o2 = c.createOscillator(), o3 = c.createOscillator();
      o1.type = 'sawtooth'; o1.frequency.value = 73.42; o2.type = 'sawtooth'; o2.frequency.value = 76.4; o3.type = 'triangle'; o3.frequency.value = 103.83; // D2、比 D2 高壹點、三全音
      const g3 = c.createGain(); g3.gain.value = 0.5;
      o1.connect(lp); o2.connect(lp); o3.connect(g3); g3.connect(lp);
      [o1, o2, o3].forEach((o) => o.start());
      const l1 = lfo(c, 0.09, 140, lp.frequency);
      return {
        set(x) { g.gain.setTargetAtTime(0.032 * Math.sqrt(x), c.currentTime, 0.8); }, // 開根號：理智剛掉到 40 以下就聽得出來
        stop() { g.gain.setTargetAtTime(0.0001, c.currentTime, 0.4); setTimeout(() => { [o1, o2, o3, l1].forEach((n) => { try { n.stop(); } catch (e) { /* ignore */ } }); try { g.disconnect(); } catch (e) { /* ignore */ } }, 1800); },
      };
    }
    // 瘋狂發作：深沉、神秘的低鳴（11-08 翊文：原本的高頻耳鳴改成低鳴；之後又說聽不太到）
    // 底音 D2 和五度 A2，兩個鋸齒波互相拍打；共鳴在 250–950 Hz 之間慢慢張合，像「嗡——喔——」；底下壹層氣息
    function startTinnitus() {
      const c = ac, g = c.createGain();
      g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(0.042, c.currentTime + 2);
      g.connect(bus.heart);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 7; lp.connect(g);
      const o1 = c.createOscillator(), o2 = c.createOscillator(), o3 = c.createOscillator();
      o1.type = 'sawtooth'; o1.frequency.value = 73.42; o2.type = 'sawtooth'; o2.frequency.value = 73.9; o3.type = 'sawtooth'; o3.frequency.value = 110;
      const g3 = c.createGain(); g3.gain.value = 0.55;
      o1.connect(lp); o2.connect(lp); o3.connect(g3); g3.connect(lp);
      [o1, o2, o3].forEach((o) => o.start());
      const l1 = lfo(c, 0.12, 350, lp.frequency), l2 = lfo(c, 0.5, 0.014, g.gain);
      const b = bed(c, g, 'bandpass', 520, 2.5, 0.25);
      const l3 = lfo(c, 0.17, 160, b.fl.frequency);
      const parts = [o1, o2, o3, l1, l2, l3, b.n];
      return { stop() { const t = c.currentTime; g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0.0001, t, 0.5); setTimeout(() => { parts.forEach((n) => { try { n.stop(); } catch (e) { /* ignore */ } }); try { g.disconnect(); } catch (e) { /* ignore */ } }, 2600); } };
    }
    // 心跳：理智 30 以下開始一直跳，越低越快、越大聲
    const heartGap = () => { const s = want.heart; return s > 20 ? 1050 : s > 10 ? 780 : 560; };
    const heartK = () => 0.45 + (30 - Math.max(1, want.heart)) / 29 * 0.55;
    function sync() {
      if (!unlocked || dead) return;
      const c = ctx();
      if (!c) return;
      ['sfx', 'amb', 'heart'].forEach((k) => bus[k].gain.setTargetAtTime(vol[k], c.currentTime, 0.05));
      const amb = isOn('amb') ? want.amb : null;
      if (amb !== (ambNow && ambNow.type)) {
        if (ambNow) ambNow.stop();
        ambNow = amb && AMB[amb] ? startAmb(amb) : null;
      }
      const u = isOn('amb') ? want.unease : 0;
      if (u > 0 && !droneNow) droneNow = startDrone();
      if (droneNow) { if (u > 0) droneNow.set(u); else { droneNow.stop(); droneNow = null; } }
      const hs = isOn('heart') ? want.heart : null;
      if (hs != null && !heartStop) heartStop = every(() => { const c2 = ctx(); if (c2 && want.heart != null) R.heartbeat(c2.currentTime + 0.03, heartK(), bus.heart); }, heartGap);
      if (hs == null && heartStop) { heartStop(); heartStop = null; }
      const tn = isOn('heart') && want.tinnitus;
      if (tn && !tinNow) tinNow = startTinnitus();
      if (!tn && tinNow) { tinNow.stop(); tinNow = null; }
    }
    // 瀏覽器要等玩家先點壹下才准出聲：點之前只記下「想要的狀態」。
    // 11-08 改：手機上觸控的「按下去」不算使用者動作（放開、點擊才算），而且聲音可能被瀏覽器暫停 →
    // 很多種動作都試著開；每壹次都檢查，沒在播就 resume；切分頁回來也補開
    if (typeof document !== 'undefined') {
      const wake = () => {
        unlocked = true;
        const c = ctx();
        if (c && c.state !== 'running' && c.resume) { try { const p = c.resume(); if (p && p.then) p.then(() => sync()).catch(() => {}); } catch (e) { /* ignore */ } }
        sync();
      };
      ['pointerdown', 'mousedown', 'touchend', 'click', 'keydown'].forEach((ev) => document.addEventListener(ev, wake, { capture: true, passive: true }));
      document.addEventListener('visibilitychange', () => { if (!document.hidden && ac && ac.state !== 'running' && unlocked) { try { ac.resume(); } catch (e) { /* ignore */ } } });
    }

    // 開檔時試著自動播放（翊文 11-08：音樂壹開始要自動播放）。瀏覽器放行才會成功；不放行就等玩家點第壹下。
    // 不放行時，Chrome 的 resume() 會壹直等到玩家點畫面，所以最多等 0.45 秒就回報。
    function tryAutoplay() {
      return new Promise((res) => {
        let done = false;
        const fin = (ok) => { if (done) return; done = true; if (ok) { unlocked = true; sync(); } res(ok); };
        try {
          if (typeof navigator !== 'undefined' && navigator.getAutoplayPolicy && navigator.getAutoplayPolicy('audiocontext') === 'disallowed') return fin(false);
        } catch (e) { /* 有的瀏覽器沒有這個 */ }
        const c = ctx();
        if (!c) return fin(false);
        if (c.state === 'running') return fin(true);
        try { const p = c.resume(); if (p && p.then) p.then(() => fin(c.state === 'running')).catch(() => fin(false)); } catch (e) { return fin(false); }
        setTimeout(() => fin(c.state === 'running'), 450);
      });
    }

    function play(name, arg) {
      try {
        if (api.settings && api.settings.muted) return;
        const fn = R[name];
        if (!fn) return;
        const c = ctx();
        if (!c) return;
        const tn = now();
        if (last[name] && tn - last[name] < 35) return; // de-dupe accidental double calls
        last[name] = tn;
        fn(c.currentTime + 0.01, arg);
      } catch (e) { /* never throw */ }
    }

    // 測試用：在離線的 AudioContext 裡把一個聲音畫出來，量最大值和平均大小（Claude 聽不到，用這個量）
    async function analyze(name, arg, dur, isLoop) {
      const OAC = typeof window !== 'undefined' ? (window.OfflineAudioContext || window.webkitOfflineAudioContext) : null;
      if (!OAC) return null;
      const sr = 44100, oc = new OAC(1, Math.ceil(sr * (dur || 3)), sr);
      const save = { ac, out, bus, nbuf };
      ac = oc; nbuf = null;
      const ch = chain(oc); out = ch.o; bus = ch.b;
      try {
        if (isLoop) { const hnd = startAmb(name); (hnd.timers || []).forEach((s) => s()); }
        else if (name === 'tinnitus') startTinnitus();
        else if (name === 'drone') startDrone().set(arg == null ? 1 : arg);
        else R[name](0.05, arg, name === 'heartbeat' ? bus.heart : undefined);
      } finally { ac = save.ac; out = save.out; bus = save.bus; nbuf = save.nbuf; }
      const buf = await oc.startRendering();
      const d = buf.getChannelData(0);
      let peak = 0, sum = 0, sumHi = 0, yHi = 0, xPrev = 0;
      const k = 1 / (1 + 2 * Math.PI * 150 / sr); // 150 Hz 的高通（大約是筆電喇叭放得出來的部分）
      for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += d[i] * d[i]; yHi = k * (yHi + d[i] - xPrev); xPrev = d[i]; sumHi += yHi * yHi; }
      // 平均頻率（越高聽起來越尖）和各頻段的能量比例：每 0.05 秒取壹段 1024 點做 DFT
      const N = 1024, half = N / 2, cs = new Float32Array(N * half), sn = new Float32Array(N * half), win = new Float32Array(N);
      for (let n = 0; n < N; n++) win[n] = 0.5 - 0.5 * Math.cos(2 * Math.PI * n / N);
      for (let b = 0; b < half; b++) for (let n = 0; n < N; n++) { const ang = 2 * Math.PI * b * n / N; cs[b * N + n] = Math.cos(ang); sn[b * N + n] = Math.sin(ang); }
      const band = [0, 0, 0, 0], edges = [500, 2000, 5000]; let cw = 0, ce = 0;
      for (let s0 = 0; s0 + N < d.length; s0 += Math.floor(sr * 0.05)) {
        for (let b = 1; b < half; b++) {
          let re = 0, im = 0;
          for (let n = 0; n < N; n++) { const v = d[s0 + n] * win[n]; re += v * cs[b * N + n]; im -= v * sn[b * N + n]; }
          const e = re * re + im * im, f = b * sr / N;
          cw += e * f; ce += e; band[f < edges[0] ? 0 : f < edges[1] ? 1 : f < edges[2] ? 2 : 3] += e;
        }
      }
      const tot = band.reduce((x, y) => x + y, 0) || 1;
      return { peak, rms: Math.sqrt(sum / d.length), rmsHi: Math.sqrt(sumHi / d.length), centroid: ce ? Math.round(cw / ce) : 0, bands: { '<500': +(band[0] / tot).toFixed(2), '500-2k': +(band[1] / tot).toFixed(2), '2k-5k': +(band[2] / tot).toFixed(2), '>5k': +(band[3] / tot).toFixed(2) } };
    }

    return {
      play,
      names: Object.keys(R),
      ambient(type) { want.amb = type || null; sync(); },
      heart(san) { want.heart = san != null && san > 0 && san <= 30 ? san : null; sync(); },
      tinnitus(on) { want.tinnitus = !!on; sync(); },
      unease(x) { const v = Math.max(0, Math.min(1, +x || 0)); if (Math.abs(v - want.unease) < 0.02 && (v > 0) === (want.unease > 0)) return; want.unease = v; sync(); },
      setVolume(k, v) { if (!(k in vol)) return; vol[k] = Math.max(0, Math.min(1, +v)); sync(); },
      volume: (k) => vol[k],
      sync,
      analyze,
      // 設定頁的試聽：一次性的聲音直接播；心跳播 4 下；會一直響的播幾秒就停
      demo(name, arg) {
        if (api.settings && api.settings.muted) return false;
        const c = ctx();
        if (!c) return false;
        unlocked = true;
        if (name === 'heart') {
          const save = want.heart; want.heart = arg || 25;
          const gap = heartGap(), k = heartK(); want.heart = save;
          let n = 0;
          const tick = () => { const c2 = ctx(); if (c2) R.heartbeat(c2.currentTime + 0.03, k, bus.heart); if (++n < 4) setTimeout(tick, gap); };
          tick(); return true;
        }
        if (name === 'tinnitus') { const hh = startTinnitus(); setTimeout(() => hh.stop(), 3500); return true; }
        if (name === 'drone') { const hh = startDrone(); hh.set(arg == null ? 1 : arg); setTimeout(() => hh.stop(), 4000); return true; }
        if (AMB[name]) { const hh = startAmb(name); setTimeout(() => hh.stop(), 6000); return true; }
        play(name, arg); return true;
      },
      tryAutoplay,
      setWhisperLayers(n) { whisperN = Math.max(2, Math.min(8, n | 0)); },
      state: () => ({ unlocked, whisper: whisperN, running: !!ac && ac.state === 'running', amb: ambNow && ambNow.type, heart: !!heartStop, tinnitus: !!tinNow, drone: !!droneNow, want: Object.assign({}, want) }),
    };
  })();

  /* ================================================================ DICE */
  const TENS = ['00', '10', '20', '30', '40', '50', '60', '70', '80', '90'];
  const UNITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

  function parseSpec(spec) {
    const s = String(spec == null ? 'd100' : spec).trim().toUpperCase().replace(/\s+/g, '');
    if (s === 'D100' || s === '1D100' || s === 'D%' || s === '') return { d100: true, n: 2, m: 10 };
    const m = /^(\d*)D(\d+)$/.exec(s);
    if (!m) return { d100: false, n: 1, m: 6 };
    const mm = Math.max(2, parseInt(m[2], 10));
    if (mm === 100) return { d100: true, n: 2, m: 10 };
    return { d100: false, n: clamp(parseInt(m[1] || '1', 10) || 1, 1, 8), m: mm };
  }
  function kindFor(m) {
    if (m === 4) return 'd4';
    if (m <= 6) return 'd6';
    if (m === 8) return 'd8';
    if (m === 10) return 'd10';
    if (m === 12) return 'd12';
    if (m === 20) return 'd20';
    return 'dx';
  }
  function d100Faces(total) {
    const t = clamp(Math.round(total), 1, 100) % 100;
    return [Math.floor(t / 10), t % 10];
  }

  // SVG silhouettes, viewBox 0 0 100 100. Classes: fx-df side faces, fx-dl lower
  // faces, fx-dt front face, fx-de inner edge, fx-do outline.
  function dieSVG(kind, tens) {
    const P = (cls, arr) => '<polygon class="' + cls + '" points="' + arr.map((p) => p[0] + ',' + p[1]).join(' ') + '"/>';
    const L = (a, b) => '<line class="fx-de" x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"/>';
    const ring = (n, r, start) => Array.from({ length: n }, (_, i) => {
      const a = (start + (i * 360) / n) * Math.PI / 180;
      return [+(50 + r * Math.cos(a)).toFixed(2), +(50 + r * Math.sin(a)).toFixed(2)];
    });
    let g = '', ty = 51, fs = 30;
    switch (kind) {
      case 'd10': { // pentagonal trapezohedron, face-on: kite in front
        const T = [50, 3], B = [50, 97], uL = [24, 50], uR = [76, 50], l = [50, 70];
        const oL = [8, 48], oR = [92, 48], lL = [8, 65], lR = [92, 65];
        const sil = [T, oR, lR, B, lL, oL];
        g = P('fx-df', sil) + P('fx-dl', [B, lL, uL, l]) + P('fx-dl', [B, l, uR, lR]) +
          P('fx-dt', [T, uR, l, uL]) + L(uL, oL) + L(uR, oR) + P('fx-do', sil);
        ty = 43; fs = tens ? 24 : 29;
        break;
      }
      case 'd4': {
        const tri = [[50, 7], [94, 87], [6, 87]];
        g = P('fx-dt', tri) + P('fx-de', [[50, 25], [79, 78], [21, 78]]) + P('fx-do', tri);
        ty = 63; fs = 26;
        break;
      }
      case 'd8': {
        const dia = [[50, 3], [95, 50], [50, 97], [5, 50]];
        const a = [18, 64], b = [82, 64];
        g = P('fx-df', dia) + P('fx-dl', [a, b, [50, 97]]) + P('fx-dt', [[50, 3], b, a]) + P('fx-do', dia);
        ty = 45; fs = 25;
        break;
      }
      case 'd12': {
        const dec = ring(10, 47, -90), pen = ring(5, 27, -90);
        g = P('fx-df', dec) + P('fx-dt', pen);
        for (let i = 0; i < 5; i++) g += L(pen[i], dec[i * 2]);
        g += P('fx-do', dec);
        ty = 51; fs = 25;
        break;
      }
      case 'd20': {
        const hex = ring(6, 48, -90), tri = ring(3, 31, -90);
        // hex: 0 top, 1 upper-right, 2 lower-right, 3 bottom, 4 lower-left, 5 upper-left
        g = P('fx-df', hex) +
          P('fx-dl', [tri[0], tri[1], hex[1]]) + P('fx-dl', [tri[1], tri[2], hex[3]]) + P('fx-dl', [tri[2], tri[0], hex[5]]) +
          P('fx-dt', tri) +
          L(tri[0], hex[0]) + L(tri[1], hex[2]) + L(tri[2], hex[4]) + P('fx-do', hex);
        ty = 53; fs = 21;
        break;
      }
      case 'dx': {
        g = '<circle class="fx-dt" cx="50" cy="50" r="45"/><circle class="fx-de" cx="50" cy="50" r="37"/><circle class="fx-do" cx="50" cy="50" r="45"/>';
        ty = 51; fs = 30;
        break;
      }
      default: { // d6: rounded square with a faint bevel
        g = '<rect class="fx-dt" x="8" y="8" width="84" height="84" rx="18"/>' +
          '<rect class="fx-de" x="16" y="16" width="68" height="68" rx="12"/>' +
          '<rect class="fx-do" x="8" y="8" width="84" height="84" rx="18"/>';
        ty = 51; fs = 40;
      }
    }
    return '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">' + g +
      '<text class="fx-die-num" x="50" y="' + ty + '" font-size="' + fs + '" text-anchor="middle" dominant-baseline="central"></text></svg>';
  }

  function createDiceTray(host, opts = {}) {
    const spec = parseSpec(opts.spec);
    if (!hasDOM() || !host) {
      return { el: null, throw: (r) => Promise.resolve(r), show() {}, setLabel() {}, destroy() {} };
    }
    const n = spec.n;
    const el = h('div', 'fx-tray' + (spec.d100 ? ' fx-tray-d100' : ''));
    el.tabIndex = -1;
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', opts.label || '擲骰');
    const labelEl = h('div', 'fx-tray-label', opts.label || '');
    const floor = h('div', 'fx-tray-floor');
    const foot = h('div', 'fx-tray-foot');
    const readout = h('div', 'fx-tray-readout');
    readout.setAttribute('aria-live', 'polite');
    const totalEl = h('div', 'fx-tray-total');
    const detailEl = h('div', 'fx-tray-detail');
    readout.append(totalEl, detailEl);
    const cta = h('div', 'fx-tray-cta');
    const hint = h('div', 'fx-tray-hint', '點一下擲骰，或把骰子丟出去');
    const btn = h('button', 'fx-btn fx-btn-primary fx-tray-btn', '擲骰');
    btn.type = 'button';
    cta.append(hint, btn);
    foot.append(readout, cta);
    el.append(labelEl, floor, foot);
    host.appendChild(el);

    const size = spec.d100 ? 74 : n === 1 ? 70 : n === 2 ? 64 : n === 3 ? 58 : n <= 5 ? 52 : 46;
    const kind = spec.d100 ? 'd10' : kindFor(spec.m);
    const dice = [];
    for (let i = 0; i < n; i++) {
      const tens = spec.d100 && i === 0;
      const faces = spec.d100 ? (tens ? TENS : UNITS) : Array.from({ length: spec.m }, (_, k) => String(k + 1));
      const node = h('div', 'fx-die fx-die-' + kind + (tens ? ' fx-die-tens' : ''));
      node.tabIndex = -1; // focusable only while waiting for the throw
      node.setAttribute('role', 'button');
      node.setAttribute('aria-label', '擲骰');
      node.style.width = node.style.height = size + 'px';
      node.style.marginLeft = node.style.marginTop = (-size / 2) + 'px';
      const shadow = h('div', 'fx-die-shadow');
      shadow.style.width = (size * 0.92) + 'px';
      shadow.style.height = (size * 0.34) + 'px';
      shadow.style.marginLeft = (-size * 0.46) + 'px';
      shadow.style.marginTop = (-size * 0.17) + 'px';
      const bob = h('div', 'fx-die-bob');
      bob.style.animationDelay = (-i * 0.9) + 's';
      const body = h('div', 'fx-die-body');
      body.innerHTML = dieSVG(kind, tens);
      bob.appendChild(body);
      node.appendChild(bob);
      floor.append(shadow, node);
      const d = {
        i, node, shadow, bob, body, txt: body.querySelector('text'), faces, size, r: size * 0.46,
        ul: !tens && (kind === 'd10' || kind === 'd12' || kind === 'd20' || kind === 'dx'),
        x: 0, y: 0, a: rand(-8, 8), z: 0, vz: 0, sx: 1, bvx: 0, bvy: 0, a0: null, da: 0,
        phase: 0, flipAt: 0, final: null, finalShown: false, face: null,
      };
      setFace(d, pick(faces));
      dice.push(d);
      node.addEventListener('pointerdown', onDown);
      node.addEventListener('keydown', onDieKey);
    }
    btn.addEventListener('click', () => toss(null));

    let W = 0, H = 0, placed = false, state = 'idle', pending = null, destroyed = false;
    let rafId = 0, homeRaf = 0, landT = 0, swapT = 0, safeT = 0, grab = null;

    function setFace(d, v) {
      if (d.face === v) return;
      d.face = v;
      d.txt.textContent = v;
      d.txt.classList.toggle('fx-u', d.ul && (v === '6' || v === '9'));
    }
    const ROWS = n > 4 ? 2 : 1, COLS = ROWS > 1 ? Math.ceil(n / 2) : n;
    let fit = 1; // shrink the dice when the tray is too small for them
    function measure() {
      W = floor.clientWidth; H = floor.clientHeight;
      if (W > 20 && H > 20) {
        fit = clamp(Math.min((W - 12) / (COLS * size * 1.14), (H - 12) / (ROWS * size * 1.08)), 0.5, 1);
        dice.forEach((d) => { d.r = size * 0.46 * fit; });
      }
      return W > 20 && H > 20;
    }
    function homes() {
      const rows = ROWS, cols = COLS, es = size * fit;
      let gap = es * 1.32;
      if (cols > 1) gap = Math.min(gap, (W - es * 1.1) / (cols - 1));
      const vgap = rows > 1 ? Math.min(es * 1.15, H - es) : 0;
      return dice.map((d, i) => {
        const row = rows > 1 && i >= cols ? 1 : 0;
        const inRow = row === 0 ? Math.min(cols, n) : n - cols;
        const idx = row === 0 ? i : i - cols;
        return { x: W / 2 + (idx - (inRow - 1) / 2) * gap, y: H / 2 + (rows > 1 ? (row - 0.5) * vgap : 0) };
      });
    }
    function apply(d) {
      const s = (1 + d.z / 160) * fit;
      d.node.style.transform = 'translate3d(' + d.x.toFixed(1) + 'px,' + d.y.toFixed(1) + 'px,0)';
      d.body.style.transform = 'rotate(' + d.a.toFixed(1) + 'deg) scale(' + (s * d.sx).toFixed(3) + ',' + s.toFixed(3) + ')';
      d.shadow.style.transform = 'translate3d(' + (d.x + d.z * 0.3).toFixed(1) + 'px,' +
        (d.y + d.size * 0.36 * fit + d.z * 0.55).toFixed(1) + 'px,0) scale(' + ((1 + d.z / 110) * fit).toFixed(3) + ')';
      d.shadow.style.opacity = clamp(1 - d.z / 70, 0.35, 1).toFixed(2);
    }
    function placeHome() {
      if (!measure()) return false;
      homes().forEach((p, i) => { const d = dice[i]; d.x = p.x; d.y = p.y; d.z = 0; d.sx = 1; apply(d); });
      placed = true;
      return true;
    }
    function goHome() {
      caf(homeRaf);
      if (!measure()) return;
      if (!placed || reduced()) { placeHome(); return; }
      const hs = homes();
      const from = dice.map((d) => ({ x: d.x, y: d.y, a: d.a, z: d.z }));
      const toA = dice.map((d) => d.a - Math.round(d.a / 360) * 360 + rand(-6, 6));
      if (dice.every((d, i) => Math.hypot(d.x - hs[i].x, d.y - hs[i].y) < 2)) return;
      dice.forEach((d, i) => { from[i].a = d.a - Math.round(d.a / 360) * 360; });
      const t0 = now();
      const step = () => {
        const u = easeOut3(clamp((now() - t0) / 380, 0, 1));
        dice.forEach((d, i) => {
          d.x = from[i].x + (hs[i].x - from[i].x) * u;
          d.y = from[i].y + (hs[i].y - from[i].y) * u;
          d.a = from[i].a + (toA[i] - from[i].a) * u;
          d.z = from[i].z * (1 - u) + Math.sin(u * Math.PI) * 6;
          apply(d);
        });
        homeRaf = u < 1 ? raf(step) : 0;
      };
      homeRaf = raf(step);
    }

    function faceText(res, i) {
      if (spec.d100) return i === 0 ? TENS[res.faces[0]] : UNITS[res.faces[1]];
      return String(res.faces[i]);
    }
    function splitTotal(t) {
      if (t == null) return dice.map(() => 1 + ((Math.random() * spec.m) | 0));
      t = clamp(Math.round(t), n, n * spec.m);
      const f = new Array(n).fill(1);
      let rem = t - n, guard = 0;
      while (rem > 0 && guard++ < 10000) { const i = (Math.random() * n) | 0; if (f[i] < spec.m) { f[i]++; rem--; } }
      return f;
    }
    function normalize(r) {
      if (typeof r === 'number') r = { total: r };
      r = r || {};
      if (spec.d100) {
        let f = Array.isArray(r.faces) && r.faces.length >= 2 ? [clamp(r.faces[0] | 0, 0, 9), clamp(r.faces[1] | 0, 0, 9)] : null;
        let total = Math.round(Number(r.total));
        if (!isFinite(total)) total = f ? (f[0] * 10 + f[1]) || 100 : 1 + ((Math.random() * 100) | 0);
        total = clamp(total, 1, 100);
        if (!f) f = d100Faces(total);
        return { total, faces: f };
      }
      const f = Array.isArray(r.faces) && r.faces.length === n ? r.faces.map((v) => clamp(Math.round(v), 1, spec.m)) : splitTotal(isFinite(Number(r.total)) && r.total != null ? Number(r.total) : null);
      let total = Number(r.total);
      if (r.total == null || !isFinite(total)) total = f.reduce((a, b) => a + b, 0);
      return { total: Math.round(total), faces: f };
    }

    /* ---- throwing ---- */
    function throwDice(result, o = {}) {
      if (destroyed) return Promise.resolve(normalize(result));
      finishNow();
      const res = normalize(result);
      return new Promise((resolve) => {
        pending = { res, resolve };
        dice.forEach((d, i) => { d.final = faceText(res, i); });
        el.classList.remove('is-landed', 'is-rolling');
        markRM(el);
        state = 'waiting';
        if (o.auto) toss(null);
        else { el.classList.add('is-waiting'); dice.forEach((d) => { d.node.tabIndex = 0; }); goHome(); }
      });
    }
    function toss(vel, held) {
      if (state !== 'waiting' || !pending || destroyed) return;
      caf(homeRaf);
      if (grab) endGrab();
      state = 'rolling';
      const hadFocus = el.contains(document.activeElement);
      dice.forEach((d) => { d.node.tabIndex = -1; });
      el.classList.remove('is-waiting');
      el.classList.add('is-rolling');
      if (hadFocus) focusNoScroll(el);
      sound.play('dice');
      markRM(el);
      if (reduced() || !measure()) crossfade();
      else physics(vel, held);
    }
    function crossfade() {
      el.classList.add('is-swap');
      swapT = setTimeout(() => {
        dice.forEach((d) => setFace(d, d.final));
        el.classList.remove('is-swap');
        swapT = setTimeout(() => land(false), 90);
      }, 90);
    }
    function physics(vel, held) {
      if (!placed) placeHome();
      let sp, dir;
      if (vel) { sp = Math.hypot(vel.x, vel.y); dir = Math.atan2(vel.y, vel.x); }
      else { sp = rand(1050, 1450); dir = (Math.random() < 0.5 ? 0 : Math.PI) + rand(-0.65, 0.65); }
      const T = clamp(0.86 + sp / 4200, 0.92, 1.34) + rand(0, 0.07);
      dice.forEach((d) => {
        const ang = d === held ? dir : dir + rand(-0.4, 0.4);
        const s = d === held ? sp : sp * rand(0.82, 1.1);
        d.bvx = Math.cos(ang) * s; d.bvy = Math.sin(ang) * s;
        d.z = Math.max(d.z, d === held ? 12 : 4);
        d.vz = rand(220, 340);
        const spin = d.bvx >= 0 ? 1 : -1;
        const turns = clamp(s / 1000, 0.8, 2.2) * rand(0.85, 1.15);
        const tilt = rand(-9, 9);
        let delta = spin * turns * 360;
        const end = d.a + delta;
        delta += ((((tilt - end) % 360) + 540) % 360) - 180; // land upright (+/- tilt)
        d.a0 = d.a; d.da = delta;
        d.phase = 0; d.flipAt = 0; d.finalShown = false; d.lastFlip = 0;
      });
      const t0 = now();
      let tl = t0;
      const step = () => {
        const tn = now();
        const dt = Math.min(0.04, (tn - tl) / 1000);
        tl = tn;
        const u = clamp((tn - t0) / 1000 / T, 0, 1);
        const sf = (1 - u) * (1 - u); // speed falls as the derivative of easeOut3
        for (const d of dice) {
          d.x += d.bvx * sf * dt;
          d.y += d.bvy * sf * dt;
          if (d.x < d.r) { d.x = d.r; d.bvx = Math.abs(d.bvx) * 0.72; }
          else if (d.x > W - d.r) { d.x = W - d.r; d.bvx = -Math.abs(d.bvx) * 0.72; }
          if (d.y < d.r) { d.y = d.r; d.bvy = Math.abs(d.bvy) * 0.72; }
          else if (d.y > H - d.r) { d.y = H - d.r; d.bvy = -Math.abs(d.bvy) * 0.72; }
          d.vz -= 2600 * dt;
          d.z += d.vz * dt;
          if (d.z <= 0) { d.z = 0; d.vz = Math.abs(d.vz) > 90 && u < 0.62 ? Math.abs(d.vz) * 0.42 : 0; }
          if (u > 0.85) d.z *= 0.8;
          d.a = d.a0 + d.da * easeOut3(u);
          const v = Math.hypot(d.bvx, d.bvy) * sf;
          d.phase += (v * dt) / (d.size * 0.5);
          if (u < 0.78) {
            if (d.phase >= d.flipAt && tn - d.lastFlip > 42) {
              d.flipAt = d.phase + 1.5; d.lastFlip = tn;
              let f = pick(d.faces);
              if (f === d.face) f = pick(d.faces);
              setFace(d, f);
            }
          } else if (!d.finalShown) { d.finalShown = true; setFace(d, d.final); }
          d.sx = 1 - 0.1 * Math.abs(Math.sin(d.phase * 0.9)) * (1 - u);
        }
        collide();
        dice.forEach(apply);
        if (u < 1) rafId = raf(step);
        else { rafId = 0; land(false); }
      };
      rafId = raf(step);
      // if frames are throttled (background tab), still land on time
      safeT = setTimeout(() => { if (state === 'rolling') { caf(rafId); rafId = 0; land(false); } }, T * 1000 + 700);
    }
    function collide() {
      for (let i = 0; i < dice.length; i++) {
        for (let j = i + 1; j < dice.length; j++) {
          const a = dice[i], b = dice[j];
          const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy), min = a.r + b.r;
          if (dist >= min) continue;
          const nx = dist > 0.01 ? dx / dist : 1, ny = dist > 0.01 ? dy / dist : 0;
          const push = (min - dist) / 2;
          a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
          const va = a.bvx * nx + a.bvy * ny, vb = b.bvx * nx + b.bvy * ny;
          if (va - vb > 0) {
            const k = (va - vb) * 0.9;
            a.bvx -= k * nx; a.bvy -= k * ny; b.bvx += k * nx; b.bvy += k * ny;
          }
        }
      }
      for (const d of dice) { d.x = clamp(d.x, d.r, Math.max(d.r, W - d.r)); d.y = clamp(d.y, d.r, Math.max(d.r, H - d.r)); }
    }
    function land(immediate) {
      clearTimeout(safeT);
      state = 'landed';
      dice.forEach((d) => {
        if (d.a0 != null) { d.a = d.a0 + d.da; d.a0 = null; }
        d.z = 0; d.vz = 0; d.sx = 1;
        setFace(d, d.final);
        if (placed) apply(d);
      });
      const res = pending ? pending.res : null;
      if (res) {
        totalEl.textContent = String(res.total);
        totalEl.dataset.v = String(res.total);
        detailEl.textContent = !spec.d100 && n > 1 ? res.faces.join(' + ') : '';
      }
      el.classList.remove('is-rolling', 'is-waiting', 'is-swap');
      el.classList.add('is-landed');
      if (immediate) return;
      if (!reduced()) dice.forEach((d) => animate(d.bob, [{ transform: 'scale(1.05)' }, { transform: 'scale(1)' }], { duration: 200, easing: EASE }));
      landT = setTimeout(resolvePending, reduced() ? 0 : 110);
    }
    function resolvePending() {
      const p = pending;
      pending = null;
      if (p) p.resolve(p.res);
    }
    function finishNow() {
      caf(rafId); rafId = 0;
      caf(homeRaf); homeRaf = 0;
      clearTimeout(swapT); clearTimeout(landT); clearTimeout(safeT);
      if (grab) endGrab();
      if (state === 'rolling') land(true);
      resolvePending();
      el.classList.remove('is-waiting', 'is-rolling', 'is-swap');
      dice.forEach((d) => { d.node.tabIndex = -1; });
      if (state !== 'landed') state = 'idle';
    }

    /* ---- pointer: click, or drag and release to throw ---- */
    function onDown(e) {
      if (state !== 'waiting' || grab) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const d = dice.find((x) => x.node === e.currentTarget);
      if (!d) return;
      e.preventDefault();
      caf(homeRaf);
      measure();
      const fr = floor.getBoundingClientRect();
      grab = {
        d, id: e.pointerId, x0: e.clientX, y0: e.clientY, fr, moved: false,
        ox: d.x - (e.clientX - fr.left), oy: d.y - (e.clientY - fr.top),
        samples: [{ x: e.clientX, y: e.clientY, t: now() }],
      };
      try { d.node.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      d.node.addEventListener('pointermove', onMove);
      d.node.addEventListener('pointerup', onUp);
      d.node.addEventListener('pointercancel', onCancel);
      d.node.addEventListener('lostpointercapture', onCancel);
    }
    function onMove(e) {
      if (!grab || e.pointerId !== grab.id) return;
      const t = now();
      grab.samples.push({ x: e.clientX, y: e.clientY, t });
      while (grab.samples.length > 2 && t - grab.samples[0].t > 100) grab.samples.shift();
      if (!grab.moved && Math.hypot(e.clientX - grab.x0, e.clientY - grab.y0) > 5) {
        grab.moved = true;
        grab.d.node.classList.add('is-held');
        el.classList.add('is-grabbing');
      }
      if (grab.moved && !reduced()) {
        const d = grab.d;
        d.x = clamp(e.clientX - grab.fr.left + grab.ox, d.r, W - d.r);
        d.y = clamp(e.clientY - grab.fr.top + grab.oy, d.r, H - d.r);
        d.z = 12;
        apply(d);
      }
    }
    function onUp(e) {
      if (!grab || e.pointerId !== grab.id) return;
      const g = grab;
      g.samples.push({ x: e.clientX, y: e.clientY, t: now() });
      endGrab();
      if (!g.moved) { toss(null); return; }
      const s = g.samples, a = s[0], b = s[s.length - 1];
      const dt = Math.max(16, b.t - a.t);
      let vx = ((b.x - a.x) / dt) * 1000, vy = ((b.y - a.y) / dt) * 1000;
      const sp = Math.hypot(vx, vy);
      if (sp < 240) { // released gently: toss along the drag direction
        const dx = b.x - g.x0, dy = b.y - g.y0, m = Math.hypot(dx, dy) || 1;
        vx = (dx / m) * 950; vy = (dy / m) * 950;
      } else {
        const k = clamp(sp, 750, 2400) / sp;
        vx *= k; vy *= k;
      }
      toss({ x: vx, y: vy }, g.d);
    }
    function onCancel(e) {
      if (!grab || (e && e.pointerId !== grab.id)) return;
      const d = grab.d;
      endGrab();
      d.z = 0;
      if (placed) apply(d);
    }
    function endGrab() {
      const g = grab;
      if (!g) return;
      grab = null;
      const nd = g.d.node;
      nd.removeEventListener('pointermove', onMove);
      nd.removeEventListener('pointerup', onUp);
      nd.removeEventListener('pointercancel', onCancel);
      nd.removeEventListener('lostpointercapture', onCancel);
      try { if (nd.hasPointerCapture && nd.hasPointerCapture(g.id)) nd.releasePointerCapture(g.id); } catch (err) { /* ignore */ }
      nd.classList.remove('is-held');
      el.classList.remove('is-grabbing');
    }
    function onDieKey(e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        if (state === 'waiting') toss(null);
      }
    }

    /* ---- show(total): roll the displayed digits to a new value (d100) ---- */
    function show(total) {
      let t = Math.round(Number(total));
      if (!isFinite(t)) return;
      if (spec.d100) {
        t = clamp(t, 1, 100);
        const f = d100Faces(t);
        if (state === 'rolling' || state === 'waiting') { // retarget the throw in progress
          if (pending) { pending.res = { total: t, faces: f }; dice.forEach((d, i) => { d.final = faceText(pending.res, i); }); }
          return;
        }
        setFace(dice[0], TENS[f[0]]);
        setFace(dice[1], UNITS[f[1]]);
      }
      if (!el.classList.contains('is-landed') || totalEl.dataset.v == null) {
        totalEl.textContent = String(t);
        totalEl.dataset.v = String(t);
        el.classList.add('is-landed');
        return;
      }
      countTo(totalEl, t, { duration: 300, format: String });
    }

    let ro = null;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(() => {
        if (destroyed || !measure()) return;
        if (!placed || ((state === 'idle' || state === 'waiting') && !grab && !homeRaf)) { placeHome(); return; }
        if (state === 'landed') dice.forEach((d) => { d.x = clamp(d.x, d.r, W - d.r); d.y = clamp(d.y, d.r, H - d.r); apply(d); });
      });
      ro.observe(floor);
    }
    placeHome();

    return {
      el,
      throw: throwDice,
      show,
      setLabel(text) { labelEl.textContent = text || ''; el.setAttribute('aria-label', text || '擲骰'); },
      get state() { return state; },
      destroy() {
        if (destroyed) return;
        finishNow();
        destroyed = true;
        if (ro) ro.disconnect();
        el.remove();
      },
    };
  }

  /* ------------------------------------------------------- roll overlay */
  let ovChain = Promise.resolve();
  function rollOverlay(o = {}) {
    const run = () => openRoll(o);
    const p = ovChain.then(run, run);
    ovChain = p.then(() => {}, () => {});
    return p;
  }
  function openRoll(o) {
    return new Promise((resolve) => {
      if (!hasDOM()) { resolve(); return; }
      const prevFocus = document.activeElement;
      const root = h('div', 'fx-overlay');
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      markRM(root);
      const dim = h('div', 'fx-overlay-dim');
      const card = h('div', 'fx-card fx-roll-card');
      card.tabIndex = -1;
      const title = h('div', 'fx-roll-title', o.title || '');
      title.id = uid('fx-rt');
      root.setAttribute('aria-labelledby', title.id);
      const sub = h('div', 'fx-roll-sub', o.sub || '');
      const trayHost = h('div', 'fx-roll-tray');
      const outEl = h('div', 'fx-roll-outcome');
      outEl.setAttribute('aria-live', 'polite');
      const more = h('div', 'fx-roll-more', '點一下繼續');
      card.append(title, sub, trayHost, outEl, more);
      root.append(dim, card);
      document.body.appendChild(root);
      const tray = createDiceTray(trayHost, { spec: o.spec || 'd100', label: o.label || '' });
      void root.offsetWidth;
      root.classList.add('is-open');

      let landed = false, closed = false, timer = 0;
      const onKey = (e) => {
        if (closed) return;
        if (e.key === 'Tab') { trapTab(e, card, card); e.stopPropagation(); return; }
        const k = e.key;
        if (landed && (k === 'Enter' || k === ' ' || k === 'Spacebar' || k === 'Escape')) {
          e.preventDefault(); e.stopPropagation(); close(); return;
        }
        if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); }
      };
      document.addEventListener('keydown', onKey, true);
      root.addEventListener('click', () => { if (landed) close(); });

      tray.throw(o.result, { auto: !!o.auto }).then((res) => {
        if (closed) return;
        landed = true;
        root.classList.add('is-landed');
        let oc = o.outcome;
        if (typeof oc === 'function') { try { oc = oc(res.total); } catch (err) { oc = null; } }
        if (oc && oc.text) {
          outEl.textContent = oc.text;
          outEl.className = 'fx-roll-outcome fx-tone-' + toneOf(oc.tone);
          void outEl.offsetWidth;
          outEl.classList.add('is-shown');
          if (oc.sound) sound.play(oc.sound, oc.soundArg);
        }
        focusNoScroll(card);
        const hold = o.hold != null ? o.hold : 1600;
        if (hold > 0) timer = setTimeout(close, hold);
      });
      if (o.auto) focusNoScroll(card);
      else raf(() => { if (!closed) focusNoScroll(tray.el && tray.el.querySelector('.fx-tray-btn')); });

      function close() {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        document.removeEventListener('keydown', onKey, true);
        root.classList.remove('is-open');
        root.classList.add('is-closing');
        setTimeout(() => {
          tray.destroy();
          root.remove();
          if (prevFocus && prevFocus.isConnected && prevFocus !== document.body) focusNoScroll(prevFocus);
          resolve();
        }, reduced() ? 140 : 240);
      }
    });
  }

  /* ======================================================== DRAG & DROP */
  const drag = {
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

  function makeDraggable(el, opts = {}) {
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

  function makeDropTarget(el, opts = {}) {
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

  /* ============================================================ countTo */
  const counters = new WeakMap();
  const defFmt = (n) => n.toLocaleString('en-US');
  function countTo(el, to, o = {}) {
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
  function toast(text, o = {}) {
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
  function floatText(target, text, tone) {
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
  function goldDust(host, ms = 2500) {
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
  function spotlightEnd(r) {
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
  function spotlight(target, o = {}) {
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
  function press(el) {
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

  Object.assign(api, {
    version: '1.0',
    settings: { reduceMotion: false, muted: false },
    isReduced: reduced,
    sound,
    createDiceTray,
    rollOverlay,
    makeDraggable,
    makeDropTarget,
    drag,
    countTo,
    toast,
    floatText,
    goldDust,
    spotlight,
    spotlightEnd,
    press,
  });
  return api;
})();
