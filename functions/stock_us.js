import "./options.js"; // 地區、initializeApp：一定要最先（見 options.js）
// ================================================================
//  美股盤中（11-14，規劃 2.8i）：跟台股盤中（functions/stock_tw.js）同一套做法，只是時間是美東 09:30～16:00，資料來源換成美股行情。
//  資料來源：Yahoo Finance 的公開圖表介面（query1.finance.yahoo.com/v8/finance/chart，1 分鐘 K 棒，不用金鑰；跟 tools/stocks_fetch.cjs 每日資料同一個介面，
//    不是官方保證的介面，可能被擋、改格式、限流；抓不到就標沒資料，不編）。真實代號只放在這個檔（不進 shared/，名字表不寫代號）。
//  「夜光科技指數」對應 QQQ（那斯達克 100 的 ETF，可以交易、盤中有即時價；指數本身 ^IXIC 盤中的資料比較不穩）。
//
//  怎麼跑：排程每分鐘叫一次 stockUsTick（美東週一到週五 09:00～16:59，所以夏令冬令都不用改；時區由 Cloud Scheduler 的 timeZone 處理）。
//    每次先算「美東現在是哪一天、開盤後第幾分鐘」（shared/stocks_tw.js 的 usNyDay、usIdx，Intl 算，日光節約自動對），
//    再讀 stocksUs/latest，usNeed 說要不要抓：09:30 起抓開盤價（抓到才開盤，超過 10:00 還沒有就整天不開，美國國定假日就是這樣休市）；
//    之後每 15 分鐘壹個錨點，錨點時間過了 3 分鐘內每分鐘重抓；再抓不到，這壹段真實成分當 0，只剩隨機（資料標 stale）。
//  放哪裡（都只有 Functions 碰得到，firestore.rules 沒開放）：
//    stocksUs/latest        今天的錨點、每分鐘的價（相對前壹收盤的倍數）和最近幾天，格式跟 stocksTw/latest 壹樣（日期 ＝ 美東日期 ＝ 遊戲日期）
//    亂數種子用的伺服器祕密跟台股共用 stocksTwSecret/main（stock_tw.js 的 twSecret；種子字串裡有股票 id，兩邊不會撞）
//  行情的落後（lag）：這壹包最新的 K 棒時間離現在幾分鐘（所有股票取最新的），shared/stocks_tw.js 的 twXOf 照落後多久決定真實成分 X。
// ================================================================
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore } from "firebase-admin/firestore";
import { outStockWeekend } from "./shared/stocks.js";
import { US_IDS, mkLen, twBackfill, usApply, usDocNew, usDocRoll, usIdx, usNeed, usNyDay, usParseChart } from "./shared/stocks_tw.js";
import { NUM } from "./shared/config.js";
import { twSecret } from "./stock_tw.js";

const db = () => getFirestore();
const docRef = () => db().doc("stocksUs/latest");

// 遊戲裡的 id → Yahoo 的代號（真實代號只放這裡）
export const US_SYMBOLS = { greeneye: "NVDA", redclaw: "AMD", nightindex: "QQQ", silverapple: "AAPL", flashcar: "TSLA", squarewin: "MSFT" };
const HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];

async function fetchOne(sym, day, nowMs) {
  let err = null;
  for (const host of HOSTS) {
    try {
      const r = await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(sym)}?interval=1m&range=1d`, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(host + " 回 " + r.status);
      return usParseChart(await r.json(), day, nowMs);
    } catch (e) { err = e; }
  }
  throw err;
}

// 六檔一起抓。回傳 { id: { open, prev, px, lag } }（抓得到的才有）；全部都抓失敗才丟錯。
// lag 取這壹包裡最小的（所有股票裡最新的那壹根代表資料源本身的延遲，跟台股的算法壹樣），套到每一支
export async function fetchYahoo(nowMs) {
  const day = usNyDay(nowMs);
  const res = await Promise.allSettled(US_IDS.map(id => fetchOne(US_SYMBOLS[id], day, nowMs)));
  const out = {};
  let errs = [];
  res.forEach((x, i) => { if (x.status === "fulfilled" && x.value) out[US_IDS[i]] = x.value; else if (x.status === "rejected") errs.push(String((x.reason && x.reason.message) || x.reason)); });
  if (!Object.keys(out).length && errs.length) throw new Error(errs[0]);
  const lags = Object.values(out).map(v => v.lag).filter(Number.isFinite);
  const lag = lags.length ? Math.min(...lags) : null;
  for (const id of Object.keys(out)) out[id].lag = lag;
  return out;
}

// 補最近壹次收盤（規劃 2.8l）：圖表介面 meta 有最後壹個交易日的收盤（regularMarketPrice）、前壹收盤（chartPreviousClose）、時間（regularMarketTime）。
// 回傳 { day: 美東日期, close: { id }, prev: { id } }；沒有就 null
export function parseYahooClose(json, id) {
  const m = json && json.chart && json.chart.result && json.chart.result[0] && json.chart.result[0].meta;
  if (!m || !(m.regularMarketPrice > 0) || !(m.chartPreviousClose > 0) || !(m.regularMarketTime > 0)) return null;
  return { day: usNyDay(m.regularMarketTime * 1000), id, px: m.regularMarketPrice, prev: m.chartPreviousClose };
}
export async function fetchYahooClose() {
  const rows = await Promise.allSettled(US_IDS.map(async id => {
    let err = null;
    for (const host of HOSTS) {
      try {
        const r = await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(US_SYMBOLS[id])}?interval=1d&range=5d`, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error(host + " 回 " + r.status);
        return parseYahooClose(await r.json(), id);
      } catch (e) { err = e; }
    }
    throw err;
  }));
  const ok = rows.filter(x => x.status === "fulfilled" && x.value).map(x => x.value);
  if (!ok.length) return null;
  const day = ok.map(x => x.day).sort().pop(), close = {}, prev = {};
  for (const x of ok) if (x.day === day) { close[x.id] = x.px; prev[x.id] = x.prev; }
  return { day, close, prev };
}
export async function stockUsBackfill(nowMs, fetchFn, dbx) {
  const D = dbx || db(), ref = D.doc("stocksUs/latest");
  let got = null;
  try { got = await (fetchFn || fetchYahooClose)(nowMs); } catch (e) { console.error("美股最近壹次收盤抓不到：" + String((e && e.message) || e).slice(0, 200)); return "抓不到"; }
  if (!got) return "沒資料";
  const today = usNyDay(nowMs);
  return await D.runTransaction(async tx => {
    const s = await tx.get(ref), old = s.exists ? s.data() : null;
    const doc = old ? usDocRoll(old, old.day && old.day < today ? today : old.day, 5) : usDocNew(today);
    if (got.day >= today || !twBackfill(doc, got.day, got.close, got.prev)) return "不用補";
    doc.updatedAt = nowMs;
    tx.set(ref, doc);
    return "補了 " + got.day;
  });
}

