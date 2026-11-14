// ================================================================
//  館友之間的規則：送佩佩、參觀館友的展廳（多人版 M2，docs/多人實作.md）
//  翊文 11-08：
//    - 館友來參觀你的展廳：每位館友每天第一次來 +2 靈感，一天最多拿 5 次（+10）。按讚、留言不加靈感。
//    - 一天＝台灣時間 05:00 換日（決定 0019）。這裡的「每天」都照這個算，日期由呼叫的人給（伺服器的時間），不信瀏覽器。
//    - 收藏、展廳是博物館的（決定 0018）。只用挑戰模式（profiles.challenge）；自由模式不能送、不能被參觀。
//  後端還沒定（11-08 翊文改成想用 Firebase），所以這裡只放「不管哪一種後端都一樣」的純函式：
//    - 不碰資料庫、不碰網路、不碰 DOM，只改傳進來的 P，回傳結果。
//    - 「同一個交易」由後端負責：sendGift 改好送的人的 P、回傳要寄給對方的信，後端把兩邊一起寫進去。
//  數字在 SOCIAL（之後可以搬進 config.js 的 NUM）。畫面上的字用「壹」。
// ================================================================
import { NUM } from "./config.js";
import { CATS, allOpts, asList, describePepe, fromKey, hallItem, hallScore, isFree, normKey, parsePillowKey, progressEvents, todayStr } from "./logic.js";
import { showPosters } from "./themeshow.js";

export const SOCIAL = {
  visitInsp: 2,     // 館友今天第一次來參觀，展廳主人拿幾點靈感
  visitInspMax: 5,  // 展廳主人一天最多拿幾次（5 次＝+10）
  noteMax: 50,      // 留言最多幾個字
  notesShown: 10,   // 展廳上顯示最近幾則留言
  mailDays: 30,     // 信寄到之後幾天沒領就不見（照台灣日期）
  // 幾點換日、台灣是 UTC 幾：11-09 搬到 logic.js（DAY_START_HOUR、TZ_HOURS），全部共用一份
};

