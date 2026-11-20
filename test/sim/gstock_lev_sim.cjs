// 集團股槓桿／放空的設計模擬（決定 0124 草案）：node test/sim/gstock_lev_sim.cjs
// 價格用真的集團股程式（gsAdvance、gsBuy、gsSell）；槓桿部位用差價單（CFD）模型：開倉價＝當時現價 P，平倉價＝當時現價 P，不推價，莊家是對手盤。
// 情境：A 壹般人隨機開多空（景氣 −1／0／+1）看莊家賺賠和單日最壞；B 炒作攻擊（館友先開槓桿多單再用現股把價推上去，賣回）有沒有賺，沒規則 vs 有「同壹支當天不能又現股又槓桿」；C 最壞壹天（全館同方向、價格走到漲停）莊家和博物館資金最多賠多少。
const { load } = require("../load_shared.cjs");
const D0 = "2026-11-16", add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10), fmt = n => Math.round(n).toLocaleString("en-US");
const tk = (day, k) => Date.parse(day + "T05:00:00+08:00") + k * 900000 + 1000;
function mk() { const G = load({ __realMoney: true }); G.NUM.casino.grants = []; G.NUM.casino.houseLoan.fix.on = false; const h = G.casHouseFix(G.casHouseNew(), D0).house; h.bankroll = 59e6; G.gsAdvance(h, D0, tk(D0, 1)); return { G, h }; }
const rnd = (() => { let s = 12345; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; })();
const LEV = 3, POS = 20e6, FEE = 0.5 / 100, CARRY = 0.15 / 100, EXPO = 0.2, FORCE = 0.5;
// A：壹般人
function scenA(b) {
  const { G, h } = mk(); const id = "g-daily"; let pnlH = 0, worst = 0, liq = 0, n = 0;
  for (let d = 0; d < 90; d++) {
    const day = add(D0, d); if (d > 0) { h.econ = { b, yoy: 14.36 }; G.casHouseFix(h, day); }
    const open = []; let expo = 0; const cap = Math.max(3e6, h.bankroll * EXPO);
    for (let k = 0; k < 75; k++) {
      G.gsAdvance(h, day, tk(day, k)); const P = h.gs.u[id].P;
      if (k === 3) for (let i = 0; i < 20; i++) { const side = rnd() < 0.5 ? 1 : -1, notional = Math.min(1.5e6, cap - expo); if (notional <= 0) continue; expo += notional; open.push({ side, e: P, q: notional / P, m: notional / LEV, hit: false }); }
      for (const p of open) if (!p.hit && (p.side * (P - p.e) * p.q + p.m) <= p.m * FORCE) { p.hit = true; p.x = P; liq++; }
    }
    let dayH = 0; const Pc = h.gs.u[id].P;
    for (const p of open) { const x = p.hit ? p.x : Pc, raw = p.side * (x - p.e) * p.q, eff = Math.max(raw, -p.m); dayH -= eff; n++; dayH += p.q * p.e * (FEE * 2) + p.q * p.e * CARRY * (p.side > 0 ? 1 - 1 / LEV : 1); }
    pnlH += dayH; worst = Math.min(worst, dayH);
  }
  return { b, pnlH, worst, liq, n };
}
// B：炒作攻擊。每天：開槓桿多單（notional N）→ 現股買到漲跌停附近 → 收盤前現股賣回、槓桿平倉
function scenB(rule) {
  const { G, h } = mk(); const id = "g-daily", w = G.casWalletFix(G.casWalletNew(), D0); w.chips = 5e9; let gain = 0, days = 0, N = 0;
  for (let d = 0; d < 20; d++) {
    const day = add(D0, d); if (d > 0) { h.econ = { b: 0, yoy: 14.36 }; G.casHouseFix(h, day); }
    G.gsAdvance(h, day, tk(day, 3)); const U = h.gs.u[id], P0 = U.P, notional = Math.min(POS, Math.max(3e6, h.bankroll * EXPO)); N = notional;
    const c0 = w.chips; let n = Math.floor(U.S * 0.019); while (n > 1 && !G.gsBuy(w, h, id, n, day, tk(day, 4)).ok) n = Math.floor(n * 0.8);
    const P1 = h.gs.u[id].P, bought = w.gs.h[id] || 0;
    if (rule) { /* 規則：這支今天現股買賣過就不能開槓桿；本情境槓桿單被擋 */ G.gsSell(w, h, id, "max", day, tk(day, 5)); continue; }
    const q = notional / P0, lev = q * (P1 - P0) - (notional * (FEE * 2 + CARRY * (1 - 1 / LEV))); // 多單在推價「之前」開，推完在 P1 平
    G.gsSell(w, h, id, "max", day, tk(day, 5)); gain += lev + (w.chips - c0); days++;
    void bought;
  }
  return { rule, gainPerDay: days ? gain / days : 0, days, N, cap: h.gs.u[id].S * h.gs.u[id].P };
}
// C：最壞壹天
function scenC() {
  const { G, h } = mk(); const id = "g-daily", U = h.gs.u[id], cap = Math.max(3e6, h.bankroll * EXPO), players = 20, worstLoss = cap * 0.10; // 日漲跌停 10%、單日純多
  return { expo: cap, worstLoss, pctBank: worstLoss / h.bankroll * 100, S: U.S, P: U.P, perPlayer: POS, players };
}
console.log("集團股槓桿／放空模擬（差價單：不推價、莊家當對手盤、同壹天一定平倉）");
for (const b of [-1, 0, 1]) { const r = scenA(b); console.log(`A 景氣 ${String(b).padStart(2)}：90 天莊家（手續費前後都算）淨 ${fmt(r.pnlH)}　最差壹天 ${fmt(r.worst)}　強平 ${r.liq}／${r.n} 筆`); }
for (const rule of [false, true]) { const r = scenB(rule); console.log(`B 炒作攻擊（槓桿多單 ${fmt(r.N)}）${rule ? "有規則（同支當天現股和槓桿擇壹）" : "沒規則"}：每天館友淨賺 ${fmt(r.gainPerDay)}（${r.days} 天；這支市值 ${fmt(r.cap)}）`); }
const c = scenC(); console.log(`C 最壞壹天：莊家對這支的槓桿曝險上限 ${fmt(c.expo)}（莊家餘額的 ${EXPO * 100}%），全部同方向、價格走到漲停 10% → 莊家最多賠 ${fmt(c.worstLoss)}（莊家餘額的 ${c.pctBank.toFixed(1)}%）`);
