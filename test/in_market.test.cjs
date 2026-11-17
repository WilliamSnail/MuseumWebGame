// 館內股真的市場（決定 0113）：node test/in_market.test.cjs（npm test 也會跑）
// 價格由買賣推：旅客散客照各店每個價到店的人數下單；造市商接；漲跌停；開盤 ＝ 昨天收盤；館友買賣有衝擊；守恆。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.NUM.casino.grants = []; G.NUM.casino.stockIn.mkt.on = true; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const SEC = "mkt-secret", D0 = "2026-11-16", add = (d, n) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const at = (day, hh, mm = 0) => { const [y, m, d] = day.split("-").map(Number); return Date.UTC(y, m - 1, d, hh - 8, mm); };
const house = (G, bank = 1000000000) => { const h = G.casHouseFix(G.casHouseNew(), D0).house; h.bankroll = bank; return h; };
const wallet = (G, chips = 500000000) => { const w = G.casWalletFix(G.casWalletNew(), D0); w.chips = chips; return w; };
const ctx = G => ({ list: G.NPC_ROSTER, counters: null });
const snap = (G, w, h) => G.casBookSnap([w], h, 0, null);
// 跑 n 天（每天換日，旅客散客照時刻表下單）
const run = (G, h, n, from = D0) => { for (let i = 0; i <= n; i++) G.casInRoll(h, add(from, i), 0, SEC, {}, ctx(G)); };

