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
  assert.ok(!txt.includes('"truth":['), "真的記號不能送");
  assert.strictEqual(v.seed, undefined);
  assert.strictEqual(v.hazard, undefined);
  assert.strictEqual(v.map, undefined, "地圖只給留守的人");
  assert.strictEqual(v.stats, undefined);
  assert.strictEqual(v.truth.id, undefined, "住的是什麼，猜完才知道");
  assert.strictEqual(v.truth.order, undefined);
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
  G.setRng(() => 0.15); // 骰子都很小（11）：技能、理智都過；強度不一定
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
  if (run.phase === "carry") { G.coopAct(run, Ps, "a", "carry", { side: "skip" }, NOW); G.coopAct(run, Ps, "b", "carry", { side: "skip" }, NOW); ["a", "b", "g"].forEach(id => G.coopAct(run, Ps, id, "ack", {}, NOW)); }
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
T("短句：理智高不變形；只收清單上的", () => {
  const { run } = three({ san: 60 });
  const r = G.coopSayBuild(run, "a", { say: "go" });
  assert.deepStrictEqual([r.ok, r.text, r.warped], [true, "走這邊", false]);
  assert.strictEqual(G.coopSayBuild(run, "a", { say: "打什麼都可以" }).ok, false);
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
// ---------- 自由打字（決定 0020、0036） ----------
T("打字：清掉看不見的字、連續空白變一個、最多 PARTY.sayMax 個字；空的、不是字串的不收", () => {
  const { run } = three({ san: 60 });
  const zw = String.fromCharCode(0x200b), ctl = String.fromCharCode(7);
  let r = G.coopSayBuild(run, "a", { text: `  走${zw}這${ctl}邊   快 ` });
  assert.deepStrictEqual([r.ok, r.kind, r.text, r.from, r.warped], [true, "text", "走這邊 快", "走這邊 快", false]);
  assert.strictEqual(r.id, null, "Realtime Database 不收 undefined");
  r = G.coopSayBuild(run, "a", { text: "長".repeat(G.PARTY.sayMax + 20) });
  assert.strictEqual([...r.text].length, G.PARTY.sayMax);
  assert.strictEqual(G.coopSayBuild(run, "a", { text: "   " }).ok, false);
  assert.strictEqual(G.coopSayBuild(run, "a", { text: zw }).ok, false);
  assert.strictEqual(G.coopSayBuild(run, "a", { text: 123 }).ok, false);
  assert.strictEqual(G.coopSayBuild(run, "a", { text: null }).ok, false);
});
T("打字：照字面，標籤不會被改掉也不會被執行（畫面用文字節點，這裡只確定伺服器原樣留著）", () => {
  const { run } = three({ san: 60 });
  const bad = "<img src=x onerror=alert(1)>";
  assert.strictEqual(G.coopSayBuild(run, "a", { text: bad }).text, bad);
});
T("打字會變形：伺服器看 run 裡的理智（畫面送什麼都沒用）；理智高不變；會結巴、後半會變；原文另外留", () => {
  const { run } = three({ san: 60 });
  G.setRng(() => 0.01);
  assert.strictEqual(G.coopSayBuild(run, "a", { text: "這裡安全", san: 5, warped: true }).warped, false, "理智 60 不變形，畫面亂送沒用");
  run.members[0].san = 20;
  let r = G.coopSayBuild(run, "a", { text: "這裡安全" });
  assert.strictEqual(r.warped, true);
  assert.ok(r.text.startsWith("這裡……"), r.text);
  assert.ok(G.COOP_WARP_WORDS.some(w => r.text.endsWith(w)), r.text);
  assert.strictEqual(r.from, "這裡安全");
  G.setRng(() => 0.7); // 落在結巴
  r = G.coopSayBuild(run, "a", { text: "這裡安全" });
  assert.strictEqual(r.warped, true);
  assert.ok(r.text.includes("……"), r.text);
  G.setRng(() => 0.999); // 沒事
  assert.strictEqual(G.coopSayBuild(run, "a", { text: "這裡安全" }).warped, false);
  // 最長的那句變形之後也不會長太多
  G.setRng(() => 0.01);
  assert.ok([...G.coopWarpText("長".repeat(G.PARTY.sayMax), 10).text].length <= G.PARTY.sayMax + 10);
});
T("打字：幽靈不能打，只能敲；離隊的、走完的也不能", () => {
  const { run, Ps } = three({ san: 60 });
  run.members[1].ghost = true; Ps.b.sanity = 0;
  const r = G.coopSayBuild(run, "b", { text: "救命" });
  assert.strictEqual(r.ok, false);
  assert.ok(r.reason.includes("幽靈"));
  run.members[2].out = "left";
  assert.strictEqual(G.coopSayBuild(run, "c", { text: "哈囉" }).ok, false);
  run.ended = true;
  assert.strictEqual(G.coopSayBuild(run, "a", { text: "哈囉" }).ok, false);
});
T("太快會擋：打字 2 秒一句；短句另外算；打字算在短句的間隔裡", () => {
  let g = G.coopSayGap(null, "text", NOW);
  assert.ok(g.ok);
  let last = g.next;
  assert.strictEqual(G.coopSayGap(last, "text", NOW + G.COOP.typeGapMs - 1).ok, false, "打字太快");
  assert.ok(G.coopSayGap(last, "text", NOW + G.COOP.typeGapMs).ok);
  assert.strictEqual(G.coopSayGap(last, "say", NOW + G.COOP.sayGapMs - 1).ok, false, "短句也要隔一下");
  g = G.coopSayGap(last, "say", NOW + G.COOP.sayGapMs);
  assert.ok(g.ok);
  last = g.next;
  assert.strictEqual(G.coopSayGap(last, "text", NOW + G.COOP.sayGapMs + G.COOP.sayGapMs).ok, false, "中間說過短句，打字的 2 秒還是照算");
  assert.ok(G.coopSayGap(last, "text", NOW + G.COOP.typeGapMs + G.COOP.sayGapMs).ok);
  assert.ok(G.coopSayGap(last, "call", NOW + G.COOP.sayGapMs + G.COOP.sayGapMs).ok, "叫聲不看打字的間隔");
});
T("檢舉：只有打的字；不能檢舉自己；找不到的不行", () => {
  assert.strictEqual(G.coopReportProblem({ k: "text", by: "a" }, "b"), null);
  assert.ok(G.coopReportProblem({ k: "text", by: "a" }, "a"));
  assert.ok(G.coopReportProblem({ k: "say", by: "a" }, "b"));
  assert.ok(G.coopReportProblem({ k: "call", by: "a" }, "b"));
  assert.ok(G.coopReportProblem(null, "b"));
});

// ---------- 機制 3：湊證據猜真相 ----------
// 把這一層走到底（大家投同一個，有搬的就略過）；opts.pick(run) 回傳選項
function walkFloor(run, Ps, ids, opts = {}) {
  let guard = 0;
  while (run.phase !== "floorDone" && run.phase !== "over" && run.phase !== "guess" && guard++ < 60) {
    if (run.phase === "vote") {
      const v = opts.pick ? opts.pick(run) : safe(run);
      ids.forEach(id => G.coopAct(run, Ps, id, "vote", { choice: v }, NOW));
    } else if (run.phase === "carry") {
      ids.forEach(id => G.coopAct(run, Ps, id, "carry", { side: "skip" }, NOW));
    } else ids.forEach(id => G.coopAct(run, Ps, id, "ack", {}, NOW));
  }
}
T("證據：選安全的不掉；過了一定掉，沒有重複，都是這位住客的（理智高）", () => {
  const { run, Ps } = three();
  walkFloor(run, Ps, ["a", "b", "c"]);
  assert.ok(run.truth.found.length < G.COOP.truth.need, "B1 只有壹間沒有安全的選項");
  assert.strictEqual(run.phase, "floorDone", "湊不齊就不用猜");
  const o = three();
  G.setRng(() => 0.15); // 骰子都很小（11）：技能、理智都過
  o.run.team.forEach(it => { it.pick.稀有度 = "不可名狀"; });
  walkFloor(o.run, o.Ps, ["a", "b", "c"], { pick: run => run.room.choices.findIndex(c => c.type !== "none") });
  const t = o.run.truth, res = G.COOP_RESIDENTS.find(x => x.id === t.id);
  assert.ok(t.found.length >= G.COOP.truth.need, "4 間過了至少 3 個：" + t.found.length);
  assert.strictEqual(new Set(t.found.map(x => x.kind)).size, t.found.length);
  t.found.forEach(x => assert.ok(res.ev.includes(x.kind)));
  assert.strictEqual(o.run.phase, "guess");
});
T("證據：理智低的人找到的可能是假的；大家看得到找到什麼，看不到哪個是假的", () => {
  const { run, Ps } = party([{ id: "a", san: 20 }]);
  run.truth.found = []; G.setRng(() => 0.5);
  let fakes = 0;
  for (let i = 0; i < 60; i++) {
    run.truth.found = []; run.idx = i % 4; run.seed = 1000 + i;
    const e = G.coopDropEvidence(run, Ps, { pick: 0 }, { type: "skill", success: true, by: "a" });
    if (e && e.fake) fakes++;
  }
  assert.ok(fakes > 5 && fakes < 45, "假的要有一些：" + fakes);
  run.truth.found = [{ kind: "foot", by: "a", room: "1a", fake: true }];
  const v = G.viewFor(run, "a");
  assert.strictEqual(v.truth.found[0].fake, undefined);
  assert.strictEqual(v.truth.fakes, undefined);
  run.truth.done = true;
  assert.deepStrictEqual(J(G.viewFor(run, "a").truth.fakes), ["foot"]);
});
function atGuess(specs) {
  const o = party(specs || [{ id: "a" }, { id: "b" }, { id: "c" }]);
  const ids = o.run.members.filter(m => !m.guard).map(m => m.id);
  const res = G.COOP_RESIDENTS.find(x => x.id === o.run.truth.id);
  o.run.truth.found = res.ev.map(kind => ({ kind, by: ids[0], room: "1a", fake: false }));
  walkFloor(o.run, o.Ps, ids);
  assert.strictEqual(o.run.phase, "guess");
  return Object.assign(o, { ids, res });
}
T("猜對：全隊拿靈感、記進《看懂的事》；今天沒獎勵的不拿靈感，一樣看懂", () => {
  const o = atGuess();
  const { run, Ps, res } = o;
  run.members[1].rewarded = false;
  const i0 = Ps.a.insp, i1 = Ps.b.insp;
  assert.ok(G.UNDERSTAND_TEXT.some(x => x.id === res.understand), "要在《看懂的事》的清單裡");
  ["a", "b", "c"].forEach(id => G.coopAct(run, Ps, id, "guess", { id: res.id }, NOW));
  const n = G.COOP.truth.insp + run.floor * G.COOP.truth.perFloor;
  assert.strictEqual(Ps.a.insp, i0 + n);
  assert.strictEqual(Ps.b.insp, i1);
  ["a", "b", "c"].forEach(id => assert.ok(Ps[id].understood[res.understand]));
  assert.strictEqual(run.truth.right, true);
  assert.strictEqual(run.phase, "floorDone");
  assert.strictEqual(G.viewFor(run, "a").truth.id, res.id);
});
T("猜錯：全隊擲理智（失敗扣比較多），不會記進《看懂的事》；都沒猜就沒事", () => {
  const o = atGuess();
  const { run, Ps, res } = o;
  const wrong = G.COOP_RESIDENTS.find(x => x.id !== res.id).id;
  const s0 = Ps.a.sanity;
  G.setRng(() => 0.99); // 擲很大：理智檢定失敗
  ["a", "b", "c"].forEach(id => G.coopAct(run, Ps, id, "guess", { id: wrong }, NOW));
  assert.strictEqual(run.truth.right, false);
  assert.ok(Ps.a.sanity < s0);
  assert.ok(!Ps.a.understood[res.understand]);
  const p = atGuess();
  const s1 = p.Ps.a.sanity;
  G.coopAct(p.run, p.Ps, "a", "tick", {}, NOW + G.COOP.truth.guessMs);
  assert.strictEqual(p.run.truth.right, null);
  assert.strictEqual(p.Ps.a.sanity, s1);
  assert.strictEqual(p.run.phase, "floorDone");
});

// ---------- 機制 5：留守 ----------
T("留守：看得到地圖、每個選項的危險度、哪個有東西；看不到房間的字。下去的人看不到地圖", () => {
  const { run } = party([{ id: "a" }, { id: "b" }, { id: "g", guard: true }]);
  const g = G.viewFor(run, "g"), a = G.viewFor(run, "a");
  assert.strictEqual(g.role, "guard");
  assert.strictEqual(g.room, null);
  assert.strictEqual(g.map.rooms.length, G.cellarFloor(1).rooms.length);
  assert.strictEqual(g.map.options.filter(o => o.hazard).length, 1);
  assert.ok(g.map.options.every(o => typeof o.danger === "number"));
  assert.strictEqual(a.map, undefined);
  assert.ok(a.room);
  assert.strictEqual(a.hasGuard, true);
  const room = G.coopRoom(run);
  assert.ok(!JSON.stringify(g.map).includes(room.title));
});
T("留守：選到有東西的選項又沒過，下面的人多扣；留守的人不扣、也不算走過這一層", () => {
  const { run, Ps } = party([{ id: "a" }, { id: "b" }, { id: "g", guard: true }]);
  run.hazard = 1; // B1 第壹間的乙是技能
  G.setRng(() => 0.99); // 擲很大：技能不過
  const san = Ps.g.sanity, a0 = Ps.a.sanity;
  const r = G.coopResolve(run, Ps, { a: 1, b: 1 });
  assert.ok(r.ok);
  assert.strictEqual(r.check.success, false);
  assert.strictEqual(run.last.hazard, true);
  assert.ok(r.fx.members.a.hazard > 0);
  assert.ok(Ps.a.sanity < a0);
  assert.strictEqual(Ps.g.sanity, san);
  assert.strictEqual(r.fx.members.g, undefined);
});
T("留守：要有人下去；只能一個；一隊只有他不行（準備區也擋）", () => {
  const P1 = person(), P2 = person();
  assert.strictEqual(G.canStartCoop([{ id: "a", P: P1, keys: [], guard: true }], 1).ok, false);
  assert.strictEqual(G.canStartCoop([{ id: "a", P: P1, keys: [], guard: true }, { id: "b", P: P2, keys: [], guard: true }], 1).ok, false);
  const p = G.newParty({ pid: "p", kind: "cellar", leader: "a", leaderNick: "a", now: NOW });
  assert.strictEqual(G.partyGuard(p, "a", true).ok, false, "一個人不能留守");
  G.partyJoin(p, "b", "b", NOW);
  assert.ok(G.partyGuard(p, "a", true).ok);
  assert.strictEqual(G.partyGuard(p, "b", true).ok, false, "只能一個");
  assert.ok(G.partyReady(p, "a", true).ok, "留守的人不用選佩佩");
  assert.ok(G.partyPick(p, "b", ["k"]).ok);
  assert.ok(G.partyReady(p, "b", true).ok);
  assert.ok(G.canStartParty(p, "a").ok);
});

// ---------- 機制 8：兩個人一起搬 ----------
function atCarry(specs) {
  const o = party(specs || [{ id: "a" }, { id: "b" }, { id: "c" }]);
  const ids = o.run.members.filter(m => !m.guard).map(m => m.id);
  o.run.carry.idx = 0;
  ids.forEach(id => G.coopAct(o.run, o.Ps, id, "vote", { choice: safe(o.run) }, NOW));
  o.run.members.forEach(m => G.coopAct(o.run, o.Ps, m.id, "ack", {}, NOW));
  assert.strictEqual(o.run.phase, "carry");
  assert.strictEqual(o.run.idx, 0);
  return Object.assign(o, { ids });
}
T("搬：一左一右都穩，全隊拿靈感；有一個人手滑，碎了、吵醒東西（下一間門檻 +1）", () => {
  const o = atCarry();
  const i0 = o.Ps.c.insp;
  G.setRng(() => 0.15); // 擲很小（11）：都不手滑
  G.coopAct(o.run, o.Ps, "a", "carry", { side: "L" }, NOW);
  G.coopAct(o.run, o.Ps, "b", "carry", { side: "R" }, NOW);
  G.coopAct(o.run, o.Ps, "c", "carry", { side: "skip" }, NOW);
  assert.strictEqual(o.run.phase, "carried");
  assert.strictEqual(o.run.carry.result.kind, "ok");
  assert.strictEqual(o.Ps.c.insp, i0 + G.COOP.carry.insp + 1);
  const p = atCarry();
  const s0 = p.Ps.c.sanity;
  G.setRng(() => 0.999); // 擲很大：手滑
  G.coopAct(p.run, p.Ps, "a", "carry", { side: "L" }, NOW);
  G.coopAct(p.run, p.Ps, "b", "carry", { side: "R" }, NOW);
  G.coopAct(p.run, p.Ps, "c", "carry", { side: "L" }, NOW); // 第三個人抓左邊：只是在旁邊
  assert.strictEqual(p.run.carry.result.kind, "slip");
  assert.ok(p.Ps.c.sanity < s0, "全隊都被吵醒的東西嚇到");
  assert.strictEqual(p.run.woken, G.COOP.carry.wake);
  assert.strictEqual(p.run.pressure.power, G.COOP.carry.wake);
  p.run.members.forEach(m => G.coopAct(p.run, p.Ps, m.id, "ack", {}, NOW));
  assert.strictEqual(p.run.idx, 1, "搬完才走到下一間");
  const before = p.run.room.choices.find(c => c.type === "power");
  if (before) assert.strictEqual(before.target, G.coopTarget(before.base, p.run.team.length, 3) + G.COOP.carry.wake);
  G.coopResolve(p.run, p.Ps, { a: safe(p.run), b: safe(p.run), c: safe(p.run) });
  assert.strictEqual(p.run.woken, 0, "吵醒的東西只影響一間");
});
T("搬：都抓同一邊撞在一起；只有一個人抬不動；沒人抬沒事；時間到照現在的算", () => {
  const o = atCarry();
  ["a", "b", "c"].forEach(id => G.coopAct(o.run, o.Ps, id, "carry", { side: "L" }, NOW));
  assert.strictEqual(o.run.carry.result.kind, "bump");
  assert.ok(o.run.woken);
  const p = atCarry();
  G.coopAct(p.run, p.Ps, "a", "carry", { side: "L" }, NOW);
  G.coopAct(p.run, p.Ps, "a", "tick", {}, NOW + G.COOP.carry.ms);
  assert.strictEqual(p.run.carry.result.kind, "alone");
  assert.ok(!p.run.woken);
  const q = atCarry();
  G.coopAct(q.run, q.Ps, "a", "tick", {}, NOW + G.COOP.carry.ms);
  assert.strictEqual(q.run.carry.result.kind, "left");
  assert.strictEqual(q.run.phase, "carried");
  assert.strictEqual(G.coopAct(q.run, q.Ps, "a", "carry", { side: "L" }, NOW).ok, false, "搬完了不能再搬");
});
T("搬：一個人的時候館方助手抬另一邊；幽靈、留守的不能抬", () => {
  const o = atCarry([{ id: "a" }]);
  G.setRng(() => 0.15);
  G.coopAct(o.run, o.Ps, "a", "carry", { side: "L" }, NOW);
  assert.strictEqual(o.run.carry.result.kind, "ok");
  assert.strictEqual(o.run.carry.result.rolls.length, 2);
  assert.strictEqual(o.run.carry.result.rolls[1].id, null);
  const p = atCarry([{ id: "a" }, { id: "b" }, { id: "g", guard: true }]);
  assert.strictEqual(G.coopAct(p.run, p.Ps, "g", "carry", { side: "L" }, NOW).ok, false);
});

// ---------- 機制 9：探險報告 ----------
T("報告：寫誰救了誰、誰看到幻覺、最驚險的一間、搞笑的一刻；存進每個人的存檔", () => {
  const { run, Ps } = party([{ id: "a", san: 20 }, { id: "b", san: 60 }, { id: "c", san: 60 }]);
  G.setRng(() => 0.99); // 都失敗：有人掉理智
  const v = run.room.choices.findIndex(c => c.type !== "none");
  ["a", "b", "c"].forEach(id => G.coopAct(run, Ps, id, "vote", { choice: v }, NOW));
  G.setRng(G.mulberry32(3));
  run.stats.saves.push({ by: "b", who: "a", san: 8 });
  const warps = [{ name: "a", from: "安全", to: "牠在後面" }];
  const r = G.coopAct(run, Ps, "a", "leave", {}, NOW); assert.ok(r.ok);
  G.coopAct(run, Ps, "b", "leave", {}, NOW);
  const end = G.coopAct(run, Ps, "c", "leave", {}, NOW, { warps, today: "2026-11-09" });
  assert.ok(end.ended);
  const rep = run.report, text = rep.lines.map(l => l.t).join("|");
  assert.strictEqual(rep.date, "2026-11-09");
  assert.ok(text.includes("a") && text.includes("8"), text);
  assert.ok(rep.lines.some(l => l.k === "halluc"), text);
  assert.ok(rep.lines.some(l => l.k === "scary"), text);
  assert.ok(text.includes("牠在後面"), text);
  assert.strictEqual(G.viewFor(run, "c").report.id, rep.id);
  assert.ok(!JSON.stringify(rep).includes('"id":"a"'), "報告裡不放帳號編號");
});
T("報告存檔：最多留幾張，舊的掉出去，掛在展廳的留著；換參觀者不會不見；舊存檔讀得回來", () => {
  const P = person();
  P.hallReport = "r0";
  for (let i = 0; i <= G.COOP.report.keep + 2; i++) G.coopSaveReport(P, { id: "r" + i, lines: [] });
  assert.strictEqual(P.coopReports.length, G.COOP.report.keep);
  assert.ok(P.coopReports.some(r => r.id === "r0"), "掛著的留著");
  assert.strictEqual(P.coopReports[0].id, "r" + (G.COOP.report.keep + 2));
  assert.ok(!G.VISITOR_KEYS.includes("coopReports"));
  G.coopSaveReport(P, { id: "r0", lines: [1] });
  assert.strictEqual(P.coopReports.filter(r => r.id === "r0").length, 1, "同一趟只留一張");
  const save = G.newSave(); save.profiles.challenge = P;
  assert.ok(G.migrateSave(J(save)).profiles.challenge.coopReports.length > 0);
});
console.log(`${pass} passed, ${fail} failed（合作地下好玩的機制）`);
process.exit(fail ? 1 : 0);
