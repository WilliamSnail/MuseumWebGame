// 併 origin/main，只會「大家都往後加」的檔案自動解衝突（翊文 11-09：「自動收集各種可能多步驟但其實可以用腳本加速的地方，讓子代裡需要也可以共用這些腳本」）
//   npm run merge:main
// 自動解的：測試清單和模組清單（兩邊都留）；11-16 公告拆檔後：公告是一則一個檔（不會撞），日誌總表和音效特效總表不進 git（不會撞）。
// 公告拆檔前開的分支帶著舊的 shared/notices.js（陣列裡插了新公告）：把裡面 main 還沒有的公告拆成檔（tools/notices_migrate.cjs 的 rescue），notices.js 留 main 的。其他的衝突停下來，要人看。
const fs = require("fs"), path = require("path");
const { spawnSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
const NOTICES_JS = "shared/notices.js";
const GENERATED = ["維護日誌/README.md", "docs/素材/音效與特效總表.md"]; // 11-16 起不進 git（npm run log:index、npm run fx:report 產生）
// 兩邊都留
const KEEP_BOTH = { "test/run_all.cjs": "plain", "test/tools.test.cjs": "plain", "test/esm_smoke.mjs": "list", "test/load_shared.cjs": "list", "tools/check_imports.cjs": "list", "docs/現況.md": "plain", "tools/README.md": "plain" };
const canAuto = f => f === NOTICES_JS || GENERATED.includes(f) || !!KEEP_BOTH[f];

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
  files.filter(f => GENERATED.includes(f)).forEach(f => git(["rm", "-q", "--cached", "--ignore-unmatch", f], { ok: true })); // 不進 git 了：留本機的檔，從合併裡拿掉
  if (files.includes(NOTICES_JS)) {
    // 兩邊誰還帶著舊陣列（stage 2＝我這邊、3＝main 那邊）：把裡面還沒有檔的公告拆出去，notices.js 留沒有陣列的那一邊
    const N = require("./notices_migrate.cjs"), side = n => { const r = git(["show", ":" + n + ":" + NOTICES_JS], { ok: true }); return r.status === 0 ? r.stdout : ""; };
    const mine = side(2), theirs = side(3), rescued = [];
    for (const src of [mine, theirs]) if (src) rescued.push(...N.rescue(src, path.join(ROOT, "content", "notices")));
    if (rescued.length) console.log(`公告：舊 notices.js 裡還沒有檔的 ${rescued.length} 則拆成檔了：${rescued.join("、")}`);
    const oldMine = N.extract(mine || "") !== null; // 我這邊是舊陣列 → 用 main 的（新）；否則用我的（新）
    git(["checkout", oldMine ? "--theirs" : "--ours", NOTICES_JS]);
    git(["add", NOTICES_JS]);
    if (rescued.length) git(["add", "content/notices"]);
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
