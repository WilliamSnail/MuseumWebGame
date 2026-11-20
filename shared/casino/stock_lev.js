// ================================================================
//  股票的槓桿、放空、當沖、信用等級（11-14，規劃 docs/規劃/經濟體系規劃.md 2.8b、2.8d、2.8e、2.8f、2.8j）。
//  規則先做、還沒接到伺服器和畫面：這個檔是純函式，「今天」「現在幾點」「價格怎麼拿」都從參數來，不碰資料庫和 DOM。
//  不改 casino/stock.js、casino/stock_in.js：價格從 house.stk（台股、美股）和 house.sin（館內五家店）讀，或由呼叫的人給壹個 src（見下）。
//
//  一筆部位（w.lev.pos 的壹項）：
//    { no, id, mk "in"｜"tw"｜"us", side "long"｜"short", lev 倍數, qty 股數, entry 開倉價, notional ＝ qty × entry, margin 保證金,
//      fee 開倉時付的手續費和利息, day 開倉的遊戲日, at 開倉的毫秒, chk 已檢查到第幾個價, px 最後看到的價 }
//  錢怎麼動（守恆，shared/casino/book.js）：
//    開倉：保證金從籌碼搬到 w.lev.hold（錢還是玩家的，記帳算在 bkHeld）；手續費＋利息搬進博物館資金。對手盤沒動。
//    平倉：損益 ＝ 做多 (平倉價 − 開倉價) × 股數；放空 ＝ (開倉價 − 平倉價) × 股數。賠最多賠保證金（不欠莊家、不欠已知世界）。
//      館內股（mk "in"）：對手盤是莊家（casHouseMove "stockLev"）；莊家付的賺、收的賠，壹天的淨賠付算進全館壹天淨賣出上限（規劃 2.8b）。
//      台股（mk "tw"）：對手盤是海外（賺＝casMint "stockLevWin"，賠＝casBurn "stockLevLoss"）；期望值 0，手續費和利息是搬進博物館資金，不是 burn。
//      美股（mk "us"）：跟台股一樣（對手盤是海外）；11-14 翊文決定開放做多、放空，倍數照信用解鎖，部位上限同台股（maxLev.us ＝ 5）。
//      行情落後安全閥（11-14）：台股、美股這檔真實行情落後超過 NUM.casino.stockLev.maxLagMin 分鐘（或這段沒抓到真實價），暫停「新開」槓桿單；已開的部位、平倉、停損停利、強平照常。
//    壞帳（價格跳過強平價、賠超過保證金的那壹段）：沒有人付，只記 house.act.levBadDebt（次數／金額，不是錢）。
//  強制平倉：保證金加浮動損益剩不到原本的 forcePct%（50%），在「第壹個碰到的價」平倉（跳空穿過就用跳空後的價，不是強平價）。
//  當沖：壹律當天結束。市場收盤（台股 13:30、館內 23:30）或日子過了還沒平的，用那天最後壹個價自動平倉（casLevSweep）。
//  信用等級：信用點（w.lev.cr.pts）÷ 5，最高 10 級；只放大部位上限和壹天淨賺上限，不改倍數和手續費。
//
//  價格來源 src（casLevSrc 用莊家的資料做壹個；測試可以自己給）：
//    src.now(id)             → { px 現在的價, idx 現在是第幾個價（跟 path 同壹套編號）, open 現在能交易嗎 }
//    src.path(id, day, from) → day 那天第 from+1 個價起、到「現在」（今天）或「收盤」（以前的日子）的價（陣列，不含未來；不知道就空陣列）
//    src.close(id, day)      → day 那天最後壹個價，不知道給 null
//
//  接線的人看這裡（還沒接）：
//    停損、停利（11-14）：開倉帶 stop、take（價，可不給）；之後 op "levset"（pid 或 no、stop、take）→ casLevSet。掃描時第壹個碰到的價就平倉（跳空穿過用跳空後的價，跟強平壹樣）。
//    開單／平倉 op："open" → casLevOpen(w, house, args, day, t)；"close" → casLevClose(w, house, no, day, t)。
//    每次碰到錢包、換日「之前」（casStockTwSettle／casStockUsSettle／casInRoll 之前）叫 casLevSweep(w, house, day, t)：先強平、再把收盤的自動平倉。
//    畫面：casStockLevView(w, house, day, t)。
// ================================================================
import { NUM } from "../core/config.js";
import { casCreditLevel } from "./credit.js";
import { casTradeLog } from "./trade_log.js";
import { casCount, casHouseCover, casHouseMove, casPoolGain, casWorldIn, casWorldOut } from "./book.js";
import { gsLevBook, gsLevClose, gsLevOk, gsLevSrc, gsLevTrade, gsNameOf } from "./stock_grp.js";
import { casFill, casNum, casPx } from "./core.js";
import { CAS_STOCK_LEV } from "./stock_lev_text.js";
import { IN_IDS, casInAdvance, casInHouseFix, casInIdx, casInPrice, casInSecret, casInSeriesR } from "./stock_in.js";
import { casFeeText, casStockFeePct, casStockHouseFix, casStockIdHalt, stBuyCost, stCents, stPx } from "./stock.js";
import { TW_IDS, US_IDS, twIdx, usIdx } from "../stock/tw.js";
import { IN_STOCKS } from "../stock/in_text.js";
import { OUT_STOCKS } from "../stock/text.js";

const lqP = stPx; // 價：小數兩位（決定 0108）；股數、保證金、損益是整數
const lqBox = v => !!v && typeof v === "object" && !Array.isArray(v);
const lqN = v => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
const lqDay = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const lqT = t => t != null && Number.isFinite(+t);
const lqAdd = (s, n) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const lqC = () => NUM.casino.stockLev;
// 費用照這支的市場（決定 0136）：手續費 casStockFeePct；利息、借券費、當沖稅看 stockLev.byMk，沒寫（館內股、集團股）用預設
const lqFeePct = id => casStockFeePct(id);
const lqMk = id => (TW_IDS.includes(id) ? "tw" : US_IDS.includes(id) ? "us" : null);
const lqRate = (id, k) => { const m = lqMk(id), B = lqC().byMk && m && lqC().byMk[m]; return B && B[k] != null ? B[k] : k === "taxPct" ? 0 : lqC()[k]; };
// 規則那段字裡的費用和限制，全部讀設定（決定 0136；以前寫死 0.5%、0.15%、0.3%、壹天 3 筆、等 15 分鐘，早就跟設定不一樣了）
export function casLevCostText() {
  const C = lqC(), tw = casLevRates(TW_IDS[0]), us = casLevRates(US_IDS[0]), df = casLevRates("in"), grp = casLevRates("grp"), p = v => +(v * 100).toFixed(4) + "%", fee = v => casFeeText(+(v * 100).toFixed(4));
  return `手續費（買賣各收）：台股 ${fee(tw.fee)}、美股 ${fee(us.fee)}、館內股 ${fee(df.fee)}、集團股 ${fee(grp.fee)}。做多另收借的錢每天的利息：台股、美股 ${p(tw.interest)}，館內股和集團股 ${p(df.interest)}；放空另收借券費：台股、美股 ${p(tw.borrow)}，館內股和集團股 ${p(df.borrow)}。` + (tw.tax > 0 ? `台股平倉另收當沖證交稅 ${p(tw.tax)}（進公共機構的稅收）。` : "") + (C.opensDay > 0 ? `壹天最多開 ${C.opensDay} 筆。` : "壹天開幾筆不限。") + (C.coolMin > 0 ? `同壹檔平倉後要等 ${C.coolMin} 分鐘。` : "平倉後馬上可以再開。");
}
export const casLevRates = id => ({ fee: lqFeePct(id) / 100, interest: lqRate(id, "interestPct") / 100, borrow: lqRate(id, "borrowPct") / 100, tax: lqRate(id, "taxPct") / 100 });

