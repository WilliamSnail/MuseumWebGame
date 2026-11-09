// Hamachi 賭場的每週收藏（shared/casino_week.js、casino_wallet.js，決定 0042）：node test/casino_week.test.cjs（npm test 也會跑）
// 換週歸零、過期不懲罰、重複領不行、條件邊界、壞資料不丟錯、舊錢包沒有這些欄位、同桌和單人都算、條件只由伺服器算（畫面改不了）。
// 數字讀 NUM；用到亂數的固定骰子（G.setRng）。
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 14).join("\n    ")); } finally { G.setRng(null); } };
const JS = x => JSON.parse(JSON.stringify(x));
const eq = (a, b) => assert.deepStrictEqual(JS(a), JS(b));
const W46 = "2026-W46", W47 = "2026-W47";
const MON46 = "2026-11-09", MON47 = "2026-11-16";
const card = (r, s = 0) => (r - 1) + s * 13;
const T0 = 1_000_000;

// 一週的內容（跟 content/weeks 一樣的格式）。items 預設 3 件
const itemOf = (id, when, extra) => Object.assign({ id, name: "收藏" + id, desc: "說明" + id, when }, extra || {});
const casinoOf = (items, extra) => Object.assign({
  title: "測試收藏", intro: "前言。", items,
  reward: { title: "測試稱號", souvenir: { name: "測試紀念品", desc: "紀念品的說明。" }, story: { title: "小故事", pages: ["第壹頁。", "第二頁。"] } },
}, extra || {});
const BASE = [itemOf("a", { type: "wins", n: 3 }), itemOf("b", { type: "packs", n: 2 }), itemOf("c", { type: "meal", meal: "tea", n: 1 })];
const libOf = (casino, days) => ({ weeks: { [W46]: { name: W46, week: { casino }, days: days || {} } }, fallback: { 常青1: { name: "常青1", week: {}, days: {} } }, spare: {}, skipped: [] });
const defOf = (G, casino, days) => G.casWkDefFor(libOf(casino, days), W46);
const freshW = (G, day = "2026-11-10") => G.casWalletFix(G.casWalletNew(), day);
const win = (G, w, o = {}) => G.casWkHand(w, Object.assign({ kind: "win", why: null, withOthers: false }, o));
const lose = (G, w) => G.casWkHand(w, { kind: "lose", why: "bust", withOthers: false });
const prof = (G, mode = "challenge") => { const P = G.newProfile(mode); G.ensureDay(P, "2026-11-10"); return P; };

