// ================================================================
//  每週排行榜的規則（決定 0039）
//  翊文：「另外每周排行榜也可以用discord推送給大家看，並提供一些建議」
//
//  這個檔只有純函式：不碰 Firebase、不碰畫面、不碰 Discord。
//    tools/weekly_board.cjs（每週一 05:15 跑）把讀到的資料傳進來，把結果寫進 Firestore、發到 Discord。
//    web/src/ui_board_rank.js 讀 boards/latest，用 boardViewOf 整理過才畫。
//  流程：
//    boardWeekOf(現在)            要算哪一週：一律是「剛過完的那一週」（週一 05:00 換週，排程跑的時候新的一週剛開始）
//    boardStatsOf(存檔, 週)       一個人的數字。存檔壞了回傳 { ok: false }，不會丟錯
//    boardPeopleOf({ members, saves }, 週)  整份名單
//    boardCompute(名單, 上週快照, 週, ctx)  → { doc（給玩家看的）, snapshot（下週相減用，有 uid）, unreadable（幾份讀不了） }
//    boardDiscordText(doc, 連結, 上限)      Discord 公告
//  榜上每一列可以多一個 title（決定 0050）：那個人當時戴的稱號的名字（純文字，最多 NUM.casino.titleMax 字）；沒稱號就沒有這個欄位。
//  玩家看得到的 doc 裡沒有 uid、email，也沒有理智、怪癖、靈感。累計數字（snapshot）放另一份文件，玩家讀不到（firestore.rules）。
//  隱身的人照算：這是遊戲進度，不是在線狀態。
//  存檔是玩家自己寫的（shared/admin.js 開頭）：值一律當不可信，只拿數字、有上限。暱稱只當純文字；貼到 Discord 前要過 boardDiscordNick。
//  文字在 content3.js 的 BOARD_TEXT，數字在 config.js 的 NUM.board。
// ================================================================
import { NUM } from "./config.js";
import { FORBIDDEN_BOOKS } from "./content.js";
import { BOARD_TEXT, BOOK4 } from "./content3.js";
import { adminSummary } from "./admin.js";
import { addDays, asList, fill, hallScore, migrateSave, nowMs, taipeiDay } from "./logic.js";
import { bookSequels, cellarFloors, weekIndex } from "./logic3.js";
import { shopState } from "./shop.js";
import { dayStartMs, isoWeek, storyState, weekMonday } from "./story.js";
import { showStatus } from "./themeshow.js";
import { titleName } from "./titles.js";

const brdObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const brdNum = v => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const brdInt = (v, max = 9999) => Math.max(0, Math.min(max, Math.floor(brdNum(v))));
const brdTry = (fn, d) => { try { return fn(); } catch (e) { return d; } };

// ---------- 六個榜 ----------
// all：簽滿的都列，不只前幾名。firstTitle：第一週沒有上週可以比，這個榜改列累積
export const BOARD_DEFS = [
  { id: "codex", emoji: "🖼", title: "本週新收藏", firstTitle: "圖鑑累積", unit: "格" },
  { id: "hall", emoji: "🏛", title: "展廳評分", unit: "分" },
  { id: "deep", emoji: "⛏", title: "地下收藏庫走最深" },
  { id: "books", emoji: "📖", title: "本週讀最多書", unit: "本" },
  { id: "full", emoji: "🗓", title: "全勤", all: true },
  { id: "stamps", emoji: "🎖", title: "本週週章", unit: "枚" },
];
// 一格的字：12 格、B3。全勤不寫數字
export function boardValueText(id, value) {
  if (id === "deep") return `B${brdInt(value)}`;
  const def = BOARD_DEFS.find(d => d.id === id);
  return def && def.unit ? `${brdInt(value)} ${def.unit}` : "";
}

// ---------- 這週是哪一週 ----------
// 回傳 label（要算的週）、prev（要相減的上一週）、next（已經開始的新一週）、from、to（週一到週日）、
// at（那一週最後一秒：拿來算「那一週」的簽到）、live（真的現在：拿來看主題展現在的狀況）
export function boardWeekOf(now = nowMs()) {
  const monday = weekMonday(taipeiDay(now)), from = addDays(monday, -7);
  return { label: isoWeek(from), prev: isoWeek(addDays(from, -7)), next: isoWeek(monday), from, to: addDays(monday, -1), at: dayStartMs(monday) - 1000, live: now };
}

