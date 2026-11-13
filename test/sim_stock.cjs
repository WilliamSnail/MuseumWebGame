// 股票數值模擬（11-13，數值平衡；規劃 2.8 節）。莊家當對手盤、價格變動不搬錢。
// node test/sim_stock.cjs [館內漂移的天數，預設 20000]
// 量四件事：1 館內「活動量→漲跌」的長期漂移（要略負）；2 館外用真實 daily.json 的買了抱著、含手續費的一個月結果；
//          3 借錢買（2 倍）的期望和壞帳；4 莊家最大曝險（大家同一天全押同一支、碰到最大漲幅）。
const fs = require("fs"), path = require("path");
const DAYS = +process.argv[2] || 20000;
let s = 12345; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const pois = l => { let L = Math.exp(-l), k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; };
const FEE = 0.005;
// ---- 1 館內
const K = +process.env.K || 0.1, CAP = 0.05, MINP = 5, NOISE = 0.01;
function inhouse(N, B) {
  let hist = [], sumLog = 0, n = 0;
  for (let d = 0; d < DAYS; d++) {
    const dow = d % 7, mul = dow >= 5 ? 1.3 : 0.9;           // 週末多一點
    const a = pois(N * 0.7 * mul * 1.5);                      // 當天不同的人
    if (a >= MINP) { // 不到 5 人：不調價，也不算進平均
      if (hist.length >= 3) {
        const avg = hist.slice(-7).reduce((x, y) => x + y, 0) / Math.min(7, hist.length);
        let m = K * (a / avg - 1) + 0.003 * B + (rnd() - 0.5) * 2 * NOISE;
        m = Math.max(-CAP, Math.min(CAP, m)); sumLog += Math.log(1 + m); n++;
      }
      hist.push(a);
    } else n++;
  }
  return sumLog / n;
}
console.log(`== 1 館內五家店：K=${K}（活動比 a/平均−1 的倍率）、上限 ±${CAP * 100}%、少於 ${MINP} 人不調`);
for (const N of [5, 10, 20, 40]) console.log(`人數 ${String(N).padStart(2)}：每天平均對數漲跌 B=0 ${(inhouse(N, 0) * 100).toFixed(3)}%　B=+1 ${(inhouse(N, 1) * 100).toFixed(3)}%　B=−1 ${(inhouse(N, -1) * 100).toFixed(3)}%`);
// ---- 2 館外（真實資料）
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "content/stocks/daily.json"), "utf8")).days;
const ks = Object.keys(D).sort(), ids = Object.keys(D[ks[0]]);
const mv = (id, i) => { const v = D[ks[i]] && D[ks[i]][id]; return typeof v === "number" ? Math.max(-0.1, Math.min(0.1, v / 100)) : 0; };
console.log(`\n== 2 館外（真實 ${ks.length} 個市場日 ${ks[0]}～${ks.at(-1)}）：買進抱到最後賣掉，買賣各 ${FEE * 100}%`);
console.log("標的           平均日漲跌   抱 20 天淨報酬（含手續費）");
for (const id of ids) {
  let g = 1; for (let i = 0; i < ks.length; i++) g *= 1 + mv(id, i);
  const avg = (g ** (1 / ks.length) - 1);
  console.log(id.padEnd(14), (avg * 100).toFixed(3).padStart(7) + "%   ", ((g * (1 - FEE) / (1 + FEE) - 1) * 100).toFixed(1) + "%（全期）");
}
// 長期：真實股市的平均（假設值）下，抱 30 天要多少日漂移才打平手續費
console.log(`日漂移要超過 ${(((1 + FEE) / (1 - FEE)) ** (1 / 30) - 1) * 100 > 0 ? ((((1 + FEE) / (1 - FEE)) ** (1 / 30) - 1) * 100).toFixed(3) : 0}% 才能抱 30 天打平；抱 90 天要 ${((((1 + FEE) / (1 - FEE)) ** (1 / 90) - 1) * 100).toFixed(3)}%`);
// ---- 3 借錢買
const LRATE = +process.env.LRATE || 0.005, MAINT = 1.3, BACK = 1.5;
console.log(`\n== 3 借錢買：成數 loan ≤ 自有淨值（2 倍），日息 ${LRATE * 100}%，維持率 ${MAINT * 100}%（強制賣到 ${BACK * 100}%）`);
for (const [mu, sd, name] of [[0.0006, 0.02, "一般股 漂移 0.06%／天 波動 2%"], [0.0015, 0.035, "強勢股 漂移 0.15%／天 波動 3.5%"], [0, 0.02, "零漂移"]]) {
  let tot = 0, cnt = 0, bad = 0, badAmt = 0, liq = 0;
  for (let t = 0; t < 20000; t++) {
    let eq = 1, val = 2, loan = 1;                              // 淨值 1 借 1 買 2
    val *= 1 - FEE; // 買進手續費
    for (let d = 0; d < 30; d++) {
      const z = Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
      const r = Math.max(-0.1, Math.min(0.1, mu + sd * z));
      val *= 1 + r; loan *= 1 + LRATE;
      if (val < loan) { bad++; badAmt += loan - val; break; }
      if (val / loan < MAINT) { liq++; const sell = (BACK * loan - val) / (BACK - 1); val -= sell; loan -= sell; }
    }
    const end = val * (1 - FEE) - loan; tot += end; cnt++;
    if (end < 0) { bad += 0; }
  }
  console.log(`${name}：30 天平均淨值 ${(tot / cnt).toFixed(3)}（起始 1）；被強制賣出 ${(liq / 200).toFixed(1)}%；壞帳筆數 ${bad}，金額 ${(badAmt / 20000).toFixed(4)}（每人平均）`);
}
// ---- 4 莊家曝險
console.log("\n== 4 莊家最大曝險（所有玩家押同一支館外股）");
const hist = []; for (const id of ids) { for (let w = 0; w + 5 <= ks.length; w++) { let g = 1; for (let i = w; i < w + 5; i++) g *= 1 + mv(id, i); hist.push([id, g - 1]); } }
hist.sort((a, b) => b[1] - a[1]); console.log("真實資料 5 個市場日最大漲幅", hist[0][0], (hist[0][1] * 100).toFixed(1) + "%；一天上限 +10% 連 3 天 +33%、5 天 +61%");
console.log("全館持股市值 H：莊家要付的最大帳面 = H × 漲幅。H 上限 = 莊家錢 × capPct，所以一週最壞 = capPct × 61%。");
