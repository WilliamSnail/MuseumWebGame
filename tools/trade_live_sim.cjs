// 集團之間的交易「整天陸續發生」的模擬（決定 0120）：node tools/trade_live_sim.cjs [--days 90]
// 同樣的天數、景氣 −1／0／+1，live 關（換日壹次入帳）和 live 開（每 15 分鐘補算壹格）各跑壹次，比：
//   每個集團最後的狀態、帳上的錢（應該幾乎壹樣）、每天集團之間的總流量；以及 live 開時壹天 96 格的分布（有動的格數、最大壹格占全天幾 %）。
const L = require("./world_lib.cjs"), { sim } = require("./world_sim.cjs"), { load } = require("../test/load_shared.cjs");
const days = +(process.argv[process.argv.indexOf("--days") + 1]) || 90, fmt = n => Math.round(n).toLocaleString("en-US"), npcs = L.readNpcs();
const run = (live, b) => { const G = load({ __realMoney: true }); G.NUM.casino.worldDoc.trade.live = live; const slots = live ? [] : null; const r = sim(G, npcs, { days, b, slots }); const U = (r.house.led && r.house.led.units) || {}; return { r, G, slots, tot: Object.values(U).reduce((x, y) => x + y, 0), U }; };
for (const b of [-1, 0, 1]) {
  const A = run(false, b), B = run(true, b), wa = A.r.house.wh, wb = B.r.house.wh, S = { normal: "一", cut: "減", squeeze: "緊", layoff: "裁" };
  const st = w => Object.keys(w.st).map(k => S[w.st[k].s]).join(""), maxDiff = Math.max(...Object.keys(A.r.a1).map(k => Math.abs(A.r.a1[k] - B.r.a1[k])));
  console.log(`\n景氣 ${b}，${days} 天：集團之間搬的錢 關 ${fmt(A.tot)} / 開 ${fmt(B.tot)}；最後狀態 關 ${st(wa)} / 開 ${st(wb)}；各單位帳上最大差 ${fmt(maxDiff)}（已知世界 ${fmt(A.r.w1)}）；守恆差 ${B.r.gap}`);
  const rows = B.slots.map(x => x.row), act = rows.map(r => r.filter(v => v > 0).length), tot = rows.map(r => r.reduce((a, c) => a + c, 0)), mx = rows.map((r, i) => tot[i] > 0 ? Math.max(...r) / tot[i] : 0);
  const days0 = rows.filter((r, i) => tot[i] > 0).length;
  console.log(`  live 開：有搬錢的天 ${days0}/${days}，每天有動的格數 平均 ${(act.reduce((a, c) => a + c, 0) / days).toFixed(1)}／96，最大壹格占全天 平均 ${(100 * mx.reduce((a, c) => a + c, 0) / Math.max(1, days0)).toFixed(1)}%、最大 ${(100 * Math.max(...mx)).toFixed(1)}%`);
  const mon = B.slots.filter(x => new Date(x.d + "T00:00:00Z").getUTCDay() === 1).map(x => x.row), ev = mon.map(r => r.filter(v => v > 0).length);
  console.log(`  週一有動的格數 平均 ${(ev.reduce((a, c) => a + c, 0) / Math.max(1, ev.length)).toFixed(1)}；house.wh.tr 殘留 ${B.r.house.wh.tr ? "有" : "無"}；莊家文件 wh 大小 ${JSON.stringify(wb).length} B（關 ${JSON.stringify(wa).length} B）`);
}
