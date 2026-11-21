// ================================================================
//  德州撲克（館友對館友，決定 0150，翊文 11-21）：2～6 人桌。純函式：只改傳進來的 t（桌子）、ctx（錢包、莊家），亂數走 RNG（伺服器是 cryptoRng）。
//  規劃和模擬：docs/規劃/新牌桌遊戲規劃.md 第 4 節、test/sim/sim_holdem.cjs。牌力在 shared/casino/holdem_eval.js；牌的編號跟 21 點壹樣（0～51，0＝A）。
//  錢（守恆）：買入＝錢包 → 桌上的籌碼 stack；離座＝stack → 錢包；每手的注從 stack 搬到 put（底池）；結算時 put 分給贏家（扣抽水），沒人跟的部分退還；抽水進莊家（來源記 bj＝牌桌，casCount holdemRake）。
//    桌上的 stack 和 put 全館日報算「打牌中」（functions/casino/casino.js 的 reportSnap）。永遠不印錢、不燒錢。
//  規則：無限注。壹手開始時只發給「坐著而且籌碼 ≥ 2 個大盲」的人（其他人這手不玩、不付盲注，叫做「等下壹手」；中途入座的也是）。
//    按鈕每手往下壹位；2 人時按鈕＝小盲、翻牌前先說話、翻牌後大盲先說話；3 人以上小盲在按鈕左邊、大盲再下壹位、翻牌前從大盲的下壹位開始、翻牌後從按鈕左邊第壹個還在的人開始。
//    邊池：每個人這手最多投入 cap（見下），投入不一樣就照層次分主池和邊池（標準做法），每個池子只有投入夠的、沒蓋牌的人能分；只有壹個人投入的那壹層（沒人跟）整層退還。
//    cap（壹天對同壹人淨輸上限 pairDay 守得住的關鍵）：每個人這手最多投入 min(自己的籌碼, 對每個同桌的人「今天還能輸多少」的最小值)，再壓到「別人最大的 cap」以內（沒人跟得起的部分沒意義）。
//      壹個人這手輸給另壹個人的錢 ≤ 兩人投入的較小者 ≤ 兩人 cap 的較小者 ≤ 兩人之間今天還能輸的，所以兩人之間的淨輸贏壹定不超過上限。
//    壹天兩人之間的帳（house.hd.pair["甲|乙"] ＝ [甲的淨輸贏, 乙的淨輸贏]）：每個池子裡，輸家投入的錢照贏家拿到的比例分給贏家（輸家記全額，贏家記扣掉那壹份抽水的）。
//    每手都抽水（底池 > 2 個大盲才抽，不用等翻牌；沒翻牌不抽會變免費轉帳）：5%、封頂 3 個大盲，照各池大小分攤。
//  時間：每人每步 turnMs；到了自動過牌（沒有要跟的）或蓋牌；連續 maxTimeouts 次超時自動離座（籌碼回錢包）。伺服器沒有計時器：畫面到時間叫 tick，casHAdvance 照時間往下走。
//  離座：還沒蓋牌的蓋牌；打牌中離座的人，剩下的籌碼先回錢包，投進底池的留在池裡（全下的照常分，贏的錢那手結束時進錢包），座位留到這手結束（seat.leaving）。
//  桌子 t：{ v, game: "holdem", pid, lv, hand, phase: "wait"｜"play"｜"over", deadline, street 0～3, board, deck, toAct, curBet, lastRaise, E（這手最大的 cap，給畫面看）, btn（按鈕的 uid）, seats, order, res（上壹手的結果）, rev }
//  座位：{ uid, nick, stack（桌上沒投入的）, put（這手總共投入）, bet（這條街投入）, cap, st: "idle"｜"in"｜"fold"｜"allin", acted, hole, s0（這手開始時的 stack）, timeouts, leaving? }
//  ctx：{ wallets: { uid: 錢包 }, house, day, hlog（陣列：每手的紀錄，伺服器寫進 casinoHoldemLog） }
// ================================================================
import { NUM } from "../core/config.js";
import { casHouseMove, casCount, casHouseWorldIn, casHouseWorldOut } from "./book.js";
import { hashStr, mulberry32 } from "../core/logic_base.js";
import { hdNpcPlan } from "./holdem_npc.js";
import { npcCasAccept, npcCasAsk, npcCasAway, npcCasChance, npcCasCool, npcCasCoolLeft, npcCasFix, npcCasFree, npcCasInvitable, npcCasLine, npcCasRoll, npcCasRoom, npcCasStyle } from "./npc.js";
import { npcRelBonus } from "../social/npcrel.js";
import { casShuffle } from "./core.js";
import { holdemName, holdemScore } from "./holdem_eval.js";

