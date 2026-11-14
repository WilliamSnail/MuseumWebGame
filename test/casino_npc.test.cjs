// 邀請在場的 NPC 壹起去賭場（11-14，決定 0080）：node test/casino_npc.test.cjs（npm test 也會跑）
// 誰邀得動、答應或拒絕（種子祕密、冷卻）、NPC 坐進桌子（算座位、壹位館友壹位 NPC、壹桌最多 tableMax 位）、館友先下注 NPC 才下注、
// NPC 馬上打完、注從外面世界出、賠付回外面世界（守恆）、壹位 NPC 壹天輸贏上限、全館上限、館友走了 NPC 也走、桌子收了退注、台詞和說話次數、presence 把他算到賭場。
const assert = require("assert"), fs = require("fs"), path = require("path");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 5).join("\n    ")); } finally { G.setRng(null); } };
const DAY = "2026-11-16", SEC = "祕密";
const LIST = fs.readdirSync(path.join(__dirname, "..", "content", "npc")).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "content", "npc", f), "utf8")));
const base = (G) => G.npcDayStartMs(DAY);
// 找壹位現在在館裡（行程窗口裡）的有預算的 NPC 和那一刻
const findAt = (G, house) => {
  const v = G.npcVisitsToday(DAY, SEC, LIST, null).filter(x => LIST.find(n => n.id === x.id && n.budget && n.budget.perDay > 100000));
  for (const x of v) { const at = base(G) + (x.start + 5) * 60000, w = G.casTNpcWho({ house, day: DAY, secret: SEC, npcList: LIST, counters: null }, at); if (w.some(y => y.id === x.id)) return { id: x.id, at }; }
  throw new Error("找不到在館裡的 NPC");
};
const mk = (G, seed = 7, n = 1) => {
  G.setRng(G.mulberry32(seed));
  const house = G.casHouseFix(G.casHouseNew(), DAY).house, t = G.casTNew({ pid: "p1", now: 1000 }), wallets = {};
  ["a", "b", "c"].slice(0, n).forEach(id => { G.casTSit(t, id, "館友" + id); wallets[id] = G.casWalletFix(G.casWalletNew(), DAY); wallets[id].tablePid = "p1"; });
  const ctx = { wallets, house, day: DAY, secret: SEC, npcList: LIST, counters: null, says: [], now: 0 };
  return { t, ctx, house, wallets };
};
const total = (G, m) => { const sn = G.casBookSnap(Object.values(m.wallets), m.house, Object.values(m.t.seats).reduce((a, s) => a + (!s.npc && s.bet > 0 && s.out == null ? s.bet : 0), 0), DAY); return G.casBookTotal(sn) - G.casBookMinted(sn) + G.casBookBurned(sn); };
// 邀到答應為止（換 uid／換時間格重擲；測試用，不管冷卻）
const inviteOk = (G, m, uid, id, at) => {
  for (let k = 0; k < 40; k++) { G.npcCasFix(m.house, DAY); m.house.npcCas.cool = {}; if (m.house.npcCas.by[id]) m.house.npcCas.by[id].n = 0; const r = G.casTNpcInvite(m.t, m.ctx, uid, id, at); if (r.ok && r.accepted) return r; if (!r.ok) throw new Error(r.reason); }
  throw new Error("一直被拒絕");
};
const C = G => G.NUM.casino.npcCas;

