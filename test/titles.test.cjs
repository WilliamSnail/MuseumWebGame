// 稱號到處看得到（shared/titles.js，決定 0050）：node test/titles.test.cjs（npm test 也會跑）
// 公開哪一個稱號、讀回來怎麼檢查、館友名單、導覽圖、每週榜單，還有 Realtime Database 規則只放寬 titles 一個地方。
// 資料都是假的；不連 Firebase。
const assert = require("assert");
const fs = require("fs"), path = require("path");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const J = x => JSON.parse(JSON.stringify(x)); // vm 裡的物件拿出來比（見 docs/架構.md 第 6 節）
const DAY = "2026-11-09";
const wallet = G => G.casWalletFix(G.casWalletNew(), DAY);
const prof = G => { const P = G.newProfile("challenge"); G.ensureDay(P, DAY); return P; };
const ROOT = path.join(__dirname, "..");
const CTRL = String.fromCodePoint(0x200b), RLO = String.fromCodePoint(0x202e); // 看不見的字：不直接寫在原始碼裡

// ---------- 伺服器：要公開哪一個 ----------
T("titlePublish：錢包裡有、挑戰模式的存檔在，就公開 { id, name }；名字是錢包的，不是存檔的", G => {
  const w = wallet(G), P = prof(G);
  w.ach.bj = { d: DAY }; w.title = "bj";
  P.casinoTitle = { id: "bj", name: "我自己亂寫的名字" }; // 存檔是玩家寫得動的：不信
  assert.deepStrictEqual(J(G.titlePublish(w, P)), { id: "bj", name: "天生壹對" });
});
T("titlePublish：沒戴、沒有這個成就、沒有存檔、自由模式都是 null", G => {
  const w = wallet(G), P = prof(G);
  assert.strictEqual(G.titlePublish(w, P), null, "沒戴");
  w.title = "bj";
  assert.strictEqual(G.titlePublish(w, P), null, "戴了但錢包沒有這個成就");
  w.ach.bj = { d: DAY };
  assert.ok(G.titlePublish(w, P));
  assert.strictEqual(G.titlePublish(w, null), null, "沒有挑戰模式的存檔");
  assert.strictEqual(G.titlePublish(w, G.newProfile("free")), null, "自由模式展廳不顯示，這裡也不公開");
  assert.strictEqual(G.titlePublish(null, P), null);
  assert.strictEqual(G.titlePublish(w, "x"), null);
});
T("titlePublish：壞的 title（不是字串、__proto__、不存在的 id）都是 null，不丟錯", G => {
  const P = prof(G);
  for (const t of [5, {}, [], true, "__proto__", "constructor", "toString", "nope", ""]) {
    const w = wallet(G); w.title = t;
    assert.strictEqual(G.titlePublish(w, P), null, String(t));
  }
});
T("titlePublish：每週收藏、舊 Discord 21 點的稱號也公開，名字最多 NUM.casino.titleMax 字", G => {
  const w = wallet(G), P = prof(G);
  w.ach["wk:2026-W46"] = { d: DAY, name: "測試稱號" }; w.title = "wk:2026-W46";
  assert.deepStrictEqual(J(G.titlePublish(w, P)), { id: "wk:2026-W46", name: "測試稱號" });
  const id = "old:a:abc1"; w.ach[id] = { d: DAY, name: "字".repeat(40) }; w.title = id;
  const t = G.titlePublish(w, P);
  assert.strictEqual([...t.name].length, G.NUM.casino.titleMax);
});
T("titlePublish：公開的只有 id 和 name（沒有 email、理智、怪癖、靈感）", G => {
  const w = wallet(G), P = prof(G);
  w.ach.bj = { d: DAY }; w.title = "bj"; P.sanity = 3; P.insp = 999;
  assert.deepStrictEqual(Object.keys(J(G.titlePublish(w, P))).sort(), ["id", "name"]);
});

