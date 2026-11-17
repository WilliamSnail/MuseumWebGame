// 存股數的地方，股價換比例、除權時都要跟著換（11-17 翊文：「有沒有腳本讓這種類型的事件不要再發生」）。
// 起因：股價換比例（stPegDirect）只換了錢包，館方投資（house.inv）的股數沒換，帳面 +57280%、假跌觸發停損、還用錯的股數賣掉（PR 699 校正）；
//   除權（配股息，決定 0112）也壹樣只換了錢包。
// 這份測兩件事：
//   1. 行為：錢包、館方兩個池子、全館持股數（house.stk.held）都拿著股票 → 換壹次比例、除壹次權 → 每個人的市值不變（差不到壹股的價）
//   2. 結構：shared/ 裡每個讀寫「.own[」的檔都要登記在 HOLDERS（說明它怎麼處理換比例、除權）；新的檔出現就失敗，逼人想清楚
// 新增會存館外股股數的地方：把它加進第 1 段的「拿著股票」，再登記到 HOLDERS。
const assert = require("assert"), fs = require("fs"), path = require("path");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 5).join("\n    ")); } };
const D1 = "2026-11-18", D2 = "2026-11-19", ID = "flashcar";
const setup = G => {
  const house = G.casHouseFix(G.casHouseNew(), D1).house; G.casStockRoll(house, D1, {});
  house.world = 1e10; house.bankroll = 1e9; house.budget = 1e9;
  const H = G.casStockHouseFix(house), w = G.casWalletFix(G.casWalletNew(), D1); w.chips = 1e8;
  const S = G.casStockFix(w); S.own[ID] = 50; S.cost[ID] = Math.ceil(50 * H.px[ID]); S.peg = H.peg.seq; H.held[ID] = 50; // 直接放股數（買股要等開盤）
  const I = G.casInvestFix(house); I.pool.house.own[ID] = 40; I.pool.house.cost[ID] = Math.ceil(40 * H.px[ID]); I.pool.budget.own[ID] = 120; I.pool.budget.cost[ID] = Math.ceil(120 * H.px[ID]);
  G.casStockPegSync(w, house); G.casInvestFix(house);
  return { house, H, w, I };
};
const wVal = (G, w, H) => G.casStockFix(w).own[ID] * H.px[ID];
const pVal = (I, H, k) => (I.pool[k].own[ID] || 0) * H.px[ID];
T("換比例：錢包、館方兩個池子、全館持股數都跟著換，市值不變", G => {
  const { house, H, w, I } = setup(G);
  const px0 = H.px[ID], v0 = { w: wVal(G, w, H), house: pVal(I, H, "house"), budget: pVal(I, H, "budget") }, chips0 = w.chips;
  const out = G.casStockPegNow(house, { [ID]: 390.22 }); assert.ok(out.length === 1, "要真的換到比例");
  G.casStockPegSync(w, house); G.casInvestFix(house);
  const px1 = H.px[ID]; assert.notStrictEqual(px0, px1);
  assert.ok(Math.abs(wVal(G, w, H) + (w.chips - chips0) - v0.w) <= px1, "錢包市值（含零頭補的籌碼）不變");
  for (const k of ["house", "budget"]) assert.ok(Math.abs(pVal(I, H, k) - v0[k]) <= px1, `館方 ${k} 市值不變：${v0[k]} → ${pVal(I, H, k)}`);
  assert.strictEqual(G.casStockFix(w).own[ID], H.held[ID], "全館持股數跟錢包壹致");
});
T("除權（拆股 ×2）：錢包、館方兩個池子都跟著換，市值不變；除權日之前的不補", G => {
  const { house, H, w, I } = setup(G);
  const n0 = { w: G.casStockFix(w).own[ID], house: I.pool.house.own[ID], budget: I.pool.budget.own[ID] };
  G.casStockSetDiv(house, { ev: [{ id: ID, kind: "split", ex: D2, r: 2 }, { id: ID, kind: "split", ex: "2026-11-10", r: 3 }] });
  G.casStockRoll(house, D2, {}); H.px[ID] = Math.round(H.px[ID] / 2 * 100) / 100; // 除權日：真實價掉壹半，遊戲價跟著
  G.casStockPegSync(w, house); G.casInvestFix(house);
  assert.strictEqual(G.casStockFix(w).own[ID], n0.w * 2, "錢包 ×2（11-10 那筆在上次之前，不補）");
  assert.strictEqual(I.pool.house.own[ID], n0.house * 2); assert.strictEqual(I.pool.budget.own[ID], n0.budget * 2);
  G.casStockPegSync(w, house); G.casInvestFix(house);
  assert.strictEqual(I.pool.house.own[ID], n0.house * 2, "再碰壹次不會再配");
});
T("館方的均價紀錄：跟現在差 3 倍以上的舊價丟掉（不會被當成大跌而加碼）", G => {
  const { house, H, I } = setup(G);
  I.hx[ID] = [10000, 10000]; H.px[ID] = 300; I.day = null;
  G.casInvestRun(house, H, D1, "祕密", 0);
  assert.ok(I.hx[ID].every(v => v < 900), JSON.stringify(I.hx[ID]));
});
// ---------- 2 結構 ----------
const HOLDERS = {
  "casino_stock.js": "錢包（w.stk）：換比例 casStockPegSync 照 peg.ev、除權 casStockDivSync；全館持股數 H.held 在 stPegDirect、除權時跟著換",
  "casino_invest.js": "館方兩個池子（house.inv）：ivPegSync 照 peg.ev、ivSplitSync 照除權",
  "casino_stock_in.js": "館內股（w.stk 的館內那份）：館內五家店沒有換比例、除權",
  "casino_debt.js": "只讀（賣股還債，先 casStockFix、casInFix）",
  "casino_advisor.js": "只讀（財經專員看持股）",
  "casino_art.js": "不是股票（館藏的畫 house.art.own）",
  "casino_auction.js": "不是股票（拍賣的畫）",
};
T("結構：shared/ 裡每個用到「.own[」的檔都登記了怎麼處理換比例、除權", () => {
  const dir = path.join(__dirname, "..", "shared");
  const used = fs.readdirSync(dir).filter(f => f.endsWith(".js") && /\.own\[/.test(fs.readFileSync(path.join(dir, f), "utf8")));
  const missing = used.filter(f => !HOLDERS[f]);
  assert.deepStrictEqual(missing, [], `這些檔存了股數（或別的 own），還沒登記到 test/holders_follow.test.cjs 的 HOLDERS：${missing.join("、")}。如果是館外股的股數，換比例（house.stk.peg.ev）和除權（house.stk.div.ev）都要跟著換，並加進上面的行為測試`);
});
console.log(`${pass} passed, ${fail} failed（存股數的地方跟著換比例、除權）`);
process.exitCode = fail ? 1 : 0;
