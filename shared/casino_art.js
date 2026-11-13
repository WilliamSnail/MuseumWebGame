// ================================================================
//  藝術市場第一步：跟館方買賣每日特展的畫（11-14；翊文：「藝術市場也是一個市場機制」「畫可以當像富人買用來避險的感覺」）
//  規劃：docs/經濟體系規劃.md 2.10 節。這份只做「跟館方買賣」；稀有的畫之後另外開拍賣（還沒做）。
//  定位：畫是避險資產，不是賭博。價格每天只動一點點、景氣差的時候撐住（甚至微漲）、買賣有價差，所以短線進出一定虧，放著才有一點點增值。
//  價格（casArtPrice）＝ 底價 × (1 ＋ 放久了 ＋ 景氣 ＋ 搶手)：
//    底價：照稀有度四級（casArtTier）。放久了（casArtAge）：展出後前 ageFastDays 天每天 ＋ageFastPct%（為了兩個禮拜內回本），之後每天只 ＋ageUpPct%，最多 ＋ageCapPct%（到頂就停，不是穩賺）。
//    景氣：反向，景氣差（house.econ.b < 0）畫價微漲、景氣好微跌，最多 ±moodPct%（casFxMood 只讀）。
//    搶手：全館現在有幾個人持有這幅，每人 ＋demandPct%，最多 ＋demandCapPct%（house.art.own）。
//  錢怎麼動（守恆，shared/casino_book.js）：買＝錢包 → 莊家（casHouseMove "art"）；賣回＝莊家 → 錢包，只付 sellPct%，差額留在莊家。
//    莊家現金不夠付就不收（reason），不印錢、不讓預算池墊。
//  存檔：P.art（這間博物館的，跟收藏一起，不是某位參觀者的；舊存檔沒有，casArtFix 補）：
//    { v, own: { 畫 id: { tier, date, d 買的那天, paid 付了多少, title } }, buys: { 日期: 買了幾幅 } }
//  莊家 house.art = { own: { 畫 id: 全館持有幾份 } }（舊的莊家沒有，用到時補）
//  純函式：「今天」從參數來，不碰亂數。伺服器入口在 functions/art.js。
// ================================================================
import { NUM } from "./config.js";
import { casHouseMove } from "./casino_book.js";
import { casFxMood } from "./casino_gdp.js";
import { casNum } from "./casino.js";

const arBox = v => !!v && typeof v === "object" && !Array.isArray(v);
const arN = v => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
const arDay = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const arUTC = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const arDiff = (a, b) => Math.round((arUTC(b) - arUTC(a)) / 86400000);
const arFill = (s, o) => Object.keys(o).reduce((t, k) => t.split("{" + k + "}").join(String(o[k])), s);
const arHas = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const arTierOf = n => Math.min(NUM.art.tiers.length - 1, arN(n));

// 畫面和回覆的字。草稿，Yuga 可以改
export const CAS_ART = {
  title: "藝術市場",
  sub: "放著就放著。畫的價格壹天只動壹點點，景氣差的時候反而撐得住；買賣有價差，進進出出會虧。",
  buy: "買下", sell: "賣回", owned: "已收藏", held: "我收藏的畫",
  price: "館方價", back: "賣回拿",
  buyOk: "買下「{title}」，付了 {n}。放著就好。",
  sellOk: "「{title}」賣回館方，拿回 {n}（買的時候付了 {paid}）。",
  bad: "這幅畫沒辦法買賣。",
  nomode: "要用挑戰模式的參觀者才能收藏畫。",
  notToday: "這幅畫已經不在今天的特展，館方不收新的。",
  dup: "這幅你已經收藏了。壹幅畫只能收壹份。",
  poor: "籌碼不夠。",
  dayCap: "今天已經買了 {n} 幅，明天再來。",
  full: "收藏架放滿了（最多 {n} 幅），先賣回壹幅。",
  none: "你沒有收藏這幅畫。",
  houseShort: "館方現在手頭緊，收不起這幅，過幾天再來。",
  quota: "館方今天收的畫夠多了，明天再來。",
  sellCap: "今天已經賣回 {n} 幅，明天再來。",
  heldFull: "館方的收藏架現在放不下更多畫，過幾天再來。",
  be: "再放 {n} 天，賣回才回本",
  beDone: "現在賣回已經拿得回買進價",
  empty: "還沒收藏任何畫。",
  rule: "壹天最多買 {perDay} 幅，最多收藏 {holdMax} 幅，壹幅畫壹個人只能收壹份。賣回只拿現價的 {sellPct}%，大約放兩個禮拜才回本；回本之後漲得很慢，不是賺錢的東西。",
};

