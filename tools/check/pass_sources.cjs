// 館友證的雙向檢查（翊文 11-22；規劃 docs/規劃/館友證裝備整合規劃.md 第七節）。npm test 會跑，違規就失敗。
//   ① 來源多了、館友證沒跟上 → 擋：存檔欄位沒登記、清單沒登記、登記的欄位 passView 沒回、回了畫面卻沒讀、白名單裡的缺漏其實已經補了。
//   ② 館友證或登記表指到的東西已經改名或拿掉 → 擋：登記表的檔和清單不在了、passView／casPassView 回的欄位沒有對應的列、對外欄位和 cleanHallView 對不上。
// 登記表 shared/social/pass_sources.js；白名單 tools/check/pass_gaps.json（寫原因，補完就刪）。
// check(d) 是純函式（測試用）：d＝{ rows, gaps, saveKeys: { P: [], W: [] }, listExports: { 檔: [名字] }, passOut, casOut, uiSrc, pubKeys }，回傳問題清單。
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const SCAN_FILES = ["shared/core/config.js", "shared/core/systems_text.js", "shared/casino/text.js"];
const SCAN_RE = /_ITEMS$|^UPGRADES$|^RECIPES$|^BADGES$|^SKILLS$|^CAS_|^CELLAR_|^TRIAL_|^UNDERSTAND_/;
const getPath = (o, p) => p.split(".").reduce((x, k) => (x && typeof x === "object" ? x[k] : undefined), o);

function check(d) {
  const bad = [], rows = d.rows, gaps = d.gaps.gaps || [], hideSave = d.gaps.hideSave || {}, hideLists = d.gaps.hideLists || {}, hidePass = d.gaps.hidePass || {};
  const ids = new Set(); for (const r of rows) { if (ids.has(r.id)) bad.push(`登記表：id「${r.id}」重複`); ids.add(r.id); }
  // ① 存檔欄位對帳
  const saved = new Set(rows.flatMap(r => r.save));
  for (const k of ["P", "W"]) for (const f of d.saveKeys[k]) if (!saved.has(`${k}.${f}`) && !hideSave[`${k}.${f}`]) bad.push(`存檔欄位 ${k}.${f} 沒登記：在 shared/social/pass_sources.js 加壹列（或加進 tools/check/pass_gaps.json 的 hideSave 並寫原因）；館友證要不要顯示它？`);
  for (const k of Object.keys(hideSave)) if (saved.has(k)) bad.push(`白名單 hideSave 的 ${k} 已經登記了，把白名單那條刪掉`); else if (!d.saveKeys[k[0]].includes(k.slice(2))) bad.push(`白名單 hideSave 的 ${k} 存檔裡已經沒有這個欄位，刪掉`);
  for (const k of saved) if (/^[PW]\./.test(k) && !d.saveKeys[k[0]].includes(k.slice(2)) && !(d.lazy || []).includes(k)) bad.push(`登記表指到的存檔欄位 ${k} 新存檔裡沒有（改名或拿掉了？）`);
  // ① 清單掃描 + ② 登記表指的清單還在
  const listed = new Set(rows.filter(r => r.from).map(r => r.from.list));
  for (const f of SCAN_FILES) for (const n of d.listExports[f] || []) if (SCAN_RE.test(n) && !listed.has(n) && !hideLists[n]) bad.push(`${f} 的 ${n} 沒登記：在登記表加壹列的 from.list，或加進白名單 hideLists（寫原因）`);
  for (const n of Object.keys(hideLists)) if (listed.has(n)) bad.push(`白名單 hideLists 的 ${n} 已經登記了，刪掉`);
  for (const r of rows) if (r.from) {
    const ex = d.listExports[r.from.file];
    if (!ex) bad.push(`登記表 ${r.id}：來源檔 ${r.from.file} 不在檢查的清單裡（改 tools/check/pass_sources.cjs 的 SCAN_FILES）`);
    else if (!ex.includes(r.from.list)) bad.push(`登記表 ${r.id}：${r.from.file} 沒有 export ${r.from.list}（改名或拿掉了？）`);
  }
  // ① passView 真的有這個欄位、畫面真的讀它
  const gapOf = (row, kind) => gaps.filter(g => g.row === row && g.kind === kind);
  for (const r of rows) {
    const nGap = gapOf(r.id, "none").length, uGap = gapOf(r.id, "unused").length;
    if (!r.pass) { if (!nGap) bad.push(`登記表 ${r.id}（${r.name}）館友證沒有顯示：要補，或在 pass_gaps.json 的 gaps 加 kind "none" 一條（寫原因）`); continue; }
    if (nGap) bad.push(`pass_gaps.json 的 ${r.id}（none）已經有顯示了（登記表 pass 有值），把那條刪掉`);
    const out = r.pass.src === "casino" ? d.casOut : d.passOut;
    if (getPath(out, r.pass.key) === undefined) { bad.push(`登記表 ${r.id}：${r.pass.src} 的輸出裡沒有欄位 ${r.pass.key}（改名或拿掉了？）`); continue; }
    const seg = r.pass.key.split(".").pop(), read = new RegExp(["\\."+seg+"\\b", "\\b"+seg+"\\s*[:,}]", '"'+seg+'"'].join("|")).test(d.uiSrc);
    if (!read && !uGap) bad.push(`登記表 ${r.id}：${r.pass.key} 算了但畫面（web/src/panels/ui_pass.js）沒讀：畫出來，或在 gaps 加 kind "unused" 一條`);
    if (read && uGap) bad.push(`pass_gaps.json 的 ${r.id}（unused）畫面已經讀 ${r.pass.key} 了，把那條刪掉`);
  }
  for (const g of gaps) {
    if (!rows.some(r => r.id === g.row)) bad.push(`pass_gaps.json 的 gaps：找不到登記表的列「${g.row}」`);
    if (!["none", "partial", "unused"].includes(g.kind)) bad.push(`pass_gaps.json 的 gaps ${g.id}：kind 只能是 none／partial／unused`);
    if (!g.reason || !g.since || !g.id) bad.push(`pass_gaps.json 的 gaps ${g.id || g.row}：要有 id、reason、since`);
  }
  // ② 輸出的每個欄位都要有對應的列
  for (const [src, out] of [["pass", d.passOut], ["casino", d.casOut]]) for (const k of Object.keys(out)) {
    const hit = rows.some(r => r.pass && r.pass.src === src && (r.pass.key === k || r.pass.key.startsWith(k + ".")));
    if (!hit && !(src === "pass" && hidePass[k]) && !(src === "casino" && hidePass["casino." + k])) bad.push(`${src === "pass" ? "passView" : "casPassView"} 回了欄位 ${k}，登記表沒有對應的列（來源拿掉了？或加壹列／加進白名單 hidePass）`);
  }
  for (const k of Object.keys(hidePass)) { const [s, f] = k.startsWith("casino.") ? ["casino", k.slice(7)] : ["pass", k]; if (!Object.keys(s === "pass" ? d.passOut : d.casOut).includes(f)) bad.push(`白名單 hidePass 的 ${k} 輸出裡已經沒有，刪掉`); }
  // ② 對外：登記表的 pub 要等於 cleanHallView 的欄位
  const pubReg = new Set(rows.flatMap(r => r.pub)), pubOut = new Set(d.pubKeys.filter(k => k !== "open"));
  for (const k of pubOut) if (!pubReg.has(k)) bad.push(`cleanHallView 對外的欄位 ${k}，登記表沒有哪壹列的 pub 寫它`);
  for (const k of pubReg) if (!pubOut.has(k)) bad.push(`登記表的 pub 寫了 ${k}，但 cleanHallView 沒有這個欄位（拿掉了？）`);
  return bad;
}

