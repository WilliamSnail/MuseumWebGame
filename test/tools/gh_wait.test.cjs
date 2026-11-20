// ship／gh_lib 等 CI、等部署（11-16）：不用 gh run watch（會中途斷掉、非零結束，PR 其實已合併、部署成功卻被判失敗），
// 改成輪詢 run 的 status／conclusion；網路短暫錯誤重試。用假的查狀態函式測。
const assert = require("assert");
const { runVerdict, waitRun } = require("../../tools/release/gh_lib.cjs");
let n = 0;
const t = (name, fn) => { fn(); n++; };
// 假的查狀態：照順序回傳（Error 就丟錯）
const seq = list => { let i = 0; return () => { const x = list[Math.min(i++, list.length - 1)]; if (x instanceof Error) throw x; return x; }; };
const naps = []; const nap = ms => naps.push(ms);
const W = (list, o = {}) => { naps.length = 0; return waitRun(1234, { fetchState: seq(list), sleep: nap, intervalMs: 10000, ...o }); };

t("runVerdict：沒跑完 wait、成功／略過 ok、其他 fail", () => {
  assert.strictEqual(runVerdict({ status: "in_progress", conclusion: null }), "wait");
  assert.strictEqual(runVerdict({ status: "queued" }), "wait");
  assert.strictEqual(runVerdict(null), "wait");
  assert.strictEqual(runVerdict({ status: "completed", conclusion: "success" }), "ok");
  assert.strictEqual(runVerdict({ status: "completed", conclusion: "skipped" }), "ok");
  assert.strictEqual(runVerdict({ status: "completed", conclusion: "failure" }), "fail");
  assert.strictEqual(runVerdict({ status: "completed", conclusion: "cancelled" }), "fail");
});
t("跑到成功：中間 queued／in_progress 都等，每次間隔 10 秒", () => {
  const r = W([{ status: "queued" }, { status: "in_progress" }, { status: "completed", conclusion: "success" }]);
  assert.strictEqual(r.ok, true); assert.deepStrictEqual(naps, [10000, 10000]); assert.ok(r.url.endsWith("/actions/runs/1234"));
});
t("失敗就是失敗，帶出 conclusion", () => {
  const r = W([{ status: "completed", conclusion: "failure" }]);
  assert.strictEqual(r.ok, false); assert.strictEqual(r.conclusion, "failure"); assert.strictEqual(r.timedOut, false);
});
t("網路短暫錯誤會重試，不當成失敗（PR 627 的情形）", () => {
  const r = W([{ status: "in_progress" }, new Error("connection reset"), new Error("EOF"), { status: "completed", conclusion: "success" }]);
  assert.strictEqual(r.ok, true);
});
t("錯誤中間夾一次成功，連續錯誤數重算", () => {
  const e = new Error("x");
  const r = W([e, e, { status: "in_progress" }, e, e, { status: "completed", conclusion: "success" }], { maxErrors: 3 });
  assert.strictEqual(r.ok, true);
});
t("壹直排隊超過上限就回 stuck（11-17 固定動作排隊卡壹小時）；開始跑了就重算", () => {
  const q = { status: "queued" };
  const r = W([q, q, q, q], { queueMaxMs: 25000 });
  assert.strictEqual(r.stuck, true); assert.strictEqual(r.ok, false);
  const r2 = W([q, q, { status: "in_progress" }, q, { status: "completed", conclusion: "success" }], { queueMaxMs: 25000 });
  assert.strictEqual(r2.ok, true); assert.ok(!r2.stuck);
  const r3 = W([q, q, q, q, { status: "completed", conclusion: "success" }]);
  assert.strictEqual(r3.ok, true, "沒給上限就照舊等");
});
t("連續錯誤到上限才丟錯", () => {
  assert.throws(() => W([new Error("dns")], { maxErrors: 4 }), /連續失敗 4 次/);
  assert.strictEqual(naps.length, 3);
});
t("超過總時間回 timedOut，不是失敗也不是成功", () => {
  const r = W([{ status: "in_progress" }], { maxMs: 30000 });
  assert.strictEqual(r.timedOut, true); assert.strictEqual(r.ok, false); assert.strictEqual(naps.length, 3);
});
console.log(`${n} passed, 0 failed（等 run 跑完：輪詢、重試、逾時）`);
