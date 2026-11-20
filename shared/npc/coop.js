// ================================================================
//  邀請在場的 NPC 壹起下地下收藏庫（決定 0149，翊文 11-21；範本是決定 0080 賭場邀 NPC）
//  純函式：誰邀得動、答不答應、邀請的禮物錢、記下他在這一趟、趟結束後的理智和「壹起下去」紀錄。他在趟裡怎麼投票：shared/coop/npc.js。
//  誰能被邀：content/npc/<id>.json 有 cellar 欄位（{ role, from?, lines? }）的才行（11 位名單由延伸劇情世界定，t- 劇情角色絕對沒有）；
//    現在在館裡（今天的行程窗口內，不在賭場、不在別的隊）、理智 ≥ minSan、今天陪過的趟數 < perDay、這位館友 30 分鐘內沒被他拒絕過。
//  答應機率 ＝ baseP ＋ route.cellar × routeP ＋ 送了禮物的 giftP（最多 95、最少 5）；種子含伺服器祕密。
//  錢：邀請送 NPC gift 籌碼 → 已知世界（casWorldIn，來源 npcGift；NPC 的錢本來就在已知世界，守恆）。被拒絕也收（禮物送出去了），所以要先答應再收——收的時機由呼叫的人決定（伺服器答應之後才收）。
//  記帳 house.npcCoop：{ day, by: { npcId: { n 今天陪了幾趟, ask 被問幾次 } }, at: { npcId: { pid, host, since, until } 現在在隊裡的 }, cool }；house.npcTies：{ npcId: { n 全館累計壹起下去幾趟, d 最後壹天 } }（全館同壹份，不看個別玩家）。
// ================================================================
import { NUM } from "../core/config.js";
import { hashStr, mulberry32 } from "../core/logic_base.js";
import { casWorldIn } from "../casino/book.js";
import { npcCasAway } from "../casino/npc.js";
import { npcDayStartMs, npcVisitsToday } from "./spend.js";
import { nwSan } from "../world/base.js";

const cpN = v => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
const cpBox = o => !!o && typeof o === "object" && !Array.isArray(o);
export const NPC_COOP_KINDS = ["accept", "refuse", "enter", "win", "lose", "scared", "leave", "thanks"];
// 沒寫 cellar.lines 的用這些（每句 30 字內；草稿，延伸劇情世界會替 11 位各寫自己的，W51 以後才開新台詞）
export const NPC_COOP_LINES = {
  accept: ["好，我陪你下去。", "走吧，我跟著。", "嗯，帶路吧。"],
  refuse: ["現在不太想下去。", "改天吧。", "我今天先在上面逛逛。"],
  enter: ["這裡有點暗。", "小心腳下。", "我跟在後面。"],
  win: ["過了。", "還不錯。", "往下走吧。"],
  lose: ["沒關係，再來。", "這間不好走。", "慢慢來。"],
  scared: ["我有點不舒服…", "這裡待久了頭暈。", "我快撐不住了。"],
  leave: ["我先上去了，你們小心。", "我就送到這裡。", "謝謝你帶我下來，我回去了。"],
  thanks: ["謝謝你的心意。", "那我就收下了。"],
};
export const NPC_COOP_ROLE_TEXT = { carry: "搬運", lead: "帶路", calm: "壯膽" };

// 這位能不能被邀（資料面）：有 cellar 欄位、不是劇情角色、日期到了
export const npcCoopOk = (n, day) => !!(n && n.kind !== "trace" && cpBox(n.cellar) && (!n.cellar.from || String(day) >= n.cellar.from));
export const npcCoopInfo = n => ({ npc: n.id, name: n.name, style: n.casino && n.casino.style ? n.casino.style : "basic", role: cpBox(n.cellar) && ["carry", "lead", "calm"].includes(n.cellar.role) ? n.cellar.role : null });

export function npcCoopFix(house, day) {
  if (!cpBox(house.npcCoop)) house.npcCoop = { day, by: {}, at: {}, cool: {} };
  const c = house.npcCoop;
  if (c.day !== day) { c.day = day; c.by = {}; }
  if (!cpBox(c.by)) c.by = {}; if (!cpBox(c.at)) c.at = {}; if (!cpBox(c.cool)) c.cool = {};
  return c;
}
const cpBy = (c, id) => { if (!cpBox(c.by[id])) c.by[id] = { n: 0, ask: 0 }; return c.by[id]; };
// 現在在隊裡的 NPC（過了停留時間再加 10 分鐘還沒被清掉的當作走了）
export function npcCoopAway(house, nowMs) {
  const c = cpBox(house.npcCoop) ? house.npcCoop : null, out = new Set();
  if (c && cpBox(c.at)) for (const id of Object.keys(c.at)) if (cpBox(c.at[id]) && cpN(c.at[id].until) + 600000 > nowMs) out.add(id);
  return out;
}
export function npcCoopFree(house, id) { if (cpBox(house.npcCoop) && cpBox(house.npcCoop.at)) delete house.npcCoop.at[id]; }
export const npcCoopLine = (n, kind, seed) => {
  const mine = n && cpBox(n.cellar) && cpBox(n.cellar.lines) && Array.isArray(n.cellar.lines[kind]) && n.cellar.lines[kind].length ? n.cellar.lines[kind] : NPC_COOP_LINES[kind] || [];
  return mine.length ? String(mine[Math.floor(mulberry32(hashStr(String(seed)))() * mine.length)]).slice(0, 30) : "";
};

