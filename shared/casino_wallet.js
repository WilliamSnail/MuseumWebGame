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
import { CAS_ACH, CAS_GIFT, CAS_LIVE, CAS_MENU, CAS_PACKS, CAS_PROPS, CAS_TEXT } from "./casino_text.js";
import { casBetCheck, casBonusPct, casFill, casHit, casNewRound, casNum, casRoundView, casShuffle, casStand } from "./casino.js";
import { RNG, clampN, gainSan, hashStr, isFree, limitedHome } from "./logic.js";
import { weekIndex } from "./logic3.js";
import { eventLive } from "./events.js";
import { isoMonday, isoWeek, rewardText, STORY_ITEMS, storyPackFor, storyState } from "./story.js";
import { backFromWork, sendToWork, workBench } from "./visitors.js";
import { casSkFix, casSkStep } from "./casino_streak.js";
import { casWorldFund, casWorldOut, casWorldRoom, casBurn, casCount, casHouseBurn, casHouseMint, casHouseMove, casHouseWorldIn, casHouseWorldOut, casLedFix, casMint, casWorldGrow, casWorldExpand, casWorldLow, casCultureDue } from "./casino_book.js";
import { casInSpent, casInUsed } from "./casino_stock_in.js";
import { gbCollect, gbDaily, govGrant, govSweep, gbFix, gbLend, gbRoom, gbSplitOn, whTick, wtLed, wuDebit, wuExtSplit, wuFix, wuGrow } from "./world.js";
import { casWeekDef, casWkHand, casWkMeal, casWkNew, casWkPacks, casWkRoll } from "./casino_week.js";

const casIsObj = o => !!o && typeof o === "object" && !Array.isArray(o);
const casNz = (n, d = 0) => (Number.isFinite(+n) ? +n : d);

