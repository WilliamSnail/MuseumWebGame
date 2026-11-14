// ================================================================
//  NPC 來館花錢（11-14，docs/館內NPC規劃.md；翊文：「NPC 每天來館時也付門票、在店裡花錢」）
//  純函式。每個遊戲日 d 結束後（換日時，跟 NPC 人數同壹次）算壹次：d 那天有來館的 NPC（去了任何壹家店、或抽中去展廳；劇情角色跳過）
//    1 付壹張門票 ticket（不屬於哪位玩家的展廳，所以不分紅給玩家：預算池 ticketBudgetPct%、其餘進館方帳），
//    2 去的每家店花 perDay × shopPct%（餐車、牌桌 → 莊家；委託櫃台、地下收藏庫、手作坊 → 預算池），
//  都是外面世界的錢（搬進來，不憑空）：casPoolWorldOut／casHouseWorldOut，來源 npcTicket／npcFood／npcBj／npcJob／npcCellar／npcCraft。
//  每位 NPC 壹天最多花 perDay × dayPct%（連門票），全館壹天最多 dayCap ×（1 ＋ extPct% × 景氣）；順序用種子洗牌（不偏袒 id 前面的）；外面世界吃緊時不花。
//  記在 house.npcs = { day, ticket, shop, total, people, by { 來源: 金額 } }（最近壹天，日報寫；house.led.world 有每個來源的累計）。
// ================================================================
import { NUM } from "./config.js";
import { casHouseWorldOut, casPoolWorldOut, casWorldLow } from "./casino_book.js";
import { hashStr, mulberry32 } from "./logic.js";
import { npcTrips } from "./npc_trip.js";

const nsN = v => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
const SHOP = { food: ["house", "npcFood"], bj: ["house", "npcBj"], job: ["budget", "npcJob"], cellar: ["budget", "npcCellar"], craft: ["budget", "npcCraft"] };

// 算 d 那天 NPC 花的錢並搬。list：NPC 名單；counters：全館進度；回傳 house.npcs
export function casNpcSpend(house, d, secret, list, counters) {
  const C = NUM.casino.npcSpend, W = NUM.casino.world;
  if (!C || !C.on || !Array.isArray(list) || !list.length) return null;
  if (house.npcs && house.npcs.day === d) return house.npcs;
  const out = { day: d, ticket: 0, shop: 0, total: 0, people: 0, by: {} };
  const trip = npcTrips(d, secret, list, counters), rnd = mulberry32(hashStr(`${secret}|${d}|npcspend`));
  const present = Object.keys(trip.visits).filter(id => trip.visits[id].length);
  const order = present.map(id => ({ id, r: rnd() })).sort((a, b) => a.r - b.r).map(x => x.id);
  let room = Math.floor(C.dayCap * Math.max(0, 1 + C.extPct / 100 * (+(house.econ && house.econ.b) || 0)));
  if (!casWorldLow(house, W)) {
    for (const id of order) {
      const n = list.find(x => x && x.id === id);
      if (!n || n.kind === "trace" || !n.budget || !(n.budget.perDay > 0)) continue;
      let mine = Math.min(room, Math.floor(n.budget.perDay * C.dayPct / 100)), paid = 0;
      const pay = (src, pool, amt) => {
        amt = Math.min(amt, mine);
        if (amt <= 0) return 0;
        const got = pool === "house" ? casHouseWorldOut(house, src, amt, W) : pool === "museum" ? casPoolWorldOut(house, "museum", src, amt) : casPoolWorldOut(house, "budget", src, amt);
        mine -= got; paid += got; out.by[src] = nsN(out.by[src]) + got; return got;
      };
      const tk = Math.min(C.ticket, mine);
      if (tk > 0) { const b = Math.floor(tk * C.ticketBudgetPct / 100); out.ticket += pay("npcTicketBudget", "budget", b) + pay("npcTicketMuseum", "museum", tk - b); }
      const per = Math.floor(n.budget.perDay * C.shopPct / 100);
      for (const s of trip.visits[id]) if (SHOP[s]) out.shop += pay(SHOP[s][1], SHOP[s][0], per);
      room -= paid; if (paid > 0) out.people++;
      if (room <= 0) break;
    }
  }
  out.total = out.ticket + out.shop;
  house.npcs = out;
  return out;
}
