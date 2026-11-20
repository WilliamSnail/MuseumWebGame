// 部署前要不要重跑測試（11-16 CI 和部署加速；.github/workflows/deploy.yml 的 test job 第一步叫這支）
//
// 規則（只有一條會跳過，其他一律照跑，寧可慢不要漏）：
//   合併到 main（push 事件）的這個 commit，它的 tree（git rev-parse HEAD^{tree}，整份檔案內容的指紋）
//   跟某個 PR 的 CI 測過的 tree「完全一樣」，而且那次 CI 的 test job 全部步驟都成功，才跳過部署前的測試。
//   ・「CI 測過的 tree」不是 PR head 的 tree：pull_request 的 CI 測的是 GitHub 暫時合出來的 merge ref（PR 加上當時的 main）。
//     所以 ci.yml 在測試前把 `git rev-parse HEAD^{tree}` 寫進一個步驟的名字（「測試的 tree <40 位十六進位>」），這裡從 API 讀回來比對。
//   ・哪些 CI 要看：這個 commit 的第 2 個以後的 parent（GitHub 合併鈕做的 merge commit，第 2 個 parent 就是 PR head）、
//     加上 GitHub 說這個 commit 屬於哪些 PR 的 head。每個 head 的 ci.yml 跑過的、結論 success 的 run 都算。
//   ・中間有別包先合進 main → merge commit 的 tree 跟 PR 測過的不一樣 → 照跑。
//   ・手動部署（workflow_dispatch）、API 讀不到、找不到對應的 CI、tree 對不上、步驟沒全過 → 照跑。這支永遠不報錯離開，只會說「跳過」或「照跑」。
//
// 用法（deploy.yml）：node tools/release/deploy_gate.cjs --github-output   （把 skip_tests=true／false 寫進 $GITHUB_OUTPUT）
// 本機看看：node tools/release/deploy_gate.cjs --sha <commit> --event push --repo WilliamSnail/MuseumWebGame
const { spawnSync } = require("child_process");
const fs = require("fs"), path = require("path");

// ci.yml 的步驟名字（test/tools/deploy_gate.test.cjs 會確認 ci.yml 真的用這些名字）
const STEP_TEST = "測試（規則、內容、特效、模組、日誌格式）", STEP_BUILD = "打包";
const TREE_STEP = /^測試的 tree ([0-9a-f]{40})$/;

// 一個 CI job（API 的 jobs 回傳的一筆）測過哪個 tree；沒全過或沒記就回 null（純函式，測試用）
function testedTree(job) {
  if (!job || job.conclusion !== "success" || !Array.isArray(job.steps)) return null;
  const real = job.steps.filter(s => s && s.name !== "Set up job" && s.name !== "Complete job" && !/^Post /.test(s.name || ""));
  if (!real.length || !real.every(s => s.conclusion === "success" || s.conclusion === "skipped")) return null;
  // 「測試」「打包」兩步一定要是真的跑過（success），不能是 skipped
  const must = [STEP_TEST, STEP_BUILD];
  const ran = name => real.some(s => s.name === name && s.conclusion === "success");
  if (!must.every(ran)) return null;
  const hit = real.map(s => TREE_STEP.exec(s.name || "")).filter(Boolean);
  if (hit.length !== 1) return null;
  const at = real.findIndex(s => TREE_STEP.test(s.name || "")), t = real.findIndex(s => s.name === STEP_TEST);
  if (at < 0 || t < 0 || at > t) return null; // 記 tree 要在測試之前（先記再測，測的才是記的那份）
  return hit[0][1];
}

