// 聲音狀態：結構檢查（tools/snd_check.cjs）、「該放哪首」的決定（web/src/audio_state.js 的 ambFor）、每個房間的環境音換掉後計時器都停（假的 AudioContext）
// 11-16 翊文：「被理智嚇退出房間，原本在房間裡的音效不會停」。
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { checkFx, checkUi, ambEntries, run } = require("../tools/snd_check.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, e.message); } };
const root = path.join(__dirname, "..");
const rd = f => fs.readFileSync(path.join(root, f), "utf8");

T("結構檢查：現在的程式沒有問題", () => { const r = run(); assert.deepStrictEqual(r.bad, []); assert.ok(r.rooms.length >= 17); });
T("結構檢查：抓得到壞掉的寫法（每一種都試）", () => {
  const fx = rd("web/src/fx.js");
  const mut = (a, b) => { assert.ok(fx.includes(a), "找不到：" + a); return checkFx(fx.replace(a, b)).bad; };
  assert.ok(mut("timers: [sched, steps, ck.timer]", "timers: [sched, steps]").some(x => /creepyHook/.test(x)), "creepyHook timer 漏掉");
  assert.ok(mut("timers: [sched, steps, ck.timer]", "timers: [steps, ck.timer]").some(x => /sched/.test(x)), "every 漏掉");
  assert.ok(mut("fileLoop(c, g, 'museum-hall', 0.18).n", "fileLoop(c, g, 'museum-hall', 0.18)").some(x => /fileLoop/.test(x)), "fileLoop 漏 .n");
  assert.ok(mut("fileOnce(c, g, 'pulse-rise', 0.22)", "fileOnce(c, bus.amb, 'pulse-rise', 0.22)").some(x => /bus/.test(x)), "接到 bus");
  assert.ok(mut("(hnd.timers || []).forEach((s) => s());", "").some(x => /stop\(\)/.test(x)), "stop 沒停 timers");
  assert.ok(mut("if (hs == null && heartStop) { heartStop(); heartStop = null; }", "").some(x => /heartStop/.test(x)), "心跳沒停");
});
T("結構檢查：UI 端的清除點（登出、離開地下、框走 nbClose）", () => {
  assert.deepStrictEqual(checkUi().bad, []);
  const lg = rd("web/src/ui_login.js");
  assert.ok(/nbClose/.test(lg) && /setAmbOver\(null\)/.test(lg));
});

// ---- ambFor ----
const ambFor = new Function(rd("web/src/audio_state.js").replace(/^export\s+/gm, "") + ";return ambFor;")();
const AMB_OF = (() => {
  const src = (rd("web/src/ui_core.js").match(/export const AMB_OF = \{([\s\S]*?)\};/) || [, ""])[1];
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
  const code = rd("web/src/fx.js").replace(/^export\s+/gm, "");
  const log = { made: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const node = () => { log.made++; return { connect(x) { return x; }, disconnect() {}, start() {}, stop() {} }; };
  const ctx = {
    currentTime: 0, sampleRate: 8000, state: "running", destination: node(),
    createGain() { const n = node(); n.gain = param(); return n; },
    createOscillator() { const n = node(); n.frequency = param(); n.type = "sine"; return n; },
    createBiquadFilter() { const n = node(); n.frequency = param(); n.Q = param(); n.gain = param(); return n; },
    createBufferSource() { const n = node(); n.playbackRate = param(); return n; },
    createBuffer(ch, len) { const d = new Float32Array(len); return { getChannelData: () => d }; },
    createDelay() { const n = node(); n.delayTime = param(); return n; },
    createDynamicsCompressor() { const n = node(); for (const k of ["threshold", "knee", "ratio", "attack", "release"]) n[k] = param(); return n; },
    createStereoPanner() { const n = node(); n.pan = param(); return n; },
    resume() { return Promise.resolve(); },
  };
  const timers = new Set(); let id = 0;
  const sandbox = { window: { AudioContext: function () { return ctx; } }, setTimeout: () => { const k = ++id; timers.add(k); return k; }, clearTimeout: k => timers.delete(k) };
  const names = Object.keys(sandbox);
  const FX = new Function(...names, code + ";return FX;")(...names.map(n => sandbox[n]));
  return { FX, log, timers };
}
T("fx.js：每個房間的環境音換掉後，計時器都停了（只剩淡出收尾用的）", () => {
  const rooms = ambEntries(rd("web/src/fx.js")).map(e => e.name);
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

console.log(`snd_check：${pass} 過、${fail} 沒過`);
if (fail) process.exit(1);
