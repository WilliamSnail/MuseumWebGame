// 股票槓桿、放空、當沖、信用等級（11-14，規劃 2.8b、2.8j）：node test/casino_stock_lev.test.cjs（npm test 也會跑）
// 保證金算術、強平價、盤中檢查（含跳空穿過）、收盤自動平倉、放空損益、各種上限、信用等級、美股擋掉、館內股（莊家）和台股（外面世界）兩種對手盤的帳都對得上。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.NUM.casino.grants = []; G.NUM.casino.stockLev.levByCredit = [[0, 5]]; /* 舊測試用 5× 開，倍數跟信用的規則在 casino_stock_lev_owed.test.cjs 測 */ try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const SEC = "test-secret", D0 = "2026-11-16";
const addDay = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const at = (day, hh, mm = 0) => { const [y, m, d] = day.split("-").map(Number); return Date.UTC(y, m - 1, d, hh - 8, mm); }; // 台灣時間
const fresh = (G, chips = 500000000, bank = 500000000) => { const h = G.casHouseFix(G.casHouseNew(), D0).house; h.bankroll = bank; const w = G.casWalletFix(G.casWalletNew(), D0); w.chips = chips; return { G, w, h }; };
const snap = s => s.G.casBookSnap([s.w], s.h, 0, null);
// 假的價格來源：P.px 現價、P.idx 現在第幾個價、P.open、P.ser[id] 整天的價（idx ＝ 陣列的位置）、P.close
const fakeSrc = P => ({
  now: id => ({ px: P.px[id], idx: P.idx, open: P.open !== false }),
  path: (id, d, from) => (P.ser && P.ser[id] && d === P.day ? P.ser[id].slice(from + 1, (P.upto != null ? P.upto : P.idx) + 1) : []),
  close: (id, d) => (P.close && d === P.close.day ? P.close[id] : null),
});
const IN = "food", TW = "handbrain", US = "greeneye";
const pos = (G, o) => Object.assign({ no: 1, id: IN, mk: "in", side: "long", lev: 5, qty: 100, entry: 1000, notional: 100000, margin: 20000, fee: 0, day: D0, at: 0, chk: 0, px: 1000 }, o);
const J = JSON.stringify;

T("NUM.casino.stockLev：5 倍、強平 50%、利息 0.15%、借券 0.3%、壹天 3 筆、15 分鐘、部位 2,000 萬、淨賺 1,000 萬、美股不開", G => {
  const C = G.NUM.casino.stockLev;
  assert.strictEqual(C.maxLev.in, 5); assert.strictEqual(C.maxLev.tw, 5); assert.strictEqual(C.maxLev.us, 0);
  assert.strictEqual(C.forcePct, 50); assert.strictEqual(C.interestPct, 0.15); assert.strictEqual(C.borrowPct, 0.3);
  assert.strictEqual(C.opensDay, 3); assert.strictEqual(C.coolMin, 15); assert.strictEqual(C.posLimit, 20000000); assert.strictEqual(C.profitCap, 10000000);
  assert.strictEqual(C.houseExposePct, 20); assert.strictEqual(C.houseFloor, 3000000); assert.strictEqual(G.NUM.casino.stock.feePct, 0.5);
});

T("保證金算術：做多 5×，部位 10 萬 → 保證金 2 萬、手續費 500、利息（借的 8 萬 × 0.15%）120；錢從籌碼搬到鎖住的保證金，總錢不變", G => {
  const s = fresh(G), op = G.casBookOpening(snap(s)), c0 = s.w.chips, b0 = s.h.budget;
  const r = G.casLevOpen(s.w, s.h, { id: IN, side: "long", lev: 5, qty: 100 }, D0, at(D0, 12), fakeSrc({ px: { [IN]: 1000 }, idx: 28 }));
  assert.ok(r.ok, r.reason);
  assert.strictEqual(r.pos.margin, 20000); assert.strictEqual(r.cost.fee, 500); assert.strictEqual(r.cost.carry, 120);
  assert.strictEqual(s.w.chips, c0 - 20000 - 620); assert.strictEqual(s.w.lev.hold, 20000); assert.strictEqual(s.h.budget, b0 + 620);
  assert.strictEqual(G.casBookGap(snap(s), op), 0, "鎖住的保證金還算玩家的");
  assert.strictEqual(G.casLevHouseFix(s.h).in, 100000, "莊家記下館內股槓桿部位");
});
T("保證金算術：放空 3× 收借券費（部位 0.3%）；用 margin 也可以開（股數 ＝ 保證金 × 倍數 ÷ 價）；保證金進位", G => {
  const s = fresh(G), src = fakeSrc({ px: { [IN]: 1000 }, idx: 0 });
  const r = G.casLevOpen(s.w, s.h, { id: IN, dir: "short", lev: 3, margin: 100000 }, D0, at(D0, 5), src);
  assert.ok(r.ok, r.reason); assert.strictEqual(r.pos.qty, 300); assert.strictEqual(r.pos.margin, 100000); assert.strictEqual(r.cost.carry, Math.ceil(300000 * 0.003)); assert.strictEqual(r.pos.side, "short");
  const s2 = fresh(G), r2 = G.casLevOpen(s2.w, s2.h, { id: IN, side: "long", lev: 3, qty: 10 }, D0, at(D0, 5), fakeSrc({ px: { [IN]: 1001 }, idx: 0 }));
  assert.strictEqual(r2.pos.margin, Math.ceil(10010 / 3), "保證金無條件進位");
});

