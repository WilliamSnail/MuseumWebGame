// ================================================================
//  世界集團的股票（決定 0121，設計見 .claude/交接/集團資本額和股票建議.md）
//  對內投資：名單裡 listed 的集團各發壹支股（id 跟單位壹樣，例如 g-daily）。價格由這個世界的買賣和經濟決定；館外股（台股美股）才是對外投資（記在海外）。
//    資本額（市值基準）＝ 集團「應有的池子」× capMult；每股起始 p0。基本價 F ＝ 每股淨值（池子 ÷ 股數）× pb × 健康值項 × 市場景氣項（經濟 → 股價）。
//    館友買賣照館內股 0113 的推價：Pnew ＝ P × exp(q ÷ depth)，半個價差 half，莊家當造市商；每個 15 分鐘價最多動 tickLim%、壹天離開盤價最多 dayLim%（漲跌停）。
//    每 15 分鐘價往 F 回 revert，加壹點固定的雜湊雜訊（不用 RNG）。惰性補算（跟 wtAdvance、館內股同壹招）：碰到莊家文件時推到現在。
//  股價 → 經濟：集團自己的股價漲跌也算進健康值的股價項（shared/world/core.js 的 whIdx，上限照現有 stockW×chgCap）；
//    增資（吃緊的集團發新股給造市商，錢進集團池子）、庫藏股（集團用池子買回，股數少）、現金股利（每週壹次，成長的壹部分）、股票股利、分割（價格太高）。
//  錢：全部是搬動。買賣：錢包 ↔ 莊家（來源 gStock，手續費進博物館資金、證交稅進政府帳）；增資／庫藏股：莊家 ↔ 已知世界（gRaise／gBuy）並記到那個集團的池子；股利：已知世界 → 錢包（gDiv）從那個集團出。
//  存在哪：莊家 house.gs ＝ { day, k 今天推到第幾個價, n 事件編號, ev: [最近的公司事件], div 指數除數, idx 最近指數, u: { 單位 id: { S 股數, P 現價, o 開盤價, i 莊家持倉, h 全館持股, a0 上週壹的池子, hist: [近 30 天收盤] } } }
//        錢包 w.gs ＝ { h: { id: 股數 }, cost: { id: 成本 }, sold: { day, n }, v: { day, n 今天買賣股數 }, seen: 看到第幾號事件 }
//  純函式，不碰資料庫和 DOM。
// ================================================================
import { NUM } from "../config.js";
import { WORLD_UNITS } from "../world/roster.js";
import { whName, wmB, wtLed, wmOfUnit, wuAmounts, wuCredit, wuDebit, wuFix } from "../world/core.js";
import { casCount, casHouseCover, casHouseMove, casHouseWorldIn, casHouseWorldOut, casPoolGain, casWorldOut } from "./book.js";
import { casInIdx } from "./stock_in.js";
import { hashStr } from "../logic_base.js";
// 集團股的手續費 %（決定 0137）：feeOut.grp，沒寫就用 feePct
export const gsFeePct = () => { const O = NUM.casino.stock.feeOut; return O && O.grp != null ? O.grp : NUM.casino.stock.feePct; };

