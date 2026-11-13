import "./options.js"; // 地區、initializeApp：一定要最先（見 options.js）
// ================================================================
//  Hamachi 賭場（決定 0040）：單人 21 點、籌碼錢包、大禮包、餐車、救濟、換小獎、成就和財產、舊資料認領。
//  規則在 shared/casino.js、shared/casino_wallet.js；這個檔只管讀寫，每一步都是 Firestore 交易。
//  放哪裡（都只有 Functions 碰得到，firestore.rules 沒開放）：
//    casinoWallets/{uid}   籌碼錢包（data：JSON 字串）
//    casinoRounds/{uid}    現在這一手：洗好的牌、莊家的底牌都在裡面（畫面只拿到看得到的）
//    casinoHouse/main      莊家的錢（大家共用）
//    casinoLegacy/{小寫 email}   舊 Discord 21 點的籌碼、成就、財產，翊文之後放；認領後標 claimedBy
//  拚經濟（決定 0052）：act econ，全館共用的莊家跟著拚，一人一天 3 次（shared/casino_econ.js）。
//  實況和斗內（決定 0053）：act live（看）、liveOn（開播）、liveOff（下播）、donate（斗內）。規則在 shared/casino_live.js（純函式，之後 Discord 也用）。
//    casinoLive/main   現在的實況主和最近一則感謝（data：JSON 字串）。開播、下播、斗內都在同一個 Firestore 交易裡改；斗內同時改兩邊的錢包（不經過莊家），實況主還沒有錢包就當場補開場籌碼再加
//    /casinoLive（Realtime Database）  同一份的公開鏡像（只有暱稱和 uid，館友讀得到），交易成功之後寫；用 seq 擋掉晚到的舊資料。畫面聽這裡，跳「感謝」和大廳的「正在實況」
//  每週收藏（決定 0042）：每一步結束（shape）叫 casWkSync，在同一個交易裡看統計夠了沒、發收藏品；週章和故事要按「領」（wkclaim，伺服器寫存檔）。
//    這週的內容從 shared/casino_week_data.js 來（tools/copy_shared.cjs 部署前把 content/weeks 的 casino 打包進去）。
//  Yuga Bot 日報（11-13）：act report。每天第一個來問的人觸發壹次「全館快照」（一致讀取所有錢包、莊家、打到一半的注），存 casinoReport/{day}（data：JSON），跟上一份相減就是那段時間的帳。
//    錢包的 led、莊家的 led 記了每一條憑空、消失、莊家進出的路（shared/casino_book.js）；快照加起來對不上開場就 console.error（守恆壞了）
//  牌用 crypto 的亂數洗（不用種子：種子猜得到的話，看得到的牌就推得出底牌）。
//  連勝連敗（決定 0049）：結算的同一個交易裡，心情、理智寫進存檔（deal、hit、stand 都讀存檔）。
//  改到存檔的（換小獎的靈感、稱號、掛紀念品）：同一個交易寫存檔（rev 加一），交易成功才通知 save_changed。
// ================================================================
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { randomInt } from "node:crypto";
import { casNum, casRoundView } from "./shared/casino.js";
import { casBuy, casEventPacks, casExchange, casHang, casHouseFix, casHouseLines, casLegacyClaim, casLegacyPeek, casOpenPacks, casPacksLeft, casRelief, casBorrow, casRepay, casLoanToHouse, casLoanTakeNotes, casWorkStart, casWorkCheer, casWorkEnd, casWorkView, casMustWork, casWorkMeet, casWorkPublic, casSignWeekChips, casSetTitle, casStepDeal, casStepHit, casStepStand, casWalletFix, casWalletView, casWkClaim, casWkDefFor } from "./shared/casino_wallet.js";
import { CAS_LIVE, CAS_TEXT } from "./shared/casino_text.js";
import { casWkSync, casWkView } from "./shared/casino_week.js";
import { titlePublish } from "./shared/titles.js";
import { casCellarFind } from "./shared/casino_find.js";
import { casBookDiff, casBookGap, casBookOpening, casBookSnap } from "./shared/casino_book.js";
import { casReportView } from "./shared/casino_report.js";
import { casGdpExt, casGdpIndex, casGdpOf } from "./shared/casino_gdp.js";
import { ECONOMY } from "./shared/economy_data.js";
import { DAY_DATA } from "./shared/day_data.js";
import { casTicketClaim } from "./shared/casino_ticket.js";
import { casJobChips } from "./shared/casino_job.js";
import { casEconLeft, casEconPlay, casEconView } from "./shared/casino_econ.js";
import { casBondBuy, casBondSettle, casBondTakeNotes, casBondView } from "./shared/casino_bond.js";
import { casLevClose, casLevCreditAdd, casLevOpen, casLevSweep, casLevTakeNotes, casStockLevView } from "./shared/casino_stock_lev.js";
import { casArtSecret } from "./shared/casino_art.js";
import { IN_IDS, casInBuy, casInRoll, casInSecret, casInSeen, casInSell, casInUsed } from "./shared/casino_stock_in.js";
import { STOCK_IDS, casStockBuy, casStockCancel, casStockMatch, casStockOrder, casStockPegSync, casStockReals, casStockRoll, casStockSetReal, casStockSeen, casStockSell, casStockTakeNotes, casStockTwApply, casStockTwSettle, casStockUsApply, casStockUsSettle, casStockViewAll } from "./shared/casino_stock.js";
import { casBankAccrue, casBankHall, casBankBreak, casBankPut, casBankTake, casBankTakeNotes, casBankTerm, casBankView } from "./shared/casino_bank.js";
import { liveDonate, liveFix, liveMyView, liveNode, liveStart, liveStop, liveView } from "./shared/casino_live.js";
import { eventLive, eventsFromWeeks } from "./shared/events.js";
import { EVENT_WEEKS } from "./shared/events_data.js";
import { CAS_WEEK_LIB } from "./shared/casino_week_data.js";
import { setRng, taipeiDay } from "./shared/logic.js";
import { inbox, needMember, newId, now, rtdb, statusOf } from "./party.js";
import { TW_SYMBOLS, stocksTw, twSecret, twStale } from "./stock_tw.js";
import { US_SYMBOLS, stocksUs, usStale } from "./stock_us.js";
import { outDonate, outHouse, outLiveOn } from "./discord_out.js";