T("強制平倉價：做多 5× 在 −10%、放空 5× 在 +10%；倍數越小越遠；剛好等於就平，差 1 就不平", G => {
  const L = pos(G, {}), S = pos(G, { side: "short" });
  assert.strictEqual(G.casLevLiqPx(L), 900); assert.ok(G.casLevHit(L, 900)); assert.ok(!G.casLevHit(L, 901));
  assert.strictEqual(G.casLevLiqPx(S), 1100); assert.ok(G.casLevHit(S, 1100)); assert.ok(!G.casLevHit(S, 1099));
  const L2 = pos(G, { lev: 2, margin: 50000 }); assert.strictEqual(G.casLevLiqPx(L2), 750);
  assert.strictEqual(G.casLevMaint(L, 1000), 100); assert.strictEqual(G.casLevMaint(L, 950), 75); assert.strictEqual(G.casLevMaint(L, 900), 50);
  // 隨便挑幾組不整的數字，liqPx 一定是「剛好碰到」的那個價
  for (const [entry, lev, qty, side] of [[1237, 5, 83, "long"], [9871, 3, 17, "short"], [2341, 4, 51, "long"], [665, 5, 301, "short"], [101464, 5, 7, "long"]]) {
    const n = entry * qty, p = pos(G, { entry, lev, qty, side, notional: n, margin: Math.ceil(n / lev) }), lq = G.casLevLiqPx(p);
    assert.ok(G.casLevHit(p, lq), `${entry} ${lev}× ${side}：liqPx ${lq} 要碰到`); assert.ok(!G.casLevHit(p, lq + (side === "long" ? 1 : -1)), `${entry}：再靠近壹個價就不碰到`);
    assert.ok((side === "long" ? -1 : 1) * (lq - entry) > 0, "方向對");
  }
});

T("盤中檢查：照價格走過的路找第壹個碰到強平的價；沒碰到就沒事", G => {
  const p = pos(G, {});
  assert.strictEqual(J(G.casLevCheck(p, [990, 950, 905, 901, 1200])), J({ hit: false }));
  assert.strictEqual(J(G.casLevCheck(p, [990, 950, 905, 899, 700])), J({ hit: true, k: 3, px: 899, why: "liq" }));
  assert.strictEqual(J(G.casLevCheck(pos(G, { side: "short" }), [1010, 1099, 1100, 1300])), J({ hit: true, k: 2, px: 1100, why: "liq" }));
  assert.strictEqual(G.casLevCheck(p, []).hit, false); assert.strictEqual(G.casLevCheck(p, null).hit, false);
});

T("強制平倉：價格路徑碰到強平價，在那個價平倉，不是後面更差的價；拿回保證金 ＋ 損益 − 手續費；館內股莊家收到賠的", G => {
  const s = fresh(G), op = G.casBookOpening(snap(s)), P = { day: D0, px: { [IN]: 1000 }, idx: 10, ser: {} };
  const r = G.casLevOpen(s.w, s.h, { id: IN, side: "long", lev: 5, qty: 100 }, D0, at(D0, 8), fakeSrc(P));
  assert.ok(r.ok); const c1 = s.w.chips, bank1 = s.h.bankroll, b1 = s.h.budget;
  P.ser[IN] = Array(11).fill(1000).concat([990, 950, 905, 899, 700]); P.idx = 15; P.px[IN] = 700;
  const out = G.casLevSweep(s.w, s.h, D0, at(D0, 9), fakeSrc(P));
  assert.strictEqual(out.length, 1); assert.strictEqual(out[0].why, "liq"); assert.strictEqual(out[0].px, 899);
  assert.strictEqual(out[0].pnl, -10100); const fee = Math.ceil(100 * 899 * 0.005); assert.strictEqual(out[0].fee, fee); assert.strictEqual(out[0].back, 20000 - 10100 - fee);
  assert.strictEqual(s.w.chips, c1 + 20000 - 10100 - fee); assert.strictEqual(s.h.bankroll, bank1 + 10100); assert.strictEqual(s.h.budget, b1 + fee);
  assert.strictEqual(s.w.lev.pos.length, 0); assert.strictEqual(s.w.lev.hold, 0); assert.strictEqual(G.casLevHouseFix(s.h).in, 0);
  assert.strictEqual(G.casBookGap(snap(s), op), 0); assert.ok(s.w.lev.notes.length >= 1);
});
T("跳空穿過強平價：用跳空後的價平倉（賠超過 50%）；穿過整個保證金：賠到保證金為止、壞帳沒人付，帳還是對的", G => {
  const P = { day: D0, px: { [IN]: 1000 }, idx: 0, ser: {} };
  for (const [gapPx, pnlWant, bad] of [[850, -15000, 0], [800, -20000, 0], [700, -20000, 10000]]) {
    const s = fresh(G), op = G.casBookOpening(snap(s));
    assert.ok(G.casLevOpen(s.w, s.h, { id: IN, side: "long", lev: 5, qty: 100 }, D0, at(D0, 5), fakeSrc(P)).ok);
    const P2 = { day: D0, px: { [IN]: gapPx }, idx: 3, ser: { [IN]: [1000, 995, 990, gapPx] } };
    const bank1 = s.h.bankroll, out = G.casLevSweep(s.w, s.h, D0, at(D0, 6), fakeSrc(P2));
    assert.strictEqual(out[0].px, gapPx); assert.strictEqual(out[0].pnl, pnlWant); assert.strictEqual(out[0].bad, bad);
    assert.strictEqual(s.h.bankroll, bank1 - pnlWant, "莊家只收到賠的保證金");
    if (bad) { assert.strictEqual(out[0].back, 0); assert.strictEqual(s.h.act.levBadDebt, bad); }
    assert.strictEqual(G.casBookGap(snap(s), op), 0, "gap " + gapPx);
  }
});
T("放空的強平和損益：放空賺（價跌）、放空賠（價漲到 +10% 強平）", G => {
  const s = fresh(G), op = G.casBookOpening(snap(s)), P = { day: D0, px: { [IN]: 1000 }, idx: 0 };
  const r = G.casLevOpen(s.w, s.h, { id: IN, side: "short", lev: 5, qty: 100 }, D0, at(D0, 5), fakeSrc(P));
  assert.ok(r.ok); assert.strictEqual(G.casLevPnl(r.pos, 950), 5000); assert.strictEqual(G.casLevPnl(r.pos, 1050), -5000);
  P.px[IN] = 950; P.idx = 4;
  const c = G.casLevClose(s.w, s.h, r.pos.no, D0, at(D0, 6), fakeSrc(P));
  assert.ok(c.ok, c.reason); assert.strictEqual(c.pnl, 5000); assert.strictEqual(c.fee, Math.ceil(100 * 950 * 0.005)); assert.strictEqual(c.back, 20000 + 5000 - c.fee);
  assert.strictEqual(G.casBookGap(snap(s), op), 0);
  const s2 = fresh(G), op2 = G.casBookOpening(snap(s2));
  G.casLevOpen(s2.w, s2.h, { id: IN, side: "short", lev: 5, qty: 100 }, D0, at(D0, 5), fakeSrc({ px: { [IN]: 1000 }, idx: 0 }));
  const out = G.casLevSweep(s2.w, s2.h, D0, at(D0, 6), fakeSrc({ day: D0, px: { [IN]: 1120 }, idx: 3, ser: { [IN]: [1000, 1050, 1099, 1120] } }));
  assert.strictEqual(out[0].why, "liq"); assert.strictEqual(out[0].px, 1120); assert.strictEqual(out[0].pnl, -12000); assert.strictEqual(G.casBookGap(snap(s2), op2), 0);
});

