// 不准用 Write 新建維護日誌的 hook（tools/dev/hook_log_write.cjs，11-22）：node test/tools/hook_log_write.test.cjs
const assert = require("assert");
const fs = require("fs"), path = require("path");
const { blockReason } = require("../../tools/dev/hook_log_write.cjs");
const { spawnSync } = require("../../tools/dev/child.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, e.message); } };
const W = f => ({ tool_name: "Write", tool_input: { file_path: f } });
const no = () => false, yes = () => true;

T("新建日誌（Windows 和 / 兩種寫法）要擋，說明裡有 doc:new", () => {
  for (const f of ["E:\\MuseumWebGame\\docs\\維護日誌\\2026\\11-22_翊文_測試.md", "E:/MuseumWebGame/.claude/worktrees/x/docs/維護日誌/2026/11-22_翊文_測試.md"]) {
    const r = blockReason(W(f), no);
    assert.ok(r.includes("npm run doc:new"), f);
  }
});
T("已經存在的日誌可以改", () => assert.strictEqual(blockReason(W("E:\\r\\docs\\維護日誌\\2026\\11-21_翊文_x.md"), yes), ""));
T("別的檔、範本、別的工具不擋", () => {
  assert.strictEqual(blockReason(W("E:\\r\\web\\src\\a.js"), no), "");
  assert.strictEqual(blockReason(W("E:\\r\\docs\\維護日誌\\範本.md"), no), "", "範本在第一層，不是年份資料夾");
  assert.strictEqual(blockReason(W("E:\\r\\docs\\規則\\界線.md"), no), "");
  assert.strictEqual(blockReason({ tool_name: "Edit", tool_input: { file_path: "E:\\r\\docs\\維護日誌\\2026\\a.md" } }, no), "");
  assert.strictEqual(blockReason(null, no), "");
});
T("當指令跑：擋的 exit 2、放行 exit 0、讀不懂的放行", () => {
  const run = s => spawnSync(process.execPath, [path.join(__dirname, "..", "..", "tools", "dev", "hook_log_write.cjs")], { input: s, encoding: "utf8" });
  const nf = path.join(__dirname, "..", "..", "docs", "維護日誌", "2026", "99-99_沒有_這篇.md");
  assert.strictEqual(run(JSON.stringify(W(nf))).status, 2);
  assert.strictEqual(run(JSON.stringify(W(path.join(__dirname, "x.js")))).status, 0);
  assert.strictEqual(run("不是 JSON").status, 0);
});
T(".claude/settings.json 有接上這支 hook", () => {
  const s = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".claude", "settings.json"), "utf8"));
  const hit = (s.hooks.PreToolUse || []).some(h => /Write/.test(h.matcher) && h.hooks.some(x => /hook_log_write\.cjs/.test(x.command)));
  assert.ok(hit);
});

console.log(`hook_log_write：${pass} 過、${fail} 沒過`);
if (fail) process.exit(1);
