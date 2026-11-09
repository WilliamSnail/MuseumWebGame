// 給 AI 重複用的腳本：tools/ship.cjs、local_game.cjs、new_doc.cjs、edit_lib.cjs（只測規則，不會真的合併、開伺服器）
const assert = require("assert");
const { parseArgs, commitText, prBody, branchOk } = require("../tools/ship.cjs");
const { keepBoth, canAuto } = require("../tools/merge_main.cjs");
const { moveEventNow, rtdbPort } = require("../tools/local_game.cjs");
const { nextDecision, safeName, logText, decisionText } = require("../tools/new_doc.cjs");
const { editorOf } = require("../tools/edit_lib.cjs");

let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL " + name + "\n    " + (e.stack || e.message)); } };

T("ship：選項看得懂；打錯就停，不會默默照做", () => {
  const o = parseArgs(["--title", "標題", "--body", "內容", "--no-merge"]);
  assert.strictEqual(o.title, "標題");
  assert.ok(o.flags.has("no-merge") && !o.flags.has("skip-local"));
  assert.throws(() => parseArgs(["--tilte", "x"]), /沒有/);
  assert.throws(() => parseArgs(["--title"]), /後面/);
  assert.throws(() => parseArgs(["亂打"]), /看不懂/);
});
T("ship：main 不能直接動；空的分支名也不行", () => {
  assert.ok(branchOk("claude/主題"));
  for (const b of ["main", "master", "", null]) assert.ok(!branchOk(b), String(b));
});
T("ship：commit 和 PR 的署名", () => {
  const c = commitText("改了東西\n");
  assert.ok(c.startsWith("改了東西\n\n"));
  assert.ok(c.includes("Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>") && c.includes("AI: Claude Opus 5.5（Claude Code）"));
  const b = prBody("內容");
  assert.ok(b.trim().endsWith("https://claude.com/claude-code)"));
  assert.strictEqual(prBody(b).split("Generated with").length, 2, "不會多壹行");
});
T("merge：公告兩邊都留，開頭的 { 補回去；其他的只留內容；不認得的檔不自動解", () => {
  const c = "頭\n  {\n<<<<<<< HEAD\n    id: 1,\n  },\n=======\n    id: 2,\n  },\n>>>>>>> origin/main\n];\n";
  assert.strictEqual(keepBoth(c, "notice"), "頭\n  {\n    id: 1,\n  },\n  {\n    id: 2,\n  },\n];\n");
  assert.strictEqual(keepBoth("<<<<<<< a\nA\n=======\nB\n>>>>>>> b\n"), "A\nB\n");
  assert.ok(canAuto("shared/notices.js") && canAuto("維護日誌/README.md"));
  assert.ok(!canAuto("shared/logic.js"));
});
T("local：活動移到 90 秒後、開壹小時，時間是台灣時間；別場不動；找不到回 null", () => {
  const w = { events: [{ id: "a", date: "2026-11-11", from: "20:00", to: "22:00" }, { id: "b", date: "2026-11-14", from: "20:00", to: "22:00" }] };
  const n = moveEventNow(w, "a", Date.parse("2026-11-09T07:50:00Z")); // 台灣 15:50
  assert.deepStrictEqual([n.events[0].date, n.events[0].from, n.events[0].to], ["2026-11-09", "15:51", "16:51"]);
  assert.deepStrictEqual(n.events[1], w.events[1]);
  assert.strictEqual(w.events[0].from, "20:00", "原本的物件不動");
  assert.strictEqual(moveEventNow(w, "c", 0), null);
  assert.strictEqual(moveEventNow({}, "a", 0), null);
  assert.strictEqual(rtdbPort(8), 17100);
});
T("doc：決定的下一個號碼；檔名不會有不能用的字", () => {
  assert.strictEqual(nextDecision(["0044-趣味節日.md", "0009-x.md", "README.md"]), "0045");
  assert.strictEqual(nextDecision([]), "0001");
  assert.strictEqual(safeName("活動 開跑/通知?"), "活動開跑通知");
});
T("doc：日誌的格式過得了 log_check 要的欄位；類型亂寫就停", () => {
  const t = logText({ topic: "主題", type: "修正", scope: ["a.js"], why: ["原話"], related: [] }, "2026-11-09 16:00:00", "2026.11.08-1");
  for (const k of ["日期: 2026-11-09 16:00:00", "作者: 翊文", "AI: ", "類型: 修正", "範圍: [a.js]", "PR: 無", "版本: 2026.11.08-1", "測試: ", "狀態: 待合併", "相關: []", "## 為什麼要改", "> 「原話」", "## 改了什麼", "## 怎麼確認的", "## 還沒做、要注意", "## 給下一個人"]) assert.ok(t.includes(k), k);
  assert.throws(() => logText({ topic: "x", type: "亂寫" }, "", ""), /類型/);
  assert.throws(() => logText({ type: "修正" }, "", ""), /topic/);
});
T("doc：決定的格式", () => {
  const t = decisionText({ title: "標題", why: ["原話"], body: "## 決定\n\n1. 這樣" }, "0045", "2026-11-09 16:00:00");
  assert.ok(t.startsWith("# 0045 標題\n") && t.includes("- 日期：2026-11-09 16:00:00") && t.includes("> 「原話」") && t.includes("## 決定"));
  assert.throws(() => decisionText({ title: "x" }, "0001", ""), /body/);
});
T("edit：找不到、不只一處都會丟錯；字裡的 $ 不會被吃掉", () => {
  const e = editorOf("甲 乙 甲");
  assert.throws(() => e.edit("甲", "丙"), /2 處/);
  assert.throws(() => e.edit("丁", "丙"), /0 處/);
  assert.strictEqual(editorOf("價錢 X").edit("X", "$$1").text(), "價錢 $$1");
  assert.strictEqual(editorOf("價錢 X").re(/X/, () => "$$1").text(), "價錢 $$1");
  assert.throws(() => editorOf("x").re(/y/, () => ""), /比對不到/);
  assert.strictEqual(editorOf("頭A中B尾").cut("A", "B").text(), "頭B尾");
  assert.throws(() => editorOf("x").cut("A", "B"), /cut/);
  assert.strictEqual(editorOf("a").append("b").text(), "ab");
});

console.log(`${pass} passed, ${fail} failed（重複用的腳本）`);
process.exit(fail ? 1 : 0);
