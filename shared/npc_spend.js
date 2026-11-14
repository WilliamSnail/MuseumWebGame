// ================================================================
//  NPC 來館：什麼時候在哪、付門票、在店裡花錢、在展廳留評價（11-14，docs/館內NPC規劃.md；翊文：「NPC 和參觀者可以在伺服器上有隨機時間正在參觀…大廳加一個現在展廳有多少人」）
//  純函式。每天（台灣 05:00 換日）每位 NPC 的行程（shared/npc_trip.js：今天去哪幾處）再各抽「幾點到、待多久」：
//    營業時間 05:00～23:30（分鐘 0～1110，從 05:00 起算），壹位 NPC 的幾站排成壹串不重疊（先後順序、中間空壹下都是亂數）；店待 shopStay（30～120）分鐘、展廳 hallStay（60～180）分鐘。
//    種子含伺服器祕密：玩家算不出誰幾點在哪。「現在誰在哪」只看時間算得出來，不用排程、不用存（npcPresence）。
//  錢和評價在「到了」的那壹刻才發生（惰性結算 casNpcLive：任何壹個碰到莊家文件的交易，把已經到時間、還沒結算的幾站結掉；house.npcLive.done 記哪些做過了，冪等）：
//    壹位 NPC 當天第壹站付壹張門票 ticket（不分紅給玩家：ticketBudgetPct% 預算池、其餘館方帳）；
//    去的每家店花 perDay × shopPct%（餐車、牌桌 → 莊家；委託櫃台、地下收藏庫、手作坊 → 預算池）；
//    到展廳時留壹則評價（house.reviews，最多 20 則；壹位 NPC 壹天最多 reviewDay 則）。
//  都是外面世界的錢（casPoolWorldOut／casHouseWorldOut）；每位 NPC 壹天最多花 perDay × dayPct%（連門票），全館壹天最多 dayCap ×（1 ＋ extPct% × 景氣），
//    順序是「到的先後」；外面世界吃緊不花。record：house.npcLive（今天的進度）、house.npcs（最近壹個完整的壹天，日報寫）。
//  館內股的「昨天不同的人」還是用整天的行程（casInNpcFor），跟「現在誰在場」無關；所以畫面不顯示各家店現在幾個 NPC（會洩漏明天的跳空）。
// ================================================================
import { NUM } from "./config.js";
import { casHouseWorldOut, casPoolWorldOut, casWorldLow } from "./casino_book.js";
import { hashStr, mulberry32 } from "./logic.js";
import { npcStoryLine, npcLikesNow } from "./npc.js";
import { npcTrips } from "./npc_trip.js";

const nsN = v => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
const SHOP = { food: ["house", "npcFood"], bj: ["house", "npcBj"], job: ["budget", "npcJob"], cellar: ["budget", "npcCellar"], craft: ["budget", "npcCraft"] };
const DAY_MIN = 1110; // 05:00～23:30
export const npcDayStartMs = day => Date.parse(day + "T05:00:00+08:00");

