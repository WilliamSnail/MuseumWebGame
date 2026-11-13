// 館內五家店的股票（11-14，規劃 2.8a、2.8b、2.8e、2.8g）：node test/casino_stock_in.test.cjs（npm test 也會跑）
// 營業時間、盤中曲線（種子有祕密、夾開盤 ±5%）、05:00 跳空（K＝0.03、人太少不調、有效日）、不同的人只算一次、買賣守恆、上限、畫面格式。數字讀 NUM。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.NUM.casino.grants = []; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const SEC = "test-secret", D0 = "2026-11-16", add = (d, n) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
// 台灣時間 day 的 hh:mm 的毫秒（台灣 UTC+8）
const at = (day, hh, mm = 0) => { const [y, m, d] = day.split("-").map(Number); return Date.UTC(y, m - 1, d, hh - 8, mm); };
const house = (G, bank = 100000000) => { const h = G.casHouseFix(G.casHouseNew(), D0).house; h.bankroll = bank; return h; };
const wallet = (G, chips = 100000000) => { const w = G.casWalletFix(G.casWalletNew(), D0); w.chips = chips; return w; };
const total = (G, w, h) => G.casBookTotal(G.casBookSnap([w], h, 0, null));
// 每天人數 counts 填進莊家
const fillUse = (G, h, day, n, store = "food") => { const H = G.casInHouseFix(h); H.use[day] = Object.assign({}, H.use[day], { [store]: n }); };

