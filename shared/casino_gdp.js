// ================================================================
//  館內 GDP 和景氣指數（11-13，數值平衡；docs/經濟體系規劃.md 2.7 節，翊文同意）
//  純函式，只讀每天快照相減的結果（shared/casino_book.js 的 casBookDiff）。
//  為什麼用「活動量」不用金額：拚經濟一次撥多少、21 點一把賺賠都是亂數，直接加金額，每週成長率的標準差有 34～59%，景氣指數等於擲硬幣
//  （test/sim_gdp.cjs）。所以每項活動用「次數 × 固定的標準值」，運氣不算進去。
//    GDP ＝ 消費 ＋ 投資 ＋ 政府支出 ＋ 淨出口
//    消費 ＝ 餐車購買數 × foodAvg ＋ 21 點手數 × bjHand
//    投資 ＝ max(0, 這段時間銀行存款的淨增加) × investPct%
//    政府支出 ＝ 拚經濟成功次數 × econWin
//    淨出口 ＝ 門票收入（館外進來的，三份加起來）－ 拚經濟失敗次數 × econSink（沉到海底的平均）
//  景氣指數 B（−1～+1）＝ 0.5 × 館內指數 ＋ 0.5 × 外部景氣（台灣 GDP 年增率；還沒接資料，先當 0）
//    館內指數 B_in ＝ 0.5 × 昨天的 B_in ＋ 0.5 × clamp(成長率 ÷ growthFull, −1, 1)
//    成長率 ＝（近 7 天合計 － 前 7 天合計）÷ 前 7 天合計；過去 7 天來過的人少於 minPeople 時 B_in ＝ 0（樣本太少）
//  影響（拚經濟撥款、門票、利率、股價）下一個 PR 接，這裡只算指數。
// ================================================================
import { NUM } from "./config.js";

const gdNz = n => (Number.isFinite(+n) ? Math.floor(+n) : 0);
const gdClamp = (x, a, b) => Math.min(b, Math.max(a, x));
const gdAddDays = (s, n) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const gdDays = (a, b) => { const f = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((f(b) - f(a)) / 86400000); };

// 這段時間的 GDP（diff：casBookDiff 的結果）。回傳 { C, I, G, NX, total }（總共；除以天數是每天）
export function casGdpOf(diff) {
  const K = NUM.casino.gdp, a = (diff && diff.act) || {}, mint = (diff && diff.mint) || {}, hm = (diff && diff.houseMint) || {};
  const C = gdNz(a.food) * K.foodAvg + gdNz(a.bjHands) * K.bjHand;
  const I = Math.floor(Math.max(0, gdNz(diff && diff.bank)) * K.investPct / 100);
  const G = gdNz(a.econWin) * K.econWin;
  const ticket = gdNz(mint.ticket) + gdNz(hm.ticketBudget) + gdNz(hm.ticketMuseum);
  const NX = ticket - gdNz(a.econFail) * K.econSink;
  return { C, I, G, NX, total: C + I + G + NX };
}
// 景氣的字
export const casGdpLabel = b => (b > 0.3 ? "景氣好" : b < -0.3 ? "景氣差" : "景氣普通");

// hist：之前每一份快照的 { from, to, total }（from 是上一份的日期，第一份是 null），照時間由舊到新，最後一份是今天（to＝day）。
// 每一份蓋了好幾天（很久沒人來看）就平均分到每一天。prevBIn：昨天的館內指數（沒有就 0）。active：過去 7 天來過幾個人
// 回傳 { perDay（今天這份平均每天的 GDP）, g（成長率，不夠資料是 null）, bIn, bExt, b, label, active }
export function casGdpIndex(hist, prevBIn, active, bExt = 0) {
  const K = NUM.casino.gdp, days = {};
  (hist || []).forEach(h => {
    if (!h || !h.to) return;
    const span = h.from ? Math.max(1, gdDays(h.from, h.to)) : 1; // 第一份沒有 from：當一天
    for (let i = 0; i < span; i++) days[gdAddDays(h.to, -i)] = gdNz(h.total) / span;
  });
  const last = hist && hist.length ? hist[hist.length - 1] : null;
  const end = last && last.to;
  const out = { perDay: end ? Math.floor(days[end] || 0) : 0, g: null, bIn: 0, bExt: gdClamp(+bExt || 0, -1, 1), b: 0, label: "", active: gdNz(active) };
  if (end) {
    const sum = (from, n) => { let t = 0, c = 0; for (let i = 0; i < n; i++) { const k = gdAddDays(from, -i); if (k in days) { t += days[k]; c++; } } return { t, c }; };
    const now = sum(end, 7), before = sum(gdAddDays(end, -7), 7);
    if (now.c === 7 && before.c === 7 && before.t > 0) out.g = (now.t - before.t) / before.t; // 兩段都有 7 天的資料才算
  }
  if (out.g !== null && out.active >= K.minPeople) out.bIn = 0.5 * gdClamp(+prevBIn || 0, -1, 1) + 0.5 * gdClamp(out.g / K.growthFull, -1, 1);
  else if (out.g === null) out.bIn = gdClamp(+prevBIn || 0, -1, 1); // 資料還不夠：維持昨天的
  out.b = Math.round((0.5 * out.bIn + 0.5 * out.bExt) * 1000) / 1000;
  out.bIn = Math.round(out.bIn * 1000) / 1000;
  out.label = casGdpLabel(out.b);
  return out;
}

