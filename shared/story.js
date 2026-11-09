// ================================================================
//  每週劇情（遊戲這邊；規劃 docs/每週劇情.md，決定 0031）
//  內容放在 content/weeks/（格式寫在 content/README.md）：一週一個資料夾（week.json＋一天一個 d1–d7.json），
//  畫面用 Vite 的 import.meta.glob 讀進來，交給 storyLibrary() 整理。劇情帳本 content/story/帳本.json 不打包進網頁。
//  這個檔只有規則（純函式）：不碰畫面、不碰 localStorage；「今天」由呼叫的人傳進來（畫面用 todayStr()），「現在」用 nowMs()。
//
//  一週怎麼找（storyWeek）：
//    今天（台灣時間 05:00 換日）是哪一週 → ISO 週的名字（2026-W46）。
//    有 content/weeks/2026-W46/ 就用它；沒有（排程失敗、這週暫停）就用備用週 content/weeks/備用/<名字>/。
//    一天的檔（d1–d7）照日期打開：還沒到的天不打開。正式週少了某一天的檔，就用備用的一天（content/weeks/備用/一天/）。
//    每一件東西（書、任務、畫、房間）在遊戲裡的 id 都加上週的名字（2026-W46/1a），備用週重複用也不會撞在一起。
//  存檔：P.story（這間博物館的，不是某一位參觀者的；不在 VISITOR_KEYS 裡，換人不會動）。舊存檔沒有，用到時 storyState() 補。
//  進度怎麼算（syncStory）：每日、每週任務第一次出現時記下當時的數字（base），之後照「現在的數字－base」算。
//    所以不用在每個房間加程式；畫面每次 updateStatus 叫一次 syncStory 就好。
//  介面上的字照第 1 代用「壹」。
// ================================================================
import { NUM, SKILLS } from "./config.js";
import { CATS, DAY_MS, DAY_START_HOUR, TZ_HOURS, addDays, asList, clampN, cureByTask, daysBetween, exhibitById, fromKey, hashStr, isFree, optOf, parseDice, rollExpr, splitSan } from "./logic.js";
import { canStartCellar, cellarFloor, weekIndex } from "./logic3.js";
import { growSkill, limitedNames, rangeWords, shopOnSale } from "./shop.js";

// ---------- 固定的種類（排程只能從這裡挑；要新的種類得寫程式、走一般的 PR） ----------
// 任務：when ＝ daily（只能當每日任務）、weekly（只能當每週任務）、both；min ＝大約幾分鐘做得完（檢查「每天做得完」用）
// 參觀館友、送佩佩、簽到還沒做，先不放
export const STORY_TASKS = {
  make: { when: "both", min: 1.5 },     // 做 n 隻佩佩，need 可以指定 { 顏色: "綠" } 這種（每日任務只能指定一開始就有的選項）
  deliver: { when: "both", min: 1 },    // 交 n 張委託
  fuse: { when: "both", min: 2 },       // 融合 n 次
  pillow: { when: "both", min: 1 },     // 做 n 個抱枕
  hug: { when: "daily", min: 0.5 },     // 抱 n 次抱枕（今天的）
  view: { when: "both", min: 0.5 },     // 在畫廊看某一幅畫 n 次（exhibit ＝展品 id；每日任務只能挑不用理智檢定的）
  show: { when: "daily", min: 3 },      // 看完今日特展
  read: { when: "both", min: 2 },       // 讀這週的某一本書（book ＝書的 id）
  cellar: { when: "both", min: 3 },     // 在地下收藏庫走到 B{floor}
  spot: { when: "both", min: 3 },       // 找到這週多出來的房間（room ＝房間的 id）
  readWeek: { when: "weekly", min: 0 }, // 讀這週的書 n 本
  dailyAll: { when: "weekly", min: 0 }, // 每日任務全部做完 n 天
  showDays: { when: "weekly", min: 0 }, // 看完今日特展 n 天
  ending: { when: "weekly", min: 0 },   // 讀到這週的結局
};
// 劇情線的種類：main 主線（跨週，id 不加週的名字）、season 季節線（一年四季各一條，跨週，大約兩週一章；是圍繞主線主軸的副劇情，沒玩也不會卡住主線，決定 0037）、week 這週的、floor 樓層的新劇情線、holiday 節日、side 小插曲、curator 策展手記
export const LINE_KINDS = { main: "主線", season: "季節", week: "這週的", floor: "樓層的新劇情線", holiday: "節日", side: "小插曲", curator: "策展手記" };
// 跨週的線：id 不加週的名字，好幾週的書算同一條（主線、季節線）
export const CROSS_WEEK_KINDS = ["main", "season"];
// 今日特展：用 web/src/art.js 已經有的畫法，換參數（frog ＝遊戲自己的青蛙，pick 照手作坊的選項）。不畫 Pepe the Frog 的樣子
export const SHOW_ART = ["frog", "portrait", "strange", "rare", "statue", "hidden"];
export const SHOW_FX = ["sepia", "faded", "dust", "dark", "flip", "water", "torn", "shadow", "glow"]; // 畫面上的效果（web/src/css/story.css）
export const SHOW_FRAMES = ["gold", "dark", "wood", "plain", "ornate"];
// 書裡 [[字|動作]] 可以用的動作（ui_screens1.js 的 BOOK_ACTIONS）
export const BOOK_ACTION_IDS = ["void", "mirror", "window", "beat", "hat", "codex", "cellar"];
// 獎勵的東西。skillBook：用了技能加 NUM.story.skillBook；heal：受傷的佩佩全部好；material：收著，在兌換所換週章（shared/shop.js 的 tradeMats）
export const STORY_ITEMS = {
  "book:偵查": { name: "技能書《放大鏡的用法》", kind: "skillBook", skill: "偵查" },
  "book:鑑賞": { name: "技能書《看畫的方法》", kind: "skillBook", skill: "鑑賞" },
  "book:神秘學": { name: "技能書《不要念出聲》", kind: "skillBook", skill: "神秘學" },
  "book:幸運": { name: "技能書《擲骰子的姿勢》", kind: "skillBook", skill: "幸運" },
  "book:手工藝": { name: "技能書《縫線入門》", kind: "skillBook", skill: "手工藝" },
  "book:說服": { name: "技能書《怎麼說好話》", kind: "skillBook", skill: "說服" },
  firstAid: { name: "急救箱", kind: "heal" },
  "mat:畫布": { name: "舊畫布", kind: "material" },
  "mat:金箔": { name: "金箔", kind: "material" },
  "mat:金線": { name: "金線", kind: "material" },
};

