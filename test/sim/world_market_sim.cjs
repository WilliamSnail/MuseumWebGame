// 設計用的模擬（還沒接進遊戲）：node test/sim/world_market_sim.cjs [markets|pump|all]
// markets：各市場自己的景氣循環，接真實台股／美股（放大 β、會回平均、有上限），看真實大漲大跌日（±5%）下的樣子，和來館人數倍率的範圍。
// pump：集團股被大量買賣、拉抬的情境：價格 → 健康值 → 營收／借款 → 價格的回饋有沒有失控，館友拉抬壹輪賺賠多少。
// 全是獨立的算式，不碰 shared/；決定以後才寫進 shared/world/core.js。種子固定，同樣的輸入同樣的輸出。
const mul32 = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const gauss = r => { let u = 0, v = 0; while (!u) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mean = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length), sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
const corr = (a, b) => { const ma = mean(a), mb = mean(b); return mean(a.map((x, i) => (x - ma) * (b[i] - mb))) / (sd(a) * sd(b) || 1); };
const fmt = n => Math.round(n).toLocaleString("en-US");

// ---------- 市場（資料，之後寫成 content/world/markets.json） ----------
// anchor：接哪個真實市場（tw 台股加權、us 那斯達克、none 不接）；beta：真實漲跌 1% 讓這個市場的景氣指數動幾（放大）；kappa：每天往 0 回多少；sd：自己的雜訊；rho：跟總景氣的相關（共同因子的份量）
const MARKETS = [
  { id: "tech", name: "科技", anchor: "us", beta: 0.10, kappa: 0.06, sd: 0.05, rho: 0.4 },
  { id: "finance", name: "金融", anchor: "tw", beta: 0.07, kappa: 0.05, sd: 0.04, rho: 0.5 },
  { id: "daily", name: "日常消費", anchor: "tw", beta: 0.03, kappa: 0.08, sd: 0.03, rho: 0.5 },
  { id: "arts", name: "文化藝術", anchor: "none", beta: 0, kappa: 0.05, sd: 0.06, rho: 0.2 },
  { id: "tourism", name: "觀光", anchor: "us", beta: 0.05, kappa: 0.04, sd: 0.07, rho: 0.3 },
  { id: "school", name: "教育", anchor: "none", beta: 0, kappa: 0.1, sd: 0.02, rho: 0.2 },
  { id: "public", name: "公共", anchor: "none", beta: 0, kappa: 0.1, sd: 0.015, rho: 0.1 },
];
// 真實日報酬（%）：常態 σ 1%，加壹段「大漲大跌」：第 30 天 −5%、第 31 天 −3%、第 33 天 +4%（壓力測試），scenario 可換
function realSeries(days, seed, stress) {
  const r = mul32(seed), tw = [], us = [];
  for (let i = 0; i < days; i++) { const c = gauss(r) * 0.6; tw.push(c + gauss(r) * 0.8); us.push(c + gauss(r) * 0.9); }
  if (stress) { tw[30] = -5; us[30] = -5; tw[31] = -3; us[31] = -3; tw[33] = 4; us[33] = 4; tw[60] = 5; us[60] = 5; tw[61] = 3; us[61] = 3; }
  return { tw, us, none: new Array(days).fill(0) };
}
// 景氣指數 −1～+1：b_k(t+1) = tanh( atanh-ish )；這裡用 clamp(軟壓)：b' = (1−κ)b + β × 真實報酬% + ρ × 共同因子 + σ × 雜訊，再用 tanh 壓進 ±1
function simMarkets(days, seed, stress, amp = 1) {
  const R = realSeries(days, seed, stress), r = mul32(seed + 7), b = {}, hist = {}; MARKETS.forEach(m => { b[m.id] = 0; hist[m.id] = []; });
  const total = [], common = []; let cf = 0;
  for (let t = 0; t < days; t++) {
    cf = 0.9 * cf + gauss(r) * 0.05; common.push(cf);
    for (const m of MARKETS) {
      const real = R[m.anchor][t] * m.beta * amp;
      b[m.id] = Math.tanh((1 - m.kappa) * b[m.id] + real + m.rho * cf + m.sd * gauss(r) * 0.5);
      hist[m.id].push(b[m.id]);
    }
    total.push(mean(MARKETS.map(m => b[m.id])));
  }
  return { hist, total, R };
}
// 來館人數倍率：1 ＋ k × 市場景氣（旅客、散客用自己所屬市場的），夾在 [lo, hi]
const visitMult = (b, k = 0.35, lo = 0.6, hi = 1.4) => clamp(1 + k * b, lo, hi);
function marketsReport() {
  console.log("== 各市場景氣循環（90 天，種子 1～5，常態＋壓力測試）==");
  for (const stress of [false, true]) {
    const rows = MARKETS.map(m => ({ m, mn: 9, mx: -9, s: [], sdv: 0 })), tot = [];
    for (let seed = 1; seed <= 5; seed++) {
      const S = simMarkets(90, seed, stress); tot.push(...S.total);
      rows.forEach(x => { const h = S.hist[x.m.id]; x.mn = Math.min(x.mn, ...h); x.mx = Math.max(x.mx, ...h); x.s.push(...h); });
    }
    console.log(`\n${stress ? "壓力測試（真實 −5%、−3%、+4%、+5%、+3% 的日子）" : "一般（真實日報酬 σ ≈ 1%）"}`);
    console.log("市場　　　接　　 最低　最高　標準差　來館倍率範圍（k=0.35）");
    rows.forEach(x => console.log(`${x.m.name.padEnd(4, "　")}　${x.m.anchor.padEnd(4)}　${x.mn.toFixed(2).padStart(5)}　${x.mx.toFixed(2).padStart(4)}　${sd(x.s).toFixed(2)}　　${visitMult(x.mn).toFixed(2)}～${visitMult(x.mx).toFixed(2)}`));
    console.log(`總景氣（各市場平均）：最低 ${Math.min(...tot).toFixed(2)}、最高 ${Math.max(...tot).toFixed(2)}、標準差 ${sd(tot).toFixed(2)}`);
    const S = simMarkets(90, 1, stress); console.log(`相關：科技×金融 ${corr(S.hist.tech, S.hist.finance).toFixed(2)}、科技×文化 ${corr(S.hist.tech, S.hist.arts).toFixed(2)}、觀光×教育 ${corr(S.hist.tourism, S.hist.school).toFixed(2)}`);
  }
  // 壓力日的反應：第 30、31 天前後科技、金融的景氣
  const S = simMarkets(90, 1, true), at = i => MARKETS.slice(0, 3).map(m => `${m.name} ${S.hist[m.id][i].toFixed(2)}`).join("　");
  console.log(`\n真實 −5%（第 30 天）前後：第 29 天 ${at(29)}\n　　第 30 天 ${at(30)}\n　　第 31 天（再 −3%）${at(31)}\n　　第 40 天（回平均中）${at(40)}`);
  console.log("放大倍數（amp）對照，科技最低／最高（壓力測試，種子 1～5）：");
  for (const amp of [0.5, 1, 1.5, 2]) { let mn = 9, mx = -9; for (let s = 1; s <= 5; s++) { const h = simMarkets(90, s, true, amp).hist.tech; mn = Math.min(mn, ...h); mx = Math.max(mx, ...h); } console.log(`  amp ${amp}：${mn.toFixed(2)}～${mx.toFixed(2)}`); }
}

