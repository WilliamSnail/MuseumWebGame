// 畫面版面自動檢查（npm run ui:check，11-20，翊文：「把約束寫進程式碼，不是文件」）。
// 起 dev server，用無頭 Edge／Chrome 打開主要畫面（網址 #畫面 的假資料，自動靜音），各用手機 375×740 和電腦 2140×1440 看：
//   1. 超出視窗的元素：右邊超過視窗寬（或左邊 < 0），而且外面沒有可以橫向捲動／切掉它的容器（只報「源頭」，不報它底下跟著超出的子孫）。頁面本身出現橫向捲軸也報。
//   2. 被切掉的按鈕：可見的寬或高 < 實際的 80%（被 overflow:hidden 的容器切掉、被視窗左右邊切掉）。
//   3. 字被擠成直排：按鈕或標題的字壹行只有 1～1.3 個字（至少 3 個字、至少 3 行）。
// 要登入才看得到的畫面（銀行、餐車、拍賣…）這裡看不到：會在報告裡列出「跳過」，用 docs/操作/本機模擬器實測.md 的方法另外看。
// 改畫面的人上線前一定要跑（AGENTS.md）。還沒放進 npm test 和 CI（要瀏覽器、太慢）。
// 用法：npm run ui:check [-- --screens lobby,today --sizes phone,desktop --url http://localhost:5173 --shots 資料夾 --wait 3500 --js "先在頁面跑的 JS" --json]
//   --url：已經有 dev server 就給網址（會印警告、而且比對它是不是這個資料夾起的，不是就停；不然自己找空的埠起一個，結束時關掉；--port 可指定埠）。--shots：每個畫面存壹張 PNG（看報告的位置用）。
//   有任何一項問題 exit 1；只有「跳過」不算失敗。
const fs = require("fs"), path = require("path"), os = require("os");
const { spawn, cdpClose, guardBrowser } = require("../dev/child.cjs");
const ROOT = path.join(__dirname, "..", "..");

