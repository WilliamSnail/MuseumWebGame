// 不開瀏覽器分頁，把某個畫面照成 PNG（翊文 11-10：「目前有什麼要很多步驟做的可以寫腳本」）
// 原本每次改畫面都要：開分頁、導過去、改視窗大小、截圖、改回來。這支壹次照好幾個寬度。
//   npm run shot -- "http://localhost:5287/#lobby"                       預設照電腦（1366x768）和手機橫拿（812x375）
//   npm run shot -- "http://localhost:5287/#lobby" --size 800x1000,375x812
//   npm run shot -- … --out 某個資料夾                                   預設寫到系統暫存資料夾
// 先把網頁開著（npm run local 或 npm run dev）。印出每張 PNG 的路徑，再用 Read 打開看。
// 只照「打開就看得到」的樣子：要按按鈕、要登入才有的畫面，還是要用瀏覽器走。只准照 localhost。
const fs = require("fs"), path = require("path"), os = require("os");
const { spawnSync } = require("child_process");

const DEFAULT_SIZES = "1366x768,812x375";
function parseSizes(s) {
  return String(s || DEFAULT_SIZES).split(",").map(x => x.trim()).filter(Boolean).map(x => {
    const m = /^(\d{3,4})x(\d{3,4})$/.exec(x);
    if (!m) throw new Error(`大小要寫成 寬x高，例如 812x375（收到「${x}」）`);
    return { w: +m[1], h: +m[2] };
  });
}
function localOnly(url) {
  let u; try { u = new URL(url); } catch { throw new Error(`網址看不懂：${url}`); }
  if (!["localhost", "127.0.0.1"].includes(u.hostname)) throw new Error("只照 localhost 的畫面（正式站不碰）");
  return u.href;
}
function shotName(url, s) {
  const u = new URL(url), tag = (u.hash || u.pathname).replace(/[^\w一-鿿]+/g, "_").replace(/^_+|_+$/g, "") || "page";
  return `shot_${tag}_${s.w}x${s.h}.png`;
}
module.exports = { parseSizes, localOnly, shotName };
if (require.main === module) { try { main(); } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); } }

function main() {
  const args = process.argv.slice(2), val = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const skip = new Set(["--size", "--out", "--wait"].flatMap(k => { const i = args.indexOf(k); return i >= 0 ? [i, i + 1] : []; }));
  const target = args.find((a, i) => !skip.has(i) && !a.startsWith("--"));
  if (!target) throw new Error('用法：npm run shot -- "http://localhost:5287/#lobby" [--size 1366x768,812x375] [--out 資料夾]');
  const url = localOnly(target), sizes = parseSizes(val("--size")), wait = +(val("--wait") || 6000);
  const outDir = path.resolve(val("--out") || path.join(os.tmpdir(), `shot_${Date.now()}`));
  fs.mkdirSync(outDir, { recursive: true });

  const cands = process.platform === "win32"
    ? ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"]
    : ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  const browser = cands.find(c => fs.existsSync(c));
  if (!browser) throw new Error("找不到 Edge／Chrome，這台照不了");

  for (const s of sizes) {
    const png = path.join(outDir, shotName(url, s)), prof = fs.mkdtempSync(path.join(os.tmpdir(), "shot-"));
    const r = spawnSync(browser, ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", `--user-data-dir=${prof}`, `--window-size=${s.w},${s.h}`,
      `--virtual-time-budget=${wait}`, `--screenshot=${png}`, url], { encoding: "utf8", timeout: 90000 });
    // Windows 的 Edge 會先回來、在背景寫檔：等檔案出現、大小不再變（跟 svg_preview.cjs 壹樣）
    const until = Date.now() + 30000; let last = -1;
    while (Date.now() < until) { const n = fs.existsSync(png) ? fs.statSync(png).size : -1; if (n > 0 && n === last) break; last = n; spawnSync(process.execPath, ["-e", "setTimeout(()=>{},500)"]); }
    try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
    if (!fs.existsSync(png)) throw new Error(`${s.w}x${s.h} 沒照到：` + (r.stderr || r.error || "").toString().slice(0, 300));
    console.log(`${s.w}x${s.h}：${png}`);
  }
}
