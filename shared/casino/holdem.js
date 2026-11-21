// ================================================================
//  德州撲克（館友對館友，決定 0150，翊文 11-21）：先做 2 人桌（heads-up）。純函式：只改傳進來的 t（桌子）、ctx（錢包、莊家），亂數走 RNG（伺服器是 cryptoRng）。
//  規劃和模擬：docs/規劃/新牌桌遊戲規劃.md 第 4 節、test/sim/sim_holdem.cjs。牌力在 shared/casino/holdem_eval.js；牌的編號跟 21 點壹樣（0～51，0＝A）。
//  錢（守恆）：買入＝錢包 → 桌上的籌碼 stack；離座＝stack → 錢包；每手的注從 stack 搬到底池（put）；贏家拿底池扣抽水；抽水進莊家（來源記 bj＝牌桌，casCount holdemRake）。
//    桌上的 stack 和 put 全館日報算「打牌中」（functions/casino/casino.js 的 reportSnap）。永遠不印錢、不燒錢。
//  規則：無限注，單挑（按鈕＝小盲，翻牌前先說話，翻牌後大盲先說話）；每手開始時算「有效籌碼」E ＝ min(兩人的籌碼, 今天對這個人還能輸多少)，每人這手最多投入 E——所以不會有邊池、沒人會被多的籌碼蓋過，
//    也讓「壹天對同壹人淨輸上限 pairDay」一定守得住（翊文：2,000 萬）。每手都抽水（底池 > 2 個大盲才抽，不用等翻牌；沒翻牌不抽會變免費轉帳）：5%、封頂 3 個大盲。
//  時間：每人每步 turnMs；到了自動過牌（沒有要跟的）或蓋牌；連續 maxTimeouts 次超時自動離座（籌碼回錢包）。伺服器沒有計時器：畫面到時間叫 tick，casHAdvance 照時間往下走。
//  桌子 t：{ v, game: "holdem", pid, lv, hand, phase: "wait"｜"play"｜"over", deadline, street 0～3, board, deck, toAct, curBet, lastRaise, E, btn（按鈕座位的序號）, seats, order, res（上壹手的結果）, rev }
//  座位：{ uid, nick, stack（桌上沒投入的）, put（這手總共投入）, bet（這條街投入）, st: "idle"｜"in"｜"fold"｜"allin", acted, hole, s0（這手開始時的 stack）, timeouts }
//  ctx：{ wallets: { uid: 錢包 }, house, day, hlog（陣列：每手的紀錄，伺服器寫進 casinoHoldemLog） }
// ================================================================
import { NUM } from "../core/config.js";
import { casHouseMove, casCount } from "./book.js";
import { casShuffle } from "./core.js";
import { holdemName, holdemScore } from "./holdem_eval.js";

const hdN = v => (Number.isFinite(+v) ? Math.floor(+v) : 0);
const hdBlinds = t => { const L = NUM.casino.holdem.levels[t.lv] || NUM.casino.holdem.levels[0]; return { sb: L[0], bb: L[1] }; };
export const casHSeats = t => t.order.map(id => t.seats[id]).filter(Boolean);
const hdOpp = (t, uid) => t.seats[t.order.find(x => x !== uid)] || null;
const hdPairKey = (a, b) => [a, b].sort().join("|");

export function casHNew({ pid, lv, now }) {
  const L = Number.isInteger(lv) && lv >= 0 && lv < NUM.casino.holdem.levels.length ? lv : 0;
  return { v: 1, game: "holdem", pid, lv: L, hand: 0, phase: "wait", deadline: null, street: 0, board: [], deck: [], toAct: null, curBet: 0, lastRaise: 0, E: 0, btn: 0, seats: {}, order: [], res: null, rev: 0, at: now };
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
  if (!s) { s = { uid, nick, stack: 0, put: 0, bet: 0, st: "idle", acted: false, hole: [], s0: 0, timeouts: 0 }; t.seats[uid] = s; t.order.push(uid); }
  s.nick = nick; s.timeouts = 0;
  w.chips -= n; s.stack += n;
  return { ok: true, stack: s.stack };
}

