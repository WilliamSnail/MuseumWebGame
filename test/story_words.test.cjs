// 每週任務的旁白（決定 0048）：week.json 的 words、當天的 weeklyWords 換掉、還沒到的天讀不到；檢查擋壞的
const assert = require("assert");
const { load } = require("./load_shared.cjs");
const { checkContent } = require("../tools/week_check.cjs");
const G = load();
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL " + name + "\n    " + (e.stack || e.message)); } };
const lib = {
  weeks: { "2026-W47": {
    week: { title: "週", weekly: [{ id: "w1", kind: "readWeek", n: 1, words: "週壹的話" }, { id: "w2", kind: "readWeek", n: 2 }] },
    days: { 1: { board: "壹" }, 2: { board: "貳", weeklyWords: [{ task: "w1", words: "週二的新梗" }, { task: "沒有", words: "不算" }] }, 4: { board: "肆", weeklyWords: [{ task: "w1", words: "週四的新梗" }, { task: "w2", words: "  " }] } },
  } },
  fallback: {}, spare: {},
};
const words = today => G.storyWeekAt(lib, "2026-W47", today).weekly.map(t => t.words);
T("週一看到 week.json 的那句；沒寫的沒有", () => assert.deepStrictEqual(words("2026-11-16"), ["週壹的話", undefined]));
T("週二換成當天的新梗；認不得的任務不算", () => assert.deepStrictEqual(words("2026-11-17"), ["週二的新梗", undefined]));
T("週三沒寫：留著昨天的", () => assert.deepStrictEqual(words("2026-11-18"), ["週二的新梗", undefined]));
T("週四又換；空白的不算；讀不到還沒到的天", () => {
  assert.deepStrictEqual(words("2026-11-19"), ["週四的新梗", undefined]);
  assert.ok(!words("2026-11-16").includes("週四的新梗"));
});
T("每次都重新算：不會改到原本的內容", () => {
  words("2026-11-19");
  assert.strictEqual(lib.weeks["2026-W47"].week.weekly[0].words, "週壹的話");
});
console.log(`${pass} passed, ${fail} failed（每週任務的旁白）`);
process.exit(fail ? 1 : 0);
