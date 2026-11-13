// ================================================================
//  藝術市場第二步：畫的拍賣（11-14，規劃 docs/經濟體系規劃.md 2.10b 節）
//  翊文的決定：封閉式（每人寫壹個價，最高價得標、付「第二高」的價；只有壹人出價就付底價；同價先出的得標）、
//  每幅稀有畫（珍藏、孤品，或內容標了 auction）壹場，展出後 closeDays 天、台灣 closeHour 點收標；
//  玩家可以拍自己的畫；收標後只公開得標價，誰出多少沒有人看得到（自己的看得到）。
//  拍賣的狀態放在 casinoAuction/main（只有伺服器碰得到）：
//    { v, seq, open: [拍賣], done: [最近收標的結果] }
//    拍賣 { id, kind "house"|"player", work 畫的 id, title, tier, date 展出那天, seller 賣家 uid（館方是 null）, reserve 底價,
//           ceil 出價上限（只有玩家拍的有，館方的是 0）, opens 開始的那天, closeAt 收標的時間（毫秒）, bids: { uid: { amt, n 第幾個出價, at } } }
//    結果 { id, kind, work, title, tier, price 得標價（流標是 null）, closedAt }
//  出價鎖籌碼（跟股票的限價單壹樣）：錢包 w.auc = { hold 鎖住的總和, bids: { 拍賣 id: 金額 } }；錢還是玩家的，記帳算在 bkHeld。
//  錢怎麼動（全是「搬」）：
//    出價＝錢包 → 鎖；收標時所有鎖退回，得標的再付「第二高價」：
//    館方的畫 → 莊家（casHouseMove "artAuction"）；玩家的畫 → 賣家（扣 feePct% 進預算池，casCount "artFee"）。
//    畫從賣家的 P.art.own 搬到得標的人；house.art.own（全館持有幾份）不變。
//  收標是「下次有人摸到拍賣」時才算（lazy），壹場壹個 Firestore 交易，從 open 搬到 done 跟所有錢包、存檔同壹次寫，所以不會付兩次。
//  純函式：「今天」「現在」從參數來。伺服器入口在 functions/art.js。
// ================================================================
import { NUM } from "./config.js";
import { casCount, casHouseMove } from "./casino_book.js";
import { casArtFix, casArtHouse, casArtPrice } from "./casino_art.js";
import { casBondFix } from "./casino_bond.js";
import { casNum } from "./casino.js";

const auBox = v => !!v && typeof v === "object" && !Array.isArray(v);
const auN = v => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
const auDay = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const auFill = (s, o) => Object.keys(o).reduce((t, k) => t.split("{" + k + "}").join(String(o[k])), s);
const auHas = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const auDiff = (a, b) => { const f = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((f(b) - f(a)) / 86400000); };
const auUnit = n => Math.floor(n / NUM.auction.unit) * NUM.auction.unit;

export const CAS_AUC = {
  title: "拍賣", sub: "稀有的畫另外開拍。每人寫壹個價，收標時最高價得標、付第二高的價；沒有人看得到別人出多少。",
  mailFrom: "拍賣行", mailTitle: "拍賣收標：{title}",
  house: "館方", player: "館友", bid: "出價", raise: "加價", cancel: "取消", list: "拿去拍", mine: "我的出價", ends: "收標", bidders: "{n} 人出價", none: "還沒有人出價",
  bidOk: "「{title}」出價 {n}，鎖住 {lock} 籌碼，收標前不能撤。", raiseOk: "「{title}」的出價加到 {n}。",
  listOk: "「{title}」放上拍賣，底價 {n}，{when}收標。", cancelOk: "「{title}」取消拍賣，畫回到你手上。",
  wonLine: "拍到「{title}」，付 {n}。", lostLine: "「{title}」沒有拍到，鎖住的籌碼退回。", soldLine: "「{title}」賣出，{n}（扣掉 {fee} 手續費）進了你的錢包。", unsoldLine: "「{title}」流標，畫回到你手上。",
  bad: "這場拍賣沒辦法這樣做。", gone: "找不到這場拍賣，可能已經收標了。", closed: "這場拍賣已經收標。", nomode: "要用挑戰模式的參觀者才能拍賣。",
  young: "帳號要開了 {n} 天以上才能拍賣，還要 {left} 天。", self: "不能對自己的畫出價。", dup: "這幅畫你已經收藏了，不用再拍。", full: "收藏架放滿了（最多 {n} 幅），先賣回壹幅。",
  low: "出價不能低於底價 {n}。", high: "出價最高 {n}（館友拍賣綁在館方價的 {pct}% 以內）。", up: "出價只能往上加，目前是 {n}。", poor: "籌碼不夠，要再鎖 {n}。", crowd: "這場出價的人已經滿了。",
  notOwn: "你沒有收藏這幅畫。", locked: "這幅畫正在拍賣，不能賣回也不能再拍。", listCap: "壹個人最多同時拍 {n} 幅。",
  priceRange: "底價要在館方價的 {lo}%～{hi}%（{a}～{b}）。", premium: "你今天靠拍賣收的溢價已經到上限了，明天再來。", hasBids: "已經有人出價了，不能取消。",
  direct: "這幅是稀有的畫，只在拍賣買得到。",
  rule: "稀有的畫（珍藏、孤品）展出後 {days} 天、台灣 {hour} 點收標。館友的畫底價要在館方價的 {lo}%～{hi}%，成交抽 {fee}% 進預算池；帳號要開 {age} 天以上。",
};