// ---------- 內容：整理成這週的收藏 ----------
T("週內容整理：3 件、每天加碼的有日期、壞的收藏品丟掉、少於 3 件整段不用", G => {
  const d = defOf(G, casinoOf(BASE), { 3: { casino: { note: "今天多一段話。", item: itemOf("x", { type: "hands", n: 5 }) } } });
  assert.strictEqual(d.label, W46); assert.strictEqual(d.items.length, 4);
  assert.deepStrictEqual(JS(d.items.filter(i => !i.extra).map(i => i.id)), ["a", "b", "c"]);
  const x = d.items.find(i => i.id === "x");
  assert.ok(x.extra && x.day === 3 && x.date === "2026-11-11");
  eq(d.notes, [{ day: 3, date: "2026-11-11", text: "今天多一段話。" }]);
  assert.strictEqual(G.casWkVisible(d, "2026-11-10").length, 3, "第 3 天的加碼，前一天看不到");
  assert.strictEqual(G.casWkVisible(d, "2026-11-11").length, 4);
  // 壞的收藏品（條件不認得、id 重複、名字太長）丟掉
  const bad = casinoOf(BASE.concat([itemOf("z", { type: "lottery", n: 1 }), itemOf("a", { type: "hands", n: 1 }), itemOf("w", { type: "wins", n: 1 }, { name: "名字長到超過十二個字的收藏品" })]));
  assert.deepStrictEqual(JS(defOf(G, bad).items.map(i => i.id)), ["a", "b", "c"]);
  assert.strictEqual(defOf(G, casinoOf(BASE.slice(0, 2))), null, "只剩 2 件，不到 NUM.casino.week.itemsMin");
  assert.strictEqual(defOf(G, casinoOf(BASE, { reward: null })), null, "沒有獎勵也不用");
  assert.strictEqual(defOf(G, undefined), null);
});
T("沒有這段的舊週、比 startWeek 早的週、壞的週都是 null，不丟錯", G => {
  assert.strictEqual(G.casWkDefFor({ weeks: { [W46]: { name: W46, week: {}, days: {} } }, fallback: {}, spare: {} }, W46), null);
  assert.strictEqual(G.casWkDefFor(libOf(casinoOf(BASE)), "2026-W45"), null, "每週劇情從 startWeek 開始");
  [null, undefined, 5, "x", [], { weeks: 3 }, { weeks: {}, fallback: {} }].forEach(lib => assert.strictEqual(G.casWkDefFor(lib, W46), null));
  [null, 3, "x", [], { week: 5 }, { week: { casino: 5 } }, { week: { casino: { items: "x" } } }].forEach(p => assert.strictEqual(G.casWeekDef(p, W46, MON46), null));
  assert.strictEqual(G.casWeekDef({ week: { casino: casinoOf(BASE) } }, "壞的", MON46), null);
  assert.strictEqual(G.casWeekDef({ week: { casino: casinoOf(BASE) } }, W46, "壞的"), null);
});
T("沒有這週的正式內容，用備用週的收藏（跟劇情用同一個備用週）；props 的 id 用真的週名", G => {
  const lib = libOf(casinoOf(BASE));
  lib.fallback = { 常青1: { name: "常青1", week: { casino: casinoOf(BASE, { title: "備用的收藏" }) }, days: {} } };
  const d = G.casWkDefFor(lib, W47);
  assert.strictEqual(d.title, "備用的收藏"); assert.strictEqual(d.label, W47);
  assert.strictEqual(G.casWkDefFor(lib, W46).title, "測試收藏", "正式週優先");
  const w = G.casWalletFix(G.casWalletNew(), "2026-11-17");
  for (let i = 0; i < 3; i++) win(G, w);
  G.casWkSync(w, d, "2026-11-17");
  assert.ok(w.props["wk:2026-W47:a"], "id 是 wk:真的週名:收藏品 id");
});
T("真實的內容：2026-W46 和備用週都有 3～5 件；用 storyLibrary 讀進來跟 Functions 的打包一樣", G => {
  const read = p => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "content", "weeks", p), "utf8"));
  const files = {};
  fs.readdirSync(path.join(__dirname, "..", "content", "weeks"), { withFileTypes: true }).forEach(e => {
    if (!e.isDirectory()) return;
    const dirs = e.name === "備用" ? fs.readdirSync(path.join(__dirname, "..", "content", "weeks", "備用")).filter(n => n !== "一天").map(n => "備用/" + n) : [e.name];
    dirs.forEach(dn => fs.readdirSync(path.join(__dirname, "..", "content", "weeks", dn)).filter(f => /^(week|d[1-7])\.json$/.test(f)).forEach(f => { files[`${dn}/${f}`] = read(`${dn}/${f}`); }));
  });
  const lib = G.storyLibrary(files);
  const a = G.casWkDefFor(lib, W46), b = G.casWkDefFor(lib, "2026-W50");
  [a, b].forEach(d => { assert.ok(d, "有收藏"); assert.ok(d.items.filter(i => !i.extra).length >= 3 && d.items.filter(i => !i.extra).length <= 5); assert.ok(d.reward.story.pages.length >= 1); });
  // 打包：tools/copy_shared.cjs → functions/shared/casino_week_data.js（跟限時活動同一個做法）
  require("child_process").execFileSync(process.execPath, [path.join(__dirname, "..", "tools", "copy_shared.cjs")], { stdio: "pipe" });
  const src = fs.readFileSync(path.join(__dirname, "..", "functions", "shared", "casino_week_data.js"), "utf8").replace("export const CAS_WEEK_LIB =", "module.exports.CAS_WEEK_LIB =");
  const m = { exports: {} }; new Function("module", src)(m);
  const bundled = m.exports.CAS_WEEK_LIB;
  eq(G.casWkDefFor(bundled, W46), a);
  eq(G.casWkDefFor(bundled, "2026-W50"), b);
  assert.strictEqual(JSON.stringify(Object.keys(bundled.fallback)), JSON.stringify(Object.keys(lib.fallback).sort()), "備用週的名字要全部打包（輪到哪一個是照有幾個算的）");
  assert.ok(!JSON.stringify(bundled).includes("pages\":[\"守夜"), "劇情的書不打包給 Functions");
});

