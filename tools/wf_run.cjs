// 觸發 GitHub Actions 的手動流程，等它跑完，印出這一次的結果（翊文 11-09：「整合一下今天的經驗，需要腳本的也寫好」）。
//   為什麼要這支：`gh workflow run` 失敗時，`gh run list` 看到的是**舊的那次**，很容易以為「公告發了」。
//   這支一定認得出新的那一次，沒有新的就報錯；結果照結束碼回報（失敗 exit 1），不用自己看。
//
//   npm run wf -- discord-log.yml -f hours=2 --grep "^2026-"
//   npm run wf -- discord-announce.yml --file message=公告.txt --grep "公告發了|沒發"
//   -f k=v          流程的輸入
//   --file k=檔案    流程的輸入，內容從檔案讀（多行文字用這個，不用跳脫）
//   --ref 分支       預設 main；要測還沒合併的流程，指定分支
//   --grep 正規式    只印符合的紀錄行
//
// 會對外發東西或碰正式資料的流程（公告、Firebase 固定動作、註冊指令），照 AGENTS.md：翊文要求了才能按。
const fs = require("fs");
const { spawnSync } = require("child_process");

const REPO = "WilliamSnail/MuseumWebGame";
const gh = () => process.env.GH_BIN || (fs.existsSync("C:\\Program Files\\GitHub CLI\\gh.exe") ? "C:\\Program Files\\GitHub CLI\\gh.exe" : "gh");

// 拆參數。錯了就丟錯，不要默默照做
function parseArgs(argv, read = f => fs.readFileSync(f, "utf8")) {
  const o = { workflow: null, ref: "main", grep: null, inputs: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => { if (argv[i + 1] === undefined) throw new Error(`${a} 後面要有內容`); return argv[++i]; };
    if (a === "-f" || a === "--file") {
      const kv = next(), at = kv.indexOf("=");
      if (at < 1) throw new Error(`${a} 要寫成 名字=內容：${kv}`);
      o.inputs[kv.slice(0, at)] = a === "-f" ? kv.slice(at + 1) : read(kv.slice(at + 1)).trim();
    } else if (a === "--ref") o.ref = next();
    else if (a === "--grep") o.grep = next();
    else if (a.startsWith("-")) throw new Error(`沒有 ${a} 這個選項`);
    else if (!o.workflow) o.workflow = a;
    else throw new Error(`看不懂「${a}」`);
  }
  if (!o.workflow) throw new Error("要寫流程的檔名，例如 discord-log.yml");
  return o;
}
// 列表裡第一個不是舊那次的（list 最新的在最前面）。沒有回 null
const newRunId = (ids, oldId) => { const id = ids.find(Boolean); return id && String(id) !== String(oldId) ? String(id) : null; };
// 紀錄的一行：「工作\t步驟\t時間 內容」→ 內容，順便拿掉顏色碼
const logBody = line => line.split("\t").slice(2).join("\t").replace(/^\S+ /, "").replace(/\x1b\[[0-9;]*m/g, "");

function run(args, ok) {
  const r = spawnSync(gh(), args, { encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.error) throw r.error;
  if (r.status !== 0 && !ok) throw new Error(`gh ${args.slice(0, 2).join(" ")} 失敗：${(r.stderr || r.stdout).trim().slice(-300)}`);
  return r;
}
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const latest = wf => run(["run", "list", "--repo", REPO, "--workflow", wf, "--limit", "1", "--json", "databaseId", "--jq", ".[].databaseId"], true).stdout.trim();

function main() {
  const o = parseArgs(process.argv.slice(2)), old = latest(o.workflow);
  const fields = Object.entries(o.inputs).flatMap(([k, v]) => ["-f", `${k}=${v}`]);
  run(["workflow", "run", o.workflow, "--repo", REPO, "--ref", o.ref, ...fields]); // 失敗（例如參數名字錯）在這裡就停
  let id = null;
  for (let i = 0; i < 36 && !id; i++) { id = newRunId([latest(o.workflow)], old); if (!id) sleep(5000); }
  if (!id) throw new Error("等了 3 分鐘，還是沒有新的一次（GitHub Actions 可能在塞車）");
  console.log(`https://github.com/${REPO}/actions/runs/${id}`);
  const w = run(["run", "watch", id, "--repo", REPO, "--exit-status", "--interval", "5"], true);
  const log = run(["run", "view", id, "--repo", REPO, "--log"], true).stdout.split("\n").map(logBody);
  const re = o.grep ? new RegExp(o.grep) : null;
  console.log((re ? log.filter(l => re.test(l)) : log.slice(-40)).join("\n"));
  if (w.status !== 0) throw new Error(`這一次失敗了（${id}）：gh run view ${id} --log-failed`);
  console.log(`✓ 這一次成功（${id}）`);
}

if (require.main === module) { try { main(); } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); } }
module.exports = { parseArgs, newRunId, logBody };
