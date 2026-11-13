// 美股也用這一份（11-14，規劃 2.8i）：同樣的模型、同樣的錨點加橋，只是時間是美東 09:30～16:00（算日光節約，見 usOpenMs），
// 每個市場的設定各一份（NUM.casino.stock.tw／us），函式最後多一個參數 mk（"tw" 預設、"us"）。真實成分 X 兩邊共用 twX。
// 美股那一天的「日期」＝ 美東的日期＝ 遊戲日期（台灣 05:00 換日）：美東 09:30～16:00 換成台灣時間是 21:30～04:00（夏令）或 22:30～05:00（冬令），
// 都落在同一個遊戲日裡（冬令收盤剛好是隔天 05:00 換日那一刻）。
// 台股盤中價格（11-14，規劃 2.8d；翊文：「盤中也動」「每十五分鐘，但中間可以是隨機的」）。
// 只算數字，不碰時間（時間由呼叫的人傳進來）、不碰亂數函式（用「種子＋伺服器祕密」算，同樣的輸入同樣的輸出，方便驗算）。
//
// 怎麼動：台股 09:00～13:30（分鐘 0～270）。伺服器每 15 分鐘抓壹次真實價（functions/stock_tw.js），第 j 段 ＝ 09:00 起第 15j～15j+15 分鐘。
//   - 第 0 個價 ＝ 真實開盤價 ÷ 真實前壹收盤（開盤跳空），乘上遊戲昨天的收盤；沒有這個價台股今天不開。
//   - 第 j 段結束的錨點 A(j+1) ＝ A(j) × (1 ＋ X × 上壹段真實漲跌 ＋ 隨機)。
//     「上壹段真實漲跌」＝ 這次抓到的真實價 ÷ 上次（15 分鐘前）抓到的；抓不到，這壹段真實成分當 0，只剩隨機（不沿用上壹段的趨勢，不編資料）。
//     X 看資料落後多久（NUM.casino.stock.twX）：落後越久，看即時行情的人領先越多，真實成分壓越低。
//     隨機的幅度 ＝ 該股 15 分鐘標準差 × √(1 − X²)：整體波動跟真實差不多，只是只有 X 那一份是真的。
//   - 兩個錨點中間用「橋」：兩端固定、中間每分鐘隨機走（minSd）。所以知道兩端的人靠橋的抖動也賺不到手續費。
//   - 種子 ＝ 伺服器祕密 ＋ 日期 ＋ 哪支 ＋ 第幾段：玩家猜不到還沒發生的隨機。
// 存的是「相對前壹收盤的倍數」（rel，1.00532 ＝ 比昨天收盤高 0.532%），遊戲價 ＝ 莊家文件裡那天開盤價 × rel（shared/casino_stock.js 的 casStockTwApply）。
// 這份資料的樣子（Firestore stocksTw/latest，只有 Functions 碰得到）：
//   { day, openIdx 第壹個價是第幾分鐘抓到的（null＝還沒）, closed 今天不開了, k 已經算到第幾段（橋已建好）,
//     prevReal { id: 真實前壹收盤 }, R { id: { px 上壹次抓到的真實價, seg 第幾段抓的 } }, A { id: 現在這壹段開頭的錨點 },
//     ser { id: [rel × 每分鐘] }, lag { id: 落後分鐘 }, stale { id: true＝這壹段沒抓到真實價 }, log [最近幾次], days { 日期: { openIdx, ser } } }
import { NUM } from "./config.js";
import { OUT_STOCKS } from "./stocks_text.js";

export const TW_IDS = OUT_STOCKS.filter(s => s.market === "tw").map(s => s.id);
export const stockIsTw = id => TW_IDS.includes(id);
export const US_IDS = OUT_STOCKS.filter(s => s.market === "us").map(s => s.id);
export const stockIsUs = id => US_IDS.includes(id);
// 兩個市場各自的名單和設定（設定每次現讀 NUM，測試改了數字馬上生效）
const MKS = { tw: { ids: TW_IDS, C: () => NUM.casino.stock.tw }, us: { ids: US_IDS, C: () => NUM.casino.stock.us } };

