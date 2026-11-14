// 每天 08:00 的排程先跑這支：npm run day:plan（翊文 2026-11-14：「稍微檢查一下每日排程要做的是，能不能優化，讓他方便做完事情，需要腳本也可以」）
// 印出「今天要做什麼」：今天是週幾、這週是不是揭露週／回聲週／大揭曉週、週包缺什麼（npc、fest）、哪些 NPC 該補故事段、
// 今天要不要寫世界股市新聞、要建立哪些檔、最後要跑哪些指令。只讀檔、不寫任何東西。
//
//   npm run day:plan                    用現在的台灣日期（遊戲的今天，05:00 換日）
//   npm run day:plan -- --date 2026-11-17   指定日期（測試、預排用）
//   npm run day:plan -- --json          印成 JSON（給別的工具用）
//   npm run day:plan -- --week          這壹週七天的節日、趣味節日、帳本 calendar
//
// 規矩的詳細在 content/排程說明.md（最上面的清單會指到每一節）。這支只做「查表」：判斷用的函式都是純函式，test/day_plan.test.cjs 用假資料測。
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");

const STORES = ["food", "bj", "job", "cellar", "craft"]; // week.json 的 npc、fest 能用的店（content/排程說明.md 一之九之二）
const STORE_NAME = { food: "餐車", bj: "牌桌", job: "委託櫃台", cellar: "地下收藏庫", craft: "手作坊" };
const GDP_MONTHS = [1, 2, 4, 5, 7, 8, 10, 11]; // 主計總處概估、初步統計大約月底公布
const WEEKLY_KEYS = ["main", "ties", "news", "question", "motifs", "hooks"]; // 週一一定要寫進帳本 weeks.<週> 的欄位
const WD = "一二三四五六日";
const asList = v => Array.isArray(v) ? v : v ? [v] : [];
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);

// ---------- 純函式（測試用） ----------

// 最近幾週用過哪些店（npc、fest 都算），店用得少的排前面。recent：[{ npc, fest }]（週包的欄位，可以是 undefined）
function suggestStores(recent, n = 3) {
  const used = {}; STORES.forEach(s => { used[s] = 0; });
  asList(recent).forEach(w => {
    if (!isObj(w)) return;
    if (isObj(w.npc) && used[w.npc.store] !== undefined) used[w.npc.store]++;
    asList(w.fest).forEach(f => { if (isObj(f) && used[f.store] !== undefined) used[f.store]++; });
  });
  return STORES.map((s, i) => ({ store: s, used: used[s], i })).sort((a, b) => a.used - b.used || a.i - b.i).slice(0, n).map(x => ({ store: x.store, name: STORE_NAME[x.store], used: x.used }));
}

// 週包缺什麼：npc（每週最多 1）、fest（每週最多 2）。有就不缺
function weekGaps(wk) {
  if (!isObj(wk)) return { npc: true, fest: 2 };
  return { npc: !isObj(wk.npc), fest: Math.max(0, 2 - asList(wk.fest).length) };
}

// 這週是什麼週。G：shared（isoWeek、addDays、weekMonday）；回傳揭露週／回聲週／大揭曉週
function beatInfo(ledger, week, monday, G) {
  const list = asList(ledger && ledger.revealBeats && ledger.revealBeats.list), mys = asList(ledger && ledger.mysteries && ledger.mysteries.list);
  const prevWeek = G.isoWeek(G.addDays(monday, -7));
  const here = list.find(b => b && b.week === week && !b.extra) || null, prev = list.find(b => b && b.week === prevWeek && !b.extra) || null;
  const extras = list.filter(b => b && b.week === week && b.extra && b.status !== "skipped"); // 加開的揭露（翊文 11-14：館外壹個月內揭）
  const closing = mys.filter(m => m && m.closeBy === week && m.status !== "closed").map(m => m.id);
  const rec = ledger && ledger.weeks && ledger.weeks[week], planned = rec && isObj(rec.beat) ? rec.beat : null;
  let kind = "一般週";
  if (closing.length) kind = "大揭曉週";
  else if (here && here.status !== "skipped") kind = "揭露週";
  else if (prev && prev.status !== "skipped") kind = "回聲週";
  return { kind, beat: here, extras, prev, closing, plannedDay: planned ? planned.day || "d3" : null, planned: !!planned, echoOf: rec && rec.echoOf || null };
}

