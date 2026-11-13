// 參觀者門票（11-13，數值平衡）：node test/casino_ticket.test.cjs（npm test 也會跑）
// 第一次認領只記起點、票價照存檔的展廳評分、三份分法加起來等於總額、每天上限、超過的不留到明天、自由模式不付、守恆（含館方帳）。數字讀 NUM。
const assert = require("assert");
const { G, buildProfile } = require("./sim_cellar.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { try { G.setRng(G.mulberry32(5)); fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 5).join("\n    ")); } finally { G.setRng(null); } };
const D1 = "2026-11-14", D2 = "2026-11-15";
const C = () => G.NUM.casino.ticket;
const hallP = () => {
  const P = buildProfile(G.mulberry32(3), "mid");
  Object.keys(P.pepes).slice(0, 6).forEach((k, i) => G.placeInHall(P, i, { kind: "pepe", key: k }));
  return P;
};
const mk = () => ({ w: G.casWalletFix(G.casWalletNew(), D1), house: G.casHouseFix(G.casHouseNew(), D1).house });
const total = s => G.casBookTotal(G.casBookSnap([s.w], s.house, 0, D1));
const gap = s => G.casBookGap(G.casBookSnap([s.w], s.house, 0, D1), G.NUM.casino.houseStart + G.NUM.casino.econ.budgetStart + G.NUM.casino.world.start);

T("設定：三份加起來不超過 100，館方帳是剩下的", () => {
  assert.ok(C().ownerPct >= 0 && C().budgetPct >= 0 && C().ownerPct + C().budgetPct <= 100 && C().perDay > 0 && C().perScore > 0);
});
T("第一次認領只記起點，不補發以前的；之後每來一位算一位，票價＝展廳評分×perScore", () => {
  const s = mk(), P = hallP(); P.hallVisitors = 100;
  const r0 = G.casTicketClaim(s.w, s.house, P, D1);
  assert.ok(r0.ok && r0.first && r0.total === 0 && s.w.tix.seen === 100);
  P.hallVisitors = 104;
  const r = G.casTicketClaim(s.w, s.house, P, D1), score = G.hallScore(P).score;
  assert.ok(score > 0, "展廳有評分");
  assert.strictEqual(r.n, 4); assert.strictEqual(r.price, score * C().perScore); assert.strictEqual(r.total, 4 * score * C().perScore);
  assert.strictEqual(r.owner + r.budget + r.museum, r.total, "三份加起來剛好是總額");
  assert.strictEqual(r.owner, Math.floor(r.total * C().ownerPct / 100)); assert.strictEqual(r.budget, Math.floor(r.total * C().budgetPct / 100));
  assert.strictEqual(s.w.chips, G.NUM.casino.startChips + r.owner);
  assert.strictEqual(s.house.museum, r.museum);
  assert.strictEqual(s.house.budget, G.NUM.casino.econ.budgetStart + r.budget);
  assert.strictEqual(G.casTicketClaim(s.w, s.house, P, D1).total, 0, "沒有新的就沒有錢");
  assert.strictEqual(gap(s), 0, "守恆（含館方帳）：" + gap(s));
});
T("每天最多 perDay 位；超過的不留到明天；換日重算", () => {
  const s = mk(), P = hallP(); P.hallVisitors = 0;
  G.casTicketClaim(s.w, s.house, P, D1);
  P.hallVisitors = 50;
  const r = G.casTicketClaim(s.w, s.house, P, D1);
  assert.strictEqual(r.n, C().perDay);
  P.hallVisitors = 55; assert.strictEqual(G.casTicketClaim(s.w, s.house, P, D1).n, 0, "今天收滿了");
  assert.strictEqual(G.casTicketLeft(s.w, D1), 0); assert.strictEqual(G.casTicketLeft(s.w, D2), C().perDay);
  P.hallVisitors = 58; assert.strictEqual(G.casTicketClaim(s.w, s.house, P, D2).n, 3, "昨天多的 30 位不補，只算新來的");
  assert.strictEqual(gap(s), 0);
});
T("自由模式、沒有展廳、存檔重來（累計比記的小）", () => {
  const s = mk();
  assert.ok(!G.casTicketClaim(s.w, s.house, null, D1).ok);
  const F = G.newProfile("free"); assert.ok(!G.casTicketClaim(s.w, s.house, F, D1).ok);
  const E = G.newProfile("challenge"); E.hallVisitors = 10; G.casTicketClaim(s.w, s.house, E, D1); E.hallVisitors = 15;
  const r = G.casTicketClaim(s.w, s.house, E, D1); assert.strictEqual(r.total, 0, "展廳沒東西，評分 0，沒有錢");
  const P = hallP(); P.hallVisitors = 7; G.casTicketClaim(s.w, s.house, P, D1); P.hallVisitors = 2;
  assert.strictEqual(G.casTicketClaim(s.w, s.house, P, D1).n, 0, "累計變小：重新記起點"); assert.strictEqual(s.w.tix.seen, 2);
});
T("舊錢包、舊莊家沒有 tix／museum：補上；日報有館方帳一段", () => {
  const w = G.casWalletFix({ v: 1, chips: 5 }, D1); assert.ok(w.tix && w.tix.seen === null);
  const h = G.casHouseFix({ bankroll: 1 }, D1).house; assert.strictEqual(h.museum, 0);
  const s = mk(), P = hallP(); P.hallVisitors = 0; G.casTicketClaim(s.w, s.house, P, D1); P.hallVisitors = 3; G.casTicketClaim(s.w, s.house, P, D1);
  const snap = G.casBookSnap([s.w], s.house, 0, D1), v = G.casReportView({ day: D1, at: Date.UTC(2026, 10, 14), snap, diff: G.casBookDiff(null, snap) });
  assert.ok(v.secs.some(x => x.t === "館方帳" && /館方帳有 [0-9,]+ 籌碼/.test(x.lines.join(""))));
  assert.ok(v.secs.map(x => x.lines.join("|")).join("|").includes("參觀者門票（館方帳）"));
});
console.log(`參觀者門票：${pass} 過，${fail} 沒過`);
process.exit(fail ? 1 : 0);
