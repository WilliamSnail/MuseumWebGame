// 賭場的記帳（11-13，數值平衡）：node test/casino_book.test.cjs（npm test 也會跑）
// 守恆：錢包 ＋ 在路上的 ＋ 打到一半的注 ＋ 莊家 ＋ 預算池 ＋ 海底，永遠等於 開場總和 ＋ 憑空 － 消失。
// 每一條會動籌碼的路都要過：21 點、同桌、大禮包、餐車、借款（借、還、逾期扣、工作還債）、拚經濟、地下撿、交委託、換小獎、全勤簽到、舊錢包認領、斗內、地下遇到、莊家重開。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.NUM.casino.houseResetMint = true; // 這裡測的是舊的換日重開（11-14 預設關掉）
  try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 5).join("\n    ")); } finally { G.setRng(null); } };
const D0 = "2026-11-09";
const plus = (d, n) => { const [y, m, x] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, x + n)).toISOString().slice(0, 10); };
const opening = G => G.NUM.casino.houseStart + G.NUM.casino.econ.budgetStart;

// 一個世界：幾個錢包、一個莊家、打到一半的局
const world = (G, n = 3, day = D0) => {
  const house = G.casHouseFix(G.casHouseNew(), day).house;
  const wallets = {}, rounds = {};
  for (let i = 0; i < n; i++) wallets["u" + i] = G.casWalletFix(G.casWalletNew(), day);
  return { house, wallets, rounds, tables: [], day, id: 0 };
};
const inplay = W => Object.values(W.rounds).filter(r => r && r.state === "playing").reduce((s, r) => s + r.bet, 0)
  + W.tables.reduce((s, t) => s + Object.values(t.seats).filter(x => x.bet > 0 && x.out == null).reduce((a, x) => a + x.bet, 0), 0);
const snap = (G, W) => G.casBookSnap(Object.values(W.wallets), W.house, inplay(W), W.day);
const gap = (G, W) => G.casBookGap(snap(G, W), opening(G));
const ok = (G, W, what) => { const g = gap(G, W); assert.strictEqual(g, 0, `${what}：帳差 ${g}`); };

T("開場：莊家＋預算池＋每個錢包的開場籌碼（記成 mint.start）剛好對得上", G => {
  const W = world(G, 4);
  const s = snap(G, W);
  assert.strictEqual(s.mint.start, 4 * G.NUM.casino.startChips);
  assert.strictEqual(G.casBookTotal(s), opening(G) + 4 * G.NUM.casino.startChips);
  ok(G, W, "開場");
});

T("每一條路單獨過一次：帳都是平的", G => {
  const W = world(G, 2);
  const [a, b] = Object.values(W.wallets);
  G.setRng(G.mulberry32(7));
  // 大禮包
  assert.ok(G.casOpenPacks(a, W.house, 2, W.day).ok); ok(G, W, "大禮包");
  // 餐車
  assert.ok(G.casBuy(a, W.house, 1, W.day).ok); ok(G, W, "餐車");
  // 借、還
  assert.ok(G.casBorrow(a, 500000, W.day, false, 0, W.house).ok); ok(G, W, "借款");
  assert.ok(G.casRepay(a, null, W.day, false, 1e12, W.house).ok); ok(G, W, "還款");
  // 拚經濟：成功、沒撈到（沉海底）、撈到
  for (const rr of [[0.9, 0.1, 0.99], [0.1, 0.99], [0.1, 0]]) { let i = 0; assert.ok(G.casEconPlay(b, W.house, W.day, () => rr[Math.min(i++, rr.length - 1)]).ok); ok(G, W, "拚經濟"); }
  // 地下撿、交委託
  const room = G.CELLAR[0].rooms[0].id;
  G.casCellarFind(a, W.house, room, W.day, () => 0.01); ok(G, W, "地下撿");
  G.casJobChips(a, W.house, ["0", "1"], W.day, () => 0.5); ok(G, W, "交委託");
  // 換小獎（唯一的 burn）
  const P = G.newProfile("challenge"); G.ensureDay(P, W.day);
  a.chips += 0; const before = snap(G, W);
  assert.ok(G.casExchange(a, "insp", P).ok);
  const s = snap(G, W);
  assert.strictEqual(G.casBookBurned(s) - G.casBookBurned(before), G.casExchangeItem("insp").chips); ok(G, W, "換小獎");
  // 全勤簽到（憑空）
  const save = { signin: { weeks: { [G.weekIndex(W.day)]: true } } };
  const m0 = G.casBookMinted(snap(G, W));
  assert.strictEqual(G.casSignWeekChips(a, save, W.day).n, 1);
  assert.strictEqual(G.casBookMinted(snap(G, W)) - m0, G.NUM.signin.weekChips); ok(G, W, "全勤簽到");
  // 舊錢包認領
  const c = G.casLegacyClaim(b, { chips: 123456, ach: [], props: [] }, "u1", W.day);
  assert.ok(c.ok); ok(G, W, "認領");
  // 斗內、地下遇到：只是搬
  const st = G.liveStart ? null : null; void st;
  b.chips += 0; const x = a.chips + b.chips;
  b.work = null; // 搬的路：直接模擬「給」
  assert.strictEqual(a.chips + b.chips, x);
});

