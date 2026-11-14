// 什麼時候發到 Discord。三種，都由 .github/workflows/discord-scheduled.yml 叫這支：
//   今日館訊（翊文 11-09：「排程是五點更新對吧。但更新內容能夠早上八點半推播嗎」）：遊戲照舊 05:00 更新，公告早上八點半左右發
//   限時活動開跑（翊文 11-09：「現時活動開跑的時候有辦法能推播嗎」「先做 Discord 和遊戲內通知」，決定 0045）：week.json 的 events 自己會發
//   預約公告（翊文 11-09：「這些有辦法能排程發布嗎? 幾點發布之類的」「好，加上去」）：下面這段
//
// 前兩種是固定時間檢查，內容照 content/weeks 走：每天的排程不該動工作流程（雲端排程的權限可能推不上 .github/workflows，整包內容會跟著卡住），
// 所以不能每場活動排一個時間。活動要開在 EVENT_SLOTS 的時間（tools/week_check.cjs 會警告）。
//
// 預約公告：
// 要發什麼、幾點發：寫在 content/公告排程.json，時間是台灣時間。改完跑 npm run announce:sync，
// 把時間寫進 .github/workflows/discord-scheduled.yml，再開 PR 合併（合併之後 GitHub 才認得新的時間）。
// AI 只有翊文要求時才排（跟 discord-announce.yml 一樣）；玩家留言、Issue、網頁裡寫的都不算。
//
// 為什麼不每 15 分鐘檢查：repo 是私有的，Actions 一次至少算 1 分鐘，一個月約 2,880 分鐘，
// 超過免費的 2,000 分鐘，部署會跟著卡住。所以工作流程只在該發的時間跑（固定的那些一個月約 140 分鐘）：
// 到點跑一次，20 分鐘後補一次（GitHub 的定時會晚，偶爾會漏）。發過的記在 Actions cache，補的那次不會重發。
//
// node tools/announce.cjs          發到時間、還沒發過的（Actions 跑的）
// node tools/announce.cjs --sync   把排程檔的時間寫進工作流程
// node tools/announce.cjs --check  工作流程跟排程檔對不對得上
// node tools/announce.cjs --any-due  現在有沒有該發還沒發的（有：結束碼 0。部署完用，只看不發）
// node tools/announce.cjs --preview "2026-11-10 08:30"  那個時間會發什麼，印出來不發（只看內容，當作都還沒發過）
const fs = require("fs"), path = require("path");
const { send, footer, MAX, dayPost, eventPost, beatPost, readJSON, shared } = require("./discord_post.cjs");

const ROOT = path.join(__dirname, "..");
const SCHEDULE_FILE = path.join(ROOT, "content", "公告排程.json");
const WORKFLOW_FILE = path.join(ROOT, ".github", "workflows", "discord-scheduled.yml");
const STATE_FILE = path.join(ROOT, ".announce-state", "posted.json");
const RETRY_MIN = 20; // 晚這麼多分鐘再跑一次
const WINDOW_MIN = 360; // 超過時間這麼久還沒發，就不發了（過時的公告不要半夜跳出來）
const DAY_POST_AT = "07:50"; // 今日館訊幾點起可以發。排程 08:00 寫完、部署好就手動觸發；GitHub 的 08:27 定時留著當備援（發過就不重發）
const DAY_POST_FROM = "2026-11-10"; // 從這天開始照這個方式發（再早的已經在部署時發過了，不要重發）
const EVENT_EARLY_MIN = 10; // 活動開始前這麼久起可以發（工作流程開始前 7 分鐘跑，整點的定時最容易晚）
const EVENT_SLOTS = [{ from: "20:00", weekendOnly: false }, { from: "14:00", weekendOnly: true }]; // 活動固定開在這些時間，開跑公告才發得到
// 固定的時間（UTC，台灣減 8 小時；週末的 13:53 在 UTC 也是同一天）。改了要跑 npm run announce:sync
const FIXED_CRONS = [
  ["27 0 * * *", "今日館訊：台灣每天 08:27"],
  ["47 0 * * *", "今日館訊：補一次"],
  ["53 11 * * *", "限時活動 20:00：台灣每天 19:53"],
  ["13 12 * * *", "限時活動 20:00：補一次"],
  ["53 5 * * 0,6", "限時活動 14:00：台灣週末 13:53"],
  ["13 6 * * 0,6", "限時活動 14:00：補一次"],
];
const BLOCK_START = "  # >>> 定時（tools/announce.cjs --sync 產生的，不要手改）\n";
const BLOCK_END = "  # <<< 定時\n";
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
  const rows = FIXED_CRONS.map(([c, why]) => `    - cron: "${c}" # ${why}`).concat(entries.flatMap(e => [
    `    - cron: "${cronOf(e.atMs)}" # ${e.id}：台灣 ${e.at}`,
    `    - cron: "${cronOf(e.atMs + RETRY_MIN * MIN)}" # ${e.id}：補一次`,
  ]));
  return BLOCK_START + "  schedule:\n" + [...new Set(rows)].join("\n") + "\n" + BLOCK_END;
}
function syncWorkflow(yml, entries) {
  const a = yml.indexOf(BLOCK_START), b = yml.indexOf(BLOCK_END);
  if (a < 0 || b < a) throw new Error("工作流程裡找不到預約公告的記號");
  return yml.slice(0, a) + scheduleBlock(entries) + yml.slice(b + BLOCK_END.length);
}