const hdN = v => (Number.isFinite(+v) ? Math.floor(+v) : 0);
// 盲注記在桌子上（t.bl，開桌那刻的盲注）：以後級距清單改了（11-22 前面加了入門桌，編號後移），已經開著的桌子盲注也不會變。沒有 t.bl 的舊桌（11-22 以前開的）照當時的三級編號
const HD_OLD_LEVELS = [[5000, 10000], [50000, 100000], [500000, 1000000]];
const hdBlinds = t => { const L = Array.isArray(t.bl) && t.bl.length === 2 ? t.bl : HD_OLD_LEVELS[t.lv] || NUM.casino.holdem.levels[0]; return { sb: L[0], bb: L[1] }; };
export const casHSeats = t => t.order.map(id => t.seats[id]).filter(Boolean);
const hdPairKey = (a, b) => [a, b].sort().join("|");
// 從 uid 的下壹位開始、轉壹圈（uid 自己排最後；uid 不在桌上就從頭）
const hdAfter = (t, uid) => { const i = t.order.indexOf(uid); return i < 0 ? t.order.slice() : t.order.slice(i + 1).concat(t.order.slice(0, i + 1)); };
const hdDealt = t => casHSeats(t).filter(s => s.hole.length > 0);
const hdAlive = t => hdDealt(t).filter(s => s.st === "in" || s.st === "allin");
// ---------- 旅客 NPC（決定 0150 補充二）：座位多 npc: { id, style, host, until, said, say }；uid 是 "npc:<旅客 id>"，沒有錢包 ----------
// 籌碼從已知世界來（casHouseWorldOut，來源 npcBj，跟 21 點壹樣）：留在桌上、不算「打牌中」（莊家帳上已經有這筆）；每手結算後他的淨輸贏 Δ 讓莊家帳跟著增減（casHouseMove npcBj），離座把剩下的還給已知世界。
// 額度：每手最多投入 min(籌碼、他今天還能輸、今天還能贏、全館壹天上限剩下的 ÷ 桌上 NPC 數)，所以他壹天輸不超過 lossPct、贏不超過 winPct、全館不超過 dayCap。真人對 NPC 不記 house.hd.pair（額度已經擋了）。
const hdIsNpc = s => !!(s && s.npc);
const hdNpcData = (ctx, id) => (Array.isArray(ctx.npcList) ? ctx.npcList : []).find(x => x && x.id === id) || null;
const hdPl = (ctx, a, b) => (hdIsNpc(a) || hdIsNpc(b) ? Infinity : casHPairLeft(ctx.house, ctx.day, a.uid, b.uid));
function hdNpcCap(ctx, s, nNpc) {
  const n = hdNpcData(ctx, s.npc.id), C = NUM.casino.npcCas;
  if (!n || !n.budget) return 0;
  const R = npcCasRoom(ctx.house, ctx.day, n);
  if (!R.ok) return 0;
  const net = Math.abs(npcCasFix(ctx.house, ctx.day).net);
  return Math.max(0, Math.min(s.stack, R.lossLeft, R.winLeft, Math.floor(Math.max(0, C.dayCap - net) / Math.max(1, nNpc))));
}
// 坐下時帶多少：min(今天還能輸、今天還能贏、風格決定的大盲數、買入上限、全館上限剩下的 ÷ 這桌 NPC 數)
function hdNpcBuy(ctx, n, bb, count) {
  const C = NUM.casino.npcCas, H = NUM.casino.holdem, R = npcCasRoom(ctx.house, ctx.day, n);
  if (!R.ok) return 0;
  const net = Math.abs(npcCasFix(ctx.house, ctx.day).net), bbs = H.npcBuyBB[npcCasStyle(n)] || H.npcBuyBB.basic;
  return Math.max(0, Math.min(R.lossLeft, R.winLeft, bbs * bb, H.buyMax, Math.floor(Math.max(0, C.dayCap - net) / Math.max(1, count))));
}
// 錢給座位：NPC 的回已知世界，真人的進錢包。回傳有沒有成功（真人的錢包不在就不動）
function hdPay(ctx, s, amt) {
  if (hdIsNpc(s)) { if (amt > 0) casHouseWorldIn(ctx.house, "npcBj", amt); return true; }
  const w = ctx.wallets[s.uid];
  if (!w) return false;
  w.chips += amt;
  return true;
}
const hdFreeNpc = (ctx, s) => { if (hdIsNpc(s)) npcCasFree(ctx.house, s.npc.id); };
// 桌上最近說的話（NPC 的氣泡）：最多 5 句
function hdTalk(t, s, text) {
  if (!text) return;
  if (!Array.isArray(t.talk)) t.talk = [];
  t.talk.push({ uid: s.uid, nick: s.nick, text, hand: t.hand });
  if (t.talk.length > 5) t.talk.splice(0, t.talk.length - 5);
  s.npc.say = { text, hand: t.hand };
}
const hdSeed = (t, ctx, s, kind) => `${ctx.secret || ""}|${ctx.day}|${s.npc.id}|${t.pid}|${t.hand}|${kind}`;
function hdNpcSay(t, ctx, s, kind, p) {
  if (mulberry32(hashStr(hdSeed(t, ctx, s, kind + "|p")))() >= p) return;
  hdTalk(t, s, npcCasLine(hdNpcData(ctx, s.npc.id), kind, hdSeed(t, ctx, s, kind)));
}
// 還在座的 NPC：時間到、額度用完（cap 不到 2 個大盲）就離座（兩手之間才走）
function hdNpcSweep(t, ctx, now) {
  if (t.phase === "play") return;
  const npcs = casHSeats(t).filter(hdIsNpc), bb = hdBlinds(t).bb;
  for (const s of npcs) {
    if (now >= s.npc.until || hdNpcCap(ctx, s, npcs.length) < 2 * bb) { hdNpcSay(t, ctx, s, "leave", 1); casHLeave(t, s.uid, ctx, now, true); }
  }
}
// 輪到 NPC 就讓他馬上動作（伺服器做，不等計時），連續做到輪到真人或這手結束
function hdNpcRun(t, ctx, now) {
  for (let k = 0; k < 80 && t.phase === "play"; k++) {
    const s = t.seats[t.toAct];
    if (!s || !hdIsNpc(s)) break;
    const toCall = t.curBet - s.bet, maxTo = s.bet + hdRoom(s), pot = casHSeats(t).reduce((a, x) => a + x.put, 0);
    const pl = hdNpcPlan(s.npc.style, { hole: s.hole, board: t.board, toCall, pot, bet: s.bet, curBet: t.curBet, minTo: Math.min(t.curBet + t.lastRaise, maxTo), maxTo, bb: hdBlinds(t).bb });
    let r = hdAct(t, s.uid, pl.a, pl.to, ctx, now);
    if (!r.ok) r = hdAct(t, s.uid, toCall > 0 ? "fold" : "check", 0, ctx, now);
    if (!r.ok) break;
  }
}

