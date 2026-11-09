// tools/announce.cjs：預約公告、今日館訊八點半、活動開跑：時間換算、該發哪幾則、不重發、工作流程對得上（不會真的連 Discord）
const assert = require("assert");
const fs = require("fs"), path = require("path");
const { parseAt, parseSchedule, cronOf, scheduleBlock, syncWorkflow, duePosts, runDue, dayEntry, eventEntry, autoEntries, eventSlotOk, deployBroken, RETRY_MIN, WINDOW_MIN, DAY_POST_FROM, EVENT_EARLY_MIN, EVENT_SLOTS, FIXED_CRONS } = require("../tools/announce.cjs");
const { shared } = require("../tools/discord_post.cjs");

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
T("工作流程：每則到點一次、晚 20 分鐘補一次；沒有預約公告也有固定的時間", () => {
  const block = scheduleBlock(parse([one("a", "2026-11-10 12:50")]));
  assert.ok(block.includes('- cron: "50 4 10 11 *"'));
  assert.ok(block.includes('- cron: "10 5 10 11 *"'), "補的那次跨小時");
  const fixed = scheduleBlock([]);
  assert.ok(fixed.includes("schedule:"));
  FIXED_CRONS.forEach(([c]) => assert.ok(fixed.includes(`- cron: "${c}"`), c));
});
// 台灣時間的 "HH:MM"（固定的 cron 是 UTC）
const tw = cron => { const [m, h] = cron.split(" ").map(Number); return `${String((h + 8) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`; };
T("固定的時間換回台灣時間是對的：今日館訊八點半左右；活動開始前幾分鐘跑、開始後補一次；週末那場只有週末", () => {
  const times = FIXED_CRONS.map(([c]) => tw(c));
  assert.deepStrictEqual(times, ["08:27", "08:47", "19:53", "20:13", "13:53", "14:13"]);
  assert.deepStrictEqual(EVENT_SLOTS.map(s => s.from), ["20:00", "14:00"]);
  assert.ok(FIXED_CRONS.slice(4).every(([c]) => c.endsWith("* * 0,6")), "週六、週日（UTC 也是同一天）");
  const before = parseAt("2026-11-11 20:00") - EVENT_EARLY_MIN * MIN, run = parseAt("2026-11-11 19:53");
  assert.ok(run >= before, "19:53 跑的時候要已經可以發");
});
const addDays = (...x) => shared().addDays(...x);
T("今日館訊：08:25 以前不發；當天都可以補；隔天 05:00 換日就不發，也不算漏發", () => {
  const e = [dayEntry("2026-W46", 2, "2026-11-10", addDays)];
  assert.strictEqual(duePosts(e, [], ms("2026-11-10 08:24")).due.length, 0);
  assert.strictEqual(duePosts(e, [], ms("2026-11-10 08:25")).due.length, 1);
  assert.strictEqual(duePosts(e, [], ms("2026-11-10 23:30")).due.length, 1, "當天很晚才合併的");
  assert.strictEqual(duePosts(e, [], ms("2026-11-11 05:00")).due.length, 1, "最後一刻");
  const after = duePosts(e, [], ms("2026-11-11 05:01"));
  assert.strictEqual(after.due.length + after.late.length, 0);
  assert.strictEqual(duePosts(e, [e[0].id], ms("2026-11-10 08:47")).due.length, 0, "補的那次不重發");
});
const oneEv = (date, from, to) => shared().cleanEvents([{ id: "x", kind: "coopBoost", date, from, to, title: "加班夜", words: "字" }], "2026-11-09", "2026-W46")[0];
T("活動開跑：開始前 10 分鐘起可以發；活動結束就不發，也不算漏發", () => {
  const e = [eventEntry(oneEv("2026-11-11", "20:00", "22:00"))];
  assert.strictEqual(e[0].id, "event-2026-W46/x");
  assert.strictEqual(duePosts(e, [], ms("2026-11-11 19:49")).due.length, 0);
  assert.strictEqual(duePosts(e, [], ms("2026-11-11 19:50")).due.length, 1);
  assert.strictEqual(duePosts(e, [], ms("2026-11-11 21:59")).due.length, 1);
  const after = duePosts(e, [], ms("2026-11-11 22:01"));
  assert.strictEqual(after.due.length + after.late.length, 0);
});
T("自動的訊息直接用（入館連結不會多壹個）；發成功才記下來", async () => {
  const e = eventEntry(oneEv("2026-11-11", "20:00", "22:00")), sent = [];
  const r = await runDue([e], [], ms("2026-11-11 20:03"), async m => { sent.push(m); return true; });
  assert.deepStrictEqual(r.posted, [e.id]);
  assert.strictEqual(sent[0].split("pepe-museum.web.app").length, 2);
});
T("讀真的週：改版之前發過的今日館訊不會重發；排好的活動都在", () => {
  const ids = autoEntries().map(x => x.id);
  assert.ok(!ids.includes("day-2026-W46-d1"), "11-09 那天部署時發過了");
  assert.ok(DAY_POST_FROM > "2026-11-09");
  assert.ok(ids.includes("event-2026-W46/double11"));
  assert.ok(ids.includes("event-2026-W46/winter-trial"));
});
T("活動的時間開得到開跑公告嗎：平日 20:00，週末 14:00、20:00", () => {
  assert.ok(eventSlotOk("2026-11-11", "20:00"), "週三");
  assert.ok(!eventSlotOk("2026-11-11", "14:00"), "週三下午沒有檢查");
  assert.ok(eventSlotOk("2026-11-14", "14:00"), "週六");
  assert.ok(eventSlotOk("2026-11-15", "14:00"), "週日");
  assert.ok(!eventSlotOk("2026-11-14", "21:00"));
});
T("部署壞了才不發今日館訊：還在跑、讀不到都照發", () => {
  for (const ok of ["completed/success", "in_progress/", "queued/", "", null, undefined]) assert.strictEqual(deployBroken(ok), false, String(ok));
  for (const bad of ["completed/failure", "completed/cancelled", "completed/timed_out"]) assert.strictEqual(deployBroken(bad), true, bad);
});
T("部署完不直接發：沒發的才叫預約公告那支（同一個人發，才不會重複）", () => {
  const d = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "deploy.yml"), "utf8");
  assert.ok(!d.includes("discord_post.cjs"));
  assert.ok(d.includes("tools/announce.cjs --any-due") && d.includes("gh workflow run discord-scheduled.yml"));
  assert.ok(/actions: write/.test(d));
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
  assert.ok(/permissions:\n  contents: read\n  actions: read/.test(y));
  assert.ok(y.includes("DEPLOY_STATE"), "部署壞了不發今日館訊");
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