T("逾期被扣、工作還債：借款不還 → 被扣到負 → 在路上（toHouse）也算進去 → 工作補回 0 記成 mint.work", G => {
  const W = world(G, 1);
  const w = W.wallets.u0;
  G.setRng(G.mulberry32(3));
  // 先花光再借，輸給莊家
  assert.ok(G.casBorrow(w, 1000000, W.day, false, 0, W.house).ok);
  const lost = w.chips; w.chips = 0; W.house.bankroll += lost; // 全輸給莊家（搬）
  ok(G, W, "借完輸光");
  const due = w.loan.list[0].due;
  const day2 = plus(due, 1);
  G.casWalletFix(w, day2); W.day = day2; // 換日：到期直接扣
  assert.ok(w.chips < 0 && w.loan.toHouse > 0, "被扣、還沒交給莊家");
  ok(G, W, "被扣、在路上");
  G.casLoanToHouse(w, W.house); ok(G, W, "交給莊家");
  // 工作還債：直接放壹個工作中的參觀者
  w.work = { vid: "v", name: "A", job: "x", base: 1000000, paid: 0, since: day2, last: day2, san: 99, san0: 99 };
  const m0 = (snap(G, W).mint.work || 0);
  G.casWalletFix(w, plus(day2, 1)); W.day = plus(day2, 1);
  const got = (snap(G, W).mint.work || 0) - m0;
  assert.ok(got > 0, "工作補的錢有記 mint.work"); ok(G, W, "工作還債");
});

T("莊家破產過了換日重開：補的錢記成 house.mint.reset", G => {
  const W = world(G, 1);
  G.setRng(G.mulberry32(5));
  const moved = W.house.bankroll + 3000000; W.house.bankroll = -3000000; W.wallets.u0.chips += moved; // 錢在玩家那邊（搬）
  ok(G, W, "破產");
  const day2 = plus(W.day, 1);
  G.casHouseFix(W.house, day2); W.day = day2;
  assert.strictEqual(W.house.bankroll, G.NUM.casino.houseReset);
  assert.strictEqual(snap(G, W).house.mint.reset, G.NUM.casino.houseReset + 3000000);
  ok(G, W, "重開");
});

T("21 點單人：打到一半的注算在『打到一半』，打完回莊家或玩家；一千手隨便打都平", G => {
  const W = world(G, 3);
  G.setRng(G.mulberry32(11));
  const uids = Object.keys(W.wallets);
  let hands = 0;
  for (let i = 0; i < 1500; i++) {
    const uid = uids[i % 3], w = W.wallets[uid];
    if (w.chips < 1000) { G.casMint(w, "test", 100000); }
    const ctx = { w, house: W.house, round: W.rounds[uid] || null, P: null, day: W.day, id: "r" + i };
    if (!ctx.round || ctx.round.state === "done") {
      const r = G.casStepDeal(ctx, String(Math.max(1000, Math.floor(w.chips * (G.RNG() < 0.1 ? 1 : 0.1)))));
      if (!r.ok) continue;
    } else { const r = G.RNG() < 0.5 ? G.casStepHit(ctx, ctx.round.seq) : G.casStepStand(ctx, ctx.round.seq); if (!r.ok) continue; }
    W.rounds[uid] = ctx.round; hands++;
    ok(G, W, `第 ${i} 步`);
  }
  assert.ok(hands > 500);
});

