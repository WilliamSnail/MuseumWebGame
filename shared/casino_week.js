// ================================================================
//  Hamachi 賭場的每週收藏（決定 0042）
//  翊文 11-09：「賭場的那些收藏品之類的也可以有每週進度嗎，跟劇情整合」
//
//  內容寫在每週內容裡：content/weeks/<週>/week.json 的 casino（格式 content/README.md 第二節）：
//    { "title", "intro", "items": [3～5 件 { id, name, desc, when: { type, n } }], "reward": { title, souvenir: { name, desc }, story: { title, pages } } }
//  每天的 dN.json 可以再加 casino: { item: {…一件加碼的…}, note: "多一段話" }。
//  收藏品就是賭場「財產」（紀念品）：條件達成就進錢包的 props，id 是 wk:週:收藏品 id。過了那週也留著。
//
//  誰說了算：進度只在伺服器的錢包裡算（w.wk.c 是這週的統計，w.wk.got 是這週拿到哪幾件）。
//    打完一手、開大禮包、吃餐車的時候，shared/casino_wallet.js 裡的規則叫 casWkHand／casWkPacks／casWkMeal 加統計；
//    每一步結束，Functions 叫 casWkSync 看有沒有新的收藏品達成（同一個交易）。畫面只拿到結果，改畫面作不了弊。
//  換週：週一 05:00（casWalletFix 傳進來的台灣日期算出的 ISO 週）。換週時把上一週收進 w.wkLog，統計歸零。
//    過期的週不懲罰：拿到的財產留著；沒拿到的就過了；上一週已經集滿、還沒領的週章，之後還是可以補領。
//  集滿：這週 week.json 裡的收藏品全拿到（每天加碼的不算條件），錢包發紀念品財產＋稱號；週章和故事要按「領」（伺服器寫存檔，只領一次）。
//  純函式：「今天」「這週」從參數傳進來，不碰時鐘；沒有亂數。壞資料不丟錯（casWeekDef 把壞的丟掉、casWkFix 補欄位）。
//  沒有真錢：籌碼不是錢，這裡的獎勵只有紀念品、稱號、1 枚週章和一小段故事，沒有靈感。
// ================================================================
import { NUM } from "./config.js";
import { CAS_MENU } from "./casino_text.js";
import { addDays, asList } from "./logic.js";

const wkBox = v => !!v && typeof v === "object" && !Array.isArray(v);
const wkInt = (v, lo = 0, hi = 1e6) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.floor(+v))) : lo);
const wkChars = s => [...String(s)].length;
const WK_ID = /^[A-Za-z0-9_-]{1,32}$/, WK_LABEL = /^\d{4}-W\d{2}$/, WK_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---------- 條件的種類（排程只能從這裡挑；新的種類是改程式） ----------
// max：n 最多多少（一週做得到的範圍）；text：畫面上的一句話（n 帶入）。meal 的 meal 是餐車的餐點 id（不含大禮包券）
export const CAS_WK_CONDS = {
  wins: { max: 15, text: n => `這週贏 ${n} 手` },
  hands: { max: 30, text: n => `這週打完 ${n} 手牌` },
  blackjack: { max: 3, text: n => `這週拿到 ${n} 次黑傑克（前兩張就 21 點）` },
  charlie: { max: 2, text: n => `這週五張牌沒爆 ${n} 次` },
  dealerBust: { max: 5, text: n => `這週看荷官爆牌 ${n} 次` },
  push: { max: 5, text: n => `這週打成平手 ${n} 次` },
  streak: { max: 5, text: n => `這週連贏 ${n} 把` },
  table: { max: 10, text: n => `這週跟館友同桌打完 ${n} 手（要有人跟你同桌）` },
  packs: { max: 14, text: n => `這週開 ${n} 包大禮包` },
  bigPack: { max: 3, text: n => `這週開到 ${n} 包三星以上的大禮包` },
  meals: { max: 6, text: n => `這週在餐車吃過 ${n} 種不同的餐點` },
  meal: { max: 3, text: (n, c) => `這週在餐車點${casWkMealName(c && c.meal)}${n > 1 ? ` ${n} 次` : ""}` },
};
export const CAS_WK_MEALS = CAS_MENU.filter(m => !m.ticket && !m.redirect).map(m => m.id);
export function casWkMealName(id) {
  const m = CAS_MENU.find(x => x.id === id);
  return m ? m.name : "餐點";
}
export const CAS_WK_TYPES = Object.keys(CAS_WK_CONDS);
// 條件有什麼問題（空的＝沒問題）
export function casWkCondProblems(c) {
  if (!wkBox(c)) return ["when 要寫成 { type, n }"];
  const K = CAS_WK_CONDS[c.type], out = [];
  if (!K) return [`when.type 只能是 ${CAS_WK_TYPES.join("、")}`];
  const nMax = c.type === "meals" ? Math.min(K.max, CAS_WK_MEALS.length) : K.max;
  if (!Number.isInteger(c.n) || c.n < 1 || c.n > nMax) out.push(`when.n 要是 1～${nMax} 的整數（${c.type}）`);
  if (c.type === "meal" && !CAS_WK_MEALS.includes(c.meal)) out.push(`when.meal 要是餐車的餐點（${CAS_WK_MEALS.join("、")}）`);
  return out;
}
export const casWkCondText = c => (wkBox(c) && CAS_WK_CONDS[c.type] ? CAS_WK_CONDS[c.type].text(Math.max(1, wkInt(c.n, 1, 99)), c) : "");

