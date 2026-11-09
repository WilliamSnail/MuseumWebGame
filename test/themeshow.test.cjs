// 主題展辦完（shared/themeshow.js，決定 0035）：node test/themeshow.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } finally { G.setNowClock(null); G.setRng(null); } };
const J = x => JSON.parse(JSON.stringify(x));
const eq = (a, b, m) => assert.deepStrictEqual(J(a), J(b), m); // vm 裡的陣列、物件原型不一樣：先轉成一般的
const D1 = "2026-11-09"; // 週一
const fresh = (G, date = D1) => { const P = G.newProfile("challenge"); G.ensureDay(P, date); return P; };
// 把一隻放進收藏（不擲骰）
const add = (G, P, o) => { const pick = Object.assign({}, G.DEFAULT_PICK, o); const key = G.pepeKey(pick); P.pepes[key] = { n: 1, perfect: !!o.perfect, s: ++P.serial, d: "2026-11-01" }; return { kind: "pepe", key }; };
// 在展廳擺「生氣」主題，n 隻這個稀有度（顏色換著，分數才有多樣性）
const COLORS = ["紅", "綠", "黃", "黑"];
const hang = (G, P, rarity, n = 6, mood = "生氣") => {
  P.hall = Array.from({ length: Math.max(n, P.hall.length) }, () => null);
  for (let i = 0; i < n; i++) P.hall[i] = add(G, P, { 稀有度: rarity, 心情: mood, 顏色: COLORS[i % 4], 帽子: ["沒有", "棒球帽", "巫師帽"][i % 3], 姿勢: ["站著", "坐著", "比讚"][i % 3] });
  return G.hallScore(P);
};
// 擺出指定的分數區間：稀有度和件數照 NUM.show.tiers 算（測試不寫死分數）
const hangTier = (G, P, tier) => {
  const want = G.NUM.show.tiers[tier - 1];
  const tries = [["稀有", 6], ["超稀有", 3], ["超稀有", 4], ["超稀有", 5], ["超稀有", 6], ["超稀有", 8]];
  for (const [r, n] of tries) {
    while (P.hall.length < n) P.hall.push(null);
    const hs = hang(G, P, r, n);
    if (hs.theme === "angry" && G.tierOfScore("angry", hs.score) === tier && hs.score >= want) return hs;
  }
  throw new Error("擺不出第 " + tier + " 級");
};
const days = (G, P, n, from = D1) => { let d = from; const out = []; for (let i = 0; i < n; i++) { d = G.addDays(from, i); G.ensureDay(P, d); out.push(...G.syncShow(P, d)); } return { events: out, date: d }; };

T("存檔：新的有 themeShow；舊存檔沒有也讀得進來；壞掉的修好", G => {
  const P0 = G.newProfile("challenge");
  eq(J(P0.themeShow), J(G.newShow()));
  const old = J(P0); delete old.themeShow;
  const s = G.migrateSave({ v: 3, profiles: { challenge: old, free: null } });
  eq(J(s.profiles.challenge.themeShow), J(G.newShow()));
  // 舊存檔帶限定收藏、主題展都照留；壞掉的欄位丟掉
  const bad = J(P0);
  bad.themeShow = { v: 1, cur: { theme: "沒有這個主題", from: D1 }, prev: "壞", done: { angry: { tier: 2, score: 85, date: D1, runs: 1 }, nope: { tier: 1 }, tears: { tier: 9 } }, read: { angry: D1, nope: D1 }, pending: [1, { type: "showDone", theme: "angry" }], weeks: { 7: { theme: "noHat", best: 3 }, x: {} } };
  const fixed = G.fixShow(bad.themeShow);
  assert.strictEqual(fixed.cur, null); assert.strictEqual(fixed.prev, null);
  eq(Object.keys(fixed.done), ["angry"]);
  eq(Object.keys(fixed.read), ["angry"]);
  assert.strictEqual(fixed.pending.length, 1);
  eq(Object.keys(fixed.weeks), ["7"]);
  // 存進去再讀出來還在
  const P = fresh(G); hangTier(G, P, 1); days(G, P, 3);
  const round = G.migrateSave(J({ v: 3, profiles: { challenge: P, free: null } })).profiles.challenge;
  assert.strictEqual(round.themeShow.done.angry.tier, 1);
  assert.strictEqual(round.themeShow.cur.theme, "angry");
});

