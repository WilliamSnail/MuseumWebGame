// ================================================================
//  每週劇情（遊戲這邊；規劃 docs/規劃/每週劇情.md，決定 0031）
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
import { NUM, SKILLS } from "../core/config.js";
import { CATS, DAY_MS, DAY_START_HOUR, TZ_HOURS, addDays, asList, canStartCellar, cellarFloor, clampN, cureByTask, daysBetween, exhibitById, fromKey, hashStr, isFree, optOf, parseDice, rollExpr, splitSan, weekIndex } from "../core/logic_base.js";
import { cleanEvents, eventListLine } from "./events.js";
import { STORY_ITEMS, isPlain, storyState } from "./state.js";
import { growSkill, limitedNames, rangeWords, shopOnSale } from "../core/shop.js";
import { casArtMarkViewed, casArtViewCredit } from "../casino/art.js";

// ---------- 固定的種類（排程只能從這裡挑；要新的種類得寫程式、走一般的 PR） ----------
// 任務：when ＝ daily（只能當每日任務）、weekly（只能當每週任務）、both；min ＝大約幾分鐘做得完（檢查「每天做得完」用）
// 參觀館友、送佩佩、簽到還沒做，先不放
export const STORY_TASKS = {
  // pts ＝每日任務的積分（決定 0146）；act ＝靠「做過了」的紀錄（storyAct）判斷；chip ＝伺服器看得到，做了可以拿籌碼
  make: { when: "both", min: 2, pts: 25 },       // 做 n 隻佩佩，need 可以指定 { 顏色: "綠" } 這種（每日任務只能指定一開始就有的選項）
  deliver: { when: "both", min: 1.5, pts: 20 },  // 交 n 張委託
  fuse: { when: "both", min: 2.5, pts: 30 },     // 融合 n 次
  pillow: { when: "both", min: 1.5, pts: 20 },   // 做 n 個抱枕
  hug: { when: "daily", min: 1, pts: 15 },       // 抱 n 次抱枕（今天的）
  view: { when: "both", min: 1, pts: 15 },       // 在畫廊看某一幅畫 n 次（exhibit ＝展品 id；每日任務只能挑不用理智檢定的）
  show: { when: "daily", min: 3, pts: 30 },      // 看完今日特展
  read: { when: "both", min: 2.5, pts: 25 },     // 讀這週的某一本書（book ＝書的 id）
  cellar: { when: "both", min: 4, pts: 40 },     // 在地下收藏庫走到 B{floor}
  spot: { when: "both", min: 4, pts: 40 },       // 找到這週多出來的房間（room ＝房間的 id）
  casino: { when: "daily", min: 1.5, pts: 20, act: 1, chip: 1 },  // 在賭場打壹手 21 點（不設輸贏、不設下注額）
  bank: { when: "daily", min: 1.5, pts: 20, act: 1, chip: 1 },    // 在銀行存壹筆
  food: { when: "daily", min: 1, pts: 15, act: 1, chip: 1 },      // 到餐車吃壹樣東西
  visit: { when: "daily", min: 2, pts: 25, act: 1, chip: 1 },     // 參觀壹位館友的展廳（只算別人）
  gift: { when: "daily", min: 2, pts: 30, act: 1, chip: 1 },      // 送館友壹隻佩佩（只算別人）
  stockLook: { when: "daily", min: 1, pts: 15, act: 1 },          // 看壹支集團股的走勢
  lesson: { when: "daily", min: 1.5, pts: 20, act: 1 },           // 在委託櫃台上壹堂課
  sign: { when: "daily", min: 0.5, pts: 10, act: 1 },             // 簽到
  board: { when: "daily", min: 0.5, pts: 10, act: 1 },            // 看公佈欄
  withNpc: { when: "daily", min: 5, pts: 40, act: 1 },           // 帶壹位旅客壹起下地下收藏庫（決定 0149；伺服器開始那趟時寫 P.cellar.coopNpc，syncStory 轉成「做過了」）
  readWeek: { when: "weekly", min: 0 }, // 讀這週的書 n 本
  dailyAll: { when: "weekly", min: 0 }, // 每日任務全部做完 n 天
  showDays: { when: "weekly", min: 0 }, // 看完今日特展 n 天
  ending: { when: "weekly", min: 0 },   // 讀到這週的結局
};
// 劇情線的種類：main 主線（跨週，id 不加週的名字）、season 季節線（一年四季各一條，跨週，大約兩週一章；是圍繞主線主軸的副劇情，沒玩也不會卡住主線，決定 0037）、week 這週的、floor 樓層的新劇情線、holiday 節日、side 小插曲、curator 策展手記
export const LINE_KINDS = { main: "主線", season: "季節", week: "這週的", floor: "樓層的新劇情線", holiday: "節日", side: "小插曲", curator: "策展手記" };
// 跨週的線：id 不加週的名字，好幾週的書算同一條（主線、季節線）
export const CROSS_WEEK_KINDS = ["main", "season"];
// 今日特展：用 web/src/core/art.js 已經有的畫法，換參數（frog ＝遊戲自己的青蛙，pick 照手作坊的選項）。不畫 Pepe the Frog 的樣子
export const SHOW_ART = ["frog", "portrait", "strange", "rare", "statue", "hidden"];
export const SHOW_FX = ["sepia", "faded", "dust", "dark", "flip", "water", "torn", "shadow", "glow"]; // 畫面上的效果（web/src/css/story.css）
export const SHOW_FRAMES = ["gold", "dark", "wood", "plain", "ornate"];
// 今日特展的新畫：works[].svg（排程照這週的故事畫的向量圖）。只准下面這些標籤和屬性，其他一律不要（sanitizeSvg）
export const SVG_TAGS = ["svg", "g", "defs", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "title", "desc",
  "linearGradient", "radialGradient", "stop", "clipPath", "mask", "pattern", "use",
  "filter", "feGaussianBlur", "feTurbulence", "feDisplacementMap", "feColorMatrix", "feComponentTransfer", "feFuncR", "feFuncG", "feFuncB", "feFuncA", "feBlend", "feComposite", "feMerge", "feMergeNode", "feOffset", "feFlood", "feDropShadow"];
