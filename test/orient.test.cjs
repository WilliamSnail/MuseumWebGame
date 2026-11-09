// 手機轉橫的提示（shared/orient.js、web/src/css/landscape.css）：node test/orient.test.cjs（npm test 也會跑）
// 一、「先用直的」只記在裝置上、壞掉的 storage 不丟錯。二、鎖橫向試一次、失敗不丟錯。
// 三、landscape.css 的每一條都包在兩個條件裡：電腦（高 > 500）和直拿的手機（沒有 pointer: coarse）看不到任何一條。
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
const mem = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, _m: m }; };
const broken = () => ({ getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } });

T("按「先用直的」記下來、再打開就拿掉", G => {
  const s = mem();
  assert.strictEqual(G.readOrientSkip(s, false), false);
  assert.strictEqual(G.writeOrientSkip(s, true), true);
  assert.strictEqual(G.readOrientSkip(s, false), true);
  assert.strictEqual(s._m[G.ORIENT_SKIP_KEY], "1");
  assert.strictEqual(G.writeOrientSkip(s, false), true);
  assert.strictEqual(G.readOrientSkip(s, false), false);
  assert.deepStrictEqual(Object.keys(s._m), []);
});
T("不是「1」的值不算按過（壞資料）", G => {
  const s = mem(); s.setItem(G.ORIENT_SKIP_KEY, "true");
  assert.strictEqual(G.readOrientSkip(s, false), false);
});
T("storage 被擋：不丟錯，改看這次的記憶", G => {
  const s = broken();
  assert.strictEqual(G.writeOrientSkip(s, true), false);
  assert.strictEqual(G.readOrientSkip(s, true), true);
  assert.strictEqual(G.readOrientSkip(s, false), false);
});
T("「先用直的」的 key 不是存檔的 key（不進存檔）", G => {
  assert.notStrictEqual(G.ORIENT_SKIP_KEY, G.SAVE_KEY);
  assert.ok(!/pepe_save|save/i.test(G.ORIENT_SKIP_KEY));
});
T("電腦（不是手指）不試鎖橫向", G => {
  let called = 0;
  const scr = { orientation: { lock: () => { called++; return Promise.resolve(); } } };
  assert.strictEqual(G.askLandscapeLock(scr, false), "no-touch");
  assert.strictEqual(called, 0);
});
T("沒有 lock 的瀏覽器（iPhone）：不丟錯", G => {
  assert.strictEqual(G.askLandscapeLock({}, true), "no-api");
  assert.strictEqual(G.askLandscapeLock({ orientation: {} }, true), "no-api");
  assert.strictEqual(G.askLandscapeLock(null, true), "no-api");
  assert.strictEqual(G.askLandscapeLock(undefined, true), "no-api");
});
T("有 lock：問 landscape；回來失敗（沒全螢幕）也不丟錯", G => {
  const asked = [];
  const scr = { orientation: { lock: o => { asked.push(o); return Promise.reject(new Error("NotSupportedError")); } } };
  assert.strictEqual(G.askLandscapeLock(scr, true), "asked");
  assert.deepStrictEqual(asked, ["landscape"]);
});
T("lock 直接丟錯（同步）：不丟錯", G => {
  const scr = { orientation: { lock: () => { throw new Error("SecurityError"); } } };
  assert.strictEqual(G.askLandscapeLock(scr, true), "no-api");
});
T("lock 回傳不是 Promise：不丟錯", G => {
  assert.strictEqual(G.askLandscapeLock({ orientation: { lock: () => undefined } }, true), "asked");
});

// ---- landscape.css 的結構 ----
const css = fs.readFileSync(path.join(__dirname, "..", "web/src/css/landscape.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const blocks = [];
{ // 最外層的區塊：@media (...) { ... }、@keyframes x { ... }、普通規則
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    const head = css.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < css.length && depth) { if (css[j] === "{") depth++; else if (css[j] === "}") depth--; j++; }
    blocks.push({ head, body: css.slice(open + 1, j - 1) });
    i = j;
  }
}
const ALLOWED = [
  "@media (orientation: portrait) and (max-width: 760px) and (pointer: coarse)",
  "@media (max-height: 500px) and (orientation: landscape)",
  "@media (prefers-reduced-motion: reduce) and (orientation: portrait)",
];
T("landscape.css 最外層只有：兩個條件的 @media、動畫、和壹條 .orient（預設藏起來）", () => {
  assert.ok(blocks.length > 10);
  for (const b of blocks) {
    const ok = ALLOWED.includes(b.head) || /^@keyframes or\w+$/.test(b.head) || b.head === ".orient";
    assert.ok(ok, "不在白名單：" + b.head.slice(0, 80));
  }
  const bare = blocks.filter(b => !b.head.startsWith("@"));
  assert.deepStrictEqual(bare.map(b => b.head), [".orient"]);
  assert.strictEqual(bare[0].body.replace(/\s+/g, ""), "display:none;");
});
T("提示只在「直拿、寬 ≤ 760、手指」才顯示；橫拿的版面只在「高 ≤ 500、橫著」", () => {
  const dis = blocks.filter(b => b.head === ALLOWED[0]).map(b => b.body).join("\n");
  assert.ok(/body:not\(\.orient-skip\) \.orient \{[^}]*display: flex/.test(dis));
  const landscape = blocks.filter(b => b.head === ALLOWED[1]);
  assert.ok(landscape.length >= 10);
});
T("ui_orient.js 的條件跟 css 一樣；planPortrait 不把橫拿的手機當直拿", () => {
  const core = fs.readFileSync(path.join(__dirname, "..", "web/src/ui_core.js"), "utf8");
  assert.ok(core.includes('export const LANDSCAPE_Q = "(max-height: 500px) and (orientation: landscape)";'));
  assert.ok(/export function planPortrait\(\) \{ return matchMedia\("\(max-width: 760px\)"\)\.matches && !matchMedia\(LANDSCAPE_Q\)\.matches; \}/.test(core));
});
T("設定頁有「手機直拿提醒」，公告有說手機建議橫著玩", G => {
  const s2 = fs.readFileSync(path.join(__dirname, "..", "web/src/ui_screens2.js"), "utf8");
  assert.ok(s2.includes("手機直拿提醒") && s2.includes("setOrientSkip"));
  const n = G.NOTICES.find(x => x.id === "landscape1");
  assert.ok(n && n.tags.includes("更新") && n.cat === "館方公告");
  assert.ok(/橫/.test(n.title));
  assert.ok(n.publish === "2026-11-09");
});

console.log(`${pass} passed, ${fail} failed（手機轉橫）`);
process.exit(fail ? 1 : 0);
