// 合作地下好玩的機制（shared/coop_fun.js）：node test/coop_fun.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let G = load();
let pass = 0, fail = 0;
const T = (name, fn) => { try { G = load(); G.setRng(G.mulberry32(21)); fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const DATE = "2026-11-09", NOW = 1_800_000_000_000;
const BASE = { 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" };
const J = x => JSON.parse(JSON.stringify(x));
function person(san = 60, seek = 20) {
  const P = G.newProfile("challenge"); G.ensureDay(P, DATE);
  P.tutorialDone = true; P.insp = 100; P.sanity = san;
  G.assignJob(P, "detective");
  G.SKILLS.forEach(s => { P.skills[s] = 20; });
  P.skills.偵查 = seek;
  P.day.quirkGiven = true;
  return P;
}
const mk = (P, o = {}) => G.finishMake(P, Object.assign({}, BASE, o), { natural: 50 }).key;
// specs：[{ id, san, seek, guard }]
function party(specs, floor = 1, seed = 5) {
  const Ps = {}, members = specs.map(s => { const P = person(s.san, s.seek); if (s.best != null) P.cellar.best = s.best; Ps[s.id] = P; return { id: s.id, name: s.id, P, keys: s.guard ? [] : [mk(P)], guard: !!s.guard }; });
  const st = G.coopBegin(members, floor, DATE, NOW, { id: "t" + seed, fun: true });
  assert.ok(st.ok, st.reason);
  return { run: st.run, Ps };
}
const three = (o = {}) => party([Object.assign({ id: "a" }, o), Object.assign({ id: "b" }, o), Object.assign({ id: "c" }, o)]);
const safe = run => { const c = G.coopRoom(run).choices.findIndex(x => x.check.type === "none"); return c < 0 ? 0 : c; };

// ---------- 機制 2：每個人看到的不一樣 ----------
T("記號：答案是三個真的記號；別的選項都不一樣；安全的選項沒有記號", () => {
  const { run } = three();
  const c = run.clue, room = G.coopRoom(run);
  assert.strictEqual(c.truth.length, 3);
  assert.strictEqual(new Set(c.truth).size, 3);
  assert.deepStrictEqual(J(c.marks[c.answer]).sort(), J(c.truth).sort());
  const sets = Object.values(J(c.marks)).map(s => s.slice().sort().join());
  assert.strictEqual(new Set(sets).size, sets.length);
  room.choices.forEach((ch, i) => { if (ch.check.type === "none") assert.strictEqual(c.marks[i], undefined); else assert.ok(c.marks[i]); });
});
T("線索分散：每個人只看到一部分，全隊拼起來是三個；偵查高的多看到一個", () => {
  const { run } = three({ seek: 20 });
  const c = run.clue;
  ["a", "b", "c"].forEach(id => assert.strictEqual(c.seen[id].length, 1));
  assert.deepStrictEqual([...new Set(["a", "b", "c"].flatMap(id => J(c.seen[id])))].sort(), J(c.truth).sort());
  const r2 = party([{ id: "a", seek: 80 }, { id: "b", seek: 20 }, { id: "c", seek: 20 }]);
  assert.strictEqual(r2.run.clue.seen.a.length, 2);
  assert.strictEqual(r2.run.clue.seen.b.length, 1);
});
T("兩個人：三個都看得到（還沒人看到的給偵查最高的）；一個人看到兩個，偵查高看到全部", () => {
  const two = party([{ id: "a", seek: 40 }, { id: "b", seek: 20 }]);
  const c = two.run.clue;
  assert.strictEqual(new Set([...c.seen.a, ...c.seen.b]).size, 3);
  assert.strictEqual(c.seen.a.length, 2);
  assert.strictEqual(party([{ id: "a", seek: 20 }]).run.clue.seen.a.length, 2);
  assert.strictEqual(party([{ id: "a", seek: 80 }]).run.clue.seen.a.length, 3);
});
T("幻覺：理智高不會；理智 < 25 一定多看到一個不存在的記號（在別的選項上，會把人帶錯）", () => {
  const high = three({ san: 60 });
  assert.deepStrictEqual(J(high.run.clue.fake), {});
  const low = party([{ id: "a", san: 20 }, { id: "b", san: 60 }, { id: "c", san: 60 }]);
  const c = low.run.clue;
  assert.ok(c.fake.a, "理智 20 要有幻覺");
  assert.ok(!c.truth.includes(c.fake.a));
  assert.ok(Object.values(J(c.marks)).flat().includes(c.fake.a));
  assert.ok(c.seen.a.includes(c.fake.a));
  assert.strictEqual(c.fake.b, undefined);
  // 看的順序看不出來：照字碼排好了
  assert.deepStrictEqual(J(c.seen.a), J(c.seen.a).slice().sort());
});
T("viewFor：只送自己看到的；答案、別人的、誰是假的都不在裡面", () => {
  const { run } = party([{ id: "a", san: 20 }, { id: "b", san: 60 }, { id: "c", san: 60 }]);
  const c = run.clue;
  const v = G.viewFor(run, "b"), txt = JSON.stringify(v);
  assert.deepStrictEqual(J(v.clue.seen), J(c.seen.b));
  assert.strictEqual(v.clue.answer, undefined);
  assert.strictEqual(v.clue.truth, undefined);
  assert.strictEqual(v.clue.fake, undefined);
  assert.ok(!txt.includes('"fake"'));
  assert.ok(!txt.includes('"truth"'));
  assert.strictEqual(v.seed, undefined);
  // 有幻覺的人自己也看不出來
  const a = G.viewFor(run, "a");
  assert.ok(a.clue.seen.includes(c.fake.a));
  assert.ok(!JSON.stringify(a).includes('"fake"'));
});
T("同一趟、同一間，記號算出來一樣（交易重跑也一樣），也不會動到共用的骰子", () => {
  const { run, Ps } = three();
  const c1 = JSON.stringify(run.clue);
  G.setRng(() => { throw new Error("不該用共用的骰子"); });
  G.coopPlanRoom(run, Ps);
  G.setRng(G.mulberry32(21));
  assert.strictEqual(JSON.stringify(run.clue), c1);
});
T("選到記號都對上的：強度門檻低、技能高；翻開給大家看，誰多看到什麼也寫", () => {
  const { run, Ps } = party([{ id: "a", san: 20 }, { id: "b", san: 60 }, { id: "c", san: 60 }]);
  const ans = run.clue.answer, truth = J(run.clue.truth), fakeA = run.clue.fake.a;
  const ch = G.coopRoom(run).choices[ans], t0 = run.room.choices[ans].target;
  const r = G.coopResolve(run, Ps, { a: ans, b: ans, c: ans });
  assert.ok(r.ok);
  assert.strictEqual(r.check.clue, true);
  if (ch.check.type === "power") assert.strictEqual(r.check.target, t0 - G.COOP.clue.power);
  const rev = run.last.reveal;
  assert.strictEqual(rev.answer, ans);
  assert.strictEqual(rev.hit, true);
  assert.deepStrictEqual(J(rev.truth), truth);
  assert.strictEqual(rev.fake.a, fakeA);
  // 選錯的沒有好處
  const o = three();
  const wrong = Object.keys(o.run.clue.marks).map(Number).find(i => i !== o.run.clue.answer);
  const r2 = G.coopResolve(o.run, o.Ps, { a: wrong, b: wrong, c: wrong });
  assert.strictEqual(r2.check.clue, undefined);
  assert.strictEqual(o.run.last.reveal.hit, false);
});
T("記號對上又過了：多一點靈感（今天沒獎勵的不拿）", () => {
  const { run, Ps } = three();
  run.members[1].rewarded = false;
  const ans = run.clue.answer;
  G.setRng(() => 0.001); // 骰子都很小：技能、理智都過；強度不一定
  Ps.a.insp = Ps.b.insp = Ps.c.insp = 0;
  const room = G.coopRoom(run);
  if (room.choices[ans].check.type === "power") { run.team.forEach(it => { it.pick.稀有度 = "不可名狀"; }); G.coopSync(run, Ps); }
  const r = G.coopResolve(run, Ps, { a: ans, b: ans, c: ans });
  if (r.check.success) {
    assert.ok(r.events.a.some(e => e.why === "記號對上了"));
    assert.ok(!r.events.b.some(e => e.why === "記號對上了"));
  }
});
T("走到下一間發新的記號；留守的人不算", () => {
  const { run, Ps } = party([{ id: "a" }, { id: "b" }, { id: "g", guard: true }]);
  assert.strictEqual(run.clue.seen.g, undefined);
  assert.strictEqual(G.viewFor(run, "g").clue, undefined);
  const first = JSON.stringify(run.clue);
  G.coopAct(run, Ps, "a", "vote", { choice: safe(run) }, NOW); G.coopAct(run, Ps, "b", "vote", { choice: safe(run) }, NOW);
  ["a", "b", "g"].forEach(id => G.coopAct(run, Ps, id, "ack", {}, NOW));
  assert.strictEqual(run.idx, 1);
  assert.notStrictEqual(JSON.stringify(run.clue), first);
});

// ---------- 機制 6：幽靈 ----------
T("幽靈：看得到真的記號和答案；不能投票、不能說話；一間敲一下，大家只看到哪個選項發抖", () => {
  const { run, Ps } = three();
  const b = run.members[1];
  b.ghost = true; Ps.b.sanity = 0;
  const v = G.viewFor(run, "b");
  assert.strictEqual(v.role, "ghost");
  assert.strictEqual(v.clue.real, true);
  assert.deepStrictEqual(J(v.clue.seen), J(run.clue.truth).sort());
  assert.strictEqual(v.clue.answer, run.clue.answer);
  assert.strictEqual(G.coopAct(run, Ps, "b", "vote", { choice: 0 }, NOW).ok, false);
  assert.strictEqual(G.coopSayBuild(run, "b", { say: "safe" }).ok, false);
  assert.strictEqual(G.coopAct(run, Ps, "a", "knock", { choice: 0 }, NOW).ok, false, "活人不能敲");
  assert.ok(G.coopAct(run, Ps, "b", "knock", { choice: 1 }, NOW).ok);
  assert.strictEqual(G.coopAct(run, Ps, "b", "knock", { choice: 0 }, NOW).ok, false, "一間一次");
  const seen = G.viewFor(run, "a");
  assert.deepStrictEqual(J(seen.knocked), { 1: 1 });
  assert.strictEqual(seen.knocks, undefined);
  assert.strictEqual(seen.iKnocked, false);
  assert.strictEqual(G.viewFor(run, "b").iKnocked, true);
  // 不用等幽靈：活人投完就開票
  G.coopAct(run, Ps, "a", "vote", { choice: safe(run) }, NOW);
  G.coopAct(run, Ps, "c", "vote", { choice: safe(run) }, NOW);
  assert.strictEqual(run.phase, "result");
});
T("全隊都變幽靈：這一趟失敗、回地面（結局照個人）", () => {
  const { run, Ps } = three();
  run.members.forEach(m => { m.ghost = true; Ps[m.id].sanity = 0; Ps[m.id].dark = true; });
  const r = G.coopAct(run, Ps, "a", "leave", {}, NOW);
  assert.ok(r.ended);
  assert.strictEqual(run.over, "lost");
  assert.ok(Ps.b.dark);
});

// ---------- 機制 4：說話 ----------
T("短句：理智高不變形；只收清單上的，沒有打字", () => {
  const { run } = three({ san: 60 });
  const r = G.coopSayBuild(run, "a", { say: "go" });
  assert.deepStrictEqual([r.ok, r.text, r.warped], [true, "走這邊", false]);
  assert.strictEqual(G.coopSayBuild(run, "a", { say: "打什麼都可以" }).ok, false);
  assert.strictEqual(G.coopSayBuild(run, "a", { text: "自由打字" }).ok, false);
  assert.strictEqual(G.coopSayBuild(run, "a", { say: "see", x: "不是記號" }).ok, false);
  assert.strictEqual(G.coopSayBuild(run, "a", { say: "pick", x: "戊" }).ok, false);
  assert.strictEqual(G.coopSayBuild(run, "a", { say: "see", x: "月" }).text, "我看到「月」");
  assert.strictEqual(G.coopSayBuild(run, "a", { call: "gua" }).text, "呱");
  assert.strictEqual(G.coopSayBuild(run, "zzz", { call: "gua" }).ok, false);
});
T("理智低：會結巴、會變成別句話（「安全」→「牠在後面」）；記號、選項會被換掉；骰子固定結果固定", () => {
  const safeItem = G.COOP_SAY.find(x => x.id === "safe");
  // 骰子很小：一定換句話
  G.setRng(() => 0.01);
  let w = G.coopWarp(safeItem, "", 20);
  assert.ok(w.warped); assert.ok(safeItem.warp.includes(w.text));
  // 骰子中間：結巴
  G.setRng(() => 0.4);
  w = G.coopWarp(safeItem, "", 20);
  assert.ok(w.warped); assert.ok(w.text.includes("……"));
  // 骰子很大：沒事
  G.setRng(() => 0.999);
  assert.strictEqual(G.coopWarp(safeItem, "", 20).warped, false);
  // 理智夠高：怎麼擲都沒事
  G.setRng(() => 0.01);
  assert.strictEqual(G.coopWarp(safeItem, "", 60).warped, false);
  // 記號被換掉
  const see = G.COOP_SAY.find(x => x.id === "see");
  w = G.coopWarp(see, "月", 20);
  assert.ok(w.warped); assert.ok(!w.text.includes("月"));
  const pick = G.COOP_SAY.find(x => x.id === "pick");
  w = G.coopWarp(pick, "甲", 20);
  assert.ok(w.warped); assert.ok(!w.text.includes("甲"));
  // 叫聲也會變
  w = G.coopWarp(G.COOP_CALLS[0], "", 20);
  assert.ok(w.warped); assert.notStrictEqual(w.text, "呱");
});
T("伺服器變形：拿隊員現在的理智（run 裡的），不是畫面給的；回傳原文給紀錄", () => {
  const { run } = three({ san: 60 });
  run.members[0].san = 10;
  G.setRng(() => 0.01);
  const r = G.coopSayBuild(run, "a", { say: "safe", san: 99 });
  assert.strictEqual(r.warped, true);
  assert.strictEqual(r.from, "安全");
});
console.log(`${pass} passed, ${fail} failed（合作地下好玩的機制）`);
process.exit(fail ? 1 : 0);
