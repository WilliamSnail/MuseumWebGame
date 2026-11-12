// ================================================================
//  限時活動（決定 0041）
//  翊文 11-09：「時不時要有一些限時活動，例如晚上8~10點合作打試煉可以更多獎勵之類的」
//
//  活動寫在每週內容裡：content/weeks/<週>/week.json 的 events（格式 content/README.md 第二節）：
//    { "id": "double11", "kind": "coopBoost", "date": "2026-11-11", "from": "20:00", "to": "22:00", "title": "…", "words": "…" }
//    時間都是台灣時間；不跨 05:00（一天從 05:00 換日）；date 在這週之內。
//  種類（EVENT_KINDS）：coopBoost 合作地下收藏庫的靈感變多、活動中多 1 趟有獎勵；trialBoost 試煉房間的技能成長變多。
//    加新種類：EVENT_KINDS 多一列、NUM.events 多數字、用到的地方多一個判斷；tools/week_check.cjs 自動認得。
//  誰說了算：
//    合作的加成：Functions 用伺服器時間判斷（functions/coop.js 按出發那一刻）。開始時在活動內，這一趟就照活動算到走完（記在 run.event），
//      22:01 才走完也不會被扣。玩家改電腦時間沒用。
//    試煉：畫面跑的，用 nowMs()（網路時間，決定 0026）。走進去那一刻在活動內，這一間就照活動算（記在房間的 extra.boost）。
//  沒有懲罰：錯過活動什麼都不會少；沒有倒數恐嚇。
//  純函式：時間（毫秒）從參數傳進來，不碰時鐘；亂數走 RNG。壞資料不丟錯（cleanEvents 把壞的丟掉）。
// ================================================================
import { NUM } from "./config.js";
import { RNG, TZ_HOURS, addDays, asList, taipeiDay } from "./logic.js";

// 種類。name：活動在哪裡有用；effect：一句話說加成（數字由 NUM.events 帶入）
export const EVENT_KINDS = {
  coopBoost: { name: "合作地下收藏庫", where: "地下收藏庫的「壹起下去」" },
  trialBoost: { name: "試煉房間", where: "地下收藏庫的試煉房間" },
  casinoBoost: { name: "賭場", where: "Hamachi 賭場的大禮包" },
  cellarChips: { name: "地下收藏庫的籌碼", where: "地下收藏庫的房間（單人、多人都算）" },
};
const EV_KINDS = Object.keys(EVENT_KINDS);
const EV_ID = /^[A-Za-z0-9_-]{1,32}$/, EV_HM = /^([01]\d|2[0-3]):([0-5]\d)$/, EV_DATE = /^\d{4}-\d{2}-\d{2}$/;
const evBox = v => !!v && typeof v === "object" && !Array.isArray(v);
const evChars = s => [...String(s)].length;

// ---------- 時間 ----------
// "20:00" → 從 00:00 起幾分鐘；格式不對回傳 null
export function eventMinutes(hm) {
  const m = typeof hm === "string" ? EV_HM.exec(hm) : null;
  return m ? +m[1] * 60 + +m[2] : null;
}
// 台灣時間的日期＋時間 → 毫秒。壞的回傳 null（台灣沒有夏令時間，固定 UTC+8）
export function eventAt(date, hm) {
  const min = eventMinutes(hm);
  if (typeof date !== "string" || !EV_DATE.test(date) || min === null) return null;
  const [y, m, d] = date.split("-").map(Number), t = Date.UTC(y, m - 1, d, 0, min - TZ_HOURS * 60);
  return Number.isFinite(t) && new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === date ? t : null;
}

// ---------- 檢查：回傳問題的清單（空的＝沒問題） ----------
// weekStart：這週的週一 "YYYY-MM-DD"（不給就不檢查日期在不在這週）。只管格式、時間、字數；禁用字、「壹」那些由 tools/week_check.cjs 查
export function eventProblems(raw, weekStart) {
  if (!evBox(raw)) return ["要寫成 { id, kind, date, from, to, title, words }"];
  const N = NUM.events, out = [];
  if (typeof raw.id !== "string" || !EV_ID.test(raw.id)) out.push("id 只能用英文、數字、-、_（最多 32 字）");
  if (!EV_KINDS.includes(raw.kind)) out.push(`kind 只能是 ${EV_KINDS.join("、")}`);
  if (typeof raw.date !== "string" || eventAt(raw.date, "00:00") === null) out.push("date 要是台灣的日期，像 2026-11-11");
  else if (weekStart && !(raw.date >= weekStart && raw.date <= addDays(weekStart, 6))) out.push(`date 要在這週之內（${weekStart} ～ ${addDays(weekStart, 6)}）`);
  const a = eventMinutes(raw.from), b = eventMinutes(raw.to);
  if (a === null) out.push("from 要寫成 20:00 這種（台灣時間，24 小時制）");
  if (b === null) out.push("to 要寫成 22:00 這種（台灣時間，24 小時制）");
  if (a !== null && b !== null) {
    if (a < eventMinutes(N.earliest)) out.push(`from 不能早於 ${N.earliest}（05:00 換日，活動不跨日）`);
    if (b <= a) out.push("to 要晚於 from（同一天裡，不跨 05:00）");
    else if (b - a < N.minMin) out.push(`太短了（最少 ${N.minMin} 分鐘）`);
    else if (b - a > N.maxMin) out.push(`太長了（最多 ${N.maxMin} 分鐘）`);
  }
  if (typeof raw.title !== "string" || !raw.title.trim()) out.push("title 要有字");
  else if (evChars(raw.title) > N.titleMax) out.push(`title 太長了（${evChars(raw.title)} 字，最多 ${N.titleMax}）`);
  if (typeof raw.words !== "string" || !raw.words.trim()) out.push("words 要有字");
  else if (evChars(raw.words) > N.wordsMax) out.push(`words 太長了（${evChars(raw.words)} 字，最多 ${N.wordsMax}）`);
  return out;
}

