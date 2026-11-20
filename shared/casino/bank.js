// ================================================================
//  Yuga Bot 銀行：活存、定存（翊文 11-13：「規劃好了我們就上線新的銀行體系讓大家玩，可以投資了」→「照這樣做」）
//  規劃：docs/規劃/經濟體系規劃.md 玩法 2、第 2.7 節（銀行三步：活存定存 → 館債 → 館內股票）。
//  錢怎麼動（守恆，shared/casino/book.js）：
//    存進去：錢包的籌碼搬到 w.bank（還是玩家的，只是不能下注）。快照把 w.bank 算進全館的錢。
//    利息：從莊家出（casHouseMove "bankInt"），莊家 ≤ 0（破產中）就沒有利息，不印錢。
//  活存：每天換日照「昨天結束時的活存」給利息，本金最多算 saveCap；利息直接進活存。
//  定存：存 3 天或 7 天，到期那天換日自動把本金加利息放回活存；提早解約只拿回本金。同時最多 termMax 筆。
//  不用每天回來領：下壹次碰到莊家（任何賭場動作）時，把沒算的天數補算（最多 catchup 天）。
//  純函式：「今天」從參數來，不碰資料庫和 DOM。錢包欄位 w.bank：{ save, terms: [{ id, amt, days, pct, day, due }], seq, day, earned, notes }
// ================================================================
import { NUM } from "../core/config.js";
import { casHouseMove } from "./book.js";
import { casBankEcon, casFxMul, casWorldNews } from "./gdp.js";
import { OUT_STOCKS } from "../stock/text.js";
import { CAS_BANK, CAS_TAKE } from "./text.js";
import { casFill, casNum } from "./core.js";
import { casLoanView } from "./wallet.js";
import { casBondHeld, casBondView } from "./bond.js";
import { casStockValue, casStockViewAll } from "./stock.js";
import { casNpcToday } from "../npc/spend.js";
import { casInvestPubView } from "./invest.js";
import { casDebtView } from "./debt.js";
import { gbFix, gbPay, gbSplitOn } from "../world/core.js";
import { casAdvisorPlan } from "./advisor.js";

const cbkBox = v => !!v && typeof v === "object" && !Array.isArray(v);
const cbkN = v => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
const cbkDay = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const cbkAddDays = (s, n) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const cbkDiff = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);

// 補欄位（壞資料也不丟錯）。不換日、不算利息（那是 casBankAccrue）
export function casBankFix(w) {
  if (!cbkBox(w.bank)) w.bank = { save: 0, terms: [], seq: 0, day: null, earned: 0, notes: [] };
  const B = w.bank;
  B.save = cbkN(B.save); B.seq = cbkN(B.seq); B.earned = cbkN(B.earned);
  if (!cbkDay(B.day)) B.day = null;
  B.terms = (Array.isArray(B.terms) ? B.terms : []).filter(x => cbkBox(x) && cbkN(x.amt) > 0 && cbkDay(x.due))
    .map(x => ({ id: cbkN(x.id), amt: cbkN(x.amt), days: cbkN(x.days), pct: Math.max(0, +x.pct || 0), day: cbkDay(x.day) ? x.day : x.due, due: x.due }));
  B.notes = (Array.isArray(B.notes) ? B.notes : []).filter(s => typeof s === "string").slice(-5);
  return B;
}
// 存在銀行的全部（活存＋定存的本金）。記帳的快照用
export const casBankHeld = w => { if (!cbkBox(w && w.bank)) return 0; const B = w.bank; return cbkN(B.save) + (Array.isArray(B.terms) ? B.terms.reduce((s, x) => s + cbkN(x && x.amt), 0) : 0); };

