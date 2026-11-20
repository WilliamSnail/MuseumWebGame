// 政府帳併入公共機構（決定 0140）的模擬：node test/sim/gov_sweep_sim.cjs [--days 90] [--gov0 起始餘額] [--daily 館友每天交的稅]
// 景氣 −1／0／+1 各跑：對照（不搬）、全搬（pct 100）、分批（pct 10）。印公共機構的帳、健康值、狀態、補助和公共採購（往來表）每天的量，
// 以及別的單位有沒有偏離對照。只讀 repo，不碰正式站。
const L = require("../../tools/content/world_lib.cjs"), { sim } = require("./world_sim.cjs"), { load } = require("../load_shared.cjs");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const days = arg("--days", 90), gov0 = arg("--gov0", 0), daily = arg("--daily", 0), fmt = n => Math.round(n).toLocaleString("en-US"), npcs = L.readNpcs();
const P = "g-public", S = { normal: "一般", cut: "減薪", squeeze: "緊縮", layoff: "裁員" };
const names = {}; L.readUnits().forEach(u => { names[u.id] = u.name; });
function run(b, sweep) {
  const G = load({ __realMoney: true }); G.NUM.casino.govSweep = Object.assign({}, G.NUM.casino.govSweep, sweep);
  const r = sim(G, npcs, { days, b, gov0, govDaily: daily }), h = r.house, U = h.led.units || {};
  const sum = pat => Object.entries(U).filter(([k]) => pat.test(k)).reduce((a, [, v]) => a + v, 0);
  return { r, G, sub: sum(/^tradeSubsidy\|/), tax: sum(/^tradeTax\|.*\|g-public$/) + sum(/^tradeHhTax\|/), tech: sum(/^tradeTech\|g-public\|/), swept: (h.led.world && h.led.world.govSweep) || 0 };
}
for (const b of [-1, 0, 1]) {
  console.log(`\n=== 景氣 ${b}，${days} 天，政府帳起始 ${fmt(gov0)}、館友每天交稅 ${fmt(daily)} ===`);
  const base = run(b, { on: false });
  for (const [name, sw] of [["對照（不搬）", { on: false }], ["全搬 pct100", { on: true, pct: 100, capPct: 0 }], ["分批 pct10", { on: true, pct: 10, capPct: 0 }]]) {
    const x = name.startsWith("對照") ? base : run(b, sw), r = x.r, wh = r.house.wh, a1 = r.a1, st = wh.st[P] ? S[wh.st[P].s] : "-";
    const worst = Object.keys(a1).filter(k => k !== P).map(k => ({ k, d: a1[k] - base.r.a1[k] })).sort((p, q) => Math.abs(q.d) - Math.abs(p.d))[0];
    console.log(`${name}：公共機構帳 ${fmt(r.a0[P])} → ${fmt(a1[P])}　健康值 ${wh.h[P]}　${st}　政府帳剩 ${fmt(r.gov)}　搬進 ${fmt(x.swept)}　補助累計 ${fmt(x.sub)}　收稅 ${fmt(x.tax)}　守恆差 ${r.gap}　別的單位最大偏離 ${worst ? (names[worst.k] || worst.k) + " " + fmt(worst.d) : "-"}`);
    const states = Object.keys(wh.st).map(k => `${(names[k] || k).slice(0, 4)}:${S[wh.st[k].s][0]}`).join(" "); console.log("   各單位狀態 " + states);
  }
}
