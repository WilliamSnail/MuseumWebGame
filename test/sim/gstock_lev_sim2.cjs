// 集團股槓桿／放空（決定 0124 草案，翊文 11-17：槓桿單也推價、倍數 5、掛單照現股推價）：node test/sim/gstock_lev_sim2.cjs
// 價格用真的集團股程式（gsAdvance、gsBuy、gsSell：推價、半價差、漲跌停、15 分鐘價）。槓桿部位用「在現股市場上真的買進／賣出」模擬：
//   做多開倉＝買 n 股（推價漲）、平倉或強平＝賣 n 股（推價跌）；放空開倉＝賣 n 股（推價跌）、平倉或強平＝買 n 股（推價漲）。成交價 ＝ 這次推價的平均價（含半價差）。
//   槓桿的錢另算：保證金 ＝ 部位 ÷ 倍數，強平 ＝ 保證金加損益 ≤ 50%，賠最多賠保證金（多的算壞帳），手續費 0.5%（開、平各壹次）加利息／借券費；對手盤是莊家。
// 情境：A 壹般人隨機多空（景氣 −1／0／+1，90 天）；B 自己推價去強平別人（放空者很多、壹人用槓桿多單拉高）；C 強平連鎖（壹天內壹大堆槓桿單同方向）；D 拉高出貨／放空砸盤的套利；E 各集團的市值深度 vs 曝險上限。
const { load } = require("../load_shared.cjs");
const D0 = "2026-11-16", add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10), fmt = n => Math.round(n).toLocaleString("en-US");
const tk = (day, k) => Date.parse(day + "T05:00:00+08:00") + k * 900000 + 1000;
const DAYS = +(process.argv[2] || 30), LEV = 5, FEE = (+process.env.FEE || 0.5) / 100, CARRY = (+process.env.CARRY || 0.15) / 100, BORROW = (+process.env.BORROW || 0.3) / 100, TAX = (+process.env.TAX || 0) / 100, EXPO = 0.2, FORCE = 0.5, POS = 20e6, BANK = 59e6;
const rnd = (() => { let s = 777; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; })();
function mk(bank = BANK) { const G = load({ __realMoney: true }); G.NUM.casino.grants = []; G.NUM.casino.houseLoan.fix.on = false; const h = G.casHouseFix(G.casHouseNew(), D0).house; h.bankroll = bank; G.gsAdvance(h, D0, tk(D0, 1)); return { G, h }; }
// 一個「市場」：用 scratch 錢包推價，回傳成交均價
function market(G, h, id) {
  const w = G.casWalletFix(G.casWalletNew(), D0); w.chips = 1e15; w.gs = { h: { [id]: 1e12 }, cost: { [id]: 1 }, sold: { day: null, n: 0 }, v: { day: null, n: {} }, seen: 0 }; // 假錢包：有無限股和錢，只拿來推價
  const fill = (n, day, t, op) => { let left = Math.floor(n), got = 0, tot = 0, m = left; while (left >= 1 && m >= 1) { const r = op(Math.min(m, left)); if (r.ok) { const k = Math.min(m, left); got += k; tot += r.v; left -= k; m = left; } else m = Math.floor(m / 2); } return { n: got, px: got ? tot / got : h.gs.u[id].P }; };
  return {
    buy(n, day, t) { return fill(n, day, t, m => { w.gs.seen = 1e15; const r = G.gsBuy(w, h, id, m, day, t); w.chips = 1e15; return { ok: r.ok, v: r.ok ? r.cost : 0 }; }); },
    sell(n, day, t) { return fill(n, day, t, m => { w.gs.seen = 1e15; w.gs.v = { day: null, n: {} }; const r = G.gsSell(w, h, id, m, day, t); w.chips = 1e15; w.gs.h[id] = 1e12; return { ok: r.ok, v: r.ok ? r.gross : 0 }; }); },
  };
}
function mkBook(G, h, id) {
  const M = market(G, h, id), pos = [], st = { bad: 0, liq: 0, cascade: 0, fees: 0, pnlHouse: 0, opened: 0, maxExpo: 0, maxDay: 0 };
  const equity = (p, px) => p.m + p.side * (px - p.e) * p.q;
  const expo = () => pos.reduce((a, p) => a + p.q * p.e, 0);
  return {
    pos, st,
    open(side, notional, day, t) { // 做多買、放空賣；超過莊家曝險上限不開
      if (expo() + notional > Math.max(3e6, h.bankroll * EXPO)) return null;
      const P = h.gs.u[id].P, n = Math.floor(notional / P); if (n < 1) return null;
      const r = side > 0 ? M.buy(n, day, t) : M.sell(n, day, t); if (!r.n) return null;
      const p = { side, e: r.px, q: r.n, m: r.n * r.px / LEV, day }; pos.push(p); st.opened++; const fee = r.n * r.px * (FEE + (side > 0 ? CARRY * (1 - 1 / LEV) : BORROW)); st.fees += fee; st.pnlHouse += fee; st.maxExpo = Math.max(st.maxExpo, expo()); return p;
    },
    close(p, day, t, why) {
      const r = p.side > 0 ? M.sell(p.q, day, t) : M.buy(p.q, day, t); if (!r.n) return 0; const x = r.px, q = r.n; if (q < p.q) { const part = Object.assign({}, p, { q, m: p.m * q / p.q }); p.q -= q; p.m -= part.m; const raw0 = p.side * (x - p.e) * q, eff0 = Math.max(raw0, -part.m); if (raw0 < -part.m) st.bad += -part.m - raw0; const f0 = q * x * FEE; st.fees += f0; st.pnlHouse += f0 - eff0; st.tax = (st.tax||0) + q * x * TAX; return eff0; }
      const raw = p.side * (x - p.e) * q, eff = Math.max(raw, -p.m); if (raw < -p.m) st.bad += -p.m - raw; const fee = q * x * FEE; st.fees += fee; st.pnlHouse += fee; st.pnlHouse -= eff; st.tax = (st.tax||0) + q * x * TAX; pos.splice(pos.indexOf(p), 1); if (why === "liq") st.liq++; return eff;
    },
    sweep(day, t) { // 強平：反覆檢查直到沒有（強平單自己推價，可能連鎖）
      let rounds = 0, any = true; while (any) { any = false; const P = h.gs.u[id].P; for (const p of pos.slice()) { if (equity(p, P) <= p.m * FORCE) { this.close(p, day, t, "liq"); any = true; } } if (any && pos.length === 0) any = false; if (any) { rounds++; if (rounds > 1) st.cascade++; } if (rounds > 50) break; }
    },
    flat(day, t) { for (const p of pos.slice()) this.close(p, day, t, "flat"); },
  };
}
// A：壹般人隨機多空
function scenA(b) {
  const { G, h } = mk(); const id = "g-daily", B = mkBook(G, h, id); let worst = 0, lo = 9e9, hi = 0;
  for (let d = 0; d < DAYS; d++) {
    const day = add(D0, d); if (d > 0) { h.econ = { b, yoy: 14.36 }; G.casHouseFix(h, day); } const before = B.st.pnlHouse;
    for (let k = 0; k < 75; k++) { const t = tk(day, k); G.gsAdvance(h, day, t); if (k === 3 || k === 20) for (let i = 0; i < 6; i++) B.open(rnd() < 0.5 ? 1 : -1, 1.5e6, day, t); if (k % 5 === 0) B.sweep(day, t); lo = Math.min(lo, h.gs.u[id].P); hi = Math.max(hi, h.gs.u[id].P); }
    B.flat(day, tk(day, 74)); worst = Math.min(worst, B.st.pnlHouse - before);
  }
  return { b, B: B.st, worst, lo, hi };
}
// B：壹群放空者（每人 1M，5 倍，景氣好時放空被擠），壹個攻擊者用槓桿多單拉高；看強平連鎖和攻擊者損益
function scenB(attN) {
  const { G, h } = mk(); const id = "g-daily", B = mkBook(G, h, id), A = mkBook(G, h, id); let gainA = 0, liq = 0, move = 0, days = 0;
  for (let d = 0; d < 10; d++) {
    const day = add(D0, d); if (d > 0) { h.econ = { b: 0, yoy: 14.36 }; G.casHouseFix(h, day); }
    G.gsAdvance(h, day, tk(day, 3)); const P0 = h.gs.u[id].P;
    for (let i = 0; i < 8; i++) B.open(-1, 1.4e6, day, tk(day, 3)); // 空頭 8 位 × 140 萬
    const a = A.open(1, attN, day, tk(day, 4)); if (!a) { B.flat(day, tk(day, 74)); continue; }
    B.sweep(day, tk(day, 4)); const P1 = h.gs.u[id].P; move += P1 / P0 - 1; liq += B.st.liq; // 攻擊者開倉後空頭被強平
    const q0 = a.q, e0 = a.e; gainA += A.close(a, day, tk(day, 5), "flat") - q0 * e0 * (FEE + CARRY * (1 - 1 / LEV)) - q0 * e0 * TAX; B.flat(day, tk(day, 74)); days++;
  }
  return { attN, gainA: gainA / Math.max(1, days), move: move / Math.max(1, days), liq: B.st.liq, bad: B.st.bad, houseA: A.st.pnlHouse + B.st.pnlHouse };
}
// E：各集團的深度
function scenE() {
  const { G, h } = mk(), out = []; for (const id of G.gsListed(h)) { const U = h.gs.u[id], depthV = 0.2 * U.S * U.P, cap = Math.max(3e6, BANK * EXPO); out.push({ id, cap: U.S * U.P, depthV, expo: cap, move: (Math.exp(cap / depthV) - 1) * 100 }); } return out;
}
console.log(`集團股槓桿／放空模擬 2（槓桿單推價；倍數 ${LEV}、莊家餘額 ${fmt(BANK)}、曝險上限 ${EXPO * 100}%）`);
for (const b of [-1, 0, 1]) { const r = scenA(b), s = r.B; console.log(`A 景氣 ${String(b).padStart(2)}：莊家 ${DAYS} 天 ${fmt(s.pnlHouse)}（手續費利息 ${fmt(s.fees)}）　最差壹天 ${fmt(r.worst)}　強平 ${s.liq}／${s.opened} 筆　壞帳 ${fmt(s.bad)}　連鎖 ${s.cascade}　股價 ${r.lo.toFixed(1)}～${r.hi.toFixed(1)}`); }
for (const n of [3e6, 11.8e6]) { const r = scenB(n); console.log(`B 拉高強平空頭：攻擊者多單 ${fmt(n)}　推動股價 ${(100 * r.move).toFixed(3)}%　空頭被強平 ${r.liq} 筆　壞帳 ${fmt(r.bad)}　攻擊者每天淨 ${fmt(r.gainA)}　莊家合計 ${fmt(r.houseA)}`); }
for (const e of scenE()) console.log(`E ${e.id}：市值 ${fmt(e.cap)}　推價深度 ${fmt(e.depthV)}　曝險上限 ${fmt(e.expo)} 全部壓同方向會推 ${e.move.toFixed(2)}%`);
