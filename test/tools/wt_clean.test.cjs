// 清工作副本（tools/dev/wt_clean.cjs）：刪 worktree 前先停它的 git 監看、把 repo 的 core.fsmonitor 設成 false（11-21：殘留 60 個 fsmonitor--daemon）
const assert = require("assert"), fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "..", "tools", "dev", "wt_clean.cjs"), "utf8");
assert.ok(/\["fsmonitor--daemon", "stop"\]/.test(src), "刪 worktree 前要先 fsmonitor--daemon stop");
assert.ok(src.indexOf('"fsmonitor--daemon", "stop"') < src.indexOf('"worktree", "remove"'), "先停監看再刪");
assert.ok(/"config", "--local", "core\.fsmonitor", "false"/.test(src), "--do 時把 core.fsmonitor 設成 false");
const { plan, SESSION } = require("../../tools/dev/wt_clean.cjs");
assert.strictEqual(typeof plan, "function"); assert.ok(SESSION.test("wizardly-goldwasser-527b04"));
console.log("清工作副本的測試都過了");
