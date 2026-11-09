// 每週排行榜（shared/board.js、tools/weekly_board.cjs，決定 0039）：node test/board.test.cjs（npm test 也會跑）
// 資料都是假的；不連 Firebase、不連 Discord（db、fetcher 都是假的）。
const assert = require("assert");
const fs = require("fs"), path = require("path");
const { load } = require("./load_shared.cjs");
const { parseOptions, isDaily, newRoomFloor, runWeekly, runDaily } = require("../tools/weekly_board.cjs");
const { footer, MAX } = require("../tools/discord_post.cjs");

const tw = s => Date.parse(s + "+08:00"); // 台灣時間 → 毫秒
const RUN = tw("2026-11-16T05:15:00"); // 週一 05:15：算剛過完的 2026-W46（11-09～11-15）
const MON = "2026-11-09", WED = "2026-11-11", SUN = "2026-11-15";
const J = x => JSON.parse(JSON.stringify(x));
const FAKE_EMAIL = "fake.player@example.test";
const SITE = "https://pepe-museum.web.app";
const ZW = String.fromCodePoint(0x200b), RLO = String.fromCodePoint(0x202e); // 看不見的字：不直接寫在原始碼裡

let pass = 0, fail = 0;
const tests = [];
const T = (name, fn) => tests.push([name, fn]);

const fresh = G => {
  const save = G.newSave();
  const P = save.profiles.challenge = G.newProfile("challenge");
  G.ensureDay(P, WED);
  return { save, P };
};
const pepes = (G, P, n) => {
  // 用顏色×心情組出 n 格不一樣的圖鑑
  const list = G.baseOpts("顏色").flatMap(c => G.baseOpts("心情").map(m => G.pepeKey(Object.assign({}, G.DEFAULT_PICK, { 顏色: c, 心情: m }))));
  list.slice(0, n).forEach((k, i) => { P.pepes[k] = { n: 1, perfect: false, s: i + 1, d: WED }; });
};
// 一份有各種進度的存檔。over：{ codex, deepest, sign（這週簽幾天）, stamps（這週領幾枚）, balance（現在有幾枚）, read（這週讀完幾本）, walked, gear }
function saveOf(G, over = {}) {
  const { save, P } = fresh(G);
  if (over.codex) pepes(G, P, over.codex);
  if (over.deepest) P.cellar.best = over.deepest;
  const S = G.storyState(P);
  for (let i = 0; i < (over.sign || 0); i++) G.signIn(save, P, G.addDays(MON, i));
  for (let i = 0; i < (over.read || 0); i++) S.books[`2026-W46/b${i}`] = { got: MON, read: WED };
  for (let i = 0; i < (over.stamps || 0); i++) S.log.push({ d: WED, what: `2026-W46/w${i}`, r: "靈感 +6、週章 1 枚" });
  S.stamps = over.balance != null ? over.balance : 0;
  if (over.walked) S.deep[WED] = 1;
  if (over.gear) G.shopState(P).gear.magnifier = WED;
  return JSON.stringify(save);
}
const week = G => G.boardWeekOf(RUN);
const person = (G, uid, nick, over) => ({ uid, nick, stats: G.boardStatsOf(saveOf(G, over), week(G)) });
const boardOf = (doc, id) => doc.boards.find(b => b.id === id);
const rows = (doc, id) => J(boardOf(doc, id).rows);

// ---------- 這週是哪一週 ----------
T("算的一律是剛過完的那一週：週一 05:15、手動週三都算上一週；05:00 之前還沒換週", G => {
  const a = G.boardWeekOf(RUN);
  assert.deepStrictEqual([a.label, a.prev, a.next, a.from, a.to], ["2026-W46", "2026-W45", "2026-W47", MON, SUN]);
  assert.strictEqual(a.at, tw("2026-11-16T04:59:59"));
  assert.strictEqual(G.boardWeekOf(tw("2026-11-18T12:00:00")).label, "2026-W46");
  assert.strictEqual(G.boardWeekOf(tw("2026-11-16T04:59:00")).label, "2026-W45");
  assert.strictEqual(G.boardWeekOf(tw("2026-11-16T05:00:00")).label, "2026-W46");
});
T("跨年的週", G => {
  const a = G.boardWeekOf(tw("2027-01-04T05:15:00")); // 2027-01-04 是週一，算 2026-12-28～2027-01-03
  assert.deepStrictEqual([a.label, a.prev, a.from, a.to], ["2026-W53", "2026-W52", "2026-12-28", "2027-01-03"]);
});
T("排程的時間：UTC 週日 21:15 就是台灣週一 05:15", G => {
  const y = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "weekly-board.yml"), "utf8");
  assert.ok(y.includes('cron: "15 21 * * 0"'));
  assert.strictEqual(new Date("2026-11-15T21:15:00Z").getUTCDay(), 0);
  assert.strictEqual(Date.parse("2026-11-15T21:15:00Z"), RUN);
});

