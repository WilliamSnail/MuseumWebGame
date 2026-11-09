// ================================================================
//  Hamachi 賭場：籌碼錢包、大禮包、餐車、救濟、換小獎、成就和財產、舊資料認領、單人的每一步（決定 0040）
//  純函式：不碰資料庫。Functions（functions/casino.js）在 Firestore 交易裡讀進來、呼叫這裡、寫回去。
//  籌碼跟靈感分開：錢包放 Firestore 的 casinoWallets/{uid}，只有 Functions 能寫。沒有真錢，不能花錢買。
//  「今天」「這週」由呼叫的人給（伺服器的時間），不信瀏覽器。
//  錢包的資料（w）：
//    chips 籌碼；rel { day, n } 今天領過幾次救濟；pk { day, left, opened } 今天免費大禮包還剩幾包、開過幾包；tickets 買到、抽到的券；
//    ex { week, n:{換小獎的 id: 這週換過幾次} }；ach { 成就 id: { d: 日期, name? } }；props { 財產 id: { n, d, name? } }；meals { 餐點 id: 買過幾次 }；
//    sk 連勝連敗（shared/casino_streak.js，決定 0049）；title 現在當稱號的成就 id；hung 掛在展廳的財產 id；st 統計；legacy { at } 認領過舊資料；tablePid 現在坐的牌桌（第二階段）
//    wk 這週的收藏進度 { week, c 統計, got 拿到哪幾件, done, claimed }；wkLog 以前幾週的紀錄（決定 0042，shared/casino_week.js；舊錢包沒有這兩欄，Fix 會補）
// ================================================================
import { NUM } from "./config.js";
import { CAS_ACH, CAS_MENU, CAS_PACKS, CAS_PROPS, CAS_TEXT } from "./casino_text.js";
import { casBetCheck, casBonusPct, casFill, casHit, casNewRound, casNum, casRoundView, casShuffle, casStand } from "./casino.js";
import { RNG, clampN, gainSan, hashStr, isFree } from "./logic.js";
import { eventLive } from "./events.js";
import { isoMonday, isoWeek, rewardText, STORY_ITEMS, storyPackFor, storyState } from "./story.js";
import { casSkFix, casSkStep } from "./casino_streak.js";
import { casWeekDef, casWkHand, casWkMeal, casWkNew, casWkPacks, casWkRoll } from "./casino_week.js";

const casIsObj = o => !!o && typeof o === "object" && !Array.isArray(o);
const casNz = (n, d = 0) => (Number.isFinite(+n) ? +n : d);

