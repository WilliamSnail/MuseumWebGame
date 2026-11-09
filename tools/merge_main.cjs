// 併 origin/main，只會「大家都往後加」的檔案自動解衝突（翊文 11-09：「自動收集各種可能多步驟但其實可以用腳本加速的地方，讓子代裡需要也可以共用這些腳本」）
//   npm run merge:main
// 自動解的：日誌索引（重新產生）、館方公告（兩邊都留）、測試清單和模組清單（兩邊都留）。其他的衝突停下來，要人看。
const fs = require("fs"), path = require("path");
const { spawnSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
const INDEX = "維護日誌/README.md";
// 兩邊都留。notice：每則是 { … }，衝突裡的兩段開頭共用一個 "  {"，要補回去
const KEEP_BOTH = { "shared/notices.js": "notice", "test/run_all.cjs": "plain", "test/tools.test.cjs": "plain", "test/esm_smoke.mjs": "list", "test/load_shared.cjs": "list", "tools/check_imports.cjs": "list", "docs/現況.md": "plain", "tools/README.md": "plain" };
const canAuto = f => f === INDEX || !!KEEP_BOTH[f];

const MARK = /^<<<<<<< [^\n]*\n([\s\S]*?)^=======\n([\s\S]*?)^>>>>>>> [^\n]*\n/gm;
// 一行的清單（load_shared 的 ORDER、esm_smoke 的模組表）兩邊各加了東西：以對方為底，把我這邊多的放回原本的前一項後面
function mergeListLine(oursLine, theirsLine) {
  // 收尾（"]; // 註解"）兩邊都有的先拿掉，最後一項才比得到
  let n = 0;
  while (n < oursLine.length && n < theirsLine.length && oursLine[oursLine.length - 1 - n] === theirsLine[theirsLine.length - 1 - n]) n++;
  let cut = oursLine.length - n;
  while (cut < oursLine.length && !"]}".includes(oursLine[cut])) cut++;
  const tail = oursLine.slice(cut), ours = oursLine.slice(0, cut), theirs = theirsLine.slice(0, theirsLine.length - tail.length);
  const a = ours.split(", "), out = theirs.split(", ");
  a.forEach((tok, i) => {
    if (out.includes(tok)) return;
    const at = i > 0 ? out.indexOf(a[i - 1]) : -1;
    out.splice(at + 1, 0, tok);
  });
  return out.join(", ") + tail;
}
const oneLine = s => s.split("\n").length === 2 && s.endsWith("\n");
function keepBoth(text, how = "plain") {
  return text.replace(MARK, (m, ours, theirs) => {
    if (how === "notice") { // git 會把兩邊共同的收尾（"    ],\n  },"）留在衝突外面：我這邊要自己補上才是完整的壹則
      const whole = /^ {2}\},\n$/m.test(ours.slice(ours.lastIndexOf("\n", ours.length - 2) + 1));
      return `${ours}${whole ? "" : "    ],\n  },\n"}  {\n${theirs}`;
    }
    if (how === "list" && oneLine(ours) && oneLine(theirs)) return mergeListLine(ours.trimEnd(), theirs.trimEnd()) + "\n";
    return ours + theirs;
  });
}
function git(args, opts = {}) {
  const r = spawnSync("git", ["-c", "core.quotepath=false", ...args], { cwd: ROOT, encoding: "utf8", input: opts.input });
  if (r.status !== 0 && !opts.ok) throw new Error(`git ${args[0]} 失敗：${(r.stdout + r.stderr).trim().slice(-400)}`);
  return r;
}
// 解得掉回傳解掉的檔案；解不掉丟錯（合併留在原狀，看得到衝突）
function resolveConflicts() {
  const files = git(["diff", "--name-only", "--diff-filter=U"]).stdout.split("\n").filter(Boolean);
  const stuck = files.filter(f => !canAuto(f));
  if (stuck.length) throw new Error(`這些要手動解：\n${stuck.join("\n")}`);
  files.filter(f => KEEP_BOTH[f]).forEach(f => {
    const p = path.join(ROOT, f);
    fs.writeFileSync(p, keepBoth(fs.readFileSync(p, "utf8"), KEEP_BOTH[f]));
    git(["add", f]);
  });
  if (files.includes(INDEX)) {
    spawnSync(process.execPath, ["tools/log_index.cjs"], { cwd: ROOT });
    git(["add", INDEX]);
  }
  return files;
}
function mergeMain(commitMsg = "併 main") {
  git(["fetch", "-q", "origin"]);
  const r = git(["merge", "--no-edit", "origin/main"], { ok: true });
  if (r.status === 0) return [];
  const files = resolveConflicts();
  git(["commit", "-q", "-F", "-"], { input: commitMsg + "\n" });
  return files;
}
if (require.main === module) {
  try { const f = mergeMain(); console.log(f.length ? `併好了，自動解了：${f.join("、")}` : "併好了。"); }
  catch (e) { console.error(e.message); process.exit(1); }
}
module.exports = { keepBoth, canAuto, mergeMain, resolveConflicts };
