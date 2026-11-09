// 管理員介面的摘要（shared/admin.js，決定 0033）：node test/admin.test.cjs（npm test 也會跑）
// 資料都是假的。測試：摘要算得對、壞掉的存檔不會丟錯、舊存檔也能算、摘要裡沒有 email、誰是管理員。
const assert = require("assert");
const fs = require("fs"), path = require("path");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const tw = s => Date.parse(s + "+08:00"); // 台灣時間 → 毫秒
const NOW = tw("2026-11-11T12:00:00"); // 週三，2026-W46，這週的週一是 11-09
const TODAY = "2026-11-11";
const T = (name, fn) => {
  const G = load();
  G.setNowClock(() => NOW);
  try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack || e.message); } finally { G.setNowClock(null); G.setRng(null); }
};
const J = x => JSON.parse(JSON.stringify(x));
const FAKE_EMAIL = "fake.player@example.test";

const fresh = G => {
  const save = G.newSave();
  const P = save.profiles.challenge = G.newProfile("challenge");
  G.ensureDay(P, TODAY);
  return { save, P };
};
// 模擬用的「全部解鎖」算法（test/sim.cjs 的 baseLocked，一字不改）
const baseLocked = (G, P) => G.CATS.reduce((n, c) => n + G.PEPE_PARTS.find(p => p.name === c).options.filter(o => !o.forbidden && !o.mutant && !o.gift && !o.limited && !o.key && !P.unlocked[c].includes(o.name)).length, 0);
const lockable = G => G.CATS.flatMap(c => G.PEPE_PARTS.find(p => p.name === c).options.filter(o => !o.forbidden && !o.mutant && !o.gift && !o.limited && !o.key && !o.start).map(o => [c, o.name]));
const pepe = (G, over) => G.pepeKey(Object.assign({}, G.DEFAULT_PICK, over));

// 一間有各種進度的博物館
function busy(G) {
  const { save, P } = fresh(G);
  P.created = "2026-11-09";
  P.vname = "小青"; P.job = "detective"; P.perk = G.PERKS[0].id; P.flaw = G.FLAWS[0].id;
  P.sanity = 55; P.myth = 3; P.mood = 60; P.insp = 123; P.activeSec = 3725;
  P.visitors = [G.blankVisitor(P, { vid: "v2", slot: 1, visitor: 2, vname: "路人", job: "gambler" })];
  P.visitorCount = 2;
  G.baseOpts("顏色").slice(0, 3).forEach((c, i) => { P.pepes[pepe(G, { 顏色: c })] = { n: 1, perfect: false, s: i + 1, d: TODAY }; });
  lockable(G).slice(0, 4).forEach(([c, n]) => { P.unlocked[c].push(n); });
  P.cellar.best = 3;
  P.chaptersRead = { 0: true, 1: true };
  P.mythFrom = { [G.FORBIDDEN_BOOKS[0].id]: true, ex1: true };
  P.endings = { curator: "2026-11-10", russia8: 2, 不認得的結局: "2026-11-10" };
  P.badges = { first: "2026-11-10", 不認得的徽章: "2026-11-10" };
  P.history = [{ n: 3, endedBy: "russia8" }, { n: 2, endedBy: "retire" }, { n: 1, endedBy: "russia8" }];
  G.signIn(save, P, "2026-11-08"); // 上週日
  G.signIn(save, P, "2026-11-09");
  G.signIn(save, P, TODAY);
  const S = G.storyState(P);
  S.tasks = { "2026-W46/w1": { base: 0, done: "2026-11-10", claimed: null }, "2026-W46/d1a": { base: 0, done: "2026-11-09", claimed: "2026-11-09" }, "2026-W46/d2a": { base: 0, done: null, claimed: null }, "2026-W45/w1": { base: 0, done: "2026-11-05", claimed: null } };
  S.books = { "2026-W46/1a": { got: "2026-11-09", read: "2026-11-09" }, "2026-W46/1b": { got: "2026-11-09", read: null }, "2026-W45/1a": { got: "2026-11-05", read: "2026-11-05" } };
  S.stamps = 3;
  P.quirks = [
    { type: "phobia", cat: "顏色", opt: "綠", since: TODAY, until: NOW + 10 * 60000, task: "hug" },
    { type: "phobia", cat: "帽子", opt: null, since: TODAY, until: NOW - 1, task: "hug" }, // 時間到了：不算
  ];
  return { save, P };
}

