// 加一個 Pixabay 音效：壓縮、登記、備份原檔，一個指令做完（翊文 11-16：「這幾天都是手動做的」）
//
//   npm run sfx:add -- "<下載的 mp3 路徑>" --id <英文id> --use "用在哪" [--loop] [--trim 起:迄秒] [--fadeout 秒]
//                      [--lufs -24] [--kbps 80] [--stereo] [--url <Pixabay 網址>] [--name "原名"] [--by 作者] [--dry]
//
// 做的事：
//   1. 檔名照 Pixabay 下載的格式「作者-標題-編號.mp3」，自動拆出作者、編號、標題 slug。
//      沒給 --url 就試著上 https://pixabay.com/sound-effects/<slug>-<編號>/（不行再試 /music/），跟著轉址拿到網址，
//      從 <title>（「原名 by 作者 | Royalty-free …」）拿原名和作者；抓不到就要你手動給 --url／--name／--by（不亂猜）。
//   2. 用 ffmpeg（PATH 裡的）壓縮成 web/public/sfx/<id>.mp3：
//        一般：單聲道 80 kbps、loudnorm I=-20 TP=-2
//        --loop：照 --trim 截一段，頭尾 3 秒交叉淡化，可以接起來循環；64 kbps、I=-28
//        --trim 起:迄  只留這一段（秒；只給「:迄」就是從頭）；--fadeout N 最後 N 秒淡出
//        --stereo 保留雙聲道；--lufs、--kbps 自己指定；超過 800 KB 會警告（test/sfx_files.test.cjs 會擋）
//   3. 在 shared/sfx_files.js 和 web/public/sfx/來源.md 各加一列（id 重複就報錯）。
//   4. 原檔先複製到 .claude/交接/音效/原檔/（桌面的檔會被移走）。
//   5. 印出接下來要做的：在哪裡呼叫、跑 npm run fx:report。
const fs = require("fs"), path = require("path"), cp = require("child_process");

const ROOT = path.join(__dirname, "..");
const SFX_JS = path.join(ROOT, "shared", "sfx_files.js");
const SRC_MD = path.join(ROOT, "web", "public", "sfx", "來源.md");
const OUT_DIR = path.join(ROOT, "web", "public", "sfx");
const MAX_KB = 800;

