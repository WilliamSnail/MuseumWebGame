// ================================================================
//  館外股的配股息資料（決定 0112，翊文 11-17）
//  每小時抓一次 Yahoo chart 的股利、拆股事件（events=div,split），22 檔同一支 API：
//    台股上市 `代號.TW`、上櫃 `代號.TWO`（合一）、美股直接用代號。範圍 1 個月；抓不到的那支這一輪略過，下一輪再抓。
//  存在 Firestore stocksDiv/latest：{ at, ev: [{ id, kind "div"｜"split", ex 除息日, amt 每股現金股利（真實幣別）, r 配股後股數是原來的幾倍 }] }。
//  除息日：台股用台灣日期、美股用美東日期（跟遊戲日一致）。台股的配股，Yahoo 記成 splits（例 1040:1000 ＝ 配 4%）。
//  玩家領股息、配股由 shared/casino/stock.js 的 casStockSetDiv／casStockPegSync 做（照除息日開始時的持股）。
//  不編資料：沒抓到就沒有事件。
// ================================================================
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore } from "firebase-admin/firestore";
import { TW_SYMBOLS, TW_OTC } from "./stock_tw.js";
import { US_SYMBOLS } from "./stock_us.js";

const db = () => getFirestore();
const HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
export const DIV_IDS = Object.keys(TW_SYMBOLS).concat(Object.keys(US_SYMBOLS));
export const divSymbol = id => (TW_SYMBOLS[id] ? TW_SYMBOLS[id] + (TW_OTC.includes(TW_SYMBOLS[id]) ? ".TWO" : ".TW") : US_SYMBOLS[id]);
const dayOf = (sec, tz) => new Date(sec * 1000).toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
// 把 Yahoo chart 的回應變成事件陣列（沒有就空陣列）。id：遊戲裡的股票 id；tw：台股（日期用台灣時區，不然美東）
export function parseDivEvents(json, id, tw) {
  const r = json && json.chart && json.chart.result && json.chart.result[0], ev = r && r.events, out = [], tz = tw ? "Asia/Taipei" : "America/New_York";
  if (!ev) return out;
  for (const x of Object.values(ev.dividends || {})) if (x && +x.amount > 0 && +x.date > 0) out.push({ id, kind: "div", ex: dayOf(+x.date, tz), amt: Math.round(+x.amount * 1e6) / 1e6, r: 0 });
  for (const x of Object.values(ev.splits || {})) { const r2 = +x.numerator / +x.denominator; if (x && r2 > 1 && r2 <= 50 && +x.date > 0) out.push({ id, kind: "split", ex: dayOf(+x.date, tz), amt: 0, r: Math.round(r2 * 1e6) / 1e6 }); }
  // 同一天同一種的合併（例如同一天兩筆現金股利）：金額加起來，一天一筆
  const m = new Map(); for (const e of out) { const k = e.kind + "|" + e.ex, o = m.get(k); if (o) { o.amt += e.amt; o.r = Math.max(o.r, e.r); } else m.set(k, Object.assign({}, e)); }
  return [...m.values()];
}
async function fetchOne(id) {
  let err = null;
  for (const host of HOSTS) {
    try {
      const r = await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(divSymbol(id))}?interval=1d&range=1mo&events=div%2Csplit`, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(host + " 回 " + r.status);
      return parseDivEvents(await r.json(), id, !!TW_SYMBOLS[id]);
    } catch (e) { err = e; }
  }
  throw err;
}
// 抓一輪（fetchFn 可以換掉，測試用）。回傳字串（排程記錄）
export async function stockDivRun(nowMs, fetchFn, dbx) {
  const D = dbx || db(), ref = D.doc("stocksDiv/latest");
  const res = await Promise.allSettled(DIV_IDS.map(id => (fetchFn || fetchOne)(id)));
  const ev = [], failed = [];
  res.forEach((x, i) => { if (x.status === "fulfilled") ev.push(...x.value); else failed.push(DIV_IDS[i]); });
  if (failed.length === DIV_IDS.length) { console.error("配股息資料全部抓不到：" + String(res[0].reason && res[0].reason.message || res[0].reason).slice(0, 200)); return "抓不到"; }
  // 這一輪沒抓到的那幾支：保留上次存的事件（不要因為暫時抓不到就把事件弄丟）
  const snap = await ref.get(), old = snap.exists && Array.isArray(snap.data().ev) ? snap.data().ev : [];
  const keep = old.filter(e => failed.includes(e.id));
  const all = ev.concat(keep).sort((a, b) => (a.ex < b.ex ? -1 : a.ex > b.ex ? 1 : a.id < b.id ? -1 : 1));
  await ref.set({ at: nowMs, ev: all, failed });
  return `事件 ${all.length} 筆${failed.length ? "；沒抓到 " + failed.join("、") : ""}`;
}
export const stockDivTick = onSchedule({ schedule: "17 * * * *", timeZone: "Asia/Taipei", retryCount: 0, timeoutSeconds: 60 }, async () => {
  console.log("stockDivTick", await stockDivRun(Date.now()));
});
// 給 functions/casino/casino.js 讀（記憶體快取 5 分鐘）
let divCache = null, divCacheAt = 0;
export async function stocksDiv() {
  if (divCache && Date.now() - divCacheAt < 5 * 60 * 1000) return divCache;
  try { const s = await db().doc("stocksDiv/latest").get(); divCache = s.exists ? s.data() : null; }
  catch (e) { console.warn("stocksDiv 讀不到", e && e.message); }
  divCacheAt = Date.now();
  return divCache;
}
