// 世界經濟 W3 分帳（決定 0086，shared/world.js 的 wu*）：node test/world_split.test.cjs（npm test 也會跑）
// 外面世界的錢（house.world）在帳上分成各單位、家計、公共：總和永遠等於 house.world；成長按權重分；新玩家補助從文化部出；單位名單跟 shared/world_roster.js 一致。
const assert = require("assert"), fs = require("fs"), path = require("path");
const { load } = require("./load_shared.cjs");
const pack = require("../tools/world_pack.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); G.NUM.casino.grants = []; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 3).join("\n    ")); } };
const D = "2026-11-16";
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
const mk = G => G.casHouseFix(G.casHouseNew(), D).house;

T("單位名單打包跟 content/world/units 一致、頂層比例加家計不超過 1", G => {
  assert.strictEqual(fs.readFileSync(path.join(__dirname, "..", "shared", "world_roster.js"), "utf8"), pack.source(pack.roster()), "shared/world_roster.js 沒跟上（跑 node tools/world_pack.cjs）");
  const r = G.wuRatios(); assert.ok(r.pub >= 0.1 - 1e-9, "公共至少 10%：" + r.pub); assert.ok(Math.abs(sum(r) - 1) < 1e-9, "比例加起來 1"); assert.strictEqual(r["u-household"], G.NUM.casino.worldDoc.household);
  assert.ok("u-culture" in r && "g-island" in r);
});
T("第一次分帳：照比例分外面世界的錢，總和 ＝ house.world；莊家一建就有 wu", G => {
  const h = mk(G); assert.ok(h.wu && h.wu.r); const a = G.wuAmounts(h); assert.strictEqual(sum(a), h.world);
  assert.strictEqual(a["g-daily"], Math.floor(h.world * G.wuRatios()["g-daily"])); assert.ok(a.pub >= 0);
});
T("池子進出（不指名）：每個單位照比例跟著變，總和還是 house.world", G => {
  const h = mk(G), before = G.wuAmounts(h), w0 = h.world;
  G.casHouseWorldOut(h, "npcFood", 123456789, G.NUM.casino.world); G.casHouseWorldIn(h, "bj", 1000003);
  const a = G.wuAmounts(h); assert.strictEqual(sum(a), h.world); assert.ok(h.world < w0);
  for (const id of Object.keys(before)) if (id !== "pub") assert.ok(Math.abs(a[id] / h.world - before[id] / w0) < 1e-6, id + " 比例沒變");
});
T("每天成長按權重分：景氣好時科技多拿、公共機構少拿；總和 ＝ house.world；b＝0 照比例", G => {
  const h = mk(G), a0 = G.wuAmounts(h), w0 = h.world; h.econ = { b: 0 };
  G.casWorldGrow(h, 10000000); G.wuGrow(h, 10000000); const a1 = G.wuAmounts(h); assert.strictEqual(sum(a1), h.world);
  const r = G.wuRatios(); assert.ok(Math.abs((a1["g-island"] - a0["g-island"]) - 10000000 * r["g-island"]) <= 2, "b＝0：照比例");
  const h2 = mk(G), c0 = G.wuAmounts(h2); h2.econ = { b: 1 }; G.casWorldGrow(h2, 10000000); G.wuGrow(h2, 10000000); const c1 = G.wuAmounts(h2); assert.strictEqual(sum(c1), h2.world);
  const gain = id => c1[id] - c0[id]; assert.ok(gain("g-island") / r["g-island"] > gain("g-public") / r["g-public"], "景氣好：科技（敏感）每一分比例拿得比公共機構多");
  const h3 = mk(G); h3.econ = { b: -1 }; const d0 = G.wuAmounts(h3); G.casWorldGrow(h3, 10000000); G.wuGrow(h3, 10000000); const d1 = G.wuAmounts(h3); assert.strictEqual(sum(d1), h3.world);
  assert.ok((d1["g-island"] - d0["g-island"]) / r["g-island"] < (d1["g-public"] - d0["g-public"]) / r["g-public"], "景氣差：科技拿得少");
});
T("新玩家補助從文化部出：文化部出、別的單位不動；總和不變；casCultureFund 實際接上了", G => {
  const h = mk(G), w = G.casWalletFix(null, D), S = G.NUM.casino.startChips, before = G.wuAmounts(h);
  assert.strictEqual(G.casCultureFund(w, h), S); const a = G.wuAmounts(h); assert.strictEqual(sum(a), h.world);
  assert.ok(a["u-culture"] < before["u-culture"], "文化部變少"); assert.ok(before["u-culture"] - a["u-culture"] >= S - 2, "文化部出了壹整份（它夠）：" + (before["u-culture"] - a["u-culture"]));
  for (const id of ["g-island", "g-daily", "g-finance"]) assert.ok(Math.abs(a[id] - before[id]) <= 2, id + " 沒有被動到");
});
T("文化部不夠時：它有多少出多少（不會變負），剩下的由公共出；別的單位不動；總和不變", G => {
  const h = mk(G), c0 = G.wuAmounts(h)["u-culture"], b0 = G.wuAmounts(h); h.world -= c0 * 2; const t = G.wuDebit(h, "u-culture", c0 * 2);
  assert.ok(t <= c0 + 2 && t >= c0 - 2, "出它有的：" + t + " vs " + c0); const a = G.wuAmounts(h); assert.ok(a["u-culture"] >= -2 && a["u-culture"] <= 2, "剛好用完：" + a["u-culture"]); assert.strictEqual(sum(a), h.world);
  for (const id of ["g-island", "g-daily"]) assert.ok(Math.abs(a[id] - b0[id]) <= 2, id + " 沒動"); assert.ok(a.pub < b0.pub, "公共出了剩下的");
});
T("很多次進出、成長、補助之後：總和永遠 ＝ house.world（取整數也對得上）", G => {
  const h = mk(G); h.econ = { b: 0.4 }; G.setRng(() => 0.37);
  for (let i = 0; i < 200; i++) {
    const n = 1000 + i * 7919; if (i % 3 === 0) { G.casWorldGrow(h, n); G.wuGrow(h, n); } else if (i % 3 === 1) G.casHouseWorldOut(h, "npcBj", n, G.NUM.casino.world); else { const got = G.casHouseWorldOut(h, "cultureStart", n, G.NUM.casino.world); G.wuDebit(h, "u-culture", got); }
    const a = G.wuAmounts(h); assert.strictEqual(sum(a), h.world, "第 " + i + " 次"); assert.ok(a.pub > -1000000, "公共沒有大幅變負");
  }
  G.setRng(null);
});
T("壞資料：wu 不見、r 壞掉都變回預設；不改 house.world", G => {
  const h = mk(G), w = h.world; delete h.wu; assert.strictEqual(sum(G.wuAmounts(h)), w); h.wu = { r: "x" }; assert.strictEqual(sum(G.wuAmounts(h)), w); assert.strictEqual(h.world, w);
  h.wu = { r: { "g-a": "abc", pub: 0.5 }, adj: { "g-a": "x" } }; assert.strictEqual(sum(G.wuAmounts(h)), w);
});
console.log(`世界分帳：${pass} 過，${fail} 沒過`); process.exit(fail ? 1 : 0);