T("連續 3 天才算：第 1、2 天不算，第 3 天（真的換日）才結算", G => {
  const P = fresh(G);
  eq(G.syncShow(P, D1), [], "沒有主題：沒有事");
  hangTier(G, P, 1);
  eq(G.syncShow(P, D1), []);
  let st = G.showStatus(P, D1);
  assert.strictEqual(st.theme, "angry"); assert.strictEqual(st.day, 1); assert.strictEqual(st.days, G.NUM.show.days); assert.strictEqual(st.left, 2);
  const d2 = G.addDays(D1, 1); G.ensureDay(P, d2);
  eq(G.syncShow(P, d2), []);
  st = G.showStatus(P, d2);
  assert.strictEqual(st.day, 2); assert.strictEqual(st.left, 1);
  assert.ok(!P.themeShow.done.angry);
  const d3 = G.addDays(D1, 2); G.ensureDay(P, d3);
  const ev = G.syncShow(P, d3);
  assert.strictEqual(ev.length, 1); assert.strictEqual(ev[0].type, "showDone"); assert.strictEqual(ev[0].tier, 1);
  assert.strictEqual(P.themeShow.done.angry.tier, 1);
  // 同一天再叫：不會再結算
  eq(G.syncShow(P, d3), []);
});

T("連續照 05:00 換日：04:59 還是前一天，05:00 才算下一天", G => {
  const tw = s => Date.parse(s + "+08:00");
  assert.strictEqual(G.todayStr(tw("2026-11-11T04:59:00")), "2026-11-10");
  assert.strictEqual(G.todayStr(tw("2026-11-11T05:00:00")), "2026-11-11");
  const P = fresh(G); hangTier(G, P, 1);
  G.syncShow(P, G.todayStr(tw("2026-11-09T20:00:00")));
  eq(G.syncShow(P, G.todayStr(tw("2026-11-11T04:59:00"))), [], "第 2 天的凌晨");
  assert.strictEqual(G.syncShow(P, G.todayStr(tw("2026-11-11T05:00:00"))).length, 1);
});

T("不用天天上線：掛著離開好幾天，回來就結算", G => {
  const P = fresh(G); hangTier(G, P, 1); G.syncShow(P, D1);
  const later = G.addDays(D1, 10); G.ensureDay(P, later);
  const ev = G.syncShow(P, later);
  assert.strictEqual(ev.filter(e => e.type === "showDone").length, 1);
});

T("中途換掉主題就重算；隔天換回來也是重算；同一天換回來接著算", G => {
  const P = fresh(G); hang(G, P, "稀有"); G.syncShow(P, D1);
  const d2 = G.addDays(D1, 1); G.ensureDay(P, d2); G.syncShow(P, d2);
  assert.strictEqual(G.showStatus(P, d2).day, 2);
  const keep = P.hall.slice();
  // 換成別的主題
  hang(G, P, "稀有", 6, "傷心");
  let ev = G.syncShow(P, d2);
  assert.ok(ev.some(e => e.type === "showReset" && e.theme === "angry" && e.day === 2));
  let st = G.showStatus(P, d2);
  assert.strictEqual(st.theme, "tears"); assert.strictEqual(st.day, 1); assert.strictEqual(st.prev.theme, "angry");
  // 同一天換回來：接著算
  P.hall = keep.slice();
  ev = G.syncShow(P, d2);
  assert.ok(ev.some(e => e.type === "showBack"));
  assert.strictEqual(G.showStatus(P, d2).day, 2);
  assert.strictEqual(P.themeShow.cur.from, D1);
  // 拿下來（沒有主題）再放回去：一樣接著算
  P.hall = [null, null, null, null, null, null];
  G.syncShow(P, d2);
  assert.strictEqual(P.themeShow.cur, null);
  P.hall = keep.slice();
  G.syncShow(P, d2);
  assert.strictEqual(G.showStatus(P, d2).day, 2);
  // 換掉，到隔天才換回來：從第 1 天重算
  hang(G, P, "稀有", 6, "傷心"); G.syncShow(P, d2);
  const d3 = G.addDays(D1, 2); G.ensureDay(P, d3);
  G.syncShow(P, d3); // 這天先看到的還是傷心（第 2 天）
  P.hall = keep.slice();
  ev = G.syncShow(P, d3);
  assert.ok(!ev.some(e => e.type === "showBack"));
  assert.strictEqual(P.themeShow.cur.theme, "angry"); assert.strictEqual(P.themeShow.cur.from, d3);
  assert.ok(!P.themeShow.done.angry, "換過之後第 3 天不會結算");
});