// ---------- 時間 ----------
// 展出那天（date）起算 days 天後的 closeHour 點（台灣）＝毫秒。換日是 05:00，所以 22:00 還是同壹天
export const casAucCloseAt = (date, days = NUM.auction.closeDays) => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d + days, NUM.auction.closeHour - 8, 0, 0);
};
const auWhen = ms => { const t = new Date(ms + 8 * 3600000); return `${t.getUTCMonth() + 1}/${t.getUTCDate()} ${String(t.getUTCHours()).padStart(2, "0")}:00`; };

// ---------- 存的東西 ----------
// 拍賣文件補欄位、丟壞的
export function casAucDocFix(d) {
  if (!auBox(d)) d = {};
  d.v = 1; d.seq = auN(d.seq);
  d.open = (Array.isArray(d.open) ? d.open : []).filter(a => auBox(a) && typeof a.id === "string" && typeof a.work === "string" && auBox(a.bids) && Number.isFinite(+a.closeAt)).map(a => {
    const bids = {};
    for (const u of Object.keys(a.bids)) if (u !== "__proto__" && auBox(a.bids[u]) && auN(a.bids[u].amt) > 0) bids[u] = { amt: auN(a.bids[u].amt), n: auN(a.bids[u].n), at: auN(a.bids[u].at) };
    return { id: a.id, kind: a.kind === "player" ? "player" : "house", work: a.work, title: String(a.title || "").slice(0, 40), tier: auN(a.tier), date: auDay(a.date) ? a.date : "", seller: typeof a.seller === "string" && a.seller ? a.seller : null,
      reserve: auN(a.reserve), ceil: auN(a.ceil), opens: auDay(a.opens) ? a.opens : "", closeAt: +a.closeAt, bids };
  });
  d.done = (Array.isArray(d.done) ? d.done : []).filter(x => auBox(x) && typeof x.id === "string").map(x => ({ id: x.id, kind: x.kind === "player" ? "player" : "house", work: String(x.work || ""), title: String(x.title || "").slice(0, 40), tier: auN(x.tier), price: x.price == null ? null : auN(x.price), closedAt: auN(x.closedAt) })).slice(-NUM.auction.recent);
  return d;
}
// 錢包：w.auc
export function casAucWallet(w) {
  if (!auBox(w.auc)) w.auc = {};
  const bids = {};
  if (auBox(w.auc.bids)) for (const k of Object.keys(w.auc.bids)) if (k !== "__proto__" && auN(w.auc.bids[k]) > 0) bids[k] = auN(w.auc.bids[k]);
  w.auc.bids = bids;
  w.auc.notes = (Array.isArray(w.auc.notes) ? w.auc.notes : []).filter(s => typeof s === "string").slice(-5); // 收標的結果（畫面看過就清掉）
  w.auc.hold = Object.keys(bids).reduce((s, k) => s + bids[k], 0); // 永遠由出價算出來，不會對不上
  return w.auc;
}

