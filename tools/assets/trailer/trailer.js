// 佩佩博物館2 預告片（約 61 秒）：畫面是遊戲真的截圖（shots.cjs 照的），canvas 上加慢推、字卡、閃光。
// 照第 3 版的做法（../佩佩博物館3/trailer/trailer.js）：每格只看時間 t（draw(t)），所以可以逐格輸出。
// 配樂有兩種（翊文 11-22：「音樂原創」，然後再做壹個用素材的版本）：
//   原創：下面的 score()，Web Audio 合成，Claude 自己寫的（D 小調、120 BPM，壹拍 0.5 秒）；
//   素材：audio_mix.cjs 用 web/public/sfx 的音樂接起來。兩種都對齊同壹份 CUES。
// 不破梗：字卡不寫主線、禁書內文、怪物的真相。
(function () {
  const W = 1920, H = 1080, BAR = 64, FPS = 30, DUR = 61;
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  cv.width = W; cv.height = H;
  const SERIF = '"Noto Serif TC", "PMingLiU", "MingLiU", Georgia, serif', SANS = '"Microsoft JhengHei", "PingFang TC", sans-serif';
  const GOLD = "#F2DA9A", PALE = "#C9B08E";

  // ---------- 小工具 ----------
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const out3 = k => 1 - Math.pow(1 - k, 3);
  const io = k => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const fadeIO = (t, a, b, fi = 0.35, fo = 0.35) => Math.min(seg(t, a, a + fi), 1 - seg(t, b - fo, b));
  const hash = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  const IMG = {};
  const NAMES = ["title", "lobby", "workshop", "roll", "reveal", "fusion", "pillow", "gallery", "hall", "tasks", "casino", "holdem", "wheel", "diner", "stock", "report", "cellar", "route", "fight", "library", "pass", "calendar", "shop", "lowsan"];
  function loadAll() {
    return Promise.all(NAMES.map(n => new Promise(res => { const im = new Image(); im.onload = () => { IMG[n] = im; res(); }; im.onerror = () => res(); im.src = "shots/" + n + ".png"; })));
  }

  // 截圖滿版畫上去，k 是慢推的進度（0→1），zoom 從 z0 推到 z1，(fx, fy) 是推向的點（0～1）。
  function pic(name, k, o = {}) {
    const im = IMG[name]; if (!im) { ctx.fillStyle = "#222"; ctx.fillRect(0, 0, W, H); return; }
    const z = lerp(o.z0 == null ? 1.02 : o.z0, o.z1 == null ? 1.12 : o.z1, io(clamp(k)));
    const fx = o.fx == null ? 0.5 : o.fx, fy = o.fy == null ? 0.5 : o.fy;
    const dw = W * z, dh = H * z;
    ctx.save(); ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    if (o.filter) ctx.filter = o.filter;
    ctx.drawImage(im, (W - dw) * fx, (H - dh) * fy, dw, dh);
    ctx.restore();
  }
  function text(str, x, y, o = {}) {
    ctx.save();
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    const sp = (o.ls == null ? 0.15 : o.ls) * (o.size || 64); // 字距會在最後壹個字後面多留壹格，置中時要往左挪回壹半
    ctx.translate(x + ((o.align || "center") === "center" ? sp / 2 : 0), y); const s = o.scale || 1; ctx.scale(s, s);
    ctx.font = `${o.weight || 600} ${o.size || 64}px ${o.font || SERIF}`;
    ctx.textAlign = o.align || "center"; ctx.textBaseline = "middle";
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = sp + "px";
    ctx.shadowColor = o.glow || "rgba(238,200,120,.55)"; ctx.shadowBlur = o.blur == null ? 24 : o.blur;
    ctx.fillStyle = o.color || GOLD;
    ctx.fillText(str, 0, 0);
    ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
    ctx.fillText(str, 0, 0);
    ctx.restore();
  }
  // 下方的字卡：先暗下來壹條，字從大慢慢縮回。
  function caption(str, t, a, b, o = {}) {
    const k = fadeIO(t, a, b, 0.3, 0.35); if (k <= 0) return;
    shade(k * 0.85);
    text(str, W / 2, o.y || H * 0.82, Object.assign({ size: 76, alpha: k, scale: 1.06 - 0.06 * out3(seg(t, a, a + 0.6)) }, o));
  }
  function shade(k) {
    const g = ctx.createLinearGradient(0, H * 0.58, 0, H);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.55, `rgba(8,4,2,${0.7 * k})`); g.addColorStop(1, `rgba(0,0,0,${0.9 * k})`);
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.58, W, H * 0.42);
  }
  function vignette(k) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.95);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, `rgba(0,0,0,${k})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function black(k) { if (k <= 0) return; ctx.fillStyle = `rgba(0,0,0,${clamp(k)})`; ctx.fillRect(0, 0, W, H); }
  function flash(t, at, d = 0.14, rgb = "255,244,214", peak = 0.8) { const k = 1 - seg(t, at, at + d); if (t >= at && k > 0) { ctx.fillStyle = `rgba(${rgb},${peak * k})`; ctx.fillRect(0, 0, W, H); } }
  function tint(rgb, k) { if (k <= 0) return; ctx.fillStyle = `rgba(${rgb},${k})`; ctx.fillRect(0, 0, W, H); }
  function dust(t, n = 40, k = 1) { // 光裡飄的灰塵
    for (let i = 0; i < n; i++) {
      const x = (hash(i) * W + t * 18 * (0.5 + hash(i + 9))) % W, y = (hash(i + 3) * H - t * 10 * (0.3 + hash(i + 5)) + H * 4) % H;
      ctx.fillStyle = `rgba(255,236,190,${0.25 * k * (0.4 + 0.6 * Math.sin(t * 2 + i))})`;
      ctx.beginPath(); ctx.arc(x, y, 1.2 + hash(i + 7) * 2.2, 0, 7); ctx.fill();
    }
  }
  // 壹段裡換好幾張，切換時閃壹下。cuts = [[開始秒, 圖名, 選項], ...]，end 是最後壹張結束的秒。
  function cutsAt(t, cuts, end) {
    let i = 0; while (i + 1 < cuts.length && t >= cuts[i + 1][0]) i++;
    const [a, name, o] = cuts[i], b = i + 1 < cuts.length ? cuts[i + 1][0] : end;
    pic(name, seg(t, a, b), o || {});
    if (i > 0) flash(t, a, 0.12, "255,244,214", 0.55);
    return i;
  }

  // ---------- 分鏡（秒數跟 docs/素材/預告片/分鏡.md 壹樣；配樂兩種都對齊這些點） ----------
  function s0(t) { // 0–4 開場：黑 → 絨布幕拉開 → 標題畫面
    pic("title", seg(t, 0, 4.2), { z0: 1.18, z1: 1.06, alpha: seg(t, 0.4, 1.4), filter: "brightness(0.8)" });
    const k = io(seg(t, 1.0, 2.8)), half = W / 2 * (1 - k);
    if (half > 1) {
      ["#5A0F1C", "#3E0A14"].forEach((c, side) => {
        const x = side ? W - half : 0, g = ctx.createLinearGradient(x, 0, x + half, 0);
        for (let i = 0; i <= 8; i++) g.addColorStop(i / 8, i % 2 ? c : "#6E1824");
        ctx.fillStyle = g; ctx.fillRect(x, 0, half, H);
      });
    }
    black(1 - seg(t, 0.1, 1.0));
    vignette(0.75); dust(t, 30, seg(t, 1.4, 2.4));
    caption("藏在城市的某個角落", t, 1.8, 4.0, { size: 64 });
  }
  function s1(t) { // 4–9 大廳
    pic("lobby", seg(t, 4, 9), { z0: 1.0, z1: 1.14, fx: 0.5, fy: 0.4 });
    flash(t, 4.0, 0.25);
    vignette(0.5);
    caption("這次，館友都在", t, 4.6, 8.9);
  }
  function s2(t) { // 9–15 做佩佩：手作坊 → 擲骰 → 揭曉
    const i = cutsAt(t, [[9, "workshop", { fy: 0.45 }], [11, "roll", { z0: 1.3, z1: 1.45, fx: 0.33, fy: 0.62 }], [12.5, "reveal", { z0: 1.12, z1: 1.02 }]], 15);
    if (i === 2) flash(t, 12.5, 0.4, "255,250,230", 0.95);
    vignette(0.5);
    caption("親手做出你的佩佩", t, 9.4, 14.9);
  }
  function s3(t) { // 15–19 融合、抱枕
    cutsAt(t, [[15, "fusion"], [17, "pillow", { fx: 0.4 }]], 19);
    vignette(0.5);
    caption("融合・調色・做成抱枕", t, 15.3, 18.9);
  }
  function s4(t) { // 19–24 畫廊、展廳
    cutsAt(t, [[19, "gallery", { fx: 0.3 }], [21.5, "hall", { fx: 0.6 }]], 24);
    vignette(0.5);
    caption("佈置你自己的展廳", t, 19.3, 23.9);
  }
  function s5(t) { // 24–28 任務板、交代人
    pic("tasks", seg(t, 24, 28), { fy: 0.35 });
    flash(t, 24, 0.12, "255,244,214", 0.5);
    vignette(0.5);
    caption("館裡的人，會交代你事情", t, 24.3, 27.9);
  }
  function s6(t) { // 28–34 賭場：壹秒半壹鏡
    const names = ["21 點", "德州撲克", "轉盤", "餐車"];
    const i = cutsAt(t, [[28, "casino", { z0: 1.1, z1: 1.2 }], [29.5, "holdem", { z0: 1.1, z1: 1.2 }], [31, "wheel", { z0: 1.1, z1: 1.2 }], [32.5, "diner", { z0: 1.1, z1: 1.2 }]], 34);
    tint("60,20,10", 0.12); vignette(0.6);
    const a = 28 + i * 1.5;
    shade(0.9);
    text(names[i], W / 2, H * 0.8, { size: 104, ls: 0.25, scale: 1.25 - 0.25 * out3(seg(t, a, a + 0.35)), alpha: seg(t, a, a + 0.12) * (1 - seg(t, a + 1.38, a + 1.5)) });
  }
  function s7(t) { // 34–38 銀行、股票
    cutsAt(t, [[34, "stock", { fx: 0.5 }], [36, "report", { fx: 0.5 }]], 38);
    vignette(0.5);
    caption("存款・借款・股票", t, 34.2, 37.9);
  }
  function s8(t) { // 38–45 地下收藏庫、合作
    cutsAt(t, [[38, "cellar", { z0: 1.0, z1: 1.18, fy: 0.6 }], [40.5, "route", { z0: 1.2, z1: 1.3, fx: 0.32, fy: 0.42 }], [42.5, "fight", { z0: 1.3, z1: 1.45, fx: 0.62, fy: 0.42 }]], 45);
    black(1 - seg(t, 38, 38.6));
    tint("10,20,30", 0.18); vignette(0.75);
    caption("往下走。", t, 38.6, 41.2);
    caption("找館友壹起。", t, 41.6, 44.9);
    flash(t, 44.75, 0.25, "255,255,255", 0.7 * seg(t, 44.5, 45));
  }
  function s9(t) { // 45–49 圖書館禁書（只照書架）
    pic("library", seg(t, 45, 49.2), { z0: 1.0, z1: 1.16, filter: "saturate(0.7) brightness(0.7)" });
    tint("40,10,60", 0.22 + 0.06 * Math.sin(t * 7)); vignette(0.85);
    caption("有些書，讀懂了就回不去", t, 45.4, 48.9, { color: "#D8C2F0", glow: "rgba(150,100,220,.8)" });
  }
  function s10(t) { // 49–53 館友證、簽到、兌換所
    const names = ["館友證", "簽到", "兌換所"];
    const i = cutsAt(t, [[49, "pass", { z0: 1.06, z1: 1.16 }], [50.33, "calendar", { z0: 1.06, z1: 1.16 }], [51.67, "shop", { z0: 1.06, z1: 1.16 }]], 53);
    vignette(0.55); shade(0.9);
    const a = 49 + i * 1.333;
    text(names[i], W / 2, H * 0.8, { size: 96, ls: 0.3, scale: 1.2 - 0.2 * out3(seg(t, a, a + 0.3)), alpha: seg(t, a, a + 0.1) });
    flash(t, 52.8, 0.2, "255,255,255", 0.8 * seg(t, 52.6, 53));
  }
  function s11(t) { // 53–57 標題
    pic("lobby", seg(t, 53, 57), { z0: 1.22, z1: 1.04, filter: "blur(6px) brightness(0.45)" });
    vignette(0.85); dust(t, 60, 1);
    flash(t, 53, 0.7, "255,248,225", 1);
    const k = seg(t, 53.15, 53.9);
    text("佩佩博物館2", W / 2, H * 0.44, { size: 168, ls: 0.12, alpha: k, scale: 1.12 - 0.12 * out3(k), blur: 40 });
    text("PEPE MUSEUM", W / 2, H * 0.58, { size: 40, font: "Georgia, serif", ls: 0.6, alpha: seg(t, 53.8, 54.4), blur: 10, color: PALE });
    const k2 = fadeIO(t, 54.6, 57.2, 0.6, 0.4);
    if (k2 > 0) text("和館友壹起逛的博物館", W / 2, H * 0.69, { size: 46, font: SANS, color: "#F1E4CC", blur: 6, glow: "rgba(0,0,0,.6)", ls: 0.18, alpha: k2 });
    black(seg(t, 56.6, 57));
  }
  function s12(t) { // 57–59.5 開館
    black(1);
    const k = fadeIO(t, 57.1, 59.4, 0.5, 0.4);
    text("現已開館", W / 2, H * 0.45, { size: 104, ls: 0.3, alpha: k });
    text("pepe-museum.web.app", W / 2, H * 0.59, { size: 40, font: "Georgia, serif", color: PALE, blur: 0, ls: 0.12, alpha: k * 0.9 });
  }
  function s13(t) { // 59.5–61 彩蛋：理智低的畫廊閃兩下
    black(1);
    const on = (t > 59.95 && t < 60.05) || (t > 60.2 && t < 60.62);
    if (on) {
      const j = (hash(Math.floor(t * 30)) - 0.5) * 18;
      ctx.save(); ctx.translate(j, 0); pic("lowsan", 0.5, { z0: 1.08, z1: 1.08, filter: "saturate(0.5) contrast(1.3) brightness(0.8)" }); ctx.restore();
      tint("120,0,0", 0.18); vignette(0.9);
      for (let i = 0; i < 6; i++) { ctx.fillStyle = `rgba(255,255,255,${0.06 + 0.08 * hash(i + Math.floor(t * 30))})`; ctx.fillRect(0, hash(i * 3 + Math.floor(t * 30)) * H, W, 2 + hash(i) * 6); }
    }
    if (t > 60.7) text("剛剛那幅畫……是不是動了？", W / 2, H * 0.5, { size: 34, font: SANS, color: "#6E5A4A", blur: 0, ls: 0.2, alpha: fadeIO(t, 60.7, 61, 0.15, 0.08) });
  }

  function draw(t) {
    ctx.save(); ctx.clearRect(0, 0, W, H);
    if (t < 4) s0(t); else if (t < 9) s1(t); else if (t < 15) s2(t); else if (t < 19) s3(t); else if (t < 24) s4(t);
    else if (t < 28) s5(t); else if (t < 34) s6(t); else if (t < 38) s7(t); else if (t < 45) s8(t); else if (t < 49) s9(t);
    else if (t < 53) s10(t); else if (t < 57) s11(t); else if (t < 59.5) s12(t); else s13(t);
    ctx.restore();
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, BAR); ctx.fillRect(0, H - BAR, W, BAR); // 電影的黑邊
  }

  // =====================================================================
  //  原創配樂（Claude 自己寫的；D 小調，120 BPM。樂器沿用第 3 版預告片自己寫的合成器）
  // =====================================================================
  function score(ac, out) {
    let nbuf = null;
    const noiseBuf = () => { if (nbuf) return nbuf; const len = ac.sampleRate * 2; nbuf = ac.createBuffer(1, len, ac.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = hash(i * 0.37) * 2 - 1; return nbuf; };
    function impulse(secs, decay) {
      const len = Math.floor(ac.sampleRate * secs), b = ac.createBuffer(2, len, ac.sampleRate);
      for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (hash(i * 1.3 + c * 7) * 2 - 1) * Math.pow(1 - i / len, decay); }
      return b;
    }
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.3;
    const master = ac.createGain(); master.gain.value = 0.85;
    const verb = ac.createConvolver(); verb.buffer = impulse(3.4, 2.4);
    const wet = ac.createGain(); wet.gain.value = 0.3;
    const bus = ac.createGain();
    bus.connect(comp); bus.connect(verb); verb.connect(wet); wet.connect(comp); comp.connect(master); master.connect(out);
    const env = (p, t, a, peak, d, hold = 0) => { p.setValueAtTime(0.0001, t); p.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a); if (hold) p.setValueAtTime(Math.max(peak, 0.0002), t + a + hold); p.exponentialRampToValueAtTime(0.0001, t + a + hold + d); };
    function v(t, o) {
      const osc = ac.createOscillator(); osc.type = o.type || "sine";
      osc.frequency.setValueAtTime(o.f, t); if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide || o.d));
      if (o.det) osc.detune.value = o.det;
      let node = osc;
      if (o.lp) { const fl = ac.createBiquadFilter(); fl.type = o.ft || "lowpass"; fl.Q.value = o.q || 0.7; fl.frequency.setValueAtTime(o.lp, t); if (o.lp2) fl.frequency.exponentialRampToValueAtTime(o.lp2, t + (o.lpT || 0.2)); osc.connect(fl); node = fl; }
      const g = ac.createGain(); env(g.gain, t, o.a || 0.005, o.g, o.d, o.hold || 0); node.connect(g); g.connect(bus);
      const end = t + (o.a || 0.005) + (o.hold || 0) + o.d + 0.1;
      if (o.vib) { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = o.vib; lg.gain.value = o.vibD || 6; l.connect(lg); lg.connect(osc.detune); l.start(t); l.stop(end); }
      osc.start(t); osc.stop(end);
    }
    function n(t, o) {
      const s = ac.createBufferSource(); s.buffer = noiseBuf(); s.loop = true;
      const fl = ac.createBiquadFilter(); fl.type = o.type || "bandpass"; fl.Q.value = o.q == null ? 1 : o.q;
      fl.frequency.setValueAtTime(o.f, t); if (o.f2) fl.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide || o.d));
      const g = ac.createGain(); env(g.gain, t, o.a || 0.003, o.g, o.d, o.hold || 0);
      s.connect(fl); fl.connect(g); g.connect(bus); s.start(t, hash(t) * 1.5); s.stop(t + (o.a || 0.003) + (o.hold || 0) + o.d + 0.1);
    }
    // ---- 樂器 ----
    const boom = (t, k = 1) => { v(t, { f: 62, f2: 28, glide: 1.2, g: 0.9 * k, a: 0.004, d: 2.6 }); v(t, { f: 124, f2: 40, glide: 0.3, g: 0.3 * k, d: 0.6 }); n(t, { type: "lowpass", f: 320, f2: 60, glide: 0.8, q: 0.7, g: 0.55 * k, d: 1.2 }); };
    const taiko = (t, k = 1) => { v(t, { f: 92, f2: 48, glide: 0.18, g: 0.55 * k, d: 0.5 }); n(t, { f: 180, q: 1, g: 0.35 * k, d: 0.12 }); n(t, { type: "highpass", f: 2500, q: 0.7, g: 0.06 * k, d: 0.03 }); };
    const snare = (t, k = 1) => { n(t, { f: 1900, q: 0.8, g: 0.2 * k, d: 0.12 }); v(t, { f: 200, f2: 140, glide: 0.06, g: 0.12 * k, d: 0.08 }); };
    const hat = (t, k = 1) => n(t, { type: "highpass", f: 7500, q: 0.7, g: 0.05 * k, d: 0.04 });
    const roll = (t0, dur, k0, k1, step = 0.045, sn = false) => { for (let t = t0; t < t0 + dur; t += step) { const k = lerp(k0, k1, (t - t0) / dur); if (sn) n(t, { f: 1800, q: 0.8, g: 0.14 * k, d: 0.06 }); else v(t, { f: 98, f2: 86, glide: 0.1, g: 0.32 * k, d: 0.25 }); } };
    const cymbal = (t, k = 1) => { n(t, { type: "highpass", f: 5200, q: 0.6, g: 0.22 * k, a: 0.004, d: 2.8 }); n(t, { f: 9000, q: 0.5, g: 0.1 * k, d: 1.5 }); };
    const riser = (t0, dur, k = 1) => { n(t0, { f: 300, f2: 6000, glide: dur, q: 2.2, g: 0.32 * k, a: dur * 0.92, d: 0.08 }); v(t0, { type: "sawtooth", f: 110, f2: 880, glide: dur, lp: 600, lp2: 4000, lpT: dur, g: 0.05 * k, a: dur * 0.92, d: 0.06 }); };
    const whoosh = (t, dur) => n(t, { f: 300, f2: 2600, glide: dur, q: 0.9, g: 0.2, a: dur * 0.6, d: dur * 0.4 });
    const str = (t, f, d, k = 1) => { v(t, { type: "sawtooth", f, lp: 2200, g: 0.055 * k, a: 0.008, d, det: -8 }); v(t, { type: "sawtooth", f, lp: 2200, g: 0.055 * k, a: 0.008, d, det: 8 }); };
    const pizz = (t, f, k = 1) => { v(t, { type: "triangle", f, g: 0.22 * k, a: 0.004, d: 0.35 }); v(t, { f: f * 2, g: 0.05 * k, a: 0.003, d: 0.15 }); };
    const pad = (t, fs, dur, k = 1) => fs.forEach(f => { [-7, 7].forEach(det => v(t, { type: "sawtooth", f, lp: 1100, g: 0.03 * k, a: 0.5, hold: Math.max(0, dur - 1.2), d: 0.8, det, vib: 5, vibD: 4 })); });
    const brass = (t, fs, dur, k = 1) => fs.forEach(f => { [-5, 5].forEach(det => v(t, { type: "sawtooth", f, lp: 500, lp2: 2600, lpT: 0.15, g: 0.05 * k, a: 0.06, hold: Math.max(0, dur - 0.45), d: 0.4, det, vib: 4.5, vibD: 3 })); });
    const choir = (t, fs, dur, k = 1) => fs.forEach(f => { v(t, { type: "sawtooth", f, ft: "bandpass", lp: 800, q: 2, g: 0.07 * k, a: 0.6, hold: Math.max(0, dur - 1.5), d: 0.9, vib: 5.5, vibD: 9 }); v(t, { type: "sawtooth", f: f * 1.004, ft: "bandpass", lp: 1200, q: 3, g: 0.045 * k, a: 0.7, hold: Math.max(0, dur - 1.6), d: 0.9, vib: 5, vibD: 9 }); });
    const trem = (t0, fs, dur, k = 1) => { for (let t = t0; t < t0 + dur; t += 0.06) fs.forEach(f => v(t, { type: "sawtooth", f, lp: 3200, g: 0.018 * k * lerp(0.4, 1, (t - t0) / dur), a: 0.004, d: 0.05 })); };
    const heart = (t, k = 1) => { const b = (tt, g) => { v(tt, { f: 68, f2: 42, glide: 0.14, g, a: 0.008, d: 0.17 }); n(tt, { type: "lowpass", f: 220, q: 0.7, g: g * 0.3, d: 0.07 }); }; b(t, 0.7 * k); b(t + 0.27, 0.5 * k); };
    const harp = (t, f, k = 1) => { v(t, { type: "triangle", f, g: 0.09 * k, a: 0.003, d: 1.4 }); v(t, { f: f * 2, g: 0.025 * k, a: 0.002, d: 0.7 }); };
    const mbox = (t, f, k = 1, det = 0) => { v(t, { f, g: 0.07 * k, a: 0.002, d: 1.2, det }); v(t, { f: f * 2.01, g: 0.012 * k, a: 0.002, d: 0.5, det }); };
    const shimmer = (t0, dur) => { for (let i = 0; i < 14; i++) v(t0 + (i / 14) * dur, { f: [1174.66, 1396.91, 1760, 2349.32][i % 4] * (i > 7 ? 2 : 1), g: 0.02, a: 0.003, d: 0.6 }); };
    const lightsOut = t => { n(t, { type: "highpass", f: 2500, q: 0.8, g: 0.4, a: 0.001, d: 0.02 }); v(t, { f: 70, f2: 35, glide: 0.4, g: 0.45, d: 0.45 }); };
    // ---- 音高 ----
    const N = { A1: 55, Bb1: 58.27, C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98, A2: 110, Bb2: 116.54, B2: 123.47, C3: 130.81, Cs3: 138.59, D3: 146.83, E3: 164.81, F3: 174.61, Fs3: 185, G3: 196, A3: 220, Bb3: 233.08, B3: 246.94,
      C4: 261.63, Cs4: 277.18, D4: 293.66, E4: 329.63, F4: 349.23, Fs4: 369.99, G4: 392, A4: 440, Bb4: 466.16, B4: 493.88, C5: 523.25, Cs5: 554.37, D5: 587.33, E5: 659.25, F5: 698.46, Fs5: 739.99, G5: 783.99, A5: 880, Eb5: 622.25 };
    const OST = [N.D3, N.D3, N.A3, N.D3, N.F3, N.D3, N.E3, N.D3];
    // 小調的四個和弦（Dm–B♭–F–C），每個 2 秒
    const PROG = [[[N.D3, N.F3, N.A3, N.D4], [N.D2, N.A2], N.D3], [[N.Bb2, N.D3, N.F3, N.Bb3], [N.Bb1, N.F2], N.Bb2], [[N.F3, N.A3, N.C4, N.F4], [N.F2, N.C3], N.F3], [[N.C3, N.E3, N.G3, N.C4], [N.C2, N.G2], N.C3]];
    return function play(T) {
      const at = s => T + s;
      const beats = (a, b, step, fn) => { for (let s = a; s < b - 1e-6; s += step) fn(s); };
      // 0–4 開場：轟、低音弦、定音鼓滾奏
      boom(at(0.05), 0.9); pad(at(0.1), [N.D2, N.A2], 4.0, 1.2); roll(at(2.0), 2.0, 0.1, 0.7); whoosh(at(3.3), 0.7);
      // 4–9 大廳：D 大調的豎琴分解和弦（D–G–Bm–A），很輕的弦樂墊底
      const LOB = [[N.D3, N.Fs3, N.A3, N.D4, N.Fs4, N.A4], [N.G3, N.B3, N.D4, N.G4, N.B4, N.D5], [N.B2, N.D3, N.Fs3, N.B3, N.D4, N.Fs4], [N.A2, N.Cs3, N.E3, N.A3, N.Cs4, N.E4]];
      boom(at(4.0), 0.5); cymbal(at(4.0), 0.3);
      LOB.forEach((ch, i) => { pad(at(4 + i * 1.25), [ch[0] / 2, ch[2]], 1.3, 0.8); ch.forEach((f, j) => harp(at(4 + i * 1.25 + j * 0.2), f, 0.9)); });
      [[N.A4, 4.0, 0.75], [N.D5, 4.75, 0.5], [N.B4, 5.25, 0.75], [N.D5, 6.0, 0.5], [N.Fs5, 6.5, 0.75], [N.E5, 7.25, 0.5], [N.Cs5, 7.75, 0.5], [N.E5, 8.25, 0.75]].forEach(([f, s, d]) => v(at(s), { type: "sine", f, g: 0.07, a: 0.05, hold: d * 0.6, d: d * 0.6, vib: 5, vibD: 6 }));
      roll(at(8.0), 1.0, 0.1, 0.6, 0.04, true); riser(at(8.0), 1.0, 0.5);
      // 9–15 做佩佩：弦樂頑固音型＋太鼓，12.5 揭曉的大擊
      boom(at(9.0), 0.7); cymbal(at(9.0), 0.5);
      beats(9, 12.5, 0.25, s => str(at(s), OST[Math.round((s - 9) * 4) % 8], 0.2, Math.round(s * 4) % 2 ? 0.9 : 1.2));
      beats(9, 12, 0.5, s => taiko(at(s), 0.7));
      brass(at(9.0), PROG[0][0], 0.9); brass(at(10.0), PROG[1][0], 0.9); pad(at(9), [N.D2, N.A2], 3.5, 1);
      roll(at(11.5), 1.0, 0.15, 1.0, 0.035, true); riser(at(11.5), 1.0, 0.6);
      boom(at(12.5), 0.9); cymbal(at(12.5), 0.9); taiko(at(12.5), 1.1); brass(at(12.5), [N.D3, N.A3, N.D4, N.F4], 1.4, 1.2); shimmer(at(12.55), 0.7);
      beats(13.5, 15, 0.25, s => str(at(s), OST[Math.round((s - 13.5) * 4) % 8], 0.2, 1));
      // 15–28 收藏、展廳、任務：Dm–B♭–F–C 每 2 秒，鼓壹路加
      for (let s = 15, i = 0; s < 28 - 1e-6; s += 2, i++) {
        const [ch, lo] = PROG[i % 4], k = 0.8 + i * 0.05, len = Math.min(2, 28 - s);
        brass(at(s), ch, len * 0.45, k); pad(at(s), lo, len, 1.1); if (s >= 19) choir(at(s), ch.slice(1), len, 0.6);
        beats(s, s + len, 0.25, u => str(at(u), OST[Math.round((u - s) * 4) % 8] * (i % 4 === 1 ? 116.54 / 146.83 : i % 4 === 2 ? 174.61 / 146.83 : i % 4 === 3 ? 130.81 / 146.83 : 1), 0.2, 0.9 + 0.3 * (Math.round(u * 4) % 2)));
        beats(s, s + len, 0.5, u => taiko(at(u), 0.6 + 0.03 * i));
      }
      [15, 19, 24].forEach(s => { cymbal(at(s), 0.6); boom(at(s), 0.5); });
      [[N.D5, 19, 1], [N.F5, 20, 0.5], [N.E5, 20.5, 0.5], [N.D5, 21, 1], [N.C5, 22, 1], [N.A4, 23, 1], [N.D5, 24, 1], [N.F5, 25, 0.5], [N.G5, 25.5, 0.5], [N.A5, 26, 1.5]].forEach(([f, s, d]) => brass(at(s), [f], d, 1.1));
      roll(at(27.0), 1.0, 0.2, 1.0, 0.035, true); riser(at(27.0), 1.0, 0.7);
      // 28–38 賭場、銀行：搖擺的撥弦低音、反拍小鼓、腳踏鈸（Dm7–G7–Cmaj7–A7）
      boom(at(28), 0.8); cymbal(at(28), 0.8);
      const WALK = [[N.D2, N.F2, N.A2, N.C3], [N.G2, N.B2, N.D3, N.F3], [N.C3, N.E3, N.G3, N.B3], [N.A2, N.Cs3, N.E3, N.G3]];
      for (let s = 28, i = 0; s < 38 - 1e-6; s += 2, i++) {
        const w = WALK[i % 4];
        w.forEach((f, j) => { pizz(at(s + j * 0.5), f / (j ? 1 : 1), 1); });
        brass(at(s), w.map(f => f * 2), 0.3, 0.8); brass(at(s + 0.75), w.map(f => f * 2), 0.2, 0.6);
        beats(s, s + 2, 0.5, u => { hat(at(u + 0.33), 1); if (Math.round((u - s) * 2) % 2) snare(at(u), 0.9); else taiko(at(u), 0.45); });
      }
      [29.5, 31, 32.5].forEach(s => cymbal(at(s), 0.4)); boom(at(34), 0.5);
      // 38–45 地下：心跳進去，再壹路重建成戰鼓和合唱
      lightsOut(at(37.9)); boom(at(38.0), 0.6); pad(at(38), [N.D2, N.A2], 7, 1.2);
      [38.3, 39.1, 39.8].forEach((s, i) => heart(at(s), 0.7 + i * 0.1));
      choir(at(40.5), [N.D3, N.F3, N.A3], 4.5, 1);
      beats(40.5, 44.5, 0.5, s => taiko(at(s), 0.8)); beats(42.5, 44.5, 0.25, s => taiko(at(s), 0.5));
      beats(40.5, 44.5, 0.25, s => str(at(s), OST[Math.round((s - 40.5) * 4) % 8], 0.2, 1.1));
      brass(at(42.5), [N.D3, N.A3, N.D4], 2, 1.1); roll(at(43.5), 1.4, 0.2, 1.1, 0.035, true); riser(at(43.5), 1.5, 1);
      // 45–49 禁書：鼓抽掉，只剩高音顫弓和低音
      boom(at(45.0), 0.7); pad(at(45), [N.D2], 4, 1.3); trem(at(45), [N.D5, N.Eb5], 3.8, 1);
      [45.8, 46.6, 47.3, 47.9, 48.4].forEach((s, i) => heart(at(s), 0.5 + i * 0.1));
      // 49–53 館友證、簽到、兌換所：全編制回來，衝向標題
      boom(at(49), 0.8); cymbal(at(49), 0.8);
      [[49, 0], [50.33, 1], [51.67, 2]].forEach(([s, i]) => { brass(at(s), PROG[i][0], 1.2, 1.2); pad(at(s), PROG[i][1], 1.3, 1.2); choir(at(s), PROG[i][0].slice(1), 1.3, 0.9); taiko(at(s), 1); });
      beats(49, 52.5, 0.25, s => str(at(s), OST[Math.round((s - 49) * 4) % 8], 0.2, 1.2));
      beats(49, 52.5, 0.333, s => taiko(at(s), 0.6));
      roll(at(51.8), 1.2, 0.2, 1.2, 0.03, true); riser(at(51.6), 1.4, 1.1);
      // 53 標題：最大的壹擊
      boom(at(53.0), 1.25); cymbal(at(53.0), 1.0); taiko(at(53.0), 1.2);
      brass(at(53.0), [N.D3, N.A3, N.D4, N.F4, N.A4], 3.4, 1.3); pad(at(53.0), [N.D2, N.A2, N.D3], 4, 1.4); choir(at(53.0), [N.D4, N.F4, N.A4], 3.8, 1.2);
      shimmer(at(53.4), 1.0);
      // 57–59.5 開館：音樂盒
      boom(at(57.0), 0.35);
      [N.E5, N.G5, N.A5, N.G5, N.E5, N.D5, N.C5, N.D5].forEach((f, i) => mbox(at(57.2 + i * 0.28), f, 1));
      // 59.5–61 彩蛋：走音的音樂盒，燈熄
      [N.D5, N.F5, N.E5, N.Eb5].forEach((f, i) => mbox(at(59.6 + i * 0.3), f, 0.8, -40 - i * 25));
      lightsOut(at(59.95)); n(at(60.2), { type: "highpass", f: 3000, q: 0.6, g: 0.2, a: 0.002, d: 0.4 }); v(at(60.2), { type: "sawtooth", f: 46, lp: 300, g: 0.3, d: 0.5 });
    };
  }

  // =====================================================================
  //  播放；?render=1 時把配樂（WAV）和每格（JPEG）送給 render.cjs
  // =====================================================================
  const btn = document.getElementById("play"), info = document.getElementById("info");
  let ac = null, T0 = 0, raf = 0;
  function frame() {
    const t = ac.currentTime - T0;
    draw(clamp(t, 0, DUR));
    if (t < DUR + 0.3) raf = requestAnimationFrame(frame);
    else { btn.textContent = "↻ 再看壹次"; btn.hidden = false; }
  }
  async function play() {
    btn.hidden = true;
    if (ac) { try { await ac.close(); } catch (e) { /* 沒關係 */ } }
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const go = score(ac, ac.destination);
    T0 = ac.currentTime + 0.25; go(T0);
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  }
  btn.addEventListener("click", play);
  document.getElementById("fs").addEventListener("click", () => { const el = document.documentElement; if (!document.fullscreenElement) el.requestFullscreen && el.requestFullscreen(); else document.exitFullscreen(); });

  function wav(buf) {
    const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate, data = new DataView(new ArrayBuffer(44 + len * ch * 2));
    const w = (o, s) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
    w(0, "RIFF"); data.setUint32(4, 36 + len * ch * 2, true); w(8, "WAVE"); w(12, "fmt "); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
    data.setUint32(24, sr, true); data.setUint32(28, sr * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true); w(36, "data"); data.setUint32(40, len * ch * 2, true);
    const chans = [...Array(ch)].map((_, c) => buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const s = clamp(chans[c][i], -1, 1); data.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
    return new Blob([data], { type: "audio/wav" });
  }
  async function renderAudio() {
    const sr = 48000, oc = new OfflineAudioContext(2, Math.ceil(sr * (DUR + 0.5)), sr);
    score(oc, oc.destination)(0.0);
    return oc.startRendering();
  }
  async function exportAll(from, to) {
    if (from === 0) {
      info.textContent = "輸出中：配樂…";
      const buf = await renderAudio();
      let peak = 0, sum = 0, cnt = 0;
      for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { peak = Math.max(peak, Math.abs(d[i])); sum += d[i] * d[i]; cnt++; } }
      window.__audioStats = { peak, rms: Math.sqrt(sum / cnt) };
      await fetch("/audio", { method: "POST", body: wav(buf) });
    }
    const N = Math.ceil(DUR * FPS);
    for (let i = from; i < Math.min(N, to); i++) {
      draw(i / FPS);
      const blob = await new Promise(res => cv.toBlob(res, "image/jpeg", 0.92));
      await fetch("/frame?i=" + i, { method: "POST", body: blob });
    }
    return { frames: N };
  }
  window.__trailer = { draw, DUR, FPS, exportAll, ready: false };
  loadAll().then(() => {
    draw(0); draw(53.6); draw(0); // 先畫壹次，字型和圖片都準備好
    btn.hidden = false; info.textContent = "";
    window.__trailer.ready = true;
  });
})();