// 這支屬於哪個市場："in" 館內五家店、"tw" 台股、"us" 美股，不認得是 null
export function casLevMarket(id) {
  if (IN_IDS.includes(id)) return "in";
  if (gsLevOk(id)) return "grp"; // 世界集團的股票（決定 0124）：莊家當對手盤，槓桿單照現股推價
  if (TW_IDS.includes(id)) return "tw";
  if (US_IDS.includes(id)) return "us";
  return null;
}
const lqName = id => { if (gsLevOk(id)) return gsNameOf(id); const d = IN_STOCKS.find(s => s.id === id) || OUT_STOCKS.find(s => s.id === id); return d ? d.name : id; };

// ---------- 補欄位 ----------
export function casLevFix(w, day) {
  if (!lqBox(w.lev)) w.lev = { pos: [], seq: 0, hold: 0, opens: { day: null, n: 0 }, last: {}, net: { day: null, n: 0 }, gain: 0, fee: 0, cr: { pts: 0, day: null, ok: null, late: null }, notes: [] };
  const S = w.lev;
  // 就地補（不換物件：呼叫的人手上拿著的 pos 還是同壹個）
  S.pos = (Array.isArray(S.pos) ? S.pos : []).filter(lqBox).map(p => Object.assign(p, {
    no: lqN(p.no), mk: casLevMarket(p.id), side: p.side === "short" ? "short" : "long", lev: Math.max(1, lqN(p.lev)), qty: lqN(p.qty), entry: lqP(p.entry), notional: lqN(p.notional),
    margin: lqN(p.margin), fee: lqN(p.fee), day: lqDay(p.day) ? p.day : null, at: p.at == null ? null : lqN(p.at), chk: lqN(p.chk), peg: lqN(p.peg), px: lqP(p.px) || lqP(p.entry), stop: lqP(p.stop) || null, take: lqP(p.take) || null }))
    .filter(p => p.mk && p.qty > 0 && p.entry > 0 && p.margin > 0 && p.day);
  S.seq = lqN(S.seq);
  S.hold = S.pos.reduce((a, p) => a + p.margin, 0); // 永遠由部位算出來，不會對不上
  if (!lqBox(S.opens)) S.opens = { day: null, n: 0 };
  S.opens.day = lqDay(S.opens.day) ? S.opens.day : null; S.opens.n = lqN(S.opens.n);
  if (!lqBox(S.last)) S.last = {};
  for (const k of Object.keys(S.last)) { if (casLevMarket(k) && lqN(S.last[k]) > 0) S.last[k] = lqN(S.last[k]); else delete S.last[k]; }
  if (!lqBox(S.net)) S.net = { day: null, n: 0 };
  S.net.day = lqDay(S.net.day) ? S.net.day : null; S.net.n = Number.isFinite(+S.net.n) ? Math.floor(+S.net.n) : 0; // 可以是負的
  S.gain = Number.isFinite(+S.gain) ? Math.floor(+S.gain) : 0;
  S.fee = lqN(S.fee);
  if (!lqBox(S.cr)) S.cr = { pts: 0, day: null, ok: null, late: null };
  S.cr.pts = lqN(S.cr.pts); S.cr.day = lqDay(S.cr.day) ? S.cr.day : null;
  S.cr.ok = S.cr.ok == null ? null : lqN(S.cr.ok); S.cr.late = S.cr.late == null ? null : lqN(S.cr.late);
  S.owed = (Array.isArray(S.owed) ? S.owed : []).filter(lqBox).map(e => ({ day: lqDay(e.day) ? e.day : null, amt: lqN(e.amt) })).filter(e => e.day && e.amt > 0).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  S.notes = (Array.isArray(S.notes) ? S.notes : []).filter(x => typeof x === "string").slice(-8);
  if (day) casLevCredit(w, day);
  return S;
}
// 莊家：館內股的槓桿＋放空部位合計（曝險上限看這個）。house.lev ＝ { in: 部位合計 }
export function casLevHouseFix(house) {
  if (!lqBox(house.lev)) house.lev = { in: 0, grp: 0 };
  house.lev.in = lqN(house.lev.in); house.lev.grp = lqN(house.lev.grp); // grp：集團股槓桿部位合計（換日歸 0，部位都是當天的）
  return house.lev;
}

// ---------- 信用等級（規劃 2.8b：用「準時」換，不是用「天天來」換） ----------
// 信用點來源：w.loan.ok（準時還款的次數）增加 → 那天 +1；w.loan.late（逾期的次數）增加 → 每次 −3。壹天最多 +1。
// 定存到期、館債到期這兩種沒有現成的計數，由接線的人在事件發生時叫 casLevCreditAdd(w, day)（同壹天只算壹次）。
// 第壹次碰到時把 ok、late 當作起點，之前的不補算（點數從 0 開始）。
export function casLevCreditAdd(w, day) {
  const S = casLevFix(w), K = lqC().credit;
  if (!lqDay(day) || S.cr.day === day) return 0;
  S.cr.day = day; S.cr.pts += K.dayGain;
  return K.dayGain;
}
export function casLevCredit(w, day) {
  const S = w.lev, K = lqC().credit, L = lqBox(w.loan) ? w.loan : {};
  const ok = lqN(L.ok), late = lqN(L.late);
  if (S.cr.ok == null || S.cr.late == null) { S.cr.ok = ok; S.cr.late = late; return S.cr.pts; }
  if (late > S.cr.late) S.cr.pts = Math.max(0, S.cr.pts - K.lateLoss * (late - S.cr.late));
  if (ok > S.cr.ok && lqDay(day) && S.cr.day !== day) { S.cr.day = day; S.cr.pts += K.dayGain; }
  S.cr.ok = ok; S.cr.late = late;
  return S.cr.pts;
}
export const casLevLevel = w => { casLevFix(w); return casCreditLevel(w); }; // 等級怎麼算寫在 casino/credit.js（賣出上限也用它）
const lqScale = level => (100 + lqC().stepPct * level) / 100;
export const casLevPosLimit = level => Math.floor(lqC().posLimit * lqScale(level));
export const casLevProfitCap = level => Math.floor(lqC().profitCap * lqScale(level));
// 信用等級對應的倍數上限（11-14，翊文：「新手 2 倍，信用升級解鎖」）：NUM.casino.stockLev.levByCredit ＝ [[等級, 倍數], …]，取「等級 ≥ 門檻」裡最大的門檻那列
export const casLevCreditCap = level => { let cap = 1; for (const [lv, m] of (lqC().levByCredit || [[0, 5]])) if (level >= lv) cap = m; return cap; };
// 下一個倍數解鎖：{ level 幾級, lev 幾倍 } 或 null（已經是最高）
export const casLevNextUnlock = level => { const cur = casLevCreditCap(level); const nx = (lqC().levByCredit || []).filter(([lv, m]) => lv > level && m > cur).sort((a, b) => a[0] - b[0])[0]; return nx ? { level: nx[0], lev: nx[1] } : null; };
// 這個市場、這個信用等級最多幾倍：市場上限（maxLev）和信用等級上限（levByCredit）取小的。不給 level ＝ 只看市場
export const casLevMaxLev = (mk, level) => { const m = Math.max(0, lqN((lqC().maxLev || {})[mk])); return level == null ? m : Math.min(m, casLevCreditCap(level)); };

