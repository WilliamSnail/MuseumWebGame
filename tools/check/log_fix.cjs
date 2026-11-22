// 維護日誌的標題自動修：npm run log:fix（ship 上線前也會先跑，11-22）
//   11-22 翊文：「寫的維護日誌有三個段落標題沒照範本。這個有沒有辦法修正好，讓他比較少發生」
//   起因：AI 手寫日誌，把「為什麼要改」寫成「為什麼改」、「怎麼確認的」寫成「測了什麼」，ship 跑完快 3 分鐘的 npm test 才擋下來。
//   做的事（只動這個分支新加、改過的日誌，舊的不碰）：
//     1. 很接近的標題改成範本的寫法（HEAD_ALIAS）。
//     2. 「還沒做、要注意」「給下一個人」可以沒內容：漏了就補，內容寫「- 沒有」。
//     3. 「為什麼要改」「改了什麼」「怎麼確認的」要真的有內容，不自動補；還是缺就照樣報錯（ship 會在跑測試前停下來）。
//   寫新日誌最好用 npm run doc:new（tools/content/new_doc.cjs），標題壹定對。
const fs = require("fs"), path = require("path");
const { spawnSync } = require("../dev/child.cjs");
const { ROOT, check } = require("./log_lib.cjs");

const HEAD_ALIAS = [
  [/^##[ \t]*(為什麼改|為什麼|原因|背景|起因)[ \t]*$/m, "## 為什麼要改"],
  [/^##[ \t]*(改了哪些|改動|做了什麼|修了什麼|改了啥)[ \t]*$/m, "## 改了什麼"],
  [/^##[ \t]*(測了什麼.*|怎麼測的?|測試|驗證|怎麼確認|確認)[ \t]*$/m, "## 怎麼確認的"],
  [/^##[ \t]*(還沒做.*|要注意|待辦|沒做的.*|注意)[ \t]*$/m, "## 還沒做、要注意"],
  [/^##[ \t]*(給下壹個人|給下個人|下一個人|交接)[ \t]*$/m, "## 給下一個人"],
];
const TODO = "## 還沒做、要注意", NEXT = "## 給下一個人";

// 純文字進、純文字出：回傳 { text, fixed: [改了什麼的說明] }
function fixHeadings(text) {
  let t = String(text);
  const fixed = [];
  for (const [re, h] of HEAD_ALIAS) {
    if (t.includes(h)) continue;
    const m = t.match(re);
    if (m) { t = t.replace(re, () => h); fixed.push(`「${m[0].trim()}」→「${h}」`); }
  }
  if (!t.includes(TODO)) {
    const add = `${TODO}\n\n- 沒有\n\n`, i = t.indexOf(NEXT);
    t = i >= 0 ? t.slice(0, i) + add + t.slice(i) : t.replace(/\s*$/, () => `\n\n${add.trimEnd()}\n`);
    fixed.push(`補上「${TODO}」`);
  }
  if (!t.includes(NEXT)) { t = t.replace(/\s*$/, () => `\n\n${NEXT}\n\n- 沒有\n`); fixed.push(`補上「${NEXT}」`); }
  return { text: t, fixed };
}

// 這個分支動到的日誌：跟 base 比的差別＋還沒 commit 的（新檔、改過的）
function changedLogs(base = "origin/main") {
  const g = args => spawnSync("git", ["-c", "core.quotepath=false", ...args], { cwd: ROOT, encoding: "utf8" }).stdout || "";
  const names = new Set(g(["diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`]).split(/\r?\n/));
  for (const l of g(["status", "--porcelain", "--untracked-files=all"]).split(/\r?\n/)) if (l.length > 3) names.add(l.slice(3).replace(/^"|"$/g, "").trim());
  return [...names].filter(f => /^docs\/維護日誌\/\d{4}\/.+\.md$/.test(f) && fs.existsSync(path.join(ROOT, f)));
}

// 修這個分支的日誌，回傳 { fixed: [「檔：說明」], errs: [還剩的問題] }
function fixChanged(base) {
  const fixed = [], errs = [];
  for (const rel of changedLogs(base)) {
    const file = path.join(ROOT, rel), r = fixHeadings(fs.readFileSync(file, "utf8"));
    if (r.fixed.length) { fs.writeFileSync(file, r.text); fixed.push(`${rel}：${r.fixed.join("、")}`); }
    errs.push(...check(file));
  }
  return { fixed, errs };
}

if (require.main === module) {
  const bi = process.argv.indexOf("--base");
  const { fixed, errs } = fixChanged(bi > 0 ? process.argv[bi + 1] : undefined);
  if (fixed.length) console.log("改好了：\n" + fixed.join("\n"));
  if (errs.length) { console.error(errs.join("\n")); console.error(`還有 ${errs.length} 個問題要自己改（「為什麼要改」「改了什麼」「怎麼確認的」要有內容，不會自動補）`); process.exit(1); }
  if (!fixed.length) console.log("這個分支的日誌格式都對");
}

module.exports = { HEAD_ALIAS, fixHeadings, changedLogs, fixChanged };
