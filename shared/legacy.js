// ================================================================
//  參觀者一位接一位：roguelike 的繼承
//  翊文 11-08：「現在理智歸零以後，下一個探險者可以繼承一些東西……就像Rouge like那樣，每個帳戶是自己的進度，一個探險者後可以下一個」
//  主線替翊文挑了規劃.md 第四節的 A、C、D（docs/決定/0016-參觀者繼承做ACD.md）：
//    A. 前任的遺物：換人時，前一位留一樣東西給下一位（一件收藏放進館長室的遺物櫃，或最拿手的技能 +10）。
//    C. 挑下一位：原本是從 3 位候選人挑一位（每位是「職業＋一個小優點＋一個小缺點」）。
//       11-08 翊文：「創第二個角色的時候只剩三個職業為什麼，而且優缺點創第一個角色的時候沒有寫」，選了「6 個職業自己選，再抽優缺點」
//       （docs/決定/0028-每位參觀者都選職業再抽優缺點.md）：每一位參觀者（第一位也是）都從 6 個職業自己選，
//       選好再用 RNG 抽一個小優點、一個小缺點（chooseJob）。抽到就存在 P 上，不能重抽。3 位候選人那一套拿掉了。
//    D. 歷任參觀者牆：換人時把這一位的紀錄寫進 P.history，館長室一位一張卡。
//  退休換人（翊文 11-08：「好，加些其他的」，docs/決定/0025-退休換人.md）：除了理智歸零，
//    看完其他結局（館長、地下館長、你的佩佩博物館）可以退休；館長室的名片上也可以自己退休（retireCheck）。
//    退休跟理智歸零走同一條路：nextVisitor(P, 怎麼結束的, 留下的)。
//  純函式：只改傳進來的 P，亂數用 RNG。
//  數值在 config.js（LEGACY、PERKS、FLAWS），文字在 content3.js（TRAIT_TEXT、LEGACY_TEXT）。
//
//  存在 P 裡的（newProfile 給預設；舊存檔由 fixLegacy 補）：
//    P.perk、P.flaw  這一位的小優點、小缺點（id）。選職業時抽（chooseJob）；還沒選職業、自由模式是 null。
//                    0028 以前的第一位參觀者沒有抽過，維持 null（不補抽）。
//    P.cands         以前「3 位候選人」還沒挑的（0028 以後不再產生）。舊存檔裡有就留著不動；那一位選職業時清成 null（跟以前挑了候選人一樣）。
//    P.legacy        前一位留給這一位的東西：{ from, type: "relic", kind, key, mood } 或 { from, type: "skill", skill, plus }；沒有是 null。
//    P.relics        遺物櫃：歷任留下的收藏（新的在前面），整間博物館共用，換人也留著。
//    P.visit         這一位自己的統計：{ from（來的那天）, sec0, made0, deepest（地下走到第幾層）, understood（看懂了哪些）, where（理智在哪裡用完）,
//                    made（這一位做了幾隻）, sec（這一位玩了幾秒） }。made、sec 是多位參觀者（11-08）加的：stats.made、activeSec 是整間博物館的，三位輪流玩，相減會算到別人的
//  效果接在原本的規則裡（找 traitSum）：logic.js 的 makePillow、deliver、understandCheck；
//  logic3.js 的 skillGrowth、fusionPrice、teamPower、cellarApply、injureDaysOf。
//  開場就算的（心情、理智、技能起點）在選職業時加（chooseJob → startStats）。
// ================================================================
import { FLAWS, LEGACY, NUM, PERKS, SKILLS } from "./config.js";
import { TRAIT_TEXT } from "./content3.js";
import { asList, clampN, daysBetween, hallItem, isFree, maxSan, normKey, normPillowKey, pickOne, todayStr } from "./logic.js";
import { JOB_SKILL, assignJob, jobSkill, rollSkills } from "./logic3.js";

