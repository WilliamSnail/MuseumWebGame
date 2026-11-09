// 模擬合作地下收藏庫（shared/coop.js）：1–4 個人、每人帶 1 或 2 隻，B1–B5 各走一層，跟單人的地下比。
// node test/sim_coop.cjs [次數，預設 1000] [開始理智，預設 NUM.startSanity]
// 隊員的收藏照 sim_cellar.cjs 的 buildProfile 做（B1、B2 用 early，B3、B4 用 mid，B5 用 late）。
// 同一個號碼的那一趟，單人和合作用的是同一份收藏（第 1 位隊員就是單人那位），比較才公平。
// 選法：每個人都用 sim_cellar.cjs 的「smart」（靈感 − 理智損失 × 1.5 − 受傷 × 2），各投各的，多數決。
// 挑隊員：單人和合作都用下面的 pickKeys（每隻照整層的強度排，挑最強的幾隻）。
//   sim_cellar.cjs 的 pickTeam 是隨機抽 120 組 3 隻，收藏一多（晚期 100 隻）就挑不到最強的那組，單人會被算得太弱。
const { G, CELLAR, buildProfile, evalChoice } = require("./sim_cellar.cjs");
const FUN = process.env.SIM_FUN === "1";   // SIM_FUN=1：打開好玩的機制（記號、房間裡的東西、搬、猜）
const TALK = process.env.SIM_TALK === "1"; // SIM_TALK=1：隊員有講話（知道記號對上的是哪個，算進選法）
const RUNS = +process.argv[2] || 1000;
const START = +process.argv[3] || G.NUM.startSanity;
const STAGE = { 1: "early", 2: "early", 3: "mid", 4: "mid", 5: "late" };

const parse = e => { const m = String(e).trim().match(/^(\d+)D(\d+)$/i); return m ? { n: +m[1], m: +m[2] } : { flat: +e || 0 }; };
const mean = e => { const p = parse(e); return p.m ? p.n * (p.m + 1) / 2 : p.flat; };
const lossMean = s => (!s || String(s).startsWith("+")) ? 0 : mean(s);
const gainMean = s => (s && String(s).startsWith("+")) ? mean(String(s).slice(1)) : 0;
const smart = e => e.insp - e.loss * 1.5 - e.inj * 2;
const powerP = need => need > 10 ? 0 : Math.min(1, Math.max(0, (11 - Math.max(1, need)) / 10)); // 強度＋1D10 ≥ 門檻的機率

// 收藏：buildProfile（sim_cellar 的做法，職業也是它隨機挑的）。做一隻晚期的收藏要 0.2 秒，
// 所以每個階段先做 POOL 份放著，第 run 趟的第 j 位隊員拿第 (run × 4 ＋ j) 份（同一趟的隊員不會重複）
const POOL = Math.min(RUNS * 4, +process.env.SIM_POOL || 240);
const cache = new Map();
function profile(floor, run, j) {
  const stage = STAGE[floor], n = (run * 4 + j) % POOL, id = stage + ":" + n;
  if (!cache.has(id)) {
    const rng = G.mulberry32(1000 + n * 7919 + { early: 1, mid: 2, late: 3 }[stage] * 104729);
    cache.set(id, JSON.stringify(buildProfile(rng, stage)));
  }
  const P = JSON.parse(cache.get(id));
  P.cellar.best = floor - 1; P.sanity = START; P.day.startSan = START;
  return P;
}

// 每位隊員自己挑 k 隻：整層每間的強度（一隻自己算，比讚、巫師帽、觸手帽也算進去）＋帽子、姿勢的保護
function pickKeys(P, floor, k) {
  const f = CELLAR.find(x => x.floor === floor);
  const score = key => {
    const it = G.teamItems(P, [key])[0];
    let s = f.rooms.reduce((n, r) => n + G.teamPower(null, [it], r).total, 0);
    const p = it.pick;
    if (p.帽子 === "棒球帽") s += 4; if (p.帽子 === "皇冠") s += 4; if (p.姿勢 === "斯拉夫蹲") s += 3; if (p.姿勢 === "躺平") s += 2; if (p.帽子 === "觸手帽") s -= 6;
    return s;
  };
  return Object.keys(P.pepes).filter(x => !P.injured[x]).map(x => [x, score(x)]).sort((a, b) => b[1] - a[1]).slice(0, k).map(x => x[0]);
}

