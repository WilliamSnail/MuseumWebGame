// ================================================================
//  實況和斗內（舊 Discord 21 點的玩法，決定 0053）
//  舊的：說「我要實況」就變成全服唯一的實況主；別人說「我要斗內」，隨機給 2 萬～26 萬籌碼（10000 + 10000×1～25），公開說「感謝 ○○ 的斗內」。金額是隨機的，自己不能選，這是好笑的地方。
//  新的：全館一次一位，別人正在播就不能搶；播 NUM.casino.live.durationMs（預設 1 小時）自動下播，本人也能下播；
//       實況主離線（關掉遊戲）超過 graceMs 也算下播；斗內的錢從自己扣、進實況主的錢包（不經過莊家），一人一天 perDay 次，實況主一天最多收 receiveCap。
//  這個檔是純函式，不碰網路、DOM、req：伺服器（functions/casino.js）用，之後 Discord 接開播和斗內也用同一份。時間、亂數、在線狀態都從參數來。
//  實況主的狀態（st）：{ v, uid, nick, since, until, seq, msg }；uid 是 null 就是沒人在播。seq 每次改動加一（Realtime Database 的鏡像靠它擋掉舊的）；
//    msg 是最近一則感謝 { id, at, from, to, toUid, n }。st 整份會鏡像到 Realtime Database 的 casinoLive（館友讀得到），所以裡面只有暱稱和 uid。
//  錢包欄位 lv：{ day, n 今天斗內幾次, sent 今天斗內出去多少, got 今天收了多少, sentAll、gotAll、times 累計 }；舊錢包沒有，這裡補。
//  文字界線：只顯示遊戲暱稱；不公開誰沒錢（「你才沒那麼有錢」只回給按的那個人）。
// ================================================================
import { NUM } from "./config.js";
import { casFill, casNum } from "./casino.js";
import { casShortName } from "./casino_wallet.js";
import { CAS_LIVE } from "./casino_text.js";
import { RNG } from "./logic.js";

const lvBox = v => !!v && typeof v === "object" && !Array.isArray(v);
const lvNum = (v, d = 0) => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : d);
const UID_OK = /^[A-Za-z0-9_-]{1,128}$/;
// 顯示用的暱稱：清掉怪字、最多 12 個字；空的就叫館友
export const liveName = s => casShortName(s) || "館友";

// ---------- 實況主的狀態 ----------
export const liveNew = () => ({ v: 1, uid: null, nick: "", since: 0, until: 0, seq: 0, msg: null });
function msgFix(m) {
  if (!lvBox(m) || !Number.isFinite(+m.id) || !Number.isFinite(+m.n) || +m.n <= 0) return null;
  return { id: Math.floor(+m.id), at: lvNum(m.at), from: liveName(m.from), to: liveName(m.to), toUid: typeof m.toUid === "string" && UID_OK.test(m.toUid) ? m.toUid : null, n: Math.floor(+m.n) };
}
// 讀回來的狀態（Firestore 的、Realtime Database 的都走這裡）：壞資料、缺欄位都當沒人在播，不丟錯
export function liveFix(raw) {
  const st = liveNew();
  if (!lvBox(raw)) return st;
  st.seq = lvNum(raw.seq);
  st.msg = msgFix(raw.msg);
  if (typeof raw.uid === "string" && UID_OK.test(raw.uid) && Number.isFinite(+raw.until) && +raw.until > 0) {
    st.uid = raw.uid; st.nick = liveName(raw.nick); st.since = lvNum(raw.since); st.until = Math.floor(+raw.until);
  }
  return st;
}
// 鏡像到 Realtime Database 的樣子：不放 null（Realtime Database 沒有 null），沒人在播就沒有 uid
export function liveNode(st) {
  const s = liveFix(st), out = { seq: s.seq };
  if (s.uid) Object.assign(out, { uid: s.uid, nick: s.nick, since: s.since, until: s.until });
  if (s.msg) {
    out.msg = { id: s.msg.id, at: s.msg.at, from: s.msg.from, to: s.msg.to, n: s.msg.n };
    if (s.msg.toUid) out.msg.toUid = s.msg.toUid;
  }
  return out;
}
// 實況主離線太久了嗎：presence 是 { state, at }（Realtime Database 的 status/{uid}，at 是伺服器的毫秒）。沒有資料（不知道）不算離線
export function livePresenceGone(presence, now) {
  const C = NUM.casino.live;
  if (!lvBox(presence) || presence.state !== "offline" || !Number.isFinite(+presence.at)) return false;
  return now - +presence.at > C.graceMs;
}
// 現在有人在播嗎：有實況主、還沒到期、他沒有離線太久
export function liveActive(st, now, presence) {
  const s = liveFix(st);
  return !!s.uid && now < s.until && !livePresenceGone(presence, now);
}
// 畫面要的：現在有沒有人在播（到期、離線太久都算沒有）、是誰、到幾點、是不是我、最近一則感謝
export function liveView(st, now, presence, uid) {
  const s = liveFix(st), on = liveActive(s, now, presence);
  return { on, uid: on ? s.uid : null, nick: on ? s.nick : "", until: on ? s.until : 0, mine: on && s.uid === uid, msg: s.msg };
}
// 開播。回傳 { ok, reason?, st }（st 是新狀態；失敗時 st 是原樣）
export function liveStart(st, who, now, presence) {
  const C = NUM.casino.live, s = liveFix(st);
  if (!who || typeof who.uid !== "string" || !UID_OK.test(who.uid)) return { ok: false, reason: CAS_LIVE.noWho, st: s };
  if (liveActive(s, now, presence)) return { ok: false, reason: s.uid === who.uid ? CAS_LIVE.already : casFill(CAS_LIVE.taken, { name: s.nick }), st: s };
  const n = Object.assign({}, s, { uid: who.uid, nick: liveName(who.nick), since: now, until: now + C.durationMs, seq: s.seq + 1 });
  return { ok: true, st: n };
}
// 下播：只有現在的實況主自己。已經到期、離線太久的，本人按也算下播成功（清乾淨）
export function liveStop(st, uid) {
  const s = liveFix(st);
  if (!s.uid || s.uid !== uid) return { ok: false, reason: CAS_LIVE.notYou, st: s };
  return { ok: true, st: Object.assign({}, s, { uid: null, nick: "", since: 0, until: 0, seq: s.seq + 1 }) };
}

