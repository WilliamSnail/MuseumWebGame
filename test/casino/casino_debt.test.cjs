// 賣股還債（決定 0093 第 2 件，shared/casino/debt.js）：node test/casino/casino_debt.test.cjs（npm test 也會跑）
// 不受壹人壹天賣出上限、賣的錢先補錢包的負數再照到期順序還借款、最多賣到剛好夠還、手續費稅照舊、不算進今天賣出的額度、帳對得上。館外股、館內股都能賣。
const assert = require("assert");
const { load: load0 } = require("../load_shared.cjs");
const load = (...a) => { const G = load0(...a); G.NUM.casino.stockIn.mkt.on = false; return G; }; // 這份測舊的算好的曲線（真的市場在 test/stock/in_market.test.cjs，決定 0113）
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.US_IDS.length = 0; G.NUM.casino.grants = []; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const D = "2026-11-14", ID = "greeneye", SEC = "debt-secret";
const at = (d, h) => Date.parse(`${d}T${String(h).padStart(2, "0")}:30:00+08:00`);
const OPEN = at(D, 14);
const fresh = G => { const w = G.casWalletFix(G.casWalletNew(), D), house = G.casHouseFix(G.casHouseNew(), D).house; w.chips = 5000000000; G.casStockHouseFix(house); return { w, house }; };
const opening = (G, s) => G.casBookOpening(G.casBookSnap([s.w], s.house, 0, null));
const gap = (G, s, op) => G.casBookGap(G.casBookSnap([s.w], s.house, 0, null), op);