// ---------- 小優點、小缺點 ----------
export const traitById = id => (id && (PERKS.find(t => t.id === id) || FLAWS.find(t => t.id === id))) || null;
export const traitName = id => (TRAIT_TEXT[id] || {}).name || id;
// 這一位身上的優缺點（自由模式沒有）
export function traitsOf(P) { return P && !isFree(P) ? [P.perk, P.flaw].map(traitById).filter(Boolean) : []; }
// 優缺點在某一個欄位加起來是多少，例如 traitSum(P, "fusion") ＝ 融合多花（＋）或少花（−）幾靈感
export function traitSum(P, field) { return traitsOf(P).reduce((n, t) => n + (typeof t[field] === "number" ? t[field] : 0), 0); }
// 影響到這個欄位的那幾個：[{ id, name, v }]（畫面寫「力氣大 +1」用）
export function traitHits(P, field) { return traitsOf(P).filter(t => typeof t[field] === "number" && t[field]).map(t => ({ id: t.id, name: traitName(t.id), v: t[field] })); }
// 「力氣大 +1」「沒力氣 −1」
export const traitTag = hit => `${hit.name} ${hit.v > 0 ? "+" : "−"}${Math.abs(hit.v)}`;
// 說明文字：TRAIT_TEXT 裡的 {欄位名} 換成 config.js 的數字（取絕對值，正負寫在字裡）；{from}、{to} 是原本和改了之後
const BASE_OF = { fusion: () => NUM.fusionCost, injure: () => NUM.injureDays, sanity: () => NUM.startSanity };
export function traitDesc(id) {
  const t = traitById(id), tx = TRAIT_TEXT[id];
  if (!t || !tx) return "";
  let s = tx.desc;
  Object.keys(t).forEach(k => { if (typeof t[k] === "number" || typeof t[k] === "string") s = s.split("{" + k + "}").join(String(typeof t[k] === "number" ? Math.abs(t[k]) : t[k])); });
  const f = Object.keys(BASE_OF).find(k => typeof t[k] === "number");
  if (f) { const b = BASE_OF[f](); s = s.split("{from}").join(String(b)).split("{to}").join(String(Math.max(f === "injure" ? 1 : 0, b + t[f]))); }
  return s;
}
// 兩個優缺點有沒有同一類（同一類的不會配在同一位身上，例如「精打細算」不會配「坐不住」）
export const traitsClash = (a, b) => !!(a && b) && asList(a.tag).some(x => asList(b.tag).includes(x));

// 地下收藏庫扣理智時，「怕黑」多扣幾點（有扣才多扣）
export function cellarDarkLoss(P, loss) { return loss > 0 ? Math.max(0, traitSum(P, "cellarSan")) : 0; }

