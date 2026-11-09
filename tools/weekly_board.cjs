// 每週排行榜（決定 0039，翊文 11-09：「另外每周排行榜也可以用discord推送給大家看，並提供一些建議」）。
// 由 .github/workflows/weekly-board.yml 跑：每週一台灣時間 05:15 算剛過完的那一週，也可以手動按。規則都在 shared/board.js。
//   1. 讀 members、saves，跟上週的快照（boards/{上週}/private/people）相減。
//   2. 先寫快照：boards/{週}（給玩家看的榜單）、boards/{週}/private/people（累計數字，有 uid，玩家讀不到）、boards/latest（遊戲裡讀這份）。
//   3. 再發 Discord，發了才記 posted。Discord 沒放金鑰或發失敗，快照照樣留著；下次跑會用同一份榜單補發。
// 同一週不發兩次。沒有人有進度：快照照寫，不發。
// 每天更新（翊文 11-09：「排行榜可以每天都更新嗎」）：每天 05:35 算這週到現在，**只寫 boards/latest**，不寫週快照、不發 Discord，週一的正式結算完全不受影響。
//   週一跳過（還在看上週的正式榜單），手動 daily 加 force 才算。
// 這支讀得到大家的存檔，但只算數字：紀錄裡只印榜單文字，不印 email、uid、存檔內容。
//
// node tools/weekly_board.cjs              照上面做（金鑰：GOOGLE_APPLICATION_CREDENTIALS；Discord：DISCORD_BOT_TOKEN、DISCORD_CHANNEL_ID）
// node tools/weekly_board.cjs --dry-run    只印不發：不寫 Firestore、不發 Discord
// node tools/weekly_board.cjs --force      這週發過了也重算、再發一次（數字會變成現在的）
// node tools/weekly_board.cjs --daily      每天更新；加 --force 週一也算；加 --dry-run 只印不寫
// 連模擬器（docs/Firebase做法.md 第十節）：FIRESTORE_EMULATOR_HOST=127.0.0.1:12180 node tools/weekly_board.cjs --dry-run --now 2026-11-16T05:15:00+08:00
//   有 FIRESTORE_EMULATOR_HOST 就一定不發 Discord。--now 只有連模擬器時能用。
const fs = require("fs"), path = require("path");
const { send, footer, MAX } = require("./discord_post.cjs");

const ROOT = path.join(__dirname, "..");
const WEEK_RE = /^\d{4}-W\d{2}$/;

// 手動按的選項。事件檔裡的布林值可能是字串
function parseOptions(inputs, argv = []) {
  const yes = v => v === true || v === "true";
  const o = inputs || {};
  return { dryRun: yes(o.dry_run) || argv.includes("--dry-run"), force: yes(o.force) || argv.includes("--force") };
}
// 這次是不是每天更新：手動選了、指令有 --daily，或是每天那個排程叫的
const DAILY_CRON = "35 21 * * *";
function isDaily(inputs, argv = [], schedule = "") {
  const v = (inputs || {}).daily;
  return v === true || v === "true" || argv.includes("--daily") || schedule === DAILY_CRON;
}
const readEvent = () => {
  const p = process.env.GITHUB_EVENT_PATH;
  if (!p) return {};
  return JSON.parse(fs.readFileSync(p, "utf8")).inputs || {};
};

// 這週地下多的房間在哪一層（週包的 anomaly.room.floor）。只拿樓層，不拿標題、內容（不破梗）。還沒有週包就 null
function newRoomFloor(label, root = ROOT) {
  if (!WEEK_RE.test(String(label))) return null;
  try {
    const w = JSON.parse(fs.readFileSync(path.join(root, "content", "weeks", label, "week.json"), "utf8"));
    const f = w && w.anomaly && w.anomaly.room && Number(w.anomaly.room.floor);
    return Number.isInteger(f) && f >= 1 ? f : null;
  } catch (e) { return null; }
}

