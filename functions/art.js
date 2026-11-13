import "./options.js"; // 地區、initializeApp：一定要最先（見 options.js）
// ================================================================
//  藝術市場第一步（11-14，shared/casino_art.js；規劃 docs/經濟體系規劃.md 2.10 節）：跟館方買賣每日特展的畫。
//  art  act "quote"（只讀：今天特展上能買的畫、現價、我收藏的畫）、"buy"（d.id）、"sell"（d.id）
//  買賣在 casino.js 的 playCore 裡做：錢包、莊家、存檔（P.art）在同一個 Firestore 交易，錢只搬不生（casHouseMove "art"）。
//  畫的登記（id、日期、畫框…）是 tools/copy_shared.cjs 打包進來的 shared/art_data.js，價格和稀有度都在伺服器算，不信瀏覽器。
// ================================================================
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { casArtBuy, casArtSecret, casArtSell, casArtTier, casArtView } from "./shared/casino_art.js";
import { twSecret } from "./stock_tw.js";
import { casHouseFix, casWalletFix } from "./shared/casino_wallet.js";
import { ART_WORKS } from "./shared/art_data.js";
import { NUM } from "./shared/config.js";
import { taipeiDay } from "./shared/logic.js";
import { needMember, now } from "./party.js";
import { no, playCore, shape } from "./casino.js";

const db = () => getFirestore();
const parse = s => (s.exists ? JSON.parse(s.data().data) : null);
const DAY_MS = 86400000;
const dayNum = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY_MS;

// 館方現在賣的畫：登記裡「日期在 shelfDays 天內」的
export function shelfWorks(day, lib = ART_WORKS) {
  const out = [];
  for (const id of Object.keys(lib)) {
    const x = lib[id];
    if (!x || typeof x.date !== "string") continue;
    const age = dayNum(day) - dayNum(x.date);
    if (age >= 0 && age < NUM.art.shelfDays) out.push({ id, date: x.date, tier: casArtTier(x), title: x.title || "", auction: !!x.auction || casArtTier(x) >= NUM.auction.minTier });
  }
  return out;
}
export const workOf = (id, lib = ART_WORKS) => {
  const x = typeof id === "string" && Object.prototype.hasOwnProperty.call(lib, id) ? lib[id] : null;
  return x && typeof x.date === "string" ? { id, date: x.date, tier: casArtTier(x), title: x.title || "", auction: !!x.auction || casArtTier(x) >= NUM.auction.minTier } : null;
};

// 買賣在交易裡做的事
export const actArt = (ctx, d, lib = ART_WORKS) => {
  const op = String((d && d.op) || "");
  let r;
  if (op === "buy") { const wk = workOf(d.id, lib); r = wk ? casArtBuy(ctx.w, ctx.house, ctx.P, wk, ctx.day) : { ok: false, reason: "館方沒有登記這幅畫" }; }
  else if (op === "sell") r = casArtSell(ctx.w, ctx.house, ctx.P, String(d.id || ""), ctx.day);
  else r = { ok: false, reason: "沒有這個動作" };
  if (!r.ok) return no(r);
  ctx.saveDirty = true; // P.art 在存檔裡，同一個交易寫
  return shape(ctx, { lines: r.lines, art: casArtView(ctx.w, ctx.house, ctx.P, shelfWorks(ctx.day, lib), ctx.day) });
};

export const art = onCall(async req => {
  const me = await needMember(req);
  const d = req.data || {}, act = String(d.act || "");
  if (act === "quote") { // 只讀：不建錢包、不寫東西
    const day = taipeiDay(now());
    const [ws, hs, ss] = await Promise.all([db().doc(`casinoWallets/${me.uid}`).get(), db().doc("casinoHouse/main").get(), db().doc(`saves/${me.uid}`).get()]);
    const S = parse(ss), P = S && S.profiles && S.profiles.challenge ? S.profiles.challenge : null;
    const w = casWalletFix(parse(ws), day), house = casHouseFix(parse(hs), day).house;
    casArtSecret(await twSecret()); // 價格含隨機走勢，要用跟交易同一個祕密
    return { ok: true, chips: w.chips, art: P ? casArtView(w, house, P, shelfWorks(day), day) : null };
  }
  if (act === "auctions") return auctionView(me);
  if (act === "bid" || act === "list" || act === "cancel") { const r = await auctionOp(me, d); return r; }
  if (act === "trade") return playCore(me, "", { save: true }, ctx => actArt(ctx, d));
  throw new HttpsError("invalid-argument", "不認得的動作");
});

