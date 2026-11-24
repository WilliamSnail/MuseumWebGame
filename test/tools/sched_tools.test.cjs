// 每日排程優化（11-16）：ship 只改內容跳過本機測試、day:check --strict、day:new 骨架、day:pr 草稿、
// ledger reveal／written／day／apply、npm run issue。全部用假資料測，不讀真的內容、不連網。
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const { load } = require("../load_shared.cjs");
const G = load();
const SHIP = require("../../tools/release/ship.cjs");
const P = require("../../tools/content/day_plan.cjs");
const C = require("../../tools/content/day_check.cjs");
const D = require("../../tools/content/day_lib.cjs");
const N = require("../../tools/content/day_new.cjs");
const PR = require("../../tools/content/day_pr.cjs");
const LG = require("../../tools/content/ledger.cjs");
const IS = require("../../tools/release/issue.cjs");

let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack || e.message); } };

// ---------- 1. ship：只動內容就跳過本機的 npm test 和 build ----------
T("ship：內容路徑（content、維護日誌、公告、.claude、打包檔）才算內容", () => {
  ["content/weeks/2026-W47/d2.json", "content/story/帳本.json", "docs/維護日誌/2026/11-16_翊文_x.md", "content/notices/upd-x.json", ".claude/交接/x.md", "shared/npc/roster.js", "shared/world/map_data.js"]
    .forEach(f => assert.ok(SHIP.isContentFile(f), f));
  ["web/src/core/main.js", "shared/world/map.js", "shared/game/notices.js", "shared/story/core.js", "functions/index.js", "tools/release/ship.cjs", "test/a.test.cjs", "package.json", "docs/決定/0001.md", "contentX/a.json", "xcontent/a.json"]
    .forEach(f => assert.ok(!SHIP.isContentFile(f), f));
});
T("ship：全部是內容才跳過；有任何程式檔、沒有檔案、--full 都照舊全跑", () => {
  const c = ["content/weeks/2026-W47/d2.json", "docs/維護日誌/2026/a.md", "content/notices/upd-x.json"];
  assert.strictEqual(SHIP.contentOnly(c), true);
  assert.strictEqual(SHIP.contentOnly([...c, "tools/content/day_check.cjs"]), false);
  assert.strictEqual(SHIP.contentOnly([...c, "shared/story/core.js"]), false);
  assert.strictEqual(SHIP.contentOnly([]), false, "沒有檔案不能當成只動內容");
  assert.strictEqual(SHIP.contentOnly(undefined), false);
  const none = new Set();
  const a = SHIP.localPlan(c, none); assert.strictEqual(a.mode, "content"); assert.ok(a.line.includes("跳過") && a.line.includes("day:check") && a.line.includes("--full"), "要印壹行說明為什麼跳過");
  assert.strictEqual(SHIP.localPlan([...c, "web/src/a.js"], none).mode, "full");
  assert.strictEqual(SHIP.localPlan(c, new Set(["full"])).mode, "full");
  assert.strictEqual(SHIP.localPlan([], none).mode, "full");
  assert.strictEqual(SHIP.localPlan(c, new Set(["skip-local"])).mode, "skip");
  assert.strictEqual(SHIP.localPlan(["web/a.js"], new Set(["skip-local"])).mode, "skip");
});
T("ship：--full 是開關，不用給值", () => {
  const o = SHIP.parseArgs(["--title", "標題四個字", "--full"]);
  assert.ok(o.flags.has("full")); assert.strictEqual(o.title, "標題四個字");
});

// ---------- 2. day:check --strict ----------
const beat = (id, week, extra = {}) => ({ id, week, mystery: "m-count", detail: "牆上的記號高度壹樣。", channels: [{ where: "書", clue: true }, { where: "房間", clue: true }, { where: "公佈欄" }], status: "planned", revealedOn: null, clues: [], ...extra });
const ledger = () => ({
  revealBeats: { list: [beat("b01", "2026-W47")] },
  mysteries: { list: [{ id: "m-count", closeBy: "2026-W50", status: "open", clues: [] }] },
  main: { seasons: [{ season: 1, chapters: [{ week: "2026-W47", title: "第壹章", written: null }] }], units: [{ id: "u1", weeks: ["2026-W47", "2026-W48"], written: null }, { id: "u2", weeks: ["2026-W49", "2026-W50"], written: null }] },
  seasonal: { lines: [{ id: "season-w", chapters: [{ week: "2026-W47", title: "第壹張", written: null }] }] },
  weeks: { "2026-W47": { unit: "u1", unitRole: "beat", main: "m", ties: ["d3：碰到 m-count"], question: "q", motifs: ["a"], hooks: ["d3：鉤子 → d4"], memes: ["d3：程序梗"], subthemes: { main: "st-count", touched: { d3: ["st-count"] } }, beat: { id: "b01", day: "d3" } } },
});
const wkJson = (extra = {}) => ({ lines: [{ id: "w47-count", name: "牆上的正字", kind: "week" }], ...extra });
const svgWork = (extra = {}) => ({ id: "s3a", title: "畫", lines: ["x"], svg: ["<svg/>"], ...extra });
const dayObj = (n, extra = {}) => ({ day: n, date: "x", books: [{ id: `${n}a`, line: "w47-count", title: "書", clue: "c-a", pages: ["p"] }, { id: `${n}b`, line: "w47-count", title: "書2", clue: "c-b", pages: ["p"] }], market: ["m"], show: { title: "展", works: [svgWork()] }, ...extra });
const mk = (date, o = {}) => {
  const L = o.ledger || ledger(), pl = P.planDay({ date, G, ledger: L, settings: { pause: false, pauseWeeks: [] }, weeks: { "2026-W47": { week: o.wk === null ? null : (o.wk || wkJson()), days: o.day ? { [G.weekDayNo(date)]: o.day } : {} }, ...(o.weeks || {}) }, recent: [], npcs: [], economy: null });
  return { p: pl, day: o.day || null, wk: o.wk === null ? null : (o.wk || wkJson()), ledger: L, opts: o.opts || {} };
};
const revealed = L => { const b = L.revealBeats.list[0]; b.status = "revealed"; b.revealedOn = "2026-11-18"; b.clues = ["c-a", "c-b"]; return L; };
const has = (E, s) => E.some(x => x.includes(s));

