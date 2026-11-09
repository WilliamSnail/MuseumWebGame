// Discord 聯動第一步的規則（shared/discord.js，決定 0051）：node test/discord_bot.test.cjs（npm test 也會跑）
// 解析 interaction、綁定碼、打錯擋、加入連結、公開的字沒有 email、指令清單。資料都是假的；不連網路、不連 Firebase。
// 簽名、交易、完整流程要用模擬器測：node tools/discord_fake.cjs（tools/README.md）
// （test/discord.test.cjs 是「公告發到 Discord」那支，另外一件事。）
const assert = require("assert");
const fs = require("fs"), path = require("path");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const J = x => JSON.parse(JSON.stringify(x));
const ROOT = path.join(__dirname, "..");
const MIN = 60000;

T("指令清單：全部 pepe- 開頭、小寫、名字和說明長度合 Discord 規定、沒有重複", G => {
  const list = J(G.dcCommands());
  assert.ok(list.length >= 8 && list.length <= 100);
  const names = new Set();
  for (const c of list) {
    assert.ok(/^pepe-/.test(c.name), c.name);
    assert.strictEqual(c.name, c.name.toLowerCase());
    assert.ok(/^[-_\p{L}\p{N}]{1,32}$/u.test(c.name), c.name);
    assert.ok(c.description.length >= 1 && c.description.length <= 100, c.description);
    assert.strictEqual(c.type, 1);
    names.add(c.name);
    for (const o of c.options || []) { assert.ok(/^[-_\p{L}\p{N}]{1,32}$/u.test(o.name)); assert.ok(o.description.length >= 1 && o.description.length <= 100); }
  }
  assert.strictEqual(names.size, list.length);
  for (const k of ["link", "unlink", "join", "chips", "house", "board", "today", "online", "news"]) assert.ok(names.has(G.DC_CMD[k]), k);
  const nw = J(G.dcCommands().find(c => c.name === G.DC_CMD.news));
  assert.deepStrictEqual(nw.options.map(o => [o.name, o.type, o.required, o.min_value, o.max_value]), [[G.DC_NEWS_OPT, 4, false, 1, G.NUM.discord.newsMax]]);
  assert.deepStrictEqual(J(G.dcCommands().find(c => c.name === G.DC_CMD.link).options.map(o => o.name)), [G.DC_LINK_OPT]);
});

T("dcParse：PING、指令、選項、成員和私訊的使用者、壞資料", G => {
  assert.strictEqual(G.dcParse({ type: 1 }).kind, "ping");
  const p = G.dcParse({ type: 2, guild_id: "123456789", token: "tk", member: { user: { id: "55555", username: "u", global_name: "顯示名" } }, data: { name: "pepe-綁定", options: [{ name: "碼", type: 3, value: "123456" }] } });
  assert.deepStrictEqual(J({ k: p.kind, g: p.guildId, d: p.discordId, n: p.discordName, key: p.key, opts: p.opts }), { k: "command", g: "123456789", d: "55555", n: "顯示名", key: "link", opts: { 碼: "123456" } });
  assert.strictEqual(G.dcParse({ type: 2, user: { id: "777777" }, data: { name: "pepe-籌碼" } }).discordId, "777777");
  assert.strictEqual(G.dcParse({ type: 2, guild_id: "abc", member: { user: { id: "不是數字" } }, data: { name: "x" } }).guildId, "");
  assert.strictEqual(G.dcParse({ type: 2, member: { user: { id: "12345" } }, data: { name: "別的指令" } }).key, "");
  assert.strictEqual(G.dcParse({ type: 3 }).kind, "component");
  for (const bad of [null, undefined, "x", 5, [], { type: "2" }, { type: 2 }, { type: 2, data: { name: 5 } }]) assert.strictEqual(G.dcParse(bad).kind === "command", false);
});

