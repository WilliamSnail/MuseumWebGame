import "./options.js"; // 地區、initializeApp：一定要最先（見 options.js）
// ================================================================
//  Hamachi 賭場（決定 0040）：單人 21 點、籌碼錢包、大禮包、餐車、救濟、換小獎、成就和財產、舊資料認領。
//  規則在 shared/casino.js、shared/casino_wallet.js；這個檔只管讀寫，每一步都是 Firestore 交易。
//  放哪裡（都只有 Functions 碰得到，firestore.rules 沒開放）：
//    casinoWallets/{uid}   籌碼錢包（data：JSON 字串）
//    casinoRounds/{uid}    現在這一手：洗好的牌、莊家的底牌都在裡面（畫面只拿到看得到的）
//    casinoHouse/main      莊家的錢（大家共用）
//    casinoLegacy/{小寫 email}   舊 Discord 21 點的籌碼、成就、財產，翊文之後放；認領後標 claimedBy
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
import { casBuy, casEventPacks, casExchange, casHang, casHouseFix, casHouseLines, casLegacyClaim, casLegacyPeek, casOpenPacks, casRelief, casSetTitle, casStepDeal, casStepHit, casStepStand, casWalletFix, casWalletView, casWkClaim, casWkDefFor } from "./shared/casino_wallet.js";
import { casWkSync, casWkView } from "./shared/casino_week.js";
import { titlePublish } from "./shared/titles.js";
import { casCellarFind } from "./shared/casino_find.js";
import { eventsFromWeeks } from "./shared/events.js";
import { EVENT_WEEKS } from "./shared/events_data.js";
import { CAS_WEEK_LIB } from "./shared/casino_week_data.js";
import { setRng, taipeiDay } from "./shared/logic.js";
import { inbox, needMember, newId, now, rtdb } from "./party.js";

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
async function play(req, me, opts, fn) {
  const t = now(), day = taipeiDay(t), email = emailOf(req);
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
      const r = fn(ctx);
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
    return out;
  } finally { setRng(null); }
}
// 稱號到處看得到（決定 0050）：現在戴的稱號公開在 Realtime Database 的 titles/{uid}（館友讀得到，只有這裡寫得動）。
// 只放 { id, name }，名字是錢包裡的（不信存檔）。寫不進去不影響賭場本身，下次進館的 peek 會再補
const publishTitle = async (uid, t) => {
  try { await (t ? rtdb().ref(`titles/${uid}`).set(t) : rtdb().ref(`titles/${uid}`).remove()); }
  catch (e) { console.error("titles：寫不進去", uid, e && e.message); }
};
// 畫面要的：錢包摘要、這一手、莊家
// 每一步成功的回答都經過這裡：先同步每週收藏（統計夠了就發），再把摘要、這一手、莊家一起給畫面
export const wkDefOf = w => casWkDefFor(CAS_WEEK_LIB, w.wk.week);
const shape = (ctx, extra) => {
  const sync = casWkSync(ctx.w, wkDefOf(ctx.w), ctx.day);
  return Object.assign({ ok: true, wallet: casWalletView(ctx.w, ctx.day), wk: casWkView(ctx.w, ctx.day), wkNew: sync.newItems, wkDone: sync.completed,
    round: ctx.round ? casRoundView(ctx.round, "") : null, house: casHouseLines(ctx.house), reopen: ctx.reopen || null, evPacks: ctx.evPacks || 0 }, extra || {});
};
const no = r => ({ ok: false, reason: r.reason || "沒辦法" });

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
      return { ok: true, chips: w.chips };
    }
    // 走地下探險撿籌碼（決定 0047）：畫面只說走完了哪個房間，有沒有、多少、一天幾次都是這裡算。沒撿到也要寫（記下這個房間，不能重擲）；重複、撿夠了什麼都不寫
    case "cellarFind": return play(req, me, {}, ctx => {
      const r = casCellarFind(ctx.w, ctx.house, d.room, ctx.day);
      return r.ok ? { ok: true, found: r.found, t: r.t == null ? null : r.t, chips: ctx.w.chips } : no(r);
    });
    case "open": {
      return play(req, me, { legacy: true, save: true, writeAnyway: true }, ctx => {
        const peek = casLegacyPeek(ctx.w, ctx.legacy);
        return shape(ctx, { legacy: peek, sanity: ctx.P && Number.isFinite(ctx.P.sanity) ? ctx.P.sanity : null });
      });
    }
    case "deal": return play(req, me, { save: true }, ctx => {
      const r = casStepDeal(ctx, d.text);
      if (!r.ok) return Object.assign(no(r), { gag: !!r.gag });
      ctx.roundDirty = true;
      return shape(ctx, { settle: r.settle ? { ach: r.settle.ach, lines: r.settle.lines, houseBroke: r.settle.houseBroke, streak: r.settle.streak || [] } : null, ticket: !!r.ticket });
    });
    case "hit":
    case "stand": return play(req, me, { save: true }, ctx => {
      const seq = Number.isInteger(d.seq) ? d.seq : -1;
      const r = act === "hit" ? casStepHit(ctx, seq) : casStepStand(ctx, seq);
      if (!r.ok) return no(r);
      ctx.roundDirty = true;
      return shape(ctx, { settle: r.settle ? { ach: r.settle.ach, lines: r.settle.lines, houseBroke: r.settle.houseBroke, streak: r.settle.streak || [] } : null, ticket: !!r.ticket });
    });
    case "relief": return play(req, me, {}, ctx => {
      if (ctx.round && ctx.round.state === "playing") return { ok: false, reason: "先打完這壹手" };
      const r = casRelief(ctx.w, ctx.day);
      return r.ok ? shape(ctx, { lines: r.lines, ach: r.ach }) : no(r);
    });
    case "pack": return play(req, me, {}, ctx => {
      const r = casOpenPacks(ctx.w, ctx.house, d.n, ctx.day);
      return r.ok ? shape(ctx, { packs: r.packs, total: r.total, ach: r.ach }) : no(r);
    });
    case "buy": return play(req, me, { save: true }, ctx => {
      const r = casBuy(ctx.w, ctx.house, d.item, ctx.day, undefined, ctx.P);
      if (r.ok && (r.mood || r.san)) ctx.saveDirty = true; // 心情、理智寫進存檔，同一個交易
      return r.ok ? shape(ctx, { lines: r.lines, item: r.item, tickets: r.tickets, ach: r.ach, mood: r.mood, san: r.san }) : no(r);
    });
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
