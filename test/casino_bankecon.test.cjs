// 銀行廳的財報頁（11-14）：node test/casino_bankecon.test.cjs（npm test 也會跑）
// 沒有日報時給 null、景氣和成長率換算、昨天發生的事、新聞照資料挑（不抽亂數，每個人看到的一樣）、壞資料不丟錯。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const J = x => JSON.stringify(x); // load() 的沙箱裡做出來的陣列原型不同，deepStrictEqual 會過不了，改比 JSON
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const D = "2026-11-14";
const house = (G, econ) => { const h = G.casHouseFix(G.casHouseNew(), D).house; if (econ !== undefined) h.econ = econ; return h; };

T("還沒有第一份日報：給 null（畫面寫「即將開放」）", G => {
  assert.strictEqual(G.casBankEcon(house(G)), null);
  assert.strictEqual(G.casBankEcon(house(G, {})), null);
  assert.strictEqual(G.casBankEcon(null), null);
  assert.strictEqual(G.casBankEcon(house(G, { b: 0.5 })), null, "沒有 day 就當沒有");
});
T("有日報：景氣、每天的 GDP、成長率、昨天發生的事都帶出來", G => {
  const rows = [["餐車", "412 份"], ["21 點", "380 手"]];
  const v = G.casBankEcon(house(G, { b: 0.42, perDay: 3520000, g: 0.032, day: D, rows }));
  assert.strictEqual(v.idx, 0.42); assert.strictEqual(v.gdp, 3520000); assert.strictEqual(v.growth, 0.032);
  assert.strictEqual(J(v.report), J(rows));
  assert.ok(typeof v.news === "string" && v.news.length > 0);
});
T("景氣夾在 −1～+1；成長率沒資料當 0", G => {
  assert.strictEqual(G.casBankEcon(house(G, { b: 5, day: D })).idx, 1);
  assert.strictEqual(G.casBankEcon(house(G, { b: -5, day: D })).idx, -1);
  assert.strictEqual(G.casBankEcon(house(G, { b: 0, g: null, day: D })).growth, 0, "資料不夠 14 天：成長率 null → 0");
});
T("新聞照資料挑，同樣的資料每次一樣（不抽亂數）", G => {
  const e = { b: 0.5, g: 0.08, day: D, top: { key: "food", n: 412 } };
  const a = G.casEconNews(e), b = G.casEconNews(e);
  assert.strictEqual(a, b, "同樣的資料要給同樣的句子");
  assert.ok(a.includes("412"), "最熱鬧的那件事要寫數字");
  assert.ok(a.includes("8%"), "成長超過 5% 要寫出來");
  assert.ok(G.casEconNews({ b: -0.9, day: D }).includes("冷清"), "景氣差");
  assert.ok(G.casEconNews({ b: 0, day: D }).includes("照舊"), "景氣普通");
  assert.ok(G.casEconNews({ b: 0, day: D, frozen: true }).includes("凍結"), "預算凍結要寫");
  assert.ok(!G.casEconNews({ b: 0, day: D, g: 0.01 }).includes("前七天"), "變化不到 5% 不寫");
});
T("壞資料不丟錯", G => {
  assert.doesNotThrow(() => G.casBankEcon(house(G, { b: "x", perDay: "y", g: "z", day: D, rows: [1, ["a"], ["好", "壞"]], top: 5 })));
  const v = G.casBankEcon(house(G, { b: "x", perDay: "y", g: "z", day: D, rows: [1, ["a"], ["好", "壞"]], top: 5 }));
  assert.strictEqual(v.idx, 0); assert.strictEqual(v.gdp, 0); assert.strictEqual(v.growth, 0);
  assert.strictEqual(J(v.report), J([["好", "壞"]]), "格式不對的那幾列丟掉");
});
T("銀行廳的資料帶財報；沒有日報時是 null", G => {
  const w = G.casWalletFix(G.casWalletNew(), D);
  assert.strictEqual(G.casBankHall(w, D, house(G)).econ, null);
  const v = G.casBankHall(w, D, house(G, { b: 0.2, perDay: 100, day: D }));
  assert.ok(v.econ && v.econ.idx === 0.2);
});
T("銀行廳帶世界股市新聞：最近 3 天、新的在前、只留遊戲裡的股票、壞的丟掉", G => {
  const w = G.casWalletFix(G.casWalletNew(), D);
  const mk = (t, ref) => ({ title: t, line: "壹句話。", tone: "up", ref });
  const dd = {
    "2026-11-09": { market: [mk("最舊", ["handbrain"])] }, "2026-11-11": { market: [mk("壹", ["greeneye", "NVDA"])] },
    "2026-11-12": { market: [mk("貳", "handbrain"), null, { title: "壞", line: 5 }, { title: "怪調", line: "x", tone: "boom" }] },
    "2026-11-13": { market: [mk("參", ["nightindex"])] }, "2026-11-14": { market: [mk("明天的", [])] }, "2026-11-10": { board: "沒有 market" },
  };
  const v = G.casBankHall(w, "2026-11-13", house(G), 0, false, dd).world;
  assert.strictEqual(J(v.days.map(d => d.day)), J(["2026-11-13", "2026-11-12", "2026-11-11"]), "最近 3 天、不放未來");
  assert.strictEqual(v.days[0].items[0].refs[0].name, "夜光科技指數");
  assert.strictEqual(v.days[1].items.length, 2, "壞的丟掉");
  assert.strictEqual(v.days[1].items[1].tone, "flat", "不認得的 tone 變 flat");
  assert.strictEqual(v.days[2].items[0].refs.length, 1, "不在遊戲裡的 id 丟掉");
  assert.strictEqual(G.casBankHall(w, D, house(G)).world.days.length, 0, "沒給資料就是空的");
  assert.strictEqual(G.casBankHall(w, "2026-12-20", house(G), 0, false, dd).world.days.length, 0, "太久以前的不放");
});
console.log(`casino_bankecon.test：${pass} 過，${fail} 沒過`);
if (fail) process.exit(1);