// ---------- 一筆部位的算術（全部用整數比較，沒有浮點的邊界問題） ----------
const lqSide = s => (s === "short" || s === "空" ? "short" : s === "long" || s === "多" ? "long" : null);
// 損益 ＝ 價差（用「分」算）× 股數，四捨五入到整數籌碼（決定 0108：賺賠對稱的四捨五入，不偏玩家也不偏已知世界）
export const casLevPnl = (p, px) => Math.round((p.side === "long" ? stCents(px) - stCents(p.entry) : stCents(p.entry) - stCents(px)) * p.qty / 100);
export const casLevEquity = (p, px) => p.margin + casLevPnl(p, px);
// 碰到強制平倉了嗎：保證金加損益 ≤ 原本保證金的 forcePct%
export const casLevHit = (p, px) => casLevEquity(p, px) * 100 <= p.margin * lqC().forcePct;
// 強制平倉價（顯示用）：做多是「碰到就平倉」的最高價，放空是最低價
export function casLevLiqPx(p) {
  const f = lqC().forcePct / 100, hit = c => casLevHit(p, c / 100), e = stCents(p.entry); // 用「分」找（價是小數兩位）
  if (p.side === "long") { let x = Math.floor(e - f * p.margin / p.qty * 100); while (x + 1 < e && hit(x + 1)) x++; while (x > 0 && !hit(x)) x--; return Math.max(0, x) / 100; }
  let x = Math.ceil(e + f * p.margin / p.qty * 100); while (x - 1 > e && hit(x - 1)) x--; while (!hit(x)) x++;
  return x / 100;
}
// 維持率（%）：保證金加損益 ÷ 原本的保證金。開倉是 100，到 forcePct（50）強平
export const casLevMaint = (p, px) => Math.round(casLevEquity(p, px) / p.margin * 100);
// 停損、停利（11-14，規劃 2.8j）：p.stop、p.take 是價（沒設是 null）。做多：跌到 stop 以下停損、漲到 take 以上停利；放空相反。
// 碰到的判斷全用整數比較。同壹個價同時碰到強平和停損（跳空穿過兩個），算強平（最壞的那個說法），成交價都一樣是那個價
export function casLevTrig(p, px) {
  if (casLevHit(p, px)) return "liq";
  const L = p.side === "long";
  if (p.stop > 0 && (L ? px <= p.stop : px >= p.stop)) return "stop";
  if (p.take > 0 && (L ? px >= p.take : px <= p.take)) return "take";
  return null;
}
// 盤中檢查：給壹串價（開倉之後依序的價），回傳第壹個碰到強平的 { hit: true, k, px }，沒有就 { hit: false }。跳空穿過就是跳空後的那個價
export function casLevCheck(p, path) {
  for (let k = 0; k < (path || []).length; k++) { const why = casLevTrig(p, path[k]); if (why) return { hit: true, k, px: path[k], why }; }
  return { hit: false };
}

// ---------- 價格來源：用莊家的資料做 src ----------
// 館內五家店：idx ＝ 第幾個 15 分鐘價（0 ＝ 05:00）；台股、美股：idx ＝ 距離開盤那壹刻的分鐘（跟 house.stk.tw／us 的 ser 同壹套）
export function casLevSrc(house, day, t, secret = casInSecret()) {
  casInAdvance(house, day, t, secret); // 館內股的價是推出來的：先推到現在（還沒換日就把昨天走完）
  const SH = casStockHouseFix(house), IH = casInHouseFix(house), C = NUM.casino.stockIn;
  const arrOf = (mk, id, d) => { // 台股、美股 d 那天盤中每分鐘的價：{ arr, from }
    const T = SH[mk];
    if (T && T.day === d && T.ser && Array.isArray(T.ser[id]) && T.ser[id].length) return { arr: T.ser[id], from: lqN(T.from) };
    if (T && T.past && T.past[d] && Array.isArray(T.past[d][id])) return { arr: T.past[d][id], from: lqN(T.pastFrom && T.pastFrom[d]) };
    return null;
  };
  const inSer = id => casInSeriesR(IH, IH.open[id], IH.day, id, secret);
  const GS = gsLevSrc(house, day, t);
  return {
    now(id) {
      const mk = casLevMarket(id);
      if (mk === "grp") return GS.now(id);
      if (mk === "in") {
        const pr = casInPrice(house, id, day, t, secret), ready = IH.day === day, idx = casInIdx(t);
        return { px: pr.px, idx: idx === null ? (lqT(t) ? C.ticks - 1 : 0) : idx, open: ready && !pr.halted };
      }
      if (mk === "tw" || mk === "us") {
        const T = SH[mk], a = T && T.day === day && T.ser && Array.isArray(T.ser[id]) ? T.ser[id] : null;
        const m = lqT(t) ? (mk === "tw" ? twIdx(t) : usIdx(t, day)) : null;
        const lg = T && T.day === day && T.lag ? T.lag[id] : null;
        return { px: SH.px[id], idx: a && a.length ? lqN(T.from) + a.length - 1 : lqN(m), open: !casStockIdHalt(house, id, day, t), lag: Number.isFinite(+lg) && lg !== null ? +lg : null, stale: !!(T && T.day === day && T.stale && T.stale[id]) };
      }
      return { px: 0, idx: 0, open: false };
    },
    path(id, d, from) {
      const mk = casLevMarket(id);
      if (mk === "grp") return GS.path(id, d, from);
      if (mk === "in") {
        const ser = IH.day === d ? inSer(id) : IH.pre && IH.pre.day === d && IH.pre.open[id] > 0 ? casInSeriesR(IH, IH.pre.open[id], d, id, secret) : null; // 前壹天的開盤價莊家還記著（IH.pre）；更早的不知道，不編
        if (!ser) return [];
        const upto = d < day ? ser.length - 1 : (lqT(t) ? (casInIdx(t) === null ? ser.length - 1 : casInIdx(t)) : -1);
        return ser.slice(from + 1, upto + 1);
      }
      if (mk === "tw" || mk === "us") {
        const r = arrOf(mk, id, d);
        return r ? r.arr.slice(Math.max(0, from + 1 - r.from)) : [];
      }
      return [];
    },
    close(id, d) {
      const mk = casLevMarket(id);
      if (mk === "grp") return GS.close(id, d);
      if (mk === "in") {
        if (IH.day === d) return inSer(id)[C.ticks - 1];
        if (IH.pre && IH.pre.day === d && IH.pre.open[id] > 0) return casInSeriesR(IH, IH.pre.open[id], d, id, secret)[C.ticks - 1];
        if (lqDay(d) && IH.day === lqAdd(d, 1) && IH.close[id] > 0) return IH.close[id]; // 已經換日：莊家記著前壹天的收盤
        return null;
      }
      if (mk === "tw" || mk === "us") { const r = arrOf(mk, id, d); return r ? r.arr[r.arr.length - 1] : null; }
      return null;
    },
  };
}

