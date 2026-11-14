// 決定 0081：館外股倍數改了（台股 ×24 → ×1、美股 ×4 → ×32）之後，每支只再換壹次，持股市值不變
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); G.NUM.casino.grants = []; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 3).join("\n    ")); } };
T("決定 0081 的新數字", G => { const C = G.NUM.casino; assert.strictEqual(C.startChips, 25000); assert.strictEqual(C.minBet, 10); assert.strictEqual(C.maxBet, 10000000); assert.strictEqual(C.loan.limit, 25000); assert.strictEqual(G.NUM.signin.weekChips, 375000); assert.strictEqual(JSON.stringify(G.CAS_MENU.filter(m => ["chicken", "tea", "sushi", "feast", "juice"].includes(m.id)).map(m => m.price)), "[100,45,500,2500,50]"); });
T("倍數是台股 ×1、美股 ×32", G => { assert.strictEqual(G.NUM.casino.stock.peg.tw, 1); assert.strictEqual(G.NUM.casino.stock.peg.us, 32); });
T("舊的 dir[id]===true 遇到新倍數會再換壹次、換過不再換；錢包市值不變", G => {
  const id = "handbrain", D1 = "2026-11-15", D2 = "2026-11-16", D3 = "2026-11-17";
  const house = G.casHouseFix(G.casHouseNew(), D1).house; const H = G.casStockHouseFix(house);
  G.casStockRoll(house, D1, {});
  const old = 24 * 1000; H.px[id] = old; H.prev[id] = old; H.peg.dir[id] = true;
  const w = G.casWalletFix(G.casWalletNew(), D1); G.casStockPegSync(w, house);
  const S = G.casStockFix(w); S.own[id] = 10;
  const value0 = 10 * old;
  G.casStockRoll(house, D2, {}, { [id]: { px: 1010 } });
  const to = Math.round(G.NUM.casino.stock.peg.tw * 1010);
  assert.strictEqual(H.px[id], to);
  assert.strictEqual(H.peg.ev.filter(e => e.id === id).length, 1);
  assert.strictEqual(H.peg.dir[id], G.NUM.casino.stock.peg.tw);
  G.casStockPegSync(w, house);
  const S2 = G.casStockFix(w);
  assert.ok(Math.abs(S2.own[id] * to - value0) < to + 1, "市值差不到壹股：" + S2.own[id] * to + " vs " + value0);
  G.casStockRoll(house, D3, {}, { [id]: { px: 1020 } });
  assert.strictEqual(H.peg.ev.filter(e => e.id === id).length, 1, "不再換");
});
console.log(pass + " 項通過" + (fail ? "，" + fail + " 項沒過" : "")); process.exit(fail ? 1 : 0);
