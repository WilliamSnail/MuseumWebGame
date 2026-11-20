// 各集團的健康值和狀態：node tools/check/world_health.cjs [--b 0] [--weeks 8]（npm run world:health -- …）。決定 0086（W5），規劃 docs/規劃/世界經濟規劃.md 第 4 節。
// 用真的程式（莊家換日 → whTick）從頭跑 weeks 週、景氣每天都當 b，印最後一天每個集團：健康值 h、這週狀態、NPC 預算倍率、連續低迷幾週、離緊縮／裁員還差幾週。
// 想看正式站現在的：請翊文同意後按固定動作 world-status（npm run fb -- world-status）。這支只讀 repo 的檔案。
//   --b 景氣（−1～1，預設 0）　--weeks 幾週（預設 8，最多 52）　--set 路徑=值（NUM 底下，可以多次）
//   exit 1：有集團的倍率低於下限、或健康值超出範圍（不該發生）。
const L = require("../content/world_lib.cjs");
const S = { normal: "一般", cut: "減薪", squeeze: "緊縮", layoff: "裁員" }; // 狀態名（statView 的 unitState 也是這幾個字）
function parse(argv) { const o = { set: [] }; for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a === "--set") o.set.push(argv[++i]); else if (a.startsWith("--")) o[a.slice(2)] = argv[++i]; } return o; }
// 回傳 { day, rows: [{ id, name, h, state, mult, low, toSqueeze, toLayoff }], events }
function rows(G, house, names = {}) {
  const C = G.NUM.casino.worldDoc.health, w = house.wh, out = [];
  if (!w || !w.st) return { day: null, rows: out, events: [] };
  for (const id of Object.keys(w.st)) {
    const s = w.st[id], h = w.h[id], low = s.low || 0, inLow = h < C.squeeze;
    const sv = G.statView("unitHealth", id, house), mv = G.statView("budgetMult", id, house);
    out.push({ id, name: names[id] || id, h, band: sv && sv.label, multBand: mv && mv.label, state: s.s, mult: G.whMult(house, id), low, toSqueeze: inLow ? Math.max(0, C.squeezeWeeks - low) : null, toLayoff: inLow ? Math.max(0, C.layoffWeeks - low) : null });
  }
  return { day: w.day, rows: out, events: w.ev || [] };
}
module.exports = { rows, S };
if (require.main === module) {
  try {
    const o = parse(process.argv.slice(2)), { load } = require("../../test/load_shared.cjs"), G = load({ __realMoney: true }), SM = require("../../test/sim/world_sim.cjs");
    const weeks = Math.max(1, Math.min(52, +o.weeks || 8)), r = SM.sim(G, L.readNpcs(), { days: weeks * 7, b: o.b, set: o.set }), names = {}; L.readUnits().forEach(u => { names[u.id] = u.name; });
    const x = rows(G, r.house, names), C = G.NUM.casino.worldDoc.health;
    console.log(`景氣 ${r.b}，跑 ${weeks} 週（到 ${x.day}）：`);
    console.log("集團　健康值 h　狀態　預算倍率　連續低迷（週）　離緊縮　離裁員");
    x.rows.forEach(t => console.log(`${t.name}　${t.h}（${t.band}）　${S[t.state]}　×${t.mult.toFixed(2)}　${t.low}　${t.toSqueeze == null ? "-" : t.toSqueeze + " 週"}　${t.toLayoff == null ? "-" : t.toLayoff + " 週"}`));
    if (x.events.length) console.log("換過狀態：" + x.events.map(e => `${e.day} ${names[e.unit] || e.unit}→${S[e.to]}`).join("、"));
    const bad = x.rows.filter(t => t.mult < C.floor - 1e-9 || t.h < C.min - 1e-9 || t.h > C.max + 1e-9);
    if (bad.length) { bad.forEach(t => console.log(`✗ ${t.name}：倍率或健康值超出範圍`)); process.exit(1); }
    console.log("✓ 倍率都在下限以上、健康值都在範圍內");
  } catch (e) { console.error("✗ " + e.message); process.exit(1); }
}
