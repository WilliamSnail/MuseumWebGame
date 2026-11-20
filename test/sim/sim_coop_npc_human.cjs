// 找 NPC 下地下（翊文 11-21 選「NPC 像真人隊友」）：NPC 會投票、算進人數加成，跟真人隊伍比。node test/sim/sim_coop_npc_human.cjs [趟數 120] [層 2,4,5]
// NPC 當一位隊員：理智 70、帶 1 隻（早期收藏最強的一隻）、投票跟真人一樣用 smart（簡化：好的 NPC 投票 AI 至少不會比真人會玩）。
// 對照：真人（跟我同等級收藏、帶 1 或 2 隻）。NPC 若比真人好或差不多，要先提保險給翊文。
const { G } = require("./sim_cellar.cjs");
process.env.SIM_FUN = "1"; process.env.SIM_TALK = "1";
const S = require("./sim_coop.cjs");
const RUNS = +process.argv[2] || 120, FLOORS = (process.argv[3] || "2,4,5").split(",").map(Number);
const avg = (xs, f) => xs.length ? xs.reduce((n, x) => n + f(x), 0) / xs.length : 0;
const START = G.NUM.startSanity;
// kind：npc ＝ 早期收藏、理智 70（NPC）；human ＝ 跟我同層等級的收藏、理智 START（真人）
function member(kind, floor, i, j) {
  if (kind === "npc") { const P = S.profile(1, i, 20 + j); P.cellar.best = floor - 1; P.sanity = 70; P.day.startSan = 70; return P; }
  return S.profile(floor, i, j);
}
function run(kinds, each, floor) {
  const res = [];
  for (let i = 0; i < RUNS; i++) { const r = S.coop(kinds.map((k, j) => member(k, floor, i, j)), each, floor, 5000 + i * 7919 + floor); if (r) res.push(r); }
  return res;
}
const row = (f, name, r, who) => console.log(`B${f} | ${name} | ${(100 * avg(r, o => o.clear ? 1 : 0)).toFixed(0)}% | ${(100 * avg(r, o => o.ghost)).toFixed(1)}% | ${avg(r, o => o.loss0).toFixed(1)} | ${avg(r, o => o.insp0).toFixed(1)}`);
console.log(`NPC 像真人隊友：每格 ${RUNS} 趟；「我」（第 1 位）自己的平均（走完、歸零是整隊的；扣理智、靈感只算我）`);
console.log("層 | 隊伍 | 走完 | 歸零 | 扣理智 | 靈感");
for (const f of FLOORS) {
  row(f, "我×2隻＋館方助手（現況）", run(["human"], [2], f));
  row(f, "我×1隻＋NPC×1（NPC 帶 1 隻）", run(["human", "npc"], [1, 1], f));
  row(f, "我×2隻＋NPC×1（NPC 帶 1 隻）", run(["human", "npc"], [2, 1], f));
  row(f, "我×2隻＋NPC×2", run(["human", "npc", "npc"], [2, 1, 1], f));
  row(f, "真人 2 人×1 隻", run(["human", "human"], [1, 1], f));
  row(f, "真人 2 人×2 隻", run(["human", "human"], [2, 2], f));
  row(f, "真人 3 人×1 隻", run(["human", "human", "human"], [1, 1, 1], f));
}