// ---------- 日期：週、季 ----------
const storyIsDate = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const utc = s => { const [y, m, d] = String(s).split("-").map(Number); return Date.UTC(y, m - 1, d); };
// "YYYY-MM-DD" 是星期幾：1 ＝週一 … 7 ＝週日
export function weekDayNo(dateStr) { return ((new Date(utc(dateStr)).getUTCDay() + 6) % 7) + 1; }
// 這一週的週一
export function weekMonday(dateStr) { return addDays(dateStr, 1 - weekDayNo(dateStr)); }
// ISO 週的名字（週一開始；一年的第一週是有星期四的那一週），例如 2026-11-09 → "2026-W46"
export function isoWeek(dateStr) {
  const thu = utc(weekMonday(dateStr)) + 3 * DAY_MS;
  const y = new Date(thu).getUTCFullYear();
  const wk = 1 + Math.floor((thu - Date.UTC(y, 0, 1)) / DAY_MS / 7);
  return `${y}-W${String(wk).padStart(2, "0")}`;
}
// "2026-W46" → 那一週的週一 "2026-11-09"（格式不對回傳 null）
export function isoMonday(label) {
  const m = /^(\d{4})-W(\d{2})$/.exec(String(label));
  if (!m) return null;
  const jan4 = `${m[1]}-01-04`;
  return addDays(weekMonday(jan4), (+m[2] - 1) * 7);
}
// 那一天（台灣時間 05:00）開始的那一刻，毫秒
export function dayStartMs(dateStr) { return utc(dateStr) - (TZ_HOURS - DAY_START_HOUR) * 3600000; }
// 這週還剩多久（到下週一 05:00）："6 天 23 小時"；不到一小時寫分鐘
export function weekLeftText(now, monday) {
  const ms = Math.max(0, dayStartMs(addDays(monday, 7)) - now);
  const d = Math.floor(ms / DAY_MS), hr = Math.floor((ms % DAY_MS) / 3600000);
  if (!d && !hr) return `${Math.max(1, Math.ceil(ms / 60000))} 分鐘`;
  return d ? `${d} 天 ${hr} 小時` : `${hr} 小時`;
}
// 第幾季（NUM.story.seasonStart 那一週是第 1 季；更早的是 0 ＝序章）
export function seasonOf(label) {
  const mon = isoMonday(label);
  if (!mon) return 0;
  const n = weekIndex(mon) - weekIndex(weekMonday(NUM.story.seasonStart));
  return n < 0 ? 0 : 1 + Math.floor(n / NUM.story.seasonWeeks);
}
export function seasonName(n) { return n > 0 ? `第 ${n} 季` : "序章"; }
// 一年的春夏秋冬（季節線用；上面的 seasonOf 是主線四週一段的「季」，不要混）。照節氣切，差一兩天沒關係（決定 0037）
export const YEAR_SEASONS = [["春", "02-04"], ["夏", "05-05"], ["秋", "08-07"], ["冬", "11-07"]];
// "YYYY-MM-DD" 是冬／春／夏／秋（立春 2/4、立夏 5/5、立秋 8/7、立冬 11/7；1 月到 2/3 還是冬）
export function yearSeason(dateStr) {
  const md = String(dateStr).slice(5);
  let s = "冬";
  YEAR_SEASONS.forEach(([name, from]) => { if (md >= from) s = name; });
  return s;
}
// 這一週算哪一季：照這週的週一（2026-W46 的週一 11/9 是冬）
export function weekSeason(label) { const m = isoMonday(label); return m ? yearSeason(m) : null; }

// ---------- 讀進來的檔整理成一份 ----------
// files：{ "2026-W46/week.json": 內容, "2026-W46/d1.json": 內容, "備用/常青1/d1.json": …, "備用/一天/插曲1.json": … }（路徑從 content/weeks/ 算起）
export function storyLibrary(files) {
  const lib = { weeks: {}, fallback: {}, spare: {}, skipped: [] };
  const put = (box, name, file, v) => {
    const w = box[name] || (box[name] = { name, week: null, days: {} });
    if (file === "week.json") w.week = v;
    else { const m = /^d([1-7])\.json$/.exec(file); if (m) w.days[+m[1]] = v; else lib.skipped.push(file); }
  };
  Object.keys(files || {}).sort().forEach(path => {
    const v = files[path], p = String(path).split("/");
    if (!v || typeof v !== "object") { lib.skipped.push(path); return; }
    if (p.length === 2 && /^\d{4}-W\d{2}$/.test(p[0])) put(lib.weeks, p[0], p[1], v);
    else if (p.length === 3 && p[0] === "備用" && p[1] === "一天" && /\.json$/.test(p[2])) lib.spare[p[2].replace(/\.json$/, "")] = v;
    else if (p.length === 3 && p[0] === "備用") put(lib.fallback, p[1], p[2], v);
    else lib.skipped.push(path);
  });
  [lib.weeks, lib.fallback].forEach(box => Object.keys(box).forEach(k => { if (!box[k].week) { lib.skipped.push(k); delete box[k]; } }));
  return lib;
}
// 節日的接口：簽到的分支做好 holidayOf(日期) 之後，用 setStoryHolidayOf(holidayOf) 接上；週包的某一天也可以直接寫 holiday
export let STORY_HOLIDAY_OF = null;
export function setStoryHolidayOf(fn) { STORY_HOLIDAY_OF = typeof fn === "function" ? fn : null; }

function pickFallback(lib, label) {
  const names = Object.keys(lib.fallback).sort();
  if (!names.length) return null;
  return names[((weekIndex(isoMonday(label)) % names.length) + names.length) % names.length];
}
function pickSpare(lib, date, used) {
  const names = Object.keys(lib.spare).sort();
  if (!names.length) return null;
  const at = hashStr(date) % names.length;
  for (let k = 0; k < names.length; k++) { const nm = names[(at + k) % names.length]; if (!used.has(nm)) return nm; }
  return names[at];
}
// skill：房間的獎勵可以寫技能成長（決定 0032；只有房間可以，tools/week_check.cjs 擋）。加多少是 NUM.shop.trialSkill
const reward = r => ({ insp: Math.max(0, +(r && r.insp) || 0), mood: Math.max(0, +(r && r.mood) || 0), items: asList(r && r.items).filter(id => STORY_ITEMS[id]), stamps: Math.max(0, +(r && r.stamps) || 0), skill: r && SKILLS.includes(r.skill) ? r.skill : null });

