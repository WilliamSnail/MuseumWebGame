// 地下探險撿籌碼（決定 0047）：node test/casino_find.test.cjs（npm test 也會跑）
// 機率（可換的亂數）、數量範圍、一天上限、換日、同房間不重複、莊家守恆、統計、舊錢包沒有欄位、壞資料、不認得的房間、沒建過錢包的人、文字乾淨。數字讀 NUM。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } finally { G.setRng(null); } };
const JS = x => JSON.parse(JSON.stringify(x));
const eq = (a, b) => assert.deepStrictEqual(JS(a), JS(b));
const D1 = "2026-11-09", D2 = "2026-11-10";
const rooms = G => G.CELLAR.flatMap(f => f.rooms.map(r => r.id));
const fresh = (G, day = D1) => ({ w: G.casWalletFix(G.casWalletNew(), day), house: G.casHouseFix(G.casHouseNew(), day).house });
const HIT = () => 0, MISS = () => 0.999999;
// 依序給固定的亂數
const seq = (...xs) => { let i = 0; return () => xs[Math.min(i++, xs.length - 1)]; };

T("數字是一點點：最大的一次也比最小的大禮包少；一天最多也比最小的大禮包少", G => {
  const C = G.NUM.casino.cellarFind;
  assert.ok(C.chance > 0 && C.chance < 1 && C.min > 0 && C.max >= C.min && C.step > 0 && C.perDay >= 1);
  assert.ok(C.max < G.CAS_PACKS[0].base, "單次要比最小的大禮包少");
  assert.ok(C.max * C.perDay < G.CAS_PACKS[0].base, "一天最多也要比最小的大禮包少");
  assert.ok(C.max * C.perDay * 10 < G.NUM.casino.exchange[0].chips, "10 天也換不到壹點靈感");
});
T("撿到：籌碼加、莊家減、統計對得上", G => {
  const C = G.NUM.casino.cellarFind, { w, house } = fresh(G);
  const c0 = w.chips, h0 = house.bankroll;
  const r = G.casCellarFind(w, house, rooms(G)[0], D1, HIT);
  assert.ok(r.ok && r.found === C.min && r.t === 0);
  assert.strictEqual(w.chips, c0 + C.min); assert.strictEqual(house.bankroll, h0 - C.min);
  assert.strictEqual(w.st.finds, 1); assert.strictEqual(w.st.findChips, C.min);
  assert.strictEqual(w.st.chipsMax, c0 + C.min);
  assert.strictEqual(w.cf.n, 1); eq(w.cf.rooms, [rooms(G)[0]]);
  assert.strictEqual(w.chips + house.bankroll, c0 + h0, "兩邊加起來不變");
});
T("機率邊界：亂數剛好等於 chance 算沒撿到，比它小一點算撿到", G => {
  const C = G.NUM.casino.cellarFind;
  let s = fresh(G);
  assert.strictEqual(G.casCellarFind(s.w, s.house, rooms(G)[0], D1, () => C.chance).found, 0);
  s = fresh(G);
  assert.ok(G.casCellarFind(s.w, s.house, rooms(G)[0], D1, seq(C.chance - 1e-9, 0, 0)).found > 0);
});
T("沒撿到：不動籌碼和莊家，但記下這個房間（不能重擲），不佔一天的次數", G => {
  const { w, house } = fresh(G), c0 = w.chips, h0 = house.bankroll, rs = rooms(G);
  const r = G.casCellarFind(w, house, rs[0], D1, MISS);
  assert.ok(r.ok && r.found === 0);
  assert.strictEqual(w.chips, c0); assert.strictEqual(house.bankroll, h0); assert.strictEqual(w.st.finds, 0);
  assert.strictEqual(w.cf.n, 0); eq(w.cf.rooms, [rs[0]]);
  const again = G.casCellarFind(w, house, rs[0], D1, HIT); // 同一間不能再擲
  assert.ok(!again.ok && again.dup); assert.strictEqual(w.chips, c0);
});
T("數量在範圍內、是 step 的倍數；最小、最大的亂數剛好到邊界", G => {
  const C = G.NUM.casino.cellarFind, rs = rooms(G);
  const got = new Set();
  for (let i = 0; i < 200; i++) {
    const { w, house } = fresh(G);
    const r = G.casCellarFind(w, house, rs[0], D1, seq(0, i / 200, (i * 7 % 200) / 200));
    assert.ok(r.found >= C.min && r.found <= C.max && (r.found - C.min) % C.step === 0, String(r.found));
    assert.ok(r.t >= 0 && r.t < G.CAS_FIND_TEXT.lines.length);
    got.add(r.found);
  }
  assert.ok(got.has(C.min) && got.has(C.max), "最小和最大都擲得到");
  const { w, house } = fresh(G);
  assert.strictEqual(G.casCellarFind(w, house, rs[1], D1, seq(0, 0.9999999999, 0.9999999999)).found, C.max);
  assert.ok(G.casCellarFind(fresh(G).w, null, rs[1], D1, HIT).ok, "沒給莊家也不丟錯");
});
T("一天上限：撿滿 perDay 次後，換別的房間也不給；撿夠了不寫房間", G => {
  const C = G.NUM.casino.cellarFind, { w, house } = fresh(G), rs = rooms(G);
  for (let i = 0; i < C.perDay; i++) assert.ok(G.casCellarFind(w, house, rs[i], D1, HIT).found > 0);
  const c = w.chips, n = w.cf.rooms.length;
  const r = G.casCellarFind(w, house, rs[C.perDay], D1, HIT);
  assert.ok(!r.ok && r.capped);
  assert.strictEqual(w.chips, c); assert.strictEqual(w.cf.rooms.length, n); assert.strictEqual(G.casFindLeft(w, D1), 0);
});
T("一個人把全部房間都走一遍，一天最多也只有 perDay 次", G => {
  const C = G.NUM.casino.cellarFind, { w, house } = fresh(G), c0 = w.chips;
  rooms(G).forEach(id => G.casCellarFind(w, house, id, D1, HIT));
  assert.strictEqual(w.st.finds, C.perDay); assert.strictEqual(w.chips - c0, C.perDay * C.min);
});
T("換日（台灣 05:00，由呼叫的人給日期）：次數和房間都歸零，同一個房間可以再擲", G => {
  const C = G.NUM.casino.cellarFind, { w, house } = fresh(G), rs = rooms(G);
  for (let i = 0; i < C.perDay; i++) G.casCellarFind(w, house, rs[i], D1, HIT);
  assert.ok(G.casCellarFind(w, house, rs[0], D1, HIT).dup);
  assert.ok(G.casCellarFind(w, house, rs[C.perDay], D1, HIT).capped);
  const w2 = G.casWalletFix(JS(w), D2); // 隔天讀回來
  const r = G.casCellarFind(w2, house, rs[0], D2, HIT);
  assert.ok(r.ok && r.found > 0); assert.strictEqual(w2.cf.n, 1); eq(w2.cf.rooms, [rs[0]]);
  assert.strictEqual(w2.st.finds, C.perDay + 1, "統計是累計的，不歸零");
  assert.strictEqual(G.casFindLeft(w2, D2), C.perDay - 1);
});
T("同一天存進資料庫再讀回來，不重複算", G => {
  const { w, house } = fresh(G), rs = rooms(G);
  G.casCellarFind(w, house, rs[0], D1, HIT);
  const back = G.casWalletFix(JS(w), D1);
  assert.ok(G.casCellarFind(back, house, rs[0], D1, HIT).dup);
});
T("舊錢包沒有 cf、沒有 st.finds：補欄位，不丟錯", G => {
  const old = G.casWalletNew(); delete old.cf; delete old.st.finds; delete old.st.findChips;
  const w = G.casWalletFix(JS(old), D1);
  assert.strictEqual(w.st.finds, 0); assert.strictEqual(w.st.findChips, 0);
  const r = G.casCellarFind(w, null, rooms(G)[0], D1, HIT);
  assert.ok(r.ok && r.found > 0 && w.st.finds === 1);
  const old2 = G.casWalletNew(); delete old2.cf; delete old2.st;
  const w2 = G.casWalletFix(JS(old2), D1); // st 整個沒有也補得回來
  assert.ok(G.casCellarFind(w2, null, rooms(G)[0], D1, HIT).ok);
});
T("壞資料（cf 不是物件、n 是字串、rooms 混了數字）：不丟錯，當作沒有", G => {
  for (const bad of [null, 5, "x", [], { day: D1, n: "abc", rooms: 7 }, { day: D1, n: -4, rooms: [1, null, "z"] }]) {
    const { w, house } = fresh(G); w.cf = bad;
    const r = G.casCellarFind(w, house, rooms(G)[0], D1, HIT);
    assert.ok(r.ok && r.found > 0, JSON.stringify(bad));
    assert.ok(w.cf.n >= 1 && Array.isArray(w.cf.rooms));
  }
  const { w, house } = fresh(G); w.cf = { day: D1, n: 1e9, rooms: [] };
  assert.ok(G.casCellarFind(w, house, rooms(G)[0], D1, HIT).capped, "n 超大算撿夠了");
});
T("不認得的房間（空的、數字、物件、太長、story 的）都不給也不寫", G => {
  for (const id of [undefined, null, "", 5, {}, [], "b1-不存在", "x".repeat(300), "story:abc"]) {
    const { w, house } = fresh(G), before = JSON.stringify(w);
    const r = G.casCellarFind(w, house, id, D1, HIT);
    assert.ok(!r.ok, String(id));
    assert.strictEqual(JSON.stringify(w), before);
  }
});
T("沒建過錢包的人：撿到是開場的數字加上撿到的；之後再進賭場不會再給開戶禮", G => {
  const C = G.NUM.casino.cellarFind, start = G.NUM.casino.startChips;
  const w = G.casWalletFix(null, D1); // Functions 讀不到錢包時就是這樣建的；狀態列 peek 看到的也是 startChips
  assert.strictEqual(w.chips, start);
  G.casCellarFind(w, G.casHouseNew(), rooms(G)[0], D1, HIT);
  const later = G.casWalletFix(JS(w), D2); // 隔天第一次進賭場：讀到的是存在的錢包
  assert.strictEqual(later.chips, start + C.min, "沒有第二份開戶禮");
  assert.strictEqual(later.legacy, null, "不影響舊資料認領");
  assert.strictEqual(later.st.hands, 0);
});
T("不動到別的帳：救濟、大禮包、換小獎的欄位原封不動", G => {
  const { w, house } = fresh(G), keep = JS({ rel: w.rel, pk: w.pk, ex: w.ex, tickets: w.tickets, ach: w.ach, props: w.props, meals: w.meals, wk: w.wk });
  G.casCellarFind(w, house, rooms(G)[0], D1, HIT);
  eq({ rel: w.rel, pk: w.pk, ex: w.ex, tickets: w.tickets, ach: w.ach, props: w.props, meals: w.meals, wk: w.wk }, keep);
});
T("用全域 RNG（Functions 的做法 setRng）也行，同一個種子結果一樣", G => {
  const a = fresh(G), b = fresh(G), id = rooms(G)[0];
  G.setRng(G.mulberry32(11)); const ra = G.casCellarFind(a.w, a.house, id, D1);
  G.setRng(G.mulberry32(11)); const rb = G.casCellarFind(b.w, b.house, id, D1);
  eq(ra, rb);
});
T("機率大致對（種子固定）：落在 chance 附近", G => {
  const C = G.NUM.casino.cellarFind; let hit = 0; const N = 4000;
  G.setRng(G.mulberry32(5));
  for (let i = 0; i < N; i++) { const { w, house } = fresh(G); if (G.casCellarFind(w, house, rooms(G)[0], D1).found > 0) hit++; }
  assert.ok(Math.abs(hit / N - C.chance) < 0.03, String(hit / N));
});
T("文字：幾句輪流、畫面用壹、不寫錢和賭博多賺、不鼓勵下注", G => {
  const L = G.CAS_FIND_TEXT.lines;
  assert.ok(L.length >= 4 && new Set(L).size === L.length);
  const banned = ["一", "錢", "賺", "贏", "下注", "賭", "現金", "真錢", "儲值", "提款", "台幣", "$", "差壹隻"];
  L.forEach(s => banned.forEach(b => assert.ok(!s.includes(b), `「${s}」不能有「${b}」`)));
});

