// 把排程填的「世界事件」打包成 shared/world_events.js（決定 0092）：
//   content/weeks/<週>/week.json 的 sanEvents（某位 NPC 理智 ±）、unrest（某集團集體不安 ±）、moodEvent（那天展廳氣氛 ±）
//   content/weeks/<週>/dN.json 的 market（世界市場新聞）裡 tone 是 down、ref 指到館外股票的，記下股票 id（壞消息推不安）
// → WORLD_EVENTS = { "日期": { san: { NPC id: n }, unrest: { 集團 id: n }, mood: n, down: [股票 id] } }。伺服器換日、收盤時用（shared/world.js）。
// 內容改了就跑 node tools/content/world_events_pack.cjs；npm test（test/world.test.cjs）會檢查有沒有跟上，copy_shared.cjs 也會順手跑。
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const isDay = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const num = v => (Number.isFinite(+v) ? Math.round(+v) : 0);
function events(dir = path.join(ROOT, "content", "weeks")) {
  const out = {}, at = d => out[d] || (out[d] = {});
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir).sort()) {
    if (!/^\d{4}-W\d{2}$/.test(name)) continue;
    const rd = f => { try { return JSON.parse(fs.readFileSync(path.join(dir, name, f), "utf8")); } catch (e) { return null; } };
    const wk = rd("week.json");
    if (wk) {
      for (const e of Array.isArray(wk.sanEvents) ? wk.sanEvents : []) if (e && isDay(e.date) && typeof e.npc === "string") { const o = at(e.date); o.san = o.san || {}; o.san[e.npc] = (o.san[e.npc] || 0) + num(e.n); }
      for (const e of Array.isArray(wk.unrest) ? wk.unrest : []) if (e && isDay(e.date) && typeof e.unit === "string") { const o = at(e.date); o.unrest = o.unrest || {}; o.unrest[e.unit] = (o.unrest[e.unit] || 0) + num(e.n); }
      for (const e of Array.isArray(wk.moodEvent) ? wk.moodEvent : []) if (e && isDay(e.date)) { const o = at(e.date); o.mood = (o.mood || 0) + num(e.n); }
    }
    for (let i = 1; i <= 7; i++) {
      const d = rd(`d${i}.json`);
      if (!d || !isDay(d.date) || !Array.isArray(d.market)) continue;
      const down = []; for (const m of d.market) if (m && m.tone === "down") for (const r of [].concat(m.ref || [])) if (typeof r === "string" && !down.includes(r)) down.push(r);
      if (down.length) at(d.date).down = down.sort();
    }
  }
  const sorted = {}; for (const k of Object.keys(out).sort()) sorted[k] = out[k];
  return sorted;
}
const HEAD = "// tools/content/world_events_pack.cjs 產生的，不要改（改 content/weeks 的 week.json／dN.json，再跑 node tools/content/world_events_pack.cjs）。\n// 排程填的世界事件（NPC 理智、集團不安、展廳氣氛、壞消息）：規則在 shared/world.js。\n";
const source = ev => HEAD + "export const WORLD_EVENTS = " + JSON.stringify(ev) + ";\n";
function write() { const f = path.join(ROOT, "shared", "world_events.js"), s = source(events()); if (!fs.existsSync(f) || fs.readFileSync(f, "utf8") !== s) fs.writeFileSync(f, s); return f; }
module.exports = { events, source, write };
if (require.main === module) console.log("寫好了", write());