// 莊家付利息：莊家 ≤ 0 不付；最多付到莊家的 houseCapPct%（免得被存款吸乾）。回傳真的付了多少
function cbkPay(house, want) {
  const C = NUM.casino.bank;
  if (house && want > 0 && gbSplitOn(house)) return gbPay(house, Math.min(Math.floor(want), Math.floor(Math.max(0, gbFix(house).cash) * C.houseCapPct / 100)), "pBankInt"); // 決定 0130：利息由佩佩銀行付
  if (!house || want <= 0 || house.bankroll <= 0) return 0;
  const n = Math.min(Math.floor(want), Math.floor(house.bankroll * C.houseCapPct / 100));
  if (n <= 0) return 0;
  casHouseMove(house, "bankInt", -n);
  return n;
}
// 換日補算：上次算到 B.day，今天 day。每過壹天：活存給壹天利息；到期的定存（due ≤ 那天）放回活存。
// 回傳這次的事件 { int 活存利息, back [{ amt, int }] 到期的定存 }，同時把壹句話放進 B.notes（畫面下次拿到就說）
export function casBankAccrue(w, house, day) {
  const C = NUM.casino.bank, B = casBankFix(w);
  const out = { int: 0, back: [] };
  if (!cbkDay(day)) return out;
  if (!B.day) { B.day = day; return out; }
  const n = cbkDiff(B.day, day);
  if (n <= 0) return out;
  const first = Math.max(1, n - C.catchup + 1); // 太久沒來：只補最後 catchup 天
  let broke = false;
  for (let i = first; i <= n; i++) {
    const d = cbkAddDays(B.day, i);
    // 活存：照前壹天結束時的餘額
    const base = Math.min(B.save, C.saveCap), want = Math.floor(base * C.savePct / 100 * casFxMul(house)); // 利率隨景氣 ±10%
    if (want > 0) { const got = cbkPay(house, want); if (got < want) broke = true; B.save += got; B.earned += got; out.int += got; }
    // 定存：到期日 ≤ 今天的放回活存
    const due = B.terms.filter(x => x.due <= d);
    for (const x of due) {
      const want2 = Math.floor(x.amt * x.pct / 100 * casFxMul(house)), got = cbkPay(house, want2);
      if (got < want2) broke = true;
      B.save += x.amt + got; B.earned += got;
      out.back.push({ amt: x.amt, int: got, days: x.days });
    }
    if (due.length) B.terms = B.terms.filter(x => !due.includes(x));
  }
  B.day = day;
  if (out.int > 0) B.notes.push(casFill(CAS_BANK.noteInt, { n: casNum(out.int) }));
  out.back.forEach(x => B.notes.push(casFill(CAS_BANK.noteBack, { days: x.days, amt: casNum(x.amt), int: casNum(x.int) })));
  if (broke) B.notes.push(CAS_BANK.noteBroke);
  B.notes = B.notes.slice(-5);
  return out;
}
// 拿走還沒說的話（畫面說完就清掉）
export function casBankTakeNotes(w) { const B = casBankFix(w); const n = B.notes; B.notes = []; return n; }