// ---------- 停損、停利的設定檢查 ----------
// 價的輸入：沒給／空字串／0／null ＝ 沒設（null）；不是正整數回 undefined（看不懂）
const lqPxArg = v => { if (v == null || v === "" || v === 0 || v === "0") return null; const n = lqP(Number(String(v).replace(/[,，s]/g, ""))); return n >= 0.01 ? n : undefined; };
// 檢查壹組 stop、take（都可以是 null）。ref ＝ 參考價（開倉時是開倉價，之後改是現價）。回傳 null ＝ 合格，不然原因。
// 規則：做多要「停損 < 參考價 < 停利」，放空相反（停利 < 參考價 < 停損）；停損一定要比強制平倉價更靠近參考價（不然會先被強平，等於沒設，直接拒絕）
function lqStopWhy(pos, ref, stop, take) {
  const T = CAS_STOCK_LEV, L = pos.side === "long";
  if (stop === undefined || take === undefined) return T.stopBad;
  if (stop != null && !(L ? stop < ref : stop > ref)) return casFill(L ? T.stopLong : T.stopShort, { px: casPx(ref) });
  if (take != null && !(L ? take > ref : take < ref)) return casFill(L ? T.takeLong : T.takeShort, { px: casPx(ref) });
  if (stop != null) { const liq = casLevLiqPx(pos); if (L ? stop <= liq : stop >= liq) return casFill(T.stopLiq, { liq: casPx(liq) }); }
  return null;
}
const lqStopText = (stop, take) => casFill(CAS_STOCK_LEV.stopSet, { stop: stop ? casPx(stop) : CAS_STOCK_LEV.unset, take: take ? casPx(take) : CAS_STOCK_LEV.unset });

// ---------- 開倉 ----------
const lqOpenPos = S => S.pos.reduce((a, p) => a + p.notional, 0);
const lqCostOf = (side, notional, margin, id) => {
  const fee = Math.ceil(notional * lqFeePct(id) / 100); // 手續費：算部位
  const carry = side === "long" ? Math.ceil((notional - margin) * lqRate(id, "interestPct") / 100) : Math.ceil(notional * lqRate(id, "borrowPct") / 100); // 做多：借的錢的利息；放空：借券費
  return { fee, carry, total: fee + carry };
};
const lqHouseCap = house => (house.bankroll > 0 ? Math.max(lqC().houseFloor, Math.floor(house.bankroll * lqC().houseExposePct / 100)) : 0);
// 現在能開單嗎（不管哪一檔）：回 null ＝ 可以，不然回原因。逾期欠款、錢包是負的都不行
const lqDebtWhy = (w, day) => ((w.chips < 0 || (lqBox(w.loan) && Array.isArray(w.loan.list) && w.loan.list.some(x => lqDay(day) && day > x.due))) ? CAS_STOCK_LEV.debt : null);

