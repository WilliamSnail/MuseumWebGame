// npm run tune（決定 0089）：node test/tools/tune.test.cjs（npm test 也會跑）
// 改 config.js 用 acorn 只換那個值（註解、排版不動）、型別不能變、物件不能改；unit／npc 叫現有的 world:unit／world:npc；任何壹項沒過就還原；--dry 不留下改動。
const assert = require("assert"), fs = require("fs"), os = require("os"), path = require("path");
const T = require("../../tools/dev/tune.cjs");
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 3).join("\n    ")); } };
const tmp = () => require("../tmp_dir.cjs").tmpDir("tune-");
const SRC = `// 開頭的註解
export const NUM = {
  a: 1, // 一個數字
  loan: { interestPct: 9, name: "x", on: true, neg: -3, list: [10, 20, 30] }, /* 區塊註解 */
  "weird key": { v: 5 },
  obj: { z: 1 },
};
export const OTHER = { 館員帽: { skill: 5 } };
`;
t("parseChange：三種寫法和錯誤", () => {
  assert.deepStrictEqual(T.parseChange("NUM.casino.loan.interestPct=8"), { kind: "config", root: "NUM", path: ["casino", "loan", "interestPct"], value: 8, raw: "8", text: "NUM.casino.loan.interestPct=8" });
  const u = T.parseChange("unit:g-island.share=0.12"); assert.strictEqual(u.kind, "unit"); assert.strictEqual(u.value, 0.12);
  const n = T.parseChange("npc:c-bus.job.unit=g-daily"); assert.strictEqual(n.kind, "npc"); assert.strictEqual(n.field, "job.unit"); assert.strictEqual(n.value, "g-daily");
  assert.throws(() => T.parseChange("亂寫"), /路徑=值/); assert.throws(() => T.parseChange("foo=1"), /看不懂/);
  const o = T.parseArgs(["NUM.a=1", "--dry", "--no-sim"]); assert.ok(o.dry && !o.sim && o.changes.length === 1); assert.throws(() => T.parseArgs(["--zzz"]), /沒有/);
});
t("patchConfig：只換那個值，註解和排版不動；負數、字串、布林、陣列元素、其他 export、不是 NUM 的名字", () => {
  const p = (path_, v, root = "NUM") => T.patchConfig(SRC, root, path_, v);
  const r = p(["loan", "interestPct"], 8); assert.strictEqual(r.old, 9); assert.strictEqual(r.src, SRC.replace("interestPct: 9", "interestPct: 8")); assert.ok(r.src.includes("// 一個數字") && r.src.includes("/* 區塊註解 */"));
  assert.strictEqual(p(["loan", "neg"], -7).src, SRC.replace("neg: -3", "neg: -7")); assert.strictEqual(p(["loan", "name"], "y").src, SRC.replace('name: "x"', 'name: "y"')); assert.strictEqual(p(["loan", "on"], false).src, SRC.replace("on: true", "on: false"));
  assert.strictEqual(p(["loan", "list", "1"], 99).src, SRC.replace("[10, 20, 30]", "[10, 99, 30]")); assert.strictEqual(p(["weird key", "v"], 6).src, SRC.replace("v: 5", "v: 6"));
  assert.strictEqual(p(["館員帽", "skill"], 6, "OTHER").src, SRC.replace("skill: 5", "skill: 6"));
  assert.throws(() => p(["loan", "nothere"], 1), /不存在/); assert.throws(() => p(["obj"], 1), /不是單純/); assert.throws(() => p(["loan", "interestPct"], "8"), /型別不能變/); assert.throws(() => p(["a"], NaN), /值要是/);
  assert.throws(() => p(["a"], 1, "NOPE"), /沒有 export const NOPE/); assert.throws(() => p(["a", "b"], 1), /不是物件或陣列/);
});
t("patchConfig 對真的 shared/core/config.js：NUM.casino.loan.interestPct、LIMITED_FX、NUM.casino.world.start 都找得到", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "shared", "core", "config.js"), "utf8"), r = T.patchConfig(src, "NUM", ["casino", "loan", "interestPct"], 7);
  assert.ok(typeof r.old === "number" && r.src.length === src.length + (String(7).length - String(r.old).length));
  assert.strictEqual(T.patchConfig(src, "LIMITED_FX", ["館員帽", "skill"], 6).old, 5); assert.ok(T.patchConfig(src, "NUM", ["casino", "world", "start"], 1).old > 0);
});
function ctxOf() {
  const d = tmp(), ud = path.join(d, "units"), nd = path.join(d, "npc"); fs.mkdirSync(ud); fs.mkdirSync(nd);
  const unit = { id: "g-a", name: "甲", kind: "group", parent: null, sector: "daily", share: 0.2, staff: 10, stocks: [], story: false };
  fs.writeFileSync(path.join(ud, "g-a.json"), JSON.stringify(unit, null, 2) + "\n");
  fs.writeFileSync(path.join(nd, "v-a.json"), JSON.stringify({ id: "v-a", name: "乙", kind: "visitor", budget: { tier: "modest", perDay: 100 }, job: { unit: "g-a", title: "員工" } }, null, 2) + "\n");
  const cf = path.join(d, "config.js"); fs.writeFileSync(cf, SRC);
  return { d, cf, ud, nd, ctx: { configFile: cf, unitDir: ud, npcDir: nd, rosterFile: path.join(d, "roster.js"), npcRosterFile: path.join(d, "npc_roster.js"), stockIds: [], touched: new Set() } };
}
const quiet = () => {};
const rd = f => fs.readFileSync(f, "utf8");
t("run：三種改動一起改成功；有壹項檢查沒過就全部還原；--dry 改了檢查完也還原；後面的錯了前面的也還原；模擬破產不寫", () => {
  const ok = { checks: () => [{ name: "假檢查", run: () => ({ ok: true, out: "" }) }], sim: () => ({}) }, no = { checks: () => [{ name: "假檢查", run: () => ({ ok: false, out: "壞了" }) }], sim: () => ({}) };
  const ch = ["NUM.loan.interestPct=8", "unit:g-a.share=0.15", "npc:v-a.budget.perDay=200"], opt = extra => Object.assign({ changes: ch, dry: false, full: false, sim: true, file: null }, extra);
  let s = ctxOf(); let r = T.run(opt({}), s.ctx, ok, quiet); assert.ok(r.ok); assert.ok(rd(s.cf).includes("interestPct: 8")); assert.strictEqual(JSON.parse(rd(path.join(s.ud, "g-a.json"))).share, 0.15); assert.strictEqual(JSON.parse(rd(path.join(s.nd, "v-a.json"))).budget.perDay, 200);
  s = ctxOf(); const before = [rd(s.cf), rd(path.join(s.ud, "g-a.json")), rd(path.join(s.nd, "v-a.json"))];
  r = T.run(opt({}), s.ctx, no, quiet); assert.ok(!r.ok); assert.deepStrictEqual([rd(s.cf), rd(path.join(s.ud, "g-a.json")), rd(path.join(s.nd, "v-a.json"))], before, "沒過：全部還原");
  s = ctxOf(); r = T.run(opt({ dry: true }), s.ctx, ok, quiet); assert.ok(r.ok); assert.strictEqual(rd(s.cf), SRC, "--dry：還原");
  s = ctxOf(); assert.throws(() => T.run(opt({ changes: ["NUM.loan.interestPct=8", "unit:g-a.nothere=1"] }), s.ctx, ok, quiet)); assert.strictEqual(rd(s.cf), SRC, "後面的錯了：前面的也還原");
  s = ctxOf(); r = T.run(opt({}), s.ctx, { checks: ok.checks, sim: () => ({ "景氣 0": { 沒破產: false } }) }, quiet); assert.ok(!r.ok, "模擬破產：不寫"); assert.strictEqual(rd(s.cf), SRC);
});
t("run：清單檔（# 註解、空行）和 --no-sim；沒有改動要擋", () => {
  const s = ctxOf(), f = path.join(s.d, "list.txt"); fs.writeFileSync(f, "# 註解\n\nNUM.loan.interestPct=7\nNUM.a=2\n");
  const r = T.run({ changes: [], dry: false, full: false, sim: false, file: f }, s.ctx, { checks: () => [] }, quiet); assert.ok(r.ok && r.applied.length === 2 && r.sim === null); const c = rd(s.cf); assert.ok(c.includes("interestPct: 7") && c.includes("a: 2,"));
  assert.throws(() => T.run({ changes: [], dry: false, full: false, sim: false, file: null }, s.ctx, { checks: () => [] }, quiet), /沒有要改的/);
});
t("world:npc set：型別不能變、不能改 id、沒有的欄位擋掉", () => {
  const N = require("../../tools/content/world_npc.cjs"), s = ctxOf();
  assert.strictEqual(N.main(["set", "v-a.budget.perDay", "300"], s.ud, s.nd, [], quiet).old, 100); assert.throws(() => N.main(["set", "v-a.budget.perDay", "x"], s.ud, s.nd, [], quiet), /型別不一樣/);
  assert.throws(() => N.main(["set", "v-a.id", "q"], s.ud, s.nd, [], quiet), /id 不能改/); assert.throws(() => N.main(["set", "v-a.budget.zzz", "1"], s.ud, s.nd, [], quiet), /沒有這個欄位/);
});
console.log(`tune：${pass} 過，${fail} 沒過`); process.exit(fail ? 1 : 0);