// ---------- 條件的邊界 ----------
T("每一種條件：差 1 不算，剛好算；n 超過一週做得到的範圍就是壞的", G => {
  const mealsMax = Math.min(G.CAS_WK_CONDS.meals.max, G.CAS_WK_MEALS.length);
  G.CAS_WK_TYPES.forEach(type => {
    const cond = type === "meal" ? { type, meal: "tea", n: 1 } : { type, n: 1 };
    assert.deepStrictEqual(JS(G.casWkCondProblems(cond)), [], type + " n=1 要合法");
    const max = type === "meals" ? mealsMax : G.CAS_WK_CONDS[type].max;
    assert.deepStrictEqual(JS(G.casWkCondProblems(Object.assign({}, cond, { n: max }))), []);
    assert.ok(G.casWkCondProblems(Object.assign({}, cond, { n: max + 1 })).length, type + " 超過範圍");
    assert.ok(G.casWkCondProblems(Object.assign({}, cond, { n: 0 })).length);
    assert.ok(G.casWkCondProblems(Object.assign({}, cond, { n: 1.5 })).length);
    assert.ok(G.casWkCondText(cond).length > 0);
  });
  assert.ok(G.casWkCondProblems({ type: "meal", n: 1 }).length, "meal 要寫是哪一樣");
  assert.ok(G.casWkCondProblems({ type: "meal", meal: "ticket1", n: 1 }).length, "大禮包券不算餐點");
  assert.ok(G.casWkCondProblems({ type: "meal", meal: "snack", n: 1 }).length, "零食會被換成烤雞肉，永遠湊不到");
  assert.ok(G.casWkCondProblems({ type: "meals", n: 7 }).length);
  [null, 5, "x", [], {}].forEach(c => assert.ok(G.casWkCondProblems(c).length));
});
T("贏 N 手：第 N-1 手還沒有，第 N 手馬上有；輸、平手不算贏", G => {
  const n = 3, d = defOf(G, casinoOf([itemOf("a", { type: "wins", n }), itemOf("b", { type: "hands", n: 6 }), itemOf("c", { type: "push", n: 1 })]));
  const w = freshW(G), ids = () => JS(G.casWkSync(w, d, "2026-11-10").newItems.map(i => i.id));
  win(G, w); win(G, w); lose(G, w);
  assert.deepStrictEqual(ids(), [], "贏 2 手、輸 1 手：還沒有任何一件");
  G.casWkHand(w, { kind: "push", why: null, withOthers: false });
  assert.deepStrictEqual(ids(), ["c"], "平手 1 次：c 到手，贏的還是 2 手");
  win(G, w);
  assert.deepStrictEqual(ids(), ["a"], "贏第 " + n + " 手：a 到手（一共打了 5 手，b 還差 1 手）");
  lose(G, w);
  assert.deepStrictEqual(ids(), ["b"], "第 6 手：b 到手");
});
T("連贏：輸一手就歸零，這週最長的才算", G => {
  const d = defOf(G, casinoOf([itemOf("a", { type: "streak", n: 3 }), itemOf("b", { type: "hands", n: 30 }), itemOf("c", { type: "hands", n: 29 })]));
  const w = freshW(G);
  win(G, w); win(G, w); lose(G, w); win(G, w); win(G, w);
  assert.strictEqual(w.wk.c.streak, 2);
  assert.strictEqual(G.casWkSync(w, d, "2026-11-10").newItems.length, 0);
  win(G, w);
  assert.deepStrictEqual(JS(G.casWkSync(w, d, "2026-11-10").newItems.map(i => i.id)), ["a"]);
  G.casWkHand(w, { kind: "push", why: null, withOthers: false });
  assert.strictEqual(w.wk.c.cur, 3, "平手不打斷連勝，也不加");
});
T("特殊的贏法：黑傑克、五張過關、莊家爆牌各自累計，而且都算贏", G => {
  const w = freshW(G);
  G.casWkHand(w, { kind: "blackjack", why: null, withOthers: false });
  G.casWkHand(w, { kind: "charlie", why: null, withOthers: false });
  G.casWkHand(w, { kind: "win", why: "dealerBust", withOthers: false });
  const c = w.wk.c;
  assert.deepStrictEqual([c.hands, c.wins, c.blackjacks, c.charlies, c.dealerBusts, c.streak], [3, 3, 1, 1, 1, 3]);
  const v = G.casWkValue;
  assert.deepStrictEqual([v(c, { type: "blackjack" }), v(c, { type: "charlie" }), v(c, { type: "dealerBust" }), v(c, { type: "wins" })], [1, 1, 1, 3]);
});
T("餐車：特定餐點、不同種類；點零食換成烤雞肉算烤雞肉；買券不算餐點", G => {
  const w = freshW(G), house = G.casHouseFix(G.casHouseNew(), "2026-11-10").house;
  w.chips = 100000000; w.pk.opened = 1;
  G.setRng(G.mulberry32(3));
  const tea = G.CAS_MENU.find(m => m.id === "tea").n, snack = G.CAS_MENU.find(m => m.id === "snack").n, t1 = G.CAS_MENU.find(m => m.id === "ticket1").n;
  assert.ok(G.casBuy(w, house, tea, "2026-11-10").ok);
  assert.strictEqual(G.casWkValue(w.wk.c, { type: "meal", meal: "tea" }), 1);
  assert.ok(G.casBuy(w, house, snack, "2026-11-10").ok);
  assert.strictEqual(G.casWkValue(w.wk.c, { type: "meal", meal: "chicken" }), 1, "零食被換成烤雞肉");
  assert.ok(G.casBuy(w, house, t1, "2026-11-10").ok);
  assert.strictEqual(G.casWkValue(w.wk.c, { type: "meals" }), 2, "券不算餐點；同一種買兩次還是 1 種");
  G.casBuy(w, house, tea, "2026-11-10");
  assert.strictEqual(G.casWkValue(w.wk.c, { type: "meals" }), 2);
  assert.strictEqual(G.casWkValue(w.wk.c, { type: "meal", meal: "tea" }), 2);
  // 買不起、先沒開大禮包都不算
  const w2 = freshW(G); w2.chips = 0;
  assert.ok(!G.casBuy(w2, house, tea, "2026-11-10").ok);
  assert.strictEqual(G.casWkValue(w2.wk.c, { type: "meals" }), 0);
});
T("大禮包：開幾包算幾包；三星以上另外算", G => {
  const w = freshW(G), house = G.casHouseFix(G.casHouseNew(), "2026-11-10").house;
  w.tickets = 50;
  G.setRng(G.mulberry32(11));
  const r = G.casOpenPacks(w, house, 11, "2026-11-10");
  assert.ok(r.ok);
  assert.strictEqual(w.wk.c.packs, 11);
  assert.strictEqual(w.wk.c.bigPacks, r.packs.filter(p => p.stars >= 3).length);
  const before = w.wk.c.packs;
  const empty = freshW(G); empty.pk.left = 0; empty.tickets = 0;
  assert.ok(!G.casOpenPacks(empty, house, 1, "2026-11-10").ok);
  assert.strictEqual(empty.wk.c.packs, 0, "沒包可開，不算");
  assert.strictEqual(w.wk.c.packs, before);
});

