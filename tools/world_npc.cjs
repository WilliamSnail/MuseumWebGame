// NPC 的隸屬（content/npc/<id>.json 的 job）：node tools/world_npc.cjs …（npm run world:npc -- …）。決定 0086。
//   npm run world:npc -- assign c-bus --unit g-daily --title 司機 [--level 2]   掛到單位
//   npm run world:npc -- assign c-cat --kind free                               沒有單位的人（student、retired、free）
//   npm run world:npc -- list [--unit g-daily]                                  看每位的隸屬（或只看某個單位底下的）
//   npm run world:npc -- set c-bus.budget.perDay 250000                        改壹個欄位（路徑用點；值能當 JSON 讀就當 JSON；不能改 id）。npm run tune 也叫它
//   npm run world:npc -- orphans                                                列出還沒有 job 的人（劇情角色 t- 不用）
//   加 --dry 只印不寫。只改 job 這一個欄位（插在 budget 後面），寫完會檢查，沒過就不寫。只改 repo 的檔案。
const fs = require("fs"), path_ = require("path"), path = path_;
const L = require("./world_lib.cjs");
function parse(argv) { const o = { _: [] }; for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a === "--dry") o.dry = true; else if (a.startsWith("--")) o[a.slice(2)] = argv[++i]; else o._.push(a); } return o; }
function main(argv, unitDir = L.UNIT_DIR, npcDir = L.NPC_DIR, stockIds = null, log = console.log) {
  const o = parse(argv), cmd = o._[0], units = L.readUnits(unitDir), npcs = L.readNpcs(npcDir);
  if (cmd === "orphans") { const r = npcs.filter(n => n.kind !== "trace" && !n.job); r.forEach(n => log(`${n.id}　${n.name}`)); log(`沒有隸屬的：${r.length} 位`); return r; }
  if (cmd === "list") {
    const r = npcs.filter(n => n.kind !== "trace" && n.job && (!o.unit || n.job.unit === o.unit));
    r.forEach(n => log(`${n.id}　${n.name}　${n.job.unit ? n.job.unit + "　" + n.job.title + (n.job.level ? "　L" + n.job.level : "") : n.job.kind}`)); log(`${r.length} 位`); return r;
  }
  if (cmd === "set") {
    const m = /^([a-z][a-z0-9-]*)\.([\w.]+)$/.exec(o._[1] || ""); if (!m || o._[2] === undefined) throw new Error("用法：set <id>.<欄位路徑> <值>");
    const n = npcs.find(x => x.id === m[1]); if (!n) throw new Error(`沒有 NPC「${m[1]}」`);
    const path = m[2].split("."); if (path[0] === "id") throw new Error("id 不能改（檔名是 id）");
    const nn = JSON.parse(JSON.stringify(n)); let t = nn; for (const k of path.slice(0, -1)) { if (!t[k] || typeof t[k] !== "object") throw new Error(`沒有這個欄位：${m[2]}`); t = t[k]; }
    const last = path[path.length - 1]; if (!(last in t)) throw new Error(`沒有這個欄位：${m[2]}（只能改已經有的）`);
    const old = t[last]; let v; try { v = JSON.parse(o._[2]); } catch (e) { v = o._[2]; } if (typeof v !== typeof old && !o.force) throw new Error(`型別不一樣（現在是 ${typeof old}，要改成 ${typeof v}）；真的要改加 --force`); t[last] = v;
    Object.defineProperty(nn, "__file", { value: n.__file, enumerable: false });
    const errs = L.checkWorld({ units, npcs: npcs.map(x => x.id === n.id ? nn : x), stockIds }).filter(e => e.includes("content/npc/" + n.id + ".json"));
    if (errs.length) throw new Error("不合格，沒寫：\n  " + errs.join("\n  "));
    if (!o.dry) fs.writeFileSync(path_.join(npcDir, n.id + ".json"), JSON.stringify(nn, null, 2) + "\n");
    log((o.dry ? "（只印不寫）" : "✓ 寫好了 ") + m[1] + "." + m[2] + "：" + JSON.stringify(old) + " → " + JSON.stringify(v)); return { id: n.id, path: m[2], old, value: v };
  }
  if (cmd === "assign") {
    const id = o._[1], n = npcs.find(x => x.id === id); if (!n) throw new Error(`沒有 NPC「${id}」`);
    if (n.kind === "trace") throw new Error("劇情角色（t-）不放 job");
    const job = o.kind ? { kind: o.kind } : { unit: o.unit, title: o.title }; if (!o.kind && o.level != null) job.level = +o.level;
    const nn = {}; for (const k of Object.keys(n)) { if (k === "job") continue; nn[k] = n[k]; if (k === "budget") nn.job = job; } if (!nn.job) nn.job = job;
    Object.defineProperty(nn, "__file", { value: n.__file, enumerable: false });
    const errs = L.checkWorld({ units, npcs: npcs.map(x => x.id === id ? nn : x), stockIds }).filter(e => e.includes("content/npc/" + id + ".json"));
    if (errs.length) throw new Error("不合格，沒寫：\n  " + errs.join("\n  "));
    if (!o.dry) fs.writeFileSync(path.join(npcDir, id + ".json"), JSON.stringify(nn, null, 2) + "\n");
    log((o.dry ? "（只印不寫）" : "✓ 寫好了 ") + id + " → " + JSON.stringify(job)); return job;
  }
  throw new Error("用法：assign <id> --unit … --title …（或 --kind free）｜list [--unit …]｜orphans（加 --dry 只印不寫）");
}
module.exports = { main };
if (require.main === module) {
  try { const { load } = require("../test/load_shared.cjs"); main(process.argv.slice(2), L.UNIT_DIR, L.NPC_DIR, load().OUT_STOCKS.map(s => s.id)); } catch (e) { console.error("✗ " + e.message); process.exit(1); }
}
