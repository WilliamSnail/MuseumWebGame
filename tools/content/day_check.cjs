// 每天排程寫完內容、開 PR 之前跑：npm run day:check（翊文 2026-11-14：「稍微檢查一下每日排程要做的是，能不能優化，讓他方便做完事情，需要腳本也可以」）
// 把所有「內容」的檢查壹次跑完，最後印壹張過／沒過的清單；任何壹項沒過，結束碼 1。警告不擋，但要貼進 PR。
//   1. 每週劇情和帳本（tools/content/week_check.cjs：週包、每天的檔、帳本、揭露節奏 revealBeats、NPC、不破梗、禁用字）
//   2. 館內 NPC（tools/check/npc_check.cjs：預算、不露臉、季節節奏）
//   3. NPC 名單打包（shared/npc/roster.js 有沒有跟 content/npc 壹致；不壹致就跑 node tools/content/npc_pack.cjs）
//   4. 維護日誌的格式（tools/check/log_check.cjs；有沒有寫日誌）
//   5. 預約公告對得上工作流程（tools/content/announce.cjs --check）；趣味節日清單（test/story/funday.test.cjs：排程新增節日後要過）
//   6. 今天的檔缺什麼（tools/content/day_plan.cjs：clue、market、特展的新畫、結局書；只提醒，不擋）
// 完整的 npm test（整個遊戲的測試）由 npm run ship 跑，這裡不重複。
//   npm run day:check                     用現在的台灣日期
//   npm run day:check -- --date 2026-11-17   指定日期
//   npm run day:check -- --strict         排程用（11-16）：說明裡「一定要」的今天的項目，缺了就擋（不只警告）。只看「今天」（照 day_plan 的判斷），舊的週不追溯
//                                         （也可以 npm run day:check:strict）。擋的是：今天的檔、clue、svg、平日的 market、hooks／ties／memes／touched 今天那行、
//                                         揭露日放對 clue 而且帳本改 revealed、週日的結局書／主線章節書／answer、回聲週週日的 units.written、週一帳本的必填欄位、骨架（dN.json 和週一的 week.json）的「待寫」沒改掉
//   --allow-no-market／--allow-no-meme   今天真的沒有合適的世界股市新聞、政治梗：加這個放行，並在 PR 說明寫原因
//   --fix                               名單、館外地圖的打包沒跟上時，直接幫你打包（要 git add；ship 會 add -A）
const fs = require("fs"), path = require("path");
const { spawnSync } = require("../dev/child.cjs");
const { asList, isObj, collectClues, isMainBook, hasDayLine, hasPlaceholder, CONTENT_PLACEHOLDER } = require("./day_lib.cjs");
const ROOT = path.join(__dirname, "..", "..");

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
  const pack = require("./npc_pack.cjs"), f = path.join(root, "shared", "npc", "roster.js");
  if (!fs.existsSync(f)) return { ok: false, message: "shared/npc/roster.js 不見了：跑 node tools/content/npc_pack.cjs" };
  const now = pack.source(pack.roster(path.join(root, "content", "npc")));
  return fs.readFileSync(f, "utf8") === now ? { ok: true, message: "名單跟 content/npc 壹致" } : { ok: false, message: "shared/npc/roster.js 沒跟上 content/npc：跑 node tools/content/npc_pack.cjs，再 git add" };
}
// 館外地圖（content/map/館外.json）有沒有打包進 shared/world/map_data.js（以前只有 npm test 才抓得到，ship 的本機測試約 2 分鐘後才發現）
function mapFresh(root = ROOT) {
  const pack = require("./map_pack.cjs"), f = path.join(root, "shared", "world", "map_data.js"), src = path.join(root, "content", "map", "館外.json");
  if (!fs.existsSync(src)) return { ok: true, message: "沒有館外地圖資料" };
  if (!fs.existsSync(f)) return { ok: false, message: "shared/world/map_data.js 不見了：跑 node tools/content/map_pack.cjs" };
  return fs.readFileSync(f, "utf8") === pack.source(pack.spots(src)) ? { ok: true, message: "館外地圖跟 content/map/館外.json 壹致" } : { ok: false, message: "shared/world/map_data.js 沒跟上 content/map/館外.json：跑 node tools/content/map_pack.cjs，再 git add" };
}

