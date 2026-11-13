// 台股盤中（11-14，規劃 2.8d）：node test/stocks_tw.test.cjs（npm test 也會跑）
// 開盤價才開、15 分鐘錨點加隨機、橋、種子祕密、停盤、掛單照盤中價檢查、view 的盤中資料、守恆。數字讀 NUM。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const J = x => JSON.stringify(x);
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 5).join("\n    ")); } };
const D = "2026-11-16"; // 星期一
const TWID = "handbrain", USID = "greeneye";
const at = (d, hh, mm) => Date.parse(`${d}T${String(hh).padStart(2, "0")}:${String(mm || 0).padStart(2, "0")}:00+08:00`);
const prevReal = { islandforge: 1000, handbrain: 1200, bigassembly: 200, trianglepower: 400, linetower: 120 };
const openGot = (G, gap, lag) => { const o = {}; for (const id of G.TW_IDS) o[id] = { open: prevReal[id] * (1 + gap), prev: prevReal[id], lag: lag == null ? 0 : lag }; return o; };
const segGot = (G, base, j, ret, lag) => { const o = {}; for (const id of G.TW_IDS) o[id] = { px: base[id] * Math.pow(1 + ret, j), lag: lag == null ? 0 : lag }; return o; };
// 跑壹整天：每分鐘問 twNeed，要抓就抓。opts：gap、ret（每段真實漲跌）、lag、failSeg（這幾段抓不到）、openAt（第幾分鐘才抓得到開盤價）
function runDay(G, secret, opts) {
  opts = opts || {};
  const doc = G.twDocNew(D), base = Object.fromEntries(G.TW_IDS.map(id => [id, prevReal[id] * (1 + (opts.gap || 0))]));
  for (let idx = 0; idx <= 270; idx++) {
    const need = G.twNeed(doc, idx);
    if (!need) continue;
    let got = null;
    if (need.kind === "open") got = idx >= (opts.openAt || 0) ? openGot(G, opts.gap || 0, opts.lag) : null;
    else if (need.kind === "seg" && need.fetch && !(opts.failSeg || []).includes(need.j)) got = segGot(G, base, need.j, opts.ret || 0, opts.lag);
    G.twApply(doc, need, idx, got, secret);
  }
  return doc;
}
const house0 = (G, day) => { const house = G.casHouseFix(G.casHouseNew(), day).house; G.casStockRoll(house, day, {}); return house; };
const wallet = G => { const w = G.casWalletFix(G.casWalletNew(), D); w.chips = 500000000; return w; };

