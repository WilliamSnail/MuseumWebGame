// ================================================================
//  一個帳號最多 3 位參觀者，同時在館裡、共用一間博物館（docs/決定/0018-多位參觀者共用博物館.md）
//  翊文 11-08：「玩家可以選擇和命名多個參觀者」；問答選了「同時好幾位，共用博物館」「3 位」。
//
//  做法：換人＝換欄位。
//    - 規則照舊讀 P.sanity 這些欄位。現在在場的那位，欄位就在 P 上。
//    - 不在場的那幾位放在 P.visitors：每位是一包 VISITOR_KEYS 的欄位，另外帶 cellarRun（正在走的地下）、dayVis（今天掉了多少理智）。
//    - 換人（switchVisitor）：把現在這位收進 P.visitors，再把要換的那位放出來。來回換要完全一樣（test/visitors.test.cjs）。
//    - 博物館的（收藏、靈感、解鎖、升級、P.day 的每天次數……）不跟著換。換人不會多拿次數。
//    - P.day 裡算這一位理智的（DAY_VIS_KEYS）：換人時收進這位的 dayVis（記日期）；換回來同一天就放回去，不同天照新的一天重算。
//    - 第幾位參觀者：每位自己記 visitor；新的號碼從博物館的 P.visitorCount 拿（takeVisitorNo），三個位子不會重號。
//    - 名字：玩家打的字，cleanName() 檢查（規矩跟暱稱一樣，server/store.js 的 cleanNick）。畫面上一律當純文字。
//    - 自由模式沒有位子：這裡的函式碰到自由模式都不做事。
//  存在 P 裡的（挑戰模式；newProfile 給預設，舊存檔由 fixVisitors 補）：
//    P.vid           現在這位的編號（"v" ＋第幾位），換人、合作時用來找人
//    P.vname         名字（null ＝還沒取，畫面寫「第 N 位參觀者」）
//    P.slot          在標題畫面的第幾個位子（0、1、2）。理智歸零換人，在同一個位子
//    P.visitors      不在場的那幾位
//    P.visitorCount  博物館發過幾個號碼
//  純函式：只改傳進來的 P，亂數用 RNG（rollExpr 裡）。
// ================================================================
import { LEGACY, NUM } from "./config.js";
import { asList, fixQuirks, isFree, rollExpr } from "./logic.js";
import { newVisit, traitById } from "./legacy.js";

// 「這一位的」欄位（維護日誌 11-08_翊文_參觀者繼承.md 的欄位表，加上 vid、vname、slot、hugDays、oddSeen、cands）。
//   cellar.run（正在走的地下）在 cellar 裡面，另外收成 cellarRun。
//   cands：以前「3 位候選人」還沒挑的（決定 0028 拿掉了，不再產生）。舊存檔裡有的照樣跟著那個位子走，不動它。
//   oddSeen：理智低的怪事，一位參觀者第一次出現才跳旁白（ui_odd.js）。
export const VISITOR_KEYS = ["vid", "vname", "slot", "visitor", "sanity", "mood", "moodRoll", "myth", "mythFrom", "quirks", "bout", "dark", "swapNext",
  "job", "skills", "skillTicks", "perk", "flaw", "legacy", "visit", "cands", "hugDays", "oddSeen", "gear"]; // gear：這一位穿著的裝備（裝備本身是博物館的，P.shop.gear，決定 0032）
// P.day 裡算這一位理智的：
//   startSan、lost、quirkGiven ＝ applySan 的「一天掉超過當天理智的 1/5 給怪癖」
//   exLoss ＝ sanCheck 的「同一件展品一天最多掉它的最大值」
//   views ＝ sanSpecFor 的「同一天看同一幅超過 8 次就不怕了」（只有這裡用到；畫廊的靈感次數是 reviews，留在博物館）
export const DAY_VIS_KEYS = ["startSan", "lost", "quirkGiven", "exLoss", "views"];

export const hasSlots = P => !!P && !isFree(P);
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const okSlot = s => Number.isInteger(s) && s >= 0 && s < LEGACY.slots;