// ---------- 錢包 ----------
export function casWalletNew() {
  return {
    v: 1, chips: NUM.casino.startChips,
    rel: { day: null, n: 0 }, pk: { day: null, left: NUM.casino.dailyPacks, opened: 0 }, tickets: 0, ex: { week: null, n: {} },
    ach: {}, props: {}, meals: {}, title: null, hung: [], legacy: null, tablePid: null, wk: casWkNew(null), wkLog: {}, sk: { day: null, win: 0, lose: 0, mood: 0, san: 0 },
    st: { hands: 0, wins: 0, losses: 0, pushes: 0, busts: 0, blackjacks: 0, charlies: 0, dealerBusts: 0, allinWins: 0, streak: 0, lstreak: 0, bestWin: 0, bestLose: 0, reliefs: 0, star5: 0, houseBroke: 0, tables: 0, finds: 0, findChips: 0, chipsMax: NUM.casino.startChips, net: 0 },
  };
}
// 讀回來的錢包：補欄位、換日重算（今天的免費大禮包、救濟；這週的換小獎）。day 是台灣的今天
export function casWalletFix(w, day) {
  const base = casWalletNew();
  if (!casIsObj(w)) w = base;
  for (const k of Object.keys(base)) if (w[k] == null) w[k] = base[k];
  w.chips = Math.max(0, Math.floor(casNz(w.chips)));
  w.tickets = Math.max(0, Math.floor(casNz(w.tickets)));
  for (const k of ["rel", "pk", "ex", "ach", "props", "meals", "st"]) if (!casIsObj(w[k])) w[k] = base[k];
  for (const k of Object.keys(base.st)) if (!Number.isFinite(w.st[k])) w.st[k] = base.st[k];
  if (!casIsObj(w.ex.n)) w.ex.n = {};
  if (!Array.isArray(w.hung)) w.hung = [];
  casSkFix(w, day); // 連勝連敗（決定 0049）：舊錢包沒有 sk，補；換日重算今天的份
  if (day) {
    if (w.rel.day !== day) w.rel = { day, n: 0 };
    if (w.pk.day !== day) w.pk = { day, left: NUM.casino.dailyPacks, opened: 0 }; // 舊的：每人 2 包、不會換日重算（bug）；這裡每天 2 包，沒開的不累積
    const wk = isoWeek(day);
    if (w.ex.week !== wk) w.ex = { week: wk, n: {} };
    casWkRoll(w, wk); // 每週收藏：週一 05:00 換週，上一週收進 wkLog，這週統計歸零（決定 0042）
  } else casWkRoll(w, null);
  return w;
}
export const casHouseNew = () => ({ v: 1, bankroll: NUM.casino.houseStart, hands: 0, day: null, reopened: 0 });
export function casHouseFix(h, day) {
  if (!casIsObj(h)) h = casHouseNew();
  h.bankroll = Math.floor(casNz(h.bankroll, NUM.casino.houseStart));
  h.hands = Math.max(0, Math.floor(casNz(h.hands))); h.reopened = Math.max(0, Math.floor(casNz(h.reopened)));
  // 莊家破產中（小於 0），過了換日 Yuga 借他壹筆重新開張（梗留著，但不會破產到永遠）
  let reopen = null;
  if (day && h.day && h.day !== day && h.bankroll < 0) { h.bankroll = NUM.casino.houseReset; h.reopened++; reopen = casFill(CAS_TEXT.houseReopen, { n: casNum(NUM.casino.houseReset) }); }
  if (day) h.day = day;
  return { house: h, reopen };
}
export const casHouseLines = h => [casFill(CAS_TEXT.houseNow, { n: casNum(h.bankroll) })].concat(h.bankroll < 0 ? [CAS_TEXT.houseBroke] : []);

// ---------- 成就、財產 ----------
const casCleanName = s => [...String(s == null ? "" : s)].filter(ch => { const n = ch.codePointAt(0); return !(n < 0x20 || n === 0x7f || (n >= 0x200b && n <= 0x200f) || (n >= 0x2028 && n <= 0x202e) || (n >= 0x2060 && n <= 0x206f) || n === 0xfeff); }).join("").replace(/\s+/g, " ").trim().slice(0, 40);
export const casShortName = s => [...casCleanName(s)].slice(0, NUM.casino.titleMax).join("");
// 每週收藏的 id：wk:2026-W46（集滿的紀念品、稱號）、wk:2026-W46:scarf（一件收藏品）
const CAS_WK_ID = /^wk:\d{4}-W\d{2}(:[A-Za-z0-9_-]{1,32})?$/;
const casIsWkId = id => typeof id === "string" && CAS_WK_ID.test(id);
const casLegacyId = (kind, name) => `old:${kind}:${hashStr(name).toString(36)}`;
export function casAchInfo(w, id) {
  const base = CAS_ACH.find(a => a.id === id);
  if (base) return { id, name: base.name, desc: base.desc, old: false };
  const e = w && w.ach && w.ach[id];
  if (e && typeof e.name === "string" && casIsWkId(id)) return { id, name: casShortName(e.name), desc: `賭場 ${id.slice(3)} 的每週收藏集滿了。`, old: false, wk: true };
  if (e && typeof e.name === "string") return { id, name: casShortName(e.name), desc: "以前在 Discord 21 點拿到的。", old: true };
  return null;
}
export function casPropInfo(w, id) {
  if (CAS_PROPS[id]) return { id, name: CAS_PROPS[id].name, desc: CAS_PROPS[id].desc, old: false };
  const e = w && w.props && w.props[id];
  if (e && typeof e.name === "string" && casIsWkId(id)) return { id, name: casShortName(e.name), desc: typeof e.desc === "string" ? [...e.desc].slice(0, NUM.casino.week.descMax).join("") : "", old: false, wk: true };
  if (e && typeof e.name === "string") return { id, name: casShortName(e.name), desc: "以前在 Discord 21 點得到的紀念品。", old: true };
  return null;
}
function casAddProp(w, id, day, name) {
  const e = w.props[id] || (w.props[id] = { n: 0, d: day });
  e.n += 1;
  if (name) e.name = casShortName(name);
}
// 看統計有沒有新的成就達成。回傳新拿到的 [{ id, name }]
export function casAchCheck(w, day) {
  const got = [];
  w.st.meals = Object.keys(w.meals).length;
  for (const a of CAS_ACH) {
    if (w.ach[a.id]) continue;
    const ok = Object.keys(a.rule).every(k => casNz(w.st[k]) >= a.rule[k]);
    if (!ok) continue;
    w.ach[a.id] = { d: day };
    got.push({ id: a.id, name: a.name });
    if (a.id === "star5" && !w.props.gold) casAddProp(w, "gold", day);
    if (a.id === "table" && !w.props.table) casAddProp(w, "table", day);
  }
  return got;
}