T("換到別的主題也要連續 3 天：新主題從換上那天算", G => {
  const P = fresh(G); hang(G, P, "稀有"); G.syncShow(P, D1);
  const d2 = G.addDays(D1, 1); G.ensureDay(P, d2);
  hang(G, P, "稀有", 6, "傷心"); G.syncShow(P, d2);
  const d3 = G.addDays(D1, 2); G.ensureDay(P, d3);
  eq(G.syncShow(P, d3).filter(e => e.type === "showDone"), []);
  const d4 = G.addDays(D1, 3); G.ensureDay(P, d4);
  const done = G.syncShow(P, d4).filter(e => e.type === "showDone");
  assert.strictEqual(done.length, 1); assert.strictEqual(done[0].theme, "tears");
});

T("分數不夠不算辦完；等分數到了才結算", G => {
  const P = fresh(G);
  const hs = hang(G, P, "普通", 3);
  assert.ok(hs.score < G.NUM.show.tiers[0], "這個擺法要到不了銅");
  assert.strictEqual(hs.theme, "angry");
  days(G, P, 3);
  const d3 = G.addDays(D1, 2);
  assert.ok(!P.themeShow.done.angry);
  const st = G.showStatus(P, d3);
  assert.strictEqual(st.waiting, true); assert.ok(st.need > 0); assert.strictEqual(st.day, st.days);
  hangTier(G, P, 1);
  const ev = G.syncShow(P, d3);
  assert.strictEqual(ev.filter(e => e.type === "showDone").length, 1);
});

T("三級：銅給心情、銀給靈感、金給配件；第一次到金三樣一起給；手記銅就開", G => {
  const N = G.NUM.show;
  // 銅
  let P = fresh(G); P.mood = 40; const insp0 = P.insp; hangTier(G, P, 1);
  let e = days(G, P, 3).events.find(x => x.type === "showDone");
  assert.strictEqual(e.tier, 1);
  assert.strictEqual(P.mood, 40 + N.bronzeMood); assert.strictEqual(P.insp, insp0);
  assert.strictEqual(G.noteOpen(P, "angry"), true, "手記銅就讀得到");
  assert.strictEqual(G.ownsLimited(P, "show-angry"), false);
  // 銀
  P = fresh(G); P.mood = 40; const i1 = P.insp; hangTier(G, P, 2);
  e = days(G, P, 3).events.find(x => x.type === "showDone");
  assert.strictEqual(e.tier, 2);
  assert.strictEqual(P.mood, 40 + N.bronzeMood); assert.strictEqual(P.insp, i1 + N.silverInsp);
  assert.strictEqual(G.ownsLimited(P, "show-angry"), false);
  // 金
  P = fresh(G); P.mood = 40; const i2 = P.insp; hangTier(G, P, 3);
  e = days(G, P, 3).events.find(x => x.type === "showDone");
  assert.strictEqual(e.tier, 3);
  assert.strictEqual(P.mood, 40 + N.bronzeMood); assert.strictEqual(P.insp, i2 + N.silverInsp);
  assert.strictEqual(G.ownsLimited(P, "show-angry"), true);
  assert.ok(G.usable(P, "帽子").includes("火氣頭帶"), "手作坊選得到");
  assert.ok(e.gains.some(g => g.kind === "item" && g.id === "show-angry"));
  assert.ok(e.events.some(x => x.type === "unlock" && x.how === "show"), "有解鎖事件（手作坊標新）");
  assert.strictEqual(G.limitedCount(P).have, 1);
});