// ---------- 這一位自己的統計（D：歷任參觀者牆要用） ----------
export function newVisit(P) {
  return { from: todayStr(), sec0: P.activeSec || 0, made0: (P.stats && P.stats.made) || 0, deepest: 0, understood: {}, where: null, made: 0, sec: 0 };
}
// 最拿手的技能 [名字, 值]：值最高的；一樣高就選職業的拿手技能，再照 SKILLS 的順序
export function bestSkill(P) {
  if (!P || !P.skills) return null;
  const main = P.job ? jobSkill(P.job) : null;
  let best = null;
  SKILLS.forEach(s => {
    const v = P.skills[s];
    if (typeof v !== "number") return;
    if (!best || v > best[1] || (v === best[1] && s === main)) best = [s, v];
  });
  return best;
}
// 寫進 P.history 的一筆（nextVisitor 用；不改 P）。endedBy ＝怎麼結束的（現在只有 "russia8"）；null ＝還在館裡（牆上「現在」那張）
export function visitorRecord(P, endedBy) {
  const v = P.visit || {};
  const made = (P.stats && P.stats.made) || 0;
  const lostIn = /^cellar:(\d)/.exec(String(v.where || "")); // 在地下第幾層用完理智，至少走到那一層
  return {
    n: P.visitor, job: P.job || null, made, endedBy, d: todayStr(), // 第 3 版就有的欄位（made 是整間博物館累計的）
    // 第 4 版（11-08）
    perk: P.perk || null, flaw: P.flaw || null,
    madeThis: typeof v.made === "number" ? v.made : typeof v.made0 === "number" ? Math.max(0, made - v.made0) : null,
    deepest: Math.max(v.deepest || 0, lostIn ? +lostIn[1] : 0),
    understood: Object.keys(v.understood || {}).length,
    where: v.where || null,
    from: v.from || null,
    mins: typeof v.sec === "number" ? Math.round(v.sec / 60) : typeof v.sec0 === "number" ? Math.max(0, Math.round(((P.activeSec || 0) - v.sec0) / 60)) : null,
    myth: P.myth || 0,
    best: bestSkill(P),
    quirks: asList(P.quirks).map(q => ({ type: q.type, cat: q.cat, opt: q.opt || null })),
    got: P.legacy ? Object.assign({}, P.legacy) : null,
    left: null,
    name: P.vname || null, // 多位參觀者（11-08）：玩家取的名字；以前的紀錄沒有
  };
}
// 牆上「做了幾隻」：新的紀錄有 madeThis；舊的紀錄只有累計的 made，跟前一位（n − 1）相減
export function visitorMade(list, i) {
  const x = list[i];
  if (!x) return null;
  if (typeof x.madeThis === "number") return x.madeThis;
  if (typeof x.made !== "number") return null;
  const prev = list[i + 1];
  if (prev) return prev.n === x.n - 1 && typeof prev.made === "number" ? Math.max(0, x.made - prev.made) : null;
  return x.n === 1 ? x.made : null;
}

// ---------- A. 前任的遺物 ----------
const ownsAnything = P => [P.pepes, P.failed, P.pillows, P.repaired].some(o => o && Object.keys(o).length > 0);
// 換人前可以留什麼：{ relic: { ok, mood }, skill: { ok, skill, value, plus } }
export function legacyOptions(P) {
  const best = bestSkill(P);
  return {
    relic: { ok: !isFree(P) && ownsAnything(P), mood: LEGACY.relicMood },
    skill: best && !isFree(P) ? { ok: true, skill: best[0], value: best[1], plus: LEGACY.skillPlus } : { ok: false },
  };
}
// 留下東西（nextVisitor 用）。leave：{ type: "relic", item: { kind, key } }、{ type: "skill" }，或 null（什麼都不留）。
// 遺物是快照：放進 P.relics 之後，收藏怎麼變，遺物櫃裡的都還在。收藏本身不會少。
// entry（這一位的紀錄）的 left 記這一位留了什麼；回傳留給下一位的 P.legacy（沒有就 null）。
export function leaveLegacy(P, entry, leave) {
  if (!leave || isFree(P)) return null;
  if (leave.type === "relic") {
    const it = leave.item ? hallItem(P, leave.item) : null;
    if (!it) return null;
    const e = it.kind === "pepe" ? P.pepes[it.key] : null;
    const relic = { n: P.visitor, name: P.vname || null, kind: it.kind, key: it.key, perfect: !!it.perfect, title: (e && e.title) || null, d: todayStr() };
    P.relics = [relic].concat(asList(P.relics)).slice(0, LEGACY.relicsMax);
    if (entry) entry.left = { type: "relic", kind: relic.kind, key: relic.key, perfect: relic.perfect, title: relic.title };
    return { from: P.visitor, fromName: P.vname || null, type: "relic", kind: relic.kind, key: relic.key, mood: LEGACY.relicMood };
  }
  if (leave.type === "skill") {
    const best = bestSkill(P);
    if (!best) return null;
    if (entry) entry.left = { type: "skill", skill: best[0], value: best[1], plus: LEGACY.skillPlus };
    return { from: P.visitor, fromName: P.vname || null, type: "skill", skill: best[0], plus: LEGACY.skillPlus };
  }
  return null;
}