// ---------- 錢包 ----------
export function casWalletNew() {
  return {
    v: 1, chips: NUM.casino.startChips, tix: { day: null, n: 0, seen: null }, seen: null, led: { mint: { start: NUM.casino.startChips }, burn: {}, cult: 1 },
    rel: { day: null, n: 0 }, loan: casLoanNew(), work: null, pk: { day: null, left: NUM.casino.dailyPacks, opened: 0 }, tickets: 0, ex: { week: null, n: {} },
    ach: {}, props: {}, meals: {}, title: null, hung: [], legacy: null, tablePid: null, wk: casWkNew(null), wkLog: {}, sk: { day: null, win: 0, lose: 0, mood: 0, san: 0 },
    st: { hands: 0, wins: 0, losses: 0, pushes: 0, busts: 0, blackjacks: 0, charlies: 0, dealerBusts: 0, allinWins: 0, streak: 0, lstreak: 0, bestWin: 0, bestLose: 0, reliefs: 0, star5: 0, houseBroke: 0, tables: 0, finds: 0, findChips: 0, chipsMax: NUM.casino.startChips, net: 0 },
  };
}
// 新玩家的起始籌碼是文化部補助（決定 0082）：新錢包帶 led.cult＝1 的記號，第壹次碰到莊家（house）時，把「憑空給的」改記成已知世界出的（來源 cultureStart）。
// 舊錢包沒有記號，不動。人數不設上限（翊文 11-15）；池子吃緊時只補今天付得出的部分，剩下的還是記憑空。回傳這次轉的籌碼
export function casCultureFund(w, house) {
  if (!w || !w.led || !w.led.cult) return 0;
  delete w.led.cult;
  const C = NUM.casino.culture, H = house.cultStart && typeof house.cultStart === "object" ? house.cultStart : (house.cultStart = { n: 0, total: 0 });
  if (!C || !C.on) return 0;
  const got = casWorldFund(w, house, "cultureStart", w.led.mint && w.led.mint.start, NUM.casino.world);
  if (got > 0) { H.n = casNz(H.n) + 1; H.total = casNz(H.total) + got; wuDebit(house, "u-culture", got); } // 帳上算文化部出的（它有多少出多少，不夠的照比例攤）
  return got;
}
// 讀回來的錢包：補欄位、換日重算（今天的免費大禮包、救濟；這週的換小獎）。day 是台灣的今天
export function casWalletFix(w, day) {
  const base = casWalletNew();
  if (!casIsObj(w)) w = base;
  else if (w.led == null) w.led = { mint: {}, burn: {} }; // 記帳上線（11-13）以前的錢包：以前的籌碼不補記，從上線那天開始算
  for (const k of Object.keys(base)) if (w[k] == null) w[k] = base[k];
  w.chips = Math.floor(casNz(w.chips)); // 可以是負的：借款到期沒還，Yuga 照扣（決定 0064）
  w.tickets = Math.max(0, Math.floor(casNz(w.tickets)));
  for (const k of ["rel", "pk", "ex", "ach", "props", "meals", "st", "loan"]) if (!casIsObj(w[k])) w[k] = base[k];
  casLedFix(w, ["mint", "burn"]); // 記帳（shared/casino_book.js）；舊錢包的開場籌碼沒記，不補（快照只看之後的變化）
  casLoanFix(w);
  casWorkFix(w);
  if (!casIsObj(w.signWk)) w.signWk = {}; // 全簽到送過籌碼的週（決定 0064 之後，翊文 11-11）
  for (const k of Object.keys(base.st)) if (!Number.isFinite(w.st[k])) w.st[k] = base.st[k];
  if (!casIsObj(w.ex.n)) w.ex.n = {};
  if (!Array.isArray(w.hung)) w.hung = [];
  casSkFix(w, day); // 連勝連敗（決定 0049）：舊錢包沒有 sk，補；換日重算今天的份
  if (day) {
    w.seen = day; // 最後來的一天（景氣指數算「過去 7 天有幾個人」）
    if (w.rel.day !== day) w.rel = { day, n: 0 };
    if (w.pk.day !== day) w.pk = { day, left: NUM.casino.dailyPacks, opened: 0 }; // 舊的：每人 2 包、不會換日重算（bug）；這裡每天 2 包，沒開的不累積
    const wk = isoWeek(day);
    if (w.ex.week !== wk) w.ex = { week: wk, n: {} };
    casWkRoll(w, wk); // 每週收藏：週一 05:00 換週，上一週收進 wkLog，這週統計歸零（決定 0042）
    casLoanRoll(w, day); // 到期沒還的借款：直接扣（決定 0064）
    casWorkRoll(w, day); // 在地下工作的參觀者：每天還壹點、理智 −壹點（決定 0064 第二部分）
  } else casWkRoll(w, null);
  return w;
}
// budget：拚經濟的博物館資金（shared/casino_econ.js）；sea：拚經濟失敗、沒被撈走的錢沉到這裡（決定 0057，從 0 開始）。
// 都跟莊家放在同壹份，同壹個交易裡算；舊的莊家沒有就補。莊家破產重開不動它們
export const casHouseNew = () => ({ v: 1, bankroll: NUM.casino.houseStart, hands: 0, day: null, reopened: 0, budget: NUM.casino.econ.budgetStart, sea: 0, museum: 0, gov: 0, world: NUM.casino.world.start, econ: { b: 0 }, pol: null, led: { mint: {}, flow: {} } });
export function casHouseFix(h, day) {
  if (!casIsObj(h)) h = casHouseNew();
  h.bankroll = Math.floor(casNz(h.bankroll, NUM.casino.houseStart));
  h.budget = Math.floor(casNz(h.budget, NUM.casino.econ.budgetStart));
  h.sea = Math.floor(casNz(h.sea, 0));
  if (!casIsObj(h.act)) h.act = {}; // 活動次數（景氣指數）
  if (!casIsObj(h.econ)) h.econ = { b: 0 }; // 最新的景氣（shared/casino_gdp.js，日報產生時寫）
  h.econ.b = Math.max(-1, Math.min(1, casNz(h.econ.b)));
  if (!casIsObj(h.pol)) h.pol = null; // 最近一次拚經濟成功抽到的政策 { idx, fx, day }
  h.gov = Math.floor(casNz(h.gov, 0)); // 政府帳（證交稅、營業稅、娛樂稅，決定 0110、0111）
  h.museum = Math.floor(casNz(h.museum, 0)); // 修繕基金（門票，shared/casino_ticket.js）
  h.world = Math.floor(casNz(h.world, NUM.casino.world.start)); // 已知世界的池子（規劃 2.12）；舊的莊家第壹次碰到時給起始
  gbFix(h); // 佩佩銀行的準備金（決定 0127）
  h.ext = Math.floor(casNz(h.ext, 0)); // 海外（真實市場，決定 0126）：跟已知世界並列的帳，可以是負的
  casLedFix(h, ["mint", "flow", "burn"]);
  // 莊家的債（規劃 2.11）：budget 跟博物館資金借的、culture 文化部借款、world 已知世界貸款（含利息）。loansOut：借出去還沒收回的本金。pay：今天已經賠付多少
  if (!casIsObj(h.debt)) h.debt = {};
  for (const k of ["budget", "culture", "world"]) h.debt[k] = Math.max(0, Math.floor(casNz(h.debt[k])));
  h.loansOut = Math.max(0, Math.floor(casNz(h.loansOut)));
  if (!casIsObj(h.pay) || typeof h.pay.day !== "string") h.pay = { day: "", n: 0 };
  h.pay.n = Math.max(0, Math.floor(casNz(h.pay.n)));
  h.hands = Math.max(0, Math.floor(casNz(h.hands))); h.reopened = Math.max(0, Math.floor(casNz(h.reopened)));
  // 莊家破產中（小於 0），過了換日 Yuga 借他壹筆重新開張（梗留著，但不會破產到永遠）
  let reopen = null;
  // 已知世界撥的錢（NUM.casino.grants）：每個 id 只撥壹次，記成文化部借款（債，house.debt.culture，不計利息，莊家賺的錢先還博物館資金、再還這個）。
  // 已經撥過、當時沒記債的（11-14 之前），補記壹次債（grantDebt）。
  if (!casIsObj(h.grants)) h.grants = {};
  if (!casIsObj(h.grantDebt)) h.grantDebt = {};
  for (const g of NUM.casino.grants || []) {
    if (!g || !g.id) continue;
    const gotG = !h.grants[g.id] ? casHouseWorldOut(h, "grant", g.amt, NUM.casino.world) : 0;
    if (gotG > 0) { wuDebit(h, "u-culture", gotG); h.grants[g.id] = day || true; } // 已知世界撥的（池子少了），不是憑空
    if (h.grants[g.id] && !h.grantDebt[g.id]) { h.debt.culture += Math.max(0, Math.floor(casNz(g.amt))); h.grantDebt[g.id] = true; }
  }
  { const F = NUM.casino.houseLoan.fix; if (F && F.on && !h.cFix && h.day && h.debt.culture > 0 && h.budget >= F.amt + NUM.casino.houseLoan.cultureKeep) { h.budget -= F.amt; casHouseMove(h, "budgetFix", F.amt); h.cFix = day || true; } } // 決定 0118（11-17 修正：正式站 house.cul.paid 只是分期 13,393,619，另外 19,402,873 是第 2 步還的，所以不看 cul，只靠 cFix 擋重複）：一次性補撥，博物館資金 → 莊家，不改館債餘額
  if (!h.wExp && NUM.casino.world.expand > 0) { const x = casWorldExpand(h, NUM.casino.world.expand); wuFix(h); wuGrow(h, x); h.wExp = day || true; } // 決定 0117：已知世界一次性擴充（帳上分類照權重分）
  if (!h.extFix && !h.extSplit && h.world != null && h.day && casIsObj(h.led) && casIsObj(h.led.world)) { const L = h.led.world, net = ["stockBuy", "stockSell", "stockRebase", "stockLevWin", "stockLevLoss", "dividend"].reduce((t, k) => t + Math.round(casNz(L[k])), 0); const x = wuFix(h); if (x) x.adj["u-ext"] = casNz(x.adj["u-ext"]) + net; h.extFix = day || true; } // 決定 0121：以前館外股的錢進了本地池子，改記「海外」：把累計的淨額從本地分類搬到海外分類（池子總數不變）
  wuExtSplit(h); // 決定 0126：海外從已知世界搬出來，變成並列的帳 house.ext（壹次）
  if (day && h.day && h.day !== day) reopen = casHouseDaily(h, day);
  if (day) h.day = day;
  govSweep(h, day); govGrant(h); // 決定 0140：政府帳搬進公共機構（每天壹次）
  gbDaily(h, day); // 決定 0130：佩佩銀行每天壹次（舊館債搬一次、莊家水位上繳、盈餘分配）
  wuFix(h); // 已知世界的帳上分類（W3，決定 0086）：沒有就照比例建
  return { house: h, reopen };
}
// ---------- 莊家跟整個經濟接軌（規劃 2.11） ----------
// 換日：利息、還債、破產了就借錢重開。回傳要告訴玩家的壹句（沒有就 null）
function casHouseDaily(h, day) {
  const C = NUM.casino, H = C.houseLoan;
  let reopen = null;
  if (!H || !H.on) {
    if (h.bankroll < 0 && C.houseResetMint) { casHouseMint(h, "reset", C.houseReset - h.bankroll); h.reopened++; reopen = casFill(CAS_TEXT.houseReopen, { n: casNum(C.houseReset) }); }
    return reopen;
  }
  const days = Math.max(1, Math.min(30, casDaysBetween(h.day, day)));
  // 0 已知世界每天成長（真正憑空）：growBase ×（1 ＋ growExtPct% × 外部景氣 b）× 天數
  { const WC = C.world, yoy = Math.max(0, casNz(h.econ && h.econ.yoy)), base = WC.growYoy ? Math.max(WC.growBase, h.world * yoy / 100 / 365) : WC.growBase * Math.max(0, 1 + WC.growExtPct / 100 * casNz(h.econ && h.econ.b)), g = casWorldGrow(h, Math.floor(base * days)); wuGrow(h, g); whTick(h, day, h.stk && h.stk.px, g); } // 成長按權重分給單位；單位的健康值、週一換狀態（W5）（W3，帳上的分類，總和不變）
  // 1 已知世界貸款的利息：記在債上（不動莊家的錢），複利。文化部持有的館債（原本的 10 億撥款）也計利息，利率 cultureInterestPct（每天 %）
  if (h.debt.culture > 0 && H.cultureInterestPct > 0) h.debt.culture += Math.ceil(h.debt.culture * (Math.pow(1 + H.cultureInterestPct / 100, days) - 1));
  if (h.debt.world > 0) h.debt.world += Math.ceil(h.debt.world * (Math.pow(1 + H.interestPct / 100, days) - 1));
  // 1b 文化部館債分期（30 天內還清）：今天至少還 ceil(剩餘本息 ÷ 剩下天數)（到期日當天或過了＝全部）。莊家的錢不夠就先由博物館資金墊（記成莊家欠博物館資金，2.11 的順序），還不夠記逾期（h.cultureLate，日報寫出來），不印錢
  // 到期日那天剩下的自動展延壹次（H.cultureExtDays 天，決定 0097）；展延過的、期限也過了：不再設到期日，只靠第 2 步「莊家賺到的錢壹半還債」
  if (h.debt.culture > 0 && H.cultureDue && day && H.cultureExtDays > 0 && !h.cultureExt && day >= H.cultureDue) h.cultureExt = true;
  const dueD = casCultureDue(h);
  h.cul = { paid: 0, late: 0, budget: 0, day, due: dueD };
  if (h.debt.culture > 0 && dueD && day && day <= dueD) {
    const left = Math.max(1, casDaysBetween(day, dueD) + 1), need = Math.min(h.debt.culture, Math.ceil(h.debt.culture * Math.min(days, left) / left));
    // 決定 0116：博物館資金先付（不得讓它低於 cultureKeep，博物館資金要補拚經濟、館方投資，不能被抽乾；這是博物館資金出的，不記成莊家欠它）；
    // 不夠的，莊家只付他超過 cultureBankMin 的部分（不讓館債把莊家抽到 0，免費大禮包才不會被擋）；再不夠記逾期，不印錢、不罰息。期限過了（展延也過了）改由第 2 步莊家賺的錢還
    const bx = Math.min(need, Math.max(0, h.budget - H.cultureKeep)), bank0 = Math.max(0, h.bankroll);
    const fx = Math.min(need - bx, Math.max(0, bank0 - H.cultureBankMin)), pay = Math.min(bx + fx, h.debt.culture);
    if (bx > 0 && pay > 0) { const y = Math.min(bx, pay); h.budget -= y; casHouseMove(h, "budgetLoan", y); h.cul.budget = y; }
    if (pay > 0) { casHouseWorldIn(h, "cultureRepay", pay); h.debt.culture -= pay; h.cul.paid = pay; }
    h.cul.late = need - pay; if (h.cul.late > 0) h.cultureLate = (h.cultureLate || 0) + h.cul.late;
  }
  // 2 莊家有賺（超過準備金）：壹半還債。先博物館資金、再文化部借款、最後已知世界（燒掉）
  if (h.bankroll > H.reserve) {
    let pay = Math.floor((h.bankroll - H.reserve) * H.repayPct / 100);
    const a = Math.min(pay, h.debt.budget);
    if (a > 0) { casHouseMove(h, "budgetRepay", -a); h.budget += a; h.debt.budget -= a; pay -= a; }
    const inTerm = h.debt.culture > 0 && dueD && day && day <= dueD; // 期限內館債由博物館資金先付（1b）；莊家只拿超過 cultureBankMin 的部分還，期限過了才全部照壹半還
    const b = Math.min(pay, h.debt.culture, inTerm ? Math.max(0, h.bankroll - H.cultureBankMin) : Infinity); // 期限內只拿莊家超過 cultureBankMin 的部分還
    if (b > 0) { casHouseWorldIn(h, "cultureRepay", b); h.debt.culture -= b; pay -= b; }
    const c = Math.min(pay, h.debt.world);
    if (c > 0) { casHouseWorldIn(h, "worldRepay", c); h.debt.world -= c; }
  }
  // 3 破產：先跟博物館資金借（閒錢的壹小部分），再跟已知世界貸款（有上限）。借到準備金；借不夠就停在負的（停業整頓）
  if (h.bankroll < 0) {
    let need = H.reserve - h.bankroll, got = 0;
    const spare = Math.max(0, h.budget - Math.floor(C.econ.budgetStart * H.budgetKeepPct / 100));
    const x = Math.min(need, Math.floor(spare * H.budgetPct / 100), H.budgetMax);
    if (x > 0) { h.budget -= x; casHouseMove(h, "budgetLoan", x); h.debt.budget += x; need -= x; got += x; }
    const room = Math.max(0, casHouseCredit(h) - h.debt.world);
    const y = casWorldLow(h, C.world) ? 0 : Math.min(need, room); // 已知世界吃緊時暫停貸款
    if (y > 0) { const z = casHouseWorldOut(h, "worldLoan", y, C.world); h.debt.world += z; got += z; }
    if (h.bankroll >= 0) { h.reopened++; reopen = casFill(CAS_TEXT.houseReopenLoan, { n: casNum(got) }); }
    else reopen = CAS_TEXT.houseStillBroke;
  }
  return reopen;
}
// 已知世界願意借莊家多少（累計的債不超過這個）：max(creditMin, creditDays × 館內 GDP 每天) ×（1 ＋ creditExtPct% × 外部景氣）
export function casHouseCredit(h) {
  const H = NUM.casino.houseLoan, e = casIsObj(h.econ) ? h.econ : {};
  const gdp = Math.max(0, Math.floor(casNz(e.perDay))), ext = Math.max(-1, Math.min(1, casNz(e.bExt)));
  return Math.max(0, Math.floor(Math.max(H.creditMin, H.creditDays * gdp) * (1 + H.creditExtPct / 100 * ext)));
}
// 莊家現在是哪一級：ok 健康（≥ health.low）、tight 吃緊、broke 破產（≤ 0，含停業整頓）
export function casHouseLevel(h) {
  const b = casNz(h && h.bankroll);
  return b <= 0 ? "broke" : b < NUM.casino.health.low ? "tight" : "ok";
}
// 這壹手最大能下多少（健康：NUM.casino.maxBet）
export function casBetMax(h) {
  const R = NUM.casino.risk, lv = casHouseLevel(h);
  if (lv === "ok") return NUM.casino.maxBet;
  if (lv === "broke") return Math.min(NUM.casino.maxBet, R.betBroke);
  return Math.min(NUM.casino.maxBet, Math.max(R.betMin, Math.floor(h.bankroll * R.betTightPct / 100)));
}
// 壹天總賠付上限（21 點贏的＋大禮包）。健康：null（不限）
export function casPayCap(h) {
  const R = NUM.casino.risk, lv = casHouseLevel(h);
  if (lv === "ok") return null;
  return lv === "broke" ? R.payBrokeFlat : Math.floor(h.bankroll * R.payTightPct / 100) + R.payFlat;
}
// 今天還能賠付多少（不限就是 Infinity）
export function casPayLeft(h, day) {
  const cap = casPayCap(h);
  if (cap == null) return Infinity;
  return Math.max(0, cap - (h.pay && h.pay.day === day ? h.pay.n : 0));
}
export function casPayAdd(h, day, n) {
  n = Math.floor(casNz(n));
  if (!(n > 0) || !day) return;
  if (!casIsObj(h.pay) || h.pay.day !== day) h.pay = { day, n: 0 };
  h.pay.n += n;
}
// 壹包大禮包最多賠多少（健康：不限，null）
export function casDrawCap(h) {
  const R = NUM.casino.risk, lv = casHouseLevel(h);
  if (lv === "ok") return null;
  return lv === "broke" ? R.drawFlat : Math.max(R.drawFlat, Math.floor(h.bankroll / 2));
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
  casHouseMove(house, "bj", round.bet - o.payout);
  casInUsed(w, house, "bj", ctx.day); // 館內股票：今天有這個人打過牌（壹人壹天只算壹次）
  casInSpent(w, house, "bj", ctx.day, round.bet); // 營收：這壹手的注（每人每天封頂，決定 0087）
  if (o.payout > round.bet) casPayAdd(house, ctx.day, o.payout - round.bet); // 今天賠付了多少（莊家吃緊／破產時有上限）
  house.hands++;
  casCount(house, "bjHands");
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

// ---------- 跟 Yuga 借錢（決定 0064，取代原本的免費救濟） ----------
// w.loan：{ limit 現在的額度, list 沒還的借款 [{ id, amt 借了多少, owe 要還多少, day 哪天借, due 最晚哪天還 }], seq 下壹筆的編號,
//          ok 準時還清幾筆, late 逾期被扣幾次, notes 還沒給玩家看的「Yuga 來收錢了」, debtSince 籌碼從哪天開始是負的（不是負的就 null） }
// toHouse：到期被直接扣掉、還沒交給莊家的錢（換日扣款在 casWalletFix 裡，那時候手上不壹定有莊家；下壹次在交易裡碰到莊家時用 casLoanToHouse 交過去）
export const casLoanNew = () => ({ limit: NUM.casino.loan.limit, list: [], seq: 0, ok: 0, late: 0, notes: [], debtSince: null, toHouse: 0, toGb: 0, toGbAmt: 0 });
const okDay = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
function casLoanFix(w) {
  const L = w.loan, base = casLoanNew();
  for (const k of Object.keys(base)) if (L[k] == null) L[k] = base[k];
  L.limit = Math.max(0, Math.floor(casNz(L.limit, NUM.casino.loan.limit))); // 逾期會往下降，可以低於壹開始的 100 萬
  L.seq = Math.max(0, Math.floor(casNz(L.seq)));
  L.ok = Math.max(0, Math.floor(casNz(L.ok))); L.late = Math.max(0, Math.floor(casNz(L.late)));
  L.toHouse = Math.max(0, Math.floor(casNz(L.toHouse)));
  L.toHouseAmt = Math.max(0, Math.floor(casNz(L.toHouseAmt))); // 被扣掉那幾筆的本金（交給莊家時，莊家借出去還沒收回的本金跟著減）
  L.toGb = Math.max(0, Math.floor(casNz(L.toGb))); L.toGbAmt = Math.max(0, Math.floor(casNz(L.toGbAmt))); // 新借款（佩佩銀行出的）被扣掉、還沒交給佩佩銀行的錢和本金
  L.limit = Math.min(L.limit, NUM.casino.loan.capMax); // 額度上限（規劃 2.11a）：比上限高的立刻降下來，沒到期的借款照舊
  if (!casIsObj(L.lv) || (L.lv.day !== "" && !okDay(L.lv.day))) L.lv = { day: "", n: 0 };
  L.lv.n = Math.max(0, Math.floor(casNz(L.lv.n)));
  L.list = (Array.isArray(L.list) ? L.list : []).filter(x => casIsObj(x) && Number.isFinite(+x.amt) && +x.amt > 0 && okDay(x.day) && okDay(x.due))
    .map(x => ({ id: Math.floor(casNz(x.id)), ...(x.g ? { g: 1 } : {}), amt: Math.floor(+x.amt), owe: Math.max(Math.floor(+x.amt), Math.floor(casNz(x.owe, x.amt))), day: x.day, due: casLoanDueFix(x.day, x.due), at: Number.isFinite(+x.at) && x.at != null ? +x.at : null, ext: Math.max(0, Math.min(9, Math.floor(casNz(x.ext)))), parts: Math.max(0, Math.min(99, Math.floor(casNz(x.parts)))), lateHit: !!x.lateHit,
      plan: (Array.isArray(x.plan) ? x.plan : []).filter(s => casIsObj(s) && okDay(s.due) && Number.isFinite(+s.owe) && +s.owe > 0).slice(0, 8).map(s => ({ due: s.due, owe: Math.floor(+s.owe), amt: Math.max(0, Math.min(Math.floor(+s.owe), Math.floor(casNz(s.amt)))) })) }))
    .map(x => { if (x.plan.length) { x.owe = x.plan.reduce((a, s) => a + s.owe, 0); x.amt = Math.max(1, x.plan.reduce((a, s) => a + s.amt, 0)); x.due = x.plan[0].due; } else delete x.plan; return x; }); // 分期的借款：總和、到期日都從期表算出來，不會對不上
  L.notes = (Array.isArray(L.notes) ? L.notes : []).filter(s => typeof s === "string").slice(-5);
  if (!okDay(L.debtSince)) L.debtSince = null;
  if (w.chips >= 0) L.debtSince = null;
}
// 這筆最早什麼時候可以還（毫秒）；舊的借款沒記時間：馬上可以還
export const casLoanFrom = x => (x && Number.isFinite(x.at) ? x.at + NUM.casino.loan.repayAfterMin * 60000 : null);
// 準時還清壹筆之後的額度：多 limitPct%（無條件進位）
export const casLoanNext = limit => Math.min(NUM.casino.loan.capMax, Math.ceil(limit * (100 + NUM.casino.loan.limitPct) / 100));
// 要還多少：本金加利息，無條件進位
export const casLoanOwe = amt => Math.ceil(amt * (100 + NUM.casino.loan.interestPct) / 100);
// 還沒還的本金加起來
export const casLoanOpen = w => w.loan.list.reduce((s, x) => s + x.amt, 0);
// 還能借多少
// 欠款中（錢包是負的）額度鎖在壹開始的額度（規劃 2.11a）
export const casLoanLeft = w => Math.max(0, (w.chips < 0 ? Math.min(w.loan.limit, NUM.casino.loan.limit) : w.loan.limit) - casLoanOpen(w));
// 全館沒還的本金最多多少：max(outMin, 莊家的錢 × outPct%)
const casLoanOutCap = house => Math.max(NUM.casino.loan.outMin, Math.floor(Math.max(0, house.bankroll) * NUM.casino.loan.outPct / 100));
// 換日：到期（今天 > due）沒還的，從籌碼直接扣，扣到負的也扣；每扣壹筆額度降 latePct%。籌碼變負的記下哪天開始
export function casLoanRoll(w, day) {
  const L = w.loan;
  if (!okDay(day)) return [];
  const late = L.list.filter(x => day > x.due);
  late.forEach(x => {
    // 分期的借款：只扣到期的那幾期（一個壹個），額度只降壹次（lateHit）；沒分期的整筆扣
    do {
      const s = Array.isArray(x.plan) && x.plan.length ? x.plan[0] : null, owe = s ? s.owe : x.owe, amt = s ? s.amt : x.amt;
      w.chips -= owe;
      if (x.g) { L.toGb += owe; L.toGbAmt += amt; } // 決定 0130：新借款扣的錢交給佩佩銀行
      else { L.toHouse += owe; L.toHouseAmt += amt; } // 扣掉的錢是還給莊家的（決定 0071），下壹次碰到莊家時交過去
      if (!x.lateHit) {
        L.late++;
        L.limit = Math.floor(L.limit * (100 - NUM.casino.loan.latePct) / 100);
        L.notes.push(casFill(CAS_TEXT.loanLate, { day: x.day.slice(5), owe: casNum(owe), limit: casNum(L.limit) }));
      }
      x.lateHit = true;
      if (s) { x.plan.shift(); x.owe -= owe; x.amt -= amt; if (x.plan.length) x.due = x.plan[0].due; }
    } while (x.plan && x.plan.length && day > x.due);
  });
  if (late.length) { L.list = L.list.filter(x => !(late.includes(x) && !(x.plan && x.plan.length))); L.notes = L.notes.slice(-5); }
  // 欠款從哪天算：這次扣的話，從最早那筆到期的隔天算（換日沒進賭場也照算）
  if (w.chips < 0) { if (!L.debtSince) L.debtSince = late.length ? casAddDays(late.map(x => x.due).sort()[0], 1) : day; } else L.debtSince = null;
  return late;
}
// 文化部資助壹位館友（決定 0131）：暱稱比對（去空白、小寫）、只壹次（house.cg[id]、w.gifts[id]）；錢從文化部（已知世界的 u-culture）出到錢包，守恆，不憑空、不是借款，莊家和博物館資金不經手；
// 同壹個交易裡寄壹封信（回傳 { id, mail }，伺服器寫進 mail/{uid}/items）。條件不符、已經撥過、已知世界付不出就回 null
export const casGiftKey = s => String(s == null ? "" : s).replace(/\s+/g, "").toLowerCase();
// 這個暱稱是不是文化部資助的對象（伺服器的 peek 用：是的才多做壹個交易）
export const casGiftWho = nick => { const G = NUM.casino.cultureGift; return !!G && !!G.on && G.nicks.some(x => casGiftKey(x) === casGiftKey(nick)); };
export function casCultureGift(w, house, nick, day, t) {
  const G = NUM.casino.cultureGift;
  if (!G || !G.on || !w || !house || !okDay(day) || !G.nicks.some(x => casGiftKey(x) === casGiftKey(nick))) return null;
  if (!casIsObj(house.cg)) house.cg = {};
  if (!casIsObj(w.gifts)) w.gifts = {};
  if (house.cg[G.id] || w.gifts[G.id]) return null;
  const n = Math.max(0, Math.floor(G.amt)); if (!(n > 0) || n > casWorldRoom(house, NUM.casino.world)) return null;
  const got = casWorldOut(w, house, "cultureGift", n, NUM.casino.world); if (got !== n) return null;
  wuDebit(house, "u-culture", n); wtLed(house, "cultureGift", "u-culture", "players", n); // 金流圖：文化部 → 館友
  house.cg[G.id] = day; w.gifts[G.id] = day;
  const T = CAS_GIFT, id = ("cg-" + G.id).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 100);
  return { id, mail: { id, from: T.name, title: T.title, note: [casFill(T.hello, { nick: String(nick) })].concat(T.lines).join("\n"), gift: { insp: 0, mood: 0 }, sent: day, expire: casAddDays(day, G.days || 365), claimed: false }, got: n };
}
// 現在借得到嗎：可以的話回 null，不行回原因（畫面上那壹條、Discord 都用這個）
export function casLoanWhyNot(w, playing, house) {
  const C = NUM.casino.loan;
  if (!w) return CAS_TEXT.loanBad;
  if (playing) return CAS_TEXT.loanPlaying;
  if (house && gbSplitOn(house)) { if (gbRoom(house) < C.min) return CAS_TEXT.loanGbShort; } // 決定 0130：看佩佩銀行放得出多少，不看莊家
  else if (house && !(house.bankroll > 0)) return CAS_TEXT.loanHouseNone; // 莊家沒有現金：借款暫停（規劃 2.11）
  // 欠款中（籌碼是負的）也可以借（翊文 11-10：「欠款中可以借」），壹樣受額度限制
  if (w.loan.list.length >= C.maxOpen) return casFill(CAS_TEXT.loanMany, { n: w.loan.list.length });
  if (casLoanLeft(w) < C.min) return CAS_TEXT.loanFull;
  return null;
}
// 現在借得到嗎（Discord 的「可以跟 Yuga 借」提醒看這個）。w 要是 casWalletFix 過的
export const casCanRelief = w => !!w && !casLoanWhyNot(w, false);
// 這句失敗的原因是不是「錢不夠」（買不起、下注不夠、斗內不夠）：是的話，借得到就多提醒壹句可以借
export function casPoorReason(reason) {
  const s = String(reason == null ? "" : reason);
  return [CAS_TEXT.betPoor, CAS_TEXT.dinerBroke, CAS_LIVE.poor, "籌碼不夠"].some(t => s.includes(t.split("{")[0]));
}
// 借：amt 是玩家要借的（字串、數字都收；"max" ＝借滿）。成功：籌碼加 amt，記壹筆要在 days 天內還 amt×(1+利息)
// t：伺服器現在的時間（毫秒）。借的時候記下來，repayAfterMin 分鐘之後才能還
// house：莊家（決定 0071，翊文 11-13：「從莊家來才對」）。借出去的錢從莊家出，還回來的本金加利息回到莊家。不給 house 只動錢包（舊的測試）
// 舊的 3 天借款延成 7 天（翊文 11-15：「原本最早欠錢是三天要還的那批改成給現在一樣的七天內還」；PR 504 起新借的就是 7 天）：
//   11-15（含）以前借、到期日剛好是借的那天＋3 的，改成借的那天＋7。利息照借的時候記的（owe 不動）。已經到期被扣掉的不在 list 裡，不會回來。冪等：改過的是＋7，不會再改
export const LOAN_OLD_UNTIL = "2026-11-15";
export function casLoanDueFix(day, due) {
  return okDay(day) && okDay(due) && day <= LOAN_OLD_UNTIL && due === casAddDays(day, 3) ? casAddDays(day, 7) : due;
}
export function casBorrow(w, amt, day, playing, t, house) {
  const C = NUM.casino.loan;
  const why = casLoanWhyNot(w, playing, house);
  if (why) return { ok: false, reason: why };
  const left = casLoanLeft(w);
  let n = amt === "max" ? left : Math.floor(Number(String(amt == null ? "" : amt).replace(/[,，\s]/g, "")));
  if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: CAS_TEXT.loanBad };
  if (n < C.min) return { ok: false, reason: casFill(CAS_TEXT.loanMin, { n: casNum(C.min) }) };
  n = Math.min(n, left);
  const GB = !!house && gbSplitOn(house); // 決定 0130：新借款由佩佩銀行準備金出，舊的（沒有 g 記號）還給莊家
  if (GB) {
    const room = gbRoom(house);
    if (room < C.min) return { ok: false, reason: CAS_TEXT.loanGbShort };
    if (amt !== "max" && n > room) return { ok: false, reason: casFill(CAS_TEXT.loanGbMax, { max: casNum(room) }) };
    n = Math.min(n, room);
  } else if (house) { // 莊家的現金要夠；全館沒還的本金不超過上限（規劃 2.11a）
    const room = Math.min(house.bankroll, casLoanOutCap(house) - Math.max(0, Math.floor(casNz(house.loansOut))));
    if (room < C.min) return { ok: false, reason: CAS_TEXT.loanOutFull };
    if (amt !== "max" && n > room) return { ok: false, reason: casFill(CAS_TEXT.loanHouseShort, { max: casNum(room) }) };
    n = Math.min(n, room);
  }
  const L = w.loan, x = { id: ++L.seq, amt: n, owe: casLoanOwe(n), day, due: casAddDays(day, C.days), at: Number.isFinite(t) ? t : null };
  if (GB) x.g = 1;
  L.list.push(x);
  w.chips += n;
  if (GB) gbLend(house, n);
  else if (house) { casHouseMove(house, "loan", -n); house.loansOut = Math.max(0, Math.floor(casNz(house.loansOut))) + n; } // 從莊家出（莊家可以借到變負的：破產中，換日 Yuga 借他重新開張）
  w.st.reliefs++; // 成就「Yuga 的朋友」：第壹次借
  return { ok: true, loan: x, lines: [CAS_TEXT.loanHello, casFill(CAS_TEXT.loanGive, { n: casNum(n), due: x.due.slice(5), owe: casNum(x.owe), pct: C.interestPct })], ach: casAchCheck(w, day) };
}
// 還：id 沒給就還最早到期的那筆。要壹次還清那壹筆（本金加利息）。準時還清（到期前都算準時），額度多 limitPct%
export function casRepay(w, id, day, playing, t, house) {
  if (playing) return { ok: false, reason: CAS_TEXT.loanPlaying };
  const L = w.loan;
  const x = id == null ? L.list.slice().sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.id - b.id))[0] : L.list.find(y => y.id === Math.floor(Number(id)));
  if (!x) return { ok: false, reason: CAS_TEXT.loanNone };
  const from = casLoanFrom(x);
  if (from && Number.isFinite(t) && t < from) return { ok: false, reason: casFill(CAS_TEXT.loanTooSoon, { n: NUM.casino.loan.repayAfterMin, left: Math.ceil((from - t) / 60000) }) };
  if (w.chips < x.owe) return { ok: false, reason: casFill(CAS_TEXT.loanPoor, { owe: casNum(x.owe) }) };
  w.chips -= x.owe;
  if (house && x.g && gbSplitOn(house)) gbCollect(house, x.owe, x.amt); // 決定 0130：新借款還給佩佩銀行
  else if (house) { casHouseMove(house, "loanBack", x.owe); house.loansOut = Math.max(0, Math.floor(casNz(house.loansOut)) - x.amt); } // 本金加利息回到莊家
  L.list = L.list.filter(y => y !== x);
  if (!x.lateHit) { // 分期的借款有壹期逾期被扣過：額度已經降了，這次還清不算準時、不升級
    L.ok++;
    // 額度升級（規劃 2.11a）：當天借當天還的不升；壹天最多升 levelPerDay 級
    if (!casIsObj(L.lv)) L.lv = { day: "", n: 0 };
    if (L.lv.day !== day) L.lv = { day, n: 0 };
    if (x.day !== day && L.lv.n < NUM.casino.loan.levelPerDay) { L.limit = casLoanNext(L.limit); L.lv.n++; }
  }
  return { ok: true, loan: x, lines: [casFill(CAS_TEXT.loanBack, { owe: casNum(x.owe), limit: casNum(L.limit) })] };
}
// ---------- 部分還款、分期（決定 0114） ----------
// 付 p（先還利息、再還本金），從最早的一期開始。回傳 { principal 還掉的本金, interest 還掉的利息（含分期手續費）}；x.owe、x.amt、x.plan、x.due 跟著改
function casLoanTake(x, p) {
  let left = p, pr = 0, it = 0;
  const slices = Array.isArray(x.plan) && x.plan.length ? x.plan : [x];
  for (const s of slices) {
    if (left <= 0) break;
    const take = Math.min(left, s.owe), ip = Math.min(take, s.owe - s.amt), pp = take - ip;
    s.owe -= take; s.amt -= pp; pr += pp; it += ip; left -= take;
  }
  if (Array.isArray(x.plan) && x.plan.length) {
    x.plan = x.plan.filter(s => s.owe > 0);
    x.owe = x.plan.reduce((a, s) => a + s.owe, 0); x.amt = x.plan.reduce((a, s) => a + s.amt, 0);
    if (x.plan.length) x.due = x.plan[0].due;
  }
  return { principal: pr, interest: it };
}
// 一次最少還多少（這筆剩下的要還的，比這個少就只能壹次還清）
export const casLoanPartMin = x => Math.min(x.owe, Math.max(NUM.casino.loan.part.minAbs, Math.ceil(x.owe * NUM.casino.loan.part.minPct / 100)));
// 還壹部分：amt（籌碼）。先還利息、再還本金；不升信用、不算準時還清。opts.free ＝賣股還債來的（不受最低金額、錢包夠不夠看呼叫的人給的 opts.cap）
export function casRepayPart(w, id, amt, day, playing, t, house, opts) {
  opts = opts || {};
  if (playing) return { ok: false, reason: CAS_TEXT.loanPlaying };
  const L = w.loan, P = NUM.casino.loan.part;
  const x = id == null ? L.list.slice().sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.id - b.id))[0] : L.list.find(y => y.id === Math.floor(Number(id)));
  if (!x) return { ok: false, reason: CAS_TEXT.loanNone };
  const from = casLoanFrom(x);
  if (from && Number.isFinite(t) && t < from) return { ok: false, reason: casFill(CAS_TEXT.loanTooSoon, { n: NUM.casino.loan.repayAfterMin, left: Math.ceil((from - t) / 60000) }) };
  let p = Math.floor(Number(String(amt == null ? "" : amt).replace(/[,，\s]/g, "")));
  if (!Number.isFinite(p) || p <= 0) return { ok: false, reason: CAS_TEXT.loanBad };
  if (p >= x.owe) return casRepay(w, x.id, day, false, t, house); // 付得起整筆：就是整筆還清（有升級）
  if (!opts.free) {
    if (p < casLoanPartMin(x)) return { ok: false, reason: casFill(CAS_TEXT.loanPartMin, { n: casNum(casLoanPartMin(x)) }) };
    if ((x.parts || 0) >= P.max) return { ok: false, reason: casFill(CAS_TEXT.loanPartMany, { n: x.parts, max: P.max }) };
  }
  if (w.chips < p) return { ok: false, reason: casFill(CAS_TEXT.loanPoor, { owe: casNum(p) }) };
  w.chips -= p;
  const r = casLoanTake(x, p);
  if (house && x.g && gbSplitOn(house)) gbCollect(house, p, r.principal);
  else if (house) { casHouseMove(house, "loanBack", p); house.loansOut = Math.max(0, Math.floor(casNz(house.loansOut)) - r.principal); } // 還的錢回到莊家，沒還的本金減掉還掉的本金
  x.parts = (x.parts || 0) + 1;
  return { ok: true, loan: x, paid: p, principal: r.principal, interest: r.interest, lines: [casFill(CAS_TEXT.loanPart, { p: casNum(p), amt: casNum(x.amt), owe: casNum(x.owe), due: x.due.slice(5) })] };
}
// 轉分期：回 null ＝ 可以，不然回原因
export function casLoanSplitWhy(w, x, day, house) {
  const S = NUM.casino.loan.split, T = CAS_TEXT;
  if (!S.on) return T.loanSplitOff;
  if (!x) return T.loanNone;
  if (x.plan && x.plan.length) return T.loanSplitHad;
  if (day > x.due) return T.loanSplitLate;
  if (x.ext > 0) return T.loanSplitExt;
  if (!(casDaysBetween(x.day, day) >= S.minAgeDays)) return T.loanSplitAge;
  if (x.amt < S.minAmt) return casFill(T.loanSplitSmall, { n: casNum(S.minAmt) });
  return null;
}
// 分期的期表（不動東西，預覽也用這個）：k 期、每期隔 g 天。第 1 期 ＝ 原本的到期日；回傳 [{ due, owe, amt }] 和總手續費。手續費 ＝ 該期本金 × 日利率 × 延後天數，進位
export function casLoanSplitPlan(x, k, g) {
  const C = NUM.casino.loan, dayRate = C.interestPct / C.days / 100, plan = [];
  let fee = 0;
  const baseA = Math.floor(x.amt / k), baseO = Math.floor(x.owe / k);
  for (let i = 0; i < k; i++) {
    const a = baseA + (i === 0 ? x.amt - baseA * k : 0), o = baseO + (i === 0 ? x.owe - baseO * k : 0), f = i === 0 ? 0 : Math.ceil(a * dayRate * g * i);
    plan.push({ due: casAddDays(x.due, g * i), owe: o + f, amt: a }); fee += f;
  }
  return { plan, fee };
}
export function casLoanSplit(w, id, k, g, day, house) {
  const S = NUM.casino.loan.split, L = w.loan, x = L.list.find(y => y.id === Math.floor(Number(id)));
  k = Math.floor(+k); g = Math.floor(+g);
  if (!Number.isFinite(k) || !Number.isFinite(g) || k < S.kMin || k > S.kMax || g < S.gMin || g > S.gMax) return { ok: false, reason: casFill(CAS_TEXT.loanSplitBad, { kmin: S.kMin, kmax: S.kMax, gmin: S.gMin, gmax: S.gMax }) };
  const why = casLoanSplitWhy(w, x, day, house); if (why) return { ok: false, reason: why };
  const { plan, fee } = casLoanSplitPlan(x, k, g);
  x.plan = plan; x.owe = plan.reduce((a, s) => a + s.owe, 0); x.amt = plan.reduce((a, s) => a + s.amt, 0); x.due = plan[0].due;
  return { ok: true, loan: x, fee, lines: [casFill(CAS_TEXT.loanSplitOk, { k, fee: casNum(fee), plan: plan.map(s => s.due.slice(5) + " " + casNum(s.owe)).join("、") })] };
}
// 舊的名字：Discord 和舊的「relief」動作都走這裡，借 NUM.casino.loan.discord 這麼多（額度不夠借剩下的）
export function casRelief(w, day, playing, t, house) {
  const left = casLoanLeft(w);
  return casBorrow(w, Math.min(NUM.casino.loan.discord, left), day, playing, t, house);
}
// 到期被直接扣掉的錢交給莊家（伺服器每個賭場交易讀到莊家時叫）。回傳交了多少
export function casLoanToHouse(w, house) {
  const L = w && w.loan;
  if (L && house && L.toGb > 0 && gbSplitOn(house)) { const g = Math.floor(L.toGb); gbCollect(house, g, Math.floor(casNz(L.toGbAmt))); L.toGb = 0; L.toGbAmt = 0; } // 新借款扣的：交給佩佩銀行（決定 0130）
  if (!L || !house || !(L.toHouse > 0)) return 0;
  const n = Math.floor(L.toHouse);
  casHouseMove(house, "loanBack", n); L.toHouse = 0;
  house.loansOut = Math.max(0, Math.floor(casNz(house.loansOut)) - Math.floor(casNz(L.toHouseAmt))); L.toHouseAmt = 0;
  return n;
}
// ---------- 欠款送參觀者去地下工作（決定 0064 第二部分） ----------
// w.work：{ vid, name, job, san 現在的理智, san0 下去前的理智, base 開工那天的欠款（正的）, since 開工那天, last 算到哪天, paid 還了多少 }，沒有就 null
function casWorkFix(w) {
  const x = w.work;
  if (!casIsObj(x) || !okDay(x.since) || !(Number(x.base) > 0)) { w.work = null; return; }
  x.base = Math.floor(+x.base); x.san = Math.floor(casNz(x.san, 1)); x.san0 = Math.max(x.san, Math.floor(casNz(x.san0, x.san)));
  x.paid = Math.max(0, Math.floor(casNz(x.paid)));
  if (!okDay(x.last)) x.last = x.since;
  x.vid = String(x.vid || ""); x.name = String(x.name || "").slice(0, 24); x.job = x.job == null ? null : String(x.job);
}
// 每天還多少
export const casWorkPay = x => Math.min(Math.ceil(x.base * NUM.casino.work.payPct / 100), NUM.casino.work.payMax);
// 現在要不要送人下去：籌碼是負的，又沒人在工作（翊文 11-10：到期還不出來、負的超過壹天都要送；現在只有到期會變負的，所以負的就要送）
export const casMustWork = w => !!w && w.chips < 0 && !w.work;
// 換日：從上次算到的那天到今天，每過壹天還壹次、理智 −sanDay（最低 sanMin）。還清（回到 0）就停
export function casWorkRoll(w, day) {
  const x = w.work, C = NUM.casino.work;
  if (!x || !okDay(day) || day <= x.last) return 0;
  let n = casDaysBetween(x.last, day), got = 0;
  while (n-- > 0 && w.chips < 0) {
    const pay = Math.min(casWorkPay(x), -w.chips);
    casMint(w, "work", pay); x.paid += pay; got += pay; // 憑空：欠款被扣、工作補回 0（經濟規劃發現 4）
    x.san = Math.max(C.sanMin, x.san - C.sanDay);
  }
  x.last = day;
  if (w.chips >= 0) w.loan.debtSince = null;
  return got;
}
// 開工：P 是挑戰模式的存檔（伺服器在同壹個交易裡改）。vid 是要送下去的那位
export function casWorkStart(w, P, vid, day) {
  const C = NUM.casino.work;
  if (!P) return { ok: false, reason: CAS_TEXT.workWho };
  if (w.chips >= 0) return { ok: false, reason: CAS_TEXT.workNoDebt };
  if (w.work) return { ok: false, reason: CAS_TEXT.workAlready };
  const all = [P].concat(Array.isArray(P.visitors) ? P.visitors : []);
  const who = all.find(v => v && v.vid === vid);
  if (!who) return { ok: false, reason: CAS_TEXT.workWho };
  if (!who.job || who.dark || who.work) return { ok: false, reason: CAS_TEXT.workCant };
  const name = who.vname || `第 ${who.visitor || 1} 位參觀者`;
  if (P.vid === vid && !workBench(P).length) return { ok: false, needNew: true, reason: casFill(CAS_TEXT.workNeedNew, { name }) };
  const v = sendToWork(P, vid, day);
  if (!v) return { ok: false, reason: CAS_TEXT.workCant };
  w.work = { vid, name, job: v.job, san: Math.max(C.sanMin, Math.floor(casNz(v.sanity, C.sanMin))), san0: 0, base: -w.chips, since: day, last: day, paid: 0 };
  w.work.san0 = w.work.san;
  const pay = casWorkPay(w.work);
  return { ok: true, name, lines: [casFill(CAS_TEXT.workSent, { name, pay: casNum(pay), days: Math.ceil(w.work.base / pay) })] };
}
// 花靈感補理智：n 是要補幾點（補到下去前的理智為止）。靈感從存檔的博物館扣
export function casWorkCheer(w, P, n) {
  const C = NUM.casino.work, x = w.work;
  if (!x) return { ok: false, reason: CAS_TEXT.workNone };
  if (!P) return { ok: false, reason: CAS_TEXT.workWho };
  const room = x.san0 - x.san;
  if (room <= 0) return { ok: false, reason: CAS_TEXT.workFull };
  let k = Math.floor(Number(n));
  if (!Number.isFinite(k) || k < 1) k = 1;
  k = Math.min(k, room);
  const cost = k * C.inspPerSan;
  if (!(P.insp >= cost)) return { ok: false, reason: casFill(CAS_TEXT.workInsp, { n: cost }) };
  P.insp -= cost;
  x.san += k;
  return { ok: true, n: k, cost, lines: [casFill(CAS_TEXT.workCheered, { name: x.name, n: k, san: x.san })] };
}
// 回來：還清了（籌碼 ≥ 0）才回來。存檔裡那位拿掉工作的記號、理智換成工作完的。錢包沒有工作、存檔還掛著記號的（壞掉的）也清掉
export function casWorkEnd(w, P) {
  const x = w.work;
  if (x && w.chips < 0) return { ok: false, reason: casFill(CAS_TEXT.workLine, { name: x.name, san: x.san, san0: x.san0, debt: casNum(-w.chips), days: Math.ceil(-w.chips / casWorkPay(x)) }) };
  const v = P ? backFromWork(P, x ? x.vid : null, x ? x.san : NaN) : null;
  w.work = null;
  const notes = x && Array.isArray(x.notes) ? x.notes.filter(n => CAS_TEXT.meetNotes[n.t]).map(n => `${n.nick}：「${CAS_TEXT.meetNotes[n.t]}」`) : [];
  return { ok: true, back: !!(x || v), name: x ? x.name : v ? (v.vname || `第 ${v.visitor || 1} 位參觀者`) : "", san: x ? x.san : v ? v.sanity : null,
    lines: (x || v ? [casFill(CAS_TEXT.workBack, { name: x ? x.name : v.vname || "參觀者", san: x ? x.san : v.sanity })] : [])
      .concat(notes.length ? [casFill(CAS_TEXT.meetGot, { name: x.name, list: notes.join("、") })] : []) };
}
// 別的館友在地下遇到他（決定 0064 第三部分）：me 是遇到的人的錢包，w 是工作的人的錢包。kind：hello、give、note（tpl 是第幾句）
// 每位館友對同壹位工作的參觀者，每種壹天壹次（記在 w.work.met）
export function casWorkMeet(me, w, kind, tpl, day, who) {
  const C = NUM.casino.work, x = w && w.work;
  if (!x) return { ok: false, reason: CAS_TEXT.meetGone };
  if (!who || !who.uid) return { ok: false, reason: CAS_TEXT.meetGone };
  if (!casIsObj(x.met) || x.met.day !== day) x.met = { day, by: {} };
  const done = Array.isArray(x.met.by[who.uid]) ? x.met.by[who.uid] : [];
  if (!["hello", "give", "note"].includes(kind)) return { ok: false, reason: CAS_TEXT.meetGone };
  if (done.includes(kind)) return { ok: false, reason: CAS_TEXT.meetDone };
  let line;
  if (kind === "hello") {
    x.san = Math.min(x.san0, x.san + C.helloSan);
    line = casFill(CAS_TEXT.meetHelloOk, { name: x.name, n: C.helloSan });
  } else if (kind === "give") {
    if (!me || me.chips < C.giveChips) return { ok: false, reason: casFill(CAS_TEXT.meetPoor, { n: casNum(C.giveChips) }) };
    me.chips -= C.giveChips; w.chips += C.giveChips;
    line = casFill(CAS_TEXT.meetGiveOk, { name: x.name, n: casNum(C.giveChips) });
  } else {
    const t = CAS_TEXT.meetNotes[Math.floor(Number(tpl))];
    if (!t) return { ok: false, reason: CAS_TEXT.meetGone };
    if (!Array.isArray(x.notes)) x.notes = [];
    x.notes = x.notes.concat([{ nick: String(who.nick || "館友").slice(0, 12), t: Math.floor(Number(tpl)), day }]).slice(-10);
    line = casFill(CAS_TEXT.meetNoteOk, { name: x.name });
  }
  x.met.by[who.uid] = done.concat(kind);
  return { ok: true, kind, line, san: x.san };
}
// 公開給館友看的（Realtime Database 的 workers/{uid}）：只放名字、職業、理智、館主暱稱
export const casWorkPublic = (w, nick) => (w && w.work && w.chips < 0 ? { name: String(w.work.name || "參觀者").slice(0, 24), job: String(w.work.job || "").slice(0, 24), san: w.work.san, owner: String(nick || "館友").slice(0, 12) } : null);
// 畫面要的
export function casWorkView(w) {
  const x = w.work;
  if (!x) return null;
  const pay = casWorkPay(x);
  return { vid: x.vid, name: x.name, job: x.job, san: x.san, san0: x.san0, base: x.base, pay, since: x.since, paid: x.paid, debt: Math.max(0, -w.chips), done: w.chips >= 0,
    days: w.chips >= 0 ? 0 : Math.ceil(-w.chips / pay) };
}

