// 劇情帳本的小工具（翊文 11-14：「看看給每日劇情排程的需不需要優化，有沒有腳本之類的讓他方便使用」）
// 帳本 content/story/帳本.json 有 13 萬多字，排程每天整份讀、手改 JSON、整份重寫（日誌每天寫「帳本用 indent 2 重寫」）。
// 這個工具讓排程只看今天要用的那幾段、壹次改壹個欄位，不用整份讀進來：
//   npm run ledger -- today [--date 2026-11-17]   今天要看的：主旨、這季這章、這週 weeks、還沒收的伏筆、每條長篇支線的下壹段、所有提到這週的東西
//   npm run ledger -- get weeks.2026-W47.hooks     印某壹段（路徑用點；陣列可以用數字，或 id，例如 foreshadow.f-page）
//   npm run ledger -- set weeks.2026-W47.question "……"   設某壹段（值能當 JSON 讀就當 JSON，例如 true、[…]、{…}；不然當字串）
//   npm run ledger -- push weeks.2026-W47.hooks "d3：……"  往陣列尾巴加壹筆（陣列不存在就建）
//   npm run ledger -- keys revealBeats.list        列下壹層有哪些鍵（陣列列 id）
//   npm run ledger -- range 2026-11-19 2026-12-02    這段日期跨到的每壹週：weeks、主線那章、揭露、謎題線索、伏筆、日曆、新聞線（11-19：延伸劇情要排「這兩週」時不用整份讀）
//   npm run ledger -- about m-capital               壹個 id（謎題、支線、角色、伏筆、地點…）本身，加上帳本裡所有提到它的地方（路徑＋那壹筆）
// 每天固定要回填的欄位，壹次做完（11-16 每日排程優化：以前壹次排程要十幾次 ledger 呼叫，還常漏）：
//   npm run ledger -- reveal b01=c-a,c-b b24=c-x [--date D] [--clues c-a,c-b]
//        揭露放完：那幾筆 revealBeats 改 revealed、revealedOn＝那天、clues＝那天 dN.json 放的 clue id（預設全部；同壹天有兩筆揭露時，用 b01=c-a,c-b 各自指定；--clues 是全部都套同壹串）；
//        mysteries 對應那條謎的線索補上「已放」（沒有就新增壹筆）。那天一定要是那筆 beat 的那壹週
//   npm run ledger -- written [--date D]
//        季節線那章的 written、主線 main.seasons 那章的 written（填書的 id，例如 2026-W47/7main）、回聲週週日的 main.units[].written，
//        從那天的書（line 掛哪條）自動找。已經填過的不動
//   npm run ledger -- day [--date D] [--hook 文字] [--ties 文字] [--meme 文字] [--world 文字] [--side 文字] [--touched st-count,st-outside]
//        今天那幾行壹起寫：hooks、ties、memes、world、sideRefs 各加壹行「dN：…」（文字沒寫 dN： 會自動補；已經有 dN： 的那行會被換掉，重跑不會變兩行）、
//        subthemes.touched.dN；然後自動跑 written，今天是揭露日就自動跑 reveal。印出做了什麼
//   npm run ledger -- apply 檔案.json
//        壹次吃壹串 [{ "set": "路徑", "value": … }, { "push": "路徑", "value": … }]，只讀寫壹次帳本
// 寫回去照原本的格式（JSON、縮排 2、結尾沒有換行），git diff 只看得到改的那段。寫完印出改後的那段。
const fs = require("fs"), path = require("path");
const FILE = path.join(__dirname, "..", "..", "content", "story", "帳本.json");

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
  { const u = ((L.main && L.main.units) || []).find(x => x && Array.isArray(x.weeks) && x.weeks.includes(week)); if (u) { const { tell, ...rest } = u; add(`這週在第 ${u.no} 段「${u.title}」的第 ${week === u.weeks[0] ? "1（揭露週）" : "2（回聲週，要做這壹段的進展）"} 週 main.units`, Object.assign({ tell }, rest)); } }
  add(`這週 weeks.${week}`, L.weeks && L.weeks[week]);
  // 延伸世界（翊文 11-22）：這週的類（物／人／規矩／你）、三個去處、人物線旁證（只能用 audit 審過的）
  if (L.extend && L.extend.weeks && L.extend.weeks[week]) { const xw = L.extend.weeks[week]; add(`延伸世界 extend.weeks.${week}（這週的類、三個去處、要放的人物線；規則看 extend.規則）`, Object.assign({}, xw, { threads: (L.extend.threads || []).filter(t => (xw.threads || []).includes(t.id)) })); }
  if (prevWeek && !(L.weeks && L.weeks[week])) add(`上週 weeks.${prevWeek}（這週還沒寫，先接上週的鉤子）`, L.weeks && L.weeks[prevWeek] && { hooks: L.weeks[prevWeek].hooks, question: L.weeks[prevWeek].question, motifs: L.weeks[prevWeek].motifs });
  add("還沒收的伏筆 foreshadow（closed 不是 true）", (L.foreshadow || []).filter(f => !f.closed));
  // 其他大段：只印提到這週的那幾筆
  // 長篇支線：每條都列（條數少），只給走到哪、下壹段要寫什麼；排程照這個挑這週推哪壹兩條（11-15：之前 sideArcs 是 { 說明, list }，被下面那段略過了）
  const arcs = L.sideArcs && Array.isArray(L.sideArcs.list) ? L.sideArcs.list : [];
  add("長篇支線 sideArcs（走到第幾段、下壹段；挑這週推哪壹兩條，推完 set sideArcs.list.<id>.at）", arcs.map(a => ({ id: a.id, name: a.name, ties: a.ties, at: a.at, next: Array.isArray(a.stages) ? a.stages[a.at] || "（已經走完）" : null, ...(a.note ? { note: a.note } : {}) })));
  for (const [key, arrPath] of [["seasonal", "lines"], ["mysteries", "list"], ["newsThreads", "list"], ["revealBeats", "list"], ["calendar", null], ["lines", null]]) {
    const base = L[key]; if (!base) continue;
    const arr = arrPath ? base[arrPath] : base;
    if (!Array.isArray(arr)) continue;
    const hit = arr.filter(x => JSON.stringify(x).includes(week));
    add(`${key}${arrPath ? "." + arrPath : ""} 提到 ${week} 的`, hit);
  }
  if (L.newsThreads && L.newsThreads.rule) add("newsThreads.rule（選戰線的規則，寫政治梗前看）", L.newsThreads.rule);
  return out;
}
// ---------- 每天回填（純函式，測試用；都直接改傳進來的帳本 L，回傳做了什麼的清單） ----------
const { asList, isObj, collectClues, isMainBook } = require("./day_lib.cjs");
const dayTag = n => `d${n}`;
const hasTag = (x, n) => typeof x === "string" && new RegExp(`^d${n}\\s*[：:]`).test(x.trim());
const withTag = (text, n) => hasTag(text, n) ? String(text).trim() : `${dayTag(n)}：${String(text).trim()}`;
// 陣列裡「dN：」開頭那壹行：沒有就加，有就換掉（重跑不會變兩行）
function putDayLine(L, path_, n, text) {
  const arr = (() => { try { return get(L, path_); } catch (e) { return undefined; } })(), line = withTag(text, n);
  if (!Array.isArray(arr)) { set(L, path_, [line]); return `${path_} 新增：${line}`; }
  const i = arr.findIndex(x => hasTag(x, n));
  if (i >= 0) { arr[i] = line; return `${path_} 換掉 d${n} 那行：${line}`; }
  arr.push(line); return `${path_} 加壹行：${line}`;
}
// 揭露放完：beat 改 revealed，mysteries 補線索。day 是那天的 dN.json
function revealBeat(L, beatId, day, date, n, only) {
  const beats = asList(L.revealBeats && L.revealBeats.list), b = beats.find(x => x && x.id === beatId);
  if (!b) throw new Error(`revealBeats 沒有 ${beatId}`);
  let clues = collectClues(day); if (only && only.length) clues = clues.filter(c => only.includes(c.id));
  if (!clues.length) throw new Error(`那天的檔沒有 clue 可以記（${beatId}）：先把 clue 放進書、房間或今日特展`);
  b.status = "revealed"; b.revealedOn = date;
  b.clues = [...new Set([...asList(b.clues), ...clues.map(c => c.id)])];
  const out = [`revealBeats ${beatId}：revealed、revealedOn ${date}、clues ${b.clues.join("、")}`];
  const m = asList(L.mysteries && L.mysteries.list).find(x => x && x.id === b.mystery);
  if (m) {
    if (!Array.isArray(m.clues)) m.clues = [];
    clues.forEach(c => {
      const hit = m.clues.find(x => x && typeof x.what === "string" && x.what.includes(c.id));
      if (hit) { if (!hit.what.includes("已放")) { hit.what = hit.what.replace(c.id, c.id + "，已放"); out.push(`mysteries ${m.id}：${c.id} 補「已放」`); } }
      else { m.clues.push({ week: b.week, day: dayTag(n), where: c.where, what: `${c.title || "（沒有標題）"}（${c.id}，已放）` }); out.push(`mysteries ${m.id}：新增線索 ${c.id}`); }
    });
  }
  return out;
}
// 書放進去了：季節線、主線章、回聲週週日的這壹段，把 written 填成書的 id（已經有的不動）
function fillWritten(L, week, day, wk, n) {
  const out = [], books = asList(day && day.books), id = b => `${week}/${b.id}`;
  asList(L.seasonal && L.seasonal.lines).forEach(line => asList(line && line.chapters).forEach(c => {
    if (c && c.week === week && !c.written) { const b = books.find(x => x && x.line === line.id); if (b) { c.written = id(b); out.push(`seasonal ${line.id}「${c.title}」written → ${c.written}`); } }
  }));
  const main = books.find(b => isMainBook(b, wk));
  if (main) {
    asList(L.main && L.main.seasons).forEach(se => asList(se && se.chapters).forEach(c => { if (c && c.week === week && !c.written) { c.written = id(main); out.push(`main.seasons 第 ${se.season} 季「${c.title}」written → ${c.written}`); } }));
    const u = asList(L.main && L.main.units).find(x => x && Array.isArray(x.weeks) && x.weeks[1] === week); // 回聲週（第 2 週）
    if (u && n === 7 && !u.written) { u.written = id(main); out.push(`main.units ${u.id} written → ${u.written}`); }
  }
  return out;
}
// 壹次寫今天那幾行。f：{ hook, ties, meme, world, side, touched: [] }
function fillDay(L, week, n, f) {
  const out = [], P = k => `weeks.${week}.${k}`;
  if (!L.weeks || !L.weeks[week]) throw new Error(`帳本 weeks 還沒有 ${week}（週一先寫 weeks.${week}）`);
  [["hook", "hooks"], ["ties", "ties"], ["meme", "memes"], ["world", "world"], ["side", "sideRefs"]].forEach(([k, key]) => { if (f[k]) out.push(putDayLine(L, P(key), n, f[k])); });
  if (f.touched && f.touched.length) { set(L, P(`subthemes.touched.${dayTag(n)}`), f.touched); out.push(`${P("subthemes.touched." + dayTag(n))} = ${f.touched.join("、")}`); }
  return out;
}
// 今天要記 reveal 的 beat：這週還是 planned 的，主 beat 看 weeks.<週>.beat.day（沒寫是 d3），加開的（extra）跟著同壹天
function beatsDueToday(L, week, n) {
  const rec = L.weeks && L.weeks[week], bd = rec && rec.beat && rec.beat.day ? rec.beat.day : "d3";
  return bd === dayTag(n) ? asList(L.revealBeats && L.revealBeats.list).filter(b => b && b.week === week && b.status === "planned") : [];
}
// 壹串操作壹次做完：[{ set: 路徑, value }, { push: 路徑, value }]
function applyOps(L, ops) {
  if (!Array.isArray(ops)) throw new Error('apply 的檔案要是陣列：[{ "set": "路徑", "value": … }, …]');
  return ops.map((o, i) => {
    if (!isObj(o) || (o.set === undefined) === (o.push === undefined) || o.value === undefined) throw new Error(`第 ${i + 1} 項要有 set 或 push（二選壹）和 value`);
    if (o.set !== undefined) { set(L, o.set, o.value); return `set ${o.set}`; }
    push(L, o.push, o.value); return `push ${o.push}`;
  });
}

