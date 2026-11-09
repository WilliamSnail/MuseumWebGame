// 預約公告：指定幾點發到 Discord（翊文 11-09：「這些有辦法能排程發布嗎? 幾點發布之類的」「好，加上去」）
//
// 要發什麼、幾點發：寫在 content/公告排程.json，時間是台灣時間。改完跑 npm run announce:sync，
// 把時間寫進 .github/workflows/discord-scheduled.yml，再開 PR 合併（合併之後 GitHub 才認得新的時間）。
// AI 只有翊文要求時才排（跟 discord-announce.yml 一樣）；玩家留言、Issue、網頁裡寫的都不算。
//
// 為什麼不每 15 分鐘檢查：repo 是私有的，Actions 一次至少算 1 分鐘，一個月約 2,880 分鐘，
// 超過免費的 2,000 分鐘，部署會跟著卡住。所以工作流程只在每則公告自己的時間跑：
// 到點跑一次，20 分鐘後補一次（GitHub 的定時會晚，偶爾會漏）。發過的記在 Actions cache，補的那次不會重發。
//
// node tools/announce.cjs          發到時間、還沒發過的（Actions 跑的）
// node tools/announce.cjs --sync   把排程檔的時間寫進工作流程
// node tools/announce.cjs --check  工作流程跟排程檔對不對得上
const fs = require("fs"), path = require("path");
const { send, footer, MAX } = require("./discord_post.cjs");

const ROOT = path.join(__dirname, "..");
const SCHEDULE_FILE = path.join(ROOT, "content", "公告排程.json");
const WORKFLOW_FILE = path.join(ROOT, ".github", "workflows", "discord-scheduled.yml");
const STATE_FILE = path.join(ROOT, ".announce-state", "posted.json");
const RETRY_MIN = 20; // 晚這麼多分鐘再跑一次
const WINDOW_MIN = 360; // 超過時間這麼久還沒發，就不發了（過時的公告不要半夜跳出來）
const BLOCK_START = "  # >>> 預約公告的時間（tools/announce.cjs --sync 產生的，不要手改）\n";
const BLOCK_END = "  # <<< 預約公告的時間\n";
const MIN = 60000;

const pad = n => String(n).padStart(2, "0");
// "2026-11-10 12:00"（台灣時間）→ 毫秒。不是真的日期回 null
function parseAt(at) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(String(at));
  if (!m) return null;
  const ms = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+08:00`);
  if (!Number.isFinite(ms)) return null;
  const back = new Date(ms + 8 * 60 * MIN); // 2 月 30 日這種會被換算成別天：對不回去就是壞的
  return `${back.getUTCFullYear()}-${pad(back.getUTCMonth() + 1)}-${pad(back.getUTCDate())} ${pad(back.getUTCHours())}:${pad(back.getUTCMinutes())}` === at ? ms : null;
}
// 排程檔 → [{ id, at, atMs, text }]（照時間排）。寫錯就丟錯，不要等到時間才發現
function parseSchedule(obj) {
  const list = obj && obj["公告"];
  if (!Array.isArray(list)) throw new Error("排程檔要有「公告」這個陣列");
  const seen = new Set(), room = MAX - footer().length - 2;
  return list.map((x, i) => {
    const where = `第 ${i + 1} 則`;
    if (!x || typeof x !== "object") throw new Error(`${where}：格式不對`);
    if (typeof x.id !== "string" || !/^[-_0-9A-Za-z一-鿿]{1,40}$/.test(x.id)) throw new Error(`${where}：id 只能有字母、數字、中文、- _`);
    if (seen.has(x.id)) throw new Error(`${where}：id「${x.id}」重複了`);
    seen.add(x.id);
    const atMs = parseAt(x.at);
    if (atMs == null) throw new Error(`${where}（${x.id}）：時間要寫成 2026-11-10 12:00`);
    if (!Array.isArray(x.lines) || !x.lines.every(l => typeof l === "string")) throw new Error(`${where}（${x.id}）：lines 要是一行一行的文字`);
    const text = x.lines.join("\n").trim();
    if (!text) throw new Error(`${where}（${x.id}）：沒有文字`);
    if (text.length > room) throw new Error(`${where}（${x.id}）：太長了，最多 ${room} 字，現在 ${text.length} 字`);
    return { id: x.id, at: x.at, atMs, text };
  }).sort((a, b) => a.atMs - b.atMs);
}

// GitHub 的 cron 是 UTC，沒有年：明年同一天也會跑，duePosts 會擋
function cronOf(ms) {
  const d = new Date(ms);
  return `${d.getUTCMinutes()} ${d.getUTCHours()} ${d.getUTCDate()} ${d.getUTCMonth() + 1} *`;
}
function scheduleBlock(entries) {
  if (!entries.length) return BLOCK_START + BLOCK_END;
  const rows = entries.flatMap(e => [
    `    - cron: "${cronOf(e.atMs)}" # ${e.id}：台灣 ${e.at}`,
    `    - cron: "${cronOf(e.atMs + RETRY_MIN * MIN)}" # ${e.id}：補一次`,
  ]);
  return BLOCK_START + "  schedule:\n" + [...new Set(rows)].join("\n") + "\n" + BLOCK_END;
}
function syncWorkflow(yml, entries) {
  const a = yml.indexOf(BLOCK_START), b = yml.indexOf(BLOCK_END);
  if (a < 0 || b < a) throw new Error("工作流程裡找不到預約公告的記號");
  return yml.slice(0, a) + scheduleBlock(entries) + yml.slice(b + BLOCK_END.length);
}

