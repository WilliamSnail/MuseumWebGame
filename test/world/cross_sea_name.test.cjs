// 決定 0139：「海外科技集團」改名「跨海科技集團」（「海外」是真實市場的帳，玩家會搞混）；只改顯示的名字，id、錢、股票都不動。node test/world/cross_sea_name.test.cjs（npm test 也會跑）
const assert = require("assert"), fs = require("fs"), path = require("path");
const { load } = require("../load_shared.cjs");
const G = load({ __realMoney: true });
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
T("單位名單和景氣市場：g-overseas 叫跨海科技集團、overseas 市場叫跨海；id 沒變、股票還是 6 支", () => {
  const u = G.WORLD_UNITS.find(x => x.id === "g-overseas"), m = G.WORLD_MARKETS.find(x => x.id === "overseas");
  assert.strictEqual(u.name, "跨海科技集團"); assert.strictEqual(m.name, "跨海"); assert.strictEqual(u.market, "overseas"); assert.strictEqual(u.stocks.length, 6);
  assert.ok(!/海外/.test(u.name + u.note + m.name + m.note), "名字和說明裡不再寫「海外」");
});
T("玩家看得到的字不再有「海外科技」「海外集團」：集團股名稱、單位名稱（程式、內容、畫面）", () => {
  assert.ok(/跨海科技集團/.test(G.gsNameOf("g-overseas")), G.gsNameOf("g-overseas")); assert.strictEqual(G.whName("g-overseas"), "跨海科技集團");
  const root = path.join(__dirname, "..", ".."), bad = [];
  const walk = (d, ok) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (!/node_modules|dist|\.git/.test(f)) walk(p, ok); } else if (ok(p) && /海外科技|海外集團/.test(fs.readFileSync(p, "utf8"))) bad.push(path.relative(root, p)); } };
  walk(path.join(root, "web", "src"), p => p.endsWith(".js")); walk(path.join(root, "shared"), p => p.endsWith(".js") && !/notices_data/.test(p)); walk(path.join(root, "content", "world"), p => p.endsWith(".json")); walk(path.join(root, "content", "npc"), p => p.endsWith(".json"));
  assert.deepStrictEqual(bad, [], "還有舊名字：" + bad.join("、"));
});
console.log(`${pass} passed, ${fail} failed（跨海科技集團）`);
process.exit(fail ? 1 : 0);
