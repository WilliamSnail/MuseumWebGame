// 把這個分支上線，一個指令走完（翊文 11-09：「有各種需要腳本加速，讓AI不用太多一步步做的地方都可以寫來重複利用」）
//   本機測試 → commit → 併 origin/main（tools/merge_main.cjs，會自動解公告、索引的衝突） → 推上去 → 開 PR → 等 CI → 合併 → 等部署
// 任何一步失敗就停在那裡，印出原因；再跑一次會從還沒做的地方接著走（commit、PR 做過就不重做）。
// 會真的合併到 main、部署到正式站（AI 可以合併，決定 0024）：只在該上線的分支跑。
//
//   npm run ship -- --title "PR 標題" --body "PR 內容" [--message "commit 訊息"] [--skip-local] [--no-merge]
//   --body-file 檔案   內容太長時放檔案
//   --no-merge        只開 PR、等 CI，不合併
//   --skip-local      不跑本機的 npm test 和 vite build（CI 還是會跑）
//   --full            強制照舊全跑本機的 npm test 和 build。沒給的話：這個分支改到的檔案全部是「內容」（content/、維護日誌/（公告在 content/notices/）、
//                     .claude/，加上從 content 打包出來的 shared/npc_roster.js、shared/map_data.js）時，本機改跑 npm run day:check（要過才繼續），
//                     不跑 npm test 和 vite build（11-16 每日排程優化：內容 PR 每次省 2～5 分鐘；CI 和部署照跑，安全網還在）。
//                     只要有任何程式檔（web/、shared/ 其他檔、functions/、tools/、test/、package.json…）就照舊全跑
//   沒給 --body：拿這個分支新加的維護日誌的「為什麼要改」「改了什麼」當 PR 說明（11-14：常常忘了給說明被擋）
//   --say "文字"／--say-file 檔案   **不再馬上發**（11-15，翊文：「Discord更新太洗板了」）：玩家看得到的改動只要加館方公告（npm run notice），
//                                   每天 20:00 .github/workflows/discord-digest.yml 會把當天的公告合成壹則發出去。給了 --say 只印提醒，不發。
//   --say-now "文字"                大更新要馬上發才用（tools/say.cjs）：例如新廳開放、全館活動開跑、壞掉修好要通知大家
//   --say-now-file 檔案             同上，文字放檔案。**多行壹定用這個**：Windows 上 npm run 經過 cmd.exe，參數裡的換行後面會被切掉（11-17 Discord 只發出標題）
//   --after-deploy "指令"           部署成功後再跑壹條指令（每日排程用：--after-deploy "gh workflow run discord-scheduled.yml --ref main"）
//   --no-notice       不是玩家看得到的改動，不用提醒公告（改了 web／shared／functions 卻沒加 content/notices/ 的公告檔會印警告，不擋）
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
    if (["skip-local", "no-merge", "no-notice", "full"].includes(k)) { out.flags.add(k); continue; }
    if (!["title", "body", "body-file", "message", "say", "say-file", "say-now", "say-now-file", "after-deploy"].includes(k)) throw new Error(`沒有 --${k} 這個選項`);
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
// CI 的結果（純函式，測試用）：none 還沒有、wait 還在跑、ok 全過、fail 有沒過的
const CI_OK = ["success", "skipped", "neutral"];
const checksState = runs => !runs || !runs.length ? "none" : runs.some(r => r.status !== "completed") ? "wait" : runs.every(r => CI_OK.includes(r.conclusion)) ? "ok" : "fail";
const noChecksYet = text => /no checks reported/i.test(String(text || ""));

const { gh, waitRun } = require("./gh_lib.cjs"); // 11-15 合併成共用的
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