// ================================================================
//  藝術市場第二步：畫的拍賣（11-14，shared/casino_auction.js；規劃 docs/經濟體系規劃.md 2.10b 節）
//  casinoAuction/main（data：JSON 字串，只有 Functions 碰得到；出價是封閉的，瀏覽器永遠讀不到）
//  art  act "auctions"（看：開放中的拍賣、最近收標的得標價、我的出價）、"bid"（d.id、d.amt：出價或加價，只能往上）、
//       "list"（d.id 畫的 id、d.reserve 底價：把自己的畫拿去拍）、"cancel"（d.id 拍賣 id：沒人出價才能取消）
//  每個動作都先「摸壹下」拍賣（auctionTouch）：補開館方的拍賣、收掉時間到了的。沒有人在線的時候不會收，下次有人摸到才收（lazy），另外每小時有排程摸壹次。
//  收標壹場壹個交易：拍賣文件、所有出價人的錢包、得標人和賣家的存檔、莊家一起寫，所以重跑不會付兩次。
// ================================================================
import { onSchedule } from "firebase-functions/v2/scheduler";
import { FieldValue } from "firebase-admin/firestore";
import { casAucMails, casAucBid, casAucCancel, casAucDocFix, casAucDue, casAucList, casAucOpenHouse, casAucPeople, casAucSettle, casAucView, casAucWallet } from "./shared/casino_auction.js";
import { inbox } from "./party.js";
import { MAIL_DAYS } from "./shared/mailbox.js";

const aucRef = () => db().doc("casinoAuction/main");
const walletRef = uid => db().doc(`casinoWallets/${uid}`);
const houseRef = () => db().doc("casinoHouse/main");
const saveRef = uid => db().doc(`saves/${uid}`);
const put = (tx, ref, obj) => tx.set(ref, { data: JSON.stringify(obj), updatedAt: FieldValue.serverTimestamp() });
const profileOf = S => (S && S.profiles && S.profiles.challenge ? S.profiles.challenge : null);
const saveWrite = (tx, uid, snap, S) => { const rev = snap.data().rev + 1; tx.set(saveRef(uid), { data: JSON.stringify(S), rev, updatedAt: FieldValue.serverTimestamp() }); return rev; };
const bad = reason => ({ ok: false, reason });

// 館方還有哪些稀有的畫沒開拍（只算要不要開，開的時候在交易裡）
const needOpen = (doc, t, day) => {
  const probe = { open: doc.open.slice() };
  return casAucOpenHouse(probe, shelfWorksAll(day), day, t, null) > 0;
};
// 已經展出（日期 ≤ 今天）、要拍的畫（不論展出幾天）：從登記裡找
export function shelfWorksAll(day, lib = ART_WORKS) {
  const out = [];
  for (const id of Object.keys(lib)) { const x = lib[id]; if (x && typeof x.date === "string" && x.date <= day) out.push({ id, date: x.date, tier: casArtTier(x), title: x.title || "", auction: !!x.auction || casArtTier(x) >= NUM.auction.minTier }); }
  return out;
}

