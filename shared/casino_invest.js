// ================================================================
//  館方投資外面世界（11-14，規劃 2.8f 第五節、決定 0074；翊文：「館方自己也會投資外面世界」）
//  純函式，不碰資料庫。每個遊戲日第一次有人進賭場時（在換日調價之後）跑一次：casInvestRun(house, day, secret, b)。
//  兩個池子各自投，記帳來源分開：
//    莊家（house）：bankroll 超過準備金（reserve）的部分。預算池（budget）：超過 budgetKeep 的部分（≤ budgetKeep 時不投，它在補拚經濟）。
//  錢怎麼動（規劃 2.12，不憑空也不燒掉）：買＝池子的錢搬給外面世界（casHouseWorldIn／casPoolWorldIn），賣＝外面世界付回池子（受 casWorldRoom 的吃緊上限）；
//    手續費 NUM.casino.stock.feePct 進預算池（莊家付的搬進預算池；預算池付給自己＝不用搬）。持股不算進全館的錢（跟玩家的股票一樣，是資產不是籌碼）。
//  怎麼選股：每天投「超過部分 × dailyPct% ×（1 ＋ extPct% × 外部景氣）」，七成買最近 lookback 天漲最多的 topN 支、兩成平均買全部、一成隨機一支（種子有伺服器祕密）；
//    持股成本合計 ≤ 超過部分的 holdCapPct%。比成本跌 stopLossPct% 賣一半、漲 takeProfitPct% 賣三分之一（先賣再買）。
//    停損：持股的總賺賠（已實現 ＋ 帳面）虧超過池子（持股成本 ＋ 超過部分）的 stopPct%，暫停買進 stopDays 天。外面世界吃緊（casWorldLow）也暫停買進。
//  玩家看得到什麼：日報寫「昨天」館方買賣了什麼、現在持有什麼、累計賺賠（house.inv.last，延遲壹天公開，不即時）。
//  存哪：house.inv = { day, pool: { house|budget: { own {id: 股}, cost {id: 成本}, pnl 已實現累計, stopUntil } }, cur 今天的買賣, last 昨天的買賣 }
// ================================================================
import { NUM } from "./config.js";
import { casHouseMove, casHouseWorldIn, casHouseWorldOut, casPoolWorldIn, casPoolWorldOut, casWorldLow, casWorldRoom } from "./casino_book.js";
import { hashStr, mulberry32 } from "./logic.js";
import { OUT_STOCKS } from "./stocks_text.js";

const ivBox = o => !!o && typeof o === "object" && !Array.isArray(o);
const ivN = v => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
const ivDay = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const ivAdd = (s, n) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) + n * 86400000).toISOString().slice(0, 10);
const IV_IDS = OUT_STOCKS.map(s => s.id);
export const IV_POOLS = ["house", "budget"];

// 補欄位
export function casInvestFix(house) {
  if (!ivBox(house.inv)) house.inv = { day: null, pool: {}, cur: null, last: null };
  const I = house.inv;
  I.day = ivDay(I.day) ? I.day : null;
  if (!ivBox(I.pool)) I.pool = {};
  for (const k of IV_POOLS) {
    if (!ivBox(I.pool[k])) I.pool[k] = { own: {}, cost: {}, pnl: 0, stopUntil: null };
    const P = I.pool[k];
    if (!ivBox(P.own)) P.own = {}; if (!ivBox(P.cost)) P.cost = {};
    for (const id of Object.keys(P.own)) { const n = ivN(P.own[id]); if (n > 0 && IV_IDS.includes(id)) P.own[id] = n; else { delete P.own[id]; delete P.cost[id]; } }
    for (const id of Object.keys(P.cost)) if (!(P.own[id] > 0)) delete P.cost[id]; else P.cost[id] = ivN(P.cost[id]);
    P.pnl = Number.isFinite(+P.pnl) ? Math.floor(+P.pnl) : 0;
    P.stopUntil = ivDay(P.stopUntil) ? P.stopUntil : null;
  }
  const x = I.cur;
  I.cur = ivBox(x) && ivDay(x.day) ? { day: x.day, buy: ivBox(x.buy) ? x.buy : {}, sell: ivBox(x.sell) ? x.sell : {}, paused: ivBox(x.paused) ? x.paused : {} } : null;
  const y = I.last; // 昨天的（給日報，已經換成有名字的清單）
  I.last = ivBox(y) && ivDay(y.day) ? { day: y.day, buy: Array.isArray(y.buy) ? y.buy : [], sell: Array.isArray(y.sell) ? y.sell : [], paused: ivBox(y.paused) ? y.paused : {} } : null;
  if (!ivBox(I.sum)) I.sum = { hold: [], pnl: 0 };
  return I;
}

