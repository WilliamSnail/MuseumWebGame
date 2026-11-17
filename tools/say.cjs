// 發壹則手動公告到 Discord，等到發成功或失敗才結束（翊文 11-14：「還有什麼腳本需要寫的」→「四個都做」）
// 以前每次都要 gh workflow run discord-announce.yml -f message=…，再找 run id、gh run watch，壹天十幾次；子 session 還要傳話叫別人發。
//   npm run say -- "🎲 賭場：……"            直接寫文字
//   npm run say -- --file 公告.txt          文字放檔案（很長、有引號、**多行**的時候：Windows 上 npm run 經過 cmd.exe，參數裡換行後面會被切掉）
//   npm run say -- --dry "……"              只印出來，不發
// 金鑰在 GitHub Secrets，這裡拿不到也不用拿：只是叫 GitHub 的工作流程去發。ship 的 --say 也用這支。
const fs = require("fs");
const { dispatch } = require("./gh_lib.cjs"); // 觸發、認出新的那壹次、等跑完（11-15 合併成共用的）
const WF = "discord-announce.yml";

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
  const r = dispatch(WF, { message: msg }, { onId: (id, url) => log(`Discord 發送中：${url}`) });
  return { ok: r.ok, url: r.url };
}
module.exports = { sayDiscord, checkText };

if (require.main === module) {
  const a = process.argv.slice(2);
  try {
    const fi = a.indexOf("--file"), dry = a.includes("--dry");
    const text = fi >= 0 ? fs.readFileSync(a[fi + 1], "utf8") : a.filter((x, i) => x !== "--dry" && !(fi >= 0 && (i === fi || i === fi + 1))).join(" ");
    if (fi < 0 && process.platform === "win32" && process.env.npm_lifecycle_event) console.log("（提醒：用 npm run 在 Windows 上直接寫文字，換行後面會被切掉；多行請用 --file）");
    if (dry) { console.log(checkText(text)); process.exit(0); }
    const r = sayDiscord(text);
    if (!r.ok) { console.error(`✗ Discord 沒發成功：${r.url}`); process.exit(1); }
    console.log("✓ Discord 發好了");
  } catch (e) { console.error("✗ " + e.message); process.exit(1); }
}