export const SVG_ATTRS = ["id", "viewBox", "preserveAspectRatio", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "fx", "fy", "width", "height", "d", "points", "dx", "dy", "href",
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "stroke-miterlimit",
  "opacity", "transform", "clip-path", "clip-rule", "mask", "filter", "font-size", "font-family", "font-weight", "font-style", "text-anchor", "dominant-baseline", "letter-spacing", "paint-order",
  "offset", "stop-color", "stop-opacity", "gradientUnits", "gradientTransform", "spreadMethod", "patternUnits", "patternContentUnits", "patternTransform", "maskUnits", "maskContentUnits", "clipPathUnits",
  "filterUnits", "primitiveUnits", "stdDeviation", "baseFrequency", "numOctaves", "seed", "type", "scale", "xChannelSelector", "yChannelSelector", "in", "in2", "result", "values", "mode", "operator",
  "k1", "k2", "k3", "k4", "tableValues", "slope", "intercept", "amplitude", "exponent", "flood-color", "flood-opacity", "stitchTiles", "color-interpolation-filters"];
// 書裡 [[字|動作]] 可以用的動作（ui_screens1.js 的 BOOK_ACTIONS）
export const BOOK_ACTION_IDS = ["void", "mirror", "window", "beat", "hat", "codex", "cellar"];

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
// 這一週用哪一包內容：{ src: { week, days }, fbName }（正式週，或備用週）。找不到回傳 null。賭場的每週收藏（決定 0042）用它找這週的 casino
export function storyPackFor(lib, label, fb) {
  if (!lib || !lib.weeks || !lib.fallback) return null;
  const reg = lib.weeks[label], fbName = reg ? null : (fb && lib.fallback[fb] ? fb : pickFallback(lib, label)), src = reg || (fbName ? lib.fallback[fbName] : null);
  return src && src.week ? { src, fbName } : null;
}
// skill：房間的獎勵可以寫技能成長（決定 0032；只有房間可以，tools/content/week_check.cjs 擋）。加多少是 NUM.shop.trialSkill
// Yuga Bot 交代的任務：giver 只認 "yuga"，says／done 要是有字的字串（最多 YUGA_MAX 字），不然當作沒有這回事。備用的壹天不收（不知道那天劇情走到哪）
export const YUGA_MAX = 40;
// 每日任務的交代人（決定 0145，帳本 taskGivers.list 是正本；這裡只放畫面要的名字，新的交代人加在這裡和帳本）
export const TASK_GIVERS = { yuga: "Yuga Bot", hall: "堂主", postman: "退休的郵差", clerk: "便利商店店員", scale: "阿秤", number: "號碼機" };
export const giverName = id => TASK_GIVERS[id] || "";
const yugaText = s => (typeof s === "string" && s.trim() ? [...s.trim()].slice(0, YUGA_MAX).join("") : "");
function yugaTask(t, ok) {
  const says = ok && TASK_GIVERS[t.giver] ? yugaText(t.says) : "";
  t.giver = says ? t.giver : null; t.says = says; t.done = says ? yugaText(t.done) : "";
  return t;
}
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
    question: typeof wk.question === "string" ? wk.question : "", // 本週疑點（排程說明 一之七）：本週那頁、疑點簿都會寫
    lines: [], days: [], books: [], rooms: [], works: [], daily: [],
    ending: { read: wk.ending && wk.ending.need && Number.isFinite(+wk.ending.need.read) ? +wk.ending.need.read : null },
    weeklyBonus: reward(wk.weeklyBonus), anomaly: null, events: reg ? cleanEvents(wk.events, monday, label) : [], // events：這週的限時活動（決定 0041，shared/story/events.js）
     shop: asList(wk.shop), // shop：這週兌換所上架的限定頭飾（shared/core/shop.js 的 shopOnSale）
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
      daily: ptsFill(asList(d.daily).map((t, i) => yugaTask(task(t, p, { daily: true, day: n, date, idx: i }), !spare && !fbName))),
      dailyBonus: reward(d.dailyBonus),
      show: d.show ? { title: d.show.title || "", intro: d.show.intro || "", works: asList(d.show.works).map(w => Object.assign({}, w, { id: p + w.id, local: w.id, day: n, date })) } : null,
      adds: asList(d.adds).map(r => room(r, p, n)),
    };
    // 每週任務的旁白（決定 0048）：今天可以換某個每週任務底下那句話（新聞的新梗每天才查得到）。只會讀到今天為止的天，晚的蓋掉早的
    asList(d.weeklyWords).forEach(x => { const t = x && W.weekly.find(w => w.local === x.task); if (t && typeof x.words === "string" && x.words.trim()) t.words = x.words; });
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
// 舊的紀錄清掉（8 週以前的任務、看過的畫、每天的數字）；書讀過的留著（劇情回顧要用）
export function pruneStory(S, today) {
  const cutDate = addDays(weekMonday(today), -56), cutWeek = isoWeek(cutDate);
  ["tasks", "works", "said"].forEach(k => Object.keys(S[k]).forEach(id => { if (id.split("/")[0] < cutWeek) delete S[k][id]; }));
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
  if (t.kind === "read" || t.kind === "spot" || t.kind === "ending" || t.kind === "cellar" || (STORY_TASKS[t.kind] && STORY_TASKS[t.kind].act)) return 1;
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
    case "show": { const s = showOfDay(W, t.day), old = W && !W.past && t.day < W.dayNo; return `看完${old ? `第 ${t.day} 天的特展` : "今日特展"}${s ? `「${s.title}」（${s.works.length} 幅）` : ""}`; }
    case "read": { const b = bookOf(W, t.book); return `讀書架上的〈${b ? b.title : "？"}〉`; }
    case "cellar": return `在地下收藏庫走到 B${t.floor || 1}`;
    case "spot": { const r = roomOf(W, t.room); return r ? (r.hint || `去 B${r.floor} 看看`) : "找到這週多出來的地方"; }
    case "casino": return "到賭場打壹手 21 點";
    case "bank": return "到銀行存壹筆";
    case "food": return "到餐車吃壹樣東西";
    case "visit": return "參觀壹位館友的展廳";
    case "gift": return "送館友壹隻佩佩";
    case "stockLook": return "看壹支集團股的走勢";
    case "lesson": return "在委託櫃台上壹堂課";
    case "sign": return "簽到";
    case "board": return "看公佈欄";
    case "withNpc": return "帶壹位旅客壹起下地下收藏庫";
    case "readWeek": return `讀這週的書 ${n} 本`;
    case "dailyAll": return `每日任務全部做完 ${n} 天`;
    case "showDays": return `看完今日特展 ${n} 天`;
    case "ending": return "讀到這週的結局";
    default: return t.kind;
  }
}
// 這個任務要去哪裡做：{ room, params } 或 { panel }（畫面的「前往」）
// 一位交代人壹天可能交代兩個以上任務（例：荷官有「綠色佩佩」和「賭場打壹手」）：挑現在該說哪壹句。
// daily：今天的任務；giver：交代人；done(t)：做完了沒；room：說話的地方（賭場＝"casino"：先挑做這間房的事的那個）。
// 規則：有給 room 就先看「去的地方是這間房」的任務（沒有就看全部）；裡面還有沒做完的就說第壹個沒做完的（says）；都做完了說最後壹個做完的（有 done 說 done，沒有說 says）。沒有交代回 null。
export function giverPick(daily, giver, done, room, W) {
  const all = (daily || []).filter(x => x && x.giver === giver && x.says);
  if (!all.length) return null;
  const here = room ? all.filter(x => { const g = taskGo(x, W); return g && g.room === room; }) : [];
  const list = here.length ? here : all;
  const pend = list.find(x => !done(x));
  if (pend) return { task: pend, done: false, text: pend.says };
  const t = list[list.length - 1];
  return { task: t, done: true, text: t.done || t.says };
}
export function taskGo(t, W) {
  switch (t.kind) {
    case "make": return { room: "workshop" };
    case "deliver": return { room: "commission" };
    case "fuse": return { room: "fusion" };
    case "pillow": case "hug": return { room: "pillow" };
    case "view": return { room: "gallery" };
    case "show": case "showDays": return { room: "gallery", params: { show: true } };
    case "read": case "readWeek": case "ending": return { room: "origin", params: { tab: "weekly" } };
    case "cellar": case "spot": case "withNpc": return { room: "cellar" };
    case "casino": case "food": return { room: "casino" };
    case "bank": case "stockLook": return { room: "bank" };
    case "visit": case "gift": return { panel: "friends" };
    case "lesson": return { room: "commission" };
    case "sign": return { panel: "signin" };
    case "board": return { panel: "board" };
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
// 都在當天做完（補做的不算）：「3 個都做完多一份」、「每日任務全部做完 N 天」看這個（決定 0060）
// 新制的天（每日任務 minTasks 個以上）：看積分，不看「全做完」（決定 0146）
export const ptsDay = d => !!d && d.daily.length >= NUM.story.pts.minTasks;
export const taskPts = t => (!t || t.weekly ? 0 : +t.pts > 0 ? +t.pts : (STORY_TASKS[t.kind] || {}).pts || 0);
// 這天算到的積分：做完的任務加起來，最多 dayCap；onTime ＝只算當天做完的（補做的不算）
export function dayPts(S, d, onTime) {
  if (!d) return 0;
  const sum = d.daily.reduce((a, t) => { const st = S.tasks[t.id]; return a + (st && st.done && (!onTime || NUM.story.lateBonus || !st.late) ? taskPts(t) : 0); }, 0);
  return Math.min(NUM.story.pts.dayCap, sum);
}
export const weekPts = (S, W) => (W ? W.days.filter(ptsDay).reduce((a, d) => a + dayPts(S, d), 0) : 0);
const allDailyOnTime = (S, d) => ptsDay(d) ? dayPts(S, d, true) >= NUM.story.pts.dayCap : allDailyDone(S, d) && (NUM.story.lateBonus || d.daily.every(t => !S.tasks[t.id].late));
// 內容檔沒寫獎勵的每日任務，新制的天照積分給
function ptsFill(daily) {
  if (daily.length < NUM.story.pts.minTasks) return daily;
  daily.forEach(t => { const r = t.reward; if (!r.insp && !r.mood && !r.items.length && !r.stamps && !r.skill) t.reward = reward(NUM.story.pts.reward[taskPts(t)]); });
  return daily;
}
// 「做過了」的紀錄：S.acts[日期] = { 種類: 1 }。UI 在真的做了的那一刻叫 storyAct（不重複記）
export function storyAct(P, kind, today) {
  if (!P || isFree(P) || !STORY_TASKS[kind] || !STORY_TASKS[kind].act) return false;
  const S = storyState(P), a = S.acts[today] || (S.acts[today] = {});
  if (a[kind]) return false;
  a[kind] = 1;
  Object.keys(S.acts).sort().slice(0, -14).forEach(d => delete S.acts[d]); // 只留最近 14 天
  return true;
}
const actSince = (S, kind, from, W) => Object.keys(S.acts).some(d => d >= from && d <= W.end && S.acts[d][kind]);
const showDone = (S, d) => !!(d.show && d.show.works.length && d.show.works.every(w => S.works[w.id]));
// 任務現在做到多少（0 到 taskTarget）
export function taskCount(P, W, t, S = storyState(P)) {
  const st = S.tasks[t.id], target = taskTarget(t, W);
  let n = 0;
  const base = counterOf(P, t);
  if (base != null) n = st && Number.isFinite(st.base) ? base - st.base : 0;
  else switch (t.kind) {
    case "hug": n = P.day && t.date && P.day.date >= t.date ? Object.keys(P.day.hugs || {}).length : 0; break; // 補做的算補的那天抱的
    case "show": { const s = showOfDay(W, t.day); n = s ? s.works.filter(w => S.works[w.id]).length : 0; break; }
    case "read": n = S.books[t.book] && S.books[t.book].read ? 1 : 0; break;
    case "cellar": { const all = W.days.map(d => d.date), dates = t.daily ? all.filter(d => d >= t.date) : all; /* 每日的：那天或之後（補做） */ n = dates.some(d => (S.deep[d] || 0) >= (t.floor || 1)) ? 1 : 0; break; }
    case "spot": n = S.spots[t.room] ? 1 : 0; break;
    case "readWeek": n = W.books.filter(b => S.books[b.id] && S.books[b.id].read).length; break;
    case "dailyAll": n = W.days.filter(d => allDailyOnTime(S, d)).length; break; // 只算當天做完的天
    case "showDays": n = W.days.filter(d => showDone(S, d)).length; break;
    case "ending": n = W.books.some(b => b.ending && S.books[b.id] && S.books[b.id].read) ? 1 : 0; break;
    default: n = STORY_TASKS[t.kind] && STORY_TASKS[t.kind].act ? (actSince(S, t.kind, t.date || W.start, W) ? 1 : 0) : 0; // 靠「做過了」的紀錄（storyAct）；補做的算補的那天做的
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
  const cd = P.cellar && P.cellar.coopDeep; // 合作下去（shared/coop/base.js 的 coopMarkDeep）：今天走到第幾層也算
  if (cd && cd.date === today && cd.floor > 0) S.deep[today] = Math.max(S.deep[today] || 0, cd.floor);
  const cn = P.cellar && P.cellar.coopNpc; // 帶旅客下去（決定 0149）：伺服器開始那趟時記的
  if (cn && cn.date === today) storyAct(P, "withNpc", today);
  // 這週多出來的房間：在地下收藏庫過了（P.cellar.won）就算找到
  W.rooms.forEach(r => { if (!S.spots[r.id] && P.cellar && P.cellar.won && P.cellar.won[r.id]) { S.spots[r.id] = today; ev.push({ type: "storySpot", room: r }); } });
  // 任務：這週到今天為止的每日任務（前幾天的可以補做，決定 0060）、這週的每週任務。第一次看到時記下 base
  const live = W.days.filter(d => d.n <= W.dayNo).reduce((a, d) => a.concat(d.daily), []).concat(W.weekly);
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
      if (!st.done && taskCount(P, W, t, S) >= taskTarget(t, W)) {
        st.done = today; if (t.daily && t.date && today > t.date) st.late = true; ev.push({ type: "storyTask", task: t });
        if (t.daily && STORY_TASKS[t.kind] && STORY_TASKS[t.kind].chip) { const c = S.chipDue[today] || (S.chipDue[today] = {}); c[t.kind] = 1; Object.keys(S.chipDue).sort().slice(0, -14).forEach(d => delete S.chipDue[d]); } // 伺服器看得到的任務做完了：可以去領籌碼（伺服器自己再看做過沒有）
      }
    });
    books();
  }
  return ev;
}

