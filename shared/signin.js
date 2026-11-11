// ================================================================
//  每日簽到、每週全簽到、只有簽到拿得到的東西（決定 0030）
//  翊文 11-09：「每日簽到要先做，可以獲得一些東西，每周全簽到也可以獲得 特別項目」
//             特別項目「都要有考慮進去」（佩佩部件、展台裝飾或名牌框、稀有的材料或道具）；一週是「週一到週日」
//             「遊戲要有一個簽到的日曆看看每日簽到程度，以及節日特別活動」「收到的東西馬上能用」
//
//  放哪裡：
//    - 簽到的紀錄是「帳號的」，一個帳號一份：SAVE.signin（跟 SAVE.notices 一樣放在整份存檔上，不在參觀者身上）。
//        { v, count（累計第幾次）, days: { 日期: { n（那天是累計第幾次）, k（七天一輪的第幾天）, hol（那天的節日 key 或 null） } },
//          weeks: { 週的號碼: { item（拿到的特別項目 id）, got（哪一天拿的）, dup（已經有了換成靈感） } } }
//    - 拿到的東西放進博物館（挑戰模式的 P，換參觀者不會跟著換）：
//        P.limited = { got: { id: 拿到的日期 }, wear: { stand: 展台裝飾 id, frame: 名牌框 id }, stock: { 材料名: 剩幾份 } }
//        帽子另外打開在 P.unlocked（手作坊才選得到）。
//    - 簽到只在挑戰模式；自由模式什麼都打開了（跟禁忌、突變的選項一樣），限定的也可以直接用。
//  一天＝台灣時間 05:00 換日（todayStr），一週＝週一 05:00 到下週一 05:00（logic3.js 的 weekIndex）。日期都由呼叫的人傳進來。
//  之後有伺服器：簽到改成伺服器判斷今天簽過沒（規劃第四節「每日簽到」），格式不變。
//  數字在 config.js 的 NUM.signin、LIMITED_ITEMS；文字在 content3.js 的 SIGNIN_TEXT、LIMITED_TEXT。
// ================================================================
import { LIMITED_ITEMS, NUM } from "./config.js";
import { LIMITED_TEXT } from "./content3.js";
import { addDays, clampN, grantOption, isFree, isUnlocked } from "./logic.js";
import { weekIndex } from "./logic3.js";
import { holidayOf, holidaysOn } from "./holidays.js";

export const SIGNIN_VERSION = 1;
const isDate = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isBox = v => !!v && typeof v === "object" && !Array.isArray(v);

// ---------- 存檔 ----------
export function newSignin() { return { v: SIGNIN_VERSION, count: 0, days: {}, weeks: {} }; }
// 舊存檔沒有 SAVE.signin、或壞掉的：補成空的（簽過的天數照留著的算）
export function fixSignin(s) {
  const out = newSignin();
  if (!isBox(s)) return out;
  if (isBox(s.days)) Object.entries(s.days).forEach(([d, x]) => { if (isDate(d) && isBox(x)) out.days[d] = { n: Number.isInteger(x.n) && x.n > 0 ? x.n : 0, k: Number.isInteger(x.k) ? x.k : 0, hol: typeof x.hol === "string" ? x.hol : null }; });
  if (isBox(s.weeks)) Object.entries(s.weeks).forEach(([w, x]) => { if (/^-?\d+$/.test(w) && isBox(x) && typeof x.item === "string") out.weeks[w] = { item: x.item, got: isDate(x.got) ? x.got : null, dup: !!x.dup }; });
  const n = Object.keys(out.days).length;
  out.count = Number.isInteger(s.count) && s.count >= n ? s.count : n;
  return out;
}
export function signinState(save) {
  if (!save.signin || !isBox(save.signin) || save.signin.v !== SIGNIN_VERSION) save.signin = fixSignin(save.signin);
  return save.signin;
}
// 博物館裡的限定收藏
export function fixLimited(b) {
  const out = { got: {}, wear: { stand: null, frame: null }, stock: {} };
  if (!isBox(b)) return out;
  if (isBox(b.got)) Object.entries(b.got).forEach(([id, d]) => { if (limitedItem(id)) out.got[id] = isDate(d) ? d : null; });
  if (isBox(b.wear)) ["stand", "frame"].forEach(k => { const id = b.wear[k], it = limitedItem(id); if (it && it.slot === k) out.wear[k] = id; });
  if (isBox(b.stock)) Object.entries(b.stock).forEach(([k, n]) => { if (Number.isInteger(n) && n > 0) out.stock[k] = n; });
  return out;
}
export function limitedBox(P) {
  if (!isBox(P.limited) || !isBox(P.limited.got) || !isBox(P.limited.wear) || !isBox(P.limited.stock)) P.limited = fixLimited(P.limited);
  return P.limited;
}

