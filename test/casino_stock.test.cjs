// 股票（11-14，館外七支）：node test/casino_stock.test.cjs（npm test 也會跑）
// 買賣守恆、手續費進預算池、換日調價和 drag、停盤時段、各種上限、舊錢包壞資料。數字讀 NUM。
const assert = require("assert");
const load = () => { const G = require("./load_shared.cjs").load(); G.NUM.casino.stock.direct = false; return G; }; // 這份測的是舊模型（錨點、橋、drag、拉回）；直接用真實價（2.8l）的在 stocks_direct.test.cjs
let pass = 0, fail = 0;
const J = x => JSON.stringify(x); // load() 的沙箱裡做出來的陣列原型不同，deepStrictEqual 過不了
const T = (name, fn) => { const G = load(); G.US_IDS.length = 0; /* 11-14 起美股也有盤中（test/stocks_us.test.cjs 測）；這份測的是買賣、掛單、記帳的通用機制，用「沒有盤中」的股票（把美股名單清空）跑 */ try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const D = "2026-11-14", ID = "greeneye";
// 台灣時間某天幾點的毫秒（台灣是 UTC+8）
const at = (d, h) => Date.parse(`${d}T${String(h).padStart(2, "0")}:30:00+08:00`);
const OPEN = at(D, 14); // 停盤以外的時間
const fresh = G => { const w = G.casWalletFix(G.casWalletNew(), D), house = G.casHouseFix(G.casHouseNew(), D).house; w.chips = 500000000; G.casStockHouseFix(house); return { w, house }; };
const gap = (G, s, opening) => G.casBookGap(G.casBookSnap([s.w], s.house, 0, null), opening);
const open0 = (G, s) => G.casBookOpening(G.casBookSnap([s.w], s.house, 0, null));
const total = (G, s) => G.casBookTotal(G.casBookSnap([s.w], s.house, 0, null));

T("停盤：沒有全館 22:00～05:00 了，每支只在自己的盤中交易；沒有盤中的股票不看時間", G => {
  const C = G.NUM.casino.stock;
  assert.strictEqual(C.haltFrom, undefined); assert.strictEqual(C.haltTo, undefined);
  const s = fresh(G);
  assert.ok(G.casStockBuy(s.w, s.house, ID, 1, D, at(D, 23)).ok, "沒有盤中的股票（測試把美股名單清空）晚上也能買");
  const r = G.casStockBuy(s.w, s.house, "handbrain", 1, D, at(D, 23));
  assert.ok(!r.ok && r.reason.includes("09:00"), "台股沒開盤不能買");
});
T("買：股價流出館外（記成消失、來源 stockBuy），手續費進預算池；莊家不動；帳對得上", G => {
  const C = G.NUM.casino.stock, s = fresh(G), op = open0(G, s), c0 = s.w.chips, h0 = s.house.bankroll, b0 = s.house.budget;
  const px = s.house.stk.px[ID];
  const r = G.casStockBuy(s.w, s.house, ID, 10, D, OPEN);
  assert.ok(r.ok, r.reason);
  const cost = px * 10, fee = Math.ceil(cost * C.feePct / 100);
  assert.strictEqual(s.w.chips, c0 - cost - fee);
  assert.strictEqual(s.house.bankroll, h0, "莊家不出錢也不收錢（跟外面世界買）");
  assert.strictEqual(s.house.budget, b0 + fee);
  assert.strictEqual(s.house.led.world.stockBuy, cost, "錢給外面世界（池子變多），不是燒掉"); assert.ok(!s.w.led.burn.stockBuy);
  assert.strictEqual(gap(G, s, op), 0, "帳對得上");
  assert.strictEqual(s.w.stk.own[ID], 10);
});
T("賣：從館外進來（記成憑空、來源 stockSell），手續費進預算池；莊家不動；帳對得上；賣光清掉欄位", G => {
  const C = G.NUM.casino.stock, s = fresh(G);
  G.casStockBuy(s.w, s.house, ID, 10, D, OPEN);
  const op = open0(G, s), c0 = s.w.chips, h0 = s.house.bankroll, px = s.house.stk.px[ID];
  const r = G.casStockSell(s.w, s.house, ID, "max", D, OPEN);
  assert.ok(r.ok, r.reason);
  const gross = px * 10, fee = Math.ceil(gross * C.feePct / 100);
  assert.strictEqual(s.w.chips, c0 + gross - fee);
  assert.strictEqual(s.house.bankroll, h0, "莊家不付錢");
  assert.strictEqual(s.house.led.world.stockSell, -gross, "外面世界付（池子變少），不是憑空"); assert.ok(!s.w.led.mint.stockSell);
  assert.strictEqual(gap(G, s, op), 0, "帳對得上");
  assert.strictEqual(s.w.stk.own[ID], undefined, "賣光就不留欄位");
  assert.ok(!G.casStockSell(s.w, s.house, ID, 1, D, OPEN).ok, "沒有了就不能賣");
});
T("買了馬上賣壹定虧（手續費兩次）", G => {
  const s = fresh(G), c0 = s.w.chips;
  G.casStockBuy(s.w, s.house, ID, 100, D, OPEN);
  G.casStockSell(s.w, s.house, ID, "max", D, OPEN);
  assert.ok(s.w.chips < c0, "來回壹趟要虧手續費");
});
T("換日調價：只扣 drag，不再照真實漲跌跳（盤中已經動完了）；同壹天只調壹次", G => {
  const C = G.NUM.casino.stock, s = fresh(G);
  const px0 = s.house.stk.px[ID];
  const r = G.casStockRoll(s.house, D, { [ID]: 0.02 }); // 舊程式還會傳 moves，現在不看
  assert.ok(r.done);
  assert.strictEqual(s.house.stk.px[ID], Math.round(px0 * (1 - C.drag / 100)));
  assert.strictEqual(s.house.stk.prev[ID], px0);
  assert.strictEqual(G.casStockRoll(s.house, D, { [ID]: 0.5 }).done, false, "同壹天不再調");
  const s2 = fresh(G); G.casStockRoll(s2.house, D, { [ID]: 5 });
  assert.strictEqual(s2.house.stk.px[ID], Math.round(10000 * (1 - C.drag / 100)), "大漲的 moves 也不看");
  const s4 = fresh(G); s4.house.stk.px[ID] = 1; G.casStockRoll(s4.house, D, {});
  assert.ok(s4.house.stk.px[ID] >= C.floor, "不會跌到 0");
});
T("什麼都不動的時候，每天會慢慢扣 drag（抱著不會穩賺）", G => {
  const C = G.NUM.casino.stock, s = fresh(G);
  let day = D, px = s.house.stk.px[ID];
  for (let i = 1; i <= 30; i++) { day = `2026-12-${String(i).padStart(2, "0")}`; G.casStockRoll(s.house, day, {}); }
  assert.ok(s.house.stk.px[ID] < px, `30 天後要比 ${px} 低，實際 ${s.house.stk.px[ID]}`);
});
T("上限：莊家窮也買得了（跟外面世界買）；壹人壹天賣出上限還在", G => {
  const s = fresh(G); s.house.bankroll = -100; // 莊家破產
  assert.ok(G.casStockBuy(s.w, s.house, ID, 1000, D, OPEN).ok, "莊家破產也照買（11-14：以前莊家壹窮股市就停擺）");
  const s3 = fresh(G);
  G.casStockBuy(s3.w, s3.house, ID, 5000, D, OPEN); // 5,000 萬
  const sold = G.casStockSell(s3.w, s3.house, ID, 2000, D, OPEN); // 2,000 萬，剛好上限
  assert.ok(sold.ok, sold.reason);
  const over = G.casStockSell(s3.w, s3.house, ID, 1, D, OPEN);
  assert.ok(!over.ok && over.reason.includes("2,000 萬"), "超過壹天賣出上限");
});
T("畫面要的：行情、漲跌、我的持股、停盤", G => {
  const s = fresh(G);
  G.casStockBuy(s.w, s.house, ID, 3, D, OPEN);
  G.casStockRoll(s.house, "2026-11-15", {});
  s.house.stk.px[ID] += 500; // 盤中漲了
  const v = G.casStockView(s.w, s.house, "2026-11-15", OPEN);
  assert.strictEqual(v.list.length, 11);
  const x = v.list.find(y => y.id === ID);
  assert.strictEqual(x.mine, 3); assert.ok(x.chg > 0); assert.strictEqual(x.value, x.price * 3);
  assert.strictEqual(v.total, x.value, "只有這支有持股");
  assert.strictEqual(v.halt, false);
  assert.strictEqual(v.list.find(y => y.id === "handbrain").halted, true, "台股沒開盤：這支停盤");
});
T("舊錢包、壞資料：補欄位，不丟錯", G => {
  const w = G.casWalletFix(G.casWalletNew(), D); delete w.stk;
  assert.strictEqual(J(G.casStockFix(w).own), J({}));
  w.stk = { own: { [ID]: "x", nope: 5, redclaw: 3 }, sold: 7, fee: "a", gain: "b" };
  const S = G.casStockFix(w);
  assert.strictEqual(S.own[ID], undefined, "壞數字丟掉");
  assert.strictEqual(S.own.nope, undefined, "不認得的股票丟掉");
  assert.strictEqual(S.own.redclaw, 3);
  assert.strictEqual(S.fee, 0); assert.strictEqual(S.gain, 0);
  const house = G.casHouseFix(G.casHouseNew(), D).house;
  house.stk = { px: { [ID]: "bad", nope: 1 }, held: null };
  const H = G.casStockHouseFix(house);
  assert.strictEqual(H.px[ID], G.NUM.casino.stock.start, "壞股價回到起始");
  assert.strictEqual(H.px.nope, undefined);
  assert.doesNotThrow(() => G.casStockRoll(house, "bad", {}));
  assert.doesNotThrow(() => G.casStockView(w, house, D, OPEN));
});
T("換日調價不看每日資料：每支都只扣 drag（漲跌都在盤中動，不會一天動兩遍；11-14 規劃 2.8i）", G => {
  const C = G.NUM.casino.stock, s = fresh(G);
  const daily = { days: { "2026-11-12": { greeneye: -4.34, redclaw: 5.86, nightindex: -0.39, islandforge: -2.3, silverapple: -0.21, flashcar: 1.69, squarewin: 0.36 } } };
  const moves = G.outStockMovesFor(daily, "2026-11-13", G.STOCK_IDS); // 這個函式還在（每日資料的檢查用），但換日不吃它
  assert.ok(new Set(Object.values(moves)).size > 1);
  G.casStockRoll(s.house, "2026-11-13", moves);
  for (const id of G.STOCK_IDS) assert.strictEqual(s.house.stk.px[id], Math.round(C.start * (1 - C.drag / 100)), id);
});
T("畫面：莊家的錢不影響能不能買（exposeLeft 是 null、houseBroke 是 false）", G => {
  const s1 = fresh(G); s1.house.bankroll = -5;
  const v = G.casStockView(s1.w, s1.house, D, OPEN);
  assert.strictEqual(v.exposeLeft, null); assert.strictEqual(v.houseBroke, false);
});
T("莊家破產換日不再印錢（11-14：翊文「這不行，莊家要跟整個經濟系統接軌才行」）：改借錢、記債", G => {
  assert.strictEqual(G.NUM.casino.houseResetMint, false, "預設關掉");
  const h = G.casHouseFix(G.casHouseNew(), D).house; h.bankroll = -830000000; h.econ.perDay = 0;
  const r = G.casHouseFix(h, "2026-11-15");
  assert.ok(!(r.house.led && r.house.led.mint && r.house.led.mint.reset), "沒有印錢補回（reset）");
  assert.strictEqual(r.house.debt.budget + r.house.debt.world, r.house.bankroll + 830000000, "借了多少，債就記多少");
  assert.ok(r.house.bankroll < G.NUM.casino.houseLoan.reserve, "借不夠補到準備金（外面世界有上限）");
  assert.ok(r.house.debt.world + r.house.debt.budget > 0, "借的記成債");
});
T("文化部借款 10 億只撥壹次、記成館外進來、記成債（11-13 翊文；11-14 改成借款）", G => {
  const h = G.casHouseNew(); h.bankroll = -830000000; delete h.grants;
  const r = G.casHouseFix(h, "2026-11-14").house;
  assert.strictEqual(r.bankroll, -830000000 + 1000000000, "撥了 10 億");
  assert.strictEqual(r.led.flow.grant, 1000000000, "外面世界撥給莊家，來源 grant");
  assert.strictEqual(r.debt.culture, 1000000000, "記成債");
  const n = G.casHouseFix(r, "2026-11-15").house;
  assert.strictEqual(n.led.flow.grant, 1000000000, "第二次不再撥");
  assert.ok(n.debt.culture < 1000000000, "莊家有賺就還");
});
T("大廳的「新」：館外幾支股票的價自從上次看過之後變過；看過歸零，價再變又加（11-13）", G => {
  const w = G.casWalletFix(G.casWalletNew(), D), h = G.casHouseFix(G.casHouseNew(), D).house; G.casStockHouseFix(h);
  assert.strictEqual(G.casStockFreshN(w, h), G.OUT_STOCKS.length, "沒看過：全部算新");
  G.casStockSeen(w, h);
  assert.strictEqual(G.casStockFreshN(w, h), 0, "看過了");
  h.stk.px[ID] += 7;
  assert.strictEqual(G.casStockFreshN(w, h), 1, "壹支變了");
});
T("掛單的價和股數輸入：逗號、空白、全形逗號都清掉；字母 s 不會被吃掉（以前正則少了反斜線）", G => {
  const s = fresh(G), H = s.house.stk, px = H.px[ID];
  const r = G.casStockOrder(s.w, s.house, "buy", ID, "1 0", Math.floor(px * 0.9).toLocaleString("en-US"), D, OPEN);
  assert.ok(r.ok, r.reason); assert.strictEqual(r.order.n, 10); assert.strictEqual(r.order.px, Math.floor(px * 0.9));
  const bad = G.casStockOrder(s.w, s.house, "buy", ID, "1s0", px - 1, D, OPEN); assert.ok(!bad.ok, "帶字母 s 的股數要被擋，不是被吃成 10");
});
console.log(`casino_stock.test：${pass} 過，${fail} 沒過`);
if (fail) process.exit(1);