// 一週整理成遊戲用的樣子（id 都加上週的名字）。label ＝ "2026-W46"；today ＝今天（只打開到今天的天）；fb ＝指定用哪一個備用週（不給就照週數輪）
// 回傳 null：還沒到的週、比 NUM.story.startWeek 早的週、找不到內容
export function storyWeekAt(lib, label, today, fb) {
  const monday = isoMonday(label);
  if (!monday || !lib || !storyIsDate(today) || today < monday || label < NUM.story.startWeek) return null; // 每週劇情從 startWeek 那週開始
  const reg = lib.weeks[label];
  const fbName = reg ? null : (fb && lib.fallback[fb] ? fb : pickFallback(lib, label));
  const src = reg || (fbName ? lib.fallback[fbName] : null);
  if (!src || !src.week) return null;
  const wk = src.week, pre = `${label}/`;
  const past = today >= addDays(monday, 7);
  const W = {
    label, start: monday, end: addDays(monday, 6), fallback: fbName, past, dayNo: past ? 8 : daysBetween(monday, today) + 1,
    title: wk.title || "", theme: wk.theme || "", summary: asList(wk.summary), holidayWeek: !!wk.holidayWeek,
    lines: [], days: [], books: [], rooms: [], works: [], daily: [],
    ending: { read: wk.ending && wk.ending.need && Number.isFinite(+wk.ending.need.read) ? +wk.ending.need.read : null },
    weeklyBonus: reward(wk.weeklyBonus), anomaly: null, shop: asList(wk.shop), // shop：這週兌換所上架的限定頭飾（shared/shop.js 的 shopOnSale）
  };
  const lineMap = {};
  const addLine = (l, p) => {
    if (!l || !l.id) return;
    const id = CROSS_WEEK_KINDS.includes(l.kind) ? l.id : p + l.id;
    if (!lineMap[p + l.id]) { lineMap[p + l.id] = id; if (!W.lines.some(x => x.id === id)) W.lines.push({ id, local: l.id, name: l.name || l.id, kind: LINE_KINDS[l.kind] ? l.kind : "week" }); }
  };
  asList(wk.lines).forEach(l => addLine(l, pre));
  const lineOf = (local, p) => local ? (lineMap[p + local] || lineMap[pre + local] || p + local) : (W.lines[0] ? W.lines[0].id : null);
  const room = (r, p, day) => Object.assign({}, r, { id: "s:" + p + r.id, local: r.id, day, line: r.line ? lineOf(r.line, p) : null, floor: +r.floor || 1, reward: reward(r.reward) });
  const task = (t, p, extra) => Object.assign({}, t, { id: p + t.id, local: t.id, n: Math.max(1, +t.n || 1), reward: reward(t.reward),
    book: t.book ? p + t.book : undefined, room: t.room ? "s:" + p + t.room : undefined }, extra);
  if (wk.anomaly) {
    W.anomaly = { title: wk.anomaly.title || "", text: asList(wk.anomaly.text), room: wk.anomaly.room ? room(wk.anomaly.room, pre, 1) : null };
    if (W.anomaly.room) { W.anomaly.room.anomaly = true; W.rooms.push(W.anomaly.room); }
  }
  W.weekly = asList(wk.weekly).map((t, i) => task(t, pre, { weekly: true, idx: i }));
  const used = new Set();
  for (let n = 1; n <= 7; n++) {
    const date = addDays(monday, n - 1);
    if (date > today) break;
    let d = src.days[n], spare = null;
    if (!d) { spare = pickSpare(lib, date, used); d = spare ? lib.spare[spare] : null; if (spare) used.add(spare); }
    if (!d) continue;
    const p = spare ? `${label}/d${n}-` : pre;
    if (spare) asList(d.lines).forEach(l => addLine(Object.assign({}, l, { kind: CROSS_WEEK_KINDS.includes(l.kind) ? "side" : l.kind }), p));
    const unlock = u => !u || !u.type || u.type === "now" ? { type: "now" } : u.type === "find" ? { type: "find", room: "s:" + p + u.room } : u.type === "task" ? { type: "task", task: p + u.task } : u.type === "ending" ? { type: "ending" } : { type: "now" };
    const day = {
      n, date, spare, holiday: d.holiday || (STORY_HOLIDAY_OF ? STORY_HOLIDAY_OF(date) : null) || null, board: d.board || "",
      books: asList(d.books).map((b, i) => Object.assign({}, b, { id: p + b.id, local: b.id, day: n, idx: i, line: lineOf(b.line, p), unlock: b.ending ? { type: "ending" } : unlock(b.unlock), pages: asList(b.pages) })),
      daily: asList(d.daily).map((t, i) => task(t, p, { daily: true, day: n, date, idx: i })),
      dailyBonus: reward(d.dailyBonus),
      show: d.show ? { title: d.show.title || "", intro: d.show.intro || "", works: asList(d.show.works).map(w => Object.assign({}, w, { id: p + w.id, local: w.id, day: n, date })) } : null,
      adds: asList(d.adds).map(r => room(r, p, n)),
    };
    W.days.push(day);
    W.books.push(...day.books); W.rooms.push(...day.adds); W.daily.push(...day.daily);
    if (day.show) W.works.push(...day.show.works);
  }
  return W;
}
// 今天這一週
export function storyWeek(lib, today, P) {
  const label = isoWeek(today), rec = P && P.story && P.story.weeks && P.story.weeks[label];
  return storyWeekAt(lib, label, today, rec && rec.fb);
}
// 以前的週（劇情回顧）：內容裡有的正式週，加上這間博物館玩過的備用週（記在 P.story.weeks）。新的在前
export function storyPastWeeks(lib, today, P) {
  const now = isoWeek(today), labels = new Set(Object.keys((lib && lib.weeks) || {}));
  Object.keys((P && P.story && P.story.weeks) || {}).forEach(l => labels.add(l));
  return [...labels].filter(l => l < now && isoMonday(l)).sort().reverse()
    .map(l => storyWeekAt(lib, l, today, P && P.story && P.story.weeks && P.story.weeks[l] && P.story.weeks[l].fb)).filter(Boolean);
}
export function dayOf(W, n) { return W ? W.days.find(d => d.n === n) || null : null; }
export function todayOf(W) { return W && !W.past ? dayOf(W, W.dayNo) : null; }
export function lineById(W, id) { return W ? W.lines.find(l => l.id === id) || null : null; }

