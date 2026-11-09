// 合作試煉（決定 0041）：node test/coop_trial.test.cjs（npm test 也會跑）
// 試煉房間可以邀館友一起打，沿用合作地下的隊伍、投票、同一顆骰子、理智各扣各的；過關後技能成長每個人各算各的。
// 資格不合的人陪打、不拿成長；次數不會多扣；兩個人同時過關各算各的；中途離隊、存回去再讀、活動加成。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let G = load();
let pass = 0, fail = 0;
const T = (name, fn) => { try { G = load(); G.setRng(G.mulberry32(5)); fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const J = x => JSON.parse(JSON.stringify(x));
const DATE = "2026-11-14", NOW = 1_800_000_000_000;
const BASE = { 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" };
const TB = { id: "x/winter", kind: "trialBoost", title: "冬衣試煉夜", mult: 1.5, extra: 0, until: 0 };
function person(o = {}) {
  const P = G.newProfile("challenge"); G.ensureDay(P, DATE);
  P.tutorialDone = true; P.insp = 50; P.sanity = 60; G.assignJob(P, "detective");
  G.SKILLS.forEach(s => { P.skills[s] = 20; });
  P.day.quirkGiven = true; P.cellar.best = o.best == null ? 1 : o.best;
  if (o.skill != null) P.skills.偵查 = o.skill;
  G.finishMake(P, BASE, { natural: 50 });
  return P;
}
const key = P => Object.keys(P.pepes)[0];
// specs：{ id: { best, skill, done（這週已經拿過） } }
function party(specs, opt = {}) {
  const Ps = {}, ids = Object.keys(specs);
  const members = ids.map(id => {
    const P = person(specs[id]); Ps[id] = P;
    if (specs[id].done) P.shop.trials["t:look"] = { w: G.weekIndex(DATE), n: 1 };
    return { id, name: id, P, keys: [key(P)] };
  });
  const s = G.coopBegin(members, 1, DATE, NOW, Object.assign({ id: "tr" + (opt.seed || 1), fun: true, trial: { id: "t:look" } }, opt.o || {}));
  return Object.assign({ s, Ps, ids }, s.ok ? { run: s.run } : {});
}
// 全隊投同一個選項，然後都按繼續。rng：擲骰用的（0.15＝都成功、0.95＝都失敗）
function play(o, choice = 0, rng = 0.15, at = NOW) {
  G.setRng(() => rng);
  const ids = o.ids.filter(id => G.coopMember(o.run, id) && !G.coopMember(o.run, id).out);
  ids.forEach(id => G.coopAct(o.run, o.Ps, id, "vote", { choice }, at));
  o.run.members.filter(m => !m.out).forEach(m => G.coopAct(o.run, o.Ps, m.id, "ack", {}, at));
  G.setRng(G.mulberry32(9));
}

T("開始：只有那一間、不算每天 3 趟、沒有證據和搬東西、每個人的資格先寫好", () => {
  const o = party({ a: {}, b: { done: true }, c: { best: 0 } });
  assert.ok(o.s.ok, o.s.reason);
  assert.strictEqual(o.run.trial.id, "t:look");
  assert.strictEqual(o.run.floor, 1);
  assert.strictEqual(G.coopRoom(o.run).id, "t:look");
  assert.strictEqual(o.run.truth, null); assert.strictEqual(o.run.carry, null);
  assert.deepStrictEqual(J(o.run.trial.elig), { a: { state: "open", reason: "" }, b: { state: "done", reason: "這週過了，下週壹 05:00 再來" }, c: { state: "locked", reason: "要先走過 B1" } });
  o.run.members.forEach(m => assert.strictEqual(m.rewarded, false, "沒有靈感獎勵"));
  Object.values(o.Ps).forEach(P => assert.strictEqual(P.coopDay, undefined, "不算合作地下每天的趟數"));
  assert.strictEqual(G.viewFor(o.run, "a").trial.id, "t:look");
  assert.strictEqual(G.coopFix(J(o.run)).trial.id, "t:look");
  const old = J(o.run); delete old.trial; assert.strictEqual(G.coopFix(old).trial, null, "舊的 run 沒有這一欄也行");
});
T("不能開：沒有這間、留守、一個人也能開、層數照那間試煉", () => {
  const bad = party({ a: {} }, { o: { trial: { id: "t:nope" } } });
  assert.ok(!bad.s.ok && /沒有這間/.test(bad.s.reason));
  const P = person(), Q = person();
  const g = G.coopBegin([{ id: "a", name: "a", P, keys: [key(P)] }, { id: "b", name: "b", P: Q, keys: [], guard: true }], 1, DATE, NOW, { id: "g", fun: true, trial: { id: "t:look" } });
  assert.ok(!g.ok && /沒有人留守/.test(g.reason));
  const solo = party({ a: {} });
  assert.ok(solo.s.ok);
  assert.ok(solo.run.team.length >= 3, "館方助手補到 3 隻");
  const deep = party({ a: { best: 2 } }, { o: { trial: { id: "t:gaze" } } });
  assert.strictEqual(deep.run.floor, 2, "t:gaze 在 B2");
  const lock = party({ a: { best: 0 } }, { o: { trial: { id: "t:gaze" } } });
  assert.ok(!lock.s.ok, "B2 的試煉：要先走過 B1");
});
T("兩個人同時過關：各算各的（骰子各自擲、技能各自記）", () => {
  const o = party({ a: { skill: 20 }, b: { skill: 30 } });
  play(o);
  assert.strictEqual(o.run.phase, "over");
  const fx = o.run.trial.fx;
  assert.strictEqual(fx.a.state, "grown"); assert.strictEqual(fx.b.state, "grown");
  assert.strictEqual(fx.a.before, 20); assert.strictEqual(fx.b.before, 30);
  assert.strictEqual(o.Ps.a.skills.偵查, fx.a.after); assert.strictEqual(o.Ps.b.skills.偵查, fx.b.after);
  assert.ok(fx.a.after > 20 && fx.b.after > 30);
  assert.ok(fx.a.after - 20 <= 5 && fx.b.after - 30 <= 5, "1D5");
  [o.Ps.a, o.Ps.b].forEach(P => assert.deepStrictEqual(J(P.shop.trials["t:look"]), { w: G.weekIndex(DATE), n: 1 }));
  assert.ok(o.run.report.lines.some(l => l.k === "trial" && /偵查 20 → /.test(l.t)), JSON.stringify(o.run.report.lines));
  o.run.members.forEach(m => assert.strictEqual(m.got.insp, 0));
});
T("資格不合的人陪打：不拿成長、次數不會多扣、看得到原因", () => {
  const o = party({ a: {}, b: { done: true }, c: { skill: 80 } });
  const b0 = J(o.Ps.b.shop.trials), skills = id => o.Ps[id].skills.偵查;
  play(o);
  const fx = o.run.trial.fx;
  assert.strictEqual(fx.a.state, "grown");
  assert.strictEqual(fx.b.state, "noGrow"); assert.ok(/這週/.test(fx.b.reason));
  assert.strictEqual(fx.c.state, "noGrow"); assert.ok(/已經 80/.test(fx.c.reason));
  assert.deepStrictEqual(J(o.Ps.b.shop.trials), b0, "次數沒有多扣");
  assert.strictEqual(skills("b"), 20); assert.strictEqual(skills("c"), 80);
  assert.ok(!o.Ps.c.shop.trials["t:look"], "沒有拿成長的人，這週的次數還在");
  assert.ok(o.run.report.lines.some(l => l.k === "trial" && /b：陪打，沒有成長/.test(l.t)));
});
T("沒有技能（還沒選職業）的人也只是陪打", () => {
  const o = party({ a: {}, b: {} });
  o.Ps.b.skills = null;
  assert.strictEqual(o.run.trial.elig.b.state, "open", "開始時還看不出來（這裡是測試手動拿掉）");
  play(o);
  assert.strictEqual(o.run.trial.fx.a.state, "grown");
  assert.strictEqual(o.run.trial.fx.b.state, "noGrow");
});
T("沒過：誰都不拿成長、不算次數；這一趟結束", () => {
  const o = party({ a: {}, b: {} });
  play(o, 0, 0.95);
  assert.strictEqual(o.run.phase, "over");
  assert.deepStrictEqual(J(o.run.trial.fx), { a: { state: "fail" }, b: { state: "fail" } });
  ["a", "b"].forEach(id => { assert.strictEqual(o.Ps[id].skills.偵查, 20); assert.ok(!o.Ps[id].shop.trials["t:look"]); });
});
T("有人過、有人沒過（理智檢定各擲各的）：只有過的人拿，沒過的不算次數", () => {
  const o = party({ a: { best: 2 }, b: { best: 2 } }, { o: { trial: { id: "t:gaze" } } });
  assert.ok(o.s.ok, o.s.reason);
  o.Ps.a.sanity = 90; o.Ps.b.sanity = 30; // 擲 55：a 過（55 ≤ 90）、b 沒過（55 > 30）
  G.coopSync(o.run, o.Ps);
  play(o, 1, 0.55);
  assert.strictEqual(o.run.phase, "over");
  assert.strictEqual(o.run.trial.fx.a.state, "grown");
  assert.strictEqual(o.run.trial.fx.b.state, "fail");
  assert.ok(o.Ps.a.shop.trials["t:gaze"] && !o.Ps.b.shop.trials["t:gaze"]);
});
T("同一週再來一次：第一趟拿了，第二趟只是陪打（次數不會多扣）", () => {
  const o = party({ a: {}, b: {} });
  play(o);
  assert.strictEqual(o.run.trial.fx.a.state, "grown");
  const after = o.Ps.a.skills.偵查;
  const members = ["a", "b"].map(id => ({ id, name: id, P: o.Ps[id], keys: [key(o.Ps[id])] }));
  const s2 = G.coopBegin(members, 1, DATE, NOW, { id: "tr2", fun: true, trial: { id: "t:look" } });
  assert.ok(s2.ok, s2.reason);
  assert.strictEqual(s2.run.trial.elig.a.state, "done");
  const o2 = { run: s2.run, Ps: o.Ps, ids: ["a", "b"] };
  play(o2);
  assert.strictEqual(o2.run.trial.fx.a.state, "noGrow");
  assert.strictEqual(o.Ps.a.skills.偵查, after);
  assert.strictEqual(o.Ps.a.shop.trials["t:look"].n, 1);
});
T("兩趟同時進行、先後結算：只有先結算的拿到（開始時都合格，走完那一刻再查）", () => {
  const P = person(), Q = person();
  const mk = (id, run) => G.coopBegin([{ id, name: id, P, keys: [key(P)] }], 1, DATE, NOW, { id: "c" + run, fun: true, trial: { id: "t:look" } });
  const r1 = mk("a", 1), r2 = mk("a", 2);
  assert.ok(r1.ok && r2.ok);
  assert.strictEqual(r1.run.trial.elig.a.state, "open"); assert.strictEqual(r2.run.trial.elig.a.state, "open");
  [r1, r2].forEach(r => { const o = { run: r.run, Ps: { a: P }, ids: ["a"] }; play(o); });
  assert.strictEqual(r1.run.trial.fx.a.state, "grown");
  assert.strictEqual(r2.run.trial.fx.a.state, "noGrow");
  assert.strictEqual(P.shop.trials["t:look"].n, 1);
  assert.ok(Q);
});
T("技能到上限、跨週重算", () => {
  const o = party({ a: { skill: G.NUM.story.skillCap - 1 } });
  play(o);
  assert.strictEqual(o.Ps.a.skills.偵查 <= G.NUM.story.skillCap, true);
  const P = person();
  P.shop.trials["t:look"] = { w: G.weekIndex(DATE) - 1, n: 1 };
  assert.strictEqual(G.trialState(P, "t:look", DATE).state, "open", "上週拿過，這週又可以");
});
T("活動：試煉活動中開始，成長 ×1.5；沒有活動照舊；合作活動對試煉不動靈感", () => {
  const sum = event => { let t = 0; for (let s = 1; s <= 25; s++) { const o = party({ a: {} }, { seed: s, o: { event } }); G.setRng(G.mulberry32(s)); play(o, 0, 0.15); t += o.run.trial.fx.a.after - 20; } return t; };
  const plain = sum(null), boosted = sum(TB);
  assert.ok(boosted > plain * 1.25, `活動中比較多：${boosted} vs ${plain}`);
  const o = party({ a: {} }, { o: { event: TB } });
  assert.strictEqual(o.run.event.kind, "trialBoost");
  play(o);
  assert.strictEqual(o.run.trial.fx.a.boost === true || o.run.trial.fx.a.after - 20 >= 1, true);
  assert.ok(o.run.report.lines.some(l => l.k === "event"), "報告有限時活動那一行");
  const co = party({ a: {} }, { o: { event: Object.assign({}, TB, { kind: "coopBoost", extra: 1 }) } });
  play(co);
  assert.ok(co.run.trial.fx.a.after - 20 <= 5, "別種活動不影響成長");
});
T("開始時在活動內：過了活動結束的時間才走完，還是照活動算（run 裡記著倍率，不看時鐘）", () => {
  const o = party({ a: {} }, { o: { event: TB } });
  play(o, 0, 0.15, NOW + 5 * 60 * 1000); // 活動的 until 是 0（早就過了）；走完還是照 run.event
  assert.strictEqual(o.run.event.mult, 1.5);
  assert.strictEqual(o.run.trial.fx.a.state, "grown");
});
T("中途離隊：離開的人沒有成長，留下的人照算；一個人也走得完", () => {
  const o = party({ a: {}, b: {} });
  G.coopAct(o.run, o.Ps, "b", "leave", {}, NOW);
  assert.ok(G.coopMember(o.run, "b").out);
  play(o);
  assert.strictEqual(o.run.trial.fx.a.state, "grown");
  assert.strictEqual(o.run.trial.fx.b, undefined, "離隊的人沒有結果");
  assert.strictEqual(o.Ps.b.skills.偵查, 20); assert.ok(!o.Ps.b.shop.trials["t:look"]);
});
T("存回去再讀（斷線接回去）：投票到一半、結果出來還沒按繼續，各讀一次還是一樣", () => {
  const o = party({ a: {}, b: {} });
  G.setRng(() => 0.15);
  G.coopAct(o.run, o.Ps, "a", "vote", { choice: 0 }, NOW);
  let run = G.coopFix(J(o.run));
  assert.strictEqual(run.phase, "vote"); assert.strictEqual(run.votes.a, 0);
  G.coopAct(run, o.Ps, "b", "vote", { choice: 0 }, NOW);
  run = G.coopFix(J(run));
  assert.strictEqual(run.phase, "result");
  assert.ok(G.viewFor(run, "b").trial && G.viewFor(run, "b").phase === "result");
  G.setRng(G.mulberry32(2));
  G.coopAct(run, o.Ps, "a", "ack", {}, NOW);
  run = G.coopFix(J(run));
  G.coopAct(run, o.Ps, "b", "ack", {}, NOW);
  assert.strictEqual(run.phase, "over");
  assert.strictEqual(run.trial.fx.a.state, "grown"); assert.strictEqual(run.trial.fx.b.state, "grown");
  assert.strictEqual(G.viewFor(run, "a").trial.fx.b.state, "grown", "畫面看得到每個人的結果");
});
T("隊伍：隊長選試煉、換層數會改回一般、留守和試煉不能一起", () => {
  const p = G.newParty({ pid: "p", kind: "cellar", leader: "a", leaderNick: "a", now: 1 });
  G.partyJoin(p, "b", "b", 2);
  assert.ok(!G.partyTrial(p, "b", "t:look", 1).ok, "只有隊長");
  assert.ok(!G.partyTrial(p, "a", "bad id", 1).ok);
  assert.ok(G.partyTrial(p, "a", "t:gaze", 2).ok);
  assert.strictEqual(p.trial, "t:gaze"); assert.strictEqual(p.floor, 2);
  p.members.b.ready = true;
  assert.ok(!G.partyGuard(p, "b", true).ok, "試煉沒有留守");
  assert.ok(G.partyFloor(p, "a", 1).ok);
  assert.strictEqual(p.trial, undefined, "選層數＝回到一般的地下收藏庫");
  G.partyGuard(p, "b", true);
  assert.ok(!G.partyTrial(p, "a", "t:look", 1).ok, "有人留守不能選試煉");
  assert.ok(G.partyTrial(p, "a", null, null).ok);
});

console.log(`合作試煉 ${pass} 項過，${fail} 項沒過`);
process.exit(fail ? 1 : 0);