T("沒有欠款：擋掉；欠款是錢包的負數：賣超過壹天上限也行，賣到剛好夠還、帳對得上、不算進今天賣出的額度", G => {
  G.NUM.casino.stock.sellDay = 20000000; const s = fresh(G); G.casStockBuy(s.w, s.house, ID, 15000, D, OPEN); // 約 1.5 億的股票（上限打開來測：決定 0154 起預設不限）
  assert.ok(!G.casSellForDebt(s.w, s.house, ID, "max", D, OPEN).ok, "沒欠款擋掉"); assert.strictEqual(G.casDebtOwed(s.w, OPEN).total, 0);
  s.w.chips = -60000000; const op = opening(G, s), cap = G.casSellCap(s.w);
  assert.strictEqual(G.casDebtOwed(s.w, OPEN).neg, 60000000); assert.ok(60000000 > cap, "欠的比壹天上限大");
  assert.ok(!G.casStockSell(s.w, s.house, ID, 6000, D, OPEN).ok, "普通賣：超過上限被擋");
  const r = G.casSellForDebt(s.w, s.house, ID, "max", D, OPEN); assert.ok(r.ok, r.reason);
  assert.ok(s.w.chips >= 0 && s.w.chips < G.NUM.casino.stock.start * 2, "賣到剛好夠還：錢包回到 0 附近：" + s.w.chips); assert.strictEqual(r.left, 0);
  assert.strictEqual(gap(G, s, op), 0, "帳對得上"); assert.strictEqual(G.casStockFix(s.w).sold.n, 0, "不算進今天賣出的額度");
  assert.ok(r.gross > cap, "賣的比壹天上限多"); assert.ok(r.fee > 0, "手續費照收");
});
T("欠借款：照到期順序還清壹筆壹筆；賣的錢先補負數；多的留在錢包；莊家的借款記帳回來；帳對得上", G => {
  const s = fresh(G); G.casStockBuy(s.w, s.house, ID, 3000, D, OPEN);
  const t0 = OPEN - G.NUM.casino.loan.repayAfterMin * 60000 - 60000;
  const a = G.casBorrow(s.w, 300000, D, false, t0, s.house), b = G.casBorrow(s.w, 300000, D, false, t0, s.house); assert.ok(a.ok && b.ok, "借兩筆");
  s.w.chips = 0; s.house.loansOut = s.w.loan.list.reduce((x, y) => x + y.amt, 0);
  const op = opening(G, s), owed = G.casDebtOwed(s.w, OPEN); assert.strictEqual(owed.loans.length, 2); assert.strictEqual(owed.total, owed.loans[0].owe + owed.loans[1].owe);
  const r = G.casSellForDebt(s.w, s.house, ID, "max", D, OPEN); assert.ok(r.ok, r.reason);
  assert.strictEqual(s.w.loan.list.length, 0, "兩筆都還清了"); assert.strictEqual(r.paidLoans.length, 2); assert.strictEqual(r.left, 0); assert.strictEqual(s.house.loansOut, 0, "莊家的借款收回來了");
  assert.ok(s.w.chips >= 0 && s.w.chips < G.NUM.casino.stock.start, "剩下的零頭留在錢包"); assert.strictEqual(gap(G, s, op), 0);
});
T("股數：超過欠款要賣的股數會擋；給 1 股只賣 1 股、還不夠還就還剩欠款；還沒到可以還的借款不算欠款", G => {
  const s = fresh(G); G.casStockBuy(s.w, s.house, ID, 3000, D, OPEN); s.w.chips = -500000;
  const too = G.casSellForDebt(s.w, s.house, ID, 3000, D, OPEN); assert.ok(!too.ok && /賣得太多了/.test(too.reason), too.reason);
  const one = G.casSellForDebt(s.w, s.house, ID, 1, D, OPEN); assert.ok(one.ok); assert.strictEqual(one.n, 1); assert.ok(one.left > 0 && one.left < 500000, "只賣 1 股：欠款剩下壹些：" + one.left);
  assert.ok(!G.casSellForDebt(s.w, s.house, ID, 0, D, OPEN).ok); assert.ok(!G.casSellForDebt(s.w, s.house, "亂寫", "max", D, OPEN).ok); assert.ok(!G.casSellForDebt(s.w, s.house, "handbrain", "max", D, OPEN).ok, "沒有這支");
  const s2 = fresh(G); G.casStockBuy(s2.w, s2.house, ID, 100, D, OPEN); const b = G.casBorrow(s2.w, 1000000, D, false, OPEN, s2.house); assert.ok(b.ok); s2.w.chips = 10;
  assert.strictEqual(G.casDebtOwed(s2.w, OPEN + 60000).total, 0, "借了還沒幾分鐘：還不能還，不算欠款"); assert.strictEqual(G.casDebtView(s2.w, OPEN + 60000).can, false);
  assert.ok(G.casDebtOwed(s2.w, OPEN + G.NUM.casino.loan.repayAfterMin * 60000 + 1).total > 0);
});
T("館內股也能賣還債：不受壹人壹天上限和全館淨賣出上限；莊家付、借款還給莊家；帳對得上", G => {
  G.NUM.casino.stock.sellDay = 2000000; const h = G.casHouseFix(G.casHouseNew(), D).house; h.bankroll = 100000000000; G.casInRoll(h, D, 0, SEC);
  const w = G.casWalletFix(G.casWalletNew(), D); w.chips = 5000000000; const s = { w, house: h };
  const id = G.IN_IDS[0], buy = G.casInBuy(w, h, id, 400, D, null, SEC); assert.ok(buy.ok, buy.reason);
  G.NUM.casino.stock.netSellPct = 0; G.NUM.casino.stock.netSellFlat = 1000000; w.chips = -3000000; const op = opening(G, s);
  assert.ok(!G.casInSell(w, h, id, 400, D, null).ok, "普通賣：超過上限被擋");
  const net0 = G.casInHouseFix(h).net.n; const r = G.casSellForDebt(w, h, id, "max", D, null); assert.ok(r.ok, r.reason); assert.ok(w.chips >= 0 && r.left === 0); assert.strictEqual(gap(G, s, op), 0);
  assert.strictEqual(G.casInFix(w).sold.n, 0, "不算進今天賣出"); assert.strictEqual(G.casInHouseFix(h).net.n, net0, "不算進全館淨賣出（跟賣之前一樣）");
});
T("view：欠款有多少、能不能賣股還債（給銀行頁用）", G => {
  const s = fresh(G); assert.strictEqual(G.casDebtView(s.w, OPEN).can, false); s.w.chips = -1; const v = G.casDebtView(s.w, OPEN); assert.ok(v.can && v.owed === 1 && v.neg === 1);
});
T("訊息的空格：數字前面有空格、單位（萬、億）後面不接空格再接中文字、中文字直接黏著數字的不行（欠 0、欠 149 萬、欠 6.22 萬都對）", G => {
  const ok = t => { assert.ok(!/[一-鿿]d/.test(t), "中文字黏著數字：" + t); assert.ok(!/[萬億] [一-鿿]/.test(t), "單位後面多空格：" + t); assert.ok(!/d [一-鿿]/.test(t.replace(/d+ 股/g, "")), "數字後面多空格：" + t); };
  for (const [paid, left] of [[0, 0], [1490000, 0], [62200, 500000]]) ok(G.casFill(G.CAS_DEBT.done, { n: G.casNum(12), net: G.casNum(paid + 10), paid: G.casNum(paid), left: G.casNum(left) }));
  ok(G.casFill(G.CAS_DEBT.tooMany, { owed: G.casNum(1490000), n: G.casNum(3000), max: G.casNum(80) }));
  const s = fresh(G); G.casStockBuy(s.w, s.house, ID, 3000, D, OPEN); s.w.chips = -500000; const r = G.casSellForDebt(s.w, s.house, ID, "max", D, OPEN); assert.ok(r.ok); ok(r.lines[r.lines.length - 1]);
});
console.log(`賣股還債：${pass} 過，${fail} 沒過`); process.exit(fail ? 1 : 0);
