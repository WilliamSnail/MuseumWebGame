// ================================================================
//  線索 → 你看懂了（每週劇情的神秘線；規則給網頁和伺服器共用，不碰 DOM）
//  內容怎麼寫：content/README.md「線索和看懂」；排程怎麼用：content/排程說明.md 一之四
//    dN.json 裡，書、房間（adds）、今日特展的畫（show.works）可以加 "clue": "c-xxx"
//    dN.json 的 "understand": [{ id: "u-xxx", need: ["c-a", …], from, text, hint }]
//  存檔：P.clues = { 線索 id: 拿到的日期 }；看懂了的寫進 P.understood（跟《看懂的事》同壹本）
//  拿到線索：悄悄記，沒有任何提示。集齊壹組：回傳 understood 事件（畫面跳「你看懂了」）。不扣理智、不發作
//  線索從哪裡算「拿到」：書讀完、房間找到、今日特展的畫看過（都是 P.story 已經有的紀錄，所以舊資料也補得上）
//  舊週拿不到的（沒找到的房間、沒看的畫）不卡：need 只算「已經拿到」或「還拿得到」的
// ================================================================
import { NUM } from "./config.js";
import { addDays, isFree } from "./logic.js";
import { isoMonday, isoWeek, storyState, weekDayNo } from "./story.js";

const clObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const clList = v => Array.isArray(v) ? v : [];
const clStr = v => typeof v === "string" ? v : "";
export const CLUE_ID_RE = /^c-[a-z0-9]+(-[a-z0-9]+)*$/;
export const UNDERSTAND_ID_RE = /^u-[a-z0-9]+(-[a-z0-9]+)*$/;

// 把 lib 裡「今天以前」的天整理成：sources（哪裡有線索）、defs（哪些看懂）。壞資料略過，不丟錯
let clCache = { lib: null, today: null, cat: null };
export function clueCatalog(lib, today) {
  if (clCache.lib === lib && clCache.today === today && clCache.cat) return clCache.cat;
  const cat = { sources: [], defs: [], weeks: {} };
  const weeks = lib && clObj(lib.weeks) ? lib.weeks : {};
  if (typeof today === "string") Object.keys(weeks).sort().forEach(label => {
    const monday = isoMonday(label), pack = weeks[label];
    if (!monday || !pack || !clObj(pack.days) || label < NUM.story.startWeek) return;
    if (monday <= today) cat.weeks[label] = { title: clStr(clObj(pack.week) && pack.week.title), question: clStr(clObj(pack.week) && pack.week.question) };
    for (let n = 1; n <= 7; n++) {
      const d = pack.days[n], date = addDays(monday, n - 1);
      if (!clObj(d) || date > today) continue;
      const p = `${label}/`, at = { week: label, day: n, date };
      clList(d.books).forEach(b => { if (clObj(b) && clStr(b.clue) && clStr(b.id)) cat.sources.push(Object.assign({ clue: b.clue, kind: "book", sid: p + b.id, title: clStr(b.title) }, at)); });
      clList(d.adds).forEach(r => { if (clObj(r) && clStr(r.clue) && clStr(r.id)) cat.sources.push(Object.assign({ clue: r.clue, kind: "room", sid: "s:" + p + r.id, title: clStr(r.title) }, at)); });
      clList(d.show && d.show.works).forEach(w => { if (clObj(w) && clStr(w.clue) && clStr(w.id)) cat.sources.push(Object.assign({ clue: w.clue, kind: "work", sid: p + w.id, title: clStr(w.title) }, at)); });
      clList(d.understand).forEach(u => {
        if (!clObj(u) || !clStr(u.id) || !clStr(u.text) || !clList(u.need).length) return;
        cat.defs.push(Object.assign({ id: u.id, need: clList(u.need).filter(c => clStr(c)), from: clStr(u.from), text: u.text, hint: clStr(u.hint) }, at));
      });
    }
  });
  clCache = { lib, today, cat };
  return cat;
}

const clHeld = (P, id) => clObj(P.clues) && !!P.clues[id];
// 這個來源現在還拿不拿得到：書永遠讀得到（舊週的書補讀）；房間只有這週找得到；畫只有當天，或週日的回顧展
function clReachable(src, today) {
  if (src.kind === "book") return true;
  if (src.week !== isoWeek(today)) return false;
  if (src.kind === "room") return true;
  return src.date === today || (weekDayNo(today) >= 7 && src.day < 7);
}
function clGot(S, src) {
  if (src.kind === "book") return !!(S.books[src.sid] && S.books[src.sid].read);
  if (src.kind === "room") return !!S.spots[src.sid];
  return !!S.works[src.sid];
}
// 還拿得到的線索 id（集合）
function clReachSet(cat, today) {
  const set = new Set();
  cat.sources.forEach(s => { if (clReachable(s, today)) set.add(s.clue); });
  return set;
}

// 把 P.story 裡讀過、找到、看過的記進 P.clues（不重複、舊的日期不改）。回傳這次新拿到的線索 id
export function gatherClues(P, lib, today) {
  if (!clObj(P.clues)) P.clues = {};
  const S = storyState(P), got = [];
  clueCatalog(lib, today).sources.forEach(s => {
    if (!P.clues[s.clue] && clGot(S, s)) { P.clues[s.clue] = today; got.push(s.clue); }
  });
  return got;
}