// ---------- 存檔 ----------
// P.story = { v, books: { id: { got, read } }, tasks: { id: { base, done, claimed } }, works: { id: 日期 }, spots: { 房間 id: 日期 },
//             weeks: { 週: { fb, first, bonus: { 第幾天: 日期 }, weekBonus } }, deep: { 日期: 走到第幾層 }, showInsp: { 日期: 拿了幾靈感 },
//             bag: { 東西 id: 幾個 }, stamps: 週章, track: 追蹤哪一條劇情線, seen: { 劇情線 id: 看過的下一步 }, log: [] }
const isPlain = v => !!v && typeof v === "object" && !Array.isArray(v);
export function storyState(P) {
  if (!isPlain(P.story)) P.story = {};
  const S = P.story;
  S.v = 1;
  ["books", "tasks", "works", "spots", "weeks", "deep", "showInsp", "bag", "seen"].forEach(k => { if (!isPlain(S[k])) S[k] = {}; });
  if (!Number.isFinite(S.stamps) || S.stamps < 0) S.stamps = 0;
  if (typeof S.track !== "string") S.track = null;
  if (!Array.isArray(S.log)) S.log = [];
  return S;
}
// 舊的紀錄清掉（8 週以前的任務、看過的畫、每天的數字）；書讀過的留著（劇情回顧要用）
export function pruneStory(S, today) {
  const cutDate = addDays(weekMonday(today), -56), cutWeek = isoWeek(cutDate);
  ["tasks", "works"].forEach(k => Object.keys(S[k]).forEach(id => { if (id.split("/")[0] < cutWeek) delete S[k][id]; }));
  ["deep", "showInsp"].forEach(k => Object.keys(S[k]).forEach(d => { if (d < cutDate) delete S[k][d]; }));
  if (S.log.length > 100) S.log = S.log.slice(-100);
}

// ---------- 任務 ----------
const NEED_WORD = { 顏色: v => /[色彩金]$/.test(v) ? v : v + "色", 帽子: v => v === "沒有" ? "不戴帽子" : "戴" + v, 背景: v => "背景是" + v, 手上拿的東西: v => "拿著" + v };
export function needWords(need) { return Object.keys(need || {}).filter(c => CATS.includes(c)).map(c => (NEED_WORD[c] || (v => v))(need[c])).join("、"); }
const bookOf = (W, id) => W ? W.books.find(b => b.id === id) || null : null;
const roomOf = (W, id) => W ? W.rooms.find(r => r.id === id) || null : null;
export function showOfDay(W, n) { const d = dayOf(W, n); return d && d.show ? d.show : null; }
export function taskTarget(t, W) {
  if (t.kind === "show") { const s = showOfDay(W, t.day); return s ? s.works.length : 1; }
  if (t.kind === "read" || t.kind === "spot" || t.kind === "ending" || t.kind === "cellar") return 1;
  return t.n;
}
// 任務的字（畫面用）
export function taskText(t, W) {
  const n = t.n || 1;
  switch (t.kind) {
    case "make": { const w = needWords(t.need); return `做 ${n} 隻${w ? w + "的" : ""}佩佩`; }
    case "deliver": return `交 ${n} 張委託`;
    case "fuse": return `在融合室融合 ${n} 次`;
    case "pillow": return `做 ${n} 個抱枕`;
    case "hug": return `抱 ${n} 次抱枕`;
    case "view": { const ex = exhibitById(t.exhibit); return `在畫廊看「${ex ? ex.title : t.exhibit}」` + (n > 1 ? ` ${n} 次` : ""); }
    case "show": { const s = showOfDay(W, t.day); return `看完今日特展${s ? `「${s.title}」（${s.works.length} 幅）` : ""}`; }
    case "read": { const b = bookOf(W, t.book); return `讀書架上的〈${b ? b.title : "？"}〉`; }
    case "cellar": return `在地下收藏庫走到 B${t.floor || 1}`;
    case "spot": { const r = roomOf(W, t.room); return r ? (r.hint || `去 B${r.floor} 看看`) : "找到這週多出來的地方"; }
    case "readWeek": return `讀這週的書 ${n} 本`;
    case "dailyAll": return `每日任務全部做完 ${n} 天`;
    case "showDays": return `看完今日特展 ${n} 天`;
    case "ending": return "讀到這週的結局";
    default: return t.kind;
  }
}
// 這個任務要去哪裡做：{ room, params } 或 { panel }（畫面的「前往」）
export function taskGo(t, W) {
  switch (t.kind) {
    case "make": return { room: "workshop" };
    case "deliver": return { room: "commission" };
    case "fuse": return { room: "fusion" };
    case "pillow": case "hug": return { room: "pillow" };
    case "view": return { room: "gallery" };
    case "show": case "showDays": return { room: "gallery", params: { show: true } };
    case "read": case "readWeek": case "ending": return { room: "origin", params: { tab: "weekly" } };
    case "cellar": case "spot": return { room: "cellar" };
    default: return null;
  }
}
const sumVals = o => Object.values(o || {}).reduce((s, v) => s + (typeof v === "number" ? v : v && typeof v.n === "number" ? v.n : 0), 0);
// 做了幾隻符合條件的佩佩（收藏裡的數量，失敗作也算）
export function madeCount(P, need) {
  const keys = Object.keys(need || {}).filter(c => CATS.includes(c));
  const ok = k => { if (!keys.length) return true; const p = fromKey(k); return !!p && keys.every(c => p[c] === need[c]); };
  let n = 0;
  Object.entries(P.pepes || {}).forEach(([k, e]) => { if (ok(k)) n += (e && e.n) || 1; });
  Object.entries(P.failed || {}).forEach(([k, c]) => { if (ok(k)) n += +c || 1; });
  return n;
}
// 要記 base 的任務：「現在的數字」
function counterOf(P, t) {
  switch (t.kind) {
    case "make": return madeCount(P, t.need);
    case "deliver": return P.done || 0;
    case "fuse": return (P.stats && P.stats.fused) || 0;
    case "pillow": return sumVals(P.pillows);
    case "view": return (P.seen && P.seen[t.exhibit]) || 0;
    default: return null;
  }
}
const allDailyDone = (S, d) => d.daily.length > 0 && d.daily.every(t => S.tasks[t.id] && S.tasks[t.id].done);
const showDone = (S, d) => !!(d.show && d.show.works.length && d.show.works.every(w => S.works[w.id]));
// 任務現在做到多少（0 到 taskTarget）
export function taskCount(P, W, t, S = storyState(P)) {
  const st = S.tasks[t.id], target = taskTarget(t, W);
  let n = 0;
  const base = counterOf(P, t);
  if (base != null) n = st && Number.isFinite(st.base) ? base - st.base : 0;
  else switch (t.kind) {
    case "hug": n = P.day && P.day.date === t.date ? Object.keys(P.day.hugs || {}).length : 0; break;
    case "show": { const s = showOfDay(W, t.day); n = s ? s.works.filter(w => S.works[w.id]).length : 0; break; }
    case "read": n = S.books[t.book] && S.books[t.book].read ? 1 : 0; break;
    case "cellar": { const dates = t.daily ? [t.date] : W.days.map(d => d.date); n = dates.some(d => (S.deep[d] || 0) >= (t.floor || 1)) ? 1 : 0; break; }
    case "spot": n = S.spots[t.room] ? 1 : 0; break;
    case "readWeek": n = W.books.filter(b => S.books[b.id] && S.books[b.id].read).length; break;
    case "dailyAll": n = W.days.filter(d => allDailyDone(S, d)).length; break;
    case "showDays": n = W.days.filter(d => showDone(S, d)).length; break;
    case "ending": n = W.books.some(b => b.ending && S.books[b.id] && S.books[b.id].read) ? 1 : 0; break;
    default: n = 0;
  }
  if (st && st.done) n = target; // 做完就是做完，數字不會再掉回去
  return clampN(n, 0, target);
}
export function taskDone(P, t) { const S = storyState(P), st = S.tasks[t.id]; return !!(st && st.done); }

