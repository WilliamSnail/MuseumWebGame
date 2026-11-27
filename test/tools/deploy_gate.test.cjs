// 部署前要不要重跑測試（tools/release/deploy_gate.cjs）：tree 跟 PR 的 CI 測過的完全一樣才跳過，其他一律照跑
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const { spawnSync } = require("../../tools/dev/child.cjs");
const G = require("../../tools/release/deploy_gate.cjs");
const root = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");

let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack || e.message); } };

const H = c => c.repeat(40), TREE = H("a"), OTHER = H("b");
const step = (name, conclusion = "success") => ({ name, conclusion });
const goodJob = (tree, extra = {}) => Object.assign({ id: 1, conclusion: "success", steps: [step("Set up job"), step("Run actions/checkout@v4"), step("Run npm ci"), step("Run echo hash"), step("測試的 tree " + tree), step(G.STEP_TEST), step(G.STEP_BUILD), step("PR 改了程式就要有維護日誌"), step("Complete job")] }, extra);

T("testedTree：全過的 job 讀得出 tree", () => assert.strictEqual(G.testedTree(goodJob(TREE)), TREE));
T("testedTree：job 沒過、步驟沒過、測試步驟被跳過、沒記 tree、記在測試之後、記兩次 → null", () => {
  assert.strictEqual(G.testedTree(goodJob(TREE, { conclusion: "failure" })), null);
  const j = goodJob(TREE); j.steps[5] = step(G.STEP_TEST, "failure"); assert.strictEqual(G.testedTree(j), null);
  const k = goodJob(TREE); k.steps[5] = step(G.STEP_TEST, "skipped"); assert.strictEqual(G.testedTree(k), null, "測試被跳過不算");
  const n = goodJob(TREE); n.steps.splice(4, 1); assert.strictEqual(G.testedTree(n), null);
  const late = goodJob(TREE); late.steps.splice(4, 1); late.steps.splice(6, 0, step("測試的 tree " + TREE)); assert.strictEqual(G.testedTree(late), null);
  const two = goodJob(TREE); two.steps.splice(5, 0, step("測試的 tree " + OTHER)); assert.strictEqual(G.testedTree(two), null);
  assert.strictEqual(G.testedTree(goodJob("zzz")), null, "不是 40 位十六進位");
  assert.strictEqual(G.testedTree(null), null);
  assert.strictEqual(G.testedTree({ conclusion: "success" }), null);
});
T("decide：tree 一樣就跳過", () => {
  const r = G.decide({ event: "push", tree: TREE, candidates: [{ sha: H("c"), jobs: [goodJob(TREE)] }] });
  assert.strictEqual(r.skip, true, r.why);
});
T("decide：tree 不一樣（中間有別包先合進 main）→ 照跑", () => {
  const r = G.decide({ event: "push", tree: TREE, candidates: [{ sha: H("c"), jobs: [goodJob(OTHER)] }] });
  assert.strictEqual(r.skip, false); assert.ok(r.why.includes("找不到"));
});
T("decide：手動部署、讀不到 tree、沒有候選、CI 沒過 → 照跑", () => {
  const c = [{ sha: H("c"), jobs: [goodJob(TREE)] }];
  assert.strictEqual(G.decide({ event: "workflow_dispatch", tree: TREE, candidates: c }).skip, false);
  assert.strictEqual(G.decide({ event: "", tree: TREE, candidates: c }).skip, false);
  assert.strictEqual(G.decide({ event: "push", tree: null, candidates: c }).skip, false);
  assert.strictEqual(G.decide({ event: "push", tree: TREE, candidates: [] }).skip, false);
  assert.strictEqual(G.decide({ event: "push", tree: TREE, candidates: undefined }).skip, false);
  assert.strictEqual(G.decide({ event: "push", tree: TREE, candidates: [{ sha: H("c"), jobs: [goodJob(TREE, { conclusion: "failure" })] }] }).skip, false);
});
T("decide：多個候選，有一個對得上就跳過", () => {
  const r = G.decide({ event: "push", tree: TREE, candidates: [{ sha: H("c"), jobs: [goodJob(OTHER)] }, { sha: H("d"), jobs: [goodJob(TREE)] }] });
  assert.strictEqual(r.skip, true);
});