// 答應的機率（%）。gift：這次有沒有送禮
export function npcCoopChance(n, gift) {
  const C = NUM.casino.coopNpc, route = n && n.route ? cpN(n.route.cellar) : 0;
  return Math.max(5, Math.min(95, Math.round(C.baseP + route * C.routeP + (gift ? C.giftP : 0))));
}
// 現在邀得動的 NPC：[{ id, name, role, chance, giftChance, san }]
export function npcCoopInvitable(house, day, nowMs, secret, list, counters, uid) {
  const C = NUM.casino.coopNpc, out = [];
  if (!C.on) return out;
  const m = (nowMs - npcDayStartMs(day)) / 60000, away = npcCoopAway(house, nowMs), casAway = npcCasAway(house, nowMs), c = npcCoopFix(house, day), seen = new Set();
  for (const v of npcVisitsToday(day, secret, list, counters)) {
    if (v.start > m || m >= v.end || seen.has(v.id) || away.has(v.id) || casAway.has(v.id)) continue;
    const n = list.find(x => x && x.id === v.id);
    if (!n || !npcCoopOk(n, day) || cpBy(c, n.id).n >= C.perDay) continue;
    const san = nwSan(house, n.id);
    if (san < C.minSan) continue;
    seen.add(v.id);
    out.push({ id: n.id, name: n.name, role: npcCoopInfo(n).role, chance: npcCoopChance(n, false), giftChance: npcCoopChance(n, true), san, cool: uid ? npcCoopCoolLeft(house, day, uid, n.id, nowMs) : 0 });
  }
  return out;
}
export const npcCoopAsk = (house, day, id) => { const by = cpBy(npcCoopFix(house, day), id), k = cpN(by.ask); by.ask = k + 1; return k; };
export const npcCoopRoll = (secret, day, uid, id, count) => mulberry32(hashStr(`${secret}|${day}|${uid}|${id}|coopInvite|${count}`))() * 100;
// 答應了：記下他在這一隊
export function npcCoopAccept(house, day, n, pid, host, nowMs) {
  const C = NUM.casino.coopNpc, c = npcCoopFix(house, day), by = cpBy(c, n.id);
  by.n++;
  c.at[n.id] = { pid, host, since: nowMs, until: nowMs + C.stayMin * 60000 };
  return c.at[n.id].until;
}
export function npcCoopCool(house, day, uid, id, nowMs) {
  const C = NUM.casino.coopNpc, c = npcCoopFix(house, day);
  for (const k of Object.keys(c.cool)) if (cpN(c.cool[k]) <= nowMs) delete c.cool[k];
  c.cool[uid + "|" + id] = nowMs + C.coolMs;
  const ks = Object.keys(c.cool); if (ks.length > C.coolKeep) ks.sort((a, b) => c.cool[a] - c.cool[b]).slice(0, ks.length - C.coolKeep).forEach(k => delete c.cool[k]);
}
export const npcCoopCoolLeft = (house, day, uid, id, nowMs) => Math.max(0, cpN(cpBox(house.npcCoop) && cpBox(house.npcCoop.cool) ? house.npcCoop.cool[uid + "|" + id] : 0) - nowMs);
// 邀請的禮物：玩家 → 已知世界（NPC 的錢本來就在那裡）。呼叫的人先確認錢包夠；回傳實際收的
export const npcCoopGift = (w, house) => casWorldIn(w, house, "npcGift", NUM.casino.coopNpc.gift);

// 趟結束（或這位離隊）：把他在趟裡剩下的理智寫回 house.npcw.san、從隊裡拿掉、記一次「壹起下去」（全館累計，決定 0149）
export function npcCoopDone(house, day, id, endSan) {
  npcCoopFree(house, id);
  if (!cpBox(house.npcw)) house.npcw = house.npcw || {};
  if (house.npcw && cpBox(house.npcw)) { if (!cpBox(house.npcw.san)) house.npcw.san = {}; if (Number.isFinite(+endSan)) house.npcw.san[id] = Math.max(0, Math.min(100, Math.round(+endSan))); }
  if (!cpBox(house.npcTies)) house.npcTies = {};
  const t = cpBox(house.npcTies[id]) ? house.npcTies[id] : { n: 0, d: null };
  t.n = cpN(t.n) + 1; t.d = day; house.npcTies[id] = t;
  return t.n;
}
// 全館累計跟哪一級（0、1、2、3）：對照 NUM.casino.coopNpc.ties
export const npcTieLevel = (house, id) => { const t = cpBox(house.npcTies) && cpBox(house.npcTies[id]) ? cpN(house.npcTies[id].n) : 0; return NUM.casino.coopNpc.ties.reduce((k, x) => (t >= x ? k + 1 : k), 0); };
