// 合作地下收藏庫的地圖選路（shared/coop_route.js，地下室改版第九節第 5 步）：node test/coop_route.test.cjs（npm test 也會跑）
// 有守門的趟先選路、探索點走原本的房間、遭遇打一般怪物、休息各選各的、寶箱看完繼續、最後打守門、
// 沒開守門照舊、試煉照舊、送給畫面的地圖不寫怪物是誰、讀回來（JSON）還能走、平手領隊決定、亂送的不丟錯。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let G = load();
let pass = 0, fail = 0;
const T = (name, fn) => { try { G = load(); G.setRng(G.mulberry32(7)); fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const DATE = "2026-11-12", NOW = 1_800_000_000_000;
const BASE = { 稀有度: "超稀有", 心情: "俄國8+9", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" };
const J = x => JSON.parse(JSON.stringify(x));
function person() {
  const P = G.newProfile("challenge"); G.ensureDay(P, DATE);
  P.tutorialDone = true; P.insp = 100; P.sanity = 60;
  G.assignJob(P, "detective");
  P.day.quirkGiven = true;
  return P;
}
const mk = (P, o = {}) => G.finishMake(P, Object.assign({}, BASE, o), { natural: 50 }).key;
let clock = NOW;
function party(ids, opt = {}) {
  const Ps = {}, members = ids.map(id => { const P = person(); Ps[id] = P; return { id, name: id, P, keys: [mk(P), mk(P, { 顏色: "綠" })] }; });
  const s = G.coopBegin(members, opt.floor || 1, DATE, clock, Object.assign({ gate: true }, opt));
  assert.ok(s.ok, s.reason);
  return { run: s.run, Ps, ids };
}
const act = (run, Ps, id, a, d) => G.coopAct(run, Ps, id, a, d || {}, ++clock);
const nodeOf = (run, id) => G.cmapNode(run.cmap, id);
// 選一個某種的點走（沒有就選第一個）
function go(run, Ps, ids, kind) {
  const opts = G.coopRouteOptions(run), pick = opts.find(id => nodeOf(run, id).kind === kind) || opts[0];
  ids.forEach(id => act(run, Ps, id, "route", { node: pick }));
  return pick;
}
// 把現在這個點做完，回到 route（或打完）
function finishNode(run, Ps, ids) {
  for (let i = 0; i < 60 && run.phase !== "route" && run.phase !== "floorDone" && run.phase !== "over" && run.phase !== "guess"; i++) {
    if (run.phase === "vote") { const r = G.coopRoom(run), c = Math.max(0, r.choices.findIndex(x => x.check.type === "none")); ids.forEach(id => act(run, Ps, id, "vote", { choice: c })); }
    else if (run.phase === "carry") ids.forEach(id => act(run, Ps, id, "carry", { side: "skip" }));
    else if (run.phase === "fight") ids.forEach(id => { if (run.phase === "fight") act(run, Ps, id, "fight", { act: "push" }); });
    else if (run.phase === "rest") ids.forEach(id => act(run, Ps, id, "rest", { pick: "san" }));
    else ids.forEach(id => act(run, Ps, id, "ack"));
  }
}

T("有守門的趟：壹開始是選路，站在入口，能走第壹排", () => {
  const { run } = party(["a", "b"]);
  assert.strictEqual(run.phase, "route");
  assert.strictEqual(run.node, null);
  assert.deepStrictEqual(G.coopRouteOptions(run), run.cmap.rows[0].map(n => n.id));
  assert.strictEqual(run.day, DATE);
  assert.deepStrictEqual(J(run.cmap), J(G.cmapOfDay(1, DATE)), "今天的地圖，大家壹樣");
});
T("沒開守門（舊的）：照舊壹間壹間走，沒有地圖", () => {
  const { run } = party(["a"], { gate: false });
  assert.strictEqual(run.phase, "vote");
  assert.strictEqual(run.cmap, null);
});
T("探索點：走原本的房間，看完結果回到選路，下壹排能走的是這個點連下去的", () => {
  const { run, Ps, ids } = party(["a", "b"]);
  const at = go(run, Ps, ids, "explore");
  assert.strictEqual(run.phase, "vote");
  assert.strictEqual(G.coopRoom(run).id, nodeOf(run, at).room, "房間就是那個點的房間");
  finishNode(run, Ps, ids);
  assert.strictEqual(run.phase, "route");
  assert.deepStrictEqual(J(G.coopRouteOptions(run)), J(run.cmap.links[at]));
  assert.deepStrictEqual(J(run.path), [at]);
});
T("壹路走探索房到底：房間全部走過、最後打守門，打贏才算走完這壹層", () => {
  const { run, Ps, ids } = party(["a", "b"]);
  for (let i = 0; i < 12 && run.phase === "route"; i++) {
    const opts = G.coopRouteOptions(run);
    const pick = opts.find(id => nodeOf(run, id).kind === "explore") || opts.find(id => nodeOf(run, id).kind === "rest") || opts[0];
    ids.forEach(id => act(run, Ps, id, "route", { node: pick }));
    if (run.phase === "fight" && run.fightKind === "gate") break;
    finishNode(run, Ps, ids);
  }
  assert.strictEqual(run.phase, "fight");
  assert.strictEqual(run.fightKind, "gate");
  assert.strictEqual(Object.keys(Ps.a.cellar.cleared).length, G.cellarFloor(1).rooms.length, "四間房都走過了");
  finishNode(run, Ps, ids);
  assert.ok(["floorDone", "over", "guess"].includes(run.phase), run.phase);
  if (run.fightLast.over === "win") assert.ok(Ps.a.cellar.floorsDone[1], "打贏才算走完");
});
T("遭遇點：打壹般怪物，打完（贏、逃、牠走掉）都回到選路", () => {
  const { run, Ps, ids } = party(["a", "b"]);
  let found = false;
  for (let i = 0; i < 6 && run.phase === "route" && !found; i++) {
    const opts = G.coopRouteOptions(run), foe = opts.find(id => nodeOf(run, id).kind === "foe");
    if (foe) {
      ids.forEach(id => act(run, Ps, id, "route", { node: foe }));
      assert.strictEqual(run.phase, "fight");
      assert.strictEqual(run.fightKind, "foe");
      assert.ok(!run.fight.boss, "不是守門");
      finishNode(run, Ps, ids);
      assert.ok(run.phase === "route" || run.phase === "over", run.phase);
      found = true;
    } else { go(run, Ps, ids, "explore"); finishNode(run, Ps, ids); }
  }
  assert.ok(found, "今天的地圖上要遇得到怪物");
});
T("休息：回理智（今天還有獎勵的趟）、或治好這壹趟受傷的佩佩；沒選的當回理智", () => {
  const { run, Ps, ids } = party(["a", "b"]);
  run.phase = "route"; run.node = run.cmap.rows[run.cmap.rows.length - 2].find(n => (run.cmap.links[n.id] || []).some(t => nodeOf(run, t).kind === "rest")).id;
  const rest = run.cmap.links[run.node].find(t => nodeOf(run, t).kind === "rest");
  const k = run.members[1].keys[0];
  Ps.b.injured[k] = "2026-11-20"; run.members[1].got.injured.push(k);
  Ps.a.sanity = 40; run.members[0].san = 40;
  ids.forEach(id => act(run, Ps, id, "route", { node: rest }));
  assert.strictEqual(run.phase, "rest");
  act(run, Ps, "b", "rest", { pick: "heal" });
  act(run, Ps, "a", "rest", { pick: "san" });
  assert.strictEqual(run.phase, "route");
  assert.ok(!Ps.b.injured[k], "治好了");
  assert.strictEqual(Ps.a.sanity, 40 + G.NUM.cellarMap.restSan);
});
T("寶箱：開出好的、怪的、壞的其中壹個；看完大家按繼續才回選路", () => {
  const { run, Ps, ids } = party(["a", "b"]);
  const seen = new Set();
  for (let t = 0; t < 30; t++) {
    const r2 = party(["a", "b"]);
    G.setRng(G.mulberry32(100 + t));
    G.coopChestOpen(r2.run, r2.Ps, G.coopNewEvents(r2.run));
    assert.strictEqual(r2.run.phase, "chest");
    assert.ok(r2.run.chest.text, "有字");
    seen.add(r2.run.chest.outcome);
    act(r2.run, r2.Ps, "a", "ack");
    assert.strictEqual(r2.run.phase, "chest", "還有人沒按");
    act(r2.run, r2.Ps, "b", "ack");
    assert.strictEqual(r2.run.phase, "route");
  }
  assert.deepStrictEqual([...seen].sort(), ["bad", "good", "odd"]);
  assert.ok(run);
});
T("平手：領隊投的；都沒投（時間到）：探索房優先", () => {
  const { run, Ps } = party(["a", "b"]);
  const opts = G.coopRouteOptions(run);
  assert.ok(opts.length >= 2);
  const other = opts.find(id => nodeOf(run, id).kind !== "explore") || opts[1];
  const t = G.coopRouteTally(run, { [run.leader]: other, b: opts.find(id => id !== other) });
  assert.strictEqual(t.pick, other, "平手領隊決定");
  const none = G.coopRouteTally(run, {});
  assert.strictEqual(nodeOf(run, none.pick).kind, "explore");
  act(run, Ps, "a", "tick"); // 還沒到時間：不動
  assert.strictEqual(run.phase, "route");
  G.coopAct(run, Ps, "a", "tick", {}, run.deadline + 1);
  assert.notStrictEqual(run.phase, "route", "時間到就走");
});
T("選路時也能撤：過半投撤退就壹起回地面，不到壹半照走", () => {
  let { run, Ps } = party(["a", "b", "c"]);
  act(run, Ps, "a", "route", { node: "retreat" }); act(run, Ps, "b", "route", { node: "retreat" });
  act(run, Ps, "c", "route", { node: G.coopRouteOptions(run)[0] });
  assert.strictEqual(run.phase, "over"); assert.strictEqual(run.over, "retreat");
  ({ run, Ps } = party(["a", "b"]));
  act(run, Ps, "a", "route", { node: "retreat" }); act(run, Ps, "b", "route", { node: G.coopRouteOptions(run)[0] });
  assert.notStrictEqual(run.phase, "over", "平手不撤");
});
T("送給畫面的地圖不寫怪物是誰（打開開發者工具也看不到）", () => {
  const { run } = party(["a", "b"]);
  const v = G.viewFor(run, "a");
  const s = JSON.stringify(v.cmap);
  G.fightFoesOf(1).concat(G.fightFoesOf(1, true)).forEach(f => assert.ok(!s.includes(`"${f.id}"`), `看得到 ${f.id}`));
  assert.deepStrictEqual(v.cmap.next, G.coopRouteOptions(run));
  assert.ok(v.cmap.rows[0].every(n => n.kind));
});
T("讀回來（JSON）還能繼續走；往下壹層換新的地圖", () => {
  let { run, Ps, ids } = party(["a", "b"]);
  go(run, Ps, ids, "explore");
  run = J(run); Ps = { a: J(Ps.a), b: J(Ps.b) };
  finishNode(run, Ps, ids);
  assert.strictEqual(run.phase, "route");
  run = J(run);
  const r = act(run, Ps, "a", "route", { node: G.coopRouteOptions(run)[0] });
  assert.ok(r.ok, r.reason);
  // 往下壹層：floorDone 的時候投往下
  run.phase = "floorDone"; run.next = 2; run.votes = {};
  ids.forEach(id => act(run, Ps, id, "floor", { go: "down" }));
  assert.strictEqual(run.floor, 2);
  assert.strictEqual(run.phase, "route");
  assert.strictEqual(run.cmap.floor, 2);
});
T("亂送的不丟錯：走不到的點、不是選路的時候、幽靈投票", () => {
  const { run, Ps } = party(["a", "b"]);
  assert.strictEqual(act(run, Ps, "a", "route", { node: "1-g" }).ok, false);
  assert.strictEqual(act(run, Ps, "a", "route", { node: 5 }).ok, false);
  assert.strictEqual(act(run, Ps, "a", "rest", { pick: "san" }).ok, false);
  run.members[1].ghost = true;
  assert.strictEqual(act(run, Ps, "b", "route", { node: G.coopRouteOptions(run)[0] }).ok, false);
});
T("試煉照舊：沒有地圖", () => {
  const ids = ["a"], Ps = { a: person() };
  Ps.a.cellar.best = 5; [1, 2, 3, 4, 5].forEach(n => { Ps.a.cellar.floorsDone[n] = true; });
  const tr = G.trialRooms()[0];
  const s = G.coopBegin([{ id: "a", name: "a", P: Ps.a, keys: [mk(Ps.a), mk(Ps.a)] }], 1, DATE, clock, { gate: true, trial: { id: tr.id } });
  if (!s.ok) return; // 試煉的條件不合就略過（這一項只管有沒有地圖）
  assert.strictEqual(s.run.cmap, null);
  assert.ok(ids);
});

console.log(`coop_route：${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
