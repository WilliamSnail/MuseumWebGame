// 館外股票照「真實股價的比例」（11-14，規劃 2.8h）：node test/casino_stock_peg.test.cjs（npm test 也會跑）
// 第壹次換比例（價位、持股照比例換股數市值不變、零頭用籌碼補、掛單取消退回、記帳）、之後每天開盤拉回（上限小於手續費加 drag，賺不到）、真實價怎麼拿、畫面欄位、守恆。數字讀 NUM。
const assert = require("assert");
const load = () => { const G = require("./load_shared.cjs").load(); G.NUM.casino.stock.direct = false; return G; }; // 這份測的是舊模型（錨點、橋、drag、拉回）；直接用真實價（2.8l）的在 stocks_direct.test.cjs
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.NUM.casino.grants = []; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const D0 = "2026-11-14", D1 = "2026-11-15", D2 = "2026-11-16", ID = "greeneye", TWID = "handbrain";
const fresh = G => { const w = G.casWalletFix(G.casWalletNew(), D0), house = G.casHouseFix(G.casHouseNew(), D0).house; w.chips = 500000000; G.casStockHouseFix(house); return { w, house }; };
const roll = (G, h, day, reals) => G.casStockRoll(h, day, {}, reals);
const total = (G, s) => G.casBookTotal(G.casBookSnap([s.w], s.house, 0, null));