// 限時活動 cellarChips（翊文 11-12）：撿到的那次多 min～max；沒撿到不給；別種活動、沒有活動都照舊；莊家照樣守恆
T("限時活動：撿到的那次多壹把，沒撿到不給", G => {
  const C = G.NUM.casino.cellarFind, B = G.NUM.events.cellarChips, EV = { kind: "cellarChips", id: "w/x" };
  assert.ok(B.min > 0 && B.max >= B.min && B.step > 0);
  let s = fresh(G); const c0 = s.w.chips, h0 = s.house.bankroll;
  let r = G.casCellarFind(s.w, s.house, rooms(G)[0], D1, HIT, EV);
  assert.ok(r.ok && r.bonus === B.min && r.found === C.min + B.min);
  assert.strictEqual(s.w.chips, c0 + r.found); assert.strictEqual(s.house.bankroll, h0 - r.found);
  s = fresh(G); r = G.casCellarFind(s.w, s.house, rooms(G)[0], D1, seq(0, 0, 0, 0.999999), EV);
  assert.strictEqual(r.bonus, B.max, "最大那級");
  s = fresh(G); r = G.casCellarFind(s.w, s.house, rooms(G)[0], D1, MISS, EV);
  assert.ok(r.ok && r.found === 0);
  s = fresh(G); r = G.casCellarFind(s.w, s.house, rooms(G)[0], D1, HIT, { kind: "casinoBoost" });
  assert.strictEqual(r.bonus, 0); assert.strictEqual(r.found, C.min);
  s = fresh(G); r = G.casCellarFind(s.w, s.house, rooms(G)[0], D1, HIT);
  assert.strictEqual(r.bonus, 0);
});
T("限時活動的字：約幾萬、單人多人都算", G => {
  const t = G.eventEffect({ kind: "cellarChips" }), B = G.NUM.events.cellarChips;
  assert.ok(t.includes(String(Math.round((B.min + B.max) / 2 / 10000))) && t.includes("多人"), t);
  assert.ok(G.EVENT_KINDS.cellarChips);
});

console.log(`${pass} passed, ${fail} failed（地下撿籌碼）`);
process.exit(fail ? 1 : 0);