// ---------- 名字 ----------
// 去頭尾空白、連續空白變一個；1–12 個字（LEGACY.nameMax）；不能有控制字元、零寬空白這些看不見的字。不合格回傳 null
export function cleanName(s) {
  if (typeof s !== "string") return null;
  const t = s.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!t || /\p{C}/u.test(t) || [...t].length > LEGACY.nameMax) return null;
  return t;
}
// 畫面上怎麼稱呼：有名字寫名字，沒有就「第 N 位參觀者」
export const visitorName = v => (v && v.vname) || `第 ${(v && v.visitor) || 1} 位參觀者`;

// ---------- 號碼 ----------
// 現在用過的最大號碼（舊存檔沒有 visitorCount：看現在這位、不在場的、歷任參觀者牆）
export function maxVisitorNo(P) {
  const ns = [P.visitorCount, P.visitor].concat(asList(P.visitors).map(v => v && v.visitor), asList(P.history).map(x => x && x.n));
  return ns.reduce((m, n) => (Number.isInteger(n) && n > m ? n : m), 0);
}
// 發一個新號碼（第幾位參觀者）
export function takeVisitorNo(P) {
  P.visitorCount = maxVisitorNo(P) + 1;
  return P.visitorCount;
}

// ---------- 收起來、放出來 ----------
// 現在這位收成一包（不改 P）
export function packVisitor(P) {
  const v = {};
  VISITOR_KEYS.forEach(k => { v[k] = P[k] === undefined ? null : P[k]; });
  v.cellarRun = (P.cellar && P.cellar.run) || null;
  v.dayVis = P.day ? DAY_VIS_KEYS.reduce((o, k) => { o[k] = P.day[k]; return o; }, { date: P.day.date }) : null;
  return v;
}
// 新的一天（或剛來的人）：這一位今天還沒掉理智
export function freshDayVis(P) { return { startSan: P.sanity, lost: 0, quirkGiven: false, exLoss: {}, views: {} }; }
// 把一包放到 P 上，當成現在這位
export function wearVisitor(P, v) {
  VISITOR_KEYS.forEach(k => { P[k] = v[k] === undefined ? null : v[k]; });
  if (P.cellar) P.cellar.run = v.cellarRun || null;
  if (P.day) {
    const d = v.dayVis;
    if (d && d.date === P.day.date) DAY_VIS_KEYS.forEach(k => { P.day[k] = d[k]; }); // 同一天換回來：照原本的放回去
    else Object.assign(P.day, freshDayVis(P)); // 不同天：照新的一天重算
  }
  return P;
}
// 剛進門的一位（還沒選職業）。o 蓋過預設
export function blankVisitor(P, o = {}) {
  return Object.assign({
    vid: null, vname: null, slot: 0, visitor: 1, sanity: NUM.startSanity, mood: 50, moodRoll: [], myth: 0, mythFrom: {}, quirks: [], bout: null, dark: false, swapNext: false,
    job: null, skills: null, skillTicks: {}, perk: null, flaw: null, legacy: null, visit: newVisit(P), cands: null, hugDays: [], oddSeen: {}, gear: [],
    cellarRun: null, dayVis: null,
  }, o);
}

// ---------- 三個位子 ----------
// 每個位子：null（空的）或 { vid, vname, name, slot, visitor, job, perk, flaw（小優點、小缺點，沒有是 null）, sanity, maxSan, mood, myth, dark, picking（還沒挑職業）, current（現在在場、上次玩的那位） }
export function visitorSlots(P) {
  const out = Array.from({ length: LEGACY.slots }, () => null);
  if (!hasSlots(P)) return out;
  const card = (v, current) => ({ vid: v.vid, vname: v.vname || null, name: visitorName(v), slot: v.slot, visitor: v.visitor, job: v.job || null,
    perk: (traitById(v.perk) && v.perk) || null, flaw: (traitById(v.flaw) && v.flaw) || null,
    sanity: v.sanity, maxSan: 99 - (v.myth || 0), mood: v.mood, myth: v.myth || 0, dark: !!v.dark, picking: !v.job, current, work: !current && isObj(v.work) ? v.work : null });
  [P].concat(asList(P.visitors)).forEach((v, i) => { if (v && okSlot(v.slot) && !out[v.slot]) out[v.slot] = card(v, i === 0); });
  return out;
}
export function freeSlots(P) { return visitorSlots(P).map((s, i) => (s ? -1 : i)).filter(i => i >= 0); }
export const visitorTotal = P => (hasSlots(P) ? 1 + asList(P.visitors).length : 0);