// ---------- 書 ----------
const spotFound = (P, S, id) => !!(S.spots[id] || (P.cellar && P.cellar.won && P.cellar.won[id]));
// 季節線的書不算在「讀幾本打開結局」裡：沒讀也不會卡住這週、卡住主線（決定 0037）
const countsForEnding = (W, b) => !b.ending && (lineById(W, b.line) || {}).kind !== "season";
function endingNeed(W) { const others = W.books.filter(b => countsForEnding(W, b)).length; return W.ending.read == null ? others : Math.min(W.ending.read, others); }
// 這本書的條件到了沒（不看有沒有讀過）
export function bookOpenNow(P, W, b, S = storyState(P)) {
  if (W.past) return true;
  const u = b.unlock || { type: "now" };
  if (u.type === "find") return spotFound(P, S, u.room);
  if (u.type === "task") return !!(S.tasks[u.task] && S.tasks[u.task].done);
  if (u.type === "ending") return W.books.filter(x => countsForEnding(W, x) && S.books[x.id] && S.books[x.id].read).length >= endingNeed(W);
  return true;
}
// "read"、"open"、"locked"
export function bookState(P, W, b) {
  const S = storyState(P), rec = S.books[b.id];
  if (rec && rec.read) return "read";
  return rec || bookOpenNow(P, W, b, S) ? "open" : "locked";
}
// 鎖著的書，書背點了寫什麼（只說去哪裡、做什麼，不破梗）
export function bookHint(W, b) {
  const u = b.unlock || {};
  if (b.hint) return b.hint;
  if (u.type === "find") { const r = roomOf(W, u.room); return r ? `${r.hint || `去 B${r.floor} 看看`}，書頁就在那裡。` : "在地下收藏庫的某個地方。"; }
  if (u.type === "task") { const t = W.daily.concat(W.weekly).find(x => x.id === u.task); return t ? `做完任務「${taskText(t, W)}」就會解開。` : "做完某個任務就會解開。"; }
  if (u.type === "ending") return `先讀完這週的其他書（${endingNeed(W)} 本），這本就會解開。`;
  return "";
}
// 讀完一本（畫面翻到最後一頁時叫）。只有這一週第一次讀完給靈感；以前的週補讀不給
export function readStoryBook(P, W, id, today) {
  if (!P || isFree(P)) return { ok: false };
  const S = storyState(P), b = bookOf(W, id);
  if (!b || bookState(P, W, b) === "locked") return { ok: false, reason: "這本還打不開" };
  const rec = S.books[id] || (S.books[id] = { got: today, read: null });
  if (rec.read) return { ok: true, first: false, insp: 0 };
  rec.read = today;
  const insp = W.past ? 0 : NUM.story.bookInsp;
  P.insp += insp;
  return { ok: true, first: true, insp };
}

// ---------- 每天、每次 updateStatus：看有沒有新東西（純函式，回傳事件） ----------
// 事件：storyBook（新的書）、storyTask（任務做完了，可以領）、storySpot（找到這週多出來的房間）、storyDay（新的一週／一天）
export function syncStory(P, W, today) {
  if (!P || isFree(P) || !W || W.past) return [];
  const S = storyState(P), ev = [];
  const rec = S.weeks[W.label] || (S.weeks[W.label] = { fb: W.fallback, first: today, bonus: {}, weekBonus: null });
  if (!isPlain(rec.bonus)) rec.bonus = {};
  if (rec.last !== today) { if (rec.last) ev.push({ type: "storyDay", week: W.label, day: W.dayNo }); rec.last = today; pruneStory(S, today); }
  // 地下收藏庫走到第幾層（每日、每週任務「走到 B幾」）
  const run = P.cellar && P.cellar.run;
  if (run && !run.extra && run.floor) S.deep[today] = Math.max(S.deep[today] || 0, run.floor);
  // 這週多出來的房間：在地下收藏庫過了（P.cellar.won）就算找到
  W.rooms.forEach(r => { if (!S.spots[r.id] && P.cellar && P.cellar.won && P.cellar.won[r.id]) { S.spots[r.id] = today; ev.push({ type: "storySpot", room: r }); } });
  // 任務：今天的每日任務、這週的每週任務。第一次看到時記下 base
  const day = todayOf(W);
  const live = (day ? day.daily : []).concat(W.weekly);
  const books = () => W.books.forEach(b => {
    if (S.books[b.id] || !bookOpenNow(P, W, b, S)) return;
    S.books[b.id] = { got: today, read: null };
    ev.push({ type: "storyBook", book: b });
  });
  books();
  for (let round = 0; round < 2; round++) { // 兩輪：讀書的任務做完 → 解開下一本 → 再看一次
    live.forEach(t => {
      let st = S.tasks[t.id];
      if (!st) { const c = counterOf(P, t); st = S.tasks[t.id] = { base: c == null ? 0 : c, done: null, claimed: null }; }
      if (!st.done && taskCount(P, W, t, S) >= taskTarget(t, W)) { st.done = today; ev.push({ type: "storyTask", task: t }); }
    });
    books();
  }
  return ev;
}