T("不重複給：再辦一場只拿比以前高的那幾級；到金之後不再結算", G => {
  const N = G.NUM.show;
  const P = fresh(G); P.mood = 40; const i0 = P.insp; hangTier(G, P, 1);
  days(G, P, 3); // 第 3 天銅
  assert.strictEqual(P.mood, 40 + N.bronzeMood);
  const d3 = G.addDays(D1, 2);
  assert.strictEqual(P.themeShow.cur.from, d3, "掛著就是下一場，從今天算");
  // 又一場，還是銅：什麼都沒有
  const r2 = days(G, P, 3, d3).events.find(x => x.type === "showDone");
  assert.strictEqual(r2.up, false); assert.strictEqual(r2.first, false); eq(J(r2.gains), []);
  assert.strictEqual(P.mood, 40 + N.bronzeMood); assert.strictEqual(P.insp, i0);
  assert.strictEqual(P.themeShow.done.angry.runs, 2);
  // 下一場到銀：只多靈感
  const d5 = G.addDays(d3, 2);
  hangTier(G, P, 2);
  const r3 = days(G, P, 3, d5).events.find(x => x.type === "showDone");
  assert.strictEqual(r3.up, true); eq(r3.gains.map(g => g.kind), ["insp"]);
  assert.strictEqual(P.mood, 40 + N.bronzeMood); assert.strictEqual(P.insp, i0 + N.silverInsp);
  // 再下一場到金：只多配件
  const d7 = G.addDays(d5, 2);
  hangTier(G, P, 3);
  const r4 = days(G, P, 3, d7).events.find(x => x.type === "showDone");
  eq(r4.gains.map(g => g.kind), ["item"]);
  assert.strictEqual(P.insp, i0 + N.silverInsp, "配件是第一次拿，不會換成靈感");
  // 到金之後：掛多久都不再結算
  const d9 = G.addDays(d7, 2);
  eq(days(G, P, 5, d9).events.filter(x => x.type === "showDone"), []);
  assert.strictEqual(G.showStatus(P, G.addDays(d9, 4)).maxed, true);
});

T("換人還在：換參觀者、換位子，主題展、配件、手記都留著，展期也不斷", G => {
  const P = fresh(G); hangTier(G, P, 3);
  days(G, P, 3);
  G.readShowNote(P, "angry", D1);
  const d3 = G.addDays(D1, 2);
  P.themeShow.cur = { theme: "angry", from: G.addDays(d3, -1) };
  G.nextVisitor(P);
  assert.strictEqual(P.themeShow.done.angry.tier, 3);
  assert.strictEqual(G.ownsLimited(P, "show-angry"), true);
  assert.strictEqual(G.noteRead(P, "angry"), true);
  assert.strictEqual(P.themeShow.cur.theme, "angry");
  assert.strictEqual(G.showStatus(P, d3).day, 2, "展期不斷");
  // 多位參觀者：themeShow 不在跟著人走的欄位裡
  assert.ok(!G.VISITOR_KEYS.includes("themeShow"));
  assert.ok(!G.VISITOR_KEYS.includes("limited"));
});

T("自由模式沒有展期；限定配件本來就打開了；舊的自由模式存檔也有", G => {
  const P = G.newProfile("free"); G.ensureDay(P, D1);
  eq(G.syncShow(P, D1), []);
  assert.strictEqual(G.ownsLimited(P, "show-legend"), true);
  assert.ok(G.usable(P, "帽子").includes("傳說的金冠"));
  const old = J(P); old.unlocked.帽子 = old.unlocked.帽子.filter(n => !G.optOf("帽子", n).limited);
  const f = G.migrateSave({ v: 3, profiles: { challenge: null, free: old } }).profiles.free;
  assert.ok(f.unlocked.帽子.includes("傳說的金冠")); assert.ok(f.unlocked.帽子.includes("館員帽"));
  assert.strictEqual(G.possibilities(f), G.ALL_TOTAL);
});

