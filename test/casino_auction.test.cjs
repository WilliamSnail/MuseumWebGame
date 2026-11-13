// 藝術市場第二步：畫的拍賣（11-14）：node test/casino_auction.test.cjs（npm test 也會跑）
// 封閉式第二價、同價先出的得標、只有壹人出價付底價、沒人出價、鎖籌碼和退回、守恆、重複收標不會付兩次、玩家拍自己的畫（底價範圍、溢價上限、手續費、帳號年齡、取消）、畫面不洩漏別人的出價。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const DAY = "2026-11-16", WORK = "2026-W47/r1";
const T0 = Date.UTC(2026, 10, 16, 2, 0, 0); // 11-16 10:00 台灣
const world = (G, n = 3) => {
  const house = G.casHouseFix(G.casHouseNew(), DAY).house, doc = G.casAucDocFix({}), wallets = {}, saves = {};
  for (let i = 1; i <= n; i++) {
    const w = G.casWalletFix(G.casWalletNew(), DAY); w.chips = 50000000; G.casBondFix(w, DAY).born = "2026-01-01";
    wallets["u" + i] = w; saves["u" + i] = {};
  }
  return { G, house, doc, wallets, saves };
};
const sum = W => W.G.casBookTotal(W.G.casBookSnap(Object.values(W.wallets), W.house, 0, null));
const open = (W, tier = 2, date = DAY) => { W.G.casAucOpenHouse(W.doc, [{ id: WORK, date, tier, title: "珍藏的畫" }], DAY, T0, W.house); return W.doc.open[0]; };
const bid = (W, u, amt, now = T0 + 1000) => W.G.casAucBid(W.doc, W.wallets[u], W.saves[u], u, "h~" + WORK, amt, DAY, now);
const settle = (W, now = T0 + 4 * 86400000) => W.G.casAucSettle(W.doc, "h~" + WORK, { house: W.house, wallets: W.wallets, saves: W.saves, day: "2026-11-19", nowMs: now });
const own = (W, u) => W.G.casArtFix(W.saves[u]).own;