const toMs = t => (t && typeof t.toMillis === "function" ? t.toMillis() : 0);
async function readPeople(db) {
  const [members, saves, wallets] = await Promise.all([db.collection("members").get(), db.collection("saves").get(), db.collection("casinoWallets").get()]);
  const map = {}, wmap = {};
  saves.docs.forEach(d => { map[d.id] = d.data().data; });
  wallets.docs.forEach(d => { wmap[d.id] = d.data().data; }); // 賭場錢包（決定 0054）：data 是 JSON 字串；只在這裡用 Admin 讀，規則沒放寬
  return { members: members.docs.map(d => ({ uid: d.id, nick: d.data().nick, joinedAt: toMs(d.data().joinedAt) })), saves: map, wallets: wmap };
}

// 回傳 { status, text }。status：already 這週發過了、dry 只印不發、empty 沒人有進度、skip 沒放 Discord、failed 發失敗、posted 發了
// board：shared/board.js（測試傳 load_shared 載入的）；db：Firestore（測試傳假的）；env、fetcher 傳給 send
async function runWeekly({ db, board, opts = {}, env = process.env, fetcher, log = console.log, warn = console.error, floorOf = newRoomFloor }) {
  const wk = board.boardWeekOf(opts.now != null ? opts.now : board.nowMs());
  const pubRef = db.doc(`boards/${wk.label}`), latestRef = db.doc("boards/latest");
  const oldSnap = await pubRef.get();
  const old = oldSnap.exists ? oldSnap.data() : null;
  if (old && old.posted && !opts.force && !opts.dryRun) { log(`${wk.label} 的榜單發過了，這次不發（要再發一次用 force）。`); return { status: "already", week: wk.label }; }

  let doc, snapshot = null;
  if (old && !opts.force) {
    doc = old; // 快照寫了、還沒發（上次 Discord 沒放或發失敗）：用當時算好的補發，不重算
    log(`${wk.label} 的快照已經有了，用當時的榜單。`);
  } else {
    const [input, prevSnap] = await Promise.all([readPeople(db), db.doc(`boards/${wk.prev}/private/people`).get()]);
    const r = board.boardCompute(board.boardPeopleOf(input, wk), prevSnap.exists ? prevSnap.data() : null, wk, { newRoomFloor: floorOf(wk.next) });
    doc = r.doc;
    snapshot = r.snapshot;
    if (old && old.posted) { doc.posted = true; doc.postedAt = old.postedAt || null; } // 重算、再發失敗時，還是記得發過
    if (r.unreadable) log(`有 ${r.unreadable} 份存檔讀不了：這次沒算，累計數字留上週的。`);
    if (r.casUnreadable) log(`有 ${r.casUnreadable} 份賭場錢包讀不了：這次沒算，累計數字留上週的。`);
  }
  const text = board.boardDiscordText(doc, footer(), MAX);
  log(doc.empty ? `${wk.label} 沒有人有進度。` : text);
  if (opts.dryRun) { log("只印不發：沒有寫 Firestore，也沒有發 Discord。"); return { status: "dry", week: wk.label, text }; }

  if (snapshot) { // 先寫快照：後面 Discord 怎麼了都不影響
    const batch = db.batch();
    batch.set(pubRef, doc);
    batch.set(latestRef, doc);
    batch.set(db.doc(`boards/${wk.label}/private/people`), snapshot);
    await batch.commit();
    log(`${wk.label} 的快照寫好了。`);
  }
  if (doc.empty) { log("沒有人有進度，不發 Discord。"); return { status: "empty", week: wk.label, text }; }

  let ok;
  try { ok = await send(text, env, fetcher); }
  catch (e) {
    warn(`發 Discord 失敗（快照已經寫了，再跑一次會補發）：${String(e.message || e).split("\n")[0].slice(0, 300)}`);
    return { status: "failed", week: wk.label, text };
  }
  if (!ok) return { status: "skip", week: wk.label, text }; // send 已經印了「還沒放」
  const mark = { posted: true, postedAt: opts.now != null ? opts.now : board.nowMs() };
  const batch = db.batch();
  batch.set(pubRef, mark, { merge: true });
  batch.set(latestRef, mark, { merge: true });
  await batch.commit();
  log("發到 Discord 了。");
  return { status: "posted", week: wk.label, text };
}

