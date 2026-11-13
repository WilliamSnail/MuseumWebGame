// 館內 GDP 和景氣指數的模擬（11-13，數值平衡；docs/經濟體系規劃.md 2.7 節）
// node test/sim_gdp.cjs [天數，預設 120]
// 用 casinoReport 的每日快照（casBookSnap 相減）算每天的 GDP：消費＋投資＋政府支出＋淨出口，再算成長率和景氣指數，看雜訊多大。
// 玩家行為：每人每天有 ACTIVE 機率上線；上線就做滿每日上限，賺到的 R 比例輸給莊家（同 sim_econ_world.cjs）。
const { load } = require("./load_shared.cjs");
const G = load();
const DAYS = +process.argv[2] || 120, E = process.env;
const R = E.R ? +E.R : 0.8, ACTIVE = E.ACTIVE ? +E.ACTIVE : 0.7;
const VISITORS = 20, SCORE = 60;
const plus = (d, n) => { const [y, m, x] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, x + n)).toISOString().slice(0, 10); };
const D0 = "2026-11-14";
// GDP 的算法（v1）：
//   消費 C ＝ 餐車 ＋ 21 點輸給莊家的淨額（正的才算）
//   政府支出 G ＝ 拚經濟撥款（econWin）
//   淨出口 NX ＝ 門票（三份都算）－ 沉到海底的（econSea）
//   投資 I ＝ 存款、館債、股票的淨增加（銀行和股票還沒做，先 0）
// v2（穩的）：消費只算餐車；政府支出算『拚經濟的次數×固定值』不算隨機金額 → 這裡用 econWin 的 7 天平均代替（見下）
const gdp = d => {
  const f = d.flow, C = (f.food || 0) + Math.max(0, f.bj || 0), Gv = f.econWin || 0;
  const ticket = (d.mint.ticket || 0) + (d.houseMint.ticketBudget || 0) + (d.houseMint.ticketMuseum || 0);
  const NX = ticket + (f.econSea || 0); // econSea 的 flow 是負的
  return { C, I: 0, G: Gv, NX, gdp: C + Gv + NX };
};
function run(N, seed) {
  G.setRng(G.mulberry32(seed));
  const house = G.casHouseFix(G.casHouseNew(), D0).house;
  const ws = Array.from({ length: N }, () => G.casWalletFix(G.casWalletNew(), D0));
  const room = G.CELLAR[0].rooms.map(r => r.id);
  const ticketDay = Math.round(VISITORS * SCORE * G.NUM.casino.ticket.perScore);
  let prev = G.casBookSnap(ws, house, 0, D0);
  const series = [], cnt = { active: 0 }, counts = [];
  for (let d = 0; d < DAYS; d++) {
    const day = plus(D0, d);
    G.casHouseFix(house, day);
    G.NUM.casino.econ.freezeKeep = 20;
    for (const w of ws) {
      G.casWalletFix(w, day); G.casLoanToHouse(w, house);
      if (G.RNG() > ACTIVE) continue;
      cnt.active++;
      const c0 = w.chips;
      G.casOpenPacks(w, house, 2, day);
      for (let k = 0; k < 3; k++) G.casEconPlay(w, house, day);
      G.casCellarFind(w, house, room[d % room.length], day);
      G.casJobChips(w, house, ["0", "1", "2", "3", "4"], day);
      G.casBuy(w, house, 1 + (d % 4), day);
      G.casMint(w, "ticket", Math.round(ticketDay * G.NUM.casino.ticket.ownerPct / 100));
      G.casPoolMint(house, "budget", "ticketBudget", Math.round(ticketDay * G.NUM.casino.ticket.budgetPct / 100));
      G.casPoolMint(house, "museum", "ticketMuseum", ticketDay - Math.round(ticketDay * G.NUM.casino.ticket.ownerPct / 100) - Math.round(ticketDay * G.NUM.casino.ticket.budgetPct / 100));
      const earned = Math.max(0, w.chips - c0), lose = Math.min(w.chips, Math.floor(earned * R));
      w.chips -= lose; G.casHouseMove(house, "bj", lose);
    }
    const snap = G.casBookSnap(ws, house, 0, day);
    series.push(gdp(G.casBookDiff(prev, snap)));
    counts.push(cnt.active); cnt.active = 0;
    prev = snap;
  }
  G.setRng(null);
  series.counts = counts;
  return series;
}
const M = n => (n / 1e6).toFixed(1) + "M";
console.log(`${DAYS} 天，每人每天 ${ACTIVE * 100}% 上線，輸給莊家 ${R * 100}%。GDP＝消費＋政府支出＋淨出口（投資還沒做）`);
for (const N of [3, 10, 20]) {
  const s = run(N, 20261113 + N), g = s.map(x => x.gdp);
  const mean = g.reduce((a, b) => a + b, 0) / g.length, sd = Math.sqrt(g.reduce((a, b) => a + (b - mean) ** 2, 0) / g.length);
  // 成長率：今天對前 7 天平均；景氣指數：成長率 ÷ 10% 夾在 −1～+1
  const gr = g.map((x, i) => { if (i < 7) return null; const m7 = g.slice(i - 7, i).reduce((a, b) => a + b, 0) / 7; return m7 ? (x - m7) / m7 : 0; }).filter(x => x !== null);
  const idx = gr.map(x => Math.max(-1, Math.min(1, x / 0.1)));
  const inBand = idx.filter(x => Math.abs(x) < 1).length / idx.length, pos = idx.filter(x => x > 0.3).length / idx.length, neg = idx.filter(x => x < -0.3).length / idx.length;
  // 計數版 GDP（v2）：每位上線的人貢獻固定的『標準活動值』W（拚經濟 3 次×平均撥款＋餐車＋門票…），不看隨機的賺賠金額
  const W = 3 * 4.085e6 / 3 + 1.2e6 + VISITORS * SCORE * G.NUM.casino.ticket.perScore, c = s.counts.map(n => n * W);
  const wk2 = []; for (let i = 14; i <= c.length; i++) { const a = c.slice(i - 7, i).reduce((x, y) => x + y, 0), b = c.slice(i - 14, i - 7).reduce((x, y) => x + y, 0); wk2.push(b ? (a - b) / b : 0); }
  const sd2 = Math.sqrt(wk2.reduce((a, b) => a + b * b, 0) / wk2.length), i2 = wk2.map(x => Math.max(-1, Math.min(1, x / 0.1)));
  console.log(`  【計數版 v2】每人每天標準活動值 ${M(W)}；每週比成長率標準差 ${(sd2 * 100).toFixed(0)}%；景氣好（>0.3）${(i2.filter(x => x > 0.3).length / i2.length * 100).toFixed(0)}%、差（<−0.3）${(i2.filter(x => x < -0.3).length / i2.length * 100).toFixed(0)}%、普通 ${(i2.filter(x => Math.abs(x) <= 0.3).length / i2.length * 100).toFixed(0)}%`);
  const m = k => s.reduce((a, x) => a + x[k], 0) / s.length;
  console.log(`\n${N} 人：平均每天 GDP ${M(mean)}（消費 ${M(m("C"))}、政府 ${M(m("G"))}、淨出口 ${M(m("NX"))}）；每天的變動（標準差）${(sd / mean * 100).toFixed(0)}%`);
  const wk = []; for (let i = 14; i <= g.length; i++) { const a = g.slice(i - 7, i).reduce((x, y) => x + y, 0), b = g.slice(i - 14, i - 7).reduce((x, y) => x + y, 0); wk.push(b ? (a - b) / b : 0); }
  const wsd = Math.sqrt(wk.reduce((a, b) => a + b * b, 0) / wk.length), wi = wk.map(x => Math.max(-1, Math.min(1, x / 0.1)));
  console.log(`  【每週比】這 7 天對前 7 天的成長率標準差 ${(wsd * 100).toFixed(0)}%；景氣好（>0.3）${(wi.filter(x => x > 0.3).length / wi.length * 100).toFixed(0)}%、差（<−0.3）${(wi.filter(x => x < -0.3).length / wi.length * 100).toFixed(0)}%、普通 ${(wi.filter(x => Math.abs(x) <= 0.3).length / wi.length * 100).toFixed(0)}%`);
  console.log(`  成長率（今天對前 7 天平均）標準差 ${(Math.sqrt(gr.reduce((a, b) => a + b * b, 0) / gr.length) * 100).toFixed(0)}%；景氣指數落在 ±1 之間 ${(inBand * 100).toFixed(0)}%，景氣好（>0.3）${(pos * 100).toFixed(0)}%、差（<−0.3）${(neg * 100).toFixed(0)}%`);
}
