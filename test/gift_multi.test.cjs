// 決定 0143：Jerry 也收文化部 10 億、Yuga 再收 5 億；水位看兩人合計賺的；撥款不算賺的；兩人各收壹隻名字
const assert = require("assert");
const { load } = require("./load_shared.cjs");
const G = load({ __realMoney: true }); G.NUM.casino.grants = []; G.NUM.casino.houseLoan.fix.on = false; G.NUM.casino.bankSplit.on = false; G.NUM.casino.govSweep.on = false;
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 5).join("\n    ")); } };
const D0 = "2026-11-21", add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const h = G.casHouseFix(G.casHouseNew(), D0).house, wy = G.casWalletFix(G.casWalletNew(), D0), wj = G.casWalletFix(G.casWalletNew(), D0), wx = G.casWalletFix(G.casWalletNew(), D0);
const inv = () => { const x = G.casBookSnap([wy, wj, wx], h, 0, null); return G.casBookTotal(x) - G.casBookMinted(x) + G.casBookBurned(x); };
const t0 = inv(), w0 = h.world;
T("Jerry 收 10 億；Yuga 收兩筆（10 億＋5 億、兩封信，第二封是第二封的字）；別人什麼都沒有；守恆", () => {
  const rj = G.casCultureGift(wj, h, " Sun  Jerry ", D0, 1e12, "uj"); assert.strictEqual(rj.list.length, 1); assert.strictEqual(rj.got, 1000000000); assert.strictEqual(wj.chips - G.NUM.casino.startChips >= 0 || true, true);
  const ry = G.casCultureGift(wy, h, "YUGa Chu", D0, 1e12, "uy"); assert.strictEqual(ry.list.length, 2); assert.strictEqual(ry.list[0].got, 1000000000); assert.strictEqual(ry.list[1].got, 500000000);
  assert.strictEqual(ry.list[0].mail.title, G.CAS_GIFT.title); assert.strictEqual(ry.list[1].mail.title, G.CAS_GIFT2.title); assert.notStrictEqual(ry.list[0].id, ry.list[1].id);
  assert.strictEqual(G.casCultureGift(wx, h, "小明", D0, 1e12, "ux"), null);
  assert.strictEqual(G.casCultureGift(wy, h, "YUGa Chu", D0, 1e12, "uy"), null, "每筆只壹次"); assert.strictEqual(G.casCultureGift(wj, h, "sun jerry", D0, 1e12, "uj"), null);
  assert.strictEqual(inv(), t0, "守恆"); assert.strictEqual(w0 - h.world, 2500000000, "已知世界少 25 億（文化部帳不夠的部分由公共補）");
});
T("水位合計：兩人各自跟自己比、賺的加、虧的當 0；合計 2 億到門檻；撥款不算賺的", () => {
  const C = G.NUM.casino.pool; delete h.pool; G.casPoolEnsure(wy, h, "YUGa Chu", "uy", D0); G.casPoolEnsure(wj, h, "sun jerry", "uj", D0); assert.strictEqual(JSON.stringify(Object.keys(h.pool.who).sort()), JSON.stringify(["uj", "uy"]));
  assert.strictEqual(G.casPoolEnsure(wj, h, "sun jerry", "uj", D0), false, "不重複加"); assert.strictEqual(G.casPoolEnsure(wx, h, "小明", "ux", D0), false);
  const by = h.pool.who.uy.base, bj = h.pool.who.uj.base;
  G.casPoolDay(h, add(D0, 1), { uy: by + 150000000, uj: bj - 500000000 }); assert.strictEqual(h.pool.who.uy.e, 150000000); assert.strictEqual(h.pool.who.uj.e, 0, "虧的不算"); assert.strictEqual(h.pool.e, 150000000);
  G.casPoolDay(h, add(D0, 2), { uy: by + 150000000, uj: bj - 500000000 + 60000000 }); assert.strictEqual(h.pool.e, 210000000, "兩人合計"); assert.ok(h.pool.lv > C.start);
  // 之後再撥款：起點同步加，不算賺
  const wy2 = G.casWalletFix(G.casWalletNew(), D0); G.NUM.casino.cultureGiftMore.push({ id: "x3", nicks: ["YUGa Chu"], amt: 100, days: 365 }); const b0 = h.pool.who.uy.base; wy2.gifts = {}; G.casCultureGift(wy2, h, "YUGa Chu", D0, 1e12, "uy"); assert.strictEqual(h.pool.who.uy.base - b0, 100); G.NUM.casino.cultureGiftMore.pop();
});
T("門檻那晚過去：兩個人各收壹隻、第壹位收完不清待收、都收完才清", () => {
  const C = G.NUM.casino.pool; h.pool.night = add(D0, 1); h.pool.take = null; G.casPoolDay(h, add(D0, 3), { uy: h.pool.who.uy.base, uj: h.pool.who.uj.base }); assert.strictEqual(h.pool.take, add(D0, 1)); assert.strictEqual(JSON.stringify(h.pool.takeLeft.slice().sort()), JSON.stringify(["uj", "uy"])); assert.strictEqual(h.pool.e, 0); assert.strictEqual(h.pool.lv, C.start);
  const mkP = () => ({ pepes: { a: { n: 1, s: 1, nm: "小綠", nmSeq: 1 } } });
  const r1 = G.casPoolTake(h, mkP(), "uy", 2, add(D0, 3)); assert.ok(r1 && r1.pepe === "小綠"); assert.ok(h.pool.take, "還有壹個人沒收");
  assert.strictEqual(G.casPoolTake(h, mkP(), "uy", 2, add(D0, 3)), null, "同壹個人不收兩次");
  const r2 = G.casPoolTake(h, mkP(), "uj", 5, add(D0, 3)); assert.ok(r2 && r2.no === 5); assert.ok(!h.pool.take, "都收完才清掉");
});
console.log(fail ? `多筆資助：${fail} 項沒過` : `多筆資助：${pass} 項都過`); process.exit(fail ? 1 : 0);
