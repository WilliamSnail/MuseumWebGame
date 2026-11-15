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
  const st = r.units.flatMap(u => u.stocks); assert.strictEqual(new Set(st).size, st.length, "每支股票只掛一處"); assert.strictEqual(st.length, 11, "11 支館外股票都掛了");
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
console.log(`世界經濟：${pass} 過，${fail} 沒過`); process.exit(fail ? 1 : 0);
