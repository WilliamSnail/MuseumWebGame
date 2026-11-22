// 排程檢視（11-22，Yuga 的 5 項）：strict 查延伸世界的四問真的放了、ledger today 排最前並預設只印標題、day:plan 多印 extend、ship 失敗報告、每日排程有沒有跑的檢查
// node test/tools/sched_review.test.cjs（npm test 也會跑）
const assert = require("assert");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 5).join("\n    ")); } };
const C = require("../../tools/content/day_check.cjs"), LG = require("../../tools/content/ledger.cjs"), V = require("../../tools/content/extend_view.cjs"), S = require("../../tools/release/ship.cjs"), H = require("../../tools/check/schedule_health.cjs");
const has = (E, s) => E.some(x => x.includes(s));

// ---- 1. strict：延伸世界四問 ----
const led = () => ({ extend: { weeks: { "2026-W48": {
  dread: { what: "d", day: "d3", where: "房間（B1 牆）；d6 今日特展再出現壹次" }, cost: { what: "c", day: "d7", where: "今日特展（打算盤的背影）", san: "1/1D4" },
  pepe: { what: "p", day: "d4", where: "房間（B1）＋NPC 日報" }, horror: { what: "h", day: "d5", where: "公佈欄＋每週任務旁白" }, closes: ["m-count"] } } } });
const P = n => ({ week: "2026-W48", weekday: n, dayFile: `content/weeks/2026-W48/d${n}.json` });
const full = (extra = {}) => Object.assign({ adds: [{ id: "r" }], show: { works: [{ id: "s", san: "1/1D4", clue: "c-x" }] }, board: "公佈欄的字", daily: [{ id: "d", giver: "yuga", says: "x" }], books: [{ id: "b", clue: "c-b" }] }, extra);
T("今天是 dread 那天（d3）：放在房間但今天沒有 adds → 擋；有就過；別天的 d6 那段不算今天", () => {
  assert.ok(has(C.extendIssues({ p: P(3), day: full({ adds: [] }), ledger: led() }), "dread（恐懼）"));
  assert.deepStrictEqual(C.extendIssues({ p: P(3), day: full(), ledger: led() }), []);
  assert.ok(!has(C.extendIssues({ p: P(6), day: full({ show: { works: [] } }), ledger: led() }), "今日特展"), "d6 不是 dread 的那天（day 是 d3）");
});
T("cost 那天（d7）：今天的檔要有今日特展、而且找得到 cost.san；closes 週日要有 clue", () => {
  assert.ok(has(C.extendIssues({ p: P(7), day: full({ show: { works: [{ id: "s", clue: "c" }] } }), ledger: led() }), "理智檢定 san"));
  assert.ok(has(C.extendIssues({ p: P(7), day: full({ show: { works: [] }, books: [] }), ledger: led() }), "今日特展"));
  assert.deepStrictEqual(C.extendIssues({ p: P(7), day: full(), ledger: led() }), []);
  assert.ok(has(C.extendIssues({ p: P(7), day: full({ show: { works: [{ id: "s", san: "1/1D4" }] }, books: [] }), ledger: led() }), "沒有任何 clue"));
});
T("pepe（房間＋NPC 日報）、horror（公佈欄＋任務旁白）：每個認得的地方都要有；不認得的（NPC 日報）略過", () => {
  assert.ok(has(C.extendIssues({ p: P(4), day: full({ adds: [] }), ledger: led() }), "pepe（佩佩）"));
  assert.deepStrictEqual(C.extendIssues({ p: P(4), day: full(), ledger: led() }), []);
  assert.ok(has(C.extendIssues({ p: P(5), day: full({ board: "" }), ledger: led() }), "公佈欄"));
  assert.ok(has(C.extendIssues({ p: P(5), day: full({ daily: [], weeklyWords: [] }), ledger: led() }), "任務旁白"));
});
T("沒有 extend 的週、今天沒排到四問：不多擋；strictIssues 有串進去（今天的檔沒有今日特展 san 就報）", () => {
  const L = led(); assert.deepStrictEqual(C.extendIssues({ p: P(2), day: full({ adds: [] }), ledger: L }), []);
  assert.deepStrictEqual(C.extendIssues({ p: { week: "2026-W49", weekday: 3, dayFile: "x" }, day: full(), ledger: L }), []);
  assert.ok(C.hasSanSpec({ a: [{ san: "1 / 1D4" }] }, "1/1D4") && !C.hasSanSpec({ san: "1D2" }, "1/1D4"));
});

