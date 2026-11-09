// ================================================================
//  參觀館友的展廳、送佩佩、伺服器的信：伺服器每一步要做的事（多人版 M2，docs/多人實作.md）
//  翊文 11-09：「之後可以參觀館友的展廳、送佩佩……也要加入立即可以使用的功能」→ 館友名片上直接有按鈕、對方不在線也能用、收到的東西馬上能用。
//  規則本身在 shared/gifts.js、shared/mailbox.js。這個檔把「一次呼叫要做什麼」寫成純函式（step 開頭的）：
//    functions/visit.js 只負責讀資料庫、叫這裡、把結果在同一個 Firestore 交易裡寫回去。這樣不開模擬器也測得到（test/visit.test.cjs）。
//  訪客簿（Firestore 的 halls/{主人}，只有 Functions 讀寫）：
//    { log: [{ uid, nick, day, at, like, note, paid }], likes, seenAt }
//    log：一天一位館友一筆，最新的在前面，最多 NUM.guest.logMax 筆（今天的不會被擠掉：來訪靈感的上限要算今天的）。
//    paid：這筆有沒有給主人來訪的靈感。likes：累計幾個讚。seenAt：主人上次看的時間（比它新的算「新的」）。
//  「今天」、「現在」都由呼叫的人給（伺服器的時間），不信瀏覽器。玩家打的字（暱稱、留言）一律只當資料，畫面用純文字顯示。
// ================================================================
import { HALL_THEME_BONUS, LIMITED_ITEMS, NUM, PILLOW_PARTS } from "./config.js";
import { normKey, parsePillowKey, refPick } from "./logic.js";
import { GIFT_KINDS, SOCIAL, checkHallAct, checkHallCall, cleanHallNote, giftItemText, giftKeyOk, sendGift, visitGain, visitMail } from "./gifts.js";
import { claimMail, pruneMail, sendMail } from "./mailbox.js";
import { casCleanSouvenirs, casCleanTitle } from "./casino_wallet.js";

// ---------- 訪客簿 ----------
export function fixGuestBook(raw) {
  const b = raw && typeof raw === "object" ? raw : {};
  return {
    log: Array.isArray(b.log) ? b.log.filter(x => x && typeof x.uid === "string" && typeof x.day === "string").map(x => Object.assign({}, x)) : [],
    likes: Math.max(0, +b.likes || 0),
    seenAt: Math.max(0, +b.seenAt || 0),
  };
}
export const guestOf = (book, uid, day) => book.log.find(x => x.uid === uid && x.day === day) || null;
export const guestPaidToday = (book, day) => book.log.filter(x => x.day === day && x.paid).length;
// 來訪的信的編號：同一位館友同一天只有一封（交易重跑也不會多一封）
export const visitMailId = (uid, day) => `visit-${day}-${uid}`;
function trimGuests(book, today) {
  const newest = (a, b) => (b.at || 0) - (a.at || 0);
  book.log.sort(newest);
  if (book.log.length <= NUM.guest.logMax) return;
  const mine = book.log.filter(x => x.day === today), rest = book.log.filter(x => x.day !== today);
  book.log = mine.concat(rest.slice(0, Math.max(0, NUM.guest.logMax - mine.length))).sort(newest);
}
// 記一筆來訪（今天第一次才記），算這次主人拿幾點靈感、要不要寄信。會改 book
function addGuest(book, me, today, at) {
  if (guestOf(book, me.uid, today)) return { first: false, gain: 0, mail: null };
  const gain = visitGain({ self: false, open: true, again: false, paidToday: guestPaidToday(book, today) });
  book.log.unshift({ uid: me.uid, nick: me.nick, day: today, at, like: false, note: null, paid: gain > 0 });
  trimGuests(book, today);
  return { first: true, gain, mail: gain > 0 ? visitMail({ id: visitMailId(me.uid, today), fromNick: me.nick, insp: gain, today }) : null };
}
// 展廳上給館友看的留言：最近 SOCIAL.notesShown 則（只有暱稱、字、日期，不給 uid）
export function guestNotes(book) {
  return book.log.filter(x => x.note).slice(0, SOCIAL.notesShown).map(x => ({ nick: x.nick, text: x.note, day: x.day }));
}
// 這位館友看到的：讚、留言、自己今天做過什麼
export function guestSide(book, uid, today) {
  const e = guestOf(book, uid, today);
  return { likes: book.likes, notes: guestNotes(book), mine: { liked: !!(e && e.like), noted: e && e.note ? e.note : null } };
}
// 主人看到的：誰來過、留了什麼話。fresh＝上次看過之後才有的；unseen＝新的有幾筆。最少給 NUM.guest.shown 筆，新的一定都給
export function guestNews(raw) {
  const b = fixGuestBook(raw);
  const log = b.log.slice().sort((x, y) => (y.at || 0) - (x.at || 0));
  const unseen = log.filter(x => (x.at || 0) > b.seenAt).length;
  const list = log.slice(0, Math.max(NUM.guest.shown, unseen)).map(x => ({ nick: x.nick, day: x.day, at: x.at || 0, like: !!x.like, note: x.note || null, fresh: (x.at || 0) > b.seenAt }));
  return { likes: b.likes, unseen, list };
}

