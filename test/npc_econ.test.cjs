// 館內 NPC 的經濟接線（11-14，docs/館內NPC規劃.md 步驟 3）：node test/npc_econ.test.cjs（npm test 也會跑）
// 行程（每位 NPC 每天抽去哪幾家店、可能都不去、劇情角色跳過、平均 λ）、館內股人數用行程加總、全館計數、GDP 的投資和門票看外面世界的流向。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.NUM.casino.grants = []; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const D0 = "2026-11-16";

T("行程：平均每家店每天約 npcLambda 位；有些 NPC 哪裡都不去；劇情角色跳過；同樣輸入同樣輸出、換祕密不同", G => {
  const lam = G.NUM.casino.stockIn.npcLambda, list = G.NPC_ROSTER.concat([{ id: "t-x", name: "影", kind: "trace", route: { food: 10 }, arc: [] }]);
  const tot = { food: 0, bj: 0, job: 0, cellar: 0, craft: 0 }; let none = 0, days = 300;
  for (let i = 0; i < days; i++) {
    const r = G.npcTrips(add(D0, i), "祕密", list, null);
    assert.ok(!r.visits["t-x"], "劇情角色不會來");
    for (const s of Object.keys(tot)) tot[s] += r.counts[s];
    none += list.filter(n => n.kind !== "trace" && !r.visits[n.id]).length;
  }
  let near = 0; for (const s of Object.keys(tot)) { const m = tot[s] / days; assert.ok(m > 1 && m < lam + 0.35, `${s} 平均 ${m}`); if (Math.abs(m - lam) < 0.35) near++; } // 名單裡愛去這家店的人太少時（每個人機率封頂 1），平均會低於 λ
  assert.ok(near >= 3, "至少三家平均約 λ");
  assert.ok(none > 0, "有的 NPC 有的日子哪裡都不去");
  assert.strictEqual(JSON.stringify(G.npcTrips(D0, "甲", list, null)), JSON.stringify(G.npcTrips(D0, "甲", list, null)));
  assert.notStrictEqual(JSON.stringify(G.npcTrips(D0, "甲", list, null)), JSON.stringify(G.npcTrips(D0, "乙", list, null)));
});
T("館內股的 NPC 人數用行程加總（有名單）；沒有名單還是 Poisson；上限 40% 還在", G => {
  const mk = () => { const h = G.casHouseFix(G.casHouseNew(), D0).house; G.casInHouseFix(h); return h; };
  const h = mk(), H = h.sin; G.casInRoll(h, D0, 0, "s", {}, { list: G.NPC_ROSTER, counters: null }); G.casInRoll(h, add(D0, 1), 0, "s", {}, { list: G.NPC_ROSTER, counters: null });
  const trips = G.npcTrips(D0, "s", G.NPC_ROSTER, null);
  for (const s of ["food", "bj"]) assert.ok(H.npc[D0][s] <= trips.counts[s], "有 40% 上限（館友 0 位 → 0）");
  H.use[add(D0, 1)] = { food: 100 }; delete H.npc[add(D0, 1)]; const c = G.casInNpcFor(H, add(D0, 1), "s", {}, { list: G.NPC_ROSTER, counters: null });
  assert.strictEqual(c.food, Math.min(Math.floor(100 * 40 / 60), G.npcTrips(add(D0, 1), "s", G.NPC_ROSTER, null).counts.food));
});
T("全館計數：交委託、收門票時累加 house.npcc（故事線解鎖用）；日報有「館內近況」", G => {
  const h = G.casHouseFix(G.casHouseNew(), D0).house, w = G.casWalletFix(G.casWalletNew(), D0);
  assert.ok(G.casJobChips(w, h, ["0", "1"], D0).ok); assert.strictEqual(h.npcc.comm, 2);
  const s = G.casBookSnap([w], h, 0, D0), doc = { day: "2026-12-01", at: 0, snap: s, diff: G.casBookDiff(null, s), opening: 0 };
  const txt = G.casReportView(doc).secs.map(x => x.lines.join("|")).join("\n"); assert.ok(txt.includes("館內近況："), txt.slice(0, 300));
});
T("GDP：投資 I 加股票淨流入外面世界（玩家和館方）；門票從外面世界付也算淨出口", G => {
  const K = G.NUM.casino.gdp, z = G.casGdpOf({ act: {}, wflow: {} });
  const g = G.casGdpOf({ act: {}, wflow: { stockBuy: 1000000, stockSell: -400000, houseInvestBuy: 200000 }, bank: 0 });
  assert.strictEqual(g.I - z.I, Math.floor((600000 + 200000) * K.investPct / 100));
  assert.strictEqual(G.casGdpOf({ act: {}, wflow: { stockBuy: 100, stockSell: -900 } }).I, z.I, "淨流出不算");
  assert.strictEqual(G.casGdpOf({ act: {}, wflow: { ticket: -300, ticketBudget: -200, ticketMuseum: -500 } }).NX - z.NX, 1000);
});
T("突發大事件 C：機率 100% 時每家店都多來 b×平均 位（b 0.5～1.0）；機率 0 不發生；日報寫「突然來了一大批旅客」", G => {
  const C = G.NUM.casino.stockIn, h = G.casHouseFix(G.casHouseNew(), D0).house, H = G.casInHouseFix(h);
  for (let i = 1; i <= 7; i++) H.use[add(D0, -i)] = { food: 10 };
  C.npcBurstPct = 0; const a = G.casInNpcFor(H, D0, "s", {}, null).food; assert.ok(!H.npcEv[D0]);
  delete H.npc[D0]; C.npcBurstPct = 100; const b = G.casInNpcFor(H, D0, "s", {}, null).food - a;
  assert.ok(b >= Math.round(10 * C.npcBurstMin) && b <= Math.round(10 * C.npcBurstMax), "多來 " + b);
  assert.ok(H.npcEv[D0] && H.npcEv[D0].burst);
  const s = G.casBookSnap([], h, 0, D0); s.house.npcLast = { day: D0, n: H.npc[D0], ev: H.npcEv[D0] };
  const txt = G.casReportView({ day: add(D0, 1), at: 0, snap: s, diff: G.casBookDiff(null, s), opening: 0 }).secs.map(x => x.lines.join("|")).join("\n"); assert.ok(txt.includes("突然來了一大批旅客"), txt.slice(0, 300));
});
T("預告的活動：festP＝1 必辦成（多來 b×平均、不算進之後的平均）、festP＝0 沒辦成；日報寫預告和結果；預告提前 festAhead 天", G => {
  const C = G.NUM.casino.stockIn, mk = () => { const h = G.casHouseFix(G.casHouseNew(), D0).house, H = G.casInHouseFix(h); for (let i = 1; i <= 7; i++) H.use[add(D0, -i)] = { food: 10 }; return { h, H }; };
  const ctx = { fest: { [D0]: [{ store: "food", name: "夜市週" }] } };
  C.npcBurstPct = 0; C.festP = 1; let { h, H } = mk(); const base = G.casInNpcFor(mk().H, D0, "s", {}, null).food, c = G.casInNpcFor(H, D0, "s", {}, ctx).food;
  assert.ok(c - base >= Math.round(10 * C.festMin) && c - base <= Math.round(10 * C.festMax), "多來 " + (c - base));
  assert.ok(H.npcFest[D0][0].ok && H.npcX[D0].food === c - base, "多來的記在 npcX，算平均時扣掉");
  C.festP = 0; ({ h, H } = mk()); G.casInNpcFor(H, D0, "s", {}, ctx); assert.ok(!H.npcFest[D0][0].ok && H.npcFest[D0][0].n === 0);
  const up = G.casInFestUp({ [add(D0, 1)]: [{ store: "bj", name: "牌桌夜" }], [add(D0, 9)]: [{ store: "food", name: "太遠" }] }, D0);
  assert.strictEqual(up.length, 1); assert.strictEqual(up[0].store, "bj");
  const s = G.casBookSnap([], h, 0, D0); s.house.festUp = up; s.house.npcLast = { day: D0, n: H.npc[D0], ev: null, fest: H.npcFest[D0] };
  const txt = G.casReportView({ day: add(D0, 1), at: 0, snap: s, diff: G.casBookDiff(null, s), opening: 0 }).secs.map(x => x.lines.join("|")).join("\n");
  assert.ok(/預告：\d+ 月 \d+ 日《牌桌夜》可能在牌桌舉辦/.test(txt) && txt.includes("《夜市週》最後沒在餐車辦成"), txt.slice(0, 400));
  const mf = G.NUM.casino.stockIn.festP; assert.ok(G.NUM.casino.stockIn.k * mf * 1 * 100 < 2 * G.NUM.casino.stock.feePct + G.NUM.casino.stock.holdPct);
});
console.log(`${pass} passed, ${fail} failed（NPC 經濟接線）`);
process.exit(fail ? 1 : 0);
