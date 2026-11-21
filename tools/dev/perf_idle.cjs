// 量某個畫面「放著不動」時瀏覽器有多忙（翊文 11-11：「修改前後兩個效能差多少?」）。
// 用無頭的 Edge／Chrome（跟 tools/dev/shot.cjs 壹樣找），開網頁、等它畫好，再錄 N 秒的時間軸，數：
//   重畫（Paint）幾次、花幾毫秒；樣式重算、排版幾次；主執行緒忙了幾毫秒（全部的工作加起來）。
// 只准 localhost。用法：
//   node tools/dev/perf_idle.cjs "http://localhost:5287/?x=1#lobby" [--size 1920x1080] [--secs 10] [--wait 8000] [--js "…"] [--top 15] [--after "量完印出的值"]
//   --top N：同時錄 CPU 剖析，列出最吃時間的 N 個函式（檔名:行），找「是誰在空轉」用（11-17 玩家反應手機、電腦會熱）
// 同壹個畫面改前、改後各量壹次比較。數字會隨電腦有差，要在同壹台、同壹個大小比。
const fs = require("fs"), path = require("path"), os = require("os");
const { spawn } = require("./child.cjs");

const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const url = args.find(a => /^https?:/.test(a));
if (!url || !/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) { console.error("用法：node tools/dev/perf_idle.cjs \"http://localhost:5287/?x=1#lobby\"（只准 localhost）"); process.exit(1); }
const [W, H] = val("--size", "1920x1080").split("x").map(Number);
const SECS = +val("--secs", 10), WAIT = +val("--wait", 8000), JS = val("--js", null), AFTER = val("--after", null), TOP = +val("--top", 0);
const cands = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"];
const exe = cands.find(c => fs.existsSync(c));
if (!exe) { console.error("找不到 Edge 或 Chrome"); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const port = 9300 + Math.floor(Math.random() * 500);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), "perf_"));
  const br = spawn(exe, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, `--window-size=${W},${H}`, "--mute-audio", "--no-first-run", "about:blank"], { stdio: "ignore" });
  let list = null;
  for (let i = 0; i < 50 && !list; i++) { await sleep(200); try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch (e) { /* 還沒好 */ } }
  const page = list.find(t => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener("open", r, { once: true }));
  let id = 0; const wait = new Map(), events = []; let done = null;
  ws.addEventListener("message", m => {
    const d = JSON.parse(m.data);
    if (d.id && wait.has(d.id)) { wait.get(d.id)(d.result); wait.delete(d.id); }
    if (d.method === "Tracing.dataCollected") events.push(...d.params.value);
    if (d.method === "Tracing.tracingComplete" && done) done();
  });
  const send = (method, params = {}) => new Promise(r => { id++; wait.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Page.enable");
  await send("Page.navigate", { url });
  await sleep(WAIT);
  if (JS) { await send("Runtime.evaluate", { expression: JS, awaitPromise: true }); await sleep(2000); } // 例如點到某個頁籤，再開始量
  if (TOP) { await send("Profiler.enable"); await send("Profiler.setSamplingInterval", { interval: 500 }); await send("Profiler.start"); }
  await send("Tracing.start", { categories: "devtools.timeline,disabled-by-default-devtools.timeline", transferMode: "ReportEvents" });
  await sleep(SECS * 1000);
  const fin = new Promise(r => { done = r; });
  await send("Tracing.end");
  await fin;
  let cpu = null; if (TOP) cpu = (await send("Profiler.stop")).profile;
  const sum = name => events.filter(e => e.name === name && e.ph === "X").reduce((a, e) => ({ n: a.n + 1, ms: a.ms + (e.dur || 0) / 1000 }), { n: 0, ms: 0 });
  const paint = sum("Paint"), style = sum("UpdateLayoutTree"), layout = sum("Layout"), task = sum("RunTask"), frames = events.filter(e => e.name === "DrawFrame" || e.name === "BeginFrame").length;
  const r = x => Math.round(x * 10) / 10;
  console.log(`${url}  ${W}x${H}  靜置 ${SECS} 秒`);
  console.log(`  重畫（Paint）：${paint.n} 次，${r(paint.ms)} ms`);
  console.log(`  樣式重算：${style.n} 次，${r(style.ms)} ms；排版：${layout.n} 次，${r(layout.ms)} ms`);
  console.log(`  主執行緒工作合計：${r(task.ms)} ms（${task.n} 件）；畫面格數：${frames}`);
  if (cpu) {
    const self = new Map(), dt = cpu.timeDeltas || [], byId = new Map(cpu.nodes.map(n => [n.id, n]));
    (cpu.samples || []).forEach((sid, i) => { const n = byId.get(sid), f = n.callFrame; const k = `${f.functionName || "(匿名)"}  ${(f.url || "").replace(/^.*\/(src|shared)\//, "$1/").split("?")[0]}:${f.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0) / 1000); });
    const tot = [...self.values()].reduce((a, b) => a + b, 0);
    console.log(`  CPU 剖析（自己花的時間，前 ${TOP}）：`);
    [...self.entries()].filter(([k]) => !/^(idle)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, TOP).forEach(([k, ms]) => console.log(`    ${r(ms)} ms  ${k}`));
    console.log(`    （錄到 ${r(tot)} ms，含 idle）`);
  }
  if (AFTER) { const v = await send("Runtime.evaluate", { expression: AFTER, returnByValue: true }); console.log("  --after：", JSON.stringify(v.result && v.result.value)); }
  ws.close(); br.kill();
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { /* 沒關係 */ }
  process.exit(0);
})().catch(e => { console.error("✗", e.message); process.exit(1); });
