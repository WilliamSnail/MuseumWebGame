// ================================================================
//  館內 NPC（11-14，docs/館內NPC規劃.md 步驟 3 的文字那一半）
//  名單在 content/npc/*.json，經 tools/npc_pack.cjs 變成 shared/npc_roster.js（旅客 visitor、委託人 client；劇情角色 trace 不在裡面，只留痕跡、不露臉）。
//  這裡只有純函式：給「今天」和全館的進度，算每位 NPC 現在是故事線的哪壹段、要說什麼。不碰錢、不碰股票、不碰拍賣、不碰存檔。
//
//  故事線 arc[]：每壹段 { step, from, text, news, need?, route?, likes?, ties? }
//    第 1 段只看日期（from ≤ 今天）；之後的段落要日期到了，而且（有 need 的話）全館的進度也到了：need { metric, n }
//    全館進度 counters：{ commissions: { 委託人 id: 累計完成他的委託幾次 }（也可以是壹個數字＝全部委託人加起來）, hallVisits: 全館累計參觀展廳幾人次 }
//    counters 沒給（null、undefined）就「只看日期」：目前全館的進度還沒有人在算（要伺服器記，見維護日誌），所以網頁現在都走這條路。
//    壹段壹段往下解鎖，前壹段沒到後面就不算。
//  route、likes：最新那壹段有寫就蓋掉最上層的（例：第 3 段之後他不再去地下）。
// ================================================================
import { NUM } from "./config.js";
import { NPC_ROSTER } from "./npc_roster.js";

export const NPC_PEOPLE = NPC_ROSTER; // 旅客和委託人（網頁看得到的）
export const npcById = (id, list = NPC_PEOPLE) => list.find(n => n.id === id) || null;
export const npcByName = (name, list = NPC_PEOPLE) => list.find(n => n.name === name) || null;
const arcList = n => (n && Array.isArray(n.arc) ? n.arc.filter(a => a && typeof a === "object").slice().sort((a, b) => (+a.step || 0) - (+b.step || 0)) : []);

// 這壹項全館進度夠不夠：need { metric, n }。counters 沒給＝只看日期，一律算夠
export function npcNeedMet(need, counters, npcId) {
  if (!need || typeof need !== "object" || counters == null || typeof counters !== "object") return true;
  const n = +need.n || 0;
  if (need.metric === "commissions") {
    const c = counters.commissions;
    const have = c && typeof c === "object" ? +c[npcId] || 0 : +c || 0;
    return have >= n;
  }
  if (need.metric === "hallVisits") return (+counters.hallVisits || 0) >= n;
  return false; // 不認得的項目：不解鎖
}
// 現在解鎖到第幾段（陣列裡的位置，-1＝都還沒到）。date 是 "YYYY-MM-DD"（台灣 05:00 換日的「今天」）
export function npcArcIndex(npc, date, counters) {
  const arc = arcList(npc);
  let k = -1;
  for (let i = 0; i < arc.length; i++) {
    const a = arc[i];
    if (typeof a.from !== "string" || a.from > date) break;
    if (i > 0 && !npcNeedMet(a.need, counters, npc.id)) break; // 第 1 段只看日期
    k = i;
  }
  return k;
}
// 現在這壹段 { step, from, text, news, ties }；還沒到第 1 段就是 null
export function npcArcNow(npc, date, counters) {
  const arc = arcList(npc), k = npcArcIndex(npc, date, counters);
  if (k < 0) return null;
  const a = arc[k];
  return { step: a.step, from: a.from, text: a.text || "", news: a.news || "", ties: Array.isArray(a.ties) ? a.ties : [] };
}
// 現在的行程權重和喜好：解鎖到的段落裡最新有寫的那壹段蓋掉最上層
export function npcRouteNow(npc, date, counters) {
  const arc = arcList(npc), k = npcArcIndex(npc, date, counters);
  for (let i = k; i >= 0; i--) if (arc[i].route && typeof arc[i].route === "object") return arc[i].route;
  return npc && npc.route && typeof npc.route === "object" ? npc.route : {};
}
export function npcLikesNow(npc, date, counters) {
  const arc = arcList(npc), k = npcArcIndex(npc, date, counters);
  for (let i = k; i >= 0; i--) if (Array.isArray(arc[i].likes)) return arc[i].likes;
  return npc && Array.isArray(npc.likes) ? npc.likes : [];
}
// 每位 NPC 現在的樣子：[{ id, name, kind, arc（現在這壹段或 null）, route, likes }]。trace 不會在名單裡，萬壹混進來也跳過
export function npcCurrent(date, counters, list = NPC_PEOPLE) {
  return list.filter(n => n && n.kind !== "trace").map(n => ({ id: n.id, name: n.name, kind: n.kind, arc: npcArcNow(n, date, counters), route: npcRouteNow(n, date, counters), likes: npcLikesNow(n, date, counters) }));
}
// 今天誰來逛展廳：照 route.hall 的權重抽壹位（avoid＝上壹位的 id，盡量換人）。權重 0 的不會來。沒有人就回 null
export function npcPickHall(rng, date, counters, list = NPC_PEOPLE, avoid = "") {
  const cur = npcCurrent(date, counters, list).map(c => ({ c, w: Math.max(0, Math.floor(+c.route.hall || 0)) })).filter(x => x.w > 0);
  const pool = cur.length > 1 ? cur.filter(x => x.c.id !== avoid) : cur;
  const total = pool.reduce((s, x) => s + x.w, 0);
  if (!total) return null;
  let r = rng() * total;
  for (const x of pool) { r -= x.w; if (r < 0) return x.c; }
  return pool[pool.length - 1].c;
}
// 展廳的壹則「故事留言」：這位 NPC 現在這壹段的字；還沒有就說他是誰（story）。回 { who, text, story: true, npc, step } 或 null
export function npcStoryLine(npcId, date, counters, list = NPC_PEOPLE) {
  const n = npcById(npcId, list);
  if (!n || n.kind === "trace") return null;
  const a = npcArcNow(n, date, counters);
  const text = (a && a.text) || n.story;
  return text ? { who: n.name, text, story: true, npc: n.id, step: a ? a.step : 0 } : null;
}
// 館內近況：每位 NPC 現在這壹段的 news，段落新的先（from 大的先）；同壹天解鎖的照「日期＋id」的雜湊排，每天換不同的人，最多 max 則。給展廳的小字
const npcHash = s => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 1000003; return h; };
export function npcNews(date, counters, max = NUM.npc.newsMax, list = NPC_PEOPLE) {
  return npcCurrent(date, counters, list).filter(c => c.arc && c.arc.news)
    .sort((a, b) => (a.arc.from < b.arc.from ? 1 : a.arc.from > b.arc.from ? -1 : npcHash(date + a.id) - npcHash(date + b.id)))
    .slice(0, Math.max(0, max)).map(c => ({ id: c.id, name: c.name, news: c.arc.news, step: c.arc.step, from: c.arc.from }));
}
