// 館債（11-13）：node test/casino_bond.test.cjs（npm test 也會跑）
// 每週壹期、利率照莊家健康度、利息照持有天數、到期還本金加利息、莊家不夠由預算池墊、再不夠開憑證、補付、上限、帳號天數、守恆、利率順序。數字讀 NUM。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const MON = "2026-11-16", add = (d, n) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const fresh = (G, day = MON) => { const w = G.casWalletFix(G.casWalletNew(), day), house = G.casHouseFix(G.casHouseNew(), day).house; w.st.hands = 1; G.casBondFix(w, day); w.chips = 50000000; return { w, house }; };
const total = (G, s) => G.casBookTotal(G.casBookSnap([s.w], s.house, 0, null));

T("週壹算得對；這期照莊家健康度定利率，破產不發", G => {
  assert.strictEqual(G.casBondMonday("2026-11-16"), "2026-11-16"); assert.strictEqual(G.casBondMonday("2026-11-22"), "2026-11-16"); assert.strictEqual(G.casBondMonday("2026-11-23"), "2026-11-23");
  const C = G.NUM.casino.bond, start = G.NUM.casino.houseStart;
  const h = G.casHouseFix(G.casHouseNew(), MON).house;
  h.bankroll = start; assert.strictEqual(G.casBondTier(h).pct, C.tiers[0].pct);
  h.bankroll = Math.floor(start * 0.2); assert.strictEqual(G.casBondTier(h).pct, C.tiers[1].pct);
  h.bankroll = 1; assert.strictEqual(G.casBondTier(h).pct, C.tiers[2].pct);
  h.bankroll = -1; assert.strictEqual(G.casBondTier(h), null); assert.strictEqual(G.casBondIssue(h, MON), null);
  assert.ok(C.tiers.every((t, i) => i === 0 || t.pct > C.tiers[i - 1].pct), "越缺錢利率越高");
});
T("買：籌碼進莊家，守恆；週壹買拿滿 7 天，週日買只拿 1 天", G => {
  const C = G.NUM.casino.bond, s = fresh(G), t0 = total(G, s), h0 = s.house.bankroll;
  let r = G.casBondBuy(s.w, s.house, 1000000, MON); assert.ok(r.ok, r.reason);
  assert.strictEqual(s.house.bankroll, h0 + 1000000); assert.strictEqual(total(G, s), t0);
  const pct = s.house.bond.pct;
  assert.strictEqual(G.casBondInt(r.bond), Math.floor(1000000 * pct / 100));
  const s2 = fresh(G); r = G.casBondBuy(s2.w, s2.house, 1000000, add(MON, 6)); assert.ok(r.ok);
  assert.strictEqual(G.casBondInt(r.bond), Math.floor(1000000 * pct / 100 / 7));
  assert.strictEqual(r.bond.due, add(MON, 7));
});
T("上限：整張、每人、整期、籌碼、帳號天數", G => {
  const C = G.NUM.casino.bond, s = fresh(G);
  assert.ok(!G.casBondBuy(s.w, s.house, C.unit + 1, MON).ok, "要整張");
  assert.ok(!G.casBondBuy(s.w, s.house, C.perUser + C.unit, MON).ok, "每人上限");
  assert.ok(G.casBondBuy(s.w, s.house, "max", MON).ok); assert.strictEqual(G.casBondView(s.w, s.house, MON).mine, C.perUser);
  assert.ok(!G.casBondBuy(s.w, s.house, C.unit, MON).ok, "買滿了");
  const s2 = fresh(G); s2.house.bond = { mon: MON, name: "x", pct: 4, cap: C.unit, sold: 0 };
  assert.ok(G.casBondBuy(s2.w, s2.house, C.unit, MON).ok); const s3 = fresh(G); s3.house = s2.house;
  assert.ok(!G.casBondBuy(s3.w, s3.house, C.unit, MON).ok, "整期賣完");
  const y = G.casWalletFix(G.casWalletNew(), MON); y.chips = 10000000; G.casBondFix(y, MON);
  const r = G.casBondBuy(y, s.house, C.unit, add(MON, C.minAge - 1)); assert.ok(!r.ok && r.reason.includes("天"), "新帳號要等");
  assert.ok(G.casBondBuy(y, s.house, C.unit, add(MON, C.minAge)).ok);
  const p = fresh(G); p.w.chips = C.unit - 1; assert.ok(!G.casBondBuy(p.w, p.house, C.unit, MON).ok, "籌碼不夠");
});
T("到期：下週壹換日還本金加利息，莊家付；守恆", G => {
  const s = fresh(G); G.casBondBuy(s.w, s.house, 2000000, MON);
  const t0 = total(G, s), c0 = s.w.chips, int = G.casBondInt(s.w.bond.list[0]);
  G.casBondSettle(s.w, s.house, add(MON, 6)); assert.strictEqual(s.w.bond.list.length, 1, "還沒到期");
  const o = G.casBondSettle(s.w, s.house, add(MON, 7));
  assert.strictEqual(s.w.chips, c0 + 2000000 + int); assert.strictEqual(s.w.bond.list.length, 0); assert.strictEqual(o.iou, 0);
  assert.strictEqual(total(G, s), t0 + 0, "利息是莊家搬給玩家");
  assert.ok(G.casBondTakeNotes(s.w).some(l => l.includes("到期")));
});
T("莊家不夠：先莊家、再預算池墊（記 bailout）、再不夠開憑證；莊家回穩補付；全程守恆", G => {
  const C = G.NUM.casino.bond, start = G.NUM.casino.houseStart, s = fresh(G);
  G.casBondBuy(s.w, s.house, 3000000, MON);
  const owe = 3000000 + G.casBondInt(s.w.bond.list[0]);
  s.house.bankroll = 1000000; s.house.budget = 500000;
  const t0 = total(G, s), c0 = s.w.chips;
  const o = G.casBondSettle(s.w, s.house, add(MON, 7));
  assert.strictEqual(s.house.bankroll, 0); assert.strictEqual(s.house.budget, 0); assert.strictEqual(s.house.bailout, 500000);
  assert.strictEqual(o.iou, owe - 1500000); assert.strictEqual(s.w.chips, c0 + 1500000); assert.strictEqual(total(G, s), t0);
  G.casBondSettle(s.w, s.house, add(MON, 8)); assert.strictEqual(s.w.bond.iou, owe - 1500000, "莊家還沒回穩不補");
  s.house.bankroll = Math.floor(start * C.iouAtPct / 100) + 100000000; const t1 = total(G, s);
  const o2 = G.casBondSettle(s.w, s.house, add(MON, 9));
  assert.strictEqual(o2.iouPaid, owe - 1500000); assert.strictEqual(s.w.bond.iou, 0); assert.strictEqual(total(G, s), t1);
});
T("利率順序：定存 < 館債最低的壹週 < 借款（借錢買館債不會賺）", G => {
  const B = G.NUM.casino.bank, L = G.NUM.casino.loan, C = G.NUM.casino.bond;
  const term7 = Math.max(...B.terms.filter(x => x.days === 7).map(x => x.pct)), loanWeek = L.interestPct / L.days * 7;
  C.tiers.forEach(t => { assert.ok(t.pct > term7, "館債比 7 天定存高"); assert.ok(t.pct < loanWeek, "館債比借款低"); });
});
T("舊錢包、壞資料：補欄位，不丟錯；老帳號（打過牌）不用等", G => {
  const w = G.casWalletFix(G.casWalletNew(), MON); delete w.bond; w.st.hands = 5;
  const B = G.casBondFix(w, MON); assert.strictEqual(B.born, "2026-01-01");
  w.bond = { list: [null, { amt: -1 }, { amt: 100000, day: MON, due: add(MON, 7), pct: 4 }], iou: "x", notes: [3] };
  const B2 = G.casBondFix(w, MON); assert.strictEqual(B2.list.length, 1); assert.strictEqual(B2.iou, 0); assert.strictEqual(B2.list[0].mon, MON);
  const house = G.casHouseFix(G.casHouseNew(), MON).house;
  assert.doesNotThrow(() => G.casBondSettle(w, house, "bad")); assert.doesNotThrow(() => G.casBondView(w, house, MON));
});
T("銀行廳的資料帶館債；淨值加館債本金", G => {
  const s = fresh(G); G.casBondBuy(s.w, s.house, 1000000, MON);
  const v = G.casBankHall(s.w, MON, s.house);
  assert.ok(v.bonds && v.bonds.issue.open); assert.strictEqual(v.bonds.mine, 1000000);
  assert.strictEqual(v.net, s.w.chips + 1000000);
});
console.log(`casino_bond.test：${pass} 過，${fail} 沒過`);
if (fail) process.exit(1);