// ---------- 哪些畫要拍 ----------
// work：{ tier, auction }。稀有的（珍藏、孤品）或內容標了 auction 的，只在拍賣買得到
export const casAucWanted = work => !!work && (auN(work.tier) >= NUM.auction.minTier || !!work.auction);
// 照登記的畫（works：[{ id, date, tier, title, auction }]）補館方的拍賣。只開「已經展出、還沒收標」的；回傳新開了幾場。底價＝展出那天的館方價 × 100%
export function casAucOpenHouse(doc, works, day, nowMs, house) {
  let n = 0;
  for (const wk of works) {
    if (!wk || !casAucWanted(wk) || !auDay(wk.date) || !auDay(day) || typeof wk.id !== "string") continue;
    const id = "h~" + wk.id;
    if (auDiff(wk.date, day) < 0 || doc.open.some(a => a.id === id)) continue;
    const closeAt = casAucCloseAt(wk.date);
    if (closeAt <= nowMs) continue; // 收標的時間已經過了：不補開（上線前的舊畫、收完的不會再開）
    const reserve = auUnit(casArtPrice({ tier: wk.tier, date: wk.date }, wk.id, wk.date, house || null) * NUM.auction.houseReservePct / 100);
    doc.open.push({ id, kind: "house", work: wk.id, title: String(wk.title || "").slice(0, 40), tier: auN(wk.tier), date: wk.date, seller: null, reserve, ceil: 0, opens: wk.date, closeAt, bids: {} });
    n++;
  }
  return n;
}

// ---------- 帳號年齡 ----------
const auAge = (w, day) => { const B = casBondFix(w, day); return B.born && auDay(B.born) ? auDiff(B.born, day) : 0; };
const auYoung = (w, day) => { const a = auAge(w, day); return a < NUM.auction.minAge ? auFill(CAS_AUC.young, { n: NUM.auction.minAge, left: NUM.auction.minAge - a }) : null; };

// ---------- 出價 ----------
// 出價或加價。w 錢包、P 存檔（挑戰模式的）、uid、id 拍賣 id、amt 要出的價。只往上加，不能撤
export function casAucBid(doc, w, P, uid, id, amt, day, nowMs) {
  const C = NUM.auction, A = casArtFix(P);
  if (!A) return { ok: false, reason: CAS_AUC.nomode };
  const a = doc.open.find(x => x.id === id);
  if (!a) return { ok: false, reason: CAS_AUC.gone };
  if (nowMs >= a.closeAt) return { ok: false, reason: CAS_AUC.closed };
  if (a.seller === uid) return { ok: false, reason: CAS_AUC.self };
  const young = auYoung(w, day);
  if (young) return { ok: false, reason: young };
  if (auHas(A.own, a.work)) return { ok: false, reason: CAS_AUC.dup };
  if (Object.keys(A.own).length >= NUM.art.holdMax) return { ok: false, reason: auFill(CAS_AUC.full, { n: NUM.art.holdMax }) };
  amt = Number.isFinite(+amt) ? Math.floor(+amt) : 0;
  if (amt < a.reserve) return { ok: false, reason: auFill(CAS_AUC.low, { n: casNum(a.reserve) }) };
  if (a.ceil > 0 && amt > a.ceil) return { ok: false, reason: auFill(CAS_AUC.high, { n: casNum(a.ceil), pct: C.ceilPct }) };
  const old = auHas(a.bids, uid) ? a.bids[uid] : null;
  if (!old && Object.keys(a.bids).length >= C.maxBidders) return { ok: false, reason: CAS_AUC.crowd };
  if (old && amt <= old.amt) return { ok: false, reason: auFill(CAS_AUC.up, { n: casNum(old.amt) }) };
  const delta = amt - (old ? old.amt : 0), L = casAucWallet(w);
  if (!Number.isFinite(+w.chips) || w.chips < delta) return { ok: false, reason: auFill(CAS_AUC.poor, { n: casNum(delta - Math.max(0, w.chips)) }) };
  w.chips -= delta; L.bids[id] = amt; L.hold += delta;
  a.bids[uid] = { amt, n: ++doc.seq, at: nowMs };
  return { ok: true, id, amt, lines: [auFill(old ? CAS_AUC.raiseOk : CAS_AUC.bidOk, { title: a.title, n: casNum(amt), lock: casNum(amt) })] };
}

