// ================================================================
//  logic.js 的底層：日期、骰子、收藏鍵、解鎖、委託、特質、裝備、展廳分數……
//  logic.js、systems.js（原 logic3.js）、legacy.js、shop.js、story.js 等檔互相要用的小工具和資料都放在這裡，
//  這個檔不 import 它們（只往下拿 config.js、content.js、systems_text.js），所以 shared/ 裡的 import 不繞圈。
//  搬自原本的 logic.js（主要）、systems.js（續集、工坊升級判斷、地下室樓層、週次）、legacy.js（特質）、shop.js（裝備存檔）。
//  這次只搬位置，函式內容沒有改；web 和 functions 還是從 logic.js 拿（logic.js 會再匯出這裡的東西）。
// ================================================================
import { BADGES, EXHIBITS, FLAWS, GEAR_ITEMS, HALL_POINTS, HALL_THEME_BONUS, LIMITED_FX, NUM, PEPE_PARTS, PERKS, PILLOW_PARTS, RARITY_TABLE, RENAMED } from "./config.js";
import { CLIENTS, CLIENT_COMMENTS, COMMISSION_POOL, NEW_EXHIBITS, STORY_CHAPTERS } from "./content.js";
import { BOOK_SEQUELS, CELLAR, CHAPTER4, CLIENT_LINES, MORE_CHAPTERS } from "./systems_text.js";
import { holidayExhibitById, holidaysOn } from "./story/holidays.js";

// ---------- 小工具 ----------
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
export function daysBetween(a, b) { const f = s => { const [y, m, d] = String(s).split("-").map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((f(b) - f(a)) / 86400000); }
// "YYYY-MM-DD" 往後 n 天（用 UTC 算，不受電腦的時區影響）
export function addDays(dateStr, n) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
// "YYYY-MM-DD" 往後 n 天，回「MM-DD」給畫面顯示；日期空的、格式不對、n 不是數字，回「—」，不丟錯（銀行頁用：壹筆壞資料不能讓整頁壞掉）
export function mdShift(dateStr, n = 0) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr == null ? "" : dateStr)), k = Number(n);
  if (!m || !Number.isFinite(k)) return "—";
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3] + k);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(5, 10) : "—";
}
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
export const isSpecialOpt = o => !!(o && (o.forbidden || o.mutant || o.gift || o.limited || o.mix)); // limited：簽到限定（11-09，決定 0030）、兌換所限定（決定 0032）；mix：融合室調色盤（11-10）
export const baseOpts = cat => partOf(cat).options.filter(o => !isSpecialOpt(o)).map(o => o.name);
export function catOfOption(name) { const p = PEPE_PARTS.find(pp => pp.options.some(o => o.name === name)); return p ? p.name : null; }
export const CORE_TOTAL = CORE_CATS.reduce((n, c) => n * baseOpts(c).length, 1); // 圖鑑的格數
export const BASE_TOTAL = CORE_TOTAL;
export const PILLOW_TOTAL = PILLOW_PARTS.reduce((n, p) => n * p.options.filter(o => !o.limited).length, 1); // 簽到限定的材料（星光絨）不算進去（決定 0030）
export const RARITY_ORDER = allOpts(ROLLED);
export const FAILED = "失敗作";
export const rarityRank = r => r === FAILED ? -1 : RARITY_ORDER.indexOf(r);
export const DEFAULT_PICK = Object.fromEntries(CATS.map(c => [c, baseOpts(c)[0]]));