function load() { return JSON.parse(fs.readFileSync(FILE, "utf8")); }
function save(L) { fs.writeFileSync(FILE, JSON.stringify(L, null, 2)); } // 原檔就是縮排 2、結尾沒有換行：git diff 只看得到改的那段
const show = v => typeof v === "string" ? v : JSON.stringify(v, null, 2);

// ---------- 看壹段日期、看壹個 id（11-19 翊文：「跑得有點慢，是不是缺甚麼腳本?」） ----------
// 所有「陣列型」的大段：[路徑, 陣列]
function sections(L) {
  const out = [];
  for (const k of Object.keys(L)) {
    const v = L[k];
    if (Array.isArray(v)) out.push([k, v]);
    else if (isObj(v)) for (const k2 of Object.keys(v)) if (Array.isArray(v[k2])) out.push([k + "." + k2, v[k2]]);
  }
  return out;
}
const idOf = (x, i) => (x && typeof x === "object" && x.id) || i;
// weeks：ISO 週的清單（由呼叫的人用日期算好）
function range(L, weeks) {
  const out = [];
  for (const week of weeks) {
    const blk = [];
    const add = (title, v) => { if (v !== undefined && v !== null && !(Array.isArray(v) && !v.length)) blk.push([title, v]); };
    add(`weeks.${week}`, L.weeks && L.weeks[week]);
    const seasons = (L.main && L.main.seasons) || [];
    for (const se of seasons) add("主線那章", (se.chapters || []).filter(c => JSON.stringify(c).includes(`"${week}"`)));
    for (const [path_, arr] of sections(L)) {
      if (path_ === "main.seasons") continue;
      const hit = arr.map((x, i) => [idOf(x, i), x]).filter(([, x]) => JSON.stringify(x).includes(week));
      if (!hit.length) continue;
      // 謎題只列那週的線索，不整條印（謎底留在帳本，要看用 get）
      if (path_ === "mysteries.list") add(`${path_} 這週的線索`, hit.map(([id, m]) => ({ id, q: m.q, clues: (m.clues || []).filter(c => JSON.stringify(c).includes(week)) })));
      else add(`${path_} 提到 ${week} 的`, hit.map(([, x]) => x));
    }
    out.push([week, blk]);
  }
  return out;
}
function about(L, id) {
  const self = [], refs = [];
  for (const [path_, arr] of sections(L)) arr.forEach((x, i) => {
    const s = JSON.stringify(x);
    if (x && x.id === id) self.push([`${path_}.${id}`, x]);
    else if (s.includes(`"${id}"`) || s.includes(id)) refs.push([`${path_}.${idOf(x, i)}`, x]);
  });
  for (const k of Object.keys(L)) if (isObj(L[k]) && !Array.isArray(L[k]) && L[k][id] !== undefined && !self.length) self.push([`${k}.${id}`, L[k][id]]);
  return { self, refs };
}

