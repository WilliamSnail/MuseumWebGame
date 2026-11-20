// ================================================================
//  以下是程式（一般不用改）。遊戲規則：不碰畫面，方便測試。
// ================================================================
import { EXHIBITS, HALL_THEME_BONUS, NUM, ORIGIN, PEPE_NAME, PEPE_PARTS, PILLOW_PARTS, RENAMED, UPGRADES } from "./config.js";
import { QUIRK_TEXT, VISITOR_COMMENTS } from "./content.js";
import { CLIENT_LINES } from "./systems_text.js";
import { npcByName, npcPickHall, npcStoryLine, npcWebCounters } from "../npc/core.js";
import { BASE_TOTAL, CATS, CORE_CATS, DAY_CLOCK, DAY_MS, DAY_START_HOUR, DECO_CATS, DEFAULT_PICK, KIND_CODE, NOW_CLOCK, PILLOW_CATS, PILLOW_TOTAL, QUIRK_TASKS, RARITY_ORDER, RNG, ROLLED, TZ_HOURS, activeQuirks, addDays, allOpts, asList, attrsOf, b64d, b64e, baseOpts, blockedSet, catOfOption, clampN, codexCount, coreKey, cureByTask, dailyCommissions, daysBetween, describePepe, exhibitById, exhibitOpen, fixQuirks, fromKey, fullPick, gainSan, galleryInsp, grantOption, hallItem, hallScore, hallThemes, isFree, isUnlocked, limitedHome, needSatisfiable, normKey, normPillowKey, nowMs, optOf, parsePillowKey, partOf, pepeKey, pickOne, possibilities, progressEvents, quirkDaysOf, quirkDoneDays, quirkLive, quirkSpan, rarityRank, renameKey, renameVal, rollD100, rollExpr, sortUnlocked, specAllows, todayStr, traitSum, usable } from "./logic_base.js";
import { fixLegacy, leaveLegacy, newVisit, visitorRecord } from "./legacy.js";
import { fixLimited, fixSignin, isLimitedMat, newSignin, stockOf, useStock } from "../social/signin.js";
import { fixShop } from "./shop.js";
import { fixShow, newShow } from "../story/themeshow.js";
import { hallSize, hasTalent, skillCheck } from "./systems.js";
import { fixVisitors, freshDayVis, hasSlots, takeVisitorNo } from "../social/visitors.js";

// 底層搬到 logic_base.js，從這裡再匯出一次（web、functions 還是從這個檔拿）
export * from "./logic_base.js";

// ---------- 一天：台灣時間 05:00 換日，週一 05:00 換週（決定 0019） ----------
// 公佈欄、信箱用的「真的日期」。11-09 起跟 todayStr 一樣（以前 todayStr 是遊戲裡的日期），兩個不能不一樣
export function realTodayStr(t) { return todayStr(t); }
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
export function fill(t, x) { return String(t).split("{x}").join(x); }

// ---------- 骰子（CoC：d100 擲出 ≤ 數值就成功） ----------
export function d100Faces(total) { return total === 100 ? [0, 0] : [Math.floor(total / 10), total % 10]; }