// 哪些 NPC 該補故事段：沒有排到下週以後的段、而且還沒到 6 段。旅客數量也看一下（25～30，翊文 11-14：展廳要常有人）
function npcNeeds(npcs, date, monday, G) {
  const sunday = G.addDays(monday, 6), people = asList(npcs).filter(n => isObj(n) && n.kind !== "trace");
  const row = n => { const arc = asList(n.arc), up = arc.filter(a => a.from > date); return { id: n.id, name: n.name, kind: n.kind, steps: arc.length, upcoming: up.length, last: arc.length ? arc[arc.length - 1].from : null, ties: arc.length ? asList(arc[arc.length - 1].ties) : [] }; };
  const rows = people.map(row);
  const need = rows.filter(r => r.steps < 6 && r.upcoming === 0).sort((a, b) => a.steps - b.steps || (a.id < b.id ? -1 : 1));
  const thisWeek = [];
  people.forEach(n => asList(n.arc).forEach(a => { if (a.from >= monday && a.from <= sunday) thisWeek.push({ id: n.id, name: n.name, step: a.step, from: a.from, ties: asList(a.ties) }); }));
  thisWeek.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.id < b.id ? -1 : 1));
  const visitors = people.filter(n => n.kind === "visitor").length;
  return { need, thisWeek, visitors, visitorsLow: visitors < 25, visitorsFull: visitors >= 30 };
}
// 揭露週：帳本 channels 指定的 NPC，這週有沒有段可以回應
function beatNpcGaps(beat, npcs, monday, G) {
  if (!beat) return [];
  const sunday = G.addDays(monday, 6), ids = [...new Set(asList(beat.channels).flatMap(c => asList(c && c.npc)))];
  return ids.map(id => { const n = asList(npcs).find(x => x && x.id === id); const has = !!n && asList(n.arc).some(a => a.from >= monday && a.from <= sunday); return { id, name: n && n.name, has }; }).filter(x => !x.has);
}

// GDP 要不要查：公布月份的月底前後（26 號到隔月 2 號）
function gdpWindow(date) {
  const m = +date.slice(5, 7), d = +date.slice(8, 10), prev = m === 1 ? 12 : m - 1;
  return (GDP_MONTHS.includes(m) && d >= 26) || (GDP_MONTHS.includes(prev) && d <= 2);
}

// 已經寫好的 dN.json，缺哪些「每天該有」的東西（只看有沒有，品質看 week_check）
function dayGaps(d, n) {
  if (!isObj(d)) return null;
  const s = JSON.stringify(d), works = asList(d.show && d.show.works);
  return {
    books: asList(d.books).length, clue: s.includes("\"clue\""), market: asList(d.market).length > 0, real: asList(d.real).length > 0,
    svg: works.filter(w => w && w.svg).length, weeklyWords: asList(d.weeklyWords).length, casino: isObj(d.casino), cellar: d.cellar !== undefined,
    ending: n === 7 ? asList(d.books).some(b => b && b.ending) : null,
  };
}