T("摘要：參觀者", G => {
  const { save } = busy(G);
  const s = G.adminSummary(JSON.stringify(save), NOW);
  assert.ok(s.ok && s.entered);
  const v = s.visitors;
  assert.strictEqual(v.count, 2);
  assert.strictEqual(v.name, "小青");
  assert.strictEqual(v.job, G.JOBS.find(j => j.id === "detective").name);
  assert.strictEqual(v.perk, G.traitName(G.PERKS[0].id));
  assert.strictEqual(v.flaw, G.traitName(G.FLAWS[0].id));
  assert.strictEqual(v.sanity, 55);
  assert.strictEqual(v.maxSan, 96);
  assert.strictEqual(v.mood, save.profiles.challenge.mood, "簽到會加心情，看存檔裡的");
  assert.strictEqual(v.insp, save.profiles.challenge.insp);
  assert.strictEqual(v.myth, 3);
  assert.strictEqual(v.dayNo, 3, "11-09 第一次進館，11-11 是第 3 天");
  assert.strictEqual(v.playSec, 3725);
});
T("摘要：進度", G => {
  const { save } = busy(G);
  const p = G.adminSummary(JSON.stringify(save), NOW).progress;
  assert.deepStrictEqual(J(p.codex), { have: 3, total: G.CORE_TOTAL });
  assert.strictEqual(p.unlock.have, 4);
  assert.strictEqual(p.deepest, 3);
  assert.deepStrictEqual(J(p.books), { total: 5, chapters: { have: 2, total: 1 + G.allChapters().length }, forbidden: 1, story: 2 });
  assert.deepStrictEqual(J(p.endings.map(e => e.id)).sort(), ["curator", "russia8"], "不認得的結局不列");
  assert.strictEqual(p.endings.find(e => e.id === "curator").name, G.ENDINGS.curator.title);
  assert.deepStrictEqual(J(p.badges), { have: 1, total: G.BADGES.length }, "不認得的徽章不算");
});
T("摘要：這週、有沒有卡住", G => {
  const { save } = busy(G);
  const s = G.adminSummary(JSON.stringify(save), NOW);
  assert.strictEqual(s.week.label, "2026-W46");
  assert.strictEqual(s.week.signCount, 3);
  assert.strictEqual(s.week.signWeek, 2, "上週日不算這週");
  assert.strictEqual(s.week.signedToday, true);
  assert.strictEqual(s.week.tasksDone, 2, "上週的、還沒做完的不算");
  assert.strictEqual(s.week.booksRead, 1);
  assert.strictEqual(s.week.stamps, 3);
  assert.strictEqual(s.stuck.sanityZero, 2);
  assert.strictEqual(s.stuck.quirks.length, 1, "時間到的怪癖不算");
  assert.strictEqual(s.stuck.quirks[0].name, "綠色恐懼症");
  assert.strictEqual(s.stuck.quirks[0].minsLeft, 10);
  assert.strictEqual(s.stuck.quirks[0].task, G.QUIRK_TASK_TEXT.hug.act);
});
T("解鎖：跟模擬的「全部解鎖」同一個算法（限定、鑰匙、禁忌都不算）", G => {
  const { P } = fresh(G);
  const LOCKED0 = baseLocked(G, P);
  assert.deepStrictEqual(J(G.adminUnlock(P)), { have: 0, total: LOCKED0 });
  lockable(G).forEach(([c, n], i) => {
    P.unlocked[c].push(n);
    assert.strictEqual(G.adminUnlock(P).have, LOCKED0 - baseLocked(G, P), `解鎖第 ${i + 1} 個`);
  });
  assert.strictEqual(G.adminUnlock(P).have, LOCKED0, "全部解鎖");
  const lim = G.LIMITED_ITEMS.find(x => x.kind === "part");
  P.unlocked[lim.cat].push(lim.opt);
  assert.strictEqual(G.adminUnlock(P).have, LOCKED0, "簽到限定的不算進去");
});
T("算摘要不會改到傳進來的存檔", G => {
  const { save } = busy(G);
  const before = JSON.stringify(save);
  G.adminSummary(save, NOW);
  assert.strictEqual(JSON.stringify(save), before);
});

