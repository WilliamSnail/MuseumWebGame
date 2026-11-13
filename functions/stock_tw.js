import "./options.js"; // 地區、initializeApp：一定要最先（見 options.js）
// ================================================================
//  台股盤中（11-14，規劃 2.8d）：Cloud Functions 自己去抓真實台股行情，不經過玩家的瀏覽器（玩家送回來的價格伺服器沒辦法驗證）。
//  資料來源：台灣證交所的即時行情介面（mis.twse.com.tw，公開、不用金鑰；跟美股那邊的 Yahoo 一樣不是官方保證的介面，抓不到就標沒資料，不編）。
//  真實代號只放在這個檔（不進 shared/，名字表不寫代號）。
//
//  怎麼跑：排程每分鐘叫一次 stockTwTick（週一到週五 09:00～13:59）。每次先讀 stocksTw/latest，shared/stocks_tw.js 的 twNeed 說要不要抓：
//    09:00 起抓開盤價（抓到才開盤，超過 09:30 還沒有就整天不開）；之後每 15 分鐘壹個錨點，錨點時間過了 3 分鐘內每分鐘重抓；
//    再抓不到，這壹段真實成分當 0，只剩隨機（資料標 stale）。
//  放哪裡（都只有 Functions 碰得到，firestore.rules 沒開放）：
//    stocksTw/latest        今天的錨點、每分鐘的價（相對前壹收盤的倍數）和最近幾天；玩家拿到的只有「現在這分鐘以前」的價，還沒發生的隨機路徑不會給
//    stocksTwSecret/main    亂數種子用的伺服器祕密 { seed }：第壹次用到時伺服器自己產生（crypto 亂數），不在 repo 裡；
//                           也可以用環境變數 STOCK_TW_SEED 蓋掉（有設就用它）。讀寫都失敗時這次用記憶體裡的亂數祕密（還是猜不到，只是不能重現）
//  這個檔也給 functions/casino.js 讀今天的資料（stocksTw，有快取）。
// ================================================================
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { randomBytes } from "node:crypto";
import { taipeiDay } from "./shared/logic.js";
import { outStockWeekend } from "./shared/stocks.js";
import { TW_IDS, twApply, twBackfill, twDocNew, twDocRoll, twIdx, twNeed } from "./shared/stocks_tw.js";

const db = () => getFirestore();
const docRef = () => db().doc("stocksTw/latest");

// 遊戲裡的 id → 證交所的代號（真實代號只放這裡）
export const TW_SYMBOLS = { islandforge: "2330", handbrain: "2454", bigassembly: "2317", trianglepower: "2308", linetower: "2412" };
const MIS_URL = "https://mis.twse.com.tw/stock/api/getStockInfo.jsp";

// 把證交所的回應變成 { id: { open, prev, px, lag } }。
//   o 開盤價、y 前壹收盤、z 最新成交價（"-" ＝還沒有）、d 資料的日期、t 最後成交時間。
//   日期不是今天（假日、還沒開盤時介面會回上壹個交易日）→ 那支當沒資料。
//   lag：資料落後幾分鐘 ＝ 現在（台灣時間）減這次回應裡最新的成交時間（所有股票取最新的，代表資料源本身的延遲）。
export function parseMis(json, todayYmd, nowMs) {
  const arr = json && Array.isArray(json.msgArray) ? json.msgArray : [];
  const num = v => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : null; };
  const secs = t => { const m = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(String(t || "")); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null; };
  const nowSec = Math.floor(((nowMs / 1000) + 8 * 3600) % 86400);
  const rows = {};
  let newest = null;
  for (const it of arr) {
    const id = Object.keys(TW_SYMBOLS).find(k => TW_SYMBOLS[k] === it.c);
    if (!id || String(it.d) !== todayYmd) continue;
    rows[id] = { open: num(it.o), prev: num(it.y), px: num(it.z) };
    const s = secs(it.t);
    if (s != null && (newest == null || s > newest)) newest = s;
  }
  const lag = newest == null ? null : Math.max(0, (nowSec - newest) / 60);
  const out = {};
  for (const id of Object.keys(rows)) out[id] = Object.assign({ lag }, rows[id]);
  return out;
}

