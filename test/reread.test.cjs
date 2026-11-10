// 重讀禁書再擲看懂檢定、《看懂的事》列出每一件和提示（決定 0063）：node test/reread.test.cjs（npm test 也會跑）
// 當天不能重讀、隔天可以、一天一次、看懂了就不再試、舊存檔的 true、自由模式；清單不外流還沒看懂的出處和內容。數字讀 NUM。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const DAY = 86400000, T0 = Date.parse("2026-11-10T04:00:00Z");
const T = (name, fn) => { const G = load(); try { G.setNowClock(() => T0); fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } finally { G.setRng(null); G.setNowClock(null); } };
const mk = G => { const P = G.newProfile("challenge"); G.ensureDay(P); return P; };
const book = G => G.FORBIDDEN_BOOKS[0];

T("每一件看懂的事都有提示，提示裡沒有那一件的內容", G => {
  G.UNDERSTAND_TEXT.forEach(x => {
    assert.ok(x.hint && x.hint.length >= 6, x.id);
    assert.ok(!x.hint.includes(x.text.slice(0, 8)), x.id);
  });
  const ids = G.FORBIDDEN_BOOKS.concat([G.BOOK4], G.BOOK_SEQUELS).map(b => b.id);
  ids.forEach(id => assert.ok(G.UNDERSTAND_TEXT.some(x => x.id === id), id + " 有對應的看懂的事"));
});

T("第一次讀：記日期；當天不能重讀", G => {
  const P = mk(G), b = book(G);
  assert.ok(!G.rereadReady(P, b), "沒讀過");
  assert.strictEqual(G.bookMyth(P, b), b.myth);
  assert.strictEqual(P.mythFrom[b.id], G.todayStr());
  assert.ok(!G.rereadReady(P, b));
  assert.strictEqual(G.rereadTry(P, b), null);
  assert.strictEqual(G.bookMyth(P, b), 0, "神話只給一次");
});

T("隔天可以重讀：只擲看懂檢定，一天一次，不扣理智", G => {
  const P = mk(G), b = book(G);
  G.bookMyth(P, b);
  G.setNowClock(() => T0 + DAY);
  assert.ok(G.rereadReady(P, b));
  const san = P.sanity;
  G.setRng(() => 0.999); // 擲很大：沒看懂
  const u = G.rereadTry(P, b);
  assert.ok(u && !u.success);
  assert.strictEqual(u.target, G.understandTarget(P));
  assert.strictEqual(P.sanity, san);
  assert.ok(!P.understood[b.id]);
  assert.ok(!G.rereadReady(P, b), "今天試過了");
  assert.strictEqual(G.rereadTry(P, b), null);
  G.setNowClock(() => T0 + 2 * DAY);
  assert.ok(G.rereadReady(P, b), "再隔一天又可以");
  G.setRng(() => 0.1); // 擲很小：看懂
  assert.ok(G.rereadTry(P, b).success);
  assert.ok(G.understandLine(P, "book:" + b.id).isNew);
  G.setNowClock(() => T0 + 3 * DAY);
  assert.ok(!G.rereadReady(P, b), "看懂了就不用再試");
});

T("看懂的門檻照 NUM.understandBase 加神話", G => {
  const P = mk(G);
  assert.strictEqual(G.understandTarget(P), Math.min(99, G.NUM.understandBase + P.myth));
  P.myth = 500;
  assert.strictEqual(G.understandTarget(P), 99);
});

T("舊存檔（mythFrom 是 true）：當成以前讀的，馬上可以重讀", G => {
  const P = mk(G), b = book(G);
  P.mythFrom[b.id] = true;
  assert.ok(G.rereadReady(P, b));
  G.setRng(() => 0.999);
  G.rereadTry(P, b);
  assert.strictEqual(P.mythFrom[b.id], G.todayStr());
});

T("自由模式不擲", G => {
  const P = G.newProfile("free"), b = book(G);
  P.mythFrom[b.id] = true;
  assert.ok(!G.rereadReady(P, b));
});

T("清單：每一件一格；還沒看懂的不給出處和內容，只給提示", G => {
  const P = mk(G), b = book(G);
  let L = G.understandList(P);
  assert.strictEqual(L.length, G.UNDERSTAND_TEXT.length);
  L.forEach(x => { assert.ok(!x.got && !x.text && !x.from && x.hint && !x.again, x.id); });
  G.bookMyth(P, b);
  let e = G.understandList(P).find(x => x.id === b.id);
  assert.ok(!e.again && e.hint.includes("明天"));
  G.setNowClock(() => T0 + DAY);
  e = G.understandList(P).find(x => x.id === b.id);
  assert.ok(e.again, "隔天標記再看一次");
  G.understandLine(P, "book:" + b.id);
  e = G.understandList(P).find(x => x.id === b.id);
  assert.ok(e.got && e.text && e.from && !e.again);
});

T("清單：看過還沒看懂的展品也標記；今天被它嚇過就等明天", G => {
  const P = mk(G), id = G.UK_EXHIBITS[0];
  P.seen[id] = 1;
  assert.ok(G.understandList(P).find(x => x.id === id).again);
  P.day.exLoss[id] = 1;
  assert.ok(!G.understandList(P).find(x => x.id === id).again);
});

console.log(`reread.test：${pass} 過，${fail} 沒過`);
if (fail) process.exit(1);
