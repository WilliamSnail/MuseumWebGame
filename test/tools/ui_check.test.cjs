// npm run ui:check（tools/check/ui_check.cjs）的測試：不開瀏覽器，只確認清單、量測程式、報告整理沒壞，而且有寫進 AGENTS.md。
// 真的開瀏覽器要跑 npm run ui:check（太慢，不放進 npm test）。
const assert = require("assert"), fs = require("fs"), path = require("path");
const U = require("../../tools/check/ui_check.cjs");
const ROOT = path.join(__dirname, "..", "..");

assert.ok(U.SCREENS.length >= 15, "主要畫面要列齊");
assert.strictEqual(new Set(U.SCREENS.map(s => s.id)).size, U.SCREENS.length, "畫面 id 不能重複");
for (const must of ["lobby", "today", "casino", "bank", "fusion2", "cellarrun", "origin"]) assert.ok(U.SCREENS.some(s => s.id === must || s.id.startsWith(must + ":")), "少了畫面 " + must);
// 要登入的畫面標 needLogin，其他的都要是 debug_boot 認得的（網址 # 後面的畫面名稱）
const NAV = fs.readFileSync(path.join(ROOT, "web/src/core/ui_core.js"), "utf8").match(/NAV_ROOMS = \[(.*?)\];/)[1];
const known = new Set([...NAV.matchAll(/\["(\w+)"/g)].map(m => m[1]).concat(["today", "tasks", "fusion2", "cellarrun", "fight", "route", "shop", "signin", "calendar", "pass", "title", "office"]));
for (const s of U.SCREENS) assert.ok(known.has(s.id.split(":")[0]), `畫面 ${s.id} 不是 debug_boot 認得的名字`);
assert.deepStrictEqual(Object.keys(U.SIZES).sort(), ["desktop", "phone"]);
assert.deepStrictEqual([U.SIZES.phone.w, U.SIZES.phone.h, U.SIZES.desktop.w, U.SIZES.desktop.h], [375, 740, 2140, 1440]);
// 量測程式要是合法的 JS（在瀏覽器才會真的跑）
assert.doesNotThrow(() => new Function("return " + U.MEASURE));
// 報告整理
const scr = { id: "lobby", name: "大廳" };
const ps = U.summarize([
  { scr, size: "phone", m: { over: [{ el: "div.a", right: 400, left: 10, w: 390, fixed: false }], clipped: [{ el: "button.b", w: 100, h: 30, vw: 50, vh: 30 }], vertical: [{ el: "h2.t", chars: 4, lines: 4 }], hscroll: true, scrollW: 400 } },
  { scr, size: "desktop", m: { over: [], clipped: [], vertical: [], hscroll: false } },
  { scr, size: "phone", error: "boom" }]);
assert.deepStrictEqual(ps.map(p => p.kind), ["超出視窗", "按鈕被切", "字變直排", "錯誤"]);
assert.deepStrictEqual(U.summarize([{ scr, size: "phone", m: { over: [], clipped: [], vertical: [], small: [{ el: "button.go", w: 60, h: 28 }], hscroll: false } }]).map(p => p.kind), ["按鈕太小"], "手機上最重要的畫面，按鈕太小要報");
assert.ok(U.TAP_SCREENS.test("pass") && U.TAP_SCREENS.test("tasks:full") && !U.TAP_SCREENS.test("gallery"));
assert.deepStrictEqual(U.summarize([{ scr, size: "phone", m: { over: [], clipped: [], vertical: [], hscroll: true, scrollW: 500 } }]).map(p => p.kind), ["超出視窗"], "只有橫向捲軸也要報");
// 有寫進 package.json 和 AGENTS.md（改畫面的人要看得到）
assert.strictEqual(JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts["ui:check"], "node tools/check/ui_check.cjs");
assert.ok(/改了畫面，上線前一定要跑 `npm run ui:check`/.test(fs.readFileSync(path.join(ROOT, "AGENTS.md"), "utf8")), "AGENTS.md 要寫上線前一定要跑 ui:check");
console.log("ui:check 的測試都過了");