const ivName = id => (OUT_STOCKS.find(s => s.id === id) || { name: id }).name;
const ivList = rec => Object.entries(rec || {}).map(([k, n]) => { const [pool, id] = k.split(":"); return { pool, id, name: ivName(id), n }; });
const ivAvail = (house, pool) => (pool === "house" ? Math.max(0, ivN(house.bankroll) - NUM.casino.invest.reserve) : Math.max(0, ivN(house.budget) - NUM.casino.invest.budgetKeep));
const ivFee = n => Math.ceil(n * NUM.casino.stock.feePct / 100);
const ivCostSum = P => Object.values(P.cost).reduce((s, x) => s + ivN(x), 0);
// 持股現值（用現在的價）
const ivValue = (P, px) => Object.keys(P.own).reduce((s, id) => s + P.own[id] * (px[id] || 0), 0);

// 賣 n 股（先檢查外面世界今天付得出）。回傳實際賣的股數
function ivSell(house, pool, P, id, n, px, cfg) {
  n = Math.min(n, P.own[id]);
  if (n <= 0 || !(px > 0)) return 0;
  const room = casWorldRoom(house, cfg.world);
  n = Math.min(n, Math.floor(room / px));
  if (n <= 0) return 0;
  const gross = n * px, fee = ivFee(gross), costOut = n >= P.own[id] ? P.cost[id] : Math.floor(P.cost[id] * n / P.own[id]);
  if (pool === "house") { casHouseWorldOut(house, "houseInvestSell", gross, cfg.world); casHouseMove(house, "investFee", -fee); house.budget += fee; }
  else { casPoolWorldOut(house, "budget", "budgetInvestSell", gross); } // 預算池付給自己：手續費不用搬
  P.own[id] -= n; P.cost[id] = Math.max(0, P.cost[id] - costOut);
  if (P.own[id] <= 0) { delete P.own[id]; delete P.cost[id]; }
  P.pnl += gross - (pool === "house" ? fee : 0) - costOut;
  return n;
}

// 前 lookback 天的漲幅（H.hist：{ 日期: { id: 當天開盤價 } }）
function ivRet(H, day, id, px) {
  const C = NUM.casino.invest, ds = Object.keys(H.hist || {}).filter(d => d < day && H.hist[d][id] > 0).sort().slice(-C.lookback);
  const base = ds.length ? H.hist[ds[0]][id] : 0;
  return base > 0 ? px / base - 1 : 0;
}

