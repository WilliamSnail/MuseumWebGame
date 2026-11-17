// 決定 0121：景氣分市場（每個市場自己的景氣、接真實台股／美股、放大、會回平均、影響來館和花錢）。node test/world_market.test.cjs（npm test 也會跑）
const assert = require("assert"), fs = require("fs"), path = require("path");
const { load } = require("./load_shared.cjs");
const MP = require("../tools/market_pack.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.NUM.casino.grants = []; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const mk = G => G.casHouseFix(G.casHouseNew(), "2026-11-16").house;
const px = (G, k) => { const o = {}; for (const s of G.OUT_STOCKS) o[s.id] = 100 * k; return o; };
T("市場名單 shared/world_markets.js 跟上 content/world/markets（跑 node tools/market_pack.cjs）", () => {
  assert.strictEqual(fs.readFileSync(path.join(__dirname, "..", "shared", "world_markets.js"), "utf8"), MP.source(MP.markets()));
});
T("每個單位都在某個市場；沒寫 market 就用 sector；名單裡沒有的當公共", G => {
  for (const u of G.WORLD_UNITS) assert.ok(G.wmDef(G.wmOfUnit(u.id)), u.id); assert.strictEqual(G.wmOfUnit("g-island"), "island"); assert.strictEqual(G.wmOfUnit("g-daily"), "daily"); assert.strictEqual(G.wmOfUnit("不存在"), "public");
});
T("同壹天不重複；同樣的輸入同樣的輸出（雜湊雜訊，不用 RNG）", G => {
  const h = mk(G), h2 = mk(G); assert.strictEqual(G.wmTick(h, "2026-11-17", px(G, 1)), true); assert.strictEqual(G.wmTick(h, "2026-11-17", px(G, 1)), false);
  G.wmTick(h2, "2026-11-17", px(G, 1)); assert.strictEqual(JSON.stringify(h.mk.b), JSON.stringify(h2.mk.b));
});
T("景氣一直在 ±1 以內、會回平均（沒有衝擊的 120 天，每個市場的平均絕對值 < 0.5）", G => {
  const h = mk(G); for (let i = 1; i <= 120; i++) { G.wmTick(h, add("2026-11-16", i), px(G, 1)); for (const d of G.WORLD_MARKETS) assert.ok(Math.abs(h.mk.b[d.id]) <= 1); }
  for (const d of G.WORLD_MARKETS) assert.ok(Math.abs(h.mk.b[d.id]) < 0.9, d.id);
});
T("真實股市大跌：接美股的科技、接台股的金融都往下；不接真實市場的文化藝術不動；之後回平均", G => {
  const h = mk(G); G.wmTick(h, "2026-11-16", px(G, 1)); for (let i = 1; i <= 10; i++) G.wmTick(h, add("2026-11-16", i), px(G, 1));
  const t0 = h.mk.b.tech, f0 = h.mk.b.finance, a0 = h.mk.b.arts; G.wmTick(h, "2026-11-27", px(G, 0.93)); // −7%
  assert.ok(h.mk.b.tech < t0 - 0.3, "科技大跌"); assert.ok(h.mk.b.finance < f0 - 0.2, "金融也跌"); assert.ok(Math.abs(h.mk.b.arts - a0) < 0.3, "文化藝術沒被真實股市拉動");
  const low = h.mk.b.tech; for (let i = 1; i <= 25; i++) G.wmTick(h, add("2026-11-27", i), px(G, 0.93)); assert.ok(h.mk.b.tech > low + 0.1, "回平均");
});
T("放大倍數 amp：1.5 比 1 反應大；單日真實漲跌夾在 realCap", G => {
  const run = amp => { const g = load(); g.NUM.casino.grants = []; g.NUM.casino.worldDoc.market.amp = amp; const h = mk(g); g.wmTick(h, "2026-11-16", px(g, 1)); g.wmTick(h, "2026-11-17", px(g, 0.97)); return h.mk.b.tech; };
  assert.ok(run(1.5) < run(1), "1.5 倍跌更多"); const g2 = load(); g2.NUM.casino.grants = []; const h = mk(g2); g2.wmTick(h, "2026-11-16", px(g2, 1)); g2.wmTick(h, "2026-11-17", px(g2, 1e-9)); assert.ok(h.mk.b.tech >= -1);
});
T("來館倍率和花錢倍率：景氣 −1 ＝ 下限 0.6／0.7，+1 ＝ 上限 1.4／1.3；0 ＝ 1；關掉 ＝ 1", G => {
  const h = mk(G); G.wmFix(h); h.mk.b.tech = -1; assert.strictEqual(G.wmVisit(h, "tech"), 0.65); h.mk.b.tech = 1; assert.strictEqual(G.wmVisit(h, "tech"), 1.35); h.mk.b.tech = 0; assert.strictEqual(G.wmVisit(h, "tech"), 1);
  const C = G.NUM.casino.worldDoc.market; h.mk.b.tech = -1; assert.ok(G.wmVisit(h, "tech") >= C.visitLo && G.wmSpend(h, "tech") >= C.spendLo); C.on = false; assert.strictEqual(G.wmVisit(h, "tech"), 1);
});
T("愛解悶的 NPC：景氣差反而多來（>1），景氣好跟別人壹樣；其他人景氣差來得少", G => {
  const h = mk(G); G.wmFix(h); const C = G.NUM.casino.worldDoc.market; C.solace = ["c-x"]; const n1 = { id: "c-x", job: { kind: "free" } }, n2 = { id: "c-y", job: { kind: "free" } };
  for (const k of Object.keys(h.mk.b)) h.mk.b[k] = -0.8; assert.ok(G.wmNpcMul(h, n1, "visit") > 1, "解悶多來"); assert.ok(G.wmNpcMul(h, n2, "visit") < 1, "別人少來");
  for (const k of Object.keys(h.mk.b)) h.mk.b[k] = 0.5; assert.strictEqual(G.wmNpcMul(h, n1, "visit"), G.wmNpcMul(h, n2, "visit"));
});
T("行程：景氣差的市場 NPC 今天去的店比較少（平均），好的比較多；總人數仍有上下限", G => {
  const list = G.NPC_ROSTER, count = factor => { const c = { commissions: 0, hallVisits: 0, mkv: { day: "2026-12-01", f: Object.fromEntries(list.map(n => [n.id, factor])), g: {} } }; let t = 0; for (let i = 0; i < 20; i++) { const r = G.npcTrips("2026-12-01", "s" + i, list, c); t += Object.values(r.counts).reduce((a, b) => a + b, 0); } return t; };
  const lo = count(0.6), mid = count(1), hi = count(1.4); assert.ok(lo < mid && mid < hi, `${lo} ${mid} ${hi}`); assert.ok(lo > mid * 0.4 && hi < mid * 1.6, "有上下限、不是沒人也不是爆");
});
T("散客組數照展廳氣氛：氣氛高多、低少，±40% 內；沒有氣氛 ＝ 不變", G => {
  const n = m => { let t = 0; for (let i = 0; i < 20; i++) t += G.crowdVisitsToday("2026-12-02", "s" + i, m).length; return t; };
  const lo = n(0), mid = n(50), hi = n(100), none = n(null); assert.strictEqual(none, mid); assert.ok(lo < mid && mid < hi); assert.ok(lo >= mid * 0.5 && hi <= mid * 1.5);
});
T("wmWriteVisit：每天只寫壹次、帶給 npcCounters；總帳不動（只改倍率，不搬錢）", G => {
  const h = mk(G); G.wmTick(h, "2026-11-17", px(G, 1)); h.mk.b.tech = -0.9; const list = [{ id: "n1", job: { unit: "g-island" } }, { id: "n2", job: { kind: "free" } }];
  assert.strictEqual(G.wmWriteVisit(h, "2026-11-17", list), true); assert.strictEqual(G.wmWriteVisit(h, "2026-11-17", list), false);
  const c = G.npcCounters(h.npcc); assert.ok(c && c.mkv && c.mkv.day === "2026-11-17"); const w0 = h.world, a = G.wuAmounts(h); G.wmWriteVisit(h, "2026-11-18", list); assert.strictEqual(h.world, w0);
});
T("財報 whCard 多 markets：只有名字和分級，沒有數字", G => {
  const h = mk(G); G.whTick(h, "2026-11-16", px(G, 1)); const c = G.whCard(h, "2026-11-16"); assert.ok(Array.isArray(c.markets) && c.markets.length === G.WORLD_MARKETS.length);
  for (const m of c.markets) { assert.ok(m.name && m.band && m.label); assert.ok(!("v" in m) && !("value" in m)); }
});
console.log(`${pass} passed, ${fail} failed（景氣分市場）`);
process.exit(fail ? 1 : 0);