T("手動平倉：找不到的單號不行、休市中叫平倉會被掃描收盤平掉；平倉後同一檔 15 分鐘內不能再開", G => {
  const s = fresh(G), P = { day: D0, px: { [IN]: 1000 }, idx: 5 }, t0 = at(D0, 6);
  const r = G.casLevOpen(s.w, s.h, { id: IN, side: "long", lev: 2, qty: 10 }, D0, t0, fakeSrc(P)); assert.ok(r.ok);
  assert.ok(!G.casLevClose(s.w, s.h, 99, D0, t0, fakeSrc(P)).ok);
  const h = G.casLevClose(s.w, s.h, r.pos.no, D0, t0, fakeSrc(Object.assign({}, P, { open: false })));
  assert.ok(h.ok && h.auto === "flat", "休市中叫平倉：掃描就收盤平掉了");
  const s2 = fresh(G), P2 = { day: D0, px: { [IN]: 1000 }, idx: 5 }, r2 = G.casLevOpen(s2.w, s2.h, { id: IN, side: "long", lev: 2, qty: 10 }, D0, t0, fakeSrc(P2));
  const c = G.casLevClose(s2.w, s2.h, r2.pos.no, D0, t0 + 60000, fakeSrc(P2)); assert.ok(c.ok);
  const again = G.casLevOpen(s2.w, s2.h, { id: IN, side: "long", lev: 2, qty: 10 }, D0, t0 + 60000 * 10, fakeSrc(P2)); assert.ok(!again.ok && again.reason.includes("6 分鐘"), again.reason);
  assert.ok(G.casLevOpen(s2.w, s2.h, { id: IN, side: "long", lev: 2, qty: 10 }, D0, t0 + 60000 * 16, fakeSrc(P2)).ok, "15 分鐘後可以");
});

T("當沖：收盤了還沒平的，用那天最後壹個價自動平倉（館內 23:30，真的曲線）；沒收盤的不動", G => {
  const s = fresh(G), op = G.casBookOpening(snap(s)), h = s.h;
  G.casInRoll(h, D0, 0, SEC); const H = G.casInHouseFix(h), ser = G.casInSeries(H.open[IN], D0, IN, SEC);
  const open = at(D0, 12), src0 = G.casLevSrc(h, D0, open, SEC);
  assert.ok(src0.now(IN).open); assert.strictEqual(src0.now(IN).px, ser[(12 * 60 - 300) / 15]);
  const r = G.casLevOpen(s.w, h, { id: IN, side: "long", lev: 1, qty: 10 }, D0, open, src0); assert.ok(r.ok, r.reason);
  assert.strictEqual(G.casLevSweep(s.w, h, D0, at(D0, 12, 30), G.casLevSrc(h, D0, at(D0, 12, 30), SEC)).length, 0, "中午沒收盤，1 倍碰不到強平");
  assert.strictEqual(s.w.lev.pos.length, 1);
  const t = at(D0, 23, 31), out = G.casLevSweep(s.w, h, D0, t, G.casLevSrc(h, D0, t, SEC));
  assert.strictEqual(out.length, 1); assert.strictEqual(out[0].why, "flat"); assert.strictEqual(out[0].px, ser[74], "照 23:30 的價");
  assert.strictEqual(s.w.lev.pos.length, 0); assert.strictEqual(G.casBookGap(snap(s), op), 0);
  assert.ok(/不過夜/.test(s.w.lev.notes[s.w.lev.notes.length - 1]));
});
T("當沖：隔天才碰到（還沒換日／已經換日），照原本那天的收盤價平；收盤價不知道就用最後看到的價", G => {
  const s = fresh(G), op = G.casBookOpening(snap(s)), h = s.h;
  G.casInRoll(h, D0, 0, SEC); const H = G.casInHouseFix(h), ser = G.casInSeries(H.open[IN], D0, IN, SEC);
  assert.ok(G.casLevOpen(s.w, h, { id: IN, side: "short", lev: 2, qty: 10 }, D0, at(D0, 10), G.casLevSrc(h, D0, at(D0, 10), SEC)).ok);
  const d1 = addDay(D0, 1), t1 = at(d1, 5, 1);
  // 還沒換日（先掃描，再叫 casInRoll）：路徑看完整的一天，收盤價 ＝ ser[74]
  const out = G.casLevSweep(s.w, h, d1, t1, G.casLevSrc(h, d1, t1, SEC));
  assert.strictEqual(out.length, 1); assert.ok(out[0].px === ser[74] || out[0].why === "liq", "收盤價或途中強平");
  assert.strictEqual(G.casBookGap(snap(s), op), 0);
  // 已經換日：莊家記著前壹天的收盤
  const s2 = fresh(G), op2 = G.casBookOpening(snap(s2)), h2 = s2.h;
  G.casInRoll(h2, D0, 0, SEC); const H2 = G.casInHouseFix(h2);
  assert.ok(G.casLevOpen(s2.w, h2, { id: IN, side: "long", lev: 1, qty: 10 }, D0, at(D0, 10), G.casLevSrc(h2, D0, at(D0, 10), SEC)).ok);
  G.casInRoll(h2, d1, 0, SEC);
  const out2 = G.casLevSweep(s2.w, h2, d1, at(d1, 6), G.casLevSrc(h2, d1, at(d1, 6), SEC));
  assert.strictEqual(out2.length, 1); assert.strictEqual(out2[0].px, H2.close[IN], "用莊家記的昨天收盤");
  assert.strictEqual(G.casBookGap(snap(s2), op2), 0);
  // 隔了兩天：不知道收盤價，用最後看到的價（開倉價），不賺不賠
  const s3 = fresh(G), h3 = s3.h;
  G.casInRoll(h3, D0, 0, SEC);
  assert.ok(G.casLevOpen(s3.w, h3, { id: IN, side: "long", lev: 1, qty: 10 }, D0, at(D0, 10), G.casLevSrc(h3, D0, at(D0, 10), SEC)).ok);
  const px0 = s3.w.lev.pos[0].entry; G.casInRoll(h3, addDay(D0, 1), 0, SEC); G.casInRoll(h3, addDay(D0, 2), 0, SEC);
  const out3 = G.casLevSweep(s3.w, h3, addDay(D0, 2), at(addDay(D0, 2), 6), G.casLevSrc(h3, addDay(D0, 2), at(addDay(D0, 2), 6), SEC));
  assert.strictEqual(out3[0].px, px0); assert.strictEqual(out3[0].pnl, 0);
});

