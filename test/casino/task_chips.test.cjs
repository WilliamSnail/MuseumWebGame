// 每日任務、每週積分的籌碼（決定 0146，從莊家出）：node test/casino/task_chips.test.cjs（npm test 也會跑）
// 存檔說做完＋伺服器看到做過才付、壹天最多 2 個、里程碑壹格壹次、禮盒、莊家不夠先不付（絕不變負）、守恆
const assert = require("assert");
const { load } = require("../load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const D = "2026-11-24";
const fresh = G => ({ w: G.casWalletFix(G.casWalletNew(), D), house: G.casHouseFix(G.casHouseNew(), D).house });
const total = (w, h) => w.chips + h.budget;

T("兩邊都有才付：只說做完、伺服器沒看到，或只看到、存檔沒說，都不付", G => {
  const { w, house } = fresh(G), c0 = w.chips;
  assert.strictEqual(G.casTaskChips(w, house, D, { due: { casino: 1 }, acts: {} }).chips, 0);
  assert.strictEqual(G.casTaskChips(w, house, D, { due: {}, acts: { casino: 1 } }).chips, 0);
  assert.strictEqual(w.chips, c0);
  const r = G.casTaskChips(w, house, D, { due: { casino: 1 }, acts: { casino: 1 } });
  assert.strictEqual(r.chips, G.NUM.story.pts.taskChip); assert.strictEqual(w.chips, c0 + r.chips);
});
T("同一種壹天只付壹次；壹天最多 taskChipDay 個", G => {
  const { w, house } = fresh(G), C = G.NUM.story.pts, all = { casino: 1, bank: 1, food: 1, visit: 1, gift: 1 };
  const r = G.casTaskChips(w, house, D, { due: all, acts: all });
  assert.strictEqual(r.items.length, C.taskChipDay); assert.strictEqual(r.chips, C.taskChip * C.taskChipDay);
  assert.strictEqual(G.casTaskChips(w, house, D, { due: all, acts: all }).chips, 0);
  const r2 = G.casTaskChips(w, house, G.addDays(D, 1), { due: all, acts: all }); assert.strictEqual(r2.items.length, C.taskChipDay); // 隔天再拿
});
T("守恆：錢包加博物館資金不變，來源記 taskChips", G => {
  const { w, house } = fresh(G), t0 = total(w, house), all = { casino: 1, bank: 1 };
  G.casTaskChips(w, house, D, { due: all, acts: all });
  assert.strictEqual(total(w, house), t0);
  assert.strictEqual(house.led.flow.taskChips, -2 * G.NUM.story.pts.taskChip); // 池子的角度：負＝從博物館資金出去
});
T("里程碑：固定籌碼壹格壹次；禮盒照權重抽、記 taskWeek", G => {
  const { w, house } = fresh(G), C = G.NUM.story.pts, t0 = total(w, house), c0 = w.chips;
  const miles = [{ key: "2026-W48:400", chips: 200000, box: 0 }, { key: "2026-W48:300", chips: 0, box: 1 }];
  const r = G.casTaskChips(w, house, D, { due: {}, acts: {}, miles, rng: () => 0 }); // rng 0 → 第壹種盒子
  assert.strictEqual(r.chips, 200000 + C.boxes[0].chips); assert.strictEqual(w.chips, c0 + r.chips);
  assert.strictEqual(G.casTaskChips(w, house, D, { due: {}, acts: {}, miles, rng: () => 0 }).chips, 0, "領過不再付");
  assert.strictEqual(total(w, house), t0);
  assert.strictEqual(house.led.flow.taskWeek, -r.chips);
  const hi = fresh(G); const rh = G.casTaskChips(hi.w, hi.house, D, { due: {}, acts: {}, miles: [{ key: "x:300", chips: 0, box: 1 }], rng: () => 0.9999 });
  assert.strictEqual(rh.chips, C.boxes[C.boxes.length - 1].chips); // 最大的盒子
});
T("博物館資金不夠：先不付、不記，下次補；基金不會變負", G => {
  const { w, house } = fresh(G), c0 = w.chips; house.budget = 10000;
  const r = G.casTaskChips(w, house, D, { due: { casino: 1 }, acts: { casino: 1 }, miles: [{ key: "a:300", chips: 0, box: 1 }], rng: () => 0 });
  assert.strictEqual(r.chips, 0); assert.ok(r.short); assert.strictEqual(w.chips, c0); assert.strictEqual(house.budget, 10000);
  house.budget = 1e9;
  const r2 = G.casTaskChips(w, house, D, { due: { casino: 1 }, acts: { casino: 1 }, miles: [{ key: "a:300", chips: 0, box: 1 }], rng: () => 0 });
  assert.ok(r2.chips > 0 && !r2.short); assert.ok(house.budget >= 0);
});
T("壞資料不丟錯（w.tk 不是物件）", G => {
  const { w, house } = fresh(G); w.tk = "壞"; const r = G.casTaskChips(w, house, D, { due: { bank: 1 }, acts: { bank: 1 } });
  assert.strictEqual(r.chips, G.NUM.story.pts.taskChip);
});
console.log(`task_chips：${pass} 過，${fail} 沒過`);
process.exit(fail ? 1 : 0);