// ---------- 獎勵 ----------
export function itemName(id) { return (STORY_ITEMS[id] || { name: id }).name; }
export function milesText(v) { const t = rewardText(v.reward); return [t, v.chips ? `籌碼 ${v.chips.toLocaleString("en-US")}` : "", v.box ? "籌碼禮盒" : ""].filter(Boolean).join("、"); }
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
// 週章怎麼拿（翊文 11-11：「週章怎麼拿也要有足夠提示」）：兌換所、大廳、補簽、狀態列共用。數字照 NUM
export function stampHow() {
  return [
    `做完每週任務：壹個 ${NUM.story.stampPerTask} 枚，這週 5 個全做完再多 ${NUM.story.stampAllBonus} 枚（每週劇情的「本週」）`,
    `Hamachi 賭場的「本週收藏」集滿：${NUM.casino.week.stamp} 枚`,
    `背包裡的舊畫布、金線、金箔：每 ${NUM.shop.matToStamp} 份在兌換所換 1 枚（地下收藏庫、劇情撿得到）`,
    "週章不會過期，可以壹直存著",
  ];
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
// ---------- Yuga Bot 交代的任務 ----------
// 今天的每日任務裡 Yuga Bot 交代的那一個（壹天最多壹個；檢查程式擋）。沒有回傳 null
export function yugaTaskOf(W) {
  const d = todayOf(W);
  return d ? d.daily.find(t => t.giver === "yuga") || null : null;
}
// 荷官要說的話：還沒做完 → { kind: "says", text }；做完了、有 done、還沒說過 → { kind: "done", text, id }（說完呼叫 yugaMarkSaid）；其他 null。
// P.story.said 是 { 任務 id: 日期 }：舊存檔沒有這欄，storyState 補成空的
export function yugaLine(P, W) {
  if (!P || !W || W.past || isFree(P)) return null;
  const t = yugaTaskOf(W);
  if (!t) return null;
  const S = storyState(P), st = S.tasks[t.id];
  if (!(st && st.done)) return { kind: "says", text: t.says, id: t.id };
  if (t.done && !S.said[t.id]) return { kind: "done", text: t.done, id: t.id };
  return null;
}
export function yugaMarkSaid(P, id, today) { const S = storyState(P); S.said[id] = today || true; }
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
  if (ptsDay(d) ? dayPts(S, d) < NUM.story.pts.dayCap : !allDailyDone(S, d)) return "wait";
  return allDailyOnTime(S, d) ? "ready" : "late"; // late：有補做的，這壹份沒有
}
export function claimDayBonus(P, W, n, today) {
  // （新制的天：當天拿滿 dayCap 分多壹份；舊制：3 個都做完）
  if (!P || isFree(P) || !W || W.past) return { ok: false, reason: "這週已經過了" };
  const st = dayBonusState(P, W, n);
  if (st !== "ready") return { ok: false, reason: st === "claimed" ? "領過了" : st === "late" ? "有補做的，這壹份只給當天做完的" : "3 個每日任務還沒都做完" };
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
// ---------- 每週積分里程碑（決定 0146） ----------
const MAT_ROTATE = ["mat:畫布", "mat:金線", "mat:金箔"];
// [{ at, state: "wait"|"ready"|"claimed", reward, chips, box }]：reward 是玩家端直接給的（靈感、心情、週章、物品），chips／box 是伺服器從莊家付的（milesChips）
export function milesView(P, W) {
  if (!P || isFree(P) || !W || !W.days.some(ptsDay)) return [];
  const S = storyState(P), rec = S.weeks[W.label], pts = weekPts(S, W);
  return NUM.story.pts.miles.map(m => ({ at: m.at, state: rec && rec.miles && rec.miles[m.at] ? "claimed" : pts >= m.at ? "ready" : "wait", reward: mileReward(m, W), chips: m.chips || 0, box: m.box || 0 }));
}
function mileReward(m, W) {
  const items = asList(m.items).map(id => id === "rotate" ? MAT_ROTATE[((weekIndex(W.start) % 3) + 3) % 3] : id).filter(id => STORY_ITEMS[id]);
  return { insp: m.insp || 0, mood: m.mood || 0, items, stamps: m.stamps || 0, skill: null };
}
export function claimMile(P, W, at, today) {
  if (!P || isFree(P) || !W || W.past) return { ok: false, reason: "這週已經過了" };
  const v = milesView(P, W).find(x => x.at === at);
  if (!v) return { ok: false, reason: "沒有這一格" };
  if (v.state === "claimed") return { ok: false, reason: "領過了" };
  if (v.state !== "ready") return { ok: false, reason: "積分還不夠" };
  const S = storyState(P), rec = S.weeks[W.label] || (S.weeks[W.label] = { fb: W.fallback, first: today, bonus: {} });
  if (!isPlain(rec.miles)) rec.miles = {};
  rec.miles[at] = today;
  give(P, S, v.reward, today, `${W.label}/pts${at}`);
  return { ok: true, reward: v.reward, chips: v.chips, box: v.box };
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
    if (out.insp) casArtMarkViewed(P, id, today); // 今天這幅的靈感領過了：收藏再看不重複給（規劃 2.10b）
  }
  if (!w.san) out.cured = cureByTask(P, "calm");
  return out;
}
// 再看收藏的畫（規劃 2.10b）：規則在 casino/art.js 的 casArtViewCredit。tier ＝收藏那幅的稀有度。可怕的畫每次都擲理智（out.san；habituate 次以上同壹天變 0/1），
// 上限滿了（out.capped）就不給靈感也不擲理智。看過的記成看過（今日特展那邊就不再當第壹次）
export function viewCollectWork(P, W, id, tier, today) {
  const S = storyState(P), w = W ? W.works.find(x => x.id === id) : null;
  if (!w) return { ok: false };
  const first = !S.works[id];
  if (first) S.works[id] = today;
  const out = { ok: true, first, insp: 0, san: w.san || null, cured: [], capped: false, again: false };
  if (isFree(P)) return out;
  if (P.day) { P.day.views = P.day.views || {}; P.day.views["art:" + id] = (P.day.views["art:" + id] || 0) + 1; }
  const c = casArtViewCredit(P, id, tier, first, w, today);
  out.insp = c.insp; out.capped = c.capped; out.again = c.again;
  if (!c.roll) out.san = null;
  else if (w.san && P.day && P.day.views["art:" + id] > NUM.habituate) out.san = "0/1";
  if (!w.san) out.cured = cureByTask(P, "calm");
  return out;
}
// 這週前幾天的畫：只能看、不給靈感（補做「看完特展」用，決定 0060）。週日叫「本週回顧展」
export function weekReview(W) { return W ? W.works.filter(w => w.day < Math.min(W.dayNo, 7)) : []; }

