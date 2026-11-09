// ================================================================
//  以下是程式（一般不用改）。遊戲規則：不碰畫面，方便測試。
// ================================================================

// ---------- 小工具 ----------
// ---------- 第 4 版：從別的檔拿的（從第 3 版轉成模組時自動產生；之後新增用到的名字就手動加） ----------
import { BADGES, EXHIBITS, HALL_POINTS, HALL_THEME_BONUS, NUM, ORIGIN, PEPE_PARTS, PILLOW_PARTS, RARITY_TABLE, RENAMED, UPGRADES } from "./config.js";
import { CLIENTS, CLIENT_COMMENTS, COMMISSION_POOL, NEW_EXHIBITS, QUIRK_TEXT, STORY_CHAPTERS, VISITOR_COMMENTS } from "./content.js";
import { CHAPTER4, CLIENT_LINES, MORE_CHAPTERS } from "./content3.js";
import { hallSize, hasTalent, hasUp, sequelEvents, skillCheck } from "./logic3.js";
import { fixLegacy, leaveLegacy, newVisit, traitSum, visitorRecord } from "./legacy.js";
import { fixVisitors, freshDayVis, hasSlots, takeVisitorNo } from "./visitors.js";
import { fixLimited, fixSignin, isLimitedMat, newSignin, stockOf, useStock } from "./signin.js";
import { fixShow, newShow } from "./themeshow.js";
import { holidayExhibitById, holidaysOn } from "./holidays.js";
import { fixShop } from "./shop.js";

