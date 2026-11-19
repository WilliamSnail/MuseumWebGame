// 延遲套利第三版：秒級現價（決定 0135）之後，各費用下還能不能賺。node tools/lag_arb3_sim.cjs [天數] [更新秒數]
// 模型：真實價每秒走壹步（高斯，波動 ＝ 日波動 ÷ √(盤中秒數)，每天再乘壹個波動倍數、每分鐘再乘 t(3) 的肥尾倍數）；
//   遊戲價 ＝ 排程每 U 秒抓到的真實價（資料源本身落後 SRC 秒），再加讀取快取 0～CACHE 秒；
//   套利者看得到即時真實價：遊戲價落後的那壹段 ＝ 訊號，|訊號| ＞ 來回成本 c 就順著方向做，H 秒後平倉（平倉價也是遊戲價）；
//   同壹檔不重疊（平倉前不再開）；不限筆數、不限冷卻。每筆 200 萬。
// 輸出：每檔每個來回成本 c 下，每天筆數、每筆淨賺%、壹天賺幾萬；最後是「各成本下，全部 24 檔美股／台股加總壹天賺多少」和損益兩平的成本。
const { NUM } = require("../test/load_shared.cjs").load({ __realMoney: true });
const DAYS = +process.argv[2] || 60, U = +process.argv[3] || 15, SRC = 2, CACHE = 8, H = U + SRC + CACHE + 5, STEP = 3; // H：等遊戲價追上再平倉
let seed = 777; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const norm = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
const tdist = () => { let c = 0; for (let i = 0; i < 3; i++) { const z = norm(); c += z * z; } return norm() / Math.sqrt(c / 3) / Math.sqrt(3); };
const sd15 = { us: NUM.casino.stock.us.sd15, tw: NUM.casino.stock.tw.sd15 }, N = { us: 390, tw: 270 };
const COSTS = [0, 0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5, 1.0];
// 日波動 ≈ sd15 ÷ 0.68 × √26（美股）；台股同樣比例用 √18（270/15）
const dailySd = (mk, id) => sd15[mk][id] / 0.68 * Math.sqrt(N[mk] / 15);
function dayPath(mk, id) {
  const secs = N[mk] * 60, f = Math.exp(0.4 * norm() - 0.08), s0 = dailySd(mk, id) / 100 / Math.sqrt(secs) * f, S = new Float64Array(secs + 1); let tm = 1;
  for (let i = 0; i < secs; i++) { if (i % 60 === 0) tm = Math.abs(tdist()); S[i + 1] = S[i] + s0 * tm * norm(); }
  return S;
}
function sim(mk, id) {
  const rows = COSTS.map(() => ({ n: 0, net: 0 }));
  for (let d = 0; d < DAYS; d++) {
    const S = dayPath(mk, id), n = S.length - 1;
    const G = t => { const k = Math.max(0, t - Math.floor(rnd() * (CACHE + 1))); const u = Math.floor(k / U) * U; return S[Math.max(0, u - SRC)]; };
    COSTS.forEach((c, ci) => {
      const cc = c / 100; let t = 30;
      while (t + H + 5 < n) {
        const g0 = G(t), sig = S[t] - g0;
        if (Math.abs(sig) > cc) { const gross = Math.sign(sig) * (G(t + H) - g0); rows[ci].n++; rows[ci].net += gross - cc; t += H; } else t += STEP;
      }
    });
  }
  return rows;
}
// 11-19 新增的 18 支美股（PR 796）還沒進這個分支的 config 時，用過去 3 個月的日波動補（%）
const EXTRA = { bigshipport: 2.87, greenleafclinic: 3.39, quantumfrog: 5.68, smallcore: 5.6, messengerlab: 6.7, oldgamestore: 2.52, fingerbank: 3.34, betkingdom: 4.14, droidhive: 3.52, treadclub: 2.78, blockpark: 4.64, popcornhall: 4.07, blackgoldwell: 2.58, bluefireyard: 2.29, greenglowmine: 4.59, raremountain: 3.66, redcoppermine: 2.98, richsoilshop: 3.25 };
for (const [id, d] of Object.entries(EXTRA)) if (!(id in sd15.us)) sd15.us[id] = d * 0.68 / Math.sqrt(26);
const IDS = { us: Object.keys(sd15.us), tw: Object.keys(sd15.tw) };
console.log(`延遲套利第三版：${DAYS} 天，每 ${U} 秒更新（源落後 ${SRC} 秒、快取 0～${CACHE} 秒、更新間隔＋15 秒後平倉）；每筆 200 萬；不限筆數`);
for (const mk of ["us", "tw"]) {
  const tot = COSTS.map(() => 0), per = {};
  for (const id of IDS[mk]) { const r = sim(mk, id); per[id] = r; r.forEach((x, i) => { tot[i] += x.net * 2e6 / DAYS; }); }
  console.log(`\n== ${mk === "us" ? "美股" : "台股"}：全部 ${IDS[mk].length} 檔加總，單壹帳號每天賺幾萬（每筆 200 萬、不重疊）`);
  console.log("來回成本%  " + COSTS.map(c => String(c).padStart(7)).join(""));
  console.log("壹天賺(萬) " + tot.map(v => (v / 1e4).toFixed(0).padStart(7)).join(""));
  const sample = mk === "us" ? ["nightindex", "silverapple", "greeneye", "redclaw", "messengerlab", "quantumfrog", "oldgamestore"] : ["linetower", "islandforge", "customchip"];
  for (const id of sample) { if (!per[id]) continue; console.log(`  ${id.padEnd(14)} 壹天筆數/淨賺% ` + per[id].map(x => `${(x.n / DAYS).toFixed(0)}/${x.n ? (x.net / x.n * 100).toFixed(3) : "-"}`.padStart(11)).join("")); }
}