// ---------- 玩家拿自己的畫來拍、取消 ----------
export const casAucSellerOpen = (doc, uid) => doc.open.filter(a => a.seller === uid);
// 這個賣家今天靠拍賣已經收到多少溢價（P.art.prem = { 日期: 溢價 }）
const auPremToday = (A, day) => (auBox(A.prem) ? auN(A.prem[day]) : 0);
// 要拍的畫的底價範圍：{ cur 館方現價, lo, hi }（hi 同時是出價上限）
export function casAucRange(x, id, day, house) {
  const C = NUM.auction, cur = casArtPrice(x, id, day, house);
  return { cur, lo: Math.ceil(cur * C.floorPct / 100 / C.unit) * C.unit, hi: auUnit(Math.min(cur * C.ceilPct / 100, cur + C.premiumDay)) };
}
export function casAucList(doc, w, P, uid, house, workId, reserve, day, nowMs) {
  const C = NUM.auction, A = casArtFix(P);
  if (!A) return { ok: false, reason: CAS_AUC.nomode };
  const young = auYoung(w, day);
  if (young) return { ok: false, reason: young };
  const x = typeof workId === "string" && auHas(A.own, workId) ? A.own[workId] : null;
  if (!x) return { ok: false, reason: CAS_AUC.notOwn };
  if (x.lock) return { ok: false, reason: CAS_AUC.locked };
  if (casAucSellerOpen(doc, uid).length >= C.listPerSeller) return { ok: false, reason: auFill(CAS_AUC.listCap, { n: C.listPerSeller }) };
  casArtHouse(house);
  const R = casAucRange(x, workId, day, house);
  reserve = Number.isFinite(+reserve) ? Math.floor(+reserve) : 0;
  if (reserve < R.lo || reserve > R.hi) return { ok: false, reason: auFill(CAS_AUC.priceRange, { lo: C.floorPct, hi: C.ceilPct, a: casNum(R.lo), b: casNum(R.hi) }) };
  if (auPremToday(A, day) >= C.premiumDay) return { ok: false, reason: CAS_AUC.premium };
  const closeAt = casAucCloseAt(day);
  const aid = "p~" + (++doc.seq);
  doc.open.push({ id: aid, kind: "player", work: workId, title: x.title, tier: x.tier, date: x.date, seller: uid, reserve, ceil: R.hi, opens: day, closeAt, bids: {} });
  x.lock = aid;
  return { ok: true, id: aid, lines: [auFill(CAS_AUC.listOk, { title: x.title, n: casNum(reserve), when: auWhen(closeAt) })] };
}
export function casAucCancel(doc, P, uid, id) {
  const A = casArtFix(P);
  if (!A) return { ok: false, reason: CAS_AUC.nomode };
  const i = doc.open.findIndex(x => x.id === id);
  if (i < 0) return { ok: false, reason: CAS_AUC.gone };
  const a = doc.open[i];
  if (a.seller !== uid) return { ok: false, reason: CAS_AUC.bad };
  if (Object.keys(a.bids).length > 0) return { ok: false, reason: CAS_AUC.hasBids };
  doc.open.splice(i, 1);
  if (auHas(A.own, a.work) && A.own[a.work].lock === id) delete A.own[a.work].lock;
  return { ok: true, lines: [auFill(CAS_AUC.cancelOk, { title: a.title })] };
}