export let RNG = Math.random;
export function setRng(f) { RNG = f || Math.random; }
export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hashStr = t => [...String(t)].reduce((h, c) => (h * 31 + c.codePointAt(0)) >>> 0, 7);
export const num = n => Number(n).toLocaleString("en-US");
export const pad = (n, w = 4) => String(n).padStart(w, "0");
export const clampN = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const asList = v => Array.isArray(v) ? v : v ? [v] : [];
export const pickOne = (arr, rng = RNG) => arr[Math.floor(rng() * arr.length)];
// ---------- 現在幾點：照網路上的時間（決定 0026） ----------
// 翊文 11-09：「遊戲裡的內容也是跟著那網路抓取的真實時間時間」。大家同步，改電腦的時間也沒用。
// 規則裡要「現在」一律用 nowMs()，不要直接 Date.now()。
// 畫面登入連上 Realtime Database 之後，net_firebase.js 用 setNowClock(() => Date.now() + 伺服器的時間差) 換成網路的時間；
// 還沒拿到之前（還沒登入、測試、模擬）照這台電腦的時鐘。畫面上動畫的計時（setTimeout、多久沒動）不用它。
// 怪癖的 7 天（決定 0046，原本 20 分鐘，決定 0027）、換日（決定 0019）都用它；測試用 setNowClock 換時鐘（傳 null 換回電腦的時鐘）。
export let NOW_CLOCK = null;
export function setNowClock(fn) { NOW_CLOCK = fn || null; }
export function nowMs() {
  if (NOW_CLOCK) { const t = NOW_CLOCK(); if (Number.isFinite(t)) return t; }
  return Date.now();
}
// ---------- 一天：台灣時間 05:00 換日，週一 05:00 換週（決定 0019） ----------
// 翊文 11-08：「壹天多長 全部都要是真實的壹天」「這樣才能全部同步」。以前是「玩 15 分鐘一天」（決定 0003，被 0019 取代）。
// 大家的一天都一樣：瀏覽器、伺服器、Functions 都用這裡的算法。
// 規則和測試不碰真的時鐘：要算哪一天就把時間（毫秒）傳進去，或直接傳日期字串給 ensureDay 這些。
export const TZ_HOURS = 8;        // 台灣是 UTC+8
export const DAY_START_HOUR = 5;  // 台灣時間幾點換日
export const DAY_MS = 86400000;   // 一天幾毫秒
// ms：從 1970 算起的毫秒（例如伺服器的 Date.now()）。凌晨 00:00–04:59 還算前一天。回傳 "YYYY-MM-DD"
export function taipeiDay(ms) {
  if (typeof ms !== "number" || !isFinite(ms)) throw new Error("taipeiDay 要給毫秒數（伺服器的時間）");
  return new Date(ms + (TZ_HOURS - DAY_START_HOUR) * 3600000).toISOString().slice(0, 10);
}
// 「今天」也可以直接給日期字串：setDayClock(() => "YYYY-MM-DD")（測試、之後要伺服器直接給日期時用）。
// 沒設定就照 nowMs()（登入後是網路的時間）算台灣的哪一天。現在畫面沒有用 setDayClock
export let DAY_CLOCK = null;
export function setDayClock(fn) { DAY_CLOCK = fn || null; }
// 今天是哪一天。t：不給＝現在（nowMs）；給毫秒數或 Date＝那個時間是台灣的哪一天（不看 setDayClock）
export function todayStr(t) {
  if (t == null && DAY_CLOCK) { const s = DAY_CLOCK(); if (s) return s; }
  return taipeiDay(t == null ? nowMs() : +t);
}
// 公佈欄、信箱用的「真的日期」。11-09 起跟 todayStr 一樣（以前 todayStr 是遊戲裡的日期），兩個不能不一樣
export function realTodayStr(t) { return todayStr(t); }
export function daysBetween(a, b) { const f = s => { const [y, m, d] = String(s).split("-").map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((f(b) - f(a)) / 86400000); }
// 第幾天：從這間博物館建立那天（P.created，第一次進館那天）算第 1 天。today 不給就用 todayStr()
export function gameDayNo(P, today) {
  const t = typeof today === "string" ? today : todayStr();
  const n = daysBetween(P && typeof P.created === "string" ? P.created : t, t);
  return 1 + (n > 0 ? n : 0);
}
// 離下一次換日（台灣時間 05:00）還有幾秒。ms 不給＝現在（nowMs）
export function secToNextDay(ms) {
  const t = ms == null ? nowMs() : +ms;
  const into = (((t + (TZ_HOURS - DAY_START_HOUR) * 3600000) % DAY_MS) + DAY_MS) % DAY_MS; // 今天（從 05:00 起）過了幾毫秒
  return Math.ceil((DAY_MS - into) / 1000);
}
// "YYYY-MM-DD" 往後 n 天（用 UTC 算，不受電腦的時區影響）
export function addDays(dateStr, n) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export function fill(t, x) { return String(t).split("{x}").join(x); }
export function b64e(s) {
  if (typeof btoa === "function") return btoa(unescape(encodeURIComponent(s)));
  return Buffer.from(s, "utf8").toString("base64");
}
export function b64d(s) {
  if (typeof atob === "function") return decodeURIComponent(escape(atob(s)));
  return Buffer.from(s, "base64").toString("utf8");
}

// ---------- 骰子（CoC：d100 擲出 ≤ 數值就成功） ----------
export function die(n) { return 1 + Math.floor(RNG() * n); }
export function d100Faces(total) { return total === 100 ? [0, 0] : [Math.floor(total / 10), total % 10]; }
export function rollD100() {
  const t = Math.floor(RNG() * 10), u = Math.floor(RNG() * 10);
  const total = t === 0 && u === 0 ? 100 : t * 10 + u;
  return { spec: "d100", total, faces: [t, u] };
}
export function parseDice(expr) {
  const m = /^\s*(\d*)\s*D\s*(\d+)\s*$/i.exec(String(expr));
  if (m) return { n: +(m[1] || 1), m: +m[2] };
  return { n: 0, m: 0, flat: parseInt(expr, 10) || 0 };
}
export function rollExpr(expr) {
  const p = parseDice(expr);
  if (!p.m) return { spec: String(p.flat), total: p.flat, faces: [], flat: true };
  const faces = Array.from({ length: p.n }, () => die(p.m));
  return { spec: `${p.n}D${p.m}`, total: faces.reduce((a, b) => a + b, 0), faces };
}
export function maxExpr(expr) { const p = parseDice(expr); return p.m ? p.n * p.m : p.flat; }
export function splitSan(spec) { const [a, b] = String(spec).split("/"); return [a.trim(), (b || a).trim()]; }

// ---------- 選項與組合 ----------
export const CATS = PEPE_PARTS.map(p => p.name);
export const CORE_CATS = PEPE_PARTS.filter(p => !p.deco).map(p => p.name);   // 圖鑑格子用的五類
export const DECO_CATS = PEPE_PARTS.filter(p => p.deco).map(p => p.name);    // 第 3 版的裝飾類別（背景、手上拿的東西）
export const ROLLED = (PEPE_PARTS.find(p => p.rolled) || {}).name || "稀有度";
export const PILLOW_CATS = PILLOW_PARTS.map(p => p.name);
export const partOf = cat => PEPE_PARTS.find(p => p.name === cat);
export const optOf = (cat, name) => (partOf(cat) || { options: [] }).options.find(o => o.name === name);
export const allOpts = cat => partOf(cat).options.map(o => o.name);
export const isSpecialOpt = o => !!(o && (o.forbidden || o.mutant || o.gift || o.limited)); // limited：簽到限定（11-09，決定 0030）、兌換所限定（決定 0032）
export const baseOpts = cat => partOf(cat).options.filter(o => !isSpecialOpt(o)).map(o => o.name);
export function catOfOption(name) { const p = PEPE_PARTS.find(pp => pp.options.some(o => o.name === name)); return p ? p.name : null; }
export const CORE_TOTAL = CORE_CATS.reduce((n, c) => n * baseOpts(c).length, 1); // 圖鑑的格數
export const BASE_TOTAL = CORE_TOTAL;
export const ALL_TOTAL = CATS.reduce((n, c) => n * allOpts(c).length, 1);
export const PILLOW_TOTAL = PILLOW_PARTS.reduce((n, p) => n * p.options.filter(o => !o.limited).length, 1); // 簽到限定的材料（星光絨）不算進去（決定 0030）
export const RARITY_ORDER = allOpts(ROLLED);
export const FAILED = "失敗作";
export const rarityRank = r => r === FAILED ? -1 : RARITY_ORDER.indexOf(r);
export const DEFAULT_PICK = Object.fromEntries(CATS.map(c => [c, baseOpts(c)[0]]));

export const pepeKey = pick => CATS.map(c => pick[c] ?? DEFAULT_PICK[c]).join("|");
export const coreKey = pick => CORE_CATS.map(c => pick[c]).join("|");
export function fromKey(key) {
  const v = String(key).split("|");
  if (v.length === CATS.length) return Object.fromEntries(CATS.map((c, i) => [c, v[i]]));
  if (v.length === CORE_CATS.length) {
    // 進階版的 key 只有五類：裝飾類別補「沒有」
    const p = Object.fromEntries(CORE_CATS.map((c, i) => [c, v[i]]));
    DECO_CATS.forEach(c => { p[c] = DEFAULT_PICK[c]; });
    return p;
  }
  return null;
}
export const isBasePick = pick => CORE_CATS.every(c => baseOpts(c).includes(pick[c]));
// 已知的組合總數：核心五類，加上已經拿到鑰匙的裝飾類別
export function decoOpen(P, cat) { return isFree(P) || partOf(cat).options.some(o => o.key && P.keys && P.keys[o.key]); }
export function knownTotal(P) { return CATS.reduce((n, c) => n * (partOf(c).deco && !decoOpen(P, c) ? 1 : baseOpts(c).length), 1); }
// 收藏裡有哪些核心組合（不管背景、手上拿的東西）
export function ownedCoreSet(P, src) {
  const s = new Set();
  Object.keys(src || P.pepes).forEach(k => { const p = fromKey(k); if (p) s.add(coreKey(p)); });
  return s;
}
export function codexIndex(pick) {
  let idx = 0;
  for (const c of CORE_CATS) {
    const list = baseOpts(c), i = list.indexOf(pick[c]);
    if (i < 0) return -1;
    idx = idx * list.length + i;
  }
  return idx;
}
export function codexPick(idx) {
  const pick = {};
  for (let k = CORE_CATS.length - 1; k >= 0; k--) {
    const list = baseOpts(CORE_CATS[k]);
    pick[CORE_CATS[k]] = list[idx % list.length];
    idx = Math.floor(idx / list.length);
  }
  DECO_CATS.forEach(c => { pick[c] = DEFAULT_PICK[c]; });
  return pick;
}
export function catalogNo(pick) {
  const i = codexIndex(pick);
  if (i >= 0) return "No. " + pad(i + 1);
  // 限定的選項（簽到拿的帽子，決定 0030）另外編號「限 No.」，不改到原本「異 No.」「禁 No.」的號碼
  // 主題展、每週特展的（決定 0035）再另外編「展 No.」，不改到簽到那幾頂的號碼
  const lateOf = (c, v) => { const l = (optOf(c, v) || {}).limited; return l === "show" || l === "week"; };
  const lim = CORE_CATS.some(c => (optOf(c, pick[c]) || {}).limited), late = CORE_CATS.some(c => lateOf(c, pick[c]));
  let idx = 0;
  for (const c of CORE_CATS) { const list = late ? allOpts(c) : lim ? allOpts(c).filter(n => !lateOf(c, n)) : allOpts(c).filter(n => !optOf(c, n).limited); idx = idx * list.length + Math.max(0, list.indexOf(pick[c])); }
  const forb = CORE_CATS.some(c => (optOf(c, pick[c]) || {}).forbidden);
  return (late ? "展" : lim ? "限" : forb ? "禁" : "異") + " No. " + pad(idx + 1);
}
export function hatWord(h) { return h === "沒有" ? "不戴帽" : h; }
export function decoWord(cat, v) {
  if (!v || v === "沒有") return null;
  return cat === "背景" ? v + "背景" : cat === "手上拿的東西" ? "拿著" + v : v;
}
export function describePepe(pick, o = {}) {
  const full = PEPE_PARTS.filter(p => p.inName).map(p => p.name === ROLLED && o.failed ? "" : pick[p.name]).join("") + "佩佩";
  const title = `${pick.心情 ?? ""}的${pick.顏色 ?? ""}佩佩`;
  const extra = PEPE_PARTS.filter(p => !p.inName).map(p => p.deco ? decoWord(p.name, pick[p.name]) : p.name === "帽子" ? hatWord(pick[p.name]) : pick[p.name]).filter(Boolean).join("・");
  return { title, extra, rarity: o.failed ? FAILED : pick[ROLLED], no: o.failed ? "" : catalogNo(pick), full: o.failed ? full + "（失敗作）" : full };
}
export const pillowKeyOf = (pick, print) => PILLOW_CATS.map(c => pick[c]).join("|") + "|" + (print || "");
export function parsePillowKey(key) {
  const v = String(key).split("|");
  const pick = Object.fromEntries(PILLOW_CATS.map((c, i) => [c, v[i]]));
  const ref = v.slice(PILLOW_CATS.length).join("|");
  return { pick, ref, base: PILLOW_CATS.map(c => pick[c]).join("|"), print: refPick(ref) };
}
// 印在抱枕上的那一隻：p:佩佩 key、f:失敗作 key、空白
export function refPick(ref) {
  if (!ref) return null;
  const kind = ref.slice(0, 2), k = ref.slice(2);
  const pick = fromKey(k);
  if (!pick) return null;
  return { kind: kind === "f:" ? "failed" : "pepe", key: k, pick };
}
export function describePillow(key) {
  const { pick, print } = parsePillowKey(key);
  const name = PILLOW_PARTS.filter(p => p.inName).map(p => pick[p.name]).join("") + "抱枕";
  const extra = PILLOW_PARTS.filter(p => !p.inName).map(p => pick[p.name]).join("・");
  const printed = print ? describePepe(print.pick, { failed: print.kind === "failed" }).full : "沒有印";
  return { title: name, extra, printed };
}

// ---------- 存檔的一位參觀者（挑戰模式、自由模式各一份） ----------
export function newProfile(mode) {
  const free = mode === "free";
  const unlocked = {};
  PEPE_PARTS.forEach(p => { unlocked[p.name] = p.options.filter(o => free || o.start).map(o => o.name); });
  const moodRoll = rollExpr("3D6");
  return {
    mode, visitor: 1, created: todayStr(),
    mood: free ? 50 : moodRoll.total * 5, moodRoll: moodRoll.faces,
    sanity: NUM.startSanity, myth: 0, insp: free ? 0 : NUM.startInsp,
    unlocked, unlockCount: 0,
    pepes: {}, failed: {}, pillows: {}, serial: 0,
    seen: {}, chaptersRead: {}, mythFrom: {}, understood: {},
    day: null, hugDays: [], badges: {}, done: 0, comments: [], // hugDays：11-09 起不用了（連續抱抱枕治怪癖拿掉，決定 0027）；舊存檔有，先留著
    daily: null, quirks: [], bout: null, swapNext: false, dark: false, // quirks：{ type, cat, opt, since, until, task }，見 gainQuirk
    hall: [null, null, null, null, null, null], hallVisitors: 0, visitorLog: [], themesSeen: {},
    endings: {}, fullRows: {}, news: { gallery: true },
    wsPick: Object.assign({}, DEFAULT_PICK), plPick: { 尺寸: "標準", 材質: "棉布", 填充: "剛剛好" }, plPrint: "",
    stats: { made: 0, rolls: 0, pushes: 0, legends: 0, perfects: 0, fused: 0 }, activeSec: 0,
    // 第 3 版
    keys: free ? { bg: true, hold: true, book4: true } : {}, upgrades: free ? Object.fromEntries(UPGRADES.map(u => [u.id, true])) : {},
    recipes: {}, repaired: {}, injured: {}, job: null, skills: null, skillTicks: {}, history: [],
    cellar: { best: 0, cleared: {}, won: {}, floorsDone: {}, run: null }, lines: {}, weekly: null, giftsIn: {},
    // 第 4 版（11-09，決定 0030）：只有簽到拿得到的東西（shared/signin.js）。博物館的，換參觀者不會跟著換
    limited: { got: {}, wear: { stand: null, frame: null }, stock: {} },
    // 第 4 版（11-09，決定 0032）：兌換所（shared/shop.js）。shop 是博物館的（買到的裝備、試煉房間這週的次數）；gear 是現在這位穿著的（VISITOR_KEYS）
    shop: { gear: {}, trials: {} }, gear: [],
    // 第 4 版（11-09，決定 0035）：主題展辦到哪裡、策展手記讀過沒（shared/themeshow.js）。博物館的，換參觀者不會跟著換
    themeShow: newShow(),
    // 第 4 版（11-08 翊文）：新解開的東西在哪個房間、看過了沒（shared/fresh.js）
    fresh: {},
    // 第 4 版（11-08 翊文）：參觀者一位接一位（shared/legacy.js）：這一位的小優缺點（選職業時抽，決定 0028）、前一位留下的、遺物櫃、這一位自己的統計。
    //   cands 是以前「3 位候選人」還沒挑的，0028 以後一直是 null（舊存檔裡有的留著，選職業時清掉）
    perk: null, flaw: null, cands: null, legacy: null, relics: [],
    visit: { from: todayStr(), sec0: 0, made0: 0, deepest: 0, understood: {}, where: null, made: 0, sec: 0 },
    // 第 4 版（11-08 翊文）：一個帳號最多 3 位參觀者、共用博物館（shared/visitors.js，決定 0018）。自由模式沒有位子
    ...(free ? {} : { vid: "v1", vname: null, slot: 0, oddSeen: {}, visitors: [], visitorCount: 1 }),
  };
}
export const isFree = P => P.mode === "free";
export const maxSan = P => 99 - P.myth;

export function ensureDay(P, date = todayStr()) {
  if (P.day && P.day.date === date) return null;
  const back = rewindDays(P, date); // 舊存檔的日期比今天晚（以前 15 分鐘一天）：先拉回來
  const firstEver = !P.day;
  P.day = { date, startSan: P.sanity, lost: 0, exLoss: {}, reviews: {}, views: {}, moodFx: {}, hugs: {}, mini: {}, diff: {}, quirkGiven: false,
    fusions: 0, pairs: {}, rerolls: 0, hints: {} };
  // 地下收藏庫受的傷，時間到了自己好
  Object.keys(P.injured || {}).forEach(k => { if (P.injured[k] <= date) delete P.injured[k]; });
  const retasked = retaskQuirks(P); // 怪癖留一週：治法換日時變成做不到，改抽一件（決定 0046）
  return { firstEver, back, retasked };
}
// ---------- 舊存檔：遊戲裡的日期跑到今天後面 ----------
// 11-09 以前一天是「玩 15 分鐘」，遊戲裡的日期可能比真的日期晚好幾天。改成真實的一天之後，時間等於往回走。
// ensureDay 碰到「P.day.date 比今天晚」時叫這個。做完之後 P.day 會重開成今天（ensureDay 接著做），所以只會做一次。
// 回傳往回拉了幾天（0 ＝不用拉）。怎麼拉、為什麼（維護日誌 11-09_翊文_真實的一天.md）：
//   - 今天當成新的一天：每天的次數重新算（ensureDay 重開 P.day），進館照常擲心情恢復、技能成長。
//   - 受傷（P.injured 的「好的那天」）：剩幾天就還是幾天，整個往前移。不然要等好幾天、甚至好幾個月才好。
//   - hugDays（現在這位和不在場那幾位的）：整串往前移。11-09 起不用了（連續抱抱枕治怪癖拿掉，決定 0027），舊存檔有的照樣移，不會壞。
//   - 這一位哪天來的（現在這位和不在場那幾位的 visit.from）：一樣往前移，舊的最後一天變成昨天。館長室退休要「來了 1 天以上」（決定 0025，retireCheck），不移的話要等好幾天。
//   - 今天的委託（P.daily）：作廢，照今天重抽。舊的委託日期可能剛好等於今天，會變成「今天的委託都做完了」。
//   - 不在場那幾位的 dayVis（那天掉了多少理智）：作廢，換回來時照新的一天算。理由同上（日期可能剛好等於今天）。
//   - P.created（第 N 天從這天算）比今天晚：改成今天。比今天早的不動（那是真的建立的那天）。
//   - 其他日期（鑰匙、收藏的 d、地下的 floorsDone、配方、怪癖的 since、徽章……）只是紀錄，規則只看有沒有，不看先後，不動。
//   - 每週特展（P.weekly）：週的號碼對不上就照這週重來（weeklyState 本來就這樣），不用另外處理。
export function rewindDays(P, today) {
  if (!P || !P.day || typeof P.day.date !== "string" || typeof today !== "string") return 0;
  const ahead = daysBetween(today, P.day.date);
  if (!(ahead > 0)) return 0;
  const isDay = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (P.injured && typeof P.injured === "object") Object.keys(P.injured).forEach(k => { if (isDay(P.injured[k])) P.injured[k] = addDays(P.injured[k], -ahead); });
  const hugBack = list => asList(list).filter(isDay).map(s => addDays(s, -(ahead + 1)));
  P.hugDays = hugBack(P.hugDays);
  const fromBack = v => { if (v && v.visit && typeof v.visit === "object" && isDay(v.visit.from)) v.visit.from = addDays(v.visit.from, -(ahead + 1)); };
  fromBack(P);
  asList(P.visitors).forEach(v => { if (v && typeof v === "object") { v.hugDays = hugBack(v.hugDays); v.dayVis = null; fromBack(v); } });
  P.daily = null;
  if (!isDay(P.created) || P.created > today) P.created = today;
  return ahead;
}
// 每天第一次打開：擲 d100，比心情大就 +1D10（CoC 的幸運恢復）
export function moodRecovery(P) {
  const roll = rollD100();
  const up = roll.total > P.mood;
  const gain = up ? rollExpr("1D10") : null;
  if (gain) P.mood = clampN(P.mood + gain.total, 0, 99);
  return { roll, up, gain };
}

// ---------- 系統 A：解鎖 ----------
export const isUnlocked = (P, cat, name) => (P.unlocked[cat] || []).includes(name);
export function reqMet(P, req) {
  if (!req) return true;
  if (req.seen) return (P.seen[req.seen] || 0) > 0;
  if (req.badge) return !!P.badges[req.badge];
  if (req.commissions) return P.done >= req.commissions;
  if (req.unlocked) return isUnlocked(P, catOfOption(req.unlocked), req.unlocked);
  return true;
}
export function reqText(req) {
  if (!req) return "";
  if (req.seen) { const ex = exhibitById(req.seen); return `先在畫廊看過「${ex ? ex.title : req.seen}」`; }
  if (req.badge) { const b = BADGES.find(x => x.id === req.badge); return `先拿到徽章「${b ? b.name : req.badge}」`; }
  if (req.commissions) return `先完成 ${req.commissions} 張委託`;
  if (req.unlocked) return `先解鎖「${req.unlocked}」`;
  return "";
}
export function unlockCost(P) { const c = NUM.unlockCosts; return c[Math.min(P.unlockCount, c.length - 1)]; }
export function unlockState(P, cat, name) {
  const o = optOf(cat, name);
  if (!o) return { state: "none" };
  if (isUnlocked(P, cat, name)) return { state: "open" };
  if (o.forbidden) return { state: "forbidden", text: `佩佩神話 ${o.myth} 以上才會出現`, myth: o.myth };
  if (o.mutant) return { state: "mutant", text: "只能在融合室突變出來" };
  if (o.gift) { const l = typeof CLIENT_LINES !== "undefined" && CLIENT_LINES[o.gift]; return { state: "gift", text: `跟${l ? l.name : "委託人"}的委託走完才會收到` }; }
  if (o.key) return { state: "key", text: o.key === "bg" ? "地下收藏庫 B3 的鑰匙打開" : "地下收藏庫 B5 的鑰匙打開" };
  if (o.limited) return { state: "limited", text: o.limited === "shop" ? "兌換所限定：用週章換" : o.limited === "week" ? "每週特展限定：那週的特展到金才拿得到" : o.limited === "show" ? "主題展限定：辦到金才拿得到" : "簽到限定：每週全簽到拿得到" }; // 決定 0030、0032、0035
  if (!reqMet(P, o.req)) return { state: "req", text: reqText(o.req) };
  const cost = unlockCost(P);
  return { state: "buy", cost, ok: P.insp >= cost, text: `${cost} 靈感解鎖` };
}
export function sortUnlocked(P, cat) { const order = allOpts(cat); P.unlocked[cat].sort((a, b) => order.indexOf(a) - order.indexOf(b)); }
export function doUnlock(P, cat, name, how = "buy") {
  const st = unlockState(P, cat, name);
  if (st.state === "open") return { ok: false, reason: "已經打開了" };
  if (how === "buy") {
    if (st.state !== "buy") return { ok: false, reason: st.text || "還不能解鎖" };
    if (!st.ok) return { ok: false, reason: `靈感不夠（要 ${st.cost}）` };
    P.insp -= st.cost;
  }
  const before = possibilities(P);
  P.unlocked[cat].push(name);
  sortUnlocked(P, cat);
  if (how === "buy" || how === "free") P.unlockCount++;
  const ev = [{ type: "unlock", cat, name, how, from: before, to: possibilities(P) }];
  return { ok: true, events: ev.concat(progressEvents(P)) };
}
// 免費解鎖一個（大成功 01 的獎勵）：從條件已達成的鎖住選項裡挑
export function freeUnlock(P) {
  const list = [];
  CATS.forEach(c => partOf(c).options.forEach(o => { if (!isSpecialOpt(o) && !o.key && !isUnlocked(P, c, o.name) && reqMet(P, o.req)) list.push([c, o.name]); }));
  if (!list.length) { P.insp += 10; return [{ type: "insp", gain: 10, why: "沒有可以解鎖的，改給靈感" }]; }
  const [c, n] = pickOne(list);
  return doUnlock(P, c, n, "free").events;
}
// 不用花靈感直接打開（突變、委託人的禮物、地下收藏庫的獎勵）
export function grantOption(P, cat, name, how) {
  if (!optOf(cat, name) || isUnlocked(P, cat, name)) return [];
  const before = possibilities(P);
  P.unlocked[cat].push(name); sortUnlocked(P, cat);
  return [{ type: "unlock", cat, name, how, from: before, to: possibilities(P) }];
}
// 佩佩神話夠了，禁忌選項自己打開
export function mythUnlocks(P) {
  const ev = [];
  CATS.forEach(c => partOf(c).options.forEach(o => {
    if (o.forbidden && !isUnlocked(P, c, o.name) && P.myth >= o.myth) {
      const before = possibilities(P);
      P.unlocked[c].push(o.name); sortUnlocked(P, c);
      ev.push({ type: "unlock", cat: c, name: o.name, how: "myth", from: before, to: possibilities(P) });
    }
  }));
  return ev;
}

// ---------- 恐懼症讓選項不能用 ----------
// 為什麼不敢碰（翊文 11-08：「看了一幅畫之後其他本來解開的就還不能點，看看是不是有問題」：
// 是恐懼症照規則擋的，但畫面沒說為什麼，看起來像壞掉）。回傳 { kind: "quirk", quirk } 或 { kind: "bout", left }，沒擋就 null
// 時間到的怪癖（決定 0027）就不擋了，就算還沒被 expireQuirks 拿掉
export function blockedWhy(P, cat, name) {
  const q = activeQuirks(P).find(x => x.type === "phobia" && x.cat === cat && (x.opt ? x.opt === name : name !== baseOpts(cat)[0]));
  if (q) return { kind: "quirk", quirk: q };
  if (P.bout && P.bout.i === 8 && P.bout.cat === cat && P.bout.opt === name) return { kind: "bout", left: P.bout.left };
  return null;
}
export function blockedSet(P) {
  const b = {};
  const add = (c, n) => { (b[c] = b[c] || new Set()).add(n); };
  activeQuirks(P).filter(q => q.type === "phobia").forEach(q => {
    if (q.opt) add(q.cat, q.opt);
    else allOpts(q.cat).filter(n => n !== baseOpts(q.cat)[0]).forEach(n => add(q.cat, n));
  });
  if (P.bout && P.bout.i === 8 && P.bout.opt) add(P.bout.cat, P.bout.opt);
  return b;
}
export function usable(P, cat) {
  const b = blockedSet(P)[cat];
  return (P.unlocked[cat] || []).filter(n => !(b && b.has(n)));
}
export const isBlocked = (P, cat, name) => { const b = blockedSet(P)[cat]; return !!(b && b.has(name)); };
export function possibilities(P) { return CATS.reduce((n, c) => n * usable(P, c).length, 1); }
export function pillowPossibilities(P) { return PILLOW_TOTAL * (Object.keys(P.pepes).length + Object.keys(P.failed).length); }

// ---------- 系統 B：做佩佩、擲稀有度 ----------
export function maniaQuirk(P) { return activeQuirks(P).find(q => q.type === "mania"); }
export function makeCost(P, pick) {
  if (isFree(P)) return 0;
  let c = NUM.costPepe;
  const m = maniaQuirk(P);
  if (m) c += pick[m.cat] === m.opt ? -1 : 1;
  return Math.max(0, c);
}
export function sameComboOwned(P, pick) {
  return RARITY_ORDER.some(r => P.pepes[pepeKey(Object.assign({}, pick, { [ROLLED]: r }))]);
}
// 沒選的裝飾類別當作「沒有」
export const fullPick = pick => Object.assign({}, ...DECO_CATS.map(c => ({ [c]: DEFAULT_PICK[c] })), pick);
export function canMake(P, pick) {
  pick = fullPick(pick);
  for (const c of CATS) {
    if (c === ROLLED && !isFree(P)) continue;
    if (!pick[c]) return { ok: false, reason: `還沒選${c}` };
    if (!isUnlocked(P, c, pick[c])) return { ok: false, reason: `「${pick[c]}」還沒解鎖` };
    if (isBlocked(P, c, pick[c])) return { ok: false, reason: `你不敢碰「${pick[c]}」` };
  }
  if (P.bout && P.bout.i === 9 && sameComboOwned(P, pick)) return { ok: false, reason: "收藏狂發作：這種已經有了，不做！" };
  const cost = makeCost(P, pick);
  if (P.insp < cost) return { ok: false, reason: `靈感不夠（做一隻要 ${cost}），去畫廊逛逛吧` };
  return { ok: true, cost };
}
export function startMake(P, pick) {
  const can = canMake(P, pick);
  if (!can.ok) return can;
  P.insp -= can.cost;
  P.stats.rolls++;
  return { ok: true, cost: can.cost, roll: rollD100() };
}
export function rarityOfRoll(P, total, natural) {
  if (natural >= NUM.fumbleFrom) return { rarity: FAILED, failed: true };
  let r = (RARITY_TABLE.find(t => total <= t.max) || RARITY_TABLE[RARITY_TABLE.length - 1]).name;
  const eld = PEPE_PARTS.find(p => p.name === ROLLED).options.find(o => o.forbidden);
  if (natural === 1 && eld && P.myth >= eld.myth && isUnlocked(P, ROLLED, eld.name)) r = eld.name;
  const want = r;
  let i = RARITY_ORDER.indexOf(r);
  while (i > 0 && !usable(P, ROLLED).includes(RARITY_ORDER[i])) i--;
  return { rarity: RARITY_ORDER[i], want, capped: RARITY_ORDER[i] !== want, perfect: natural === 1 };
}
// 花心情把骰子壓低：1 點心情壓低 1，最低壓到 02；擲出失敗作（98–100）或孤注一擲的那次不能花
export function spendRange(P, natural, pushed, blood = 0) {
  if (isFree(P) || pushed || natural >= NUM.fumbleFrom || natural <= NUM.moodFloor) return 0;
  return Math.max(0, Math.min(P.mood + blood, natural - NUM.moodFloor));
}
// 稀有度往下找到已經能用的那一級
export function capRarity(P, r) {
  let i = RARITY_ORDER.indexOf(r);
  if (i < 0) return RARITY_ORDER[0];
  while (i > 0 && !usable(P, ROLLED).includes(RARITY_ORDER[i])) i--;
  return RARITY_ORDER[i];
}
export function pushRoll(P) { P.stats.pushes++; return rollD100(); }
export function finishMake(P, pick, res) {
  // res: { natural, spent, pushed }（自由模式 res 可以不給，稀有度用 pick 裡的）
  const ev = [];
  let rarity = pick[ROLLED], perfect = false, failed = false, info = null;
  const fu = res && res.fusion;
  if (fu && fu.fixed) rarity = capRarity(P, fu.fixed);
  else if (!isFree(P)) {
    const blood = (fu && fu.blood) || 0;
    const spent = Math.min(res.spent || 0, spendRange(P, res.natural, res.pushed, blood));
    P.mood -= Math.max(0, spent - blood); // 血統先用，不夠才用心情
    info = rarityOfRoll(P, res.natural - spent, res.natural);
    rarity = info.rarity; perfect = !!info.perfect; failed = !!info.failed;
  }
  if (fu && fu.minRarity && !failed && rarityRank(rarity) < rarityRank(fu.minRarity)) rarity = capRarity(P, fu.minRarity);
  if (fu) P.stats.fused = (P.stats.fused || 0) + 1;
  const final = Object.assign(fullPick(pick), { [ROLLED]: rarity });
  P.stats.made++;
  if (P.visit && typeof P.visit.made === "number") P.visit.made++; // 這一位做了幾隻（多位參觀者共用 stats.made，11-08）
  let key, isNew;
  if (failed) {
    key = pepeKey(final);
    isNew = !P.failed[key];
    P.failed[key] = (P.failed[key] || 0) + 1;
  } else {
    key = pepeKey(final);
    const e = P.pepes[key];
    isNew = !e;
    if (e) { e.n++; if (perfect) e.perfect = true; if (fu && fu.title && !e.title) e.title = fu.title; }
    else P.pepes[key] = Object.assign({ n: 1, perfect, s: ++P.serial, d: todayStr() }, fu && fu.title ? { title: fu.title } : {}, fu ? { fused: true } : {});
    if (rarity === "傳說級稀有") P.stats.legends++;
    if (perfect) { P.stats.perfects++; ev.push(...freeUnlock(P)); }
  }
  ev.push(...progressEvents(P));
  return { kind: failed ? "failed" : "pepe", key, pick: final, isNew, perfect, failed, info, events: ev };
}

// ---------- 系統 F：理智檢定 ----------
export function sanSpecFor(P, ex) {
  if (!ex.san) return null;
  const today = P.day && P.day.views ? P.day.views[ex.id] || 0 : 0;
  return today > NUM.habituate ? "0/1" : ex.san;
}
export function sanCheck(P, spec, src) {
  const [s, f] = splitSan(spec);
  const roll = rollD100();
  const success = roll.total <= P.sanity;
  const fumble = roll.total === 100;
  const expr = success ? s : f;
  const lossRoll = rollExpr(expr);
  let loss = !success && fumble ? maxExpr(f) : lossRoll.total;
  let habituated = false;
  if (src && P.day) {
    // 習慣了：同一件展品一天內最多掉它的最大值
    const left = Math.max(0, maxExpr(f) - (P.day.exLoss[src] || 0));
    if (loss > left) { loss = left; habituated = true; }
  }
  return { spec, roll, success, fumble, expr, lossRoll, loss, habituated, src };
}
export function applySan(P, loss, src) {
  loss = Math.max(0, Math.min(loss, P.sanity));
  P.sanity -= loss;
  if (P.day) {
    P.day.lost += loss;
    if (src) P.day.exLoss[src] = (P.day.exLoss[src] || 0) + loss;
  }
  const ev = { loss, temp: loss >= 5, indef: false, zero: P.sanity <= 0 };
  if (P.day && !P.day.quirkGiven && loss > 0 && P.day.lost >= Math.max(1, Math.ceil(P.day.startSan / 5))) {
    ev.indef = true; P.day.quirkGiven = true;
  }
  if (ev.zero) { P.dark = true; if (P.visit) P.visit.where = src || null; } // 理智在哪裡用完（歷任參觀者牆，11-08）
  return ev;
}
export function gainSan(P, n) { const before = P.sanity; P.sanity = clampN(P.sanity + n, 0, maxSan(P)); if (P.sanity > 0) P.dark = false; return P.sanity - before; }
// 看懂檢定：50＋佩佩神話。看懂了才會瘋
export function understandCheck(P) {
  const target = Math.min(99, NUM.understandBase + P.myth + traitSum(P, "understand")); // 小缺點「怕黑」+10（11-08）
  const roll = rollD100();
  return { roll, target, success: roll.total <= target };
}
// 瘋狂發作：1D10 查表，持續 1D10 個動作
export function startBout(P) {
  const r = rollExpr("1D10"), dur = rollExpr("1D10");
  const i = r.total - 1;
  const b = { i, left: [4, 5, 6].includes(i) ? 1 : dur.total };
  if (i === 7) b.emo = RNG() < 0.5 ? "開心" : "傷心";
  if (i === 8) {
    const opts = [];
    CATS.filter(c => c !== ROLLED).forEach(c => { const u = usable(P, c); if (u.length > 1) u.forEach(n => opts.push([c, n])); });
    if (opts.length) { const [c, n] = pickOne(opts); b.cat = c; b.opt = n; }
  }
  P.bout = b;
  return { roll: r, dur, bout: b };
}
export function tickAction(P) {
  if (!P.bout) return null;
  P.bout.left--;
  if (P.bout.left <= 0) { const ended = P.bout; P.bout = null; return { ended }; }
  return null;
}
// 失敗時你會不由自主做一件事
export function involuntary(P) {
  const id = pickOne(["backout", "swap", "blink", "mumble"]);
  if (id === "swap") P.swapNext = true;
  return id;
}
// 不定性瘋狂：得到一個怪癖。
// 治法（決定 0027 定了「做事情治好」，決定 0046 改成「兩個遊戲日」和「一週」；恐懼症、狂熱都算負面，理由見決定 0027）：
//   q.task  得到時從「現在做得到的」抽一件（pickQuirkTask）。都做不到時是 null，只能等時間到
//   q.done  做到這件事的遊戲日（todayStr 的字串，不重複）；湊滿 NUM.quirkTaskDays 個不同的日子就治好（不用連續）
//   q.until 得到那一刻（nowMs）＋ NUM.quirkDays 天：時間到自己消失（真的時鐘，關掉遊戲、換成別的參觀者也在走）
//   同時最多 NUM.quirkMax 個：滿了就不給新的（applySan 那天的額度照樣用掉）
// 原本的「連續 3 天抱抱枕」、委託櫃台的「治療委託」都拿掉了：「交一張委託」就是原本的治療委託，併成同一件
export function gainQuirk(P) {
  const cats = CATS.filter(c => c !== ROLLED);
  const type = RNG() < 0.5 ? "phobia" : "mania";
  const cands = [];
  if (type === "phobia") {
    ["帽子", "姿勢"].filter(c => cats.includes(c)).forEach(c => { if (usable(P, c).length > 1) cands.push({ cat: c, opt: null }); });
    cats.forEach(c => { const u = usable(P, c); if (u.length > 1) u.slice(1).forEach(n => cands.push({ cat: c, opt: n })); });
  } else {
    cats.forEach(c => usable(P, c).forEach(n => cands.push({ cat: c, opt: n })));
  }
  const now = nowMs();
  if (activeQuirks(P, now).length >= NUM.quirkMax) return null; // 怪癖留一週，不擋的話會越疊越多（決定 0046）
  const used = new Set(activeQuirks(P, now).map(q => q.type + q.cat + q.opt));
  const left = cands.filter(q => !used.has(type + q.cat + q.opt));
  if (!left.length) return null;
  const before = possibilities(P);
  const q = Object.assign({ type, since: todayStr() }, pickOne(left), { until: now + quirkSpan(), task: null, done: [] });
  P.quirks.push(q);
  q.task = pickQuirkTask(P); // 放進去之後才挑：新的恐懼症擋住的選項，委託也做不出來
  return { quirk: q, from: before, to: possibilities(P) };
}
export function quirkName(q) {
  const x = q.opt ? (q.cat === "顏色" ? q.opt + "色" : q.opt) : q.cat;
  return fill(QUIRK_TEXT[q.type].name, x);
}
// 治好一個怪癖（q 沒給就是第一個）。回傳 { quirk, from, to }（可能性前後），沒有就 null
export function cureQuirk(P, q) {
  const list = Array.isArray(P.quirks) ? P.quirks : [];
  const i = q ? list.indexOf(q) : 0;
  if (i < 0 || !list.length) return null;
  const before = possibilities(P);
  const gone = list.splice(i, 1)[0];
  return { quirk: gone, from: before, to: possibilities(P) };
}

// ---------- 怪癖：在 NUM.quirkTaskDays 個不同的遊戲日做到治法那件事，不然 NUM.quirkDays 天後自己消失（決定 0046；0027 是「做完一件事、20 分鐘」） ----------
// 治療的事有三種（文字在 content3.js 的 QUIRK_TASK_TEXT）：
//   hug      抱一次抱枕：hug() 抱成功
//   deliver  交一張委託：deliver() 交成功（一鍵交件也算，因為它也是一張一張 deliver）
//   calm     看一幅不可怕的畫：viewExhibit() 看了不用理智檢定的畫（ex.san 沒寫的）
// 要加一種：這裡加名字、quirkTaskOk 加「現在做不做得到」、那個動作的函式叫 cureByTask、QUIRK_TASK_TEXT 加文字、test/content/check3.cjs 加 key
export const QUIRK_TASKS = ["hug", "deliver", "calm"];
export const quirkSpan = () => NUM.quirkDays * DAY_MS;
// 還沒過期（沒有 until 的當成還沒過期：測試、舊存檔在 fixQuirks 補上之前）
export const quirkLive = (q, now = nowMs()) => !!q && !(typeof q.until === "number" && q.until <= now);
export const activeQuirks = (P, now = nowMs()) => asList(P && P.quirks).filter(q => quirkLive(q, now));
// 還剩幾天自己好（無條件進位：還剩 1 小時寫 1 天）；過期是 0。這是「時間」，不是遊戲日：到期的那一刻才好
export function quirkDaysLeft(q, now = nowMs()) {
  if (!q || typeof q.until !== "number" || !Number.isFinite(q.until)) return NUM.quirkDays;
  return Math.max(0, Math.ceil((q.until - now) / DAY_MS));
}
// 做事情的進度：做到過的遊戲日（不重複的日期字串）、還要幾個不同的日子、今天做過了沒
export const quirkDoneDays = q => [...new Set(asList(q && q.done).filter(s => typeof s === "string"))];
export const quirkNeedDays = q => Math.max(0, NUM.quirkTaskDays - quirkDoneDays(q).length);
export const quirkDoneToday = (q, now = nowMs()) => quirkDoneDays(q).includes(todayStr(now));
// 開放的、不用理智檢定的畫（「看一幅不可怕的畫」）
export function calmExhibits(P) { return EXHIBITS.map(e => exhibitById(e.id)).filter(ex => ex && !ex.san && exhibitOpen(P, ex)); }
// 這件事今天做不做得到。抽治法時只抽做得到的（隔天再看一次：ensureDay 換日時的 retaskQuirks）
export function quirkTaskOk(P, kind) {
  if (!P || isFree(P)) return false;
  if (kind === "hug") return !!P.day && Object.keys(P.pillows || {}).some(k => !(P.day.hugs || {})[k]); // 有今天還沒抱過的抱枕
  if (kind === "deliver") {
    if (!P.day) return false;
    if (autoDeliverables(P).length) return true; // 收藏裡已經有交得出去的
    // 或是做一隻就交得出去：不挑稀有度、不要完美作品、不要失敗作，選項沒被擋住，靈感夠做一隻（狂熱時最多多花 1）
    return dailyCommissions(P, P.day.date).some(c => {
      const n = c.need || {};
      return !c.done && c.kind !== "pillow" && !n.perfect && !n.failed && !(ROLLED in n) && needSatisfiable(P, c) && P.insp >= NUM.costPepe + 1;
    });
  }
  if (kind === "calm") return calmExhibits(P).length > 0;
  return false;
}
// 抽一件治法（RNG）：跟別的怪癖不一樣的優先，都一樣就隨便抽；都做不到回傳 null
export function pickQuirkTask(P) {
  const ok = QUIRK_TASKS.filter(k => quirkTaskOk(P, k));
  if (!ok.length) return null;
  const taken = new Set(activeQuirks(P).map(q => q.task));
  const fresh = ok.filter(k => !taken.has(k));
  return pickOne(fresh.length ? fresh : ok);
}
// 做了一件事：治法是這件事、還沒過期的怪癖，把今天記進 q.done；湊滿 NUM.quirkTaskDays 個不同的日子就治好。
// 回傳 [{ quirk, from, to }（治好了）或 { quirk, step: true, done, need }（今天算了一天，還沒好，還要 need 天）]
// 今天已經算過的、治法不是這件的不回報
export function cureByTask(P, kind, now = nowMs()) {
  const out = [], day = todayStr(now);
  activeQuirks(P, now).filter(q => q.task === kind).forEach(q => {
    const days = quirkDoneDays(q);
    if (days.includes(day)) return; // 同一天做再多次都只算一天
    q.done = days.concat(day);
    if (q.done.length >= NUM.quirkTaskDays) { const r = cureQuirk(P, q); if (r) out.push(r); }
    else out.push({ quirk: q, step: true, done: q.done.length, need: NUM.quirkTaskDays - q.done.length });
  });
  return out;
}
// 換日時：治法現在做不到的（或得到時都做不到的），改抽一件做得到的。做過的日子留著（做的是「治法那件事」，換一件不重算）。
// 回傳 [{ quirk, from, to }]（舊的、新的 task）。怪癖留一週，一週內治法可能變成做不到（靈感用光、委託都不能做），所以每天看一次
export function retaskQuirks(P) {
  const out = [];
  if (!P || isFree(P) || !Array.isArray(P.quirks)) return out;
  activeQuirks(P).forEach(q => {
    if (q.task && quirkTaskOk(P, q.task)) return;
    const k = pickQuirkTask(P);
    if (k && k !== q.task) { out.push({ quirk: q, from: q.task || null, to: k }); q.task = k; }
  });
  return out;
}
// 時間到的拿掉。回傳拿掉的 [{ quirk }]（畫面每秒叫一次，有拿掉就跳提示；之後伺服器也叫這個）
export function expireQuirks(P, now = nowMs()) {
  if (!P || !Array.isArray(P.quirks)) return [];
  const gone = P.quirks.filter(q => !quirkLive(q, now));
  if (!gone.length) return [];
  P.quirks = P.quirks.filter(q => quirkLive(q, now));
  return gone.map(q => ({ quirk: q }));
}
// 舊存檔補欄位（fixProfile、visitors.js 的 fixPack 叫）：
//   - 沒有 until（11-09 以前的怪癖）：從載入那一刻起算 NUM.quirkDays 天；已經有 until 的（20 分鐘版）照舊，不延長
//   - until 比「現在＋NUM.quirkDays 天」還晚（電腦時鐘被往回調過）：拉回來
//   - 沒有 done（決定 0046 以前）：當 0 個日子；有的只留不重複的日期字串
//   - 沒有 task：補「交一張委託」（原本的治法是交「治療委託」，最接近）；task 是 null（得到時都做不到）就留著 null
export function fixQuirks(list, now = nowMs()) {
  return asList(list).filter(q => q && typeof q === "object" && !Array.isArray(q)).map(q => {
    const out = Object.assign({}, q);
    if (typeof out.until !== "number" || !Number.isFinite(out.until) || out.until > now + quirkSpan()) out.until = now + quirkSpan();
    if (out.task !== null && !QUIRK_TASKS.includes(out.task)) out.task = "deliver";
    out.done = [...new Set(asList(out.done).filter(s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)))].slice(0, 20);
    return out;
  });
}
// 半價：花「掉的理智 ×2」的心情，把這次掉的理智減半（理智檢定本身不能花心情）
export const halveCost = loss => loss * 2;
export const halved = loss => Math.ceil(loss / 2);
// 理智 0：俄國8+9 的房間，然後換下一位參觀者（圖鑑、收藏、展廳都留著）
// 第 4 版（11-08 翊文，roguelike 的繼承，規則在 shared/legacy.js）：
//   leave ＝這一位留給下一位的東西：{ type: "relic", item: { kind, key } }、{ type: "skill" }，或 null（A）
//   這一位的紀錄多記了優缺點、做了幾隻、地下走到第幾層、看懂幾件、留了什麼（D）
//   新的一位先不選職業：畫面那邊從 6 個職業選，再抽小優點、小缺點（legacy.js 的 chooseJob；決定 0028，以前是從 3 位候選人挑）
// 回傳心情的骰子（跟以前一樣），另外帶 entry（這一位的紀錄）、left（留給下一位的）
export function nextVisitor(P, endedBy = "russia8", leave = null) {
  P.history = asList(P.history);
  const entry = visitorRecord(P, endedBy);
  const left = leaveLegacy(P, entry, leave);
  P.history.unshift(entry);
  P.history = P.history.slice(0, 50);
  P.job = null; P.skills = null; P.skillTicks = {};
  if (P.cellar) P.cellar.run = null;
  P.visitor = takeVisitorNo(P); // 號碼從博物館的計數器拿（多位參觀者時不會跟別的位子重號）
  P.sanity = NUM.startSanity; P.myth = 0; P.mythFrom = {};
  const r = rollExpr("3D6"); P.mood = r.total * 5; P.moodRoll = r.faces;
  P.quirks = []; P.bout = null; P.dark = false; P.swapNext = false;
  // 每天的次數照帳號算（決定 0018）：P.day 留著，只把算這一位理智的（今天掉了多少、給過怪癖沒、看習慣了沒）重算。
  // 以前是整個 P.day 重來，換人就多拿一輪每天的次數
  if (!P.day) ensureDay(P);
  Object.assign(P.day, freshDayVis(P));
  // 同一個位子換人（visitors.js）：新的編號、還沒取名字；怪事的旁白是這一位的，重來（hugDays 11-09 起不用了，照樣清掉）
  if (hasSlots(P)) { P.vid = "v" + P.visitor; P.vname = null; }
  P.hugDays = []; P.oddSeen = {};
  P.perk = null; P.flaw = null; P.legacy = left;
  P.visit = newVisit(P);
  P.cands = null;
  return Object.assign(r, { entry, left });
}

