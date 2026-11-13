// 美股盤中（11-14，規劃 2.8i）：node test/stocks_us.test.cjs（npm test 也會跑）
// 美東開盤時間（冬令、夏令、換日光節約的前後）、整個交易日的模擬（含 DST 日、國定假日）、停盤、掛單當天有效、05:00 換日不重複算、view 欄位、守恆、解析行情。數字讀 NUM。
const assert = require("assert");
const fs = require("fs"), path = require("path");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const J = x => JSON.stringify(x);
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 5).join("\n    ")); } };
const W = "2026-11-16"; // 星期一，冬令（美東 UTC−5）：台灣 22:30～隔天 05:00
const S = "2026-07-15"; // 星期三，夏令（美東 UTC−4）：台灣 21:30～隔天 04:00
const HOL = "2026-11-26"; // 感恩節（週四，美國休市）
const ID = "greeneye", ID2 = "redclaw", TWID = "handbrain";
const prevReal = { greeneye: 170, redclaw: 550, nightindex: 690, silverapple: 355, flashcar: 390, squarewin: 520 };
const openGot = (G, gap, lag) => { const o = {}; for (const id of G.US_IDS) o[id] = { open: prevReal[id] * (1 + gap), prev: prevReal[id], lag: lag == null ? 0 : lag }; return o; };
const segGot = (G, base, j, ret, lag) => { const o = {}; for (const id of G.US_IDS) o[id] = { px: base[id] * Math.pow(1 + ret, j), lag: lag == null ? 0 : lag }; return o; };
// 跑壹整個交易日（每分鐘問 usNeed，要抓就抓）。opts：gap、ret（每段真實漲跌）、lag、failSeg、openAt（第幾分鐘才抓得到開盤價，不給＝一直抓不到時用 never）
function runDay(G, secret, day, opts) {
  opts = opts || {};
  const doc = G.usDocNew(day), base = Object.fromEntries(G.US_IDS.map(id => [id, prevReal[id] * (1 + (opts.gap || 0))]));
  for (let idx = 0; idx <= 390; idx++) {
    const need = G.usNeed(doc, idx);
    if (!need) continue;
    let got = null;
    if (need.kind === "open") got = !opts.never && idx >= (opts.openAt || 0) ? openGot(G, opts.gap || 0, opts.lag) : null;
    else if (need.kind === "seg" && need.fetch && !(opts.failSeg || []).includes(need.j)) got = segGot(G, base, need.j, opts.ret || 0, opts.lag);
    G.usApply(doc, need, idx, got, secret);
  }
  return doc;
}
const house0 = (G, day) => { const house = G.casHouseFix(G.casHouseNew(), day).house; G.casStockRoll(house, day, {}); return house; };
const wallet = (G, day) => { const w = G.casWalletFix(G.casWalletNew(), day || W); w.chips = 500000000; return w; };
const tm = (G, day, i, sec) => G.usOpenMs(day) + i * 60000 + (sec == null ? 1 : sec) * 1000; // 開盤後第 i 分鐘（1 秒）
const iso = ms => new Date(ms).toISOString();
const twHM = ms => { const d = new Date(ms + 8 * 3600000); return String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0"); };

T("開盤時間：冬令 14:30Z（台灣 22:30）、夏令 13:30Z（台灣 21:30），換日光節約前後壹天也對；收盤是 +390 分鐘", G => {
  assert.strictEqual(iso(G.usOpenMs(W)), "2026-11-16T14:30:00.000Z"); assert.strictEqual(twHM(G.usOpenMs(W)), "22:30");
  assert.strictEqual(iso(G.usOpenMs(S)), "2026-07-15T13:30:00.000Z"); assert.strictEqual(twHM(G.usOpenMs(S)), "21:30");
  assert.strictEqual(twHM(G.usOpenMs(W) + 390 * 60000), "05:00"); assert.strictEqual(twHM(G.usOpenMs(S) + 390 * 60000), "04:00");
  // 2026 日光節約：3 月 8 日（週日）開始、11 月 1 日（週日）結束
  assert.strictEqual(iso(G.usOpenMs("2026-03-06")), "2026-03-06T14:30:00.000Z", "開始前的週五還是冬令");
  assert.strictEqual(iso(G.usOpenMs("2026-03-09")), "2026-03-09T13:30:00.000Z", "開始後的週一夏令");
  assert.strictEqual(iso(G.usOpenMs("2026-10-30")), "2026-10-30T13:30:00.000Z", "結束前的週五還是夏令");
  assert.strictEqual(iso(G.usOpenMs("2026-11-02")), "2026-11-02T14:30:00.000Z", "結束後的週一冬令");
  assert.strictEqual(G.usOpenMs("壞的"), null);
});
T("距離開盤幾分鐘：09:30 ＝ 0、16:00 ＝ 390、開盤前是負的；沒給時間是 null", G => {
  const o = G.usOpenMs(W);
  assert.strictEqual(G.usIdx(o, W), 0); assert.strictEqual(G.usIdx(o + 390 * 60000, W), 390); assert.strictEqual(G.usIdx(o - 1, W), -1);
  assert.strictEqual(G.usIdx(null, W), null); assert.strictEqual(G.usIdx(NaN, W), null);
  assert.strictEqual(G.usIdx(G.usOpenMs(S) + 5 * 60000, S), 5, "夏令也是從 09:30 算");
});
T("美東日期：台灣時間冬令 22:30～隔天 05:00、夏令 21:30～隔天 04:00 都是同一個美東日；它也是遊戲日期（台灣 05:00 換日）", G => {
  for (const [day, last] of [[W, 389], [S, 389]]) {
    const o = G.usOpenMs(day);
    assert.strictEqual(G.usNyDay(o), day); assert.strictEqual(G.usNyDay(o + last * 60000), day);
    assert.strictEqual(G.taipeiDay(o), day, "開盤那刻的遊戲日期");
    assert.strictEqual(G.taipeiDay(o + last * 60000), day, "收盤前壹分鐘還是同壹個遊戲日（跨過台灣午夜）");
  }
  assert.strictEqual(G.taipeiDay(G.usOpenMs(S) + 390 * 60000), S, "夏令 04:00 收盤，還沒到 05:00 換日");
  assert.strictEqual(G.taipeiDay(G.usOpenMs(W) + 390 * 60000), "2026-11-17", "冬令收盤剛好是 05:00 換日那壹刻");
  assert.strictEqual(G.usNyDay(Date.parse("2026-11-17T04:59:00+08:00")), W);
});
T("名單：六支美股（含指數用的），都有 15 分鐘標準差和每分鐘隨機；真實代號不在 shared 裡", G => {
  assert.strictEqual(J(G.US_IDS.slice().sort()), J(["flashcar", "greeneye", "nightindex", "redclaw", "silverapple", "squarewin"]));
  assert.ok(G.stockIsUs(ID) && !G.stockIsUs(TWID) && !G.stockIsTw(ID));
  const C = G.NUM.casino.stock.us;
  for (const id of G.US_IDS) { assert.ok(C.sd15[id] > 0, id); assert.ok(C.minSd[id] > 0, id); }
  assert.strictEqual(C.open, 570); assert.strictEqual(C.len, 390); assert.strictEqual(C.len % C.seg, 0);
  const dir = path.join(__dirname, "..", "shared");
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    assert.ok(!/\b(NVDA|AAPL|TSLA|MSFT|QQQ|\^IXIC)\b/.test(src.replace(/AMD/g, "")), f + " 不能有真實代號");
  }
});
T("usNeed：09:30 起要抓開盤價；30 分鐘還沒抓到就放棄；錨點每 15 分鐘，到 26 段", G => {
  const C = G.NUM.casino.stock.us, d = G.usDocNew(W);
  assert.strictEqual(G.usNeed(d, -1), null); assert.strictEqual(G.usNeed(d, 0).kind, "open"); assert.strictEqual(G.usNeed(d, C.giveUp).kind, "giveup");
  const e = G.usDocNew(W); assert.ok(G.usApply(e, G.usNeed(e, 0), 0, openGot(G, 0), "s"));
  assert.strictEqual(J(G.usNeed(e, 15)), J({ kind: "seg", j: 1, fetch: true }));
  assert.strictEqual(G.usNeed(e, 15 + C.retry).fetch, false);
  const full = runDay(G, "s", W);
  assert.strictEqual(full.k, 25); assert.strictEqual(G.usNeed(full, 390), null);
});
T("整個交易日（冬令、夏令）：391 個價，第 0 個 ＝ 真實開盤 ÷ 前收（跳空），夾在 ±10%，最後壹個價就是收盤", G => {
  for (const day of [W, S]) {
    const doc = runDay(G, "祕密", day, { gap: 0.03 });
    for (const id of G.US_IDS) {
      const s = doc.ser[id];
      assert.strictEqual(s.length, 391, id);
      assert.ok(Math.abs(s[0] - 1.03) < 1e-9, id + " 開盤跳空 3%");
      assert.ok(s.every(x => x >= 0.9 - 1e-9 && x <= 1.1 + 1e-9), id + " 夾在 ±10%");
    }
  }
  const big = runDay(G, "x", W, { gap: 0.25 });
  assert.ok(big.ser[ID][0] <= 1.1 + 1e-9, "開盤跳空超過 10% 也夾住");
});
T("種子有祕密：同樣輸入同樣結果、換祕密整條不同、doc 裡沒有祕密；跟台股的種子不混", G => {
  const a = runDay(G, "祕密甲", W, { gap: 0.01 }), b = runDay(G, "祕密甲", W, { gap: 0.01 }), c = runDay(G, "祕密乙", W, { gap: 0.01 });
  assert.strictEqual(J(a.ser), J(b.ser)); assert.notStrictEqual(J(a.ser[ID]), J(c.ser[ID]));
  assert.ok(!J(a).includes("祕密甲"));
});
T("真實成分：用跟台股壹樣的 X（落後 ≤5 分 0.4、≤20 分 0.3、更久 0.25）；上壹段真實漲 1%，錨點平均多漲 X%", G => {
  const avg = (ret, lag) => { let sum = 0; const N = 400; for (let i = 0; i < N; i++) { const d = runDay(G, "k" + i, W, { ret, lag }); sum += d.ser[ID][30] / d.ser[ID][15] - 1; } return sum / N; };
  const base = avg(0, 0), up = avg(0.01, 0), slow = avg(0.01, 15);
  assert.ok(Math.abs(up - base - 0.004) < 0.0009, "X＝0.4：" + (up - base));
  assert.ok(Math.abs(slow - base - 0.003) < 0.0009, "落後 15 分 X＝0.3：" + (slow - base));
});
T("抓不到的壹段：真實成分當 0、標沒資料；開盤價晚到、超過 10:00 還沒有整天不開", G => {
  const e = G.usDocNew(W); G.usApply(e, G.usNeed(e, 0), 0, openGot(G, 0), "x");
  G.usApply(e, { kind: "seg", j: 1, fetch: false }, 20, null, "x");
  assert.strictEqual(e.stale[ID], true); assert.strictEqual(e.k, 1);
  const d = runDay(G, "x", W, { openAt: 20 });
  assert.strictEqual(d.openIdx, 20); assert.strictEqual(d.ser[ID][0], d.ser[ID][20]); assert.strictEqual(d.ser[ID].length, 391);
  const g = runDay(G, "x", W, { openAt: 31 });
  assert.strictEqual(g.openIdx, null); assert.strictEqual(g.closed, true);
});
T("今天換過日、卻沒有今天的基準價（11-13 美股第壹晚）：用現在的價補上，盤中照樣畫得出來", G => {
  const house = house0(G, W), doc = runDay(G, "x", W, {});
  delete house.stk.hist[W];
  const p0 = house.stk.px[ID];
  G.casStockUsApply(house, doc, W, tm(G, W, 60));
  assert.ok(house.stk.hist[W] && house.stk.hist[W][ID] === p0, "補了基準價");
  assert.ok(Array.isArray(house.stk.us.ser[ID]) && house.stk.us.ser[ID].length > 1, "盤中有價");
});
T("「今天」漲跌跟今天的開盤基準比，不是跟 H.prev（11-14 盤中壹路跌卻顯示漲）", G => {
  const house = house0(G, W), doc = runDay(G, "x", W, {}), w = wallet(G, W);
  house.stk.prev[ID] = Math.round(house.stk.hist[W][ID] / 1.05); // 舊做法：05:00 換日時把昨晚的漲幅（+5%）套進去了
  G.casStockUsApply(house, doc, W, tm(G, W, 200));
  const v = G.casStockView(w, house, W, tm(G, W, 200)).list.find(x => x.id === ID);
  const want = (house.stk.px[ID] - house.stk.hist[W][ID]) / house.stk.hist[W][ID];
  assert.ok(Math.abs(v.chg - want) < 1e-9, v.chg + " vs " + want);
});
T("國定假日（沒有開盤價）：整天休市，狀態 closed、買賣下單都擋，價只剩 drag", G => {
  const house = house0(G, HOL), doc = runDay(G, "x", HOL, { never: true }), w = wallet(G, HOL);
  assert.strictEqual(doc.closed, true); assert.strictEqual(doc.openIdx, null);
  const p0 = house.stk.px[ID];
  const wait = G.usDocNew(HOL); // 開盤後 30 分鐘內：還在等第壹個價
  for (const i of [-5, 5, 29, 31, 200, 391]) {
    G.casStockUsApply(house, i < 30 ? wait : doc, HOL, tm(G, HOL, i));
    assert.ok(house.stk.us.st === (i < 0 ? "pre" : i < 30 ? "pending" : "closed"), i + " " + house.stk.us.st);
    assert.ok(!G.casStockBuy(w, house, ID, 1, HOL, tm(G, HOL, i)).ok, "休市不能買 " + i);
  }
  assert.strictEqual(house.stk.px[ID], p0, "沒有任何盤中價就不動");
  assert.ok(!G.casStockOrder(w, house, "buy", ID, 1, 1, HOL, tm(G, HOL, 100)).ok);
  assert.ok(p0 >= 9990, "只扣了 drag");
});
T("週末：美股 closed；資料壞了也不丟錯", G => {
  const sat = "2026-11-14", hs = house0(G, sat), doc = runDay(G, "x", W);
  assert.strictEqual(G.casStockUsApply(hs, doc, sat, tm(G, sat, 10)).st, "closed");
  const house = house0(G, W);
  assert.doesNotThrow(() => G.casStockUsApply(house, { day: W, ser: "x", openIdx: 0 }, W, tm(G, W, 10)));
  assert.doesNotThrow(() => G.casStockUsApply(house, null, W, tm(G, W, 10)));
  assert.doesNotThrow(() => G.casStockUsApply(house, {}, W, null));
  const unrolled = G.casHouseFix(G.casHouseNew(), W).house;
  assert.strictEqual(G.casStockUsApply(unrolled, doc, W, tm(G, W, 10)).st, "closed", "還沒換日調價不開");
});
T("狀態：開盤前 pre、沒第壹個價 pending、抓到後 open、16:00 closed（冬令、夏令都照美東時間）", G => {
  for (const day of [W, S]) {
    const house = house0(G, day), doc = runDay(G, "x", day, { gap: 0.02 }), none = G.usDocNew(day);
    const st = (d, i) => G.casStockUsApply(house, d, day, tm(G, day, i)).st;
    assert.strictEqual(st(doc, -1), "pre"); assert.strictEqual(st(doc, 0), "open"); assert.strictEqual(st(doc, 389), "open"); assert.strictEqual(st(doc, 390), "closed");
    assert.strictEqual(st(none, 5), "pending"); assert.strictEqual(st(null, 29), "pending"); assert.strictEqual(st(null, 30), "closed");
    const late = runDay(G, "x", day, { openAt: 7 }); assert.strictEqual(st(late, 6), "pending"); assert.strictEqual(st(late, 7), "open");
  }
});
T("股價 ＝ 今天開盤價 × rel；每個分鐘跟著走；收盤後停在最後壹個價；台股不受影響", G => {
  const house = house0(G, W), doc = runDay(G, "祕密", W, { gap: 0.02 }), base = house.stk.hist[W][ID], tw = house.stk.px[TWID];
  G.casStockUsApply(house, doc, W, tm(G, W, 0));
  assert.strictEqual(house.stk.px[ID], Math.round(base * doc.ser[ID][0]));
  G.casStockUsApply(house, doc, W, tm(G, W, 67));
  assert.strictEqual(house.stk.px[ID], Math.round(base * doc.ser[ID][67]));
  assert.strictEqual(house.stk.us.ser[ID].length, 68);
  G.casStockUsApply(house, doc, W, tm(G, W, 500));
  assert.strictEqual(house.stk.px[ID], Math.round(base * doc.ser[ID][390]));
  assert.strictEqual(house.stk.px[TWID], tw);
});
T("停盤：美股只在開盤時間買賣、下單、取消（沒有全館 22:00～05:00 了）", G => {
  const house = house0(G, W), doc = runDay(G, "祕密", W, { gap: 0.02 }), w = wallet(G);
  const early = Date.parse(W + "T10:00:00+08:00"); // 台灣白天：美股沒開
  G.casStockUsApply(house, doc, W, early);
  const r = G.casStockBuy(w, house, ID, 1, W, early);
  assert.ok(!r.ok && r.reason.includes("美股"), "白天不能買：" + r.reason);
  const t0 = tm(G, W, 20);
  G.casStockUsApply(house, doc, W, t0);
  assert.ok(G.casStockBuy(w, house, ID, 2, W, t0).ok, "台灣 22:50（冬令）可以買");
  const px = house.stk.px[ID];
  const o = G.casStockOrder(w, house, "buy", ID, 1, px - 1, W, t0);
  assert.ok(o.ok, o.reason); assert.strictEqual(w.stk.orders[0].at, 20, "記下是第幾分鐘下的");
  const t1 = tm(G, W, 391);
  G.casStockUsApply(house, doc, W, t1);
  assert.ok(!G.casStockCancel(w, o.order.no, W, t1, house).ok, "收盤後不能取消");
  assert.ok(!G.casStockSell(w, house, ID, 1, W, t1).ok, "收盤後不能賣");
  assert.ok(!G.casStockOrder(w, house, "buy", ID, 1, 1, W, t1).ok);
  const t2 = tm(G, W, 100); G.casStockUsApply(house, doc, W, t2);
  assert.ok(G.casStockCancel(w, o.order.no, W, t2, house).ok, "開盤時間可以取消");
  assert.ok(G.casStockSell(w, house, ID, 1, W, t2).ok);
});
T("夏令也是：台灣 21:30 開、04:00 收，收盤後不能買", G => {
  const house = house0(G, S), doc = runDay(G, "祕密", S, { gap: 0.01 }), w = wallet(G, S);
  const a = Date.parse("2026-07-15T21:29:00+08:00"), b = Date.parse("2026-07-15T21:31:00+08:00"), c = Date.parse("2026-07-16T03:59:00+08:00"), d = Date.parse("2026-07-16T04:01:00+08:00");
  for (const [t, ok] of [[a, false], [b, true], [c, true], [d, false]]) {
    G.casStockUsApply(house, doc, S, t);
    assert.strictEqual(G.casStockBuy(w, house, ID, 1, S, t).ok, ok, twHM(t));
  }
});
T("掛單照盤中每分鐘的價檢查：只看下單之後；成交價是觸發的那個價；玩家很久之後才回來也算", G => {
  const house = house0(G, W), w = wallet(G), base = house.stk.hist[W][ID];
  let doc = null, px = null, lows = null;
  for (let k = 0; k < 50 && !doc; k++) { // 找壹條「下單之後會跌破下單時價格」的路徑（隨機的，換祕密找）
    const d = runDay(G, "祕密" + k, W, { gap: 0.02 }), p = i => Math.max(1, Math.round(base * d.ser[ID][i]));
    const l = []; for (let i = 11; i <= 389; i++) l.push(p(i));
    if (Math.min(...l) + 1 < p(10)) { doc = d; px = p; lows = l; }
  }
  assert.ok(doc, "50 個祕密裡總會有壹條");
  G.casStockUsApply(house, doc, W, tm(G, W, 10));
  const lim = Math.min(...lows) + 1;
  assert.ok(lim < house.stk.px[ID]);
  assert.ok(G.casStockOrder(w, house, "buy", ID, 3, lim, W, tm(G, W, 10)).ok);
  const i0 = lows.findIndex(p => p <= lim) + 11;
  G.casStockMatch(w, house, W, tm(G, W, 10)); assert.strictEqual(w.stk.orders.length, 1);
  const t1 = tm(G, W, i0 - 1); G.casStockUsApply(house, doc, W, t1); G.casStockMatch(w, house, W, t1);
  assert.strictEqual(w.stk.orders.length, 1, "還沒碰到");
  const t2 = tm(G, W, 380); G.casStockUsApply(house, doc, W, t2); G.casStockMatch(w, house, W, t2);
  assert.strictEqual(w.stk.orders.length, 0, "中間碰過就成交"); assert.strictEqual(w.stk.own[ID], 3);
  assert.ok(px(i0) <= lim);
});
T("掛單當天有效：美股收盤（美東 16:00）沒成交就取消退回；夏令冬令都一樣", G => {
  for (const day of [W, S]) {
    const house = house0(G, day), doc = runDay(G, "祕密", day, { gap: 0.02 }), w = wallet(G, day), c0 = w.chips;
    G.casStockUsApply(house, doc, day, tm(G, day, 5));
    const o = G.casStockOrder(w, house, "buy", ID, 1, 1, day, tm(G, day, 5));
    assert.ok(o.ok, o.reason); assert.strictEqual(o.order.exp, day, "當天有效");
    assert.ok(w.chips < c0);
    const a = tm(G, day, 389, 30); G.casStockUsApply(house, doc, day, a); G.casStockMatch(w, house, day, a);
    assert.strictEqual(w.stk.orders.length, 1, "16:00 以前還有效");
    const b = tm(G, day, 390, 30); G.casStockUsApply(house, doc, day, b); G.casStockMatch(w, house, day, b);
    assert.strictEqual(w.stk.orders.length, 0, "收盤取消"); assert.strictEqual(w.chips, c0, "鎖住的退回了");
    assert.strictEqual(G.casStockTakeNotes(w).length, 1);
  }
});
T("睡前掛單：台灣 23:00 掛的限價單，隔天早上起床碰到才回來也照夜裡的價成交／取消", G => {
  const house = house0(G, W), doc = runDay(G, "祕密", W, { gap: 0.02 }), w = wallet(G), w2 = wallet(G);
  const base = house.stk.hist[W][ID], px = i => Math.max(1, Math.round(base * doc.ser[ID][i]));
  const t = tm(G, W, 30); // 台灣 23:00
  G.casStockUsApply(house, doc, W, t);
  const lows = []; for (let i = 31; i <= 390; i++) lows.push(px(i));
  const lim = Math.min(...lows) + 1;
  assert.ok(lim < house.stk.px[ID]);
  assert.ok(G.casStockOrder(w, house, "buy", ID, 1, lim, W, t).ok);
  assert.ok(G.casStockOrder(w2, house, "buy", ID, 1, 1, W, t).ok); // 掛得很低，不會成交
  // 隔天早上 08:00 才回來（資料是隔天的檔案，前一天收進 days）
  const D2 = "2026-11-17", doc2 = G.usDocRoll(doc, D2, 5), morning = Date.parse(D2 + "T08:00:00+08:00");
  G.casStockUsSettle(house, doc2, D2); G.casStockRoll(house, D2, {}); G.casStockUsApply(house, doc2, D2, morning);
  G.casStockMatch(w, house, D2, morning); G.casStockMatch(w2, house, D2, morning);
  assert.strictEqual(w.stk.orders.length, 0); assert.strictEqual(w.stk.own[ID], 1, "夜裡碰到的限價成交");
  assert.strictEqual(w2.stk.orders.length, 0); assert.strictEqual(w2.stk.own[ID], undefined, "沒碰到的取消"); assert.strictEqual(w2.stk.hold, 0);
});
T("05:00 換日：收盤價用 settle 套上去，換日只扣 drag 壹次（冬令收盤剛好 05:00 也不漏、不重複）", G => {
  for (const day of [W, S]) {
    const C = G.NUM.casino.stock, house = house0(G, day), doc = runDay(G, "祕密", day, { gap: 0.03, ret: 0.002 });
    const base = house.stk.hist[day][ID], close = Math.max(1, Math.round(base * doc.ser[ID][390]));
    G.casStockUsApply(house, doc, day, tm(G, day, 100)); // 夜裡有人碰過壹次，價停在盤中
    assert.notStrictEqual(house.stk.px[ID], close);
    const next = new Date(Date.parse(day + "T00:00:00Z") + 86400000).toISOString().slice(0, 10), after = Date.parse(next + "T05:00:30+08:00");
    const doc2 = G.usDocRoll(doc, next, 5);
    G.casStockUsSettle(house, doc2, next);
    assert.strictEqual(house.stk.px[ID], close, "先補上真正的收盤價");
    G.casStockRoll(house, next, { [ID]: 0.1, [ID2]: -0.1 }); // 就算舊程式還傳每日漲跌，也不能再算壹次
    G.casStockUsApply(house, doc2, next, after);
    assert.strictEqual(house.stk.px[ID], Math.round(close * (1 - C.drag / 100)), "只多扣壹次 drag：" + house.stk.px[ID]);
    assert.strictEqual(house.stk.prev[ID], close);
    const again = house.stk.px[ID];
    G.casStockUsSettle(house, doc2, next); G.casStockRoll(house, next, {}); G.casStockUsApply(house, doc2, next, after + 1000);
    assert.strictEqual(house.stk.px[ID], again, "同壹天再碰不會再扣");
  }
});
T("連續幾天（含週六、國定假日）：每個交易日收盤價照盤中走完，沒開盤的日子只扣 drag", G => {
  const C = G.NUM.casino.stock, days = ["2026-11-24", "2026-11-25", HOL, "2026-11-27", "2026-11-28"];
  const house = G.casHouseFix(G.casHouseNew(), days[0]).house; G.casStockHouseFix(house);
  let doc = null;
  for (const [n, day] of days.entries()) {
    const live = day !== HOL && day !== "2026-11-28"; // 假日、週六沒有行情
    const today = live ? runDay(G, "祕密", day, { gap: 0.01 * (n + 1) }) : G.usDocNew(day);
    if (!live) G.usApply(today, G.usNeed(today, 30), 30, null, "x"); // 超過 10:00 沒有開盤價 ＝ 整天不開
    today.days = G.usDocRoll(doc, day, 5).days; doc = today; // 伺服器開新的一天時，舊的收進 days
    const before = house.stk.px[ID];
    G.casStockUsSettle(house, doc, day); G.casStockRoll(house, day, {});
    const open = house.stk.px[ID];
    assert.ok(open <= before && open >= before - 5, day + " 換日只扣 drag");
    G.casStockUsApply(house, doc, day, G.usOpenMs(day) + 395 * 60000);
    if (!live) assert.strictEqual(house.stk.px[ID], open, day + " 休市不動");
    else assert.strictEqual(house.stk.px[ID], Math.max(1, Math.round(house.stk.hist[day][ID] * today.ser[ID][today.ser[ID].length - 1])), day + " 收盤價（提早收盤日 2026-11-27 只到第 210 分鐘）");
  }
  assert.ok(Object.keys(house.stk.hist).length <= C.order.days + 2);
});
T("買賣守恆：美股盤中買賣照樣記帳對得上、手續費進預算池", G => {
  const house = house0(G, W), doc = runDay(G, "祕密", W, { gap: 0.02 }), w = wallet(G);
  const snap = () => G.casBookSnap([w], house, 0, null);
  const op = G.casBookOpening(snap());
  G.casStockUsApply(house, doc, W, tm(G, W, 3));
  const b0 = house.budget;
  assert.ok(G.casStockBuy(w, house, ID, 100, W, tm(G, W, 3)).ok);
  G.casStockUsApply(house, doc, W, tm(G, W, 250));
  assert.ok(G.casStockSell(w, house, ID, "max", W, tm(G, W, 250)).ok);
  assert.ok(house.budget > b0);
  assert.strictEqual(G.casBookGap(snap(), op), 0);
  assert.ok(w.led.burn.stockBuy > 0 && w.led.mint.stockSell > 0);
});
T("view：美股有盤中序列、usState、halted；外層 us 和 usOpenAt；台股欄位照舊；fresh 照舊", G => {
  const house = house0(G, W), doc = runDay(G, "祕密", W, { gap: 0.02 }), w = wallet(G);
  const t = tm(G, W, 30);
  G.casStockUsApply(house, doc, W, t);
  let v = G.casStockView(w, house, W, t);
  const x = v.list.find(y => y.id === ID), n = v.list.find(y => y.id === "nightindex"), tw = v.list.find(y => y.id === TWID);
  assert.strictEqual(x.market, "us"); assert.strictEqual(x.usState, "open"); assert.strictEqual(x.twState, null); assert.strictEqual(x.halted, false);
  assert.strictEqual(x.intraday.length, 31); assert.strictEqual(x.intradayFrom, 0); assert.strictEqual(x.intraday[30], x.price);
  assert.strictEqual(n.market, "us"); assert.strictEqual(n.intraday.length, 31, "指數（用 ETF 的行情）也盤中");
  assert.strictEqual(tw.market, "tw"); assert.strictEqual(tw.usState, null); assert.strictEqual(tw.halted, true, "這時候台股沒開"); assert.strictEqual(J(tw.intraday), "[]");
  assert.strictEqual(J(v.us), J({ state: "open", from: 570, len: 390, early: false }));
  assert.strictEqual(v.usOpenAt, G.usOpenMs(W)); assert.strictEqual(v.halt, false);
  assert.strictEqual(v.tw.state, "closed");
  G.casStockSeen(w, house);
  G.casStockUsApply(house, doc, W, tm(G, W, 31));
  v = G.casStockView(w, house, W, tm(G, W, 31));
  assert.ok(v.list.filter(y => y.fresh).every(y => y.market === "us"), "只有美股會變");
  const t0 = Date.parse(W + "T10:00:00+08:00");
  G.casStockUsApply(house, doc, W, t0);
  v = G.casStockView(w, house, W, t0);
  assert.strictEqual(v.us.state, "pre"); assert.ok(v.list.filter(y => y.market === "us").every(y => y.halted && y.usState === "pre" && y.intraday.length === 0));
  const hol = house0(G, HOL);
  assert.strictEqual(G.casStockView(w, hol, HOL, tm(G, HOL, 60)).us.state, "closed");
});
T("usParseChart：只取今天盤中的 K 棒；開盤＝第壹根的開盤價；落後＝現在和最後壹根 K 棒的差；昨天的資料、缺前收都當沒資料", G => {
  const o = G.usOpenMs(W), sec = ms => Math.floor(ms / 1000);
  const mk = (bars, prev, ts0) => ({ chart: { result: [{ meta: { chartPreviousClose: prev }, timestamp: bars.map((b, i) => sec(ts0 + i * 60000)), indicators: { quote: [{ open: bars.map(b => b[0]), close: bars.map(b => b[1]) }] } }] } });
  const j = mk([[100, 101], [101, 102], [102, 103], [103, null]], 99, o);
  const r = G.usParseChart(j, W, o + 3 * 60000 + 20000);
  assert.strictEqual(r.open, 100); assert.strictEqual(r.px, 103); assert.strictEqual(r.prev, 99);
  assert.ok(Math.abs(r.lag - 0) < 1e-9 || r.lag < 1, "最後壹根有價的是第 2 根（開始於 +2 分），現在 +3:20 → 落後約 0.33 分：" + r.lag);
  const slow = G.usParseChart(j, W, o + 20 * 60000);
  assert.ok(Math.abs(slow.lag - (20 - 2 - 1)) < 1e-9, "落後 17 分：" + slow.lag);
  const yday = mk([[100, 101]], 99, G.usOpenMs("2026-11-13"));
  assert.strictEqual(G.usParseChart(yday, W, o + 60000), null, "今天還沒開盤，介面回昨天的");
  const pre = mk([[90, 91], [100, 101]], 99, o - 60000);
  assert.strictEqual(G.usParseChart(pre, W, o + 120000).open, 100, "盤前的 K 棒不算");
  assert.strictEqual(G.usParseChart(mk([[100, 101]], 0, o), W, o + 60000), null, "沒有前收");
  assert.strictEqual(G.usParseChart(null, W, o), null); assert.strictEqual(G.usParseChart({ chart: { result: null } }, W, o), null);
});
T("提早收盤日的規則：感恩節隔天、12/24（週一～四）、7/3（週一～四）；其他日子、休市日（週五的 12/24、7/3）不算", G => {
  const yes = ["2024-11-29", "2025-11-28", "2026-11-27", "2027-11-26", "2024-12-24", "2025-12-24", "2026-12-24", "2024-07-03", "2025-07-03", "2028-07-03"];
  const no = ["2026-11-26", "2026-11-20", "2026-11-28", "2027-12-24", "2026-07-03", "2026-07-02", "2027-07-02", "2026-12-23", "2026-12-25", "2026-11-16", "2026-07-15", "壞", null, ""];
  for (const d of yes) assert.strictEqual(G.usEarlyClose(d), true, d + " 提早收盤");
  for (const d of no) assert.strictEqual(G.usEarlyClose(d), false, d + " 不是提早收盤");
  assert.strictEqual(G.mkLen("us", "2026-11-27"), G.NUM.casino.stock.us.earlyLen); assert.strictEqual(G.mkLen("us", W), 390); assert.strictEqual(G.mkLen("tw", "2026-11-27"), 270, "台股沒有提早收盤");
  assert.strictEqual(G.NUM.casino.stock.us.earlyLen, 210, "13:00 美東收 ＝ 09:30 起 210 分鐘");
});
T("提早收盤日整天：到 13:00 美東（第 210 分鐘）為止，最後壹個價是真實收盤，不是隨機補到 16:00", G => {
  const EARLY = "2026-11-27", L = G.NUM.casino.stock.us.earlyLen;
  const doc = runDay(G, "祕密", EARLY, { gap: 0.02, ret: 0.002 });
  for (const id of G.US_IDS) {
    const s = doc.ser[id];
    assert.strictEqual(s.length, L + 1, id + " 到收盤為止 " + s.length);
    assert.ok(Math.abs(s[0] - 1.02) < 1e-9, "開盤跳空");
  }
  assert.strictEqual(doc.k, L / G.NUM.casino.stock.us.seg - 1, "最後壹段是第 " + (L / 15 - 1) + " 段，不會再有後面的錨點");
  assert.strictEqual(G.usNeed(doc, L + 5), null, "收盤之後不再要抓"); assert.strictEqual(G.usNeed(G.usDocNew(EARLY), L + 5), null);
  const normal = runDay(G, "祕密", W, { gap: 0.02, ret: 0.002 }); assert.strictEqual(normal.ser[ID].length, 391, "平常的日子照舊 391 個價");
});
T("提早收盤日的狀態、收盤價和換日：13:00 美東以後是 closed，盤中價停在最後壹個價；換日用收盤後壹分鐘補收盤價", G => {
  const EARLY = "2026-11-27", L = G.NUM.casino.stock.us.earlyLen, house = house0(G, EARLY), doc = runDay(G, "x", EARLY, { gap: 0.02 });
  const st = i => G.casStockUsApply(house, doc, EARLY, tm(G, EARLY, i)).st;
  assert.strictEqual(st(0), "open"); assert.strictEqual(st(L - 1), "open"); assert.strictEqual(st(L), "closed", "13:00 就收");
  const T1 = G.casStockUsApply(house, doc, EARLY, tm(G, EARLY, L + 120)); assert.strictEqual(T1.idx, L, "收盤後停在最後壹個價（不是 390）");
  assert.strictEqual(house.stk.px[ID], Math.max(1, Math.round(house.stk.hist[EARLY][ID] * doc.ser[ID][L])), "價 ＝ 收盤");
  const view = G.casStockView(G.casWalletFix(G.casWalletNew(), EARLY), house, EARLY, tm(G, EARLY, 60), []); assert.strictEqual(view.us.len, L, "畫面的場次長度是 210");
  const v2 = G.casStockView(G.casWalletFix(G.casWalletNew(), W), house0(G, W), W, tm(G, W, 60), []); assert.strictEqual(v2.us.len, 390, "平常的日子 390");
  // 換日：settle 在收盤後 1 分鐘套收盤價
  const next = "2026-11-30"; G.casStockUsSettle(house, doc, next); assert.strictEqual(house.stk.px[ID], Math.max(1, Math.round(house.stk.hist[EARLY][ID] * doc.ser[ID][L])), "換日補上的是真的收盤價");
});
T("提早收盤日：usParseChart 只算到 13:00 以前的 K 棒，之後的不算（盤後）", G => {
  const EARLY = "2026-11-27", o = G.usOpenMs(EARLY), mk = (min, c) => ({ t: Math.floor((o + min * 60000) / 1000), c });
  const rows = [mk(0, 100), mk(100, 101), mk(209, 102), mk(215, 150), mk(300, 160)];
  const js = { chart: { result: [{ meta: { chartPreviousClose: 99 }, timestamp: rows.map(r => r.t), indicators: { quote: [{ open: rows.map(r => r.c), close: rows.map(r => r.c) }] } }] } };
  const r = G.usParseChart(js, EARLY, o + 400 * 60000);
  assert.ok(r && r.px === 102, "13:00 以後的 K 棒（盤後）不算：" + (r && r.px));
  const js2 = JSON.parse(JSON.stringify(js)); const r2 = G.usParseChart(js2, "2026-11-30", o + 400 * 60000); assert.strictEqual(r2, null, "別天的資料不算");
});
console.log(`${pass} passed, ${fail} failed（美股盤中）`);
process.exit(fail ? 1 : 0);