// ---------- 收標 ----------
export const casAucDue = (doc, nowMs) => doc.open.filter(a => nowMs >= a.closeAt).map(a => a.id);
// 這場收標要動到哪些人（伺服器先讀好他們的錢包、存檔）：出價的人、賣家
export const casAucPeople = a => Array.from(new Set(Object.keys(a.bids).concat(a.seller ? [a.seller] : [])));
// 算壹場。ctx：{ house, wallets: { uid: 錢包 }, saves: { uid: 存檔的 P（挑戰模式的，沒有就沒這個 key） }, day, nowMs }
// 會改 doc、錢包、P、house，壹次做完：open 搬到 done，鎖退回，得標的付第二高價。
// 回傳 { ok, sold, winner, price, fee, touched: [要寫回的 uid], notes: { uid: [話] } }
export function casAucSettle(doc, id, ctx) {
  const i = doc.open.findIndex(x => x.id === id);
  if (i < 0) return { ok: false, reason: CAS_AUC.gone };
  const a = doc.open[i], C = NUM.auction, { house, wallets, saves, day } = ctx;
  casArtHouse(house);
  doc.open.splice(i, 1); // 先搬走：同壹次寫進去，不會再被算第二次
  const notes = {}, touched = new Set();
  const say = (u, s) => { (notes[u] = notes[u] || []).push(s); if (wallets[u]) { const L = casAucWallet(wallets[u]); L.notes = L.notes.concat(s).slice(-5); } };
  // 1 所有鎖退回（鎖對不上的出價不信、不退）
  const ok = [];
  for (const u of Object.keys(a.bids)) {
    const w = wallets[u];
    if (!w) continue;
    const L = casAucWallet(w), amt = a.bids[u].amt;
    if (L.bids[id] !== amt) continue;
    w.chips += amt; delete L.bids[id]; L.hold -= amt; touched.add(u);
    ok.push({ u, amt, n: a.bids[u].n });
  }
  // 2 能拿畫的人，高價先、同價先出的先
  const seller = a.seller, sellerA = seller && saves[seller] ? casArtFix(saves[seller]) : null;
  const ranks = ok.sort((p, q) => q.amt - p.amt || p.n - q.n).filter(b => {
    const A = saves[b.u] ? casArtFix(saves[b.u]) : null;
    return A && !auHas(A.own, a.work) && Object.keys(A.own).length < NUM.art.holdMax && wallets[b.u].chips >= b.amt;
  });
  const keep = a.kind === "player" ? !!(sellerA && wallets[seller] && auHas(sellerA.own, a.work) && sellerA.own[a.work].lock === id) : true; // 賣家的畫不見了：流標
  let sold = null;
  if (keep && ranks.length) {
    const top = ranks[0], second = ranks.length > 1 ? ranks[1].amt : a.reserve;
    let price = Math.max(a.reserve, Math.min(top.amt, second)), prem = 0;
    if (a.kind === "player") { // 賣家每天靠拍賣收的溢價有上限；超過就照上限算，低過底價就不賣
      const cur = casArtPrice(sellerA.own[a.work], a.work, day, house), room = Math.max(0, C.premiumDay - auPremToday(sellerA, day));
      price = Math.min(price, cur + room); prem = Math.max(0, price - cur);
    }
    if (price >= a.reserve) {
      const win = wallets[top.u], WA = casArtFix(saves[top.u]);
      win.chips -= price;
      let fee = 0;
      if (a.kind === "player") {
        fee = Math.floor(price * C.feePct / 100);
        const x = sellerA.own[a.work];
        wallets[seller].chips += price - fee; house.budget += fee; casCount(house, "artFee", fee); casCount(house, "artAuction");
        house.art.paid = Math.max(0, house.art.paid - auN(x.paid)) + price;
        delete sellerA.own[a.work];
        if (!auBox(sellerA.prem)) sellerA.prem = {};
        sellerA.prem[day] = auPremToday(sellerA, day) + prem;
        for (const d of Object.keys(sellerA.prem)) if (!auDay(d) || auDiff(d, day) > 14) delete sellerA.prem[d];
        touched.add(seller); say(seller, auFill(CAS_AUC.soldLine, { title: a.title, n: casNum(price - fee), fee: casNum(fee) }));
      } else {
        casHouseMove(house, "artAuction", price); casCount(house, "artAuction");
        house.art.paid += price; house.art.own[a.work] = auN(house.art.own[a.work]) + 1;
      }
      WA.own[a.work] = { tier: a.tier, date: auDay(a.date) ? a.date : day, d: day, paid: price, title: a.title };
      sold = { price, fee, winner: top.u }; touched.add(top.u);
      say(top.u, auFill(CAS_AUC.wonLine, { title: a.title, n: casNum(price) }));
    }
  }
  for (const b of ok) if (!sold || b.u !== sold.winner) say(b.u, auFill(CAS_AUC.lostLine, { title: a.title }));
  if (!sold && a.kind === "player" && sellerA) { // 流標：畫解鎖
    if (auHas(sellerA.own, a.work) && sellerA.own[a.work].lock === id) delete sellerA.own[a.work].lock;
    touched.add(seller); say(seller, auFill(CAS_AUC.unsoldLine, { title: a.title }));
  }
  doc.done.push({ id, kind: a.kind, work: a.work, title: a.title, tier: a.tier, price: sold ? sold.price : null, closedAt: ctx.nowMs });
  doc.done = doc.done.slice(-C.recent);
  return { ok: true, sold: !!sold, winner: sold ? sold.winner : null, price: sold ? sold.price : null, fee: sold ? sold.fee : 0, touched: Array.from(touched), notes };
}