// ---------- 榜 ----------
T("同分同名次（1、1、3），列到第 3 名；0 分不上榜", G => {
  const wk = week(G);
  const people = [["a", "甲", 5], ["b", "乙", 5], ["c", "丙", 3], ["d", "丁", 2], ["e", "戊", 0]].map(([uid, nick, deepest]) => person(G, uid, nick, { codex: deepest * 2 }));
  const { doc } = G.boardCompute(people, null, wk);
  assert.deepStrictEqual(rows(doc, "codex"), [{ rank: 1, nick: "甲", value: 10 }, { rank: 1, nick: "乙", value: 10 }, { rank: 3, nick: "丙", value: 6 }]);
  assert.deepStrictEqual(J(G.boardGroups(rows(doc, "codex"))), [{ rank: 1, value: 10, nicks: ["甲", "乙"] }, { rank: 3, value: 6, nicks: ["丙"] }]);
});
T("第 3 名同分的都列出來", G => {
  const { doc } = G.boardCompute([9, 8, 7, 7, 7, 1].map((n, i) => person(G, "u" + i, "人" + i, { codex: n })), null, week(G));
  assert.deepStrictEqual(rows(doc, "codex").map(r => r.rank), [1, 2, 3, 3, 3]);
});
T("第一週：沒有上週的快照，新收藏改列累積，標題也跟著改", G => {
  const r = G.boardCompute([person(G, "a", "甲", { codex: 12 })], null, week(G));
  assert.strictEqual(r.doc.first, true);
  assert.strictEqual(boardOf(r.doc, "codex").title, "圖鑑累積");
  assert.strictEqual(rows(r.doc, "codex")[0].value, 12);
  const text = G.boardDiscordText(r.doc, footer(), MAX);
  assert.ok(text.includes("圖鑑累積")); assert.ok(text.includes("第壹份榜單"));
});
T("相減：新收藏是這週多的；新來的從 0 算；變少不會變負的", G => {
  const prev = { people: { a: { codex: 10, books: 2, hall: 0, deepest: 1 }, b: { codex: 20, books: 0, hall: 0, deepest: 0 } } };
  const r = G.boardCompute([person(G, "a", "甲", { codex: 13 }), person(G, "b", "乙", { codex: 5 }), person(G, "c", "丙", { codex: 2 })], prev, week(G));
  assert.strictEqual(r.doc.first, false);
  assert.strictEqual(boardOf(r.doc, "codex").title, "本週新收藏");
  assert.deepStrictEqual(rows(r.doc, "codex"), [{ rank: 1, nick: "甲", value: 3 }, { rank: 2, nick: "丙", value: 2 }]);
  assert.strictEqual(J(r.snapshot).people.a.codex, 13, "快照放累計");
});
T("週章：照這週領到的算，花掉不會扣；上週領的不算", G => {
  const wk = week(G);
  const raw = JSON.parse(saveOf(G, { stamps: 3, balance: 0 }));
  raw.profiles.challenge.story.log.push({ d: "2026-11-08", what: "2026-W45/w1", r: "週章 9 枚" }, { d: WED, what: "x", r: "靈感 +6" }, "壞的");
  const s = G.boardStatsOf(JSON.stringify(raw), wk);
  assert.strictEqual(s.stampsWeek, 3);
  assert.strictEqual(s.stamps, 0);
});
T("週章跟 give 寫的紀錄對得上（真的領一次）", G => {
  const { save, P } = fresh(G);
  const W = { label: "2026-W46", past: false, daily: [], weekly: [{ id: "2026-W46/w1", weekly: true, reward: { insp: 1, mood: 0, items: [], stamps: 0, skill: null } }] };
  G.storyState(P).tasks["2026-W46/w1"] = { base: 0, done: WED, claimed: null };
  assert.ok(G.claimTask(P, W, "2026-W46/w1", WED).ok);
  assert.strictEqual(G.boardStatsOf(JSON.stringify(save), week(G)).stampsWeek, G.NUM.story.stampPerTask);
});
T("全勤：簽滿 7 天的都列出來（超過 3 人）；只簽 6 天的不算；算的是剛過完那週", G => {
  const people = ["甲", "乙", "丙", "丁", "戊"].map((n, i) => person(G, "u" + i, n, { sign: 7 }));
  people.push(person(G, "x", "己", { sign: 6 }));
  const { doc } = G.boardCompute(people, null, week(G));
  assert.deepStrictEqual(rows(doc, "full").map(r => r.nick), ["甲", "乙", "丙", "丁", "戊"]);
  assert.ok(rows(doc, "full").every(r => r.rank === 1));
  assert.ok(G.boardDiscordText(doc, "", MAX).includes("甲、乙、丙、丁、戊"));
});
T("讀書：這週讀完的劇情書＋起源室和禁書多的；第一週只算有日期的；換人不會以為多讀", G => {
  const wk = week(G);
  const { save, P } = fresh(G);
  G.storyState(P).books = { "2026-W46/a": { got: MON, read: WED }, "2026-W45/a": { got: "2026-11-05", read: "2026-11-05" }, "2026-W46/b": { got: MON, read: null } };
  P.chaptersRead = { 0: true, 1: true };
  const id = G.FORBIDDEN_BOOKS[0].id;
  P.visitors = [G.blankVisitor(P, { vid: "v2", slot: 1, visitor: 2, vname: "路人" })];
  P.visitors[0].mythFrom = { [id]: true }; // 不在場的那位讀的
  const s = G.boardStatsOf(JSON.stringify(save), wk);
  assert.strictEqual(s.storyRead, 1);
  assert.strictEqual(s.books, 3);
  const p = { uid: "a", nick: "甲", stats: s };
  assert.strictEqual(rows(G.boardCompute([p], null, wk).doc, "books")[0].value, 1, "第一週");
  assert.strictEqual(rows(G.boardCompute([p], { people: { a: { books: 1 } } }, wk).doc, "books")[0].value, 3, "第二週以後");
  assert.strictEqual(rows(G.boardCompute([p], { people: { a: { books: 3 } } }, wk).doc, "books")[0].value, 1, "換人回來，累計沒多");
});
T("展廳評分、地下最深；地下超過樓層數的假存檔拉回來", G => {
  const wk = week(G);
  const { save, P } = fresh(G);
  pepes(G, P, 6);
  P.hall = Object.keys(P.pepes).slice(0, 6).map(key => ({ kind: "pepe", key }));
  P.cellar.best = 9999;
  const s = G.boardStatsOf(JSON.stringify(save), wk);
  assert.strictEqual(s.hall, G.hallScore(P).score);
  assert.ok(s.hall > 0);
  assert.strictEqual(s.deepest, G.cellarFloors().length);
  const { doc } = G.boardCompute([{ uid: "a", nick: "甲", stats: s }], null, wk);
  assert.strictEqual(rows(doc, "deep")[0].value, s.deepest);
  assert.strictEqual(G.boardValueText("deep", 3), "B3");
  assert.strictEqual(G.boardValueText("hall", 88), "88 分");
  assert.strictEqual(G.boardValueText("full", 7), "");
});
T("隱身的人照算（members 的 invisible 不看）", G => {
  const wk = week(G);
  const people = G.boardPeopleOf({ members: [{ uid: "a", nick: "隱身的人", invisible: true, joinedAt: 1 }], saves: { a: saveOf(G, { codex: 4 }) } }, wk);
  assert.strictEqual(rows(G.boardCompute(people, null, wk).doc, "codex")[0].nick, "隱身的人");
});
T("名單：先加入的排前面；還沒進館的不上榜", G => {
  const wk = week(G);
  const people = G.boardPeopleOf({ members: [{ uid: "b", nick: "晚來", joinedAt: 2 }, { uid: "a", nick: "早來", joinedAt: 1 }, { uid: "c", nick: "沒存檔", joinedAt: 3 }], saves: { a: saveOf(G, { codex: 4 }), b: saveOf(G, { codex: 4 }) } }, wk);
  assert.deepStrictEqual(rows(G.boardCompute(people, null, wk).doc, "codex").map(r => r.nick), ["早來", "晚來"]);
});

// ---------- 舊存檔、壞存檔 ----------
T("舊存檔：沒有簽到、週章、劇情也算得出來", G => {
  const wk = week(G);
  const save = G.newSave();
  const P = save.profiles.challenge = G.newProfile("challenge");
  delete P.story; delete P.shop; delete P.themeShow; delete save.signin; delete P.cellar;
  const s = G.boardStatsOf(JSON.stringify(save), wk);
  assert.ok(s.ok && s.entered);
  assert.deepStrictEqual([s.codex, s.signWeek, s.stampsWeek, s.storyRead, s.deepest, s.walked], [0, 0, 0, 0, 0, false]);
});
T("壞存檔不讓整份壞掉：那個人不上榜，別人照算，累計數字留上週的", G => {
  const wk = week(G);
  const bad = ["{壞掉", "[]", "5", '{"profiles":"x"}', '{"profiles":{"challenge":5}}', '{"profiles":{"challenge":{"pepes":"x","hall":5,"story":3,"cellar":"y","visitors":7}}}'];
  bad.forEach(raw => { const s = G.boardStatsOf(raw, wk); assert.ok(s && typeof s.ok === "boolean", raw); });
  const members = bad.map((_, i) => ({ uid: "bad" + i, nick: "壞" + i, joinedAt: i })).concat([{ uid: "good", nick: "好", joinedAt: 99 }]);
  const saves = Object.fromEntries(bad.map((raw, i) => ["bad" + i, raw]));
  saves.good = saveOf(G, { codex: 3 });
  const people = G.boardPeopleOf({ members, saves }, wk);
  const r = G.boardCompute(people, { people: { bad0: { codex: 7, books: 1, hall: 2, deepest: 1 } } }, wk);
  assert.ok(rows(r.doc, "codex").some(x => x.nick === "好"));
  assert.ok(!rows(r.doc, "codex").some(x => x.nick === "壞0"));
  assert.ok(r.unreadable >= 2);
  assert.deepStrictEqual(J(r.snapshot).people.bad0, { codex: 7, books: 1, hall: 2, deepest: 1 });
});
T("存檔裡亂寫的值：不會變成名字、不會壞掉", G => {
  const wk = week(G);
  const raw = JSON.parse(saveOf(G, { codex: 1 }));
  raw.profiles.challenge.story.books = { x: 5, y: { read: 123 }, z: null };
  raw.profiles.challenge.story.deep = { [WED]: "很深" };
  raw.profiles.challenge.story.log = [null, { d: WED, r: 5 }];
  raw.profiles.challenge.hall = [{ kind: "壞", key: 5 }, null, 7];
  const s = G.boardStatsOf(JSON.stringify(raw), wk);
  assert.ok(s.ok && s.entered);
  assert.deepStrictEqual([s.storyRead, s.walked, s.stampsWeek], [0, false, 0]);
});

// ---------- 暱稱清理 ----------
T("暱稱貼到 Discord 前清乾淨：@、換行、markdown、連結都弄不出來", G => {
  const clean = G.boardDiscordNick;
  assert.strictEqual(clean("@everyone"), "everyone");
  assert.strictEqual(clean("＠here"), "here", "全形的 @");
  assert.strictEqual(clean("<@123456>"), "123456");
  assert.strictEqual(clean("**粗體**"), "粗體");
  assert.strictEqual(clean("小明\n# 標題"), "小明 標題");
  assert.strictEqual(clean("`碼`~~刪~~||藏||_斜_"), "碼刪藏斜");
  assert.strictEqual(clean("[點我](http://a.b)"), "點我httpab");
  for (const s of ["https://evil.example/x", "discord.gg/abc", "www.evil.example", "ｈｔｔｐｓ：／／ａ．ｂ"]) {
    const out = clean(s);
    assert.ok(!/[:/.@]/.test(out), s + " → " + out);
  }
  assert.strictEqual(clean("零" + ZW + "寬" + RLO + "字"), "零 寬 字");
  assert.strictEqual(clean("@@@"), "館友", "清完沒字了");
  assert.strictEqual(clean(null), "館友");
  assert.strictEqual([...clean("字".repeat(30))].length, 12);
});
T("整則公告：暱稱弄不出 @ 和連結，連結只有最後面那一個", G => {
  const wk = week(G);
  const evil = ["@everyone", "<@1>", "http://evil.example", "**粗**\n# 假標題"];
  const people = evil.map((n, i) => ({ uid: "u" + i, nick: n, stats: G.boardStatsOf(saveOf(G, { codex: 5, sign: 7 }), wk) }));
  const text = G.boardDiscordText(G.boardCompute(people, null, wk).doc, footer(), MAX);
  assert.ok(!text.includes("@"), text);
  assert.ok(!text.includes("<"), text);
  assert.ok(!text.includes("evil.example"), text);
  assert.ok(text.includes("粗 假標題"), "換行、markdown 被清掉");
  assert.ok(!text.split("\n").some(l => l.startsWith("# ")), "弄不出標題");
  assert.strictEqual(text.split("://").length, 2, "連結只有最後面的入館");
  assert.ok(text.endsWith(`🎟 入館：${SITE}`));
});
T("遊戲裡的暱稱：純文字照留，只去掉看不見的字、最多 12 字", G => {
  const wk = week(G);
  const people = G.boardPeopleOf({ members: [{ uid: "a", nick: "A.B_小明" + ZW, joinedAt: 1 }, { uid: "b", nick: 5, joinedAt: 2 }, { uid: "c", nick: "字".repeat(30), joinedAt: 3 }], saves: {} }, wk);
  assert.deepStrictEqual(people.map(p => p.nick), ["A.B_小明", "館友", "字".repeat(12)]);
});

