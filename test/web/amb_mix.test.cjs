// 賭場環境音跟熱鬧連動（shared/social/room_mood.js 的 heatOf、ambMix）＋ fx.js 的賭場、銀行環境音會建、會停（用假的 AudioContext）
// node test/web/amb_mix.test.cjs（npm test 也會跑）。聲音好不好聽 AI 聽不到，這裡只量「有沒有建節點、有沒有停、有沒有丟錯」。
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { load } = require("../load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(load({})); pass++; } catch (e) { fail++; console.log("FAIL", name, e.message); } };

T("heatOf：照 crowdMood 的分級，沒資料就是平常；roomMood 也回 heat", G => {
  assert.strictEqual(G.heatOf(null), 1); assert.strictEqual(G.heatOf({}), 1); assert.strictEqual(G.heatOf({ mood: "x" }), 1);
  assert.strictEqual(G.heatOf({ mood: 10 }), 0); assert.strictEqual(G.heatOf({ mood: 45 }), 1); assert.strictEqual(G.heatOf({ mood: 70 }), 2); assert.strictEqual(G.heatOf({ mood: 95 }), 3);
  assert.strictEqual(G.roomMood({ mood: 95 }).heat, 3); assert.strictEqual(G.roomMood(null).heat, 1);
});
T("ambMix：越熱鬧人聲越大聲、籌碼聲越頻繁；壞值當平常", G => {
  for (let h = 0; h < 3; h++) {
    const a = G.ambMix(h), b = G.ambMix(h + 1);
    assert.ok(b.crowd > a.crowd && b.chipMax < a.chipMax && b.chipMin < a.chipMin && b.chipN >= a.chipN, "heat " + h);
  }
  for (let h = 0; h < 4; h++) { const m = G.ambMix(h); assert.ok(m.chipMin < m.chipMax && m.crowd > 0 && m.chipN >= 1); }
  assert.deepStrictEqual(G.ambMix(NaN), G.ambMix(1)); assert.deepStrictEqual(G.ambMix(undefined), G.ambMix(1));
  assert.deepStrictEqual(G.ambMix(99), G.ambMix(3)); assert.deepStrictEqual(G.ambMix(-5), G.ambMix(0));
  const m = G.ambMix(2); m.crowd = 9; assert.notStrictEqual(G.ambMix(2).crowd, 9, "回傳的是副本");
});

// ---- fx.js：假的 AudioContext，量節點 ----
function fakeCtx(log) {
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const node = () => { log.made++; return { connect(x) { return x; }, disconnect() {}, start() { log.started++; }, stop() { log.stopped++; } }; };
  return {
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
}
function loadFx() {
  const code = require("../../tools/check/fx_source.cjs").allSource();
  const log = { made: 0, started: 0, stopped: 0 };
  const timers = new Set(); let id = 0;
  const ctx = fakeCtx(log);
  const win = { AudioContext: function () { return ctx; } };
  const sandbox = { window: win, setTimeout: () => { const k = ++id; timers.add(k); return k; }, clearTimeout: (k) => timers.delete(k) };
  const names = Object.keys(sandbox);
  const FX = new Function(...names, code + ";return FX;")(...names.map(n => sandbox[n]));
  return { FX, log, timers };
}
T("fx.js：賭場、銀行環境音會建節點、換掉會停計時器；不丟錯", () => {
  const code = fs.readFileSync(path.join(__dirname, "..", "..", "web", "src", "fx", "fx_sound.js"), "utf8");
  assert.ok(/\bcasino\(c, g(?:, own)?\)/.test(code) && /\bbank\(c, g(?:, own)?\)/.test(code), "AMB 要有 casino、bank");
  for (const room of ["casino", "bank"]) {
    const { FX, log, timers } = loadFx();
    assert.strictEqual(typeof FX.sound.ambMix, "function");
    FX.sound.ambMix({ crowd: 0.019, chipMin: 1500, chipMax: 3500, chipN: 4 });
    FX.sound.demo("click"); // 解鎖
    const base = timers.size, made0 = log.made;
    FX.sound.ambient(room);
    assert.strictEqual(FX.sound.state().amb, room, room + " 有開始播");
    assert.ok(log.made > made0 + 10 && log.started > 5, room + " 建了節點");
    assert.ok(timers.size >= base + 2, room + " 有排程計時器");
    FX.sound.ambMix({ crowd: 0.004, chipMin: 14000, chipMax: 24000, chipN: 1 }); // 換熱鬧程度不丟錯
    FX.sound.ambMix(null);
    FX.sound.ambient("lobby"); // 換掉：舊的計時器要停
    assert.strictEqual(FX.sound.state().amb, "lobby");
    FX.sound.ambient(null);
    assert.strictEqual(FX.sound.state().amb, null);
    assert.ok(timers.size <= base + 3, room + " 離開後計時器都停了（剩下只有淡出收尾用的）：" + timers.size + " vs " + base);
  }
  const { FX } = loadFx();
  FX.settings.muted = true; FX.sound.demo("click"); FX.sound.ambient("casino");
  assert.strictEqual(FX.sound.state().amb, null, "靜音不播");
});

console.log(`amb_mix：${pass} 過、${fail} 沒過`);
if (fail) process.exit(1);
