// 延遲套利第二版（翊文 11-19「先做再降」，冷卻和每天筆數都取消了）：node tools/lag_arb2_sim.cjs [天數]
// 模型同 lag_arb_sim.cjs（真實價每分鐘走一步、t 分布肥尾、遊戲價 G_j ＝ 真實價 S_{j−L}）。差別：
//   不限筆數（沒有冷卻、壹天不限開幾筆），套利者每分鐘每檔都可以做，成本讀到真實的；
//   「成交要等幾分鐘」e：下單之後第 e 分鐘的遊戲價成交（e 越小越舊）。
//     e=0   現況市價單：下單那分鐘的遊戲價（S_{t−L}）成交
//     e=1   現況限價單繞道：掛壹張一下單就會觸發的限價單，下單之後的第壹個價（G_{t+1} ＝ S_{t+1−L}）成交（casStockMatch 的 at 只看「之後」）
//     e=1+L 擋法 1：下單（或限價單觸發）之後，要等真實價走過壹分鐘的那個價（S_{t+1}）才成交
//     取消偷看：擋法 1 之後，下單排隊中看到成交價（S_{t+1}）才決定取消或不取消（要看有沒有偷看的好處）
//   進場、出場都用同壹套（出場在 H＝L 分鐘後決定）；訊號 ＝ 進場價落後真實的那一段 S_t − S_{t+e−L}（e ≥ L 就沒有訊號，只能猜）
const { NUM } = (() => { try { return require("../test/load_shared.cjs").load({ __realMoney: true }); } catch (e) { return { NUM: null }; } })();
const DAYS = +process.argv[2] || 300, fmt = n => Math.round(n).toLocaleString("en-US");
let seed = 20261119; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const norm = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
const tdist = () => { let c = 0; for (let i = 0; i < 3; i++) { const z = norm(); c += z * z; } return norm() / Math.sqrt(c / 3) / Math.sqrt(3); };
const MK = { tw: { len: 270, sds: Object.values(NUM.casino.stock.tw.sd15).map(x => x / Math.sqrt(15)) }, us: { len: 390, sds: Object.values(NUM.casino.stock.us.sd15).map(x => x / Math.sqrt(15)) } };
const day = mk => { const M = MK[mk], f = Math.exp(0.4 * norm() - 0.08); return M.sds.map(sd => { const s = [0]; for (let i = 0; i < M.len + 12; i++) s.push(s[i] + (sd / 100) * f * tdist()); return s; }); };
const H = (mk, L, e, peek) => {
  const out = [];
  for (let t = 3; t + 2 * L + e + 4 < MK[mk].len; t++) out.push(t);
  return out;
};
// 回傳每筆 { g（含方向的報酬）, a（訊號大小） }
function trades(S, L, e, peek) {
  const o = [], n = MK.tw.len;
  for (let t = 4; t + L + e + 3 < S.length - 1; t++) {
    let dir, a;
    if (peek) { dir = Math.sign(S[t + 1] - S[t + 1 - L]); a = Math.abs(S[t + 1] - S[t + 1 - L]); } // 擋法 1 之後，成交價 S_{t+1} 已經看得到（排隊中取消的好處）
    else if (e < L) { dir = Math.sign(S[t] - S[t + e - L]); a = Math.abs(S[t] - S[t + e - L]); } // 進場價 S_{t+e−L} 落後的那一段
    else { dir = Math.sign(S[t] - S[t - L]); a = Math.abs(S[t] - S[t - L]); } // 沒有訊號可看，只能順著過去的方向猜
    if (!dir) continue;
    const entry = S[t + e - L + (e >= L ? 0 : 0)], ex = S[t + L + e - L]; // 進場價 S_{t+e−L}；出場在 t+L 決定、同樣等 e 分鐘 → S_{t+e}
    o.push({ g: dir * (S[t + e] - S[t + e - L]), a });
  }
  return o;
}
const STR = L => [
  ["e=0 現況市價單（下單那分鐘的遊戲價）", 0, false], ["e=1 現況限價單繞道（下單後第壹個價）", 1, false],
  [`e=1+L 擋法 1（市價＋限價都等 ${1 + L} 分鐘後的價）`, 1 + L, false], [`擋法 1 ＋ 排隊中看成交價再取消（偷看）`, 1 + L, true],
];
const COSTS = [["美股真實（0）", 0], ["台股當沖真實（0.25）", 0.25], ["台股現股真實（0.4）", 0.4], ["現在槓桿（1.0）", 1.0], ["現在台股現股（1.3）", 1.3]];
console.log(`延遲套利第二版 ${DAYS} 天（每分鐘每檔都可做、不限筆數、不限冷卻；每筆 200 萬；t 分布肥尾）`);
for (const mk of ["tw", "us"]) for (const L of [1, 2, 3]) {
  const all = {}; const sers = [];
  for (let d = 0; d < DAYS; d++) for (const S of day(mk)) sers.push(S);
  console.log(`\n== ${mk === "tw" ? "台股" : "美股"}　遊戲價慢 ${L} 分鐘（做法 × 來回成本：每筆淨賺% ／ 單帳號每天賺幾萬，筆數照訊號大於成本才做）`);
  console.log("做法".padEnd(48) + COSTS.map(c => c[0].padStart(18)).join(""));
  for (const [name, e, peek] of STR(L)) {
    const rows = COSTS.map(() => ({ n: 0, net: 0 }));
    for (const S of sers) for (const x of trades(S, L, e, peek)) COSTS.forEach(([, c], i) => { const cc = c / 100; if (x.a > cc) { rows[i].n++; rows[i].net += x.g - cc; } });
    console.log(name.padEnd(46) + rows.map(r => `${(r.n ? r.net / r.n * 100 : 0).toFixed(3)}%／${fmt(r.net * 2e6 / DAYS / MK[mk].sds.length / 1e4)}萬`.padStart(18)).join("") + `   （壹天每檔 ${(rows[1].n / DAYS / MK[mk].sds.length).toFixed(1)} 筆）`);
  }
}