// ---------- 公告 ----------
T("公告的樣子：博物館的口吻、emoji、館長室敬啟、連結在最後面", G => {
  const wk = week(G);
  const text = G.boardDiscordText(G.boardCompute([person(G, "a", "甲", { codex: 9, deepest: 2, sign: 7, read: 2, stamps: 3 })], null, wk).doc, footer(), MAX);
  for (const s of ["🏛 **佩佩博物館2　本週榜單**", "11/09～11/15", "🖼 【圖鑑累積】", "⛏ 【地下收藏庫走最深】", "📖 【本週讀最多書】", "🗓 【全勤】簽滿 7 天", "🎖 【本週週章】", "🥇 甲　B2", "館長室 敬啟"]) assert.ok(text.includes(s), s + "\n" + text);
  assert.ok(text.endsWith(`館長室 敬啟\n\n${footer()}`));
});
T("沒有人的榜不列", G => {
  const text = G.boardDiscordText(G.boardCompute([person(G, "a", "甲", { codex: 1 })], null, week(G)).doc, "", MAX);
  assert.ok(!text.includes("全勤】")); assert.ok(!text.includes("本週週章"));
});
T("一則最多 2000 字：太長截短，敬啟和連結都留著，不切在 emoji 中間", G => {
  const wk = week(G);
  const doc = G.boardCompute([person(G, "a", "甲", { codex: 1 })], null, wk).doc;
  doc.boards.find(b => b.id === "full").rows = Array.from({ length: 300 }, (_, i) => ({ rank: 1, nick: "很長的暱稱很長的暱稱很" + (i % 10), value: 7 }));
  doc.tips = Array.from({ length: 80 }, (_, i) => `第 ${i} 條很長的建議，字數要夠多才會超過上限喔。`);
  const text = G.boardDiscordText(doc, footer(), MAX);
  assert.ok(text.length <= MAX, String(text.length));
  assert.ok(text.endsWith(`館長室 敬啟\n\n${footer()}`));
  assert.ok(text.includes("…"));
  assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(text), "沒有切壞的 emoji");
  // 整段都沒有換行，也不會切壞
  const one = Object.assign(J(doc), { boards: [] , tips: ["🖼".repeat(1500)], nudges: [] });
  const t2 = G.boardDiscordText(one, footer(), MAX);
  assert.ok(t2.length <= MAX);
  assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(t2));
});

// ---------- 建議、提醒 ----------
const PRIVATE_WORDS = /理智|怪癖|靈感|心情|俄國8|結局|禁書|發作|email|@|最後壹名|最後一名|倒數|墊底/;
const PRIVATE_VALUES = [987654, 876543, 765432]; // 假存檔裡的理智、靈感、心情
function secretSave(G, over) {
  const raw = JSON.parse(saveOf(G, over));
  const P = raw.profiles.challenge;
  P.sanity = PRIVATE_VALUES[0]; P.insp = PRIVATE_VALUES[1]; P.mood = PRIVATE_VALUES[2];
  P.vname = "祕密參觀者"; P.quirks = [{ type: "phobia", cat: "顏色", opt: "祕密怪癖", since: WED, until: RUN + 600000, task: "hug" }];
  return JSON.stringify(raw);
}
T("建議：有人進館就有 2～3 條；不含不該公開的字和數字", G => {
  const wk = week(G);
  [[], [{ codex: 3 }], [{ codex: 3, sign: 7, read: 2, walked: true, gear: true }], [{ sign: 5 }, { walked: true }, { gear: true, stamps: 7 }]].forEach(list => {
    const people = list.map((o, i) => ({ uid: "u" + i, nick: "人" + i, stats: G.boardStatsOf(secretSave(G, o), wk) }));
    [null, { people: {} }].forEach(prev => {
      const { doc } = G.boardCompute(people, prev, wk);
      if (!people.length) assert.strictEqual(doc.tips.length, 0);
      else assert.ok(doc.tips.length >= 2 && doc.tips.length <= G.NUM.board.tipsMax, JSON.stringify(doc.tips));
      const all = JSON.stringify(J(doc));
      assert.ok(!PRIVATE_WORDS.test(all), all);
      PRIVATE_VALUES.forEach(v => assert.ok(!all.includes(String(v)), all));
      assert.ok(!all.includes("祕密"), all);
    });
  });
});
T("建議照大家的狀況挑：大家沒下地下、知道新房間在哪一層才講 B1；大家都走了就不講", G => {
  const wk = week(G);
  const idle = [person(G, "a", "甲", { codex: 1 }), person(G, "b", "乙", { codex: 1 })];
  const has = s => /地下走得不多/.test(s);
  const tips = G.boardTips(idle.map(J), null, wk, { newRoomFloor: 1 });
  // 候選有好幾條會輪流：把週換幾次，一定輪得到；講到的時候要照實寫 B1
  const seen = [];
  for (let i = 0; i < 8; i++) { const w = G.boardWeekOf(RUN + i * 7 * 86400000); seen.push(...G.boardTips(idle, null, w, { newRoomFloor: 1 })); }
  assert.ok(seen.some(s => s.includes("B1 新開了房間")), JSON.stringify(seen));
  assert.ok(tips.length >= 2);
  const noFloor = [];
  for (let i = 0; i < 8; i++) { const w = G.boardWeekOf(RUN + i * 7 * 86400000); noFloor.push(...G.boardTips(idle, null, w, {})); }
  assert.ok(noFloor.some(has) && !noFloor.some(s => /B\d 新開/.test(s)), "不知道哪一層就不提");
  const walked = [person(G, "a", "甲", { walked: true }), person(G, "b", "乙", { walked: true })];
  for (let i = 0; i < 8; i++) { const w = G.boardWeekOf(RUN + i * 7 * 86400000); assert.ok(!G.boardTips(walked, null, w, { newRoomFloor: 1 }).some(has)); }
});
T("建議：主題展再 1 天就辦完排最前面，要真的快辦完、到銅才講", G => {
  const wk = week(G);
  const p = { uid: "a", nick: "甲", stats: Object.assign(G.boardStatsOf(saveOf(G, {}), wk), { showAlmost: true }) };
  assert.ok(G.boardTips([p], null, wk)[0].includes("主題展再撐 1 天"));
  // 真的存檔：牆上掛 3 天的第 2 天
  const { save, P } = fresh(G);
  const today = G.taipeiDay(RUN);
  pepes(G, P, 6);
  P.hall = Object.keys(P.pepes).slice(0, 6).map(key => ({ kind: "pepe", key }));
  const theme = G.hallScore(P).theme;
  if (theme) {
    G.showBox(P).cur = { theme, from: G.addDays(today, -1) };
    const st = G.showStatus(P, today);
    assert.strictEqual(G.boardStatsOf(JSON.stringify(save), wk).showAlmost, st.left === 1 && st.tier > st.doneTier);
  }
});
T("建議的週章數字照 NUM；全部都用「壹」", G => {
  const seen = [];
  for (let i = 0; i < 8; i++) seen.push(...G.boardTips([person(G, "a", "甲", {})], null, G.boardWeekOf(RUN + i * 7 * 86400000)));
  assert.ok(seen.includes(`週章存到 ${G.NUM.shop.gearPrice.common} 枚可以換第壹件裝備，到選單的「兌換所」看看。`), JSON.stringify(seen));
  const words = Object.values(G.BOARD_TEXT.tips).concat(Object.values(G.BOARD_TEXT.nudges));
  words.forEach(t => assert.ok(!t.includes("一"), t));
});
T("小提醒：只講快到了、做到了；一人一條；最多 3 條；不點名誰最後；不公開不該公開的", G => {
  const wk = week(G);
  const people = [
    { uid: "a", nick: "快全勤", stats: G.boardStatsOf(secretSave(G, { sign: 5, gear: true }), wk) },
    { uid: "b", nick: "簽滿了", stats: G.boardStatsOf(secretSave(G, { sign: 7, gear: true }), wk) },
    { uid: "c", nick: "簽很少", stats: G.boardStatsOf(secretSave(G, { sign: 1, gear: true }), wk) },
    { uid: "d", nick: "快換裝", stats: G.boardStatsOf(secretSave(G, { balance: 3 }), wk) },
    { uid: "e", nick: "走更深", stats: G.boardStatsOf(secretSave(G, { deepest: 3, gear: true }), wk) },
  ];
  const n = J(G.boardNudges(people, { a: {}, b: {}, c: {}, d: {}, e: { deepest: 1 } }, wk));
  assert.ok(n.length <= G.NUM.board.nudgesMax);
  assert.strictEqual(new Set(n.map(x => x.nick)).size, n.length);
  const byName = Object.fromEntries(n.map(x => [x.nick, x.text]));
  assert.ok(!byName.簽很少 && !byName.簽滿了, "簽很少的不點名");
  assert.strictEqual(byName.快全勤, "只差 2 天就全勤了，新的壹週再挑戰！");
  assert.strictEqual(byName.快換裝, `再 ${G.NUM.shop.gearPrice.common - 3} 枚週章就能換第壹件裝備。`);
  assert.strictEqual(byName.走更深, "這週走到了 B3，比之前更深，恭喜！");
  assert.ok(!PRIVATE_WORDS.test(JSON.stringify(n)));
  assert.strictEqual(J(G.boardNudges(people.slice(1, 3), null, wk)).length, 0, "沒人快到就不硬寫");
});