// ---------- 瀏覽器：讀回來 ----------
T("titlesFromDb：好的留下，id 不在清單上的、亂寫的丟掉", G => {
  const out = J(G.titlesFromDb({ a1: { id: "bj", name: "亂寫" }, b2: { id: "evil", name: "管理員" }, c3: "bj", d4: null, e5: { id: "wk:2026-W46", name: "週稱號" }, f6: { id: "old:a:zz9", name: "舊的" }, g7: { id: 5, name: "x" } }));
  assert.deepStrictEqual(out, { a1: { id: "bj", name: "天生壹對" }, e5: { id: "wk:2026-W46", name: "週稱號" }, f6: { id: "old:a:zz9", name: "舊的" } });
});
T("titlesFromDb：不是物件、陣列、字串、null、數字都是空的", G => {
  for (const v of [null, undefined, 5, "x", true, [], [{ id: "bj" }]]) assert.deepStrictEqual(J(G.titlesFromDb(v)), {}, String(v));
});
T("titlesFromDb：怪 uid 不收（__proto__、太長、符號）；原型不會被改", G => {
  const raw = JSON.parse('{"__proto__": {"id":"bj","name":"x"}, "ok_1": {"id":"bj","name":"x"}}');
  raw["a".repeat(129)] = { id: "bj", name: "x" }; raw["a b"] = { id: "bj", name: "x" }; raw["<s>"] = { id: "bj", name: "x" };
  const out = G.titlesFromDb(raw);
  assert.deepStrictEqual(Object.keys(out), ["ok_1"]);
  assert.strictEqual(({}).id, undefined, "Object.prototype 沒被弄髒");
  assert.strictEqual(Object.getPrototypeOf(out).id, undefined);
});
T("titlesFromDb：最多收 TITLES_MAX 個，壞的不佔名額", G => {
  const raw = {};
  for (let i = 0; i < G.TITLES_MAX + 50; i++) raw["u" + i] = { id: "bj", name: "x" };
  assert.strictEqual(Object.keys(G.titlesFromDb(raw)).length, G.TITLES_MAX);
  const mix = { bad: { id: "evil", name: "x" }, good: { id: "bj", name: "x" } };
  assert.deepStrictEqual(Object.keys(G.titlesFromDb(mix)), ["good"]);
});

// ---------- 畫面上的字 ----------
T("titleName：沒有、壞掉都是空字串；舊資料（沒這個欄位）正常", G => {
  for (const v of [null, undefined, "bj", 5, {}, { id: "evil", name: "x" }, []]) assert.strictEqual(G.titleName(v), "", String(v));
  assert.strictEqual(G.titleName({ id: "bj", name: "不管寫什麼" }), "天生壹對");
});
T("titleName：舊資料的名字很長會截短、藏起來的字會去掉", G => {
  const long = G.titleName({ id: "old:a:abc", name: "長".repeat(60) });
  assert.strictEqual([...long].length, G.NUM.casino.titleMax);
  const odd = G.titleName({ id: "wk:2026-W46", name: "甲" + CTRL + RLO + "乙" });
  assert.ok(!odd.includes(CTRL) && !odd.includes(RLO), "看不見的字不能留");
  assert.strictEqual(G.titleName({ id: "wk:2026-W46", name: CTRL }), "", "只剩看不見的字等於沒有");
});
T("titleText（榜單存的名字字串）：字串才算、限字數、不是字串就空", G => {
  assert.strictEqual(G.titleText("好"), "好");
  assert.strictEqual([...G.titleText("字".repeat(99))].length, G.NUM.casino.titleMax);
  for (const v of [null, undefined, 5, {}, [], { name: "x" }]) assert.strictEqual(G.titleText(v), "");
});

// ---------- 導覽圖上的館友 ----------
T("matesByRoom：有稱號才多 title 欄位；沒有稱號的人跟以前一模一樣", G => {
  const r = J(G.matesByRoom([
    { id: "a", nick: "甲", status: "online", room: "gallery", title: { id: "bj", name: "x" } },
    { id: "b", nick: "乙", status: "online", room: "gallery" },
    { id: "c", nick: "丙", status: "online", room: "gallery", title: { id: "evil", name: "管理員" } },
    { id: "d", nick: "丁", status: "online", room: "title", title: { id: "bj", name: "x" } },
  ]));
  const byId = Object.fromEntries(r.gallery.map(m => [m.id, m])); // 同一間房的順序是照暱稱排的，這裡只看每個人的內容
  assert.deepStrictEqual(byId.a, { id: "a", nick: "甲", status: "online", title: "天生壹對" });
  assert.deepStrictEqual(byId.b, { id: "b", nick: "乙", status: "online" });
  assert.deepStrictEqual(byId.c, { id: "c", nick: "丙", status: "online" });
  assert.strictEqual(r.elsewhere[0].title, "天生壹對");
});

