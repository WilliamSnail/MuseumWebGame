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
import { casHouseMove, casCount } from "./book.js";
import { casShuffle } from "./core.js";
import { holdemName, holdemScore } from "./holdem_eval.js";

const hdN = v => (Number.isFinite(+v) ? Math.floor(+v) : 0);
const hdBlinds = t => { const L = NUM.casino.holdem.levels[t.lv] || NUM.casino.holdem.levels[0]; return { sb: L[0], bb: L[1] }; };
export const casHSeats = t => t.order.map(id => t.seats[id]).filter(Boolean);
const hdPairKey = (a, b) => [a, b].sort().join("|");
// 從 uid 的下壹位開始、轉壹圈（uid 自己排最後；uid 不在桌上就從頭）
const hdAfter = (t, uid) => { const i = t.order.indexOf(uid); return i < 0 ? t.order.slice() : t.order.slice(i + 1).concat(t.order.slice(0, i + 1)); };
const hdDealt = t => casHSeats(t).filter(s => s.hole.length > 0);
const hdAlive = t => hdDealt(t).filter(s => s.st === "in" || s.st === "allin");

export function casHNew({ pid, lv, now }) {
  const L = Number.isInteger(lv) && lv >= 0 && lv < NUM.casino.holdem.levels.length ? lv : 0;
  return { v: 2, game: "holdem", pid, lv: L, hand: 0, phase: "wait", deadline: null, street: 0, board: [], deck: [], toAct: null, curBet: 0, lastRaise: 0, E: 0, btn: null, seats: {}, order: [], res: null, rev: 0, at: now };
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
  const C = NUM.casino.holdem, B = hdBlinds(t), seated = casHSeats(t);
  const stop = why => { t.phase = "wait"; t.deadline = null; t.toAct = null; return { ok: false, why }; };
  if (!C.on || seated.length < 2) return stop("alone");
  let D = seated.filter(s => s.stack >= 2 * B.bb);
  if (D.length < 2) return stop("short");
  // 今天兩人之間額度不到 2 個大盲的，不能同桌打這手：壹次請走「卡到最多人」的那位（同樣多就請籌碼少的），直到沒有人卡人
  for (;;) {
    const bad = {}; let any = false;
    for (let i = 0; i < D.length; i++) for (let j = i + 1; j < D.length; j++) if (casHPairLeft(ctx.house, ctx.day, D[i].uid, D[j].uid) < 2 * B.bb) { any = true; bad[D[i].uid] = (bad[D[i].uid] || 0) + 1; bad[D[j].uid] = (bad[D[j].uid] || 0) + 1; }
    if (!any) break;
    const worst = D.slice().sort((x, y) => (bad[y.uid] || 0) - (bad[x.uid] || 0) || x.stack - y.stack)[0];
    D = D.filter(s => s !== worst);
    if (D.length < 2) return stop("cap");
  }
  const caps = {};
  D.forEach(s => { caps[s.uid] = Math.min(s.stack, ...D.filter(o => o !== s).map(o => casHPairLeft(ctx.house, ctx.day, s.uid, o.uid))); });
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
export function casHAct(t, uid, a, to, ctx, now) {
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
        const r = L > 0 ? Math.floor(x * p.rake / L) : 0, key = hdPairKey(c.s.uid, w.uid), ids = key.split("|"), rec = Array.isArray(pair[key]) ? pair[key] : [0, 0];
        const nr = [hdN(rec[0]), hdN(rec[1])]; nr[ids.indexOf(c.s.uid)] -= x; nr[ids.indexOf(w.uid)] += x - r; pair[key] = nr;
      });
    }
  }
  if (rake > 0) { casHouseMove(ctx.house, "bj", rake); casCount(ctx.house, "holdemRake", rake); }
  casCount(ctx.house, "holdemHands");
  const delta = {}; dealt.forEach(s => { delta[s.uid] = s.stack - s.s0; });
  const res = { hand: t.hand, how, winners: [...new Set(pots.flatMap(p => p.winners))], pot: total, rake, net: delta, board: t.board.slice(), street: t.street, pots: pots.map(p => ({ amount: p.amt, winners: p.winners, elig: p.elig.map(s => s.uid) })) };
  if (how === "showdown") { res.cards = {}; res.names = {}; alive.forEach(s => { res.cards[s.uid] = s.hole.slice(); res.names[s.uid] = holdemName(scores[s.uid]); }); }
  t.res = res;
  if (Array.isArray(ctx.hlog)) ctx.hlog.push({ at: now, pid: t.pid, hand: t.hand, lv: t.lv, how, street: t.street, pot: total, rake, net: delta, players: dealt.length, nicks: Object.fromEntries(dealt.map(s => [s.uid, s.nick])) });
  dealt.forEach(s => { s.put = 0; s.bet = 0; s.st = "idle"; s.acted = false; s.hole = []; s.cap = 0; });
  t.phase = "over"; t.toAct = null; t.deck = []; t.deadline = now + C.resultMs;
  for (const id of t.order.slice()) { // 全下時離座的人：這手贏的錢現在進錢包
    const s = t.seats[id];
    if (s && s.leaving) { const w = ctx.wallets[id]; if (w) { w.chips += s.stack; hdRemove(t, id); } else s.leaving = false; }
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
export function casHLeave(t, uid, ctx, now) {
  const s = t.seats[uid];
  if (!s) return { ok: true, none: true };
  const w = ctx.wallets[uid];
  if (!w) return { ok: false, reason: "錢包讀不到。" }; // 錢包壹定要在（呼叫的人讀了）；沒有的話籌碼留在座位上不丟
  if (t.phase === "play" && s.hole.length) {
    if (s.st === "in") {
      s.st = "fold";
      if (t.toAct === uid) hdProgress(t, ctx, now);
      else if (hdAlive(t).length <= 1) hdSettle(t, ctx, now, "fold");
      else if (!hdPending(t).length) hdProgress(t, ctx, now);
    }
    if (t.phase === "play" && t.seats[uid]) { // 這手還沒打完：投進去的錢還在底池裡，座位留到這手結束；剩下的籌碼先回錢包
      const out = s.stack; w.chips += out; s.stack = 0; s.s0 -= out; s.leaving = true;
      return { ok: true, cashed: out, later: true };
    }
  }
  const out = s.stack; w.chips += out; hdRemove(t, uid);
  if (t.phase !== "play" && casHSeats(t).length < 2) { t.phase = "wait"; t.deadline = null; t.toAct = null; }
  return { ok: true, cashed: out };
}

// 桌子要收了（隊伍解散）：每個人都離座；這手還沒打完就把牌發完攤牌（全下的底池要有人分，不能跟著桌子消失），贏的錢進錢包
export function casHClose(t, ctx, now) {
  for (const id of t.order.slice()) casHLeave(t, id, ctx, now);
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
    level: { lv: t.lv, sb: B.sb, bb: B.bb, levels: C.levels }, buy: lim, rake: { pct: C.rakePct, capBB: C.rakeCapBB, cap: C.rakeCapBB * B.bb },
    pot: casHSeats(t).reduce((a, s) => a + s.put, 0), toAct: t.toAct, curBet: t.curBet, E: t.E, res: t.res, rev: t.rev,
    seats: casHSeats(t).map(s => ({ uid: s.uid, nick: s.nick, stack: s.stack, put: s.put, bet: s.bet, st: s.st, me: s.uid === uid, btn: t.btn === s.uid, hole: s.uid === uid ? s.hole.slice() : (s.hole.length ? [-1, -1] : []), timeouts: s.timeouts, leaving: !!s.leaving, sitOut: t.phase === "play" && s.st === "idle" })),
    sitting: !!me, seatsMax: C.seats,
  };
  if (ctx && me && t.order.length > 1) v.pairLeft = Math.min(...t.order.filter(x => x !== uid).map(o => casHPairLeft(ctx.house, ctx.day, uid, o)));
  if (me && t.phase === "play" && t.toAct === uid) {
    const toCall = t.curBet - me.bet, room = hdRoom(me), maxTo = me.bet + room;
    v.legal = { check: toCall <= 0, call: toCall > 0 ? Math.min(toCall, room) : 0, minTo: Math.min(t.curBet + t.lastRaise, maxTo), maxTo, canRaise: maxTo > t.curBet, fold: true };
  }
  return v;
}
// 有沒有人坐著（桌子可以收了）
export const casHEmpty = t => t.order.length === 0;
// 全館日報要算的「打牌中」：桌上的籌碼（沒投入的加投入的）
export const casHInplay = t => casHSeats(t).reduce((a, s) => a + s.stack + s.put, 0);