// ---------- 只有簽到拿得到的東西 ----------
export function limitedItem(id) { return LIMITED_ITEMS.find(x => x.id === id) || null; }
// 東西 + 文字（名字、哪一類、說明、「馬上使用」的字）
export function limitedInfo(id) {
  const it = limitedItem(id);
  if (!it) return null;
  const T = (typeof LIMITED_TEXT !== "undefined" && LIMITED_TEXT[id]) || {};
  return Object.assign({}, it, { name: T.name || it.opt || id, kindName: T.kind || "", desc: T.desc || "", use: T.use || "" });
}
// 有沒有（自由模式都有）
export function ownsLimited(P, id) {
  const it = limitedItem(id);
  if (!it || !P) return false;
  if (isFree(P)) return true;
  if (it.kind === "part") return isUnlocked(P, it.cat, it.opt);
  return !!limitedBox(P).got[id];
}
// 材料剩幾份（自由模式不用材料：當作用不完）
export function stockOf(P, opt) { return isFree(P) ? Infinity : limitedBox(P).stock[opt] || 0; }
// 做抱枕用掉一份材料（logic.js 的 makePillow 叫）。不是限定的材料就不用。回傳 true＝夠用
export function isLimitedMat(opt) { return LIMITED_ITEMS.some(x => x.kind === "mat" && x.opt === opt); }
export function useStock(P, opt) {
  if (isFree(P) || !isLimitedMat(opt)) return true;
  const box = limitedBox(P);
  if (!(box.stock[opt] > 0)) return false;
  box.stock[opt]--;
  if (!box.stock[opt]) delete box.stock[opt];
  return true;
}
// 給一樣限定的東西。n：材料給幾份（不給就用 LIMITED_ITEMS 的 n）。回傳 { id, kind, dup, insp, n, events }
//   帽子、裝飾已經有了：換成 NUM.signin.dupInsp 靈感（dup: true）。材料一直疊上去。
export function grantLimited(P, id, today, n) {
  const it = limitedItem(id), box = limitedBox(P);
  const out = { id, kind: it ? it.kind : null, dup: false, insp: 0, n: 0, events: [] };
  if (!it) return out;
  if (it.kind === "mat") {
    out.n = n || it.n || 1;
    box.stock[it.opt] = (box.stock[it.opt] || 0) + out.n;
    if (!box.got[id]) box.got[id] = today || null;
    return out;
  }
  const have = it.kind === "part" ? isUnlocked(P, it.cat, it.opt) : !!box.got[id];
  if (have) {
    out.dup = true; out.insp = NUM.signin.dupInsp;
    P.insp = (P.insp || 0) + out.insp;
    return out;
  }
  box.got[id] = today || null;
  if (it.kind === "part") out.events = grantOption(P, it.cat, it.opt, it.from || "signin"); // from：主題展、每週特展給的（決定 0035）
  return out;
}
// 換上展台裝飾、名牌框（id 給 null 加 slot＝拿下來）。沒有的不能換
export function wearDeco(P, id, slot) {
  const box = limitedBox(P);
  if (id == null) { if (slot === "stand" || slot === "frame") box.wear[slot] = null; return true; }
  const it = limitedItem(id);
  if (!it || it.kind !== "deco" || !ownsLimited(P, id)) return false;
  box.wear[it.slot] = id;
  return true;
}
export function wornDeco(P, slot) { return P ? limitedBox(P).wear[slot] || null : null; }
// 限定收藏有幾件（不算進「全部解鎖」，另外算）：材料拿過就算一件
export function limitedCount(P) {
  return { have: LIMITED_ITEMS.filter(it => it.kind === "mat" ? !!limitedBox(P).got[it.id] || isFree(P) : ownsLimited(P, it.id)).length, total: LIMITED_ITEMS.length };
}
// 「馬上使用」要去哪裡（畫面照這個走）：part → 手作坊選好；deco → 換上再去展廳；mat → 抱枕工作台選好材料
export function useTarget(id) {
  const it = limitedItem(id);
  if (!it) return null;
  if (it.kind === "part") return { room: "workshop", params: { preset: { [it.cat]: it.opt }, tab: it.cat } };
  if (it.kind === "deco") return { room: "hall", params: {}, wear: it.slot };
  if (it.kind === "mat") return { room: "pillow", params: { mat: it.opt } };
  return null;
}

