// ================================================================
//  招領：在地下遇到別的館友以前理智歸零的參觀者
//  翊文 11-13：「理智歸零的參觀者 遇到時不要叫幽靈好了，這代表變成鬼了，用另一種更符合故事的方法」。
//  規劃 docs/銀行特展老主顧招領規劃.md 第四節：理智歸零的人沒有變成鬼，是沒有走出去。
//  登記簿上還有他的名字，他的號碼牌留在館裡，等人認領。
//
//  流程：
//    1. 伺服器（functions/lostfound.js 的 lostSync）讀館友的存檔，把最近 NUM.lost.days 天理智歸零的參觀者做成公開的招領單，
//       放在 Realtime Database 的 lostFound/{id}（館友讀得到，只有伺服器寫得動）。
//    2. 別的館友走地下，每壹層第壹次進房間擲壹次，NUM.lost.meetPct% 會遇到壹張（web/src/ui_lost.js）。
//    3. 三個選項：
//       送到招領處（lostReturn，伺服器）：原本的館友信箱收到壹封信、心情 +ownerMood；送的人 +finderInsp 靈感。壹張只能送回去壹次。
//       唸出登記簿上的名字（畫面自己做）：理智檢定 readSan，看到他那壹行紀錄。
//       放著：什麼都沒有。
//  公開的只有館友暱稱、參觀者的名字、職業、在哪壹層、做了幾隻、哪壹天：不放 email、不放整份存檔。
//  純函式：不碰資料庫、不碰 DOM。
// ================================================================
import { NUM } from "./config.js";
import { addDays, isFree } from "./logic.js";
import { jobInfo } from "./logic3.js";

export const LOST_TEXT = {
  thing: "號碼牌",
  see: "地上有壹張招領單，夾著壹張{thing}。上面寫：{owner}館的第 {n} 位參觀者，{name}{job}。",
  back: "這張已經有人送到招領處了。",
  ret: "送到招領處",
  retWhy: "+{insp} 靈感；{owner}館的信箱會收到壹封信",
  read: "唸出登記簿上的名字",
  readWhy: "要擲理智",
  leave: "放著",
  leaveLine: "你把招領單放回原位。帳上還是多了壹行。",
  record: "登記簿上那壹行：{d} 理智用完。{made}{where}名字後面沒有寫離館的時間。",
  made: "做了 {n} 隻佩佩，",
  where: "最後在 B{floor}。",
  whereHall: "最後在館裡。",
  retLine: "你把號碼牌送到招領處。櫃台的人在本子上補了壹行，沒有抬頭。（+{insp} 靈感）",
  retFull: "你把號碼牌送到招領處。櫃台的人在本子上補了壹行。（今天送回去的靈感拿滿了）",
  mailTitle: "招領處：有人送回了壹張號碼牌",
  mailNote: "{finder} 在地下撿到你以前的參觀者{name}（第 {n} 位）留下的號碼牌，送到招領處了。登記簿上那壹行，終於有人看過。",
  self: "這是你自己館裡的，不能送。",
  gone: "這張招領單不見了。",
  done: "這張已經有人送回去了。",
  old: "這張招領單太舊了，招領處已經收起來了。",
};

