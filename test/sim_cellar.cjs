// 模擬地下收藏庫：不同收藏量、不同選法的玩家，一路從 B1 走到 B5，看理智掉多少、受傷幾次、拿多少靈感。
// node test/sim_cellar.cjs [次數]
// 第 4 版：規則改讀 shared/ 的模組（load_shared.cjs）
const { load } = require("./load_shared.cjs");
const G = load();
const CELLAR = G.CELLAR;
const RUNS = +process.argv[2] || 1000;
const DATE = "2026-11-08";
// 兌換所和技能成長（11-09，決定 0032）：GEAR=lamp,gloves 這樣穿著裝備下去；SKILL_PLUS=20 每個技能多 20（提升技能、上課、試煉房間之後）
const GEAR0 = (process.env.GEAR || "").split(",").filter(Boolean), SKILL_PLUS = +process.env.SKILL_PLUS || 0;

const parse = e => { const m = String(e).trim().match(/^(\d+)D(\d+)$/i); return m ? { n: +m[1], m: +m[2] } : { flat: +e || 0 }; };
const mean = e => { const p = parse(e); return p.m ? p.n * (p.m + 1) / 2 : p.flat; };
const lossMean = s => (!s || String(s).startsWith("+")) ? 0 : mean(s);
const gainMean = s => (s && String(s).startsWith("+")) ? mean(String(s).slice(1)) : 0;

// 收藏：stage 決定開了哪些選項、做了幾隻
function buildProfile(rng, stage) {
  G.setRng(rng);
  const P = G.newProfile("challenge");
  G.ensureDay(P, DATE);
  P.tutorialDone = true;
  const job = ["detective", "historian", "occultist", "gambler", "artisan", "salesman"][Math.floor(rng() * 6)];
  G.assignJob(P, job);
  if (SKILL_PLUS) G.SKILLS.forEach(s => { P.skills[s] = Math.max(P.skills[s], Math.min(G.NUM.story.skillCap, P.skills[s] + SKILL_PLUS)); });
  if (GEAR0.length) { G.storyState(P).stamps = 999; GEAR0.forEach(id => { G.buyGear(P, id, DATE); G.wearGear(P, id); }); }
  const n = { early: 12, mid: 40, late: 100 }[stage];
  if (stage !== "early") {
    G.CATS.forEach(c => G.partOf(c).options.forEach(o => {
      if (o.forbidden || o.mutant || o.mix || o.gift || o.limited || o.key) return;
      if (stage === "mid" && (o.name === "皇冠" || o.name === "斯拉夫蹲")) return;
      if (!P.unlocked[c].includes(o.name)) P.unlocked[c].push(o.name);
    }));
  }
  if (stage === "late") P.myth = 4;
  for (let i = 0; i < n; i++) {
    const pick = {};
    G.CATS.forEach(c => { const u = G.usable(P, c); pick[c] = u[Math.floor(rng() * u.length)]; });
    // 有一半的人會花一點心情把骰子壓低（壓到稀有那條線）
    const nat = 1 + Math.floor(rng() * 100);
    G.finishMake(P, pick, { natural: nat });
  }
  P.mood = 50;
  return P;
}

// 挑隊伍：看整層每個房間的強度，加上帽子、姿勢的保護
function teamScore(P, keys, floor) {
  const team = G.teamItems(P, keys);
  const f = CELLAR.find(x => x.floor === floor);
  let s = 0;
  f.rooms.forEach(r => { s += G.teamPower(P, team, r).total; });
  const has = (c, v) => team.some(t => t.pick[c] === v);
  if (has("帽子", "棒球帽")) s += 4;
  if (has("帽子", "皇冠")) s += 4;
  if (has("姿勢", "斯拉夫蹲")) s += 3;
  if (has("姿勢", "躺平")) s += 2;
  if (has("帽子", "觸手帽")) s -= 6; // 觸手帽每次強度檢定都扣理智
  return s;
}
function pickTeam(P, rng, floor, how) {
  const keys = Object.keys(P.pepes).filter(k => !P.injured[k]);
  if (keys.length < 3) return null;
  if (how === "random") { const a = keys.slice().sort(() => rng() - 0.5); return a.slice(0, 3); }
  let best = null, bestS = -1e9;
  for (let i = 0; i < 120; i++) {
    const a = []; while (a.length < 3) { const k = keys[Math.floor(rng() * keys.length)]; if (!a.includes(k)) a.push(k); }
    const s = teamScore(P, a, floor);
    if (s > bestS) { bestS = s; best = a; }
  }
  return best;
}

