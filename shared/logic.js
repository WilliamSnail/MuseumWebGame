// ================================================================
//  以下是程式（一般不用改）。遊戲規則：不碰畫面，方便測試。
// ================================================================

// ---------- 小工具 ----------
// ---------- 第 4 版：從別的檔拿的（從第 3 版轉成模組時自動產生；之後新增用到的名字就手動加） ----------
import { BADGES, EXHIBITS, HALL_POINTS, HALL_THEME_BONUS, NUM, ORIGIN, PEPE_PARTS, PILLOW_PARTS, RARITY_TABLE, RENAMED, UPGRADES } from "./config.js";
import { CLIENTS, CLIENT_COMMENTS, COMMISSION_POOL, NEW_EXHIBITS, QUIRK_TEXT, STORY_CHAPTERS, VISITOR_COMMENTS } from "./content.js";
import { CHAPTER4, CLIENT_LINES, MORE_CHAPTERS } from "./content3.js";
import { hallSize, hasTalent, hasUp, sequelEvents, skillCheck } from "./logic3.js";
import { fixLegacy, leaveLegacy, newVisit, rollCandidates, traitSum, visitorRecord } from "./legacy.js";
import { fixVisitors, freshDayVis, hasSlots, takeVisitorNo } from "./visitors.js";

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
// ---------- 遊戲裡的壹天（翊文 11-08：「壹天改成每 15 分鐘」） ----------
// 畫面那邊用 setDayClock 設定「今天」是遊戲裡的哪壹天；沒設定（測試、真實日期模式）就用電腦的日期
export let DAY_CLOCK = null;
export function setDayClock(fn) { DAY_CLOCK = fn || null; }
export function realTodayStr(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`; }
export function todayStr(d) {
  if (!d && DAY_CLOCK) { const s = DAY_CLOCK(); if (s) return s; }
  return realTodayStr(d || new Date());
}
export function daysBetween(a, b) { const f = s => { const [y, m, d] = String(s).split("-").map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((f(b) - f(a)) / 86400000); }
// 第幾天：mins ＞ 0 ＝ 玩了幾個「mins 分鐘」（只算真的在玩的時間）；mins ＝ 0 ＝ 真實日期，從建立這位參觀者那天算起
export function gameDayNo(P, mins) {
  if (mins > 0) return 1 + Math.floor((P.activeSec || 0) / (mins * 60));
  return 1 + Math.max(0, daysBetween(P.created || realTodayStr(), realTodayStr()));
}
// 遊戲裡第 N 天的日期字串：建立參觀者那天＋N−1 天（壹定往後走，規則裡比日期先後的地方都對）
export function gameDateStr(P, mins) { return addDays(P.created || realTodayStr(), gameDayNo(P, mins) - 1); }
// 離下壹天還有幾秒（只算在玩的時間）
export function secToNextDay(P, mins) { return mins > 0 ? mins * 60 - ((P.activeSec || 0) % (mins * 60)) : null; }
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return todayStr(new Date(y, m - 1, d + n));
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
export const isSpecialOpt = o => !!(o && (o.forbidden || o.mutant || o.gift));
export const baseOpts = cat => partOf(cat).options.filter(o => !isSpecialOpt(o)).map(o => o.name);
export function catOfOption(name) { const p = PEPE_PARTS.find(pp => pp.options.some(o => o.name === name)); return p ? p.name : null; }
export const CORE_TOTAL = CORE_CATS.reduce((n, c) => n * baseOpts(c).length, 1); // 圖鑑的格數
export const BASE_TOTAL = CORE_TOTAL;
export const ALL_TOTAL = CATS.reduce((n, c) => n * allOpts(c).length, 1);
export const PILLOW_TOTAL = PILLOW_PARTS.reduce((n, p) => n * p.options.length, 1);
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
  let idx = 0;
  for (const c of CORE_CATS) { const list = allOpts(c); idx = idx * list.length + Math.max(0, list.indexOf(pick[c])); }
  const forb = CORE_CATS.some(c => (optOf(c, pick[c]) || {}).forbidden);
  return (forb ? "禁" : "異") + " No. " + pad(idx + 1);
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
    day: null, hugDays: [], badges: {}, done: 0, comments: [],
    daily: null, quirks: [], bout: null, swapNext: false, dark: false,
    hall: [null, null, null, null, null, null], hallVisitors: 0, visitorLog: [], themesSeen: {},
    endings: {}, fullRows: {}, news: { gallery: true },
    wsPick: Object.assign({}, DEFAULT_PICK), plPick: { 尺寸: "標準", 材質: "棉布", 填充: "剛剛好" }, plPrint: "",
    stats: { made: 0, rolls: 0, pushes: 0, legends: 0, perfects: 0, fused: 0 }, activeSec: 0,
    // 第 3 版
    keys: free ? { bg: true, hold: true, book4: true } : {}, upgrades: free ? Object.fromEntries(UPGRADES.map(u => [u.id, true])) : {},
    recipes: {}, repaired: {}, injured: {}, job: null, skills: null, skillTicks: {}, history: [],
    cellar: { best: 0, cleared: {}, won: {}, floorsDone: {}, run: null }, lines: {}, weekly: null, giftsIn: {},
    // 第 4 版（11-08 翊文）：新解開的東西在哪個房間、看過了沒（shared/fresh.js）
    fresh: {},
    // 第 4 版（11-08 翊文）：參觀者一位接一位（shared/legacy.js）：這一位的小優缺點、還沒挑的候選人、前一位留下的、遺物櫃、這一位自己的統計
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
  const firstEver = !P.day;
  P.day = { date, startSan: P.sanity, lost: 0, exLoss: {}, reviews: {}, views: {}, moodFx: {}, hugs: {}, mini: {}, diff: {}, quirkGiven: false,
    fusions: 0, pairs: {}, rerolls: 0, hints: {} };
  // 地下收藏庫受的傷，時間到了自己好
  Object.keys(P.injured || {}).forEach(k => { if (P.injured[k] <= date) delete P.injured[k]; });
  return { firstEver };
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
export function blockedSet(P) {
  const b = {};
  const add = (c, n) => { (b[c] = b[c] || new Set()).add(n); };
  P.quirks.filter(q => q.type === "phobia").forEach(q => {
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
export function maniaQuirk(P) { return P.quirks.find(q => q.type === "mania"); }
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
// 不定性瘋狂：得到一個長期怪癖
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
  const used = new Set(P.quirks.map(q => q.type + q.cat + q.opt));
  const left = cands.filter(q => !used.has(type + q.cat + q.opt));
  if (!left.length) return null;
  const before = possibilities(P);
  const q = Object.assign({ type, since: todayStr() }, pickOne(left));
  P.quirks.push(q);
  if (P.daily) { const c = P.daily.list.find(x => !x.done); if (c && !P.daily.list.some(x => x.cure && !x.done)) c.cure = true; }
  return { quirk: q, from: before, to: possibilities(P) };
}
export function quirkName(q) {
  const x = q.opt ? (q.cat === "顏色" ? q.opt + "色" : q.opt) : q.cat;
  return fill(QUIRK_TEXT[q.type].name, x);
}
export function cureQuirk(P) {
  if (!P.quirks.length) return null;
  const before = possibilities(P);
  const q = P.quirks.shift();
  return { quirk: q, from: before, to: possibilities(P) };
}
// 半價：花「掉的理智 ×2」的心情，把這次掉的理智減半（理智檢定本身不能花心情）
export const halveCost = loss => loss * 2;
export const halved = loss => Math.ceil(loss / 2);
// 理智 0：俄國8+9 的房間，然後換下一位參觀者（圖鑑、收藏、展廳都留著）
// 第 4 版（11-08 翊文，roguelike 的繼承，規則在 shared/legacy.js）：
//   leave ＝這一位留給下一位的東西：{ type: "relic", item: { kind, key } }、{ type: "skill" }，或 null（A）
//   這一位的紀錄多記了優缺點、做了幾隻、地下走到第幾層、看懂幾件、留了什麼（D）
//   新的一位先不選職業：P.cands 放 3 位候選人，畫面那邊用 chooseCandidate 挑（C）
// 回傳心情的骰子（跟以前一樣），另外帶 entry（這一位的紀錄）、left（留給下一位的）、cands（候選人）
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
  // 同一個位子換人（visitors.js）：新的編號、還沒取名字；連續抱抱枕、怪事的旁白是這一位的，重來
  if (hasSlots(P)) { P.vid = "v" + P.visitor; P.vname = null; }
  P.hugDays = []; P.oddSeen = {};
  P.perk = null; P.flaw = null; P.legacy = left;
  P.visit = newVisit(P);
  P.cands = rollCandidates(P);
  return Object.assign(r, { entry, left, cands: P.cands });
}

// ---------- 畫廊、起源室 ----------
export function exhibitById(id) {
  const ex = EXHIBITS.find(e => e.id === id);
  if (!ex) return null;
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
  const out = { first, insp: 0, mood: 0, myth: 0, san: null, events: [] };
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
  return { ok: true, cost };
}
export function makePillow(P, pick, print) {
  const can = canMakePillow(P, pick, print);
  if (!can.ok) return can;
  P.insp -= can.cost;
  // 小優點「手巧」（11-08）：有 N% 不花靈感
  const lucky = can.cost > 0 && traitSum(P, "pillowFree") > 0 && RNG() * 100 < traitSum(P, "pillowFree");
  if (lucky) P.insp += can.cost;
  const key = pillowKeyOf(pick, print);
  const isNew = !P.pillows[key];
  P.pillows[key] = (P.pillows[key] || 0) + 1;
  return { ok: true, key, isNew, free: lucky, events: progressEvents(P) };
}
export function hug(P, key) {
  if (isFree(P)) return { ok: true, gain: 0, free: true };
  if (P.day.hugs[key]) return { ok: false, already: true };
  P.day.hugs[key] = true;
  const { print } = parsePillowKey(key);
  const happy = print && print.pick.心情 === "開心";
  const roll = rollExpr(happy ? NUM.hugHappy : NUM.hug);
  const gain = gainSan(P, roll.total);
  const today = P.day.date;
  if (!P.hugDays.includes(today)) P.hugDays.push(today);
  P.hugDays = P.hugDays.slice(-7);
  let cured = null;
  if (P.quirks.length) {
    let streak = 1;
    while (P.hugDays.includes(addDays(today, -streak))) streak++;
    if (streak >= NUM.quirkCureDays) { cured = cureQuirk(P); P.hugDays = []; }
  }
  return { ok: true, roll, gain, happy, cured };
}
// 連續幾天有抱抱枕（今天還沒抱就從昨天算）
export function hugStreak(P) {
  if (!P.day) return 0;
  const t = P.day.date, from = P.hugDays.includes(t) ? 0 : 1;
  let s = 0;
  while (P.hugDays.includes(addDays(t, -(from + s)))) s++;
  return s;
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
  if (P.quirks.length) list[0].cure = true;
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
  const out = { ok: true, reward: 0, san: null, gain: 0, cured: null, comment: c.comment, events: [], skill: null, line: null };
  if (!isFree(P)) {
    let reward = c.reward;
    // 推銷員：說服成功，賞金多 30%
    if (hasTalent(P, "說服")) { out.skill = skillCheck(P, "說服"); if (out.skill.success) reward = Math.ceil(reward * (1 + NUM.persuadeBonus / 100)); }
    // 小優點「嘴甜」、小缺點「不會講價」（11-08）：多拿或少拿幾靈感，最少拿 1
    const deal = traitSum(P, "deal");
    if (deal) { const before = reward; reward = Math.max(1, reward + deal); out.deal = reward - before; }
    P.insp += reward; out.reward = reward;
    out.san = rollExpr(NUM.commissionSan); out.gain = gainSan(P, out.san.total);
    if (c.cure) out.cured = cureQuirk(P);
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
// 回傳 { results: [{ idx, c, item, r }], skipped, reward, gain, cured: [r.cured…], events }
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
    if (r.cured) out.cured.push(r.cured);
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
export function newSave() {
  return { v: SAVE_VERSION, current: null, profiles: { challenge: null, free: null },
    settings: { font: "m", reduceMotion: false, muted: false, dayMin: 15 }, tutorialDone: false, gen2Migrated: false }; // dayMin：遊戲裡壹天幾分鐘（0 ＝ 真實的壹天）
}
// 舊名字換新名字（RENAMED）：key 是用「|」接起來的選項
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
  if (typeof RENAMED !== "undefined" && Object.keys(RENAMED).some(n => JSON.stringify(P || {}).includes(n))) {
    out.pepes = renameMap(out.pepes); out.failed = renameMap(out.failed); out.pillows = renameMap(out.pillows);
    Object.keys(out.unlocked || {}).forEach(c => { out.unlocked[c] = asList(out.unlocked[c]).map(renameVal); });
    out.hall = (out.hall || []).map(s => s && Object.assign({}, s, { key: renameKey(s.key) }));
    out.quirks = (out.quirks || []).map(q => Object.assign({}, q, { opt: q.opt && renameVal(q.opt) }));
    if (out.bout && out.bout.opt) out.bout.opt = renameVal(out.bout.opt);
    Object.keys(out.wsPick || {}).forEach(c => { out.wsPick[c] = renameVal(out.wsPick[c]); });
    if (out.plPrint) out.plPrint = renameKey(out.plPrint);
    out.daily = null;
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
  return out;
}
export function migrateSave(o) {
  if (!o || typeof o !== "object") return newSave();
  const s = Object.assign(newSave(), o);
  s.settings = Object.assign(newSave().settings, o.settings || {});
  s.profiles = Object.assign({ challenge: null, free: null }, o.profiles || {});
  ["challenge", "free"].forEach(m => { if (s.profiles[m]) s.profiles[m] = fixProfile(s.profiles[m], m); });
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