T("倍數與拉回上限：美股 ×4、台股 ×24；每天最多拉回 2×手續費−drag（小於來回手續費加 drag）", G => {
  const C = G.NUM.casino.stock;
  assert.strictEqual(C.peg.us, 4); assert.strictEqual(C.peg.tw, 24); assert.strictEqual(C.peg.lamPct, 30);
  assert.ok(Math.abs(G.casStockPullMax() - (2 * C.feePct - C.drag) / 100) < 1e-12);
  assert.ok(G.casStockPullMax() < (2 * C.feePct + C.drag) / 100, "拉回量小於來回成本，看盤的人賺不到");
  const f = C.feePct; C.feePct = 0.2; assert.ok(G.casStockPullMax() < 0.01 && G.casStockPullMax() > 0, "手續費降了，上限跟著降"); C.feePct = f;
});
T("第壹次換比例：價位 ＝ 倍數 × 真實價（再扣 drag）；昨天收盤也換；記一筆 peg.ev；之後不再換", G => {
  const C = G.NUM.casino.stock, s = fresh(G), h = s.house, H = h.stk;
  const old = H.px[ID], oldTw = H.px[TWID];
  roll(G, h, D1, { [ID]: { px: 166.19 }, [TWID]: { px: 4120 } });
  const to = Math.round(4 * 166.19), toTw = Math.round(24 * 4120);
  assert.strictEqual(H.px[ID], Math.round(to * (1 - C.drag / 100)), "美股 ×4"); assert.strictEqual(H.px[TWID], Math.round(toTw * (1 - C.drag / 100)), "台股 ×24");
  assert.strictEqual(H.prev[ID], to, "昨天收盤換成新比例，漲跌 % 才對");
  assert.strictEqual(H.hist[D1][ID], H.px[ID]);
  assert.strictEqual(JSON.stringify(H.peg.ev.map(e => [e.id, e.from, e.to]).sort()), JSON.stringify([[ID, old, to], [TWID, oldTw, toTw]].sort()));
  assert.ok(H.peg.done[ID] > 0 && H.peg.done[TWID] > 0 && H.peg.done[ID] !== H.peg.done[TWID], "每支各記壹次");
  const n = H.peg.ev.length; roll(G, h, D2, { [ID]: { px: 166.19 }, [TWID]: { px: 4120 } }); assert.strictEqual(H.peg.ev.length, n, "只換壹次");
  // 沒有真實價的那幾支維持原樣
  const s2 = fresh(G); roll(G, s2.house, D1, { [ID]: { px: 166.19 } }); assert.strictEqual(s2.house.stk.px["redclaw"], Math.round(10000 * (1 - C.drag / 100)), "沒有真實價：照舊"); assert.ok(!s2.house.stk.peg.done["redclaw"]);
  roll(G, fresh(G).house, D1); // 沒給 reals 不丟錯
});
T("錢包照比例換股數：市值不變（零頭用籌碼補、從外面世界來）、掛單取消退回、只換壹次、守恆", G => {
  const s = fresh(G), h = s.house;
  assert.ok(G.casStockBuy(s.w, h, ID, 100, D0, Date.parse(`${D0}T14:30:00+08:00`)).ok || true);
  s.w.stk.own[ID] = 1000; s.w.stk.own[TWID] = 7;
  s.w.stk.orders = [{ no: 1, kind: "buy", id: ID, n: 10, px: 9000, day: D0, exp: D1, hold: 90500 }, { no: 2, kind: "sell", id: ID, n: 5, px: 11000, day: D0, exp: D1, hold: 0 }, { no: 3, kind: "buy", id: "redclaw", n: 1, px: 9000, day: D0, exp: D1, hold: 9045 }];
  s.w.stk.seq = 3; s.w.chips -= 90500 + 9045; s.w.stk.hold = 90500 + 9045;
  const snap0 = G.casBookSnap([s.w], h, 0, null), t0 = G.casBookTotal(snap0) - G.casBookMinted(snap0) + G.casBookBurned(snap0);
  const c0 = s.w.chips, px0 = h.stk.px[ID], pxTw0 = h.stk.px[TWID];
  roll(G, h, D1, { [ID]: { px: 166.19 }, [TWID]: { px: 4120 } });
  const to = Math.round(4 * 166.19), toTw = Math.round(24 * 4120);
  G.casStockPegSync(s.w, h);
  const S = s.w.stk;
  const valueBefore = 1000 * px0; // 換之前用「昨天收盤」的價（H.prev 已換成新比例，這裡用 ev.from）
  const ev = h.stk.peg.ev.find(e => e.id === ID), evTw = h.stk.peg.ev.find(e => e.id === TWID);
  const ns = Math.floor(1000 * ev.from / to), rem = 1000 * ev.from - ns * to;
  assert.strictEqual(S.own[ID], ns, "股數照比例"); assert.ok(rem >= 0 && rem < to, "零頭小於壹股");
  const nsTw = Math.floor(7 * evTw.from / toTw), remTw = 7 * evTw.from - nsTw * toTw;
  if (nsTw > 0) assert.strictEqual(S.own[TWID], nsTw); else assert.strictEqual(S.own[TWID], undefined);
  assert.strictEqual(S.orders.filter(o => o.id === ID).length, 0, "這支的掛單取消"); assert.strictEqual(S.orders.filter(o => o.id === "redclaw").length, 1, "別支的掛單不動");
  assert.strictEqual(S.hold, 9045, "鎖住的籌碼只剩別支的"); assert.strictEqual(s.w.chips, c0 + 90500 + rem + remTw, "退回鎖住的籌碼，加上零頭");
  assert.strictEqual(s.w.led.mint.stockRebase, rem + remTw, "零頭記成從館外進來（stockRebase）");
  assert.ok(S.notes.some(x => /照真實股價的比例/.test(x)), "留話給玩家");
  assert.strictEqual(S.peg, h.stk.peg.seq);
  const snap1 = G.casBookSnap([s.w], h, 0, null); assert.strictEqual(G.casBookTotal(snap1) - G.casBookMinted(snap1) + G.casBookBurned(snap1), t0, "守恆（零頭有記 mint）");
  const own = JSON.stringify(S.own), chips = s.w.chips; G.casStockPegSync(s.w, h); assert.strictEqual(JSON.stringify(S.own), own); assert.strictEqual(s.w.chips, chips, "只換壹次");
  assert.ok(valueBefore > 0 && pxTw0 > 0);
});
T("新錢包（沒有持股）、壞資料：不丟錯；之後才建的錢包不用換", G => {
  const s = fresh(G); roll(G, s.house, D1, { [ID]: { px: 166.19 } });
  const w2 = G.casWalletFix(G.casWalletNew(), D1); const c = w2.chips; G.casStockPegSync(w2, s.house); assert.strictEqual(w2.chips, c); assert.strictEqual(w2.stk.peg, s.house.stk.peg.seq);
  const h2 = G.casHouseFix({ bankroll: 5, stk: { peg: "壞", real: { greeneye: { px: -3 }, 不存在: { px: 5 }, redclaw: { px: 100, sym: 12345, chg: "x" } } } }, D0).house;
  const H = G.casStockHouseFix(h2); assert.strictEqual(H.peg.seq, 0); assert.deepStrictEqual(Object.keys(H.real), ["redclaw"]); assert.strictEqual(H.real.redclaw.sym, ""); assert.strictEqual(H.real.redclaw.chg, 0);
  assert.doesNotThrow(() => G.casStockPegSync(G.casWalletFix(G.casWalletNew(), D0), h2));
});
T("開盤拉回：往「倍數 × 真實價」拉 lamPct% 的差距，壹天不超過 pullMax；方向對", G => {
  const C = G.NUM.casino.stock, cap = G.casStockPullMax(), lam = C.peg.lamPct / 100;
  const target = Math.round(4 * 166.19);
  const s = fresh(G); roll(G, s.house, D1, { [ID]: { px: 166.19 } }); // 先換比例
  const H = s.house.stk;
  // 小差距（在 cap/lam 以內）：拉回 λ×差距
  H.px[ID] = Math.round(target * 1.02); // 比目標高 2%
  roll(G, s.house, D2, { [ID]: { px: 166.19 } });
  const expect = Math.round(Math.round(target * 1.02) * (1 - C.drag / 100) * (1 - lam * (Math.round(target * 1.02) * (1 - C.drag / 100) / target - 1)));
  assert.ok(Math.abs(H.px[ID] - expect) <= 2, `拉回 λ：${H.px[ID]} vs ${expect}`); assert.ok(H.px[ID] < Math.round(target * 1.02 * (1 - C.drag / 100)), "高了往下拉");
  // 大差距：只拉 pullMax
  const s2 = fresh(G); roll(G, s2.house, D1, { [ID]: { px: 166.19 } });
  s2.house.stk.px[ID] = target * 3; roll(G, s2.house, D2, { [ID]: { px: 166.19 } });
  const afterDrag = Math.round(target * 3 * (1 - C.drag / 100));
  assert.ok(Math.abs(s2.house.stk.px[ID] / afterDrag - (1 - cap)) < 0.001, "高很多：壹天只拉 pullMax: " + s2.house.stk.px[ID] / afterDrag);
  s2.house.stk.px[ID] = Math.round(target / 3); roll(G, s2.house, "2026-11-17", { [ID]: { px: 166.19 } });
  assert.ok(s2.house.stk.px[ID] > Math.round(target / 3) * (1 - C.drag / 100) && s2.house.stk.px[ID] / (Math.round(target / 3) * (1 - C.drag / 100)) <= 1 + cap + 0.001, "低很多：往上拉也不超過 pullMax");
});
T("拉回賺不到（性質）：不管差距多大，壹天的拉回量 ≤ pullMax < 來回手續費加 drag，所以收盤前看差距進場也不賺", G => {
  const C = G.NUM.casino.stock, cap = G.casStockPullMax(), cost = (2 * C.feePct + C.drag) / 100;
  for (const D of [-0.7, -0.3, -0.05, -0.01, 0, 0.01, 0.05, 0.3, 1, 3]) {
    const s = fresh(G); roll(G, s.house, D1, { [ID]: { px: 166.19 } });
    const target = Math.round(4 * 166.19), px0 = Math.max(1, Math.round(target * (1 + D)));
    s.house.stk.px[ID] = px0; roll(G, s.house, D2, { [ID]: { px: 166.19 } });
    const afterDrag = Math.max(1, Math.round(px0 * (1 - C.drag / 100))), pull = Math.abs(s.house.stk.px[ID] / afterDrag - 1);
    assert.ok(pull <= cap + 1e-3, `D=${D} 拉回 ${pull}`); assert.ok(pull < cost, "小於來回成本");
  }
});
T("真實價：只給已經算進遊戲價的（今天的錨點，或前壹收盤）；台股美股的代號從伺服器來；換日要用的收盤價從 days 拿", G => {
  const s = fresh(G), h = s.house;
  const tw = { day: D1, prevReal: { [TWID]: 4100 }, R: { [TWID]: { px: 4150, seg: 3 } }, days: { [D0]: { openIdx: 0, ser: {}, close: { [TWID]: 4100 }, prev: { [TWID]: 4000 } } } };
  const us = { day: D0, prevReal: { [ID]: 160 }, R: { [ID]: { px: 166.19, seg: 20 } }, days: {} };
  G.casStockSetReal(h, tw, us, D1, { [TWID]: "ABC", [ID]: "XYZ" });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(h.stk.real[TWID])), { sym: "ABC", px: 4150, chg: 4150 / 4100 - 1 }, "台股：今天的錨點");
  assert.strictEqual(h.stk.real[ID].px, 166.19, "美股：還沒開盤，給前壹個交易日的收盤"); assert.ok(Math.abs(h.stk.real[ID].chg - (166.19 / 160 - 1)) < 1e-9);
  // 換日的收盤價
  h.stk.day = D0;
  const r = G.casStockReals(h, tw, us);
  assert.strictEqual(r[TWID].px, 4100, "台股前壹天的收盤從 days 拿"); assert.strictEqual(r[ID].px, 166.19, "美股前壹天的收盤從 R 拿");
  h.stk.day = D1; assert.strictEqual(G.casStockReals(h, tw, us)[TWID].px, 4150, "doc 就是那壹天：用 R");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(G.casStockReals(h, null, null))), {}); assert.doesNotThrow(() => G.casStockSetReal(h, undefined, "壞", D1, null));
});
T("twDocRoll 換日時留下收盤的真實價和前壹收盤（給開盤拉回用）", G => {
  const old = G.twDocNew(D0); old.openIdx = 0; old.ser = { [TWID]: [1, 1.01] }; old.R = { [TWID]: { px: 4150, seg: 17 }, linetower: null }; old.prevReal = { [TWID]: 4100 };
  const nd = G.twDocRoll(old, D1, 5);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(nd.days[D0].close)), { [TWID]: 4150 }); assert.deepStrictEqual(JSON.parse(JSON.stringify(nd.days[D0].prev)), { [TWID]: 4100 });
});
T("畫面：館外每支多 real（代號、真實價、真實漲跌）和 mult；沒有資料是 null", G => {
  const s = fresh(G), h = s.house;
  const v0 = G.casStockView(s.w, h, D0, Date.parse(`${D0}T14:30:00+08:00`), []);
  assert.ok(v0.list.every(x => x.real === null && x.mult > 0), "沒有資料：null");
  G.casStockSetReal(h, null, { day: D0, prevReal: { [ID]: 160 }, R: { [ID]: { px: 166.19 } }, days: {} }, D0, { [ID]: "XYZ" });
  const x = G.casStockView(s.w, h, D0, Date.parse(`${D0}T14:30:00+08:00`), []).list.find(y => y.id === ID);
  assert.strictEqual(x.real.sym, "XYZ"); assert.strictEqual(x.real.px, 166.19); assert.strictEqual(x.mult, 4);
  assert.strictEqual(G.casStockView(s.w, h, D0, null, []).list.find(y => y.id === TWID).mult, 24);
});
T("shared 裡沒有寫死真實代號（代號只在 functions）", G => {
  const fs = require("fs"), path = require("path");
  for (const f of ["stocks_text.js", "casino_stock.js", "stocks_tw.js", "casino_text.js"]) {
    const src = fs.readFileSync(path.join(__dirname, "..", "shared", f), "utf8");
    assert.ok(!/\b(NVDA|AMD|AAPL|TSLA|MSFT|QQQ|2330|2454|2317|2308|2412)\b/.test(src.replace(/\/\/.*$/gm, "")), f + " 不能有真實代號");
  }
});
console.log(`casino_stock_peg.test：${pass} 過，${fail} 沒過`);
if (fail) process.exit(1);