// 行情落後安全閥：台股、美股這檔的真實行情落後超過 maxLagMin 分鐘、或這段沒抓到真實價 → 回原因（暫停新開）；否則 null。館內股沒有外面的行情，不受影響
export const casLevLagWhy = nw => {
  if (!nw || (nw.lag == null && !nw.stale)) return null;
  const max = lqN(lqC().maxLagMin);
  return max > 0 && (nw.stale || nw.lag > max) ? casFill(CAS_STOCK_LEV.lag, { n: max }) : null;
};
// args：{ id, side "long"｜"short", lev, qty, stop, take（停損價、停利價，可以不給）}（也收 dir、margin：給 margin 沒給 qty 時，股數 ＝ 保證金 × 倍數 ÷ 價 無條件捨去）。回傳 { ok, pos, lines } 或 { ok:false, reason }
// 給保證金開倉時的整股算法（畫面的確認單也用這個，11-14 測試：畫面以前寫保證金 10 萬、部位 20 萬，伺服器股數要整股，實際只開 6 股、扣 8.64 萬）：
//   股數 ＝ 保證金 × 倍數 ÷ 價 無條件捨去；部位 ＝ 股數 × 價；保證金 ＝ 部位 ÷ 倍數 進位
export function casLevSizeOf(margin, lev, px) {
  const L = Math.floor(+lev), P = lqP(px), M = Math.floor(+margin);
  const qty = L >= 1 && P > 0 && M > 0 ? Math.floor(M * L * 100 / stCents(P)) : 0, notional = stBuyCost(P, qty); // 部位 ＝ 股數 × 價，進位到整數籌碼
  return { qty, notional, margin: L >= 1 ? Math.ceil(notional / L) : 0 };
}
export function casLevOpen(w, house, args, day, t, src) {
  const C = lqC(), T = CAS_STOCK_LEV, A = args || {}, S = casLevFix(w, day);
  src = src || casLevSrc(house, day, t);
  const id = A.id, mk = casLevMarket(id), side = lqSide(A.side || A.dir);
  if (!mk || !side || !lqDay(day)) return { ok: false, reason: T.bad };
  const marketMax = casLevMaxLev(mk), maxLev = casLevMaxLev(mk, casLevLevel(w));
  if (marketMax <= 0) return { ok: false, reason: T.off };
  const lev = Math.floor(+A.lev);
  if (Number.isFinite(lev) && lev > maxLev && lev <= marketMax) { const nx = casLevNextUnlock(casLevLevel(w)); return { ok: false, reason: casFill(T.levCredit, { max: maxLev, level: casLevLevel(w), next: nx ? casFill(T.levNext, { level: nx.level, lev: nx.lev }) : "" }) }; }
  if (!Number.isFinite(lev) || lev < 1 || lev > maxLev) return { ok: false, reason: casFill(T.levBad, { max: maxLev }) };
  const nw = src.now(id);
  if (!nw || !nw.open || !(nw.px > 0)) return { ok: false, reason: T.halt };
  if (mk === "tw" && lqT(t) && twIdx(t) >= NUM.casino.stock.tw.noOpenIdx && twIdx(t) <= NUM.casino.stock.tw.len) return { ok: false, reason: T.closeAuction };
  const lagWhy = mk === "in" || mk === "grp" ? null : casLevLagWhy(nw); if (lagWhy) return { ok: false, reason: lagWhy };
  let px = lqP(nw.px);
  let qty = Math.floor(+A.qty);
  if (!(qty > 0) && A.margin != null) qty = casLevSizeOf(A.margin, lev, px).qty;
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: T.qtyBad };
  if (mk === "grp") { const dr = gsLevTrade(house, id, side === "long" ? 1 : -1, qty, day, t, { dry: true }); if (!dr.ok) return { ok: false, reason: dr.reason }; px = lqP(dr.px); } // 集團股：成交價 ＝ 推價的均價加半價差（先試算，過了所有檢查才真的推）
  const why = lqDebtWhy(w, day); if (why) return { ok: false, reason: why };
  const opensToday = S.opens.day === day ? S.opens.n : 0;
  if (C.opensDay > 0 && opensToday >= C.opensDay) return { ok: false, reason: casFill(T.opens, { n: C.opensDay }) }; // opensDay 0＝不限（11-19 翊文取消）
  if (lqT(t) && S.last[id] && +t - S.last[id] < C.coolMin * 60000) return { ok: false, reason: casFill(T.cool, { n: Math.max(1, Math.ceil((C.coolMin * 60000 - (+t - S.last[id])) / 60000)) }) };
  const notional = stBuyCost(px, qty), margin = Math.ceil(notional / lev), level = casLevLevel(w), limit = casLevPosLimit(level), used = lqOpenPos(S);
  if (used + notional > limit) return { ok: false, reason: casFill(T.posLimit, { limit: casNum(limit), level, used: casNum(used), add: casNum(notional) }) };
  const H = mk === "in" || mk === "grp" ? casLevHouseFix(house) : null;
  if (H) {
    if (!(house.bankroll > 0)) return { ok: false, reason: T.houseBroke };
    if (H[mk] + notional > lqHouseCap(house)) return { ok: false, reason: T.exposed };
  }
  const cost = lqCostOf(side, notional, margin, id);
  if (w.chips < margin + cost.total) return { ok: false, reason: casFill(T.poor, { need: casNum(margin + cost.total), margin: casNum(margin), fee: casNum(cost.total) }) };
  // 停損停利可以用 % 給（stopPct、takePct）：照實際成交價（px）算，不用畫面上的價（11-19 翊文：「虧 3% 就賣」實際要是 3%）
  const pctPx = (pct, up) => { const v = +pct; return Number.isFinite(v) && v > 0 ? Math.round(px * (up ? 1 + v / 100 : 1 - v / 100) * 100) / 100 : null; };
  const stop = A.stopPct != null ? pctPx(A.stopPct, side === "short") : lqPxArg(A.stop), take = A.takePct != null ? pctPx(A.takePct, side !== "short") : lqPxArg(A.take);
  const probe = { side, entry: px, qty, margin }, sWhy = lqStopWhy(probe, px, stop, take); // 停損停利有問題就整張單不開
  if (sWhy) return { ok: false, reason: sWhy };
  // 成交
  if (mk === "grp") { const rr = gsLevTrade(house, id, side === "long" ? 1 : -1, qty, day, t); if (!rr.ok) return { ok: false, reason: rr.reason }; gsLevBook(house, id, side === "long" ? qty : -qty); }
  w.chips -= margin + cost.total;
  house.budget += cost.total; casCount(house, "levFee", cost.total); // 手續費和利息搬進博物館資金（不是 burn）
  S.seq += 1;
  const pos = { no: S.seq, id, mk, side, lev, qty, entry: px, notional, margin, fee: cost.total, day, at: lqT(t) ? +t : null, chk: lqN(nw.idx), peg: lqN(casStockHouseFix(house).peg.seq), px, stop, take };
  S.pos.push(pos); S.hold += margin; S.fee += cost.total;
  S.opens = { day, n: opensToday + 1 };
  if (H) H[mk] += notional;
  casCount(house, "levOpen");
  casTradeLog(w, { d: day, t: +t || 0, id, m: mk === "in" ? "i" : mk === "grp" ? "g" : "o", a: "lo", n: qty, p: px, f: cost.total, y: side === "long" ? "l" : "s", v: lev, mk });
  return { ok: true, pos, cost, lines: [casFill(T.openOk, { name: lqName(id), side: side === "long" ? T.long : T.short, lev, qty: casNum(qty), px: casPx(px), margin: casNum(margin), fee: casNum(cost.total), liq: casPx(casLevLiqPx(pos)) }) + (stop || take ? " " + lqStopText(stop, take) : "")] };
}

