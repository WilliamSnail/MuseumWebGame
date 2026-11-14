// 把這個分支上線，一個指令走完（翊文 11-09：「有各種需要腳本加速，讓AI不用太多一步步做的地方都可以寫來重複利用」）
//   本機測試 → commit → 併 origin/main（tools/merge_main.cjs，會自動解公告、索引的衝突） → 推上去 → 開 PR → 等 CI → 合併 → 等部署
// 任何一步失敗就停在那裡，印出原因；再跑一次會從還沒做的地方接著走（commit、PR 做過就不重做）。
// 會真的合併到 main、部署到正式站（AI 可以合併，決定 0024）：只在該上線的分支跑。
//
//   npm run ship -- --title "PR 標題" --body "PR 內容" [--message "commit 訊息"] [--skip-local] [--no-merge]
//   --body-file 檔案   內容太長時放檔案
//   --no-merge        只開 PR、等 CI，不合併
//   --skip-local      不跑本機的 npm test 和 vite build（CI 還是會跑）
//   沒給 --body：拿這個分支新加的維護日誌的「為什麼要改」「改了什麼」當 PR 說明（11-14：常常忘了給說明被擋）
//   --say "文字"／--say-file 檔案   部署成功後發 Discord（tools/say.cjs；翊文：每次上線都要發）
//   --after-deploy "指令"           部署成功後再跑壹條指令（每日排程用：--after-deploy "gh workflow run discord-scheduled.yml --ref main"）
//   --no-notice       不是玩家看得到的改動，不用提醒公告（改了 web／shared／functions 卻沒動 shared/notices.js 會印警告，不擋）
// AI 的名字從環境變數 SHIP_AI 來（預設 Claude Opus 5.5）。可以跑很久，放背景跑。
const fs = require("fs"), path = require("path");
const { spawnSync } = require("child_process");
const { mergeMain: mergeFromMain } = require("./merge_main.cjs");

const ROOT = path.join(__dirname, "..");
const REPO = "WilliamSnail/MuseumWebGame";
const FOOTER = "🤖 Generated with [Claude Code](https://claude.com/claude-code)";

function parseArgs(argv) {
  const out = { flags: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`看不懂「${a}」`);
    const k = a.slice(2);
    if (["skip-local", "no-merge", "no-notice"].includes(k)) { out.flags.add(k); continue; }
    if (!["title", "body", "body-file", "message", "say", "say-file", "after-deploy"].includes(k)) throw new Error(`沒有 --${k} 這個選項`);
    if (argv[i + 1] === undefined) throw new Error(`--${k} 後面要有內容`);
    out[k] = argv[++i];
  }
  return out;
}
const commitText = (msg, ai = "Claude Opus 5.5") => `${String(msg).trim()}\n\nCo-Authored-By: ${ai} <noreply@anthropic.com>\nAI: ${ai}（Claude Code）\n`;
const prBody = body => { const b = String(body || "").trim(); return b.includes(FOOTER) ? b + "\n" : `${b}\n\n${FOOTER}\n`; };
// main 不能直接動
const branchOk = b => !!b && b !== "main" && b !== "master";
const titleOk = t => [...String(t || "").trim()].length >= 4; // 擋掉 --title x 這種占位的
// PR 剛開，GitHub 可能還沒登記 CI：這時 gh pr checks 會失敗，但不是真的失敗，要等
const noChecksYet = text => /no checks reported/i.test(String(text || ""));

function gh() {
  if (process.env.GH_BIN) return process.env.GH_BIN;
  const win = "C:\\Program Files\\GitHub CLI\\gh.exe";
  return fs.existsSync(win) ? win : "gh";
}
// 失敗的時候印什麼：測試從第壹個 ✗ 開始（不然會被後面過的項目蓋掉），其他的印最後 25 行
function failText(out) {
  const lines = out.trim().split("\n"), i = lines.findIndex(l => l.startsWith("✗"));
  return (i >= 0 ? lines.slice(i, i + 25) : lines.slice(-25)).join("\n");
}
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", shell: opts.shell || false, input: opts.input, maxBuffer: 1 << 26 });
  if (r.error) throw r.error;
  if (r.status !== 0 && !opts.ok) throw new Error(`${path.basename(cmd)} ${args.slice(0, 3).join(" ")} 失敗：\n${failText(r.stdout + r.stderr)}`);
  return Object.assign(r, { out: (r.stdout || "").trim() });
}
const git = (args, opts) => run("git", ["-c", "core.quotepath=false", ...args], opts);
const say = t => console.log(`\n▶ ${t}`);
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const mergeMain = ai => mergeFromMain(commitText("併 main（自動解衝突）", ai));

// 維護日誌的兩段拿來當 PR 說明（純函式，測試用）
function bodyFromLog(md) {
  const parts = ("\n" + String(md || "")).split("\n## ");
  const sec = name => { const p = parts.find(x => x.startsWith(name)); return p ? p.slice(name.length).trim() : ""; };
  const why = sec("為什麼要改"), what = sec("改了什麼");
  return why || what ? [why, what].filter(Boolean).join("\n\n") : "";
}
// 改了玩家看得到的地方卻沒加公告（純函式，測試用）：回傳要印的警告，沒事回空字串
function noticeWarning(files) {
  const f = files.filter(Boolean);
  if (f.includes("shared/notices.js")) return "";
  const seen = f.filter(x => /^(web\/|functions\/|shared\/)/.test(x) && !/\.test\.|^shared\/npc_roster\.js$/.test(x));
  return seen.length ? `⚠ 改了 ${seen.slice(0, 3).join("、")}${seen.length > 3 ? ` 等 ${seen.length} 個檔` : ""}，但沒有加館方公告（npm run notice -- …）。不是玩家看得到的就加 --no-notice。` : "";
}
const changedFiles = () => git(["diff", "--name-only", "origin/main...HEAD"], { ok: true }).out.split("\n").map(s => s.trim()).filter(Boolean);