// 收壹場（時間到了的）。交易失敗（被別人先收了、衝突）就當作沒事，下次再收
async function settleOne(id, t, day) {
  const done = await db().runTransaction(async tx => {
    const as = await tx.get(aucRef());
    const doc = casAucDocFix(parse(as));
    const a = doc.open.find(x => x.id === id);
    if (!a || t < a.closeAt) return null; // 已經被收了（別的請求先到）
    const people = casAucPeople(a);
    const [hs, ...rest] = await Promise.all([tx.get(houseRef()), ...people.map(u => tx.get(walletRef(u))), ...people.map(u => tx.get(saveRef(u)))]);
    const house = casHouseFix(parse(hs), day).house, wallets = {}, saves = {}, saveSnaps = {}, S = {};
    people.forEach((u, i) => {
      if (rest[i].exists) wallets[u] = casWalletFix(parse(rest[i]), day);
      const ss = rest[people.length + i];
      if (ss.exists) { saveSnaps[u] = ss; S[u] = parse(ss); const P = profileOf(S[u]); if (P) saves[u] = P; }
    });
    const r = casAucSettle(doc, id, { house, wallets, saves, day, nowMs: t });
    if (!r.ok) return null;
    for (const u of r.touched) if (wallets[u]) put(tx, walletRef(u), wallets[u]);
    const revs = {}; // 存檔有動的：得標的人（拿到畫）、賣家（畫賣出或解鎖）
    for (const u of [r.winner, a.seller]) if (u && !revs[u] && saveSnaps[u] && saves[u]) revs[u] = saveWrite(tx, u, saveSnaps[u], S[u]);
    put(tx, houseRef(), house); put(tx, aucRef(), doc);
    // 收標通知信（得標、賣家、沒拍到的各壹封；編號用拍賣編號，同壹場不會寄兩次）。只寄信，不發 Discord
    const mails = casAucMails(id, a, r.notes, day, MAIL_DAYS);
    for (const x of mails) tx.set(db().doc(`mail/${x.uid}/items/${x.mail.id}`), Object.assign(JSON.parse(JSON.stringify(x.mail)), { fromId: null, createdAt: FieldValue.serverTimestamp() }));
    return { revs, mails };
  });
  if (done) for (const u of Object.keys(done.revs)) { try { await inbox(u, { t: "save_changed", rev: done.revs[u], why: "auction" }); } catch (e) { console.warn("拍賣：通知不到", u, e && e.message); } }
  if (done) for (const x of done.mails) { try { await inbox(x.uid, { t: "mail_new", kind: "auction", from: x.mail.from, text: x.mail.note }); } catch (e) { /* 信已經寫了，通知晚點看信箱也看得到 */ } }
  return !!done;
}
// 摸壹下：補開館方的拍賣、收時間到的。回傳目前的拍賣文件（只讀用）
export async function auctionTouch() {
  const t = now(), day = taipeiDay(t);
  let doc = casAucDocFix(parse(await aucRef().get()));
  if (needOpen(doc, t, day)) {
    await db().runTransaction(async tx => {
      const [as, hs] = await Promise.all([tx.get(aucRef()), tx.get(houseRef())]);
      const d = casAucDocFix(parse(as)), house = casHouseFix(parse(hs), day).house;
      if (casAucOpenHouse(d, shelfWorksAll(day), day, t, house) > 0) put(tx, aucRef(), d);
    });
    doc = casAucDocFix(parse(await aucRef().get()));
  }
  const due = casAucDue(doc, t);
  for (const id of due) { try { await settleOne(id, t, day); } catch (e) { console.error("拍賣：收標失敗", id, e && e.message); } }
  return due.length ? casAucDocFix(parse(await aucRef().get())) : doc;
}

// 出價、拿去拍、取消：壹個交易（拍賣文件、錢包、存檔、莊家）
async function auctionOp(me, d) {
  const op = String(d.act), t = now(), day = taipeiDay(t);
  const out = await db().runTransaction(async tx => {
    const [as, ws, ss, hs] = await Promise.all([tx.get(aucRef()), tx.get(walletRef(me.uid)), tx.get(saveRef(me.uid)), tx.get(houseRef())]);
    const doc = casAucDocFix(parse(as)), w = casWalletFix(parse(ws), day), S = ss.exists ? parse(ss) : null, P = profileOf(S), house = casHouseFix(parse(hs), day).house;
    let r;
    if (op === "bid") r = casAucBid(doc, w, P, me.uid, String(d.id || ""), d.amt, day, t);
    else if (op === "list") r = casAucList(doc, w, P, me.uid, house, String(d.id || ""), d.reserve, day, t);
    else if (op === "cancel") r = casAucCancel(doc, P, me.uid, String(d.id || ""));
    else r = bad("沒有這個動作");
    if (!r.ok) return r;
    put(tx, aucRef(), doc);
    if (op === "bid") put(tx, walletRef(me.uid), w);
    let rev = null;
    if (op !== "bid") rev = saveWrite(tx, me.uid, ss, S);
    return Object.assign({}, r, { rev, chips: w.chips, view: casAucView(doc, w, me.uid, day, t) });
  });
  return out;
}

export const auctionTick = onSchedule({ schedule: "5 * * * *", timeZone: "Asia/Taipei", retryCount: 0, timeoutSeconds: 120 }, async () => { await auctionTouch(); });

// 看：只讀（不建錢包）。有收標的結果通知就順手清掉
export async function auctionView(me) {
  const t = now(), day = taipeiDay(t), doc = await auctionTouch();
  const ws = await walletRef(me.uid).get(), w = casWalletFix(parse(ws), day);
  const view = casAucView(doc, w, me.uid, day, t);
  if (view.notes.length && ws.exists) {
    try { await db().runTransaction(async tx => { const s = await tx.get(walletRef(me.uid)); if (!s.exists) return; const x = casWalletFix(parse(s), day); casAucWallet(x).notes = []; put(tx, walletRef(me.uid), x); }); } catch (e) { /* 下次再清 */ }
  }
  return { ok: true, chips: w.chips, auctions: view };
}
