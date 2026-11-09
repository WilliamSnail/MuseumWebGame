// 合作地下收藏庫的流程（shared/coop_flow.js）：node test/coop_flow.test.cjs（npm test 也會跑）
// 投票湊齊就開票、時間到算棄權、連 3 次離隊、看完結果、往下或回地面、離隊、太久沒人動、每天前 3 趟有獎勵。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let G = load();
let pass = 0, fail = 0;
const T = (name, fn) => { try { G = load(); G.setRng(G.mulberry32(11)); fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 3).join("\n    ")); } };
const DATE = "2026-11-09", NOW = 1_800_000_000_000;
const BASE = { 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" };
const J = x => JSON.parse(JSON.stringify(x));
function person() {
  const P = G.newProfile("challenge"); G.ensureDay(P, DATE);
  P.tutorialDone = true; P.insp = 100; P.sanity = 60;
  G.assignJob(P, "detective");
  P.day.quirkGiven = true;
  return P;
}
const mk = (P, o = {}) => G.finishMake(P, Object.assign({}, BASE, o), { natural: 50 }).key;
function party(ids, opt = {}) {
  const Ps = {}, members = ids.map(id => { const P = person(); Ps[id] = P; return { id, name: id, P, keys: [mk(P)], guard: opt.guard === id }; });
  const s = G.coopBegin(members, opt.floor || 1, DATE, NOW, opt);
  assert.ok(s.ok, s.reason);
  return { run: s.run, Ps };
}
const safe = run => { const c = G.coopRoom(run).choices.findIndex(x => x.check.type === "none"); return c < 0 ? 0 : c; };

T("大家都投了才開票，投了可以改；開票後等大家看結果", () => {
  const { run, Ps } = party(["a", "b"]);
  const c = safe(run);
  assert.strictEqual(run.deadline, NOW + G.COOP.voteMs);
  let r = G.coopAct(run, Ps, "a", "vote", { choice: 0 }, NOW + 1);
  assert.ok(r.ok && !r.saves);
  assert.strictEqual(run.phase, "vote");
  G.coopAct(run, Ps, "a", "vote", { choice: c }, NOW + 2);
  r = G.coopAct(run, Ps, "b", "vote", { choice: c }, NOW + 3);
  assert.ok(r.saves);
  assert.strictEqual(run.phase, "result");
  assert.strictEqual(run.deadline, NOW + 3 + G.COOP.resultMs);
  assert.deepStrictEqual(J(run.votes), {});
  G.coopAct(run, Ps, "a", "ack", {}, NOW + 4);
  assert.strictEqual(run.phase, "result");
  G.coopAct(run, Ps, "b", "ack", {}, NOW + 5);
  assert.strictEqual(run.phase, "vote");
  assert.strictEqual(run.idx, 1);
});
T("不能亂投：沒有的選項、不在隊上的人", () => {
  const { run, Ps } = party(["a"]);
  assert.strictEqual(G.coopAct(run, Ps, "a", "vote", { choice: 99 }, NOW).ok, false);
  assert.strictEqual(G.coopAct(run, Ps, "a", "vote", { choice: "1" }, NOW).ok, false);
  assert.strictEqual(G.coopAct(run, Ps, "z", "vote", { choice: 0 }, NOW).ok, false);
});
T("時間沒到按 tick 沒有用（伺服器自己看時間）；到了沒投的算棄權", () => {
  const { run, Ps } = party(["a", "b"]);
  const c = safe(run);
  G.coopAct(run, Ps, "a", "vote", { choice: c }, NOW);
  assert.ok(G.coopAct(run, Ps, "a", "tick", {}, NOW + 1000).noop);
  assert.strictEqual(run.phase, "vote");
  const r = G.coopAct(run, Ps, "a", "tick", {}, NOW + G.COOP.voteMs);
  assert.ok(r.saves);
  assert.strictEqual(run.phase, "result");
  assert.strictEqual(run.members.find(m => m.id === "b").skips, 1);
  assert.strictEqual(run.members.find(m => m.id === "a").skips, 0);
});
T("連 3 次沒投自動離隊，佩佩離開、助手補位", () => {
  const { run, Ps } = party(["a", "b"]);
  let t = NOW;
  const room = () => { G.coopAct(run, Ps, "a", "vote", { choice: safe(run) }, t); t += G.COOP.voteMs; return G.coopAct(run, Ps, "a", "tick", {}, t); };
  room(); t += G.COOP.resultMs; G.coopAct(run, Ps, "a", "tick", {}, t);
  room(); t += G.COOP.resultMs; G.coopAct(run, Ps, "a", "tick", {}, t);
  const r = room();
  assert.deepStrictEqual(J(r.dropped), ["b"]);
  const b = run.members.find(m => m.id === "b");
  assert.strictEqual(b.out, "left");
  assert.ok(!run.team.some(it => it.owner === "b"));
  assert.strictEqual(run.team.length, G.COOP.teamMin);
});
T("走完一層：投往下、平手領隊決定；撤退就結束", () => {
  const { run, Ps } = party(["a", "b"]);
  let t = NOW;
  for (let i = 0; i < 4; i++) {
    const v = safe(run);
    G.coopAct(run, Ps, "a", "vote", { choice: v }, t); G.coopAct(run, Ps, "b", "vote", { choice: v }, t);
    G.coopAct(run, Ps, "a", "ack", {}, t); G.coopAct(run, Ps, "b", "ack", {}, t);
    t += 10;
  }
  assert.strictEqual(run.phase, "floorDone");
  const leader = run.leader, other = leader === "a" ? "b" : "a";
  G.coopAct(run, Ps, leader, "floor", { go: "down" }, t);
  assert.strictEqual(run.phase, "floorDone");
  const r = G.coopAct(run, Ps, other, "floor", { go: "up" }, t);
  assert.ok(r.ok);
  assert.strictEqual(run.floor, 2); // 平手：領隊要往下
  assert.strictEqual(run.phase, "vote");
  G.coopAct(run, Ps, "a", "leave", {}, t);
  G.coopAct(run, Ps, "b", "vote", { choice: "retreat" }, t);
  assert.strictEqual(run.phase, "over");
  assert.ok(run.ended);
  assert.strictEqual(run.over, "retreat");
});
T("都沒投、時間到：回地面（不會自己往下）", () => {
  const { run, Ps } = party(["a"]);
  const t = NOW;
  for (let i = 0; i < 4; i++) { G.coopAct(run, Ps, "a", "vote", { choice: safe(run) }, t); G.coopAct(run, Ps, "a", "ack", {}, t); }
  assert.strictEqual(run.phase, "floorDone");
  const r = G.coopAct(run, Ps, "a", "tick", {}, t + G.COOP.floorMs);
  assert.ok(r.ended);
  assert.strictEqual(run.over, "done");
  assert.strictEqual(run.summary.length, 1);
});
T("最後一個沒投的人離隊：不用再等", () => {
  const { run, Ps } = party(["a", "b"]);
  G.coopAct(run, Ps, "a", "vote", { choice: safe(run) }, NOW);
  const r = G.coopAct(run, Ps, "b", "leave", {}, NOW + 1);
  assert.ok(r.ok && r.dropped.includes("b"));
  assert.strictEqual(run.phase, "result");
});
T("大家都離隊：這一趟結束", () => {
  const { run, Ps } = party(["a", "b"]);
  G.coopAct(run, Ps, "a", "leave", {}, NOW);
  const r = G.coopAct(run, Ps, "b", "leave", {}, NOW);
  assert.ok(r.ended);
  assert.strictEqual(run.over, "lost");
});
T("太久沒有人動：回來一碰就結束（走到哪算到哪）", () => {
  const { run, Ps } = party(["a"]);
  const r = G.coopAct(run, Ps, "a", "resume", {}, NOW + G.COOP.staleMs + 1);
  assert.ok(r.ended);
  assert.strictEqual(run.over, "stale");
});
T("斷線回來：時間過了又沒人催，再給一點時間，也不算掛機", () => {
  const { run, Ps } = party(["a"]);
  run.members[0].skips = 2;
  G.coopAct(run, Ps, "a", "resume", {}, NOW + G.COOP.voteMs + 5000);
  assert.strictEqual(run.deadline, NOW + G.COOP.voteMs + 5000 + G.COOP.resumeMs);
  assert.strictEqual(run.members[0].skips, 0);
});
T("每天前 3 趟有獎勵；跟著帳號、不跟著參觀者（P.coopDay 不在 VISITOR_KEYS）；隔天重算；存檔讀回來還在", () => {
  const P = person();
  assert.strictEqual(G.coopTurnsLeft(P, DATE), G.COOP.dailyRewarded);
  for (let i = 0; i < G.COOP.dailyRewarded; i++) assert.strictEqual(G.coopTakeTurn(P, DATE), true);
  assert.strictEqual(G.coopTakeTurn(P, DATE), false);
  assert.strictEqual(G.coopTurnsLeft(P, DATE), 0);
  assert.ok(!G.VISITOR_KEYS.includes("coopDay"));
  assert.strictEqual(G.coopTakeTurn(P, "2026-11-10"), true);
  const save = G.newSave(); save.profiles.challenge = P;
  const back = G.migrateSave(J(save));
  assert.strictEqual(back.profiles.challenge.coopDay.date, "2026-11-10");
});
T("開始不了的不算一趟", () => {
  const P = person();
  const s = G.coopBegin([{ id: "a", name: "a", P, keys: [] }], 1, DATE, NOW);
  assert.strictEqual(s.ok, false);
  assert.strictEqual(P.coopDay, undefined);
});
T("留守的人：不帶佩佩、不投票、不算平均理智，也不用等他", () => {
  const { run, Ps } = party(["a", "b"], { guard: "b" });
  assert.strictEqual(run.members.find(m => m.id === "b").guard, true);
  assert.ok(!run.team.some(it => it.owner === "b"));
  assert.strictEqual(G.coopAct(run, Ps, "b", "vote", { choice: 0 }, NOW).ok, false);
  Ps.b.sanity = 5; G.coopSync(run, Ps);
  assert.strictEqual(run.pressure.lv, 0);
  G.coopAct(run, Ps, "a", "vote", { choice: safe(run) }, NOW);
  assert.strictEqual(run.phase, "result");
});
console.log(`${pass} passed, ${fail} failed（合作地下的流程）`);
process.exit(fail ? 1 : 0);