// 畫面清單：id 是網址 # 後面那串（docs/規則/架構.md 第 3 節）。needLogin 的只列出來不測。
const SCREENS = [
  { id: "lobby", name: "大廳" },
  { id: "today", name: "今日特展／任務板" },
  { id: "tasks:full", name: "每日任務（假資料）" },
  { id: "gallery", name: "畫廊" },
  { id: "origin", name: "圖書館" },
  { id: "workshop", name: "手作坊" },
  { id: "fusion2", name: "融合台" },
  { id: "pillow", name: "抱枕" },
  { id: "hall", name: "展廳" },
  { id: "codex", name: "圖鑑" },
  { id: "office", name: "館長室" },
  { id: "office:upgrades", name: "館長室：升級" },
  { id: "cellarrun", name: "地下（B1）" },
  { id: "fight", name: "打怪物" },
  { id: "route", name: "地下地圖選路" },
  { id: "shop", name: "兌換所" },
  { id: "signin", name: "簽到卡" },
  { id: "calendar", name: "簽到日曆" },
  { id: "pass", name: "館友證" },
  { id: "title", name: "標題" },
  // 賭場、銀行要登入：用假伺服器（web/src/core/mock_net.js，網址 #畫面 就會裝，不用登入、不用模擬器），畫面是錄下來的伺服器回應
  { id: "casino", name: "賭場：牌桌（假伺服器）" },
  { id: "casino:餐車", name: "賭場：餐車（假伺服器）" },
  { id: "casino:大禮包", name: "賭場：大禮包（假伺服器）" },
  { id: "casino:我的", name: "賭場：我的（假伺服器）" },
  { id: "bank:財報", name: "銀行：財報（假伺服器）" },
  { id: "bank:金流", name: "銀行：金流（假伺服器）" },
  { id: "bank:股票", name: "銀行：股票（假伺服器）" },
  { id: "bank:存款", name: "銀行：存款（假伺服器）" },
  { id: "bank:借款", name: "銀行：借款（假伺服器）" },
  { id: "bank:館債", name: "銀行：館債（假伺服器）" },
  // 全館投票（決定 0166）：q 是假伺服器的狀態（放在網址 # 前面，docs/操作/本機模擬器實測.md 第 0 節）
  { id: "lobby:vote", q: "mock&vote=open", name: "大廳：全館投票入口（假伺服器）" },
  { id: "today:vote", q: "mock&vote=open", name: "任務板：全館投票入口（假伺服器）" },
  { id: "pass:vote", q: "mock&vote=voted", name: "館友證：寫下的名字（假伺服器）" },
  { id: "vote:before", q: "mock&vote=before", name: "投票：預告（假伺服器）" },
  { id: "vote:open", q: "mock&vote=open", name: "投票：還沒投（假伺服器）" },
  { id: "vote:write", q: "mock&vote=open", name: "投票：寫下名字（假伺服器）" },
  { id: "vote:long", q: "mock&vote=open", name: "投票：名字太長（假伺服器）" },
  { id: "vote:confirm", q: "mock&vote=open", name: "投票：確認框（假伺服器）" },
  { id: "vote:voted", q: "mock&vote=voted", name: "投票：投過、還能改（假伺服器）" },
  { id: "vote:edit", q: "mock&vote=voted", name: "投票：改票（假伺服器）" },
  { id: "vote:editconfirm", q: "mock&vote=voted", name: "投票：改票確認框（假伺服器）" },
  { id: "vote:locked", q: "mock&vote=locked", name: "投票：鎖住（假伺服器）" },
  { id: "vote:counting", q: "mock&vote=counting", name: "投票：等公布（假伺服器）" },
  { id: "vote:result", q: "mock&vote=result", name: "投票：結果（假伺服器）" },
  { id: "vote:history", q: "mock&vote=result", name: "投票：館史（假伺服器）" },
  { id: "vote:history:empty", q: "mock&vote=open", name: "投票：館史空的（假伺服器）" },
  { id: "vote:send", q: "mock&vote=open&votewhy=badName", name: "投票：被擋下來（假伺服器）" },
  { id: "vote:send:net", q: "mock&vote=open&votewhy=net", name: "投票：送出斷線（假伺服器）" },
  { id: "vote:peek:netpeek", q: "mock&vote=open&votewhy=netpeek", name: "投票：連不上（假伺服器）" },
  { id: "vote:write:lowsan", q: "mock&vote=open", name: "投票：理智低（假伺服器）" },
];
// 手機上「最重要」的畫面（翊文 11-22）：能按的東西短邊至少這麼多 px（目標 44，量到 40 以下才報）
const TAP_SCREENS = /^(today|tasks|pass|calendar|vote)/, TAP_MIN = 40;
const SIZES = { phone: { w: 375, h: 740, mobile: true, dpr: 2 }, desktop: { w: 2140, h: 1440, mobile: false, dpr: 1 } };