T("台股用外面世界當對手盤：賺 mint（stockLevWin）、賠 burn（stockLevLoss）；莊家不動；手續費利息進預算池；帳對得上", G => {
  const s = fresh(G), op = G.casBookOpening(snap(s)), bank0 = s.h.bankroll;
  const P = { day: D0, px: { [TW]: 100000 }, idx: 10, ser: {} };
  const r = G.casLevOpen(s.w, s.h, { id: TW, side: "long", lev: 5, qty: 10 }, D0, at(D0, 10), fakeSrc(P)); assert.ok(r.ok, r.reason);
  P.px[TW] = 104000; P.idx = 12;
  const c = G.casLevClose(s.w, s.h, r.pos.no, D0, at(D0, 11), fakeSrc(P)); assert.ok(c.ok);
  assert.strictEqual(c.pnl, 40000); assert.strictEqual(s.w.led.mint.stockLevWin, 40000); assert.strictEqual(s.h.bankroll, bank0, "莊家完全沒動");
  assert.strictEqual(G.casBookGap(snap(s), op), 0);
  const r2 = G.casLevOpen(s.w, s.h, { id: TW, side: "short", lev: 5, qty: 10 }, D0, at(D0, 12), fakeSrc(P)); assert.ok(r2.ok, r2.reason);
  P.px[TW] = 106000; P.idx = 20;
  const c2 = G.casLevClose(s.w, s.h, r2.pos.no, D0, at(D0, 12, 30), fakeSrc(P)); assert.ok(c2.ok, c2.reason);
  assert.strictEqual(c2.pnl, -20000); assert.strictEqual(s.w.led.burn.stockLevLoss, 20000); assert.strictEqual(s.h.bankroll, bank0);
  assert.strictEqual(G.casBookGap(snap(s), op), 0);
  assert.strictEqual(G.casLevHouseFix(s.h).in, 0, "台股不佔莊家的曝險");
});
T("台股淨賺上限：壹天賺超過上限的部分不給；賠的不設限；信用高上限放大；隔天重算", G => {
  G.NUM.casino.stockLev.profitCap = 30000;
  const s = fresh(G), op = G.casBookOpening(snap(s)), P = { day: D0, px: { [TW]: 100000 }, idx: 0 };
  const r = G.casLevOpen(s.w, s.h, { id: TW, side: "long", lev: 5, qty: 10 }, D0, at(D0, 10), fakeSrc(P)); assert.ok(r.ok);
  P.px[TW] = 105000; P.idx = 1;
  const c = G.casLevClose(s.w, s.h, r.pos.no, D0, at(D0, 10, 5), fakeSrc(P));
  assert.strictEqual(c.pnl, 30000, "上限 3 萬"); assert.strictEqual(c.clipped, 20000); assert.strictEqual(s.w.led.mint.stockLevWin, 30000);
  const r2 = G.casLevOpen(s.w, s.h, { id: TW, side: "long", lev: 5, qty: 10 }, D0, at(D0, 11), fakeSrc(P)); P.px[TW] = 106000; P.idx = 2;
  const c2 = G.casLevClose(s.w, s.h, r2.pos.no, D0, at(D0, 11, 5), fakeSrc(P)); assert.strictEqual(c2.pnl, 0, "上限用完了，賺的不給");
  const r3 = G.casLevOpen(s.w, s.h, { id: TW, side: "long", lev: 5, qty: 10 }, D0, at(D0, 12), fakeSrc(P)); P.px[TW] = 100000; P.idx = 3;
  const c3 = G.casLevClose(s.w, s.h, r3.pos.no, D0, at(D0, 12, 5), fakeSrc(P)); assert.ok(c3.pnl < 0, "賠照賠"); assert.strictEqual(s.w.lev.net.n, 30000 + c3.pnl);
  assert.strictEqual(G.casBookGap(snap(s), op), 0);
  assert.strictEqual(G.casLevProfitCap(0), 30000); assert.strictEqual(G.casLevProfitCap(10), 90000, "10 級是 3 倍");
  const d1 = addDay(D0, 1), P1 = { day: d1, px: { [TW]: 100000 }, idx: 0 }, r4 = G.casLevOpen(s.w, s.h, { id: TW, side: "long", lev: 5, qty: 10 }, d1, at(d1, 10), fakeSrc(P1)); P1.px[TW] = 105000; P1.idx = 1;
  assert.strictEqual(G.casLevClose(s.w, s.h, r4.pos.no, d1, at(d1, 10, 5), fakeSrc(P1)).pnl, 30000, "新的一天重新算");
});
T("館內股淨賺也受全館壹天淨賠付上限限制（跟賣出共用壹個數）；賠給莊家的讓額度回來", G => {
  const s = fresh(G), op = G.casBookOpening(snap(s)), C = G.NUM.casino.stock; C.netSellPct = 0; C.netSellFlat = 10000;
  const P = { day: D0, px: { [IN]: 1000 }, idx: 0 }, r = G.casLevOpen(s.w, s.h, { id: IN, side: "long", lev: 5, qty: 300 }, D0, at(D0, 6), fakeSrc(P));
  assert.ok(r.ok, r.reason); P.px[IN] = 1050; P.idx = 3; const bank0 = s.h.bankroll;
  const c = G.casLevClose(s.w, s.h, r.pos.no, D0, at(D0, 7), fakeSrc(P));
  assert.strictEqual(c.pnl, 10000, "賺 1.5 萬，額度只有 1 萬"); assert.strictEqual(c.clipped, 5000); assert.strictEqual(s.h.bankroll, bank0 - 10000);
  assert.strictEqual(G.casInHouseFix(s.h).net.n, 10000); assert.strictEqual(G.casInHouseFix(s.h).net.day, D0);
  const r2 = G.casLevOpen(s.w, s.h, { id: IN, side: "long", lev: 5, qty: 300 }, D0, at(D0, 8), fakeSrc(P)); P.px[IN] = 1100; P.idx = 6;
  assert.strictEqual(G.casLevClose(s.w, s.h, r2.pos.no, D0, at(D0, 9), fakeSrc(P)).pnl, 0, "額度用完了");
  const r3 = G.casLevOpen(s.w, s.h, { id: IN, side: "long", lev: 5, qty: 100 }, D0, at(D0, 10), fakeSrc(P)); P.px[IN] = 1000; P.idx = 9;
  const c3 = G.casLevClose(s.w, s.h, r3.pos.no, D0, at(D0, 11), fakeSrc(P)); assert.strictEqual(c3.pnl, -10000);
  assert.strictEqual(G.casInHouseFix(s.h).net.n, 0, "賠給莊家的讓淨賠付回到 0");
  assert.strictEqual(G.casBookGap(snap(s), op), 0);
});

