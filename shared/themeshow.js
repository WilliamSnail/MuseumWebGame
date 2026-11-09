// ================================================================
//  主題展辦完：拿心情、靈感、限定配件、策展手記、展覽海報（決定 0035，docs/每週劇情.md 第十節）
//  翊文 11-09：「展廳的 評分 +10～+20 這些，目前好像還沒什麼用處，有沒有能讓他更有遊戲性，
//             比如主題展辦完了會獲得新的限定帽子或首飾等等的，再加相對應的劇情?」
//
//  規則（數字都在 config.js 的 NUM.show）：
//    - 「辦完」：展廳牆上的主題（hallScore 的 theme，加分最高的那個）連續掛 NUM.show.days 天，分數到銅以上。
//      掛上那天算第 1 天，05:00 換日。不用每天上線：不在的時候展覽照樣開著，回來才結算。
//    - 中間換掉就重算。只有一個例外：同一天之內換回來，接著算（把一隻拿下來再放回去不會白等）。
//    - 分數看結算那一刻（第 3 天第一次打開的時候）。第 3 天分數不夠：不算辦完，等分數到了馬上結算。
//    - 三級：銅給心情、銀給靈感、金給限定配件，策展手記銅就讀得到。每一級每個主題只給一次：
//      第一次就到金，三樣一起給；之後掛著再辦一場（又是 3 天）可以往上拿。到金之後不再結算。
//    - 每週特展：換週時照上週的最高分，到金就拿那週特展的限定配件（有做配件的週才有）。
//
//  存檔：P.themeShow（博物館的，換參觀者不會跟著換）
//    { v, cur: { theme, from }（現在這一場：第 1 天是哪天）, prev: { theme, from, off }（今天換掉的那一場，今天換回來接著算）,
//      done: { 主題: { tier: 1～3, score: 最高分, date: 拿到現在這一級的那天, runs: 辦完幾場 } },
//      weeks: { 週的號碼: { theme, best, gold, item, dup, date } }, read: { 主題: 讀完手記的那天 },
//      pending: [還沒演給玩家看的事件], hinted: 今天提示過「再 1 天」的那天 }
//  只在挑戰模式。自由模式沒有展期，限定配件本來就都打開了。
//  文字（手記、配件的名字以外的字）放這個檔最下面，是草稿，Yuga 可以改；配件的名字在 content3.js 的 LIMITED_TEXT。
//  介面上的字照第 1 代用「壹」。
// ================================================================
import { HALL_THEME_BONUS, LIMITED_ITEMS, NUM } from "./config.js";
import { clampN, daysBetween, hallScore, isFree } from "./logic.js";
import { weeklyState } from "./logic3.js";
import { grantLimited } from "./signin.js";

const isShowDate = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isShowBox = v => !!v && typeof v === "object" && !Array.isArray(v);
const isShowTheme = t => typeof t === "string" && Object.prototype.hasOwnProperty.call(HALL_THEME_BONUS, t);
const showRunOf = r => (isShowBox(r) && isShowTheme(r.theme) && isShowDate(r.from) ? r : null);

export const SHOW_VERSION = 1;
export const SHOW_TIER_NAME = ["", "銅", "銀", "金"];
// 手記、畫面照這個順序列（跟 themeProgress 差不多：先是心情，再來是別的）
export const SHOW_THEMES = ["legend", "angry", "tears", "russia8", "rainbow", "hats", "pillows", "joy", "flat", "failed"];

