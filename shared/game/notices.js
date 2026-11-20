// ================================================================
//  館內公佈欄（翊文 11-08：「要像其他遊戲有個公佈欄」→「公佈欄和信箱」）
//  做法見規劃第四節「館內公佈欄」：兩個頁籤、每則有發布和下架的日期、點開內文才算讀過、重要的才在導覽列的「公佈欄」頁籤蓋紅色火漆印。
//  第 4 版先寫在這裡，跟著程式一起更新；有伺服器之後改成伺服器照時間給（格式不變）。
//  純函式：讀狀態、回傳結果；「讀過了」記在 SAVE.notices（傳進來的 state），規則這邊不碰 localStorage。
//
//  一則公告的欄位：
//    id         唯一的名字
//    v          版本：內容大改、要讓大家重新看到就 +1（小修改不用）
//    cat        "館方公告" 或 "特展活動"
//    tags       小標籤：重要、維護、更新、活動、館長的話、已更新
//    importance "low"（只在公佈欄裡標）、"normal"、"important"（導覽列的「公佈欄」蓋火漆印）、"urgent"（登入時直接打開）
//    pinned     置頂標記（11-12 起不影響排序，公佈欄壹律新的在最上面；只剩「不併進某日的更新」的作用）
//    title      標題（兩行以內）
//    publish／expire  發布、下架的日期（台灣日期，含當天；跟 todayStr 一樣台灣時間 05:00 換日）
//    start／end 活動期間（可以不填）
//    sections   [[段落名, [句子, …]], …]，畫面會寫成「〓段落名〓」
//    area       （選填，11-14 起）同壹天的更新合成壹張時，歸在哪壹段：NOTICE_AREAS 其中壹個。沒寫就照 id 的關鍵字自動歸（noticeArea），歸不了的進「其他」。新公告請寫
//    cta        「前往」按鈕：{ label, room, params } 或 { label, panel: "mail" }
//    gift       附在信箱的獎勵：{ id, title, insp, mood }（shared/social/mailbox.js 會寄出去，一個 id 只寄一次）
//  介面文字照第 1 代用「壹」。
// ================================================================
import { WEEKLY_TEXT } from "../systems_text.js";
import { weekIndex } from "../logic_base.js";
import { weeklyTheme } from "../story/themeshow.js";
import { holidayNotices } from "../story/holidays.js";
// 公告資料：content/notices/<id>.json → tools/content/notices_build.cjs 合成這個檔（不進 git）
import { NOTICES_DATA } from "./notices_data.js";

export const NOTICE_CATS = ["館方公告", "特展活動"];
// 同壹天的更新合成壹張時的分段（翊文 11-14：「保持一張但分段加目錄」）：順序就是畫面上的順序
export const NOTICE_AREAS = ["股票與銀行", "NPC 與展廳", "畫廊與拍賣", "賭場", "各廳新介面", "地下與劇情", "其他"];
// 這則公告歸哪壹段：明寫的 area 優先；沒寫就看 id（先中先贏，順序重要：「gallery-new」是介面、「hall-art」是畫）
const AREA_RULES = [
  ["賭場", /casino|yuga-daily|policy/],
  ["各廳新介面", /onescreen|ui2|-new$|landscape|portrait|layout|lobby|library|workshop|pillow|fusion|office|gallery|ws-|pass-avatar/],
  ["股票與銀行", /stock|bank|lev|bond|house-inv|world-pool|loan|moc-|culture|economy|report-economy|budget|house-health/],
  ["畫廊與拍賣", /art|auction/],
  ["地下與劇情", /cellar|lost-found|nameplate|regulars|commission|lesson|fight|story|week|coop/],
  ["NPC 與展廳", /npc|crowd|hall|review|visitor|fest|guest/],
];
export function noticeArea(n) {
  if (n && NOTICE_AREAS.includes(n.area)) return n.area;
  const id = String((n && n.id) || "");
  for (const [area, re] of AREA_RULES) if (re.test(id)) return area;
  return "其他";
}
const RANK = { urgent: 3, important: 2, normal: 1, low: 0 };

