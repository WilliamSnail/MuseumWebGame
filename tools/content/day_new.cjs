// 今天的 dN.json 骨架（11-16 每日排程優化：以前 Claude 自己手打整個結構，格式錯了要等 day:check 才知道，重改）
//   npm run day:new                       照今天（day_plan 的判斷：台灣日期，05:00 換日）產生 content/weeks/<週>/dN.json 骨架
//   npm run day:new -- --date 2026-11-18  指定日期
// 骨架有：day、date、holiday、公佈欄、書（週日自動多結局書、主線章節書的空殼）、3 個每日任務、今日特展 3 幅（svg 先放 stub）、market（平日）、adds。
//   要填的地方都寫「待寫」：day:check --strict 看到「待寫」會擋，所以沒填完不能上線。
//   今天是揭露日：第壹本書先掛 clue 的空位；週日：印出要做的事（結局、主線章、answer、回聲週的進展）。
//   昨天留的鉤子（帳本 weeks.<週>.hooks）印在最上面，今天的開頭要接它。
// 已經有檔就不覆蓋：只印它還差什麼（缺的欄位、day:check --strict 會擋的項目）。
// 週一另外建 靈感來源.md 的表頭（沒有的話），而且這週的 week.json 還沒有的話也產生骨架（11-16 第二批）：title／theme／question／summary、lines（這週的 week 線、主線 main-sN、季節線）、
//   weekly 5 個空殼、weeklyBonus、ending；新一季頭一週的 summary 第壹行自動寫「📖 主線第 N 季〈季名〉開始：第壹章〈章名〉」。要填的寫「待寫」，day:check --strict 會擋。
//   answer 週日才寫，骨架不放（印提醒）；events／casino／npc／fest／anomaly 是選填，骨架不放（day:plan 會建議）；帳本 unit／unitRole 印提醒。已經有 week.json 不覆蓋。
const fs = require("fs"), path = require("path");
const { asList, isObj, isMainBook, CONTENT_PLACEHOLDER: TODO } = require("./day_lib.cjs");
const ROOT = path.join(__dirname, "..", "..");

// svg 不能放註解（week_check 擋 <!），所以 stub 只是壹塊深色；「待寫」的記號放在標題和說明
const stubSvg = () => ["<svg viewBox='0 0 240 300'>", "<rect width='240' height='300' fill='#222'/>", "</svg>"];
const work = (n, i, frame) => ({ id: `s${n}${"abcde"[i]}`, frame, fx: [], title: TODO, lines: [TODO], svg: stubSvg() });

// 這週主線是第幾季（帳本 main.seasons 裡，哪一季有這週的章）；序章（season 0）→ main-s0
function seasonNo(ledger, week) {
  const s = asList(ledger && ledger.main && ledger.main.seasons).find(x => x && asList(x.chapters).some(c => c && c.week === week));
  return s && Number.isInteger(s.season) ? s.season : null;
}
// 昨天留的鉤子：這週 hooks 裡「d(N-1)：」那行；週一看上週最後壹行（純函式，測試用）
function yesterdayHook(ledger, week, prevWeek, n) {
  const w = ledger && ledger.weeks, pick = (rec, k) => asList(rec && rec.hooks).filter(h => typeof h === "string" && new RegExp(`^d${k}\\s*[：:]`).test(h.trim()));
  if (n > 1) return pick(w && w[week], n - 1).pop() || null;
  const prev = asList(w && w[prevWeek] && w[prevWeek].hooks).filter(h => typeof h === "string" && /^d\d\s*[：:]/.test(h.trim()));
  return prev.pop() || null;
}
// 骨架（純函式，測試用）。p：planDay 的結果；wk：這週的 week.json（沒有給 null）；ledger：整份帳本
function skeleton(p, wk, ledger) {
  const n = p.weekday, lines = asList(wk && wk.lines), weekLine = (lines.find(l => l && l.kind === "week") || {}).id || TODO;
  const holiday = p.holiday ? (typeof p.holiday === "string" ? p.holiday : p.holiday.name || null) : null;
  const book = (id, extra = {}) => ({ id, line: weekLine, title: TODO, spine: TODO, unlock: { type: "now" }, pages: [TODO, TODO, TODO], ...extra });
  const books = [book(`${n}a`, p.isBeatDay ? { clue: `c-${TODO}` } : {})];
  if (n === 7) {
    books.push(book(`${n}end`, { ending: true }));
    const no = seasonNo(ledger, p.week);
    books.push(book(`${n}main`, { line: `main-s${no === null ? "N" : no}`, pages: [TODO, TODO, TODO, TODO] }));
  }
  const d = {
    day: n, date: p.date, holiday, board: TODO, books,
    daily: [{ id: `d${n}a`, kind: "read", book: `${n}a`, reward: { insp: 2 } }, { id: `d${n}b`, kind: "view", exhibit: "portrait", reward: { insp: 2 } }, { id: `d${n}c`, kind: "make", need: { 顏色: "綠" }, reward: { mood: 5 } }],
    dailyBonus: { items: ["mat:畫布"] },
    weeklyWords: [],
    show: { title: TODO, intro: TODO, works: [work(n, 0, "wood"), work(n, 1, "gold"), work(n, 2, "plain")] },
    adds: [],
  };
  if (!p.market.weekend) d.market = [TODO, TODO, TODO];
  return d;
}
const SKEL_KEYS = ["day", "date", "holiday", "board", "books", "daily", "show", "adds"];

