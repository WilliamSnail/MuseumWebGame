// 交代人互動台詞的檢查：node tools/check/givers_check.cjs（npm test 會跑）
// 檢查 content/givers/<id>.json（規劃在 docs/規劃/交代人互動規劃.md，決定 0151）。
// 規矩：id 要在帳本 taskGivers.list、檔名＝id；每句 40 字內；不放英文字母（只有 yuga 的 R）和阿拉伯數字；
//   畫面上的字用「壹」不用「一」；不寫贏輸賺賠、不催、不叫人掏錢；不碰謎底（規劃第 5 節的字）；
//   每個時段要有閒聊，不在的時段要有字條；稱呼四級都要有。
// 別的檔可以 require：checkGivers({ givers, ledger })
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const DIR = path.join(ROOT, "content", "givers");
const LEDGER = path.join(ROOT, "content", "story", "帳本.json");
const MAX = 40;
const NAME_MAX = 8; // 代入 {name} 時，名字最長算幾個字
const SLOTS = ["morning", "noon", "evening", "night"];
const NOPE = ["贏", "輸", "賺", "賠", "掏錢", "趕快", "快點", "最後機會", "別錯過", "再來", "多玩", "加碼", "下注", "梭哈", "連贏", "手氣"];
// 規劃第 5 節：撥款信那條線和後面的季才揭的事
const SPOILERS = ["池子", "水位", "門檻", "名牌", "文化部", "收走", "請離開", "請跟我來", "會計", "排隊", "警衛", "水閘", "交接", "下壹位館長", "總帳", "別的館", "120", "禮包"];
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const len = s => [...String(s)].length;

function readGivers(dir = DIR) {
  const givers = [], bad = [];
  if (!fs.existsSync(dir)) return { givers, bad };
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith(".json")) continue;
    try { const o = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); o.__file = f; givers.push(o); } catch (e) { bad.push(`content/givers/${f}：JSON 讀不了（${e.message}）`); }
  }
  return { givers, bad };
}

function checkGivers({ givers = [], bad = [], ledger = null } = {}) {
  const errors = bad.slice();
  const E = (w, m) => errors.push(`${w}：${m}`);
  const ids = new Set(((ledger && ledger.taskGivers && ledger.taskGivers.list) || []).map(g => g.id));
  const seen = new Set();
  const line = (w, s, id) => {
    if (typeof s !== "string" || !s.trim()) return E(w, "要有字");
    const t = s.replace(/\{name\}/g, "名".repeat(NAME_MAX));
    if (len(t) > MAX) E(w, `太長了（${len(t)} 字，最多 ${MAX}）`);
    if (s.includes("一")) E(w, "畫面上的字用「壹」，不要用「一」");
    const u = id === "yuga" ? s.replace(/R/g, "阿") : s;
    if (/[A-Za-z]/.test(u.replace(/\{name\}/g, ""))) E(w, "不要有英文字母（只有 yuga 可以寫 R）");
    if (/[0-9]/.test(s)) E(w, "不要有阿拉伯數字");
    const n = NOPE.find(x => s.includes(x)); if (n) E(w, `不能寫「${n}」（不寫贏輸賺賠、不催、不叫人掏錢）`);
    const p = SPOILERS.find(x => s.includes(x)); if (p) E(w, `不能寫「${p}」（撥款信那條線、後面才揭的事）`);
  };
  const list = (w, a, min, id) => { if (!Array.isArray(a)) return E(w, "要是陣列"); if (a.length < min) E(w, `至少 ${min} 句（現在 ${a.length}）`); a.forEach((s, i) => line(`${w}[${i}]`, s, id)); };
  for (const g of givers) {
    const w = `content/givers/${g.__file || g.id}`;
    if (!g.id || !ids.has(g.id)) E(w, `id「${g.id}」不在帳本 taskGivers.list`);
    if (g.__file && g.__file !== `${g.id}.json`) E(w, "檔名要跟 id 一樣");
    if (seen.has(g.id)) E(w, "id 重複"); seen.add(g.id);
    if (!isObj(g.call)) E(w, "要有 call（稱呼四級 0～3）");
    else for (const lv of [0, 1, 2, 3]) { const c = g.call[lv]; line(`${w}.call.${lv}`, c, g.id); if (typeof c === "string" && len(c) > 12) E(`${w}.call.${lv}`, "稱呼最多 12 字"); }
    const c = g.chat;
    if (!isObj(c)) { E(w, "要有 chat"); continue; }
    const away = isObj(g.away) ? g.away : {};
    for (const s of SLOTS) {
      if ((c[s] || []).length) list(`${w}.chat.${s}`, c[s], 3, g.id);
      else if (!(away[s] || []).length) E(`${w}.chat.${s}`, "這個時段沒有閒聊，也沒有字條（away）");
    }
    for (const s of Object.keys(away)) { if (!SLOTS.includes(s)) E(`${w}.away.${s}`, `時段只能是 ${SLOTS.join("、")}`); else list(`${w}.away.${s}`, away[s], 2, g.id); }
    list(`${w}.chat.annoyed`, c.annoyed, 3, g.id);
    list(`${w}.chat.lowSan`, c.lowSan, 3, g.id);
    list(`${w}.chat.named`, c.named, 3, g.id);
    if (!isObj(c.yesterday)) E(`${w}.chat.yesterday`, "要有 yesterday：task、visit、gift");
    else for (const k of ["task", "visit", "gift"]) list(`${w}.chat.yesterday.${k}`, c.yesterday[k], 1, g.id);
  }
  for (const id of ids) if (givers.length && !seen.has(id)) E("content/givers", `帳本有交代人「${id}」，但沒有 ${id}.json`);
  return { errors };
}

module.exports = { checkGivers, readGivers, SLOTS };

if (require.main === module) {
  const ledger = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  const { givers, bad } = readGivers();
  const r = checkGivers({ givers, bad, ledger });
  if (r.errors.length) { console.log(r.errors.map(e => "✗ " + e).join("\n")); process.exit(1); }
  console.log(`交代人台詞：${givers.length} 位，都過`);
}
