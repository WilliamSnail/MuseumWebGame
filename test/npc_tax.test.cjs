// 營業稅、娛樂稅（決定 0111）：node test/npc_tax.test.cjs（npm test 也會跑）
// NPC、散客的門票收娛樂稅 5%、店裡的花費收營業稅 5%（牌桌不收）：內含，外面世界付的錢不變，政府先拿，店家和預算池、館方帳少收；帳守恆。
const assert = require("assert");
const fs = require("fs");
const { load } = require("./load_shared.cjs");
const G = load(); G.setRng(G.mulberry32(3));
const add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const list = fs.readdirSync(__dirname + "/../content/npc").filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(__dirname + "/../content/npc/" + f, "utf8")));
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const D0 = "2026-11-16", N = 20;
const h = G.casHouseFix(G.casHouseNew(), D0).house, w = G.casWalletFix(G.casWalletNew(), D0);
const op = G.casBookOpening(G.casBookSnap([w], h, 0, D0));
const gov0 = h.gov; 
for (let i = 0; i < N; i++) { G.casHouseFix(h, add(D0, i)); G.casNpcSpend(h, add(D0, i), "t" + i, list, null); }
const wf = h.led.world, biz = -wf.bizTax, ent = -wf.entTax;
T("政府帳收到營業稅和娛樂稅，數字等於外面世界付出去的稅", () => {
  assert.ok(biz > 0 && ent > 0, `biz ${biz} ent ${ent}`);
  assert.strictEqual(h.gov - gov0, biz + ent, "政府帳 ＝ 兩種稅");
});
T("稅率大約 5%：店裡（不含牌桌）和門票各自", () => {
  const shop = ["npcFood", "npcJob", "npcCellar", "npcCraft"].reduce((s, k) => s - (wf[k] || 0), 0) + biz;
  const tk = ["npcTicketBudget", "npcTicketMuseum", "npcCrowdBudget", "npcCrowdMuseum"].reduce((s, k) => s - (wf[k] || 0), 0) + ent;
  assert.ok(Math.abs(biz / shop - 0.05) < 0.01, `營業稅 ${(biz / shop * 100).toFixed(2)}%`);
  assert.ok(Math.abs(ent / tk - 0.05) < 0.01, `娛樂稅 ${(ent / tk * 100).toFixed(2)}%`);
});
T("牌桌（npcBj）不課營業稅：把牌桌算進去，稅率會低於 5%", () => {
  assert.ok((wf.npcBj || 0) < 0, "有牌桌的花費");
  const all = ["npcFood", "npcBj", "npcJob", "npcCellar", "npcCraft"].reduce((s, k) => s - (wf[k] || 0), 0) + biz;
  assert.ok(biz / all < 0.0495, `含牌桌 ${(biz / all * 100).toFixed(2)}%`);
});
T("帳守恆：全館總量對得上", () => {
  assert.strictEqual(G.casBookGap(G.casBookSnap([w], h, 0, add(D0, N)), op), 0);
});
console.log(`npc_tax.test：${pass} 過，${fail} 沒過`); process.exit(fail ? 1 : 0);