// ---------- 打完一手：派彩、統計、莊家 ----------
// round：casFinish 過的一局（有 out）。ctx：{ day, withOthers（跟館友同桌）, allin }。同一局只算一次（round.settled）
export function casSettle(w, house, round, ctx = {}) {
  if (!round.out || round.settled) return { ok: false, already: true, ach: [], lines: [] };
  const o = round.out, st = w.st, before = house.bankroll;
  round.settled = true;
  w.chips += o.payout;
  house.bankroll += round.bet - o.payout;
  house.hands++;
  st.hands++;
  st.net += o.net;
  const win = o.kind === "win" || o.kind === "blackjack" || o.kind === "charlie";
  if (win) { st.wins++; st.streak++; st.lstreak = 0; st.bestWin = Math.max(st.bestWin, st.streak); }
  else if (o.kind === "lose") { st.losses++; st.lstreak++; st.streak = 0; st.bestLose = Math.max(st.bestLose, st.lstreak); }
  else st.pushes++;
  if (o.why === "bust") st.busts++;
  if (o.why === "dealerBust") st.dealerBusts++;
  if (o.kind === "blackjack") st.blackjacks++;
  if (o.kind === "charlie") st.charlies++;
  if (win && round.allin) st.allinWins++;
  if (win && before >= 0 && house.bankroll < 0) st.houseBroke++;
  if (ctx.withOthers) st.tables++;
  casWkHand(w, { kind: o.kind, why: o.why, withOthers: !!ctx.withOthers }); // 每週收藏的統計（決定 0042）
  st.chipsMax = Math.max(st.chipsMax, w.chips);
  const lines = [];
  if (win) lines.push(casFill(CAS_TEXT.houseLost, { n: casNum(o.net) }));
  else if (o.kind === "lose") lines.push(casFill(CAS_TEXT.houseGot, { n: casNum(round.bet) }));
  return { ok: true, ach: casAchCheck(w, ctx.day), lines, houseBroke: house.bankroll < 0 };
}

// ---------- 限時活動 casinoBoost（決定 0042）：活動時間內，第一次碰錢包多 1 包免費大禮包 ----------
// events：eventsFromWeeks 整理過的清單；t：伺服器的時間（毫秒）。每場活動每人只給一次（記在 w.pk.ev，換日跟著清掉）。回傳這次多的包數
export function casEventPacks(w, events, t) {
  const ev = eventLive(events, "casinoBoost", t);
  if (!ev) return 0;
  if (!Array.isArray(w.pk.ev)) w.pk.ev = [];
  if (w.pk.ev.includes(ev.id)) return 0;
  const n = NUM.events.casinoBoost.extraPacks;
  w.pk.ev = w.pk.ev.concat(ev.id).slice(-4);
  w.pk.left += n;
  return n;
}