export const pepeKey = pick => CATS.map(c => pick[c] ?? DEFAULT_PICK[c]).join("|");
export const coreKey = pick => CORE_CATS.map(c => pick[c]).join("|");
// 限定帽子在館內（地下以外）的效果（決定 0085）：看館友證頭像那隻佩佩戴的帽子（P.avatar）。沒頭像、沒戴限定帽子回 {}。都是玩家自己存檔裡的東西（心情、理智、靈感），沒有新的籌碼來源
export function limitedHome(P) {
  if (!P || typeof P.avatar !== "string" || !P.avatar) return {};
  let pick; try { pick = fromKey(P.avatar); } catch (e) { return {}; }
  const f = pick && LIMITED_FX[pick.帽子]; return (f && f.home) || {};
}
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
export function codexIndex(pick) {
  let idx = 0;
  for (const c of CORE_CATS) {
    const list = baseOpts(c), i = list.indexOf(pick[c]);
    if (i < 0) return -1;
    idx = idx * list.length + i;
  }
  return idx;
}
export function catalogNo(pick) {
  const i = codexIndex(pick);
  if (i >= 0) return "No. " + pad(i + 1);
  // 限定的選項（簽到拿的帽子，決定 0030）另外編號「限 No.」，不改到原本「異 No.」「禁 No.」的號碼
  // 主題展、每週特展的（決定 0035）再另外編「展 No.」，不改到簽到那幾頂的號碼
  const lateOf = (c, v) => { const l = (optOf(c, v) || {}).limited; return l === "show" || l === "week"; };
  const lim = CORE_CATS.some(c => (optOf(c, pick[c]) || {}).limited), late = CORE_CATS.some(c => lateOf(c, pick[c]));
  // 調色盤的顏色（11-10）再另外編「調 No.」：別的編號算的時候都不把調色的顏色算進去，舊的號碼才不會變
  const mixed = CORE_CATS.some(c => (optOf(c, pick[c]) || {}).mix), noMix = (c, n) => !optOf(c, n).mix;
  let idx = 0;
  for (const c of CORE_CATS) { const list = mixed ? allOpts(c) : (late ? allOpts(c) : lim ? allOpts(c).filter(n => !lateOf(c, n)) : allOpts(c).filter(n => !optOf(c, n).limited)).filter(n => noMix(c, n)); idx = idx * list.length + Math.max(0, list.indexOf(pick[c])); }
  const forb = CORE_CATS.some(c => (optOf(c, pick[c]) || {}).forbidden);
  return (mixed ? "調" : late ? "展" : lim ? "限" : forb ? "禁" : "異") + " No. " + pad(idx + 1);
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

// ---------- 存檔的一位參觀者（挑戰模式、自由模式各一份） ----------
export const isFree = P => P.mode === "free";
export const maxSan = P => 99 - P.myth;

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
  if (o.mix) return { state: "mutant", text: "要在融合室用兩種顏色調出來（融合室有調色盤）" };
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
export function possibilities(P) { return CATS.reduce((n, c) => n * usable(P, c).length, 1); }

// ---------- 系統 B：做佩佩、擲稀有度 ----------
// 沒選的裝飾類別當作「沒有」
export const fullPick = pick => Object.assign({}, ...DECO_CATS.map(c => ({ [c]: DEFAULT_PICK[c] })), pick);
// 不可名狀：原本擲出 01～這個數字才會出現（翊文 11-13：「要放寬」）。神話 10 是 01～02，之後每多 5 點寬壹格，最寬 01～05；神話不夠是 0
export function eldritchUpTo(P) {
  const eld = PEPE_PARTS.find(p => p.name === ROLLED).options.find(o => o.forbidden), E = NUM.eldritchRoll;
  if (!eld || !P || (P.myth || 0) < eld.myth) return 0;
  return Math.min(E.max, E.base + Math.floor(((P.myth || 0) - eld.myth) / E.perMyth));
}
export function rarityOfRoll(P, total, natural) {
  if (natural >= NUM.fumbleFrom) return { rarity: FAILED, failed: true };
  let r = (RARITY_TABLE.find(t => total <= t.max) || RARITY_TABLE[RARITY_TABLE.length - 1]).name;
  const eld = PEPE_PARTS.find(p => p.name === ROLLED).options.find(o => o.forbidden);
  if (eld && natural <= eldritchUpTo(P) && isUnlocked(P, ROLLED, eld.name)) r = eld.name;
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
export function understandTarget(P) { return Math.min(99, NUM.understandBase + P.myth + traitSum(P, "understand")); } // 小缺點「怕黑」+10（11-08）
export function understandCheck(P) {
  const target = understandTarget(P);
  const roll = rollD100();
  return { roll, target, success: roll.total <= target };
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
// 治療的事有三種（文字在 systems_text.js 的 QUIRK_TASK_TEXT）：
//   hug      抱一次抱枕：hug() 抱成功
//   deliver  交一張委託：deliver() 交成功（一鍵交件也算，因為它也是一張一張 deliver）
//   calm     看一幅不可怕的畫：viewExhibit() 看了不用理智檢定的畫（ex.san 沒寫的）
// 要加一種：這裡加名字、quirkTaskOk 加「現在做不做得到」、那個動作的函式叫 cureByTask、QUIRK_TASK_TEXT 加文字、test/content/check3.cjs 加 key
export const QUIRK_TASKS = ["hug", "deliver", "calm"];
export const quirkDaysOf = type => (type === "mania" ? NUM.quirkManiaDays : NUM.quirkDays); // 狂熱比較短（翊文 11-09：「狂熱縮成三天」）
export const quirkSpan = type => quirkDaysOf(type) * DAY_MS;
// 還沒過期（沒有 until 的當成還沒過期：測試、舊存檔在 fixQuirks 補上之前）
export const quirkLive = (q, now = nowMs()) => !!q && !(typeof q.until === "number" && q.until <= now);
export const activeQuirks = (P, now = nowMs()) => asList(P && P.quirks).filter(q => quirkLive(q, now));
// 做事情的進度：做到過的遊戲日（不重複的日期字串）、還要幾個不同的日子、今天做過了沒
export const quirkDoneDays = q => [...new Set(asList(q && q.done).filter(s => typeof s === "string"))];
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
// 舊存檔補欄位（fixProfile、visitors.js 的 fixPack 叫）：
//   - 沒有 until（11-09 以前的怪癖）：從載入那一刻起算 NUM.quirkDays 天；已經有 until 的（20 分鐘版）照舊，不延長
//   - until 比「現在＋這種怪癖的天數」還晚（電腦時鐘被往回調過；或狂熱縮短之前得到的）：拉回來
//   - 沒有 done（決定 0046 以前）：當 0 個日子；有的只留不重複的日期字串
//   - 沒有 task：補「交一張委託」（原本的治法是交「治療委託」，最接近）；task 是 null（得到時都做不到）就留著 null
export function fixQuirks(list, now = nowMs()) {
  return asList(list).filter(q => q && typeof q === "object" && !Array.isArray(q)).map(q => {
    const out = Object.assign({}, q);
    if (typeof out.until !== "number" || !Number.isFinite(out.until) || out.until > now + quirkSpan(out.type)) out.until = now + quirkSpan(out.type); // 已經得到的狂熱，也會拉回 3 天
    if (out.task !== null && !QUIRK_TASKS.includes(out.task)) out.task = "deliver";
    out.done = [...new Set(asList(out.done).filter(s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)))].slice(0, 20);
    return out;
  });
}

// ---------- 畫廊、圖書館 ----------
export function exhibitById(id) {
  const ex = EXHIBITS.find(e => e.id === id);
  if (!ex) return holidayExhibitById(id); // 節日的藝術品（shared/story/holidays.js，決定 0030）
  const extra = (typeof NEW_EXHIBITS !== "undefined" && NEW_EXHIBITS[id]) || {};
  return Object.assign({}, extra, ex, { title: ex.title || extra.title, label: ex.label || extra.label, lines: ex.lines || extra.lines || [] });
}
export const GEN1_EXHIBITS = ["portrait", "strange", "rare", "statue"];
// 圖書館所有的章節（照章號排）：第壹～參章、第肆章（地下）、第伍～捌章（11-08）
export function allChapters() {
  return STORY_CHAPTERS.concat(typeof CHAPTER4 !== "undefined" ? [CHAPTER4] : [], typeof MORE_CHAPTERS !== "undefined" ? MORE_CHAPTERS : []).sort((a, b) => a.id - b.id);
}
export function chapterOpen(P, id) {
  if (isFree(P) || id <= 1) return true;
  if (id === 4) return !!(P.cellar && P.cellar.best >= 3);
  const mc = typeof MORE_CHAPTERS !== "undefined" && MORE_CHAPTERS.find(c => c.id === id);
  if (mc) {
    const n = mc.need || {};
    return !!((n.seen && P.seen[n.seen]) || (n.unlocks && P.unlockCount >= n.unlocks) || (n.understood && Object.keys(P.understood || {}).filter(k => !/^u-/.test(k)).length >= n.understood) || (n.ending && Object.keys(P.endings || {}).length));
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
export function addMyth(P, n) {
  P.myth += n;
  if (P.sanity > maxSan(P)) P.sanity = maxSan(P);
  return mythUnlocks(P).concat(progressEvents(P));
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
export function genPrecise(P, rng, date, slot) {
  const pick = {};
  CORE_CATS.filter(c => c !== ROLLED).forEach(c => { pick[c] = pickOne(usable(P, c).filter(n => !isSpecialOpt(optOf(c, n))), rng) || usable(P, c)[0]; });
  const cl = pickOne(CLIENTS, rng);
  const hat = pick.帽子 === "沒有" ? "不戴帽子" : `戴${pick.帽子}`;
  const text = `一隻${pick.心情}的${pick.顏色}佩佩，${hat}，${pick.姿勢}。`;
  return { id: `${date}#${slot}`, kind: "precise", client: cl.name, note: cl.note, text, need: pick, reward: jobReward(NUM.reward.precise), comment: pickOne(CLIENT_COMMENTS, rng), done: false };
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
    if (c) list.push(Object.assign({}, c, { id: `${date}#${i + 1}`, src: c.id, reward: jobReward(c.reward || NUM.reward[c.kind] || 5), done: false }));
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
  if (c) return Object.assign({}, c, { id: `${date}#${slot}`, src: c.id, reward: jobReward(c.reward || NUM.reward[c.kind] || 5), done: false });
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
  const add = c ? Object.assign({}, c, { id: `${P.daily.date}#x`, src: c.id, reward: jobReward(c.reward || NUM.reward[c.kind] || 5), done: false }) : genPrecise(P, RNG, P.daily.date, "x");
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
    return { id: `${date}#L`, kind: "line", line: id, step, client: L.name, text: s.text, need: s.need, reward: jobReward(NUM.lineReward), comment: s.comment, intro: step === 0 ? L.intro : null, done: false };
  }
  return null;
}
// 委託的靈感：照 NUM.rewardPct 打折（決定 0062：少給的那部分改給籌碼，casino/job.js）。產生委託時就算好，委託單上寫的就是拿到的
export function jobReward(n) { return Math.max(1, Math.round((+n || 0) * NUM.rewardPct / 100)); }

// ---------- 系統 D：圖鑑、徽章、整類全收集 ----------
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
export function itemPoints(it) {
  const pts = a => a.failed ? HALL_POINTS.failed : (HALL_POINTS[a[ROLLED]] || 4);
  if (it.kind === "repaired") return HALL_POINTS.repaired || 5;
  if (it.kind === "pillow") return HALL_POINTS.pillow + (it.print ? Math.round(pts(attrsOf(it)) * 0.8) : 0);
  return pts(attrsOf(it)) + (it.perfect ? HALL_POINTS.perfect : 0);
}
// 收藏的畫給展廳評分加幾分（拍賣中的、壞資料不算；總共最多 NUM.hallArt.cap）
export function hallArtBonus(P) {
  const own = P && P.art && typeof P.art === "object" && P.art.own && typeof P.art.own === "object" && !Array.isArray(P.art.own) ? P.art.own : {}, C = NUM.hallArt;
  let b = 0;
  for (const id of Object.keys(own)) { const x = own[id]; if (id === "__proto__" || !x || typeof x !== "object" || x.lock) continue; b += C.pts[Math.max(0, Math.min(C.pts.length - 1, Math.floor(+x.tier) || 0))]; }
  return Math.round(Math.min(C.cap, b) * 10) / 10;
}
export function hallScore(P, slots) {
  const items = (slots || P.hall).map(s => hallItem(P, s)).filter(Boolean);
  if (!items.length) return { score: 0, items, themes: [], theme: null };
  const themes = hallThemes(items);
  const at = items.map(attrsOf).filter(Boolean);
  const variety = new Set(at.map(a => a.顏色)).size + new Set(at.map(a => a.心情)).size;
  const sum = items.reduce((s, it) => s + itemPoints(it), 0);
  const theme = themes[0] || null;
  const artBonus = hallArtBonus(P); // 掛畫（11-14）：收藏的畫加壹點點，有上限
  const score = Math.min(100, Math.round(sum + variety + (theme ? HALL_THEME_BONUS[theme] : 0) + artBonus));
  return { score, items, themes, theme, sum, variety, artBonus };
}
// 分享碼：把展廳變成一串文字
export const KIND_CODE = { pepe: "p", failed: "f", pillow: "l", repaired: "r" };
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

// ---------- 存檔 ----------
export const renameVal = v => (typeof RENAMED !== "undefined" && RENAMED[v]) || v;
export const renameKey = k => String(k).split("|").map(renameVal).join("|");
// 進階版的 key 只有五類：補成第 3 版的七類
export function normKey(k) { const p = fromKey(renameKey(k)); return p ? pepeKey(p) : String(k); }
export function normPillowKey(k) {
  const v = String(renameKey(k)).split("|");
  const base = v.slice(0, PILLOW_CATS.length).join("|");
  const ref = v.slice(PILLOW_CATS.length).join("|");
  if (!ref) return base + "|";
  return base + "|" + ref.slice(0, 2) + normKey(ref.slice(2));
}

// ---------- 系統 K：工坊升級 ----------
export const hasUp = (P, id) => !!(P && P.upgrades && P.upgrades[id]);

// ---------- 系統 M：地下收藏庫 ----------
export const cellarFloor = n => (typeof CELLAR !== "undefined" ? CELLAR : []).find(f => f.floor === n) || null;
export function teamItems(P, keys) { return (keys || []).map(k => { const e = P.pepes[k]; return e ? { kind: "pepe", key: k, pick: fromKey(k), perfect: !!e.perfect } : null; }).filter(Boolean); }
export function canStartCellar(P, floor, keys) {
  if (!cellarFloor(floor)) return { ok: false, reason: "這一層還沒開放" };
  if (floor > (P.cellar.best || 0) + 1) return { ok: false, reason: `要先走過 B${floor - 1}` };
  const team = teamItems(P, keys);
  if (team.length !== 3 || new Set(keys).size !== 3) return { ok: false, reason: "要帶 3 隻不一樣的佩佩" };
  const hurt = team.find(t => P.injured[t.key]);
  if (hurt) return { ok: false, reason: `「${describePepe(hurt.pick).title}」受傷了，還不能下去` };
  return { ok: true, team };
}

// ---------- 禁書的續集（翊文 11-08） ----------
export const bookSequels = () => (typeof BOOK_SEQUELS !== "undefined" ? BOOK_SEQUELS : []);
export function sequelCondition(P, s) {
  if (s.need === "gopnikSquat") return Object.keys(P.pepes).some(k => { const p = fromKey(k); return !!p && p.心情 === "俄國8+9" && p.姿勢 === "斯拉夫蹲"; });
  if (s.need === "hallGopnik") return P.hall.length > 0 && P.hall.every(it => it && it.kind === "pepe" && (fromKey(it.key) || {}).心情 === "俄國8+9");
  if (s.need === "cellarEnd") return !!(P.cellar && P.cellar.best >= 5);
  return false; // idleOrigin（在圖書館什麼都不做）、codexBeyond（圖鑑最後壹格的下壹格）：畫面那邊直接打開
}
export const sequelOpen = (P, s) => isFree(P) || !!(P.keys && P.keys[s.id]);
export function unlockSequel(P, id) {
  const s = bookSequels().find(x => x.id === id);
  if (!s || sequelOpen(P, s)) return [];
  P.keys[id] = todayStr(); P.news.origin = true;
  return [{ type: "book", id, title: s.title }];
}
export function sequelEvents(P) {
  if (isFree(P)) return [];
  const ev = [];
  bookSequels().forEach(s => { if (!sequelOpen(P, s) && P.mythFrom[s.after] && sequelCondition(P, s)) ev.push(...unlockSequel(P, s.id)); });
  return ev;
}

// ---------- 每週特展 ----------
// 第幾週：從星期一算起。dateStr 是 todayStr() 給的日期（台灣時間 05:00 換日），所以換週是台灣時間週一 05:00（決定 0019）：
// 週一 04:59 還是星期日的日期，算上一週。1970-01-01 是星期四，加 3 天讓 1970-01-05（星期一）變成第 1 週的第一天
export function weekIndex(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const days = Math.floor(Date.UTC(y, m - 1, d) / 86400000) + 3; // 讓每一週從星期一開始
  return Math.floor(days / 7);
}

// ---------- 小優點、小缺點 ----------
export const traitById = id => (id && (PERKS.find(t => t.id === id) || FLAWS.find(t => t.id === id))) || null;
// 這一位身上的優缺點，加上穿著的裝備（兌換所，決定 0032；欄位一樣，下面的 traitSum、traitHits 一起算）。自由模式沒有
export function traitsOf(P) { return P && !isFree(P) ? [P.perk, P.flaw].map(traitById).filter(Boolean).concat(wornGear(P)) : []; }
// 優缺點和裝備在某一個欄位加起來是多少，例如 traitSum(P, "fusion") ＝ 融合多花（＋）或少花（−）幾靈感
export function traitSum(P, field) { return traitsOf(P).reduce((n, t) => n + (typeof t[field] === "number" ? t[field] : 0), 0); }

export const shopObj = v => !!v && typeof v === "object" && !Array.isArray(v);

// ---------- 存檔 ----------
export function newShop() { return { gear: {}, trials: {} }; }
export function shopState(P) {
  if (!shopObj(P.shop)) P.shop = newShop();
  if (!shopObj(P.shop.gear)) P.shop.gear = {};
  if (!shopObj(P.shop.trials)) P.shop.trials = {};
  return P.shop;
}

// ---------- 裝備 ----------
export function gearItem(id) { return GEAR_ITEMS.find(x => x.id === id) || null; }
export const ownsGear = (P, id) => !!(P && !isFree(P) && shopState(P).gear[id]);
// 現在這位穿著的（裝備的物件；traitsOf 一起算）。自由模式沒有
export function wornGear(P) { return P && !isFree(P) ? asList(P.gear).map(gearItem).filter(Boolean).filter(g => ownsGear(P, g.id)) : []; }
