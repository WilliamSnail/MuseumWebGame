// 館方投資策略回測（決定 0099）：用真實日線（Yahoo 公開圖表介面，5 年）比較幾種策略。
//   node tools/invest_backtest.cjs --fetch [資料夾]      先抓資料（預設放在系統暫存資料夾的 invest_bt）
//   node tools/invest_backtest.cjs [交易日數] [資料夾]    跑回測（預設每個窗口 250 個交易日）
// 規則照 shared/casino_invest.js：每天投現金的 3%、持股成本上限 30% 的現金、手續費 0.5%（博物館資金 0）。
const fs = require("fs"), path = require("path");
const dir = process.argv[3] || path.join(require("os").tmpdir(), "invest_bt"), PF = path.join(dir, "prices.json");
const SYMBOLS = { greeneye: "NVDA", redclaw: "AMD", nightindex: "^IXIC", silverapple: "AAPL", flashcar: "TSLA", squarewin: "MSFT", islandforge: "2330.TW", handbrain: "2454.TW", bigassembly: "2317.TW", trianglepower: "2308.TW", linetower: "2412.TW", brainrack: "2382.TW", cloudcabinet: "6669.TW", customchip: "3661.TW", voltgrid: "1519.TW", wavefreight: "2609.TW", ironwing: "2618.TW", plugstation: "1513.TW", pillpot: "1795.TW", needlelab: "4743.TWO", towerbeam: "9958.TW", coilelder: "1609.TW" }; // 真實代號只放在 tools/（不進 shared/）
async function fetchAll() {
  fs.mkdirSync(dir, { recursive: true }); const out = {};
  for (const [id, sym] of Object.entries(SYMBOLS)) { const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(sym) + "?range=5y&interval=1d", { headers: { "User-Agent": "Mozilla/5.0" } }), c = (await r.json()).chart.result[0], q = c.indicators.quote[0].close; out[id] = c.timestamp.map((t, i) => [new Date(t * 1000).toISOString().slice(0, 10), q[i]]).filter(x => x[1] > 0); console.log("抓到", id, out[id].length); }
  fs.writeFileSync(PF, JSON.stringify(out));
}
if (process.argv[2] === "--fetch") { fetchAll().then(() => process.exit(0)); return; }
if (!fs.existsSync(PF)) { console.log("沒有資料：先 node tools/invest_backtest.cjs --fetch [資料夾]"); process.exit(1); }
const P = JSON.parse(fs.readFileSync(PF, "utf8"));
const IDS = Object.keys(P);
const dates = Array.from(new Set(IDS.flatMap(id => P[id].map(x => x[0])))).sort();
const px = {}; // px[id][i]，往前補
for (const id of IDS) { const m = new Map(P[id]); let last = null; px[id] = dates.map(d => { if (m.has(d)) last = m.get(d); return last; }); }
const FEE = 0.005;
const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const ret = (id, i, n) => (i - n >= 0 && px[id][i - n] > 0 && px[id][i] > 0) ? px[id][i] / px[id][i - n] - 1 : 0;
const ma = (id, i, n) => { let s = 0, c = 0; for (let k = Math.max(0, i - n + 1); k <= i; k++) if (px[id][k] > 0) { s += px[id][k]; c++; } return c ? s / c : 0; };

