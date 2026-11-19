// 決定 0135：館外股秒級現價（doc.live）：排程每幾秒抓壹次，現價用它，每分鐘的價和歷史不變；太舊就退回每分鐘的價。node test/stock_live.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 5).join("\n    ")); } };
const W = "2026-11-16", ID = "greeneye";
const open0 = G => { const g = {}; for (const id of G.US_IDS) g[id] = { open: 100, prev: 100, px: 100, lag: 0 }; return g; };
const minute = (G, doc, idx, px, lag) => { const g = {}; for (const id of G.US_IDS) g[id] = { px, lag: lag || 0 }; const need = G.usNeed(doc, idx); assert.strictEqual(need.kind, "min"); assert.ok(G.usApply(doc, need, idx, g, "s")); };
const setup = G => { const doc = G.usDocNew(W); assert.ok(G.usApply(doc, G.usNeed(doc, 0), 0, open0(G), "s")); minute(G, doc, 1, 100.5); return doc; };
const house = (G, day) => { const h = G.casHouseFix(G.casHouseNew(), day).house; G.casStockRoll(h, day, {}); return h; };
const T0 = (G, idx, sec) => G.usOpenMs(W) + idx * 60000 + (sec || 0) * 1000;
T("twLive：寫進 doc.live（rel、lag、時間、第幾分鐘），不動每分鐘的 ser；idx 還沒做完那分鐘（idx ＞ k）或收盤後不寫", G => {
  const doc = setup(G), ser0 = JSON.stringify(doc.ser);
  const got = {}; for (const id of G.US_IDS) got[id] = { px: 101, lag: 0.1 };
  assert.ok(G.twLive(doc, got, 1, T0(G, 1, 20), "us")); assert.strictEqual(doc.live.idx, 1); assert.strictEqual(doc.live.at, T0(G, 1, 20)); assert.strictEqual(doc.live.rel[ID], 1.01); assert.strictEqual(doc.live.lag[ID], 0.1); assert.strictEqual(JSON.stringify(doc.ser), ser0);
  assert.ok(!G.twLive(setup(G), got, 2, T0(G, 2, 1), "us"), "第 2 分鐘還沒做完 twMinute，不寫"); assert.ok(!G.twLive(setup(G), got, 400, 1, "us"), "收盤後不寫");
  const bad = Object.assign({}, got); for (const id of G.US_IDS) bad[id] = { px: 300 }; assert.ok(!G.twLive(setup(G), bad, 1, 1, "us"), "價超出合理範圍不寫");
  assert.ok(!G.twLive(setup(G), { [ID]: { px: 101, lag: 99 } }, 1, 1, "us"), "資料落後太久不寫");
  G.NUM.casino.stock.live.on = false; assert.ok(!G.twLive(setup(G), got, 1, 1, "us"), "關掉就不寫");
});
T("現價：live 比這分鐘的價新就用它（H.px、盤中最後壹格），太舊（超過 maxAge）或比較舊的分鐘不用；每分鐘的歷史格不變", G => {
  const doc = setup(G), h = house(G, W), day = W; const C = G.NUM.casino.stock;
  const got = {}; for (const id of G.US_IDS) got[id] = { px: 102, lag: 0.05 }; G.twLive(doc, got, 1, T0(G, 1, 20), "us");
  G.casStockUsApply(h, doc, day, T0(G, 1, 25)); const H = G.casStockHouseFix(h), T = H.us, base = H.hist[day][ID];
  const livePx = G.stPx ? G.stPx(base * 1.02) : Math.round(base * 1.02 * 100) / 100;
  assert.ok(Math.abs(H.px[ID] - livePx) < 0.02, "現價用 live：" + H.px[ID] + " vs " + livePx); assert.strictEqual(T.ser[ID][T.ser[ID].length - 1], H.px[ID], "盤中最後壹格也是 live"); assert.strictEqual(T.lag[ID], 0.05);
  const h2 = house(G, day); G.casStockUsApply(h2, doc, day, T0(G, 1, 20) + C.live.maxAgeSec * 1000 + 5000);
  const H2 = G.casStockHouseFix(h2); assert.ok(Math.abs(H2.px[ID] - Math.round(base * 1.005 * 100) / 100) < 0.02, "live 太舊：退回這分鐘的價 " + H2.px[ID]);
  const doc3 = setup(G); minute(G, doc3, 2, 103); const got3 = {}; for (const id of G.US_IDS) got3[id] = { px: 101 }; doc3.live = { at: T0(G, 1, 40), idx: 1, rel: Object.fromEntries(G.US_IDS.map(id => [id, 1.01])), lag: {} };
  const h3 = house(G, day); G.casStockUsApply(h3, doc3, day, T0(G, 2, 5)); assert.ok(Math.abs(G.casStockHouseFix(h3).px[ID] - Math.round(base * 1.03 * 100) / 100) < 0.02, "第 2 分鐘的價比上壹分鐘的 live 新，不被舊 live 蓋掉");
});
T("市價買賣、掛單照 live 的現價走：買的錢 ＝ 現價（live）× 股數；沒有 live 時跟以前壹樣", G => {
  const doc = setup(G), h = house(G, W), w = G.casWalletFix(G.casWalletNew(), W); w.chips = 1e9;
  const got = {}; for (const id of G.US_IDS) got[id] = { px: 103, lag: 0 }; G.twLive(doc, got, 1, T0(G, 1, 10), "us");
  const t = T0(G, 1, 12); G.casStockUsApply(h, doc, W, t); const px = G.casStockHouseFix(h).px[ID];
  const r = G.casStockBuy(w, h, ID, 100, W, t); assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(r.px, px);
  const docN = setup(G), hN = house(G, W); G.casStockUsApply(hN, docN, W, t); assert.ok(G.casStockHouseFix(hN).px[ID] < px, "沒有 live 比較舊的價");
});
console.log(`${pass} passed, ${fail} failed（秒級現價）`);
process.exit(fail ? 1 : 0);