// ---------- 展廳給別人看之前再檢查一次 ----------
// 存檔是玩家自己可以寫的：別人存檔裡的 key、裝飾 id 不能相信（畫面會拿去畫 SVG）。
// 每一格都要是遊戲裡真的有的選項；裝飾要是 LIMITED_ITEMS 裡的；名字最多 40 個字。不對的就當空展台。
function cleanHallSlot(s) {
  if (!s || typeof s !== "object" || typeof s.key !== "string" || s.key.length > 300) return null;
  const title = typeof s.title === "string" && s.title ? [...s.title].slice(0, 40).join("") : null;
  if (s.kind === "pillow") {
    const pp = parsePillowKey(s.key);
    if (!PILLOW_PARTS.every(p => p.options.some(o => o.name === pp.pick[p.name]))) return null;
    if (pp.ref && !(refPick(pp.ref) && giftKeyOk(pp.ref.slice(2)))) return null;
    return { kind: "pillow", key: s.key, perfect: false, title: null, printPerfect: !!s.printPerfect };
  }
  if (!GIFT_KINDS.includes(s.kind) || !giftKeyOk(s.key)) return null;
  return { kind: s.kind, key: normKey(s.key), perfect: s.kind === "pepe" && !!s.perfect, title: s.kind === "pepe" ? title : null };
}
// 辦完的展覽海報（決定 0035）：別人存檔裡的東西，一樣要檢查過才給參觀的人
function cleanPosters(list) {
  return (Array.isArray(list) ? list : []).slice(0, NUM.guest.postersMax).filter(p => p && Object.prototype.hasOwnProperty.call(HALL_THEME_BONUS, p.theme)).map(p => ({
    theme: p.theme,
    tier: Math.max(1, Math.min(3, Math.floor(+p.tier) || 1)),
    score: Math.max(0, Math.min(100, Math.floor(+p.score) || 0)),
    date: typeof p.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : null,
  }));
}
// 掛在牆上的探險報告（決定 0036）：別人存檔裡的東西，檢查過、限制長度才給參觀的人。畫面一律當純文字
const hallRepStr = (s, n) => (typeof s === "string" ? [...s].slice(0, n).join("") : "");
const hallRepNum = v => Math.max(0, Math.min(999, Math.floor(+v) || 0));
function cleanHallReport(r) {
  if (!r || typeof r !== "object" || typeof r.title !== "string") return null;
  const list = (x, n) => (Array.isArray(x) ? x : []).slice(0, n);
  return {
    id: hallRepStr(r.id, 40), title: hallRepStr(r.title, 40),
    date: typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null,
    floors: list(r.floors, 5).map(hallRepNum).filter(Boolean),
    members: list(r.members, 6).filter(m => m && typeof m === "object").map(m => ({ name: hallRepStr(m.name, 12) || "館友", ghost: !!m.ghost, guard: !!m.guard, san0: hallRepNum(m.san0), san1: hallRepNum(m.san1), insp: hallRepNum(m.insp) })),
    lines: list(r.lines, 20).filter(l => l && typeof l.t === "string").map(l => ({ k: /^[a-zA-Z]{1,12}$/.test(l.k) ? l.k : "x", t: hallRepStr(l.t, 200) })),
  };
}
export function cleanHallView(view) {
  if (!view || !view.open) return { open: false };
  const worn = (id, slot) => (LIMITED_ITEMS.some(x => x.id === id && x.kind === "deco" && x.slot === slot) ? id : null);
  return {
    open: true,
    slots: (Array.isArray(view.slots) ? view.slots : []).slice(0, NUM.guest.slotsMax).map(cleanHallSlot),
    score: Math.max(0, Math.min(100, +view.score || 0)),
    theme: typeof view.theme === "string" ? view.theme : null,
    deco: worn(view.deco, "stand"),
    frame: worn(view.frame, "frame"),
    posters: cleanPosters(view.posters),
    report: cleanHallReport(view.report),
    souvenirs: casCleanSouvenirs(view.souvenirs), // 賭場的紀念品、稱號（決定 0040）：只收清單上的 id 和短短的純文字名字
    title: casCleanTitle(view.title),
  };
}

