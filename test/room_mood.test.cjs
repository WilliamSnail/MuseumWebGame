// 房間效果的狀態（shared/room_mood.js）：node test/room_mood.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({}); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, e.message); } };

T("沒資料、壞資料都回平常的樣子，不丟錯", G => {
  const r = G.roomMood(null); assert.strictEqual(r.light.warm, 0); assert.strictEqual(r.crowd, 0); assert.strictEqual(r.omen, 0); assert.strictEqual(r.flags.bunting, null); assert.strictEqual(r.hide, false);
  const b = G.roomMood({ mood: "x", hall: {}, idx: NaN, squeeze: null, sanLow: "a", unrest: 5, own: 3 }); assert.strictEqual(b.crowd, 0); assert.strictEqual(b.omen, 0);
});
T("燈光：冷清偏冷、熱絡偏暖、沸騰更暖；吃緊和景氣差讓整體更暗", G => {
  const w = m => G.roomMood({ mood: m }).light.warm;
  assert.ok(w(10) < 0 && w(45) === 0 && w(70) > 0 && w(95) > w(70));
  assert.ok(G.roomMood({ squeeze: 0.6 }).light.dim > 0 && G.roomMood({ idx: -0.8 }).light.dim > 0 && G.roomMood({}).light.dim === 0);
});
T("warm 直接給就不看 mood（銀行用景氣）", G => { assert.strictEqual(G.roomMood({ mood: 5, warm: 0.4 }).light.warm, 0.4); assert.strictEqual(G.roomMood({ warm: 9 }).light.warm, 1); });
T("heat：冷清 0、平常 1、熱絡 2、沸騰 3；沒資料 1", G => { const h = m => G.roomMood({ mood: m }).heat; assert.deepStrictEqual([h(10), h(45), h(70), h(95), G.roomMood({}).heat], [0, 1, 2, 3, 1]); });
T("人影：0～2 人沒有、3～20 人少、21～60 人中、60 人以上封頂；越多人越多影子", G => {
  const c = n => G.roomMood({ hall: n }).crowd;
  assert.strictEqual(c(0), 0); assert.strictEqual(c(2), 0); assert.ok(c(3) >= 3 && c(20) <= 7 && c(21) >= 8 && c(60) <= 16 && c(61) === G.RM.crowdMax && c(500) === G.RM.crowdMax);
  for (let n = 3; n < 80; n++) assert.ok(c(n + 1) >= c(n), "不會變少 " + n);
});
T("旗幟：政策、活動、兩個都有", G => {
  const f = (p, e) => G.roomMood({ policy: p, event: e }).flags.bunting;
  assert.strictEqual(f(false, false), null); assert.strictEqual(f(true, false), "policy"); assert.strictEqual(f(false, true), "event"); assert.strictEqual(f(true, true), "both");
});
T("怪影子：理智低、集團不安才有；太少就是 0；很多封頂 1", G => {
  assert.strictEqual(G.roomMood({ sanLow: 1 }).omen, 0, "壹位低一點點不夠");
  assert.ok(G.roomMood({ sanLow: 3 }).omen > 0 && G.roomMood({ unrest: [5, 3, 1, 1] }).omen > 0);
  assert.strictEqual(G.roomMood({ sanLow: 50, unrest: [0, 0, 9, 9] }).omen, 1);
});
T("館友自己的理智效果優先：熄燈、昏倒、逃跑、發作 → 房間效果全收起；黑影出現 → 怪影子不出現", G => {
  for (const k of ["lightsOut", "faint", "flee", "bout"]) { const r = G.roomMood({ sanLow: 5, mood: 90, hall: 30, own: { [k]: true } }); assert.strictEqual(r.hide, true, k); assert.strictEqual(r.omen, 0, k); }
  const s = G.roomMood({ sanLow: 5, own: { shadow: true } }); assert.strictEqual(s.hide, false); assert.strictEqual(s.omen, 0); assert.ok(G.roomMood({ sanLow: 5 }).omen > 0);
});
T("組合：理智低＋房間冷清 → 又暗又冷又有影子；熄燈時全收起", G => {
  const d = { sanLow: 4, mood: 5, hall: 2, squeeze: 0.4, idx: -0.6 };
  const r = G.roomMood(d); assert.ok(r.light.warm < 0 && r.light.dim > 0 && r.omen > 0 && !r.hide);
  const o = G.roomMood(Object.assign({}, d, { own: { lightsOut: true } })); assert.ok(o.hide && o.omen === 0);
});
console.log(`房間效果：${pass} 過，${fail} 沒過`); process.exit(fail ? 1 : 0);
