// 銀行「館內經濟」的幾個帳（決定 0100）：node test/casino_books.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.NUM.casino.grants = []; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
T("books：五個帳的餘額和昨天變化、進出最大的最多 3 筆（正進負出）、海底不列來源；沒有日報回 null；econ 帶過去", G => {
  const D0 = "2026-11-14", D1 = "2026-11-15", h0 = G.casHouseFix(G.casHouseNew(), D0).house, s0 = G.casBookSnap([], h0, 0, D0);
  const h1 = JSON.parse(JSON.stringify(h0)); G.casHouseMove(h1, "bj", 3000); G.casHouseMove(h1, "food", 2000); G.casHouseMove(h1, "pack", -1000); G.casHouseMove(h1, "job", -500); h1.budget += 700; h1.museum += 300;
  const s1 = G.casBookSnap([], h1, 0, D1), doc = { day: D1, snap: s1, diff: G.casBookDiff(s0, s1) }, b = G.casBooksView(doc);
  assert.strictEqual(b.day, D1); assert.strictEqual(b.bankroll, Math.round(h1.bankroll)); assert.strictEqual(b.d.bankroll, 3000 + 2000 - 1000 - 500);
  assert.ok(b.top.bankroll.length === 3 && b.top.bankroll[0].label === "21 點" && b.top.bankroll[0].n === 3000, JSON.stringify(b.top.bankroll));
  assert.ok(b.top.bankroll.some(x => x.n < 0), "出也列"); assert.deepStrictEqual(JSON.parse(JSON.stringify(b.top.sea)), []); assert.strictEqual(b.d.budget, 700); assert.strictEqual(b.d.museum, 300);
  assert.strictEqual(G.casBooksView(null), null);
  const e = G.casBankEcon({ econ: { day: D1, b: 0, rows: [], books: b } }); assert.strictEqual(e.books.day, D1); assert.strictEqual(G.casBankEcon({ econ: { day: D1, b: 0 } }).books, null);
});
T("books：NPC、散客的門票進預算池和館方帳顯示成正的（wflow 是外面世界付出去的負數；11-16 翊文截圖）", G => {
  const doc = { day: "2026-11-15", snap: { house: { bankroll: 0, budget: 0, museum: 0, sea: 0 } }, diff: { wflow: { npcCrowdBudget: -109264, npcTicketBudget: -2298, npcCrowdMuseum: -255206, npcTicketMuseum: -5400 }, houseMint: {}, flow: { npcCrowdBudget: 109264, npcTicketBudget: 2298, npcCrowdMuseum: 255206, npcTicketMuseum: 5400 } } };
  const b = G.casBooksView(doc), n = (arr, lab) => (arr.find(x => x.label === lab) || {}).n;
  assert.strictEqual(n(b.top.budget, "散客的門票（預算池）"), 109264); assert.strictEqual(n(b.top.budget, "NPC 的門票（預算池）"), 2298);
  assert.strictEqual(n(b.top.museum, "散客的門票（館方帳）"), 255206); assert.strictEqual(n(b.top.museum, "NPC 的門票（館方帳）"), 5400);
  assert.ok(b.top.world.every(x => x.n < 0), "外面世界那塊照舊是付出去（負的）");
});
console.log(`${pass} passed, ${fail} failed（館內經濟的帳）`); process.exit(fail ? 1 : 0);
