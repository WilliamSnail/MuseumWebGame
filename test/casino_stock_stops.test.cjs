// 停損、停利（槓桿部位）和館內五家店的限價單、停損單（11-14，規劃 2.8b、2.8c、2.8j）：node test/casino_stock_stops.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.NUM.casino.grants = []; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const J = JSON.stringify;
const SEC = "test-secret", D0 = "2026-11-16", IN = "food";
const addDay = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const at = (day, hh, mm = 0) => { const [y, m, d] = day.split("-").map(Number); return Date.UTC(y, m - 1, d, hh - 8, mm); };
const tick = (day, i) => at(day, 5, i * 15); // 第 i 個價出來的那壹刻（05:00 ＝ 0）
const comma = n => String(n).replace(/\B(?=(\d{3})+$)/g, ",");
const fresh = (G, chips = 500000000, bank = 500000000) => { const h = G.casHouseFix(G.casHouseNew(), D0).house; h.bankroll = bank; const w = G.casWalletFix(G.casWalletNew(), D0); w.chips = chips; return { G, w, h }; };
const snap = s => s.G.casBookSnap([s.w], s.h, 0, null);
const fakeSrc = P => ({
  now: id => ({ px: P.px[id], idx: P.idx, open: P.open !== false }),
  path: (id, d, from) => (P.ser && P.ser[id] && d === P.day ? P.ser[id].slice(from + 1, (P.upto != null ? P.upto : P.idx) + 1) : []),
  close: (id, d) => (P.close && d === P.close.day ? P.close[id] : null),
});

