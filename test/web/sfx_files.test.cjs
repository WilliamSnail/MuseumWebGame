// 音效檔清單、檔案、來源.md 三邊對得上（11-15，Pixabay 素材要標來源）
const fs = require("fs"), path = require("path"), assert = require("assert");
(async () => {
  const { SFX_FILES } = await import("../../shared/sfx_files.js");
  const dir = path.join(__dirname, "..", "..", "web", "public", "sfx");
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".mp3")).map(f => f.slice(0, -4)).sort();
  assert.deepStrictEqual(files, Object.keys(SFX_FILES).sort(), "web/public/sfx 的 mp3 要跟 shared/sfx_files.js 壹樣");
  const md = fs.readFileSync(path.join(dir, "來源.md"), "utf8");
  for (const [id, x] of Object.entries(SFX_FILES)) {
    assert.ok(x.name && x.by && (x.own ? (x.url === "" || /^https:\/\/suno\.com\/song\//.test(x.url)) : /^https:\/\/pixabay\.com\/(sound-effects|music)\//.test(x.url)), id + " 要有原名、作者、網址（Pixabay；翊文自己生成的 own: true 用 Suno 網址）");
    assert.ok(md.includes(id + ".mp3") && md.includes(x.url), id + " 要寫進 來源.md");
    assert.ok(fs.statSync(path.join(dir, id + ".mp3")).size < (x.hq ? 2048 : 800) * 1024, id + " 太大（要壓過；hq 音樂上限 2 MB）");
  }
  const fx = ["fx/fx", "rooms/casino/ui_casino", "rooms/casino/ui_casino_slot", "rooms/bank/ui_bank", "core/ui_core", "rooms/casino/ui_casino_table", "rooms/ui_screens2", "panels/ui_themeshow", "rooms/ui_art"].map(f => fs.readFileSync(path.join(__dirname, "..", "..", "web", "src", f + ".js"), "utf8")).join(" ");
  for (const m of fx.matchAll(/(?:fileLoop\(c, \w+, |fileOnce\(c, \w+, |sndFile\()['"]([a-z-]+)/g)) assert.ok(SFX_FILES[m[1]], "程式用到沒登記的音效檔：" + m[1]);
  console.log("1 passed, 0 failed（音效檔來源）");
})().catch(e => { console.error(e); process.exit(1); });
