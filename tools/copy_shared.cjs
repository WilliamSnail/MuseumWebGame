// 把 shared/ 複製進 functions/shared/：Cloud Functions 只上傳 functions/ 這個資料夾，規則要跟著帶上去。
// npm run emulators 會先跑；部署前 firebase.json 的 predeploy 也會跑。functions/shared/ 不進 repo（.gitignore）。
// 規則只改 shared/，不要改 functions/shared/（每次都會被蓋掉）。
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
require("./npc_pack.cjs").write(); // 館內 NPC 名單（shared/npc_roster.js）先跟上 content/npc/
const from = path.join(ROOT, "shared"), to = path.join(ROOT, "functions", "shared");
fs.mkdirSync(to, { recursive: true });
let n = 0;
for (const f of fs.readdirSync(from)) {
  if (!f.endsWith(".js")) continue;
  fs.copyFileSync(path.join(from, f), path.join(to, f));
  n++;
}
// 限時活動（決定 0041）：Functions 只拿得到 functions/ 裡的東西，所以把 content/weeks/<週>/week.json 的 events 一起打包進去。
// 每次部署（每週劇情合併就會部署）都重做一次。只放 { start, events }，不放劇情（還沒開放的劇情不能到處送）。
function eventData() {
  const dir = path.join(ROOT, "content", "weeks"), out = {};
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir).sort()) {
    const f = path.join(dir, name, "week.json");
    if (!/^\d{4}-W\d{2}$/.test(name) || !fs.existsSync(f)) continue;
    try { const wk = JSON.parse(fs.readFileSync(f, "utf8")); if (Array.isArray(wk.events) && wk.events.length) out[name] = { start: wk.start, events: wk.events }; } catch (e) { console.error("活動：讀不出來", name, e.message); }
  }
  return out;
}
fs.writeFileSync(path.join(to, "events_data.js"), "// copy_shared.cjs 產生的，不要改。content/weeks/*/week.json 的 events（給 Functions 判斷限時活動）\nexport const EVENT_WEEKS = " + JSON.stringify(eventData()) + ";\n");
// 賭場的每週收藏（決定 0042）：同一個做法。只放每週 week.json 和每天 dN.json 的 casino（storyLibrary 整理過的樣子：{ weeks, fallback }），不放劇情。
// 備用週一定要全部列進去（哪一個備用週輪到這週，是照「備用週有幾個」算的，少一個就會輪錯），沒有 casino 的放空的。
function casinoData() {
  const dir = path.join(ROOT, "content", "weeks"), out = { weeks: {}, fallback: {} };
  if (!fs.existsSync(dir)) return out;
  const pack = d => {
    const wf = path.join(d, "week.json");
    if (!fs.existsSync(wf)) return null;
    const p = { week: {}, days: {} };
    try {
      const wk = JSON.parse(fs.readFileSync(wf, "utf8"));
      if (wk.casino) p.week.casino = wk.casino;
      for (let n = 1; n <= 7; n++) {
        const df = path.join(d, "d" + n + ".json");
        if (fs.existsSync(df)) { const day = JSON.parse(fs.readFileSync(df, "utf8")); if (day.casino) p.days[n] = { casino: day.casino }; }
      }
    } catch (e) { console.error("賭場收藏：讀不出來", d, e.message); }
    return p;
  };
  for (const name of fs.readdirSync(dir).sort()) {
    const d = path.join(dir, name);
    if (/^\d{4}-W\d{2}$/.test(name)) { const p = pack(d); if (p) out.weeks[name] = p; }
    else if (name === "備用") for (const fb of fs.readdirSync(d).sort()) { if (fb === "一天") continue; const p = pack(path.join(d, fb)); if (p) out.fallback[fb] = p; }
  }
  return out;
}
fs.writeFileSync(path.join(to, "casino_week_data.js"), "// copy_shared.cjs 產生的，不要改。content/weeks 裡的 casino（給 Functions 判斷賭場的每週收藏）\nexport const CAS_WEEK_LIB = " + JSON.stringify(casinoData()) + ";\n");
// 每天的館訊和現實消息（Discord 的 /pepe-今日活動，決定 0051）：只放 { 週標題, 第幾天, board 那一行, real 的短句 }，依日期查。
// 不放書、任務、特展（劇情不能到處送）。real 只收字串、最多 3 則（壞的丟掉；檢查在 tools/week_check.cjs）。大小：每天約 200 位元組，一年約 80KB 以內
function dayData() {
  const dir = path.join(ROOT, "content", "weeks"), out = {};
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir).sort()) {
    const wf = path.join(dir, name, "week.json");
    if (!/^\d{4}-W\d{2}$/.test(name) || !fs.existsSync(wf)) continue;
    let title = "";
    try { title = String(JSON.parse(fs.readFileSync(wf, "utf8")).title || ""); } catch (e) { console.error("每天的館訊：讀不出來", name, e.message); continue; }
    for (let n = 1; n <= 7; n++) {
      const df = path.join(dir, name, "d" + n + ".json");
      if (!fs.existsSync(df)) continue;
      try {
        const d = JSON.parse(fs.readFileSync(df, "utf8"));
        if (typeof d.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue;
        const real = Array.isArray(d.real) ? d.real.filter(s => typeof s === "string" && s.trim()).slice(0, 3) : [];
        out[d.date] = { title, n, board: typeof d.board === "string" ? d.board : "", real };
        // 世界股市新聞（財報頁，shared/casino_gdp.js 的 casWorldNews）：壞的在那邊丟掉；檢查在 tools/week_check.cjs
        if (Array.isArray(d.market) && d.market.length) out[d.date].market = d.market.slice(0, 5);
        // Yuga Bot 交代的任務：只放 { id, says }（荷官那句話），不放任務種類、答案、獎勵；week 是為了拼出存檔裡的任務 id（週/任務 id）
        const g = Array.isArray(d.daily) ? d.daily.find(t => t && t.giver === "yuga" && typeof t.says === "string" && t.says.trim() && typeof t.id === "string") : null;
        if (g) { out[d.date].week = name; out[d.date].yuga = { id: g.id, says: g.says.trim().slice(0, 40) }; }
      } catch (e) { console.error("每天的館訊：讀不出來", df, e.message); }
    }
  }
  return out;
}
fs.writeFileSync(path.join(to, "day_data.js"), "// copy_shared.cjs 產生的，不要改。content/weeks 每天的館訊（board）和現實消息（real），依日期查（給 Discord 的 /pepe-今日活動）\nexport const DAY_DATA = " + JSON.stringify(dayData()) + ";\n");
// 外面世界的經濟（11-14）：content/economy.json 的 gdp（台灣最新一季 GDP 年增率），每日排劇情的排程更新，給景氣指數的外部景氣用（shared/casino_gdp.js 的 casGdpExt）。
function economyData() {
  const f = path.join(ROOT, "content", "economy.json");
  try { const d = JSON.parse(fs.readFileSync(f, "utf8")); return d.gdp ? { gdp: d.gdp } : {}; } catch (e) { console.error("economy.json：讀不出來", e.message); return {}; }
}
fs.writeFileSync(path.join(to, "economy_data.js"), "// copy_shared.cjs 產生的，不要改。content/economy.json（外面世界的景氣，給 Functions 算景氣指數）\nexport const ECONOMY = " + JSON.stringify(economyData()) + ";\n");
// 藝術市場（11-14，shared/casino_art.js）：每日特展的畫登記起來給伺服器查價（不放 svg 和畫的內容）。id 跟存檔的 P.story.works 一樣（週/畫 id），只收正式的週（備用週的 id 會變，先不賣）。
function artData() {
  const dir = path.join(ROOT, "content", "weeks"), out = {}, isDay = s => typeof s === "string" && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s);
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir).sort()) {
    if (!/^[0-9]{4}-W[0-9]{2}$/.test(name)) continue;
    for (let n = 1; n <= 7; n++) {
      const df = path.join(dir, name, "d" + n + ".json");
      if (!fs.existsSync(df)) continue;
      try {
        const d = JSON.parse(fs.readFileSync(df, "utf8"));
        if (!isDay(d.date) || !d.show || !Array.isArray(d.show.works)) continue;
        for (const w of d.show.works) {
          if (!w || typeof w.id !== "string") continue;
          const x = { date: d.date, title: typeof w.title === "string" ? w.title : "" };
          if (typeof w.frame === "string") x.frame = w.frame;
          if (w.san) x.san = w.san;
          if (w.clue) x.clue = w.clue;
          if (Number.isFinite(+w.rarity)) x.rarity = +w.rarity;
          if (w.auction) x.auction = true;
          out[name + "/" + w.id] = x;
        }
      } catch (e) { console.error("藝術市場：讀不出來", df, e.message); }
    }
  }
  return out;
}
fs.writeFileSync(path.join(to, "art_data.js"), "// copy_shared.cjs 產生的，不要改。content/weeks 每日特展的畫（id、日期、畫框、理智、線索、稀有度、名字），給藝術市場查價\nexport const ART_WORKS = " + JSON.stringify(artData()) + ";\n");
// 館內股的 NPC 劇情日（11-14，shared/casino_stock_in.js）：content/weeks/*/week.json 的 npc { store, date, name } → { 日期: { store, name } }。內容檢查在 tools/week_check.cjs
function npcData() {
  const dir = path.join(ROOT, "content", "weeks"), out = {}, isDay = s => typeof s === "string" && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s);
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir).sort()) {
    if (!/^[0-9]{4}-W[0-9]{2}$/.test(name)) continue;
    const f = path.join(dir, name, "week.json");
    if (!fs.existsSync(f)) continue;
    try {
      const w = JSON.parse(fs.readFileSync(f, "utf8")), n = w && w.npc;
      if (n && typeof n === "object" && isDay(n.date) && typeof n.store === "string") out[n.date] = { store: n.store, name: typeof n.name === "string" ? n.name : "" };
    } catch (e) { console.error("NPC 劇情日：讀不出來", f, e.message); }
  }
  return out;
}
// 預告的活動（規劃 2.8k）：week.json.fest [{ store, date, name }] → { 日期: [{ store, name }] }
// 劇情經濟事件（shared/econ_events.js）：week.json.econ [{ kind, date, level, name }] → { 日期: [{ kind, level, name }] }
function econData() {
  const dir = path.join(ROOT, "content", "weeks"), out = {}, isDay = s => typeof s === "string" && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s);
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir).sort()) {
    if (!/^[0-9]{4}-W[0-9]{2}$/.test(name)) continue;
    const f = path.join(dir, name, "week.json");
    if (!fs.existsSync(f)) continue;
    try { const w = JSON.parse(fs.readFileSync(f, "utf8")); for (const e of Array.isArray(w && w.econ) ? w.econ.slice(0, 4) : []) if (e && isDay(e.date) && typeof e.kind === "string") (out[e.date] = out[e.date] || []).push({ kind: e.kind, level: +e.level || 1, name: typeof e.name === "string" ? e.name : "" }); }
    catch (e) { console.error("劇情經濟事件：讀不出來", f, e.message); }
  }
  return out;
}
function festData() {
  const dir = path.join(ROOT, "content", "weeks"), out = {}, isDay = s => typeof s === "string" && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s);
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir).sort()) {
    if (!/^[0-9]{4}-W[0-9]{2}$/.test(name)) continue;
    const f = path.join(dir, name, "week.json");
    if (!fs.existsSync(f)) continue;
    try { const w = JSON.parse(fs.readFileSync(f, "utf8")); for (const e of Array.isArray(w && w.fest) ? w.fest.slice(0, 2) : []) if (e && isDay(e.date) && typeof e.store === "string") (out[e.date] = out[e.date] || []).push({ store: e.store, name: typeof e.name === "string" ? e.name : "" }); }
    catch (e) { console.error("預告活動：讀不出來", f, e.message); }
  }
  return out;
}
fs.writeFileSync(path.join(to, "npc_data.js"), "// copy_shared.cjs 產生的，不要改。content/weeks 的 week.json.npc（館內股的 NPC 劇情日）\nexport const NPC_DAYS = " + JSON.stringify(npcData()) + ";\nexport const FEST_DAYS = " + JSON.stringify(festData()) + ";\nexport const ECON_EVENTS = " + JSON.stringify(econData()) + ";\n");
// 館內 NPC 名單（11-14，docs/館內NPC規劃.md 步驟 3）：content/npc/*.json 整份打包成 NPC_LIST（照 id 排序）。給伺服器算行程、預算、故事線（步驟 3 以後的程式用）。
// 讀不出來或沒過 tools/npc_check.cjs 的不放進去（檢查會在 npm test 擋下來）。只放遊戲資料，不放 __file。劇情角色（kind trace）也在裡面：算人數、出價時要自己跳過 kind trace。
function npcList() {
  const dir = path.join(ROOT, "content", "npc"), out = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith(".json")) continue;
    try { const o = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); if (o && typeof o.id === "string") out.push(o); } catch (e) { console.error("NPC：讀不出來", f, e.message); }
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}
fs.writeFileSync(path.join(to, "npc_list_data.js"), "// copy_shared.cjs 產生的，不要改。content/npc/*.json（館內 NPC 名單：id、name、kind、likes、route、budget、story、arc；委託人多 note、劇情角色多 ledger）\nexport const NPC_LIST = " + JSON.stringify(npcList()) + ";\n");
fs.writeFileSync(path.join(to, "README.md"), "這個資料夾是 tools/copy_shared.cjs 從 shared/ 複製來的，不要改這裡，改 shared/。\n");
if (require.main === module) console.log(`複製了 ${n} 個規則檔到 functions/shared/`);