// ---- 2. ledger today ----
const bigLedger = () => { const L = led(); L.extend.items = [{ id: "foe-f1g", name: "紙箱頂", week: "2026-W48", book: "《x》", lore: "l", extraPage: "e", clueKind: "k", audit: { status: "審過" } }];
  L.extend.threads = []; L.extend.collect = { rows: [{ id: "c-m", line: "m 的線", kind: "謎", week: "2026-W48", dread: "見 extend.weeks.2026-W48.dread", cost: "見 extend.weeks.2026-W48.cost", pepe: "p2", horror: "h2" }] };
  L.mysteries = { list: [{ id: "m-count", q: "差一隻", closeBy: "2026-W48", status: "open", truth: "不該印出來的謎底謎底謎底", clues: ["a"], note: "n" }] };
  L.newsThreads = { list: [{ id: "n1", name: "線", status: "open", until: "2026-W50", story: "長長的故事 2026-W48", timeline: [1, 2, 3] }] };
  L.revealBeats = { list: [{ id: "b1", week: "2026-W48", mystery: "m-count", status: "open", detail: "很長的 detail", channels: [1], clues: [] }] }; L.main = { theme: "主旨" }; return L; };
T("ledger today：延伸世界排最前；mysteries／newsThreads／revealBeats 預設只印標題（沒有謎底）、--full 才全文", () => {
  const t = LG.today(bigLedger(), "2026-W48", "2026-W47", {});
  assert.ok(t[0][0].startsWith("延伸世界 extend.weeks.2026-W48"), "排最前");
  const m = t.find(x => x[0].startsWith("mysteries.list")), n = t.find(x => x[0].startsWith("newsThreads.list")), b = t.find(x => x[0].startsWith("revealBeats.list"));
  assert.deepStrictEqual(Object.keys(m[1][0]), ["id", "q", "closeBy", "status"]); assert.ok(!JSON.stringify(m[1]).includes("謎底")); assert.deepStrictEqual(Object.keys(n[1][0]), ["id", "name", "status", "until"]); assert.deepStrictEqual(Object.keys(b[1][0]), ["id", "week", "mystery", "status", "revealedOn"]);
  const f = LG.today(bigLedger(), "2026-W48", "2026-W47", { full: true }); assert.ok(JSON.stringify(f).includes("謎底謎底") && JSON.stringify(f).includes("很長的 detail"));
  assert.ok(JSON.stringify(t).length < JSON.stringify(f).length);
});
T("extendBlock：四問直接印出來（「見 extend.weeks…」換成內容）、這週的掉落和附頁一起帶", () => {
  const b = LG.extendBlock(bigLedger(), "2026-W48"); assert.strictEqual(b.collect[0].dread, "d（d3）"); assert.ok(b.collect[0].cost.includes("san 1/1D4")); assert.strictEqual(b.collect[0].pepe, "p2");
  assert.strictEqual(b.items[0].id, "foe-f1g"); assert.strictEqual(b.items[0].audit, "審過"); assert.strictEqual(LG.extendBlock(bigLedger(), "2026-W49"), null);
});

