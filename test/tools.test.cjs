// 給 AI 重複用的腳本：tools/ship.cjs、local_game.cjs、new_doc.cjs、edit_lib.cjs（只測規則，不會真的合併、開伺服器）
const assert = require("assert");
const { parseArgs, commitText, prBody, branchOk, noChecksYet, titleOk } = require("../tools/ship.cjs");
const wf = require("../tools/wf_run.cjs");
const emuDoc = require("../tools/emu_doc.cjs");
const wt = require("../tools/new_worktree.cjs");
const { keepBoth, canAuto } = require("../tools/merge_main.cjs");
const { moveEventNow, rtdbPort, fnPort } = require("../tools/local_game.cjs");
const { nextDecision, safeName, logText, decisionText } = require("../tools/new_doc.cjs");
const { editorOf } = require("../tools/edit_lib.cjs");
const { parsePlan, planResult } = require("../tools/apply_edits.cjs");
const { collectSvgs } = require("../tools/svg_preview.cjs");
const { parseSizes, localOnly, shotName } = require("../tools/shot.cjs");

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
  // 真的公告的樣子：共同的收尾（段落的 ]],、sections 的 ],、這則的 },）壹部分或全部在衝突外面（11-13 兩次掉了 "      ]],"）
  const one = id => `    id: "${id}", sections: [\n      ["段", [\n        "句（有 ] 和 } 也不算）",\n`;
  const full = "      ]],\n    ],\n  },\n";
  for (const tail of [full, "    ],\n  },\n", "  },\n", ""]) {
    const inner = full.slice(0, full.length - tail.length);
    const cc = `const N = [\n  {\n<<<<<<< HEAD\n${one("a")}${inner}=======\n${one("b")}${inner}>>>>>>> origin/main\n${tail}];\n`;
    const out = keepBoth(cc, "notice");
    const N = new Function(out.replace("const N =", "return"))();
    assert.deepStrictEqual(N.map(x => x.id), ["a", "b"], "合完要是能跑的 JS：外面留 " + JSON.stringify(tail));
  }
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
  assert.deepStrictEqual([fnPort(4), fnPort(5)], [9101, 10101], "跟 tools/emulators.cjs 壹樣");
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

T("ship：標題太短擋下來（--title x 會變成推不回來的 commit 訊息）", () => {
  assert.ok(titleOk("排行榜每天更新"));
  for (const t of ["x", "", null, "  ab  "]) assert.ok(!titleOk(t), String(t));
});
T("wf：參數看得懂，打錯就停；只認新的那一次（舊的不能當成功）", () => {
  const o = wf.parseArgs(["discord-announce.yml", "-f", "a=1=2", "--file", "message=文.txt", "--ref", "b", "--grep", "x"], () => " 多行\n文字 \n");
  assert.deepStrictEqual(o, { workflow: "discord-announce.yml", ref: "b", grep: "x", inputs: { a: "1=2", message: "多行\n文字" } });
  assert.strictEqual(wf.parseArgs(["a.yml"]).ref, "main");
  assert.throws(() => wf.parseArgs([]), /檔名/);
  assert.throws(() => wf.parseArgs(["a.yml", "-f", "沒有等號"]), /名字=內容/);
  assert.throws(() => wf.parseArgs(["a.yml", "--打錯"]), /沒有/);
  assert.throws(() => wf.parseArgs(["a.yml", "b.yml"]), /看不懂/);
  assert.strictEqual(wf.newRunId(["111"], "111"), null, "還是舊的那次");
  assert.strictEqual(wf.newRunId([""], "111"), null);
  assert.strictEqual(wf.newRunId(["222"], "111"), "222");
  assert.strictEqual(wf.logBody("log\t步驟\t2026-11-09T01:02:03Z 公告發了。"), "公告發了。");
});
T("emu:doc：連接埠跟模擬器一樣；巢狀欄位；值會轉型；寫錯就停", () => {
  assert.deepStrictEqual([3, 4, 6].map(emuDoc.firestorePort), [11180, 12180, 14180]);
  assert.deepStrictEqual(emuDoc.setPath({ ec: { n: 3, wins: 1 } }, "ec.n", 0), { ec: { n: 0, wins: 1 } });
  assert.deepStrictEqual(emuDoc.setPath({}, "a.b", 1), { a: { b: 1 } });
  assert.deepStrictEqual(emuDoc.pairs(["bankroll=-500000", "on=true", "nick=小明"]), [["bankroll", -500000], ["on", true], ["nick", "小明"]]);
  assert.throws(() => emuDoc.pairs([]), /欄位=值/);
  assert.throws(() => emuDoc.pairs(["沒有等號"]), /欄位=值/);
  for (const v of [1, 1.5, true, "字", null]) assert.strictEqual(emuDoc.fromFs(emuDoc.toFs(v)), v);
});
T("wt：分支要 claude/ 開頭；缺東西就停", () => {
  assert.deepStrictEqual(wt.parseArgs(["--dir", "d", "--branch", "claude/主題"]), { dir: "d", branch: "claude/主題", remove: false });
  assert.strictEqual(wt.parseArgs(["--dir", "d", "--remove"]).remove, true);
  for (const b of ["main", "claude/", "claude/有 空白"]) assert.throws(() => wt.parseArgs(["--dir", "d", "--branch", b]), /claude/);
  assert.throws(() => wt.parseArgs(["--branch", "claude/x"]), /--dir/);
  assert.throws(() => wt.parseArgs(["--dir", "d", "亂打"]), /看不懂/);
});

