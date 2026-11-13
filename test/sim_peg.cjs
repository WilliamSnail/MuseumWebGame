// 館外股票「照真實股價的比例」之後，每天往「真實價 × 倍數」拉回一部分，會不會被套利（11-14，數值平衡；規劃 2.8h）
// node test/sim_peg.cjs
// 模型：遊戲價 G，目標 T ＝ 倍數 × 真實價。差距 D ＝ G/T − 1。每個交易日：
//   遊戲只跟到真實漲跌的 X（2.8d 的真實成分），其餘 (1−X) 的真實漲跌差距累積；再加隨機成分（sd ＝ σ日 × √(1−X²)，讓整體波動跟真實差不多）；每天扣 drag 0.04%；
//   然後在開盤時把差距拉回 λ（D ← D × (1−λ)）。
// 套利：看盤的人在收盤前看得到 D，知道開盤會拉回 λ·D。拉回預期賺 |λD|，手續費來回 1% ＋ drag 0.04%（＋槓桿利息）。
// 他進場的條件 |λD| > 1.04%（1×）；每天預期賺 E[(|λD| − 1.04%)+]。要 ≈ 0。
let s = 2026111414; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const nrm = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const pct = x => (x * 100).toFixed(2) + "%";
const FEE = 0.0104, DRAG = 0.0004, DAYS = 40000;
function run(sd, X, lam, L = 1) {
  let D = 0, ev = 0, n = 0, abs = 0, ss = 0, trades = 0;
  const innSd = Math.sqrt(((1 - X) * sd) ** 2 + sd * sd * (1 - X * X));
  const th = FEE + 0.0015 * (L - 1) / L;
  for (let d = 0; d < DAYS; d++) {
    D += innSd * nrm() - DRAG;                     // 當天收盤時的差距（沒跟到的真實漲跌 ＋ 隨機成分 ＋ drag）
    const gain = Math.max(0, Math.abs(lam * D / (1 + D)) - th); // 看盤的人在收盤前就看得到 D，知道開盤會拉回 λ·D（簡化：線性近似）
    ev += L * gain; if (gain > 0) trades++;
    abs += Math.abs(D); ss += D * D; n++;
    D = D * (1 - lam);                            // 開盤拉回
    D = Math.max(-0.6, Math.min(2, D));
  }
  return { sd: Math.sqrt(ss / n), ev: ev / n, trades: trades / n };
}
console.log("X(真實成分)=0.4。每一格：差距 D 的標準差／看盤的人（收盤前看差距、開盤賺拉回）每天平均賺（槓桿 1×）／每天有進場的比例");
console.log("日波動 σ   " + [0.02, 0.05, 0.1, 0.2, 0.3, 0.5].map(l => ("λ=" + l).padEnd(28)).join(""));
for (const sd of [0.01, 0.02, 0.03, 0.04, 0.07]) console.log((pct(sd) + "      ").slice(0, 10), [0.02, 0.05, 0.1, 0.2, 0.3, 0.5].map(l => { const r = run(sd, 0.4, l); return `${pct(r.sd)} / ${pct(r.ev)} / ${(r.trades * 100).toFixed(1)}%`.padEnd(28); }).join(""));
console.log("\n同樣，但看盤的人用 2× 槓桿（館外股的槓桿還沒開，這是上限）：每天平均賺");
for (const sd of [0.02, 0.04]) console.log((pct(sd) + "      ").slice(0, 10), [0.05, 0.1, 0.2, 0.3].map(l => ("λ=" + l + " " + pct(run(sd, 0.4, l, 2).ev)).padEnd(22)).join(""));
console.log("\nX 不同時（σ=3%，λ=0.1／0.2）：差距的標準差、套利每天賺");
for (const X of [0.25, 0.4, 0.5, 0.7, 1]) console.log("X=" + X, [0.1, 0.2].map(l => { const r = run(0.03, X, l); return `λ=${l}: sd ${pct(r.sd)} 賺 ${pct(r.ev)}`.padEnd(32); }).join(""));

// ---- 拉回的幅度加上限（每天最多拉回 CAP）：預期賺 ≤ CAP < 手續費＋drag（1.04%），所以不管差距多大都賺不到
console.log("\n[拉回加上限] 每天拉回 clamp(λ·D, ±CAP)。CAP＝1.0%（< 來回手續費 1.0% ＋ drag 0.04%）。差距 D 的標準差／|D| < 5% 的天數比例／看盤的人每天平均賺（1×）");
function runCap(sd, X, lam, cap, L = 1) {
  let D = 0, ev = 0, ss = 0, n = 0, near = 0;
  const innSd = Math.sqrt(((1 - X) * sd) ** 2 + sd * sd * (1 - X * X)), th = FEE + 0.0015 * (L - 1) / L;
  for (let d = 0; d < DAYS; d++) {
    D += innSd * nrm() - DRAG;                                   // 收盤時的差距
    const pull = Math.max(-cap, Math.min(cap, -lam * D));        // 開盤會拉回的量（收盤前就知道）
    ev += L * Math.max(0, Math.abs(pull) - th); ss += D * D; n++; if (Math.abs(D) < 0.05) near++;
    D += pull; D = Math.max(-0.7, Math.min(3, D));
  }
  return { sd: Math.sqrt(ss / n), ev: ev / n, near: near / n };
}
console.log("日波動 σ   " + [0.1, 0.3, 1].map(l => ("λ=" + l).padEnd(34)).join(""));
for (const sd of [0.01, 0.02, 0.03, 0.04, 0.07]) console.log((pct(sd) + "      ").slice(0, 10), [0.1, 0.3, 1].map(l => { const r = runCap(sd, 0.4, l, 0.01); return `sd ${pct(r.sd)} / <5% ${(r.near * 100).toFixed(0)}% / 賺 ${pct(r.ev)}`.padEnd(34); }).join(""));
console.log("\nCAP 不同時（σ=3%，λ=0.3，X=0.4，2× 槓桿也試）：");
for (const cap of [0.005, 0.01, 0.0104, 0.015, 0.02]) { const a = runCap(0.03, 0.4, 0.3, cap), b = runCap(0.03, 0.4, 0.3, cap, 2); console.log("CAP=" + pct(cap), `sd ${pct(a.sd)} / <5% ${(a.near * 100).toFixed(0)}% / 1× 賺 ${pct(a.ev)} / 2× 賺 ${pct(b.ev)}`); }
console.log("\n[反例：2.8d 的「開盤第一個價＝真實開盤價」如果等於每天把差距全部歸零（λ＝1、沒有 CAP）] σ＝3%、4%：看盤的人每天賺");
for (const sd of [0.02, 0.03, 0.04]) { const r = run(sd, 0.4, 1); console.log(pct(sd), "差距 sd " + pct(r.sd), "每天賺 " + pct(r.ev), "（有進場 " + (r.trades * 100).toFixed(0) + "% 的日子）"); }
