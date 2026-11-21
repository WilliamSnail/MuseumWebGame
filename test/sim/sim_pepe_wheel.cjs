// 佩佩轉盤＋差壹畫（對莊家的兩個小遊戲）的模擬：node test/sim/sim_pepe_wheel.cjs [種子]
// 規劃：docs/規劃/新牌桌遊戲規劃.md 第 1、3 節。不載入 shared/（還沒有程式），純數學＋蒙地卡羅。
// 看什麼：①每種押法的莊家優勢（精確）②有沒有「全押必賺」的套利（精確證明＋隨機組合驗證）③壹個人壹天的輸贏分布和連輸加倍法
//        ④全館壹天莊家淨賺賠的分布（會不會把莊家的錢壹天輸光）⑤特別格開佩佩的話壹天會開幾隻。
const SEED = Number(process.argv[2]) || 20261121;
let s = SEED >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ---------- 轉盤的格子：25 格＝ 4 色 × 6 ＋ 1 個特別格 ----------
// 稀有度照擲骰的比例（普通 60、稀有 28、超稀有 10、傳說 2）湊成 24 格：普通 14、稀有 6、超稀有 3、傳說 1
const SLOTS = [];
const LAYOUT = { 紅: ["普通", "普通", "普通", "普通", "稀有", "超稀有"], 綠: ["普通", "普通", "普通", "普通", "稀有", "超稀有"], 黃: ["普通", "普通", "普通", "稀有", "稀有", "超稀有"], 黑: ["普通", "普通", "普通", "稀有", "稀有", "傳說"] };
Object.keys(LAYOUT).forEach(c => LAYOUT[c].forEach(r => SLOTS.push({ color: c, rar: r })));
SLOTS.push({ color: "虹彩", rar: "特別" }); // 特別格：沒押它的全輸（像輪盤的 0）
const N = SLOTS.length;
// 押法：{ id, hit(slot) }；賠率 mult ＝ 贏了拿回幾倍注（含本金）。mult 由莊家優勢 e 算：floor((1−e)/P × 10)/10
const betTypes = () => {
  const T = [];
  ["紅", "綠", "黃", "黑"].forEach(c => T.push({ id: "顏色:" + c, hit: x => x.color === c }));
  ["普通", "稀有", "超稀有", "傳說"].forEach(r => T.push({ id: "稀有度:" + r, hit: x => x.rar === r }));
  ["紅", "綠", "黃", "黑"].forEach(c => [...new Set(LAYOUT[c])].forEach(r => T.push({ id: `色×稀有:${c}${r}`, hit: x => x.color === c && x.rar === r })));
  T.push({ id: "特別格", hit: x => x.color === "虹彩" });
  T.push({ id: "單格(任壹格)", hit: (x, i) => i === 0 });
  T.forEach(t => { t.n = SLOTS.filter(t.hit).length; t.p = t.n / N; });
  return T;
};
const withMult = (e) => betTypes().map(t => Object.assign(t, { mult: Math.floor((1 - e) / t.p * 10) / 10 }));
const fmt = x => (x * 100).toFixed(2) + "%";