export const cryptoRng = () => randomInt(0, 0x100000000) / 0x100000000;
const db = () => getFirestore();
const walletRef = uid => db().doc(`casinoWallets/${uid}`);
const roundRef = uid => db().doc(`casinoRounds/${uid}`);
const houseRef = () => db().doc("casinoHouse/main");
const legacyRef = email => db().doc(`casinoLegacy/${email}`);
const saveRef = uid => db().doc(`saves/${uid}`);
const parse = s => (s.exists ? JSON.parse(s.data().data) : null);
const put = (tx, ref, obj) => tx.set(ref, { data: JSON.stringify(obj), updatedAt: FieldValue.serverTimestamp() });
const emailOf = req => String((req.auth && req.auth.token && req.auth.token.email) || "").toLowerCase();

// 一個交易：讀錢包、這一手、莊家（要的話還有存檔、舊資料）→ fn(ctx) → 寫回
// fn 回傳 { ok: false, ... }：什麼都不寫，原樣回給畫面（不是錯誤：荷官的話也是這樣回）
// fn 回傳 { ok: true, ... }：ctx.round 有改（ctx.roundDirty）就寫；錢包、莊家一定寫；ctx.saveDirty 就寫存檔
// 核心吃 { uid, nick } 和 email（只有認領舊資料用）：遊戲（casino 這個 Function）和 Discord（functions/discord_play.js）各包一層，規則只有這壹份
export async function playCore(me, email, opts, fn) {
  const t = now(), day = taipeiDay(t);
  let hb = null, ha = null; // 這個交易前後莊家的錢（Discord 第二步：破產、救回來的事件，交易成功之後才寫 outbox）
  const tw = await stocksTw(); // 台股盤中（11-14，規劃 2.8d）：伺服器每分鐘排程算好的價，同樣交易外面讀（有快取）
  const us = await stocksUs(); // 美股盤中（11-14，規劃 2.8i）：同上，美東 09:30～16:00 的價
  const sec = await twSecret(); // 祕密種子（stocksTwSecret/main，玩家讀不到）：館內五家店盤中曲線、畫的隨機走勢和贗品疑雲都用它
  casInSecret(sec); casArtSecret(sec);
  setRng(cryptoRng);
  try {
    const out = await db().runTransaction(async tx => {
      const [ws, rs, hs] = await Promise.all([tx.get(walletRef(me.uid)), tx.get(roundRef(me.uid)), tx.get(houseRef())]);
      const ss = opts.save ? await tx.get(saveRef(me.uid)) : null;
      const ls = opts.legacy && email ? await tx.get(legacyRef(email)) : null;
      const w = casWalletFix(parse(ws), day);
      const evPacks = casEventPacks(w, eventsFromWeeks(EVENT_WEEKS), t); // 限時活動（casinoBoost）：伺服器的時間說了算
      if (w.tablePid && !(await tx.get(db().doc(`casinoTables/${w.tablePid}`))).exists) w.tablePid = null; // 那桌已經收了（隊伍解散）：不用再坐著
      const { house, reopen } = casHouseFix(parse(hs), day);
      casLoanToHouse(w, house); // 到期被直接扣掉的借款交給莊家（決定 0071）
      const bankEv = casBankAccrue(w, house, day); // Yuga Bot 銀行：換日補算活存利息、到期的定存（利息從莊家出，shared/casino_bank.js）
      const bondEv = casBondSettle(w, house, day); // 館債：到期的還本金加利息（莊家不夠先由預算池墊，再不夠開憑證，shared/casino_bond.js）
      if ((bankEv && bankEv.back && bankEv.back.length) || (bondEv && bondEv.back && bondEv.back.length)) casLevCreditAdd(w, day); // 定存、館債準時到期：信用點 +1（壹天最多 1，規劃 2.8b、2.8j）
      casStockTwSettle(house, tw, day); // 換日以前先把上一天台股的收盤價套上去
      casStockUsSettle(house, us, day); // 美股也是（冬令收盤剛好是 05:00 換日那一刻，這裡補上最後一個價）
      casLevSweep(w, house, day, t); // 槓桿、放空、當沖（規劃 2.8j）：強平、昨天以前沒平的收盤平倉。要在換日調價、館內股換日、價位換比例「之前」，用的是昨天的價
      casStockRoll(house, day, {}, casStockReals(house, tw, us)); // 股票換日（照真實比例換價位、開盤拉回，規劃 2.8h）：台股、美股的漲跌都在盤中動完了，這裡只扣 drag（shared/casino_stock.js）
      casStockTwApply(house, tw, day, t); // 台股現在這分鐘的價、開盤狀態（沒開盤的時間買賣、下單、取消都擋）
      casStockUsApply(house, us, day, t); // 美股一樣
      casLevSweep(w, house, day, t); // 台股、美股現在這分鐘的狀態更新了（13:30 收盤了嗎、有沒有碰到強平）再掃壹次
      casInRoll(house, day, house.econ && house.econ.b); // 館內五家店：今天的開盤價（昨天不同的人、景氣、隨機跳空）；同壹天只算壹次（shared/casino_stock_in.js）
      casStockSetReal(house, tw, us, day, Object.assign({}, TW_SYMBOLS, US_SYMBOLS)); // 畫面要的真實代號、已經算進遊戲價的真實價（代號只在伺服器）
      casStockPegSync(w, house); // 價位換成真實比例之後，這個錢包的持股照比例換股數、掛單取消
      casStockMatch(w, house, day, t); // 掛單（限價、停損）照新的價檢查；價格變了之後，錢包被碰到時都要跑壹次
      const S = ss ? parse(ss) : null;
      const P = S && S.profiles && S.profiles.challenge ? S.profiles.challenge : null;
      const stale = twStale(tw, day).concat(usStale(us, day)); // 哪幾支這壹段沒有新行情（畫面要標出來，不要讓人以為真的沒漲跌）
      const ctx = { w, house, stale, round: parse(rs), P, S, day, t, uid: me.uid, nick: me.nick, id: newId(), legacy: ls && ls.exists ? ls.data() : null, reopen, evPacks, roundDirty: false, saveDirty: false };
      hb = ctx.house.bankroll;
      const r = fn(ctx);
      ha = ctx.house.bankroll;
      if (!r.ok && !opts.writeAnyway) return r;
      put(tx, walletRef(me.uid), ctx.w);
      put(tx, houseRef(), ctx.house);
      if (ctx.roundDirty || !rs.exists) { if (ctx.round) put(tx, roundRef(me.uid), ctx.round); }
      let rev = null;
      if (ctx.saveDirty && ss && ss.exists) {
        rev = ss.data().rev + 1;
        tx.set(saveRef(me.uid), { data: JSON.stringify(ctx.S), rev, updatedAt: FieldValue.serverTimestamp() });
      }
      if (ctx.legacyMark && ls && ls.exists) tx.set(legacyRef(email), ctx.legacyMark, { merge: true });
      return Object.assign({}, r, { rev });
    });
    if (out && out.rev) await inbox(me.uid, { t: "save_changed", rev: out.rev, why: "casino" });
    // 莊家破產、被救回來 → Discord（寫 outbox；寫不進去只記錄，不影響這步）
    if (out && out.ok !== false) await outHouse({ before: hb, after: ha, nick: me.nick, settled: !!out.settle, rescued: !!(out.econ && out.econ.rescued), t });
    return out;
  } finally { setRng(null); }
}
const play = (req, me, opts, fn) => playCore(me, emailOf(req), opts, fn);
// 在地下工作的參觀者公開在 Realtime Database 的 workers/{uid}（決定 0064 第三部分；館友讀得到，只有這裡寫得動）。寫不進去不影響賭場
const publishWork = async (uid, w, nick) => {
  try { const v = casWorkPublic(w, nick); await (v ? rtdb().ref(`workers/${uid}`).set(v) : rtdb().ref(`workers/${uid}`).remove()); }
  catch (e) { console.warn("workers 寫不進去", e && e.message); }
};
// 別的館友在地下遇到他：兩個錢包在同壹個交易裡改
async function workMeet(me, d) {
  const to = String(d.to || ""), day = taipeiDay(now());
  if (!to || to === me.uid) return { ok: false, reason: CAS_TEXT.meetSelf };
  const out = await db().runTransaction(async tx => {
    const [ms, ts] = await Promise.all([tx.get(walletRef(me.uid)), tx.get(walletRef(to))]);
    if (!ts.exists) return { ok: false, reason: CAS_TEXT.meetGone };
    const mine = casWalletFix(parse(ms), day), w = casWalletFix(parse(ts), day);
    const r = casWorkMeet(mine, w, String(d.kind || ""), d.tpl, day, { uid: me.uid, nick: me.nick });
    if (!r.ok) return r;
    if (r.kind === "give") put(tx, walletRef(me.uid), mine);
    put(tx, walletRef(to), w);
    return Object.assign(r, { chips: mine.chips, w });
  });
  if (out.ok) {
    let ownerNick = null;
    try { const m = await db().doc(`members/${to}`).get(); ownerNick = m.exists ? m.data().nick : null; } catch (e) { /* 拿不到就寫館友 */ }
    await publishWork(to, out.w, ownerNick); delete out.w;
  }
  return out;
}
// 稱號到處看得到（決定 0050）：現在戴的稱號公開在 Realtime Database 的 titles/{uid}（館友讀得到，只有這裡寫得動）。
// 只放 { id, name }，名字是錢包裡的（不信存檔）。寫不進去不影響賭場本身，下次進館的 peek 會再補
const publishTitle = async (uid, t) => {
  try { await (t ? rtdb().ref(`titles/${uid}`).set(t) : rtdb().ref(`titles/${uid}`).remove()); }
  catch (e) { console.error("titles：寫不進去", uid, e && e.message); }
};
// 實況和斗內（決定 0053）。交易裡讀：實況主的狀態、自己的錢包、（斗內才）實況主的錢包；全部讀完才寫。
// 實況主有沒有離線（關掉遊戲）看 Realtime Database 的 status/{uid}（畫面連上就寫、斷線自動寫 offline），離線超過 NUM.casino.live.graceMs 算下播
const liveRef = () => db().doc("casinoLive/main");
const mirrorLive = async st => {
  try { await rtdb().ref("casinoLive").transaction(cur => (cur && Number.isFinite(cur.seq) && cur.seq >= st.seq ? undefined : liveNode(st))); }
  catch (e) { console.error("casinoLive：鏡像寫不進去", e && e.message); } // 寫不進去不影響交易；下次有人看（act live）會補
};
// opts.out === false：這壹步是 Discord 指令做的，回覆本身就是公開的，不用再寫 outbox（不然頻道會出現兩則）
export async function liveAct(me, act, rnd, opts = {}) {
  const t = now(), day = taipeiDay(t);
  const out = await db().runTransaction(async tx => {
    const ls = await tx.get(liveRef());
    const st0 = liveFix(ls.exists ? parse(ls) : null);
    let presence = null;
    if (st0.uid) { try { presence = await statusOf(st0.uid); } catch (e) { presence = null; } } // 讀不到就當不知道（不算離線）
    const mine = await tx.get(walletRef(me.uid));
    const sws = act === "donate" && st0.uid && st0.uid !== me.uid ? await tx.get(walletRef(st0.uid)) : null;
    // 隱身的人狀態是離線，開播壹分鐘就會被當成下播：先擋，並告訴他為什麼
    if (act === "liveOn") { const ms = await tx.get(db().doc(`members/${me.uid}`)); if (ms.exists && ms.data().invisible === true) return { ok: false, reason: CAS_LIVE.invisible }; }
    const w = casWalletFix(parse(mine), day);
    const see = (st, extra) => Object.assign({ ok: true, live: liveView(st, t, presence, me.uid), my: liveMyView(w, day), chips: w.chips, st }, extra || {});
    if (act === "live") return see(st0);
    if (act === "liveOn" || act === "liveOff") {
      const r = act === "liveOn" ? liveStart(st0, { uid: me.uid, nick: me.nick }, t, presence) : liveStop(st0, me.uid);
      if (!r.ok) return { ok: false, reason: r.reason || "沒辦法" };
      put(tx, liveRef(), r.st);
      return see(r.st);
    }
    // donate
    const sw = casWalletFix(sws && sws.exists ? parse(sws) : null, day); // 實況主沒有錢包：新的錢包有開場籌碼，加上去再寫（不會蓋掉）
    const r = liveDonate(st0, { uid: me.uid, nick: me.nick, w }, sw, day, t, presence, rnd);
    if (!r.ok) return { ok: false, reason: r.reason || "沒辦法" };
    put(tx, walletRef(me.uid), w);
    put(tx, walletRef(st0.uid), sw);
    put(tx, liveRef(), r.st);
    return see(r.st, { n: r.n, line: r.line, from: r.from, to: r.to });
  });
  if (out && out.ok && out.st) {
    await mirrorLive(out.st);
    if (act === "liveOn" && opts.out !== false) await outLiveOn(out.st.seq, me.nick); // Discord：開播
    if (act === "donate" && out.st.msg && opts.out !== false) await outDonate(out.st.msg.id, out.from, out.to, out.n); // Discord：斗內感謝
    delete out.st;
  }
  return out;
}
// 畫面要的：錢包摘要、這一手、莊家
// 每一步成功的回答都經過這裡：先同步每週收藏（統計夠了就發），再把摘要、這一手、莊家一起給畫面
export const wkDefOf = w => casWkDefFor(CAS_WEEK_LIB, w.wk.week);
// 股票的畫面：現股、館內店的 casStockViewAll ＋ 槓桿頁要的 lev、positions、credit（casStockLevView；規劃 2.8j）。
// 畫面的 positions[].id 是「單號」p3（平倉送 pid），股票的 id 是 sid；其餘欄位（no、name、market、side、lev、qty、entry、margin、now、pnl、maintPct、liqPx、openedDay、dayTrade）一起給
const levStock = ctx => {
  const v = casStockViewAll(ctx.w, ctx.house, ctx.day, ctx.t, ctx.stale), L = casStockLevView(ctx.w, ctx.house, ctx.day, ctx.t);
  return Object.assign(v, { lev: L.lev, positions: L.positions.map(p => Object.assign({}, p, { id: "p" + p.no, sid: p.id, stop: null, take: null })), credit: L.credit, levCap: { posLimit: L.posLimit, posUsed: L.posUsed, profitCap: L.profitCap, netToday: L.netToday } });
};
export const shape = (ctx, extra) => {
  const sync = casWkSync(ctx.w, wkDefOf(ctx.w), ctx.day);
  return Object.assign({ ok: true, wallet: casWalletView(ctx.w, ctx.day), wk: casWkView(ctx.w, ctx.day), wkNew: sync.newItems, wkDone: sync.completed,
    econ: casEconView(ctx.w, ctx.day), bank: casBankView(ctx.w, ctx.day), bankHall: casBankHall(ctx.w, ctx.day, ctx.house, ctx.t, ctx.stale, DAY_DATA), stock: levStock(ctx), bond: casBondView(ctx.w, ctx.house, ctx.day), bankNotes: casBankTakeNotes(ctx.w).concat(casBondTakeNotes(ctx.w), casStockTakeNotes(ctx.w), casLevTakeNotes(ctx.w)), round: ctx.round ? casRoundView(ctx.round, "") : null, house: casHouseLines(ctx.house), reopen: ctx.reopen || null, evPacks: ctx.evPacks || 0 }, extra || {});
};
export const no = r => ({ ok: false, reason: r.reason || "沒辦法" });

