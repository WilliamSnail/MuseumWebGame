// ================================================================
//  館債：玩家借錢給莊家（翊文 11-13：「也可以設計債券來借莊家錢」→「照這樣做」；規劃玩法 3、2.9 節，決定 0073）
//  每週壹期（週壹 05:00 換週），整週都可以買，下週壹換日到期，莊家還本金加利息。
//  利率：這期第壹次有人買時，照莊家當時的錢定下來（莊家越缺錢利率越高），整期不變。莊家破產（< 0）這週不發。
//  利息照持有天數算：週壹買拿滿 7 天，週日買只拿 1 天（不然週日才買的人白拿壹週）。
//  錢怎麼動（守恆）：買＝錢包 → 莊家（casHouseMove "bond"）。到期＝莊家 → 錢包。
//    莊家不夠：先用莊家 > 0 的部分，再由預算池墊（記在 house.bailout，館方是最後的貸款人），
//    還是不夠就給「債權憑證」（w.bond.iou）：莊家回到起始的壹半以上時自動補付。不打折、不印錢。
//  上限：壹期總額 cap（照健康度）、壹個人 perUser、帳號要開了 minAge 天（擋分身）。不能提早贖回、不能轉讓。
//  純函式：「今天」從參數來。錢包 w.bond：{ list: [{ mon, amt, day, pct, due }], iou, earned, born, notes }
//  莊家 house.bond：{ mon, name, pct, cap, sold }（這期）；house.bailout：預算池墊了多少（之後從莊家稅還）
// ================================================================
import { NUM } from "./config.js";
import { casHouseMove } from "./casino_book.js";
import { CAS_BOND } from "./casino_text.js";
import { casFill, casNum } from "./casino.js";

const cbdBox = v => !!v && typeof v === "object" && !Array.isArray(v);
const cbdN = v => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
const cbdDay = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const cbdUTC = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const cbdAdd = (s, n) => new Date(cbdUTC(s) + n * 86400000).toISOString().slice(0, 10);
const cbdDiff = (a, b) => Math.round((cbdUTC(b) - cbdUTC(a)) / 86400000);
// 這天所在那週的週壹（遊戲的日子已經是台灣 05:00 換日）
export const casBondMonday = day => cbdAdd(day, -((new Date(cbdUTC(day)).getUTCDay() + 6) % 7));

