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
    id: "coop-open", v: 1, cat: "館方公告", tags: ["重要", "更新"], importance: "important", pinned: true,
    title: "地下收藏庫可以結伴下樓了", publish: "2026-11-09", expire: "2027-12-31",
    sections: [
      ["這次有什麼新的", [
        "壹隊 1～4 位，每位帶 1～2 隻佩佩，不滿 3 隻由館方助手補上。大家投票、看同壹顆骰子，理智各扣各的。",
        "門上的記號每個人只看得到壹部分，要說出來才拼得起來。",
        "可以打字。理智低的時候，你說出去的話不壹定是原來那句。",
        "可以留在上面看監視器；倒下的人還可以敲壹下。",
        "有些東西要兩個人壹起搬。走過的地方可以留牌子。",
        "走完有探險報告，可以掛在展廳、貼到交誼廳。",
      ]],
      ["怎麼開始", ["到地下收藏庫按「壹起下去」，再邀請館友。壹個人也可以，館方助手會陪你。"]],
      ["注意事項", ["每天前 3 趟有獎勵。打字的內容可以檢舉，管理員看得到。"]],
    ],
    cta: { label: "去地下收藏庫", room: "cellar" },
  },
  {
    id: "update-1109", v: 1, cat: "館方公告", tags: ["更新"], importance: "important",
    title: "這兩天的更新", publish: "2026-11-09", expire: "2027-12-31",
    sections: [
      ["新的東西", [
        "每日簽到、節日活動和簽到日曆：右上角的「選單」裡有。",
        "每週劇情：每天有新書和任務，集週章可以到「兌換所」換裝備、提升技能。起源室的書架分了頁籤。",
        "參觀館友的展廳、送佩佩：對方不在線也可以，東西會寄到信箱。",
        "主題展辦完可以拿限定配件和策展手記。",
        "大廳導覽圖看得到線上的館友在哪間房。",
        "「本週榜單」：每週壹早上張貼上壹週的榜單。",
      ]],
      ["修好的地方", [
        "做出來的佩佩有時候沒顯示：修好了（動畫減量開著的時候才會發生）。",
        "動畫減量統壹改回關閉。想要的話，到「設定」可以再打開。",
        "地下收藏庫的「挑隊員」移到隊伍正下方，不用滑到最下面。",
        "書的翻頁改成金色按鈕。",
        "禁書的書背寫上是哪壹本的續集。",
        "「你閉上眼睛」不會壹下子就過去了。",
      ]],
    ],
  },
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
