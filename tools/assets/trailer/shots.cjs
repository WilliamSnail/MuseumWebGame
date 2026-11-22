// 預告片的畫面：用無頭瀏覽器開遊戲（`#畫面` 假收藏；賭場、銀行走假伺服器），照成 1920×1080 的 PNG。
//   先開 dev server：npx vite --port 5391 --strictPort（放背景）
//   node tools/assets/trailer/shots.cjs [--port 5391] [--only lobby,casino] [--out 資料夾]
// 照片放系統暫存資料夾的 pepe_trailer/shots（不進 repo；render.cjs 從那裡讀）。要照哪些、怎麼點，寫在 shot_list.cjs。
const fs = require("fs"), path = require("path"), os = require("os");
const { openBrowser, sleep } = require("./cdp.cjs");
const { SHOTS, W, H } = require("./shot_list.cjs");

const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = +val("--port", 5391);
const OUT = path.resolve(val("--out", path.join(os.tmpdir(), "pepe_trailer", "shots")));
const ONLY = val("--only", "") ? val("--only").split(",") : null;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const list = SHOTS.filter(s => !ONLY || ONLY.includes(s.id));
  for (const s of list) {
    const br = await openBrowser(W, H);
    try {
      await br.goto(`http://localhost:${PORT}/${s.query || ""}#${s.hash}`);
      await sleep(s.wait || 5000);
      await br.run("document.body.classList.add('orient-skip'); document.querySelectorAll('.inv-stack,.fx-toast,.toast').forEach(e => e.remove())");
      for (const code of s.js || []) { await br.run(code); await sleep(s.step || 900); }
      await br.run("document.querySelectorAll('.inv-stack,.fx-toast,.toast').forEach(e => e.remove())");
      await sleep(600);
      fs.writeFileSync(path.join(OUT, s.id + ".png"), await br.shot());
      console.log("✓", s.id);
    } catch (e) { console.error("✗", s.id, e.message); }
    br.close();
  }
  console.log("照片在", OUT);
  process.exit(0);
})();