// 今天每位 NPC 的每壹站：[{ key, id, name, place, start, end }]（分鐘，從 05:00 起算）。只由「日期、祕密、名單、全館進度」決定
export function npcVisitsToday(day, secret, list, counters) {
  const trip = npcTrips(day, secret, list, counters), out = [];
  for (const id of Object.keys(trip.visits)) {
    const n = list.find(x => x && x.id === id);
    if (!n || n.kind === "trace") continue;
    const rnd = mulberry32(hashStr(`${secret}|${day}|${id}|when`)), places = trip.visits[id].map(p => ({ p, r: rnd() })).sort((a, b) => a.r - b.r).map(x => x.p);
    const SP = NUM.casino.npcSpend, stay = places.map(p => { const r = p === "hall" ? SP.hallStay : SP.shopStay; return r[0] + Math.floor(rnd() * (r[1] - r[0] + 1)); }), gaps = places.map(() => Math.floor(rnd() * 31));
    const total = stay.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0);
    let cur = total < DAY_MIN ? Math.floor(rnd() * (DAY_MIN - total)) : 0;
    places.forEach((p, i) => { cur += gaps[i]; out.push({ key: id + "|" + p, id, name: n.name, place: p, start: cur, end: Math.min(DAY_MIN, cur + stay[i]) }); cur += stay[i]; });
  }
  return out.sort((a, b) => a.start - b.start || (a.key < b.key ? -1 : 1));
}
// 不具名的散客（翊文 11-14）：「三位學生」「壹對情侶」「帶小孩的家庭」「旅行團」…，每天的組數、類型、幾點到、待多久都由種子決定；只在展廳。
const CROWD_KINDS = [{ label: "三位學生", n: [3, 3] }, { label: "壹對情侶", n: [2, 2] }, { label: "帶小孩的家庭", n: [3, 4] }, { label: "旅行團", n: [8, 15] }, { label: "兩位朋友", n: [2, 2] }, { label: "獨自看展的人", n: [1, 1] }, { label: "退休的長輩們", n: [4, 6] }];
export function crowdVisitsToday(day, secret) {
  const C = NUM.casino.npcSpend.crowd, out = [];
  if (!C || !(C.groupsDay > 0)) return out;
  const wd = new Date(day + "T00:00:00Z").getUTCDay(), rnd = mulberry32(hashStr(`${secret}|${day}|crowd`));
  const g = Math.max(0, Math.round(C.groupsDay * (wd === 0 || wd === 6 ? C.weekendMult : 1) * (0.8 + 0.4 * rnd()))), W = C.weights, tot = W.reduce((a, b) => a + b, 0);
  for (let i = 0; i < g; i++) {
    let r = rnd() * tot, h = 0; for (; h < W.length - 1; h++) { r -= W[h]; if (r < 0) break; }
    const k = CROWD_KINDS[Math.floor(rnd() * CROWD_KINDS.length)], n = k.n[0] + Math.floor(rnd() * (k.n[1] - k.n[0] + 1)), stay = C.stay[0] + Math.floor(rnd() * (C.stay[1] - C.stay[0] + 1));
    const start = Math.max(0, Math.min(DAY_MIN - stay, h * 60 + Math.floor(rnd() * 60)));
    out.push({ key: "crowd|" + i, label: k.label, n, start, end: start + stay });
  }
  return out.sort((a, b) => a.start - b.start || (a.key < b.key ? -1 : 1));
}
// 現在（nowMs）誰在哪。只給「展廳」的人數和名字（各家店現在有幾個 NPC 不給：那就是今天的人數，會洩漏明天的跳空）。day 是遊戲日
export function npcPresence(day, nowMs, secret, list, counters) {
  const m = (nowMs - npcDayStartMs(day)) / 60000, v = npcVisitsToday(day, secret, list, counters).filter(x => x.start <= m && m < x.end);
  const hall = v.filter(x => x.place === "hall");
  const cg = crowdVisitsToday(day, secret).filter(x => x.start <= m && m < x.end), cn = cg.reduce((a, x) => a + x.n, 0);
  return { hall: hall.length, names: hall.map(x => x.name), around: new Set(v.map(x => x.id)).size, crowd: { n: cn, groups: cg.map(x => ({ label: x.label, n: x.n })) } };
}

