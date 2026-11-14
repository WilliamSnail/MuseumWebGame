// 館內 NPC 的內容檢查：node tools/npc_check.cjs（npm test 會跑；tools/week_check.cjs 也會呼叫）
// 檢查 content/npc/*.json：每位 NPC 一個檔，檔名＝id。格式見 content/README.md 第八節，規劃在 docs/館內NPC規劃.md。
// 規則（數字都在 shared/config.js 的 NUM.npc）：必填欄位、id 和名字不重複、地點和喜好只能用允許的、預算在那一級的範圍內而且每位不一樣、
// 沒有真人／品牌／政黨（跟週劇情壹樣的禁用字）、不破梗（帳本 mysteries 的謎底字句）、劇情角色（trace）不露臉、不帶錢。
// 別的檔可以 require 這支：checkNpc({ npcs, ledger })（test/npc_check.test.cjs 用壞資料測）。
const fs = require("fs"), path = require("path");
const { load } = require("../test/load_shared.cjs");
const G = load();
const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "content", "npc");
const NP = G.NUM.npc;
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const len = s => [...String(s).replace(/\n/g, "")].length;
const asList = v => Array.isArray(v) ? v : v ? [v] : [];

// 破梗：帳本 mysteries 的謎底（truth、understood）這些說法不能出現在 NPC 的字裡。固定的字句 ＋ 跟謎底「連續 6 個字壹樣」就擋
const SPOILERS = ["下一位館長", "下壹位館長", "下任館長", "交接", "算進去", "數的人", "水閘", "水下", "別的館", "總帳", "被載去", "推回去", "拒絕被寫", "也是多出來的", "他就是", "牠就是", "還沒算完", "在B4"];
// 劇情角色（trace）不露臉：不寫長相和出場
const FACE = ["長相", "臉", "樣子", "模樣", "眼睛", "眼神", "顏色", "露面", "現身", "親自", "走進來", "走出來", "開口說"];
const MARKS = /[\s，。、；：！？「」『』（）()\[\]【】《》…—,.;:!?"'·]/g;

function readNpc(dir = DIR) {
  const npcs = [], bad = [];
  if (!fs.existsSync(dir)) return { npcs, bad };
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith(".json")) continue;
    try { const o = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); o.__file = f; npcs.push(o); } catch (e) { bad.push(`content/npc/${f}：JSON 讀不出來（${e.message}）`); }
  }
  return { npcs, bad };
}