// 稀有度 0～3。內容可以直接寫 rarity（0～3）；沒寫的話：金色畫框、有理智檢定、藏著線索，有任何壹個就是「少見」（1），都沒有是「尋常」（0）。
// 珍藏（2）、孤品（3）只能手寫 rarity（11-14 數值平衡：三個標記各加壹級的話孤品永遠不會出現，少見又太多）
export function casArtTier(w) {
  if (!arBox(w)) return 0;
  if (w.rarity != null && Number.isFinite(+w.rarity)) return arTierOf(w.rarity);
  return w.frame === "gold" || w.san || w.clue ? 1 : 0;
}
// 展出 d 天的「放久了」漲幅（%）：前 ageFastDays 天每天 ageFastPct，之後每天 ageUpPct，最多 ageCapPct
export function casArtAge(d) {
  const C = NUM.art, n = Math.max(0, Number.isFinite(+d) ? +d : 0), f = Math.min(n, C.ageFastDays);
  return Math.min(C.ageCapPct, f * C.ageFastPct + (n - f) * C.ageUpPct);
}

// 存檔：P.art 補欄位、丟掉壞的。P 不是物件就回 null
export function casArtFix(P) {
  if (!arBox(P)) return null;
  if (!arBox(P.art)) P.art = {};
  const A = P.art, own = {};
  A.v = 1;
  if (arBox(A.own)) {
    for (const id of Object.keys(A.own)) {
      const x = A.own[id];
      if (id === "__proto__" || !arBox(x) || !arDay(x.date)) continue;
      own[id] = { tier: arTierOf(x.tier), date: x.date, d: arDay(x.d) ? x.d : x.date, paid: arN(x.paid), title: typeof x.title === "string" ? x.title.slice(0, 40) : "" };
    }
  }
  A.own = own;
  const buys = {};
  if (arBox(A.buys)) for (const d of Object.keys(A.buys)) if (arDay(d) && arN(A.buys[d]) > 0) buys[d] = arN(A.buys[d]);
  A.buys = buys;
  const sells = {};
  if (arBox(A.sells)) for (const d of Object.keys(A.sells)) if (arDay(d) && arN(A.sells[d]) > 0) sells[d] = arN(A.sells[d]);
  A.sells = sells;
  return A;
}
// 莊家：house.art 補欄位
export function casArtHouse(house) {
  if (!arBox(house.art)) house.art = {};
  if (!arBox(house.art.own)) house.art.own = {};
  for (const id of Object.keys(house.art.own)) { const n = arN(house.art.own[id]); if (n > 0) house.art.own[id] = n; else delete house.art.own[id]; }
  house.art.paid = arN(house.art.paid); // 全館持有的畫的買進價合計
  if (!arBox(house.art.out) || !arDay(house.art.out.day)) house.art.out = { day: "", n: 0 }; // 今天館方已經付出去的賣回金額
  house.art.out.n = arN(house.art.out.n);
  return house.art;
}

// 現價。item：{ tier, date }（畫出現的那天）；id：算「搶手」用的
export function casArtPrice(item, id, day, house) {
  const C = NUM.art, base = C.tiers[arTierOf(item && item.tier)].base;
  const age = arDay(item && item.date) && arDay(day) ? casArtAge(Math.max(0, arDiff(item.date, day))) : 0;
  const b = casFxMood(house), mood = Number.isFinite(b) ? -b * C.moodPct : 0;
  const own = house && arBox(house.art) && arBox(house.art.own) ? arN(house.art.own[id]) : 0;
  const demand = Math.min(C.demandCapPct, own * C.demandPct);
  return Math.max(C.unit, Math.round(base * (1 + (age + mood + demand) / 100) / C.unit) * C.unit);
}
// 賣回館方拿多少
export const casArtSellPrice = price => Math.floor(arN(price) * NUM.art.sellPct / 100);
// 再放幾天，賣回才拿得回買進價（paid）。照「現在的景氣和搶手」往後算；已經拿得回就是 0；四百天內都不行就是 null
export function casArtBreakEven(item, id, day, house, paid) {
  if (!arDay(day) || !(arN(paid) > 0)) return null;
  const cur = arN(paid);
  for (let n = 0; n <= 400; n++) {
    const d = new Date(arUTC(day) + n * 86400000).toISOString().slice(0, 10);
    if (casArtSellPrice(casArtPrice(item, id, d, house)) >= cur) return n;
  }
  return null;
}
// 賣回壹天全館最多付多少：莊家的錢 × sellQuotaPct% ＋ sellQuotaBase（當天第壹筆不受限，不然比額度貴的畫永遠賣不掉）
const arQuota = house => Math.floor(Math.max(0, Number.isFinite(+house.bankroll) ? +house.bankroll : 0) * NUM.art.sellQuotaPct / 100) + NUM.art.sellQuotaBase;