// 撿到線索時那句很淡的話（翊文 11-10：「撿到線索時給一句很淡的話……不說是哪個謎」）。照線索 id 固定挑壹句，同壹條每次都壹樣
export const CLUE_WHISPERS = {
  book: ["這壹頁的字，你好像在哪裡看過。", "書合上了，有壹行還留在腦子裡。", "讀完了。你又回頭看了壹次那個數字。"],
  room: ["這個房間裡，有壹樣東西擺得太整齊了。", "走出來以後，你還記得牆角的那壹樣。"],
  work: ["這幅畫的角落，你多看了壹眼。", "畫裡有個地方，跟你記得的不太壹樣。"],
};
export function clueWhisper(kind, id) {
  const list = CLUE_WHISPERS[kind] || CLUE_WHISPERS.book;
  let n = 0;
  for (const ch of String(id)) n = (n * 31 + ch.codePointAt(0)) % 9973;
  return list[n % list.length];
}
// 記線索，回傳這次新撿到的：[{ clue, kind, title, text }]（text ＝那句很淡的話）。網頁在 clueSync 前面叫，有才提示
export function clueNew(P, lib, today) {
  if (!P || typeof P !== "object" || isFree(P) || typeof today !== "string") return [];
  try {
    const got = gatherClues(P, lib, today);
    if (!got.length) return [];
    const S = storyState(P), src = clueCatalog(lib, today).sources;
    return got.map(id => { const s = src.find(x => x.clue === id && clGot(S, x)) || { kind: "book", title: "" }; return { clue: id, kind: s.kind, title: s.title || "", text: clueWhisper(s.kind, id) }; });
  } catch (e) { return []; }
}
// 疑點簿要畫的（翊文 11-10：「只列開著的疑問和你已經撿到的線索出處……不解釋」）
//   weeks：[{ week, title, question, now（是不是這週）, got: [{ sid, kind, title, day, date }], left（這週還拿得到、還沒撿的有幾個地方） }]，新的週在前
//   這週有疑點就列（就算還沒撿到）；以前的週要撿到過才列。near 跟《看懂的事》同壹份（還差幾條、提示）
export function casebookView(P, lib, today) {
  const out = { weeks: [], near: [] };
  if (!P || typeof P !== "object" || isFree(P) || typeof today !== "string") return out;
  try {
    const cat = clueCatalog(lib, today), S = storyState(P), cur = isoWeek(today), by = {};
    const weekOf = label => by[label] || (by[label] = Object.assign({ week: label, title: "", question: "" }, cat.weeks[label], { now: label === cur, got: [], left: 0 }));
    if (cat.weeks[cur] && cat.weeks[cur].question) weekOf(cur);
    const leftSeen = new Set(); // 這週還拿得到、還沒撿的（這週沒列出來就不算）
    cat.sources.forEach(s => {
      if (clHeld(P, s.clue)) {
        if (!clGot(S, s)) return; // 同壹條線索有好幾個出處：只列真的讀過、看過的
        const w = weekOf(s.week);
        if (!w.got.some(g => g.sid === s.sid)) w.got.push({ sid: s.sid, kind: s.kind, title: s.title, day: s.day, date: P.clues[s.clue] });
      } else if (s.week === cur && clReachable(s, today)) leftSeen.add(s.clue);
    });
    if (by[cur]) by[cur].left = leftSeen.size;
    out.weeks = Object.values(by).sort((a, b) => (a.week < b.week ? 1 : -1));
    out.near = understandView(P, lib, today).near;
  } catch (e) { /* 壞資料：畫空的 */ }
  return out;
}

// 每次 updateStatus 叫（網頁的 storyTick）：記線索、看有沒有集齊。回傳 understood 事件（沒有就是空陣列）
// 事件：{ type: "understood", id, from, text, hint, insp, n }。n ＝這幾週看懂了幾件
export function clueSync(P, lib, today) {
  if (!P || typeof P !== "object" || isFree(P) || typeof today !== "string") return [];
  try {
    gatherClues(P, lib, today);
    if (!clObj(P.understood)) P.understood = {};
    const cat = clueCatalog(lib, today), reach = clReachSet(cat, today), out = [];
    cat.defs.forEach(def => {
      if (P.understood[def.id]) return;
      if (!def.need.some(c => clHeld(P, c)) || !def.need.every(c => clHeld(P, c) || !reach.has(c))) return;
      P.understood[def.id] = today;
      if (clObj(P.visit)) { if (!clObj(P.visit.understood)) P.visit.understood = {}; P.visit.understood[def.id] = true; }
      const insp = Math.max(0, +NUM.story.understandInsp || 0);
      P.insp = (+P.insp || 0) + insp;
      out.push({ type: "understood", id: def.id, from: def.from, text: def.text, hint: def.hint, insp, n: cat.defs.filter(x => P.understood[x.id]).length });
    });
    return out;
  } catch (e) { return []; }
}

// 《看懂的事》要畫的：done ＝已經看懂的（照日期排）、near ＝拿到壹部分、還差幾條（不給 text）。壹條都沒拿到的不列（不破梗）
export function understandView(P, lib, today) {
  const out = { done: [], near: [] };
  if (!P || typeof P !== "object" || typeof today !== "string") return out;
  try {
    const cat = clueCatalog(lib, today), reach = clReachSet(cat, today);
    cat.defs.forEach(def => {
      if (clObj(P.understood) && P.understood[def.id]) { out.done.push({ id: def.id, from: def.from, text: def.text, date: P.understood[def.id] }); return; }
      const have = def.need.filter(c => clHeld(P, c)).length, left = def.need.filter(c => !clHeld(P, c) && reach.has(c)).length;
      if (have > 0 && left > 0) out.near.push({ id: def.id, left, hint: def.hint });
    });
  } catch (e) { /* 壞資料：畫空的 */ }
  return out;
}
