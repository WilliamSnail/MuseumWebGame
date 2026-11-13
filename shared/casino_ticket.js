// ================================================================
//  參觀者門票（11-13，數值平衡；docs/經濟體系規劃.md 玩法 11、2.6 節；翊文 11-13 決定）
//  展廳的參觀者（NPC，瀏覽器裡每 150 秒來一位，shared/logic.js visitorArrive）進門付門票。門票是館外的錢（NPC 帶進來的），三份：
//    展廳主分紅 ownerPct%（進錢包）、預算池 budgetPct%、館方帳（house.museum）其餘。館方帳專門給修繕、捐款對口、預算公投用（還沒做）。
//  伺服器認領：瀏覽器只管來了幾位（P.hallVisitors 累計），錢怎麼算都在這裡——展廳評分用存檔算，不信瀏覽器報的數字；
//  每人每天最多 perDay 位付門票；第一次認領只記起點，不補發以前的。自由模式（沒有挑戰存檔）不付。
//  錢是憑空來的，記在帳上：錢包 mint.ticket、預算池／館方帳 house.led.mint.ticketBudget／ticketMuseum（shared/casino_book.js）。
// ================================================================
import { NUM } from "./config.js";
import { hallScore, isFree } from "./logic.js";
import { casLedFix, casMint, casPoolMint } from "./casino_book.js";

const tkNz = n => (Number.isFinite(+n) ? Math.floor(+n) : 0);
// 一位參觀者的票價
export const casTicketPrice = score => Math.max(0, tkNz(score)) * NUM.casino.ticket.perScore;
// 今天還能收幾位
export function casTicketLeft(w, day) {
  const t = w.tix;
  return Math.max(0, NUM.casino.ticket.perDay - (t && t.day === day ? tkNz(t.n) : 0));
}
// 認領。P：挑戰存檔的參觀者（hallVisitors 是累計來了幾位）。回傳 { ok, n（付門票的有幾位）, price, total, owner, budget, museum }
export function casTicketClaim(w, house, P, day) {
  const C = NUM.casino.ticket;
  if (!P || isFree(P)) return { ok: false, reason: "要用挑戰模式的參觀者進館" };
  if (!w.tix || typeof w.tix !== "object") w.tix = { day: null, n: 0, seen: null };
  const t = w.tix, visitors = Math.max(0, tkNz(P.hallVisitors));
  if (t.day !== day) { t.day = day; t.n = 0; }
  if (!Number.isFinite(t.seen) || t.seen > visitors) { t.seen = visitors; return { ok: true, n: 0, price: 0, total: 0, owner: 0, budget: 0, museum: 0, first: true }; } // 第一次（或存檔重來）：只記起點
  const fresh = visitors - t.seen;
  t.seen = visitors; // 沒收到的超過上限的，不留到明天
  const n = Math.min(fresh, casTicketLeft(w, day));
  const price = casTicketPrice(hallScore(P).score), total = n * price;
  if (!(total > 0)) return { ok: true, n: 0, price, total: 0, owner: 0, budget: 0, museum: 0 };
  t.n += n;
  const owner = Math.floor(total * C.ownerPct / 100), budget = Math.floor(total * C.budgetPct / 100), museum = total - owner - budget;
  casMint(w, "ticket", owner);
  casPoolMint(house, "budget", "ticketBudget", budget);
  casPoolMint(house, "museum", "ticketMuseum", museum);
  casLedFix(w, ["mint", "burn"]);
  return { ok: true, n, price, total, owner, budget, museum };
}
