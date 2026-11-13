// 股票盤中價格、槓桿、放空、當沖的模擬（11-14，數值平衡；規劃 2.8b 節）
// node test/sim_stock_day.cjs
// 盤中價：每 TICK 分鐘一個價，隨機漫步（沒有回歸、不釘死收盤，不然看得出會回來＝穩賺），相對開盤夾在 ±CLAP。
// 當沖槓桿單：保證金 m、倍數 L（部位 = L×m），手續費買賣各 FEE（算部位），槓桿利息 INT（算借的 (L−1)×m，一筆算一次），借券費 BORROW（放空，算部位，一筆一次）。
let s = 20261114; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const nrm = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const E = process.env;
const SD = +(E.SD || 0.02), TICKS = +(E.TICKS || 68), CLAP = +(E.CLAP || 0.05);
const FEE = 0.005, INT = +(E.INT || 0.0015), BORROW = +(E.BORROW || 0.003), MAINT = +(E.MAINT || 0.5); // MAINT：剩下的保證金不到原本的幾成就平倉
const step = SD / Math.sqrt(TICKS);
function path() { const a = [1]; for (let i = 1; i <= TICKS; i++) { let p = a[i - 1] * (1 + step * nrm()); p = Math.max(1 - CLAP, Math.min(1 + CLAP, p)); a.push(p); } return a; }
// 一筆：在 tick i 開、tick j 平（或被強制平倉）。回傳 {ret: 相對保證金的報酬, liq, bad: 壞帳（相對保證金）}
function trade(a, i, j, L, dir) {
  const pos = L, cost = pos * FEE * 2 + (L - 1) * INT + (dir < 0 ? pos * BORROW : 0);
  for (let k = i + 1; k <= j; k++) {
    const pnl = dir * pos * (a[k] / a[i] - 1);
    if (1 + pnl - cost < MAINT || k === j) {
      const eq = 1 + pnl - cost, liq = k < j || eq < MAINT;
      return { ret: Math.max(eq, -999) - 1, liq: k < j, bad: eq < 0 ? -eq : 0 };
    }
  }
  return { ret: -cost, liq: false, bad: 0 };
}
const N = 40000;
console.log(`盤中：每天 ${TICKS} 個價（${(17 * 60 / TICKS).toFixed(0)} 分鐘一個），整天標準差 ${SD * 100}%，夾 ±${CLAP * 100}%；手續費買賣各 ${FEE * 100}%、槓桿利息 ${INT * 100}%、借券費 ${BORROW * 100}%；保證金剩 ${MAINT * 100}% 強制平倉`);
console.log("\n[當沖] 每一筆（相對保證金）：隨機時間進場，持有 1 小時～收盤（隨機），方向隨機");
console.log("倍數  方向  平均報酬   贏的比例   被強制平倉   壞帳(平均)   最慘一筆");
for (const L of [1, 2, 3, 5, 10]) for (const dir of [1, -1]) {
  if (L === 1 && dir < 0) continue;
  let sum = 0, win = 0, liq = 0, bad = 0, worst = 0;
  for (let t = 0; t < N; t++) { const a = path(); const i = Math.floor(rnd() * (TICKS - 5)); const j = i + 4 + Math.floor(rnd() * (TICKS - i - 4)); const r = trade(a, i, Math.min(j, TICKS), L, dir); sum += r.ret; if (r.ret > 0) win++; if (r.liq) liq++; bad += r.bad; worst = Math.min(worst, r.ret); }
  console.log(`${String(L).padStart(2)}×  ${dir > 0 ? "做多" : "放空"}  ${(sum / N * 100).toFixed(2).padStart(7)}%  ${(win / N * 100).toFixed(1).padStart(7)}%  ${(liq / N * 100).toFixed(2).padStart(8)}%   ${(bad / N * 100).toFixed(3).padStart(8)}%   ${(worst * 100).toFixed(0)}%`);
}
console.log("\n[追價策略] 連 3 個價往同一邊就順著做，賺 +2%（部位）停利、跌 −1% 停損，5×。martingale 下不該贏過成本");
{ let sum = 0, n = 0;
  for (let t = 0; t < N; t++) { const a = path(); for (let i = 3; i < TICKS - 8; i++) { const up = a[i] > a[i - 1] && a[i - 1] > a[i - 2] && a[i - 2] > a[i - 3], dn = a[i] < a[i - 1] && a[i - 1] < a[i - 2] && a[i - 2] < a[i - 3]; if (!up && !dn) continue; const dir = up ? 1 : -1; let j = i + 1; while (j < TICKS) { const q = dir * (a[j] / a[i] - 1); if (q >= 0.02 || q <= -0.01) break; j++; } const r = trade(a, i, j, 5, dir); sum += r.ret; n++; break; } }
  console.log(`平均每筆 ${(sum / n * 100).toFixed(2)}%（${n} 筆）`); }
