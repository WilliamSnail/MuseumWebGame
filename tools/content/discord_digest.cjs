// 每天 20:00 發壹則「今天的更新」到 Discord（翊文 11-15：「Discord更新太洗板了，可不可以調一下」→ 每天壹則彙整、「晚上8點發」）。
// 以前每上線壹包就發壹則（ship --say），壹天十幾則。現在平常上線不發，這支在 .github/workflows/discord-digest.yml 每天 20:00 跑：
//   把 shared/game/notices.js 裡「今天發布」的館方公告，照 NOTICE_AREAS 分段列標題。今天沒有公告就不發。
//   node tools/content/discord_digest.cjs [--date 2026-11-15]   印出要發的文字（沒有就印空的）；workflow 拿去給 tools/content/discord_post.cjs --say 發
// 大更新要馬上發：ship --say-now "……"（或 npm run say）。
const path = require("path"), { pathToFileURL } = require("url");
const imp = f => import(pathToFileURL(path.join(__dirname, "..", "..", "shared", f)).href);

// list：今天的公告；回傳要發的文字（沒有就 ""）。純函式，測試用
async function main() {
  require("./notices_build.cjs").write(); // shared/game/notices_data.js 不進 git，先產生
  const { NOTICES, NOTICE_AREAS, noticeArea } = await imp("game/notices.js");
  const { taipeiDay } = await imp("core/logic.js");
  const { dcDigestText } = await imp("discord/out.js"); // 組字在 shared/discord/out.js（伺服器排程也用同壹份）
  const a = process.argv.slice(2), i = a.indexOf("--date"), day = i >= 0 ? a[i + 1] : taipeiDay(Date.now());
  process.stdout.write(dcDigestText(NOTICES, day, noticeArea, NOTICE_AREAS));
}
if (require.main === module) main().catch(e => { console.error("✗ " + e.message); process.exit(1); });
