// 每週劇情的內容檢查：node tools/week_check.cjs（npm test 會跑；排程開 PR 之前也跑）
// 檢查 content/weeks/（週包、備用週、備用的一天）、content/story/帳本.json、content/排程設定.json。
// 規則照 docs/每週劇情.md 第五、六、十二節；格式見 content/README.md。
// 有錯（errors）就失敗；警告（warnings，例如到期還沒收的伏筆）只印出來，排程要寫進 PR。
// 別的檔可以 require 這支，用 checkContent({ files, ledger, settings, today }) 檢查記憶體裡的內容（test/week_check.test.cjs）。
const fs = require("fs"), path = require("path");
const { load } = require("../test/load_shared.cjs");
const G = load();

const ROOT = path.join(__dirname, "..");
const WEEKS = path.join(ROOT, "content", "weeks");
const LEDGER = path.join(ROOT, "content", "story", "帳本.json");
const SETTINGS = path.join(ROOT, "content", "排程設定.json");

// 字數（畫面上看得到的字；書頁不算換行）
const LIMITS = { weekTitle: 16, summaryLine: 60, lineName: 16, anomalyTitle: 24, anomalyText: 60, board: 44,
  bookTitle: 16, spine: 6, page: 120, bookHint: 40, showTitle: 14, showIntro: 60, workTitle: 14, workLine: 50,
  roomTitle: 14, roomHint: 26, roomIntro: 50, roomLine: 50, choiceLabel: 16, resultText: 50 };
// 禁用字（新聞的界線：docs/每週劇情.md 第三節、docs/界線.md）。有就擋。英文字母一律擋（品牌、Pepe），B1 這種樓層和 1D3 這種骰子例外
// 選舉、投票、兩岸這類一般的字可以寫（翊文 11-09：館內的展品投票選館長；決定 0037）；擋的是真實的職位、政黨、人名
const BANNED = [
  "總統", "立委", "議員", "政府", "國民黨", "民進黨", "民眾黨", "親民黨", "時代力量", "台灣基進", "共產黨", "藍營", "綠營",
  "賴清德", "蔡英文", "馬英九", "柯文哲", "韓國瑜", "侯友宜", "盧秀燕", "鄭麗文", "朱立倫", "蔣萬安", "黃國昌", "蕭美琴", "卓榮泰", "習近平", "川普", "拜登", "普丁",
  "中共", "解放軍", "戰爭", "軍隊", "飛彈", "導彈", "核武", "轟炸", "侵略",
  "宗教", "佛教", "道教", "基督", "天主", "伊斯蘭", "媽祖", "上帝", "菩薩", "耶穌",
  "死亡", "死掉", "死者", "喪生", "罹難", "遇難", "傷亡", "屍體", "地震", "海嘯", "土石流", "火災", "爆炸", "車禍", "空難", "墜機",
  "殺人", "謀殺", "自殺", "槍", "炸彈", "恐攻", "綁架", "毒品", "詐騙", "搶劫",
  "病毒", "疫情", "疫苗", "癌症", "醫院", "處方", "療效",
  "佩佩蛙", "納粹", "卍", "希特勒",
  "賓士", "全家", "萊爾富", "星巴克", "麥當勞", "肯德基", "鼎泰豐", "臉書", "任天堂", "迪士尼", "寶可夢", "台積電", "可口可樂", "蘋果手機",
];
const MOODS = [null, "開心", "傷心", "生氣"];
const POWER = { 1: [11, 13], 2: [15, 16], 3: [17, 19], 4: [19, 21], 5: [20, 23] }; // 跟 test/content/check3.cjs 的 RANGES 一樣
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const len = s => [...String(s).replace(/\n/g, "")].length;
const asList = v => Array.isArray(v) ? v : v ? [v] : [];

// 讀 content/weeks/ 下面所有的 .json：{ "2026-W46/week.json": 內容 }。讀不出來的放進 bad
function readWeeks(dir = WEEKS) {
  const files = {}, bad = [];
  if (!fs.existsSync(dir)) return { files, bad };
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return walk(p);
    if (!e.name.endsWith(".json")) return;
    const rel = path.relative(dir, p).split(path.sep).join("/");
    try { files[rel] = JSON.parse(fs.readFileSync(p, "utf8")); } catch (err) { bad.push(`${rel}：JSON 讀不出來（${err.message}）`); }
  });
  walk(dir);
  return { files, bad };
}
const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return { __bad: e.message }; } };

