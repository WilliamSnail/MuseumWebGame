// 模擬地下室改版的打怪物（shared/cellar_fight.js，決定 0067）：1～4 個人，每層的一般怪物和守門各打很多場
// node test/sim_fight.cjs [次數，預設 300]
// 隊員的收藏照 sim_cellar.cjs 的 buildProfile（B1、B2 用 early，B3、B4 用 mid，B5 用 late）；每個人帶對這隻怪物最強的 2 隻，不滿 3 隻館方助手補。
// 選法（很單純，當成「普通會玩的人」）：
//   還沒找到弱點、自己看穿有五成以上：第一個這樣的人看穿，其他人推；
//   怪物要撲自己、自己只剩一隻：擋；理智剩不到 15、怪物要嚇自己：擋；其他都推。招式不用（所以實際會比這個好打一點）。
// 印出：贏的比例、平均幾回合、每個人平均扣多少理智、每個人平均倒下幾隻
const { G, buildProfile } = require("./sim_cellar.cjs");
const RUNS = +process.argv[2] || 300;
const STAGE = { 1: "early", 2: "early", 3: "mid", 4: "mid", 5: "late" };
const POOL = 40, cache = new Map();
function profile(floor, n) {
  const stage = STAGE[floor], id = stage + ":" + (n % POOL);
  if (!cache.has(id)) cache.set(id, JSON.stringify(buildProfile(G.mulberry32(1000 + (n % POOL) * 7919 + { early: 1, mid: 2, late: 3 }[stage] * 104729), stage)));
  return JSON.parse(cache.get(id));
}
function bestKeys(P, foe, k) {
  return Object.keys(P.pepes).filter(x => !P.injured[x]).map(x => [x, G.memberPower(G.teamItems(P, [x])[0], foe)]).sort((a, b) => b[1] - a[1]).slice(0, k).map(x => x[0]);
}
function pick(f, s) {
  const it = f.intent, mine = it && it.to === s.id;
  if (mine && it.kind === "hit" && G.fightUp(s).length === 1) return { act: "guard" };
  if (mine && it.kind === "scare" && s.san < 15) return { act: "guard" };
  return { act: "push" };
}
function one(foe, players, run) {
  G.setRng(G.mulberry32(run * 131 + players * 17 + foe.floor * 7 + (foe.boss ? 3 : 0)));
  const seats = [];
  for (let j = 0; j < players; j++) { const P = profile(foe.floor, run * 4 + j); seats.push(G.fightSeat(P, "p" + j, "p" + j, bestKeys(P, foe, 2))); }
  const n = seats.reduce((a, s) => a + s.pepes.length, 0);
  if (n < G.COOP.teamMin) seats.push(G.fightHelperSeat(Array.from({ length: G.COOP.teamMin - n }, (_, i) => G.coopHelperItem(i))));
  const f = G.fightStart(foe.id, seats, {});
  const o = { win: 0, rounds: 0, san: 0, downs: 0 };
  while (!f.over) {
    const picks = {};
    let seer = false;
    G.fightActors(f).forEach(s => {
      if (!f.weak && !seer && G.fightSeeChance(s) >= 50) { picks[s.id] = { act: "see" }; seer = true; }
      else picks[s.id] = pick(f, s);
    });
    const r = G.fightRound(f, picks);
    Object.values(r.fx).forEach(x => { o.san += x.san; o.downs += x.downs.length; });
  }
  o.win = f.over === "win" ? 1 : 0; o.rounds = f.round; o.over = f.over;
  o.san /= players; o.downs /= players;
  return o;
}
const pad = (s, n) => String(s).padEnd(n);
console.log(`打怪物的模擬，每格 ${RUNS} 場。欄位：贏 %／平均回合／每人扣理智／每人倒下幾隻`);
G.cellarFloors().forEach(floor => {
  G.CELLAR_FOES.filter(f => f.floor === floor).forEach(foe => {
    const cells = [1, 2, 3, 4].map(players => {
      const t = { win: 0, rounds: 0, san: 0, downs: 0 };
      for (let i = 0; i < RUNS; i++) { const o = one(foe, players, i); t.win += o.win; t.rounds += o.rounds; t.san += o.san; t.downs += o.downs; }
      return `${players}人 ${pad(Math.round(t.win / RUNS * 100) + "%", 5)}${pad((t.rounds / RUNS).toFixed(1), 5)}${pad((t.san / RUNS).toFixed(1), 5)}${pad((t.downs / RUNS).toFixed(2), 5)}`;
    });
    console.log(`B${floor} ${pad(G.fightFoeName(foe.id) + (foe.boss ? "（守門）" : ""), 14)} ${cells.join(" | ")}`);
  });
});
G.setRng(null);