// ---- 3. day:plan 的延伸段 ----
T("extendTail：今天排到的四問、這週的 extend.items、collect 的四問摘要；沒有延伸的週回空字串", () => {
  const t = V.extendTail(bigLedger(), "2026-W48", 3);
  assert.ok(t.includes("今天排到的四問") && t.includes("恐懼（房間（B1 牆）；d6 今日特展再出現壹次）：d") && t.includes("foe-f1g「紙箱頂」") && t.includes("來歷：l") && t.includes("附頁：e") && t.includes("c-m m 的線") && t.includes("代價：c（d7） san 1/1D4"));
  assert.ok(V.extendTail(bigLedger(), "2026-W48", 2).includes("今天沒有排到四問")); assert.strictEqual(V.extendTail(bigLedger(), "2026-W49", 1), ""); assert.strictEqual(V.extendTail(null, "x", 1), "");
});

// ---- 4. ship：署名來自 SHIP_AI、失敗報告 ----
T("署名：commitText 用傳進來的 ai（main 讀 SHIP_AI，沒設是 Claude Opus 5.5）", () => {
  assert.ok(S.commitText("標題", "Claude Sonnet 5.5").includes("Co-Authored-By: Claude Sonnet 5.5") && S.commitText("標題").includes("Claude Opus 5.5"));
  assert.ok(require("fs").readFileSync(require("path").join(__dirname, "..", "..", "tools", "release", "ship.cjs"), "utf8").includes("process.env.SHIP_AI || \"Claude Opus 5.5\""));
});
T("失敗報告：可以直接貼進 issue（標題、時間、分支、停在哪、原因），原因最多 30 行", () => {
  const r = S.failReport({ message: Array.from({ length: 50 }, (_, i) => "行" + i).join("\n"), step: "等 PR 12 的 CI", branch: "claude/x", title: "週劇情 d2", when: new Date("2026-11-23T00:30:00Z") });
  assert.ok(r.includes("ship 失敗：週劇情 d2") && r.includes("2026-11-23 00:30（UTC）") && r.includes("claude/x") && r.includes("停在：等 PR 12 的 CI") && r.includes("行29") && !r.includes("行30"));
  assert.ok(S.failReport({ message: "x" }).includes("（沒給標題）"));
});

// ---- 5. 每日排程有沒有跑 ----
const base = { date: "2026-11-24", week: "2026-W48", weekday: 2, paused: false, onMain: false, openPrFiles: [], weekJsonOnMain: true };
T("排程檢查：dN.json 在 main 上就過、在開著的 PR 裡也過、都沒有才報；暫停中不檢查", () => {
  assert.ok(H.scheduleCheck(Object.assign({}, base, { onMain: true })).ok);
  assert.ok(H.scheduleCheck(Object.assign({}, base, { openPrFiles: ["content/weeks/2026-W48/d2.json"] })).ok);
  const r = H.scheduleCheck(base); assert.ok(!r.ok && r.reason.includes("d2.json") && r.reason.includes("可能沒跑起來"));
  assert.ok(!H.scheduleCheck(Object.assign({}, base, { openPrFiles: ["content/weeks/2026-W48/d3.json"] })).ok, "別天的檔不算");
  assert.ok(H.scheduleCheck(Object.assign({}, base, { paused: true })).skip);
});
T("排程檢查：週一還要看 week.json", () => {
  const mon = Object.assign({}, base, { date: "2026-11-23", weekday: 1, onMain: true, weekJsonOnMain: false });
  assert.ok(!H.scheduleCheck(mon).ok && H.scheduleCheck(mon).reason.includes("week.json"));
  assert.ok(H.scheduleCheck(Object.assign({}, mon, { openPrFiles: ["content/weeks/2026-W48/week.json"] })).ok);
});
T("workflow 檔在、cron 是台灣 09:30（UTC 01:30）", () => {
  const f = require("fs").readFileSync(require("path").join(__dirname, "..", "..", ".github", "workflows", "schedule-health.yml"), "utf8");
  assert.ok(f.includes('cron: "30 1 * * *"') && f.includes("schedule_health.cjs --issue"));
});
console.log(fail ? `排程檢視：${fail} 項沒過` : `排程檢視：${pass} 項都過`); process.exit(fail ? 1 : 0);
