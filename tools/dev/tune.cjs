// 調數值的總入口：node tools/dev/tune.cjs "改動" … [--dry] [--file 清單.txt] [--full] [--no-sim]（npm run tune -- …）。決定 0089。
// 一張清單改好幾處，自己找到該改的檔、改完自動跑檢查和模擬，印「改之前 → 改之後」和模擬的影響；有壹項沒過就自動還原（不寫）。
//   npm run tune -- NUM.casino.loan.interestPct=8 unit:g-island.share=0.12 npc:c-bus.budget.perDay=250000
//   npm run tune -- --file 調整.txt --dry          清單檔每行壹項（# 開頭是註解）；--dry ＝ 改了、檢查、模擬，然後還原，不留下任何改動
// 改動的寫法（路徑用點，值能當 JSON 讀就當 JSON，不然當字串）：
//   NUM.壹路.下去=值　　　　shared/config.js 的 NUM（也可以是 config.js 裡別的 export const，例如 LIMITED_FX.館員帽.skill=6）。用 acorn 找到那個屬性、只換那個值，註解和排版不動；
//                        只能改壹個數字、字串或 true／false（物件、陣列、算式要手改）；型別不能變
//   unit:集團id.欄位=值　　content/world/units，叫 world:unit 的 set
//   npc:NPCid.欄位路徑=值　content/npc，叫 world:npc 的 set（例如 budget.perDay、job.unit）
// 改完自動跑：world:check、econ:check、npc_check（有改 NPC 時）、世界經濟的測試；--full 改跑整套 npm test；
//   world:sim（30 天，景氣 0 和 −1）前後對照：已知世界、NPC 每天花多少、莊家、博物館資金、各狀態的集團數、守恆、有沒有破產。--no-sim 跳過模擬。
// 任何壹項沒過、或模擬破產／守恆不對：exit 1，檔案還原成原本的樣子。只改 repo 的檔案，不碰正式站。
const fs = require("fs"), path = require("path"), { spawnSync } = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const CONFIG = path.join(ROOT, "shared", "config.js");

// ---------- 讀改動 ----------
function parseArgs(argv) {
  const o = { changes: [], dry: false, full: false, sim: true, file: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry") o.dry = true; else if (a === "--full") o.full = true; else if (a === "--no-sim") o.sim = false;
    else if (a === "--file") { if (argv[i + 1] === undefined) throw new Error("--file 後面要有檔名"); o.file = argv[++i]; }
    else if (a.startsWith("--")) throw new Error(`沒有 ${a} 這個選項`);
    else o.changes.push(a);
  }
  return o;
}
function parseChange(text) {
  const t = String(text).trim(), eq = t.indexOf("=");
  if (eq < 1) throw new Error(`「${t}」要寫成 路徑=值`);
  const key = t.slice(0, eq).trim(), raw = t.slice(eq + 1).trim(); let value; try { value = JSON.parse(raw); } catch (e) { value = raw; }
  let m;
  if ((m = /^unit:([a-z][a-z0-9-]*)\.([A-Za-z]+)$/.exec(key))) return { kind: "unit", id: m[1], field: m[2], value, raw, text: t };
  if ((m = /^npc:([a-z][a-z0-9-]*)\.([\w.]+)$/.exec(key))) return { kind: "npc", id: m[1], field: m[2], value, raw, text: t };
  if (/^[A-Za-z_][\w]*(\.[^.=\s]+)+$/.test(key)) { const p = key.split("."); return { kind: "config", root: p[0], path: p.slice(1), value, raw, text: t }; }
  throw new Error(`看不懂「${key}」：要是 NUM.路徑、unit:id.欄位、npc:id.欄位`);
}
function readChanges(o) {
  const out = o.changes.map(parseChange);
  if (o.file) for (const line of fs.readFileSync(o.file, "utf8").split(/\r?\n/)) { const t = line.trim(); if (t && !t.startsWith("#")) out.push(parseChange(t)); }
  if (!out.length) throw new Error("沒有要改的：npm run tune -- NUM.路徑=值 …（用法看檔頭）");
  return out;
}