// ---------- 單人：跟 sim_cellar.cjs 的 descend 一樣，只走一層 ----------
function single(P, floor, seed) {
  G.setRng(G.mulberry32(seed));
  const team = pickKeys(P, floor, 3);
  const o = { clear: false, ghost: 0, loss: 0, insp: 0, powerTry: 0, powerWin: 0, skillTry: 0, skillWin: 0, safe: 0, odds: [], people: 1 };
  if (!team || !G.startCellar(P, floor, team).ok) return null;
  const items = G.teamItems(P, team);
  G.cellarFloor(floor).rooms.forEach(r => r.choices.forEach(c => { if (c.check.type === "power") o.odds.push(powerP(c.check.target - G.teamPower(P, items, r).total)); }));
  const inspBefore = P.insp;
  let zero = false;
  while (P.cellar.run) {
    const run = P.cellar.run, room = G.currentRoom(P);
    let idx = 0, bs = -1e9;
    room.choices.forEach((c, i) => { const s = smart(evalChoice(P, run, room, c)); if (s > bs) { bs = s; idx = i; } });
    const res = G.cellarResolve(P, idx), src = "cellar:" + room.id;
    const hit = loss => { if (G.applySan(P, loss, src).zero) zero = true; };
    let sanSuccess = null;
    if (res.type === "power") { o.powerTry++; if (res.success) o.powerWin++; }
    if (res.type === "skill") { o.skillTry++; if (res.success) o.skillWin++; }
    if (res.type === "none") o.safe++;
    if (res.type === "san") { const r = G.sanCheck(P, res.sanSpec, src); hit(r.loss); sanSuccess = r.success; if (!zero) { const d = G.cellarDarkLoss(P, r.loss); if (d) hit(d); } }
    if (zero) break;
    const fx = G.cellarApply(P, res, sanSuccess);
    if (fx.sanLoss) hit(fx.sanLoss);
    if (zero) break;
    const a = G.cellarAdvance(P);
    if (a && a.floorDone) { o.clear = true; G.leaveCellar(P); break; }
  }
  o.ghost = zero ? 1 : 0;
  o.loss = START - P.sanity;
  o.insp = P.insp - inspBefore;
  return o;
}

