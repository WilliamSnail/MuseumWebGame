// tools/announce.cjs：預約公告的時間換算、該發哪幾則、不重發、工作流程對得上（不會真的連 Discord）
const assert = require("assert");
const fs = require("fs"), path = require("path");
const { parseAt, parseSchedule, cronOf, scheduleBlock, syncWorkflow, duePosts, runDue, RETRY_MIN, WINDOW_MIN } = require("../tools/announce.cjs");

let pass = 0, fail = 0;
const tests = [];
const T = (name, fn) => tests.push([name, fn]);
const MIN = 60000;
const one = (id, at, lines = ["字"]) => ({ id, at, lines });
const parse = list => parseSchedule({ "公告": list });
const ms = at => parseAt(at);

T("台灣時間換成 UTC 的 cron，跨日、跨年都對", () => {
  assert.strictEqual(cronOf(ms("2026-11-10 12:00")), "0 4 10 11 *");
  assert.strictEqual(cronOf(ms("2026-11-10 05:15")), "15 21 9 11 *");
  assert.strictEqual(cronOf(ms("2027-01-01 03:05")), "5 19 31 12 *");
});
T("不是真的日期、格式不對都擋", () => {
  for (const bad of ["2026-13-01 10:00", "2026-02-30 10:00", "2026-11-10 24:00", "2026-11-10 12:60", "明天中午", "2026-11-10", "2026-11-10T12:00", "", null]) {
    assert.strictEqual(parseAt(bad), null, String(bad));
  }
  assert.ok(parseAt("2028-02-29 00:00"), "閏年的 2/29 是真的");
});
T("排程檔寫錯，一讀就丟錯（不要等到時間才發現）", () => {
  assert.throws(() => parseSchedule({}), /陣列/);
  assert.throws(() => parse([one("a b", "2026-11-10 12:00")]), /id/);
  assert.throws(() => parse([one("a", "2026-11-10 12:00"), one("a", "2026-11-11 12:00")]), /重複/);
  assert.throws(() => parse([one("a", "明天")]), /時間/);
  assert.throws(() => parse([one("a", "2026-11-10 12:00", ["  "])]), /沒有文字/);
  assert.throws(() => parse([{ id: "a", at: "2026-11-10 12:00", lines: "字" }]), /lines/);
  assert.throws(() => parse([one("a", "2026-11-10 12:00", ["字".repeat(2000)])]), /太長/);
});
T("照時間排；lines 用換行接起來；中文 id 可以", () => {
  const e = parse([one("晚", "2026-11-11 12:00"), one("早", "2026-11-10 12:00", ["一行", "二行"])]);
  assert.deepStrictEqual(e.map(x => x.id), ["早", "晚"]);
  assert.strictEqual(e[0].text, "一行\n二行");
});
T("到時間才發；還在時限內補發；過了時限不發；發過不再發；明年同一天不會再發", () => {
  const e = parse([one("a", "2026-11-10 12:00")]), at = e[0].atMs;
  assert.strictEqual(duePosts(e, [], at - MIN).due.length, 0, "還沒到");
  assert.strictEqual(duePosts(e, [], at).due.length, 1, "剛好到");
  assert.strictEqual(duePosts(e, [], at + RETRY_MIN * MIN).due.length, 1, "補的那次");
  assert.strictEqual(duePosts(e, ["a"], at + RETRY_MIN * MIN).due.length, 0, "發過了");
  assert.strictEqual(duePosts(e, [], at + WINDOW_MIN * MIN).due.length, 1, "時限的最後一刻");
  const late = duePosts(e, [], at + (WINDOW_MIN + 1) * MIN);
  assert.strictEqual(late.due.length, 0);
  assert.strictEqual(late.late.length, 1);
  assert.strictEqual(duePosts(e, [], at + 365 * 24 * 60 * MIN).due.length, 0, "cron 沒有年，明年會再跑");
});
T("發的時候最後面有入館連結；發成功才記下來", async () => {
  const e = parse([one("a", "2026-11-10 12:00", ["公告內容"])]), sent = [];
  const r = await runDue(e, [], e[0].atMs, async m => { sent.push(m); return true; });
  assert.deepStrictEqual(r.posted, ["a"]);
  assert.strictEqual(r.sent, 1);
  assert.ok(sent[0].startsWith("公告內容\n\n"));
  assert.ok(sent[0].includes("pepe-museum.web.app"));
});
T("一則失敗不影響別則，失敗的不記下來（補的那次會再試）；沒放金鑰也不算發過", async () => {
  const e = parse([one("a", "2026-11-10 12:00"), one("b", "2026-11-10 12:01")]);
  const r = await runDue(e, [], e[1].atMs, async m => { if (r0.n++ === 0) throw new Error("Discord 回 500"); return true; });
  assert.deepStrictEqual(r.posted, ["b"]);
  assert.deepStrictEqual(r.failed, ["a"]);
  const noKey = await runDue(e, [], e[1].atMs, async () => false);
  assert.deepStrictEqual(noKey.posted, []);
  assert.deepStrictEqual(noKey.failed, ["a", "b"]);
});
const r0 = { n: 0 };
T("工作流程：每則到點一次、晚 20 分鐘補一次；沒有公告就不定時", () => {
  const block = scheduleBlock(parse([one("a", "2026-11-10 12:50")]));
  assert.ok(block.includes('- cron: "50 4 10 11 *"'));
  assert.ok(block.includes('- cron: "10 5 10 11 *"'), "補的那次跨小時");
  assert.ok(!scheduleBlock([]).includes("schedule:"));
});
const ymlPath = path.join(__dirname, "..", ".github", "workflows", "discord-scheduled.yml");
T("改工作流程只動記號中間，來回不會變；手動按的入口還在", () => {
  const yml = fs.readFileSync(ymlPath, "utf8");
  const e = parse([one("a", "2026-11-10 12:00")]);
  const on = syncWorkflow(yml, e);
  assert.ok(on.includes("schedule:") && on.includes("workflow_dispatch:"));
  assert.strictEqual(syncWorkflow(on, e), on);
  assert.strictEqual(syncWorkflow(on, parseSchedule(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "content", "公告排程.json"), "utf8")))), yml, "拿掉之後跟現在的一樣");
});
T("工作流程跟 content/公告排程.json 對得上（對不上：npm run announce:sync）", () => {
  const yml = fs.readFileSync(ymlPath, "utf8");
  const e = parseSchedule(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "content", "公告排程.json"), "utf8")));
  assert.strictEqual(syncWorkflow(yml, e), yml);
});
T("工作流程只有讀的權限、一次只跑一個、金鑰放 Secrets", () => {
  const y = fs.readFileSync(ymlPath, "utf8");
  assert.ok(/permissions:\n  contents: read/.test(y));
  assert.ok(/concurrency:/.test(y));
  assert.ok(y.includes("secrets.DISCORD_BOT_TOKEN") && !/\$\{\{\s*(github\.event\.)?inputs\./.test(y));
  assert.ok(!/\*\/\d+ \* \* \* \*/.test(y), "不要定時一直檢查：會用光私有 repo 的免費額度");
});

(async () => {
  const log = console.log, err = console.error;
  for (const [name, fn] of tests) {
    console.log = console.error = () => {}; // 工具自己印的不要混進測試結果
    try { await fn(); pass++; } catch (e) { fail++; console.log = log; log("FAIL " + name + "\n    " + (e.stack || e.message)); }
    console.log = log; console.error = err;
  }
  console.log(`${pass} passed, ${fail} failed（預約公告）`);
  process.exit(fail ? 1 : 0);
})();
