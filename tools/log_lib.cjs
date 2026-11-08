// 維護日誌共用：讀檔、解析開頭的欄位、檢查格式。log_check.cjs、log_index.cjs 都用這個。
// 格式見 維護日誌/範本.md 和 AGENTS.md。
const fs = require("fs"), path = require("path");

const ROOT = path.join(__dirname, "..");
const LOG_DIR = path.join(ROOT, "維護日誌");
const FIELDS = ["日期", "作者", "AI", "類型", "範圍", "PR", "版本", "測試", "狀態"]; // 必填；「相關」可以不填
const TYPES = ["新功能", "修正", "平衡", "內容", "文件", "伺服器"];
const STATES = ["待合併", "已上線", "本機完成", "還沒驗證"];
const HEADINGS = ["## 為什麼要改", "## 改了什麼", "## 怎麼確認的", "## 還沒做、要注意", "## 給下一個人"];
const NAME_RE = /^(\d{2})-(\d{2})_([^_]+)_(.+)\.md$/; // 月-日_作者_主題.md

// 所有日誌檔：維護日誌/年份/*.md（範本.md、README.md 不算）
function listLogs() {
  if (!fs.existsSync(LOG_DIR)) return [];
  return fs.readdirSync(LOG_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^\d{4}$/.test(d.name))
    .flatMap(d => fs.readdirSync(path.join(LOG_DIR, d.name)).filter(f => f.endsWith(".md")).map(f => path.join(LOG_DIR, d.name, f)))
    .sort();
}

// 解析開頭 --- 之間的「欄位: 值」；值是 [a, b] 的變成陣列；# 後面是註解
function parse(text) {
  const m = text.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;
  const meta = {};
  for (const line of m[1].split("\n")) {
    const t = line.replace(/\s+#.*$/, "").trim();
    if (!t) continue;
    const i = t.indexOf(":");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(",").map(s => s.trim()).filter(Boolean);
    meta[k] = v;
  }
  return { meta, body: m[2] };
}

// 檢查一篇，回傳問題清單（空的就是沒問題）
function check(file) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  const errs = [];
  const name = path.basename(file), year = path.basename(path.dirname(file));
  const nm = name.match(NAME_RE);
  if (!nm) errs.push(`${rel}：檔名要是「月-日_作者_主題.md」，例如 11-08_翊文_融合提示看不清楚.md`);
  const p = parse(fs.readFileSync(file, "utf8"));
  if (!p) return errs.concat(`${rel}：開頭要有 --- 包起來的欄位`);
  const { meta, body } = p;
  for (const f of FIELDS) if (meta[f] == null || meta[f] === "" || (Array.isArray(meta[f]) && !meta[f].length)) errs.push(`${rel}：缺少欄位「${f}」`);
  if (meta.類型 && !TYPES.includes(meta.類型)) errs.push(`${rel}：類型只能是 ${TYPES.join("／")}，現在是「${meta.類型}」`);
  if (meta.狀態 && !STATES.includes(meta.狀態)) errs.push(`${rel}：狀態只能是 ${STATES.join("／")}，現在是「${meta.狀態}」`);
  if (meta.日期 && !/^\d{4}-\d{2}-\d{2}$/.test(meta.日期)) errs.push(`${rel}：日期要寫成 2026-11-08`);
  if (meta.日期 && nm && meta.日期 !== `${year}-${nm[1]}-${nm[2]}`) errs.push(`${rel}：日期 ${meta.日期} 跟資料夾、檔名（${year}-${nm[1]}-${nm[2]}）對不上`);
  if (meta.作者 && nm && meta.作者 !== nm[3]) errs.push(`${rel}：作者「${meta.作者}」跟檔名的「${nm[3]}」對不上`);
  if (meta.範圍 && !Array.isArray(meta.範圍)) errs.push(`${rel}：範圍要寫成 [檔案, 檔案]`);
  for (const h of HEADINGS) if (!body.includes(h)) errs.push(`${rel}：少了標題「${h}」`);
  return errs;
}

module.exports = { ROOT, LOG_DIR, FIELDS, TYPES, STATES, HEADINGS, NAME_RE, listLogs, parse, check };