// 決定（純函式）：event、這個 commit 的 tree、候選 CI（[{sha, jobs:[job…]}]）
function decide({ event, tree, candidates }) {
  if (event !== "push") return { skip: false, why: `事件是 ${event || "（沒有）"}，不是合併到 main：照跑` };
  if (!/^[0-9a-f]{40}$/.test(tree || "")) return { skip: false, why: "讀不到這個 commit 的 tree：照跑" };
  const seen = [];
  for (const c of candidates || []) for (const j of c.jobs || []) {
    const t = testedTree(j);
    if (t) seen.push(`${(c.sha || "").slice(0, 8)}→${t.slice(0, 8)}`);
    if (t === tree) return { skip: true, why: `這個 commit 的 tree ${tree.slice(0, 12)} 跟 PR 的 CI 測過的完全一樣（來源 ${(c.sha || "").slice(0, 8)}，job ${j.id || "?"}）：跳過部署前的測試` };
  }
  return { skip: false, why: `找不到測過同一個 tree ${tree.slice(0, 12)} 的 CI（看過：${seen.join("、") || "沒有成功的 CI"}）：照跑` };
}

const run = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const gitOut = (cwd, ...a) => { const r = run("git", a, cwd); return r.status === 0 ? r.stdout.trim() : null; };
const ghJson = (p, cwd) => { const r = run("gh", ["api", p], cwd); if (r.status !== 0) return null; try { return JSON.parse(r.stdout); } catch { return null; } };

// 要看哪些 head：merge commit 的第 2 個以後的 parent ＋ API 說的、這個 commit 所屬 PR 的 head
function headsOf(sha, repo, cwd, api) {
  const set = new Set();
  const parents = (gitOut(cwd, "rev-list", "--parents", "-n", "1", sha) || "").split(/\s+/).slice(1);
  parents.slice(1).forEach(p => /^[0-9a-f]{40}$/.test(p) && set.add(p));
  const prs = api(`repos/${repo}/commits/${sha}/pulls`, cwd);
  (Array.isArray(prs) ? prs : []).forEach(pr => pr && pr.head && /^[0-9a-f]{40}$/.test(pr.head.sha || "") && set.add(pr.head.sha));
  return [...set];
}
// 一個 head 上 ci.yml 成功跑過的每個 run 的 jobs
function ciJobs(sha, repo, cwd, api) {
  const runs = api(`repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&status=success&per_page=10`, cwd);
  const out = [];
  for (const r of (runs && runs.workflow_runs) || []) {
    if (r.event !== "pull_request" || r.conclusion !== "success") continue;
    const j = api(`repos/${repo}/actions/runs/${r.id}/jobs?per_page=30`, cwd);
    out.push(...((j && j.jobs) || []));
  }
  return out;
}

function gate({ sha, event, repo, cwd, api = ghJson }) {
  try {
    const tree = gitOut(cwd, "rev-parse", `${sha}^{tree}`);
    if (event !== "push") return decide({ event, tree, candidates: [] });
    const candidates = headsOf(sha, repo, cwd, api).map(h => ({ sha: h, jobs: ciJobs(h, repo, cwd, api) }));
    return decide({ event, tree, candidates });
  } catch (e) { return { skip: false, why: "判斷時出錯（" + e.message + "）：照跑" }; }
}

function main() {
  const a = process.argv.slice(2), val = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  const sha = val("--sha") || process.env.GITHUB_SHA || "HEAD", event = val("--event") || process.env.GITHUB_EVENT_NAME || "";
  const repo = val("--repo") || process.env.GITHUB_REPOSITORY || "WilliamSnail/MuseumWebGame";
  const r = gate({ sha, event, repo, cwd: path.join(__dirname, "..", "..") });
  console.log((r.skip ? "跳過部署前的測試：" : "照跑部署前的測試：") + r.why);
  if (a.includes("--github-output") && process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `skip_tests=${r.skip ? "true" : "false"}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### 部署前的測試\n${r.skip ? "**跳過**" : "**照跑**"}：${r.why}\n`);
}
if (require.main === module) main();
module.exports = { STEP_TEST, STEP_BUILD, TREE_STEP, testedTree, decide, gate, headsOf, ciJobs };
