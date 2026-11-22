// fx 的聲音：全部即時合成（Web Audio）的 sound（R 效果音、AMB 環境音、心跳耳鳴…）。
// 11-20 從 fx.js 拆出來：內容照原樣搬（縮排也沒動，所以 tools/check/fx_report.cjs、test 掃字串的規則照舊）。
import { api, now, pick, rand } from "./fx_core.js";

  /* =============================================================== SOUND */
  // 全部即時合成（Web Audio），沒有音效檔。三條音軌：sfx 效果音、amb 環境音、heart 心跳與耳鳴（翊文 11-08：三組都做）
  export const sound = (() => {
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
      b.ambDuck = c.createGain(); b.ambDuck.connect(o); // 背景讓路的鈕：amb 先過它（11-22 翊文：「圖書館讀到主線劇情揭露時音樂好像會跟背景音樂重疊」），file(id, g, { duck: true }) 放的時候壓低
      ['sfx', 'amb', 'heart'].forEach((k) => { b[k] = c.createGain(); b[k].gain.value = vol[k]; b[k].connect(k === 'amb' ? b.ambDuck : o); });
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
      defeat(t) { // 合作走不下去：低沉的收尾（庫裡沒有，自己合成）：往下走的小調四個音，最後壹個長長的低音
        [146.83, 130.81, 110, 87.31].forEach((f, i) => tone(t + 0.5 + i * 0.55, { type: 'triangle', f, g: 0.07, a: 0.03, d: 1.7 }));
        tone(t + 0.5, { f: 55, g: 0.09, a: 0.08, d: 3.2 });
        noise(t + 0.5, { type: 'lowpass', f: 260, q: 0.7, g: 0.05, a: 0.4, d: 2.4 });
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
    const want = { amb: null, heart: null, tinnitus: false, unease: 0, mix: null, dread: null, night: null };
    let ambNow = null, heartStop = null, tinNow = null, droneNow = null;
    // 房間的整首曲子（songCycle 的鋼琴、大提琴）每個房間壹個小音量鈕：理智低的恐怖音樂放的時候壓低到 SONG_DREAD_DUCK
    // （11-17 翊文：「理智低的恐怖音樂放的時候 讓房間的鋼琴降低」）。恐怖音樂停了慢慢回到 1
    const SONG_GAINS = new Set(), SONG_DREAD_DUCK = 0.3;
    let songDread = false;
    const songLevel = () => (songDread ? SONG_DREAD_DUCK : 1);
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
    // 音效檔（11-15，翊文給的 Pixabay 素材；清單、來源、授權在 shared/game/sfx_files.js 和 web/public/sfx/來源.md）。
    //   用到才下載（/sfx/<id>.mp3），同壹個檔只抓壹次；抓不到、解不開就安靜，不出錯。
    const FILES = {};
    let lastSfxAt = 0; // 館友按鈕的音效最後壹次響的時間（銀行的環境小聲音避開它，11-16）
    function fileBuf(c, id) {
      if (!FILES[id]) {
        FILES[id] = (typeof fetch === 'function' ? fetch('/sfx/' + id + '.mp3') : Promise.reject())
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
          .then((b) => new Promise((ok, no) => c.decodeAudioData(b, ok, no)))
          .catch(() => null);
      }
      return FILES[id];
    }
    // 壹直循環的檔案（環境音）：像 bed 壹樣回傳 { n, v }，n.stop() 停掉。檔案到了才接上；從隨機位置開始，每次進來聽起來不壹樣
    //   mp3 頭尾有幾十毫秒的空白，循環時各跳過 0.05 秒（檔案本身已經做成頭尾接得起來）
    function fileLoop(c, to, id, gain, fromStart) { // fromStart：整首歌從頭放（環境錄音才從隨機位置開始）
      const v = c.createGain(); v.gain.value = gain; v.connect(to);
      const hh = { v, src: null, dead: false };
      hh.n = { stop() { hh.dead = true; if (hh.src) { try { hh.src.stop(); } catch (e) { /* ignore */ } } } };
      fileBuf(c, id).then((buf) => {
        if (!buf || hh.dead) return;
        const s = c.createBufferSource(); s.buffer = buf; s.loop = true;
        s.loopStart = 0.05; s.loopEnd = Math.max(0.1, buf.duration - 0.05);
        s.connect(v); const o0 = fromStart ? 0.05 : 0.05 + Math.random() * Math.max(0, buf.duration - 0.2); s.start(0, o0); hh.src = s; hh.t0 = c.currentTime; hh.o = o0; hh.d = buf.duration; // t0、o、d：歌詞對時用（nightPos）
      });
      return hh;
    }
    // 誰放的、誰收（11-18 翊文：「圖書館裡待一下子會播放的那個音樂，退出到大廳後還會繼續播放」）：
    //   房間（startAmb）和 songCycle 各有壹個 owner；它放的檔案記在 srcs，換房間時 stop() 把正在放的淡出再真的停掉，
    //   alive 變 false 以後才下載好的檔案也不放（不然等待中離開，到了大廳才突然響）。原本只靠把房間的音量鈕拔掉，曲子其實還在跑
    function owner() {
      const srcs = new Set();
      return {
        alive: true, srcs,
        add(s, v) { const hh = { s, v }; srcs.add(hh); s.onended = () => srcs.delete(hh); },
        stop(c, fade = 0.3) {
          this.alive = false;
          const t = c.currentTime;
          srcs.forEach(({ s, v }) => { try { v.gain.cancelScheduledValues(t); v.gain.setTargetAtTime(0.0001, t, fade); s.stop(t + fade * 4); } catch (e) { /* 已經停了 */ } });
          srcs.clear();
        },
      };
    }
    // 環境音裡偶爾播壹次的檔案（接到 to，不走 sfx 音軌）。own：房間或 songCycle 的 owner（房間裡壹定要給，換房間才停得掉）
    function fileOnce(c, to, id, gain, own) { // 回傳 Promise：這個檔有幾秒（讀不到、已經離開是 null）
      return fileBuf(c, id).then((buf) => {
        if (!buf || (own && !own.alive)) return null;
        const s = c.createBufferSource(), v = c.createGain();
        s.buffer = buf; v.gain.value = gain; s.connect(v); v.connect(to); s.start();
        if (own) own.add(s, v);
        return buf.duration;
      }, () => null);
    }
    // 房間偶爾放的整首曲子（11-16 翊文：「播完後安靜20秒左右再撥」）：壹首播完才開始算，安靜 15～25 秒再放下壹首（ids 輪流）；進房間也先安靜 15～25 秒。回傳停止函式（跟 every 壹樣放進 timers）
    //   duck：房間原本的合成旋律接在這個 GainNode 上；曲子放的時候它淡出、播完前 2 秒淡回來，兩首不會疊在壹起（11-16 翊文：「圖書館兩個音樂好像會重疊」）
    function songCycle(c, g0, ids, gain, first, duck) { // first：進房間先安靜幾毫秒 [最少, 最多]，沒給是 15～25 秒
      const own = owner(); // 停的時候：計時器取消、正在放的曲子淡出停掉、還在下載的不放
      let id = null, k = (Math.random() * ids.length) | 0;
      const g = c.createGain(); g.gain.value = songLevel(); g.connect(g0); SONG_GAINS.add(g); // 曲子先過這個鈕（恐怖音樂時壓低），再進房間
      const wait = (ms) => { id = setTimeout(play, ms); };
      const ducked = (d) => {
        if (!duck || !d) return;
        const t = c.currentTime, p = duck.gain;
        p.cancelScheduledValues(t); p.setTargetAtTime(0, t, 0.6); p.setTargetAtTime(1, t + Math.max(1, d - 2), 1.2);
      };
      const play = () => { if (!own.alive) return; fileOnce(c, g, ids[k++ % ids.length], gain, own).then((d) => { if (!own.alive) return; ducked(d); wait((d || 60) * 1000 + rand(15000, 25000)); }); };
      wait(first ? rand(first[0], first[1]) : rand(15000, 25000));
      return () => { clearTimeout(id); own.stop(c, 0.4); SONG_GAINS.delete(g); };
    }
    // 「失敗作之夜」那週（每週特展 failedOnly）：大廳、展廳很久才冒壹小段走音的音樂盒（11-16 翊文，Pixabay「creepy music box」）。mix({ creepy }) 開關，第壹次不響
    function creepyHook(c, g, own) {
      const st = { on: false, n: 0 };
      const timer = every(() => { if (st.n++ && st.on) fileOnce(c, g, 'creepy-box-short', 0.3, own); }, () => rand(150000, 300000));
      return { timer, mix(m) { if (m && m.creepy != null) st.on = !!m.creepy; } };
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
      lobby(c, g, own) {
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
        // 11-16 翊文：「大廳有限定活動時可以改成這首」「人潮很多的時候用這首」：旋律接在 mel 上，換成那兩首時 mel 淡出（下面的 mix）
        const mel = c.createGain(); mel.gain.value = 1; mel.connect(g);
        const send = echoSend(c, mel, 0.45, 0.3);
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
          PAD[ch].forEach((f) => tone(t0, { f, g: 0.007, a: 1, d: E8 * 8 + 0.6, to: mel })); // 弦樂墊底
        };
        const sched = every(() => { while (next < c.currentTime + 3) { play(next, bar); bar = (bar + 1) % PROG.length; next += E8 * 8; } }, () => 1000);
        const steps = every(() => farSteps(c, g, 0.01), () => rand(8000, 15000));
        const ck = creepyHook(c, g, own);
        // 兩首翊文用 Suno 做的（11-16）：限時活動進行中放 lobby-event、人潮很多放 lobby-crowd（活動優先）；都沒有放原本的旋律。第壹次要放才下載
        // 11-16 翊文：「平常時大廳可以放這首」（Welcome Lobby）：平常放 lobby-normal，原本的合成旋律收起來（mel ＝ 0，程式留著）
        // 11-16 翊文：照理智換：低於 55「Familiar Melody, Subly Wrong」、低於 30「Lobby Silence」、低於 15 到 0 放原本的合成旋律（門檻 NUM.ui.lobbySan，理智優先於活動、人潮）
        const SONG_ID = { night: 'lobby-night', normal: 'lobby-normal', event: 'lobby-event', crowd: 'lobby-crowd', wrong: 'lobby-wrong', silence: 'lobby-silence' };
        const song = { night: null, normal: null, event: null, crowd: null, wrong: null, silence: null }, state = { event: false, crowd: false, night: false, tier: null }; // tier：理智那壹段（"wrong"／"silence"／"synth"／null），門檻在 ui_core.js 算
        const songStop = { stop() { for (const k of Object.keys(song)) if (song[k]) song[k].n.stop(); } };
        mel.gain.value = 0;
        const apply = () => {
          const t = c.currentTime, pick = state.tier || (state.event ? 'event' : state.crowd ? 'crowd' : state.night ? 'night' : 'normal'); // 11-20 翊文：深夜（台灣 23:30～05:00）大廳平常放 lobby-night；理智低、活動、人潮優先
          mel.gain.setTargetAtTime(pick === 'synth' ? 1 : 0, t, 1.2); want.night = pick === 'night' ? song.night : null;
          if (pick !== 'synth' && !song[pick]) song[pick] = fileLoop(c, g, SONG_ID[pick], 0, true);
          for (const k of Object.keys(song)) if (song[k]) song[k].v.gain.setTargetAtTime(pick === k ? (k === 'night' ? 0.7 : 0.45) : 0, /* 11-21 翊文：深夜那首「音量再調高」：只拉高這首 */ t, k === pick && t < 2 ? 0.3 : 1.2);
        };
        const mix = (m) => {
          ck.mix(m);
          if (!m || !('event' in m || 'crowd' in m || 'night' in m || 'tier' in m)) return;
          if ('event' in m) state.event = !!m.event;
          if ('crowd' in m) state.crowd = !!m.crowd; if ('night' in m) state.night = !!m.night;
          if ('tier' in m) state.tier = ['wrong', 'silence', 'synth'].includes(m.tier) ? m.tier : null;
          apply();
        };
        apply();
        return { nodes: [...murmur(c, g, 0.004), fileLoop(c, g, 'museum-hall', 0.18).n, songStop], timers: [sched, steps, ck.timer], mix }; // 11-15：大廳也墊壹點博物館人聲錄音（Pixabay），比展廳小聲
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
        // 11-17 翊文：「這首手作坊多人的時候可以放」：木琴、低音、和弦、沙鈴接在 mus 上，人多（mix busy）時淡出換 workshop-crowd；剪刀聲照舊
        const mus = c.createGain(); mus.connect(g);
        const ws = { song: null };
        const send = echoSend(c, mus, E8 * 3, 0.18);
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
            tone(t, { type: 'triangle', f, g: 0.06, a: 0.004, d: 0.3, to: mus });
            tone(t, { f: f * 2, g: 0.018, a: 0.004, d: 0.18, to: mus });
          });
          [2, 6].forEach((i) => CHORD[ch].forEach((f) => tone(t0 + i * E8 + 0.01, { type: 'triangle', f, g: 0.014, a: 0.003, d: 0.16, to: mus }))); // 反拍的小和弦
          if (b % 2 === 0) noise(t0 + 4 * E8, { type: 'highpass', f: 6000, q: 0.7, g: 0.008, a: 0.001, d: 0.03, to: mus }); // 輕輕的沙鈴
        };
        const sched = every(() => { while (next < c.currentTime + 3) { play(next, bar); bar = (bar + 1) % MEL.length; next += E8 * 8; } }, () => 1000);
        const snip = every(() => { const t = c.currentTime + 0.05; [0, 0.09].forEach((dt) => noise(t + dt, { type: 'highpass', f: 3500, q: 1.5, g: 0.018, a: 0.001, d: 0.025, to: g })); }, () => rand(7000, 14000)); // 偶爾剪刀喀擦
        const songStop = { stop() { if (ws.song) ws.song.n.stop(); } };
        return {
          nodes: [songStop], timers: [sched, snip],
          mix(m) {
            if (!m || !('busy' in m)) return;
            const on = !!m.busy, t = c.currentTime;
            if (on && !ws.song) ws.song = fileLoop(c, g, 'workshop-crowd', 0, true);
            mus.gain.setTargetAtTime(on ? 0 : 1, t, 1.2);
            if (ws.song) ws.song.v.gain.setTargetAtTime(on ? 0.45 : 0, t, 1.2);
          },
        };
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
        // 11-15 翊文：委託櫃台放大提琴；原本的翻紙、蓋章、櫃台鈴照舊。11-16：播完安靜約 20 秒再放（songCycle）
        const cello = songCycle(c, g, ['cello-commission'], 0.4, [300, 600]); // 11-16 翊文：「在廳裡等8秒左右就可以撥放了」→「改成一進去就撥放好了」
        return { nodes: [room.n], timers: [paper, stampT, ding, cello] };
      },
      codex(c, g) { // 圖鑑室：很安靜，時鐘滴答，偶爾翻頁
        const room = bed(c, g, 'lowpass', 180, 0.5, 0.03);
        let tk = 0;
        const clock = every(() => noise(c.currentTime + 0.05, { type: 'bandpass', f: tk++ % 2 ? 2600 : 3200, q: 6, g: 0.012, a: 0.001, d: 0.02, to: g }), () => 1000);
        const page = every(() => noise(c.currentTime + 0.05, { type: 'bandpass', f: 1400, f2: 4000, q: 0.8, g: 0.015, a: 0.05, d: 0.2, to: g }), () => rand(7000, 14000));
        return { nodes: [room.n], timers: [clock, page] };
      },
      // 圖書館：古老、神秘、慢慢的（Claude 自己寫的，不是任何現成的歌）。
      // 11-08 翊文：「這裡怎麼沒有圖書館？還有他的音樂呢」→ 原本只有老時鐘、木頭嘎吱、翻頁，加上音樂，這些留著當點綴。
      // D 小調（多利安），Dm → C → B♭ → A，風琴般的和弦墊底，豎琴般的旋律有長長的回音；老時鐘跟著拍子走（每拍滴、答）
      origin(c, g, own) {
        const Q = 0.8; // 四分音符
        const PAD = [[146.83, 220, 293.66, 349.23], [130.81, 196, 261.63, 329.63], [116.54, 174.61, 233.08, 293.66], [110, 164.81, 220, 277.18]];
        const MEL = [
          [587.33, 0, 698.46, 659.25], [523.25, 0, 0, 0], [466.16, 523.25, 587.33, 0], [554.37, 0, 0, 0],
          [880, 0, 783.99, 698.46], [659.25, 0, 523.25, 0], [587.33, 0, 466.16, 523.25], [440, 0, 0, 0],
        ];
        // 11-16：合成的風琴＋旋律接在 syn 上（鋼琴放的時候淡出），syn 再接 calmG（打開禁書頁籤時連鋼琴壹起淡出，只留 Suspense）
        const calmG = c.createGain(); calmG.connect(g);
        const syn = c.createGain(); syn.connect(calmG);
        const send = echoSend(c, syn, 0.6, 0.35);
        let next = c.currentTime + 0.1, bar = 0, tk = 0;
        const play = (t0, b) => {
          PAD[b % 4].forEach((f) => { tone(t0, { f, g: 0.013, a: 1.2, d: Q * 4 + 0.8, to: syn }); tone(t0, { f: f * 3, g: 0.0025, a: 1.4, d: Q * 4, to: syn }); }); // 風琴
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
        // 11-15 翊文給的音樂：圖書館「某些時候」放（原本的音樂照舊保留）。鋼琴 每 1～2 分鐘輕輕放壹次（兩首輪流），升高音 1～2 分鐘壹次、很小聲；進房間第壹次不響
        let pu = 0;
        const piano = songCycle(c, calmG, ['lib-piano-a', 'lib-piano-b'], 0.4, null, syn); // 11-16：兩首輪流，播完安靜約 20 秒再放；放的時候合成旋律淡出
        const pulse = every(() => { if (!pu++) return; fileOnce(c, g, 'pulse-rise', 0.22, own); }, () => rand(60000, 120000));
        const fb = fileLoop(c, g, 'suspense-forbidden', 0); // 禁書頁籤（11-16 翊文，Pixabay「Suspense Tension」）：mix({ forbidden })
        return { nodes: [fb.n], timers: [sched, creak, page, piano, pulse], mix(m) { if (m && 'forbidden' in m) { fb.v.gain.setTargetAtTime(m.forbidden ? 0.32 : 0, c.currentTime, 1.5); calmG.gain.setTargetAtTime(m.forbidden ? 0 : 1, c.currentTime, 1.5); } } };
      },
      hall(c, g, own) { // 我的展廳：明亮壹點的弦樂和聲，遠處有人聲
        const room = bed(c, g, 'lowpass', 200, 0.5, 0.025);
        const CH = [[293.66, 369.99, 440], [329.63, 415.3, 493.88], [261.63, 329.63, 392], [293.66, 349.23, 440]];
        let k = 0;
        const pad = every(() => { const t = c.currentTime + 0.05, ch = CH[k++ % CH.length]; ch.forEach((f) => { tone(t, { f, g: 0.011, a: 2, d: 4.4, to: g }); tone(t, { f: f * 2, g: 0.003, a: 2.2, d: 3.6, to: g }); }); }, () => 5000);
        // 11-15 翊文：「這個不知道適不適合放博物館大廳或展廳」：加博物館大廳的人聲錄音（Pixabay「museum hall big echo group」）墊在弦樂底下
        const ck = creepyHook(c, g, own);
        return { nodes: [room.n, ...murmur(c, g, 0.005), fileLoop(c, g, 'museum-hall', 0.3).n], timers: [pad, ck.timer], mix: ck.mix };
      },
      library(c, g) { // 圖庫：音樂盒，五聲音階隨意彈，有回音
        const send = echoSend(c, g, 0.36, 0.35);
        const NOTES = [1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093];
        // 11-16 翊文：理智很低時，音樂盒換成走音的那首（Pixabay「creepy music box」）：mix({ dread: "low"|"edge"|null })，low 以下就換
        const st = { creepy: false };
        const cb = fileLoop(c, g, 'creepy-box', 0);
        const box = every(() => { if (st.creepy) return; const t = c.currentTime + 0.05, f = NOTES[(Math.random() * NOTES.length) | 0]; tone(t, { f, g: 0.02, a: 0.002, d: 1.1, to: send }); tone(t, { f: f * 3, g: 0.003, a: 0.002, d: 0.4, to: send }); }, () => rand(900, 2600));
        return { nodes: [cb.n], timers: [box], mix(m) { if (!m || !('dread' in m)) return; st.creepy = !!m.dread; cb.v.gain.setTargetAtTime(st.creepy ? (m.dread === 'edge' ? 0.45 : 0.32) : 0, c.currentTime, 1.5); } };
      },
      office(c, g) { // 館長室：落地鐘、羽毛筆、壁爐
        const fire = bed(c, g, 'lowpass', 300, 0.7, 0.03);
        let tk = 0;
        const clock = every(() => { const t = c.currentTime + 0.05; tone(t, { type: 'triangle', f: tk++ % 2 ? 420 : 520, g: 0.016, a: 0.001, d: 0.12, to: g }); noise(t, { type: 'bandpass', f: 1200, q: 5, g: 0.01, a: 0.001, d: 0.03, to: g }); }, () => 1000);
        const quill = every(() => { const t = c.currentTime + 0.1; for (let i = 0; i < 3; i++) noise(t + i * 0.18, { type: 'bandpass', f: rand(3000, 4500), q: 4, g: 0.012, a: 0.01, d: 0.12, to: g }); }, () => rand(6000, 12000));
        const crackle = every(() => noise(c.currentTime + 0.02, { type: 'highpass', f: rand(1500, 3500), q: 1, g: rand(0.006, 0.02), a: 0.001, d: rand(0.008, 0.02), to: g }), () => rand(200, 900));
        const cello = songCycle(c, g, ['cello-commission'], 0.4, [300, 600]); // 11-16 翊文：「館長室也先播一樣的大提琴」：跟委託櫃台同壹首，壹進去就放，播完安靜約 20 秒再放
        return { nodes: [fire.n], timers: [clock, quill, crackle, cello] };
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
        const syn = c.createGain(); syn.connect(g); // 11-16：合成弦樂（和腳步回音）接在 syn 上，鋼琴放的時候淡出
        send.connect(syn); send.connect(dl); dl.connect(fb); fb.connect(dl); fb.connect(syn);
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
        // 11-16 翊文：畫廊放 nostalgic／Welte 鋼琴，兩首輪流，播完安靜約 20 秒再放（songCycle）
        const nost = songCycle(c, g, ['gallery-nostalgic', 'gallery-welte'], 0.4, null, syn);
        return { nodes: [room.n], timers: [pad, steps, nost] };
      },
      cellar(c, g, own) { // 地下收藏庫：照「第幾層」和「在做什麼」換聲音（11-15 翊文：「看看每層地下室適合那些聲音，以及打鬥或房間探索」→「照這個做」）
        // 錄音都是 Pixabay（來源在 shared/game/sfx_files.js）。ui_core.js 的 audioState 用 ambMix({ floor, mode }) 告訴這裡現在在哪；沒告訴（選樓層的地方）用 base。
        //   mode：map 看地圖、選路／explore 房間探索／fight 遇到怪物／gate 守門／rest 休息點
        //   每層：bed＝三條底音的音量（wind 風、basement 地下室錄音、sewer 下水道管線）；odd＝偶爾冒出來的聲音；gap＝幾秒冒壹次；drip 合成的滴水；coming＝會不會很久壹次「有人來了」
        const FLOOR = {
          base: { bed: { wind: 0.22, basement: 0.4, sewer: 0, cave: 0.35 }, odd: ['echo-dungeon', 'echo-far', 'basement-noise', 'basement-noise'], gap: [35, 80], drip: 0, coming: true }, // 選樓層的大廳：滴水用洞穴錄音（cave），不放各層的 drips
          1: { bed: { wind: 0.1, basement: 0, sewer: 0.35 }, odd: ['cave-drops', 'basement-noise', 'basement-knock'], gap: [35, 80], drip: 1 }, // 積灰的儲藏室：滴水的水管
          2: { bed: { wind: 0.3, basement: 0.3, sewer: 0 }, odd: ['echo-far', 'basement-noise', 'basement-knock', 'creepy-box-short'], gap: [40, 90], drip: 0.5 }, // 雕像廳：很冷
          3: { bed: { wind: 0.08, basement: 0.4, sewer: 0 }, odd: ['echo-dungeon', 'echo-dungeon', 'basement-noise', 'basement-knock'], gap: [35, 80], drip: 0.3, coming: true }, // 空畫框的走廊：長走廊的回音
          4: { bed: { wind: 0.05, basement: 0, sewer: 0.5, waves: 0.25 }, odd: ['cave-drops', 'cave-drops', 'echo-far', 'bubbles'], gap: [20, 50], drip: 1.6 }, // 淹水的檔案室
          5: { bed: { wind: 0.05, basement: 0, sewer: 0, void: 0.3 }, odd: ['echo-far'], gap: [90, 180], drip: 0 }, // 很大的白色房間：故意很空，只有很低的「虛空回響」（Pixabay「Echo of the Void」）
        };
        // 在做什麼：bed 底音乘幾倍、gapK 冒聲音的間隔乘幾倍（0＝不冒）、dripK 滴水
        const MODE = { map: { bed: 1, gapK: 1, dripK: 1 }, explore: { bed: 0.7, gapK: 0.6, dripK: 1 }, fight: { bed: 0.35, gapK: 0, dripK: 0.3 }, gate: { bed: 0.2, gapK: 0, dripK: 0 }, gate2: { bed: 0.15, gapK: 0, dripK: 0 }, rest: { bed: 0, gapK: 0, dripK: 0, wind: 0.08 } };
        const b = bed(c, g, 'bandpass', 420, 1.1, 0.035); // 合成的風，墊底
        const L = { wind: fileLoop(c, g, 'wind', 0), basement: fileLoop(c, g, 'basement-ambience', 0), sewer: fileLoop(c, g, 'sewer-pipe', 0), void: fileLoop(c, g, 'void-echo', 0), drips: fileLoop(c, g, 'water-drips', 0), cave: fileLoop(c, g, 'cave-drips', 0), waves: fileLoop(c, g, 'waves', 0) }; // cave：選樓層大廳的洞穴滴水；waves：B4 的水波（11-16 翊文） // drips：11-16 翊文「這可以改成地下室廳的水聲特效」，取代合成的滴水，音量照每層的 drip
        const nodes = [b.n, lfo(c, 0.11, 260, b.fl.frequency), lfo(c, 0.17, 0.015, b.v.gain), L.wind.n, L.basement.n, L.sewer.n, L.void.n, L.drips.n, L.cave.n, L.waves.n];
        // 11-15 翊文給的音樂（Pixabay，shared/game/sfx_files.js）：用到才下載（lazy）。戰鬥＝ready-fight、守門＝stairs-boss、B2～B5 平常＝緊張的 suspense-*（B1 不放）
        const LZ = {};
        const music = (id, v, fade) => { // v＝這個狀態要多大聲；0 而且還沒建過就不建（不下載）
          if (!LZ[id]) { if (v <= 0) return; LZ[id] = fileLoop(c, g, id, 0); nodes.push(LZ[id].n); }
          LZ[id].v.gain.setTargetAtTime(v, c.currentTime, fade);
        };
        const SUSP = { 1: 'suspense-e', 2: 'suspense-d', 3: 'suspense-a', 4: 'suspense-b', 5: 'suspense-c' };
        const cur = { f: FLOOR.base, m: MODE.map, mode: 'map' };
        const apply = (fade) => {
          const t = c.currentTime;
          Object.keys(L).forEach((k) => {
            const v = k === 'drips' ? 0.28 * Math.min(1.6, cur.f.drip || 0) * (cur.m.dripK || 0) : cur.mode === 'rest' ? (k === 'wind' ? cur.m.wind : 0) : (cur.f.bed[k] || 0) * cur.m.bed;
            L[k].v.gain.setTargetAtTime(v, t, fade);
          });
        };
        const applyMusic = (fade) => {
          const md = cur.mode, fl = cur.floorNo;
          music('ready-fight', md === 'fight' && !cur.trial && (cur.rank || 0) < 3 ? 0.45 : 0, fade);
          music('fight-gladiator', md === 'fight' && !cur.trial && (cur.rank || 0) >= 3 ? 0.45 : 0, fade); // 11-16 翊文：等級 3 的強怪換成 Dark Gladiator（Pixabay）
          music('gate-viking', md === 'gate' ? 0.5 : md === 'gate2' ? 0.18 : 0, fade); // 11-16 翊文：守門第壹階段換成 Viking Battle（Pixabay），原本的 stairs-boss 不用了
          music('war-drums', md === 'fight' && cur.trial ? 0.45 : 0, fade); // 合作試煉的打鬥：戰鼓（11-16）
          music('horror-gate', md === 'gate2' && !(fl >= 3) ? 0.5 : 0, fade); // 守門第二階段：B1、B2 更陰森
          music('gate2-deep', md === 'gate2' && fl >= 3 ? 0.5 : 0, fade); // 11-16 翊文「某些怪物第二階段」：B3～B5 的守門換成 Suspense Music Cinematic（Pixabay） // 守門第二階段：更陰森
          Object.keys(SUSP).forEach((k) => music(SUSP[k], fl === +k && (md === 'map' || md === 'explore') ? (+k === 1 ? 0.2 : 0.3) : 0, fade));
        };
        apply(0.01);
        let oddN = 0, comeN = 0, lastOdd = 0; // every 會先跑壹次：第壹次跳過，進來不會馬上冒怪聲
        const odd = every(() => {
          if (!oddN++ || !cur.m.gapK) return;
          const now2 = Date.now(), gap = cur.f.gap[0] * cur.m.gapK * 1000;
          if (now2 - lastOdd < gap) return; lastOdd = now2;
          fileOnce(c, g, pick(cur.f.odd), rand(0.12, 0.2), own);
        }, () => rand(cur.f.gap[0], cur.f.gap[1]) * 1000 * (cur.m.gapK || 1));
        const coming = every(() => { if (comeN++ && cur.f.coming && cur.m.gapK) fileOnce(c, g, 'someone-coming', 0.16, own); }, () => rand(150000, 300000));
        const drip = () => {}; // 11-16：合成的滴水換成錄音（L.drips，音量在 apply 照 drip 算），這裡留壹個空的讓 timers 照舊
        return {
          nodes, timers: [drip, odd, coming],
          mix(m) { // { floor: 1～5 或 null, mode }：換層、換狀態時慢慢淡過去；剛遇到怪物（進 fight／gate）播壹次「有人來了」
            if (!m || m.mode == null) return;
            const f = FLOOR[m.floor] || FLOOR.base, md = MODE[m.mode] || MODE.map;
            const FG = (x) => x === 'fight' || x === 'gate' || x === 'gate2';
            const into = FG(m.mode) && !FG(cur.mode), to2 = m.mode === 'gate2' && cur.mode === 'gate';
            if (f === cur.f && m.mode === cur.mode && (m.rank || 0) === (cur.rank || 0) && !!m.trial === !!cur.trial) return;
            cur.f = f; cur.m = md; cur.mode = m.mode; cur.floorNo = m.floor || null; cur.rank = m.rank || 0; cur.trial = !!m.trial;
            apply(1.5); applyMusic(1.5);
            if (to2) { fileOnce(c, g, 'impact-boom', 0.6, own); setTimeout(() => fileOnce(c, g, 'pulse-rise', 0.5, own), 450); } // 11-16 翊文：進第二階段先「轟」壹聲（Pixabay「Cinematic Impact Boom 05」） // 守門進第二階段：再劍戰壹下
            if (into) { fileOnce(c, g, 'someone-coming', m.mode === 'gate' ? 0.3 : 0.24, own); fileOnce(c, g, m.mode === 'gate' ? 'boss-intro' : 'basement-noise', m.mode === 'gate' ? 0.65 : 0.5, own); } // 遇到怪物：地下的怪聲（11-16 翊文：「打鬥時的刀劍音效跟我們實際做的事情不太配合」——推、安撫、擋都不是拿劍，原本的 sword-fight 拿掉）；守門：Boss 登場
          },
        };
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
      // 賭場：爵士感的走路低音＋刷子鼓＋電鋼琴的零星和弦（Claude 自己寫的，不是任何現成的歌）。
      // 翊文 11-15：賭場、銀行要有背景樂和環境音。D 小調 ii–V–I：Dm7 → G7 → Cmaj7 → A7 ｜ Dm7 → G7 → Cmaj7 → Cmaj7，96 拍、搖擺感，壹圈 8 小節約 20 秒。
      // 人聲底噪（濾波雜訊）的音量、籌碼碰撞的頻率，跟「熱鬧」連動：ui_core 的 audioState 把 shared/social/room_mood.js 的 ambMix(heat) 傳進來（ambMix(m)），這裡不寫門檻
      casino(c, g) {
        const B = 0.625, SW = B * 0.62; // 壹拍；搖擺：後半拍晚壹點
        const BASS = [[73.42, 87.31, 110, 92.5], [98, 123.47, 146.83, 69.3], [65.41, 82.41, 98, 103.83], [110, 138.59, 82.41, 69.3],
          [73.42, 87.31, 110, 92.5], [98, 123.47, 146.83, 69.3], [65.41, 82.41, 98, 103.83], [65.41, 82.41, 98, 82.41]];
        const KEYS = [[174.61, 220, 261.63, 329.63], [174.61, 246.94, 293.66, 392], [164.81, 196, 246.94, 329.63], [196, 220, 277.18, 329.63],
          [174.61, 220, 261.63, 329.63], [174.61, 246.94, 293.66, 392], [164.81, 196, 246.94, 329.63], [164.81, 196, 246.94, 329.63]];
        const cur = { crowd: 0.008, chipMin: 7000, chipMax: 13000, chipN: 2 }; // 還沒收到 ambMix 之前的備用值（=平常）；真正的數字在 shared/social/room_mood.js
        const crowdG = c.createGain(); crowdG.gain.value = cur.crowd; crowdG.connect(g);
        // 11-15：人聲改用真的賭場錄音（Pixabay「Casino Ambiance」），合成的 murmur 降低留著墊底（檔案還沒下載完時也有聲音）；兩個都跟熱鬧連動（crowdG）
        const nodes = murmur(c, crowdG, 1.5);
        nodes.push(fileLoop(c, crowdG, 'casino-ambiance', 30).n);
        // 11-15 翊文：「拿掉沙沙聲」：原本這裡有壹條 1500 Hz 的帶通雜訊（比較散的人聲），聽起來像白噪音，拿掉了；只留 murmur 的低沉人聲
        // 11-16 翊文：「賭場裡超過35人就改播這個」（Pixabay「Copper Nights」）：合成的爵士接在 mus 上，人多時 mus 淡出、換那首（用到才下載）；人聲、籌碼照舊
        const mus = c.createGain(); mus.gain.value = 1; mus.connect(g);
        const jz = { song: null }, jzStop = { stop() { if (jz.song) jz.song.n.stop(); } }; nodes.push(jzStop);
        const send = echoSend(c, mus, B * 1.5, 0.22);
        let next = c.currentTime + 0.1, bar = 0;
        const play = (t0, b) => {
          BASS[b].forEach((f, i) => { // 走路低音：三角波加壹點高八度，筆電喇叭才聽得到
            const t = t0 + i * B;
            tone(t, { type: 'triangle', f, g: 0.075, a: 0.012, d: 0.5, to: mus });
            tone(t, { f: f * 2, g: 0.04, a: 0.01, d: 0.25, to: mus });
          });
          for (let i = 0; i < 4; i++) { // 刷子：每拍輕輕的 ride、2 和 4 拍重壹點
            const t = t0 + i * B;
            noise(t, { type: 'highpass', f: 5500, q: 0.7, g: i % 2 ? 0.014 : 0.006, a: 0.002, d: i % 2 ? 0.1 : 0.05, to: mus });
            if (i !== 1 && i !== 3) noise(t + SW, { type: 'highpass', f: 7000, q: 0.7, g: 0.005, a: 0.002, d: 0.04, to: mus });
          }
          const stabs = b % 2 ? [1.5, 3.5] : [1.5]; // 電鋼琴的零星和弦：落在反拍
          stabs.forEach((bt) => KEYS[b].forEach((f, k) => {
            const t = t0 + (bt - 1) * B + SW + k * 0.012;
            tone(t, { f, g: 0.02, a: 0.004, d: 0.7, to: send });
            tone(t, { f: f * 2, g: 0.003, a: 0.002, d: 0.2, to: send });
          }));
        };
        const sched = every(() => { while (next < c.currentTime + 3) { play(next, bar); bar = (bar + 1) % BASS.length; next += B * 4; } }, () => 1000);
        const chips = every(() => { // 籌碼碰撞：幾下很短的瓷器「喀喀」
          const n = 1 + ((Math.random() * cur.chipN) | 0), t = c.currentTime + 0.05;
          for (let i = 0; i < n; i++) {
            const tt = t + i * rand(0.04, 0.08), f = rand(2400, 4200);
            noise(tt, { type: 'bandpass', f, q: 6, g: 0.03, a: 0.001, d: 0.035, to: g });
            tone(tt, { f: f * 0.8, g: 0.012, a: 0.001, d: 0.05, to: g });
          }
        }, () => rand(cur.chipMin, cur.chipMax));
        return {
          nodes, timers: [sched, chips],
          mix(m) { // 熱絡 → 人聲大聲、籌碼聲變多（地下的 { floor, mode } 不理）；busy（超過 35 人）→ 換 Copper Nights
            if (m && 'busy' in m) {
              const on = !!m.busy, t = c.currentTime;
              if (on && !jz.song) jz.song = fileLoop(c, g, 'casino-jazz', 0, true);
              mus.gain.setTargetAtTime(on ? 0 : 1, t, 1.2);
              if (jz.song) jz.song.v.gain.setTargetAtTime(on ? 0.5 : 0, t, 1.2);
            }
            if (!m || m.crowd == null) return;
            cur.crowd = m.crowd; cur.chipMin = m.chipMin; cur.chipMax = m.chipMax; cur.chipN = m.chipN;
            crowdG.gain.setTargetAtTime(Math.max(0.0001, m.crowd), c.currentTime, 1.2);
          },
        };
      },
      // 銀行：沉穩的電鋼琴和弦、偶爾的硬幣聲、很淡的大廳空氣（Claude 自己寫的，不是任何現成的歌）。
      // C 大調 Cmaj7 → Am7 → Fmaj7 → G6，每個和弦壹小節（3.6 秒），壹圈約 14 秒；慢、低、沒有鼓，有長長的迴響
      bank(c, g, own) {
        const BAR = 3.6;
        const ROOT = [130.81, 110, 87.31, 98];
        const CH = [[261.63, 329.63, 392, 493.88], [220, 261.63, 329.63, 392], [220, 261.63, 349.23, 440], [246.94, 293.66, 392, 493.88]];
        const BELL = [659.25, 783.99, 880, 1046.5, 987.77];
        const send = echoSend(c, g, 0.55, 0.32);
        const nodes = [];
        const air = bed(c, g, 'lowpass', 520, 0.4, 0.012); nodes.push(air.n, lfo(c, 0.06, 0.006, air.v.gain), lfo(c, 0.04, 140, air.fl.frequency)); // 大廳的空氣
        const hum = bed(c, g, 'bandpass', 900, 2, 0.004); nodes.push(hum.n); // 遠處櫃台的人聲，很淡
        let next = c.currentTime + 0.1, bar = 0;
        const play = (t0, b) => {
          CH[b].forEach((f, i) => { // 慢慢攤開的和弦
            tone(t0 + i * 0.09, { f, g: 0.05, a: 0.012, d: 2.8, to: send });
            tone(t0 + i * 0.09, { type: 'triangle', f, g: 0.02, a: 0.01, d: 1.4, to: send });
          });
          tone(t0, { f: ROOT[b], g: 0.09, a: 0.03, d: 3.4, to: g }); tone(t0, { f: ROOT[b] * 2, g: 0.014, a: 0.03, d: 2, to: g }); // 低音壹下
          if (Math.random() < 0.55) { // 偶爾壹顆高音，像櫃台的叮
            const f = BELL[(Math.random() * BELL.length) | 0];
            tone(t0 + rand(1.2, 2.8), { f, g: 0.025, a: 0.004, d: 1.6, to: send });
          }
        };
        // 11-20 翊文：「銀行的背景音樂可以換這個嗎（其他背景音效還是要留下），然後原本的合成器也留著備用」：
        //   背景音樂改放翊文給的曲子 bank-music（壹進去就放，跟委託櫃台的大提琴同壹套 songCycle，離開淡出停掉）；
        //   上面的合成和弦、低音整段留著，BANK_SYNTH 改成 true 就換回來（大廳的空氣、遠處人聲、硬幣、點硬幣、打字機照舊）
        const BANK_SYNTH = false;
        const sched = BANK_SYNTH ? every(() => { while (next < c.currentTime + 3) { play(next, bar); bar = (bar + 1) % CH.length; next += BAR; } }, () => 1000) : songCycle(c, g, ['bank-music'], 0.4, [300, 600]);
        // 11-16 翊文：「銀行有時候也可以有這個聲音（打字機），但不要跟其他音效疊加」：銀行的環境小聲音（硬幣、點硬幣、打字機）共用壹個空檔，
        //   壹個在響的時候別的不響；館友按鈕的音效（sfx 音軌，lastSfxAt）剛響過 4 秒內也不響
        let quietUntil = 0;
        const slot = (sec) => { const t0 = c.currentTime; if (t0 < quietUntil || now() - lastSfxAt < 4000) return false; quietUntil = t0 + sec; return true; };
        const coins = every(() => { // 硬幣：兩三下金屬的「叮鈴」
          if (!slot(1.5)) return;
          const t = c.currentTime + 0.05, n = 2 + ((Math.random() * 2) | 0);
          for (let i = 0; i < n; i++) {
            const tt = t + i * rand(0.05, 0.1), f = rand(2800, 3600);
            tone(tt, { f, g: 0.016, a: 0.001, d: 0.28, to: send });
            tone(tt, { f: f * 1.51, g: 0.007, a: 0.001, d: 0.14, to: send });
            noise(tt, { type: 'highpass', f: 6500, q: 1, g: 0.008, a: 0.001, d: 0.02, to: g });
          }
        }, () => rand(9000, 19000));
        const counting = every(() => { if (slot(10.5)) fileOnce(c, g, 'coins-counting', 0.12, own); }, () => rand(25000, 50000));
        let twN = 0; const typing = every(() => { if (twN++ && slot(6.5)) fileOnce(c, g, pick(['typewriter', 'keyboard']), 0.16, own); }, () => rand(60000, 120000)); // 遠處的打字機（Pixabay「Type Writer」），第壹次不響 // 11-15：遠處櫃台點硬幣（Pixabay「Coins Counting」）
        return { nodes, timers: [sched, coins, counting, typing] };
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
      const own = owner(); // 這個房間放的單次檔案（fileOnce），換房間時淡出停掉
      const hnd = AMB[type](c, g, own);
      if (hnd.mix && want.mix) hnd.mix(want.mix);
      return {
        type,
        timers: hnd.timers,
        mix: hnd.mix ? (m) => hnd.mix(m) : null,
        stop() {
          const t = c.currentTime;
          (hnd.timers || []).forEach((s) => s());
          own.stop(c);
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
    const dreadLz = {};
    function dreadMusic(c, id, v) {
      if (!dreadLz[id]) { if (v <= 0) return; dreadLz[id] = fileLoop(c, bus.heart, id, 0); }
      dreadLz[id].v.gain.setTargetAtTime(v, c.currentTime, 1.4);
    }
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
      // 理智低的恐怖音樂（11-15）：理智 < 45 low、<= 15 edge、發作時再疊壹首；用到才下載，慢慢淡進淡出（跟心跳、不安低鳴是不同層）
      const dr = isOn('heart') ? want.dread : null;
      const sd = dr === 'low' || dr === 'edge' || !!tn; // 恐怖音樂有在放：房間的曲子壓低，停了再回來
      if (sd !== songDread) { songDread = sd; SONG_GAINS.forEach((sg) => { try { sg.gain.setTargetAtTime(songLevel(), c.currentTime, 1.5); } catch (e) { /* ignore */ } }); }
      dreadMusic(c, 'horror-low', dr === 'low' ? 0.42 : 0); dreadMusic(c, 'horror-edge', dr === 'edge' ? 0.5 : 0); dreadMusic(c, 'horror-bout', tn ? 0.38 : 0);
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
        lastSfxAt = tn; fn(c.currentTime + 0.01, arg);
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
      nightPos() { const hh = want.night, c = ctx(); if (!hh || !hh.src || !c || !isOn('amb')) return null; const L = hh.d - 0.1; return 0.05 + ((hh.o - 0.05 + c.currentTime - hh.t0) % L + L) % L; }, /* nightPos：深夜曲現在放到第幾秒（歌詞字幕用）；沒在放、靜音、還沒載好就是 null */ ambMix(m) { want.mix = m || null; if (ambNow && ambNow.mix && want.mix) ambNow.mix(want.mix); }, // 熱鬧程度（賭場的人聲和籌碼聲）；別的房間不理它
      heart(san) { want.heart = san != null && san > 0 && san <= 30 ? san : null; sync(); },
      tinnitus(on) { want.tinnitus = !!on; sync(); },
      dread(level) { const v = level === 'low' || level === 'edge' ? level : null; if (v === want.dread) return; const toEdge = v === 'edge' && want.dread !== 'edge'; want.dread = v; sync(); if (toEdge && unlocked && !(api.settings && api.settings.muted)) { const c = ctx(); if (c) fileOnce(c, bus.heart, 'pulse-rise', 0.5); } }, // 剛掉到 15 以下：升高音壹次
      unease(x) { const v = Math.max(0, Math.min(1, +x || 0)); if (Math.abs(v - want.unease) < 0.02 && (v > 0) === (want.unease > 0)) return; want.unease = v; sync(); },
      file(id, g, opt) { // 播壹次音效檔（id 見 shared/game/sfx_files.js）；g 音量 0～1，預設 0.5，走 sfx 音軌。opt.duck：放的時候背景音樂（房間旋律、鋼琴、恐怖音樂）先讓開
        try {
          if (!isOn('sfx')) return;
          const c = ctx(); if (!c) return;
          fileBuf(c, id).then((buf) => {
            if (!buf || !isOn('sfx')) return;
            const s = c.createBufferSource(), v = c.createGain();
            s.buffer = buf; v.gain.value = g == null ? 0.5 : Math.max(0, Math.min(1, +g));
            s.connect(v); v.connect(bus.sfx); s.start(); lastSfxAt = now(); if (opt && opt.duck && bus.ambDuck) { const t = c.currentTime, p = bus.ambDuck.gain; p.cancelScheduledValues(t); p.setTargetAtTime(0.08, t, 0.4); p.setTargetAtTime(1, t + Math.max(1, buf.duration - 2), 1.2); }
          });
        } catch (e) { /* never throw */ }
      },
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
