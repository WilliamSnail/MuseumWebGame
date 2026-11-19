// 世界經濟的名單和腳本（決定 0086）：node test/world.test.cjs（npm test 也會跑）
// 名單檢查（兩層加總、parent、股票只掛一處、劇情單位）、NPC 的隸屬；world:unit／world:npc／world:gdp 三支腳本（在暫存資料夾裡跑，不動 repo 的檔案）。
const assert = require("assert"), fs = require("fs"), os = require("os"), path = require("path");
const L = require("../tools/world_lib.cjs"), U = require("../tools/world_unit.cjs"), N = require("../tools/world_npc.cjs"), GD = require("../tools/world_gdp.cjs"), WC = require("../tools/world_check.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 3).join("\n    ")); } };
const STOCKS = ["islandforge", "greeneye"];
const unit = (id, o = {}) => Object.assign({ id, name: id, kind: "group", parent: null, sector: "daily", share: 0.1, staff: 10, stocks: [], story: false }, o);
const npc = (id, job, o = {}) => Object.assign({ id, name: id, kind: "visitor", job }, o);
const chk = (units, npcs) => L.checkWorld({ units, npcs, stockIds: STOCKS });
const has = (errs, s) => assert.ok(errs.some(e => e.includes(s)), `要有「${s}」：` + errs.join(" | "));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "world-"));
const rd = f => JSON.parse(fs.readFileSync(f, "utf8"));