// ---------- 結算壹筆（平倉、強平、收盤自動平倉共用） ----------
// why："close"｜"liq"｜"stop"｜"take"｜"flat"。回傳 { px, pnl 實際算的損益（含賠到保證金為止、賺有上限）, back 拿回的籌碼, fee 平倉手續費, bad 壞帳, clipped 超過上限沒給的 }
function lqSettle(w, house, S, pos, px, t, why) {
  const T = CAS_STOCK_LEV, C = lqC(), grp = pos.mk === "grp", hp = grp || pos.mk === "in", src = grp ? "gLev" : "stockLev";
  const gsDay = grp && house.gs ? house.gs.day : null;
  if (grp && pos.day === gsDay) { const cpx = gsLevClose(house, pos.id, pos.side === "long" ? pos.qty : -pos.qty, pos.day, gsDay, t); if (why === "close" && cpx > 0) px = lqP(cpx); } // 集團股：今天的部位平倉、強平也推價（強平照第一個碰到的價結算，手動平倉照推價的成交價）；莊家庫存還原
  const raw = casLevPnl(pos, px);
  let eff = Math.max(raw, -pos.margin); // 賠最多賠保證金
  const bad = raw < -pos.margin ? -pos.margin - raw : 0;
  let clipped = 0, owe = 0;
  const IH = pos.mk === "in" ? casInHouseFix(house) : null;
  const hn = IH && !(IH.net.day > pos.day) ? (IH.net.day === pos.day ? IH.net.n : 0) : null; // 莊家今天的淨賠付；null ＝ 已經是更晚的日子，不算
  if (eff > 0) {
    // 壹天淨賺上限（跟信用有關）
    if (S.net.day !== pos.day) S.net = { day: pos.day, n: 0 };
    let room = Math.max(0, casLevProfitCap(casLevLevel(w)) - S.net.n);
    // 館內股：莊家壹天淨賠付上限（規劃 2.8a 第 7 條，跟股票的賣出共用壹個數）。H.net 已經是更晚的日子（換日後才結算）就不算
    clipped = Math.max(0, eff - room); eff = Math.min(eff, room); // 自己的壹天淨賺上限：多的不給
    if (grp) { // 集團股：莊家不夠付先跟博物館資金借（決定 0122 同壹個函式），還不夠就少給（沒有隔天補發）
      const bank = Math.max(0, Math.floor(house.bankroll)); if (eff > bank) { const cv = casHouseCover(house, NUM.casino.gstock.cover.pct, NUM.casino.gstock.cover.max); cv.take(eff - bank); }
      const bank2 = Math.max(0, Math.floor(house.bankroll)); if (eff > bank2) { clipped += eff - bank2; eff = bank2; }
    }
    if (hn !== null) { // 莊家壹天淨賠付上限：多的不是不給，記成欠條，之後的日子有空間再補發（11-14，翊文：隔天補發）
      const hroom = house.bankroll > 0 ? Math.max(0, Math.floor(house.bankroll * NUM.casino.stock.netSellPct / 100) + NUM.casino.stock.netSellFlat - hn) : 0;
      owe = Math.max(0, eff - hroom); eff = Math.min(eff, hroom); clipped += owe;
      if (owe > 0) { const e = S.owed.find(x => x.day === pos.day); if (e) e.amt += owe; else S.owed.push({ day: pos.day, amt: owe }); S.owed.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)); }
    }
  }
  if (S.net.day !== pos.day) S.net = { day: pos.day, n: 0 };
  S.net.n += eff;
  if (hn !== null) IH.net = { day: pos.day, n: hn + eff };
  // 錢：先把保證金放回籌碼，再跟對手盤算損益，最後扣平倉手續費
  w.chips += pos.margin;
  if (eff > 0) { if (hp) { casHouseMove(house, src, -eff); w.chips += eff; } else casWorldOut(w, house, "stockLevWin", eff, NUM.casino.world); }
  else if (eff < 0) { if (hp) { casHouseMove(house, src, -eff); w.chips += eff; } else casWorldIn(w, house, "stockLevLoss", -eff); }
  const equity = pos.margin + eff, feeDue = Math.ceil(stBuyCost(px, pos.qty) * lqFeePct(pos.id) / 100), fee = Math.min(feeDue, Math.max(0, equity));
  w.chips -= fee; house.budget += fee; casCount(house, "levFee", fee);
  // 當沖證交稅（決定 0136，台股 0.15%：平倉的部位金額 × 稅率，無條件進位、最少 1；美股、館內股、集團股沒有）：從剩下的保證金扣，扣不到就少收，進公共機構的稅收
  const taxRate = lqRate(pos.id, "taxPct"), taxDue = taxRate > 0 ? Math.max(1, Math.ceil(stBuyCost(px, pos.qty) * taxRate / 100)) : 0, tax = Math.min(taxDue, Math.max(0, equity - fee));
  if (tax > 0) { w.chips -= tax; casPoolGain(house, "gov", "stockTax", tax); casCount(house, "levTax", tax); }
  const back = equity - fee - tax;
  if (bad > 0) casCount(house, "levBadDebt", bad);
  if (IH) { const H = casLevHouseFix(house); H.in = Math.max(0, H.in - pos.notional); }
  if (grp && pos.day === gsDay) { const H = casLevHouseFix(house); H.grp = Math.max(0, H.grp - pos.notional); }
  S.pos = S.pos.filter(p => p !== pos);
  S.hold = S.pos.reduce((a, p) => a + p.margin, 0);
  S.gain += eff - fee - tax - pos.fee; S.fee += fee;
  if (lqT(t)) S.last[pos.id] = +t;
  casCount(house, "levClose");
  const sideW = pos.side === "long" ? T.long : T.short;
  const out = { px, pnl: eff, back, fee, tax, bad, clipped, why };
  casTradeLog(w, { d: pos.day, t: lqT(t) ? +t : 0, id: pos.id, m: pos.mk === "in" ? "i" : pos.mk === "grp" ? "g" : "o", a: "lc", n: pos.qty, p: px, f: fee, x: tax, g: eff - fee - tax - pos.fee, y: pos.side === "long" ? "l" : "s", v: pos.lev, w: why, mk: pos.mk });
  if (why === "liq") S.notes.push(casFill(T.liqNote, { name: lqName(pos.id), side: sideW, px: casPx(px), back: casNum(back) }));
  if (why === "stop") S.notes.push(casFill(T.stopNote, { name: lqName(pos.id), side: sideW, px: casPx(px), back: casNum(back) }));
  if (why === "take") S.notes.push(casFill(T.takeNote, { name: lqName(pos.id), side: sideW, px: casPx(px), back: casNum(back) }));
  if (why === "flat") S.notes.push(casFill(T.flatNote, { name: lqName(pos.id), side: sideW, px: casPx(px), back: casNum(back) }));
  if (clipped - owe > 0) S.notes.push(casFill(T.capNote, { over: casNum(clipped - owe) }));
  if (owe > 0) S.notes.push(casFill(T.owedNote, { over: casNum(owe) }));
  S.notes = S.notes.slice(-8);
  out.owed = owe;
  return out;
}

// ---------- 隔天補發（11-14，翊文：館內股賺的超過莊家壹天淨賠付上限，多的記欠條，之後有空間再補發） ----------
// w.lev.owed ＝ [{ day 那筆平倉的日子, amt 還欠多少 }]，舊的在前。欠條是莊家欠玩家的承諾，不是錢：還沒付之前不算玩家的錢（casBookGap 看不到，莊家的錢也還在莊家那邊）。
// 每次碰到錢包叫壹次（casLevSweep 開頭）：只付「日子比今天早」的，從最舊的開始，付到今天的全館淨賠付上限用完、莊家的錢不夠（莊家 ≤ 0 不付）為止，可以只付壹部分。
// 補發的錢算進莊家今天的淨賠付（跟股票賣出共用壹個數），但不算玩家自己的壹天淨賺上限（那個上限是開倉那天的事）。回傳這次付了多少
export function casLevPayOwed(w, house, day) {
  const S = casLevFix(w), T = CAS_STOCK_LEV;
  if (!S.owed.length || !lqDay(day) || !(house.bankroll > 0)) return 0;
  const IH = casInHouseFix(house), hn = IH.net.day === day ? IH.net.n : (IH.net.day && IH.net.day > day ? null : 0);
  if (hn === null) return 0;
  let room = Math.min(Math.floor(house.bankroll), Math.floor(house.bankroll * NUM.casino.stock.netSellPct / 100) + NUM.casino.stock.netSellFlat - hn), paid = 0;
  for (const e of S.owed) {
    if (!(e.day < day) || room <= 0) continue;
    const n = Math.min(e.amt, room);
    e.amt -= n; room -= n; paid += n;
  }
  S.owed = S.owed.filter(e => e.amt > 0);
  if (paid > 0) {
    casHouseMove(house, "stockLev", -paid); w.chips += paid; IH.net = { day, n: hn + paid };
    S.gain += paid; casCount(house, "levOwedPaid", paid);
    S.notes.push(casFill(T.paidNote, { paid: casNum(paid), left: S.owed.length ? casFill(T.paidLeft, { left: casNum(S.owed.reduce((a, e) => a + e.amt, 0)) }) : "" })); S.notes = S.notes.slice(-8);
  }
  return paid;
}