// 今天跑一次。stkH：casStockHouseFix(house) 的結果（H.px、H.hist）。b：外部景氣（−1～1）。回傳 { ran, lines }（lines 是給日誌看的，不給玩家）
export function casInvestRun(house, stkH, day, secret, b) {
  const C = NUM.casino.invest;
  if (!C.on || !ivDay(day)) return { ran: false };
  const I = casInvestFix(house);
  if (I.day === day) return { ran: false };
  I.day = day;
  if (I.cur && I.cur.day < day) I.last = { day: I.cur.day, buy: ivList(I.cur.buy), sell: ivList(I.cur.sell), paused: I.cur.paused }; // 昨天的收進 last（日報寫昨天的，延遲壹天）
  I.cur = { day, buy: {}, sell: {}, paused: {} };
  const px = stkH.px, cfg = NUM.casino;
  for (const pool of IV_POOLS) {
    const P = I.pool[pool], avail = ivAvail(house, pool);
    // 1 先賣：跌過停損、漲過停利
    for (const id of Object.keys(P.own)) {
      const avg = P.cost[id] / P.own[id], r = avg > 0 ? px[id] / avg - 1 : 0;
      let part = 0;
      if (r <= -C.stopLossPct / 100) part = Math.ceil(P.own[id] / 2);
      else if (r >= C.takeProfitPct / 100) part = Math.ceil(P.own[id] / 3);
      if (part > 0) { const n = ivSell(house, pool, P, id, part, px[id], cfg); if (n > 0) I.cur.sell[`${pool}:${id}`] = n; }
    }
    // 2 停損：持股總賺賠（已實現累計 ＋ 帳面）虧超過池子的 stopPct%，暫停買進
    const base = ivCostSum(P) + avail, total = P.pnl + ivValue(P, px) - ivCostSum(P);
    if (base > 0 && total < -Math.floor(base * C.stopPct / 100) && !(P.stopUntil && P.stopUntil > day)) P.stopUntil = ivAdd(day, C.stopDays);
    // 3 再買
    if (P.stopUntil && P.stopUntil > day) { I.cur.paused[pool] = "stop"; continue; }
    if (casWorldLow(house, cfg.world)) { I.cur.paused[pool] = "world"; continue; }
    const capLeft = Math.floor(avail * C.holdCapPct / 100) - ivCostSum(P);
    const spend = Math.min(avail, capLeft, Math.floor(avail * C.dailyPct * Math.max(0, 1 + C.extPct / 100 * (+b || 0)) / 100));
    if (!(spend > 0)) continue;
    const ranked = IV_IDS.map(id => ({ id, r: ivRet(stkH, day, id, px[id]) })).sort((a, z) => z.r - a.r || (a.id < z.id ? -1 : 1));
    const rnd = mulberry32(hashStr(`${secret}|${day}|${pool}|invest`)), pick = IV_IDS[Math.floor(rnd() * IV_IDS.length)];
    const alloc = {};
    ranked.slice(0, C.topN).forEach(x => { alloc[x.id] = (alloc[x.id] || 0) + spend * C.topPct / 100 / C.topN; });
    IV_IDS.forEach(id => { alloc[id] = (alloc[id] || 0) + spend * C.evenPct / 100 / IV_IDS.length; });
    alloc[pick] = (alloc[pick] || 0) + spend * C.randPct / 100;
    let left = spend;
    for (const id of Object.keys(alloc)) {
      if (!(px[id] > 0)) continue;
      const n = Math.floor(Math.min(left, alloc[id]) / (px[id] * (1 + cfg.stock.feePct / 100)));
      if (n <= 0) continue;
      const cost = n * px[id], fee = ivFee(cost);
      if (cost + fee > left) continue;
      if (pool === "house") { casHouseWorldIn(house, "houseInvestBuy", cost); casHouseMove(house, "investFee", -fee); house.budget += fee; }
      else casPoolWorldIn(house, "budget", "budgetInvestBuy", cost);
      P.own[id] = (P.own[id] || 0) + n; P.cost[id] = (P.cost[id] || 0) + cost + (pool === "house" ? fee : 0);
      I.cur.buy[`${pool}:${id}`] = n;
      left -= cost + (pool === "house" ? fee : 0);
    }
  }
  const v = casInvestView(house, px);
  I.sum = { hold: v ? v.hold : [], pnl: v ? v.pnl : 0 };
  return { ran: true };
}

// 給日報的：昨天館方買賣了什麼、現在持有什麼、累計賺賠（延遲壹天；沒有就 null）
export function casInvestView(house, px) {
  if (!ivBox(house.inv)) return null;
  const I = casInvestFix(house), nm = ivName;
  const hold = {};
  let pnl = 0, value = 0, cost = 0;
  for (const k of IV_POOLS) { const P = I.pool[k]; for (const id of Object.keys(P.own)) { hold[id] = (hold[id] || 0) + P.own[id]; value += P.own[id] * ((px && px[id]) || 0); } cost += ivCostSum(P); pnl += P.pnl; }
  if (!Object.keys(hold).length && !I.last && !pnl) return null;
  return { day: I.last ? I.last.day : null, buy: I.last ? I.last.buy : [], sell: I.last ? I.last.sell : [], hold: Object.entries(hold).map(([id, n]) => ({ id, name: nm(id), n })), pnl: pnl + value - cost };
}