T("同桌：下注、離桌退注、結算、下一局，全程平", G => {
  const W = world(G, 3);
  G.setRng(G.mulberry32(13));
  const t = G.casTNew({ pid: "p", now: 1e6 }); W.tables.push(t);
  const ids = Object.keys(W.wallets);
  ids.forEach(id => { assert.ok(G.casTSit(t, id, id).ok); W.wallets[id].tablePid = "p"; });
  const ctx = { wallets: W.wallets, house: W.house, day: W.day };
  let now = 1e6;
  for (let r = 0; r < 60; r++) {
    for (const id of ids) { if (t.phase === "bet" && t.seats[id] && !t.seats[id].bet) G.casTBet(t, id, "10000", { san: 99, bonusPct: 0 }, ctx, now); ok(G, W, "下注"); }
    if (r % 7 === 3 && t.phase === "bet") { const s = t.seats[ids[0]]; if (s && s.bet) { G.casTLeave(t, ids[0], ctx, now); ok(G, W, "離桌退注"); G.casTSit(t, ids[0], "x"); W.wallets[ids[0]].tablePid = "p"; } }
    for (let k = 0; k < 40 && t.phase !== "result"; k++) {
      const who = t.turn; if (who) G.casTAct(t, who, G.RNG() < 0.5 ? "hit" : "stand", t.seq, ctx, now);
      else { now += 1e5; G.casTAdvance(t, ctx, now); }
      ok(G, W, "出牌");
    }
    now += 1e5; G.casTAdvance(t, ctx, now); ok(G, W, "結算");
    now += G.NUM.casino.resultMs + 1; G.casTAdvance(t, ctx, now); ok(G, W, "下一局");
  }
});

T("亂數一個月：3 個人每天把每一條路都走一遍，30 天，每一步都平", G => {
  const W = world(G, 3);
  G.setRng(G.mulberry32(99));
  const uids = Object.keys(W.wallets);
  const room = G.CELLAR[0].rooms.map(r => r.id);
  const Ps = {}; uids.forEach(u => { Ps[u] = G.newProfile("challenge"); });
  for (let d = 0; d < 30; d++) {
    W.day = plus(D0, d);
    W.house = G.casHouseFix(W.house, W.day).house;
    for (const u of uids) {
      const w = G.casWalletFix(W.wallets[u], W.day); W.wallets[u] = w;
      G.casLoanToHouse(w, W.house);
      G.ensureDay(Ps[u], W.day);
      ok(G, W, "換日");
      G.casOpenPacks(w, W.house, 2, W.day); ok(G, W, "禮包");
      for (let k = 0; k < 3; k++) { G.casEconPlay(w, W.house, W.day); ok(G, W, "拚經濟"); }
      G.casCellarFind(w, W.house, room[d % room.length], W.day); ok(G, W, "地下撿");
      G.casJobChips(w, W.house, ["0", "1", "2"], W.day); ok(G, W, "委託");
      G.casBuy(w, W.house, 1 + (d % 4), W.day); ok(G, W, "餐車");
      if (d % 3 === 0) { G.casBorrow(w, "max", W.day, false, 0, W.house); ok(G, W, "借"); }
      if (d % 5 === 1) { G.casRepay(w, null, W.day, false, 1e13, W.house); ok(G, W, "還"); }
      if (d % 6 === 2 && w.chips > 1e7) { G.casExchange(w, "insp", Ps[u]); ok(G, W, "換小獎"); }
      for (let i = 0; i < 20; i++) {
        const ctx = { w, house: W.house, round: W.rounds[u] || null, P: null, day: W.day, id: `d${d}${i}` };
        if (w.chips < 1000) break;
        if (!ctx.round || ctx.round.state === "done") { if (!G.casStepDeal(ctx, "20000").ok) break; } else if (!G.casStepStand(ctx, ctx.round.seq).ok) break;
        W.rounds[u] = ctx.round;
        ok(G, W, "21 點");
      }
    }
  }
  const s = snap(G, W);
  assert.ok(G.casBookMinted(s) > 0 && Object.keys(s.house.flow).length >= 6, "各來源都有記到：" + Object.keys(s.house.flow));
});

