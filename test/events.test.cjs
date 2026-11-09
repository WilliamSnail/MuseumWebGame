// 限時活動（shared/events.js，決定 0041）：node test/events.test.cjs（npm test 也會跑）
// 開始、結束的邊界、台灣時間、換日、開始時在活動內就算到走完、不在活動內沒加成、壞資料不丟錯、多 1 趟只在活動內、試煉的加成。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let G = load();
let pass = 0, fail = 0;
const T = (name, fn) => { try { G = load(); G.setRng(G.mulberry32(21)); fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const J = x => JSON.parse(JSON.stringify(x));
// 台灣時間 → 毫秒（台灣 = UTC+8）
const tw = (date, hm, sec = 0, ms = 0) => { const [y, m, d] = date.split("-").map(Number), [h, mi] = hm.split(":").map(Number); return Date.UTC(y, m - 1, d, h - 8, mi, sec, ms); };
const RAW = { id: "double11", kind: "coopBoost", date: "2026-11-11", from: "20:00", to: "22:00", title: "雙 11 的招領箱加班夜", words: "邀館友壹起下去翻箱底。" };
const WEEK = { start: "2026-11-09", events: [RAW, { id: "winter", kind: "trialBoost", date: "2026-11-14", from: "20:00", to: "22:00", title: "冬衣試煉夜", words: "壹個人、壹起都行。" }] };
const list = () => G.eventsFromWeeks({ "2026-W46": J(WEEK) });
const first = () => list()[0];

// ---------- 時間 ----------
T("台灣時間換成毫秒：20:00 ＝ UTC 12:00；壞的格式回傳 null", () => {
  assert.strictEqual(G.eventAt("2026-11-11", "20:00"), Date.UTC(2026, 10, 11, 12, 0));
  assert.strictEqual(G.eventAt("2026-11-11", "05:00"), Date.UTC(2026, 10, 10, 21, 0));
  ["25:00", "7:00", "20:60", "", null, 20].forEach(x => assert.strictEqual(G.eventAt("2026-11-11", x), null));
  ["2026-13-01", "2026-02-30", "11/11", "", null].forEach(d => assert.strictEqual(G.eventAt(d, "20:00"), null));
});
T("邊界：20:00 整開始、21:59:59 還在、22:00 整結束、差 1 毫秒也對", () => {
  const ev = first();
  assert.strictEqual(G.eventPhase(ev, tw("2026-11-11", "19:59", 59, 999)), "before");
  assert.strictEqual(G.eventPhase(ev, tw("2026-11-11", "20:00")), "live");
  assert.strictEqual(G.eventPhase(ev, tw("2026-11-11", "21:59", 59, 999)), "live");
  assert.strictEqual(G.eventPhase(ev, tw("2026-11-11", "22:00")), "over");
  assert.strictEqual(G.eventLive(list(), "coopBoost", tw("2026-11-11", "20:00")).local, "double11");
  assert.strictEqual(G.eventLive(list(), "coopBoost", tw("2026-11-11", "21:59", 59)).local, "double11");
  assert.strictEqual(G.eventLive(list(), "coopBoost", tw("2026-11-11", "22:00")), null);
  assert.strictEqual(G.eventLive(list(), "coopBoost", tw("2026-11-11", "19:59", 59)), null);
});
T("種類不同不會混：合作的活動時間試煉看不到", () => {
  const t = tw("2026-11-11", "21:00");
  assert.ok(G.eventLive(list(), "coopBoost", t));
  assert.strictEqual(G.eventLive(list(), "trialBoost", t), null);
  assert.ok(G.eventLive(list(), "trialBoost", tw("2026-11-14", "20:30")));
});
T("不在活動內：別的日子、同一天的別的時間都沒有", () => {
  [tw("2026-11-10", "21:00"), tw("2026-11-12", "21:00"), tw("2026-11-11", "12:00"), tw("2026-11-11", "23:30")].forEach(t => assert.strictEqual(G.eventLive(list(), "coopBoost", t), null));
});
T("電腦的時區不影響：用 UTC 算（日期用台灣的日曆）", () => {
  const old = process.env.TZ;
  try { process.env.TZ = "America/Los_Angeles"; const ev = first(); assert.strictEqual(ev.start, Date.UTC(2026, 10, 11, 12, 0)); assert.strictEqual(ev.end, Date.UTC(2026, 10, 11, 14, 0)); }
  finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; }
});

// ---------- 大廳那一條 ----------
T("大廳：05:00 換日之後「今晚」出現；沒開始寫幾點，進行中倒數，結束就消失", () => {
  const L = list();
  assert.deepStrictEqual(J(G.eventBars(L, tw("2026-11-11", "04:59", 59))), [], "還是前一天（05:00 換日）");
  const soon = G.eventBars(L, tw("2026-11-11", "05:00"));
  assert.strictEqual(soon.length, 1);
  assert.strictEqual(soon[0].phase, "soon");
  assert.strictEqual(G.eventBarText(soon[0]), "今晚 20:00～22:00：雙 11 的招領箱加班夜");
  const live = G.eventBars(L, tw("2026-11-11", "20:00"));
  assert.strictEqual(live[0].phase, "live");
  assert.strictEqual(live[0].left, 2 * 3600000);
  assert.strictEqual(G.eventBarText(live[0]), "限時活動進行中：雙 11 的招領箱加班夜（還剩 2 小時 0 分）");
  assert.ok(/還剩 0 分 01 秒/.test(G.eventBarText(G.eventBars(L, tw("2026-11-11", "21:59", 59))[0])));
  assert.deepStrictEqual(J(G.eventBars(L, tw("2026-11-11", "22:00"))), []);
  assert.deepStrictEqual(J(G.eventBars(L, tw("2026-11-12", "00:30"))), [], "過了午夜也沒有");
});
T("大廳：前一天看不到（不提早預告）；下午的活動寫「今天」；壞的時間不丟錯", () => {
  assert.deepStrictEqual(J(G.eventBars(list(), tw("2026-11-10", "20:00"))), []);
  const L = G.eventsFromWeeks({ "2026-W46": { start: "2026-11-09", events: [{ id: "pm", kind: "trialBoost", date: "2026-11-14", from: "14:00", to: "16:00", title: "下午場", words: "壹起。" }] } });
  assert.strictEqual(G.eventBarText(G.eventBars(L, tw("2026-11-14", "09:00"))[0]), "今天 14:00～16:00：下午場");
  [NaN, undefined, null, "x"].forEach(t => assert.deepStrictEqual(J(G.eventBars(list(), t)), []));
  assert.deepStrictEqual(J(G.eventBars(null, 5)), []);
});

// ---------- 壞資料 ----------
T("壞資料不丟錯：丟掉壞的，留下好的", () => {
  const bad = [null, 5, "x", [], {}, { id: "a" }, Object.assign({}, RAW, { id: "k", kind: "nope" }), Object.assign({}, RAW, { id: "d", date: "2026-11-20" }),
    Object.assign({}, RAW, { id: "t1", from: "22:00", to: "20:00" }), Object.assign({}, RAW, { id: "t2", from: "04:00", to: "06:00" }), Object.assign({}, RAW, { id: "t3", from: "20:00", to: "20:10" }),
    Object.assign({}, RAW, { id: "t4", from: "06:00", to: "23:00" }), Object.assign({}, RAW, { id: "x", title: "" }), Object.assign({}, RAW, { id: "y", words: 5 }), Object.assign({}, RAW, { id: "z".repeat(40) }),
    Object.assign({}, RAW, { id: "long", title: "這個名字太長了太長了太長了太長了太長了" })];
  const out = G.cleanEvents(bad.concat([RAW]), "2026-11-09", "2026-W46");
  assert.deepStrictEqual(J(out.map(e => e.local)), ["double11"]);
  [undefined, null, 5, "x", {}, true].forEach(x => assert.deepStrictEqual(J(G.cleanEvents(x, "2026-11-09", "w")), []));
  [undefined, null, 5, "x", [], { a: 1 }, { a: { start: 5, events: [RAW] } }, { a: { start: "2026-11-09", events: "x" } }].forEach(x => assert.deepStrictEqual(J(G.eventsFromWeeks(x)), []));
});
T("同一個 id 只留第一個；一週最多 NUM.events.perWeek 場；不同週的 id 可以一樣", () => {
  const dup = G.cleanEvents([RAW, Object.assign({}, RAW, { from: "10:00", to: "11:00" })], "2026-11-09", "2026-W46");
  assert.strictEqual(dup.length, 1);
  const many = Array.from({ length: 6 }, (_, i) => Object.assign({}, RAW, { id: "e" + i, from: `${10 + i}:00`, to: `${10 + i}:30` }));
  assert.strictEqual(G.cleanEvents(many, "2026-11-09", "2026-W46").length, G.NUM.events.perWeek);
  const two = G.eventsFromWeeks({ "2026-W46": { start: "2026-11-09", events: [RAW] }, "2026-W47": { start: "2026-11-16", events: [Object.assign({}, RAW, { date: "2026-11-18" })] } });
  assert.deepStrictEqual(J(two.map(e => e.id)), ["2026-W46/double11", "2026-W47/double11"]);
});
T("eventProblems 說得出哪裡不對", () => {
  const p = (o, re) => assert.ok(G.eventProblems(Object.assign({}, RAW, o), "2026-11-09").some(x => re.test(x)), JSON.stringify(o));
  p({ kind: "x" }, /kind/); p({ date: "2026-11-16" }, /這週之內/); p({ from: "25:00" }, /from/); p({ to: "9" }, /to/);
  p({ from: "04:30", to: "06:00" }, /早於 05:00/); p({ to: "19:00" }, /晚於 from/); p({ to: "20:10" }, /太短/); p({ from: "06:00" }, /太長/);
  assert.deepStrictEqual(J(G.eventProblems(RAW, "2026-11-09")), []);
  assert.deepStrictEqual(J(G.eventProblems(RAW)), []);
});

// ---------- 數字 ----------
T("eventScale：沒有活動原樣；×1.5 小數用亂數進位；整數不擲骰；不會變少", () => {
  assert.strictEqual(G.eventScale(null, 7), 7);
  assert.strictEqual(G.eventScale({ mult: 1.5 }, 0), 0);
  assert.strictEqual(G.eventScale({ mult: 0.5 }, 4), 4);
  assert.strictEqual(G.eventScale({ mult: 1.5 }, 8), 12);
  G.setRng(() => 0.1); assert.strictEqual(G.eventScale({ mult: 1.5 }, 1), 2);
  G.setRng(() => 0.9); assert.strictEqual(G.eventScale({ mult: 1.5 }, 1), 1);
  let calls = 0; G.setRng(() => { calls++; return 0.5; }); G.eventScale({ mult: 1.5 }, 8); G.eventScale(null, 3);
  assert.strictEqual(calls, 0, "整數、沒有活動都不擲骰");
  G.setRng(G.mulberry32(3)); let sum = 0; for (let i = 0; i < 4000; i++) sum += G.eventScale({ mult: 1.5 }, 1);
  assert.ok(Math.abs(sum / 4000 - 1.5) < 0.05, "平均 1.5：" + sum / 4000);
  assert.ok(G.eventScale({ mult: 99 }, 10) <= 50, "倍率有上限");
});
T("eventRunOf／eventRunFix：記下來的樣子；壞的變 null；多的趟數最多 1", () => {
  const r = G.eventRunOf(first());
  assert.deepStrictEqual(J(r), { id: "2026-W46/double11", kind: "coopBoost", title: "雙 11 的招領箱加班夜", mult: G.NUM.events.coopBoost.mult, extra: 1, until: first().end });
  assert.deepStrictEqual(J(G.eventRunFix(J(r))), J(r));
  [null, 5, "x", [], {}, { kind: "zzz" }].forEach(x => assert.strictEqual(G.eventRunFix(x), null));
  assert.strictEqual(G.eventRunOf(null), null);
  assert.strictEqual(G.eventRunFix({ kind: "coopBoost", mult: "abc", extra: 9 }).extra, 1);
  assert.strictEqual(G.eventExtraTurns({ kind: "coopBoost", extra: 9 }), 1);
  assert.strictEqual(G.eventExtraTurns({ kind: "trialBoost", extra: 1 }), 0);
  assert.strictEqual(G.eventExtraTurns(null), 0);
});

// ---------- 合作地下 ----------
const DATE = "2026-11-11", NOW = tw(DATE, "21:30");
const BASE = { 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" };
function person(turns = 0) {
  const P = G.newProfile("challenge"); G.ensureDay(P, DATE);
  P.tutorialDone = true; P.insp = 100; P.sanity = 60; G.assignJob(P, "detective");
  G.SKILLS.forEach(s => { P.skills[s] = 20; });
  P.day.quirkGiven = true;
  if (turns) P.coopDay = { date: DATE, n: turns };
  return P;
}
const mk = (P, o = {}) => G.finishMake(P, Object.assign({}, BASE, o), { natural: 50 }).key;
function party(ids, o = {}) {
  const Ps = {}, members = ids.map(id => { const P = person(o.turns && o.turns[id]); Ps[id] = P; return { id, name: id, P, keys: [mk(P)] }; });
  const st = G.coopBegin(members, 1, DATE, o.at || NOW, { id: "ev" + (o.seed || 1), fun: true, event: o.event === undefined ? null : o.event });
  assert.ok(st.ok, st.reason);
  return { run: st.run, Ps };
}
const safe = run => { const c = G.coopRoom(run).choices.findIndex(x => x.check.type === "none"); return c < 0 ? 0 : c; };
function walkFloor(run, Ps, ids, at) {
  let guard = 0;
  while (run.phase !== "floorDone" && run.phase !== "over" && run.phase !== "guess" && guard++ < 60) {
    if (run.phase === "vote") ids.forEach(id => G.coopAct(run, Ps, id, "vote", { choice: safe(run) }, at));
    else if (run.phase === "carry") ids.forEach(id => G.coopAct(run, Ps, id, "carry", { side: "skip" }, at));
    else ids.forEach(id => G.coopAct(run, Ps, id, "ack", {}, at));
  }
}
const EV = () => G.eventRunOf(first());

T("開始時在活動內：run.event 記下來，存進 JSON 再讀回來還在；沒有活動就是 null", () => {
  const a = party(["a", "b"], { event: EV() });
  assert.strictEqual(a.run.event.kind, "coopBoost");
  assert.strictEqual(G.coopFix(J(a.run)).event.mult, G.NUM.events.coopBoost.mult);
  assert.strictEqual(G.viewFor(a.run, "a").event.title, "雙 11 的招領箱加班夜");
  assert.strictEqual(party(["a"]).run.event, null);
  const old = J(party(["a"]).run); delete old.event;
  assert.strictEqual(G.coopFix(old).event, null, "舊的 run 沒有這一欄也行");
  const broken = J(a.run); broken.event = "壞掉"; assert.strictEqual(G.coopFix(broken).event, null);
});
T("猜對：活動中 ×1.5（B1：6 + 2 = 8 → 12）；不在活動內不變；在活動中開始，過了 22:00 才猜也照算", () => {
  const go = event => {
    const start = tw(DATE, "21:59", 50), o = party(["a", "b", "c"], { event, at: start });
    const ids = ["a", "b", "c"], res = G.COOP_RESIDENTS.find(x => x.id === o.run.truth.id);
    o.run.truth.found = res.ev.map(kind => ({ kind, by: "a", room: "1a", fake: false }));
    const late = tw(DATE, "22:00", 5); // 21:59:50 出發，22:00:05 才走完、猜：已經過了活動
    walkFloor(o.run, o.Ps, ids, late);
    assert.strictEqual(o.run.phase, "guess");
    const i0 = o.Ps.a.insp;
    ids.forEach(id => G.coopAct(o.run, o.Ps, id, "guess", { id: res.id }, late));
    return o.Ps.a.insp - i0;
  };
  const base = G.COOP.truth.insp + 1 * G.COOP.truth.perFloor;
  assert.strictEqual(go(null), base);
  assert.strictEqual(go(EV()), base * G.NUM.events.coopBoost.mult);
});
T("搬回來：活動中 ×1.5（2 + 層數 = 3 → 4 或 5），不在活動內是 3", () => {
  const go = (event, seed) => {
    const o = party(["a", "b", "c"], { event, seed });
    o.run.carry.idx = 0;
    ["a", "b", "c"].forEach(id => G.coopAct(o.run, o.Ps, id, "vote", { choice: safe(o.run) }, NOW));
    o.run.members.forEach(m => G.coopAct(o.run, o.Ps, m.id, "ack", {}, NOW));
    const i0 = o.Ps.c.insp;
    G.setRng(() => 0.15);
    G.coopAct(o.run, o.Ps, "a", "carry", { side: "L" }, NOW); G.coopAct(o.run, o.Ps, "b", "carry", { side: "R" }, NOW); G.coopAct(o.run, o.Ps, "c", "carry", { side: "skip" }, NOW);
    assert.strictEqual(o.run.carry.result.kind, "ok");
    return o.Ps.c.insp - i0;
  };
  const base = G.COOP.carry.insp + 1;
  assert.strictEqual(go(null, 1), base);
  const g = go(EV(), 2);
  assert.ok(g === 4 || g === 5, "×1.5 → " + g);
});
T("這一趟沒獎勵（今天第 5 趟）：活動也不給靈感", () => {
  const o = party(["a", "b"], { event: EV(), turns: { a: 4 } }); // a 已經 4 趟，加上這趟 5 趟 > 3 + 1
  assert.strictEqual(o.run.members[0].rewarded, false);
  assert.strictEqual(o.run.members[1].rewarded, true);
});
T("多 1 趟：活動內第 4 趟有獎勵、第 5 趟沒有；活動外第 4 趟沒有；最多只多 1 趟", () => {
  const turn = (n, extra) => { const P = {}; const out = []; for (let i = 0; i < n; i++) out.push(G.coopTakeTurn(P, DATE, extra)); return out; };
  assert.deepStrictEqual(turn(5, 0), [true, true, true, false, false]);
  assert.deepStrictEqual(turn(5, 1), [true, true, true, true, false]);
  assert.deepStrictEqual(turn(5, 99), [true, true, true, true, false], "資料寫再多也只多 1 趟");
  assert.deepStrictEqual(turn(5, -3), [true, true, true, false, false]);
  const P = {}; [0, 0, 0].forEach(e => G.coopTakeTurn(P, DATE, e)); // 活動外走了 3 趟
  assert.strictEqual(G.coopTakeTurn(P, DATE, 0), false, "活動外的第 4 趟沒獎勵");
  const Q = {}; [0, 0, 0].forEach(e => G.coopTakeTurn(Q, DATE, e));
  assert.strictEqual(G.coopTakeTurn(Q, DATE, 1), true, "活動內開始的第 4 趟有");
});
T("多 1 趟走完整個流程：coopBegin 在活動內第 4 趟 rewarded；不在活動內不是；隔天重算", () => {
  assert.strictEqual(party(["a"], { event: EV(), turns: { a: 3 } }).run.members[0].rewarded, true);
  assert.strictEqual(party(["a"], { event: null, turns: { a: 3 } }).run.members[0].rewarded, false);
  const o = party(["a"], { event: EV(), turns: { a: 3 } });
  assert.strictEqual(o.Ps.a.coopDay.n, 4);
  assert.strictEqual(G.coopTurnsLeft(o.Ps.a, DATE, EV()), 0);
  assert.strictEqual(G.coopTurnsLeft(person(3), DATE, EV()), 1, "畫面上：活動中今天還有 1 趟");
  assert.strictEqual(G.coopTurnsLeft(person(3), DATE), 0);
  assert.strictEqual(G.coopTurnsLeft(person(3), DATE, { kind: "trialBoost", extra: 1 }), 0, "別種活動不算");
  assert.strictEqual(G.coopTakeTurn({ coopDay: { date: "2026-11-10", n: 9 } }, DATE, 0), true, "隔天重算");
});
T("探險報告多一行限時活動", () => {
  const o = party(["a", "b"], { event: EV() });
  const rep = G.coopMakeReport(o.run, [], DATE);
  assert.strictEqual(rep.lines[0].k, "event");
  assert.ok(rep.lines[0].t.includes("雙 11 的招領箱加班夜") && rep.lines[0].t.includes("×1.5"));
  const p = party(["a"]);
  assert.ok(!G.coopMakeReport(p.run, [], DATE).lines.some(l => l.k === "event"));
});

// ---------- 試煉 ----------
function trialP() {
  const P = person(); P.cellar.best = 1;
  P.skills.偵查 = 20;
  for (let i = 0; i < 4; i++) mk(P, { 顏色: ["紅", "綠", "黃", "藍"][i] });
  return P;
}
const TB = { kind: "trialBoost", mult: 1.5, extra: 0, id: "x", title: "t", until: 0 };
T("試煉：走進去那一刻在活動內，過關的成長 ×1.5；沒有活動照舊；活動記在這一間裡", () => {
  const grow = (boost, seed) => {
    const P = trialP(); G.setRng(G.mulberry32(seed));
    const keys = Object.keys(P.pepes).slice(0, 3);
    const s = G.startTrial(P, "t:look", keys, DATE, boost);
    assert.ok(s.ok, s.reason);
    assert.strictEqual(!!P.cellar.run.extra.boost, !!(boost && boost.kind === "trialBoost"));
    return G.trialWin(P, G.currentRoom(P), DATE);
  };
  let boosted = 0, plain = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const a = grow(null, seed), b = grow(TB, seed);
    assert.ok(a && b);
    plain += a.after - a.before; boosted += b.after - b.before;
    assert.ok(b.after - b.before >= a.after - a.before, "活動不會變少");
  }
  assert.ok(boosted > plain * 1.25, `活動中比較多：${boosted} vs ${plain}`);
  assert.strictEqual(grow({ kind: "coopBoost", mult: 1.5 }, 1).boost, null, "別種活動不影響試煉");
});
T("試煉：一週還是只拿一次（活動不多給次數）", () => {
  const P = trialP();
  const keys = Object.keys(P.pepes).slice(0, 3);
  assert.ok(G.startTrial(P, "t:look", keys, DATE, TB).ok);
  assert.ok(G.trialWin(P, G.currentRoom(P), DATE));
  assert.strictEqual(G.trialWin(P, G.currentRoom(P), DATE), null, "同一週第二次不給成長");
  assert.strictEqual(G.trialState(P, "t:look", DATE).state, "done");
});

// ---------- Functions 拿得到同一份 ----------
// tools/copy_shared.cjs 把 content/weeks/*/week.json 的 events 打包成 functions/shared/events_data.js；Functions 用同一份規則（shared/events.js）算
(async () => {
  try {
    require("child_process").execFileSync(process.execPath, [require("path").join(__dirname, "..", "tools", "copy_shared.cjs")], { stdio: "pipe" });
    const url = require("url").pathToFileURL(require("path").join(__dirname, "..", "functions", "shared", "events_data.js")).href;
    const { EVENT_WEEKS } = await import(url);
    const real = require("../content/weeks/2026-W46/week.json");
    assert.ok(EVENT_WEEKS["2026-W46"], "W46 的活動要打包進去");
    assert.deepStrictEqual(EVENT_WEEKS["2026-W46"].events, real.events);
    assert.ok(!Object.keys(EVENT_WEEKS).some(k => !/^\d{4}-W\d{2}$/.test(k)), "備用週不打包");
    const L = G.eventsFromWeeks(EVENT_WEEKS);
    assert.strictEqual(G.eventLive(L, "coopBoost", tw("2026-11-11", "20:00")).local, "double11", "Functions 看得到 11/11 的活動");
    assert.strictEqual(G.eventLive(L, "coopBoost", tw("2026-11-11", "22:00")), null);
    assert.strictEqual(G.eventLive(L, "trialBoost", tw("2026-11-14", "21:00")).local, "winter-trial");
    pass++;
  } catch (e) { fail++; console.log("FAIL Functions 拿得到同一份活動", e.stack); }
  console.log(`限時活動 ${pass} 項過，${fail} 項沒過`);
  process.exit(fail ? 1 : 0);
})();
