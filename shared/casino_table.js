// ================================================================
//  Hamachi 賭場：館友同桌（第二階段，決定 0040）。純函式：只改傳進來的 t（牌桌）和錢包，亂數走 RNG。
//  1–4 人同一張桌、同一副牌（每一局洗一副新的 52 張）、同一個莊家；各下各的注，照入座的順序輪流要牌；
//  有時間限制：下注 NUM.casino.betMs、輪到你 turnMs、看結果 resultMs。時間到、斷線都當停牌（伺服器沒有計時器，
//  畫面到時間會叫 tick，casTAdvance 照時間往下走；很久沒人叫，下次一碰就補完）。
//  誰的牌別人看得到（跟真的賭桌一樣）；莊家的底牌結算才給；理智低的人看到的牌是假的（看的人自己的理智，結算翻回真的）。
//  離桌不影響別人：下注前離桌退注；打牌中離桌，這一手當停牌、照樣結算（錢進他的錢包），別人照常打。
//  牌桌（t）：{ v, pid, rid, round, phase: "bet"｜"play"｜"result", deadline, seq, seats: { uid: 座位 }, order: [uid…], dealer, deck, turn }
//  座位：{ uid, nick, bet, cards, st: "idle"｜"bet"｜"play"｜"stand"｜"done", san, bonusPct, allin, out, gone, idle, timedOut }
//  ctx：{ wallets: { uid: 錢包 }, house, day }（會改）。邀 NPC 的桌子還要 ctx.secret、ctx.npcList、ctx.counters（NPC 名單、全館進度），NPC 說的話寫進 ctx.says（陣列，伺服器之後推進聊天）。
//  NPC 座位（11-14，決定 0080，規則在 shared/casino_npc.js）：uid 是 "n~NPC的id"，座位多 npc：{ id, style, host 帶他來的館友, until 待到哪個毫秒, said 這局說了幾句 }；
//    沒有錢包：注從外面世界出、賠付回外面世界；下注、要牌、停牌都由伺服器馬上替他做，不等計時；館友先下注他才下注（桌上只有 NPC 時不開局）。
// ================================================================
import { NUM } from "./config.js";
import { CAS_TEXT } from "./casino_text.js";
import { casBetCheck, casDealerPlay, casHand, casOutcome, casPayout, casPoint, casShown, casShuffle } from "./casino.js";
import { casBetMax, casPayLeft, casSettle, casWinTicket } from "./casino_wallet.js";
import { hashStr, mulberry32 } from "./logic.js";
import { npcCasAccept, npcCasAsk, npcCasAway, npcCasBet, npcCasChance, npcCasCool, npcCasCoolLeft, npcCasFix, npcCasFree, npcCasHit, npcCasInvitable, npcCasLeaveWhy, npcCasLine, npcCasPay, npcCasRefund, npcCasRoll, npcCasStyle, npcCasTake, npcCasUp } from "./casino_npc.js";

export const CAS_QUICK = ["加油", "好牌", "莊家別爆", "再來壹把", "我不行了", "運氣來了"]; // 快速短句（自由打字另外走 cleanSay）