T("strict：該有的都有就過（揭露日 d3，帳本已 revealed）", () => {
  const E = C.strictIssues(mk("2026-11-18", { day: dayObj(3), ledger: revealed(ledger()) }));
  assert.deepStrictEqual(E, []);
});
T("strict：今天的檔還沒寫就擋", () => { assert.ok(has(C.strictIssues(mk("2026-11-18", {})), "還沒寫")); });
T("strict：沒有 clue、沒有 svg、平日沒有 market 都擋；--allow-no-market 放行", () => {
  const d = dayObj(3, { books: [{ id: "3a", line: "w47-count", title: "書", pages: ["p"] }], market: [], show: { title: "展", works: [{ id: "s", title: "t", lines: ["x"], art: "frog" }] } });
  const E = C.strictIssues(mk("2026-11-18", { day: d, ledger: revealed(ledger()) }));
  assert.ok(has(E, "沒有任何 clue") && has(E, "svg") && has(E, "market"), E.join("|"));
  const E2 = C.strictIssues({ ...mk("2026-11-18", { day: d, ledger: revealed(ledger()) }), opts: { allowNoMarket: true } });
  assert.ok(!has(E2, "market"));
  const sat = C.strictIssues(mk("2026-11-21", { day: dayObj(6, { market: [] }), ledger: ledger() })); // 週六休市
  assert.ok(!has(sat, "market"), "週末不用 market");
});
T("strict：帳本今天那行（hooks、ties、memes、touched）沒寫就擋，只看今天那行", () => {
  const L = ledger(); // 只有 d3 的行；今天是 d4
  const E = C.strictIssues(mk("2026-11-19", { day: dayObj(4), ledger: L }));
  ["hooks 沒有「d4：」", "ties 沒有「d4：」", "memes 沒有「d4：」", "touched.d4"].forEach(s => assert.ok(has(E, s), s + "\n" + E.join("\n")));
  L.weeks["2026-W47"].hooks.push("d4：今天的鉤子"); L.weeks["2026-W47"].ties.push("d4：碰到 x"); L.weeks["2026-W47"].memes.push("d4：梗"); L.weeks["2026-W47"].subthemes.touched.d4 = ["st-count"];
  assert.deepStrictEqual(C.strictIssues(mk("2026-11-19", { day: dayObj(4), ledger: L })), []);
  const L2 = ledger(); L2.weeks["2026-W47"].hooks.push("d4：x"); L2.weeks["2026-W47"].ties.push("d4：x"); L2.weeks["2026-W47"].subthemes.touched.d4 = ["st-count"];
  assert.ok(has(C.strictIssues(mk("2026-11-19", { day: dayObj(4), ledger: L2 })), "memes"));
  assert.ok(!has(C.strictIssues({ ...mk("2026-11-19", { day: dayObj(4), ledger: L2 }), opts: { allowNoMeme: true } }), "memes"));
});
T("strict：揭露日 clue 不夠、帳本還沒改 revealed 都擋", () => {
  const one = dayObj(3, { books: [{ id: "3a", line: "w47-count", title: "書", clue: "c-a", pages: ["p"] }], show: { title: "展", works: [svgWork()] } }); // 只有 1 個 clue，channels 要 2 個
  assert.ok(has(C.strictIssues(mk("2026-11-18", { day: one, ledger: revealed(ledger()) })), "channels 有 2 個地方要放 clue"));
  const E = C.strictIssues(mk("2026-11-18", { day: dayObj(3), ledger: ledger() }));
  assert.ok(has(E, "revealBeats「b01」還沒改成 revealed") && has(E, "ledger -- reveal b01"), E.join("|"));
  const wrongDay = revealed(ledger()); wrongDay.revealBeats.list[0].revealedOn = "2026-11-17";
  assert.ok(has(C.strictIssues(mk("2026-11-18", { day: dayObj(3), ledger: wrongDay })), "revealBeats"));
  // 不是揭露日不看
  assert.ok(!has(C.strictIssues(mk("2026-11-17", { day: dayObj(2), ledger: ledger() })), "revealBeats"));
});
T("strict：週日要有結局書、主線章節書、answer；回聲週週日要填 units.written", () => {
  const L = ledger(); const w = L.weeks["2026-W47"]; w.hooks.push("d7：x"); w.ties.push("d7：x"); w.memes.push("d7：x"); w.subthemes.touched.d7 = ["st-count"];
  const sun = dayObj(7, { books: [{ id: "7a", line: "w47-count", title: "書", clue: "c-a", pages: ["p"] }] });
  const E = C.strictIssues(mk("2026-11-22", { day: sun, ledger: L }));
  ["結局書", "主線章節書", "answer"].forEach(s => assert.ok(has(E, s), s + "\n" + E.join("\n")));
  const full = dayObj(7, { books: [...sun.books, { id: "7end", line: "w47-count", ending: true, title: "終", pages: ["p"] }, { id: "7main", line: "main-s1", title: "章", pages: ["p"] }] });
  const wk = wkJson({ answer: "答案", lines: [{ id: "w47-count", name: "x", kind: "week" }, { id: "main-s1", name: "第1季", kind: "main" }] });
  assert.deepStrictEqual(C.strictIssues(mk("2026-11-22", { day: full, ledger: L, wk })), []);
  // 主線書認得出：line 叫別的名字，但 week.json 把它標成 kind main
  const custom = dayObj(7, { books: [...sun.books, { id: "7end", line: "w47-count", ending: true, title: "終", pages: ["p"] }, { id: "7main", line: "line-m", title: "章", pages: ["p"] }] });
  assert.ok(D.isMainBook(custom.books[2], wkJson({ lines: [{ id: "line-m", kind: "main" }] })));
  // 回聲週（W48）週日
  const L2 = ledger(); L2.weeks["2026-W48"] = { unit: "u1", unitRole: "echo", hooks: ["d7：x"], ties: ["d7：x"], memes: ["d7：x"], subthemes: { touched: { d7: ["st-count"] } } };
  const p = P.planDay({ date: "2026-11-29", G, ledger: L2, settings: null, weeks: { "2026-W48": { week: wk, days: { 7: full } } }, recent: [], npcs: [], economy: null });
  assert.ok(has(C.strictIssues({ p, day: full, wk, ledger: L2, opts: {} }), "main.units「u1」的 written"));
  L2.main.units[0].written = "2026-W48/7main";
  assert.ok(!has(C.strictIssues({ p, day: full, wk, ledger: L2, opts: {} }), "written"));
});
T("strict：骨架的「待寫」沒改掉就擋；暫停不檢查；週一帳本欄位", () => {
  assert.ok(has(C.strictIssues(mk("2026-11-18", { day: dayObj(3, { board: D.CONTENT_PLACEHOLDER }), ledger: revealed(ledger()) })), "待寫"));
  const pa = mk("2026-11-18", { day: dayObj(3) }); pa.p.paused = true;
  assert.deepStrictEqual(C.strictIssues(pa), []);
  const L = ledger(); delete L.weeks["2026-W47"].question; delete L.weeks["2026-W47"].unit;
  L.weeks["2026-W47"].hooks = ["d1：x"]; L.weeks["2026-W47"].ties = ["d1：x"]; L.weeks["2026-W47"].memes = ["d1：x"]; L.weeks["2026-W47"].subthemes.touched = { d1: ["st-count"] };
  const E = C.strictIssues(mk("2026-11-16", { day: dayObj(1), ledger: L }));
  assert.ok(has(E, "weeks.2026-W47.question 週一要寫") && has(E, "unit 要是 u1"), E.join("|"));
  assert.ok(has(C.strictIssues(mk("2026-11-16", { day: dayObj(1), ledger: L, wk: null })), "week.json 還沒寫"));
});
T("strict：只看今天，舊的週不追溯（W46 的 d7 沒有 touched 也沒人管，只有今天算）", () => {
  const L = ledger(); L.weeks["2026-W46"] = { hooks: [], ties: [] }; // 舊週空空的
  assert.deepStrictEqual(C.strictIssues(mk("2026-11-18", { day: dayObj(3), ledger: revealed(L) })), []);
});
T("day:check：館外地圖打包有沒有跟上", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mapfresh-"));
  fs.mkdirSync(path.join(dir, "shared", "world"), { recursive: true }); fs.mkdirSync(path.join(dir, "content", "map", ), { recursive: true });
  assert.strictEqual(C.mapFresh(dir).ok, true, "沒有地圖資料不擋");
  fs.writeFileSync(path.join(dir, "content", "map", "館外.json"), JSON.stringify({ version: 1, spots: [{ id: "m-a", name: "巷口", layer: "L1", from: "2026-11-18", x: 1, y: 2, line: "一句" }] }));
  assert.strictEqual(C.mapFresh(dir).ok, false, "shared/world/map_data.js 不見了");
  const pack = require("../../tools/content/map_pack.cjs");
  fs.writeFileSync(path.join(dir, "shared", "world", "map_data.js"), pack.source(pack.spots(path.join(dir, "content", "map", "館外.json"))));
  assert.strictEqual(C.mapFresh(dir).ok, true);
  fs.writeFileSync(path.join(dir, "content", "map", "館外.json"), JSON.stringify({ version: 1, spots: [] }));
  const r = C.mapFresh(dir); assert.ok(!r.ok && r.message.includes("map_pack"));
});