// 要印的提醒（純函式，測試用）：昨天的鉤子、今天的揭露、週日的事
function notes(p, wk, ledger, G) {
  const L = [], prevWeek = G.isoWeek(G.addDays(p.monday, -7)), hook = yesterdayHook(ledger, p.week, prevWeek, p.weekday);
  L.push(hook ? `昨天留的鉤子（今天的開頭要接）：${hook}` : "昨天的鉤子：帳本裡找不到（週一或昨天沒寫 hooks），照 weeks.<週>.question／hooks／motifs 自己接");
  if (p.isBeatDay && p.beat.beat) {
    const b = p.beat.beat;
    L.push(`★今天是揭露日 ${b.id}：${b.detail}`, `  放的地方：${asList(b.channels).map(c => c.where + (c.clue ? "（要 clue）" : "")).join("、")}；第壹本書的 clue 先掛了空位，換成真的 id；放完跑 npm run ledger -- reveal ${b.id}${asList(p.beat.extras).map(x => " " + x.id).join("")}`);
  }
  if (p.weekday === 7) {
    const no = seasonNo(ledger, p.week), hasMain = asList(wk && wk.lines).some(l => l && l.kind === "main");
    L.push("★週日：", "  1. 結局書（7end）答這週的疑點，留壹個接下週的鉤子；", `  2. 主線章節書（7main，line main-s${no === null ? "N" : no}）${hasMain ? "" : "——week.json 的 lines 還沒有那條 kind main 的線，要加：{ id, name, kind: \"main\" }（跨週同 id、同名）"}；`, "  3. week.json 要寫 answer（這週疑點簿的答案，不破梗）；");
    if (p.unit && p.unit.which === 2) L.push(`  4. 回聲週週日：做「第 ${p.unit.no} 段」的進展（地圖亮壹塊：館外.json 加點後 node tools/content/map_pack.cjs；主線書最後多壹頁「這壹段」；NPC 日報壹句）；放完 npm run ledger -- written`);
  }
  if (p.chapters.some(c => !c.written)) L.push(`季節線這週的章還沒放書：${p.chapters.filter(c => !c.written).map(c => c.line + "「" + c.title + "」").join("、")}（放了以後 npm run ledger -- written 會填 written）`);
  return L;
}
// 已經有檔：差什麼（純函式，測試用）。回傳要印的行
function missingNotes(existing, skel) {
  return SKEL_KEYS.filter(k => existing[k] === undefined && skel[k] !== undefined).map(k => `缺欄位 ${k}`);
}


