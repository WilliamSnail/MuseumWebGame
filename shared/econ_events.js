// ================================================================
//  劇情經濟事件（11-14，翊文：「經濟進劇情可以更深」、E1～E8 全做；docs/世界觀主旨.md 第陸節）
//  排程在 content/weeks/*/week.json 的 econ 欄位只選「哪壹天、哪種事件、哪個等級」，**數字全由程式決定**（NUM.casino.econEvent），內容寫不進去：
//    econ: [{ kind, date, level, name }]（每週最多 NUM.casino.econEvent.perWeek 個動錢的；audit 不算；同種壹週壹個）
//    kind：
//      foreign     E3 外資 NPC 來得多：那壹天 NPC 買畫的上限和出價機率 ×（1 ＋ pct%）；level 1／2／3 ＝ foreignPct 的三個檔
//      bondWindow  E4 館債簽收窗口：date 起 level 天（≤ windowMax），玩家可以提早拿回館債的本金加「已持有天數」的利息（照比例，利率不變），莊家付，每天最多付莊家超過準備金的 redeemPct%
//      artFreeze   E2 借展期間畫價凍結：date 起 level 天（≤ freezeMax），畫的館方買賣價停在那段時間「第壹次報的價」，不漲不跌
//      houseRepay  E7 莊家提早還外面世界貸款壹部分：date 那天，還 min(債, 莊家超過健康線的部分 × repayPct[level]%)，還完莊家仍在健康線以上（最大注不縮）
//      audit       E8 全館對帳日：date 那天日報多印壹行對帳差；不動錢
//    E1（外館借展的拍品）用現有的「拍賣」旗標（content 的畫標 auction），價格照稀有度，程式不用改；E5（吃緊／寬鬆的旁白）、E6（對帳員來訪）只能旁白／用現有的 npc 劇情日。
//  事先公告：foreign、artFreeze 提前 ahead 天、bondWindow 提前 3 天，日報寫；houseRepay、audit 不預告（不動玩家價格）。repo 是公開的，所以會動玩家價格或錢的都預告給所有人，沒有人比別人早知道的好處。
// ================================================================
import { NUM } from "./config.js";
import { casHouseWorldIn, casLedFix } from "./casino_book.js";
import { casFill, casNum } from "./casino.js";