// ---------- 3. day_lib ----------
T("day_lib：clue 從書、特展、房間找，同壹個只算壹次，分得出在哪", () => {
  const d = { books: [{ id: "a", title: "書名", clue: "c-1" }], show: { works: [{ title: "畫", clue: "c-2" }, { title: "畫2", clue: "c-1" }] }, adds: [{ title: "房", choices: [{ success: { clue: "c-3" } }] }], casino: { clue: "c-4" } };
  assert.deepStrictEqual(D.collectClues(d).map(c => [c.id, c.where]), [["c-1", "書"], ["c-2", "今日特展"], ["c-3", "房間"], ["c-4", "其他"]]);
  assert.strictEqual(D.collectClues(d)[2].title, "房");
  assert.deepStrictEqual(D.collectClues(null), []);
});
T("day_lib：hasDayLine 只認 dN：開頭（d1 不會誤認 d10；半形冒號也行）", () => {
  assert.ok(D.hasDayLine(["d3：x"], 3)); assert.ok(D.hasDayLine(["d3: x"], 3)); assert.ok(!D.hasDayLine(["d3 季節線：x"], 3)); assert.ok(!D.hasDayLine(["d13：x"], 3)); assert.ok(!D.hasDayLine(undefined, 3));
  assert.ok(D.hasPlaceholder({ a: ["待寫"] })); assert.ok(!D.hasPlaceholder({ a: "好" }));
});

