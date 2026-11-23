// 交代人壹天兩個任務：挑現在該說哪壹句（shared/story/core.js 的 giverPick；11-21 qa-e 測 PR 932 抓到：荷官有「綠色佩佩」和「賭場打壹手」，打完壹手還說前壹句）
const assert = require("assert");
const { load } = require("../load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(load()); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
const mk = (id, kind, says, done) => ({ id, giver: "yuga", kind, says, done });
const A = mk("d6c", "make", "去做壹隻綠色的佩佩。", "綠色的，漂亮。"), B = mk("d6e", "casino", "去賭場打壹手。", "壹手，剛好。");
const isDone = set => t => set.includes(t.id);
T("沒有這位交代人、沒有 says：null", G => {
  assert.strictEqual(G.giverPick([A, B], "hall", isDone([]), null), null);
  assert.strictEqual(G.giverPick([{ id: "x", giver: "yuga", kind: "make" }], "yuga", isDone([]), null), null);
});
T("沒指定地方：先說第壹個沒做完的", G => {
  assert.strictEqual(G.giverPick([A, B], "yuga", isDone([]), null).task.id, "d6c");
  assert.strictEqual(G.giverPick([A, B], "yuga", isDone(["d6c"]), null).task.id, "d6e");
});
T("全做完：說最後壹個做完的回話（有 done 用 done）", G => {
  const g = G.giverPick([A, B], "yuga", isDone(["d6c", "d6e"]), null);
  assert.strictEqual(g.task.id, "d6e"); assert.strictEqual(g.done, true); assert.strictEqual(g.text, "壹手，剛好。");
});
T("賭場：先挑做賭場的那個（casino），打完壹手就換回話，不再說前壹個", G => {
  assert.strictEqual(G.giverPick([A, B], "yuga", isDone([]), "casino").task.id, "d6e");
  const g = G.giverPick([A, B], "yuga", isDone(["d6e"]), "casino");
  assert.strictEqual(g.task.id, "d6e"); assert.strictEqual(g.done, true); assert.strictEqual(g.text, "壹手，剛好。");
});
T("賭場沒有做賭場的任務：看全部（沒做完的先）", G => {
  assert.strictEqual(G.giverPick([A], "yuga", isDone([]), "casino").task.id, "d6c");
});
T("沒有 done 的台詞：做完還是說 says", G => {
  const C = mk("d1", "make", "壹句。", null);
  assert.strictEqual(G.giverPick([C], "yuga", isDone(["d1"]), null).text, "壹句。");
});
T("餐車任務：前往直接開賭場的餐車那頁，也還算在賭場說話（11-23）", G => {
  assert.strictEqual(JSON.stringify(G.taskGo({ kind: "food" })), JSON.stringify({ room: "casino", params: { tab: "diner" } }));
  const F = mk("d2", "food", "吃壹口再下去。", null);
  assert.strictEqual(G.giverPick([A, F], "yuga", isDone([]), "casino").task.id, "d2");
});
console.log(`交代人挑壹句：${pass} 項通過、${fail} 項沒過`);
process.exit(fail ? 1 : 0);
