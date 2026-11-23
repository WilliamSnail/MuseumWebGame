// 決定 0132：館門口池子的水位跟著被資助那位館友的淨值動（門檻 ＝ 淨值 1.5 倍；到門檻那晚只收東西、不收錢）。node test/casino/pool.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("../load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); G.NUM.casino.grants = []; G.NUM.casino.cultureGiftMore = []; /* 決定 0143 的多筆資助另外在 gift_multi.test 測 */ G.NUM.casino.houseLoan.fix.on = false; G.NUM.casino.bankSplit.on = false; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 5).join("\n    ")); } };
const D0 = "2026-11-19", add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const mk = (G, base = 1000000000) => { const h = G.casHouseFix(G.casHouseNew(), D0).house; h.pool = { uid: "u1", base, e: 0, lv: G.NUM.casino.pool.start, day: null, hold: 0, night: null, hits: 0, last: null, trace: [] }; return h; };
// 決定 0142：水位看「拿到款後累計賺的」：每天日報淨值比上壹次多的部分加進 e（虧的當 0、不扣），目標 ＝ clamp(start ＋ (1−start) × e ÷ earnT，min，1)
T("水位目標：沒賺 → start；賺到 earnT → 1；虧的不扣、不退；每天最多動 step", G => {
  const C = G.NUM.casino.pool, h = mk(G); G.casPoolDay(h, add(D0, 1), 1000000000); assert.strictEqual(h.pool.lv, C.start); assert.strictEqual(h.pool.trace[0], 0);
  G.casPoolDay(h, add(D0, 2), 1000000000 + C.earnT); assert.strictEqual(h.pool.e, C.earnT); assert.strictEqual(h.pool.lv, C.start + C.step, "一天只動 step"); assert.strictEqual(h.pool.trace[1], 1);
  const lv = h.pool.lv; G.casPoolDay(h, add(D0, 3), 500000000); assert.strictEqual(h.pool.e, C.earnT, "虧的不扣"); assert.ok(h.pool.lv >= lv, "水位不會因為虧而退");
  const h2 = mk(G); for (let i = 1; i <= 30; i++) G.casPoolDay(h2, add(D0, i), 1000000000 - i * 1000); assert.strictEqual(h2.pool.lv, C.start, "只虧就不動"); assert.strictEqual(h2.pool.e, 0);
  const h3 = mk(G); for (let i = 1; i <= 30; i++) G.casPoolDay(h3, add(D0, i), 1000000000 + i * 90000000); assert.ok(h3.pool.lv <= 1, "不超過門檻");
});
T("漲跌來回：只算漲的日子（賺 +100 虧 −100 來回，e 越積越多）", G => {
  const h = mk(G); let nw = 1000000000; for (let i = 1; i <= 6; i++) { nw += i % 2 ? 100 : -100; G.casPoolDay(h, add(D0, i), nw); } assert.strictEqual(h.pool.e, 200 + 100, "第 1、3、5 天各賺 100 但第 3、5 天是從低點回來：" + h.pool.e);
});
T("到門檻：賺滿 earnT 後水位到 1 而且連續 confirm 個日報目標 ≥ 1 才算；那天 night ＝ 當天；一天只算壹次", G => {
  const C = G.NUM.casino.pool, h = mk(G); let nightDay = null, nw = 1000000000;
  for (let i = 1; i <= 30; i++) { nw += C.earnT / 10; G.casPoolDay(h, add(D0, i), nw); if (h.pool.night && !nightDay) nightDay = i; }
  assert.ok(nightDay && nightDay >= Math.ceil((1 - C.start) / C.step), "不會比 step 快：" + nightDay); assert.strictEqual(G.casPoolDay(h, add(D0, 30), nw), false, "同壹天不重算");
  const h3 = mk(G); for (let i = 1; i <= 13; i++) G.casPoolDay(h3, add(D0, i), 1000000000 + C.earnT * 2); assert.ok(!h3.pool.night, "到頂之前不會有"); assert.ok(h3.pool.lv < 1 || h3.pool.hold < C.confirm);
});
T("舊的 pool（沒有 e）：第壹次日報從 0 開始，不追溯，上壹次淨值設成現在", G => {
  const h = mk(G); delete h.pool.e; h.pool.base = 1000; G.casPoolDay(h, add(D0, 1), 900000000); assert.strictEqual(h.pool.e, 0); assert.strictEqual(h.pool.who.u1.base, 900000000); assert.strictEqual(h.pool.lv, G.NUM.casino.pool.start);
});
T("門檻那晚過去（隔天日報）：水退回 start、e 歸 0、上壹次淨值重設、hits ＋ 1、night 清掉；不動錢", G => {
  const C = G.NUM.casino.pool, h = mk(G); let d = 0, nw = 1000000000; while (!h.pool.night && d < 60) { d++; nw += C.earnT / 5; G.casPoolDay(h, add(D0, d), nw); }
  assert.ok(h.pool.night, "有到門檻"); const night = h.pool.night, bank0 = h.bankroll, bud0 = h.budget, world0 = h.world; G.casPoolDay(h, add(D0, d + 1), 1800000000);
  assert.strictEqual(h.pool.lv, C.start); assert.strictEqual(h.pool.e, 0); assert.strictEqual(h.pool.who.u1.base, 1800000000); assert.strictEqual(h.pool.night, null); assert.strictEqual(h.pool.hits, 1); assert.strictEqual(h.pool.last.day, night); assert.strictEqual(h.pool.hold, 0);
  assert.strictEqual(h.bankroll, bank0); assert.strictEqual(h.budget, bud0); assert.strictEqual(h.world, world0);
});
T("全館看得到的 view：不寫誰、不寫數字；night 只在那壹天的 18:00 到隔天 05:00 前是 true；band、量化格、痕跡", G => {
  const C = G.NUM.casino.pool, h = mk(G); let d = 0; let nw = 1000000000; while (!h.pool.night && d < 60) { d++; nw += C.earnT / 5; G.casPoolDay(h, add(D0, d), nw); } const day = add(D0, d);
  const at = (hh, mm) => Date.parse(day + "T00:00:00+08:00") + (hh * 60 + mm) * 60000, v = t => G.casPoolView(h, day, t);
  assert.ok(!v(at(12, 0)).night, "白天不是"); assert.ok(v(at(18, 0)).night, "晚上是"); assert.ok(v(at(23, 59)).night); assert.ok(!G.casPoolView(h, add(day, 1), at(20, 0)).night, "隔天不是");
  const x = v(at(20, 0)); assert.strictEqual(x.lv, C.grid); assert.strictEqual(x.band, "over"); assert.ok([0, 1].includes(x.dir), "門檻那天水在漲或已經到頂（step 大的時候先到頂、再等 confirm）"); assert.ok(x.trace.length <= C.trace && x.trace.every(n => [-1, 0, 1].includes(n)));
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
T("step 改了以後第壹次日報補算以前的日子（決定 0155）：可以動 step ×（記過的天數＋今天）；之後每天照 step", G => {
  const C = G.NUM.casino.pool, h = mk(G); Object.assign(h.pool, { lv: 0.625, trace: [0, -1, 1, 1] });
  G.casPoolDay(h, add(D0, 5), 1000000000 + C.earnT); assert.strictEqual(h.pool.sv, C.step);
  assert.strictEqual(h.pool.lv, Math.min(1, Math.round((0.625 + C.step * 5) * 10000) / 10000), "補算：壹次動到 " + h.pool.lv);
  h.pool.lv = C.start; G.casPoolDay(h, add(D0, 6), 1000000000 + C.earnT); assert.strictEqual(h.pool.lv, Math.round((C.start + C.step) * 10000) / 10000, "之後壹天只動 step");
});
console.log(`${pass} passed, ${fail} failed（館門口池子的水位）`);
process.exit(fail ? 1 : 0);
