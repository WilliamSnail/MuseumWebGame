// 館內股：各房間即時人數公開之後，「看人數卡位」的期望報酬：node test/sim/sim_peek_stock.cjs
// 館友每店每天 N 位（泊松）。每天跑真的 casInRoll（NPC、散客、營收、跳空）。
// 「看得到的人數」＝ 收盤（23:30）那刻為止到店的人（NPC 時刻表 ＋ 逛店的散客；房間即時人數加起來的樣子）；收盤以後（到隔天 05:00）才到的、常來逛的散客（walk）、活動和突發多來的旅客、館友的人數和營收看不到。
// 策略：收盤前看得到的人數 v → 用前半段資料的線性迴歸猜明天的跳空 m̂ → |m̂| 超過來回成本才下單（多或空），賺 sign(m̂)×m − 成本。
// 對照：完全知道明天的跳空（上限）。報酬是每家店每天的平均 %。
const fs = require("fs"), path = require("path");
const { load } = require("../load_shared.cjs");
const LIST = fs.readdirSync(path.join(__dirname, "..", "..", "content", "npc")).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "content", "npc", f), "utf8")));
const add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10), DAYS = +process.argv[2] || 600, COST = 1.04;
function run(N, mod) {
  const G = load({ __realMoney: true }), C = G.NUM.casino.stockIn; if (mod) mod(G);
  const h = G.casHouseFix(G.casHouseNew(), "2026-11-01").house, H = G.casInHouseFix(h);
  let s = 987654; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const pois = l => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; };
  const rows = [], day = "2026-11-16"; G.casInRoll(h, add(day, -1), 0, "sec0", {}, { list: LIST, counters: null });
  for (let i = 0; i < DAYS; i++) {
    const d = add(day, i); H.use[d] = H.use[d] || {}; H.rev[d] = H.rev[d] || {};
    for (const st of G.IN_STORES) { const n = pois(N); H.use[d][st] = n; H.rev[d][st] = { p: Math.min(n * C.revCap, Math.floor(n * (200 + r() * 800))), x: 0 }; }
    const sec = "sec-peek", arr = G.npcShopArrive(d, sec, LIST, null), CL = (G.NUM.casino.stockIn.ticks - 1) * G.NUM.casino.stockIn.step;
    G.casInRoll(h, add(d, 1), 0, sec, {}, { list: LIST, counters: null });
    if (i >= 12) for (const st of G.IN_STORES) { const m = (H.open[st] / H.close[st] - 1) * 100, v = arr[st].filter(e => e.at <= CL).reduce((a, e) => a + e.n, 0); if (i >= 12) rows.push({ st, v, m }); }
  }
  let sumUp = 0, sumPeek = 0, nPeek = 0, n = 0;
  for (const st of G.IN_STORES) {
    const R = rows.filter(x => x.st === st), half = Math.floor(R.length / 2), tr = R.slice(0, half), te = R.slice(half);
    const mv = tr.reduce((a, x) => a + x.v, 0) / tr.length, mm = tr.reduce((a, x) => a + x.m, 0) / tr.length;
    let cov = 0, vr = 0; for (const x of tr) { cov += (x.v - mv) * (x.m - mm); vr += (x.v - mv) ** 2; }
    const b = vr > 0 ? cov / vr : 0, a = mm - b * mv;
    for (const x of te) { n++; sumUp += Math.max(Math.abs(x.m) - COST, 0); const mh = a + b * x.v; if (Math.abs(mh) > COST) { nPeek++; sumPeek += Math.sign(mh) * x.m - COST; } }
  }
  const SL = G.IN_STORES.map(st => { const R = rows.filter(x => x.st === st), mv = R.reduce((a, x) => a + x.v, 0) / R.length, mm = R.reduce((a, x) => a + x.m, 0) / R.length; let c = 0, v = 0; for (const x of R) { c += (x.v - mv) * (x.m - mm); v += (x.v - mv) ** 2; } return v > 0 ? c / v : 0; });
  return { slope: SL.reduce((a, b) => a + b, 0) / SL.length, n, up: sumUp / n, peek: sumPeek / n, trades: nPeek / n * 100 };
}
const f = x => x.toFixed(3);
const label = process.argv[3] || "現況"; const RAMP = process.argv[4] === undefined ? 1 : +process.argv[4];
for (const N of [3, 10]) { const x = run(N, G => { G.NUM.casino.stockIn.ramp = RAMP; }); console.log(`${label}｜館友 ${N}／店／天：每多 1 位到店的人，明天缺口 ${x.slope.toFixed(3)}%；看人數卡位 每家店每天 ${f(x.peek)}%（出手 ${x.trades.toFixed(1)}% 的日子）；完全知道跳空的上限 ${f(x.up)}%；來回成本 ${COST}%`); }
