// 預告片「素材配樂」版：把 web/public/sfx 的音樂照 CUES 的時間接起來，輸出壹個 WAV。
// 翊文 11-22：「音樂原創」，然後再做壹個用素材的版本；「可以用我們的各種音樂素材」。來源、授權見 web/public/sfx/來源.md。
//   node tools/assets/trailer/audio_mix.cjs [輸出.wav]
// 每段會自動找「開始變大聲」的地方當起點（跳過前奏的空白），再把音量對齊到 db（RMS）。需要 ffmpeg。
const fs = require("fs"), path = require("path"), os = require("os");
const { spawnSync } = require("../../dev/child.cjs");

const SFX = path.join(__dirname, "..", "..", "..", "web", "public", "sfx");
const DUR = 61;
// at：預告片第幾秒開始；len：放多久（不含淡出）；fi／fo：淡入、淡出秒數；db：目標音量；from：指定起點（不給就自動找）
const CUES = [
  { file: "lobby-normal", at: 0, len: 9, fi: 1.5, fo: 0.8, db: -21 },          // 開場、大廳：翊文的大廳曲
  { file: "film-inspiring", at: 9, len: 19, fi: 0.6, fo: 0.8, db: -18 },       // 做佩佩、收藏、展廳、任務
  { file: "impact-boom", at: 12.5, len: 3, fi: 0, fo: 0.8, db: -16, from: 0 }, // 揭曉
  { file: "casino-jazz", at: 28, len: 6.2, fi: 0.2, fo: 0.5, db: -18 },        // 賭場
  { file: "bank-music", at: 34, len: 4, fi: 0.4, fo: 0.4, db: -19 },           // 銀行
  { file: "gate-viking", at: 38, len: 7, fi: 1.0, fo: 0.3, db: -17 },          // 地下、合作
  { file: "suspense-forbidden", at: 45, len: 4, fi: 0.3, fo: 0.3, db: -19 },   // 禁書
  { file: "war-drums", at: 49, len: 4, fi: 0.15, fo: 0.25, db: -16 },          // 館友證、簽到、兌換所
  { file: "impact-boom", at: 53, len: 3.5, fi: 0, fo: 1, db: -14, from: 0 },   // 標題
  { file: "film-reveal", at: 53, len: 5.5, fi: 0.2, fo: 1.5, db: -18 },        // 標題、開館
  { file: "creepy-box-short", at: 59.5, len: 1.3, fi: 0.05, fo: 0.2, db: -19 }, // 彩蛋
];

function pcm(file) { // 解成單聲道 8kHz 的浮點數，用來找起點、量音量
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-ar", "8000", "-f", "f32le", "-"], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error("ffmpeg 讀不了 " + file);
  return new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.length - (r.stdout.length % 4)));
}
const rmsOf = (a, s, e) => { let sum = 0; for (let i = s; i < e; i++) sum += a[i] * a[i]; return Math.sqrt(sum / Math.max(1, e - s)); };
function findStart(a) { // 每 0.25 秒量壹次，找第壹個達到整首 70 百分位 60% 的地方
  const step = 2000, w = [];
  for (let i = 0; i + step <= a.length; i += step) w.push(rmsOf(a, i, i + step));
  const ref = [...w].sort((x, y) => x - y)[Math.floor(w.length * 0.7)] || 0;
  const k = w.findIndex(x => x >= ref * 0.6);
  return Math.max(0, k) * 0.25;
}

function mix(out) {
  const inputs = [], parts = [];
  CUES.forEach((c, i) => {
    const file = path.join(SFX, c.file + ".mp3");
    const a = pcm(file), total = a.length / 8000;
    let from = c.from != null ? c.from : findStart(a);
    if (from + c.len + c.fo > total) from = Math.max(0, total - c.len - c.fo);
    const seg = rmsOf(a, Math.floor(from * 8000), Math.min(a.length, Math.floor((from + c.len) * 8000)));
    const gain = Math.min(8, Math.pow(10, c.db / 20) / Math.max(seg, 1e-4)); // 太小聲的段落最多放大 8 倍
    const d = Math.round(c.at * 1000), L = c.len + c.fo;
    inputs.push("-i", file);
    parts.push(`[${i}]aformat=sample_rates=48000:channel_layouts=stereo,atrim=start=${from.toFixed(2)}:duration=${L.toFixed(2)},asetpts=N/SR/TB` +
      (c.fi ? `,afade=t=in:d=${c.fi}` : "") + `,afade=t=out:st=${c.len.toFixed(2)}:d=${c.fo}` + `,volume=${gain.toFixed(3)},adelay=${d}|${d}[c${i}]`);
    console.log(`${c.file.padEnd(20)} 第 ${String(c.at).padStart(4)} 秒　從原曲 ${from.toFixed(2)} 秒起　×${gain.toFixed(2)}`);
  });
  const fc = parts.join(";") + ";" + CUES.map((_, i) => `[c${i}]`).join("") + `amix=inputs=${CUES.length}:normalize=0,alimiter=limit=0.89:attack=2,volume=-1.5dB,atrim=duration=${DUR + 0.5}[out]`;
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", fc, "-map", "[out]", "-ar", "48000", "-ac", "2", out], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("ffmpeg 混音失敗：" + (r.stderr || "").slice(-1500));
  console.log("wrote", out);
}

if (require.main === module) mix(path.resolve(process.argv[2] || path.join(os.tmpdir(), "pepe_trailer", "assets.wav")));
module.exports = { CUES, mix };
