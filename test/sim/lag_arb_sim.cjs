// 延遲套利模擬（翊文 11-17：館外美股、台股費用照真實，遊戲價比真實慢約 1 分鐘）：node test/sim/lag_arb_sim.cjs [天數]
// 模型：真實價每分鐘走一步（對數報酬，標準差用 config 的 sd15 ÷ √15，t 分布 df 3 帶肥尾，每天再乘一個波動倍數）；遊戲價 ＝ 真實價落後 L 分鐘。
// 套利者看得到真實價：訊號 ＝ ln(S_t / S_{t−L})（遊戲價還沒追上的那一段）。|訊號| 超過門檻就順著方向買（賣空）在遊戲價 S_{t−L}，等遊戲價追上（L 分鐘後 ＝ S_t）賣出。
// 擋法：none 沒擋；hold5 買進後 5 分鐘內不能賣；next 成交價改用下單之後的真實價（買、賣兩邊都排隊 L＋1 分鐘，S_{t+1}）；cost 提高來回成本。
// 輸出：來回成本 c 之下，每天能做幾筆、淨賺多少（占成交額 %），以及「壹天賣出上限」或「壹天最多開 3 筆」限制下每天賺多少錢。
const { NUM } = (() => { try { return require("../load_shared.cjs").load({ __realMoney: true }); } catch (e) { return { NUM: null }; } })();
const DAYS = +process.argv[2] || 200, fmt = n => Math.round(n).toLocaleString("en-US");
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const norm = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
const tdist = () => { const df = 3; let c = 0; for (let i = 0; i < df; i++) { const z = norm(); c += z * z; } return norm() / Math.sqrt(c / df) / Math.sqrt(3); }; // 單位變異數的 t(3)
const MK = {
  tw: { len: 270, sds: Object.values(NUM.casino.stock.tw.sd15).map(x => x / Math.sqrt(15)) },
  us: { len: 390, sds: Object.values(NUM.casino.stock.us.sd15).map(x => x / Math.sqrt(15)) },
};
// 一天的分鐘價（對數價），回傳每支一條
const day = (mk, gauss) => { const M = MK[mk], f = Math.exp(0.4 * norm() - 0.08); return M.sds.map(sd => { const s = [0]; for (let i = 0; i < M.len; i++) s.push(s[i] + (sd / 100) * f * (gauss ? norm() : tdist())); return s; }); };
// 套利的單筆：回傳 [{ gross, t }]（gross ＝ 方向 × 報酬，還沒扣成本）。fix: none | hold5 | next
function trades(S, L, fix) {
  const out = [], n = S.length - 1, H = fix === "hold5" ? 5 : L;
  for (let t = L; t + 1 + H + L <= n; t++) {
    const sig = S[t] - S[t - L], dir = Math.sign(sig); if (!dir) continue;
    let g;
    if (fix === "next") g = dir * (S[t + 1 + L] - S[t + 1]);   // 買賣都排隊：進場 S_{t+1}、出場 S_{t+1+L}，都在下單之後，沒有資訊
    else g = dir * (S[t + H - L] - S[t - L]);                 // 進場 S_{t−L}（遊戲價），出場遊戲價 G_{t+H} ＝ S_{t+H−L}（H＝L 時就是 S_t）
    out.push({ g, a: Math.abs(sig), t });
  }
  return out;
}
const COSTS = [0, 0.05, 0.1, 0.25, 0.4, 0.6, 1.0, 1.3];
function run(mk, L, fix, gauss) {
  const rows = COSTS.map(() => ({ n: 0, net: 0, big: [] }));
  for (let d = 0; d < DAYS; d++) {
    const ser = day(mk, gauss), all = [];
    for (const S of ser) for (const x of trades(S, L, fix)) all.push(x);
    COSTS.forEach((c, i) => {
      const cc = c / 100, pick = all.filter(x => x.a > cc).sort((p, q) => q.a - p.a); // 訊號大於成本才做；挑訊號大的先做（只能看訊號，不能看事後結果）
      rows[i].n += pick.length; rows[i].net += pick.reduce((s, x) => s + (x.g - cc), 0);
      rows[i].big.push(pick.map(x => x.g - cc));
    });
  }
  return rows.map((r, i) => {
    const per = r.n ? r.net / r.n * 100 : 0, nd = r.n / DAYS;
    // 限制：現股一天賣出上限 cap（每筆 size），槓桿一天最多 3 筆（每筆 posLimit）
    const spot = (cap, size) => r.big.reduce((s, b) => s + b.slice(0, Math.floor(cap / size)).reduce((u, v) => u + v * size, 0), 0) / DAYS;
    const lev = r.big.reduce((s, b) => s + b.slice(0, 3).reduce((u, v) => u + v * 20e6, 0), 0) / DAYS;
    return { c: COSTS[i], nd, per, spot2: spot(2e7, 2e6), spot10: spot(1e8, 2e6), lev };
  });
}
console.log(`延遲套利模擬 ${DAYS} 天（t 分布肥尾；每筆 200 萬；現股賣出上限 2,000 萬／1 億；槓桿壹天 3 筆 × 2,000 萬）`);
for (const mk of ["tw", "us"]) for (const L of [1, 2]) for (const fix of ["none", "hold5", "next"]) {
  if (fix === "hold5" && L > 1) continue;
  console.log(`\n== ${mk === "tw" ? "台股" : "美股"}　遊戲價慢 ${L} 分鐘　擋法 ${fix}`);
  console.log("來回成本%  壹天筆數  每筆淨賺%  現股(上限2千萬)每天  現股(上限1億)每天  槓桿3筆每天");
  for (const r of run(mk, L, fix)) console.log(`${String(r.c).padStart(6)}   ${r.nd.toFixed(1).padStart(8)}  ${r.per.toFixed(3).padStart(8)}  ${fmt(r.spot2).padStart(16)}  ${fmt(r.spot10).padStart(16)}  ${fmt(r.lev).padStart(14)}`);
}