// ---------- 4. day:new 骨架 ----------
T("day:new：平日骨架有必填欄位、平日有 market、全部是待寫", () => {
  const { p, wk, ledger: L } = mk("2026-11-19", {});
  const s = N.skeleton(p, wk, L);
  N.SKEL_KEYS.forEach(k => assert.ok(s[k] !== undefined, k));
  assert.strictEqual(s.day, 4); assert.strictEqual(s.date, "2026-11-19"); assert.strictEqual(s.books[0].line, "w47-count");
  assert.strictEqual(s.daily.length, 3); assert.ok(s.market.length >= 3); assert.strictEqual(s.show.works.length, 3);
  assert.ok(D.hasPlaceholder(s) && s.show.works.every(w => w.svg.length));
  assert.ok(!s.books[0].clue, "不是揭露日，不掛 clue 空位");
  assert.ok(!("market" in N.skeleton(mk("2026-11-21", {}).p, wk, L)), "週末休市不放 market");
});
T("day:new：揭露日第壹本書掛 clue 空位；週日多結局書和主線章節書", () => {
  const b = mk("2026-11-18", {}); assert.ok(N.skeleton(b.p, b.wk, b.ledger).books[0].clue.startsWith("c-"));
  const su = mk("2026-11-22", {}), s = N.skeleton(su.p, su.wk, su.ledger);
  assert.ok(s.books.some(x => x.ending) && s.books.some(x => x.line === "main-s1"), "第 1 季 → main-s1");
  assert.ok(D.isMainBook(s.books[2], su.wk));
  assert.ok(N.notes(su.p, su.wk, su.ledger, G).join("\n").includes("answer"), "週日提醒 answer");
  assert.ok(N.notes(su.p, su.wk, su.ledger, G).join("\n").includes("lines 還沒有那條 kind main"));
});
T("day:new：昨天的鉤子；已經有檔就不覆蓋，只說差什麼", () => {
  const L = ledger(); L.weeks["2026-W46"] = { hooks: ["d6：x", "d7：上週日留的"] };
  assert.strictEqual(N.yesterdayHook(L, "2026-W47", "2026-W46", 4), "d3：鉤子 → d4");
  assert.strictEqual(N.yesterdayHook(L, "2026-W47", "2026-W46", 1), "d7：上週日留的");
  assert.strictEqual(N.yesterdayHook(L, "2026-W47", "2026-W46", 6), null);
  assert.deepStrictEqual(N.missingNotes({ day: 4 }, N.skeleton(mk("2026-11-19", {}).p, wkJson(), L)).slice(0, 2), ["缺欄位 date", "缺欄位 holiday"]);
  const m = mk("2026-11-19", {}); assert.ok(N.notes(m.p, m.wk, m.ledger, G)[0].includes("d3：鉤子"));
});

