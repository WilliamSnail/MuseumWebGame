// 藝術市場數值驗算（11-14，數值平衡；規劃 2.10、2.10a 節）
// node test/sim_art.cjs
// 價格公式同 shared/casino_art.js 的 casArtPrice（底價 ×（1 + 放久了 + 景氣 + 搶手））。
let s = 77; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const nrm = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const pct = x => (x * 100).toFixed(1) + "%";
// fast：前 fd 天每天漲 fast；之後每天漲 up；最多漲 cap（都是小數）
const SETS = { "舊草稿 (賣回80% 每天+0.2% 上限30%)": { sell: 0.8, fast: 0.002, fd: 1e9, up: 0.002, cap: 0.30, mood: 0.02, dcap: 0.05 }, "上一版建議 (賣回90% 每天+0.1% 上限30%)": { sell: 0.9, fast: 0.001, fd: 1e9, up: 0.001, cap: 0.30, mood: 0.02, dcap: 0.05 }, "翊文要的 (賣回90% 前14天+0.85% 之後+0.04% 上限15%)": { sell: 0.9, fast: 0.0085, fd: 14, up: 0.0004, cap: 0.15, mood: 0.01, dcap: 0.03 } };
const gain = (c, d) => Math.min(c.cap, d <= c.fd ? d * c.fast : c.fd * c.fast + (d - c.fd) * c.up);
const dBuy = 0.01, dSell = 0.015; // 買的時候別人持有 → +1%；賣的時候多了自己 → +1.5%
console.log("== 1 持有 N 天賣回的總報酬（景氣 0、搶手大約 +1%→+1.5%）；對照：活存 0.1%／天、定存 7 天 3%（約 0.43%／天）");
console.log("設定".padEnd(36), "回本天數", "  1天    3天   14天   30天   100天  300天");
for (const [name, c] of Object.entries(SETS)) {
  const ret = d => c.sell * (1 + gain(c, d) + dSell) / (1 + dBuy) - 1;
  let be = null; for (let d = 0; d < 2000; d++) if (ret(d) >= 0) { be = d; break; }
  console.log(name.padEnd(30), String(be === null ? "永遠" : be).padStart(6), [1, 3, 14, 30, 100, 300].map(d => pct(ret(d)).padStart(8)).join(""));
}
console.log("== 1b 短線最壞的情況：買在景氣最好（−mood）、沒人持有；賣在景氣最差（+mood）、搶手到上限。看第 N 天賣回");
for (const [name, c] of Object.entries(SETS)) console.log(name.padEnd(36), [1, 2, 3, 5, 7, 10, 14].map(d => "第" + d + "天 " + pct(c.sell * (1 + gain(c, d) + c.mood + c.dcap) / (1 - c.mood) - 1)).join("  "));
console.log("== 1c 長期對照：活存每天 0.1%（本金最多算 1,000 萬）、定存 7 天 3%；畫的 100 天、300 天總報酬見上表");
// 2 景氣 B 的過程和相關性
console.log("\n== 2 畫和股票的日報酬相關性（館內股：0.1×活動比 + 0.3%×B + 噪音；畫：放久了 −2%×ΔB）");
{ const N = 200000; let B = 0, Bp = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxo = 0, sxxo = 0, sxyo = 0, so = 0, soo = 0, n = 0;
  for (let i = 0; i < N; i++) { Bp = B; const g = nrm() * 0.12; B = 0.5 * B + 0.5 * Math.max(-1, Math.min(1, g / 0.1));
    const art = 0.002 - 0.02 * (B - Bp), inS = 0.1 * 0.3 * nrm() + 0.003 * B + 0.01 * (rnd() - 0.5) * 2, outS = 0.02 * nrm();
    n++; sx += art; sxx += art * art; sy += inS; syy += inS * inS; sxy += art * inS; so += outS; soo += outS * outS; sxyo += art * outS; }
  const c = (a, b, ab, aa, bb) => (ab / n - (a / n) * (b / n)) / Math.sqrt((aa / n - (a / n) ** 2) * (bb / n - (b / n) ** 2));
  console.log(`畫 vs 館內股：${c(sx, sy, sxy, sxx, syy).toFixed(3)}　畫 vs 館外股（沒有任何連結）：${c(sx, so, sxyo, sxx, soo).toFixed(3)}`);
  console.log(`畫的日報酬標準差 ${pct(Math.sqrt(sxx / n - (sx / n) ** 2))}（館內股 ${pct(Math.sqrt(syy / n - (sy / n) ** 2))}、館外股 2%～3.5%）`); }
// 3 壓力測試：股票崩 −30%，畫撐不撐得住；賣畫去補要付價差
console.log("\n== 3 壓力測試：股票 5 天 −30%、景氣 B 從 0 掉到 −1（畫現價 +2%）。持有 100 萬畫 + 100 萬股，兩種做法的帳面和變現");
for (const [name, c] of Object.entries(SETS)) {
  const art = 1.02, stock = 0.7; console.log(`${name}：帳面 ${((art + stock) / 2 * 100).toFixed(0)}（純股票 70）；賣畫變現去補股票 ${((art * c.sell + stock) / 2 * 100).toFixed(0)}`); }
// 4 莊家：全部人買了同一天一起賣回
console.log("\n== 4 莊家曝險：N 個人各買 M 幅同級的畫，持有 D 天後同一天全部賣回（景氣 0）；看莊家一天要付多少、和收到多少的差");
for (const [name, c] of Object.entries(SETS)) { console.log(name);
  for (const [N, M, base, D] of [[10, 5, 2500000, 150], [20, 10, 6000000, 300], [20, 20, 15000000, 300]]) { const paid = N * M * base * (1 + dBuy), pay = N * M * base * (1 + gain(c, D) + dSell) * c.sell;
    console.log(`  ${N} 人 × ${M} 幅（底價 ${base / 10000} 萬）持有 ${D} 天：莊家收過 ${(paid / 1e8).toFixed(2)} 億，一天付 ${(pay / 1e8).toFixed(2)} 億（${pct(pay / paid - 1)}）；占 1 億 bankroll 的 ${pct(pay / 1e8)}`); } }
