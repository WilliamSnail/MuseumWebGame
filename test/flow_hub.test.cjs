// 銀行「金流」頁籤的資料（11-17）：node test/flow_hub.test.cjs（npm test 也會跑）
// 來源有沒有歸到線，由 tools/books_sign_check.cjs 掃（那支也在 npm test 裡）；這裡測：名單全部有線、方向對、led0 相減、沒有 led0 回 null
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
T("flow：casino_report 名單裡的每個來源都有線，線的兩端都是節點", G => {
  const ids = new Set(G.CAS_FLOW_NODES.map(x => x.id)), R = G.CAS_REPORT, miss = [];
  for (const m of [R.flow, R.houseMint, R.world, R.burn, R.mint]) for (const k of Object.keys(m)) if (!G.CAS_FLOW_LINE[k]) miss.push(k);
  assert.deepStrictEqual(miss, [], "沒歸到金流的線：" + miss.join("、"));
  for (const [k, ln] of Object.entries(G.CAS_FLOW_LINE)) assert.ok(ln.length === 2 && ln.every(x => ids.has(x) || x.startsWith("w:")) && ln[0] !== ln[1], k);
});
T("flow：方向（進莊家的錢是 對面→莊家；已知世界付出去的是 已知世界→對面；兩個方向相抵取淨額）", G => {
  const e = G.casFlowEdges({ bankroll: [{ k: "bj", label: "21 點", n: 3000 }, { k: "pack", label: "大禮包", n: -700 }, { k: "grant", label: "文化部借款", n: 500 }], ext: [{ k: "stockBuy", label: "買股票", n: 900 }], world: [{ k: "grant", label: "文化部借款撥款", n: -500 }, { k: "npcTicketBudget", label: "NPC 的門票", n: -40 }], budget: [{ k: "npcTicketBudget", label: "NPC 的門票", n: 40 }, { k: "investFee", label: "投資手續費", n: 20 }], museum: [], gov: [] }), at = (a, b) => e.edges.find(x => x.from === a && x.to === b);
  assert.strictEqual(e.lost.length, 0, e.lost.join());
  assert.strictEqual((at("players", "house") || {}).amt, 2300, "21 點進 3000、大禮包出 700 → 淨 2300 館友給莊家");
  assert.strictEqual((at("world", "house") || {}).amt, 500, "已知世界撥款給莊家 500（兩個帳各列壹次，只算壹次）");
  assert.strictEqual((at("players", "ext") || {}).amt, 900, "買股票：錢給海外（真實市場，決定 0126：跟已知世界並列的帳）");
  assert.strictEqual((at("world", "budget") || {}).amt, 40, "NPC 門票：已知世界→博物館資金");
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
  assert.ok(!JSON.stringify(r).match(/npcw|"who"|"npc":/), "只給合計和來源標籤");
});
T("flow：已知世界裡每個頂層單位、家計、公共都有節點（名單新增、拆分、改名會自己跟著）", G => {
  const D = "2026-11-17", h = G.casHouseFix(G.casHouseNew(), D).house, ids = G.casFlowWorldNodes(h).map(x => x.id);
  for (const u of G.WORLD_UNITS.filter(x => x.parent == null)) assert.ok(ids.includes("w:" + u.id), "沒有節點：" + u.id);
  assert.ok(ids.includes("w:" + G.WU_HH) && ids.includes("w:" + G.WU_PUB));
  const sum = G.casFlowWorldNodes(h).reduce((n, x) => n + x.bal, 0); assert.ok(Math.abs(sum - Math.floor(h.world)) <= 2 && sum > 0, "各單位加起來要是已知世界的錢（公共是剩下的）：" + sum + " vs " + h.world);
  assert.strictEqual(G.casFlowWorldNodes(null).length, 0);
});
T("flow：名單多加壹個集團、拆成兩個、改名，節點和線自己多出來；沒有的來源會被擋", G => {
  const D = "2026-11-17", h = G.casHouseFix(G.casHouseNew(), D).house, before = G.casFlowWorldNodes(h).length, U = G.WORLD_UNITS;
  U.push({ id: "g-new", name: "新創集團", kind: "group", parent: null, sector: "arts", share: 0.01, stocks: [] }, { id: "g-new-b", name: "新創集團乙", kind: "group", parent: null, sector: "arts", share: 0.01, stocks: [] });
  const n2 = G.casFlowWorldNodes(h); assert.strictEqual(n2.length, before + 2);
  assert.strictEqual(n2.find(x => x.id === "w:g-new-b").name, "新創集團乙"); U.find(x => x.id === "g-new").name = "改名後的集團"; assert.strictEqual(G.casFlowWorldNodes(h).find(x => x.id === "w:g-new").name, "改名後的集團");
  // 集團之間的交易（以後記在 all.units）：線的兩端是 "w:…"，會長出線；沒歸線的會被擋
  G.CAS_FLOW_LINE.testTrade = ["w:g-new", "w:g-new-b"];
  const e = G.casFlowEdges({ units: [{ k: "testTrade", label: "貨款", n: 500 }, { k: "noLine", label: "沒歸線", n: 1 }], world: [], bankroll: [], budget: [], museum: [], gov: [] });
  assert.ok(e.edges.some(x => x.from === "w:g-new" && x.to === "w:g-new-b" && x.amt === 500), JSON.stringify(e.edges)); assert.strictEqual(e.lost.length, 1);
  G.CAS_FLOW_LINE.testPay = ["w:g-new", "house"]; const e2 = G.casFlowEdges({ world: [], bankroll: [{ k: "testPay", label: "付莊家", n: 70 }], budget: [], museum: [], gov: [] });
  assert.ok(e2.edges.some(x => x.from === "w:g-new" && x.to === "house" && x.amt === 70), "莊家那邊的帳也會長出跟集團的線：" + JSON.stringify(e2.edges));
});
T("flow：名單上有上級的單位（子公司）也有節點，掛在上級底下", G => {
  const D = "2026-11-17", h = G.casHouseFix(G.casHouseNew(), D).house, U = G.WORLD_UNITS;
  U.push({ id: "g-daily-sub", name: "民生子公司", kind: "company", parent: "g-daily", sector: "daily", share: 0, stocks: [] });
  const n = G.casFlowWorldNodes(h).find(x => x.id === "w:g-daily-sub"); assert.ok(n && n.parent === "w:g-daily" && n.name === "民生子公司", JSON.stringify(n));
  G.CAS_FLOW_LINE.testSub = ["w:g-daily-sub", "house"]; const e = G.casFlowEdges({ world: [], bankroll: [{ k: "testSub", label: "子公司付莊家", n: 9 }], budget: [], museum: [], gov: [] });
  assert.ok(e.edges.some(x => x.from === "w:g-daily-sub" && x.to === "house"));
});
T("flow：集團之間的交易（world.js 記的 trade…）每種都有名字、線的兩端是集團；今天的量＝現在減 05:00", G => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "shared", "world.js"), "utf8");
  const kinds = new Set([...src.matchAll(/"(trade\w+)"/g)].map(m => m[1])); assert.ok(kinds.size >= 5, "world.js 的 trade 種類：" + [...kinds].join());
  for (const k of kinds) assert.ok(G.CAS_FLOW_UNIT[k], "交易種類 " + k + " 沒有名字（shared/casino/report.js 的 CAS_FLOW_UNIT）");
  for (const m of src.matchAll(/wtMove\(house, [^;]*?\);/g)) if (!m[0].startsWith("wtMove(house, from, to") && !/"trade\w+"\)/.test(m[0])) assert.fail("wtMove 呼叫沒帶種類：" + m[0].slice(0, 80));
  const D = "2026-11-17", h = G.casHouseFix(G.casHouseNew(), D).house, s0 = G.casBookSnap([], h, 0, D); h.econ = { day: D, led0: G.casFlowLed0(s0) };
  h.led.units = { "tradeLoan|g-finance|g-daily": 700, "tradeGoods|g-daily|g-finance": 300 };
  const r = G.casFlowHub(h, D), e = r.edges.find(x => x.from === "w:g-finance" && x.to === "w:g-daily"), e2 = r.edges.find(x => x.from === "w:g-daily" && x.to === "w:g-finance");
  assert.ok(e && e.amt === 400 || e2, JSON.stringify(r.edges)); // 放款 700 一個方向、貨款 300 反方向，淨 400
  const net = r.edges.find(x => [x.from, x.to].sort().join() === "w:g-daily,w:g-finance"); assert.ok(net && net.amt === 400 && net.srcs.length === 2, JSON.stringify(net));
});
T("flow：框「佩佩博物館」＝莊家、博物館資金、修繕基金；每個節點都有層", G => {
  const org = G.CAS_FLOW_NODES.filter(x => x.org === "museum").map(x => x.id).sort(); assert.strictEqual(org.join(), "budget,gb,house,museum"); assert.ok(G.CAS_FLOW_ORGS.museum === "佩佩博物館");
  assert.ok(G.CAS_FLOW_NODES.every(x => Number.isInteger(x.tier) && x.name));
});
console.log(`${pass} passed, ${fail} failed（金流頁籤）`); process.exit(fail ? 1 : 0);
