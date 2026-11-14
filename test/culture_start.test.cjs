// 決定 0082：新玩家的起始籌碼由文化部補助（從外面世界池子搬、記 cultureStart），不再憑空
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); G.NUM.casino.grants = []; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 3).join("\n    ")); } };
const D = "2026-11-16";
const snap = (G, ws, h) => G.casBookSnap(ws, h, 0, D);
T("新錢包帶記號、補助後：池子少起始籌碼、憑空少起始籌碼、籌碼不變、對帳差 0、記 cultureStart", G => {
  const h = G.casHouseFix(G.casHouseNew(), D).house, w = G.casWalletFix(null, D), S = G.NUM.casino.startChips;
  assert.strictEqual(w.led.cult, 1);
  const s0 = snap(G, [w], h), opening = G.casBookOpening(s0), world0 = h.world;
  assert.strictEqual(G.casCultureFund(w, h), S);
  const s1 = snap(G, [w], h);
  assert.strictEqual(w.chips, S); assert.strictEqual(h.world, world0 - S); assert.strictEqual(w.led.mint.start, 0);
  assert.strictEqual(G.casBookGap(s1, opening), 0);
  assert.strictEqual(h.led.world.cultureStart, -S); assert.strictEqual(h.cultStart.n, 1); assert.strictEqual(h.cultStart.total, S);
  assert.strictEqual(G.casCultureFund(w, h), 0, "只補助壹次");
});
T("舊錢包（沒有記號）不動", G => {
  const h = G.casHouseFix(G.casHouseNew(), D).house, w = G.casWalletFix(null, D); delete w.led.cult;
  const s = w.led.mint.start, world0 = h.world;
  assert.strictEqual(G.casCultureFund(w, h), 0); assert.strictEqual(w.led.mint.start, s); assert.strictEqual(h.world, world0);
});
T("人數上限到了：還是記憑空、對帳差 0；關掉也是", G => {
  const h = G.casHouseFix(G.casHouseNew(), D).house; G.NUM.casino.culture.maxPlayers = 1;
  const a = G.casWalletFix(null, D), b = G.casWalletFix(null, D), s0 = snap(G, [a, b], h), opening = G.casBookOpening(s0);
  assert.ok(G.casCultureFund(a, h) > 0); assert.strictEqual(G.casCultureFund(b, h), 0);
  assert.strictEqual(b.led.mint.start, G.NUM.casino.startChips); assert.strictEqual(G.casBookGap(snap(G, [a, b], h), opening), 0);
  G.NUM.casino.culture.on = false; const c = G.casWalletFix(null, D); assert.strictEqual(G.casCultureFund(c, h), 0);
});
T("池子吃緊：只補今天付得出的部分，剩下的還是記憑空，對帳差 0", G => {
  const h = G.casHouseFix(G.casHouseNew(), D).house, w = G.casWalletFix(null, D), W = G.NUM.casino.world;
  h.world = Math.floor(W.start * W.lowPct / 100) - 1; // 吃緊
  const room = Math.floor(h.world * W.lowPayPct / 100), s0 = snap(G, [w], h), opening = G.casBookOpening(s0);
  const got = G.casCultureFund(w, h);
  assert.strictEqual(got, Math.min(room, G.NUM.casino.startChips)); assert.strictEqual(w.led.mint.start, G.NUM.casino.startChips - got);
  assert.strictEqual(G.casBookGap(snap(G, [w], h), opening), 0);
});
console.log(`culture_start：${pass} 過，${fail} 沒過`); process.exit(fail ? 1 : 0);
