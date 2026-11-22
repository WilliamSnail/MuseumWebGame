// 每日排程有沒有跑起來（11-22，Yuga 排程檢視第 5 項）：每天台灣 09:30（排程 08:23 開跑）看一次，今天的 dN.json 還沒在 main 上、也沒有開著的 PR 帶它，就寫進 GitHub issue「自動流程失敗通報」（跟 actions_health 同一則）。
// 排程完全沒跑起來（雲端沒醒、PR 沒開）以前沒有人會知道。暫停中（content/排程設定.json 的 pause、pauseWeeks）不檢查。
//   node tools/check/schedule_health.cjs            本機看用（要有 gh 才看得到開著的 PR；沒有 gh 就只看 main 上有沒有）
//   node tools/check/schedule_health.cjs --issue    缺了就開 issue 或在開著的那則下面留言（.github/workflows/schedule-health.yml 用）
//   node tools/check/schedule_health.cjs --date 2026-11-23   指定日期（測試）
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");

// 純函式（測試用）：{ date, week, weekday, paused, onMain（dN.json 在 main 上嗎）, openPrFiles（開著的 PR 動到的檔名們）, weekJsonOnMain（週一才看）}
// 回傳 { ok, skip, reason }
function scheduleCheck({ date, week, weekday, paused, onMain, openPrFiles = [], weekJsonOnMain = true }) {
  const file = `content/weeks/${week}/d${weekday}.json`;
  if (paused) return { ok: true, skip: true, reason: `排程暫停中，不檢查（${date}）` };
  if (weekday === 1 && !weekJsonOnMain && !openPrFiles.includes(`content/weeks/${week}/week.json`)) return { ok: false, reason: `${date} 是週一，${week} 的 week.json 還沒在 main 上、也沒有開著的 PR（排程沒寫成？）` };
  if (onMain) return { ok: true, reason: `${file} 已經在 main 上` };
  if (openPrFiles.includes(file)) return { ok: true, reason: `${file} 在開著的 PR 裡（還沒合併）` };
  return { ok: false, reason: `今天（${date}）的 ${file} 還沒在 main 上，也沒有開著的 PR 帶它：每日排程可能沒跑起來（雲端 08:23 排程、claude.ai 的排程設定）` };
}
function gather(date, G) {
  const { spawnSync } = require("../dev/child.cjs");
  const week = G.isoWeek(date), weekday = G.dow ? G.dow(date) : ((new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;
  let settings = null; try { settings = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "排程設定.json"), "utf8")); } catch (e) { /* 沒有設定檔＝沒暫停 */ }
  const paused = !!(settings && (settings.pause === true || (Array.isArray(settings.pauseWeeks) && settings.pauseWeeks.includes(week))));
  let openPrFiles = [];
  const r = spawnSync("gh", ["pr", "list", "--state", "open", "--limit", "50", "--json", "number,files"], { encoding: "utf8" });
  if (r.status === 0) { try { openPrFiles = JSON.parse(r.stdout).flatMap(pr => (pr.files || []).map(f => f.path)); } catch (e) { /* 讀不到就當沒有 */ } }
  return { date, week, weekday, paused, onMain: fs.existsSync(path.join(ROOT, "content", "weeks", week, `d${weekday}.json`)), openPrFiles, weekJsonOnMain: fs.existsSync(path.join(ROOT, "content", "weeks", week, "week.json")) };
}
module.exports = { scheduleCheck, gather };
if (require.main === module) {
  const { load } = require("../../test/load_shared.cjs"), G = load(), a = process.argv.slice(2), i = a.indexOf("--date");
  const date = i >= 0 ? a[i + 1] : G.taipeiDay(Date.now());
  const r = scheduleCheck(gather(date, G));
  console.log((r.ok ? "✓ " : "✗ ") + r.reason);
  if (!r.ok && a.includes("--issue")) {
    const { report } = require("./actions_health.cjs");
    report(`每日排程檢查（tools/check/schedule_health.cjs，台灣 09:30）：\n\n- ${r.reason}\n\n（修好之後把這則 issue 關掉）`);
  }
  process.exit(r.ok || a.includes("--issue") ? 0 : 1); // --issue：已經通報了，工作流程不用再變紅
}
