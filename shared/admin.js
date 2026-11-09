// ================================================================
//  管理員介面的規則（第一版：只看不改，決定 0033）
//  翊文：「管理員介面呢，可以看到大家進度的部分」
//
//  這個檔只有純函式：不碰 Firebase、不碰畫面。Functions（functions/admin.js）把讀到的資料傳進來，畫面（web/src/ui_admin.js）只拿結果來畫。
//    - 誰是管理員：adminEmail（登入 token 的 email，小寫）＋ isAdminInvite（invites/{email} 那一筆有 admin: true）。程式裡不寫死任何 email、uid。
//    - 一個人的摘要：adminSummary(存檔)。存檔壞了回傳 { ok: false }，不會丟錯。
//    - 一列：adminRow（暱稱＋在線＋摘要）。整張表：adminOverviewOf。
//  回傳的東西只有暱稱和數字：不放 email、不放 uid、不放整份存檔。
//  存檔是玩家自己寫的（Firestore 的規則只檢查它是字串）：裡面的值一律當不可信。
//    只拿數字、認得的 id，字串都有上限。畫面也只能當純文字放（不要用 h 的 html）。
//  「現在」用 nowMs()（Functions 裡就是伺服器的時間）；「今天」照台灣時間 05:00 換日（taipeiDay）。
//  介面上的字（adminAgo 這些）照第 1 代用「壹」。
// ================================================================
import { BADGES, PEPE_PARTS } from "./config.js";
import { ENDINGS, FORBIDDEN_BOOKS } from "./content.js";
import { BOOK4, ENDING_CELLAR, JOBS, QUIRK_TASK_TEXT } from "./content3.js";
import { CATS, CORE_TOTAL, activeQuirks, allChapters, asList, codexCount, gameDayNo, maxSan, migrateSave, nowMs, quirkMinsLeft, quirkName, taipeiDay } from "./logic.js";
import { bookSequels } from "./logic3.js";
import { traitById, traitName } from "./legacy.js";
import { signinState, weekProgress } from "./signin.js";
import { isoWeek, storyState } from "./story.js";
import { visitorName, visitorTotal } from "./visitors.js";

const admObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const admNum = (v, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
// 毫秒時間：不是正常的時間當成沒有（太大的數字 new Date 會丟錯，玩家寫得到自己的 /status）；比現在晚的拉回現在
const admMs = (v, now) => (typeof v === "number" && v > 0 && v <= 8.64e15 ? Math.min(v, now) : null);
const admText = (s, n) => [...String(s)].slice(0, n).join("");

// ---------- 誰是管理員 ----------
// 要拿來查 invites/{email} 的 email：Google 確認過（email_verified）、小寫。查不了的回傳 null。
export function adminEmail(token) {
  if (!admObj(token) || token.email_verified !== true || typeof token.email !== "string") return null;
  const e = token.email.trim().toLowerCase();
  return e.includes("@") && !e.includes("/") ? e : null;
}
// invites/{email} 那一筆：admin 要真的是 true，被停用的不算
export function isAdminInvite(d) { return admObj(d) && d.admin === true && !d.disabled; }

// ---------- 一個人的摘要 ----------
// 解鎖了幾個：跟「全部解鎖」同一個算法（test/sim.cjs 的 baseLocked）。禁忌、突變、禮物、限定、鑰匙不算；一開始就有的不算
export function adminUnlock(P) {
  let have = 0, total = 0;
  CATS.forEach(c => PEPE_PARTS.find(p => p.name === c).options.forEach(o => {
    if (o.forbidden || o.mutant || o.gift || o.limited || o.key || o.start) return;
    total++;
    if (asList(P.unlocked && P.unlocked[c]).includes(o.name)) have++;
  }));
  return { have, total };
}
// 讀了幾本書：起源室（跟 roomProgress 一樣算）＋這一位讀過的禁書（P.mythFrom 是每位自己的，換人就清）＋讀完的每週劇情
function admBooks(P, S) {
  const chapters = [0].concat(allChapters().map(c => c.id));
  const read = chapters.filter(id => P.chaptersRead[id]).length;
  const forbidden = FORBIDDEN_BOOKS.concat([BOOK4], bookSequels()).filter(b => P.mythFrom[b.id]).length;
  const story = Object.values(S.books).filter(b => admObj(b) && b.read).length;
  return { total: read + forbidden + story, chapters: { have: read, total: chapters.length }, forbidden, story };
}
// 看到哪些結局：只列認得的（P.endings 的值，俄國8+9 是次數、別的是日期）
function admEndings(P) {
  return Object.keys(P.endings).map(id => {
    const E = id === "cellar" ? ENDING_CELLAR : Object.prototype.hasOwnProperty.call(ENDINGS, id) ? ENDINGS[id] : null;
    return E && typeof E.title === "string" ? { id, name: E.title } : null;
  }).filter(Boolean);
}
// 現在有哪些怪癖：時間到的不算（決定 0027）。認不得的怪癖只寫「不認得」，不讓整列壞掉
function admQuirks(P, now) {
  return activeQuirks(P, now).slice(0, 10).map(q => {
    let name;
    try { name = admText(quirkName(q), 40); } catch (e) { name = "不認得的怪癖"; }
    const task = QUIRK_TASK_TEXT[q.task];
    return { name, mania: q.type === "mania", task: task ? task.act : null, minsLeft: quirkMinsLeft(q, now) };
  });
}
// 存檔 → 摘要。raw：Firestore 的字串，或已經解開的物件（不會改到它）；null ＝還沒有存檔。
// 回傳：
//   { ok: false }                          讀不了（JSON 壞了、不是存檔的樣子）
//   { ok: true, entered: false, free }     還沒進館（沒有挑戰模式的博物館）。free ＝只玩過自由模式
//   { ok: true, entered: true, visitors, progress, week, stuck }
export function adminSummary(raw, now = nowMs()) {
  if (raw == null) return { ok: true, entered: false, free: false };
  try {
    const src = typeof raw === "string" ? JSON.parse(raw) : JSON.parse(JSON.stringify(raw));
    if (!admObj(src) || (src.profiles != null && !admObj(src.profiles))) return { ok: false };
    const c0 = src.profiles && src.profiles.challenge;
    if (c0 != null && !admObj(c0)) return { ok: false };
    const save = migrateSave(src); // 跟玩家載入時同一份補欄位（舊存檔沒有簽到、沒有週章也算得出來）
    const P = save.profiles.challenge;
    if (!P) return { ok: true, entered: false, free: !!save.profiles.free };
    const today = taipeiDay(now), label = isoWeek(today), S = storyState(P), signin = signinState(save);
    const inWeek = id => id.startsWith(label + "/");
    const job = JOBS.find(j => j.id === P.job);
    const trait = id => (traitById(id) ? traitName(id) : null);
    return {
      ok: true, entered: true,
      visitors: {
        count: visitorTotal(P), name: admText(visitorName(P), 24), job: job ? job.name : null, perk: trait(P.perk), flaw: trait(P.flaw),
        sanity: admNum(P.sanity), maxSan: admNum(maxSan(P), 99), mood: admNum(P.mood), insp: admNum(P.insp), myth: admNum(P.myth),
        dayNo: gameDayNo(P, today), playSec: admNum(P.activeSec),
      },
      progress: {
        codex: { have: codexCount(P), total: CORE_TOTAL }, unlock: adminUnlock(P), deepest: admNum(P.cellar && P.cellar.best),
        books: admBooks(P, S), endings: admEndings(P), badges: { have: BADGES.filter(b => P.badges[b.id]).length, total: BADGES.length },
      },
      week: {
        label, signCount: admNum(signin.count), signWeek: weekProgress(save, today).n, signedToday: !!signin.days[today],
        tasksDone: Object.entries(S.tasks).filter(([id, t]) => inWeek(id) && admObj(t) && t.done).length,
        stamps: admNum(S.stamps),
        booksRead: Object.entries(S.books).filter(([id, b]) => inWeek(id) && admObj(b) && b.read).length,
      },
      stuck: {
        // 走進俄國8+9 的房間幾次：P.history 最多留 50 筆；P.endings.russia8 是看到那個畫面幾次（還沒換人也算）。取大的
        sanityZero: Math.max(asList(P.history).filter(x => admObj(x) && x.endedBy === "russia8").length, admNum(P.endings.russia8)),
        quirks: admQuirks(P, now), dark: !!P.dark,
      },
    };
  } catch (e) {
    return { ok: false };
  }
}

// ---------- 一列、整張表 ----------
const ADM_ROOM = /^[a-z][a-z0-9_:-]{0,31}$/; // 跟 database.rules.json 的 room 一樣
const admNick = n => (typeof n === "string" && n ? admText(n, 12) : "館友");
// member：{ nick }；saveDoc：{ data（字串）, updatedAt（毫秒） } 或 null；status：/status/{uid}（可能沒有）。no ＝第幾位（畫面記「展開哪一列」用）
export function adminRow(member, saveDoc, status, now = nowMs(), no = 0) {
  const st = admObj(status) ? status : {};
  const state = st.state === "online" || st.state === "away" ? st.state : "offline";
  const savedAt = saveDoc ? admMs(saveDoc.updatedAt, now) : null;
  // 最後上線：在線就是現在；不然看 /status 的時間和最後存檔，取晚的（隱身的人 /status 是離線，存檔還是看得出來有來）
  const seen = state === "offline" ? Math.max(admMs(st.at, now) || 0, savedAt || 0) || null : now;
  const summary = !saveDoc ? adminSummary(null, now) : typeof saveDoc.data === "string" ? adminSummary(saveDoc.data, now) : { ok: false };
  return {
    no, nick: admNick(member && member.nick), state, room: state !== "offline" && typeof st.room === "string" && ADM_ROOM.test(st.room) ? st.room : null,
    lastSeenAt: seen, savedAt, todayOnline: seen != null && taipeiDay(seen) === taipeiDay(now), summary,
  };
}
// 排序：seen 最後上線、codex 圖鑑、day 第幾天。dir：-1 大的在前（預設）、1 小的在前。沒有資料的（讀不了、還沒進館）一律排最後
export function adminSortValue(r, key) {
  const s = r && r.summary && r.summary.entered ? r.summary : null;
  if (key === "codex") return s ? s.progress.codex.have : null;
  if (key === "day") return s ? s.visitors.dayNo : null;
  return r && typeof r.lastSeenAt === "number" ? r.lastSeenAt : null;
}
export function adminSortRows(rows, key = "seen", dir = -1) {
  return asList(rows).slice().sort((a, b) => {
    const x = adminSortValue(a, key), y = adminSortValue(b, key);
    if (x == null || y == null) return x == null && y == null ? (a.no || 0) - (b.no || 0) : x == null ? 1 : -1;
    return (x - y) * dir || (a.no || 0) - (b.no || 0);
  });
}
// members：[{ uid, nick, joinedAt（毫秒） }]；saves：{ uid: { data, updatedAt } }；status：/status 整包。
// 哪一列出了什麼事都不會讓整張表壞掉。回傳的列裡沒有 uid
// 打字的檢舉（決定 0036）：說了什麼（變形後、原文）、誰說的、誰檢舉的。最新的在前，最多 50 筆。不回傳 uid、email
export function adminCoopReports(raw) {
  const str = (s, n) => (typeof s === "string" ? [...s].slice(0, n).join("") : "");
  return (admObj(raw) ? Object.values(raw) : []).filter(admObj).sort((a, b) => admNum(b.reportedAt) - admNum(a.reportedAt)).slice(0, 50)
    .map(r => ({ name: admNick(r.name), text: str(r.text, 80), from: str(r.from, 80), at: admNum(r.at, null), reporter: admNick(r.reporterNick), reportedAt: admNum(r.reportedAt, null) }));
}
export function adminOverviewOf(input, now = nowMs()) {
  const saves = admObj(input && input.saves) ? input.saves : {}, status = admObj(input && input.status) ? input.status : {};
  const list = asList(input && input.members).filter(admObj).slice().sort((a, b) => admNum(a.joinedAt) - admNum(b.joinedAt) || String(a.uid).localeCompare(String(b.uid)));
  const rows = list.map((m, i) => {
    try { return adminRow(m, saves[m.uid] || null, status[m.uid], now, i + 1); }
    catch (e) { return { no: i + 1, nick: admNick(m.nick), state: "offline", room: null, lastSeenAt: null, savedAt: null, todayOnline: false, summary: { ok: false } }; }
  });
  return { at: now, total: rows.length, todayOnline: rows.filter(r => r.todayOnline).length, onlineNow: rows.filter(r => r.state !== "offline").length, rows: adminSortRows(rows), reports: adminCoopReports(input && input.reports) };
}

// ---------- 畫面上的字 ----------
export function adminAgo(ms, now = nowMs()) {
  if (typeof ms !== "number") return "還沒來過";
  const m = Math.max(0, Math.round((now - ms) / 60000));
  if (m < 2) return "剛剛";
  if (m < 60) return `${m} 分鐘前`;
  if (m < 1440) return `${Math.round(m / 60)} 小時前`;
  return `${Math.round(m / 1440)} 天前`;
}
// 台灣時間，例如 11/09 08:52
export function adminTimeText(ms) {
  if (typeof ms !== "number") return "沒有";
  const s = new Date(ms + 8 * 3600000).toISOString();
  return `${s.slice(5, 7)}/${s.slice(8, 10)} ${s.slice(11, 16)}`;
}
export function adminPlayText(sec) {
  const m = Math.floor(admNum(sec) / 60);
  if (m < 1) return "不到 1 分鐘";
  return m < 60 ? `${m} 分鐘` : `${Math.floor(m / 60)} 小時 ${m % 60} 分鐘`;
}
