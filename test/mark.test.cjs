// shared/logic.js 的 markTokens：說明文字標重點（翊文 11-09）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
const G = load();
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL " + name + "\n    " + e.message); } };
const J = x => JSON.parse(JSON.stringify(x));
const kinds = s => J(G.markTokens(s)).filter(x => x.k).map(x => x.k + ":" + x.t);

T("寫的人可以用 **重點**，星號不會留在畫面上", () => {
  assert.deepStrictEqual(kinds("用 **3 隻**進去"), ["em:3 隻"]);
  assert.strictEqual(J(G.markTokens("用 **3 隻**進去")).map(x => x.t).join(""), "用 3 隻進去");
});
T("獎勵綠、扣的紅", () => {
  assert.deepStrictEqual(kinds("找到了（靈感 +3）"), ["good:靈感 +3"]);
  assert.deepStrictEqual(kinds("理智 -2"), ["bad:理智 -2"]);
  assert.deepStrictEqual(kinds("心情 +1～10"), ["good:心情 +1"]);
});
T("短的名字、樓層、數量、時間都標；長的引號不標（那是劇情的話）", () => {
  assert.deepStrictEqual(kinds("到「兌換所」看看"), ["em:「兌換所」"]);
  assert.deepStrictEqual(kinds("「撿到的東西請放這裡。失主請在週日以前來領。」"), []);
  assert.deepStrictEqual(kinds("去 B1 看看"), ["em:B1"]);
  assert.deepStrictEqual(kinds("帶 3 隻佩佩下去"), ["em:3 隻佩佩"]);
  assert.deepStrictEqual(kinds("今晚 20:00～22:00"), ["em:20:00～22:00"]);
  assert.deepStrictEqual(kinds("壹陣冷風"), [], "中文數字的句子不標，不然滿篇都是");
});
T("原文不會少字；壞資料不丟錯", () => {
  const s = "帶 3 隻佩佩，靈感 +2，到「館長室」，**重點**。";
  assert.strictEqual(J(G.markTokens(s)).map(x => x.t).join(""), s.replace(/\*\*/g, ""));
  assert.deepStrictEqual(J(G.markTokens(null)), []);
  assert.deepStrictEqual(J(G.markTokens("")), []);
});

console.log(`${pass} passed, ${fail} failed（說明文字標重點）`);
process.exit(fail ? 1 : 0);
