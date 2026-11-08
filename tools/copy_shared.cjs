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
fs.writeFileSync(path.join(to, "README.md"), "這個資料夾是 tools/copy_shared.cjs 從 shared/ 複製來的，不要改這裡，改 shared/。\n");
if (require.main === module) console.log(`複製了 ${n} 個規則檔到 functions/shared/`);