// 策略：每天給 { sells: [{id, frac}], buys: weights {id: w}（總和 1，乘上 spend） }
const C0 = { daily: 0.03, hold: 0.30 };
function cfgCurrent(opts = {}) {
  const o = Object.assign({ stopLoss: 0.15, takeProfit: 0.30, stopTotal: 0.10, stopDays: 7, top: 0.7, even: 0.2, rand: 0.1, mode: "chase" }, opts);
  return {
    name: opts.name || "現行",
    pre(S, i, day, rnd) {
      const sells = [];
      if (o.stopLoss) for (const id of Object.keys(S.own)) { const avg = S.cost[id] / S.own[id], r = avg > 0 ? px[id][i] / avg - 1 : 0; if (r <= -o.stopLoss) sells.push({ id, frac: 0.5 }); else if (o.takeProfit && r >= o.takeProfit) sells.push({ id, frac: 1 / 3 }); }
      else if (o.takeProfit) for (const id of Object.keys(S.own)) { const avg = S.cost[id] / S.own[id]; if (avg > 0 && px[id][i] / avg - 1 >= o.takeProfit) sells.push({ id, frac: 1 / 3 }); }
      return sells;
    },
    weights(S, i, rnd) {
      const w = {}, ids = IDS.filter(id => px[id][i] > 0);
      const rk = ids.map(id => ({ id, r: o.mode === "lag" ? -ret(id, i, 3) : ret(id, i, 3) })).sort((a, b) => b.r - a.r);
      rk.slice(0, 2).forEach(x => { w[x.id] = (w[x.id] || 0) + o.top / 2; });
      ids.forEach(id => { w[id] = (w[id] || 0) + o.even / ids.length; });
      const pick = ids[Math.floor(rnd() * ids.length)]; w[pick] = (w[pick] || 0) + o.rand;
      return w;
    },
    stopTotal: o.stopTotal, stopDays: o.stopDays,
  };
}
const even = (name, extra = {}) => ({ name, pre: () => [], weights: (S, i) => { const ids = IDS.filter(id => px[id][i] > 0), w = {}; ids.forEach(id => { w[id] = 1 / ids.length; }); return w; }, stopTotal: 0, ...extra });
const dip = (name, th, tilt) => ({ name, pre: () => [], stopTotal: 0, weights(S, i) { const ids = IDS.filter(id => px[id][i] > 0), w = {}; let t = 0; ids.forEach(id => { const m = ma(id, i, 20), d = m > 0 ? px[id][i] / m - 1 : 0; w[id] = d <= -th ? tilt : 1; t += w[id]; }); ids.forEach(id => { w[id] /= t; }); return w; } });
const dipOnly = (name, th) => ({ name, pre: () => [], stopTotal: 0, weights(S, i) { const ids = IDS.filter(id => px[id][i] > 0 && ma(id, i, 20) > 0 && px[id][i] / ma(id, i, 20) - 1 <= -th), w = {}; if (!ids.length) return w; ids.forEach(id => { w[id] = 1 / ids.length; }); return w; } });
const idxOnly = name => ({ name, pre: () => [], stopTotal: 0, weights: () => ({ nightindex: 1 }) });
// 慢慢進、帶減碼：持有久；漲 50% 賣 1/4；不停損
const slow = name => Object.assign(even(name), { pre(S, i) { const s = []; for (const id of Object.keys(S.own)) { const avg = S.cost[id] / S.own[id]; if (avg > 0 && px[id][i] / avg - 1 >= 0.5) s.push({ id, frac: 0.25 }); } return s; } });
// 價值：均線上才買（趨勢過濾），跌破 60 日均線賣光
const trend = name => ({ name, stopTotal: 0, pre(S, i) { const s = []; for (const id of Object.keys(S.own)) { const m = ma(id, i, 60); if (m > 0 && px[id][i] < m * 0.9) s.push({ id, frac: 1 }); } return s; }, weights(S, i) { const ids = IDS.filter(id => px[id][i] > 0 && px[id][i] >= ma(id, i, 60)), w = {}; ids.forEach(id => { w[id] = 1 / ids.length; }); return w; } });

