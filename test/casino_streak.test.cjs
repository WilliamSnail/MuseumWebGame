// Hamachi 賭場的連勝連敗（決定 0049）：node test/casino_streak.test.cjs（npm test 也會跑）
// 翊文 11-09：「21點連續贏會恢復一點心情，連續輸會降一點san值」
// 數字讀 NUM.casino.streak，不寫死。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } finally { G.setRng(null); } };
const J = x => JSON.parse(JSON.stringify(x)); // vm 裡出來的物件跟這裡不是同一個 realm
const DAY = "2026-11-09", DAY2 = "2026-11-10";
const pf = (G, mood = 50, sanity = 50) => { const P = G.newProfile("challenge"); P.mood = mood; P.sanity = sanity; return P; };
const wal = (G, day = DAY) => G.casWalletFix(G.casWalletNew(), day);
const step = (G, w, P, kinds, day = DAY) => kinds.map(k => G.casSkStep(w, P, k, day));
const rep = (k, n) => Array(n).fill(k);
const ZH = ["零", "壹", "兩", "三", "四", "五", "六", "七", "八", "九", "十"];

T("連贏到門檻：心情加 NUM 的數字，連贏歸零重算", G => {
  const C = G.NUM.casino.streak, w = wal(G), P = pf(G, 50);
  const r = step(G, w, P, rep("win", C.winN));
  assert.strictEqual(r[C.winN - 1].mood, C.mood);
  assert.strictEqual(P.mood, 50 + C.mood);
  assert.strictEqual(w.sk.win, 0);
  assert.ok(r.slice(0, C.winN - 1).every(x => x.mood === 0 && !x.changed), "沒到門檻不加");
  step(G, w, P, rep("win", C.winN - 1));
  assert.strictEqual(P.mood, 50 + C.mood, "歸零後要重新數");
});
T("黑傑克、五張過關也算贏", G => {
  const C = G.NUM.casino.streak, w = wal(G), P = pf(G, 50);
  const kinds = ["win", "blackjack", "charlie", "win", "blackjack", "charlie"].slice(0, C.winN);
  assert.strictEqual(step(G, w, P, kinds)[kinds.length - 1].mood, C.mood);
});
T("連輸到門檻：理智扣 NUM 的數字，連輸歸零，不動心情", G => {
  const C = G.NUM.casino.streak, w = wal(G), P = pf(G, 50, 50);
  const r = step(G, w, P, rep("lose", C.loseN));
  assert.strictEqual(r[C.loseN - 1].san, C.san);
  assert.strictEqual(P.sanity, 50 - C.san);
  assert.strictEqual(P.mood, 50);
  assert.strictEqual(w.sk.lose, 0);
});
T("平手不中斷也不累積", G => {
  const C = G.NUM.casino.streak, w = wal(G), P = pf(G, 50);
  step(G, w, P, rep("win", C.winN - 1));
  assert.deepStrictEqual(J(G.casSkStep(w, P, "push", DAY)), { mood: 0, san: 0, lines: [], changed: false });
  assert.strictEqual(w.sk.win, C.winN - 1, "平手不加");
  assert.strictEqual(G.casSkStep(w, P, "win", DAY).mood, C.mood, "平手後再贏還接得上");
  step(G, w, P, rep("lose", C.loseN - 1)); G.casSkStep(w, P, "push", DAY);
  assert.strictEqual(w.sk.lose, C.loseN - 1);
});
T("贏輸交錯會中斷", G => {
  const C = G.NUM.casino.streak, w = wal(G), P = pf(G, 50, 50);
  step(G, w, P, rep("win", C.winN - 1)); step(G, w, P, ["lose"]);
  assert.strictEqual(w.sk.win, 0); assert.strictEqual(w.sk.lose, 1);
  step(G, w, P, rep("lose", C.loseN - 2)); step(G, w, P, ["win"]);
  assert.strictEqual(w.sk.lose, 0);
  assert.strictEqual(P.mood, 50); assert.strictEqual(P.sanity, 50);
});
T("心情每天最多 moodDay：到了上限不再加，計數照歸零", G => {
  const C = G.NUM.casino.streak, w = wal(G), P = pf(G, 10);
  const times = Math.ceil(C.moodDay / C.mood) + 3;
  for (let i = 0; i < times; i++) step(G, w, P, rep("win", C.winN));
  assert.strictEqual(P.mood, 10 + C.moodDay);
  assert.strictEqual(w.sk.mood, C.moodDay);
  assert.strictEqual(w.sk.win, 0);
  assert.strictEqual(G.casSkStep(w, P, "win", DAY).mood, 0);
});
T("上限不是整數倍時只加到剛好（今天只剩 1，就加 1）", G => {
  const C = G.NUM.casino.streak, w = wal(G), P = pf(G, 10);
  w.sk.mood = C.moodDay - 1;
  const r = step(G, w, P, rep("win", C.winN));
  assert.strictEqual(r[C.winN - 1].mood, Math.min(C.mood, 1));
  assert.strictEqual(w.sk.mood, C.moodDay);
});
T("理智每天最多扣 sanDay", G => {
  const C = G.NUM.casino.streak, w = wal(G), P = pf(G, 50, 80);
  for (let i = 0; i < C.sanDay + 4; i++) step(G, w, P, rep("lose", C.loseN));
  assert.strictEqual(P.sanity, 80 - C.sanDay);
  assert.strictEqual(w.sk.san, C.sanDay);
  assert.strictEqual(w.sk.lose, 0);
});
T("換日：今天的份重算，連勝連敗的計數留著", G => {
  const C = G.NUM.casino.streak, w = wal(G), P = pf(G, 10, 80);
  for (let i = 0; i < 10; i++) step(G, w, P, rep("win", C.winN));
  for (let i = 0; i < 10; i++) step(G, w, P, rep("lose", C.loseN));
  assert.strictEqual(w.sk.mood, C.moodDay); assert.strictEqual(w.sk.san, C.sanDay);
  step(G, w, P, rep("win", C.winN - 1));
  const m = P.mood, s = P.sanity;
  G.casWalletFix(w, DAY2);
  assert.strictEqual(w.sk.mood, 0); assert.strictEqual(w.sk.san, 0);
  assert.strictEqual(w.sk.win, C.winN - 1, "連勝跨日不歸零");
  assert.strictEqual(G.casSkStep(w, P, "win", DAY2).mood, C.mood);
  assert.strictEqual(P.mood, m + C.mood);
  step(G, w, P, rep("lose", C.loseN), DAY2);
  assert.strictEqual(P.sanity, s - C.san);
});
T("沒換日不會重算（同一天 casWalletFix 多次）", G => {
  const C = G.NUM.casino.streak, w = wal(G), P = pf(G, 10);
  step(G, w, P, rep("win", C.winN));
  G.casWalletFix(w, DAY); G.casWalletFix(w, DAY);
  assert.strictEqual(w.sk.mood, C.mood);
});
T("舊錢包沒有 sk（或壞掉）：補起來，不丟錯", G => {
  const C = G.NUM.casino.streak;
  for (const bad of [undefined, null, 5, "x", [], { win: "a", lose: -3, mood: NaN, day: 7 }]) {
    const old = J(wal(G)); delete old.sk; if (bad !== undefined) old.sk = bad;
    const w = G.casWalletFix(old, DAY), P = pf(G, 50);
    assert.deepStrictEqual(J(w.sk), { day: DAY, win: 0, lose: 0, mood: 0, san: 0 });
    assert.strictEqual(step(G, w, P, rep("win", C.winN))[C.winN - 1].mood, C.mood);
  }
});
T("心情已經 99：不加、不算進今天的份；98 只加到 99", G => {
  const C = G.NUM.casino.streak, w = wal(G), P = pf(G, 99);
  assert.strictEqual(step(G, w, P, rep("win", C.winN))[C.winN - 1].mood, 0);
  assert.strictEqual(P.mood, 99); assert.strictEqual(w.sk.mood, 0);
  P.mood = 98;
  assert.strictEqual(step(G, w, P, rep("win", C.winN))[C.winN - 1].mood, 1);
  assert.strictEqual(P.mood, 99);
});
T("理智最低留 1：不走 applySan（不記今天掉的、不觸發小缺點、不熄燈）", G => {
  const C = G.NUM.casino.streak, w = wal(G), P = pf(G, 50, 2);
  G.ensureDay(P, DAY);
  const lost0 = P.day.lost;
  for (let i = 0; i < 6; i++) step(G, w, P, rep("lose", C.loseN));
  assert.strictEqual(P.sanity, 1);
  assert.strictEqual(P.day.lost, lost0, "不算進今天掉的理智");
  assert.ok(!P.dark && !P.day.quirkGiven && !P.bout);
  const Q = pf(G, 50, 1), w2 = wal(G);
  assert.strictEqual(step(G, w2, Q, rep("lose", C.loseN))[C.loseN - 1].san, 0); assert.strictEqual(Q.sanity, 1);
  const Z = pf(G, 50, 0); Z.dark = true; const w3 = wal(G);
  assert.strictEqual(step(G, w3, Z, rep("lose", C.loseN))[C.loseN - 1].san, 0); assert.strictEqual(Z.sanity, 0);
  const N = pf(G, 50, NaN), w4 = wal(G);
  step(G, w4, N, rep("lose", C.loseN)); assert.ok(Number.isNaN(N.sanity), "壞值不碰");
});
T("扣不到的時候不佔今天的份", G => {
  const C = G.NUM.casino.streak, w = wal(G), P = pf(G, 50, 1);
  step(G, w, P, rep("lose", C.loseN * 3));
  assert.strictEqual(w.sk.san, 0);
});
T("自由模式、沒有存檔：什麼都不做，計數也不動", G => {
  const C = G.NUM.casino.streak, w = wal(G), F = G.newProfile("free"); F.mood = 20; F.sanity = 30;
  step(G, w, F, rep("win", C.winN)); step(G, w, F, rep("lose", C.loseN));
  assert.strictEqual(F.mood, 20); assert.strictEqual(F.sanity, 30);
  assert.strictEqual(w.sk.win, 0); assert.strictEqual(w.sk.lose, 0);
  assert.strictEqual(G.casSkStep(w, null, "win", DAY).changed, false);
  assert.strictEqual(w.sk.win, 0);
});
T("通知文字：博物館口吻、用「壹」、不提錢", G => {
  const C = G.NUM.casino.streak;
  assert.deepStrictEqual(J(G.casSkLines(C.mood, 0)), [`手氣順了${ZH[C.winN]}把，心情好了壹點（心情 +${C.mood}）`]);
  assert.deepStrictEqual(J(G.casSkLines(0, C.san)), [`連輸${ZH[C.loseN]}把，手心冒汗（理智 -${C.san}）`]);
  assert.deepStrictEqual(J(G.casSkLines(0, 0)), []);
  const all = G.casSkLines(C.mood, C.san).join("");
  assert.ok(!/籌碼|錢|賺|下注|一/.test(all), all);
});