T("壞掉的存檔：不丟錯，回傳讀不了", G => {
  ["{壞掉", "", "null", "5", "[]", "\"字串\"", JSON.stringify({ profiles: 3 }), JSON.stringify({ profiles: { challenge: "x" } }), JSON.stringify({ profiles: { challenge: [] } }), JSON.stringify({ profiles: { challenge: { unlocked: "x" } } })].forEach(raw => {
    assert.strictEqual(G.adminSummary(raw, NOW).ok, false, `存檔 ${raw}`);
  });
});
T("欄位都亂寫的存檔：不丟錯，字串都有上限", G => {
  const junk = {
    profiles: { challenge: {
      vname: "很長".repeat(500), job: "偷偷".repeat(500), perk: 7, flaw: {}, sanity: "abc", mood: null, insp: {}, myth: "x", activeSec: "很久",
      pepes: 5, chaptersRead: [], mythFrom: 1, endings: { ["__proto__x"]: 1, constructor: "x" }, badges: "x", history: "x", cellar: { best: "B9" },
      quirks: [null, 3, { type: "不認得", cat: "顏色", opt: "很長".repeat(500), until: NOW + 60000 }, { type: "phobia", cat: "顏色", opt: "很長".repeat(500), until: NOW + 60000 }],
      visitors: [1, "x", null], story: { tasks: "x", books: 3, stamps: "很多" }, created: 9,
    } },
    signin: "x",
  };
  const s = G.adminSummary(JSON.stringify(junk), NOW);
  assert.ok(s.ok, "這些欄位補得回來");
  assert.strictEqual(s.visitors.job, null);
  assert.strictEqual(s.visitors.perk, null);
  assert.strictEqual(s.visitors.sanity, 0);
  assert.strictEqual(s.visitors.insp, 0);
  assert.strictEqual(s.progress.deepest, 0);
  assert.strictEqual(s.week.stamps, 0);
  assert.ok(JSON.stringify(s).length < 3000, "回傳的東西不會被亂寫的存檔撐大：" + JSON.stringify(s).length);
  assert.ok(s.stuck.quirks.some(q => q.name === "不認得的怪癖"));
});
T("有人存檔壞了：整張表照常，那一列讀不了", G => {
  const { save } = busy(G);
  const out = G.adminOverviewOf({
    members: [{ uid: "a", nick: "好的", joinedAt: 1 }, { uid: "b", nick: "壞的", joinedAt: 2 }, { uid: "c", nick: "沒存檔", joinedAt: 3 }, { uid: "d", nick: "沒字串", joinedAt: 4 }, "不是物件", null],
    saves: { a: { data: JSON.stringify(save), updatedAt: NOW - 1000 }, b: { data: "{壞掉", updatedAt: NOW - 2000 }, d: { updatedAt: NOW - 3000 } },
    status: { a: { state: "online", room: "lobby", at: NOW - 5000 }, b: "亂寫", d: { state: "飛走了", at: "昨天" } },
  }, NOW);
  assert.strictEqual(out.total, 4);
  const by = n => out.rows.find(r => r.nick === n);
  assert.strictEqual(by("好的").summary.entered, true);
  assert.strictEqual(by("壞的").summary.ok, false);
  assert.strictEqual(by("壞的").savedAt, NOW - 2000, "讀不了也看得到最後存檔時間");
  assert.deepStrictEqual(J(by("沒存檔").summary), { ok: true, entered: false, free: false });
  assert.strictEqual(by("沒字串").summary.ok, false);
  assert.strictEqual(by("沒字串").state, "offline");
});

