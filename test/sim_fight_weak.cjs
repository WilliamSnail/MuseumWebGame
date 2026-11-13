// 新手隊（每人帶 K 隻）× 只按「推」的選法，打 B1 發抖的紙箱，看勝率。
// node test/sim_fight_weak.cjs [場數] — 測試 session 11-13 回報：兩人各 1 隻（強度 2）只推，第 5 回合全倒；這支算那種隊伍本來該不該輸。
const { G, buildProfile } = require("./sim_cellar.cjs");
const RUNS = +process.argv[2] || 400;
const foe = G.CELLAR_FOES.find(f => f.id === "f1a");
function run(players, perPlayer, rank, pol, i) {
  G.setRng(G.mulberry32(i * 131 + players * 17 + perPlayer * 7));
  const seats = [];
  for (let j = 0; j < players; j++) {
    const P = buildProfile(G.mulberry32(1000 + ((i * 4 + j) % 40) * 7919 + 104729), "early");
    const keys = Object.keys(P.pepes).filter(x => !P.injured[x]).map(x => [x, G.memberPower(G.teamItems(P, [x])[0], foe)]).sort((a, b) => b[1] - a[1]).slice(0, perPlayer).map(x => x[0]);
    seats.push(G.fightSeat(P, "p" + j, "p" + j, keys));
  }
  const n = seats.reduce((a, s) => a + s.pepes.length, 0);
  if (n < G.COOP.teamMin) seats.push(G.fightHelperSeat(Array.from({ length: G.COOP.teamMin - n }, (_, k) => G.coopHelperItem(k))));
  const f = G.fightStart(foe.id, seats, { rank });
  const power = seats.filter(s => !s.helper).map(s => G.fightPower(s));
  while (!f.over) {
    const picks = {};
    G.fightActors(f).forEach(s => {
      const it = f.intent || {};
      picks[s.id] = pol === "push" ? { act: "push" } : (it.kind === "hit" && it.to === s.id && G.fightUp(s).length === 1) ? { act: "guard" } : { act: "push" };
    });
    G.fightRound(f, picks);
  }
  return { win: f.over === "win" ? 1 : 0, rounds: f.round, hp: f.hp, hpMax: f.hpMax, power: power.join("+"), left: f.hp };
}
console.log(`B1 發抖的紙箱，${RUNS} 場。欄：贏%／平均回合／輸時怪物剩餘壓力（開場壓力）／我方強度`);
for (const rank of [1, 2]) for (const players of [1, 2]) for (const per of [1, 2, 3]) {
  const rs = Array.from({ length: RUNS }, (_, i) => run(players, per, rank, "push", i));
  const w = rs.reduce((a, r) => a + r.win, 0) / RUNS, rd = rs.reduce((a, r) => a + r.rounds, 0) / RUNS;
  const loss = rs.filter(r => !r.win), left = loss.length ? Math.round(loss.reduce((a, r) => a + r.left, 0) / loss.length) : 0;
  console.log(`Lv${rank} ${players}人×${per}隻  贏 ${Math.round(w * 100)}%  ${rd.toFixed(1)} 回合  輸時剩 ${left}／${rs[0].hpMax}  強度例 ${rs[0].power}`);
}
G.setRng(null);