// ---------- 接進單人每一步（伺服器的做法）----------
const card = (r, s = 0) => (r - 1) + s * 13;
// deck 從尾巴抽：玩家1、莊家底牌、玩家2、莊家明牌
const deckFor = (G, p, d) => {
  const deal = [p[0], d[0], p[1], d[1]], filler = G.casDeck().filter(x => !deal.includes(x));
  return filler.concat(deal.slice().reverse());
};
const WINDECK = G => deckFor(G, [card(13), card(12)], [card(10), card(7)]);   // 玩家 20、莊家 17
const LOSEDECK = G => deckFor(G, [card(10), card(7)], [card(13), card(12)]);  // 玩家 17、莊家 20
const PUSHDECK = G => deckFor(G, [card(10), card(8)], [card(10), card(8)]);   // 18 對 18
const play = (G, ctx, deck) => {
  ctx.deck = deck; ctx.id = "r" + Math.random();
  let r = G.casStepDeal(ctx, "1000");
  if (r.view.state === "playing") r = G.casStepStand(ctx, ctx.round.seq);
  return r;
};
const fresh = (G, P) => ({ w: wal(G), house: G.casHouseFix(G.casHouseNew(), DAY).house, round: null, P, day: DAY, saveDirty: false });

T("單人結算：連贏三把，伺服器算出心情、寫進 P、要求寫存檔", G => {
  const C = G.NUM.casino.streak, P = pf(G, 50), ctx = fresh(G, P);
  let r;
  for (let i = 0; i < C.winN; i++) { ctx.saveDirty = false; r = play(G, ctx, WINDECK(G)); assert.strictEqual(r.settle.ok, true); }
  assert.strictEqual(P.mood, 50 + C.mood);
  assert.strictEqual(ctx.saveDirty, true);
  assert.deepStrictEqual(J(r.settle.streak), J(G.casSkLines(C.mood, 0)));
});
T("單人結算：連輸，平手夾在中間不中斷", G => {
  const C = G.NUM.casino.streak, P = pf(G, 50, 50), ctx = fresh(G, P);
  for (let i = 0; i < C.loseN; i++) {
    play(G, ctx, LOSEDECK(G));
    if (i === 0) assert.deepStrictEqual(J(play(G, ctx, PUSHDECK(G)).settle.streak), []);
  }
  assert.strictEqual(P.sanity, 50 - C.san);
});
T("單人結算：沒有 P（沒讀存檔）照常結算，沒有 streak 效果", G => {
  const C = G.NUM.casino.streak, ctx = fresh(G, null);
  for (let i = 0; i < C.winN; i++) { const r = play(G, ctx, WINDECK(G)); assert.ok(r.settle.ok); assert.strictEqual(r.settle.streak, undefined); }
  assert.strictEqual(ctx.saveDirty, false); assert.strictEqual(ctx.w.sk.win, 0);
});
T("重複送同一局不會重算", G => {
  const P = pf(G, 50), ctx = fresh(G, P);
  play(G, ctx, WINDECK(G));
  assert.strictEqual(ctx.w.sk.win, 1);
  assert.strictEqual(G.casStepStand(ctx, ctx.round.seq).ok, false); // 這一手已經打完
  assert.strictEqual(G.casStepHit(ctx, ctx.round.seq).ok, false);
  assert.strictEqual(G.casSettle(ctx.w, ctx.house, ctx.round, { day: DAY }).already, true);
  assert.strictEqual(ctx.w.sk.win, 1); assert.strictEqual(P.mood, 50);
});
T("單人結算：自由模式的 P 沒有效果", G => {
  const C = G.NUM.casino.streak, F = G.newProfile("free"); F.mood = 20; F.sanity = 30;
  const ctx = fresh(G, F);
  for (let i = 0; i < C.winN; i++) play(G, ctx, WINDECK(G));
  assert.strictEqual(F.mood, 20); assert.strictEqual(ctx.saveDirty, false);
});

console.log(`連勝連敗：${pass} 項過，${fail} 項沒過`);
process.exit(fail ? 1 : 0);