// ---------- 畫廊、起源室 ----------
export function exhibitById(id) {
  const ex = EXHIBITS.find(e => e.id === id);
  if (!ex) return holidayExhibitById(id); // 節日的藝術品（shared/holidays.js，決定 0030）
  const extra = (typeof NEW_EXHIBITS !== "undefined" && NEW_EXHIBITS[id]) || {};
  return Object.assign({}, extra, ex, { title: ex.title || extra.title, label: ex.label || extra.label, lines: ex.lines || extra.lines || [] });
}
export const GEN1_EXHIBITS = ["portrait", "strange", "rare", "statue"];
// 起源室所有的章節（照章號排）：第壹～參章、第肆章（地下）、第伍～捌章（11-08）
export function allChapters() {
  return STORY_CHAPTERS.concat(typeof CHAPTER4 !== "undefined" ? [CHAPTER4] : [], typeof MORE_CHAPTERS !== "undefined" ? MORE_CHAPTERS : []).sort((a, b) => a.id - b.id);
}
export function chapterOpen(P, id) {
  if (isFree(P) || id <= 1) return true;
  if (id === 4) return !!(P.cellar && P.cellar.best >= 3);
  const mc = typeof MORE_CHAPTERS !== "undefined" && MORE_CHAPTERS.find(c => c.id === id);
  if (mc) {
    const n = mc.need || {};
    return !!((n.seen && P.seen[n.seen]) || (n.unlocks && P.unlockCount >= n.unlocks) || (n.understood && Object.keys(P.understood || {}).length >= n.understood) || (n.ending && Object.keys(P.endings || {}).length));
  }
  return P.unlockCount >= (id === 2 ? NUM.ch2 : NUM.ch3);
}
export function exhibitOpen(P, ex) {
  if (ex.holiday) return holidaysOn(P.day ? P.day.date : todayStr()).some(h => h.key === ex.holiday); // 節日的藝術品：只有節日那天（決定 0030）
  if (!ex.unlock || isFree(P)) return true;
  if (ex.unlock === "hidden") return chapterOpen(P, 2) && GEN1_EXHIBITS.every(id => P.seen[id]);
  if (ex.unlock === "russia8") return isUnlocked(P, "心情", "俄國8+9") && !!P.seen.hidden;
  return true;
}
// 展品的危險度（0–3）與靈感：越危險越多（NUM.galleryInsp）
export function exhibitDanger(ex) {
  if (!ex.san) return 0;
  const m = maxExpr(splitSan(ex.san)[1]);
  return m <= 8 ? 1 : m <= 12 ? 2 : 3;
}
export const galleryInsp = ex => NUM.galleryInsp[Math.min(exhibitDanger(ex), NUM.galleryInsp.length - 1)];
export function reviewsLeft(P, ex) { return P.day ? Math.max(0, galleryInsp(ex).perDay - (P.day.reviews[ex.id] || 0)) : 0; }
export function viewsToday(P, ex) { return P.day && P.day.views ? P.day.views[ex.id] || 0 : 0; }
export function viewExhibit(P, ex) {
  const first = !P.seen[ex.id];
  P.seen[ex.id] = (P.seen[ex.id] || 0) + 1;
  if (P.day) { P.day.views = P.day.views || {}; P.day.views[ex.id] = (P.day.views[ex.id] || 0) + 1; }
  const out = { first, insp: 0, mood: 0, myth: 0, san: null, events: [], cured: [] };
  if (isFree(P)) return out;
  const gi = galleryInsp(ex);
  if (first) out.insp = gi.first;
  else if (reviewsLeft(P, ex) > 0) { P.day.reviews[ex.id] = (P.day.reviews[ex.id] || 0) + 1; out.insp = gi.review; }
  else out.capped = true; // 今天這件的靈感拿完了
  P.insp += out.insp;
  if (ex.mood && !P.day.moodFx[ex.id]) {
    P.day.moodFx[ex.id] = true;
    const before = P.mood; P.mood = clampN(P.mood + ex.mood, 0, 99); out.mood = P.mood - before;
  }
  if (ex.myth && !P.mythFrom[ex.id]) { P.mythFrom[ex.id] = true; out.myth = ex.myth; }
  out.san = sanSpecFor(P, ex);
  if (!ex.san) out.cured = cureByTask(P, "calm"); // 看了不可怕的畫：治法是這件的怪癖治好（決定 0027）
  return out;
}
export function addMyth(P, n) {
  P.myth += n;
  if (P.sanity > maxSan(P)) P.sanity = maxSan(P);
  return mythUnlocks(P).concat(progressEvents(P));
}
export function readOrigin(P) {
  if (isFree(P) || !P.day || P.day.moodFx.origin) return 0;
  P.day.moodFx.origin = true;
  const before = P.mood; P.mood = clampN(P.mood + ORIGIN.mood, 0, 99); return P.mood - before;
}
export function finishChapter(P, id) {
  if (P.chaptersRead[id]) return 0;
  P.chaptersRead[id] = true;
  if (isFree(P)) return 0;
  P.insp += NUM.chapterInsp;
  return NUM.chapterInsp;
}
export function bookMyth(P, book) {
  if (isFree(P) || P.mythFrom[book.id]) return 0;
  P.mythFrom[book.id] = true;
  return book.myth;
}

