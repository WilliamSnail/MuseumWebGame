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
//  牌用 crypto 的亂數洗（不用種子：種子猜得到的話，看得到的牌就推得出底牌）。
//  連勝連敗（決定 0049）：結算的同一個交易裡，心情、理智寫進存檔（deal、hit、stand 都讀存檔）。
//  改到存檔的（換小獎的靈感、稱號、掛紀念品）：同一個交易寫存檔（rev 加一），交易成功才通知 save_changed。
// ================================================================
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { randomInt } from "node:crypto";
import { casRoundView } from "./shared/casino.js";
import { casBuy, casEventPacks, casExchange, casHang, casHouseFix, casHouseLines, casLegacyClaim, casLegacyPeek, casOpenPacks, casPacksLeft, casRelief, casBorrow, casRepay, casLoanTakeNotes, casWorkStart, casWorkCheer, casWorkEnd, casWorkView, casMustWork, casWorkMeet, casWorkPublic, casSetTitle, casStepDeal, casStepHit, casStepStand, casWalletFix, casWalletView, casWkClaim, casWkDefFor } from "./shared/casino_wallet.js";
import { CAS_LIVE, CAS_TEXT } from "./shared/casino_text.js";
import { casWkSync, casWkView } from "./shared/casino_week.js";
import { titlePublish } from "./shared/titles.js";
import { casCellarFind } from "./shared/casino_find.js";
import { casJobChips } from "./shared/casino_job.js";
import { casEconLeft, casEconPlay, casEconView } from "./shared/casino_econ.js";
import { liveDonate, liveFix, liveMyView, liveNode, liveStart, liveStop, liveView } from "./shared/casino_live.js";
import { eventsFromWeeks } from "./shared/events.js";
import { EVENT_WEEKS } from "./shared/events_data.js";
import { CAS_WEEK_LIB } from "./shared/casino_week_data.js";
import { setRng, taipeiDay } from "./shared/logic.js";
import { inbox, needMember, newId, now, rtdb, statusOf } from "./party.js";
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
      const S = ss ? parse(ss) : null;
      const P = S && S.profiles && S.profiles.challenge ? S.profiles.challenge : null;
      const ctx = { w, house, round: parse(rs), P, S, day, t, uid: me.uid, nick: me.nick, id: newId(), legacy: ls && ls.exists ? ls.data() : null, reopen, evPacks, roundDirty: false, saveDirty: false };
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
export const shape = (ctx, extra) => {
  const sync = casWkSync(ctx.w, wkDefOf(ctx.w), ctx.day);
  return Object.assign({ ok: true, wallet: casWalletView(ctx.w, ctx.day), wk: casWkView(ctx.w, ctx.day), wkNew: sync.newItems, wkDone: sync.completed,
    econ: casEconView(ctx.w, ctx.day), round: ctx.round ? casRoundView(ctx.round, "") : null, house: casHouseLines(ctx.house), reopen: ctx.reopen || null, evPacks: ctx.evPacks || 0 }, extra || {});
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
  const r = casRelief(ctx.w, ctx.day, !!(ctx.round && ctx.round.state === "playing"), ctx.t);
  return r.ok ? shape(ctx, { lines: r.lines, ach: r.ach }) : no(r);
};
// 遊戲的「跟 Yuga 借」：借多少玩家選（d.amt，"max" ＝借滿），額度、利息、幾天內還都在 casBorrow
export const actBorrow = (ctx, d) => {
  const r = casBorrow(ctx.w, d.amt, ctx.day, !!(ctx.round && ctx.round.state === "playing"), ctx.t);
  return r.ok ? shape(ctx, { lines: r.lines, ach: r.ach }) : no(r);
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
  const r = casRepay(ctx.w, d.id == null ? null : d.id, ctx.day, !!(ctx.round && ctx.round.state === "playing"), ctx.t);
  return r.ok ? shape(ctx, { lines: r.lines }) : no(r);
};
export const actBuy = (ctx, d) => {
  const r = casBuy(ctx.w, ctx.house, d.item, ctx.day, undefined, ctx.P);
  if (r.ok && (r.mood || r.san)) ctx.saveDirty = true; // 心情、理智寫進存檔，同一個交易
  return r.ok ? shape(ctx, { lines: r.lines, item: r.item, tickets: r.tickets, ach: r.ach, mood: r.mood, san: r.san }) : no(r);
};

export const casino = onCall(async req => {
  const me = await needMember(req);
  const { act } = req.data || {};
  const d = req.data || {};
  switch (act) {
    // 進賭場：錢包（第一次會建）、這一手有沒有沒打完的、舊資料有沒有可以認領的
    case "peek": { // 狀態列的籌碼（只讀，不建錢包；還沒進過賭場就是開場的數字）
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
      const r = casCellarFind(ctx.w, ctx.house, d.room, ctx.day);
      return r.ok ? { ok: true, found: r.found, t: r.t == null ? null : r.t, chips: ctx.w.chips } : no(r);
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
        return shape(ctx, { legacy: peek, loanNotes, sanity: ctx.P && Number.isFinite(ctx.P.sanity) ? ctx.P.sanity : null });
      });
    }
    case "deal": return play(req, me, { save: true }, ctx => actDeal(ctx, d));
    case "hit":
    case "stand": return play(req, me, { save: true }, ctx => actHitStand(act, ctx, d));
    case "relief": return play(req, me, {}, actRelief);
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
