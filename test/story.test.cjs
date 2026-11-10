// 每週劇情的規則（shared/story.js）：node test/story.test.cjs（npm test 也會跑）
// 內容用真的 content/weeks/備用/（備用週「常青1」、備用的一天），正式週在測試裡用備用週複製一份。
// 排程每週寫的正式週（content/weeks/2026-W46/ 這種）不讀進來：測試不跟著每週的內容變。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
const { readWeeks } = require("../tools/week_check.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 3).join("\n    ")); } finally { G.setNowClock(null); G.setRng(null); } };
const clone = o => JSON.parse(JSON.stringify(o));
const FILES = Object.fromEntries(Object.entries(readWeeks().files).filter(([k]) => k.startsWith("備用/")));
const at = s => Date.parse(s + "+08:00"); // 台灣時間
const seq = arr => { let i = 0; return () => arr[i++ % arr.length]; };
// 一位挑戰模式的參觀者，今天是 date
function fresh(G, date = "2026-11-09") {
  const P = G.newProfile("challenge");
  G.ensureDay(P, date);
  G.assignJob(P, "detective");
  return P;
}
// 正式週 2026-W47（從備用週複製；d4 拿掉，看備用的一天補不補）
function withW47(G, drop = [4]) {
  const files = clone(FILES);
  const wk = clone(files["備用/常青1/week.json"]); wk.week = "2026-W47"; wk.start = "2026-11-16"; wk.title = "測試週";
  files["2026-W47/week.json"] = wk;
  for (let n = 1; n <= 7; n++) if (!drop.includes(n)) { const d = clone(files[`備用/常青1/d${n}.json`]); d.date = G.addDays("2026-11-16", n - 1); files[`2026-W47/d${n}.json`] = d; }
  return G.storyLibrary(files);
}
const LIB = G => G.storyLibrary(FILES);

T("週和季：ISO 週的名字、週一、星期幾", G => {
  assert.strictEqual(G.isoWeek("2026-11-09"), "2026-W46");
  assert.strictEqual(G.isoWeek("2026-11-15"), "2026-W46");
  assert.strictEqual(G.isoWeek("2026-11-16"), "2026-W47");
  assert.strictEqual(G.isoWeek("2027-01-01"), "2026-W53");
  assert.strictEqual(G.isoMonday("2026-W46"), "2026-11-09");
  assert.strictEqual(G.isoMonday("2026-W01"), "2025-12-29");
  assert.strictEqual(G.weekDayNo("2026-11-15"), 7);
  assert.strictEqual(G.seasonOf("2026-W46"), 0);
  assert.strictEqual(G.seasonOf("2026-W47"), 1);
  assert.strictEqual(G.seasonOf("2026-W50"), 1);
  assert.strictEqual(G.seasonOf("2026-W51"), 1 + G.NUM.story.seasonWeeks / G.NUM.story.seasonWeeks);
  assert.strictEqual(G.weekLeftText(at("2026-11-09T05:00:00"), "2026-11-09"), "7 天 0 小時");
  assert.strictEqual(G.weekLeftText(at("2026-11-16T04:30:00"), "2026-11-09"), "30 分鐘");
});
T("這週沒有內容：自動用備用週；id 都加上週的名字", G => {
  const W = G.storyWeek(LIB(G), "2026-11-09");
  assert.strictEqual(W.label, "2026-W46");
  assert.strictEqual(W.fallback, "常青1");
  assert.strictEqual(W.dayNo, 1);
  assert.strictEqual(W.days.length, 1, "只打開到今天");
  assert.ok(W.books.every(b => b.id.startsWith("2026-W46/")));
  assert.ok(W.rooms.every(r => r.id.startsWith("s:2026-W46/")));
  const W2 = G.storyWeek(LIB(G), "2026-11-23");
  assert.strictEqual(W2.label, "2026-W48");
  assert.ok(W2.books.every(b => b.id.startsWith("2026-W48/")), "備用週重複用，id 不會撞");
});
T("每週劇情從 NUM.story.startWeek 開始：11-09 凌晨（還算 11-08、上一週）沒有劇情，05:00 才開始", G => {
  const lib = LIB(G);
  G.setNowClock(() => at("2026-11-09T04:59:00"));
  assert.strictEqual(G.todayStr(), "2026-11-08");
  assert.strictEqual(G.storyWeek(lib, G.todayStr()), null);
  assert.strictEqual(G.storyPastWeeks(lib, "2026-11-20", null).some(w => w.label < G.NUM.story.startWeek), false, "更早的週也不進劇情回顧");
  G.setNowClock(() => at("2026-11-09T05:00:00"));
  assert.strictEqual(G.storyWeek(lib, G.todayStr()).label, G.NUM.story.startWeek);
});
T("05:00 換日換今天的內容（照 todayStr）", G => {
  const lib = LIB(G);
  G.setNowClock(() => at("2026-11-10T04:59:00"));
  let W = G.storyWeek(lib, G.todayStr());
  assert.strictEqual(W.dayNo, 1);
  assert.strictEqual(W.days.length, 1, "04:59 還是週一");
  G.setNowClock(() => at("2026-11-10T05:00:00"));
  W = G.storyWeek(lib, G.todayStr());
  assert.strictEqual(W.dayNo, 2);
  assert.strictEqual(G.todayOf(W).books[0].local, "2a");
  assert.ok(W.books.some(b => b.local === "1a"), "昨天的書還在（可以補讀）");
});
T("週一 05:00 換週", G => {
  const lib = withW47(G);
  G.setNowClock(() => at("2026-11-16T04:59:59"));
  assert.strictEqual(G.storyWeek(lib, G.todayStr()).label, "2026-W46");
  assert.strictEqual(G.storyWeek(lib, G.todayStr()).dayNo, 7);
  G.setNowClock(() => at("2026-11-16T05:00:00"));
  const W = G.storyWeek(lib, G.todayStr());
  assert.strictEqual(W.label, "2026-W47");
  assert.strictEqual(W.fallback, null, "有正式週就用正式週");
  assert.strictEqual(W.title, "測試週");
  const past = G.storyPastWeeks(lib, G.todayStr(), null);
  assert.ok(!past.some(w => w.label === "2026-W47"));
});
T("正式週少了一天：那天用備用的一天", G => {
  const lib = withW47(G, [4]);
  const W = G.storyWeek(lib, "2026-11-19");
  const d4 = G.dayOf(W, 4);
  assert.ok(d4.spare, "第 4 天是備用的一天");
  assert.ok(d4.books[0].id.startsWith("2026-W47/d4-"));
  assert.ok(W.lines.some(l => l.kind === "side"));
  assert.strictEqual(G.dayOf(W, 3).spare, null);
});
T("存檔：舊存檔沒有 P.story，用到時補；壞掉的也修", G => {
  const save = G.migrateSave({ v: 3, profiles: { challenge: G.newProfile("challenge"), free: null }, settings: {} });
  const P = save.profiles.challenge;
  assert.strictEqual(P.story, undefined);
  const S = G.storyState(P);
  assert.strictEqual(S.stamps, 0);
  assert.ok(S.books && S.tasks && S.bag);
  P.story = { books: [], stamps: "x", track: 3 };
  const S2 = G.storyState(P);
  assert.ok(!Array.isArray(S2.books) && S2.stamps === 0 && S2.track === null);
  // 存了再讀（JSON 來回）不壞
  const back = G.migrateSave(JSON.parse(JSON.stringify(save)));
  assert.strictEqual(back.profiles.challenge.story.stamps, 0);
});
T("書：當天就能讀的會出現；讀完給靈感（只給一次）", G => {
  const P = fresh(G), W = G.storyWeek(LIB(G), "2026-11-09");
  const ev = G.syncStory(P, W, "2026-11-09");
  assert.ok(ev.some(e => e.type === "storyBook" && e.book.local === "1a"));
  assert.ok(!ev.some(e => e.type === "storyBook" && e.book.local === "1b"), "要找到招領箱才解開");
  const insp = P.insp;
  const r = G.readStoryBook(P, W, "2026-W46/1a", "2026-11-09");
  assert.ok(r.first);
  assert.strictEqual(P.insp - insp, G.NUM.story.bookInsp);
  assert.strictEqual(G.readStoryBook(P, W, "2026-W46/1a", "2026-11-09").insp, 0);
  assert.strictEqual(G.readStoryBook(P, W, "2026-W46/1b", "2026-11-09").ok, false, "鎖著的讀不了");
});
T("地下的房間：借地下收藏庫走一間；過了就找到、解開書頁", G => {
  const P = fresh(G), W = G.storyWeek(LIB(G), "2026-11-09");
  for (let i = 0; i < 3; i++) G.finishMake(P, { 稀有度: "普通", 心情: "開心", 顏色: ["紅", "綠", "黃"][i], 帽子: "沒有", 姿勢: "站著" }, { natural: 50 });
  const keys = Object.keys(P.pepes);
  const r = G.startStoryRoom(P, W, "s:2026-W46/box", keys);
  assert.ok(r.ok, r.reason);
  assert.strictEqual(G.currentRoom(P).id, "s:2026-W46/box");
  const res = G.cellarResolve(P, 2); // 先登記壹下就好（type none，一定過）
  G.cellarApply(P, res, true);
  const a = G.cellarAdvance(P);
  assert.ok(a.extra && !P.cellar.run, "走完這一間就回地面");
  assert.ok(!P.cellar.floorsDone[1], "不算整層走完");
  const ev = G.syncStory(P, W, "2026-11-09");
  assert.ok(ev.some(e => e.type === "storySpot"));
  assert.ok(ev.some(e => e.type === "storyBook" && e.book.local === "1b"), "書頁解開了");
  // 還沒走到的樓層進不去
  const W2 = G.storyWeek(LIB(G), "2026-11-10");
  assert.strictEqual(G.startStoryRoom(P, W2, "s:2026-W46/hatrack", keys).ok, false);
});
T("每日任務：從第一次看到那刻算起（base）、做完記下、明天換新", G => {
  const P = fresh(G), W = G.storyWeek(LIB(G), "2026-11-09");
  G.finishMake(P, { 稀有度: "普通", 心情: "開心", 顏色: "綠", 帽子: "沒有", 姿勢: "站著" }, { natural: 50 }); // 任務出現之前做的不算
  G.syncStory(P, W, "2026-11-09");
  const t = G.todayOf(W).daily.find(x => x.kind === "make");
  assert.strictEqual(G.taskCount(P, W, t), 0);
  G.finishMake(P, { 稀有度: "普通", 心情: "傷心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" }, { natural: 50 });
  G.syncStory(P, W, "2026-11-09");
  assert.strictEqual(G.taskCount(P, W, t), 0, "紅的不算");
  G.finishMake(P, { 稀有度: "普通", 心情: "傷心", 顏色: "綠", 帽子: "沒有", 姿勢: "坐著" }, { natural: 50 });
  const ev = G.syncStory(P, W, "2026-11-09");
  assert.ok(ev.some(e => e.type === "storyTask" && e.task.id === t.id));
  assert.ok(G.taskDone(P, t));
  // 隔天：今天的任務換成第 2 天的
  G.ensureDay(P, "2026-11-10");
  const W2 = G.storyWeek(LIB(G), "2026-11-10");
  G.syncStory(P, W2, "2026-11-10");
  assert.ok(G.todayOf(W2).daily.every(x => x.day === 2));
  assert.ok(G.todayOf(W2).daily.every(x => !G.taskDone(P, x)));
});
T("任務種類：看畫、交委託、抱抱枕、今日特展、走到 B1", G => {
  const P = fresh(G), W = G.storyWeek(LIB(G), "2026-11-09");
  G.syncStory(P, W, "2026-11-09");
  const day1 = G.todayOf(W);
  const view = day1.daily.find(x => x.kind === "view");
  G.viewExhibit(P, G.exhibitById("portrait"));
  G.syncStory(P, W, "2026-11-09");
  assert.ok(G.taskDone(P, view));
  const show = day1.daily.find(x => x.kind === "show");
  day1.show.works.forEach((w, i) => { G.viewShowWork(P, W, w.id, "2026-11-09"); if (i < day1.show.works.length - 1) { G.syncStory(P, W, "2026-11-09"); assert.ok(!G.taskDone(P, show)); } });
  G.syncStory(P, W, "2026-11-09");
  assert.ok(G.taskDone(P, show), "看完全部才算");
  // 第 3 天：走到 B1、抱抱枕
  G.ensureDay(P, "2026-11-11");
  const W3 = G.storyWeek(LIB(G), "2026-11-11");
  G.syncStory(P, W3, "2026-11-11");
  const d3 = G.todayOf(W3);
  P.cellar.run = { floor: 1, idx: 0, team: [], used: {}, log: [] };
  G.syncStory(P, W3, "2026-11-11");
  assert.ok(G.taskDone(P, d3.daily.find(x => x.kind === "cellar")));
  P.cellar.run = null;
  P.day.hugs["x"] = true;
  G.syncStory(P, W3, "2026-11-11");
  assert.ok(G.taskDone(P, d3.daily.find(x => x.kind === "hug")));
});
T("今日特展：第一次看給靈感，一天有上限；不可怕的畫治好怪癖；昨天的展不給", G => {
  const P = fresh(G), W = G.storyWeek(LIB(G), "2026-11-10");
  const works = G.todayOf(W).show.works;
  P.quirks = [{ type: "phobia", cat: "帽子", opt: null, since: "2026-11-10", until: Date.now() + 600000, task: "calm" }];
  const insp = P.insp;
  const r1 = G.viewShowWork(P, W, works[0].id, "2026-11-10");
  assert.strictEqual(r1.insp, G.NUM.story.showInsp[0]);
  assert.strictEqual(r1.cured.length, 1, "看了不可怕的畫");
  assert.strictEqual(G.viewShowWork(P, W, works[0].id, "2026-11-10").insp, 0, "第二次不給");
  const scary = works.find(w => w.san);
  assert.ok(G.viewShowWork(P, W, scary.id, "2026-11-10").san, "可怕的要擲理智（畫面做）");
  works.forEach(w => G.viewShowWork(P, W, w.id, "2026-11-10"));
  assert.ok(P.insp - insp <= G.NUM.story.showInspDay, "一天有上限");
  const old = W.works.find(w => w.day === 1);
  assert.strictEqual(G.viewShowWork(P, W, old.id, "2026-11-10").insp, 0, "昨天的畫只能看，不給");
});
T("領獎勵：靈感、心情、東西進背包；領過不能再領；每週任務給週章", G => {
  const P = fresh(G), W = G.storyWeek(LIB(G), "2026-11-09");
  G.syncStory(P, W, "2026-11-09");
  const view = G.todayOf(W).daily.find(x => x.kind === "view");
  assert.strictEqual(G.claimTask(P, W, view.id, "2026-11-09").ok, false, "還沒做完");
  G.viewExhibit(P, G.exhibitById("portrait"));
  G.syncStory(P, W, "2026-11-09");
  const insp = P.insp;
  const r = G.claimTask(P, W, view.id, "2026-11-09");
  assert.ok(r.ok);
  assert.strictEqual(P.insp - insp, view.reward.insp);
  assert.strictEqual(G.claimTask(P, W, view.id, "2026-11-09").reason, "領過了");
  // 每週任務：找到招領箱 → 週章
  P.cellar.won["s:2026-W46/box"] = true;
  G.syncStory(P, W, "2026-11-09");
  const w1 = W.weekly.find(t => t.kind === "spot");
  const rw = G.claimTask(P, W, w1.id, "2026-11-09");
  assert.ok(rw.ok);
  assert.strictEqual(G.storyState(P).stamps, G.NUM.story.stampPerTask);
  // 過了這週就領不了
  const later = G.storyWeekAt(LIB(G), "2026-W46", "2026-11-20");
  assert.strictEqual(G.claimTask(P, later, view.id, "2026-11-20").ok, false);
});
T("補做：前幾天的每日任務可以補、獎勵照領；多的那份和「全部做完 N 天」只算當天做完的（決定 0060）", G => {
  const P = fresh(G, "2026-11-10"), W = G.storyWeek(LIB(G), "2026-11-10"), S = G.storyState(P);
  G.syncStory(P, W, "2026-11-10");
  const d1 = G.dayOf(W, 1), view = d1.daily.find(x => x.kind === "view"), show = d1.daily.find(x => x.kind === "show");
  assert.ok(S.tasks[view.id], "第 1 天的任務也開著");
  assert.ok(!W.days.filter(d => d.n > W.dayNo).some(d => d.daily.some(t => S.tasks[t.id])), "還沒到的天不開");
  G.viewExhibit(P, G.exhibitById(view.exhibit));
  G.syncStory(P, W, "2026-11-10");
  assert.ok(G.taskDone(P, view));
  assert.strictEqual(S.tasks[view.id].late, true, "記成補做的");
  assert.ok(G.claimTask(P, W, view.id, "2026-11-10").ok, "補做的獎勵照領");
  // 前幾天的畫看得到（不給靈感），看完就補到「看完特展」
  assert.strictEqual(G.weekReview(W).length, d1.show.works.length);
  const insp = P.insp;
  d1.show.works.forEach(w => G.viewShowWork(P, W, w.id, "2026-11-10"));
  assert.strictEqual(P.insp, insp, "補看不給靈感");
  G.syncStory(P, W, "2026-11-10");
  assert.ok(G.taskDone(P, show));
  // 第 1 天全部補完：多的那份沒有
  d1.daily.forEach(t => { if (!S.tasks[t.id].done) { S.tasks[t.id].done = "2026-11-10"; S.tasks[t.id].late = true; } });
  assert.strictEqual(G.dayBonusState(P, W, 1), "late");
  assert.strictEqual(G.claimDayBonus(P, W, 1, "2026-11-10").ok, false);
  // 今天的當天做完：有
  G.dayOf(W, 2).daily.forEach(t => { S.tasks[t.id].done = "2026-11-10"; delete S.tasks[t.id].late; });
  assert.strictEqual(G.dayBonusState(P, W, 2), "ready");
  assert.strictEqual(G.taskCount(P, W, { id: "2026-W46/x", kind: "dailyAll", n: 3, weekly: true }), 1, "只算當天做完的天");
  G.NUM.story.lateBonus = true;
  assert.strictEqual(G.dayBonusState(P, W, 1), "ready", "設定打開就都算");
});
T("3 個每日任務都做完：多一份；5 個每週任務都做完：限定的那份＋多的週章", G => {
  const P = fresh(G), W = G.storyWeek(LIB(G), "2026-11-09");
  G.syncStory(P, W, "2026-11-09");
  assert.strictEqual(G.dayBonusState(P, W, 1), "wait");
  G.todayOf(W).daily.forEach(t => { G.storyState(P).tasks[t.id].done = "2026-11-09"; });
  assert.strictEqual(G.dayBonusState(P, W, 1), "ready");
  const r = G.claimDayBonus(P, W, 1, "2026-11-09");
  assert.ok(r.ok);
  assert.strictEqual(G.storyState(P).bag["mat:畫布"], 1);
  assert.strictEqual(G.dayBonusState(P, W, 1), "claimed");
  W.weekly.forEach(t => { G.storyState(P).tasks[t.id] = { base: 0, done: "2026-11-09", claimed: null }; });
  const wb = G.claimWeekBonus(P, W, "2026-11-09");
  assert.ok(wb.ok);
  assert.strictEqual(G.storyState(P).stamps, G.NUM.story.stampAllBonus);
  assert.strictEqual(G.claimWeekBonus(P, W, "2026-11-09").ok, false);
});
T("馬上使用：技能書加技能（有上限）、急救箱治好受傷、材料先收著", G => {
  const P = fresh(G), S = G.storyState(P);
  S.bag["book:偵查"] = 2; S.bag.firstAid = 1; S.bag["mat:金線"] = 1;
  G.setRng(seq([0.99])); // 1D3 擲 3
  const before = P.skills.偵查;
  const r = G.useStoryItem(P, "book:偵查");
  assert.ok(r.ok);
  assert.strictEqual(P.skills.偵查, Math.min(G.NUM.story.skillCap, before + 3));
  P.skills.偵查 = G.NUM.story.skillCap;
  assert.strictEqual(G.useStoryItem(P, "book:偵查").ok, false, "到上限了");
  assert.strictEqual(S.bag["book:偵查"], 1, "沒用掉");
  assert.strictEqual(G.useStoryItem(P, "firstAid").ok, false, "沒有受傷的就先收著");
  P.injured = { a: "2026-11-11", b: "2026-11-12" };
  assert.ok(G.useStoryItem(P, "firstAid").ok);
  assert.deepStrictEqual(Object.keys(P.injured), []);
  assert.strictEqual(G.useStoryItem(P, "mat:金線").ok, false);
});
T("書的條件：做完任務才解開、結局要讀夠本數", G => {
  const files = clone(FILES);
  files["備用/常青1/d1.json"].books[1].unlock = { type: "task", task: "d1a" };
  const lib = G.storyLibrary(files);
  const P = fresh(G);
  let W = G.storyWeek(lib, "2026-11-09");
  const b = W.books.find(x => x.local === "1b");
  assert.strictEqual(G.bookState(P, W, b), "locked");
  assert.ok(/做完任務/.test(G.bookHint(W, b)));
  G.syncStory(P, W, "2026-11-09");
  G.viewExhibit(P, G.exhibitById("portrait"));
  const ev = G.syncStory(P, W, "2026-11-09");
  assert.ok(ev.some(e => e.type === "storyBook" && e.book.local === "1b"));
  // 結局：週日，讀了 need 本以後才打開
  W = G.storyWeek(lib, "2026-11-15");
  const end = W.books.find(x => x.ending);
  assert.strictEqual(G.bookState(P, W, end), "locked");
  const S = G.storyState(P);
  W.books.filter(x => !x.ending).slice(0, W.ending.read).forEach(x => { S.books[x.id] = { got: "2026-11-15", read: "2026-11-15" }; });
  assert.strictEqual(G.bookState(P, W, end), "open");
});
T("劇情線：進度、下一步（只說去哪裡）、追蹤、小紅點", G => {
  const P = fresh(G), W = G.storyWeek(LIB(G), "2026-11-09");
  G.syncStory(P, W, "2026-11-09");
  let L = G.storyLines(P, W);
  const lost = L.find(l => l.name === "失物招領");
  assert.ok(!L.some(l => l.name === "箱子後面的小門"), "第 3 天才開始的線，第 1 天不列（名字會破梗）");
  assert.ok(G.storyLines(P, G.storyWeek(LIB(G), "2026-11-11")).some(l => l.name === "箱子後面的小門"));
  assert.strictEqual(lost.books, 2);
  assert.strictEqual(lost.read, 0);
  assert.strictEqual(lost.next.text, "讀書架上的〈招領箱〉");
  assert.strictEqual(lost.next.room, "origin");
  assert.ok(lost.fresh, "新的線亮小紅點");
  G.markLinesSeen(P, L);
  assert.ok(!G.storyLines(P, W).find(l => l.id === lost.id).fresh, "看過就不亮");
  G.readStoryBook(P, W, "2026-W46/1a", "2026-11-09");
  L = G.storyLines(P, W);
  const lost2 = L.find(l => l.id === lost.id);
  assert.strictEqual(lost2.next.text, "去 B1 看看那個招領箱");
  assert.strictEqual(lost2.next.room, "cellar");
  assert.ok(lost2.fresh, "有新的下壹步又亮");
  assert.strictEqual(G.trackLine(P, lost.id), lost.id);
  assert.ok(G.storyLines(P, W).find(l => l.id === lost.id).tracked);
  assert.strictEqual(G.trackLine(P, lost.id), null, "再按壹次取消");
  // 這週過了：線走完，收進劇情回顧
  const past = G.storyPastWeeks(LIB(G), "2026-11-17", P);
  assert.strictEqual(past[0].label, "2026-W46");
  assert.ok(G.storyLines(P, past[0]).every(l => l.done));
});
T("公佈欄：一週一則，每天多一行；週一重要、之後只亮小點", G => {
  const lib = LIB(G);
  const W1 = G.storyWeek(lib, "2026-11-09");
  const n1 = G.storyNotice(W1, "2026-11-09", at("2026-11-09T06:00:00"));
  assert.strictEqual(n1.id, "story-2026-W46");
  assert.strictEqual(n1.importance, "important");
  assert.ok(n1.title.includes("失物招領"));
  const days = n => n.sections.find(s => s[0] === "每天")[1];
  assert.strictEqual(days(n1).length, 1);
  assert.ok(n1.sections.find(s => s[0] === "時間")[1][0].includes("6 天 23 小時"));
  assert.strictEqual(n1.cta.panel, "story");
  const W3 = G.storyWeek(lib, "2026-11-11");
  const n3 = G.storyNotice(W3, "2026-11-11", at("2026-11-11T06:00:00"));
  assert.strictEqual(n3.id, n1.id, "同壹則");
  assert.strictEqual(days(n3).length, 3);
  assert.strictEqual(n3.importance, "normal");
  assert.ok(n3.v > n1.v, "版本加壹，又變成沒讀");
  // 接進公佈欄：NOTICE_EXTRA
  G.NOTICE_EXTRA.push((P, today) => G.storyNotice(G.storyWeek(lib, today), today, at("2026-11-09T06:00:00")));
  const P = fresh(G);
  assert.ok(G.visibleNotices(P, "2026-11-09").some(n => n.id === "story-2026-W46"));
});
T("預算：備用週每天、每週都在 NUM.story 的預算裡", G => {
  const B = G.NUM.story;
  for (let n = 1; n <= 7; n++) { const t = G.dayRewardTotal(FILES[`備用/常青1/d${n}.json`]); assert.ok(t.insp <= B.dayBudget.insp && t.mood <= B.dayBudget.mood && t.items <= B.dayBudget.items, `d${n} ${JSON.stringify(t)}`); }
  const w = G.weekTaskTotal(FILES["備用/常青1/week.json"]);
  assert.ok(w.insp <= B.weekTaskBudget.insp && w.mood <= B.weekTaskBudget.mood && w.items <= B.weekTaskBudget.items);
});
T("自由模式：沒有每週劇情", G => {
  const P = G.newProfile("free"); G.ensureDay(P, "2026-11-09");
  const W = G.storyWeek(LIB(G), "2026-11-09");
  assert.strictEqual(G.syncStory(P, W, "2026-11-09").length, 0);
  assert.strictEqual(G.storyLines(P, W).length, 0);
  assert.strictEqual(G.claimTask(P, W, "x", "2026-11-09").ok, false);
});
T("換參觀者：每週劇情的進度是博物館的，不會跟著人走", G => {
  const P = fresh(G), W = G.storyWeek(LIB(G), "2026-11-09");
  G.syncStory(P, W, "2026-11-09");
  G.storyState(P).stamps = 3;
  const first = P.vid, r = G.addVisitor(P, "第二位", 1);
  assert.ok(r && P.vid !== first, "換成第二位");
  assert.strictEqual(G.storyState(P).stamps, 3);
  assert.ok(G.switchVisitor(P, first));
  assert.strictEqual(G.storyState(P).stamps, 3);
  assert.ok(Object.keys(G.storyState(P).books).length > 0);
});
// ---------- 季節線（決定 0037） ----------
// 正式週 W47、W49 各放一本季節線的書（d1）；W47 的線是冬天那條，spring ＝ true 時 W49 換成春天那條
function withSeason(G, spring) {
  const files = clone(FILES);
  [["2026-W47", "2026-11-16"], ["2026-W49", "2026-11-30"]].forEach(([label, start], i) => {
    const wk = clone(files["備用/常青1/week.json"]); wk.week = label; wk.start = start;
    const line = spring && i === 1 ? { id: "season-2027-spring", name: "春天的門口", kind: "season" } : { id: "season-2026-winter", name: "冬天的明信片", kind: "season" };
    wk.lines.push(line);
    files[label + "/week.json"] = wk;
    for (let n = 1; n <= 7; n++) { const d = clone(files[`備用/常青1/d${n}.json`]); d.date = G.addDays(start, n - 1); files[`${label}/d${n}.json`] = d; }
    files[label + "/d1.json"].books.push({ id: "s" + i, line: line.id, title: "第" + i + "張明信片", spine: "明信片", unlock: { type: "now" }, pages: ["壹", "貳"] });
  });
  return G.storyLibrary(files);
}
T("yearSeason：照節氣切；主線的季（seasonOf）不變", G => {
  const cases = { "2026-11-06": "秋", "2026-11-07": "冬", "2026-12-22": "冬", "2027-01-15": "冬", "2027-02-03": "冬", "2027-02-04": "春", "2027-02-05": "春", "2027-05-04": "春", "2027-05-05": "夏", "2027-08-06": "夏", "2027-08-07": "秋", "2027-11-07": "冬" };
  Object.entries(cases).forEach(([d, s]) => assert.strictEqual(G.yearSeason(d), s, d));
  assert.strictEqual(G.weekSeason("2026-W46"), "冬", "這週剛好立冬");
  assert.strictEqual(G.weekSeason("2026-W45"), "秋");
  assert.strictEqual(G.weekSeason("2027-W05"), "冬", "週一 2/1 還沒立春");
  assert.strictEqual(G.weekSeason("2027-W06"), "春");
  assert.strictEqual(G.seasonOf("2026-W47"), 1, "主線四週一段的季是另一回事");
});
T("季節線：種類合法、跨週同一條、書進「季節」頁籤", G => {
  const lib = withSeason(G), W = G.storyWeek(lib, "2026-11-16");
  assert.strictEqual(G.LINE_KINDS.season, "季節");
  const b = W.books.find(x => x.local === "s0");
  assert.strictEqual(b.line, "season-2026-winter", "id 不加週的名字");
  assert.strictEqual(G.shelfTabOf(G.lineById(W, b.line)), "season");
  assert.strictEqual(G.shelfTabOf({ kind: "main" }), "mainline");
  assert.strictEqual(G.shelfTabOf({ kind: "week" }), "weekly");
});
T("季節線：進度跨週加起來、下一步帶去補讀舊的、過了那週還能讀（不給靈感）", G => {
  const P = fresh(G, "2026-11-30"), lib = withSeason(G);
  const W = G.storyWeek(lib, "2026-11-30"), weeks = G.storyPastWeeks(lib, "2026-11-30", P).concat([W]);
  G.syncStory(P, W, "2026-11-30");
  assert.ok(!G.storyLines(P, W).some(l => l.kind === "season"), "這週的 storyLines 不列，另外算");
  let L = G.seasonLines(P, weeks);
  assert.strictEqual(L.length, 1);
  assert.strictEqual(L[0].books, 2);
  assert.strictEqual(L[0].read, 0);
  assert.ok(L[0].fresh);
  assert.strictEqual(L[0].next.text, "讀書架上的〈第0張明信片〉", "先補舊的");
  assert.strictEqual(L[0].next.params.tab, "season");
  const old = G.storyWeekAt(lib, "2026-W47", "2026-11-30");
  const insp = P.insp, r = G.readStoryBook(P, old, "2026-W47/s0", "2026-11-30");
  assert.ok(r.ok && r.first);
  assert.strictEqual(P.insp, insp, "補讀不給靈感");
  L = G.seasonLines(P, weeks);
  assert.strictEqual(L[0].read, 1);
  assert.strictEqual(L[0].next.text, "讀書架上的〈第1張明信片〉");
  G.readStoryBook(P, W, "2026-W49/s1", "2026-11-30");
  L = G.seasonLines(P, weeks);
  assert.ok(L[0].next.wait, "都讀完了：等下壹章");
  assert.ok(!L[0].done, "這季還沒過");
  assert.strictEqual(G.trackLine(P, L[0].id), L[0].id);
  assert.ok(G.seasonLines(P, weeks)[0].tracked);
});
T("季節線：宣告了還沒放書不列；換季之後舊的那條算走完", G => {
  const P = fresh(G, "2026-11-30");
  const files = clone(FILES), wk = clone(files["備用/常青1/week.json"]);
  wk.week = "2026-W47"; wk.start = "2026-11-16"; wk.lines.push({ id: "season-2026-winter", name: "冬天的明信片", kind: "season" });
  files["2026-W47/week.json"] = wk;
  const noBook = G.storyLibrary(files);
  assert.strictEqual(G.seasonLines(P, [G.storyWeek(noBook, "2026-11-16")]).length, 0, "名字可能破梗");
  const lib = withSeason(G, true), W = G.storyWeek(lib, "2026-11-30");
  const L = G.seasonLines(P, G.storyPastWeeks(lib, "2026-11-30", P).concat([W]));
  assert.strictEqual(L.length, 2);
  assert.ok(L[0].done && L[0].id === "season-2026-winter", "舊的走完，收進劇情回顧");
  assert.ok(!L[1].done && L[1].id === "season-2027-spring");
  assert.strictEqual(G.bookState(P, G.storyWeekAt(lib, "2026-W47", "2026-11-30"), G.storyWeekAt(lib, "2026-W47", "2026-11-30").books.find(b => b.local === "s0")), "open", "舊的書還是讀得到");
});
T("季節線：沒讀也不會卡住這週的結局；讀了也不算進結局的本數", G => {
  const lib = withSeason(G), P = fresh(G, "2026-11-22"), W = G.storyWeek(lib, "2026-11-22"), S = G.storyState(P);
  const end = W.books.find(x => x.ending), season = W.books.find(x => x.local === "s0");
  const others = W.books.filter(x => !x.ending && x !== season);
  others.slice(0, W.ending.read).forEach(x => { S.books[x.id] = { got: "2026-11-22", read: "2026-11-22" }; });
  assert.strictEqual(G.bookState(P, W, end), "open", "季節線的書沒讀，結局照開");
  const P2 = fresh(G, "2026-11-22"), S2 = G.storyState(P2);
  S2.books[season.id] = { got: "2026-11-22", read: "2026-11-22" };
  others.slice(0, W.ending.read - 1).forEach(x => { S2.books[x.id] = { got: "2026-11-22", read: "2026-11-22" }; });
  assert.strictEqual(G.bookState(P2, W, end), "locked", "季節線的書不算");
});
T("舊週包沒有季節線照常", G => {
  const lib = LIB(G), P = fresh(G), W = G.storyWeek(lib, "2026-11-09");
  assert.strictEqual(G.seasonLines(P, [W]).length, 0);
  assert.ok(G.storyLines(P, W).length > 0);
  assert.strictEqual(G.seasonLines(G.newProfile("free"), [W]).length, 0, "自由模式也沒有");
});
// ---------- 今日特展的新畫（works[].svg）：畫面和檢查程式用同一個 sanitizeSvg ----------
const SVG_OK = "<svg viewBox='0 0 10 10' width='99' height='99'><defs><linearGradient id='g'><stop offset='0' stop-color='#fff'/></linearGradient><path id='p' d='M0 0L1 1'/></defs><rect width='10' height='10' fill='url(#g)'/><use href='#p'/><text x='1' y='2'>待領<tspan>壹</tspan></text></svg>";
T("sanitizeSvg：畫圖的標籤留著；id 加前綴、連結跟著改；svg 的大小交給畫框；字記下來", G => {
  const r = G.sanitizeSvg(SVG_OK, "a-");
  assert.ok(r.ok, r.errors.join());
  assert.ok(r.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">'), r.svg.slice(0, 80));
  assert.ok(r.svg.includes('id="a-g"') && r.svg.includes('fill="url(#a-g)"') && r.svg.includes('href="#a-p"'));
  assert.ok(!/width="99"/.test(r.svg));
  assert.strictEqual(JSON.stringify(r.texts), JSON.stringify(["待領", "壹"]));
  assert.notStrictEqual(G.sanitizeSvg(SVG_OK, "b-").svg, r.svg, "前綴不同，不同幅的 id 不會撞");
  assert.strictEqual(G.sanitizeSvg(SVG_OK.split("<rect").join("|<rect").split("|"), "a-").svg, r.svg, "字串的陣列也可以");
});
T("sanitizeSvg：不准的東西整幅不要（回傳空字串）", G => {
  const bad = {
    "<script>": "<svg viewBox='0 0 1 1'><script>alert(1)</script></svg>",
    "大寫": "<svg viewBox='0 0 1 1'><SCRIPT>alert(1)</SCRIPT></svg>",
    "foreignObject": "<svg viewBox='0 0 1 1'><foreignObject><div/></foreignObject></svg>",
    "image": "<svg viewBox='0 0 1 1'><image href='a.png'/></svg>",
    "a": "<svg viewBox='0 0 1 1'><a href='#x'><rect/></a></svg>",
    "style 標籤": "<svg viewBox='0 0 1 1'><style>rect{fill:red}</style></svg>",
    "style 屬性": "<svg viewBox='0 0 1 1'><rect style='fill:url(http://x.y/z)'/></svg>",
    "onload": "<svg viewBox='0 0 1 1' onload='x()'></svg>",
    "ONCLICK": "<svg viewBox='0 0 1 1'><rect ONCLICK='x()'/></svg>",
    "外部 href": "<svg viewBox='0 0 1 1'><use href='http://x.y/z#a'/></svg>",
    "xlink": "<svg viewBox='0 0 1 1'><use xlink:href='https://x.y/z#a'/></svg>",
    "外部 url": "<svg viewBox='0 0 1 1'><rect fill='url(https://x.y/z)'/></svg>",
    "javascript": "<svg viewBox='0 0 1 1'><use href='javascript:x()'/></svg>",
    "繞過": "<svg viewBox='0 0 1 1'><rect fill='&#106;avascript:x'/></svg>",
    "沒有 viewBox": "<svg><rect/></svg>",
    "最外面不是 svg": "<g viewBox='0 0 1 1'></g>",
    "第二個 svg": "<svg viewBox='0 0 1 1'></svg><svg viewBox='0 0 1 1'></svg>",
    "裡面再一個 svg": "<svg viewBox='0 0 1 1'><svg viewBox='0 0 1 1'/></svg>",
    "註解": "<svg viewBox='0 0 1 1'><!-- x --></svg>",
    "CDATA": "<svg viewBox='0 0 1 1'><![CDATA[x]]></svg>",
    "title 塞標籤": "<svg viewBox='0 0 1 1'><title><rect/></title></svg>",
    "字的編碼繞過": "<svg viewBox='0 0 1 1'><text>&#19968;</text></svg>",
    "標籤外面的字": "<svg viewBox='0 0 1 1'>abc</svg>",
    "沒關起來": "<svg viewBox='0 0 1 1'><g>",
    "class": "<svg viewBox='0 0 1 1'><rect class='btn'/></svg>",
    "不存在的 id": "<svg viewBox='0 0 1 1'><rect fill='url(#nope)'/></svg>",
    "重複的 id": "<svg viewBox='0 0 1 1'><rect id='a'/><rect id='a'/></svg>",
    "不是字串": 12,
  };
  Object.entries(bad).forEach(([k, v]) => { const r = G.sanitizeSvg(v, "a-"); assert.strictEqual(r.ok, false, k); assert.strictEqual(r.svg, "", k); assert.ok(r.errors.length, k); });
});
T("sanitizeSvg：一幅最多 NUM.story.showSvgKB", G => {
  const fit = "<svg viewBox='0 0 1 1'>" + "<rect/>".repeat(Math.floor((G.NUM.story.showSvgKB * 1024 - 40) / 7)) + "</svg>";
  assert.ok(G.sanitizeSvg(fit).ok);
  const r = G.sanitizeSvg(fit + "<rect/>".repeat(40));
  assert.strictEqual(r.ok, false);
  assert.ok(/太大/.test(r.errors[0]));
});
T("備用週的新畫都過得了淨化；同一天新舊可以混著", G => {
  let n = 0;
  for (let d = 1; d <= 7; d++) FILES[`備用/常青1/d${d}.json`].show.works.filter(w => w.svg != null).forEach(w => { const r = G.sanitizeSvg(w.svg, "x-"); assert.ok(r.ok, w.id + r.errors.join()); n++; });
  assert.ok(n >= 2, "至少 2 幅當例子");
  const W = G.storyWeek(LIB(G), "2026-11-11");
  const works = G.todayOf(W).show.works;
  assert.ok(works.some(w => w.svg != null) && works.some(w => w.art), "第 3 天新舊混著");
  assert.ok(works.find(w => w.svg != null).id.startsWith("2026-W46/"));
});
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
