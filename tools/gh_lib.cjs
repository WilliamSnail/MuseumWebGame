// 共用的 GitHub 小工具（11-15 合併：翊文「記得有什麼腳本要寫都要寫，如果腳本需要合併也記得」）。
// 以前 wf_run、fb_run、say、ship 各寫壹份「找 gh、跑 gh、觸發流程、認出新的那壹次、等它跑完」，改壹處要改四處。
//   gh()                         gh 的路徑（環境變數 GH_BIN 優先，Windows 找 Program Files）
//   ghRun(args, { ok })          跑 gh；ok 為 true 時失敗不丟錯。回傳 spawnSync 的結果加 out（去頭尾空白的 stdout）
//   sleep(ms)                    同步等
//   latestRunId(workflow)        這個流程最新壹次的 id（沒有回 ""）
//   newRunId(ids, oldId)         清單裡第壹個不是舊那次的（純函式，測試用）
//   dispatch(workflow, inputs, { ref, waitMin, onId })
//                                觸發、認出新的那壹次、等它跑完。回傳 { id, url, ok }；認不出新的就丟錯
//   runState(id)                 這壹次現在的 { status, conclusion }（REST：gh api repos/…/actions/runs/ID）；網路錯誤丟錯
//   runVerdict(st)               { status, conclusion } → "wait" | "ok" | "fail"（純函式，測試用）
//   waitRun(id, opts)            輪詢到跑完：回傳 { ok, status, conclusion, url, timedOut }。
//                                不用 gh run watch（11-16：它會中途斷掉、非零結束，PR 600、620、627 明明部署成功卻被判失敗）。
//                                查狀態遇到網路短暫錯誤會重試（連續 maxErrors 次才放棄）；opts 可換 fetchState／sleep（測試用）
//   runLog(id)                   那壹次的完整紀錄（字串）
// 雲端排程的環境擋 GraphQL：這裡只用 gh workflow／gh run／gh api（REST）。
const fs = require("fs");
const { spawnSync } = require("child_process");
const REPO = "WilliamSnail/MuseumWebGame";

const gh = () => process.env.GH_BIN || (fs.existsSync("C:\\Program Files\\GitHub CLI\\gh.exe") ? "C:\\Program Files\\GitHub CLI\\gh.exe" : "gh");
function ghRun(args, opts = {}) {
  const r = spawnSync(gh(), args, { encoding: "utf8", maxBuffer: 1 << 26, input: opts.input });
  if (r.error) throw r.error;
  if (r.status !== 0 && !opts.ok) throw new Error(`gh ${args.slice(0, 2).join(" ")} 失敗：${((r.stderr || "") + (r.stdout || "")).trim().slice(-300)}`);
  return Object.assign(r, { out: (r.stdout || "").trim() });
}
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const latestRunId = wf => ghRun(["run", "list", "--repo", REPO, "--workflow", wf, "--limit", "1", "--json", "databaseId", "--jq", ".[].databaseId"], { ok: true }).out;
const newRunId = (ids, oldId) => { const id = ids.find(Boolean); return id && String(id) !== String(oldId) ? String(id) : null; };

// ---------- 等壹次 run 跑完（REST 輪詢） ----------
const runState = id => {
  const r = ghRun(["api", `repos/${REPO}/actions/runs/${id}`, "--jq", "{status,conclusion}"]);
  const j = JSON.parse(r.out || "{}");
  if (!j.status) throw new Error("查不到 run " + id + " 的狀態：" + r.out.slice(0, 100));
  return j;
};
const RUN_OK = ["success", "skipped", "neutral"];
const runVerdict = st => !st || st.status !== "completed" ? "wait" : RUN_OK.includes(st.conclusion) ? "ok" : "fail";
function waitRun(id, opts = {}) {
  const fetchState = opts.fetchState || runState, nap = opts.sleep || sleep;
  const every = opts.intervalMs || 10000, maxMs = opts.maxMs || 20 * 60 * 1000, maxErrors = opts.maxErrors || 6;
  const url = `https://github.com/${REPO}/actions/runs/${id}`;
  let waited = 0, errs = 0, last = null;
  for (;;) {
    try { last = fetchState(id); errs = 0; }
    catch (e) { if (++errs >= maxErrors) throw new Error(`查 run ${id} 的狀態連續失敗 ${errs} 次：${e.message}`); }
    const v = runVerdict(last);
    if (v !== "wait") return { ok: v === "ok", status: last.status, conclusion: last.conclusion, url, timedOut: false };
    if (waited >= maxMs) return { ok: false, status: last ? last.status : "unknown", conclusion: null, url, timedOut: true };
    nap(every); waited += every;
  }
}

function dispatch(wf, inputs = {}, opts = {}) {
  const old = latestRunId(wf), ref = opts.ref || "main";
  const fields = Object.entries(inputs).flatMap(([k, v]) => ["-f", `${k}=${v}`]);
  ghRun(["workflow", "run", wf, "--repo", REPO, "--ref", ref, ...fields]); // 參數錯（例如輸入名字不對）在這裡就停
  let id = null;
  const tries = Math.ceil((opts.waitMin || 3) * 60 / 5);
  for (let i = 0; i < tries && !id; i++) { id = newRunId([latestRunId(wf)], old); if (!id) sleep(5000); }
  if (!id) throw new Error(`等了 ${opts.waitMin || 3} 分鐘，還是沒有新的壹次（GitHub Actions 可能在塞車）`);
  const url = `https://github.com/${REPO}/actions/runs/${id}`;
  if (opts.onId) opts.onId(id, url);
  const w = waitRun(id, { intervalMs: 10000 });
  return { id, url, ok: w.ok };
}
const runLog = id => ghRun(["run", "view", String(id), "--repo", REPO, "--log"], { ok: true }).stdout || "";

module.exports = { REPO, gh, ghRun, sleep, latestRunId, newRunId, runState, runVerdict, waitRun, dispatch, runLog };
