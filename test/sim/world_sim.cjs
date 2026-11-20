// 改世界經濟的數字之前，先跑壹遍預覽：node test/sim/world_sim.cjs [--days 30] [--b 0] [--set casino.npcSpend.dayPct=12]（npm run world:sim -- …）。決定 0086。
// 用真的程式（casHouseFix 的換日成長、casNpcSpend 的 NPC 和散客花錢、wu 分帳）跑 N 天，印：
//   已知世界的錢和每天變多少、每個單位的帳上分類（起點→終點）、每天 NPC 和散客花多少、各集團出多少、莊家和博物館資金變多少、守恆（單位加公共 ＝ 已知世界）。
// --scan：景氣 −1／0／+1 各跑 30、90 天，印壹張表（W5 連動）。
// --b 景氣（−1～1，每天都當這個值）；--set 路徑=值（NUM 底下，可以多次，例如 casino.world.growBase=3000000）；--days 天數（預設 30，最多 365）。
// 擋：守恆差不是 0、公共是負的、莊家或博物館資金變負 → exit 1。只讀 repo 的檔案，不碰正式站。
const fs = require("fs"), path = require("path");
const L = require("../../tools/content/world_lib.cjs");
function parse(argv) { const o = { set: [] }; for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a === "--set") o.set.push(argv[++i]); else if (a === "--scan") o.scan = true; else if (a === "--mk") o.mk = argv[++i]; else if (a.startsWith("--")) o[a.slice(2)] = argv[++i]; } return o; }
const add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const fmt = n => Math.round(n).toLocaleString("en-US");
// 回傳 { days, rows, ... }
function sim(G, npcs, opts = {}) {
  const days = Math.max(1, Math.min(365, +opts.days || 30)), b = Math.max(-1, Math.min(1, +opts.b || 0));
  for (const kv of opts.set || []) { const m = /^([\w.]+)=(.+)$/.exec(kv); if (!m) throw new Error(`--set 要寫成 路徑=值：${kv}`); const parts = m[1].split("."); let o = G.NUM; for (const p of parts.slice(0, -1)) { if (!o || typeof o[p] !== "object") throw new Error(`NUM 底下沒有 ${m[1]}`); o = o[p]; } const k = parts[parts.length - 1]; if (!(k in o)) throw new Error(`NUM 底下沒有 ${m[1]}`); o[k] = isNaN(+m[2]) ? m[2] : +m[2]; }
  if (opts.mk == null) G.NUM.casino.worldDoc.market.on = false; // 沒用 --mk：景氣分市場關掉，照舊用景氣 b 驅動（決定 0121 之前的行為，舊的測試和 --scan 看這個）
  G.NUM.casino.grants = []; // 已經撥過的撥款不算（正式站撥過了）
  const start = "2026-11-16", list = npcs.filter(n => n.kind !== "trace");
  const h = G.casHouseFix(G.casHouseNew(), start).house; h.econ = { b, yoy: opts.yoy == null ? 14.36 : +opts.yoy };
  if (opts.gov0) h.gov = +opts.gov0; /* 模擬：政府帳起始餘額（決定 0140） */ const w0 = h.world, a0 = G.wuAmounts(h), bank0 = h.bankroll, bud0 = h.budget, spent = { total: 0, byUnit: {} };
  const perDay = [];
  for (let i = 0; i < days; i++) {
    const d = add(start, i); if (opts.govDaily && i > 0) h.gov = (h.gov || 0) + Math.floor(+opts.govDaily); /* 模擬：館友每天交的稅（NPC 的稅程式自己會進） */ if (i > 0) { h.econ = { b, yoy: opts.yoy == null ? 14.36 : +opts.yoy }; G.casHouseFix(h, d); }
    if (opts.mk != null && h.mk) { for (const k of Object.keys(h.mk.b)) h.mk.b[k] = +opts.mk; } /* 景氣分市場：--mk 數字 ＝ 每個市場都固定這個景氣（模擬用） */ const before = h.world; G.wmWriteVisit(h, d, list); G.casNpcSpend(h, d, "sim" + i, list, G.npcCounters(h.npcc));
    if (opts.slots) { // 整天陸續發生（決定 0120）：每 15 分鐘碰壹次莊家，記每格集團之間搬了多少（house.led.units 的累計差）
      const sumU = () => Object.values((h.led && h.led.units) || {}).reduce((x, y) => x + y, 0), t0 = Date.parse(d + "T05:00:00+08:00"), row = [];
      for (let k = 0; k < 96; k++) { const b0 = sumU(); G.wtAdvance(h, d, t0 + k * 900000 + 1000); row.push(sumU() - b0); }
      opts.slots.push({ d, row });
    }
    const N = h.npcs && h.npcs.day === d ? h.npcs : null, t = N ? N.ticket + N.shop + N.crowd.ticket + N.crowd.shop : 0;
    spent.total += t; if (N && N.byUnit) for (const k of Object.keys(N.byUnit)) spent.byUnit[k] = (spent.byUnit[k] || 0) + N.byUnit[k];
    perDay.push({ d, spent: t, world: h.world, out: before - h.world });
  }
  const a1 = G.wuAmounts(h), sum = o => Object.values(o).reduce((x, y) => x + y, 0);
  const bals = Object.values((h.npcw && h.npcw.bal) || {}), wal = { total: bals.reduce((x, y) => x + y, 0), n: bals.length, min: bals.length ? Math.min(...bals) : 0, max: bals.length ? Math.max(...bals) : 0, moves: ((h.npcw && h.npcw.ev) || []).filter(e => e.t === "move").length, lays: ((h.npcw && h.npcw.ev) || []).filter(e => e.t === "lay").length };
  const sv = Object.values((h.npcw && h.npcw.san) || {}); wal.san = { n: sv.length, min: sv.length ? Math.min(...sv) : 70, max: sv.length ? Math.max(...sv) : 70, low: sv.filter(x => x < 30).length };
  return { gov: h.gov, wal, days, b, w0, w1: h.world, a0, a1, spent, bank: h.bankroll - bank0, budget: h.budget - bud0, gap: sum(a1) - h.world, perDay, house: h };
}
// 景氣 −1／0／+1 各跑 30 和 90 天（W5 連動）：NPC 每天花多少、各狀態幾個集團、最低倍率、有沒有裁員、莊家和博物館資金撐不撐得住。回傳 [{ b, days, perDay, states, minMult, layoff, ok }]
function scan(load, npcs, set = []) {
  const out = [];
  for (const days of [30, 90]) for (const b of [-1, 0, 1]) {
    const G = load(), r = sim(G, npcs, { days, b, set }), st = { normal: 0, cut: 0, squeeze: 0, layoff: 0 };
    const w = r.house.wh; if (w) Object.values(w.st).forEach(s => { st[s.s]++; });
    const mult = w ? Object.keys(w.st).map(k => G.whMult(r.house, k)) : [1];
    out.push({ b, days, wallet: r.wal, perDay: r.spent.total / days, states: st, minMult: Math.min(...mult), layoff: st.layoff, ok: r.gap === 0 && r.a1.pub >= 0 && r.house.bankroll >= 0 && r.house.budget >= 0 });
  }
  return out;
}
module.exports = { sim, scan };
if (require.main === module) {
  try {
    const o = parse(process.argv.slice(2)), { load } = require("../load_shared.cjs"), G = load({ __realMoney: true }), npcs = L.readNpcs();
    if (o.scan !== undefined) { // 景氣 −1／0／+1 各跑 30、90 天
      const rows = scan(() => load({ __realMoney: true }), npcs, o.set); console.log("天數　景氣　NPC 每天花　一般／減薪／緊縮／裁員　最低倍率　守恆和不破產");
      rows.forEach(x => console.log(`${x.days}　${x.b}　${fmt(x.perDay)}　${x.states.normal}／${x.states.cut}／${x.states.squeeze}／${x.states.layoff}　×${x.minMult.toFixed(2)}　${x.ok ? "✓" : "✗"}`));
      if (rows.some(x => !x.ok)) process.exit(1); console.log("✓ 六種組合都守恆、沒破產"); process.exit(0);
    }
    const r = sim(G, npcs, { days: o.days, b: o.b, set: o.set, mk: o.mk }), names = {}; L.readUnits().forEach(u => { names[u.id] = u.name; }); names["u-household"] = "家計"; names.pub = "公共";
    console.log(`模擬 ${r.days} 天，景氣 ${r.b}：已知世界 ${fmt(r.w0)} → ${fmt(r.w1)}（${r.w1 >= r.w0 ? "+" : ""}${fmt(r.w1 - r.w0)}）`);
    console.log(`NPC 和散客一共花 ${fmt(r.spent.total)}，平均每天 ${fmt(r.spent.total / r.days)}；莊家 ${r.bank >= 0 ? "+" : ""}${fmt(r.bank)}、博物館資金 ${r.budget >= 0 ? "+" : ""}${fmt(r.budget)}`);
    console.log("單位：起點 → 終點（變多少）　其中 NPC 花了");
    Object.keys(r.a1).forEach(k => console.log(`  ${names[k] || k}：${fmt(r.a0[k])} → ${fmt(r.a1[k])}（${r.a1[k] - r.a0[k] >= 0 ? "+" : ""}${fmt(r.a1[k] - r.a0[k])}）${r.spent.byUnit[k] ? "　花 " + fmt(r.spent.byUnit[k]) : ""}`));
    console.log(`NPC 錢包：${r.wal.n} 位、合計 ${fmt(r.wal.total)}（最少 ${fmt(r.wal.min)}、最多 ${fmt(r.wal.max)}）；最近換工作紀錄：被裁 ${r.wal.lays} 次、換到新工作 ${r.wal.moves} 次`);
    console.log(`NPC 理智（不是 70 的 ${r.wal.san.n} 位）：最低 ${r.wal.san.min}、最高 ${r.wal.san.max}、低於 30 的 ${r.wal.san.low} 位`);
    if (r.house.wh && r.house.wh.unrest) console.log("集團集體不安（平常 " + G.NUM.casino.worldDoc.unrest.start + "）：" + Object.keys(r.house.wh.unrest).map(k => `${names[k] || k} ${G.whUnrest(r.house, k)}`).join("　") + (r.house.wh.mood ? `　｜　今天的展廳氣氛 ${r.house.wh.mood.v}` : ""));
    const wh = r.house.wh, S = { normal: "一般", cut: "減薪", squeeze: "緊縮", layoff: "裁員" };
    if (wh && wh.st) { console.log("各集團現在的狀態（健康值 h → 預算倍率）："); Object.keys(wh.st).forEach(k => console.log(`  ${names[k] || k}：${S[wh.st[k].s]}（h ${wh.h[k]} → ×${G.whMult(r.house, k).toFixed(2)}）`)); if (wh.ev.length) console.log("換過狀態：" + wh.ev.map(e => `${e.day} ${names[e.unit] || e.unit}→${S[e.to]}`).join("、")); }
    const bad = []; if (r.gap !== 0) bad.push(`守恆差 ${r.gap}（單位加公共應該等於已知世界）`); if (r.a1.pub < 0) bad.push(`公共是負的 ${fmt(r.a1.pub)}`); if (r.house.bankroll < 0 || r.house.budget < 0) bad.push("莊家或博物館資金變負");
    if (bad.length) { bad.forEach(m => console.log("✗ " + m)); process.exit(1); }
    console.log("✓ 守恆（單位加公共 ＝ 已知世界）、公共不為負、莊家和博物館資金沒破產");
  } catch (e) { console.error("✗ " + e.message); process.exit(1); }
}