// ---------- 槓桿的停損、停利 ----------
const openL = (s, side, extra, px = 1000, qty = 100) => s.G.casLevOpen(s.w, s.h, Object.assign({ id: IN, side, lev: 5, qty }, extra), D0, at(D0, 6), fakeSrc({ px: { [IN]: px }, idx: 0 }));
const longPos = extra => { const G = load(); G.NUM.casino.grants = []; const s = fresh(G), r = openL(s, "long", extra); assert.ok(r.ok, r.reason); return { s, G, pos: r.pos }; };
T("開倉帶停損停利：存進部位，開倉訊息說出來；沒設是 null", G => {
  const s = fresh(G), r = openL(s, "long", { stop: 950, take: 1100 });
  assert.ok(r.ok, r.reason); assert.strictEqual(r.pos.stop, 950); assert.strictEqual(r.pos.take, 1100);
  assert.ok(r.lines[0].includes("950") && r.lines[0].includes("1,100"), r.lines[0]);
  const s2 = fresh(G), r2 = openL(s2, "long", {}); assert.strictEqual(r2.pos.stop, null); assert.strictEqual(r2.pos.take, null);
  const v = G.casStockLevView(s.w, s.h, D0, at(D0, 6), fakeSrc({ px: { [IN]: 1000 }, idx: 4 }));
  assert.strictEqual(v.positions[0].stop, 950); assert.strictEqual(v.positions[0].take, 1100); assert.strictEqual(v.positions[0].liqPx, 900);
});
T("檢查方向：做多 停損 < 現價 < 停利，放空相反；停損一定比強制平倉價靠近現價（否則整張單不開，錢沒動）", G => {
  for (const [side, extra] of [["long", { stop: 1000 }], ["long", { stop: 1100 }], ["long", { take: 1000 }], ["long", { take: 900 }], ["long", { stop: 900 }], ["long", { stop: 850 }],
    ["short", { stop: 1000 }], ["short", { stop: 900 }], ["short", { take: 1000 }], ["short", { take: 1100 }], ["short", { stop: 1100 }], ["short", { stop: 1200 }], ["long", { stop: "abc" }]]) {
    const s = fresh(G), c0 = s.w.chips, r = openL(s, side, extra);
    assert.ok(!r.ok, side + J(extra) + " 要被擋"); assert.strictEqual(s.w.chips, c0); assert.strictEqual(s.w.lev.pos.length, 0); assert.strictEqual(s.w.lev.hold, 0);
  }
  assert.ok(openL(fresh(G), "long", { stop: 901 }).ok, "比強平價 900 高 1 就可以");
  assert.ok(openL(fresh(G), "short", { stop: 1099, take: 1 }).ok, "放空 stop 1099 < 強平 1100");
  assert.ok(openL(fresh(G), "long", { stop: 0, take: "" }).ok, "0、空字串 ＝ 沒設");
  assert.ok(openL(fresh(G), "long", { stop: "950", take: "1,100" }).ok, "字串也收");
});
T("停損：第壹個碰到的價就平倉；成交價是那個價（不是停損價）；手續費照平倉算；帳對得上", G => {
  const { s } = longPos({ stop: 950, take: 1100 }), op = G.casBookOpening(snap(s));
  const ser = [1000, 990, 960, 940, 980, 1200], sw = G.casLevSweep(s.w, s.h, D0, at(D0, 10), fakeSrc({ px: { [IN]: 1200 }, idx: 9, day: D0, ser: { [IN]: ser }, upto: 5 }));
  assert.strictEqual(sw.length, 1); assert.strictEqual(sw[0].why, "stop"); assert.strictEqual(sw[0].px, 940);
  assert.strictEqual(sw[0].pnl, (940 - 1000) * 100); assert.strictEqual(s.w.lev.pos.length, 0); assert.strictEqual(s.w.lev.hold, 0);
  assert.strictEqual(sw[0].fee, Math.ceil(940 * 100 * 0.005));
  assert.ok(s.w.lev.notes.some(x => x.includes("停損")));
  assert.strictEqual(G.casBookGap(snap(s), op), 0);
});
T("停利：碰到就平倉、賺的是跳空後的價；停損停利誰先碰到誰算", G => {
  const { s } = longPos({ stop: 950, take: 1100 });
  const sw = G.casLevSweep(s.w, s.h, D0, at(D0, 10), fakeSrc({ px: { [IN]: 1000 }, idx: 8, day: D0, ser: { [IN]: [1000, 1050, 1130, 900] }, upto: 3 }));
  assert.strictEqual(sw[0].why, "take"); assert.strictEqual(sw[0].px, 1130); assert.strictEqual(sw[0].pnl, 13000);
  const { s: s2 } = longPos({ stop: 950, take: 1100 });
  const sw2 = G.casLevSweep(s2.w, s2.h, D0, at(D0, 10), fakeSrc({ px: { [IN]: 1000 }, idx: 8, day: D0, ser: { [IN]: [1000, 940, 1200] }, upto: 2 }));
  assert.strictEqual(sw2[0].why, "stop", "先碰到停損");
});
T("放空：停損在上面、停利在下面", G => {
  const s = fresh(G), r = openL(s, "short", { stop: 1050, take: 900 }); assert.ok(r.ok, r.reason);
  const sw = G.casLevSweep(s.w, s.h, D0, at(D0, 10), fakeSrc({ px: { [IN]: 1000 }, idx: 8, day: D0, ser: { [IN]: [1000, 1040, 1060, 800] }, upto: 3 }));
  assert.strictEqual(sw[0].why, "stop"); assert.strictEqual(sw[0].px, 1060); assert.strictEqual(sw[0].pnl, -6000);
  const s2 = fresh(G), r2 = openL(s2, "short", { stop: 1050, take: 900 }); assert.ok(r2.ok);
  const sw2 = G.casLevSweep(s2.w, s2.h, D0, at(D0, 10), fakeSrc({ px: { [IN]: 1000 }, idx: 8, day: D0, ser: { [IN]: [1000, 950, 880] }, upto: 2 }));
  assert.strictEqual(sw2[0].why, "take"); assert.strictEqual(sw2[0].px, 880); assert.strictEqual(sw2[0].pnl, 12000);
});
T("跳空穿過停損也穿過強平價：算強平，成交價是那個價", G => {
  const { s } = longPos({ stop: 950 });
  const sw = G.casLevSweep(s.w, s.h, D0, at(D0, 10), fakeSrc({ px: { [IN]: 700 }, idx: 5, day: D0, ser: { [IN]: [1000, 700] }, upto: 1 }));
  assert.strictEqual(sw[0].why, "liq"); assert.strictEqual(sw[0].px, 700);
});
T("收盤時路徑不知道：停損照收盤價判斷；沒碰到就是普通的收盤自動平倉", G => {
  const { s } = longPos({ stop: 950 });
  const sw = G.casLevSweep(s.w, s.h, addDay(D0, 1), at(addDay(D0, 1), 6), fakeSrc({ px: { [IN]: 1000 }, idx: 4, day: "x", close: { day: D0, [IN]: 940 } }));
  assert.strictEqual(sw[0].why, "stop"); assert.strictEqual(sw[0].px, 940);
  const { s: s2 } = longPos({ stop: 950 });
  const sw2 = G.casLevSweep(s2.w, s2.h, addDay(D0, 1), at(addDay(D0, 1), 6), fakeSrc({ px: { [IN]: 1000 }, idx: 4, day: "x", close: { day: D0, [IN]: 990 } }));
  assert.strictEqual(sw2[0].why, "flat");
});
T("levset：改、清、只改壹邊；用現價當參考；休市不能改；沒這筆；改之前先掃描", G => {
  const { s, pos } = longPos({}), src = fakeSrc({ px: { [IN]: 1020 }, idx: 6, day: D0, ser: { [IN]: [1000, 1005, 1010, 1015, 1018, 1019, 1020] } });
  let r = G.casLevSet(s.w, s.h, { pid: "p" + pos.no, stop: 980, take: 1200 }, D0, at(D0, 7), src);
  assert.ok(r.ok, r.reason); assert.strictEqual(pos.stop, 980); assert.strictEqual(pos.take, 1200);
  r = G.casLevSet(s.w, s.h, { no: pos.no, take: 1300 }, D0, at(D0, 7), src); assert.ok(r.ok); assert.strictEqual(pos.stop, 980, "沒給的欄位不動"); assert.strictEqual(pos.take, 1300);
  r = G.casLevSet(s.w, s.h, { no: pos.no, stop: 1020 }, D0, at(D0, 7), src); assert.ok(!r.ok, "停損要低於現價 1020"); assert.strictEqual(pos.stop, 980);
  r = G.casLevSet(s.w, s.h, { no: pos.no, take: 1020 }, D0, at(D0, 7), src); assert.ok(!r.ok, "停利要高於現價");
  r = G.casLevSet(s.w, s.h, { no: pos.no, stop: 900 }, D0, at(D0, 7), src); assert.ok(!r.ok, "停損不能在強平價上或以下");
  r = G.casLevSet(s.w, s.h, { no: pos.no, stop: null, take: "" }, D0, at(D0, 7), src); assert.ok(r.ok); assert.strictEqual(pos.stop, null); assert.strictEqual(pos.take, null);
  assert.ok(!G.casLevSet(s.w, s.h, { no: 99, stop: 1 }, D0, at(D0, 7), src).ok);
  const shut = fakeSrc({ px: { [IN]: 1020 }, idx: 6, open: false, day: D0, ser: { [IN]: [] } });
  assert.ok(!G.casLevSet(s.w, s.h, { no: pos.no, stop: 990 }, D0, at(D0, 7), shut).ok, "休市不能改");
  G.casLevSet(s.w, s.h, { no: pos.no, stop: 990 }, D0, at(D0, 7), src);
  const r3 = G.casLevSet(s.w, s.h, { no: pos.no, stop: 995 }, D0, at(D0, 8), fakeSrc({ px: { [IN]: 985 }, idx: 8, day: D0, ser: { [IN]: [1000, 1005, 1010, 1015, 1018, 1019, 1020, 1000, 985] } }));
  assert.ok(!r3.ok); assert.strictEqual(s.w.lev.pos.length, 0, "改之前先掃描，990 的停損被 985 碰到平倉了");
});
T("新設的停損只管設了之後的價", G => {
  const { s, pos } = longPos({}), ser = [1000, 1005, 940, 1010, 1020];
  const src = fakeSrc({ px: { [IN]: 1010 }, idx: 3, day: D0, ser: { [IN]: ser }, upto: 3 });
  assert.ok(G.casLevSet(s.w, s.h, { no: pos.no, stop: 950 }, D0, at(D0, 7), src).ok);
  assert.strictEqual(G.casLevSweep(s.w, s.h, D0, at(D0, 7), src).length, 0);
  assert.strictEqual(G.casLevSweep(s.w, s.h, D0, at(D0, 8), fakeSrc({ px: { [IN]: 1020 }, idx: 4, day: D0, ser: { [IN]: ser }, upto: 4 })).length, 0);
});
T("舊部位（沒有 stop、take 欄位）補成 null", G => {
  const w = G.casWalletFix(G.casWalletNew(), D0); w.lev = { pos: [{ no: 1, id: IN, side: "long", lev: 5, qty: 10, entry: 1000, notional: 10000, margin: 2000, day: D0 }], seq: 1 };
  const S = G.casLevFix(w); assert.strictEqual(S.pos[0].stop, null); assert.strictEqual(S.pos[0].take, null);
});

