// ================================================================
//  新解開的東西：在哪個房間、看過了沒（翊文 11-08：「玩家新解開的東西應該介面上要有提示有那個地方解開了」）
//  一樣只有規則，不碰畫面。畫面那邊：ui_core.js 的 showEvents（提示寫在哪裡）、go()（進出房間）、導覽列。
//
//  P.fresh = { 房間 id: { 項目 key: 狀態 } }（房間 id 跟 ui_core.js 的 ROOM_NAMES 一樣）
//    true   ＝新的，還沒進那個房間：導覽列、大廳導覽圖標「新」
//    "seen" ＝進了房間，這次還看得到那件東西上「新」的小牌子；離開房間（go 到別的畫面）就變 false
//    false  ＝看過了。留著是為了「掃描」來的東西（買得起的升級、剛能解鎖的選項）不會再標第二次
// ================================================================
import { PEPE_PARTS, UPGRADES } from "./config.js";
import { CATS, isFree, isUnlocked, partOf, reqMet } from "./logic.js";
import { upgradeState } from "./logic3.js";

// 每種東西的 key（畫面那邊找小牌子也用這裡，兩邊才不會寫不一樣）
export const FRESH_KEY = {
  opt: (cat, name) => `opt:${cat}:${name}`, // 手作坊的選項
  cat: cat => `cat:${cat}`,                 // 手作坊多了壹頁（拿到鑰匙的裝飾類別）
  ex: id => `ex:${id}`,                     // 畫廊的展品
  ch: id => `ch:${id}`,                     // 起源室的章節
  book: id => `book:${id}`,                 // 起源室的禁書、續集
  understood: "understood",                 // 起源室的《看懂的事》多了壹件
  recipe: id => `recipe:${id}`,             // 圖鑑室的配方頁
  badge: id => `badge:${id}`,               // 圖鑑室的徽章頁
  up: id => `up:${id}`,                     // 館長室的工坊升級
  floor: n => `floor:${n}`,                 // 地下收藏庫新開的樓層
};

// 事件 → 新東西在哪個房間、哪壹件（tab ＝在那個房間的哪壹頁）。壹個事件可能有好幾件：拿到鑰匙＝多壹頁＋那頁的選項
export function freshOfEvent(e) {
  if (!e || !e.type) return [];
  switch (e.type) {
    case "unlock": return [{ room: "workshop", key: FRESH_KEY.opt(e.cat, e.name), tab: e.cat }];
    case "key": {
      const part = PEPE_PARTS.find(p => p.options.some(o => o.key === e.key));
      if (!part) return [];
      return [{ room: "workshop", key: FRESH_KEY.cat(part.name), tab: part.name }]
        .concat(part.options.filter(o => o.key === e.key).map(o => ({ room: "workshop", key: FRESH_KEY.opt(part.name, o.name), tab: part.name })));
    }
    case "exhibit": return [{ room: "gallery", key: FRESH_KEY.ex(e.id) }];
    case "chapter": return [{ room: "origin", key: FRESH_KEY.ch(e.id) }];
    case "book": return [{ room: "origin", key: FRESH_KEY.book(e.id) }];
    case "recipe": return [{ room: "codex", key: FRESH_KEY.recipe(e.id), tab: "recipes" }];
    case "badge": return [{ room: "codex", key: FRESH_KEY.badge(e.id), tab: "badges" }];
    case "floor": return [{ room: "cellar", key: FRESH_KEY.floor(e.floor) }];
    default: return []; // 靈感、整類全收集、展廳主題：不是「解開了東西」
  }
}

const roomBox = (P, room) => {
  if (!P.fresh || typeof P.fresh !== "object" || Array.isArray(P.fresh)) P.fresh = {};
  return P.fresh[room] || (P.fresh[room] = {});
};
// 標壹件。here ＝玩家現在在哪個畫面：就在那個房間的話算已經看到了（導覽列不亮，只留房間裡的小牌子）
export function markFresh(P, room, key, here) {
  roomBox(P, room)[key] = here === room ? "seen" : true;
  return { room, key };
}
// 把壹串事件裡解開的東西都標起來；回傳標了哪些
export function markFreshEvents(P, events, here) {
  const out = [];
  if (!P) return out;
  (events || []).forEach(e => freshOfEvent(e).forEach(f => { markFresh(P, f.room, f.key, here); out.push(Object.assign({ type: e.type }, f)); }));
  return out;
}

