// 單位名單（content/world/units）的加、改、掛：node tools/content/world_unit.cjs …（npm run world:unit -- …）。決定 0086。
//   npm run world:unit -- list [--tree]                    列出全部（--tree：縮排成樹，後面寫 share 和旗下股票）
//   npm run world:unit -- add g-new --name 名字 --sector daily [--kind group] [--parent g-island] [--share 0.05] [--staff 1000] [--stocks a,b] [--note 說明]
//   npm run world:unit -- set g-island.share 0.1            改一個欄位（值能當 JSON 讀就當 JSON）
//   npm run world:unit -- move c-x --parent g-y             換上一層（--parent null ＝ 頂層）
//   加 --dry 只印不寫。每次寫完會跑 world_check，沒過就不寫（所以不會寫出壞檔）。只改 repo 的檔案，不碰正式站。
const path = require("path");
const L = require("./world_lib.cjs");
function parse(argv) { const o = { _: [] }; for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a === "--dry" || a === "--tree") o[a.slice(2)] = true; else if (a.startsWith("--")) { o[a.slice(2)] = argv[++i]; } else o._.push(a); } return o; }
const num = v => { const n = +v; if (!Number.isFinite(n)) throw new Error(`「${v}」不是數字`); return n; };
const val = s => { try { return JSON.parse(s); } catch (e) { return s; } };
function main(argv, dir = L.UNIT_DIR, npcDir = L.NPC_DIR, stockIds = null, log = console.log) {
  const o = parse(argv), cmd = o._[0];
  const units = L.readUnits(dir), byId = new Map(units.map(u => [u.id, u]));
  const verify = list => { const errs = L.checkWorld({ units: list, npcs: L.readNpcs(npcDir), stockIds }).filter(e => !e.includes("content/npc/")); if (errs.length) throw new Error("寫完會不合格，沒寫：\n  " + errs.join("\n  ")); };
  const save = (u, list) => { verify(list); if (!o.dry) L.writeJson(path.join(dir, u.id + ".json"), u); log((o.dry ? "（只印不寫）" : "✓ 寫好了 ") + JSON.stringify(u)); };
  if (cmd === "list") {
    const kids = id => units.filter(u => (u.parent == null ? null : u.parent) === id).sort((a, b) => b.share - a.share);
    const pr = (u, d) => { log("  ".repeat(d) + `${u.id}　${u.name}　${u.kind}　share ${u.share}${u.stocks.length ? "　股票 " + u.stocks.join("、") : ""}`); kids(u.id).forEach(k => pr(k, d + 1)); };
    if (o.tree) kids(null).forEach(u => pr(u, 0)); else units.forEach(u => log(`${u.id}　${u.name}　${u.kind}　parent ${u.parent}　share ${u.share}`));
    return units;
  }
  if (cmd === "add") {
    const id = o._[1]; if (!id) throw new Error("要寫 id");
    if (byId.has(id)) throw new Error(`id「${id}」已經有了`);
    const kind = o.kind || (o.parent ? "firm" : "group");
    const u = { id, name: o.name, kind, parent: o.parent && o.parent !== "null" ? o.parent : null, sector: o.sector, share: num(o.share == null ? 0.01 : o.share), staff: Math.floor(num(o.staff == null ? 100 : o.staff)), stocks: o.stocks ? o.stocks.split(",").filter(Boolean) : [], story: kind === "story" };
    if (o.note) u.note = o.note;
    save(u, units.concat([u])); return u;
  }
  if (cmd === "set") {
    const m = /^([a-z][a-z0-9-]*)\.([A-Za-z]+)$/.exec(o._[1] || ""); if (!m || o._[2] === undefined) throw new Error("用法：set <id>.<欄位> <值>");
    const u = byId.get(m[1]); if (!u) throw new Error(`沒有「${m[1]}」`);
    if (m[2] === "id") throw new Error("id 不能改（檔名是 id）");
    const nu = Object.assign({}, u, { [m[2]]: val(o._[2]) }); save(nu, units.map(x => x.id === u.id ? nu : x)); return nu;
  }
  if (cmd === "move") {
    const u = byId.get(o._[1]); if (!u) throw new Error(`沒有「${o._[1]}」`); if (o.parent === undefined) throw new Error("要寫 --parent");
    const nu = Object.assign({}, u, { parent: o.parent === "null" ? null : o.parent }); save(nu, units.map(x => x.id === u.id ? nu : x)); return nu;
  }
  throw new Error("用法：list [--tree]｜add <id> --name … --sector …｜set <id>.<欄位> <值>｜move <id> --parent <id|null>（加 --dry 只印不寫）");
}
module.exports = { main };
if (require.main === module) {
  try { const { load } = require("../../test/load_shared.cjs"); main(process.argv.slice(2), L.UNIT_DIR, L.NPC_DIR, load().OUT_STOCKS.map(s => s.id)); } catch (e) { console.error("✗ " + e.message); process.exit(1); }
}
