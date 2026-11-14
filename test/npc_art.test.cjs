// NPC 買畫（11-14，docs/館內NPC規劃.md 步驟 4）：node test/npc_art.test.cjs（npm test 也會跑）
// 每場最多壹位 NPC 出價、錢從外面世界的池子來、不超過自己的預算和全館壹天的上限、NPC 沒贏也會把價格抬到他的出價、玩家的畫賣給 NPC 賣家拿到錢、守恆。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.NUM.casino.grants = []; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const DAY = "2026-11-16", WORK = "2026-W47/r1", T0 = Date.UTC(2026, 10, 16, 2, 0, 0);
const NPC = { id: "v-x", name: "白伯", kind: "visitor", likes: [], route: { auction: 5 }, budget: { perDay: 9000000, max: 9000000 }, arc: [] };
const world = G => {
  const house = G.casHouseFix(G.casHouseNew(), DAY).house, doc = G.casAucDocFix({}), wallets = {}, saves = {};
  for (const u of ["u1", "u2"]) { const w = G.casWalletFix(G.casWalletNew(), DAY); w.chips = 50000000; G.casBondFix(w, DAY).born = "2026-01-01"; wallets[u] = w; saves[u] = {}; }
  G.casAucOpenHouse(doc, [{ id: WORK, date: DAY, tier: 2, title: "珍藏的畫" }], DAY, T0, house);
  return { house, doc, wallets, saves };
};
const sum = (G, W) => { const s = G.casBookSnap(Object.values(W.wallets), W.house, 0, null); return G.casBookTotal(s) - G.casBookMinted(s) + G.casBookBurned(s); };
const settle = (G, W, extra) => G.casAucSettle(W.doc, "h~" + WORK, Object.assign({ house: W.house, wallets: W.wallets, saves: W.saves, day: "2026-11-19", nowMs: T0 + 4 * 86400000, npcList: [NPC], secret: "祕密" }, extra));

T("沒人出價、NPC 出價：NPC 以底價買走館方的畫，錢從外面世界來（池子少、莊家多），守恆", G => {
  G.NUM.auction.npcJoinPct = 100; G.NUM.auction.npcDay = 1e9;
  const W = world(G), t0 = sum(G, W), w0 = W.house.world, b0 = W.house.bankroll, R = W.doc.open[0].reserve;
  const r = settle(G, W);
  assert.ok(r.ok && r.sold && r.npc === "白伯" && r.winner === null, JSON.stringify(r));
  assert.ok(r.price >= R && r.price <= Math.floor(R * 1.1) + 1000);
  assert.strictEqual(W.house.world, w0 - r.price); assert.strictEqual(W.house.bankroll, b0 + r.price);
  assert.strictEqual(sum(G, W), t0, "守恆"); assert.strictEqual(W.doc.done[0].buyer, "白伯");
  assert.strictEqual(W.house.art.npcPaid.n, r.price);
  const v = G.casAucView(W.doc, W.wallets.u1, "u1", "2026-11-19", T0 + 4 * 86400000).done[0];
  assert.strictEqual(v.buyerName, "館外的收藏家 白伯"); assert.strictEqual(v.npcBuyer, true); assert.ok(!JSON.stringify(v).includes("u1"));
});
T("NPC 預算不夠（max 小於底價）、機率 0、全館壹天上限用完：不出價，照舊流標", G => {
  G.NUM.auction.npcJoinPct = 100; G.NUM.auction.npcDay = 1e9;
  let W = world(G); assert.ok(!settle(G, W, { npcList: [Object.assign({}, NPC, { budget: { perDay: 1000, max: 1000 } })] }).sold);
  G.NUM.auction.npcJoinPct = 0; W = world(G); assert.ok(!settle(G, W).sold);
  G.NUM.auction.npcJoinPct = 100; G.NUM.auction.npcDay = 1; W = world(G); assert.ok(!settle(G, W).sold, "壹天上限");
  G.NUM.auction.npcDay = 1e9; W = world(G); assert.ok(!settle(G, W, { npcList: [{ id: "t", name: "影", kind: "trace", route: { auction: 9 }, budget: { max: 9e9, perDay: 9e9 } }] }).sold, "劇情角色不出價");
});
T("NPC 沒贏也把第二高價抬到他的出價；玩家出更高的還是玩家得標", G => {
  G.NUM.auction.npcJoinPct = 100; G.NUM.auction.npcDay = 1e9;
  const W = world(G), a = W.doc.open[0], hi = a.reserve * 3;
  assert.ok(G.casAucBid(W.doc, W.wallets.u1, W.saves.u1, "u1", a.id, hi, DAY, T0 + 1000).ok);
  const r = settle(G, W);
  assert.ok(r.sold && r.winner === "u1", JSON.stringify(r)); assert.ok(r.price >= a.reserve && r.price < hi, "付第二高價（NPC 的出價），不是自己的高價");
});
T("玩家的畫拍賣：NPC 買走，賣家拿到錢（扣手續費進預算池），畫變成館外收藏；錢從外面世界來；守恆", G => {
  G.NUM.auction.npcJoinPct = 100; G.NUM.auction.npcDay = 1e9;
  const W = world(G), P = {}; W.saves.u2 = P; const A = G.casArtFix(P);
  A.own[WORK] = { tier: 2, date: DAY, d: DAY, paid: 6000000, title: "珍藏的畫", lock: "p~1" }; W.house.art = { own: { [WORK]: 1 }, paid: 6000000, out: { day: "", n: 0 } };
  const cur = G.casArtPrice(A.own[WORK], WORK, "2026-11-19", W.house), reserve = Math.floor(cur * 0.8 / 1000) * 1000;
  W.doc.open = [{ id: "p~1", kind: "player", work: WORK, title: "珍藏的畫", tier: 2, date: DAY, seller: "u2", reserve, ceil: Math.floor(cur * 1.5), opens: DAY, closeAt: T0, bids: {} }];
  const t0 = sum(G, W), w0 = W.house.world, c0 = W.wallets.u2.chips, b0 = W.house.budget;
  const r = G.casAucSettle(W.doc, "p~1", { house: W.house, wallets: W.wallets, saves: W.saves, day: "2026-11-19", nowMs: T0 + 4 * 86400000, npcList: [NPC], secret: "祕密" });
  assert.ok(r.sold && r.npc === "白伯", JSON.stringify(r)); assert.ok(r.price <= cur, "不超過現價");
  assert.strictEqual(W.wallets.u2.chips - c0, r.price - r.fee); assert.strictEqual(W.house.budget - b0, r.fee);
  assert.strictEqual(W.house.world, w0 - r.price); assert.ok(!A.own[WORK], "畫離開賣家"); assert.ok(!W.house.art.own[WORK]);
  assert.strictEqual(sum(G, W), t0, "守恆");
});
console.log(`${pass} passed, ${fail} failed（NPC 買畫）`);
process.exit(fail ? 1 : 0);