// ---------- 發牌 ----------
// 兩人都在座、籌碼夠（≥ 2 個大盲）、今天對這個人還沒到上限，就開壹手。不夠回 { ok: false, why }
export function casHStart(t, ctx, now) {
  const C = NUM.casino.holdem, B = hdBlinds(t), S = casHSeats(t);
  if (!C.on || S.length < 2) { t.phase = "wait"; t.deadline = null; return { ok: false, why: "alone" }; }
  const [a, b] = S;
  if (a.stack < 2 * B.bb || b.stack < 2 * B.bb) { t.phase = "wait"; t.deadline = null; return { ok: false, why: "short" }; }
  const E = Math.min(a.stack, b.stack, casHPairLeft(ctx.house, ctx.day, a.uid, b.uid));
  if (E < 2 * B.bb) { t.phase = "wait"; t.deadline = null; return { ok: false, why: "cap" }; }
  const deck = casShuffle();
  t.hand++; t.btn = (t.btn + 1) % 2; t.E = E; t.street = 0; t.board = [];
  const sbS = t.seats[t.order[t.btn]], bbS = t.seats[t.order[1 - t.btn]];
  S.forEach(s => { s.s0 = s.stack; s.put = 0; s.bet = 0; s.st = "in"; s.acted = false; s.hole = [deck.pop(), deck.pop()]; });
  const post = (s, amt) => { s.stack -= amt; s.put += amt; s.bet += amt; };
  post(sbS, B.sb); post(bbS, B.bb);
  t.deck = deck; t.curBet = B.bb; t.lastRaise = B.bb; t.toAct = sbS.uid; t.deadline = now + C.turnMs; t.phase = "play"; t.res = null;
  return { ok: true };
}

// ---------- 做壹個動作 ----------
// a：fold／check／call／raise（to ＝加到多少，這條街的總投入）／allin
export function casHAct(t, uid, a, to, ctx, now) {
  const C = NUM.casino.holdem, me = t.seats[uid], opp = hdOpp(t, uid);
  if (!me) return { ok: false, reason: "你不在這桌。" };
  if (t.phase !== "play" || !opp) return { ok: false, reason: "現在沒有在打。" };
  if (t.toAct !== uid) return { ok: false, reason: "還沒輪到你。" };
  const toCall = t.curBet - me.bet, room = Math.max(0, Math.min(me.stack, t.E - me.put)), maxTo = me.bet + room;
  const pay = amt => { me.stack -= amt; me.put += amt; me.bet += amt; };
  if (a === "fold") { me.st = "fold"; me.timeouts = 0; return hdFinish(t, ctx, [opp.uid], "fold", now); }
  if (a === "check") {
    if (toCall > 0) return { ok: false, reason: "要跟注或蓋牌。" };
  } else if (a === "call") {
    if (toCall <= 0) return { ok: false, reason: "不用跟，可以過牌。" };
    pay(Math.min(toCall, room));
  } else if (a === "raise" || a === "allin") {
    let target = a === "allin" ? maxTo : hdN(to);
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
      t.lastRaise = Math.max(t.lastRaise, rs); t.curBet = me.bet;
    }
  } else return { ok: false, reason: "不認得的動作。" };
  me.acted = true; me.timeouts = 0;
  if (me.put >= t.E) me.st = "allin";
  return hdProgress(t, ctx, now);
}