// ---------- 解析（test/sfx_add.test.cjs 會測） ----------
// 「作者-標題-編號.mp3」→ { author, slug（標題的 slug，不含編號）, num, full（標題-編號） }；對不上格式回 null
function parsePixabayFilename(file) {
  const base = path.basename(String(file)).replace(/\.mp3$/i, "");
  const m = base.match(/^([^-]+)-(.+)-(\d+)$/);
  if (!m) return null;
  return { author: m[1], slug: m[2], num: m[3], full: m[2] + "-" + m[3] };
}
const decodeHtml = s => String(s).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#x27;/g, "'").replace(/&nbsp;/g, " ");
// <title>Casino Ambiance by freesound_community | Royalty-free …</title> → { name, by }；不是這個格式回 null
function parsePixabayTitle(html) {
  const t = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!t) return null;
  const s = decodeHtml(t[1]).replace(/\s+/g, " ").trim();
  const m = s.match(/^(.+) by ([^|]+?)\s*\|/);
  if (!m) return null;
  return { name: m[1].trim(), by: m[2].trim() };
}
// "10:80" → { a: 10, b: 80 }；":26" → { a: 0, b: 26 }；"12:" → { a: 12, b: null }
function parseTrim(s) {
  if (s === undefined || s === null || s === true) return null;
  const m = String(s).match(/^\s*(\d+(?:\.\d+)?)?\s*:\s*(\d+(?:\.\d+)?)?\s*$/);
  if (!m || (m[1] === undefined && m[2] === undefined)) throw new Error("--trim 要寫成 起:迄（秒），例如 0:26 或 10:80");
  return { a: m[1] === undefined ? 0 : +m[1], b: m[2] === undefined ? null : +m[2] };
}
const n1 = x => String(Math.round(x * 10) / 10);
// 登記用的原名：後面加「（截…）」「（做成循環）」「（最後 N 秒淡出）」
function nameWithNote(name, o) {
  const parts = [];
  const tr = o.trim && o.trim.b !== null ? (o.trim.a === 0 ? `截前 ${n1(o.trim.b)} 秒` : `截 ${n1(o.trim.a)}～${n1(o.trim.b)} 秒`) : o.trim && o.trim.a ? `從第 ${n1(o.trim.a)} 秒開始` : "";
  if (o.loop) parts.push(tr ? tr.replace(/^截前 /, "截前 ") + "做成循環" : "做成循環");
  else if (tr) parts.push(tr);
  if (o.fadeout) parts.push(`最後 ${n1(o.fadeout)} 秒淡出`);
  return parts.length ? `${name}（${parts.join("，")}）` : name;
}
// 加到 shared/sfx_files.js 的 SFX_FILES 最後面；回傳新的檔案內容。id 重複就丟錯
function addToSfxFiles(text, e) {
  const re = new RegExp('^\\s*"' + e.id.replace(/[-]/g, "\\-") + '":', "m");
  if (re.test(text)) throw new Error(`id「${e.id}」已經在 shared/sfx_files.js 裡了`);
  const row = `  ${JSON.stringify(e.id)}: { name: ${JSON.stringify(e.name)}, by: ${JSON.stringify(e.by)}, url: ${JSON.stringify(e.url)},${e.loop ? " loop: true," : ""} use: ${JSON.stringify(e.use)} },\n`;
  const end = text.indexOf("\n};\nexport const SFX_LICENSE");
  if (end < 0) throw new Error("shared/sfx_files.js 的格式變了（找不到 SFX_FILES 結尾），tools/sfx_add.cjs 要跟著改");
  return text.slice(0, end + 1) + row + text.slice(end + 1);
}
// 加到 來源.md 表格最後一列後面
function addToSourceMd(text, e) {
  if (text.includes("| " + e.id + ".mp3 |")) throw new Error(`id「${e.id}」已經在 來源.md 裡了`);
  const row = `| ${e.id}.mp3 | ${e.name} | ${e.by} | ${e.url} | ${e.use} |`;
  const lines = text.replace(/\s+$/, "").split("\n");
  let last = -1; lines.forEach((l, i) => { if (/^\| .+\.mp3 \|/.test(l)) last = i; });
  if (last < 0) throw new Error("來源.md 找不到表格");
  lines.splice(last + 1, 0, row);
  return lines.join("\n") + "\n";
}
// ffmpeg 的濾鏡字串（單元測試只看字串，不跑 ffmpeg）。dur＝原檔秒數
function buildFilter(o, dur) {
  const a = o.trim ? o.trim.a : 0, b = o.trim && o.trim.b !== null ? Math.min(o.trim.b, dur) : dur;
  const len = b - a;
  const norm = `loudnorm=I=${o.lufs}:TP=-2:LRA=11`;
  const mono = o.stereo ? "" : "aformat=channel_layouts=mono,";
  const cut = `atrim=start=${a}:end=${b},asetpts=PTS-STARTPTS`;
  if (o.loop) {
    const X = Math.min(3, len / 3);
    if (len < 4) throw new Error("做循環的段落至少要 4 秒（現在 " + n1(len) + " 秒）");
    // 兩個輸入（同一個檔）：[0] 取前面 len-X 秒當本體、[1] 取最後 X 秒放到最前面，兩段交叉淡化 → 檔尾接回檔頭沒有接縫
    return `[0:a]${mono}atrim=start=${a}:end=${n1(a + len - X)},asetpts=PTS-STARTPTS[bd];[1:a]${mono}atrim=start=${n1(a + len - X)}:end=${b},asetpts=PTS-STARTPTS[t];[t][bd]acrossfade=d=${X}:c1=tri:c2=tri,${norm}[o]`;
  }
  const fo = o.fadeout ? `,afade=t=out:st=${n1(Math.max(0, len - o.fadeout))}:d=${n1(o.fadeout)}` : "";
  return `[0:a]${mono}${cut}${fo},${norm}[o]`;
}

// ---------- 抓 Pixabay ----------
async function lookupPixabay(p) {
  for (const kind of ["sound-effects", "music"]) {
    const u = `https://pixabay.com/${kind}/${p.full}/`;
    try {
      const r = await fetch(u, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (compatible; museum-sfx-add)", accept: "text/html" } });
      if (!r.ok) continue;
      const html = await r.text(), t = parsePixabayTitle(html);
      if (!t || !r.url.includes(p.num)) continue;
      return { url: r.url.split("?")[0], name: t.name, by: t.by };
    } catch (e) { /* 試下一個 */ }
  }
  return null;
}

// ---------- ffmpeg ----------
function ffmpegBin() {
  const r = cp.spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  if (r.error || r.status !== 0) throw new Error("找不到 ffmpeg（要在 PATH 裡）");
  return "ffmpeg";
}
function probeDuration(file) {
  const r = cp.spawnSync("ffmpeg", ["-hide_banner", "-i", file], { encoding: "utf8" });
  const m = (r.stderr || "").match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) throw new Error("讀不到秒數：" + file);
  return +m[1] * 3600 + +m[2] * 60 + +m[3];
}
function repoMain() { // 備份放主資料夾的 .claude（worktree 收掉原檔才不會跟著不見）
  const r = cp.spawnSync("git", ["rev-parse", "--git-common-dir"], { cwd: ROOT, encoding: "utf8" });
  const g = r.status === 0 ? path.resolve(ROOT, r.stdout.trim()) : "";
  return g && path.basename(g) === ".git" ? path.dirname(g) : ROOT;
}