const buysToday = (A, day) => arN(A.buys[day]);
// 買。work：{ id, date, tier, title }（伺服器從登記的畫裡查，不信瀏覽器）
export function casArtBuy(w, house, P, work, day) {
  const C = NUM.art, A = casArtFix(P);
  if (!A) return { ok: false, reason: CAS_ART.nomode };
  if (!arDay(day) || !arBox(work) || typeof work.id !== "string" || !work.id || !arDay(work.date)) return { ok: false, reason: CAS_ART.bad };
  if (arDiff(work.date, day) < 0 || arDiff(work.date, day) >= C.shelfDays) return { ok: false, reason: CAS_ART.notToday };
  if (work.id === "__proto__") return { ok: false, reason: CAS_ART.bad };
  if (arHas(A.own, work.id)) return { ok: false, reason: CAS_ART.dup };
  if (buysToday(A, day) >= C.perDay) return { ok: false, reason: arFill(CAS_ART.dayCap, { n: C.perDay }) };
  if (Object.keys(A.own).length >= C.holdMax) return { ok: false, reason: arFill(CAS_ART.full, { n: C.holdMax }) };
  casArtHouse(house);
  const tier = arTierOf(work.tier), title = String(work.title || "").slice(0, 40);
  const price = casArtPrice({ tier, date: work.date }, work.id, day, house);
  if (!Number.isFinite(+w.chips) || w.chips < price) return { ok: false, reason: CAS_ART.poor };
  if (house.art.paid + price > Math.max(0, Number.isFinite(+house.bankroll) ? +house.bankroll : 0) * C.heldPct / 100) return { ok: false, reason: CAS_ART.heldFull };
  w.chips -= price; casHouseMove(house, "art", price); house.art.paid += price;
  house.art.own[work.id] = arN(house.art.own[work.id]) + 1;
  A.own[work.id] = { tier, date: work.date, d: day, paid: price, title };
  A.buys[day] = buysToday(A, day) + 1;
  for (const d of Object.keys(A.buys)) if (arDiff(d, day) > 14) delete A.buys[d]; // 舊的日期不留
  return { ok: true, price, id: work.id, lines: [arFill(CAS_ART.buyOk, { title, n: casNum(price) })] };
}
// 賣回
export function casArtSell(w, house, P, id, day) {
  const A = casArtFix(P);
  if (!A) return { ok: false, reason: CAS_ART.nomode };
  if (!arDay(day)) return { ok: false, reason: CAS_ART.bad };
  const x = typeof id === "string" && arHas(A.own, id) ? A.own[id] : null;
  if (!x) return { ok: false, reason: CAS_ART.none };
  casArtHouse(house);
  const pay = casArtSellPrice(casArtPrice(x, id, day, house));
  if (arN(A.sells[day]) >= NUM.art.sellPerDay) return { ok: false, reason: arFill(CAS_ART.sellCap, { n: NUM.art.sellPerDay }) };
  if (!Number.isFinite(+house.bankroll) || house.bankroll < pay) return { ok: false, reason: CAS_ART.houseShort };
  if (house.art.out.day !== day) house.art.out = { day, n: 0 };
  if (house.art.out.n > 0 && house.art.out.n + pay > arQuota(house)) return { ok: false, reason: CAS_ART.quota };
  casHouseMove(house, "art", -pay); w.chips += pay;
  house.art.out.n += pay; house.art.paid = Math.max(0, house.art.paid - arN(x.paid)); A.sells[day] = arN(A.sells[day]) + 1;
  for (const d of Object.keys(A.sells)) if (arDiff(d, day) > 14) delete A.sells[d];
  delete A.own[id];
  const left = arN(house.art.own[id]) - 1;
  if (left > 0) house.art.own[id] = left; else delete house.art.own[id];
  return { ok: true, pay, paid: x.paid, id, lines: [arFill(CAS_ART.sellOk, { title: x.title, n: casNum(pay), paid: casNum(x.paid) })] };
}

// 畫面要的。works：今天特展上、館方有登記的畫 [{ id, date, tier, title }]。只讀，不改任何東西（P、house 也不補欄位）
export function casArtView(w, house, P, works, day) {
  const C = NUM.art, A = arBox(P) && arBox(P.art) ? P.art : {}, own = arBox(A.own) ? A.own : {};
  const bought = arBox(A.buys) ? arN(A.buys[day]) : 0, chips = w && Number.isFinite(+w.chips) ? Math.floor(+w.chips) : 0;
  const tierName = t => C.tiers[arTierOf(t)].name;
  const items = (Array.isArray(works) ? works : []).filter(x => arBox(x) && typeof x.id === "string" && arDay(x.date)).map(x => {
    const price = casArtPrice(x, x.id, day, house), mine = arBox(own[x.id]);
    return { id: x.id, tier: arTierOf(x.tier), tierName: tierName(x.tier), price, owned: mine, sellPrice: mine ? casArtSellPrice(casArtPrice(own[x.id], x.id, day, house)) : 0, canBuy: !mine && bought < C.perDay && chips >= price };
  });
  const mine = Object.keys(own).filter(id => arBox(own[id]) && arDay(own[id].date)).map(id => {
    const x = own[id], price = casArtPrice(x, id, day, house);
    return { id, title: String(x.title || ""), tier: arTierOf(x.tier), tierName: tierName(x.tier), paid: arN(x.paid), price, sellPrice: casArtSellPrice(price), breakEven: casArtBreakEven(x, id, day, house, arN(x.paid)) };
  });
  return { items, mine, left: Math.max(0, C.perDay - bought), perDay: C.perDay, holdMax: C.holdMax, sellPct: C.sellPct, chips };
}