// 館方公告的資料：一則一個檔 content/notices/<id>.json（npm run notice 加新的），tools/content/notices_build.cjs 合成 shared/game/notices_data.js
export const NOTICES = NOTICES_DATA;

// 這週的特展（跟展廳的「本週特展」同一個主題）。台灣時間週一 05:00 換週（決定 0019，weekIndex）
export function weeklyNotice(P) {
  if (!P || !P.day) return null;
  const date = P.day.date, theme = weeklyTheme(date), T = WEEKLY_TEXT[theme] || { name: theme, rule: "" };
  return {
    id: "weekly-" + weekIndex(date), v: 1, cat: "特展活動", tags: ["活動"], importance: "normal", weekly: true,
    title: `本週特展：${T.name}`, publish: null, expire: null,
    sections: [
      ["內容", [T.rule, "照規則擺滿展廳的特展區，分數會記下來；之後館裡的人可以壹起比。"]],
      ["時間", ["台灣時間每週壹 05:00 換壹個主題，大家的這壹週都壹樣。"]],
    ],
    cta: { label: "去展廳的本週特展", room: "hall", params: { tab: "weekly" } },
  };
}

// 別的檔加進來的公告（例如每週劇情的「本週地下收藏庫」，web/src/panels/ui_story.js 登記）：一筆是 (P, today) => 公告或 null
export const NOTICE_EXTRA = [];
// 這則今天看得到嗎：已經發布、還沒下架（日期含當天）。Discord 的 /pepe-更新 也用這個判斷
export function noticeLive(n, today) { return !!n && (!n.publish || n.publish <= today) && (!n.expire || today <= n.expire); }
// 現在看得到的公告：已經發布、還沒下架；照發布日期新的在前
export function visibleNotices(P, today) {
  const list = NOTICES.filter(n => noticeLive(n, today));
  const w = weeklyNotice(P);
  if (w) list.push(w);
  list.push(...holidayNotices(today)); // 節日公告：節日前兩天貼、節日最後一天下架（shared/story/holidays.js，決定 0030）
  NOTICE_EXTRA.forEach(f => { const n = f(P, today); if (n) list.push(n); });
  // 排序：新的在前 → 同壹天重要的在前 → 寫在前面的在前。置頂（pinned）不再影響排序
  // （翊文 11-12：「最新的要在最上面」——11-10 的版本是置頂優先，置頂的「開館」「結伴下樓」壓在 11-12 的更新上面）
  // 沒寫發布日的（每週特展）視為最新。Array.sort 是穩定的，同日同重要程度照寫的先後
  return list.sort((a, b) => String(b.publish || "9999").localeCompare(String(a.publish || "9999")) || (RANK[b.importance] - RANK[a.importance]));
}

// 公佈欄上要貼的：同壹天的小更新合成壹則「N 月 N 日的更新」（翊文 11-10：「同一整天的更新都合在同一則公告如何？」）
//   合的：館方公告（不重要、普通、重要都合）、沒置頂、沒附獎勵；同壹天有 2 則以上才合
//   不合的：緊急的（登入直接打開）、置頂、每週特展、節日、活動、附獎勵的
//   11-14 翊文：「可以之後自動把 同一天的公告放在同一篇裡面嗎」：重要的也合進去（以前重要的各自壹張，11-14 壹天七、八張），
//   合起來那張的重要度取裡面最高的，所以有重要的就照樣蓋火漆印
//   合起來的那則：{ id: "day-日期", digest: true, parts: [原本的公告…] }。已讀照原本各則的記（isUnread、markRead 會看 parts），
//   所以舊的已讀紀錄不用搬；當天又多壹項，那則會再變成沒讀。寄信、Discord 還是用 visibleNotices（壹則壹則）
//   11-13 起不看標籤：以前只收「更新」「已更新」，標「調整」「修正」「維護」的就單獨成壹張，11-13 壹天十幾張
function digestable(n) {
  return n.cat === "館方公告" && !n.pinned && !n.weekly && !n.gift && !n.start && !n.end && typeof n.publish === "string" &&
    RANK[n.importance] <= RANK.important;
}
export function digestNotices(list) {
  const by = {};
  list.forEach(n => { if (digestable(n)) (by[n.publish] || (by[n.publish] = [])).push(n); });
  const out = [], done = {};
  list.forEach(n => {
    const g = digestable(n) ? by[n.publish] : null;
    if (!g || g.length < 2) { out.push(n); return; }
    if (done[n.publish]) return;
    done[n.publish] = true;
    const [, m, d] = n.publish.split("-");
    out.push({
      id: "day-" + n.publish, digest: true, v: 1, cat: "館方公告", tags: ["更新"], publish: n.publish, parts: g,
      importance: g.some(x => x.importance === "important") ? "important" : g.some(x => x.importance === "normal") ? "normal" : "low",
      title: `${+m} 月 ${+d} 日的更新（${g.length} 項）`,
      // 分段（目錄用）：每段裡重要的排前面（同重要度照原本的順序），段的順序照 NOTICE_AREAS；每則都在某壹段、壹則只在壹段
      groups: NOTICE_AREAS.map(area => ({ area, parts: g.filter(x => noticeArea(x) === area).sort((a, b) => RANK[b.importance] - RANK[a.importance]) })).filter(x => x.parts.length),
    });
  });
  return out;
}
export function boardNotices(P, today) { return digestNotices(visibleNotices(P, today)); }

