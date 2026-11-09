// 留下痕跡（shared/coop_trace.js）：node test/coop_trace.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let G = load();
let pass = 0, fail = 0;
const T = (name, fn) => { try { G = load(); fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 3).join("\n    ")); } };
const NOW = 1_800_000_000_000, DATE = "2026-11-09";
const J = x => JSON.parse(JSON.stringify(x));
const KEY = () => { const P = G.newProfile("challenge"); G.ensureDay(P, DATE); return G.finishMake(P, { 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" }, { natural: 50 }).key; };

T("留言牌：固定格式，字只能選清單上的；房間要存在", () => {
  assert.strictEqual(G.signProblem("1a", "ahead", "東西"), null);
  assert.strictEqual(G.signText("ahead", "東西"), "前面有東西");
  assert.strictEqual(G.signText("try", "推開"), "試試推開");
  assert.strictEqual(G.signText("dont", "門"), "別相信門");
  assert.ok(G.signProblem("zz", "ahead", "東西"));
  assert.ok(G.signProblem("1a", "free", "東西"));
  assert.ok(G.signProblem("1a", "ahead", "自己打的字"));
  assert.ok(G.signProblem("1a", "ahead", "推開"), "別的格式的字也不行");
});
T("留言牌：每人最多 10 則，再留一則換掉最舊的", () => {
  const mine = {};
  for (let i = 0; i < G.TRACE.signMax - 1; i++) mine["s" + i] = { room: "1a", at: i };
  assert.deepStrictEqual(J(G.signsToDrop(mine)), [], "還沒滿不用換");
  mine.s9 = { room: "2b", at: 100 };
  mine.old = { room: "1b", at: -5 };
  const drop = J(G.signsToDrop(mine));
  assert.strictEqual(drop.length, 2);
  assert.strictEqual(drop[0].id, "old");
  assert.strictEqual(drop[0].room, "1b");
  assert.strictEqual(drop[1].id, "s0");
});
T("按讚：不能讚自己；一個人一則一次；牌子不見了不行", () => {
  const s = G.newSign({ id: "s", uid: "a", nick: "小明", room: "1a", tpl: "ahead", word: "牠", now: NOW });
  assert.ok(G.likeProblem(s, "a"));
  assert.strictEqual(G.likeProblem(s, "b"), null);
  s.likedBy = { b: true };
  assert.ok(G.likeProblem(s, "b"));
  assert.ok(G.likeProblem(null, "b"));
});
T("領讚的靈感：一天有上限，沒領完的留給明天；存檔讀回來還在；不跟著參觀者換", () => {
  const P = G.newProfile("challenge"); G.ensureDay(P, DATE); P.insp = 0;
  const n = G.TRACE.likeDayMax + 3;
  let r = G.claimLikes(P, n, DATE);
  assert.strictEqual(r.gain, G.TRACE.likeDayMax * G.TRACE.likeInsp);
  assert.strictEqual(r.left, 3);
  assert.strictEqual(P.insp, r.gain);
  r = G.claimLikes(P, 3, DATE);
  assert.strictEqual(r.gain, 0);
  assert.strictEqual(r.left, 3);
  r = G.claimLikes(P, 3, "2026-11-10");
  assert.strictEqual(r.gain, 3 * G.TRACE.likeInsp);
  assert.strictEqual(r.left, 0);
  assert.ok(!G.VISITOR_KEYS.includes("coopLikeDay"));
  const save = G.newSave(); save.profiles.challenge = P;
  assert.strictEqual(G.migrateSave(J(save)).profiles.challenge.coopLikeDay.date, "2026-11-10");
});
T("影子：字從房間的選項拿；房間不存在就沒有；太多留最新的", () => {
  const s = G.newShadow({ nick: "小明", room: "1a", choice: 0, now: NOW });
  assert.strictEqual(s.choice, G.cellarFloor(1).rooms[0].choices[0].label);
  assert.strictEqual(s.floor, 1);
  assert.strictEqual(G.newShadow({ nick: "小明", room: "1a", choice: "亂寫", now: NOW }).choice, null);
  assert.strictEqual(G.newShadow({ nick: "小明", room: "zz", choice: 0, now: NOW }), null);
  const all = {};
  for (let i = 0; i < G.TRACE.shadowKeep + 2; i++) all["x" + i] = { at: i };
  assert.deepStrictEqual(J(G.shadowsToDrop(all)), ["x1", "x0"]);
});
T("幽影：最近才看得到，不算自己，壞掉的不算", () => {
  const key = KEY();
  const all = {
    me: { nick: "我", key, at: NOW },
    a: { nick: "小明", key, at: NOW - 1000 },
    old: { nick: "老人", key, at: NOW - (G.TRACE.wispDays + 1) * 86400000 },
    bad: { nick: "壞", key: "壞掉", at: NOW },
  };
  const list = J(G.recentWisps(all, "me", NOW));
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].id, "a");
  assert.ok(G.okWispKey(key));
  assert.ok(!G.okWispKey("壞掉"));
  assert.ok(!G.okWispKey(null));
});
T("報告裡記的影子：走到歸零，stats.ghosts 有哪一間、選了什麼（走完一趟伺服器照這個留）", () => {
  const P = G.newProfile("challenge"); G.ensureDay(P, DATE); P.tutorialDone = true; P.sanity = 1; P.day.quirkGiven = true;
  G.assignJob(P, "detective");
  const k = G.finishMake(P, { 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" }, { natural: 50 }).key;
  G.setRng(G.mulberry32(5));
  const s = G.coopBegin([{ id: "a", name: "a", P, keys: [k] }], 1, DATE, NOW, { id: "t", fun: true });
  const run = s.run;
  G.setRng(() => 0.99);
  const r = G.coopAct(run, { a: P }, "a", "vote", { choice: 1 }, NOW); // B1 第一間的乙：技能，失敗扣理智
  assert.ok(r.ok);
  assert.ok(run.members[0].ghost);
  assert.strictEqual(run.over, "lost");
  assert.ok(run.ended);
  assert.strictEqual(run.stats.ghosts[0].roomId, "1a");
  assert.strictEqual(run.stats.ghosts[0].choice, 1);
});
console.log(`${pass} passed, ${fail} failed（留下痕跡）`);
process.exit(fail ? 1 : 0);