// ---------- 每週榜單 ----------
const tw = s => Date.parse(s + "+08:00");
const RUN = tw("2026-11-16T05:15:00");
const WED = "2026-11-11";
const saveOf = (G, title) => {
  const save = G.newSave();
  const P = save.profiles.challenge = G.newProfile("challenge");
  G.ensureDay(P, WED);
  const pepes = G.baseOpts("顏色").slice(0, 3).map(c => G.pepeKey(Object.assign({}, G.DEFAULT_PICK, { 顏色: c })));
  pepes.forEach((k, i) => { P.pepes[k] = { n: 1, perfect: false, s: i + 1, d: WED }; });
  if (title !== undefined) P.casinoTitle = title;
  return JSON.stringify(save);
};
const people = (G, titles) => titles.map((t, i) => ({ uid: "u" + i, nick: "人" + i, stats: G.boardStatsOf(saveOf(G, t), G.boardWeekOf(RUN)) }));
T("榜單：stats.title 看 P.casinoTitle，過 casCleanTitle；亂寫的、字串、舊存檔都是空字串", G => {
  const t = titles => people(G, titles).map(p => p.stats.title);
  assert.deepStrictEqual(t([{ id: "bj", name: "亂寫" }, undefined, null, "我是管理員", { id: "evil", name: "管理員" }, { id: 5 }, []]), ["天生壹對", "", "", "", "", "", ""]);
});
T("榜單：有稱號的列多 title，沒有的列跟以前一樣；boardGroups 沒人有稱號時沒有 titles", G => {
  const wk = G.boardWeekOf(RUN);
  const { doc } = G.boardCompute(people(G, [{ id: "bj", name: "x" }, undefined]), null, wk);
  const codex = J(doc).boards.find(b => b.id === "codex").rows;
  assert.deepStrictEqual(codex, [{ rank: 1, nick: "人0", value: 3, title: "天生壹對" }, { rank: 1, nick: "人1", value: 3 }]);
  assert.deepStrictEqual(J(G.boardGroups(codex)), [{ rank: 1, value: 3, nicks: ["人0", "人1"], titles: ["天生壹對", ""] }]);
  const none = J(G.boardCompute(people(G, [undefined, undefined]), null, wk).doc).boards.find(b => b.id === "codex").rows;
  assert.deepStrictEqual(none, [{ rank: 1, nick: "人0", value: 3 }, { rank: 1, nick: "人1", value: 3 }]);
  assert.deepStrictEqual(J(G.boardGroups(none)), [{ rank: 1, value: 3, nicks: ["人0", "人1"] }]);
});
T("榜單：沒有稱號的人跟換名次的組合，titles 和 nicks 對得上", G => {
  const rows = [{ rank: 1, nick: "甲", value: 9 }, { rank: 2, nick: "乙", value: 5, title: "丙稱號" }, { rank: 2, nick: "丙", value: 5 }];
  assert.deepStrictEqual(J(G.boardGroups(rows)), [{ rank: 1, value: 9, nicks: ["甲"] }, { rank: 2, value: 5, nicks: ["乙", "丙"], titles: ["丙稱號", ""] }]);
});
T("榜單：讀回來的 boardViewOf 把 title 清乾淨（太長截短、不是字串丟掉、舊榜單沒這欄也行）", G => {
  const d = { week: "2026-W46", boards: [{ id: "codex", title: "新", rows: [
    { rank: 1, nick: "甲", value: 3, title: "長".repeat(80) }, { rank: 2, nick: "乙", value: 2, title: 5 }, { rank: 3, nick: "丙", value: 1 }, { rank: 4, nick: "丁", value: 1, title: { a: 1 } }, { rank: 5, nick: "戊", value: 1, title: "" },
  ] }] };
  const rows = J(G.boardViewOf(d).boards[0].rows);
  assert.strictEqual([...rows[0].title].length, G.NUM.casino.titleMax);
  for (const r of rows.slice(1)) assert.ok(!("title" in r), r.nick);
});
T("榜單：Discord 公告沒有稱號（公告的字跟以前一樣）", G => {
  const wk = G.boardWeekOf(RUN);
  const a = G.boardDiscordText(G.boardCompute(people(G, [{ id: "bj", name: "x" }]), null, wk).doc);
  const b = G.boardDiscordText(G.boardCompute(people(G, [undefined]), null, wk).doc);
  assert.strictEqual(a, b);
  assert.ok(!a.includes("天生壹對"));
});
T("榜單：快照（下週相減用）沒有稱號", G => {
  const wk = G.boardWeekOf(RUN);
  const snap = J(G.boardCompute(people(G, [{ id: "bj", name: "x" }]), null, wk).snapshot);
  assert.deepStrictEqual(Object.keys(snap.people.u0).sort(), ["books", "codex", "deepest", "hall"]);
});