console.log(`=== 佩佩轉盤：${N} 格（4 色×6＋1 特別格），種子 ${SEED} ===`);
console.log("稀有度的格數：" + ["普通", "稀有", "超稀有", "傳說"].map(r => `${r} ${SLOTS.filter(x => x.rar === r).length}`).join("、"));
for (const e of [0.02, 0.03, 0.04, 0.05]) {
  const T = withMult(e);
  const edges = T.map(t => 1 - t.p * t.mult);
  console.log(`\n--- 目標莊家優勢 ${fmt(e)}：各押法實際優勢 最小 ${fmt(Math.min(...edges))}／最大 ${fmt(Math.max(...edges))}（賠率取到小數壹位往下捨，所以略高）`);
  if (e === 0.04) T.forEach(t => console.log(`  ${t.id.padEnd(14)} 中 ${String(t.n).padStart(2)}/${N}（${fmt(t.p)}）賠 ${String(t.mult).padStart(5)} 倍（含本金）→ 優勢 ${fmt(1 - t.p * t.mult)}`));
}
// ② 套利：每種押法的 P×mult ≤ 1−e 時，任何組合的「每個結果的總回收」的平均 ＝ (1−e)×總注 < 總注，而最小值 ≤ 平均 → 一定有結果虧，不可能全押必賺。
//    這裡再用隨機組合驗證（精確列舉 25 個結果）
{
  const T = withMult(0.04); let worst = -1e9, tries = 300000;
  for (let k = 0; k < tries; k++) {
    const stakes = T.map(() => (rnd() < 0.3 ? Math.floor(rnd() * 100) : 0)), tot = stakes.reduce((a, b) => a + b, 0);
    if (!tot) continue;
    let minNet = Infinity;
    for (let i = 0; i < N; i++) { let r = 0; T.forEach((t, j) => { if (stakes[j] && t.hit(SLOTS[i], i)) r += stakes[j] * t.mult; }); minNet = Math.min(minNet, r - tot); }
    worst = Math.max(worst, minNet / tot);
  }
  console.log(`\n② 套利檢查：隨機 ${tries.toLocaleString()} 種組合，最壞結果的淨賺最好也只有 ${fmt(worst)}（要 ≤ 0；> 0 就是有必賺的押法）`);
}
// ③ 壹個人壹天：起始 1,000 萬、壹天 60 轉，最小注 10 萬（minBet 之上隨便）、單注上限 100 萬（先假設為 maxBet 的 1/10）
function playDay(strategy, bank = 10e6, spins = 60, cap = 1e6) {
  const T = withMult(0.04), by = id => T.find(t => t.id === id);
  let b = bank, lossStreakBet = 0, turnover = 0;
  for (let k = 0; k < spins && b >= 1e5; k++) {
    let bets;
    if (strategy === "顏色平注") bets = [[by("顏色:紅"), 2e5]];
    else if (strategy === "單格最大注") bets = [[by("色×稀有:黑傳說"), Math.min(cap, b)]];
    else if (strategy === "加倍法(押壹色)") { lossStreakBet = lossStreakBet ? Math.min(lossStreakBet, cap, b) : 1e5; bets = [[by("顏色:紅"), lossStreakBet]]; }
    else if (strategy === "稀有度普通平注") bets = [[by("稀有度:普通"), 3e5]];
    const tot = bets.reduce((a, x) => a + x[1], 0); if (tot > b) break;
    b -= tot; turnover += tot;
    const i = Math.floor(rnd() * N); let ret = 0; bets.forEach(([t, st]) => { if (t.hit(SLOTS[i], i)) ret += Math.floor(st * t.mult); });
    b += ret;
    if (strategy === "加倍法(押壹色)") lossStreakBet = ret > 0 ? 0 : lossStreakBet * 2;
  }
  return { net: b - bank, turnover };
}
console.log("\n③ 壹個人壹天 60 轉（本金 1,000 萬、優勢 4%）：2 萬人天");
for (const st of ["顏色平注", "稀有度普通平注", "單格最大注", "加倍法(押壹色)"]) {
  const R = []; let to = 0; for (let k = 0; k < 20000; k++) { const r = playDay(st); R.push(r.net); to += r.turnover; }
  R.sort((a, b) => a - b); const mean = R.reduce((a, b) => a + b, 0) / R.length;
  console.log(`  ${st.padEnd(12)} 平均 ${(mean / 1e4).toFixed(1)} 萬（周轉的 ${fmt(mean / (to / R.length))}）｜5% 分位 ${(R[Math.floor(R.length * .05)] / 1e4).toFixed(0)} 萬｜95% 分位 ${(R[Math.floor(R.length * .95)] / 1e4).toFixed(0)} 萬｜最慘 ${(R[0] / 1e4).toFixed(0)} 萬｜賠光 25% 以上的人 ${fmt(R.filter(x => x < -2.5e6).length / R.length)}`);
}
// ④ 全館壹天：P 位玩家各玩 spins 轉，莊家壹天淨賺賠的分布（莊家健康線 3,000 萬）。單格(24 倍)的最大注比較：100 萬（沒有賠付上限）、80 萬（單轉最多賠 2,000 萬＝21 點五張過關 2:1 押滿 1,000 萬的最大贏法）、20 萬
console.log("\n④ 全館壹天莊家的淨賺賠（95% 的人押顏色 20 萬壹注，5% 的人每轉押單格 24 倍的大注）：1 萬天");
for (const [P, spins, bigCap] of [[30, 60, 1e6], [30, 60, 8e5], [30, 60, 2e5], [30, 200, 1e6], [30, 200, 8e5], [30, 200, 2e5]]) {
  const T = withMult(0.04), red = T.find(t => t.id === "顏色:紅"), cell = T.find(t => t.id.startsWith("色×稀有:黑傳說"));
  const D = []; for (let d = 0; d < 10000; d++) { let house = 0; for (let p = 0; p < P; p++) { const big = rnd() < 0.05; for (let k = 0; k < spins; k++) { const t = big ? cell : red, st = big ? bigCap : 2e5, i = Math.floor(rnd() * N); house += st - (t.hit(SLOTS[i], i) ? Math.floor(st * t.mult) : 0); } } D.push(house); }
  D.sort((a, b) => a - b); const mean = D.reduce((a, b) => a + b, 0) / D.length;
  console.log(`  ${P} 人×${spins} 轉、單格最大注 ${bigCap / 1e4} 萬：平均 ${(mean / 1e6).toFixed(1)}M｜5% 分位 ${(D[Math.floor(D.length * .05)] / 1e6).toFixed(1)}M｜最慘 ${(D[0] / 1e6).toFixed(1)}M｜壹天虧超過 3,000 萬（健康線）的機率 ${fmt(D.filter(x => x < -3e7).length / D.length)}`);
}
// ⑤ 特別格開佩佩：每轉 1/25；壹天上限轉數不同時，壹人壹天期望開幾隻、全館壹天幾隻
console.log("\n⑤ 若「特別格」開出 1 隻佩佩（只要押了特別格才算，押中 1/25）：");
for (const spins of [20, 60, 200]) console.log(`  壹天 ${spins} 轉、每轉都押特別格：壹人壹天期望 ${(spins / N).toFixed(1)} 隻（要 ≥ 1 隻的機率 ${fmt(1 - Math.pow(1 - 1 / N, spins))}）；30 人：${(30 * spins / N).toFixed(0)} 隻／天`);

// ---------- 差壹畫 ----------
console.log("\n=== 差壹畫：荷官數壹疊正字，下壹次數完 剛好／多壹畫／少壹畫 ===");
for (const [pe, e] of [[0.6, 0.04], [0.5, 0.04], [0.7, 0.04]]) {
  const pm = (1 - pe) / 2;
  const row = [["剛好", pe], ["多壹畫", pm], ["少壹畫", pm], ["第 k 筆出錯(1~5)", (1 - pe) / 5]].map(([n, p]) => { const m = Math.floor((1 - e) / p * 10) / 10; return `${n} ${fmt(p)} 賠 ${m}（優勢 ${fmt(1 - p * m)}）`; });
  console.log(`  剛好 ${fmt(pe)}：${row.join("｜")}`);
}
console.log("  套利：同轉盤，每種押法 P×賠率 ≤ 1−優勢，任何組合最壞結果都虧；「剛好」＋「多」＋「少」三個全押＝總回收 0.96 倍總注。");
console.log("  跟劇情：結果只用伺服器的骰子（種子＝伺服器祕密＋錢包＋第幾局），不讀任何劇情資料；荷官台詞借氣氛，不放謎底。");
