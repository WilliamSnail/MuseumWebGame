// ================================================================
//  公用的「每日重要事件」清單（翊文 11-15：「各種每日重要事件包括每日經濟事件的跑馬燈」）
//  大廳跑馬燈叫它；之後日報、Discord 也能叫。**排序、每種最多幾則、哪些算重要，只寫在這壹處。**
//    todayHeadlines(data, day) → [{ kind, text, tone, link, upcoming? }]（最多 HL.max 則）
//      day：台灣的「今天」（05:00 換日，用 todayStr()）。只放今天的；過去的不放；預告（明天以後）最多壹則，標 upcoming。
//      data 每個欄位都可以沒有（沒有就跳過）：
//        policy   本日政策 { name, effect, day, until }
//        econ     財報 { news 今天的景氣壹句, idx, report: [[名字, 數字]]（昨天發生的事）, world: { events: [{ day, text }] } }
//        market   世界市場 [{ day, items: [{ title, line, tone }] }]（bankHall.world.days）
//        events   限時活動 [{ title, phase: "live"|"soon", text }]（大廳那條已經算好的字）
//        notices  公佈欄 [{ id, title, importance, publish }]
//        upcoming 預告 [{ text, date }]
//      tone：good／neutral／warn／bad（顏色由畫面元件決定）；link：bank／board／casino／events（畫面決定怎麼跳）
//  純函式，不碰 DOM。
// ================================================================
export const HL = { max: 10, policy: 1, mood: 1, world: 2, market: 3, report: 2, events: 2, notices: 2, upcoming: 1 };
const HL_RANK = { urgent: 3, important: 2 };
const hlStr = x => (typeof x === "string" ? x.trim() : "");
const hlArr = x => (Array.isArray(x) ? x : []);

export function todayHeadlines(data, day) {
  const d = data || {}, out = [], add = (kind, text, tone, link, extra) => { const t = hlStr(text); if (t) out.push(Object.assign({ kind, text: t, tone: tone || "neutral", link: link || null }, extra || {})); };
  const take = (list, n, fn) => { hlArr(list).slice(0, n).forEach(fn); };
  if (d.policy && hlStr(d.policy.name) && (!d.policy.day || d.policy.day <= day) && (!d.policy.until || d.policy.until >= day)) add("policy", `本日政策：${d.policy.name}${hlStr(d.policy.effect) ? `（${d.policy.effect}）` : ""}`, "warn", "casino");
  const e = d.econ || null;
  if (e && hlStr(e.news)) add("mood", e.news, e.idx > 0.3 ? "good" : e.idx < -0.3 ? "bad" : "neutral", "bank");
  take(e && e.world && hlArr(e.world.events).filter(x => x && x.day === day), HL.world, x => add("world", x.text, "warn", "bank"));
  const today = hlArr(d.market).find(x => x && x.day === day);
  take(today && today.items, HL.market, x => add("market", x && x.title ? `${x.title}${hlStr(x.line) ? `：${x.line}` : ""}` : "", x && x.tone === "up" ? "good" : x && x.tone === "down" ? "bad" : "neutral", "bank"));
  take(e && e.report, HL.report, r => r && add("report", `${r[0]}：${r[1]}`, "neutral", "bank"));
  take(d.events, HL.events, x => x && add("event", x.text || x.title, x.phase === "live" ? "good" : "neutral", "events"));
  take(hlArr(d.notices).filter(n => n && HL_RANK[n.importance] && n.publish === day).sort((a, b) => HL_RANK[b.importance] - HL_RANK[a.importance]), HL.notices, n => add("notice", n.title, n.importance === "urgent" ? "bad" : "neutral", "board"));
  const up = hlArr(d.upcoming).filter(x => x && hlStr(x.text) && (!x.date || x.date > day))[0];
  const head = out.slice(0, up ? HL.max - 1 : HL.max);
  if (up) head.push({ kind: "upcoming", text: "預告：" + hlStr(up.text), tone: "neutral", link: "bank", upcoming: true });
  return head;
}
// 播放順序（翊文 11-15：「跑馬燈顯示的訊息順序可以隨機嗎」）：每則第壹次看到時抽壹個號碼記在 ranks（Map）裡，之後照號碼排。
// 呼叫的地方每次進大廳新開壹個 ranks：同壹次停留中順序不變（不會每則重抽、同壹則連出現）；新來的事件插進隨機的位置，舊的不重洗。只換順序，內容不增不減。
export function orderHeadlines(list, ranks, rng) {
  const arr = hlArr(list).slice();
  arr.forEach(x => { if (!ranks.has(x.text)) ranks.set(x.text, rng()); });
  return arr.sort((a, b) => ranks.get(a.text) - ranks.get(b.text));
}
// 沒有事件時顯示的壹句平常的話（跑馬燈用）
export const HL_QUIET = "今天館裡很平靜。";