// 沒有事件、要看狀態才知道的（第壹次變成這樣才標，標過、看過就不再標）：
//   手作坊：條件剛達成、可以花靈感解鎖的選項（例如拿到徽章「四種心情」之後的「黑」、看過奇怪的繪畫之後的「俄國8+9」）
//   館長室：第壹次買得起的工坊升級
export function scanFresh(P, here) {
  if (!P || isFree(P)) return [];
  const out = [];
  const once = (room, key, extra) => {
    const b = P.fresh && P.fresh[room];
    if (b && key in b) return;
    markFresh(P, room, key, here);
    out.push(Object.assign({ room, key }, extra));
  };
  CATS.forEach(c => partOf(c).options.forEach(o => {
    if (o.req && !isUnlocked(P, c, o.name) && reqMet(P, o.req)) once("workshop", FRESH_KEY.opt(c, o.name), { tab: c, cat: c, name: o.name });
  }));
  UPGRADES.forEach(u => {
    const st = upgradeState(P, u.id), key = FRESH_KEY.up(u.id), b = P.fresh && P.fresh.office;
    if (st.state === "buy" && st.ok) once("office", key, { tab: "upgrades", id: u.id });
    else if (b && b[key] === true) delete b[key]; // 還沒去看就又買不起了：先拿掉，下次買得起再標
  });
  return out;
}
// 徽章打開了哪些選項（config.js 裡 req: { badge } 的那幾個，還沒解鎖的）：提示上順便寫
export function badgeOpens(P, badgeId) {
  const out = [];
  CATS.forEach(c => partOf(c).options.forEach(o => { if (o.req && o.req.badge === badgeId && !isUnlocked(P, c, o.name)) out.push(o.name); }));
  return out;
}

// 進房間：導覽列的「新」消失（房間裡的小牌子這次還看得到）
export function enterFreshRoom(P, room) {
  const b = P && P.fresh && P.fresh[room];
  if (!b) return 0;
  let n = 0;
  Object.keys(b).forEach(k => { if (b[k] === true) { b[k] = "seen"; n++; } });
  return n;
}
// 離開房間：這次看過的小牌子拿掉
export function leaveFreshRoom(P, room) {
  const b = P && P.fresh && P.fresh[room];
  if (!b) return 0;
  let n = 0;
  Object.keys(b).forEach(k => { if (b[k] === "seen") { b[k] = false; n++; } });
  return n;
}

// 房間裡的小牌子：這壹件還算不算新（還沒看到，或這次進來才看到）
export function isFresh(P, room, key) {
  const v = P && P.fresh && P.fresh[room] && P.fresh[room][key];
  return v === true || v === "seen";
}
// 這個房間裡，key 是這樣開頭的新東西有幾件（頁籤用，例如手作坊的「帽子」頁：opt:帽子:）
export function freshUnder(P, room, prefix) {
  const b = P && P.fresh && P.fresh[room];
  return b ? Object.keys(b).filter(k => k.startsWith(prefix) && (b[k] === true || b[k] === "seen")).length : 0;
}
// 還沒看到的有幾件（導覽列、大廳導覽圖）
export function freshCount(P, room) {
  const b = P && P.fresh && P.fresh[room];
  return b ? Object.values(b).filter(v => v === true).length : 0;
}
// 每個房間還沒看到的件數：{ workshop: 2, codex: 1 }（0 的不列）
export function freshRooms(P) {
  const out = {};
  Object.keys((P && P.fresh) || {}).forEach(r => { const n = freshCount(P, r); if (n) out[r] = n; });
  return out;
}
