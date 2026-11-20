// 每日排程的幾支腳本共用的小函式（11-16 每日排程優化：day_check --strict、day_new、day_pr、ledger reveal／written／day 以前各寫各的）
// 全部是純函式（不讀檔、不連網），test/tools/sched_tools.test.cjs 用假資料測。
//   asList、isObj          小工具
//   collectClues(day)      今天的檔放了哪些 clue：[{ id, where（書／房間／今日特展／其他）, title }]（同壹個 id 只算壹次）
//   isMainBook(book, wk)   這本書是不是主線章節書（line 是 main-sN，或 week.json 的 lines 裡那條 kind 是 main）
//   hasDayLine(list, n)    帳本的 hooks、ties、memes 這種清單，有沒有「dN：」開頭的那壹行
//   hasPlaceholder(day)    今天的檔還有沒有「待寫」（day:new 的骨架留的記號，沒改掉不能上線）
//   CONTENT_PLACEHOLDER    上面那個記號
const asList = v => Array.isArray(v) ? v : v ? [v] : [];
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const CONTENT_PLACEHOLDER = "待寫";

// 沿著 books／show.works／adds（房間）找 clue；其他地方（casino、real…）有 "clue" 也算，歸在「其他」
function collectClues(day) {
  const out = [], seen = new Set();
  const add = (id, where, title) => { if (typeof id === "string" && id && !seen.has(id)) { seen.add(id); out.push({ id, where, title: title || "" }); } };
  const deep = (o, where, title) => {
    if (Array.isArray(o)) { o.forEach(x => deep(x, where, title)); return; }
    if (!isObj(o)) return;
    const t = typeof o.title === "string" ? o.title : title;
    if (typeof o.clue === "string") add(o.clue, where, t);
    Object.keys(o).forEach(k => { if (k !== "clue") deep(o[k], where, t); });
  };
  if (!isObj(day)) return out;
  Object.keys(day).forEach(k => {
    const where = k === "books" ? "書" : k === "show" ? "今日特展" : k === "adds" ? "房間" : "其他";
    deep(day[k], where, "");
  });
  return out;
}

const MAIN_LINE = /^main-s\d+$/;
function isMainBook(book, wk) {
  if (!isObj(book) || !book.line) return false;
  if (MAIN_LINE.test(book.line)) return true;
  return asList(wk && wk.lines).some(l => isObj(l) && l.id === book.line && l.kind === "main");
}

const hasDayLine = (list, n) => asList(list).some(x => typeof x === "string" && new RegExp(`^d${n}\\s*[：:]`).test(x.trim()));
const hasPlaceholder = day => JSON.stringify(day || {}).includes(CONTENT_PLACEHOLDER);

module.exports = { asList, isObj, collectClues, isMainBook, hasDayLine, hasPlaceholder, CONTENT_PLACEHOLDER };