// ---------- 節日配活動（翊文 11-14：「可以查有什麼特殊節日來有理由舉辦活動」）----------
// 預告的活動（fest）和劇情日（npc）盡量放在有趣味節日或節日的那天：名字和店照那天的節日配（酸黃瓜日 → 餐車《酸黃瓜開動日》）。
// 店的判斷看節日的名字有沒有關鍵字；沒有關鍵字的，補給最近用得少的店。名字只是起點，要改成接得上那天 line 的館內說法
const FUN_STORE_WORDS = {
  food: ["餅", "糕", "麵", "包", "茶", "咖啡", "黃瓜", "餐", "脆片", "三明治", "派", "蛋糕", "果", "糖", "披薩", "聖代", "吐司", "蔓越莓", "濃縮", "酥", "巧克力", "冰", "湯", "蛋", "起司", "奶", "肉", "餃", "飯", "薯", "炸", "鬆餅", "甜甜圈", "布朗尼", "堅果", "杏仁", "食", "餃", "醬", "蜜", "甜"],
  craft: ["拼圖", "填字", "帽", "書", "紙", "卡", "畫", "縫", "織", "字典", "字", "筆", "手作", "摺", "折", "氣球", "泡泡", "積木", "鈕扣", "線", "拼貼", "貼"],
  cellar: ["土", "鼴", "莫耳", "洞", "礦", "石", "探險", "地下", "影", "鼠", "樹懶", "章魚"],
  bj: ["牌", "骰", "猜", "賭", "籌", "撲克", "賓果", "幸運", "擲", "謎"],
  job: ["工", "委託", "郵", "信", "擁抱", "微笑", "感謝", "問候", "朋友", "志工", "服務", "握手"],
};
const FEST_SUFFIX = { food: "開動日", craft: "動手日", cellar: "探險日", bj: "牌桌夜", job: "委託日" };
function funStore(name) {
  const s = String(name || "");
  let best = null, bestN = 0;
  Object.entries(FUN_STORE_WORDS).forEach(([store, words]) => { const n = words.filter(w => s.includes(w)).length; if (n > bestN) { best = store; bestN = n; } });
  return best;
}
function storeUsage(recent) {
  const used = {}; STORES.forEach(s => { used[s] = 0; });
  asList(recent).forEach(w => { if (!isObj(w)) return; if (isObj(w.npc) && used[w.npc.store] !== undefined) used[w.npc.store]++; asList(w.fest).forEach(f => { if (isObj(f) && used[f.store] !== undefined) used[f.store]++; }); });
  return used;
}
const festName = (itemName, store) => String(itemName || "").replace(/日$/, "") + FEST_SUFFIX[store];
// 這壹週每天的日子：[{ date, dayNo, items: [{ kind: "趣味"|"節日", name, line }] }]。預告要提前 2 天，所以只看 d3 以後
function weekItems(monday, G) {
  const out = [];
  for (let i = 2; i < 7; i++) {
    const d = G.addDays(monday, i), items = [];
    const h = G.holidayOf ? G.holidayOf(d) : null; if (h) items.push({ kind: "節日", name: typeof h === "string" ? h : h.name || "", line: h && h.line || "" });
    asList(G.funDaysOf ? G.funDaysOf(d) : []).forEach(f => { if (f) items.push({ kind: "趣味", name: f.name || String(f), line: f.line || "" }); });
    if (items.length) out.push({ date: d, dayNo: i + 1, items });
  }
  return out;
}
// 挑 fest（最多 gaps.fest 個）和 npc（有缺才挑）。回傳 { fest: [{ date, store, name, day, why }], npc: {…}|null, missing, hint }
function suggestFest(days, recent, gaps) {
  const used = storeUsage(recent), cand = [];
  days.forEach(d => d.items.forEach(it => cand.push({ date: d.date, dayNo: d.dayNo, item: it, store: funStore(it.name) })));
  const taken = new Set(), dates = new Set(), picks = [];
  const take = (c, store, matched) => { taken.add(store); dates.add(c.date); used[store]++; picks.push({ date: c.date, dayNo: c.dayNo, store, storeName: STORE_NAME[store], name: festName(c.item.name, store), day: `${c.item.kind}：${c.item.name}`, line: c.item.line, matched }); };
  const need = (gaps.fest || 0) + (gaps.npc ? 1 : 0);
  // 第壹輪：名字對得上店的，店用得少的先；壹家店壹天最多壹個，同壹天只選壹個
  cand.filter(c => c.store).sort((a, b) => used[a.store] - used[b.store] || (a.date < b.date ? -1 : 1)).forEach(c => { if (picks.length < need && !taken.has(c.store) && !dates.has(c.date)) take(c, c.store, true); });
  // 第二輪：對不上店的節日，補給最近用得少的店
  cand.filter(c => !dates.has(c.date)).forEach(c => { if (picks.length >= need) return; const free = STORES.filter(s => !taken.has(s)).sort((a, b) => used[a] - used[b] || STORES.indexOf(a) - STORES.indexOf(b))[0]; if (free) take(c, free, false); });
  picks.sort((a, b) => (a.date < b.date ? -1 : 1));
  const fest = picks.slice(0, gaps.fest || 0), rest = picks.slice(gaps.fest || 0);
  const npc = gaps.npc ? (rest[0] || null) : null;
  const missing = Math.max(0, need - picks.length);
  return { fest, npc, missing, days: days.length, hint: missing ? `這週 d3 以後的節日和趣味節日只有 ${days.length} 天、不夠 ${need} 個：可以上網查真實的特殊日、國際日（例如國際某某日），改成館內的名字，並把它加進 shared/holidays.js 的 FUN_INFO 和 shared/content3.js 的 FUN_TEXT（排程說明 一之九之三），再排活動` : "" };
}

