// Claude Code 的 hook（.claude/settings.json 的 PreToolUse、Write）：不准用 Write 新建維護日誌，要用 npm run doc:new
//   11-22 翊文：「有什麼辦法讓各個 session 不要忘記」→ AI 手寫日誌，標題沒照範本，ship 跑完測試才擋下來。
//   改已經存在的日誌（補內容、改狀態）不擋；doc:new 是 node 直接寫檔，不經過 Write，不會被擋。
//   讀 stdin 的 JSON：{ tool_name, tool_input: { file_path } }。擋的時候 exit 2，stderr 的字會回給 AI。
const fs = require("fs");
const LOG_RE = /(^|[\\/])docs[\\/]維護日誌[\\/]\d{4}[\\/][^\\/]+\.md$/;
// 回傳要擋的理由（字串），不擋回 ""
function blockReason(input, exists = f => fs.existsSync(f)) {
  const t = input && input.tool_name, f = input && input.tool_input && input.tool_input.file_path;
  if (t !== "Write" || typeof f !== "string" || !LOG_RE.test(f) || exists(f)) return "";
  return "維護日誌不要用 Write 手寫（標題、欄位容易寫錯）。把內容寫成 JSON，跑 npm run doc:new -- spec.json；格式看 tools/content/new_doc.cjs 開頭。spec.json 放 scratchpad 或 .claude/，不要放進 repo。已經存在的日誌可以直接改。";
}
if (require.main === module) {
  let raw = "";
  process.stdin.on("data", d => { raw += d; });
  process.stdin.on("end", () => {
    let input = null;
    try { input = JSON.parse(raw); } catch (e) { process.exit(0); } // 讀不懂就放行，不要卡住別的寫檔
    const why = blockReason(input);
    if (why) { process.stderr.write(why + "\n"); process.exit(2); }
    process.exit(0);
  });
}
module.exports = { LOG_RE, blockReason };