export async function fetchMis(nowMs) {
  const ex = Object.values(TW_SYMBOLS).map(c => `tse_${c}.tw`).join("|");
  const ymd = taipeiDay(nowMs).replace(/-/g, "");
  const r = await fetch(`${MIS_URL}?ex_ch=${encodeURIComponent(ex)}&json=1&delay=0&_=${nowMs}`, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://mis.twse.com.tw/stock/fibest.jsp" }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error("證交所回 " + r.status);
  return parseMis(await r.json(), ymd, nowMs);
}

// 補最近壹次收盤（規劃 2.8l）：證交所介面在休市時回「上壹個交易日」的資料（d 是那天的日期、z 是最後成交價、y 是前壹收盤）。
// 回傳 { day: YYYY-MM-DD, close: { id: z }, prev: { id: y } }；沒有就 null
export function parseMisClose(json) {
  const arr = json && Array.isArray(json.msgArray) ? json.msgArray : [];
  const num = v => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : null; };
  const close = {}, prev = {};
  let day = null;
  for (const it of arr) {
    const id = Object.keys(TW_SYMBOLS).find(k => TW_SYMBOLS[k] === it.c), m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(it.d || ""));
    if (!id || !m || num(it.z) == null || num(it.y) == null) continue;
    const d = m[1] + "-" + m[2] + "-" + m[3];
    if (day && d !== day) continue;
    day = d; close[id] = num(it.z); prev[id] = num(it.y);
  }
  return day ? { day, close, prev } : null;
}
export async function fetchMisClose(nowMs) {
  const ex = Object.values(TW_SYMBOLS).map(c => `tse_${c}.tw`).join("|");
  const r = await fetch(`${MIS_URL}?ex_ch=${encodeURIComponent(ex)}&json=1&delay=0&_=${nowMs}`, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://mis.twse.com.tw/stock/fibest.jsp" }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error("證交所回 " + r.status);
  return parseMisClose(await r.json());
}
// 每天早上補壹次（休市、週末也補）：最近壹次收盤寫進 stocksTw/latest 的 days（twBackfill）。回傳做了什麼的字串
export async function stockTwBackfill(nowMs, fetchFn, dbx) {
  const D = dbx || db(), ref = D.doc("stocksTw/latest");
  let got = null;
  try { got = await (fetchFn || fetchMisClose)(nowMs); } catch (e) { console.error("台股最近壹次收盤抓不到：" + String((e && e.message) || e).slice(0, 200)); return "抓不到"; }
  if (!got) return "沒資料";
  const today = taipeiDay(nowMs);
  return await D.runTransaction(async tx => {
    const s = await tx.get(ref), old = s.exists ? s.data() : null;
    const doc = old ? twDocRoll(old, old.day && old.day < today ? today : old.day, 5) : twDocNew(today);
    if (got.day >= today || !twBackfill(doc, got.day, got.close, got.prev)) return "不用補"; // 今天的（09:00 開始有成交了）不當成收盤
    doc.updatedAt = nowMs;
    tx.set(ref, doc);
    return "補了 " + got.day;
  });
}

let secretMem = null;
// 亂數種子用的伺服器祕密（見檔頭）
export async function twSecret() {
  if (process.env.STOCK_TW_SEED) return String(process.env.STOCK_TW_SEED);
  if (secretMem) return secretMem;
  try {
    const ref = db().doc("stocksTwSecret/main"), s = await ref.get();
    if (s.exists && s.data().seed) return (secretMem = String(s.data().seed));
    const seed = randomBytes(32).toString("hex");
    try { await ref.create({ seed, createdAt: FieldValue.serverTimestamp() }); secretMem = seed; }
    catch (e) { const again = await ref.get(); secretMem = again.exists && again.data().seed ? String(again.data().seed) : seed; } // 同時有人建好了：用它的
  } catch (e) {
    console.warn("stocksTwSecret 讀寫失敗，這次用記憶體裡的亂數祕密", e && e.message);
    secretMem = randomBytes(32).toString("hex");
  }
  return secretMem;
}

// 做壹次（每分鐘壹次）。fetchFn、secretFn 可以換掉（測試用）。回傳做了什麼的字串（排程記錄用）
export async function stockTwRun(nowMs, fetchFn, secretFn, dbx) {
  const D = dbx || db(), ref = D.doc("stocksTw/latest");
  const day = taipeiDay(nowMs), idx = twIdx(nowMs);
  if (outStockWeekend(day) || idx == null || idx < 0 || idx > 272) return "不在盤中";
  const snap = await ref.get();
  const doc0 = twDocRoll(snap.exists ? snap.data() : null, day, 5);
  let need = twNeed(doc0, idx);
  if (!need) return "沒事做";
  let got = null, err = null;
  if (need.fetch) {
    try { got = await (fetchFn || fetchMis)(nowMs); } catch (e) { err = String((e && e.message) || e).slice(0, 200); }
  }
  const secret = await (secretFn || twSecret)();
  const done = await D.runTransaction(async tx => {
    const s = await tx.get(ref);
    const doc = twDocRoll(s.exists ? s.data() : null, day, 5);
    const first = twNeed(doc, idx);
    if (JSON.stringify(first) !== JSON.stringify(need)) return "別的排程先做了";
    let did = [];
    for (let n = 0, nd = first; nd && n < 20; n++, nd = twNeed(doc, idx)) {
      const useGot = n === 0 ? got : null;
      if (nd.fetch && n > 0) break; // 還要抓的下壹分鐘再來
      if (!twApply(doc, nd, idx, useGot, secret)) { did.push(nd.kind + "沒做成"); break; }
      did.push(nd.kind + (nd.j != null ? nd.j : ""));
    }
    doc.updatedAt = nowMs;
    doc.err = err;
    tx.set(ref, doc);
    return did.join(",");
  });
  if (err) console.error("台股行情抓不到：" + err);
  else if (need.kind === "open" && done.includes("沒做成")) console.warn("台股開盤價還沒有（或格式不對），下一分鐘再試");
  if (need.kind === "giveup") console.error("台股超過 09:30 還抓不到開盤價，今天台股休市（若今天不是假日，看證交所介面有沒有改）");
  return done;
}

export const stockTwTick = onSchedule({ schedule: "* 9-13 * * 1-5", timeZone: "Asia/Taipei", retryCount: 0, timeoutSeconds: 30 }, async () => {
  const now = Date.now(), r = await stockTwRun(now);
  if (/^09:00$/.test(new Date(now + 8 * 3600000).toISOString().slice(11, 16))) console.log("stockTwBackfill", await stockTwBackfill(now)); // 排程只留 3 個（Cloud Scheduler 3 個以內免費）：台股補收盤併進這個每分鐘的排程，09:00 做壹次
  console.log("stockTwTick", r);
});

// ---------- 給 functions/casino.js 讀 ----------
// 今天的資料放在記憶體 TW_CACHE_MS 毫秒（錨點每 15 分鐘才變，價是用時間算的，不必每次都讀）。讀不到就用舊的，沒有就當沒資料（台股不開）
let twCache = null, twCacheAt = 0;
const TW_CACHE_MS = 8 * 1000; // 直接用真實價：價每分鐘變，快取壹下下就好
export async function stocksTw() {
  if (twCache && Date.now() - twCacheAt < TW_CACHE_MS) return twCache;
  try { const s = await docRef().get(); twCache = s.exists ? s.data() : null; }
  catch (e) { console.warn("stocksTw 讀不到", e && e.message); }
  twCacheAt = Date.now();
  return twCache;
}
// 今天哪幾支台股「沒有新行情」（這壹段沒抓到真實價）：畫面標出來。還沒開盤、或今天不開的不算
export function twStale(tw, day) {
  if (!tw || tw.day !== day || tw.openIdx == null) return [];
  return TW_IDS.filter(id => tw.stale && tw.stale[id]);
}