// ---------- 小遊戲的靈感（每天有上限） ----------
export function miniLeft(P, game) { return isFree(P) || !P.day ? 0 : Math.max(0, NUM.miniPerDay - (P.day.mini[game] || 0)); }
export function miniReward(P, game, amount) {
  if (isFree(P) || amount <= 0) return 0;
  const used = P.day.mini[game] || 0;
  if (used >= NUM.miniPerDay) return 0;
  P.day.mini[game] = used + 1;
  P.insp += amount;
  return amount;
}

// ---------- 系統 I：抱枕 ----------
export function canMakePillow(P, pick, print) {
  for (const c of PILLOW_CATS) if (!pick[c]) return { ok: false, reason: `還沒選${c}` };
  if (!print) return { ok: false, reason: "先從下面挑一隻要印的佩佩" };
  const cost = isFree(P) ? 0 : NUM.costPillow;
  if (P.insp < cost) return { ok: false, reason: `靈感不夠（做一個要 ${cost}）` };
  // 簽到限定的材料（星光絨，決定 0030）：做一個用掉一份
  if (PILLOW_CATS.some(c => isLimitedMat(pick[c]) && stockOf(P, pick[c]) < 1)) return { ok: false, reason: `${PILLOW_CATS.map(c => pick[c]).find(v => isLimitedMat(v))}用完了：每週全簽到、節日簽到拿得到` };
  return { ok: true, cost };
}
export function makePillow(P, pick, print) {
  const can = canMakePillow(P, pick, print);
  if (!can.ok) return can;
  P.insp -= can.cost;
  PILLOW_CATS.forEach(c => useStock(P, pick[c])); // 星光絨用掉一份（決定 0030）
  // 小優點「手巧」（11-08）：有 N% 不花靈感
  const lucky = can.cost > 0 && traitSum(P, "pillowFree") > 0 && RNG() * 100 < traitSum(P, "pillowFree");
  if (lucky) P.insp += can.cost;
  const key = pillowKeyOf(pick, print);
  const isNew = !P.pillows[key];
  P.pillows[key] = (P.pillows[key] || 0) + 1;
  return { ok: true, key, isNew, free: lucky, events: progressEvents(P) };
}
export function hug(P, key) {
  if (isFree(P)) return { ok: true, gain: 0, free: true, cured: [] };
  if (P.day.hugs[key]) return { ok: false, already: true };
  P.day.hugs[key] = true;
  const { print } = parsePillowKey(key);
  const happy = print && print.pick.心情 === "開心";
  const roll = rollExpr(happy ? NUM.hugHappy : NUM.hug);
  const gain = gainSan(P, roll.total);
  // 治法是「抱一次抱枕」的怪癖治好（決定 0027；原本是連續 3 天抱抱枕，P.hugDays、hugStreak 拿掉了）
  const cured = cureByTask(P, "hug");
  return { ok: true, roll, gain, happy, cured };
}

