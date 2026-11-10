// 交委託拿籌碼、委託的靈感打折（決定 0062）：node test/casino_job.test.cjs（npm test 也會跑）
// 數量範圍、一天上限、換日、同一張不重複、一次好幾張、莊家守恆、統計、舊錢包、壞資料、不認得的格子；委託單上的靈感照 NUM.rewardPct。數字讀 NUM。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } finally { G.setRng(null); } };
const D1 = "2026-11-10", D2 = "2026-11-11";
const fresh = (G, day = D1) => ({ w: G.casWalletFix(G.casWalletNew(), day), house: G.casHouseFix(G.casHouseNew(), day).house });
const LO = () => 0, HI = () => 0.999999;

T("數字是一點點：一天最多不超過最小的大禮包；10 天也換不到壹點靈感", G => {
  const C = G.NUM.casino.job;
  assert.ok(C.min > 0 && C.max >= C.min && C.step > 0 && C.perDay >= 1);
  assert.ok(C.max * C.perDay <= G.CAS_PACKS[0].base);
  assert.ok(C.max * C.perDay * 10 < G.NUM.casino.exchange[0].chips);
});
T("交一張：籌碼加、莊家減、統計對得上；最小、最大的亂數到邊界", G => {
  const C = G.NUM.casino.job, { w, house } = fresh(G), c0 = w.chips, h0 = house.bankroll;
  const r = G.casJobChips(w, house, ["0"], D1, LO);
  assert.ok(r.ok && r.found === C.min && r.n === 1);
  assert.strictEqual(w.chips, c0 + C.min); assert.strictEqual(house.bankroll, h0 - C.min);
  assert.strictEqual(w.st.jobs, 1); assert.strictEqual(w.st.jobChips, C.min); assert.strictEqual(w.st.chipsMax, c0 + C.min);
  assert.strictEqual(G.casJobChips(w, house, "1", D1, HI).found, C.max);
  assert.strictEqual(w.chips + house.bankroll, c0 + h0, "兩邊加起來不變");
});
T("數量是 step 的倍數、在範圍內", G => {
  const C = G.NUM.casino.job;
  for (let i = 0; i < 100; i++) { const { w, house } = fresh(G); const f = G.casJobChips(w, house, ["0"], D1, () => i / 100).found; assert.ok(f >= C.min && f <= C.max && (f - C.min) % C.step === 0, String(f)); }
});
T("同一張同一天只給一次；換日可以再拿", G => {
  const { w, house } = fresh(G);
  assert.strictEqual(G.casJobChips(w, house, ["L"], D1, LO).n, 1);
  const c1 = w.chips, again = G.casJobChips(w, house, ["L"], D1, LO);
  assert.ok(again.ok && again.found === 0 && again.n === 0); assert.strictEqual(w.chips, c1);
  assert.strictEqual(G.casJobChips(w, house, ["L"], D2, LO).n, 1);
  assert.strictEqual(G.casJobLeft(w, D2), G.NUM.casino.job.perDay - 1);
});
T("一次好幾張（一鍵交件）：重複的不算；超過一天上限的不給", G => {
  const C = G.NUM.casino.job, { w, house } = fresh(G), c0 = w.chips;
  const r = G.casJobChips(w, house, G.CAS_JOB_SLOTS.concat(["0"]).slice(0, G.CAS_JOB_SLOTS.length), D1, LO);
  assert.strictEqual(r.n, Math.min(C.perDay, G.CAS_JOB_SLOTS.length)); assert.strictEqual(r.found, r.n * C.min);
  assert.strictEqual(w.chips, c0 + r.found); assert.strictEqual(G.casJobLeft(w, D1), C.perDay - r.n);
  if (r.n === C.perDay) assert.strictEqual(G.casJobChips(w, house, ["x"], D1, LO).found, 0);
});
T("不認得的格子、空的、壞資料：什麼都不改", G => {
  const { w, house } = fresh(G), c0 = w.chips, h0 = house.bankroll;
  [["9"], ["0", "zz"], [], null, [{}], "2026-11-10#0", [1]].forEach(x => assert.ok(!G.casJobChips(w, house, x, D1, LO).ok, JSON.stringify(x)));
  assert.strictEqual(w.chips, c0); assert.strictEqual(house.bankroll, h0);
});
T("舊錢包沒有 cj、cj 是壞的：補起來，不丟錯", G => {
  const { w, house } = fresh(G);
  delete w.cj; assert.strictEqual(G.casJobLeft(w, D1), G.NUM.casino.job.perDay);
  w.cj = { day: D1, n: "abc", slots: "x" }; assert.ok(G.casJobChips(w, house, ["0"], D1, LO).found > 0);
  w.cj = [1, 2]; w.st = null; assert.ok(G.casJobChips(w, house, ["1"], D1, LO).found > 0);
});
T("委託單上的靈感照 NUM.rewardPct 打折，最少 1；交件拿到的就是單上寫的", G => {
  const N = G.NUM, pct = N.rewardPct;
  assert.ok(pct > 0 && pct <= 100);
  assert.strictEqual(G.jobReward(N.reward.precise), Math.max(1, Math.round(N.reward.precise * pct / 100)));
  assert.strictEqual(G.jobReward(1), 1); assert.strictEqual(G.jobReward(0), 1);
  const P = G.newProfile ? G.newProfile() : null;
  if (P) {
    G.setRng(() => 0.5);
    const list = G.dailyCommissions(P, D1);
    assert.strictEqual(list[0].reward, G.jobReward(N.reward.precise));
    list.forEach(c => { if (c.src) { const src = G.COMMISSION_POOL.find(x => x.id === c.src); assert.strictEqual(c.reward, G.jobReward(src.reward || N.reward[c.kind] || 5)); } });
  }
});
console.log(`casino_job：過 ${pass}、沒過 ${fail}`);
process.exit(fail ? 1 : 0);