// ---------- 獎勵 ----------
export function itemName(id) { return (STORY_ITEMS[id] || { name: id }).name; }
export function itemDesc(id) {
  const it = STORY_ITEMS[id];
  if (!it) return "";
  if (it.kind === "skillBook") { const p = parseDice(NUM.story.skillBook); return `用了：${it.skill} +${p.m ? `${p.n}～${p.n * p.m}` : p.flat}（最多到 ${NUM.story.skillCap}）。給現在這位參觀者。`; }
  if (it.kind === "heal") return "用了：地下收藏庫受傷的佩佩，全部馬上好。";
  return `收著。在兌換所，每 ${NUM.shop.matToStamp} 份換壹枚週章。`;
}
export function rewardText(r) {
  if (!r) return "";
  const bits = [];
  if (r.insp) bits.push(`靈感 +${r.insp}`);
  if (r.mood) bits.push(`心情 +${r.mood}`);
  if (r.stamps) bits.push(`週章 ${r.stamps} 枚`);
  if (r.skill) bits.push(`${r.skill} +${rangeWords(NUM.shop.trialSkill)}`);
  asList(r.items).forEach(id => bits.push(itemName(id)));
  return bits.join("、");
}
function give(P, S, r, today, what) {
  if (r.insp) P.insp += r.insp;
  if (r.mood) P.mood = clampN((P.mood || 0) + r.mood, 0, 99);
  if (r.stamps) S.stamps += r.stamps;
  asList(r.items).forEach(id => { S.bag[id] = (S.bag[id] || 0) + 1; });
  S.log.push({ d: today, what, r: rewardText(r) });
  if (S.log.length > 100) S.log = S.log.slice(-100);
  return r.skill ? growSkill(P, r.skill, NUM.shop.trialSkill, NUM.story.skillCap) : null; // 房間的技能成長（決定 0032）：現在這位長
}
// 領任務的獎勵（只有那一週領得到）。每週任務多給週章
export function claimTask(P, W, id, today) {
  if (!P || isFree(P)) return { ok: false, reason: "自由模式沒有任務" };
  if (!W || W.past) return { ok: false, reason: "這週已經過了" };
  const S = storyState(P), t = W.daily.concat(W.weekly).find(x => x.id === id), st = S.tasks[id];
  if (!t || !st || !st.done) return { ok: false, reason: "還沒做完" };
  if (st.claimed) return { ok: false, reason: "領過了" };
  st.claimed = today;
  const r = Object.assign({}, t.reward, { items: t.reward.items.slice(), stamps: t.weekly ? NUM.story.stampPerTask : 0 });
  give(P, S, r, today, id);
  return { ok: true, reward: r };
}
// 一天的 3 個每日任務都做完：多一份
export function dayBonusState(P, W, n) {
  const S = storyState(P), d = dayOf(W, n), rec = S.weeks[W.label];
  if (!d) return "none";
  if (rec && rec.bonus && rec.bonus[n]) return "claimed";
  return allDailyDone(S, d) ? "ready" : "wait";
}
export function claimDayBonus(P, W, n, today) {
  if (!P || isFree(P) || !W || W.past) return { ok: false, reason: "這週已經過了" };
  const st = dayBonusState(P, W, n);
  if (st !== "ready") return { ok: false, reason: st === "claimed" ? "領過了" : "3 個每日任務還沒都做完" };
  const S = storyState(P), rec = S.weeks[W.label] || (S.weeks[W.label] = { fb: W.fallback, first: today, bonus: {} });
  if (!isPlain(rec.bonus)) rec.bonus = {};
  rec.bonus[n] = today;
  const r = dayOf(W, n).dailyBonus;
  give(P, S, r, today, `${W.label}/day${n}`);
  return { ok: true, reward: r };
}
// 5 個每週任務都做完：這週限定的那份＋多的週章
export function weekBonusState(P, W) {
  const S = storyState(P), rec = S.weeks[W.label];
  if (rec && rec.weekBonus) return "claimed";
  return W.weekly.length && W.weekly.every(t => S.tasks[t.id] && S.tasks[t.id].done) ? "ready" : "wait";
}
export function claimWeekBonus(P, W, today) {
  if (!P || isFree(P) || !W || W.past) return { ok: false, reason: "這週已經過了" };
  if (weekBonusState(P, W) !== "ready") return { ok: false, reason: weekBonusState(P, W) === "claimed" ? "領過了" : "每週任務還沒都做完" };
  const S = storyState(P), rec = S.weeks[W.label] || (S.weeks[W.label] = { fb: W.fallback, first: today, bonus: {} });
  rec.weekBonus = today;
  const r = Object.assign({}, W.weeklyBonus, { items: W.weeklyBonus.items.slice(), stamps: (W.weeklyBonus.stamps || 0) + NUM.story.stampAllBonus });
  give(P, S, r, today, `${W.label}/week`);
  return { ok: true, reward: r };
}
// 還沒領的：這週做完、還沒領的任務（每日任務錯過當天，只要還在這週就還能領）
export function unclaimed(P, W) {
  if (!P || isFree(P) || !W || W.past) return [];
  const S = storyState(P);
  return W.daily.concat(W.weekly).filter(t => S.tasks[t.id] && S.tasks[t.id].done && !S.tasks[t.id].claimed);
}
// 東西現在用得了嗎：{ ok, reason }
export function itemUsable(P, id) {
  const it = STORY_ITEMS[id], S = storyState(P);
  if (!it || !(S.bag[id] > 0)) return { ok: false, reason: "沒有這個" };
  if (it.kind === "material") return { ok: false, reason: "收著，到兌換所換週章" };
  if (isFree(P)) return { ok: false, reason: "自由模式用不到" };
  if (it.kind === "skillBook") {
    if (!P.skills || !SKILLS.includes(it.skill)) return { ok: false, reason: "這位參觀者還沒有技能（先選職業）" };
    if ((P.skills[it.skill] || 0) >= NUM.story.skillCap) return { ok: false, reason: `${it.skill}已經 ${NUM.story.skillCap} 了，書上寫的你都會了` };
    return { ok: true };
  }
  if (it.kind === "heal") return Object.keys(P.injured || {}).length ? { ok: true } : { ok: false, reason: "現在沒有受傷的佩佩，先收著" };
  return { ok: false, reason: "用不了" };
}
// 用掉一個（「馬上使用」、背包裡的「使用」）
export function useStoryItem(P, id) {
  const can = itemUsable(P, id);
  if (!can.ok) return can;
  const it = STORY_ITEMS[id], S = storyState(P);
  S.bag[id]--;
  if (!S.bag[id]) delete S.bag[id];
  if (it.kind === "skillBook") {
    const before = P.skills[it.skill] || 0, roll = rollExpr(NUM.story.skillBook);
    P.skills[it.skill] = Math.min(NUM.story.skillCap, before + roll.total);
    return { ok: true, text: `${it.skill} ${before} → ${P.skills[it.skill]}`, roll };
  }
  const n = Object.keys(P.injured || {}).length;
  P.injured = {};
  return { ok: true, text: `${n} 隻受傷的佩佩都好了` };
}

