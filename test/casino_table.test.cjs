// Hamachi 賭場：館友同桌（第二階段，決定 0040）：node test/casino_table.test.cjs（npm test 也會跑）
// 一個到四個人同一桌、同一副牌、輪流、時間限制、超時和斷線當停牌、別人的暗牌不外洩、離桌不影響別人、錢守恆。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } finally { G.setRng(null); } };
const JS = x => JSON.parse(JSON.stringify(x));
const eq = (a, b) => assert.deepStrictEqual(JS(a), JS(b));
const DAY = "2026-11-09", T0 = 1_000_000;
const card = (r, s = 0) => (r - 1) + s * 13;
const c = (...rs) => rs.map(r => card(r));

// 一桌 n 個人，每個人 1,000,000 籌碼
const mk = (G, n = 2, seed = 1) => {
  G.setRng(G.mulberry32(seed));
  const t = G.casTNew({ pid: "p1", now: T0 });
  const wallets = {}, ids = ["a", "b", "c", "d"].slice(0, n);
  ids.forEach(id => { assert.ok(G.casTSit(t, id, "館友" + id).ok); wallets[id] = G.casWalletFix(G.casWalletNew(), DAY); wallets[id].tablePid = "p1"; });
  const ctx = { wallets, house: G.casHouseFix(G.casHouseNew(), DAY).house, day: DAY };
  return { t, ctx, ids };
};
const total = (ctx) => Object.values(ctx.wallets).reduce((s, w) => s + w.chips, 0) + ctx.house.bankroll;
// 直接擺好一局（跳過洗牌）：players 是每位的牌，dealer 是 [底牌, 明牌]，deck 是之後依序發的牌
const rig = (G, { n = 2, players, dealer, deck = [], bets = 1000 }) => {
  const m = mk(G, n);
  m.ids.forEach((id, i) => { const w = m.ctx.wallets[id], s = m.t.seats[id]; w.chips -= bets; Object.assign(s, { bet: bets, st: "play", cards: players[i].slice(), allin: false }); if (G.casHand(s.cards).total === 21) s.st = "stand"; });
  m.t.phase = "play"; m.t.dealer = dealer.slice(); m.t.deck = deck.slice().reverse(); m.t.deadline = T0 + G.NUM.casino.turnMs; m.t.rid = "p1:1"; m.t.round = 1;
  m.t.turn = m.ids.find(id => m.t.seats[id].st === "play") || null;
  if (!m.t.turn) G.casTFinishForTest = null;
  return m;
};
const N = G => G.NUM.casino;

