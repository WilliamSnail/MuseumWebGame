// 合作地下收藏庫的規則（shared/coop.js）：node test/coop.test.cjs（npm test 也會跑）
// 投票、強度門檻放大、技能找最高的人、每個人各自扣理智、受傷是自己的佩佩、第一次過關各自算、rewarded、館方助手、撤退、幽靈、viewFor、同一個種子一樣。
// 數字一律讀 COOP、NUM、CELLAR；會擲骰的都固定骰子。
const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");
const { load } = require("./load_shared.cjs");
let G = load();
let pass = 0, fail = 0;
const T = (name, fn) => { try { G = load(); fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 3).join("\n    ")); } };
const d100 = N => { const t = N === 100 ? 0 : Math.floor(N / 10), u = N === 100 ? 0 : N % 10; return [(t + 0.5) / 10, (u + 0.5) / 10]; };
const dN = (v, n) => (v - 0.5) / n; // 讓 1Dn 擲出 v
function seq(...vals) { const q = vals.flat(); return () => q.length ? q.shift() : 0.5; }
const J = x => JSON.parse(JSON.stringify(x)); // vm 裡的物件拿出來比（見 docs/架構.md 第 6 節）
const DATE = "2026-11-08";
const BASE = { 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" };
function person(job = "detective") {
  const P = G.newProfile("challenge"); G.ensureDay(P, DATE);
  P.tutorialDone = true; P.insp = 100;
  G.assignJob(P, job);
  G.SKILLS.forEach(s => { P.skills[s] = 20; });
  P.day.quirkGiven = true; // 測試不想被「一天掉超過 1/5 得到怪癖」打斷（要測的那一項自己打開）
  return P;
}
const mk = (P, o = {}, nat = 50) => G.finishMake(P, Object.assign({}, BASE, o), { natural: nat }).key;
// 一隊：specs ＝ [{ id, job, pepes: [選項...], rewarded }]
function party(specs, floor = 1) {
  const Ps = {}, members = specs.map(s => {
    const P = person(s.job);
    if (s.best != null) P.cellar.best = s.best;
    Ps[s.id] = P;
    return { id: s.id, name: s.id, P, keys: (s.pepes || [{}]).map(o => mk(P, o)), rewarded: s.rewarded };
  });
  const st = G.startCoop(members, floor);
  assert.ok(st.ok, st.reason);
  return { run: st.run, Ps, members };
}
const roomIs = (run, id) => assert.strictEqual(G.coopRoom(run).id, id);
const choiceOf = (run, type) => G.coopRoom(run).choices.findIndex(c => c.check.type === type);
// 走到第 idx 間（只改位置，不擲骰）
const goRoom = (run, Ps, idx) => { run.idx = idx; G.coopSync(run, Ps); };

// ---------- 建一趟、館方助手 ----------
T("館方助手補到 COOP.teamMin 隻：一個人帶 1 隻補 2 隻、帶 2 隻補 1 隻；兩個人各帶 2 隻不用補", () => {
  const one = party([{ id: "a" }]).run;
  assert.strictEqual(one.team.length, G.COOP.teamMin);
  assert.strictEqual(one.team.filter(t => t.helper).length, G.COOP.teamMin - 1);
  one.team.filter(t => t.helper).forEach(t => { assert.strictEqual(t.owner, null); assert.ok(G.fromKey(t.key)); });
  assert.strictEqual(party([{ id: "a", pepes: [{}, { 顏色: "綠" }] }]).run.team.filter(t => t.helper).length, G.COOP.teamMin - 2);
  const four = party([{ id: "a", pepes: [{}, { 顏色: "綠" }] }, { id: "b", pepes: [{}, { 顏色: "綠" }] }]).run;
  assert.strictEqual(four.team.length, 4); assert.ok(four.team.every(t => !t.helper));
  // 助手不投票、不會受傷
  assert.deepStrictEqual(J(G.coopVoters(one).map(m => m.id)), ["a"]);
});
T("檢查：人數、每人帶幾隻、重複、受傷、隊伍上限、自由模式、層數照每個人自己的進度", () => {
  const A = person(), B = person();
  const a = [mk(A), mk(A, { 顏色: "綠" })], b = [mk(B), mk(B, { 顏色: "綠" })];
  const can = ms => G.canStartCoop(ms, 1);
  assert.ok(can([{ id: "a", P: A, keys: [a[0]] }]).ok);
  assert.ok(!can([]).ok);
  assert.ok(!G.canStartCoop([{ id: "a", P: A, keys: [a[0]] }], 99).ok, "沒有這一層");
  assert.ok(!can([{ id: "a", P: A, keys: [] }]).ok, "至少帶 1 隻");
  assert.ok(!can([{ id: "a", P: A, keys: [a[0], a[0]] }]).ok, "同一個人的佩佩不能重複");
  assert.ok(!can([{ id: "a", P: A, keys: [a[0], a[1], a[0]] }]).ok, "最多帶 COOP.eachMax 隻");
  assert.ok(!can([{ id: "a", P: A, keys: ["普通|開心|黃|沒有|站著|沒有|沒有"] }]).ok, "收藏裡沒有的");
  assert.ok(!can([{ id: "a", P: A, keys: [a[0]] }, { id: "a", P: B, keys: [b[0]] }]).ok, "帳號重複");
  assert.ok(can([{ id: "a", P: A, keys: [a[0]] }, { id: "b", P: B, keys: [b[0]] }]).ok, "不同的人帶一樣的佩佩可以");
  const five = [0, 1, 2, 3, 4].map(i => { const P = person(); return { id: "p" + i, P, keys: [mk(P)] }; });
  assert.ok(!can(five).ok, "最多 COOP.maxPlayers 個人");
  const big = [0, 1, 2, 3].map(i => { const P = person(); return { id: "p" + i, P, keys: [mk(P), mk(P, { 顏色: "綠" })] }; });
  const r = can(big);
  assert.ok(!r.ok && r.reason.includes(String(G.COOP.teamMax)), "4 個人都帶 2 隻是 8 隻，超過上限");
  big[2].keys = big[2].keys.slice(0, 1); big[3].keys = big[3].keys.slice(0, 1);
  assert.ok(can(big).ok, "2+2+1+1 ＝ 6 隻可以");
  A.injured[a[0]] = G.addDays(DATE, 2);
  assert.ok(!can([{ id: "a", P: A, keys: [a[0]] }]).ok, "受傷的不能下去");
  const F = G.newProfile("free"); G.ensureDay(F, DATE);
  assert.ok(!can([{ id: "f", P: F, keys: [mk(F)] }]).ok, "自由模式不行");
  // 層數：小明走過 B1、小華沒有 → B2 不行（說是誰），B1 可以
  A.cellar.best = 1;
  const r2 = G.canStartCoop([{ id: "a", P: A, keys: [a[1]] }, { id: "b", name: "小華", P: B, keys: [b[0]] }], 2);
  assert.ok(!r2.ok); assert.strictEqual(r2.who, "b"); assert.ok(r2.reason.includes("小華"));
  B.cellar.best = 1;
  assert.ok(G.canStartCoop([{ id: "a", P: A, keys: [a[1]] }, { id: "b", P: B, keys: [b[0]] }], 2).ok);
});
T("建一趟：狀態裡沒有 P，可以直接存成 JSON；記下每個人的理智、這一位走到第幾層", () => {
  const { run, Ps } = party([{ id: "a" }, { id: "b", job: "historian" }]);
  assert.strictEqual(run.phase, "vote"); assert.strictEqual(run.leader, "a");
  assert.strictEqual(JSON.stringify(J(run)), JSON.stringify(run));
  assert.ok(!JSON.stringify(run).includes("\"pepes\""), "沒有把整份存檔放進來");
  run.members.forEach(m => { assert.strictEqual(m.san, Ps[m.id].sanity); assert.strictEqual(m.ghost, false); assert.strictEqual(m.rewarded, true); });
  assert.strictEqual(Ps.a.visit.deepest, 1);
  assert.strictEqual(run.room.id, G.CELLAR[0].rooms[0].id);
  assert.strictEqual(run.room.choices.length, G.CELLAR[0].rooms[0].choices.length);
});

// ---------- 投票 ----------
T("投票：多數決；沒投、亂投、幽靈投的算棄權；字串的號碼也收", () => {
  const { run } = party([{ id: "a" }, { id: "b" }, { id: "c" }]);
  let v = G.coopTally(run, { a: 0, b: "0", c: 1 });
  assert.strictEqual(v.pick, 0); assert.strictEqual(v.by, "majority"); assert.deepStrictEqual(J(v.tied), []);
  v = G.coopTally(run, { a: 9, b: 1, c: -1, x: 0 });
  assert.strictEqual(v.pick, 1); assert.deepStrictEqual(J(v.abstain), ["a", "c"]);
  assert.ok(!("x" in v.votes), "不是隊員的票不算");
  run.members[1].ghost = true;
  v = G.coopTally(run, { a: 0, b: 1, c: 1 });
  assert.strictEqual(v.counts.find(x => x.v === 1).n, 1, "幽靈的票不算");
});
T("投票平手：領隊決定（tieBreak → 領隊自己投的）；領隊沒投就挑安全的，再挑號碼小的", () => {
  const { run, Ps } = party([{ id: "a" }, { id: "b" }, { id: "c" }]);
  roomIs(run, "1a");
  const safe = choiceOf(run, "none");
  assert.strictEqual(G.coopTally(run, { a: 0, b: 1 }).pick, 0, "領隊 a 投 0");
  assert.strictEqual(G.coopTally(run, { a: 0, b: 1 }).by, "leader");
  assert.strictEqual(G.coopTally(run, { a: 0, b: 1 }, 1).pick, 1, "伺服器另外問了領隊");
  assert.strictEqual(G.coopTally(run, { a: 0, b: 1 }, safe).pick, 0, "tieBreak 不在平手裡就不算");
  let v = G.coopTally(run, { b: 0, c: safe });
  assert.strictEqual(v.pick, safe); assert.strictEqual(v.by, "safe");
  v = G.coopTally(run, { b: 1, c: 0 });
  assert.strictEqual(v.pick, 0); assert.strictEqual(v.by, "first");
  v = G.coopTally(run, {});
  assert.strictEqual(v.pick, safe, "大家都棄權：所有選項平手，挑安全的"); assert.strictEqual(v.abstain.length, 3);
  // 1c 沒有安全的選項：大家都棄權就挑第一個
  goRoom(run, Ps, 2); roomIs(run, "1c");
  assert.strictEqual(choiceOf(run, "none"), -1);
  assert.strictEqual(G.coopTally(run, {}).pick, 0);
  // 撤退跟選項平手：不會自己撤退
  goRoom(run, Ps, 0);
  assert.strictEqual(G.coopTally(run, { b: "retreat", c: 1 }).pick, 1);
  assert.strictEqual(G.coopTally(run, { a: "retreat", b: 1 }).pick, "retreat", "領隊投撤退，平手就撤退");
});
T("領隊每間輪一個人；幽靈、離隊的跳過", () => {
  const { run, Ps } = party([{ id: "a" }, { id: "b" }, { id: "c" }]);
  const safe = () => choiceOf(run, "none") >= 0 ? choiceOf(run, "none") : choiceOf(run, "san");
  G.setRng(() => 0.15); // 理智檢定擲 11，都過
  const leaders = [];
  for (let i = 0; i < 4; i++) {
    leaders.push(run.leader);
    assert.strictEqual(run.room.leader, run.leader);
    assert.ok(G.coopResolve(run, Ps, { a: safe(), b: safe(), c: safe() }).ok);
    if (i < 3) { if (i === 1) run.members[2].ghost = true; G.coopAdvance(run, Ps); }
  }
  G.setRng(null);
  assert.deepStrictEqual(leaders, ["a", "b", "a", "b"], "第 3 間開始 c 是幽靈，跳過");
});

// ---------- 強度 ----------
T("強度門檻照隊伍放大：3 隻、1 個人跟單人一樣；隻數、人數越多越高；骰子那份不放大", () => {
  const C = G.COOP;
  CELLAR_TARGETS().forEach(t => {
    assert.strictEqual(G.coopTarget(t, C.baseTeam, 1), t);
    const want = (n, p) => Math.round(t + (t - C.dice) * (n - C.baseTeam) / C.baseTeam * C.scale + C.perPlayer * (p - 1));
    [[3, 2], [4, 2], [6, 3], [4, 4], [6, 4]].forEach(([n, p]) => assert.strictEqual(G.coopTarget(t, n, p), want(n, p)));
    assert.ok(G.coopTarget(t, 6, 1) > G.coopTarget(t, 4, 1) && G.coopTarget(t, 4, 1) >= G.coopTarget(t, 3, 1));
    assert.ok(G.coopTarget(t, 3, 3) >= G.coopTarget(t, 3, 1));
    assert.ok(G.coopTarget(t, 6, 1) < t * 2, "6 隻不是直接 ×2（骰子不會變大）");
  });
});
function CELLAR_TARGETS() { const out = []; G.CELLAR.forEach(f => f.rooms.forEach(r => r.choices.forEach(c => { if (c.check.type === "power") out.push(c.check.target); }))); return out; }
T("強度：全隊一起算（沿用 teamPower），力氣大／沒力氣每位各自算；擲一次，大家同一顆", () => {
  const { run, Ps } = party([{ id: "a", pepes: [{ 姿勢: "比讚" }, { 顏色: "黃" }] }, { id: "b", pepes: [{ 帽子: "巫師帽" }] }]);
  Ps.a.perk = "strong"; Ps.b.flaw = "weak";
  const room = G.coopRoom(run);
  const base = G.teamPower(null, run.team, room).total;
  const sum = run.team.reduce((n, it) => n + G.memberPower(it, room), 0);
  assert.strictEqual(base, sum + run.team.length + 2, "比讚 +隻數、巫師帽 +2，看整隊");
  const strong = G.traitById("strong").power, weak = G.traitById("weak").power;
  const tp = G.coopPower(run, Ps, room);
  assert.strictEqual(tp.total, Math.max(0, base + strong + weak));
  assert.strictEqual(tp.notes.length, 4);
  // 一個人的時候跟單人的 teamPower 一模一樣
  const solo = party([{ id: "s", pepes: [{ 姿勢: "比讚" }, { 顏色: "黃" }] }]);
  solo.Ps.s.perk = "strong";
  assert.strictEqual(G.coopPower(solo.run, solo.Ps, room).total, G.teamPower(solo.Ps.s, solo.run.team, room).total);
  // 擲：強度＋1D10 ≥ 門檻
  G.coopSync(run, Ps);
  const i = choiceOf(run, "power"), ch = room.choices[i];
  const target = G.coopTargetOf(run, ch.check.target);
  assert.strictEqual(run.room.choices[i].target, target); assert.strictEqual(run.room.choices[i].power, tp.total);
  const need = Math.min(10, Math.max(1, target - tp.total));
  G.setRng(seq(dN(need, 10)));
  const r = G.coopResolve(run, Ps, { a: i, b: i });
  G.setRng(null);
  assert.strictEqual(r.check.target, target); assert.strictEqual(r.check.total, tp.total + need);
  assert.strictEqual(r.check.success, tp.total + need >= target);
});
T("皇冠：全隊一層重擲一次；觸手帽：帶牠的人才付理智", () => {
  // 生氣的佩佩在 1a（傷心的房間）被剋，強度 0：觸手帽 +5 也推不動
  const { run, Ps } = party([{ id: "a", pepes: [{ 帽子: "皇冠", 心情: "生氣" }] }, { id: "b", pepes: [{ 帽子: "觸手帽", 心情: "生氣" }] }]);
  const i = choiceOf(run, "power");
  G.setRng(seq(dN(1, 10), dN(1, 10), dN(1, 3), dN(2, 3), dN(3, 3), dN(1, 2)));
  // 1a 推箱子：擲 1、皇冠重擲 1，都不夠；a 扣 1D3（擲 1）、b 扣 1D3（擲 2）＋觸手帽 1D3（擲 3）；受傷那隻用 0.25 挑
  const r = G.coopResolve(run, Ps, { a: i, b: i });
  G.setRng(null);
  assert.ok(!r.check.success); assert.ok(r.check.rerolled); assert.ok(run.used.crown);
  assert.deepStrictEqual(J(r.check.tentacle), ["b"]);
  assert.strictEqual(r.fx.members.a.sanLoss, 1);
  assert.strictEqual(r.fx.members.b.sanLoss, 2 + 3);
  // 下一間再失敗：皇冠這一層用過了
  G.coopAdvance(run, Ps);
  const j = choiceOf(run, "power");
  G.setRng(seq(dN(1, 10)));
  const r2 = G.coopResolve(run, Ps, { a: j, b: j });
  G.setRng(null);
  assert.ok(!r2.check.rerolled);
});

// ---------- 技能 ----------
T("技能：隊上這個技能最高的人擲（用他自己的 P）；一樣高領隊先；幽靈不擲", () => {
  const { run, Ps } = party([{ id: "a" }, { id: "b", job: "historian" }, { id: "c", job: "occultist" }]);
  Ps.a.skills.偵查 = 30; Ps.b.skills.偵查 = 70; Ps.c.skills.偵查 = 50;
  G.coopSync(run, Ps);
  const i = G.coopRoom(run).choices.findIndex(c => c.check.type === "skill");
  const ch = G.coopRoom(run).choices[i];
  assert.strictEqual(ch.check.skill, "偵查");
  assert.strictEqual(G.coopRoller(run, Ps, "偵查"), "b");
  assert.strictEqual(run.room.choices[i].by, "b");
  assert.strictEqual(run.room.choices[i].value, G.clampN(70 + (ch.check.mod || 0), 1, 99));
  Ps.a.skills.偵查 = 70;
  assert.strictEqual(G.coopRoller(run, Ps, "偵查"), "a", "一樣高：a 是這一間的領隊");
  run.members[0].ghost = true; run.members[1].ghost = true;
  assert.strictEqual(G.coopRoller(run, Ps, "偵查"), "c", "幽靈不擲");
  run.members[0].ghost = false; run.members[1].ghost = false; Ps.a.skills.偵查 = 30;
  G.setRng(seq(d100(5)));
  const r = G.coopResolve(run, Ps, { a: i, b: i, c: i });
  G.setRng(null);
  assert.strictEqual(r.check.by, "b"); assert.ok(r.check.success);
  assert.ok(Ps.b.skillTicks.偵查, "擲的人技能會成長"); assert.ok(!Ps.a.skillTicks.偵查);
  // 成功：每個人都拿靈感（各自第一次過這一間）
  ["a", "b", "c"].forEach(id => assert.strictEqual(r.fx.members[id].insp, ch.success.insp));
});

// ---------- 理智 ----------
T("理智檢定：每個人各自擲、各自扣；過的人照自己的結果拿", () => {
  const { run, Ps } = party([{ id: "a" }, { id: "b" }]);
  goRoom(run, Ps, 2); roomIs(run, "1c");
  const i = choiceOf(run, "san"), ch = G.coopRoom(run).choices[i];
  // a 擲 05 過（扣 0）；b 擲 95 沒過，失敗扣 1D3 擲 3；a 第一次過這一間，回 +1D2 擲 2
  G.setRng(seq(d100(5), d100(95), dN(3, 3), dN(2, 2)));
  const r = G.coopResolve(run, Ps, { a: i, b: i });
  G.setRng(null);
  assert.ok(r.check.san.a.success); assert.ok(!r.check.san.b.success);
  assert.strictEqual(Ps.a.sanity, G.NUM.startSanity + 2);
  assert.strictEqual(Ps.b.sanity, G.NUM.startSanity - 3);
  assert.strictEqual(run.members[0].san, Ps.a.sanity); assert.strictEqual(run.members[1].san, Ps.b.sanity);
  assert.ok(r.events.a.some(e => e.type === "sanCheck" && e.success)); assert.ok(r.events.a.some(e => e.type === "sanGain" && e.gain === 2));
  assert.ok(r.events.b.some(e => e.type === "sanLoss" && e.loss === 3)); assert.ok(!r.events.b.some(e => e.type === "sanGain"));
  assert.ok(Ps.a.cellar.won["1c"]); assert.ok(!Ps.b.cellar.won["1c"]);
  assert.ok(Ps.a.cellar.cleared["1c"] && Ps.b.cellar.cleared["1c"]);
  assert.ok(ch.success.san.startsWith("+"));
});
T("強度、技能失敗：房間扣的理智每個人各擲各的；棒球帽只擋帶牠的人", () => {
  const { run, Ps } = party([{ id: "a" }, { id: "b", pepes: [{ 帽子: "棒球帽" }] }, { id: "c" }]);
  goRoom(run, Ps, 1); roomIs(run, "1b");
  const i = choiceOf(run, "power");
  G.setRng(seq(dN(1, 10), dN(1, 3), dN(3, 3), dN(2, 3)));
  const r = G.coopResolve(run, Ps, { a: i, b: i, c: i });
  G.setRng(null);
  assert.ok(!r.check.success);
  assert.strictEqual(Ps.a.sanity, G.NUM.startSanity - 1);
  assert.strictEqual(Ps.b.sanity, G.NUM.startSanity, "b 的棒球帽擋下了");
  assert.deepStrictEqual(J(r.fx.members.b.blocked), ["cap"]);
  assert.strictEqual(Ps.c.sanity, G.NUM.startSanity - 2, "b 擲的 3 被擋掉，c 擲自己的");
  assert.ok(run.members[1].used.cap);
});
T("扣理智之後照舊：一次掉 5 點以上擲看懂檢定、看懂了瘋狂發作；一天掉太多得到怪癖；怕黑多扣", () => {
  const { run, Ps } = party([{ id: "a" }, { id: "b" }]);
  Ps.a.day.quirkGiven = false; Ps.b.flaw = "darkfear";
  goRoom(run, Ps, 3); roomIs(run, "1d");
  const i = choiceOf(run, "power");
  // 1d 敲水管失敗：扣 1D3。a 擲 3，先讓 a 一天已經掉了 8 → 掉到 11 ≥ 50/5 → 怪癖
  Ps.a.day.lost = 8;
  G.setRng(seq(dN(1, 10), dN(3, 3), dN(1, 3), dN(1, 2)));
  const r = G.coopResolve(run, Ps, { a: i, b: i });
  G.setRng(null);
  assert.ok(r.events.a.some(e => e.type === "quirk"), "a 得到怪癖");
  assert.strictEqual(Ps.a.quirks.length, 1);
  const dark = G.traitById("darkfear").cellarSan;
  assert.strictEqual(r.fx.members.b.sanLoss, 1 + dark); assert.strictEqual(r.fx.members.b.dark, dark);
  // 一次掉 5 點以上：看懂檢定（擲 01 一定看懂）→ 瘋狂發作
  const m = run.members[1], ev = [];
  G.setRng(seq(d100(1), dN(3, 10), dN(4, 10)));
  G.coopSanHit(Ps.b, m, 6, "cellar:1d", null, ev);
  G.setRng(null);
  assert.deepStrictEqual(J(ev.map(e => e.type)), ["sanLoss", "understand", "bout"]);
  assert.ok(ev[1].success); assert.ok(Ps.b.bout); assert.strictEqual(ev[1].line.id, G.understandId("cellar:1d"));
});
T("探險燈（兌換所，決定 0032）：合作地下也少扣，最少還是扣 1；理智檢定的房間也少扣", () => {
  const lamp = (P) => { G.storyState(P).stamps = 99; assert.ok(G.buyGear(P, "lamp", DATE).ok); assert.ok(G.wearGear(P, "lamp").ok); };
  const off = G.GEAR_ITEMS.find(x => x.id === "lamp").cellarSan;
  // 1d 敲水管失敗：扣 1D3，兩個人都擲 3
  {
    const { run, Ps } = party([{ id: "a" }, { id: "b" }]);
    lamp(Ps.b);
    goRoom(run, Ps, 3); roomIs(run, "1d");
    const i = choiceOf(run, "power");
    G.setRng(seq(dN(1, 10), dN(3, 3), dN(3, 3)));
    const r = G.coopResolve(run, Ps, { a: i, b: i });
    G.setRng(null);
    assert.strictEqual(r.fx.members.a.sanLoss, 3);
    assert.strictEqual(r.fx.members.b.sanLoss, 3 + off); assert.strictEqual(r.fx.members.b.dark, off);
  }
  // 兩個人都擲 1：扣 1 點的照扣
  {
    const { run, Ps } = party([{ id: "a" }, { id: "b" }]);
    lamp(Ps.b);
    goRoom(run, Ps, 3);
    const i = choiceOf(run, "power");
    G.setRng(seq(dN(1, 10), dN(1, 3), dN(1, 3)));
    const r = G.coopResolve(run, Ps, { a: i, b: i });
    G.setRng(null);
    assert.strictEqual(r.fx.members.b.sanLoss, 1);
  }
  // 理智檢定的房間：骰子一樣，戴燈的少扣 1（扣在 check 那一次，不會變成負的）
  {
    const { run, Ps } = party([{ id: "a" }, { id: "b" }]);
    lamp(Ps.b);
    const f1 = G.cellarFloor(1).rooms, idx = f1.findIndex(rm => rm.choices.some(c => c.check.type === "san"));
    assert.ok(idx >= 0, "B1 要有理智檢定的房間");
    goRoom(run, Ps, idx);
    const i = choiceOf(run, "san");
    G.setRng(() => 0.99); // 都擲最大：理智檢定失敗、扣最多
    const r = G.coopResolve(run, Ps, { a: i, b: i });
    G.setRng(null);
    assert.ok(G.NUM.startSanity - Ps.a.sanity >= 2, "這間要扣 2 點以上才看得出來");
    assert.strictEqual(Ps.b.sanity - Ps.a.sanity, -off, "戴燈的少扣");
    r.events.b.filter(e => e.type === "sanLoss").forEach(e => assert.ok(e.loss > 0));
  }
});
T("全隊的理智壓力：平均理智越低，門檻越高、技能越難、失敗多扣（幽靈算 0）", () => {
  const { run, Ps } = party([{ id: "a" }, { id: "b" }]);
  const P0 = G.coopPressure(run);
  assert.strictEqual(P0.lv, 0); assert.strictEqual(P0.avg, G.NUM.startSanity);
  const i = choiceOf(run, "power"), base = G.coopTarget(G.coopRoom(run).choices[i].check.target, run.team.length, 2);
  const k = G.coopRoom(run).choices.findIndex(c => c.check.type === "skill");
  const skill0 = run.room.choices[k].value;
  G.COOP.pressure.forEach(p => {
    Ps.a.sanity = Ps.b.sanity = p.below - 1;
    G.coopSync(run, Ps);
    const lvl = G.COOP.pressure.filter(x => p.below - 1 < x.below).sort((x, y) => y.lv - x.lv)[0];
    assert.strictEqual(run.pressure.lv, lvl.lv);
    assert.strictEqual(run.room.choices[i].target, base + lvl.power);
    assert.strictEqual(run.room.choices[k].value, Math.max(1, skill0 + lvl.skill));
  });
  // 幽靈算 0：a 50、b 幽靈 → 平均 25
  Ps.a.sanity = 50; Ps.b.sanity = 0; run.members[1].ghost = true;
  G.coopSync(run, Ps);
  assert.strictEqual(run.pressure.avg, 25);
  // 失敗多扣：用最高那一級
  const top = G.COOP.pressure.slice().sort((x, y) => y.lv - x.lv)[0];
  run.members[1].ghost = false; Ps.a.sanity = Ps.b.sanity = top.below - 1;
  G.coopSync(run, Ps);
  G.setRng(seq(dN(1, 10), dN(1, 3), dN(1, 3), dN(1, 2)));
  const r = G.coopResolve(run, Ps, { a: i, b: i });
  G.setRng(null);
  assert.ok(!r.check.success);
  assert.strictEqual(r.fx.members.a.pressure, top.failSan);
  assert.strictEqual(r.fx.members.a.sanLoss, 1 + top.failSan);
});

// ---------- 受傷 ----------
T("受傷：誰的佩佩誰受傷（記在他自己的 P）；館方助手不會受傷；同一隻不同人帶，只傷到被挑中的那位", () => {
  const { run, Ps, members } = party([{ id: "a" }, { id: "b" }]);
  assert.strictEqual(members[0].keys[0], members[1].keys[0], "兩個人帶一模一樣的佩佩");
  const key = members[1].keys[0], i = choiceOf(run, "power");
  // 1a 推箱子失敗：a、b 各扣 1D3，受傷從 a、b 的佩佩挑（0.75 → 第 2 隻，b 的）
  G.setRng(seq(dN(1, 10), dN(1, 3), dN(1, 3), 0.75));
  const r = G.coopResolve(run, Ps, { a: i, b: i });
  G.setRng(null);
  assert.strictEqual(r.fx.injured.length, 1); assert.strictEqual(r.fx.injured[0].owner, "b");
  assert.strictEqual(Ps.b.injured[key], G.addDays(DATE, G.injureDaysOf(Ps.b)));
  assert.ok(!Ps.a.injured[key], "a 的那一隻沒事");
  assert.ok(r.events.b.some(e => e.type === "injured" && e.key === key)); assert.ok(!r.events.a.some(e => e.type === "injured"));
  assert.deepStrictEqual(J(run.members[1].got.injured), [key]);
  // 一個人＋助手：一定傷到自己的
  const solo = party([{ id: "s" }]);
  G.setRng(seq(dN(1, 10), dN(1, 3), 0.99));
  const r2 = G.coopResolve(solo.run, solo.Ps, { s: i });
  G.setRng(null);
  assert.strictEqual(r2.fx.injured[0].owner, "s");
});
T("受傷的保護：斯拉夫蹲全隊一層擋一次，棒球帽帶的人一層擋一次；手腳俐落早一天好", () => {
  const { run, Ps } = party([{ id: "a", pepes: [{ 姿勢: "斯拉夫蹲" }] }, { id: "b", pepes: [{ 帽子: "棒球帽" }] }]);
  Ps.a.perk = "nimble";
  const ev = G.coopNewEvents(run);
  assert.strictEqual(G.coopInjure(run, Ps, run.team, ev).what, "squat");
  const cap = G.coopInjure(run, Ps, run.team, ev);
  assert.strictEqual(cap.what, "cap"); assert.strictEqual(cap.by, "b");
  G.setRng(seq(0.1));
  const hurt = G.coopInjure(run, Ps, run.team, ev);
  G.setRng(null);
  assert.strictEqual(hurt.type, "injured"); assert.strictEqual(hurt.owner, "a");
  assert.strictEqual(hurt.days, Math.max(1, G.NUM.injureDays + G.traitById("nimble").injure));
  assert.ok(ev.a.some(e => e.what === "squat") && ev.b.some(e => e.what === "squat"), "擋下來大家都看得到");
});

// ---------- 第一次過關、rewarded ----------
// 走完 B1：每一間都選安全的，沒有安全的選理智檢定（骰子固定 0.15：d100 擲 11 一定過）
function walkFloor(run, Ps) {
  const all = {};
  run.members.forEach(m => { all[m.id] = []; });
  G.setRng(() => 0.15);
  let last = null;
  while (run.phase === "vote") {
    const room = G.coopRoom(run);
    const pick = room.choices.findIndex(c => c.check.type === "none") >= 0 ? room.choices.findIndex(c => c.check.type === "none") : room.choices.findIndex(c => c.check.type === "san");
    const votes = {}; G.coopVoters(run).forEach(m => { votes[m.id] = pick; });
    const r = G.coopResolve(run, Ps, votes);
    Object.keys(r.events).forEach(id => all[id].push(...r.events[id]));
    if (run.phase === "over") break;
    last = G.coopAdvance(run, Ps);
    Object.keys(last.events).forEach(id => all[id].push(...last.events[id]));
  }
  G.setRng(null);
  return { last, all };
}
T("第一次過關各自算：老手沒有層的獎勵、新手有；best、floorsDone 寫進各自的 P；單人的 P.cellar.run 不動", () => {
  const { run, Ps } = party([{ id: "old", best: 1 }, { id: "new" }]);
  Ps.old.cellar.floorsDone[1] = "2026-11-01";
  G.CELLAR[0].rooms.forEach(r => { Ps.old.cellar.won[r.id] = true; Ps.old.cellar.cleared[r.id] = true; });
  const solo = { floor: 3, idx: 1, team: [], used: {}, log: [] };
  Ps.old.cellar.run = solo;
  const before = { old: Ps.old.insp, new: Ps.new.insp };
  const { last, all } = walkFloor(run, Ps);
  assert.ok(last.floorDone); assert.strictEqual(run.phase, "floorDone"); assert.strictEqual(run.next, 2);
  const R = G.CELLAR_REWARDS[1];
  assert.ok(!last.rewards.old.first); assert.ok(last.rewards.new.first);
  assert.strictEqual(Ps.new.cellar.best, 1); assert.ok(Ps.new.cellar.floorsDone[1]);
  assert.ok(Ps.new.unlocked[R.unlock[0]].includes(R.unlock[1]), "新手打開了這一層的選項");
  assert.ok(all.new.some(e => e.type === "floorDone" && e.first)); assert.ok(all.new.some(e => e.type === "unlock"));
  assert.ok(all.old.some(e => e.type === "floorDone" && !e.first));
  assert.ok(Ps.new.insp - before.new >= R.insp, "新手拿了層的靈感");
  assert.strictEqual(Ps.old.insp, before.old, "老手：選安全的、沒有層的獎勵，什麼都沒拿");
  assert.strictEqual(Ps.old.cellar.run, solo, "單人那一趟原封不動");
  assert.strictEqual(Ps.new.cellar.run, null);
  assert.strictEqual(Ps.new.cellar.cleared["1a"], true);
  // 單人走完 B1 拿到的，跟合作的新手一樣（同一個 cellarAdvance）
  const S = person(); S.cellar.run = { floor: 1, idx: G.CELLAR[0].rooms.length - 1, team: [], used: {}, log: [] };
  const a = G.cellarAdvance(S);
  assert.strictEqual(JSON.stringify(a.reward), JSON.stringify(last.rewards.new.reward));
});
T("每一間的靈感：第一次過全部拿；再走一次拿 NUM.cellarRepeatInsp；rewarded: false 的人再走一次不拿，第一次的照拿", () => {
  const { run, Ps } = party([{ id: "vet", rewarded: false }, { id: "vet2" }, { id: "newb", rewarded: false }]);
  ["vet", "vet2"].forEach(id => { Ps[id].cellar.won["1a"] = true; Ps[id].cellar.cleared["1a"] = true; });
  const i = G.coopRoom(run).choices.findIndex(c => c.check.type === "skill"), ch = G.coopRoom(run).choices[i];
  G.setRng(seq(d100(5)));
  const r = G.coopResolve(run, Ps, { vet: i, vet2: i, newb: i });
  G.setRng(null);
  assert.ok(r.check.success);
  assert.strictEqual(r.fx.members.vet.insp, 0);
  assert.strictEqual(r.fx.members.vet2.insp, G.NUM.cellarRepeatInsp);
  assert.strictEqual(r.fx.members.newb.insp, ch.success.insp);
  assert.strictEqual(run.members.find(m => m.id === "vet").rewarded, false);
  // 第一次過關的層獎勵：rewarded: false 也照拿
  const t = party([{ id: "x", rewarded: false }]);
  const { last } = walkFloor(t.run, t.Ps);
  assert.ok(last.rewards.x.first); assert.strictEqual(last.rewards.x.reward.insp, G.CELLAR_REWARDS[1].insp);
});
T("躺平、毛帽看整隊：每個人每一層第一次走的那間各回一次（老手不回）", () => {
  const { run, Ps } = party([{ id: "a", pepes: [{ 姿勢: "躺平" }] }, { id: "b" }, { id: "vet", best: 1 }]);
  G.CELLAR[0].rooms.forEach(r => { Ps.vet.cellar.cleared[r.id] = true; });
  Ps.a.sanity = Ps.b.sanity = Ps.vet.sanity = 30; G.coopSync(run, Ps);
  const safe = choiceOf(run, "none");
  G.setRng(seq(dN(3, 3), dN(2, 3)));
  const r = G.coopResolve(run, Ps, { a: safe, b: safe, vet: safe });
  G.setRng(null);
  assert.strictEqual(Ps.a.sanity, 33); assert.strictEqual(Ps.b.sanity, 32, "b 沒帶躺平的，也回（看整隊）");
  assert.strictEqual(Ps.vet.sanity, 30, "老手走過了，不回");
  assert.ok(r.events.b.some(e => e.type === "sanGain" && e.why === "躺平"));
  G.coopAdvance(run, Ps);
  const s2 = choiceOf(run, "none");
  G.coopResolve(run, Ps, { a: s2, b: s2, vet: s2 });
  assert.strictEqual(Ps.a.sanity, 33, "一層只回一次");
});

// ---------- 撤退、結束、離隊 ----------
T("撤退：多數投撤退就結束；走過的房間照算，這一層沒走完沒有層的獎勵", () => {
  const { run, Ps } = party([{ id: "a" }, { id: "b" }, { id: "c" }]);
  const k = G.coopRoom(run).choices.findIndex(c => c.check.type === "skill");
  G.setRng(seq(d100(5)));
  G.coopResolve(run, Ps, { a: k, b: k, c: k });
  G.setRng(null);
  const insp = Ps.a.insp;
  G.coopAdvance(run, Ps);
  const r = G.coopResolve(run, Ps, { a: "retreat", b: "retreat", c: 0 });
  assert.ok(r.ok && r.retreat);
  assert.strictEqual(run.phase, "over"); assert.strictEqual(run.over, "retreat");
  assert.strictEqual(Ps.a.insp, insp); assert.ok(!Ps.a.cellar.floorsDone[1]); assert.strictEqual(Ps.a.cellar.best, 0);
  assert.ok(Ps.a.cellar.won["1a"], "第一間過了，記著");
  assert.ok(!G.coopResolve(run, Ps, { a: 0 }).ok, "結束了不能再投");
  const end = G.coopEnd(run, Ps);
  assert.strictEqual(end.run.over, "retreat"); assert.strictEqual(end.summary.length, 3);
  assert.strictEqual(end.summary[0].got.rooms, 1);
  // 也可以直接叫 coopEnd 撤退（例如大家都斷線）
  const t = party([{ id: "x" }]);
  assert.strictEqual(G.coopEnd(t.run, t.Ps, "retreat").run.over, "retreat");
});
T("往下一層：幽靈回到地面、他的佩佩跟著走、館方助手重補、這一層用過的帽子重算", () => {
  const { run, Ps } = party([{ id: "a", pepes: [{ 帽子: "皇冠" }] }, { id: "b", pepes: [{}, { 顏色: "綠" }] }]);
  walkFloor(run, Ps);
  assert.strictEqual(run.phase, "floorDone");
  run.used.crown = true; run.members[0].used.cap = true;
  run.members[1].ghost = true; Ps.b.sanity = 0;
  const c = G.coopContinue(run, Ps);
  assert.ok(c.ok); assert.strictEqual(run.floor, 2); assert.strictEqual(run.idx, 0); assert.strictEqual(run.phase, "vote");
  assert.strictEqual(run.members[1].out, "ghost"); assert.ok(c.events.b.some(e => e.type === "surface"));
  assert.ok(run.team.every(t => t.owner !== "b"));
  assert.strictEqual(run.team.length, G.COOP.teamMin);
  assert.ok(!run.used.crown); assert.ok(!run.members[0].used.cap);
  assert.strictEqual(run.leader, "a");
});
T("中途離隊：他的佩佩離開、助手補位、領隊交給下一位；沒有人能走就結束", () => {
  const { run, Ps } = party([{ id: "a" }, { id: "b" }]);
  const r = G.coopLeave(run, Ps, "a");
  assert.ok(r.ok); assert.strictEqual(run.members[0].out, "left"); assert.strictEqual(run.leader, "b");
  assert.strictEqual(run.team.filter(t => t.helper).length, G.COOP.teamMin - 1);
  assert.ok(!("a" in G.coopTally(run, { a: 0, b: 1 }).votes));
  assert.ok(!G.coopLeave(run, Ps, "a").ok, "已經走了");
  G.coopLeave(run, Ps, "b");
  assert.strictEqual(run.phase, "over"); assert.strictEqual(run.over, "lost");
});

// ---------- 幽靈 ----------
T("理智歸零變幽靈：不拿掉；不投票、不擲骰、理智不再變；這一層走完還拿層的獎勵；大家都變幽靈就結束", () => {
  const { run, Ps } = party([{ id: "a" }, { id: "b" }]);
  goRoom(run, Ps, 2); roomIs(run, "1c");
  Ps.b.sanity = 1; G.coopSync(run, Ps);
  const i = choiceOf(run, "san");
  G.setRng(seq(d100(5), d100(95), dN(1, 3), dN(1, 2)));
  const r = G.coopResolve(run, Ps, { a: i, b: i });
  G.setRng(null);
  const b = run.members[1];
  assert.ok(b.ghost); assert.strictEqual(b.out, null); assert.strictEqual(Ps.b.sanity, 0); assert.ok(Ps.b.dark);
  assert.ok(r.events.b.some(e => e.type === "ghost"));
  assert.ok(run.team.some(t => t.owner === "b"), "他的佩佩還在隊上");
  assert.strictEqual(run.phase, "result");
  assert.ok(!G.coopVoters(run).includes(b));
  G.coopAdvance(run, Ps);
  assert.strictEqual(run.leader, "a", "幽靈不當領隊");
  // 1d：失敗扣理智，幽靈不扣
  const k = choiceOf(run, "power");
  G.setRng(seq(dN(1, 10), dN(1, 3), 0.1));
  const r2 = G.coopResolve(run, Ps, { a: k, b: 0 });
  G.setRng(null);
  assert.ok(!("b" in r2.vote.votes));
  assert.strictEqual(Ps.b.sanity, 0); assert.strictEqual(r2.fx.members.b.sanLoss, 0);
  const a = G.coopAdvance(run, Ps);
  assert.ok(a.floorDone); assert.ok(a.rewards.b.first, "幽靈走完這一層，也算他走過");
  const end = G.coopEnd(run, Ps);
  assert.deepStrictEqual(J(end.ghosts), ["b"]);
  // 大家都變幽靈：這一趟到這裡
  const t = party([{ id: "x" }]);
  goRoom(t.run, t.Ps, 2); t.Ps.x.sanity = 1; G.coopSync(t.run, t.Ps);
  G.setRng(seq(d100(95), dN(2, 3)));
  G.coopResolve(t.run, t.Ps, { x: choiceOf(t.run, "san") });
  G.setRng(null);
  assert.strictEqual(t.run.phase, "over"); assert.strictEqual(t.run.over, "lost");
});

// ---------- viewFor、種子 ----------
T("viewFor：給隊員一份整份狀態的副本（現在大家看到的一樣），改了不會動到原本的；不是隊員給 null", () => {
  const { run, Ps } = party([{ id: "a" }, { id: "b" }]);
  const v = G.viewFor(run, "a");
  assert.strictEqual(v.me, "a");
  const { me, ...rest } = v;
  assert.strictEqual(JSON.stringify(rest), JSON.stringify(run));
  v.members[0].san = -5; v.team.length = 0;
  assert.strictEqual(run.members[0].san, Ps.a.sanity); assert.ok(run.team.length);
  assert.strictEqual(G.viewFor(run, "zzz"), null);
  assert.strictEqual(G.viewFor(run, "b").me, "b");
});
function seededWalk(seed) {
  G.setRng(G.mulberry32(seed));
  const { run, Ps } = party([{ id: "a", pepes: [{}, { 帽子: "棒球帽" }] }, { id: "b", job: "historian", pepes: [{ 姿勢: "躺平" }] }, { id: "c", job: "occultist" }]);
  G.setRng(G.mulberry32(seed + 1));
  const out = [];
  while (run.phase === "vote") {
    const n = G.coopRoom(run).choices.length;
    const r = G.coopResolve(run, Ps, { a: 0, b: 1 % n, c: run.idx % n });
    out.push(r.events);
    if (run.phase === "over") break;
    G.coopAdvance(run, Ps);
  }
  G.setRng(null);
  return JSON.stringify({ run, out, sans: Object.keys(Ps).map(id => [Ps[id].sanity, Ps[id].insp, Ps[id].injured, Ps[id].cellar]) });
}
T("同一個種子，結果一模一樣（伺服器重跑、測試都靠這個）", () => {
  const a = seededWalk(42), b = seededWalk(42), c = seededWalk(43);
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, c);
});
// Realtime Database 存進去再讀出來的樣子：空陣列、空物件、null 都不見，陣列變成 { 0: …, 1: … }（比真的還嚴格）
const rtdb = x => {
  if (x === null) return undefined;
  if (typeof x !== "object") return x;
  const o = {};
  Object.keys(x).forEach(k => { const y = rtdb(x[k]); if (y !== undefined) o[k] = y; });
  return Object.keys(o).length ? o : undefined;
};
T("從資料庫讀回來（空的不見、陣列變物件）也接得下去，結果跟一直放在記憶體裡一樣；run.step 每一步加一", () => {
  const walk = strip => {
    G.setRng(G.mulberry32(7));
    const { run, Ps } = party([{ id: "a", pepes: [{}, { 帽子: "棒球帽" }] }, { id: "b", job: "historian" }]);
    let r = run, steps = [];
    while (r.phase === "vote") {
      if (strip) r = rtdb(J(r));
      const n = G.coopRoom(G.coopFix(r)).choices.length;
      G.setRng(G.mulberry32(100 + r.step));
      G.coopResolve(r, Ps, { a: 0, b: 1 % n });
      steps.push(r.step);
      if (r.phase === "over") break;
      if (strip) r = rtdb(J(r));
      G.setRng(G.mulberry32(100 + r.step));
      G.coopAdvance(r, Ps);
      steps.push(r.step);
    }
    G.setRng(null);
    return { run: r, out: JSON.stringify(["a", "b"].map(id => [Ps[id].sanity, Ps[id].insp, Ps[id].injured, Ps[id].cellar, Ps[id].myth])), steps };
  };
  const mem = walk(false), db = walk(true);
  assert.strictEqual(db.out, mem.out);
  assert.strictEqual(db.run.phase, mem.run.phase);
  assert.strictEqual(JSON.stringify(db.run.log), JSON.stringify(mem.run.log));
  assert.deepStrictEqual(mem.steps, mem.steps.map((x, i) => i + 1));
});

// ---------- 真正的 ES 模組也接得上（伺服器會 import coop.js） ----------
(async () => {
  try {
    const url = f => pathToFileURL(path.join(__dirname, "..", "shared", f)).href;
    const logic = await import(url("logic.js"));
    const coop = await import(url("coop.js"));
    const P = logic.newProfile("challenge"); logic.ensureDay(P, DATE);
    const key = logic.finishMake(P, Object.assign({}, BASE), { natural: 50 }).key;
    const s = coop.startCoop([{ id: "a", P, keys: [key] }], 1);
    assert.ok(s.ok, s.reason);
    assert.strictEqual(s.run.team.length, coop.COOP.teamMin);
    assert.ok(coop.coopResolve(s.run, { a: P }, { a: 2 }).ok);
    pass++;
  } catch (e) { fail++; console.log("FAIL ES 模組", "\n   ", e.message); }
  console.log(`${pass} passed, ${fail} failed（合作地下收藏庫）`);
  process.exit(fail ? 1 : 0);
})();