// 每個選項的成功率和期望得失
function evalChoice(P, run, room, ch) {
  const team = G.teamItems(P, run.team);
  const has = (c, v) => team.some(t => t.pick[c] === v);
  const crown = has("帽子", "皇冠") && !run.used.crown;
  let p = 1, preLoss = 0;
  const t = ch.check.type;
  if (t === "power") {
    const need = ch.check.target - G.teamPower(P, team, room).total;
    p = Math.min(1, Math.max(0, (11 - Math.max(1, need)) / 10));
    if (need > 10) p = 0;
    if (crown) p = 1 - (1 - p) * (1 - p);
    if (has("帽子", "觸手帽")) preLoss += 2;
  } else if (t === "skill") {
    const v = Math.min(99, Math.max(1, G.skillOf(P, ch.check.skill) + (ch.check.mod || 0) + (has("帽子", "紳士帽") ? 10 : 0)));
    p = v / 100;
    if (crown) p = 1 - (1 - p) * (1 - p);
  } else if (t === "san") {
    p = Math.min(99, P.sanity) / 100;
    const [a, b] = String(ch.check.spec).split("/");
    preLoss += p * mean(a) + (1 - p) * mean(b);
  }
  const ok = ch.success || {}, bad = ch.fail || {};
  const firstWin = !P.cellar.won[room.id];
  const insp = p * (ok.insp ? (firstWin ? ok.insp : 1) : 0);
  const loss = preLoss + p * lossMean(ok.san) + (1 - p) * lossMean(bad.san) - p * gainMean(ok.san);
  const inj = p * (ok.injure ? 1 : 0) + (1 - p) * (bad.injure ? 1 : 0);
  return { p, insp, loss, inj, type: t };
}
const STRATS = {
  safe: e => -e.loss * 10 - e.inj * 3 + e.insp * 0.01,
  smart: e => e.insp - e.loss * 1.5 - e.inj * 2,
  greedy: e => e.insp - e.loss * 0.2,
  naive: null, // 隨便挑，但不挑「安全」
};