// ---------- 系統 C：委託 ----------
export function specAllows(spec, val) {
  if (spec == null) return true;
  if (typeof spec === "string") return spec === val;
  if (Array.isArray(spec)) return spec.includes(val);
  if (spec.not != null) return !asList(spec.not).includes(val);
  return true;
}
export function pepeNeedOk(P, need) {
  return CATS.every(c => !(c in need) || usable(P, c).some(v => specAllows(need[c], v)));
}
export function needSatisfiable(P, c) {
  const need = c.need || {};
  if (c.kind === "pillow") {
    const okPillow = PILLOW_CATS.every(k => !(k in need) || PILLOW_PARTS.find(p => p.name === k).options.some(o => specAllows(need[k], o.name)));
    return okPillow && pepeNeedOk(P, need.print || {}) && Object.keys(P.pepes).length > 0;
  }
  if (need.failed) return Object.keys(P.failed).length > 0;
  return pepeNeedOk(P, need);
}
export function matchPepe(need, pick, flags) {
  if (!need) return true;
  if (need.perfect && !flags.perfect) return false;
  if (need.failed && !flags.failed) return false;
  if (!need.failed && flags.failed && ROLLED in need) return false;
  return CATS.every(c => !(c in need) || specAllows(need[c], pick[c]));
}
export function commissionText(c) {
  return c.text;
}
export function genPrecise(P, rng, date, slot) {
  const pick = {};
  CORE_CATS.filter(c => c !== ROLLED).forEach(c => { pick[c] = pickOne(usable(P, c).filter(n => !isSpecialOpt(optOf(c, n))), rng) || usable(P, c)[0]; });
  const cl = pickOne(CLIENTS, rng);
  const hat = pick.帽子 === "沒有" ? "不戴帽子" : `戴${pick.帽子}`;
  const text = `一隻${pick.心情}的${pick.顏色}佩佩，${hat}，${pick.姿勢}。`;
  return { id: `${date}#${slot}`, kind: "precise", client: cl.name, note: cl.note, text, need: pick, reward: NUM.reward.precise, comment: pickOne(CLIENT_COMMENTS, rng), done: false };
}
export function dailyCommissions(P, date = todayStr()) {
  if (P.daily && P.daily.date === date) return P.daily.list;
  const rng = mulberry32(hashStr(`${date}|${P.mode}|${P.visitor}`));
  const pool = COMMISSION_POOL.filter(c => needSatisfiable(P, c));
  const take = kinds => {
    const list = pool.filter(c => kinds.includes(c.kind) && !used.has(c.id));
    if (!list.length) return null;
    const c = pickOne(list, rng); used.add(c.id); return c;
  };
  const used = new Set();
  const list = [genPrecise(P, rng, date, 0)];
  const second = (Object.keys(P.pepes).length && rng() < 0.4 ? take(["pillow"]) : null) || take(["vague"]);
  const third = take(["riddle"]);
  [second, third].forEach((c, i) => {
    if (c) list.push(Object.assign({}, c, { id: `${date}#${i + 1}`, src: c.id, reward: c.reward || NUM.reward[c.kind] || 5, done: false }));
    else list.push(genPrecise(P, rng, date, i + 1));
  });
  if (hasUp(P, "board")) list.push(extraCommission(P, rng, date, list.length, used, take));
  const line = lineCommission(P, date);
  if (line) list.push(line);
  P.daily = { date, list };
  return list;
}
// 升級「委託板加寬」：多一張（模糊或謎語，沒有就精準）
export function extraCommission(P, rng, date, slot, used, take) {
  const c = take ? take(["vague", "riddle"]) : null;
  if (c) return Object.assign({}, c, { id: `${date}#${slot}`, src: c.id, reward: c.reward || NUM.reward[c.kind] || 5, done: false });
  return genPrecise(P, rng || RNG, date, slot);
}
// 白天才買的升級：今天的委託板馬上多一張
export function ensureBoardSize(P) {
  if (!P.daily || !hasUp(P, "board")) return;
  const normal = P.daily.list.filter(c => c.kind !== "line");
  if (normal.length >= 4) return;
  const used = new Set(normal.map(c => c.src).filter(Boolean));
  const pool = COMMISSION_POOL.filter(c => needSatisfiable(P, c) && !used.has(c.id) && ["vague", "riddle"].includes(c.kind));
  const c = pool.length ? pickOne(pool) : null;
  const add = c ? Object.assign({}, c, { id: `${P.daily.date}#x`, src: c.id, reward: c.reward || NUM.reward[c.kind] || 5, done: false }) : genPrecise(P, RNG, P.daily.date, "x");
  const at = P.daily.list.findIndex(x => x.kind === "line");
  if (at >= 0) P.daily.list.splice(at, 0, add); else P.daily.list.push(add);
}
// 委託人關係線：每天一張，輪流出現，按故事順序
export function lineCommission(P, date) {
  if (isFree(P) || typeof CLIENT_LINES === "undefined" || P.unlockCount < NUM.linesFrom) return null;
  const ids = Object.keys(CLIENT_LINES).filter(id => (P.lines[id] || 0) < CLIENT_LINES[id].steps.length);
  if (!ids.length) return null;
  const start = hashStr(date) % ids.length;
  for (let k = 0; k < ids.length; k++) {
    const id = ids[(start + k) % ids.length];
    const L = CLIENT_LINES[id], step = P.lines[id] || 0, s = L.steps[step];
    const c = { kind: "line", need: s.need };
    if (!needSatisfiable(P, c)) continue;
    return { id: `${date}#L`, kind: "line", line: id, step, client: L.name, text: s.text, need: s.need, reward: NUM.lineReward, comment: s.comment, intro: step === 0 ? L.intro : null, done: false };
  }
  return null;
}
export function itemPick(P, item) {
  if (item.kind === "pillow") return parsePillowKey(item.key);
  return { pick: fromKey(item.key), flags: { perfect: item.kind === "pepe" && !!(P.pepes[item.key] || {}).perfect, failed: item.kind === "failed" } };
}
export function checkDelivery(P, c, item) {
  if (!item) return false;
  if (c.kind === "pillow") {
    if (item.kind !== "pillow") return false;
    const { pick, print } = parsePillowKey(item.key);
    const need = c.need || {};
    if (!PILLOW_CATS.every(k => !(k in need) || specAllows(need[k], pick[k]))) return false;
    if (need.print) {
      if (!print) return false;
      const fl = { perfect: print.kind === "pepe" && !!(P.pepes[print.key] || {}).perfect, failed: print.kind === "failed" };
      return matchPepe(need.print, print.pick, fl);
    }
    return true;
  }
  if (item.kind === "pillow") return false;
  const ip = itemPick(P, item);
  return matchPepe(c.need, ip.pick, ip.flags);
}
export function deliver(P, idx, item) {
  const list = dailyCommissions(P, P.day ? P.day.date : todayStr());
  const c = list[idx];
  if (!c || c.done) return { ok: false, reason: "這張已經完成了" };
  if (!checkDelivery(P, c, item)) return { ok: false, reason: "委託人搖搖頭：好像不是這個" };
  c.done = true;
  P.done++;
  const out = { ok: true, reward: 0, san: null, gain: 0, cured: [], comment: c.comment, events: [], skill: null, line: null };
  if (!isFree(P)) {
    let reward = c.reward;
    // 推銷員：說服成功，賞金多 30%
    if (hasTalent(P, "說服")) { out.skill = skillCheck(P, "說服"); if (out.skill.success) reward = Math.ceil(reward * (1 + NUM.persuadeBonus / 100)); }
    // 小優點「嘴甜」、小缺點「不會講價」（11-08）：多拿或少拿幾靈感，最少拿 1
    const deal = traitSum(P, "deal");
    if (deal) { const before = reward; reward = Math.max(1, reward + deal); out.deal = reward - before; }
    P.insp += reward; out.reward = reward;
    out.san = rollExpr(NUM.commissionSan); out.gain = gainSan(P, out.san.total);
    out.cured = cureByTask(P, "deliver"); // 交了一張委託：治法是這件的怪癖治好（決定 0027；原本只有標「治療委託」的那張才算）
  }
  P.comments.unshift({ who: c.client, text: c.comment, d: P.day ? P.day.date : todayStr(), job: c.text });
  P.comments = P.comments.slice(0, 200);
  if (c.kind === "line" && typeof CLIENT_LINES !== "undefined") {
    const L = CLIENT_LINES[c.line];
    P.lines[c.line] = (P.lines[c.line] || 0) + 1;
    out.line = { id: c.line, step: P.lines[c.line], of: L.steps.length, name: L.name };
    if (P.lines[c.line] >= L.steps.length) {
      out.line.finale = L.finale;
      const cat = catOfOption(L.gift);
      if (cat) out.events.push(...grantOption(P, cat, L.gift, "gift"));
    }
  }
  out.events = out.events.concat(progressEvents(P));
  return out;
}

