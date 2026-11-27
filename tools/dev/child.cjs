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

// ---------- 無頭瀏覽器關乾淨（11-27，總督查到 24 個沒視窗的 Edge、約 290 個程序、21 GB，都是 ui_check、shot_phone 開了沒關的）----------
// 為什麼 br.kill() 不夠：Windows 上 spawn 出來的 msedge.exe 常把工作交給另壹個 browser 程序後自己先結束，kill 殺到的是已經不在的 PID；
//   出錯時直接 process.exit(1) 的腳本連 kill 都沒跑。所以照 --user-data-dir（每次開的暫存資料夾）找出所有還開著的 Edge／Chrome 程序，壹次關掉，再刪資料夾。
// killBrowserProfile(prof)：同步，可以在 process.on("exit") 裡跑。guardBrowser(prof, br)：開了就叫，回傳 close()；程式不管怎麼結束（正常、丟錯、process.exit）都會關。
const fs = require("fs");
function killBrowserProfile(prof) {
  if (!prof) return;
  const key = String(prof);
  if (process.platform === "win32") {
    const lit = key.split("'").join("''");
    const ps = "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe' OR Name='chrome.exe'\" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('" + lit + "') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
    try { cp.spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], hide({ stdio: "ignore", timeout: 20000 })); } catch (e) { /* 關不到就算了 */ }
  } else {
    try { cp.spawnSync("pkill", ["-f", "--", key], hide({ stdio: "ignore", timeout: 10000 })); } catch (e) { /* 沒有 pkill */ }
  }
  for (let i = 0; i < 3; i++) { try { fs.rmSync(key, { recursive: true, force: true }); break; } catch (e) { /* 還有程序佔著，再試 */ } }
}
function guardBrowser(prof, br) {
  let done = false;
  const close = () => { if (done) return; done = true; try { if (br) br.kill(); } catch (e) { /* 已經結束 */ } killBrowserProfile(prof); };
  process.on("exit", close);
  return close;
}
// CDP 先請瀏覽器自己關（Browser.close），比殺程序乾淨；送不出去也沒關係，後面 killBrowserProfile 會收
function cdpClose(ws) { try { ws.send(JSON.stringify({ id: 999999, method: "Browser.close" })); } catch (e) { /* 已經斷了 */ } try { ws.close(); } catch (e) { /* 已經關了 */ } }

module.exports = {
  killBrowserProfile,
  guardBrowser,
  cdpClose,
  spawn: withArgs(cp.spawn),
  spawnSync: withArgs(cp.spawnSync),
  execFile: withArgs(cp.execFile),
  execFileSync: withArgs(cp.execFileSync),
  exec: noArgs(cp.exec),
  execSync: noArgs(cp.execSync),
  fork: withArgs(cp.fork),
  hide,
};