// ---------- 救濟 ----------
export function casRelief(w, day) {
  const C = NUM.casino;
  if (w.chips >= C.reliefBelow) return { ok: false, reason: CAS_TEXT.reliefNot };
  if (w.rel.n >= C.reliefPerDay) return { ok: false, reason: casFill(CAS_TEXT.reliefNone, { n: C.dailyPacks }) };
  w.rel.n++;
  w.chips = Math.max(w.chips, C.reliefTo);
  w.st.reliefs++;
  return { ok: true, lines: [CAS_TEXT.reliefHello, casFill(CAS_TEXT.reliefGive, { n: casNum(C.reliefTo), left: C.reliefPerDay - w.rel.n })], ach: casAchCheck(w, day) };
}

// ---------- 大禮包（舊的機率）：由莊家出 ----------
export function casPackDraw() {
  const roll = 1 + Math.floor(RNG() * 1000); // 1–1000
  const p = CAS_PACKS.find(x => roll <= x.upTo);
  const chips = p.base + (p.extra ? Math.floor(RNG() * (p.extra + 1)) * p.step : 0);
  return { roll, stars: p.stars, name: p.name, chips };
}
export const casPacksLeft = w => w.pk.left + w.tickets;
// 一次開 n 包：先用今天免費的，再用券
export function casOpenPacks(w, house, n, day) {
  const C = NUM.casino;
  n = Math.floor(+n);
  if (!(n >= 1)) return { ok: false, reason: "要開幾包？" };
  if (n > C.maxPacksAtOnce) n = C.maxPacksAtOnce;
  if (casPacksLeft(w) < 1) return { ok: false, reason: CAS_TEXT.packNone };
  n = Math.min(n, casPacksLeft(w));
  const packs = [];
  for (let i = 0; i < n; i++) {
    if (w.pk.left > 0) w.pk.left--; else w.tickets--;
    w.pk.opened++;
    const d = casPackDraw();
    w.chips += d.chips;
    house.bankroll -= d.chips;
    if (d.stars === 5) w.st.star5++;
    packs.push(d);
  }
  w.st.chipsMax = Math.max(w.st.chipsMax, w.chips);
  casWkPacks(w, packs);
  return { ok: true, packs, total: packs.reduce((s, p) => s + p.chips, 0), left: casPacksLeft(w), ach: casAchCheck(w, day) };
}

