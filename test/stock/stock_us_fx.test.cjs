// 美股照當天美元對台幣匯率（11-16）：node test/stock/stock_us_fx.test.cjs（npm test 也會跑）
// 遊戲價 ＝ 匯率 × 美金價；匯率變動是價格漲跌，不換股數；沒有匯率用昨天的、再沒有用 peg.us；壞匯率不收；每日資料換日帶著匯率。
const assert = require("assert");
const r2 = x => Math.round(x * 100) / 100; // 股價小數兩位（決定 0108）
const fs = require("fs"), path = require("path");
const { load } = require("../load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.NUM.casino.grants = []; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const W = "2026-11-16", ID = "greeneye";
const tm = (G, idx) => G.usOpenMs(W) + idx * 60000;
const mkHouse = (G, day) => { const house = G.casHouseFix(G.casHouseNew(), day).house; G.casStockHouseFix(house); G.casStockRoll(house, day, {}); return house; };
// 開盤那一分鐘（真實開盤價 ＝ 前壹收盤 ＋ 1%）；fx 給了就寫進資料
const openDoc = (G, fx) => {
  const doc = G.usDocNew(W); if (fx !== undefined) doc.fx = fx;
  const got = {}; for (const id of G.US_IDS) got[id] = { open: 101, prev: 100, px: 101, lag: 0 };
  G.usApply(doc, G.usNeed(doc, 0), 0, got, "祕密");
  return doc;
};
T("遊戲價 ＝ 當天匯率 × 真實價，換股數的基準不變（不重換）", G => {
  const house = mkHouse(G, W), H = G.casStockHouseFix(house); const dirBefore = H.peg.dir[ID], seq = H.peg.seq;
  const doc = openDoc(G, 30.5);
  G.casStockUsApply(house, doc, W, tm(G, 1));
  assert.strictEqual(H.fx, 30.5);
  assert.strictEqual(H.hist[W][ID], r2(30.5 * 100), "基準 ＝ 匯率 × 前壹收盤");
  assert.strictEqual(H.px[ID], r2(30.5 * 101), "開盤價 ＝ 匯率 × 真實開盤價");
  const view = G.casStockView(G.casWalletFix(G.casWalletNew(), W), house, W, tm(G, 1), []).list.find(x => x.id === ID);
  assert.strictEqual(view.mult, 30.5); assert.strictEqual(view.prevClose, H.hist[W][ID], "圖表虛線＝前壹收盤（倍數×真實前收），不是開盤價");
});
T("沒有匯率：用 peg.us（×32）；匯率壞掉不收", G => {
  const house = mkHouse(G, W), H = G.casStockHouseFix(house);
  G.casStockUsApply(house, openDoc(G), W, tm(G, 1));
  assert.strictEqual(H.px[ID], r2(G.NUM.casino.stock.peg.us * 101));
  for (const bad of [0, -3, "32", NaN, 5, 200]) { const h2 = mkHouse(G, W); G.casStockUsApply(h2, openDoc(G, bad), W, tm(G, 1)); assert.strictEqual(G.casStockHouseFix(h2).fx, null, String(bad)); assert.strictEqual(G.casStockHouseFix(h2).px[ID], r2(32 * 101)); }
});
T("換日：昨天的匯率帶到今天（fxLast）和每日資料；今天抓到的蓋過去", G => {
  const doc = openDoc(G, 31);
  const next = G.usDocRoll(doc, "2026-11-17", 5);
  assert.strictEqual(next.fxLast, 31); assert.strictEqual(next.days[W].fx, 31);
  assert.strictEqual(G.stFxOf(next), 31, "今天還沒抓到前頂著昨天的");
  next.fx = 32.4; assert.strictEqual(G.stFxOf(next), 32.4);
  assert.strictEqual(G.usDocRoll(next, "2026-11-18", 5).fxLast, 32.4);
});
T("匯率變動只是價格漲跌：持股數不變、市值照新價算", G => {
  const house = mkHouse(G, W), H = G.casStockHouseFix(house), w = G.casWalletFix(G.casWalletNew(), W);
  G.casStockUsApply(house, openDoc(G, 32), W, tm(G, 1));
  G.casStockFix(w).own[ID] = 10; const ev = H.peg.ev.length;
  const h2 = mkHouse(G, W); G.casStockUsApply(h2, openDoc(G, 30), W, tm(G, 1));
  assert.strictEqual(G.casStockHouseFix(h2).peg.ev.length, ev, "沒有因為匯率換股數");
  assert.ok(G.casStockHouseFix(h2).px[ID] < H.px[ID], "匯率低，遊戲價低");
});
T("functions 的 parseFx：只收 15～60 的數字", G => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "functions", "stock_us.js"), "utf8"), i = src.indexOf("export function parseFx"), j = src.indexOf("export async function fetchFx");
  const parseFx = new Function(src.slice(i, j).replace("export function", "return function"))();
  const m = v => ({ chart: { result: [{ meta: { regularMarketPrice: v } }] } });
  assert.strictEqual(parseFx(m(32.41234)), 32.4123); assert.strictEqual(parseFx(m(0)), null); assert.strictEqual(parseFx(m(3200)), null); assert.strictEqual(parseFx(m("32")), null); assert.strictEqual(parseFx(null), null);
});
console.log(`${pass} passed, ${fail} failed（美股匯率）`);
process.exit(fail ? 1 : 0);