// ---------- 選項與組合 ----------
export const ALL_TOTAL = CATS.reduce((n, c) => n * allOpts(c).length, 1);
// 收藏裡有哪些核心組合（不管背景、手上拿的東西）
export function ownedCoreSet(P, src) {
  const s = new Set();
  Object.keys(src || P.pepes).forEach(k => { const p = fromKey(k); if (p) s.add(coreKey(p)); });
  return s;
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
export const pillowKeyOf = (pick, print) => PILLOW_CATS.map(c => pick[c]).join("|") + "|" + (print || "");
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
    pepes: {}, failed: {}, pillows: {}, serial: 0, avatar: "", // avatar：館友證的頭像，壹隻收藏過的佩佩的 key；空字串＝不用頭像（11-13）
    seen: {}, chaptersRead: {}, mythFrom: {}, understood: {}, clues: {},
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
    // 第 4 版（11-09，決定 0030）：只有簽到拿得到的東西（shared/social/signin.js）。博物館的，換參觀者不會跟著換
    limited: { got: {}, wear: { stand: null, frame: null }, stock: {} },
    // 第 4 版（11-09，決定 0032）：兌換所（shared/core/shop.js）。shop 是博物館的（買到的裝備、試煉房間這週的次數）；gear 是現在這位穿著的（VISITOR_KEYS）
    shop: { gear: {}, trials: {} }, gear: [],
    // 第 4 版（11-09，決定 0035）：主題展辦到哪裡、策展手記讀過沒（shared/story/themeshow.js）。博物館的，換參觀者不會跟著換
    themeShow: newShow(),
    // 第 4 版（11-08 翊文）：新解開的東西在哪個房間、看過了沒（shared/core/fresh.js）
    fresh: {},
    // 第 4 版（11-08 翊文）：參觀者一位接一位（shared/core/legacy.js）：這一位的小優缺點（選職業時抽，決定 0028）、前一位留下的、遺物櫃、這一位自己的統計。
    //   cands 是以前「3 位候選人」還沒挑的，0028 以後一直是 null（舊存檔裡有的留著，選職業時清掉）
    perk: null, flaw: null, cands: null, legacy: null, relics: [],
    visit: { from: todayStr(), sec0: 0, made0: 0, deepest: 0, understood: {}, where: null, made: 0, sec: 0 },
    // 第 4 版（11-08 翊文）：一個帳號最多 3 位參觀者、共用博物館（shared/social/visitors.js，決定 0018）。自由模式沒有位子
    ...(free ? {} : { vid: "v1", vname: null, slot: 0, oddSeen: {}, visitors: [], visitorCount: 1 }),
  };
}

