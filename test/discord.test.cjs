// tools/discord_post.cjs：只發新的一天、訊息的樣子、不會 @ 人、沒放金鑰就跳過（不會真的連 Discord）
const assert = require("assert");
const { newDays, dayMessage, send, MAX } = require("../tools/discord_post.cjs");

let pass = 0, fail = 0;
const tests = [];
const T = (name, fn) => tests.push([name, fn]);

const w = { title: "換季的失物招領", summary: ["立冬剛過。", "多了壹個招領箱。"] };

T("只認這週的 dN.json；備用週、week.json、靈感來源不算", () => {
  const out = newDays(["content/weeks/2026-W46/d3.json", "content/weeks/2026-W46/week.json", "content/weeks/2026-W46/靈感來源.md", "content/weeks/備用/常青1/d1.json", "content/weeks/備用/一天/插曲1.json"]);
  assert.deepStrictEqual(out, [{ week: "2026-W46", n: 3 }]);
  assert.deepStrictEqual(newDays([]), []);
});
T("週一：標題、不劇透的大綱、今天那一行、網址", () => {
  const m = dayMessage(w, { board: "書架多了 2 本書。" }, 1, null);
  assert.ok(m.includes("本週特展公告")); assert.ok(m.includes("〈換季的失物招領〉")); assert.ok(m.includes("立冬剛過。")); assert.ok(m.includes("【今日館訊】書架多了 2 本書。")); assert.ok(m.includes("館長室 敬啟")); assert.ok(m.includes("pepe-museum.web.app"));
});
T("其他天：不重貼大綱", () => {
  const m = dayMessage(w, { board: "招領箱裡多了壹頂帽子。" }, 3, null);
  assert.ok(m.includes("今日館訊")); assert.ok(m.includes("第 3 日")); assert.ok(m.includes("招領箱裡多了壹頂帽子。")); assert.ok(!m.includes("立冬剛過。"));
  assert.ok(m.endsWith("入館：https://pepe-museum.web.app"), "每天最後面都有連結");
});
T("備用週真的內容：大綱有進訊息（欄位名字跟週包一樣）", () => {
  const fs = require("fs"), path = require("path");
  const dir = path.join(__dirname, "..", "content", "weeks", "備用", "常青1");
  const rw = JSON.parse(fs.readFileSync(path.join(dir, "week.json"), "utf8")), rd = JSON.parse(fs.readFileSync(path.join(dir, "d1.json"), "utf8"));
  const m = dayMessage(rw, rd, 1, null);
  assert.ok(rw.summary.length >= 2); rw.summary.forEach(l => assert.ok(m.includes(l), l)); assert.ok(m.includes(rd.board));
});
T("節日那天加節日的話", () => {
  const m = dayMessage(w, { board: "x" }, 2, { name: "中秋節", words: "大家排隊看月亮。" });
  assert.ok(m.includes("【本日節慶】中秋節。大家排隊看月亮。"));
});
const wev = Object.assign({ week: "2026-W46", start: "2026-11-09" }, w, { events: [
  { id: "double11", kind: "coopBoost", date: "2026-11-11", from: "20:00", to: "22:00", title: "雙 11 的招領箱加班夜", words: "邀館友壹起下去翻箱底。" },
  { id: "winter", kind: "trialBoost", date: "2026-11-14", from: "20:00", to: "22:00", title: "冬衣試煉夜", words: "壹個人、壹起都行。" },
  { id: "bad", kind: "nope", date: "2026-11-14", from: "20:00", to: "22:00", title: "壞的", words: "x" }] });