// ---------- 館內股的限價單、停損單 ----------
const inDay = (G, bank) => { G.casInSecret(SEC); const s = fresh(G, 500000000, bank); G.casInRoll(s.h, D0, 0, SEC); const H = G.casInHouseFix(s.h), ser = G.casInSeries(H.open[IN], D0, IN, SEC); return { s, ser, H }; };
const first = (ser, from, f) => { for (let k = from; k < ser.length; k++) if (f(ser[k])) return k; return -1; };
const findDown = ser => { for (let i = 2; i < 60; i++) { const lo = Math.min(...ser.slice(i + 1)); if (lo < ser[i]) { const limit = lo, k = first(ser, i + 1, p => p <= limit); return { i, k, limit, hit: ser[k] }; } } throw new Error("找不到"); };
const findUp = ser => { for (let i = 2; i < 60; i++) { const hi = Math.max(...ser.slice(i + 1)); if (hi > ser[i]) { const limit = hi, k = first(ser, i + 1, p => p >= limit); return { i, k, limit, hit: ser[k] }; } } throw new Error("找不到"); };
const gap = (s, op) => s.G.casBookGap(snap(s), op);
const give = (s, n) => { s.G.casInFix(s.w); s.w.sin.own[IN] = n; s.G.casInHouseFix(s.h).held[IN] = n; };