// ---------- 5. day:pr ----------
T("day:pr：PR 說明有書、特展、警告，不寫謎底細節；日誌草稿格式對得上 doc:new", () => {
  const m = mk("2026-11-18", { day: dayObj(3), ledger: revealed(ledger()) });
  const info = { p: m.p, day: m.day, rec: m.ledger.weeks["2026-W47"], ledger: m.ledger, files: ["content/weeks/2026-W47/d3.json", "content/story/帳本.json", "tools/x.cjs"], strictOut: "✓ 全部通過", warnings: ["某個警告"] };
  const body = PR.prBody(info);
  ["《書》", "svg 新畫 1 幅", "揭露節奏：第 1 次", "某個警告", "全部通過", "tools/x.cjs"].forEach(s => assert.ok(body.includes(s), s));
  assert.ok(!body.includes("牆上的記號高度"), "不寫揭露的細節");
  const spec = PR.logSpec(info), { logText } = require("../../tools/content/new_doc.cjs");
  assert.ok(logText(spec, "2026-11-18 08:00:00", "1.0").includes("類型: 內容"));
  assert.ok(spec.scope.every(f => f.startsWith("content/")));
  assert.deepStrictEqual(PR.warningLines("✓ a\n  警告 一\n警告 二\n"), ["一", "二"]);
  assert.strictEqual(PR.summarizeDay(null), null);
  assert.ok(PR.prBody({ ...info, strictOut: "✗ 1 項沒過", warnings: [] }).includes("沒過"));
});

// ---------- 6. ledger 回填 ----------
T("ledger：putDayLine 沒有就加、有就換掉，重跑不會變兩行；沒寫 dN： 會自動補", () => {
  const L = { weeks: { w: { hooks: ["d1：a"] } } };
  assert.ok(LG.putDayLine(L, "weeks.w.hooks", 2, "接 d1").includes("加壹行"));
  assert.deepStrictEqual(L.weeks.w.hooks, ["d1：a", "d2：接 d1"]);
  assert.ok(LG.putDayLine(L, "weeks.w.hooks", 2, "d2：改過").includes("換掉"));
  assert.deepStrictEqual(L.weeks.w.hooks, ["d1：a", "d2：改過"]);
  LG.putDayLine(L, "weeks.w.memes", 2, "梗"); assert.deepStrictEqual(L.weeks.w.memes, ["d2：梗"], "欄位沒有就建");
});
T("ledger reveal：beat 改 revealed、clues 填入、mysteries 補線索，已有的補「已放」不重複加", () => {
  const L = ledger(); L.mysteries.list[0].clues.push({ week: "2026-W47", where: "書", what: "清點（c-a）" });
  const day = { books: [{ title: "書名", clue: "c-a" }], show: { works: [{ title: "畫", clue: "c-b" }] } };
  const out = LG.revealBeat(L, "b01", day, "2026-11-18", 3);
  const b = L.revealBeats.list[0];
  assert.strictEqual(b.status, "revealed"); assert.strictEqual(b.revealedOn, "2026-11-18"); assert.deepStrictEqual(b.clues, ["c-a", "c-b"]);
  const cl = L.mysteries.list[0].clues;
  assert.strictEqual(cl.length, 2); assert.ok(cl[0].what.includes("c-a，已放")); assert.deepStrictEqual([cl[1].week, cl[1].day, cl[1].where], ["2026-W47", "d3", "今日特展"]); assert.ok(cl[1].what.includes("畫（c-b，已放）"));
  assert.ok(out.length >= 3);
  LG.revealBeat(L, "b01", day, "2026-11-18", 3); assert.strictEqual(L.mysteries.list[0].clues.length, 2, "重跑不會多加");
  const L2 = ledger(); LG.revealBeat(L2, "b01", day, "2026-11-18", 3, ["c-b"]); assert.deepStrictEqual(L2.revealBeats.list[0].clues, ["c-b"], "只挑 c-b");
  assert.throws(() => LG.revealBeat(ledger(), "b99", day, "x", 3), /沒有 b99/);
  assert.throws(() => LG.revealBeat(ledger(), "b01", { books: [] }, "x", 3), /沒有 clue/);
  // 補完以後 strict 認得
  assert.deepStrictEqual(C.strictIssues(mk("2026-11-18", { day: dayObj(3), ledger: (() => { const x = ledger(); LG.revealBeat(x, "b01", dayObj(3), "2026-11-18", 3); return x; })() })), []);
});
T("ledger written：季節線、主線章填書的 id；回聲週週日填 units；填過的不動", () => {
  const L = ledger(), wk = wkJson({ lines: [{ id: "w47-count", kind: "week" }, { id: "main-s1", kind: "main" }] });
  const day = { books: [{ id: "2s", line: "season-w" }, { id: "7main", line: "main-s1" }] };
  const out = LG.fillWritten(L, "2026-W47", day, wk, 7);
  assert.strictEqual(L.seasonal.lines[0].chapters[0].written, "2026-W47/2s");
  assert.strictEqual(L.main.seasons[0].chapters[0].written, "2026-W47/7main");
  assert.strictEqual(L.main.units[0].written, null, "W47 是第 1 週，不是回聲週");
  assert.strictEqual(out.length, 2);
  assert.deepStrictEqual(LG.fillWritten(L, "2026-W47", day, wk, 7), [], "填過的不動");
  const L2 = ledger(); L2.main.seasons[0].chapters.push({ week: "2026-W48", title: "二", written: null });
  LG.fillWritten(L2, "2026-W48", { books: [{ id: "7main", line: "main-s1" }] }, wk, 7);
  assert.strictEqual(L2.main.units[0].written, "2026-W48/7main"); assert.strictEqual(L2.main.seasons[0].chapters[1].written, "2026-W48/7main");
  const L3 = ledger(); LG.fillWritten(L3, "2026-W48", { books: [{ id: "3a", line: "main-s1" }] }, wk, 3); assert.strictEqual(L3.main.units[0].written, null, "不是週日不填 units");
});
T("ledger day：今天那幾行壹次寫、touched、揭露日自動找要 reveal 的 beat", () => {
  const L = ledger();
  const out = LG.fillDay(L, "2026-W47", 4, { hook: "接 d5", ties: "碰 m-count", meme: "梗", world: "世界", side: "支線", touched: ["st-count", "st-outside"] });
  const w = L.weeks["2026-W47"];
  assert.strictEqual(out.length, 6);
  assert.ok(w.hooks.includes("d4：接 d5") && w.ties.includes("d4：碰 m-count") && w.memes.includes("d4：梗") && w.world.includes("d4：世界") && w.sideRefs.includes("d4：支線"));
  assert.deepStrictEqual(w.subthemes.touched.d4, ["st-count", "st-outside"]);
  assert.deepStrictEqual(C.strictIssues(mk("2026-11-19", { day: dayObj(4), ledger: L })), [], "回填完 strict 就過");
  assert.throws(() => LG.fillDay(ledger(), "2026-W99", 1, {}), /還沒有/);
  assert.deepStrictEqual(LG.beatsDueToday(ledger(), "2026-W47", 3).map(b => b.id), ["b01"]);
  assert.deepStrictEqual(LG.beatsDueToday(ledger(), "2026-W47", 4), []);
  const ex = ledger(); ex.revealBeats.list.push(beat("b24", "2026-W47", { extra: true })); assert.deepStrictEqual(LG.beatsDueToday(ex, "2026-W47", 3).map(b => b.id), ["b01", "b24"], "加開的跟著同壹天");
  const done = revealed(ledger()); assert.deepStrictEqual(LG.beatsDueToday(done, "2026-W47", 3), [], "放過的不再記");
});
T("ledger apply：壹串 set／push 壹次做完；格式錯就停", () => {
  const L = { a: { b: [] }, c: 1 };
  assert.deepStrictEqual(LG.applyOps(L, [{ push: "a.b", value: "x" }, { set: "c", value: 2 }, { set: "a.d.e", value: true }]), ["push a.b", "set c", "set a.d.e"]);
  assert.deepStrictEqual(L, { a: { b: ["x"], d: { e: true } }, c: 2 });
  assert.throws(() => LG.applyOps(L, { set: "c" }), /陣列/);
  assert.throws(() => LG.applyOps(L, [{ set: "c", push: "a.b", value: 1 }]), /二選壹/);
  assert.throws(() => LG.applyOps(L, [{ set: "c" }]), /value/);
});