// ---------- 週一的 week.json 骨架 ----------
const NUMS = ["零", "壹", "貳", "參", "肆", "伍", "陸", "柒", "捌", "玖", "拾"];
// 這週在帳本 main.seasons 的哪一季，是不是那一季的第壹週：{ season, name, first, chapter }；不在任何一季回 null
function seasonOf(ledger, week) {
  const s = asList(ledger && ledger.main && ledger.main.seasons).find(x => x && asList(x.weeks).includes(week));
  if (!s || !Number.isInteger(s.season)) return null;
  const ch = asList(s.chapters).find(c => c && c.week === week);
  return { season: s.season, name: String(s.name || ""), first: asList(s.weeks)[0] === week, chapter: ch && typeof ch.title === "string" ? ch.title : "" };
}
// 「第壹章　多壹隻」→「第壹章〈多壹隻〉」；沒有全形空白就整個放進〈〉
function chapterLabel(title) {
  const m = /^(\S+?)[　 ]+(.+)$/.exec(String(title || "").trim());
  return m ? `${m[1]}〈${m[2]}〉` : `〈${String(title || "").trim() || TODO}〉`;
}
// 新壹季頭壹週的 summary 第壹行（排程說明第壹節「新壹季的頭壹週」）；不是頭壹週、或序章（season 0）回 null
function seasonOpenLine(so) {
  if (!so || !so.first || so.season < 1) return null;
  return `📖 主線第 ${so.season} 季〈${so.name}〉開始：${chapterLabel(so.chapter)}`;
}
const seasonName = so => so.season === 0 ? so.name : `第${NUMS[so.season] || so.season}季　${so.name}`;
// p：planDay 的結果；ledger：整份帳本；prevWk：上壹週的 week.json（沒有給 null，主線線的名字、weeklyBonus 照它）
function weekSkeleton(p, ledger, prevWk) {
  const wn = p.week.split("-W")[1], so = seasonOf(ledger, p.week), open = seasonOpenLine(so);
  const lines = [{ id: `w${wn}-${TODO}`, name: TODO, kind: "week" }];
  if (so) {
    const id = `main-s${so.season}`, prevMain = asList(prevWk && prevWk.lines).find(l => l && l.id === id);
    lines.push({ id, name: prevMain && prevMain.name || seasonName(so), kind: "main" });
  }
  asList(ledger && ledger.seasonal && ledger.seasonal.lines).forEach(l => {
    if (l && asList(l.chapters).some(c => c && c.week === p.week)) lines.push({ id: l.id, name: l.name, kind: "season" });
  });
  const bonus = prevWk && isObj(prevWk.weeklyBonus) ? prevWk.weeklyBonus : { insp: 10, items: ["mat:金線"] };
  return {
    week: p.week, start: p.monday, title: TODO, theme: TODO, holidayWeek: false, question: TODO,
    summary: [open || TODO, TODO],
    lines,
    weekly: [
      { id: "w1", kind: "spot", room: TODO, reward: { insp: 6 } },
      { id: "w2", kind: "spot", room: TODO, reward: { insp: 6 } },
      { id: "w3", kind: "readWeek", n: 6, reward: { insp: 8 } },
      { id: "w4", kind: "dailyAll", n: 3, reward: { mood: 10 } },
      { id: "w5", kind: "ending", reward: { insp: 8 } },
    ],
    weeklyBonus: bonus,
    ending: { need: { read: 6 } },
  };
}
// 週一建 week.json 時要印的提醒（純函式，測試用）
function weekNotes(p, ledger) {
  const L = [], so = seasonOf(ledger, p.week), rec = ledger && ledger.weeks && ledger.weeks[p.week];
  L.push(`★週一：建了 ${p.week}/week.json 骨架：每個「${TODO}」換成真的內容（title 16 字內、question 40 字內、summary 2～5 行；weekly 的 spot 要指到週一就有的房間；lines 的「${TODO}」是這週的線，d1 的書掛它）`);
  if (so) L.push(`  這週在第 ${so.season} 季〈${so.name}〉${so.first && so.season >= 1 ? "的頭壹週：summary 第壹行已經寫好「📖 主線…開始」，不要刪" : "：lines 已經放了主線 main-s" + so.season + "（名字跟上週壹樣）"}`);
  else L.push("  這週不在帳本 main.seasons 的任何壹季：lines 沒有主線的線，確認是不是備用週或帳本漏了");
  if (p.unit) L.push(`  帳本 weeks.${p.week} 要寫 unit: "${p.unit.id}"、unitRole: "${p.unit.which === 1 ? "beat" : "echo"}"（第 ${p.unit.no} 段的第 ${p.unit.which} 週）${rec ? "" : "（帳本還沒有這週）"}`);
  L.push("  骨架沒放的選填欄位（要的話自己加，day:plan 會建議）：anomaly 本週異狀、events 活動、casino 賭場收藏（要先在 lines 加線）、npc、fest、shop");
  L.push("  answer（疑點簿的答案）週日才寫，現在不用放；--strict 週日會擋沒寫的");
  return L;
}