// 這條街結束了嗎？結束了就翻牌／攤牌；沒有就換對方
function hdProgress(t, ctx, now) {
  const C = NUM.casino.holdem, S = casHSeats(t), [a, b] = S;
  const equal = a.bet === b.bet, allin = a.put >= t.E || b.put >= t.E;
  if (equal && ((a.acted && b.acted) || allin)) {
    if (t.street >= 3 || allin) { while (t.board.length < 5) t.board.push(t.deck.pop()); t.street = 3; return hdShowdown(t, ctx, now); }
    t.street++;
    t.board.push(...(t.street === 1 ? [t.deck.pop(), t.deck.pop(), t.deck.pop()] : [t.deck.pop()]));
    S.forEach(s => { s.bet = 0; s.acted = false; });
    t.curBet = 0; t.lastRaise = hdBlinds(t).bb;
    t.toAct = t.order[1 - t.btn]; // 翻牌後大盲先說話
  } else {
    t.toAct = t.order.find(x => x !== t.toAct);
  }
  t.deadline = now + C.turnMs;
  return { ok: true };
}
function hdShowdown(t, ctx, now) {
  const [a, b] = casHSeats(t), sa = holdemScore(a.hole.concat(t.board)), sb = holdemScore(b.hole.concat(t.board));
  const win = sa > sb ? [a.uid] : sb > sa ? [b.uid] : [a.uid, b.uid];
  return hdFinish(t, ctx, win, "showdown", now, { [a.uid]: sa, [b.uid]: sb });
}
// 結算：底池扣抽水給贏家（平手對分，單的那壹個籌碼給大盲）；抽水進莊家；記今天這兩個人的淨輸贏、這手的紀錄
function hdFinish(t, ctx, winners, how, now, scores) {
  const C = NUM.casino.holdem, B = hdBlinds(t), S = casHSeats(t);
  const pot = S.reduce((a, s) => a + s.put, 0);
  const rake = pot > 2 * B.bb ? Math.min(Math.floor(pot * C.rakePct / 100), C.rakeCapBB * B.bb) : 0;
  const net = pot - rake;
  if (winners.length === 1) t.seats[winners[0]].stack += net;
  else { const half = Math.floor(net / 2), odd = net - 2 * half, big = t.order[1 - t.btn]; winners.forEach(u => { t.seats[u].stack += half + (u === big ? odd : 0); }); }
  if (rake > 0) { casHouseMove(ctx.house, "bj", rake); casCount(ctx.house, "holdemRake", rake); }
  casCount(ctx.house, "holdemHands");
  const delta = {}; S.forEach(s => { delta[s.uid] = s.stack - s.s0; });
  const hd = hdHd(ctx.house, ctx.day), key = hdPairKey(S[0].uid, S[1].uid), ids = [S[0].uid, S[1].uid].sort(), old = Array.isArray(hd.pair[key]) ? hd.pair[key] : [0, 0];
  hd.pair[key] = [hdN(old[0]) + delta[ids[0]], hdN(old[1]) + delta[ids[1]]];
  const res = { hand: t.hand, how, winners: winners.slice(), pot, rake, net: delta, board: t.board.slice(), street: t.street };
  if (how === "showdown") { res.cards = {}; res.names = {}; S.forEach(s => { res.cards[s.uid] = s.hole.slice(); res.names[s.uid] = holdemName(scores[s.uid]); }); }
  t.res = res;
  if (Array.isArray(ctx.hlog)) ctx.hlog.push({ at: now, pid: t.pid, hand: t.hand, lv: t.lv, how, street: t.street, pot, rake, net: delta, nicks: Object.fromEntries(S.map(s => [s.uid, s.nick])) });
  S.forEach(s => { s.put = 0; s.bet = 0; s.st = "idle"; s.acted = false; s.hole = []; });
  t.phase = "over"; t.toAct = null; t.deck = []; t.deadline = now + C.resultMs;
  return { ok: true, finished: true };
}

// ---------- 離座（離開隊伍、斷線太久、超時太多） ----------
// 打牌中離座＝蓋牌（對方贏底池）；桌上的籌碼回錢包
export function casHLeave(t, uid, ctx, now) {
  const s = t.seats[uid];
  if (!s) return { ok: true, none: true };
  const opp = hdOpp(t, uid);
  if (t.phase === "play" && opp) { s.st = "fold"; hdFinish(t, ctx, [opp.uid], "fold", now); }
  const w = ctx.wallets[uid];
  if (w) w.chips += s.stack; // 錢包壹定要在（呼叫的人讀了）；沒有的話籌碼留在座位上不丟
  else return { ok: false, reason: "錢包讀不到。" };
  delete t.seats[uid]; t.order = t.order.filter(x => x !== uid);
  if (t.phase !== "over") { t.phase = "wait"; t.deadline = null; t.toAct = null; }
  if (t.btn >= t.order.length) t.btn = 0;
  return { ok: true, cashed: s.stack };
}

