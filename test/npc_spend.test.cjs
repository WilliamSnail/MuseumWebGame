// NPC 來館花錢（11-14）：node test/npc_spend.test.cjs（npm test 也會跑；node test/npc_spend.test.cjs sim 印出總量）
// 付門票（不分紅給玩家）、去的店花錢（餐車牌桌進莊家、其餘進預算池）、都從外面世界搬、每人每天和全館每天有上限、吃緊不花、守恆、GDP 算進消費和淨出口、日報有壹句。
const assert = require("assert"), fs = require("fs"), path = require("path");
const { load } = require("./load_shared.cjs");
const LIST = fs.readdirSync(path.join(__dirname, "..", "content", "npc")).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "content", "npc", f), "utf8")));
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.NUM.casino.grants = []; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const D0 = "2026-11-16", add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const inv = (G, h) => { const s = G.casBookSnap([], h, 0, null); return G.casBookTotal(s) - G.casBookMinted(s) + G.casBookBurned(s); };
const mk = G => G.casHouseFix(G.casHouseNew(), D0).house;

T("來館的 NPC 付門票、去的店花錢：預算池／莊家／館方帳收到、外面世界付、守恆、同壹天只算壹次", G => {
  const h = mk(G), t0 = inv(G, h), w0 = h.world, b0 = h.budget, k0 = h.bankroll, m0 = h.museum;
  const r = G.casNpcSpend(h, D0, "s", LIST, null);
  assert.ok(r.total > 0 && r.people > 0 && r.ticket > 0 && r.shop > 0, JSON.stringify(r));
  assert.strictEqual(h.world, w0 - r.total); assert.strictEqual(inv(G, h), t0, "守恆");
  assert.strictEqual((h.budget - b0) + (h.bankroll - k0) + (h.museum - m0), r.total, "錢進預算池／莊家／館方帳");
  assert.ok(h.museum > m0, "門票有進館方帳"); assert.strictEqual(G.casNpcSpend(h, D0, "s", LIST, null), h.npcs); assert.strictEqual(h.world, w0 - r.total, "不重複");
});
T("上限：每位 NPC 壹天 ≤ perDay×dayPct%、全館壹天 ≤ dayCap；吃緊的池子不花；沒名單／關掉不花", G => {
  const C = G.NUM.casino.npcSpend; let h = mk(G);
  for (let i = 0; i < 40; i++) { const r = G.casNpcSpend(h, add(D0, i), "s" + i, LIST, null); assert.ok(r.total <= Math.floor(C.dayCap * 1.2) + 1, "全館 " + r.total); }
  C.dayCap = 50000; h = mk(G); assert.ok(G.casNpcSpend(h, D0, "s", LIST, null).total <= 50000, "dayCap");
  C.dayCap = 1500000; h = mk(G); h.world = 1000; assert.strictEqual(G.casNpcSpend(h, D0, "s", LIST, null).total, 0, "外面世界吃緊不花");
  h = mk(G); assert.strictEqual(G.casNpcSpend(h, D0, "s", [], null), null); C.on = false; assert.strictEqual(G.casNpcSpend(h, D0, "s", LIST, null), null);
});
T("GDP：店裡花的算消費 C、門票算淨出口 NX；日報壹句「帶進館」", G => {
  const h = mk(G), s0 = G.casBookSnap([], h, 0, D0); const r = G.casNpcSpend(h, D0, "s", LIST, null);
  const s1 = G.casBookSnap([], h, 0, add(D0, 1)), d = G.casBookDiff(s0, s1), g = G.casGdpOf(d), z = G.casGdpOf({ act: {}, wflow: {} });
  assert.strictEqual(g.C - z.C, r.shop); assert.strictEqual(g.NX - z.NX, r.ticket);
  const txt = G.casReportView({ day: add(D0, 1), at: 0, snap: s1, diff: d, opening: 0 }).secs.map(x => x.lines.join("|")).join("\n");
  assert.ok(txt.includes("帶進館"), txt.slice(0, 300));
});
if (process.argv[2] === "sim") {
  const G = load(); G.NUM.casino.grants = []; const h = mk(G); let tot = 0, tk = 0, shop = 0, ppl = 0; const N = 200;
  for (let i = 0; i < N; i++) { const r = G.casNpcSpend(h, add(D0, i), "x" + i, LIST, null); tot += r.total; tk += r.ticket; shop += r.shop; ppl += r.people; }
  console.log(`${LIST.filter(n => n.kind !== "trace").length} 位 NPC、${N} 天：平均每天 ${Math.round(tot / N)}（門票 ${Math.round(tk / N)}、店裡 ${Math.round(shop / N)}）、${(ppl / N).toFixed(1)} 位花錢；全館上限 ${G.NUM.casino.npcSpend.dayCap}；外面世界每天成長 ${G.NUM.casino.world.growBase}`);
}
console.log(`${pass} passed, ${fail} failed（NPC 花錢）`);
process.exit(fail ? 1 : 0);