// ---------- 同桌和單人都算 ----------
T("單人打：hands、wins 算，同桌的手數不算", G => {
  const w = freshW(G), house = G.casHouseFix(G.casHouseNew(), "2026-11-10").house;
  G.setRng(G.mulberry32(5));
  const out = Object.assign({ kind: "win", why: null }, G.casPayout(1000, "win", 0));
  const r = G.casSettle(w, house, { bet: 1000, out, allin: false, settled: false }, { day: "2026-11-10", withOthers: false });
  assert.ok(r.ok);
  assert.deepStrictEqual([w.wk.c.hands, w.wk.c.wins, w.wk.c.tableHands], [1, 1, 0]);
  // 同一局只算一次
  const again = G.casSettle(w, house, { bet: 1000, out, allin: false, settled: true }, { day: "2026-11-10", withOthers: false });
  assert.ok(!again.ok); assert.strictEqual(w.wk.c.hands, 1);
});
const rigTable = (G, n, players, dealer) => {
  G.setRng(G.mulberry32(1));
  const t = G.casTNew({ pid: "p1", now: T0 });
  const wallets = {}, ids = ["a", "b", "c", "d"].slice(0, n);
  ids.forEach(id => { assert.ok(G.casTSit(t, id, "館友" + id).ok); wallets[id] = G.casWalletFix(G.casWalletNew(), "2026-11-10"); wallets[id].tablePid = "p1"; });
  const ctx = { wallets, house: G.casHouseFix(G.casHouseNew(), "2026-11-10").house, day: "2026-11-10" };
  ids.forEach((id, i) => { const w = wallets[id], s = t.seats[id]; w.chips -= 1000; Object.assign(s, { bet: 1000, st: "play", cards: players[i].slice(), allin: false }); });
  t.phase = "play"; t.dealer = dealer.slice(); t.deck = []; t.deadline = T0 + G.NUM.casino.turnMs; t.rid = "p1:1"; t.round = 1;
  t.turn = ids[0];
  return { t, ctx, ids };
};
T("同桌（2 個人以上）打完：兩個人的 hands、wins、同桌的手數都算", G => {
  const { t, ctx, ids } = rigTable(G, 2, [[card(13), card(9)], [card(13), card(8)]], [card(13), card(7)]);
  assert.ok(G.casTAct(t, "a", "stand", t.seq, ctx, T0).ok);
  assert.ok(G.casTAct(t, "b", "stand", t.seq, ctx, T0).ok);
  assert.strictEqual(t.phase, "result");
  ids.forEach(id => assert.deepStrictEqual([ctx.wallets[id].wk.c.hands, ctx.wallets[id].wk.c.wins, ctx.wallets[id].wk.c.tableHands], [1, 1, 1], id));
});
T("同桌只有 1 個人（自己開的桌）：算打完的手數和贏，但不算「跟館友同桌」", G => {
  const { t, ctx } = rigTable(G, 1, [[card(13), card(9)]], [card(13), card(7)]);
  assert.ok(G.casTAct(t, "a", "stand", t.seq, ctx, T0).ok);
  const c = ctx.wallets.a.wk.c;
  assert.deepStrictEqual([c.hands, c.wins, c.tableHands], [1, 1, 0]);
});
T("同桌的 sync 在同一個交易裡：每個人各自看自己的統計，互不影響", G => {
  const { t, ctx, ids } = rigTable(G, 2, [[card(13), card(9)], [card(13), card(2)]], [card(13), card(7)]); // a 贏 b 輸
  G.casTAct(t, "a", "stand", t.seq, ctx, T0); G.casTAct(t, "b", "stand", t.seq, ctx, T0);
  const d = defOf(G, casinoOf([itemOf("a", { type: "wins", n: 1 }), itemOf("b", { type: "table", n: 1 }), itemOf("c", { type: "hands", n: 30 })]));
  const sa = G.casWkSync(ctx.wallets.a, d, "2026-11-10"), sb = G.casWkSync(ctx.wallets.b, d, "2026-11-10");
  assert.deepStrictEqual(JS(sa.newItems.map(i => i.id)).sort(), ["a", "b"]);
  assert.deepStrictEqual(JS(sb.newItems.map(i => i.id)), ["b"]);
  assert.ok(!ctx.wallets.b.props["wk:2026-W46:a"]);
});

