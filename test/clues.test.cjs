// 線索 → 你看懂了（shared/clues.js）：node test/clues.test.cjs（npm test 也會跑）
// 用自己拼的小內容測規則；W46 第 1 天用真的 content/weeks/ 的檔
const assert = require("assert");
const { load } = require("./load_shared.cjs");
const { readWeeks } = require("../tools/week_check.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 3).join("\n    ")); } finally { G.setNowClock(null); G.setRng(null); } };

// 一週兩天的小內容：第 1 天一本書（c-b1）、一個房間（c-r1）、一幅畫（c-w1）；第 2 天一本書（c-b2）和一組看懂
function lib(extra = {}) {
  const d1 = { day: 1, books: [{ id: "1a", clue: "c-b1", title: "甲", pages: ["a", "b"] }], adds: [{ id: "rm", clue: "c-r1", floor: 1 }], show: { works: [{ id: "s1a", clue: "c-w1" }, { id: "s1b" }] } };
  const d2 = { day: 2, books: [{ id: "2a", clue: "c-b2", title: "乙", pages: ["a", "b"] }], understand: [{ id: "u-all", need: ["c-b1", "c-r1", "c-w1", "c-b2"], from: "招領箱的帳", text: "他沒有離開。", hint: "還有壹條在地下" }] };
  return { weeks: { "2026-W47": { name: "2026-W47", week: {}, days: Object.assign({ 1: d1, 2: d2 }, extra) } }, fallback: {}, spare: {} };
}
const player = (G, date = "2026-11-17") => { const P = G.newProfile("challenge"); G.ensureDay(P, date); return P; };
const read = (G, P, id) => { const S = G.storyState(P); S.books["2026-W47/" + id] = { got: "2026-11-16", read: "2026-11-17" }; };
const found = (G, P) => { G.storyState(P).spots["s:2026-W47/rm"] = "2026-11-17"; };
const viewed = (G, P) => { G.storyState(P).works["2026-W47/s1a"] = "2026-11-17"; };
const TODAY = "2026-11-17"; // W47 的第 2 天

T("拿到線索：讀完才記，重讀、重看不重複，日期不改", G => {
  const L = lib(), P = player(G);
  G.clueSync(P, L, TODAY);
  assert.deepStrictEqual(Object.keys(P.clues), []);
  read(G, P, "1a");
  assert.strictEqual(G.clueSync(P, L, TODAY).length, 0);
  assert.strictEqual(P.clues["c-b1"], TODAY);
  P.clues["c-b1"] = "2026-11-16";
  G.storyState(P).books["2026-W47/1a"].read = "2026-11-17"; // 又讀了一次
  G.clueSync(P, L, TODAY); G.clueSync(P, L, "2026-11-18");
  assert.strictEqual(P.clues["c-b1"], "2026-11-16");
  assert.strictEqual(Object.keys(P.clues).length, 1);
});

T("集齊才跳、只跳一次、靈感只給一次、不扣理智、不發作", G => {
  const L = lib(), P = player(G);
  read(G, P, "1a"); found(G, P); viewed(G, P);
  assert.strictEqual(G.clueSync(P, L, TODAY).length, 0, "還差一條不跳");
  assert.ok(!P.understood["u-all"]);
  read(G, P, "2a");
  const san = P.sanity, insp = P.insp, myth = P.myth;
  const ev = G.clueSync(P, L, TODAY);
  assert.strictEqual(ev.length, 1);
  assert.strictEqual(ev[0].type, "understood"); assert.strictEqual(ev[0].id, "u-all"); assert.strictEqual(ev[0].text, "他沒有離開。");
  assert.strictEqual(P.understood["u-all"], TODAY);
  assert.strictEqual(P.visit.understood["u-all"], true);
  assert.strictEqual(P.insp, insp + G.NUM.story.understandInsp);
  assert.strictEqual(P.sanity, san); assert.strictEqual(P.myth, myth); assert.ok(!P.bout, "不發作");
  assert.strictEqual(G.clueSync(P, L, TODAY).length, 0);
  assert.strictEqual(G.clueSync(P, L, "2026-11-18").length, 0);
  assert.strictEqual(P.insp, insp + G.NUM.story.understandInsp, "靈感只給壹次");
});

T("提示：壹條都沒拿到不顯示；拿到部分才顯示還差幾條和 hint，不含 text", G => {
  const L = lib(), P = player(G);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(G.understandView(P, L, TODAY))), { done: [], near: [] });
  read(G, P, "1a");
  G.clueSync(P, L, TODAY);
  const v = G.understandView(P, L, TODAY);
  assert.strictEqual(v.near.length, 1); assert.strictEqual(v.near[0].left, 2); assert.strictEqual(v.near[0].hint, "還有壹條在地下");
  assert.ok(!JSON.stringify(v).includes("他沒有離開"), "快看懂的不給答案");
  found(G, P); viewed(G, P); read(G, P, "2a"); G.clueSync(P, L, TODAY);
  const w = G.understandView(P, L, TODAY);
  assert.strictEqual(w.near.length, 0); assert.strictEqual(w.done.length, 1); assert.strictEqual(w.done[0].text, "他沒有離開。");
});