// ---------- 給玩家看的文件 ----------
T("給玩家看的文件和公告：沒有 uid、email、存檔內容；uid 只在快照", G => {
  const wk = week(G);
  const uid = "uid-祕密-12345";
  const raw = JSON.parse(secretSave(G, { codex: 3, sign: 5 }));
  raw.email = FAKE_EMAIL; raw.profiles.challenge.email = FAKE_EMAIL;
  const people = G.boardPeopleOf({ members: [{ uid, nick: "小明", email: FAKE_EMAIL, joinedAt: 1 }], saves: { [uid]: JSON.stringify(raw) } }, wk);
  const r = G.boardCompute(people, null, wk);
  const pub = JSON.stringify(J(r.doc)) + G.boardDiscordText(r.doc, footer(), MAX);
  assert.ok(!pub.includes(uid)); assert.ok(!pub.includes(FAKE_EMAIL));
  PRIVATE_VALUES.forEach(v => assert.ok(!pub.includes(String(v))));
  assert.ok(pub.includes("小明"));
  assert.ok(JSON.stringify(J(r.snapshot)).includes(uid));
  assert.deepStrictEqual(Object.keys(J(r.snapshot).people[uid]).sort(), ["books", "codex", "deepest", "hall"], "快照只有累計數字");
  assert.ok(!JSON.stringify(J(r.snapshot)).includes(FAKE_EMAIL));
  assert.strictEqual(JSON.stringify(J(r.doc)), JSON.stringify(J(JSON.parse(JSON.stringify(J(r.doc))))), "沒有 undefined（Firestore 不收）");
});
T("讀回來的文件：壞的回傳 null；認不得的榜拿掉；亂寫的欄位不會壞", G => {
  [null, 5, [], {}, { week: 3 }].forEach(d => assert.strictEqual(G.boardViewOf(d), null));
  const v = J(G.boardViewOf({ week: "2026-W46", boards: [{ id: "不認得", rows: [{ rank: 1 }] }, { id: "codex", rows: [{ rank: 1, nick: 5, value: "x" }, null, { rank: 0, nick: "沒名次" }] }, 3], tips: ["好", 5], nudges: [{ nick: "甲", text: "加油" }, { nick: "乙" }, 7] }));
  assert.deepStrictEqual(v.boards.map(b => b.id), ["codex"]);
  assert.deepStrictEqual(v.boards[0].rows, [{ rank: 1, nick: "館友", value: 0 }]);
  assert.deepStrictEqual(v.tips, ["好"]);
  assert.deepStrictEqual(v.nudges, [{ nick: "甲", text: "加油" }]);
  assert.strictEqual(G.boardDiscordText(null, "x"), "");
});

// ---------- 假的 Firestore ----------
function fakeDb(seed = {}) {
  const docs = new Map(Object.entries(seed).map(([k, v]) => [k, J(v)]));
  const snap = (id, v) => ({ id, exists: v !== undefined, data: () => J(v) });
  const ref = p => ({
    get: async () => snap(p.split("/").pop(), docs.get(p)),
    set: async (d, o) => { docs.set(p, o && o.merge ? Object.assign({}, docs.get(p), J(d)) : J(d)); },
  });
  return {
    docs, writes: 0,
    doc: ref,
    collection(name) { return { get: async () => ({ docs: [...docs.entries()].filter(([k]) => k.startsWith(name + "/") && k.split("/").length === 2).map(([k, v]) => snap(k.split("/")[1], v)) }) }; },
    batch() {
      const ops = [], self = this;
      return { set(r, d, o) { ops.push([r, d, o]); }, async commit() { self.writes++; for (const [r, d, o] of ops) await r.set(d, o); } };
    },
  };
}
const quiet = () => { const lines = []; return { lines, log: s => lines.push(String(s)), warn: s => lines.push(String(s)) }; };
const DISCORD = { DISCORD_BOT_TOKEN: "假金鑰", DISCORD_CHANNEL_ID: "123" };
const okFetch = sent => async (url, o) => { sent.push(JSON.parse(o.body).content); return { ok: true }; };
const seedOf = G => ({
  "members/uid-a": { nick: "甲", invisible: false, email: FAKE_EMAIL },
  "members/uid-b": { nick: "乙", invisible: true },
  "saves/uid-a": { data: saveOf(G, { codex: 4, sign: 7 }), rev: 1 },
  "saves/uid-b": { data: saveOf(G, { codex: 2 }), rev: 1 },
});
const run = (G, db, o = {}) => { const q = quiet(); return runWeekly(Object.assign({ db, board: G, opts: { now: RUN }, env: {}, log: q.log, warn: q.warn, floorOf: () => 1 }, o)).then(r => Object.assign(r, { lines: q.lines })); };