export function casHNew({ pid, lv, now }) {
  const L = Number.isInteger(lv) && lv >= 0 && lv < NUM.casino.holdem.levels.length ? lv : 0;
  return { v: 3, game: "holdem", pid, lv: L, bl: NUM.casino.holdem.levels[L].slice(), hand: 0, phase: "wait", deadline: null, street: 0, board: [], deck: [], toAct: null, curBet: 0, lastRaise: 0, E: 0, btn: null, seats: {}, order: [], res: null, rev: 0, at: now };
}
// 買入的最少、最多（第一次坐下最少 buyMinBB 個大盲；桌上的籌碼最多 min(buyMax, buyMaxBB 個大盲)）
export function casHBuyLimits(t) {
  const C = NUM.casino.holdem, bb = hdBlinds(t).bb;
  return { min: C.buyMinBB * bb, max: Math.min(C.buyMax, C.buyMaxBB * bb) };
}
// 今天對同壹人還能投入多少（house.hd.pair 是今天兩人之間的淨輸贏，壹天壹換）
function hdHd(house, day) {
  if (!house.hd || typeof house.hd !== "object" || house.hd.day !== day) house.hd = { day, pair: {} };
  if (!house.hd.pair || typeof house.hd.pair !== "object") house.hd.pair = {};
  return house.hd;
}
// house.hd.pair["甲|乙"] ＝ [甲的淨輸贏, 乙的淨輸贏]（uid 排序後的順序；贏的人要扣抽水，所以兩個數字不一定相反）。每個人最多輸 pairDay：下壹手最多投入 ＝ 兩人「還能輸多少」較小的那個
export function casHPairLeft(house, day, a, b) {
  const p = hdHd(house, day).pair[hdPairKey(a, b)], n1 = hdN(Array.isArray(p) ? p[0] : 0), n2 = hdN(Array.isArray(p) ? p[1] : 0);
  return Math.max(0, NUM.casino.holdem.pairDay + Math.min(n1, n2));
}

// ---------- 坐下、補籌碼 ----------
export function casHBuyin(t, uid, nick, amount, w, ctx) {
  const C = NUM.casino.holdem, lim = casHBuyLimits(t), n = hdN(amount);
  if (!C.on) return { ok: false, reason: "德州撲克現在不開。" };
  if (!w) return { ok: false, reason: "你還沒有錢包。" };
  if (!(+amount === n) || n < 1) return { ok: false, reason: "買入要壹個整數。" };
  let s = t.seats[uid];
  if (!s && t.order.length >= C.seats) return { ok: false, reason: "這桌坐滿了。" };
  if (s && t.phase === "play" && s.st !== "idle") return { ok: false, reason: "這手打完再補。" };
  const have = s ? s.stack : 0;
  if (!s && n < lim.min) return { ok: false, reason: `第壹次最少買 ${lim.min.toLocaleString("en-US")}。` };
  if (have + n > lim.max) return { ok: false, reason: `桌上最多 ${lim.max.toLocaleString("en-US")}。` };
  if (n > w.chips) return { ok: false, reason: "籌碼不夠。" };
  if (!s) { s = { uid, nick, stack: 0, put: 0, bet: 0, cap: 0, st: "idle", acted: false, hole: [], s0: 0, timeouts: 0 }; t.seats[uid] = s; t.order.push(uid); }
  s.nick = nick; s.timeouts = 0;
  w.chips -= n; s.stack += n;
  return { ok: true, stack: s.stack };
}