T("收標時間：展出那天起 3 天後的台灣 22:00", G => {
  assert.strictEqual(G.casAucCloseAt("2026-11-16"), Date.UTC(2026, 10, 19, 14, 0, 0));
  assert.strictEqual(new Date(G.casAucCloseAt("2026-11-30") + 8 * 3600000).toISOString().slice(0, 16), "2026-12-03T22:00");
});
T("哪些畫開拍：珍藏孤品或標 auction；不重開；收標時間過了不補；還沒展出不開", G => {
  const W = world(G), mk = (id, date, tier, auction) => ({ id, date, tier, title: id, auction });
  const n = G.casAucOpenHouse(W.doc, [mk("a", DAY, 0), mk("b", DAY, 1), mk("c", DAY, 2), mk("d", DAY, 3), mk("e", DAY, 0, true), mk("f", "2026-11-20", 3), mk("g", "2026-11-01", 3)], DAY, T0, W.house);
  assert.strictEqual(n, 3);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(W.doc.open.map(a => a.id))), ["h~c", "h~d", "h~e"]);
  assert.strictEqual(G.casAucOpenHouse(W.doc, [mk("c", DAY, 2)], DAY, T0, W.house), 0, "已經開了不重開");
  const a = W.doc.open[0];
  assert.strictEqual(a.reserve, G.NUM.art.tiers[2].base, "館方底價 ＝ 館方價 × 100%");
  assert.strictEqual(a.seller, null);
});
T("館方的稀有畫不能直接買，只能拍", G => {
  const W = world(G);
  assert.strictEqual(G.casArtBuy(W.wallets.u1, W.house, W.saves.u1, { id: "x", date: DAY, tier: 2, title: "t", auction: true }, DAY).ok, false);
  assert.strictEqual(G.casArtBuy(W.wallets.u1, W.house, W.saves.u1, { id: "x", date: DAY, tier: 0, title: "t", auction: true }, DAY).ok, false);
  assert.strictEqual(G.casArtBuy(W.wallets.u1, W.house, W.saves.u1, { id: "x", date: DAY, tier: 1, title: "t" }, DAY).ok, true);
});
T("出價：不低於底價、只能往上加、鎖籌碼、守恆", G => {
  const W = world(G), a = open(W), t0 = sum(W), R = a.reserve;
  assert.strictEqual(bid(W, "u1", R - 1000).ok, false);
  const r = bid(W, "u1", R + 1000000);
  assert.ok(r.ok, r.reason);
  assert.strictEqual(W.wallets.u1.chips, 50000000 - R - 1000000); assert.strictEqual(W.wallets.u1.auc.hold, R + 1000000);
  assert.strictEqual(bid(W, "u1", R + 1000000).ok, false, "同價不算加");
  assert.strictEqual(bid(W, "u1", R).ok, false, "不能往下");
  assert.ok(bid(W, "u1", R + 3000000).ok);
  assert.strictEqual(W.wallets.u1.chips, 50000000 - R - 3000000, "只多鎖差額");
  assert.strictEqual(sum(W), t0, "鎖住的籌碼還算在全館總和裡");
  assert.strictEqual(bid(W, "u2", 999999999).ok, false, "籌碼不夠");
  assert.strictEqual(bid(W, "u1", R + 5000000, a.closeAt).ok, false, "收標那刻起不能出價");
});
T("出價：帳號太新、沒存檔、已經收藏、收藏架滿、人數滿都擋", G => {
  const W = world(G), a = open(W);
  G.casBondFix(W.wallets.u2, DAY).born = DAY;
  assert.strictEqual(bid(W, "u2", a.reserve).ok, false, "帳號開不到 3 天");
  assert.strictEqual(W.wallets.u2.chips, 50000000);
  const noMode = W.G.casAucBid(W.doc, W.wallets.u1, null, "u1", "h~" + WORK, a.reserve, DAY, T0);
  assert.strictEqual(noMode.ok, false);
  W.saves.u1 = { art: { own: { [WORK]: { tier: 2, date: DAY, d: DAY, paid: 1, title: "t" } } } };
  assert.strictEqual(bid(W, "u1", a.reserve).ok, false, "已經有這幅");
  W.saves.u3 = { art: { own: {} } };
  for (let i = 0; i < G.NUM.art.holdMax; i++) W.saves.u3.art.own["z" + i] = { tier: 0, date: DAY, d: DAY, paid: 1, title: "z" };
  assert.strictEqual(bid(W, "u3", a.reserve).ok, false, "收藏架滿");
  for (let i = 0; i < G.NUM.auction.maxBidders; i++) a.bids["x" + i] = { amt: a.reserve, n: i, at: 0 };
  const V = world(G); const b = open(V);
  for (let i = 0; i < G.NUM.auction.maxBidders; i++) b.bids["x" + i] = { amt: b.reserve, n: i, at: 0 };
  assert.strictEqual(bid(V, "u1", b.reserve).ok, false, "人數滿");
});
T("收標：第二高價、鎖退回、畫給得標的、錢進莊家、守恆", G => {
  const W = world(G), a = open(W), R = a.reserve, t0 = sum(W), h0 = W.house.bankroll;
  bid(W, "u1", R + 5000000); bid(W, "u2", R + 2000000); bid(W, "u3", R + 1000000);
  assert.strictEqual(sum(W), t0);
  const r = settle(W);
  assert.ok(r.ok && r.sold);
  assert.strictEqual(r.winner, "u1"); assert.strictEqual(r.price, R + 2000000, "付第二高的價");
  assert.strictEqual(W.wallets.u1.chips, 50000000 - R - 2000000);
  assert.strictEqual(W.wallets.u2.chips, 50000000); assert.strictEqual(W.wallets.u3.chips, 50000000);
  for (const u of ["u1", "u2", "u3"]) assert.strictEqual(W.wallets[u].auc.hold, 0);
  assert.ok(own(W, "u1")[WORK] && !own(W, "u2")[WORK]);
  assert.strictEqual(own(W, "u1")[WORK].paid, R + 2000000);
  assert.strictEqual(W.house.bankroll, h0 + R + 2000000); assert.strictEqual(W.house.led.flow.artAuction, R + 2000000);
  assert.strictEqual(W.house.art.own[WORK], 1);
  assert.strictEqual(sum(W), t0, "全館總和不變");
  assert.strictEqual(W.doc.open.length, 0); assert.strictEqual(W.doc.done[0].price, R + 2000000);
});
T("收標：同價先出的得標（加價的看最後加到那個價的時間）", G => {
  const W = world(G), a = open(W), R = a.reserve;
  bid(W, "u2", R + 1000000); bid(W, "u1", R + 1000000); bid(W, "u3", R);
  assert.strictEqual(settle(W).winner, "u2");
  const V = world(G), b = open(V);
  bid(V, "u1", b.reserve + 100); bid(V, "u2", b.reserve + 200); bid(V, "u1", b.reserve + 200);
  assert.strictEqual(settle(V).winner, "u2", "u1 後來才加到同價，u2 先");
});
T("收標：只有壹人出價付底價；沒人出價流標；總和不變", G => {
  const W = world(G), a = open(W), t0 = sum(W);
  bid(W, "u1", a.reserve + 9000000);
  const r = settle(W);
  assert.strictEqual(r.price, a.reserve); assert.strictEqual(W.wallets.u1.chips, 50000000 - a.reserve);
  assert.strictEqual(sum(W), t0);
  const V = world(G); open(V); const vb = V.house.bankroll;
  const r2 = settle(V);
  assert.ok(r2.ok && !r2.sold && r2.price === null);
  assert.strictEqual(V.house.bankroll, vb); assert.strictEqual(V.doc.done[0].price, null);
});
T("收標：不能重複收（不會付兩次）", G => {
  const W = world(G), a = open(W);
  bid(W, "u1", a.reserve + 1); bid(W, "u2", a.reserve);
  const r = settle(W), c = W.wallets.u1.chips, hb = W.house.bankroll;
  assert.ok(r.ok);
  assert.strictEqual(settle(W).ok, false);
  assert.strictEqual(W.wallets.u1.chips, c); assert.strictEqual(W.house.bankroll, hb);
});
T("收標：得標的人拿不了畫（已經有了／存檔不見）就換下壹個", G => {
  const W = world(G), a = open(W), R = a.reserve;
  bid(W, "u1", R + 3000000); bid(W, "u2", R + 2000000); bid(W, "u3", R + 1000000);
  W.saves.u1 = { art: { own: { [WORK]: { tier: 2, date: DAY, d: DAY, paid: 1, title: "t" } } } };
  delete W.saves.u2;
  const r = settle(W);
  assert.strictEqual(r.winner, "u3"); assert.strictEqual(r.price, R, "只剩壹個人能拿，付底價");
  assert.strictEqual(W.wallets.u1.chips, 50000000); assert.strictEqual(W.wallets.u2.chips, 50000000);
});
T("鎖對不上的出價不信（不退也不算）", G => {
  const W = world(G), a = open(W);
  a.bids.u3 = { amt: a.reserve + 5, n: 99, at: 0 }; // 文件上有出價但錢包沒鎖
  bid(W, "u1", a.reserve);
  const r = settle(W);
  assert.strictEqual(r.winner, "u1"); assert.strictEqual(W.wallets.u3.chips, 50000000);
});
T("畫面：看不到別人的出價和賣家是誰，只看得到我的、人數", G => {
  const W = world(G), a = open(W);
  bid(W, "u1", a.reserve + 7000000); bid(W, "u2", a.reserve + 1000000);
  const v = JSON.parse(JSON.stringify(W.G.casAucView(W.doc, W.wallets.u2, "u2", DAY, T0 + 5000)));
  assert.strictEqual(v.open.length, 1); assert.strictEqual(v.open[0].mine, a.reserve + 1000000); assert.strictEqual(v.open[0].bidders, 2);
  assert.strictEqual(v.open[0].sellerName, "館方");
  assert.ok(!JSON.stringify(v).includes(String(a.reserve + 7000000)), "別人的出價不能出現");
  assert.strictEqual(v.hold, a.reserve + 1000000);
  settle(W);
  const v2 = JSON.parse(JSON.stringify(W.G.casAucView(W.doc, W.wallets.u2, "u2", "2026-11-19", T0 + 4 * 86400000)));
  assert.strictEqual(v2.open.length, 0); assert.strictEqual(v2.done[0].price, a.reserve + 1000000);
  assert.ok(!("bids" in v2.done[0]) && v2.notes.length === 1);
});