// ---------- 暱稱 ----------
// 遊戲裡用的：去掉看不見的字、連續空白變一個、最多 12 個字（畫面只當純文字放）
const brdPlain = s => String(s == null ? "" : s).replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Cs}]/gu, " ").replace(/\s+/g, " ").trim();
// 稱號：只留名字（純文字、有字數上限）；不是字串、空的都當沒有
const brdTitle = t => (typeof t === "string" ? [...brdPlain(t)].slice(0, NUM.casino.titleMax).join("") : "");
const brdNick = n => (typeof n === "string" && [...brdPlain(n)].slice(0, 12).join("")) || "館友";
// 貼到 Discord 的：再清掉 @、markdown 符號、連結會用到的符號，暱稱弄不出提及、粗體、連結。全形的 ＠ 這些也算（NFKC 先轉成半形）
export function boardDiscordNick(n) {
  const s = brdPlain(typeof n === "string" ? n : "").normalize("NFKC");
  const out = [...brdPlain(s.replace(/[@#*_~`|\\<>[\]():/.]/g, ""))].slice(0, 12).join("");
  return out || "館友";
}

// ---------- 一個人的數字 ----------
// raw：Firestore 的字串（或解開的物件）；null ＝還沒有存檔。回傳：
//   { ok: false }              讀不了
//   { ok: true, entered: false } 還沒進館
//   { ok: true, entered: true, codex, hall, deepest, books, storyRead, signWeek, stampsWeek, stamps, gear, walked, showAlmost }
//     累計（存進快照）：codex 圖鑑、books 起源室＋禁書、hall 展廳分數、deepest 地下最深
//     這週（有日期可以直接算）：storyRead 這週讀完的劇情書、signWeek 這週簽幾天、stampsWeek 這週領到幾枚週章、walked 這週有沒有下地下
//     提醒用：stamps 現在有幾枚、gear 有幾件裝備、showAlmost 主題展再 1 天就辦完
export function boardStatsOf(raw, wk) {
  if (raw == null) return { ok: true, entered: false };
  try {
    const s = adminSummary(raw, wk.at);
    if (!s.ok) return { ok: false };
    if (!s.entered) return { ok: true, entered: false };
    const save = migrateSave(typeof raw === "string" ? JSON.parse(raw) : JSON.parse(JSON.stringify(raw)));
    const P = save.profiles.challenge, S = storyState(P);
    const inWeek = d => typeof d === "string" && d >= wk.from && d <= wk.to;
    // 禁書是每位參觀者自己的（P.mythFrom，換人就清）：不在場的那幾位也算，換人才不會以為多讀了
    const known = FORBIDDEN_BOOKS.concat([BOOK4], bookSequels()).map(b => b.id), read = new Set();
    [P].concat(asList(P.visitors)).forEach(v => { if (brdObj(v) && brdObj(v.mythFrom)) known.forEach(id => { if (v.mythFrom[id]) read.add(id); }); });
    const show = brdTry(() => showStatus(P, taipeiDay(wk.live)), null);
    return {
      ok: true, entered: true,
      codex: brdInt(s.progress.codex.have),
      books: brdInt(s.progress.books.chapters.have) + read.size,
      title: brdTry(() => titleName(P.casinoTitle), ""), // 稱號（決定 0050）：跟展廳一樣看 P.casinoTitle，過 casCleanTitle
      hall: brdInt(brdTry(() => hallScore(P).score, 0), 100),
      deepest: brdInt(s.progress.deepest, cellarFloors().length || 99),
      storyRead: Object.values(S.books).filter(b => brdObj(b) && inWeek(b.read)).length,
      signWeek: brdInt(s.week.signWeek, 7),
      // 週章會花掉，所以不能用「現在有幾枚」相減：照領獎的紀錄算（story.js 的 give）。材料換的不算，那是換的不是賺的
      stampsWeek: brdInt(asList(S.log).reduce((n, x) => n + (brdObj(x) && inWeek(x.d) && typeof x.r === "string" ? Number((/週章 (\d+) 枚/.exec(x.r) || [])[1] || 0) : 0), 0), 99),
      stamps: brdInt(s.week.stamps),
      gear: brdTry(() => Object.keys(shopState(P).gear).length, 0),
      walked: Object.keys(S.deep).some(d => inWeek(d) && brdNum(S.deep[d]) > 0),
      showAlmost: !!(show && show.theme && !show.maxed && show.left === 1 && show.tier > show.doneTier),
    };
  } catch (e) {
    return { ok: false };
  }
}
// input：{ members: [{ uid, nick, joinedAt（毫秒） }], saves: { uid: 字串 } }。先加入的排前面（同分時的順序）
export function boardPeopleOf(input, wk) {
  const saves = brdObj(input && input.saves) ? input.saves : {};
  return asList(input && input.members).filter(brdObj).slice()
    .sort((a, b) => brdNum(a.joinedAt) - brdNum(b.joinedAt) || String(a.uid).localeCompare(String(b.uid)))
    .map(m => ({ uid: String(m.uid), nick: brdNick(m.nick), stats: boardStatsOf(Object.prototype.hasOwnProperty.call(saves, m.uid) ? saves[m.uid] : null, wk) }));
}

// ---------- 排名 ----------
// list：[{ nick, value }]（照要的順序）。0 不上榜；同分同名次（1、1、3）；列到第 top 名
function brdRank(list, top) {
  const sorted = list.map((x, no) => ({ nick: x.nick, value: x.value, title: x.title, no })).filter(x => x.value > 0).sort((a, b) => b.value - a.value || a.no - b.no);
  const rows = [];
  let rank = 0, last = null;
  sorted.forEach((x, i) => {
    if (x.value !== last) { rank = i + 1; last = x.value; }
    if (rank <= top) rows.push(x.title ? { rank, nick: x.nick, value: x.value, title: x.title } : { rank, nick: x.nick, value: x.value });
  });
  return rows;
}
// 同一個名次排成一組：[{ rank, value, nicks }]（畫面和公告用）
export function boardGroups(rows) {
  const out = [];
  asList(rows).forEach(r => {
    const g = out[out.length - 1];
    if (g && g.rank === r.rank) g.nicks.push(r.nick);
    else out.push({ rank: r.rank, value: r.value, nicks: [r.nick] });
  });
  // 有人戴稱號才多一個 titles（跟 nicks 一一對上，沒有的是空字串）；都沒有就跟以前一樣
  out.forEach(g => {
    const ts = asList(rows).filter(r => r.rank === g.rank).map(r => brdTitle(r.title));
    if (ts.some(Boolean)) g.titles = ts;
  });
  return out;
}
// 同樣的狀況不要每週都講一樣的：照週號從不同的地方開始
const brdTurn = (list, wk) => {
  if (!list.length) return list;
  const k = ((weekIndex(wk.from) % list.length) + list.length) % list.length;
  return list.slice(k).concat(list.slice(0, k));
};
const brdBefore = (prev, uid) => (prev && brdObj(prev[uid]) ? prev[uid] : {});

// ---------- 全館的建議 ----------
// ins：進館的人。規則算的，不用 AI、不破梗。一定有 2～3 條（有人進館的話）
// ctx.newRoomFloor：這週地下多的房間在哪一層（週包 week.json 的 anomaly.room.floor）；不知道就不提
export function boardTips(ins, prev, wk, ctx = {}) {
  const T = BOARD_TEXT.tips, total = ins.length, N = NUM.board;
  if (!total) return [];
  const low = n => n < total * N.lowShare;
  const count = fn => ins.filter(p => fn(p.stats, brdBefore(prev, p.uid))).length;
  const out = [];
  if (count(s => s.showAlmost)) out.push(T.show); // 這個過了明天就沒用，排最前面
  const pool = [];
  if (low(count(s => s.walked))) pool.push(ctx.newRoomFloor ? fill(T.cellarRoom, ctx.newRoomFloor) : T.cellar);
  if (count(s => s.gear === 0)) pool.push(fill(T.stamps, NUM.shop.gearPrice.common));
  if (low(count(s => s.signWeek >= N.fullDays))) pool.push(fill(T.sign, N.fullDays));
  if (low(count((s, b) => s.storyRead > 0 || (prev && s.books > brdInt(b.books))))) pool.push(T.books);
  if (prev && low(count((s, b) => s.codex > brdInt(b.codex)))) pool.push(T.codex);
  if (count(s => s.hall < NUM.show.tiers[0])) pool.push(fill(T.hall, NUM.show.days));
  out.push(...brdTurn(pool, wk));
  if (out.length < 2) out.push(...brdTurn([T.visit, fill(T.tasks, NUM.story.stampPerTask)], wk));
  return out.slice(0, N.tipsMax);
}

// ---------- 給個人的小提醒 ----------
// 只講「快到了」和「做到了」，不點名誰最後。不碰理智、怪癖、靈感。一個人最多一條
export function boardNudges(ins, prev, wk) {
  const T = BOARD_TEXT.nudges, N = NUM.board, price = NUM.shop.gearPrice.common;
  const pick = p => {
    const s = p.stats, b = brdBefore(prev, p.uid);
    if (s.showAlmost) return T.show;
    if (s.signWeek >= N.signNear && s.signWeek < N.fullDays) return fill(T.sign, N.fullDays - s.signWeek);
    if (s.gear === 0 && s.stamps > 0 && s.stamps < price) return fill(T.stamps, price - s.stamps);
    if (prev && s.deepest > brdInt(b.deepest)) return fill(T.deep, s.deepest);
    return null;
  };
  const list = ins.map(p => ({ nick: p.nick, text: pick(p) })).filter(x => x.text);
  return brdTurn(list, wk).slice(0, N.nudgesMax);
}

// ---------- 整份榜單 ----------
// people：boardPeopleOf 的結果；prevSnap：上週的快照 { people: { uid: 數字 } }，沒有就是第一週；ctx 見 boardTips
// doc：給玩家看的，放進 boards/{週} 和 boards/latest。沒有 uid、email
// snapshot：下週相減用，放進 boards/{週}/private/people（有 uid，玩家讀不到）。讀不了的人留上週的數字，下週才不會多算
export function boardCompute(people, prevSnap, wk, ctx = {}) {
  const list = asList(people).filter(brdObj);
  const prev = prevSnap && brdObj(prevSnap.people) ? prevSnap.people : null, first = !prev;
  const ins = list.filter(p => p.stats && p.stats.ok && p.stats.entered);
  const gain = (p, k) => Math.max(0, brdInt(p.stats[k]) - brdInt(brdBefore(prev, p.uid)[k]));
  const values = {
    codex: p => (first ? p.stats.codex : gain(p, "codex")),
    hall: p => p.stats.hall,
    deep: p => p.stats.deepest,
    books: p => p.stats.storyRead + (first ? 0 : gain(p, "books")), // 第一週不知道上週讀到哪，只算有日期的
    full: p => (p.stats.signWeek >= NUM.board.fullDays ? NUM.board.fullDays : 0),
    stamps: p => p.stats.stampsWeek,
  };
  const boards = BOARD_DEFS.map(def => {
    const rank = ins.map(p => ({ nick: p.nick, value: values[def.id](p), title: brdTitle(p.stats.title) }));
    return { id: def.id, title: first && def.firstTitle ? def.firstTitle : def.title, rows: brdRank(rank, def.all ? list.length || 1 : NUM.board.top) };
  });
  const snap = {};
  list.forEach(p => {
    if (p.stats && p.stats.ok && p.stats.entered) snap[p.uid] = { codex: p.stats.codex, books: p.stats.books, hall: p.stats.hall, deepest: p.stats.deepest };
    else if (prev && brdObj(prev[p.uid])) snap[p.uid] = prev[p.uid];
  });
  return {
    doc: {
      v: 1, week: wk.label, from: wk.from, to: wk.to, first, empty: boards.every(b => !b.rows.length), at: wk.live, boards,
      tips: boardTips(ins, prev, wk, ctx), nudges: boardNudges(ins, prev, wk), posted: false, postedAt: null,
    },
    snapshot: { week: wk.label, at: wk.live, people: snap },
    unreadable: list.filter(p => !p.stats || !p.stats.ok).length,
  };
}

// ---------- 讀回來的榜單 ----------
// Firestore 讀回來的文件 → 畫面和公告用的樣子。不是榜單的樣子回傳 null；認不得的榜拿掉
export function boardViewOf(d) {
  if (!brdObj(d) || typeof d.week !== "string") return null;
  const text = (s, n) => [...String(s == null ? "" : s)].slice(0, n).join("");
  const boards = BOARD_DEFS.map(def => {
    const b = asList(d.boards).find(x => brdObj(x) && x.id === def.id);
    if (!b) return null;
    const rows = asList(b.rows).filter(brdObj).map(r => { const t = brdTitle(r.title), o = { rank: brdInt(r.rank), nick: brdNick(r.nick), value: brdInt(r.value) }; if (t) o.title = t; return o; }).filter(r => r.rank > 0);
    return { id: def.id, emoji: def.emoji, title: typeof b.title === "string" && b.title ? text(b.title, 20) : def.title, all: !!def.all, rows };
  }).filter(Boolean);
  return {
    week: text(d.week, 10), from: text(d.from, 10), to: text(d.to, 10), first: d.first === true, empty: d.empty === true || boards.every(b => !b.rows.length), posted: d.posted === true, boards,
    tips: asList(d.tips).filter(s => typeof s === "string").map(s => text(s, 100)),
    nudges: asList(d.nudges).filter(n => brdObj(n) && typeof n.text === "string").map(n => ({ nick: brdNick(n.nick), text: text(n.text, 60) })),
  };
}
// 11/09～11/15
export function boardPeriodText(v) {
  const md = s => (typeof s === "string" && s.length === 10 ? s.slice(5).split("-").join("/") : "");
  return `${md(v && v.from)}～${md(v && v.to)}`;
}

// ---------- Discord 公告 ----------
// 太長就從中間的內容截短（整行整行拿掉），「館長室 敬啟」和連結一定留著
function brdCut(text, room) {
  if (text.length <= room) return text;
  let s = text.slice(0, Math.max(0, room - 2));
  const nl = s.lastIndexOf("\n");
  if (nl > 0) s = s.slice(0, nl);
  else if (/[\ud800-\udbff]$/.test(s)) s = s.slice(0, -1); // 不要切在 emoji 中間
  return s + "\n…";
}
const BRD_MEDAL = ["🥇", "🥈", "🥉"];
// doc：boardCompute 的 doc（或從 Firestore 讀回來的）。endText：最後面的連結（tools/discord_post.cjs 的 footer）
export function boardDiscordText(doc, endText = "", max = 2000) {
  const v = boardViewOf(doc);
  if (!v) return "";
  const T = BOARD_TEXT, dn = boardDiscordNick;
  const lines = [`🏛 **${T.title}**`, `📜 ${fill(T.period, boardPeriodText(v))}`];
  if (v.first) lines.push(`📌 ${T.first}`);
  v.boards.filter(b => b.rows.length).forEach(b => {
    if (b.all) { lines.push("", `${b.emoji} 【${b.title}】${fill(T.fullNote, NUM.board.fullDays)}`, b.rows.map(r => dn(r.nick)).join("、")); return; }
    lines.push("", `${b.emoji} 【${b.title}】`);
    boardGroups(b.rows).forEach(g => lines.push(`${BRD_MEDAL[g.rank - 1] || `${g.rank}.`} ${g.nicks.map(dn).join("、")}　${boardValueText(b.id, g.value)}`));
  });
  if (v.tips.length) lines.push("", `💡 【${T.tipsHead}】`, ...v.tips.map(t => `・${t}`));
  if (v.nudges.length) lines.push("", `📣 【${T.nudgesHead}】`, ...v.nudges.map(n => `・${dn(n.nick)} ${n.text}`));
  const end = `\n\n${T.sign}${endText ? `\n\n${endText}` : ""}`;
  return brdCut(lines.join("\n"), max - end.length) + end;
}
