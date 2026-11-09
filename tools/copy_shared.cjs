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
fs.writeFileSync(path.join(to, "README.md"), "這個資料夾是 tools/copy_shared.cjs 從 shared/ 複製來的，不要改這裡，改 shared/。\n");
if (require.main === module) console.log(`複製了 ${n} 個規則檔到 functions/shared/`);