T("現在的名單全過：8 個單位、每位 NPC 有隸屬、文化部是劇情單位且不掛在集團底下", () => {
  const r = WC.run(); assert.deepStrictEqual(r.errs, []); assert.strictEqual(r.units.length, 8);
  const c = r.units.find(u => u.id === "u-culture"); assert.ok(c && c.kind === "story" && c.parent === null && c.story === true);
  assert.ok(r.npcs.filter(n => n.kind !== "trace").every(n => n.job), "每位旅客、委託人都有 job"); assert.ok(r.npcs.filter(n => n.kind === "trace").every(n => !n.job), "劇情角色沒有 job");
  const st = r.units.flatMap(u => u.stocks); assert.strictEqual(new Set(st).size, st.length, "每支股票只掛一處"); assert.strictEqual(st.length, require("./load_shared.cjs").load().OUT_STOCKS.filter(s => !s.ext).length, "（11-19 新增的 18 支 ext 不掛集團：不動集團的錢）館外股票都掛了");
});
T("好的資料：一個集團加一家公司（parent）、加總對得上", () => {
  assert.deepStrictEqual(chk([unit("g-a", { share: 0.2 }), unit("c-x", { kind: "firm", parent: "g-a", share: 0.1 })], [npc("v-a", { unit: "g-a", title: "員工" })]), []);
});
T("壞資料：parent 不存在、繞圈、子單位 share 超過父單位、頂層超過 80%", () => {
  has(chk([unit("g-a"), unit("c-x", { parent: "nope" })], [npc("v-a", { unit: "g-a", title: "員工" })]), "不存在");
  has(chk([unit("g-a", { parent: "g-b" }), unit("g-b", { parent: "g-a" })], []), "繞圈");
  has(chk([unit("g-a", { share: 0.1 }), unit("c-x", { kind: "firm", parent: "g-a", share: 0.08 }), unit("c-y", { kind: "firm", parent: "g-a", share: 0.08 })], [npc("v-a", { unit: "g-a", title: "員工" })]), "超過自己的");
  has(chk([unit("g-a", { share: 0.5 }), unit("g-b", { share: 0.5 })], [npc("v-a", { unit: "g-a", title: "員工" }), npc("v-b", { unit: "g-b", title: "員工" })]), "超過 0.8");
});
T("壞資料：id 重複、不認得的欄位、sector／kind 不對、story 不一致", () => {
  has(chk([unit("g-a"), unit("g-a")], []), "重複"); has(chk([Object.assign(unit("g-a"), { cash: 1 })], []), "不認得欄位「cash」");
  has(chk([unit("g-a", { sector: "x" })], []), "sector"); has(chk([unit("g-a", { kind: "story", sector: "story", story: false })], []), "story 要跟 kind 一致");
});
T("壞資料：股票重複掛、不存在；劇情單位不能有 parent；一般 NPC 不掛劇情單位", () => {
  has(chk([unit("g-a", { stocks: ["islandforge"] }), unit("g-b", { stocks: ["islandforge"] })], []), "已經掛在"); has(chk([unit("g-a", { stocks: ["zzz"] })], []), "不是館外股票");
  has(chk([unit("g-a"), unit("u-c", { kind: "story", sector: "story", story: true, parent: "g-a" })], []), "劇情單位不掛");
  has(chk([unit("u-c", { kind: "story", sector: "story", story: true, share: 0.02 })], [npc("v-a", { unit: "u-c", title: "員工" })]), "不掛在劇情單位");
});
T("NPC 的 job：沒有、單位不存在、unit 和 kind 一起寫、title 太長、劇情角色放了 job、集團沒有人", () => {
  const us = [unit("g-a")]; has(chk(us, [npc("v-a", undefined)]), "要有 job"); has(chk(us, [npc("v-a", { unit: "g-zz", title: "員工" })]), "不存在");
  has(chk(us, [npc("v-a", { unit: "g-a", kind: "free", title: "員工" })]), "只能寫一個"); has(chk(us, [npc("v-a", { unit: "g-a", title: "一二三四五六七八九" })]), "1～8 字");
  has(chk(us, [npc("t-a", { kind: "free" }, { kind: "trace" })]), "不放 job"); has(chk(us, [npc("v-a", { kind: "free" })]), "沒有任何 NPC");
  assert.deepStrictEqual(chk(us, [npc("v-a", { kind: "student" }), npc("v-b", { unit: "g-a", title: "員工", level: 2 })]), []);
});
T("world:unit：add／set／move／list，壞的不寫、--dry 不寫", () => {
  const d = tmp(), nd = tmp(), out = []; L.writeJson(path.join(nd, "v-a.json"), npc("v-a", { unit: "g-a", title: "員工" }));
  L.writeJson(path.join(d, "g-a.json"), unit("g-a", { share: 0.2 }));
  const run = a => U.main(a, d, nd, STOCKS, x => out.push(x));
  run(["add", "c-x", "--name", "新公司", "--sector", "daily", "--parent", "g-a", "--share", "0.1"]); const c = rd(path.join(d, "c-x.json")); assert.strictEqual(c.parent, "g-a"); assert.strictEqual(c.kind, "firm");
  assert.throws(() => run(["add", "c-y", "--name", "太大", "--sector", "daily", "--parent", "g-a", "--share", "0.15"]), /不合格/); assert.ok(!fs.existsSync(path.join(d, "c-y.json")), "壞的沒寫");
  run(["set", "g-a.share", "0.25"]); assert.strictEqual(rd(path.join(d, "g-a.json")).share, 0.25);
  run(["add", "c-z", "--name", "試試", "--sector", "daily", "--parent", "g-a", "--share", "0.01", "--dry"]); assert.ok(!fs.existsSync(path.join(d, "c-z.json")), "--dry 不寫");
  assert.throws(() => run(["move", "c-x", "--parent", "null"]), /沒有任何 NPC/); assert.strictEqual(rd(path.join(d, "c-x.json")).parent, "g-a", "變成沒人的集團，沒寫"); run(["move", "c-x", "--parent", "g-a"]);
  assert.throws(() => run(["set", "g-a.id", "g-b"]), /不能改/); assert.throws(() => run(["add", "c-x", "--name", "x", "--sector", "daily"]), /已經有了/);
  run(["list", "--tree"]); assert.ok(out.some(x => /g-a/.test(x)));
});
T("world:npc：assign 只改 job（插在 budget 後面、其他欄位不動）、劇情角色擋掉、orphans", () => {
  const d = tmp(), nd = tmp(), out = []; L.writeJson(path.join(d, "g-a.json"), unit("g-a"));
  L.writeJson(path.join(nd, "v-a.json"), { id: "v-a", name: "甲", kind: "visitor", note: "n", budget: { tier: "modest", perDay: 1 }, arc: [] }); L.writeJson(path.join(nd, "t-a.json"), { id: "t-a", name: "乙", kind: "trace" });
  const run = a => N.main(a, d, nd, STOCKS, x => out.push(x));
  run(["orphans"]); assert.ok(out.some(x => /1 位/.test(x)));
  run(["assign", "v-a", "--unit", "g-a", "--title", "員工", "--level", "2"]); const o = rd(path.join(nd, "v-a.json"));
  assert.deepStrictEqual(Object.keys(o), ["id", "name", "kind", "note", "budget", "job", "arc"]); assert.deepStrictEqual(o.job, { unit: "g-a", title: "員工", level: 2 });
  assert.throws(() => run(["assign", "t-a", "--kind", "free"]), /劇情角色/); assert.throws(() => run(["assign", "v-a", "--unit", "g-zz", "--title", "x"]), /不合格/);
  run(["assign", "v-a", "--kind", "retired"]); assert.deepStrictEqual(rd(path.join(nd, "v-a.json")).job, { kind: "retired" });
});
T("world:gdp：新一季推 history（最多 4 個）、同一季修正換最後一個、不倒退、年增率範圍、名目 GDP 變動太大要 --force", () => {
  const f = path.join(tmp(), "economy.json"), base = { gdp: { quarter: "2026Q3", yoy: 14.36, history: [12.95, 15.43, 12.93, 14.36], kind: "概估", published: "2026-10-30" } };
  fs.writeFileSync(f, JSON.stringify(base)); const log = () => {};
  GD.main(["--quarter", "2026Q4", "--yoy", "13.1", "--published", "2026-11-27", "--kind", "概估"], f, log); let g = rd(f).gdp;
  assert.deepStrictEqual(g.history, [15.43, 12.93, 14.36, 13.1]); assert.strictEqual(g.yoy, 13.1); assert.strictEqual(g.quarter, "2026Q4");
  GD.main(["--quarter", "2026Q4", "--yoy", "13.5", "--published", "2026-11-28", "--kind", "初步統計"], f, log); g = rd(f).gdp; assert.deepStrictEqual(g.history, [15.43, 12.93, 14.36, 13.5], "同一季：換掉最後一個");
  assert.throws(() => GD.main(["--quarter", "2026Q3", "--yoy", "10", "--published", "2026-12-01"], f, log), /不能倒退/);
  assert.throws(() => GD.main(["--quarter", "2027Q1", "--yoy", "45", "--published", "2027-02-01"], f, log), /−30 到 40/);
  assert.throws(() => GD.main(["--quarter", "2027Q1", "--yoy", "10", "--published", "2026-01-01"], f, log), /早/);
  assert.throws(() => GD.main(["--quarter", "2027Q1", "--yoy", "10"], f, log), /同時給/);
  GD.main(["--nominal-year", "25000000000000", "--nominal-as-of", "2026Q2", "--source", "主計總處"], f, log); g = rd(f).gdp; assert.strictEqual(g.nominalYear, 25000000000000);
  assert.throws(() => GD.main(["--nominal-year", "35000000000000"], f, log), /--force/); GD.main(["--nominal-year", "35000000000000", "--force"], f, log);
  const before = fs.readFileSync(f, "utf8"); GD.main(["--nominal-year", "35100000000000", "--dry"], f, log); assert.strictEqual(fs.readFileSync(f, "utf8"), before, "--dry 不寫");
  assert.ok(fs.readFileSync(f, "utf8").endsWith("}\n"));
});
T("world:gdp 照現在的 content/economy.json 跑（--dry）：同樣的數字沒有差異", () => {
  const e = rd(path.join(__dirname, "..", "content", "economy.json")).gdp, f = path.join(tmp(), "e.json"); fs.writeFileSync(f, JSON.stringify({ gdp: e }));
  const out = []; GD.main(["--quarter", e.quarter, "--yoy", String(e.yoy), "--published", e.published, "--dry"], f, x => out.push(x)); assert.ok(/沒有差異/.test(out.join("")));
});
const B = require("../tools/world_budget.cjs"), SM = require("../tools/world_sim.cjs"), NW = require("../tools/world_news.cjs");
const { load } = require("./load_shared.cjs");
T("world:budget：每個集團的 NPC 人數、perDay、每天最多花、撐幾天；份額太小會被擋", () => {
  const G = load({ __realMoney: true }), us = L.readUnits(), ns = L.readNpcs(), r = B.budget(G, us, ns);
  assert.ok(r.rows.length >= 9 && r.bad.length === 0, "現在的名單都撐得過 30 天：" + r.bad.join("|"));
  assert.strictEqual(r.rows.reduce((a, x) => a + x.npcs, 0), ns.filter(n => n.kind !== "trace" && n.budget && n.budget.perDay > 0).length, "每位有預算的 NPC 都算到某個集團或家計");
  assert.ok(r.rows.find(x => x.id === "u-household").npcs > 0, "沒有單位的算家計");
  const bad = B.budget(G, us.map(u => (u.id === "g-arts" ? Object.assign({}, u, { share: 0.0001 }) : u)), ns); assert.ok(bad.bad.length === 1 && /文化藝術/.test(bad.bad[0]), "份額太小：" + bad.bad.join("|"));
  assert.strictEqual(B.budget(G, us, ns, { unit: "g-daily" }).rows.length, 1); assert.strictEqual(B.budget(G, us, ns, { mult: 0.5 }).total, Math.floor(r.total / 2) + 0, "倍率 0.5：每天最多花減半（取整數）".length ? B.budget(G, us, ns, { mult: 0.5 }).total : 0);
});
T("world:sim：跑幾天、守恆、各集團出多少；--set 改數字會生效、亂寫的擋掉", () => {
  const G = load({ __realMoney: true }), ns = L.readNpcs(), r = SM.sim(G, ns, { days: 5, b: 0 });
  assert.strictEqual(r.gap, 0); assert.ok(r.spent.total > 0 && Object.keys(r.spent.byUnit).length > 0); assert.ok(r.a1.pub >= 0); assert.strictEqual(r.perDay.length, 5);
  const G2 = load({ __realMoney: true }), r2 = SM.sim(G2, ns, { days: 5, b: 0, set: ["casino.npcSpend.on=0"] }); assert.strictEqual(r2.spent.total, 0, "關掉 NPC 花錢：沒有花費");
  assert.throws(() => SM.sim(load({ __realMoney: true }), ns, { days: 1, set: ["casino.nothere.x=1"] }), /沒有/); assert.throws(() => SM.sim(load({ __realMoney: true }), ns, { days: 1, set: ["亂寫"] }), /路徑=值/);
});
T("world:news：加、檢查、數字和真實名字和預測擋掉、3～5 則、備用日不能寫、clear", () => {
  const G = load(), dir = tmp(); fs.mkdirSync(path.join(dir, "2026-W99")); const f = path.join(dir, "2026-W99", "d3.json"); fs.writeFileSync(f, JSON.stringify({ day: 3, board: "x" }, null, 2));
  fs.writeFileSync(path.join(dir, "2026-W99", "d7.json"), JSON.stringify({ day: 7, spare: true }, null, 2));
  const c = { W: G.WORLD_NEWS, stockIds: G.OUT_STOCKS.map(x => x.id), names: G.OUT_STOCKS.map(x => x.name).concat(G.IN_STOCKS.map(x => x.name)), banned: ["輝達", "買進", "會漲"] }, out = [];
  const run = a => NW.main(a.concat(["--week", "2026-W99", "--day", "3"]), dir, c, x => out.push(x));
  run(["add", "--title", "晶片店訂單多", "--line", "島上傳出壹批大單。", "--tone", "up", "--ref", "handbrain"]);
  assert.throws(() => run(["add", "--title", "有數字 10", "--line", "好", "--tone", "up"]), /數字/); assert.throws(() => run(["add", "--title", "輝達很強", "--line", "好", "--tone", "up"]), /不能寫的字/);
  assert.throws(() => run(["add", "--title", "會漲嗎", "--line", "好", "--tone", "up"]), /會漲/); assert.throws(() => run(["add", "--title", "標題", "--line", "好", "--tone", "漲"]), /tone/); assert.throws(() => run(["add", "--title", "標題", "--line", "好", "--tone", "up", "--ref", "zzz"]), /館外股票/);
  assert.throws(() => run(["add", "--title", "晶片店訂單多", "--line", "不一樣", "--tone", "flat"]), /不重複/); assert.throws(() => run(["check"]), /要 3～5 則/);
  run(["add", "--title", "車行很熱鬧", "--line", "展示間排了長長的隊。", "--tone", "up"]); run(["add", "--title", "軟體店安靜", "--line", "今天沒有新消息。", "--tone", "flat"]); run(["check"]);
  assert.strictEqual(JSON.parse(fs.readFileSync(f, "utf8")).market.length, 3); assert.ok(!fs.readFileSync(f, "utf8").endsWith(String.fromCharCode(10)), "照原本的格式（沒有結尾換行）");
  assert.throws(() => NW.main(["add", "--week", "2026-W99", "--day", "7", "--title", "標題", "--line", "好", "--tone", "up"], dir, c, () => {}), /備用/);
  const before = fs.readFileSync(f, "utf8"); run(["add", "--title", "再一則", "--line", "也很平靜。", "--tone", "flat", "--dry"]); assert.strictEqual(fs.readFileSync(f, "utf8"), before, "--dry 不寫");
  run(["clear"]); assert.ok(!("market" in JSON.parse(fs.readFileSync(f, "utf8"))));
});
const HL = require("../tools/world_health.cjs");
T("world:health／world:sim --scan／world:news draft：景氣差時科技進緊縮裁員、有下限；草稿過檢查", () => {
  const G = load({ __realMoney: true }), ns = L.readNpcs(), NT = ["casino.worldDoc.trade.wealthW=0", "casino.worldDoc.trade.loan.pct=0"] /* 決定 0119 的交易另外在 world_trade.test 測；這裡看舊的健康值規則 */, r = SM.sim(G, ns, { days: 7 * 6, b: -1, set: NT }), names = {}; L.readUnits().forEach(u => { names[u.id] = u.name; });
  const x = HL.rows(G, r.house, names), tech = x.rows.find(t => t.id === "g-island"); assert.ok(tech && ["squeeze", "layoff"].includes(tech.state), "景氣 −1：科技緊縮或裁員 " + tech.state); assert.ok(tech.mult >= G.NUM.casino.worldDoc.health.floor);
  assert.strictEqual(x.rows.find(t => t.id === "g-public").state, "normal", "公共機構是防禦型"); assert.ok(x.rows.every(t => t.mult >= 0.3 - 1e-9));
  const calm = HL.rows(load({ __realMoney: true }), SM.sim(load({ __realMoney: true }), ns, { days: 14, b: 0, set: NT }).house, names); assert.ok(calm.rows.every(t => t.state === "normal"), "景氣 0：都正常");
  const sc = SM.scan(() => load({ __realMoney: true }), ns, NT); assert.strictEqual(sc.length, 6); assert.ok(sc.every(t => t.ok), "六種組合都守恆不破產"); const lowB = sc.find(t => t.b === -1 && t.days === 90); assert.ok(lowB.minMult <= 0.31 && lowB.layoff > 0, "景氣谷底 90 天會裁員，有下限");
  assert.ok(sc.find(t => t.b === 1 && t.days === 30).perDay >= sc.find(t => t.b === -1 && t.days === 30).perDay, "景氣好時 NPC 花得比較多");
  const G2 = load({ __realMoney: true }), r2 = SM.sim(G2, ns, { days: 7 * 4, b: -1, set: NT }), dr = NW.draft(G2.whNews(r2.house, r2.house.wh.day, 14), L.readUnits(), "2026-W49", "3");
  assert.ok(dr.length >= 1 && dr.every(t => /npm run world:news -- add/.test(t.command))); const g = load(), c = { W: g.WORLD_NEWS, stockIds: g.OUT_STOCKS.map(q => q.id), names: g.OUT_STOCKS.map(q => q.name).concat(g.IN_STOCKS.map(q => q.name)), banned: require("../tools/week_check.cjs").MARKET_BANNED };
  dr.forEach(t => assert.deepStrictEqual(NW.checkItem({ title: t.title, line: t.line, tone: t.tone, ref: t.ref }, c), [], t.title + " 要過新聞檢查"));
});
const WE = require("../tools/world_events_pack.cjs"), EV = require("../tools/world_event.cjs");
T("world_events 打包跟 content/weeks 一致；world:event 加、擋、list、clear（暫存資料夾，不打包）", () => {
  assert.strictEqual(fs.readFileSync(path.join(__dirname, "..", "shared", "world_events.js"), "utf8"), WE.source(WE.events()), "shared/world_events.js 沒跟上（跑 node tools/world_events_pack.cjs）");
  const G = load(), d = tmp(); fs.mkdirSync(path.join(d, "2026-W47")); const f = path.join(d, "2026-W47", "week.json"); fs.writeFileSync(f, JSON.stringify({ week: "2026-W47", start: "2026-11-16" }, null, 2));
  const out = [], run = a => EV.main(a.concat(["--week", "2026-W47"]), d, G, x => out.push(x), false);
  run(["san", "--date", "2026-11-18", "--npc", "c-bus", "--n", "-5"]); run(["unrest", "--date", "2026-11-19", "--unit", "g-island", "--n", "8"]); run(["mood", "--date", "2026-11-20", "--n", "-10"]);
  const wk = JSON.parse(fs.readFileSync(f, "utf8")); assert.strictEqual(wk.sanEvents[0].n, -5); assert.strictEqual(wk.unrest[0].unit, "g-island"); assert.strictEqual(wk.moodEvent[0].n, -10);
  assert.throws(() => run(["san", "--date", "2026-11-18", "--npc", "c-bus", "--n", "-5"]), /同一個對象同一天/); assert.throws(() => run(["san", "--date", "2026-11-25", "--npc", "c-bus", "--n", "1"]), /這週內/);
  assert.throws(() => run(["unrest", "--date", "2026-11-19", "--unit", "u-culture", "--n", "1"]), /頂層集團/); assert.throws(() => run(["san", "--date", "2026-11-19", "--npc", "t-yuga", "--n", "1"]), /旅客或委託人/); assert.throws(() => run(["mood", "--date", "2026-11-19", "--n", "99"]), /−20～20/);
  const before = fs.readFileSync(f, "utf8"); run(["mood", "--date", "2026-11-21", "--n", "3", "--dry"]); assert.strictEqual(fs.readFileSync(f, "utf8"), before, "--dry 不寫");
  run(["list"]); assert.ok(out.some(x => /san　2026-11-18　c-bus　-5/.test(x))); run(["clear", "--kind", "san"]); assert.ok(!("sanEvents" in JSON.parse(fs.readFileSync(f, "utf8"))) && "unrest" in JSON.parse(fs.readFileSync(f, "utf8"))); run(["clear"]); assert.ok(!("unrest" in JSON.parse(fs.readFileSync(f, "utf8"))));
});
console.log(`世界經濟：${pass} 過，${fail} 沒過`); process.exit(fail ? 1 : 0);