// ---------- 發牌 ----------
// 坐著的人裡，籌碼 ≥ 2 個大盲、今天對每個同桌的人還能輸 ≥ 2 個大盲的，有 2 個以上就開壹手。不夠回 { ok: false, why: "alone"｜"short"｜"cap" }
export function casHStart(t, ctx, now) {
  const C = NUM.casino.holdem, B = hdBlinds(t);
  hdNpcSweep(t, ctx, now);
  const seated = casHSeats(t);
  const stop = why => { t.phase = "wait"; t.deadline = null; t.toAct = null; return { ok: false, why }; };
  if (!C.on || seated.length < 2 || !seated.some(s => !hdIsNpc(s))) return stop("alone");
  let D = seated.filter(s => s.stack >= 2 * B.bb);
  if (D.length < 2) return stop("short");
  // 今天兩個真人之間額度不到 2 個大盲的，不能同桌打這手：壹次請走「卡到最多人」的那位（同樣多就請籌碼少的），直到沒有人卡人（NPC 不看這個，他有自己的額度）
  for (;;) {
    const bad = {}; let any = false;
    for (let i = 0; i < D.length; i++) for (let j = i + 1; j < D.length; j++) if (hdPl(ctx, D[i], D[j]) < 2 * B.bb) { any = true; bad[D[i].uid] = (bad[D[i].uid] || 0) + 1; bad[D[j].uid] = (bad[D[j].uid] || 0) + 1; }
    if (!any) break;
    const worst = D.slice().sort((x, y) => (bad[y.uid] || 0) - (bad[x.uid] || 0) || x.stack - y.stack)[0];
    D = D.filter(s => s !== worst);
    if (D.length < 2) return stop("cap");
  }
  const nNpc = seated.filter(hdIsNpc).length;
  D = D.filter(s => !hdIsNpc(s) || hdNpcCap(ctx, s, nNpc) >= 2 * B.bb);
  if (D.length < 2 || !D.some(s => !hdIsNpc(s))) return stop("cap");
  const caps = {};
  D.forEach(s => { caps[s.uid] = Math.min(s.stack, hdIsNpc(s) ? hdNpcCap(ctx, s, nNpc) : Infinity, ...D.filter(o => o !== s).map(o => hdPl(ctx, s, o))); });
  const raw = Object.assign({}, caps); // 再壓到「別人最大的 cap」以內：沒人跟得起的部分沒意義
  D.forEach(s => { caps[s.uid] = Math.min(raw[s.uid], Math.max(...D.filter(o => o !== s).map(o => raw[o.uid]))); });
  const deck = casShuffle();
  const ids = D.map(s => s.uid), btn = hdAfter(t, t.btn).filter(u => ids.includes(u))[0];
  const seq = hdAfter(t, btn).filter(u => ids.includes(u)); // 按鈕的下壹位開始、按鈕排最後
  const n = seq.length, sb = n === 2 ? btn : seq[0], bb = n === 2 ? seq[0] : seq[1], first = n === 2 ? sb : seq[2 % n];
  t.hand++; t.btn = btn; t.street = 0; t.board = [];
  seated.forEach(s => { s.hole = []; s.put = 0; s.bet = 0; s.st = "idle"; s.acted = false; s.cap = 0; s.s0 = s.stack; });
  D.forEach(s => { s.st = "in"; s.cap = caps[s.uid]; });
  t.E = Math.max(...D.map(s => s.cap));
  for (const id of t.order) { const s = t.seats[id]; if (s.st === "in") s.hole = [deck.pop(), deck.pop()]; }
  const post = (s, amt) => { s.stack -= amt; s.put += amt; s.bet += amt; };
  post(t.seats[sb], B.sb); post(t.seats[bb], B.bb);
  t.deck = deck; t.curBet = B.bb; t.lastRaise = B.bb; t.toAct = first; t.deadline = now + C.turnMs; t.phase = "play"; t.res = null;
  hdNpcRun(t, ctx, now);
  return { ok: true };
}

// 還要說話的人：沒蓋牌沒全下、而且（還沒說過話，或這條街投入的比最高的少）。只剩 1 個還能動的人時，只有他要跟注才算
function hdPending(t) {
  const live = casHSeats(t).filter(s => s.st === "in");
  return live.length <= 1 ? live.filter(s => s.bet < t.curBet) : live.filter(s => !(s.acted && s.bet === t.curBet));
}
const hdRoom = s => Math.max(0, Math.min(s.stack, s.cap - s.put));

// ---------- 做壹個動作 ----------
// a：fold／check／call／raise（to ＝加到多少，這條街的總投入）／allin
// 真人（或超時）的動作；做完之後輪到 NPC 就讓他們馬上動作
export function casHAct(t, uid, a, to, ctx, now) {
  const r = hdAct(t, uid, a, to, ctx, now);
  if (r.ok) { hdNpcRun(t, ctx, now); if (t.phase === "over") r.finished = true; }
  return r;
}
function hdAct(t, uid, a, to, ctx, now) {
  const me = t.seats[uid];
  if (!me) return { ok: false, reason: "你不在這桌。" };
  if (t.phase !== "play" || me.st !== "in") return { ok: false, reason: "現在沒有在打。" };
  if (t.toAct !== uid) return { ok: false, reason: "還沒輪到你。" };
  const toCall = t.curBet - me.bet, room = hdRoom(me), maxTo = me.bet + room;
  const pay = amt => { me.stack -= amt; me.put += amt; me.bet += amt; };
  if (a === "fold") { me.st = "fold"; me.timeouts = 0; return hdProgress(t, ctx, now); }
  let reopened = false;
  if (a === "check") {
    if (toCall > 0) return { ok: false, reason: "要跟注或蓋牌。" };
  } else if (a === "call") {
    if (toCall <= 0) return { ok: false, reason: "不用跟，可以過牌。" };
    pay(Math.min(toCall, room));
  } else if (a === "raise" || a === "allin") {
    const target = a === "allin" ? maxTo : hdN(to);
    if (a === "raise" && !(+to === target)) return { ok: false, reason: "加注要壹個整數。" };
    if (target > maxTo) return { ok: false, reason: `最多加到 ${maxTo.toLocaleString("en-US")}。` };
    if (target <= t.curBet) { // 全下但沒有比對方多：就是跟注
      if (a === "allin" && toCall > 0) pay(Math.min(toCall, room));
      else if (a === "allin") { /* 沒有要跟、也加不上去：當過牌 */ }
      else return { ok: false, reason: "加注要比對方多。" };
    } else {
      const minTo = t.curBet + t.lastRaise;
      if (target < minTo && target !== maxTo) return { ok: false, reason: `最少加到 ${Math.min(minTo, maxTo).toLocaleString("en-US")}。` };
      const rs = target - t.curBet;
      pay(target - me.bet);
      t.lastRaise = Math.max(t.lastRaise, rs); t.curBet = me.bet; reopened = true;
    }
  } else return { ok: false, reason: "不認得的動作。" };
  me.acted = true; me.timeouts = 0;
  if (reopened) casHSeats(t).forEach(s => { if (s !== me && s.st === "in") s.acted = false; });
  if (me.stack <= 0 || me.put >= me.cap) me.st = "allin";
  return hdProgress(t, ctx, now);
}

