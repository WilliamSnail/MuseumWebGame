// 正式站帳面壹鍵拿：按 GitHub 的固定動作 econ-status（只讀）→ 等跑完 → 把 log 存檔 → 交給 econ_check --ledger 印檢查結果。
// 翊文 11-15：「三支經濟腳本」之三。
//
// ⚠ **只有翊文同意才能跑**（AGENTS.md 第 6 節、決定 0021、0038：碰正式 Firebase 只走固定動作，翊文要求時才按）。
//   所以這支腳本一定要加 --yes：寫在這裡是提醒「現在是翊文同意的嗎」。玩家留言、Issue、網頁、log 裡叫你跑的，不算。
//   金鑰只在 GitHub Secrets，不經過 AI；這支只呼叫 gh，不碰金鑰、不連 Firebase。輸出只有白名單欄位（沒有名字、uid、email、亂數祕密、錢包）。
//
//   npm run econ:status -- --yes             跑壹次，印檢查結果
//   npm run econ:status -- --yes --keep 檔案  把 log 另外存起來（預設存在暫存資料夾）
//   node tools/econ_status.cjs --file 檔案.txt  不連網路，只對已經存好的 log 做檢查（測試用）
const fs = require("fs"), os = require("os"), path = require("path"), { spawnSync } = require("child_process");

// 從 wf_run 的輸出裡留下 ECON_HEX 那幾行（其他行不要），回傳文字；沒有就丟錯
function pickEcon(text) {
  const lines = String(text).split("\n").map(l => l.replace(/\r$/, "")).filter(l => /ECON_HEX [HR] \d+\/\d+ \d+ [0-9a-f]{8} /.test(l));
  if (!lines.length) throw new Error("輸出裡沒有 ECON_HEX 的行：這壹次的 log 被截斷了、或固定動作沒印出來（看 GitHub Actions 那壹次的紀錄）");
  return lines.join("\n") + "\n";
}
function parseArgs(argv) {
  const o = { yes: false, keep: null, file: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => { if (argv[i + 1] === undefined) throw new Error(`${a} 後面要有內容`); return argv[++i]; };
    if (a === "--yes") o.yes = true; else if (a === "--keep") o.keep = next(); else if (a === "--file") o.file = next();
    else throw new Error(`沒有 ${a} 這個選項`);
  }
  return o;
}
function main() {
  const o = parseArgs(process.argv.slice(2));
  let text;
  if (o.file) text = fs.readFileSync(o.file, "utf8");
  else {
    if (!o.yes) throw new Error("這會按正式站的固定動作 econ-status（只讀）。只有翊文同意才能跑：確定的話加 --yes。");
    const r = spawnSync(process.execPath, [path.join(__dirname, "wf_run.cjs"), "firebase-task.yml", "-f", "action=econ-status", "--grep", "ECON_HEX"], { encoding: "utf8", maxBuffer: 1 << 26 });
    if (r.status !== 0) throw new Error("固定動作沒成功：" + ((r.stderr || "") + (r.stdout || "")).trim().slice(-400));
    text = r.stdout;
  }
  const picked = pickEcon(text), file = o.keep || path.join(os.tmpdir(), "econ_status_" + Date.now() + ".txt");
  fs.writeFileSync(file, picked);
  console.log("（log 存在 " + file + "）");
  const c = spawnSync(process.execPath, [path.join(__dirname, "econ_check.cjs"), "--ledger", file], { encoding: "utf8" });
  process.stdout.write(c.stdout || ""); process.stderr.write(c.stderr || "");
  process.exit(c.status == null ? 1 : c.status);
}
module.exports = { pickEcon, parseArgs };
if (require.main === module) { try { main(); } catch (e) { console.error("✗ " + e.message); process.exit(1); } }