// ---------- 改 shared/config.js：用 acorn 找到屬性，只換那個值 ----------
function patchConfig(src, root, pathSegs, value, force = false) {
  const acorn = require("acorn"), ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "module", ranges: true });
  let obj = null;
  for (const n of ast.body) if (n.type === "ExportNamedDeclaration" && n.declaration && n.declaration.type === "VariableDeclaration") for (const d of n.declaration.declarations) if (d.id.name === root && d.init) obj = d.init;
  if (!obj) throw new Error(`shared/config.js 裡沒有 export const ${root}`);
  const keyOf = p => (p.key.type === "Identifier" ? p.key.name : String(p.key.value));
  let node = obj;
  for (let i = 0; i < pathSegs.length; i++) {
    const seg = pathSegs[i];
    if (node.type === "ObjectExpression") { const p = node.properties.find(x => x.type === "Property" && !x.computed && keyOf(x) === seg); if (!p) throw new Error(`${root}.${pathSegs.slice(0, i + 1).join(".")} 不存在`); node = p.value; }
    else if (node.type === "ArrayExpression") { const el = node.elements[+seg]; if (!el || !/^\d+$/.test(seg)) throw new Error(`${root}.${pathSegs.slice(0, i + 1).join(".")} 不存在`); node = el; }
    else throw new Error(`${root}.${pathSegs.slice(0, i).join(".")} 不是物件或陣列，沒辦法往下找 ${seg}`);
  }
  const old = literalOf(node);
  if (old === undefined) throw new Error(`${root}.${pathSegs.join(".")} 不是單純的數字、字串或 true／false（是 ${node.type}），要手改`);
  if (typeof value !== typeof old && !force) throw new Error(`型別不能變（現在是 ${typeof old}，要改成 ${typeof value}）`);
  if (!["number", "string", "boolean"].includes(typeof value) || (typeof value === "number" && !Number.isFinite(value))) throw new Error("值要是數字、字串或 true／false");
  const text = typeof value === "string" ? JSON.stringify(value) : String(value);
  return { src: src.slice(0, node.start) + text + src.slice(node.end), old, was: src.slice(node.start, node.end) };
}
function literalOf(n) {
  if (n.type === "Literal" && ["number", "string", "boolean"].includes(typeof n.value)) return n.value;
  if (n.type === "UnaryExpression" && n.operator === "-" && n.argument.type === "Literal" && typeof n.argument.value === "number") return -n.argument.value;
  return undefined;
}

// ---------- 套用 ----------
function applyChange(c, ctx) {
  if (c.kind === "config") {
    const src = fs.readFileSync(ctx.configFile, "utf8"), r = patchConfig(src, c.root, c.path, c.value);
    fs.writeFileSync(ctx.configFile, r.src); ctx.touched.add("config");
    return { text: c.text, from: r.old, to: c.value, where: `shared/config.js 的 ${c.root}.${c.path.join(".")}` };
  }
  const log = () => {};
  if (c.kind === "unit") { const U = require("../content/world_unit.cjs"), before = readJson(path.join(ctx.unitDir, c.id + ".json")); U.main(["set", `${c.id}.${c.field}`, c.raw], ctx.unitDir, ctx.npcDir, ctx.stockIds, log); ctx.touched.add("unit"); return { text: c.text, from: before[c.field], to: c.value, where: `content/world/units/${c.id}.json` }; }
  const N = require("../content/world_npc.cjs"), r = N.main(["set", `${c.id}.${c.field}`, c.raw], ctx.unitDir, ctx.npcDir, ctx.stockIds, log); ctx.touched.add("npc");
  return { text: c.text, from: r.old, to: r.value, where: `content/npc/${c.id}.json` };
}
const readJson = f => JSON.parse(fs.readFileSync(f, "utf8"));
// 還原用：把會被改到的檔案先記下來
function snapshot(files) { const m = new Map(); for (const f of files) m.set(f, fs.existsSync(f) ? fs.readFileSync(f) : null); return m; }
function restore(m) { for (const [f, b] of m) { if (b === null) { if (fs.existsSync(f)) fs.unlinkSync(f); } else fs.writeFileSync(f, b); } }
function filesFor(changes, ctx) {
  const fl = new Set();
  for (const c of changes) { if (c.kind === "config") { fl.add(ctx.configFile); } else if (c.kind === "unit") { fl.add(path.join(ctx.unitDir, c.id + ".json")); fl.add(ctx.rosterFile); } else fl.add(path.join(ctx.npcDir, c.id + ".json")); }
  if (changes.some(c => c.kind === "npc")) fl.add(ctx.npcRosterFile);
  return [...fl].filter(Boolean);
}