// ---------- 8. day:new 週一的 week.json 骨架（11-16 第二批） ----------
const seasonLedger = () => {
  const L = ledger();
  L.main.seasons = [
    { season: 0, name: "序章", weeks: ["2026-W46"], chapters: [{ week: "2026-W46", title: "換季的失物招領" }] },
    { season: 1, name: "帳對不上", weeks: ["2026-W47", "2026-W48"], chapters: [{ week: "2026-W47", title: "第壹章　多壹隻" }, { week: "2026-W48", title: "第貳章　白布的名牌" }] },
  ];
  L.seasonal.lines[0].name = "冬天的明信片";
  return L;
};
T("week 骨架：新壹季頭壹週 summary 第壹行自動寫「主線開始」，其他欄位是待寫，有主線線和季節線", () => {
  const L = seasonLedger(), p = mk("2026-11-16", { wk: null, ledger: L }).p;
  const w = N.weekSkeleton(p, L, null);
  assert.strictEqual(w.week, "2026-W47"); assert.strictEqual(w.start, "2026-11-16");
  assert.strictEqual(w.summary[0], "📖 主線第 1 季〈帳對不上〉開始：第壹章〈多壹隻〉");
  assert.ok(w.summary.length >= 2 && w.summary[1] === D.CONTENT_PLACEHOLDER, "summary 至少 2 行");
  assert.deepStrictEqual(w.lines.map(l => l.kind), ["week", "main", "season"]);
  assert.strictEqual(w.lines[0].id, "w47-待寫"); assert.strictEqual(w.lines[1].id, "main-s1"); assert.strictEqual(w.lines[1].name, "第壹季　帳對不上");
  assert.strictEqual(w.lines[2].id, "season-w");
  assert.strictEqual(w.weekly.length, 5, "每週任務剛好 5 個空殼");
  assert.ok(w.ending.need.read >= 1 && w.weeklyBonus.insp > 0);
  ["title", "theme", "question"].forEach(k => assert.strictEqual(w[k], D.CONTENT_PLACEHOLDER, k));
  assert.ok(!("answer" in w), "answer 週日才寫，骨架不放");
  assert.ok(D.hasPlaceholder(w));
});
T("week 骨架：不是頭壹週不寫「開始」；主線的名字照上週；序章（season 0）不寫「開始」", () => {
  const L = seasonLedger(), prev = N.weekSkeleton(mk("2026-11-16", { wk: null, ledger: L }).p, L, null);
  prev.lines[1].name = "第壹季　帳對不上（上週的名字）";
  const p48 = P.planDay({ date: "2026-11-23", G, ledger: L, settings: null, weeks: {}, recent: [], npcs: [], economy: null });
  const w = N.weekSkeleton(p48, L, prev);
  assert.strictEqual(w.summary[0], D.CONTENT_PLACEHOLDER, "第 2 週沒有主線開始那行");
  assert.strictEqual(w.lines.find(l => l.kind === "main").name, "第壹季　帳對不上（上週的名字）", "跨週同 id 同名字");
  assert.ok(!w.lines.some(l => l.kind === "season"), "這週沒有季節線的章就不放那條線");
  const p46 = P.planDay({ date: "2026-11-09", G, ledger: L, settings: null, weeks: {}, recent: [], npcs: [], economy: null }), w46 = N.weekSkeleton(p46, L, null);
  assert.ok(!w46.summary[0].includes("開始") && w46.lines.find(l => l.kind === "main").name === "序章");
  assert.strictEqual(N.seasonOpenLine(null), null);
  assert.strictEqual(N.chapterLabel("第壹章　多壹隻"), "第壹章〈多壹隻〉"); assert.strictEqual(N.chapterLabel("多壹隻"), "〈多壹隻〉");
});
T("week 骨架：不在任何壹季（備用）就沒有主線的線；沒有 weeklyBonus 的上週用預設", () => {
  const L = ledger(), p = mk("2026-11-16", { wk: null, ledger: L }).p;
  L.main.seasons = []; const w = N.weekSkeleton(p, L, { weeklyBonus: { insp: 7, items: [] }, lines: [] });
  assert.ok(!w.lines.some(l => l.kind === "main")); assert.deepStrictEqual(w.weeklyBonus, { insp: 7, items: [] });
  assert.ok(N.weekNotes(p, L).join(" ").includes("不在帳本 main.seasons"));
});
T("week 骨架的提醒：unit／unitRole、answer 週日才寫、選填欄位", () => {
  const L = seasonLedger(), p = mk("2026-11-16", { wk: null, ledger: L }).p, t = N.weekNotes(p, L).join(" ");
  assert.ok(t.includes('unit: "u1"') && t.includes('unitRole: "beat"'), t);
  assert.ok(t.includes("answer") && t.includes("週日") && t.includes("頭壹週"));
  const L2 = seasonLedger(), p2 = P.planDay({ date: "2026-11-23", G, ledger: L2, settings: null, weeks: {}, recent: [], npcs: [], economy: null });
  assert.ok(N.weekNotes(p2, L2).join(" ").includes('unitRole: "echo"'));
});
T("strict：週骨架的「待寫」沒改掉就擋（answer 不算），改掉就過", () => {
  const L = seasonLedger(), wk = N.weekSkeleton(mk("2026-11-16", { wk: null, ledger: L }).p, L, null);
  const day = dayObj(1, { books: [{ id: "1a", line: "w47-count", title: "書", clue: "c-a", pages: ["p"] }] });
  const m = mk("2026-11-16", { ledger: L, wk, day });
  assert.ok(has(C.strictIssues(m), "week.json 還有「待寫」"), "週骨架沒填完要擋");
  const filled = JSON.parse(JSON.stringify(wk).split(D.CONTENT_PLACEHOLDER).join("好了"));
  assert.ok(!has(C.strictIssues(mk("2026-11-16", { ledger: L, wk: filled, day })), "week.json 還有"), "填完就不擋這條");
  assert.ok(!has(C.strictIssues(mk("2026-11-16", { ledger: L, wk: { ...filled, answer: undefined }, day })), "week.json 還有"), "answer 不放不算待寫");
});
T("day:new 週一：已有 week.json 不覆蓋（main 只在沒有時才建）", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "tools", "content", "day_new.cjs"), "utf8");
  assert.ok(src.includes("if (p.isMonday && !wk)"), "只有週一而且沒有 week.json 才建");
  assert.ok(src.includes("weekSkeleton(p, ctx.ledger"));
});