T("沒到的天不算：第 2 天的看懂、線索，在第 1 天看不到", G => {
  const L = lib(), P = player(G, "2026-11-16");
  read(G, P, "1a"); read(G, P, "2a");
  G.clueSync(P, L, "2026-11-16");
  assert.ok(!P.clues["c-b2"]); assert.strictEqual(G.understandView(P, L, "2026-11-16").near.length, 0);
});

T("舊週拿不到的不卡：過了那週沒找到的房間、沒看的畫，need 不算", G => {
  const L = lib(), P = player(G, "2026-11-23");
  read(G, P, "1a"); read(G, P, "2a"); // 書永遠補讀得到
  const ev = G.clueSync(P, L, "2026-11-23"); // 已經是 W48
  assert.strictEqual(ev.length, 1, "房間和畫都錯過了，剩下的集齊就跳");
  const Q = player(G, "2026-11-23");
  read(G, Q, "1a"); // 另一位：書 2a 還沒讀，還拿得到
  assert.strictEqual(G.clueSync(Q, L, "2026-11-23").length, 0);
  assert.strictEqual(G.understandView(Q, L, "2026-11-23").near[0].left, 1);
});

T("這週的畫：週日回顧展還看得到前幾天；平常的別天看不到就不卡", G => {
  const L = lib({ 3: { day: 3, books: [] } }), P = player(G);
  read(G, P, "1a"); found(G, P); read(G, P, "2a");
  // W47 的第 3 天（不是當天也不是週日）：第 1 天的畫已經看不到 → 不卡
  assert.strictEqual(G.clueSync(P, L, "2026-11-18").length, 1);
  const Q = player(G, "2026-11-22");
  read(G, Q, "1a"); found(G, Q); read(G, Q, "2a");
  assert.strictEqual(G.clueSync(Q, L, "2026-11-22").length, 0, "週日回顧展還看得到第 1 天的畫，要等");
  viewed(G, Q);
  assert.strictEqual(G.clueSync(Q, L, "2026-11-22").length, 1);
});

T("舊存檔和壞資料：沒有 clues、P.story 壞掉、內容壞掉都不丟錯", G => {
  const L = lib(), P = player(G);
  delete P.clues; P.story = 5; P.understood = null;
  assert.strictEqual(G.clueSync(P, L, TODAY).length, 0);
  assert.deepStrictEqual(Object.keys(P.clues), []);
  P.clues = [1, 2]; read(G, P, "1a");
  G.clueSync(P, L, TODAY); assert.strictEqual(P.clues["c-b1"], TODAY);
  const bad = { weeks: { "2026-W47": { days: { 1: null, 2: { books: "x", adds: 3, show: 7, understand: [null, 5, { id: "u-x" }, { id: "u-y", need: [], text: "a" }, { id: "u-z", need: [3, null], text: "b" }] }, 3: "x" } }, "壞": 1, "2026-W48": null }, fallback: {}, spare: {} };
  [null, undefined, 5, "x", {}, { weeks: 3 }, bad].forEach(l => { const Q = player(G); assert.doesNotThrow(() => G.clueSync(Q, l, TODAY)); assert.doesNotThrow(() => G.understandView(Q, l, TODAY)); });
  [null, undefined, 5, "x"].forEach(p => { assert.strictEqual(G.clueSync(p, L, TODAY).length, 0); assert.doesNotThrow(() => G.understandView(p, L, TODAY)); });
  assert.strictEqual(G.clueSync(player(G), L, undefined).length, 0);
  const F = G.newProfile("free"); assert.strictEqual(G.clueSync(F, L, TODAY).length, 0, "自由模式沒有每週劇情");
});

