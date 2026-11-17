// ================================================================
//  館方投資外面世界（11-14，規劃 2.8f 第五節、決定 0074；翊文：「館方自己也會投資外面世界」）
//  純函式，不碰資料庫。每個遊戲日第一次有人進賭場時（在換日調價之後）跑一次：casInvestRun(house, day, secret, b)。
//  兩個池子各自投，記帳來源分開：
//    莊家（house）：bankroll 超過準備金（reserve）的部分。博物館資金（budget）：超過 budgetKeep 的部分（≤ budgetKeep 時不投，它在補拚經濟）。
//  錢怎麼動（規劃 2.12，不憑空也不燒掉）：買＝池子的錢搬給外面世界（casHouseWorldIn／casPoolWorldIn），賣＝外面世界付回池子（受 casWorldRoom 的吃緊上限）；
//    手續費 NUM.casino.stock.feePct 進博物館資金（莊家付的搬進博物館資金；博物館資金付給自己＝不用搬）。持股不算進全館的錢（跟玩家的股票一樣，是資產不是籌碼）。
//  怎麼選股：每天投「超過部分 × dailyPct% ×（1 ＋ extPct% × 外部景氣）」，七成買最近 lookback 天漲最多的 topN 支、兩成平均買全部、一成隨機一支（種子有伺服器祕密）；
//    持股成本合計 ≤ 超過部分的 holdCapPct%。比成本跌 stopLossPct% 賣一半、漲 takeProfitPct% 賣三分之一（先賣再買）。
//    停損：持股的總賺賠（已實現 ＋ 帳面）虧超過池子（持股成本 ＋ 超過部分）的 stopPct%，暫停買進 stopDays 天。外面世界吃緊（casWorldLow）也暫停買進。
//  玩家看得到什麼：日報寫「昨天」館方買賣了什麼、現在持有什麼、累計賺賠（house.inv.last，延遲壹天公開，不即時）。
//  存哪：house.inv = { day, pool: { house|budget: { own {id: 股}, cost {id: 成本}, pnl 已實現累計, stopUntil } }, cur 今天的買賣, last 昨天的買賣 }
// ================================================================
import { NUM } from "./config.js";
import { casHouseMove, casHouseWorldIn, casHouseWorldOut, casPoolWorldIn, casPoolWorldOut, casWorldLow, casWorldRoom } from "./casino_book.js";
import { stBuyCost, stCents, stPx, stSellGet, stValue } from "./casino_stock.js";
import { hashStr, mulberry32 } from "./logic.js";
import { OUT_STOCKS } from "./stocks_text.js";

const ivBox = o => !!o && typeof o === "object" && !Array.isArray(o);
const ivN = v => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
const ivDay = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const ivAdd = (s, n) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) + n * 86400000).toISOString().slice(0, 10);
const IV_IDS = OUT_STOCKS.map(s => s.id);
export const IV_POOLS = ["house", "budget"];

