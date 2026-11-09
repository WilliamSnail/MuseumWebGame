// 開一個工作資料夾：從最新的 origin/main 開分支，接好 node_modules（翊文 11-09：「需要腳本的也寫好」）。
//   同時做好幾件事的時候用，子代理一人一個，才不會互相蓋掉。接依賴用 junction，不用重裝，也不會佔空間。
//
//   npm run wt -- --dir C:\某處\econ --branch claude/拚經濟
//   npm run wt -- --dir C:\某處\econ --remove        收掉（只拿掉資料夾和 junction，依賴本體不會動）
const fs = require("fs"), path = require("path");
const { spawnSync } = require("child_process");

const LINKS = ["node_modules", path.join("functions", "node_modules")];
const branchOk = b => !!b && /^claude\/./.test(b) && !/\s/.test(b);
function parseArgs(argv) {
  const o = { dir: null, branch: null, remove: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--remove") o.remove = true;
    else if (a === "--dir" || a === "--branch") { if (argv[i + 1] === undefined) throw new Error(`${a} 後面要有內容`); o[a.slice(2)] = argv[++i]; }
    else throw new Error(`看不懂「${a}」`);
  }
  if (!o.dir) throw new Error("要有 --dir");
  if (!o.remove && !branchOk(o.branch)) throw new Error("--branch 要是 claude/ 開頭、沒有空白");
  return o;
}
function git(args, cwd) {
  const r = spawnSync("git", ["-c", "core.quotepath=false", ...args], { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args[0]} 失敗：${(r.stderr || r.stdout).trim().slice(-300)}`);
  return r.stdout.trim();
}
// 主資料夾（放著真正的 node_modules）
const mainRoot = cwd => path.dirname(path.resolve(cwd, git(["rev-parse", "--git-common-dir"], cwd)));

function main() {
  const o = parseArgs(process.argv.slice(2)), here = path.join(__dirname, ".."), root = mainRoot(here), dir = path.resolve(o.dir);
  if (o.remove) {
    // 先拿掉 junction：不然後面刪資料夾有機會刪到依賴本體
    LINKS.forEach(l => { const p = path.join(dir, l); if (fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink()) fs.rmSync(p, { recursive: false, force: true }); });
    git(["worktree", "remove", "--force", dir], root);
    console.log(`收掉了 ${dir}`);
    return;
  }
  if (fs.existsSync(dir)) throw new Error(`已經有 ${dir}`);
  git(["fetch", "-q", "origin"], root);
  git(["worktree", "add", "-q", "-b", o.branch, dir, "origin/main"], root);
  for (const l of LINKS) {
    const target = path.join(root, l);
    if (!fs.existsSync(target)) throw new Error(`主資料夾沒有 ${l}：先在 ${root} 跑 npm install`);
    fs.symlinkSync(target, path.join(dir, l), "junction");
  }
  console.log(`好了：${dir}（${o.branch}）`);
}

if (require.main === module) { try { main(); } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); } }
module.exports = { parseArgs, branchOk };