// ---------- 今日特展 ----------
// 看一幅：第一次看給靈感（一天有上限），不可怕的畫順便治好「看一幅不可怕的畫」的怪癖。理智檢定交給畫面（sanFlow）
// 週日的「本週回顧展」看以前幾天的畫：記下來，不給靈感
export function viewShowWork(P, W, id, today) {
  const S = storyState(P), w = W ? W.works.find(x => x.id === id) : null;
  if (!w) return { ok: false };
  const first = !S.works[id], todays = w.date === today && !W.past;
  if (first) S.works[id] = today;
  const out = { ok: true, first, insp: 0, san: w.san || null, cured: [], capped: false };
  if (isFree(P)) return out;
  if (first && todays) {
    const want = NUM.story.showInsp[w.san ? 1 : 0] || 0, left = Math.max(0, NUM.story.showInspDay - (S.showInsp[today] || 0));
    out.insp = Math.min(want, left); out.capped = want > left;
    P.insp += out.insp; S.showInsp[today] = (S.showInsp[today] || 0) + out.insp;
  }
  if (!w.san) out.cured = cureByTask(P, "calm");
  return out;
}
// 週日：這週以前幾天的畫（本週回顧展）
export function weekReview(W) { return W && W.dayNo >= 7 ? W.works.filter(w => w.day < 7) : []; }

// ---------- 地下收藏庫：本週異狀、這週多出來的房間 ----------
// 用遊戲已經有的房間（content3.js 的 CELLAR 那種格式）組出來，借單人地下收藏庫的流程走一間（P.cellar.run.extra，logic3.js 認得）
export function roomOpen(P, r) { return !!r && (r.floor <= ((P.cellar && P.cellar.best) || 0) + 1); }
export function startStoryRoom(P, W, id, keys) {
  if (!P || isFree(P)) return { ok: false, reason: "自由模式不下去" };
  const r = roomOf(W, id);
  if (!r || W.past) return { ok: false, reason: "這個地方已經不在了" };
  if (!cellarFloor(r.floor)) return { ok: false, reason: "這壹層還沒開放" };
  const can = canStartCellar(P, r.floor, keys);
  if (!can.ok) return can;
  const extra = { id: r.id, title: r.title, lines: asList(r.lines), mood: r.mood || null, color: r.color || null, choices: asList(r.choices), intro: r.intro || null, story: true };
  P.cellar.run = { floor: r.floor, idx: 0, team: keys.slice(), used: {}, log: [], extra };
  return { ok: true };
}
// 找到的時候給的那份（房間選項本身的靈感照地下收藏庫的規則給）
export function claimSpot(P, W, id, today) {
  const S = storyState(P), r = roomOf(W, id), rec = S.weeks[W.label] || (S.weeks[W.label] = { fb: W.fallback, first: today, bonus: {} });
  if (!r || !S.spots[id]) return { ok: false, reason: "還沒找到" };
  if (!isPlain(rec.spots)) rec.spots = {};
  if (rec.spots[id]) return { ok: false, reason: "領過了" };
  rec.spots[id] = today;
  const grown = give(P, S, r.reward, today, id);
  return { ok: true, reward: r.reward, grown };
}
export function spotClaimed(P, W, id) { const rec = storyState(P).weeks[W.label]; return !!(rec && rec.spots && rec.spots[id]); }

