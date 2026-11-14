// 發壹則手動公告到 Discord，等到發成功或失敗才結束（翊文 11-14：「還有什麼腳本需要寫的」→「四個都做」）
// 以前每次都要 gh workflow run discord-announce.yml -f message=…，再找 run id、gh run watch，壹天十幾次；子 session 還要傳話叫別人發。
//   npm run say -- "🎲 賭場：……"            直接寫文字
//   npm run say -- --file 公告.txt          文字放檔案（很長、有引號的時候）
//   npm run say -- --dry "……"              只印出來，不發
// 金鑰在 GitHub Secrets，這裡拿不到也不用拿：只是叫 GitHub 的工作流程去發。ship 的 --say 也用這支。
const fs = require("fs");
const { spawnSync } = require("child_process");
const REPO = "WilliamSnail/MuseumWebGame", WF = "discord-announce.yml";

function gh() {
  if (process.env.GH_BIN) return process.env.GH_BIN;
  const win = "C:\\Program Files\\GitHub CLI\\gh.exe";
  return fs.existsSync(win) ? win : "gh";
}
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const ghRun = args => spawnSync(gh(), args, { encoding: "utf8", maxBuffer: 1 << 24 });
// Discord 壹則最多 2000 字；工作流程前面還會加東西，留壹點
const MAX = 1900;
function checkText(t) {
  const s = String(t || "").trim();
  if (!s) throw new Error("沒有要發的文字");
  if ([...s].length > MAX) throw new Error(`太長了（${[...s].length} 字，最多 ${MAX}）：拆成兩則`);
  if (/@everyone|@here|<@[!&]?\d+>/.test(s)) throw new Error("不能 @ 任何人（決定 0051）");
  return s;
}
// 發出去並等結果。回傳 { ok, url }
function sayDiscord(text, log = console.log) {
  const msg = checkText(text);
  const since = Date.now() - 5000;
  const r = ghRun(["workflow", "run", WF, "--repo", REPO, "--ref", "main", "-f", `message=${msg}`]);
  if (r.status !== 0) throw new Error("叫不動 Discord 的工作流程：" + (r.stderr || r.stdout || "").trim().slice(0, 300));
  // 找這次的 run：要比剛剛按下去的時間新
  let id = "", url = "";
  for (let i = 0; i < 20 && !id; i++) {
    sleep(3000);
    const l = ghRun(["run", "list", "--repo", REPO, "--workflow", WF, "--limit", "5", "--json", "databaseId,createdAt,url"]);
    try { const hit = JSON.parse(l.stdout || "[]").find(x => Date.parse(x.createdAt) >= since); if (hit) { id = String(hit.databaseId); url = hit.url; } } catch (e) { /* 再等 */ }
  }
  if (!id) throw new Error("按下去了，但找不到這次的 run（到 Actions 頁看壹下）");
  log(`Discord 發送中：${url}`);
  const w = ghRun(["run", "watch", id, "--repo", REPO, "--exit-status", "--interval", "5"]);
  return { ok: w.status === 0, url };
}
module.exports = { sayDiscord, checkText };

if (require.main === module) {
  const a = process.argv.slice(2);
  try {
    const fi = a.indexOf("--file"), dry = a.includes("--dry");
    const text = fi >= 0 ? fs.readFileSync(a[fi + 1], "utf8") : a.filter((x, i) => x !== "--dry" && !(fi >= 0 && (i === fi || i === fi + 1))).join(" ");
    if (dry) { console.log(checkText(text)); process.exit(0); }
    const r = sayDiscord(text);
    if (!r.ok) { console.error(`✗ Discord 沒發成功：${r.url}`); process.exit(1); }
    console.log("✓ Discord 發好了");
  } catch (e) { console.error("✗ " + e.message); process.exit(1); }
}