// ---------- 比每週特展（Functions 的 weeklyView） ----------
// 館友之間比特展：只給「這週的特展」那一小部分（gifts.js 的 weeklyView），不給整份存檔。不算來訪、不寄信。
// 別人存檔裡的東西不能相信：格子走 cleanHallSlot，分數限制在 0–100；主題不用存檔裡的，用伺服器算的這週主題。
// o：{ view（weeklyView 的結果）, me, owner, week（這週是第幾週，伺服器算）, theme（這週的主題，伺服器算） }
// 回傳 { ok, open, started, week, theme, best, slots }：
//   open false＝對方還沒用挑戰模式開館；started false＝對方這週還沒開始（沒擺過，或存的是別週的）：只回這兩個，不給舊資料。
export function stepWeeklyView(o) {
  if (o.me.uid === o.owner) return { ok: false, code: "self", reason: "這是你自己的特展。" };
  const v = o.view;
  if (!v || !v.open) return { ok: true, open: false, started: false };
  const w = Math.floor(+v.w);
  if (v.w === null || !Number.isFinite(w) || w !== o.week) return { ok: true, open: true, started: false };
  return {
    ok: true, open: true, started: true, week: o.week, theme: o.theme,
    best: Math.max(0, Math.min(100, Math.floor(+v.best) || 0)),
    slots: (Array.isArray(v.slots) ? v.slots : []).slice(0, 6).map(cleanHallSlot),
  };
}

// ---------- 請館友來看我的展廳（Functions 的 hallCall） ----------
// 一天一位只能請一次：通知存在對方的 calls/{對方}/items/{callId}，編號一樣就是請過了（交易重跑也不會多一則）。
// 格式 { fromId, from（暱稱）, day, at, seen }。沒有獎勵。
export const callId = (day, uid) => `call-${day}-${uid}`;
// o：{ open（我的展廳開了沒）, had（今天已經請過這位）, me, to, today, at }。回傳 { ok, id, call } 或 { ok: false, code, reason }
export function stepHallCall(o) {
  const can = checkHallCall({ self: o.me.uid === o.to, open: !!o.open, done: !!o.had });
  if (!can.ok) return can;
  return { ok: true, id: callId(o.today, o.me.uid), call: { fromId: o.me.uid, from: o.me.nick, day: o.today, at: o.at, seen: false } };
}
// 通知給畫面看的樣子（資料庫裡多的欄位不給；壞掉的回 null）
export function callRow(raw, id) {
  if (!raw || typeof id !== "string" || typeof raw.fromId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(raw.fromId) || typeof raw.day !== "string") return null;
  return { id, fromId: raw.fromId, from: [...String(raw.from || "館友")].slice(0, 12).join(""), day: raw.day, at: Math.max(0, +raw.at || 0) };
}

// ---------- 走進館友的展廳（Functions 的 visitHall） ----------
// o：{ view（cleanHallView 過的）, book（訪客簿，還沒有就 null）, me: { uid, nick }, owner（主人的 uid）, today, at }
//    跟館友學的接口：learn(我的 P, 主人的 P)、mySave、ownerSave（functions/visit.js 的 LEARN_ON_VISIT；沒給就不學）。
// 回傳 { ok, open, view, first, gain, book（要寫回去的，沒改是 null）, mail（要寄給主人的，沒有是 null）, learn, likes, notes, mine }
export function stepVisitHall(o) {
  if (o.me.uid === o.owner) return { ok: false, code: "self", reason: "這是你自己的展廳。" };
  if (!o.view || !o.view.open) return { ok: true, open: false, view: { open: false }, first: false, gain: 0, book: null, mail: null, learn: null, likes: 0, notes: [], mine: { liked: false, noted: null } };
  const book = fixGuestBook(o.book);
  const v = addGuest(book, o.me, o.today, o.at);
  let learn = null;
  if (v.first && o.learn) {
    const myP = o.mySave && o.mySave.profiles && o.mySave.profiles.challenge;
    const ownerP = o.ownerSave && o.ownerSave.profiles && o.ownerSave.profiles.challenge;
    if (myP && ownerP) learn = o.learn(myP, ownerP) || null;
  }
  return Object.assign({ ok: true, open: true, view: o.view, first: v.first, gain: v.gain, book: v.first ? book : null, mail: v.mail, learn }, guestSide(book, o.me.uid, o.today));
}