// ---------- 整理：一週的 events → 遊戲用的清單 ----------
// 壞的、重複的 id、超過 NUM.events.perWeek 場的都丟掉，不丟錯。label：週的名字（id 前面會加上，不同週可以用一樣的 id）。
// 回傳照開始時間排好：{ id, local, week, kind, date, from, to, title, words, start, end }（start、end 是毫秒）
export function cleanEvents(list, weekStart, label) {
  const seen = new Set(), out = [];
  asList(list).forEach(raw => {
    if (eventProblems(raw, weekStart).length || seen.has(raw.id)) return;
    seen.add(raw.id);
    out.push({ id: `${label || ""}/${raw.id}`, local: raw.id, week: label || null, kind: raw.kind, date: raw.date, from: raw.from, to: raw.to,
      title: raw.title.trim(), words: raw.words.trim(), start: eventAt(raw.date, raw.from), end: eventAt(raw.date, raw.to) });
  });
  return out.sort((x, y) => x.start - y.start).slice(0, NUM.events.perWeek);
}
// weeks：{ "2026-W46": week.json 的內容 }（網頁從 STORY_LIB 拿，Functions 從打包進去的資料拿）。回傳全部的活動，照開始時間排
export function eventsFromWeeks(weeks) {
  const out = [];
  if (!evBox(weeks)) return out;
  Object.keys(weeks).sort().forEach(label => {
    const wk = weeks[label];
    if (evBox(wk) && typeof wk.start === "string" && EV_DATE.test(wk.start)) out.push(...cleanEvents(wk.events, wk.start, label));
  });
  return out.sort((x, y) => x.start - y.start);
}

// ---------- 現在是不是在活動內 ----------
// 開始那一刻算在內，結束那一刻不算：20:00:00 開始、21:59:59 還在、22:00:00 結束
export const eventPhase = (ev, t) => (!ev || !Number.isFinite(t) ? "over" : t < ev.start ? "before" : t < ev.end ? "live" : "over");
// 現在進行中的活動（同一種有兩場重疊：先開始的）。kind 不給＝全部種類
export function eventsLive(list, t, kind) {
  return asList(list).filter(ev => ev && (!kind || ev.kind === kind) && eventPhase(ev, t) === "live").sort((x, y) => x.start - y.start);
}
export function eventLive(list, kind, t) { return eventsLive(list, t, kind)[0] || null; }
// 大廳那一條：進行中的（先），再加上「今天」（05:00 換日）還沒開始的下一場。[{ ev, phase: "live" | "soon", left（毫秒） }]
export function eventBars(list, t) {
  if (!Number.isFinite(t)) return [];
  const bars = eventsLive(list, t).map(ev => ({ ev, phase: "live", left: ev.end - t }));
  const day = taipeiDay(t), soon = asList(list).filter(ev => ev && ev.date === day && eventPhase(ev, t) === "before").sort((x, y) => x.start - y.start)[0];
  if (soon) bars.push({ ev: soon, phase: "soon", left: soon.start - t });
  return bars;
}
export const eventsOnDate = (list, date) => asList(list).filter(ev => ev && ev.date === date);
// 該跳「開跑了」通知的活動（決定 0045）：進行中、這台裝置還沒跳過（seen 是跳過的 id）、還剩夠久
export function eventsToNotify(list, t, seen) {
  const done = new Set(asList(seen)), min = NUM.events.noticeMinLeft * 60000;
  return eventsLive(list, t).filter(ev => !done.has(ev.id) && ev.end - t >= min);
}