function run(strat, i0, n, fee, seed = 1) {
  const rnd = mulberry(seed + i0);
  const S = { cash: 100, own: {}, cost: {}, pnl: 0, stopUntil: -1, fees: 0, trades: 0 };
  const eq = i => S.cash + Object.keys(S.own).reduce((a, id) => a + S.own[id] * px[id][i], 0);
  let peak = 100, mdd = 0;
  for (let i = i0; i < Math.min(dates.length, i0 + n); i++) {
    for (const s of strat.pre(S, i, i - i0, rnd)) { // 賣
      const own = S.own[s.id]; if (!(own > 0)) continue;
      const q = s.frac >= 1 ? own : Math.max(1e-9, own * s.frac), gross = q * px[s.id][i], f = gross * fee, costOut = S.cost[s.id] * q / own;
      S.cash += gross - f; S.fees += f; S.trades++; S.pnl += gross - f - costOut; S.own[s.id] -= q; S.cost[s.id] -= costOut; if (S.own[s.id] < 1e-9) { delete S.own[s.id]; delete S.cost[s.id]; }
    }
    const costSum = Object.values(S.cost).reduce((a, b) => a + b, 0), val = Object.keys(S.own).reduce((a, id) => a + S.own[id] * px[id][i], 0);
    if (strat.stopTotal && S.cash > 0) { const base = costSum + S.cash, total = S.pnl + val - costSum; if (total < -base * strat.stopTotal && S.stopUntil < i) S.stopUntil = i + (strat.stopDays || 7); }
    if (S.stopUntil >= i) { /* 暫停買 */ } else {
      const capLeft = S.cash * C0.hold - costSum, spend = Math.min(S.cash, capLeft, S.cash * C0.daily);
      if (spend > 0) { const w = strat.weights(S, i, rnd), tot = Object.values(w).reduce((a, b) => a + b, 0); if (tot > 0) for (const id of Object.keys(w)) { const a = spend * w[id] / tot, q = a / (px[id][i] * (1 + fee)); if (q <= 0) continue; const cost = q * px[id][i], f = cost * fee; S.cash -= cost + f; S.fees += f; S.trades++; S.own[id] = (S.own[id] || 0) + q; S.cost[id] = (S.cost[id] || 0) + cost + f; } }
    }
    const e = eq(i); peak = Math.max(peak, e); mdd = Math.max(mdd, 1 - e / peak);
  }
  const last = Math.min(dates.length, i0 + n) - 1, e = eq(last), costSum = Object.values(S.cost).reduce((a, b) => a + b, 0), val = Object.keys(S.own).reduce((a, id) => a + S.own[id] * px[id][last], 0);
  return { ret: e / 100 - 1, fees: S.fees / 100, mdd, trades: S.trades, held: val / e, realized: S.pnl / 100 };
}
const strats = [
  cfgCurrent({ name: "現行（追高前2＋停損 −15%／停利 +30%）" }),
  cfgCurrent({ name: "現行拿掉停損停利停買", stopLoss: 0, takeProfit: 0, stopTotal: 0 }),
  cfgCurrent({ name: "現行但專挑落後的（逆勢）", mode: "lag" }),
  cfgCurrent({ name: "現行但停損放寬 −30%", stopLoss: 0.30, takeProfit: 0.5, stopTotal: 0.2 }),
  even("平均買全部（定期定額，不賣）"),
  slow("平均買全部＋漲 50% 賣 1/4"),
  dip("定期定額＋跌破 20 日均線 5% 的加碼 ×3", 0.05, 3),
  dipOnly("只在跌破 20 日均線 5% 以上才買", 0.05),
  trend("均線上才買、跌破 60 日均線 −10% 賣光"),
  idxOnly("只買夜光科技指數（定期定額）"),
];
const H = +process.argv[2] || 250, STEP = 20;
const pct = x => (x * 100).toFixed(1) + "%";
for (const fee of [FEE, 0]) {
  console.log(`\n== 手續費 ${fee * 100}%（${fee ? "莊家池" : "博物館資金"}）：每 ${STEP} 個交易日起跑一次，每次 ${H} 個交易日；每天投 3% 的現金、持股成本上限 30% 的現金 ==`);
  for (const s of strats) {
    const rs = []; for (let i0 = 0; i0 + H <= dates.length; i0 += STEP) rs.push(run(s, i0, H, fee));
    const a = rs.map(r => r.ret).sort((x, y) => x - y), avg = (k) => rs.reduce((t, r) => t + r[k], 0) / rs.length;
    console.log(`${s.name.padEnd(34, "　")} 平均 ${pct(avg("ret")).padStart(7)}｜最差 ${pct(a[0]).padStart(7)}｜中位 ${pct(a[Math.floor(a.length / 2)]).padStart(7)}｜賺錢的窗口 ${Math.round(a.filter(x => x > 0).length / a.length * 100)}%｜最大回落平均 ${pct(avg("mdd"))}｜手續費 ${pct(avg("fees"))}｜交易 ${avg("trades").toFixed(0)} 次｜期末持股占 ${pct(avg("held"))}`);
  }
}
console.log("\n（資料", dates[0], "～", dates.at(-1), "共", dates.length, "個日期；窗口數", Math.floor((dates.length - H) / STEP) + 1, "）");
const bh = IDS.map(id => px[id].at(-1) / px[id][px[id].findIndex(x => x > 0)] - 1); console.log("對照：整段買了不動的各股報酬", IDS.map((id, k) => id + " " + pct(bh[k])).join("、"));