T("台股名單：五支，美股白天停著（沒有 tw 標記）", G => {
  assert.strictEqual(J(G.TW_IDS.slice().sort()), J(["bigassembly", "handbrain", "islandforge", "linetower", "trianglepower"]));
  assert.ok(G.stockIsTw(TWID) && !G.stockIsTw(USID));
  for (const id of G.TW_IDS) assert.ok(G.NUM.casino.stock.tw.sd15[id] > 0, id + " 要有 15 分鐘標準差");
});
T("真實成分 X：落後 ≤5 分 0.4、5～20 分 0.3、更久 0.25；壞值當最久", G => {
  assert.strictEqual(G.twXOf(0), 0.4); assert.strictEqual(G.twXOf(5), 0.4); assert.strictEqual(G.twXOf(6), 0.3);
  assert.strictEqual(G.twXOf(20), 0.3); assert.strictEqual(G.twXOf(21), 0.25); assert.strictEqual(G.twXOf(null), 0.25); assert.strictEqual(G.twXOf(NaN), 0.25);
});
T("台灣時間距離 09:00 幾分鐘", G => {
  assert.strictEqual(G.twIdx(at(D, 9, 0)), 0); assert.strictEqual(G.twIdx(at(D, 13, 30)), 270); assert.strictEqual(G.twIdx(at(D, 8, 59)), -1);
  assert.strictEqual(G.twIdx(null), null);
});
T("twNeed：09:00 起要抓開盤價；30 分鐘還沒抓到就放棄；錨點時間到才抓，重試 3 分鐘後不抓了", G => {
  const C = G.NUM.casino.stock.tw, d = G.twDocNew(D);
  assert.strictEqual(G.twNeed(d, -1), null);
  assert.strictEqual(G.twNeed(d, 0).kind, "open"); assert.strictEqual(G.twNeed(d, C.giveUp - 1).kind, "open");
  assert.strictEqual(G.twNeed(d, C.giveUp).kind, "giveup");
  G.twApply(d, G.twNeed(d, C.giveUp), C.giveUp, null, "s");
  assert.strictEqual(d.closed, true); assert.strictEqual(G.twNeed(d, 100), null, "放棄之後整天不開");
  const e = G.twDocNew(D);
  assert.ok(G.twApply(e, G.twNeed(e, 0), 0, openGot(G, 0), "s")); assert.strictEqual(e.openIdx, 0); assert.strictEqual(e.k, 0);
  assert.strictEqual(G.twNeed(e, 14), null, "下壹個錨點還沒到");
  assert.strictEqual(J(G.twNeed(e, 15)), J({ kind: "seg", j: 1, fetch: true }));
  assert.strictEqual(G.twNeed(e, 15 + C.retry).fetch, false, "過了重試時間不抓了");
});
T("開盤價壞資料：回 false 沒開；有壹支有資料就開，另外幾支標沒資料", G => {
  const d = G.twDocNew(D);
  const bad = {}; for (const id of G.TW_IDS) bad[id] = { open: "x", prev: -1 };
  assert.strictEqual(G.twApply(d, G.twNeed(d, 0), 0, bad, "s"), false); assert.strictEqual(d.openIdx, null);
  const part = openGot(G, 0.01); part.linetower = { open: NaN, prev: 120 };
  assert.ok(G.twApply(d, G.twNeed(d, 5), 5, part, "s"));
  assert.strictEqual(d.openIdx, 5); assert.strictEqual(d.stale.linetower, true); assert.ok(!d.stale.handbrain);
});
T("第 0 個價 ＝ 真實開盤價 ÷ 前收（跳空）；整天 271 個價、都在 ±10% 內", G => {
  const doc = runDay(G, "祕密", { gap: 0.03 });
  for (const id of G.TW_IDS) {
    const s = doc.ser[id];
    assert.strictEqual(s.length, 271, id);
    assert.ok(Math.abs(s[0] - 1.03) < 1e-9, id + " 開盤跳空 3%");
    assert.ok(s.every(x => x >= 0.9 - 1e-9 && x <= 1.1 + 1e-9), id + " 夾在 ±10%");
  }
  assert.strictEqual(doc.k, 17);
  assert.strictEqual(G.twNeed(doc, 270), null, "18 段都建好了");
});
T("種子有祕密：同樣的輸入同樣的結果；換祕密整條都不同；doc 裡沒有祕密", G => {
  const a = runDay(G, "祕密甲", { gap: 0.01 }), b = runDay(G, "祕密甲", { gap: 0.01 }), c = runDay(G, "祕密乙", { gap: 0.01 });
  assert.strictEqual(J(a.ser), J(b.ser)); assert.notStrictEqual(J(a.ser[TWID]), J(c.ser[TWID]));
  assert.ok(!J(a).includes("祕密甲"));
});
T("真實成分：上壹段真實漲 1%，X＝0.4 時錨點平均多漲 0.4%；落後久了 X 變 0.25", G => {
  const avg = (ret, lag) => { let sum = 0; const N = 400; for (let i = 0; i < N; i++) { const d = runDay(G, "k" + i, { ret, lag }); sum += d.ser[TWID][30] / d.ser[TWID][15] - 1; } return sum / N; };
  const base = avg(0, 0), up = avg(0.01, 0), slow = avg(0.01, 30);
  assert.ok(Math.abs(up - base - 0.004) < 0.0009, "X＝0.4：" + (up - base));
  assert.ok(Math.abs(slow - base - 0.0025) < 0.0009, "X＝0.25：" + (slow - base));
});
T("抓不到的那壹段：真實成分當 0、標沒資料；上壹段沒抓到的下壹段也不算真實", G => {
  const hi = fail_ => { let sum = 0; const N = 300; for (let i = 0; i < N; i++) { const d = runDay(G, "f" + i, { ret: 0.02, failSeg: fail_ }); sum += d.ser[TWID][45] / d.ser[TWID][30] - 1; } return sum / N; };
  const none = hi([]), failed = hi([2]);
  assert.ok(none > failed + 0.004, "有抓到才有真實成分：" + none + " vs " + failed);
  const e = G.twDocNew(D); G.twApply(e, G.twNeed(e, 0), 0, openGot(G, 0), "x");
  G.twApply(e, { kind: "seg", j: 1, fetch: false }, 20, null, "x");
  assert.strictEqual(e.stale[TWID], true); assert.strictEqual(e.k, 1);
});
T("遲到才抓到：錨點時間到抓到之間的價是平的", G => {
  const d = G.twDocNew(D); G.twApply(d, G.twNeed(d, 0), 0, openGot(G, 0), "x");
  G.twApply(d, G.twNeed(d, 17), 17, segGot(G, prevReal, 1, 0.01), "x");
  const s = d.ser[TWID];
  assert.strictEqual(s[16], s[15]); assert.strictEqual(s[17], s[15]); assert.strictEqual(s.length, 31);
});
T("開盤晚抓到：openIdx ＝ 抓到的分鐘；超過 09:30 還沒有開盤價整天不開", G => {
  const d = runDay(G, "x", { openAt: 20 });
  assert.strictEqual(d.openIdx, 20); assert.strictEqual(d.ser[TWID][0], d.ser[TWID][20]); assert.strictEqual(d.ser[TWID].length, 271);
  const g = runDay(G, "x", { openAt: 31 });
  assert.strictEqual(g.openIdx, null); assert.strictEqual(g.closed, true);
});
T("twDocRoll：隔天收進 days（只留 keep 天），今天的不動", G => {
  const doc = runDay(G, "x", {});
  assert.strictEqual(G.twDocRoll(doc, D), doc);
  let n = doc;
  for (let i = 1; i <= 7; i++) { n = G.twDocRoll(n, `2026-11-${16 + i}`, 5); n.openIdx = 0; n.ser = { [TWID]: [1] }; }
  assert.ok(Object.keys(n.days).length <= 5); assert.ok(n.days["2026-11-22"]);
});