// 動作之後：只剩壹個人沒蓋牌就結束；這條街還有人要說話就換他；都說完了就翻牌（或把牌發完、攤牌）
function hdProgress(t, ctx, now) {
  const C = NUM.casino.holdem;
  if (hdAlive(t).length <= 1) return hdSettle(t, ctx, now, "fold");
  const pend = hdPending(t);
  if (pend.length) {
    const ids = pend.map(s => s.uid);
    t.toAct = hdAfter(t, t.toAct).find(u => ids.includes(u));
    t.deadline = now + C.turnMs;
    return { ok: true };
  }
  const live = casHSeats(t).filter(s => s.st === "in");
  if (t.street >= 3 || live.length <= 1) { while (t.board.length < 5) t.board.push(t.deck.pop()); t.street = 3; return hdSettle(t, ctx, now, "showdown"); }
  t.street++;
  t.board.push(...(t.street === 1 ? [t.deck.pop(), t.deck.pop(), t.deck.pop()] : [t.deck.pop()]));
  casHSeats(t).forEach(s => { s.bet = 0; s.acted = false; });
  t.curBet = 0; t.lastRaise = hdBlinds(t).bb;
  const ids = live.map(s => s.uid);
  t.toAct = hdAfter(t, t.btn).find(u => ids.includes(u)); // 翻牌後從按鈕左邊第壹個還在的人開始（2 人時就是大盲）
  t.deadline = now + C.turnMs;
  return { ok: true };
}