T("簽名的時間戳：差 NUM.discord.skewSec 秒以內才收；不是數字、太舊、太新都拒絕", G => {
  const now = Date.UTC(2026, 10, 9, 12, 0, 0), s = now / 1000, W = G.NUM.discord.skewSec;
  assert.ok(G.dcTimestampOk(String(s), now));
  assert.ok(G.dcTimestampOk(String(s - W), now));
  assert.ok(G.dcTimestampOk(String(s + W), now));
  assert.ok(!G.dcTimestampOk(String(s - W - 1), now));
  assert.ok(!G.dcTimestampOk(String(s + W + 1), now));
  for (const bad of ["", "abc", "12.5", "-5", null, undefined, 1700000000]) assert.ok(!G.dcTimestampOk(bad, now), String(bad));
});

T("綁定碼：6 位數（前面補 0）、用 randInt、輸入容許空白和橫線，其他不收", G => {
  assert.strictEqual(G.dcLinkCodeMake(() => 7), "000007");
  assert.strictEqual(G.dcLinkCodeMake((a, b) => { assert.deepStrictEqual([a, b], [0, 1000000]); return 999999; }), "999999");
  assert.strictEqual(G.dcLinkCodeOf("123456"), "123456");
  assert.strictEqual(G.dcLinkCodeOf(" 123 456 "), "123456");
  assert.strictEqual(G.dcLinkCodeOf("123-456"), "123456");
  for (const bad of ["12345", "1234567", "abcdef", "", null, undefined, "12 34 5a"]) assert.strictEqual(G.dcLinkCodeOf(bad), "", String(bad));
});

T("加入連結碼：16 個字、字母表沒有容易看錯的字、大小寫都收、其他不收", G => {
  let i = 0;
  const code = G.dcJoinCodeMake((a, b) => { assert.strictEqual(a, 0); return (i++ * 7) % b; });
  assert.strictEqual(code.length, 16);
  assert.ok(/^[2-9a-hj-km-np-z]{16}$/.test(code));
  assert.ok(!/[01oli]/.test(code));
  assert.strictEqual(G.dcJoinCodeOf(code.toUpperCase()), code);
  for (const bad of ["", "short", code + "x", code.replace(/.$/, "0"), "<script>", null, undefined]) assert.strictEqual(G.dcJoinCodeOf(bad), "", String(bad));
});

T("期限：到期那一刻就算過期；壞資料算過期", G => {
  const exp = G.dcExpireAt(1000, G.NUM.discord.linkCodeMin);
  assert.strictEqual(exp, 1000 + G.NUM.discord.linkCodeMin * MIN);
  assert.ok(!G.dcExpired(exp, exp - 1));
  assert.ok(G.dcExpired(exp, exp));
  assert.ok(G.dcExpired(undefined, 5) && G.dcExpired(NaN, 5) && G.dcExpired(10, NaN));
});

T("打錯太多次暫時擋：第 triesMax 次錯了就擋、擋的時間算到視窗結束、視窗過了重算", G => {
  const N = G.NUM.discord.triesMax, W = G.NUM.discord.triesWindowMin * MIN, t0 = 1e12;
  let rec = null;
  assert.deepStrictEqual(J(G.dcTriesState(rec, t0)), { blocked: false, left: N, waitMin: 0 });
  for (let i = 1; i <= N; i++) {
    rec = J(G.dcTriesFail(rec, t0 + i * 1000));
    assert.strictEqual(rec.n, i);
    assert.strictEqual(G.dcTriesState(rec, t0 + i * 1000).blocked, i >= N, `第 ${i} 次`);
  }
  const st = G.dcTriesState(rec, t0 + 60000);
  assert.ok(st.blocked && st.waitMin >= 1 && st.waitMin <= G.NUM.discord.triesWindowMin);
  assert.ok(!G.dcTriesState(rec, t0 + 1000 + W).blocked, "視窗過了");
  assert.deepStrictEqual(J(G.dcTriesFail(rec, t0 + 1000 + W)), { n: 1, since: t0 + 1000 + W });
  assert.ok(!G.dcTriesState({ n: "壞", since: "壞" }, t0).blocked);
});

