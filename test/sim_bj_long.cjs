// 21 點長跑：node test/sim_bj_long.cjs [幾手，預設 2000000] [種子] [加成%，預設 0]
// 只比「基本打法」和「高手（衝五張）」，沒有加成，算每注平均賺賠和標準誤差（看是不是真的正的）。
// 兩種打法用同壹個種子（同樣的牌序起點），差值的誤差比各自的小。
// 2026-11-13 寫（數值平衡），結果寫進維護日誌。
const { load } = require("./load_shared.cjs");
const G = load();
const N = Number(process.argv[2]) || 2000000;
const SEED = Number(process.argv[3]) || 20261113;
const BONUS = Number(process.argv[4]) || 0; // 贏的那把多賺幾 %（賭徒＋幸運 99 ＝ 0.398，是遊戲裡的最大值）
const { casNewRound, casHit, casStand, casHand, casPoint } = G;
const BET = 1000000;
const up = r => casPoint(r.dealer[1]);
function basic(r) {
  const h = casHand(r.player), u = up(r), ua = r.dealer[1] % 13 === 0;
  if (h.soft) return h.total <= 17 || (h.total === 18 && (ua || u >= 9));
  if (h.total >= 17) return false;
  if (h.total >= 13 && u >= 2 && u <= 6 && !ua) return false;
  if (h.total === 12 && u >= 4 && u <= 6 && !ua) return false;
  return true;
}
// 衝五張的門檻：四張牌、點數 ≤ t 就再要
const expert = t => r => (r.player.length === 4 && casHand(r.player).total <= t) ? true : basic(r);
const STRAT = [["基本打法", basic], ["高手（四張 ≤17 衝五張）", expert(17)], ["四張 ≤16 衝", expert(16)], ["四張 ≤18 衝", expert(18)]];
function hand(st) {
  const r = casNewRound({ id: "s", bet: BET, bonusPct: BONUS, san: 99 });
  while (r.state === "playing" && st(r)) casHit(r, r.seq);
  if (r.state === "playing") casStand(r, r.seq);
  return r.out;
}
console.log(`每種打法 ${N.toLocaleString()} 手，種子 ${SEED}，加成 ${BONUS}%`);
const t0 = Date.now();
for (const [name, st] of STRAT) {
  G.setRng(G.mulberry32(SEED));
  let s = 0, s2 = 0; const kinds = {};
  for (let i = 0; i < N; i++) { const o = hand(st); const x = o.net / BET; s += x; s2 += x * x; kinds[o.kind] = (kinds[o.kind] || 0) + 1; }
  const m = s / N, sd = Math.sqrt(s2 / N - m * m), se = sd / Math.sqrt(N);
  console.log(`${name.padEnd(22)} 平均 ${(m * 100).toFixed(3)}%  ±${(se * 196).toFixed(3)}%（95%）  ` + Object.entries(kinds).map(([a, b]) => `${a} ${(b / N * 100).toFixed(2)}%`).join(" "));
}
console.log(`花了 ${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
