// 決定 0132：館門口池子的水位跟著被資助那位館友的淨值動（門檻 ＝ 淨值 1.5 倍；到門檻那晚只收東西、不收錢）。node test/pool.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); G.NUM.casino.grants = []; G.NUM.casino.houseLoan.fix.on = false; G.NUM.casino.bankSplit.on = false; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 5).join("\n    ")); } };
const D0 = "2026-11-19", add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const mk = (G, base = 1000000000) => { const h = G.casHouseFix(G.casHouseNew(), D0).house; h.pool = { uid: "u1", base, lv: G.NUM.casino.pool.start, day: null, hold: 0, night: null, hits: 0, last: null, trace: [] }; return h; };
T("水位目標：淨值 ＝ 起點 → 0.6；1.5 倍 → 1（門檻）；0.5 倍 → 最低 0.1；每天最多動 step", G => {
  const C = G.NUM.casino.pool, h = mk(G); G.casPoolDay(h, add(D0, 1), 1000000000); assert.strictEqual(h.pool.lv, C.start); assert.strictEqual(h.pool.trace[0], 0);
  G.casPoolDay(h, add(D0, 2), 1500000000); assert.strictEqual(h.pool.lv, G.NUM.casino.pool.start + C.step, "一天只動 step"); assert.strictEqual(h.pool.trace[1], 1);
  const h2 = mk(G); for (let i = 1; i <= 30; i++) G.casPoolDay(h2, add(D0, i), 500000000); assert.strictEqual(h2.pool.lv, C.min, "最低 min"); assert.ok(h2.pool.trace.every(x => x === -1 || x === 0));
  const h3 = mk(G); for (let i = 1; i <= 30; i++) G.casPoolDay(h3, add(D0, i), 9000000000); assert.ok(h3.pool.lv <= 1, "不超過門檻");
});
T("到門檻：水位到 1 而且連續 confirm 個日報目標 ≥ 1 才算（最快第 14 天）；那天 night ＝ 當天；一天只算壹次", G => {
  const C = G.NUM.casino.pool, h = mk(G); let nightDay = null;
  for (let i = 1; i <= 20; i++) { G.casPoolDay(h, add(D0, i), 1600000000); if (h.pool.night && !nightDay) nightDay = i; }
  assert.strictEqual(nightDay, Math.ceil((1 - C.start) / C.step)); assert.strictEqual(G.casPoolDay(h, add(D0, 20), 1600000000), false, "同壹天不重算");
  const h2 = mk(G); for (let i = 1; i <= 13; i++) G.casPoolDay(h2, add(D0, i), 1600000000); G.casPoolDay(h2, add(D0, 14), 1000000000); assert.ok(!h2.pool.night, "最後壹天掉下來就不算"); assert.strictEqual(h2.pool.hold, 0);
  const h3 = mk(G); for (let i = 1; i <= 13; i++) G.casPoolDay(h3, add(D0, i), 1600000000); assert.ok(!h3.pool.night, "到頂之前不會有"); assert.ok(h3.pool.lv < 1);
});
T("門檻那晚過去（隔天日報）：水退回 start、起點重設成那一刻的淨值、hits ＋ 1、night 清掉；不動錢", G => {
  const C = G.NUM.casino.pool, h = mk(G); let d = 0; while (!h.pool.night) { d++; G.casPoolDay(h, add(D0, d), 1700000000); }
  const night = h.pool.night, bank0 = h.bankroll, bud0 = h.budget, world0 = h.world; G.casPoolDay(h, add(D0, d + 1), 1800000000);
  assert.strictEqual(h.pool.lv, C.start); assert.strictEqual(h.pool.base, 1800000000); assert.strictEqual(h.pool.night, null); assert.strictEqual(h.pool.hits, 1); assert.strictEqual(h.pool.last.day, night); assert.strictEqual(h.pool.hold, 0);
  assert.strictEqual(h.bankroll, bank0); assert.strictEqual(h.budget, bud0); assert.strictEqual(h.world, world0);
});
T("全館看得到的 view：不寫誰、不寫數字；night 只在那壹天的 18:00 到隔天 05:00 前是 true；band、量化格、痕跡", G => {
  const C = G.NUM.casino.pool, h = mk(G); let d = 0; while (!h.pool.night) { d++; G.casPoolDay(h, add(D0, d), 1700000000); } const day = add(D0, d);
  const at = (hh, mm) => Date.parse(day + "T00:00:00+08:00") + (hh * 60 + mm) * 60000, v = t => G.casPoolView(h, day, t);
  assert.ok(!v(at(12, 0)).night, "白天不是"); assert.ok(v(at(18, 0)).night, "晚上是"); assert.ok(v(at(23, 59)).night); assert.ok(!G.casPoolView(h, add(day, 1), at(20, 0)).night, "隔天不是");
  const x = v(at(20, 0)); assert.strictEqual(x.lv, C.grid); assert.strictEqual(x.band, "over"); assert.strictEqual(x.dir, 1); assert.ok(x.trace.length <= C.trace && x.trace.every(n => [-1, 0, 1].includes(n)));
  const s = JSON.stringify(x); assert.ok(!/u1|base|uid/.test(s) && Object.keys(x).sort().join() === "band,dir,hits,lv,night,trace");
  assert.strictEqual(G.casPoolView({}, day, 0), null);
});
T("淨值：籌碼＋活存定存＋館債＋股票＋集團股＋鎖住的 − 借款本息", G => {
  const h = G.casHouseFix(G.casHouseNew(), D0).house, w = G.casWalletFix(G.casWalletNew(), D0); w.chips = 1000;
  assert.strictEqual(G.casNetWorth(w, h), 1000); G.casBankPut(w, 400); assert.strictEqual(G.casNetWorth(w, h), 1000, "存起來還是他的"); w.loan.list.push({ id: 1, amt: 100, owe: 109, day: D0, due: add(D0, 7), at: null }); assert.strictEqual(G.casNetWorth(w, h), 1000 - 109);
  w.gs = { h: { "g-daily": 10 }, cost: { "g-daily": 1 }, sold: { day: null, n: 0 }, v: { day: null, n: {} }, seen: 0, hold: 50 }; G.gsAdvance(h, D0, Date.parse(D0 + "T12:00:00+08:00")); const P = h.gs.u["g-daily"].P; assert.strictEqual(G.casNetWorth(w, h), 1000 - 109 + 50 + Math.floor(10 * P));
});
T("起點：只有收到資助的人（house.cg 有記、暱稱對）才建 house.pool，起點是那一刻的淨值；已經有就不重建", G => {
  const h = G.casHouseFix(G.casHouseNew(), D0).house, w = G.casWalletFix(G.casWalletNew(), D0), nick = G.NUM.casino.cultureGift.nicks[0];
  assert.strictEqual(G.casPoolEnsure(w, h, nick, "u9", D0), false, "還沒收到資助"); G.casCultureGift(w, h, nick, D0, 1e12); assert.strictEqual(G.casPoolEnsure(w, h, "小明", "u2", D0), false, "別人不建");
  assert.strictEqual(G.casPoolEnsure(w, h, nick, "u9", D0), true); assert.strictEqual(h.pool.uid, "u9"); assert.strictEqual(h.pool.base, G.casNetWorth(w, h)); assert.strictEqual(h.pool.lv, G.NUM.casino.pool.start); const b0 = h.pool.base; w.chips += 5; assert.strictEqual(G.casPoolEnsure(w, h, nick, "u9", D0), false); assert.strictEqual(h.pool.base, b0);
});
console.log(`${pass} passed, ${fail} failed（館門口池子的水位）`);
process.exit(fail ? 1 : 0);