export function casTNew({ pid, now }) {
  return { v: 1, pid, rid: `${pid}:0`, round: 0, phase: "bet", deadline: now + NUM.casino.betMs, seq: 0, seats: {}, order: [], dealer: [], deck: [], turn: null };
}
const casTSeatNew = (uid, nick) => ({ uid, nick, bet: 0, cards: [], st: "idle", san: 99, bonusPct: 0, allin: false, out: null, gone: false, idle: 0, timedOut: false });
export const casTSeats = t => t.order.map(id => t.seats[id]).filter(Boolean);
const casTBettors = t => casTSeats(t).filter(s => s.bet > 0);
const casTHumanBet = t => casTSeats(t).some(s => !s.npc && s.bet > 0);
const npcOf = (ctx, s) => (Array.isArray(ctx.npcList) ? ctx.npcList.find(x => x && x.id === s.npc.id) : null) || { id: s.npc.id, name: s.nick };
// 這位 NPC 說壹句（種子含祕密：同壹局同壹種不會每次都壹樣）
function npcSay(t, ctx, s, kind, tag) {
  const text = npcCasLine(npcOf(ctx, s), kind, `${ctx.secret || ""}|${ctx.day}|${s.npc.id}|${t.rid}|${kind}|${tag == null ? s.npc.said : tag}`);
  if (text && Array.isArray(ctx.says)) { ctx.says.push({ by: s.uid, name: s.nick, npc: true, text }); s.npc.said++; }
  return text;
}
// NPC 走（說離開的話、退還沒打的注、從座位和「在賭場」名單拿掉）。reason 只記在回傳，不影響錢
function casTNpcGo(t, ctx, s, reason) {
  if (s.bet > 0 && s.out == null) { npcCasRefund(ctx.house, s.bet); s.bet = 0; }
  if (reason !== "silent") npcSay(t, ctx, s, "leave", reason);
  delete t.seats[s.uid];
  t.order = t.order.filter(x => x !== s.uid);
  npcCasFree(ctx.house, s.npc.id);
  t.seq++;
}