// ---------- --strict：今天「一定要」的項目（純函式，測試用） ----------
// 輸入：p（day_plan 的 planDay 結果）、day（今天的 dN.json，沒有給 null）、wk（這週的 week.json）、ledger（整份帳本）、opts（allowNoMarket、allowNoMeme）。回傳錯誤字串陣列，空的就是過。
function strictIssues({ p, day, wk, ledger, opts = {} }) {
  const E = [];
  if (!p || p.paused) return E;
  const n = p.weekday, f = p.dayFile, rec = ledger && ledger.weeks && ledger.weeks[p.week] || null, g = p.dayGaps;
  if (p.isMonday && !p.weekJsonExists) E.push(`${p.week} 的 week.json 還沒寫（週一要排這壹週）`);
  if (!isObj(day) || !g) { E.push(`${f} 還沒寫`); return E; }
  if (isObj(wk) && hasPlaceholder(Object.assign({}, wk, { answer: undefined }))) E.push(`${p.week}/week.json 還有「${CONTENT_PLACEHOLDER}」（day:new 的週骨架留的記號）：全部換成真的內容`);
  if (hasPlaceholder(day)) E.push(`${f} 還有「${CONTENT_PLACEHOLDER}」（day:new 的骨架留的記號）：全部換成真的內容`);
  if (!g.clue) E.push(`${f}：今天沒有任何 clue（每天至少壹條，放在書、房間或今日特展）`);
  if (!g.svg) E.push(`${f}：今日特展沒有用 svg 畫的新圖（每天至少 1 幅）`);
  if (!g.market && !p.market.weekend && !opts.allowNoMarket) E.push(`${f}：平日要有 market（世界股市新聞 3～5 則）；真的沒有合適的，加 --allow-no-market 並在 PR 說明寫原因`);
  // 帳本今天那幾行（dN：開頭）
  if (!rec) E.push(`帳本 weeks.${p.week} 還沒有`);
  else {
    if (!hasDayLine(rec.hooks, n)) E.push(`帳本 weeks.${p.week}.hooks 沒有「d${n}：」開頭的那壹行（今天留了什麼鉤子、哪天接）`);
    if (!hasDayLine(rec.ties, n)) E.push(`帳本 weeks.${p.week}.ties 沒有「d${n}：」開頭的那壹行（今天碰到主軸的哪壹點）`);
    if (!hasDayLine(rec.memes, n) && !opts.allowNoMeme) E.push(`帳本 weeks.${p.week}.memes 沒有「d${n}：」開頭的那壹行（今天的政治梗）；搜不到的話加 --allow-no-meme 並在 PR 說明寫原因`);
    const touched = rec.subthemes && rec.subthemes.touched && rec.subthemes.touched[`d${n}`];
    if (!asList(touched).length) E.push(`帳本 weeks.${p.week}.subthemes.touched.d${n} 是空的（今天碰了哪條子主旨；ledger -- day --touched st-xx）`);
    if (p.isMonday) p.ledgerMissing.forEach(k => E.push(`帳本 weeks.${p.week}.${k} 週一要寫`));
    if (p.isMonday && p.unit) { if (rec.unit !== p.unit.id) E.push(`帳本 weeks.${p.week}.unit 要是 ${p.unit.id}`); if (!rec.unitRole) E.push(`帳本 weeks.${p.week}.unitRole 要寫（第 1 週 beat、第 2 週 echo）`); }
  }
  // 揭露日：放了對的 clue、帳本改 revealed
  if (p.isBeatDay && p.beat.beat) {
    const b = p.beat.beat, need = Math.max(1, asList(b.channels).filter(c => c && c.clue).length), have = collectClues(day).length;
    if (have < need) E.push(`${f}：今天是揭露日（${b.id}），帳本的 channels 有 ${need} 個地方要放 clue，今天的檔只有 ${have} 個 clue id`);
    const lb = asList(ledger && ledger.revealBeats && ledger.revealBeats.list).find(x => x && x.id === b.id);
    if (lb && !(lb.status === "revealed" && lb.revealedOn === p.date && asList(lb.clues).length)) E.push(`帳本 revealBeats「${b.id}」還沒改成 revealed（revealedOn 要是 ${p.date}、clues 要填）：跑 npm run ledger -- reveal ${b.id}`);
  }
  // 週日：結局書、主線章節書、疑點簿 answer
  if (n === 7) {
    const books = asList(day.books);
    if (!books.some(b => b && b.ending) && !(wk && wk.continues)) E.push(`${f}：週日要有 "ending": true 的結局書（或在 week.json 寫 continues）`);
    if (!books.some(b => isMainBook(b, wk))) E.push(`${f}：週日要再放壹本主線章節書（line 用 main-sN；week.json 的 lines 要有那條 kind main 的線）`);
    if (!wk || typeof wk.answer !== "string" || !wk.answer.trim()) E.push(`${p.week}/week.json 週日要寫 answer（這週疑點簿的答案）`);
    if (p.unit && p.unit.which === 2) {
      const u = asList(ledger && ledger.main && ledger.main.units).find(x => x && x.id === p.unit.id);
      if (u && !u.written) E.push(`帳本 main.units「${u.id}」的 written 還沒填（回聲週週日要做這壹段的進展；ledger -- written）`);
    }
  }
  return E;
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
  const a = process.argv.slice(2), i = a.indexOf("--date"), results = [], strict = a.includes("--strict"), fix = a.includes("--fix");
  if (fix) { // 打包沒跟上就直接打（要放在檢查前面）
    if (!packFresh().ok) require("./npc_pack.cjs").write();
    if (!mapFresh().ok) require("./map_pack.cjs").write();
  }
  results.push(run("每週劇情、帳本、揭露節奏", ["tools/content/week_check.cjs"]));
  results.push(run("館內 NPC", ["tools/check/npc_check.cjs"]));
  const pf = packFresh(); results.push({ name: "NPC 名單打包", ok: pf.ok, warnings: [], errors: pf.ok ? [] : [pf.message], note: pf.ok ? pf.message : "" });
  { const mf = mapFresh(); results.push({ name: "館外地圖打包", ok: mf.ok, warnings: [], errors: mf.ok ? [] : [mf.message], note: mf.ok ? mf.message : "" }); }
  results.push(run("維護日誌", ["tools/check/log_check.cjs"]));
  results.push(run("預約公告和工作流程", ["tools/content/announce.cjs", "--check"]));
  results.push(run("趣味節日清單（今日冷知識）", ["test/story/funday.test.cjs"]));
  try { // 今天的檔缺什麼：只提醒
    const { planDay, gatherFor } = require("./day_plan.cjs"), { load } = require("../../test/load_shared.cjs"), G = load();
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
  if (strict) { // 今天「一定要」的項目：缺了就擋
    try {
      const { planDay, gatherFor } = require("./day_plan.cjs"), { load } = require("../../test/load_shared.cjs"), G = load();
      const date = i >= 0 ? a[i + 1] : G.taipeiDay(Date.now()), ctx = gatherFor(date, G), p = planDay(ctx), pack = ctx.weeks[p.week];
      const E = strictIssues({ p, day: pack && pack.days && pack.days[p.weekday] || null, wk: pack && pack.week || null, ledger: ctx.ledger, opts: { allowNoMarket: a.includes("--allow-no-market"), allowNoMeme: a.includes("--allow-no-meme") } });
      results.push({ name: `今天（${date}）一定要有的（--strict）`, ok: !E.length, warnings: [], errors: E, note: p.paused ? "暫停中，不檢查" : E.length ? "" : "每天該有的都有" });
    } catch (e) { results.push({ name: "今天一定要有的（--strict）", ok: false, warnings: [], errors: [`讀不到今天的計畫：${e.message}`], note: "" }); }
  }
  console.log(formatReport(results));
  process.exitCode = results.some(r => !r.ok) ? 1 : 0;
}
if (require.main === module) main();
module.exports = { summarize, packFresh, mapFresh, strictIssues, formatReport };
