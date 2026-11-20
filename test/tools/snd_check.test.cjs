// 聲音狀態：結構檢查（tools/check/snd_check.cjs）、「該放哪首」的決定（web/src/core/audio_state.js 的 ambFor）、每個房間的環境音換掉後計時器都停（假的 AudioContext）
// 11-16 翊文：「被理智嚇退出房間，原本在房間裡的音效不會停」。
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { checkFx, checkUi, ambEntries, run } = require("../../tools/check/snd_check.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, e.message); } };
const root = path.join(__dirname, "..", "..");
const rd = f => fs.readFileSync(path.join(root, f), "utf8");

T("結構檢查：現在的程式沒有問題", () => { const r = run(); assert.deepStrictEqual(r.bad, []); assert.ok(r.rooms.length >= 17); });
T("結構檢查：抓得到壞掉的寫法（每一種都試）", () => {
  const fx = rd("web/src/fx/fx_sound.js");
  const mut = (a, b) => { assert.ok(fx.includes(a), "找不到：" + a); return checkFx(fx.replace(a, b)).bad; };
  assert.ok(mut("timers: [sched, steps, ck.timer]", "timers: [sched, steps]").some(x => /creepyHook/.test(x)), "creepyHook timer 漏掉");
  assert.ok(mut("timers: [sched, steps, ck.timer]", "timers: [steps, ck.timer]").some(x => /sched/.test(x)), "every 漏掉");
  assert.ok(mut("fileLoop(c, g, 'museum-hall', 0.18).n", "fileLoop(c, g, 'museum-hall', 0.18)").some(x => /fileLoop/.test(x)), "fileLoop 漏 .n");
  assert.ok(mut("fileOnce(c, g, 'pulse-rise', 0.22, own)", "fileOnce(c, bus.amb, 'pulse-rise', 0.22, own)").some(x => /bus/.test(x)), "接到 bus");
  assert.ok(mut("fileOnce(c, g, 'pulse-rise', 0.22, own)", "fileOnce(c, g, 'pulse-rise', 0.22)").some(x => /沒給 own/.test(x)), "fileOnce 漏 own");
  assert.ok(mut("const ck = creepyHook(c, g, own);", "const ck = creepyHook(c, g);").some(x => /沒給 own/.test(x)), "creepyHook 漏 own");
  assert.ok(mut("origin(c, g, own) {", "origin(c, g) {").some(x => /沒收 own/.test(x)), "房間沒收 own");
  assert.ok(mut("      own.stop(c);\n", "").some(x => /own\.stop/.test(x)), "startAmb 沒停 own");
  assert.ok(mut("own.stop(c, 0.4); SONG_GAINS.delete(g);", "SONG_GAINS.delete(g);").some(x => /songCycle/.test(x)), "songCycle 沒停正在放的曲子");
  assert.ok(mut("(hnd.timers || []).forEach((s) => s());", "").some(x => /stop\(\)/.test(x)), "stop 沒停 timers");
  assert.ok(mut("if (hs == null && heartStop) { heartStop(); heartStop = null; }", "").some(x => /heartStop/.test(x)), "心跳沒停");
});
T("結構檢查：UI 端的清除點（登出、離開地下、框走 nbClose）", () => {
  assert.deepStrictEqual(checkUi().bad, []);
  const lg = rd("web/src/panels/ui_login.js");
  assert.ok(/nbClose/.test(lg) && /setAmbOver\(null\)/.test(lg));
});

// ---- ambFor ----
const ambFor = new Function(rd("web/src/core/audio_state.js").replace(/^export\s+/gm, "") + ";return ambFor;")();
const AMB_OF = (() => {
  const src = (rd("web/src/core/ui_core.js").match(/export const AMB_OF = \{([\s\S]*?)\};/) || [, ""])[1];
  const o = {}; for (const m of src.matchAll(/(\w+): ("[^"]*"|null)/g)) o[m[1]] = m[2] === "null" ? null : m[2].slice(1, -1); return o;
})();
const base = { hasP: true, live: true, dark: false, params: {}, ambOf: AMB_OF, ambOver: null, cellarSnd: null, heat: () => 2, dread: () => "low", creepy: () => false };
const F = o => ambFor(Object.assign({}, base, o));
T("ambFor：每個房間放自己的環境音；沒登記的畫面是 room；沒存檔只有開場放", () => {
  for (const [scr, amb] of Object.entries(AMB_OF)) if (scr !== "title" && scr !== "ending") assert.strictEqual(F({ screen: scr }).amb, amb, scr);
  assert.strictEqual(F({ screen: "xyz" }).amb, "room");
  assert.strictEqual(F({ screen: "title", hasP: false, live: false }).amb, "title");
  assert.strictEqual(F({ screen: "lobby", hasP: false, live: false }).amb, null);
  assert.strictEqual(F({ screen: "ending" }).amb, null);
});
T("ambFor：地下→大廳（被嚇退、昏倒、逃跑都是這條）：地下的聲音一清掉就是大廳", () => {
  assert.strictEqual(F({ screen: "cellar", cellarSnd: { floor: 2, mode: "explore" } }).amb, "cellar");
  const r = F({ screen: "lobby", cellarSnd: null });
  assert.strictEqual(r.amb, "lobby"); assert.ok(r.mix && r.mix[0] === "lobby");
});
T("ambFor：合作的框蓋在別的房間上時放地下的聲音；框關掉（cellarSnd 清掉）換回房間", () => {
  assert.strictEqual(F({ screen: "lobby", cellarSnd: { floor: 1, mode: "fight" } }).amb, "cellar");
  assert.deepStrictEqual(F({ screen: "lobby", cellarSnd: { floor: 1, mode: "fight" } }).mix, ["cellar", { floor: 1, mode: "fight" }]);
  assert.strictEqual(F({ screen: "lobby" }).amb, "lobby");
  assert.strictEqual(F({ screen: "cellar" }).amb, "cellar"); // 地下選樓層（沒有 cellarSnd）：地下的聲音、層數未知
  assert.deepStrictEqual(F({ screen: "cellar" }).mix, ["cellar", { floor: null, mode: "map" }]);
});
T("ambFor：賭場框開著 → 賭場；框關掉 → 底下的房間；登出回標題、結局不放賭場", () => {
  assert.strictEqual(F({ screen: "lobby", ambOver: "casino" }).amb, "casino");
  assert.strictEqual(F({ screen: "lobby", ambOver: "casino" }).mix[1].heat, 2);
  assert.strictEqual(F({ screen: "gallery", ambOver: "casino" }).amb, "casino");
  assert.strictEqual(F({ screen: "lobby", ambOver: null }).amb, "lobby");
  assert.strictEqual(F({ screen: "title", ambOver: "casino" }).amb, "title");
  assert.strictEqual(F({ screen: "ending", ambOver: "casino" }).amb, null);
  assert.strictEqual(F({ screen: "lobby", ambOver: "casino", cellarSnd: { floor: 1, mode: "map" } }).amb, "casino", "賭場框優先");
});
T("ambFor：圖書館禁書頁籤→大廳：緊張那首跟著頁籤，不留", () => {
  assert.deepStrictEqual(F({ screen: "origin", params: { tab: "forbidden" } }).mix, ["origin", { forbidden: true }]);
  assert.deepStrictEqual(F({ screen: "origin", params: { tab: "shelf" } }).mix, ["origin", { forbidden: false }]);
  const r = F({ screen: "lobby", params: {} }); assert.strictEqual(r.amb, "lobby"); assert.ok(!("forbidden" in r.mix[1]));
});
T("ambFor：理智歸零一律是 zero；發作中換房間照房間放（恐怖音樂另外一層）", () => {
  for (const scr of ["lobby", "gallery", "cellar", "bank"]) assert.strictEqual(F({ screen: scr, dark: true }).amb, "zero", scr);
  assert.strictEqual(F({ screen: "lobby", dark: true, ambOver: "casino" }).amb, "zero");
  assert.strictEqual(F({ screen: "ending", dark: true }).amb, null);
  assert.strictEqual(F({ screen: "ending", params: { id: "russia8" } }).amb, "zero");
  assert.strictEqual(F({ screen: "lobby", live: true }).amb, "lobby");
  assert.strictEqual(F({ screen: "lobby", dark: true, live: false }).amb, "lobby", "自由模式不看理智");
});
T("ambFor：圖庫的走音、失敗作之夜只在該房間算；自由模式不算理智；用不到就不算", () => {
  assert.deepStrictEqual(F({ screen: "library" }).mix, ["library", { dread: "low" }]);
  assert.deepStrictEqual(F({ screen: "library", live: false }).mix, ["library", { dread: null }]);
  assert.deepStrictEqual(F({ screen: "hall", creepy: () => true }).mix, ["hall", { creepy: true }]);
  assert.strictEqual(F({ screen: "gallery" }).mix, null);
  let called = 0; F({ screen: "gallery", heat: () => { called++; return 1; }, dread: () => { called++; }, creepy: () => { called++; } }); assert.strictEqual(called, 0);
});

// ---- fx.js：每個房間建了再換掉，計時器都停（假的 AudioContext） ----
function loadFx() {
  const code = require("../../tools/check/fx_source.cjs").allSource();
  const log = { made: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const node = () => { log.made++; return { connect(x) { return x; }, disconnect() {}, start() {}, stop() {} }; };
  const ctx = {
    currentTime: 0, sampleRate: 8000, state: "running", destination: node(),
    createGain() { const n = node(); n.gain = param(); return n; },
    createOscillator() { const n = node(); n.frequency = param(); n.type = "sine"; return n; },
    createBiquadFilter() { const n = node(); n.frequency = param(); n.Q = param(); n.gain = param(); return n; },
    // 音效檔：記下每個放出來的檔（id、有沒有開始、有沒有被停掉）
    createBufferSource() { const n = node(); n.playbackRate = param(); n.start = () => { n.started = true; log.srcs.push(n); }; n.stop = () => { n.stopped = true; }; return n; },
    createBuffer(ch, len) { const d = new Float32Array(len); return { getChannelData: () => d }; },
    decodeAudioData(b, ok) { ok({ duration: 90, id: b.id }); },
    createDelay() { const n = node(); n.delayTime = param(); return n; },
    createDynamicsCompressor() { const n = node(); for (const k of ["threshold", "knee", "ratio", "attack", "release"]) n[k] = param(); return n; },
    createStereoPanner() { const n = node(); n.pan = param(); return n; },
    resume() { return Promise.resolve(); },
  };
  log.srcs = []; log.fetches = {};
  // 計時器：記下要跑的函式，測試用 fire() 自己決定什麼時候跑（模擬「待壹下子」）
  const timers = new Set(), fns = new Map(); let id = 0;
  // 下載：hold 為 true 時先不給，等測試呼叫 release(id) 才給（模擬網路慢、還在下載就離開）
  const net = { hold: false, wait: [] };
  const fetch = (url) => new Promise((ok) => {
    const fid = url.replace(/^\/sfx\/|\.mp3$/g, ""); log.fetches[fid] = (log.fetches[fid] || 0) + 1;
    const give = () => ok({ ok: true, arrayBuffer: () => Promise.resolve({ id: fid }) });
    if (net.hold) net.wait.push({ fid, give }); else give();
  });
  const sandbox = { window: { AudioContext: function () { return ctx; } }, fetch,
    setTimeout: (fn) => { const k = ++id; timers.add(k); fns.set(k, fn); return k; }, clearTimeout: k => { timers.delete(k); fns.delete(k); } };
  const names = Object.keys(sandbox);
  const FX = new Function(...names, code + ";return FX;")(...names.map(n => sandbox[n]));
  const fire = () => { const ks = [...fns.keys()]; ks.forEach((k) => { const fn = fns.get(k); if (!fn) return; fns.delete(k); timers.delete(k); fn(); }); };
  const flush = () => new Promise((r) => setImmediate(r));
  const release = () => { const w = net.wait; net.wait = []; w.forEach((x) => x.give()); };
  return { FX, log, timers, fire, flush, net, release };
}
// 房間裡「待壹下子才放」的整首曲子（11-18 翊文：「圖書館裡待一下子會播放的那個音樂，退出到大廳後還會繼續播放」）
const SONGS = { origin: /^lib-piano/, gallery: /^gallery-/, commission: /^cello-/, office: /^cello-/ };
const songSrcs = (log, re) => log.srcs.filter((s) => s.buffer && re.test(s.buffer.id));
async function untilSong(t, re) { // 壹直跑計時器，直到那首曲子開始放
  for (let i = 0; i < 6 && !songSrcs(t.log, re).length; i++) { t.fire(); await t.flush(); await t.flush(); }
  return songSrcs(t.log, re);
}
const AT = async (name, fn) => { try { await fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, e.message); } };
const asyncTests = [];
for (const room of Object.keys(SONGS)) {
  asyncTests.push(() => AT(`fx.js：${room} 的曲子放到壹半去大廳，曲子停掉`, async () => {
    const t = loadFx(); t.FX.sound.demo("click"); t.FX.sound.ambient(room);
    const s = await untilSong(t, SONGS[room]);
    assert.strictEqual(s.length, 1, `${room} 等了還沒放曲子`);
    assert.ok(!s[0].stopped, "還在房間裡就被停了");
    t.FX.sound.ambient("lobby");
    assert.ok(s[0].stopped, `${room} 的曲子去大廳後還在放`);
  }));
  asyncTests.push(() => AT(`fx.js：${room} 等待中就離開，到大廳不會晚響`, async () => {
    const t = loadFx(); t.FX.sound.demo("click"); t.FX.sound.ambient(room);
    t.FX.sound.ambient("lobby");
    t.fire(); await t.flush(); await t.flush(); t.fire(); await t.flush();
    assert.strictEqual(songSrcs(t.log, SONGS[room]).length, 0, `${room} 離開後曲子還是響了`);
  }));
  asyncTests.push(() => AT(`fx.js：${room} 曲子下載到壹半離開，下載好也不放`, async () => {
    const t = loadFx(); t.FX.sound.demo("click"); t.net.hold = true; t.FX.sound.ambient(room);
    for (let i = 0; i < 4 && !t.net.wait.some((w) => SONGS[room].test(w.fid)); i++) { t.fire(); await t.flush(); }
    assert.ok(t.net.wait.some((w) => SONGS[room].test(w.fid)), `${room} 沒開始下載曲子`);
    t.FX.sound.ambient("lobby"); t.net.hold = false; t.release(); await t.flush(); await t.flush(); await t.flush();
    assert.strictEqual(songSrcs(t.log, SONGS[room]).length, 0, `${room} 離開後下載好的曲子還是放了`);
  }));
  asyncTests.push(() => AT(`fx.js：${room} 回來照原本規則重新計時、會再放`, async () => {
    const t = loadFx(); t.FX.sound.demo("click"); t.FX.sound.ambient(room); t.FX.sound.ambient("lobby");
    t.FX.sound.ambient(room);
    const s = await untilSong(t, SONGS[room]);
    assert.strictEqual(s.length, 1, `${room} 回來後沒有再放`);
    assert.ok(!s[0].stopped);
  }));
}
T("fx.js：每個房間的環境音換掉後，計時器都停了（只剩淡出收尾用的）", () => {
  const rooms = ambEntries(rd("web/src/fx/fx_sound.js")).map(e => e.name);
  for (const room of rooms) {
    const { FX, timers } = loadFx();
    FX.sound.demo("click");
    const base = timers.size;
    FX.sound.ambient(room);
    assert.strictEqual(FX.sound.state().amb, room, room);
    FX.sound.ambient(null);
    assert.strictEqual(FX.sound.state().amb, null, room);
    assert.ok(timers.size <= base + 2, `${room} 換掉後還剩 ${timers.size - base} 個計時器`);
  }
});
T("fx.js：地下聲音換層、換狀態不丟錯；換回大廳後計時器都停", () => {
  const { FX, timers } = loadFx();
  FX.sound.demo("click"); const base = timers.size;
  FX.sound.ambMix({ floor: 2, mode: "explore" }); FX.sound.ambient("cellar");
  for (const m of ["fight", "gate", "gate2", "rest", "map"]) FX.sound.ambMix({ floor: 3, mode: m });
  FX.sound.ambient("lobby"); FX.sound.ambMix({ floor: 3, mode: "fight" });
  assert.strictEqual(FX.sound.state().amb, "lobby");
  FX.sound.ambient(null);
  assert.ok(timers.size <= base + 3, "地下換掉後計時器都停了：" + (timers.size - base));
});
T("fx.js：心跳、耳鳴、不安低鳴：關掉就停；重複關不丟錯", () => {
  const { FX } = loadFx();
  FX.sound.demo("click");
  FX.sound.heart(20); FX.sound.tinnitus(true); FX.sound.unease(0.5); FX.sound.dread("low");
  let s = FX.sound.state(); assert.ok(s.heart && s.tinnitus && s.drone, JSON.stringify(s));
  FX.sound.heart(null); FX.sound.tinnitus(false); FX.sound.unease(0); FX.sound.dread(null);
  s = FX.sound.state(); assert.ok(!s.heart && !s.tinnitus && !s.drone, JSON.stringify(s));
  FX.sound.heart(null);
});

(async () => {
  for (const t of asyncTests) await t();
  console.log(`snd_check：${pass} 過、${fail} 沒過`);
  if (fail) process.exit(1);
})();