function main() {
  const o = parseArgs(process.argv.slice(2)), ai = process.env.SHIP_AI || "Claude Opus 5.5";
  if (!titleOk(o.title)) throw new Error("--title 要寫真的標題：它會變成 commit 訊息和 PR 標題，推上去就改不回來");
  let body = o["body-file"] ? fs.readFileSync(o["body-file"], "utf8") : o.body;
  const sayText = o["say-file"] ? fs.readFileSync(o["say-file"], "utf8") : o.say;
  if (sayText) require("./say.cjs").checkText(sayText); // 先檢查，免得上線完才發現發不出去
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
  const files = changedFiles();
  if (!body) {
    const log = files.find(f => /^維護日誌\/\d{4}\/.+\.md$/.test(f));
    body = log ? bodyFromLog(fs.readFileSync(path.join(ROOT, log), "utf8")) : "";
    if (!body) throw new Error("要有 --body 或 --body-file（這個分支也沒有新的維護日誌可以拿來當說明）");
    console.log(`PR 說明用維護日誌：${log}`);
  }
  const nw = o.flags.has("no-notice") ? "" : noticeWarning(files);
  if (nw) console.log(nw);
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
  for (let i = 0; i < 18; i++) {
    const c = run(gh(), ["pr", "checks", n, "--repo", REPO], { ok: true });
    if (!noChecksYet(c.stdout + c.stderr)) break;
    if (i === 17) throw new Error(`PR ${n} 等了 3 分鐘還是沒有 CI`);
    sleep(10000);
  }
  // 等 CI、合併。等 CI 的時候 main 常常又動了（好幾個 session 同時上線），合併會因為衝突失敗：
  //   這時再併壹次 main（自動解公告、日誌總表）、推上去、重等 CI，最多 4 次（11-14：美術統籌壹輪撞了四次都要手動解）
  for (let tryN = 1; ; tryN++) {
    run(gh(), ["pr", "checks", n, "--repo", REPO, "--watch", "--interval", "10"]);
    if (o.flags.has("no-merge")) { console.log("\nCI 過了，沒有合併（--no-merge）。"); return; }
    say("合併");
    const m = run(gh(), ["pr", "merge", n, "--repo", REPO, "--merge"], { ok: true });
    if (m.status === 0) break;
    if (tryN >= 4) throw new Error(`PR ${n} 合併失敗 ${tryN} 次：${(m.stdout + m.stderr).trim().slice(-300)}`);
    say(`合併失敗（main 動了），再併壹次 main 重來（第 ${tryN + 1} 次）`);
    mergeMain(ai);
    git(["push", "-q", "origin", branch]);
    sleep(15000);
  }
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
  let after = true;
  if (sayText) {
    say("發 Discord");
    try { const r = require("./say.cjs").sayDiscord(sayText); console.log(r.ok ? "✓ Discord 發好了" : `✗ Discord 沒發成功：${r.url}`); after = after && r.ok; }
    catch (e) { console.log(`✗ Discord 沒發成功：${e.message}`); after = false; }
  }
  if (o["after-deploy"]) {
    say(`部署後：${o["after-deploy"]}`);
    const r = spawnSync(o["after-deploy"], { cwd: ROOT, encoding: "utf8", shell: true });
    console.log(((r.stdout || "") + (r.stderr || "")).trim().slice(-500));
    if (r.status !== 0) { console.log("✗ 部署後的指令失敗了（PR 已經上線）"); after = false; }
  }
  backToMain();
  if (!after) { nw && console.log(nw); throw new Error("PR 上線了，但部署後要做的事有壹件沒成功（看上面）"); }
  if (nw) console.log(`\n${nw}`);
}

// 上線完回到 main、拉最新（11-10：每次都要手動做，OneDrive 還常鎖住 index，切到一半會留下壹堆「改過的檔」）。
// 鎖住就等 2 秒重試；真的回不去只提醒，不算失敗（PR 已經上線了）。
function backToMain() {
  // worktree 裡不切：main 被主資料夾佔著，切了壹定失敗（11-14 每次都印「沒能回到 main」）
  const gd = git(["rev-parse", "--git-dir"], { ok: true }).out, cd = git(["rev-parse", "--git-common-dir"], { ok: true }).out;
  if (gd && cd && path.resolve(ROOT, gd) !== path.resolve(ROOT, cd)) { console.log("（在 worktree 裡：不切回 main，用完可以 git worktree remove）"); return; }
  for (let i = 0; i < 6; i++) {
    const a = git(["checkout", "main"], { ok: true });
    const b = a.status === 0 ? git(["pull", "--ff-only"], { ok: true }) : a;
    if (b.status === 0) { console.log("回到 main，拉到最新了。"); return; }
    sleep(2000);
  }
  console.log("（沒能回到 main：等壹下自己跑 git checkout main、git pull）");
}

if (require.main === module) { try { main(); } catch (e) { console.error(`\n✗ ${e.message}`); process.exit(1); } }
module.exports = { parseArgs, commitText, prBody, branchOk, noChecksYet, titleOk, bodyFromLog, noticeWarning };