// ---------- Realtime Database 規則：只放寬 titles 一個地方 ----------
const rules = JSON.parse(fs.readFileSync(path.join(ROOT, "database.rules.json"), "utf8")).rules;
T("規則：titles 只有館友讀得到、誰都不能從瀏覽器寫", G => {
  const t = rules.titles;
  assert.ok(t, "要有 titles");
  assert.strictEqual(t[".write"], false);
  assert.ok(/auth != null/.test(t[".read"]) && /root\.child\('members'\)\.child\(auth\.uid\)\.exists\(\)/.test(t[".read"]), "要檢查是館友");
  assert.strictEqual(t["$uid"]["$other"][".validate"], false, "不接受多的欄位");
  assert.ok(/length <= 12/.test(t["$uid"][".validate"]) && /length <= 40/.test(t["$uid"][".validate"]), "字數有上限");
});
T("規則：status 沒有開 title 欄位（在線狀態還是只能寫原本那幾個）", G => {
  assert.deepStrictEqual(Object.keys(rules.status["$uid"]).filter(k => !k.startsWith(".")).sort(), ["$other", "at", "nick", "room", "state"]);
  assert.strictEqual(rules.status["$uid"]["$other"][".validate"], false);
});
T("規則：其他地方沒被放寬（頂層的鍵、根目錄還是不能讀寫、members 還是讀不到）", G => {
  assert.deepStrictEqual(Object.keys(rules).sort(), [".read", ".write", "casinoChat", "casinoView", "coopChat", "coopReports", "coopTalkLog", "coopView", "inbox", "invites", "lounge", "members", "partyOf", "parties", "status", "titles", "traces"].sort());
  assert.strictEqual(rules[".read"], false);
  assert.strictEqual(rules[".write"], false);
  assert.strictEqual(rules.members[".read"], false);
  assert.strictEqual(rules.members[".write"], false);
  assert.strictEqual(rules.invites[".read"], false);
});
T("規則：Firestore 的規則沒動（members 還是只能改 nick、invisible；存檔還是只有自己讀）", G => {
  const f = fs.readFileSync(path.join(ROOT, "firestore.rules"), "utf8");
  assert.ok(f.includes("hasOnly(['nick', 'invisible'])"));
  assert.ok(!/title/i.test(f), "firestore.rules 不該提到 title");
  assert.ok(/match \/saves\/\{uid\}[\s\S]*allow read: if isMember\(\) && isMe\(uid\)/.test(f));
});
T("Functions 只在 casino.js 寫 titles/{uid}，而且交易成功才公開", G => {
  const src = fs.readFileSync(path.join(ROOT, "functions", "casino.js"), "utf8");
  assert.ok(src.includes("titles/${uid}") && src.includes("titlePublish"));
  assert.ok(/if \(out && out\.ok\) await publishTitle/.test(src));
  for (const f of fs.readdirSync(path.join(ROOT, "functions")).filter(x => x.endsWith(".js") && x !== "casino.js")) {
    assert.ok(!fs.readFileSync(path.join(ROOT, "functions", f), "utf8").includes("titles/"), f + " 不該寫 titles");
  }
});
T("瀏覽器只讀 titles，不寫", G => {
  const src = fs.readFileSync(path.join(ROOT, "web", "src", "net_firebase.js"), "utf8");
  assert.ok(/ref\(rtdb, "titles"\)/.test(src));
  assert.ok(!/set\(ref\(rtdb, "titles/.test(src) && !/ref\(rtdb, `titles/.test(src));
});

console.log(`${pass} passed, ${fail} failed（稱號到處看得到）`);
process.exit(fail ? 1 : 0);