// ---------- 檢查和模擬（可以換掉，測試用） ----------
function sh(cmd, args) { const r = spawnSync(process.execPath, [path.join(__dirname, cmd), ...args], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26 }); return { ok: r.status === 0, out: (r.stdout || "") + (r.stderr || "") }; }
const lastLines = (t, n = 4) => String(t).trim().split("\n").slice(-n).join("\n    ");
function defaultChecks(o, touched) {
  const c = [{ name: "world:check（單位和 NPC 的隸屬）", run: () => sh("../check/world_check.cjs", []) }, { name: "econ:check（經濟自我檢查）", run: () => sh("../check/econ_check.cjs", []) }];
  if (touched.has("npc")) c.push({ name: "npc_check（NPC 內容）", run: () => sh("../check/npc_check.cjs", []) });
  if (o.full) c.push({ name: "npm test（整套）", run: () => { const r = spawnSync("npm", ["test"], { cwd: ROOT, encoding: "utf8", shell: true, maxBuffer: 1 << 26 }); return { ok: r.status === 0, out: (r.stdout || "") + (r.stderr || "") }; } });
  else for (const t of ["world/world.test.cjs", "world/world_split.test.cjs", "tools/econ_check.test.cjs"]) c.push({ name: "test/" + t, run: () => { const r = spawnSync(process.execPath, [path.join(ROOT, "test", t)], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26 }); return { ok: r.status === 0, out: (r.stdout || "") + (r.stderr || "") }; } });
  return c;
}
// 模擬壹次（用磁碟上現在的檔案重新載入）：回傳要比的幾個數字
function defaultSim() {
  const L = require("../content/world_lib.cjs"), SM = require("../../test/sim/world_sim.cjs"), { load } = require("../../test/load_shared.cjs"), npcs = L.readNpcs(), out = {};
  for (const b of [0, -1]) {
    const G = load({ __realMoney: true }), r = SM.sim(G, npcs, { days: 30, b }), st = { normal: 0, cut: 0, squeeze: 0, layoff: 0 }; if (r.house.wh) Object.values(r.house.wh.st).forEach(s => { st[s.s]++; });
    out["景氣 " + b] = { 已知世界變化: r.w1 - r.w0, NPC每天花: Math.round(r.spent.total / r.days), 莊家變化: r.bank, 博物館資金變化: r.budget, 錢包合計: r.wal.total, 一般減薪緊縮裁員: `${st.normal}／${st.cut}／${st.squeeze}／${st.layoff}`, 守恆差: r.gap, 沒破產: r.gap === 0 && r.a1.pub >= 0 && r.house.bankroll >= 0 && r.house.budget >= 0 };
  }
  return out;
}
const fmt = v => (typeof v === "number" ? (Number.isInteger(v) ? v.toLocaleString("en-US") : String(Math.round(v * 10000) / 10000)) : String(v));

// 主流程：回傳 { ok, applied, checks, sim }；log 是輸出函式
function run(o, ctx, deps = {}, log = console.log) {
  const changes = readChanges(o), files = filesFor(changes, ctx), snap = snapshot(files), result = { ok: false, applied: [], checks: [], sim: null };
  const simFn = deps.sim || defaultSim, checkFn = deps.checks || defaultChecks;
  let before = null; if (o.sim) { try { before = simFn(); } catch (e) { throw new Error("改之前的模擬跑不起來：" + e.message); } }
  try {
    for (const c of changes) { const a = applyChange(c, ctx); result.applied.push(a); log(`改　${a.where}：${fmt(a.from)} → ${fmt(a.to)}`); }
    if (ctx.touched.has("unit")) require("../content/world_pack.cjs").write(); // 單位名單打包跟上
    if (ctx.touched.has("npc")) require("../content/npc_pack.cjs").write();
    let bad = 0;
    for (const k of checkFn(o, ctx.touched)) { const r = k.run(); result.checks.push({ name: k.name, ok: r.ok }); log(`${r.ok ? "✓" : "✗"} ${k.name}`); if (!r.ok) { bad++; log("    " + lastLines(r.out)); } }
    if (o.sim) {
      const after = simFn(); result.sim = { before, after };
      for (const k of Object.keys(after)) { log(`模擬 30 天，${k}（改之前 → 改之後）：`); for (const f of Object.keys(after[k])) { const a = before && before[k] ? before[k][f] : "-", b = after[k][f]; if (f === "沒破產") { log(`  ${f}：${a} → ${b}`); if (b !== true) bad++; } else log(`  ${f}：${fmt(a)} → ${fmt(b)}${typeof a === "number" && typeof b === "number" && a !== b ? `（${b - a > 0 ? "+" : ""}${fmt(b - a)}）` : ""}`); } }
    }
    result.ok = bad === 0;
  } catch (e) { restore(snap); throw e; }
  if (!result.ok || o.dry) { restore(snap); log(!result.ok ? "✗ 有壹項沒過：檔案已經還原成原本的樣子，什麼都沒寫。" : "（--dry：已還原，沒留下任何改動。）"); } else log("✓ 都過了，改好了。記得寫日誌（類型：平衡）。");
  return result;
}
module.exports = { parseArgs, parseChange, patchConfig, literalOf, run, defaultChecks };
if (require.main === module) {
  try {
    const o = parseArgs(process.argv.slice(2)), { load } = require("../../test/load_shared.cjs"), L = require("../content/world_lib.cjs");
    const ctx = { configFile: CONFIG, unitDir: L.UNIT_DIR, npcDir: L.NPC_DIR, rosterFile: path.join(ROOT, "shared", "world_roster.js"), npcRosterFile: path.join(ROOT, "shared", "npc_roster.js"), stockIds: load().OUT_STOCKS.map(s => s.id), touched: new Set() };
    process.exitCode = run(o, ctx).ok ? 0 : 1;
  } catch (e) { console.error("✗ " + e.message); process.exit(1); }
}