// ---------- 每個動作在交易裡做的事（遊戲和 Discord 共用，行為一字不改；從下面 casino 的 switch 搬出來的） ----------
export const actEcon = ctx => {
  const r = casEconPlay(ctx.w, ctx.house, ctx.day, cryptoRng);
  if (!r.ok) return no(r);
  return shape(ctx, { econ: Object.assign(casEconView(ctx.w, ctx.day), { win: r.win, r: r.r, amount: r.amount, policy: r.policy, loot: r.loot, ticket: r.ticket, rescued: r.rescued, lines: r.lines }) });
};
export const actDeal = (ctx, d) => {
  const r = casStepDeal(ctx, d.text);
  if (!r.ok) return Object.assign(no(r), { gag: !!r.gag });
  ctx.roundDirty = true;
  return shape(ctx, { settle: r.settle ? { ach: r.settle.ach, lines: r.settle.lines, houseBroke: r.settle.houseBroke, streak: r.settle.streak || [] } : null, ticket: !!r.ticket });
};
export const actHitStand = (act, ctx, d) => {
  const seq = Number.isInteger(d.seq) ? d.seq : -1;
  const r = act === "hit" ? casStepHit(ctx, seq) : casStepStand(ctx, seq);
  if (!r.ok) return no(r);
  ctx.roundDirty = true;
  return shape(ctx, { settle: r.settle ? { ach: r.settle.ach, lines: r.settle.lines, houseBroke: r.settle.houseBroke, streak: r.settle.streak || [] } : null, ticket: !!r.ticket });
};
export const actPack = (ctx, d) => {
  const r = casOpenPacks(ctx.w, ctx.house, d.n, ctx.day);
  return r.ok ? shape(ctx, { packs: r.packs, total: r.total, ach: r.ach }) : no(r);
};
// 借錢（遊戲的「向 Yuga 借」和 Discord 的 /pepe-借錢 共用；次數、補到多少都在 casRelief，shared/casino_wallet.js）
// 決定 0064 之後是有利息的借款：Discord 沒有參數，借 NUM.casino.loan.discord 這麼多（casRelief）
export const actRelief = ctx => {
  const r = casRelief(ctx.w, ctx.day, !!(ctx.round && ctx.round.state === "playing"), ctx.t, ctx.house);
  return r.ok ? shape(ctx, { lines: r.lines, ach: r.ach }) : no(r);
};
// 遊戲的「跟 Yuga 借」：借多少玩家選（d.amt，"max" ＝借滿），額度、利息、幾天內還都在 casBorrow
export const actBorrow = (ctx, d) => {
  const r = casBorrow(ctx.w, d.amt, ctx.day, !!(ctx.round && ctx.round.state === "playing"), ctx.t, ctx.house); // 從莊家出（決定 0071）
  return r.ok ? shape(ctx, { lines: r.lines, ach: r.ach }) : no(r);
};
// 股票買賣：d.op 是 buy、sell；d.id 哪壹支、d.n 幾股（"max" ＝全賣）。
// 掛單：d.op 是 order（d.kind 是 buy 限價買、sell 限價賣、stop 停損賣；d.id、d.n、d.px 價）、cancel（d.no 第幾張）
export const actStock = (ctx, d) => {
  const op = String(d.op || ""), id = String(d.id || "");
  if (op === "open" || op === "close") { // 槓桿、放空、當沖（規劃 2.8j）：open 帶 id、side（或 dir）、lev、qty（或 margin）；close 帶單號 no（或畫面的 pid "p3"）
    const r = op === "open" ? casLevOpen(ctx.w, ctx.house, d, ctx.day, ctx.t) : casLevClose(ctx.w, ctx.house, d.no != null ? d.no : parseInt(String(d.pid == null ? "" : d.pid).replace(/D/g, ""), 10), ctx.day, ctx.t);
    return r.ok ? shape(ctx, { lines: r.lines }) : no(r);
  }
  if (IN_IDS.includes(id)) { // 館內五家店（規劃 2.8g）：莊家當對手盤，現股買賣；限價單、槓桿、放空還沒做
    const x = op === "buy" ? casInBuy(ctx.w, ctx.house, id, d.n, ctx.day, ctx.t) : op === "sell" ? casInSell(ctx.w, ctx.house, id, d.n, ctx.day, ctx.t) : null;
    if (!x) return no({ reason: op === "order" ? "館內股票還不能掛單" : "沒有這個動作" });
    return x.ok ? shape(ctx, { lines: x.lines }) : no(x);
  }
  const r = op === "buy" ? casStockBuy(ctx.w, ctx.house, String(d.id || ""), d.n, ctx.day, ctx.t)
    : op === "sell" ? casStockSell(ctx.w, ctx.house, String(d.id || ""), d.n, ctx.day, ctx.t)
    : op === "order" ? casStockOrder(ctx.w, ctx.house, String(d.kind || ""), String(d.id || ""), d.n, d.px, ctx.day, ctx.t)
    : op === "cancel" ? casStockCancel(ctx.w, d.no, ctx.day, ctx.t, ctx.house)
    : op === "seen" ? casStockSeen(ctx.w, ctx.house) : { ok: false, reason: "沒有這個動作" };
  if (op === "seen" && r.ok) casInSeen(ctx.w, ctx.house, ctx.day, ctx.t); // 館內股也記「看過了」
  return r.ok ? shape(ctx, { lines: r.lines }) : no(r);
};
// Yuga Bot 銀行（shared/casino_bank.js）：d.op 是 put 存活存、take 領活存、term 開定存（d.kind 第幾種）、break 解約（d.id）。打牌打到壹半也可以（注已經扣掉了）
export const actBank = (ctx, d) => {
  const op = String(d.op || "");
  const r = op === "put" ? casBankPut(ctx.w, d.amt) : op === "take" ? casBankTake(ctx.w, d.amt)
    : op === "term" ? casBankTerm(ctx.w, d.amt, d.kind, ctx.day) : op === "bond" ? casBondBuy(ctx.w, ctx.house, d.amt, ctx.day) : op === "break" ? casBankBreak(ctx.w, d.id) : { ok: false, reason: "沒有這個動作" };
  return r.ok ? shape(ctx, { lines: r.lines }) : no(r);
};
// 欠款送參觀者去地下工作（決定 0064 第二部分）：存檔在同壹個交易裡改（誰在工作、靈感），畫面收到 save_changed 重新讀
export const actWork = (act, ctx, d) => {
  if (!ctx.P) return { ok: false, reason: "要用挑戰模式的參觀者" };
  const r = act === "workStart" ? casWorkStart(ctx.w, ctx.P, String(d.vid || ""), ctx.day)
    : act === "workCheer" ? casWorkCheer(ctx.w, ctx.P, d.n)
    : casWorkEnd(ctx.w, ctx.P);
  if (!r.ok) return Object.assign(no(r), { needNew: !!r.needNew });
  ctx.saveDirty = true;
  return shape(ctx, { lines: r.lines, n: r.n, back: r.back, name: r.name, san: r.san });
};
// 還壹筆（d.id；沒給就還最早到期的）
export const actRepay = (ctx, d) => {
  const r = casRepay(ctx.w, d.id == null ? null : d.id, ctx.day, !!(ctx.round && ctx.round.state === "playing"), ctx.t, ctx.house); // 還給莊家（決定 0071）
  return r.ok ? shape(ctx, { lines: r.lines }) : no(r);
};
export const actBuy = (ctx, d) => {
  const r = casBuy(ctx.w, ctx.house, d.item, ctx.day, undefined, ctx.P);
  if (r.ok && (r.mood || r.san)) ctx.saveDirty = true; // 心情、理智寫進存檔，同一個交易
  return r.ok ? shape(ctx, { lines: r.lines, item: r.item, tickets: r.tickets, ach: r.ach, mood: r.mood, san: r.san }) : no(r);
};

