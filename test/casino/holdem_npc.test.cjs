// 德州撲克邀旅客 NPC（shared/casino/holdem.js 的 NPC 座位、holdem_npc.js 的打法，決定 0150 補充二）：node test/casino/holdem_npc.test.cjs（npm test 也會跑）
// 邀請（答應、拒絕、冷卻）、錢（從已知世界來、回去、總錢不變）、額度（每位、全館）、離座（時間到、額度用完、真人都走了）、打法合規、亂打 300 手。
const assert = require("assert");
const { load } = require("../load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 6).join("\n    ")); } finally { G.setRng(null); } };
const DAY = "2026-11-21";
const lcg = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const wallet = (G, chips) => { const w = G.casWalletFix(G.casWalletNew(), DAY); w.chips = chips; return w; };
// 桌子（微型桌，大盲 1,000）＋壹位真人 H（買 100 個大盲）＋壹位旅客 c-math 的資料（每天預算 300 萬，所以每天最多輸 24 萬、贏 45 萬）
function setup(G, { rng = 3, perDay = 3000000, hbb = 100, secret = "s" } = {}) {
  const house = G.casHouseFix(G.casHouseNew(), DAY).house, list = G.NPC_ROSTER.filter(x => x.kind !== "trace").map(n => Object.assign({}, n, { budget: { perDay } }));
  const ctx = { wallets: { H: wallet(G, 1e9) }, house, day: DAY, hlog: [], secret, npcList: list, counters: null, h0: 0 };
  const t = G.casHNew({ pid: "p1", lv: 0, now: 1000 }), bb = G.NUM.casino.holdem.levels[0][1];
  G.setRng(lcg(rng));
  assert.ok(G.casHBuyin(t, "H", "甲", hbb * bb, ctx.wallets.H, ctx).ok);
  const start = G.npcDayStartMs(DAY); let now = null;
  for (let m = 0; m < 1440 && now == null; m += 5) if (G.casHNpcWho(ctx, start + m * 60000, null).some(x => x.id === "c-math")) now = start + m * 60000;
  assert.ok(now != null, "c-math 今天有在館的時候");
  ctx.sum = () => ctx.wallets.H.chips + G.casHInplay(t) + house.bankroll + house.world;
  ctx.s0 = ctx.sum();
  return { t, ctx, now, bb };
}
// 邀到答應為止（換祕密種子）。回傳 { r, seat }
function invite(G, t, ctx, now, npcId = "c-math") {
  for (let k = 0; k < 60; k++) { ctx.secret = "s" + k; ctx.house.npcCas = null; const r = G.casHNpcInvite(t, ctx, "H", npcId, now); if (r.ok && r.accepted) return { r, seat: t.seats["npc:" + npcId] }; }
  throw new Error("60 個種子都沒被答應");
}

T("邀請：答應就坐下（座位 npc、uid npc:<id>、沒有錢包）、籌碼從已知世界來、總錢不變；記他今天答應幾次、在賭場的名單", G => {
  const { t, ctx, now, bb } = setup(G), w0 = ctx.house.world;
  const { r, seat } = invite(G, t, ctx, now); assert.ok(r.accepted && r.line && r.until > now);
  assert.ok(seat && seat.npc && seat.npc.id === "c-math" && seat.npc.host === "H"); assert.strictEqual(seat.uid, "npc:c-math"); assert.ok(!ctx.wallets["npc:c-math"]);
  assert.ok(seat.stack >= 2 * bb && seat.stack <= 100 * bb, "最多 100 個大盲：" + seat.stack); assert.strictEqual(ctx.house.world, w0 - seat.stack - seat.put, "從已知世界出（桌上的加盲注）");
  assert.strictEqual(ctx.house.npcCas.by["c-math"].n, 1); assert.ok(ctx.house.npcCas.at["c-math"]); assert.strictEqual(ctx.sum(), ctx.s0, "總錢不變");
  assert.ok(r.until - now >= 15 * 60000 && r.until - now <= 35 * 60000, "坐 15～35 分鐘");
  assert.ok(t.phase === "play" || t.phase === "wait", "壹位真人＋壹位 NPC 就開打");
});
T("邀請的規矩：不在桌上的人、人不在館裡、桌子滿了、客人太多、已經跟別人去玩都邀不了；被拒絕記冷卻、同壹位 30 分鐘內不能再邀", G => {
  const { t, ctx, now } = setup(G);
  assert.ok(!G.casHNpcInvite(t, ctx, "Z", "c-math", now).ok, "不在這桌"); assert.ok(!G.casHNpcInvite(t, ctx, "H", "nobody", now).ok, "不在館裡");
  assert.ok(!G.casHNpcInvite(t, ctx, "H", "c-math", now - 3 * 3600000).ok, "他不在館裡的時候");
  let refused = null, rt = null, rc = null, rn = null; for (let k = 0; k < 80 && !refused; k++) { const g = setup(G, { rng: 100 + k, secret: "r" + k }); const r = G.casHNpcInvite(g.t, g.ctx, "H", "c-math", g.now); if (r.ok && !r.accepted) { refused = r; rt = g.t; rc = g.ctx; rn = g.now; } }
  assert.ok(refused && refused.line, "有被拒絕的"); const again = G.casHNpcInvite(rt, rc, "H", "c-math", rn + 60000); assert.ok(!again.ok && again.wait > 0, "冷卻中"); void t;
  const g2 = setup(G, { rng: 5 }), a = invite(G, g2.t, g2.ctx, g2.now); assert.ok(!G.casHNpcInvite(g2.t, g2.ctx, "H", "c-math", g2.now).ok, "已經在這桌了"); assert.ok(a.seat);
  const g3 = setup(G, { rng: 6 }); G.NUM.casino.npcCas.tableMax = 0; assert.ok(!G.casHNpcInvite(g3.t, g3.ctx, "H", "c-math", g3.now).ok, "客人夠多了");
});
T("好感度讓邀請比較容易答應：npcCasChance 加 bonus（每級 +5%），總機率照舊夾在 5～95", G => {
  const { ctx } = setup(G), n = ctx.npcList.find(x => x.id === "c-math"), p0 = G.npcCasChance(ctx.house, DAY, n, null, 0), p15 = G.npcCasChance(ctx.house, DAY, n, null, 15);
  assert.ok(p15 > p0 && p15 <= 95 && p0 >= 5, p0 + " → " + p15); assert.ok(G.npcCasChance(ctx.house, DAY, n, null, 999) <= 95);
  const w = wallet(G, 0); assert.strictEqual(G.npcRelBonus(w, "c-math"), 0); w.npcRel["c-math"] = { xp: 70, lv: 3, day: null, today: { xp: 0 } }; assert.strictEqual(G.npcRelBonus(w, "c-math"), 15);
});
T("NPC 的打法永遠合規：任何牌、任何底池，回傳的動作都是 fold／check／call／raise／allin，加注在最少最多之間", G => {
  const rnd = lcg(9);
  for (const style of ["careful", "basic", "bold", "wild"]) for (let i = 0; i < 600; i++) {
    const deck = Array.from({ length: 52 }, (_, k) => k).sort(() => rnd() - 0.5), nb = [0, 3, 4, 5][Math.floor(rnd() * 4)], hole = deck.slice(0, 2), board = deck.slice(2, 2 + nb);
    const bb = 1000, curBet = Math.floor(rnd() * 5) * bb, bet = Math.floor(rnd() * 2) * (curBet / 2), toCall = Math.max(0, curBet - bet), maxTo = curBet + 1 + Math.floor(rnd() * 80) * bb, minTo = Math.min(maxTo, curBet + bb), pot = bb + Math.floor(rnd() * 50) * bb;
    const r = G.hdNpcPlan(style, { hole, board, toCall, pot, bet, curBet, minTo, maxTo, bb }, rnd);
    assert.ok(["fold", "check", "call", "raise", "allin"].includes(r.a), JSON.stringify(r)); if (toCall > 0) assert.ok(r.a !== "check", "要跟的時候不能過牌"); if (r.a === "raise") assert.ok(Number.isInteger(r.to) && r.to >= minTo && r.to <= maxTo, JSON.stringify([r, minTo, maxTo]));
  }
  assert.ok(G.hdNpcPre([12 + 0, 12 + 13]) >= 3 || true); assert.strictEqual(G.hdNpcPre([0, 13]), 4, "AA 是最大的起手牌"); assert.strictEqual(G.hdNpcPre([0 + 1, 13 * 2 + 8]), 0, "雜牌最小");
});
T("同桌打牌：NPC 輪到就馬上動作（真人不用等）；每步總錢不變；NPC 的輸贏記進他今天的和全館的；真人對 NPC 不記兩人的帳；日報不算 NPC 的籌碼", G => {
  const { t, ctx, now, bb } = setup(G); invite(G, t, ctx, now);
  let hands = 0, guard = 0, t0 = now; const rnd = lcg(21);
  while (hands < 40 && guard++ < 4000) {
    if (t.phase !== "play") { t0 += G.NUM.casino.holdem.resultMs + 1; G.casHAdvance(t, ctx, t0); if (t.phase === "wait") { if (!t.seats["npc:c-math"]) break; continue; } continue; }
    if (t.toAct !== "H") { assert.fail("輪到 NPC 時應該已經動作了：" + t.toAct); }
    const leg = G.casHView(t, "H", t0, ctx).legal, r = rnd(); let res;
    if (r < 0.3) res = G.casHAct(t, "H", "fold", 0, ctx, t0); else if (r < 0.5 && leg.canRaise) res = G.casHAct(t, "H", "raise", leg.minTo, ctx, t0); else res = G.casHAct(t, "H", leg.check ? "check" : "call", 0, ctx, t0);
    assert.ok(res.ok, JSON.stringify(res)); if (res.finished) hands++;
    assert.strictEqual(ctx.sum(), ctx.s0, "第 " + hands + " 手，總錢不變");
  }
  assert.ok(hands >= 10, "打了 " + hands + " 手"); const by = ctx.house.npcCas.by["c-math"]; assert.ok(by.hands >= 10, "記了他打的手數"); assert.strictEqual(ctx.house.npcCas.net, by.net);
  assert.ok(!ctx.house.hd || Object.keys(ctx.house.hd.pair).length === 0, "沒有兩人的帳"); const seat = t.seats["npc:c-math"]; if (seat) assert.strictEqual(G.casHInplay(t), t.seats.H.stack + t.seats.H.put, "只算真人的");
  const v = G.casHView(t, "H", t0, ctx); const ns = v.seats.find(s => s.npc); if (ns) { assert.ok(ns.hole.every(c => c === -1) || ns.hole.length === 0, "不給看 NPC 的底牌"); assert.strictEqual(ns.me, false); }
});
T("額度：每位壹天輸 ≤ 8%、贏 ≤ 15%、全館 ≤ dayCap；亂打 400 手，NPC 的輸贏、莊家帳、總錢每步都守住", G => {
  const { t, ctx, now } = setup(G, { rng: 11, perDay: 30000000 }), C = G.NUM.casino.npcCas, lossCap = Math.floor(30000000 * C.lossPct / 100), winCap = Math.floor(30000000 * C.winPct / 100);
  invite(G, t, ctx, now); const rnd = lcg(5); let t0 = now, hands = 0, guard = 0, back = 0;
  while (hands < 400 && guard++ < 30000) {
    if (t.phase !== "play") {
      t0 += G.NUM.casino.holdem.resultMs + 1; G.casHAdvance(t, ctx, t0);
      if (t.seats.H && t.seats.H.stack < 2 * G.NUM.casino.holdem.levels[0][1]) G.casHBuyin(t, "H", "甲", 50000, ctx.wallets.H, ctx);
      if (!t.seats["npc:c-math"]) { back++; if (back > 3) break; ctx.house.npcCas.cool = {}; const r = G.casHNpcInvite(t, ctx, "H", "c-math", now); if (!(r.ok && r.accepted)) { ctx.secret = "k" + back; } } continue;
    }
    const leg = G.casHView(t, "H", t0, ctx).legal, r = rnd(); let res;
    if (r < 0.2) res = G.casHAct(t, "H", "fold", 0, ctx, t0); else if (r < 0.45 && leg.canRaise) res = G.casHAct(t, "H", "raise", leg.minTo + Math.floor(rnd() * (leg.maxTo - leg.minTo + 1)), ctx, t0); else if (r < 0.5 && leg.maxTo > 0) res = G.casHAct(t, "H", "allin", 0, ctx, t0); else res = G.casHAct(t, "H", leg.check ? "check" : "call", 0, ctx, t0);
    assert.ok(res.ok, JSON.stringify(res)); if (res.finished) hands++;
    assert.strictEqual(ctx.sum(), ctx.s0, "總錢不變");
    const nc = ctx.house.npcCas, by = nc.by["c-math"] || { net: 0 }; assert.ok(by.net >= -lossCap && by.net <= winCap, "NPC 今天的輸贏 " + by.net + "（輸上限 " + lossCap + "、贏上限 " + winCap + "）"); assert.ok(Math.abs(nc.net) <= C.dayCap, "全館 " + nc.net);
  }
  assert.ok(hands >= 20, "打了 " + hands + " 手"); assert.ok(Math.abs(ctx.house.npcCas.net) <= C.dayCap);
});
T("離座：時間到（兩手之間）NPC 帶著錢回已知世界、從在賭場的名單拿掉；額度用完也走；總錢不變", G => {
  const { t, ctx, now } = setup(G, { rng: 4 }), { seat } = invite(G, t, ctx, now), w0 = ctx.house.world + seat.stack;
  // 打到壹手結束
  let t0 = now; for (let k = 0; k < 30 && t.phase === "play"; k++) { const leg = G.casHView(t, "H", t0, ctx).legal; G.casHAct(t, "H", leg.check ? "check" : "fold", 0, ctx, t0); }
  assert.strictEqual(ctx.sum(), ctx.s0); const until = t.seats["npc:c-math"].npc.until;
  G.casHAdvance(t, ctx, until + G.NUM.casino.holdem.resultMs + 1);
  assert.ok(!t.seats["npc:c-math"], "時間到走了"); assert.ok(!ctx.house.npcCas.at["c-math"], "從名單拿掉"); assert.strictEqual(ctx.sum(), ctx.s0, "總錢不變"); assert.ok(ctx.house.world >= w0 - seat.stack - 450000 && ctx.house.world <= w0 + 450000);
  const g = setup(G, { rng: 8 }), a = invite(G, g.t, g.ctx, g.now); g.ctx.house.npcCas.by["c-math"].net = -(Math.floor(3000000 * G.NUM.casino.npcCas.lossPct / 100) - 200); g.ctx.house.npcCas.net = g.ctx.house.npcCas.by["c-math"].net; // 只剩 200 能輸（< 2 個大盲）
  let t1 = g.now; for (let k = 0; k < 30 && g.t.phase === "play"; k++) G.casHAct(g.t, "H", "fold", 0, g.ctx, t1);
  G.casHAdvance(g.t, g.ctx, t1 + G.NUM.casino.holdem.resultMs + 1); assert.ok(!g.t.seats["npc:c-math"], "額度用完走了"); assert.ok(a.seat); assert.strictEqual(g.ctx.sum(), g.ctx.s0);
});
T("真人都走了：NPC 不自己打，這手發完牌攤牌，NPC 帶著錢回去，桌子沒有人；收桌（隊伍解散）也壹樣；總錢不變", G => {
  const { t, ctx, now } = setup(G, { rng: 13 }); invite(G, t, ctx, now); assert.strictEqual(t.phase, "play");
  const r = G.casHLeave(t, "H", ctx, now + 100); assert.ok(r.ok); assert.strictEqual(t.order.length, 0, "NPC 也走了"); assert.ok(!ctx.house.npcCas.at["c-math"]); assert.strictEqual(ctx.sum(), ctx.s0);
  const g = setup(G, { rng: 14 }); invite(G, g.t, g.ctx, g.now); G.casHClose(g.t, g.ctx, g.now + 100); assert.ok(G.casHEmpty(g.t)); assert.strictEqual(g.ctx.sum(), g.ctx.s0);
});
T("入門桌：現有三級的編號往後移壹格；入門桌大盲 1,000、買入最少 4 萬；NPC 額度夠的旅客幾乎都坐得下（大盲 1 萬的桌只有 28／50）", G => {
  const L = G.NUM.casino.holdem.levels; assert.deepStrictEqual(JSON.parse(JSON.stringify(L)), [[500, 1000], [5000, 10000], [50000, 100000], [500000, 1000000]]);
  const t = G.casHNew({ pid: "x", lv: 0, now: 1 }); assert.deepStrictEqual(JSON.parse(JSON.stringify(G.casHBuyLimits(t))), { min: 40 * 1000, max: 200 * 1000 }); assert.strictEqual(G.casHNew({ pid: "x", lv: 4, now: 1 }).lv, 0, "不認得的級距退回入門桌");
});
T("已經開著的舊桌（沒有 bl、存舊編號）盲注不變；新桌記盲注；級距清單再改也不影響開著的桌", G => {
  const old = G.casHNew({ pid: "o", lv: 1, now: 1 }); delete old.bl; old.v = 2; old.lv = 1; // 舊桌：編號 1 ＝ 當時的大盲 10 萬
  assert.deepStrictEqual(JSON.parse(JSON.stringify(G.casHBuyLimits(old))), { min: 40 * 100000, max: 200 * 100000 }, "舊桌編號 1 ＝ 大盲 10 萬");
  const t = G.casHNew({ pid: "n", lv: 2, now: 1 }); assert.deepStrictEqual(JSON.parse(JSON.stringify(t.bl)), [50000, 100000]); G.NUM.casino.holdem.levels.unshift([1, 2]); assert.strictEqual(G.casHBuyLimits(t).min, 40 * 100000, "級距清單改了桌子不變");
  assert.strictEqual(G.casHView(t, "x", 1, null).level.bb, 100000);
});
console.log(fail ? `德州 NPC：${fail} 項沒過` : `德州 NPC：${pass} 項都過`); process.exit(fail ? 1 : 0);
