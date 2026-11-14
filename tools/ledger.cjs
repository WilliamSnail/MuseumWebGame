// 劇情帳本的小工具（翊文 11-14：「看看給每日劇情排程的需不需要優化，有沒有腳本之類的讓他方便使用」）
// 帳本 content/story/帳本.json 有 13 萬多字，排程每天整份讀、手改 JSON、整份重寫（日誌每天寫「帳本用 indent 2 重寫」）。
// 這個工具讓排程只看今天要用的那幾段、壹次改壹個欄位，不用整份讀進來：
//   npm run ledger -- today [--date 2026-11-17]   今天要看的：主旨、這季這章、這週 weeks、還沒收的伏筆、所有提到這週的東西
//   npm run ledger -- get weeks.2026-W47.hooks     印某壹段（路徑用點；陣列可以用數字，或 id，例如 foreshadow.f-page）
//   npm run ledger -- set weeks.2026-W47.question "……"   設某壹段（值能當 JSON 讀就當 JSON，例如 true、[…]、{…}；不然當字串）
//   npm run ledger -- push weeks.2026-W47.hooks "d3：……"  往陣列尾巴加壹筆（陣列不存在就建）
//   npm run ledger -- keys revealBeats.list        列下壹層有哪些鍵（陣列列 id）
// 寫回去照原本的格式（JSON、縮排 2、結尾沒有換行），git diff 只看得到改的那段。寫完印出改後的那段。
const fs = require("fs"), path = require("path");
const FILE = path.join(__dirname, "..", "content", "story", "帳本.json");

// 路徑「a.b.0.f-page」：陣列裡先試數字，再找 id 相同的那筆
function walk(root, parts, create) {
  let cur = root;
  for (let i = 0; i < parts.length; i++) {
    const k = parts[i];
    if (Array.isArray(cur)) {
      const n = /^\d+$/.test(k) ? Number(k) : cur.findIndex(x => x && x.id === k);
      if (n < 0 || n >= cur.length) throw new Error(`找不到：${parts.slice(0, i + 1).join(".")}`);
      if (i === parts.length - 1) return { parent: cur, key: n };
      cur = cur[n];
    } else if (cur && typeof cur === "object") {
      if (i === parts.length - 1) return { parent: cur, key: k };
      if (!(k in cur)) { if (!create) throw new Error(`找不到：${parts.slice(0, i + 1).join(".")}`); cur[k] = {}; }
      cur = cur[k];
    } else throw new Error(`走不下去：${parts.slice(0, i).join(".")} 不是物件或陣列`);
  }
  return { parent: null, key: null, value: cur };
}
const split = p => String(p || "").split(".").filter(Boolean);
function get(root, p) { const parts = split(p); if (!parts.length) return root; const w = walk(root, parts, false); return w.parent[w.key]; }
function parseVal(s) { try { return JSON.parse(s); } catch (e) { return s; } }
function set(root, p, v) { const w = walk(root, split(p), true); w.parent[w.key] = v; return w.parent[w.key]; }
function push(root, p, v) {
  const parts = split(p), w = walk(root, parts, true);
  if (w.parent[w.key] == null) w.parent[w.key] = [];
  if (!Array.isArray(w.parent[w.key])) throw new Error(`${p} 不是陣列`);
  w.parent[w.key].push(v);
  return w.parent[w.key];
}
// 今天要看的：只挑跟這週有關的，其他不印（純函式，測試用）
function today(L, week, prevWeek) {
  const out = [];
  const add = (title, v) => { if (v !== undefined && v !== null && !(Array.isArray(v) && !v.length)) out.push([title, v]); };
  add("主線的主旨 main.theme", L.main && L.main.theme);
  const seasons = (L.main && L.main.seasons) || [];
  const season = seasons.find(s => JSON.stringify(s).includes(`"${week}"`));
  if (season) {
    const { chapters, ...rest } = season;
    add("這季 main.seasons（不含別週的章）", rest);
    add("這週那章", (chapters || []).filter(c => JSON.stringify(c).includes(`"${week}"`)));
  }
  add(`這週 weeks.${week}`, L.weeks && L.weeks[week]);
  if (prevWeek && !(L.weeks && L.weeks[week])) add(`上週 weeks.${prevWeek}（這週還沒寫，先接上週的鉤子）`, L.weeks && L.weeks[prevWeek] && { hooks: L.weeks[prevWeek].hooks, question: L.weeks[prevWeek].question, motifs: L.weeks[prevWeek].motifs });
  add("還沒收的伏筆 foreshadow（closed 不是 true）", (L.foreshadow || []).filter(f => !f.closed));
  // 其他大段：只印提到這週的那幾筆
  for (const [key, arrPath] of [["seasonal", "lines"], ["mysteries", "list"], ["newsThreads", "list"], ["revealBeats", "list"], ["sideArcs", null], ["calendar", null], ["lines", null]]) {
    const base = L[key]; if (!base) continue;
    const arr = arrPath ? base[arrPath] : base;
    if (!Array.isArray(arr)) continue;
    const hit = arr.filter(x => JSON.stringify(x).includes(week));
    add(`${key}${arrPath ? "." + arrPath : ""} 提到 ${week} 的`, hit);
  }
  if (L.newsThreads && L.newsThreads.rule) add("newsThreads.rule（選戰線的規則，寫政治梗前看）", L.newsThreads.rule);
  return out;
}
function load() { return JSON.parse(fs.readFileSync(FILE, "utf8")); }
function save(L) { fs.writeFileSync(FILE, JSON.stringify(L, null, 2)); } // 原檔就是縮排 2、結尾沒有換行：git diff 只看得到改的那段
const show = v => typeof v === "string" ? v : JSON.stringify(v, null, 2);

module.exports = { get, set, push, today, parseVal, walk };
if (require.main === module) {
  const a = process.argv.slice(2), cmd = a[0];
  try {
    if (cmd === "today") {
      const { load: loadShared } = require("../test/load_shared.cjs"), G = loadShared();
      const i = a.indexOf("--date"), date = i >= 0 ? a[i + 1] : G.taipeiDay(Date.now());
      const week = G.isoWeek(date), prev = G.isoWeek(G.addDays(G.isoMonday(week), -7));
      console.log(`帳本：今天 ${date}，${week}。只印跟這週有關的；要看別的用 npm run ledger -- get <路徑>\n`);
      for (const [t, v] of today(load(), week, prev)) console.log(`【${t}】\n${show(v)}\n`);
    } else if (cmd === "get") console.log(show(get(load(), a[1])));
    else if (cmd === "keys") { const v = get(load(), a[1]); console.log(Array.isArray(v) ? v.map((x, i) => (x && x.id) || i).join("\n") : Object.keys(v || {}).join("\n")); }
    else if (cmd === "set" || cmd === "push") {
      if (a.length < 3) throw new Error(`用法：npm run ledger -- ${cmd} <路徑> <值>`);
      const L = load(), v = parseVal(a.slice(2).join(" "));
      const r = cmd === "set" ? set(L, a[1], v) : push(L, a[1], v);
      save(L); console.log(`改好了 ${a[1]}：\n${show(r)}`);
    } else {
      console.log("用法：npm run ledger -- today | get <路徑> | keys <路徑> | set <路徑> <值> | push <路徑> <值>（看 tools/ledger.cjs 開頭）");
      process.exit(cmd ? 1 : 0);
    }
  } catch (e) { console.error("✗ " + e.message); process.exit(1); }
}