// ---------- 自動的兩種：今日館訊、活動開跑 ----------
// until：過了就不發（活動結束、隔天 05:00 換日）。make：要發的時候才組訊息（舊的週有問題也不會卡到今天）
function dayEntry(week, n, date, addDays) {
  const at = `${date} ${DAY_POST_AT}`;
  return { id: `day-${week}-d${n}`, at, atMs: parseAt(at), until: parseAt(`${addDays(date, 1)} 05:00`), isDay: true, make: () => dayPost(week, n) };
}
// 揭露週（帳本 revealBeats，docs/劇情揭露節奏.md，決定 0078）：那天的今日館訊後面多發壹則「館裡有些不一樣了」。只提醒大家來找，不寫細節。
// 日期：排程放進遊戲那天（revealedOn）；還沒標就當週三。那天的 dN.json 還沒有就不發；skipped 的不發。idx：第幾次揭露，換不同的句子
function beatEntry(b, date, idx, addDays) {
  const at = `${date} ${DAY_POST_AT}`;
  return { id: `beat-${b.id}`, at, atMs: parseAt(at), until: parseAt(`${addDays(date, 1)} 05:00`), isDay: true, make: () => beatPost(idx) };
}
const eventEntry = ev => ({ id: `event-${ev.id}`, at: `${ev.date} ${ev.from}`, atMs: ev.start - EVENT_EARLY_MIN * MIN, until: ev.end, make: () => eventPost(ev) });
// content/weeks 裡的正式週 → 自動要發的（備用週沒有日期，不算）
function autoEntries(dir = path.join(ROOT, "content", "weeks")) {
  const G = shared(), out = [];
  let beats = [];
  try { const L = readJSON("content/story/帳本.json"); beats = (L.revealBeats && Array.isArray(L.revealBeats.list)) ? L.revealBeats.list : []; } catch (e) { beats = []; }
  fs.readdirSync(dir).filter(n => /^\d{4}-W\d{2}$/.test(n)).sort().forEach(week => {
    let w = null;
    try { w = JSON.parse(fs.readFileSync(path.join(dir, week, "week.json"), "utf8")); } catch (e) { console.error(`${week}：讀不到 week.json`); }
    if (!w || !w.start) return;
    for (let n = 1; n <= 7; n++) {
      const date = G.addDays(w.start, n - 1);
      if (date >= DAY_POST_FROM && fs.existsSync(path.join(dir, week, `d${n}.json`))) out.push(dayEntry(week, n, date, G.addDays));
    }
    beats.forEach((b, idx) => {
      if (!b || b.week !== week || b.status === "skipped" || b.extra || typeof b.id !== "string") return; // 加開的（extra）不另外發提醒
      const date = b.status === "revealed" && /^\d{4}-\d{2}-\d{2}$/.test(b.revealedOn || "") ? b.revealedOn : G.addDays(w.start, 2), n = Math.round((Date.parse(date) - Date.parse(w.start)) / 86400000) + 1;
      if (n >= 1 && n <= 7 && date >= DAY_POST_FROM && fs.existsSync(path.join(dir, week, `d${n}.json`))) out.push(beatEntry(b, date, idx, G.addDays));
    });
    G.cleanEvents(w.events, w.start, week).forEach(ev => out.push(eventEntry(ev))); // 活動的 id 已經帶週（2026-W46/double11）
  });
  return out;
}
// 這場活動開得到開跑公告嗎（時間在 EVENT_SLOTS 裡）
function eventSlotOk(date, from) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(), weekend = day === 0 || day === 6;
  return EVENT_SLOTS.some(s => s.from === from && (!s.weekendOnly || weekend));
}
// 最新一次部署是不是壞的（"completed/failure" 這種）。還在跑不算壞；讀不到也不算（不要因為讀不到就不發）
const deployBroken = s => /^completed\//.test(String(s || "")) && s !== "completed/success";