// ---------- 地下收藏庫：本週異狀、這週多出來的房間 ----------
// 用遊戲已經有的房間（systems_text.js 的 CELLAR 那種格式）組出來，借單人地下收藏庫的流程走一間（P.cellar.run.extra，systems.js 認得）
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
export function shelfTabOf(line) { const k = line && line.kind; return k === "main" ? "mainline" : (k === "season" || k === "holiday") ? "season" : "weekly"; }
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

// ---------- 公佈欄：這週的公告（shared/game/notices.js 的格式；同一則每天多一行，不另外發） ----------
export function storyNotice(W, today, now) {
  if (!W || W.past) return null;
  return {
    id: "story-" + W.label, v: W.dayNo, cat: "特展活動", tags: W.dayNo === 1 ? ["重要", "活動"] : ["活動"], importance: W.dayNo === 1 ? "important" : "normal",
    title: `本週地下收藏庫：〈${W.title}〉`, publish: W.start, expire: W.end, start: W.start, end: W.end, story: true,
    sections: [
      ["大綱", W.summary],
      ["這週怎麼玩", [
        "每天 05:00：圖書館書架的「每週劇情」多 1～2 本書，3 個每日任務換新，畫廊的「今日特展」換壹個主題。",
        "每週任務 5 個，做完壹個拿壹枚週章（週章會存起來，到兌換所換裝備、提升技能）。週日讀到這週的結局。",
        "錯過的天，書都還在，可以補讀；每日任務這週裡都能補做，獎勵照領。但「3 個都做完，多壹份」和每週任務的「每日任務全部做完」只算當天做完的。",
      ]],
      W.events.length ? ["限時活動", W.events.map(eventListLine).concat(["時間到了就回到平常的樣子；沒趕上也不會少什麼。"])] : null,
      ["兌換所", [`這週上架的限定頭飾：${limitedNames(shopOnSale(W, W.start))}。`]],
      W.anomaly ? ["本週異狀", [W.anomaly.title].concat(W.anomaly.text)] : null,
      ["每週任務", W.weekly.map(t => `・${taskText(t, W)}`)],
      ["時間", [`這週還剩 ${weekLeftText(now, W.start)}（下週壹 05:00 換下壹週）。`]],
      ["每天", W.days.map(d => `第 ${d.n} 天：${d.board}`)],
    ].filter(Boolean),
    cta: { label: "前往", panel: "story" },
  };
}

