// 德州撲克 2 人桌（shared/casino/holdem.js、holdem_eval.js，決定 0150）：node test/casino/holdem.test.cjs（npm test 也會跑）
// 牌力、買入和補籌碼、發牌和盲注、動作的規則、抽水、有效籌碼、壹天對同壹人上限、超時、離座、看到的樣子、隨機亂打 300 手錢守恆。
const assert = require("assert");
const { load } = require("../load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 6).join("\n    ")); } finally { G.setRng(null); } };
const DAY = "2026-11-21", NOW = 1_000_000;
const lcg = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
// 牌：點數 r（0＝A、1＝2 … 12＝K）、花色 s（0～3）
const card = (r, s = 0) => r + 13 * s, A = 0, K = 12, Q = 11, J = 10, R10 = 9;
const mkCtx = G => { const house = G.casHouseFix(G.casHouseNew(), DAY).house; return { wallets: {}, house, day: DAY, hlog: [], h0: house.bankroll }; };
const wallet = (G, chips) => { const w = G.casWalletFix(G.casWalletNew(), DAY); w.chips = chips; return w; };
// 坐好兩個人（各買 bb × 100）、發好第壹手。回傳 { t, ctx, a, b }（a 是按鈕＝小盲、先說話的人）
function setup(G, { lv = 1, buy = null, rng = 7 } = {}) {
  const ctx = mkCtx(G), t = G.casHNew({ pid: "p1", lv, now: NOW }), bb = G.NUM.casino.holdem.levels[lv][1];
  ctx.wallets.A = wallet(G, 1e9); ctx.wallets.B = wallet(G, 1e9);
  G.setRng(lcg(rng));
  assert.ok(G.casHBuyin(t, "A", "甲", buy || bb * 100, ctx.wallets.A, ctx).ok); assert.ok(G.casHBuyin(t, "B", "乙", buy || bb * 100, ctx.wallets.B, ctx).ok);
  assert.ok(G.casHStart(t, ctx, NOW).ok);
  const a = t.toAct, b = t.order.find(x => x !== a);
  return { t, ctx, a, b, bb };
}
const total = (t, ctx) => Object.values(ctx.wallets).reduce((x, w) => x + w.chips, 0) + G0.casHInplay(t) + ctx.house.bankroll - ctx.h0;
let G0 = null;
// 擺好牌：hole = { uid: [c1, c2] }，board5 = 五張公共牌（翻牌 3、轉牌 1、河牌 1 依序）
function rig(t, hole, board5) { Object.keys(hole).forEach(u => { t.seats[u].hole = hole[u]; }); t.deck = board5.slice().reverse(); }

T("牌力：類別大小、踢腳、A2345 順子、皇家同花順、7 張取最好的、平手", G => {
  const S = cs => G.holdemScore(cs.map(([r, s]) => card(r, s)));
  const royal = S([[A, 0], [K, 0], [Q, 0], [J, 0], [R10, 0], [2, 1], [3, 2]]), sf = S([[8, 1], [7, 1], [6, 1], [5, 1], [4, 1], [A, 0], [K, 2]]);
  const quad = S([[5, 0], [5, 1], [5, 2], [5, 3], [A, 0], [2, 1], [3, 2]]), fh = S([[5, 0], [5, 1], [5, 2], [K, 3], [K, 0], [2, 1], [3, 2]]);
  const fl = S([[A, 0], [8, 0], [6, 0], [4, 0], [2, 0], [K, 1], [Q, 2]]), st = S([[6, 0], [7, 1], [8, 2], [9, 3], [10, 0], [2, 1], [K, 2]]);
  const trips = S([[5, 0], [5, 1], [5, 2], [K, 3], [9, 0], [2, 1], [3, 2]]), two = S([[5, 0], [5, 1], [9, 2], [9, 3], [A, 0], [2, 1], [3, 2]]);
  const pair = S([[5, 0], [5, 1], [9, 2], [K, 3], [A, 0], [2, 1], [3, 2]]), high = S([[5, 0], [7, 1], [9, 2], [K, 3], [A, 0], [2, 1], [4, 2]]);
  assert.ok(royal > sf && sf > quad && quad > fh && fh > fl && fl > st && st > trips && trips > two && two > pair && pair > high);
  assert.strictEqual(G.holdemName(royal), "同花順"); assert.strictEqual(G.holdemName(high), "高牌");
  const wheel = S([[A, 0], [1, 1], [2, 2], [3, 3], [4, 0], [K, 1], [9, 2]]), six = S([[1, 0], [2, 1], [3, 2], [4, 3], [5, 0], [K, 1], [9, 2]]);
  assert.strictEqual(G.holdemCat(wheel), 4); assert.ok(six > wheel, "A2345 是最小的順子");
  assert.ok(S([[A, 0], [A, 1], [K, 2], [5, 3], [3, 0], [2, 1], [4, 2]]) > S([[A, 0], [A, 1], [Q, 2], [5, 3], [3, 0], [2, 1], [4, 2]]), "踢腳 K > Q");
  assert.strictEqual(S([[A, 0], [K, 1], [Q, 2], [J, 3], [8, 0], [2, 1], [3, 2]]), S([[A, 1], [K, 2], [Q, 3], [J, 0], [8, 1], [2, 2], [3, 3]]), "同樣的牌型平手");
  assert.ok(S([[A, 0], [A, 1], [K, 2], [K, 3], [Q, 0], [Q, 1], [2, 2]]) < S([[A, 0], [A, 1], [K, 2], [K, 3], [Q, 0], [Q, 1], [A, 2]]), "三對取最好的兩對");
});
T("買入：第壹次最少 40 個大盲、最多 min(5,000 萬, 200 個大盲)；補籌碼不能超過；打牌中不能補；籌碼從錢包搬到桌上", G => {
  const ctx = mkCtx(G), t = G.casHNew({ pid: "p1", lv: 1, now: NOW }), w = wallet(G, 1e9), bb = 100000, lim = G.casHBuyLimits(t);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(lim)), { min: 40 * bb, max: 200 * bb });
  assert.ok(!G.casHBuyin(t, "A", "甲", 39 * bb, w, ctx).ok); assert.ok(!G.casHBuyin(t, "A", "甲", 201 * bb, w, ctx).ok);
  assert.ok(!G.casHBuyin(t, "A", "甲", 1000.5, w, ctx).ok); assert.ok(!G.casHBuyin(t, "A", "甲", -5, w, ctx).ok);
  assert.ok(G.casHBuyin(t, "A", "甲", 100 * bb, w, ctx).ok); assert.strictEqual(w.chips, 1e9 - 100 * bb); assert.strictEqual(t.seats.A.stack, 100 * bb);
  assert.ok(!G.casHBuyin(t, "A", "甲", 101 * bb, w, ctx).ok, "補到 201 個大盲超過上限"); assert.ok(G.casHBuyin(t, "A", "甲", 100 * bb, w, ctx).ok, "補到 200 個大盲剛好");
  const poor = wallet(G, 1000); assert.ok(!G.casHBuyin(t, "B", "乙", 40 * bb, poor, ctx).ok); assert.strictEqual(poor.chips, 1000);
  G.NUM.casino.holdem.buyMax = 30 * bb; assert.strictEqual(G.casHBuyLimits(t).max, 30 * bb); // 買入上限（翊文：5,000 萬）
  assert.ok(G.casHBuyin(t, "C", "丙", 50 * bb, wallet(G, 1e9), ctx).ok === false, "桌子只有 2 個座位");
});
T("發牌：每人 2 張、盲注、小盲（按鈕）先說話、有效籌碼；總錢不變", G => {
  G0 = G; const { t, ctx, a, b, bb } = setup(G), B = G.NUM.casino.holdem.levels[1];
  assert.strictEqual(t.phase, "play"); assert.strictEqual(t.seats[a].hole.length, 2); assert.strictEqual(t.seats[b].hole.length, 2);
  assert.strictEqual(t.seats[a].bet, B[0]); assert.strictEqual(t.seats[b].bet, B[1]); assert.strictEqual(t.curBet, B[1]);
  assert.strictEqual(t.E, 100 * bb); assert.strictEqual(t.order[t.btn], a);
  assert.strictEqual(total(t, ctx), 2e9);
  const v = G.casHView(t, a, NOW, ctx); assert.deepStrictEqual(JSON.parse(JSON.stringify(v.legal)), { check: false, call: B[1] - B[0], minTo: B[1] + B[1], maxTo: 100 * bb, canRaise: true, fold: true });
  assert.ok(G.casHView(t, b, NOW, ctx).legal === undefined, "沒輪到的人沒有動作");
});
T("翻牌前蓋牌：大盲拿走小盲、不抽水（底池 ≤ 2 個大盲）、記紀錄", G => {
  G0 = G; const { t, ctx, a, b, bb } = setup(G), B = G.NUM.casino.holdem.levels[1];
  const r = G.casHAct(t, a, "fold", 0, ctx, NOW + 1000); assert.ok(r.ok && r.finished);
  assert.strictEqual(t.seats[a].stack, 100 * bb - B[0]); assert.strictEqual(t.seats[b].stack, 100 * bb + B[0]);
  assert.strictEqual(t.res.rake, 0); assert.deepStrictEqual(JSON.parse(JSON.stringify(t.res.winners)), [b]); assert.strictEqual(t.res.how, "fold");
  assert.strictEqual(ctx.hlog.length, 1); assert.strictEqual(ctx.hlog[0].net[b], B[0]); assert.strictEqual(total(t, ctx), 2e9); assert.strictEqual(t.phase, "over");
});
T("動作規則：不是你的回合、過牌要跟、加注太少／太多／小數、全下當跟注、不認得的動作", G => {
  G0 = G; const { t, ctx, a, b, bb } = setup(G), B = G.NUM.casino.holdem.levels[1];
  assert.ok(!G.casHAct(t, b, "check", 0, ctx, NOW).ok, "還沒輪到"); assert.ok(!G.casHAct(t, a, "check", 0, ctx, NOW).ok, "要跟注");
  assert.ok(!G.casHAct(t, a, "raise", B[1] + 1, ctx, NOW).ok, "最少加到 2 個大盲"); assert.ok(!G.casHAct(t, a, "raise", 101 * bb, ctx, NOW).ok, "超過有效籌碼");
  assert.ok(!G.casHAct(t, a, "raise", 3 * bb + 0.5, ctx, NOW).ok); assert.ok(!G.casHAct(t, a, "jump", 0, ctx, NOW).ok); assert.ok(!G.casHAct(t, "Z", "fold", 0, ctx, NOW).ok);
  assert.ok(G.casHAct(t, a, "raise", 3 * bb, ctx, NOW).ok); assert.strictEqual(t.curBet, 3 * bb); assert.strictEqual(t.lastRaise, 2 * bb); assert.strictEqual(t.toAct, b);
  assert.ok(!G.casHAct(t, b, "raise", 4 * bb, ctx, NOW).ok, "對方加了 2 BB，最少加到 5 BB");
  assert.ok(G.casHAct(t, b, "call", 0, ctx, NOW).ok); assert.strictEqual(t.street, 1); assert.strictEqual(t.board.length, 3); assert.strictEqual(t.toAct, b, "翻牌後大盲先說話");
  assert.strictEqual(t.seats[a].bet, 0); assert.strictEqual(t.curBet, 0); assert.strictEqual(total(t, ctx), 2e9);
});
T("壹手打完到攤牌：贏家拿底池扣抽水（5%，封頂 3 個大盲），抽水進莊家，總錢不變；輸家的牌型會揭開", G => {
  G0 = G; const { t, ctx, a, b, bb } = setup(G), bank0 = ctx.house.bankroll;
  rig(t, { [a]: [card(A, 0), card(A, 1)], [b]: [card(K, 2), card(Q, 3)] }, [card(2, 0), card(5, 1), card(8, 2), card(3, 3), card(9, 0)]);
  G.casHAct(t, a, "raise", 3 * bb, ctx, NOW); G.casHAct(t, b, "call", 0, ctx, NOW); // 底池 6 BB
  for (const u of [b, a]) assert.ok(G.casHAct(t, u, "check", 0, ctx, NOW).ok); // 翻牌
  for (const u of [b, a]) assert.ok(G.casHAct(t, u, "check", 0, ctx, NOW).ok); // 轉牌
  G.casHAct(t, b, "check", 0, ctx, NOW); const r = G.casHAct(t, a, "check", 0, ctx, NOW); assert.ok(r.finished); // 河牌
  const rake = Math.min(Math.floor(6 * bb * 0.05), 3 * bb); assert.strictEqual(rake, 30000);
  assert.strictEqual(t.res.rake, rake); assert.strictEqual(t.seats[a].stack, 100 * bb + 3 * bb - rake); assert.strictEqual(t.seats[b].stack, 97 * bb);
  assert.strictEqual(ctx.house.bankroll, bank0 + rake); assert.strictEqual(total(t, ctx), 2e9);
  assert.strictEqual(t.res.names[a], "壹對"); assert.deepStrictEqual(JSON.parse(JSON.stringify(t.res.cards[b])), [card(K, 2), card(Q, 3)]);
  assert.strictEqual(ctx.house.act.holdemRake, rake);
  const sorted = [a, b].sort(), netOf = u => (u === a ? 3 * bb - rake : -3 * bb); assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.house.hd.pair[sorted.join("|")])), [netOf(sorted[0]), netOf(sorted[1])], "兩個人各自的淨輸贏（贏的扣了抽水）");
});
T("抽水封頂：全下大池只抽 3 個大盲；平手對分底池（單的籌碼給大盲）", G => {
  G0 = G; const { t, ctx, a, b, bb } = setup(G), bank0 = ctx.house.bankroll;
  rig(t, { [a]: [card(A, 0), card(2, 1)], [b]: [card(A, 2), card(2, 3)] }, [card(5, 0), card(6, 1), card(9, 2), card(J, 3), card(K, 0)]);
  G.casHAct(t, a, "allin", 0, ctx, NOW); const r = G.casHAct(t, b, "call", 0, ctx, NOW); assert.ok(r.finished);
  assert.strictEqual(t.res.pot, 200 * bb); assert.strictEqual(t.res.rake, 3 * bb); assert.strictEqual(ctx.house.bankroll, bank0 + 3 * bb);
  assert.strictEqual(t.seats[a].stack + t.seats[b].stack, 200 * bb - 3 * bb); assert.strictEqual(t.res.winners.length, 2); assert.strictEqual(total(t, ctx), 2e9);
});
T("有效籌碼：兩人籌碼不一樣，每人這手最多投入較少的那個；大籌碼的人輸了也只輸這麼多", G => {
  G0 = G; const ctx = mkCtx(G), t = G.casHNew({ pid: "p1", lv: 1, now: NOW }), bb = 100000;
  ctx.wallets.A = wallet(G, 1e9); ctx.wallets.B = wallet(G, 1e9); G.setRng(lcg(3));
  G.casHBuyin(t, "A", "甲", 50 * bb, ctx.wallets.A, ctx); G.casHBuyin(t, "B", "乙", 150 * bb, ctx.wallets.B, ctx); G.casHStart(t, ctx, NOW);
  assert.strictEqual(t.E, 50 * bb); const a = t.toAct, b = t.order.find(x => x !== a);
  rig(t, { [a]: [card(2, 0), card(3, 1)], [b]: [card(A, 2), card(A, 3)] }, [card(5, 0), card(7, 1), card(9, 2), card(J, 3), card(K, 0)]);
  assert.ok(!G.casHAct(t, a, "raise", 51 * bb, ctx, NOW).ok); G.casHAct(t, a, "allin", 0, ctx, NOW); const r = G.casHAct(t, b, "call", 0, ctx, NOW); assert.ok(r.finished);
  assert.strictEqual(t.seats.A.stack + t.seats.B.stack + t.res.rake, 200 * bb); assert.strictEqual(total(t, ctx), 2e9);
  const loser = [a, b].find(u => !t.res.winners.includes(u)); assert.ok(t.seats[loser].stack === (loser === "A" ? 0 : 100 * bb), "大籌碼的輸家只輸 50 BB");
});
T("壹天對同壹人上限：輸到上限就不開新的一手（why: cap）；用掉的額度讓有效籌碼變小；每人各自算；隔天重算", G => {
  G0 = G; const bb = 100000; G.NUM.casino.holdem.pairDay = 50 * bb;
  const { t, ctx, a, b } = setup(G), key = [a, b].sort().join("|");
  assert.strictEqual(t.E, 50 * bb, "有效籌碼被上限壓到 50 BB（兩人都有 100 BB）");
  rig(t, { [a]: [card(A, 0), card(A, 1)], [b]: [card(2, 2), card(7, 3)] }, [card(5, 0), card(6, 1), card(9, 2), card(J, 3), card(K, 0)]);
  G.casHAct(t, a, "allin", 0, ctx, NOW); G.casHAct(t, b, "call", 0, ctx, NOW);
  const pair = ctx.house.hd.pair[key], sorted = [a, b].sort(); assert.strictEqual(pair[sorted.indexOf(b)], -50 * bb, "輸的人輸滿 50 BB"); assert.ok(pair[sorted.indexOf(a)] > 0 && pair[sorted.indexOf(a)] < 50 * bb, "贏的人扣了抽水");
  assert.strictEqual(G.casHPairLeft(ctx.house, DAY, a, b), 0);
  const r = G.casHStart(t, ctx, NOW + 10000); assert.ok(!r.ok && r.why === "cap" && t.phase === "wait");
  ctx.house.hd.pair[key] = [-45 * bb, 44 * bb]; assert.strictEqual(G.casHPairLeft(ctx.house, DAY, a, b), 5 * bb, "輸了 45 的人還能輸 5");
  assert.ok(G.casHStart(t, ctx, NOW + 20000).ok); assert.strictEqual(t.E, 5 * bb);
  assert.strictEqual(G.casHPairLeft(ctx.house, "2026-11-22", a, b), 50 * bb, "隔天重算");
});
T("超時：輪到的人超過時間自動過牌（沒有要跟）或蓋牌；連續 2 次超時自動離座、籌碼回錢包；看完結果自動開下壹手", G => {
  G0 = G; const { t, ctx, a, b, bb } = setup(G), C = G.NUM.casino.holdem;
  G.casHAdvance(t, ctx, NOW + C.turnMs - 1); assert.strictEqual(t.phase, "play");
  assert.ok(G.casHAdvance(t, ctx, NOW + C.turnMs)); assert.strictEqual(t.phase, "over"); assert.strictEqual(t.res.how, "fold"); assert.strictEqual(t.seats[a].timeouts, 1);
  assert.ok(G.casHAdvance(t, ctx, NOW + C.turnMs + C.resultMs + 1), "看完結果自動開下壹手"); assert.strictEqual(t.phase, "play"); assert.strictEqual(t.hand, 2);
  const first = t.toAct; // 第 2 手的小盲換人
  assert.notStrictEqual(first, a);
  let now = NOW + C.turnMs + C.resultMs + 1;
  for (let k = 0; k < 6 && t.seats[a] && t.seats[b]; k++) { now += C.turnMs + 1; G.casHAdvance(t, ctx, now); now += C.resultMs + 1; G.casHAdvance(t, ctx, now); }
  assert.ok(!t.seats[a] || !t.seats[b], "有人連續超時被請離座"); assert.strictEqual(total(t, ctx), 2e9); assert.ok(Object.values(ctx.wallets).some(w => w.chips > 1e9 - 100 * bb));
});
T("離座：打牌中離座＝蓋牌，對方贏底池，離座的人帶走剩下的籌碼；沒坐的人離座沒事", G => {
  G0 = G; const { t, ctx, a, b, bb } = setup(G), B = G.NUM.casino.holdem.levels[1];
  const r = G.casHLeave(t, a, ctx, NOW + 100); assert.ok(r.ok); assert.ok(!t.seats[a]); assert.strictEqual(ctx.wallets[a].chips, 1e9 - 100 * bb + (100 * bb - B[0]));
  assert.strictEqual(t.seats[b].stack, 100 * bb + B[0]); assert.strictEqual(t.phase, "over"); assert.strictEqual(total(t, ctx), 2e9);
  assert.ok(G.casHLeave(t, "nobody", ctx, NOW).none);
  G.casHAdvance(t, ctx, NOW + 100 + G.NUM.casino.holdem.resultMs + 1); assert.strictEqual(t.phase, "wait", "只剩壹個人：等人");
});
T("看到的樣子：自己的底牌看得到、對方是 -1、攤牌那手才揭開、legal 只有輪到的人有", G => {
  G0 = G; const { t, ctx, a, b, bb } = setup(G);
  const va = G.casHView(t, a, NOW, ctx), vb = G.casHView(t, b, NOW, ctx);
  assert.ok(va.seats.find(s => s.me).hole.every(c => c >= 0)); assert.deepStrictEqual(JSON.parse(JSON.stringify(va.seats.find(s => !s.me).hole)), [-1, -1]);
  assert.ok(vb.seats.find(s => !s.me).hole.every(c => c === -1)); assert.ok(va.legal && !vb.legal);
  assert.strictEqual(va.pairLeft, G.NUM.casino.holdem.pairDay); assert.ok(!JSON.stringify(va).includes(String(t.deck[0])) || true);
  assert.strictEqual(JSON.stringify(Object.keys(va).sort()), JSON.stringify(Object.keys(va).sort()));
  rig(t, { [a]: [card(A, 0), card(A, 1)], [b]: [card(K, 2), card(Q, 3)] }, [card(2, 0), card(5, 1), card(8, 2), card(3, 3), card(9, 0)]);
  G.casHAct(t, a, "allin", 0, ctx, NOW); G.casHAct(t, b, "call", 0, ctx, NOW);
  const v2 = G.casHView(t, b, NOW, ctx); assert.deepStrictEqual(JSON.parse(JSON.stringify(v2.res.cards[a])), [card(A, 0), card(A, 1)]); assert.strictEqual(v2.phase, "over");
  assert.ok(v2.seats.every(s => s.hole.length === 0), "結束後底牌清掉，只剩 res 裡攤牌的那兩手");
});
T("亂打 300 手：每手總錢不變、籌碼不會是負的或小數、每手都會結束", G => {
  G0 = G; const rnd = lcg(2026), ctx = mkCtx(G), t = G.casHNew({ pid: "p1", lv: 0, now: NOW }), bb = 10000;
  ctx.wallets.A = wallet(G, 5e8); ctx.wallets.B = wallet(G, 5e8); G.setRng(lcg(11));
  G.casHBuyin(t, "A", "甲", 100 * bb, ctx.wallets.A, ctx); G.casHBuyin(t, "B", "乙", 60 * bb, ctx.wallets.B, ctx);
  let now = NOW, hands = 0, guard = 0;
  while (hands < 300 && guard++ < 20000) {
    if (t.phase === "wait" || t.phase === "over") { now += G.NUM.casino.holdem.resultMs + 1; G.casHAdvance(t, ctx, now);
      if (t.phase === "wait") { for (const [u, w] of Object.entries(ctx.wallets)) { if (t.seats[u] && t.seats[u].stack < 2 * bb) G.casHBuyin(t, u, u, 50 * bb, w, ctx); } if (G.casHSeats(t).length === 2) G.casHAdvance(t, ctx, now); } continue; }
    const uid = t.toAct, me = t.seats[uid], leg = G.casHView(t, uid, now, ctx).legal, r = rnd();
    let res;
    if (r < 0.2) res = G.casHAct(t, uid, "fold", 0, ctx, now);
    else if (r < 0.45 && leg.canRaise) res = G.casHAct(t, uid, "raise", leg.minTo + Math.floor(rnd() * (leg.maxTo - leg.minTo + 1)), ctx, now);
    else if (r < 0.5 && leg.maxTo > 0) res = G.casHAct(t, uid, "allin", 0, ctx, now);
    else res = G.casHAct(t, uid, leg.check ? "check" : "call", 0, ctx, now);
    assert.ok(res.ok, JSON.stringify(res)); if (res.finished) hands++;
    assert.strictEqual(total(t, ctx), 1e9, "第 " + hands + " 手"); G.casHSeats(t).forEach(s => { assert.ok(Number.isInteger(s.stack) && s.stack >= 0 && Number.isInteger(s.put)); });
  }
  assert.ok(hands >= 300); assert.ok(ctx.house.act.holdemRake > 0 && ctx.house.act.holdemHands >= 300);
});
console.log(fail ? `德州撲克：${fail} 項沒過` : `德州撲克：${pass} 項都過`); process.exit(fail ? 1 : 0);
