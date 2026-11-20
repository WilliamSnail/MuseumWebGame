// 館外地圖（圖書館「地圖」頁籤，11-16）：打包跟上 content/map/館外.json、兩階亮度（日期到＝輪廓、拿到線索＝亮字）、晚進來補讀、四片透明片、新點只標壹次。
const fs = require("fs"), path = require("path");
const { load } = require("../load_shared.cjs");
const pack = require("../../tools/content/map_pack.cjs");
const G = load();
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log("  ✗", m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}（得到 ${JSON.stringify(a)}，要 ${JSON.stringify(b)}）`);

// 1. 網頁的資料跟 content/map/館外.json 一致（沒跟上就跑 node tools/content/map_pack.cjs）
const f = path.join(__dirname, "..", "..", "shared", "world", "map_data.js");
ok(fs.readFileSync(f, "utf8") === pack.source(pack.spots()), "shared/world/map_data.js 沒跟上 content/map/館外.json（跑 node tools/content/map_pack.cjs）");
ok(Array.isArray(G.MAP_SPOTS) && G.MAP_SPOTS.every(s => !("source" in s)), "網頁資料不含 source");

const S = [
  { id: "m-a", name: "巷口", layer: "L1", from: "2026-11-16", x: 30, y: 78, icon: "lamp", line: "路燈下有人在數街。", npc: ["c-umbrella"], need: "c-x" },
  { id: "m-b", name: "橋頭", layer: "L1", from: "2026-11-16", x: 40, y: 58, icon: "bridge", line: "一塊牌。" },
  { id: "m-c", name: "往來", layer: "L3", from: "2026-11-23", x: 50, y: 36, icon: "blank", line: "空心章。" },
  { id: "m-d", name: "壹頁", layer: "L4", from: "2026-11-30", x: 50, y: 3, icon: "blank", line: "分冊號。" },
];
const ids = l => l.map(s => s.id);
// 2. 日期：沒到的不出現
eq(ids(G.mapSpots("2026-11-15", {}, S)), [], "11-15 還沒有點");
eq(ids(G.mapSpots("2026-11-16", {}, S)), ["m-a", "m-b"], "11-16 兩個點");
eq(ids(G.mapSpots("2026-11-30", {}, S)), ["m-a", "m-b", "m-c", "m-d"], "11-30 四個點");
// 3. 兩階亮度：沒線索只有輪廓；沒寫 need 就全亮；拿到線索才亮字
let v = G.mapSpots("2026-11-16", { clues: {} }, S);
eq(v.map(s => s.lit), [false, true], "沒拿到線索：m-a 只有輪廓，m-b（沒寫 need）全亮");
v = G.mapSpots("2026-11-16", { clues: { "c-x": "2026-11-17" } }, S);
eq(v.map(s => s.lit), [true, true], "拿到線索：m-a 亮字");
// 4. 補讀：晚進來的玩家，日期都到、線索補讀到就全亮（不看哪天打開過）
eq(G.mapSpots("2027-01-01", { clues: { "c-x": "2026-12-30" } }, S).every(s => s.lit), true, "晚進來補讀：全亮");
// 5. 壞的存檔不會壞掉
eq(G.mapSpots("2026-11-16", null, S).map(s => s.lit), [false, true], "P 是 null");
eq(G.mapSpots("2026-11-16", { clues: [] }, S).map(s => s.lit), [false, true], "clues 是陣列");
eq(G.mapSpots("2026-11-16", {}, [null, { id: "x" }, { id: "y", from: 5 }]).length, 0, "壞的點略過");
// 6. 頁籤數字、透明片
eq(G.mapCounts("2026-11-16", { clues: {} }, S), [2, 1], "頁籤：2 個點、1 個還沒亮字");
eq(G.mapLayersOn(G.mapSpots("2026-11-16", {}, S)), ["L1"], "第壹段只有 L1");
eq(G.mapLayersOn(G.mapSpots("2026-11-30", {}, S)), ["L1", "L3", "L4"], "疊的順序 L1、L3、L2、L4（沒有 L2 就略過）");
// 7. 圖書館的「新」：沒有資料就沒有新點；有資料每個點標壹次
{
  const P = G.newProfile("challenge"); G.ensureDay(P, "2026-11-08");
  {
    const before = Object.keys((P.fresh && P.fresh.origin) || {}).filter(k => k.startsWith("map:")).length;
    G.scanFresh(P, "lobby"); G.scanFresh(P, "lobby");
    const after = Object.keys((P.fresh && P.fresh.origin) || {}).filter(k => k.startsWith("map:"));
    ok(after.length >= before && after.length === G.mapSpots(G.todayStr(), P).length, "scanFresh：每個看得到的點標壹次");
  }
}
eq(G.FRESH_KEY.map("m-a"), "map:m-a", "FRESH_KEY.map");
if (fails) { console.log(`地圖：${fails} 項失敗`); process.exit(1); }
console.log("館外地圖：打包、兩階亮度、補讀、透明片、新點都對");
