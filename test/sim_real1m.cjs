// 遊戲價直接 ＝ 倍數 × 真實價（每分鐘抓、不加隨機、不拉回）之後，看即時行情的人能不能靠「我們落後 L 分鐘」賺錢（11-14，數值平衡）
// node test/sim_real1m.cjs <資料夾>   資料夾裡要有 m1_<代號>.json（Yahoo 公開 1 分鐘 K 線，5 天；抓法見 test/sim_tw.cjs 檔頭，range=5d&interval=1m）
// 遊戲價 G(t) ＝ 真實價 R(t − L)。看盤的人知道 R(t)：知道遊戲價一定會在 L 分鐘後變成 R(t)，所以 |R(t)/R(t−L) − 1| > 來回手續費 1%（槓桿的手續費也按部位算）就能進場賺（先買／放空在現在的遊戲價，L 分鐘後平倉）。
// 這裡算：每個落後分鐘數 L，一天裡有多少窗口超過 1%、全天最多能賺多少（完全知道、不重疊地進場、槓桿 5×）、最大的幾次跳動。
const fs = require("fs"), path = require("path");
const dir = process.argv[2];
if (!dir) { console.log("用法：node test/sim_real1m.cjs <資料夾>"); process.exit(1); }
const FEE = 0.01, SYMS = fs.readdirSync(dir).filter(f => /^m1_.*\.json$/.test(f)).map(f => f.slice(3, -5));
const pct = x => (x * 100).toFixed(2) + "%";
const load = s => { const r = JSON.parse(fs.readFileSync(path.join(dir, `m1_${s}.json`), "utf8")).chart.result[0], q = r.indicators.quote[0].close, days = {};
  r.timestamp.forEach((t, i) => { if (q[i] == null) return; const d = new Date((t + (s.endsWith(".TW") ? 8 : -5) * 3600) * 1000).toISOString().slice(0, 10); (days[d] = days[d] || []).push({ t, c: q[i] }); }); return Object.values(days).filter(a => a.length > 150); };
console.log(`每支：落後 L 分鐘時，窗口報酬超過手續費 ${pct(FEE)} 的比例／全天最多能賺（槓桿 5×、不重疊、完全知道）平均每天／最大一次的 L 分鐘漲跌`);
console.log("代號".padEnd(10), [1, 2, 3, 5, 10].map(L => ("L=" + L).padEnd(34)).join(""));
const worst = { 1: [], 2: [], 3: [], 5: [] };
for (const s of SYMS) {
  const days = load(s), row = [];
  for (const L of [1, 2, 3, 5, 10]) {
    let n = 0, over = 0, gain = 0, mx = 0;
    for (const a of days) { let i = L, g = 0; while (i < a.length) { const r = a[i].c / a[i - L].c - 1; n++; mx = Math.max(mx, Math.abs(r)); if (Math.abs(r) > FEE) { over++; g += Math.abs(r) - FEE; i += L; } else i++; } gain += g; if (worst[L]) worst[L].push([s, Math.abs(a.reduce((m, x, k) => (k >= L ? Math.max(m, Math.abs(x.c / a[k - L].c - 1)) : m), 0))]); }
    row.push(`${(over / n * 100).toFixed(3)}%／${pct(5 * gain / days.length)}／${pct(mx)}`.padEnd(34));
  }
  console.log(s.padEnd(10), row.join(""));
}
console.log("\n每天最大的 L 分鐘跳動（前 5 名，含新聞）");
for (const L of [1, 2, 3, 5]) { const top = worst[L].sort((a, b) => b[1] - a[1]).slice(0, 5); console.log("L=" + L, top.map(x => `${x[0]} ${pct(x[1])}`).join("　")); }

// 超過手續費的窗口落在一天的哪裡？（開盤前 5 分鐘、收盤前 5 分鐘、其餘）
console.log("\n超過 1% 的 L=2 分鐘窗口落在哪裡（開盤後 5 分鐘內／收盤前 5 分鐘內／盤中其他）");
for (const s of SYMS) { const days = load(s); let a1 = 0, a2 = 0, a3 = 0; for (const a of days) for (let i = 2; i < a.length; i++) { const r = a[i].c / a[i - 2].c - 1; if (Math.abs(r) > FEE) { if (i <= 5) a1++; else if (i >= a.length - 6) a2++; else a3++; } } console.log(s.padEnd(10), "開盤", a1, "　收盤", a2, "　盤中", a3); }
