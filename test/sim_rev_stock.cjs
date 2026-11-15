// 館內股：營收也影響跳空（決定 0087）的模擬：node test/sim_rev_stock.cjs
// 館友每店每天 N 位（泊松）、各花一點錢；連續 DAYS 天用真的程式（casInRoll：NPC、散客、營收）算每天的跳空。
// 看：跳空的平均、標準差、95 百分位、碰到上限的比例；以及「館友自己砸錢＋多去一次」能把明天的跳空推高多少（要小於來回成本 1.04%）。對照：營收權重 0（只看人數）。
const fs = require("fs"), path = require("path");
const { load } = require("./load_shared.cjs");
const LIST = fs.readdirSync(path.join(__dirname, "..", "content", "npc")).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "content", "npc", f), "utf8")));
const add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10), DAYS = 400;
function run(N, wr, store) {
  const G = load({ __realMoney: true }); G.NUM.casino.stockIn.revWeight = wr; G.NUM.casino.stockIn.npcBurstPct = 0;
  const h = G.casHouseFix(G.casHouseNew(), "2026-11-01").house, H = G.casInHouseFix(h), cap = G.NUM.casino.stockIn.jumpCap / 100, C = G.NUM.casino.stockIn;
  let s = 987654; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const pois = l => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; };
  const J = [], gain = [];
  let day = "2026-11-16"; G.casInRoll(h, add(day, -1), 0, "sec0", {}, { list: LIST, counters: null });
  for (let i = 0; i < DAYS; i++) {
    const d = add(day, i); H.use[d] = H.use[d] || {}; H.rev[d] = H.rev[d] || {};
    for (const st of G.IN_STORES) { const n = pois(N); H.use[d][st] = n; H.rev[d][st] = { p: Math.min(n * C.revCap, Math.floor(n * (200 + r() * 800))), x: 0 }; }
    G.casInRoll(h, add(d, 1), 0, "sec" + i, {}, { list: LIST, counters: null }); // 換日：算今天的 NPC、營收，明天的跳空
    if (i >= 12) {
      J.push(H.jump[store]);
      // 自己砸錢：昨天（d）多去一次、花滿 revCap，重算明天（d+1）的跳空
      const m0 = G.casInJump(H, store, add(d, 1), 0, "sec" + i).m;
      H.use[d][store] += 1; H.rev[d][store].p += C.revCap; const m1 = G.casInJump(H, store, add(d, 1), 0, "sec" + i).m; H.use[d][store] -= 1; H.rev[d][store].p -= C.revCap;
      gain.push(m1 - m0);
    }
  }
  const mean = J.reduce((a, b) => a + b, 0) / J.length, sd = Math.sqrt(J.reduce((a, b) => a + (b - mean) ** 2, 0) / J.length), abs = J.map(Math.abs).sort((a, b) => a - b);
  return { mean: mean * 100, sd: sd * 100, p95: abs[Math.floor(abs.length * 0.95)] * 100, atCap: J.filter(x => Math.abs(x) >= cap - 1e-9).length / J.length * 100, gain: gain.reduce((a, b) => a + b, 0) / gain.length * 100, gainMax: Math.max(...gain) * 100 };
}
const f = x => x.toFixed(2);
for (const N of [1, 3, 10]) for (const wr of [0, 0.5]) { const x = run(N, wr, "food"); console.log(`館友 ${N}／店／天，營收權重 ${wr}：跳空 平均 ${f(x.mean)}%、標準差 ${f(x.sd)}%、|跳空| 95 百分位 ${f(x.p95)}%、碰頂 ${f(x.atCap)}%；自己多去一次＋砸 3,000：平均多 ${f(x.gain)}%（最多 ${f(x.gainMax)}%）`); }
console.log("來回成本（買賣手續費＋稅）約 1.04%：自己推高的幅度要小於這個。");
