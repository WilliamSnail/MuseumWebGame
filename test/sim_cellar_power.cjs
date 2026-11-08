// 看最好的隊伍在每一層的強度（給調強度門檻用）
const fs = require("fs"), path = require("path");
const { G, CELLAR, buildProfile, pickTeam } = require("./sim_cellar.cjs");
for (const stage of ["early", "mid", "late"]) {
  const per = [[], [], [], [], []], parts = [];
  for (let i = 0; i < 200; i++) {
    const rng = G.mulberry32(1000 + i * 7919);
    const P = buildProfile(rng, stage);
    for (let f = 1; f <= 5; f++) {
      const team = pickTeam(P, rng, f, "best");
      const fl = CELLAR.find(x => x.floor === f);
      const items = G.teamItems(P, team);
      fl.rooms.forEach(r => { if (r.choices.some(c => c.check.type === "power")) per[f - 1].push(G.teamPower(P, items, r).total); });
      if (f === 3) parts.push(items.map(it => it.pick.稀有度 + "/" + it.pick.心情 + "/" + it.pick.帽子 + "/" + it.pick.姿勢).join(" ; "));
    }
  }
  const q = (a, k) => a.slice().sort((x, y) => x - y)[Math.floor(k * (a.length - 1))];
  console.log(stage, per.map((a, f) => `B${f + 1} p10/50/90=${q(a, .1)}/${q(a, .5)}/${q(a, .9)}`).join("  "));
  console.log("  例：", parts.slice(0, 3).join("  ||  "));
}