function gather() {
  const { load } = require("../../test/load_shared.cjs"), G = load();
  const P = G.newProfile("challenge"); G.assignJob(P, "historian");
  const W = G.casWalletFix(G.casWalletNew(), "2026-11-22");
  const rd = f => fs.readFileSync(path.join(ROOT, f), "utf8");
  const listExports = {}; for (const f of SCAN_FILES) listExports[f] = [...rd(f).matchAll(/^export (?:const|function) ([A-Za-z0-9_]+)/gm)].map(m => m[1]);
  const uiSrc = fs.readdirSync(path.join(ROOT, "web/src/panels")).filter(f => /^ui_pass.*\.js$/.test(f)).map(f => rd("web/src/panels/" + f)).join("\n");
  return {
    rows: JSON.parse(JSON.stringify(G.PASS_SOURCES)), gaps: JSON.parse(rd("tools/check/pass_gaps.json")),
    saveKeys: { P: Object.keys(G.newProfile("challenge")), W: Object.keys(G.casWalletNew()) },
    lazy: ["P.casinoTitle"], // 沒有存檔預設值、第壹次戴稱號才長出來的欄位（登記表有寫，不算拿掉）
     listExports, passOut: JSON.parse(JSON.stringify(G.passView(P, { signins: 3 }))), casOut: JSON.parse(JSON.stringify(G.casPassView(W, null))), uiSrc, pubKeys: Object.keys(G.cleanHallView({ open: true })),
  };
}
module.exports = { check, gather, SCAN_FILES };
if (require.main === module) {
  const bad = check(gather());
  if (bad.length) { console.log(`館友證來源檢查：${bad.length} 個問題`); bad.forEach(b => console.log("  " + b)); process.exit(1); }
  console.log("館友證來源檢查：都對（登記表、白名單、passView、對外欄位互相對得上）");
}