// 做壹次（每分鐘壹次）。fetchFn、secretFn 可以換掉（測試用）。回傳做了什麼的字串（排程記錄用）
export async function stockUsRun(nowMs, fetchFn, secretFn, dbx) {
  const D = dbx || db(), ref = D.doc("stocksUs/latest");
  const day = usNyDay(nowMs), idx = usIdx(nowMs, day), C = NUM.casino.stock.us;
  if (outStockWeekend(day) || idx == null || idx < 0 || idx > mkLen("us", day) + 2) return "不在盤中";
  const snap = await ref.get();
  const doc0 = usDocRoll(snap.exists ? snap.data() : null, day, 5);
  let need = usNeed(doc0, idx);
  if (!need) return "沒事做";
  let got = null, err = null;
  if (need.fetch) {
    try { got = await (fetchFn || fetchYahoo)(nowMs); } catch (e) { err = String((e && e.message) || e).slice(0, 200); }
  }
  const secret = await (secretFn || twSecret)();
  const done = await D.runTransaction(async tx => {
    const s = await tx.get(ref);
    const doc = usDocRoll(s.exists ? s.data() : null, day, 5);
    const first = usNeed(doc, idx);
    if (JSON.stringify(first) !== JSON.stringify(need)) return "別的排程先做了";
    let did = [];
    for (let n = 0, nd = first; nd && n < 30; n++, nd = usNeed(doc, idx)) {
      const useGot = n === 0 ? got : null;
      if (nd.fetch && n > 0) break; // 還要抓的下壹分鐘再來
      if (!usApply(doc, nd, idx, useGot, secret)) { did.push(nd.kind + "沒做成"); break; }
      did.push(nd.kind + (nd.j != null ? nd.j : ""));
    }
    doc.updatedAt = nowMs;
    doc.err = err;
    tx.set(ref, doc);
    return did.join(",");
  });
  if (err) console.error("美股行情抓不到：" + err);
  else if (need.kind === "open" && done.includes("沒做成")) console.warn("美股開盤價還沒有（或格式不對），下一分鐘再試");
  if (need.kind === "giveup") console.warn("美股超過 10:00 還抓不到開盤價，今天美股休市（美國假日是正常的；若今天不是假日，看 Yahoo 介面有沒有改、有沒有擋）");
  return done;
}

// 美東週一到週五 09:00～16:59 每分鐘跑壹次（09:00～09:29 和收盤後那幾分鐘 stockUsRun 自己會跳過）。時區用 Cloud Scheduler 的 timeZone，日光節約由它處理
export const stockUsTick = onSchedule({ schedule: "* 9-16 * * 1-5", timeZone: "America/New_York", retryCount: 0, timeoutSeconds: 30 }, async () => {
  const now = Date.now(), r = await stockUsRun(now);
  if (/^09:00$/.test(new Date(now).toLocaleTimeString("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" }))) console.log("stockUsBackfill", await stockUsBackfill(now)); // 美股補收盤併進這個排程（美東 09:00 做壹次，開盤前）
  console.log("stockUsTick", r);
});

// ---------- 給 functions/casino.js 讀 ----------
// 今天的資料放在記憶體 US_CACHE_MS 毫秒（錨點每 15 分鐘才變，價是用時間算的，不必每次都讀）。讀不到就用舊的，沒有就當沒資料（美股不開）
let usCache = null, usCacheAt = 0;
const US_CACHE_MS = 8 * 1000; // 直接用真實價：價每分鐘變，快取壹下下就好
export async function stocksUs() {
  if (usCache && Date.now() - usCacheAt < US_CACHE_MS) return usCache;
  try { const s = await docRef().get(); usCache = s.exists ? s.data() : null; }
  catch (e) { console.warn("stocksUs 讀不到", e && e.message); }
  usCacheAt = Date.now();
  return usCache;
}
// 今天哪幾支美股「沒有新行情」（這壹段沒抓到真實價）：畫面標出來。還沒開盤、或今天不開的不算
export function usStale(us, day) {
  if (!us || us.day !== day || us.openIdx == null) return [];
  return US_IDS.filter(id => us.stale && us.stale[id]);
}