// 收標通知信（11-14，翊文：得標的、賣家、沒拍到的都要收到通知）：casAucSettle 回傳的 notes（{ uid: [句子] }）每人寫成壹封信，
// 寄到伺服器的信箱（mail/{uid}/items/{id}，跟招領、來訪謝禮同壹套）。沒有附件、領了就收進自己的信箱。
// 編號 auc-拍賣編號（壹場壹人壹封，重跑不會寄兩次）。只有被收標的人收到，不貼 Discord。回傳 [{ uid, mail }]
export function casAucMails(id, a, notes, day, days) {
  const mid = ("auc-" + String(id)).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 100), out = [];
  const [y, m, d] = String(day).split("-").map(Number), exp = new Date(Date.UTC(y, m - 1, d) + (days || 30) * 86400000).toISOString().slice(0, 10);
  for (const uid of Object.keys(notes || {})) {
    const lines = notes[uid];
    if (!Array.isArray(lines) || !lines.length) continue;
    out.push({ uid, mail: { id: mid, from: CAS_AUC.mailFrom, title: auFill(CAS_AUC.mailTitle, { title: (a && a.title) || "" }), note: lines.join(" "), gift: { insp: 0, mood: 0 }, sent: day, expire: exp, claimed: false } });
  }
  return out;
}

// ---------- 畫面要的（只讀）----------
// 別人的出價、賣家是誰都不給。我的出價只有我自己看得到。w：我的錢包（算我鎖了多少）
export function casAucView(doc, w, uid, day, nowMs) {
  const C = NUM.auction, bids = w && auBox(w.auc) && auBox(w.auc.bids) ? w.auc.bids : {};
  const tierName = t => NUM.art.tiers[Math.min(NUM.art.tiers.length - 1, auN(t))].name;
  const open = doc.open.filter(a => nowMs < a.closeAt).sort((p, q) => p.closeAt - q.closeAt || (p.id < q.id ? -1 : 1)).map(a => ({
    id: a.id, kind: a.kind, sellerName: a.kind === "house" ? CAS_AUC.house : CAS_AUC.player, work: a.work, title: a.title, tier: a.tier, tierName: tierName(a.tier),
    reserve: a.reserve, ceil: a.ceil, closeAt: a.closeAt, bidders: Object.keys(a.bids).length,
    mine: auHas(a.bids, uid) ? a.bids[uid].amt : null, mineSeller: a.seller === uid, canCancel: a.seller === uid && Object.keys(a.bids).length === 0,
  }));
  const done = doc.done.slice().reverse().map(x => ({ id: x.id, kind: x.kind, sellerName: x.kind === "house" ? CAS_AUC.house : CAS_AUC.player, work: x.work, title: x.title, tier: x.tier, tierName: tierName(x.tier), price: x.price, closedAt: x.closedAt }));
  return { notes: w && auBox(w.auc) && Array.isArray(w.auc.notes) ? w.auc.notes.filter(s => typeof s === "string").slice(-5) : [], open, done, hold: Object.values(bids).reduce((s, n) => s + auN(n), 0), listLeft: Math.max(0, C.listPerSeller - doc.open.filter(a => a.seller === uid).length), minAge: C.minAge, feePct: C.feePct, floorPct: C.floorPct, ceilPct: C.ceilPct, premiumDay: C.premiumDay, closeDays: C.closeDays, closeHour: C.closeHour, day };
}
