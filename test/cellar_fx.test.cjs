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
  assert.deepStrictEqual(Array.from(G.cellarPartFx("帽子", "沒有")), []);
  assert.strictEqual(G.cellarFxShort("帽子", "沒有"), "");
  const a = G.cellarPickFx(mk({ 顏色: "橘" }).pick), b = G.cellarPickFx(mk({ 顏色: "橘", 稀有度: "傳說級稀有" }).pick, { rarityKnown: true, perfect: true });
  assert.strictEqual(a.power, G.COLOR_POWER["橘"]);
  assert.strictEqual(b.power, G.CELLAR_POWER["傳說級稀有"] + G.CELLAR_POWER.perfect + G.COLOR_POWER["橘"]);
});
T("疊加（決定 0109）：比讚、巫師帽帶幾隻算幾份、最多 2 份；觸手帽只算 1 份；招式次數每多 1 隻 +1、最多 2、觸手帽 1、完美 2", G => {
  const S = G.NUM.cellarFx.stack, W = G.NUM.cellarFx.wizard, base = G.teamPower(null, [mk({}), mk({}), mk({})], null).total, d = team => G.teamPower(null, team, null).total - base;
  assert.strictEqual(d([mk({ 帽子: "巫師帽" }), mk({}), mk({})]), W);
  assert.strictEqual(d([mk({ 帽子: "巫師帽" }), mk({ 帽子: "巫師帽" }), mk({})]), W * Math.min(2, S.wizard));
  assert.strictEqual(d([mk({ 帽子: "巫師帽" }), mk({ 帽子: "巫師帽" }), mk({ 帽子: "巫師帽" })]), W * S.wizard, "第三頂不算");
  assert.strictEqual(d([mk({ 姿勢: "比讚" }), mk({}), mk({})]), 3);
  assert.strictEqual(d([mk({ 姿勢: "比讚" }), mk({ 姿勢: "比讚" }), mk({})]), 3 * S.like, "兩隻比讚 ×2");
  assert.strictEqual(d([mk({ 姿勢: "比讚" }), mk({ 姿勢: "比讚" }), mk({ 姿勢: "比讚" })]), 3 * S.like);
  assert.strictEqual(d([mk({ 帽子: "觸手帽" }), mk({ 帽子: "觸手帽" }), mk({ 帽子: "觸手帽" })]), G.NUM.cellarFx.tentacle, "觸手帽疊了也只算壹份");
  const seat = (picks, perfect) => ({ id: "a", pepes: picks.map(p => ({ pick: mk(p).pick, power: 3, down: false, perfect: !!perfect })), used: {}, san: 10 });
  assert.strictEqual(G.fightMoveUses(seat([{ 姿勢: "斯拉夫蹲" }]), "squat"), 1);
  assert.strictEqual(G.fightMoveUses(seat([{ 姿勢: "斯拉夫蹲" }, { 姿勢: "斯拉夫蹲" }]), "squat"), 2, "兩隻蹲擋兩次");
  assert.strictEqual(G.fightMoveUses(seat([{ 姿勢: "斯拉夫蹲" }, { 姿勢: "斯拉夫蹲" }, { 姿勢: "斯拉夫蹲" }]), "squat"), 2, "最多 2 次");
  assert.strictEqual(G.fightMoveUses(seat([{ 帽子: "觸手帽" }, { 帽子: "觸手帽" }]), "tentacle"), 1, "觸手帽 1 次");
  assert.strictEqual(G.fightMoveUses(seat([{ 帽子: "觸手帽" }], true), "tentacle"), 2, "完美觸手帽 2 次");
  assert.strictEqual(G.fightMoveUses(seat([{ 帽子: "棒球帽" }], true), "cap"), 2);
});
console.log(`${pass} passed, ${fail} failed（手作坊的地下效果）`);
process.exit(fail ? 1 : 0);
