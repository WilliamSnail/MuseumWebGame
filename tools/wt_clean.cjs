// 清掉用完的工作副本（.claude/worktrees/ 下面）。11-20 架構整理：一次堆了 108 個、很佔硬碟。
//   node tools/wt_clean.cjs          只列出來
//   node tools/wt_clean.cjs --do     真的刪
// 會刪的：git worktree 裡「沒有改動、HEAD 已經併進 origin/main」的；還有只剩 node_modules／dist／functions 的殘留資料夾（不是 worktree 了）。
// 不刪的：fbsnap、fbtool（固定動作用）、Claude Desktop 開給 session 的（名字像 wizardly-goldwasser-527b04，由 app 自己收）、現在所在的這個。
// ship.cjs 上線成功後會在背景跑 --do（不等它）。
const fs = require("fs"), path = require("path"), { spawnSync } = require("child_process");
const git = (args, cwd) => spawnSync("git", args, { cwd, encoding: "utf8" });
const common = git(["rev-parse", "--git-common-dir"], process.cwd()).stdout.trim();
const ROOT = path.resolve(process.cwd(), common, "..");
const DIR = path.join(ROOT, ".claude", "worktrees");
const KEEP = new Set(["fbsnap", "fbtool"]);
const SESSION = /^[a-z]+-[a-z]+-[0-9a-f]{6}$/;
const RECENT_MS = 6 * 3600e3;
const here = path.resolve(process.cwd());
const doIt = process.argv.includes("--do"), quiet = process.argv.includes("--quiet");
const log = (...a) => { if (!quiet) console.log(...a); };
function plan() {
  const out = { remove: [], leftover: [], kept: [] };
  if (!fs.existsSync(DIR)) return out;
  git(["fetch", "-q", "origin"], ROOT);
  for (const name of fs.readdirSync(DIR)) {
    const d = path.join(DIR, name);
    if (!fs.statSync(d).isDirectory()) continue;
    if (KEEP.has(name) || SESSION.test(name) || here === d || here.startsWith(d + path.sep)) { out.kept.push(name); continue; }
    if (!fs.existsSync(path.join(d, ".git"))) {
      const rest = fs.readdirSync(d).filter(x => !["node_modules", "dist", "functions"].includes(x));
      if (!rest.length) out.leftover.push(name); else out.kept.push(name);
      continue;
    }
    // 6 小時內動過的不收（11-20：剛開、還沒改東西的 worktree 看起來也是「沒改動、已併進 main」，被收掉過一次）
    const gd = path.resolve(d, git(["rev-parse", "--git-dir"], d).stdout.trim());
    const touched = Math.max(...["index", "HEAD", "logs/HEAD"].map(x => { try { return fs.statSync(path.join(gd, x)).mtimeMs; } catch (e) { return 0; } }));
    if (Date.now() - touched < RECENT_MS) { out.kept.push(name + "（6 小時內動過）"); continue; }
    if (git(["status", "--porcelain"], d).stdout.trim()) { out.kept.push(name + "（有改動）"); continue; }
    if (git(["merge-base", "--is-ancestor", "HEAD", "origin/main"], d).status !== 0) { out.kept.push(name + "（還沒併進 main）"); continue; }
    out.remove.push(name);
  }
  return out;
}
if (require.main === module) {
  const p = plan();
  log(`可以刪：worktree ${p.remove.length} 個、殘留資料夾 ${p.leftover.length} 個；保留 ${p.kept.length} 個`);
  if (!doIt) { p.remove.concat(p.leftover).forEach(n => log("  " + n)); process.exit(0); }
  let n = 0;
  for (const name of p.remove) if (git(["worktree", "remove", path.join(DIR, name)], ROOT).status === 0) n++;
  for (const name of p.leftover) { try { fs.rmSync(path.join(DIR, name), { recursive: true, force: true }); n++; } catch (e) { log("刪不掉 " + name + "：" + e.message); } }
  git(["worktree", "prune"], ROOT);
  log(`刪了 ${n} 個`);
}
module.exports = { plan, SESSION };