// ---------- 全簽到壹週加送籌碼（翊文 11-11：「簽到一週加送1500萬」） ----------
// save 是這個人的整份存檔（伺服器讀的），簽到記在 save.signin.weeks（壹週全簽到了才有那壹週）。
// 只看這週和上壹週（換週那天才簽滿也領得到），壹週只送壹次，記在 w.signWk。籌碼憑空來（跟借款壹樣，不經過莊家）
export function casSignWeekChips(w, save, day) {
  const weeks = save && save.signin && save.signin.weeks && typeof save.signin.weeks === "object" ? save.signin.weeks : {};
  if (!w.signWk || typeof w.signWk !== "object") w.signWk = {};
  const cur = weekIndex(day), n = NUM.signin.weekChips, got = [];
  [cur, cur - 1].forEach(wk => {
    if (!weeks[wk] || w.signWk[wk]) return;
    w.signWk[wk] = day;
    casMint(w, "signWeek", n);
    got.push(wk);
  });
  Object.keys(w.signWk).map(Number).filter(k => k < cur - 8).forEach(k => delete w.signWk[k]); // 只留最近的
  return { n: got.length, chips: got.length * n, weeks: got };
}

// 「Yuga 來收錢了」的話：拿走（畫面說完就清掉）
export function casLoanTakeNotes(w) { const n = w.loan.notes; w.loan.notes = []; return n; }
// 快速按鈕照額度算（11-15，翊文：額度 300 萬時按鈕還是 2,500／7,500／12,500「好改」）：額度的 quickPct%，往下取成 1、2、3、5 開頭的整數，不到 min 的、重複的拿掉
export function casLoanQuick(limit) {
  const C = NUM.casino.loan, out = [];
  for (const p of C.quickPct || []) {
    const raw = Math.floor(Math.max(0, +limit || 0) * p / 100);
    if (raw < C.min) continue;
    const e = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / e, nice = (f >= 5 ? 5 : f >= 3 ? 3 : f >= 2 ? 2 : 1) * e;
    if (nice >= C.min && !out.includes(nice)) out.push(nice);
  }
  return out.length ? out : C.quick.slice();
}
// 畫面要的借款摘要
export function casLoanView(w, day) {
  const C = NUM.casino.loan, L = w.loan;
  return {
    limit: L.limit, left: casLoanLeft(w), pct: C.interestPct, days: C.days, min: C.min, quick: casLoanQuick(L.limit), ok: L.ok, late: L.late,
    debtSince: L.debtSince, debtDays: L.debtSince && okDay(day) ? casDaysBetween(L.debtSince, day) : 0,
    why: casLoanWhyNot(w, false), notes: L.notes.slice(),
    list: L.list.slice().sort((a, b) => (a.due < b.due ? -1 : 1)).map(x => ({ id: x.id, amt: x.amt, owe: x.owe, day: x.day, due: x.due, today: x.due === day,
      from: casLoanFrom(x), parts: x.parts || 0, partMin: casLoanPartMin(x), partMax: C.part.max, plan: x.plan && x.plan.length ? x.plan.map(s => ({ due: s.due, owe: s.owe })) : null, splitWhy: casLoanSplitWhy(w, x, day, null) })),
    split: { on: C.split.on, kMin: C.split.kMin, kMax: C.split.kMax, gMin: C.split.gMin, gMax: C.split.gMax, dayFeePct: C.interestPct / C.days }, // from：最早什麼時候可以還（毫秒，null ＝馬上）；畫面照自己的時鐘決定按鈕，伺服器再擋壹次
  };
}
const casAddDays = (s, n) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const casDaysBetween = (a, b) => { const f = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((f(b) - f(a)) / 86400000); };