// ---------- 一週 ----------
// 這一週（週一到週日）的七個日期
export function weekDates(date) {
  const [y, m, d] = date.split("-").map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 週一 0 … 週日 6
  const mon = addDays(date, -dow);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}
// 這一週的特別項目：照週的號碼輪流 part → deco → mat（大家同一週同一個），那一種裡面再照週輪流
export function weeklyItem(wk) {
  const kinds = NUM.signin.weekKinds, mod = (a, b) => ((a % b) + b) % b;
  const kind = kinds[mod(wk, kinds.length)];
  const list = LIMITED_ITEMS.filter(x => x.kind === kind && !x.shop && !x.from); // shop：兌換所賣的（決定 0032）；from：主題展、每週特展給的（決定 0035）。全簽到都不會輪到
  return list.length ? list[mod(Math.floor(wk / kinds.length), list.length)] : null;
}
// 這一週全簽到會拿到的全部東西（翊文 11-11：「應該要能自動追蹤會送的東西一起顯示」）：畫面照這份列，加了新的獎勵在這裡加壹筆就好
//   { kind: "item", id }：這週的特別項目；{ kind: "chips", n, login: true }：賭場籌碼（伺服器發，要登入）
export function weekRewards(wk) {
  const out = [], it = weeklyItem(wk);
  if (it) out.push({ kind: "item", id: it.id });
  if (NUM.signin.weekChips > 0) out.push({ kind: "chips", n: NUM.signin.weekChips, login: true });
  return out;
}
// 獎勵壹行字（特別項目另外畫成卡片）：「1,500 萬賭場籌碼（要登入）」
export function weekRewardText(r) {
  if (r.kind === "chips") { const n = r.n, s = n >= 10000 && n % 10000 === 0 ? (n / 10000).toLocaleString("en-US") + " 萬" : n.toLocaleString("en-US"); return `${s} 賭場籌碼${r.login ? "（要登入）" : ""}`; }
  if (r.kind === "item") return (limitedInfo(r.id) || {}).name || r.id;
  return "";
}
// 這一週簽了幾天：{ wk, dates, signed（七個 true/false）, n, item（這週的特別項目）, rewards（全簽到拿的全部，weekRewards）, claimed（領過了沒） }
export function weekProgress(save, date) {
  const S = signinState(save), wk = weekIndex(date), dates = weekDates(date);
  const signed = dates.map(d => !!S.days[d]);
  return { wk, dates, signed, n: signed.filter(Boolean).length, item: weeklyItem(wk), rewards: weekRewards(wk), claimed: S.weeks[wk] || null };
}

