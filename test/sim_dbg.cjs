// 用程式模擬玩 1,000 次，看解鎖速度和傳說級出現率：node test/sim.js [次數]
// 第 4 版：規則改讀 shared/ 的模組（load_shared.cjs）
const { load } = require("./load_shared.cjs");
const G = load();
const RUNS = +process.argv[2] || 1000;
const SESSION = 45 * 60;           // 每天玩 45 分鐘
// 每個動作大約要幾秒（含走路、看說明牌、擲骰動畫、揭曉動畫）
const COST = { view: 25, san: 10, make: 40, pillow: 25, deliver: 20, unlock: 8, read: 60, hug: 6, idle: 10, start: 90 };
const baseLocked = P => G.CATS.reduce((n, c) => n + G.PEPE_PARTS.find(p => p.name === c).options.filter(o => !o.forbidden && !o.mutant && !o.mix && !o.gift && !o.limited && !o.key && !P.unlocked[c].includes(o.name)).length, 0);
const LOCKED0 = baseLocked(G.newProfile("challenge"));
function pickRandom(P, rng) { const p = {}; G.CATS.forEach(c => { const u = G.usable(P, c); p[c] = u[Math.floor(rng() * u.length)]; }); return p; }
function sim(seed) {
  const rng = G.mulberry32(seed);
  G.setRng(rng);
  const P = G.newProfile("challenge");
  let t = 0, day = 0, date = G.addDays("2026-11-08", 0);
  let dayStart = 0;
  G.setNowClock(() => Date.UTC(2026, 10, 8, 3, 0, 0) + day * 86400000 + (t - dayStart) * 1000); // 「現在」：模擬的每一天隔 24 小時，玩的那段照模擬的秒數走（怪癖 7 天、兩個遊戲日才算得對；決定 0046）
  G.ensureDay(P, date);
  const out = { t4: null, tAll: null, made: 0, legends: 0, epics: 0, perfects: 0, failed: 0, endings: 0, quirks: 0, minSan: 99, days: 1, unlockAt10: null };
  let visitorClock = 0;
  const spend = sec => {
    t += sec; visitorClock += sec;
    G.tickAction(P); // 每個動作讓瘋狂發作倒數
    while (visitorClock >= G.NUM.visitorEvery) { visitorClock -= G.NUM.visitorEvery; const v = G.visitorArrive(P, rng); if (v) INC.visit += v.gain; }
    if (t - dayStart >= SESSION) { day++; dayStart = t; date = G.addDays("2026-11-08", day); G.ensureDay(P, date); G.moodRecovery(P); out.days++; }
  };
  const san = (spec, src) => {
    const r = G.sanCheck(P, spec, src);
    let loss = r.loss;
    if (!r.success && loss >= 4 && P.mood >= loss * 2 + 20) { P.mood -= loss * 2; loss = Math.ceil(loss / 2); }
    const ev = G.applySan(P, loss, src);
    spend(COST.san);
    if (ev.temp && G.understandCheck(P).success) G.startBout(P);
    if (ev.indef && G.gainQuirk(P)) out.quirks++;
    out.minSan = Math.min(out.minSan, P.sanity);
    if (ev.zero) { out.endings++; G.nextVisitor(P); }
  };
  const fillHall = () => {
    const items = Object.entries(P.pepes).map(([k, e]) => ({ kind: "pepe", key: k, pick: G.fromKey(k), perfect: e.perfect }))
      .sort((a, b) => G.RARITY_ORDER.indexOf(b.pick.稀有度) - G.RARITY_ORDER.indexOf(a.pick.稀有度));
    items.slice(0, 6).forEach((it, i) => G.placeInHall(P, i, it));
  };
  const make = pick => {
    const s = G.startMake(P, pick);
    if (!s.ok) return null;
    spend(COST.make);
    const n = s.roll.total;
    let spent = 0;
    const range = G.spendRange(P, n, false);
    // 想要傳說級：差 10 點以內就花；想要超稀有：差 4 點以內
    if (n > 2 && n - 2 <= 10 && range >= n - 2 && G.usable(P, "稀有度").includes("傳說級稀有")) spent = n - 2;
    else if (n > 12 && n - 12 <= 4 && range >= n - 12 && G.usable(P, "稀有度").includes("超稀有")) spent = n - 12;
    let natural = n, pushed = false;
    if (n === 100) { const p = G.pushRoll(P); natural = p.total; pushed = true; if (G.rarityOfRoll(P, natural, natural).failed) san(G.NUM.pushSan, null); }
    const res = G.finishMake(P, pick, { natural, spent, pushed }); res.events.forEach(e => { if (e.type==="badge") INC.badge += e.insp||0; if (e.type==="insp") INC.badge += e.gain; });
    out.made++;
    if (res.failed) out.failed++;
    else if (res.pick.稀有度 === "傳說級稀有") out.legends++;
    else if (res.pick.稀有度 === "超稀有") out.epics++;
    if (res.perfect) out.perfects++;
    if (Object.keys(P.pepes).length % 5 === 1) fillHall();
    return res;
  };
  let guard = 0;
  spend(COST.start); // 開場、擲心情、3 步引導
  while (guard++ < 20000) {
    const unlocks = LOCKED0 - baseLocked(P);
    if (unlocks >= 4 && out.t4 == null) out.t4 = t / 60;
    if (out.unlockAt10 == null && t >= 600) out.unlockAt10 = unlocks;
    if (unlocks >= LOCKED0) { out.tAll = t / 60; break; }
    if (t > 12 * 3600) break;
    // 1. 能解鎖就解鎖
    const buy = [];
    G.CATS.forEach(c => G.PEPE_PARTS.find(p => p.name === c).options.forEach(o => { const st = G.unlockState(P, c, o.name); if (st.state === "buy" && st.ok) buy.push([c, o.name]); }));
    if (buy.length) { const [c, n] = buy[Math.floor(rng() * buy.length)]; G.doUnlock(P, c, n); spend(COST.unlock); continue; }
    // 2. 委託：收藏裡有就交，沒有就照單做
    const list = G.dailyCommissions(P, date);
    let did = false;
    for (let i = 0; i < list.length && !did; i++) {
      const c = list[i];
      if (c.done) continue;
      const items = c.kind === "pillow" ? Object.keys(P.pillows).map(k => ({ kind: "pillow", key: k })) : Object.keys(P.pepes).map(k => ({ kind: "pepe", key: k }));
      const hit = items.find(it => G.checkDelivery(P, c, it));
      if (hit) { INC.deliver += G.deliver(P, i, hit).reward; spend(COST.deliver); did = true; break; }
      if (c.kind !== "pillow" && !c.need.perfect && !c.need.failed && !("稀有度" in c.need) && P.insp >= G.NUM.costPepe) {
        const pick = pickRandom(P, rng);
        let ok = true;
        G.CATS.forEach(k => { if (k in c.need) { const allow = G.usable(P, k).filter(v => { const sp = c.need[k]; return typeof sp === "string" ? sp === v : Array.isArray(sp) ? sp.includes(v) : !([].concat(sp.not)).includes(v); }); if (!allow.length) ok = false; else pick[k] = allow[0]; } });
        if (ok && make(pick)) { did = true; break; }
      }
      if (c.kind === "pillow" && P.insp >= G.NUM.costPillow + 1 && Object.keys(P.pepes).length) {
        const need = c.need || {};
        const pick = {}; G.PILLOW_PARTS.forEach(p => { const sp = need[p.name]; pick[p.name] = typeof sp === "string" ? sp : Array.isArray(sp) ? sp[0] : p.options[0].name; });
        const pk = Object.keys(P.pepes).find(k => !need.print || G.checkDelivery(P, { kind: "pepe", need: need.print }, { kind: "pepe", key: k }));
        if (pk && G.makePillow(P, pick, "p:" + pk).ok) { spend(COST.pillow); did = true; }
      }
    }
    if (did) continue;
    // 3. 沒看過的展品、沒讀的章節
    const unseen = G.EXHIBITS.map(e => G.exhibitById(e.id)).find(ex => G.exhibitOpen(P, ex) && !P.seen[ex.id]);
    if (unseen) { const v = G.viewExhibit(P, unseen); INC.view += v.insp; spend(COST.view); if (v.san) san(v.san, unseen.id); if (v.myth) G.addMyth(P, v.myth); continue; }
    const ch = [1, 2, 3].find(id => G.chapterOpen(P, id) && !P.chaptersRead[id]);
    if (ch) { INC.read += G.finishChapter(P, ch); spend(COST.read); continue; }
    // 4. 做新的佩佩
    if (P.insp >= G.NUM.costPepe + 0) {
      let pick = null;
      for (let k = 0; k < 20; k++) { const p = pickRandom(P, rng); if (!P.pepes[G.pepeKey(Object.assign({}, p, { 稀有度: "普通" }))]) { pick = p; break; } }
      if (make(pick || pickRandom(P, rng))) continue;
    }
    // 5. 再看不扣理智的展品拿靈感
    const re = ["portrait", "rare"].map(G.exhibitById).find(ex => G.reviewsLeft(P, ex) > 0);
    if (re) { INC.view += G.viewExhibit(P, re).insp; spend(COST.view); continue; }
    // 6. 抱抱枕、等參觀者
    if (P.sanity < 50) { const k = Object.keys(P.pillows).find(k => !P.day.hugs[k]); if (k) { G.hug(P, k); spend(COST.hug); continue; } }
    spend(COST.idle);
  }
  if (out.tAll == null) { out.stuck = { locked: G.CATS.map(c => c + ":" + G.PEPE_PARTS.find(p => p.name === c).options.filter(o => !o.forbidden && !P.unlocked[c].includes(o.name)).map(o => o.name + "(" + G.unlockState(P, c, o.name).state + ")").join(",")).join(" "), quirks: P.quirks.map(G.quirkName), mc: (() => { const m = {}; Object.keys(P.pepes).forEach(k => { const p = G.fromKey(k); m[p.心情 + p.顏色] = (m[p.心情 + p.顏色] || 0) + 1; }); return m; })(), fc: G.badgeEarned(P, "fourColors"), unl: JSON.stringify(P.unlocked), insp: P.insp, badges: Object.keys(P.badges).join(","), done: P.done }; }
  G.setRng(null);
  return out;
}
const INC={visit:0,deliver:0,view:0,read:0,badge:0};globalThis.INC=INC;
const runs = Array.from({ length: RUNS }, (_, i) => sim(1000 + i));
runs.filter(r => r.stuck).forEach(r => console.log("STUCK", JSON.stringify(r.stuck)));
const q = (arr, p) => { const a = arr.filter(x => x != null).sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) * p)] : NaN; };
const f = n => n.toFixed(1);
const t4 = runs.map(r => r.t4), tAll = runs.map(r => r.tAll), at10 = runs.map(r => r.unlockAt10);
const made = runs.reduce((s, r) => s + r.made, 0);
console.log(`模擬 ${RUNS} 次（每天玩 ${SESSION / 60} 分鐘）`);
console.log(`玩 10 分鐘時解鎖了幾個：中位數 ${q(at10, .5)}（10%–90%：${q(at10, .1)}–${q(at10, .9)}）　目標 3–4`);
console.log(`解鎖 4 個要幾分鐘：中位數 ${f(q(t4, .5))}（10%–90%：${f(q(t4, .1))}–${f(q(t4, .9))}）`);
console.log(`全部解鎖（${LOCKED0} 個）要幾小時：中位數 ${f(q(tAll, .5) / 60)}（10%–90%：${f(q(tAll, .1) / 60)}–${f(q(tAll, .9) / 60)}）　目標 2–3 小時；沒解完 ${runs.filter(r => r.tAll == null).length} 次`);
console.log(`做了 ${made} 隻：傳說級 ${f(runs.reduce((s, r) => s + r.legends, 0) / made * 100)}%、超稀有 ${f(runs.reduce((s, r) => s + r.epics, 0) / made * 100)}%、完美作品 ${f(runs.reduce((s, r) => s + r.perfects, 0) / made * 100)}%、失敗作 ${f(runs.reduce((s, r) => s + r.failed, 0) / made * 100)}%`);
console.log(`理智最低中位數 ${q(runs.map(r => r.minSan), .5)}；有得到怪癖的 ${f(runs.filter(r => r.quirks).length / RUNS * 100)}%；理智歸零結局 ${f(runs.filter(r => r.endings).length / RUNS * 100)}%；平均玩了 ${f(runs.reduce((s, r) => s + r.days, 0) / RUNS)} 天`);

console.log("每次平均靈感來源：", Object.fromEntries(Object.entries(INC).map(([k,v])=>[k,(v/RUNS).toFixed(0)])));
