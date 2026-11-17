// 閒置省電（web/src/rest.js）：沒操作 REST_MS 之後，只停無限循環的動畫；有操作就接著動
const assert = require("assert");
(async () => {
  const { restLoop, REST_MS } = await import("../web/src/rest.js");
  const mk = (iter) => ({ playState: "running", effect: { getComputedTiming: () => ({ iterations: iter }) }, pause() { this.playState = "paused"; }, play() { this.playState = "running"; } });
  const loop = mk(Infinity), once = mk(1);
  let svgPaused = false;
  const svg = { pauseAnimations() { svgPaused = true; }, unpauseAnimations() { svgPaused = false; }, animationsPaused: () => svgPaused, querySelector: () => ({}) };
  const ls = {}, cls = new Set();
  const doc = { getAnimations: () => [loop, once], querySelectorAll: () => [svg], addEventListener: (e, f) => { ls[e] = f; }, removeEventListener() {}, body: { classList: { add: c => cls.add(c), remove: c => cls.delete(c) } } };
  let t = 0; const r = restLoop(doc, () => t);
  t = REST_MS - 1; r.check(); assert.equal(loop.playState, "running", "還沒到時間不停");
  t = REST_MS + 1; r.check();
  assert.equal(loop.playState, "paused", "無限循環的要停"); assert.equal(once.playState, "running", "會結束的不停"); assert.ok(svgPaused, "SVG 的 animate 要停"); assert.ok(cls.has("resting"));
  ls.pointerdown(); assert.equal(loop.playState, "running", "壹操作就接著動"); assert.ok(!svgPaused); assert.ok(!cls.has("resting"));
  t += 10; r.check(); assert.equal(loop.playState, "running", "剛操作過不停");
  r.stop(); console.log("rest ok");
})().catch(e => { console.error(e); process.exit(1); });
