// 各房間現在有幾位 NPC＋散客的分布（決定 0095，用來訂大廳熱絡門檻 RM.roomLv）：node test/sim/sim_rooms.cjs [天數]
const fs = require("fs"), path = require("path"), { load } = require("../load_shared.cjs");
const LIST = fs.readdirSync(path.join(__dirname, "..", "..", "content", "npc")).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "content", "npc", f), "utf8")));
const G = load({ __realMoney: true }); if (process.argv[3] !== undefined) G.NUM.casino.npcSpend.crowd.wander.p = +process.argv[3]; // 第 3 個參數：順路逛的機率（0 ＝ 以前的樣子）
const DAYS = +process.argv[2] || 14, add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const ids = ["hall", "gallery", "origin", "codex", "fusion", "pillow", "casino", "bank", "workshop", "commission", "office", "cellar"], S = {}; ids.forEach(i => S[i] = []);
for (let d = 0; d < DAYS; d++) { const day = add("2026-12-01", d); for (let t = 0; t < 1440; t += 10) { const p = G.npcPresence(day, G.npcDayStartMs(day) + t * 60000, "sec-sim" + d, LIST, null, new Set(), null); for (const i of ids) S[i].push(p.rooms[i] ? p.rooms[i].n : 0); } }
const pc = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
console.log("房間        平均   p10  p25  p50  p75  p90  max   0 人占  熱絡 0/1/2/3 級各占（RM.roomLv ＋ roomScale）");
for (const i of ids) { const a = S[i]; console.log(i.padEnd(11), (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1).padStart(5), [.1, .25, .5, .75, .9].map(q => String(pc(a, q)).padStart(4)).join(" "), String(Math.max(...a)).padStart(5), ((a.filter(x => x === 0).length / a.length * 100).toFixed(0) + "%").padStart(6), (() => { const c = [0, 0, 0, 0]; a.forEach(n => c[G.roomHeats({ [i]: n })[i].lv]++); return c.map(x => (x / a.length * 100).toFixed(0).padStart(3) + "%").join(" "); })()); }