export function casBondFix(w, day) {
  if (!cbdBox(w.bond)) w.bond = { list: [], iou: 0, earned: 0, born: null, notes: [] };
  const B = w.bond;
  B.iou = cbdN(B.iou); B.earned = cbdN(B.earned);
  B.list = (Array.isArray(B.list) ? B.list : []).filter(x => cbdBox(x) && cbdN(x.amt) > 0 && cbdDay(x.due) && cbdDay(x.day))
    .map(x => ({ mon: cbdDay(x.mon) ? x.mon : casBondMonday(x.day), amt: cbdN(x.amt), day: x.day, pct: Math.max(0, +x.pct || 0), due: x.due }));
  B.notes = (Array.isArray(B.notes) ? B.notes : []).filter(s => typeof s === "string").slice(-5);
  // 開戶日：第壹次看到這個錢包的那天。上線前就玩過的（打過牌）當成老帳號
  if (!cbdDay(B.born) && cbdDay(day)) B.born = w.st && w.st.hands > 0 ? "2026-01-01" : day;
  return B;
}
// 莊家的健康度 → 這期的利率和總額（NUM.casino.bond.tiers，由好到壞）。破產回 null
export function casBondTier(house) {
  const C = NUM.casino.bond;
  if (!house || house.bankroll < 0) return null;
  const r = house.bankroll / NUM.casino.houseStart * 100;
  return C.tiers.find(t => r >= t.fromPct) || C.tiers[C.tiers.length - 1];
}
// 這週的這期（還沒有就照現在的莊家開壹期；破產就沒有）
export function casBondIssue(house, day) {
  if (!cbdDay(day)) return null;
  const mon = casBondMonday(day);
  if (cbdBox(house.bond) && house.bond.mon === mon) return house.bond;
  const t = casBondTier(house);
  if (!t) return null;
  const names = CAS_BOND.names, i = Math.round(cbdUTC(mon) / 86400000 / 7) % names.length;
  house.bond = { mon, name: names[(i + names.length) % names.length], pct: t.pct, cap: t.cap, sold: 0 };
  return house.bond;
}
const cbdHeldThisWeek = (B, mon) => B.list.filter(x => x.mon === mon).reduce((s, x) => s + x.amt, 0);
// 買這期：從籌碼出，進莊家
export function casBondBuy(w, house, amt, day) {
  const C = NUM.casino.bond, B = casBondFix(w, day);
  if (!cbdDay(day)) return { ok: false, reason: CAS_BOND.bad };
  if (cbdDiff(B.born, day) < C.minAge) return { ok: false, reason: casFill(CAS_BOND.young, { n: C.minAge }) };
  const iss = casBondIssue(house, day);
  if (!iss) return { ok: false, reason: CAS_BOND.none };
  const mine = cbdHeldThisWeek(B, iss.mon), roomMe = C.perUser - mine, roomAll = iss.cap - iss.sold;
  const max = Math.max(0, Math.min(roomMe, roomAll, w.chips));
  let n = amt === "max" ? Math.floor(max / C.unit) * C.unit : Math.floor(Number(String(amt == null ? "" : amt).replace(/[,，\s]/g, "")));
  if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: CAS_BOND.bad };
  if (n % C.unit) return { ok: false, reason: casFill(CAS_BOND.unit, { n: casNum(C.unit) }) };
  if (n > roomAll) return { ok: false, reason: casFill(CAS_BOND.soldOut, { n: casNum(Math.max(0, roomAll)) }) };
  if (n > roomMe) return { ok: false, reason: casFill(CAS_BOND.perUser, { n: casNum(C.perUser) }) };
  if (n > w.chips) return { ok: false, reason: CAS_BOND.poor };
  const due = cbdAdd(iss.mon, 7), days = cbdDiff(day, due), x = { mon: iss.mon, amt: n, day, pct: iss.pct, due };
  w.chips -= n; casHouseMove(house, "bond", n); iss.sold += n; B.list.push(x);
  const int = casBondInt(x);
  return { ok: true, bond: x, lines: [casFill(CAS_BOND.buyOk, { name: iss.name, n: casNum(n), days, due: due.slice(5), int: casNum(int) })] };
}
// 壹張到期時的利息：照持有天數（最多 7 天）
export const casBondInt = x => Math.floor(x.amt * x.pct / 100 * Math.min(7, Math.max(0, cbdDiff(x.day, x.due))) / 7);