// ---------- 今日特展的新畫：把 works[].svg 淨化（檢查程式和畫面用同一個） ----------
// svg：字串，或字串的陣列（接起來；JSON 裡比較好讀）。prefix：加在每個 id 前面，不同幅（同一幅畫兩次也是）的 id 才不會撞到。
// 回傳 { ok, svg（淨化好的字串，不 ok 是空字串）, errors, texts（畫裡的字，也算遊戲文字）, bytes }。
// 做法：自己一個字一個字讀，只有白名單的標籤、屬性才會寫進結果；任何讀不懂的都算錯，整幅不要（寧可不畫）。
const SVG_TAG_SET = new Set(SVG_TAGS), SVG_ATTR_SET = new Set(SVG_ATTRS), SVG_TEXT_TAGS = new Set(["text", "tspan", "title", "desc"]);
const SVG_HREF_TAGS = new Set(["use", "linearGradient", "radialGradient", "pattern"]);
const SVG_BAD_VALUE = /[<>&"'`\\]|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;
const SVG_OUTSIDE = /javascript|vbscript|data:|https?:|\/\/|expression\(|@import/i;
const SVG_ID = /^[A-Za-z][A-Za-z0-9_-]*$/;
function svgBytes(s) { let n = 0; for (const ch of s) { const c = ch.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; } return n; }
export function sanitizeSvg(svg, prefix = "") {
  const src = Array.isArray(svg) ? svg.join("") : svg;
  const out = { ok: false, svg: "", errors: [], texts: [], bytes: 0 };
  const err = m => { out.errors.push(m); };
  if (typeof src !== "string" || !src.trim()) { err("svg 要是字串（或字串的陣列）"); return out; }
  out.bytes = svgBytes(src);
  if (out.bytes > NUM.story.showSvgKB * 1024) { err(`太大了（${Math.ceil(out.bytes / 1024)} KB，最多 ${NUM.story.showSvgKB} KB）`); return out; }
  const n = src.length, stack = [], ids = new Set(), refs = new Set();
  let html = "", i = 0, rootSeen = false, rootDone = false;
  const ref = id => { refs.add(id); return prefix + id; };
  while (i < n) {
    const lt = src.indexOf("<", i), chunk = src.slice(i, lt < 0 ? n : lt);
    if (chunk.trim()) {
      const top = stack[stack.length - 1];
      if (!SVG_TEXT_TAGS.has(top)) err(`標籤外面不能有字：「${chunk.trim().slice(0, 20)}」（字要放在 text 裡）`);
      if (chunk.replace(/&(amp|lt|gt);/g, "").includes("&")) err("字裡的 & 只准 &amp; &lt; &gt;");
      if (chunk.includes(">")) err("字裡不能有 >（要寫 &gt;）");
      out.texts.push(chunk.trim());
      html += chunk;
    } else html += chunk.trim() ? "" : (chunk ? " " : "");
    if (lt < 0) break;
    const rest = src.slice(lt, lt + 200);
    if (src[lt + 1] === "!" || src[lt + 1] === "?") { err("不能有 <! 或 <?（註解、DOCTYPE、CDATA）"); return out; }
    const close = /^<\/([A-Za-z][A-Za-z0-9:_-]*)\s*>/.exec(rest);
    if (close) {
      const top = stack.pop();
      if (top !== close[1]) { err(`標籤沒有配對：</${close[1]}>`); return out; }
      html += `</${close[1]}>`;
      if (!stack.length) rootDone = true;
      i = lt + close[0].length;
      continue;
    }
    const open = /^<([A-Za-z][A-Za-z0-9:_-]*)/.exec(rest);
    if (!open) { err("讀不懂的標籤：" + rest.slice(0, 20)); return out; }
    const tag = open[1];
    if (!SVG_TAG_SET.has(tag)) { err(`不准用 <${tag}>（只准畫圖的標籤）`); return out; }
    const parent = stack[stack.length - 1];
    if (rootDone) { err("<svg> 只能有一個，後面不能再有東西"); return out; }
    if (!rootSeen) { if (tag !== "svg") { err("最外面要是 <svg>"); return out; } rootSeen = true; }
    else if (tag === "svg") { err("<svg> 裡面不能再放 <svg>"); return out; }
    if (parent === "title" || parent === "desc") { err(`<${parent}> 裡面只能放字`); return out; }
    if ((parent === "text" || parent === "tspan") && tag !== "tspan") { err(`<${parent}> 裡面只能放字和 <tspan>`); return out; }
    let j = lt + open[0].length, attrs = "", selfClose = false, hasView = false, ended = false;
    while (j < n) {
      const ws = /^\s*/.exec(src.slice(j, j + 40))[0]; j += ws.length;
      if (src.startsWith("/>", j)) { selfClose = true; j += 2; ended = true; break; }
      if (src[j] === ">") { j += 1; ended = true; break; }
      const am = /^([A-Za-z_:][A-Za-z0-9_:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(src.slice(j));
      if (!am) { err(`<${tag}> 的屬性讀不懂（要寫成 名字='值'）`); return out; }
      j += am[0].length;
      const name = am[1], val = am[2] != null ? am[2] : am[3];
      if (/^on/i.test(name)) { err(`不准用事件屬性 ${name}`); continue; }
      if (name === "style" || name === "class") { err(`不准用 ${name}（顏色、線條直接寫在屬性上）`); continue; }
      if (name === "xmlns") { if (val !== "http://www.w3.org/2000/svg") err("xmlns 不對"); continue; }
      if (name === "xmlns:xlink") { if (tag !== "svg") err("xmlns:xlink 只能寫在 <svg>"); continue; }
      if (name !== "xlink:href" && !SVG_ATTR_SET.has(name)) { err(`不准用屬性 ${name}（在 <${tag}>）`); continue; }
      if (SVG_BAD_VALUE.test(val)) { err(`${name} 的值有不准的字元`); continue; }
      if (SVG_OUTSIDE.test(val)) { err(`${name} 不能連到外面（外部網址、script）`); continue; }
      if (name === "href" || name === "xlink:href") {
        if (!SVG_HREF_TAGS.has(tag)) { err(`<${tag}> 不能有 href`); continue; }
        if (!val.startsWith("#") || !SVG_ID.test(val.slice(1))) { err(`href 只能連到這幅畫裡面的 #id（${val.slice(0, 30)}）`); continue; }
        attrs += ` href="#${ref(val.slice(1))}"`;
        continue;
      }
      if (name === "id") {
        if (!SVG_ID.test(val)) { err(`id「${val}」只能用英文開頭、英文數字 - _`); continue; }
        if (ids.has(val)) { err(`id「${val}」重複了`); continue; }
        ids.add(val);
        attrs += ` id="${prefix}${val}"`;
        continue;
      }
      if (/url\s*\(/i.test(val)) {
        const um = /^url\(#([A-Za-z][A-Za-z0-9_-]*)\)$/.exec(val.trim());
        if (!um) { err(`${name} 的 url() 只能連到這幅畫裡面的 #id`); continue; }
        attrs += ` ${name}="url(#${ref(um[1])})"`;
        continue;
      }
      if (tag === "svg" && (name === "width" || name === "height")) continue; // 大小由畫框決定
      if (name === "viewBox") {
        if (tag === "svg") hasView = /^\s*-?[\d.]+[\s,]+-?[\d.]+[\s,]+[\d.]+[\s,]+[\d.]+\s*$/.test(val);
      }
      attrs += ` ${name}="${val}"`;
    }
    if (!ended) { err(`<${tag}> 沒有結束`); return out; }
    if (tag === "svg") { if (!hasView) err("<svg> 要有 viewBox（例如 0 0 240 300）"); attrs = ` xmlns="http://www.w3.org/2000/svg"${attrs}`; }
    html += `<${tag}${attrs}${selfClose ? "/>" : ">"}`;
    if (!selfClose) stack.push(tag);
    else if (!stack.length) rootDone = true;
    i = j;
  }
  if (!rootSeen) err("最外面要是 <svg>");
  if (stack.length) err(`<${stack[stack.length - 1]}> 沒有關起來`);
  refs.forEach(id => { if (!ids.has(id)) err(`連到不存在的 #${id}`); });
  if (out.errors.length) return out;
  out.ok = true;
  out.svg = html;
  return out;
}

// ---------- 預算（tools/content/week_check.cjs 和測試用） ----------
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