module.exports = { range, about, sections, get, set, push, today, parseVal, walk, putDayLine, revealBeat, fillWritten, fillDay, beatsDueToday, applyOps };
if (require.main === module) {
  const a = process.argv.slice(2), cmd = a[0];
  try {
    if (cmd === "today") {
      const { load: loadShared } = require("../../test/load_shared.cjs"), G = loadShared();
      const i = a.indexOf("--date"), date = i >= 0 ? a[i + 1] : G.taipeiDay(Date.now());
      const week = G.isoWeek(date), prev = G.isoWeek(G.addDays(G.isoMonday(week), -7));
      console.log(`帳本：今天 ${date}，${week}。只印跟這週有關的；要看別的用 npm run ledger -- get <路徑>\n`);
      for (const [t, v] of today(load(), week, prev)) console.log(`【${t}】\n${show(v)}\n`);
    } else if (cmd === "range") {
      const { load: loadShared } = require("../../test/load_shared.cjs"), G = loadShared();
      const from = a[1], to = a[2] || a[1], DAY = /^\d{4}-\d{2}-\d{2}$/;
      if (!DAY.test(from || "") || !DAY.test(to)) throw new Error("用法：range 2026-11-19 2026-12-02");
      const weeks = []; for (let d = from; d <= to; d = G.addDays(d, 1)) { const w = G.isoWeek(d); if (!weeks.includes(w)) weeks.push(w); }
      console.log(`帳本：${from}～${to}，跨 ${weeks.join("、")}。謎題只列那週的線索（謎底不印，要看用 get）\n`);
      for (const [w, blk] of range(load(), weeks)) {
        console.log(`==================== ${w} ====================`);
        if (!blk.length) console.log("（帳本裡還沒有這週的東西）\n");
        for (const [t, v] of blk) console.log(`【${t}】\n${show(v)}\n`);
      }
    } else if (cmd === "about") {
      if (!a[1]) throw new Error("用法：about <id>，例如 about m-capital");
      const { self, refs } = about(load(), a[1]);
      console.log(`帳本：${a[1]}　本身 ${self.length} 筆、提到它的 ${refs.length} 筆（含謎底的欄位照印，只在本機看，不要貼進 PR、日誌、公告）\n`);
      for (const [pth, v] of self) console.log(`【本身 ${pth}】\n${show(v)}\n`);
      for (const [pth, v] of refs) console.log(`【提到它 ${pth}】\n${show(v)}\n`);
    } else if (cmd === "get") console.log(show(get(load(), a[1])));
    else if (cmd === "keys") { const v = get(load(), a[1]); console.log(Array.isArray(v) ? v.map((x, i) => (x && x.id) || i).join("\n") : Object.keys(v || {}).join("\n")); }
    else if (cmd === "set" || cmd === "push") {
      if (a.length < 3) throw new Error(`用法：npm run ledger -- ${cmd} <路徑> <值>`);
      const L = load(), v = parseVal(a.slice(2).join(" "));
      const r = cmd === "set" ? set(L, a[1], v) : push(L, a[1], v);
      save(L); console.log(`改好了 ${a[1]}：\n${show(r)}`);
    } else if (["reveal", "written", "day", "apply"].includes(cmd)) {
      const opt = k => { const i = a.indexOf("--" + k); return i >= 0 ? a[i + 1] : undefined; };
      const L = load(), out = [];
      if (cmd === "apply") {
        if (!a[1]) throw new Error("用法：npm run ledger -- apply 檔案.json");
        out.push(...applyOps(L, JSON.parse(fs.readFileSync(a[1], "utf8"))));
      } else {
        const { load: loadShared } = require("../../test/load_shared.cjs"), G = loadShared();
        const date = opt("date") || G.taipeiDay(Date.now()), week = G.isoWeek(date), n = G.weekDayNo(date);
        const readJ = f => { const p = path.join(__dirname, "..", "..", f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null; };
        const day = readJ(`content/weeks/${week}/d${n}.json`), wk = readJ(`content/weeks/${week}/week.json`);
        if (!day) throw new Error(`content/weeks/${week}/d${n}.json 還沒寫（--date 可以指定日期）`);
        const only = opt("clues") ? opt("clues").split(",") : null;
        const doReveal = (ids, perBeat = {}) => ids.forEach(id => {
          const b = asList(L.revealBeats && L.revealBeats.list).find(x => x && x.id === id);
          if (b && b.week !== week) throw new Error(`${id} 是 ${b.week} 的揭露，不是 ${week}`);
          out.push(...revealBeat(L, id, day, date, n, perBeat[id] || only));
        });
        if (cmd === "reveal") {
          const ids = a.slice(1).filter((x, i, arr) => !x.startsWith("--") && !(i > 0 && arr[i - 1].startsWith("--")));
          if (!ids.length) throw new Error("用法：npm run ledger -- reveal b01 b24 [--date D]");
          const per = {}; ids.forEach((t, i) => { const [id, cs] = t.split("="); ids[i] = id; if (cs) per[id] = cs.split(","); });
          doReveal(ids, per);
        }
        if (cmd === "written") out.push(...fillWritten(L, week, day, wk, n));
        if (cmd === "day") {
          out.push(...fillDay(L, week, n, { hook: opt("hook"), ties: opt("ties"), meme: opt("meme"), world: opt("world"), side: opt("side"), touched: opt("touched") ? opt("touched").split(",").map(x => x.trim()).filter(Boolean) : [] }));
          out.push(...fillWritten(L, week, day, wk, n));
          const due = beatsDueToday(L, week, n);
          if (due.length && collectClues(day).length) doReveal(due.map(b => b.id));
          else if (due.length) out.push(`（今天是揭露日，但今天的檔還沒有 clue，沒記 reveal：放了再跑 ledger -- reveal ${due.map(b => b.id).join(" ")}）`);
        }
      }
      save(L); console.log(out.length ? out.map(x => "✓ " + x).join("\n") : "（沒有要改的：都已經填好了）");
    } else {
      console.log("用法：npm run ledger -- today | get <路徑> | keys <路徑> | set <路徑> <值> | push <路徑> <值> | reveal <b號…> | written | day [--hook …] | apply <檔>（看 tools/content/ledger.cjs 開頭）");
      process.exit(cmd ? 1 : 0);
    }
  } catch (e) { console.error("✗ " + e.message); process.exit(1); }
}