// ---------- 時間往前走（每個交易的開頭叫） ----------
// 回傳有沒有動：輪到的人超時自動過牌／蓋牌；連續超時 maxTimeouts 次離座；看完結果自動開下壹手
export function casHAdvance(t, ctx, now) {
  const C = NUM.casino.holdem;
  let moved = false;
  for (let k = 0; k < 4; k++) {
    if (t.phase === "play" && t.deadline != null && now >= t.deadline && t.toAct) {
      const uid = t.toAct, me = t.seats[uid], toCall = t.curBet - me.bet, n = me.timeouts + 1;
      casHAct(t, uid, toCall > 0 ? "fold" : "check", 0, ctx, now);
      if (t.seats[uid]) t.seats[uid].timeouts = n;
      if (n >= C.maxTimeouts && t.seats[uid]) casHLeave(t, uid, ctx, now);
      moved = true; continue;
    }
    if (t.phase === "over" && t.deadline != null && now >= t.deadline) { casHStart(t, ctx, now); moved = true; continue; }
    if (t.phase === "wait" && casHSeats(t).length === 2) { const r = casHStart(t, ctx, now); if (r.ok) { moved = true; continue; } }
    break;
  }
  return moved;
}

// ---------- 給壹個人看的樣子（對方的底牌不給，攤牌那手才揭開；pairLeft 是今天對這個人還能輸多少） ----------
export function casHView(t, uid, now, ctx) {
  const C = NUM.casino.holdem, B = hdBlinds(t), me = t.seats[uid], opp = hdOpp(t, uid), lim = casHBuyLimits(t);
  const v = {
    game: "holdem", pid: t.pid, hand: t.hand, phase: t.phase, street: t.street, board: t.board.slice(), now, deadline: t.deadline,
    level: { lv: t.lv, sb: B.sb, bb: B.bb, levels: C.levels }, buy: lim, rake: { pct: C.rakePct, capBB: C.rakeCapBB, cap: C.rakeCapBB * B.bb },
    pot: casHSeats(t).reduce((a, s) => a + s.put, 0), toAct: t.toAct, curBet: t.curBet, E: t.E, res: t.res, rev: t.rev,
    seats: casHSeats(t).map(s => ({ uid: s.uid, nick: s.nick, stack: s.stack, put: s.put, bet: s.bet, st: s.st, me: s.uid === uid, btn: t.order[t.btn] === s.uid, hole: s.uid === uid ? s.hole.slice() : (s.hole.length ? [-1, -1] : []), timeouts: s.timeouts })),
    sitting: !!me, seatsMax: C.seats,
  };
  if (ctx && opp && me) v.pairLeft = casHPairLeft(ctx.house, ctx.day, uid, opp.uid);
  if (me && t.phase === "play" && t.toAct === uid) {
    const toCall = t.curBet - me.bet, room = Math.max(0, Math.min(me.stack, t.E - me.put)), maxTo = me.bet + room;
    v.legal = { check: toCall <= 0, call: toCall > 0 ? Math.min(toCall, room) : 0, minTo: Math.min(t.curBet + t.lastRaise, maxTo), maxTo, canRaise: maxTo > t.curBet, fold: true };
  }
  return v;
}
// 有沒有人坐著（桌子可以收了）
export const casHEmpty = t => t.order.length === 0;
// 全館日報要算的「打牌中」：桌上的籌碼（沒投入的加投入的）
export const casHInplay = t => casHSeats(t).reduce((a, s) => a + s.stack + s.put, 0);