T("上限：壹天 3 筆開倉；部位合計上限；倍數；股數；籌碼不夠；錢包是負的／借款逾期不能開；休市不能開", G => {
  const s = fresh(G), src = fakeSrc({ px: { [IN]: 1000 }, idx: 0 });
  for (let i = 0; i < 3; i++) assert.ok(G.casLevOpen(s.w, s.h, { id: IN, side: "long", lev: 5, qty: 10 }, D0, at(D0, 6 + i), fakeSrc({ px: { [IN]: 1000 + i }, idx: i })).ok, "第 " + (i + 1) + " 筆");
  const no = G.casLevOpen(s.w, s.h, { id: IN, side: "long", lev: 5, qty: 10 }, D0, at(D0, 10), src); assert.ok(!no.ok && /3 筆/.test(no.reason), no.reason);
  assert.ok(G.casLevOpen(s.w, s.h, { id: IN, side: "long", lev: 5, qty: 10 }, addDay(D0, 1), at(addDay(D0, 1), 6), src).ok, "隔天重算");
  const t = fresh(G), tw = (n, side, idx) => G.casLevOpen(t.w, t.h, { id: TW, side, lev: 5, qty: n }, D0, at(D0, 10) + idx * 60000 * 20, fakeSrc({ px: { [TW]: 100000 }, idx }));
  const big = tw(201, "long", 0); assert.ok(!big.ok && /部位合計/.test(big.reason), big.reason); // 2,010 萬
  assert.ok(tw(100, "long", 1).ok, "1,000 萬可以");
  assert.ok(!tw(101, "short", 2).ok, "做多放空合計算 2,000 萬");
  assert.ok(tw(100, "short", 3).ok);
  const u = fresh(G), p0 = { px: { [IN]: 1000 }, idx: 0 }, op = o => G.casLevOpen(u.w, u.h, Object.assign({ id: IN, side: "long", lev: 2, qty: 1 }, o), D0, at(D0, 6), fakeSrc(p0));
  assert.ok(!op({ lev: 6 }).ok, "6 倍不行"); assert.ok(!op({ lev: 0 }).ok); assert.ok(!op({ qty: 0 }).ok); assert.ok(!op({ qty: -3 }).ok);
  assert.ok(!op({ side: "up" }).ok); assert.ok(!op({ id: "nope" }).ok);
  u.w.chips = 1000; const poor = op({ lev: 5, qty: 100 }); assert.ok(!poor.ok && /籌碼不夠/.test(poor.reason));
  u.w.chips = -5; assert.ok(!op({}).ok, "欠款中不能開");
  u.w.chips = 1e8; u.w.loan.list.push({ id: 1, amt: 100, owe: 110, day: addDay(D0, -3), due: addDay(D0, -1) });
  assert.ok(!op({}).ok, "借款逾期不能開");
  const closed = fresh(G); assert.ok(!G.casLevOpen(closed.w, closed.h, { id: IN, side: "long", lev: 2, qty: 1 }, D0, at(D0, 6), fakeSrc({ px: { [IN]: 1000 }, idx: 0, open: false })).ok, "休市不能開");
});
T("莊家這邊的上限：館內股槓桿＋放空部位 ≤ max(莊家的錢 × 20%, 300 萬)；莊家 ≤ 0 不能開；平倉後額度回來；台股不受影響", G => {
  const s = fresh(G, 500000000, 20000000), src = n => fakeSrc({ px: { [IN]: 1000 }, idx: n }); // 莊家 2,000 萬 → 上限 max(400 萬, 300 萬) ＝ 400 萬
  assert.ok(G.casLevOpen(s.w, s.h, { id: IN, side: "long", lev: 5, qty: 3000 }, D0, at(D0, 6), src(0)).ok, "300 萬");
  const no = G.casLevOpen(s.w, s.h, { id: IN, side: "short", lev: 5, qty: 1500 }, D0, at(D0, 7), src(4)); assert.ok(!no.ok && /莊家/.test(no.reason), no.reason);
  assert.ok(G.casLevOpen(s.w, s.h, { id: IN, side: "short", lev: 5, qty: 1000 }, D0, at(D0, 7), src(4)).ok, "共 400 萬剛好");
  const c = G.casLevClose(s.w, s.h, 1, D0, at(D0, 8), src(8)); assert.ok(c.ok);
  assert.ok(G.casLevOpen(s.w, s.h, { id: "bj", side: "short", lev: 5, qty: 300 }, D0, at(D0, 9), fakeSrc({ px: { bj: 1000 }, idx: 12 })).ok, "額度回來");
  const p = fresh(G, 500000000, 1000000); // 莊家只有 100 萬：保底 300 萬
  assert.ok(G.casLevOpen(p.w, p.h, { id: IN, side: "long", lev: 5, qty: 3000 }, D0, at(D0, 6), src(0)).ok, "保底 300 萬");
  assert.ok(!G.casLevOpen(p.w, p.h, { id: IN, side: "long", lev: 5, qty: 1 }, D0, at(D0, 8), src(8)).ok);
  const z = fresh(G, 500000000, 0), rz = G.casLevOpen(z.w, z.h, { id: IN, side: "long", lev: 5, qty: 1 }, D0, at(D0, 6), src(0)); assert.ok(!rz.ok && /沒有錢/.test(rz.reason), rz.reason);
  const w2 = fresh(G, 500000000, 0); assert.ok(G.casLevOpen(w2.w, w2.h, { id: TW, side: "long", lev: 5, qty: 1 }, D0, at(D0, 10), fakeSrc({ px: { [TW]: 100000 }, idx: 0 })).ok, "台股對手是外面世界，莊家沒錢也可以");
});