// ---------- 存檔 ----------
export function newShow() { return { v: SHOW_VERSION, cur: null, prev: null, done: {}, weeks: {}, read: {}, pending: [], hinted: null }; }
// 舊存檔沒有、或壞掉的：補成空的；認得的留著
export function fixShow(b) {
  const out = newShow();
  if (!isShowBox(b)) return out;
  const cur = showRunOf(b.cur), prev = showRunOf(b.prev);
  if (cur) out.cur = { theme: cur.theme, from: cur.from };
  if (prev && isShowDate(prev.off)) out.prev = { theme: prev.theme, from: prev.from, off: prev.off };
  if (isShowBox(b.done)) Object.entries(b.done).forEach(([t, d]) => {
    if (isShowTheme(t) && isShowBox(d) && [1, 2, 3].includes(d.tier)) out.done[t] = { tier: d.tier, score: Number.isFinite(d.score) ? d.score : 0, date: isShowDate(d.date) ? d.date : null, runs: Number.isInteger(d.runs) && d.runs > 0 ? d.runs : 1 };
  });
  if (isShowBox(b.weeks)) Object.entries(b.weeks).forEach(([w, x]) => { if (/^-?\d+$/.test(w) && isShowBox(x)) out.weeks[w] = x; });
  if (isShowBox(b.read)) Object.entries(b.read).forEach(([t, d]) => { if (isShowTheme(t)) out.read[t] = isShowDate(d) ? d : null; });
  if (Array.isArray(b.pending)) out.pending = b.pending.filter(e => isShowBox(e) && typeof e.type === "string").slice(-20);
  if (isShowDate(b.hinted)) out.hinted = b.hinted;
  return out;
}
export function showBox(P) {
  if (!isShowBox(P.themeShow) || P.themeShow.v !== SHOW_VERSION) P.themeShow = fixShow(P.themeShow);
  return P.themeShow;
}

// ---------- 門檻、配件 ----------
export function showTiers(theme) { return (NUM.show.tiersBy && NUM.show.tiersBy[theme]) || NUM.show.tiers; }
// 幾分是哪一級：0 ＝還不到銅，1 銅、2 銀、3 金
export function tierOfScore(theme, score) { return showTiers(theme).filter(t => score >= t).length; }
export function showItemOf(theme) { return LIMITED_ITEMS.find(x => x.from === "show" && x.theme === theme) || null; }
export function weekItemOf(theme) { return LIMITED_ITEMS.find(x => x.from === "week" && x.theme === theme) || null; }
export function weekGold(theme) { return NUM.show.weekGold[theme] != null ? NUM.show.weekGold[theme] : NUM.show.tiers[2]; }
// 每一級給什麼（畫面列出來用）
export function showRewards(theme) {
  const it = showItemOf(theme);
  return [{ tier: 1, kind: "mood", n: NUM.show.bronzeMood }, { tier: 2, kind: "insp", n: NUM.show.silverInsp }, { tier: 3, kind: "item", id: it ? it.id : null }];
}

// ---------- 現在辦到哪裡（畫面用；不改 P 以外的東西，也不結算） ----------
// { theme, score, day（第幾天，最多到 days）, days, left（再幾天）, tier（現在的分數是哪一級）, doneTier（這個主題辦到哪一級）, maxed（已經到金）,
//   waiting（展期夠了、分數不夠）, need（到下一級還差幾分）, nextTier, prev（今天換掉的那一場） }
export function showStatus(P, today) {
  const box = showBox(P), hs = hallScore(P), days = NUM.show.days;
  const theme = hs.theme || null;
  const out = { theme, score: hs.score || 0, day: 0, days, left: days, tier: 0, doneTier: 0, maxed: false, waiting: false, need: 0, nextTier: 0, prev: null };
  if (box.prev && box.prev.off === today) out.prev = { theme: box.prev.theme, day: Math.max(1, daysBetween(box.prev.from, today) + 1) };
  if (!theme) return out;
  const tiers = showTiers(theme), d = box.done[theme];
  out.tier = tierOfScore(theme, out.score);
  out.doneTier = d ? d.tier : 0;
  out.maxed = out.doneTier >= 3;
  const next = out.tier >= 3 ? 0 : out.tier + 1;
  out.nextTier = next;
  out.need = next ? Math.max(0, tiers[next - 1] - out.score) : 0;
  const c = box.cur && box.cur.theme === theme ? box.cur : null;
  const n = c ? Math.max(1, daysBetween(c.from, today) + 1) : 1;
  out.day = Math.min(n, days);
  out.left = Math.max(0, days - n);
  out.waiting = n >= days && !out.tier;
  return out;
}
// 今天該不該提示「再 1 天就辦完了」：一天一次（用現有的提示，不亮小紅點）。回傳 showStatus 或 null
export function showHintDue(P, today) {
  if (!P || isFree(P)) return null;
  const box = showBox(P), st = showStatus(P, today);
  if (!st.theme || st.maxed || st.left !== 1 || box.hinted === today) return null;
  box.hinted = today;
  return st;
}

