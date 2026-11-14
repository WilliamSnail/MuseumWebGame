// ================================================================
//  邀請在場的 NPC 壹起去賭場（11-14，決定 0080；翊文：「賭場邀請 NPC 一起來，每個也可以有自己說話」「也可以參與多人賭桌」）
//  純函式（shared/casino_table.js 的牌桌叫它）：誰邀得動、答不答應、NPC 怎麼下注怎麼打、錢怎麼走、說什麼。
//  錢：NPC 的注從「外面世界」出（casHouseWorldOut，帳上寫 npcBj，跟 NPC 在牌桌花錢同一條），贏的賠付回外面世界（casHouseWorldIn）。
//    下注的當下錢就在莊家帳上、不算「打牌中」，所以玩家那邊的 inplay 要跳過 npc 座位（functions/casino.js 的日報）。永遠不印錢、不燒錢，casBookGap 還是 0。
//  上限：壹位 NPC 壹天最多輸／贏 perDay 的 lossPct／winPct；全館壹天淨輸或淨贏最多 dayCap；莊家不是「健康」（吃緊、破產）、外面世界吃緊都不下注。
//  館友帶 NPC 沒有任何額外獎勵（不給籌碼、不給靈感）。
//  記帳 house.npcCas：{ day, by: { npcId: { n 今天答應幾次, net NPC 今天贏（正）輸（負）多少, hands }, }, net 全館 NPC 今天的淨贏輸, at: { npcId: { pid, host, since, until } 現在在賭場的 }, cool: { "uid|npcId": 到哪個毫秒才能再邀 } }
//  打法（content/npc/<id>.json 的 casino.style）：careful 保守、basic 標準、bold 大膽、wild 亂來；沒寫的當 basic。台詞 casino.lines 沒寫的用下面的預設。
// ================================================================
import { NUM } from "./config.js";
import { RNG, hashStr, mulberry32 } from "./logic.js";
import { casHand, casPoint } from "./casino.js";
import { casHouseWorldIn, casHouseWorldOut, casWorldLow } from "./casino_book.js";
import { casBetMax, casHouseLevel, casPayAdd, casPayLeft } from "./casino_wallet.js";
import { npcDayStartMs, npcVisitsToday } from "./npc_spend.js";
import { npcLikesNow } from "./npc.js";

const ncN = v => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
const ncBox = o => !!o && typeof o === "object" && !Array.isArray(o);
export const NPC_CAS_STYLES = ["careful", "basic", "bold", "wild"];
export const NPC_CAS_KINDS = ["accept", "refuse", "sit", "win", "lose", "bust", "bj", "push", "cheer", "leave"];
// 沒有 casino 欄位的 NPC 用這些（每句 30 字內；草稿，Yuga 可以改）。bust ＝ 自己爆牌；錢用完、時間到、館友走了都用 leave
export const CAS_NPC_LINES = {
  accept: ["好啊，我坐壹下。", "來壹桌也行。", "嗯，我陪你玩幾把。"],
  refuse: ["現在不太想玩。", "改天吧。", "我今天先逛逛就好。"],
  sit: ["我先看看牌。", "發牌吧。", "手氣怎麼樣呢。"],
  win: ["這把我贏了。", "運氣不錯。", "收下了。"],
  lose: ["輸了壹點。", "下壹把再說。", "莊家今天不錯。"],
  bust: ["爆了…", "哎呀，多拿壹張了。", "貪心不得。"],
  bj: ["二十壹點！", "壹手就定了。", "這牌太漂亮了。"],
  push: ["平手，不虧。", "壹樣大呢。", "誰也沒贏。"],
  cheer: ["好牌！", "漂亮。", "你今天有手氣。"],
  leave: ["我差不多了，先走。", "謝謝你邀我，下次見。", "玩夠了，我回去逛逛。"],
};
export const npcCasStyle = n => (n && ncBox(n.casino) && NPC_CAS_STYLES.includes(n.casino.style) ? n.casino.style : "basic");