function parseArgs(argv) {
  const o = { _: [] }, flags = new Set(["loop", "stereo", "dry"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) { const k = a.slice(2); if (flags.has(k)) o[k] = true; else { if (i + 1 >= argv.length) throw new Error("--" + k + " 後面要有值"); o[k] = argv[++i]; } }
    else o._.push(a);
  }
  return o;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const file = a._[0];
  if (!file || !a.id || !a.use) { console.error('用法：npm run sfx:add -- "<mp3 路徑>" --id <英文id> --use "用在哪" [--loop] [--trim 起:迄] [--fadeout 秒] [--lufs -24] [--kbps 80] [--stereo] [--url …] [--name …] [--by …]'); process.exit(2); }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.id)) throw new Error("--id 只能用小寫英文、數字、連字號");
  if (!fs.existsSync(file)) throw new Error("找不到檔案：" + file);
  // id 先檢查（早點失敗）
  addToSfxFiles(fs.readFileSync(SFX_JS, "utf8"), { id: a.id, name: "x", by: "x", url: "x", use: "x" });
  addToSourceMd(fs.readFileSync(SRC_MD, "utf8"), { id: a.id, name: "x", by: "x", url: "x", use: "x" });

  // 來源資訊
  const p = parsePixabayFilename(file);
  let url = a.url, name = a.name, by = a.by;
  if (!url || !name || !by) {
    const got = p ? await lookupPixabay(p) : null;
    if (got) { url = url || got.url; name = name || got.name; by = by || got.by; console.log(`Pixabay：${got.name} by ${got.by}\n  ${got.url}`); }
  }
  const miss = [!url && "--url", !name && "--name", !by && "--by"].filter(Boolean);
  if (miss.length) throw new Error("抓不到 Pixabay 的資料（或檔名不是「作者-標題-編號.mp3」），請手動給：" + miss.join("、") + "（網址在 Pixabay 那個音效的頁面）");
  if (!/^https:\/\/pixabay\.com\/(sound-effects|music)\//.test(url)) throw new Error("--url 要是 https://pixabay.com/sound-effects/… 或 /music/…");

  // 壓縮
  ffmpegBin();
  const loop = !!a.loop, trim = parseTrim(a.trim), fadeout = a.fadeout ? +a.fadeout : 0;
  const opt = { loop, trim, fadeout, stereo: !!a.stereo, lufs: a.lufs !== undefined ? +a.lufs : loop ? -28 : -20 };
  const kbps = a.kbps ? +a.kbps : loop ? 64 : 80;
  const dur = probeDuration(file), filter = buildFilter(opt, dur);
  const out = path.join(OUT_DIR, a.id + ".mp3");
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-i", file, ...(loop ? ["-i", file] : []), "-filter_complex", filter, "-map", "[o]", ...(opt.stereo ? [] : ["-ac", "1"]), "-c:a", "libmp3lame", "-b:a", kbps + "k", out];
  if (a.dry) { console.log("ffmpeg " + args.map(x => (/\s|\[/.test(x) ? JSON.stringify(x) : x)).join(" ")); return; }
  const r = cp.spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error("ffmpeg 失敗：" + (r.stderr || "").slice(-400));
  const kb = Math.round(fs.statSync(out).size / 1024), outDur = probeDuration(out);
  if (kb > MAX_KB) console.warn(`警告：${a.id}.mp3 有 ${kb} KB，超過 ${MAX_KB} KB，test/sfx_files.test.cjs 會擋；請加 --trim 截短或 --kbps 降低`);

  // 備份原檔
  const bak = path.join(repoMain(), ".claude", "交接", "音效", "原檔");
  fs.mkdirSync(bak, { recursive: true });
  const bakFile = path.join(bak, path.basename(file));
  if (!fs.existsSync(bakFile)) fs.copyFileSync(file, bakFile);

  // 登記
  const e = { id: a.id, name: nameWithNote(name, opt), by, url, loop, use: a.use };
  fs.writeFileSync(SFX_JS, addToSfxFiles(fs.readFileSync(SFX_JS, "utf8"), e));
  fs.writeFileSync(SRC_MD, addToSourceMd(fs.readFileSync(SRC_MD, "utf8"), e));

  console.log(`\n做好了：web/public/sfx/${a.id}.mp3（${kb} KB，${n1(outDur)} 秒，${opt.stereo ? "雙" : "單"}聲道 ${kbps} kbps）\n登記：shared/sfx_files.js、web/public/sfx/來源.md\n原檔備份：${bakFile}\n`);
  console.log("接下來：");
  console.log(loop
    ? `  1. 環境音：在 web/src/fx.js 的 AMB.<房間> 裡加  fileLoop(c, g, '${a.id}', 音量).n（記得放進 nodes）`
    : `  1. 畫面音效：在 web/src/ui_*.js 呼叫  sndFile("${a.id}", 音量)；環境音裡偶爾播：fileOnce(c, g, '${a.id}', 音量)`);
  console.log("  2. npm run fx:report   （更新 docs/音效與特效總表.md，會把這個新音效列進去）");
  console.log("  3. npm test            （test/sfx_files.test.cjs 會檢查三邊對得上）");
}

module.exports = { parsePixabayFilename, parsePixabayTitle, parseTrim, nameWithNote, addToSfxFiles, addToSourceMd, buildFilter };
if (require.main === module) main().catch(e => { console.error(e.message || e); process.exit(1); });
