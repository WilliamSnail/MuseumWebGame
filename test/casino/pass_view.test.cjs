// 館友證的賭場摘要（shared/casino/pass_view.js）：node test/casino/pass_view.test.cjs（npm test 也會跑）
// 只讀不動錢包、空錢包全空、成就／財產只算有名字的、最近的在前、換小獎看這週、本週收藏只在這週對得上時才有。
const assert = require("assert");
const { load } = require("../load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 6).join("\n    ")); } };
const JS = x => JSON.parse(JSON.stringify(x));
const W = G => G.casWalletFix(G.casWalletNew(), "2026-11-10");

T("換小獎累計：換了幾次、花了多少都記下來；每週重算的 ex 不影響累計；壞資料整理掉", G => {
  const w = G.casWalletFix(G.casWalletNew(), "2026-11-23"), P = G.newProfile("challenge"), x = G.NUM.casino.exchange[0]; w.chips = 10000000;
  assert.ok(G.casExchange(w, x.id, P).ok); assert.ok(G.casExchange(w, x.id, P).ok || x.perWeek < 2);
  const n = x.perWeek < 2 ? 1 : 2, v = JSON.parse(JSON.stringify(G.casPassView(w, null)));
  assert.strictEqual(v.swap.tot.n, n); assert.strictEqual(v.swap.tot.chips, n * x.chips); assert.strictEqual(v.swap.tot.rows.find(r => r.id === x.id).n, n);
  const w2 = G.casWalletFix(JSON.parse(JSON.stringify(w)), "2026-12-07"); assert.strictEqual(w2.ex.n[x.id] || 0, 0, "換週重算"); assert.strictEqual(w2.exTot[x.id].n, n, "累計不重算");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(G.casExTotFix({ [x.id]: { n: -3, chips: "a" }, zzz: { n: 1 }, bad: 5 }))), { [x.id]: { n: 0, chips: 0 } });
});
T("賭場頁補完（11-22）：大禮包、完整成就和財產清單、餐車吃過的和今天還能補多少、戰績、認得的人、每週收藏每件和過去幾週", G => {
  const day = "2026-11-10", w = G.casWalletFix(G.casWalletNew(), day), snap = JSON.stringify(w);
  w.tickets = 4; w.meals.chicken = 3; w.meals.tea = 1; w.food = { day, mood: 4, san: 1 }; w.st.hands = 12;
  G.npcRelAdd(w, "clerk", day, "chat"); G.npcRelAdd(w, "c-math", day, "invite");
  w.ach["npc:clerk:helper"] = { name: "大夜班的幫手", d: day }; w.props.chicken = { n: 2, d: day };
  const before = JSON.stringify(w), v = JS(G.casPassView(w, null, day));
  assert.strictEqual(JSON.stringify(w), before, "只讀");
  assert.deepStrictEqual(v.packs, { left: G.NUM.casino.dailyPacks, opened: 0, tickets: 4 });
  assert.strictEqual(v.meals.total, 4); assert.strictEqual(v.meals.kinds, 2); assert.ok(v.meals.rows.some(r => r.id === "chicken" && r.n === 3));
  assert.deepStrictEqual(v.meals.left, { mood: G.NUM.casino.foodCap.mood - 4, san: G.NUM.casino.foodCap.san - 1 }); assert.strictEqual(JS(G.casPassView(w, null)).meals.left, null, "沒給日期不亂猜");
  assert.strictEqual(v.st.hands, 12);
  assert.ok(v.bond.some(b => b.id === "clerk" && b.kind === "giver" && b.name) && v.bond.some(b => b.id === "c-math" && b.kind === "traveler"));
  assert.ok(v.ach.list.some(a => a.id === "npc:clerk:helper" && a.kind === "npc" && a.desc)); assert.ok(v.props.list.some(p => p.id === "chicken" && p.n === 2));
  w.wkLog["2026-W44"] = { got: 3, done: day, claimed: null }; assert.strictEqual(JS(G.casPassView(w, null, day)).wkPast[0].week, "2026-W44");
  void snap;
});
T("空錢包：全空、欄位都在", G => {
  const w = W(G), v = G.casPassView(w, null);
  assert.strictEqual(v.chips, w.chips);
  assert.deepStrictEqual(JS(v.ach), { have: 0, total: G.CAS_ACH.length, extra: 0, wk: 0, recent: [], title: null, list: [] });
  assert.deepStrictEqual(JS(v.props), { have: 0, copies: 0, hung: 0, hungMax: G.NUM.casino.hangMax, recent: [], list: [] });
  assert.strictEqual(v.swap.used, 0); assert.strictEqual(v.swap.rows.length, G.NUM.casino.exchange.length);
  assert.ok(v.swap.rows.every(r => r.left === r.perWeek));
  assert.strictEqual(v.wk, null);
});
T("成就：基本的算 have、每週收藏和舊的算 extra；最近的在前；稱號", G => {
  const w = W(G);
  w.ach = { first: { d: "2026-11-01" }, win1: { d: "2026-11-05" }, "wk:2026-W45": { d: "2026-11-09", name: "某週集滿" }, "old:x": { d: "2026-10-01", name: "舊的" }, ghost: { d: "2026-11-09" } };
  w.title = "win1";
  const v = G.casPassView(w, null);
  assert.strictEqual(v.ach.have, 2); assert.strictEqual(v.ach.extra, 2); assert.strictEqual(v.ach.wk, 1);
  assert.deepStrictEqual(JS(v.ach.recent.map(x => x.id)), ["wk:2026-W45", "win1", "first", "old:x"], "沒名字的 ghost 不算；新的在前");
  assert.deepStrictEqual(JS(v.ach.title), { id: "win1", name: v.ach.recent[1].name });
  w.title = "nope"; assert.strictEqual(G.casPassView(w, null).ach.title, null);
});
T("財產：幾種、幾件、掛了幾件；最近的在前、最多 6 種", G => {
  const w = W(G);
  const ids = ["chicken", "tea", "feast", "juice", "admiral", "sushi", "gold", "table"];
  ids.forEach((id, i) => { w.props[id] = { n: i + 1, d: "2026-11-0" + (i + 1) }; });
  w.hung = ["gold", "ghostprop"];
  const v = G.casPassView(w, null);
  assert.strictEqual(v.props.have, 8); assert.strictEqual(v.props.copies, 36); assert.strictEqual(v.props.hung, 1, "沒名字的不算");
  assert.strictEqual(v.props.recent.length, 6); assert.strictEqual(v.props.recent[0].id, "table"); assert.ok(v.props.recent.find(x => x.id === "gold").hung === true);
});
T("換小獎：這週換了幾次、還剩幾次", G => {
  const w = W(G), it = G.NUM.casino.exchange[0];
  w.ex.n[it.id] = 2;
  const v = G.casPassView(w, null);
  assert.strictEqual(v.swap.used, 2); assert.strictEqual(v.swap.rows[0].left, it.perWeek - 2);
});
T("本週收藏：這週的才有；拿到幾件／共幾件、集滿、領了", G => {
  const w = W(G);
  const def = { label: "2026-W46", items: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "x", extra: true }] };
  w.wk = G.casWkNew("2026-W46"); w.wk.got = { a: 1, x: 1 };
  const wk = JS(G.casPassView(w, def).wk); assert.strictEqual(wk.items.length, 3); assert.strictEqual(wk.items.filter(x => x.got).length, 1); delete wk.items; assert.deepStrictEqual(wk, { week: "2026-W46", got: 1, total: 3, done: false, claimed: false });
  w.wk.week = "2026-W45"; assert.strictEqual(G.casPassView(w, def).wk, null, "別週的進度不算這週");
});
T("只讀：看完錢包一個字沒變", G => {
  const w = W(G); w.ach.first = { d: "2026-11-01" }; w.props.tea = { n: 1, d: "2026-11-01" };
  const a = JSON.stringify(w); G.casPassView(w, null); assert.strictEqual(JSON.stringify(w), a);
});
console.log(fail ? `館友證賭場摘要：${fail} 項沒過` : `館友證賭場摘要：${pass} 項都過`); process.exit(fail ? 1 : 0);