// 真的 git：做一個 PR 分支和 merge commit，API 用假的
function sandbox() {
  const dir = require("../tmp_dir.cjs").tmpDir("dg-");
  const git = (...a) => { const r = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...a], { cwd: dir, encoding: "utf8" }); assert.strictEqual(r.status, 0, a.join(" ") + "\n" + r.stderr); return r.stdout.trim(); };
  git("init", "-q", "-b", "main");
  fs.writeFileSync(path.join(dir, "a.txt"), "1"); git("add", "-A"); git("commit", "-q", "-m", "base");
  return { dir, git };
}
const fakeApi = table => p => { for (const [k, v] of Object.entries(table)) if (p.includes(k)) return typeof v === "function" ? v(p) : v; return null; };
T("gate（真的 git）：PR 已併過最新 main，merge 後 tree 一樣 → 跳過；中間有別包 → 照跑；API 壞掉 → 照跑", () => {
  const { dir, git } = sandbox();
  git("checkout", "-q", "-b", "pr"); fs.writeFileSync(path.join(dir, "b.txt"), "2"); git("add", "-A"); git("commit", "-q", "-m", "pr");
  const head = git("rev-parse", "HEAD"), headTree = git("rev-parse", "HEAD^{tree}");
  git("checkout", "-q", "main"); git("merge", "-q", "--no-ff", "-m", "Merge PR", "pr");
  const merge = git("rev-parse", "HEAD");
  assert.strictEqual(git("rev-parse", "HEAD^{tree}"), headTree, "main 沒動：merge 的 tree = PR head 的 tree");
  const api = tree => fakeApi({
    "/pulls": [{ head: { sha: head } }],
    "workflows/ci.yml/runs": { workflow_runs: [{ id: 7, event: "pull_request", conclusion: "success" }] },
    "actions/runs/7/jobs": { jobs: [goodJob(tree)] },
  });
  assert.strictEqual(G.gate({ sha: merge, event: "push", repo: "o/r", cwd: dir, api: api(headTree) }).skip, true);
  assert.strictEqual(G.gate({ sha: merge, event: "workflow_dispatch", repo: "o/r", cwd: dir, api: api(headTree) }).skip, false, "手動照跑");
  assert.strictEqual(G.gate({ sha: merge, event: "push", repo: "o/r", cwd: dir, api: api(H("9")) }).skip, false, "CI 測的 tree 不是這個");
  assert.strictEqual(G.gate({ sha: merge, event: "push", repo: "o/r", cwd: dir, api: () => null }).skip, false, "API 讀不到");
  assert.strictEqual(G.gate({ sha: merge, event: "push", repo: "o/r", cwd: dir, api: () => { throw new Error("boom"); } }).skip, false, "出錯照跑");
  // API 完全沒給 PR 時，merge commit 的第 2 個 parent 也算候選
  const viaParent = fakeApi({ "workflows/ci.yml/runs": q => (q.includes("head_sha=" + head) ? { workflow_runs: [{ id: 7, event: "pull_request", conclusion: "success" }] } : { workflow_runs: [] }), "actions/runs/7/jobs": { jobs: [goodJob(headTree)] } });
  assert.strictEqual(G.gate({ sha: merge, event: "push", repo: "o/r", cwd: dir, api: viaParent }).skip, true, "用 merge commit 的第 2 個 parent");
  // 中間有別包先合進 main：main 多一個 commit，PR 再 merge → tree 變了
  git("checkout", "-q", "-b", "pr2", "main~1"); fs.writeFileSync(path.join(dir, "c.txt"), "3"); git("add", "-A"); git("commit", "-q", "-m", "pr2");
  const head2 = git("rev-parse", "HEAD"), tree2 = git("rev-parse", "HEAD^{tree}");
  git("checkout", "-q", "main"); git("merge", "-q", "--no-ff", "-m", "Merge PR2", "pr2");
  const merge2 = git("rev-parse", "HEAD");
  assert.notStrictEqual(git("rev-parse", "HEAD^{tree}"), tree2, "有別包先合進來：tree 不同");
  const api2 = fakeApi({ "/pulls": [{ head: { sha: head2 } }], "workflows/ci.yml/runs": { workflow_runs: [{ id: 8, event: "pull_request", conclusion: "success" }] }, "actions/runs/8/jobs": { jobs: [goodJob(tree2)] } });
  const r = G.gate({ sha: merge2, event: "push", repo: "o/r", cwd: dir, api: api2 });
  assert.strictEqual(r.skip, false, r.why);
});
T("CLI：手動部署照跑、寫 skip_tests=false、不會報錯離開", () => {
  const out = path.join(os.tmpdir(), "dg-out-" + process.pid + ".txt"); fs.rmSync(out, { force: true });
  const r = spawnSync(process.execPath, [path.join(root, "tools", "release", "deploy_gate.cjs"), "--github-output", "--event", "workflow_dispatch"], { encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: out } });
  assert.strictEqual(r.status, 0, r.stderr); assert.ok(fs.readFileSync(out, "utf8").includes("skip_tests=false")); assert.ok(r.stdout.includes("照跑"));
  fs.rmSync(out, { force: true });
});
T("ci.yml：測試之前記下 tree，步驟名字跟 deploy_gate 約定的一樣", () => {
  const ci = read(".github/workflows/ci.yml");
  assert.ok(ci.includes("- name: 測試的 tree ${{ steps.tree.outputs.hash }}"));
  assert.ok(ci.includes("hash=$(git rev-parse HEAD^{tree})"));
  assert.ok(ci.includes("- name: " + G.STEP_TEST) && ci.includes("- name: " + G.STEP_BUILD));
  assert.ok(ci.indexOf("測試的 tree") < ci.indexOf("- name: " + G.STEP_TEST), "記 tree 在測試之前");
});
T("deploy.yml：test 跟 prepare 同時跑（互不 needs）、gate 在 test 裡、deploy 等兩個、金鑰只在 deploy", () => {
  const d = read(".github/workflows/deploy.yml");
  const test = d.slice(d.indexOf("\n  test:\n"), d.indexOf("\n  prepare:\n")), prep = d.slice(d.indexOf("\n  prepare:\n"), d.indexOf("\n  deploy:\n"));
  assert.ok(!/needs:/.test(test) && !/needs:/.test(prep), "test、prepare 不互相等");
  assert.ok(test.includes("node tools/release/deploy_gate.cjs --github-output") && test.includes("run: npm test"));
  assert.ok(test.includes("steps.gate.outputs.skip_tests != 'true'"));
  assert.ok(!/secrets\./.test(test) && !/secrets\./.test(prep), "test、prepare 不碰 secrets");
  assert.ok(prep.includes("npm run build") && prep.includes("upload-artifact"));
  const dep = d.slice(d.indexOf("\n  deploy:\n"));
  assert.ok(dep.includes("needs: [test, prepare]") && dep.includes("download-artifact") && dep.includes("firebase deploy"));
  assert.ok(!/workflow_dispatch:\s*\n\s+inputs/.test(d), "手動部署沒有可以跳測試的選項");
});

console.log(`${pass} passed, ${fail} failed（部署前的測試判斷）`);
process.exit(fail ? 1 : 0);