// ---------- 大禮包（舊的機率）：由莊家出 ----------
export function casPackDraw(maxStars = 5) {
  const roll = 1 + Math.floor(RNG() * (maxStars >= 5 ? 1000 : CAS_PACKS.find(x => x.stars === maxStars).upTo)); // 1–1000；maxStars < 5：只骰到那一星為止（全館每天上限用完）
  const p = CAS_PACKS.find(x => roll <= x.upTo);
  const chips = p.base + (p.extra ? Math.floor(RNG() * (p.extra + 1)) * p.step : 0);
  return { roll, stars: p.stars, name: p.name, chips };
}
// 壹包大禮包平均給多少籌碼（照 CAS_PACKS 算，不用模擬）：餐車的機率、券的價錢、贏牌抽券都照這個對（決定 0070）
export function casPackEV() {
  let prev = 0, ev = 0;
  for (const p of CAS_PACKS) { ev += (p.upTo - prev) / 1000 * (p.base + p.extra * p.step / 2); prev = p.upTo; }
  return ev;
}
export const casPacksLeft = w => w.pk.left + w.tickets;
// 一次開 n 包：先用今天免費的，再用券
// 莊家缺錢時，今天的免費大禮包少發幾包（NUM.casino.health）。house 沒給就是 0
export function casPackCut(house) {
  const H = NUM.casino.health, D = NUM.casino.dailyPacks;
  if (!house || !H) return 0;
  if (house.bankroll <= 0) return Math.max(0, D - H.brokePacks);
  if (house.bankroll < H.low) return Math.max(0, D - H.lowPacks);
  return 0;
}
// 全館大禮包壹天付出的（決定 0116）：house.pks { day, n }；超過 NUM.casino.packDayCap 之後當天的包只發 1～3 星
export function casPackAdd(h, day, n) {
  n = Math.floor(casNz(n));
  if (!(n > 0) || !day) return;
  if (!casIsObj(h.pks) || h.pks.day !== day) h.pks = { day, n: 0 };
  h.pks.n += n;
}
export const casPackCapped = (h, day) => !!(h && day && NUM.casino.packDayCap > 0 && casIsObj(h.pks) && h.pks.day === day && h.pks.n >= NUM.casino.packDayCap);
export function casOpenPacks(w, house, n, day) {
  const C = NUM.casino, cut = casPackCut(house), freeLeft = Math.max(0, w.pk.left - cut), avail = freeLeft + w.tickets;
  n = Math.floor(+n);
  if (!(n >= 1)) return { ok: false, reason: "要開幾包？" };
  if (n > C.maxPacksAtOnce) n = C.maxPacksAtOnce;
  if (avail < 1) return { ok: false, reason: cut > 0 ? CAS_TEXT.packHouse : CAS_TEXT.packNone };
  n = Math.min(n, avail);
  const packs = [], dcap = house ? casDrawCap(house) : null;
  for (let i = 0; i < n; i++) {
    if (house && casPayLeft(house, day) <= 0) break; // 莊家今天賠付的額度用完了：剩下的包明天再開
    if (w.pk.left - cut > 0) w.pk.left--; else w.tickets--;
    w.pk.opened++;
    const d = casPackDraw(casPackCapped(house, day) ? 3 : 5); // 全館今天大禮包付出到上限了：只發 1～3 星
    if (dcap != null && d.chips > dcap) d.chips = dcap; // 莊家手頭緊：壹包最多賠這麼多（五星億萬大禮包縮水）
    w.chips += d.chips;
    casHouseMove(house, "pack", -d.chips);
    if (house) { casPayAdd(house, day, d.chips); casPackAdd(house, day, d.chips); }
    if (d.stars === 5) w.st.star5++;
    packs.push(d);
  }
  if (!packs.length) return { ok: false, reason: CAS_TEXT.payCapDone };
  w.st.chipsMax = Math.max(w.st.chipsMax, w.chips);
  casWkPacks(w, packs);
  return { ok: true, packs, total: packs.reduce((s, p) => s + p.chips, 0), left: casPacksLeft(w), ach: casAchCheck(w, day) };
}

