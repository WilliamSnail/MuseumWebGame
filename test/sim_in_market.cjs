// 館內股改成真的市場（評估用模擬，決定前的草稿）：node test/sim_in_market.cjs [天數] [種子數]
// 模型：每家店發行 Ns 股；莊家當造市商（接所有買賣，價格照淨買賣力道動：ΔlnP ＝ 淨買股數 ÷ depth）；
//   旅客、散客照「這家店的人數」進場，每位以機率 p 下單，有三種個性：基本面（合理價 ＝ 營收／人數 × 倍數，便宜買貴賣）、追漲殺跌、雜訊；
//   館友的策略另外跑（長抱、追漲、價值、拉高出貨），算扣掉手續費 0.5%×2 和證交稅 0.3% 之後的報酬。
// 這支只量「機制會不會合理」，不碰 shared/（沒有改程式）。參數都在最上面。
const { hashStr, mulberry32 } = (() => { const G = require("./load_shared.cjs").load(); return G; })();
const DAYS = +process.argv[2] || 30, SEEDS = +process.argv[3] || 40;
const P = {
  Ns: 100000,        // 每家發行股數（市值 ＝ Ns × 價 ＝ 10 億）
  depth: +process.env.DEPTH || 50000, // 淨買 depth 股 ＝ 價格漲 e 倍（1,000 股 ≈ 2%）
  visitors: 90,      // 每家店平均每天來的人（旅客＋散客＋館友；現在每家散客 72、NPC 約 12、館友幾位）
  weights: [1, 1, 1, 1, 1, 2, 2, 3, 5, 5, 5, 5, 4, 4, 6, 6, 6, 3, 1, 1, 0.5, 0.5, 0.5, 0.5], // 從 05:00 起每小時的比重（config crowd.weights）
  weekend: 1.5, dayNoise: 0.25, burstP: 0.003 * 3, burst: 0.75, // 週末 ×1.5、每天人數 ±25%、突發大事件
  pTrade: +process.env.PTRADE || 0.25, size: +process.env.SIZE || 8, sizeCap: 40, mix: (() => { const f = process.env.MIXF ? +process.env.MIXF : 0.6, c = process.env.MIXC ? +process.env.MIXC : 0.25; return { fund: f, chase: c, noise: Math.max(0, 1 - f - c) }; })(), // 下單機率、平均股數、三種個性
  beta: +process.env.BETA || 0.6, fvBand: 0.03, fvWin: 7, floatCap: 0.4, // 合理價對人數的彈性、基本面的容忍帶、旅客散客合計最多持有的比例
  fee: 0.005, tax: 0.003, ticks: 75, mode: process.env.MODE || "skew", band: +process.env.BAND || 0.03, tickLim: +process.env.TICKLIM || 0.03, dayLim: +process.env.DAYLIM || 0.1, // mode：skew ＝ 選項 A（合理價錨點）；flow ＝ 選項 B（價格只由買賣推，合理價只是旅客心裡的參考）；band：基本面旅客心裡「偏離多少就一面倒」；tickLim／dayLim：每個價、每天最多動多少
  skew: +process.env.SKEW || 0.015, walkSd: +process.env.WALK || 0.0003, half: +process.env.HALF || 0.002, rho: +process.env.RHO || 0.02, // skew：造市商持倉造成的報價偏移最多 ±skew（價格壓力有上限，所以拉高出貨賺不到、知道合理價的人也套不到）；walkSd：價格自己的隨機游走（每 15 分鐘）；half：造市商的半個價差；rho：造市商每個價（15 分鐘）把持倉的 rho 賣回已知世界（價格壓力的回復）
};
const gauss = r => { const u = Math.max(1e-12, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const pois = (r, l) => { if (l > 30) return Math.max(0, Math.round(l + Math.sqrt(l) * gauss(r))); let L = Math.exp(-l), k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; };
function run(seed, strat) {
  const r = mulberry32(hashStr("m" + seed)), st = [];
  for (let s = 0; s < 5; s++) st.push({ P: 10000, hist: [], vis: Array(P.fvWin).fill(P.visitors * 1.07), flowPos: 0, mmInv: 0, walk: 0, wCash: 0, vol: 0, cashMM: 0, pnl: 0 });
  const wsum = P.weights.reduce((a, b) => a + b, 0), perTickW = []; for (let t = 0; t < P.ticks; t++) perTickW.push(P.weights[Math.min(23, Math.floor(t * 15 / 60))] / 4);
  const wtot = perTickW.reduce((a, b) => a + b, 0);
  const lnVisRef = Math.log(P.visitors);
  const out = { daily: [], vs: [], pf: [], fvgap: [], vol: 0, mm: [], strat: 0, own: 0 };
  let me = { sh: 0, cash: 0, entry: 0 }; const S0 = st[0];
  for (let d = 0; d < DAYS; d++) {
    const wk = d % 7 >= 5 ? P.weekend : 1;
    for (const x of st) {
      const burst = r() < P.burstP ? 1 + P.burst : 1;
      x.vToday = Math.max(5, P.visitors * wk * burst * Math.exp(P.dayNoise * gauss(r)));
      const base = x.vis.slice(-P.fvWin); x.vis.push(x.vToday); x.fvDay = // 合理價只看「昨天以前」已經結束的日子（今天的人數還沒數完，不能偷看）
         10000 * Math.pow((base.reduce((a, b) => a + b, 0) / base.length) / (P.visitors * 1.07), P.beta);
      x.open = x.P; x.soFar = 0; x.expSoFar = 0;
    }
    // 館友策略：開盤時的動作
    const px0 = S0.P;
    for (let t = 0; t < P.ticks; t++) {
      for (const x of st) {
        const n = pois(r, x.vToday * perTickW[t] / wtot * P.pTrade);
        x.soFar += x.vToday * perTickW[t] / wtot; x.expSoFar += P.visitors * (x === S0 && false ? 1 : 1) * wk * perTickW[t] / wtot;
        const pace = x.soFar / Math.max(1e-9, x.expSoFar), fv = x.fvDay * (1 + (x.expSoFar > 0.2 * P.visitors * wk ? Math.max(-0.02, Math.min(0.02, 0.15 * (pace - 1))) : 0)); // 今天到現在的人數比平常快或慢，合理價小幅調整（±2%）
        const priceOf = () => fv * Math.exp(x.walk) * Math.exp(Math.max(-P.skew, Math.min(P.skew, -x.mmInv / P.depth)));
        if (P.mode === "flow") { if (t === 0) x.open = x.P; } else { if (t === 0) x.open = priceOf(); x.P = Math.max(x.open * 0.9, Math.min(x.open * 1.1, priceOf())); } // 這個價開始時，價格已經照新的合理價報好（館友看到的就是這個價，沒有「還沒反映」的空檔）
        const ret = x.hist.length > 8 ? Math.log(x.P / x.hist[x.hist.length - 8]) : 0;
        let q = 0;
        for (let i = 0; i < n; i++) {
          const u = r(); const sz = Math.min(P.sizeCap, Math.max(1, Math.round(P.size * Math.exp(0.6 * gauss(r) - 0.18))));
          let dir;
          if (u < P.mix.fund) { const gap = Math.log(x.P / fv); if (P.mode === "flow") { const pb = 0.5 - Math.max(-0.5, Math.min(0.5, gap / (2 * P.band))); dir = r() < pb ? 1 : -1; } else { dir = gap < -P.fvBand ? 1 : gap > P.fvBand ? -1 : (r() < 0.5 ? 1 : -1) * (Math.abs(gap) / P.fvBand < r() ? 0.0 : 1); if (dir === 0) continue; } }
          else if (u < P.mix.fund + P.mix.chase) dir = ret > 0.002 ? 1 : ret < -0.002 ? -1 : (r() < 0.5 ? 1 : -1);
          else dir = r() < 0.5 ? 1 : -1;
          if (dir > 0 && x.flowPos > P.floatCap * P.Ns) continue; if (dir < 0 && x.flowPos < -P.floatCap * P.Ns * 0.2) continue; // 旅客散客合計不能無限買、賣空
          q += dir * sz; x.flowPos += dir * sz; x.vol += sz * x.P;
        }
        // 館友策略（只動第 0 家店，對照用）
        if (x === S0 && strat) { // 館友：策略給目標持股，每個價最多成交到「價格漲跌停內」的量（單筆不能一口氣把價推過去）
          const tg = strat(d, t, x, me, fv, r);
          if (tg != null) { const cap = P.mode === "flow" ? P.depth * Math.log(1 + P.tickLim) * (strat.gang || 1) : Infinity, fill = Math.max(-cap, Math.min(cap, tg - me.sh)); if (fill) { me.cash -= cost(fill, x.P) * (1 / (strat.gang || 1)); me.sh += fill; q += fill; } }
        }
        // 價格 ＝ 合理價錨點 × exp(−造市商持倉 ÷ depth)：買的人多，造市商賣出變空頭，報價往上；造市商每個價把持倉的 rho 回補（賣回／買自已知世界），價格慢慢回到錨點
        x.walk = 0.995 * x.walk + P.walkSd * gauss(r);
        x.mmInv -= q;
        const pFlow = Math.max(x.P * (1 - P.tickLim), Math.min(x.P * (1 + P.tickLim), x.P * Math.exp(q / P.depth + P.walkSd * gauss(r))));
        const pRaw = P.mode === "flow" ? pFlow : fv * Math.exp(x.walk) * Math.exp(Math.max(-P.skew, Math.min(P.skew, -x.mmInv / P.depth))), pNew = Math.max(x.open * (1 - P.dayLim), Math.min(x.open * (1 + P.dayLim), pRaw)); // 漲跌停 ±10%（跟開盤價比）
        x.cashMM += q * (pNew + x.P) / 2 * (q > 0 ? 1 + P.half : 1 - P.half); // 莊家逆向接，賺半個價差
        const dec = x.mmInv * P.rho; x.mmInv -= dec; x.cashMM += dec * pNew; x.wCash += dec * pNew; // 把持倉回補給已知世界
        x.P = pNew; x.hist.push(x.P); x.fpMax = Math.max(x.fpMax || 0, Math.abs(x.flowPos)); x.invMax = Math.max(x.invMax || 0, Math.abs(x.mmInv)); out.vol += Math.abs(q) * x.P;
      }
    }
    for (const x of st) { x.dayClose = x.P; }
    out.daily.push(Math.log(S0.P / px0)); out.vs.push(Math.log(S0.vToday / P.visitors)); out.fvgap.push(Math.log(S0.P / S0.fvDay)); out.closes = (out.closes || []).concat(S0.P);
    if (strat && strat.endDay) strat.endDay(d, S0, me, r);
  }
  for (const x of st) out.mm.push(x.cashMM + x.mmInv * x.P);
  out.fpMax = Math.max(...st.map(x => x.fpMax || 0)); out.invMax = Math.max(...st.map(x => x.invMax || 0)); out.mmInv = st.map(x => x.mmInv); out.world = st.map(x => x.wCash);
  if (strat && me.sh) { me.cash -= cost(-me.sh, S0.P) * (1 / (strat.gang || 1)); me.sh = 0; }
  out.end = S0.P; out.gmax = Math.max(...out.fvgap.map(Math.abs)); out.rng = Math.max(...out.closes) / Math.min(...out.closes); out.me = me; out.maxMove = Math.max(...out.daily.map(Math.abs));
  return out;
}
const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1), sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
const corr = (a, b) => { const ma = mean(a), mb = mean(b); return mean(a.map((x, i) => (x - ma) * (b[i] - mb))) / (sd(a) * sd(b) || 1); };
// 策略：回傳這一刻要買（正）賣（負）幾股；me 記持股、花費
const cost = (q, p) => (q > 0 ? q * p * (1 + P.fee + P.half) : q * p * (1 - P.fee - P.tax - P.half)); // 館友買賣付手續費、證交稅，還有造市商的半個價差
const strats = {
  "長抱（第 2 天起持有 500 股，到最後賣）": (d, t) => (d >= 1 ? 500 : null),
  "追漲殺跌（3 天漲 2% 就持 600、跌 2% 就清掉）": (() => { let last = []; return (d, t, x, me) => { if (t !== 0) return null; last.push(x.P); if (last.length < 4) return null; const a = last[last.length - 4], b = x.P; return b > a * 1.02 ? 600 : b < a * 0.98 ? 0 : null; }; })(),
  "價值（價格低於合理價 2% 持 300、高於 2% 清掉）": (d, t, x, me, fv) => (x.P < fv * 0.98 ? 300 : x.P > fv * 1.02 ? 0 : null),
  "拉高出貨（每週一開盤起買到 1,000 股推價，3 天後賣光）": (d, t) => (d % 7 === 0 ? 1000 : d % 7 === 3 && t === 0 ? 0 : null),
  "10 人聯手拉高出貨（每人 1,000 股，3 天後賣光；報告的是每人）": Object.assign((d, t) => (d % 7 === 0 ? 10000 : d % 7 === 3 && t === 0 ? 0 : null), { gang: 10 }),
};
const rows = [], base = [];
for (let s = 0; s < SEEDS; s++) base.push(run(s, null));
const dsd = mean(base.map(o => sd(o.daily))), cr = mean(base.map(o => corr(o.daily, o.vs))), gap = mean(base.map(o => mean(o.fvgap.map(Math.abs)))), mx = mean(base.map(o => o.maxMove));
console.log(`模型：Ns ${P.Ns} 股（市值 ${(P.Ns * 10000 / 1e8).toFixed(0)} 億）、depth ${P.depth}、每店每天 ${P.visitors} 人、下單機率 ${P.pTrade}、個性 基本面 ${P.mix.fund}／追漲 ${P.mix.chase}／雜訊 ${P.mix.noise}`);
console.log(`價格（${DAYS} 天 × ${SEEDS} 組）：日報酬標準差 ${(dsd * 100).toFixed(2)}%；最大單日 ${(mx * 100).toFixed(1)}%；日報酬跟「當天人數比」的相關 ${cr.toFixed(2)}；平均偏離合理價 ${(gap * 100).toFixed(1)}%；終值平均 ${mean(base.map(o => o.end)).toFixed(0)}（起始 10000）`);
console.log(`B 版指標：離合理價最遠 ${(mean(base.map(o => o.gmax)) * 100).toFixed(1)}%（最差一組 ${(Math.max(...base.map(o => o.gmax)) * 100).toFixed(0)}%）；30 天最高最低比 ${mean(base.map(o => o.rng)).toFixed(2)}（最差 ${Math.max(...base.map(o => o.rng)).toFixed(2)}）`);
console.log(`旅客散客合計持股最大 ${mean(base.map(o => o.fpMax)).toFixed(0)} 股（占發行 ${(mean(base.map(o => o.fpMax)) / P.Ns * 100).toFixed(1)}%）；造市商持倉最大 ${mean(base.map(o => o.invMax)).toFixed(0)} 股`);
console.log(`成交量：旅客散客每天每家約 ${(mean(base.map(o => o.vol)) / DAYS / 5 / 1e4).toFixed(0)} 萬籌碼；莊家（造市商）${DAYS} 天盈虧：平均 ${(mean(base.map(o => mean(o.mm))) / 1e4).toFixed(1)} 萬／家、標準差 ${(sd(base.map(o => mean(o.mm))) / 1e4).toFixed(1)} 萬`);
for (const [name, f] of Object.entries(strats)) {
  const res = [];
  for (let s = 0; s < SEEDS; s++) { const o = run(s, f); const me = o.me; res.push(me.cash); }
  const cap = 500 * 10000;
  console.log(`館友「${name}」：${DAYS} 天淨賺 平均 ${(mean(res) / 1e4).toFixed(1)} 萬、標準差 ${(sd(res) / 1e4).toFixed(1)} 萬、賠錢的比例 ${(res.filter(x => x < 0).length / res.length * 100).toFixed(0)}%`);
}
