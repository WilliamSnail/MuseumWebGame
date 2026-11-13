// 台股盤中跟真實行情的搶跑驗算（11-14，數值平衡；規劃 2.8d 節）
// 資料：Yahoo 的公開 5 分鐘 K 線（每支 60 天），不放進 repo。抓法（只讀公開資料）：
//   curl -s -A "Mozilla/5.0" "https://query1.finance.yahoo.com/v8/finance/chart/2454.TW?range=60d&interval=5m" -o <資料夾>/tw5_2454.json
// 用法：node test/sim_tw.cjs <資料夾> [代號…，預設 2330 2454 2317 2308 2603 2412]
// 問題：我們的價格如果跟著真實行情（落後一段），開著看盤軟體的人能不能搶先買賺到超過手續費。
const fs = require("fs"), path = require("path");
const dir = process.argv[2], ids = process.argv.slice(3).length ? process.argv.slice(3) : ["2330", "2454", "2317", "2308", "2603", "2412"];
if (!dir) { console.log("用法：node test/sim_tw.cjs <資料夾> [代號…]"); process.exit(1); }
const FEE = 0.01; // 來回 1%
const pct = x => (x * 100).toFixed(2) + "%";
const sd = a => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };
const load = id => { const r = JSON.parse(fs.readFileSync(path.join(dir, `tw5_${id}.json`), "utf8")).chart.result[0]; const q = r.indicators.quote[0].close, days = {};
  r.timestamp.forEach((t, i) => { if (q[i] == null) return; const d = new Date((t + 8 * 3600) * 1000).toISOString().slice(0, 10); (days[d] = days[d] || []).push(q[i]); }); return Object.values(days).filter(a => a.length >= 50); };
const rets = (days, k) => { const out = []; for (const a of days) for (let i = k; i < a.length; i += k) out.push(a[i] / a[i - k] - 1); return out; }; // 每 k 根（5 分鐘）一段
console.log("== 1 真實台股一段的漲跌（每段不跨日）：標準差、超過手續費 1% 的比例");
console.log("代號    5分鐘標準差  15分鐘標準差  30分鐘標準差   15分鐘 >0.5%   >1%    >1.5%    30分鐘 >1%   開盤跳空標準差  跳空 >1%");
const all = {};
for (const id of ids) { const days = load(id); all[id] = days; const r5 = rets(days, 1), r15 = rets(days, 3), r30 = rets(days, 6);
  const gaps = []; for (let i = 1; i < days.length; i++) gaps.push(days[i][0] / days[i - 1].at(-1) - 1);
  const f = (a, x) => a.filter(v => Math.abs(v) > x).length / a.length;
  console.log(id.padEnd(6), pct(sd(r5)).padStart(10), pct(sd(r15)).padStart(12), pct(sd(r30)).padStart(12), "   ", pct(f(r15, 0.005)).padStart(8), pct(f(r15, 0.01)).padStart(8), pct(f(r15, 0.015)).padStart(8), pct(f(r30, 0.01)).padStart(10), "   ", pct(sd(gaps)).padStart(8), pct(f(gaps, 0.01)).padStart(10)); }
console.log("\n== 2 搶跑：知道這一段的真實漲跌 r，我們的價格這一段會照 X×r 追上來（再加隨機）。看盤的人 |X×r| > 1% 才進場，每次賺 |X×r| − 1%。");
console.log("    （落後一整段和不落後，優勢都是「一段的真實漲跌」，延遲不會讓優勢變小，只是把跳變成看得見的路）");
console.log("X(真實成分)   每 100 個 15 分鐘段有幾段值得進場   進場時平均賺（槓桿 1×）   全部段平均每段賺      5× 槓桿每段平均賺（占保證金）");
for (const X of [1, 0.8, 0.6, 0.5, 0.4]) { let seg = 0, trade = 0, gain = 0;
  for (const id of ids) for (const r of rets(all[id], 3)) { seg++; if (Math.abs(X * r) > FEE) { trade++; gain += Math.abs(X * r) - FEE; } }
  console.log(String(X).padEnd(12), (trade / seg * 100).toFixed(2).padStart(10), "段", pct(trade ? gain / trade : 0).padStart(18), pct(gain / seg).padStart(22), pct(5 * gain / seg).padStart(24)); }
console.log("\n== 3 如果縮短錨點間隔（5 分鐘一段 / 15 分鐘一段 / 30 分鐘一段），X=1 時看盤的人的優勢");
for (const [k, name] of [[1, "5 分鐘"], [3, "15 分鐘"], [6, "30 分鐘"]]) { let seg = 0, trade = 0, gain = 0;
  for (const id of ids) for (const r of rets(all[id], k)) { seg++; if (Math.abs(r) > FEE) { trade++; gain += Math.abs(r) - FEE; } }
  console.log(name.padEnd(8), `${(trade / seg * 100).toFixed(2)}% 的段值得進場，全部段平均每段賺 ${pct(gain / seg)}`); }