export function casTSit(t, uid, nick) {
  if (t.seats[uid]) { t.seats[uid].gone = false; t.seats[uid].nick = nick; return { ok: true, again: true }; }
  if (t.order.length >= NUM.casino.seats) return { ok: false, reason: "這桌坐滿了" };
  t.seats[uid] = casTSeatNew(uid, nick);
  t.order.push(uid);
  return { ok: true };
}
// 下注：扣錢包（ctx.wallets[uid]）。人都下好了就馬上發牌。info：{ san, bonusPct }（伺服器從存檔讀的）
export function casTBet(t, uid, text, info, ctx, now) {
  const s = t.seats[uid], w = ctx.wallets[uid];
  if (!s || !w) return { ok: false, reason: "你不在這桌" };
  if (t.phase !== "bet") return { ok: false, reason: "這局已經開始了，等下一局" };
  if (s.bet > 0) return { ok: false, reason: "你已經下注了" };
  const hs = ctx.house, left = hs ? casPayLeft(hs, ctx.day) : Infinity, top = hs ? Math.min(casBetMax(hs), left === Infinity ? Infinity : Math.floor(left / NUM.casino.risk.betMult)) : Infinity;
  if (hs && (left <= 0 || top < NUM.casino.minBet)) return { ok: false, gag: true, reason: CAS_TEXT.payCapDone };
  const chk = casBetCheck(text, w.chips, top);
  if (!chk.ok) return { ok: false, gag: true, reason: chk.line };
  s.allin = chk.bet === w.chips;
  w.chips -= chk.bet;
  w.tablePid = t.pid;
  Object.assign(s, { bet: chk.bet, st: "bet", san: Number.isFinite(info.san) ? info.san : 99, bonusPct: info.bonusPct || 0, idle: 0 });
  t.seq++;
  casTNpcBets(t, ctx, now);
  if (casTSeats(t).every(x => x.bet > 0)) casTDeal(t, ctx, now);
  return { ok: true };
}
// 有館友下了注，桌上的 NPC 才跟著下（下注階段、還沒下的）：該走的先走（時間到、額度用完），下不了注也走。不發牌（叫的人自己看是不是都下好了）
function casTNpcBets(t, ctx, now) {
  if (t.phase !== "bet" || !casTHumanBet(t)) return;
  for (const s of casTSeats(t)) {
    if (!s.npc || s.bet > 0) continue;
    const n = npcOf(ctx, s), why = npcCasLeaveWhy(ctx.house, ctx.day, n, s.npc.until, now);
    if (why) { casTNpcGo(t, ctx, s, why); continue; }
    const bet = npcCasBet(n, ctx.house, ctx.day), got = bet > 0 ? npcCasTake(ctx.house, bet) : 0;
    if (got <= 0) { casTNpcGo(t, ctx, s, "loss"); continue; }
    Object.assign(s, { bet: got, st: "bet", idle: 0 });
    if (s.npc.first) { s.npc.first = false; if (mulberry32(hashStr(`${ctx.secret || ""}|${ctx.day}|${s.npc.id}|${t.rid}|first`))() < 0.5) npcSay(t, ctx, s, "sit"); }
  }
}
// 發牌：每位下了注的人兩張、莊家兩張（[0] 底牌、[1] 明牌）。前兩張 21 點的自動停牌
export function casTDeal(t, ctx, now) {
  const bet = casTBettors(t);
  if (!bet.length) return false;
  t.deck = casShuffle();
  t.dealer = [];
  for (const s of bet) s.cards = [t.deck.pop()];
  t.dealer.push(t.deck.pop());
  for (const s of bet) { s.cards.push(t.deck.pop()); s.st = casHand(s.cards).total === 21 ? "stand" : "play"; }
  t.dealer.push(t.deck.pop());
  for (const s of casTSeats(t)) if (!s.bet) s.idle++;
  t.phase = "play";
  t.turn = null;
  t.deadline = now + NUM.casino.turnMs;
  t.seq++;
  casTNextTurn(t, ctx, now, null);
  return true;
}
// 輪到下一位（from 之後第一個還在要牌的）；沒有了就莊家補牌、結算
function casTNextTurn(t, ctx, now, from) {
  const seats = casTSeats(t).filter(s => s.bet > 0);
  let i = from ? seats.findIndex(s => s.uid === from) : -1;
  for (let guard = 0; guard < 8; guard++) {
    const next = seats.slice(i + 1).find(s => s.st === "play");
    if (!next) break;
    if (!next.npc) { t.turn = next.uid; t.deadline = now + NUM.casino.turnMs; return; }
    casTNpcPlay(t, ctx, next); // NPC 不等計時：馬上打完
    i = seats.indexOf(next);
  }
  casTFinish(t, ctx, now);
}
// NPC 打這壹手：照他的打法要牌，直到停牌、爆牌、五張過關、二十壹點
function casTNpcPlay(t, ctx, s) {
  const up = npcCasUp(t.dealer), style = s.npc.style || npcCasStyle(npcOf(ctx, s));
  for (let k = 0; k < 6 && s.st === "play"; k++) {
    if (npcCasHit(style, s.cards, up) && t.deck.length) {
      s.cards.push(t.deck.pop());
      const h = casHand(s.cards);
      if (h.bust) s.st = "done"; else if (h.charlie || h.total === 21) s.st = "stand";
    } else s.st = "stand";
  }
  if (s.st === "play") s.st = "stand";
  t.seq++;
}
// 要牌、停牌。seq 要是最新的（連點兩下第二下會被擋）
export function casTAct(t, uid, act, seq, ctx, now) {
  const s = t.seats[uid];
  if (!s) return { ok: false, reason: "你不在這桌" };
  if (t.phase !== "play") return { ok: false, reason: "現在不是打牌的時候" };
  if (t.turn !== uid || s.st !== "play") return { ok: false, reason: "還沒輪到你" };
  if (seq !== t.seq) return { ok: false, reason: "畫面不是最新的，再看壹下" };
  if (act !== "hit" && act !== "stand") return { ok: false, reason: "要加牌還是不要？" };
  t.seq++;
  if (act === "hit") {
    s.cards.push(t.deck.pop());
    const h = casHand(s.cards);
    if (h.bust) s.st = "done"; else if (h.charlie || h.total === 21) s.st = "stand";
  } else s.st = "stand";
  if (s.st !== "play") casTNextTurn(t, ctx, now, uid);
  else t.deadline = now + NUM.casino.turnMs; // 還在要牌：時間重算
  return { ok: true };
}
// 離桌（離開隊伍之前叫）。回傳 { ok, refund }
export function casTLeave(t, uid, ctx, now) {
  const s = t.seats[uid], w = ctx.wallets[uid];
  if (!s) return { ok: true, nothing: true };
  let refund = 0;
  if (t.phase === "bet" && s.bet > 0) { refund = s.bet; if (w) w.chips += refund; }
  if (w) w.tablePid = null;
  if (t.phase === "play" && s.bet > 0 && s.out == null) {
    s.gone = true; // 這一手當停牌，結算照常（錢進他的錢包，結算後座位才拿掉）
    if (s.st === "play") { s.st = "stand"; if (t.turn === uid) casTNextTurn(t, ctx, now, uid); }
    t.seq++;
    return { ok: true, refund, stays: true };
  }
  delete t.seats[uid];
  t.order = t.order.filter(x => x !== uid);
  if (t.turn === uid) t.turn = null;
  t.seq++;
  casTNpcSweep(t, ctx);
  if (t.phase === "bet" && t.order.length && casTHumanBet(t) && casTSeats(t).every(x => x.bet > 0)) casTDeal(t, ctx, now);
  return { ok: true, refund };
}
// 全部打完：莊家補牌（人都爆了或五張過關就不用補）、算輸贏、派彩進每個人的錢包
export function casTFinish(t, ctx, now) {
  const bet = casTBettors(t);
  if (bet.some(s => { const h = casHand(s.cards); return !h.bust && !h.charlie; })) casDealerPlay(t.dealer, t.deck);
  const withOthers = bet.filter(s => !s.npc).length > 1; // 跟館友同桌（成就「同桌壹夜」；跟 NPC 同桌不算）
  for (const s of bet) {
    const o = casOutcome(s.cards, t.dealer);
    s.out = Object.assign({ kind: o.kind, why: o.why }, casPayout(s.bet, o.kind, s.bonusPct));
    if (s.npc) { npcCasPay(ctx.house, ctx.day, s.npc.id, s.bet, s.out); continue; } // NPC：沒有錢包，賠付回外面世界
    const w = ctx.wallets[s.uid];
    if (w) {
      const r = casSettle(w, ctx.house, { bet: s.bet, out: s.out, allin: s.allin, settled: false }, { day: ctx.day, withOthers });
      s.ach = r.ach || [];
      s.ticket = !!(r.ok && ["win", "blackjack", "charlie"].includes(o.kind) && casWinTicket(w, s.bet));
    }
  }
  t.phase = "result";
  t.turn = null;
  t.deadline = now + NUM.casino.resultMs;
  t.seq++;
  casTNpcSpeak(t, ctx, bet);
}
// 結算後 NPC 說話（壹局最多 say.cap 句，種子決定說幾句、說不說）：先說自己的輸贏，再替別人喝采
function casTNpcSpeak(t, ctx, bet) {
  const C = NUM.casino.npcCas.say;
  for (const s of bet) {
    if (!s.npc || !t.seats[s.uid] || !s.out) continue;
    const rnd = mulberry32(hashStr(`${ctx.secret || ""}|${ctx.day}|${s.npc.id}|${t.rid}|speak`)), cap = Math.min(C.cap, 1 + (rnd() * 100 < C.pTwo ? 1 : 0));
    const k = s.out.kind, own = k === "blackjack" ? "bj" : k === "win" || k === "charlie" ? "win" : k === "push" ? "push" : s.out.why === "bust" ? "bust" : "lose";
    if (s.npc.said < cap && rnd() * 100 < C.pSelf) npcSay(t, ctx, s, own);
    if (s.npc.said < cap && bet.some(x => x.uid !== s.uid && x.out && ["win", "blackjack", "charlie"].includes(x.out.kind)) && rnd() * 100 < C.pCheer) npcSay(t, ctx, s, "cheer");
  }
}
// 看結果的時間到了：下一局（走掉的座位拿掉）
function casTNextRound(t, ctx, now) {
  for (const s of casTSeats(t)) if (s.gone) { delete t.seats[s.uid]; t.order = t.order.filter(x => x !== s.uid); }
  for (const s of casTSeats(t)) { Object.assign(s, { bet: 0, cards: [], st: "idle", out: null, allin: false, timedOut: false, ach: null, ticket: false }); if (s.npc) s.npc.said = 0; }
  t.dealer = []; t.deck = []; t.turn = null;
  t.round++; t.rid = `${t.pid}:${t.round}`;
  t.phase = "bet"; t.deadline = now + NUM.casino.betMs; t.seq++;
  casTNpcSweep(t, ctx); // 帶他來的館友走了、沒有人了，NPC 也走（時間到、額度用完的，等他下注的那刻自己走）
}
// 帶 NPC 來的館友不在座位上（或沒有人了）：NPC 走。只在不是打牌的時候（打牌中不動座位）；下注階段還沒有館友下注，NPC 先下的注退回去
function casTNpcSweep(t, ctx) {
  if (t.phase === "play") return;
  for (const s of casTSeats(t)) { const h = s.npc && t.seats[s.npc.host]; if (s.npc && (!h || h.gone)) casTNpcGo(t, ctx, s, "host"); }
  if (t.phase === "bet" && !casTHumanBet(t)) for (const s of casTSeats(t)) if (s.npc && s.bet > 0) { npcCasRefund(ctx.house, s.bet); Object.assign(s, { bet: 0, st: "idle" }); t.seq++; }
}
// 桌子收了、隊伍解散：還沒結算的 NPC 注退回外面世界，NPC 全部從「在賭場」名單拿掉（不說話）
export function casTNpcDrop(t, ctx) {
  for (const s of casTSeats(t)) if (s.npc) casTNpcGo(t, ctx, s, "silent");
}
// 照時間往下走：下注時間到就發牌；輪到的人時間到當停牌；看結果的時間到換下一局。回傳有沒有改
export function casTAdvance(t, ctx, now) {
  let changed = false;
  for (let n = 0; n < 24; n++) {
    if (now < t.deadline) break;
    // 下一段的時間從「這一段到期的時候」起算（最多晚 3 秒，叫 tick 的人慢了壹點，下一位還是有完整的時間）；
    // 很久沒人叫的時候，壹段壹段往下補，不用等
    const base = Math.min(now, t.deadline + 3000);
    if (t.phase === "bet") {
      if (casTHumanBet(t)) casTDeal(t, ctx, base);
      else { t.deadline = base + NUM.casino.betMs; t.seq++; changed = true; if (t.deadline > now) break; continue; }
    } else if (t.phase === "play") {
      const s = t.seats[t.turn];
      if (s) { s.timedOut = true; s.st = "stand"; t.seq++; casTNextTurn(t, ctx, base, s.uid); } else casTNextTurn(t, ctx, base, null);
    } else if (t.phase === "result") casTNextRound(t, ctx, base);
    else break;
    changed = true;
  }
  return changed;
}

