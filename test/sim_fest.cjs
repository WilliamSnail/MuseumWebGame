// 預告活動的驗算（規劃 2.8k、11-14）：node test/sim_fest.cjs
// 館友每家店每天 N 位（泊松）、NPC 平均 2 位；某天有預告活動（festP 的機率辦成，b 0.5～1.0）。看：
//   (1) 活動那天的隔天跳空（預先進場買的期望報酬）、(2) 之後 7 天的平均跳空（扣不扣平均的差別，放空的人賺不賺得到）
const { load } = require("./load_shared.cjs");
const G = load(), C = G.NUM.casino.stockIn, K = C.k !== undefined ? C.k : 0.03;
const add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const pois = (r, l) => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; };
function trial(N, seed, fix) {
  const h = G.casHouseFix(G.casHouseNew(), "2026-11-01").house, H = G.casInHouseFix(h), D = "2026-11-12", id = "food";
  let s = seed >>> 0; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 12; i >= 1; i--) { const d = add(D, -i); H.use[d] = { food: pois(r, N) }; H.npc[d] = { food: pois(r, 2) }; }
  const ctx = { fest: { [D]: [{ store: "food", name: "活動" }] } };
  H.use[D] = { food: pois(r, N) };
  G.casInNpcFor(H, D, "s" + seed, {}, ctx);
  if (!fix) H.npcX = {};
  const out = { ev: G.casInJump(H, id, add(D, 1), 0, "s" + seed).m };
  let sum = 0;
  for (let i = 1; i <= 7; i++) { const d = add(D, i); H.use[d] = { food: pois(r, N) }; G.casInNpcFor(H, d, "s" + seed + i, {}, null); if (!fix) H.npcX = {}; sum += G.casInJump(H, id, add(d, 1), 0, "s" + seed + i).m; }
  out.after = sum / 7; return out;
}
for (const N of [3, 5, 10, 20]) {
  for (const fix of [true, false]) {
    let ev = 0, af = 0; const M = 4000;
    for (let i = 0; i < M; i++) { const t = trial(N, i + 1, fix); ev += t.ev; af += t.after; }
    console.log(`館友 ${N}／店／天，${fix ? "扣掉活動的人算平均" : "不扣（舊）"}：活動隔天跳空平均 ${(ev / M * 100).toFixed(3)}%，之後 7 天每天平均 ${(af / M * 100).toFixed(3)}%（累計 ${(af / M * 700).toFixed(2)}%）`);
  }
}
console.log("理論：K×p×b ＝", (K * C.festP * (C.festMin + C.festMax) / 2 * 100).toFixed(3) + "%；來回成本 ＝", (2 * G.NUM.casino.stock.feePct + G.NUM.casino.stock.holdPct).toFixed(2) + "%");