T("美股現在不開放槓桿和放空，講清楚原因；市場判斷", G => {
  const s = fresh(G), r = G.casLevOpen(s.w, s.h, { id: US, side: "long", lev: 2, qty: 1 }, D0, at(D0, 22, 40), fakeSrc({ px: { [US]: 66500 }, idx: 5 }));
  assert.ok(!r.ok); assert.ok(r.reason.includes("美股") && r.reason.includes("重新算"), r.reason);
  const r2 = G.casLevOpen(s.w, s.h, { id: US, side: "short", lev: 1, qty: 1 }, D0, at(D0, 22, 40), fakeSrc({ px: { [US]: 66500 }, idx: 5 })); assert.ok(!r2.ok);
  assert.strictEqual(G.casLevMarket(US), "us"); assert.strictEqual(G.casLevMarket(TW), "tw"); assert.strictEqual(G.casLevMarket(IN), "in"); assert.strictEqual(G.casLevMarket("x"), null);
  const v = G.casStockLevView(s.w, s.h, D0, at(D0, 22, 40), fakeSrc({ px: {}, idx: 0 })); assert.strictEqual(v.lev.byMarket.us, 0); assert.ok(v.lev.usWhy.includes("美股"));
  assert.strictEqual(s.w.lev.pos.length, 0);
});

T("信用等級：準時還款壹天 +1、逾期 −3、不會變負、5 點 1 級、最高 10 級；部位上限和淨賺上限照等級放大；第壹次碰到不補算以前的", G => {
  const s = fresh(G), w = s.w; w.loan.ok = 4; w.loan.late = 1;
  G.casLevFix(w, D0); assert.strictEqual(w.lev.cr.pts, 0, "起點");
  w.loan.ok += 1; G.casLevFix(w, D0); assert.strictEqual(w.lev.cr.pts, 1);
  w.loan.ok += 3; G.casLevFix(w, D0); assert.strictEqual(w.lev.cr.pts, 1, "壹天最多 +1");
  G.casLevFix(w, addDay(D0, 1)); assert.strictEqual(w.lev.cr.pts, 1, "沒有新的準時還款不加");
  w.loan.ok += 1; G.casLevFix(w, addDay(D0, 1)); assert.strictEqual(w.lev.cr.pts, 2);
  assert.strictEqual(G.casLevCreditAdd(w, addDay(D0, 1)), 0, "那天加過了");
  assert.strictEqual(G.casLevCreditAdd(w, addDay(D0, 2)), 1, "定存／館債到期也 +1"); assert.strictEqual(w.lev.cr.pts, 3);
  w.loan.late += 1; G.casLevFix(w, addDay(D0, 3)); assert.strictEqual(w.lev.cr.pts, 0, "−3 剛好 0");
  w.loan.late += 2; G.casLevFix(w, addDay(D0, 3)); assert.strictEqual(w.lev.cr.pts, 0, "不會變負");
  for (const [pts, lv] of [[0, 0], [4, 0], [5, 1], [24, 4], [25, 5], [50, 10], [999, 10]]) { w.lev.cr.pts = pts; assert.strictEqual(G.casLevLevel(w), lv, pts + " 點"); }
  assert.strictEqual(G.casLevPosLimit(0), 20000000); assert.strictEqual(G.casLevPosLimit(5), 40000000); assert.strictEqual(G.casLevPosLimit(10), 60000000);
  assert.strictEqual(G.casLevProfitCap(0), 10000000); assert.strictEqual(G.casLevProfitCap(10), 30000000);
  const t = fresh(G), big = () => G.casLevOpen(t.w, t.h, { id: TW, side: "long", lev: 5, qty: 250 }, D0, at(D0, 10), fakeSrc({ px: { [TW]: 100000 }, idx: 0 }));
  assert.ok(!big().ok, "2,500 萬，0 級不行");
  t.w.lev.cr.pts = 25; const hi = big(); assert.ok(hi.ok, hi.reason);
});

