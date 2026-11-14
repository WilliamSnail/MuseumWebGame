// ================================================================
//  展廳參觀者門票（11-13 初版；11-14 改版，決定 0079 取代 0073 的分法，翊文：「靈感照人數算」「門票整合成壹套、票價維持現在」）
//  展廳的人（有名字的 NPC、散客）是伺服器排的（shared/npc_spend.js 的 hallFeed）；每位到訪的人到的那刻自己付壹張票（NPC 2 萬、散客 1 萬／位，外面世界付，
//    30% 預算池、70% 館方帳，shared/npc_spend.js）。玩家不再另外收「評分×perScore」的門票（以前的做法會對同壹個人收兩次）。
//  玩家分紅：到訪的那刻，票的 ownerPct% 放進那壹位的分紅池（house.hallPot）；那壹刻真的在看展廳的線上玩家，領了這個 key（瀏覽器回報看到了哪些 key，伺服器驗證在今天的時刻表裡、已經到了）
//    就從池子拿 firstPct%（先領的拿池子剩下的壹半，再領的拿再剩下的壹半…，總額永遠不超過池子；沒人領的留在預算池）。錢從預算池搬給玩家（搬，不是憑空）。
//  壹個人壹天最多領 perDay 位的分紅（壹組散客算人數，剩下不夠就按比例）。自由模式（沒有挑戰存檔）不領。
// ================================================================
import { NUM } from "./config.js";
import { hallFeed } from "./npc_spend.js";
import { isFree } from "./logic.js";
import { casCount } from "./casino_book.js";

const tkNz = n => (Number.isFinite(+n) ? Math.floor(+n) : 0);
// 今天還能領幾位的分紅
export function casTicketLeft(w, day) {
  const t = w.tix;
  return Math.max(0, NUM.casino.ticket.perDay - (t && t.day === day ? tkNz(t.n) : 0));
}
// 領分紅。keys：瀏覽器說「今天我看到了這些 key」；secret、list、counters：算今天的展廳時刻表用；nowMs 現在。
// 回傳 { ok, n 領到幾位的分紅, total 領到多少錢, keys 這次算數的 key }
export function casTicketClaimKeys(w, house, P, day, keys, secret, list, counters, nowMs) {
  const C = NUM.casino.ticket;
  if (!P || isFree(P)) return { ok: false, reason: "要用挑戰模式的參觀者進館" };
  if (!w.tix || typeof w.tix !== "object") w.tix = { day: null, n: 0, keys: [] };
  const t = w.tix;
  if (t.day !== day) { t.day = day; t.n = 0; t.keys = []; }
  if (!Array.isArray(t.keys)) t.keys = [];
  const pots = house.hallPot && house.hallPot.day === day ? house.hallPot.keys : {};
  const feed = new Map(hallFeed(day, secret, list, counters, 0, nowMs).map(e => [e.key, e]));
  let n = 0, total = 0; const used = [];
  for (const k of (Array.isArray(keys) ? keys : []).slice(0, 80)) {
    if (typeof k !== "string" || t.keys.includes(k) || !feed.has(k) || !pots[k]) continue;
    const left = casTicketLeft(w, day); if (left <= 0) break;
    const e = feed.get(k), p = Math.min(e.n, left), pot = pots[k], take = Math.min(pot.left, Math.floor(pot.left * C.firstPct / 100 * p / Math.max(1, pot.n)));
    t.keys.push(k); t.n += p; n += p; used.push(k);
    if (take > 0 && house.budget >= take) { pot.left -= take; house.budget -= take; w.chips += take; total += take; }
  }
  if (n > 0) casCount(house, "ticketPeople", n);
  if (total > 0) casCount(house, "ticketShare", total);
  return { ok: true, n, total, keys: used };
}