// ---------- 餐車 ----------
// pick：餐點的號碼（1–9）或 id。吃東西有機會抽到券（要先開過今天的大禮包）
// 吃東西的效果（翊文 11-09：「買賭場裡吃的東西應該也要可以加一些心情之類的效果」）：心情、理智，一天有上限。
// P 是這位參觀者（沒有、自由模式就沒有效果）。燈熄了的時候不加理智。回傳 { mood, san, full（今天的份吃完了） }
export function casFoodEffect(w, it, P, day) {
  const none = { mood: 0, san: 0, full: false };
  if (!it || (!it.mood && !it.san) || !P || isFree(P)) return none;
  const C = NUM.casino.foodCap;
  if (!w.food || w.food.day !== day) w.food = { day, mood: 0, san: 0 };
  const moodRoom = Math.min(C.mood - w.food.mood, 99 - (P.mood || 0)), mood = Math.max(0, Math.min(it.mood || 0, moodRoom));
  const want = P.dark ? 0 : Math.max(0, Math.min(it.san || 0, C.san - w.food.san));
  const san = want ? gainSan(P, want) : 0;
  if (mood) P.mood = clampN((P.mood || 0) + mood, 0, 99);
  w.food.mood += mood; w.food.san += san;
  return { mood, san, full: !mood && !san };
}
export function casBuy(w, house, pick, day, name = CAS_TEXT.dealer, P = null) {
  let it = CAS_MENU.find(x => x.n === +pick || x.id === pick);
  if (!it) return { ok: false, reason: "餐車沒有這個" };
  const lines = [casFill(CAS_TEXT.dinerHello, { name })];
  const opened = w.pk.opened > 0;
  if (it.ticket && !opened) return { ok: false, reason: CAS_TEXT.dinerNeedPack };
  if (it.redirect) { // 舊的：點零食，其實想買烤雞肉串（彈力球理論）
    lines.push(CAS_TEXT.snackA, CAS_TEXT.snackB, CAS_TEXT.snackC);
    it = CAS_MENU.find(x => x.id === it.redirect);
  }
  if (w.chips < it.price) return { ok: false, reason: casFill(CAS_TEXT.dinerBroke, { chips: casNum(w.chips) }) };
  w.chips -= it.price;
  house.bankroll += it.price;
  lines.push(it.line || "");
  let gotTickets = 0;
  const food = casFoodEffect(w, it, P, day);
  // 買完要說恢復了多少（翊文 11-09：「吃餐車恢復的心情應該也要再買之後說壹下」）
  if (food.mood || food.san) lines.push([food.mood ? casFill(CAS_TEXT.foodMood, { n: food.mood, now: P.mood }) : "", food.san ? `理智 +${food.san}` : ""].filter(Boolean).join("，"));
  else if (food.full) lines.push(CAS_TEXT.foodFull);
  else if ((it.mood || it.san) && (!P || isFree(P))) lines.push(CAS_TEXT.foodNoVisitor);
  if (it.special === "sushi") lines.push(CAS_TEXT.sushiLine);
  if (it.ticket) {
    w.tickets += it.ticket; gotTickets = it.ticket;
    if (it.ticket === 11 && RNG() * 100 > 60) lines.push(...CAS_TEXT.seaHero); // 舊的：買 11 抽券，四成機率海超人出來說話
  } else {
    w.meals[it.id] = (w.meals[it.id] || 0) + 1;
    casWkMeal(w, it.id);
    if (CAS_PROPS[it.id]) casAddProp(w, it.id, day);
    if (opened) {
      if (1 + Math.floor(RNG() * 100) <= it.odds) { w.tickets += 3; gotTickets = 3; lines.push(casFill(CAS_TEXT.dinerWon, { p: it.odds, n: 3 })); }
      else lines.push(casFill(CAS_TEXT.dinerOdds, { p: it.odds }));
    }
  }
  lines.push(CAS_TEXT.dinerThanks);
  return { ok: true, item: it.id, price: it.price, lines: lines.filter(Boolean), tickets: gotTickets, ach: casAchCheck(w, day), mood: food.mood, san: food.san };
}
// 贏一把：有機率多一張券（舊的 rottery(20)；要先開過今天的大禮包）
export function casWinTicket(w) {
  if (w.pk.opened < 1) return false;
  if (1 + Math.floor(RNG() * 100) > NUM.casino.packWinOdds) return false;
  w.tickets += 1;
  return true;
}

// ---------- 籌碼換小獎：每週有上限，只換壹點點 ----------
export const casExchangeItem = id => NUM.casino.exchange.find(x => x.id === id) || null;
export function casExchangeLeft(w, id) { const it = casExchangeItem(id); return it ? Math.max(0, it.perWeek - casNz(w.ex.n[id])) : 0; }
// P：挑戰模式的參觀者（獎勵放在博物館）。回傳 { ok, reward } ；有給 P 才會真的把獎勵放進去
export function casExchange(w, id, P) {
  const it = casExchangeItem(id);
  if (!it) return { ok: false, reason: "沒有這樣東西" };
  if (!P || isFree(P)) return { ok: false, reason: "要用挑戰模式的參觀者進館，才能換" };
  if (casExchangeLeft(w, id) < 1) return { ok: false, reason: "這週換完了（每週壹到週一 05:00 重算）" };
  if (w.chips < it.chips) return { ok: false, reason: `籌碼不夠（要 ${casNum(it.chips)}）` };
  w.chips -= it.chips;
  w.ex.n[id] = casNz(w.ex.n[id]) + 1;
  casGiveReward(P, it.reward);
  return { ok: true, reward: it.reward, left: casExchangeLeft(w, id) };
}
export function casGiveReward(P, r) {
  if (r.insp) P.insp = (P.insp || 0) + r.insp;
  if (r.bag && STORY_ITEMS[r.bag]) { const S = storyState(P); S.bag[r.bag] = (S.bag[r.bag] || 0) + 1; }
}

