// 照手機直拿的畫面（tools/shot.cjs 用 --window-size，窄過 500 就照不了）。
// 用無頭的 Edge／Chrome 開網頁，模擬手機（寬 375、觸控），可以先跑壹段 JS（按按鈕、略過「請轉橫」）再照。
// 只准 localhost。用法：
//   node tools/shot_phone.cjs "http://localhost:5287/?x=1#lobby" [--size 375x812] [--wait 6000] [--js "document.querySelector('.tb-menu').click()"] [--out a.png] [--full]
// --js 可以給好幾次，照順序跑，每段之間等 800ms。預設會先在 body 加 orient-skip（略過「請轉橫」）。印出 PNG 路徑。
const fs = require("fs"), path = require("path"), os = require("os");
const { spawn } = require("child_process");

const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const all = k => args.flatMap((a, i) => a === k ? [args[i + 1]] : []);
const url = args.find((a, i) => /^https?:/.test(a) && args[i - 1] !== "--js");
if (!url || !/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) { console.error("用法：node tools/shot_phone.cjs \"http://localhost:5287/?x=1#lobby\"（只准 localhost）"); process.exit(1); }
const [W, H] = val("--size", "375x812").split("x").map(Number);
const WAIT = +val("--wait", 6000), JS = all("--js"), FULL = args.includes("--full");
const out = path.resolve(val("--out", path.join(os.tmpdir(), `phone_${Date.now()}.png`)));
const cands = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"];
const exe = cands.find(c => fs.existsSync(c));
if (!exe) { console.error("找不到 Edge 或 Chrome"); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const port = 9300 + Math.floor(Math.random() * 500);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), "phone_"));
  const br = spawn(exe, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, "--mute-audio", "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
  let list = null;
  for (let i = 0; i < 50 && !list; i++) { await sleep(200); try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch (e) { /* 還沒好 */ } }
  const page = list.find(t => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener("open", r, { once: true }));
  let id = 0; const wait = new Map();
  ws.addEventListener("message", m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } });
  const send = (method, params = {}) => new Promise(r => { id++; wait.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const run = async code => { const r = await send("Runtime.evaluate", { expression: code, awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) console.error("JS 出錯：", r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description); };
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Page.enable");
  await send("Page.navigate", { url });
  await sleep(WAIT);
  await run("document.body.classList.add('orient-skip')");
  for (const code of JS) { await run(code); await sleep(800); }
  await sleep(500);
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: FULL });
  fs.writeFileSync(out, Buffer.from(shot.result.data, "base64"));
  console.log(out);
  ws.close(); br.kill();
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { /* 沒關係 */ }
  process.exit(0);
})().catch(e => { console.error("✗", e.message); process.exit(1); });