// ---------- 一趟 / 一間 記下來的樣子（開始那一刻在活動內，就照這份算到走完） ----------
// 回傳 { id, kind, title, mult, extra, until }：extra 是多幾趟有獎勵（合作才有），until 是活動結束的毫秒（只給畫面顯示）
export function eventRunOf(ev) {
  if (!ev || !EVENT_KINDS[ev.kind]) return null;
  const c = NUM.events[ev.kind] || {};
  return { id: ev.id, kind: ev.kind, title: ev.title, mult: c.mult || 1, extra: c.extraTurns || 0, until: ev.end };
}
// 從資料庫讀回來的樣子補好；壞的回傳 null（run.event、房間的 extra.boost 用）
export function eventRunFix(b) {
  if (!evBox(b) || !EVENT_KINDS[b.kind]) return null;
  const mult = Number.isFinite(+b.mult) ? Math.min(5, Math.max(1, +b.mult)) : 1;
  return { id: typeof b.id === "string" ? b.id.slice(0, 80) : "", kind: b.kind, title: typeof b.title === "string" ? b.title.slice(0, 40) : "", mult,
    extra: Number.isInteger(b.extra) ? Math.min(1, Math.max(0, b.extra)) : 0, until: Number.isFinite(+b.until) ? +b.until : 0 };
}
// 多幾趟有獎勵：上限就是 1 趟（決定 0041），不管資料寫多少
export const eventExtraTurns = boost => (boost && boost.kind === "coopBoost" && boost.extra > 0 ? 1 : 0);
// 把一個數字乘上倍率。小數用亂數進位（1 × 1.5 → 一半 1、一半 2，平均 1.5）；沒有活動、倍率 ≤ 1、數字 ≤ 0 就原樣回傳（也不擲骰）
export function eventScale(boost, n) {
  const m = boost && Number.isFinite(+boost.mult) ? Math.min(5, +boost.mult) : 1;
  if (!(n > 0) || m <= 1) return n;
  const x = n * m, base = Math.floor(x + 1e-9), frac = x - base;
  return frac > 1e-9 && RNG() < frac ? base + 1 : base;
}

// ---------- 畫面的字（大廳、公佈欄、Discord 共用；都是草稿） ----------
const evNum = n => String(Math.round(n * 100) / 100);
export const eventRange = ev => `${ev.from}～${ev.to}`;
// 加成一句話
export function eventEffect(ev) {
  const c = (ev && NUM.events[ev.kind]) || {};
  if (ev && ev.kind === "coopBoost") return `記號對上、猜對、搬回來的靈感 ×${evNum(c.mult || 1)}，當天多 ${c.extraTurns || 0} 趟有獎勵`;
  if (ev && ev.kind === "trialBoost") return `試煉房間過關的技能成長 ×${evNum(c.mult || 1)}`;
  if (ev && ev.kind === "casinoBoost") return `賭場多 ${c.extraPacks || 1} 包免費大禮包（籌碼不是錢）`;
  if (ev && ev.kind === "cellarChips") return cellarChipsText();
  return "";
}
// 地下撿籌碼加碼的壹句話（「約 100 萬」：取 min、max 的中間，換成萬）
export function cellarChipsText() {
  const c = NUM.events.cellarChips || {}, mid = Math.round(((c.min || 0) + (c.max || 0)) / 2 / 10000);
  const pc = Number.isFinite(c.chance) ? `，撿到的機會提高到 ${Math.round(c.chance * 100)}%` : "";
  return `走完地下的房間撿到籌碼時，每次多約 ${mid} 萬${pc}（單人、多人都算）`;
}
// 開跑通知的字
export const eventNoticeText = ev => `限時活動開跑：${ev.title}。${eventEffect(ev)}。`;
// 一句話說加成（從記下來的樣子 eventRunOf 來；畫面上的標籤旁邊用）
export function eventBoostText(boost) {
  if (!boost) return "";
  const m = evNum(boost.mult || 1);
  if (boost.kind === "coopBoost") return `記號對上、猜對、搬回來的靈感 ×${m}${eventExtraTurns(boost) ? `，今天多 ${eventExtraTurns(boost)} 趟有獎勵` : ""}`;
  if (boost.kind === "trialBoost") return `試煉房間過關的技能成長 ×${m}`;
  if (boost.kind === "casinoBoost") return `賭場多 ${NUM.events.casinoBoost.extraPacks} 包免費大禮包`;
  if (boost.kind === "cellarChips") return cellarChipsText();
  return "";
}
// 畫面上標籤用的短句：「限時活動 ×1.5」
export const eventTag = boost => `限時活動 ×${evNum((boost && boost.mult) || 1)}`;
// 「今晚」或「今天」：18:00 以後開始的叫今晚
export const eventWhen = ev => (eventMinutes(ev.from) >= 18 * 60 ? "今晚" : "今天");
// 剩多久：1 小時以上寫「1 小時 23 分」，不到寫「23 分 05 秒」
export function eventLeftText(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h} 小時 ${m} 分` : `${m} 分 ${String(sec).padStart(2, "0")} 秒`;
}
// 大廳那條的字。soon：「今晚 20:00～22:00：○○」；live：「限時活動進行中：○○，還剩 …」
export function eventBarText(bar) {
  const ev = bar.ev;
  return bar.phase === "live" ? `限時活動進行中：${ev.title}（還剩 ${eventLeftText(bar.left)}）` : `${eventWhen(ev)} ${eventRange(ev)}：${ev.title}`;
}
// 公佈欄、每週劇情畫面、Discord 列出這週的活動（每場一行）
export const eventListLine = ev => `${ev.date.slice(5).replace("-", "/")} ${eventRange(ev)}　${ev.title}：${eventEffect(ev)}`;
