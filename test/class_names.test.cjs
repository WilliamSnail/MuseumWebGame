// class 名字的檢查（11-13，docs/class名單.md）：node test/class_names.test.cjs（npm test 也會跑）
//
// 為什麼：新大廳在 <html> 上加了 .ui2，後來委託櫃台的 css 也用 .ui2 當前綴，
// 結果 .ui2 .note-card 改到全遊戲的委託單、地下房間卡、打怪面板。
//
// 擋三件事：
//   1. css 規則用「html／body 上的全域 class + 後代」當開頭（例如 .big-ui .note-card），而且不在名單的「允許」裡。
//   2. JS 往 document.body／documentElement 加了名單裡沒有的 class（要先登記到名單才准加）。
//   3. 名單裡的全域 class 在 css／JS 裡完全沒出現（名單過期了）。
// 只印警告、不擋：css 出現了名單沒有的新前綴（class 名字開頭 xx-）。
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const DOC = path.join(ROOT, "docs", "class名單.md");
const CSS_DIR = path.join(ROOT, "web", "src", "css");
const JS_DIR = path.join(ROOT, "web", "src");

// ---- 讀名單 ----
function tableRows(md, heading) {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex(l => /^##\s/.test(l) && l.includes(heading));
  assert.ok(start >= 0, `class名單.md 找不到「${heading}」這一節`);
  const rows = [];
  for (let i = start + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) {
    if (!/^\s*\|/.test(lines[i]) || /^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) continue;
    rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim()));
  }
  return rows.slice(1); // 第一列是表頭
}
const ticks = cell => [...cell.matchAll(/`([^`]+)`/g)].map(m => m[1]);
const toRe = name => new RegExp("^" + name.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");

const md = fs.readFileSync(DOC, "utf8");
const globals = [];
tableRows(md, "全域 class").forEach(r => { const n = ticks(r[0])[0]; if (n) globals.push({ name: n, re: toRe(n) }); });
assert.ok(globals.length >= 10, "名單裡的全域 class 太少，表格格式是不是壞了");
const isGlobal = c => globals.some(g => g.re.test(c));
const globalName = c => (globals.find(g => g.re.test(c)) || {}).name;

const allow = []; // { file, re, cls }
tableRows(md, "允許的例外").forEach(r => {
  const cls = ticks(r[0]), files = ticks(r[1]);
  cls.forEach(c => files.forEach(f => allow.push({ file: f, re: toRe(c), cls: c })));
});
const isAllowed = (file, cls) => allow.some(a => (a.file === "*" || a.file === file) && a.re.test(cls));

const knownPrefix = new Set();
tableRows(md, "CSS 前綴").forEach(r => ticks(r[0]).forEach(p => knownPrefix.add(p)));

// ---- 掃 css ----
function stripCss(s) { return s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " ")).replace(/url\([^)]*\)/g, "url()"); }
function splitTop(s, sep) { // 括號外的分隔
  const out = []; let depth = 0, cur = "";
  for (const ch of s) {
    if ("([".includes(ch)) depth++; else if (")]".includes(ch)) depth--;
    if (depth === 0 && (sep === "," ? ch === "," : /[\s>+~]/.test(ch))) { if (sep === "," || cur) out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur) out.push(cur);
  return sep === "," ? out : out.filter(Boolean);
}
// 一個選擇器從頭數起：html／body／純全域 class 的段落，後面還有別的 → 回傳用到的全域 class
function leadingGlobals(sel) {
  const parts = splitTop(sel.trim(), " "); // 以空白、>、+、~ 切開
  const found = []; let i = 0;
  for (; i < parts.length; i++) {
    const p = parts[i];
    const m = /^(html|body|:root)?((?:\.[\w-]+)*)$/.exec(p);
    if (!m || (!m[1] && !m[2])) break;
    const cls = [...m[2].matchAll(/\.([\w-]+)/g)].map(x => x[1]);
    if (!m[1] && !cls.every(isGlobal)) break; // 沒寫 html／body 的，一定要全是全域 class 才算
    found.push(...cls.filter(isGlobal));
    if (cls.some(c => !isGlobal(c)) && !m[1]) break;
  }
  return i < parts.length && found.length ? found : [];
}

const violations = [];
const usedGlobalInCss = new Set();
const prefixCount = {}; // 前綴 → { n: 不同 class 數, files: Set }
fs.readdirSync(CSS_DIR).filter(f => f.endsWith(".css")).forEach(file => {
  const css = stripCss(fs.readFileSync(path.join(CSS_DIR, file), "utf8"));
  css.replace(/([^{}]+)\{/g, (m, head) => {
    if (/^\s*@/.test(head)) return m;
    splitTop(head, ",").forEach(sel => {
      for (const c of sel.matchAll(/\.([A-Za-z][\w-]*)/g)) {
        if (isGlobal(c[1])) usedGlobalInCss.add(globalName(c[1]));
        if (c[1].includes("-")) {
          const p = c[1].split("-")[0] + "-";
          const o = prefixCount[p] || (prefixCount[p] = { names: new Set(), files: new Set() });
          o.names.add(c[1]); o.files.add(file);
        }
      }
      const g = leadingGlobals(sel);
      const bad = g.filter(c => !isAllowed(file, c));
      if (bad.length) violations.push(`${file}：「${sel.trim().slice(0, 80)}」以全域 class ${bad.map(c => "." + c).join("、")} 開頭，會套到全部畫面`);
    });
    return m;
  });
});
assert.ok(Object.keys(prefixCount).length > 20, "css 掃不到東西，檢查壞了");
assert.deepStrictEqual(violations.slice(0, 8), [],
  `\n有 css 規則用全域 class 當開頭（共 ${violations.length} 條）。\n` +
  "全域 class 是加在 <html>／<body> 上的，整個遊戲都有；拿它當前綴會改到別的畫面（11-13 的 .ui2 事件）。\n" +
  "改用這個畫面自己的 class 當前綴（先查 docs/class名單.md）。真的要全域，把它寫進名單「允許的例外」。");

// ---- 掃 JS：往 body／documentElement 加的 class 要先登記 ----
const jsFiles = fs.readdirSync(JS_DIR).filter(f => f.endsWith(".js")).map(f => path.join(JS_DIR, f));
const usedGlobalInJs = new Set(), unlisted = [];
// b／root 這種短名字在別處是別的東西；只認「const b = document.body」宣告後 2500 字元內的
function aliasNear(src, idx) {
  const before = src.slice(Math.max(0, idx - 2500), idx);
  return /const b = document\.body|root = document\.documentElement/.test(before);
}
jsFiles.forEach(file => {
  const src = fs.readFileSync(file, "utf8");
  // document.body.classList.add("a", "b-" + x)／document.documentElement.classList.toggle(...)；也看 const b = document.body 之後的 b.classList
  const reCall = /(?:document\.(?:body|documentElement)|\b(?:b|root))\.classList\.(add|toggle)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
  let m;
  while ((m = reCall.exec(src))) {
    const isDirect = /^document/.test(m[0]);
    if (!isDirect && !aliasNear(src, m.index)) continue;
    const firstArgs = m[2].split(/,(?![^(]*\))/)[0]; // toggle 只有第一個參數是 class 名；add 全部是
    const args = m[1] === "toggle" ? [firstArgs] : m[2].split(",");
    args.forEach(a => {
      const lit = /["'`]([\w-]+)["'`]/.exec(a);
      if (!lit) return; // 變數：不查（例如 cls）
      const name = lit[1] + (/["'`]\s*\+/.test(a) && lit[1].endsWith("-") ? "*" : "");
      const gl = globals.find(g => g.name === name || g.re.test(name));
      if (gl) usedGlobalInJs.add(gl.name); else unlisted.push(`${path.relative(ROOT, file)}：${name}`);
    });
  }
});
assert.deepStrictEqual(unlisted, [],
  "\nJS 往 <html>／<body> 加了名單裡沒有的 class。先把它登記到 docs/class名單.md 的「全域 class」，再來加。");