T("畫面：lev、positions、credit 的形狀，數字跟部位對得上；不改任何東西", G => {
  const s = fresh(G), P = { day: D0, px: { [IN]: 1000, [TW]: 100000 }, idx: 3 };
  assert.ok(G.casLevOpen(s.w, s.h, { id: IN, side: "long", lev: 5, qty: 100 }, D0, at(D0, 6), fakeSrc(P)).ok);
  assert.ok(G.casLevOpen(s.w, s.h, { id: TW, side: "short", lev: 3, qty: 3 }, D0, at(D0, 10), fakeSrc(P)).ok);
  P.px[IN] = 950; P.px[TW] = 99000; P.idx = 4;
  const before = JSON.stringify(s.w), v = G.casStockLevView(s.w, s.h, D0, at(D0, 11), fakeSrc(P));
  assert.strictEqual(JSON.stringify(s.w), before, "view 不改錢包");
  assert.strictEqual(v.lev.max, 5); assert.strictEqual(v.lev.opensLeft, 1); assert.strictEqual(v.lev.fee, 0.005); assert.strictEqual(v.lev.interest, 0.0015); assert.strictEqual(v.lev.borrow, 0.003); assert.strictEqual(v.lev.force, 0.5); assert.ok(v.lev.rule.length > 10);
  assert.strictEqual(v.positions.length, 2);
  const a = v.positions[0], b = v.positions[1];
  for (const k of ["no", "id", "name", "market", "side", "lev", "qty", "entry", "margin", "now", "pnl", "maintPct", "liqPx", "openedDay", "dayTrade"]) assert.ok(k in a, k);
  assert.strictEqual(a.market, "in"); assert.strictEqual(a.side, "long"); assert.strictEqual(a.now, 950); assert.strictEqual(a.pnl, -5000); assert.strictEqual(a.maintPct, 75); assert.strictEqual(a.liqPx, 900); assert.strictEqual(a.dayTrade, true); assert.strictEqual(a.openedDay, D0);
  assert.strictEqual(b.market, "tw"); assert.strictEqual(b.side, "short"); assert.strictEqual(b.pnl, 3000); assert.ok(b.liqPx > b.entry);
  assert.strictEqual(J(Object.keys(v.credit)), J(["level", "name", "maxLev", "next", "nextUnlock", "nextText", "why", "pts", "posLimit", "posUsed"]));
  assert.strictEqual(v.credit.level, 0); assert.strictEqual(v.credit.maxLev, 5); assert.strictEqual(v.credit.next, 5); assert.strictEqual(v.credit.posLimit, 20000000); assert.strictEqual(v.credit.posUsed, 100000 + 300000);
  assert.strictEqual(typeof v.credit.name, "string");
  assert.strictEqual(G.casLevTakeNotes(s.w).length, 0);
});

T("台股真的用莊家的資料：house.stk 的盤中價、path 跟 now 一致；開倉、強平、收盤自動平倉、還沒開盤不能開", G => {
  const s = fresh(G), op = G.casBookOpening(snap(s)), h = s.h, SH = G.casStockHouseFix(h), T0 = SH.tw;
  T0.day = D0; T0.st = "open"; T0.from = 0; T0.idx = 30; T0.ser = { [TW]: Array.from({ length: 31 }, (_, i) => 100000 + i * 10) }; SH.px[TW] = 100300;
  const t = at(D0, 9, 30), src = G.casLevSrc(h, D0, t, SEC); assert.strictEqual(src.now(TW).px, 100300); assert.strictEqual(src.now(TW).idx, 30); assert.ok(src.now(TW).open);
  const r = G.casLevOpen(s.w, h, { id: TW, side: "long", lev: 5, qty: 10 }, D0, t, src); assert.ok(r.ok, r.reason); assert.strictEqual(r.pos.chk, 30);
  T0.idx = 60; T0.ser[TW] = T0.ser[TW].concat(Array.from({ length: 30 }, (_, i) => 100300 - (i + 1) * 1000)); SH.px[TW] = 100300 - 30000; // 一路跌到 −30%
  const t2 = at(D0, 10), o = G.casLevSweep(s.w, h, D0, t2, G.casLevSrc(h, D0, t2, SEC));
  assert.strictEqual(o.length, 1); assert.strictEqual(o[0].why, "liq"); assert.ok(o[0].px <= G.casLevLiqPx(r.pos), "第壹個碰到的價"); assert.ok(o[0].px > G.casLevLiqPx(r.pos) - 1001, "是路上第壹個碰到的，不是最後的價");
  assert.strictEqual(G.casBookGap(snap(s), op), 0);
  const r2 = G.casLevOpen(s.w, h, { id: TW, side: "short", lev: 2, qty: 10 }, D0, at(D0, 10, 30), G.casLevSrc(h, D0, at(D0, 10, 30), SEC));
  assert.ok(r2.ok, r2.reason);
  T0.st = "closed"; const t3 = at(D0, 13, 31), o2 = G.casLevSweep(s.w, h, D0, t3, G.casLevSrc(h, D0, t3, SEC));
  assert.strictEqual(o2.length, 1); assert.strictEqual(o2[0].why, "flat"); assert.strictEqual(o2[0].px, T0.ser[TW][T0.ser[TW].length - 1]);
  assert.strictEqual(G.casBookGap(snap(s), op), 0);
  T0.st = "pending"; assert.ok(!G.casLevOpen(s.w, h, { id: TW, side: "long", lev: 2, qty: 1 }, D0, at(D0, 9, 5), G.casLevSrc(h, D0, at(D0, 9, 5), SEC)).ok, "還沒開盤不能開");
});

