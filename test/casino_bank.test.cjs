// Yuga Bot 銀行的活存、定存（11-13）：node test/casino_bank.test.cjs（npm test 也會跑）
// 存領、定存到期、提早解約、利息從莊家出、莊家破產不給、補算天數、守恆（記帳快照）、利率順序、舊錢包、壞資料。數字讀 NUM。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const D1 = "2026-11-13";
const add = (d, n) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const fresh = G => { const w = G.casWalletFix(G.casWalletNew(), D1), house = G.casHouseFix(G.casHouseNew(), D1).house; G.casBankAccrue(w, house, D1); return { w, house }; };
const total = (G, s) => G.casBookTotal(G.casBookSnap([s.w], s.house, 0, null));

T("存、領活存：籌碼和活存互搬，總量不變；不夠、太少、亂寫都擋", G => {
  const C = G.NUM.casino.bank, s = fresh(G), t0 = total(G, s), c0 = s.w.chips;
  let r = G.casBankPut(s.w, 300000); assert.ok(r.ok); assert.strictEqual(s.w.chips, c0 - 300000); assert.strictEqual(s.w.bank.save, 300000);
  assert.strictEqual(total(G, s), t0, "存進銀行還是算全館的錢");
  assert.ok(!G.casBankPut(s.w, C.min - 1).ok); assert.ok(!G.casBankPut(s.w, "abc").ok); assert.ok(!G.casBankPut(s.w, s.w.chips + 1).ok);
  r = G.casBankTake(s.w, 100000); assert.ok(r.ok); assert.strictEqual(s.w.bank.save, 200000);
  assert.ok(!G.casBankTake(s.w, 200001).ok, "領不能超過活存");
  r = G.casBankTake(s.w, "max"); assert.ok(r.ok); assert.strictEqual(s.w.bank.save, 0); assert.strictEqual(s.w.chips, c0);
});
T("活存利息：換日給，從莊家出；本金最多算 saveCap；同一天不重複給", G => {
  const C = G.NUM.casino.bank, s = fresh(G);
  s.w.chips = C.saveCap * 2; G.casBankPut(s.w, C.saveCap * 2);
  const h0 = s.house.bankroll, t0 = total(G, s);
  G.casBankAccrue(s.w, s.house, D1); assert.strictEqual(s.w.bank.save, C.saveCap * 2, "同一天沒有利息");
  const e = G.casBankAccrue(s.w, s.house, add(D1, 1));
  const want = Math.floor(C.saveCap * C.savePct / 100);
  assert.strictEqual(e.int, want); assert.strictEqual(s.house.bankroll, h0 - want); assert.strictEqual(total(G, s), t0, "利息是莊家搬給玩家");
  G.casBankAccrue(s.w, s.house, add(D1, 1)); assert.strictEqual(s.w.bank.earned, want, "同一天再叫不重複");
  assert.ok(G.casBankTakeNotes(s.w).some(l => l.includes("利息")));
  assert.strictEqual(G.casBankTakeNotes(s.w).length, 0, "說過就清掉");
});
T("好幾天沒來：補算每一天（最多 catchup 天）", G => {
  const C = G.NUM.casino.bank, s = fresh(G);
  G.casBankPut(s.w, 1000000);
  G.casBankAccrue(s.w, s.house, add(D1, 3));
  let v = 1000000; for (let i = 0; i < 3; i++) v += Math.floor(Math.min(v, C.saveCap) * C.savePct / 100);
  assert.strictEqual(s.w.bank.save, v);
  const s2 = fresh(G); G.casBankPut(s2.w, 1000000);
  G.casBankAccrue(s2.w, s2.house, add(D1, C.catchup + 50));
  let v2 = 1000000; for (let i = 0; i < C.catchup; i++) v2 += Math.floor(Math.min(v2, C.saveCap) * C.savePct / 100);
  assert.strictEqual(s2.w.bank.save, v2, "只補最後 catchup 天");
});
T("莊家破產（≤ 0）：沒有利息，也不印錢；莊家快沒錢時最多付 houseCapPct%", G => {
  const C = G.NUM.casino.bank, s = fresh(G);
  G.casBankPut(s.w, 1000000); s.house.bankroll = 0;
  const t0 = total(G, s);
  const e = G.casBankAccrue(s.w, s.house, add(D1, 1));
  assert.strictEqual(e.int, 0); assert.strictEqual(s.w.bank.save, 1000000); assert.strictEqual(total(G, s), t0);
  assert.ok(G.casBankTakeNotes(s.w).some(l => l.includes("莊家現在沒錢")));
  const s2 = fresh(G); s2.w.chips = C.saveCap; G.casBankPut(s2.w, C.saveCap); s2.house.bankroll = 1000000;
  const e2 = G.casBankAccrue(s2.w, s2.house, add(D1, 1));
  assert.strictEqual(e2.int, Math.floor(1000000 * C.houseCapPct / 100));
});
T("定存：到期那天換日本金加利息回到活存；提早解約只拿回本金；最多 termMax 筆、有上下限", G => {
  const C = G.NUM.casino.bank, s = fresh(G); s.w.chips = 50000000;
  const k = C.terms.length - 1, T0 = C.terms[k];
  let r = G.casBankTerm(s.w, 1000000, k, D1); assert.ok(r.ok); assert.strictEqual(r.term.due, add(D1, T0.days));
  const t0 = total(G, s), h0 = s.house.bankroll;
  G.casBankAccrue(s.w, s.house, add(D1, T0.days - 1)); assert.strictEqual(s.w.bank.terms.length, 1, "還沒到期");
  s.w.bank.save = 0; // 不讓活存利息干擾：前幾天活存是 0
  G.casBankAccrue(s.w, s.house, add(D1, T0.days));
  assert.strictEqual(s.w.bank.terms.length, 0);
  assert.strictEqual(s.w.bank.save, 1000000 + Math.floor(1000000 * T0.pct / 100));
  assert.strictEqual(s.house.bankroll, h0 - Math.floor(1000000 * T0.pct / 100)); assert.strictEqual(total(G, s), t0 + 0 - 0);
  const c1 = s.w.chips; r = G.casBankTerm(s.w, 500000, 0, D1); assert.ok(r.ok);
  r = G.casBankBreak(s.w, r.term.id); assert.ok(r.ok); assert.strictEqual(s.w.chips, c1, "解約只拿回本金");
  for (let i = 0; i < C.termMax; i++) assert.ok(G.casBankTerm(s.w, C.termMin, 0, D1).ok);
  assert.ok(!G.casBankTerm(s.w, C.termMin, 0, D1).ok, "超過筆數");
  const s2 = fresh(G); s2.w.chips = C.termCap * 2;
  assert.ok(!G.casBankTerm(s2.w, C.termMin - 1, 0, D1).ok); assert.ok(!G.casBankTerm(s2.w, C.termCap + 1, 0, D1).ok); assert.ok(!G.casBankTerm(s2.w, C.termMin, 99, D1).ok);
  assert.ok(!G.casBankBreak(s2.w, 12345).ok);
});
T("利率順序：活存 < 定存 < 借款（借錢來存不會賺）", G => {
  const C = G.NUM.casino.bank, L = G.NUM.casino.loan;
  const perDay = x => x.pct / x.days;
  C.terms.forEach(t => { assert.ok(C.savePct < perDay(t), "活存每天的利率比定存低"); assert.ok(perDay(t) < L.interestPct / L.days, "定存比借款低"); });
  assert.ok(C.terms.every((t, i) => i === 0 || perDay(t) >= perDay(C.terms[i - 1])), "鎖越久利率越高");
});
T("舊錢包、壞資料：補欄位，不丟錯", G => {
  const w = G.casWalletFix(G.casWalletNew(), D1); delete w.bank;
  assert.strictEqual(G.casBankView(w, D1).save, 0);
  w.bank = { save: "x", terms: [null, { amt: -5, due: "bad" }, { id: 1, amt: 200000, days: 3, pct: 1, due: add(D1, 3) }], notes: [1, "a"] };
  const B = G.casBankFix(w);
  assert.strictEqual(B.save, 0); assert.strictEqual(B.terms.length, 1); assert.deepStrictEqual(B.notes, ["a"]);
  assert.strictEqual(G.casBankHeld(w), 200000);
  const house = G.casHouseFix(G.casHouseNew(), D1).house;
  assert.doesNotThrow(() => G.casBankAccrue(w, house, "bad"));
  assert.doesNotThrow(() => G.casBankAccrue({ chips: 0 }, house, D1));
});
T("記帳快照：銀行裡的錢算在 bank，相減看得到", G => {
  const s = fresh(G); G.casBankPut(s.w, 300000);
  const a = G.casBookSnap([s.w], s.house, 0, D1);
  assert.strictEqual(a.bank, 300000);
  G.casBankTake(s.w, 100000);
  const b = G.casBookSnap([s.w], s.house, 0, add(D1, 1));
  assert.strictEqual(G.casBookDiff(a, b).bank, -100000);
});
console.log(`casino_bank.test：${pass} 過，${fail} 沒過`);
if (fail) process.exit(1);
