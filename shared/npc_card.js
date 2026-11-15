// ================================================================
//  旅客卡的資料（翊文 11-16：「做公用架構讓我們看旅客時，不管在哪邊…都可以點選來看他們的狀況，理智，金錢狀況等等的」；決定 0096）
//  純函式，網頁和伺服器共用。npcCardView(id, live) → 壹份給畫面用的資料（或 null＝劇情角色、查無此人）。
//    live：{ day 遊戲日, nowMs, secret 伺服器祕密, list NPC 名單, counters 全館進度, house 莊家文件的複本（要有 npcLive 結到現在的，伺服器用 casNpcLive 在複本上算）}
//  只給「已經發生的和現在的」：今天的行程只列已經開始的站（未來的站是今天各店的人數，會洩漏明天館內股的跳空，決定 0094）；理智、錢包只給分級；故事線只給解鎖到的段落。
//  不碰存檔、不碰錢，只讀。
// ================================================================
import { NUM } from "./config.js";
import { HALL_THEME_TEXT } from "./content.js";
import { npcArcIndex, npcArcNow, npcLikesNow } from "./npc.js";
import { NPC_ROOM, npcDayStartMs, npcVisitsToday } from "./npc_spend.js";
import { npcCasAway } from "./casino_npc.js";
import { nwBal, nwBudgetMult, nwSan, nwUnitOf } from "./world.js";
import { statView } from "./stat_view.js";

export const NPC_CARD_PLACE = { hall: "展廳", food: "餐車", bj: "21 點桌", job: "委託櫃台", craft: "手作坊", cellar: "地下收藏庫", bank: "銀行", auction: "拍賣廳" };
export const NPC_CARD_TIER = { collector: "收藏家級", comfortable: "寬裕", modest: "小康", drifter: "四處流浪", none: "沒什麼錢" };
export const NPC_CARD_WALLET = { rich: ["寬裕", "good"], ok: ["還行", "neutral"], thin: ["吃緊", "warn"] };
const ncdN = v => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
const ncdBox = o => !!o && typeof o === "object" && !Array.isArray(o);

// 喜歡的東西 → 人看得懂的字：地方（NPC_CARD_PLACE）、展廳主題（HALL_THEME_TEXT 的名字）、其餘當稀有度（尋常、少見、珍藏、孤品…）
export function npcCardLikes(likes) {
  return (Array.isArray(likes) ? likes : []).filter(k => typeof k === "string" && k).map(k => (NPC_CARD_PLACE[k] ? { type: "place", key: k, label: NPC_CARD_PLACE[k] } : HALL_THEME_TEXT[k] ? { type: "theme", key: k, label: HALL_THEME_TEXT[k].name } : { type: "rarity", key: k, label: k }));
}
export function npcCardView(id, live) {
  const L = live || {}, list = Array.isArray(L.list) ? L.list : [], n = list.find(x => x && x.id === id);
  if (!n || n.kind === "trace" || typeof L.day !== "string") return null;
  const house = ncdBox(L.house) ? L.house : {}, now = ncdN(L.nowMs), m = (now - npcDayStartMs(L.day)) / 60000, C = NUM.casino.npcSpend;
  const away = npcCasAway(house, now).has(id), at = ncdBox(house.npcCas) && ncdBox(house.npcCas.at) && ncdBox(house.npcCas.at[id]) ? house.npcCas.at[id] : null;
  const san = statView("npcSan", id, house), sanOut = san ? { band: san.band, label: san.label, tone: san.tone, hint: san.hint } : null;
  // 今天的行程：只列已經開始的站（含現在這一站）
  const visits = npcVisitsToday(L.day, L.secret, list, L.counters).filter(v => v.id === id && v.start <= m);
  const today = visits.map(v => ({ place: v.place, room: NPC_ROOM[v.place] || null, label: NPC_CARD_PLACE[v.place] || v.place, at: npcDayStartMs(L.day) + v.start * 60000, until: npcDayStartMs(L.day) + v.end * 60000, now: !away && m < v.end }));
  const cur = away ? null : visits.find(v => m < v.end) || null;
  const where = away ? { room: "casino", label: "賭場（被館友邀去玩牌）", until: ncdN(at && at.until), at: "casino", invited: true } : cur ? { room: NPC_ROOM[cur.place] || null, label: NPC_CARD_PLACE[cur.place] || cur.place, until: npcDayStartMs(L.day) + cur.end * 60000, at: cur.place, invited: false } : null;
  // 錢：壹天最多花（預算 × 集團景氣倍率 × dayPct）、今天已經花了多少（npcLive.byNpc）、錢包的分級（餘額 ÷ 補滿的目標）
  let money = null;
  if (n.budget && n.budget.perDay > 0) {
    const uid = nwUnitOf(house, n), cap = Math.floor(Math.floor(n.budget.perDay * nwBudgetMult(house, n, uid)) * C.dayPct / 100), live2 = ncdBox(house.npcLive) && house.npcLive.day === L.day ? house.npcLive : null, spent = live2 && ncdBox(live2.byNpc) ? ncdN(live2.byNpc[id]) : 0;
    let wallet = null;
    if (house.npcw && house.npcw.day) { const W = NUM.casino.worldDoc.wallet, target = cap * (W ? W.targetDays : 1), r = target > 0 ? nwBal(house, id) / target : 0, b = r >= 0.8 ? "rich" : r >= 0.4 ? "ok" : "thin"; wallet = { band: b, label: NPC_CARD_WALLET[b][0], tone: NPC_CARD_WALLET[b][1] }; }
    money = { tier: n.budget.tier || "none", tierLabel: NPC_CARD_TIER[n.budget.tier] || NPC_CARD_TIER.none, perDay: cap, spentToday: Math.min(spent, cap), left: Math.max(0, cap - spent), wallet };
  }
  const k = npcArcIndex(n, L.day, L.counters), arcAll = (Array.isArray(n.arc) ? n.arc.filter(a => a && typeof a === "object") : []).slice().sort((a, b) => (+a.step || 0) - (+b.step || 0));
  const a = npcArcNow(n, L.day, L.counters);
  return {
    id: n.id, name: n.name, kind: n.kind, kindLabel: n.kind === "client" ? "委託人" : "旅客", note: n.note || "", story: n.story || "",
    job: n.job && n.job.title ? { title: n.job.title } : null, likes: npcCardLikes(npcLikesNow(n, L.day, L.counters)),
    san: sanOut, money, where, today, arc: a ? { step: a.step, text: a.text, news: a.news } : null,
    arcDone: arcAll.slice(0, Math.max(0, k)).map(x => ({ step: x.step, text: x.text || "" })), mood: sanOut ? sanOut.hint : "",
  };
}
