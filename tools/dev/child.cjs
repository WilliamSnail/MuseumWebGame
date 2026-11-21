// 開外部程式（git、gh、npm、firebase、node…）一律從這裡開，不要直接 require("child_process")（npm test 會擋：tools/check/code_rules.cjs 第 7 項）。
// 為什麼（翊文 11-21：「為什麼我的 Windows CMD 視窗會跳出來一下再不見」）：
//   Claude Code、排程這類在背景跑、沒有自己視窗的程式，叫起 git、npm 這種命令列程式時，Windows 會替每個子程式開一個新的主控台視窗，跑完就關，看起來就是一直閃。
//   Node 的 child_process 要傳 windowsHide: true 才不開視窗；這裡把它變成預設（呼叫的人自己寫 windowsHide: false 還是可以蓋掉）。
// 用法跟 child_process 一樣：const { spawnSync, execSync } = require("../dev/child.cjs");
const cp = require("child_process");

const hide = o => Object.assign({ windowsHide: true }, o || {});
// 第二個參數可以是陣列（args）或選項：照 child_process 的規矩判斷
const withArgs = fn => (cmd, args, opts, ...rest) => (Array.isArray(args) ? fn(cmd, args, hide(opts), ...rest) : typeof args === "function" ? fn(cmd, hide(), args) : fn(cmd, hide(args), opts, ...rest));
const noArgs = fn => (cmd, opts, ...rest) => (typeof opts === "function" ? fn(cmd, hide(), opts) : fn(cmd, hide(opts), ...rest));

module.exports = {
  spawn: withArgs(cp.spawn),
  spawnSync: withArgs(cp.spawnSync),
  execFile: withArgs(cp.execFile),
  execFileSync: withArgs(cp.execFileSync),
  exec: noArgs(cp.exec),
  execSync: noArgs(cp.execSync),
  fork: withArgs(cp.fork),
  hide,
};