// ---------- 合作：每個人照自己的角度評估每個選項，各投各的 ----------
function evalCoop(run, Ps, id, room, ch) {
  const P = Ps[id], pr = run.pressure, t = ch.check.type;
  const has = (c, v) => G.teamHas(run.team, c, v);
  const crown = has("帽子", "皇冠") && !run.used.crown;
  let p = 1, preLoss = 0, failExtra = 0;
  if (t === "power") {
    p = powerP(G.coopTargetOf(run, ch.check.target) - G.coopPower(run, Ps, room).total);
    if (crown) p = 1 - (1 - p) * (1 - p);
    if (G.coopOwns(run, id, "帽子", "觸手帽")) preLoss += 2;
    failExtra = pr.failSan;
  } else if (t === "skill") {
    const by = G.coopRoller(run, Ps, ch.check.skill);
    const v = Math.min(99, Math.max(1, G.skillOf(Ps[by], ch.check.skill) + (ch.check.mod || 0) + (has("帽子", "紳士帽") ? 10 : 0) + pr.skill));
    p = v / 100;
    if (crown) p = 1 - (1 - p) * (1 - p);
    failExtra = pr.failSan;
  } else if (t === "san") {
    p = Math.min(99, P.sanity) / 100;
    const [a, b] = String(ch.check.spec).split("/");
    preLoss += p * mean(a) + (1 - p) * (mean(b) + pr.failSan);
  }
  const ok = ch.success || {}, bad = ch.fail || {};
  const firstWin = !P.cellar.won[room.id];
  const insp = p * (ok.insp ? (firstWin ? ok.insp : 1) : 0);
  const loss = preLoss + p * lossMean(ok.san) + (1 - p) * (lossMean(bad.san) + failExtra) - p * gainMean(ok.san);
  const mine = run.team.filter(it => it.owner === id).length, humans = run.team.filter(it => it.owner).length || 1;
  const inj = (p * (ok.injure ? 1 : 0) + (1 - p) * (bad.injure ? 1 : 0)) * mine / humans;
  return { p, insp, loss, inj };
}
function coop(profiles, each, floor, seed) {
  const rng = G.mulberry32(seed); G.setRng(rng);
  const members = profiles.map((P, j) => ({ id: "p" + j, name: "隊員" + (j + 1), P, keys: pickKeys(P, floor, each[j]) }));
  const s = G.startCoop(members, floor, FUN ? { id: "sim" + seed, fun: true } : {});
  if (!s.ok) return null;
  const run = s.run, Ps = {};
  members.forEach(m => { Ps[m.id] = m.P; });
  const o = { clear: false, ghost: 0, wipe: false, loss: 0, insp: 0, powerTry: 0, powerWin: 0, skillTry: 0, skillWin: 0, safe: 0, odds: [], people: members.length, pressure: 0, rooms: 0, ties: 0, clueHit: 0, carryOk: 0, carryBad: 0, ev: 0, guessOk: 0, guessBad: 0 };
  const inspBefore = members.map(m => m.P.insp);
  G.cellarFloor(floor).rooms.forEach(r => r.choices.forEach(c => { if (c.check.type === "power") o.odds.push(powerP(G.coopTargetOf(run, c.check.target) - G.coopPower(run, Ps, r).total)); }));
  while (run.phase === "vote") {
    const room = G.coopRoom(run), votes = {};
    G.coopVoters(run).forEach(m => {
      let idx = 0, bs = -1e9;
      room.choices.forEach((c, i) => { const sc = smart(evalCoop(run, Ps, m.id, room, c)) + (TALK && run.clue && run.clue.answer === i ? 2 : 0); if (sc > bs) { bs = sc; idx = i; } });
      votes[m.id] = idx;
    });
    o.pressure += run.pressure.lv; o.rooms++;
    const r = G.coopResolve(run, Ps, votes);
    if (r.vote.tied.length) o.ties++;
    const t = r.check.type;
    if (t === "power") { o.powerTry++; if (r.check.success) o.powerWin++; }
    if (t === "skill") { o.skillTry++; if (r.check.success) o.skillWin++; }
    if (t === "none") o.safe++;
    if (r.check.clue) o.clueHit++;
    if (run.phase === "over") break;
    let a = G.coopAdvance(run, Ps);
    if (run.phase === "carry") { // 搬：前兩個人一左一右
      G.coopVoters(run).forEach((m, i) => G.coopCarryPick(run, m.id, i === 0 ? "L" : i === 1 ? "R" : "skip"));
      G.coopCarryDo(run, Ps);
      const k = run.carry.result.kind;
      if (k === "ok") o.carryOk++; else if (k === "slip" || k === "bump") o.carryBad++;
      if (run.phase === "over") break;
      a = G.coopAdvance(run, Ps);
    }
    if (a.floorDone) {
      o.clear = true;
      if (run.phase === "guess") { // 猜：照找到的證據挑對上最多的那位
        const found = run.truth.found.map(x => x.kind);
        const best = G.COOP_RESIDENTS.slice().sort((x, y) => y.ev.filter(k => found.includes(k)).length - x.ev.filter(k => found.includes(k)).length)[0];
        const votes2 = {};
        G.coopVoters(run).forEach(m => { votes2[m.id] = best.id; });
        G.coopGuess(run, Ps, votes2);
        if (run.truth.right) o.guessOk++; else o.guessBad++;
      }
      if (run.truth) o.ev = run.truth.found.length;
      break;
    }
  }
  o.wipe = run.over === "lost";
  o.ghost = run.members.filter(m => m.ghost).length / members.length;
  o.loss = members.reduce((n, m) => n + (START - m.P.sanity), 0) / members.length;
  o.insp = members.reduce((n, m, j) => n + (m.P.insp - inspBefore[j]), 0) / members.length;
  return o;
}