// ---------- 外部景氣（content/economy.json，每日排劇情的排程更新） ----------
// econ：{ gdp: { quarter, yoy, history[…最近四季，最後一個是最新], published } }。回傳 { b（−1～+1）, ok, quarter, yoy, mean }
export function casGdpExt(econ, day) {
  const K = NUM.casino.gdp, g = econ && econ.gdp, none = { b: 0, ok: false, quarter: g && g.quarter ? String(g.quarter) : "" };
  if (!g || !Array.isArray(g.history)) return none;
  const h = g.history.map(Number).filter(Number.isFinite);
  if (h.length < 2) return none;
  if (day && typeof g.published === "string" && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(g.published) && gdDays(g.published, day) > K.extStaleDays) return Object.assign({}, none, { stale: true }); // 太久沒更新：當 0
  const mean = h.reduce((a, b) => a + b, 0) / h.length, yoy = Number.isFinite(+g.yoy) ? +g.yoy : h[h.length - 1];
  return { b: Math.round(gdClamp((yoy - mean) / K.extSpread, -1, 1) * 1000) / 1000, ok: true, quarter: String(g.quarter || ""), yoy, mean };
}

// ---------- 景氣的影響 ----------
// 莊家文件裡：house.econ.b（最新的景氣，日報產生時寫），house.pol { idx, fx, day }（最近一次拚經濟成功抽到的政策）
export const casFxMood = house => gdClamp(+((house && house.econ && house.econ.b) || 0), -1, 1);
// 景氣對錢的倍率：1 ± fxPct%
export const casFxMul = house => 1 + NUM.casino.gdp.fxPct / 100 * casFxMood(house);
// 政策現在有沒有效（抽到那天和 polDays 天內）
export const casFxPolicyOn = (house, day) => !!(house && house.pol && typeof house.pol.day === "string" && day && gdDays(house.pol.day, day) >= 0 && gdDays(house.pol.day, day) <= NUM.casino.gdp.polDays);
// 政策對某項的倍率。kind："ticket"（門票）、"find"（地下撿）、"econ"（拚經濟撥款）
export function casFxPolicy(house, day, kind) {
  if (!casFxPolicyOn(house, day)) return 1;
  const fx = house.pol.fx, p = NUM.casino.gdp.polPct / 100;
  if (kind === "ticket" && fx === "tourism") return 1 + p;
  if (kind === "find" && fx === "cellar") return 1 + p;
  if (kind === "econ" && fx === "grant") return 1 + p;
  if (kind === "econ" && fx === "tighten") return 1 - p;
  return 1;
}
// 政策的白話（日報和拚經濟的畫面用）
export const CAS_FX_TEXT = { tourism: "門票多一成", cellar: "地下撿到的籌碼多一成", grant: "拚經濟的撥款多一成", tighten: "拚經濟的撥款少一成，預算池少花一些" };