const eeN = v => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
const eeDay = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const eeAdd = (s, n) => new Date(Date.parse(s + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const eeBox = o => !!o && typeof o === "object" && !Array.isArray(o);
export const ECON_KINDS = ["foreign", "bondWindow", "artFreeze", "houseRepay", "audit"];
export const ECON_MONEY = ["foreign", "bondWindow", "artFreeze", "houseRepay"]; // 動錢或價格的（每週有上限）

// 這壹天有哪些事件在起作用。events：{ 日期: [{ kind, level, name }] }（copy_shared 打包的 ECON_EVENTS）。回傳
// { foreign?: { pct, name }, bondWindow?: { from, until, name }, artFreeze?: { from, until, name }, houseRepay?: { pct, date }, audit?: { name } }
export function casEconActive(events, day) {
  const E = NUM.casino.econEvent, out = {};
  if (!eeBox(events) || !eeDay(day)) return out;
  for (let i = 0; i <= Math.max(E.windowMax, E.freezeMax); i++) {
    const d = eeAdd(day, -i);
    for (const e of Array.isArray(events[d]) ? events[d] : []) {
      if (!eeBox(e)) continue;
      const lv = Math.max(1, Math.min(3, eeN(e.level) || 1));
      if (e.kind === "foreign" && i === 0) out.foreign = { pct: E.foreignPct[lv - 1], name: String(e.name || "") };
      else if (e.kind === "houseRepay" && i === 0) out.houseRepay = { pct: E.repayPct[lv - 1], date: d, name: String(e.name || "") };
      else if (e.kind === "audit" && i === 0) out.audit = { name: String(e.name || "") };
      else if (e.kind === "bondWindow" && i < Math.min(E.windowMax, eeN(e.level) || 1)) out.bondWindow = { from: d, until: eeAdd(d, Math.min(E.windowMax, eeN(e.level) || 1) - 1), name: String(e.name || "") };
      else if (e.kind === "artFreeze" && i < Math.min(E.freezeMax, Math.max(1, eeN(e.level) || 1) * 1)) out.artFreeze = { from: d, until: eeAdd(d, Math.min(E.freezeMax, Math.max(1, eeN(e.level) || 1)) - 1), name: String(e.name || "") };
    }
  }
  return out;
}
// 接下來 ahead 天內要發生、要提前公告的（日報寫）：[{ kind, date, name, level }]
export function casEconUpcoming(events, day) {
  const E = NUM.casino.econEvent, out = [];
  if (!eeBox(events) || !eeDay(day)) return out;
  for (let i = 0; i <= 5; i++) {
    const d = eeAdd(day, i);
    for (const e of Array.isArray(events[d]) ? events[d] : []) if (eeBox(e) && E.ahead[e.kind] != null && i <= E.ahead[e.kind]) out.push({ kind: e.kind, date: d, name: String(e.name || ""), level: Math.max(1, eeN(e.level) || 1) });
  }
  return out;
}
export const CAS_ECON_EV = {
  foreign: "{m} 月 {d} 日，外面來的客人會多壹些（外資買畫的力道 ＋{pct}%）。",
  bondWindow: "{m} 月 {d} 日起 {n} 天，館債開簽收窗口：可以提早拿回本金和已經算到的利息，利率不變。",
  artFreeze: "{m} 月 {d} 日起 {n} 天，借展期間，畫的館方買賣價不動。",
  audit: "館際通知：請各館核對本季差額。今天的對帳差 ＝ {gap}（0 ＝ 對得上）。",
  repaid: "館方提早還了外面世界的貸款 {n}。",
};
// 日報的預告句子（照日期順序）
export function casEconUpText(up) {
  const E = NUM.casino.econEvent;
  return up.map(u => casFill(CAS_ECON_EV[u.kind], { m: +u.date.slice(5, 7), d: +u.date.slice(8, 10), pct: E.foreignPct[Math.min(3, u.level) - 1], n: u.kind === "bondWindow" ? Math.min(E.windowMax, u.level) : Math.min(E.freezeMax, u.level) }));
}

// 換日後第壹次碰到莊家時叫（冪等：house.ev 記今天做了什麼）。events：ECON_EVENTS。house.ev = { day, window, freeze, repaid }
export function casEconRun(house, day, events) {
  if (!eeDay(day)) return null;
  if (!eeBox(house.ev) || house.ev.day !== day) house.ev = { day, window: null, freeze: null, repaid: 0 };
  const ev = house.ev, a = casEconActive(events, day), E = NUM.casino.econEvent;
  ev.window = a.bondWindow ? { from: a.bondWindow.from, until: a.bondWindow.until } : null;
  // 畫價凍結：窗口開始壹次（house.art.freeze 記哪幾天、報過的價），casArtPrice 讀
  if (a.artFreeze) { if (!eeBox(house.art)) house.art = {}; const f = house.art.freeze; if (!eeBox(f) || f.from !== a.artFreeze.from) house.art.freeze = { from: a.artFreeze.from, until: a.artFreeze.until, cache: {} }; ev.freeze = { from: a.artFreeze.from, until: a.artFreeze.until }; }
  // 莊家提早還外面世界貸款：只在那壹天、只做壹次
  if (a.houseRepay && !ev.repaid && house.debt && house.debt.world > 0) {
    const room = Math.max(0, house.bankroll - NUM.casino.health.low * 2), pay = Math.min(house.debt.world, Math.floor(room * a.houseRepay.pct / 100));
    if (pay > 0) { casHouseWorldIn(house, "worldRepay", pay); house.debt.world -= pay; ev.repaid = pay; casLedFix(house, ["mint", "flow", "burn", "world"]); }
  }
  return ev;
}
