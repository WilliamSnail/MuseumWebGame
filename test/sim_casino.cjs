// 賭場的模擬：node test/sim_casino.cjs [幾手，預設 400000]
// 用同一份規則（shared/casino.js），不同的打法、不同的加成，看每注玩家平均賺賠多少（負的＝莊家贏）。
// 也跑「雙人同桌」跟單人的結果會不會不一樣（同一副牌、輪流），和大禮包、餐車的莊家流水。
// 結果寫進維護日誌 11-09_翊文_Hamachi賭場.md。
const { load } = require("./load_shared.cjs");
const G = load();
const N = Number(process.argv[2]) || 300000;
const SEED = 20261109;
// 每一格都用同一個種子：同樣的牌、只差打法或加成，比較才準（不然雜訊比加成還大）
const reseed = () => G.setRng(G.mulberry32(SEED));
const { casNewRound, casHit, casStand, casHand, casPoint, casShuffle, casDealerPlay, casOutcome, casPayout, casPackDraw } = G;
const BET = 1000000; // 注大一點，加成的取整數才不會被吃掉

// 打法：回傳 true ＝要牌
const up = r => casPoint(r.dealer[1]);
const STRAT = {
  "跟莊家一樣（17 才停）": r => casHand(r.player).total < 17,
  "基本打法（看莊家明牌）": r => {
    const h = casHand(r.player), u = up(r), ua = r.dealer[1] % 13 === 0;
    if (h.soft) return h.total <= 17 || (h.total === 18 && (ua || u >= 9));
    if (h.total >= 17) return false;
    if (h.total >= 13 && u >= 2 && u <= 6 && !ua) return false;
    if (h.total === 12 && u >= 4 && u <= 6 && !ua) return false;
    return true;
  },
  "高手（基本打法＋四張牌 17 以下一直要，衝五張）": r => {
    const h = casHand(r.player), u = up(r), ua = r.dealer[1] % 13 === 0;
    if (r.player.length === 4 && h.total <= 17) return true;
    if (h.soft) return h.total <= 17 || (h.total === 18 && (ua || u >= 9));
    if (h.total >= 17) return false;
    if (h.total >= 13 && u >= 2 && u <= 6 && !ua) return false;
    if (h.total === 12 && u >= 4 && u <= 6 && !ua) return false;
    return true;
  },
  "亂打（13–18 隨機停）": r => { const t = casHand(r.player).total; return t < 13 || (t < 19 && G.RNG() < 0.5); },
};
const bp = (job, luck) => G.NUM.casino.bonus.luckPct * luck / 100 + (job ? G.NUM.casino.bonus.gamblerPct : 0);
const BONUS = [["沒有加成", 0], ["幸運 60", bp(false, 60)], ["賭徒＋幸運 60", bp(true, 60)], ["賭徒＋幸運 99", bp(true, 99)]];

function hand(strat, pct) {
  let r = casNewRound({ id: "s", bet: BET, bonusPct: pct, san: 99 });
  while (r.state === "playing" && strat(r)) casHit(r, r.seq);
  if (r.state === "playing") casStand(r, r.seq);
  return r.out;
}
console.log(`每種打法 ${N} 手，注 ${BET}；數字＝玩家每注平均賺賠（%），負的＝莊家贏`);
const rows = [];
for (const [sn, st] of Object.entries(STRAT)) {
  const cells = [];
  for (const [bn, pct] of BONUS) {
    let net = 0, kinds = {};
    reseed();
    for (let i = 0; i < N; i++) { const o = hand(st, pct); net += o.net; kinds[o.kind] = (kinds[o.kind] || 0) + 1; }
    cells.push({ bn, ev: net / N / BET * 100, kinds });
  }
  rows.push([sn, cells]);
  console.log(`\n${sn}`);
  cells.forEach(c => console.log(`  ${(c.bn + `（${BONUS.find(b => b[0] === c.bn)[1].toFixed(2)}%）`).padEnd(30)} ${c.ev.toFixed(2).padStart(7)}%`));
}
const k = rows[1][1][0].kinds;
console.log(`\n基本打法的結果分布：${Object.entries(k).map(([a, b]) => `${a} ${(b / N * 100).toFixed(1)}%`).join("、")}`);

// 同桌：2 人同一副牌輪流打（每人 N/2 手），跟單人比
function table(players, strat, pct, hands) {
  let net = 0, n = 0;
  for (let h = 0; h < hands; h++) {
    const deck = casShuffle();
    const dealer = [deck.pop(), deck.pop()];
    const ps = Array.from({ length: players }, () => [deck.pop(), deck.pop()]);
    const fake = { dealer, player: null };
    ps.forEach(p => {
      fake.player = p;
      while (casHand(p).total < 21 && p.length < 5 && strat(fake)) p.push(deck.pop());
    });
    if (!ps.every(p => casHand(p).bust || casHand(p).charlie)) casDealerPlay(dealer, deck);
    ps.forEach(p => { const o = casOutcome(p, dealer); net += casPayout(BET, o.kind, pct).net; n++; });
  }
  return net / n / BET * 100;
}
console.log(`\n同桌（基本打法、賭徒＋幸運 60）：1 人 ${table(1, STRAT["基本打法（看莊家明牌）"], 0.8, N).toFixed(2)}%、2 人 ${table(2, STRAT["基本打法（看莊家明牌）"], 0.8, N / 2).toFixed(2)}%、4 人 ${table(4, STRAT["基本打法（看莊家明牌）"], 0.8, N / 4).toFixed(2)}%`);

// 大禮包：一包平均給多少（莊家出）
let sum = 0, stars = [0, 0, 0, 0, 0, 0];
const PN = 1000000;
for (let i = 0; i < PN; i++) { const d = casPackDraw(); sum += d.chips; stars[d.stars]++; }
console.log(`\n大禮包 ${PN} 包：平均 ${Math.round(sum / PN).toLocaleString()} 籌碼／包；星級 ${[1, 2, 3, 4, 5].map(s => `${s}星 ${(stars[s] / PN * 100).toFixed(2)}%`).join("、")}`);
console.log(`  買 1 抽券 ${G.CAS_MENU.find(x => x.id === "ticket1").price.toLocaleString()}、買 11 抽券 ${G.CAS_MENU.find(x => x.id === "ticket11").price.toLocaleString()}（舊的價錢）；11 包平均 ${Math.round(sum / PN * 11).toLocaleString()}`);