T("設定：機率、額度、打法的注都在 NUM.casino.npcCas，全館上限 > 0", G => { const c = C(G); assert.ok(c.on && c.perNpcDay > 0 && c.tableMax > 0 && c.dayCap > 0 && c.lossPct > 0 && c.winPct > 0 && c.betMax > 0); assert.ok(["careful", "basic", "bold", "wild"].every(k => c.bet[k] > 0)); });
T("誰邀得動：在行程窗口裡的、不是劇情角色；不在館裡的不行；邀得動的名單只有 id 和名字", G => {
  const m = mk(G), f = findAt(G, m.house), w = G.casTNpcWho(m.ctx, f.at);
  assert.ok(w.length >= 1 && w.every(x => Object.keys(x).sort().join() === "id,name" && !x.id.startsWith("t-")));
  assert.ok(!G.casTNpcWho(m.ctx, base(G) - 3600000).length, "營業前沒有人");
  const r = G.casTNpcInvite(m.t, m.ctx, "a", "t-guard", f.at); assert.ok(!r.ok);
  const r2 = G.casTNpcInvite(m.t, m.ctx, "a", "不存在", f.at); assert.ok(!r2.ok);
});
T("邀請：答應就坐進桌子（算座位、uid 是 n~id）、說 accept 的話、記在『在賭場』；沒下注前不下注", G => {
  const m = mk(G), f = findAt(G, m.house), r = inviteOk(G, m, "a", f.id, f.at);
  const s = m.t.seats["n~" + f.id]; assert.ok(s && s.npc && s.npc.host === "a" && s.bet === 0 && m.t.order.includes("n~" + f.id));
  assert.ok(r.line && m.ctx.says.some(x => x.npc && x.by === "n~" + f.id && x.text), JSON.stringify(m.ctx.says));
  assert.ok(G.npcCasAway(m.house, f.at).has(f.id)); assert.ok(m.house.npcCas.by[f.id].n === 1);
});
T("被拒絕：回他的拒絕台詞、30 分鐘內同壹位館友不能再邀、座位不佔、不扣錢", G => {
  const m = mk(G); const f = findAt(G, m.house); let rej = null, k = 0;
  for (; k < 200 && !rej; k++) { G.npcCasFix(m.house, DAY); m.house.npcCas.cool = {}; if (m.house.npcCas.by[f.id]) m.house.npcCas.by[f.id].n = 0; const r = G.casTNpcInvite(m.t, m.ctx, "a", f.id, f.at); if (r.ok && !r.accepted) rej = { r, t0: f.at }; else if (r.ok && r.accepted) { delete m.t.seats["n~" + f.id]; m.t.order = m.t.order.filter(x => x !== "n~" + f.id); G.npcCasFree(m.house, f.id); } }
  assert.ok(rej, "擲了很多次都沒被拒絕"); assert.ok(rej.r.line && !m.t.seats["n~" + f.id]);
  const again = G.casTNpcInvite(m.t, m.ctx, "a", f.id, rej.t0 + 60000); assert.ok(!again.ok && again.reason.includes("剛拒絕"), JSON.stringify(again));
  assert.ok(G.npcCasCoolLeft(m.house, DAY, "a", f.id, rej.t0 + 60000) > 0 && G.npcCasCoolLeft(m.house, DAY, "a", f.id, rej.t0 + C(G).coolMs + 1) === 0);
  const t1 = rej.t0 + 60000, all = G.casTNpcWho(m.ctx, t1); // 11-14：名單不再列「剛拒絕過我」的人（按了只會得到「N 分鐘後再邀」）
  if (all.some(x => x.id === f.id)) { assert.ok(!G.casTNpcWho(m.ctx, t1, "a").some(x => x.id === f.id), "被拒絕的不在我的名單"); assert.ok(G.casTNpcWho(m.ctx, t1, "b").some(x => x.id === f.id), "別的館友還看得到他"); }
});
T("壹位館友壹位客人、壹桌最多 tableMax 位客人、坐滿了不能再邀、同壹位 NPC 不能同時跟兩桌", G => {
  const m = mk(G, 7, 3); const f = findAt(G, m.house); inviteOk(G, m, "a", f.id, f.at);
  const w = G.casTNpcWho(m.ctx, f.at).filter(x => x.id !== f.id); assert.ok(!w.some(x => x.id === f.id), "他已經在賭場，不在邀得動的名單");
  assert.ok(!G.casTNpcInvite(m.t, m.ctx, "b", f.id, f.at).ok, "同壹位不能同時跟兩桌");
  assert.ok(/已經帶了/.test(G.casTNpcInvite(m.t, m.ctx, "a", w[0] ? w[0].id : "x", f.at).reason || ""), "壹位館友壹位客人");
  const m2 = mk(G, 7, 3); G.casTSit(m2.t, "d", "館友d"); // 4 人坐滿
  assert.ok(/坐滿/.test(G.casTNpcInvite(m2.t, m2.ctx, "a", f.id, f.at).reason || ""));
});
T("館友先下注 NPC 才下注：注從外面世界出（世界池減、莊家增），不到最小注或沒額度不下；兩邊都下好馬上發牌；NPC 馬上打完、不等計時", G => {
  const m = mk(G), f = findAt(G, m.house); inviteOk(G, m, "a", f.id, f.at); const s = m.t.seats["n~" + f.id], w0 = m.house.world, b0 = m.house.bankroll;
  assert.ok(G.casTNpcWho && m.t.phase === "bet" && s.bet === 0);
  const t0 = total(G, m);
  const r = G.casTBet(m.t, "a", "1000", { san: 99, bonusPct: 0 }, m.ctx, f.at); assert.ok(r.ok);
  assert.ok(s.bet >= G.NUM.casino.minBet || !m.t.seats["n~" + f.id], "NPC 下了注（或額度不夠走了）");
  if (m.t.seats["n~" + f.id]) { assert.strictEqual(w0 - m.house.world, s.bet); assert.ok(m.house.bankroll - b0 === s.bet); assert.strictEqual(m.t.phase, "play"); assert.strictEqual(m.t.turn, "a"); assert.ok(G.casTAct(m.t, "a", "stand", m.t.seq, m.ctx, f.at).ok); assert.strictEqual(m.t.phase, "result"); assert.ok(s.st !== "play" && s.out, "館友停牌後 NPC 馬上打完、結算"); }
  assert.strictEqual(total(G, m), t0, "守恆（NPC 的注不算打牌中，已經在莊家帳）");
});
T("結算守恆：NPC 輸 ＝ 注留在莊家、贏 ＝ 賠付回外面世界；全館記下他的輸贏；NPC 沒有錢包、沒有成就和獎勵", G => {
  const m = mk(G), f = findAt(G, m.house); inviteOk(G, m, "a", f.id, f.at);
  const t0 = total(G, m); let rounds = 0, seen = new Set();
  for (let i = 0; i < 12 && m.t.seats["n~" + f.id]; i++) {
    const now = f.at + i * 100000;
    if (m.t.phase === "bet") assert.ok(G.casTBet(m.t, "a", "1000", { san: 99, bonusPct: 0 }, m.ctx, now).ok);
    if (m.t.phase === "play" && m.t.turn === "a") G.casTAct(m.t, "a", "stand", m.t.seq, m.ctx, now);
    if (m.t.phase === "result") { rounds++; const s = m.t.seats["n~" + f.id]; if (s && s.out) seen.add(s.out.kind); assert.ok(!s || (s.ach === undefined || s.ach === null) && !s.ticket); G.casTAdvance(m.t, m.ctx, m.t.deadline + 1); }
    assert.strictEqual(total(G, m), t0, "每壹步守恆 " + i);
  }
  assert.ok(rounds >= 1); const by = m.house.npcCas.by[f.id]; assert.ok(by.hands >= 1 && m.house.npcCas.net === by.net);
  assert.ok(!m.wallets["n~" + f.id], "NPC 沒有錢包");
});
T("壹位 NPC 壹天最多輸 lossPct、贏 winPct（perDay）：輸夠了或贏夠了說離開台詞走人、離開『在賭場』名單；怎麼打都不超過", G => {
  for (let seed = 1; seed <= 12; seed++) {
    const m = mk(G, seed), f = findAt(G, m.house); inviteOk(G, m, "a", f.id, f.at); const n = LIST.find(x => x.id === f.id), cap = Math.floor(n.budget.perDay * C(G).lossPct / 100), win = Math.floor(n.budget.perDay * C(G).winPct / 100);
    G.setRng(G.mulberry32(seed * 11));
    for (let i = 0; i < 80 && m.t.seats["n~" + f.id]; i++) {
      const now = f.at + i * 1000;
      if (m.t.phase === "bet") { assert.ok(G.casTBet(m.t, "a", "100", { san: 99, bonusPct: 0 }, m.ctx, now).ok); }
      if (m.t.phase === "play" && m.t.turn === "a") G.casTAct(m.t, "a", "stand", m.t.seq, m.ctx, now);
      if (m.t.phase === "result") G.casTAdvance(m.t, m.ctx, m.t.deadline + 1);
      const by = m.house.npcCas.by[f.id]; assert.ok(by.net >= -cap && by.net <= win + Math.floor(C(G).betMax * 1.5), `輸贏 ${by.net} 超過 −${cap} ～ +${win}`);
    }
  }
});
T("全館上限 dayCap：淨輸贏到了今天不再邀得動、桌上的也走", G => {
  const m = mk(G), f = findAt(G, m.house); inviteOk(G, m, "a", f.id, f.at); m.house.npcCas.net = -C(G).dayCap;
  assert.ok(!G.casTNpcWho(m.ctx, f.at).length, "全館到了上限：沒有人邀得動");
  assert.ok(G.casTBet(m.t, "a", "1000", { san: 99, bonusPct: 0 }, m.ctx, f.at).ok); assert.ok(!m.t.seats["n~" + f.id], "NPC 走了"); assert.ok(!G.npcCasAway(m.house, f.at).has(f.id));
  assert.ok(m.ctx.says.some(x => x.npc && /./.test(x.text)));
});
T("莊家不健康（吃緊、破產）或外面世界吃緊：邀不動、不下注；莊家健康才玩", G => {
  const m = mk(G), f = findAt(G, m.house); m.house.bankroll = G.NUM.casino.health.low - 1;
  assert.ok(!G.casTNpcWho(m.ctx, f.at).length, "莊家吃緊");
  m.house.bankroll = 10 ** 9; m.house.world = 0; assert.ok(!G.casTNpcWho(m.ctx, f.at).length, "外面世界吃緊");
});
T("館友離桌：下注前離桌 ＝ NPC 的注也退回外面世界、NPC 走；打牌中離桌 ＝ 這手打完、下局 NPC 走；錢守恆", G => {
  const m = mk(G, 7, 2), f = findAt(G, m.house); inviteOk(G, m, "a", f.id, f.at); const t0 = total(G, m), w0 = m.house.world;
  assert.ok(G.casTBet(m.t, "a", "1000", { san: 99, bonusPct: 0 }, m.ctx, f.at).ok);
  if (m.t.phase === "bet") { // b 還沒下注，還在下注階段
    G.casTLeave(m.t, "a", m.ctx, f.at); assert.ok(!m.t.seats["n~" + f.id], "host 走了 NPC 也走"); assert.strictEqual(m.house.world, w0, "注退回外面世界"); assert.ok(!G.npcCasAway(m.house, f.at).has(f.id));
  }
  assert.strictEqual(total(G, m), t0);
  const m2 = mk(G, 9, 2), g = findAt(G, m2.house); inviteOk(G, m2, "a", g.id, g.at); G.casTBet(m2.t, "a", "1000", { san: 99, bonusPct: 0 }, m2.ctx, g.at); G.casTBet(m2.t, "b", "1000", { san: 99, bonusPct: 0 }, m2.ctx, g.at);
  assert.strictEqual(m2.t.phase, "play"); const t1 = total(G, m2); G.casTLeave(m2.t, "a", m2.ctx, g.at); G.casTAdvance(m2.t, m2.ctx, m2.t.deadline + 1);
  for (let i = 0; i < 6 && m2.t.phase !== "bet"; i++) G.casTAdvance(m2.t, m2.ctx, m2.t.deadline + 1);
  assert.ok(!m2.t.seats["n~" + g.id], "host 走了：下局 NPC 也走"); assert.strictEqual(total(G, m2), t1);
});
T("桌子收了：casTNpcDrop 把還沒結算的 NPC 注退回外面世界、NPC 全部離開名單，不說話", G => {
  const m = mk(G), f = findAt(G, m.house); inviteOk(G, m, "a", f.id, f.at); G.casTBet(m.t, "a", "1000", { san: 99, bonusPct: 0 }, m.ctx, f.at);
  const t0 = total(G, m); m.ctx.says.length = 0; G.casTNpcDrop(m.t, m.ctx); assert.ok(!Object.values(m.t.seats).some(s => s.npc)); assert.ok(!G.npcCasAway(m.house, f.at).has(f.id)); assert.strictEqual(m.ctx.says.length, 0);
  assert.strictEqual(total(G, m), t0 + 0 - 0, "守恆（退回後不再算打牌中）");
  G.casTNpcDrop(m.t, m.ctx); assert.strictEqual(total(G, m), t0, "11-14：孤兒桌（隊伍不在）再收壹次也不會多退（dropStale 會叫它）");
});
T("桌上只有 NPC 下了注時不開局（館友沒下注 NPC 不會自己打）", G => {
  const m = mk(G), f = findAt(G, m.house); inviteOk(G, m, "a", f.id, f.at); assert.ok(!G.casTAdvance(m.t, m.ctx, m.t.deadline + 1) || m.t.phase === "bet");
  assert.strictEqual(m.t.phase, "bet"); assert.ok(!Object.values(m.t.seats).some(s => s.bet > 0));
});
T("台詞：NPC 自己的 casino.lines 優先、沒有就用預設；每句 30 字內；同壹個種子同壹句；壹局最多 say.cap 句", G => {
  const own = { id: "x", casino: { lines: { win: ["自己的話"] } } };
  assert.strictEqual(G.npcCasLine(own, "win", "s"), "自己的話"); assert.ok(G.CAS_NPC_LINES.lose.includes(G.npcCasLine(own, "lose", "s")));
  assert.strictEqual(G.npcCasLine({}, "bj", "k"), G.npcCasLine({}, "bj", "k"));
  G.NPC_CAS_KINDS.forEach(k => { assert.ok(G.CAS_NPC_LINES[k].length >= 2 && G.CAS_NPC_LINES[k].every(s => s.length <= 30), k); });
  const m = mk(G), f = findAt(G, m.house); inviteOk(G, m, "a", f.id, f.at);
  for (let r = 0; r < 20 && m.t.seats["n~" + f.id]; r++) { m.ctx.says.length = 0; const now = f.at + r * 1000; if (m.t.phase === "bet") G.casTBet(m.t, "a", "100", { san: 99, bonusPct: 0 }, m.ctx, now); if (m.t.phase === "play" && m.t.turn === "a") G.casTAct(m.t, "a", "stand", m.t.seq, m.ctx, now); if (m.t.phase === "result") { assert.ok(m.ctx.says.filter(x => x.by === "n~" + f.id).length <= C(G).say.cap); G.casTAdvance(m.t, m.ctx, m.t.deadline + 1); } }
});
T("打法：careful 比 bold 早停牌；wild 會亂要；都不會一直要到爆（總是會停）；21 點、五張過關不再要", G => {
  const c = (...rs) => rs.map(r => r - 1);
  assert.ok(!G.npcCasHit("careful", c(10, 4), 4) && G.npcCasHit("bold", c(10, 4), 4), "14 點：保守停、大膽要");
  assert.ok(!G.npcCasHit("basic", c(10, 7), 10) && G.npcCasHit("basic", c(10, 6), 10) && !G.npcCasHit("basic", c(10, 6), 5), "basic：17 停；16 對 10 要、對 5 停");
  assert.ok(!G.npcCasHit("wild", c(10, 10, 1), 5) && !G.npcCasHit("bold", c(10, 1), 5) , "21、20 不要");
  G.setRng(G.mulberry32(3)); let h = 0; for (let i = 0; i < 300; i++) if (G.npcCasHit("wild", c(10, 5), 6)) h++; assert.ok(h > 20 && h < 150, "wild 偶爾亂要 " + h);
});
T("presence：被邀去賭場的 NPC 不算在展廳和館裡，另外列在 casino；他走了回來", G => {
  const m = mk(G), f = findAt(G, m.house), list = LIST, st = G.npcVisitsToday(DAY, SEC, list, null).find(x => x.id === f.id && x.start <= (f.at - base(G)) / 60000 && (f.at - base(G)) / 60000 < x.end);
  const p0 = G.npcPresence(DAY, f.at, SEC, list, null, new Set()), p1 = G.npcPresence(DAY, f.at, SEC, list, null, new Set([f.id]));
  assert.ok(p1.around === p0.around - 1 && p1.casino.n === 1 && p1.casino.names[0] === list.find(n => n.id === f.id).name && p0.casino.n === 0);
  assert.ok(st.place !== "hall" || p1.hall === p0.hall - 1);
});
T("同壹個種子同樣的答應結果（可重現）；換館友結果可以不同；擲骰用祕密種子（換祕密結果不同）", G => {
  const a = G.npcCasRoll(SEC, DAY, "a", "v-bai", "0|1"), a2 = G.npcCasRoll(SEC, DAY, "a", "v-bai", "0|1"); assert.strictEqual(a, a2);
  const xs = new Set(); for (let i = 0; i < 20; i++) xs.add(Math.floor(G.npcCasRoll("s" + i, DAY, "a", "v-bai", "0|1"))); assert.ok(xs.size > 5);
});
console.log(`賭場邀請 NPC：${pass} 過，${fail} 沒過`);
process.exit(fail ? 1 : 0);
