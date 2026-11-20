// 排程填的世界事件（week.json 的 sanEvents、unrest、moodEvent）的寫入：node tools/content/world_event.cjs …（npm run world:event -- …）。決定 0092。
// 這些是「劇情決定的欄位」：只放數字和 id，劇情的理由寫在帳本，不寫在這裡。伺服器換日（集團不安、展廳氣氛）和收盤（NPC 理智）套用。
//   npm run world:event -- san  --week 2026-W47 --date 2026-11-18 --npc c-bus --n -5     某位 NPC 那天的理智 ±（−10～10）
//   npm run world:event -- unrest --week 2026-W47 --date 2026-11-18 --unit g-island --n 8   某集團那天的集體不安 ±（−15～15，文化部不放）
//   npm run world:event -- mood --week 2026-W47 --date 2026-11-18 --n -10                    那天的展廳氣氛 ±（−20～20）
//   npm run world:event -- list --week 2026-W47                                              看這週寫了什麼
//   npm run world:event -- clear --week 2026-W47 [--kind san|unrest|mood]                    清掉（整週或某一種）
// 每次寫之前先過 week_check 同樣的規則（id 存在、日期在這週、數字範圍、同一對象同一天只有一筆、每週最多幾筆）；寫完會重新打包 shared/world_events.js。加 --dry 只印不寫。
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const KEYS = { san: ["sanEvents", "npc", "sanMax", 6], unrest: ["unrest", "unit", "unrestMax", 4], mood: ["moodEvent", null, "moodMax", 3] };
function parse(argv) { const o = { _: [] }; for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a === "--dry") o.dry = true; else if (a.startsWith("--")) o[a.slice(2)] = argv[++i]; else o._.push(a); } return o; }
const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s || "") && !isNaN(Date.parse(s));
function main(argv, weeksDir = path.join(ROOT, "content", "weeks"), G = null, log = console.log, pack = true) {
  const o = parse(argv), cmd = o._[0]; G = G || require("../../test/load_shared.cjs").load();
  if (!o.week || !/^\d{4}-W\d{2}$/.test(o.week)) throw new Error("要寫 --week 2026-W47");
  const file = path.join(weeksDir, o.week, "week.json"); if (!fs.existsSync(file)) throw new Error(`沒有 ${path.relative(ROOT, file)}`);
  const raw = fs.readFileSync(file, "utf8"), wk = JSON.parse(raw), tail = raw.endsWith("\n") ? "\n" : "", mon = G.isoMonday(o.week);
  const save = () => { if (!o.dry) { fs.writeFileSync(file, JSON.stringify(wk, null, 2) + tail); if (pack) require("./world_events_pack.cjs").write(); } };
  if (cmd === "list") { for (const [k, [f, who]] of Object.entries(KEYS)) for (const e of wk[f] || []) log(`${k}　${e.date}　${who ? e[who] + "　" : ""}${e.n > 0 ? "+" : ""}${e.n}`); return wk; }
  if (cmd === "clear") { const ks = o.kind ? [o.kind] : Object.keys(KEYS); for (const k of ks) { if (!KEYS[k]) throw new Error(`kind 要是 san、unrest、mood`); delete wk[KEYS[k][0]]; } save(); log((o.dry ? "（只印不寫）" : "✓ ") + "清掉了 " + ks.join("、")); return wk; }
  const K = KEYS[cmd]; if (!K) throw new Error("用法：san｜unrest｜mood（加事件）、list、clear（加 --dry 只印不寫）");
  const [field, who, maxKey, cap] = K, max = G.NUM.casino.worldDoc.events[maxKey], n = Number(o.n), list = Array.isArray(wk[field]) ? wk[field] : [];
  if (!isDay(o.date) || o.date < mon || o.date > G.addDays(mon, 6)) throw new Error(`--date 要是這週內的日期（${mon}～${G.addDays(mon, 6)}）`);
  if (!Number.isInteger(n) || n === 0 || Math.abs(n) > max) throw new Error(`--n 要是 −${max}～${max} 的整數（不是 0）`);
  const e = { date: o.date }; if (who) { e[who] = o[who]; const ok = who === "npc" ? G.NPC_ROSTER.some(x => x.id === o.npc) : G.WORLD_UNITS.some(u => u.id === o.unit && u.parent == null && u.kind !== "story"); if (!ok) throw new Error(who === "npc" ? `--npc 要是旅客或委託人的 id（劇情角色 t- 不放）：${o.npc}` : `--unit 要是頂層集團的 id（文化部不放）：${o.unit}`); }
  e.n = n; if (list.some(x => x.date === e.date && (!who || x[who] === e[who]))) throw new Error("同一個對象同一天只能有一筆");
  if (list.length >= cap) throw new Error(`每週最多 ${cap} 筆`);
  wk[field] = list.concat([e]); save(); log((o.dry ? "（只印不寫）" : "✓ 寫好了 ") + JSON.stringify(e)); return wk;
}
module.exports = { main };
if (require.main === module) { try { main(process.argv.slice(2)); } catch (e) { console.error("✗ " + e.message); process.exit(1); } }