// ---------- 斗內 ----------
// 隨機金額：base + step×k，k 是 1～kMax 的整數（預設 2 萬～26 萬）
export function liveRoll(rnd = RNG) {
  const C = NUM.casino.live, r = typeof rnd === "function" ? +rnd() : 0;
  const k = 1 + Math.min(C.kMax - 1, Math.max(0, Math.floor((Number.isFinite(r) ? r : 0) * C.kMax)));
  return C.base + C.step * k;
}
// 補欄位、換日歸零（壞資料也不丟錯）
export function liveWalletFix(w, day) {
  if (!lvBox(w.lv)) w.lv = { day, n: 0, sent: 0, got: 0, sentAll: 0, gotAll: 0, times: 0 };
  const v = w.lv;
  if (v.day !== day) { v.day = day; v.n = 0; v.sent = 0; v.got = 0; }
  for (const k of ["n", "sent", "got", "sentAll", "gotAll", "times"]) v[k] = lvNum(v[k]);
  return v;
}
// 畫面要的（這個人今天的）：斗內還剩幾次、今天斗內出去多少、今天收了多少、收款上限
export function liveMyView(w, day) {
  const C = NUM.casino.live, v = liveWalletFix(w, day);
  return { left: Math.max(0, C.perDay - v.n), perDay: C.perDay, sent: v.sent, got: v.got, cap: C.receiveCap, min: C.base + C.step, max: C.base + C.step * C.kMax };
}
// 斗內一次。donor：{ uid, nick, w }（w 是錢包）；sw：實況主的錢包（沒有錢包的人，呼叫的人先 casWalletFix(null, day)，就有開場籌碼，不會蓋掉）。
// 成功：改 donor.w、sw，回傳 { ok:true, n, from, to, line, st }（st 是新狀態，msg 是這則感謝）；失敗：什麼都不改，回傳 { ok:false, reason }
// 守恆：donor 少 n、sw 多 n，沒有別的錢進出（不經過莊家）
export function liveDonate(st, donor, sw, day, now, presence, rnd = RNG) {
  const C = NUM.casino.live, s = liveFix(st);
  if (!donor || !donor.w || !sw) return { ok: false, reason: CAS_LIVE.noWho };
  if (!liveActive(s, now, presence)) return { ok: false, reason: CAS_LIVE.noOne };
  if (donor.uid === s.uid) return { ok: false, reason: CAS_LIVE.self };
  const dv = liveWalletFix(donor.w, day), sv = liveWalletFix(sw, day);
  if (dv.n >= C.perDay) return { ok: false, reason: CAS_LIVE.limit };
  const n = liveRoll(rnd);
  if (sv.got + n > C.receiveCap) return { ok: false, reason: CAS_LIVE.full };
  if (donor.w.chips < n) return { ok: false, reason: CAS_LIVE.poor };
  donor.w.chips -= n; sw.chips += n;
  dv.n++; dv.sent += n; dv.sentAll += n; dv.times++;
  sv.got += n; sv.gotAll += n;
  if (sw.st) sw.st.chipsMax = Math.max(lvNum(sw.st.chipsMax), sw.chips);
  const seq = s.seq + 1, from = liveName(donor.nick);
  const msg = { id: seq, at: now, from, to: s.nick, toUid: s.uid, n };
  return { ok: true, n, from, to: s.nick, line: casFill(CAS_LIVE.thanks, { from, n: casNum(n) }), st: Object.assign({}, s, { seq, msg }) };
}