// ---------- 銀行廳的「財報」頁（11-14，翊文：「接著做: 股票、財報」） ----------
// 資料是日報產生時寫進莊家的 house.econ（b、perDay、g、rows…），這裡只整理成畫面要的格式。
// 回傳 null＝還沒有第壹份日報，畫面會寫「即將開放」。
// 回傳 { gdp 每天的館內 GDP, growth 成長率（小數，沒資料是 0）, idx 景氣 −1～+1, news 壹句話, report [[項目, 數字]…] }
export function casBankEcon(house) {
  const e = house && house.econ;
  if (!e || typeof e !== "object" || !e.day) return null;
  const idx = gdClamp(+e.b || 0, -1, 1);
  const rows = (Array.isArray(e.rows) ? e.rows : []).filter(r => Array.isArray(r) && r.length === 2).map(r => [String(r[0]), String(r[1])]);
  return { gdp: gdNz(e.perDay), growth: typeof e.g === "number" && isFinite(e.g) ? e.g : 0, idx, news: casEconNews(e), report: rows };
}
// 今天的壹句新聞：照景氣、昨天最熱鬧的那件事、預算池的狀況挑。純函式，不抽亂數（每個人看到的壹樣）
export function casEconNews(e) {
  const T = CAS_NEWS, idx = gdClamp(+(e && e.b) || 0, -1, 1);
  const parts = [idx > 0.3 ? T.good : idx < -0.3 ? T.bad : T.flat];
  if (e && e.top) parts.push(gdFill(T.top[e.top.key] || T.top.other, { n: gdNum(e.top.n) }));
  if (e && e.frozen) parts.push(T.frozen);
  else if (e && typeof e.g === "number" && isFinite(e.g) && Math.abs(e.g) >= 0.05) parts.push(gdFill(e.g > 0 ? T.up : T.down, { p: Math.abs(e.g * 100).toFixed(0) }));
  return parts.join("");
}
const gdNum = n => Number(gdNz(n)).toLocaleString("en-US");
const gdFill = (s, o) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in o ? String(o[k]) : m));
// 新聞的句子。草稿，Yuga 可以改
export const CAS_NEWS = {
  good: "館裡這幾天熱鬧，帳上看得出來。",
  flat: "館裡壹切照舊，帳也照舊。",
  bad: "館裡冷清了些，帳上的數字跟著縮。",
  top: {
    food: "餐車昨天賣了 {n} 份，窗口前面排了隊。",
    bjHands: "昨天牌桌上打了 {n} 手，荷官的手沒停過。",
    econWin: "拚經濟昨天成功 {n} 次，Yuga Bot 很得意。",
    ticketPeople: "昨天有 {n} 位參觀者買票進來。",
    other: "",
  },
  up: "館內 GDP 比前七天多了 {p}%。",
  down: "館內 GDP 比前七天少了 {p}%。",
  frozen: "預算池見底，拚經濟的撥款凍結中。",
};

// ---------- 世界股市新聞（11-14，翊文：「館內訊息以外可以抓最新世界相關股市訊息改成遊戲內版本」） ----------
// 每天排劇情的排程把「昨天外面股市發生的事」改寫成遊戲裡的新聞，寫在 content/weeks/<週>/dN.json 的 market（3～5 則）。
// 只描述已經發生的事、用模糊的話，不放真名、不放數字、不預測。格式和規矩看 content/README.md、content/排程說明.md 一之十。
// copy_shared.cjs 把它打包進 functions/shared/day_data.js（依日期），這裡只負責挑出要給畫面的樣子。
export const WORLD_NEWS = { min: 3, max: 5, title: 14, line: 40, days: 3, tones: ["up", "down", "flat"] };
// 整理壹則新聞（壞的回 null）。refs 換成 [{ id, name }]，只留遊戲裡有的股票（OUT_STOCKS 的 id）
export function casWorldItem(x, stocks) {
  if (!x || typeof x !== "object" || typeof x.title !== "string" || typeof x.line !== "string") return null;
  const title = x.title.trim(), line = x.line.trim();
  if (!title || !line) return null;
  const tone = WORLD_NEWS.tones.includes(x.tone) ? x.tone : "flat";
  const ids = Array.isArray(x.ref) ? x.ref : typeof x.ref === "string" ? [x.ref] : [];
  const refs = [];
  for (const id of ids) { const s = (stocks || []).find(d => d.id === id); if (s && !refs.some(r => r.id === id)) refs.push({ id: s.id, name: s.name }); }
  return { title: [...title].slice(0, WORLD_NEWS.title).join(""), line: [...line].slice(0, WORLD_NEWS.line).join(""), tone, refs };
}
// 給銀行廳「財報」頁的世界新聞：dayData ＝ { "YYYY-MM-DD": { market: [...] } }（functions/shared/day_data.js 的 DAY_DATA）。
// 回 { days: [{ day, items: [{ title, line, tone: "up"|"down"|"flat", refs: [{ id, name }] }] }] }：今天（或最近有寫的那天）起往前最多 3 天，新的在前；沒有就是空陣列
export function casWorldNews(dayData, day, stocks) {
  const days = [];
  if (!dayData || typeof dayData !== "object" || !day) return { days };
  const keys = Object.keys(dayData).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k) && k <= day).sort().reverse();
  for (const k of keys) {
    const m = dayData[k] && dayData[k].market;
    if (!Array.isArray(m)) continue;
    if (gdDaysBetween(k, day) > 7) break; // 太久以前的不放
    const items = m.slice(0, WORLD_NEWS.max).map(x => casWorldItem(x, stocks)).filter(Boolean);
    if (items.length) days.push({ day: k, items });
    if (days.length >= WORLD_NEWS.days) break;
  }
  return { days };
}
const gdDaysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
