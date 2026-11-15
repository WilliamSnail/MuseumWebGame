// 世界經濟的名單檢查：node tools/world_check.cjs（npm test 會跑）。決定 0086、規劃 docs/世界經濟規劃.md 第 2、3 節。
// 檢查 content/world/units/*.json（單位的樹：id、parent、兩層加總、股票只掛一處、劇情單位）和 content/npc 的 job（每位 NPC 有隸屬、單位存在、每個集團至少一位）。
// 不改任何行為，只看檔案。別的檔可以 require：checkWorld({ units, npcs, stockIds })（test/world_check.test.cjs 用壞資料測）。
const { readUnits, readNpcs, checkWorld } = require("./world_lib.cjs");
function run() {
  const { load } = require("../test/load_shared.cjs"), G = load();
  const units = readUnits(), npcs = readNpcs(), errs = checkWorld({ units, npcs, stockIds: G.OUT_STOCKS.map(s => s.id) });
  return { errs, units, npcs };
}
module.exports = { run };
if (require.main === module) {
  const { errs, units, npcs } = run();
  if (errs.length) { errs.forEach(e => console.log("✗ " + e)); console.log(`\n${errs.length} 個問題`); process.exit(1); }
  console.log(`世界經濟名單：${units.length} 個單位、${npcs.filter(n => n.job).length} 位 NPC 有隸屬，都對。`);
}
