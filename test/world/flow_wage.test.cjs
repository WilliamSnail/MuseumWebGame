// 決定 0128：金流圖的家計、NPC 錢包有線：發薪水（集團→NPC 錢包）、NPC 和散客花的錢從出錢的單位（家計、NPC 錢包、集團）出發；只記帳（house.led.units），不動錢。node test/world/flow_wage.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("../load_shared.cjs"), L = require("../../tools/content/world_lib.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); G.NUM.casino.grants = []; G.NUM.casino.houseLoan.fix.on = false; G.NUM.casino.worldDoc.market.on = false; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 5).join("\n    ")); } };
const add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const npcs = L.readNpcs().filter(n => n.kind !== "trace");
const D0 = "2026-11-16";
const sumKind = (units, kind, f) => Object.entries(units).filter(([k]) => k.split("|")[0] === kind && (!f || f(k.split("|")))).reduce((a, [, v]) => a + v, 0);
const run = (G, days) => { const h = G.casHouseFix(G.casHouseNew(), D0).house; h.extFix = true; let day = D0; for (let i = 0; i < days; i++) { day = add(D0, i); if (i > 0) { h.econ = { b: 0, yoy: 14.36 }; G.casHouseFix(h, day); } G.wmWriteVisit(h, day, npcs); G.casNpcSpend(h, day, "t" + i, npcs, G.npcCounters(h.npcc)); G.wtAdvance(h, day, Date.parse(day + "T05:00:00+08:00") + 95 * 900000 + 1000); } return { h, day }; };
const GRP = ["npcFood", "npcJob", "npcCellar", "npcCraft", "npcTicketBudget", "npcTicketMuseum", "npcCrowdBudget", "npcCrowdMuseum", "entTax", "bizTax"];
T("發薪水：集團→NPC 錢包記在 led.units（wageNpc），累計不是每人壹筆；不動錢（世界、各單位加起來還是等於池子）", G => {
  const { h } = run(G, 3), U = h.led.units, wage = sumKind(U, "wageNpc"); assert.ok(wage > 0, "有發薪水"); assert.ok(Object.keys(U).filter(k => k.startsWith("wageNpc|")).every(k => k.split("|")[2] === "u-wallets"), "收款都是 NPC 錢包");
  assert.ok(Object.keys(U).filter(k => k.startsWith("wageNpc|")).length <= 12, "按集團累計，鍵數很少");
  assert.strictEqual(Object.values(G.wuAmounts(h)).reduce((a, b) => a + b, 0), h.world);
});
T("NPC 和散客花的錢：每個來源的單位端點加起來 ＝ 這個來源在已知世界的流水（少了就是漏記）；出錢的是家計、NPC 錢包或集團", G => {
  const { h } = run(G, 3), U = h.led.units;
  for (const k of GRP) { const w = -(h.led.world[k] || 0), u = sumKind(U, k); assert.strictEqual(u, w, `${k}：單位端點 ${u}、世界流水 ${w}`); }
  const payers = new Set(Object.keys(U).filter(k => GRP.includes(k.split("|")[0])).map(k => k.split("|")[1])); assert.ok(payers.has("u-household") && payers.has("u-wallets"), [...payers].join()); assert.ok(sumKind(U, "npcCrowdBudget", p => p[1] === "u-household") > 0 && sumKind(U, "npcFood", p => p[1] === "u-wallets") >= 0);
});
T("金流圖：花錢的線從 w:u-household、w:u-wallets 出發到博物館資金、修繕基金、政府帳；同壹筆不重複算進整個已知世界；發薪水有 集團→NPC 錢包 的線", G => {
  const { h, day } = run(G, 2), s0 = G.casBookSnap([], G.casHouseFix(G.casHouseNew(), D0).house, 0, day); h.econ = Object.assign({}, h.econ, { day, led0: G.casFlowLed0(s0) });
  const r = G.casFlowHub(h, day), e = (a, b) => r.edges.find(x => x.from === a && x.to === b);
  assert.ok(e("w:u-household", "budget") || e("w:u-household", "museum"), r.edges.map(x => x.from + ">" + x.to + ":" + x.amt).filter(s => /budget|museum|gov|house/.test(s)).join(" "));
  assert.ok(r.edges.some(x => x.from === "w:u-wallets" && ["budget", "museum", "gov", "house"].includes(x.to)), "NPC 錢包花錢"); assert.ok(r.edges.some(x => x.to === "w:u-wallets" && x.srcs.some(y => y.src === "wageNpc")), "發薪水");
  assert.ok(!r.edges.some(x => x.from === "world" && x.srcs.some(y => GRP.includes(y.src))), "這些來源不再從整個已知世界出來");
  assert.ok(!G.casFlowEdges(G.casBooksView({ day, snap: { house: { bankroll: 0, budget: 0, museum: 0, gov: 0, sea: 0, world: 0 } }, diff: {} }, true).all).lost.length, "沒有漏歸線");
});
console.log(`${pass} passed, ${fail} failed（家計和 NPC 錢包的金流）`);
process.exit(fail ? 1 : 0);