// ---------- 稱號、展廳的紀念品 ----------
export function casSetTitle(w, P, id) {
  if (id != null && !(w.ach[id] && casAchInfo(w, id))) return { ok: false, reason: "還沒有這個成就" };
  w.title = id || null;
  if (P && !isFree(P)) P.casinoTitle = w.title ? { id: w.title, name: casAchInfo(w, w.title).name } : null;
  return { ok: true, title: w.title };
}
export function casHang(w, P, id, on) {
  if (!P || isFree(P)) return { ok: false, reason: "要用挑戰模式的參觀者進館，才能掛在展廳" };
  const info = casPropInfo(w, id);
  if (!info || !w.props[id]) return { ok: false, reason: "你沒有這件東西" };
  const cur = w.hung.filter(x => casPropInfo(w, x) && w.props[x]);
  const i = cur.indexOf(id);
  if (on && i < 0) {
    if (cur.length >= NUM.casino.hangMax) return { ok: false, reason: `展廳最多掛 ${NUM.casino.hangMax} 件，先拿下壹件` };
    cur.push(id);
  } else if (!on && i >= 0) cur.splice(i, 1);
  w.hung = cur;
  P.hallSouvenirs = cur.map(x => ({ id: x, name: casPropInfo(w, x).name }));
  return { ok: true, hung: cur };
}

// 給別人看的（cleanHallView 用）：展廳上的紀念品、稱號。存檔是玩家自己寫得動的，所以只收清單上的 id；舊資料的紀念品只收短短的純文字名字
export function casCleanSouvenirs(list) {
  const out = [];
  for (const x of Array.isArray(list) ? list : []) {
    if (!x || typeof x.id !== "string" || x.id.length > 40 || out.length >= NUM.casino.hangMax) continue;
    if (CAS_PROPS[x.id]) out.push({ id: x.id, name: CAS_PROPS[x.id].name, desc: CAS_PROPS[x.id].desc, old: false });
    else if (casIsWkId(x.id) && typeof x.name === "string" && casShortName(x.name)) out.push({ id: x.id, name: casShortName(x.name), desc: "", old: false });
    else if (/^old:p:[0-9a-z]+$/.test(x.id) && typeof x.name === "string" && casShortName(x.name)) out.push({ id: x.id, name: casShortName(x.name), desc: "", old: true });
  }
  return out;
}
export function casCleanTitle(t) {
  if (!t || typeof t !== "object" || typeof t.id !== "string") return null;
  const a = CAS_ACH.find(x => x.id === t.id);
  if (a) return { id: a.id, name: a.name };
  if ((/^old:a:[0-9a-z]+$/.test(t.id) || /^wk:\d{4}-W\d{2}$/.test(t.id)) && typeof t.name === "string" && casShortName(t.name)) return { id: t.id, name: casShortName(t.name) };
  return null;
}