// 換人：vid 那位放出來，現在這位收進 P.visitors。回傳有沒有換成（本來就是那位也算）
export function switchVisitor(P, vid) {
  if (!hasSlots(P)) return false;
  if (P.vid === vid) return true;
  const list = asList(P.visitors);
  const i = list.findIndex(v => v && v.vid === vid);
  if (i < 0) return false;
  const next = list[i];
  if (next.work) return false; // 在地下室工作的不能上場（決定 0064）
  list[i] = packVisitor(P);
  P.visitors = list;
  wearVisitor(P, next);
  return true;
}
// 在空位子加一位（不是整個帳號的第一位：那位是 newProfile 做的）。
// 現在這位收進 P.visitors，新的那位放出來：擲心情（3D6 × 5）。職業還沒選：畫面接著從 6 個職業選、抽小優缺點（legacy.js 的 chooseJob，決定 0028）。
// 回傳心情的骰子，另外帶 vid、slot；沒有空位子、自由模式、名字不合格回傳 null
export function addVisitor(P, name, slot) {
  if (!hasSlots(P)) return null;
  const nm = cleanName(name);
  if (!nm) return null;
  const open = freeSlots(P);
  if (!open.length) return null;
  const s = open.includes(slot) ? slot : open[0];
  // 沒有 P.day（還沒進過館）：不在這裡開新的一天。進館時 ensureDay 會照現在這位的理智算（「今天」照台灣時間 05:00 換日，決定 0019）
  P.visitors = asList(P.visitors).concat([packVisitor(P)]);
  const n = takeVisitorNo(P);
  const r = rollExpr("3D6");
  wearVisitor(P, blankVisitor(P, { vid: "v" + n, vname: nm, slot: s, visitor: n, mood: r.total * 5, moodRoll: r.faces }));
  return Object.assign(r, { vid: P.vid, slot: s });
}
// ---------- 欠款送去地下工作（決定 0064 第二部分；錢和理智在伺服器的錢包 w.work，這裡只記「這位在工作」） ----------
// 能送下去的：選過職業、燈沒熄、沒在工作的（現在這位也可以）
export function workCandidates(P) {
  if (!hasSlots(P)) return [];
  return [P].concat(asList(P.visitors)).filter(v => v && v.job && !v.dark && !v.work);
}
// 現在這位被送下去時，可以換上場的（不在場、選過職業、燈沒熄、沒在工作）
export const workBench = P => (hasSlots(P) ? asList(P.visitors).filter(v => v && v.job && !v.dark && !v.work) : []);
// 誰在工作（不在場的那幾位裡）
export const workingVisitor = P => (hasSlots(P) ? asList(P.visitors).find(v => v && isObj(v.work)) || null : null);
// 送 vid 下去：現在這位的話先換別人上場（沒人可換回 null，畫面要先開壹位新的）。回傳那位（在 P.visitors 裡），不行回 null
export function sendToWork(P, vid, day) {
  if (!hasSlots(P) || workingVisitor(P)) return null;
  if (P.vid === vid) {
    if (!P.job || P.dark) return null;
    const other = workBench(P)[0];
    if (!other || !switchVisitor(P, other.vid)) return null;
  }
  const v = asList(P.visitors).find(x => x && x.vid === vid);
  if (!v || !v.job || v.dark || v.work) return null;
  v.work = { since: day };
  return v;
}
// 回來：拿掉工作的記號，理智換成工作完的（夾在 1 和他的上限之間）。vid 沒給就是在工作的那位。回傳那位，沒有回 null
export function backFromWork(P, vid, san) {
  if (!hasSlots(P)) return null;
  const v = asList(P.visitors).find(x => x && isObj(x.work) && (vid == null || x.vid === vid));
  if (!v) return null;
  delete v.work;
  if (Number.isFinite(san)) v.sanity = Math.max(1, Math.min(99 - (v.myth || 0), Math.floor(san)));
  return v;
}