// ---------- 玩家拍自己的畫 ----------
const withPainting = (W, seller = "u1", tier = 1) => { W.saves[seller] = { art: { own: { [WORK]: { tier, date: "2026-11-10", d: "2026-11-10", paid: 2500000, title: "我的畫" } } } }; };
const cur = W => W.G.casAucRange(W.saves.u1.art.own[WORK], WORK, DAY, W.house);
const list = (W, reserve, u = "u1", now = T0) => W.G.casAucList(W.doc, W.wallets[u], W.saves[u], u, W.house, WORK, reserve, DAY, now);
const pbid = (W, id, u, amt) => W.G.casAucBid(W.doc, W.wallets[u], W.saves[u], u, id, amt, DAY, T0 + 1);
const psettle = (W, id) => W.G.casAucSettle(W.doc, id, { house: W.house, wallets: W.wallets, saves: W.saves, day: DAY, nowMs: W.doc.open.find(a => a.id === id).closeAt + 1 });
T("玩家拍賣：底價綁在館方價 0.8～1.5 倍、不超過現價加溢價上限；畫上鎖，不能賣回、不能再拍", G => {
  const W = world(G); withPainting(W);
  const R = cur(W);
  assert.strictEqual(R.lo, Math.ceil(R.cur * 0.8 / 1000) * 1000);
  assert.strictEqual(list(W, R.lo - 1000).ok, false); assert.strictEqual(list(W, R.hi + 1000).ok, false);
  const r = list(W, R.cur);
  assert.ok(r.ok, r.reason);
  assert.strictEqual(W.saves.u1.art.own[WORK].lock, r.id);
  assert.strictEqual(list(W, R.cur).ok, false, "不能重複拍");
  assert.strictEqual(G.casArtSell(W.wallets.u1, W.house, W.saves.u1, WORK, DAY).ok, false, "拍賣中不能賣回館方");
  const a = W.doc.open[0];
  assert.strictEqual(a.seller, "u1"); assert.strictEqual(a.ceil, R.hi);
  assert.strictEqual(pbid(W, r.id, "u1", R.cur).ok, false, "不能對自己的畫出價");
  assert.strictEqual(pbid(W, r.id, "u2", R.hi + 1000).ok, false, "出價有上限");
  assert.strictEqual(a.closeAt, G.casAucCloseAt(DAY));
});
T("玩家拍賣：成交付第二價，賣家拿價錢扣 5%，手續費進預算池，畫搬走，守恆", G => {
  const W = world(G); withPainting(W, "u1", 1);
  const R = cur(W), r = list(W, R.cur), t0 = sum(W), b0 = W.house.budget, h0 = W.house.bankroll;
  pbid(W, r.id, "u2", R.cur + 100000); pbid(W, r.id, "u3", R.cur + 50000);
  const s = psettle(W, r.id);
  assert.ok(s.sold); assert.strictEqual(s.winner, "u2"); assert.strictEqual(s.price, R.cur + 50000);
  const fee = Math.floor(s.price * 5 / 100);
  assert.strictEqual(s.fee, fee);
  assert.strictEqual(W.house.budget, b0 + fee); assert.strictEqual(W.house.bankroll, h0, "莊家的錢不動");
  assert.strictEqual(W.wallets.u1.chips, 50000000 + s.price - fee);
  assert.strictEqual(W.wallets.u2.chips, 50000000 - s.price); assert.strictEqual(W.wallets.u3.chips, 50000000);
  assert.ok(!own(W, "u1")[WORK] && own(W, "u2")[WORK]); assert.ok(!own(W, "u2")[WORK].lock);
  assert.strictEqual(sum(W), t0);
  assert.strictEqual(W.house.act.artFee, fee);
});
T("玩家拍賣：只有壹人出價付底價；沒人出價流標、畫解鎖", G => {
  const W = world(G); withPainting(W);
  const R = cur(W), r = list(W, R.lo);
  pbid(W, r.id, "u2", R.hi);
  const s = psettle(W, r.id);
  assert.strictEqual(s.price, R.lo);
  const V = world(G); withPainting(V);
  const r2 = list(V, cur(V).cur), s2 = psettle(V, r2.id);
  assert.ok(s2.ok && !s2.sold);
  assert.ok(V.saves.u1.art.own[WORK] && !V.saves.u1.art.own[WORK].lock, "畫還在、解鎖");
  assert.strictEqual(V.wallets.u1.chips, 50000000);
  assert.strictEqual(G.casArtSell(V.wallets.u1, V.house, V.saves.u1, WORK, DAY).ok, true, "解鎖後可以賣回");
});
T("玩家拍賣：賣家壹天收的溢價 ≤ 200 萬（照上限算價，低過底價就不賣）", G => {
  const W = world(G); withPainting(W, "u1", 3); // 孤品，現價約 1,500 萬
  const R = cur(W), r = list(W, R.hi);
  assert.ok(R.hi - R.cur <= 2000000);
  pbid(W, r.id, "u2", R.hi);
  W.saves.u1.art.prem = { [DAY]: 1500000 }; // 今天已經收了 150 萬溢價
  const s = psettle(W, r.id);
  assert.ok(!s.sold, "剩 50 萬額度，價格撐不到底價 → 流標");
  assert.strictEqual(W.wallets.u2.chips, 50000000);
  const U = world(G); withPainting(U, "u1", 3);
  const R3 = cur(U), r3 = list(U, R3.cur); pbid(U, r3.id, "u2", R3.hi); pbid(U, r3.id, "u3", R3.hi);
  const s3 = psettle(U, r3.id);
  assert.ok(s3.sold && s3.price - R3.cur <= 2000000);
  assert.strictEqual(U.saves.u1.art.prem[DAY], Math.max(0, s3.price - R3.cur));
  withPainting(U, "u1", 3);
  U.saves.u1.art.prem = { [DAY]: 2000000 };
  assert.strictEqual(list(U, R3.cur).ok, false, "今天額度用完不能再開拍");
});
T("玩家拍賣：帳號太新不能拍、沒有這幅不能拍、最多同時 2 幅、取消只有沒人出價才行", G => {
  const W = world(G); withPainting(W);
  G.casBondFix(W.wallets.u1, DAY).born = DAY;
  assert.strictEqual(list(W, cur(W).cur).ok, false);
  G.casBondFix(W.wallets.u1, DAY).born = "2026-01-01";
  assert.strictEqual(W.G.casAucList(W.doc, W.wallets.u1, W.saves.u1, "u1", W.house, "沒有", 1000000, DAY, T0).ok, false);
  W.saves.u1.art.own.b = { tier: 0, date: "2026-11-10", d: DAY, paid: 1000000, title: "b" }; W.saves.u1.art.own.c = { tier: 0, date: "2026-11-10", d: DAY, paid: 1000000, title: "c" };
  const r = list(W, cur(W).cur);
  const r2 = W.G.casAucList(W.doc, W.wallets.u1, W.saves.u1, "u1", W.house, "b", W.G.casAucRange(W.saves.u1.art.own.b, "b", DAY, W.house).cur, DAY, T0);
  assert.ok(r.ok && r2.ok, r2.reason);
  assert.strictEqual(W.G.casAucList(W.doc, W.wallets.u1, W.saves.u1, "u1", W.house, "c", 1000000, DAY, T0).ok, false, "同時最多 2 幅");
  assert.strictEqual(W.G.casAucCancel(W.doc, W.saves.u2, "u2", r.id).ok, false, "別人不能取消");
  pbid(W, r.id, "u2", cur(W).cur);
  assert.strictEqual(W.G.casAucCancel(W.doc, W.saves.u1, "u1", r.id).ok, false, "有人出價就不能取消");
  const c = W.G.casAucCancel(W.doc, W.saves.u1, "u1", r2.id);
  assert.ok(c.ok); assert.ok(!W.saves.u1.art.own.b.lock); assert.strictEqual(W.doc.open.length, 1);
});
T("壞資料：拍賣文件、錢包 auc 補得回來", G => {
  const d = G.casAucDocFix({ open: [null, { id: 1 }, { id: "x", work: "w", closeAt: 5, bids: { a: { amt: -4 }, b: { amt: 9, n: 1 } } }], done: "壞", seq: "abc" });
  assert.strictEqual(d.open.length, 1); assert.deepStrictEqual(JSON.parse(JSON.stringify(Object.keys(d.open[0].bids))), ["b"]); assert.strictEqual(d.seq, 0); assert.deepStrictEqual(JSON.parse(JSON.stringify(d.done)), []);
  const w = { auc: { bids: { a: 5, b: "x", c: -1 }, hold: 999 } };
  G.casAucWallet(w); assert.strictEqual(w.auc.hold, 5);
});
T("守恆：鎖住的籌碼算在錢包那邊（casBookSnap）", G => {
  const w = G.casWalletFix(G.casWalletNew(), DAY), h = G.casHouseFix(G.casHouseNew(), DAY).house, t = () => G.casBookTotal(G.casBookSnap([w], h, 0, null));
  const t0 = t(); w.chips -= 1000; w.auc = { hold: 1000, bids: { x: 1000 } };
  assert.strictEqual(t(), t0);
});

console.log(`拍賣：${pass} 過 ${fail} 敗`);
process.exit(fail ? 1 : 0);