const cbkAmt = (amt, max) => (amt === "max" ? max : Math.floor(Number(String(amt == null ? "" : amt).replace(/[,，\s]/g, ""))));
// 存活存：從籌碼搬進活存
export function casBankPut(w, amt) {
  const C = NUM.casino.bank, B = casBankFix(w);
  const n = cbkAmt(amt, Math.max(0, w.chips));
  if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: CAS_BANK.bad };
  if (n < C.min) return { ok: false, reason: casFill(CAS_BANK.min, { n: casNum(C.min) }) };
  if (n > w.chips) return { ok: false, reason: CAS_BANK.poor };
  w.chips -= n; B.save += n;
  return { ok: true, n, lines: [casFill(CAS_BANK.putOk, { n: casNum(n), save: casNum(B.save) })] };
}
// 領活存：從活存搬回籌碼
export function casBankTake(w, amt) {
  const B = casBankFix(w);
  const n = cbkAmt(amt, B.save);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: CAS_BANK.bad };
  if (n > B.save) return { ok: false, reason: CAS_BANK.takePoor };
  B.save -= n; w.chips += n;
  return { ok: true, n, lines: [casFill(CAS_BANK.takeOk, { n: casNum(n), save: casNum(B.save) })] };
}
// 開壹筆定存：kind 是 NUM.casino.bank.terms 的第幾種；錢從籌碼出
export function casBankTerm(w, amt, kind, day) {
  const C = NUM.casino.bank, B = casBankFix(w), T = C.terms[Math.floor(+kind)];
  if (!T || !cbkDay(day)) return { ok: false, reason: CAS_BANK.bad };
  if (B.terms.length >= C.termMax) return { ok: false, reason: casFill(CAS_BANK.termMany, { n: C.termMax }) };
  const n = cbkAmt(amt, Math.max(0, w.chips));
  if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: CAS_BANK.bad };
  if (n < C.termMin) return { ok: false, reason: casFill(CAS_BANK.min, { n: casNum(C.termMin) }) };
  if (n > C.termCap) return { ok: false, reason: casFill(CAS_BANK.termCap, { n: casNum(C.termCap) }) };
  if (n > w.chips) return { ok: false, reason: CAS_BANK.poor };
  const x = { id: ++B.seq, amt: n, days: T.days, pct: T.pct, day, due: cbkAddDays(day, T.days) };
  w.chips -= n; B.terms.push(x);
  return { ok: true, term: x, lines: [casFill(CAS_BANK.termOk, { n: casNum(n), days: T.days, due: x.due.slice(5), int: casNum(Math.floor(n * T.pct / 100)) })] };
}
// 提早解約：只拿回本金
export function casBankBreak(w, id) {
  const B = casBankFix(w), x = B.terms.find(t => t.id === Math.floor(+id));
  if (!x) return { ok: false, reason: CAS_BANK.noTerm };
  B.terms = B.terms.filter(t => t !== x); w.chips += x.amt;
  return { ok: true, n: x.amt, lines: [casFill(CAS_BANK.breakOk, { n: casNum(x.amt) })] };
}
// 銀行廳（美術統籌在做 web/src/rooms/bank/ui_bank.js）要的全部：現金、存款、借款；館債、股票、景氣還沒做先給 null。
// net：淨值 ＝ 現金 ＋ 活存 ＋ 定存 －（沒還的本金加利息）。之後加持股市值
// house 給的話多館債（bonds）；淨值也加上館債本金和憑證
// dayData 給的話多 world（財報頁的世界股市新聞，shared/casino/gdp.js 的 casWorldNews；dayData ＝ functions/shared/day_data.js 的 DAY_DATA）
export function casBankHall(w, day, house, t, stale, dayData) {
  const save = casBankView(w, day), loan = casLoanView(w, day), bonds = house ? casBondView(w, house, day) : null;
  const stocks = house ? casStockViewAll(w, house, day, t, stale) : null;
  const owe = loan.list.reduce((s, x) => s + x.owe, 0);
  const held = save.save + save.terms.reduce((s, x) => s + x.amt, 0) + casBondHeld(w) + (bonds ? bonds.iou : 0) + (house ? casStockValue(w, house) : 0);
  return { debt: casDebtView(w, t), advisor: casAdvisorPlan(w, house, day, t), cash: w.chips, save, loan, bonds, stocks, econ: house ? casBankEcon(house) : null, today: house ? casNpcToday(house.npcLive, day) : null, houseInv: house ? casInvestPubView(house) : null, live: house ? casBooksLive(house) : null, world: casWorldNews(dayData, day, OUT_STOCKS), net: w.chips + held - owe };
}
// 全館的帳的即時餘額（11-17 翊文：「能夠改成即時一點嗎?」）：銀行每次打開都從莊家現在的樣子拿，不等隔天 05:00 的日報
const casBooksLive = h => { const N = v => (Number.isFinite(+v) ? Math.floor(+v) : 0); return { bankroll: N(h.bankroll), budget: N(h.budget), museum: N(h.museum), gov: N(h.gov), sea: N(h.sea), world: h.world == null ? null : N(h.world), ext: h.world == null ? null : N(h.ext), gb: h.gb ? N(h.gb.cash) : 0 }; };
// 畫面要的
export function casBankView(w, day) {
  const C = NUM.casino.bank, B = casBankFix(w);
  return {
    save: B.save, earned: B.earned, savePct: C.savePct, saveCap: C.saveCap, min: C.min, termMin: C.termMin, termCap: C.termCap, termMax: C.termMax,
    perDay: Math.floor(Math.min(B.save, C.saveCap) * C.savePct / 100),
    kinds: C.terms.map((t, i) => ({ i, days: t.days, pct: t.pct })),
    terms: B.terms.map(x => ({ id: x.id, amt: x.amt, days: x.days, pct: x.pct, due: x.due, int: Math.floor(x.amt * x.pct / 100), left: cbkDay(day) ? Math.max(0, cbkDiff(day, x.due)) : null })),
    quick: C.quick,
  };
}