// ---------- 按讚、留言（Functions 的 hallAct） ----------
// o：{ open（對方開館了沒）, book, kind: "like"｜"note", text, me, owner, today, at }
// 每天每間一次（gifts.js 的 checkHallAct）。過了 05:00 才按、今天還沒走進來過：順便算一次來訪。
export function stepHallAct(o) {
  if (o.kind !== "like" && o.kind !== "note") return { ok: false, code: "bad_kind", reason: "不認得的動作。" };
  const book = fixGuestBook(o.book);
  const self = o.me.uid === o.owner;
  const had = self ? null : guestOf(book, o.me.uid, o.today);
  const can = checkHallAct(o.kind, { self, open: !!o.open, done: !!(had && (o.kind === "note" ? had.note : had.like)) });
  if (!can.ok) return can;
  let text = null;
  if (o.kind === "note") {
    const c = cleanHallNote(o.text);
    if (!c.ok) return c;
    text = c.text;
  }
  const v = addGuest(book, o.me, o.today, o.at);
  const e = guestOf(book, o.me.uid, o.today);
  e.at = o.at;
  e.nick = o.me.nick;
  if (o.kind === "like") { e.like = true; book.likes += 1; }
  else e.note = text;
  trimGuests(book, o.today);
  return Object.assign({ ok: true, book, mail: v.mail, gain: v.gain, first: v.first, text }, guestSide(book, o.me.uid, o.today));
}

// ---------- 送佩佩（Functions 的 sendGift） ----------
// o：{ save（送的人整份存檔，會改）, item: { kind, key }, me, to, today, mailId }
// 回傳 { ok, gift, mail, text }：Functions 在同一個交易裡寫回 save、把 mail 放進對方的信箱。收藏只算挑戰模式（決定 0018）
export function stepSendGift(o) {
  if (o.me.uid === o.to) return { ok: false, code: "self", reason: "不能送給自己。" };
  const P = o.save && o.save.profiles && o.save.profiles.challenge;
  if (!P) return { ok: false, code: "no_museum", reason: "要先用挑戰模式開館，才能送佩佩。" };
  const r = sendGift(P, o.item, { id: o.mailId, fromNick: o.me.nick, today: o.today });
  if (!r.ok) return r;
  return { ok: true, gift: r.gift, mail: r.mail, text: giftItemText(r.gift) };
}

// ---------- 領伺服器的信（Functions 的 claimMail） ----------
// o：{ save（領的人整份存檔，會改）, mails（信的內容，讀不到的放 null）, today }
// 領了就搬進 P.mail（用 mailbox.js 的 sendMail、claimMail），之後當成「已領取」的一封留在信箱裡。
// 回傳 { ok, done: [{ id, gift }], skipped: [{ id, reason }], events, total: { insp, mood, pepes, n } }
//   done 裡的都要標成領過（stale：存檔裡早就有這封，只補標，不再給一次）。skipped 的信不動。
export function stepClaimMail(o) {
  const P = o.save && o.save.profiles && o.save.profiles.challenge;
  if (!P) return { ok: false, code: "no_museum", reason: "要先用挑戰模式開館，才能領信。" };
  pruneMail(P, o.today);
  const done = [], skipped = [], events = [], total = { insp: 0, mood: 0, pepes: 0, n: 0 };
  for (const m of o.mails || []) {
    if (!m || typeof m.id !== "string" || m.gone) { skipped.push({ id: (m && m.id) || null, reason: "找不到這封信" }); continue; }
    if (m.claimed) { skipped.push({ id: m.id, reason: "已經領過了" }); continue; }
    if (typeof m.expire !== "string" || m.expire < o.today) { skipped.push({ id: m.id, reason: "這封信過期了" }); continue; }
    if (P.mailSeen && P.mailSeen[m.id]) { done.push({ id: m.id, stale: true }); continue; }
    sendMail(P, m, o.today);
    const copy = P.mail[P.mail.length - 1];
    copy.sent = m.sent || o.today; copy.expire = m.expire; // 照信上寫的日期，不是領的那天
    const r = claimMail(P, m.id, o.today);
    if (!r.ok) { P.mail.pop(); delete P.mailSeen[m.id]; skipped.push({ id: m.id, reason: r.reason }); continue; } // 放不進去：信留著
    done.push({ id: m.id, gift: r.gift });
    events.push(...(r.events || []));
    total.insp += r.gift.insp || 0; total.mood += r.gift.mood || 0; total.pepes += r.gift.pepe ? 1 : 0; total.n++;
  }
  return { ok: true, done, skipped, events, total };
}
// 信給畫面看的樣子（資料庫裡多的欄位不給；壞掉的回 null）
export function mailRow(m) {
  if (!m || typeof m.id !== "string" || typeof m.expire !== "string") return null;
  const g = m.gift || {};
  return { id: m.id, from: String(m.from || "館友"), title: String(m.title || ""), note: String(m.note || ""), gift: { insp: g.insp || 0, mood: g.mood || 0, pepe: g.pepe || null }, sent: String(m.sent || ""), expire: m.expire, claimed: !!m.claimed };
}
