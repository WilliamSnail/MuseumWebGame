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
//    pinned     置頂（最多一兩則）
//    title      標題（兩行以內）
//    publish／expire  發布、下架的日期（台灣日期，含當天；跟 todayStr 一樣台灣時間 05:00 換日）
//    start／end 活動期間（可以不填）
//    sections   [[段落名, [句子, …]], …]，畫面會寫成「〓段落名〓」
//    cta        「前往」按鈕：{ label, room, params } 或 { label, panel: "mail" }
//    gift       附在信箱的獎勵：{ id, title, insp, mood }（shared/mailbox.js 會寄出去，一個 id 只寄一次）
//  介面文字照第 1 代用「壹」。
// ================================================================
import { WEEKLY_TEXT } from "./content3.js";
import { weekIndex, weeklyTheme } from "./logic3.js";
import { holidayNotices } from "./holidays.js";

export const NOTICE_CATS = ["館方公告", "特展活動"];
const RANK = { urgent: 3, important: 2, normal: 1, low: 0 };

export const NOTICES = [
  {
    id: "open4", v: 1, cat: "館方公告", tags: ["重要", "更新"], importance: "important", pinned: true,
    title: "佩佩博物館2 開館了", publish: "2026-11-08", expire: "2027-12-31",
    sections: [
      ["這次有什麼新的", [
        "新解開的東西會掛壹塊金色的「新」字牌子，告訴你在哪裡可以用。",
        "大廳多了「下壹步」：剛來的參觀者知道先去哪裡。",
        "委託櫃台多了「壹鍵交件」：符合的委託壹次交完。",
        "抱枕工作台可以抱以前做的抱枕了：在下面的「抱枕」頁點壹個。",
        "理智檢定改成白話，例如「成功扣 1 點，失敗扣 1～6 點」。",
        "讀過的禁書再翻開，不用再擲理智。",
        "導覽列多了「公佈欄」；右上角的「選單」裡有公佈欄、信箱和設定。",
      ]],
      ["獎勵", ["開館禮：靈感 +10，已經寄到信箱。"]],
      ["注意事項", ["存檔現在放在館裡了，看「存檔搬進館裡了」那則。"]],
    ],
    cta: { label: "打開信箱", panel: "mail" },
    gift: { id: "gift-open4", title: "開館禮", insp: 10 },
  },
  {
    id: "net1", v: 1, cat: "館方公告", tags: ["重要", "更新"], importance: "important",
    title: "存檔搬進館裡了，也看得到館友了", publish: "2026-11-08", expire: "2027-12-31",
    sections: [
      ["這次有什麼新的", [
        "進館要先登入（開發版打名字就好，之後換成用 Google 登入）。",
        "存檔放在館裡：換壹台電腦、換手機，登入同壹個名字，進度壹樣。",
        "第壹次登入時，可以把這台電腦以前的存檔搬上來（只能搬給壹個帳號）。",
        "大廳多了「館友在線」：誰在線、在哪個房間。右上角的「選單」裡有「館友」和「我的帳號」。",
        "「我的帳號」可以改暱稱、隱身、關掉館友上線的提示，也可以登出。",
      ]],
      ["注意事項", [
        "同壹個帳號同時開兩個分頁，進度會互相蓋掉，只開壹個就好。",
        "連不上館裡的時候，進度先留在網頁裡，連回來會自己存；先不要關掉網頁。",
      ]],
    ],
    cta: { label: "看館友", panel: "friends" },
  },
  {
    id: "board-help", v: 1, cat: "館方公告", tags: ["館長的話"], importance: "low",
    title: "公佈欄和信箱怎麼用", publish: "2026-11-08", expire: "2027-12-31",
    sections: [
      ["公佈欄", [
        "館方的消息、更新、活動都貼在這裡。",
        "導覽列的「公佈欄」可以打開這裡，右上角的「選單」裡也有。",
        "有重要的新公告時，「公佈欄」會蓋壹個紅色的火漆印；「選單」上會有數字，告訴你有幾件還沒看。",
        "點開內文才算讀過；也可以按「全部標為已讀」。",
      ]],
      ["信箱", [
        "信箱在右上角的「選單」裡。獎勵、補償，之後還有館友送的東西，都會寄到這裡。",
        "信寄到之後 30 天沒領就會不見。",
        "按「全部領取」壹次收完。",
      ]],
    ],
  },
  {
    id: "events1", v: 1, cat: "特展活動", tags: ["活動", "更新"], importance: "important",
    title: "限時活動來了：試煉房間也能邀館友壹起打", publish: "2026-11-09", expire: "2026-11-16", start: "2026-11-09", end: "2026-11-14",
    sections: [
      ["這次有什麼新的", [
        "館裡以後會不定時辦「限時活動」：在指定的時間裡，壹起打地下收藏庫、或挑戰試煉房間，收穫會多壹點。",
        "合作地下收藏庫的活動：在活動時間內按「出發」，這壹趟記號對上、猜對、搬回來的靈感會變多，當天還多 1 趟有獎勵。",
        "試煉房間的活動：在活動時間內走進去，過關的技能成長會變多。",
        "試煉房間現在可以邀館友壹起打：在地下收藏庫的「試煉房間」按「邀館友壹起」（壹個人也能開）。大家壹起投票、看同壹顆骰子，過關後每個人各自算自己的技能成長。",
        "這週拿過了、技能已經滿了的人也可以陪打，只是不拿成長；畫面會先寫清楚。",
        "大廳最上面會有壹條活動預告，進行中會倒數；公佈欄和每週劇情也會列出這週的活動。",
      ]],
      ["這週的兩場", [
        "11/11（三）20:00～22:00　雙 11 的招領箱加班夜：合作地下收藏庫。",
        "11/14（六）20:00～22:00　冬衣試煉夜：試煉房間，壹個人或壹起打都可以。",
      ]],
      ["注意事項", [
        "時間都是台灣時間。沒趕上也不會少什麼，下次有活動再來。",
        "在活動內出發的，走到活動結束之後也照活動算。",
      ]],
    ],
    cta: { label: "打開每週劇情", panel: "story" },
  },
];

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

// 別的檔加進來的公告（例如每週劇情的「本週地下收藏庫」，web/src/ui_story.js 登記）：一筆是 (P, today) => 公告或 null
export const NOTICE_EXTRA = [];
// 現在看得到的公告：已經發布、還沒下架；置頂的、重要的排前面，再照發布日期新的在前
export function visibleNotices(P, today) {
  const list = NOTICES.filter(n => (!n.publish || n.publish <= today) && (!n.expire || today <= n.expire));
  const w = weeklyNotice(P);
  if (w) list.push(w);
  list.push(...holidayNotices(today)); // 節日公告：節日前兩天貼、節日最後一天下架（shared/holidays.js，決定 0030）
  NOTICE_EXTRA.forEach(f => { const n = f(P, today); if (n) list.push(n); });
  return list.sort((a, b) => (!!b.pinned - !!a.pinned) || (RANK[b.importance] - RANK[a.importance]) || String(b.publish || "9999").localeCompare(String(a.publish || "9999")));
}

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
export function isUnread(state, n) { return (state.read[n.id] || 0) < (n.v || 1); }
export function markRead(state, n) { state.read[n.id] = n.v || 1; }
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