// 全部組起來。input：{ date, G, ledger, settings, weeks（{週: { week, days:{n:obj} }}）, recent（最近幾週的 week.json 陣列）, npcs, economy, weekDirs（有哪些週資料夾）}
function planDay(input) {
  const { date, G, ledger = null, settings = null, weeks = {}, recent = [], npcs = [], economy = null } = input;
  const n = G.weekDayNo(date), monday = G.weekMonday(date), week = G.isoWeek(date), isMonday = n === 1;
  const pack = weeks[week] || null, wk = pack && pack.week || null, dayObj = pack && pack.days && pack.days[n] || null;
  const paused = !!(settings && (settings.pause === true || asList(settings.pauseWeeks).includes(week)));
  const beat = beatInfo(ledger, week, monday, G), rec = ledger && ledger.weeks && ledger.weeks[week] || null;
  const dateMD = date.slice(5);
  const cal = asList(ledger && ledger.calendar && ledger.calendar.days).filter(x => x && x.date === dateMD);
  const chapters = [];
  asList(ledger && ledger.seasonal && ledger.seasonal.lines).forEach(l => asList(l && l.chapters).forEach(c => { if (c && c.week === week) chapters.push({ line: l.id, title: c.title, written: c.written || null }); }));
  const gaps = weekGaps(wk), dir = `content/weeks/${week}`;
  const files = isMonday ? [`${dir}/week.json`, `${dir}/d1.json`, `${dir}/靈感來源.md`] : [`${dir}/d${n}.json`];
  if (!isMonday && pack && pack.days && pack.days[n]) files.length = 0;
  const hooks = asList(rec && rec.hooks), hookToday = hooks.some(h => typeof h === "string" && h.startsWith(`d${n}：`) || typeof h === "string" && h.startsWith(`d${n}:`));
  const missingWeekly = isMonday ? WEEKLY_KEYS.filter(k => !rec || !(Array.isArray(rec[k]) ? rec[k].length : rec[k])) : [];
  const out = {
    date, weekday: n, weekdayName: "週" + WD[n - 1], week, monday, isMonday, paused,
    branch: `claude/週劇情-${week}${isMonday ? "" : "-d" + n}`,
    weekExists: !!pack, weekJsonExists: !!wk, dayExists: !!dayObj, dayFile: `${dir}/d${n}.json`, files,
    holiday: G.holidayOf ? G.holidayOf(date) : null, funDays: G.funDaysOf ? G.funDaysOf(date) : [], calendar: cal, chapters,
    beat, beatDay: beat.kind === "揭露週" ? (beat.plannedDay || "d3") : null,
    isBeatDay: beat.kind === "揭露週" && (beat.plannedDay || "d3") === `d${n}`,
    gaps: isMonday ? gaps : { npc: false, fest: 0 }, weekGapsNow: gaps,
    suggest: isMonday && (gaps.npc || gaps.fest) ? suggestStores(recent, gaps.fest + (gaps.npc ? 1 : 0)) : [],
    festPlan: isMonday && (gaps.npc || gaps.fest) ? suggestFest(weekItems(monday, G), recent, gaps) : null,
    npc: npcNeeds(npcs, date, monday, G), beatNpc: beat.kind === "揭露週" ? beatNpcGaps(beat.beat, npcs, monday, G) : [],
    market: { weekend: n >= 6 },
    gdp: { window: gdpWindow(date), quarter: economy && economy.gdp && economy.gdp.quarter || null, published: economy && economy.gdp && economy.gdp.published || null },
    ledgerMissing: missingWeekly, hookToday, hooksCount: hooks.length,
    dayGaps: dayGaps(dayObj, n), isEndingDay: n === 7,
  };
  out.title = `週劇情 ${week}${isMonday ? "" : " d" + n}`;
  out.commands = commandsFor(out);
  return out;
}

