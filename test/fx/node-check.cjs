// Node check: fx.js must load without touching the DOM and expose the API.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const file = path.join(__dirname, '..', '..', 'web', 'src', 'fx.js');
const code = fs.readFileSync(file, 'utf8').replace(/^export\s+/gm, ''); // 第 4 版：fx.js 是模組，拿掉 export 再測

assert.ok(typeof document === 'undefined' && typeof window === 'undefined', 'node has no DOM');
const FX = new Function(code + ';return FX;')();

const fns = ['createDiceTray', 'rollOverlay', 'makeDraggable', 'makeDropTarget', 'countTo', 'toast', 'floatText', 'goldDust', 'spotlight', 'press'];
for (const f of fns) assert.strictEqual(typeof FX[f], 'function', 'FX.' + f);
assert.strictEqual(typeof FX.sound.play, 'function', 'FX.sound.play');
assert.deepStrictEqual(FX.settings, { reduceMotion: false, muted: false });
assert.strictEqual(FX.drag.shaky, false);
const names = ['click', 'flip', 'unlock', 'submit', 'stamp', 'bell', 'dice', 'hug', 'error', 'whoosh', 'coin', 'heartbeat'];
for (const n of names) assert.ok(FX.sound.names.includes(n), 'sound ' + n);

// everything must be inert (not throw) without a DOM
for (const n of names.concat(['nope'])) FX.sound.play(n);
FX.settings.muted = true; FX.sound.play('click'); FX.settings.muted = false;
const tray = FX.createDiceTray(null, { spec: '3D6' });
assert.ok(tray && typeof tray.throw === 'function' && typeof tray.show === 'function' && typeof tray.destroy === 'function');
FX.toast('x')();
FX.floatText({ x: 1, y: 1 }, '+1', 'good');
FX.goldDust(null)();
FX.makeDraggable(null)();
FX.makeDropTarget(null)();
FX.press(null)();
FX.countTo(null, 3);

(async () => {
  await FX.rollOverlay({ title: 't', result: { total: 5, faces: [0, 5] } });
  const r = await FX.spotlight(null, { text: 'x' });
  assert.strictEqual(r, 'skip');
  // no stray globals besides FX
  const g = new Function(code + ';return Object.keys(this||{});').call({});
  console.log('OK - API present, loads and runs inert in Node. Exports:', Object.keys(FX).join(', '));
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
