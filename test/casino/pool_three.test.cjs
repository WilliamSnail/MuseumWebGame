// 決定 0148：水位多算朱翊文（沒收資助），三個人合計、門檻照舊；他從 11-20 起算、起點是進來那刻的淨值、虧的不扣；門檻那晚預設不收他的名字
const assert = require("assert");
const { load } = require("../load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); G.NUM.casino.grants = []; G.NUM.casino.houseLoan.fix.on = false; G.NUM.casino.bankSplit.on = false; G.NUM.casino.govSweep.on = false; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 5).join("\n    ")); } };
const D0 = "2026-11-21", add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const setup = G => {
  const h = G.casHouseFix(G.casHouseNew(), D0).house, w = () => G.casWalletFix(G.casWalletNew(), D0), wy = w(), wj = w(), wm = w(); wm.chips = 500000000;
  G.casCultureGift(wy, h, "YUGa Chu", D0, 1e12, "uy"); G.casCultureGift(wj, h, "sun jerry", D0, 1e12, "uj");
  G.casPoolEnsure(wy, h, "YUGa Chu", "uy", D0); G.casPoolEnsure(wj, h, "sun jerry", "uj", D0);
  return { h, wy, wj, wm };
};
T("朱翊文進來：加進 who（起點＝那刻淨值、不收名字）；暱稱忽略空格和大小寫；不重複；別人不加", G => {
  const { h, wm } = setup(G), C = G.NUM.casino.pool; assert.strictEqual(C.earnT, 200000000, "門檻照舊 2 億");
  assert.strictEqual(G.casPoolEnsure(wm, h, "朱 翊文", "um", D0), true);
  assert.ok(h.pool.who.um && h.pool.who.um.base >= 1 && h.pool.who.um.e === 0 && h.pool.who.um.nt === 1);
  assert.strictEqual(G.casPoolEnsure(wm, h, "朱翊文", "um", D0), false, "不重複加"); assert.strictEqual(G.casPoolEnsure(wm, h, "小明", "ux", D0), false);
  assert.strictEqual(Object.keys(h.pool.who).length, 3);
});
T("從 11-20 起算：之前的日子不加；池子還沒建也不能讓他先建", G => {
  const { h, wm } = setup(G); assert.strictEqual(G.casPoolEnsure(wm, h, "朱翊文", "um", "2026-11-19"), false);
  const h2 = G.casHouseFix(G.casHouseNew(), D0).house; assert.strictEqual(G.casPoolEnsure(wm, h2, "朱翊文", "um", D0), false, "沒有水位時不是他來建");
});
T("三人合計：他賺的加、虧的不扣；已累積的 Yuga＋Jerry 不歸零", G => {
  const { h, wm } = setup(G); G.casPoolEnsure(wm, h, "朱翊文", "um", D0);
  const by = h.pool.who.uy.base, bj = h.pool.who.uj.base, bm = h.pool.who.um.base;
  G.casPoolDay(h, add(D0, 1), { uy: by + 50000000, uj: bj + 30000000, um: bm + 40000000 }); assert.strictEqual(h.pool.e, 120000000, "三人合計");
  G.casPoolDay(h, add(D0, 2), { uy: by + 50000000, uj: bj + 30000000, um: bm - 90000000 }); assert.strictEqual(h.pool.who.um.e, 40000000, "虧的不扣"); assert.strictEqual(h.pool.e, 120000000);
  G.casPoolDay(h, add(D0, 3), { uy: by + 50000000, uj: bj + 30000000, um: bm - 20000000 }); assert.strictEqual(h.pool.who.um.e, 110000000, "回到比上次高的部分才算賺"); assert.strictEqual(h.pool.e, 190000000);
});
T("門檻那晚：預設不收他的名字（只收 Yuga、Jerry）", G => {
  const { h, wm } = setup(G); G.casPoolEnsure(wm, h, "朱翊文", "um", D0);
  h.pool.night = add(D0, 1); G.casPoolDay(h, add(D0, 3), {});
  const nws = { uy: h.pool.who.uy.base, uj: h.pool.who.uj.base, um: h.pool.who.um.base };
  G.casPoolDay(h, add(D0, 3), nws); assert.strictEqual(JSON.stringify(h.pool.takeLeft.slice().sort()), JSON.stringify(["uj", "uy"]));
  assert.strictEqual(G.casPoolTake(h, { pepes: { a: { n: 1, s: 1, nm: "小綠", nmSeq: 1 } } }, "um", 7, add(D0, 3)), null, "他不收");
  assert.ok(h.pool.take, "待收還在，等 Yuga、Jerry");
});
console.log(fail ? `水位三人：${fail} 項沒過` : `水位三人：${pass} 項都過`); process.exit(fail ? 1 : 0);