// ---------- 一週的統計 ----------
export const casWkCNew = () => ({ hands: 0, wins: 0, pushes: 0, blackjacks: 0, charlies: 0, dealerBusts: 0, tableHands: 0, packs: 0, bigPacks: 0, cur: 0, streak: 0, meals: {} });
export const casWkNew = label => ({ week: label || null, c: casWkCNew(), got: {}, done: null, claimed: null });
const WK_COUNTERS = Object.keys(casWkCNew()).filter(k => k !== "meals");
// 讀回來的樣子補好、壞的丟掉（不丟錯）
export function casWkFix(wk) {
  const base = casWkNew(null);
  if (!wkBox(wk)) return base;
  const out = { week: typeof wk.week === "string" && WK_LABEL.test(wk.week) ? wk.week : null, c: casWkCNew(), got: {}, done: null, claimed: null };
  const c = wkBox(wk.c) ? wk.c : {};
  WK_COUNTERS.forEach(k => { out.c[k] = wkInt(c[k]); });
  if (wkBox(c.meals)) CAS_WK_MEALS.forEach(id => { if (wkInt(c.meals[id])) out.c.meals[id] = wkInt(c.meals[id]); });
  if (wkBox(wk.got)) Object.keys(wk.got).slice(0, 40).forEach(id => { if (WK_ID.test(id) && typeof wk.got[id] === "string" && WK_DATE.test(wk.got[id])) out.got[id] = wk.got[id]; });
  if (typeof wk.done === "string" && WK_DATE.test(wk.done)) out.done = wk.done;
  if (typeof wk.claimed === "string" && WK_DATE.test(wk.claimed)) out.claimed = wk.claimed;
  return out;
}
// 錢包換週：上一週收進 wkLog（只留 NUM.casino.week.keepWeeks 週），這週統計歸零。label 是這週的名字（2026-W46）；沒給就只補欄位
export function casWkRoll(w, label) {
  w.wk = casWkFix(w.wk);
  if (!wkBox(w.wkLog)) w.wkLog = {};
  Object.keys(w.wkLog).forEach(k => { const e = w.wkLog[k]; w.wkLog[k] = { got: wkInt(e && e.got, 0, 40), done: e && typeof e.done === "string" && WK_DATE.test(e.done) ? e.done : null, claimed: e && typeof e.claimed === "string" && WK_DATE.test(e.claimed) ? e.claimed : null }; if (!WK_LABEL.test(k)) delete w.wkLog[k]; });
  if (!label || !WK_LABEL.test(label)) return w.wk;
  if (w.wk.week !== label) {
    const old = w.wk;
    if (old.week && (old.done || Object.keys(old.got).length)) w.wkLog[old.week] = { got: Object.keys(old.got).length, done: old.done, claimed: old.claimed };
    w.wk = casWkNew(label);
    Object.keys(w.wkLog).sort().slice(0, Math.max(0, Object.keys(w.wkLog).length - NUM.casino.week.keepWeeks)).forEach(k => { delete w.wkLog[k]; });
  }
  return w.wk;
}
// 加統計（casino_wallet.js 的 casSettle／casOpenPacks／casBuy 叫）。o：{ kind, why, withOthers }
export function casWkHand(w, o) {
  const c = (w.wk = casWkFix(w.wk)).c;
  c.hands++;
  if (o.kind === "win" || o.kind === "blackjack" || o.kind === "charlie") { c.wins++; c.cur++; c.streak = Math.max(c.streak, c.cur); }
  else if (o.kind === "lose") c.cur = 0;
  else c.pushes++;
  if (o.kind === "blackjack") c.blackjacks++;
  if (o.kind === "charlie") c.charlies++;
  if (o.why === "dealerBust") c.dealerBusts++;
  if (o.withOthers) c.tableHands++;
}
export function casWkPacks(w, packs) {
  const c = (w.wk = casWkFix(w.wk)).c;
  asList(packs).forEach(p => { c.packs++; if (p && p.stars >= 3) c.bigPacks++; });
}
export function casWkMeal(w, id) {
  const c = (w.wk = casWkFix(w.wk)).c;
  if (CAS_WK_MEALS.includes(id)) c.meals[id] = (c.meals[id] || 0) + 1;
}
// 這個條件現在做到多少
export function casWkValue(c, cond) {
  if (!wkBox(c) || !wkBox(cond)) return 0;
  switch (cond.type) {
    case "wins": return wkInt(c.wins);
    case "hands": return wkInt(c.hands);
    case "blackjack": return wkInt(c.blackjacks);
    case "charlie": return wkInt(c.charlies);
    case "dealerBust": return wkInt(c.dealerBusts);
    case "push": return wkInt(c.pushes);
    case "streak": return wkInt(c.streak);
    case "table": return wkInt(c.tableHands);
    case "packs": return wkInt(c.packs);
    case "bigPack": return wkInt(c.bigPacks);
    case "meals": return wkBox(c.meals) ? Object.keys(c.meals).filter(id => wkInt(c.meals[id]) > 0).length : 0;
    case "meal": return wkBox(c.meals) ? wkInt(c.meals[cond.meal]) : 0;
    default: return 0;
  }
}
export const casWkMet = (c, cond) => casWkCondProblems(cond).length === 0 && casWkValue(c, cond) >= cond.n;

