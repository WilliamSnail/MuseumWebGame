// 館內五家店股票的「活動量跳空」會不會被預測／操縱（11-14，數值平衡；規劃 2.8b、2.8g 節）
// node test/sim_stock_inhouse.cjs
// 05:00 的跳空 m ＝ K ×（昨天這家店不同的人數 a ÷ 前 7 個有效日平均 − 1）＋ 景氣漂移 ＋ 隨機 ±1%（夾 ±5%）。
// 問題：(1) 停盤晚一點（22:00 → 23:30），知道的活動量變多，預測變準多少？(2) 自己去做一次那家店的事就多算 1 個人，能不能靠這個賺？
let s = 20261114; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const bin = (n, p) => { let k = 0; for (let i = 0; i < n; i++) if (rnd() < p) k++; return k; };
const pct = x => (x * 100).toFixed(2) + "%";
const FEE = 0.01, MINP = 5, DAYS = 20000;
// 一天的活動分佈（占一天不同的人的比例）：05～22 點 80%、22～23:30 12%、23:30～05 點 8%（猜的；夜貓子玩家多）
const SHARE = { t22: 0.80, t2330: 0.92 };
function run(N, q, K, T) {
  // 每個人當天去這家店的機率 q；a ~ Binomial(N, q)。看盤的人在停盤 T 時知道 a_T（已經發生的），剩下的用期望值補
  const hist = []; let gainPred = 0, gainSelf = 0, n = 0, selfN = 0;
  for (let d = 0; d < DAYS; d++) {
    const a = bin(N, q), seen = Math.round(a * SHARE[T]); // 簡化：已經看到的比例
    if (hist.length >= 3) {
      const avg = hist.slice(-7).reduce((x, y) => x + y, 0) / Math.min(7, hist.length);
      if (a >= MINP) {
        const m = K * (a / avg - 1) + (rnd() - 0.5) * 0.02; const mm = Math.max(-0.05, Math.min(0.05, m));
        const est = K * ((seen + (N * q) * (1 - SHARE[T])) / avg - 1);       // 預測的跳空
        if (Math.abs(est) > FEE) { gainPred += (est > 0 ? mm : -mm) - FEE; }
        n++;
        // 自己操縱：如果自己本來沒去，去一次 +1 人 → 預期跳空多 K/avg；做多
        const aSelf = a + 1, m2 = K * (aSelf / avg - 1) + (rnd() - 0.5) * 0.02;
        gainSelf += Math.max(-0.05, Math.min(0.05, m2)) - FEE; selfN++;
      }
    }
    if (a >= MINP) hist.push(a);
  }
  return { pred: gainPred / Math.max(1, n), self: gainSelf / Math.max(1, selfN) };
}
console.log("每天這家店的人數 a ~ Binomial(N, q)；K＝活動比的倍率；手續費來回 1%。表格：看盤的人每天平均賺（只在預測跳空 > 1% 時進場）／自己去做一次再買進的平均賺（做多、現股）");
console.log("N   q    K      停盤22:00 預測   停盤23:30 預測   自己操縱 +1 人");
for (const [N, q] of [[5, 0.6], [10, 0.5], [20, 0.5]]) for (const K of [0.1, 0.05, 0.03, 0.02]) {
  const a = run(N, q, K, "t22"), b = run(N, q, K, "t2330");
  console.log(String(N).padStart(2), q, String(K).padEnd(5), pct(a.pred).padStart(9), "          ", pct(b.pred).padStart(9), "          ", pct(a.self).padStart(8));
}