T("配件：10 個主題各一件，每週特展 3 件；有文字、不算進全部解鎖、不會被全簽到抽到", G => {
  const items = G.LIMITED_ITEMS.filter(x => x.from);
  const shows = items.filter(x => x.from === "show");
  eq(shows.map(x => x.theme).sort(), Object.keys(G.HALL_THEME_BONUS).sort());
  eq(G.SHOW_THEMES.slice().sort(), Object.keys(G.HALL_THEME_BONUS).sort());
  assert.ok(items.filter(x => x.from === "week").every(x => G.WEEKLY_IDS.includes(x.theme)));
  items.forEach(x => {
    assert.ok(G.optOf(x.cat, x.opt), x.opt + " 要在 PEPE_PARTS");
    assert.strictEqual(G.optOf(x.cat, x.opt).limited, x.from);
    assert.ok(G.LIMITED_TEXT[x.id] && G.LIMITED_TEXT[x.id].name === x.opt, x.id + " 要有文字");
    assert.ok(G.isSpecialOpt(G.optOf(x.cat, x.opt)));
    assert.ok(!G.baseOpts(x.cat).includes(x.opt), "不算基本組合");
  });
  assert.strictEqual(G.CORE_TOTAL, 1280, "圖鑑格數不變");
  const P = fresh(G);
  assert.strictEqual(G.unlockState(P, "帽子", "傳說的金冠").state, "limited");
  assert.strictEqual(G.limitedCount(P).total, G.LIMITED_ITEMS.length);
  // 買不到、免費解鎖抽不到
  for (let i = 0; i < 40; i++) { G.freeUnlock(P); }
  assert.ok(!P.unlocked.帽子.includes("傳說的金冠"));
  // 每週全簽到只會抽到簽到的東西（照週輪流，抽遍）
  for (let w = 0; w < 200; w++) { const it = G.weeklyItem(w); assert.ok(it && !it.from, "第 " + w + " 週抽到 " + (it && it.id)); }
  // 圖鑑編號：簽到的帽子號碼不動；主題展的另外編
  const signHat = Object.assign({}, G.DEFAULT_PICK, { 帽子: "館員帽" });
  assert.ok(/^限 No\./.test(G.catalogNo(signHat)));
  assert.ok(/^展 No\./.test(G.catalogNo(Object.assign({}, G.DEFAULT_PICK, { 帽子: "傳說的金冠" }))));
  assert.strictEqual(G.describePepe(Object.assign({}, G.DEFAULT_PICK, { 帽子: "淚滴耳環" })).extra.includes("淚滴耳環"), true);
  // 門檻：每個主題三級由低到高；金都到得了 100 以內
  Object.keys(G.HALL_THEME_BONUS).forEach(t => { const a = G.showTiers(t); assert.ok(a[0] < a[1] && a[1] < a[2] && a[2] <= 100, t); });
});

T("手記：每個主題都有；沒辦過打不開；讀完記下來；文字用「壹」", G => {
  const P = fresh(G);
  G.SHOW_THEMES.forEach(t => {
    const N = G.SHOW_NOTES[t];
    assert.ok(N && N.title && N.spine && N.pages.length >= 3, t);
    assert.ok(N.pages.join("").includes("壹"));
    assert.ok(!/[一]/.test(N.title + N.pages.join("")), t + " 的手記不能用「一」");
    assert.ok(!/俄國8\+9 的房間|理智歸零|續集/.test(N.pages.join("")), t + " 不破梗");
    assert.ok(G.SHOW_POSTER_PICK[t], t + " 要有海報的青蛙");
  });
  assert.strictEqual(G.noteOpen(P, "angry"), false);
  assert.strictEqual(G.readShowNote(P, "angry", D1).first, false);
  assert.strictEqual(G.noteRead(P, "angry"), false);
  eq(G.noteCounts(P), [0, 0]);
  hangTier(G, P, 1); days(G, P, 3);
  eq(G.noteCounts(P), [1, 1]);
  assert.strictEqual(G.readShowNote(P, "angry", D1).first, true);
  assert.strictEqual(G.readShowNote(P, "angry", D1).first, false);
  eq(G.noteCounts(P), [1, 0]);
  assert.strictEqual(G.showTitle("帽子展"), "帽子展");
  assert.strictEqual(G.showTitle("憤怒之廳"), "憤怒之廳主題展");
});