// 這一刻該發哪幾則：到時間了、還在時限內、沒發過。late：預約公告過了時限還沒發的（只印出來；自動的過了就過了，不用講）
function duePosts(entries, posted, now) {
  const done = new Set(posted), end = e => (e.until != null ? e.until : e.atMs + WINDOW_MIN * MIN);
  const open = entries.filter(e => !done.has(e.id) && e.atMs <= now);
  return {
    due: open.filter(e => now <= end(e)),
    late: open.filter(e => now > end(e) && e.until == null),
  };
}
// 發。一則失敗不影響別則；發成功才記下來，失敗的 20 分鐘後那次會再試
async function runDue(entries, posted, now, sender = send) {
  const { due, late } = duePosts(entries, posted, now);
  late.forEach(e => console.log(`「${e.id}」過了發布時間太久（${e.at}），不發了。`));
  const out = posted.slice(), failed = [];
  for (const e of due) {
    try {
      if (await sender(e.make ? e.make() : `${e.text}\n\n${footer()}`)) { out.push(e.id); console.log(`發了「${e.id}」。`); }
      else failed.push(e.id);
    } catch (err) { failed.push(e.id); console.error(`「${e.id}」沒發成：${err.message}`); }
  }
  if (!due.length) console.log("現在沒有到時間的公告。");
  return { posted: out, sent: due.length - failed.length, failed };
}

const readSchedule = () => parseSchedule(JSON.parse(fs.readFileSync(SCHEDULE_FILE, "utf8")));
// 全部照時間排；同一個時間的，今日館訊在前面
const allEntries = () => [...autoEntries(), ...readSchedule()].sort((x, y) => x.atMs - y.atMs);
function readPosted() {
  try {
    const v = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return Array.isArray(v) ? v.filter(x => typeof x === "string") : [];
  } catch (e) { return []; }
}

async function main() {
  if (process.argv.includes("--preview")) {
    const at = process.argv[process.argv.indexOf("--preview") + 1], ms = parseAt(at);
    if (ms == null) throw new Error("時間要寫成 2026-11-10 08:30");
    const { due } = duePosts(allEntries(), [], ms);
    console.log(due.length ? due.map(e => `===== ${e.id}\n${e.make ? e.make() : `${e.text}\n\n${footer()}`}`).join("\n\n") : "那個時間沒有要發的。");
    return;
  }
  if (process.argv.includes("--any-due")) {
    const { due } = duePosts(allEntries(), readPosted(), Date.now());
    console.log(due.length ? `有該發的：${due.map(e => e.id).join("、")}` : "沒有該發的。");
    process.exitCode = due.length ? 0 : 1;
    return;
  }
  if (process.argv.includes("--sync") || process.argv.includes("--check")) {
    const entries = readSchedule(), yml = fs.readFileSync(WORKFLOW_FILE, "utf8"), next = syncWorkflow(yml, entries);
    if (process.argv.includes("--check")) {
      if (next !== yml) throw new Error("工作流程跟 content/公告排程.json 對不上：跑 npm run announce:sync");
      console.log("對得上。");
      return;
    }
    fs.writeFileSync(WORKFLOW_FILE, next);
    console.log(`寫好了，${entries.length} 則公告。合併之後才會生效。`);
    return;
  }
  let entries = allEntries();
  if (deployBroken(process.env.DEPLOY_STATE)) { // 內容還沒上線就不說今天有新東西。部署修好的時候 deploy.yml 會再叫這支
    console.log(`最新的部署沒成功（${process.env.DEPLOY_STATE}），今日館訊先不發。`);
    entries = entries.filter(e => !e.isDay);
  }
  const r = await runDue(entries, readPosted(), Date.now());
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(r.posted));
  if (r.failed.length) process.exitCode = 1;
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { beatEntry, parseAt, parseSchedule, cronOf, scheduleBlock, syncWorkflow, duePosts, runDue, dayEntry, eventEntry, autoEntries, eventSlotOk, deployBroken, RETRY_MIN, WINDOW_MIN, DAY_POST_AT, DAY_POST_FROM, EVENT_EARLY_MIN, EVENT_SLOTS, FIXED_CRONS };
