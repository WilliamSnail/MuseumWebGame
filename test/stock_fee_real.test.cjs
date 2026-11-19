// 決定 0136：館外台股、美股的費用照真實（台股手續費 0.05%、利息 0.02%／天、借券 0.08%、當沖稅 0.15%；美股手續費 0、稅 0、利息 0.02%）；館內股、集團股不動。node test/stock_fee_real.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load: load0 } = require("./load_shared.cjs");
const load = (...a) => { const G = load0(...a); G.NUM.casino.stockIn.mkt.on = false; return G; };
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.NUM.casino.grants = []; G.NUM.casino.stockLev.levByCredit = [[0, 5]]; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 5).join("\n    ")); } };
const D0 = "2026-11-16", at = (day, hh, mm = 0) => { const [y, m, d] = day.split("-").map(Number); return Date.UTC(y, m - 1, d, hh - 8, mm); };
const fresh = (G, chips = 5000000000) => { const h = G.casHouseFix(G.casHouseNew(), D0).house; h.bankroll = 5000000000; const w = G.casWalletFix(G.casWalletNew(), D0); w.chips = chips; return { G, h, w }; };
const snap = s => s.G.casBookSnap([s.w], s.h, 0, null);
const fakeSrc = P => ({ now: id => ({ px: P.px[id], idx: P.idx, open: true, lag: null, stale: false }), path: () => [], close: () => null });
const eq = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m);
const IN = "food", TW = "handbrain", US = "greeneye";
T("設定：台股手續費 0.05、美股 0；槓桿台股利息 0.02／借券 0.08／當沖稅 0.15，美股利息 0.02／借券 0.08／稅 0；館內股照舊（手續費 0.5、利息 0.15、借券 0.3），集團股手續費 0.2（決定 0137）", G => {
  const S = G.NUM.casino.stock, L = G.NUM.casino.stockLev;
  eq(S.feeOut, { tw: 0.05, us: 0, grp: 0.2 }); assert.strictEqual(S.feePct, 0.5); assert.strictEqual(L.interestPct, 0.15); assert.strictEqual(L.borrowPct, 0.3);
  eq(L.byMk, { tw: { interestPct: 0.02, borrowPct: 0.08, taxPct: 0.15 }, us: { interestPct: 0.02, borrowPct: 0.08, taxPct: 0 } });
  assert.strictEqual(G.casStockFeePct(TW), 0.05); assert.strictEqual(G.casStockFeePct(US), 0); assert.strictEqual(G.casStockFeePct(IN), 0.5); assert.strictEqual(G.casStockFeePct("gs-g-daily"), 0.2);
  assert.strictEqual(G.casStockTaxPct(TW), 0.3, "現股證交稅照舊"); assert.strictEqual(G.casStockTaxPct(US), 0);
});
T("現股：台股買賣各收 0.05%（進博物館資金）、美股免手續費；每支 view 帶 fee、taxPct；守恆", G => {
  for (const [id, pc] of [[TW, 0.05], [US, 0]]) {
    const s = fresh(G), mk = id === TW ? "tw" : "us", H = G.casStockHouseFix(s.h); H.px[id] = 1000; const op = G.casBookOpening(snap(s)), b0 = s.h.budget;
    const r = G.casStockBuy(s.w, s.h, id, 1000, D0, null); assert.ok(r.ok, r.reason); assert.strictEqual(r.fee, Math.ceil(1000000 * pc / 100)); assert.strictEqual(s.h.budget - b0, r.fee);
    const r2 = G.casStockSell(s.w, s.h, id, "max", D0, null); assert.ok(r2.ok, r2.reason); assert.strictEqual(r2.fee, Math.ceil(1000000 * pc / 100));
    assert.strictEqual(G.casBookGap(snap(s), op), 0, id + " 守恆");
    const v = G.casStockView(s.w, s.h, D0, at(D0, 12), []), it = v.list.find(x => x.id === id); assert.strictEqual(it.fee, pc / 100); assert.strictEqual(it.taxPct, G.casStockTaxPct(id) / 100);
  }
  const s = fresh(G), H = G.casStockHouseFix(s.h); H.px[IN] = 1000; assert.ok(true);
});
T("槓桿開倉：手續費、利息、借券費照這支的市場（部位 100 萬、保證金 20 萬）", G => {
  const row = (id, side) => { const s = fresh(G), P = { day: D0, px: { [id]: 1000, [IN]: 1000 }, idx: 28 }; if (id === IN) P.px[IN] = 1000; const r = G.casLevOpen(s.w, s.h, { id, side, lev: 5, qty: 1000 }, D0, at(D0, 12), fakeSrc(P)); assert.ok(r.ok, r.reason); return r.cost; };
  eq([row(TW, "long").fee, row(TW, "long").carry], [500, 160]); eq([row(TW, "short").fee, row(TW, "short").carry], [500, 800]);
  eq([row(US, "long").fee, row(US, "long").carry], [0, 160]); eq([row(US, "short").fee, row(US, "short").carry], [0, 800]);
  eq([row(IN, "long").fee, row(IN, "long").carry], [5000, 1200]); eq([row(IN, "short").fee, row(IN, "short").carry], [5000, 3000]);
});
T("槓桿平倉：台股收平倉手續費 0.05％＋當沖稅 0.15％（進政府帳、守恆）；美股、館內股沒有稅；虧到剩不到稅就少收", G => {
  const close = (id, px1) => { const s = fresh(G), op = G.casBookOpening(snap(s)), P = { day: D0, px: { [id]: 1000 }, idx: 28 }, r = G.casLevOpen(s.w, s.h, { id, side: "long", lev: 5, qty: 1000 }, D0, at(D0, 12), fakeSrc(P)); assert.ok(r.ok, r.reason); const g0 = s.h.gov || 0; P.px[id] = px1; P.idx = 40; const c = G.casLevClose(s.w, s.h, r.pos.no, D0, at(D0, 13), fakeSrc(P)); assert.ok(c.ok, c.reason); assert.strictEqual(G.casBookGap(snap(s), op), 0, id + " 守恆"); return { c, gov: (s.h.gov || 0) - g0 }; };
  const a = close(TW, 1010); assert.strictEqual(a.c.fee, Math.ceil(1010000 * 0.05 / 100)); assert.strictEqual(a.gov, Math.ceil(1010000 * 0.15 / 100), "稅進政府帳");
  const b = close(US, 1010); assert.strictEqual(b.c.fee, 0); assert.strictEqual(b.gov, 0);
  const c = close(IN, 1010); assert.strictEqual(c.c.fee, Math.ceil(1010000 * 0.5 / 100)); assert.strictEqual(c.gov, 0);
  const d = close(TW, 805); assert.ok(d.gov >= 0 && d.c.back >= 0, "虧很多：稅、手續費不會讓保證金變成負的");
});
T("槓桿 view：每個市場自己的費用（rates）；預設 fee 是館內股的", G => {
  const s = fresh(G), v = G.casStockLevView(s.w, s.h, D0, at(D0, 12)).lev;
  eq(v.rates.tw, { fee: 0.0005, interest: 0.0002, borrow: 0.0008, tax: 0.0015 }); eq(v.rates.us, { fee: 0, interest: 0.0002, borrow: 0.0008, tax: 0 }); eq(v.rates.in, { fee: 0.005, interest: 0.0015, borrow: 0.003, tax: 0 }); assert.strictEqual(v.fee, 0.005);
});
T("集團股手續費 0.2%（決定 0137）：買賣都照 feeOut.grp；view 每支帶 fee；館內股照舊 0.5%；守恆", G => {
  const D = "2026-11-16", NOON = Date.parse(D + "T12:00:00+08:00"), h = G.casHouseFix(G.casHouseNew(), D).house; h.bankroll = 2e9; G.gsAdvance(h, D, NOON);
  const w = G.casWalletFix(G.casWalletNew(), D); w.chips = 5e9; const op = G.casBookOpening(G.casBookSnap([w], h, 0, D)), b0 = h.budget;
  const b = G.gsBuy(w, h, "g-daily", 100000, D, NOON); assert.ok(b.ok, b.reason); assert.strictEqual(b.fee, Math.ceil(b.cost * 0.2 / 100)); assert.strictEqual(h.budget - b0, b.fee);
  const s = G.gsSell(w, h, "g-daily", 100000, D, NOON); assert.ok(s.ok, s.reason); assert.strictEqual(s.fee, Math.ceil(s.gross * 0.2 / 100));
  assert.strictEqual(G.casBookGap(G.casBookSnap([w], h, 0, D), op), 0, "守恆");
  assert.strictEqual(G.gsFeePct(), 0.2); assert.strictEqual(G.casStockFeePct("gs-g-daily"), 0.2); assert.strictEqual(G.casStockFeePct("grp"), 0.2); assert.strictEqual(G.casStockFeePct(IN), 0.5);
  const v = G.gsView(w, h, D, NOON); assert.ok(v.list.length && v.list.every(x => x.fee === 0.002), "每支帶 fee");
});
console.log(`${pass} passed, ${fail} failed（館外股費用照真實）`);
process.exit(fail ? 1 : 0);