// ---------- 結算 ----------
// 這個主題辦完一場：每一級只給一次。回傳事件 showDone：
//   { type, theme, tier（這場到哪一級）, score, first（第一次辦完）, up（比以前高）, gains（這次新拿到的）, events（解鎖事件，給 showEvents 用）, note（手記剛開） }
function settleShow(P, box, theme, score, today) {
  const tier = tierOfScore(theme, score), old = box.done[theme] ? box.done[theme].tier : 0;
  const gains = [], events = [];
  const add = (lv, fn) => { if (tier >= lv && old < lv) fn(); };
  add(1, () => { const b = P.mood || 0, v = NUM.show.bronzeMood; P.mood = clampN(b + v, 0, 99); gains.push({ kind: "mood", n: P.mood - b }); });
  add(2, () => { const v = NUM.show.silverInsp; P.insp = (P.insp || 0) + v; gains.push({ kind: "insp", n: v }); });
  add(3, () => {
    const it = showItemOf(theme);
    if (!it) return;
    const g = grantLimited(P, it.id, today);
    gains.push({ kind: "item", id: it.id, dup: g.dup, insp: g.insp });
    events.push(...g.events);
  });
  const d = box.done[theme] || { tier: 0, score: 0, date: null, runs: 0 };
  box.done[theme] = { tier: Math.max(d.tier, tier), score: Math.max(d.score, score), date: tier > old ? today : d.date, runs: d.runs + 1 };
  return { type: "showDone", theme, tier, score, date: today, first: old === 0, up: tier > old, gains, events, note: old === 0 };
}
// 每次畫面更新、換日都叫（重複叫沒關係）：看牆上的主題換了沒、展期到了沒、換週了沒。回傳這次發生的事件
//   showReset（換掉了，第 2 天以上才有）、showBack（今天換回來，接著算）、showDone、weekDone
//   showDone、weekDone 也放進 box.pending，等畫面有空才演（takeShowPending）
export function syncShow(P, today) {
  if (!P || isFree(P) || !isShowDate(today)) return [];
  const box = showBox(P), ev = [], before = box.pending.length;
  weeklyState(P); // 換週了就結算上週的特展（settleWeekShow）
  ev.push(...box.pending.slice(before));
  if (box.prev && box.prev.off < today) box.prev = null;
  if (box.cur && box.cur.from > today) box.cur.from = today; // 時間往回走（舊存檔、撥過時鐘）
  const hs = hallScore(P), t = hs.theme || null, cur = box.cur;
  if ((cur ? cur.theme : null) !== t) {
    const old = cur && cur.from < today ? { theme: cur.theme, from: cur.from, off: today } : null; // 今天才掛上的不用留
    if (t && box.prev && box.prev.theme === t) {
      box.cur = { theme: t, from: box.prev.from };
      box.prev = old;
      ev.push({ type: "showBack", theme: t, day: daysBetween(box.cur.from, today) + 1 });
    } else {
      if (old) { box.prev = old; ev.push({ type: "showReset", theme: old.theme, to: t, day: daysBetween(old.from, today) + 1 }); }
      box.cur = t ? { theme: t, from: today } : null;
    }
  }
  const c = box.cur;
  if (c && daysBetween(c.from, today) + 1 >= NUM.show.days && tierOfScore(c.theme, hs.score) && !(box.done[c.theme] && box.done[c.theme].tier >= 3)) {
    const e = settleShow(P, box, c.theme, hs.score, today);
    box.cur = { theme: c.theme, from: today }; // 掛著不動就是下一場
    box.pending.push(e);
    ev.push(e);
  }
  return ev;
}
// 換週（logic3.js 的 weeklyState 叫）：照上週的最高分。到金就給那週特展的配件；已經有了照簽到的規矩換成靈感
export function settleWeekShow(P, W, today) {
  if (!P || isFree(P) || !isShowBox(W) || !Number.isInteger(W.w)) return null;
  const box = showBox(P), best = W.best || 0;
  if (box.weeks[W.w] || !best) return null; // 那週沒擺過：不記
  const gold = best >= weekGold(W.theme), it = weekItemOf(W.theme);
  const rec = { theme: W.theme, best, gold, item: null, dup: false, date: today || null };
  box.weeks[W.w] = rec;
  if (!it) return null; // 那週的配件還沒做：分數記著就好
  const e = { type: "weekDone", w: W.w, theme: W.theme, best, gold, need: weekGold(W.theme), item: it.id, got: false, dup: false, insp: 0, events: [] };
  if (gold) {
    const g = grantLimited(P, it.id, today);
    rec.item = it.id; rec.dup = g.dup;
    Object.assign(e, { got: true, dup: g.dup, insp: g.insp, events: g.events });
  }
  box.pending.push(e);
  return e;
}
// 還沒演給玩家看的第一件（拿走）
export function takeShowPending(P) { return showBox(P).pending.shift() || null; }
export function hasShowPending(P) { return !!(P && !isFree(P) && showBox(P).pending.length); }

