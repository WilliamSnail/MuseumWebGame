// 預告片用的無頭瀏覽器小工具：開 Edge／Chrome（靜音、無頭），用 DevTools 協定操作壹個分頁。
// shots.cjs（照遊戲畫面）和 render.cjs（逐格輸出）共用。只准開 localhost。
const fs = require("fs"), path = require("path"), os = require("os");
const { spawn, cdpClose, guardBrowser } = require("../../dev/child.cjs");

const CANDS = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 開瀏覽器，回傳 { send, run, shot, goto, close }。W×H 是畫面大小（電腦版，不模擬手機）。
async function openBrowser(W, H) {
  const exe = CANDS.find(c => fs.existsSync(c));
  if (!exe) throw new Error("找不到 Edge 或 Chrome");
  const port = 9800 + Math.floor(Math.random() * 400);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), "trailer_br_"));
  const br = spawn(exe, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, "--mute-audio", "--autoplay-policy=no-user-gesture-required", "--no-first-run", "--hide-scrollbars", `--window-size=${W},${H}`, "about:blank"], { stdio: "ignore" });
  const kill = guardBrowser(prof, br); // 不管怎麼結束都關乾淨（11-27）
  let list = null;
  for (let i = 0; i < 60 && !list; i++) { await sleep(200); try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch (e) { /* 還沒好 */ } }
  if (!list) { kill(); throw new Error("瀏覽器沒有起來"); }
  const page = list.find(t => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener("open", r, { once: true }));
  let id = 0; const wait = new Map();
  ws.addEventListener("message", m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } });
  const send = (method, params = {}) => new Promise(r => { id++; wait.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const run = async code => {
    const r = await send("Runtime.evaluate", { expression: code, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error("JS 出錯：" + ((r.result.exceptionDetails.exception || {}).description || r.result.exceptionDetails.text));
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Page.enable");
  const goto = async url => {
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error("只准開 localhost：" + url);
    await send("Page.navigate", { url });
  };
  const shot = async (format = "png") => Buffer.from((await send("Page.captureScreenshot", { format })).result.data, "base64");
  const close = () => { cdpClose(ws); kill(); };
  return { send, run, shot, goto, close };
}

module.exports = { openBrowser, sleep };
