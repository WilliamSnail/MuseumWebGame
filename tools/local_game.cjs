// 開本機測試環境，一個指令走完（翊文 11-09：「有各種需要腳本加速，讓AI不用太多一步步做的地方都可以寫來重複利用」）
//   開模擬器 → 等它好 → 放規則 → 開網頁 → 印出網址。只連 127.0.0.1，碰不到正式的 Firebase。
//
//   npm run local -- --set 8 --port 5288     開（要放背景跑；預設第 8 套、5288）
//   npm run local -- --set 8 --stop          關掉這套（只關這支開的，不動別的模擬器）
//   npm run local -- --event-now double11    順便把這場活動暫時移到 90 秒後開始（改 week.json，測完 git checkout 還原，不要 commit）
//
// 網址 ?user=小明 就是登入小明；開第二個分頁 ?user=小華 就是兩個人。
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const SET = Number(arg("set", 8)), PORT = Number(arg("port", 5288));
const PID_FILE = path.join(os.tmpdir(), `pepe-local-game-${SET}.json`);
const rtdbPort = set => 9100 + 1000 * set;
const fnPort = set => 5101 + 1000 * set;
// 模擬器的連接埠開了，Functions 不壹定載入完了（這時叫會 404）：等 join 不再是 404 才算好
const fnReady = port => new Promise(res => {
  const q = http.get({ host: "127.0.0.1", port, path: "/demo-pepe4/asia-east1/join", timeout: 3000 }, r => { r.resume(); res(r.statusCode !== 404); });
  q.on("error", () => res(false));
  q.on("timeout", () => { q.destroy(); res(false); });
});
async function waitFn(port, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fnReady(port)) return true; await new Promise(r => setTimeout(r, 1500)); }
  return false;
}

// 把某一場活動改成 ms 這個時間過 90 秒開始、開 1 小時（純函式，測試用）。回傳新的 week 物件；找不到回 null
function moveEventNow(week, id, ms) {
  const list = Array.isArray(week.events) ? week.events : [], i = list.findIndex(e => e && e.id === id);
  if (i < 0) return null;
  const tw = t => new Date(t + 8 * 3600e3).toISOString();
  const start = ms + 90e3, day = tw(start).slice(0, 10), hm = t => tw(t).slice(11, 16);
  const events = list.slice();
  events[i] = Object.assign({}, list[i], { date: day, from: hm(start), to: hm(start + 3600e3) });
  return Object.assign({}, week, { events });
}
function eventNow(id) {
  const dir = path.join(ROOT, "content", "weeks");
  for (const w of fs.readdirSync(dir).filter(n => /^\d{4}-W\d{2}$/.test(n)).sort().reverse()) {
    const f = path.join(dir, w, "week.json"), next = moveEventNow(JSON.parse(fs.readFileSync(f, "utf8")), id, Date.now());
    if (next) {
      fs.writeFileSync(f, JSON.stringify(next, null, 2));
      const ev = next.events.find(e => e.id === id);
      console.log(`活動 ${id} 暫時移到 ${ev.date} ${ev.from}～${ev.to}。測完要還原：git checkout -- content/weeks/${w}/week.json`);
      return;
    }
  }
  throw new Error(`找不到活動 ${id}`);
}
const portUp = (port, host = "127.0.0.1") => new Promise(res => {
  const q = http.get({ host, port, path: "/", timeout: 1500 }, r => { r.resume(); res(true); });
  q.on("error", () => res(false));
  q.on("timeout", () => { q.destroy(); res(false); });
});
async function waitPort(port, ms, host) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await portUp(port, host)) return true; await new Promise(r => setTimeout(r, 1500)); }
  return false;
}
function killTree(pid) {
  if (process.platform === "win32") spawnSync("taskkill", ["/T", "/F", "/PID", String(pid)], { stdio: "ignore" });
  else { try { process.kill(-pid); } catch (e) { /* 已經關了 */ } }
}
function stop() {
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(PID_FILE, "utf8")); } catch (e) { console.log(`第 ${SET} 套沒有記錄，沒有東西要關。`); return; }
  saved.pids.forEach(killTree);
  // 記下來的是外面那層 shell，裡面的程式可能還活著：照這套的設定檔、這個連接埠找出來再關壹次（netstat 在這裡看不全）
  if (process.platform === "win32") {
    const ps = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*firebase.emu${SET}.json*' -or $_.CommandLine -like '*vite*--port ${saved.port || PORT} --strictPort*' } | ForEach-Object { $_.ProcessId }`;
    spawnSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" }).stdout.split(/\s+/).filter(Boolean).filter(p => Number(p) !== process.pid).forEach(killTree);
  }

  console.log(`第 ${SET} 套關了。`);
}
async function start() {
  if (fs.existsSync(PID_FILE)) { console.log(`第 ${SET} 套好像開著，先關：npm run local -- --set ${SET} --stop`); }
  // 舊的還開著就停：不然新的開不起來，測到的會是別的分支的程式
  if (await portUp(rtdbPort(SET)) || await portUp(PORT, "localhost")) throw new Error(`連接埠已經有人在用（第 ${SET} 套或 ${PORT}），測到的會是別的分支：先關掉`);
  const opts = { cwd: ROOT, shell: true, stdio: "ignore", detached: process.platform !== "win32", windowsHide: true };
  const emu = spawn("npm", ["run", "emulators"], Object.assign({}, opts, { env: Object.assign({}, process.env, { EMU_SET: String(SET) }) }));
  if (!(await waitPort(rtdbPort(SET), 180000))) { killTree(emu.pid); throw new Error("模擬器三分鐘內沒開起來"); }
  const rules = spawnSync(process.execPath, ["tools/emu_rules.cjs"], { cwd: ROOT, encoding: "utf8", env: Object.assign({}, process.env, { EMU_SET: String(SET) }) });
  console.log((rules.stdout + rules.stderr).trim());
  const web = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], Object.assign({}, opts, { env: Object.assign({}, process.env, { VITE_EMU_SET: String(SET) }) }));
  fs.writeFileSync(PID_FILE, JSON.stringify({ pids: [emu.pid, web.pid], port: PORT }));
  if (!(await waitPort(PORT, 60000, "localhost"))) throw new Error("網頁一分鐘內沒開起來");
  if (!(await waitFn(fnPort(SET), 120000))) throw new Error("Functions 兩分鐘內沒載入好：先看 functions 有沒有語法錯誤");
  console.log(`好了：http://localhost:${PORT}/?user=小明`);
  emu.unref(); web.unref();
}

async function main() {
  if (process.argv.includes("--stop")) return stop();
  if (arg("event-now")) eventNow(arg("event-now"));
  await start();
}
if (require.main === module) main().then(() => process.exit(0), e => { console.error(e.message); process.exit(1); });
module.exports = { moveEventNow, rtdbPort, fnPort };