// 今天的記帳（換日清 by、net；at、cool 不清）
export function npcCasFix(house, day) {
  if (!ncBox(house.npcCas)) house.npcCas = { day, by: {}, net: 0, at: {}, cool: {} };
  const c = house.npcCas;
  if (c.day !== day) { c.day = day; c.by = {}; c.net = 0; }
  if (!ncBox(c.by)) c.by = {}; if (!ncBox(c.at)) c.at = {}; if (!ncBox(c.cool)) c.cool = {};
  c.net = Math.trunc(+c.net) || 0;
  return c;
}
const myBy = (c, id) => { if (!ncBox(c.by[id])) c.by[id] = { n: 0, net: 0, hands: 0 }; return c.by[id]; };
// 現在在賭場的 NPC（過了停留時間 10 分鐘還沒被清掉的當作走了：桌子很久沒人碰的時候）
export function npcCasAway(house, nowMs) {
  const c = ncBox(house.npcCas) ? house.npcCas : null, out = new Set();
  if (c && ncBox(c.at)) for (const id of Object.keys(c.at)) if (ncBox(c.at[id]) && ncN(c.at[id].until) + 600000 > nowMs) out.add(id);
  return out;
}
// NPC 走了（或桌子收了）：從 at 拿掉
export function npcCasFree(house, id) { if (ncBox(house.npcCas) && ncBox(house.npcCas.at)) delete house.npcCas.at[id]; }
// 挑壹句台詞：照 NPC 自己的 casino.lines，沒有就預設；種子決定（同壹個種子同壹句）
export function npcCasLine(n, kind, seed) {
  const own = n && ncBox(n.casino) && ncBox(n.casino.lines) && Array.isArray(n.casino.lines[kind]) ? n.casino.lines[kind].filter(s => typeof s === "string" && s.trim()) : [];
  const arr = own.length ? own : CAS_NPC_LINES[kind] || [];
  return arr.length ? String(arr[Math.floor(mulberry32(hashStr(String(seed)))() * arr.length)]).slice(0, 30) : "";
}

// 這位 NPC 今天在賭場還能輸多少、贏多少（照他的 perDay）；ok：莊家健康、外面世界不吃緊、全館淨輸贏沒到上限、他自己沒到上限
export function npcCasRoom(house, day, n) {
  const C = NUM.casino.npcCas, c = npcCasFix(house, day), by = myBy(c, n.id), per = ncN(n.budget && n.budget.perDay);
  const lossCap = Math.floor(per * C.lossPct / 100), winCap = Math.floor(per * C.winPct / 100);
  const lossLeft = Math.max(0, lossCap + by.net), winLeft = Math.max(0, winCap - by.net);
  const global = Math.abs(c.net) < C.dayCap, level = casHouseLevel(house) === "ok" && !casWorldLow(house, NUM.casino.world);
  return { lossLeft, winLeft, ok: !!C.on && per > 0 && level && global && lossLeft >= NUM.casino.minBet && winLeft > 0 };
}
// 現在在館裡（今天的行程窗口裡）、而且不在賭場、今天還能答應的 NPC：[{ id, name }]。劇情角色不在名單裡
export function npcCasInvitable(house, day, nowMs, secret, list, counters) {
  const C = NUM.casino.npcCas, m = (nowMs - npcDayStartMs(day)) / 60000, away = npcCasAway(house, nowMs), c = npcCasFix(house, day), seen = new Set(), out = [];
  if (!C.on) return out;
  for (const v of npcVisitsToday(day, secret, list, counters)) {
    if (v.start > m || m >= v.end || seen.has(v.id) || away.has(v.id)) continue;
    const n = list.find(x => x && x.id === v.id);
    if (!n || n.kind === "trace" || myBy(c, n.id).n >= C.perNpcDay || !npcCasRoom(house, day, n).ok) continue;
    seen.add(v.id); out.push({ id: n.id, name: n.name });
  }
  return out;
}
// 答不答應的機率（%）：baseP，愛玩牌桌（likes 有 bj）再加 likeP，今天剩下的額度越少越不想玩
export function npcCasChance(house, day, n, counters) {
  const C = NUM.casino.npcCas, R = npcCasRoom(house, day, n), per = ncN(n.budget && n.budget.perDay), cap = Math.max(1, Math.floor(per * C.lossPct / 100));
  const like = (npcLikesNow(n, day, counters) || []).includes("bj") ? C.likeP : 0;
  return Math.max(5, Math.min(95, Math.round((C.baseP + like) * (0.3 + 0.7 * Math.min(1, R.lossLeft / cap)))));
}
// 被邀壹次就記壹次（答應或拒絕都算）：每次擲骰的種子不同，同壹位館友隔 30 分鐘再邀會重擲、不會永遠同壹個結果。回傳這次是第幾次（從 0 起）
export function npcCasAsk(house, day, id) { const by = myBy(npcCasFix(house, day), id), k = ncN(by.ask); by.ask = k + 1; return k; }
// 擲壹次：種子含伺服器祕密、館友、這位 NPC 今天被問第幾次（count）
export const npcCasRoll = (secret, day, uid, id, count) => mulberry32(hashStr(`${secret}|${day}|${uid}|${id}|invite|${count}`))() * 100;
// 答應了：記下他在這桌
export function npcCasAccept(house, day, n, pid, host, nowMs, secret) {
  const C = NUM.casino.npcCas, c = npcCasFix(house, day), by = myBy(c, n.id), rnd = mulberry32(hashStr(`${secret}|${day}|${n.id}|${pid}|stay|${by.n}`));
  by.n++;
  const until = nowMs + (C.stay[0] + Math.floor(rnd() * (C.stay[1] - C.stay[0] + 1))) * 60000;
  c.at[n.id] = { pid, host, since: nowMs, until };
  return until;
}
// 被拒絕：記冷卻（只留最近 coolKeep 筆，過期的清掉）
export function npcCasCool(house, day, uid, id, nowMs) {
  const C = NUM.casino.npcCas, c = npcCasFix(house, day);
  for (const k of Object.keys(c.cool)) if (ncN(c.cool[k]) <= nowMs) delete c.cool[k];
  c.cool[uid + "|" + id] = nowMs + C.coolMs;
  const ks = Object.keys(c.cool); if (ks.length > C.coolKeep) ks.sort((a, b) => c.cool[a] - c.cool[b]).slice(0, ks.length - C.coolKeep).forEach(k => delete c.cool[k]);
}
export const npcCasCoolLeft = (house, day, uid, id, nowMs) => Math.max(0, ncN(ncBox(house.npcCas) && ncBox(house.npcCas.cool) ? house.npcCas.cool[uid + "|" + id] : 0) - nowMs);