T("價位換成真實比例（2.8h，house.stk.peg.ev）：開著的台股槓桿單用換之前最後看到的價平倉，不會拿新比例的價跟舊的開倉價比；之後開的單不受影響；帳對得上", G => {
  const s = fresh(G), op = G.casBookOpening(snap(s)), h = s.h, SH = G.casStockHouseFix(h), T0 = SH.tw;
  T0.day = D0; T0.st = "open"; T0.from = 0; T0.idx = 5; T0.ser = { [TW]: [100000, 100100, 100200, 100300, 100400, 100500] }; SH.px[TW] = 100500;
  const t = at(D0, 9, 5), r = G.casLevOpen(s.w, h, { id: TW, side: "long", lev: 5, qty: 10 }, D0, t, G.casLevSrc(h, D0, t, SEC)); assert.ok(r.ok, r.reason);
  // 價位換成 ×24 之類的新比例：收盤價變了很多倍；沒處理的話會被當成賺爆（或賠光）
  SH.peg.seq += 1; SH.peg.ev.push({ seq: SH.peg.seq, id: TW, from: 100500, to: 250000 });
  T0.idx = 8; T0.ser[TW] = T0.ser[TW].concat([250000, 251000, 252000]); SH.px[TW] = 252000;
  const t2 = at(D0, 9, 8), out = G.casLevSweep(s.w, h, D0, t2, G.casLevSrc(h, D0, t2, SEC));
  assert.strictEqual(out.length, 1); assert.strictEqual(out[0].why, "flat"); assert.strictEqual(out[0].px, 100500, "換之前最後看到的價"); assert.strictEqual(out[0].pnl, 0);
  assert.strictEqual(s.w.lev.pos.length, 0); assert.strictEqual(G.casBookGap(snap(s), op), 0);
  const r2 = G.casLevOpen(s.w, h, { id: TW, side: "short", lev: 2, qty: 1 }, D0, at(D0, 9, 30), G.casLevSrc(h, D0, at(D0, 9, 30), SEC)); assert.ok(r2.ok, r2.reason);
  assert.strictEqual(r2.pos.peg, SH.peg.seq);
  assert.strictEqual(G.casLevSweep(s.w, h, D0, at(D0, 9, 31), G.casLevSrc(h, D0, at(D0, 9, 31), SEC)).length, 0, "換比例以後才開的不受影響");
});
T("亂數壓力：館內股和台股一起、隨機開平、隨機價格路徑、多個錢包，全館的錢永遠對得上；鎖住的保證金永遠等於部位的保證金總和", G => {
  let x = 7; const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  const house = G.casHouseFix(G.casHouseNew(), D0).house; house.bankroll = 300000000;
  const ws = [0, 1, 2].map(() => { const w = G.casWalletFix(G.casWalletNew(), D0); w.chips = 100000000; return w; });
  const snapAll = () => G.casBookSnap(ws, house, 0, null), op = G.casBookOpening(snapAll());
  const ids = [IN, "bj", TW, "trianglepower"]; let opened = 0, liqs = 0;
  for (let d = 0; d < 12; d++) {
    const day = addDay(D0, d), ser = {};
    for (const id of ids) { let p = id === IN || id === "bj" ? 10000 : 100000; ser[id] = [p]; for (let i = 1; i < 60; i++) { p = Math.max(1, Math.round(p * (1 + (rnd() - 0.5) * (rnd() < 0.05 ? 0.5 : 0.04)))); ser[id].push(p); } }
    for (let i = 0; i < 59; i += 1 + Math.floor(rnd() * 4)) {
      const P = { day, idx: i, px: Object.fromEntries(ids.map(id => [id, ser[id][i]])), ser, open: true }, t = at(day, 6) + i * 60000 * 15;
      for (const w of ws) {
        if (rnd() < 0.5 && G.casLevOpen(w, house, { id: ids[Math.floor(rnd() * 4)], side: rnd() < 0.5 ? "long" : "short", lev: 1 + Math.floor(rnd() * 5), qty: 1 + Math.floor(rnd() * 200) }, day, t, fakeSrc(P)).ok) opened++;
        liqs += G.casLevSweep(w, house, day, t, fakeSrc(P)).filter(r => r.why === "liq").length;
        if (w.lev.pos.length && rnd() < 0.3) G.casLevClose(w, house, w.lev.pos[0].no, day, t, fakeSrc(P));
        assert.strictEqual(w.lev.hold, w.lev.pos.reduce((a, p) => a + p.margin, 0));
      }
      assert.strictEqual(G.casBookGap(snapAll(), op), 0, `第 ${d} 天第 ${i} 個價`);
    }
    const Pc = { day, idx: 59, px: Object.fromEntries(ids.map(id => [id, ser[id][59]])), ser, open: false, close: Object.assign({ day }, Object.fromEntries(ids.map(id => [id, ser[id][59]]))) };
    for (const w of ws) G.casLevSweep(w, house, day, at(day, 23, 59), fakeSrc(Pc));
    assert.ok(ws.every(w => w.lev.pos.length === 0), "收盤後沒有留倉");
    assert.strictEqual(G.casLevHouseFix(house).in, 0); assert.strictEqual(G.casBookGap(snapAll(), op), 0, `第 ${d} 天收盤`);
  }
  assert.ok(opened > 30 && liqs > 0, `真的有開有強平（開 ${opened}、強平 ${liqs}）`);
});
T("舊錢包／壞資料：沒有 lev 欄位補得出來；壞的部位被丟掉；bkHeld 算進鎖住的保證金", G => {
  const w = G.casWalletFix(G.casWalletNew(), D0); delete w.lev; const S = G.casLevFix(w); assert.strictEqual(J(S.pos), "[]");
  w.lev = { pos: [null, { id: "zzz", qty: 1 }, { no: 3, id: IN, side: "long", lev: 2, qty: 5, entry: 100, notional: 500, margin: 250, day: D0 }], hold: 99999, cr: "x", notes: [1, "a"] };
  const S2 = G.casLevFix(w, D0); assert.strictEqual(S2.pos.length, 1); assert.strictEqual(S2.hold, 250, "鎖住的錢永遠由部位算出來"); assert.strictEqual(S2.cr.pts, 0); assert.strictEqual(J(S2.notes), '["a"]');
  const h = G.casHouseFix(G.casHouseNew(), D0).house; assert.strictEqual(G.casBookSnap([w], h, 0, null).bank, 250);
  assert.strictEqual(G.casLevHouseFix({ bankroll: 5 }).in, 0);
});
T("畫面平倉的單號 p3 要解得出來（11-14 實測：伺服器把 p3 解成 NaN，平倉鈕永遠找不到部位）", G => {
  assert.strictEqual(G.casLevPidNo("p3"), 3); assert.strictEqual(G.casLevPidNo("p12"), 12); assert.strictEqual(G.casLevPidNo("D7"), 7); assert.strictEqual(G.casLevPidNo(5), 5);
  assert.ok(Number.isNaN(G.casLevPidNo(null)) && Number.isNaN(G.casLevPidNo("")));
});
console.log(`casino_stock_lev.test：${pass} 過，${fail} 沒過`);
if (fail) process.exit(1);