T("svg：找得到壹天、整週裡每幅 svg，標出在哪、叫什麼", () => {
  const fs = require("fs"), os = require("os"), path = require("path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "svgtest-"));
  fs.writeFileSync(path.join(dir, "d1.json"), JSON.stringify({ show: { works: [{ id: "a", title: "甲", svg: ["<svg viewBox='0 0 1 1'>", "</svg>"] }, { id: "b", art: "frog" }] } }));
  fs.writeFileSync(path.join(dir, "d2.json"), JSON.stringify({ books: [{ title: "乙", svg: "<svg></svg>" }] }));
  fs.writeFileSync(path.join(dir, "week.json"), JSON.stringify({ svg: "<svg></svg>" }));
  const all = collectSvgs([dir]);
  assert.strictEqual(all.map(x => x.title).join(), "甲,乙", "只看 dN.json，按天排");
  assert.strictEqual(all[0].svg, "<svg viewBox='0 0 1 1'></svg>", "陣列接起來");
  assert.ok(all[0].where.includes("d1.json") && all[0].where.includes("works[0]"));
  assert.strictEqual(collectSvgs([path.join(dir, "d2.json")]).length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});
T("shot：大小看得懂、只准 localhost、檔名帶畫面和大小", () => {
  assert.deepStrictEqual(parseSizes("812x375, 375x812"), [{ w: 812, h: 375 }, { w: 375, h: 812 }]);
  assert.strictEqual(parseSizes().length, 2, "沒給就照電腦和手機橫拿");
  assert.throws(() => parseSizes("big"), /寬x高/);
  assert.throws(() => localOnly("https://pepe-museum.web.app/"), /localhost/);
  assert.ok(localOnly("http://localhost:5287/#lobby").includes("#lobby"));
  assert.strictEqual(shotName("http://localhost:5287/#office:upgrades", { w: 812, h: 375 }), "shot_office_upgrades_812x375.png");
});
// 11-14：ship 的 --say、--after-deploy、公告警告、日誌當說明；npm run say、npm run notice
const SH = require("../tools/ship.cjs"), SAY = require("../tools/say.cjs"), NO = require("../tools/notice.cjs");
T("ship：新選項 --say、--after-deploy、--no-notice", () => {
  const o = SH.parseArgs(["--title", "標題標題", "--say", "🎲 上線", "--after-deploy", "gh workflow run x.yml", "--no-notice"]);
  assert.strictEqual(o.say, "🎲 上線"); assert.strictEqual(o["after-deploy"], "gh workflow run x.yml"); assert.ok(o.flags.has("no-notice"));
});
T("ship：沒給說明就拿維護日誌的兩段", () => {
  const md = "---\n日期: x\n---\n\n## 為什麼要改\n\n> 「這個」\n\n## 改了什麼\n\n- 甲\n- 乙\n\n## 怎麼確認的\n\n- 跑過\n";
  assert.strictEqual(SH.bodyFromLog(md), "> 「這個」\n\n- 甲\n- 乙");
  assert.strictEqual(SH.bodyFromLog("沒有段落"), "");
});
T("ship：改了玩家看得到的檔卻沒公告會警告；有公告、只改 tools 不警告", () => {
  assert.ok(/沒有加館方公告/.test(SH.noticeWarning(["web/src/ui_bank.js", "維護日誌/2026/x.md"])));
  assert.strictEqual(SH.noticeWarning(["web/src/ui_bank.js", "shared/notices.js"]), "");
  assert.strictEqual(SH.noticeWarning(["tools/say.cjs", "docs/未來更新.md", "test/x.test.cjs"]), "");
});
T("say：空的、太長、@ 人都擋下來", () => {
  assert.strictEqual(SAY.checkText("  🎲 好  "), "🎲 好");
  assert.throws(() => SAY.checkText(""), /沒有/);
  assert.throws(() => SAY.checkText("x".repeat(2000)), /太長/);
  assert.throws(() => SAY.checkText("大家 @everyone"), /@/);
  assert.throws(() => SAY.checkText("<@123456>"), /@/);
});
T("notice：組出公告、area 要對、id 不重複、預設日期", () => {
  const env = { areas: ["賭場", "其他"], cats: ["館方公告", "特展活動"], today: "2026-11-14", existingIds: ["dup-id"] };
  const n = NO.build(NO.parse(["--area", "賭場", "--title", "賭場的新東西", "第壹句", "第二句"]), env);
  assert.strictEqual(n.publish, "2026-11-14"); assert.strictEqual(n.expire, "2027-12-31"); assert.strictEqual(n.importance, "low");
  assert.deepStrictEqual(n.sections, [["改了什麼", ["第壹句", "第二句"]]]);
  assert.ok(/^upd-2026-11-14-[0-9a-f]{6}$/.test(n.id));
  assert.throws(() => NO.build(NO.parse(["--area", "亂寫", "--title", "賭場的新東西", "x"]), env), /area/);
  assert.throws(() => NO.build(NO.parse(["--area", "賭場", "--title", "賭場的新東西", "--id", "dup-id", "x"]), env), /已經有了/);
  assert.throws(() => NO.build(NO.parse(["--area", "賭場", "--title", "賭場的新東西"]), env), /至少/);
  const src = "export const NOTICES = [\n  {\n    id: \"old\",\n  },\n];\n";
  const out = NO.insert(src, NO.render(n));
  assert.ok(out.indexOf(n.id) < out.indexOf("\"old\""));
  // 寫出來的那段要是合法的 JS 物件
  const obj = Function(`return ${NO.render(n).trim().replace(/,$/, "")}`)();
  assert.strictEqual(obj.area, "賭場"); assert.strictEqual(obj.sections[0][1][1], "第二句");
});
console.log(`${pass} passed, ${fail} failed（重複用的腳本）`);
process.exit(fail ? 1 : 0);