// files：readWeeks 的結果；ledger：帳本；settings：排程設定；today：台灣的今天（不給就照現在）
function checkContent({ files = {}, bad = [], ledger = null, settings = null, today = null } = {}) {
  const errors = bad.slice(), warnings = [];
  const E = (where, msg) => errors.push(`${where}：${msg}`), W = (where, msg) => warnings.push(`${where}：${msg}`);
  today = today || process.env.WEEK_CHECK_TODAY || G.taipeiDay(Date.now());
  const N = G.NUM.story;

  // ---------- 畫面上的字 ----------
  const text = (where, s, max, o = {}) => {
    if (typeof s !== "string" || !s.trim()) { if (!o.optional) E(where, "要有字"); return; }
    if (max && len(s) > max) E(where, `太長了（${len(s)} 字，最多 ${max}）`);
    if (s.includes("一")) E(where, "畫面上的字用「壹」，不要用「一」（決定 0001）");
    const hit = BANNED.find(w => s.includes(w));
    if (hit) E(where, `有禁用字「${hit}」（docs/每週劇情.md 第三節）`);
    if (/[A-Za-z]/.test(s.replace(/B\d/g, "").replace(/\d+D\d+/g, ""))) E(where, "不要有英文字母（品牌、別人的作品名；樓層寫 B1 可以）");
    [...s.matchAll(/\[\[(.+?)\|(.+?)\]\]/g)].forEach(m => { if (!G.BOOK_ACTION_IDS.includes(m[2])) E(where, `書裡可以點的字，動作「${m[2]}」不存在（只能用 ${G.BOOK_ACTION_IDS.join("、")}）`); });
    const braces = s.replace(/\{圖鑑格數\}/g, "");
    if (/[{}]/.test(braces)) E(where, "大括號只能寫 {圖鑑格數}");
  };
  const lines = (where, arr, lo, hi, max) => {
    if (!Array.isArray(arr) || arr.length < lo || arr.length > hi) { E(where, `要 ${lo}～${hi} 行`); return; }
    arr.forEach((s, i) => text(`${where}[${i}]`, s, max));
  };
  const rewardOk = (where, r, o = {}) => {
    if (r == null) { if (!o.optional) E(where, "要有獎勵"); return; }
    if (!isObj(r)) { E(where, "獎勵要寫成 { insp, mood, items }"); return; }
    Object.keys(r).forEach(k => { if (!["insp", "mood", "items"].includes(k)) E(where, `獎勵不認得「${k}」（週章由遊戲自己給，不要寫）`); });
    if ("insp" in r && !isInt(r.insp, 1, 10)) E(where, "insp 要是 1～10 的整數");
    if ("mood" in r && !isInt(r.mood, 1, 10)) E(where, "mood 要是 1～10 的整數");
    if ("items" in r) {
      if (!Array.isArray(r.items) || r.items.length > 2) E(where, "items 最多 2 樣");
      else r.items.forEach(id => { if (!G.STORY_ITEMS[id]) E(where, `沒有「${id}」這種東西（shared/story.js 的 STORY_ITEMS）`); });
    }
    if (!o.optional && !r.insp && !r.mood && !(r.items && r.items.length)) E(where, "獎勵是空的");
  };
  const budget = (where, got, cap) => ["insp", "mood", "items"].forEach(k => { if (got[k] > cap[k]) E(where, `獎勵超過預算：${k} ${got[k]}（最多 ${cap[k]}，NUM.story）`); });

  // ---------- 一間房間（地下收藏庫的格式） ----------
  const roomOk = (where, r, ctx) => {
    if (!isObj(r)) { E(where, "房間要是物件"); return; }
    if (!/^[A-Za-z0-9_-]+$/.test(r.id || "")) E(where, "id 只能用英文、數字、-、_");
    if (!isInt(r.floor, 1, 5)) { E(where, "floor 要是 1～5"); return; }
    text(where + ".title", r.title, LIMITS.roomTitle);
    text(where + ".hint", r.hint, LIMITS.roomHint);
    if (typeof r.hint === "string" && !/^去 /.test(r.hint)) E(where + ".hint", "下一步只說去哪裡、做什麼，寫成「去 B1 …」");
    if (typeof r.hint === "string" && !r.hint.includes(`B${r.floor}`)) E(where + ".hint", `要寫是哪一層（B${r.floor}）`);
    text(where + ".intro", r.intro, LIMITS.roomIntro, { optional: true });
    lines(where + ".lines", r.lines, 1, 3, LIMITS.roomLine);
    if (!MOODS.includes(r.mood === undefined ? null : r.mood)) E(where, "mood 只能是 開心／傷心／生氣／null");
    if (r.color != null && !G.storyOptOk("顏色", r.color)) E(where, `color「${r.color}」不是手作坊的顏色`);
    if (r.line != null && !ctx.lineIds.has(r.line)) E(where, `line「${r.line}」不在這週的 lines 裡`);
    if (!Array.isArray(r.choices) || r.choices.length < 2 || r.choices.length > 3) E(where, "choices 要 2～3 個");
    else r.choices.forEach((c, i) => {
      const cw = `${where}.choices[${i}]`, ck = (c && c.check) || {};
      text(cw + ".label", c && c.label, LIMITS.choiceLabel);
      if (ck.type === "power") { const [lo, hi] = POWER[r.floor]; if (!isInt(ck.target, lo, hi)) E(cw, `B${r.floor} 的強度門檻要在 ${lo}～${hi}`); }
      else if (ck.type === "skill") { if (!G.SKILLS.includes(ck.skill)) E(cw, `沒有「${ck.skill}」這個技能`); if (!isInt(ck.mod, -20, 20)) E(cw, "mod 要是 -20～20"); }
      else if (ck.type === "san") { const m = G.sanMax(ck.spec); if (!m.ok) E(cw, `理智檢定「${ck.spec}」寫法不對（例如 0/1D4）`); else if (m.fail > 8) E(cw, "理智檢定失敗最多扣 8 點"); }
      else if (ck.type !== "none") E(cw, "check.type 只能是 power／skill／san／none");
      const out = (k, o) => {
        if (!isObj(o)) { if (k === "success" || ck.type !== "none") E(`${cw}.${k}`, "要有結果"); return; }
        text(`${cw}.${k}.text`, o.text, LIMITS.resultText);
        if ("insp" in o && !isInt(o.insp, 1, 5)) E(`${cw}.${k}`, "insp 要是 1～5");
        if ("myth" in o && o.myth !== 1) E(`${cw}.${k}`, "myth 最多 1");
        if ("san" in o && !/^\+?\d*D\d+$|^\+?\d+$/.test(String(o.san))) E(`${cw}.${k}`, `san「${o.san}」寫法不對（例如 1D3、+1D2）`);
        if ("san" in o && !String(o.san).startsWith("+") && G.sanMax(`0/${o.san}`).fail > 4) E(`${cw}.${k}`, "房間的結果最多扣 4 點理智");
        if ("injure" in o && o.injure !== true) E(`${cw}.${k}`, "injure 只能寫 true");
      };
      out("success", c && c.success);
      if (ck.type !== "none") out("fail", c && c.fail);
    });
    rewardOk(where + ".reward", r.reward);
  };

  // ---------- 一幅畫（今日特展） ----------
  const workOk = (where, w) => {
    if (!isObj(w)) { E(where, "要是物件"); return; }
    if (!G.SHOW_ART.includes(w.art)) E(where, `art 只能是 ${G.SHOW_ART.join("、")}（不畫 Pepe 的樣子；要新的畫法得寫程式）`);
    if (w.art === "frog") {
      if (!isObj(w.pick)) E(where, "frog 要有 pick（手作坊的選項）");
      else Object.entries(w.pick).forEach(([c, v]) => { if (!G.storyOptOk(c, v)) E(where, `pick 的「${c}：${v}」不是手作坊的選項`); });
    } else if ("variant" in w && !isInt(w.variant, 0, 3)) E(where, "variant 要是 0～3");
    if (!Array.isArray(w.fx) && w.fx !== undefined) E(where, "fx 要是陣列");
    (w.fx || []).forEach(f => { if (!G.SHOW_FX.includes(f)) E(where, `fx「${f}」不存在（${G.SHOW_FX.join("、")}）`); });
    if ((w.fx || []).length > 2) E(where, "fx 最多 2 個");
    if (w.frame != null && !G.SHOW_FRAMES.includes(w.frame)) E(where, `frame 只能是 ${G.SHOW_FRAMES.join("、")}`);
    text(where + ".title", w.title, LIMITS.workTitle);
    lines(where + ".lines", w.lines, 1, 3, LIMITS.workLine);
    if (w.san != null) {
      const m = G.sanMax(w.san);
      if (!m.ok) E(where, `san「${w.san}」寫法不對（例如 0/1D4）`);
      else { if (m.success !== 0) E(where, "今日特展的畫，理智檢定成功要不扣（寫成 0/…），「看完今日特展」才不會一定掉理智"); if (m.fail > N.showSanMax) E(where, `理智檢定失敗最多扣 ${N.showSanMax} 點`); }
    }
  };

  // ---------- 任務 ----------
  const taskOk = (where, t, ctx, when) => {
    if (!isObj(t)) { E(where, "要是物件"); return 0; }
    const K = G.STORY_TASKS[t.kind];
    if (!K) { E(where, `沒有「${t.kind}」這種任務（只能用 ${Object.keys(G.STORY_TASKS).join("、")}；新的種類要寫程式）`); return 0; }
    if (K.when !== "both" && K.when !== when) E(where, `「${t.kind}」不能當${when === "daily" ? "每日" : "每週"}任務`);
    const nMax = when === "daily" ? 2 : 14;
    if ("n" in t && !isInt(t.n, 1, nMax)) E(where, `n 要是 1～${nMax}`);
    const n = t.n || 1;
    if (t.kind === "make") {
      if (t.need != null) {
        if (!isObj(t.need)) E(where, "need 要寫成 { 顏色: \"綠\" }");
        else Object.entries(t.need).forEach(([c, v]) => {
          const o = G.optOf(c, v);
          if (c === "稀有度") E(where, "不要指定稀有度（要靠運氣）");
          else if (!o) E(where, `need 的「${c}：${v}」不是手作坊的選項`);
          else if (when === "daily" && !o.start) E(where, `每日任務只能指定一開始就有的選項，「${v}」不是（大家今天都要做得到）`);
          else if (o.forbidden || o.mutant || o.gift || o.key) E(where, `「${v}」是特別的選項，不能當任務`);
        });
      }
    }
    if (t.kind === "view") {
      const ex = G.exhibitById(t.exhibit);
      if (!ex) E(where, `沒有「${t.exhibit}」這件展品`);
      else if (when === "daily" && ex.san) E(where, "每日任務不放一定要掉理智的事：只能挑不用理智檢定的畫");
    }
    if (t.kind === "show" && !ctx.day.show) E(where, "這天沒有今日特展");
    if (t.kind === "read" && !ctx.books.has(t.book)) E(where, `book「${t.book}」不是這週${when === "daily" ? "到這天為止" : ""}的書`);
    if (t.kind === "spot" && !ctx.rooms.has(t.room)) E(where, `room「${t.room}」不是這週${when === "daily" ? "到這天為止" : ""}的房間`);
    if (t.kind === "cellar" && !isInt(t.floor, 1, when === "daily" ? 2 : 5)) E(where, `floor 要是 1～${when === "daily" ? 2 : 5}`);
    rewardOk(where + ".reward", t.reward);
    return K.min * (["make", "deliver", "fuse", "pillow", "hug"].includes(t.kind) ? n : t.kind === "cellar" ? (t.floor || 1) : 1);
  };

  // ---------- 一本書 ----------
  const bookOk = (where, b, ctx, n) => {
    if (!isObj(b)) { E(where, "要是物件"); return; }
    if (!ctx.lineIds.has(b.line)) E(where, `line「${b.line}」不在 lines 裡（每本書都要掛在存在的劇情線上）`);
    text(where + ".title", b.title, LIMITS.bookTitle);
    text(where + ".spine", b.spine, LIMITS.spine);
    if (!Array.isArray(b.pages) || b.pages.length < 2 || b.pages.length > 6) E(where, "pages 要 2～6 頁");
    else b.pages.forEach((p, i) => text(`${where}.pages[${i}]`, p, LIMITS.page));
    text(where + ".hint", b.hint, LIMITS.bookHint, { optional: true });
    if (b.ending) { if (n !== 7 || ctx.spare) E(where, "ending 只能放在週日（d7）"); return; }
    const u = b.unlock || { type: "now" };
    if (u.type === "find") { if (!ctx.rooms.has(u.room)) E(where, `unlock.room「${u.room}」不是這週到這天為止的房間`); }
    else if (u.type === "task") { if (!ctx.tasks.has(u.task)) E(where, `unlock.task「${u.task}」不是這週到這天為止的任務`); }
    else if (u.type !== "now") E(where, "unlock.type 只能是 now／find／task（結局寫 ending: true）");
  };

  // ---------- 一天 ----------
  // ctx：這週到前一天為止的東西（lineIds、books、rooms、tasks、ids）
  const dayOk = (where, d, n, ctx, o = {}) => {
    if (!isObj(d)) { E(where, "要是物件"); return; }
    if (!o.spare && d.day !== n) E(where, `day 要是 ${n}（跟檔名一樣）`);
    if (o.date && d.date !== o.date) E(where, `date 要是 ${o.date}（週一 ${o.start} 往後 ${n - 1} 天）`);
    if (o.date && d.date > G.addDays(today, 1)) E(where, `${d.date} 還沒到（今天 ${today}）：還沒到的天不先寫，不然會被先看到（第六節）`);
    if (d.holiday != null && typeof d.holiday !== "string") E(where, "holiday 要是節日的名字或 null");
    text(where + ".board", d.board, LIMITS.board);
    const ids = (kind, id) => { if (typeof id !== "string" || !id) { E(where, `${kind} 要有 id`); return; } if (ctx.ids.has(id)) E(where, `id「${id}」這週用過了（書、任務、畫、房間的 id 一週裡不能重複）`); ctx.ids.add(id); };
    asList(d.adds).forEach((r, i) => { ids("房間", r && r.id); roomOk(`${where}.adds[${i}]`, r, ctx); if (r && r.id) ctx.rooms.add(r.id); });
    if (asList(d.adds).length > 2) E(where, "一天最多加 2 個房間");
    if (o.spare && asList(d.adds).length) E(where, "備用的一天不加房間（不影響主線）");
    if (!Array.isArray(d.books) || d.books.length < 1 || d.books.length > 2) E(where, "books 要 1～2 本");
    if (!Array.isArray(d.daily) || d.daily.length !== 3) E(where, "daily 要剛好 3 個");
    const books = asList(d.books), daily = asList(d.daily);
    books.forEach(b => { ids("書", b && b.id); if (b && b.id) ctx.books.add(b.id); });
    daily.forEach(t => { ids("任務", t && t.id); if (t && t.id) ctx.tasks.add(t.id); });
    let minutes = 0;
    daily.forEach((t, i) => { minutes += taskOk(`${where}.daily[${i}]`, t, Object.assign({ day: d }, ctx), "daily"); });
    if (minutes > N.dailyMinutes) E(where, `3 個每日任務大約要 ${minutes} 分鐘，太多了（最多 ${N.dailyMinutes}）`);
    books.forEach((b, i) => bookOk(`${where}.books[${i}]`, b, Object.assign({ spare: !!o.spare }, ctx), n));
    if (!o.spare && !books.some(b => b && ctx.weekLine.has(b.line))) E(where, "每天至少一本書接這週的線（line 是這週 kind week 或 floor 的線）");
    rewardOk(where + ".dailyBonus", d.dailyBonus);
    if (!isObj(d.show)) E(where, "要有今日特展（show）");
    else {
      text(where + ".show.title", d.show.title, LIMITS.showTitle);
      text(where + ".show.intro", d.show.intro, LIMITS.showIntro);
      if (!Array.isArray(d.show.works) || d.show.works.length < 3 || d.show.works.length > 5) E(where + ".show", "works 要 3～5 幅");
      else d.show.works.forEach((w, i) => { ids("畫", w && w.id); workOk(`${where}.show.works[${i}]`, w); });
    }
    budget(where, G.dayRewardTotal(d), N.dayBudget);
    if (o.date === undefined && !o.spare && d.date !== undefined) E(where, "備用週的天不寫 date（日期由遊戲照這週算）");
  };

  // ---------- 一週（正式週或備用週） ----------
  const allLines = {}; // 週包裡用到的劇情線：id → { name, kind, where }
  const weekOk = (name, pack, o) => {
    const where = o.fallback ? `備用/${name}` : name;
    const wk = pack.week || {};
    if (!o.fallback) {
      if (!G.isoMonday(name)) { E(where, "週的資料夾名字要像 2026-W47"); return; }
      if (wk.week !== name) E(where + "/week.json", `week 要寫 "${name}"`);
      if (wk.start !== G.isoMonday(name)) E(where + "/week.json", `start 要是這週的週一 ${G.isoMonday(name)}`);
    } else if (wk.week || wk.start) E(where + "/week.json", "備用週不寫 week、start（哪一週用到就是哪一週）");
    text(where + "/week.json.title", wk.title, LIMITS.weekTitle);
    lines(where + "/week.json.summary", wk.summary, 2, 5, LIMITS.summaryLine);
    const lineIds = new Set(), weekLine = new Set();
    if (!Array.isArray(wk.lines) || !wk.lines.length) E(where + "/week.json", "lines 至少要有一條（這週的劇情線）");
    asList(wk.lines).forEach((l, i) => {
      const lw = `${where}/week.json.lines[${i}]`;
      if (!l || !/^[A-Za-z0-9_-]+$/.test(l.id || "")) { E(lw, "id 只能用英文、數字、-、_"); return; }
      if (!G.LINE_KINDS[l.kind]) E(lw, `kind 只能是 ${Object.keys(G.LINE_KINDS).join("、")}`);
      if (o.fallback && (l.kind === "main" || l.kind === "holiday" || l.kind === "season")) E(lw, "備用週不放主線、季節、節日的線（備用週可能在任何一週用到）");
      text(lw + ".name", l.name, LIMITS.lineName);
      lineIds.add(l.id); if (l.kind === "week" || l.kind === "floor") weekLine.add(l.id);
      const prev = allLines[l.id];
      if (prev && !G.CROSS_WEEK_KINDS.includes(l.kind)) E(lw, `劇情線 id「${l.id}」在 ${prev.where} 用過了（只有主線、季節線可以跨週用同一個 id）`);
      if (prev && G.CROSS_WEEK_KINDS.includes(l.kind) && prev.name !== l.name) E(lw, `${G.LINE_KINDS[l.kind]}線「${l.id}」的名字跟 ${prev.where} 不一樣`);
      allLines[l.id] = { name: l.name, kind: l.kind, where, week: o.fallback ? null : name, fallback: o.fallback ? name : null };
    });
    if (!weekLine.size) E(where + "/week.json", "lines 裡要有一條 kind 是 week 的（這週的線）");
    const ctx = { lineIds, weekLine, books: new Set(), rooms: new Set(), tasks: new Set(), ids: new Set() };
    if (wk.anomaly != null) {
      text(where + "/week.json.anomaly.title", wk.anomaly.title, LIMITS.anomalyTitle);
      lines(where + "/week.json.anomaly.text", wk.anomaly.text, 1, 3, LIMITS.anomalyText);
      if (wk.anomaly.room) { ctx.ids.add(wk.anomaly.room.id); roomOk(where + "/week.json.anomaly.room", wk.anomaly.room, ctx); ctx.rooms.add(wk.anomaly.room.id); }
    }
    // 每週任務會用到這週後面幾天才出現的書、房間：先收集全部
    const later = { books: new Set(ctx.books), rooms: new Set(ctx.rooms) };
    Object.values(pack.days).forEach(d => { asList(d && d.books).forEach(b => b && later.books.add(b.id)); asList(d && d.adds).forEach(r => r && later.rooms.add(r.id)); });
    if (!Array.isArray(wk.weekly) || wk.weekly.length !== 5) E(where + "/week.json", "weekly 要剛好 5 個");
    asList(wk.weekly).forEach((t, i) => { if (t && t.id) { if (ctx.ids.has(t.id)) E(where, `id「${t.id}」重複`); ctx.ids.add(t.id); ctx.tasks.add(t.id); } taskOk(`${where}/week.json.weekly[${i}]`, t, Object.assign({}, ctx, later, { day: {} }), "weekly"); });
    rewardOk(where + "/week.json.weeklyBonus", wk.weeklyBonus);
    budget(where + "/week.json", G.weekTaskTotal(wk), N.weekTaskBudget);
    const need = wk.ending && wk.ending.need && wk.ending.need.read;
    if (!isInt(need, 1, 14)) E(where + "/week.json", "ending.need.read 要寫讀幾本才打開結局（1～14）");
    const dayFiles = Object.keys(pack.days).map(Number).sort((a, b) => a - b);
    dayFiles.forEach(n => dayOk(`${where}/d${n}.json`, pack.days[n], n, ctx, o.fallback ? {} : { date: G.addDays(wk.start || G.isoMonday(name), n - 1), start: G.isoMonday(name) }));
    if (o.fallback && dayFiles.length !== 7) E(where, "備用週要 7 天都寫好（d1–d7）");
    for (let n = 1; n < (dayFiles[dayFiles.length - 1] || 0); n++) if (!pack.days[n] && !o.fallback) W(where, `少了 d${n}.json：那天遊戲用了備用的一天`);
    if (pack.days[7]) {
      const end = asList(pack.days[7].books).some(b => b && b.ending);
      if (!end && !wk.continues) E(`${where}/d7.json`, "週日要有一本 ending: true 的書收尾（或在 week.json 寫 continues 延到下週）");
    }
    if (dayFiles.length === 7 && isInt(need, 1, 14)) {
      const seasonIds = new Set(asList(wk.lines).filter(l => l && l.kind === "season").map(l => l.id)); // 季節線的書不算：沒讀也不會卡住這週的結局
      const all = [].concat(...dayFiles.map(n => asList(pack.days[n].books))).filter(b => b && !b.ending && !seasonIds.has(b.line));
      const roomFloor = id => { const r = [wk.anomaly && wk.anomaly.room].concat(...dayFiles.map(n => asList(pack.days[n].adds))).find(x => x && x.id === id); return r ? r.floor : 9; };
      const easy = all.filter(b => { const u = b.unlock || {}; return !u.type || u.type === "now" || u.type === "task" || (u.type === "find" && roomFloor(u.room) === 1); }).length;
      if (need > easy) E(where, `結局要讀 ${need} 本，可是不用走到 B2 以下就讀得到的只有 ${easy} 本（新玩家打不開結局）`);
    }
    return { where, wk, dayFiles };
  };

  Object.keys(files).forEach(rel => { const p = rel.split("/"); if (!(p.length === 2 && /^\d{4}-W\d{2}$/.test(p[0])) && !(p.length === 3 && p[0] === "備用")) E(`content/weeks/${rel}`, "放錯地方了（正式週 2026-W47/、備用週 備用/名字/、備用的一天 備用/一天/）"); });
  const lib = G.storyLibrary(files);
  lib.skipped.forEach(s => E(`content/weeks/${s}`, "看不懂這個檔（週要有 week.json，一天叫 d1.json～d7.json）"));
  const done = [];
  Object.keys(lib.fallback).sort().forEach(n => { if (n === "一天") return; done.push(weekOk(n, lib.fallback[n], { fallback: true })); });
  Object.keys(lib.weeks).sort().forEach(n => done.push(weekOk(n, lib.weeks[n], {})));
  if (!Object.keys(lib.fallback).length) E("content/weeks/備用", "至少要有壹個備用週（排程失敗時用）");
  Object.keys(lib.spare).sort().forEach(n => {
    const d = lib.spare[n], where = `備用/一天/${n}.json`;
    const lineIds = new Set(asList(d.lines).map(l => l && l.id));
    asList(d.lines).forEach((l, i) => {
      if (!l || l.kind !== "side") E(`${where}.lines[${i}]`, "備用的一天只放 kind side 的線（不影響主線）");
      else { text(`${where}.lines[${i}].name`, l.name, LIMITS.lineName); const prev = allLines[l.id]; if (prev && prev.name !== l.name) E(where, `劇情線「${l.id}」的名字跟 ${prev.where} 不一樣`); allLines[l.id] = { name: l.name, kind: l.kind, where, spare: true }; }
    });
    if (!lineIds.size) E(where, "lines 要有一條 kind side 的線");
    dayOk(where, d, 0, { lineIds, weekLine: lineIds, books: new Set(), rooms: new Set(), tasks: new Set(), ids: new Set() }, { spare: true });
    if (asList(d.books).some(b => b && b.unlock && b.unlock.type && b.unlock.type !== "now")) E(where, "備用的一天的書都是當天就能讀（unlock now）");
  });
  if (Object.keys(lib.spare).length < 2) E("content/weeks/備用/一天", "至少要有 2 個備用的一天");

  // ---------- 劇情帳本 ----------
  const nowWeek = G.isoWeek(today);
  if (!ledger || ledger.__bad) E("content/story/帳本.json", ledger ? `JSON 讀不出來（${ledger.__bad}）` : "找不到");
  else {
    const L = ledger, lw = "content/story/帳本.json";
    if (!isObj(L.main) || !Array.isArray(L.main.seasons)) E(lw, "main.seasons 要是陣列（主線的大綱，一季一筆）");
    if (!isObj(L.main) || typeof L.main.theme !== "string" || !L.main.theme.trim()) E(lw, "main.theme 要寫主線的主旨（所有劇情線共同的主軸，決定 0037）");
    if (!Array.isArray(L.lines)) E(lw, "lines 要是陣列（每一條劇情線）");
    if (!Array.isArray(L.foreshadow)) E(lw, "foreshadow 要是陣列（伏筆清單）");
    ["characters", "places", "items", "news"].forEach(k => { if (!Array.isArray(L[k])) E(lw, `${k} 要是陣列`); });
    if (!isObj(L.weeks)) E(lw, "weeks 要是物件（每週用了什麼、主線推到哪）");
    const byId = {};
    asList(L.lines).forEach((l, i) => {
      if (!l || !l.id) { E(`${lw}.lines[${i}]`, "要有 id"); return; }
      if (byId[l.id]) E(`${lw}.lines[${i}]`, `id「${l.id}」重複`);
      byId[l.id] = l;
      if (!G.LINE_KINDS[l.kind]) E(`${lw}.lines[${i}]`, `kind「${l.kind}」不對`);
    });
    Object.entries(allLines).forEach(([id, x]) => {
      const l = byId[id];
      if (!l) { E(x.where, `劇情線「${id}」不在帳本裡（content/story/帳本.json 的 lines）`); return; }
      if (l.name !== x.name) E(x.where, `劇情線「${id}」的名字跟帳本不一樣（帳本寫「${l.name}」）`);
      if (l.kind !== x.kind) E(x.where, `劇情線「${id}」的種類跟帳本不一樣（帳本寫 ${l.kind}）`);
      if (x.week && !G.CROSS_WEEK_KINDS.includes(l.kind) && l.start !== x.week) E(x.where, `劇情線「${id}」帳本的 start 要寫 ${x.week}`);
    });
    done.filter(d => !d.where.startsWith("備用")).forEach(d => {
      const rec = isObj(L.weeks) ? L.weeks[d.where] : null;
      if (!rec || typeof rec.main !== "string" || !rec.main.trim()) E(d.where, "帳本的 weeks 裡要寫這週主線推到哪（main）：每週至少把主線往前推一步（第十二節）");
      if (!rec || !asList(rec.ties).length) W(d.where, "帳本的 weeks 裡沒有 ties：這週的線、每天的書碰到主軸的哪一點（決定 0037）");
    });
    asList(L.foreshadow).forEach((f, i) => {
      if (!f || !f.id || !f.what || !f.planted || typeof f.closed !== "boolean") { E(`${lw}.foreshadow[${i}]`, "要有 id、what、planted、due、closed"); return; }
      if (!f.closed && /^\d{4}-W\d{2}$/.test(f.due || "") && f.due < nowWeek) W(`${lw}.foreshadow「${f.id}」`, `預計 ${f.due} 收，到期了還沒收（${f.what}）`);
    });
    // 季節線（決定 0037）：沒有 seasonal 的舊帳本照常
    if (L.seasonal != null) {
      const sl = isObj(L.seasonal) ? L.seasonal.lines : null;
      if (!Array.isArray(sl)) E(lw, "seasonal.lines 要是陣列（一季一條線）");
      asList(sl).forEach((s, i) => {
        const sw = `${lw}.seasonal.lines[${i}]`;
        if (!s || !s.id || !s.name) { E(sw, "要有 id、name"); return; }
        if (!G.YEAR_SEASONS.some(y => y[0] === s.season)) E(sw, "season 只能是 冬、春、夏、秋");
        if (!Array.isArray(s.chapters)) { E(sw, "chapters 要是陣列（每章 week、title、tell、ties）"); return; }
        const inLines = byId[s.id];
        if (inLines && (inLines.name !== s.name || inLines.kind !== "season")) E(sw, `線「${s.id}」要跟帳本的 lines 一樣（名字、kind season）`);
        s.chapters.forEach((c, j) => {
          const cw = `${sw}.chapters[${j}]`, mon = c && G.isoMonday(c.week);
          if (!mon || !c.title || !Array.isArray(c.tell) || !c.tell.length) { E(cw, "要有 week（例如 2026-W46）、title、tell"); return; }
          const sun = G.addDays(mon, 6);
          if (G.yearSeason(mon) !== s.season && G.yearSeason(sun) !== s.season) W(cw, `${c.week} 不在${s.season}天（${G.yearSeason(mon)}）：換季那週要開新的線`);
          if (!asList(c.ties).length) W(cw, `第 ${j + 1} 章「${c.title}」沒有 ties：季節線是副劇情，每章要寫碰到主線的哪一點（決定 0037）`);
          const pack = lib.weeks[c.week];
          const has = !!pack && Object.values(pack.days).some(d => asList(d && d.books).some(b => b && b.line === s.id));
          if (!has && (today >= sun || (pack && pack.days[7]))) W(cw, `${c.week} 有季節線的章「${c.title}」，到週日還沒放書（這週某一天放一本掛在 ${s.id} 上的書）`);
          if (has && !c.written) W(cw, `${c.week} 已經放了季節線的書，帳本的 written 還沒標`);
        });
      });
    }
    const seen = {};
    Object.entries(L.weeks || {}).forEach(([w, r]) => asList(r && r.news).forEach(n => { if (seen[n]) W(lw, `新聞元素「${n}」在 ${seen[n]}、${w} 都用了（避免一直重複）`); seen[n] = w; }));
  }

  // ---------- 排程設定 ----------
  if (!settings || settings.__bad) E("content/排程設定.json", settings ? `JSON 讀不出來（${settings.__bad}）` : "找不到");
  else {
    if (typeof settings.pause !== "boolean") E("content/排程設定.json", "pause 要是 true 或 false");
    if (!Array.isArray(settings.pauseWeeks) || settings.pauseWeeks.some(w => !G.isoMonday(w))) E("content/排程設定.json", "pauseWeeks 要是週的名字的陣列（例如 [\"2026-W47\"]）");
  }
  return { errors, warnings, lib };
}