// ---------- 台灣時間 05:00 換日的「今天」 ----------
// taipeiDay(毫秒) 11-09 搬到 logic.js（todayStr 也用它，全部共用一份）。這個檔的函式不自己算日期：today 由呼叫的人給（伺服器用 taipeiDay(自己的時間)），不信瀏覽器
// "YYYY-MM-DD" 往後 n 天（用 UTC 算，不受電腦的時區影響）
export function dayPlus(day, n) {
  const [y, m, d] = String(day).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// ---------- 展廳給別人看的那一小部分 ----------
// save：整份存檔。只回傳畫展廳要的：展台上的作品、分數、主題。不給收藏、靈感、理智這些。
// 沒有挑戰模式（只有自由模式、還沒開始）：{ open: false }，畫面寫「還沒開館」
// 每個展台：null，或 { kind, key, perfect, title }（title＝融合取的名字）；抱枕多 printPerfect（印的那隻是不是完美作品）
export function hallView(save) {
  const P = save && save.profiles && save.profiles.challenge;
  if (!P || typeof P !== "object" || isFree(P) || !Array.isArray(P.hall)) return { open: false };
  const pepes = P.pepes || {};
  const slots = P.hall.map(s => {
    let it = null;
    try { it = hallItem(P, s); } catch (e) { it = null; }
    if (!it) return null;
    const out = { kind: it.kind, key: it.key, perfect: !!it.perfect, title: null };
    if (it.kind === "pepe" && pepes[it.key] && typeof pepes[it.key].title === "string") out.title = pepes[it.key].title;
    if (it.kind === "pillow") { const pp = parsePillowKey(it.key); out.printPerfect = !!(pp.print && pp.print.kind === "pepe" && (pepes[pp.print.key] || {}).perfect); }
    return out;
  });
  let hs = { score: 0, theme: null, themes: [] };
  try { hs = hallScore(P); } catch (e) { /* 壞掉的存檔：分數當 0 */ }
  const wear = (P.limited && P.limited.wear) || {}; // 簽到拿的展台裝飾、名牌框（11-09，決定 0030）：館友來參觀也看得到
  const hung = P.hallReport && Array.isArray(P.coopReports) ? P.coopReports.find(r => r && r.id === P.hallReport) : null; // 掛在牆上的探險報告（決定 0036）
  return { open: true, art: hallArt(P), slots, score: hs.score || 0, theme: hs.theme || null, themes: (hs.themes || []).slice(), report: hung || null, deco: typeof wear.stand === "string" ? wear.stand : null, frame: typeof wear.frame === "string" ? wear.frame : null, posters: showPosters(P), souvenirs: Array.isArray(P.hallSouvenirs) ? P.hallSouvenirs.slice(0, 6) : [], title: P.casinoTitle && typeof P.casinoTitle === "object" ? P.casinoTitle : null }; // posters：辦完的展覽（決定 0035）；souvenirs、title：賭場的紀念品和稱號（決定 0040，給別人看之前 visit.js 的 cleanHallView 會過濾）
}

// 展廳主人收藏的畫（翊文 11-14：「大家的展廳也可以看到買的畫」「其他人參觀別人展廳時也可以看到」）：只給畫的 id、名字、稀有度、拍賣中與否；
// **不給買價、現價、籌碼、買的日期**（買價是主人的錢的資訊，現價可以算出怎麼賺）。從存檔的 P.art.own 讀，不信存檔以外的東西。稀有的在前、同稀有度照買的日期（舊的在前）
export function hallArt(P) {
  const own = P && P.art && typeof P.art === "object" && P.art.own && typeof P.art.own === "object" && !Array.isArray(P.art.own) ? P.art.own : {};
  return Object.keys(own).filter(id => id !== "__proto__" && own[id] && typeof own[id] === "object").map(id => ({ id: String(id).slice(0, 60), title: String(own[id].title || "").slice(0, 40), tier: Math.max(0, Math.min(3, Math.floor(+own[id].tier) || 0)), auction: !!own[id].lock, d: String(own[id].d || own[id].date || "") }))
    .sort((a, b) => b.tier - a.tier || (a.d < b.d ? -1 : a.d > b.d ? 1 : 0) || (a.id < b.id ? -1 : 1)).slice(0, (NUM.art && NUM.art.holdMax) || 20).map(({ id, title, tier, auction }) => ({ id, title, tier, tierName: ((NUM.art.tiers[tier] || {}).name) || "", auction }));
}
// ---------- 來訪、按讚、留言 ----------
// 這次來參觀，展廳主人拿幾點靈感。o：
//   self（參觀自己的）、open（對方開館了沒）、again（這位館友今天已經來過）、paidToday（主人今天已經因為來訪拿過幾次）
export function visitGain(o) {
  if (!o || o.self || !o.open || o.again) return 0;
  return (o.paidToday || 0) < SOCIAL.visitInspMax ? SOCIAL.visitInsp : 0;
}
// 留言：去頭尾空白、連續空白（換行也算）變一個；最多 SOCIAL.noteMax 個字；不能有控制字元、零寬空白這些看不見的字。
// 回傳 { ok: true, text } 或 { ok: false, code, reason }
export function cleanHallNote(s) {
  if (typeof s !== "string") return { ok: false, code: "bad_note", reason: "留言要是壹句話。" };
  const invisible = { ok: false, code: "invisible", reason: "留言裡不能有看不見的字。" };
  const raw = s.normalize("NFC");
  // 先擋格式字元（零寬空白 U+200B、U+FEFF、方向控制 U+202E……）：U+FEFF 在 JS 算空白，先換成空白就擋不到了
  if (/[\p{Cf}\p{Co}\p{Cn}\p{Cs}]/u.test(raw)) return invisible;
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return { ok: false, code: "empty", reason: "先寫壹句話。" };
  if (/\p{C}/u.test(t)) return invisible; // 剩下的控制字元（響鈴 U+0007 這些）
  if ([...t].length > SOCIAL.noteMax) return { ok: false, code: "too_long", reason: `留言最多 ${SOCIAL.noteMax} 個字。` };
  return { ok: true, text: t };
}
// 按讚、留言能不能做。kind："like"｜"note"。s：{ self, open, done（今天在這間按過讚／留過言了） }
// 規則：每天每間一次；自己的不行；還沒開館的不行。回傳 { ok } 或 { ok: false, code, reason }
export function checkHallAct(kind, s) {
  const what = kind === "note" ? "留言" : "按讚";
  if (!s || s.self) return { ok: false, code: "self", reason: `不能在自己的展廳${what}。` };
  if (!s.open) return { ok: false, code: "not_open", reason: "這間展廳還沒開館。" };
  if (s.done) return { ok: false, code: "already", reason: kind === "note" ? "今天在這間留過言了，明天再來。" : "今天按過讚了，明天再來。" };
  return { ok: true };
}

// ---------- 請館友來看我的展廳 ----------
// 沒有獎勵，只是寄一則通知。同一位可以一直請（翊文 11-09）；不能請自己，自己的展廳要開館。
// s：{ self（請的是自己）, open（我的展廳開了沒） }。回傳 { ok } 或 { ok: false, code, reason }
export function checkHallCall(s) {
  if (!s || s.self) return { ok: false, code: "self", reason: "不能請自己。" };
  if (!s.open) return { ok: false, code: "not_open", reason: "你的展廳還沒開館：先用挑戰模式擺幾件作品。" };
  return { ok: true };
}

// ---------- 每週特展給館友比的那一小部分 ----------
// save：整份存檔。只回傳 { open, w（第幾週）, theme, best（這週最高分）, slots }；不改存檔（不像 weeklyState 會換週）。
// 沒有挑戰模式：{ open: false }。有挑戰模式但這週還沒擺過：w 是 null。slots 的格式跟 hallView 一樣（沒有名字）
export function weeklyView(save) {
  const P = save && save.profiles && save.profiles.challenge;
  if (!P || typeof P !== "object" || isFree(P) || !Array.isArray(P.hall)) return { open: false }; // hallView 一樣：沒開館的存檔
  const W = P.weekly;
  if (!W || typeof W !== "object" || !Array.isArray(W.slots)) return { open: true, w: null, theme: null, best: 0, slots: [] };
  const slots = W.slots.map(s => {
    let it = null;
    try { it = hallItem(P, s); } catch (e) { it = null; }
    return it ? { kind: it.kind, key: it.key, perfect: !!it.perfect, title: null } : null;
  });
  return { open: true, w: W.w, theme: typeof W.theme === "string" ? W.theme : null, best: +W.best || 0, slots };
}

// ---------- 送佩佩：能不能送、拿出來、放進去 ----------
// 能送的：佩佩、失敗作、修復品（抱枕不是佩佩，不能送）
export const GIFT_KINDS = ["pepe", "failed", "repaired"];

// key 是不是真的壹種佩佩：每壹類都是遊戲裡有的選項（從信裡讀出來的不能相信；舊名字先用 normKey 換成新的）
export function giftKeyOk(key) {
  if (typeof key !== "string" || key.length > 200) return false;
  const p = fromKey(normKey(key));
  return !!p && CATS.every(c => allOpts(c).includes(p[c]));
}
// 收藏裡這一種有幾隻
export function giftCount(P, kind, key) {
  if (!P || typeof key !== "string") return 0;
  if (kind === "pepe") { const e = (P.pepes || {})[key]; return e ? Math.max(1, e.n || 1) : 0; }
  if (kind === "failed") return Math.max(0, (P.failed || {})[key] || 0);
  if (kind === "repaired") return Math.max(0, (P.repaired || {})[key] || 0);
  return 0;
}
// 這一種現在用在哪裡：展台（P.hall）、每週特展（P.weekly.slots）、正在走的地下（現在這位的 P.cellar.run，和不在場那幾位的 cellarRun，決定 0018）
export function giftUses(P, kind, key) {
  const same = s => !!s && s.kind === kind && s.key === key;
  const runs = [P.cellar && P.cellar.run].concat(asList(P.visitors).map(v => v && v.cellarRun)).filter(Boolean);
  return {
    hall: asList(P.hall).filter(same).length,
    weekly: asList(P.weekly && P.weekly.slots).filter(same).length,
    cellar: kind === "pepe" ? runs.filter(r => asList(r.team).includes(key)).length : 0,
  };
}
// 能不能送。item：{ kind, key }。回傳 { ok: true, count, perfect（送出去的那隻是不是完美作品）, last（是不是最後壹隻） } 或 { ok: false, code, reason }
//   - 受傷的、正在地下收藏庫的：不能送。
//   - 擺在展台（或每週特展）上的：只有這壹隻就不能送；同壹種有兩隻以上，可以送多的那隻。
//   - 完美作品：同壹種有兩隻以上時，送出去的是普通的那隻，完美的留在自己這裡；只有壹隻就整隻送出去（完美也跟著走）。
export function canGive(P, item) {
  if (!P || typeof P !== "object") return { ok: false, code: "no_museum", reason: "還沒開館。" };
  if (isFree(P)) return { ok: false, code: "free", reason: "自由模式不能送佩佩。" };
  if (!item || !GIFT_KINDS.includes(item.kind)) return { ok: false, code: "bad_kind", reason: "只能送佩佩、失敗作、修復品。" };
  if (!giftKeyOk(item.key)) return { ok: false, code: "bad_key", reason: "看不懂這是哪壹隻。" };
  const count = giftCount(P, item.kind, item.key);
  if (!count) return { ok: false, code: "missing", reason: "收藏裡沒有這隻。" };
  if (item.kind === "pepe" && P.injured && P.injured[item.key]) return { ok: false, code: "injured", reason: "牠受傷了，等牠好了再送。" };
  const use = giftUses(P, item.kind, item.key);
  if (use.cellar) return { ok: false, code: "in_cellar", reason: "牠正在地下收藏庫，回來之後再送。" };
  if ((use.hall || use.weekly) && count < 2) return { ok: false, code: "on_show", reason: "牠擺在展台上：先拿下來再送。" };
  const e = item.kind === "pepe" ? P.pepes[item.key] : null;
  return { ok: true, count, perfect: !!(e && e.perfect && count === 1), last: count === 1 };
}
// 從收藏拿出壹隻（送的人那邊）。回傳 { ok: true, gift: { kind, key, perfect, title } } 或 canGive 的失敗
// 最後壹隻送出去，收藏（和圖鑑）就沒有這隻了。
export function takeGift(P, item) {
  const can = canGive(P, item);
  if (!can.ok) return can;
  const { kind, key } = item;
  let title = null;
  if (kind === "pepe") {
    const e = P.pepes[key];
    title = typeof e.title === "string" ? e.title : null;
    if (can.last) delete P.pepes[key];
    else e.n = can.count - 1;
  } else {
    const box = kind === "failed" ? P.failed : P.repaired;
    box[key] = can.count - 1;
    if (box[key] <= 0) delete box[key];
  }
  return { ok: true, gift: { kind, key, perfect: can.perfect, title } };
}
// 檢查壹件禮物（從信裡讀出來的，不能相信）：格式對才回傳整理好的 { kind, key, perfect, title }，不然 null
export function cleanGiftItem(g) {
  if (!g || typeof g !== "object" || !GIFT_KINDS.includes(g.kind) || !giftKeyOk(g.key)) return null;
  const key = normKey(g.key);
  const title = typeof g.title === "string" && g.title.length <= 40 ? g.title : null;
  return { kind: g.kind, key, perfect: g.kind === "pepe" && !!g.perfect, title: g.kind === "pepe" ? title : null };
}
// 把壹隻放進收藏（收到的人那邊，領信的時候）。today：今天的日期（台灣時間 05:00 換日；不給就用 todayStr()）
// 回傳 { ok: true, kind, key, isNew, events（徽章、解鎖） } 或 { ok: false, code, reason }
export function putGift(P, gift, today) {
  if (!P || typeof P !== "object") return { ok: false, code: "no_museum", reason: "還沒開館。" };
  if (isFree(P)) return { ok: false, code: "free", reason: "自由模式收不了佩佩：回挑戰模式再領。" };
  const g = cleanGiftItem(gift);
  if (!g) return { ok: false, code: "bad_gift", reason: "這份禮物壞掉了。" };
  ["pepes", "failed", "repaired"].forEach(k => { if (!P[k] || typeof P[k] !== "object") P[k] = {}; });
  let isNew;
  if (g.kind === "pepe") {
    const e = P.pepes[g.key];
    isNew = !e;
    if (e) { e.n = (e.n || 1) + 1; if (g.perfect) e.perfect = true; if (g.title && !e.title) e.title = g.title; }
    else P.pepes[g.key] = Object.assign({ n: 1, perfect: g.perfect, s: (P.serial = (P.serial || 0) + 1), d: today || todayStr(), gift: true }, g.title ? { title: g.title } : {});
  } else {
    const box = g.kind === "failed" ? P.failed : P.repaired;
    isNew = !box[g.key];
    box[g.key] = (box[g.key] || 0) + 1;
  }
  let events = [];
  try { events = progressEvents(P); } catch (e) { events = []; }
  return { ok: true, kind: g.kind, key: g.key, isNew, events };
}
// 禮物寫成字：「「小綠」開心的綠佩佩（完美作品）」「開心的綠佩佩（失敗作）」
export function giftItemText(g) {
  const it = cleanGiftItem(g);
  if (!it) return "壹隻看不清楚的佩佩";
  const d = describePepe(fromKey(it.key), { failed: it.kind === "failed" });
  const name = (it.title ? `「${it.title}」` : "") + d.title;
  return name + (it.kind === "failed" ? "（失敗作）" : it.kind === "repaired" ? "（修復品）" : it.perfect ? "（完美作品）" : "");
}

// ---------- 信（格式照 shared/mailbox.js：id、from、title、note、gift、sent、expire、claimed） ----------
// 寄信的人的暱稱是玩家打的字：畫面上壹律當純文字顯示。
// 送佩佩的信：gift.pepe 是那隻
export function giftMail({ id, fromNick, gift, today }) {
  const pepe = cleanGiftItem(gift);
  return { id: String(id), from: String(fromNick || "館友"), title: `${fromNick || "館友"}送你壹隻佩佩`, note: pepe ? giftItemText(pepe) : "",
    gift: { insp: 0, mood: 0, pepe }, sent: today, expire: dayPlus(today, SOCIAL.mailDays), claimed: false };
}
// 館友來訪的信：附來訪的靈感（visitGain 算的）
export function visitMail({ id, fromNick, insp, today }) {
  return { id: String(id), from: String(fromNick || "館友"), title: `${fromNick || "館友"}來參觀你的展廳`, note: "館友來訪的謝禮",
    gift: { insp: Math.max(0, insp || 0), mood: 0, pepe: null }, sent: today, expire: dayPlus(today, SOCIAL.mailDays), claimed: false };
}
// 送佩佩，送的人那邊整件事：從 P 拿出壹隻、做好要寄給對方的信。
// 後端要在「同壹個交易」裡：寫回送的人的存檔＋把 mail 放進對方的信箱。兩個都成功才算，壹個失敗就都不算。
// o：{ id（信的編號，後端給、不能重複）, fromNick, today（台灣日期，taipeiDay） }。回傳 { ok: true, gift, mail } 或失敗
export function sendGift(P, item, o) {
  const r = takeGift(P, item);
  if (!r.ok) return r;
  return { ok: true, gift: r.gift, mail: giftMail({ id: o.id, fromNick: o.fromNick, gift: r.gift, today: o.today }) };
}