T("每天加入上限：NUM.discord.joinPerDay", G => {
  const N = G.NUM.discord.joinPerDay;
  assert.strictEqual(N, 5);
  assert.ok(!G.dcJoinFull(0) && !G.dcJoinFull(N - 1) && G.dcJoinFull(N) && G.dcJoinFull(N + 3));
  assert.ok(!G.dcJoinFull(undefined) && !G.dcJoinFull("x"));
});

T("綁定獎勵是 100 萬（翊文 11-09：送100萬）", G => assert.strictEqual(G.NUM.discord.linkBonus, 1000000));

T("Google email：沒驗證過、不是字串、有斜線的都不收；轉小寫", G => {
  assert.strictEqual(G.dcVerifiedEmail({ email: " Foo@Gmail.com ", email_verified: true }), "foo@gmail.com");
  for (const bad of [{ email: "a@b.c" }, { email: "a@b.c", email_verified: "true" }, { email: 5, email_verified: true }, { email: "ab", email_verified: true }, { email: "a/b@c.d", email_verified: true }, null, [], "x"]) assert.strictEqual(G.dcVerifiedEmail(bad), null);
});

T("網址的 join：只收合格的碼；拿掉參數時其他參數留著", G => {
  const code = "abcdefghjkmnpqrs";
  assert.strictEqual(G.dcJoinParam(`?join=${code}`), code);
  assert.strictEqual(G.dcJoinParam(`?a=1&join=${code.toUpperCase()}&b=2`), code);
  for (const bad of ["", "?join=", "?join=短", `?joinx=${code}`, "?join=%E0%A4%A", null, undefined]) assert.strictEqual(G.dcJoinParam(bad), "", String(bad));
  assert.strictEqual(G.dcStripJoin(`?join=${code}`), "");
  assert.strictEqual(G.dcStripJoin(`?user=小明&join=${code}`), "?user=小明");
  assert.strictEqual(G.dcStripJoin(`?join=${code}&sound`), "?sound");
  assert.strictEqual(G.dcStripJoin("?user=小明"), "?user=小明");
  assert.strictEqual(G.dcStripJoin(""), "");
  assert.strictEqual(G.dcJoinUrl(code), `https://pepe-museum.web.app/?join=${code}`);
});

T("回覆：不 @ 任何人、本人看得到 flags 64、公開的 flags 0、太長就截短", G => {
  const e = J(G.dcReply("嗨", true)), p = J(G.dcReply("嗨", false));
  assert.strictEqual(e.type, 4);
  assert.strictEqual(e.data.flags, 64);
  assert.strictEqual(p.data.flags, 0);
  assert.deepStrictEqual(e.data.allowed_mentions, { parse: [] });
  assert.ok(G.dcReply("字".repeat(5000), false).data.content.length <= 2000);
  assert.deepStrictEqual(J(G.dcPong()), { type: 1 });
});