T("海報：一個主題一張（留最高的），hallView 也帶；舊存檔是空的", G => {
  const P = fresh(G); hangTier(G, P, 1); days(G, P, 3);
  const d3 = G.addDays(D1, 2);
  let ps = G.showPosters(P);
  assert.strictEqual(ps.length, 1); assert.strictEqual(ps[0].theme, "angry"); assert.strictEqual(ps[0].tier, 1); assert.strictEqual(ps[0].date, d3);
  hangTier(G, P, 2); days(G, P, 3, d3);
  ps = G.showPosters(P);
  assert.strictEqual(ps.length, 1); assert.strictEqual(ps[0].tier, 2);
  const v = J(G.hallView({ profiles: { challenge: P, free: null } }));
  eq(v.posters, J(ps));
  const old = J(P); delete old.themeShow;
  eq(J(G.hallView({ profiles: { challenge: old } })).posters, []);
  assert.ok(!("themeShow" in old), "hallView 不改存檔");
});

// ---------- 每週特展 ----------
const weekOf = (G, theme) => { // 找一個週一：那週的特展是這個主題
  let d = "2026-11-09";
  for (let i = 0; i < 16; i++) { if (G.weeklyTheme(d) === theme) return d; d = G.addDays(d, 7); }
  throw new Error("找不到 " + theme);
};
T("每週特展：換週照最高分，到金拿配件，沒到不給；不重複結算", G => {
  const mon = weekOf(G, "allBlack"), need = G.weekGold("allBlack");
  const P = fresh(G, mon);
  const W = G.weeklyState(P);
  assert.strictEqual(W.theme, "allBlack");
  W.best = need;
  const sun = G.addDays(mon, 6);
  G.ensureDay(P, sun);
  eq(G.syncShow(P, sun).filter(e => e.type === "weekDone"), [], "週日還沒換週");
  const next = G.addDays(mon, 7);
  G.ensureDay(P, next);
  const ev = G.syncShow(P, next).filter(e => e.type === "weekDone");
  assert.strictEqual(ev.length, 1); assert.strictEqual(ev[0].got, true); assert.strictEqual(ev[0].item, "week-allBlack");
  assert.strictEqual(G.ownsLimited(P, "week-allBlack"), true);
  assert.ok(G.usable(P, "帽子").includes("黑絨領結"));
  assert.strictEqual(P.themeShow.weeks[W.w].gold, true);
  assert.strictEqual(P.themeShow.pending.length, 1);
  assert.strictEqual(G.takeShowPending(P).type, "weekDone");
  assert.strictEqual(G.takeShowPending(P), null);
  // 重複叫不會再給
  eq(G.syncShow(P, next), []);
  assert.strictEqual(G.weeklyState(P).best, 0, "新的一週重來");
});
T("每週特展：差一分不給；這週的配件還沒做就只記分數；輪到第二次到金換靈感", G => {
  const mon = weekOf(G, "gopnikWeek"), need = G.weekGold("gopnikWeek");
  let P = fresh(G, mon);
  G.weeklyState(P).best = need - 1;
  let next = G.addDays(mon, 7); G.ensureDay(P, next);
  let ev = G.syncShow(P, next).filter(e => e.type === "weekDone");
  assert.strictEqual(ev[0].got, false); assert.strictEqual(G.ownsLimited(P, "week-gopnikWeek"), false);
  // 沒做配件的週（noHat 還沒做）
  const mon2 = weekOf(G, "noHat");
  assert.strictEqual(G.weekItemOf("noHat"), null);
  P = fresh(G, mon2);
  G.weeklyState(P).best = 100;
  next = G.addDays(mon2, 7); G.ensureDay(P, next);
  eq(G.syncShow(P, next).filter(e => e.type === "weekDone"), []);
  assert.strictEqual(Object.values(P.themeShow.weeks)[0].gold, true);
  // 第二次到金：已經有了，照簽到的規矩換成靈感
  const mon3 = weekOf(G, "pillowWeek");
  P = fresh(G, mon3);
  G.grantLimited(P, "week-pillowWeek", mon3);
  const i0 = P.insp;
  G.weeklyState(P).best = G.weekGold("pillowWeek");
  next = G.addDays(mon3, 7); G.ensureDay(P, next);
  ev = G.syncShow(P, next).filter(e => e.type === "weekDone");
  assert.strictEqual(ev[0].dup, true); assert.strictEqual(P.insp, i0 + G.NUM.signin.dupInsp);
});
T("每週特展：那週沒擺過不記；門檻都到得了（失敗作週不用 90）", G => {
  const mon = weekOf(G, "allBlack");
  const P = fresh(G, mon);
  G.weeklyState(P);
  const next = G.addDays(mon, 7); G.ensureDay(P, next);
  eq(G.syncShow(P, next), []);
  eq(P.themeShow.weeks, {});
  G.WEEKLY_IDS.forEach(id => assert.ok(G.NUM.show.weekGold[id] > 0, id));
  assert.ok(G.weekGold("failedOnly") < G.NUM.show.tiers[0]);
});
T("提示「再 1 天」：第 2 天才有，一天一次；不會在第 1 天或到金之後", G => {
  const P = fresh(G); hangTier(G, P, 1); G.syncShow(P, D1);
  assert.strictEqual(G.showHintDue(P, D1), null);
  const d2 = G.addDays(D1, 1); G.ensureDay(P, d2); G.syncShow(P, d2);
  assert.strictEqual(G.showHintDue(P, d2).left, 1);
  assert.strictEqual(G.showHintDue(P, d2), null, "同一天只提示一次");
  assert.strictEqual(G.showHintDue(G.newProfile("free"), d2), null);
});
T("主題展的門檻玩得到：照實際的展台擺得出銅、銀、金（6 座到銀、8 座到金）", G => {
  const P = fresh(G);
  // 6 座：1 隻傳說級＋5 隻超稀有，心情一樣
  P.hall = [null, null, null, null, null, null];
  const six = [{ 稀有度: "傳說級稀有" }, ...Array(5).fill({ 稀有度: "超稀有" })];
  six.forEach((o, i) => { P.hall[i] = add(G, P, Object.assign({ 心情: "傷心", 顏色: COLORS[i % 4], 帽子: ["沒有", "棒球帽"][i % 2], 姿勢: ["站著", "坐著", "比讚"][i % 3] }, o)); });
  let hs = G.hallScore(P);
  assert.strictEqual(hs.theme, "tears"); assert.ok(G.tierOfScore("tears", hs.score) >= 2, "6 座到銀：" + hs.score);
  // 8 座：再加 2 隻超稀有
  P.hall.push(null, null);
  [6, 7].forEach(i => { P.hall[i] = add(G, P, { 稀有度: "超稀有", 心情: "傷心", 顏色: COLORS[i % 4], 帽子: "巫師帽", 姿勢: ["站著", "坐著"][i % 2] }); });
  hs = G.hallScore(P);
  assert.strictEqual(hs.theme, "tears"); assert.strictEqual(G.tierOfScore("tears", hs.score), 3, "8 座到金：" + hs.score);
  // 失敗作：3 隻失敗作，另外算的門檻
  const Q = fresh(G);
  Q.hall = [null, null, null, null, null, null];
  [0, 1, 2].forEach(i => { const pick = Object.assign({}, G.DEFAULT_PICK, { 心情: ["開心", "傷心", "生氣"][i], 顏色: COLORS[i] }); const key = G.pepeKey(pick); Q.failed[key] = 1; Q.hall[i] = { kind: "failed", key }; });
  [3, 4, 5].forEach(i => { Q.hall[i] = add(G, Q, { 稀有度: "稀有", 心情: "俄國8+9", 顏色: ["紅", "綠", "黃"][i % 3], 帽子: "棒球帽", 姿勢: ["站著", "坐著", "比讚"][i % 3] }); });
  hs = G.hallScore(Q);
  assert.strictEqual(hs.theme, "failed"); assert.ok(G.tierOfScore("failed", hs.score) >= 1, "失敗作到銅：" + hs.score);
});

console.log(`${pass} passed, ${fail} failed（主題展）`);
if (fail) process.exit(1);
