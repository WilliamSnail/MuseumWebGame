// 交過的委託，下次登入不能再交（翊文 11-09：「委託任務怎麼好像交了之後，今天下次登入還能繼續交?」）
// 原因：新名字「俄國8+9」裡面就有舊名字「俄國8」，每次載入都被當成舊存檔，今天的委託被清空重抽。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(load()); pass++; } catch (e) { fail++; console.log("FAIL " + name + "\n    " + (e.stack || e.message)); } };

const saveWith = (G, patch) => {
  const P = G.newProfile("challenge");
  G.ensureDay(P, "2026-11-09");
  const list = G.dailyCommissions(P, "2026-11-09");
  list[0].done = true;
  P.done = 1;
  return JSON.parse(JSON.stringify(Object.assign(P, patch)));
};
const reload = (G, P) => G.fixProfile(JSON.parse(JSON.stringify(P)), "challenge");
const doneOf = (G, P) => G.dailyCommissions(P, "2026-11-09").filter(c => c.done).length;

T("存檔裡有新名字「俄國8+9」：載入不清掉今天的委託", G => {
  const P = saveWith(G, {});
  P.unlocked[G.CATS[0]] = ["俄國8+9"];
  P.pepes["俄國8+9|甲"] = 1;
  const back = reload(G, P);
  assert.strictEqual(doneOf(G, back), 1, "交過的還是交過");
  assert.strictEqual(doneOf(G, reload(G, back)), 1, "再載入壹次也壹樣");
});
T("真的舊存檔：收藏照樣改成新名字", G => {
  const P = saveWith(G, {});
  P.pepes = { "俄國8|甲": 2 };
  const back = reload(G, P);
  assert.deepStrictEqual(Object.keys(back.pepes).filter(k => k.startsWith("俄國8")).map(k => k.split("|")[0]), ["俄國8+9"]);
  assert.ok(!JSON.stringify(back.pepes).includes("俄國8|"));
});
T("舊名字只留在收藏裡、不在委託裡：委託不清掉", G => {
  const P = saveWith(G, {});
  P.pepes = { "俄國8|甲": 2 };
  assert.strictEqual(doneOf(G, reload(G, P)), 1);
});
T("委託本身寫著舊名字才重抽（舊的條件交不出來）", G => {
  const P = saveWith(G, {});
  P.daily.list[0].need = { [G.CATS[0]]: "俄國8" };
  assert.strictEqual(reload(G, P).daily, null);
});
T("委託寫的是新名字：不重抽", G => {
  const P = saveWith(G, {});
  P.daily.list[0].need = { [G.CATS[0]]: "俄國8+9" };
  assert.ok(reload(G, P).daily);
});
T("hasOldName：只認舊名字，不被新名字騙", G => {
  assert.strictEqual(G.hasOldName("俄國8+9"), false);
  assert.strictEqual(G.hasOldName("俄國8"), true);
  assert.strictEqual(G.hasOldName("俄國8+9 俄國8"), true);
  assert.strictEqual(G.hasOldName(""), false);
});
console.log(`${pass} passed, ${fail} failed（交過的委託）`);
process.exit(fail ? 1 : 0);
