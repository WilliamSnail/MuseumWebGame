// tools/assets/sfx_add.cjs 的解析和登記（ffmpeg、網路不測）
const assert = require("assert");
const S = require("../../tools/assets/sfx_add.cjs");
let n = 0;
const t = fn => { fn(); n++; };

t(() => {
  const p = S.parsePixabayFilename("C:\\Users\\x\\Desktop\\freesound_community-casino-ambiance-19130.mp3");
  assert.deepStrictEqual(p, { author: "freesound_community", slug: "casino-ambiance", num: "19130", full: "casino-ambiance-19130" });
  assert.strictEqual(S.parsePixabayFilename("/a/b/Alex_Jauk-basement-sewer-pipe-ambience-447101.mp3").num, "447101");
  assert.strictEqual(S.parsePixabayFilename("隨便.mp3"), null);
});
t(() => {
  const html = "<html><head><title>Casino Ambiance by freesound_community | Royalty-free Sound Effects Download - Pixabay</title></head>";
  assert.deepStrictEqual(S.parsePixabayTitle(html), { name: "Casino Ambiance", by: "freesound_community" });
  const h2 = "<title>Rock &amp; Roll by the River by Some_Author | Royalty-free Music - Pixabay</title>";
  assert.deepStrictEqual(S.parsePixabayTitle(h2), { name: "Rock & Roll by the River", by: "Some_Author" });
  assert.strictEqual(S.parsePixabayTitle("<title>Just a moment...</title>"), null);
});
t(() => {
  assert.deepStrictEqual(S.parseTrim("10:80"), { a: 10, b: 80 });
  assert.deepStrictEqual(S.parseTrim(":26"), { a: 0, b: 26 });
  assert.deepStrictEqual(S.parseTrim("12:"), { a: 12, b: null });
  assert.strictEqual(S.parseTrim(undefined), null);
  assert.throws(() => S.parseTrim("abc"));
});
t(() => {
  assert.strictEqual(S.nameWithNote("Echo", { trim: { a: 0, b: 12 } }), "Echo（截前 12 秒）");
  assert.strictEqual(S.nameWithNote("Horror", { loop: true, trim: { a: 0, b: 70 } }), "Horror（截前 70 秒做成循環）");
  assert.strictEqual(S.nameWithNote("Water", { loop: true }), "Water（做成循環）");
  assert.strictEqual(S.nameWithNote("Piano", { trim: { a: 0, b: 26 }, fadeout: 5 }), "Piano（截前 26 秒，最後 5 秒淡出）");
  assert.strictEqual(S.nameWithNote("Plain", {}), "Plain");
});
const SFX = 'export const SFX_FILES = {\n  "a": { name: "A", by: "x", url: "https://pixabay.com/sound-effects/a-1/", use: "甲" },\n};\nexport const SFX_LICENSE = "Pixabay Content License";\n';
const MD = "# 音效檔來源\n\n| 檔案 | 原名 | 作者 | 來源 | 用在 |\n|---|---|---|---|---|\n| a.mp3 | A | x | https://pixabay.com/sound-effects/a-1/ | 甲 |\n";
const E = { id: "new-one", name: "New One（做成循環）", by: "y", url: "https://pixabay.com/music/new-one-2/", loop: true, use: "乙" };
t(() => {
  const s = S.addToSfxFiles(SFX, E);
  assert.ok(s.includes('"new-one": { name: "New One（做成循環）", by: "y", url: "https://pixabay.com/music/new-one-2/", loop: true, use: "乙" },'));
  assert.ok(s.indexOf('"new-one"') > s.indexOf('"a"') && s.indexOf('"new-one"') < s.indexOf("SFX_LICENSE"));
  assert.throws(() => S.addToSfxFiles(s, E), /已經在/);
  assert.ok(!S.addToSfxFiles(SFX, { ...E, loop: false }).includes("loop: true"));
});
t(() => {
  const m = S.addToSourceMd(MD, E);
  assert.ok(m.trimEnd().endsWith("| new-one.mp3 | New One（做成循環） | y | https://pixabay.com/music/new-one-2/ | 乙 |"));
  assert.throws(() => S.addToSourceMd(m, E), /已經在/);
});
t(() => {
  const f = S.buildFilter({ lufs: -20 }, 30);
  assert.ok(f.includes("loudnorm=I=-20:TP=-2") && f.includes("aformat=channel_layouts=mono"));
  const l = S.buildFilter({ loop: true, trim: { a: 5, b: 75 }, lufs: -28 }, 100);
  assert.ok(l.includes("atrim=start=5:end=72") && l.includes("atrim=start=72:end=75") && l.includes("acrossfade=d=3") && l.includes("I=-28"));
  assert.ok(S.buildFilter({ lufs: -20, fadeout: 5 }, 26).includes("afade=t=out:st=21:d=5"));
  assert.ok(!S.buildFilter({ lufs: -20, stereo: true }, 30).includes("mono"));
});
// 真實的檔案也要能加得進去（只測字串，不寫檔）
t(() => {
  const fs = require("fs"), path = require("path");
  const real = fs.readFileSync(path.join(__dirname, "..", "..", "shared", "sfx_files.js"), "utf8");
  const md = fs.readFileSync(path.join(__dirname, "..", "..", "web", "public", "sfx", "來源.md"), "utf8");
  assert.ok(S.addToSfxFiles(real, E).includes('"new-one"'));
  assert.ok(S.addToSourceMd(md, E).includes("new-one.mp3"));
});
console.log(`${n} passed, 0 failed（sfx:add 解析和登記）`);