// ---------- 結算：邊池、抽水、記帳 ----------
function hdSettle(t, ctx, now, how) {
  const C = NUM.casino.holdem, B = hdBlinds(t), dealt = hdDealt(t), alive = hdAlive(t);
  const scores = {};
  if (how === "showdown") alive.forEach(s => { scores[s.uid] = holdemScore(s.hole.concat(t.board)); });
  // 照投入分層：每壹層的人數 ≥ 2 才是池子；只有 1 個人投入的那壹層是沒人跟的，整層退還
  const levels = [...new Set(dealt.map(s => s.put).filter(x => x > 0))].sort((x, y) => x - y);
  const pots = []; let prev = 0;
  for (const lv of levels) {
    const contrib = dealt.filter(s => s.put > prev).map(s => ({ s, a: Math.min(s.put, lv) - prev })), amt = contrib.reduce((x, c) => x + c.a, 0);
    if (contrib.length === 1) contrib[0].s.stack += amt;
    else {
      let elig = alive.filter(s => s.put >= lv);
      if (!elig.length) { const top = Math.max(...alive.map(s => s.put)); elig = alive.filter(s => s.put === top); } // 理論上不會發生（沒人夠格分的層給投最多的人）
      pots.push({ amt, contrib, elig });
    }
    prev = lv;
  }
  const total = pots.reduce((x, p) => x + p.amt, 0);
  const rake = total > 2 * B.bb ? Math.min(Math.floor(total * C.rakePct / 100), C.rakeCapBB * B.bb) : 0;
  let left = rake; pots.forEach(p => { p.rake = total > 0 ? Math.floor(rake * p.amt / total) : 0; left -= p.rake; }); if (pots.length) pots[0].rake += left;
  const after = hdAfter(t, t.btn), pair = hdHd(ctx.house, ctx.day).pair;
  for (const p of pots) {
    const best = how === "showdown" ? Math.max(...p.elig.map(s => scores[s.uid])) : null;
    const winners = (how === "showdown" ? p.elig.filter(s => scores[s.uid] === best) : p.elig).sort((x, y) => after.indexOf(x.uid) - after.indexOf(y.uid));
    const net = p.amt - p.rake, share = Math.floor(net / winners.length), odd = net - share * winners.length, gain = {};
    winners.forEach((s, i) => { gain[s.uid] = share + (i < odd ? 1 : 0); s.stack += gain[s.uid]; });
    p.winners = winners.map(s => s.uid);
    const L = p.contrib.reduce((x, c) => x + (gain[c.s.uid] === undefined ? c.a : 0), 0); // 輸家投入的總和：抽水從贏家贏來的這部分扣
    for (const c of p.contrib) { // 輸家投入的錢照贏家拿到的比例分給贏家，記進兩人今天的帳
      if (gain[c.s.uid] !== undefined) continue;
      let rest = c.a;
      winners.forEach((w, i) => {
        const x = i === winners.length - 1 ? rest : Math.floor(c.a * gain[w.uid] / net); rest -= x;
        if (hdIsNpc(c.s) || hdIsNpc(w)) return; // 真人對 NPC 不記兩人的帳（NPC 有自己的額度）
        const r = L > 0 ? Math.floor(x * p.rake / L) : 0, key = hdPairKey(c.s.uid, w.uid), ids = key.split("|"), rec = Array.isArray(pair[key]) ? pair[key] : [0, 0];
        const nr = [hdN(rec[0]), hdN(rec[1])]; nr[ids.indexOf(c.s.uid)] -= x; nr[ids.indexOf(w.uid)] += x - r; pair[key] = nr;
      });
    }
  }
  if (rake > 0) { casHouseMove(ctx.house, "bj", rake); casCount(ctx.house, "holdemRake", rake); }
  casCount(ctx.house, "holdemHands");
  const delta = {}; dealt.forEach(s => { delta[s.uid] = s.stack - s.s0; });
  const npcSeats = dealt.filter(hdIsNpc);
  if (npcSeats.length) { // NPC 這手的輸贏：記他今天的、全館的，莊家帳跟著他的籌碼增減（他的籌碼是莊家帳上的外面世界的錢）
    const nc = npcCasFix(ctx.house, ctx.day);
    for (const s of npcSeats) {
      const by = nc.by[s.npc.id] || (nc.by[s.npc.id] = { n: 0, net: 0, hands: 0 });
      by.net += delta[s.uid]; by.hands = (by.hands | 0) + 1; nc.net += delta[s.uid];
      if (delta[s.uid]) casHouseMove(ctx.house, "npcBj", delta[s.uid]);
    }
  }
  const res = { hand: t.hand, how, winners: [...new Set(pots.flatMap(p => p.winners))], pot: total, rake, net: delta, board: t.board.slice(), street: t.street, pots: pots.map(p => ({ amount: p.amt, winners: p.winners, elig: p.elig.map(s => s.uid) })) };
  if (how === "showdown") { res.cards = {}; res.names = {}; alive.forEach(s => { res.cards[s.uid] = s.hole.slice(); res.names[s.uid] = holdemName(scores[s.uid]); }); }
  t.res = res;
  if (Array.isArray(ctx.hlog)) ctx.hlog.push({ at: now, pid: t.pid, hand: t.hand, lv: t.lv, how, street: t.street, pot: total, rake, net: delta, players: dealt.length, nicks: Object.fromEntries(dealt.map(s => [s.uid, s.nick])) });
  dealt.forEach(s => { s.put = 0; s.bet = 0; s.st = "idle"; s.acted = false; s.hole = []; s.cap = 0; });
  npcSeats.forEach(s => hdNpcSay(t, ctx, s, delta[s.uid] > 0 ? "win" : "lose", 0.4));
  t.phase = "over"; t.toAct = null; t.deck = []; t.deadline = now + C.resultMs;
  for (const id of t.order.slice()) { // 全下時離座的人：這手贏的錢現在進錢包
    const s = t.seats[id];
    if (s && s.leaving) { if (hdPay(ctx, s, s.stack)) { hdFreeNpc(ctx, s); hdRemove(t, id); } else s.leaving = false; }
  }
  if (casHSeats(t).length < 2) { t.phase = "wait"; t.deadline = null; }
  return { ok: true, finished: true };
}
function hdRemove(t, uid) {
  if (t.btn === uid) { const a = hdAfter(t, uid); t.btn = a.length > 1 ? a[a.length - 2] : null; } // 按鈕留在他前壹位，下壹手照樣往下壹位走
  delete t.seats[uid]; t.order = t.order.filter(x => x !== uid);
  if (t.btn && !t.seats[t.btn]) t.btn = t.order[0] || null;
}