const gN = v => (Number.isFinite(+v) ? Math.floor(+v) : 0);
const gBox = v => !!v && typeof v === "object" && !Array.isArray(v);
const gDayOk = d => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
const gAdd = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const gClamp = (v, a, b) => Math.max(a, Math.min(b, v));
const gCfg = () => NUM.casino.gstock;
const gGauss = key => { const u1 = ((hashStr(key + "|a") % 1000000) + 0.5) / 1000000, u2 = ((hashStr(key + "|b") % 1000000) + 0.5) / 1000000; return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
export const gsNameOf = id => whName(id) + "股";
// 發股的單位 id（名單的 listed ＋ 之後分拆出來、house.gs.u 裡已經有的）
export const gsListed = house => { const ids = WORLD_UNITS.filter(u => u && u.listed).map(u => u.id); if (house && gBox(house.gs) && gBox(house.gs.u)) for (const k of Object.keys(house.gs.u)) if (!ids.includes(k)) ids.push(k); return ids; };
export const gsIs = (house, id) => !!(house && gBox(house.gs) && gBox(house.gs.u) && house.gs.u[id]);

// ---------- 莊家的 gs ----------
export function gsFix(house) {
  if (!gBox(house)) return null;
  const g = gBox(house.gs) ? house.gs : (house.gs = {});
  g.day = gDayOk(g.day) ? g.day : null; g.k = Number.isFinite(+g.k) ? gN(g.k) : -1; g.n = gN(g.n);
  if (!Array.isArray(g.ev)) g.ev = []; g.ev = g.ev.filter(e => gBox(e)).slice(-200);
  if (!gBox(g.u)) g.u = {}; g.div = +g.div > 0 ? +g.div : 0; g.idx = +g.idx > 0 ? +g.idx : 0;
  for (const U of Object.values(g.u)) { if (!gBox(U)) continue; if (!Array.isArray(U.tp)) U.tp = []; if (!Array.isArray(U.tpp)) U.tpp = []; if (!gBox(U.hc)) U.hc = {}; U.lv = Number.isFinite(+U.lv) ? Math.round(+U.lv) : 0; } // 決定 0124：槓桿要用的今天／昨天每 15 分鐘的價、各日收盤、槓桿部位對莊家庫存的淨影響
  return g;
}
const gSnap = (house, id) => { const am = wuAmounts(house); return Math.max(0, gN(am[id])); };
// 每股淨值 ＝ 單位池子 ÷ 股數；基本價 F
export function gsNav(house, id) { const U = gsFix(house).u[id]; return U && U.S > 0 ? gSnap(house, id) / U.S : 0; }
export function gsFair(house, id) {
  const C = gCfg(), U = gsFix(house).u[id]; if (!U) return 0;
  const h = house.wh && house.wh.h ? +house.wh.h[id] || 1 : 1, hf = 1 + C.healthW * (h - 1), mf = 1 + C.marketW * wmB(house, wmOfUnit(id));
  return Math.max(C.floor, gsNav(house, id) * C.pb * hf * mf);
}
const gCap = house => gsListed(house).reduce((a, id) => { const U = gsFix(house).u[id]; return a + (U ? U.P * U.S : 0); }, 0);
// 指數 ＝ 市值 ÷ 除數；除數在發股、增資、庫藏股時調整（價格漲跌不調），所以指數只反映價格
export function gsIndex(house) { const g = gsFix(house); if (!(g.div > 0)) return 0; return Math.round(gCap(house) / g.div * 100) / 100; }
const gDivAdj = (house, capBefore) => { const g = gsFix(house), after = gCap(house); if (g.div > 0 && capBefore > 0) g.div *= after / capBefore; };
// 新上市（資本額 ＝ 應有的池子 × capMult、每股 p0）
function gsList(house, id, day) {
  const C = gCfg(), g = gsFix(house), x = wuFix(house); if (!x || g.u[id]) return false;
  const cap = gSnap(house, id) * C.capMult, S = Math.max(1000, Math.floor(cap / C.p0)); if (!(S > 0) || !(gSnap(house, id) > 0)) return false;
  const before = gCap(house); g.u[id] = { S, P: C.p0, o: C.p0, i: 0, h: 0, a0: gSnap(house, id), hist: [], tp: [], tpp: [], hc: {}, lv: 0 };
  if (g.div > 0) gDivAdj(house, before); else g.div = gCap(house) / 100;
  return true;
}
// ---------- 時間：推到現在 ----------
// 回傳今天推到第幾個價（0～ticks−1；休市 ＝ 全部走完 / 還沒開盤 ＝ −1）
const gSlot = (t, ticks) => { const k = casInIdx(t); return t == null || !Number.isFinite(+t) ? -1 : k === null ? ticks - 1 : k; };
export function gsAdvance(house, day, t) {
  const C = gCfg(); if (!C || !C.on || !gDayOk(day)) return false;
  const g = gsFix(house), x = wuFix(house); if (!x) return false;
  if (g.day !== day) { // 換日：收盤進歷史、開盤價 ＝ 昨天的收盤；新的集團上市；每週一做公司的事
    for (const id of Object.keys(g.u)) {
      const U = g.u[id]; U.i += gN(U.lv); U.lv = 0; // 槓桿部位都是當天的：換日就當沖掉了，莊家庫存還原（錢包裡的部位之後用昨天的收盤結算，不再動庫存）
      if (g.day) { U.hc[g.day] = Math.round(U.P * 100) / 100; for (const d of Object.keys(U.hc).sort().slice(0, -6)) delete U.hc[d]; U.tpp = U.tp; U.tpd = g.day; } U.tp = [];
      U.hist.push(Math.round(U.P * 100) / 100); U.hist = U.hist.slice(-30); U.o = U.P;
    }
    if (gBox(house.lev)) house.lev.grp = 0;
    for (const id of gsListed(house)) gsList(house, id, day);
    g.day = day; g.k = -1;
    if (new Date(day + "T00:00:00Z").getUTCDay() === 1) gsWeekly(house, day);
  }
  const target = gSlot(t, C.ticks);
  for (let k = g.k + 1; k <= target; k++) for (const id of Object.keys(g.u)) gsStep(house, id, day, k);
  if (target > g.k) g.k = target;
  g.idx = gsIndex(house);
  return true;
}
function gsStep(house, id, day, k) {
  const C = gCfg(), U = gsFix(house).u[id], F = gsFair(house, id), prev = U.P;
  let P = prev + C.revert * (F - prev) + prev * C.sd * gGauss(`${day}|${id}|${k}`);
  P = gClamp(P, prev * (1 - C.tickLim / 100), prev * (1 + C.tickLim / 100)); P = gClamp(P, U.o * (1 - C.dayLim / 100), U.o * (1 + C.dayLim / 100));
  U.P = Math.max(C.floor, P); U.tp[k] = Math.round(U.P * 100) / 100;
}
// ---------- 公司的事（每週一）：現金股利、增資、庫藏股、股票股利、分割 ----------
function gsEvent(g, e) { g.n++; g.ev.push(Object.assign({ no: g.n }, e)); g.ev = g.ev.slice(-200); }
function gsWeekly(house, day) {
  const C = gCfg(), g = gsFix(house);
  for (const id of Object.keys(g.u)) {
    const U = g.u[id], amt = gSnap(house, id), h = house.wh && house.wh.h ? +house.wh.h[id] || 1 : 1, st = house.wh && house.wh.st && house.wh.st[id] ? house.wh.st[id].s : "normal";
    // 1 現金股利：上週池子的成長 × payout%，平均分給每股（持股人下次碰到錢包時領）
    const grow = Math.max(0, amt - gN(U.a0)); U.a0 = amt;
    const ds = U.S > 0 ? Math.floor(grow * C.payoutPct / 100 / U.S * 10000) / 10000 : 0;
    if (ds > 0 && st === "normal") gsEvent(g, { kind: "div", id, ps: ds, day });
    // 2 增資：吃緊（狀態不是一般、健康值低）的集團發新股給造市商，錢進集團池子
    if (st !== "normal" && h < C.raise.hBelow && house.bankroll > C.raise.keep) gsRaise(house, id, day);
    // 3 庫藏股：健康值高、股價比基本價低很多：集團用池子買回
    else if (st === "normal" && h >= C.buyback.hAbove && U.P < gsFair(house, id) * C.buyback.discPct / 100) gsBuyback(house, id, day);
    // 4 股票股利：價格高過 stockDivPx，配 stockDivPct%（價格除以 1＋比例）
    if (U.P >= C.stockDivPx && U.P < C.splitPx) gsBonus(house, id, day, C.stockDivPct / 100);
    // 5 分割：價格高過 splitPx，壹股拆 splitK 股
    if (U.P >= C.splitPx) gsSplit(house, id, day, C.splitK);
  }
}
// 增資：發 raise.pct% 新股，價格 ＝ 現價 ×（1 － disc%），造市商接；錢從莊家進集團池子。價格照稀釋調整
export function gsRaise(house, id, day) {
  const C = gCfg(), g = gsFix(house), U = g.u[id]; if (!U) return 0;
  const N = Math.floor(U.S * C.raise.pct / 100), px = U.P * (1 - C.raise.discPct / 100), cash = Math.floor(N * px);
  if (!(N > 0) || cash <= 0 || house.bankroll - cash < C.raise.keep || Math.abs(U.i + N) > U.S * C.makerCapPct / 100) return 0;
  const before = gCap(house), w0 = gN(house.world);
  casHouseWorldIn(house, "gRaise", cash); wuCredit(house, w0, id, cash); wtLed(house, "gRaise", "house", id, cash); // 金流頁籤：莊家 → 那家集團
  U.P = Math.max(C.floor, (U.S * U.P + N * px) / (U.S + N)); U.S += N; U.i += N; gDivAdj(house, before - 0);
  gsEvent(g, { kind: "raise", id, n: N, cash, day }); casCount(house, "gRaise", cash);
  return cash;
}
// 庫藏股：買回 buyback.pct% 股（從造市商，價格 ＝ 現價 ×（1＋prem%）），錢從集團池子到莊家，股數少、註銷
export function gsBuyback(house, id, day) {
  const C = gCfg(), g = gsFix(house), U = g.u[id]; if (!U) return 0;
  const N = Math.floor(U.S * C.buyback.pct / 100), px = U.P * (1 + C.buyback.premPct / 100); let cash = Math.floor(N * px);
  cash = Math.min(cash, Math.floor(gSnap(house, id) * C.buyback.maxPoolPct / 100)); const n2 = Math.floor(cash / px); cash = Math.floor(n2 * px);
  if (!(n2 > 0) || cash <= 0 || Math.abs(U.i - n2) > U.S * C.makerCapPct / 100) return 0;
  const before = gCap(house), got = casHouseWorldOut(house, "gBuy", cash); if (got <= 0) return 0;
  wuDebit(house, id, got); wtLed(house, "gBuy", id, "house", got); U.i -= n2; U.S -= n2; U.P = Math.max(C.floor, U.P * (1 + 0.5 * n2 / (U.S + n2))); gDivAdj(house, before - 0);
  gsEvent(g, { kind: "buyback", id, n: n2, cash: got, day }); casCount(house, "gBuy", got);
  return got;
}
// 股票股利：每股配 r 股（r 例如 0.05）；持股人的股數照 floor(股數 × r) 多、零頭不補；價格 ÷（1＋r）
export function gsBonus(house, id, day, r) {
  const g = gsFix(house), U = g.u[id]; if (!U || !(r > 0)) return false;
  const before = gCap(house); U.S = Math.floor(U.S * (1 + r)); U.i = Math.floor(U.i * (1 + r)); U.h = Math.floor(U.h * (1 + r)); U.P = U.P / (1 + r); U.o = U.o / (1 + r); gDivAdj(house, before);
  gsEvent(g, { kind: "bonus", id, r, day }); return true;
}
// 分割：壹股拆 k 股（整數）；價格 ÷ k
export function gsSplit(house, id, day, k) {
  const g = gsFix(house), U = g.u[id]; k = Math.floor(k); if (!U || !(k >= 2)) return false;
  U.S *= k; U.i *= k; U.h *= k; U.P /= k; U.o /= k; U.hist = U.hist.map(p => p / k);
  gsEvent(g, { kind: "split", id, k, day }); return true;
}
// ---------- 子公司分拆（spin-off）：parent 把 pct% 的池子分給 child（child 成為新的上市公司），原股東照持股拿到 child 的股票 ----------
// 價值守恆：parent 價 ×（1 − f），child 價 ＝ parent 原價 × f（壹股換壹股）；f ＝ 搬走的池子 ÷ parent 原池子。持股人的總市值前後相同
export function gsSpin(house, parentId, childId, pct, day) {
  const g = gsFix(house), x = wuFix(house), P = g.u[parentId]; if (!x || !P || g.u[childId] || !(pct > 0 && pct < 100)) return null;
  const amt = gSnap(house, parentId), moved = Math.floor(amt * pct / 100); if (!(moved > 0)) return null;
  const f = moved / amt, before = gCap(house);
  if (!(childId in x.r)) { x.r[childId] = 0; x.adj[childId] = 0; } x.adj[parentId] = gN(x.adj[parentId]) - moved; x.adj[childId] = gN(x.adj[childId]) + moved; // 池子搬家，總和不變
  g.u[childId] = { S: P.S, P: P.P * f, o: P.P * f, i: P.i, h: P.h, a0: moved, hist: [] };
  P.P = P.P * (1 - f); P.o = P.o * (1 - f); P.hist = P.hist.map(p => p * (1 - f)); P.a0 = gN(P.a0) - moved;
  gsEvent(g, { kind: "spin", id: parentId, child: childId, f, day });
  return { f, moved };
}
// ---------- 錢包 ----------
export function gsWalletFix(w) {
  const s = gBox(w.gs) ? w.gs : (w.gs = {});
  for (const k of ["h", "cost"]) if (!gBox(s[k])) s[k] = {};
  for (const k of Object.keys(s.h)) { const n = gN(s.h[k]); if (n > 0) s.h[k] = n; else { delete s.h[k]; delete s.cost[k]; } }
  if (!gBox(s.sold)) s.sold = { day: null, n: 0 }; if (!gBox(s.v)) s.v = { day: null, n: {} }; s.seen = gN(s.seen);
  s.orders = (Array.isArray(s.orders) ? s.orders : []).filter(o => gBox(o) && o.id && gN(o.n) > 0 && +o.px > 0); s.oseq = gN(s.oseq); s.hold = s.orders.reduce((a, o) => a + gN(o.hold), 0); // 掛單（決定 0124）：鎖住的籌碼算玩家的（casino_book 的 bkHeld）
  s.notes = (Array.isArray(s.notes) ? s.notes : []).filter(x => typeof x === "string").slice(-8);
  return s;
}
// 碰到錢包時補上沒套用的公司事件（股利、股票股利、分割、分拆）；每次買賣、看畫面前先呼叫。錢從集團池子出（gDiv）。回傳 { got 領到的股利, lines }
export function gsSync(w, house) {
  const g = gsFix(house), S = gsWalletFix(w), C = gCfg(), out = { got: 0, lines: [] };
  const first = !g.ev.length ? 0 : g.ev[0].no; if (S.seen < first - 1) S.seen = first - 1; // 太久沒來，更早的事件已經不在名單裡
  for (const e of g.ev) {
    if (e.no <= S.seen) continue; S.seen = e.no;
    const n = gN(S.h[e.id]); if (n <= 0) continue;
    if (e.kind === "div") {
      const amt = Math.floor(n * e.ps), pay = amt > 0 ? casWorldOut(w, house, "gDiv", amt, NUM.casino.world) : 0;
      if (pay > 0) { wuDebit(house, e.id, pay); wtLed(house, "gDiv", e.id, "players", pay); out.got += pay; out.lines.push(`${gsNameOf(e.id)}發股息：${n} 股領到 ${pay}。`); casCount(house, "gDiv", pay); }
    } else if (e.kind === "bonus") { const b = Math.floor(n * e.r); if (b > 0) { S.h[e.id] = n + b; out.lines.push(`${gsNameOf(e.id)}配股：多了 ${b} 股。`); } }
    else if (e.kind === "split") { S.h[e.id] = n * e.k; out.lines.push(`${gsNameOf(e.id)}一股拆成 ${e.k} 股：現在 ${n * e.k} 股。`); }
    else if (e.kind === "spin") { const c = Math.floor(n); S.h[e.child] = gN(S.h[e.child]) + c; const cost = gN(S.cost[e.id]), cc = Math.floor(cost * e.f); S.cost[e.id] = cost - cc; S.cost[e.child] = gN(S.cost[e.child]) + cc; out.lines.push(`${gsNameOf(e.id)}分拆出「${gsNameOf(e.child)}」：領到 ${c} 股。`); }
  }
  return out;
}
// ---------- 買賣 ----------
const gDepth = U => Math.max(1, U.S * gCfg().depthPct / 100);
function gQuote(U, q) { // q：買 ＋、賣 −。回傳 { ok, avg, Pn, maxN }
  const C = gCfg(), Pn = U.P * Math.exp(q / gDepth(U)), lo = U.o * (1 - C.dayLim / 100), hi = U.o * (1 + C.dayLim / 100);
  if (Pn > hi + 1e-9 || Pn < lo - 1e-9) { const lim = q > 0 ? hi : lo; return { ok: false, maxN: Math.max(0, Math.floor(gDepth(U) * Math.abs(Math.log(lim / U.P)))) }; }
  return { ok: true, Pn, avg: Math.sqrt(U.P * Pn) };
}
const gHalt = (g, day, t) => !gDayOk(day) || (t != null && Number.isFinite(+t) && casInIdx(t) === null);
export function gsBuy(w, house, id, shares, day, t, fixPx) {
  const C = gCfg(); if (!C || !C.on) return { ok: false, reason: "集團的股票還沒開放。" };
  gsAdvance(house, day, t); const g = gsFix(house), U = g.u[id], S = gsWalletFix(w); gsSync(w, house);
  if (!U) return { ok: false, reason: "看不懂要買哪一支。" }; if (gHalt(g, day, t)) return { ok: false, reason: "集團股票的營業時間是 05:00～23:30，現在休市。" };
  const n = Math.floor(Number(String(shares == null ? "" : shares).replace(/[,，\s]/g, ""))); if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: "看不懂要買幾股。" };
  const have = gN(S.h[id]), vol = S.v.day === day ? gN(S.v.n[id]) : 0, capD = Math.floor(U.S * C.dayVolPct / 100);
  if (vol + n > capD) return { ok: false, reason: `今天這支最多再買賣 ${Math.max(0, capD - vol)} 股（壹天最多股本的 ${C.dayVolPct}%）。` };
  if (Math.abs(U.i - n) > U.S * C.makerCapPct / 100) return { ok: false, reason: "莊家手上這支的庫存已經夠多了，今天不能再買。" };
  const q = gQuote(U, n); if (!q.ok) return { ok: false, reason: `這支的價格已經推到漲跌停了，現在最多還能買 ${q.maxN} 股，晚點再來。` };
  const cost = Math.max(1, fixPx > 0 ? Math.round(n * fixPx) : Math.round(n * q.avg * (1 + C.half))), fee = Math.ceil(cost * gsFeePct() / 100);
  if (cost + fee > w.chips) return { ok: false, reason: "籌碼不夠。" };
  w.chips -= cost; casHouseMove(house, "gStock", cost); w.chips -= fee; casPoolGain(house, "budget", "stockFee", fee); casCount(house, "stockFee", fee);
  U.P = Math.max(C.floor, q.Pn); U.i -= n; U.h += n; S.h[id] = have + n; S.cost[id] = gN(S.cost[id]) + cost + fee; S.v = { day, n: Object.assign(S.v.day === day ? S.v.n : {}, { [id]: vol + n }) };
  return { ok: true, n, cost, fee, px: Math.round(cost / n), lines: [`買進「${gsNameOf(id)}」${n} 股，每股約 ${Math.round(cost / n)}，花了 ${cost}，手續費 ${fee}。`] };
}
export function gsSell(w, house, id, shares, day, t, fixPx) {
  const C = gCfg(); if (!C || !C.on) return { ok: false, reason: "集團的股票還沒開放。" };
  gsAdvance(house, day, t); const g = gsFix(house), U = g.u[id], S = gsWalletFix(w); gsSync(w, house);
  if (!U) return { ok: false, reason: "看不懂要賣哪一支。" }; if (gHalt(g, day, t)) return { ok: false, reason: "集團股票的營業時間是 05:00～23:30，現在休市。" };
  const have = gN(S.h[id]); if (have <= 0) return { ok: false, reason: "你沒有這支股票。" };
  const n0 = shares === "max" ? have : Math.floor(Number(String(shares == null ? "" : shares).replace(/[,，\s]/g, ""))); if (!Number.isFinite(n0) || n0 <= 0) return { ok: false, reason: "看不懂要賣幾股。" };
  if (n0 > have) return { ok: false, reason: `你只有 ${have} 股。` };
  { const free = have - gsLocked(S, id); if (n0 > free) return { ok: false, reason: `有 ${have - free} 股被掛單鎖住了，現在能賣 ${Math.max(0, free)} 股。` }; }
  const vol = S.v.day === day ? gN(S.v.n[id]) : 0, capD = Math.floor(U.S * C.dayVolPct / 100);
  if (vol + n0 > capD) return { ok: false, reason: `今天這支最多再買賣 ${Math.max(0, capD - vol)} 股（壹天最多股本的 ${C.dayVolPct}%）。` };
  if (Math.abs(U.i + n0) > U.S * C.makerCapPct / 100) return { ok: false, reason: "莊家手上這支的庫存已經夠多了，今天不能再收。" };
  const q0 = gQuote(U, -n0); if (!q0.ok) return { ok: false, reason: `這支的價格已經推到漲跌停了，現在最多還能賣 ${q0.maxN} 股，晚點再來。` };
  const gOf = k => { const qq = gQuote(U, -k); return qq.ok ? Math.max(1, fixPx > 0 ? Math.round(k * fixPx) : Math.round(k * qq.avg * (1 - C.half))) : Infinity; };
  let n = n0, gross = gOf(n0), part = 0, lent = 0;
  if (house.bankroll < gross) { // 決定 0122：莊家不夠先跟博物館資金借；兩邊加起來還不夠，賣得掉幾股算幾股（部分成交）
    if (!(house.bankroll >= 0)) return { ok: false, reason: "莊家現在沒有錢收，晚點再來。" };
    const cv = casHouseCover(house, C.cover.pct, C.cover.max), cap = house.bankroll + cv.room; let lo = 0, hi = n0; // 找付得起的最大股數（gOf 隨股數單調增）
    while (lo < hi) { const m = Math.ceil((lo + hi) / 2); if (gOf(m) <= cap) lo = m; else hi = m - 1; }
    if (lo < 1) return { ok: false, reason: "莊家和博物館資金現在都沒有這麼多錢收，晚點再來。" };
    n = lo; part = n0 - n; gross = gOf(n); lent = cv.take(gross - house.bankroll);
  }
  const q = gQuote(U, -n), fee = Math.ceil(gross * gsFeePct() / 100), tax = Math.min(Math.max(0, gross - fee), Math.max(1, Math.ceil(gross * Math.round(NUM.casino.stock.taxPct * 100) / 10000)));
  casHouseMove(house, "gStock", -gross); w.chips += gross; w.chips -= fee; casPoolGain(house, "budget", "stockFee", fee); casCount(house, "stockFee", fee);
  w.chips -= tax; if (tax > 0) { casPoolGain(house, "gov", "stockTax", tax); casCount(house, "stockTax", tax); }
  const costOut = n >= have ? gN(S.cost[id]) : Math.floor(gN(S.cost[id]) * n / have), profit = gross - fee - tax - costOut;
  U.P = Math.max(C.floor, q.Pn); U.i += n; U.h = Math.max(0, U.h - n); S.h[id] = have - n; if (S.h[id] <= 0) { delete S.h[id]; delete S.cost[id]; } else S.cost[id] = Math.max(1, gN(S.cost[id]) - costOut);
  S.v = { day, n: Object.assign(S.v.day === day ? S.v.n : {}, { [id]: vol + n }) };
  return { ok: true, n, gross, fee, tax, profit, part, lent, lines: [`賣出「${gsNameOf(id)}」${n} 股${part > 0 ? `（莊家付不起整筆，只收了這些，另外 ${part} 股沒賣掉）` : ""}，每股約 ${Math.round(gross / n)}，拿到 ${gross - fee - tax}，手續費 ${fee}，證交稅 ${tax}。`] };
}
// ---------- 掛單（決定 0124，翊文 11-17：成交照現股推價）----------
// 限價買（buy）：價 ≤ 限價就成交；限價賣（sell）：價 ≥ 限價；停損賣（stop）：價 ≤ 停損價。下單那天的收盤前有效，沒成交就取消退回（公司事件都在週一換日，不會跨到事件）。
// 下單時價格要比現價更有利（不然等於市價單）；買單鎖籌碼、賣單和停損鎖股數。成交價 ＝ 碰到的那個價（用下單之後每 15 分鐘的價和現價檢查），成交走 gsBuy／gsSell（手續費、稅、上限、推價跟現股壹樣）。
const gsLocked = (S, id) => S.orders.filter(o => o.id === id && o.kind !== "buy").reduce((a, o) => a + gN(o.n), 0);
const gPx2 = v => Math.round(+v * 100) / 100;
const gKind = { buy: "限價買", sell: "限價賣", stop: "停損賣" };
export function gsOrder(w, house, kind, id, shares, px, day, t) {
  const C = gCfg(); if (!C || !C.on) return { ok: false, reason: "集團的股票還沒開放。" };
  gsAdvance(house, day, t); const g = gsFix(house), U = g.u[id], S = gsWalletFix(w); gsSync(w, house);
  if (!U || !gKind[kind]) return { ok: false, reason: "看不懂要掛哪壹張單。" }; if (gHalt(g, day, t)) return { ok: false, reason: "集團股票的營業時間是 05:00～23:30，現在休市。" };
  const n = Math.floor(Number(String(shares == null ? "" : shares).replace(/[,，\s]/g, ""))), p = gPx2(Number(String(px == null ? "" : px).replace(/[,，\s]/g, "")));
  if (!Number.isFinite(n) || n <= 0 || !(p >= C.floor)) return { ok: false, reason: "看不懂股數或價格。" };
  const O = NUM.casino.stock.order; if (S.orders.length >= O.max) return { ok: false, reason: `最多同時掛 ${O.max} 張單。` };
  if (S.orders.filter(o => o.id === id).length >= O.perStock) return { ok: false, reason: `同壹支最多掛 ${O.perStock} 張單。` };
  const now = gPx2(U.P); if (kind === "sell" ? p <= now : p >= now) return { ok: false, reason: `價格要比現價 ${now} 更有利才能掛單（買、停損要低於現價，賣要高於現價）。` };
  const o = { no: ++S.oseq, kind, id, n, px: p, day, hold: 0, at: gN(g.k) };
  if (kind === "buy") { const c = Math.max(1, Math.round(n * p)); o.hold = c + Math.ceil(c * gsFeePct() / 100); if (o.hold > w.chips) { S.oseq--; return { ok: false, reason: "籌碼不夠，掛不了這張單。" }; } w.chips -= o.hold; }
  else { const free = gN(S.h[id]) - gsLocked(S, id); if (n > free) { S.oseq--; return { ok: false, reason: `可以掛的股只有 ${Math.max(0, free)} 股（掛單會鎖住股數）。` }; } }
  S.orders.push(o); S.hold = S.orders.reduce((a, x) => a + gN(x.hold), 0);
  return { ok: true, order: o, lines: [`掛好了：${gKind[kind]}「${gsNameOf(id)}」${n} 股，價格 ${p}${o.hold ? "，鎖住 " + o.hold : ""}。今天收盤前沒成交就取消。`] };
}
function gsDrop(w, S, o) { if (o.hold > 0) { w.chips += o.hold; o.hold = 0; } S.orders = S.orders.filter(x => x.no !== o.no); S.hold = S.orders.reduce((a, x) => a + gN(x.hold), 0); }
export function gsCancel(w, house, no, day, t) {
  gsAdvance(house, day, t); const g = gsFix(house), S = gsWalletFix(w);
  const o = S.orders.find(x => x.no === gN(no)); if (!o) return { ok: false, reason: "找不到這張單。" };
  if (gHalt(g, day, t)) return { ok: false, reason: "休市中不能取消（收盤後沒成交的單會自己取消）。" };
  gsDrop(w, S, o); return { ok: true, lines: ["取消了，鎖住的錢（股）退回來。"] };
}
// 照價格檢查這個錢包的單（casStockMatch 呼叫，每次碰到錢包）。回傳 { fills, cancels }
export function gsMatch(w, house, day, t) {
  const out = { fills: 0, cancels: 0 }; if (!gBox(w.gs) || !Array.isArray(w.gs.orders) || !w.gs.orders.length) return out;
  const C = gCfg(); if (!C || !C.on) return out;
  gsAdvance(house, day, t); const g = gsFix(house), S = gsWalletFix(w), closed = gHalt(g, day, t) && t != null;
  for (const no of S.orders.map(x => x.no).sort((a, b) => a - b)) {
    const o = S.orders.find(x => x.no === no), U = o && g.u[o.id]; if (!o) continue;
    const note = line => { S.notes.push(line); S.notes = S.notes.slice(-8); };
    if (!U || o.day < day) { gsDrop(w, S, o); note(`${gKind[o.kind]}「${gsNameOf(o.id)}」${o.n} 股沒成交，已經過期取消。`); out.cancels++; continue; }
    const pts = U.tp.slice(o.at + 1).concat(closed ? [] : [U.P]);
    const hit = pts.find(p => (o.kind === "sell" ? p >= o.px : p <= o.px)); // 限價買、停損：碰到或低於；限價賣：碰到或高於
    if (hit === undefined) { if (closed) { gsDrop(w, S, o); note(`${gKind[o.kind]}「${gsNameOf(o.id)}」${o.n} 股今天沒成交，已經取消。`); out.cancels++; } continue; }
    const kind = o.kind, n = o.n, id = o.id; gsDrop(w, S, o); // 先退回鎖住的，再照市價單走壹遍，成交價用碰到的價
    const r = kind === "buy" ? gsBuy(w, house, id, n, day, null, hit) : gsSell(w, house, id, n, day, null, hit);
    if (r.ok) { out.fills++; note(`${gKind[kind]}「${gsNameOf(id)}」成交：${r.n} 股，價格 ${hit}${r.part > 0 ? "（只賣掉這些）" : ""}。`); } else { out.cancels++; note(`${gKind[kind]}「${gsNameOf(id)}」${n} 股碰到價格了，但成交不了（${r.reason}），已取消。`); }
  }
  return out;
}
// ---------- 槓桿、放空（決定 0124，翊文 11-17：槓桿單也推價、5 倍、莊家曝險 20%）----------
// 部位的對手是莊家：開倉＝莊家賣出（做多）或買進（放空）n 股，推價；平倉、強平反過來推價。部位都是當天的（跟館內股壹樣），換日 gsAdvance 把莊家庫存還原（U.lv ＝ 部位淨股數，做多正、放空負）。
// 價格怎麼取：成交價 ＝ 這次推價的均價加半價差（跟現股壹樣）；推不動（漲跌停、莊家庫存上限、休市）的收尾單用現價、不推。
export const gsLevOk = id => WORLD_UNITS.some(u => u && u.listed && u.id === id);
// dir：+1 使用者買（做多開倉、放空平倉）、−1 使用者賣。回傳 { ok, px 成交價, pushed 有沒有推, Pn, reason }；dry 只報價不動；force 推不動就用現價
export function gsLevTrade(house, id, dir, n, day, t, opt = {}) {
  const C = gCfg(); if (!C || !C.on) return { ok: false, reason: "集團的股票還沒開放。" };
  gsAdvance(house, day, t); const g = gsFix(house), U = g.u[id]; n = Math.floor(n);
  if (!U || !(n > 0)) return { ok: false, reason: "看不懂要交易哪一支。" };
  const halt = gHalt(g, day, t), capBad = Math.abs(U.i - dir * n) > U.S * C.makerCapPct / 100, q = halt ? { ok: false } : gQuote(U, dir * n);
  if (halt || capBad || !q.ok) { if (!opt.force) return { ok: false, reason: halt ? "集團股票的營業時間是 05:00～23:30，現在休市。" : capBad ? "莊家手上這支的庫存已經夠多了，今天不能再推。" : `這支的價格已經推到漲跌停了，現在最多還能 ${q.maxN} 股，晚點再來。` }; return { ok: true, px: gPx2(U.P), pushed: false, Pn: U.P }; }
  const px = gPx2(dir > 0 ? q.avg * (1 + C.half) : q.avg * (1 - C.half));
  if (!opt.dry) { U.P = Math.max(C.floor, q.Pn); U.i -= dir * n; }
  return { ok: true, px, pushed: !opt.dry, Pn: q.Pn };
}
// 開倉成交後記下莊家的庫存影響（signed：做多 +n、放空 −n）
export function gsLevBook(house, id, signed) { const U = gsFix(house).u[id]; if (U) U.lv += signed; }
// 收掉壹筆當天的部位：能推就推（均價就是成交價），推不動用現價；莊家庫存都還原。不是今天開的部位（換日時已經還原）什麼都不動。回傳成交價或 null
export function gsLevClose(house, id, signed, openDay, day, t) {
  const g = gsFix(house), U = g.u[id]; if (!U || openDay !== g.day) return null;
  const r = gsLevTrade(house, id, signed > 0 ? -1 : 1, Math.abs(signed), day, t, { force: true });
  if (!r.pushed) U.i += signed; // 沒推（收盤了、漲跌停）：莊家庫存直接還原
  U.lv -= signed; return r.px;
}
// casLevSrc 要的價格來源（跟 src.now／path／close 同壹套）。idx ＝ 今天推到第幾個價（跟 U.tp 同壹個編號）
export function gsLevSrc(house, day, t) {
  gsAdvance(house, day, t); const g = gsFix(house);
  return {
    now(id) { const U = g.u[id]; return U ? { px: gPx2(U.P), idx: gN(g.k), open: !gHalt(g, day, t) } : { px: 0, idx: 0, open: false }; },
    path(id, d, from) { const U = g.u[id]; if (!U) return []; if (d === g.day) return U.tp.slice(from + 1); if (d === U.tpd) return U.tpp.slice(from + 1); return []; },
    close(id, d) { const U = g.u[id]; if (!U) return null; if (U.hc[d] > 0) return U.hc[d]; return d === g.day ? gPx2(U.P) : null; },
  };
}
// ---------- 畫面要的 ----------
// { list: [{ id, name, unit, price, open, chg（對開盤 %）, shares 股數, mcap 市值, nav 每股淨值, pb 股價淨值比, mine 持股, value 市值, cost 成本, market 所屬市場 }], index: { v, chg }, halt, rule }
export function gsView(w, house, day, t) {
  const C = gCfg(); if (!C || !C.on || !house) return null;
  gsAdvance(house, day, t); const g = gsFix(house), S = w ? gsWalletFix(w) : null, ids = Object.keys(g.u), sy = w ? gsSync(w, house) : { lines: [] }; // 看畫面時順便領股息、配股
  const list = ids.map(id => { const U = g.u[id], nav = gsNav(house, id), mine = S ? gN(S.h[id]) : 0; return { id, name: gsNameOf(id), fee: gsFeePct() / 100, unit: whName(id), price: Math.round(U.P * 100) / 100, open: Math.round(U.o * 100) / 100, chg: U.o > 0 ? Math.round((U.P / U.o - 1) * 10000) / 100 : 0, shares: U.S, mcap: Math.floor(U.P * U.S), nav: Math.round(nav * 100) / 100, pb: nav > 0 ? Math.round(U.P / nav * 100) / 100 : null, mine, value: Math.floor(mine * U.P), cost: S ? gN(S.cost[id]) : 0, market: wmOfUnit(id), hist: Array.isArray(U.hist) ? U.hist.slice(-30).map(x => Math.round(+x * 100) / 100) : [] }; });
  const ords = S ? S.orders.map(o => ({ no: o.no, kind: o.kind, kindName: gKind[o.kind], id: o.id, name: gsNameOf(o.id), n: o.n, px: o.px, hold: o.hold, day: o.day })) : [], onotes = S ? S.notes.splice(0) : [];
  return { notes: sy.lines.concat(onotes), orders: ords, list, index: { v: gsIndex(house) }, halt: gHalt(g, day, t), rule: `集團的股票：價格由這個世界的買賣和經濟決定。每人持股沒有上限、壹天買賣最多 ${C.dayVolPct}%、每天漲跌停 ±${C.dayLim}%。` };
}
export const gsPrice = (house, id) => { const U = house && gBox(house.gs) && gBox(house.gs.u) ? house.gs.u[id] : null; return U ? U.P : 0; };