const INSPIRE_HEAD = (week) => `# ${week} 靈感來源\n\n> 只給審的人看，不進網頁。\n\n| 新聞 | 取了什麼元素 | 在遊戲裡變成什麼 | 為什麼安全 |\n|---|---|---|---|\n| ${TODO} | ${TODO} | ${TODO} | ${TODO} |\n`;

function main() {
  const { load } = require("../../test/load_shared.cjs"), G = load(), a = process.argv.slice(2), i = a.indexOf("--date");
  const { planDay, gatherFor } = require("./day_plan.cjs"), { strictIssues } = require("./day_check.cjs");
  const date = i >= 0 ? a[i + 1] : G.taipeiDay(Date.now()), ctx = gatherFor(date, G), p = planDay(ctx), pack = ctx.weeks[p.week];
  if (p.paused) { console.log(`${date}（${p.week}）暫停中：什麼都不寫（排程說明第五節）。`); return; }
  const wk = pack && pack.week || null, file = path.join(ROOT, p.dayFile), existing = pack && pack.days && pack.days[p.weekday] || null;
  console.log(`今天：${date}（${p.weekdayName}，${p.week} d${p.weekday}）`);
  notes(p, wk, ctx.ledger, G).forEach(x => console.log(x));
  let wkNow = wk;
  if (p.isMonday && !wk) { // 週一、這週的 week.json 還沒有：建骨架（已經有的不覆蓋）
    const prevPack = ctx.weeks[G.isoWeek(G.addDays(p.monday, -7))], wf = path.join(ROOT, "content", "weeks", p.week, "week.json");
    wkNow = weekSkeleton(p, ctx.ledger, prevPack && prevPack.week || null);
    fs.mkdirSync(path.dirname(wf), { recursive: true });
    fs.writeFileSync(wf, JSON.stringify(wkNow, null, 2) + "\n");
    console.log(`建好了 ${path.relative(ROOT, wf)}`);
    weekNotes(p, ctx.ledger).forEach(x => console.log(x));
  }
  const skel = skeleton(p, wkNow, ctx.ledger);
  if (existing) {
    console.log(`\n${p.dayFile} 已經有了：不覆蓋。`);
    const miss = missingNotes(existing, skel), E = strictIssues({ p, day: existing, wk, ledger: ctx.ledger, opts: {} });
    [...miss, ...E].forEach(x => console.log("  還差：" + x));
    if (!miss.length && !E.length) console.log("  --strict 要的都有了。");
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(skel, null, 2) + "\n");
  console.log(`\n建好了 ${p.dayFile}：把每個「${TODO}」換成真的內容（改好才過得了 npm run day:check -- --strict）`);
  const ins = path.join(path.dirname(file), "靈感來源.md");
  if (p.isMonday && !fs.existsSync(ins)) { fs.writeFileSync(ins, INSPIRE_HEAD(p.week)); console.log(`建好了 ${path.relative(ROOT, ins)}（表頭）`); }
}
if (require.main === module) { try { main(); } catch (e) { console.error("✗ " + e.message); process.exit(1); } }
module.exports = { weekSkeleton, weekNotes, seasonOf, seasonOpenLine, chapterLabel, skeleton, notes, yesterdayHook, missingNotes, seasonNo, SKEL_KEYS };