// 只動「內容」嗎（純函式，測試用）：每個檔案都在內容路徑裡才算；空的清單不算（沒東西就照舊全跑）。
// 內容路徑：content/、維護日誌/（公告在 content/notices/）、.claude/（交接檔，不進遊戲），以及 content 打包出來的 shared/npc_roster.js、shared/map_data.js
const { isContentFile, contentOnly } = require("./changed_files.cjs"); // 11-16 第二批：抽到共用的檔，CI 也用同壹個判斷
// 本機要跑什麼：{ mode: "skip" | "content" | "full", line }（line 是要印的壹行說明）
function localPlan(files, flags) {
  const has = x => flags && flags.has && flags.has(x);
  if (has("skip-local")) return { mode: "skip", line: "（--skip-local：不跑本機的 npm test 和 build，CI 還是會跑）" };
  if (!has("full") && contentOnly(files)) return { mode: "content", line: `這次只改內容（${files.length} 個檔，全在 content/、維護日誌/、公告、.claude/）：跳過本機的 npm test 和 build，改跑 npm run day:check；CI 和部署照跑。要全跑加 --full` };
  return { mode: "full", line: has("full") ? "（--full：本機全跑 npm test 和 build）" : "" };
}
// 還沒 commit 的時候，這個分支相對 origin/main 改到哪些檔（已 commit、沒 commit、新檔都算）
function pendingFiles() {
  const base = git(["merge-base", "origin/main", "HEAD"], { ok: true }).out || "origin/main";
  const a = git(["diff", "--name-only", base], { ok: true }).out, b = git(["ls-files", "--others", "--exclude-standard"], { ok: true }).out;
  return [...new Set([...a.split("\n"), ...b.split("\n")].map(x => x.trim()).filter(Boolean))];
}

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
  if (f.some(x => x.startsWith("content/notices/"))) return "";
  const seen = f.filter(x => /^(web\/|functions\/|shared\/)/.test(x) && !/\.test\.|^shared\/npc_roster\.js$/.test(x));
  return seen.length ? `⚠ 改了 ${seen.slice(0, 3).join("、")}${seen.length > 3 ? ` 等 ${seen.length} 個檔` : ""}，但沒有加館方公告（npm run notice -- …）。不是玩家看得到的就加 --no-notice。` : "";
}
const changedFiles = () => git(["diff", "--name-only", "origin/main...HEAD"], { ok: true }).out.split("\n").map(s => s.trim()).filter(Boolean);