// ---------- 發收藏品、集滿 ----------
T("條件達成：進錢包的財產，名字說明是伺服器內容的；同一件不會發兩次；每天加碼的那天才發", G => {
  const d = defOf(G, casinoOf(BASE), { 3: { casino: { item: itemOf("x", { type: "hands", n: 2 }) } } });
  const w = freshW(G);
  win(G, w); win(G, w); win(G, w);
  const s1 = G.casWkSync(w, d, "2026-11-10");
  assert.deepStrictEqual(JS(s1.newItems.map(i => i.id)), ["a"]);
  assert.strictEqual(w.props["wk:2026-W46:a"].name, "收藏a"); assert.strictEqual(w.props["wk:2026-W46:a"].desc, "說明a");
  assert.strictEqual(G.casWkSync(w, d, "2026-11-10").newItems.length, 0, "再同步一次，不重發");
  assert.ok(!w.props["wk:2026-W46:x"], "第 3 天的加碼，第 2 天統計夠了也還不發");
  const s3 = G.casWkSync(w, d, "2026-11-11");
  assert.deepStrictEqual(JS(s3.newItems.map(i => i.id)), ["x"], "到第 3 天就發（統計從週一累計）");
  assert.strictEqual(w.props["wk:2026-W46:x"].n, 1);
});
T("集滿：全部的基本收藏品到手才算；每天加碼的不算條件；發紀念品和稱號；只發一次", G => {
  const d = defOf(G, casinoOf(BASE), { 2: { casino: { item: itemOf("x", { type: "hands", n: 40 }) } } });
  const w = freshW(G), house = G.casHouseFix(G.casHouseNew(), "2026-11-10").house;
  for (let i = 0; i < 3; i++) win(G, w);
  w.tickets = 5; G.setRng(G.mulberry32(2)); G.casOpenPacks(w, house, 2, "2026-11-10");
  let s = G.casWkSync(w, d, "2026-11-10");
  assert.ok(!s.completed && !w.wk.done, "還缺 c");
  w.chips = 1e9; w.pk.opened = 1; G.casBuy(w, house, G.CAS_MENU.find(m => m.id === "tea").n, "2026-11-10");
  s = G.casWkSync(w, d, "2026-11-10");
  assert.ok(s.completed); assert.strictEqual(w.wk.done, "2026-11-10");
  assert.ok(!w.wk.got.x, "加碼的還沒到手，但不影響集滿");
  assert.strictEqual(w.props["wk:2026-W46"].name, "測試紀念品"); assert.strictEqual(w.ach["wk:2026-W46"].name, "測試稱號");
  assert.ok(!G.casWkSync(w, d, "2026-11-10").completed, "第二次同步不再發");
  assert.strictEqual(w.props["wk:2026-W46"].n, 1);
  const info = G.casAchInfo(w, "wk:2026-W46"); assert.strictEqual(info.name, "測試稱號"); assert.ok(!info.old);
  const pinfo = G.casPropInfo(w, "wk:2026-W46:a"); assert.strictEqual(pinfo.desc, "說明a"); assert.ok(!pinfo.old);
});
T("紀念品可以掛展廳、稱號可以當；給別人看的版本認得 wk 的 id，亂寫的 id 不收", G => {
  const d = defOf(G, casinoOf(BASE));
  const w = freshW(G), P = prof(G);
  for (let i = 0; i < 3; i++) win(G, w);
  G.casWkSync(w, d, "2026-11-10");
  assert.ok(G.casHang(w, P, "wk:2026-W46:a", true).ok);
  assert.deepStrictEqual(JS(G.casCleanSouvenirs(P.hallSouvenirs)).map(x => x.id), ["wk:2026-W46:a"]);
  w.wk.done = "2026-11-10"; w.ach["wk:2026-W46"] = { d: "2026-11-10", name: "測試稱號" };
  assert.ok(G.casSetTitle(w, P, "wk:2026-W46").ok);
  eq(G.casCleanTitle(P.casinoTitle), { id: "wk:2026-W46", name: "測試稱號" });
  eq(G.casCleanSouvenirs([{ id: "wk:亂寫", name: "x" }, { id: "wk:2026-W46:../x", name: "x" }, { id: "wk:2026-W46:a", name: 5 }]), []);
  eq(G.casCleanTitle({ id: "wk:2026-W99:../x", name: "x" }), null);
});

