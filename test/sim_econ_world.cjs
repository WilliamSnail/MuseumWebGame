// 預算池和莊家的長期模擬（11-13，數值平衡；docs/經濟體系規劃.md 2.6 節的預設值）
// node test/sim_econ_world.cjs [天數，預設 90]
// 用真的規則（casEconPlay、casOpenPacks、casJobChips…）讓 N 個玩家每天做滿每日上限，
// 加上還沒做進遊戲的：門票進預算池、莊家稅、預算凍結。看預算池、莊家、破產重開（印錢）的長期樣子。
// 玩家怎麼用錢（不能從規則算出來，所以是旋鈕）：每天把賺到的籌碼的 R 比例輸給莊家（21 點、餐車、買券），其餘留在錢包。
// 環境變數：R（預設 0.8）、VISITORS（每人每天來幾位參觀者，預設 20）、SCORE（展廳評分，預設 60）、TICKET（每分的票價，預設 1000）、SHARE（門票進預算池的比例，預設 0.5）、
//          TAX_FROM（莊家稅門檻，預設 200000000）、TAX（稅率，預設 0.1）、FREEZE（凍結時撥款剩幾成，預設 0.2）
const { load } = require("./load_shared.cjs");
const G = load();
const DAYS = +process.argv[2] || 90;
const E = process.env;
const R = E.R ? +E.R : 0.8, VISITORS = E.VISITORS ? +E.VISITORS : 20, SCORE = E.SCORE ? +E.SCORE : 60, TICKET = E.TICKET ? +E.TICKET : 1000, SHARE = E.SHARE ? +E.SHARE : 0.5;
const TAX_FROM = E.TAX_FROM ? +E.TAX_FROM : 200000000, TAX = E.TAX ? +E.TAX : 0.1, FREEZE = E.FREEZE ? +E.FREEZE : 0.2;
const plus = (d, n) => { const [y, m, x] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, x + n)).toISOString().slice(0, 10); };
const D0 = "2026-11-14";

// cfg：{ tickets, tax, freeze }
function world(N, cfg, seed) {
  G.setRng(G.mulberry32(seed));
  const house = G.casHouseFix(G.casHouseNew(), D0).house;
  const wallets = Array.from({ length: N }, () => G.casWalletFix(G.casWalletNew(), D0));
  const room = G.CELLAR[0].rooms.map(r => r.id);
  const out = { resets: 0, resetMint: 0, ticketIn: 0, taxIn: 0, frozenDays: 0, budgetMin: Infinity, dayZero: null, snaps: {} };
  const ticketDay = Math.round(VISITORS * SCORE * TICKET * SHARE);
  for (let d = 0; d < DAYS; d++) {
    const day = plus(D0, d);
    const before = house.bankroll;
    G.casHouseFix(house, day);
    if (house.led.mint.reset > (out.resetMint)) { out.resets++; out.resetMint = house.led.mint.reset; }
    // 莊家稅：每週一（d % 7 === 0）收超過門檻的部分
    if (cfg.tax && d % 7 === 0 && house.bankroll > TAX_FROM) {
      const t = Math.floor((house.bankroll - TAX_FROM) * TAX);
      G.casHouseMove(house, "tax", -t); house.budget += t; out.taxIn += t;
    }
    const frozen = cfg.freeze && house.budget <= 0;
    if (frozen) out.frozenDays++;
    for (const w of wallets) {
      G.casWalletFix(w, day);
      G.casLoanToHouse(w, house);
      const c0 = w.chips;
      G.casOpenPacks(w, house, 2, day);
      for (let k = 0; k < 3; k++) {
        // 凍結時：成功也只撥平常的 FREEZE 成（照 casEconPlay 的結果縮小，差額不動預算池）
        const hb = house.bankroll, bb = house.budget;
        G.casEconPlay(w, house, day);
        if (frozen && house.budget < bb) {
          const win = bb - house.budget, keep = Math.floor(win * FREEZE);
          house.budget = bb - keep; house.bankroll = hb + keep; // 莊家只收到 keep
        }
      }
      G.casCellarFind(w, house, room[d % room.length], day);
      G.casJobChips(w, house, ["0", "1", "2", "3", "4"], day);
      if (cfg.tickets) { house.budget += ticketDay; out.ticketIn += ticketDay; }
      if (d % 7 === 0) G.casMint(w, "signWeek", Math.floor(G.NUM.signin.weekChips * 0.5)); // 一半的人全勤
      // 賺到的籌碼輸給莊家（21 點、餐車）：R 比例
      const earned = Math.max(0, w.chips - c0);
      const lose = Math.min(w.chips, Math.floor(earned * R));
      w.chips -= lose; G.casHouseMove(house, "bj", lose);
    }
    out.budgetMin = Math.min(out.budgetMin, house.budget);
    if (out.dayZero === null && house.budget <= 0) out.dayZero = d + 1;
    if ([29, 59, 89, 179, 364].includes(d)) out.snaps[d + 1] = { budget: house.budget, bankroll: house.bankroll, wallets: wallets.reduce((a, w) => a + w.chips, 0) };
    void before;
  }
  G.setRng(null);
  return out;
}
const M = n => (n / 1e6).toFixed(0).replace(/\B(?=(\d{3})+$)/g, ",") + "M";
console.log(`${DAYS} 天。玩家每天做滿每日上限，賺到的 ${R * 100}% 輸給莊家。門票：每人每天 ${VISITORS} 位 × 評分 ${SCORE} × ${TICKET}/分 × ${SHARE * 100}% 進預算池 ＝ ${M(VISITORS * SCORE * TICKET * SHARE)}/人/天`);
const CFG = [["A 現在（沒有進帳）", {}], ["B ＋門票", { tickets: 1 }], ["C ＋門票＋莊家稅", { tickets: 1, tax: 1 }], ["D ＋門票＋莊家稅＋預算凍結", { tickets: 1, tax: 1, freeze: 1 }]];
for (const N of [3, 10, 20]) {
  console.log(`\n== ${N} 位玩家 ==`);
  console.log("設定                          預算池見底   重開(印錢)次數/金額   凍結天數   門票進   稅進   第30天預算/莊家      第90天預算/莊家");
  for (const [name, cfg] of CFG) {
    const o = world(N, cfg, 20261113 + N);
    const s30 = o.snaps[30] || {}, s90 = o.snaps[90] || o.snaps[DAYS] || {};
    console.log(`${name.padEnd(26)} ${String(o.dayZero ? "第 " + o.dayZero + " 天" : "沒見底").padEnd(9)} ${String(o.resets).padStart(3)}次 / ${M(o.resetMint).padEnd(7)}  ${String(o.frozenDays).padStart(5)}    ${M(o.ticketIn).padStart(6)} ${M(o.taxIn).padStart(6)}   ${M(s30.budget || 0)}/${M(s30.bankroll || 0)}      ${M(s90.budget || 0)}/${M(s90.bankroll || 0)}`);
  }
}
