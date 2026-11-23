// 程式的規矩（tools/check/code_rules.cjs）的測試：每一條都要「抓得到壞的、放得過好的」，白名單沒用到會被抓。
const assert = require("assert");
const R = require("../../tools/check/code_rules.cjs");
const mk = obj => f => { if (!(f in obj)) throw new Error("沒這個檔 " + f); return obj[f]; };
const names = Object.keys;

// 1. shared/ 純函式
{
  const files = { "shared/a.js": "export const x = () => Math.random();\nexport const y = () => new Date();\nexport const z = () => Date.now();\nexport const w = document.title + window.innerWidth + localStorage.getItem('k') + sessionStorage.x;",
    "shared/b.js": "// Math.random 只在註解\nexport const s = \"window.x document.y\";\nexport const d = new Date(Date.UTC(2026, 0, 1)).toISOString();\nexport const o = { window: 1 }; export const q = o.window;\nexport const n = new Date(5);",
    "web/src/c.js": "Math.random(); document.title;" };
  const bad = R.checkPure(names(files), mk(files), {});
  assert.strictEqual(bad.filter(b => b.startsWith("shared/a.js")).length, 7, bad.join("\n"));
  assert.ok(!bad.some(b => b.startsWith("shared/b.js") || b.startsWith("web/")), "註解、字串、日期算術、屬性名字、web/ 都不該被擋：\n" + bad.join("\n"));
  assert.strictEqual(R.checkPure(["shared/a.js"], mk(files), { "shared/a.js|Math.random": "x", "shared/a.js|new Date()": "x", "shared/a.js|Date.now": "x", "shared/a.js|document": "x", "shared/a.js|window": "x", "shared/a.js|localStorage": "x", "shared/a.js|sessionStorage": "x" }).length, 0, "白名單要放得過");
  assert.ok(R.checkPure(["shared/b.js"], mk(files), { "shared/b.js|Math.random": "x" }).some(b => /沒有用到/.test(b)), "沒用到的白名單要報");
}
// 2. 無限動畫
{
  const css = ".a { animation: foo 1s ease-in-out infinite; }\n.b { animation: bar .3s steps(1) infinite alternate, baz 2s linear 1; }\n/* .c { animation: nope 1s infinite } */\n.d { animation-iteration-count: infinite; }\n.e { animation: three 1s 3; }";
  assert.deepStrictEqual(R.infiniteNames(css), ["foo", "bar", "(animation-iteration-count)"]);
  const f = { "web/src/css/x.css": css };
  const bad = R.checkInfinite(names(f), mk(f), {});
  assert.strictEqual(bad.length, 3, bad.join("\n"));
  assert.strictEqual(R.checkInfinite(names(f), mk(f), { "x.css": { names: ["foo", "bar", "(animation-iteration-count)"], why: "t" } }).length, 0);
  assert.ok(R.checkInfinite(names(f), mk(f), { "x.css": { names: ["foo", "bar", "(animation-iteration-count)", "gone"], why: "t" } }).some(b => /gone/.test(b)), "白名單裡已經沒有的要報");
  assert.ok(R.checkInfinite([], mk({}), { "no.css": { names: ["a"], why: "t" } }).some(b => /no\.css/.test(b)), "白名單的檔不見了要報");
}
// 3. replace(字串, 字串)
{
  const src = "a.replace('-', '/'); b.replace(\"x\", `y${z}`); c.replace(/x/g, '$1'); d.replace('k', () => 'v'); e.replace(f, 'g'); h.replace(\"-\", () => \"/\");";
  const f = { "shared/r.js": src, "test/r.js": src, "functions/shared/r.js": src };
  const bad = R.checkReplace(names(f), mk(f));
  assert.strictEqual(bad.length, 2, bad.join("\n"));
  const fx = R.fixReplace(src);
  assert.strictEqual(fx.n, 2);
  assert.strictEqual(R.fixReplace(fx.src).n, 0, "修過就乾淨");
  // 等價：$$ 在字串版會變成 $，在函式版不會，但這裡的字串都沒有 $，行為相同
  const run = s => new Function("a", "return " + s)("2026-11-20");
  assert.strictEqual(run("a.replace('-', '/')"), run("a.replace('-', () => '/')"));
}
// 4. 畫面文字用「壹」
{
  assert.deepStrictEqual(R.yiHits("每一個人、一天一次、十一天、第一章、不一樣"), ["一個", "一天", "一次", "一樣"]);
  const js = "export const A = { t: \"給你一個禮物\", u: \"給你壹個禮物\", v: `今天${n}一次`, w: \"十一次\" };\n// 一個註解\nexport const B = [\n  \"舊的一張\",\n  \"新的一張\",\n];";
  const files = { "web/src/rooms/x.js": js, "shared/core/systems_text.js": js, "shared/core/logic.js": js, "content/weeks/w/d1.json": "{\n  \"a\": \"壹個\",\n  \"b\": \"一天\",\n  \"c\": \"一次 壹檢查略過\"\n}", "content/notices/n.json": "{\"a\":\"一個\"}" };
  const added = new Map([["web/src/rooms/x.js", new Set([1, 2, 5])], ["shared/core/systems_text.js", new Set([1])], ["shared/core/logic.js", new Set([1])], ["content/weeks/w/d1.json", new Set([2, 3, 4])], ["content/notices/n.json", new Set([1])]]);
  const bad = R.checkYi(added, mk(files));
  assert.ok(bad.some(b => b.startsWith("web/src/rooms/x.js:1")), "新加的「一個」要報：" + bad.join("\n"));
  assert.ok(bad.some(b => b.startsWith("web/src/rooms/x.js:5")), "多行陣列裡新加的那行要報");
  assert.ok(!bad.some(b => b.startsWith("web/src/rooms/x.js:4")), "沒新加的行不報");
  assert.ok(!bad.some(b => /x\.js:2/.test(b)), "註解不報");
  assert.ok(bad.some(b => b.startsWith("shared/core/systems_text.js:1")), "shared 的 *_text 要查");
  assert.ok(!bad.some(b => b.startsWith("shared/core/logic.js")), "shared/core/logic.js 不是畫面文字檔");
  assert.ok(bad.some(b => b.startsWith("content/weeks/w/d1.json:3")) && !bad.some(b => /d1\.json:(2|4)/.test(b)), "json 只報新加的一天，壹和略過的不報：" + bad.join("\n"));
  assert.ok(!bad.some(b => b.startsWith("content/notices")), "公告不查");
  const d = R.parseDiff("diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -3,2 +3,3 @@\n+a\n@@ -9 +10 @@\n+b\n@@ -20,2 +20,0 @@\n-c\ndiff --git a/y b/y\n--- a/y\n+++ /dev/null\n@@ -1 +0,0 @@\n-z");
  assert.deepStrictEqual([...d.get("x")], [3, 4, 5, 10]);
  assert.ok(!d.has("y"), "刪掉的檔沒有新加的行");
}
// 5. 改名對照
{
  const text = "export const CAS_MENU = [\n  { n: 2, id: \"tea\", name: \"冰涼啤酒\", price: 45 },\n  { n: 4, id: \"juice\", name: \"堂主推薦葡萄酒\" },\n];";
  const base = { "shared/casino/text.js": text, "shared/story/core.js": "export const TASK_GIVERS = { yuga: \"Yuga Bot\", hall: \"堂主\" };" };
  const rn = [{ old: "冰涼麥茶", neu: "冰涼啤酒", table: "CAS_MENU", when: "t" }];
  const files = { ...base, "web/src/a.js": "const s = '給你壹杯冰涼麥茶';", "docs/規則/x.md": "冰涼麥茶", "docs/決定/0040.md": "冰涼麥茶", "content/weeks/w/d1.json": "冰涼麥茶" };
  const bad = R.checkNames(names(files), mk(files), rn);
  assert.deepStrictEqual(bad.map(b => b.split("：")[0]).sort(), ["docs/規則/x.md:1", "web/src/a.js:1"], bad.join("\n"));
  assert.ok(R.checkNames(names(base), mk(base), [{ old: "舊", neu: "不存在的新名", table: "CAS_MENU", when: "t" }]).some(b => /不在 CAS_MENU/.test(b)), "新名不在表裡要報");
  assert.ok(R.checkNames(names(base), mk(base), [{ old: "冰涼啤酒", neu: "冰涼啤酒", table: "CAS_MENU", when: "t" }]).some(b => /又出現在/.test(b)), "舊名變回現役要報");
  assert.ok(R.checkNames(names(base), mk(base), [{ old: "阿秤舊", neu: "堂主", table: "TASK_GIVERS", when: "t" }]).length === 0, "交代人的表也讀得到");
}
// 現在的 repo 要全部過（第 4 項看 origin/main 的差異，找不到就跳過）
{
  const log = console.log; console.log = () => {};
  let bad; try { bad = R.runAll(); } finally { console.log = log; }
  assert.deepStrictEqual(bad, [], "現在的 repo 違反了程式的規矩：\n" + bad.join("\n"));
}
// 6. 錢的漲跌顏色
{
  const css = [".bank-pl.up { color: var(--money-up); }", ".a .down, .a .up { color: #FF8A78; }", ".k-lose b { border-color: rgba(0,0,0,.5); }", ".good { color: #0f0; }", "/* .up { color: #f00; } */", ".x.up i { color: #2F6E38; }"].join(" ");
  assert.deepStrictEqual(R.moneyFindings(css), [".a .down", ".a .up", ".k-lose b", ".x.up i"]);
  const f = { "web/src/css/x.css": css };
  assert.strictEqual(R.checkMoney(names(f), mk(f), {}).length, 4);
  assert.strictEqual(R.checkMoney(names(f), mk(f), { "x.css|.a .down": "t", "x.css|.a .up": "t", "x.css|.k-lose b": "t", "x.css|.x.up i": "t" }).length, 0);
  assert.ok(R.checkMoney(names(f), mk(f), { "x.css|.a .down": "t", "x.css|.a .up": "t", "x.css|.k-lose b": "t", "x.css|.x.up i": "t", "x.css|.gone": "t" }).some(b => /gone/.test(b)), "沒用到的白名單要報");
}
{ // 資料夾的規矩第 3 條：shared/ 第一層只准子資料夾
  const RR = require("../../tools/check/repo_rules.cjs");
  const bad = RR.check(["shared/new_thing.js", "shared/core/logic.js", "shared/casino/core.js"], () => "x");
  assert.ok(bad.some(b => b.startsWith("shared/new_thing.js")), "shared/ 第一層的 .js 要被擋");
  assert.ok(!bad.some(b => b.startsWith("shared/core/")) && !bad.some(b => b.startsWith("shared/casino/")), "子資料夾裡的不擋");
}
{ // 7. 開外部程式要走 tools/dev/child.cjs
  const cpn = "child" + "_process"; // 拆開寫，這個測試檔自己才不會被第 7 項抓到
  const src = { "tools/a.cjs": `const { spawnSync } = require("${cpn}");`, "test/b.test.cjs": `const cp = require("node:${cpn}");`, "tools/dev/child.cjs": `const cp = require("${cpn}");`, "tools/c.cjs": 'const { spawnSync } = require("../dev/child.cjs");', "web/src/d.js": `import x from "${cpn}";` };
  const bad = R.checkChild(Object.keys(src), f => src[f]);
  assert.strictEqual(bad.length, 2, bad.join(" | "));
  assert.ok(bad[0].startsWith("tools/a.cjs:1") && bad[1].startsWith("test/b.test.cjs:1"));
  const C = require("../../tools/dev/child.cjs");
  const r = C.spawnSync(process.execPath, ["-e", "process.stdout.write('ok')"], { encoding: "utf8" });
  assert.strictEqual(r.stdout, "ok", "helper 要跟 child_process 壹樣能用");
  assert.strictEqual(C.execSync(`"${process.execPath}" -e "process.stdout.write('hi')"`, { encoding: "utf8" }), "hi");
  assert.strictEqual(C.hide({ windowsHide: false }).windowsHide, false, "呼叫的人可以自己蓋掉");
  assert.strictEqual(C.hide().windowsHide, true);
}
{ // 8. 開發用的程式不進 dist/
  const src = { "web/src/core/main.js": "if (import.meta.env.DEV) import(\"./qa_hooks.js\");\nimport(\"./boot.js\").then(() => { if (debugScreen) import(\"./debug_boot.js\"); });", "web/src/core/bad_main.js": "import \"./qa_hooks.js\";", "web/src/x.js": "import { a } from \"./core/debug_boot.js\";", "web/src/y.js": "// import './qa_hooks.js'" };
  const bad = R.checkDevOnly(Object.keys(src), f => src[f]);
  assert.strictEqual(bad.length, 2, bad.join(" | "));
  assert.ok(bad.some(b => b.startsWith("web/src/core/bad_main.js:1")) && bad.some(b => b.startsWith("web/src/x.js:1")));
  assert.strictEqual(R.checkDevOnly(["web/src/core/main.js"], () => "import(\"./qa_hooks.js\");").length, 1, "main.js 載入不在 DEV 判斷裡要報");
  assert.strictEqual(R.checkDevOnly([], () => "", [["dist/assets/a.js", "var a=1"]]).length, 0);
  assert.strictEqual(R.checkDevOnly([], () => "", [["dist/assets/a.js", "window.__qa={}"]]).length, 1, "dist 裡有 window.__qa 要報");
  // 假伺服器（11-22）：只有 debug_boot.js 能載入 mock_net.js，只有 mock_net.js 能載入假資料；dist 裡有 window.__mock、mock-me 要報
  const mk = { "web/src/core/debug_boot.js": "const m = (await import(\"./mock_net.js\")).installMock();", "web/src/core/main.js": "import(\"./mock_net.js\");", "web/src/core/mock_net.js": "import FIX from \"./mock/fixtures.json\";", "web/src/rooms/x.js": "import FIX from \"../core/mock/fixtures.json\";" };
  const bm = R.checkDevOnly(Object.keys(mk), f => mk[f]);
  assert.strictEqual(bm.length, 2, bm.join(" | "));
  assert.ok(bm.some(b => b.startsWith("web/src/core/main.js:1")) && bm.some(b => b.startsWith("web/src/rooms/x.js:1")));
  assert.strictEqual(R.checkDevOnly([], () => "", [["dist/assets/a.js", "window.__mock={on:1}"]]).length, 1, "dist 裡有 window.__mock 要報");
  assert.strictEqual(R.checkDevOnly([], () => "", [["dist/assets/a.js", "id:\"mock-me\""]]).length, 1, "dist 裡有 mock-me 要報");
}
T9();
function T9() {
  const css = (a, b) => ({ "web/src/css/a.css": ".mini-layer.sp-top { z-index: 9100; }\n" + (b ? ".mini-layer.sp-top ~ .nb-layer { z-index: " + b + "; }" : "") });
  const run = o => R.checkLayers(Object.keys(o), f => o[f]);
  assert.deepStrictEqual(run(css(0, 9200)), []);
  assert.strictEqual(run(css(0, 9000)).length, 1);
  assert.strictEqual(run(css(0, 0)).length, 1);
  assert.deepStrictEqual(R.checkLayers(["web/src/css/b.css"], () => ".x{color:red}"), []);
}

{ // 搬家的行不算新加的（11-23）
  const text = "壹行很長很長的文字：一個人走過一條街，看見一盞燈。", other = "一行新寫的很長很長的文字：一個人走過一條街。";
  const map = new Map([["a.js", new Set([1, 2, 3])]]);
  R.dropMoved(map, new Set([text]), () => ["短", "  " + text + "  ", other].join("\n"));
  assert.deepStrictEqual([...map.get("a.js")], [1, 3], "同樣的行被刪掉又出現＝搬家，不算新加；沒被刪的、太短的還是算");
}
console.log("程式的規矩的測試都過了");
