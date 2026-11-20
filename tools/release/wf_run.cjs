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
const { REPO, newRunId, dispatch, runLog } = require("./gh_lib.cjs"); // 11-15 合併成共用的

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
// 紀錄的一行：「工作\t步驟\t時間 內容」→ 內容，順便拿掉顏色碼
const logBody = line => line.split("\t").slice(2).join("\t").replace(/^\S+ /, "").replace(/\x1b\[[0-9;]*m/g, "");

function main() {
  const o = parseArgs(process.argv.slice(2));
  const r = dispatch(o.workflow, o.inputs, { ref: o.ref, onId: (id, url) => console.log(url) });
  const log = runLog(r.id).split("\n").map(logBody);
  const re = o.grep ? new RegExp(o.grep) : null;
  console.log((re ? log.filter(l => re.test(l)) : log.slice(-40)).join("\n"));
  if (!r.ok) throw new Error(`這一次失敗了（${r.id}）：gh run view ${r.id} --log-failed`);
  console.log(`✓ 這一次成功（${r.id}）`);
}

if (require.main === module) { try { main(); } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); } }
module.exports = { parseArgs, newRunId, logBody };
