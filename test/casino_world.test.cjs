// 外面世界的池子（11-14，規劃 2.12）：node test/casino_world.test.cjs（npm test 也會跑）
// 錢進出外面世界是搬（買股、賣股、槓桿、門票、貸款、還款、撥款），只有每天成長是憑空；吃緊時賣出有上限、暫停貸款；文化部借款計利息；日報有一段「跟外面世界的往來」。數字讀 NUM。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.NUM.casino.grants = []; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const D0 = "2026-11-14", D1 = "2026-11-15", ID = "greeneye", TW = Date.parse(D0 + "T21:40:00+08:00");
const add = (d, n) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const mk = (G, chips = 500000000) => { const w = G.casWalletFix(G.casWalletNew(), D0), house = G.casHouseFix(G.casHouseNew(), D0).house; w.chips = chips; G.casStockHouseFix(house); G.casStockRoll(house, D0, {}); return { w, house }; };
const inv = (G, s) => { const sn = G.casBookSnap([s.w], s.house, 0, null); return G.casBookTotal(sn) - G.casBookMinted(sn) + G.casBookBurned(sn); };

T("新莊家有外面世界的池子（起始 100 億）；舊莊家第壹次碰到補上；算進全館總和", G => {
  const h = G.casHouseFix(G.casHouseNew(), D0).house; assert.strictEqual(h.world, G.NUM.casino.world.start);
  const old = G.casHouseFix({ v: 1, bankroll: 5 }, D0).house; assert.strictEqual(old.world, G.NUM.casino.world.start);
  const s = G.casBookSnap([], h, 0, null); assert.ok(G.casBookTotal(s) >= G.NUM.casino.world.start);
});
T("買股錢給外面世界、賣股外面世界付：池子跟著變，不是憑空也不是燒掉，總帳不變", G => {
  const s = mk(G), t0 = inv(G, s), w0 = s.house.world;
  const b = G.casStockBuy(s.w, s.house, ID, 100, D0, null); assert.ok(b.ok);
  assert.strictEqual(s.house.world, w0 + b.cost, "買：池子多了股價");
  assert.strictEqual(inv(G, s), t0, "守恆");
  const r = G.casStockSell(s.w, s.house, ID, "max", D0, null); assert.ok(r.ok);
  assert.strictEqual(s.house.world, w0 + b.cost - r.gross, "賣：池子少了賣出金額");
  assert.strictEqual(inv(G, s), t0, "守恆");
  assert.ok(!s.w.led.mint.stockSell && !s.w.led.burn.stockBuy, "不再是憑空／消失");
});
T("每天成長（真正憑空）：growBase ×（1 ＋ growExtPct% × 景氣）；記 mint.worldGrow；總帳守恆（成長算憑空）", G => {
  const WC = G.NUM.casino.world, h = G.casHouseFix(G.casHouseNew(), D0).house; h.econ.b = 1;
  const t0 = (() => { const s = G.casBookSnap([], h, 0, null); return G.casBookTotal(s) - G.casBookMinted(s) + G.casBookBurned(s); })();
  const r = G.casHouseFix(h, D1).house;
  assert.strictEqual(r.world, WC.start + Math.floor(WC.growBase * (1 + WC.growExtPct / 100)), "景氣 +1：多 20%");
  assert.strictEqual(r.led.mint.worldGrow, r.world - WC.start);
  const s1 = G.casBookSnap([], r, 0, null); assert.strictEqual(G.casBookTotal(s1) - G.casBookMinted(s1) + G.casBookBurned(s1), t0, "守恆");
  const h2 = G.casHouseFix(G.casHouseNew(), D0).house; h2.econ.b = -1; assert.strictEqual(G.casHouseFix(h2, D1).house.world, WC.start + Math.floor(WC.growBase * (1 - WC.growExtPct / 100)), "景氣 −1：少 20%");
});
T("池子吃緊（低於起始的 10%）：賣出壹天最多付池子的 1%，超過擋掉；買股照收；暫停貸款給莊家", G => {
  const WC = G.NUM.casino.world, s = mk(G, 5e9);
  const b = G.casStockBuy(s.w, s.house, ID, 1500, D0, null); assert.ok(b.ok);
  s.house.world = Math.floor(WC.start * WC.lowPct / 100) - 1; // 吃緊
  assert.ok(G.casWorldLow(s.house, WC));
  const room = G.casWorldRoom(s.house, WC), cap = Math.floor(s.house.world * WC.lowPayPct / 100);
  assert.strictEqual(room, cap, "上限 ＝ 池子的 1%");
  const r = G.casStockSell(s.w, s.house, ID, "max", D0, null);
  assert.ok(!r.ok && /吃緊/.test(r.reason), "超過上限的賣出擋掉：" + r.reason);
  const w0 = s.house.world, b2 = G.casStockBuy(s.w, s.house, ID, 1, D0, null); assert.ok(b2.ok); assert.strictEqual(s.house.world, w0 + b2.cost, "買股照收");
  // 貸款暫停
  const h = G.casHouseFix(G.casHouseNew(), D0).house; h.bankroll = -50000000; h.world = Math.floor(WC.start * WC.lowPct / 100 / 2); h.budget = 0; // 成長 500 萬後還是吃緊
  const r2 = G.casHouseFix(h, D1).house; assert.strictEqual(r2.debt.world, 0, "吃緊時不貸款"); assert.ok(r2.bankroll < 0);
});
T("文化部持有的館債：每天計利息（cultureInterestPct），莊家賺了還的錢回到外面世界", G => {
  const H = G.NUM.casino.houseLoan, WC = G.NUM.casino.world, h = G.casHouseFix(G.casHouseNew(), D0).house; h.debt.culture = 1000000000; h.bankroll = H.reserve;
  const r = G.casHouseFix(h, D1).house;
  assert.strictEqual(r.debt.culture, 1000000000 + Math.ceil(1000000000 * H.cultureInterestPct / 100), "壹天的利息計進債");
  h.bankroll = H.reserve + 400000000; const w0 = h.world;
  const r2 = G.casHouseFix(h, add(D1, 1)).house;
  assert.ok(r2.world > w0, "還的錢進外面世界");
});
T("日報：有「跟外面世界的往來」一段（現在多少、進出的來源）和「真的憑空來的、真的消失的」", G => {
  const s = mk(G); const b = G.casStockBuy(s.w, s.house, ID, 100, D0, null); assert.ok(b.ok);
  const snap0 = G.casBookSnap([s.w], mk(G).house, 0, D0), snap1 = G.casBookSnap([s.w], s.house, 0, D1);
  const doc = { day: D1, at: 0, snap: snap1, diff: G.casBookDiff(snap0, snap1), opening: 0 };
  const v = G.casReportView(doc), txt = v.secs.map(x => x.t + "|" + x.lines.join("|")).join("\n");
  assert.ok(txt.includes("跟外面世界的往來"), txt); assert.ok(txt.includes("買股票"), "進外面世界的來源");
  assert.ok(txt.includes("真的憑空來的、真的消失的"));
});
console.log(`${pass} passed, ${fail} failed（外面世界的池子）`);
process.exit(fail ? 1 : 0);