// ---------- 在頁面裡跑的量測（回傳壹個 JSON） ----------
// 寫成字串是為了丟進 Runtime.evaluate；不能用外面的變數。
const MEASURE = `(() => {
  const vw = window.__W, vh = window.__H, /* 手機模擬時內容壹超出，innerWidth 會跟著變大，所以用我們設定的寬 */ out = { over: [], clipped: [], vertical: [], small: [], hscroll: false, texts: document.body.innerText.length };
  const cs = e => getComputedStyle(e);
  const shown = e => { const s = cs(e); if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const hiddenChain = e => { for (let x = e; x && x !== document.body; x = x.parentElement) { const s = cs(x); if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return true; } return false; };
  const label = e => { const c = typeof e.className === "string" ? e.className.trim().split(/\\s+/).slice(0, 3).join(".") : ""; const t = (e.innerText || e.getAttribute("aria-label") || e.title || "").replace(/\\s+/g, " ").trim().slice(0, 14); return e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (c ? "." + c : "") + (t ? "「" + t + "」" : ""); };
  const clipsX = s => s.overflowX !== "visible", clipsAny = s => s.overflowX !== "visible" || s.overflowY !== "visible";
  // 外面有沒有東西把它「接住」：祖先 overflow 不是 visible，而且祖先自己在視窗裡
  const caught = e => { for (let p = e.parentElement; p && p !== document.documentElement; p = p.parentElement) { const s = cs(p); if (p === document.body) { return false; } if (clipsX(s)) { const r = p.getBoundingClientRect(); if (r.right <= vw + 1 && r.left >= -1) return true; } if (s.position === "fixed") return false; } return false; };
  const all = [...document.body.querySelectorAll("*")].filter(e => !/^(script|style|link|meta|head|svg|path|g|defs|use|circle|rect|ellipse|line|polyline|polygon|filter|fe\\w+|lineargradient|radialgradient|stop|clippath|mask|symbol|animate\\w*|title|desc|tspan|text)$/i.test(e.tagName) && !e.closest("svg"));
  // 1. 超出視窗：只報源頭
  const overflowing = new Set();
  for (const e of all) {
    if (!shown(e) || hiddenChain(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) { if (e.closest("[aria-hidden=true]")) continue; if (!caught(e)) overflowing.add(e); }
  }
  for (const e of overflowing) {
    let childOf = false; for (let p = e.parentElement; p; p = p.parentElement) if (overflowing.has(p)) { childOf = true; break; }
    if (childOf) continue;
    const r = e.getBoundingClientRect(), s = cs(e);
    out.over.push({ el: label(e), right: Math.round(r.right), left: Math.round(r.left), w: Math.round(r.width), fixed: s.position === "fixed" || s.position === "absolute" });
  }
  const se = document.scrollingElement; out.hscroll = se.scrollWidth > vw + 1; out.scrollW = se.scrollWidth;
  // 2. 按鈕被切
  const btns = all.filter(e => e.matches("button, .btn, [role=button], a.btn, input[type=button], input[type=submit]") && shown(e) && !hiddenChain(e) && !e.disabled);
  for (const b of btns) {
    if (b.closest(".l2-hl, [class*=marquee], [class*=ticker]")) continue; // 跑馬燈裡本來就在移動、會被切
    const r = b.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
    let L = r.left, R = r.right, T = r.top, B = r.bottom, xFree = false, yFree = false; // 外面有可以捲的容器，捲過去就看得到，不算被切
    for (let p = b.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const s = cs(p); if (s.overflowX === "visible" && s.overflowY === "visible") { if (s.position === "fixed") break; continue; }
      const pr = p.getBoundingClientRect();
      const scrollX = s.overflowX === "auto" || s.overflowX === "scroll", scrollY = s.overflowY === "auto" || s.overflowY === "scroll";
      if (!xFree) { if (scrollX) xFree = true; else if (s.overflowX !== "visible") { L = Math.max(L, pr.left); R = Math.min(R, pr.right); } }
      if (!yFree) { if (scrollY) yFree = true; else if (s.overflowY !== "visible") { T = Math.max(T, pr.top); B = Math.min(B, pr.bottom); } }
      if (s.position === "fixed") break;
    }
    if (!xFree) { L = Math.max(L, 0); R = Math.min(R, vw); } // 沒有捲動容器：視窗左右也是邊界（上下可以捲，不算）
    const vwid = Math.max(0, R - L), vhei = Math.max(0, B - T);
    if (vwid < r.width * 0.8 || vhei < r.height * 0.8) out.clipped.push({ el: label(b), w: Math.round(r.width), h: Math.round(r.height), vw: Math.round(vwid), vh: Math.round(vhei) });
  }
  // 2b. 點擊面積太小（11-22 翊文：「基本上手機版最重要就是任務板跟館友證」；原則在 docs/規則/介面設計原則.md 第七節）：只在手機看任務板、館友證、簽到日曆（window.__TAP），能按的東西短邊要 ≥ __TAP_MIN px
  const layers = [...document.querySelectorAll(".nb-layer, .mini-layer")], seenTap = new Set(); // 有蓋層（館友證、任務板是視窗）就只量最上面那層，底下的大廳不算；提示小卡（toast）、狀態列不算
  if (window.__TAP) for (const b of btns) {
    const r = b.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
    if (b.closest("[aria-hidden=true], .fx-toast, .status-bar, #status")) continue;
    if (layers.length && !layers[layers.length - 1].contains(b)) continue;
    const key = label(b) + Math.round(r.width) + "x" + Math.round(r.height); if (seenTap.has(key)) continue; seenTap.add(key); // 同樣的只報壹次
    if (Math.min(r.width, r.height) < window.__TAP_MIN) out.small.push({ el: label(b), w: Math.round(r.width), h: Math.round(r.height) });
  }
  // 3. 直排：按鈕、標題壹行只有 1 個字
  const heads = all.filter(e => e.matches("button, .btn, [role=button], h1, h2, h3, h4, h5, h6, [class*=title], [class*=-head], .nb-title, b") && shown(e) && !hiddenChain(e));
  for (const e of heads) {
    // 只看「壹段文字」自己排成幾行（不把圖示、徽章這些旁邊的方塊算進去）：壹段 ≥3 個字、排 ≥3 行、平均壹行 ≤1.3 個字才算直排
    const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let n, bad = null;
    while ((n = w.nextNode())) {
      const chars = [...n.nodeValue.replace(/s+/g, "")].length; if (chars < 3) continue;
      const range = document.createRange(); range.selectNodeContents(n);
      const lines = new Set([...range.getClientRects()].filter(q => q.width > 0 && q.height > 0).map(q => Math.round(q.top / 4))).size;
      if (lines >= 3 && chars / lines <= 1.3) { bad = { chars, lines }; break; }
    }
    if (bad) out.vertical.push({ el: label(e), chars: bad.chars, lines: bad.lines });
  }
  return out;
})()`;