// ---------- Yuga Bot 日報（shared/casino_report.js） ----------
// 一致讀取（readOnly 交易）全館：錢包、莊家、打到一半的注。不鎖東西，也不會讀到壹半
async function reportSnap(day) {
  return db().runTransaction(async tx => {
    const [hs, ws, rs, ts] = await Promise.all([tx.get(houseRef()), tx.get(db().collection("casinoWallets")), tx.get(db().collection("casinoRounds")), tx.get(db().collection("casinoTables"))]);
    const house = casHouseFix(parse(hs), null).house;
    const wallets = ws.docs.map(d => casWalletFix(JSON.parse(d.data().data), null));
    let inplay = 0;
    rs.docs.forEach(d => { const r = JSON.parse(d.data().data); if (r && r.state === "playing") inplay += Math.floor(+r.bet) || 0; });
    ts.docs.forEach(d => { const t = JSON.parse(d.data().data); Object.values((t && t.seats) || {}).forEach(s => { if (s && s.bet > 0 && s.out == null) inplay += Math.floor(+s.bet) || 0; }); });
    const snap = casBookSnap(wallets, house, inplay, day);
    snap.pol = house.pol || null; // 現在有效的政策（日報要寫）
    return snap;
  }, { readOnly: true });
}
export async function casReport() {
  const t = now(), day = taipeiDay(t), ref = db().doc(`casinoReport/${day}`);
  let s = await ref.get();
  if (!s.exists) {
    const snap = await reportSnap(day);
    const prevQ = await db().collection("casinoReport").where("day", "<", day).orderBy("day", "desc").limit(14).get();
    const olds = prevQ.docs.map(d => JSON.parse(d.data().data)).reverse(); // 由舊到新（最多 14 份，算景氣指數的成長率用）
    const prev = olds.length ? olds[olds.length - 1] : null;
    const doc = { day, at: t, snap, diff: casBookDiff(prev && prev.snap, snap), prevDay: prev ? prev.day : null, opening: prev ? prev.opening : casBookOpening(snap) };
    doc.gdp = casGdpOf(doc.diff); // 館內 GDP（活動量，shared/casino_gdp.js）
    const hist = olds.filter(o => o.gdp && o.diff).map(o => ({ from: o.diff.from, to: o.day, total: o.gdp.total })).concat([{ from: doc.diff.from, to: day, total: doc.gdp.total }]);
    const ext = casGdpExt(ECONOMY, day); // 外面世界的景氣（content/economy.json，每日排劇情的排程更新）
    doc.index = casGdpIndex(hist, prev && prev.index ? prev.index.bIn : 0, snap.active7, ext.b);
    doc.ext = { ok: ext.ok, quarter: ext.quarter || "", stale: !!ext.stale };
    doc.gap = casBookGap(snap, doc.opening);
    if (doc.gap !== 0) console.error("賭場記帳：全館的帳對不上", day, "差", doc.gap); // 有壹條動籌碼的路沒有記到帳上
    let made = false;
    try { await ref.create({ day, data: JSON.stringify(doc), updatedAt: FieldValue.serverTimestamp() }); made = true; } catch (e) { /* 別人先建了：讀他的 */ }
    if (made) { // 景氣寫回莊家：之後拚經濟撥款、門票、存款利率照這個算（shared/casino_gdp.js 的 casFxMul）
      await db().runTransaction(async tx => {
        const hs = await tx.get(houseRef()), h = casHouseFix(parse(hs), null).house;
        // 銀行廳的財報頁也讀這裡（shared/casino_gdp.js 的 casBankEcon）：多存每天的 GDP、成長率、昨天發生的事、最熱鬧的那件
        const A = doc.diff.act || {}, g = doc.gdp;
        const rows = [["餐車", `${casNum(A.food || 0)} 份`], ["21 點", `${casNum(A.bjHands || 0)} 手`], ["拚經濟成功", `${casNum(A.econWin || 0)} 次`], ["參觀者門票", `${casNum(A.ticketPeople || 0)} 位`],
          ["消費", casNum(g.C)], ["投資", casNum(g.I)], ["政府支出", casNum(g.G)], ["淨出口", casNum(g.NX)]];
        const top = ["food", "bjHands", "econWin", "ticketPeople"].map(k => ({ key: k, n: A[k] || 0 })).sort((a, b) => b.n - a.n)[0];
        h.econ = { b: doc.index.b, bIn: doc.index.bIn, bExt: doc.index.bExt, label: doc.index.label, day,
          perDay: doc.index.perDay, g: doc.index.g, rows, top: top && top.n > 0 ? top : null, frozen: h.budget <= 0 };
        put(tx, houseRef(), h);
      });
    }
    s = await ref.get();
  }
  return casReportView(JSON.parse(s.data().data));
}

