// 世界經濟（已知世界的單位和 NPC 的隸屬）的共用工具：讀寫 content/world/units、檢查兩層加總。規劃 docs/規劃/世界經濟規劃.md、決定 0086。
// 這支只讀寫 repo 裡的檔案，不碰正式站。tools/check/world_check.cjs、world_unit.cjs、world_npc.cjs 都用它。
// 單位是一棵樹：用 parent 指向上一層（頂層是 null），不寫死兩層。
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const UNIT_DIR = path.join(ROOT, "content", "world", "units");
const NPC_DIR = path.join(ROOT, "content", "npc");
const KINDS = ["group", "firm", "org", "story"];
const SECTORS = ["tech", "daily", "finance", "arts", "school", "public", "story"];
const JOB_KINDS = ["student", "retired", "free"]; // 沒有單位的人
const TOP_SHARE_MAX = 0.8; // 頂層單位的 share 加起來最多 80%：剩下家計 10%、公共池至少 10%（規劃 3.3）
const STORY_KEYS = ["id", "name", "kind", "parent", "sector", "market", "listed", "share", "staff", "stocks", "story", "note"]; // 劇情單位只能有這些欄位，劇情的細節不放在這裡（決定 0086 第 9 點）
const UNIT_KEYS = STORY_KEYS;
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);

function readJsonDir(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith(".json")) continue;
    try { const o = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); if (isObj(o)) Object.defineProperty(o, "__file", { value: f, enumerable: false }); out.push(o); } catch (e) { out.push({ __bad: f + "：" + e.message }); }
  }
  return out;
}
const readUnits = (dir = UNIT_DIR) => readJsonDir(dir);
const readNpcs = (dir = NPC_DIR) => readJsonDir(dir);
// 寫回去：JSON、縮排 2、結尾有換行（跟 content/npc 一樣）
function writeJson(file, o) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(o, null, 2) + "\n"); }

