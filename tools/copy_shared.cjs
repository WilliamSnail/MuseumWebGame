// 把 shared/ 複製進 functions/shared/：Cloud Functions 只上傳 functions/ 這個資料夾，規則要跟著帶上去。
// npm run emulators 會先跑；部署前 firebase.json 的 predeploy 也會跑。functions/shared/ 不進 repo（.gitignore）。
// 規則只改 shared/，不要改 functions/shared/（每次都會被蓋掉）。
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const from = path.join(ROOT, "shared"), to = path.join(ROOT, "functions", "shared");
fs.mkdirSync(to, { recursive: true });
let n = 0;
for (const f of fs.readdirSync(from)) {
  if (!f.endsWith(".js")) continue;
  fs.copyFileSync(path.join(from, f), path.join(to, f));
  n++;
}
// 限時活動（決定 0041）：Functions 只拿得到 functions/ 裡的東西，所以把 content/weeks/<週>/week.json 的 events 一起打包進去。
// 每次部署（每週劇情合併就會部署）都重做一次。只放 { start, events }，不放劇情（還沒開放的劇情不能到處送）。
function eventData() {
  const dir = path.join(ROOT, "content", "weeks"), out = {};
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir).sort()) {
    const f = path.join(dir, name, "week.json");
    if (!/^\d{4}-W\d{2}$/.test(name) || !fs.existsSync(f)) continue;
    try { const wk = JSON.parse(fs.readFileSync(f, "utf8")); if (Array.isArray(wk.events) && wk.events.length) out[name] = { start: wk.start, events: wk.events }; } catch (e) { console.error("活動：讀不出來", name, e.message); }
  }
  return out;
}
fs.writeFileSync(path.join(to, "events_data.js"), "// copy_shared.cjs 產生的，不要改。content/weeks/*/week.json 的 events（給 Functions 判斷限時活動）\nexport const EVENT_WEEKS = " + JSON.stringify(eventData()) + ";\n");
// 賭場的每週收藏（決定 0042）：同一個做法。只放每週 week.json 和每天 dN.json 的 casino（storyLibrary 整理過的樣子：{ weeks, fallback }），不放劇情。
// 備用週一定要全部列進去（哪一個備用週輪到這週，是照「備用週有幾個」算的，少一個就會輪錯），沒有 casino 的放空的。
function casinoData() {
  const dir = path.join(ROOT, "content", "weeks"), out = { weeks: {}, fallback: {} };
  if (!fs.existsSync(dir)) return out;
  const pack = d => {
    const wf = path.join(d, "week.json");
    if (!fs.existsSync(wf)) return null;
    const p = { week: {}, days: {} };
    try {
      const wk = JSON.parse(fs.readFileSync(wf, "utf8"));
      if (wk.casino) p.week.casino = wk.casino;
      for (let n = 1; n <= 7; n++) {
        const df = path.join(d, "d" + n + ".json");
        if (fs.existsSync(df)) { const day = JSON.parse(fs.readFileSync(df, "utf8")); if (day.casino) p.days[n] = { casino: day.casino }; }
      }
    } catch (e) { console.error("賭場收藏：讀不出來", d, e.message); }
    return p;
  };
  for (const name of fs.readdirSync(dir).sort()) {
    const d = path.join(dir, name);
    if (/^\d{4}-W\d{2}$/.test(name)) { const p = pack(d); if (p) out.weeks[name] = p; }
    else if (name === "備用") for (const fb of fs.readdirSync(d).sort()) { if (fb === "一天") continue; const p = pack(path.join(d, fb)); if (p) out.fallback[fb] = p; }
  }
  return out;
}
fs.writeFileSync(path.join(to, "casino_week_data.js"), "// copy_shared.cjs 產生的，不要改。content/weeks 裡的 casino（給 Functions 判斷賭場的每週收藏）\nexport const CAS_WEEK_LIB = " + JSON.stringify(casinoData()) + ";\n");
fs.writeFileSync(path.join(to, "README.md"), "這個資料夾是 tools/copy_shared.cjs 從 shared/ 複製來的，不要改這裡，改 shared/。\n");
if (require.main === module) console.log(`複製了 ${n} 個規則檔到 functions/shared/`);
