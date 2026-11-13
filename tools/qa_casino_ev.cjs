// QA：餐車和贏牌抽券的期望值（決定 0070），用真的規則函式抽很多次，看平均拿回占價錢幾成。
//   node tools/qa_casino_ev.cjs [次數，預設 300000]
const { load } = require("../test/load_shared.cjs");
const G = load(), N = Number(process.argv[2] || 300000);
G.setRng(G.mulberry32(7));
const EV = G.casPackEV(), day = "2026-11-10";
console.log(`一張券（3 張一包大禮包）平均 ${EV}，每包 ${EV}`);
for (const it of G.CAS_MENU) {
  if (!it.price || it.redirect || it.ticket) continue;
  const house = G.casHouseNew(); let w = G.casWalletNew(); w.chips = 1e15; w.pk.opened = 1; let spent = 0, tix = 0;
  for (let i = 0; i < N; i++) { w.food = null; const t0 = w.tickets; const r = G.casBuy(w, house, it.n, day, undefined, null); if (!r.ok) break; spent += it.price; tix += w.tickets - t0; }
  console.log(`${it.name || it.id} 價 ${it.price}：抽中 ${tix} 張 / ${N} 次，平均拿回 ${(tix * EV / spent * 100).toFixed(1)}%`);
}
for (const bet of [1e4, 1e5, 1e6, 1e7, 1e8]) {
  let hit = 0; const M = 2e6; for (let i = 0; i < M; i++) { const w = G.casWalletNew(); w.pk.opened = 1; if (G.casWinTicket(w, bet)) hit++; }
  console.log(`贏牌下注 ${bet}：機率 ${(hit / M * 100).toFixed(3)}%（算式 ${G.casWinOdds(bet).toFixed(3)}%）；期望 ${(hit / M * EV / bet * 100).toFixed(2)}% of bet（應 ≤1%）`);
}
