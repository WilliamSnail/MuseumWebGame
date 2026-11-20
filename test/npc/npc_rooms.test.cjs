// 各房間現在有幾位＋館內股盤中跟著人數走（決定 0094）：node test/npc/npc_rooms.test.cjs（npm test 也會跑）
const assert = require("assert");
const fs = require("fs"), path = require("path");
const { load: load0 } = require("../load_shared.cjs");
const load = (...a) => { const G = load0(...a); G.NUM.casino.stockIn.mkt.on = false; return G; }; // 這份測舊的算好的曲線（真的市場在 test/stock/in_market.test.cjs，決定 0113）
const LIST = fs.readdirSync(path.join(__dirname, "..", "..", "content", "npc")).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "content", "npc", f), "utf8")));
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const D = "2026-12-01", SEC = "sec-rooms";

T("各房間人數：房間對照、每個房間 n ＝ npc ＋ crowd、店的人數加起來跟房間對得上、被邀去賭場的不算、劇情角色不算", G => {
  const ids = ["hall", "gallery", "origin", "codex", "fusion", "pillow", "casino", "bank", "workshop", "commission", "office", "cellar"];
  assert.deepStrictEqual(JSON.parse(JSON.stringify(G.NPC_ROOM)), { hall: "hall", food: "casino", bj: "casino", job: "commission", cellar: "cellar", craft: "workshop", bank: "bank", auction: "gallery" });
  let seenShop = 0, seenRooms = 0;
  for (let h = 0; h < 24; h++) {
    const t = G.npcDayStartMs(D) + h * 3600000 + 600000, p = G.npcPresence(D, t, SEC, LIST, null, new Set(), null);
    assert.ok(p.rooms && p.shops, "有 rooms、shops");
    for (const k of Object.keys(p.rooms)) { assert.ok(ids.includes(k), "房間 id 要在大廳的清單裡：" + k); const r = p.rooms[k]; assert.strictEqual(r.n, r.npc + r.crowd, k); assert.ok(r.n > 0); seenRooms++; }
    const rr = k => { const r = p.rooms[k]; return r ? r.n - (r.wander || 0) : 0; }; // 順路逛的散客不是店裡的客人
    const sh = p.shops; assert.strictEqual(sh.food + sh.bj, (p.rooms.casino || { n: 0, wander: 0 }).n - ((p.rooms.casino || {}).wander || 0), "賭場 ＝ 餐車 ＋ 牌桌（NPC 去賭場桌的不算在這）");
    assert.strictEqual(sh.job, rr("commission")); assert.strictEqual(sh.cellar, rr("cellar")); assert.strictEqual(sh.craft, rr("workshop"));
    assert.strictEqual((p.rooms.hall || { npc: 0 }).npc, p.hall, "展廳的有名字旅客 ＝ 原本的 hall"); assert.strictEqual((p.rooms.hall || { crowd: 0 }).crowd, p.crowd.n, "展廳的散客 ＝ 原本的 crowd");
    seenShop += sh.food + sh.bj + sh.job + sh.cellar + sh.craft;
  }
  assert.ok(seenShop > 0 && seenRooms > 0, "壹整天裡看得到人");
  const t = G.npcDayStartMs(D) + 12 * 3600000, all = G.npcPresence(D, t, SEC, LIST, null, new Set(), null), ids2 = G.npcVisitsToday(D, SEC, LIST, null).filter(v => v.start <= 720 && 720 < v.end).map(v => v.id);
  if (ids2.length) { const aw = G.npcPresence(D, t, SEC, LIST, null, new Set(ids2), null); const sum = o => Object.values(o.rooms).reduce((a, r) => a + r.npc, 0); assert.ok(sum(aw) < sum(all), "被邀走的 NPC 不算在房間裡"); }
  assert.ok(!LIST.filter(n => n.kind === "trace").some(n => G.npcVisitsToday(D, SEC, LIST, null).some(v => v.id === n.id)), "劇情角色沒有行程");
});
T("順路逛：看展的散客有一部分去別的房間；人數守恆（展廳＋逛別間的 ＝ 原本在館裡的散客）、不碰店的人數和到店時刻、同一時刻同樣的結果、逛的房間在大廳的清單裡", G => {
  const ids = ["hall", "gallery", "origin", "codex", "fusion", "pillow", "casino", "bank", "workshop", "commission", "office", "cellar"], base = G.crowdVisitsToday(D, SEC, null);
  let wand = 0, seen = new Set();
  for (let m = 0; m < 1440; m += 20) {
    const t = G.npcDayStartMs(D) + m * 60000, p = G.npcPresence(D, t, SEC, LIST, null, new Set(), null), q = G.npcPresence(D, t, SEC, LIST, null, new Set(), null);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(p)), JSON.parse(JSON.stringify(q)));
    const inside = base.filter(x => x.start <= m && m < x.end).reduce((a, x) => a + x.n, 0), w = Object.keys(p.rooms).reduce((a, k) => a + (p.rooms[k].wander || 0), 0);
    assert.strictEqual(p.crowd.n + w, inside, "展廳的散客 ＋ 逛別間的 ＝ 還在館裡的散客"); assert.strictEqual(p.rooms.hall ? p.rooms.hall.crowd : 0, p.crowd.n); wand += w;
    for (const k of Object.keys(p.rooms)) { assert.ok(ids.includes(k)); if (p.rooms[k].wander) seen.add(k); }
  }
  assert.ok(wand > 0 && seen.size >= 3, "整天裡看得到有人順路逛、而且逛不只壹間"); assert.ok(!seen.has("hall"));
  const g = base[0], w0 = G.crowdWander(D, SEC, g); assert.deepStrictEqual(JSON.parse(JSON.stringify(G.crowdWander(D, SEC, g))), JSON.parse(JSON.stringify(w0)));
  const off = load({ __realMoney: true }); off.NUM.casino.npcSpend.crowd.wander.p = 0; const t1 = off.npcDayStartMs(D) + 600 * 60000; assert.ok(Object.keys(off.npcPresence(D, t1, SEC, LIST, null, new Set(), null).rooms).every(k => !off.npcPresence(D, t1, SEC, LIST, null, new Set(), null).rooms[k].wander), "p ＝ 0：沒有人順路逛");
});
T("各房間有誰：ids／names 同長度 ＝ npc、groups 的人數加起來 ＝ crowd、順路逛來的標 wander、ids 是真的旅客、被邀走的不在裡面；今天到目前只給合計（不分店）", G => {
  const known = new Set(LIST.map(n => n.id)); let seenIds = 0, seenW = 0, seenShopG = 0;
  for (let m = 0; m < 1440; m += 20) {
    const p = G.npcPresence(D, G.npcDayStartMs(D) + m * 60000, SEC, LIST, null, new Set(), null);
    for (const k of Object.keys(p.rooms)) { const r = p.rooms[k]; assert.strictEqual(r.ids.length, r.npc, k); assert.strictEqual(r.names.length, r.npc); assert.strictEqual(r.groups.reduce((a, g) => a + g.n, 0), r.crowd, k + " 散客組加起來 ＝ crowd"); assert.ok(r.ids.every(id => known.has(id))); assert.strictEqual(r.groups.filter(g => g.wander).reduce((a, g) => a + g.n, 0), r.wander || 0); seenIds += r.ids.length; seenW += r.groups.filter(g => g.wander).length; seenShopG += r.groups.filter(g => !g.wander && k !== "hall").length; }
    assert.deepStrictEqual(JSON.parse(JSON.stringify(p.ids)), JSON.parse(JSON.stringify(p.rooms.hall ? p.rooms.hall.ids : [])), "展廳的 ids ＝ 原本的 hall ids");
  }
  assert.ok(seenIds > 0 && seenW > 0 && seenShopG > 0, "整天裡三種都看得到");
  const L = { day: D, ticket: 100, shop: 50, people: 3, crowd: { ticket: 200, shop: 70, people: 40 }, shopBy: { food: { npc: 1, crowd: 2 } } };
  const t = G.casNpcToday(L, D); assert.deepStrictEqual(JSON.parse(JSON.stringify(t)), { day: D, ticket: { hall: 100, crowd: 200 }, shop: 120, total: 420, people: { npc: 3, crowd: 40 } }); assert.ok(!("shopBy" in t), "不分店");
  assert.strictEqual(G.casNpcToday(L, add(D, 1)), null, "不是今天的不給"); assert.strictEqual(G.casNpcToday(null, D), null);
});
T("到店的人：npcShopArrive 加起來 ＝ 行程的人數（npcTrips）＋ 逛店的散客（crowdShopCounts）", G => {
  const ar = G.npcShopArrive(D, SEC, LIST, null), tr = G.npcTrips(D, SEC, LIST, null), cs = G.crowdShopCounts(D, SEC);
  for (const st of G.IN_STORES) { assert.strictEqual(ar[st].reduce((a, e) => a + e.n, 0), (tr.counts[st] || 0) + cs[st], st); for (let i = 1; i < ar[st].length; i++) assert.ok(ar[st][i - 1].at <= ar[st][i].at, "照時間排"); }
});
T("盤中跟著人數走：沒有名單（測試、舊程式）不修正；有名單、有 3 個以上的有效日：每家店有修正、價格曲線 ＝ 原本曲線 × 修正；ramp ＝ 0 關掉；開盤價不被修正改變", G => {
  const run = ramp => {
    const g = load({ __realMoney: true }); g.NUM.casino.stockIn.ramp = ramp;
    const h = g.casHouseFix(g.casHouseNew(), "2026-11-01").house, H = g.casInHouseFix(h);
    g.casInRoll(h, "2026-11-30", 0, SEC, {}, { list: LIST, counters: null });
    for (let i = 0; i < 12; i++) { const d = add(D, i); H.use[d] = {}; H.rev[d] = {}; for (const st of g.IN_STORES) { H.use[d][st] = 3; H.rev[d][st] = { p: 2000, x: 0 }; } g.casInRoll(h, add(d, 1), 0, SEC, {}, { list: LIST, counters: null }); }
    return { g, h, H, day: add(D, 12) };
  };
  const a = run(1), b = run(0), day = a.day;
  assert.strictEqual(a.H.day, day);
  for (const st of a.g.IN_STORES) { assert.ok(Array.isArray(a.H.ramps[day][st]) && a.H.ramps[day][st].length >= 19, "有修正：" + st); }
  assert.ok(!b.H.ramps[day] || Object.keys(b.H.ramps[day]).length === 0, "ramp ＝ 0：不修正");
  const st = "food", base = a.g.casInSeries(a.H.open[st], day, st, SEC), adj = a.g.casInSeriesR(a.H, a.H.open[st], day, st, SEC), r = a.H.ramps[day][st];
  assert.strictEqual(base.length, adj.length); assert.strictEqual(base[0], adj[0], "05:00 的價沒有人到，修正是 0"); // 第壹個價：修正 ＝ κ × (0 − 0) ＝ 0
  assert.ok(adj.some((p, i) => p !== base[i]) || r.every(x => x === 0), "曲線有被修正");
  assert.ok(adj.every(p => p >= a.g.NUM.casino.stockIn.floor));
  const noList = load({ __realMoney: true }), h2 = noList.casHouseFix(noList.casHouseNew(), "2026-11-01").house, H2 = noList.casInHouseFix(h2);
  noList.casInRoll(h2, "2026-11-30", 0, SEC); noList.casInRoll(h2, D, 0, SEC); assert.deepStrictEqual(JSON.parse(JSON.stringify(H2.ramps)), {}, "沒有名單：不修正");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a.g.casInSeriesR(H2, 10000, D, "food", SEC))), JSON.parse(JSON.stringify(a.g.casInSeries(10000, D, "food", SEC))), "沒有修正時跟原本的曲線壹樣");
});
T("人數修正不改隔天的開盤價：開盤 ＝ 原本的收盤 ×（1 ＋ 跳空），跟 ramp ＝ 0 的世界壹樣", G => {
  const mk = ramp => { const g = load({ __realMoney: true }); g.NUM.casino.stockIn.ramp = ramp; const h = g.casHouseFix(g.casHouseNew(), "2026-11-01").house, H = g.casInHouseFix(h); g.casInRoll(h, "2026-11-30", 0, SEC, {}, { list: LIST, counters: null }); const out = []; for (let i = 0; i < 10; i++) { const d = add(D, i); H.use[d] = {}; H.rev[d] = {}; for (const st of g.IN_STORES) { H.use[d][st] = 3; H.rev[d][st] = { p: 2000, x: 0 }; } g.casInRoll(h, add(d, 1), 0, SEC, {}, { list: LIST, counters: null }); out.push(g.IN_STORES.map(st => H.open[st]).join(",")); } return out.join("|"); };
  assert.strictEqual(mk(1), mk(0));
});
console.log(`各房間人數、盤中跟著人數走：${pass} 過，${fail} 沒過`); process.exit(fail ? 1 : 0);