// ---------- 館門口池子的水位（決定 0132，翊文 11-19：水位跟著被資助那位館友的錢動；門檻 ＝ 淨值 1.5 倍；到門檻那晚只收東西、不收錢）----------
// 淨值：籌碼＋存款（活存、定存）＋館債＋股票市值（館外、館內、集團股）＋鎖住的（掛單、槓桿保證金、拍賣出價）−沒還的借款本息。不算畫。
export function casNetWorth(w, house) {
  const N = v => (Number.isFinite(+v) ? Math.floor(+v) : 0);
  if (!w || !house) return 0;
  const gs = w.gs && w.gs.h && house.gs && house.gs.u ? Object.keys(w.gs.h).reduce((s, id) => s + (house.gs.u[id] ? Math.floor(N(w.gs.h[id]) * (+house.gs.u[id].P || 0)) : 0), 0) : 0;
  const owe = w.loan && Array.isArray(w.loan.list) ? w.loan.list.reduce((s, x) => s + N(x && x.owe), 0) : 0;
  return N(w.chips) + casBankHeld(w) + casBondHeld(w) + casStockValue(w, house) + N(w.lev && w.lev.hold) + N(w.gs && w.gs.hold) + N(w.auc && w.auc.hold) + gs - owe;
}
const plRound = v => Math.round(v * 10000) / 10000;
// 收到資助的人壹進來：莊家文件 house.pool 還沒有就建（起點 base ＝ 這一刻的淨值，水位在 start）。回傳有沒有新建
// 決定 0143：水位看好幾個人合計賺的（house.pool.who ＝ { uid: { base 上壹次日報的淨值, e 累計賺的 } }）；第壹位建池子，之後收到資助的人壹進來加進 who（起點是那一刻的淨值，收到的款已經在裡面）
export function casPoolEnsure(w, house, nick, uid, day) {
  const P = NUM.casino.pool, G = NUM.casino.cultureGift, key = s => String(s == null ? "" : s).replace(/\s+/g, "").toLowerCase();
  if (!P || !G || !G.on || !house || !house.cg) return false;
  const got = [G].concat(NUM.casino.cultureGiftMore || []).some(g => house.cg[g.id] && g.nicks.some(x => key(x) === key(nick)));
  const ex = !got && house.pool ? (P.extra || []).find(g => g.nicks.some(x => key(x) === key(nick)) && (!g.from || String(day) >= g.from)) : null; // 決定 0148：沒收資助、水位已經在了才加進來
  if (!got && !ex) return false;
  const u = String(uid), nw = Math.max(1, casNetWorth(w, house));
  if (!house.pool) { house.pool = { uid: u, who: { [u]: { base: nw, e: 0 } }, base: nw, e: 0, lv: P.start, day: null, hold: 0, night: null, hits: 0, last: null, trace: [] }; return true; }
  const Q = house.pool; if (!Q.who) casPoolWho(Q);
  if (Q.who[u]) return false;
  Q.who[u] = ex && ex.take === false ? { base: nw, e: 0, nt: 1 } : { base: nw, e: 0 }; return true; // nt ＝ 門檻那晚不收他的名字
}
// 舊的 pool（單壹 uid）換成 who（base、e 照搬）
const casPoolWho = Q => { if (!Q.who || typeof Q.who !== "object") Q.who = { [String(Q.uid)]: { base: Math.max(1, +Q.base || 1), e: Math.max(0, +Q.e || 0) } }; return Q.who; };
// 每天 05:00 日報算（nw ＝ 日報那刻他的淨值）：水位目標 ＝ clamp(start ＋ (1−start) × e ÷ earnT，min，1)，e ＝ 累計賺的（每天日報淨值比上壹次多的部分，虧的不算，決定 0142）；每天最多動 step；連續 confirm 個日報目標 ≥ 1 且水位到頂，就是「水漲到門檻」，那天晚上 night ＝ 當天（全館看得到事件），
// 隔天日報（天亮前）收完：水退回 start、起點重設成那一刻的淨值、hits ＋ 1。只收東西（劇情定），不動錢。壹天只算壹次。回傳有沒有動
// nws ＝ { uid: 淨值 }（決定 0143，多人合計）；給壹個數字就當成 pool.uid 那位
export function casPoolDay(house, day, nws) {
  const C = NUM.casino.pool, P = house && house.pool;
  if (!C || !P || !P.uid || P.day === day) return false;
  if (typeof nws === "number" || typeof nws === "string") nws = { [P.uid]: +nws };
  if (!nws || typeof nws !== "object" || !Object.values(nws).some(v => Number.isFinite(+v))) return false;
  const legacy = !(P.e >= 0), who = casPoolWho(P), fl = v => Math.max(1, Math.floor(+v));
  if (legacy) { P.e = 0; for (const u of Object.keys(who)) { who[u].e = 0; if (Number.isFinite(+nws[u])) who[u].base = fl(nws[u]); } P.day = day; return true; } // 決定 0142：舊的 pool 第壹次日報，從 0 開始累計（不追溯），上壹次淨值設成現在
  if (P.night && P.night < day) { const nd = P.night; P.lv = C.start; P.e = 0; for (const u of Object.keys(who)) { who[u].e = 0; if (Number.isFinite(+nws[u])) who[u].base = fl(nws[u]); } P.takeLeft = Object.keys(who).filter(u => !who[u].nt); P.hold = 0; P.night = null; P.hits = (P.hits || 0) + 1; P.last = { day: nd }; P.take = nd; P.day = day; P.trace = (P.trace || []).concat([0]).slice(-C.trace); return true; }
  for (const u of Object.keys(who)) { if (!Number.isFinite(+nws[u])) continue; who[u].e += Math.max(0, Math.floor(+nws[u]) - who[u].base); who[u].base = fl(nws[u]); } // 決定 0142、0143：每個人各自跟自己上壹次比，只算賺的（虧的當 0），累計只增不減；水位看大家合計
  P.e = Object.values(who).reduce((a, x) => a + x.e, 0);
  const target = Math.min(1, Math.max(C.min, C.start + (1 - C.start) * P.e / C.earnT)), dl = Math.max(-C.step, Math.min(C.step, target - P.lv));
  P.lv = plRound(Math.min(1, Math.max(C.min, P.lv + dl))); P.day = day;
  P.trace = (P.trace || []).concat([dl > 0.00005 ? 1 : dl < -0.00005 ? -1 : 0]).slice(-C.trace);
  P.hold = target >= 1 ? (P.hold || 0) + 1 : 0;
  if (P.lv >= 1 && P.hold >= C.confirm && !P.night) P.night = day;
  return true;
}
// 全館看得到的（peek 回）：不寫誰、不寫數字。lv 量化成 0～grid 格；band；night 只在門檻那晚（那壹天的 18:00 起，到隔天 05:00 換日前）才是 true；trace 最近幾天的漲（1）退（−1）不動（0）；hits 到過幾次
export function casPoolView(house, day, t) {
  const C = NUM.casino.pool, P = house && house.pool;
  if (!C || !P || !P.uid) return null;
  const mins = Number.isFinite(+t) ? (((Math.floor(+t / 60000) + 480) % 1440) + 1440) % 1440 : 0, evening = mins >= 18 * 60 || mins < 5 * 60;
  const lv = P.lv, band = lv >= 1 ? "over" : lv > 0.9 ? "edge" : lv > 0.6 ? "high" : lv > 0.2 ? "mid" : "low";
  return { lv: Math.round(lv * C.grid), dir: (P.trace || []).length ? P.trace[P.trace.length - 1] : 0, band, night: !!P.night && P.night === day && evening, trace: (P.trace || []).slice(), hits: P.hits || 0 };
}