// ---------- 退休換人（決定 0025） ----------
// 看完這些結局可以退休（理智歸零 russia8 本來就會換人）
export const RETIRE_ENDINGS = ["curator", "cellar", "museum"];
// 現在可不可以退休。how ＝ "ending"（看完結局）或 "office"（館長室的名片，自己退休）
// 回傳 { ok, reason }；reason：free 自由模式、dark 燈熄了（要走進那扇門）、bout 正在發作、cellar 正在地下、picking 還沒挑職業、
//   new 剛來（館長室退休要來了 LEGACY.retireDays 天以上；看完結局不用）。days ＝還要等幾天
export function retireCheck(P, how = "office") {
  if (!P || isFree(P)) return { ok: false, reason: "free" };
  if (P.dark || P.sanity <= 0) return { ok: false, reason: "dark" };
  if (P.bout) return { ok: false, reason: "bout" };
  if (P.cellar && P.cellar.run) return { ok: false, reason: "cellar" };
  if (!P.job) return { ok: false, reason: "picking" };
  if (how === "office") {
    const from = P.visit && P.visit.from;
    const stayed = from ? daysBetween(from, todayStr()) : Infinity; // 舊存檔不知道哪天來的：當成來很久了
    if (stayed < LEGACY.retireDays) return { ok: false, reason: "new", days: LEGACY.retireDays - stayed };
  }
  return { ok: true, reason: null };
}

// ---------- C. 選職業，再抽小優點、小缺點（決定 0028） ----------
// 翊文 11-08 選了「6 個職業自己選，再抽優缺點」：每一位參觀者（第一位也是）都一樣。以前換人時是從 3 位候選人挑（rollCandidates，拿掉了）。
// 抽一個小優點、一個小缺點（用 RNG）。job ＝選好的職業：notJob 的抽不到（抱枕職人不會是「手巧」）；同一類（tag）的不配在一起
export function rollTraits(job) {
  const okJob = t => !asList(t.notJob).includes(job);
  const perk = pickOne(PERKS.filter(okJob)) || null;
  const flaw = pickOne(FLAWS.filter(t => okJob(t) && !traitsClash(t, perk))) || null;
  return { perk: perk ? perk.id : null, flaw: flaw ? flaw.id : null };
}
// 開場的樣子：c ＝ { job, perk, flaw, skills（擲好的技能） }，加上前一位留下的（P.legacy）。
//   skills ＝加減之後的技能；delta ＝ { 技能: 加減多少 }；mood、sanity ＝開場心情、理智要加減多少；why ＝每一項是誰給的
//   （就是以前候選人卡片上算的 candidateStats，改了名字，算法沒改）
export function startStats(P, c) {
  const main = jobSkill(c.job), skills = Object.assign({}, c.skills), delta = {}, why = [];
  const add = (s, v) => { if (!v || typeof skills[s] !== "number") return; const before = skills[s]; skills[s] = clampN(before + v, 1, 99); delta[s] = (delta[s] || 0) + skills[s] - before; };
  [traitById(c.perk), traitById(c.flaw)].filter(Boolean).forEach(t => {
    if (t.others) { SKILLS.filter(s => s !== main).forEach(s => add(s, t.others)); why.push({ id: t.id, what: "others", v: t.others }); }
    if (t.skillName) { add(t.skillName, t.skillAdj); why.push({ id: t.id, what: "skill", skill: t.skillName, v: t.skillAdj }); }
  });
  const L = P && P.legacy;
  if (L && L.type === "skill") { add(L.skill, L.plus); why.push({ id: "legacy", what: "skill", skill: L.skill, v: L.plus }); }
  let mood = 0, sanity = 0;
  [traitById(c.perk), traitById(c.flaw)].filter(Boolean).forEach(t => {
    if (t.mood) { mood += t.mood; why.push({ id: t.id, what: "mood", v: t.mood }); }
    if (t.sanity) { sanity += t.sanity; why.push({ id: t.id, what: "sanity", v: t.sanity }); }
  });
  if (L && L.type === "relic" && L.mood) { mood += L.mood; why.push({ id: "legacy", what: "mood", v: L.mood }); }
  return { main, skills, delta, mood, sanity, why };
}
// 選職業（每一位參觀者都走這裡）：抽一個小優點、一個小缺點 → 擲技能 → 優缺點的加減、前一位留下的一次套用。
// 抽到就記在 P.perk、P.flaw，不能重抽：畫面要馬上存檔；已經選過職業（P.job 有值）、自由模式、沒有這個職業，都不做事，回傳 null。
// 回傳畫面要寫的東西：抽到什麼、技能（加減之後）和加減多少、開場心情和理智從多少變多少、賭徒再擲的心情
export function chooseJob(P, job) {
  if (!P || isFree(P) || P.job || !JOB_SKILL[job]) return null;
  const c = Object.assign({ job }, rollTraits(job));
  c.skills = rollSkills(job);
  const st = startStats(P, c);
  const moodFrom = P.mood, sanityFrom = P.sanity;
  const r = assignJob(P, job, st.skills); // 賭徒：心情再擲一次取高（在加減之前）
  P.perk = c.perk; P.flaw = c.flaw;
  P.mood = clampN(P.mood + st.mood, 0, 99);
  if (st.sanity) P.sanity = clampN(P.sanity + st.sanity, 1, maxSan(P));
  if (P.day && !P.day.lost) P.day.startSan = P.sanity; // 今天的理智從加減之後算（「失眠」開場 45，怪癖的 1/5 也照 45 算；11-08）
  P.cands = null; // 舊存檔還沒挑的候選人：選了職業就用不到了（以前挑了候選人也是清掉）
  return { job, perk: P.perk, flaw: P.flaw, main: r.main, value: P.skills[r.main], skills: Object.assign({}, P.skills), moodAgain: r.moodAgain || null,
    moodFrom, mood: P.mood, moodAdj: st.mood, sanityFrom, sanity: P.sanity, sanityAdj: st.sanity, delta: st.delta, why: st.why };
}

