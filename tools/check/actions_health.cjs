// 自動流程（GitHub Actions）壞了沒人發現：每天看一次過去 24 小時 main 上有沒有失敗的，有就寫進 GitHub issue「自動流程失敗通報」（翊文會收到 GitHub 通知）。
// 11-20 架構整理：舊的每日股票排程連續失敗好幾天才被發現。不發 Discord（Discord 是給玩家的）。
//   node tools/check/actions_health.cjs          印出過去 24 小時失敗的（本機看用，要有 gh）
//   node tools/check/actions_health.cjs --issue  有失敗就開 issue 或在開著的那則下面留言（.github/workflows/actions-health.yml 用）
// 只看 main 上的、排程的、手動的；PR 分支上的 CI 失敗是開發中的正常情況，不算。
const { spawnSync } = require("child_process");
const TITLE = "自動流程失敗通報";
const gh = args => { const r = spawnSync("gh", args, { encoding: "utf8" }); if (r.status !== 0) throw new Error("gh " + args.join(" ") + "：" + r.stderr); return r.stdout; };
function failures(runs, now = Date.now()) {
  return runs.filter(r => r.conclusion === "failure" && now - Date.parse(r.createdAt) <= 24 * 3600e3 && (r.headBranch === "main" || ["schedule", "workflow_dispatch"].includes(r.event)));
}
function text(bad) {
  const by = {};
  for (const r of bad) (by[r.workflowName] = by[r.workflowName] || []).push(r);
  return Object.entries(by).map(([name, rs]) => `- **${name}**：失敗 ${rs.length} 次，最近一次 ${rs[0].createdAt.replace("T", () => " ").slice(0, 16)}（UTC） ${rs[0].url}`).join("\n");
}
if (require.main === module) {
  const runs = JSON.parse(gh(["run", "list", "--limit", "200", "--json", "workflowName,conclusion,createdAt,headBranch,event,url"]));
  const bad = failures(runs);
  if (!bad.length) { console.log("過去 24 小時沒有失敗的自動流程"); process.exit(0); }
  const body = `過去 24 小時失敗的自動流程：\n\n${text(bad)}\n\n（tools/check/actions_health.cjs 每天自動整理；修好之後把這則 issue 關掉）`;
  console.log(body);
  if (process.argv.includes("--issue")) {
    const open = JSON.parse(gh(["issue", "list", "--state", "open", "--search", `${TITLE} in:title`, "--json", "number,title"])).find(i => i.title === TITLE);
    if (open) gh(["issue", "comment", String(open.number), "--body", body]);
    else gh(["issue", "create", "--title", TITLE, "--body", body]);
  }
}
module.exports = { failures, text };