// 招領單的編號：館友的 uid＋第幾位參觀者（壹位參觀者只有壹張）
export const lostId = (uid, n) => `${uid}_${n}`;
// 在哪壹層用完理智：P.visit.where 是 "cellar:3..." 這種；不是在地下就是 null（在館裡）
export function lostFloor(where, deepest) {
  const m = /^cellar:(\d)/.exec(String(where || ""));
  return m ? +m[1] : null;
}
// 從存檔找出最近理智歸零的參觀者，做成公開的招領單（伺服器叫）。today ＝台灣的今天
export function lostCards(save, uid, nick, today) {
  const P = save && save.profiles && save.profiles.challenge;
  if (!P || !uid || !today) return [];
  const L = NUM.lost, from = addDays(today, -(L.days - 1));
  return (Array.isArray(P.history) ? P.history : [])
    .filter(x => x && x.endedBy === "russia8" && typeof x.d === "string" && x.d >= from && x.d <= today && Number.isFinite(+x.n))
    .map(x => ({
      id: lostId(uid, +x.n), owner: uid, ownerNick: String(nick || "館友").slice(0, 12), n: +x.n,
      name: String(x.name || "").slice(0, 12), job: x.job ? String((jobInfo(x.job) || {}).name || "").slice(0, 12) : "",
      floor: lostFloor(x.where, x.deepest), made: Number.isFinite(+x.madeThis) ? +x.madeThis : null, d: x.d,
    }))
    .slice(0, L.perOwner); // 壹個館友最多 perOwner 張（最新的）：故意壹直歸零也不會多出招領單（翊文 11-13：「不能讓玩家用一直歸零來刷」）
}
// 這張招領單現在還能不能遇到：不是自己的、還在 days 天內、還沒送回去、這位參觀者還沒看過
export function lostOpen(c, me, today, seen) {
  if (!c || typeof c !== "object" || !c.id || !c.d) return false;
  if (c.owner === me || c.back) return false;
  if (c.d < addDays(today, -(NUM.lost.days - 1))) return false;
  return !(seen && seen[c.id]);
}
const lostFill = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => (o[k] == null ? "" : String(o[k])));
// 畫面上的字
export function lostSeeText(c) {
  return lostFill(LOST_TEXT.see, { thing: LOST_TEXT.thing, owner: c.ownerNick || "館友", n: c.n, name: c.name || "沒有寫名字", job: c.job ? `（${c.job}）` : "" });
}
export function lostRecordText(c) {
  return lostFill(LOST_TEXT.record, {
    d: c.d, made: Number.isFinite(c.made) ? lostFill(LOST_TEXT.made, { n: c.made }) : "",
    where: c.floor ? lostFill(LOST_TEXT.where, { floor: c.floor }) : LOST_TEXT.whereHall,
  });
}
// 參觀者自己記：哪幾張看過了（看過就不會再遇到）。P.lostSeen ＝ { 編號: 哪壹天 }；舊存檔沒有就補壹個空的
export function lostMarkSeen(P, id, today) {
  if (!P || !id) return false;
  if (!P.lostSeen || typeof P.lostSeen !== "object" || Array.isArray(P.lostSeen)) P.lostSeen = {};
  if (P.lostSeen[id]) return false;
  P.lostSeen[id] = today;
  return true;
}
// 送到招領處（伺服器在交易裡叫）。o：{ card（Realtime Database 的那張）, me: { uid, nick }, finderP（送的人的參觀者，會改）, today, mailDays }
// 回傳 { ok, insp, mail（寄給原本館友的信）, line } 或 { ok: false, reason }
export function lostReturnStep(o) {
  const c = o.card, L = NUM.lost;
  if (!c || !c.id) return { ok: false, reason: LOST_TEXT.gone };
  if (c.owner === o.me.uid) return { ok: false, reason: LOST_TEXT.self };
  if (c.back) return { ok: false, reason: LOST_TEXT.done };
  if (c.d < addDays(o.today, -(L.days - 1))) return { ok: false, reason: LOST_TEXT.old };
  const P = o.finderP, free = !P || isFree(P);
  // 送的人壹天最多拿 returnsDay 次靈感（之後還是可以送，信照寄，只是不給靈感）。P.lostDay ＝ { day, n }
  if (P && (!P.lostDay || P.lostDay.day !== o.today)) P.lostDay = { day: o.today, n: 0 };
  const capped = !free && P.lostDay.n >= L.returnsDay;
  const insp = free || capped ? 0 : L.finderInsp;
  if (P && insp) { P.insp = (P.insp || 0) + insp; P.lostDay.n++; }
  if (P) lostMarkSeen(P, c.id, o.today);
  const mail = {
    id: `lost-${c.id}`, from: "招領處", title: LOST_TEXT.mailTitle,
    note: lostFill(LOST_TEXT.mailNote, { finder: String(o.me.nick || "館友").slice(0, 12), name: c.name ? `「${c.name}」` : "", n: c.n }),
    gift: { insp: 0, mood: L.ownerMood }, sent: o.today, expire: addDays(o.today, o.mailDays || 30), claimed: false,
  };
  return { ok: true, insp, mail, line: capped ? LOST_TEXT.retFull : lostFill(LOST_TEXT.retLine, { insp }) };
}