// ---------- 換週、過期 ----------
T("換週：統計和這週拿到的歸零；上一週收進 wkLog；拿到的財產留著", G => {
  const d = defOf(G, casinoOf(BASE));
  const w = freshW(G);
  for (let i = 0; i < 3; i++) win(G, w);
  G.casWkSync(w, d, "2026-11-15"); // 週日
  assert.ok(w.wk.got.a);
  const chips = w.chips;
  G.casWalletFix(w, "2026-11-15");
  assert.strictEqual(w.wk.week, W46, "週日還是這週");
  G.casWalletFix(w, MON47);
  assert.strictEqual(w.wk.week, W47);
  eq(w.wk.c, G.casWkCNew()); eq(w.wk.got, {}); assert.strictEqual(w.wk.done, null);
  assert.deepStrictEqual(JS(w.wkLog[W46]), { got: 1, done: null, claimed: null });
  assert.ok(w.props["wk:2026-W46:a"], "過期的週，拿到的財產留著");
  assert.strictEqual(w.chips, chips, "沒有懲罰：籌碼不動");
});
T("換週在週一 05:00：週日的台灣日期還是舊的一週，週一的日期才是新的一週", G => {
  const w = freshW(G, "2026-11-15");
  assert.strictEqual(w.wk.week, W46);
  G.casWalletFix(w, "2026-11-16");
  assert.strictEqual(w.wk.week, W47);
  // 同一週內重複 Fix 不歸零
  win(G, w); G.casWalletFix(w, "2026-11-17"); assert.strictEqual(w.wk.c.wins, 1);
});
T("上一週的內容換週後，這一步不會再發上一週的收藏品（def 的週對不上就不發）", G => {
  const d = defOf(G, casinoOf(BASE));
  const w = freshW(G, MON47);
  for (let i = 0; i < 9; i++) win(G, w);
  const s = G.casWkSync(w, d, MON47);
  assert.strictEqual(s.newItems.length, 0, "def 是 W46，錢包在 W47");
  assert.ok(!Object.keys(w.props).some(k => k.startsWith("wk:")));
});
T("wkLog 只留 NUM.casino.week.keepWeeks 週，最舊的先丟", G => {
  const w = freshW(G, "2026-11-10");
  let day = "2026-11-10";
  for (let i = 0; i < G.NUM.casino.week.keepWeeks + 4; i++) {
    win(G, w); w.wk.got["a"] = day;
    day = G.addDays(day, 7); G.casWalletFix(w, day);
  }
  assert.strictEqual(Object.keys(w.wkLog).length, G.NUM.casino.week.keepWeeks);
  assert.ok(!w.wkLog[W46], "最舊的丟了");
});

// ---------- 領獎勵（週章） ----------
const doneWallet = (G, day = "2026-11-10") => { const w = freshW(G, day); w.wk.done = day; return w; };
T("領週章：只有集滿的週、只領一次、加 NUM.casino.week.stamp 枚、沒有靈感", G => {
  const P = prof(G), S = G.storyState(P), insp = P.insp;
  const w = freshW(G);
  assert.ok(!G.casWkClaim(w, P, W46, "2026-11-10").ok, "還沒集滿不能領");
  w.wk.done = "2026-11-10";
  const r = G.casWkClaim(w, P, W46, "2026-11-10");
  assert.ok(r.ok); assert.strictEqual(S.stamps, G.NUM.casino.week.stamp); assert.strictEqual(P.insp, insp);
  assert.strictEqual(S.cas[W46], "2026-11-10");
  const again = G.casWkClaim(w, P, W46, "2026-11-10");
  assert.ok(!again.ok && again.reason.includes("領過")); assert.strictEqual(S.stamps, G.NUM.casino.week.stamp, "重複領不行");
  assert.ok(S.log.some(l => l.what === `${W46}/casino`));
});
T("過期的週：集滿了還沒領，之後還能補領一次；沒集滿的週領不到", G => {
  const P = prof(G), S = G.storyState(P);
  const w = doneWallet(G);
  G.casWalletFix(w, MON47);
  assert.strictEqual(w.wkLog[W46].done, "2026-11-10");
  assert.ok(G.casWkClaim(w, P, W46, MON47).ok);
  assert.ok(!G.casWkClaim(w, P, W46, MON47).ok);
  assert.strictEqual(S.stamps, G.NUM.casino.week.stamp);
  assert.ok(!G.casWkClaim(w, P, "2026-W40", MON47).ok, "沒有這週的紀錄");
  const w2 = freshW(G); win(G, w2); G.casWalletFix(w2, MON47);
  assert.ok(!G.casWkClaim(w2, P, W46, MON47).ok, "沒集滿的週，過了就過了");
});
T("兩個週各領各的，互不影響；換週後這週的不能拿去領上一週", G => {
  const P = prof(G), S = G.storyState(P);
  const w = doneWallet(G);
  G.casWalletFix(w, MON47);
  w.wk.done = MON47; // 這週也集滿
  assert.ok(G.casWkClaim(w, P, W47, MON47).ok);
  assert.ok(G.casWkClaim(w, P, W46, MON47).ok);
  assert.strictEqual(S.stamps, 2 * G.NUM.casino.week.stamp);
});
T("自由模式、沒有存檔的人領不到（週章要寫存檔）", G => {
  const w = doneWallet(G);
  assert.ok(!G.casWkClaim(w, null, W46, "2026-11-10").ok);
  assert.ok(!G.casWkClaim(w, prof(G, "free"), W46, "2026-11-10").ok);
  assert.strictEqual(w.wk.claimed, null, "領不到的時候，不能先把「領過」記起來");
});