// ---------- 7. npm run issue ----------
T("issue：標題和內文都要寫、打錯選項就停；gh api 走 REST、內文用 -f 傳", () => {
  const i = IS.parseArgs(["排程失敗 W47 d3", "ship 在等 CI 時停了\n第二行", "--label", "排程"]);
  assert.strictEqual(i.title, "排程失敗 W47 d3"); assert.deepStrictEqual(i.labels, ["排程"]);
  const a = IS.apiArgs(i, "o/r");
  assert.deepStrictEqual(a.slice(0, 4), ["api", "-X", "POST", "repos/o/r/issues"]);
  assert.ok(a.includes("title=排程失敗 W47 d3") && a.some(x => x.startsWith("body=ship 在等 CI")) && a.includes("labels[]=排程"));
  assert.ok(!a.includes("graphql") && !a.includes("issue"), "不能走 gh issue create（GraphQL）");
  assert.throws(() => IS.parseArgs(["短"]), /標題/);
  assert.throws(() => IS.parseArgs(["標題夠長了", "  "]), /內文/);
  assert.throws(() => IS.parseArgs(["標題夠長了", "x", "--bad"]), /沒有 --bad/);
  assert.throws(() => IS.parseArgs(["標題夠長了", "x", "--label"]), /後面/);
  const f = path.join(os.tmpdir(), "issue_body_test.md"); fs.writeFileSync(f, "從檔案來的內文");
  assert.strictEqual(IS.parseArgs(["標題夠長了", "--body-file", f]).body, "從檔案來的內文\n");
});