function descend(P, rng, strat, teamHow) {
  const out = { lossByFloor: [0, 0, 0, 0, 0], insp: 0, injuries: 0, blocked: 0, temp: 0, zero: false, zeroFloor: null, minSan: P.sanity, startSan: P.sanity,
    powerTry: 0, powerWin: 0, skillTry: 0, skillWin: 0, sanTry: 0, safeTaken: 0, floorsDone: 0 };
  for (let floor = 1; floor <= 5; floor++) {
    const team = pickTeam(P, rng, floor, teamHow);
    if (!team) break;
    const st = G.startCellar(P, floor, team);
    if (!st.ok) break;
    const before = P.sanity, inspBefore = P.insp;
    while (P.cellar.run && P.cellar.run.floor === floor) {
      const run = P.cellar.run, room = G.currentRoom(P);
      let idx;
      if (strat === "naive") {
        const opts = room.choices.map((c, i) => i).filter(i => room.choices[i].check.type !== "none");
        idx = opts[Math.floor(rng() * opts.length)];
      } else {
        let bs = -1e9;
        room.choices.forEach((c, i) => { const s = STRATS[strat](evalChoice(P, run, room, c)); if (s > bs) { bs = s; idx = i; } });
      }
      const res = G.cellarResolve(P, idx);
      let sanSuccess = null;
      const src = "cellar:" + room.id;
      const hit = loss => {
        const ev = G.applySan(P, loss, src);
        if (ev.temp && G.understandCheck(P).success) out.temp++;
        out.minSan = Math.min(out.minSan, P.sanity);
        if (ev.zero) { out.zero = true; out.zeroFloor = floor; }
      };
      if (res.type === "power") { out.powerTry++; if (res.success) out.powerWin++; }
      if (res.type === "skill") { out.skillTry++; if (res.success) out.skillWin++; }
      if (res.type === "none") out.safeTaken++;
      if (res.type === "san") { out.sanTry++; const r = G.sanCheck(P, res.sanSpec, src); hit(r.loss + Math.min(0, G.cellarDarkLoss(P, r.loss))); sanSuccess = r.success; } // 探險燈少扣（決定 0032）
      if (out.zero) break;
      const fx = G.cellarApply(P, res, sanSuccess);
      if (fx.injured) out.injuries++;
      out.blocked += fx.blocked.length;
      if (fx.sanLoss) hit(fx.sanLoss);
      if (out.zero) break;
      const a = G.cellarAdvance(P);
      if (a && a.floorDone) { out.floorsDone = floor; if (a.reward && a.reward.insp) { /* 層獎勵另外記 */ } }
      if (a && a.floorDone) { G.leaveCellar(P); break; }
    }
    out.lossByFloor[floor - 1] = before - P.sanity;
    out.insp += P.insp - inspBefore;
    if (out.zero) break;
  }
  return out;
}

const pct = (a, b) => b ? (100 * a / b).toFixed(0) + "%" : "-";
const avg = (xs, f) => xs.length ? (xs.reduce((n, x) => n + f(x), 0) / xs.length) : 0;
const q = (xs, f, k) => { const a = xs.map(f).sort((x, y) => x - y); return a.length ? a[Math.floor(k * (a.length - 1))] : 0; };

module.exports = { G, CELLAR, buildProfile, pickTeam, descend, evalChoice };
if (require.main === module) {
const rows = [];
for (const stage of ["early", "mid", "late"]) {
  for (const startSan of [70, 45]) {
    for (const strat of ["safe", "smart", "greedy", "naive"]) {
      const res = [];
      for (let i = 0; i < RUNS; i++) {
        const rng = G.mulberry32(1000 + i * 7919);
        const P = buildProfile(rng, stage);
        P.sanity = startSan; P.day.startSan = startSan;
        res.push(descend(P, rng, strat, strat === "naive" ? "random" : "best"));
      }
      rows.push({ stage, startSan, strat, res });
    }
  }
}
console.log("收藏 | 開始理智 | 選法 | 走完B5 | 歸零 | 暫時瘋狂 | 理智掉(中位/90%) | 每層掉 B1..B5 | 受傷 | 靈感(含層獎勵) | 強度檢定過 | 技能過 | 選安全");
for (const r of rows) {
  const x = r.res;
  console.log([r.stage, r.startSan, r.strat,
    pct(x.filter(o => o.floorsDone === 5).length, x.length),
    pct(x.filter(o => o.zero).length, x.length),
    avg(x, o => o.temp).toFixed(2),
    q(x, o => o.startSan - o.minSan, 0.5) + "/" + q(x, o => o.startSan - o.minSan, 0.9),
    x[0] ? [0, 1, 2, 3, 4].map(f => avg(x, o => o.lossByFloor[f]).toFixed(1)).join(" ") : "",
    avg(x, o => o.injuries).toFixed(1),
    avg(x, o => o.insp).toFixed(0),
    pct(x.reduce((n, o) => n + o.powerWin, 0), x.reduce((n, o) => n + o.powerTry, 0)) + " (" + avg(x, o => o.powerTry).toFixed(1) + "次)",
    pct(x.reduce((n, o) => n + o.skillWin, 0), x.reduce((n, o) => n + o.skillTry, 0)) + " (" + avg(x, o => o.skillTry).toFixed(1) + "次)",
    avg(x, o => o.safeTaken).toFixed(1),
  ].join(" | "));
}
}