export const casino = onCall(async req => {
  const me = await needMember(req);
  const { act } = req.data || {};
  const d = req.data || {};
  switch (act) {
    // 進賭場：錢包（第一次會建）、這一手有沒有沒打完的、舊資料有沒有可以認領的
    // 參觀者門票（11-13）：瀏覽器說展廳來了幾位（P.hallVisitors），伺服器照存檔算展廳評分、每天上限，錢包和預算池、館方帳在同一個交易裡加（shared/casino_ticket.js）
    case "tickets": return play(req, me, { save: true }, ctx => {
      const r = casTicketClaim(ctx.w, ctx.house, ctx.P, ctx.day);
      return r.ok ? Object.assign({ chips: ctx.w.chips }, r) : no(r);
    });
    case "report": return { ok: true, report: await casReport() };
    case "peek": { // 狀態列的籌碼（只讀，不建錢包；還沒進過賭場就是開場的數字）
      await casReport().catch(e => console.error("日報：產生失敗", e && e.message)); // 每天第一個進館的人觸發日報（景氣指數靠它每天更新）
      const ws = await walletRef(me.uid).get();
      const w = casWalletFix(parse(ws), taipeiDay(now()));
      if (w.title) { // 有戴稱號的人，進館時把稱號補到 titles（以前戴的、上次沒寫成功的）；沒稱號的人不多讀存檔
        const S = parse(await saveRef(me.uid).get());
        await publishTitle(me.uid, titlePublish(w, S && S.profiles && S.profiles.challenge ? S.profiles.challenge : null));
      }
      if (w.work) await publishWork(me.uid, w, me.nick); // 在地下工作的：理智每天變，館主連上時更新給館友看（決定 0064 第三部分）
      return { ok: true, chips: w.chips, packs: casPacksLeft(w), econ: casEconLeft(w, taipeiDay(now())), work: casWorkView(w), mustWork: casMustWork(w), debt: Math.max(0, -w.chips) }; // packs、econ：「今天」清單要的（ui_today.js）
    }
    // 走地下探險撿籌碼（決定 0047）：畫面只說走完了哪個房間，有沒有、多少、一天幾次都是這裡算。沒撿到也要寫（記下這個房間，不能重擲）；重複、撿夠了什麼都不寫
    case "cellarFind": return play(req, me, {}, ctx => {
      const boost = eventLive(eventsFromWeeks(EVENT_WEEKS), "cellarChips", ctx.t); // 限時活動（翊文 11-12）：伺服器的時間說了算
      const r = casCellarFind(ctx.w, ctx.house, d.room, ctx.day, undefined, boost);
      return r.ok ? { ok: true, found: r.found, bonus: r.bonus || 0, t: r.t == null ? null : r.t, chips: ctx.w.chips } : no(r);
    });
    // 交委託拿籌碼（決定 0062）：畫面只說交了今天的哪幾張，給多少、一天幾張、同一張不重複都是這裡算
    case "job": return play(req, me, {}, ctx => {
      const r = casJobChips(ctx.w, ctx.house, d.slots, ctx.day);
      return r.ok ? { ok: true, found: r.found, n: r.n, chips: ctx.w.chips } : no(r);
    });
    // 拚經濟（決定 0052）：結果、莊家的錢、錢包都在這個交易裡算；一人一天幾次、連點都在這裡擋（交易一個一個排隊，第二下看到的已經是新的次數）。畫面只拿到結果和要跳的字
    case "econ": return play(req, me, {}, actEcon);
    // 實況和斗內（決定 0053）：誰在播、開播、下播、斗內。連點、一天幾次、收款上限都在這個交易裡擋
    case "live":
    case "liveOn":
    case "liveOff":
    case "donate": return liveAct(me, act, cryptoRng);
    case "open": {
      return play(req, me, { legacy: true, save: true, writeAnyway: true }, ctx => {
        const peek = casLegacyPeek(ctx.w, ctx.legacy);
        const loanNotes = casLoanTakeNotes(ctx.w); // 「Yuga 來收錢了」：進賭場時說壹次（決定 0064）
        const sw = casSignWeekChips(ctx.w, ctx.S, ctx.day); // 全簽到送籌碼：簽滿那時沒連上，進賭場補發（翊文 11-11）
        if (sw.n) loanNotes.push(`這週全簽到，Yuga Bot 加送你 ${casNum(sw.chips)} 籌碼！`);
        return shape(ctx, { legacy: peek, loanNotes, sanity: ctx.P && Number.isFinite(ctx.P.sanity) ? ctx.P.sanity : null });
      });
    }
    case "deal": return play(req, me, { save: true }, ctx => actDeal(ctx, d));
    case "hit":
    case "stand": return play(req, me, { save: true }, ctx => actHitStand(act, ctx, d));
    case "relief": return play(req, me, {}, actRelief);
    case "bank": return play(req, me, {}, ctx => actBank(ctx, d)); // Yuga Bot 銀行：活存、定存（11-13）
    case "bankHall": return play(req, me, {}, ctx => shape(ctx));
    case "used": return play(req, me, { writeAnyway: true }, ctx => { // 館內股票：手作坊今天有人做過佩佩（網頁做完壹隻叫壹次；壹天壹次，其他店伺服器自己記）
      if (String(d.store || "") !== "craft") return no({ reason: "沒有這個動作" });
      casInUsed(ctx.w, ctx.house, "craft", ctx.day);
      return shape(ctx);
    });
    case "stock": return play(req, me, {}, ctx => actStock(ctx, d)); // 股票：買、賣（11-14） // 銀行廳打開時拿壹次（回答裡的 bankHall，每個賭場動作的回答也都有）
    case "borrow": return play(req, me, {}, ctx => actBorrow(ctx, d));
    case "repay": return play(req, me, {}, ctx => actRepay(ctx, d));
    case "workStart":
    case "workCheer":
    case "workEnd": {
      let wAfter = null;
      const r = await play(req, me, { save: true }, ctx => { const x = actWork(act, ctx, d); wAfter = ctx.w; return x; });
      if (r && r.ok !== false && wAfter) await publishWork(me.uid, wAfter, me.nick); // 別的館友在地下看得到他（決定 0064 第三部分）
      return r;
    }
    case "workMeet": return workMeet(me, d);
    // 全簽到壹週加送籌碼（翊文 11-11）：伺服器讀存檔的簽到紀錄，壹週只送壹次
    case "signWeek": return play(req, me, { save: true }, ctx => {
      const r = casSignWeekChips(ctx.w, ctx.S, ctx.day);
      return { ok: true, n: r.n, got: r.chips, chips: ctx.w.chips };
    });
    case "pack": return play(req, me, {}, ctx => actPack(ctx, d));
    case "buy": return play(req, me, { save: true }, ctx => actBuy(ctx, d));
    case "exchange": return play(req, me, { save: true }, ctx => {
      if (!ctx.P) return { ok: false, reason: "要用挑戰模式的參觀者進館，才能換" };
      const r = casExchange(ctx.w, String(d.id), ctx.P);
      if (!r.ok) return no(r);
      ctx.saveDirty = true;
      return shape(ctx, { reward: r.reward });
    });
    case "title": {
      let pub = null;
      const out = await play(req, me, { save: true }, ctx => {
        const r = casSetTitle(ctx.w, ctx.P, d.id == null ? null : String(d.id));
        if (!r.ok) return no(r);
        ctx.saveDirty = !!ctx.P;
        pub = titlePublish(ctx.w, ctx.P);
        return shape(ctx);
      });
      if (out && out.ok) await publishTitle(me.uid, pub); // 交易成功才公開
      return out;
    }
    case "hang": return play(req, me, { save: true }, ctx => {
      const r = casHang(ctx.w, ctx.P, String(d.id), !!d.on);
      if (!r.ok) return no(r);
      ctx.saveDirty = true;
      return shape(ctx);
    });
    // 每週收藏：只看進度（story 面板用）
    case "wk": return play(req, me, {}, ctx => shape(ctx));
    // 領集滿的週章（這週，或以前集滿了還沒領的週）；伺服器寫存檔，只領一次
    case "wkclaim": return play(req, me, { save: true }, ctx => {
      const label = typeof d.week === "string" && /^\d{4}-W\d{2}$/.test(d.week) ? d.week : ctx.w.wk.week;
      const r = casWkClaim(ctx.w, ctx.P, label, ctx.day);
      if (!r.ok) return no(r);
      ctx.saveDirty = true;
      return shape(ctx, { claimed: { week: label, stamps: r.reward.stamps } });
    });
    case "legacy": return play(req, me, { legacy: true }, ctx => {
      if (!emailOf(req)) return { ok: false, reason: "找不到你的 email，沒辦法認領" };
      const r = casLegacyClaim(ctx.w, ctx.legacy, ctx.uid, ctx.day);
      if (!r.ok) return no(r);
      ctx.legacyMark = r.mark; // 資料庫那邊也標起來：不能領兩次
      return shape(ctx, { claimed: { chips: r.chips, ach: r.ach, props: r.props } });
    });
    default: throw new HttpsError("invalid-argument", "不認得的動作");
  }
});