console.log("\n[反轉策略] 漲 2% 就放空、跌 2% 就做多，抱到收盤，5×。（如果盤中價釘死收盤會變穩賺，隨機漫步下應該跟成本一樣）");
{ let sum = 0, n = 0;
  for (let t = 0; t < N; t++) { const a = path(); for (let i = 1; i < TICKS - 8; i++) { const q = a[i] - 1; if (Math.abs(q) < 0.02) continue; const r = trade(a, i, TICKS, 5, q > 0 ? -1 : 1); sum += r.ret; n++; break; } }
  console.log(`平均每筆 ${(sum / n * 100).toFixed(2)}%（${n} 筆）`); }
console.log("\n[對照：釘死收盤的盤中曲線（布朗橋）] 同樣的反轉策略");
{ let sum = 0, n = 0;
  for (let t = 0; t < N; t++) { const w = [0]; for (let i = 1; i <= TICKS; i++) w.push(w[i - 1] + step * nrm()); const a = w.map((x, i) => 1 + x - (i / TICKS) * w[TICKS]); for (let i = 1; i < TICKS - 8; i++) { const q = a[i] - 1; if (Math.abs(q) < 0.02) continue; const r = trade(a, i, TICKS, 5, q > 0 ? -1 : 1); sum += r.ret; n++; break; } }
  console.log(`平均每筆 ${(sum / n * 100).toFixed(2)}%（${n} 筆）→ 不能這樣做`); }
console.log("\n[一個人一天] 每天最多 3 筆槓桿單 5×、保證金各 100 萬、隨機進出：");
{ for (const cnt of [1, 3, 6]) { let sum = 0, sq = 0; const D = 20000; for (let t = 0; t < D; t++) { const a = path(); let day = 0; for (let k = 0; k < cnt; k++) { const i = Math.floor(rnd() * (TICKS - 5)); const j = Math.min(TICKS, i + 4 + Math.floor(rnd() * (TICKS - i - 4))); day += trade(a, i, j, 5, rnd() < 0.5 ? 1 : -1).ret * 1000000; } sum += day; sq += day * day; }
  const m = sum / D; console.log(`${cnt} 筆：平均 ${(m / 10000).toFixed(1)} 萬／天，標準差 ${(Math.sqrt(sq / D - m * m) / 10000).toFixed(0)} 萬／天`); } }
console.log("\n[隔日沖（對照）] 今天買、明天開盤（05:00 跳空）賣。跳空用真實 daily.json 的分布（館外），做多 5×、保證金剩 50% 強制平倉（跳空時直接按開盤價）");
{ const fs = require("fs"), path2 = require("path"); const D = JSON.parse(fs.readFileSync(path2.join(__dirname, "..", "content/stocks/daily.json"), "utf8")).days; const mv = []; for (const k of Object.keys(D)) for (const id of Object.keys(D[k])) if (typeof D[k][id] === "number") mv.push(Math.max(-0.1, Math.min(0.1, D[k][id] / 100)));
  for (const L of [2, 5, 10]) { let sum = 0, bad = 0, liq = 0, n = 0; for (const m of mv) for (const dir of [1, -1]) { const cost = L * FEE * 2 + (L - 1) * INT + (dir < 0 ? L * BORROW : 0); const eq = 1 + dir * L * m - cost; sum += Math.max(eq, 0) - 1; if (eq < 0) bad += -eq; if (eq < MAINT) liq++; n++; }
    console.log(`${L}×：平均 ${(sum / n * 100).toFixed(2)}%／筆，被強平 ${(liq / n * 100).toFixed(1)}%，壞帳平均 ${(bad / n * 100).toFixed(2)}%（${mv.length} 個真實日）`); } }