// npcs：readNpc 的結果；ledger：帳本（可以是 null，就不比對謎底和角色）；banned：禁用字（不給就用 week_check 的）
function checkNpc({ npcs = [], bad = [], ledger = null, banned = null, clients = null } = {}) {
  const errors = bad.slice(), warnings = [];
  const E = (w, m) => errors.push(`${w}：${m}`), W = (w, m) => warnings.push(`${w}：${m}`);
  const BAN = banned || require("./week_check.cjs").BANNED;
  const L = NP.limits;
  const mysteries = ledger && ledger.mysteries && Array.isArray(ledger.mysteries.list) ? ledger.mysteries.list : [];
  const tieIds = new Set([...mysteries.map(m => m.id), ...asList(ledger && ledger.sideArcs && ledger.sideArcs.list).map(a => a.id)].filter(Boolean));
  const truths = mysteries.flatMap(m => [m.truth, m.understood]).filter(s => typeof s === "string").map(s => s.replace(MARKS, ""));
  const grams = new Set(); truths.forEach(t => { for (let i = 0; i + 6 <= t.length; i++) grams.add(t.slice(i, i + 6)); });
  const ledgerChars = asList(ledger && ledger.characters).map(c => c && c.name);
  // 季節的節奏（11-14，翊文：「可以留，要跟每日排程整合」）：故事段 ties 到第 N 季的謎（N ≥ 2）時，日期（from）不該早於第 N−1 季的謎都收線之後（closeBy 那週的週日）。
  //   只警告、不擋：帳本說第 1 季季末就知道「多出來的在排隊」，所以第 2 季的謎早一點碰到可以，但要排程自己看過、PR 裡說一聲。
  const isoSunday = w => { const m = /^(\d{4})-W(\d{2})$/.exec(String(w || "")); if (!m) return null; const jan4 = Date.UTC(+m[1], 0, 4), dow = (new Date(jan4).getUTCDay() + 6) % 7, mon = jan4 - dow * 86400000 + (+m[2] - 1) * 7 * 86400000; return new Date(mon + 6 * 86400000).toISOString().slice(0, 10); };
  const seasonOf = {}, seasonEnd = {};
  mysteries.forEach(m => { const n = +m.season; if (!(n >= 1)) return; seasonOf[m.id] = n; const d = isoSunday(m.closeBy); if (d && (!seasonEnd[n] || d > seasonEnd[n])) seasonEnd[n] = d; });

  // 畫面上的字：壹不用一、不能有真人品牌政黨、不能有英文字母（名字例外：劇情角色的名字是帳本的）、不破梗
  const text = (w, s, max, o = {}) => {
    if (typeof s !== "string" || !s.trim()) { if (!o.optional) E(w, "要有字"); return; }
    if (max && len(s) > max) E(w, `太長了（${len(s)} 字，最多 ${max}）`);
    if (!o.legacy && s.includes("一")) E(w, "畫面上的字用「壹」，不要用「一」（決定 0001）");
    const hit = BAN.find(x => s.includes(x)); if (hit) E(w, `有禁用字「${hit}」（真人、品牌、政黨、災難…，docs/界線.md）`);
    if (!o.latin && /[A-Za-z]/.test(s.replace(/B\d/g, ""))) E(w, "不要有英文字母（品牌、別人的作品名；樓層寫 B1 可以）");
    const sp = !o.legacy && SPOILERS.find(x => s.includes(x)); if (sp) E(w, `破梗：不能寫「${sp}」（帳本 mysteries 的謎底；NPC 只能遇到痕跡、聽說）`);
    const t = o.legacy ? "" : s.replace(MARKS, ""); for (let i = 0; i + 6 <= t.length; i++) if (grams.has(t.slice(i, i + 6))) { E(w, `破梗：「${t.slice(i, i + 6)}」跟帳本的謎底字句壹樣，改成只寫看到的痕跡`); break; }
    if (o.trace) { const f = FACE.find(x => s.includes(x)); if (f) E(w, `劇情角色不露臉、不寫長相和出場：不能寫「${f}」（帳本 characters.how）`); }
  };
  const route = (w, r, o = {}) => {
    if (!isObj(r)) { E(w, "route 要是 { 地點: 權重 }"); return; }
    Object.entries(r).forEach(([k, v]) => { if (!NP.places.includes(k)) E(w, `地點「${k}」不認得（只能 ${NP.places.join("、")}）`); else if (!Number.isInteger(v) || v < 0 || v > NP.routeMax) E(w, `${k} 的權重要是 0～${NP.routeMax} 的整數`); });
    if (o.need && !Object.values(r).some(v => v > 0)) E(w, "至少要有壹個地方權重大於 0");
  };
  const likes = (w, a, o = {}) => {
    if (!Array.isArray(a) || a.length > NP.likesMax || (o.need && !a.length)) { E(w, `likes 要是 ${o.need ? 1 : 0}～${NP.likesMax} 個的陣列`); return; }
    const ok = [...NP.places, ...NP.likeThemes, ...NP.likeRarity];
    a.forEach(x => { if (!ok.includes(x)) E(w, `喜好「${x}」不認得（地點 ${NP.places.join("、")}；展廳主題 ${NP.likeThemes.join("、")}；畫的稀有度 ${NP.likeRarity.join("、")}）`); });
    if (new Set(a).size !== a.length) E(w, "喜好有重複");
  };

  const ids = new Set(), names = new Set(), perDays = new Map(), PFX = { visitor: "v-", client: "c-", trace: "t-" };
  npcs.forEach((n, i) => {
    const id = isObj(n) && typeof n.id === "string" ? n.id : "", w = `content/npc/${isObj(n) && n.__file || "第 " + (i + 1) + " 筆"}`;
    if (!isObj(n)) { E(w, "要是物件"); return; }
    const allowed = ["id", "name", "kind", "note", "ledger", "story", "likes", "route", "budget", "arc", "casino", "__file"];
    Object.keys(n).forEach(k => { if (!allowed.includes(k)) E(w, `不認得欄位「${k}」（只能 ${allowed.filter(x => x !== "__file").join("、")}）`); });
    if (!/^[a-z][a-z0-9-]{2,23}$/.test(id)) { E(w, "id 要是英文小寫、數字、-（3～24 字，開頭是字母）"); return; }
    if (n.__file && n.__file !== id + ".json") E(w, `檔名要跟 id 壹樣（${id}.json）`);
    if (ids.has(id)) E(w, `id「${id}」重複了`); ids.add(id);
    if (!NP.kinds.includes(n.kind)) { E(w, `kind 要是 ${NP.kinds.join("、")} 其中壹個`); return; }
    if (!id.startsWith(PFX[n.kind])) E(w, `${n.kind} 的 id 要用「${PFX[n.kind]}」開頭`);
    const trace = n.kind === "trace";
    text(w + ".name", n.name, L.name, { legacy: true, latin: trace });
    if (typeof n.name === "string") { if (names.has(n.name)) E(w, `名字「${n.name}」重複了（每個 NPC 都要有自己的名字）`); names.add(n.name); }
    text(w + ".story", n.story, L.story, { trace });
    if (n.kind === "client") text(w + ".note", n.note, L.note, { legacy: true, latin: true }); // 委託人的 note 是 shared/content.js CLIENTS 的原文，不改
    else if (n.note !== undefined) E(w, "note 只有委託人（client）有（原文來自 shared/content.js 的 CLIENTS）");
    if (trace) {
      if (typeof n.ledger !== "string" || (ledger && !ledgerChars.includes(n.ledger))) E(w, "劇情角色要有 ledger：帳本 characters 裡那位的名字");
    } else if (n.ledger !== undefined) E(w, "ledger 只有劇情角色（trace）有");
    likes(w + ".likes", n.likes, { need: !trace }); route(w + ".route", n.route, { need: !trace });
    if (trace && (asList(n.likes).length || Object.keys(isObj(n.route) ? n.route : {}).length)) E(w, "劇情角色不去哪裡、不喜歡什麼：likes 要空的、route 要空的（只留痕跡，不計人數）");

    // 預算：tier 的範圍；max ≤ perDay；取壹千的倍數；每位 perDay 不壹樣
    const b = n.budget, bw = w + ".budget";
    if (!isObj(b) || !NP.tiers[b.tier]) E(bw, `要寫成 { tier, perDay, max }，tier 是 ${Object.keys(NP.tiers).join("、")} 其中壹個`);
    else {
      const T = NP.tiers[b.tier];
      if (trace !== (b.tier === "none")) E(bw, trace ? "劇情角色只能是 none（不帶錢）" : "none 只給劇情角色");
      [["perDay", "壹天最多花"], ["max", "單筆最多"]].forEach(([k, label]) => {
        if (!Number.isInteger(b[k]) || b[k] < T[k][0] || b[k] > T[k][1]) E(bw, `${k}（${label}）要是 ${T[k][0]}～${T[k][1]} 的整數（${b.tier}「${T.label}」那壹級的範圍）`);
        else if (b[k] % 1000) E(bw, `${k} 要取壹千的倍數`);
      });
      if (Number.isInteger(b.perDay) && Number.isInteger(b.max) && b.max > b.perDay) E(bw, "max（單筆）不能比 perDay（壹天）多");
      if (!trace && Number.isInteger(b.perDay)) { if (perDays.has(b.perDay)) E(bw, `perDay ${b.perDay} 跟「${perDays.get(b.perDay)}」壹樣（每個 NPC 能拿的數目要不壹樣）`); else perDays.set(b.perDay, n.name); }
      Object.keys(b).forEach(k => { if (!["tier", "perDay", "max"].includes(k)) E(bw, `不認得「${k}」`); });
    }

    // 賭場打法和台詞（旅客、委託人才有；劇情角色不放）
    if (n.casino !== undefined) {
      const cw = w + ".casino", c = n.casino, CATS = ["accept", "refuse", "sit", "win", "lose", "bust", "bj", "push", "cheer", "leave"];
      if (trace) E(cw, "劇情角色不去賭場，不要寫 casino");
      else if (!isObj(c)) E(cw, "要寫成 { style, lines }");
      else {
        Object.keys(c).forEach(k => { if (!["style", "lines"].includes(k)) E(cw, `不認得「${k}」（只能 style、lines）`); });
        if (!["careful", "basic", "bold", "wild"].includes(c.style)) E(cw + ".style", "要是 careful、basic、bold、wild 其中壹個");
        if (!isObj(c.lines)) E(cw + ".lines", "要是物件");
        else {
          Object.keys(c.lines).forEach(k => { if (!CATS.includes(k)) E(cw + ".lines", `不認得「${k}」（只能 ${CATS.join("、")}）`); });
          CATS.forEach(k => {
            const a = c.lines[k];
            if (!Array.isArray(a) || a.length < 2 || a.length > 4) { E(`${cw}.lines.${k}`, "要是 2～4 句的陣列"); return; }
            a.forEach((s, i) => { if (typeof s !== "string" || !s.trim() || [...s].length > 30) E(`${cw}.lines.${k}[${i}]`, "每句要是 1～30 字的文字"); });
          });
        }
      }
    }
    if (!trace && n.casino === undefined) E(w, "旅客、委託人要有 casino（賭場打法和台詞）");

    // 故事線
    const arc = n.arc;
    if (!Array.isArray(arc) || arc.length > NP.arcMax || (!trace && !arc.length)) { E(w + ".arc", `要是 ${trace ? 0 : 1}～${NP.arcMax} 段的陣列（排程慢慢補到 3～6 段）`); return; }
    let prev = "";
    arc.forEach((s, j) => {
      const sw = `${w}.arc[${j}]`;
      if (!isObj(s)) { E(sw, "要是物件"); return; }
      Object.keys(s).forEach(k => { if (!["step", "from", "need", "text", "news", "ties", "route", "likes", "early"].includes(k)) E(sw, `不認得「${k}」（只能 step、from、need、text、news、ties、route、likes、early）`); });
      if (s.step !== j + 1) E(sw, `step 要照順序（這壹段是 ${j + 1}）`);
      if (typeof s.from !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s.from) || G.addDays(s.from, 0) !== s.from) E(sw, "from 要是日期（YYYY-MM-DD）：這壹天起才解鎖");
      else { if (prev && s.from <= prev) E(sw, "from 要比上壹段晚"); prev = s.from; }
      if (s.need !== undefined) {
        if (j === 0) E(sw, "第 1 段只看日期，不寫 need");
        else if (!isObj(s.need) || !NP.arcNeed[s.need.metric] || !Number.isInteger(s.need.n) || s.need.n < 1 || s.need.n > NP.arcNeed[s.need.metric]) E(sw + ".need", `要寫成 { metric, n }：metric 是 ${Object.keys(NP.arcNeed).map(k => `${k}（n 最多 ${NP.arcNeed[k]}）`).join("、")}；是全館的累計，不看個別玩家`);
        else if (s.need.metric === "commissions" && n.kind !== "client") E(sw + ".need", "commissions 只有委託人（client）能用");
        Object.keys(isObj(s.need) ? s.need : {}).forEach(k => { if (!["metric", "n"].includes(k)) E(sw + ".need", `不認得「${k}」`); });
      }
      text(sw + ".text", s.text, L.arcText, { trace });
      text(sw + ".news", s.news, L.arcNews, { optional: true, trace });
      if (s.ties !== undefined) {
        if (!Array.isArray(s.ties) || !s.ties.length) E(sw + ".ties", "要是陣列");
        else s.ties.forEach(t => { if (ledger && !tieIds.has(t)) E(sw + ".ties", `「${t}」不在帳本的 mysteries／sideArcs 裡`); });
        if (s.early !== undefined && (typeof s.early !== "string" || !s.early.trim() || [...s.early].length > 60)) E(sw + ".early", "early 要是壹句理由（60 字以內）：說明為什麼要比那季早碰到（排程看過、翊文同意才寫）");
        if (Array.isArray(s.ties) && typeof s.from === "string" && !s.early) s.ties.forEach(t => { const N = seasonOf[t], gate = N >= 2 ? seasonEnd[N - 1] : null; if (gate && s.from <= gate) W(sw + ".ties", `「${t}」是第 ${N} 季的謎，這段從 ${s.from} 就解鎖，比第 ${N - 1} 季收線（${gate}）還早：確定要這麼早碰到嗎？（只寫痕跡、不收；PR 裡說一聲）`); });
      }
      if (s.route !== undefined) route(sw + ".route", s.route, { need: true });
      if (s.likes !== undefined) likes(sw + ".likes", s.likes, { need: true });
      if (trace && (s.route !== undefined || s.likes !== undefined)) E(sw, "劇情角色的故事不改 route、likes");
    });
  });

  // 委託人 20 位要整批搬進來，名字和 note 不改（Yuga 寫的文字以 Yuga 的為準）
  const CL = clients || (G.CLIENTS || []);
  CL.forEach(c => { const n = npcs.find(x => x && x.kind === "client" && x.name === c.name); if (!n) E("content/npc", `委託人「${c.name}」（shared/content.js CLIENTS）還沒搬進來`); else if (n.note !== c.note) E(`content/npc/${n.__file || n.id}`, `note 要跟 CLIENTS 原文壹樣：「${c.note}」`); });
  npcs.filter(n => n && n.kind === "client" && !CL.some(c => c.name === n.name)).forEach(n => W(`content/npc/${n.__file || n.id}`, "這位委託人不在 shared/content.js 的 CLIENTS 裡（新的委託人要程式端也接上，否則委託不會用到他）"));
  // 帳本的劇情角色都要有對應的 trace
  if (ledger) ledgerChars.filter(Boolean).forEach(c => { if (!npcs.some(n => n && n.kind === "trace" && n.ledger === c)) W("content/npc", `帳本的角色「${c}」還沒有劇情角色（trace）的 NPC 檔`); });
  return { errors, warnings };
}

function main() {
  const { npcs, bad } = readNpc();
  let ledger = null; try { ledger = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "story", "帳本.json"), "utf8")); } catch (e) { bad.push(`帳本.json 讀不出來（${e.message}）`); }
  const r = checkNpc({ npcs, bad, ledger });
  r.warnings.forEach(w => console.log("警告 " + w));
  if (r.errors.length) { console.error(r.errors.join("\n")); console.error(`${r.errors.length} 個問題`); process.exit(1); }
  const k = x => npcs.filter(n => n.kind === x).length;
  console.log(`館內 NPC：${npcs.length} 位（旅客 ${k("visitor")}、委託人 ${k("client")}、劇情角色 ${k("trace")}），都過了${r.warnings.length ? `（${r.warnings.length} 個警告）` : ""}`);
}
if (require.main === module) main();
module.exports = { checkNpc, readNpc, SPOILERS, FACE, DIR };