T("公開的字：暱稱過濾 @、markdown、看不見的字；籌碼文字只有暱稱、籌碼、稱號", G => {
  const evil = "@everyone**粗**`x`" + String.fromCodePoint(0x200b) + String.fromCodePoint(0x202e) + "[a](http://x)";
  const n = G.dcNick(evil);
  assert.ok(!/[@*`\[\]()]/.test(n) && !/[​-‏‪-‮]/.test(n), n);
  assert.ok([...n].length <= 12);
  assert.strictEqual(G.dcNick(""), "館友");
  const t = G.dcChipsText("小明", 1234567, { id: "bj", name: "天生壹對" });
  assert.ok(t.includes("小明") && t.includes("1,234,567") && t.includes("天生壹對"), t);
  assert.ok(!G.dcChipsText("小明", 5, null).includes("稱號"));
  assert.strictEqual(G.dcNum(-1234567), "-1,234,567");
  assert.strictEqual(G.dcNum("x"), "0");
});

T("所有回覆文字：沒有 email、理智、怪癖、靈感；用「壹」不用「一個」「一次」", G => {
  const texts = Object.values(G.DC_TEXT).join("\n");
  assert.ok(!/理智|怪癖|靈感/.test(texts), "文字裡不該提到這些");
  assert.ok(!/一個|一次|一下|一位|一則|一週/.test(texts), "介面文字要用壹");
  assert.ok(G.DC_TEXT.joinWebDisabled.includes("邀請") && G.DC_TEXT.joinWebBad.includes("邀請") && G.DC_TEXT.joinWebFull.includes("邀請") && G.DC_TEXT.joinWebUsed.includes("邀請") && G.DC_TEXT.joinNeedVerified.includes("邀請"), "網頁的錯誤要有「邀請」，net_firebase.js 才會原樣顯示");
});

T("莊家：破產中會說；沒有資料不亂編", G => {
  assert.ok(G.dcHouseText(5000000).includes("5,000,000") && !G.dcHouseText(5000000).includes("破產"));
  assert.ok(G.dcHouseText(-300).includes("破產"));
  assert.strictEqual(G.dcHouseText(undefined), G.DC_TEXT.houseNone);
});

T("榜單：只列名次、暱稱、數字；不放建議和提醒；沒有榜單就老實說", G => {
  assert.strictEqual(G.dcBoardText(null), G.DC_TEXT.boardNone);
  assert.strictEqual(G.dcBoardText({ week: "2026-W45", from: "2026-11-02", to: "2026-11-08", empty: true, boards: [] }), G.DC_TEXT.boardEmpty);
  const doc = { week: "2026-W45", from: "2026-11-02", to: "2026-11-08", boards: [
    { id: "codex", title: "本週新收藏", rows: [{ rank: 1, nick: "小明", value: 12 }, { rank: 1, nick: "小華@x", value: 12 }, { rank: 3, nick: "小美", value: 5 }] },
    { id: "full", title: "全勤", rows: [{ rank: 1, nick: "阿全", value: 7 }] }],
  tips: ["這是建議不該出現"], nudges: [{ nick: "小華", text: "這是提醒不該出現" }] };
  const t = G.dcBoardText(doc);
  assert.ok(t.includes("11/02～11/08") && t.includes("小明") && t.includes("小美") && t.includes("12 格") && t.includes("阿全"), t);
  assert.ok(!t.includes("不該出現") && !t.includes("@"), t);
});

T("今天的活動：有活動就列；沒有活動也沒節日就說沒有；節日和小節日各自列", G => {
  const events = G.cleanEvents([{ id: "x", kind: "coopBoost", date: "2026-11-11", from: "20:00", to: "22:00", title: "加班夜", words: "招領箱前排起壹串人。" }], "2026-11-09", "2026-W46");
  const t = G.dcTodayText("2026-11-11", events);
  assert.ok(t.includes("加班夜") && t.includes("20:00～22:00") && t.includes("限時活動"), t);
  // 找壹個既沒有節日也沒有小節日的日子
  let quiet = null;
  for (let d = 0; d < 400 && !quiet; d++) { const dt = new Date(Date.UTC(2026, 10, 12 + d)).toISOString().slice(0, 10); if (!G.holidaysOn(dt).length && !G.funDaysOf(dt).length) quiet = dt; }
  assert.ok(quiet);
  assert.strictEqual(G.dcTodayText(quiet, events), G.DC_TEXT.todayNone);
  const fun = G.funDaysOf("2027-03-14");
  assert.ok(fun.length && G.dcTodayText("2027-03-14", []).includes(fun[0].name));
  const hol = G.holidaysOn("2026-12-25");
  if (hol.length) assert.ok(G.dcTodayText("2026-12-25", []).includes(hol[0].name));
});

T("今天的活動加今日館訊和現實世界：有才顯示、沒有就不顯示、不編；壞資料和提及都擋掉", G => {
  const none = G.dcTodayText("2026-11-12", [], { title: "標題", n: 3, board: "", real: [] });
  assert.ok(!none.includes("現實世界"), none);
  const info = { title: "換季的失物招領", n: 2, board: "B1 的樓梯口多了壹個招領箱。", real: ["台北有壹個光影展，展到月底。", "宜蘭海邊有風箏節。", "第三則。", "第四則不該出現。"] };
  const t = G.dcTodayText("2026-11-10", [], info);
  assert.ok(t.includes("【今日館訊】") && t.includes("換季的失物招領") && t.includes("第 2 日") && t.includes("招領箱"), t);
  assert.ok(t.includes("【今天的現實世界】") && t.includes("・台北有壹個光影展") && t.includes("・第三則。") && !t.includes("第四則"), t);
  // 只有現實世界也算有東西（不回「今天沒有活動」）；沒有任何東西才回沒有
  const only = G.dcTodayText("2026-11-12", [], { real: ["只有這壹則。"] });
  assert.ok(only.includes("只有這壹則") && !only.includes("今日館訊"), only);
  assert.strictEqual(G.dcTodayText("2026-11-12", [], { real: [] }), G.dcTodayText("2026-11-12", []));
  assert.deepStrictEqual(J(G.dcRealList({ real: ["好", 5, null, "", "   ", { a: 1 }] })), ["好"]);
  assert.deepStrictEqual(J(G.dcRealList({ real: "不是陣列" })), []);
  assert.deepStrictEqual(J(G.dcRealList(null)), []);
  const evil = G.dcRealList({ real: ["@everyone 看這裡 <@123> `x` **粗** [a](http://x)\n換行"] })[0];
  assert.ok(!/[@<>`*]/.test(evil) && !evil.includes("\n"), evil);
  assert.ok([...G.dcRealList({ real: ["壹".repeat(500)] })[0]].length <= G.NUM.discord.realChars);
  assert.ok(G.dcTodayText("2026-11-10", [], { title: "標", n: 1, board: "壹".repeat(3000), real: [] }).length < 2000);
  // 過 dcReply 不會超過 2000 字
  assert.ok(J(G.dcReply(G.dcTodayText("2026-11-10", [], info), false)).data.content.length <= 2000);
});