T("舊存檔（沒有簽到、沒有週章、沒有參觀者欄位）也能算", G => {
  const old = { v: 2, current: "challenge", settings: { muted: true }, profiles: { free: null, challenge: {
    mode: "challenge", visitor: 2, created: "2026-11-01", sanity: 40, myth: 1, mood: 30, insp: 7, activeSec: 90,
    unlocked: {}, pepes: { [pepe(G, {})]: { n: 2, s: 1 } }, chaptersRead: { 0: true }, job: "gambler", cellar: { best: 1, cleared: {} }, endings: { russia8: 1 }, history: [{ n: 1, job: "gambler", made: 3, endedBy: "russia8" }],
  } } };
  const s = G.adminSummary(JSON.stringify(old), NOW);
  assert.ok(s.ok && s.entered);
  assert.strictEqual(s.visitors.count, 1);
  assert.strictEqual(s.visitors.name, "第 2 位參觀者");
  assert.strictEqual(s.visitors.dayNo, 11);
  assert.strictEqual(s.progress.codex.have, 1);
  assert.strictEqual(s.progress.unlock.have, 0);
  assert.deepStrictEqual(J(s.week), { label: "2026-W46", signCount: 0, signWeek: 0, signedToday: false, tasksDone: 0, stamps: 0, booksRead: 0 });
  assert.strictEqual(s.stuck.sanityZero, 1);
  assert.deepStrictEqual(J(s.stuck.quirks), []);
});
T("還沒有存檔、只玩自由模式：還沒進館", G => {
  assert.deepStrictEqual(J(G.adminSummary(null, NOW)), { ok: true, entered: false, free: false });
  const save = G.newSave();
  save.profiles.free = G.newProfile("free");
  assert.deepStrictEqual(J(G.adminSummary(JSON.stringify(save), NOW)), { ok: true, entered: false, free: true });
});

T("摘要裡沒有 email、uid、整份存檔", G => {
  const { save, P } = busy(G);
  save.email = FAKE_EMAIL; P.email = FAKE_EMAIL; P.visit.email = FAKE_EMAIL; P.comments = [FAKE_EMAIL];
  const uid = "uid-不該出現-123";
  const out = G.adminOverviewOf({
    members: [{ uid, nick: "假的", email: FAKE_EMAIL, joinedAt: 1 }],
    saves: { [uid]: { data: JSON.stringify(save), updatedAt: NOW, email: FAKE_EMAIL } },
    status: { [uid]: { state: "online", room: "lobby", at: NOW, email: FAKE_EMAIL } },
  }, NOW);
  const text = JSON.stringify(out);
  assert.strictEqual(out.total, 1);
  assert.ok(!text.includes("@"), "沒有 email");
  assert.ok(!text.includes(uid), "沒有 uid");
  ["pepes", "unlocked", "history", "data", "profiles", "email"].forEach(k => assert.ok(!text.includes(`"${k}"`), `沒有 ${k}`));
  assert.ok(text.length < 3000, "只有摘要：" + text.length);
});
T("程式裡沒有寫死 email", () => {
  const ROOT = path.join(__dirname, "..");
  ["shared/admin.js", "functions/admin.js", "web/src/ui_admin.js"].forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    assert.ok(!/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(src), `${f} 裡有 email`);
  });
});

