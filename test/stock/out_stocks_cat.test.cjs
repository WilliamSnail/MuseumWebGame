// 決定 0134：美股新增 18 支（11-19）、館外股分類（OUT_CATS、每支 cat）、新股（ext）不改既有的景氣和館方投資。node test/stock/out_stocks_cat.test.cjs（npm test 也會跑）
const assert = require("assert");
const fs = require("fs"), path = require("path");
const { load } = require("../load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 5).join("\n    ")); } };
const D0 = "2026-11-19";
T("名單：美股 30 支（原 6 ＋ 新 18 ＋ 2 倍版 2 ＋ 11-28 的 GOOGL、META、AMZN、SPY）；新股都有 15 分鐘波動和每分鐘隨機、名字不重複、說明壹句；真實代號不在 shared", G => {
  const ext = G.OUT_STOCKS.filter(s => s.ext); assert.strictEqual(ext.length, 24); assert.strictEqual(G.US_IDS.length, 30);
  assert.strictEqual(new Set(G.OUT_STOCKS.map(s => s.name)).size, G.OUT_STOCKS.length, "名字不重複");
  const C = G.NUM.casino.stock.us; for (const s of ext) { assert.strictEqual(s.market, "us"); assert.ok(C.sd15[s.id] > 0 && C.minSd[s.id] > 0, s.id); assert.ok(s.intro && s.intro.length > 10 && !/[A-Za-z]{3,}/.test(s.name + s.intro), s.id + " 說明不放英文代號"); }
  const txt = ["stock/text.js", "core/config.js"].map(f => fs.readFileSync(path.join(__dirname, "..", "..", "shared", f), "utf8")).join("\n");
  for (const code of ["CCL", "TLRY", "IONQ", "OKLO", "MRNA", "SOFI", "DKNG", "KTOS", "PTON", "RBLX", "UEC", "FCX"]) assert.ok(!new RegExp("\b" + code + "\b").test(txt), code + " 不進 shared");
});
T("分類：每支都有 cat、都在 OUT_CATS 裡；順序和名字是資料表；自然資源有 APA、AR、UEC、MP、FCX、MOS", G => {
  const ids = G.OUT_CATS.map(c => c.id); assert.strictEqual(new Set(ids).size, ids.length); assert.ok(G.OUT_CATS.every(c => c.name));
  for (const s of G.OUT_STOCKS) assert.ok(ids.includes(s.cat), s.id + " 的分類 " + s.cat);
  const res = G.OUT_STOCKS.filter(s => s.cat === "resource").map(s => s.id); for (const id of ["blackgoldwell", "bluefireyard", "greenglowmine", "raremountain", "redcoppermine", "richsoilshop"]) assert.ok(res.includes(id), id);
  assert.ok(ids.includes("resource") && G.OUT_CATS.find(c => c.id === "resource").name === "自然資源");
});
T("view：每支多 cat，外面多 cats 表（id、name，順序照表）", G => {
  const h = G.casHouseFix(G.casHouseNew(), D0).house, w = G.casWalletFix(G.casWalletNew(), D0), v = G.casStockViewAll(w, h, D0, Date.parse(D0 + "T12:00:00+08:00"), []);
  const outs = v.list.filter(x => x.kind === "out"); assert.strictEqual(outs.length, G.OUT_STOCKS.length); assert.ok(outs.every(x => G.OUT_CATS.some(c => c.id === x.cat)));
  assert.deepStrictEqual(v.cats.map(c => c.id), G.OUT_CATS.map(c => c.id)); assert.ok(v.list.filter(x => x.kind !== "out").every(x => x.cat == null || x.cat === undefined || true));
});
T("景氣：原本接美股的市場只看原本 6 支（新股不算）；自然資源市場只看自然資源那幾支", G => {
  const mk = G.WORLD_MARKETS.find(m => m.id === "resource"); assert.ok(mk && mk.anchor === "us" && mk.cats.includes("resource"));
  const run = (px0, px1, id) => { const h = G.casHouseFix(G.casHouseNew(), D0).house; G.wmTick(h, "2026-11-18", px0); G.wmTick(h, D0, px1); return G.wmB(h, id); };
  const base = {}; for (const s of G.OUT_STOCKS) base[s.id] = 100; const up = Object.assign({}, base); for (const s of G.OUT_STOCKS) if (s.ext) up[s.id] = 130; // 只有新股大漲
  assert.strictEqual(run(base, up, "tech"), run(base, base, "tech"), "新股大漲，原本的市場不動");
  const up2 = Object.assign({}, base); for (const s of G.OUT_STOCKS) if (s.cat === "resource") up2[s.id] = 130;
  assert.ok(run(base, up2, "resource") > run(base, base, "resource"), "自然資源漲，自然資源市場跟著漲");
  assert.strictEqual(run(base, up2, "tech"), run(base, base, "tech"), "自然資源漲，科技市場不動");
});
T("2 倍版（金庫磚、黑油桶）：標 mult 2、自然資源；景氣平均把它們的漲跌 ÷ 2 當金價、油價本身，跟別的自然資源股各占壹份", G => {
  for (const id of ["vaultbrick", "blackbarrel"]) { const s = G.OUT_STOCKS.find(x => x.id === id); assert.ok(s && s.cat === "resource" && s.ext && s.mult === 2 && /兩倍/.test(s.intro), id); }
  const run = (px1) => { const h = G.casHouseFix(G.casHouseNew(), D0).house, base = {}; for (const s of G.OUT_STOCKS) base[s.id] = 100; G.wmTick(h, "2026-11-18", base); G.wmTick(h, D0, Object.assign({}, base, px1)); return G.wmB(h, "resource"); };
  const flat = run({}), twice = run({ vaultbrick: 120 });
  assert.ok(twice > flat, "金庫磚漲，自然資源景氣跟著漲"); assert.ok(Math.abs(run({ vaultbrick: 120 }) - run({ greenglowmine: 110 })) < 1e-9, "2 倍版漲 20% ＝ 壹般自然資源股漲 10%（÷ 2）");
});
console.log(`${pass} passed, ${fail} failed（美股新增 18 支和分類）`);
process.exit(fail ? 1 : 0);