function main() {
  const o = parseArgs(process.argv.slice(2)), ai = process.env.SHIP_AI || "Claude Opus 5.5";
  if (!titleOk(o.title)) throw new Error("--title 要寫真的標題：它會變成 commit 訊息和 PR 標題，推上去就改不回來");
  let body = o["body-file"] ? fs.readFileSync(o["body-file"], "utf8") : o.body;
  if (o.say || o["say-file"]) console.log("（--say 不再馬上發 Discord：每天 20:00 會把今天的館方公告合成壹則發；這次有加公告就會列進去。大更新要馬上發用 --say-now）");
  if (o["say-now"] && o["say-now-file"]) throw new Error("--say-now 和 --say-now-file 只能擇壹");
  const sayText = o["say-now-file"] ? fs.readFileSync(o["say-now-file"], "utf8") : o["say-now"];
  if (o["say-now"] && process.platform === "win32" && process.env.npm_lifecycle_event) console.log("（提醒：用 npm run 在 Windows 上傳 --say-now，文字裡的換行後面會被切掉；多行請改 --say-now-file 檔案）");
  if (sayText) require("./say.cjs").checkText(sayText); // 先檢查，免得上線完才發現發不出去
  const branch = git(["branch", "--show-current"]).out;
  if (!branchOk(branch)) throw new Error(`現在在「${branch}」，先開分支`);

  const lp = localPlan(pendingFiles(), o.flags);
  if (lp.line) console.log(lp.line);
  if (lp.mode === "full") {
    say("本機測試");
    run("npm", ["test"], { shell: true });
    run("npx", ["vite", "build"], { shell: true });
  } else if (lp.mode === "content") {
    say("內容檢查（npm run day:check）");
    run("npm", ["run", "day:check"], { shell: true });
  }
  // 只有 package-lock.json 變了、package.json 沒變：多半是 npm install 改的（11-15 每日排程），還原，不要包進 PR。裝套件請用 npm ci
  { const st = git(["status", "--porcelain"]).out.split(/\r?\n/).map(l => l.slice(3).trim()); if (st.includes("package-lock.json") && !st.includes("package.json")) { git(["checkout", "--", "package-lock.json"]); console.log("（package-lock.json 只因 npm install 變了，還原；裝套件用 npm ci）"); } }
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
  // PR、CI、合併都走 REST（gh api）：雲端排程的環境擋 GraphQL，gh pr create／checks／merge 會失敗（11-15 每日排程）。gh run（部署）本來就是 REST
  const api = (args, opts) => run(gh(), ["api", ...args], opts);
  const owner = REPO.split("/")[0];
  let n = api([`repos/${REPO}/pulls?state=open&head=${encodeURIComponent(owner + ":" + branch)}`, "--jq", ".[0].number // empty"], { ok: true }).out;
  if (!n) {
    n = api(["-X", "POST", `repos/${REPO}/pulls`, "-f", `title=${o.title}`, "-f", `head=${branch}`, "-f", "base=main", "-f", `body=${prBody(body)}`, "--jq", ".number"]).out;
    console.log(`https://github.com/${REPO}/pull/${n}`);
    sleep(15000);
  } else console.log(`已經有 PR ${n}`);

  // 等 CI：看 PR 最新那個 commit 的 check runs，全部跑完才算；有壹個不是 success／skipped／neutral 就是沒過
  const waitCi = () => {
    say(`等 PR ${n} 的 CI`);
    let netErr = 0;
    for (let i = 0; i < 120; i++) { // 最多 20 分鐘
      const shaR = api([`repos/${REPO}/pulls/${n}`, "--jq", ".head.sha"], { ok: true });
      if (shaR.status !== 0 || !shaR.out) { if (++netErr >= 6) throw new Error(`查 PR ${n} 的最新 commit 連續失敗 ${netErr} 次：${(shaR.stderr || "").trim().slice(-200)}`); sleep(10000); continue; } // 網路短暫錯誤：等壹下再查
      netErr = 0;
      const sha = shaR.out;
      const runs = JSON.parse(api([`repos/${REPO}/commits/${sha}/check-runs?per_page=100`, "--jq", "[.check_runs[]|{name,status,conclusion}]"], { ok: true }).out || "[]");
      const st = checksState(runs);
      if (st === "ok") { console.log(`CI 過了（${runs.length} 項）`); return; }
      if (st === "fail") throw new Error(`PR ${n} 的 CI 沒過：${runs.filter(r => !CI_OK.includes(r.conclusion)).map(r => r.name + " " + r.conclusion).join("、")}（gh run list --branch ${branch}）`);
      if (st === "none" && i === 18) throw new Error(`PR ${n} 等了 3 分鐘還是沒有 CI`);
      sleep(10000);
    }
    throw new Error(`PR ${n} 的 CI 20 分鐘還沒跑完`);
  };
  // 等 CI 的時候 main 常常又動了（好幾個 session 同時上線），合併會因為衝突失敗：
  //   這時再併壹次 main（自動解公告、日誌總表）、推上去、重等 CI，最多 4 次（11-14：美術統籌壹輪撞了四次都要手動解）
  let sha = "";
  for (let tryN = 1; ; tryN++) {
    waitCi();
    if (o.flags.has("no-merge")) { console.log("\nCI 過了，沒有合併（--no-merge）。"); return; }
    say("合併");
    const m = api(["-X", "PUT", `repos/${REPO}/pulls/${n}/merge`, "-f", "merge_method=merge", "--jq", ".sha"], { ok: true });
    if (m.status === 0 && m.out) { sha = m.out; break; }
    if (tryN >= 4) throw new Error(`PR ${n} 合併失敗 ${tryN} 次：${(m.stdout + m.stderr).trim().slice(-300)}`);
    say(`合併失敗（main 動了），再併壹次 main 重來（第 ${tryN + 1} 次）`);
    mergeMain(ai);
    git(["push", "-q", "origin", branch]);
    sleep(15000);
  }

  say("等部署");
  let id = "";
  for (let i = 0; i < 12 && !id; i++) {
    sleep(5000);
    id = run(gh(), ["run", "list", "--repo", REPO, "--workflow=deploy.yml", "--commit", sha, "--limit", "1", "--json", "databaseId", "--jq", ".[0].databaseId"], { ok: true }).out;
  }
  if (!id) throw new Error(`合併了（${sha.slice(0, 7)}），但找不到這次的部署`);
  // 11-16：不用 gh run watch（會中途斷掉，PR 其實已合併、部署成功卻被判失敗；PR 600、620、627）。改成 REST 輪詢 run 的 status／conclusion，網路短暫錯誤會重試
  const dep = waitRun(id, { intervalMs: 10000, maxMs: 20 * 60 * 1000 });
  if (dep.timedOut) throw new Error(`PR ${n} 已合併（${sha.slice(0, 7)}），但部署 20 分鐘還沒跑完（狀態 ${dep.status}）：${dep.url}`);
  if (!dep.ok) throw new Error(`PR ${n} 已合併（${sha.slice(0, 7)}），但部署沒成功（${dep.conclusion}）：${dep.url}`);
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
module.exports = { isContentFile, contentOnly, localPlan, parseArgs, commitText, prBody, branchOk, noChecksYet, checksState, titleOk, bodyFromLog, noticeWarning };
