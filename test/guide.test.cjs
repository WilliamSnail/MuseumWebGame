// 新玩家的「下一步」（shared/guide.js）：node test/guide.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(load()); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
const fresh = G => { const P = G.newProfile("challenge"); G.ensureDay(P, "2026-11-08"); return P; };

T("新玩家：先去畫廊", G => { assert.strictEqual(G.nextStep(fresh(G)).room, "gallery"); });
T("看過畫、靈感夠：去手作坊做第壹隻", G => {
  const P = fresh(G); P.seen.portrait = 1; P.insp = G.NUM.costPepe + 4;
  assert.strictEqual(G.nextStep(P).room, "workshop");
});
T("看過畫、靈感不夠：再去畫廊", G => {
  const P = fresh(G); P.seen.portrait = 1; P.insp = 0;
  const s = G.nextStep(P); assert.strictEqual(s.room, "gallery"); assert.ok(s.why.includes("靈感"));
});
T("做過佩佩：去交委託", G => {
  const P = fresh(G); P.seen.portrait = 1; P.pepes["x"] = { n: 1 };
  assert.strictEqual(G.nextStep(P).room, "commission");
});
T("照順序走完：解鎖 → 展廳 → 抱枕 → 起源室 → 沒有了", G => {
  const P = fresh(G); P.seen.portrait = 1; P.pepes["x"] = { n: 1 }; P.done = 1;
  assert.strictEqual(G.nextStep(P).room, "workshop");
  P.unlockCount = 1; assert.strictEqual(G.nextStep(P).room, "hall");
  P.hall[0] = { kind: "pepe", key: "x" }; assert.strictEqual(G.nextStep(P).room, "pillow");
  P.pillows["p"] = 1; assert.strictEqual(G.nextStep(P).room, "origin");
  P.chaptersRead[0] = true; assert.strictEqual(G.nextStep(P), null);
});
T("自由模式不帶路", G => { const P = G.newProfile("free"); G.ensureDay(P, "2026-11-08"); assert.strictEqual(G.nextStep(P), null); });

console.log(`${pass} passed, ${fail} failed（下一步）`);
process.exit(fail ? 1 : 0);