function npcLiveFix(house, day) {
  const L = house.npcLive;
  if (!L || typeof L !== "object" || L.day !== day) house.npcLive = { day, done: {}, by: {}, ticket: 0, shop: 0, people: 0, byNpc: {}, sources: {} };
  const x = house.npcLive; if (!x.done || typeof x.done !== "object") x.done = {}; if (!x.byNpc || typeof x.byNpc !== "object") x.byNpc = {}; if (!x.by || typeof x.by !== "object") x.by = {};
  return x;
}
// 完整歷史（11-14，翊文：「圖書館留個位置放所有他們的歷史留言」）：npcReviews/{日期} 每天壹份 { day, items: [...] }，照時間排，以 id 去重（冪等）。
// 取走這次新寫的評價（伺服器把它們合進 npcReviews；取走之後不會存進莊家文件）
export function casNpcTakeReviews(house) { const a = Array.isArray(house.reviewsOut) ? house.reviewsOut : []; delete house.reviewsOut; return a; }
const rvItem = r => ({ id: String(r.id || r.npc + "|" + r.at).slice(0, 80), at: nsN(r.at), day: String(r.day || ""), npc: String(r.npc || "").slice(0, 40), who: String(r.who || "").slice(0, 20), text: String(r.text || "").slice(0, 80), stars: Math.max(1, Math.min(5, nsN(r.stars) || 3)) });
// 把新的評價合進這壹天的文件內容（old 可以是 null）。回傳 { day, items }（items 照 at 排、id 不重複）
export function casReviewsMerge(old, add, day) {
  const seen = new Set(), items = [];
  for (const r of [].concat(old && Array.isArray(old.items) ? old.items : [], Array.isArray(add) ? add : [])) { if (!r || typeof r !== "object") continue; const x = rvItem(r); if (!x.who || !x.text || seen.has(x.id)) continue; seen.add(x.id); items.push(x); }
  items.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  return { day, items };
}
// 給「旅客留言簿」：從壹天的 items 挑（who 可以是名字或 id）、新的在前、最多 limit 則（預設 50，最多 50）。回傳 { items, total }
export function casReviewsPick(items, who, limit) {
  const list = (Array.isArray(items) ? items : []).filter(r => !who || r.who === who || r.npc === who).slice().sort((a, b) => b.at - a.at), lim = Math.max(1, Math.min(50, nsN(limit) || 50));
  return { items: list.slice(0, lim).map(r => ({ id: r.id, who: r.who, npc: r.npc, text: r.text, stars: r.stars, at: r.at, day: r.day })), total: list.length };
}
export function casReviewsFix(house) {
  if (!Array.isArray(house.reviews)) house.reviews = [];
  house.reviews = house.reviews.filter(r => r && typeof r === "object" && typeof r.who === "string" && typeof r.text === "string").slice(-20).map(r => ({ id: String(r.id || "").slice(0, 80), day: String(r.day || ""), at: nsN(r.at), npc: String(r.npc || ""), who: r.who.slice(0, 20), text: r.text.slice(0, 80), stars: Math.max(1, Math.min(5, nsN(r.stars) || 3)) }));
  return house.reviews;
}