// 檢查。units／npcs ＝讀進來的陣列；stockIds ＝館外股票的 id 清單（OUT_STOCKS）。回傳錯誤字串陣列
function checkWorld({ units, npcs, stockIds }) {
  const errs = [], E = (w, m) => errs.push(`${w}：${m}`);
  const byId = new Map();
  units.forEach((u, i) => {
    const w = "content/world/units/" + ((u && u.__file) || "第 " + (i + 1) + " 筆");
    if (u && u.__bad) { E(w, "讀不進來：" + u.__bad); return; }
    if (!isObj(u)) { E(w, "要是物件"); return; }
    Object.keys(u).forEach(k => { if (!UNIT_KEYS.includes(k)) E(w, `不認得欄位「${k}」（只能 ${UNIT_KEYS.join("、")}）`); });
    if (!/^[a-z][a-z0-9-]{1,23}$/.test(u.id || "")) { E(w, "id 要是英文小寫、數字、-（2～24 字，開頭是字母）"); return; }
    if (u.__file && u.__file !== u.id + ".json") E(w, `檔名要跟 id 一樣（${u.id}.json）`);
    if (byId.has(u.id)) E(w, `id「${u.id}」重複了`); byId.set(u.id, u);
    if (typeof u.name !== "string" || !u.name.trim() || [...u.name].length > 14) E(w, "name 要是 1～14 字");
    if (!KINDS.includes(u.kind)) E(w, `kind 要是 ${KINDS.join("、")}`);
    if (!SECTORS.includes(u.sector)) E(w, `sector 要是 ${SECTORS.join("、")}`);
    if (typeof u.share !== "number" || !(u.share > 0) || u.share > 1) E(w, "share 要是 0～1 之間的數字");
    if (!Number.isInteger(u.staff) || u.staff < 0) E(w, "staff 要是 0 以上的整數");
    if (!Array.isArray(u.stocks) || u.stocks.some(s => typeof s !== "string")) E(w, "stocks 要是字串陣列（沒有就 []）");
    if (u.parent !== null && typeof u.parent !== "string") E(w, "parent 要是上一層的 id，頂層寫 null");
    if (u.kind === "story" && u.sector !== "story") E(w, "劇情單位（kind story）的 sector 要是 story");
    if (u.sector === "story" && u.kind !== "story") E(w, "sector story 只給劇情單位");
    if (typeof u.story !== "boolean") E(w, "story 要是 true／false（是不是劇情單位）");
    else if (u.story !== (u.kind === "story")) E(w, "story 要跟 kind 一致（kind story ＝ story true）");
    if (u.note != null && (typeof u.note !== "string" || [...u.note].length > 60)) E(w, "note 要是 60 字內的字串（只寫明面的說明）");
  });
  // parent 指得到、不繞圈
  for (const u of byId.values()) {
    if (u.parent == null) continue;
    if (!byId.has(u.parent)) { E(u.id, `parent「${u.parent}」不存在`); continue; }
    let x = u, n = 0; while (x && x.parent != null && n++ < 50) x = byId.get(x.parent);
    if (n >= 50) E(u.id, "parent 繞圈了");
    if (u.kind === "story") E(u.id, "劇情單位不掛在別的單位底下（parent 要是 null）");
  }
  // 兩層加總：子單位的 share 加起來 ≤ 父單位；頂層加起來 ≤ TOP_SHARE_MAX
  const kids = new Map(); let top = 0;
  for (const u of byId.values()) { if (u.parent == null) top += +u.share || 0; else { if (!kids.has(u.parent)) kids.set(u.parent, []); kids.get(u.parent).push(u); } }
  for (const [pid, ks] of kids) { const p = byId.get(pid); if (!p) continue; const sum = ks.reduce((a, k) => a + (+k.share || 0), 0); if (sum > p.share + 1e-9) E(pid, `旗下的 share 加起來 ${sum.toFixed(4)} 超過自己的 ${p.share}`); }
  if (top > TOP_SHARE_MAX + 1e-9) E("頂層單位", `share 加起來 ${top.toFixed(4)} 超過 ${TOP_SHARE_MAX}（剩下家計 10%、公共池至少 10%）`);
  // 館外股票：每支只能掛在一個單位下，而且要存在
  const seen = new Map();
  for (const u of byId.values()) for (const s of Array.isArray(u.stocks) ? u.stocks : []) {
    if (stockIds && !stockIds.includes(s)) E(u.id, `stocks 的「${s}」不是館外股票`);
    if (seen.has(s)) E(u.id, `股票「${s}」已經掛在「${seen.get(s)}」底下了`); else seen.set(s, u.id);
  }
  // NPC 的隸屬
  const used = new Set();
  npcs.forEach((n, i) => {
    if (!isObj(n)) return;
    const w = "content/npc/" + (n.__file || "第 " + (i + 1) + " 筆");
    if (n.kind === "trace") { if (n.job != null) E(w, "劇情角色（t-）不放 job（不洩漏劇情）"); return; }
    const j = n.job;
    if (!isObj(j)) { E(w, "要有 job：{ unit, title } 或 { kind }（student、retired、free）"); return; }
    Object.keys(j).forEach(k => { if (!["unit", "title", "level", "kind"].includes(k)) E(w, `job 不認得欄位「${k}」`); });
    if (j.unit != null && j.kind != null) E(w, "job 的 unit 和 kind 只能寫一個");
    if (j.unit != null) {
      const u = byId.get(j.unit);
      if (!u) E(w, `job.unit「${j.unit}」不存在`); else { used.add(j.unit); let p = u; while (p && p.parent != null) { p = byId.get(p.parent); if (p) used.add(p.id); } if (u.kind === "story") E(w, "一般 NPC 不掛在劇情單位底下（文化部要先由 Yuga 同意）"); }
      if (typeof j.title !== "string" || !j.title.trim() || [...j.title].length > 8) E(w, "job.title 要是 1～8 字");
      if (j.level != null && (!Number.isInteger(j.level) || j.level < 1 || j.level > 5)) E(w, "job.level 要是 1～5");
    } else if (!JOB_KINDS.includes(j.kind)) E(w, `job.kind 要是 ${JOB_KINDS.join("、")}`);
  });
  // 每個集團（頂層、非劇情、非公共機構以外的）至少一位 NPC
  for (const u of byId.values()) if (u.parent == null && u.kind !== "story" && u.id !== "g-public" && !used.has(u.id)) E(u.id, "這個集團沒有任何 NPC（死單位）");
  return errs;
}
module.exports = { ROOT, UNIT_DIR, NPC_DIR, KINDS, SECTORS, JOB_KINDS, TOP_SHARE_MAX, UNIT_KEYS, readUnits, readNpcs, writeJson, checkWorld };
