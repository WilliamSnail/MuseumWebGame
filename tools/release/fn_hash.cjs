// 雲端函式這包的指紋（11-16，翊文：Cloud Functions 壹個月 81 美元 →「函式沒變就不部署函式」）。
// 每次部署都把 40 多個函式整批重建（Cloud Build、Artifact Registry 要錢），可是大部分上線只改網頁、公告、音樂。
// 這支先照部署前壹樣把 shared/ 複製進 functions/shared/（tools/release/copy_shared.cjs），再把 functions/ 底下會上傳的檔案照路徑排好算 sha256。
// deploy.yml 拿這個指紋查 Actions cache：上次部署過同壹個指紋 → 這次只部署網頁和規則，不碰函式。
// 不算進去的：node_modules、.env（金鑰，部署時才寫）、shared/game/notices_data.js（館方公告的資料：每包上線都會加壹則，
//   函式裡只有 Discord 機器人的「公告」指令讀它；晚壹點更新沒關係，下次真的動到函式或每天的內容排程時就會跟著上去）。
//   node tools/release/fn_hash.cjs          印出指紋
//   node tools/release/fn_hash.cjs --list   列出算進去的檔案（除錯用）
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const ROOT = path.join(__dirname, "..", ".."), FN = path.join(ROOT, "functions");
const SKIP_DIR = new Set(["node_modules", ".git"]);
const SKIP_FILE = new Set([".env", ".env.local", "shared/game/notices_data.js"]);

function files(dir, rel = "") {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) { if (!SKIP_DIR.has(e.name)) out.push(...files(path.join(dir, e.name), r)); }
    else if (e.isFile() && !SKIP_FILE.has(r) && !e.name.endsWith(".log")) out.push(r);
  }
  return out;
}
function fnHash() {
  require("./copy_shared.cjs");
  const list = files(FN).sort(), h = crypto.createHash("sha256");
  for (const r of list) { h.update(r + "\0"); h.update(fs.readFileSync(path.join(FN, r))); h.update("\0"); }
  return { hash: h.digest("hex").slice(0, 32), list };
}
module.exports = { fnHash, files };
if (require.main === module) {
  const { hash, list } = fnHash();
  if (process.argv.includes("--list")) console.log(list.join("\n"));
  console.log(hash);
}