T("ledger range／about：只挑跨到的週、謎題不印謎底；about 找本身和提到它的（11-19）", () => {
  const L = { weeks: { "2026-W47": { question: "q47" }, "2026-W50": { question: "q50" } },
    mysteries: { list: [{ id: "m-x", q: "問", truth: "謎底", clues: [{ week: "2026-W47", what: "線索47" }, { week: "2026-W52", what: "線索52" }] }] },
    foreshadow: [{ id: "f-a", note: "提到 m-x", week: "2026-W48" }], revealBeats: { list: [{ id: "b1", week: "2026-W47", mystery: "m-x" }] } };
  const r = LG.range(L, ["2026-W47"]); const txt = JSON.stringify(r);
  assert.ok(txt.includes("q47") && !txt.includes("q50"), "只挑跨到的週");
  assert.ok(txt.includes("線索47") && !txt.includes("線索52"), "謎題只列那週的線索");
  assert.ok(!txt.includes("謎底"), "range 不印謎底");
  assert.ok(txt.includes("b1"), "揭露有列");
  const ab = LG.about(L, "m-x");
  assert.strictEqual(ab.self.length, 1);
  assert.deepStrictEqual(ab.refs.map(x => x[0]).sort(), ["foreshadow.f-a", "revealBeats.list.b1"]);
});

// 規劃寫好的劇本（決定 0156）：script.dN 的必寫句要原樣在那個地方；理智檢定要找得到；時事要有網址和「劇情：」
T("劇本：必寫句不在對的地方就擋，放了就過；換行空白不算", () => {
  const L = { extend: { weeks: { "2026-W48": { script: { d3: { scene: "場景", must: [{ where: "房間", text: "地上沒有腳印。" }, { where: "公佈欄", text: "多記了壹筆。" }], san: [{ where: "房間", spec: "0/1D3" }] } } } } } };
  const p = { week: "2026-W48", weekday: 3, dayFile: "d3.json" };
  const bad = C.scriptIssues({ p, day: { adds: [], board: "多記了壹筆。", books: [{ pages: ["地上沒有腳印。"] }] }, ledger: L });
  assert.strictEqual(bad.length, 2, "房間沒放那句、也沒有理智檢定：" + bad.join("｜"));
  const ok = C.scriptIssues({ p, day: { adds: [{ intro: "地上\n沒有腳印。", choices: [{ check: { type: "san", spec: "0/1D3" } }] }], board: "多記了壹筆。" }, ledger: L });
  assert.deepStrictEqual(ok, []);
  assert.deepStrictEqual(C.scriptIssues({ p: { ...p, weekday: 4 }, day: {}, ledger: L }), [], "沒有劇本的日子不查");
});
T("時事：週二起靈感來源要有 ## dN、網址、「劇情：」；搜不到要寫搜了什麼；週一不查", () => {
  const p = { week: "2026-W48", weekday: 2 };
  assert.strictEqual(C.newsIssues({ p, srcText: "## d1\nhttps://a 劇情：書" }).length, 1, "沒有 d2 那段");
  assert.strictEqual(C.newsIssues({ p, srcText: "## d2\nhttps://a" }).length, 1, "有網址沒寫劇情");
  assert.deepStrictEqual(C.newsIssues({ p, srcText: "## d2（11-24）\n- https://a\n- 劇情：書第壹頁\n## d3\n" }), []);
  assert.deepStrictEqual(C.newsIssues({ p, srcText: "## d2\n搜不到：選舉 新聞" }), []);
  assert.strictEqual(C.newsIssues({ p, srcText: "## d20\nhttps://a 劇情：x" }).length, 1, "d20 不是 d2");
  assert.deepStrictEqual(C.newsIssues({ p: { ...p, weekday: 1 }, srcText: "" }), []);
});

console.log(`${pass} passed, ${fail} failed（每日排程優化）`);
process.exit(fail ? 1 : 0);