T("/pepe-更新：列最近幾則玩家看得到的公告（日期、標題、連結）；預設 5 則；未發布、過期的不列；不超過 2000 字", G => {
  const t = G.dcNewsText("2026-11-09");
  const rows = t.split("\n").filter(l => l.startsWith("・"));
  assert.strictEqual(rows.length, G.NUM.discord.newsDefault, t);
  assert.ok(t.includes(G.DC_SITE) && t.includes("公佈欄"), t);
  assert.ok(rows.every(r => /^・\d\d\/\d\d　/.test(r)), t);
  assert.strictEqual(G.dcNewsList("2026-11-09", 3).length, 3);
  assert.strictEqual(G.dcNewsList("2026-11-09", 999).length, G.NUM.discord.newsMax);
  assert.strictEqual(G.dcNewsList("2026-11-09", 0).length, G.NUM.discord.newsDefault);
  assert.strictEqual(G.dcNewsList("2026-11-09", "abc").length, G.NUM.discord.newsDefault);
  // 日期排序：新的在前；同一天寫在後面的比較新
  const all = G.dcNewsList("2027-01-01", 10), pub = all.map(n => n.publish);
  assert.deepStrictEqual(pub, pub.slice().sort().reverse());
  // 未發布的不列：發布日之前什麼都沒有
  assert.strictEqual(G.dcNewsText("2026-01-01"), G.DC_TEXT.newsNone);
  // 過期的不列：全部都過期之後
  assert.strictEqual(G.dcNewsText("2099-01-01"), G.DC_TEXT.newsNone);
  // 跟遊戲公佈欄同一個判斷
  const today = "2026-11-17";
  const inGame = G.visibleNotices(null, today).filter(n => G.NOTICES.includes(n)).map(n => n.id).sort();
  const inDc = G.NOTICES.filter(n => G.noticeLive(n, today)).map(n => n.id).sort();
  assert.deepStrictEqual(inDc, inGame);
  assert.ok(!G.dcNewsList(today, 10).some(n => !G.noticeLive(n, today)));
  assert.ok(G.dcNewsText(today, 10).length < 2000);
  assert.ok(!/@|<|\*\*/.test(G.dcNewsText("2026-11-09", 10)));
  assert.ok(!/理智|怪癖|靈感/.test(G.dcNewsText("2026-11-09", 10)), "頻道裡不放理智、怪癖、靈感");
  assert.ok(G.NOTICES.some(n => /怪癖/.test(n.title)) && !G.dcNewsList("2026-11-09", 10).some(n => /怪癖/.test(n.title)));
});