// ---------- 遊戲這邊 ----------
const TW = G => runDay(G, "祕密", { gap: 0.02 });
T("狀態：開盤前 pre、沒第壹個價 pending、超過 09:30 closed、抓到後 open、13:30 closed；週末 closed", G => {
  const house = house0(G, D), doc = TW(G), none = G.twDocNew(D);
  const st = (tw, h, m) => G.casStockTwApply(house, tw, D, at(D, h, m)).st;
  assert.strictEqual(st(doc, 8, 59), "pre");
  assert.strictEqual(st(none, 9, 5), "pending"); assert.strictEqual(st(null, 9, 29), "pending"); assert.strictEqual(st(null, 9, 30), "closed");
  assert.strictEqual(st(doc, 9, 0), "open"); assert.strictEqual(st(doc, 13, 29), "open"); assert.strictEqual(st(doc, 13, 30), "closed");
  const late = runDay(G, "x", { openAt: 7 }); assert.strictEqual(st(late, 9, 6), "pending"); assert.strictEqual(st(late, 9, 7), "open");
  const giveup = G.twDocNew(D); giveup.closed = true; assert.strictEqual(st(giveup, 9, 10), "closed");
  const sat = "2026-11-14", hs = house0(G, sat);
  assert.strictEqual(G.casStockTwApply(hs, doc, sat, at(sat, 10, 0)).st, "closed");
  const unrolled = G.casHouseFix(G.casHouseNew(), D).house;
  assert.strictEqual(G.casStockTwApply(unrolled, doc, D, at(D, 10, 0)).st, "closed", "還沒換日調價台股不開");
});
T("股價 ＝ 今天開盤價 × rel；每個分鐘跟著走；13:30 之後停在最後一個價；美股不動", G => {
  const house = house0(G, D), doc = TW(G), base = house.stk.hist[D][TWID], us = house.stk.px[USID];
  G.casStockTwApply(house, doc, D, at(D, 9, 0));
  assert.strictEqual(house.stk.px[TWID], Math.round(base * doc.ser[TWID][0]));
  G.casStockTwApply(house, doc, D, at(D, 10, 7));
  assert.strictEqual(house.stk.px[TWID], Math.round(base * doc.ser[TWID][67]));
  assert.strictEqual(house.stk.tw.ser[TWID].length, 68, "盤中序列從開盤到現在");
  G.casStockTwApply(house, doc, D, at(D, 15, 0));
  assert.strictEqual(house.stk.px[TWID], Math.round(base * doc.ser[TWID][270]));
  assert.strictEqual(house.stk.px[USID], us);
});
T("停盤：台股只在開盤時間買賣、下單、取消；美股照舊", G => {
  const house = house0(G, D), doc = TW(G), w = wallet(G);
  G.casStockTwApply(house, doc, D, at(D, 8, 30));
  const r = G.casStockBuy(w, house, TWID, 1, D, at(D, 8, 30));
  assert.ok(!r.ok && r.reason.includes("09:00"), "開盤前不能買");
  assert.ok(G.casStockBuy(w, house, USID, 1, D, at(D, 8, 30)).ok, "美股這時候可以買");
  G.casStockTwApply(house, doc, D, at(D, 9, 10));
  assert.ok(G.casStockBuy(w, house, TWID, 2, D, at(D, 9, 10)).ok);
  const px = house.stk.px[TWID];
  const o = G.casStockOrder(w, house, "buy", TWID, 1, px - 1, D, at(D, 9, 10));
  assert.ok(o.ok, o.reason); assert.strictEqual(w.stk.orders[0].at, 10, "記下是第幾分鐘下的");
  G.casStockTwApply(house, doc, D, at(D, 14, 0));
  assert.ok(!G.casStockCancel(w, o.order.no, D, at(D, 14, 0), house).ok, "收盤後不能取消");
  assert.ok(!G.casStockSell(w, house, TWID, 1, D, at(D, 14, 0)).ok, "收盤後不能賣");
  assert.ok(!G.casStockOrder(w, house, "buy", TWID, 1, 1, D, at(D, 14, 0)).ok);
  G.casStockTwApply(house, doc, D, at(D, 9, 20));
  assert.ok(G.casStockCancel(w, o.order.no, D, at(D, 9, 20), house).ok, "開盤時間可以取消");
});
T("掛單照盤中每分鐘的價檢查：只看下單之後；成交價是觸發的那個價", G => {
  const house = house0(G, D), doc = TW(G), w = wallet(G);
  const base = house.stk.hist[D][TWID], px = i => Math.max(1, Math.round(base * doc.ser[TWID][i]));
  G.casStockTwApply(house, doc, D, at(D, 9, 10));
  const now = house.stk.px[TWID];
  const lows = []; for (let i = 11; i <= 269; i++) lows.push(px(i));
  const lim = Math.min(...lows) + 1;
  assert.ok(lim < now, "固定種子下，這條路徑下單之後會跌破（若改了亂數，換個祕密）");
  const o = G.casStockOrder(w, house, "buy", TWID, 3, lim, D, at(D, 9, 10));
  assert.ok(o.ok, o.reason);
  const i0 = lows.findIndex(p => p <= lim) + 11;
  G.casStockMatch(w, house, D, at(D, 9, 10)); assert.strictEqual(w.stk.orders.length, 1);
  const t1 = at(D, 9, 0) + (i0 - 1) * 60000;
  G.casStockTwApply(house, doc, D, t1); G.casStockMatch(w, house, D, t1);
  assert.strictEqual(w.stk.orders.length, 1, "還沒碰到");
  G.casStockTwApply(house, doc, D, at(D, 13, 0)); G.casStockMatch(w, house, D, at(D, 13, 0));
  assert.strictEqual(w.stk.orders.length, 0, "玩家很久之後才回來，中間碰過就成交"); assert.strictEqual(w.stk.own[TWID], 3);
  assert.ok(px(i0) <= lim);
  assert.strictEqual(G.casStockTakeNotes(w).length, 1);
});
T("下單之前的價不算：下單時的價比限價還低的盤中低點不會讓單成交", G => {
  const house = house0(G, D), doc = TW(G), w = wallet(G);
  const base = house.stk.hist[D][TWID], px = i => Math.max(1, Math.round(base * doc.ser[TWID][i]));
  // 找壹個分鐘 i，之前有比它更低的價，之後都比它高
  let pick = -1;
  for (let i = 200; i < 269; i++) { const before = Math.min(...Array.from({ length: i }, (_, k) => px(k))), after = Math.min(...Array.from({ length: 270 - i }, (_, k) => px(i + 1 + k))); if (before < px(i) - 1 && after > before + 1) { pick = i; break; } }
  if (pick < 0) return; // 這個種子沒有這種形狀，跳過
  const t = at(D, 9, 0) + pick * 60000;
  G.casStockTwApply(house, doc, D, t);
  const before = Math.min(...Array.from({ length: pick }, (_, k) => px(k)));
  const lim = before + 1; if (lim >= px(pick)) return;
  const after = Math.min(...Array.from({ length: 270 - pick }, (_, k) => px(pick + 1 + k)));
  if (after <= lim) return;
  assert.ok(G.casStockOrder(w, house, "buy", TWID, 1, lim, D, t).ok);
  G.casStockTwApply(house, doc, D, at(D, 13, 29)); G.casStockMatch(w, house, D, at(D, 13, 29));
  assert.strictEqual(w.stk.orders.length, 1, "下單之前的低點不算");
});
T("隔天才回來：前壹天盤中碰過的限價也算", G => {
  const house = house0(G, D), doc = TW(G), w = wallet(G);
  const base = house.stk.hist[D][TWID], all = doc.ser[TWID].map(r => Math.max(1, Math.round(base * r)));
  G.casStockTwApply(house, doc, D, at(D, 9, 5));
  const lim = Math.min(...all.slice(6)) + 1;
  assert.ok(lim < all[5]);
  assert.ok(G.casStockOrder(w, house, "buy", TWID, 1, lim, D, at(D, 9, 5)).ok);
  const D2 = "2026-11-17", doc2 = G.twDocRoll(doc, D2, 5);
  G.casStockTwSettle(house, doc2, D2);
  assert.strictEqual(house.stk.px[TWID], all[270], "換日以前先補上收盤價");
  G.casStockRoll(house, D2, {});
  G.casStockTwApply(house, doc2, D2, at(D2, 5, 30));
  G.casStockMatch(w, house, D2, at(D2, 5, 30));
  assert.strictEqual(w.stk.orders.length, 0, "前壹天盤中碰到了就成交"); assert.strictEqual(w.stk.own[TWID], 1);
});
T("換日調價：台股不跳（只扣 drag），開盤跳空由第 0 個價給", G => {
  const house = G.casHouseFix(G.casHouseNew(), D).house; G.casStockHouseFix(house);
  const p0 = house.stk.px[TWID];
  const r = G.casStockRoll(house, D, { [TWID]: 0.09, [USID]: 0.09 });
  assert.ok(house.stk.px[TWID] <= p0 && house.stk.px[TWID] >= p0 - 5, "台股只扣 drag：" + house.stk.px[TWID]);
  assert.ok(house.stk.px[USID] > p0, "美股照真實跳");
  assert.ok(r.moves[TWID] < 0);
});
T("買賣守恆：台股盤中買賣照樣記帳對得上、手續費進預算池", G => {
  const house = house0(G, D), doc = TW(G), w = wallet(G);
  const snap = () => G.casBookSnap([w], house, 0, null);
  const op = G.casBookOpening(snap());
  G.casStockTwApply(house, doc, D, at(D, 9, 3));
  const b0 = house.budget;
  assert.ok(G.casStockBuy(w, house, TWID, 100, D, at(D, 9, 3)).ok);
  G.casStockTwApply(house, doc, D, at(D, 11, 40));
  assert.ok(G.casStockSell(w, house, TWID, "max", D, at(D, 11, 40)).ok);
  assert.ok(house.budget > b0);
  assert.strictEqual(G.casBookGap(snap(), op), 0);
});
T("view：台股有盤中序列、狀態、halted；其他股是空陣列；fresh 按「看過了」後變 false，價格再變又變 true", G => {
  const house = house0(G, D), doc = TW(G), w = wallet(G);
  G.casStockTwApply(house, doc, D, at(D, 9, 30));
  let v = G.casStockView(w, house, D, at(D, 9, 30));
  const x = v.list.find(y => y.id === TWID), u = v.list.find(y => y.id === USID);
  assert.strictEqual(x.market, "tw"); assert.strictEqual(x.twState, "open"); assert.strictEqual(x.halted, false);
  assert.strictEqual(x.intraday.length, 31); assert.strictEqual(x.intradayFrom, 0); assert.strictEqual(x.intraday[30], x.price);
  assert.strictEqual(u.market, "us"); assert.strictEqual(J(u.intraday), "[]"); assert.strictEqual(u.twState, null);
  assert.strictEqual(v.tw.state, "open");
  assert.ok(v.list.every(y => y.fresh === true), "沒看過：都是新的");
  G.casStockSeen(w, house);
  v = G.casStockView(w, house, D, at(D, 9, 30));
  assert.ok(v.list.every(y => y.fresh === false));
  G.casStockTwApply(house, doc, D, at(D, 9, 31));
  v = G.casStockView(w, house, D, at(D, 9, 31));
  assert.ok(v.list.filter(y => y.fresh).every(y => y.market === "tw"), "只有台股會變");
  G.casStockTwApply(house, doc, D, at(D, 8, 0));
  assert.strictEqual(G.casStockView(w, house, D, at(D, 8, 0)).list.find(y => y.id === TWID).halted, true);
});
T("舊錢包、壞資料：補欄位不丟錯（at、seen、house.stk.tw）", G => {
  const w = G.casWalletFix(G.casWalletNew(), D);
  w.stk = { own: {}, orders: [{ no: 1, kind: "buy", id: TWID, n: 1, px: 5, day: D, exp: D, hold: 5, at: "x" }], seen: { [TWID]: "bad", nope: 3 } };
  const S = G.casStockFix(w);
  assert.strictEqual(S.orders[0].at, 0); assert.strictEqual(J(S.seen), J({}));
  const house = G.casHouseFix(G.casHouseNew(), D).house; house.stk = { tw: "壞的", px: {} };
  assert.doesNotThrow(() => G.casStockHouseFix(house));
  assert.doesNotThrow(() => G.casStockTwApply(house, { day: D, ser: "x", openIdx: 0 }, D, at(D, 10, 0)));
  assert.doesNotThrow(() => G.casStockTwApply(house, null, D, at(D, 10, 0)));
  assert.doesNotThrow(() => G.casStockTwApply(house, {}, D, null));
});
T("掛單有效到當天收盤：台股 13:30 沒成交就取消退回；美股還是看明天 05:00", G => {
  const house = house0(G, D), doc = TW(G), w = wallet(G);
  G.casStockTwApply(house, doc, D, at(D, 9, 5));
  const px = house.stk.px[TWID], c0 = w.chips;
  const o = G.casStockOrder(w, house, "buy", TWID, 1, 1, D, at(D, 9, 5));
  assert.ok(o.ok, o.reason); assert.strictEqual(o.order.exp, D, "台股當天有效");
  const u = G.casStockOrder(w, house, "buy", USID, 1, 1, D, at(D, 9, 5));
  assert.ok(u.ok); assert.strictEqual(u.order.exp, "2026-11-17", "美股有效到下壹次換日");
  G.casStockTwApply(house, doc, D, at(D, 13, 29)); G.casStockMatch(w, house, D, at(D, 13, 29));
  assert.strictEqual(w.stk.orders.length, 2, "13:30 以前還有效");
  G.casStockTwApply(house, doc, D, at(D, 13, 31)); G.casStockMatch(w, house, D, at(D, 13, 31));
  assert.strictEqual(w.stk.orders.length, 1, "台股那張收盤取消"); assert.strictEqual(w.stk.orders[0].id, USID);
  assert.ok(px > 1 && w.chips > c0 - 10, "鎖住的退回了");
});
T("掛單有效到當天收盤：隔天才回來也取消（先檢查前壹天盤中的價）", G => {
  const house = house0(G, D), doc = TW(G), w = wallet(G);
  G.casStockTwApply(house, doc, D, at(D, 9, 5));
  assert.ok(G.casStockOrder(w, house, "buy", TWID, 1, 1, D, at(D, 9, 5)).ok);
  const D2 = "2026-11-17", doc2 = G.twDocRoll(doc, D2, 5);
  G.casStockTwSettle(house, doc2, D2); G.casStockRoll(house, D2, {}); G.casStockTwApply(house, doc2, D2, at(D2, 5, 30));
  G.casStockMatch(w, house, D2, at(D2, 5, 30));
  assert.strictEqual(w.stk.orders.length, 0); assert.strictEqual(w.stk.hold, 0);
});
console.log(`${pass} passed, ${fail} failed（台股盤中）`);
process.exit(fail ? 1 : 0);