T("館內股限價買：鎖籌碼、view 有 market in 的單；到價成交用觸發價；帳對得上；不會重複成交", G => {
  const { s, ser } = inDay(G), f = findDown(ser), op = G.casBookOpening(snap(s)), c0 = s.w.chips;
  const r = G.casStockOrder(s.w, s.h, "buy", IN, 10, f.limit, D0, tick(D0, f.i));
  assert.ok(r.ok, r.reason);
  const lock = f.limit * 10 + Math.ceil(f.limit * 10 * 0.005);
  assert.strictEqual(s.w.chips, c0 - lock); assert.strictEqual(s.w.stk.hold, lock); assert.strictEqual(gap(s, op), 0);
  const v = G.casStockViewAll(s.w, s.h, D0, tick(D0, f.i));
  const o = v.orders.find(x => x.id === IN); assert.ok(o); assert.strictEqual(o.market, "in"); assert.strictEqual(o.kind, "buy"); assert.strictEqual(o.now, ser[f.i]); assert.strictEqual(o.lock, lock);
  assert.strictEqual(G.casStockMatch(s.w, s.h, D0, tick(D0, f.i)).fills, 0);
  const m = G.casStockMatch(s.w, s.h, D0, tick(D0, f.k)); assert.strictEqual(m.fills, 1);
  assert.strictEqual(s.w.sin.own[IN], 10); assert.strictEqual(s.w.stk.orders.length, 0); assert.strictEqual(s.w.stk.hold, 0);
  const cost = f.hit * 10, fee = Math.ceil(cost * 0.005); assert.strictEqual(s.w.chips, c0 - cost - fee, "用觸發的價成交，多鎖的退回");
  assert.strictEqual(G.casInHouseFix(s.h).held[IN], 10); assert.strictEqual(gap(s, op), 0);
  assert.ok(s.w.stk.notes.length >= 1);
  assert.strictEqual(G.casStockMatch(s.w, s.h, D0, tick(D0, 70)).fills, 0, "不會再成交壹次");
});
T("館內股限價賣：鎖住股數（不能再市價賣、不能重複掛）；到價成交，莊家付錢，帳對得上", G => {
  const { s, ser } = inDay(G), up = findUp(ser); give(s, 100);
  const op = G.casBookOpening(snap(s));
  assert.ok(!G.casStockOrder(s.w, s.h, "sell", IN, 10, ser[up.i], D0, tick(D0, up.i)).ok, "限價賣要高於現價");
  assert.ok(!G.casStockOrder(s.w, s.h, "stop", IN, 10, ser[up.i] + 1, D0, tick(D0, up.i)).ok, "停損要低於現價");
  const r = G.casStockOrder(s.w, s.h, "sell", IN, 60, up.limit, D0, tick(D0, up.i)); assert.ok(r.ok, r.reason);
  assert.ok(!G.casStockOrder(s.w, s.h, "stop", IN, 50, ser[up.i] - 1, D0, tick(D0, up.i)).ok, "只剩 40 股沒被鎖");
  assert.ok(!G.casInSell(s.w, s.h, IN, 50, D0, tick(D0, up.i), SEC).ok, "市價賣也不能動被鎖住的");
  assert.ok(G.casInSell(s.w, s.h, IN, 40, D0, tick(D0, up.i), SEC).ok);
  const v = G.casStockViewAll(s.w, s.h, D0, tick(D0, up.i)); assert.strictEqual(v.orders[0].lockShares, 60);
  const c0 = s.w.chips, hb = s.h.bankroll, m = G.casStockMatch(s.w, s.h, D0, tick(D0, up.k)); assert.strictEqual(m.fills, 1);
  const gross = up.hit * 60, fee = Math.ceil(gross * 0.005);
  assert.strictEqual(s.w.chips, c0 + gross - fee); assert.strictEqual(s.h.bankroll, hb - gross); assert.ok(!s.w.sin.own[IN]);
  assert.strictEqual(gap(s, op), 0);
});
T("館內股停損賣：跌到就賣，成交價是觸發那個價", G => {
  const { s, ser } = inDay(G), f = findDown(ser); give(s, 20);
  assert.ok(G.casStockOrder(s.w, s.h, "stop", IN, 20, f.limit, D0, tick(D0, f.i)).ok);
  assert.strictEqual(G.casStockMatch(s.w, s.h, D0, tick(D0, f.k)).fills, 1);
  assert.ok(s.w.stk.notes[s.w.stk.notes.length - 1].includes(comma(f.hit)));
  assert.ok(!s.w.sin.own[IN]);
});
T("當天 23:30 收盤沒成交：取消、退回；休市不能下單、不能取消", G => {
  const { s } = inDay(G), op = G.casBookOpening(snap(s)), c0 = s.w.chips;
  assert.ok(G.casStockOrder(s.w, s.h, "buy", IN, 5, 1, D0, tick(D0, 10)).ok, "掛 1 塊，不會成交");
  assert.strictEqual(G.casStockMatch(s.w, s.h, D0, tick(D0, 74)).cancels, 0, "23:30 還有效");
  assert.strictEqual(s.w.stk.orders.length, 1);
  assert.ok(!G.casStockCancel(s.w, 1, D0, at(D0, 23, 40), s.h).ok, "休市不能取消");
  assert.ok(!G.casStockOrder(s.w, s.h, "buy", IN, 5, 1, D0, at(D0, 23, 40)).ok, "休市不能下單");
  const m = G.casStockMatch(s.w, s.h, D0, at(D0, 23, 40)); assert.strictEqual(m.cancels, 1);
  assert.strictEqual(s.w.stk.orders.length, 0); assert.strictEqual(s.w.chips, c0); assert.strictEqual(s.w.stk.hold, 0); assert.strictEqual(gap(s, op), 0);
  assert.ok(s.w.stk.notes.some(x => x.includes("到期")));
});
T("自己取消：退回鎖住的、計取消次數；單號跟館外股共用", G => {
  const { s } = inDay(G), c0 = s.w.chips;
  const a = G.casStockOrder(s.w, s.h, "buy", IN, 5, 100, D0, tick(D0, 10));
  assert.ok(a.ok, a.reason); assert.strictEqual(a.order.no, 1);
  const c = G.casStockCancel(s.w, 1, D0, tick(D0, 11), s.h); assert.ok(c.ok, c.reason);
  assert.strictEqual(s.w.stk.orders.length, 0); assert.strictEqual(s.w.stk.cx.n, 1); assert.strictEqual(s.w.chips, c0);
  assert.ok(!G.casStockCancel(s.w, 1, D0, tick(D0, 11), s.h).ok);
});
T("成交時被上限擋住就取消退回：賣出額度、每家 1,000 股、莊家全館淨賣出", G => {
  { const { s, ser } = inDay(G), f = findUp(ser); give(s, 50);
    assert.ok(G.casStockOrder(s.w, s.h, "sell", IN, 50, f.limit, D0, tick(D0, f.i)).ok);
    G.NUM.casino.stock.sellDay = 1;
    const m = G.casStockMatch(s.w, s.h, D0, tick(D0, f.k)); assert.strictEqual(m.fills, 0); assert.strictEqual(m.cancels, 1);
    assert.strictEqual(s.w.sin.own[IN], 50, "股還在"); assert.strictEqual(s.w.stk.orders.length, 0); }
  { const G2 = load(); G2.NUM.casino.grants = []; const { s, ser } = inDay(G2), f = findDown(ser);
    assert.ok(G2.casStockOrder(s.w, s.h, "buy", IN, 10, f.limit, D0, tick(D0, f.i)).ok);
    s.w.sin.own[IN] = 995; G2.casInFix(s.w);
    const c0 = s.w.chips, m = G2.casStockMatch(s.w, s.h, D0, tick(D0, f.k)); assert.strictEqual(m.cancels, 1); assert.strictEqual(s.w.sin.own[IN], 995);
    assert.ok(s.w.chips > c0, "鎖住的錢退回"); }
  { const G3 = load(); G3.NUM.casino.grants = []; const { s, ser } = inDay(G3, 1000), f = findUp(ser); give(s, 100);
    assert.ok(G3.casStockOrder(s.w, s.h, "sell", IN, 100, f.limit, D0, tick(D0, f.i)).ok);
    G3.NUM.casino.stock.netSellFlat = 0;
    const m = G3.casStockMatch(s.w, s.h, D0, tick(D0, f.k)); assert.strictEqual(m.fills, 0); assert.strictEqual(m.cancels, 1); assert.strictEqual(s.w.sin.own[IN], 100); }
});
T("隔天才碰到錢包：昨天盤中碰過價的算成交（用昨天的價），沒碰過的過期", G => {
  const { s, ser } = inDay(G), f = findDown(ser), op = G.casBookOpening(snap(s));
  assert.ok(G.casStockOrder(s.w, s.h, "buy", IN, 10, f.limit, D0, tick(D0, f.i)).ok);
  assert.ok(G.casStockOrder(s.w, s.h, "buy", IN, 10, 1, D0, tick(D0, f.i)).ok);
  const D1 = addDay(D0, 1); G.casInRoll(s.h, D1, 0, SEC);
  assert.strictEqual(G.casInHouseFix(s.h).pre.day, D0);
  const m = G.casStockMatch(s.w, s.h, D1, tick(D1, 0)); assert.strictEqual(m.fills, 1); assert.strictEqual(m.cancels, 1);
  assert.strictEqual(s.w.sin.own[IN], 10); assert.strictEqual(s.w.stk.orders.length, 0); assert.strictEqual(gap(s, op), 0);
  assert.ok(s.w.stk.notes.some(x => x.includes(comma(f.hit))));
});
T("下單檢查：同壹家最多 3 張；還沒換日不能下；股數 0、價格不利都不行", G => {
  const { s, ser } = inDay(G), f = findDown(ser);
  for (let i = 1; i <= 3; i++) assert.ok(G.casStockOrder(s.w, s.h, "buy", IN, 1, ser[f.i] - i, D0, tick(D0, f.i)).ok);
  assert.ok(!G.casStockOrder(s.w, s.h, "buy", IN, 1, ser[f.i] - 4, D0, tick(D0, f.i)).ok, "同壹家最多 3 張");
  const s2 = fresh(G); assert.ok(!G.casStockOrder(s2.w, s2.h, "buy", IN, 1, 1, D0, tick(D0, 3)).ok);
  const s3 = inDay(G); assert.ok(!G.casStockOrder(s3.s.w, s3.s.h, "buy", IN, 0, 1, D0, tick(D0, 3)).ok, "股數 0");
  assert.ok(!G.casStockOrder(s3.s.w, s3.s.h, "buy", IN, 1, s3.ser[3] + 5, D0, tick(D0, 3)).ok, "限價買要低於現價");
});
T("伺服器接線：actStock 有 levset、館內股 order／cancel", G => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "functions", "casino.js"), "utf8");
  assert.ok(src.includes('op === "levset"') && src.includes("casLevSet"));
  assert.ok(!src.includes("館內股票還不能掛單"));
});
console.log(`casino_stock_stops.test：${pass} 過，${fail} 沒過`);
if (fail) process.exit(1);