// ---------- 「壹鍵交件」（翊文 11-08：「可以設計一鍵提交委託嗎，就是把符合的都自動符合的都委託都交上去」） ----------
// 收藏裡的東西。格式跟收藏列一樣（web/src/ui_core.js 的 collectionItems；那邊改了這裡也要改）：
//   佩佩 { kind: "pepe", key, pick, perfect }、失敗作 { kind: "failed", key, pick }、修復品 { kind: "repaired", key, pick }、抱枕 { kind: "pillow", key }
export function ownedItems(P, kind) {
  if (kind === "repaired") return Object.keys(P.repaired || {}).map(key => ({ kind: "repaired", key, pick: fromKey(key) })).filter(i => i.pick);
  if (kind === "pepe") return Object.entries(P.pepes).sort((a, b) => (b[1].s || 0) - (a[1].s || 0)).map(([key, e]) => ({ kind: "pepe", key, pick: fromKey(key), perfect: !!e.perfect })).filter(i => i.pick);
  if (kind === "failed") return Object.keys(P.failed).map(key => ({ kind: "failed", key, pick: fromKey(key) })).filter(i => i.pick);
  return Object.keys(P.pillows).map(key => ({ kind: "pillow", key }));
}
// 一件收藏有多「捨不得交」：回傳 [層, 稀有度, −做過幾個, 做的順序]，越小越先拿去交。
// 交件不會把東西拿走（deliver 只檢查、發賞金），挑最普通的只是讓玩家看了比較安心。
//   層 0：一般的佩佩（不是完美作品、沒有名字）
//   層 1：失敗作
//   層 2：修復品（花靈感修好的失敗作）
//   層 3：有名字的佩佩（融合配方做的，例如「義氣佩佩」）
//   層 4：完美作品（擲出 01 的）。只有它符合時才會用它。
// 同一層裡：
//   1. 稀有度低的先：普通 → 稀有 → 超稀有 → 傳說級稀有 → 不可名狀。
//   2. 做過比較多個的先（重複的比較不心疼）。
//   3. 比較早做的先（P.pepes 的 s 小的先）。
//   都一樣的話照 key 排，所以每次挑的都一樣。
// 抱枕：看印在上面的那一隻算層和稀有度（印完美作品的排最後；沒有印的算層 0、普通），同一層裡做過比較多個的先。
export function keepRank(P, item) {
  const tierOf = (kind, key) => {
    if (kind === "failed") return 1;
    if (kind === "repaired") return 2;
    const e = P.pepes[key] || {};
    return e.perfect ? 4 : e.title ? 3 : 0;
  };
  if (item.kind === "pillow") {
    const { print } = parsePillowKey(item.key);
    if (!print) return [0, 0, -(P.pillows[item.key] || 0), 0];
    return [tierOf(print.kind, print.key), rarityRank(print.pick[ROLLED]), -(P.pillows[item.key] || 0), 0];
  }
  const pick = item.pick || fromKey(item.key) || {};
  const e = item.kind === "pepe" ? P.pepes[item.key] || {} : null;
  const n = e ? e.n || 1 : item.kind === "failed" ? P.failed[item.key] || 1 : (P.repaired || {})[item.key] || 1;
  return [tierOf(item.kind, item.key), rarityRank(pick[ROLLED]), -n, e ? e.s || 0 : 0];
}
// 比兩件的 keepRank：負數 ＝ a 先交
export function rankCmp(P, a, b) {
  const ra = keepRank(P, a), rb = keepRank(P, b);
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}
// 今天還沒完成、收藏裡找得到符合的委託，每張要交哪一件。
// 回傳 [{ idx, id, item, of }]，照委託板的順序：idx 是第幾張（給 deliver）、id 是委託的 id（換天了就對不上，不會交錯張）、
// item 是要交的那件（收藏列的格式）、of 是收藏裡一共有幾件符合。
// 同一件可以交好幾張（交件不會拿走），所以每張各挑各的。
export function autoDeliverables(P) {
  const list = dailyCommissions(P, P.day ? P.day.date : todayStr());
  const pepeLike = ["pepe", "failed", "repaired"].flatMap(k => ownedItems(P, k)); // 收藏列在委託櫃台的四個頁籤
  const pillows = ownedItems(P, "pillow");
  const out = [];
  list.forEach((c, idx) => {
    if (c.done) return;
    const ok = (c.kind === "pillow" ? pillows : pepeLike).filter(it => checkDelivery(P, c, it));
    if (!ok.length) return;
    ok.sort((a, b) => rankCmp(P, a, b));
    out.push({ idx, id: c.id, item: ok[0], of: ok.length });
  });
  return out;
}
// 照 autoDeliverables 的清單一張一張 deliver（說服、治好怪癖、老主顧的故事線都跟手動交一樣，因為是同一個函式）。
// 委託已經換掉（換天了）或交不了的跳過，算在 skipped。
// 回傳 { results: [{ idx, c, item, r }], skipped, reward, gain, cured: [{ quirk, from, to }…], events }
export function deliverAll(P, plan) {
  const out = { results: [], skipped: 0, reward: 0, gain: 0, cured: [], events: [] };
  (plan || []).forEach(p => {
    const list = dailyCommissions(P, P.day ? P.day.date : todayStr());
    const c = list[p.idx];
    if (!c || (p.id && c.id !== p.id)) { out.skipped++; return; }
    const r = deliver(P, p.idx, p.item);
    if (!r.ok) { out.skipped++; return; }
    out.results.push({ idx: p.idx, c, item: p.item, r });
    out.reward += r.reward; out.gain += r.gain;
    out.cured.push(...r.cured);
    out.events.push(...r.events);
  });
  return out;
}