// 這壹局的注（0 ＝ 下不了：額度用完、莊家不健康）。跟玩家壹樣受莊家的最大注、當天賠付上限限制
export function npcCasBet(n, house, day) {
  const C = NUM.casino.npcCas, R = npcCasRoom(house, day, n);
  if (!R.ok) return 0;
  const per = ncN(n.budget.perDay), left = casPayLeft(house, day);
  let bet = Math.floor(per * (C.bet[npcCasStyle(n)] || C.bet.basic) / 100 * (0.7 + 0.6 * RNG()));
  bet = Math.min(bet, C.betMax, casBetMax(house), R.lossLeft, left === Infinity ? Infinity : Math.floor(left / NUM.casino.risk.betMult));
  return bet >= NUM.casino.minBet ? bet : 0;
}
// 下注：錢從外面世界進莊家帳（到不了這麼多就下少壹點；不到最小注就不下）。回傳真的下了多少
export function npcCasTake(house, bet) {
  const got = casHouseWorldOut(house, "npcBj", bet, NUM.casino.world);
  if (got > 0 && got < NUM.casino.minBet) { casHouseWorldIn(house, "npcBj", got); return 0; }
  return got;
}
// 這壹手結算：賠付回外面世界；記他今天的輸贏、全館的輸贏。out：{ kind, payout, net }（casPayout 的結果）
export function npcCasPay(house, day, id, bet, out) {
  const c = npcCasFix(house, day), by = myBy(c, id), net = ncN(out.payout) - ncN(bet);
  if (out.payout > 0) casHouseWorldIn(house, "npcBj", out.payout);
  by.net += net; by.hands++; c.net += net;
  if (net > 0) casPayAdd(house, day, net);
}
// 下注前就收了桌（館友走了）：注退回外面世界
export const npcCasRefund = (house, bet) => { if (bet > 0) casHouseWorldIn(house, "npcBj", bet); };
// 該離開了嗎：回傳原因（"stay" 時間到、"loss" 輸夠了或額度用完、"win" 贏夠了、"day" 全館上限、"house" 莊家吃緊）或 null
export function npcCasLeaveWhy(house, day, n, until, nowMs) {
  if (nowMs >= until) return "stay";
  const C = NUM.casino.npcCas, c = npcCasFix(house, day), R = npcCasRoom(house, day, n);
  if (R.ok) return null;
  if (!(Math.abs(c.net) < C.dayCap)) return "day";
  if (R.winLeft <= 0) return "win";
  return casHouseLevel(house) === "ok" && !casWorldLow(house, NUM.casino.world) ? "loss" : "house";
}

// 要不要再拿壹張牌。cards：他的牌；up：莊家明牌的點數（casPoint）
export function npcCasHit(style, cards, up) {
  const h = casHand(cards), t = h.total;
  if (h.bust || h.charlie || t >= 21) return false;
  if (style === "careful") return t <= 11 || (t <= 13 && up >= 7); // 保守：早早停牌，莊家爆了才贏
  if (style === "bold") return t <= 16 || (h.soft && t <= 17); // 大膽：不到 17 就要
  if (style === "wild") return t <= 14 ? RNG() > 0.12 : t <= 17 ? RNG() < 0.3 + (up >= 7 ? 0.2 : 0) : t === 18 && h.soft ? RNG() < 0.4 : false; // 亂來：偶爾亂要、亂停
  // basic：大致照基本策略（硬牌）：12～16 莊家明牌 2～6 停、7 以上要；軟牌 17 以下要、軟 18 看莊家
  if (h.soft) return t <= 17 || (t === 18 && up >= 9);
  return t <= 11 || (t >= 12 && t <= 16 && up >= 7) || (t === 12 && up <= 3);
}
export const npcCasUp = dealer => (Array.isArray(dealer) && dealer.length > 1 ? casPoint(dealer[1]) : 0);