// 補欄位
// 股價換比例（house.stk.peg.ev，shared/casino_stock.js 的 stPegDirect）時，館方的持股也要照比例換股數、成本不變（跟錢包壹樣）。
// 11-17 翊文截圖：館方投資帳面 +57280%、又寫「館方虧太多」。以前只換錢包和全館持股數，這裡的股數沒換：美股 ×4→×32 帳面假漲 8 倍、台股 10,000→真實價帳面假跌，
//   觸發停損暫停買進；11-16 還用沒換過的少量股數照新價賣掉壹些（已實現虧損）。I.pegSeq ＝ 已經換到第幾次。
// 第壹次（I.pegSeq 還沒有）：每支用「平均每股成本」對出是在哪壹次換比例之前買的（成本在那次 from 的 ±15% 內），從那次起往後補換；對不上的不動。
//   lastPx 同樣照它的價對；hx 是換比例之後才記的，不動。停損暫停清掉（是假跌觸發的），下壹次跑重新判斷。
const IV_PEG_TOL = 0.15;
// 11-16 用沒換過的股數照新價賣掉的台股（停損賣壹半）：照當時的成交價算「正確股數該拿到的 − 實際拿到的」（扣手續費後），翊文 11-17：「補回」。
//   只在正式站那份第壹次校正時補（換比例到第 28 次、池子的已實現虧損至少是補的 95%），外面世界付，記 houseInvFix／budgetInvFix
const IV_PEG_REFUND = { house: 869857, budget: 3435843 };
function ivPegSync(I, house) {
  const peg = house && house.stk && ivBox(house.stk.peg) ? house.stk.peg : null, evs = peg && Array.isArray(peg.ev) ? peg.ev.filter(e => ivBox(e) && +e.from > 0 && +e.to > 0 && +e.seq > 0).slice().sort((a, b) => a.seq - b.seq) : [];
  const top = evs.length ? evs[evs.length - 1].seq : 0;
  const scaleN = (n, list) => list.reduce((x, e) => Math.floor(x * e.from / e.to), n);
  if (I.pegSeq == null) {
    const from = (id, unit) => { const L = evs.filter(e => e.id === id); const i = L.findIndex(e => Math.abs(unit / e.from - 1) <= IV_PEG_TOL); return i < 0 ? [] : L.slice(i); };
    let fixed = false;
    for (const k of IV_POOLS) {
      const P = I.pool[k];
      for (const id of Object.keys(P.own)) { const L = from(id, ivN(P.cost[id]) / P.own[id]); if (L.length) { P.own[id] = scaleN(P.own[id], L); fixed = true; if (!(P.own[id] > 0)) { delete P.own[id]; delete P.cost[id]; } } }
      if (fixed) P.stopUntil = null;
    }
    if (top >= 28) for (const k of IV_POOLS) {
      const P = I.pool[k], n = IV_PEG_REFUND[k];
      if (!(n > 0) || !(P.pnl <= -Math.floor(n * 0.95))) continue;
      const got = k === "house" ? casHouseWorldOut(house, "houseInvFix", n) : casPoolWorldOut(house, "budget", "budgetInvFix", n);
      P.pnl += got;
    }
    for (const id of Object.keys(I.lastPx || {})) { const L = from(id, I.lastPx[id]); if (L.length) I.lastPx[id] = stPx(L.reduce((x, e) => x * e.to / e.from, I.lastPx[id])); }
    I.pegSeq = top;
    return;
  }
  const L = evs.filter(e => e.seq > I.pegSeq);
  if (!L.length) return;
  for (const k of IV_POOLS) { const P = I.pool[k]; for (const id of Object.keys(P.own)) { const M = L.filter(e => e.id === id); if (M.length) { P.own[id] = scaleN(P.own[id], M); if (!(P.own[id] > 0)) { delete P.own[id]; delete P.cost[id]; } } } }
  for (const e of L) {
    if (Array.isArray(I.hx[e.id])) I.hx[e.id] = I.hx[e.id].map(v => stPx(v * e.to / e.from)); // 均價用的歷史也換到新比例（不然換完會被當成大跌而加碼）
    for (const m of [I.px, I.lastPx]) if (m && +m[e.id] > 0) m[e.id] = stPx(m[e.id] * e.to / e.from);
  }
  I.pegSeq = top;
}
// 除權（配股、拆股，house.stk.div.ev 的 kind "split"，決定 0112）：館方的持股也要乘 r（捨去），成本不變；hx、px、lastPx 除以 r（11-17，跟換比例同壹類的漏洞）。
//   I.dvLast ＝ 上次對過的遊戲日：只跟除權日 ≥ 那天的（第壹次＝今天，過去的不補，跟錢包的 S.dv.last 壹樣）；I.dvDone 記做過的事件
function ivSplitSync(I, house) {
  const H = house && ivBox(house.stk) ? house.stk : null, day = H && ivDay(H.day) ? H.day : null;
  if (!day) return;
  const evs = H.div && Array.isArray(H.div.ev) ? H.div.ev.filter(e => ivBox(e) && e.kind === "split" && +e.r > 1 && +e.r <= 50 && ivDay(e.ex) && typeof e.key === "string") : [];
  if (!ivBox(I.dvDone)) I.dvDone = {};
  const last = ivDay(I.dvLast) ? I.dvLast : day;
  for (const e of evs) {
    if (I.dvDone[e.key] || e.ex > day) continue;
    I.dvDone[e.key] = 1;
    if (e.ex < last) continue;
    for (const k of IV_POOLS) { const P = I.pool[k]; if (P.own[e.id] > 0) P.own[e.id] = Math.floor(P.own[e.id] * e.r + 1e-9); }
    if (Array.isArray(I.hx[e.id])) I.hx[e.id] = I.hx[e.id].map(v => stPx(v / e.r));
    for (const m of [I.px, I.lastPx]) if (m && +m[e.id] > 0) m[e.id] = stPx(m[e.id] / e.r);
  }
  const keys = new Set(evs.map(e => e.key)); for (const k of Object.keys(I.dvDone)) if (!keys.has(k)) delete I.dvDone[k];
  I.dvLast = day;
}
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
  if (!ivBox(I.hx)) I.hx = {};
  for (const id of Object.keys(I.hx)) { const a = Array.isArray(I.hx[id]) ? I.hx[id].filter(v => +v > 0).map(v => stPx(v)).slice(-NUM.casino.invest.dip.days) : []; if (IV_IDS.includes(id) && a.length) I.hx[id] = a; else delete I.hx[id]; }
  for (const k of ["px", "lastPx"]) { const m = ivBox(I[k]) ? I[k] : {}; I[k] = {}; for (const id of Object.keys(m)) if (IV_IDS.includes(id) && +m[id] > 0) I[k][id] = stPx(m[id]); }
  I.pegSeq = I.pegSeq == null || !Number.isFinite(+I.pegSeq) ? null : Math.floor(+I.pegSeq);
  ivPegSync(I, house);
  ivSplitSync(I, house); // 最近兩次跑的時候的價（銀行的「昨天買賣」要寫成交價）
  return I;
}