// 活動期間的狀態：進行中／快開始／已結束；沒寫期間就是 null
export function noticeStatus(n, today) {
  if (!n.start && !n.end) return null;
  if (n.start && today < n.start) return "快開始";
  if (n.end && today > n.end) return "已結束";
  return "進行中";
}

// 讀過了沒（記在 SAVE.notices.read：id → 讀過的版本）
export function noticeState(save) {
  if (!save.notices || typeof save.notices !== "object") save.notices = {};
  const s = save.notices;
  if (!s.read || typeof s.read !== "object") s.read = {};
  return s;
}
export function isUnread(state, n) { return n.parts ? n.parts.some(x => isUnread(state, x)) : (state.read[n.id] || 0) < (n.v || 1); }
export function markRead(state, n) { if (n.parts) n.parts.forEach(x => markRead(state, x)); else state.read[n.id] = n.v || 1; }
export function markAllRead(state, list) { list.forEach(n => markRead(state, n)); }

// 導覽列的「公佈欄」頁籤：火漆印（有沒讀的重要公告）、沒讀的數量（不算 low）
export function boardBadge(state, list) {
  const unread = list.filter(n => isUnread(state, n));
  return {
    seal: unread.some(n => RANK[n.importance] >= RANK.important),
    count: unread.filter(n => RANK[n.importance] >= RANK.normal).length,
  };
}

// 登入時要不要自動打開：緊急的沒讀 → 直接打開那一則；有沒讀的（normal 以上）、今天沒勾「不再自動打開」→ 打開公佈欄
export function autoOpenPlan(state, list, today) {
  const unread = list.filter(n => isUnread(state, n));
  const urgent = unread.find(n => n.importance === "urgent") || null;
  if (urgent) return { urgent, open: false, focus: urgent.id };
  const worth = unread.filter(n => RANK[n.importance] >= RANK.normal);
  if (!worth.length || state.skip === today) return { urgent: null, open: false, focus: null };
  return { urgent: null, open: true, focus: worth[0].id };
}
export function skipToday(state, today) { state.skip = today; }

// ---------- 有新版本（翊文 11-10：「好，加提示」；畫面在 web/src/core/ui_update.js） ----------
// 從 index.html（或 script 的 src 連在壹起的字）找打包後的程式檔名「/assets/index-xxxx.js」；找不到（開發時）是 null
export function buildScript(text) {
  const m = /\/assets\/index-[A-Za-z0-9_-]+\.js/.exec(String(text || ""));
  return m ? m[0] : null;
}
// 新拿到的 index.html 裡的程式檔名跟現在跑的不壹樣，就是有新版本。拿不到檔名（伺服器回了別的東西）不算
export function buildChanged(html, mine) {
  const now = buildScript(html);
  return !!(now && mine && now !== mine);
}