// 每天更新：這週到現在。只寫 boards/latest。回傳 { status, week }。status：monday 週壹跳過、dry 只印不寫、empty 沒人有進度（留著原本的榜）、updated
async function runDaily({ db, board, opts = {}, log = console.log, floorOf = newRoomFloor }) {
  const now = opts.now != null ? opts.now : board.nowMs(), wk = board.boardLiveWeekOf(now);
  if (board.boardIsFirstDay(now) && !opts.force) { log("今天週壹，大家還在看上週的正式榜單，這次不更新。"); return { status: "monday", week: wk.label }; }
  const [input, prevSnap] = await Promise.all([readPeople(db), db.doc(`boards/${wk.prev}/private/people`).get()]);
  const r = board.boardCompute(board.boardPeopleOf(input, wk), prevSnap.exists ? prevSnap.data() : null, wk, { newRoomFloor: floorOf(wk.label) });
  if (r.unreadable) log(`有 ${r.unreadable} 份存檔讀不了：這次沒算。`);
  if (r.casUnreadable) log(`有 ${r.casUnreadable} 份賭場錢包讀不了：這次沒算。`);
  const doc = Object.assign({}, r.doc, { live: true, tips: [], nudges: [] }); // 建議和提醒是寫給過完的那壹週的，週中不放
  log(doc.empty ? `${wk.label} 到現在沒有人有進度。` : board.boardDiscordText(doc, ""));
  if (opts.dryRun) { log("只印不寫：沒有寫 Firestore。"); return { status: "dry", week: wk.label }; }
  if (doc.empty) { log("沒有人有進度，榜單留著原本的。"); return { status: "empty", week: wk.label }; }
  await db.doc("boards/latest").set(doc);
  log(`${wk.label} 目前的榜單更新了（只改 boards/latest，沒發 Discord）。`);
  return { status: "updated", week: wk.label };
}

async function main() {
  const argv = process.argv.slice(2);
  const event = readEvent();
  const opts = parseOptions(event, argv);
  const daily = isDaily(event, argv, process.env.BOARD_SCHEDULE);
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  if (argv.includes("--now")) {
    if (!emulator) throw new Error("--now 只有連模擬器時能用");
    opts.now = Date.parse(argv[argv.indexOf("--now") + 1]);
    if (!Number.isFinite(opts.now)) throw new Error("--now 的時間格式不對");
  }
  const root = path.join(ROOT, "functions", "node_modules");
  const { initializeApp, applicationDefault } = require(path.join(root, "firebase-admin", "lib", "app", "index.js"));
  const { getFirestore } = require(path.join(root, "firebase-admin", "lib", "firestore", "index.js"));
  if (emulator) initializeApp({ projectId: "demo-pepe4" });
  else {
    const sa = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
    if (sa.project_id !== "pepe-museum") throw new Error("金鑰不是 pepe-museum 的");
    initializeApp({ credential: applicationDefault(), projectId: sa.project_id });
  }
  const board = await loadBoard();
  if (daily) { await runDaily({ db: getFirestore(), board, opts }); return; }
  const r = await runWeekly({ db: getFirestore(), board, opts, env: emulator ? {} : process.env }); // 連模擬器一定不發 Discord
  if (r.status === "failed") process.exitCode = 1;
}

// 真的跑的時候用的規則：board.js 的，加上「現在」（nowMs 是 logic.js 的，board.js 沒有 export；測試的 load_shared 串在一起所以看不出來）
async function loadBoard() {
  const [board, logic] = await Promise.all([import("../shared/board.js"), import("../shared/logic.js")]);
  return Object.assign({}, board, { nowMs: logic.nowMs });
}

if (require.main === module) main().catch(e => { console.error("沒做成：" + String(e.message || e).split("\n")[0].slice(0, 300)); process.exit(1); });
module.exports = { parseOptions, isDaily, newRoomFloor, runWeekly, runDaily, loadBoard };
