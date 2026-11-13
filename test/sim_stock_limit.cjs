// 股票限價單、停損單的模擬（11-14，數值平衡；規劃 2.8c 節）
// node test/sim_stock_limit.cjs
// 盤中價格同 sim_stock_day.cjs（15 分鐘一個價、隨機漫步、夾開盤 ±5%）。每個價出來檢查一次；成交價＝觸發的那個價（不是限價）。
// 三個問題：1 掛單策略會不會比市價單好（要一樣，只差成本）；2 停損對期望值的影響（不改變期望值、只改變分布）；
//          3 隔夜掛單吃跳空（館外真實分布）會不會佔便宜。
let s = 1114; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const nrm = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const SD = 0.02, TICKS = 68, CLAP = 0.05, FEE = 0.005, step = SD / Math.sqrt(TICKS), N = 40000;
function path() { const a = [1]; for (let i = 1; i <= TICKS; i++) a.push(Math.max(1 - CLAP, Math.min(1 + CLAP, a[i - 1] * (1 + step * nrm())))); return a; }
const pct = x => (x * 100).toFixed(2) + "%";
// 1 限價買 -X% 然後限價賣 +Y%（現股，不借錢），沒成交就收盤市價出（有買到才算）
console.log("[1] 現股：限價買在開盤價 −X%，成交後掛限價賣 +Y%，收盤前沒賣掉就市價賣（只算有買到的）");
console.log("X     Y     成交率   每筆平均報酬（含來回手續費 1%）   對照：開盤直接市價買、收盤賣");
for (const [X, Y] of [[0.01, 0.01], [0.02, 0.02], [0.03, 0.03], [0.01, 0.03]]) {
  let n = 0, sum = 0, base = 0, filled = 0;
  for (let t = 0; t < N; t++) { const a = path(); n++; base += a[TICKS] / a[0] * (1 - FEE) / (1 + FEE) - 1;
    let k = 1; while (k <= TICKS && a[k] > 1 - X) k++; if (k > TICKS) continue; filled++;
    const buy = a[k]; let j = k + 1; while (j <= TICKS && a[j] < buy * (1 + Y)) j++; const sell = j <= TICKS ? a[j] : a[TICKS];
    sum += sell / buy * (1 - FEE) / (1 + FEE) - 1; }
  console.log(`${pct(X)}  ${pct(Y)}  ${pct(filled / N).padStart(6)}   ${pct(sum / filled).padStart(8)}                          ${pct(base / n)}`);
}
// 2 停損：5× 做多，隨機進場，停損 −Z%（部位），或不設
console.log("\n[2] 5× 做多，隨機進場，抱到收盤；有沒有停損（部位跌 Z% 就在下一個價賣）");
for (const Z of [null, 0.01, 0.02, 0.03]) {
  let sum = 0, sq = 0, worst = 0, hit = 0;
  for (let t = 0; t < N; t++) { const a = path(); const i = Math.floor(rnd() * (TICKS - 10)); let j = TICKS;
    if (Z) for (let k = i + 1; k <= TICKS; k++) if (a[k] / a[i] - 1 <= -Z) { j = k; hit++; break; }
    const r = 5 * (a[j] / a[i] - 1) - 5 * FEE * 2 - 4 * 0.0015; sum += r; sq += r * r; worst = Math.min(worst, r); }
  console.log(`停損 ${Z ? pct(Z) : "無"}：平均 ${pct(sum / N)}，標準差 ${pct(Math.sqrt(sq / N - (sum / N) ** 2))}，最慘 ${pct(worst)}，停損觸發 ${pct(hit / N)}`);
}
// 3 隔夜掛單吃跳空：用真實 daily.json 的跳空分布。現股，限價買在前一收盤 −X%，只要跳空低於就成交（成交價＝開盤跳空價）；之後抱 1 天（再一次跳空）賣
console.log("\n[3] 隔夜掛限價買（前一收盤 −X%）吃跳空：跳空夠低就按跳空後的開盤價成交，隔天再賣（兩次真實跳空）");
const fs = require("fs"), pth = require("path"); const D = JSON.parse(fs.readFileSync(pth.join(__dirname, "..", "content/stocks/daily.json"), "utf8")).days;
const mv = []; for (const k of Object.keys(D)) for (const id of Object.keys(D[k])) if (typeof D[k][id] === "number") mv.push(Math.max(-0.1, Math.min(0.1, D[k][id] / 100)));
for (const X of [0.01, 0.03, 0.05]) { let n = 0, sum = 0, f = 0;
  for (let t = 0; t < N; t++) { const g1 = mv[Math.floor(rnd() * mv.length)], g2 = mv[Math.floor(rnd() * mv.length)]; n++; if (g1 > -X) continue; f++; sum += (1 + g2) * (1 - FEE) / (1 + FEE) - 1; }
  console.log(`X=${pct(X)}：成交率 ${pct(f / n)}，成交後再抱一天的平均報酬 ${pct(f ? sum / f : 0)}`); }
// 成交價為什麼不能是「停損價」：停損單在跳空時如果按停損價成交，等於跳空損失被抹掉（玩家永遠少賠），所以一律按觸發的那個價成交（這個不用模擬，是規則）。
