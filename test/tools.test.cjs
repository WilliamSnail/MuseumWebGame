// 給 AI 重複用的腳本：tools/ship.cjs、local_game.cjs、new_doc.cjs、edit_lib.cjs（只測規則，不會真的合併、開伺服器）
const assert = require("assert");
const { parseArgs, commitText, prBody, branchOk, noChecksYet } = require("../tools/ship.cjs");
const { keepBoth, canAuto } = require("../tools/merge_main.cjs");
const { moveEventNow, rtdbPort } = require("../tools/local_game.cjs");
const { nextDecision, safeName, logText, decisionText } = require("../tools/new_doc.cjs");
const { editorOf } = require("../tools/edit_lib.cjs");
const { parsePlan, planResult } = require("../tools/apply_edits.cjs");

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
T("ship：CI 還沒登記要等，不算失敗；真的失敗不會被當成沒登記", () => {
  assert.ok(noChecksYet("no checks reported on the 'claude/x' branch"));
  assert.ok(!noChecksYet("test\tfail\t1m"));
  assert.ok(!noChecksYet(""));
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
  const c2 = "  {\n<<<<<<< HEAD\n    id: 1,\n      ]],\n=======\n    id: 2,\n      ]],\n>>>>>>> origin/main\n    ],\n  },\n];\n";
  assert.strictEqual(keepBoth(c2, "notice"), "  {\n    id: 1,\n      ]],\n    ],\n  },\n  {\n    id: 2,\n      ]],\n    ],\n  },\n];\n", "共同的收尾留在衝突外面");
  const l = '<<<<<<< a\nconst O = ["x.js", "new1.js", "z.js"];\n=======\nconst O = ["x.js", "z.js", "new2.js"];\n>>>>>>> b\n';
  assert.strictEqual(keepBoth(l, "list"), 'const O = ["x.js", "new1.js", "z.js", "new2.js"];\n');
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

// ---------- discord_commands.cjs / discord_fake.cjs（決定 0051） ----------
T("discord_commands：沒金鑰要說缺哪個、不能連線；ID 不是數字也擋；請求的網址和內容對", () => {
  const { request } = require("../tools/discord_commands.cjs");
  assert.throws(() => request({}), /DISCORD_BOT_TOKEN.*DISCORD_APPLICATION_ID.*DISCORD_GUILD_ID/);
  assert.throws(() => request({ DISCORD_BOT_TOKEN: "t", DISCORD_APPLICATION_ID: "abc", DISCORD_GUILD_ID: "123456" }), /數字/);
  const r = request({ DISCORD_BOT_TOKEN: "secret-token", DISCORD_APPLICATION_ID: "111111", DISCORD_GUILD_ID: "222222" });
  assert.strictEqual(r.url, "https://discord.com/api/v10/applications/111111/guilds/222222/commands");
  assert.strictEqual(r.headers.Authorization, "Bot secret-token");
  const body = JSON.parse(r.body);
  assert.ok(body.length >= 8 && body.every(c => /^pepe-/.test(c.name)));
});
T("discord_commands：錯誤訊息裡的 token 會遮掉", () => {
  const { redact } = require("../tools/discord_commands.cjs");
  assert.ok(!redact("bad Bot secret-token here").includes("secret-token"));
  assert.strictEqual(redact("沒有 token"), "沒有 token");
});


T("apply_edits：反引號、$、引號、反斜線都逐字；少標記會丟錯", () => {
  const nasty = "`a${b}` \"c\" 'd' \\n $& $1";
  const steps = parsePlan(`@@@ 檔案 a.md\n@@@ 舊\n舊\n字\n@@@ 新\n${nasty}\n@@@ 完\n@@@ 檔案 b.md\n@@@ 整檔\n${nasty}\n@@@ 完\n`);
  const r = planResult(steps, () => "頭\n舊\n字\n尾");
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(r.files["a.md"], `頭\n${nasty}\n尾`);
  assert.strictEqual(r.files["b.md"], nasty + "\n");
  assert.throws(() => parsePlan("@@@ 舊\nx\n@@@ 新\ny\n@@@ 完\n"), /檔案/);
  assert.throws(() => parsePlan("@@@ 檔案 a\n@@@ 舊\nx\n@@@ 完\n"), /缺/);
  assert.throws(() => parsePlan("@@@ 檔案 a\n@@@ 舊\nx\n@@@ 新\ny\n"), /還沒有/);
  assert.throws(() => parsePlan(""), /沒有要改/);
});
T("apply_edits：找不到、不只壹處、沒有檔都回報；Windows 換行也比得到；同壹檔可以連改", () => {
  const steps = o => parsePlan(`@@@ 檔案 a\n@@@ 舊\n${o}\n@@@ 新\n丙\n@@@ 完\n`);
  assert.match(planResult(steps("丁"), () => "甲 乙").errors[0], /0 處/);
  assert.match(planResult(steps("甲"), () => "甲 甲").errors[0], /2 處/);
  assert.match(planResult(steps("甲"), () => null).errors[0], /沒有這個檔/);
  assert.strictEqual(planResult(steps("甲\n乙"), () => "頭\r\n甲\r\n乙\r\n尾").files.a, "頭\r\n丙\r\n尾");
  const two = parsePlan("@@@ 檔案 a\n@@@ 舊\n甲\n@@@ 新\n乙\n@@@ 完\n@@@ 舊\n乙\n@@@ 新\n丙\n@@@ 完\n");
  assert.strictEqual(planResult(two, () => "甲").files.a, "丙");
});

console.log(`${pass} passed, ${fail} failed（重複用的腳本）`);
process.exit(fail ? 1 : 0);
