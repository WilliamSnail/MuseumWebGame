// 找 NPC 下地下：帶很多位 NPC、多位玩家各帶 NPC、隊伍超過 4 人（翊文 11-21 補充）。node test/sim/sim_coop_npc_many.cjs [趟數 80] [層 2,4,5]
// 翊文 11-21：真人加 NPC 合計最多 4 位，每個人（真人或 NPC）帶 1～2 隻。NPC 照決定 0149 當真人隊員（理智 70、早期收藏 1 隻、會投票）。
// 看：「我」每趟的靈感和扣理智；整隊每趟的靈感總和（NPC 的不算）；全帶 NPC 對比全真人。
const { G } = require("./sim_cellar.cjs");
process.env.SIM_FUN = "1"; process.env.SIM_TALK = "1";
const S = require("./sim_coop.cjs");
if (process.env.NPC_W) G.NUM.casino.coopNpc.bonusWeight = +process.env.NPC_W; // NPC_W=0.5：NPC 只算半個人的人數加成（決定 0149 的保險 A）
const RUNS = +process.argv[2] || 80, FLOORS = (process.argv[3] || "2,4,5").split(",").map(Number);
const avg = (xs, f) => xs.length ? xs.reduce((n, x) => n + f(x), 0) / xs.length : 0;
const START = G.NUM.startSanity;
function member(kind, floor, i, j) {
  if (kind === "npc") { const P = S.profile(1, i, 20 + j); P.__npc = true; P.cellar.best = floor - 1; P.sanity = 70; P.day.startSan = 70; return P; }
  return S.profile(floor, i, j);
}
function run(h, n, floor, pep = 1) {
  const kinds = Array(h).fill("human").concat(Array(n).fill("npc")), each = kinds.map(() => pep), res = [];
  for (let i = 0; i < RUNS; i++) { const r = S.coop(kinds.map((k, j) => member(k, floor, i, j)), each, floor, 5000 + i * 7919 + floor); if (r) res.push(r); }
  return res;
}
const CFG = [[1, 0], [1, 1], [1, 2], [1, 3], [2, 0], [2, 1], [2, 2], [3, 0], [3, 1], [4, 0]];
console.log(`多位 NPC：每格 ${RUNS} 趟；人數＝真人＋NPC（每人帶 1 隻）。我的靈感／扣理智只算第 1 位真人；走完、歸零是整隊的`);
console.log("層 | 真人＋NPC | 每人帶 | 走完 | 歸零 | 我扣理智 | 我的靈感");
for (const f of FLOORS) for (const pep of [1, 2]) for (const [h, n] of CFG) {
  const r = run(h, n, f, pep);
  console.log(`B${f} | ${h}＋${n} | ${pep} 隻 | ${(100 * avg(r, o => o.clear ? 1 : 0)).toFixed(0)}% | ${(100 * avg(r, o => o.ghost)).toFixed(1)}% | ${avg(r, o => o.loss0).toFixed(1)} | ${avg(r, o => o.insp0).toFixed(1)}`);
}