T("誰是管理員：admin 要真的是 true，被停用的不算", G => {
  assert.strictEqual(G.isAdminInvite({ admin: true }), true);
  [null, undefined, {}, [], "admin", { admin: false }, { admin: "true" }, { admin: 1 }, { admin: true, disabled: true }].forEach(d => assert.strictEqual(G.isAdminInvite(d), false, JSON.stringify(d)));
});
T("誰是管理員：email 小寫、要確認過", G => {
  assert.strictEqual(G.adminEmail({ email: "Fake.Player@Example.Test", email_verified: true }), FAKE_EMAIL);
  [null, undefined, {}, { email: FAKE_EMAIL }, { email: FAKE_EMAIL, email_verified: false }, { email: FAKE_EMAIL, email_verified: "true" }, { email: "", email_verified: true }, { email: 5, email_verified: true }, { email: "a/b@example.test", email_verified: true }, { email: "沒有小老鼠", email_verified: true }].forEach(t => assert.strictEqual(G.adminEmail(t), null, JSON.stringify(t)));
});

T("一列：在線、最後上線、今天有沒有上線（台灣時間 05:00 換日）", G => {
  const row = (save, st, now = NOW) => G.adminRow({ nick: "甲" }, save, st, now, 1);
  const on = row(null, { state: "online", room: "lobby", at: NOW - 3600000 });
  assert.strictEqual(on.state, "online"); assert.strictEqual(on.room, "lobby"); assert.strictEqual(on.lastSeenAt, NOW, "在線＝現在");
  const away = row(null, { state: "away", room: "cellar:2", at: NOW - 60000 });
  assert.strictEqual(away.state, "away"); assert.strictEqual(away.room, "cellar:2");
  const off = row(null, { state: "offline", room: "lobby", at: NOW - 3600000 });
  assert.strictEqual(off.state, "offline"); assert.strictEqual(off.room, null, "離線不寫房間"); assert.strictEqual(off.lastSeenAt, NOW - 3600000);
  assert.strictEqual(off.todayOnline, true);
  const never = row(null, undefined);
  assert.strictEqual(never.lastSeenAt, null); assert.strictEqual(never.todayOnline, false);
  // 11-11 04:59 還是 11-10 那一天；11-11 05:00 才換
  const t0459 = tw("2026-11-11T04:59:00"), t0500 = tw("2026-11-11T05:00:00");
  assert.strictEqual(row(null, { state: "offline", at: t0459 }, t0500).todayOnline, false);
  assert.strictEqual(row(null, { state: "offline", at: t0459 }, t0459 + 30000).todayOnline, true);
  assert.strictEqual(row(null, { state: "offline", at: t0500 }, t0500 + 60000).todayOnline, true);
});
T("一列：隱身的人（/status 是離線）看存檔時間", G => {
  const r = G.adminRow({ nick: "甲" }, { data: "{}", updatedAt: NOW - 1000 }, { state: "offline", at: NOW - 86400000 * 3 }, NOW, 1);
  assert.strictEqual(r.state, "offline");
  assert.strictEqual(r.lastSeenAt, NOW - 1000);
  assert.strictEqual(r.savedAt, NOW - 1000);
  assert.strictEqual(r.todayOnline, true);
});
T("一列：亂寫的時間、房間、暱稱不會讓它壞掉", G => {
  [1e20, -5, Infinity, NaN, "昨天", {}].forEach(at => {
    const r = G.adminRow({ nick: "甲" }, { data: "{}", updatedAt: at }, { state: "offline", at }, NOW, 1);
    assert.strictEqual(r.lastSeenAt, null, String(at));
    assert.strictEqual(r.savedAt, null, String(at));
  });
  const future = G.adminRow({ nick: "甲" }, null, { state: "offline", at: NOW + 86400000 }, NOW, 1);
  assert.strictEqual(future.lastSeenAt, NOW, "比現在晚的拉回現在");
  assert.strictEqual(G.adminRow({ nick: "甲" }, null, { state: "online", room: "<script>" }, NOW, 1).room, null);
  assert.strictEqual(G.adminRow({ nick: 5 }, null, null, NOW, 1).nick, "館友");
  assert.strictEqual([...G.adminRow({ nick: "很長".repeat(20) }, null, null, NOW, 1).nick].length, 12);
});
T("整張表：數字、預設照最後上線排、列裡沒有 uid", G => {
  const out = G.adminOverviewOf({
    members: [{ uid: "a", nick: "很久沒來", joinedAt: 1 }, { uid: "b", nick: "今天來過", joinedAt: 2 }, { uid: "c", nick: "在線", joinedAt: 3 }, { uid: "d", nick: "離開壹下", joinedAt: 4 }, { uid: "e", nick: "沒來過", joinedAt: 5 }],
    status: { a: { state: "offline", at: NOW - 86400000 * 3 }, b: { state: "offline", at: NOW - 3600000 }, c: { state: "online", room: "lobby", at: NOW - 60000 }, d: { state: "away", room: "hall", at: NOW - 60000 } },
  }, NOW);
  assert.strictEqual(out.at, NOW);
  assert.strictEqual(out.total, 5);
  assert.strictEqual(out.todayOnline, 3);
  assert.strictEqual(out.onlineNow, 2);
  assert.deepStrictEqual(J(out.rows.map(r => r.nick)), ["在線", "離開壹下", "今天來過", "很久沒來", "沒來過"]);
  assert.deepStrictEqual(J(out.rows.map(r => r.no)), [3, 4, 2, 1, 5], "no 照加入的順序，不會因為排序變");
  out.rows.forEach(r => assert.strictEqual(r.uid, undefined));
});
T("排序：最後上線、圖鑑、第幾天；沒有資料的一律排最後", G => {
  const mk = (no, seen, codex, day) => ({ no, lastSeenAt: seen, summary: codex == null ? { ok: false } : { ok: true, entered: true, progress: { codex: { have: codex } }, visitors: { dayNo: day } } });
  const rows = [mk(1, 100, 5, 2), mk(2, 300, 1, 9), mk(3, null, null, null), mk(4, 200, 7, 2)];
  const order = (k, d) => J(G.adminSortRows(rows, k, d).map(r => r.no));
  assert.deepStrictEqual(order("seen"), [2, 4, 1, 3]);
  assert.deepStrictEqual(order("seen", 1), [1, 4, 2, 3]);
  assert.deepStrictEqual(order("codex"), [4, 1, 2, 3]);
  assert.deepStrictEqual(order("codex", 1), [2, 1, 4, 3]);
  assert.deepStrictEqual(order("day"), [2, 1, 4, 3]);
  assert.deepStrictEqual(J(rows.map(r => r.no)), [1, 2, 3, 4], "不會改到傳進來的陣列");
});
T("畫面上的字：多久以前、台灣時間、玩了多久", G => {
  assert.strictEqual(G.adminAgo(null, NOW), "還沒來過");
  assert.strictEqual(G.adminAgo(NOW - 30000, NOW), "剛剛");
  assert.strictEqual(G.adminAgo(NOW - 5 * 60000, NOW), "5 分鐘前");
  assert.strictEqual(G.adminAgo(NOW - 3 * 3600000, NOW), "3 小時前");
  assert.strictEqual(G.adminAgo(NOW - 2 * 86400000, NOW), "2 天前");
  assert.strictEqual(G.adminTimeText(tw("2026-11-09T08:52:30")), "11/09 08:52");
  assert.strictEqual(G.adminTimeText(null), "沒有");
  assert.strictEqual(G.adminPlayText(30), "不到 1 分鐘");
  assert.strictEqual(G.adminPlayText(600), "10 分鐘");
  assert.strictEqual(G.adminPlayText(3725), "1 小時 2 分鐘");
  assert.strictEqual(G.adminPlayText("很久"), "不到 1 分鐘");
});

console.log(`${pass} passed, ${fail} failed（管理員介面）`);
process.exit(fail ? 1 : 0);