// ---------- 條件只由伺服器算 ----------
T("畫面拿到的進度是複製品：改它不會改到錢包，也領不到東西", G => {
  const d = defOf(G, casinoOf(BASE));
  const w = freshW(G);
  win(G, w);
  const v = G.casWkView(w, "2026-11-10");
  v.c.wins = 99; v.got.a = "2026-11-10"; v.done = "2026-11-10";
  assert.strictEqual(w.wk.c.wins, 1); assert.deepStrictEqual(JS(w.wk.got), {}); assert.strictEqual(w.wk.done, null);
  assert.strictEqual(G.casWkSync(w, d, "2026-11-10").newItems.length, 0);
});
T("存檔裡自己寫「領過」「集滿」沒有用：領獎只看伺服器的錢包", G => {
  const P = prof(G), S = G.storyState(P);
  S.cas[W46] = "2026-11-10"; S.stamps = 0;
  const w = freshW(G);
  assert.ok(!G.casWkClaim(w, P, W46, "2026-11-10").ok);
  assert.strictEqual(S.stamps, 0);
  // 反過來：存檔寫了領過，但錢包說集滿沒領 → 以錢包為準（領得到，不會重複給：錢包標起來）
  w.wk.done = "2026-11-10";
  assert.ok(G.casWkClaim(w, P, W46, "2026-11-10").ok);
  assert.ok(!G.casWkClaim(w, P, W46, "2026-11-10").ok);
});
T("統計只有 casSettle／casOpenPacks／casBuy 這些伺服器的規則會加；Fix 不會憑空加、也不會被存檔蓋掉", G => {
  const w = freshW(G);
  win(G, w);
  const P = prof(G); P.casino = { wk: { c: { wins: 99 } } }; P.story = { cas: { [W46]: "x" } };
  G.casWalletFix(w, "2026-11-10");
  assert.strictEqual(w.wk.c.wins, 1);
  // 餐車、大禮包、救濟失敗的請求不加
  const house = G.casHouseFix(G.casHouseNew(), "2026-11-10").house;
  G.casBuy(w, house, 999, "2026-11-10"); G.casOpenPacks(w, house, 0, "2026-11-10"); G.casRelief(w, "2026-11-10");
  assert.deepStrictEqual([w.wk.c.packs, w.wk.c.meals && Object.keys(w.wk.c.meals).length, w.wk.c.hands], [0, 0, 1]);
});

// ---------- 壞資料、舊錢包 ----------
T("舊錢包沒有 wk、wkLog：Fix 補好，也能正常打牌、領救濟", G => {
  const old = JS(G.casWalletNew()); delete old.wk; delete old.wkLog;
  const w = G.casWalletFix(old, "2026-11-10");
  assert.strictEqual(w.wk.week, W46); eq(w.wkLog, {}); eq(w.wk.c, G.casWkCNew());
  const house = G.casHouseFix(G.casHouseNew(), "2026-11-10").house;
  const out = Object.assign({ kind: "win", why: null }, G.casPayout(1000, "win", 0));
  assert.ok(G.casSettle(w, house, { bet: 1000, out, allin: false, settled: false }, { day: "2026-11-10" }).ok);
  assert.strictEqual(w.wk.c.wins, 1);
  const noDay = G.casWalletFix({ chips: 5 });
  assert.strictEqual(noDay.chips, 5); assert.strictEqual(noDay.wk.week, null);
  const view = G.casWkView(JS({ chips: 5 }), "2026-11-10");
  assert.strictEqual(view.week, null); eq(view.past, []);
});
T("壞資料不丟錯：wk 是字串、數字亂填、負數、NaN、巨大、日期亂寫、wkLog 是陣列", G => {
  const bads = [null, undefined, 5, "x", [], [1, 2], true, { c: 5, got: 5 }, { week: 5, c: { wins: "abc", hands: -4, packs: NaN, meals: [] }, got: { a: 5, "壞 id": "2026-11-10", b: "不是日期" }, done: 3, claimed: {} },
    { week: "2026-W46", c: { wins: 1e99, hands: 1.7, meals: { tea: -1, 亂寫: 5 } }, got: [] }];
  bads.forEach(b => {
    const w = G.casWalletFix(Object.assign(G.casWalletNew(), { wk: JS(b === undefined ? null : b), wkLog: b }), "2026-11-10");
    assert.ok(Number.isInteger(w.wk.c.wins) && w.wk.c.wins >= 0 && w.wk.c.wins <= 1e6);
    assert.ok(Number.isInteger(w.wk.c.hands) && w.wk.c.hands >= 0);
    Object.keys(w.wk.got).forEach(id => assert.ok(/^[A-Za-z0-9_-]+$/.test(id)));
    assert.ok(w.wkLog && typeof w.wkLog === "object" && !Array.isArray(w.wkLog));
    G.casWkSync(w, defOf(G, casinoOf(BASE)), "2026-11-10");
    G.casWkView(w, "2026-11-10");
    win(G, w);
  });
  // 週名亂寫的 wkLog 丟掉
  const w = G.casWalletFix(Object.assign(G.casWalletNew(), { wkLog: { "../x": { got: 1 }, "2026-W45": { got: "x", done: "壞" } } }), "2026-11-10");
  eq(w.wkLog, { "2026-W45": { got: 0, done: null, claimed: null } });
});
T("壞的內容不丟錯：casino 各欄位亂填、items 不是陣列、reward 少欄位、日期亂寫", G => {
  const junk = [null, 5, "x", [], {}, { items: "x" }, { items: [null, 5, "x", []], reward: 3 }, casinoOf(BASE, { reward: { title: "a" } }), casinoOf(BASE, { reward: { title: "a", souvenir: 5 } }), casinoOf(BASE, { title: 5, intro: [] })];
  junk.forEach(c => { const d = defOf(G, c); assert.ok(d === null || (d.items.length >= 3 && typeof d.title === "string")); });
  const d = defOf(G, casinoOf(BASE), { 1: { casino: 5 }, 2: { casino: { note: 5, item: "x" } }, 3: { casino: { note: "x".repeat(200) } }, 9: { casino: { note: "超出一週" } }, x: null });
  assert.strictEqual(d.items.length, 3); eq(d.notes, []);
  const w = freshW(G);
  assert.deepStrictEqual(JS(G.casWkSync(w, null, "2026-11-10")), { newItems: [], completed: false });
  assert.deepStrictEqual(JS(G.casWkSync(w, d, undefined)), { newItems: [], completed: false });
  assert.strictEqual(G.casWkValue(null, {}), 0); assert.strictEqual(G.casWkValue({}, null), 0); assert.strictEqual(G.casWkCondText(null), "");
});
T("沒有真錢、沒有大量靈感：集滿的獎勵只有紀念品、稱號、週章、故事", G => {
  const N = G.NUM.casino.week;
  assert.ok(N.stamp >= 1 && N.stamp <= G.NUM.story.stampPerTask * 5, "週章不比每週任務多");
  const w = freshW(G), P = prof(G), insp = P.insp, chips = w.chips;
  w.wk.done = "2026-11-10";
  G.casWkClaim(w, P, W46, "2026-11-10");
  assert.strictEqual(P.insp, insp); assert.strictEqual(w.chips, chips);
});

