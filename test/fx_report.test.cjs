// 音效與特效總表（11-16）：docs/音效與特效總表.md 跟程式對得上（npm run fx:report -- --check），加上解析用的正規式
const assert = require("assert"), cp = require("child_process"), path = require("path");
const R = require("../tools/fx_report.cjs");
let n = 0;
const t = (name, fn) => { fn(); n++; };

t("snd(\"名字\", 音量)", () => {
  const x = R.findSnd('a();\nsnd("hurt", 0.5);\nconst snd = 1;', null);
  assert.strictEqual(x.length, 1); assert.deepStrictEqual(x[0].names, ["hurt"]); assert.strictEqual(x[0].vol, "0.5"); assert.strictEqual(x[0].line, 2);
});
t("snd 三元式兩個名字都算；名字放變數就是動態", () => {
  const known = new Set(["coin", "error", "bell"]);
  const a = R.findSnd('snd(ev.win ? "coin" : ev.loot ? "coin" : "error");', known);
  assert.deepStrictEqual(a[0].names, ["coin", "coin", "error"]);
  const b = R.findSnd("snd(kind);", known);
  assert.ok(b[0].dynamic);
});
t("不會把 xsnd( 或 .snd( 當成 snd(", () => {
  assert.strictEqual(R.findSnd('mysnd("coin"); o.snd("coin");', null).length, 0);
});
t("sndFile(\"id\", 音量)", () => {
  const x = R.findSndFile('if (a) sndFile("coin-drop", 0.4);\nFX.sound.file("wind", 0.2);\nsndFile(id, 1)');
  assert.deepStrictEqual(x.map(r => r.ids[0] || null), ["coin-drop", "wind", null]);
  assert.strictEqual(x[0].vol, "0.4"); assert.ok(x[2].dynamic);
});
t("fileLoop／fileOnce 的 id 和音量", () => {
  const x = R.findFileCalls("fileLoop(c, g, 'museum-hall', 0.18).n; fileOnce(c, g, pick(a), rand(0.1, 0.2)); fileOnce(c, g, 'x-y', 0.3)");
  assert.strictEqual(x.length, 3);
  assert.deepStrictEqual([x[0].kind, x[0].ids, x[0].vol], ["fileLoop", ["museum-hall"], "0.18"]);
  assert.ok(x[1].dynamic); assert.strictEqual(x[2].ids[0], "x-y");
});
t("splitArgs 不會被括號、字串裡的逗號切開", () => {
  assert.deepStrictEqual(R.splitArgs('a ? "x,y" : f(1, 2), 0.3'), ['a ? "x,y" : f(1, 2)', "0.3"]);
});
t("fnAt 找得到外面的函式", () => {
  const lines = ["export function foo() {", "  if (x) {", '    snd("a");', "  }", "}"];
  assert.strictEqual(R.fnAt(lines, 2), "foo");
});

// 總表是最新的
const r = cp.spawnSync(process.execPath, [path.join(__dirname, "..", "tools", "fx_report.cjs"), "--check"], { encoding: "utf8" });
assert.strictEqual(r.status, 0, "程式改了、總表沒更新：跑 npm run fx:report\n" + (r.stderr || r.stdout));
n++;
console.log(`${n} passed, 0 failed（音效與特效總表）`);