// ---------- 劇情線 ----------
// 每一條：名字、種類、讀了幾本、下一步（只說去哪裡、做什麼）。storyLines 回傳這週的（主線也在這裡，W.lines 裡 kind main 的）；季節線跨週，在 seasonLines
export function shelfTabOf(line) { const k = line && line.kind; return k === "main" ? "mainline" : k === "season" ? "season" : k === "holiday" ? "holiday" : "weekly"; }
export function lineNext(P, W, line) {
  const S = storyState(P);
  const books = W.books.filter(b => b.line === line.id);
  for (const b of books) {
    const st = bookState(P, W, b);
    if (st === "read") continue;
    if (st === "open") return { text: `讀書架上的〈${b.title}〉`, room: "origin", params: { tab: shelfTabOf(line) } };
    const u = b.unlock || {};
    if (u.type === "find") { const r = roomOf(W, u.room); return { text: r ? r.hint || `去 B${r.floor} 看看` : "去地下收藏庫看看", room: "cellar" }; }
    if (u.type === "task") { const t = W.daily.concat(W.weekly).find(x => x.id === u.task); return { text: t ? `先做完任務「${taskText(t, W)}」` : "先做完某個任務", panel: "story" }; }
    if (u.type === "ending") return { text: "先把這週的其他書讀完", room: "origin", params: { tab: "weekly" } };
  }
  const r = W.rooms.find(x => x.line === line.id && !spotFound(P, S, x.id));
  if (r && !W.past) return { text: r.hint || `去 B${r.floor} 看看`, room: "cellar" };
  return null;
}
export function storyLines(P, W) {
  if (!P || isFree(P) || !W) return [];
  const S = storyState(P);
  return W.lines.filter(line => line.kind !== "season").map(line => { // 季節線跨週，另外算（seasonLines）
    const books = W.books.filter(b => b.line === line.id), read = books.filter(b => bookState(P, W, b) === "read").length;
    const next = lineNext(P, W, line);
    const tail = !next && !W.past && W.dayNo < 7 ? { text: "明天 05:00 之後再來看看", room: null, wait: true } : null;
    const done = W.past || (!next && W.dayNo >= 7);
    const step = next || tail;
    const key = done ? "done" : step ? step.text : "";
    return { id: line.id, name: line.name, kind: line.kind, kindText: LINE_KINDS[line.kind] || "", week: W.label, books: books.length, read, next: step, done,
      fresh: !done && S.seen[line.id] !== key, key, tracked: S.track === line.id,
      started: books.length > 0 || W.rooms.some(r => r.line === line.id) };
  }).filter(l => l.started); // 還沒有書、也還沒有房間的線先不列（名字可能會破梗）
}
// 季節線：跨好幾週，把全部的週（weeks，以前的＋這週）裡掛在同一條線上的書加起來。回傳最新的一條在最後。
// 過了那週的書還是可以補讀，下一步會先帶去讀舊的。有更新的一條（換季了）就算走完（done），收進劇情回顧；書還在書架上。
export function seasonLines(P, weeks) {
  if (!P || isFree(P)) return [];
  const S = storyState(P), all = asList(weeks).filter(Boolean).slice().sort((a, b) => a.label.localeCompare(b.label)), order = [], map = {};
  all.forEach(w => w.lines.filter(l => l.kind === "season").forEach(l => {
    const books = w.books.filter(b => b.line === l.id);
    if (!books.length) return; // 宣告了還沒放書：先不列（名字可能會破梗）
    if (!map[l.id]) { map[l.id] = { line: l, weeks: [], books: [] }; order.push(map[l.id]); }
    map[l.id].weeks.push(w);
    books.forEach(b => map[l.id].books.push({ w, b }));
  }));
  return order.map((x, i) => {
    const done = i < order.length - 1;
    let next = null;
    for (const w of x.weeks) { next = lineNext(P, w, x.line); if (next) break; }
    const step = next || (done ? null : { text: "下壹章還沒來，過幾天再看看", room: null, wait: true });
    const key = done ? "done" : step.text;
    return { id: x.line.id, name: x.line.name, kind: "season", kindText: LINE_KINDS.season, week: x.weeks[x.weeks.length - 1].label, books: x.books.length,
      read: x.books.filter(o => bookState(P, o.w, o.b) === "read").length, list: x.books, next: step, done,
      fresh: !done && S.seen[x.line.id] !== key, key, tracked: S.track === x.line.id, started: true };
  });
}
export function markLinesSeen(P, lines) { const S = storyState(P); asList(lines).forEach(l => { S.seen[l.id] = l.key; }); }
export function trackLine(P, id) { const S = storyState(P); S.track = S.track === id ? null : id; return S.track; }

// ---------- 公佈欄：這週的公告（shared/notices.js 的格式；同一則每天多一行，不另外發） ----------
export function storyNotice(W, today, now) {
  if (!W || W.past) return null;
  return {
    id: "story-" + W.label, v: W.dayNo, cat: "特展活動", tags: W.dayNo === 1 ? ["重要", "活動"] : ["活動"], importance: W.dayNo === 1 ? "important" : "normal",
    title: `本週地下收藏庫：〈${W.title}〉`, publish: W.start, expire: W.end, start: W.start, end: W.end, story: true,
    sections: [
      ["大綱", W.summary],
      ["這週怎麼玩", [
        "每天 05:00：起源室書架的「每週劇情」多 1～2 本書，3 個每日任務換新，畫廊的「今日特展」換壹個主題。",
        "每週任務 5 個，做完壹個拿壹枚週章（週章會存起來，到兌換所換裝備、提升技能）。週日讀到這週的結局。",
        "錯過的天，書都還在，可以補讀；每日任務、今日特展只有當天。",
      ]],
      ["兌換所", [`這週上架的限定頭飾：${limitedNames(shopOnSale(W, W.start))}。`]],
      W.anomaly ? ["本週異狀", [W.anomaly.title].concat(W.anomaly.text)] : null,
      ["每週任務", W.weekly.map(t => `・${taskText(t, W)}`)],
      ["時間", [`這週還剩 ${weekLeftText(now, W.start)}（下週壹 05:00 換下壹週）。`]],
      ["每天", W.days.map(d => `第 ${d.n} 天：${d.board}`)],
    ].filter(Boolean),
    cta: { label: "前往", panel: "story" },
  };
}

// ---------- 預算（tools/week_check.cjs 和測試用） ----------
const maxChoiceInsp = r => Math.max(0, ...asList(r && r.choices).map(c => +(c && c.success && c.success.insp) || 0));
const addR = (a, r) => { const x = reward(r); a.insp += x.insp; a.mood += x.mood; a.items += x.items.length; a.skills += x.skill ? 1 : 0; return a; };
// 一天全部拿到的（週包裡的原始格式）
export function dayRewardTotal(d) {
  const t = { insp: 0, mood: 0, items: 0, skills: 0 };
  asList(d && d.daily).forEach(x => addR(t, x.reward));
  addR(t, d && d.dailyBonus);
  t.insp += asList(d && d.books).length * NUM.story.bookInsp;
  asList(d && d.adds).forEach(r => { addR(t, r.reward); t.insp += maxChoiceInsp(r); });
  if (d && d.show) t.insp += NUM.story.showInspDay;
  return t;
}
// 每週任務＋全做完的那份＋本週異狀的房間
export function weekTaskTotal(wk) {
  const t = { insp: 0, mood: 0, items: 0, skills: 0 };
  asList(wk && wk.weekly).forEach(x => addR(t, x.reward));
  addR(t, wk && wk.weeklyBonus);
  if (wk && wk.anomaly && wk.anomaly.room) { addR(t, wk.anomaly.room.reward); t.insp += maxChoiceInsp(wk.anomaly.room); }
  return t;
}
// 理智檢定的寫法對不對、失敗最多扣幾點（今日特展、房間的檢查用）
export function sanMax(spec) {
  if (!/^\s*(\d+|\d*D\d+)\s*\/\s*(\d+|\d*D\d+)\s*$/i.test(String(spec))) return { ok: false };
  const [a, b] = splitSan(spec), m = x => { const p = parseDice(x); return p.m ? p.n * p.m : p.flat; };
  return { ok: true, success: m(a), fail: m(b) };
}
// 手作坊的選項存在嗎（今日特展的 pick、任務的 need）
export function storyOptOk(cat, v) { return CATS.includes(cat) && !!optOf(cat, v); }