T("入座：最多 NUM.casino.seats 人，第 5 個進不來；同一個人再坐是同一個座位；一個人也能開桌", G => {
  const t = G.casTNew({ pid: "p", now: T0 });
  ["a", "b", "c", "d"].forEach(id => assert.ok(G.casTSit(t, id, id).ok));
  const no = G.casTSit(t, "e", "e"); assert.ok(!no.ok && no.reason.includes("坐滿"));
  assert.ok(G.casTSit(t, "a", "甲").again); assert.strictEqual(t.order.length, 4); assert.strictEqual(N(G).seats, 4);
  const solo = mk(G, 1);
  assert.strictEqual(solo.t.order.length, 1);
  assert.ok(G.casTBet(solo.t, "a", "1000", { san: 99, bonusPct: 0 }, solo.ctx, T0).ok);
  assert.strictEqual(solo.t.phase, "play", "一個人下好注就發牌");
});
T("下注：扣錢包；壞的注荷官挑剔、錢不動；下過不能再下；打牌中不能下", G => {
  const { t, ctx } = mk(G, 2);
  const w = ctx.wallets.a, c0 = w.chips;
  const g = G.casTBet(t, "a", "abc", { san: 99 }, ctx, T0); assert.ok(!g.ok && g.gag && g.reason.includes("abc")); assert.strictEqual(w.chips, c0);
  assert.ok(G.casTBet(t, "a", "5000", { san: 99 }, ctx, T0).ok); assert.strictEqual(w.chips, c0 - 5000); assert.strictEqual(t.phase, "bet", "b 還沒下");
  assert.ok(!G.casTBet(t, "a", "5000", { san: 99 }, ctx, T0).ok);
  assert.ok(G.casTBet(t, "b", "7000", { san: 99 }, ctx, T0).ok);
  assert.strictEqual(t.phase, "play");
  const late = mk(G, 2); late.t.phase = "play";
  assert.ok(!G.casTBet(late.t, "a", "100", { san: 99 }, late.ctx, T0).ok);
});
T("同一副牌：發牌後所有人的牌、莊家的牌、剩下的牌加起來是 52 張，沒有重複", G => {
  for (let seed = 1; seed < 60; seed++) {
    const { t, ctx, ids } = mk(G, 4, seed);
    ids.forEach(id => G.casTBet(t, id, "1000", { san: 99 }, ctx, T0));
    const all = [].concat(...ids.map(id => t.seats[id].cards), t.dealer, t.deck);
    assert.strictEqual(all.length, 52); assert.strictEqual(new Set(all).size, 52);
  }
});
T("輪流：一次只有輪到的人能動；要牌、停牌之後換下一位；全部打完莊家補牌、結算", G => {
  const { t, ctx } = rig(G, { players: [c(10, 6), c(10, 8)], dealer: [card(10), card(7)], deck: c(2, 2) });
  assert.strictEqual(t.turn, "a");
  const early = G.casTAct(t, "b", "stand", t.seq, ctx, T0); assert.ok(!early.ok && early.reason.includes("還沒輪到"));
  const stale = G.casTAct(t, "a", "hit", t.seq - 1, ctx, T0); assert.ok(!stale.ok);
  assert.ok(G.casTAct(t, "a", "hit", t.seq, ctx, T0).ok); // a: 10+6+2 = 18
  assert.strictEqual(t.turn, "a", "還在要牌");
  assert.ok(G.casTAct(t, "a", "stand", t.seq, ctx, T0).ok);
  assert.strictEqual(t.turn, "b");
  assert.ok(G.casTAct(t, "b", "stand", t.seq, ctx, T0).ok);
  assert.strictEqual(t.phase, "result");
  assert.strictEqual(t.seats.a.out.kind, "win"); assert.strictEqual(t.seats.b.out.kind, "win", "17 對 莊家 17：b 的 18 贏");
});
T("結果各算各的：a 爆、b 贏、c 平手、d 輸；錢守恆（玩家加莊家不變）", G => {
  const { t, ctx, ids } = rig(G, { n: 4, players: [c(10, 6), c(10, 9), c(10, 8), c(10, 7)], dealer: [card(10), card(8)], deck: c(10) });
  const before = total(ctx) + 4000; // 注已經從錢包扣了，莊家還沒收
  G.casTAct(t, "a", "hit", t.seq, ctx, T0); // 爆
  ["b", "c", "d"].forEach(id => G.casTAct(t, id, "stand", t.seq, ctx, T0));
  assert.strictEqual(t.phase, "result");
  eq(ids.map(id => t.seats[id].out.kind), ["lose", "win", "push", "lose"]);
  assert.strictEqual(ctx.wallets.a.chips, 1000000 - 1000 - 0 + 0 - 0 + 0 - 0 + 0); // a 輸掉注
  assert.strictEqual(ctx.wallets.b.chips, 1000000 + 1000); assert.strictEqual(ctx.wallets.c.chips, 1000000);
  assert.strictEqual(total(ctx), before);
});
T("斷線、超時當停牌：輪到的人時間到自動停牌，下一位照樣有完整的時間；全部沒動，一路補完到結算", G => {
  const { t, ctx } = rig(G, { players: [c(10, 6), c(10, 8)], dealer: [card(10), card(7)] });
  const turn = N(G).turnMs;
  assert.strictEqual(G.casTAdvance(t, ctx, T0 + turn - 1), false, "時間還沒到：什麼都不改");
  assert.strictEqual(t.turn, "a");
  assert.ok(G.casTAdvance(t, ctx, T0 + turn));
  assert.ok(t.seats.a.timedOut && t.seats.a.st === "stand" && t.turn === "b"); assert.strictEqual(t.deadline, T0 + turn + turn, "b 有自己完整的時間");
  assert.ok(G.casTAdvance(t, ctx, T0 + turn * 2));
  assert.strictEqual(t.phase, "result"); assert.ok(t.seats.b.timedOut);
  assert.ok(t.seats.a.out && t.seats.b.out);
  G.casTAdvance(t, ctx, T0 + turn * 2 + N(G).resultMs);
  assert.strictEqual(t.phase, "bet"); assert.strictEqual(t.round, 2); assert.ok(t.seats.a.cards.length === 0 && t.seats.a.bet === 0, "下一局乾乾淨淨");
});
T("很久沒人叫 tick：一次補完好幾個階段（斷線的人當停牌，錢照結算）", G => {
  const { t, ctx } = rig(G, { players: [c(10, 6), c(10, 8)], dealer: [card(10), card(7)] });
  const c0 = total(ctx) + 2000;
  G.casTAdvance(t, ctx, T0 + 10 * 60 * 1000);
  assert.ok(["bet"].includes(t.phase), t.phase);
  assert.strictEqual(total(ctx), c0);
  assert.ok(t.seats.a.cards.length === 0);
});
T("下注時間到：只有下了注的人打；沒下的人這局旁觀；沒人下注就再等一輪", G => {
  const { t, ctx } = mk(G, 3);
  G.casTBet(t, "a", "1000", { san: 99 }, ctx, T0);
  assert.strictEqual(t.phase, "bet");
  G.casTAdvance(t, ctx, T0 + N(G).betMs);
  assert.strictEqual(t.phase, "play"); assert.strictEqual(t.seats.a.cards.length, 2); assert.strictEqual(t.seats.b.cards.length, 0); assert.strictEqual(t.seats.b.st, "idle");
  const e = mk(G, 2); G.casTAdvance(e.t, e.ctx, T0 + N(G).betMs);
  assert.strictEqual(e.t.phase, "bet"); assert.ok(e.t.deadline > T0 + N(G).betMs - 1, "沒人下注：再等壹輪，不發牌");
});
T("前兩張 21 點自動停牌，輪不到他按；他的黑傑克照 3:2", G => {
  const { t, ctx } = rig(G, { players: [[card(1), card(13)], c(10, 8)], dealer: [card(10), card(7)] });
  assert.strictEqual(t.seats.a.st, "stand"); assert.strictEqual(t.turn, "b");
  G.casTAct(t, "b", "stand", t.seq, ctx, T0);
  assert.strictEqual(t.seats.a.out.kind, "blackjack"); assert.strictEqual(t.seats.a.out.payout, 2500);
});
T("別人的暗牌不外洩：打牌中看到的樣子沒有牌組、莊家底牌是 -1；結算才翻開", G => {
  const { t, ctx } = rig(G, { players: [c(10, 6), c(10, 8)], dealer: [card(5), card(7)], deck: c(9, 9, 9) });
  for (const id of ["a", "b"]) {
    const v = G.casTView(t, id, T0), text = JSON.stringify(v);
    assert.strictEqual(v.dealer.cards[0], -1); assert.strictEqual(v.dealer.cards.length, 2); assert.strictEqual(v.dealer.total, null);
    assert.ok(!text.includes("deck") && !text.includes("san") && !text.includes("bonusPct") && !text.includes("chips"), "沒有牌組、理智、錢包");
    assert.strictEqual(v.seats.length, 2); assert.ok(v.seats.every(s => s.out === null));
  }
  G.casTAct(t, "a", "stand", t.seq, ctx, T0); G.casTAct(t, "b", "stand", t.seq, ctx, T0);
  const r = G.casTView(t, "a", T0);
  assert.strictEqual(r.phase, "result"); assert.ok(r.dealer.cards.every(x => x >= 0)); assert.ok(r.dealer.total >= 17 || G.casHand(t.dealer).bust);
  assert.ok(r.seats.every(s => s.out));
});
T("理智低只有自己看錯牌：同一個畫面別人看到的是真的；結算翻回真的、點數用真的", G => {
  const { t, ctx } = rig(G, { players: [c(10, 6), c(10, 8)], dealer: [card(5), card(7)] });
  t.seats.a.san = 3;
  let slipped = false;
  for (let i = 0; i < 40 && !slipped; i++) {
    t.rid = "p1:" + i;
    const va = G.casTView(t, "a", T0), vb = G.casTView(t, "b", T0);
    assert.ok(vb.seats.every(s => s.cards.every((x, k) => x === t.seats[s.uid].cards[k])), "b 的理智夠：看到真的");
    if (va.seats.some(s => s.cards.some((x, k) => x !== t.seats[s.uid].cards[k])) || va.dealer.cards[1] !== t.dealer[1]) slipped = true;
    eq(G.casTView(t, "a", T0), va); // 同一個畫面重複看是一樣的
  }
  assert.ok(slipped, "理智 3：看過錯牌");
  G.casTAct(t, "a", "stand", t.seq, ctx, T0); G.casTAct(t, "b", "stand", t.seq, ctx, T0);
  const r = G.casTView(t, "a", T0);
  r.seats.forEach(s => eq(s.cards, t.seats[s.uid].cards));
  assert.strictEqual(t.seats.a.out.kind, G.casOutcome(t.seats.a.cards, t.dealer).kind, "結算用真的牌");
});
T("離桌：下注前離開退注；別人照常；人都走光才收", G => {
  const { t, ctx } = mk(G, 3);
  G.casTBet(t, "a", "5000", { san: 99 }, ctx, T0);
  const r = G.casTLeave(t, "a", ctx, T0);
  assert.ok(r.ok && r.refund === 5000); assert.strictEqual(ctx.wallets.a.chips, 1000000); assert.strictEqual(ctx.wallets.a.tablePid, null);
  assert.ok(!t.seats.a && t.order.length === 2);
  G.casTBet(t, "b", "1000", { san: 99 }, ctx, T0); G.casTBet(t, "c", "1000", { san: 99 }, ctx, T0);
  assert.strictEqual(t.phase, "play", "剩下的人都下好就開始");
});
T("離桌不影響別人結算：打牌中離開，這一手當停牌、照樣結算進他的錢包，別人的結果跟他在不在無關", G => {
  const mkRound = () => rig(G, { n: 3, players: [c(10, 6), c(10, 8), c(10, 9)], dealer: [card(10), card(7)], deck: c(10, 3) });
  // 他在：全部停牌
  const a = mkRound();
  ["a", "b", "c"].forEach(id => G.casTAct(a.t, id, "stand", a.t.seq, a.ctx, T0));
  // 他不在：b 走掉
  const b = mkRound();
  G.casTAct(b.t, "a", "stand", b.t.seq, b.ctx, T0);
  const left = G.casTLeave(b.t, "b", b.ctx, T0);
  assert.ok(left.ok && left.stays && b.t.seats.b.gone);
  assert.strictEqual(b.t.turn, "c", "他的那一手當停牌，輪到下一位");
  G.casTAct(b.t, "c", "stand", b.t.seq, b.ctx, T0);
  assert.strictEqual(b.t.phase, "result");
  eq([a.t.seats.a.out, a.t.seats.c.out], [b.t.seats.a.out, b.t.seats.c.out]);
  eq(a.ctx.wallets.b.chips, b.ctx.wallets.b.chips); // 走掉的人照樣拿到結算
  assert.strictEqual(b.ctx.wallets.b.tablePid, null);
  const view = G.casTView(b.t, "a", T0);
  assert.ok(view.seats.find(s => s.uid === "b").gone);
  G.casTAdvance(b.t, b.ctx, T0 + N(G).resultMs + 10 * 1000 * 60);
  assert.ok(!b.t.seats.b, "下一局他的座位拿掉了");
});
T("最後壹位離桌：這一手結算完才收，錢不會不見", G => {
  const { t, ctx } = rig(G, { n: 2, players: [c(10, 8), c(10, 9)], dealer: [card(10), card(7)] });
  const sum = total(ctx) + 2000;
  G.casTLeave(t, "a", ctx, T0); G.casTLeave(t, "b", ctx, T0);
  assert.strictEqual(t.phase, "result"); assert.strictEqual(total(ctx), sum);
});
T("成就：同桌打完壹局（兩人以上）；單獨壹個人不算", G => {
  const two = rig(G, { n: 2, players: [c(10, 8), c(10, 9)], dealer: [card(10), card(7)] });
  G.casTAct(two.t, "a", "stand", two.t.seq, two.ctx, T0); G.casTAct(two.t, "b", "stand", two.t.seq, two.ctx, T0);
  assert.ok(two.ctx.wallets.a.ach.table && two.ctx.wallets.a.props.table);
  const one = rig(G, { n: 1, players: [c(10, 8)], dealer: [card(10), card(7)] });
  G.casTAct(one.t, "a", "stand", one.t.seq, one.ctx, T0);
  assert.ok(!one.ctx.wallets.a.ach.table);
});
T("加成只算自己的：賭徒的注贏了多拿，同桌的別人不受影響", G => {
  const { t, ctx } = rig(G, { players: [c(10, 9), c(10, 9)], dealer: [card(10), card(7)], bets: 1000000 });
  t.seats.a.bonusPct = 1;
  G.casTAct(t, "a", "stand", t.seq, ctx, T0); G.casTAct(t, "b", "stand", t.seq, ctx, T0);
  assert.strictEqual(t.seats.a.out.bonus, 10000); assert.strictEqual(t.seats.b.out.bonus, 0);
});
T("下一局：座位留著、錢包留著、新的一副牌；沒下注的人 idle 計數", G => {
  const { t, ctx } = rig(G, { players: [c(10, 8), c(10, 9)], dealer: [card(10), card(7)] });
  G.casTAct(t, "a", "stand", t.seq, ctx, T0); G.casTAct(t, "b", "stand", t.seq, ctx, T0);
  const rid1 = t.rid;
  G.casTAdvance(t, ctx, t.deadline);
  assert.strictEqual(t.phase, "bet"); assert.notStrictEqual(t.rid, rid1); eq(t.order, ["a", "b"]); assert.strictEqual(t.deck.length, 0);
});
T("說話的短句清單、聊天用的字數", G => {
  assert.ok(G.CAS_QUICK.length >= 5 && G.CAS_QUICK.every(s => s.length <= 8 && !s.includes("一")));
});