// 把 day 這壹天「已經到的」幾站結掉（nowMs 到的）。nowMs ＝ Infinity ＝ 整天都結，並把這壹天收進 house.npcs。冪等。回傳 house.npcLive
export function casNpcLive(house, day, nowMs, secret, list, counters) {
  const C = NUM.casino.npcSpend, W = NUM.casino.world;
  if (!C || !C.on) return null;
  if (!Array.isArray(list)) list = [];
  const old = house.npcLive;
  if (old && typeof old === "object" && old.day && old.day !== day) { // 另壹天的：把它的剩下的結完收起來（過了很多天沒人來：只收最後壹個，中間的日子 casInRoll 壹天壹天補）
    if (old.day < day) casNpcLive(house, old.day, Infinity, secret, list, counters);
    house.npcLive = null;
  }
  const L = npcLiveFix(house, day), m = nowMs === Infinity ? Infinity : (nowMs - npcDayStartMs(day)) / 60000;
  const low = casWorldLow(house, W), reviews = casReviewsFix(house);
  let room = Math.floor(C.dayCap * Math.max(0, 1 + C.extPct / 100 * (+(house.econ && house.econ.b) || 0))) - nsN(L.ticket) - nsN(L.shop);
  // 散客：到了就付壹張門票（每位 crowd.ticket，外面世界付），不留評價、不花錢、不算館內股人數
  const CR = NUM.casino.npcSpend.crowd;
  if (!L.crowd || typeof L.crowd !== "object") L.crowd = { ticket: 0, people: 0, groups: 0 };
  if (CR && !low) for (const gv of crowdVisitsToday(day, secret)) {
    if (gv.start > m || L.done[gv.key]) continue;
    L.done[gv.key] = 1;
    const amt = Math.min(gv.n * CR.ticket, Math.max(0, CR.dayCap - nsN(L.crowd.ticket))); if (amt <= 0) continue;
    const b = Math.floor(amt * C.ticketBudgetPct / 100), got = casPoolWorldOut(house, "budget", "npcCrowdBudget", b) + casPoolWorldOut(house, "museum", "npcCrowdMuseum", amt - b);
    L.crowd.ticket += got; L.crowd.people += gv.n; L.crowd.groups++; L.sources.npcCrowdBudget = nsN(L.sources.npcCrowdBudget) + Math.min(got, b); L.sources.npcCrowdMuseum = nsN(L.sources.npcCrowdMuseum) + Math.max(0, got - b);
  }
  for (const v of npcVisitsToday(day, secret, list, counters)) {
    if (v.start > m || L.done[v.key]) continue;
    L.done[v.key] = 1;
    const n = list.find(x => x && x.id === v.id);
    if (!n || !n.budget || !(n.budget.perDay > 0)) continue;
    const first = L.byNpc[v.id] == null;
    let mine = Math.min(room, Math.floor(n.budget.perDay * C.dayPct / 100) - nsN(L.byNpc[v.id])), paid = 0;
    const pay = (src, pool, amt) => {
      amt = Math.min(amt, mine);
      if (amt <= 0 || low) return 0;
      const got = pool === "house" ? casHouseWorldOut(house, src, amt, W) : casPoolWorldOut(house, pool, src, amt);
      mine -= got; paid += got; L.sources[src] = nsN(L.sources[src]) + got; return got;
    };
    if (first) { const tk = C.ticket, b = Math.floor(tk * C.ticketBudgetPct / 100); L.ticket += pay("npcTicketBudget", "budget", b) + pay("npcTicketMuseum", "museum", tk - b); }
    if (SHOP[v.place]) L.shop += pay(SHOP[v.place][1], SHOP[v.place][0], Math.floor(n.budget.perDay * C.shopPct / 100));
    room -= paid; L.byNpc[v.id] = nsN(L.byNpc[v.id]) + paid; if (first) L.people++;
    if (v.place === "hall" && C.reviewDay > 0 && reviews.filter(r => r.npc === v.id && r.day === day).length < C.reviewDay) { // 到展廳：留壹則評價（故事線現在這壹段的字；還沒有就說他是誰）
      const rr = mulberry32(hashStr(`${secret}|${day}|${v.id}|${v.key}|review`)), line = npcStoryLine(v.id, day, counters, list);
      if (line) reviews.push({ id: v.id + "|" + (npcDayStartMs(day) + v.start * 60000), day, at: npcDayStartMs(day) + v.start * 60000, npc: v.id, who: n.name, text: line.text.slice(0, 80), stars: Math.min(5, 3 + (npcLikesNow(n, day, counters).includes("hall") ? 1 : 0) + (rr() < 0.4 ? 1 : 0)) });
      house.reviews = reviews.slice(-C.reviewKeep);
      if (!Array.isArray(house.reviewsOut)) house.reviewsOut = []; // 這次新寫的（伺服器寫進完整歷史 npcReviews/{日期} 後取走；不存在莊家文件裡）
      house.reviewsOut.push(house.reviews[house.reviews.length - 1]);
    }
  }
  if (nowMs === Infinity) house.npcs = { day, ticket: nsN(L.ticket), shop: nsN(L.shop), total: nsN(L.ticket) + nsN(L.shop), people: nsN(L.people), crowd: { ticket: nsN(L.crowd.ticket), people: nsN(L.crowd.people), groups: nsN(L.crowd.groups) }, by: Object.assign({}, L.sources) };
  return L;
}

// 舊名字（換日時算「這壹天」整天的）：整天結完、收進 house.npcs，回傳 house.npcs。同壹天再叫只回同壹份
export function casNpcSpend(house, d, secret, list, counters) {
  const C = NUM.casino.npcSpend;
  if (!C || !C.on) return null;
  if (house.npcs && house.npcs.day === d) return house.npcs;
  casNpcLive(house, d, Infinity, secret, list, counters);
  return house.npcs && house.npcs.day === d ? house.npcs : null;
}
