// NPC 在場的模擬（11-14）：node test/sim_presence.cjs [旅客加到幾位，預設 30]
// 看：展廳平均幾位、0 人的時間比例（全天、晚上 18:00～23:30）、館裡平均幾位；每家店每天平均幾位 NPC（館內股的 λ）；每天帶進館多少；評價幾則。
const fs = require("fs"), path = require("path");
const { load } = require("./load_shared.cjs");
const G = load(); G.NUM.casino.grants = [];
const LIST = fs.readdirSync(path.join(__dirname, "..", "content", "npc")).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "content", "npc", f), "utf8")));
const want = +process.argv[2] || 30, vis = LIST.filter(n => n.kind === "visitor");
const tiers = ["drifter", "modest", "comfortable", "collector"], routes = [{ hall: 5, food: 3, craft: 1 }, { hall: 4, craft: 4, food: 2 }, { food: 5, bj: 3, hall: 2 }, { cellar: 5, hall: 3, food: 1 }, { auction: 5, hall: 3, bank: 1 }, { job: 4, hall: 4, craft: 2 }];
for (let i = 0; vis.length + i < want; i++) LIST.push({ id: "v-sim" + i, name: "模擬旅客" + i, kind: "visitor", story: "x", likes: ["hall"], route: routes[i % routes.length], budget: { tier: tiers[i % 4], perDay: 40000 + i * 13000, max: 20000 + i * 5000 }, arc: [] });
const people = LIST.filter(n => n.kind !== "trace").length, D0 = "2026-11-16", DAYS = 90, add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
let hallSum = 0, hallZero = 0, samples = 0, eSum = 0, eZero = 0, eS = 0, aroundSum = 0, vtot = 0;
const store = { food: 0, bj: 0, job: 0, cellar: 0, craft: 0 };
const h = G.casHouseFix(G.casHouseNew(), D0).house;
for (let d = 0; d < DAYS; d++) {
  const day = add(D0, d), cr = G.crowdVisitsToday(day, "s" + d), v = G.npcVisitsToday(day, "s" + d, LIST, null);
  for (const x of v) if (store[x.place] != null) store[x.place]++; vtot += v.filter(x => x.place === "hall").length;
  for (let m = 0; m < 1110; m += 10) { const hall = v.filter(x => x.place === "hall" && x.start <= m && m < x.end).length + cr.filter(x => x.start <= m && m < x.end).reduce((a, x) => a + x.n, 0), ar = new Set(v.filter(x => x.start <= m && m < x.end).map(x => x.id)).size; hallSum += hall; aroundSum += ar; samples++; if (!hall) hallZero++; if (m >= 780) { eSum += hall; eS++; if (!hall) eZero++; } }
  G.casNpcSpend(h, day, "s" + d, LIST, null);
}
const sp = G.casReviewsFix(h);
console.log(`NPC ${people} 位（旅客 ${LIST.filter(n => n.kind === "visitor").length}）、${DAYS} 天：`);
console.log(`（含散客）展廳平均 ${(hallSum / samples).toFixed(2)} 位；0 人的時間 ${(hallZero / samples * 100).toFixed(0)}%；晚上 18:00～23:30 平均 ${(eSum / eS).toFixed(2)} 位、0 人 ${(eZero / eS * 100).toFixed(0)}%；館裡平均 ${(aroundSum / samples).toFixed(2)} 位`);
console.log(`展廳每天來 ${(vtot / DAYS).toFixed(1)} 位；每家店每天平均 NPC：` + Object.entries(store).map(([k, n]) => `${k} ${(n / DAYS).toFixed(2)}`).join("、") + `（館內股 λ ＝ ${G.NUM.casino.stockIn.npcLambda}）`);
console.log(`每天帶進館（${DAYS} 天最後壹天 ${h.npcs.total}，上限 ${G.NUM.casino.npcSpend.dayCap}）；最近評價 ${sp.length} 則`);