// 畫面的程式不能 import 帳本（不打包進網頁，第六節）
function checkBundle() {
  const errs = [], dir = path.join(ROOT, "web", "src");
  fs.readdirSync(dir).filter(f => f.endsWith(".js")).forEach(f => {
    const s = fs.readFileSync(path.join(dir, f), "utf8");
    if (/content\/story|帳本\.json|排程設定\.json/.test(s.replace(/\/\/.*$/gm, ""))) errs.push(`web/src/${f}：不能讀 content/story/ 或排程設定（帳本不打包進網頁）`);
    const globs = [...s.matchAll(/import\.meta\.glob\(\s*["'`]([^"'`]+)["'`]/g)].map(m => m[1]);
    globs.forEach(g => { if (!/content\/weeks\//.test(g)) errs.push(`web/src/${f}：import.meta.glob 只能讀 content/weeks/（${g}）`); });
  });
  return errs;
}

function main() {
  const { files, bad } = readWeeks();
  const r = checkContent({ files, bad, ledger: fs.existsSync(LEDGER) ? readJSON(LEDGER) : null, settings: fs.existsSync(SETTINGS) ? readJSON(SETTINGS) : null });
  r.errors.push(...checkBundle());
  r.warnings.forEach(w => console.log("警告 " + w));
  if (r.errors.length) { console.error(r.errors.join("\n")); console.error(`${r.errors.length} 個問題`); process.exit(1); }
  const n = Object.keys(r.lib.weeks).length, f = Object.keys(r.lib.fallback).length, s = Object.keys(r.lib.spare).length;
  console.log(`每週劇情：正式週 ${n} 週、備用週 ${f} 週、備用的一天 ${s} 天，都過了${r.warnings.length ? `（${r.warnings.length} 個警告）` : ""}`);
}
if (require.main === module) main();
module.exports = { checkContent, checkBundle, readWeeks, readJSON, LIMITS, BANNED, LEDGER, SETTINGS, WEEKS };
