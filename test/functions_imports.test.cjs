// functions/*.js 用到 shared/ 或別支 functions 匯出的名字，就壹定要 import（11-15：functions/casino.js 用了 NUM 卻沒 import。
// 單元測試只測 shared/ 的規則、不載入 functions/，11-14 11:03 部署後每次產生日報都 ReferenceError，11-15 起日報都沒產生，看伺服器紀錄才查到）。
// 做法：acorn 解析每支 functions/*.js，收集檔案裡所有宣告過的名字（import、const／let／var、function、class、參數、catch）；
// 用到的變數名字如果是 shared/ 或 functions/ 匯出過的、檔案裡卻沒宣告，就算沒過。只看名字，不分範圍（寧可漏抓，不亂報）。
const fs = require("fs"), path = require("path");
const acorn = require("acorn");
const ROOT = path.join(__dirname, ".."), FN = path.join(ROOT, "functions"), SH = path.join(ROOT, "shared");
const jsIn = d => fs.readdirSync(d).filter(f => f.endsWith(".js")).map(f => path.join(d, f));
const parse = src => acorn.parse(src, { ecmaVersion: "latest", sourceType: "module", allowHashBang: true });
// 走過所有節點：fn(node, parent, key)
function walk(node, fn, parent = null, key = null) {
  if (!node || typeof node.type !== "string") return;
  fn(node, parent, key);
  for (const k of Object.keys(node)) {
    if (k === "type" || k === "start" || k === "end" || k === "loc") continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach(x => walk(x, fn, node, k)); else if (v && typeof v.type === "string") walk(v, fn, node, k);
  }
}
const patNames = (p, out) => {
  if (!p) return;
  if (p.type === "Identifier") out.add(p.name);
  else if (p.type === "ObjectPattern") p.properties.forEach(x => patNames(x.type === "RestElement" ? x.argument : x.value, out));
  else if (p.type === "ArrayPattern") p.elements.forEach(x => patNames(x, out));
  else if (p.type === "RestElement") patNames(p.argument, out);
  else if (p.type === "AssignmentPattern") patNames(p.left, out);
};
const exported = new Set();
for (const f of [...jsIn(SH), ...jsIn(FN)]) {
  let ast; try { ast = parse(fs.readFileSync(f, "utf8")); } catch (e) { continue; }
  for (const n of ast.body) {
    if (n.type === "ExportNamedDeclaration" && n.declaration) { const d = n.declaration; if (d.id) exported.add(d.id.name); if (d.declarations) d.declarations.forEach(x => patNames(x.id, exported)); }
    if (n.type === "ExportNamedDeclaration" && !n.source) n.specifiers.forEach(s => exported.add(s.exported.name));
  }
}
const bad = [];
let files = 0;
for (const f of jsIn(FN)) {
  const ast = parse(fs.readFileSync(f, "utf8")); files++;
  const decl = new Set(), used = new Set();
  walk(ast, (n, p, k) => {
    if (n.type === "ImportSpecifier" || n.type === "ImportDefaultSpecifier" || n.type === "ImportNamespaceSpecifier") decl.add(n.local.name);
    else if (n.type === "VariableDeclarator") patNames(n.id, decl);
    else if (/Function/.test(n.type)) { if (n.id) decl.add(n.id.name); n.params.forEach(x => patNames(x, decl)); }
    else if (n.type === "ClassDeclaration" || n.type === "ClassExpression") { if (n.id) decl.add(n.id.name); }
    else if (n.type === "CatchClause") patNames(n.param, decl);
    else if (n.type === "Identifier") {
      if (p && p.type === "MemberExpression" && k === "property" && !p.computed) return;
      if (p && (p.type === "Property" || p.type === "MethodDefinition" || p.type === "PropertyDefinition") && k === "key" && !p.computed) return;
      if (p && /Specifier$/.test(p.type)) return;
      if (p && (p.type === "LabeledStatement" || p.type === "BreakStatement" || p.type === "ContinueStatement")) return;
      used.add(n.name);
    }
  });
  for (const nm of used) if (exported.has(nm) && !decl.has(nm)) bad.push(`${path.relative(ROOT, f)}：用了 ${nm} 卻沒 import`);
}
if (bad.length) { console.log("FAIL functions 的 import\n  " + bad.join("\n  ")); process.exit(1); }
console.log(`functions 的 import：${files} 支檔都對（${exported.size} 個匯出的名字）`);