// ---------- 內容：檢查、整理 ----------
export function casWkItemProblems(raw) {
  if (!wkBox(raw)) return ["要寫成 { id, name, desc, when }"];
  const N = NUM.casino.week, out = [];
  if (typeof raw.id !== "string" || !WK_ID.test(raw.id)) out.push("id 只能用英文、數字、-、_（最多 32 字）");
  if (typeof raw.name !== "string" || !raw.name.trim()) out.push("name 要有字");
  else if (wkChars(raw.name.trim()) > NUM.casino.titleMax) out.push(`name 太長了（${wkChars(raw.name.trim())} 字，最多 ${NUM.casino.titleMax}）`);
  if (typeof raw.desc !== "string" || !raw.desc.trim()) out.push("desc 要有字");
  else if (wkChars(raw.desc.trim()) > N.descMax) out.push(`desc 太長了（${wkChars(raw.desc.trim())} 字，最多 ${N.descMax}）`);
  return out.concat(casWkCondProblems(raw.when));
}
// 整理一週的 casino（week.json 的）。回傳 null＝沒有或不能用。壞的收藏品丟掉；剩下不到 itemsMin 件就整段不用（不丟錯）
function wkReward(r) {
  const N = NUM.casino.week;
  if (!wkBox(r) || !wkBox(r.souvenir) || typeof r.title !== "string" || !r.title.trim() || typeof r.souvenir.name !== "string" || !r.souvenir.name.trim()) return null;
  const st = wkBox(r.story) ? r.story : {}, pages = asList(st.pages).filter(p => typeof p === "string" && p.trim()).slice(0, N.storyPagesMax);
  return {
    title: [...r.title.trim()].slice(0, NUM.casino.titleMax).join(""),
    souvenir: { name: [...r.souvenir.name.trim()].slice(0, NUM.casino.titleMax).join(""), desc: typeof r.souvenir.desc === "string" ? [...r.souvenir.desc.trim()].slice(0, N.souvenirDescMax).join("") : "" },
    story: { title: typeof st.title === "string" ? [...st.title.trim()].slice(0, 16).join("") : "", pages: pages.map(p => p.trim()) },
  };
}
// pack：{ week: week.json, days: { 1: d1.json, … } }（story.js 的 storyLibrary 整理過的一週，或 copy_shared 打包給 Functions 的）
// label：2026-W46；monday：這週的週一（算每天的日期）。回傳 { label, title, intro, items, notes, reward } 或 null
// items：[{ id, name, desc, when, day, date, extra }]（week.json 的在前，day 1；每天加碼的 extra: true，date 是那天）
export function casWeekDef(pack, label, monday) {
  const wk = wkBox(pack) && wkBox(pack.week) ? pack.week : null, raw = wk && wkBox(wk.casino) ? wk.casino : null;
  if (!raw || !WK_LABEL.test(String(label)) || typeof monday !== "string" || !WK_DATE.test(monday)) return null;
  const N = NUM.casino.week, seen = new Set(), items = [], notes = [];
  const reward = wkReward(raw.reward);
  asList(raw.items).slice(0, N.itemsMax).forEach(it => {
    if (casWkItemProblems(it).length || seen.has(it.id)) return;
    seen.add(it.id);
    items.push({ id: it.id, name: it.name.trim(), desc: it.desc.trim(), when: { type: it.when.type, n: it.when.n, meal: it.when.meal }, day: 1, date: monday, extra: false });
  });
  if (items.length < N.itemsMin || !reward) return null;
  const days = wkBox(pack.days) ? pack.days : {};
  for (let n = 1; n <= 7; n++) {
    const d = wkBox(days[n]) && wkBox(days[n].casino) ? days[n].casino : null;
    if (!d) continue;
    const date = addDays(monday, n - 1);
    if (typeof d.note === "string" && d.note.trim() && wkChars(d.note.trim()) <= N.noteMax) notes.push({ day: n, date, text: d.note.trim() });
    if (d.item !== undefined && !casWkItemProblems(d.item).length && !seen.has(d.item.id) && items.filter(x => x.extra).length < N.extraMax * 7) {
      seen.add(d.item.id);
      items.push({ id: d.item.id, name: d.item.name.trim(), desc: d.item.desc.trim(), when: { type: d.item.when.type, n: d.item.when.n, meal: d.item.when.meal }, day: n, date, extra: true });
    }
  }
  return {
    label, line: typeof raw.line === "string" && WK_ID.test(raw.line) ? raw.line : null,
    title: typeof raw.title === "string" ? raw.title.trim() : "", intro: typeof raw.intro === "string" ? raw.intro.trim() : "",
    items, notes, reward,
  };
}
// 現在看得到的收藏品（那天 05:00 才打開）
export const casWkVisible = (def, today) => (def ? def.items.filter(it => it.date <= today) : []);
export const casWkBase = def => (def ? def.items.filter(it => !it.extra) : []);
export const casWkPropId = (label, id) => `wk:${label}:${id}`;
export const casWkDoneId = label => `wk:${label}`;