// ---------- 邀請在場的 NPC（決定 0080） ----------
// 現在邀得動誰：[{ id, name }]（在館裡、不在賭場、今天還有額度）。不給他在哪家店（各家店現在幾位 NPC 是明天的跳空，不外洩）
// uid 有給：他剛拒絕過這位館友、30 分鐘還沒到的，不列出來（不然按下去只得到「N 分鐘後再邀」）
export function casTNpcWho(ctx, now, uid) {
  const l = npcCasInvitable(ctx.house, ctx.day, now, ctx.secret || "", Array.isArray(ctx.npcList) ? ctx.npcList : [], ctx.counters || null);
  return uid ? l.filter(x => !(npcCasCoolLeft(ctx.house, ctx.day, uid, x.id, now) > 0)) : l;
}
// 館友 uid 邀 npcId 壹起玩。回傳 { ok: false, reason }（邀不了：不在桌上、沒位子、他不在館裡…，什麼都沒改）
//   或 { ok: true, accepted, name, line }（accepted ＝ 答應了、坐下了；沒答應就是被拒絕，line 是他的拒絕台詞，同壹位 30 分鐘內不能再邀）
export function casTNpcInvite(t, ctx, uid, npcId, now) {
  const C = NUM.casino.npcCas, me = t.seats[uid], list = Array.isArray(ctx.npcList) ? ctx.npcList : [], hs = ctx.house, sec = ctx.secret || "";
  if (!C.on) return { ok: false, reason: "邀請客人還沒開放" };
  if (!me || me.npc || me.gone) return { ok: false, reason: "你不在這桌" };
  if (casTSeats(t).some(s => s.npc && s.npc.host === uid)) return { ok: false, reason: "你已經帶了壹位客人" };
  const n = list.find(x => x && x.id === npcId && x.kind !== "trace");
  if (!n) return { ok: false, reason: "他不在館裡" };
  if (casTSeats(t).filter(s => s.npc).length >= C.tableMax) return { ok: false, reason: "這桌的客人夠多了" };
  if (t.order.length >= NUM.casino.seats) return { ok: false, reason: "這桌坐滿了" };
  if (npcCasAway(hs, now).has(npcId)) return { ok: false, reason: "他已經跟別人去玩了" };
  const left = npcCasCoolLeft(hs, ctx.day, uid, npcId, now);
  if (left > 0) return { ok: false, reason: `他剛拒絕過你，${Math.ceil(left / 60000)} 分鐘後再邀`, wait: left };
  if (!casTNpcWho(ctx, now).some(x => x.id === npcId)) return { ok: false, reason: "他現在不在館裡，或今天不想玩了" };
  const p = npcCasChance(hs, ctx.day, n, ctx.counters || null), ask = npcCasAsk(hs, ctx.day, npcId);
  const seat = (kind, tag) => npcCasLine(n, kind, `${sec}|${ctx.day}|${npcId}|${t.pid}|${kind}|${tag}`);
  if (npcCasRoll(sec, ctx.day, uid, npcId, ask) >= p) { // 被拒絕
    npcCasCool(hs, ctx.day, uid, npcId, now);
    const line = seat("refuse", ask);
    if (line && Array.isArray(ctx.says)) ctx.says.push({ by: "n~" + npcId, name: n.name, npc: true, text: line });
    return { ok: true, accepted: false, name: n.name, line };
  }
  const until = npcCasAccept(hs, ctx.day, n, t.pid, uid, now, sec);
  const s = { uid: "n~" + npcId, nick: n.name, bet: 0, cards: [], st: "idle", san: 99, bonusPct: 0, allin: false, out: null, gone: false, idle: 0, timedOut: false, npc: { id: npcId, style: npcCasStyle(n), host: uid, until, said: 0, first: true } };
  t.seats[s.uid] = s; t.order.push(s.uid); t.seq++;
  const line = npcSay(t, ctx, s, "accept", "in");
  casTNpcBets(t, ctx, now);
  if (t.phase === "bet" && casTHumanBet(t) && casTSeats(t).every(x => x.bet > 0)) casTDeal(t, ctx, now);
  return { ok: true, accepted: true, name: n.name, line, until };
}