// ---------- 掃描：強制平倉、收盤自動平倉 ----------
// 每次碰到錢包（在換日、casStockTwSettle／casStockUsSettle／casInRoll 之前）叫壹次。價格走過的路（src.path）逐個價檢查，碰到強平就用那個價平倉；
// 然後這支如果已經收盤（今天還沒收盤的不動）、或是日子過了，用那天最後壹個價自動平倉。回傳平掉的 [{ pos, ...結算 }]
// 配股息和槓桿（決定 0112）：槓桿部位一律當天結束（收盤、或換日用那天最後一個價自動平倉），不會跨過除息日，所以不用調整進場價；
// 要是以後開放隔夜部位，除息日要把進場價、停損停利減一個股利、除權日價格除以配股比（不能放在這個 sweep 開頭：換日平倉用的是除息前的價）。
export function casLevSweep(w, house, day, t, src) {
  const S = casLevFix(w, day), out = [];
  casLevPayOwed(w, house, day);
  src = src || casLevSrc(house, day, t);
  for (const pos of S.pos.slice()) {
    // 價位換成真實比例（規劃 2.8h，house.stk.peg.ev）時還有這檔的部位：之後的價是新的比例，不能跟開倉價比。保守做法：用換之前最後看到的價平倉
    if (pos.mk !== "in" && pos.mk !== "grp" && casStockHouseFix(house).peg.ev.some(e => e.id === pos.id && e.seq > pos.peg)) { out.push(Object.assign({ pos }, lqSettle(w, house, S, pos, pos.px, t, "flat"))); continue; }
    const path = src.path(pos.id, pos.day, pos.chk) || [];
    const h = casLevCheck(pos, path);
    if (h.hit) { out.push(Object.assign({ pos }, lqSettle(w, house, S, pos, h.px, t, h.why))); continue; }
    pos.chk += path.length;
    if (path.length) pos.px = path[path.length - 1];
    const nw = src.now(pos.id), stale = lqDay(day) && pos.day < day, closed = stale || (lqT(t) && nw && !nw.open);
    if (pos.mk === "grp" && !closed && nw && nw.px > 0) { const why = casLevTrig(pos, nw.px); if (why) { out.push(Object.assign({ pos }, lqSettle(w, house, S, pos, nw.px, t, why))); continue; } } // 集團股：除了每 15 分鐘的價，現價（被別人推過的）也檢查
    if (!closed) { if (!stale && nw && nw.px > 0) pos.px = nw.px; continue; }
    const cp = src.close(pos.id, pos.day), px = cp > 0 ? cp : pos.px; // 收盤價不知道（隔了很久沒碰）：用最後看到的價
    out.push(Object.assign({ pos }, lqSettle(w, house, S, pos, px, t, casLevTrig(pos, px) || "flat")));
  }
  return out;
}

// ---------- 平倉 ----------
// 玩家按平倉：先掃描（該強平、該收盤的先處理），還在的話用現在的價平倉。休市中的不能按（收盤時會自動平）
export function casLevClose(w, house, no, day, t, src) {
  const T = CAS_STOCK_LEV, S = casLevFix(w, day);
  src = src || casLevSrc(house, day, t);
  const had = S.pos.find(p => p.no === lqN(no));
  if (!had) return { ok: false, reason: T.none };
  const swept = casLevSweep(w, house, day, t, src), done = swept.find(r => r.pos === had);
  if (done) return { ok: true, auto: done.why, px: done.px, pnl: done.pnl, back: done.back, fee: done.fee, lines: [S.notes[S.notes.length - 1]] };
  const nw = src.now(had.id);
  if (!nw || !nw.open || !(nw.px > 0)) return { ok: false, reason: T.closeHalt };
  const r = lqSettle(w, house, S, had, nw.px, t, "close"), sideW = had.side === "long" ? T.long : T.short;
  return Object.assign({ ok: true }, r, { lines: [casFill(T.closeOk, { name: lqName(had.id), side: sideW, px: casPx(r.px), pnlWord: r.pnl > 0 ? T.winWord : r.pnl < 0 ? T.loseWord : T.evenWord, pnl: casNum(Math.abs(r.pnl)), back: casNum(r.back), fee: casNum(r.fee), taxText: r.tax > 0 ? "，當沖證交稅 " + casNum(r.tax) : "" })] });
}

// ---------- 改停損、停利 ----------
// args：{ no（或 pid "p3"）, stop, take }。沒給的欄位（undefined）不動；給 null、0、空字串 ＝ 清掉。
// 先掃描（該強平、停損、停利、收盤的先處理）；還在的話用「現價」當參考價檢查（做多 停損 < 現價 < 停利）；休市中不能改（不然收盤後看著行情改就是偷看）。新的價只管「之後」的價
export function casLevSet(w, house, args, day, t, src) {
  const T = CAS_STOCK_LEV, A = args || {}, S = casLevFix(w, day);
  src = src || casLevSrc(house, day, t);
  const no = A.no != null ? lqN(A.no) : lqN(casLevPidNo(A.pid));
  const had = S.pos.find(p => p.no === no);
  if (!had) return { ok: false, reason: T.none };
  const swept = casLevSweep(w, house, day, t, src);
  if (swept.some(r => r.pos === had)) return { ok: false, reason: T.setGone, lines: [S.notes[S.notes.length - 1]] };
  const nw = src.now(had.id);
  if (!nw || !nw.open || !(nw.px > 0)) return { ok: false, reason: T.setHalt };
  const stop = A.stop === undefined ? had.stop : lqPxArg(A.stop), take = A.take === undefined ? had.take : lqPxArg(A.take);
  const why = lqStopWhy(had, nw.px, stop, take);
  if (why) return { ok: false, reason: why };
  had.stop = stop; had.take = take;
  return { ok: true, pos: had, stop, take, lines: [casFill(T.setOk, { name: lqName(had.id), text: stop || take ? lqStopText(stop, take) : T.setClear })] };
}

