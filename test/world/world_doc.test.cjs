// 世界文件（W2，決定 0086，shared/world.js）：node test/world/world_doc.test.cjs（npm test 也會跑）
// 換日第一次才記、同一天不重複、成長是兩次之間的差、壞資料變回預設、搬錢總和不變（預設關閉）、莊家不被改。
const assert = require("assert");
const { load } = require("../load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 3).join("\n    ")); } };
const hs = (G, day) => G.casHouseFix(G.casHouseNew(), day).house;

T("換日第一次才記：記下已知世界、備用池、合計、成長；同一天再跑什麼都不做；隔天又記", G => {
  const h = hs(G, "2026-11-16"), w0 = G.wdNew();
  const a = G.wdTick(w0, h, "2026-11-16"); assert.ok(!a.skip); assert.strictEqual(a.rec.day, "2026-11-16"); assert.strictEqual(a.rec.world, h.world); assert.strictEqual(a.rec.pool, 0); assert.strictEqual(a.rec.total, h.world); assert.strictEqual(a.rec.growth, null, "第一次沒有前一次可比");
  assert.strictEqual(a.w.day, "2026-11-16");
  const again = G.wdTick(a.w, h, "2026-11-16"); assert.ok(again.skip, "同一天不重複");
  G.casWorldGrow(h, 5000000); const b = G.wdTick(a.w, h, "2026-11-17"); assert.ok(!b.skip); assert.strictEqual(b.rec.growth, 5000000, "成長是兩次之間的差"); assert.strictEqual(b.rec.grown, a.rec.grown + 5000000);
  G.casWorldGrow(h, 1); G.casWorldGrow(h, 2); assert.strictEqual(G.wdTick(b.w, h, "2026-11-18").rec.growth, 3);
});
T("不改莊家：wdTick 前後莊家文件一樣", G => {
  const h = hs(G, "2026-11-16"), before = JSON.stringify(h); G.wdTick(G.wdNew(), h, "2026-11-16"); assert.strictEqual(JSON.stringify(h), before);
});
T("壞資料變回預設：沒有、字串、負的備用池、不是日期", G => {
  assert.strictEqual(G.wdFix(null).pool, 0); assert.strictEqual(G.wdFix("x").day, null); assert.strictEqual(G.wdFix({ pool: -5, day: "壞的", grownSeen: "abc" }).pool, 0);
  const f = G.wdFix({ pool: -5, day: "壞的", grownSeen: "abc" }); assert.strictEqual(f.day, null); assert.strictEqual(f.grownSeen, 0);
  assert.ok(G.wdTick(G.wdNew(), hs(G, "2026-11-16"), "不是日期").skip);
});
T("搬錢預設關閉：gateway 0 不搬；打開後 house.world 和備用池之間搬、總和不變、來回都對", G => {
  const h = hs(G, "2026-11-16"), w = G.wdNew(), total = h.world; assert.strictEqual(G.NUM.casino.worldDoc.gateway, 0);
  assert.strictEqual(G.wdSettle(h, w), 0); assert.strictEqual(h.world, total); assert.strictEqual(w.pool, 0);
  const g = Math.floor(total / 4); assert.strictEqual(G.wdSettle(h, w, g), total - g); assert.strictEqual(h.world, g); assert.strictEqual(w.pool, total - g); assert.strictEqual(G.wdTotal(h, w), total, "總和不變");
  h.world -= 1000; assert.strictEqual(G.wdTotal(h, w), total - 1000); assert.strictEqual(G.wdSettle(h, w, g), -1000, "館動用了，從備用池補回 gateway"); assert.strictEqual(h.world, g); assert.strictEqual(G.wdTotal(h, w), total - 1000);
  assert.strictEqual(G.wdSettle(h, w, total * 2), -(total - 1000 - g), "gateway 比總和大：全部回到莊家"); assert.strictEqual(w.pool, 0);
});
console.log(`世界文件：${pass} 過，${fail} 沒過`); process.exit(fail ? 1 : 0);
