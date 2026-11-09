// 模擬「好奇的玩家」：會一直回去看嚇人的展品、會讀禁書、偶爾孤注一擲。看理智多常歸零。
// node test/sim_san.cjs [次數]
// 第 4 版：規則改讀 shared/ 的模組（load_shared.cjs）
const { load } = require("./load_shared.cjs");
const G = load();
const RUNS = +process.argv[2] || 500;
// 每天玩幾分鐘（DAY_MIN）。11-09 起遊戲裡的一天＝真實的一天（台灣時間 05:00 換日，決定 0019），所以這裡模擬「每天玩 N 分鐘、玩完就等明天」。
// 預設 20：設計基準是每天玩 20 分鐘（翊文 11-08：「每天玩大概20分鐘左右比較好」）。以前一天＝玩 15 分鐘時，DAY_MIN=15 就是那時的算法
const SESSION = (+process.env.DAY_MIN || 20) * 60;
const COST = { view: 25, san: 10, make: 40, pillow: 25, deliver: 20, unlock: 8, read: 60, hug: 6, idle: 10, start: 90 };
// 兌換所（11-09，決定 0032）：GEAR=amulet,lamp 這樣第一天就穿著（裝備是博物館的，老玩家的下一位一開始就有）。
// 這支沒有走地下收藏庫：探險燈、技能要看 sim_cellar.cjs（GEAR、SKILL_PLUS）
const GEAR0 = (process.env.GEAR || "").split(",").filter(Boolean);
function pickRandom(P, rng) { const p = {}; G.CATS.forEach(c => { const u = G.usable(P, c); p[c] = u[Math.floor(rng() * u.length)]; }); return p; }
function sim(seed) {
  const rng = G.mulberry32(seed);
  G.setRng(rng);
  const P = G.newProfile("challenge");
  let t = 0, day = 0, date = "2026-11-08", dayStart = 0, visitorClock = 0;
  G.setNowClock(() => Date.UTC(2026, 10, 8, 3, 0, 0) + day * 86400000 + (t - dayStart) * 1000); // 「現在」：模擬的每一天隔 24 小時，玩的那段照模擬的秒數走（怪癖 7 天、兩個遊戲日才算得對；決定 0046）
  G.ensureDay(P, date);
  if (GEAR0.length) { G.storyState(P).stamps = 999; GEAR0.forEach(id => { G.buyGear(P, id, date); G.wearGear(P, id); }); }
  const out = { zeroAt: null, zeros: 0, minSan: 99, bouts: 0, quirks: 0 };
  const spend = sec => {
    t += sec; visitorClock += sec; G.tickAction(P);
    while (visitorClock >= G.NUM.visitorEvery) { visitorClock -= G.NUM.visitorEvery; G.visitorArrive(P, rng); }
    if (t - dayStart >= SESSION) { day++; dayStart = t; date = G.addDays("2026-11-08", day); G.ensureDay(P, date); G.moodRecovery(P); }
  };
  const san = (spec, src) => {
    const r = G.sanCheck(P, spec, src);
    const ev = G.applySan(P, r.loss, src);
    spend(COST.san);
    if (ev.temp && G.understandCheck(P).success) { G.startBout(P); out.bouts++; }
    if (ev.indef && G.gainQuirk(P)) out.quirks++;
    out.minSan = Math.min(out.minSan, P.sanity);
    if (ev.zero) { out.zeros++; if (out.zeroAt == null) out.zeroAt = t / 60; G.nextVisitor(P); }
  };
  spend(COST.start);
  let guard = 0;
  while (guard++ < 20000 && t < 4 * 3600) {
    // 解鎖
    const buy = [];
    G.CATS.forEach(c => G.PEPE_PARTS.find(p => p.name === c).options.forEach(o => { const st = G.unlockState(P, c, o.name); if (st.state === "buy" && st.ok) buy.push([c, o.name]); }));
    if (buy.length) { const [c, n] = buy[Math.floor(rng() * buy.length)]; G.doUnlock(P, c, n); spend(COST.unlock); continue; }
    // 委託（收藏裡有就交）
    const list = G.dailyCommissions(P, date);
    let did = false;
    for (let i = 0; i < list.length && !did; i++) {
      if (list[i].done) continue;
      const items = list[i].kind === "pillow" ? Object.keys(P.pillows).map(k => ({ kind: "pillow", key: k })) : Object.keys(P.pepes).map(k => ({ kind: "pepe", key: k }));
      const hit = items.find(it => G.checkDelivery(P, list[i], it));
      if (hit) { G.deliver(P, i, hit); spend(COST.deliver); did = true; }
    }
    if (did) continue;
    // 禁書：第一天逛到一半就會好奇去讀
    if (t > 15 * 60) {
      const book = FORBIDDEN_BOOKS_LIST.find(b => !P.mythFrom[b.id]);
      if (book && rng() < 0.3) { san(book.san, "book:" + book.id); const m = G.bookMyth(P, book); if (m) G.addMyth(P, m); spend(COST.read); continue; }
    }
    // 理智低時才去抱抱枕（一般玩家不會每個都抱）
    if (P.sanity < 25 && rng() < 0.5) { const k = Object.keys(P.pillows).find(k => !P.day.hugs[k]); if (k) { G.hug(P, k); spend(COST.hug); continue; } }
    // 做佩佩
    if (P.insp >= G.NUM.costPepe && rng() < 0.6) {
      const pick = pickRandom(P, rng);
      const s = G.startMake(P, pick);
      if (s.ok) {
        spend(COST.make);
        let natural = s.roll.total, pushed = false;
        const first = G.rarityOfRoll(P, natural, natural);
        const rank = i => i.failed ? -1 : G.RARITY_ORDER.indexOf(i.rarity);
        if (first.rarity === "普通" && rng() < 0.3) { natural = G.pushRoll(P).total; pushed = true; if (rank(G.rarityOfRoll(P, natural, natural)) < rank(first)) san(G.NUM.pushSan, null); }
        G.finishMake(P, pick, { natural, spent: 0, pushed });
        if (rng() < 0.15 && Object.keys(P.pepes).length) { const k = Object.keys(P.pepes)[0]; G.makePillow(P, { 尺寸: "標準", 材質: "棉布", 填充: "剛剛好" }, "p:" + k); }
        continue;
      }
    }
    // 逛畫廊：輪流看，嚇人的也照看（每次都有機會拿靈感）
    const open = G.EXHIBITS.map(e => G.exhibitById(e.id)).filter(ex => G.exhibitOpen(P, ex));
    open.sort((a, b) => (P.seen[a.id] || 0) - (P.seen[b.id] || 0));
    const ex = open[Math.floor(rng() * Math.min(open.length, 3))];
    const v = G.viewExhibit(P, ex); spend(COST.view);
    if (v.san) san(v.san, ex.id);
    if (v.myth) G.addMyth(P, v.myth);
  }
  G.setRng(null);
  return out;
}
const FORBIDDEN_BOOKS_LIST = G.FORBIDDEN_BOOKS;
const runs = Array.from({ length: RUNS }, (_, i) => sim(5000 + i));
const within = m => runs.filter(r => r.zeroAt != null && r.zeroAt <= m).length / RUNS * 100;
const z = runs.map(r => r.zeroAt).filter(x => x != null).sort((a, b) => a - b);
console.log(`好奇的玩家 ${RUNS} 次（每天玩 ${SESSION / 60} 分鐘${GEAR0.length ? `，穿著 ${GEAR0.join("、")}` : ""}）：理智歸零（俄國8+9 的房間）`);
console.log(`  1 小時內 ${within(60).toFixed(0)}%　2 小時內 ${within(120).toFixed(0)}%　3 小時內 ${within(180).toFixed(0)}%　4 小時內 ${within(240).toFixed(0)}%`);
console.log(`  第一次歸零的時間中位數：${z.length ? (z[Math.floor(z.length / 2)] / 60).toFixed(1) + " 小時" : "沒有"}；4 小時內平均歸零 ${(runs.reduce((s, r) => s + r.zeros, 0) / RUNS).toFixed(1)} 次`);
console.log(`  瘋狂發作平均 ${(runs.reduce((s, r) => s + r.bouts, 0) / RUNS).toFixed(1)} 次；得到怪癖 ${(runs.filter(r => r.quirks).length / RUNS * 100).toFixed(0)}%`);
const ms = runs.map(r => r.minSan).sort((a, b) => a - b);
console.log(`  最低理智：10% ${ms[Math.floor(RUNS * .1)]}　中位數 ${ms[Math.floor(RUNS / 2)]}　90% ${ms[Math.floor(RUNS * .9)]}`);