// ---------- 美股的時間（美東 America/New_York，日光節約由 Intl 算，不寫死 UTC 差） ----------
const US_TZ = "America/New_York";
let usFmtHour = null, usFmtDay = null;
const usOpenCache = {};
// 美東那天（日期 YYYY-MM-DD）正常盤開盤（09:30）的毫秒。用那天 17:00 UTC 時美東牆上的幾點判斷冬令（12 點）或夏令（13 點）；日光節約都在凌晨 2 點換，不影響 09:30
export function usOpenMs(day) {
  if (usOpenCache[day] != null) return usOpenCache[day];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day));
  if (!m) return null;
  const y = +m[1], mo = +m[2] - 1, d = +m[3];
  usFmtHour = usFmtHour || new Intl.DateTimeFormat("en-US", { timeZone: US_TZ, hourCycle: "h23", hour: "numeric" });
  const wallH = +usFmtHour.formatToParts(new Date(Date.UTC(y, mo, d, 17))).find(p => p.type === "hour").value;
  const off = (wallH - 17) * 60; // 冬令 −300、夏令 −240（分鐘）
  const C = NUM.casino.stock.us;
  return (usOpenCache[day] = Date.UTC(y, mo, d, 0, C.open, 0) - off * 60000);
}
// 美股提早收盤日（NYSE：13:00 美東收）：感恩節（11 月第 4 個星期四）的隔天、12/24（星期一～四；星期五那年 12/25 是星期六，12/24 整天休市）、7/3（星期一～四；星期五那年 7/4 是星期六，7/3 整天休市）。
// day 是 YYYY-MM-DD（美東的日期）。休市的整天（國定假日）資料裡本來就沒有，不用在這裡處理
export function usEarlyClose(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day));
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3], wd = new Date(Date.UTC(y, mo - 1, d)).getUTCDay(); // 0 日 … 6 六
  if (mo === 12 && d === 24) return wd >= 1 && wd <= 4;
  if (mo === 7 && d === 3) return wd >= 1 && wd <= 4;
  if (mo === 11 && wd === 5) { // 感恩節 ＝ 11 月第 4 個星期四；隔天（星期五）提早收盤
    const first = new Date(Date.UTC(y, 10, 1)).getUTCDay(), thanks = 1 + ((4 - first + 7) % 7) + 21;
    return d === thanks + 1;
  }
  return false;
}
// 這個市場那天盤中有幾分鐘（台股 len；美股平常 len、提早收盤日 earlyLen）
export function mkLen(mk, day) {
  const C = mk === "us" ? NUM.casino.stock.us : NUM.casino.stock.tw;
  return mk === "us" && usEarlyClose(day) && C.earlyLen > 0 ? C.earlyLen : C.len;
}
// 美東現在是哪一天（YYYY-MM-DD）
export function usNyDay(ms) {
  usFmtDay = usFmtDay || new Intl.DateTimeFormat("en-CA", { timeZone: US_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  return usFmtDay.format(new Date(ms));
}
// 距離美東 day 那天 09:30 幾分鐘（09:30 ＝ 0，16:00 ＝ 390；開盤前是負的）。沒給時間回 null
export function usIdx(t, day) {
  if (t == null || !Number.isFinite(+t)) return null;
  const o = usOpenMs(day);
  return o == null ? null : Math.floor((+t - o) / 60000);
}

// 台灣時間距離 09:00 幾分鐘（09:00 ＝ 0，13:30 ＝ 270；開盤前是負的）。沒給時間回 null
export function twIdx(t) {
  if (t == null || !Number.isFinite(+t)) return null;
  const mm = Math.floor(+t / 60000);
  return ((mm + 480) % 1440) - NUM.casino.stock.tw.from;
}

// 資料落後 lagMin 分鐘 → 真實成分 X（NUM.casino.stock.twX 由小到大找第壹個符合的）
export function twXOf(lagMin) {
  const L = typeof lagMin === "number" && isFinite(lagMin) ? Math.max(0, lagMin) : Infinity;
  const row = NUM.casino.stock.twX.find(r => L <= r.lag);
  return row ? row.x : NUM.casino.stock.twX[NUM.casino.stock.twX.length - 1].x;
}

// ---------- 亂數：字串 → 32 位元種子 → 0～1 的亂數 ----------
function twSeed(s) {
  let h = 2166136261;
  s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16;
  return h >>> 0;
}
function twRng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const twNorm = r => { const u = Math.max(1e-12, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const twRound = x => Math.round(x * 100000) / 100000;
const twClamp = (x, C) => { const b = C.band / 100; return Math.max(1 - b, Math.min(1 + b, x)); };
const twMinSd = (C, id) => (typeof C.minSd === "object" ? C.minSd[id] : C.minSd) || 0.1; // 美股每支不一樣
const okPx = v => typeof v === "number" && isFinite(v) && v > 0;

// ---------- 這一天的資料 ----------
export function twDocNew(day) {
  return { day, openIdx: null, closed: false, k: -1, prevReal: {}, R: {}, A: {}, ser: {}, lag: {}, stale: {}, log: [], days: {} };
}
// 今天的資料：舊的不是今天，就把舊的收進 days（最多留 keep 天），開新的
export function twDocRoll(old, day, keep) {
  if (old && old.day === day) return old;
  const doc = twDocNew(day);
  if (old && typeof old === "object") {
    doc.days = Object.assign({}, old.days);
    // close：那天最後壹次抓到的真實價（遊戲價「已經算進去」的那個），prev：真實前壹收盤；2.8h 每天開盤拉回要用
    if (old.day && old.openIdx != null && old.ser) {
      const close = {}, prev = {};
      for (const id of Object.keys(old.R || {})) if (old.R[id] && okPx(old.R[id].px)) close[id] = old.R[id].px;
      for (const id of Object.keys(old.prevReal || {})) if (okPx(old.prevReal[id])) prev[id] = old.prevReal[id];
      doc.days[old.day] = { openIdx: old.openIdx, ser: old.ser, close, prev };
    }
    for (const d of Object.keys(doc.days).sort().slice(0, -(keep || 5))) delete doc.days[d];
  }
  return doc;
}

// 這個分鐘（idx）要做什麼：null＝沒事；{ kind: "giveup" }；{ kind: "open", fetch: true }；{ kind: "seg", j, fetch: true|false }
//   fetch false ＝ 錨點時間過了 retry 分鐘還沒抓到：不抓了，這壹段真實成分當 0 直接算
export function twNeed(doc, idx, mk) {
  const C = MKS[mk || "tw"].C();
  const LEN = mkLen(mk || "tw", doc && doc.day);
  if (!doc || doc.closed || idx == null || idx < 0 || idx > LEN) return null;
  if (doc.openIdx == null) return idx >= C.giveUp ? { kind: "giveup" } : { kind: "open", fetch: true };
  if (NUM.casino.stock.direct) return idx > doc.k ? { kind: "min", fetch: true } : null; // 直接用真實價：開盤後每分鐘抓壹次（doc.k ＝ 已經做到第幾分鐘）
  const j = doc.k + 1;
  if (j >= LEN / C.seg) return null;
  if (idx < j * C.seg) return null;
  return { kind: "seg", j, fetch: idx - j * C.seg < C.retry };
}

// 把 ser 補到第 upto 分鐘（不夠的用目前錨點平的補上）
function twPad(arr, upto, a) { while (arr.length <= upto) arr.push(a); }

// 建第 j 段的橋，回傳下壹個錨點。ser 已經補到起點。
function twBuild(doc, id, j, secret, ret, x, hasReal, C, LEN) {
  const sd15 = (C.sd15[id] || 0.5) / 100;
  const r = twRng(twSeed(`${secret}|${doc.day}|${id}|${j}`));
  const amp = hasReal ? sd15 * Math.sqrt(1 - x * x) : sd15;
  const a = doc.A[id];
  const b = twRound(twClamp(a * (1 + (hasReal ? x * ret : 0) + amp * twNorm(r)), C));
  const arr = doc.ser[id];
  const s = arr.length - 1, e = Math.min(LEN, (j + 1) * C.seg);
  const n = e - s;
  if (n > 0) {
    // 布朗橋：W 是隨機走，橋 ＝ W(i) − (i/n)·W(n)，兩端回到 0
    const W = [0];
    for (let i = 1; i <= n; i++) W.push(W[i - 1] + twNorm(r) * twMinSd(C, id) / 100);
    const base = arr[s];
    for (let i = 1; i <= n; i++) {
      const u = i / n, line = base * Math.pow(b / base, u);
      arr.push(i === n ? b : twRound(twClamp(line * Math.exp(W[i] - u * W[n]), C)));
    }
  }
  doc.A[id] = b;
}

// 做完 need 該做的事。got：抓到的資料 { id: { open, prev, px, lag(分鐘) } } 或 null（沒抓到）。回傳新的 doc（會改傳進來的 doc）。
// open：got[id].open 是真實開盤價、prev 是真實前壹收盤；seg：got[id].px 是這次抓到的真實價。壞資料（非數字）當作這支沒抓到。
// 回傳 false＝沒做成（open 沒有任何壹支有資料，下壹分鐘再試）
export function twApply(doc, need, idx, got, secret, mk) {
  mk = mk || "tw";
  const C = MKS[mk].C(), IDS = MKS[mk].ids;
  if (!need) return true;
  if (need.kind === "giveup") { doc.closed = true; return true; }
  const g = got && typeof got === "object" ? got : {};
  if (need.kind === "open") {
    const okIds = IDS.filter(id => g[id] && okPx(g[id].open) && okPx(g[id].prev));
    if (!okIds.length) return false;
    const j = Math.floor(idx / C.seg);
    doc.openIdx = idx; doc.k = j - 1; doc.stale = {};
    for (const id of IDS) {
      const ok = okIds.includes(id);
      doc.A[id] = ok ? twRound(twClamp(g[id].open / g[id].prev, C)) : 1;
      doc.prevReal[id] = ok ? g[id].prev : null;
      doc.R[id] = ok ? { px: g[id].open, seg: j } : null;
      doc.lag[id] = ok && Number.isFinite(+g[id].lag) ? +g[id].lag : null;
      if (!ok) doc.stale[id] = true;
      doc.ser[id] = [];
      twPad(doc.ser[id], idx, doc.A[id]);
    }
    if (NUM.casino.stock.direct) { // 直接用真實價：開盤那壹分鐘的價 ＝ 真實開盤價（沒有隨機、沒有橋）
      doc.k = idx; doc.last = {};
      for (const id of IDS) if (okIds.includes(id)) { doc.last[id] = idx; doc.R[id] = { px: okPx(g[id].px) ? g[id].px : g[id].open, seg: idx }; doc.ser[id] = []; twPad(doc.ser[id], idx, twRound(doc.R[id].px / g[id].prev)); }
      return true;
    }
    return twSegment(doc, j, idx, null, secret, true, mk);
  }
  if (need.kind === "min") return twMinute(doc, idx, g, mk);
  return twSegment(doc, need.j, idx, need.fetch ? g : null, secret, false, mk);
}

// 直接用真實價：這壹分鐘（idx）每支的 rel ＝ 真實價 ÷ 真實前壹收盤。抓不到（或資料落後超過 staleMin 分鐘）這壹分鐘價平的接上去；
// 超過 staleMin 分鐘沒有新價的那支標 stale（遊戲暫停那支的買賣）。lag 每分鐘更新
function twMinute(doc, idx, g, mk) {
  const IDS = MKS[mk].ids, S = NUM.casino.stock, sm = S.staleMin;
  if (!doc.last || typeof doc.last !== "object") doc.last = {};
  const stale = {};
  for (const id of IDS) {
    const arr = doc.ser[id], prev = doc.prevReal[id], row = g[id];
    if (!Array.isArray(arr) || !okPx(prev)) { stale[id] = true; continue; } // 開盤時就沒有這支：整天停著
    const rel = row && okPx(row.px) ? row.px / prev : null;
    const fresh = rel != null && rel >= S.sane[0] && rel <= S.sane[1] && !(Number.isFinite(+row.lag) && +row.lag > sm);
    if (Number.isFinite(+(row && row.lag))) doc.lag[id] = +row.lag;
    const lastRel = arr.length ? arr[arr.length - 1] : 1;
    twPad(arr, idx - 1, lastRel);
    if (fresh) { arr[idx] = twRound(rel); doc.last[id] = idx; doc.R[id] = { px: row.px, seg: idx }; }
    else arr[idx] = lastRel;
    if (doc.last[id] == null || idx - doc.last[id] > sm) stale[id] = true;
  }
  doc.stale = stale; doc.k = idx;
  doc.log = (doc.log || []).concat([{ j: idx, idx, lag: Math.max(0, ...IDS.map(id => Number.isFinite(+doc.lag[id]) ? +doc.lag[id] : 0)), stale: Object.keys(stale).length }]).slice(-40);
  return true;
}

function twSegment(doc, j, idx, g, secret, opening, mk) {
  const C = MKS[mk].C(), IDS = MKS[mk].ids;
  const stale = opening ? Object.assign({}, doc.stale) : {};
  for (const id of IDS) {
    const row = g && g[id], arr = doc.ser[id];
    twPad(arr, Math.max(j * C.seg, Math.min(idx, j * C.seg + C.seg - 1)), doc.A[id]); // 錨點時間到了才抓到：先平的補到現在，這段時間玩家看到的就是平的
    let ret = 0, x = 0, hasReal = false;
    if (opening) {
      // 開盤那壹段：開盤價已經完整用在起點（跳空），這壹段沒有「上壹段漲跌」，真實成分 0
      hasReal = false;
    } else if (row && okPx(row.px)) {
      const prev = doc.R[id];
      if (prev && prev.seg === j - 1 && okPx(prev.px)) {
        ret = row.px / prev.px - 1; x = twXOf(row.lag); hasReal = true;
        doc.lag[id] = Number.isFinite(+row.lag) ? +row.lag : null;
      } else stale[id] = true; // 上壹段沒抓到，不能算「上壹段漲跌」
      doc.R[id] = { px: row.px, seg: j };
    } else stale[id] = true;
    if (opening && doc.stale[id]) stale[id] = true;
    twBuild(doc, id, j, secret, ret, x, hasReal, C, mkLen(mk, doc.day));
  }
  doc.stale = stale;
  doc.k = j;
  doc.log = (doc.log || []).concat([{ j, idx, lag: Math.max(0, ...IDS.map(id => Number.isFinite(+doc.lag[id]) ? +doc.lag[id] : 0)), stale: Object.keys(stale).length }]).slice(-40);
  return true;
}

// 補「最近壹次收盤」（11-14，規劃 2.8l：週末、假日、還沒開過盤的時候畫面也要有真實價）：d 那天的收盤價 close { id: 價 }、前壹收盤 prev { id: 價 } 寫進 doc.days[d]
// （跟 twDocRoll 收進去的同壹個樣子，只是沒有盤中的 ser）。今天的資料就是 d、或 days 已經有 d 的收盤，就不動。回傳有沒有寫
export function twBackfill(doc, d, close, prev) {
  if (!doc || !/^\d{4}-\d{2}-\d{2}$/.test(String(d)) || doc.day === d) return false;
  if (doc.days && doc.days[d] && doc.days[d].close && Object.keys(doc.days[d].close).length) return false;
  const c = {}, p = {};
  for (const id of Object.keys(close || {})) if (okPx(close[id])) { c[id] = close[id]; if (prev && okPx(prev[id])) p[id] = prev[id]; }
  if (!Object.keys(c).length) return false;
  doc.days = Object.assign({}, doc.days);
  doc.days[d] = { openIdx: null, ser: {}, close: c, prev: p };
  return true;
}

// 把壹檔的圖表回應（Yahoo 的 v8 chart，1 分鐘 K 棒；格式的解析放這裡好測，不含股票代號，代號在 functions/stock_us.js）變成 { open, prev, px, lag }；day 是美東今天的日期，不是今天的 K 棒（假日、還沒開盤時介面回上壹個交易日）就當沒資料（回 null）。
//   open：今天第壹根 K 棒的開盤價；prev：前壹收盤（meta.chartPreviousClose）；px：最後壹根有價的 K 棒的收盤價；
//   lag：落後幾分鐘 ＝ 現在 − 最後壹根 K 棒的開始時間 − 1 分鐘（那壹根還在走的話，價就是現在的價，落後 0）。
export function usParseChart(json, day, nowMs) {
  const r = json && json.chart && json.chart.result && json.chart.result[0];
  const q = r && r.indicators && r.indicators.quote && r.indicators.quote[0];
  if (!r || !q || !Array.isArray(r.timestamp) || !Array.isArray(q.close)) return null;
  const o0 = usOpenMs(day), end = o0 + mkLen("us", day) * 60000;
  let open = null, px = null, last = null;
  r.timestamp.forEach((t, i) => {
    const ms = t * 1000;
    if (ms < o0 || ms > end) return; // 盤前盤後、別天的不算（也擋掉「今天還沒開盤，回的是昨天」）
    const c = q.close[i], o = q.open && q.open[i];
    if (open == null && typeof o === "number" && o > 0) open = o;
    if (typeof c === "number" && isFinite(c) && c > 0) { px = c; last = ms; }
  });
  const prev = r.meta && (r.meta.chartPreviousClose || r.meta.previousClose);
  if (open == null || px == null || !(prev > 0)) return null;
  return { open, prev, px, lag: Math.max(0, (nowMs - last) / 60000 - 1) };
}

// ---------- 美股（規劃 2.8i）：同樣的函式，換成美股的名單和設定 ----------
export const usDocNew = twDocNew;
export const usDocRoll = twDocRoll;
export const usNeed = (doc, idx) => twNeed(doc, idx, "us");
export const usApply = (doc, need, idx, got, secret) => twApply(doc, need, idx, got, secret, "us");