console.log("\n== 4 跳空（隔夜）：開盤前「試撮」看得到，若遊戲在 09:00 還用昨天收盤價，看盤的人 08:55 就能進場");
for (const id of ids) { const days = all[id], g = []; for (let i = 1; i < days.length; i++) g.push(days[i][0] / days[i - 1].at(-1) - 1);
  const win = g.filter(v => Math.abs(v) > FEE); console.log(id, `跳空超過 1% 的天數 ${(win.length / g.length * 100).toFixed(0)}%，那些天平均可賺 ${pct(win.length ? win.reduce((s, v) => s + Math.abs(v) - FEE, 0) / win.length : 0)}，全部天平均 ${pct(win.reduce((s, v) => s + Math.abs(v) - FEE, 0) / g.length)}`); }
console.log("\n== 5 每分鐘隨機走多大才「看起來在動」：真實 5 分鐘標準差換成每分鐘（÷√5）；橋（兩個錨點之間）中點的標準差");
{ const s5 = sd(ids.flatMap(id => rets(all[id], 1))), s1 = s5 / Math.sqrt(5), mid = s1 * Math.sqrt(15) / 2;
  console.log(`真實每分鐘標準差約 ${pct(s1)}；建議隨機的每分鐘標準差取 ${pct(s1)}（跟真實一樣大）；15 分鐘一段的橋中點標準差約 ${pct(mid)}（橋兩端都是錨點，知道兩端的人可以賺回到線上的差，約 ${pct(mid)}，遠小於手續費 1%）`); }
console.log("\n== 6 一個看盤的人一天（4 支台股一起盯：2330 2454 2317 2308），最多 3 筆，5× 做多，進場條件：|X×r| 大於 手續費 1% ＋ 槓桿利息（0.15%×4÷5＝0.12%）＝ 1.12%；挑最大的 3 筆；報酬是保證金的 %");
{ const four = ["2330", "2454", "2317", "2308"].filter(id => all[id]); const nd = Math.min(...four.map(id => all[id].length)); const TH = 0.0112;
  for (const X of [1, 0.6, 0.5, 0.4, 0.3]) { let tot = 0, ntr = 0; for (let d = 0; d < nd; d++) { const gs = []; for (const id of four) { const a = all[id][d]; for (let i = 3; i < a.length; i += 3) { const r = a[i] / a[i - 3] - 1; if (Math.abs(X * r) > TH) gs.push(5 * (Math.abs(X * r) - TH)); } } gs.sort((p, q) => q - p); const top = gs.slice(0, 3); ntr += top.length; tot += top.reduce((s, v) => s + v, 0); }
    console.log(`X=${X}：一天平均賺保證金的 ${pct(tot / nd)}，平均一天進場 ${(ntr / nd).toFixed(2)} 筆（${nd} 個交易日）`); } }
console.log("\n== 7 同一個看盤的人，改限制台股的最大槓桿（進場條件 |X×r| > 1% ＋ 利息 0.15%×(L−1)÷L；報酬是保證金的 %）");
{ const four = ["2330", "2454", "2317", "2308"].filter(id => all[id]); const nd = Math.min(...four.map(id => all[id].length));
  for (const X of [0.5, 0.4]) for (const L of [1, 2, 3, 5]) { const TH = 0.01 + 0.0015 * (L - 1) / L; let tot = 0; for (let d = 0; d < nd; d++) { const gs = []; for (const id of four) { const a = all[id][d]; for (let i = 3; i < a.length; i += 3) { const r = a[i] / a[i - 3] - 1; if (Math.abs(X * r) > TH) gs.push(L * (Math.abs(X * r) - TH)); } } gs.sort((p, q) => q - p); tot += gs.slice(0, 3).reduce((s, v) => s + v, 0); }
    console.log(`X=${X} 槓桿 ${L}×：一天平均賺保證金的 ${pct(tot / nd)}`); } }
console.log("\n== 8 如果免費行情本身比真實慢（Yahoo 的台股常見慢約 20 分鐘），有即時報價的人領先更多：有效落後 15／30／45 分鐘，X=0.4，同一個盯盤的人一天賺保證金的 %（一天最多 3 筆；段別不重疊用整段）");
{ const four = ["2330", "2454", "2317", "2308"].filter(id => all[id]); const nd = Math.min(...four.map(id => all[id].length));
  for (const L of [2, 5]) for (const [k, name] of [[3, "15 分鐘"], [6, "30 分鐘"], [9, "45 分鐘"]]) { const X = 0.4, TH = 0.01 + 0.0015 * (L - 1) / L; let tot = 0; for (let d = 0; d < nd; d++) { const gs = []; for (const id of four) { const a = all[id][d]; for (let i = k; i < a.length; i += k) { const r = a[i] / a[i - k] - 1; if (Math.abs(X * r) > TH) gs.push(L * (Math.abs(X * r) - TH)); } } gs.sort((p, q) => q - p); tot += gs.slice(0, 3).reduce((s, v) => s + v, 0); }
    console.log(`槓桿 ${L}× 落後 ${name}：${pct(tot / nd)}`); } }