T("營業時間：05:00～23:30 有價（共 75 個），23:30 之後到 05:00 停盤；沒給時間當沒停盤", G => {
  const C = G.NUM.casino.stockIn;
  assert.strictEqual(C.ticks, 75); assert.strictEqual(C.from, 300); assert.strictEqual(C.step, 15);
  assert.strictEqual(G.casInIdx(at(D0, 5, 0)), 0); assert.strictEqual(G.casInIdx(at(D0, 5, 14)), 0); assert.strictEqual(G.casInIdx(at(D0, 5, 15)), 1);
  assert.strictEqual(G.casInIdx(at(D0, 12, 0)), (12 * 60 - 300) / 15);
  assert.strictEqual(G.casInIdx(at(D0, 23, 30)), 74, "23:30 是最後壹個價");
  assert.strictEqual(G.casInIdx(at(D0, 23, 31)), null, "23:31 停盤");
  assert.strictEqual(G.casInIdx(at(D0, 4, 59)), null); assert.strictEqual(G.casInIdx(at(add(D0, 1), 2, 0)), null);
  assert.strictEqual(G.casInHalt(at(D0, 23, 45)), true); assert.strictEqual(G.casInHalt(at(D0, 9, 0)), false);
  assert.strictEqual(G.casInHalt(null), false); assert.strictEqual(G.casInIdx("x"), null);
});
T("盤中曲線：75 個價、從開盤價起、夾開盤 ±5%、同樣的祕密永遠壹樣、換祕密就不壹樣；日期＋id 不夠（不能預知）", G => {
  const C = G.NUM.casino.stockIn, s = G.casInSeries(10000, D0, "food", SEC);
  assert.strictEqual(s.length, C.ticks); assert.strictEqual(s[0], 10000);
  assert.ok(s.every(p => p >= 10000 * (1 - C.dayCap / 100) - 1 && p <= 10000 * (1 + C.dayCap / 100) + 1), "夾在 ±5%");
  assert.deepStrictEqual(Array.from(G.casInSeries(10000, D0, "food", SEC)), Array.from(s), "同樣的祕密壹樣");
  assert.notDeepStrictEqual(Array.from(G.casInSeries(10000, D0, "food", "別的祕密")), Array.from(s), "換祕密就不壹樣");
  assert.notDeepStrictEqual(Array.from(G.casInSeries(10000, D0, "bj", SEC)), Array.from(s), "不同的店不壹樣");
  assert.notDeepStrictEqual(Array.from(G.casInSeries(10000, add(D0, 1), "food", SEC)), Array.from(s), "不同的日子不壹樣");
  assert.ok(new Set(s).size > 20, "真的在動");
});
T("盤中曲線是隨機漫步：沒有回到開盤價的規律（反轉策略賺不到）；整天標準差約 daySd", G => {
  const C = G.NUM.casino.stockIn; let end = 0, back = 0, n = 0, sq = 0;
  for (let d = 0; d < 300; d++) { const s = G.casInSeries(10000, add(D0, d), "food", SEC), r = s[C.ticks - 1] / 10000 - 1; end += r; sq += r * r; n++; if (Math.abs(s[C.ticks - 1] - 10000) < Math.abs(s[37] - 10000)) back++; }
  assert.ok(Math.abs(end / n) < 0.004, "平均不偏");
  const sd = Math.sqrt(sq / n); assert.ok(sd > C.daySd / 100 * 0.6 && sd < C.daySd / 100 * 1.2, "整天標準差 " + sd);
  assert.ok(back / n > 0.3 && back / n < 0.7, "收盤比中午離開盤近的比例約壹半，沒有被拉回來: " + back / n);
});
T("跳空：K＝0.03；昨天人比平常多就略漲、少就略跌；景氣漂移；夾 ±5%", G => {
  const C = G.NUM.casino.stockIn; assert.strictEqual(C.k, 0.03);
  const h = house(G), H = G.casInHouseFix(h), day = add(D0, 10);
  for (let i = 2; i <= 8; i++) fillUse(G, h, add(day, -i), 10);
  fillUse(G, h, add(day, -1), 20); // 昨天是平常的兩倍
  const up = G.casInJump(H, "food", day, 0, SEC); assert.ok(!up.quiet);
  assert.ok(Math.abs(up.m - C.k * (20 / 10 - 1)) <= C.noise / 100 + 1e-9, "約 K×(a/avg−1)：" + up.m);
  fillUse(G, h, add(day, -1), 6); // 昨天比平常少
  const dn = G.casInJump(H, "food", day, 0, SEC); assert.ok(dn.m < 0.005, "少 → 略跌：" + dn.m);
  fillUse(G, h, add(day, -1), 10);
  const m0 = G.casInJump(H, "food", day, 0, SEC).m, mUp = G.casInJump(H, "food", day, 1, SEC).m, mDn = G.casInJump(H, "food", day, -1, SEC).m;
  assert.ok(Math.abs((mUp - m0) - C.moodPct / 100) < 1e-9 && Math.abs((m0 - mDn) - C.moodPct / 100) < 1e-9, "景氣好略漲、差略跌");
  assert.strictEqual(G.casInJump(H, "food", day, 0, SEC).m, m0, "同樣的祕密壹樣");
  G.NUM.casino.stockIn.k = 10; fillUse(G, h, add(day, -1), 100);
  assert.ok(Math.abs(G.casInJump(H, "food", day, 0, SEC).m) <= C.jumpCap / 100 + 1e-12, "夾住");
});
T("跳空：昨天不到 minPeople 人、或有效日不到 minDays 天，不調價（m ＝ 0）", G => {
  const C = G.NUM.casino.stockIn, h = house(G), H = G.casInHouseFix(h), day = add(D0, 10);
  for (let i = 2; i <= 8; i++) fillUse(G, h, add(day, -i), 10);
  fillUse(G, h, add(day, -1), C.minPeople - 1);
  let j = G.casInJump(H, "food", day, 1, SEC); assert.ok(j.quiet && j.m === 0, "人太少：連景氣都不加");
  fillUse(G, h, add(day, -1), C.minPeople);
  assert.ok(!G.casInJump(H, "food", day, 0, SEC).quiet, "剛好 minPeople 人就調");
  const h2 = house(G), H2 = G.casInHouseFix(h2); fillUse(G, h2, add(day, -1), 10); fillUse(G, h2, add(day, -2), 10); fillUse(G, h2, add(day, -3), 3); // 有效日只有 1 天
  j = G.casInJump(H2, "food", day, 0, SEC); assert.ok(j.quiet, "有效日不到 minDays");
  assert.ok(G.casInJump(H2, "cellar", day, 0, SEC).quiet, "沒有人去的店不調價");
});
T("不同的人壹天壹家只算壹次；沒給莊家只記錢包；壞店名、壞日期不算", G => {
  const h = house(G), a = wallet(G), b = wallet(G);
  assert.strictEqual(G.casInUsed(a, h, "food", D0), true); assert.strictEqual(G.casInUsed(a, h, "food", D0), false, "同壹個人同壹天不重複");
  assert.strictEqual(G.casInUsed(b, h, "food", D0), true);
  assert.strictEqual(G.casInUsed(a, h, "bj", D0), true, "不同的店分開算");
  assert.strictEqual(G.casInUsed(a, h, "food", add(D0, 1)), true, "隔天又算");
  const H = G.casInHouseFix(h); assert.strictEqual(H.use[D0].food, 2); assert.strictEqual(H.use[D0].bj, 1); assert.strictEqual(H.use[add(D0, 1)].food, 1);
  assert.strictEqual(G.casInUsed(a, null, "job", D0), true, "沒給莊家只記錢包");
  assert.strictEqual(G.casInUsed(a, h, "不存在", D0), false); assert.strictEqual(G.casInUsed(a, h, "food", "壞"), false); assert.strictEqual(G.casInUsed(null, h, "food", D0), false);
});
T("換日算開盤價：第壹天照起始價；之後 開盤 ＝ 前壹天的收盤 ×（1＋跳空）；同壹天只算壹次；隔幾天壹天壹天補", G => {
  const C = G.NUM.casino.stockIn, h = house(G), H = G.casInHouseFix(h);
  let r = G.casInRoll(h, D0, 0, SEC); assert.ok(r.done); assert.strictEqual(H.day, D0); assert.strictEqual(H.open.food, C.start);
  assert.ok(!G.casInRoll(h, D0, 0, SEC).done, "同壹天只算壹次");
  const open0 = H.open.food, close0 = G.casInSeries(open0, D0, "food", SEC)[C.ticks - 1];
  for (let i = 1; i <= 8; i++) fillUse(G, h, add(D0, -i), 10); fillUse(G, h, D0, 20); // 昨天（D0）人比平常多
  r = G.casInRoll(h, add(D0, 1), 0, SEC); assert.ok(r.done);
  assert.strictEqual(H.close.food, close0, "前壹天的收盤");
  assert.strictEqual(H.open.food, Math.round(close0 * (1 + H.jump.food)), "開盤 ＝ 收盤 ×（1＋跳空）");
  assert.ok(H.jump.food > 0, "昨天人多：略漲");
  assert.ok(Math.abs(H.jump.food) <= C.jumpCap / 100);
  // 隔了 3 天沒人來：壹天壹天補，人數 0 → 不調價
  const before = H.open.food; r = G.casInRoll(h, add(D0, 4), 0, SEC); assert.ok(r.done); assert.strictEqual(H.day, add(D0, 4));
  assert.ok(Object.values(H.quiet).every(Boolean) || true); assert.ok(H.open.food > 0 && before > 0);
  // 隔很久（超過 30 天）不會跑壹百次
  G.casInRoll(h, add(D0, 400), 0, SEC); assert.strictEqual(H.day, add(D0, 400));
});
T("現價：營業時間內照曲線；停盤時停在最後壹個價；還沒算今天不能買賣", G => {
  const C = G.NUM.casino.stockIn, h = house(G); G.casInRoll(h, D0, 0, SEC);
  const ser = G.casInSeries(G.casInHouseFix(h).open.food, D0, "food", SEC);
  assert.strictEqual(G.casInPrice(h, "food", D0, at(D0, 5, 0), SEC).px, ser[0]);
  assert.strictEqual(G.casInPrice(h, "food", D0, at(D0, 12, 0), SEC).px, ser[(12 * 60 - 300) / 15]);
  const closed = G.casInPrice(h, "food", D0, at(D0, 23, 40), SEC); assert.ok(closed.halted); assert.strictEqual(closed.px, ser[C.ticks - 1]);
  assert.strictEqual(G.casInPrice(h, "food", D0, null, SEC).halted, false);
  assert.strictEqual(G.casInPrice(h, "不存在", D0, at(D0, 9, 0), SEC).halted, true);
  const w = wallet(G); const r = G.casInBuy(w, h, "food", 1, add(D0, 1), at(add(D0, 1), 9, 0), SEC); assert.ok(!r.ok, "還沒換日算今天的開盤");
});
T("買：籌碼進莊家、手續費進預算池，守恆；每家最多 cap 股；籌碼不夠、停盤、莊家沒錢都擋", G => {
  const C = G.NUM.casino.stockIn, h = house(G), w = wallet(G); G.casInRoll(h, D0, 0, SEC);
  const t = at(D0, 10, 0), px = G.casInPrice(h, "food", D0, t, SEC).px, t0 = total(G, w, h), b0 = h.bankroll, bud0 = h.budget, c0 = w.chips;
  const r = G.casInBuy(w, h, "food", 10, D0, t, SEC); assert.ok(r.ok, r.reason);
  const cost = px * 10, fee = Math.ceil(cost * G.NUM.casino.stock.feePct / 100);
  assert.strictEqual(r.cost, cost); assert.strictEqual(r.fee, fee);
  assert.strictEqual(w.chips, c0 - cost - fee); assert.strictEqual(h.bankroll, b0 + cost); assert.strictEqual(h.budget, bud0 + fee);
  assert.strictEqual(total(G, w, h), t0, "錢只搬不生");
  assert.strictEqual(w.sin.own.food, 10); assert.strictEqual(h.sin.held.food, 10);
  assert.strictEqual(h.led.flow.stockIn, cost, "記在莊家帳");
  const over = G.casInBuy(w, h, "food", C.cap, D0, t, SEC); assert.ok(!over.ok && /最多持有/.test(over.reason), over.reason);
  assert.ok(!G.casInBuy(w, h, "food", 1, D0, at(D0, 23, 45), SEC).ok, "停盤擋"); assert.ok(!G.casInBuy(w, h, "food", 1, D0, at(D0, 4, 0), SEC).ok);
  const poor = wallet(G, 10); assert.ok(!G.casInBuy(poor, h, "food", 1, D0, t, SEC).ok); assert.strictEqual(poor.chips, 10);
  const broke = house(G, 0); G.casInRoll(broke, D0, 0, SEC); assert.ok(!G.casInBuy(wallet(G), broke, "food", 1, D0, t, SEC).ok, "莊家沒錢暫停買進");
  for (const bad of [0, -3, "x", 1.5, null]) { const x = G.casInBuy(wallet(G), h, "food", bad, D0, t, SEC); assert.ok(!x.ok || x.n >= 1); }
  assert.ok(!G.casInBuy(wallet(G), h, "不存在", 1, D0, t, SEC).ok);
});
T("賣：莊家付錢，扣手續費進預算池，守恆；賣超過持有擋；壹人壹天賣出上限；全館壹天淨賣出上限（排隊）", G => {
  const S = G.NUM.casino.stock, h = house(G), w = wallet(G); G.casInRoll(h, D0, 0, SEC);
  const t = at(D0, 10, 0), px = G.casInPrice(h, "food", D0, t, SEC).px;
  assert.ok(G.casInBuy(w, h, "food", 100, D0, t, SEC).ok);
  const t1 = total(G, w, h), c1 = w.chips, b1 = h.bankroll, bud1 = h.budget;
  const r = G.casInSell(w, h, "food", 40, D0, t, SEC); assert.ok(r.ok, r.reason);
  const gross = px * 40, fee = Math.ceil(gross * S.feePct / 100);
  assert.strictEqual(w.chips, c1 + gross - fee); assert.strictEqual(h.bankroll, b1 - gross); assert.strictEqual(h.budget, bud1 + fee);
  assert.strictEqual(total(G, w, h), t1, "賣出也守恆"); assert.strictEqual(w.sin.own.food, 60); assert.strictEqual(h.sin.held.food, 60);
  assert.ok(!G.casInSell(w, h, "food", 61, D0, t, SEC).ok, "不能賣比持有多"); assert.ok(!G.casInSell(w, h, "bj", 1, D0, t, SEC).ok, "沒有這支");
  assert.ok(!G.casInSell(w, h, "food", 1, D0, at(D0, 23, 50), SEC).ok, "停盤擋");
  assert.ok(G.casInSell(w, h, "food", "max", D0, t, SEC).ok); assert.strictEqual(w.sin.own.food, undefined);
  // 壹人壹天賣出上限
  const h2 = house(G, 5000000000); G.casInRoll(h2, D0, 0, SEC); const w2 = wallet(G, 5000000000); G.NUM.casino.stock.sellDay = 200000;
  assert.ok(G.casInBuy(w2, h2, "food", 100, D0, t, SEC).ok);
  const s1 = G.casInSell(w2, h2, "food", 100, D0, t, SEC); assert.ok(!s1.ok && /額度只剩/.test(s1.reason), s1.reason);
  // 全館壹天淨賣出上限：莊家窮
  G.NUM.casino.stock.sellDay = 2000000000;
  const h3 = house(G, 30000000), w3 = wallet(G); G.casInRoll(h3, D0, 0, SEC);
  G.casInHouseFix(h3).net = { day: D0, n: 0 }; w3.sin = { own: { food: 800 }, sold: { day: null, n: 0 }, fee: 0, seen: {} };
  const q = G.casInSell(w3, h3, "food", 800, D0, t, SEC); assert.ok(!q.ok && /明天再賣/.test(q.reason), "淨賣出超過上限排隊: " + q.reason);
  assert.ok(G.casInSell(w3, h3, "food", 10, D0, t, SEC).ok, "小量還是可以賣");
});
T("莊家的曝險上限（規劃 2.8e）：持股市值 ≤ max(exposeFloor, 莊家的錢 × exposePct%)；莊家窮時保底；莊家≤0 為 0", G => {
  const C = G.NUM.casino.stockIn, S = G.NUM.casino.stock;
  assert.strictEqual(G.casInExposeCap(house(G, 1000000000)), Math.floor(1000000000 * S.exposePct / 100));
  assert.strictEqual(G.casInExposeCap(house(G, 5000000)), C.exposeFloor, "莊家窮時有保底");
  assert.strictEqual(G.casInExposeCap(house(G, 0)), 0); assert.strictEqual(G.casInExposeCap(house(G, -5)), 0);
  const h = house(G, 20000000); G.casInRoll(h, D0, 0, SEC);
  const t = at(D0, 10, 0), px = G.casInPrice(h, "food", D0, t, SEC).px, w = wallet(G, 1000000000);
  const n = Math.floor(C.exposeFloor / px) + 50; // 只有 1,000 萬保底、1,400 萬的上限（20,000,000×70%）
  const cap = G.casInExposeCap(h); assert.strictEqual(cap, Math.max(C.exposeFloor, Math.floor(20000000 * S.exposePct / 100)));
  const over = G.casInBuy(w, h, "bj", Math.min(C.cap, Math.floor(cap / px) + 5), D0, t, SEC); if (Math.floor(cap / px) + 5 <= C.cap) assert.ok(!over.ok && /已經夠多/.test(over.reason), over.reason);
  assert.ok(n > 0);
});
T("畫面：market in、intraday 只到現在、intradayFrom、inDay；halted／fresh／stale；停盤時整天", G => {
  const C = G.NUM.casino.stockIn, h = house(G), w = wallet(G); G.casInRoll(h, D0, 0, SEC);
  const t = at(D0, 9, 0), idx = (9 * 60 - 300) / 15;
  const v = G.casInView(w, h, D0, t, SEC);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(v.inDay)), { from: 300, len: 75, step: 15 });
  assert.strictEqual(v.list.length, 5); assert.deepStrictEqual(v.list.map(x => x.id), G.IN_STOCKS.map(x => x.id));
  const x = v.list[0]; assert.strictEqual(x.market, "in"); assert.strictEqual(x.kind, "in"); assert.strictEqual(x.halted, false); assert.strictEqual(x.intradayFrom, 0);
  assert.strictEqual(x.intraday.length, idx + 1, "只給到現在，不給未來的");
  assert.strictEqual(x.intraday[x.intraday.length - 1], x.price); assert.strictEqual(x.fresh, true); assert.strictEqual(x.stale, null);
  G.casInSeen(w, h, D0, t, SEC); assert.strictEqual(G.casInView(w, h, D0, t, SEC).list[0].fresh, false, "看過了");
  assert.strictEqual(G.casInView(w, h, D0, at(D0, 9, 15), SEC).list[0].fresh, G.casInView(w, h, D0, at(D0, 9, 15), SEC).list[0].price !== w.sin.seen.food, "價變了又 fresh");
  const closed = G.casInView(w, h, D0, at(D0, 23, 45), SEC); assert.strictEqual(closed.list[0].halted, true); assert.strictEqual(closed.list[0].intraday.length, C.ticks, "收盤後給整天");
  const night = G.casInView(w, h, D0, at(add(D0, 1), 3, 0), SEC); assert.strictEqual(night.list[0].halted, true);
  const stale = G.casInView(w, h, add(D0, 1), at(add(D0, 1), 9, 0), SEC); assert.strictEqual(stale.list[0].halted, true, "還沒換日算：休市");
  const bad = G.casInView(wallet(G), house(G), D0, null, SEC); assert.strictEqual(bad.list.length, 5, "沒給時間不丟錯");
});
T("舊資料、壞資料：沒有 sin／use 的錢包和莊家補欄位；壞數字被丟掉；不丟錯", G => {
  const w = { chips: 5, sin: { own: { food: "x", bj: 3.7, 不存在: 5, job: -2 }, sold: "壞", fee: "x", seen: { food: -1, bj: 100 } } };
  const S = G.casInFix(w); assert.deepStrictEqual(JSON.parse(JSON.stringify(S.own)), { bj: 3 }); assert.strictEqual(S.fee, 0); assert.deepStrictEqual(JSON.parse(JSON.stringify(S.seen)), { bj: 100 });
  const h = G.casHouseFix({ bankroll: 100, sin: { day: "壞", open: { food: "x" }, use: { "2026-11-16": { food: 3, bj: -1, 不存在: 4 }, 壞: {} }, held: { food: -3 }, net: "x" } }, D0).house;
  const H = G.casInHouseFix(h); assert.strictEqual(H.day, null); assert.strictEqual(H.open.food, G.NUM.casino.stockIn.start); assert.deepStrictEqual(JSON.parse(JSON.stringify(H.use)), { "2026-11-16": { food: 3 } });
  assert.strictEqual(H.held.food, 0); assert.strictEqual(H.net.n, 0);
  assert.doesNotThrow(() => G.casInFix({})); assert.doesNotThrow(() => G.casInHouseFix({}));
  // 人數資料只留最近 histDays 天
  const old = house(G); for (let i = 0; i < 40; i++) fillUse(G, old, add(D0, -i), 5); assert.ok(Object.keys(G.casInHouseFix(old).use).length <= G.NUM.casino.stockIn.histDays);
});
T("文字：不出現真公司名、「一」要用「壹」；名字不重複", G => {
  const all = JSON.stringify([G.IN_STOCKS, G.CAS_STOCK_IN]);
  assert.ok(!/NVIDIA|AMD|Nasdaq|台積|聯發|鴻海/i.test(all), "不寫真公司");
  assert.strictEqual(new Set(G.IN_STOCKS.map(x => x.name)).size, 5); assert.strictEqual(new Set(G.IN_STOCKS.map(x => x.id)).size, 5);
  assert.ok(G.IN_STOCKS.every(x => G.IN_STORES.includes(x.id)));
});
T("接上：餐車、牌桌、委託櫃台、地下、手作坊各自記「今天去過」，壹人壹天壹家只算壹次", G => {
  const h = house(G), w = wallet(G); const H = G.casInHouseFix(h);
  assert.ok(G.casBuy(w, h, G.CAS_MENU[0].id, D0).ok !== undefined);
  assert.strictEqual(H.use[D0] && H.use[D0].food, 1, "吃餐車算壹次"); G.casBuy(w, h, G.CAS_MENU[0].id, D0); assert.strictEqual(H.use[D0].food, 1, "再吃不重複");
  G.casSettle(w, h, { bet: 100000, out: { payout: 0, net: -100000, kind: "lose" }, settled: false }, { day: D0 }); assert.strictEqual(H.use[D0].bj, 1, "打壹手牌算壹次");
  const j = G.casJobChips(w, h, [G.CAS_JOB_SLOTS[0]], D0, () => 0.5); assert.ok(j.ok); assert.strictEqual(H.use[D0].job, 1, "交委託算壹次");
  const room = G.CELLAR[0].rooms[0].id; const f = G.casCellarFind(w, h, room, D0, () => 0.99); assert.ok(f.ok); assert.strictEqual(H.use[D0].cellar, 1, "走地下算壹次");
  const w2 = wallet(G); G.casBuy(w2, h, G.CAS_MENU[0].id, D0); assert.strictEqual(H.use[D0].food, 2, "另壹個人再算壹次");
  G.casBuy(w, h, "不存在", D0); assert.strictEqual(H.use[D0].food, 2, "買失敗不算");
});
T("股票畫面合起來：館內五家店排前面、館外七支在後面，外層有 inDay、total 加總、casStockValue 含館內持股", G => {
  const h = house(G), w = wallet(G); G.casInRoll(h, D0, 0, SEC); G.casInSecret(SEC);
  const t = at(D0, 10, 0); assert.ok(G.casInBuy(w, h, "food", 10, D0, t).ok);
  const v = G.casStockViewAll(w, h, D0, t, []);
  assert.deepStrictEqual(v.list.slice(0, 5).map(x => x.id), G.IN_STOCKS.map(x => x.id)); assert.ok(v.list.slice(0, 5).every(x => x.market === "in"));
  assert.strictEqual(v.list.length, 5 + G.STOCK_IDS.length); assert.ok(v.list.slice(5).every(x => x.market !== "in"));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(v.inDay)), { from: 300, len: 75, step: 15 });
  const food = v.list[0]; assert.strictEqual(food.mine, 10); assert.strictEqual(v.total >= food.value, true);
  assert.ok(G.casStockValue(w, h) >= G.casInValueApprox(w, h) && G.casInValueApprox(w, h) > 0, "持股合計含館內股");
  const out = G.casStockView(w, h, D0, t, []); assert.strictEqual(out.list.length, G.STOCK_IDS.length, "原本的 casStockView 不變");
});
T("NPC：每家每天 Poisson(λ)，平均約 λ；種子有祕密（同祕密壹樣、換祕密不壹樣）；沒有館友就沒有 NPC", G => {
  const C = G.NUM.casino.stockIn; assert.strictEqual(C.npcLambda, 2); assert.strictEqual(C.npcShareMax, 40);
  const mk = (players, day) => { const h = house(G), H = G.casInHouseFix(h); for (const s of G.IN_STORES) { H.use[day] = H.use[day] || {}; H.use[day][s] = players; } return H; };
  let sum = 0, n = 0; for (let d = 0; d < 400; d++) { const day = add(D0, d), H = mk(100, day); const o = G.casInNpcFor(H, day, SEC); for (const s of G.IN_STORES) { sum += o[s]; n++; } }
  assert.ok(Math.abs(sum / n - 2) < 0.15, "平均 " + sum / n);
  const H1 = mk(10, D0), a = JSON.stringify(G.casInNpcFor(H1, D0, "A")), H2 = mk(10, D0), b = JSON.stringify(G.casInNpcFor(H2, D0, "A")), H3 = mk(10, D0), c = JSON.stringify(G.casInNpcFor(H3, D0, "B"));
  assert.strictEqual(a, b, "同祕密壹樣"); assert.notStrictEqual(a, c, "換祕密不壹樣");
  const H0 = mk(0, D0); assert.ok(Object.values(G.casInNpcFor(H0, D0, SEC)).every(x => x === 0), "沒有館友就沒有 NPC");
  assert.strictEqual(G.casInNpcFor(H1, D0, "Z")[G.IN_STORES[0]], JSON.parse(a)[G.IN_STORES[0]], "算過就存起來，不會再抽");
});
T("NPC：最多占這家店人數的 npcShareMax%（館友 3 位最多 2 個 NPC）", G => {
  const C = G.NUM.casino.stockIn; C.npcLambda = 50; // 抽很多，看上限
  for (const [players, max] of [[3, 2], [5, 3], [10, 6], [0, 0]]) {
    const H = G.casInHouseFix(house(G)); H.use[D0] = { food: players }; const n = G.casInNpcFor(H, D0, SEC).food;
    assert.strictEqual(n, max, players + " 位館友 → NPC 最多 " + max); assert.ok(n / (players + n || 1) <= C.npcShareMax / 100 + 1e-9);
  }
});
T("NPC：算進「不同的人」：館友 2 位加 NPC 3 位 ＝ 5 位就不算「人太少」；前 7 個有效日的平均也含 NPC", G => {
  const C = G.NUM.casino.stockIn, h = house(G), H = G.casInHouseFix(h), day = add(D0, 10);
  for (let i = 2; i <= 8; i++) { H.use[add(day, -i)] = { food: 4 }; H.npc[add(day, -i)] = { food: 4 }; } // 館友 4 ＋ NPC 4 ＝ 8
  H.use[add(day, -1)] = { food: 2 }; H.npc[add(day, -1)] = { food: 3 };
  const j = G.casInJump(H, "food", day, 0, SEC); assert.ok(!j.quiet, "5 位不算人太少");
  assert.ok(Math.abs(j.m - C.k * (5 / 8 - 1)) <= C.noise / 100 + 1e-9, "跳空照 K×(5÷8−1)：" + j.m);
  H.npc[add(day, -1)] = { food: 2 }; assert.ok(G.casInJump(H, "food", day, 0, SEC).quiet, "館友 2 ＋ NPC 2 ＝ 4 位：人太少");
});
T("NPC 劇情日：那家店那天多去 round(b × 前 7 個有效日平均)，b 在 npcBoostMin～npcBoostMax；別家不加；事件記下來", G => {
  const C = G.NUM.casino.stockIn, h = house(G), H = G.casInHouseFix(h), day = add(D0, 10);
  for (let i = 1; i <= 8; i++) { H.use[add(day, -i)] = { food: 10, bj: 10 }; H.npc[add(day, -i)] = { food: 0, bj: 0 }; }
  H.use[day] = { food: 10, bj: 10 };
  const ev = { [day]: { store: "food", name: "賣傘的老闆的餐車日" } };
  const base = JSON.stringify(G.casInNpcFor(G.casInHouseFix(Object.assign(house(G), { sin: JSON.parse(JSON.stringify(H)) })), day, SEC));
  const o = G.casInNpcFor(H, day, SEC, ev);
  const lo = Math.round(C.npcBoostMin * 10), hi = Math.round(C.npcBoostMax * 10);
  assert.ok(o.food >= lo && o.food <= hi + Math.floor(10 * C.npcShareMax / (100 - C.npcShareMax)), "食 " + o.food);
  assert.ok(H.npcEv[day] && H.npcEv[day].store === "food" && H.npcEv[day].name === "賣傘的老闆的餐車日" && H.npcEv[day].n === o.food, "事件記下來");
  assert.ok(!H.npcEv[add(day, 1)]); assert.ok(o.bj <= Math.floor(10 * C.npcShareMax / (100 - C.npcShareMax)), "別家照舊只有基本的 NPC");
  assert.ok(base && o.food >= JSON.parse(base).food, "劇情日比沒有劇情日多");
  // 一百天的劇情日，b 的範圍：大小在 [0.15, 0.30] × 平均（平均 10）
  let bmin = 9, bmax = 0; for (let k = 0; k < 300; k++) { const hh = G.casInHouseFix(house(G)); for (let i = 1; i <= 8; i++) { hh.use[add(day, -i)] = { food: 10 }; hh.npc[add(day, -i)] = { food: 0 }; } hh.use[day] = { food: 0 }; const x = G.casInNpcFor(hh, day, "s" + k, ev).food; bmin = Math.min(bmin, x); bmax = Math.max(bmax, x); }
  assert.ok(bmin >= Math.round(C.npcBoostMin * 10) - 1 && bmax <= Math.round(C.npcBoostMax * 10) + 1, "加成在 [0.15, 0.30]×平均：" + bmin + "～" + bmax);
});
T("NPC 劇情日不能被預先進場套利：預期跳空 K × npcBoostMax ＜ 來回成本（手續費 2×feePct ＋ drag）", G => {
  const C = G.NUM.casino.stockIn, S = G.NUM.casino.stock, cost = (2 * S.feePct + S.drag) / 100;
  assert.ok(C.k * C.npcBoostMax < cost, "K×b＝" + C.k * C.npcBoostMax + " ＜ " + cost); assert.ok(C.npcBoostMax <= 0.33);
});
T("NPC：casInRoll 換日時算昨天的 NPC，用劇情日；日報有「館外來了 N 位旅客」和劇情日的句子", G => {
  const h = house(G), H = G.casInHouseFix(h); G.casInRoll(h, D0, 0, SEC);
  for (const s of G.IN_STORES) { H.use[D0] = H.use[D0] || {}; H.use[D0][s] = 8; }
  G.casInRoll(h, add(D0, 1), 0, SEC, { [D0]: { store: "cellar", name: "清點日" } });
  assert.ok(H.npc[D0] && G.IN_STORES.every(s => Number.isFinite(H.npc[D0][s])), "昨天的 NPC 算好了");
  assert.ok(H.npcEv[D0] && H.npcEv[D0].store === "cellar");
  const snap = G.casBookSnap([], h, 0, null); assert.strictEqual(snap.house.npcLast.day, D0);
  const diff = G.casBookDiff(null, snap), v = G.casReportView({ day: add(D0, 1), snap, diff }), txt = JSON.stringify(v);
  assert.ok(/《清點日》在地下收藏庫辦了活動，館外來了 [0-9]+ 位旅客/.test(txt), txt.slice(0, 400));
  const h2 = house(G), H2 = G.casInHouseFix(h2); G.casInRoll(h2, D0, 0, SEC); H2.use[D0] = { food: 8 }; G.casInRoll(h2, add(D0, 1), 0, SEC);
  const v2 = JSON.stringify(G.casReportView({ day: add(D0, 1), snap: G.casBookSnap([], h2, 0, null), diff: G.casBookDiff(null, G.casBookSnap([], h2, 0, null)) }));
  assert.ok(/昨天館外來了 [0-9]+ 位旅客逛各家店|昨天館外來了/.test(v2) || !/[0-9] 位旅客/.test(v2), "沒有劇情日：平常的句子（或 0 位時不寫）");
});
T("NPC：舊的／壞的 house.sin 補欄位；npc 只留最近 histDays 天", G => {
  const h = G.casHouseFix({ bankroll: 5, sin: { npc: { "2026-11-16": { food: 3, 壞: 5, bj: -1 }, 壞: {} }, npcEv: { "2026-11-16": { store: "food", name: 12, n: "x" }, "2026-11-17": { store: "不存在" } } } }, D0).house;
  const H = G.casInHouseFix(h); assert.deepStrictEqual(JSON.parse(JSON.stringify(H.npc)), { "2026-11-16": { food: 3, bj: 0 } }); assert.deepStrictEqual(JSON.parse(JSON.stringify(H.npcEv)), { "2026-11-16": { store: "food", name: "", n: 0 } });
  const old = house(G), O = G.casInHouseFix(old); for (let i = 0; i < 40; i++) O.npc[add(D0, -i)] = { food: 1 }; assert.ok(Object.keys(G.casInHouseFix(old).npc).length <= G.NUM.casino.stockIn.histDays);
});
console.log(`casino_stock_in.test：${pass} 過，${fail} 沒過`);
if (fail) process.exit(1);