// ---------- 同步：統計夠了就發收藏品（Functions 每一步結束叫；同一個交易） ----------
// def：這週的 casWeekDef（沒有就不發）。回傳 { newItems: [{ id, name, desc }], completed: 是不是這一步集滿 }
export function casWkSync(w, def, day) {
  const out = { newItems: [], completed: false };
  w.wk = casWkFix(w.wk);
  if (!wkBox(w.props)) w.props = {};
  if (!wkBox(w.ach)) w.ach = {};
  if (!def || w.wk.week !== def.label || typeof day !== "string") return out;
  for (const it of casWkVisible(def, day)) {
    if (w.wk.got[it.id] || !casWkMet(w.wk.c, it.when)) continue;
    w.wk.got[it.id] = day;
    const pid = casWkPropId(def.label, it.id);
    if (!w.props[pid]) w.props[pid] = { n: 1, d: day, name: it.name, desc: it.desc };
    out.newItems.push({ id: it.id, name: it.name, desc: it.desc });
  }
  const base = casWkBase(def);
  if (!w.wk.done && base.length && base.every(it => w.wk.got[it.id])) {
    w.wk.done = day;
    out.completed = true;
    const sid = casWkDoneId(def.label);
    if (!w.props[sid]) w.props[sid] = { n: 1, d: day, name: def.reward.souvenir.name, desc: def.reward.souvenir.desc };
    if (!w.ach[sid]) w.ach[sid] = { d: day, name: def.reward.title };
  }
  return out;
}

// ---------- 畫面要的摘要（不含別人的東西，也不含還沒開放的內容：只有 id 和進度） ----------
export function casWkView(w, day) {
  const wk = casWkFix(w && w.wk), log = wkBox(w && w.wkLog) ? w.wkLog : {};
  return {
    week: wk.week, c: wk.c, got: wk.got, done: wk.done, claimed: wk.claimed, day: day || null,
    past: Object.keys(log).filter(k => WK_LABEL.test(k)).sort().reverse().map(k => ({ week: k, got: wkInt(log[k] && log[k].got, 0, 40), done: (log[k] && log[k].done) || null, claimed: (log[k] && log[k].claimed) || null })),
  };
}
// 這個條件的進度字：「2／3」
export const casWkProgress = (c, cond) => `${Math.min(casWkValue(c, cond), cond && cond.n ? cond.n : 0)}／${cond && cond.n ? cond.n : 0}`;