// ---------- 集團股被拉抬 ----------
// 集團：池子 P（億）、健康值 h；股價 = 基本價 F × 衝擊。F 照 h 和市場景氣（經濟 → 股價）；買賣推價照 0113：Pnew = P × exp(q / depth)，價差半邊 half
// 股價 → 經濟：健康值多壹項 stockW × clamp(7 天漲跌, ±chgCap)（跟現在館外股那項壹樣的規則）；h 影響下週狀態、營收（revPct）
function pump(opts) {
  const o = Object.assign({ shares: 100e6, price0: 100, depth: 2e7, half: 0.01, tax: 0.003, limitDay: 0.10, buyPerDay: 0, buyDays: 5, holdDays: 3, sellDays: 5, capHold: 0.05, capDay: 0.01, stockW: 0.5, chgCap: 0.3, fb: 1.0, days: 40, sd: 0.01 }, opts);
  const r = mul32(11); let F = o.price0, px = o.price0, inv = 0, cash = 0, own = 0, h = 1, hMax = 1, hist = [px], pxHist = [px]; // inv：造市商持倉（相對）
  const maxHold = o.capHold * o.shares, maxDay = o.capDay * o.shares;
  for (let d = 0; d < o.days; d++) {
    let q = 0; const open = px;
    if (d < o.buyDays) q = Math.min(o.buyPerDay, maxDay, maxHold - own); else if (d >= o.buyDays + o.holdDays && d < o.buyDays + o.holdDays + o.sellDays) q = -Math.min(own, Math.ceil(Math.max(own, 0) / Math.max(1, o.buyDays + o.holdDays + o.sellDays - d)), maxDay);
    q = Math.max(q, -own);
    if (q) { const lim = q > 0 ? open * (1 + o.limitDay) : open * (1 - o.limitDay); let Pn = px * Math.exp(q / o.depth); if (q > 0 ? Pn > lim : Pn < lim) { const maxq = o.depth * Math.abs(Math.log(lim / px)); q = Math.sign(q) * Math.min(Math.abs(q), maxq); Pn = lim; }
      const avg = (px + Pn) / 2, pay = q * avg * (q > 0 ? 1 + o.half : 1 - o.half); cash -= pay + (q < 0 ? -pay * o.tax : 0); own += q; inv -= q; px = Pn; }
    // 基本面：照 h（經濟 → 股價）；股價慢慢往基本價回（造市商把持倉的 rho 回補給市場）
    F = o.price0 * (1 + 0.5 * (h - 1)) * Math.exp(gauss(r) * o.sd * 0.3);
    px = px + 0.1 * (F - px) + gauss(r) * px * o.sd * 0.5; inv *= 0.9;
    pxHist.push(px);
    const chg = pxHist.length > 7 ? px / pxHist[pxHist.length - 8] - 1 : 0; // 股價 → 經濟：h 的股價項（fb 是回饋放大倍數）
    h = clamp(1 + o.fb * o.stockW * clamp(chg, -o.chgCap, o.chgCap), 0.6, 1.2); hMax = Math.max(hMax, h); hist.push(px);
  }
  cash += own * px * (1 - o.half) * (1 - o.tax); // 結算
  return { peak: Math.max(...hist) / o.price0 - 1, trough: Math.min(...hist) / o.price0 - 1, end: hist[hist.length - 1] / o.price0 - 1, pnl: cash, maxH: hMax, hist, own };
}
function pumpReport() {
  console.log("== 集團股被拉抬（股本 1 億股、起始 100、depth 2,000 萬股 ≈ 股本 20%：買 1% 股本 ≈ 推 5%，價差 1%、證交稅 0.3%、漲跌停 ±10%）==");
  console.log("情境　　　　　　　　　　　　　　每天買　峰值　　谷底　　收尾　　壹輪賺賠（元）");
  const rows = [["沒有人買賣（基準）", 0, {}], ["小額（每天 20 萬股）", 2e5, {}], ["大量（每天 100 萬股＝上限 1%）", 1e6, {}], ["大量＋放寬持股上限 20%", 1e6, { capHold: 0.2, capDay: 0.05 }], ["超大量（每天 500 萬股，放寬上限）", 5e6, { capHold: 0.3, capDay: 0.05, buyDays: 6 }], ["大量＋回饋放大 3 倍（壞設計）", 1e6, { fb: 3 }]];
  for (const [name, q, ex] of rows) { const x = pump(Object.assign({ buyPerDay: q }, ex)); console.log(`${name.padEnd(22, "　")}　${fmt(q).padStart(9)}　${(100 * x.peak).toFixed(1).padStart(5)}%　${(100 * x.trough).toFixed(1).padStart(5)}%　${(100 * x.end).toFixed(1).padStart(5)}%　${fmt(x.pnl).padStart(14)}`); }
  console.log("（賺賠：買入花的錢、賣出收的錢、扣價差和證交稅；負＝館友賠，正＝館友賺。造市商是對手方，帳走莊家。）");
  const x = pump({ buyPerDay: 1e6 }), y = pump({ buyPerDay: 5e6, capHold: 0.3, capDay: 0.05, buyDays: 6 });
  console.log(`健康值最高（股價項）：大量 ${x.maxH.toFixed(3)}、超大量 ${y.maxH.toFixed(3)}（上限 1.2；現行 stockW 0.5 × chgCap 0.3 ＝ +0.15）`);
  console.log("無風險套利檢查：同價買了馬上賣，賠 2 × 半價差 ＋ 證交稅 ＝ " + (100 * (2 * 0.01 + 0.003)).toFixed(1) + "%（扣不掉的成本）");
}
const which = process.argv[2] || "all";
if (which === "markets" || which === "all") marketsReport();
if (which === "pump" || which === "all") { console.log(""); pumpReport(); }
