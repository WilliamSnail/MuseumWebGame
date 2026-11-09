// 每週排行榜（shared/board.js、tools/weekly_board.cjs，決定 0039）：node test/board.test.cjs（npm test 也會跑）
// 資料都是假的；不連 Firebase、不連 Discord（db、fetcher 都是假的）。
const assert = require("assert");
const fs = require("fs"), path = require("path");
const { load } = require("./load_shared.cjs");
const { parseOptions, newRoomFloor, runWeekly } = require("../tools/weekly_board.cjs");
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

(async () => {
  for (const [name, fn] of tests) {
    const G = load();
    G.setNowClock(() => RUN);
    try { await fn(G); pass++; } catch (e) { fail++; console.log("FAIL " + name + "\n    " + (e.stack || e.message)); } finally { G.setNowClock(null); G.setRng(null); }
  }
  console.log(`${pass} passed, ${fail} failed（每週排行榜）`);
  process.exit(fail ? 1 : 0);
})();
