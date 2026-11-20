// NPC 預算總表（每個集團）：node tools/content/world_budget.cjs [--unit g-daily]（npm run world:budget）。決定 0086，規劃 docs/規劃/世界經濟規劃.md 第 7 節。
// 每個集團：NPC 人數、perDay 加總、倍率後的預算（現在倍率 1）、壹天最多能花（每人 perDay × dayPct%，到館的第一天再加門票）、占全館每天上限（dayCap）的比例、
// 這個集團在已知世界的起始份額、照那個份額撐得了幾天。沒有單位的（學生、退休、自由業）算在家計。
// 擋：任何集團「最多能花 × 30 天」超過它的份額（撐不到 30 天）→ exit 1。全館加起來超過 dayCap 只是提醒（dayCap 本來就是擋總量的上限）。只讀 repo 的檔案。
const path = require("path");
const L = require("./world_lib.cjs");
function parse(argv) { const o = {}; for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith("--")) o[a.slice(2)] = argv[++i]; } return o; }
const fmt = n => Math.round(n).toLocaleString("en-US");
// 回傳 { rows, total, bad }（給測試用）。G 是載入的 shared；units、npcs 是讀進來的名單
function budget(G, units, npcs, opts = {}) {
  const S = G.NUM.casino.npcSpend, W = G.NUM.casino.world, HH = "u-household", days = opts.days || 30, mult = opts.mult == null ? 1 : opts.mult;
  const byId = new Map(units.map(u => [u.id, u])), top = id => { let u = byId.get(id), n = 0; while (u && u.parent != null && n++ < 50) u = byId.get(u.parent); return u ? u.id : null; };
  const rows = new Map();
  const row = (id, name, share) => { if (!rows.has(id)) rows.set(id, { id, name, share, npcs: 0, perDay: 0 }); return rows.get(id); };
  units.filter(u => u.parent == null).forEach(u => row(u.id, u.name, u.share)); row(HH, "家計", G.NUM.casino.worldDoc.household);
  for (const n of npcs) {
    if (n.kind === "trace" || !n.budget || !(n.budget.perDay > 0)) continue;
    const id = n.job && n.job.unit ? top(n.job.unit) : HH, r = rows.get(id) || row(id, id, 0);
    r.npcs++; r.perDay += n.budget.perDay;
  }
  const out = [...rows.values()].filter(r => !opts.unit || r.id === opts.unit).map(r => {
    const budgetDay = r.perDay * mult, maxSpend = Math.floor(budgetDay * S.dayPct / 100), pool = Math.floor(W.start * r.share);
    return Object.assign(r, { budgetDay, maxSpend, ofCap: maxSpend / S.dayCap, pool, lasts: maxSpend > 0 ? pool / maxSpend : Infinity });
  });
  const total = out.reduce((a, r) => a + r.maxSpend, 0), bad = out.filter(r => r.lasts < days).map(r => `${r.name}：最多每天花 ${fmt(r.maxSpend)}，份額 ${fmt(r.pool)} 只撐 ${r.lasts.toFixed(1)} 天（要 ≥ ${days} 天）`);
  return { rows: out, total, cap: S.dayCap, bad };
}
module.exports = { budget };
if (require.main === module) {
  const o = parse(process.argv.slice(2)), { load } = require("../../test/load_shared.cjs"), G = load({ __realMoney: true });
  const r = budget(G, L.readUnits(), L.readNpcs(), { unit: o.unit });
  console.log("集團　NPC　perDay 加總　倍率後預算　每天最多花　占全館上限　已知世界份額　撐幾天");
  r.rows.forEach(x => console.log(`${x.name}（${x.id}）　${x.npcs}　${fmt(x.perDay)}　${fmt(x.budgetDay)}　${fmt(x.maxSpend)}　${(x.ofCap * 100).toFixed(0)}%　${fmt(x.pool)}　${x.lasts === Infinity ? "不限" : x.lasts.toFixed(0)}`));
  console.log(`\n全館每人每天最多花加起來 ${fmt(r.total)}；全館每天上限（dayCap）${fmt(r.cap)}${r.total > r.cap ? "（總量被 dayCap 擋住，各人實際花的比這小）" : ""}`);
  if (r.bad.length) { r.bad.forEach(m => console.log("✗ " + m)); process.exit(1); }
  console.log("✓ 每個集團的份額都撐得過 30 天");
}
