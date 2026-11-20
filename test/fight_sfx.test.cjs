// 地下打鬥的聲音表（shared/fight_sfx.js）：每個合成音效名字都在 fx.js 的 R 裡、每個檔案 id 都有登記（11-16）
const assert = require("assert"), fs = require("fs"), path = require("path");
(async () => {
  const { FIGHT_SFX, fightSfxKey } = await import("../shared/fight_sfx.js");
  const { SFX_FILES } = await import("../shared/sfx_files.js");
  const fx = fs.readFileSync(path.join(__dirname, "..", "web", "src", "fx_sound.js"), "utf8");
  const i = fx.indexOf("const R = {"), j = fx.indexOf("\n    };", i), R = new Set((fx.slice(i, j).match(/^\s{6}([a-zA-Z0-9]+)\(/gm) || []).map(x => x.trim().slice(0, -1)));
  for (const [k, v] of Object.entries(FIGHT_SFX)) {
    assert.ok(v.snd || v.file, k + " 要有 snd 或 file");
    if (v.snd) assert.ok(R.has(v.snd), `${k} 的 snd「${v.snd}」不在 fx.js 的 R 裡`);
    if (v.file) assert.ok(SFX_FILES[v.file], `${k} 的 file「${v.file}」沒有登記在 shared/sfx_files.js`);
  }
  assert.strictEqual(fightSfxKey({ t: "push", n: 3 }), "push");
  assert.strictEqual(fightSfxKey({ t: "see", ok: false }), null);
  assert.strictEqual(fightSfxKey({ t: "flee", ok: true }), "flee:ok");
  assert.strictEqual(fightSfxKey({ t: "trait", kind: "mark" }), "trait:mark");
  assert.strictEqual(fightSfxKey({ t: "move", move: "cheer" }), "move:cheer");
  assert.strictEqual(fightSfxKey({ t: "auto" }), null);
  console.log("1 passed, 0 failed（打鬥的聲音表）");
})().catch(e => { console.error(e); process.exit(1); });