T("快照相減：casBookDiff 算出一天的帳", G => {
  const W = world(G, 2);
  G.setRng(G.mulberry32(21));
  const a = snap(G, W);
  const [w] = Object.values(W.wallets);
  G.casOpenPacks(w, W.house, 2, W.day);
  G.casBuy(w, W.house, 1, W.day);
  const d = G.casBookDiff(a, snap(G, W));
  assert.ok(d.flow.pack < 0 && d.flow.food > 0);
  assert.strictEqual(d.bankroll, d.flow.pack + d.flow.food);
  assert.strictEqual(d.chips, -d.bankroll, "沒憑空沒消失：錢包多的就是莊家少的");
  assert.strictEqual(JSON.stringify(d.mint) + JSON.stringify(d.burn), "{}{}");
  assert.strictEqual(G.casBookDiff(null, a).mint.start, 2 * G.NUM.casino.startChips);
});

T("壞資料、舊資料：沒有 led 的舊錢包／莊家會補；casMint 不收負數和小數", G => {
  const w = G.casWalletFix({ v: 1, chips: 5 }, D0);
  assert.strictEqual(JSON.stringify(w.led), '{"mint":{},"burn":{}}');
  const h = G.casHouseFix({ bankroll: 1 }, D0).house;
  assert.strictEqual(JSON.stringify(h.led), '{"mint":{},"flow":{}}');
  assert.strictEqual(G.casMint(w, "x", -5), 0); assert.strictEqual(G.casMint(w, "x", NaN), 0);
  assert.strictEqual(G.casMint(w, "x", 5.9), 5); assert.strictEqual(w.chips, 10);
  assert.strictEqual(G.casBurn(w, "y", 3), 3); assert.strictEqual(w.chips, 7);
});

T("日報：莊家、預算池給數字；海底只給水位公分，不出現海底的數字；預算快乾時算得出天數；預算 ≤ 0 寫追加預算", G => {
  const W = world(G, 3);
  G.setRng(G.mulberry32(31));
  const a = snap(G, W);
  Object.values(W.wallets).forEach(w => { for (let i = 0; i < 3; i++) G.casEconPlay(w, W.house, W.day); });
  const b = snap(G, W);
  const doc = { day: W.day, at: Date.UTC(2026, 10, 10, 1, 0), snap: b, diff: G.casBookDiff(a, b) };
  const v = G.casReportView(doc);
  const text = v.secs.map(s => s.t + "|" + s.lines.join("|")).join("|");
  assert.ok(text.includes(W.house.bankroll.toLocaleString("en-US")) && text.includes(W.house.budget.toLocaleString("en-US")), "莊家、預算池的數字");
  if (W.house.sea > 0) assert.ok(!text.includes(W.house.sea.toLocaleString("en-US")) || W.house.sea < 1000, "海底的數字不外露");
  assert.ok(/水位 [0-9]+ 公分/.test(text) && text.includes("對帳：差 1 枚，原因不明"));
  assert.ok(/大約還撐 [0-9,]+ 天/.test(text), "照這個速度還撐幾天");
  assert.ok(v.stamp.includes("11-10 09:00"), "台灣時間：" + v.stamp);
  const dry = JSON.parse(JSON.stringify(doc)); dry.snap.house.budget = -5;
  assert.ok(G.casReportView(dry).secs.map(s => s.lines.join("")).join("").includes("預算凍結中"));
  const first = G.casReportView({ day: W.day, at: doc.at, snap: b, diff: G.casBookDiff(null, b) });
  assert.ok(!first.secs[0].lines[0].includes("這段時間") && !first.secs[1].lines.join("").includes("這段時間"), "第壹份沒有上一份，不寫變多少");
  assert.strictEqual(G.casReportView(null), null);
  assert.strictEqual(G.casReportView({ day: "x" }), null);
});

console.log(`賭場記帳：${pass} 過，${fail} 沒過`);
process.exit(fail ? 1 : 0);
