// 按壹個 Firebase 固定動作（firebase-task.yml）、等它跑完、只印「做這個動作」那壹步的輸出，可以存起來、跟上次存的比（翊文 11-15：「需要的腳本都要寫，才能快速準確」）。
// 以前每壹步世界經濟都要：gh workflow run → 找新的 run → watch → view --log → grep → 自己用眼睛比兩次的數字，又慢又容易看錯。
//   npm run fb -- house-ledger                       按、印結果
//   npm run fb -- house-ledger --save w4-前           按、印、存到 .claude/fb-snap/w4-前.txt（不進 repo）
//   npm run fb -- house-ledger --diff w4-前           按、印，再跟存的那份比：哪些數字變了多少、哪些是新出現的、哪些不見了
//   npm run fb -- --show w4-前 --diff w3-後           不按，直接比兩份存的
// **只有翊文在對話裡同意才能按**（AGENTS.md、決定 0038）；--show 不按，隨時可以用。只讀的動作：house-ledger、house-size、stock-status、econ-status、fn-errors、stats。
const fs = require("fs"), path = require("path");
const { spawnSync } = require("child_process");
const REPO = "WilliamSnail/MuseumWebGame", WF = "firebase-task.yml";
const SNAP = path.join(__dirname, "..", ".claude", "fb-snap");
const gh = () => process.env.GH_BIN || (fs.existsSync("C:\Program Files\GitHub CLI\gh.exe") ? "C:\Program Files\GitHub CLI\gh.exe" : "gh");
const run = (args, ok) => { const r = spawnSync(gh(), args, { encoding: "utf8", maxBuffer: 1 << 26 }); if (r.error) throw r.error; if (r.status !== 0 && !ok) throw new Error(`gh ${args.slice(0, 2).join(" ")} 失敗：${(r.stderr || r.stdout).trim().slice(-300)}`); return r; };
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const latest = () => run(["run", "list", "--repo", REPO, "--workflow", WF, "--limit", "1", "--json", "databaseId", "--jq", ".[].databaseId"], true).stdout.trim();

// 紀錄壹行「工作\t步驟\t時間 內容」：只留「做這個動作」那步的內容，拿掉顏色碼和 GitHub 的雜訊行
function stepLines(log) {
  return String(log).split("\n").map(l => l.split("\t")).filter(p => p.length >= 3 && p[1] === "做這個動作")
    .map(p => p.slice(2).join("\t").replace(/^\S+ /, "").replace(/\x1b\[[0-9;]*m/g, ""))
    .filter(l => l.trim() && !/^(##\[|\[command\]|shell:|env:|\s+SA_JSON|GOOGLE_APPLICATION|printf )/.test(l.trimStart()));
}
// 把文字裡的「名字 數字」都拿出來：{ 名字: 數字 }。名字前面加上這壹行的開頭（例如「莊家」「#1」），免得兩行同名
function numbersOf(lines) {
  const out = {};
  for (const raw of lines) {
    const line = raw.trim(), head = (/^(#\d+|莊家|世界文件[^：]*|外面世界的帳上分類[^：]*|錢包 \d+ 個)/.exec(line) || [""])[0];
    for (const m of line.matchAll(/([^\s：:,，（）()　]+)[：:\s　]+(-?\d[\d,]*(?:\.\d+)?)(?![\d.])/g)) {
      const k = (head && !m[1].startsWith(head) ? head + "·" : "") + m[1], v = Number(m[2].replace(/,/g, ""));
      if (Number.isFinite(v)) out[k] = v;
    }
  }
  return out;
}
// 比兩份：回傳要印的幾行
function diffNumbers(a, b) {
  const rows = [], fmt = n => n.toLocaleString("en-US");
  for (const k of Object.keys(b)) {
    if (!(k in a)) rows.push(`＋ ${k}：${fmt(b[k])}（新出現）`);
    else if (a[k] !== b[k]) rows.push(`△ ${k}：${fmt(a[k])} → ${fmt(b[k])}（${b[k] - a[k] > 0 ? "+" : ""}${fmt(b[k] - a[k])}）`);
  }
  for (const k of Object.keys(a)) if (!(k in b)) rows.push(`－ ${k}：${fmt(a[k])}（不見了）`);
  return rows.length ? rows : ["（數字都壹樣）"];
}
function parseArgs(argv) {
  const o = { action: null, save: null, diff: null, show: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => { if (argv[i + 1] === undefined) throw new Error(`${a} 後面要有名字`); return argv[++i]; };
    if (a === "--save") o.save = next(); else if (a === "--diff") o.diff = next(); else if (a === "--show") o.show = next();
    else if (a.startsWith("--")) throw new Error(`沒有 ${a} 這個選項`); else if (!o.action) o.action = a; else throw new Error(`看不懂「${a}」`);
  }
  if (!o.action && !o.show) throw new Error("用法：npm run fb -- <動作> [--save 名字] [--diff 名字]，或 --show 名字 --diff 名字");
  if (o.action && o.show) throw new Error("--show 是不按、直接看存的；不要同時給動作");
  for (const n of [o.save, o.diff, o.show]) if (n && !/^[\w\u4e00-\u9fff.-]+$/.test(n)) throw new Error(`名字只能用字母、數字、中文、-、.：${n}`);
  return o;
}
const snapFile = n => path.join(SNAP, n + ".txt");
function main() {
  const o = parseArgs(process.argv.slice(2));
  let lines;
  if (o.show) { lines = fs.readFileSync(snapFile(o.show), "utf8").split("\n"); }
  else {
    const old = latest();
    run(["workflow", "run", WF, "--repo", REPO, "--ref", "main", "-f", `action=${o.action}`]);
    let id = null;
    for (let i = 0; i < 36 && !id; i++) { const n = latest(); if (n && n !== old) id = n; else sleep(5000); }
    if (!id) throw new Error("等了 3 分鐘，還是沒有新的壹次（GitHub Actions 可能在塞車）");
    console.log(`https://github.com/${REPO}/actions/runs/${id}`);
    const w = run(["run", "watch", id, "--repo", REPO, "--exit-status", "--interval", "5"], true);
    lines = stepLines(run(["run", "view", id, "--repo", REPO, "--log"], true).stdout);
    if (w.status !== 0) { console.log(lines.join("\n")); throw new Error(`這壹次失敗了（${id}）：gh run view ${id} --log-failed`); }
  }
  console.log(lines.join("\n"));
  if (o.save) { fs.mkdirSync(SNAP, { recursive: true }); fs.writeFileSync(snapFile(o.save), lines.join("\n")); console.log(`\n✓ 存好了：.claude/fb-snap/${o.save}.txt`); }
  if (o.diff) {
    const before = fs.readFileSync(snapFile(o.diff), "utf8").split("\n");
    console.log(`\n== 跟「${o.diff}」比 ==\n` + diffNumbers(numbersOf(before), numbersOf(lines)).join("\n"));
  }
}
module.exports = { stepLines, numbersOf, diffNumbers, parseArgs };
if (require.main === module) { try { main(); } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); } }