// ---------- 給每個人看的樣子 ----------
// 沒有 deck、沒有別人的錢包。莊家的底牌結算才給；理智低的人看到的牌是假的（用看的人自己的理智）
export function casTView(t, uid, now) {
  const me = t.seats[uid];
  const san = me ? me.san : 99, real = t.phase === "result";
  const seats = casTSeats(t).map(s => {
    const cards = casShown(s.cards, `${t.rid}:${uid}:${s.uid}`, san, real);
    return { uid: s.uid, nick: s.nick, npc: s.npc ? true : undefined, bet: s.bet, st: s.st, gone: s.gone, timedOut: s.timedOut, you: s.uid === uid, cards, total: casHand(cards).total,
      out: real ? s.out : null, ach: real && s.uid === uid ? s.ach || [] : null, ticket: real && s.uid === uid ? !!s.ticket : false, warped: s.uid === uid && !real && cards.some((c, i) => c !== s.cards[i]) };
  });
  const dealerShown = casShown(t.dealer, `${t.rid}:${uid}:d`, san, real);
  const dealer = t.phase === "result" ? { cards: dealerShown, total: casHand(dealerShown).total, up: casPoint(t.dealer[1]) }
    : t.phase === "play" ? { cards: [-1, dealerShown[1]], total: null, up: casPoint(t.dealer[1]) } : { cards: [], total: null, up: null };
  return { pid: t.pid, round: t.round, phase: t.phase, deadline: t.deadline, now, seq: t.seq, turn: t.turn, seats, dealer, me: uid, full: t.order.length >= NUM.casino.seats };
}
