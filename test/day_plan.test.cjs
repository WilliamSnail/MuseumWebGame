// tools/day_plan.cjs（npm run day:plan）和 tools/day_check.cjs（npm run day:check）：用假資料測，不讀真的內容、不連網
const assert = require("assert");
const { load } = require("./load_shared.cjs");
const P = require("../tools/day_plan.cjs");
const C = require("../tools/day_check.cjs");
const G = load();

let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };

const beat = (id, week, extra = {}) => ({ id, week, mystery: "m-count", detail: "牆上的記號高度壹樣。", channels: [{ where: "書", clue: true, npc: ["v-a"] }, { where: "房間", clue: true }, { where: "公佈欄" }], status: "planned", ...extra });
const ledger = () => ({
  revealBeats: { list: [beat("b01", "2026-W47"), beat("b02", "2026-W49", { status: "skipped" })] },
  mysteries: { list: [{ id: "m-count", closeBy: "2026-W50", status: "open" }, { id: "m-old", closeBy: "2026-W40", status: "closed" }] },
  calendar: { days: [{ date: "11-25", name: "公報送到", idea: "最後壹頁都是同壹行小字" }] },
  seasonal: { lines: [{ id: "s-win", chapters: [{ week: "2026-W47", title: "第二張", written: null }, { week: "2026-W48", title: "別週", written: null }] }] },
  weeks: { "2026-W47": { hooks: ["d1：留了什麼 → d2"], main: "x" } },
});
const npc = (id, kind, arc) => ({ id, name: id, kind, arc });
const arc = (n, from, ties) => ({ step: n, from, ties });
const base = (date, extra = {}) => ({ date, G, ledger: ledger(), settings: { pause: false, pauseWeeks: [] }, weeks: {}, recent: [], npcs: [], economy: { gdp: { quarter: "2026Q3", published: "2026-10-30" } }, ...extra });

