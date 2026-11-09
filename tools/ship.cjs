// 把這個分支上線，一個指令走完（翊文 11-09：「有各種需要腳本加速，讓AI不用太多一步步做的地方都可以寫來重複利用」）
//   本機測試 → commit → 併 origin/main → 推上去 → 開 PR → 等 CI → 合併 → 等部署
// 任何一步失敗就停在那裡，印出原因；再跑一次會從還沒做的地方接著走（commit、PR 做過就不重做）。
// 會真的合併到 main、部署到正式站（AI 可以合併，決定 0024）：只在該上線的分支跑。
//
//   npm run ship -- --title "PR 標題" --body "PR 內容" [--message "commit 訊息"] [--skip-local] [--no-merge]
//   --body-file 檔案   內容太長時放檔案
//   --no-merge        只開 PR、等 CI，不合併
//   --skip-local      不跑本機的 npm test 和 vite build（CI 還是會跑）
// AI 的名字從環境變數 SHIP_AI 來（預設 Claude Opus 5.5）。可以跑很久，放背景跑。
const fs = require("fs"), path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const REPO = "WilliamSnail/MuseumWebGame";
const LOG_INDEX = "維護日誌/README.md";
const FOOTER = "🤖 Generated with [Claude Code](https://claude.com/claude-code)";

function parseArgs(argv) {
  const out = { flags: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`看不懂「${a}」`);
    const k = a.slice(2);
    if (["skip-local", "no-merge"].includes(k)) { out.flags.add(k); continue; }
    if (!["title", "body", "body-file", "message"].includes(k)) throw new Error(`沒有 --${k} 這個選項`);
    if (argv[i + 1] === undefined) throw new Error(`--${k} 後面要有內容`);
    out[k] = argv[++i];
  }
  return out;
}
const commitText = (msg, ai = "Claude Opus 5.5") => `${String(msg).trim()}\n\nCo-Authored-By: ${ai} <noreply@anthropic.com>\nAI: ${ai}（Claude Code）\n`;
const prBody = body => { const b = String(body || "").trim(); return b.includes(FOOTER) ? b + "\n" : `${b}\n\n${FOOTER}\n`; };
// 衝突只有日誌索引的話可以自己解（重新產生就好）；其他的要人看
const onlyIndexConflict = files => files.length > 0 && files.every(f => f === LOG_INDEX);
// main 不能直接動
const branchOk = b => !!b && b !== "main" && b !== "master";

function gh() {
  if (process.env.GH_BIN) return process.env.GH_BIN;
  const win = "C:\\Program Files\\GitHub CLI\\gh.exe";
  return fs.existsSync(win) ? win : "gh";
}
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", shell: opts.shell || false, input: opts.input, maxBuffer: 1 << 26 });
  if (r.error) throw r.error;
  if (r.status !== 0 && !opts.ok) throw new Error(`${path.basename(cmd)} ${args.slice(0, 3).join(" ")} 失敗：\n${(r.stdout + r.stderr).trim().split("\n").slice(-25).join("\n")}`);
  return Object.assign(r, { out: (r.stdout || "").trim() });
}
const git = (args, opts) => run("git", ["-c", "core.quotepath=false", ...args], opts);
const say = t => console.log(`\n▶ ${t}`);
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function mergeMain(ai) {
  git(["fetch", "-q", "origin"]);
  const r = git(["merge", "--no-edit", "origin/main"], { ok: true });
  if (r.status === 0) return;
  const files = git(["diff", "--name-only", "--diff-filter=U"]).out.split("\n").filter(Boolean);
  if (!onlyIndexConflict(files)) throw new Error(`跟 main 有衝突，要手動解：\n${files.join("\n")}`);
  run(process.execPath, ["tools/log_index.cjs"]);
  git(["add", LOG_INDEX]);
  git(["commit", "-q", "-F", "-"], { input: commitText("併 main（日誌索引重新產生）", ai) });
}

function main() {
  const o = parseArgs(process.argv.slice(2)), ai = process.env.SHIP_AI || "Claude Opus 5.5";
  if (!o.title) throw new Error("要有 --title");
  const body = o["body-file"] ? fs.readFileSync(o["body-file"], "utf8") : o.body;
  if (!body) throw new Error("要有 --body 或 --body-file");
  const branch = git(["branch", "--show-current"]).out;
  if (!branchOk(branch)) throw new Error(`現在在「${branch}」，先開分支`);

  if (!o.flags.has("skip-local")) {
    say("本機測試");
    run("npm", ["test"], { shell: true });
    run("npx", ["vite", "build"], { shell: true });
  }
  if (git(["status", "--porcelain"]).out) {
    say("commit");
    git(["add", "-A"]);
    git(["commit", "-q", "-F", "-"], { input: commitText(o.message || o.title, ai) });
  }
  say("併 origin/main");
  mergeMain(ai);
  say("推上去");
  git(["push", "-q", "-u", "origin", branch]);

  say("開 PR");
  let view = run(gh(), ["pr", "view", branch, "--repo", REPO, "--json", "number,state", "--jq", 'select(.state=="OPEN")|.number'], { ok: true });
  let n = view.status === 0 ? view.out : "";
  if (!n) {
    const url = run(gh(), ["pr", "create", "--repo", REPO, "--head", branch, "--base", "main", "--title", o.title, "--body", prBody(body)]).out;
    n = url.split("/").pop();
    console.log(url);
    sleep(15000);
  } else console.log(`已經有 PR ${n}`);

  say(`等 PR ${n} 的 CI`);
  run(gh(), ["pr", "checks", n, "--repo", REPO, "--watch", "--interval", "10"]);
  if (o.flags.has("no-merge")) { console.log("\nCI 過了，沒有合併（--no-merge）。"); return; }

  say("合併");
  run(gh(), ["pr", "merge", n, "--repo", REPO, "--merge"]);
  const sha = run(gh(), ["pr", "view", n, "--repo", REPO, "--json", "mergeCommit", "--jq", ".mergeCommit.oid"]).out;

  say("等部署");
  let id = "";
  for (let i = 0; i < 12 && !id; i++) {
    sleep(5000);
    id = run(gh(), ["run", "list", "--repo", REPO, "--workflow=deploy.yml", "--commit", sha, "--limit", "1", "--json", "databaseId", "--jq", ".[0].databaseId"], { ok: true }).out;
  }
  if (!id) throw new Error(`合併了（${sha.slice(0, 7)}），但找不到這次的部署`);
  run(gh(), ["run", "watch", id, "--repo", REPO, "--exit-status", "--interval", "10"]);
  console.log(`\n✓ PR ${n} 合併、部署成功（${sha.slice(0, 7)}）：https://github.com/${REPO}/pull/${n}`);
}

if (require.main === module) { try { main(); } catch (e) { console.error(`\n✗ ${e.message}`); process.exit(1); } }
module.exports = { parseArgs, commitText, prBody, onlyIndexConflict, branchOk };
