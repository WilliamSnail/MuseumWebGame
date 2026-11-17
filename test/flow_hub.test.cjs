// 銀行「金流」頁籤的資料（11-17）：node test/flow_hub.test.cjs（npm test 也會跑）
// 來源有沒有歸到線，由 tools/books_sign_check.cjs 掃（那支也在 npm test 裡）；這裡測：名單全部有線、方向對、led0 相減、沒有 led0 回 null
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
T("flow：casino_report 名單裡的每個來源都有線，線的兩端都是節點", G => {
  const ids = new Set(G.CAS_FLOW_NODES.map(x => x[0])), R = G.CAS_REPORT, miss = [];
  for (const m of [R.flow, R.houseMint, R.world, R.burn, R.mint]) for (const k of Object.keys(m)) if (!G.CAS_FLOW_LINE[k]) miss.push(k);
  assert.deepStrictEqual(miss, [], "沒歸到金流的線：" + miss.join("、"));
  for (const [k, ln] of Object.entries(G.CAS_FLOW_LINE)) assert.ok(ln.length === 2 && ln.every(x => ids.has(x)) && ln[0] !== ln[1], k);
});
T("flow：方向（進莊家的錢是 對面→莊家；外面世界付出去的是 外面世界→對面；兩個方向相抵取淨額）", G => {
  const e = G.casFlowEdges({ bankroll: [{ k: "bj", label: "21 點", n: 3000 }, { k: "pack", label: "大禮包", n: -700 }, { k: "grant", label: "文化部借款", n: 500 }], world: [{ k: "grant", label: "文化部借款撥款", n: -500 }, { k: "stockBuy", label: "買股票", n: 900 }, { k: "npcTicketBudget", label: "NPC 的門票", n: -40 }], budget: [{ k: "npcTicketBudget", label: "NPC 的門票", n: 40 }, { k: "investFee", label: "投資手續費", n: 20 }], museum: [], gov: [] }), at = (a, b) => e.edges.find(x => x.from === a && x.to === b);
  assert.strictEqual(e.lost.length, 0, e.lost.join());
  assert.strictEqual((at("players", "house") || {}).amt, 2300, "21 點進 3000、大禮包出 700 → 淨 2300 館友給莊家");
  assert.strictEqual((at("world", "house") || {}).amt, 500, "外面世界撥款給莊家 500（兩個帳各列壹次，只算壹次）");
  assert.strictEqual((at("players", "world") || {}).amt, 900, "買股票：錢給外面世界");
  assert.strictEqual((at("world", "budget") || {}).amt, 40, "NPC 門票：外面世界→博物館資金");
  assert.strictEqual((at("house", "budget") || {}).amt, 20, "投資手續費：莊家付給博物館資金");
  const pk = at("players", "house").srcs.find(x => x.src === "pack"); assert.strictEqual(pk.amt, -700, "反方向的來源是負的");
  assert.ok(e.edges.every(x => x.amt > 0 && x.srcs.length));
});
T("flow：casFlowHub 用現在的 house.led 減 05:00 的 led0；不是今天的 led0 或沒有就回 null", G => {
  const D = "2026-11-17", h = G.casHouseFix(G.casHouseNew(), D).house;
  assert.strictEqual(G.casFlowHub(h, D), null, "還沒有 led0");
  const s0 = G.casBookSnap([], h, 0, D); h.econ = { day: D, led0: G.casFlowLed0(s0) };
  G.casHouseMove(h, "bj", 4000); G.casHouseMove(h, "pack", -1000);
  const r = G.casFlowHub(h, D), ph = r.edges.find(x => x.from === "players" && x.to === "house");
  assert.ok(ph && ph.amt === 3000, JSON.stringify(r.edges)); assert.strictEqual(r.bal.house, Math.floor(h.bankroll));
  assert.strictEqual(G.casFlowHub(h, "2026-11-18"), null, "led0 是昨天的");
  assert.ok(!JSON.stringify(r).match(/npcw|name|who/), "只給合計和來源標籤");
});
console.log(`${pass} passed, ${fail} failed（金流頁籤）`); process.exit(fail ? 1 : 0);
