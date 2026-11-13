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
const twClamp = x => { const b = NUM.casino.stock.tw.band / 100; return Math.max(1 - b, Math.min(1 + b, x)); };
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
    if (old.day && old.openIdx != null && old.ser) doc.days[old.day] = { openIdx: old.openIdx, ser: old.ser };
    for (const d of Object.keys(doc.days).sort().slice(0, -(keep || 5))) delete doc.days[d];
  }
  return doc;
}

// 這個分鐘（idx）要做什麼：null＝沒事；{ kind: "giveup" }；{ kind: "open", fetch: true }；{ kind: "seg", j, fetch: true|false }
//   fetch false ＝ 錨點時間過了 retry 分鐘還沒抓到：不抓了，這壹段真實成分當 0 直接算
export function twNeed(doc, idx) {
  const C = NUM.casino.stock.tw;
  if (!doc || doc.closed || idx == null || idx < 0 || idx > C.len) return null;
  if (doc.openIdx == null) return idx >= C.giveUp ? { kind: "giveup" } : { kind: "open", fetch: true };
  const j = doc.k + 1;
  if (j >= C.len / C.seg) return null;
  if (idx < j * C.seg) return null;
  return { kind: "seg", j, fetch: idx - j * C.seg < C.retry };
}

// 把 ser 補到第 upto 分鐘（不夠的用目前錨點平的補上）
function twPad(arr, upto, a) { while (arr.length <= upto) arr.push(a); }

// 建第 j 段的橋，回傳下壹個錨點。ser 已經補到起點。
function twBuild(doc, id, j, secret, ret, x, hasReal) {
  const C = NUM.casino.stock.tw, sd15 = (C.sd15[id] || 0.5) / 100;
  const r = twRng(twSeed(`${secret}|${doc.day}|${id}|${j}`));
  const amp = hasReal ? sd15 * Math.sqrt(1 - x * x) : sd15;
  const a = doc.A[id];
  const b = twRound(twClamp(a * (1 + (hasReal ? x * ret : 0) + amp * twNorm(r))));
  const arr = doc.ser[id];
  const s = arr.length - 1, e = Math.min(C.len, (j + 1) * C.seg);
  const n = e - s;
  if (n > 0) {
    // 布朗橋：W 是隨機走，橋 ＝ W(i) − (i/n)·W(n)，兩端回到 0
    const W = [0];
    for (let i = 1; i <= n; i++) W.push(W[i - 1] + twNorm(r) * C.minSd / 100);
    const base = arr[s];
    for (let i = 1; i <= n; i++) {
      const u = i / n, line = base * Math.pow(b / base, u);
      arr.push(i === n ? b : twRound(twClamp(line * Math.exp(W[i] - u * W[n]))));
    }
  }
  doc.A[id] = b;
}

// 做完 need 該做的事。got：抓到的資料 { id: { open, prev, px, lag(分鐘) } } 或 null（沒抓到）。回傳新的 doc（會改傳進來的 doc）。
// open：got[id].open 是真實開盤價、prev 是真實前壹收盤；seg：got[id].px 是這次抓到的真實價。壞資料（非數字）當作這支沒抓到。
// 回傳 false＝沒做成（open 沒有任何壹支有資料，下壹分鐘再試）
export function twApply(doc, need, idx, got, secret) {
  const C = NUM.casino.stock.tw;
  if (!need) return true;
  if (need.kind === "giveup") { doc.closed = true; return true; }
  const g = got && typeof got === "object" ? got : {};
  if (need.kind === "open") {
    const okIds = TW_IDS.filter(id => g[id] && okPx(g[id].open) && okPx(g[id].prev));
    if (!okIds.length) return false;
    const j = Math.floor(idx / C.seg);
    doc.openIdx = idx; doc.k = j - 1; doc.stale = {};
    for (const id of TW_IDS) {
      const ok = okIds.includes(id);
      doc.A[id] = ok ? twRound(twClamp(g[id].open / g[id].prev)) : 1;
      doc.prevReal[id] = ok ? g[id].prev : null;
      doc.R[id] = ok ? { px: g[id].open, seg: j } : null;
      doc.lag[id] = ok && Number.isFinite(+g[id].lag) ? +g[id].lag : null;
      if (!ok) doc.stale[id] = true;
      doc.ser[id] = [];
      twPad(doc.ser[id], idx, doc.A[id]);
    }
    return twSegment(doc, j, idx, null, secret, true);
  }
  return twSegment(doc, need.j, idx, need.fetch ? g : null, secret, false);
}

function twSegment(doc, j, idx, g, secret, opening) {
  const C = NUM.casino.stock.tw;
  const stale = opening ? Object.assign({}, doc.stale) : {};
  for (const id of TW_IDS) {
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
    twBuild(doc, id, j, secret, ret, x, hasReal);
  }
  doc.stale = stale;
  doc.k = j;
  doc.log = (doc.log || []).concat([{ j, idx, lag: Math.max(0, ...TW_IDS.map(id => Number.isFinite(+doc.lag[id]) ? +doc.lag[id] : 0)), stale: Object.keys(stale).length }]).slice(-40);
  return true;
}