T("日期：週一、ISO 週、分支、檔案", () => {
  const p = P.planDay(base("2026-11-16"));
  assert.strictEqual(p.isMonday, true); assert.strictEqual(p.week, "2026-W47"); assert.strictEqual(p.weekdayName, "週一");
  assert.strictEqual(p.branch, "claude/週劇情-2026-W47");
  assert.deepStrictEqual(p.files, ["content/weeks/2026-W47/week.json", "content/weeks/2026-W47/d1.json", "content/weeks/2026-W47/靈感來源.md"]);
  const q = P.planDay(base("2026-11-19"));
  assert.strictEqual(q.isMonday, false); assert.strictEqual(q.branch, "claude/週劇情-2026-W47-d4"); assert.deepStrictEqual(q.files, ["content/weeks/2026-W47/d4.json"]);
  assert.strictEqual(P.planDay(base("2026-12-28")).week, "2026-W53", "2026 有 W53");
  assert.strictEqual(P.planDay(base("2027-01-04")).week, "2027-W01");
});
T("暫停：pause 或 pauseWeeks", () => {
  assert.strictEqual(P.planDay(base("2026-11-16", { settings: { pause: true } })).paused, true);
  assert.strictEqual(P.planDay(base("2026-11-16", { settings: { pause: false, pauseWeeks: ["2026-W47"] } })).paused, true);
  assert.strictEqual(P.planDay(base("2026-11-16")).paused, false);
  assert.ok(P.format(P.planDay(base("2026-11-16", { settings: { pause: true } }))).includes("暫停"));
});
T("揭露週、回聲週、大揭曉週、跳過的不算", () => {
  const w47 = P.planDay(base("2026-11-18")); // 週三
  assert.strictEqual(w47.beat.kind, "揭露週"); assert.strictEqual(w47.beatDay, "d3"); assert.strictEqual(w47.isBeatDay, true);
  assert.strictEqual(P.planDay(base("2026-11-17")).isBeatDay, false);
  assert.strictEqual(P.planDay(base("2026-11-23")).beat.kind, "回聲週", "揭露週的下壹週");
  assert.strictEqual(P.planDay(base("2026-11-30")).beat.kind, "一般週", "W49 那筆是 skipped，也不是回聲週");
  assert.strictEqual(P.planDay(base("2026-12-07")).beat.kind, "大揭曉週", "closeBy 那週");
  assert.strictEqual(P.planDay(base("2026-12-14")).beat.kind, "一般週", "W50 的下壹週：上壹週不是揭露週");
  const l = ledger(); l.weeks["2026-W47"].beat = { id: "b01", day: "d5" };
  const p = P.planDay(base("2026-11-20", { ledger: l })); assert.strictEqual(p.beatDay, "d5"); assert.strictEqual(p.isBeatDay, true);
  assert.ok(P.format(P.planDay(base("2026-11-18"))).includes("就是今天"));
});
T("週一的空缺：npc、fest；建議店照最近用得少的排", () => {
  assert.deepStrictEqual(P.weekGaps({}), { npc: true, fest: 2 });
  assert.deepStrictEqual(P.weekGaps({ npc: { store: "food" }, fest: [{ store: "bj" }] }), { npc: false, fest: 1 });
  assert.deepStrictEqual(P.weekGaps({ npc: { store: "food" }, fest: [{}, {}] }), { npc: false, fest: 0 });
  const recent = [{ npc: { store: "food" }, fest: [{ store: "bj" }, { store: "food" }] }, { fest: [{ store: "job" }] }];
  assert.deepStrictEqual(P.suggestStores(recent, 3).map(s => s.store), ["cellar", "craft", "bj"], "沒用過的先，其次用 1 次的（同樣照固定順序）");
  assert.strictEqual(P.suggestStores([], 1)[0].store, "food", "都沒用過就照固定順序");
  const p = P.planDay(base("2026-11-16", { recent }));
  assert.ok(p.gaps.npc && p.gaps.fest === 2 && p.suggest.length === 3);
  const q = P.planDay(base("2026-11-17")); assert.deepStrictEqual(q.gaps, { npc: false, fest: 0 }, "週一以外不提週包的空缺");
});
T("帳本 weeks 週一要有的欄位", () => {
  const p = P.planDay(base("2026-11-16"));
  assert.deepStrictEqual(p.ledgerMissing, ["ties", "news", "question", "motifs"], "W47 的帳本有 main、hooks，其他還沒寫");
});
T("NPC：最需要補段的、本週上線的、旅客數、揭露週的 NPC", () => {
  const npcs = [
    npc("c-a", "client", [arc(1, "2026-11-10"), arc(2, "2026-11-20", ["m-count"])]),
    npc("c-b", "client", [arc(1, "2026-11-10")]),
    npc("v-a", "visitor", [arc(1, "2026-11-10")]),
    npc("c-c", "client", [1, 2, 3, 4, 5, 6].map(i => arc(i, i === 6 ? "2026-12-30" : "2026-11-01"))),
    npc("t-x", "trace", []),
  ];
  const r = P.npcNeeds(npcs, "2026-11-16", "2026-11-16", G);
  assert.deepStrictEqual(r.need.map(x => x.id), ["c-b", "v-a"], "c-a 之後已有排；c-c 滿 6 段；trace 不算");
  assert.deepStrictEqual(r.thisWeek.map(x => x.id), ["c-a"]);
  assert.strictEqual(r.visitors, 1); assert.strictEqual(r.visitorsLow, true);
  const gaps = P.beatNpcGaps(beat("b01", "2026-W47"), npcs, "2026-11-16", G);
  assert.deepStrictEqual(gaps.map(x => x.id), ["v-a"], "channels 指定的 v-a 這週沒有段");
  assert.deepStrictEqual(P.beatNpcGaps(null, npcs, "2026-11-16", G), []);
  const p = P.planDay(base("2026-11-16", { npcs }));
  assert.deepStrictEqual(p.beatNpc.map(x => x.id), ["v-a"]);
});
T("GDP 只在公布月份的月底前後提醒", () => {
  assert.strictEqual(P.gdpWindow("2026-11-28"), true); assert.strictEqual(P.gdpWindow("2026-12-01"), true);
  assert.strictEqual(P.gdpWindow("2026-11-16"), false); assert.strictEqual(P.gdpWindow("2026-12-20"), false);
  assert.strictEqual(P.gdpWindow("2027-01-27"), true); assert.strictEqual(P.gdpWindow("2027-02-01"), true, "1 月底公布之後的 2/1 還在窗口"); assert.strictEqual(P.gdpWindow("2027-01-02"), false, "12 月不公布");
  assert.strictEqual(P.gdpWindow("2027-03-28"), false, "3 月、6 月不公布");
});
T("今天的檔缺什麼", () => {
  assert.strictEqual(P.dayGaps(null, 3), null);
  const d = { books: [{ ending: true }], show: { works: [{ svg: ["<svg/>"] }, { art: "frog" }] }, market: [{}], real: ["x"], books2: [], weeklyWords: [{}] };
  const g = P.dayGaps(d, 7);
  assert.strictEqual(g.books, 1); assert.strictEqual(g.svg, 1); assert.strictEqual(g.market, true); assert.strictEqual(g.clue, false); assert.strictEqual(g.ending, true);
  assert.strictEqual(P.dayGaps({ books: [{ clue: "c-x" }] }, 2).clue, true);
  assert.strictEqual(P.dayGaps({ books: [] }, 2).ending, null, "週日以外不看結局書");
  const weeks = { "2026-W47": { week: {}, days: { 2: { books: [] } } } };
  const p = P.planDay(base("2026-11-17", { weeks }));
  assert.strictEqual(p.dayExists, true); assert.deepStrictEqual(p.files, [], "今天的檔已經有就不再列要建立");
  assert.strictEqual(p.dayGaps.clue, false);
});
T("季節線、帳本 calendar、hooks", () => {
  const p = P.planDay(base("2026-11-16"));
  assert.deepStrictEqual(p.chapters.map(c => c.title), ["第二張"]);
  assert.strictEqual(P.planDay(base("2026-11-25")).calendar[0].name, "公報送到");
  assert.strictEqual(P.planDay(base("2026-11-17")).hookToday, false);
  const l = ledger(); l.weeks["2026-W47"].hooks.push("d2：留了壹個空欄 → d3");
  assert.strictEqual(P.planDay(base("2026-11-17", { ledger: l })).hookToday, true);
});
T("這七天的日子", () => {
  const rows = P.weekOverview("2026-11-27", G, ledger());
  assert.strictEqual(rows.length, 7); assert.strictEqual(rows[0].date, "2026-11-23"); assert.strictEqual(rows[2].calendar[0], "公報送到");
  assert.ok(P.formatWeek(rows).includes("公報送到"));
});
T("節日配活動：名字對得上的店先、店輪流、d3 以後、最多 2 個 fest ＋ 1 個 npc", () => {
  assert.strictEqual(P.funStore("酸黃瓜日"), "food"); assert.strictEqual(P.funStore("填字遊戲日"), "craft"); assert.strictEqual(P.funStore("莫耳日"), "cellar"); assert.strictEqual(P.funStore("撲克牌日"), "bj"); assert.strictEqual(P.funStore("神祕日"), null);
  assert.strictEqual(P.festName("酸黃瓜日", "food"), "酸黃瓜開動日"); assert.strictEqual(P.festName("填字遊戲日", "craft"), "填字遊戲動手日");
  const days = [
    { date: "2026-11-18", dayNo: 3, items: [{ kind: "趣味", name: "酸黃瓜日", line: "罐子打開" }] },
    { date: "2026-11-19", dayNo: 4, items: [{ kind: "趣味", name: "蛋糕日", line: "" }, { kind: "趣味", name: "填字遊戲日", line: "" }] },
    { date: "2026-11-21", dayNo: 6, items: [{ kind: "趣味", name: "神祕日", line: "" }] },
  ];
  const r = P.suggestFest(days, [], { npc: true, fest: 2 });
  assert.strictEqual(r.fest.length, 2); assert.ok(r.npc); assert.strictEqual(r.missing, 0);
  const all = [...r.fest, r.npc]; assert.strictEqual(new Set(all.map(x => x.date)).size, 3, "同壹天只選壹個");
  assert.strictEqual(new Set(all.map(x => x.store)).size, 3, "三個用三家不同的店");
  assert.ok(r.fest.every(x => x.date >= "2026-11-18"));
  assert.ok(all.find(x => x.date === "2026-11-18").store === "food" && all.find(x => x.date === "2026-11-18").matched, "酸黃瓜日 → 餐車");
  // 餐車最近用過 2 次：蛋糕日（也是 food）讓出去，填字遊戲日給手作坊
  const recent = [{ npc: { store: "food" }, fest: [{ store: "food", date: "x" }] }];
  const r2 = P.suggestFest(days.slice(1), recent, { npc: false, fest: 2 });
  assert.deepStrictEqual(r2.fest.map(x => x.store).sort(), ["bj", "craft"], "餐車用過了：d4 給手作坊（填字遊戲日），d6 的神祕日借給最少用的牌桌");
  // 日子不夠：missing 和上網查的提示
  const r3 = P.suggestFest([], [], { npc: true, fest: 2 });
  assert.strictEqual(r3.fest.length, 0); assert.strictEqual(r3.missing, 3); assert.ok(r3.hint.includes("shared/holidays.js") && r3.hint.includes("FUN_TEXT"));
  assert.strictEqual(P.suggestFest(days, [], { npc: false, fest: 0 }).fest.length, 0, "不缺就不選");
  assert.deepStrictEqual(P.storeUsage([{ npc: { store: "bj" }, fest: [{ store: "bj" }, { store: "job" }] }]), { food: 0, bj: 2, job: 1, cellar: 0, craft: 0 });
});
T("節日配活動：真的日期（W48 有聖代日、蛋糕日、法式吐司日）；不是週一不排", () => {
  const p = P.planDay(base("2026-11-23"));
  assert.ok(p.festPlan && p.festPlan.fest.length === 2 && p.festPlan.npc, "W48 的 d3 以後有趣味節日，都排得到");
  assert.ok(P.format(p).includes("節日配活動") && P.format(p).includes("那天的冷知識"));
  assert.strictEqual(P.planDay(base("2026-11-24")).festPlan, null);
  assert.deepStrictEqual(P.weekItems("2026-11-23", G).map(d => d.dayNo), [3, 4, 6], "11-25 聖代、11-26 蛋糕、11-28 法式吐司");
});
T("印出來：有該有的段落，指令是新的那幾個", () => {
  const txt = P.format(P.planDay(base("2026-11-16")));
  ["週一", "揭露週", "npc（劇情日", "fest（預告", "NPC", "要建立的檔", "最後要跑"].forEach(k => assert.ok(txt.includes(k), k));
  const p = P.planDay(base("2026-11-17"));
  const cmd = p.commands.join("\n");
  assert.ok(cmd.includes("npm run day:check") && cmd.includes("npm run ship") && cmd.includes("discord-scheduled.yml") && cmd.includes("doc:new") && cmd.includes("-d2"));
  assert.ok(P.format(P.planDay(base("2026-11-23"))).includes("回聲"));
  assert.ok(P.format(P.planDay(base("2026-12-07"))).includes("收線"));
});
T("day:check：整理每一項的結果、清單、結束碼", () => {
  const ok = C.summarize("甲", 0, "警告 a：x\n警告 b：y\n都過了\n", "");
  assert.strictEqual(ok.ok, true); assert.strictEqual(ok.warnings.length, 2); assert.strictEqual(ok.note, "都過了");
  const bad = C.summarize("乙", 1, "", "content/x.json：壞了\n1 個問題\n");
  assert.strictEqual(bad.ok, false); assert.deepStrictEqual(bad.errors, ["content/x.json：壞了"]);
  const txt = C.formatReport([ok, bad]);
  assert.ok(txt.includes("✓ 甲") && txt.includes("✗ 乙") && txt.includes("1 項沒過") && txt.includes("警告 a：x") && txt.includes("壞了"));
  const all = C.formatReport([ok]);
  assert.ok(all.includes("全部通過") && all.includes("2 個警告"));
  assert.ok(C.formatReport([C.summarize("丙", 0, "好\n", "")]).includes("全部通過"));
});
T("day:check：NPC 打包跟真的內容壹致", () => {
  const r = C.packFresh(); assert.ok(r.ok, r.message);
});