// ---------- 海報 ----------
// 辦完的展覽，一個主題一張（到過最高的那一級），早辦完的在前。不改 P（館友參觀的 hallView 也叫）
export function showPosters(P) {
  const done = P && isShowBox(P.themeShow) && isShowBox(P.themeShow.done) ? fixShow(P.themeShow).done : {};
  return Object.entries(done).map(([theme, d]) => ({ theme, tier: d.tier, score: d.score, date: d.date }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || SHOW_THEMES.indexOf(a.theme) - SHOW_THEMES.indexOf(b.theme));
}

// ---------- 策展手記 ----------
export function noteOpen(P, theme) { return !!(P && !isFree(P) && showBox(P).done[theme]); }
export function noteRead(P, theme) { return !!(P && showBox(P).read[theme] !== undefined); }
// 讀完一篇。回傳 { first }
export function readShowNote(P, theme, today) {
  if (!noteOpen(P, theme)) return { first: false };
  const box = showBox(P), first = box.read[theme] === undefined;
  if (first) box.read[theme] = today || null;
  return { first };
}
// 書架的頁籤：[打得開幾本, 還沒讀幾本]
export function noteCounts(P) {
  if (!P || isFree(P)) return [0, 0];
  const open = SHOW_THEMES.filter(t => noteOpen(P, t));
  return [open.length, open.filter(t => !noteRead(P, t)).length];
}

// ---------- 展覽的名字 ----------
// 「帽子展」「俄國8+9 特展」「失敗作回顧展」本來就有「展」，不再加「主題展」
export function showTitle(name) { return /展$/.test(name) ? name : `${name}主題展`; }

// ---------- 策展手記的文字（草稿，Yuga 可以改） ----------
// 展廳角落的一本小冊子。每辦完一場，就多一頁。寫的人不是玩家，也不說是誰。
// 接得上遊戲已經有的：來看展的怪客是展廳留言裡那些人（content.js 的 VISITOR_COMMENTS）、守夜警衛的值班紀錄（第陸章、每週劇情）、「帳對不上」（主線）。
// 不破梗：不提理智歸零、隱藏展品、禁書的續集、結局，也不說地下每一層是什麼。
export const SHOW_NOTES = {
  legend: { title: "傳說殿堂　策展手記", spine: "傳說殿堂", pages: [
    "展期三天。\n本廳每壹件，都是百分之二的奇蹟。\n開展第壹天，老派收藏家就來了。",
    "他坐在長椅上，從開館坐到閉館。\n閉館前他問：「都是真的？」\n我們說都是真的。\n他又坐了壹會兒。",
    "第二天，數學老師帶了計算機。\n她把展廳裡的機率壹個壹個乘起來，\n乘到第四個，計算機說 0。\n她把計算機收起來，改用看的。",
    "閉展那天，留言簿最後壹行寫著：\n「壹件奇蹟不稀奇，稀奇的是有人數過。」\n沒有簽名。字很整齊。",
  ] },
  angry: { title: "憤怒之廳　策展手記", spine: "憤怒之廳", pages: [
    "展期三天。\n本廳展品皆在生氣，請勿再激怒牠們。\n第壹天就有人來投訴太吵。",
    "投訴的是壹位怕吵的先生。\n我們帶他回去，站在展廳中間，請他聽。\n什麼聲音也沒有。\n他說：「就是這個。」",
    "第二天他帶了耳塞。\n第三天他拿下耳塞，對著展品大罵了壹頓。\n展品看起來很滿意。\n他也是。",
    "守夜警衛的值班紀錄：\n「凌晨三點，生氣的那幾隻安靜下來了。」\n「早上五點又開始。」\n「可能有排班。」",
  ] },
  tears: { title: "淚之廳　策展手記", spine: "淚之廳", pages: [
    "展期三天。\n牌子上寫得很清楚：\n請自備衛生紙，本館不提供。",
    "第壹天，壹位高中生哭到閉館。\n第二天她帶了朋友。\n第三天她朋友帶了朋友。\n她們帶的衛生紙都不夠。",
    "每天早上，門口都多壹盒新的衛生紙。\n沒有人承認是自己放的。\n本館真的不提供。",
    "我們查了帳。\n帳上沒有買過衛生紙。\n帳上也沒有少過錢。\n這件事不算問題，先記在這裡。",
  ] },
  russia8: { title: "俄國8+9 特展　策展手記", spine: "8+9 特展", pages: [
    "展期三天。\n本展品的家在莫斯科，目前蹲在這裡。\n沒有人問牠們為什麼要蹲。\n大家只問可不可以拍照。",
    "旅行社的業務來了三次。\n第壹次看展。第二次帶了行程表。\n第三次他什麼也沒帶，\n在展台旁邊，試著把腳跟貼到地上。",
    "門口多了壹袋瓜子。\n第二天袋子空了，地上壹片殼也沒有。\n打掃的阿姨說，不是她掃的。",
    "閉展那天，留言簿上有壹行字：\n「八加九，等於有位子就坐。」\n下面有人補了壹句：\n「這裡沒有椅子。」",
  ] },
  rainbow: { title: "彩虹　策展手記", spine: "彩虹", pages: [
    "展期三天。\n紅、綠、黃、黑。\n在佩佩的世界，這就是彩虹。\n我們知道外面不是這樣。",
    "眼科醫師來確認過，四種顏色都在。\n幼稚園的小朋友問紫色去哪裡了。\n老師說回家再說。\n老師沒有回答。",
    "色彩學老師帶了壹本色票來比對。\n壹百二十色，她翻了三天。\n她說這不是她教的彩虹，但她接受。",
    "她走的時候把色票忘在長椅上。\n我們打開來要找她的名字。\n裡面只剩四頁。\n紅、綠、黃、黑。",
  ] },
  hats: { title: "帽子展　策展手記", spine: "帽子展", pages: [
    "展期三天。\n每壹頂帽子，都讓佩佩多了壹種可能。\n退休的帽商是第壹個進來的。",
    "他帶了捲尺。\n他沒有量帽子，他量佩佩的頭。\n壹隻壹隻量，壹隻壹隻記下來。\n「都是好頭。」他說。",
    "第三天他告訴我們，\n他年輕時做過壹頂帽子，賣掉之後就再也沒見過。\n「帽子這種東西，」他說，\n「不會壞。只會走掉。」",
    "他在留言簿留了地址，\n說要是有壹頂帽子自己回來，寄明信片給他。\n我們不知道怎樣算自己回來。\n地址先收著。",
  ] },
  pillows: { title: "抱枕沙龍　策展手記", spine: "抱枕沙龍", pages: [
    "展期三天。\n本廳展品歡迎目視擁抱。\n小朋友問牌子上有沒有寫不行。\n牌子上真的沒有寫。",
    "午休的上班族每天中午來。\n他坐在展台旁邊，十二點半睡著，壹點半準時醒。\n第三天他問我們有沒有賣月票。",
    "每天早上開館前，我們都會把抱枕拍鬆。\n每天早上，抱枕都有壹個凹痕。\n比人小很多。",
    "守夜警衛的值班紀錄：\n「巡到抱枕沙龍，裡面很暖。」\n「我沒有開燈。」\n「我也沒有進去。感覺不太禮貌。」",
  ] },
  joy: { title: "歡樂廳　策展手記", spine: "歡樂廳", pages: [
    "展期三天。\n笑容會傳染，本館概不負責。\n第壹天，保險業務來問「概不負責」是誰寫的。",
    "牙醫來了。\n他看了很久，說每壹隻的牙齒都很健康。\n我們告訴他，佩佩沒有牙齒。\n他笑著說他知道。",
    "有壹位不開心的人連來三天。\n第壹天他站在門口。第二天他站在中間。\n第三天他笑了，\n然後想不起來自己本來在不開心什麼。",
    "他問我們能不能還給他。\n我們翻了失物登記簿。\n沒有這壹項。\n他笑著走了。",
  ] },
  flat: { title: "躺平區　策展手記", spine: "躺平區", pages: [
    "展期三天。\n本區展品正在休息，請勿打擾。\n開展之後，什麼事也沒有發生。\n這壹場辦得很成功。",
    "評論家寫了壹篇：\n「牠們什麼都沒做，但做得很好。」\n瑜珈老師把這句話抄回去了。\n加班的工程師把它設成手機桌布。",
    "第三天，那位工程師到櫃台問：\n「請問這裡還缺展品嗎？」\n我們說本館沒有這種應徵。\n他說沒關係，他可以等。",
    "隔天早上，櫃台上多了壹疊表格。\n「應徵項目：展品。」\n「專長：」\n本館沒有印過這種表格。",
  ] },
  failed: { title: "失敗作回顧展　策展手記", spine: "失敗回顧", pages: [
    "展期三天。\n每壹件失敗作，都是走錯路的可能性。\n牠們的名牌上沒有編號。\n圖鑑牆上沒有牠們的格子。",
    "評論家問：「這些也算作品嗎？」\n我們說不知道。\n藝術系的學生說他最喜歡這間。\n評論家看了他壹眼，又多看了展品壹眼。",
    "學生問了壹個問題，我們答不出來：\n「牠們有算在帳上嗎？」\n做的時候花了靈感，收藏裡卻不算數。\n那些靈感，算在哪裡？",
    "閉展那天，有人在展台前放了壹朵花。\n卡片上寫：\n「謝謝你們先走錯。」",
  ] },
};
// 海報上的青蛙（畫面用 ART.frog 畫；失敗作多一個 failed）
export const SHOW_POSTER_PICK = {
  legend: { 稀有度: "傳說級稀有", 心情: "開心", 顏色: "黃", 帽子: "皇冠", 姿勢: "站著" },
  angry: { 心情: "生氣", 顏色: "紅", 姿勢: "站著" },
  tears: { 心情: "傷心", 顏色: "綠", 姿勢: "坐著" },
  russia8: { 心情: "俄國8+9", 顏色: "黑", 帽子: "毛帽", 姿勢: "斯拉夫蹲" },
  rainbow: { 心情: "開心", 顏色: "虹彩", 姿勢: "站著" },
  hats: { 心情: "開心", 顏色: "綠", 帽子: "巫師帽", 姿勢: "比讚" },
  pillows: { 心情: "開心", 顏色: "黃", 姿勢: "坐著", 手上拿的東西: "小抱枕" },
  joy: { 心情: "開心", 顏色: "綠", 姿勢: "比讚" },
  flat: { 心情: "開心", 顏色: "綠", 姿勢: "躺平" },
  failed: { 心情: "傷心", 顏色: "紅", 姿勢: "站著", failed: true },
};