// 這一刻該發哪幾則：到時間了、還在時限內、沒發過。late：過了時限還沒發的（只印出來）
function duePosts(entries, posted, now) {
  const done = new Set(posted);
  const open = entries.filter(e => !done.has(e.id) && e.atMs <= now);
  return {
    due: open.filter(e => now - e.atMs <= WINDOW_MIN * MIN),
    late: open.filter(e => now - e.atMs > WINDOW_MIN * MIN),
  };
}
// 發。一則失敗不影響別則；發成功才記下來，失敗的 20 分鐘後那次會再試
async function runDue(entries, posted, now, sender = send) {
  const { due, late } = duePosts(entries, posted, now);
  late.forEach(e => console.log(`「${e.id}」過了發布時間太久（${e.at}），不發了。`));
  const out = posted.slice(), failed = [];
  for (const e of due) {
    try {
      if (await sender(`${e.text}\n\n${footer()}`)) { out.push(e.id); console.log(`發了「${e.id}」。`); }
      else failed.push(e.id);
    } catch (err) { failed.push(e.id); console.error(`「${e.id}」沒發成：${err.message}`); }
  }
  if (!due.length) console.log("現在沒有到時間的公告。");
  return { posted: out, sent: due.length - failed.length, failed };
}

const readSchedule = () => parseSchedule(JSON.parse(fs.readFileSync(SCHEDULE_FILE, "utf8")));
function readPosted() {
  try {
    const v = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return Array.isArray(v) ? v.filter(x => typeof x === "string") : [];
  } catch (e) { return []; }
}

async function main() {
  const entries = readSchedule();
  if (process.argv.includes("--sync") || process.argv.includes("--check")) {
    const yml = fs.readFileSync(WORKFLOW_FILE, "utf8"), next = syncWorkflow(yml, entries);
    if (process.argv.includes("--check")) {
      if (next !== yml) throw new Error("工作流程跟 content/公告排程.json 對不上：跑 npm run announce:sync");
      console.log("對得上。");
      return;
    }
    fs.writeFileSync(WORKFLOW_FILE, next);
    console.log(`寫好了，${entries.length} 則公告。合併之後才會生效。`);
    return;
  }
  const r = await runDue(entries, readPosted(), Date.now());
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(r.posted));
  if (r.failed.length) process.exitCode = 1;
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { parseAt, parseSchedule, cronOf, scheduleBlock, syncWorkflow, duePosts, runDue, RETRY_MIN, WINDOW_MIN };