T("跑 3000 局亂打：有人不下注、有人斷線、有人中途離桌又回來；錢包加莊家永遠不變、牌永遠 52 張不重複", G => {
  G.setRng(G.mulberry32(99));
  const t = G.casTNew({ pid: "s", now: T0 });
  const wallets = {};
  const ctx = { wallets, house: G.casHouseFix(G.casHouseNew(), DAY).house, day: DAY };
  const people = ["a", "b", "c", "d"];
  people.forEach(id => { wallets[id] = G.casWalletFix(G.casWalletNew(), DAY); });
  const sum0 = total(ctx);
  let now = T0, rounds = 0;
  const sit = id => { if (!t.seats[id]) { G.casTSit(t, id, id); wallets[id].tablePid = "s"; } };
  people.slice(0, 2).forEach(sit);
  while (rounds < 3000) {
    const r = G.RNG();
    if (t.phase === "bet") {
      people.forEach(id => { if (r < 0.1 && G.RNG() < 0.3) sit(id); });
      people.forEach(id => { if (t.seats[id] && !t.seats[id].bet && G.RNG() < 0.8 && wallets[id].chips >= 100) G.casTBet(t, id, String(100 * (1 + Math.floor(G.RNG() * 50))), { san: 99, bonusPct: 0.3 }, ctx, now); });
      now += 1000 * Math.floor(G.RNG() * 40);
    } else if (t.phase === "play") {
      const all = [].concat(...G.casTSeats(t).map(s => s.cards), t.dealer, t.deck);
      assert.strictEqual(new Set(all).size, all.length);
      assert.ok(all.length <= 52 && all.length >= 40);
      const u = t.turn;
      const x = G.RNG();
      if (x < 0.15 && G.casTSeats(t).length > 1) { G.casTLeave(t, u, ctx, now); }
      else if (x < 0.75) G.casTAct(t, u, G.RNG() < 0.5 ? "hit" : "stand", t.seq, ctx, now);
      else now += G.NUM.casino.turnMs; // 發呆：時間到
    } else { now += G.NUM.casino.resultMs; rounds++; }
    G.casTAdvance(t, ctx, now);
    if (t.order.length === 0) sit("a");
    // 還在桌上的人，錢包 + 注（還沒結算的）+ 莊家 要守恆：離桌的人也算（錢包還在）
    const pending = G.casTSeats(t).reduce((s, x) => s + (x.bet > 0 && !x.out && t.phase !== "bet" || t.phase === "bet" && x.bet > 0 ? x.bet : 0), 0);
    assert.strictEqual(total(ctx) + pending, sum0, `第 ${rounds} 局錢不守恆`);
  }
  assert.ok(Object.values(wallets).every(w => w.chips >= 0));
});

console.log(`${pass} passed, ${fail} failed（賭場同桌）`);
process.exit(fail ? 1 : 0);
