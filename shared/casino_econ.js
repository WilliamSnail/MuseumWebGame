// ================================================================
//  拚經濟（舊 Discord 21 點的玩法，決定 0052）
//  全館共用的莊家（大家共用的那份錢）跟著拚：成功了莊家賺，失敗了莊家的預算石沉大海。
//  舊的數字照搬：亂數 r 是 0～100 的整數；r > 30 成功，莊家 +r×30000（約 93 萬～300 萬）、約 8% 多一張大禮包券（要先開過今天的大禮包）；
//  否則失敗，莊家 -r×10000，約 55% 按的人撈到同額的籌碼（油水，這份是從莊家虧掉的那份流給他，所以兩邊加起來守恆）。
//  新的：一人一天最多 perDay 次（舊的沒有上限）；一天用台灣 05:00 換日。
//  莊家是負的（破產中）時拚回正：回 rescued，畫面說「把莊家拚回來了」。莊家的 houseReopen（換日還是負的，Yuga 借錢重開）不用改：拚回正之後就不會被借。
//  文字界線（決定 0048）：沒有真人名字、綽號、頭銜、政黨；失敗和撈油水的句子不接任何政策名字。
//  純函式：亂數用參數 rnd（預設 RNG，測試可以換）；「今天」從參數來。不碰網路和 DOM。
//  錢包欄位 ec：{ day, n 今天拚幾次, wins 累計成功, fails 累計失敗, loot 累計撈到的油水, rescues 累計把莊家拚回正 }；舊錢包沒有，這裡補。
// ================================================================
import { NUM } from "./config.js";
import { CAS_ECON } from "./casino_text.js";
import { casFill, casNum } from "./casino.js";
import { RNG } from "./logic.js";

const ecBox = v => !!v && typeof v === "object" && !Array.isArray(v);
const ecNum = (v, d = 0) => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : d);
// 補欄位、換日歸零（壞資料也不丟錯）
export function casEconFix(w, day) {
  if (!ecBox(w.ec)) w.ec = { day, n: 0, wins: 0, fails: 0, loot: 0, rescues: 0 };
  const e = w.ec;
  if (e.day !== day) { e.day = day; e.n = 0; }
  for (const k of ["n", "wins", "fails", "loot", "rescues"]) e[k] = ecNum(e[k]);
  return e;
}
export const casEconLeft = (w, day) => Math.max(0, NUM.casino.econ.perDay - casEconFix(w, day).n);
// 畫面要的
export const casEconView = (w, day) => ({ left: casEconLeft(w, day), perDay: NUM.casino.econ.perDay });
// 一次的結果（只算數字和文字，不改錢包）：r 是 0～rMax 的整數
export function casEconRoll(rnd = RNG) {
  const C = NUM.casino.econ;
  const r = Math.min(C.rMax, Math.max(0, Math.floor(rnd() * (C.rMax + 1))));
  if (r > C.winAbove) {
    const policy = Math.min(CAS_ECON.policies.length - 1, Math.floor(rnd() * CAS_ECON.policies.length));
    const ticketRoll = rnd() * 100 < C.ticketPct;
    return { win: true, r, amount: r * C.winPer, policy, ticketRoll };
  }
  const lootRoll = rnd() * 100 < C.lootPct;
  return { win: false, r, amount: r * C.losePer, loot: lootRoll && r > 0 };
}
// 按一次「拚經濟」。回傳 { ok:false, reason }（什麼都沒改），或
// { ok:true, win, r, amount, policy（政策的號碼，失敗是 null）, loot（撈到的籌碼）, ticket（多一張券）, rescued, left, lines, houseBefore, houseAfter }
export function casEconPlay(w, house, day, rnd = RNG) {
  const C = NUM.casino.econ;
  if (!C || typeof rnd !== "function") return { ok: false, reason: "沒有這個設定" };
  const e = casEconFix(w, day);
  if (e.n >= C.perDay) return { ok: false, reason: CAS_ECON.none };
  const before = house.bankroll, x = casEconRoll(rnd);
  e.n++;
  const out = { ok: true, win: x.win, r: x.r, amount: x.amount, policy: null, loot: 0, ticket: false, rescued: false, houseBefore: before };
  const lines = CAS_ECON.cheer.slice();
  if (x.win) {
    house.bankroll += x.amount;
    e.wins++;
    out.policy = x.policy;
    lines.push(casFill(CAS_ECON.okLine, { policy: CAS_ECON.policies[x.policy] }), casFill(CAS_ECON.okHouse, { n: casNum(x.amount) }));
    if (x.ticketRoll && w.pk && w.pk.opened > 0) { w.tickets += 1; out.ticket = true; lines.push(CAS_ECON.okTicket); } // 舊的：要先開過今天的大禮包
    if (before < 0 && house.bankroll >= 0) { out.rescued = true; e.rescues++; lines.push(CAS_ECON.okRescue, CAS_ECON.okRescueSub); }
  } else {
    house.bankroll -= x.amount;
    e.fails++;
    lines.push(CAS_ECON.failBudget, CAS_ECON.failBudget, CAS_ECON.failBudget);
    lines.push(x.amount > 0 ? casFill(CAS_ECON.failSink, { n: casNum(x.amount) }) : CAS_ECON.failNone);
    if (x.loot) { // 同額，從莊家虧掉的那份流出來：莊家已經少了 amount，錢包多 amount
      out.loot = x.amount; w.chips += x.amount; e.loot += x.amount;
      if (w.st) w.st.chipsMax = Math.max(ecNum(w.st.chipsMax), w.chips);
      lines.push(casFill(CAS_ECON.failLoot, { n: casNum(x.amount) }));
    }
    lines.push(CAS_ECON.failEnd);
  }
  out.houseAfter = house.bankroll;
  out.left = Math.max(0, C.perDay - e.n);
  out.lines = lines;
  return out;
}
