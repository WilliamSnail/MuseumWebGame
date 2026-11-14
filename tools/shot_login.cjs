// 注意：賭場面板的關閉鈕也是 .nb-x（公佈欄也是），所以只在進房間「之前」關公佈欄，進去之後不能再點。
// 登入模擬器裡的某位館友，進某個房間、點某個頁籤，無頭瀏覽器照成 PNG（給「本機看登入後的畫面」用，說明在 docs/本機模擬器實測.md）。
// 先開著 npm run local（網址的連接埠要跟 --port 一樣），而且那位館友要先用 emu:call 建過（見說明）。只准 localhost。
//
//   node tools/shot_login.cjs --url "http://localhost:5393" --user 賭場甲 --room 賭場 --tab 成就 --size 1366x768 --out a.png
//   --room 預設「賭場」（大廳地圖上的房間名：賭場、銀行、我的展廳…），--tab 不給就停在第壹頁，--size 手機直拿用 375x740（會自動略過「請轉橫」）
//   --mode 自由模式（預設；賭場、銀行、大廳都能看）或 新參觀者（要有挑戰存檔，用 qa_seed_save 放）
const { spawnSync } = require("child_process");
const path = require("path"), os = require("os");
const a = process.argv.slice(2), v = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const base = v("--url", "http://localhost:5393"), user = v("--user", null), room = v("--room", "賭場"), tab = v("--tab", ""), mode = v("--mode", "自由模式");
if (!user) { console.error("要 --user 名字（先用 emu:call 建過）"); process.exit(1); }
const out = path.resolve(v("--out", path.join(os.tmpdir(), `login_${Date.now()}.png`)));
const js = `(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));const until=async(f,ms=25000)=>{const t=Date.now();while(Date.now()-t<ms){const x=f();if(x)return x;await sleep(300)}return null};` +
  `const btn=t=>()=>[...document.querySelectorAll('button')].find(b=>b.offsetParent&&b.textContent.trim().startsWith(t));` +
  `(await until(btn(${JSON.stringify(mode)})))?.click();await until(()=>document.querySelector('.l2-room'));await sleep(800);document.querySelector('.nb-x')?.click();` +
  `(([...document.querySelectorAll('.l2-room')].find(e=>e.getAttribute('aria-label').startsWith(${JSON.stringify(room)})))||(document.querySelectorAll('button')&&[...document.querySelectorAll('button')].find(b=>b.offsetParent&&b.textContent.trim().startsWith(${JSON.stringify(room)}))))?.click();await sleep(2500);` +
  (tab ? `(await until(btn(${JSON.stringify(tab)})))?.click();await sleep(1500);` : "") + `})()`;
const r = spawnSync(process.execPath, [path.join(__dirname, "shot_phone.cjs"), `${base}/?user=${encodeURIComponent(user)}`, "--size", v("--size", "1366x768"), "--wait", v("--wait", "6000"), "--js", js, "--out", out], { stdio: "inherit" });
process.exit(r.status || 0);