// 關掉第壹次進來跳的說明卡：按每個看得到的「知道了」
const DISMISS = `[...document.querySelectorAll('button')].filter(b => b.offsetParent && /^知道了$/.test(b.innerText.trim())).forEach(b => b.click())`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function findBrowser() {
  const c = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  return c.find(x => fs.existsSync(x));
}
// 找一個沒人在聽的埠（自己問作業系統要）。11-22 美術統籌踩到：預設固定 5499，別的 session 的 dev server 剛好占著，ui:check 連過去量到別人的畫面
function freePort() {
  return new Promise((res, rej) => { const srv = require("net").createServer(); srv.unref(); srv.on("error", rej); srv.listen(0, "127.0.0.1", () => { const p = srv.address().port; srv.close(() => res(p)); }); });
}
// 這個網址上的 dev server 是不是從「這個資料夾」起的：把它回的 main.js 原始碼（?raw）跟這個資料夾的檔案比。回 true／false／null（連不上）
async function serverIsHere(url, root = ROOT) {
  try {
    const r = await fetch(url + "/src/core/main.js?raw");
    if (!r.ok) return false;
    const m = (await r.text()).match(/export default ("(?:[^"\\]|\\.)*")/);
    return !!m && JSON.parse(m[1]) === fs.readFileSync(path.join(root, "web", "src", "core", "main.js"), "utf8");
  } catch (e) { return null; }
}
async function startServer(port) {
  const url = `http://localhost:${port}`;
  const vite = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
  const proc = spawn(process.execPath, [vite, "--port", String(port), "--strictPort", "--host", "localhost"], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 150; i++) {
    await sleep(300);
    if (proc.exitCode !== null) break; // 我們自己起的那個死了（埠被搶走）：不能再連，連到的會是別人的
    try { const r = await fetch(url + "/"); if (r.ok && proc.exitCode === null) { if ((await serverIsHere(url)) !== true) { proc.kill(); throw new Error(`埠 ${port} 回的不是這個資料夾（${ROOT}）的畫面，停下來，免得量到別人的`); } return { url, proc }; } } catch (e) { if (/回的不是這個資料夾/.test(e.message)) throw e; /* 還沒好 */ }
  }
  proc.kill(); throw new Error(`dev server 起不來（port ${port}）`);
}
async function openBrowser() {
  const exe = findBrowser();
  if (!exe) throw new Error("找不到 Edge 或 Chrome");
  const port = 9600 + Math.floor(Math.random() * 300), prof = fs.mkdtempSync(path.join(os.tmpdir(), "uichk_"));
  const br = spawn(exe, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, "--mute-audio", "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
  const kill = guardBrowser(prof, br); // 不管怎麼結束都關乾淨（11-27）
  let list = null;
  for (let i = 0; i < 60 && !list; i++) { await sleep(200); try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch (e) { /* 還沒好 */ } }
  if (!list) { kill(); throw new Error("瀏覽器開不起來"); }
  const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener("open", r, { once: true }));
  let id = 0; const wait = new Map();
  ws.addEventListener("message", m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } });
  const send = (method, params = {}) => new Promise(r => { id++; wait.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async code => { const r = await send("Runtime.evaluate", { expression: code, awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) throw new Error((r.result.exceptionDetails.exception || {}).description || "JS 出錯"); return r.result.result.value; };
  const close = () => { cdpClose(ws); kill(); };
  await send("Page.enable");
  return { send, evaluate, close };
}

async function inspect(B, base, scr, size, opts) {
  const sz = SIZES[size];
  await B.send("Emulation.setDeviceMetricsOverride", { width: sz.w, height: sz.h, deviceScaleFactor: sz.dpr, mobile: sz.mobile });
  await B.send("Emulation.setTouchEmulationEnabled", { enabled: sz.mobile, maxTouchPoints: sz.mobile ? 5 : 0 });
  await B.send("Page.navigate", { url: "about:blank" }); await sleep(150);
  await B.send("Page.navigate", { url: `${base}/?uichk=${Date.now()}${scr.q ? "&" + scr.q : ""}#${encodeURIComponent(scr.id)}` });
  await sleep(opts.wait);
  await B.evaluate("document.body.classList.add('orient-skip')");
  if (/^(casino|bank|pass)/.test(scr.id)) { await B.evaluate(DISMISS); await sleep(600); await B.evaluate(DISMISS); await sleep(300); } // 假伺服器的賭場、銀行：第壹次進來的說明卡（「知道了」）先關掉，不然蓋住畫面量不到
  await sleep(400);
  if (opts.js) { await B.evaluate(opts.js); await sleep(500); } // --js：先跑壹段（測試檢查本身用，或先按開某個分頁）
  await B.evaluate(`window.__W = ${sz.w}; window.__H = ${sz.h}; window.__TAP = ${!!(sz.mobile && TAP_SCREENS.test(scr.id))}; window.__TAP_MIN = ${TAP_MIN};`);
  let m = await B.evaluate(MEASURE);
  for (let t = 0; t < 2 && m.texts < 20; t++) { await sleep(3000); m = await B.evaluate(MEASURE); } // 慢壹點才畫出來的，再等
  const state = await B.evaluate(`({ room: (document.body.dataset && document.body.dataset.room) || "", login: !!document.querySelector(".login, .lg-card, [class*=login]") || /請先登入|需要登入|登入後/.test(document.body.innerText), title: document.title })`);
  if (opts.shots) { const s = await B.send("Page.captureScreenshot", { format: "png" }); fs.mkdirSync(opts.shots, { recursive: true }); fs.writeFileSync(path.join(opts.shots, `${scr.id.replace(/[:/]/g, "_")}_${size}.png`), Buffer.from(s.result.data, "base64")); }
  return { m, state };
}

async function main() {
  const a = process.argv.slice(2), val = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const want = val("--screens", "") ? val("--screens", "").split(",") : null, sizes = (val("--sizes", "phone,desktop")).split(",");
  const opts = { js: val("--js", null), wait: +val("--wait", 3500), shots: val("--shots", null) && path.resolve(val("--shots")), json: a.includes("--json") };
  const picked = SCREENS.filter(s => !want || want.includes(s.id));
  let srv = null, base = val("--url", null);
  if (!base) { srv = await startServer(+val("--port", 0) || await freePort()); base = srv.url; }
  else { // --url：接別人開的 server，量到的畫面不一定是這個資料夾的（11-22）
    console.log(`⚠ 用 --url ${base}：不是自己起的 server，量到的可能是別的資料夾、別的分支的畫面。`);
    const here = await serverIsHere(base);
    if (here === false) { console.log(`✗ 這個 server 回的 main.js 跟這個資料夾（${ROOT}）的不一樣，是別的資料夾起的。不用 --url（讓它自己起）就好。`); process.exit(1); }
    if (here === null) { console.log("✗ --url 連不上"); process.exit(1); }
    console.log("  （main.js 跟這個資料夾的一樣，繼續）");
  }
  const B = await openBrowser();
  const report = [], skipped = [];
  try {
    for (const scr of picked) {
      if (scr.needLogin && !a.includes("--try-login")) { skipped.push(scr); continue; }
      for (const size of sizes) {
        let r;
        try { r = await inspect(B, base, scr, size, opts); } catch (e) { report.push({ scr, size, error: e.message }); continue; }
        report.push({ scr, size, ...r });
        if (!opts.json) process.stdout.write(".");
      }
    }
  } finally { B.close(); if (srv) srv.proc.kill(); }
  if (!opts.json) process.stdout.write("\n");
  const problems = summarize(report);
  if (opts.json) { console.log(JSON.stringify({ report, skipped: skipped.map(s => s.id) }, null, 1)); process.exit(problems.length ? 1 : 0); }
  print(report, skipped, problems);
  process.exit(problems.length ? 1 : 0);
}
function summarize(report) {
  const out = [];
  for (const r of report) {
    if (r.error) { out.push({ r, kind: "錯誤", text: r.error }); continue; }
    for (const x of r.m.over) out.push({ r, kind: "超出視窗", text: `${x.el}：右邊 ${x.right}、左邊 ${x.left}、寬 ${x.w}${x.fixed ? "（固定／絕對位置）" : ""}` });
    if (r.m.hscroll && !r.m.over.length) out.push({ r, kind: "超出視窗", text: `頁面出現橫向捲軸（內容寬 ${r.m.scrollW}）` });
    for (const x of r.m.clipped) out.push({ r, kind: "按鈕被切", text: `${x.el}：實際 ${x.w}×${x.h}，可見 ${x.vw}×${x.vh}` });
    for (const x of r.m.small || []) out.push({ r, kind: "按鈕太小", text: `${x.el}：${x.w}×${x.h}（手機上最重要的畫面，短邊要 ≥ ${TAP_MIN}px）` });
    for (const x of r.m.vertical) out.push({ r, kind: "字變直排", text: `${x.el}：${x.chars} 個字排成 ${x.lines} 行` });
  }
  return out;
}
function print(report, skipped, problems) {
  const by = {};
  for (const p of problems) { const k = `${p.r.scr.id}（${p.r.scr.name}）@${p.r.size}`; (by[k] = by[k] || []).push(p); }
  const empty = report.filter(r => !r.error && r.m.texts < 20);
  console.log(`畫面版面檢查：${report.length} 次（${new Set(report.map(r => r.scr.id)).size} 個畫面）`);
  for (const [k, ps] of Object.entries(by)) { console.log(`\n✗ ${k}`); for (const p of ps) console.log(`   ${p.kind}：${p.text}`); }
  if (empty.length) console.log(`\n⚠ 幾乎沒有字（可能沒打開）：${empty.map(r => r.scr.id + "@" + r.size).join("、")}`);
  const login = report.filter(r => !r.error && r.state.login).map(r => r.scr.id + "@" + r.size);
  if (login.length) console.log(`\n⚠ 畫面上有「登入」字樣（可能被登入擋住，結果不準）：${[...new Set(login)].join("、")}`);
  if (skipped.length) console.log(`\n跳過（要登入）：${skipped.map(s => `${s.id}（${s.name}）`).join("、")}。用 docs/操作/本機模擬器實測.md 的方法另外看。`);
  console.log(problems.length ? `\n${problems.length} 個問題` : "\n沒有發現問題");
}
if (require.main === module) main().catch(e => { console.error("✗", e.message); process.exit(1); });
module.exports = { SCREENS, SIZES, MEASURE, TAP_SCREENS, TAP_MIN, summarize, freePort, serverIsHere, startServer };