// 每天自己恢復理智（NUM.sanDayBack）：每過一次 05:00 +n（days 次），最多到 cap。已經比 cap 高的不動；理智 0（熄燈）的不恢復。
// 對象是壹個「參觀者的欄位包」：現在這位（P 自己）或不在場的（P.visitors 裡的）。回傳實際加了多少
export function sanDayRecoverOne(v, days = 1) {
  const c = NUM.sanDayBack;
  if (!c || !(days > 0) || !(v.sanity > 0) || v.sanity >= c.cap) return 0;
  const to = Math.min(v.sanity + c.n * days, c.cap, 99 - (v.myth || 0));
  const gain = to - v.sanity;
  if (gain > 0) v.sanity = to;
  return Math.max(0, gain);
}
// 現在這位加完，不在場的（P.visitors）、沒在地下室工作的也一起加（翊文 11-11：所有參觀者過五點都自己加）。自由模式不算。回傳現在這位加了多少
export function sanDayRecover(P, days = 1) {
  if (isFree(P)) return 0;
  asList(P.visitors).forEach(v => { if (v && typeof v === "object" && !v.work) sanDayRecoverOne(v, days); });
  return sanDayRecoverOne(P, days);
}
export function ensureDay(P, date = todayStr()) {
  if (P.day && P.day.date === date) return null;
  const back = rewindDays(P, date); // 舊存檔的日期比今天晚（以前 15 分鐘一天）：先拉回來
  const firstEver = !P.day;
  // 換日時自己恢復的理智，要先加，今天的起點（startSan）才算進去。隔了幾天沒進館就加幾次（舊存檔日期在今天後面的算 1 次）
  let sanBack = firstEver ? 0 : sanDayRecover(P, Math.max(1, daysBetween(P.day.date, date)));
  if (!firstEver && !isFree(P)) { const hh = limitedHome(P); if (hh.daySan) sanBack += gainSan(P, hh.daySan); if (hh.dayMood) P.mood = clampN((P.mood || 0) + hh.dayMood, 0, 99); } // 限定帽子（枕頭睡帽、黑絨領結）：換日多回壹點
  P.day = { date, startSan: P.sanity, lost: 0, exLoss: {}, reviews: {}, views: {}, moodFx: {}, hugs: {}, mini: {}, diff: {}, quirkGiven: false,
    fusions: 0, pairs: {}, rerolls: 0, hints: {} };
  // 地下收藏庫受的傷，時間到了自己好
  Object.keys(P.injured || {}).forEach(k => { if (P.injured[k] <= date) delete P.injured[k]; });
  const retasked = retaskQuirks(P); // 怪癖留一週：治法換日時變成做不到，改抽一件（決定 0046）
  P.day.sanBack = sanBack; // 留著給畫面說
  return { firstEver, back, retasked, sanBack };
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
export const isBlocked = (P, cat, name) => { const b = blockedSet(P)[cat]; return !!(b && b.has(name)); };
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
export function pushRoll(P) { P.stats.pushes++; return rollD100(); }

// ---------- 系統 F：理智檢定 ----------
export function sanSpecFor(P, ex) {
  if (!ex.san) return null;
  const today = P.day && P.day.views ? P.day.views[ex.id] || 0 : 0;
  return today > NUM.habituate ? "0/1" : ex.san;
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
  const q = Object.assign({ type, since: todayStr() }, pickOne(left), { until: now + quirkSpan(type), task: null, done: [] });
  P.quirks.push(q);
  q.task = pickQuirkTask(P); // 放進去之後才挑：新的恐懼症擋住的選項，委託也做不出來
  return { quirk: q, from: before, to: possibilities(P) };
}
export function quirkName(q) {
  const x = q.opt ? (q.cat === "顏色" ? q.opt + "色" : q.opt) : q.cat;
  return fill(QUIRK_TEXT[q.type].name, x);
}

// ---------- 怪癖：在 NUM.quirkTaskDays 個不同的遊戲日做到治法那件事，不然 NUM.quirkDays 天後自己消失（決定 0046；0027 是「做完一件事、20 分鐘」） ----------
// 還剩幾天自己好（無條件進位：還剩 1 小時寫 1 天）；過期是 0。這是「時間」，不是遊戲日：到期的那一刻才好
export function quirkDaysLeft(q, now = nowMs()) {
  if (!q || typeof q.until !== "number" || !Number.isFinite(q.until)) return quirkDaysOf(q && q.type);
  return Math.max(0, Math.ceil((q.until - now) / DAY_MS));
}
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
// 半價：花「掉的理智 ×2」的心情，把這次掉的理智減半（理智檢定本身不能花心情）
export const halveCost = loss => loss * 2;
export const halved = loss => Math.ceil(loss / 2);
// 理智 0：俄國8+9 的房間，然後換下一位參觀者（圖鑑、收藏、展廳都留著）
// 第 4 版（11-08 翊文，roguelike 的繼承，規則在 shared/core/legacy.js）：
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

// ---------- 畫廊、圖書館 ----------
export function reviewsLeft(P, ex) { return P.day ? Math.max(0, galleryInsp(ex).perDay - (P.day.reviews[ex.id] || 0)) : 0; }
export function viewsToday(P, ex) { return P.day && P.day.views ? P.day.views[ex.id] || 0 : 0; }
// 有心情效果的東西，這次心情沒變的時候說實話（翊文 11-09：「(你的心情變好了些) 沒有加心情耶」）。
// 心情壹天只算壹次（第 1 代的規則），第 1 代的文字只在真的變了才出現。心情真的變了回傳空字串
export function moodNoteOf(P, ex, gained) {
  if (!ex.mood || gained) return "";
  if (isFree(P)) return "(自由模式沒有心情)";
  if (ex.mood > 0 && P.mood >= 99) return "(你的心情已經滿了)";
  if (ex.mood < 0 && P.mood <= 0) return "(你的心情已經不能再低了)";
  return "(今天已經看過了，心情不會再變，明天再來)";
}
export function viewExhibit(P, ex) {
  const first = !P.seen[ex.id];
  P.seen[ex.id] = (P.seen[ex.id] || 0) + 1;
  if (P.day) { P.day.views = P.day.views || {}; P.day.views[ex.id] = (P.day.views[ex.id] || 0) + 1; }
  const out = { first, insp: 0, mood: 0, myth: 0, san: null, events: [], cured: [], moodNote: "" };
  if (isFree(P)) { out.moodNote = moodNoteOf(P, ex, 0); return out; }
  const gi = galleryInsp(ex);
  if (first) out.insp = gi.first;
  else if (reviewsLeft(P, ex) > 0) { P.day.reviews[ex.id] = (P.day.reviews[ex.id] || 0) + 1; out.insp = gi.review; }
  else out.capped = true; // 今天這件的靈感拿完了
  P.insp += out.insp;
  if (ex.mood && !P.day.moodFx[ex.id]) {
    P.day.moodFx[ex.id] = true;
    const before = P.mood; P.mood = clampN(P.mood + ex.mood, 0, 99); out.mood = P.mood - before;
  }
  out.moodNote = moodNoteOf(P, ex, out.mood);
  if (ex.myth && !P.mythFrom[ex.id]) { P.mythFrom[ex.id] = true; out.myth = ex.myth; }
  out.san = sanSpecFor(P, ex);
  if (!ex.san) out.cured = cureByTask(P, "calm"); // 看了不可怕的畫：治法是這件的怪癖治好（決定 0027）
  return out;
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
  P.mythFrom[book.id] = todayStr(); // 記哪壹天讀的（決定 0063：隔天以後重讀可以再擲看懂檢定）。舊存檔是 true，當成以前讀的
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
// 老主顧三位現在走到哪（委託櫃台上面那壹條、大廳「今天要做的事」用；翊文 11-13：「追蹤那些來參觀者的劇情應該更明顯」）。
// today ＝今天的委託（dailyCommissions）。met ＝來過了（交過至少壹段，或今天就在櫃台）；還沒來過的畫面不寫他是誰。
// said ＝交過的那幾段（他要的、他說的），重讀用；走完了才有 finale
export function regularsView(P, today) {
  if (!P || isFree(P) || typeof CLIENT_LINES === "undefined") return null;
  const list = Object.keys(CLIENT_LINES).map(id => {
    const L = CLIENT_LINES[id], step = Math.min((P.lines && P.lines[id]) || 0, L.steps.length);
    const c = asList(today).find(x => x && x.kind === "line" && x.line === id);
    return { id, name: L.name, step, of: L.steps.length, met: step > 0 || !!c, done: step >= L.steps.length,
      today: c ? (c.done ? "done" : "here") : null, intro: L.intro, finale: step >= L.steps.length ? L.finale : null, gift: L.gift,
      said: L.steps.slice(0, step).map(s => ({ text: s.text, comment: s.comment })) };
  });
  return { open: (P.unlockCount || 0) >= NUM.linesFrom, need: NUM.linesFrom, have: P.unlockCount || 0, list };
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
// 收藏裡的東西。格式跟收藏列一樣（web/src/core/ui_core.js 的 collectionItems；那邊改了這裡也要改）：
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
// 壹鍵交件那條要寫什麼（委託櫃台畫面用，翊文 11-15 手機實測「壹鍵交件又不見了」：沒有符合的時候按鈕變成淡淡的虛線框，手機又把原因藏起來，看起來像不見）
// 回傳 { n 可以交幾張, left 今天還沒交的幾張, state: "ok" | "none" | "done", why 原因（手機也要看得到）}
export function autoBarInfo(P) {
  const n = autoDeliverables(P).length;
  const list = dailyCommissions(P, P.day ? P.day.date : todayStr());
  const left = list.filter(c => !c.done).length;
  if (n) return { n, left, state: "ok", why: n < left ? `另外 ${left - n} 張，收藏裡還沒有符合的。` : "" };
  return { n: 0, left, state: left ? "none" : "done", why: left ? "收藏裡沒有符合的" : "今天都交完了，明天再來" };
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

// ---------- 系統 E：展廳 ----------
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
// 展廳參觀者今天已經給了幾靈感（上限 NUM.visitorInspDay，換日歸零）
export const visitorInspToday = (P, day = todayStr()) => (P && P.hallInsp && P.hallInsp.day === day ? +P.hallInsp.n || 0 : 0);
export function visitorArrive(P, rng = RNG, entry = null) {
  const hs = hallScore(P);
  if (!hs.items.length) return null;
  if (entry) { // 伺服器的展廳時刻表來的人（11-14，翊文：「靈感照人數算」「就不用每 150 秒了」）：有名字的 NPC 壹位算壹次；散客壹組 n 位算 n 次（旅行團 12 位＝12 次），每次的靈感照舊，每日上限不動
    const day = todayStr(), got = visitorInspToday(P, day), n = Math.max(1, Math.min(40, Math.floor(+entry.n) || 1));
    let c;
    if (entry.kind === "npc") { const sl = npcStoryLine(entry.npc, day, npcWebCounters()); c = sl ? { who: sl.who, text: sl.text, npc: sl.npc, story: true } : { who: entry.who || "旅客", text: "逛了壹圈展廳。", npc: entry.npc }; }
    else c = { who: entry.label || "散客", text: n > 1 ? `壹共 ${n} 位，安靜地逛完了壹圈。` : "安靜地逛了壹圈。", crowd: n }; // crowd：散客壹組幾位（展廳的卡片標「散客」用）
    const want = isFree(P) ? 0 : (1 + Math.floor(hs.score / NUM.visitorStep)) * n, gain = Math.max(0, Math.min(want, NUM.visitorInspDay - got)), full = !isFree(P) && gain < want;
    P.insp += gain; P.hallInsp = { day, n: got + gain }; P.hallVisitors += n;
    const ex = c.npc ? { npc: c.npc, story: !!c.story } : c.crowd ? { crowd: c.crowd } : {};
    P.visitorLog.unshift({ who: c.who, text: c.text, gain, full, ...ex });
    P.visitorLog = P.visitorLog.slice(0, 12);
    return { who: c.who, text: c.text, gain, full, score: hs.score, ...ex };
  }
  let pool;
  const r = rng();
  if (hs.theme && r < 0.45 && VISITOR_COMMENTS.themes[hs.theme]) pool = VISITOR_COMMENTS.themes[hs.theme];
  else if (r < 0.6 && hs.items.some(i => i.perfect)) pool = VISITOR_COMMENTS.perfect;
  else if (r < 0.7 && hs.items.some(i => { const a = attrsOf(i); return a && (a[ROLLED] === "不可名狀" || a.帽子 === "觸手帽"); })) pool = VISITOR_COMMENTS.eldritch;
  else pool = VISITOR_COMMENTS[hs.score < 35 ? "low" : hs.score < 70 ? "mid" : "high"];
  let c = pickOne(pool, rng);
  const day = todayStr(), got = visitorInspToday(P, day);
  // 館內 NPC（11-14，shared/npc/core.js）：來的人有名字。照 route.hall 的權重抽壹位（跟上壹位不同）；NUM.npc.hallStory 的機率說自己的故事（現在這壹段的字，還沒有就說身分），其餘照舊留壹般的評語。
  //   壹般評語的 who 剛好是某位 NPC（老派收藏家、數學老師…）就算是他說的（npc 欄）。不改靈感、不改來的間隔
  const last = P.visitorLog[0], np = npcPickHall(rng, day, npcWebCounters(), undefined, last && last.npc);
  const sl = np && rng() < NUM.npc.hallStory ? npcStoryLine(np.id, day, npcWebCounters()) : null;
  if (sl) c = sl; else { const nm = npcByName(c.who); if (nm) c = { who: c.who, text: c.text, npc: nm.id }; }
  const want = isFree(P) ? 0 : 1 + Math.floor(hs.score / NUM.visitorStep), gain = Math.max(0, Math.min(want, NUM.visitorInspDay - got));
  const full = !isFree(P) && gain < want; // 今天的份拿滿了：參觀者還是會來、留話，只是不給靈感
  P.insp += gain;
  P.hallInsp = { day, n: got + gain };
  P.hallVisitors++;
  const extra = c.npc ? { npc: c.npc, story: !!c.story } : {};
  P.visitorLog.unshift({ who: c.who, text: c.text, gain, full, ...extra });
  P.visitorLog = P.visitorLog.slice(0, 12);
  return { who: c.who, text: c.text, gain, full, score: hs.score, ...extra };
}
export function hallCode(P) {
  const items = P.hall.map(s => { const it = hallItem(P, s); return it ? [KIND_CODE[it.kind], it.key, it.perfect ? 1 : 0] : 0; });
  return "PEPEHALL1." + b64e(JSON.stringify({ v: 1, n: P.visitor, i: items }));
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
    settings: { font: "m", reduceMotion: false, motionOffDone: true, muted: false, dayMin: 0, holidayLook: true, oldLobby: false }, tutorialDone: false, gen2Migrated: false,
    signin: newSignin() }; // holidayLook：節日那天換一下外觀（設定可以關，決定 0030）；signin：每日簽到，帳號的（shared/social/signin.js）
}
// 舊名字換新名字（RENAMED）：key 是用「|」接起來的選項
// 文字裡有沒有舊名字。新名字可能包含舊名字（俄國8+9 裡面就有俄國8），要先拿掉新名字再找，不然每次載入都會當成舊存檔
export const hasOldName = s => typeof RENAMED !== "undefined" && Object.entries(RENAMED).some(([a, b]) => String(s).split(b).join("").includes(a));
export function renameMap(o) { const out = {}; Object.entries(o || {}).forEach(([k, v]) => { out[renameKey(k)] = v; }); return out; }
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
    "keys", "upgrades", "recipes", "repaired", "injured", "skillTicks", "lines", "giftsIn", "understood", "clues", "fresh", "visit"].forEach(k => { if (!out[k] || typeof out[k] !== "object" || Array.isArray(out[k])) out[k] = {}; });
  ["quirks", "comments", "visitorLog", "hugDays", "history", "relics"].forEach(k => { if (!Array.isArray(out[k])) out[k] = []; });
  out.quirks = fixQuirks(out.quirks); // 怪癖 7 天後自己消失（決定 0046，原本 20 分鐘）：舊存檔沒有 until 的怪癖從載入這一刻起算；不在場的參觀者在 fixVisitors 裡補
  fixLegacy(out, !!(P && P.visit && typeof P.visit === "object" && !Array.isArray(P.visit))); // 參觀者一位接一位（11-08）：舊存檔補 P.visit 這些
  fixVisitors(out, P); // 多位參觀者（11-08）：舊存檔的這一位變成第一個位子
  // 第 3 版：key 補成七類
  out.pepes = normMap(out.pepes, normKey); out.failed = normMap(out.failed, normKey); out.repaired = normMap(out.repaired, normKey);
  out.pillows = normMap(out.pillows, normPillowKey); out.injured = normMap(out.injured, normKey);
  out.avatar = typeof out.avatar === "string" && out.avatar ? normKey(out.avatar) : ""; // 館友證頭像（11-13）：舊存檔沒有就是沒有；選的那隻不在收藏裡，passAvatar 會當成沒有
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

// ---------- 替佩佩取名（決定 0133，翊文 11-19：所有佩佩都能取名）----------
// 名字：去頭尾空白、連續空白變壹個、1～PEPE_NAME.max 個字、不能有控制字元、不能含不雅的字。不合格回傳 { ok: false, reason }
export function pepeNameClean(s) {
  if (typeof s !== "string") return { ok: false, reason: "名字要是文字" };
  const t = s.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!t) return { ok: false, reason: "名字不能是空的" };
  if (/\p{C}/u.test(t)) return { ok: false, reason: "名字有看不見的字" };
  if ([...t].length > PEPE_NAME.max) return { ok: false, reason: "名字最多 " + PEPE_NAME.max + " 個字" };
  const flat = t.replace(/[\s\p{P}\p{S}_]+/gu, "").toLowerCase();
  if (PEPE_NAME.bad.some(b => flat.includes(String(b).toLowerCase()))) return { ok: false, reason: "這個名字不行" };
  return { ok: true, name: t };
}
// 替收藏裡的佩佩（key）取名或改名：e.nm ＝ 名字，P.nmSeq 是取名的先後（越大越新，「收走」挑最新取的）；
// 這隻曾被收走過名字（e.tk，名牌背面是館友號碼）：重新取的名字旁邊多壹個小空心圓章（e.tk.stamp ＝ true）
export function pepeRename(P, key, name) {
  const e = P && P.pepes && P.pepes[key];
  if (!e) return { ok: false, reason: "收藏裡沒有這隻佩佩" };
  const c = pepeNameClean(name); if (!c.ok) return c;
  P.nmSeq = (Number.isInteger(P.nmSeq) ? P.nmSeq : 0) + 1;
  e.nm = c.name; e.nmSeq = P.nmSeq;
  if (e.tk) e.tk.stamp = true;
  return { ok: true, name: c.name, stamp: !!(e.tk && e.tk.stamp) };
}