// 收走壹個名字（決定 0133，翊文 11-19）：門檻那晚過去（casPoolDay 隔天日報把 pool.take 標成那壹晚）之後，這位館友壹進來（要有存檔 P）就收。
// 挑誰：玩家自己取過名、最新取的那隻（e.nm、nmSeq 最大）；都沒取過名，就收融合稱號那隻（有 title、還沒被收過、序號 s 最大）。
// 收了：名字清成空白（稱號留著，畫面把名牌顯示成空白）、記 e.tk ＝ { no（館友號碼，加入順序，第壹次收的那刻定，再收還是同壹個）、day、n（被收幾次）、stamp ＝ false（重新取名才變 true）}、pool.take 清掉。
// 不動錢。回傳 { key, pepe, no, mails: [短信, 收據] } 或 null（沒有待收、不是他、沒有存檔、還沒有號碼、或沒有可收的 → 沒有可收的也會清掉待收，下次門檻再來）
export function casPoolTake(house, P, uid, memberNo, day) {
  const C = NUM.casino.poolTake, Q = house && house.pool, left = Q ? (Array.isArray(Q.takeLeft) && Q.takeLeft.length ? Q.takeLeft : [String(Q.uid)]) : [];
  if (!C || !C.on || !Q || !Q.take || !left.includes(String(uid)) || !P || !P.pepes || !Number.isInteger(memberNo) || memberNo < 1) return null;
  const ks = Object.keys(P.pepes), named = ks.filter(k => P.pepes[k] && P.pepes[k].nm);
  let key = null;
  if (named.length) key = named.reduce((m, k) => ((P.pepes[k].nmSeq || 0) >= (P.pepes[m].nmSeq || 0) ? k : m));
  else { const ti = ks.filter(k => P.pepes[k] && P.pepes[k].title && !P.pepes[k].tk); if (ti.length) key = ti.reduce((m, k) => ((P.pepes[k].s || 0) >= (P.pepes[m].s || 0) ? k : m)); }
  const night = Q.take; Q.takeLeft = left.filter(x => x !== String(uid)); if (!Q.takeLeft.length) { Q.take = null; Q.takeLeft = null; } // 決定 0143：兩個人各收壹隻，都收完才清掉待收
  if (!key) { Q.took = { day: night, none: true }; return null; }
  const e = P.pepes[key], pepe = e.nm || e.title, no = e.tk && e.tk.no ? e.tk.no : memberNo;
  e.tk = { no, day: night, n: ((e.tk && e.tk.n) || 0) + 1, stamp: false, was: pepe }; e.nm = ""; e.nmSeq = 0;
  Q.took = { day: night, key, no };
  const pad = String(no).padStart(3, "0"), exp = new Date(Date.parse(day + "T00:00:00Z") + (C.expireDays || 365) * 86400000).toISOString().slice(0, 10);
  const mk = (id, T) => ({ id, mail: { id, from: CAS_TAKE.name, title: T.title, note: T.lines.map(l => casFill(l, { pepe, no: pad })).join("\n"), gift: { insp: 0, mood: 0 }, sent: day, expire: exp, claimed: false } });
  return { key, pepe, no, mails: [mk("tk-" + night, CAS_TAKE.letter), mk("tk-" + night + "-r", CAS_TAKE.receipt)] };
}