// ---------- 舊資料認領（casinoLegacy/{小寫 email}；翊文之後放，不在 repo） ----------
// 資料庫裡的樣子：{ chips: 數字, achievements: ["名字", …], properties: ["名字" 或 { name, n }, …], claimedBy?: uid }
export function casLegacyClean(doc) {
  if (!casIsObj(doc)) return null;
  const chips = Math.max(0, Math.min(1e12, Math.floor(casNz(doc.chips))));
  const list = x => (Array.isArray(x) ? x : casIsObj(x) ? Object.values(x) : []).slice(0, 80);
  const ach = [...new Set(list(doc.achievements).map(a => casShortName(casIsObj(a) ? a.name : a)).filter(Boolean))];
  const props = list(doc.properties).map(p => ({ name: casShortName(casIsObj(p) ? p.name : p), n: casIsObj(p) ? Math.max(1, Math.min(99, Math.floor(casNz(p.n, 1)))) : 1 })).filter(p => p.name);
  if (!chips && !ach.length && !props.length) return null;
  return { chips, ach, props };
}
// 看得到的（還沒領、可以領）：回傳給畫面的卡片內容，沒有就 null
export function casLegacyPeek(w, doc) {
  if (w.legacy) return null;
  if (casIsObj(doc) && doc.claimedBy) return null;
  return casLegacyClean(doc);
}
export function casLegacyClaim(w, doc, uid, day) {
  if (w.legacy) return { ok: false, reason: "已經認領過了" };
  if (casIsObj(doc) && doc.claimedBy && doc.claimedBy !== uid) return { ok: false, reason: "這份已經被領走了" };
  if (casIsObj(doc) && doc.claimedBy) return { ok: false, reason: "已經認領過了" };
  const c = casLegacyClean(doc);
  if (!c) return { ok: false, reason: "沒有舊的資料" };
  w.chips += c.chips;
  w.st.chipsMax = Math.max(w.st.chipsMax, w.chips);
  for (const name of c.ach) { const id = casLegacyId("a", name); if (!w.ach[id]) w.ach[id] = { d: day, name }; }
  for (const p of c.props) { const id = casLegacyId("p", p.name); for (let i = 0; i < p.n; i++) casAddProp(w, id, day, p.name); }
  w.legacy = { at: day };
  return { ok: true, chips: c.chips, ach: c.ach.length, props: c.props.reduce((s, p) => s + p.n, 0), mark: { claimedBy: uid, claimedDay: day } };
}

// ---------- 單人的每一步（Functions 的 casino 做的事） ----------
// 都是：傳進整個狀態、改它、回傳 { ok, ... }；不 ok 的什麼都沒改。round 是資料庫裡的一局（沒有就 null）
// ctx：{ w, house, round, P（挑戰模式的參觀者，沒有就 null）, day, id（新的一局的號碼）, deck（測試用，沒給就洗新的） }
export function casStepDeal(ctx, text) {
  const { w, house, round, P, day } = ctx;
  if (w.tablePid) return { ok: false, reason: "你還坐在牌桌上，先離桌" };
  if (round && round.state === "playing") return { ok: false, reason: "還有壹手沒打完" };
  const chk = casBetCheck(text, w.chips);
  if (!chk.ok) return { ok: false, gag: true, reason: chk.line };
  const san = P && Number.isFinite(P.sanity) && !isFree(P) ? P.sanity : 99;
  const allin = chk.bet === w.chips; // 全部的籌碼都壓上去
  w.chips -= chk.bet;
  const r = casNewRound({ id: ctx.id, bet: chk.bet, bonusPct: casBonusPct(P), san, deck: ctx.deck || casShuffle() });
  r.allin = allin;
  ctx.round = r;
  return casAfterMove(ctx);
}
export function casStepHit(ctx, seq) {
  if (!ctx.round) return { ok: false, reason: "還沒開始發牌" };
  const m = casHit(ctx.round, seq);
  return m.ok ? casAfterMove(ctx) : m;
}
export function casStepStand(ctx, seq) {
  if (!ctx.round) return { ok: false, reason: "還沒開始發牌" };
  const m = casStand(ctx.round, seq);
  return m.ok ? casAfterMove(ctx) : m;
}
function casAfterMove(ctx) {
  const { w, house, round, day } = ctx;
  let settle = null, ticket = false;
  if (round.state === "done") {
    settle = casSettle(w, house, round, { day, withOthers: false });
    if (settle.ok && ctx.P) { // 連勝連敗（決定 0049）：只有單人，只在這一手第一次結算時算（round.settled 擋重複）
      const sk = casSkStep(w, ctx.P, round.out.kind, day);
      settle.streak = sk.lines;
      if (sk.changed) ctx.saveDirty = true; // 心情、理智寫進存檔，同一個交易
    }
    ticket = settle.ok && round.out && ["win", "blackjack", "charlie"].includes(round.out.kind) && casWinTicket(w);
  }
  return { ok: true, round, view: casRoundView(round, ctx.viewer || ""), settle, ticket };
}

