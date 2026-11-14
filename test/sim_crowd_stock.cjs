// 散客逛店對館內股的影響（11-14）：node test/sim_crowd_stock.cjs
// 館友每店每天 N 位（泊松）；連續 DAYS 天，每天用真的程式（casInNpcFor：有名字的 NPC 行程＋逛店散客，合計 ≤ 40%）算「昨天不同的人」和隔天跳空（casInJump）。
// 看：館友外的人數（每家店平均）、占比、跳空的平均／標準差／95 百分位／碰到上限的比例；不加散客逛店當對照。
const fs = require("fs"), path = require("path");
const { load } = require("./load_shared.cjs");
const LIST = fs.readdirSync(path.join(__dirname, "..", "content", "npc")).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "content", "npc", f), "utf8")));
const add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10), DAYS = 600;
function run(N, perStore, store) {
  const G = load(); G.NUM.casino.npcSpend.crowd.shop.perStore = perStore; G.NUM.casino.stockIn.npcBurstPct = 0;
  const h = G.casHouseFix(G.casHouseNew(), "2026-11-01").house, H = G.casInHouseFix(h), D0 = "2026-11-16", cap = G.NUM.casino.stockIn.jumpCap / 100;
  let s = 12345; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const pois = l => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; };
  const out = [], J = []; let outside = 0, share = 0;
  for (let i = 0; i < DAYS; i++) {
    const d = add(D0, i); H.use[d] = { [store]: pois(N) };
    const npc = G.casInNpcFor(H, d, "sec" + i, {}, { list: LIST, counters: null })[store]; outside += npc; share += npc / Math.max(1, H.use[d][store] + npc);
    if (i >= 10) { const m = G.casInJump(H, store, add(d, 1), 0, "sec" + i).m; J.push(m); }
  }
  const mean = J.reduce((a, b) => a + b, 0) / J.length, sd = Math.sqrt(J.reduce((a, b) => a + (b - mean) ** 2, 0) / J.length), abs = J.map(Math.abs).sort((a, b) => a - b);
  return { out: outside / DAYS, share: share / DAYS, mean: mean * 100, sd: sd * 100, p95: abs[Math.floor(abs.length * 0.95)] * 100, atCap: J.filter(x => Math.abs(x) >= cap - 1e-9).length / J.length * 100 };
}
const f = x => x.toFixed(2);
for (const N of [3, 5, 10, 20]) for (const [name, ps] of [["沒有散客逛店", 0], ["散客逛店", 1.5]]) { const x = run(N, ps, "food"); console.log(`館友 ${N}／店／天，${name}：館友外平均 ${f(x.out)} 位（占 ${f(x.share * 100)}%）；跳空 平均 ${f(x.mean)}%、標準差 ${f(x.sd)}%、|跳空| 95 百分位 ${f(x.p95)}%、碰到上限 ${f(x.atCap)}%`); }
