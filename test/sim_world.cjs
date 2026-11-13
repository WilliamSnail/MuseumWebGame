// 股票跟「外面世界」買賣之後，會不會印出太多錢（11-14，數值平衡；規劃 2.8f 節）
// node test/sim_world.cjs
// 館外股：買＝籌碼流出館外（burn），賣＝流進來（mint）。手續費進預算池（搬）。所以全館錢的增減 ＝ 玩家的「價格賺賠」（不含手續費）。
// 玩家：每天收入 INCOME（沒做滿也差不多，見 1.4），錢包超過保留額就全買進去（館外七支平均買），不賣。看 30／90 天後「帳面多出來的錢」跟全館總籌碼的比。
// 行情：每天 = 漂移 μ − drag ＋ 共同因子 ＋ 個股，夾 ±10%。三種行情：一般（μ 0.05%）、多頭（0.25%）、極端（0.6%）。
let s = 1114; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const nrm = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const E = process.env, N = +(E.N || 10), INCOME = +(E.INCOME || 3500000), KEEP = 1000000, DRAG = +(E.DRAG || 0.0004), TR = 200;
const M = x => (x / 1e6).toFixed(0) + "M", pct = x => (x * 100).toFixed(1) + "%";
function run(mu, cap, days) {
  const res = { gain: 0, total: 0, byDay: {} };
  for (let t = 0; t < TR; t++) {
    const w = Array(N).fill(0), cost = Array(N).fill(0), val = Array(N).fill(0);
    for (let d = 1; d <= days; d++) {
      const fc = 0.012 * nrm(); // 共同因子（大盤）
      const r = Math.max(-0.1, Math.min(0.1, mu - DRAG + fc + 0.015 * nrm())); // 七支平均買，個股雜訊被平均掉，看成一個籃子
      for (let i = 0; i < N; i++) {
        val[i] *= 1 + r; w[i] += INCOME;
        const buy = Math.max(0, Math.min(w[i] - KEEP, cap - cost[i])); w[i] -= buy; cost[i] += buy; val[i] += buy * (1 - 0.005);
      }
      if (d === 30 || d === 90) { const g = val.reduce((a, b) => a + b, 0) - cost.reduce((a, b) => a + b, 0), tot = w.reduce((a, b) => a + b, 0) + val.reduce((a, b) => a + b, 0); (res.byDay[d] = res.byDay[d] || []).push({ g, tot }); }
    }
  }
  return res;
}
console.log(`${N} 人，每人每天進 ${M(INCOME)}（剩下的全買館外股，錢包留 ${M(KEEP)}），drag ${DRAG * 100}%／天，${TR} 次平均`);
console.log("行情             每人持股上限   30天:帳面多出來的錢／占全館    90天:帳面多出來的錢／占全館    （正＝館裡多印的錢；賣掉才真的 mint）");
for (const [name, mu] of [["一般 0.05%/天", 0.0005], ["多頭 0.25%/天", 0.0025], ["極端 0.6%/天", 0.006]]) for (const cap of [Infinity, 200e6, 50e6, 20e6]) {
  const r = run(mu, cap, 90), f = d => { const a = r.byDay[d]; const g = a.reduce((x, y) => x + y.g, 0) / a.length, t = a.reduce((x, y) => x + y.tot, 0) / a.length; return `${M(g).padStart(7)} / ${pct(g / t).padStart(6)}`; };
  console.log(name.padEnd(14), (cap === Infinity ? "無" : M(cap)).padStart(8), "        ", f(30), "           ", f(90)); }

// ---- 館方（莊家／預算池）投資外面世界（規劃 2.8f）：池子 100 單位；每天把「可投資的錢」的 3% 投進去，持股最多 CAPX 單位；
// 規則沿用決定 0074：七成買最近 3 天漲最多的兩支、兩成平均、一成隨機一支；比成本跌 15% 賣一半（停損）、漲 30% 賣三分之一（停利）。
console.log("\n[館方投資] 池子 100 單位，持股上限 30 單位，每天投入可投資的 3%，90 天。看池子最後的變化（單位，正＝館方賺）：平均／最差 5%／最好 5%");
{ const CAPX = +(process.env.CAPX || 30), TRI = 400;
  for (const [name, mu, sd] of [["一般 0.05%/天", 0.0005, 0.02], ["多頭 0.25%/天", 0.0025, 0.02], ["空頭 −0.25%/天", -0.0025, 0.02], ["崩盤（第 30 天起 5 天 −30%）", 0.0005, 0.02]]) {
    const out = [];
    for (let t = 0; t < TRI; t++) {
      const px = Array(7).fill(1), hold = Array(7).fill(0), cost = Array(7).fill(0), hist = [[1, 1, 1, 1, 1, 1, 1]]; let cash = 100, fee = 0;
      for (let d = 1; d <= 90; d++) {
        const fc = 0.012 * nrm(), crash = name.startsWith("崩盤") && d >= 30 && d < 35 ? -0.07 : 0;
        for (let i = 0; i < 7; i++) px[i] *= 1 + Math.max(-0.1, Math.min(0.1, mu - DRAG + crash + fc + sd * 0.8 * nrm()));
        hist.push(px.slice());
        const val = hold.reduce((a, h, i) => a + h * px[i], 0);
        // 停損停利
        for (let i = 0; i < 7; i++) if (hold[i] > 0) { const avg = cost[i] / hold[i]; if (px[i] < avg * 0.85) { const q = hold[i] / 2; cash += q * px[i] * 0.995; cost[i] -= avg * q; hold[i] -= q; } else if (px[i] > avg * 1.3) { const q = hold[i] / 3; cash += q * px[i] * 0.995; cost[i] -= avg * q; hold[i] -= q; } }
        const held = hold.reduce((a, h, i) => a + h * px[i], 0), want = Math.min(0.03 * 100, CAPX - held, cash);
        if (want > 0 && d >= 4) { const g = px.map((p, i) => p / hist[d - 3][i]), top = g.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 2).map(x => x[1]), w = Array(7).fill(0.2 / 7); top.forEach(i => w[i] += 0.35); w[Math.floor(rnd() * 7)] += 0.1;
          for (let i = 0; i < 7; i++) { const a = want * w[i]; hold[i] += a * 0.995 / px[i]; cost[i] += a; } cash -= want; fee += want * 0.005; }
      }
      out.push(cash + hold.reduce((a, h, i) => a + h * px[i], 0) - 100);
    }
    out.sort((a, b) => a - b); const m = out.reduce((a, b) => a + b, 0) / out.length;
    console.log(name.padEnd(28), `${m.toFixed(2).padStart(7)}  ${out[Math.floor(TRI * 0.05)].toFixed(2).padStart(7)}  ${out[Math.floor(TRI * 0.95)].toFixed(2).padStart(7)}`); } }