// ---------- 離座（離開隊伍、斷線太久、超時太多） ----------
// 打牌中離座：還沒蓋牌的＝蓋牌；投進這手底池的錢不能帶走（留在池裡，全下的人照常分），座位留到這手結束，剩下的籌碼先回錢包。沒在打的人直接把桌上的籌碼拿回錢包
export function casHLeave(t, uid, ctx, now, quiet = false) {
  const s = t.seats[uid];
  if (!s) return { ok: true, none: true };
  if (!hdIsNpc(s) && !ctx.wallets[uid]) return { ok: false, reason: "錢包讀不到。" }; // 錢包壹定要在（呼叫的人讀了）；沒有的話籌碼留在座位上不丟
  if (t.phase === "play" && s.hole.length) {
    if (s.st === "in") {
      s.st = "fold";
      if (t.toAct === uid) hdProgress(t, ctx, now);
      else if (hdAlive(t).length <= 1) hdSettle(t, ctx, now, "fold");
      else if (!hdPending(t).length) hdProgress(t, ctx, now);
    }
    if (t.phase === "play" && t.seats[uid]) { // 這手還沒打完：投進去的錢還在底池裡，座位留到這手結束；剩下的籌碼先回錢包
      const out = s.stack; hdPay(ctx, s, out); s.stack = 0; s.s0 -= out; s.leaving = true;
      return { ok: true, cashed: out, later: true };
    }
  }
  const out = s.stack; hdPay(ctx, s, out); hdFreeNpc(ctx, s); hdRemove(t, uid);
  if (t.phase !== "play" && casHSeats(t).length < 2) { t.phase = "wait"; t.deadline = null; t.toAct = null; }
  if (!quiet && t.order.length && !casHSeats(t).some(x => !hdIsNpc(x))) casHClose(t, ctx, now); // 真人都走了：NPC 不自己打，這手打完（發完牌攤牌）NPC 帶著錢回去
  return { ok: true, cashed: out };
}

// ---------- 邀請旅客 NPC（沿用 21 點 npcCas 的規則，決定 0080、0150 補充二） ----------
// 現在邀得動誰：[{ id, name }]（在館裡、不在賭場、今天還有額度）。uid 有給：他剛拒絕過這位館友、30 分鐘還沒到的不列出來
export function casHNpcWho(ctx, now, uid) {
  const l = npcCasInvitable(ctx.house, ctx.day, now, ctx.secret || "", Array.isArray(ctx.npcList) ? ctx.npcList : [], ctx.counters || null);
  return uid ? l.filter(x => !(npcCasCoolLeft(ctx.house, ctx.day, uid, x.id, now) > 0)) : l;
}
// 館友 uid 邀 npcId 坐下。回傳 { ok: false, reason }（邀不了，什麼都沒改）或 { ok: true, accepted, name, line, until?, brought? }（沒答應 line 是他的拒絕台詞，同壹位 30 分鐘內不能再邀）
export function casHNpcInvite(t, ctx, uid, npcId, now) {
  const C = NUM.casino.npcCas, H = NUM.casino.holdem, me = t.seats[uid], list = Array.isArray(ctx.npcList) ? ctx.npcList : [], hs = ctx.house, sec = ctx.secret || "", B = hdBlinds(t);
  if (!C.on || !H.on) return { ok: false, reason: "邀請客人還沒開放" };
  if (!me || hdIsNpc(me)) return { ok: false, reason: "你不在這桌" };
  if (casHSeats(t).filter(s => s.npc && s.npc.host === uid).length >= (C.perHost || 1)) return { ok: false, reason: `你已經帶了 ${C.perHost || 1} 位客人` };
  const n = list.find(x => x && x.id === npcId && x.kind !== "trace");
  if (!n) return { ok: false, reason: "他不在館裡" };
  if (casHSeats(t).filter(s => s.npc).length >= C.tableMax) return { ok: false, reason: "這桌的客人夠多了" };
  if (t.order.length >= H.seats) return { ok: false, reason: "這桌坐滿了" };
  if (npcCasAway(hs, now).has(npcId)) return { ok: false, reason: "他已經跟別人去玩了" };
  const left = npcCasCoolLeft(hs, ctx.day, uid, npcId, now);
  if (left > 0) return { ok: false, reason: `他剛拒絕過你，${Math.ceil(left / 60000)} 分鐘後再邀`, wait: left };
  if (!casHNpcWho(ctx, now).some(x => x.id === npcId)) return { ok: false, reason: "他現在不在館裡，或今天不想玩了" };
  const nNpc = casHSeats(t).filter(hdIsNpc).length + 1, stack0 = hdNpcBuy(ctx, n, B.bb, nNpc);
  if (stack0 < 2 * B.bb) return { ok: false, reason: "他今天的額度不夠坐這桌，換小壹點的桌" };
  const w = ctx.wallets && ctx.wallets[uid], bonus = w ? npcRelBonus(w, npcId) : 0;
  const p = npcCasChance(hs, ctx.day, n, ctx.counters || null, bonus), ask = npcCasAsk(hs, ctx.day, npcId);
  const line = kind => npcCasLine(n, kind, `${sec}|${ctx.day}|${npcId}|${t.pid}|${kind}|${ask}`);
  if (npcCasRoll(sec, ctx.day, uid, npcId, ask) >= p) { // 被拒絕
    npcCasCool(hs, ctx.day, uid, npcId, now);
    return { ok: true, accepted: false, name: n.name, line: line("refuse") };
  }
  const got = casHouseWorldOut(hs, "npcBj", stack0, NUM.casino.world); // 籌碼從已知世界來；到不了 2 個大盲就不坐（還回去）
  if (got < 2 * B.bb) { if (got > 0) casHouseWorldIn(hs, "npcBj", got); return { ok: false, reason: "他今天不想玩了" }; }
  npcCasAccept(hs, ctx.day, n, t.pid, uid, now, sec);
  const rnd = mulberry32(hashStr(`${sec}|${ctx.day}|${npcId}|${t.pid}|hdstay|${ask}`)), until = now + (H.npcStay[0] + Math.floor(rnd() * (H.npcStay[1] - H.npcStay[0] + 1))) * 60000;
  hs.npcCas.at[npcId].until = until;
  const seat = { uid: "npc:" + npcId, nick: n.name, stack: got, put: 0, bet: 0, cap: 0, st: "idle", acted: false, hole: [], s0: 0, timeouts: 0, npc: { id: npcId, style: npcCasStyle(n), host: uid, until, said: 0, say: null } };
  t.seats[seat.uid] = seat; t.order.push(seat.uid);
  const said = line("accept"); hdTalk(t, seat, said);
  if (t.phase === "wait") casHStart(t, ctx, now);
  return { ok: true, accepted: true, name: n.name, line: said, until, brought: casHSeats(t).filter(x => x.npc && x.npc.host === uid).length };
}