// ---------- 畫面 ----------
// 回傳 { lev: { max, byMarket, usWhy, opensLeft, fee, interest, borrow, force, rule }, positions: [...], credit: {...}, posLimit, posUsed, profitCap, netToday, notes }
// positions 的每項：{ no, id, name, market, side, lev, qty, entry, margin, now, pnl, maintPct, liqPx, openedDay, dayTrade }（另外給 sid、n、ratio、liq，名字照現在畫面的假資料）
// 不改任何東西（要強平、收盤平倉要先叫 casLevSweep）。要拿走的話（notes）由接線的人叫 casLevTakeNotes
export function casStockLevView(w, house, day, t, src) {
  const lagMap = s => { const o = {}; for (const id of [...TW_IDS, ...US_IDS]) { const nw = s.now(id), r = nw && nw.open ? casLevLagWhy(nw) : null; if (r) o[id] = r; } return o; }; // 哪幾檔現在因為行情落後暫停新開
  const C = lqC(), T = CAS_STOCK_LEV, S = casLevFix(w), K = C.credit;
  src = src || casLevSrc(house, day, t);
  const level = casLevLevel(w), pts = S.cr.pts, byMarket = { in: casLevMaxLev("in", level), tw: casLevMaxLev("tw", level), us: casLevMaxLev("us", level), grp: casLevMaxLev("grp", level) }; // 倍數上限跟信用等級有關（levByCredit）
  const nxU = casLevNextUnlock(level), maxLevNow = Math.max(byMarket.in, byMarket.tw, byMarket.us, byMarket.grp);
  const owedTotal = S.owed.reduce((a, e) => a + e.amt, 0);
  const positions = S.pos.map(p => {
    const nw = src.now(p.id), now = nw && nw.px > 0 && p.day === day ? nw.px : p.px;
    return { no: p.no, id: p.id, name: lqName(p.id), market: p.mk, side: p.side, lev: p.lev, qty: p.qty, entry: p.entry, margin: p.margin, now, pnl: casLevPnl(p, now), maintPct: casLevMaint(p, now),
      liqPx: casLevLiqPx(p), stop: p.stop || null, take: p.take || null, openedDay: p.day, dayTrade: true, sid: p.id, n: p.qty, ratio: casLevEquity(p, now) / p.margin, liq: casLevLiqPx(p) };
  });
  const posLimit = casLevPosLimit(level), posUsed = lqOpenPos(S);
  return {
    lev: { max: Math.max(byMarket.in, byMarket.tw, byMarket.us, byMarket.grp), byMarket, usWhy: casLevMaxLev("us") > 0 ? null : T.off, lagWhy: lagMap(src), maxLagMin: lqN(C.maxLagMin), owed: owedTotal, owedList: S.owed.map(e => ({ day: e.day, amt: e.amt })), owedText: owedTotal > 0 ? casFill(T.owedView, { amt: casNum(owedTotal) }) : "", opensLeft: C.opensDay > 0 ? Math.max(0, C.opensDay - (S.opens.day === day ? S.opens.n : 0)) : null,
      fee: lqFeePct() / 100, interest: C.interestPct / 100, borrow: C.borrowPct / 100, rates: { in: casLevRates("in"), tw: casLevRates(TW_IDS[0]), us: casLevRates(US_IDS[0]), grp: casLevRates("grp") }, // rates：各市場自己的費用（畫面照市場顯示，11-20 決定 0136）
      force: C.forcePct / 100, rule: casFill(T.rule, { costs: casLevCostText() }) },
    positions,
    credit: { level, name: T.levels[level] || T.levels[T.levels.length - 1], maxLev: maxLevNow, next: level >= K.maxLevel ? 0 : (level + 1) * K.ptsPerLevel - pts,
      nextUnlock: nxU ? { level: nxU.level, lev: nxU.lev, pts: Math.max(0, nxU.level * K.ptsPerLevel - pts) } : null,
      nextText: nxU ? casFill(T.unlockNext, { level: nxU.level, lev: nxU.lev, pts: Math.max(0, nxU.level * K.ptsPerLevel - pts) }) : T.unlockAll, why: T.creditWhy, pts, posLimit, posUsed },
    posLimit, posUsed, profitCap: casLevProfitCap(level), netToday: S.net.day === day ? S.net.n : 0, notes: S.notes.slice(),
  };
}
// 把這次平倉、強平的話拿走（畫面下次拿到就說）
// 成交紀錄給畫面（shared/casino/trade_log.js）：最近 50 筆，新的在前，名字查好。
// profit ＝ 實際賺賠（賣出金額 − 手續費 − 證交稅 − 成本，跟錢包實際變化對得上，11-20 翊文）：存檔裡館外股、館內股的 g 是扣稅前（遊戲原本的 profit），這裡扣掉同一筆的 x；集團股的 g 本來就扣過稅；槓桿平倉的 g 已含兩次手續費和當沖稅。舊紀錄也這樣算，不改存檔
// market：out 館外股、in 館內股、grp 集團股；lev＝true 是槓桿的開倉／平倉（畫面放在「槓桿」頁籤）；kind：buy／sell／open／close；why 只有平倉有（close 手動、liq 強平、stop 停損、take 停利、flat 收盤自動）
export function casTradeView(w) {
  const L = w && Array.isArray(w.tl) ? w.tl : [], MK = { o: "out", i: "in", g: "grp" };
  return L.slice().reverse().map(r => {
    const lev = r.a === "lo" || r.a === "lc";
    return { day: r.d || null, t: lqN(r.t) || null, id: r.id, name: lqName(r.id), market: MK[r.m] || "out", lev, kind: lev ? (r.a === "lo" ? "open" : "close") : r.a === "b" ? "buy" : "sell",
      side: lev ? (r.y === "s" ? "short" : "long") : null, mult: lev ? lqN(r.v) || null : null, why: lev && r.a === "lc" ? r.w || "close" : null,
      n: lqN(r.n), price: Number(r.p) || 0, fee: lqN(r.f), tax: lqN(r.x), profit: r.a === "b" || r.a === "lo" ? null : Math.round((Number(r.g) || 0) - (r.a === "s" && r.m !== "g" ? lqN(r.x) : 0)), order: !!r.q, debt: !!r.r };
  });
}
export function casLevTakeNotes(w) { const S = casLevFix(w), n = S.notes; S.notes = []; return n; }
// 畫面平倉送的單號是 "p3"（stock view 的 positions[].id）：只留數字。以前伺服器寫 /D/g（只去掉大寫 D），"p3" 變 NaN，平倉鈕永遠「找不到這筆部位」（11-14 測試發現）
export const casLevPidNo = pid => parseInt(String(pid == null ? "" : pid).replace(/\D/g, ""), 10);