// ---------- 簽到 ----------
export function signedOn(save, date) { return !!signinState(save).days[date]; }
export const cycleDay = n => ((Math.max(1, n) - 1) % 7) + 1;
export const cycleReward = k => Object.assign({ insp: 0, mood: 0 }, NUM.signin.cycle[k - 1] || {});
// 簽之前先看：今天簽會拿到什麼（簽到卡用）
export function signPreview(save, P, today) {
  const S = signinState(save);
  const free = !P || isFree(P);
  const already = !!S.days[today];
  const n = already ? S.days[today].n : S.count + 1, k = cycleDay(n);
  const holiday = holidayOf(today);
  const week = weekProgress(save, today);
  const after = already ? week.n : week.n + 1;
  return { can: !free && !already, free, already, n, k, reward: cycleReward(k), holiday, holidayReward: holiday && holiday.reward, week,
    willComplete: !already && after === 7 && !week.claimed, left: 7 - after };
}
// 簽到：給今天的獎勵、節日的那一份；這週七天都簽了就給這週的特別項目。
// 回傳 { ok, reason, already, n, k, reward, holiday, holidayGot, week, weekly（{ item, got } 或 null）, gains（全部拿到的，一樣一行）, events }
//   gains：{ kind: "insp"|"mood", n, why } 或 { kind: "item", id, n, dup, insp, why }。why：day（每日）、holiday、week
export function signIn(save, P, today) {
  if (!P) return { ok: false, reason: "先進館才能簽到" };
  if (isFree(P)) return { ok: false, reason: "自由模式不用簽到", free: true };
  if (!isDate(today)) return { ok: false, reason: "日期不對" };
  const S = signinState(save);
  if (S.days[today]) return { ok: false, already: true, reason: "今天簽過了" };
  S.count++;
  const n = S.count, k = cycleDay(n), reward = cycleReward(k);
  const holiday = holidayOf(today), gains = [], events = [];
  const addInsp = (v, why) => { if (!v) return; P.insp = (P.insp || 0) + v; gains.push({ kind: "insp", n: v, why }); };
  const addMood = (v, why) => { if (!v) return; const b = P.mood || 0; P.mood = clampN(b + v, 0, 99); gains.push({ kind: "mood", n: P.mood - b, why }); };
  addInsp(reward.insp, "day"); addMood(reward.mood, "day");
  let holidayGot = null;
  if (holiday && holiday.reward) {
    const R = holiday.reward;
    addInsp(R.insp, "holiday"); addMood(R.mood, "holiday");
    const mat = LIMITED_ITEMS.find(x => x.kind === "mat");
    if (R.mat && mat) { const g = grantLimited(P, mat.id, today, R.mat); gains.push({ kind: "item", id: mat.id, n: g.n, dup: false, insp: 0, why: "holiday" }); }
    holidayGot = R;
  }
  S.days[today] = { n, k, hol: holiday ? holiday.key : null };
  const week = weekProgress(save, today);
  let weekly = null;
  if (week.n === 7 && !S.weeks[week.wk] && week.item) {
    const g = grantLimited(P, week.item.id, today);
    S.weeks[week.wk] = { item: week.item.id, got: today, dup: g.dup };
    weekly = { item: week.item, got: g };
    gains.push({ kind: "item", id: week.item.id, n: g.n, dup: g.dup, insp: g.insp, why: "week" });
    events.push(...g.events);
    week.claimed = S.weeks[week.wk];
  }
  return { ok: true, n, k, reward, holiday, holidayGot, week, weekly, gains, events };
}

