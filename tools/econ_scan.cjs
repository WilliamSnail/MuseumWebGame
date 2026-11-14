// 寫死金額的掃描：找 shared/、web/src/、content/ 裡「文字」寫死的金額（「1,000 萬」「2,000,000」…），
// 跟 NUM、餐車價錢對不上的列出來（檔名:行），讓改設定時知道哪些字要跟著改。翊文 11-15：「三支經濟腳本」之二。
//   npm run econ:scan            列出對不上的
//   npm run econ:scan -- --all   連對得上的也列
//   npm run econ:scan -- --strict  有對不上的就 exit 1（預設只提醒，因為「例如 100 萬」這種舉例的字常常是對的）
// 白名單：tools/econ_scan_allow.json 的 files（整個檔不掃，例如舊公告）、lines（"檔名:行" 不報）、values（這些數字不報）。
// 判斷：只看字串裡的數字（// 註解整行跳過）；數字 ≥ 100，且「N 萬／N 億／N,NNN／NNNNNN」換成數字後，不等於 NUM 裡任何壹個數字或餐車價錢，就算對不上。
// 提示：對不上、但 ×40 或 ÷40 剛好等於 NUM 的某個值，標「像舊量級」。不碰網路、不碰正式資料。
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const { load } = require("../test/load_shared.cjs");

function leaves(o, p, out) {
  if (typeof o === "number" && isFinite(o)) out.push([p, o]);
  else if (Array.isArray(o)) o.forEach((x, i) => leaves(x, p + "." + i, out));
  else if (o && typeof o === "object") for (const k of Object.keys(o)) leaves(o[k], p ? p + "." + k : k, out);
  return out;
}
function known(G) {
  const m = new Map();
  for (const [p, v] of leaves(G.NUM, "NUM", [])) if (v >= 100 && !m.has(v)) m.set(v, p);
  G.CAS_MENU.forEach(x => { if (x.price >= 100 && !m.has(x.price)) m.set(x.price, "CAS_MENU." + x.id); });
  G.CAS_PACKS.forEach((x, i) => { if (x.base >= 100 && !m.has(x.base)) m.set(x.base, "CAS_PACKS." + i); });
  return m;
}
// 壹行裡的金額：[{ text, value }]
function amounts(line) {
  const out = [];
  for (const m of line.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(萬|億)/g)) out.push({ text: m[0], value: Math.round(+m[1].replace(/,/g, "") * (m[2] === "億" ? 1e8 : 1e4)) });
  const rest = line.replace(/(\d[\d,]*(?:\.\d+)?)\s*(萬|億)/g, " ");
  const money = /籌碼|價|元|注|賺|賠|花|額|存|借|貸|費|錢|塊/.test(line); // 沒有逗號、沒有「萬」的純數字，要整行有跟錢有關的字才算（不然毫秒、年份、座標都會報）
  for (const m of rest.matchAll(/\d{1,3}(?:,\d{3})+|\d{4,}/g)) { const v = +m[0].replace(/,/g, ""); if (m[0].includes(",") || (money && !(v >= 1900 && v <= 2100))) out.push({ text: m[0], value: v }); }
  return out.filter(a => a.value >= 100);
}
function walk(dir, exts, acc) {
  if (!fs.existsSync(dir)) return acc;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) { if (f.name !== "node_modules" && f.name !== "dist") walk(p, exts, acc); } else if (exts.some(e => f.name.endsWith(e))) acc.push(p);
  }
  return acc;
}
function scan(files, kn, allow) {
  const hits = [], vals = new Set((allow.values || []).map(Number));
  for (const f of files) {
    const rel = path.relative(ROOT, f).split(path.sep).join("/");
    if ((allow.files || []).some(a => rel === a || rel.startsWith(a))) continue;
    fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
      const code = line.replace(/\/\/ .*$/, ""); // 行尾註解不看（字串裡的 // 少見）
      if (!/["'`「」]|[一-鿿]/.test(code) || /<svg|<path|<rect/.test(code)) return;
      for (const a of amounts(code)) {
        if (vals.has(a.value) || (allow.lines || []).includes(rel + ":" + (i + 1))) continue;
        const exact = kn.get(a.value);
        let hint = null;
        if (!exact) for (const k of [40, 1 / 40]) { const h = kn.get(Math.round(a.value * k)); if (h) { hint = `像舊量級（×${k === 40 ? 40 : "1/40"} ＝ ${h}）`; break; } }
        hits.push({ at: rel + ":" + (i + 1), text: a.text, value: a.value, match: exact || null, hint, line: t.slice(0, 90) });
      }
    });
  }
  return hits;
}
module.exports = { amounts, scan, known, leaves };
if (require.main === module) {
  const a = process.argv.slice(2), G = load({ __realMoney: true }), kn = known(G);
  const ap = path.join(__dirname, "econ_scan_allow.json"), allow = fs.existsSync(ap) ? JSON.parse(fs.readFileSync(ap, "utf8")) : {};
  const files = [...walk(path.join(ROOT, "shared"), [".js"], []), ...walk(path.join(ROOT, "web", "src"), [".js"], []), ...walk(path.join(ROOT, "content"), [".json"], [])];
  const hits = scan(files, kn, allow), bad = hits.filter(h => !h.match);
  (a.includes("--all") ? hits : bad).forEach(h => console.log(`${h.at}　${h.text}${h.match ? "　＝ " + h.match : h.hint ? "　" + h.hint : ""}　│ ${h.line}`));
  console.log(`\n掃了 ${files.length} 個檔：金額 ${hits.length} 處，對得上 NUM ${hits.length - bad.length} 處，對不上 ${bad.length} 處（舉例的字常常是對的；白名單在 tools/econ_scan_allow.json）`);
  if (a.includes("--strict") && bad.length) process.exit(1);
}
