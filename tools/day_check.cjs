// 每天排程寫完內容、開 PR 之前跑：npm run day:check（翊文 2026-11-14：「稍微檢查一下每日排程要做的是，能不能優化，讓他方便做完事情，需要腳本也可以」）
// 把所有「內容」的檢查壹次跑完，最後印壹張過／沒過的清單；任何壹項沒過，結束碼 1。警告不擋，但要貼進 PR。
//   1. 每週劇情和帳本（tools/week_check.cjs：週包、每天的檔、帳本、揭露節奏 revealBeats、NPC、不破梗、禁用字）
//   2. 館內 NPC（tools/npc_check.cjs：預算、不露臉、季節節奏）
//   3. NPC 名單打包（shared/npc_roster.js 有沒有跟 content/npc 壹致；不壹致就跑 node tools/npc_pack.cjs）
//   4. 維護日誌的格式（tools/log_check.cjs；有沒有寫日誌）
//   5. 預約公告對得上工作流程（tools/announce.cjs --check）；趣味節日清單（test/funday.test.cjs：排程新增節日後要過）
//   6. 今天的檔缺什麼（tools/day_plan.cjs：clue、market、特展的新畫、結局書；只提醒，不擋）
// 完整的 npm test（整個遊戲的測試）由 npm run ship 跑，這裡不重複。
//   npm run day:check                     用現在的台灣日期
//   npm run day:check -- --date 2026-11-17   指定日期
const fs = require("fs"), path = require("path");
const { spawnSync } = require("child_process");
const ROOT = path.join(__dirname, "..");

// 一項檢查的結果整理：結束碼、警告行、錯誤行（純函式，測試用）
function summarize(name, code, stdout, stderr) {
  const lines = (String(stdout || "") + "\n" + String(stderr || "")).split("\n").map(x => x.trim()).filter(Boolean);
  const warnings = lines.filter(x => x.startsWith("警告 ")).map(x => x.slice(3));
  const errors = code === 0 ? [] : lines.filter(x => !x.startsWith("警告 ") && !/個問題$/.test(x));
  const note = lines.filter(x => !x.startsWith("警告 ")).slice(-1)[0] || "";
  return { name, ok: code === 0, warnings, errors, note: code === 0 ? note : "" };
}
// 名單打包有沒有跟上：回傳 { ok, message }
function packFresh(root = ROOT) {
  const pack = require("./npc_pack.cjs"), f = path.join(root, "shared", "npc_roster.js");
  if (!fs.existsSync(f)) return { ok: false, message: "shared/npc_roster.js 不見了：跑 node tools/npc_pack.cjs" };
  const now = pack.source(pack.roster(path.join(root, "content", "npc")));
  return fs.readFileSync(f, "utf8") === now ? { ok: true, message: "名單跟 content/npc 壹致" } : { ok: false, message: "shared/npc_roster.js 沒跟上 content/npc：跑 node tools/npc_pack.cjs，再 git add" };
}
const run = (name, args) => { const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8" }); return summarize(name, r.status === null ? 1 : r.status, r.stdout, r.stderr); };

function formatReport(results) {
  const L = [], bad = results.filter(r => !r.ok), warn = results.reduce((n, r) => n + r.warnings.length, 0);
  results.forEach(r => L.push(`${r.ok ? "✓" : "✗"} ${r.name}${r.note ? "：" + r.note : ""}${r.warnings.length ? `（${r.warnings.length} 個警告）` : ""}`));
  const W = results.flatMap(r => r.warnings.map(w => `  警告 ${w}`));
  if (W.length) { L.push(""); L.push("警告（不擋，貼進 PR）："); L.push(...W.slice(0, 30)); if (W.length > 30) L.push(`  …還有 ${W.length - 30} 個`); }
  const E = results.flatMap(r => r.errors.map(e => `  ${r.name}：${e}`));
  if (E.length) { L.push(""); L.push("沒過的原因："); L.push(...E.slice(0, 30)); }
  L.push("");
  L.push(bad.length ? `✗ ${bad.length} 項沒過：照上面改到過，再跑壹次。` : `✓ 全部通過${warn ? `（${warn} 個警告要貼進 PR）` : ""}。接著寫日誌（npm run doc:new）、npm run ship。`);
  return L.join("\n");
}

function main() {
  const a = process.argv.slice(2), i = a.indexOf("--date"), results = [];
  results.push(run("每週劇情、帳本、揭露節奏", ["tools/week_check.cjs"]));
  results.push(run("館內 NPC", ["tools/npc_check.cjs"]));
  const pf = packFresh(); results.push({ name: "NPC 名單打包", ok: pf.ok, warnings: [], errors: pf.ok ? [] : [pf.message], note: pf.ok ? pf.message : "" });
  results.push(run("維護日誌", ["tools/log_check.cjs"]));
  results.push(run("預約公告和工作流程", ["tools/announce.cjs", "--check"]));
  results.push(run("趣味節日清單（今日冷知識）", ["test/funday.test.cjs"]));
  try { // 今天的檔缺什麼：只提醒
    const { planDay, gatherFor } = require("./day_plan.cjs"), { load } = require("../test/load_shared.cjs"), G = load();
    const date = i >= 0 ? a[i + 1] : G.taipeiDay(Date.now()), p = planDay(gatherFor(date, G)), g = p.dayGaps, W = [];
    if (!p.paused && g) {
      if (!g.clue) W.push(`${p.dayFile}：今天還沒有任何 clue（每天至少壹條，書、房間、今日特展）`);
      if (!g.market && !p.market.weekend) W.push(`${p.dayFile}：沒有 market（世界股市新聞 3～5 則；沒有合適的可以不寫，要在 PR 說明）`);
      if (!g.svg) W.push(`${p.dayFile}：今日特展沒有用 svg 畫的新圖（每天至少 1～2 幅）`);
      if (g.ending === false) W.push(`${p.dayFile}：週日要有 "ending": true 的結局書`);
      if (p.beat.kind === "揭露週" && p.isBeatDay && !g.clue) W.push("今天是揭露日，但沒有 clue：揭露要放進書、房間或今日特展");
    }
    if (!p.paused && !p.isMonday && !p.weekJsonExists) W.push(`${p.week} 沒有 week.json：週一沒寫成？先補週包或走備用週`);
    if (!p.paused && !g && !p.dayExists) W.push(`${p.dayFile} 還沒寫（這項檢查只在今天的檔存在時才看內容）`);
    results.push({ name: "今天的檔（提醒）", ok: true, warnings: W, errors: [], note: W.length ? "" : "每天該有的都有" });
  } catch (e) { results.push({ name: "今天的檔（提醒）", ok: true, warnings: [`讀不到今天的計畫：${e.message}`], errors: [], note: "" }); }
  console.log(formatReport(results));
  process.exitCode = results.some(r => !r.ok) ? 1 : 0;
}
if (require.main === module) main();
module.exports = { summarize, packFresh, formatReport };
