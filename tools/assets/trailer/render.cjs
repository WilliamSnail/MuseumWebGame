// 預告片輸出成影片：開壹個小伺服器放 trailer.html、trailer.js 和截圖，無頭瀏覽器逐格畫、送回來，再叫 ffmpeg 合成。
// 照第 3 版的 export_server.js 做，但不用自己開瀏覽器。
//   1. 先照畫面：node tools/assets/trailer/shots.cjs（要開著 dev server）
//   2. node tools/assets/trailer/render.cjs            → docs/素材/預告片/ 的兩支 mp4（原創配樂、素材配樂）
//      --serve：只開伺服器，印網址，自己用瀏覽器看（按播放會出聲）
//      --skip-frames：畫面已經輸出過，只重做配樂和合成
//      --stills 2,13,54：只畫這幾秒的畫面（PNG），看字卡和鏡頭
// 暫存（每格 JPEG、WAV）放系統暫存資料夾的 pepe_trailer，不進 repo。需要 ffmpeg。
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os");
const { spawnSync } = require("../../dev/child.cjs");
const { openBrowser, sleep } = require("./cdp.cjs");
const { mix } = require("./audio_mix.cjs");

const args = process.argv.slice(2);
const HERE = __dirname, TMP = path.join(os.tmpdir(), "pepe_trailer"), SHOTS = path.join(TMP, "shots"), FRAMES = path.join(TMP, "frames");
const OUTDIR = path.join(HERE, "..", "..", "..", "docs", "素材", "預告片");
const PORT = 8767;

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, resp) => {
      const url = new URL(req.url, "http://localhost");
      if (req.method === "POST") {
        const chunks = [];
        req.on("data", c => chunks.push(c));
        req.on("end", () => {
          const buf = Buffer.concat(chunks);
          if (url.pathname === "/audio") fs.writeFileSync(path.join(TMP, "original.wav"), buf);
          else if (url.pathname === "/frame") fs.writeFileSync(path.join(FRAMES, "f" + String(+url.searchParams.get("i")).padStart(4, "0") + ".jpg"), buf);
          resp.writeHead(200); resp.end("ok");
        });
        return;
      }
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "trailer.html";
      const p = rel.startsWith("shots/") ? path.join(SHOTS, rel.slice(6)) : path.join(HERE, rel);
      if (!p.startsWith(HERE) && !p.startsWith(SHOTS)) { resp.writeHead(403); resp.end(); return; }
      fs.readFile(p, (err, data) => {
        if (err) { resp.writeHead(404); resp.end("not found"); return; }
        const type = p.endsWith(".html") ? "text/html; charset=utf-8" : p.endsWith(".js") ? "text/javascript; charset=utf-8" : p.endsWith(".png") ? "image/png" : "application/octet-stream";
        resp.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" }); resp.end(data);
      });
    }).listen(PORT, () => res(srv));
  });
}

function ffmpeg(list) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...list], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("ffmpeg 失敗：" + (r.stderr || "").slice(-1500));
}

(async () => {
  if (!fs.existsSync(path.join(SHOTS, "lobby.png"))) { console.error("先跑 shots.cjs 照畫面"); process.exit(1); }
  fs.mkdirSync(FRAMES, { recursive: true }); fs.mkdirSync(OUTDIR, { recursive: true });
  const srv = await serve();
  if (args.includes("--serve")) { console.log(`http://localhost:${PORT}/trailer.html（Ctrl+C 結束）`); return; }
  const stillsAt = args.includes("--stills") ? args[args.indexOf("--stills") + 1].split(",").map(Number) : null;
  if (stillsAt) { // 只畫幾個秒數看看：--stills 2,12.8,53.8 → 暫存資料夾的 still_秒.png
    const br = await openBrowser(1920, 1080);
    await br.goto(`http://localhost:${PORT}/trailer.html`);
    for (let i = 0; i < 100 && !(await br.run("!!(window.__trailer && window.__trailer.ready)")); i++) await sleep(200);
    await br.run("document.getElementById('play').hidden = true; document.getElementById('info').hidden = true; document.getElementById('fs').hidden = true");
    for (const t of stillsAt) { await br.run(`__trailer.draw(${t})`); const p = path.join(TMP, `still_${t}.png`); fs.writeFileSync(p, await br.shot()); console.log(p); }
    br.close(); srv.close(); process.exit(0);
  }
  if (!args.includes("--skip-frames")) {
    for (const f of fs.readdirSync(FRAMES)) fs.rmSync(path.join(FRAMES, f));
    const br = await openBrowser(1920, 1080);
    await br.goto(`http://localhost:${PORT}/trailer.html`);
    for (let i = 0; i < 100 && !(await br.run("!!(window.__trailer && window.__trailer.ready)")); i++) await sleep(200);
    const N = await br.run("Math.ceil(__trailer.DUR * __trailer.FPS)");
    for (let a = 0; a < N; a += 150) {
      await br.run(`__trailer.exportAll(${a}, ${a + 150}).then(() => 1)`);
      process.stdout.write(`\r畫面 ${Math.min(N, a + 150)}／${N}`);
    }
    const st = await br.run("JSON.stringify(window.__audioStats)");
    console.log("\n原創配樂：", st);
    br.close();
  }
  srv.close();
  const assets = path.join(TMP, "assets.wav");
  mix(assets);
  const video = ["-framerate", "30", "-i", path.join(FRAMES, "f%04d.jpg")];
  const enc = ["-c:v", "libx264", "-preset", "slow", "-crf", "25", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest"];
  for (const [wav, name] of [[path.join(TMP, "original.wav"), "預告片_原創配樂.mp4"], [assets, "預告片_素材配樂.mp4"]]) {
    const out = path.join(OUTDIR, name);
    ffmpeg([...video, "-i", wav, ...enc, out]);
    console.log("wrote", out, (fs.statSync(out).size / 1048576).toFixed(1) + " MB");
  }
  process.exit(0);
})().catch(e => { console.error("✗", e.message); process.exit(1); });