// ---------- 賭場的限時活動 casinoBoost（決定 0042） ----------
const tw = (date, hm, sec = 0) => { const [y, m, d] = date.split("-").map(Number), [h, mi] = hm.split(":").map(Number); return Date.UTC(y, m - 1, d, h - 8, mi, sec); };
const EVB = { start: "2026-11-09", events: [{ id: "casinonight", kind: "casinoBoost", date: "2026-11-12", from: "20:00", to: "22:00", title: "招領櫃檯夜", words: "賭場的櫃檯多開壹個小窗口。" }] };
const evList = G => G.eventsFromWeeks({ "2026-W46": JSON.parse(JSON.stringify(EVB)) });
T("casinoBoost：活動時間內第一次碰錢包多 1 包，同一場只給一次；邊界 20:00 整有、22:00 整沒有", G => {
  const N = G.NUM.events.casinoBoost.extraPacks, ev = evList(G);
  assert.strictEqual(ev.length, 1);
  const w = freshW(G, "2026-11-12"), before = w.pk.left;
  assert.strictEqual(G.casEventPacks(w, ev, tw("2026-11-12", "19:59", 59)), 0);
  assert.strictEqual(G.casEventPacks(w, ev, tw("2026-11-12", "20:00")), N);
  assert.strictEqual(w.pk.left, before + N);
  assert.strictEqual(G.casEventPacks(w, ev, tw("2026-11-12", "21:00")), 0, "同一場只給一次");
  assert.strictEqual(w.pk.left, before + N);
  assert.strictEqual(G.casEventPacks(freshW(G, "2026-11-12"), ev, tw("2026-11-12", "22:00")), 0);
  assert.ok(G.eventEffect(ev[0]).includes("大禮包") && !G.eventEffect(ev[0]).includes("×"));
});
T("casinoBoost：沒趕上沒有懲罰（包數照平常）；隔天換日不留；壞資料不丟錯", G => {
  const ev = evList(G), w = freshW(G, "2026-11-12");
  assert.strictEqual(G.casEventPacks(w, ev, tw("2026-11-12", "23:00")), 0);
  assert.strictEqual(w.pk.left, G.NUM.casino.dailyPacks);
  G.casEventPacks(w, ev, tw("2026-11-12", "20:30"));
  G.casWalletFix(w, "2026-11-13");
  assert.strictEqual(w.pk.left, G.NUM.casino.dailyPacks, "換日重算，多的不累積");
  const bad = freshW(G, "2026-11-12"); bad.pk.ev = "壞的";
  assert.strictEqual(G.casEventPacks(bad, ev, tw("2026-11-12", "20:30")), G.NUM.events.casinoBoost.extraPacks);
  [null, undefined, [], [null], "x"].forEach(l => assert.strictEqual(G.casEventPacks(freshW(G), l, tw("2026-11-12", "20:30")), 0));
  assert.strictEqual(G.casEventPacks(freshW(G), ev, NaN), 0);
});
T("casinoBoost：W46 的劇情線有賭場這一條（casino.line 指到 lines）", G => {
  const wk = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "content", "weeks", "2026-W46", "week.json"), "utf8"));
  assert.ok(wk.lines.some(l => l.id === wk.casino.line));
});

console.log(`${pass} passed, ${fail} failed（賭場每週收藏）`);
process.exit(fail ? 1 : 0);
