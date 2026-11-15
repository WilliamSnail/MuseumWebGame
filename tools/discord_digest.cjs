// 每天 20:00 發壹則「今天的更新」到 Discord（翊文 11-15：「Discord更新太洗板了，可不可以調一下」→ 每天壹則彙整、「晚上8點發」）。
// 以前每上線壹包就發壹則（ship --say），壹天十幾則。現在平常上線不發，這支在 .github/workflows/discord-digest.yml 每天 20:00 跑：
//   把 shared/notices.js 裡「今天發布」的館方公告，照 NOTICE_AREAS 分段列標題。今天沒有公告就不發。
//   node tools/discord_digest.cjs [--date 2026-11-15]   印出要發的文字（沒有就印空的）；workflow 拿去給 tools/discord_post.cjs --say 發
// 大更新要馬上發：ship --say-now "……"（或 npm run say）。
const path = require("path"), { pathToFileURL } = require("url");
const MAX = 1800; // Discord 壹則 2000 字，discord_post 後面還會加連結
const imp = f => import(pathToFileURL(path.join(__dirname, "..", "shared", f)).href);

// list：今天的公告；回傳要發的文字（沒有就 ""）。純函式，測試用
function digestText(list, day, areaOf, areas) {
  const items = (list || []).filter(n => n && n.title && n.publish === day && n.cat !== "特展活動");
  if (!items.length) return "";
  const head = `📰 今天的更新（${day.slice(5).replace("-", "/")}）`, tail = "完整內容在館內公佈欄。";
  const by = new Map(areas.map(a => [a, []]));
  for (const n of items) { const a = areaOf(n); (by.get(a) || by.get("其他") || []).push(n.title.replace(/\s+/g, " ").trim()); }
  const lines = [head];
  let used = head.length + tail.length + 4, shown = 0;
  for (const [a, ts] of by) { // 壹行壹行加，放不下就停（不會因為某壹段太長整段都不見）
    if (!ts.length) continue;
    const h = `【${a}】`;
    if (used + h.length + 1 > MAX) break;
    lines.push(h); used += h.length + 1;
    let full = false;
    for (const t of ts) { const l = `・${t}`; if (used + l.length + 1 > MAX) { full = true; break; } lines.push(l); used += l.length + 1; shown++; }
    if (full) break;
  }
  if (shown < items.length) lines.push(`…還有 ${items.length - shown} 則`);
  lines.push(tail);
  return lines.join("\n");
}

async function main() {
  const { NOTICES, NOTICE_AREAS, noticeArea } = await imp("notices.js");
  const { taipeiDay } = await imp("logic.js");
  const a = process.argv.slice(2), i = a.indexOf("--date"), day = i >= 0 ? a[i + 1] : taipeiDay(Date.now());
  process.stdout.write(digestText(NOTICES, day, noticeArea, NOTICE_AREAS));
}
module.exports = { digestText };
if (require.main === module) main().catch(e => { console.error("✗ " + e.message); process.exit(1); });
