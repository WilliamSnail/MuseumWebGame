// 館內 NPC 每家店平均每天幾位：node tools/npc_avg.cjs [天數=400]（行程規則 shared/npc_trip.js；目標每家都接近 NUM.casino.stockIn.npcLambda）
const { load } = require("../test/load_shared.cjs");
const G = load();
const days = +process.argv[2] || 400, out = {}, list = G.NPC_ROSTER;
const add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
for (let i = 0; i < days; i++) { const c = G.npcTrips(add("2026-12-01", i), "avg", list, null).counts; for (const s in c) out[s] = (out[s] || 0) + c[s] / days; }
console.log(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, +v.toFixed(2)])), "目標", G.NUM.casino.stockIn.npcLambda);
