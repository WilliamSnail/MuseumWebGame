// 找 NPC 一起下地下（docs/規劃/找NPC下地下規劃.md）：NPC 當「有名字的館方助手」，各種專長對一趟的影響，跟真人隊伍比。
// node test/sim/sim_coop_npc.cjs [每格趟數，預設 150] [層，預設 2,4,5]
// NPC 的專長用調 COOP 的數字來模擬（不改遊戲）：帶路＝每個人多看到一個記號（clue.seekSkill 0）；搬運＝搬東西不手滑 95%（carry.helper 95、base +10）；
// 壯膽＝全隊理智壓力的門檻降 8（pressure.below −8）；三樣都有＝上限（拿來看「再強也不能超過真人」）。
const { G, } = require("./sim_cellar.cjs");
process.env.SIM_FUN = "1"; process.env.SIM_TALK = "1";
const S = require("./sim_coop.cjs");
const RUNS = +process.argv[2] || 150, FLOORS = (process.argv[3] || "2,4,5").split(",").map(Number);
const C = G.COOP, base = JSON.stringify({ clue: C.clue, carry: C.carry, pressure: C.pressure });
const reset = () => { const b = JSON.parse(base); C.clue = b.clue; C.carry = b.carry; C.pressure = b.pressure; };
const ROLES = {
  "沒專長（＝現在的館方助手）": () => {},
  "帶路（多看到一個記號）": () => { C.clue = Object.assign({}, C.clue, { seekSkill: 0 }); },
  "搬運（搬東西穩）": () => { C.carry = Object.assign({}, C.carry, { helper: 95, base: C.carry.base + 10 }); },
  "壯膽（理智壓力晚來）": () => { C.pressure = C.pressure.map(p => Object.assign({}, p, { below: p.below - 8 })); },
  "三樣都有（上限）": () => { C.clue = Object.assign({}, C.clue, { seekSkill: 0 }); C.carry = Object.assign({}, C.carry, { helper: 95, base: C.carry.base + 10 }); C.pressure = C.pressure.map(p => Object.assign({}, p, { below: p.below - 8 })); },
};
const avg = (xs, f) => xs.length ? xs.reduce((n, x) => n + f(x), 0) / xs.length : 0;
const run = (cfg, floor) => { const res = []; for (let i = 0; i < RUNS; i++) { const r = S.coop(cfg.each.map((e, j) => S.profile(floor, i, j)), cfg.each, floor, 5000 + i * 7919 + floor); if (r) res.push(r); } return res; };
const cfgs = { "我×2隻＋NPC": { each: [2] }, "我×1隻＋NPC×2": { each: [1] } }; // 助手補到 3 隻；NPC 就是補位的那幾位
console.log(`NPC 專長模擬：每格 ${RUNS} 趟；數字是「我」每趟的平均（靈感、扣理智、走完率、歸零率）`);
console.log("層 | 隊伍 | 專長 | 走完 | 歸零 | 扣理智 | 靈感");
for (const f of FLOORS) {
  for (const [cn, cfg] of Object.entries(cfgs)) for (const [rn, fx] of Object.entries(ROLES)) {
    reset(); fx(); const r = run(cfg, f);
    console.log(`B${f} | ${cn} | ${rn} | ${(100 * avg(r, o => o.clear ? 1 : 0)).toFixed(0)}% | ${(100 * avg(r, o => o.ghost)).toFixed(1)}% | ${avg(r, o => o.loss).toFixed(1)} | ${avg(r, o => o.insp).toFixed(1)}`);
  }
  reset();
  for (const [hn, each] of [["真人 2 人×2 隻", [2, 2]], ["真人 3 人×1 隻", [1, 1, 1]]]) { const r = run({ each }, f); console.log(`B${f} | ${hn} | - | ${(100 * avg(r, o => o.clear ? 1 : 0)).toFixed(0)}% | ${(100 * avg(r, o => o.ghost)).toFixed(1)}% | ${avg(r, o => o.loss).toFixed(1)} | ${avg(r, o => o.insp).toFixed(1)}`); }
}
