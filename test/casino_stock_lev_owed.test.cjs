// 館內股槓桿：隔天補發（欠條）、新手 2 倍信用升級解鎖（翊文 11-14，規劃 2.8j）：node test/casino_stock_lev_owed.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const D0 = "2026-11-16", IN = "food", TW = "handbrain";
const addDay = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const at = (day, hh, mm = 0) => { const [y, m, d] = day.split("-").map(Number); return Date.UTC(y, m - 1, d, hh - 8, mm); };
const fresh = (G, chips = 500000000, bank = 500000000) => { const h = G.casHouseFix(G.casHouseNew(), D0).house; h.bankroll = bank; const w = G.casWalletFix(G.casWalletNew(), D0); w.chips = chips; return { G, w, h }; };
const snap = s => s.G.casBookSnap([s.w], s.h, 0, null);
const fakeSrc = P => ({
  now: id => ({ px: P.px[id], idx: P.idx, open: P.open !== false }),
  path: (id, d, from) => (P.ser && P.ser[id] && d === P.day ? P.ser[id].slice(from + 1, (P.upto != null ? P.upto : P.idx) + 1) : []),
  close: (id, d) => (P.close && d === P.close.day ? P.close[id] : null),
});
const pos = (G, o) => Object.assign({ no: 1, id: IN, mk: "in", side: "long", lev: 5, qty: 100, entry: 1000, notional: 100000, margin: 20000, fee: 0, day: D0, at: 0, chk: 0, px: 1000 }, o);
const J = JSON.stringify;