// 付給玩家 want：先莊家 > 0 的部分，再預算池 > 0 的部分（記 bailout），剩下的回傳（要記成憑證）
function cbdPay(w, house, want) {
  let left = want;
  const a = Math.min(left, Math.max(0, house.bankroll));
  if (a > 0) { casHouseMove(house, "bond", -a); left -= a; }
  const b = Math.min(left, Math.max(0, Math.floor(house.budget)));
  if (b > 0) { house.budget -= b; house.bailout = cbdN(house.bailout) + b; left -= b; }
  w.chips += want - left;
  return left;
}
// 換日結算（伺服器每個賭場交易碰到莊家時叫）：到期的還本金加利息；有憑證、莊家回到起始壹半以上就補付
export function casBondSettle(w, house, day) {
  const B = casBondFix(w, day), out = { back: [], iou: 0, iouPaid: 0 };
  if (!cbdDay(day)) return out;
  const due = B.list.filter(x => x.due <= day);
  for (const x of due) {
    const int = casBondInt(x), owe = x.amt + int, short = cbdPay(w, house, owe);
    B.earned += int; B.iou += short; out.iou += short;
    out.back.push({ amt: x.amt, int, short });
    B.notes.push(casFill(short ? CAS_BOND.noteShort : CAS_BOND.noteBack, { amt: casNum(x.amt), int: casNum(int), short: casNum(short) }));
  }
  if (due.length) B.list = B.list.filter(x => !due.includes(x));
  if (B.iou > 0 && house.bankroll >= NUM.casino.houseStart * NUM.casino.bond.iouAtPct / 100) {
    const n = Math.min(B.iou, house.bankroll - Math.floor(NUM.casino.houseStart * NUM.casino.bond.iouAtPct / 100));
    if (n > 0) { casHouseMove(house, "bond", -n); w.chips += n; B.iou -= n; out.iouPaid = n; B.notes.push(casFill(CAS_BOND.noteIou, { n: casNum(n), left: casNum(B.iou) })); }
  }
  B.notes = B.notes.slice(-5);
  return out;
}
// 簽收窗口（劇情經濟事件 bondWindow，shared/econ_events.js）：窗口內可以提早拿回館債，本金加「已持有天數」照比例的利息（利率不變，不會比到期多）；
// 莊家壹天最多付 redeemPct% 的（bankroll ＋ 超過準備金的部分）；付不出的留著，不開憑證、不動預算池。回傳 { ok, n 幾張, amt 本金, int 利息 }
export function casBondRedeem(w, house, day) {
  const E = NUM.casino.econEvent, W = house && house.ev && house.ev.window;
  if (!W || !(day >= W.from && day <= W.until)) return { ok: false, reason: "現在不是館債的簽收窗口" };
  const B = casBondFix(w, day), room0 = Math.max(0, Math.floor((house.bankroll - NUM.casino.houseLoan.reserve) * E.redeemPct / 100)), paidToday = house.ev.redeemed && house.ev.redeemed.day === day ? cbdN(house.ev.redeemed.n) : 0;
  let room = Math.max(0, room0 - paidToday), n = 0, amt = 0, int = 0;
  for (const x of B.list.slice()) {
    if (x.due <= day) continue; // 今天到期的換日會自己還
    const span = Math.max(1, cbdDiff(x.day, x.due)), held = Math.max(0, cbdDiff(x.day, day)), i = Math.floor(casBondInt(x) * Math.min(held, span) / span), owe = x.amt + i;
    if (owe > room) continue;
    casHouseMove(house, "bond", -owe); w.chips += owe; room -= owe; B.list = B.list.filter(y => y !== x); B.earned += i; n++; amt += x.amt; int += i;
    B.notes.push(casFill(CAS_BOND.noteBack, { amt: casNum(x.amt), int: casNum(i), short: 0 }));
  }
  if (!house.ev.redeemed || house.ev.redeemed.day !== day) house.ev.redeemed = { day, n: 0 };
  house.ev.redeemed.n += amt + int;
  B.notes = B.notes.slice(-5);
  return n ? { ok: true, n, amt, int } : { ok: false, reason: "沒有可以提早拿回的館債（或莊家今天付不出）" };
}
export function casBondTakeNotes(w) { const B = casBondFix(w, null); const n = B.notes; B.notes = []; return n; }
// 存在館債裡的本金（記帳快照：這是莊家欠玩家的，不是錢；錢在莊家那裡，所以快照不另外加）
export const casBondHeld = w => (cbdBox(w && w.bond) && Array.isArray(w.bond.list) ? w.bond.list.reduce((s, x) => s + cbdN(x && x.amt), 0) : 0);
// 畫面要的。house 給的話，順便看這期（不會開新的期：只讀）
export function casBondView(w, house, day) {
  const C = NUM.casino.bond, B = casBondFix(w, day);
  const mon = cbdDay(day) ? casBondMonday(day) : null;
  const iss = house && cbdBox(house.bond) && house.bond.mon === mon ? house.bond : null;
  const t = iss ? null : casBondTier(house);
  const issue = iss ? { name: iss.name, pct: iss.pct, cap: iss.cap, sold: iss.sold, open: true }
    : t && mon ? { name: CAS_BOND.names[((Math.round(cbdUTC(mon) / 86400000 / 7) % CAS_BOND.names.length) + CAS_BOND.names.length) % CAS_BOND.names.length], pct: t.pct, cap: t.cap, sold: 0, open: true } : { open: false };
  const due = mon ? cbdAdd(mon, 7) : null;
  return {
    issue, due, daysLeft: due && cbdDay(day) ? cbdDiff(day, due) : null, unit: C.unit, perUser: C.perUser,
    mine: mon ? cbdHeldThisWeek(B, mon) : 0, young: cbdDay(B.born) && cbdDay(day) ? Math.max(0, C.minAge - cbdDiff(B.born, day)) : 0,
    list: B.list.map(x => ({ amt: x.amt, pct: x.pct, day: x.day, due: x.due, int: casBondInt(x) })), iou: B.iou, earned: B.earned,
    window: house && house.ev && house.ev.window && cbdDay(day) && day >= house.ev.window.from && day <= house.ev.window.until ? { from: house.ev.window.from, until: house.ev.window.until } : null, // 簽收窗口開著（bank op bondRedeem）
  };
}