T("資本額：每家發行 Ns 股、view 有資本額、合理價；沒有名單（沒人數）價格只有小雜訊", G => {
  const h = house(G); G.casInRoll(h, D0, 0, SEC); const K = G.NUM.casino.stockIn.mkt;
  const v = G.casInView(wallet(G), h, D0, at(D0, 12), SEC), x = v.list.find(i => i.id === "food");
  assert.strictEqual(x.shares, K.Ns); assert.strictEqual(x.cap, K.Ns * x.price); assert.ok(x.fv > 0); assert.ok(v.mkt && v.mkt.Ns === K.Ns);
  assert.ok(x.intraday.every(p => Math.abs(p / x.intraday[0] - 1) < 0.01), "沒有人數資料：只有很小的雜訊");
});
T("開盤價 ＝ 昨天最後一個價（不跳空）；每個價最多動 tickLim；每天不超過開盤 ± dayLim；價是整數", G => {
  const h = house(G), K = G.NUM.casino.stockIn.mkt; run(G, h, 6);
  const H = G.casInHouseFix(h);
  for (const id of ["food", "bj", "job", "cellar", "craft"]) {
    const ser = H.m.prev.ser[id]; assert.strictEqual(ser.length, 75);
    assert.ok(ser.every(Number.isInteger));
    for (let i = 1; i < ser.length; i++) assert.ok(Math.abs(ser[i] / ser[i - 1] - 1) <= K.tickLim + 0.001, `${id} 第 ${i} 個價動太多：${ser[i - 1]}→${ser[i]}`);
    const op = H.m.prev.ser[id][0]; assert.ok(ser.every(p => Math.abs(p / op - 1) <= K.dayLim + K.tickLim + 0.001));
  }
  assert.ok(Object.values(H.close).every(p => p > 0));
});
T("旅客散客真的下單：有人的店成交多、價格會動；價格跟人數、合理價有關（模擬 20 天不飄走）", G => {
  const h = house(G); run(G, h, 20); const H = G.casInHouseFix(h);
  const moved = ["food", "bj", "job", "cellar", "craft"].filter(id => new Set(H.m.prev.ser[id]).size > 5);
  assert.ok(moved.length >= 3, "至少三家的價在動：" + moved.join(","));
  for (const id of Object.keys(H.open)) { const gap = Math.abs(Math.log(H.close[id] / H.open[id])); assert.ok(gap < 0.25, `${id} 離合理價太遠：價 ${H.close[id]} 合理價 ${H.open[id]}`); }
});
T("惰性推進：不管誰先碰、碰幾次，同一個種子的價一樣；重複碰不改價", G => {
  const mk = () => { const h = house(G); G.casInRoll(h, D0, 0, SEC, {}, ctx(G)); return h; };
  const a = mk(), b = mk();
  for (let hh = 6; hh <= 22; hh += 4) G.casInPrice(a, "food", D0, at(D0, hh), SEC);
  G.casInPrice(b, "food", D0, at(D0, 22), SEC);
  assert.deepStrictEqual(Array.from(G.casInHouseFix(a).m.ser.food), Array.from(G.casInHouseFix(b).m.ser.food), "分幾次推 ＝ 一次推");
  const s0 = JSON.stringify(G.casInHouseFix(a).m.ser); G.casInPrice(a, "food", D0, at(D0, 22), SEC); G.casInView(wallet(G), a, D0, at(D0, 22), SEC); assert.strictEqual(JSON.stringify(G.casInHouseFix(a).m.ser), s0);
});
T("館友買：價格往上、成交價含半個價差和衝擊的一半；來回一次虧；超過漲跌停被擋並說最多幾股；帳守恆", G => {
  const h = house(G), w = wallet(G); run(G, h, 2); const day = add(D0, 2), t = at(day, 10, 7), K = G.NUM.casino.stockIn.mkt;
  const op = G.casBookOpening(snap(G, w, h)), p0 = G.casInPrice(h, "job", day, t, SEC).px, H = G.casInHouseFix(h);
  const r = G.casInBuy(w, h, "job", 100, day, t, SEC); assert.ok(r.ok, r.reason);
  assert.ok(r.px > p0, "成交價 ≥ 現價（含價差）：" + r.px + " vs " + p0); assert.ok(H.m.P.job > p0 * 0.999, "報價往上");
  assert.strictEqual(G.casBookGap(snap(G, w, h), op), 0, "買完守恆");
  const s = G.casInSell(w, h, "job", 100, day, t, SEC); assert.ok(s.ok, s.reason);
  assert.ok(s.net < r.cost + r.fee, "來回一次一定虧（價差、手續費、稅）"); assert.strictEqual(G.casBookGap(snap(G, w, h), op), 0, "賣完守恆");
  const big = G.casInBuy(w, h, "cellar", 1000, day, t, SEC); assert.ok(!big.ok && /漲停|上限|最多還能買/.test(big.reason), big.reason);
  const m = /最多還能買 ([\d,]+) 股/.exec(big.reason); if (m) { const n = +m[1].replace(/,/g, ""); assert.ok(n > 0 && n < 1000); assert.ok(G.casInBuy(w, h, "cellar", n, day, t, SEC).ok, "說的那個數可以買"); }
});
T("拉高出貨賺不到：一口氣買到漲停、等回補再賣，扣掉價差、手續費、稅是賠的", G => {
  const h = house(G), w = wallet(G); run(G, h, 3); const day = add(D0, 3), c0 = w.chips;
  G.casInPrice(h, "food", day, at(day, 9), SEC);
  let bought = 0; for (const n of [300, 200, 100]) { const r = G.casInBuy(w, h, "food", n, day, at(day, 9, 1), SEC); if (r.ok) bought += r.n; }
  assert.ok(bought > 0);
  const out = G.casInSell(w, h, "food", "max", day, at(day, 18), SEC); assert.ok(out.ok, out.reason);
  assert.ok(w.chips < c0, "拉高出貨淨虧：" + (w.chips - c0));
});
T("錢：旅客散客的買賣走外面世界 ↔ 莊家（來源 inMarket），守恆；莊家沒錢時付得出的部分", G => {
  const h = house(G), w = wallet(G); const op = G.casBookOpening(snap(G, w, h)); run(G, h, 12);
  assert.strictEqual(G.casBookGap(snap(G, w, h), op), 0, "跑 12 天守恆");
  assert.ok(h.led && h.led.world && typeof h.led.world.inMarket === "number", "世界帳有 inMarket");
  const poor = house(G, 0), op2 = G.casBookOpening(snap(G, w, poor)); run(G, poor, 5);
  assert.strictEqual(G.casBookGap(snap(G, w, poor), op2), 0); assert.ok(poor.bankroll >= 0, "莊家沒錢不會被扣成負的：" + poor.bankroll);
});
T("掛單、槓桿讀得到新的價序列（昨天整天、今天到現在）；舊資料第一次進來價格接得上", G => {
  const h = house(G); run(G, h, 3); const day = add(D0, 3), H = G.casInHouseFix(h);
  assert.strictEqual(H.m.prev.day, add(D0, 2)); assert.strictEqual(G.casInSeriesR(H, 0, add(D0, 2), "food", SEC).length, 75);
  G.casInPrice(h, "food", day, at(day, 12), SEC); assert.strictEqual(G.casInSeriesR(H, 0, day, "food", SEC).length, (12 * 60 - 300) / 15 + 1);
  const old = house(G); const OH = G.casInHouseFix(old); OH.day = D0; OH.open.food = 12345; delete OH.m; // 舊存檔：沒有 m
  const pr = G.casInPrice(old, "food", D0, at(D0, 10), SEC); assert.ok(Math.abs(pr.px / 12345 - 1) < 0.01, "接著舊的開盤價：" + pr.px);
});
console.log(`in_market.test：${pass} 過，${fail} 沒過`); process.exit(fail ? 1 : 0);
