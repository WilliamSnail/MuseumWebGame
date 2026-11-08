// ================================================================
//  信箱（翊文 11-08：「公佈欄和信箱」）
//  公告負責「說」，信箱負責「給」（規劃第四節「館內公佈欄」）：獎勵、補償、之後館友送的東西都寄到這裡。
//  第 4 版先只有館方寄的（公告附的獎勵）；有伺服器之後，館友送的、活動獎勵也從伺服器寄來（格式不變）。
//  信存在參觀者身上：P.mail（陣列）、P.mailSeen（寄過哪些，一個 id 只寄一次）。
//  日期用真的日曆（realTodayStr），不是遊戲裡的一天：不然玩 15 分鐘一天，30 天的期限半天就到了。
//  11-08（多人版 M2）：附件多一種「佩佩」gift.pepe（館友送的，格式見 shared/gifts.js 的 cleanGiftItem）。領的時候用 putGift 放進收藏。
// ================================================================
import { addDays, isFree } from "./logic.js";
import { cleanGiftItem, giftItemText, putGift } from "./gifts.js";

export const MAIL_DAYS = 30; // 寄到之後幾天沒領就不見

function ensure(P) {
  if (!Array.isArray(P.mail)) P.mail = [];
  if (!P.mailSeen || typeof P.mailSeen !== "object") P.mailSeen = {};
}

// 把公告附的獎勵寄進信箱（每個 gift.id 只寄一次）。回傳這次新寄了幾封。
export function syncMail(P, notices, today) {
  ensure(P);
  let added = 0;
  for (const n of notices) {
    const g = n.gift;
    if (!g || P.mailSeen[g.id]) continue;
    P.mailSeen[g.id] = true;
    P.mail.push({ id: g.id, from: "館方", title: g.title, note: `附在公告「${n.title}」`, gift: { insp: g.insp || 0, mood: g.mood || 0 }, sent: today, expire: addDays(today, MAIL_DAYS), claimed: false });
    added++;
  }
  return added;
}

// 寄一封信（之後伺服器、活動用；也可以給補償用）
export function sendMail(P, m, today) {
  ensure(P);
  if (P.mailSeen[m.id]) return false;
  P.mailSeen[m.id] = true;
  const gift = { insp: (m.gift && m.gift.insp) || 0, mood: (m.gift && m.gift.mood) || 0 };
  const pepe = cleanGiftItem(m.gift && m.gift.pepe); // 館友送的佩佩（壞掉的就不附）
  if (pepe) gift.pepe = pepe;
  P.mail.push({ id: m.id, from: m.from || "館方", title: m.title, note: m.note || "", gift, sent: today, expire: addDays(today, m.days || MAIL_DAYS), claimed: false });
  return true;
}

// 過期的拿掉（領過的也一起拿掉）
export function pruneMail(P, today) { ensure(P); P.mail = P.mail.filter(m => m.expire >= today); }

// 現在信箱裡的信：還沒領的在前，再照寄來的日期新的在前
export function mailList(P, today) {
  ensure(P);
  return P.mail.filter(m => m.expire >= today).sort((a, b) => (a.claimed - b.claimed) || b.sent.localeCompare(a.sent));
}
export function unclaimedCount(P, today) { return mailList(P, today).filter(m => !m.claimed).length; }
export function daysLeft(m, today) {
  const f = s => { const [y, mo, d] = s.split("-").map(Number); return Date.UTC(y, mo - 1, d); };
  return Math.max(0, Math.round((f(m.expire) - f(today)) / 86400000));
}

// 這封信的禮物寫成字：「靈感 +10、心情 +5」；附佩佩的：「壹隻佩佩：開心的綠佩佩」；全部領取加起來的：「佩佩 2 隻」
export function giftText(g) {
  const out = [];
  if (g && g.pepe) out.push(`壹隻佩佩：${giftItemText(g.pepe)}`);
  if (g && g.pepes) out.push(`佩佩 ${g.pepes} 隻`);
  if (g && g.insp) out.push(`靈感 +${g.insp}`);
  if (g && g.mood) out.push(`心情 +${g.mood}`);
  return out.join("、");
}

// 領一封
export function claimMail(P, id, today) {
  ensure(P);
  const m = P.mail.find(x => x.id === id);
  if (!m) return { ok: false, reason: "找不到這封信" };
  if (m.claimed) return { ok: false, reason: "已經領過了" };
  if (m.expire < today) return { ok: false, reason: "這封信過期了" };
  const free = isFree(P);
  // 附佩佩的：先放進收藏，放不進去（自由模式、禮物壞掉）就不算領，信留著
  const put = m.gift && m.gift.pepe ? putGift(P, m.gift.pepe) : null;
  if (put && !put.ok) return { ok: false, reason: put.reason };
  m.claimed = true;
  if (!free) {
    P.insp = (P.insp || 0) + (m.gift.insp || 0);
    P.mood = Math.max(0, Math.min(99, (P.mood || 0) + (m.gift.mood || 0)));
  }
  return { ok: true, gift: free ? { insp: 0, mood: 0 } : Object.assign({}, m.gift), free, events: put ? put.events : [] };
}

// 全部領取：回傳加起來拿到多少（pepes＝領到幾隻佩佩）
export function claimAllMail(P, today) {
  const total = { insp: 0, mood: 0, n: 0, pepes: 0 };
  for (const m of mailList(P, today).filter(x => !x.claimed)) {
    const r = claimMail(P, m.id, today);
    if (r.ok) { total.insp += r.gift.insp || 0; total.mood += r.gift.mood || 0; total.pepes += r.gift.pepe ? 1 : 0; total.n++; }
  }
  return total;
}