const LIVE_WED = Date.parse("2026-11-18T01:00:00Z"); // 台灣週三，W47 進行中
const daily = (G, db, o = {}) => { const q = quiet(); return runDaily({ db, board: G, opts: Object.assign({ now: LIVE_WED }, o), log: q.log, floorOf: () => 1 }).then(r => Object.assign(r, { lines: q.lines })); };
T("每天更新：只寫 boards/latest，標 live，沒有建議和提醒，不碰週快照", async G => {
  const db = fakeDb(seedOf(G));
  const r = await daily(G, db);
  assert.strictEqual(r.status, "updated");
  assert.strictEqual(r.week, "2026-W47");
  const latest = db.docs.get("boards/latest");
  assert.strictEqual(latest.live, true); assert.strictEqual(latest.week, "2026-W47");
  assert.deepStrictEqual([latest.tips, latest.nudges], [[], []]);
  assert.strictEqual(db.docs.has("boards/2026-W47"), false);
  assert.strictEqual(db.docs.has("boards/2026-W47/private/people"), false);
  const pub = JSON.stringify(latest) + r.lines.join("\n");
  assert.ok(!pub.includes("uid-")); assert.ok(!pub.includes(FAKE_EMAIL));
  const v = G.boardViewOf(latest);
  assert.strictEqual(v.live, true); assert.ok(G.boardPeriodText(v).endsWith("（目前）"));
  assert.strictEqual(G.boardViewOf({ week: "2026-W46", boards: [] }).live, false);
});
T("每天更新：週壹跳過，加 force 才算；只印不寫；之後週壹的正式結算照常", async G => {
  const db = fakeDb(seedOf(G)), sent = [];
  assert.strictEqual((await daily(G, db, { now: RUN })).status, "monday");
  assert.strictEqual(db.docs.has("boards/latest"), false);
  assert.strictEqual((await daily(G, db, { dryRun: true })).status, "dry");
  assert.strictEqual(db.docs.has("boards/latest"), false);
  assert.strictEqual((await daily(G, db, { now: RUN, force: true })).status, "updated");
  assert.strictEqual(db.docs.get("boards/latest").live, true);
  const r = await run(G, db, { env: DISCORD, fetcher: okFetch(sent) });
  assert.strictEqual(r.status, "posted");
  assert.strictEqual(sent.length, 1);
  assert.notStrictEqual(db.docs.get("boards/latest").live, true, "正式結算蓋回去");
});
T("每天更新：沒人有進度就留著原本的榜；排程和手動的判斷", async G => {
  const db = fakeDb({ "boards/latest": { week: "2026-W46", boards: [] } });
  assert.strictEqual((await daily(G, db)).status, "empty");
  assert.strictEqual(db.docs.get("boards/latest").week, "2026-W46");
  assert.ok(isDaily({ daily: "true" }) && isDaily({ daily: true }) && isDaily({}, ["--daily"]) && isDaily({}, [], "35 21 * * *"));
  assert.ok(!isDaily({ daily: "false" }) && !isDaily({}, [], "15 21 * * 0") && !isDaily(undefined));
});
T("正常的一次：快照先寫、發一則、記 posted；再跑不發第二次", async G => {
  const db = fakeDb(seedOf(G)), sent = [];
  const r = await run(G, db, { env: DISCORD, fetcher: okFetch(sent) });
  assert.strictEqual(r.status, "posted");
  assert.strictEqual(sent.length, 1);
  assert.ok(sent[0].includes("本週榜單")); assert.ok(sent[0].endsWith(footer()));
  const pub = db.docs.get("boards/2026-W46"), latest = db.docs.get("boards/latest"), priv = db.docs.get("boards/2026-W46/private/people");
  assert.strictEqual(pub.posted, true); assert.strictEqual(latest.posted, true); assert.strictEqual(pub.postedAt, RUN);
  assert.deepStrictEqual(Object.keys(priv.people).sort(), ["uid-a", "uid-b"]);
  const r2 = await run(G, db, { env: DISCORD, fetcher: okFetch(sent) });
  assert.strictEqual(r2.status, "already");
  assert.strictEqual(sent.length, 1);
});
T("給玩家讀的那兩份沒有 uid、email；紀錄也沒有", async G => {
  const db = fakeDb(seedOf(G));
  const r = await run(G, db);
  const pub = JSON.stringify(db.docs.get("boards/2026-W46")) + JSON.stringify(db.docs.get("boards/latest"));
  assert.ok(!pub.includes("uid-")); assert.ok(!pub.includes(FAKE_EMAIL));
  const logs = r.lines.join("\n");
  assert.ok(!logs.includes("uid-")); assert.ok(!logs.includes(FAKE_EMAIL)); assert.ok(!logs.includes("profiles"), "沒有存檔內容");
});
T("Discord 還沒放：快照照寫，posted 是 false；放了之後再跑，用同一份榜單補發", async G => {
  const db = fakeDb(seedOf(G));
  const r = await run(G, db, { env: {} });
  assert.strictEqual(r.status, "skip");
  assert.strictEqual(db.docs.get("boards/2026-W46").posted, false);
  assert.ok(db.docs.get("boards/2026-W46/private/people"));
  const first = JSON.stringify(db.docs.get("boards/2026-W46").boards);
  db.docs.set("saves/uid-a", { data: saveOf(G, { codex: 40, sign: 7 }), rev: 2 }); // 後來又玩了
  const sent = [];
  const r2 = await run(G, db, { env: DISCORD, fetcher: okFetch(sent) });
  assert.strictEqual(r2.status, "posted");
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(JSON.stringify(db.docs.get("boards/2026-W46").boards), first, "數字是當時的");
  assert.ok(sent[0].includes("甲　4 格"), sent[0]);
});
T("Discord 發失敗：快照照寫，回報 failed，錯誤訊息沒有金鑰；再跑會補發", async G => {
  const db = fakeDb(seedOf(G));
  const r = await run(G, db, { env: DISCORD, fetcher: async () => ({ ok: false, status: 500, text: async () => "壞了" }) });
  assert.strictEqual(r.status, "failed");
  assert.strictEqual(db.docs.get("boards/2026-W46").posted, false);
  assert.ok(!r.lines.join("\n").includes("假金鑰"));
  assert.ok(db.docs.get("boards/latest"), "遊戲裡看得到");
  const sent = [];
  assert.strictEqual((await run(G, db, { env: DISCORD, fetcher: okFetch(sent) })).status, "posted");
});
T("只印不發：什麼都不寫、不發", async G => {
  const db = fakeDb(seedOf(G));
  let called = false;
  const r = await run(G, db, { opts: { now: RUN, dryRun: true }, env: DISCORD, fetcher: async () => { called = true; return { ok: true }; } });
  assert.strictEqual(r.status, "dry");
  assert.ok(r.text.includes("本週榜單"));
  assert.ok(r.lines.join("\n").includes("本週榜單"));
  assert.strictEqual(called, false);
  assert.strictEqual(db.writes, 0);
  assert.ok(!db.docs.has("boards/2026-W46"));
});
T("強制：發過了也重算、再發一次", async G => {
  const db = fakeDb(seedOf(G)), sent = [];
  await run(G, db, { env: DISCORD, fetcher: okFetch(sent) });
  db.docs.set("saves/uid-a", { data: saveOf(G, { codex: 9, sign: 7 }), rev: 2 });
  const r = await run(G, db, { opts: { now: RUN, force: true }, env: DISCORD, fetcher: okFetch(sent) });
  assert.strictEqual(r.status, "posted");
  assert.strictEqual(sent.length, 2);
  assert.ok(sent[1].includes("甲　9 格"), sent[1]);
});
T("強制但 Discord 壞了：還是記得發過", async G => {
  const db = fakeDb(seedOf(G)), sent = [];
  await run(G, db, { env: DISCORD, fetcher: okFetch(sent) });
  const r = await run(G, db, { opts: { now: RUN, force: true }, env: DISCORD, fetcher: async () => { throw new Error("斷線"); } });
  assert.strictEqual(r.status, "failed");
  assert.strictEqual(db.docs.get("boards/2026-W46").posted, true);
});
T("沒有人有進度：快照照寫（下週才有得減），不發", async G => {
  const db = fakeDb({ "members/uid-a": { nick: "甲" }, "saves/uid-a": { data: saveOf(G, {}), rev: 1 }, "members/uid-b": { nick: "乙" } });
  let called = false;
  const r = await run(G, db, { env: DISCORD, fetcher: async () => { called = true; return { ok: true }; } });
  assert.strictEqual(r.status, "empty");
  assert.strictEqual(called, false);
  assert.strictEqual(db.docs.get("boards/2026-W46").empty, true);
  assert.ok(db.docs.get("boards/2026-W46/private/people").people["uid-a"]);
  assert.strictEqual((await run(G, db, { env: DISCORD, fetcher: async () => { called = true; return { ok: true }; } })).status, "empty", "再跑也不發");
  assert.strictEqual(called, false);
});
T("下一週：跟上週的快照相減", async G => {
  const db = fakeDb(seedOf(G));
  await run(G, db);
  assert.strictEqual(db.docs.get("boards/2026-W46").first, true);
  db.docs.set("saves/uid-a", { data: saveOf(G, { codex: 7 }), rev: 2 });
  const sent = [];
  const r = await run(G, db, { opts: { now: RUN + 7 * 86400000 }, env: DISCORD, fetcher: okFetch(sent) });
  assert.strictEqual(r.week, "2026-W47");
  const d = db.docs.get("boards/2026-W47");
  assert.strictEqual(d.first, false);
  assert.deepStrictEqual(d.boards.find(b => b.id === "codex").rows, [{ rank: 1, nick: "甲", value: 3 }]);
  assert.strictEqual(db.docs.get("boards/latest").week, "2026-W47");
});
T("手動的選項：事件檔的字串、命令列；排程沒有選項", () => {
  assert.deepStrictEqual(parseOptions({ dry_run: "true", force: "false" }), { dryRun: true, force: false });
  assert.deepStrictEqual(parseOptions({ dry_run: false, force: true }), { dryRun: false, force: true });
  assert.deepStrictEqual(parseOptions(undefined, []), { dryRun: false, force: false });
  assert.deepStrictEqual(parseOptions({}, ["--dry-run", "--force"]), { dryRun: true, force: true });
});
T("週包的新房間：只拿樓層；真的週包讀得到；沒有週包、亂寫的週都是 null", () => {
  assert.strictEqual(newRoomFloor("2026-W46"), 1);
  assert.strictEqual(newRoomFloor("2099-W01"), null);
  assert.strictEqual(newRoomFloor("../../package"), null);
});
T("workflow：金鑰的做法跟 firebase-task 一樣；Discord 壞了快照還是寫", () => {
  const y = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "weekly-board.yml"), "utf8");
  assert.ok(y.includes("if: always()")); assert.ok(y.includes('rm -f "$RUNNER_TEMP/sa.json"'));
  assert.ok(y.includes("workflow_dispatch")); assert.ok(y.includes("dry_run:")); assert.ok(y.includes("force:"));
  assert.ok(!/\$\{\{\s*(github\.event\.)?inputs\./.test(y), "手動的選項不直接寫進 workflow");
  assert.ok(/permissions:\s*\n\s*contents: read/.test(y));
});
T("規則：館友可以讀 boards、不能寫；其他沒放寬", () => {
  const r = fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8");
  const m = /match \/boards\/\{week\} \{([\s\S]*?)\n    \}/.exec(r);
  assert.ok(m);
  assert.ok(m[1].includes("allow read: if isMember();"));
  assert.ok(m[1].includes("allow write: if false;"));
  assert.ok(!m[1].includes("{document=**}"), "不開子文件：累計數字讀不到");
  assert.ok(/match \/saves\/\{uid\} \{\s*allow read: if isMember\(\) && isMe\(uid\);/.test(r), "存檔還是只有自己讀得到");
});

T("真的跑的時候：tools/weekly_board.cjs 叫的 board.xxx 都拿得到（load_shared 串在一起看不出來，11-09 上線時才發現少 nowMs）", async () => {
  const b = await require("../tools/weekly_board.cjs").loadBoard();
  const src = fs.readFileSync(path.join(__dirname, "..", "tools", "weekly_board.cjs"), "utf8");
  const names = [...new Set([...src.matchAll(/\bboard\.([a-zA-Z]+)\(/g)].map(m => m[1]))];
  assert.ok(names.includes("nowMs") && names.length >= 4, names.join());
  for (const n of names) assert.strictEqual(typeof b[n], "function", n);
  assert.ok(b.boardWeekOf(b.nowMs()));
});

// ---------- 十二個榜：賭場的六個（決定 0054）----------
// 賭場錢包（casinoWallets/{uid}.data）。over：{ wins, busts, net, sent, econ, ach（幾個成就）, chips }
const walletOf = (G, over = {}) => {
  const w = G.casWalletNew();
  Object.assign(w.st, { wins: over.wins || 0, busts: over.busts || 0, net: over.net || 0, hands: (over.wins || 0) + (over.busts || 0) });
  w.lv = { day: WED, n: 0, sent: 0, got: 0, sentAll: over.sent || 0, gotAll: 0, times: 0 };
  w.ec = { day: WED, n: 0, wins: over.econ || 0, fails: 0, loot: 0, rescues: 0 };
  for (let i = 0; i < (over.ach || 0); i++) w.ach["old:a:t" + i] = { d: WED, name: "成就" + i };
  if (over.chips != null) w.chips = over.chips;
  return JSON.stringify(w);
};
const casPeople = (G, list) => G.boardPeopleOf({ members: list.map(([uid, nick], i) => ({ uid, nick, joinedAt: i + 1 })), saves: Object.fromEntries(list.map(([uid]) => [uid, saveOf(G, { codex: 1 })])), wallets: Object.fromEntries(list.filter(x => x[2] !== undefined).map(([uid, , raw]) => [uid, raw])) }, week(G));
const CAS_IDS = ["table", "ach", "donate", "bust", "econ", "god"];
const base1 = { cas: 1, people: { a: { cas: { wins: 10, busts: 2, net: 1000, ach: 3, sent: 500, econ: 1 } }, b: { cas: { wins: 4, busts: 9, net: 5000, ach: 6, sent: 0, econ: 7 } } } };

T("十二個榜：BOARD_DEFS 有 12 個，新的 6 個是牌桌王、成就王、斗內王、爆牌王、拚經濟王、賭神，文字有好笑的說明", G => {
  assert.strictEqual(G.BOARD_DEFS.length, 12);
  assert.deepStrictEqual(J(G.BOARD_DEFS.slice(6).map(d => d.id)), CAS_IDS);
  assert.deepStrictEqual(J(G.BOARD_DEFS.slice(6).map(d => d.title)), ["牌桌王", "成就王", "斗內王", "爆牌王", "拚經濟王", "賭神"]);
  assert.ok(G.BOARD_DEFS.find(d => d.id === "bust").sub.includes("最敢要牌"));
  G.BOARD_DEFS.forEach(d => { assert.ok(!(d.title + (d.sub || "")).includes("一"), "介面文字用壹：" + d.title); });
  ["最窮", "墊底", "最慘"].forEach(w => assert.ok(!JSON.stringify(G.BOARD_DEFS).includes(w)));
});
T("賭場榜的數字：週增量＝現在累計 − 上週快照；成就王不相減；賭神看淨贏", G => {
  const people = casPeople(G, [["a", "甲", walletOf(G, { wins: 15, busts: 5, net: 1800, ach: 4, sent: 2500, econ: 3 })], ["b", "乙", walletOf(G, { wins: 6, busts: 10, net: 4000, ach: 9, sent: 100, econ: 7 })]]);
  const r = G.boardCompute(people, base1, week(G));
  assert.deepStrictEqual(rows(r.doc, "table"), [{ rank: 1, nick: "甲", value: 5 }, { rank: 2, nick: "乙", value: 2 }]);
  assert.deepStrictEqual(rows(r.doc, "ach"), [{ rank: 1, nick: "乙", value: 9 }, { rank: 2, nick: "甲", value: 4 }], "累計");
  assert.deepStrictEqual(rows(r.doc, "donate"), [{ rank: 1, nick: "甲", value: 2000 }, { rank: 2, nick: "乙", value: 100 }]);
  assert.deepStrictEqual(rows(r.doc, "bust"), [{ rank: 1, nick: "甲", value: 3 }, { rank: 2, nick: "乙", value: 1 }]);
  assert.deepStrictEqual(rows(r.doc, "econ"), [{ rank: 1, nick: "甲", value: 2 }], "乙 7 → 7 沒有增加，不上榜");
  assert.deepStrictEqual(rows(r.doc, "god"), [{ rank: 1, nick: "甲", value: 800 }], "乙淨贏變少（5000 → 4000）不上榜");
  assert.strictEqual(r.doc.casFirst, false);
  assert.strictEqual(r.snapshot.cas, 1);
  assert.deepStrictEqual(J(r.snapshot).people.a.cas, { wins: 15, busts: 5, net: 1800, ach: 4, sent: 2500, econ: 3 });
  assert.strictEqual(J(r.snapshot).people.a.codex, 1, "原本的累計還在");
  assert.strictEqual(G.boardValueText("donate", 2000), "2,000 籌碼");
  assert.strictEqual(G.boardValueText("god", 12345678), "1234.56 萬 籌碼");
  assert.strictEqual(G.boardValueText("table", 5), "5 手");
  assert.strictEqual(G.boardValueText("ach", 9), "9 個");
  assert.strictEqual(G.boardValueText("bust", 3), "3 次");
});
T("第一週沒有基準：賭場的週榜是空的，不把累計全當本週；成就王列累計；文字不說謊；下一週有基準", G => {
  const wallets = [["a", "甲", walletOf(G, { wins: 500, busts: 90, net: 9e6, ach: 5, sent: 7e6, econ: 40 })]];
  [null, { people: { a: { codex: 1, books: 0, hall: 0, deepest: 0 } } }, { cas: 0, people: {} }].forEach(prev => {
    const r = G.boardCompute(casPeople(G, wallets), prev, week(G));
    ["table", "donate", "bust", "econ", "god"].forEach(id => assert.deepStrictEqual(rows(r.doc, id), [], id));
    assert.deepStrictEqual(rows(r.doc, "ach"), [{ rank: 1, nick: "甲", value: 5 }]);
    assert.strictEqual(r.doc.casFirst, true);
    assert.strictEqual(r.snapshot.cas, 1, "這次的快照就是下週的基準");
    const text = G.boardDiscordText(r.doc, footer(), MAX), dc = G.dcBoardText(r.doc);
    assert.ok(!/【(牌桌王|賭神|爆牌王|斗內王|拚經濟王)】/.test(text) && !/【(牌桌王|賭神|爆牌王|斗內王|拚經濟王)】/.test(dc), "沒有數字就不列");
    assert.ok(text.includes("下週壹起才有本週的數字") && dc.includes("下週壹起才有本週的數字"));
    assert.ok(text.includes("成就王") && text.includes("5 個"));
    // 下一週：快照有基準，這週多的才算
    const nextWallets = [["a", "甲", walletOf(G, { wins: 503, busts: 90, net: 9e6 + 300, ach: 5, sent: 7e6 + 50, econ: 42 })]];
    const r2 = G.boardCompute(casPeople(G, nextWallets), J(r.snapshot), week(G));
    assert.strictEqual(r2.doc.casFirst, false);
    assert.deepStrictEqual([rows(r2.doc, "table")[0].value, rows(r2.doc, "donate")[0].value, rows(r2.doc, "econ")[0].value, rows(r2.doc, "god")[0].value], [3, 50, 2, 300]);
    assert.deepStrictEqual(rows(r2.doc, "bust"), [], "沒爆牌就不上榜");
  });
});
T("有基準那週：新進賭場的人從 0 算；快照裡的壞基準當沒有基準", G => {
  const prev = { cas: 1, people: { a: { cas: { wins: 10, busts: 0, net: 0, ach: 0, sent: 0, econ: 0 } }, x: { cas: { bad: 1 } } } };
  const people = casPeople(G, [["a", "甲", walletOf(G, { wins: 10 })], ["n", "新人", walletOf(G, { wins: 4, busts: 2, net: 300 })], ["x", "壞基準", walletOf(G, { wins: 999, net: 99999 })]]);
  const r = G.boardCompute(people, prev, week(G));
  assert.deepStrictEqual(rows(r.doc, "table"), [{ rank: 1, nick: "新人", value: 4 }]);
  assert.deepStrictEqual(rows(r.doc, "god"), [{ rank: 1, nick: "新人", value: 300 }]);
});
T("賭神：淨贏負的、剛好 0 的不上榜；舊錢包、大禮包、餐車的大額不算（只看每一手的輸贏）", G => {
  const prev = { cas: 1, people: {} };
  const people = casPeople(G, [
    ["a", "輸家", walletOf(G, { wins: 3, net: -5000 })],
    ["b", "平手", walletOf(G, { wins: 3, net: 0 })],
    ["c", "有大錢包", walletOf(G, { net: 0, chips: 5e9 })], // 籌碼很多（舊錢包認領、大禮包），但沒有贏的紀錄
    ["d", "小贏", walletOf(G, { wins: 1, net: 200, chips: 10 })],
  ]);
  const r = G.boardCompute(people, prev, week(G));
  assert.deepStrictEqual(rows(r.doc, "god"), [{ rank: 1, nick: "小贏", value: 200 }]);
  // 真的結算：一勝一負（爆牌）→ wins 1、busts 1、net 0；認領舊錢包不動 net
  const w = G.casWalletFix(G.casWalletNew(), WED), house = G.casHouseNew();
  const hand = (kind, why, net, bet) => G.casSettle(w, house, { bet, out: { kind, why, net, payout: bet + net }, settled: false }, { day: WED, withOthers: false });
  hand("win", "", 100, 100); hand("lose", "bust", -100, 100);
  w.chips += 1e8; // 大禮包、舊錢包
  const c = G.boardCasOf(JSON.stringify(w));
  assert.deepStrictEqual([c.ok, c.has, c.wins, c.busts, c.net], [true, true, 1, 1, 0]);
});
T("爆牌王：只有玩過而且爆過才上榜；同桌贏的手也算進牌桌王（結算同一個函式）", G => {
  const w = G.casWalletFix(G.casWalletNew(), WED), house = G.casHouseNew();
  G.casSettle(w, house, { bet: 100, out: { kind: "win", why: "", net: 100, payout: 200 }, settled: false }, { day: WED, withOthers: true });
  const c = G.boardCasOf(JSON.stringify(w));
  assert.deepStrictEqual([c.wins, c.busts], [1, 0]);
  const people = casPeople(G, [["a", "甲", JSON.stringify(w)], ["b", "沒玩過", walletOf(G, {})], ["c", "沒錢包"]]);
  const r = G.boardCompute(people, { cas: 1, people: {} }, week(G));
  assert.deepStrictEqual(rows(r.doc, "bust"), []);
  assert.deepStrictEqual(rows(r.doc, "table").map(x => x.nick), ["甲"]);
});
T("壞錢包、沒有錢包：不丟錯、不上榜、別人照算、累計留上週的", G => {
  const bad = ["{壞掉", "[]", "5", "null", '{"st":5,"lv":"x","ec":[],"ach":7}', '{"st":{"wins":"很多","busts":-9,"net":"x"},"lv":{"sentAll":1e300},"ec":{"wins":1e999},"ach":{"a":1,"b":null}}'];
  bad.forEach(raw => { const c = G.boardCasOf(raw); assert.ok(c && typeof c.ok === "boolean", raw); });
  assert.deepStrictEqual(J(G.boardCasOf("[]")), { ok: false });
  const huge = G.boardCasOf(bad[5]);
  assert.ok(huge.ok && huge.wins === 0 && huge.busts === 0 && huge.net === 0 && huge.sent === G.NUM.board.chipCap && huge.econ === 0 && huge.ach === 0, JSON.stringify(huge));
  const list = bad.map((raw, i) => ["bad" + i, "壞" + i, raw]).concat([["good", "好", walletOf(G, { wins: 5 })], ["none", "沒錢包"]]);
  const prev = { cas: 1, people: { bad0: { cas: { wins: 1, busts: 0, net: 0, ach: 0, sent: 0, econ: 0 } }, good: { cas: { wins: 1, busts: 0, net: 0, ach: 0, sent: 0, econ: 0 } } } };
  const r = G.boardCompute(casPeople(G, list), prev, week(G));
  assert.deepStrictEqual(rows(r.doc, "table"), [{ rank: 1, nick: "好", value: 4 }]);
  assert.ok(r.casUnreadable >= 3);
  assert.deepStrictEqual(J(r.snapshot).people.bad0.cas, { wins: 1, busts: 0, net: 0, ach: 0, sent: 0, econ: 0 }, "讀不了的留上週的");
  assert.deepStrictEqual(J(r.snapshot).people.bad2.cas, { bad: 1 }, "上週也沒有的，標壞基準");
  assert.ok(!(J(r.snapshot).people.none || {}).cas, "沒進過賭場的人，快照裡沒有賭場欄位");
  // 沒有 wallets 這個欄位（舊的呼叫方式）：賭場的榜是空的、快照沒有 cas 記號
  const old = G.boardCompute(G.boardPeopleOf({ members: [{ uid: "a", nick: "甲", joinedAt: 1 }], saves: { a: saveOf(G, { codex: 2 }) } }, week(G)), null, week(G));
  CAS_IDS.forEach(id => assert.deepStrictEqual(rows(old.doc, id), []));
  assert.strictEqual(old.snapshot.cas, undefined); assert.strictEqual(old.doc.casFirst, false);
});
T("沒進過賭場的人不上賭場榜，也不影響原本的六個榜；錢包的人沒有存檔也不會壞", G => {
  const wk = week(G);
  const people = G.boardPeopleOf({ members: [{ uid: "a", nick: "甲", joinedAt: 1 }, { uid: "b", nick: "乙", joinedAt: 2 }], saves: { a: saveOf(G, { codex: 4 }) }, wallets: { b: walletOf(G, { wins: 9, net: 10, ach: 2 }) } }, wk);
  const r = G.boardCompute(people, { cas: 1, people: {} }, wk);
  assert.deepStrictEqual(rows(r.doc, "codex").map(x => x.nick), ["甲"]);
  assert.deepStrictEqual(rows(r.doc, "table").map(x => x.nick), ["乙"]);
  assert.ok(!rows(r.doc, "table").concat(rows(r.doc, "ach")).some(x => x.nick === "甲"));
});
T("12 個榜的 Discord 公告不超過 2000 字，敬啟和連結都在；同分很多人也一樣", G => {
  const mk = (n, nickLen, same) => {
    const list = Array.from({ length: n }, (_, i) => ["u" + i, "暱".repeat(nickLen - 1) + (i % 10), walletOf(G, { wins: (same ? 9 : 5 + i) + 3, busts: (same ? 9 : 2 + i) + 1, net: (same ? 777 : 100 * (i + 1)) + 1, ach: same ? 8 : 1 + i, sent: (same ? 5e6 : 1e6 * (i + 1)) + 1, econ: (same ? 4 : 1 + i) + 1 })]);
    const prev = { cas: 1, people: Object.fromEntries(list.map(([uid]) => [uid, { cas: { wins: 3, busts: 1, net: 1, ach: 0, sent: 1, econ: 1 } }])) };
    const people = G.boardPeopleOf({ members: list.map(([uid, nick], i) => ({ uid, nick, joinedAt: i + 1 })), saves: Object.fromEntries(list.map(([uid]) => [uid, saveOf(G, { codex: 5, deepest: 3, sign: 7, read: 2, stamps: 3 })])), wallets: Object.fromEntries(list.map(([uid, , raw]) => [uid, raw])) }, week(G));
    return G.boardCompute(people, Object.assign(prev, { people: Object.fromEntries(Object.entries(prev.people).map(([k, v]) => [k, Object.assign({ codex: 0, books: 0, hall: 0, deepest: 0 }, v)])) }), week(G)).doc;
  };
  const ends = footer();
  [[3, 12, false], [8, 12, false], [8, 12, true], [40, 12, true]].forEach(([n, len, same]) => {
    const doc = mk(n, len, same);
    CAS_IDS.concat(["codex", "deep"]).forEach(id => assert.ok(boardOf(doc, id).rows.length > 0, id));
    const text = G.boardDiscordText(doc, ends, MAX);
    assert.ok(text.length <= MAX, `${n} 人 ${same ? "同分" : ""}：${text.length}`);
    assert.ok(text.endsWith(`館長室 敬啟\n\n${ends}`));
    assert.ok(text.includes(SITE));
    const dc = G.dcBoardText(doc);
    assert.ok(dc.length <= 2000, `/pepe-排行榜 ${n} 人：${dc.length}`);
    assert.ok(dc.endsWith(G.DC_TEXT.boardFoot));
    assert.ok(!/@|<|evil/.test(text + dc));
  });
  // 一般的狀況（每個榜 3 名）沒有被收：十二個榜都完整，建議還在
  const normal = G.boardDiscordText(mk(3, 4, false), ends, MAX);
  ["牌桌王", "成就王", "斗內王", "爆牌王", "拚經濟王", "賭神", "館長室的建議"].forEach(s => assert.ok(normal.includes(s), s));
  assert.ok(normal.includes("本週最敢要牌"));
  assert.ok(G.dcBoardText(mk(3, 4, false)).includes("本週最敢要牌"));
});
T("給玩家看的文件、公告、/pepe-排行榜：賭場榜也沒有 uid、email、錢包內容", G => {
  const uid = "uid-祕密-98765";
  const raw = JSON.parse(walletOf(G, { wins: 8, busts: 3, net: 500, ach: 2, sent: 300, econ: 2 }));
  raw.email = FAKE_EMAIL; raw.discordId = "123456789012345678"; raw.lv.secret = "祕密籌碼";
  const people = G.boardPeopleOf({ members: [{ uid, nick: "小明", email: FAKE_EMAIL, joinedAt: 1 }], saves: { [uid]: saveOf(G, { codex: 1 }) }, wallets: { [uid]: JSON.stringify(raw) } }, week(G));
  const r = G.boardCompute(people, { cas: 1, people: {} }, week(G));
  const pub = JSON.stringify(J(r.doc)) + G.boardDiscordText(r.doc, footer(), MAX) + G.dcBoardText(r.doc);
  assert.ok(!pub.includes(uid) && !pub.includes(FAKE_EMAIL) && !pub.includes("123456789012345678") && !pub.includes("祕密"));
  assert.ok(pub.includes("小明") && pub.includes("牌桌王"));
  assert.ok(!/理智|怪癖|靈感/.test(JSON.stringify(G.BOARD_DEFS)));
  assert.deepStrictEqual(Object.keys(J(r.snapshot).people[uid].cas).sort(), ["ach", "busts", "econ", "net", "sent", "wins"], "快照只有累計數字");
  assert.ok(!JSON.stringify(J(r.snapshot)).includes(FAKE_EMAIL));
  assert.strictEqual(JSON.stringify(J(r.doc)), JSON.stringify(J(JSON.parse(JSON.stringify(J(r.doc))))), "沒有 undefined");
});
T("讀回來的賭場榜：數字上限、舊的只有 6 個榜的文件也讀得出來", G => {
  const v = J(G.boardViewOf({ week: "2026-W46", boards: [{ id: "god", rows: [{ rank: 1, nick: "甲", value: 5e11 }, { rank: 2, nick: "乙", value: 1e20 }] }, { id: "table", rows: [{ rank: 1, nick: "甲", value: 50000 }] }] }));
  assert.deepStrictEqual(v.boards.find(b => b.id === "god").rows.map(r => r.value), [5e11, G.NUM.board.chipCap]);
  assert.strictEqual(v.boards.find(b => b.id === "table").rows[0].value, 50000);
  assert.strictEqual(v.boards.find(b => b.id === "god").sub, "本週 21 點淨賺最多籌碼");
  assert.deepStrictEqual(J(G.boardViewOf({ week: "2026-W46", boards: [] }).boards), []);
  assert.strictEqual(G.boardViewOf({ week: "2026-W46", boards: [] }).casFirst, false);
});
const walletSeed = G => ({
  "members/uid-a": { nick: "甲" }, "members/uid-b": { nick: "乙" }, "members/uid-c": { nick: "沒賭場" },
  "saves/uid-a": { data: saveOf(G, { codex: 4 }), rev: 1 }, "saves/uid-b": { data: saveOf(G, { codex: 2 }), rev: 1 }, "saves/uid-c": { data: saveOf(G, { codex: 1 }), rev: 1 },
  "casinoWallets/uid-a": { data: walletOf(G, { wins: 20, busts: 4, net: 900, ach: 3, sent: 1000, econ: 2 }), rev: 1 },
  "casinoWallets/uid-b": { data: "{壞掉", rev: 1 },
});
T("跑起來（假 Firestore）：週一先寫沒有基準的快照，下一週才有賭場的週榜；每天更新用同一份快照", async G => {
  const db = fakeDb(walletSeed(G)), sent = [];
  const r1 = await run(G, db, { env: DISCORD, fetcher: okFetch(sent) });
  assert.strictEqual(r1.status, "posted");
  const d1 = db.docs.get("boards/2026-W46"), p1 = db.docs.get("boards/2026-W46/private/people");
  assert.strictEqual(d1.casFirst, true);
  assert.deepStrictEqual(d1.boards.find(b => b.id === "table").rows, []);
  assert.deepStrictEqual(d1.boards.find(b => b.id === "ach").rows, [{ rank: 1, nick: "甲", value: 3 }]);
  assert.strictEqual(p1.cas, 1);
  assert.deepStrictEqual(p1.people["uid-a"].cas, { wins: 20, busts: 4, net: 900, ach: 3, sent: 1000, econ: 2 });
  assert.deepStrictEqual(p1.people["uid-b"].cas, { bad: 1 });
  assert.ok(!p1.people["uid-c"].cas, "沒進過賭場");
  assert.ok(r1.lines.join("\n").includes("賭場錢包讀不了"));
  assert.ok(sent[0].length <= MAX && sent[0].includes("下週壹起才有本週的數字"));
  // 週三每天更新（W47 進行中，上週的快照是基準）：甲這週贏 5 手、爆 1 次
  db.docs.set("casinoWallets/uid-a", { data: walletOf(G, { wins: 25, busts: 5, net: 1400, ach: 4, sent: 1250, econ: 3 }), rev: 2 });
  const d = await daily(G, db);
  assert.strictEqual(d.status, "updated");
  const live = db.docs.get("boards/latest");
  assert.strictEqual(live.casFirst, false);
  const val = id => live.boards.find(b => b.id === id).rows.map(x => `${x.nick}:${x.value}`);
  assert.deepStrictEqual([val("table"), val("bust"), val("god"), val("donate"), val("econ"), val("ach")], [["甲:5"], ["甲:1"], ["甲:500"], ["甲:250"], ["甲:1"], ["甲:4"]]);
  assert.ok(!JSON.stringify(live).includes("uid-"));
  assert.strictEqual(db.docs.has("boards/2026-W47/private/people"), false, "每天更新不寫快照");
  // 下一個週一正式結算
  const r2 = await run(G, db, { opts: { now: RUN + 7 * 86400000 }, env: DISCORD, fetcher: okFetch(sent) });
  assert.strictEqual(r2.status, "posted");
  const d2 = db.docs.get("boards/2026-W47");
  assert.strictEqual(d2.casFirst, false);
  assert.deepStrictEqual(d2.boards.find(b => b.id === "god").rows, [{ rank: 1, nick: "甲", value: 500 }]);
  assert.ok(sent[1].includes("💰 【賭神】") && sent[1].includes("🃏 【牌桌王】") && sent[1].length <= MAX);
});
T("workflow 跑的腳本有讀 casinoWallets，而且規則沒有放寬（玩家讀不到錢包）", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "tools", "weekly_board.cjs"), "utf8");
  assert.ok(src.includes('collection("casinoWallets")'));
  const r = fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8");
  assert.ok(!/casinoWallets[^}]*allow (read|write): if (isMember|true|request)/.test(r), "錢包的規則不放寬");
  const m = /match \/casinoWallets\/\{[^}]*\} \{([\s\S]*?)\n    \}/.exec(r);
  if (m) assert.ok(!/allow read: if (isMember|true)/.test(m[1]) || m[1].includes("isMe("), "只有自己或沒人");
});

(async () => {
  for (const [name, fn] of tests) {
    const G = load();
    G.setNowClock(() => RUN);
    try { await fn(G); pass++; } catch (e) { fail++; console.log("FAIL " + name + "\n    " + (e.stack || e.message)); } finally { G.setNowClock(null); G.setRng(null); }
  }
  console.log(`${pass} passed, ${fail} failed（每週排行榜）`);
  process.exit(fail ? 1 : 0);
})();