// 改名字（現在這位或不在場的）。回傳改好的名字；名字不合格、找不到人回傳 null
export function renameVisitor(P, vid, name) {
  if (!hasSlots(P)) return null;
  const nm = cleanName(name);
  if (!nm) return null;
  const v = P.vid === vid ? P : asList(P.visitors).find(x => x && x.vid === vid);
  if (!v) return null;
  v.vname = nm;
  return nm;
}

// ---------- 舊存檔補欄位（fixProfile 最後叫） ----------
// 舊存檔：現在這位變成第一個位子，名字先空著（畫面寫「第 N 位參觀者」，卡片上可以改）
function fixPack(P, v) {
  const b = blankVisitor(P, { visit: null });
  Object.keys(b).forEach(k => { if (v[k] === undefined) v[k] = b[k]; });
  ["mythFrom", "skillTicks", "oddSeen"].forEach(k => { if (!isObj(v[k])) v[k] = {}; });
  ["quirks", "hugDays", "moodRoll"].forEach(k => { if (!Array.isArray(v[k])) v[k] = []; });
  v.quirks = fixQuirks(v.quirks); // 怪癖的 until、task（11-09，決定 0027）：不在場的也從載入這一刻起算
  ["sanity", "mood", "myth"].forEach(k => { if (typeof v[k] !== "number" || !isFinite(v[k])) v[k] = b[k]; });
  if (!isObj(v.visit)) v.visit = { from: null, sec0: null, made0: 0, deepest: 0, understood: {}, where: null };
  if (!isObj(v.visit.understood)) v.visit.understood = {};
  ["perk", "flaw"].forEach(k => { if (v[k] && !traitById(v[k])) v[k] = null; });
  v.cands = Array.isArray(v.cands) ? v.cands.filter(c => c && typeof c.job === "string" && isObj(c.skills)) : null;
  if (v.cands && !v.cands.length) v.cands = null;
  if (!isObj(v.legacy)) v.legacy = null;
  if (!isObj(v.dayVis)) v.dayVis = null;
  if (!isObj(v.cellarRun)) v.cellarRun = null;
  if (v.work !== undefined && !(isObj(v.work) && typeof v.work.since === "string")) delete v.work; // 決定 0064：在地下工作的記號
  v.vname = cleanName(v.vname);
  return v;
}
// raw ＝讀進來的原本那份（fixProfile 先把 newProfile 的預設蓋上去了，要看原本有沒有 vid）
export function fixVisitors(P, raw) {
  if (!hasSlots(P)) return P;
  if (!Number.isInteger(P.visitor) || P.visitor < 1) P.visitor = 1;
  if (raw && typeof raw === "object" && typeof raw.vid !== "string") P.vid = null; // 舊存檔：下面用 "v" ＋第幾位
  if (!isObj(P.oddSeen)) P.oddSeen = {};
  P.vname = cleanName(P.vname);
  P.visitors = asList(P.visitors).filter(isObj).map(v => fixPack(P, v));
  P.visitorCount = maxVisitorNo(P);
  // 號碼不能重複：重複的（或沒有號碼的）發新的
  const used = new Set([P.visitor]);
  P.visitors.forEach(v => { if (!Number.isInteger(v.visitor) || v.visitor < 1 || used.has(v.visitor)) v.visitor = takeVisitorNo(P); used.add(v.visitor); });
  // 編號：舊存檔沒有就用 "v" ＋第幾位；重複的換掉
  const vids = new Set();
  [P].concat(P.visitors).forEach(v => { if (typeof v.vid !== "string" || !v.vid || vids.has(v.vid)) v.vid = "v" + v.visitor; while (vids.has(v.vid)) v.vid += "b"; vids.add(v.vid); });
  // 位子：現在這位先拿（舊存檔沒有就是第一個位子）；重複的、壞掉的換到空位子。坐不下的不刪，位子記 null（畫面上不出現）
  const taken = new Set();
  [P].concat(P.visitors).forEach(v => {
    if (!okSlot(v.slot) || taken.has(v.slot)) { let s = 0; while (s < LEGACY.slots && taken.has(s)) s++; v.slot = s < LEGACY.slots ? s : null; }
    if (v.slot != null) taken.add(v.slot);
  });
  return P;
}