// ---------- 舊存檔補欄位（fixProfile 最後叫） ----------
// hadVisit ＝存檔裡本來就有 P.visit。沒有的話這一位是更新前就來的：起點用「上一位離開時累計做了幾隻」，來的那天、玩了多久不知道
export function fixLegacy(P, hadVisit) {
  if (!hadVisit) {
    const h = asList(P.history)[0];
    P.visit = { from: null, sec0: null, made0: h && typeof h.made === "number" ? h.made : 0, deepest: 0, understood: {}, where: null };
  }
  const v = P.visit;
  if (typeof v.made0 !== "number") v.made0 = 0;
  if (typeof v.deepest !== "number") v.deepest = 0;
  if (!v.understood || typeof v.understood !== "object" || Array.isArray(v.understood)) v.understood = {};
  // 多位參觀者（11-08）之前只有一位在館裡：到現在的累計相減就是這一位的，之後各記各的
  if (typeof v.made !== "number") v.made = Math.max(0, ((P.stats && P.stats.made) || 0) - v.made0);
  if (typeof v.sec !== "number") v.sec = typeof v.sec0 === "number" ? Math.max(0, (P.activeSec || 0) - v.sec0) : null;
  ["perk", "flaw"].forEach(k => { if (P[k] && !traitById(P[k])) P[k] = null; });
  P.cands = Array.isArray(P.cands) ? P.cands.filter(c => c && typeof c.job === "string" && c.skills && typeof c.skills === "object") : null;
  if (P.cands && !P.cands.length) P.cands = null;
  if (!P.legacy || typeof P.legacy !== "object" || Array.isArray(P.legacy)) P.legacy = null;
  P.relics = asList(P.relics).filter(r => r && typeof r.key === "string" && typeof r.kind === "string")
    .map(r => Object.assign({}, r, { key: r.kind === "pillow" ? normPillowKey(r.key) : normKey(r.key) }));
  return P;
}
