// 每日任務活躍積分（決定 0146）：node test/task_points.test.cjs（npm test 也會跑）
// 一週 2026-W48（新制 6 個任務／天），用 act 類的任務（storyAct）做：每天封頂 120、補做進那天的桶子、里程碑、「拿滿 120 多一份」、舊制的天不受影響
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 3).join("\n    ")); } };
const MON = "2026-11-23";
// 一天 6 個任務：都是 act 類（做過了的紀錄就算），積分 15+20+20+25+30+20 = 130（拿 120 要 6 個裡的 5 個以上）
const KINDS = ["hug2", "stockLook", "lesson", "visit", "gift", "bank"]; // 種類在下面換成真的
function lib(G, dayKinds) {
  const files = { "2026-W48/week.json": { title: "測試週", theme: "t", summary: [], lines: [{ id: "l", name: "線", kind: "week" }], weekly: [], weeklyBonus: {} } };
  for (let n = 1; n <= 7; n++) files[`2026-W48/d${n}.json`] = { day: n, date: G.addDays(MON, n - 1), books: [], daily: dayKinds.map((k, i) => ({ id: `d${n}${i}`, kind: k })) };
  return G.storyLibrary(files);
}
const K6 = ["stockLook", "lesson", "visit", "gift", "bank", "casino"]; // 15、20、25、30、20、20 ＝ 130
const setup = (G, kinds = K6) => { const P = G.newProfile("challenge"); G.ensureDay(P, MON); const L = lib(G, kinds); return { P, L, W: (d) => G.storyWeekAt(L, "2026-W48", d) }; };
const doAll = (G, P, W, day, kinds) => { kinds.forEach(k => G.storyAct(P, k, day)); G.syncStory(P, W, day); };

T("新制：一天 6 個任務、任務的獎勵照積分給", G => {
  const { W } = setup(G), w = W(MON), d = w.days[0];
  assert.strictEqual(d.daily.length, 6); assert.ok(G.ptsDay(d));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(d.daily[1].reward.mood)), 2); // lesson 20 分：心情 2
  assert.strictEqual(G.taskPts(d.daily[3]), 30);
});
T("每天最多算 120 分", G => {
  const { P, W } = setup(G), w = W(MON);
  doAll(G, P, w, MON, ["stockLook", "lesson", "visit", "gift", "bank", "casino"]);
  const S = G.storyState(P);
  assert.strictEqual(G.dayPts(S, w.days[0]), 120); // 130 → 封頂 120
  assert.strictEqual(G.weekPts(S, w), 120);
});
T("storyAct 同一天同一種只記一次、自由模式不記", G => {
  const { P } = setup(G);
  assert.strictEqual(G.storyAct(P, "casino", MON), true);
  assert.strictEqual(G.storyAct(P, "casino", MON), false);
  assert.strictEqual(G.storyAct(P, "make", MON), false); // 不是 act 類
  const F = G.newProfile("free"); assert.strictEqual(G.storyAct(F, "casino", MON), false);
});
T("拿滿 120：當天做完才有「多壹份」，補做的沒有", G => {
  const { P, W } = setup(G);
  let w = W(MON); doAll(G, P, w, MON, ["stockLook", "lesson", "visit", "gift", "bank"]); // 15+20+25+30+20 = 110 還差
  assert.strictEqual(G.dayBonusState(P, w, 1), "wait");
  G.storyAct(P, "casino", MON); G.syncStory(P, w, MON);
  assert.strictEqual(G.dayBonusState(P, w, 1), "ready");
  // 第 2 天沒做，第 3 天補第 2 天的：算積分、不給多壹份
  const d3 = G.addDays(MON, 2); w = W(d3);
  ["stockLook", "lesson", "visit", "gift", "bank", "casino"].forEach(k => G.storyAct(P, k, d3)); G.syncStory(P, w, d3);
  const S = G.storyState(P);
  assert.strictEqual(G.dayPts(S, w.days[0]), 120);
  assert.strictEqual(G.dayPts(S, w.days[1]), 120);
  assert.strictEqual(G.dayPts(S, w.days[2]), 120);
  assert.strictEqual(G.dayBonusState(P, w, 2), "late");
});
T("里程碑：到分數才能領、領過不能再領、獎勵進背包和存檔", G => {
  const { P, W } = setup(G);
  let w = W(MON), S;
  for (let i = 0; i < 4; i++) { const d = G.addDays(MON, i); w = W(d); doAll(G, P, w, d, K6); }
  S = G.storyState(P);
  assert.strictEqual(G.weekPts(S, w), 480);
  let v = G.milesView(P, w).map(x => x.state);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(v)), ["ready", "ready", "ready", "ready", "wait"]);
  const insp0 = P.insp, st0 = S.stamps;
  const r = G.claimMile(P, w, 200, "2026-11-26");
  assert.ok(r.ok); assert.strictEqual(P.insp, insp0 + 3);
  assert.strictEqual(G.claimMile(P, w, 200, "2026-11-26").ok, false);
  const r3 = G.claimMile(P, w, 300, "2026-11-26"); assert.ok(r3.ok && r3.box === 1 && G.storyState(P).stamps === st0 + 1);
  const r4 = G.claimMile(P, w, 400, "2026-11-26"); assert.ok(r4.ok && r4.chips === 200000);
  assert.strictEqual(G.claimMile(P, w, 500, "2026-11-26").ok, false); // 480 分，還沒到 500
  const d5 = G.addDays(MON, 4); w = W(d5); doAll(G, P, w, d5, K6);
  const r5 = G.claimMile(P, w, 500, d5); assert.ok(r5.ok && r5.box === 1 && r5.reward.items.length === 1);
});
T("舊制的天（3 個任務）：沒有積分條、照舊全做完多壹份", G => {
  const files = { "2026-W47/week.json": { title: "t", theme: "t", summary: [], lines: [{ id: "l", name: "線", kind: "week" }], weekly: [], weeklyBonus: {} } };
  files["2026-W47/d1.json"] = { day: 1, date: "2026-11-16", books: [], daily: [{ id: "a", kind: "hug" }, { id: "b", kind: "sign" }, { id: "c", kind: "board" }] };
  const P = G.newProfile("challenge"); G.ensureDay(P, "2026-11-16");
  const W = G.storyWeekAt(G.storyLibrary(files), "2026-W47", "2026-11-16");
  assert.ok(!G.ptsDay(W.days[0])); assert.deepStrictEqual(JSON.parse(JSON.stringify(G.milesView(P, W))), []);
  ["sign", "board"].forEach(k => G.storyAct(P, k, "2026-11-16")); G.syncStory(P, W, "2026-11-16");
  assert.strictEqual(G.dayBonusState(P, W, 1), "wait"); // hug 還沒做
});
T("賭場、銀行這類有籌碼的任務做完會記 chipDue，其他不記", G => {
  const { P, W } = setup(G), w = W(MON);
  doAll(G, P, w, MON, ["stockLook", "casino"]);
  const S = G.storyState(P);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(S.chipDue[MON])), { casino: 1 });
});
console.log(`task_points：${pass} 過，${fail} 沒過`);
process.exit(fail ? 1 : 0);