// ---------- 系統 D：圖鑑、徽章、整類全收集 ----------
export function attrIndex(P) {
  const has = {};
  Object.keys(P.pepes).forEach(k => {
    const p = fromKey(k); if (!p) return;
    CATS.forEach(c => { (has[c] = has[c] || {})[p[c]] = true; });
  });
  return has;
}
export function codexCount(P) {
  const s = new Set();
  Object.keys(P.pepes).forEach(k => { const p = fromKey(k); if (p && isBasePick(p)) s.add(coreKey(p)); });
  return s.size;
}
export function badgeEarned(P, id) {
  const keys = Object.keys(P.pepes).map(fromKey).filter(Boolean);
  const all = (cat, fixCat, fixVal) => baseOpts(cat).every(v => keys.some(p => p[cat] === v && (!fixCat || p[fixCat] === fixVal)));
  switch (id) {
    case "first": return keys.length > 0;
    case "fourMoods": return baseOpts("顏色").some(col => all("心情", "顏色", col));
    case "fourColors": return baseOpts("心情").some(m => all("顏色", "心情", m));
    case "hats": return all("帽子");
    case "poses": return all("姿勢");
    case "allFlat": return all("心情", "姿勢", "躺平");
    case "fourLegends": return keys.filter(p => p[ROLLED] === "傳說級稀有").length >= 4;
    case "perfect": return Object.values(P.pepes).some(e => e.perfect);
    case "failed": return Object.keys(P.failed).length > 0;
    case "pillows10": return Object.keys(P.pillows).length >= 10;
    case "commissions10": return P.done >= 10;
    case "curator": return Object.keys(P.themesSeen).length > 0;
    case "mythos": return P.myth >= 10;
    case "hundred": return keys.length >= 100;
    case "firstFusion": return (P.stats.fused || 0) > 0;
    case "mutant": return CATS.some(c => (P.unlocked[c] || []).some(n => (optOf(c, n) || {}).mutant));
    case "recipes3": return Object.keys(P.recipes || {}).length >= 3;
    case "cellar5": return !!(P.cellar && P.cellar.best >= 5);
    case "clientLine": return typeof CLIENT_LINES !== "undefined" && Object.keys(CLIENT_LINES).some(id => (P.lines[id] || 0) >= CLIENT_LINES[id].steps.length);
    default: return false;
  }
}
export function progressEvents(P) {
  const ev = [];
  BADGES.forEach(b => {
    if (!P.badges[b.id] && badgeEarned(P, b.id)) {
      P.badges[b.id] = todayStr();
      if (!isFree(P) && b.insp) P.insp += b.insp;
      ev.push({ type: "badge", id: b.id, name: b.name, insp: isFree(P) ? 0 : b.insp });
    }
  });
  // 圖鑑某一類全收集：+2D6 理智
  const counts = {};
  const cores = new Set();
  Object.keys(P.pepes).forEach(k => { const p = fromKey(k); if (p && isBasePick(p)) cores.add(coreKey(p)); });
  cores.forEach(ck => {
    const v = ck.split("|");
    CORE_CATS.forEach((c, i) => { const id = c + ":" + v[i]; counts[id] = (counts[id] || 0) + 1; });
  });
  CORE_CATS.forEach(c => baseOpts(c).forEach(v => {
    const id = c + ":" + v;
    if (!P.fullRows[id] && counts[id] === BASE_TOTAL / baseOpts(c).length) {
      P.fullRows[id] = todayStr();
      const r = rollExpr(NUM.fullRowSan);
      const gain = isFree(P) ? 0 : gainSan(P, r.total);
      ev.push({ type: "row", cat: c, opt: v, roll: r, gain });
    }
  }));
  // 章節、展品
  allChapters().map(c => c.id).filter(id => id > 1).forEach(id => { if (chapterOpen(P, id) && !P.news["ch" + id]) { P.news["ch" + id] = true; P.news.origin = true; ev.push({ type: "chapter", id }); } });
  EXHIBITS.filter(e => e.unlock).forEach(e => { if (exhibitOpen(P, e) && !P.news["ex" + e.id]) { P.news["ex" + e.id] = true; P.news.gallery = true; ev.push({ type: "exhibit", id: e.id }); } });
  if (typeof sequelEvents === "function") ev.push(...sequelEvents(P)); // 禁書的續集
  return ev;
}

// ---------- 系統 E：展廳 ----------
export function hallItem(P, slot) {
  if (!slot) return null;
  if (slot.kind === "pillow") {
    if (!P.pillows[slot.key]) return null;
    const pp = parsePillowKey(slot.key);
    return { kind: "pillow", key: slot.key, pick: pp.pick, print: pp.print };
  }
  const pick = fromKey(slot.key);
  if (!pick) return null;
  if (slot.kind === "failed") return P.failed[slot.key] ? { kind: "failed", key: slot.key, pick } : null;
  if (slot.kind === "repaired") return P.repaired && P.repaired[slot.key] ? { kind: "repaired", key: slot.key, pick } : null;
  const e = P.pepes[slot.key];
  return e ? { kind: "pepe", key: slot.key, pick, perfect: !!e.perfect } : null;
}
export function attrsOf(it) {
  if (it.kind === "pillow") return it.print ? Object.assign({ failed: it.print.kind === "failed" }, it.print.pick) : null;
  return Object.assign({ failed: it.kind === "failed" }, it.pick);
}
export function hallThemes(items) {
  const at = items.map(attrsOf);
  const n = items.length;
  const allAre = (c, v) => n >= 3 && at.every(a => a && a[c] === v);
  const t = [];
  if (allAre("心情", "生氣")) t.push("angry");
  if (allAre("心情", "傷心")) t.push("tears");
  if (allAre("心情", "開心")) t.push("joy");
  if (allAre("心情", "俄國8+9")) t.push("russia8");
  if (allAre("姿勢", "躺平")) t.push("flat");
  const colors = new Set(at.filter(Boolean).map(a => a.顏色));
  if (n >= 4 && baseOpts("顏色").every(c => colors.has(c))) t.push("rainbow");
  const hats = new Set(at.filter(a => a && a.帽子 !== "沒有").map(a => a.帽子));
  if (n >= 4 && at.every(a => a && a.帽子 !== "沒有") && hats.size >= 3) t.push("hats");
  if (at.filter(a => a && !a.failed && ["傳說級稀有", "不可名狀"].includes(a[ROLLED])).length >= 2) t.push("legend");
  if (items.filter(i => i.kind === "pillow").length >= 3) t.push("pillows");
  if (at.filter(a => a && a.failed).length >= 3) t.push("failed");
  return t.sort((a, b) => (HALL_THEME_BONUS[b] || 0) - (HALL_THEME_BONUS[a] || 0));
}
// 主題展的進度（翊文 11-08：主題要顯示清楚）：每個主題要擺什麼、現在有幾件、要幾件。規則跟 hallThemes 壹樣，改壹邊要改另壹邊
export function themeProgress(items) {
  const at = items.map(attrsOf), n = items.length, ok = new Set(hallThemes(items));
  const cnt = f => at.filter(a => a && f(a)).length;
  const all = (id, c, v) => ({ id, rule: `至少 3 件，全部都是「${v}」`, have: cnt(a => a[c] === v), need: Math.max(3, n) });
  const colors = new Set(at.filter(Boolean).map(a => a.顏色)), base = baseOpts("顏色");
  const hatKinds = new Set(at.filter(a => a && a.帽子 !== "沒有").map(a => a.帽子)).size;
  return [
    all("angry", "心情", "生氣"), all("tears", "心情", "傷心"), all("joy", "心情", "開心"), all("russia8", "心情", "俄國8+9"), all("flat", "姿勢", "躺平"),
    { id: "rainbow", rule: `至少 4 件，${base.join("、")}都有`, have: base.filter(c => colors.has(c)).length, need: base.length },
    { id: "hats", rule: "至少 4 件，每件都戴帽子，帽子至少 3 種", have: cnt(a => a.帽子 !== "沒有"), need: Math.max(4, n), extra: `帽子 ${hatKinds}／3 種` },
    { id: "legend", rule: "至少 2 件傳說級稀有", have: cnt(a => !a.failed && ["傳說級稀有", "不可名狀"].includes(a[ROLLED])), need: 2 },
    { id: "pillows", rule: "至少 3 個抱枕", have: items.filter(i => i.kind === "pillow").length, need: 3 },
    { id: "failed", rule: "至少 3 件失敗作", have: cnt(a => a.failed), need: 3 },
  ].map(t => Object.assign(t, { bonus: HALL_THEME_BONUS[t.id] || 0, ok: ok.has(t.id) }));
}
export function itemPoints(it) {
  const pts = a => a.failed ? HALL_POINTS.failed : (HALL_POINTS[a[ROLLED]] || 4);
  if (it.kind === "repaired") return HALL_POINTS.repaired || 5;
  if (it.kind === "pillow") return HALL_POINTS.pillow + (it.print ? Math.round(pts(attrsOf(it)) * 0.8) : 0);
  return pts(attrsOf(it)) + (it.perfect ? HALL_POINTS.perfect : 0);
}
export function hallScore(P, slots) {
  const items = (slots || P.hall).map(s => hallItem(P, s)).filter(Boolean);
  if (!items.length) return { score: 0, items, themes: [], theme: null };
  const themes = hallThemes(items);
  const at = items.map(attrsOf).filter(Boolean);
  const variety = new Set(at.map(a => a.顏色)).size + new Set(at.map(a => a.心情)).size;
  const sum = items.reduce((s, it) => s + itemPoints(it), 0);
  const theme = themes[0] || null;
  const score = Math.min(100, Math.round(sum + variety + (theme ? HALL_THEME_BONUS[theme] : 0)));
  return { score, items, themes, theme, sum, variety };
}
export function placeInHall(P, slotIdx, item) {
  if (slotIdx < 0 || slotIdx >= P.hall.length) return { ok: false };
  if (!hallItem(P, item)) return { ok: false, reason: "收藏裡沒有這件" };
  P.hall = P.hall.map(s => s && s.kind === item.kind && s.key === item.key ? null : s);
  P.hall[slotIdx] = { kind: item.kind, key: item.key };
  const hs = hallScore(P);
  const ev = [];
  if (hs.theme && !P.themesSeen[hs.theme]) { P.themesSeen[hs.theme] = todayStr(); ev.push({ type: "theme", id: hs.theme }); }
  ev.push(...progressEvents(P));
  return { ok: true, hall: hs, events: ev };
}
export function visitorArrive(P, rng = RNG) {
  const hs = hallScore(P);
  if (!hs.items.length) return null;
  let pool;
  const r = rng();
  if (hs.theme && r < 0.45 && VISITOR_COMMENTS.themes[hs.theme]) pool = VISITOR_COMMENTS.themes[hs.theme];
  else if (r < 0.6 && hs.items.some(i => i.perfect)) pool = VISITOR_COMMENTS.perfect;
  else if (r < 0.7 && hs.items.some(i => { const a = attrsOf(i); return a && (a[ROLLED] === "不可名狀" || a.帽子 === "觸手帽"); })) pool = VISITOR_COMMENTS.eldritch;
  else pool = VISITOR_COMMENTS[hs.score < 35 ? "low" : hs.score < 70 ? "mid" : "high"];
  const c = pickOne(pool, rng);
  const gain = isFree(P) ? 0 : 1 + Math.floor(hs.score / NUM.visitorStep);
  P.insp += gain;
  P.hallVisitors++;
  P.visitorLog.unshift({ who: c.who, text: c.text, gain });
  P.visitorLog = P.visitorLog.slice(0, 12);
  return { who: c.who, text: c.text, gain, score: hs.score };
}
// 分享碼：把展廳變成一串文字
export const KIND_CODE = { pepe: "p", failed: "f", pillow: "l", repaired: "r" };
export function hallCode(P) {
  const items = P.hall.map(s => { const it = hallItem(P, s); return it ? [KIND_CODE[it.kind], it.key, it.perfect ? 1 : 0] : 0; });
  return "PEPEHALL1." + b64e(JSON.stringify({ v: 1, n: P.visitor, i: items }));
}
export function parseHallCode(code) {
  try {
    const s = String(code).trim();
    if (!s.startsWith("PEPEHALL1.")) return null;
    const o = JSON.parse(b64d(s.slice(10)));
    if (!o || !Array.isArray(o.i) || o.i.length > 12) return null;
    const kinds = { p: "pepe", f: "failed", l: "pillow", r: "repaired" };
    const items = o.i.map(x => {
      if (!Array.isArray(x) || !kinds[x[0]] || typeof x[1] !== "string") return null;
      const kind = kinds[x[0]];
      if (kind === "pillow") { const pp = parsePillowKey(x[1]); return { kind, key: x[1], pick: pp.pick, print: pp.print }; }
      const pick = fromKey(x[1]); return pick ? { kind, key: x[1], pick, perfect: !!x[2] } : null;
    });
    return { items };
  } catch (e) { return null; }
}
export function scoreItems(items) {
  const list = items.filter(Boolean);
  if (!list.length) return { score: 0, theme: null, themes: [] };
  const themes = hallThemes(list);
  const at = list.map(attrsOf).filter(Boolean);
  const variety = new Set(at.map(a => a.顏色)).size + new Set(at.map(a => a.心情)).size;
  const sum = list.reduce((s, it) => s + itemPoints(it), 0);
  const theme = themes[0] || null;
  return { score: Math.min(100, Math.round(sum + variety + (theme ? HALL_THEME_BONUS[theme] : 0))), theme, themes };
}