T("誰在線：只列暱稱；沒人就說沒人", G => {
  assert.strictEqual(G.dcOnlineText([]), G.DC_TEXT.onlineNone);
  assert.strictEqual(G.dcOnlineText(undefined), G.DC_TEXT.onlineNone);
  const t = G.dcOnlineText(["小明", "小華"]);
  assert.ok(t.includes("2 位") && t.includes("小明、小華"), t);
});

T("綁定成功的字：第一次說送了多少，領過了就說領過了", G => {
  const a = G.dcLinkOkText("小明", 1000000), b = G.dcLinkOkText("小明", 0);
  assert.ok(a.includes("1,000,000") && a.includes("小明"));
  assert.ok(!b.includes("1,000,000") && b.includes("領過了"));
});

// ---------- 原始碼上的檢查（沒有模擬器也能擋的） ----------
T("Functions 的 Discord 檔：不用 Math.random、不寫死金鑰；設定檔的三個欄位是字串", () => {
  for (const f of ["discord.js", "discord_data.js", "discord_link.js", "discord_config.js"]) {
    const src = fs.readFileSync(path.join(ROOT, "functions", f), "utf8");
    assert.ok(!/Math\.random/.test(src), f + " 不准用 Math.random");
    assert.ok(!/BOT_TOKEN|Bot\s+[A-Za-z0-9_-]{20,}/.test(src.replace(/\/\/.*$/gm, "")), f + " 不放 token");
  }
  const cfg = fs.readFileSync(path.join(ROOT, "functions", "discord_config.js"), "utf8");
  assert.ok(/applicationId: "[0-9]*"/.test(cfg) && /publicKey: "[0-9a-f]*"/.test(cfg) && /guildId: "[0-9]*"/.test(cfg));
});

T("firestore.rules 沒放寬：Discord 的集合沒有被特別開，最後一條「一律不准」還在", () => {
  const rules = fs.readFileSync(path.join(ROOT, "firestore.rules"), "utf8");
  assert.ok(!/discord/i.test(rules), "不准為 Discord 開規則");
  assert.ok(/match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/.test(rules));
  const rtdb = fs.readFileSync(path.join(ROOT, "database.rules.json"), "utf8");
  assert.ok(!/discord/i.test(rtdb));
});

T("join 沒帶碼的路徑原樣：index.js 裡的邀請名單檢查還在，碼只在 joinCode 有值時才走", () => {
  const src = fs.readFileSync(path.join(ROOT, "functions", "index.js"), "utf8");
  assert.ok(src.includes("if (joinCode) {"));
  assert.ok(src.includes("你不在邀請名單上，請館長邀請你。"));
  assert.ok(src.includes('const devOk = EMULATOR && email.endsWith("@dev.local");'));
});

console.log(`${fail ? "✗" : "✓"} Discord 聯動第一步的規則：${pass} 項通過${fail ? `、${fail} 項沒過` : ""}`);
process.exit(fail ? 1 : 0);