T("限時活動：週一的公告列出這週的活動（壞的不列）", () => {
  const m = dayMessage(wev, { board: "書架多了 2 本書。" }, 1, null);
  assert.ok(m.includes("【本週限時活動】"));
  assert.ok(m.includes("・11/11（三）20:00～22:00　雙 11 的招領箱加班夜：") && m.includes("靈感 ×1.5"));
  assert.ok(m.includes("・11/14（六）20:00～22:00　冬衣試煉夜：") && m.includes("技能成長 ×1.5"));
  assert.ok(!m.includes("壞的"));
  assert.ok(!m.includes("【今晚限時活動】"), "週一不是活動當天");
});
T("限時活動：活動當天的今日館訊多一段【今晚限時活動】；別天沒有", () => {
  const m = dayMessage(wev, { board: "招領箱裡多了壹頂帽子。" }, 3, null);
  assert.ok(m.includes("【今晚限時活動】20:00～22:00　雙 11 的招領箱加班夜"));
  assert.ok(m.includes("邀館友壹起下去翻箱底。") && m.includes("錯過了也不會少什麼"));
  assert.ok(!m.includes("冬衣試煉夜"));
  assert.ok(dayMessage(wev, { board: "x" }, 6, null).includes("【今晚限時活動】20:00～22:00　冬衣試煉夜"));
  assert.ok(!dayMessage(wev, { board: "x" }, 2, null).includes("限時活動"));
  assert.ok(!dayMessage(wev, { board: "x" }, 3, null).includes("【本週限時活動】"), "週三不重列整週");
});
T("限時活動：下午的活動寫「今天」；沒有 events 的舊週公告照舊", () => {
  const m = dayMessage(Object.assign({}, wev, { events: [{ id: "pm", kind: "trialBoost", date: "2026-11-14", from: "14:00", to: "16:00", title: "午後場", words: "壹起。" }] }), { board: "x" }, 6, null);
  assert.ok(m.includes("【今天限時活動】14:00～16:00　午後場"));
  assert.ok(!dayMessage(w, { board: "x" }, 1, null).includes("限時活動"));
  assert.ok(!dayMessage(Object.assign({}, wev, { events: undefined }), { board: "x" }, 3, null).includes("限時活動"));
});
T("限時活動：真的 W46 的內容公告出來有兩場", () => {
  const fs = require("fs"), path = require("path");
  const dir = path.join(__dirname, "..", "content", "weeks", "2026-W46");
  const rw = JSON.parse(fs.readFileSync(path.join(dir, "week.json"), "utf8")), rd = JSON.parse(fs.readFileSync(path.join(dir, "d1.json"), "utf8"));
  const m = dayMessage(rw, rd, 1, null);
  assert.ok(m.includes("11/11（三）20:00～22:00") && m.includes("11/14（六）20:00～22:00"), m);
  assert.ok(m.length <= MAX);
});
T("超過 Discord 的上限會截短", () => {
  const m = dayMessage({ title: "長", summary: ["字".repeat(5000)] }, { board: "x" }, 1, null);
  assert.ok(m.length <= MAX);
  assert.ok(m.endsWith("入館：https://pepe-museum.web.app"), "截短了連結還在最後面");
});
T("沒放金鑰：跳過，不連線", async () => {
  let called = false;
  const ok = await send("x", {}, async () => { called = true; return { ok: true }; });
  assert.strictEqual(ok, false); assert.strictEqual(called, false);
});
T("發的時候不會 @ 人、用 bot 的金鑰、發到對的頻道", async () => {
  let got = null;
  const ok = await send("@everyone 你好", { DISCORD_BOT_TOKEN: "t", DISCORD_CHANNEL_ID: "123" }, async (url, opt) => { got = { url, opt }; return { ok: true }; });
  assert.strictEqual(ok, true);
  assert.ok(got.url.endsWith("/channels/123/messages"));
  assert.strictEqual(got.opt.headers.Authorization, "Bot t");
  assert.deepStrictEqual(JSON.parse(got.opt.body).allowed_mentions, { parse: [] });
});
T("Discord 回錯誤：丟出錯誤，訊息裡沒有金鑰", async () => {
  await assert.rejects(send("x", { DISCORD_BOT_TOKEN: "祕密", DISCORD_CHANNEL_ID: "1" }, async () => ({ ok: false, status: 403, text: async () => "Missing Access" })), e => e.message.includes("403") && !e.message.includes("祕密"));
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); pass++; } catch (e) { fail++; console.log("FAIL " + name + "\n    " + e.message); }
  }
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