// ---------- 每週收藏（決定 0042；規則在 casino_week.js，這裡接劇情的週和存檔） ----------
// lib：storyLibrary 整理過的（網頁從 STORY_LIB 拿，Functions 從打包進去的 casino_week_data.js 拿）。label：2026-W46；fb：指定用哪個備用週（不給就照週數輪）
// 回傳這週的收藏內容（casWeekDef），沒有就 null。比 NUM.story.startWeek 早的週沒有
export function casWkDefFor(lib, label, fb) {
  const monday = isoMonday(label);
  if (!monday || !lib || label < NUM.story.startWeek) return null;
  const pack = storyPackFor(lib, label, fb);
  return pack ? casWeekDef(pack.src, label, monday) : null;
}
// 領集滿的週章（伺服器寫存檔，只領一次）。label 可以是這週，或以前還沒領的週。P：挑戰模式的參觀者
export function casWkClaim(w, P, label, day) {
  if (!P || isFree(P)) return { ok: false, reason: "要用挑戰模式的參觀者進館，才領得到週章" };
  const ent = w.wk && w.wk.week === label ? w.wk : w.wkLog && w.wkLog[label];
  if (!ent || !ent.done) return { ok: false, reason: "這週的收藏還沒集滿" };
  if (ent.claimed) return { ok: false, reason: "領過了" };
  ent.claimed = day;
  const S = storyState(P), r = { stamps: NUM.casino.week.stamp };
  S.stamps += r.stamps;
  if (!S.cas || typeof S.cas !== "object" || Array.isArray(S.cas)) S.cas = {};
  S.cas[label] = day;
  S.log.push({ d: day, what: `${label}/casino`, r: rewardText(r) });
  if (S.log.length > 100) S.log = S.log.slice(-100);
  return { ok: true, reward: r, week: label };
}

// ---------- 畫面要的錢包摘要 ----------
export function casWalletView(w, day) {
  const C = NUM.casino;
  return {
    foodMoodLeft: Math.max(0, NUM.casino.foodCap.mood - (w.food && w.food.day === day ? w.food.mood : 0)), foodSanLeft: Math.max(0, NUM.casino.foodCap.san - (w.food && w.food.day === day ? w.food.san : 0)),
    chips: w.chips, tickets: w.tickets, packsToday: w.pk.left, packsLeft: casPacksLeft(w), opened: w.pk.opened,
    reliefLeft: Math.max(0, C.reliefPerDay - w.rel.n), canRelief: w.chips < C.reliefBelow && w.rel.n < C.reliefPerDay,
    ex: C.exchange.map(x => ({ id: x.id, chips: x.chips, perWeek: x.perWeek, left: casExchangeLeft(w, x.id) })),
    ach: Object.keys(w.ach).map(id => Object.assign({ d: w.ach[id].d }, casAchInfo(w, id))).filter(a => a.name),
    props: Object.keys(w.props).map(id => Object.assign({ n: w.props[id].n, d: w.props[id].d, hung: w.hung.includes(id) }, casPropInfo(w, id))).filter(p => p.name),
    title: w.title, hungMax: C.hangMax, legacy: !!w.legacy, tablePid: w.tablePid || null,
    st: Object.assign({}, w.st),
  };
}
