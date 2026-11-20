// 音效與特效總表（11-16）：docs/素材/音效與特效總表.md 由程式產生（npm run fx:report，不進 git），--check 只檢查程式跟 fx_notes.json 對得上，加上解析用的正規式
const fs = require("fs"), assert = require("assert"), cp = require("child_process"), path = require("path");
const R = require("../../tools/check/fx_report.cjs");
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

// 總表不進 git：先檢查「程式跟清單對得上」，再在本機產生一次，下面的檢查讀產生出來的檔
{
  const chk = cp.spawnSync(process.execPath, [path.join(__dirname, "..", "..", "tools", "check", "fx_report.cjs"), "--check"], { encoding: "utf8" });
  assert.strictEqual(chk.status, 0, "程式跟 content/fx_notes.json 對不上：跑 npm run fx:report\n" + (chk.stderr || chk.stdout));
  const gen = cp.spawnSync(process.execPath, [path.join(__dirname, "..", "..", "tools", "check", "fx_report.cjs")], { encoding: "utf8" });
  assert.strictEqual(gen.status, 0, "產生總表失敗\n" + (gen.stderr || gen.stdout));
  n++;
}
// 打鬥聲音表算進總表：skill-reveal、war-drums-hit 不能被誤判「沒人用」，todo 的項數有列
{
  const doc = fs.readFileSync(path.join(__dirname, "..", "..", "docs", "素材", "音效與特效總表.md"), "utf8");
  const unusedLine = doc.split(/\r?\n/).find(l => l.startsWith("- **沒人用的**"));
  assert.ok(!/skill-reveal|war-drums-hit/.test(unusedLine), "打鬥聲音表用到的音效檔被判成沒人用");
  assert.ok(/還在用合成音、之後要找錄音的：\d+ 項/.test(doc) && doc.includes("## 7. 地下打鬥的聲音"));
  n++;
}
console.log(`${n} passed, 0 failed（音效與特效總表）`);
