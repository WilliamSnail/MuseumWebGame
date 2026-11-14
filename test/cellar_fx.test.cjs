// 手作坊顯示的「地下效果」（shared/logic3.js cellarPartFx 等）要跟地下真的在算的壹樣：node test/cellar_fx.test.cjs
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(load()); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
const mk = pick => ({ pick: Object.assign({ 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" }, pick), perfect: false });

T("巫師帽、觸手帽、紳士帽、倒立的數字，就是 teamPower、memberPower 實際加的", G => {
  const base = G.teamPower(null, [mk({}), mk({}), mk({})], null).total;
  assert.strictEqual(G.teamPower(null, [mk({ 帽子: "巫師帽" }), mk({}), mk({})], null).total - base, G.NUM.cellarFx.wizard);
  assert.strictEqual(G.teamPower(null, [mk({ 帽子: "觸手帽" }), mk({}), mk({})], null).total - base, G.NUM.cellarFx.tentacle);
  assert.strictEqual(G.memberPower(mk({ 姿勢: "倒立" }), null) - G.memberPower(mk({}), null), G.NUM.cellarFx.handstand);
  const t = fx => fx.map(f => f.text).join("|");
  assert.ok(t(G.cellarPartFx("帽子", "巫師帽")).includes(`+${G.NUM.cellarFx.wizard}`));
  assert.ok(t(G.cellarPartFx("帽子", "紳士帽")).includes(`+${G.NUM.cellarFx.gent}`));
  assert.ok(t(G.cellarPartFx("姿勢", "比讚")).includes(`+${G.NUM.fight.cheer}`));
});
T("沒有地下效果的選項回空；稀有度沒擲就不算進強度；擲了才算", G => {
  assert.deepStrictEqual(Array.from(G.cellarPartFx("帽子", "館員帽")), []);
  assert.strictEqual(G.cellarFxShort("帽子", "館員帽"), "");
  const a = G.cellarPickFx(mk({ 顏色: "橘" }).pick), b = G.cellarPickFx(mk({ 顏色: "橘", 稀有度: "傳說級稀有" }).pick, { rarityKnown: true, perfect: true });
  assert.strictEqual(a.power, G.COLOR_POWER["橘"]);
  assert.strictEqual(b.power, G.CELLAR_POWER["傳說級稀有"] + G.CELLAR_POWER.perfect + G.COLOR_POWER["橘"]);
});
console.log(`${pass} passed, ${fail} failed（手作坊的地下效果）`);
process.exit(fail ? 1 : 0);