// ---------- 11-14 翊文：隔天補發、新手 2 倍（信用升級解鎖）。這幾項用真正的 levByCredit [[0,2],[2,3],[4,5]]，不套上面的 5× ----------
const T2 = (name, fn) => { const G = load(); G.NUM.casino.grants = []; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const owedSetup = (G, flat = 10000) => { const s = fresh(G), C = G.NUM.casino.stock; C.netSellPct = 0; C.netSellFlat = flat; s.w.lev = null; G.casLevFix(s.w, D0); s.w.lev.cr.pts = 20; return s; }; // 信用 4 級才開得了 5×
const winIn = (s, day, qty, up) => { const G = s.G, P = { day, px: { [IN]: 1000 }, idx: 0 }, r = G.casLevOpen(s.w, s.h, { id: IN, side: "long", lev: 5, qty }, day, at(day, 6), fakeSrc(P)); assert.ok(r.ok, r.reason); P.px[IN] = up; P.idx = 3; return G.casLevClose(s.w, s.h, r.pos.no, day, at(day, 7), fakeSrc(P)); };
T2("隔天補發：館內股賺超過莊家壹天淨賠付上限，多的記欠條（不是丟掉）；欠條不算玩家的錢，帳對得上", G => {
  const s = owedSetup(G), op = G.casBookOpening(snap(s)), bank0 = s.h.bankroll;
  const c = winIn(s, D0, 300, 1050); assert.strictEqual(c.pnl, 10000); assert.strictEqual(c.owed, 5000, "賺 1.5 萬，今天只能付 1 萬");
  assert.strictEqual(J(s.w.lev.owed), J([{ day: D0, amt: 5000 }])); assert.strictEqual(s.h.bankroll, bank0 - 10000, "欠的還在莊家那邊");
  assert.strictEqual(G.casBookGap(snap(s), op), 0, "欠條不是錢，帳不動");
  const v = G.casStockLevView(s.w, s.h, D0, at(D0, 8), fakeSrc({ px: { [IN]: 1050 }, idx: 3 })); assert.strictEqual(v.lev.owed, 5000); assert.ok(v.lev.owedText.includes("5,000") || v.lev.owedText.includes("5000"));
  assert.ok(G.casLevTakeNotes(s.w).some(x => x.includes("先記著")));
  assert.strictEqual(G.casLevPayOwed(s.w, s.h, D0), 0, "同壹天不補發");
});
T2("隔天補發：隔天碰到錢包先付、付完欠條清掉、有訊息；莊家的錢和玩家的錢加起來不變", G => {
  const s = owedSetup(G), op = G.casBookOpening(snap(s)); winIn(s, D0, 300, 1050); G.casLevTakeNotes(s.w);
  const d1 = addDay(D0, 1), c0 = s.w.chips, bank0 = s.h.bankroll, sw = G.casLevSweep(s.w, s.h, d1, at(d1, 6), fakeSrc({ px: { [IN]: 1000 }, idx: 0 }));
  assert.strictEqual(sw.length, 0); assert.strictEqual(s.w.chips, c0 + 5000); assert.strictEqual(s.h.bankroll, bank0 - 5000); assert.strictEqual(s.w.lev.owed.length, 0);
  assert.strictEqual(G.casInHouseFix(s.h).net.n, 5000, "補發也算進莊家今天的淨賠付"); assert.strictEqual(G.casInHouseFix(s.h).net.day, d1);
  assert.ok(G.casLevTakeNotes(s.w).some(x => x.includes("補發")), "有訊息"); assert.strictEqual(G.casBookGap(snap(s), op), 0);
  assert.strictEqual(G.casStockLevView(s.w, s.h, d1, at(d1, 7), fakeSrc({ px: { [IN]: 1000 }, idx: 0 })).lev.owed, 0);
});
T2("隔天補發：可以只付壹部分、最舊的先付；今天的額度被別人用掉就不付；莊家 ≤ 0 不付", G => {
  const s = owedSetup(G, 4000), d1 = addDay(D0, 1), d2 = addDay(D0, 2), d3 = addDay(D0, 3), op = G.casBookOpening(snap(s));
  s.w.lev.owed = [{ day: addDay(D0, -1), amt: 3000 }, { day: D0, amt: 5000 }];
  assert.strictEqual(G.casLevPayOwed(s.w, s.h, d1), 4000, "額度 4000：舊的 3000 付清，新的付 1000");
  assert.strictEqual(J(s.w.lev.owed), J([{ day: D0, amt: 4000 }])); assert.strictEqual(G.casLevPayOwed(s.w, s.h, d1), 0, "今天額度用完");
  const keep = s.h.bankroll; s.h.bankroll = 0; assert.strictEqual(G.casLevPayOwed(s.w, s.h, d2), 0, "莊家 ≤ 0 不付"); assert.strictEqual(s.w.lev.owed[0].amt, 4000);
  s.h.bankroll = -500; assert.strictEqual(G.casLevPayOwed(s.w, s.h, d2), 0);
  s.h.bankroll = keep; assert.strictEqual(G.casLevPayOwed(s.w, s.h, d2), 4000); assert.strictEqual(s.w.lev.owed.length, 0);
  const s2 = owedSetup(G, 4000); s2.w.lev.owed = [{ day: D0, amt: 3000 }]; G.casInHouseFix(s2.h).net = { day: d1, n: 3500 }; assert.strictEqual(G.casLevPayOwed(s2.w, s2.h, d1), 500, "別人已經用掉 3500，只剩 500");
  assert.strictEqual(G.casBookGap(snap(s), op), 0, "補發是莊家搬給玩家，總數不變");
});
T2("隔天補發：莊家今天 ≤ 0 時賺的錢整筆記欠條；壞資料的欠條被清掉", G => {
  const s = owedSetup(G), P = { day: D0, px: { [IN]: 1000 }, idx: 0 }, r = G.casLevOpen(s.w, s.h, { id: IN, side: "long", lev: 5, qty: 100 }, D0, at(D0, 6), fakeSrc(P)); assert.ok(r.ok, r.reason);
  s.h.bankroll = 0; P.px[IN] = 1100; P.idx = 3; const c = G.casLevClose(s.w, s.h, r.pos.no, D0, at(D0, 7), fakeSrc(P));
  assert.strictEqual(c.pnl, 0); assert.strictEqual(c.owed, 10000); assert.strictEqual(s.w.lev.owed[0].amt, 10000);
  s.w.lev.owed = [null, { day: "x", amt: 5 }, { day: D0, amt: -3 }, { day: D0, amt: 7 }]; assert.strictEqual(J(G.casLevFix(s.w).owed), J([{ day: D0, amt: 7 }]));
});
T2("倍數跟信用等級：0～1 級 2×、2～3 級 3×、4 級以上 5×；市場上限照樣管", G => {
  const C = G.NUM.casino.stockLev; assert.strictEqual(J(C.levByCredit), J([[0, 2], [2, 3], [4, 5]]));
  const exp = [[0, 2], [1, 2], [2, 3], [3, 3], [4, 5], [10, 5]];
  for (const [lv, m] of exp) { assert.strictEqual(G.casLevMaxLev("in", lv), m, "in " + lv); assert.strictEqual(G.casLevMaxLev("tw", lv), m); assert.strictEqual(G.casLevMaxLev("us", lv), m); }
  C.maxLev.tw = 4; assert.strictEqual(G.casLevMaxLev("tw", 10), 4, "市場上限比較低就用市場的");
  const s = fresh(G), src = fakeSrc({ px: { [IN]: 1000 }, idx: 0 }), t = at(D0, 6);
  const o = lev => G.casLevOpen(s.w, s.h, { id: IN, side: "long", lev, qty: 10 }, D0, t + lev * 1e8, src);
  const bad = o(3); assert.ok(!bad.ok && bad.reason.includes("2×") && bad.reason.includes("信用 2 級"), bad.reason);
  assert.ok(o(2).ok);
  const s2 = fresh(G); s2.w.lev = null; G.casLevFix(s2.w, D0); s2.w.lev.cr.pts = 10; // 2 級
  assert.ok(G.casLevOpen(s2.w, s2.h, { id: IN, side: "long", lev: 3, qty: 10 }, D0, t, src).ok); assert.ok(!G.casLevOpen(s2.w, s2.h, { id: IN, side: "long", lev: 5, qty: 10 }, D0, t + 1e8, src).ok);
  s2.w.lev.cr.pts = 20; assert.ok(G.casLevOpen(s2.w, s2.h, { id: IN, side: "long", lev: 5, qty: 10 }, D0, t + 2e8, src).ok);
});
T2("倍數：畫面的 byMarket、maxLev 跟著目前的信用等級；credit.next 文字說下壹個解鎖；已經開的高倍部位不受影響", G => {
  const s = fresh(G), src = fakeSrc({ px: { [IN]: 1000, [TW]: 100000 }, idx: 0 });
  s.w.lev = null; G.casLevFix(s.w, D0); s.w.lev.pos.push(pos(G, { lev: 5, no: 1 })); s.w.lev.seq = 1; G.casLevFix(s.w, D0);
  let v = G.casStockLevView(s.w, s.h, D0, at(D0, 6), src);
  assert.strictEqual(J(v.lev.byMarket), J({ in: 2, tw: 2, us: 2 })); assert.strictEqual(v.lev.max, 2); assert.strictEqual(v.credit.maxLev, 2);
  assert.strictEqual(J(v.credit.nextUnlock), J({ level: 2, lev: 3, pts: 10 })); assert.ok(v.credit.nextText.includes("3×") && v.credit.nextText.includes("2 級"), v.credit.nextText);
  assert.strictEqual(v.positions.length, 1); assert.strictEqual(v.positions[0].lev, 5, "已經開的 5× 照舊");
  assert.strictEqual(G.casLevSweep(s.w, s.h, D0, at(D0, 6), src).length, 0); assert.strictEqual(s.w.lev.pos[0].lev, 5, "不會被強制改倍數或平倉");
  s.w.lev.cr.pts = 10; v = G.casStockLevView(s.w, s.h, D0, at(D0, 6), src); assert.strictEqual(J(v.lev.byMarket), J({ in: 3, tw: 3, us: 3 })); assert.strictEqual(v.credit.nextUnlock.lev, 5); assert.ok(v.credit.nextText.includes("4 級"));
  s.w.lev.cr.pts = 20; v = G.casStockLevView(s.w, s.h, D0, at(D0, 6), src); assert.strictEqual(v.credit.maxLev, 5); assert.strictEqual(v.credit.nextUnlock, null); assert.ok(v.credit.nextText.includes("全部解鎖"));
});
console.log(`casino_stock_lev_owed.test：${pass} 過，${fail} 沒過`);
if (fail) process.exit(1);
