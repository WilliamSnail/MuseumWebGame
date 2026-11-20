// 檢查模組之間的 import／export：node tools/check/check_imports.cjs（npm test 會跑）
// 為什麼要有：打包（vite build）只會擋「import 了一個對方沒 export 的名字」，
// 但「用到別的檔 export 的名字、卻忘了 import」不會擋，要等玩家玩到那一行才壞（ReferenceError）。
// 這裡用 acorn＋eslint-scope 找出每個檔「沒宣告、也沒 import，卻用到」的名字，只要那個名字是專案裡別的檔 export 的，就算錯。
// 另外也檢查：ui_core.js 不准 import 比它後面的畫面檔（理由見 docs/規則/架構.md 4.1 節）。
const fs = require("fs"), path = require("path");
const acorn = require("acorn"), es = require("eslint-scope");

const ROOT = path.join(__dirname, "..", "..");
const sharedJs = d => fs.readdirSync(path.join(ROOT, "shared", d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? sharedJs(d ? d + "/" + e.name : e.name) : e.name.endsWith(".js") ? [d ? d + "/" + e.name : e.name] : []);
const webJs = d => fs.readdirSync(path.join(ROOT, "web/src", d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? (["css", "assets"].includes(e.name) ? [] : webJs(d ? d + "/" + e.name : e.name)) : e.name.endsWith(".js") ? [d ? d + "/" + e.name : e.name] : []);
const FILES = [
  ...sharedJs("").map(f => "shared/" + f), // shared/ 有子資料夾（casino/、coop/…），連裡面的檔一起查
  ...webJs("").map(f => "web/src/" + f), // web/src/ 也有子資料夾（core/、fx/、rooms/、panels/），連裡面的檔一起查
];
const LATER_THAN_CORE = ["ui_screens1.js", "ui_screens2.js", "ui_screens3.js", "ui_curio.js", "ui_odd.js", "ui_board.js", "ui_login.js", "ui_party.js", "ui_coop.js", "ui_trace.js", "ui_signin.js", "ui_story.js", "ui_admin.js", "ui_shop.js", "ui_visit.js", "ui_themeshow.js", "ui_board_rank.js", "ui_today.js", "ui_hub.js", "ui_pass.js", "ui_mates.js", "ui_casino_slot.js", "ui_casino_live.js", "ui_casino.js", "ui_casino_table.js", "ui_casino_week.js", "ui_events.js", "ui_orient.js", "ui_discord.js", "ui_update.js", "ui_work.js", "ui_lobby2.js", "boot.js", "debug_boot.js", "main.js"];

const info = {};
for (const f of FILES) {
  const code = fs.readFileSync(path.join(ROOT, f), "utf8");
  let ast;
  try { ast = acorn.parse(code, { ecmaVersion: "latest", sourceType: "module", ranges: true, locations: true }); }
  catch (e) { info[f] = { error: `${f}：語法錯誤 ${e.message}` }; continue; }
  const exported = new Set();
  const imports = [], named = [], reAll = [], reNames = new Set();
  for (const st of ast.body) {
    // 再匯出（export * from "./x.js"、export { a } from "./x.js"）：名字算這個檔的，但不算「宣告在這裡」（所以不會被當成重複）
    if (st.type === "ExportAllDeclaration") { imports.push(st.source.value); reAll.push(st.source.value); }
    if (st.type === "ExportNamedDeclaration" && st.source) { imports.push(st.source.value); st.specifiers.forEach(x => reNames.add(x.exported.name)); }
    if (st.type === "ExportNamedDeclaration" && st.declaration) {
      const d = st.declaration;
      if (d.id) exported.add(d.id.name);
      if (d.declarations) d.declarations.forEach(x => x.id.type === "Identifier" && exported.add(x.id.name));
    }
    if (st.type === "ImportDeclaration") {
      imports.push(st.source.value);
      named.push({ src: st.source.value, line: st.loc.start.line, names: st.specifiers.filter(s => s.type === "ImportSpecifier").map(s => s.imported.name) });
    }
  }
  const sm = es.analyze(ast, { ecmaVersion: 2022, sourceType: "module" });
  const g = sm.globalScope;
  const through = [];
  const walkScope = s => { s.through.forEach(r => through.push(r)); };
  walkScope(g);
  info[f] = { exported, imports, named, through, reAll, reNames };
}

// 這個檔拿得到的名字：自己宣告的＋再匯出的（遞迴）
const allExports = (f, seen = new Set()) => {
  const it = info[f];
  if (!it || !it.exported || seen.has(f)) return new Set();
  seen.add(f);
  const out = new Set([...it.exported, ...it.reNames]);
  for (const src of it.reAll) { const t = path.relative(ROOT, path.resolve(ROOT, path.dirname(f), src)).split(path.sep).join("/"); allExports(t, seen).forEach(n => out.add(n)); }
  return out;
};
const owner = {};
for (const f of FILES) if (info[f].exported) for (const n of info[f].exported) (owner[n] = owner[n] || []).push(f);

const errs = [];
for (const f of FILES) {
  const it = info[f];
  if (it.error) { errs.push(it.error); continue; }
  const seen = new Set();
  for (const r of it.through) {
    const n = r.identifier.name;
    if (!owner[n] || seen.has(n)) continue;
    seen.add(n);
    errs.push(`${f}:${r.identifier.loc.start.line}：用到「${n}」但沒有 import（它在 ${owner[n].join("、")}）`);
  }
  // import 了對方沒 export 的名字（打包也會擋，但 npm test 不打包；開發中的頁面會整頁載不起來）
  for (const im of it.named) {
    if (!im.src.startsWith(".")) continue;
    const target = path.relative(ROOT, path.resolve(ROOT, path.dirname(f), im.src)).split(path.sep).join("/");
    const t = info[target];
    if (!t || !t.exported) continue;
    const have = allExports(target);
    for (const n of im.names) if (!have.has(n)) errs.push(`${f}:${im.line}：import 了「${n}」，可是 ${target} 沒有 export 它`);
  }
  if (f === "web/src/core/ui_core.js") {
    for (const src of it.imports) {
      const base = path.basename(src);
      if (LATER_THAN_CORE.includes(base)) errs.push(`web/src/core/ui_core.js：不准 import ${src}（ui_core 不能 import 比它後面的畫面檔）`);
    }
  }
}
// shared/ 的檔互相 import 不准繞圈（A 拿 B、B 又拿 A）：繞圈的話，只要頂層一用到對方的東西就看載入順序，載入順序一變就壞。共用的東西抽到更下層的檔。
{
  const shared = FILES.filter(f => f.startsWith("shared/") && !info[f].error);
  const dep = f => info[f].imports.filter(x => x.startsWith(".")).map(x => path.relative(ROOT, path.resolve(ROOT, path.dirname(f), x)).split(path.sep).join("/")).filter(x => info[x]);
  const state = {}, stack = [];
  const dfs = f => {
    state[f] = 1; stack.push(f);
    for (const d of dep(f)) {
      if (state[d] === 1) { errs.push("shared/ 的 import 繞圈了：" + [...stack.slice(stack.indexOf(d)), d].join(" → ")); }
      else if (!state[d]) dfs(d);
    }
    stack.pop(); state[f] = 2;
  };
  shared.forEach(f => { if (!state[f]) dfs(f); });
}
// 例外：fx_core.js 的小工具 h（做 DOM 元素）和 ui_core.js 的 h 是兩個不同的東西，兩邊不互相 import
const SAME_NAME_OK = { h: ["web/src/fx/fx_core.js", "web/src/core/ui_core.js"] };
for (const [n, fs2] of Object.entries(owner)) if (fs2.length > 1 && !(SAME_NAME_OK[n] && fs2.every(f => SAME_NAME_OK[n].includes(f)))) errs.push(`同一個名字「${n}」在 ${fs2.join("、")} 都有 export`);

if (errs.length) { console.error(errs.join("\n")); console.error(`${errs.length} 個問題`); process.exit(1); }
console.log(`模組 ${FILES.length} 個，import／export 都對得上`);
