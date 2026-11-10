// 把某天（或整週）內容裡的 svg 畫成壹張 PNG，用眼睛看（翊文 11-10：排程回報「兩幅新畫沒有用眼睛看過」）
//   npm run svg -- content/weeks/2026-W46/d2.json        壹天
//   npm run svg -- content/weeks/2026-W46                整週（每個 dN.json）
//   npm run svg -- … --out 某處.png                      預設寫到系統暫存資料夾
// 找得到 Edge／Chrome／Chromium 就用無頭模式截圖，印出 PNG 路徑（再用 Read 打開看）；找不到就只印 HTML 路徑。
// 畫是白底 360×450，太暗看不到的東西（例如深色地上的深色腳印）在這裡就看得出來。
const fs = require("fs"), path = require("path"), os = require("os");
const { spawnSync } = require("child_process");

function collectSvgs(targets) {
  const files = [];
  for (const t of targets) {
    const p = path.resolve(t);
    if (fs.statSync(p).isDirectory()) fs.readdirSync(p).filter(f => /^d\d+\.json$/.test(f)).sort().forEach(f => files.push(path.join(p, f)));
    else files.push(p);
  }
  const found = [];
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(f, "utf8"));
    (function walk(o, p) {
      if (Array.isArray(o)) return o.forEach((x, i) => walk(x, `${p}[${i}]`));
      if (!o || typeof o !== "object") return;
      if (o.svg) found.push({ where: `${path.basename(f)} ${p}`, title: o.title || o.name || o.id || "", svg: [].concat(o.svg).join("") });
      for (const k of Object.keys(o)) if (k !== "svg") walk(o[k], `${p}.${k}`);
    })(d, "");
  }
  return found;
}
module.exports = { collectSvgs };
if (require.main === module) main();

function main() {
const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outPng = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : path.join(os.tmpdir(), `svg_preview_${Date.now()}.png`);
const targets = args.filter((a, i) => !a.startsWith("--") && !(outIdx >= 0 && i === outIdx + 1));
if (!targets.length) { console.error("用法：npm run svg -- content/weeks/2026-W46/d2.json（或整週的資料夾）"); process.exit(1); }

const found = collectSvgs(targets);
if (!found.length) { console.log("這些檔裡沒有 svg"); return; }

const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const cols = Math.min(found.length, 3), rows = Math.ceil(found.length / cols);
let html = `<html><body style="margin:0;padding:8px;background:#222;color:#eee;font:14px sans-serif;display:grid;grid-template-columns:repeat(${cols},372px);gap:8px">`;
for (const x of found) {
  html += `<div><div style="height:36px;overflow:hidden">${esc(x.where)}<br><b>${esc(x.title)}</b></div><div style="width:360px;height:450px;background:#fff">${x.svg.replace("<svg ", '<svg width="360" height="450" ')}</div></div>`;
}
html += "</body></html>";
const htmlPath = outPng.replace(/\.png$/i, "") + ".html";
fs.writeFileSync(htmlPath, html);

const cands = process.platform === "win32"
  ? ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"]
  : ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
const browser = cands.find(c => fs.existsSync(c));
if (!browser) { console.log(`找不到 Edge／Chrome，只寫了 HTML：${htmlPath}`); process.exit(0); }

const prof = fs.mkdtempSync(path.join(os.tmpdir(), "svgprev-"));
const w = 16 + cols * 380, h = 16 + rows * 500;
const r = spawnSync(browser, ["--headless=new", "--disable-gpu", "--no-sandbox", `--user-data-dir=${prof}`, `--window-size=${w},${h}`,
  `--screenshot=${outPng}`, "file:///" + htmlPath.replace(/\\/g, "/")], { encoding: "utf8", timeout: 60000 });
// Windows 的 Edge 會先回來、在背景寫檔：等檔案出現、大小不再變
const until = Date.now() + 30000; let last = -1;
while (Date.now() < until) { const n = fs.existsSync(outPng) ? fs.statSync(outPng).size : -1; if (n > 0 && n === last) break; last = n; spawnSync(process.execPath, ["-e", "setTimeout(()=>{},500)"]); }
try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
if (!fs.existsSync(outPng)) { console.error("截圖失敗：" + (r.stderr || r.error || "").toString().slice(0, 300)); console.log(`HTML：${htmlPath}`); process.exit(1); }
console.log(`${found.length} 幅：${found.map(x => x.title).join("、")}`);
console.log(`PNG：${outPng}`);
}