function commandsFor(p) {
  const c = [];
  c.push(`git fetch origin && git checkout -b ${p.branch} origin/main`);
  c.push("npm run ledger -- today    （帳本只看跟這週有關的；改帳本用 npm run ledger -- set／push <路徑> <值>，不要整份重寫）");
  c.push(`npm run svg -- ${p.dayFile}    （今日特展有畫新圖才跑；用 Read 打開 PNG 親眼看過）`);
  c.push("npm run day:check    （所有內容檢查壹次跑完；沒過不要往下）");
  c.push(`npm run doc:new -- <日誌.json>    （類型「內容」；會順便跑 log:index）`);
  c.push(`npm run ship -- --title "${p.title}" --body-file <PR 說明.md>    （測試、合併、等部署都在裡面；PR 說明要貼檢查的警告）`);
  c.push("gh workflow run discord-scheduled.yml --ref main    （部署成功才跑；今日館訊會發出，揭露週那天後面多壹則「館裡有些不壹樣了」）");
  return c;
}

// ---------- 印出來 ----------
function format(p) {
  const L = [], B = (s = "") => L.push(s), mark = ok => ok ? "✓" : "☐";
  B(`今天：${p.date}（${p.weekdayName}，d${p.weekday}）　週：${p.week}${p.isMonday ? "　★週一：要排這壹週" : ""}`);
  B(`分支：${p.branch}`);
  if (p.paused) { B(""); B("★ 暫停中（排程設定.json 的 pause 或 pauseWeeks）：什麼都不寫，帳本 weeks 記壹下就好（排程說明第五節）。"); return L.join("\n"); }
  B(`週包：${p.weekJsonExists ? "已經有" : p.isMonday ? "還沒有，今天要寫" : "★ 還沒有（週一沒寫成？先補週包，或走第五節的備用週）"}　今天的檔：${p.dayExists ? "已經有" : "還沒有"}`);
  const day = [];
  if (p.holiday) day.push(`節日：${typeof p.holiday === "string" ? p.holiday : p.holiday.name || JSON.stringify(p.holiday)}`);
  asList(p.funDays).forEach(f => day.push(`趣味節日：${f && f.name || f}`));
  p.calendar.forEach(c => day.push(`帳本 calendar：${c.name}（${c.idea}）`));
  if (day.length) { B(""); B("【今天的日子】"); day.forEach(x => B("  " + x)); }
  B(""); B(`【這週是：${p.beat.kind}】`);
  if (p.beat.kind === "揭露週" && p.beat.beat) {
    const b = p.beat.beat;
    B(`  ${b.id}（${b.mystery}）：${b.detail}`);
    B(`  放的地方：${asList(b.channels).map(c => c.where + (c.clue ? "★clue" : "")).join("、")}　（★ 的要加 "clue": id）`);
    B(`  預定放：${p.beatDay}${p.isBeatDay ? "　★就是今天" : ""}　帳本 weeks.${p.week}.beat：${p.beat.planned ? "已經寫" : (p.isMonday ? "週一要寫" : "★還沒寫，補上")}`);
    B(`  放完要做：帳本 revealBeats 那筆 status→revealed、revealedOn、clues；mysteries 對應的線索補「已放」；PR 只寫「揭露節奏：第 N 次」`);
    if (b.concrete) B(`  這筆可以更具體（concrete）：${b.safe}`);
    if (p.beatNpc.length) B(`  NPC 要補壹段回應：${p.beatNpc.map(x => x.id + (x.name ? "（" + x.name + "）" : "")).join("、")}`);
    B(`  Discord：揭露的那壹天，館訊後面會自動多發「館裡有些不壹樣了」（日期照 revealedOn，沒標就是週三），不用另外發。`);
  } else if (p.beat.kind === "回聲週") {
    B(`  回聲：把上壹個揭露（${p.beat.prev.id}：${p.beat.prev.detail}）換個地方再出現壹次；帳本 weeks.${p.week}.echoOf 寫 ${p.beat.prev.id}。不放新細節。`);
    B(`  上次的 echo 提示：${p.beat.prev.echo || "（沒寫）"}`);
  } else if (p.beat.kind === "大揭曉週") {
    B(`  收線：${p.beat.closing.join("、")}（照 mysteries 的 closeBy，在當天 dN.json 加 understand；2027-W43 收尾前先問翊文）`);
    if (p.beat.beat) B(`  同週還有揭露 ${p.beat.beat.id}（${p.beat.beat.mystery}）：${p.beat.beat.detail}（放的地方：${asList(p.beat.beat.channels).map(c => c.where + (c.clue ? "★clue" : "")).join("、")}）`);
  } else B("  不是揭露週也不是回聲週：照原來排，每天至少壹條 clue。");
  asList(p.beat.extras).forEach(x => { B(`  加開（extra，館外壹個月內揭）${x.id}（${x.mystery}）：${x.detail}`); B(`    放的地方：${asList(x.channels).map(c => c.where + (c.clue ? "★clue" : "")).join("、")}；放完壹樣改 revealed、revealedOn、clues；不另外發 Discord`); if (x.concrete) B(`    更具體（concrete）：${x.safe}`); });
  if (p.chapters.length) { B(""); B("【季節線】"); p.chapters.forEach(c => B(`  ${c.line}「${c.title}」：${c.written ? "已放（" + c.written + "）" : "★還沒放書，這週某壹天放，放了把 written 填書的 id"}`)); }
  if (p.isMonday) {
    B(""); B("【週一要排的（week.json）】");
    B(`  ${mark(!p.gaps.npc)} npc（劇情日，每週最多 1）：${p.gaps.npc ? "還沒寫" : "已有"}`);
    B(`  ${mark(p.gaps.fest === 0)} fest（預告的活動，每週最多 2）：${p.gaps.fest ? "還缺 " + p.gaps.fest + " 個" : "已有 2 個"}`);
    if (p.festPlan) {
      const f = p.festPlan, row = x => `${x.date.slice(5)}（d${x.dayNo}）${x.storeName}《${x.name}》← ${x.day}${x.matched ? "" : "（節日跟店沒有明顯關係，借來用）"}${x.line ? "　那天的冷知識：" + x.line : ""}`;
      B(`  節日配活動（偏好放在有趣味節日或節日的那天；預告要提前 2 天，所以只看 d3 以後；名字只是起點，改成接得上那天冷知識的說法；用節日的原名、真實的名字都可以）：`);
      f.fest.forEach(x => B(`    fest：${row(x)}`)); if (f.npc) B(`    npc（劇情日）：${row(f.npc)}`);
      if (f.missing) B(`    ★${f.hint}`);
    }
    if (p.suggest.length) B(`  建議的店（最近幾週用得少的）：${p.suggest.map(s => `${s.store}（${s.name}，近期 ${s.used} 次）`).join("、")}；日期要在這週內，同店同天不能 npc 和 fest 都排`);
    B(`  帳本 weeks.${p.week} 週一要有：${WEEKLY_KEYS.join("、")}${p.ledgerMissing.length ? "　★目前缺：" + p.ledgerMissing.join("、") : "　（都有了）"}`);
    B(`  還有：events（限時活動 0～2 場）、casino（賭場每週收藏）、question、shop（選填）、靈感來源.md`);
  } else {
    B(""); B(`【帳本 weeks.${p.week}】hooks 今天那行（d${p.weekday}：…）：${p.hookToday ? "已有" : "★還沒寫（寫完書再補）"}`);
  }
  B(""); B("【NPC（content/npc/）】");
  { const tw = p.npc.thisWeek, tied = tw.filter(x => x.ties.length); B(`  本週會上線的段：共 ${tw.length} 段${tied.length ? "；有掛謎的：" + tied.map(x => `${x.from.slice(5)} ${x.name}#${x.step}→${x.ties.join("/")}`).join("；") : ""}`); }
  B(`  最需要補壹段的（沒有排到之後的段、不到 6 段；今天最多推 2 位）：${p.npc.need.slice(0, 6).map(x => `${x.id}（${x.name}，${x.steps} 段）`).join("、") || "（都有排）"}`);
  B(`  旅客 ${p.npc.visitors} 位：${p.npc.visitorsLow ? "★少於 25，補新的（每週最多新增 2 位）" : p.npc.visitorsFull ? "已滿 30 位，不用補" : "夠了（25～30）"}`);
  B(""); B("【每天都要有】");
  B(`  ☐ 至少壹條 clue（書、房間、今日特展）　☐ 政治梗壹個，記進 weeks.${p.week}.memes（搜不到要在 PR 寫原因）　☐ 世界觀 world、sideRefs、ties、hooks`);
  B(`  ☐ market 世界股市新聞 3～5 則${p.market.weekend ? "（週末休市，可以不寫）" : ""}　☐ real 今天的現實世界（查得到才寫）　☐ 今日特展至少 1～2 幅新畫（npm run svg 看過）`);
  B(`  GDP（content/economy.json，目前 ${p.gdp.quarter || "?"}，公布日 ${p.gdp.published || "?"}）：${p.gdp.window ? "★今天在公布期，查壹下有沒有新的" : "今天不在公布期，不用查"}`);
  if (p.isEndingDay) B(`  ★週日（d7）：放壹本 "ending": true 的書收尾，答這週的疑點，留壹個接下週的鉤子`);
  if (p.dayGaps) {
    const g = p.dayGaps;
    B(""); B(`【今天的檔現在長這樣】書 ${g.books}、clue ${g.clue ? "有" : "★沒有"}、market ${g.market ? "有" : "☐沒有"}、real ${g.real ? "有" : "（沒有）"}、svg 畫 ${g.svg} 幅${g.svg ? "" : "（★至少 1 幅）"}、weeklyWords ${g.weeklyWords}${g.ending === null ? "" : "、結局書" + (g.ending ? "有" : "★沒有")}`);
  }
  B(""); B("【要建立的檔】"); (p.files.length ? p.files : [p.dayFile + "（已經有，只補內容）"]).forEach(f => B("  " + f));
  B("  帳本：content/story/帳本.json（weeks、foreshadow、mysteries 線索、revealBeats、seasonal written、sideArcs at）；NPC：content/npc/（改了要 node tools/npc_pack.cjs）");
  B(""); B("【最後要跑】"); p.commands.forEach((c, i) => B(`  ${i + 1}. ${c}`));
  return L.join("\n");
}

// 這七天的節日、趣味節日、帳本 calendar（週一排這週時看，挑壹兩天當小彩蛋；npm run day:plan -- --week）
function weekOverview(date, G, ledger) {
  const mon = G.weekMonday(date), days = asList(ledger && ledger.calendar && ledger.calendar.days);
  return [0, 1, 2, 3, 4, 5, 6].map(i => {
    const d = G.addDays(mon, i), h = G.holidayOf ? G.holidayOf(d) : null;
    return { date: d, name: "週" + WD[i], holiday: h ? (typeof h === "string" ? h : h.name || "") : "", funDays: asList(G.funDaysOf ? G.funDaysOf(d) : []).map(f => f && f.name || String(f)), calendar: days.filter(x => x && x.date === d.slice(5)).map(x => x.name) };
  });
}
function formatWeek(rows) { return rows.map(r => `${r.date}（${r.name}）${[r.holiday && "節日：" + r.holiday, r.funDays.length && "趣味節日：" + r.funDays.join("、"), r.calendar.length && "帳本 calendar：" + r.calendar.join("、")].filter(Boolean).join("　") || "（沒有特別的日子）"}`).join("\n"); }

// ---------- 讀檔 ----------
const readJSON = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
function gather(date, G) {
  const wdir = path.join(ROOT, "content", "weeks"), weeks = {}, recent = [];
  const names = fs.existsSync(wdir) ? fs.readdirSync(wdir).filter(x => /^\d{4}-W\d{2}$/.test(x)).sort() : [];
  names.forEach(w => {
    const pack = { week: null, days: {} };
    try { pack.week = readJSON(`content/weeks/${w}/week.json`); } catch (e) { pack.week = null; }
    for (let i = 1; i <= 7; i++) { const f = path.join(wdir, w, `d${i}.json`); if (fs.existsSync(f)) { try { pack.days[i] = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { pack.days[i] = {}; } } }
    weeks[w] = pack;
  });
  const cur = G.isoWeek(date);
  names.filter(w => w < cur).slice(-4).forEach(w => { if (weeks[w].week) recent.push(weeks[w].week); });
  const read = f => { try { return readJSON(f); } catch (e) { return null; } };
  const npcs = []; const nd = path.join(ROOT, "content", "npc");
  if (fs.existsSync(nd)) fs.readdirSync(nd).filter(x => x.endsWith(".json")).sort().forEach(f => { const o = read(`content/npc/${f}`); if (o) npcs.push(o); });
  return { date, G, ledger: read("content/story/帳本.json"), settings: read("content/排程設定.json"), weeks, recent, npcs, economy: read("content/economy.json") };
}

function main() {
  const { load } = require("../test/load_shared.cjs"), G = load(), a = process.argv.slice(2);
  const i = a.indexOf("--date"), date = i >= 0 ? a[i + 1] : G.taipeiDay(Date.now());
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date || "")) throw new Error("--date 要寫成 2026-11-17");
  if (a.includes("--week")) { console.log(formatWeek(weekOverview(date, G, gather(date, G).ledger))); return; }
  const p = planDay(gather(date, G));
  console.log(a.includes("--json") ? JSON.stringify(p, null, 2) : format(p));
}
if (require.main === module) { try { main(); } catch (e) { console.error(e.message); process.exit(1); } }
module.exports = { suggestFest, weekItems, funStore, storeUsage, festName, weekOverview, formatWeek, gatherFor: gather, planDay, format, suggestStores, weekGaps, beatInfo, npcNeeds, beatNpcGaps, gdpWindow, dayGaps, commandsFor, STORES, WEEKLY_KEYS };