// ---------- 補簽（翊文 11-11：「做個補簽到機制，可以補這週沒有簽到的，花一個週章」） ----------
// 只能補「這週」（週壹 05:00 起）已經過去、沒簽到的日子；花 NUM.signin.makeupCost 枚週章。
// 補簽照樣拿七天壹輪的那壹份（累計次數 +1）、算進這週全簽到；節日那壹份不補（那是節日當天的）。
// story：這個參觀者的每週劇情（story.js 的 storyState(P)，週章在 story.stamps）。由畫面傳進來，免得 signin.js 跟 story.js 互相 import
export function makeupDays(save, today) {
  return weekProgress(save, today).dates.filter(d => d < today && !signinState(save).days[d]);
}
export function makeupCheck(save, P, date, today, story) {
  const cost = NUM.signin.makeupCost;
  if (!P) return { ok: false, reason: "先進館才能補簽", cost };
  if (isFree(P)) return { ok: false, reason: "自由模式不用簽到", cost, free: true };
  if (!isDate(date) || !isDate(today)) return { ok: false, reason: "日期不對", cost };
  if (signinState(save).days[date]) return { ok: false, reason: "這天簽過了", cost };
  if (date >= today) return { ok: false, reason: date === today ? "今天直接簽到就好" : "還沒到", cost };
  if (!weekDates(today).includes(date)) return { ok: false, reason: "只能補這週的（週壹 05:00 換週）", cost };
  const have = story && Number.isFinite(story.stamps) ? story.stamps : 0;
  if (have < cost) return { ok: false, reason: `週章不夠（要 ${cost} 枚，你有 ${have} 枚）`, cost, have };
  return { ok: true, cost, have };
}
// 補簽：回傳跟 signIn 壹樣的形狀，多 { makeup: true, date, cost }
export function signMakeup(save, P, date, today, story) {
  const c = makeupCheck(save, P, date, today, story);
  if (!c.ok) return c;
  story.stamps -= c.cost;
  const S = signinState(save);
  S.count++;
  const n = S.count, k = cycleDay(n), reward = cycleReward(k), gains = [], events = [];
  if (reward.insp) { P.insp = (P.insp || 0) + reward.insp; gains.push({ kind: "insp", n: reward.insp, why: "day" }); }
  if (reward.mood) { const b = P.mood || 0; P.mood = clampN(b + reward.mood, 0, 99); gains.push({ kind: "mood", n: P.mood - b, why: "day" }); }
  const hol = holidayOf(date);
  S.days[date] = { n, k, hol: hol ? hol.key : null, mk: today }; // mk：哪天補的
  const week = weekProgress(save, today);
  let weekly = null;
  if (week.n === 7 && !S.weeks[week.wk] && week.item) {
    const g = grantLimited(P, week.item.id, today);
    S.weeks[week.wk] = { item: week.item.id, got: today, dup: g.dup };
    weekly = { item: week.item, got: g };
    gains.push({ kind: "item", id: week.item.id, n: g.n, dup: g.dup, insp: g.insp, why: "week" });
    events.push(...g.events);
    week.claimed = S.weeks[week.wk];
  }
  return { ok: true, makeup: true, date, cost: c.cost, n, k, reward, holiday: null, holidayGot: null, week, weekly, gains, events };
}

// ---------- 簽到日曆 ----------
// 一個月一頁（週一開頭，前後補滿整週）。month 從 1 算。每一格：
//   { date, d（幾號）, inMonth, signed, n（那天是累計第幾次）, isToday, future, hol（那天的節日，可能有兩個） }
export function signinMonth(save, year, month, today) {
  const S = signinState(save);
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const start = weekDates(first)[0];
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const cells = [];
  for (let d = start; d < next || cells.length % 7; d = addDays(d, 1)) {
    const x = S.days[d];
    cells.push({ date: d, d: +d.slice(8, 10), inMonth: d.slice(0, 7) === first.slice(0, 7), signed: !!x, n: x ? x.n : 0, isToday: d === today, future: d > today,
      hol: holidaysOn(d).map(h => ({ key: h.key, name: h.name, dayName: h.dayName, kind: h.kind, look: h.look })) });
  }
  const signedIn = cells.filter(c => c.inMonth && c.signed).length;
  return { year, month, cells, signedIn };
}