// ---------- 餐車 ----------
// pick：餐點的號碼（1–9）或 id。吃東西有機會抽到券（要先開過今天的大禮包）
// 吃東西的效果（翊文 11-09：「買賭場裡吃的東西應該也要可以加一些心情之類的效果」）：心情、理智，一天有上限。
// P 是這位參觀者（沒有、自由模式就沒有效果）。燈熄了的時候不加理智。回傳 { mood, san, full（今天的份吃完了） }
// 這樣東西吃下去其實是哪壹樣（零食會變成烤雞，舊的梗）：菜單上的數字要跟實際加的壹樣
export const casFoodOf = it => (it && it.redirect ? CAS_MENU.find(x => x.id === it.redirect) || it : it);
// 這樣東西的效果說明，遊戲和 Discord 都用這壹份，不要各自組字（翊文 11-09：屬性不要寫錯）。
// showSan：Discord 的頻道裡不放理智，傳 false。test/casino.test.cjs 會實際買過每壹樣，比對這裡寫的和真的加的
export function casFoodWords(it, showSan = true) {
  const f = casFoodOf(it);
  return [f && f.mood ? `心情 +${f.mood}` : "", showSan && f && f.san ? `理智 +${f.san}` : ""].filter(Boolean);
}
// 今天還能靠吃東西加幾點心情
export const casFoodLeft = (w, day) => Math.max(0, NUM.casino.foodCap.mood - (w.food && w.food.day === day ? w.food.mood : 0));
export function casFoodEffect(w, it, P, day) {
  const none = { mood: 0, san: 0, full: false };
  if (!it || (!it.mood && !it.san) || !P || isFree(P)) return none;
  const C = NUM.casino.foodCap;
  if (!w.food || w.food.day !== day) w.food = { day, mood: 0, san: 0 };
  const hh = limitedHome(P); // 限定帽子（廚師帽、金瓜子項鍊）：吃的心情多壹點、理智的每天上限多壹點（心情的每天上限不變）
  const moodRoom = Math.min(C.mood - w.food.mood, 99 - (P.mood || 0)), mood = Math.max(0, Math.min((it.mood || 0) + (it.mood && hh.foodMood ? hh.foodMood : 0), moodRoom));
  const want = P.dark ? 0 : Math.max(0, Math.min(it.san || 0, C.san + (hh.foodSan || 0) - w.food.san));
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
  casHouseMove(house, "food", it.price);
  casInUsed(w, house, "food", day); // 館內股票：今天有這個人吃過餐車
  casInSpent(w, house, "food", day, it.price); // 營收：花的錢（每人每天封頂，決定 0087）
  casCount(house, "food");
  lines.push(it.line || "");
  let gotTickets = 0;
  const food = casFoodEffect(w, it, P, day);
  // 買完要說恢復了多少（翊文 11-09：「吃餐車恢復的心情應該也要再買之後說壹下」）
  if (food.mood || food.san) lines.push([food.mood ? casFill(food.mood < (it.mood || 0) ? CAS_TEXT.foodCut : CAS_TEXT.foodMood, { n: food.mood, now: P.mood, want: it.mood }) : "", food.san ? `理智 +${food.san}` : ""].filter(Boolean).join("，"));
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
      if (RNG() * 100 < it.odds) { w.tickets += 3; gotTickets = 3; lines.push(casFill(CAS_TEXT.dinerWon, { p: it.odds, n: 3 })); }
      else lines.push(casFill(CAS_TEXT.dinerOdds, { p: it.odds }));
    }
  }
  lines.push(CAS_TEXT.dinerThanks);
  return { ok: true, item: it.id, price: it.price, lines: lines.filter(Boolean), tickets: gotTickets, ach: casAchCheck(w, day), mood: food.mood, san: food.san };
}
// 贏一把：有機率多一張券（舊的 rottery(20)；要先開過今天的大禮包）。
// 機率照下的注（決定 0070）：券的期望值是注的 packWinEvPct %，最多 packWinOdds %。舊的不管注多少都是 20%，下 100 贏了也有 34 萬的期望值
export const casWinOdds = bet => Math.min(NUM.casino.packWinOdds, Math.max(0, +bet || 0) * NUM.casino.packWinEvPct / casPackEV());
export function casWinTicket(w, bet) {
  if (w.pk.opened < 1) return false;
  if (!(RNG() * 100 < casWinOdds(bet))) return false;
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
  casBurn(w, "exchange", it.chips); // 唯一消失籌碼的地方
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
  casMint(w, "legacy", c.chips);
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
  const left = casPayLeft(house, day), top = Math.min(casBetMax(house), left === Infinity ? Infinity : Math.floor(left / NUM.casino.risk.betMult));
  if (left <= 0 || top < NUM.casino.minBet) return { ok: false, gag: true, reason: CAS_TEXT.payCapDone };
  const chk = casBetCheck(text, w.chips, top);
  if (!chk.ok) return { ok: false, gag: true, reason: left !== Infinity && top < casBetMax(house) && /最多/.test(chk.line) ? casFill(CAS_TEXT.payCapBet, { max: casNum(top) }) : chk.line };
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
    ticket = settle.ok && round.out && ["win", "blackjack", "charlie"].includes(round.out.kind) && casWinTicket(w, round.bet);
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
export function casWalletView(w, day, house) {
  const C = NUM.casino;
  return {
    foodMoodLeft: Math.max(0, NUM.casino.foodCap.mood - (w.food && w.food.day === day ? w.food.mood : 0)), foodSanLeft: Math.max(0, NUM.casino.foodCap.san - (w.food && w.food.day === day ? w.food.san : 0)),
    chips: w.chips, tickets: w.tickets, packsToday: w.pk.left, packsLeft: casPacksLeft(w), packCut: house ? casPackCut(house) : 0, opened: w.pk.opened,
    canRelief: casCanRelief(w), loan: casLoanView(w, day), work: casWorkView(w), mustWork: casMustWork(w),
    ex: C.exchange.map(x => ({ id: x.id, chips: x.chips, perWeek: x.perWeek, left: casExchangeLeft(w, x.id) })),
    ach: Object.keys(w.ach).map(id => Object.assign({ d: w.ach[id].d }, casAchInfo(w, id))).filter(a => a.name),
    props: Object.keys(w.props).map(id => Object.assign({ n: w.props[id].n, d: w.props[id].d, hung: w.hung.includes(id) }, casPropInfo(w, id))).filter(p => p.name),
    title: w.title, hungMax: C.hangMax, legacy: !!w.legacy, tablePid: w.tablePid || null,
    st: Object.assign({}, w.st),
  };
}