// ---------- 跑 ----------
const CONFIGS = [
  { label: "單人（自己 3 隻）", single: true },
  { label: "1 人 × 1 隻＋助手 2", each: [1] },
  { label: "1 人 × 2 隻＋助手 1", each: [2] },
  { label: "2 人 × 1 隻＋助手 1", each: [1, 1] },
  { label: "2 人 × 2 隻（4 隻）", each: [2, 2] },
  { label: "3 人 × 1 隻（3 隻）", each: [1, 1, 1] },
  { label: "3 人 × 2 隻（6 隻）", each: [2, 2, 2] },
  { label: "4 人 × 1 隻（4 隻）", each: [1, 1, 1, 1] },
  { label: "4 人 2+2+1+1（6 隻）", each: [2, 2, 1, 1] },
];
const pct = (a, b) => b ? (100 * a / b).toFixed(0) + "%" : "-";
const avg = (xs, f) => xs.length ? xs.reduce((n, x) => n + f(x), 0) / xs.length : 0;
const sum = (xs, f) => xs.reduce((n, x) => n + f(x), 0);

module.exports = { single, coop, profile, pickKeys, CONFIGS };
if (require.main === module) {
  const t0 = Date.now();
  console.log(`合作地下收藏庫的模擬：每格 ${RUNS} 趟，開始理智 ${START}，大家都用 smart 的選法`);
  console.log(`門檻放大：門檻 ＋（門檻 − ${G.COOP.dice}）×（隻數 − ${G.COOP.baseTeam}）÷ ${G.COOP.baseTeam} × ${G.COOP.scale} ＋ ${G.COOP.perPlayer} ×（人數 − 1）；理智壓力 ${G.COOP.pressure.map(p => `平均 < ${p.below} → ${p.lv} 級（門檻 +${p.power}、技能 ${p.skill}、失敗多扣 ${p.failSan}）`).join("；")}`);
  if (FUN) console.log(`好玩的機制打開了（SIM_FUN=1）${TALK ? "，隊員有講話（SIM_TALK=1）" : ""}`);
  console.log("層 | 隊伍 | 走完這層 | 每人歸零（幽靈） | 全滅 | 每人扣理智 | 每人靈感 | 強度勝算（每個強度選項都推） | 強度檢定過（次數） | 技能過（次數） | 選安全 | 平均壓力");
  for (let floor = 1; floor <= 5; floor++) {
    CONFIGS.forEach(cfg => {
      const res = [];
      for (let i = 0; i < RUNS; i++) {
        const seed = 5000 + i * 7919 + floor;
        const r = cfg.single ? single(profile(floor, i, 0), floor, seed) : coop(cfg.each.map((e, j) => profile(floor, i, j)), cfg.each, floor, seed);
        if (r) res.push(r);
      }
      console.log([`B${floor}`, cfg.label,
        pct(res.filter(o => o.clear).length, res.length),
        (100 * avg(res, o => o.ghost)).toFixed(1) + "%",
        cfg.single ? "-" : pct(res.filter(o => o.wipe).length, res.length),
        avg(res, o => o.loss).toFixed(1),
        avg(res, o => o.insp).toFixed(1),
        (100 * avg(res, o => avg(o.odds, x => x))).toFixed(0) + "%",
        pct(sum(res, o => o.powerWin), sum(res, o => o.powerTry)) + "（" + avg(res, o => o.powerTry).toFixed(1) + "）",
        pct(sum(res, o => o.skillWin), sum(res, o => o.skillTry)) + "（" + avg(res, o => o.skillTry).toFixed(1) + "）",
        avg(res, o => o.safe).toFixed(1),
        cfg.single ? "-" : (sum(res, o => o.pressure) / Math.max(1, sum(res, o => o.rooms))).toFixed(2),
        ...(FUN && !cfg.single ? [`對上記號 ${avg(res, o => o.clueHit).toFixed(1)}/間`, `證據 ${avg(res, o => o.ev).toFixed(1)}`, `猜對 ${pct(sum(res, o => o.guessOk), sum(res, o => o.guessOk + o.guessBad))}（有猜 ${pct(sum(res, o => o.guessOk + o.guessBad), res.length)}）`, `搬回來 ${pct(sum(res, o => o.carryOk), sum(res, o => o.carryOk + o.carryBad))}`] : []),
      ].join(" | "));
    });
  }
  console.log(`（${((Date.now() - t0) / 1000).toFixed(0)} 秒）`);
}