// 桌子要收了（隊伍解散）：每個人都離座；這手還沒打完就把牌發完攤牌（全下的底池要有人分，不能跟著桌子消失），贏的錢進錢包
export function casHClose(t, ctx, now) {
  for (const id of t.order.slice()) casHLeave(t, id, ctx, now, true);
  if (t.phase === "play") { while (t.board.length < 5) t.board.push(t.deck.pop()); t.street = 3; hdSettle(t, ctx, now, hdAlive(t).length <= 1 ? "fold" : "showdown"); }
  return { ok: true };
}

// ---------- 時間往前走（每個交易的開頭叫） ----------
// 回傳有沒有動：輪到的人超時自動過牌／蓋牌；連續超時 maxTimeouts 次離座；看完結果自動開下壹手
export function casHAdvance(t, ctx, now) {
  const C = NUM.casino.holdem;
  let moved = false;
  for (let k = 0; k < 40; k++) {
    if (t.phase === "play" && t.deadline != null && now >= t.deadline && t.toAct) {
      const uid = t.toAct, me = t.seats[uid], toCall = t.curBet - me.bet, n = me.timeouts + 1;
      casHAct(t, uid, toCall > 0 ? "fold" : "check", 0, ctx, now);
      if (t.seats[uid]) t.seats[uid].timeouts = n;
      if (n >= C.maxTimeouts && t.seats[uid]) casHLeave(t, uid, ctx, now);
      moved = true; continue;
    }
    if (t.phase === "over" && t.deadline != null && now >= t.deadline) { casHStart(t, ctx, now); moved = true; continue; }
    if (t.phase === "wait" && casHSeats(t).length >= 2) { const r = casHStart(t, ctx, now); if (r.ok) { moved = true; continue; } }
    break;
  }
  return moved;
}

// ---------- 給壹個人看的樣子（別人的底牌不給，攤牌那手才揭開；pairLeft 是今天對同桌的人最少還能輸多少） ----------
export function casHView(t, uid, now, ctx) {
  const C = NUM.casino.holdem, B = hdBlinds(t), me = t.seats[uid], lim = casHBuyLimits(t);
  const v = {
    game: "holdem", pid: t.pid, hand: t.hand, phase: t.phase, street: t.street, board: t.board.slice(), now, deadline: t.deadline,
    level: { lv: Math.max(0, C.levels.findIndex(l => l[1] === B.bb)), sb: B.sb, bb: B.bb, levels: C.levels }, buy: lim, rake: { pct: C.rakePct, capBB: C.rakeCapBB, cap: C.rakeCapBB * B.bb },
    pot: casHSeats(t).reduce((a, s) => a + s.put, 0), toAct: t.toAct, curBet: t.curBet, E: t.E, res: t.res, rev: t.rev,
    seats: casHSeats(t).map(s => ({ uid: s.uid, nick: s.nick, stack: s.stack, put: s.put, bet: s.bet, st: s.st, me: s.uid === uid, btn: t.btn === s.uid, hole: s.uid === uid ? s.hole.slice() : (s.hole.length ? [-1, -1] : []), timeouts: s.timeouts, leaving: !!s.leaving, npc: hdIsNpc(s), say: s.npc && s.npc.say && s.npc.say.hand >= t.hand - 1 ? s.npc.say.text : null, sitOut: t.phase === "play" && s.st === "idle" })),
    sitting: !!me, seatsMax: C.seats,
  };
  const others = t.order.filter(x => x !== uid && !hdIsNpc(t.seats[x]));
  if (ctx && me && others.length) v.pairLeft = Math.min(...others.map(o => casHPairLeft(ctx.house, ctx.day, uid, o)));
  v.talk = Array.isArray(t.talk) ? t.talk.slice(-3) : [];
  if (me && t.phase === "play" && t.toAct === uid) {
    const toCall = t.curBet - me.bet, room = hdRoom(me), maxTo = me.bet + room;
    v.legal = { check: toCall <= 0, call: toCall > 0 ? Math.min(toCall, room) : 0, minTo: Math.min(t.curBet + t.lastRaise, maxTo), maxTo, canRaise: maxTo > t.curBet, fold: true };
  }
  return v;
}
// 有沒有人坐著（桌子可以收了）
export const casHEmpty = t => t.order.length === 0;
// 全館日報要算的「打牌中」：桌上的籌碼（沒投入的加投入的）
export const casHInplay = t => casHSeats(t).reduce((a, s) => a + (hdIsNpc(s) ? 0 : s.stack + s.put), 0); // NPC 的籌碼在莊家帳上，不算打牌中
