// fx 的擲骰：createDiceTray（骰盤）、rollOverlay（擲骰彈窗）。11-20 從 fx.js 拆出來，內容照原樣搬。
import { EASE, animate, caf, clamp, easeOut3, focusNoScroll, h, hasDOM, markRM, now, pick, raf, rand, reduced, toneOf, trapTab, uid } from "./fx_core.js";
import { sound } from "./fx_sound.js";
import { countTo } from "./fx_misc.js";

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

  export function createDiceTray(host, opts = {}) {
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
  export function rollOverlay(o = {}) {
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