// ---------- 結局（系統 H） ----------
export function endingDue(P) {
  if (!isFree(P) && P.sanity <= 0) return "russia8";
  if (!P.endings.curator && codexCount(P) >= BASE_TOTAL) return "curator";
  if (!P.endings.museum && hallScore(P).score >= 100) return "museum";
  return null;
}

// ---------- 存檔 ----------
export const SAVE_KEY = "pepeMuseum3";
export const SAVE_KEY_ADV = "pepeMuseumAdv";
export const IMG_KEY = "pepeMuseum2.img";
export const FIT_KEY = "pepeMuseum2.fit";
export const GEN2_KEY = "pepeMuseum2";
export const SAVE_VERSION = 3;
// dayMin：以前是「遊戲裡一天玩幾分鐘」（0 ＝ 真實的一天）。11-09 起一律真實的一天（決定 0019），欄位留著、固定 0，不再用
export function newSave() {
  return { v: SAVE_VERSION, current: null, profiles: { challenge: null, free: null },
    settings: { font: "m", reduceMotion: false, motionOffDone: true, muted: false, dayMin: 0, holidayLook: true }, tutorialDone: false, gen2Migrated: false,
    signin: newSignin() }; // holidayLook：節日那天換一下外觀（設定可以關，決定 0030）；signin：每日簽到，帳號的（shared/signin.js）
}
// 舊名字換新名字（RENAMED）：key 是用「|」接起來的選項
// 文字裡有沒有舊名字。新名字可能包含舊名字（俄國8+9 裡面就有俄國8），要先拿掉新名字再找，不然每次載入都會當成舊存檔
export const hasOldName = s => typeof RENAMED !== "undefined" && Object.entries(RENAMED).some(([a, b]) => String(s).split(b).join("").includes(a));
export const renameVal = v => (typeof RENAMED !== "undefined" && RENAMED[v]) || v;
export const renameKey = k => String(k).split("|").map(renameVal).join("|");
export function renameMap(o) { const out = {}; Object.entries(o || {}).forEach(([k, v]) => { out[renameKey(k)] = v; }); return out; }
// 進階版的 key 只有五類：補成第 3 版的七類
export function normKey(k) { const p = fromKey(renameKey(k)); return p ? pepeKey(p) : String(k); }
export function normPillowKey(k) {
  const v = String(renameKey(k)).split("|");
  const base = v.slice(0, PILLOW_CATS.length).join("|");
  const ref = v.slice(PILLOW_CATS.length).join("|");
  if (!ref) return base + "|";
  return base + "|" + ref.slice(0, 2) + normKey(ref.slice(2));
}
export function normMap(o, f) { const out = {}; Object.entries(o || {}).forEach(([k, v]) => { const nk = f(k); out[nk] = typeof v === "number" && typeof out[nk] === "number" ? out[nk] + v : v; }); return out; }
export function fixProfile(P, mode) {
  const base = newProfile(mode);
  const out = Object.assign(base, P || {});
  out.mode = mode;
  if (hasOldName(JSON.stringify(P || {}))) {
    out.pepes = renameMap(out.pepes); out.failed = renameMap(out.failed); out.pillows = renameMap(out.pillows);
    Object.keys(out.unlocked || {}).forEach(c => { out.unlocked[c] = asList(out.unlocked[c]).map(renameVal); });
    out.hall = (out.hall || []).map(s => s && Object.assign({}, s, { key: renameKey(s.key) }));
    out.quirks = (out.quirks || []).map(q => Object.assign({}, q, { opt: q.opt && renameVal(q.opt) }));
    if (out.bout && out.bout.opt) out.bout.opt = renameVal(out.bout.opt);
    Object.keys(out.wsPick || {}).forEach(c => { out.wsPick[c] = renameVal(out.wsPick[c]); });
    if (out.plPrint) out.plPrint = renameKey(out.plPrint);
    if (hasOldName(JSON.stringify(out.daily || null))) out.daily = null; // 委託本身寫著舊名字才重抽（交不出來）；不然交過的會變成沒交過（翊文 11-09）
  }
  CATS.forEach(c => {
    out.unlocked[c] = asList(out.unlocked[c]).filter(n => optOf(c, n));
    if (!out.unlocked[c].length) out.unlocked[c] = base.unlocked[c].slice();
    baseOpts(c).filter(n => optOf(c, n).start).forEach(n => { if (!out.unlocked[c].includes(n)) out.unlocked[c].push(n); });
    sortUnlocked(out, c);
  });
  ["pepes", "failed", "pillows", "seen", "chaptersRead", "mythFrom", "badges", "themesSeen", "endings", "fullRows", "news",
    "keys", "upgrades", "recipes", "repaired", "injured", "skillTicks", "lines", "giftsIn", "understood", "fresh", "visit"].forEach(k => { if (!out[k] || typeof out[k] !== "object" || Array.isArray(out[k])) out[k] = {}; });
  ["quirks", "comments", "visitorLog", "hugDays", "history", "relics"].forEach(k => { if (!Array.isArray(out[k])) out[k] = []; });
  out.quirks = fixQuirks(out.quirks); // 怪癖 7 天後自己消失（決定 0046，原本 20 分鐘）：舊存檔沒有 until 的怪癖從載入這一刻起算；不在場的參觀者在 fixVisitors 裡補
  fixLegacy(out, !!(P && P.visit && typeof P.visit === "object" && !Array.isArray(P.visit))); // 參觀者一位接一位（11-08）：舊存檔補 P.visit 這些
  fixVisitors(out, P); // 多位參觀者（11-08）：舊存檔的這一位變成第一個位子
  // 第 3 版：key 補成七類
  out.pepes = normMap(out.pepes, normKey); out.failed = normMap(out.failed, normKey); out.repaired = normMap(out.repaired, normKey);
  out.pillows = normMap(out.pillows, normPillowKey); out.injured = normMap(out.injured, normKey);
  const n = hallSize(out);
  out.hall = Array.from({ length: n }, (_, i) => { const s = (out.hall || [])[i]; return s ? Object.assign({}, s, { key: s.kind === "pillow" ? normPillowKey(s.key) : normKey(s.key) }) : null; });
  if (out.plPrint) out.plPrint = out.plPrint.slice(0, 2) + normKey(out.plPrint.slice(2));
  if (!out.cellar || typeof out.cellar !== "object") out.cellar = { best: 0, cleared: {}, run: null };
  out.cellar = Object.assign({ best: 0, cleared: {}, won: {}, floorsDone: {}, run: null }, out.cellar);
  if (out.daily && out.daily.list && out.daily.list.some(c => c.need && Object.keys(c.need).some(k => !CATS.includes(k) && !PILLOW_CATS.includes(k) && !["print", "perfect", "failed"].includes(k)))) out.daily = null;
  out.stats = Object.assign(base.stats, out.stats || {});
  out.wsPick = Object.assign({}, DEFAULT_PICK, out.wsPick || {});
  out.limited = fixLimited(out.limited); // 簽到限定的東西（11-09，決定 0030）
  fixShop(out); // 兌換所（11-09，決定 0032）：舊存檔沒有裝備；放在 fixVisitors 後面（不在場的那幾位也要補）
  out.themeShow = fixShow(out.themeShow); // 主題展（11-09，決定 0035）：舊存檔沒有就是空的
  if (mode === "free") { partOf("帽子").options.filter(o => o.limited).forEach(o => { if (!out.unlocked.帽子.includes(o.name)) out.unlocked.帽子.push(o.name); }); sortUnlocked(out, "帽子"); } // 自由模式什麼都打開了：舊的自由模式存檔也有新的限定帽子
  return out;
}
export function migrateSave(o) {
  if (!o || typeof o !== "object") return newSave();
  const s = Object.assign(newSave(), o);
  s.settings = Object.assign(newSave().settings, o.settings || {});
  s.settings.dayMin = 0; // 舊存檔的 15／30／60 不用了（11-09）。改成 0：還沒更新的舊畫面讀到，也是照真的日期，不會又跑到好幾天後
  // 動畫減量預設關（翊文 11-09：「動畫減量預設都要關閉，所有人」）：舊存檔統一關一次；之後自己再打開就照自己的
  if (!(o.settings && o.settings.motionOffDone)) s.settings.reduceMotion = false;
  s.settings.motionOffDone = true;
  s.profiles = Object.assign({ challenge: null, free: null }, o.profiles || {});
  ["challenge", "free"].forEach(m => { if (s.profiles[m]) s.profiles[m] = fixProfile(s.profiles[m], m); });
  s.signin = fixSignin(o.signin); // 每日簽到（11-09，決定 0030）：舊存檔沒有就是空的
  s.v = SAVE_VERSION;
  return s;
}
// 第 2 代的收藏自動搬進來（第 2 代什麼都能直接選，所以搬進自由模式）
export function migrateGen2(save, gen2) {
  if (save.gen2Migrated || !gen2 || !Array.isArray(gen2.pepe)) return 0;
  save.gen2Migrated = true;
  const P = save.profiles.free || (save.profiles.free = newProfile("free"));
  let n = 0;
  gen2.pepe.map(normKey).forEach(k => { const p = fromKey(k); if (p && !P.pepes[k]) { P.pepes[k] = { n: 1, perfect: false, s: ++P.serial, d: todayStr(), gen2: true }; n++; } });
  asList(gen2.pillow).forEach(k => {
    const v = String(k).split("|");
    if (v.length === PILLOW_CATS.length) { const key = v.join("|") + "|"; if (!P.pillows[key]) { P.pillows[key] = 1; n++; } }
  });
  return n;
}
export function exportCode(save) { return "PEPESAVE1." + b64e(JSON.stringify(save)); }
export function importCode(code) {
  try {
    const s = String(code).trim();
    if (!s.startsWith("PEPESAVE1.")) return null;
    const o = JSON.parse(b64d(s.slice(10)));
    if (!o || typeof o !== "object" || !o.profiles) return null;
    return migrateSave(o);
  } catch (e) { return null; }
}

// ---------- 說明文字標重點（翊文 11-09：「這些說明文字最好也有粗體或顏色差別來標示重點」） ----------
// 寫的人可以用 **重點** 指定；其他自動標：獎勵（綠）、扣的（紅）、「短的名字」、樓層、數量、時間。只用在說明文字，書和劇情不用。
// 回傳 [{ t: 字, k: 種類 }]，k 是 em（金色粗體）、good（綠）、bad（紅）或 null（照常）
const MARK_RE = /\*\*(.+?)\*\*|((?:靈感|心情|理智|週章|籌碼)\s*[+＋]\s*[\d.,]+\s*[萬億]?)|((?:靈感|心情|理智|籌碼)\s*[-−－]\s*[\d.,]+)|(「[^「」\n]{1,12}」)|(\bB[1-5]\b)|(\d{1,2}:\d{2}(?:[～~-]\d{1,2}:\d{2})?)|(\d[\d.,]*\s*(?:隻佩佩|隻|趟|包|枚|次|張|天|位|人|萬|億|分鐘|小時|秒|%))/g;
export function markTokens(text) {
  const s = String(text == null ? "" : text), out = [];
  let at = 0;
  for (const m of s.matchAll(MARK_RE)) {
    if (m.index > at) out.push({ t: s.slice(at, m.index), k: null });
    if (m[1] != null) out.push({ t: m[1], k: "em" });
    else if (m[2] != null) out.push({ t: m[0], k: "good" });
    else if (m[3] != null) out.push({ t: m[0], k: "bad" });
    else out.push({ t: m[0], k: "em" });
    at = m.index + m[0].length;
  }
  if (at < s.length) out.push({ t: s.slice(at), k: null });
  return out;
}
