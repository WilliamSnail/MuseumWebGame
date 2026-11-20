// 世界集團股票的模擬（決定 0121）：node test/sim/gstock_sim.cjs [--days 90] [--amp 1.5]
// 用真的程式（casHouseFix 換日、wmTick 市場景氣、whTick 健康值、gsAdvance 股價和每週的公司事件、gsBuy／gsSell），每天每 15 分鐘推壹格。
// 情境：景氣 −1／0／+1（每個市場固定）× 沒人買賣／壹位館友大量炒作（每天買到上限、5 天買、3 天放、5 天賣）／10 位館友同時炒。
// 印：股價範圍、指數範圍、增資／庫藏股／配股／分割幾次、莊家最低錢和最大庫存、館友賺賠、健康值最高、守恆差（單位加公共 ＝ 已知世界；全館總和對帳）。壹項不對就 exit 1。
const L = require("../../tools/content/world_lib.cjs"), { load } = require("../load_shared.cjs");
const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const days = +opt("--days") || 90, amp = opt("--amp") != null ? +opt("--amp") : null;
const add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10), fmt = n => Math.round(n).toLocaleString("en-US");
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
function run(b, players) {
  const G = load({ __realMoney: true }); G.NUM.casino.grants = []; G.NUM.casino.houseLoan.fix.on = false; if (amp != null) G.NUM.casino.worldDoc.market.amp = amp;
  const list = L.readNpcs().filter(n => n.kind !== "trace"), start = "2026-11-16";
  const h = G.casHouseFix(G.casHouseNew(), start).house; h.econ = { b, yoy: 14.36 }; h.bankroll = 2e9;
  const ws = []; for (let i = 0; i < players; i++) { const w = G.casWalletFix(G.casWalletNew(), start); w.chips = 5e9; ws.push(w); }
  const S0 = G.casBookSnap(ws, h, 0, start), g0 = G.casBookTotal(S0) - G.casBookMinted(S0) + G.casBookBurned(S0), ev = { raise: 0, buyback: 0, bonus: 0, split: 0, div: 0 }, rng = { px: {}, idx: [9e9, -9e9], hMax: 0, bankMin: 9e18, invMax: 0 };
  G.whTick(h, start, {}); let seenEv = 0; const target = "g-daily";
  for (let d = 0; d < days; d++) {
    const day = add(start, d); if (d > 0) { h.econ = { b, yoy: 14.36 }; G.casHouseFix(h, day); }
    for (const k of Object.keys(h.mk.b)) h.mk.b[k] = b * 0.6; G.wmWriteVisit(h, day, list); G.casNpcSpend(h, day, "g" + d, list, G.npcCounters(h.npcc));
    for (let k = 0; k < 75; k++) {
      const t = Date.parse(day + "T05:00:00+08:00") + k * 900000 + 1000; G.gsAdvance(h, day, t);
      if (players > 0 && k === 4) for (const w of ws) { // 炒作：d 0～4 每天買到上限；d 8～12 賣
        const U = h.gs.u[target]; if (!U) continue;
        if (d < 5) { let n = Math.floor(U.S * G.NUM.casino.gstock.dayVolPct / 100 / players); while (n >= 1 && !G.gsBuy(w, h, target, n, day, t).ok) n = Math.floor(n / 2); } else if (d >= 8 && d < 13) G.gsSell(w, h, target, Math.ceil((w.gs && w.gs.h[target] || 0) / (13 - d)), day, t);
      }
    }
    for (const w of ws) G.gsSync(w, h);
    for (const e of h.gs.ev) if (e.no > seenEv) { ev[e.kind] = (ev[e.kind] || 0) + 1; seenEv = Math.max(seenEv, e.no); }
    for (const id of Object.keys(h.gs.u)) { const P = h.gs.u[id].P; const r = rng.px[id] || (rng.px[id] = [9e9, -9e9]); r[0] = Math.min(r[0], P); r[1] = Math.max(r[1], P); rng.invMax = Math.max(rng.invMax, Math.abs(h.gs.u[id].i) / h.gs.u[id].S); }
    const ix = G.gsIndex(h); rng.idx = [Math.min(rng.idx[0], ix), Math.max(rng.idx[1], ix)]; rng.bankMin = Math.min(rng.bankMin, h.bankroll); for (const id of Object.keys(h.wh.h)) rng.hMax = Math.max(rng.hMax, h.wh.h[id]);
  }
  const hold = ws.reduce((a, w) => a + Object.entries((w.gs && w.gs.h) || {}).reduce((x, [id, n]) => x + n * h.gs.u[id].P, 0), 0), chips = ws.reduce((a, w) => a + w.chips, 0);
  const gap = sum(G.wuAmounts(h)) - h.world, S1 = G.casBookSnap(ws, h, 0, add(start, days)), bookGap = G.casBookTotal(S1) - G.casBookMinted(S1) + G.casBookBurned(S1) - g0;
  return { b, players, ev, rng, pnl: chips + hold - 5e9 * players, gap, bookGap, world: h.world, states: Object.values(h.wh.st).map(s => s.s[0]).join(""), g: h.gs };
}
let bad = 0;
console.log(`集團股票模擬：${days} 天，市場放大倍數 ${amp != null ? amp : "（設定值）"}`);
for (const players of [0, 1, 10]) for (const b of [-1, 0, 1]) {
  const r = run(b, players), px = r.rng.px["g-daily"], all = Object.values(r.rng.px), problems = [];
  if (r.gap !== 0) problems.push("單位加公共 ≠ 池子 " + r.gap); if (r.rng.bankMin < 0) problems.push("莊家破產"); if (r.rng.hMax > 1.2 + 1e-9) problems.push("健康值超過上限"); if (all.some(p => p[0] < 1)) problems.push("股價跌到 1");
  if (Math.abs(r.bookGap) > 1) problems.push("全館帳對不上 " + r.bookGap);
  console.log(`景氣 ${String(b).padStart(2)}　炒作 ${String(players).padStart(2)} 位　民生股 ${px[0].toFixed(0)}～${px[1].toFixed(0)}　指數 ${r.rng.idx[0].toFixed(0)}～${r.rng.idx[1].toFixed(0)}　事件 增資${r.ev.raise} 庫藏${r.ev.buyback} 配股${r.ev.bonus} 分割${r.ev.split} 股息${r.ev.div}　莊家最低 ${fmt(r.rng.bankMin)}　庫存最大 ${(100 * r.rng.invMax).toFixed(1)}%　健康值最高 ${r.rng.hMax.toFixed(2)}　館友賺賠 ${fmt(r.pnl)}　狀態 ${r.states}${problems.length ? "　✗ " + problems.join("；") : ""}`);
  if (problems.length) bad++;
}
if (bad) { console.log(`✗ ${bad} 組有問題`); process.exit(1); }
console.log("✓ 全部情境守恆、沒破產、健康值沒超過上限、股價沒崩");