// ---- 名單過期：登記了卻完全沒用到 ----
const stale = globals.filter(g => !usedGlobalInCss.has(g.name) && !usedGlobalInJs.has(g.name)).map(g => g.name);
// 這幾個是用變數或 data 屬性加的，掃不到字面，不算過期
const EXEMPT_STALE = ["holiday-*"];
assert.deepStrictEqual(stale.filter(n => !EXEMPT_STALE.includes(n)), [], "\n名單裡的全域 class 在 css 和 JS 都找不到：改名了嗎？把名單更新。");

// ---- 新前綴：只警告 ----
const warns = Object.entries(prefixCount)
  .filter(([p, o]) => o.names.size >= 5 && !knownPrefix.has(p) && !isGlobal(p.slice(0, -1)) && !isGlobal(p + "*"))
  .map(([p, o]) => `${p}（${[...o.files].slice(0, 2).join("、")}，${o.names.size} 個 class）`);
if (warns.length) console.log("  警告：css 有名單裡沒有的前綴，請補進 docs/class名單.md「CSS 前綴」：\n   " + warns.join("\n   "));

// 這個檢查本身要擋得住：假的壞例子
(function selfTest() {
  assert.deepStrictEqual(leadingGlobals(".reduce-motion .x"), ["reduce-motion"]);
  assert.deepStrictEqual(leadingGlobals("html.new-lobby-on body.cellar-on .x"), ["new-lobby-on", "cellar-on"]);
  assert.deepStrictEqual(leadingGlobals("body.reduce-motion"), [], "只有 body.xxx 沒有後代，不算");
  assert.deepStrictEqual(leadingGlobals(".screen.onescreen-room .x"), []);
  assert.deepStrictEqual(leadingGlobals("body:not(.room-frame-on) #room"), []);
  assert.deepStrictEqual(leadingGlobals("body.lights-out > .x"), ["lights-out"]);
})();

console.log(`class 名字檢查：全域 class ${globals.length} 個、css ${fs.readdirSync(CSS_DIR).filter(f => f.endsWith(".css")).length} 個檔、允許的例外 ${allow.length} 條，沒有規則用全域 class 當開頭`);