// npm run ledger（tools/ledger.cjs）：只看這週、壹次改壹個欄位
const LG = require("../tools/ledger.cjs");
T("ledger：get／set／push 用點路徑，陣列可以用 id", () => {
  const L = { weeks: { "2026-W47": { hooks: ["d1：a"] } }, foreshadow: [{ id: "f-page", due: "2026-W50", closed: false }] };
  assert.strictEqual(LG.get(L, "foreshadow.f-page.due"), "2026-W50");
  assert.strictEqual(LG.get(L, "foreshadow.0.id"), "f-page");
  LG.push(L, "weeks.2026-W47.hooks", "d2：b");
  assert.deepStrictEqual(L.weeks["2026-W47"].hooks, ["d1：a", "d2：b"]);
  LG.push(L, "weeks.2026-W48.hooks", "d1：c"); // 沒有的就建
  assert.deepStrictEqual(L.weeks["2026-W48"].hooks, ["d1：c"]);
  LG.set(L, "foreshadow.f-page.closed", LG.parseVal("true"));
  assert.strictEqual(L.foreshadow[0].closed, true);
  assert.strictEqual(LG.parseVal("d3：純文字"), "d3：純文字");
  assert.throws(() => LG.get(L, "foreshadow.f-none.due"), /找不到/);
});
T("ledger today：只挑這週的、還沒收的伏筆；這週還沒寫就給上週的鉤子", () => {
  const L = { main: { theme: "差壹隻", seasons: [{ season: 1, weeks: ["2026-W47"], chapters: [{ week: "2026-W47", title: "第壹章" }, { week: "2026-W48", title: "第貳章" }] }] },
    weeks: { "2026-W46": { hooks: ["d7：翻過來"], question: "q" } },
    foreshadow: [{ id: "a", closed: true }, { id: "b", closed: false }],
    mysteries: { list: [{ id: "m1", clues: [{ week: "2026-W47" }] }, { id: "m2", clues: [{ week: "2026-W49" }] }] } };
  const out = Object.fromEntries(LG.today(L, "2026-W47", "2026-W46").map(([t, v]) => [t.split(" ")[0], v]));
  assert.strictEqual(out["主線的主旨"], "差壹隻");
  assert.deepStrictEqual(out["這週那章"].map(c => c.title), ["第壹章"]);
  assert.deepStrictEqual(out["還沒收的伏筆"].map(f => f.id), ["b"]);
  assert.deepStrictEqual(out["mysteries.list"].map(m => m.id), ["m1"]);
  assert.deepStrictEqual(out["上週"].hooks, ["d7：翻過來"]);
});

console.log(`${pass} passed, ${fail} failed（day_plan、day_check）`);
process.exit(fail ? 1 : 0);