const ivName = id => (OUT_STOCKS.find(s => s.id === id) || { name: id }).name;
const ivList = rec => Object.entries(rec || {}).map(([k, n]) => { const [pool, id] = k.split(":"); return { pool, id, name: ivName(id), n }; });
// 莊家：超過準備金、扣掉文化部館債；博物館資金：超過保留金、扣掉「莊家還文化部館債時博物館資金要墊的」（館債剩下的 − 莊家現金），不然博物館資金壹邊墊款壹邊拿去投資，墊不出來
const ivAvail = (house, pool) => (pool === "house" ? Math.max(0, ivN(house.bankroll) - NUM.casino.invest.reserve - ivN(house.debt && house.debt.culture)) : Math.max(0, ivN(house.budget) - NUM.casino.invest.budgetKeep - Math.max(0, ivN(house.debt && house.debt.culture) - Math.max(0, ivN(house.bankroll)))));
const ivFee = n => Math.ceil(n * NUM.casino.stock.feePct / 100);
const ivCostSum = P => Object.values(P.cost).reduce((s, x) => s + ivN(x), 0);
// 持股現值（用現在的價）
const ivValue = (P, px) => Object.keys(P.own).reduce((s, id) => s + stValue(px[id] || 0, P.own[id]), 0);

// 賣 n 股（先檢查外面世界今天付得出）。回傳實際賣的股數
function ivSell(house, pool, P, id, n, px, cfg) {
  n = Math.min(n, P.own[id]);
  if (n <= 0 || !(px > 0)) return 0;
  const room = casWorldRoom(house, cfg.world);
  n = Math.min(n, Math.floor(room * 100 / stCents(px)));
  if (n <= 0) return 0;
  const gross = stSellGet(px, n), fee = ivFee(gross), costOut = n >= P.own[id] ? P.cost[id] : Math.floor(P.cost[id] * n / P.own[id]);
  if (pool === "house") { casHouseWorldOut(house, "houseInvestSell", gross, cfg.world); casHouseMove(house, "investFee", -fee); house.budget += fee; }
  else { casPoolWorldOut(house, "budget", "budgetInvestSell", gross); } // 博物館資金付給自己：手續費不用搬
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
  I.lastPx = I.px; I.px = Object.fromEntries(IV_IDS.filter(id => +stkH.px[id] > 0).map(id => [id, stPx(stkH.px[id])]));
  const px = stkH.px, cfg = NUM.casino;
  for (const id of IV_IDS) if (+px[id] > 0) { const a = (Array.isArray(I.hx[id]) ? I.hx[id] : []).filter(v => v * 3 > px[id] && v < px[id] * 3); I.hx[id] = a.concat(stPx(px[id])).slice(-C.dip.days); } // 跟現在差 3 倍以上的舊價丟掉（換比例、除權沒換到的，11-17：7 支非科技台股的均價還是 10,000） // 均價用的歷史：每天跑壹次記壹個價（買之前用的是記今天價之前的）
  for (const pool of IV_POOLS) {
    const P = I.pool[pool], avail = ivAvail(house, pool);
    // 1 先賣：跌過停損、漲過停利
    for (const id of Object.keys(P.own)) {
      const avg = P.cost[id] / P.own[id], r = avg > 0 ? px[id] / avg - 1 : 0;
      let part = 0;
      if (C.stopLossPct > 0 && r <= -C.stopLossPct / 100) part = Math.ceil(P.own[id] / 2);
      else if (C.takeProfitPct > 0 && r >= C.takeProfitPct / 100) part = Math.ceil(P.own[id] / 3);
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
    const alloc = {};
    if (C.mode === "chase") { // 舊的：七成追最近漲最多的、兩成平均、壹成隨機
      const ranked = IV_IDS.map(id => ({ id, r: ivRet(stkH, day, id, px[id]) })).sort((a, z) => z.r - a.r || (a.id < z.id ? -1 : 1));
      const rnd = mulberry32(hashStr(`${secret}|${day}|${pool}|invest`)), pick = IV_IDS[Math.floor(rnd() * IV_IDS.length)];
      ranked.slice(0, C.topN).forEach(x => { alloc[x.id] = (alloc[x.id] || 0) + spend * C.topPct / 100 / C.topN; });
      IV_IDS.forEach(id => { alloc[id] = (alloc[id] || 0) + spend * C.evenPct / 100 / IV_IDS.length; });
      alloc[pick] = (alloc[pick] || 0) + spend * C.randPct / 100;
    } else { // 平均買全部；比自己的均價低 dip.pct% 以上的加碼 dip.mult 倍（均價 ＝ 最近 dip.days 次記下的價，不夠 dip.minDays 次不加碼）
      const w = {}; let tot = 0;
      for (const id of IV_IDS) { if (!(px[id] > 0)) continue; const hx = I.hx[id] || [], ma = hx.length >= C.dip.minDays ? hx.reduce((a, b) => a + b, 0) / hx.length : 0; w[id] = ma > 0 && px[id] <= ma * (1 - C.dip.pct / 100) ? C.dip.mult : 1; tot += w[id]; }
      for (const id of Object.keys(w)) alloc[id] = spend * w[id] / tot;
    }
    let left = spend;
    for (const id of Object.keys(alloc)) {
      if (!(px[id] > 0)) continue;
      const n = Math.floor(Math.min(left, alloc[id]) / (px[id] * (1 + cfg.stock.feePct / 100)));
      if (n <= 0) continue;
      const cost = stBuyCost(px[id], n), fee = ivFee(cost);
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

// 銀行財報頁的「館方投資」（翊文 11-14：「銀行裡怎麼我們看不到館方投資了什麼」）：延遲壹天公開——日報產生那壹刻拍壹張快照（house.invPub），之後整天不變，不給即時的（避免跟單套利）。
// 兩個池子（莊家、博物館資金）合併。回傳 { asOf, hold: [{ id, name, n, cost, value, pnl, pnlPct }], cost, value, pnl, pnlPct, pnlTotal 累計賺賠（已實現＋帳面）, spent 昨天買進用掉多少, yesterday: [{ side: "buy"|"sell", id, name, n, px }], paused: { house?, budget?: "stop"|"world" } }
export function casInvestPublic(house, day) {
  if (!ivBox(house.inv)) return null;
  const I = casInvestFix(house), px = (house.stk && house.stk.px) || {}, hold = {};
  let realized = 0;
  for (const k of IV_POOLS) { const P = I.pool[k]; realized += P.pnl; for (const id of Object.keys(P.own)) { const h = hold[id] || (hold[id] = { id, name: ivName(id), n: 0, cost: 0 }); h.n += P.own[id]; h.cost += ivN(P.cost[id]); } }
  const rows = Object.values(hold).map(h => { const value = stValue(px[h.id] || 0, h.n); return Object.assign(h, { value, pnl: value - h.cost, pnlPct: h.cost > 0 ? Math.round((value / h.cost - 1) * 1000) / 10 : 0 }); }).sort((a, b) => b.value - a.value);
  const cost = rows.reduce((s, h) => s + h.cost, 0), value = rows.reduce((s, h) => s + h.value, 0);
  const side = (arr, s) => (arr || []).map(x => ({ side: s, id: x.id, name: x.name, n: x.n, px: (I.lastPx && I.lastPx[x.id]) || 0 }));
  const yesterday = I.last ? side(I.last.buy, "buy").concat(side(I.last.sell, "sell")) : [];
  return { asOf: day || null, hold: rows, cost, value, pnl: value - cost, pnlPct: cost > 0 ? Math.round((value / cost - 1) * 1000) / 10 : 0, pnlTotal: realized + value - cost, spent: yesterday.filter(x => x.side === "buy").reduce((s, x) => s + x.n * x.px, 0), yesterday, paused: I.cur && I.cur.paused ? Object.assign({}, I.cur.paused) : {} };
}
// 銀行畫面讀的（house.invPub，日報產生時寫）；沒有就 null
export function casInvestPubView(house) {
  const p = house && house.invPub;
  if (!ivBox(p) || !ivDay(p.asOf)) return null;
  return { asOf: p.asOf, hold: (Array.isArray(p.hold) ? p.hold : []).slice(0, IV_IDS.length), cost: ivN(p.cost), value: ivN(p.value), pnl: Math.floor(+p.pnl) || 0, pnlPct: +p.pnlPct || 0, pnlTotal: Math.floor(+p.pnlTotal) || 0, spent: ivN(p.spent), yesterday: (Array.isArray(p.yesterday) ? p.yesterday : []).slice(0, 20), paused: ivBox(p.paused) ? p.paused : {} };
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