T("存檔整理：舊存檔補 clues；週看懂不算進固定章節的 understood 條件", G => {
  const P = G.newProfile("challenge");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(P.clues)), {});
  const old = JSON.parse(JSON.stringify(P)); delete old.clues;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(G.fixProfile(old, "challenge").clues)), {});
  for (let i = 0; i < 6; i++) P.understood["u-week-" + i] = "2026-11-17";
  const need = G.allChapters().filter(c => c.need && c.need.understood);
  assert.ok(need.length, "有章節用 understood 當條件");
  need.forEach(c => assert.ok(!G.chapterOpen(P, c.id), "週看懂不能讓固定章節提早打開"));
  G.UNDERSTAND_TEXT.slice(0, 6).forEach(x => { P.understood[x.id] = "2026-11-17"; });
  need.forEach(c => assert.ok(G.chapterOpen(P, c.id)));
});

const J = x => JSON.parse(JSON.stringify(x));
T("撿到線索的那句話：clueNew 只回新撿到的，同壹條線索每次同壹句，不提是哪件事", G => {
  const L = lib(), P = player(G);
  assert.deepStrictEqual(J(G.clueNew(P, L, TODAY)), []);
  read(G, P, "1a"); viewed(G, P);
  const got = G.clueNew(P, L, TODAY);
  assert.deepStrictEqual(J(got).map(x => [x.clue, x.kind, x.title]), [["c-b1", "book", "甲"], ["c-w1", "work", ""]]);
  got.forEach(x => { assert.ok(G.CLUE_WHISPERS[x.kind].includes(x.text)); assert.strictEqual(x.text, G.clueWhisper(x.kind, x.clue)); assert.ok(!/招領|他沒有/.test(x.text)); });
  assert.deepStrictEqual(J(G.clueNew(P, L, TODAY)), [], "第二次就沒有了");
  assert.deepStrictEqual(J(G.clueNew(G.newProfile("free"), L, TODAY)), [], "自由模式沒有");
});
T("疑點簿：這週有疑點就列；只列撿到的出處和還差幾個地方，不給看懂的文字", G => {
  const L = lib(), P = player(G);
  L.weeks["2026-W47"].week = { title: "失物招領", question: "箱子是誰的？" };
  let v = G.casebookView(P, L, TODAY);
  assert.strictEqual(v.weeks.length, 1);
  assert.deepStrictEqual([v.weeks[0].title, v.weeks[0].question, v.weeks[0].now, v.weeks[0].got.length], ["失物招領", "箱子是誰的？", true, 0]);
  assert.strictEqual(v.weeks[0].left, 3, "今天是第 2 天：兩本書、壹個房間還拿得到；第 1 天的畫過了");
  read(G, P, "1a"); G.clueNew(P, L, TODAY);
  v = G.casebookView(P, L, TODAY);
  assert.deepStrictEqual(J(v).weeks[0].got.map(g => [g.kind, g.title, g.day]), [["book", "甲", 1]]);
  assert.strictEqual(v.weeks[0].left, 2);
  assert.strictEqual(v.near.length, 1);
  assert.ok(!JSON.stringify(v).includes("他沒有離開"), "答案不在疑點簿裡");
  // 過了那壹週：撿到過的還在，沒疑點、沒撿到的週不列
  const later = G.casebookView(P, L, "2026-11-24");
  assert.deepStrictEqual(J(later).weeks.map(w => [w.week, w.now, w.left]), [["2026-W47", false, 0]]);
  assert.deepStrictEqual(J(G.casebookView(player(G), lib(), TODAY).weeks), [], "沒寫疑點、也沒撿到：空的");
  assert.deepStrictEqual(J(G.casebookView(null, L, TODAY)), { weeks: [], near: [] });
});
T("W46 第 1 天（真的內容）：招領單讀完拿到 c-small-hand-note；固定的《看懂的事》照舊", G => {
  const files = Object.fromEntries(Object.entries(readWeeks().files).filter(([k]) => k.startsWith("2026-W46/")));
  const L = G.storyLibrary(files);
  const book = L.weeks["2026-W46"].days[1].books.find(b => b.id === "1b");
  assert.strictEqual(book.clue, "c-small-hand-note");
  const P = player(G, "2026-11-09");
  G.storyState(P).books["2026-W46/1b"] = { got: "2026-11-09", read: "2026-11-09" };
  G.clueSync(P, L, "2026-11-09");
  assert.strictEqual(P.clues["c-small-hand-note"], "2026-11-09");
  assert.strictEqual(G.UNDERSTAND_TEXT.length, 26);
});

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
