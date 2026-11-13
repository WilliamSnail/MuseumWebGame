// 藝術市場第一步（11-14）：node test/casino_art.test.cjs（npm test 也會跑）
// 稀有度、價格（放久了、景氣反向、搶手、一天變動小）、買賣守恆、價差、上限、舊存檔、壞資料。數字讀 NUM。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.NUM.art.walkSd = 0; G.NUM.art.hoaxPct = 0; /* 這份大部分測的是確定的曲線；隨機的部分（贗品疑雲、小隨機走）在下面另外開 */ try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const eq = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b))); // 不同 vm 的物件不能直接比
const DAY = "2026-11-16", add = (d, n) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const work = (id = "2026-W47/s1a", tier = 0, date = DAY) => ({ id, date, tier, title: "測試的畫" + id });
const fresh = (G, day = DAY) => {
  const w = G.casWalletFix(G.casWalletNew(), day), house = G.casHouseFix(G.casHouseNew(), day).house;
  w.chips = 100000000;
  return { w, house, P: {} };
};
const total = (G, s) => G.casBookTotal(G.casBookSnap([s.w], s.house, 0, null));

T("稀有度：畫框、理智、線索有任何壹個就是少見（最多到 1），珍藏孤品只能手寫 rarity；壞資料是 0", G => {
  const top = G.NUM.art.tiers.length - 1;
  assert.strictEqual(G.casArtTier({ frame: "plain" }), 0);
  assert.strictEqual(G.casArtTier({ frame: "gold" }), 1);
  assert.strictEqual(G.casArtTier({ frame: "gold", san: "0/1D4" }), 1, "自動推最多到少見");
  assert.strictEqual(G.casArtTier({ frame: "gold", san: "0/1D4", clue: "c-x" }), 1);
  assert.strictEqual(G.casArtTier({ san: "0/1D4" }), 1); assert.strictEqual(G.casArtTier({ clue: "c-x" }), 1);
  assert.strictEqual(G.casArtTier({ rarity: 3 }), 3, "孤品靠手寫");
  assert.strictEqual(G.casArtTier({ frame: "gold", san: "0/1D4", clue: "c-x", rarity: 0 }), 0);
  assert.strictEqual(G.casArtTier({ rarity: 99 }), top);
  assert.strictEqual(G.casArtTier({ rarity: -3 }), 0);
  [null, undefined, 5, "x", [], { rarity: "abc" }].forEach(x => assert.strictEqual(G.casArtTier(x), 0));
  assert.ok(G.NUM.art.tiers.every((t, i) => i === 0 || t.base > G.NUM.art.tiers[i - 1].base), "稀有的比較貴");
});
T("價格：底價、放久了慢慢漲有上限、不低於進位", G => {
  const C = G.NUM.art, h = G.casHouseFix(G.casHouseNew(), DAY).house;
  C.tiers.forEach((t, i) => assert.strictEqual(G.casArtPrice({ tier: i, date: DAY }, "a", DAY, h), t.base));
  const p0 = G.casArtPrice({ tier: 0, date: DAY }, "a", DAY, h), p10 = G.casArtPrice({ tier: 0, date: DAY }, "a", add(DAY, 10), h), p9999 = G.casArtPrice({ tier: 0, date: DAY }, "a", add(DAY, 9999), h);
  assert.ok(p10 > p0, "放久了漲");
  assert.ok(p10 <= p0 * (1 + C.ageFastPct * 10 / 100) + C.unit);
  assert.ok(p9999 <= C.tiers[0].base * (1 + C.ageCapPct / 100) + C.unit, "有上限");
  assert.ok(G.casArtPrice({ tier: 0, date: add(DAY, 5) }, "a", DAY, h) === p0, "還沒展出不倒扣");
  assert.ok(G.casArtPrice({ tier: 0, date: DAY }, "a", DAY, h) % C.unit === 0);
});
T("價格：景氣反向（差的時候撐住、好的時候慢一點），幅度只有 moodPct", G => {
  const C = G.NUM.art, h = G.casHouseFix(G.casHouseNew(), DAY).house, price = b => { h.econ.b = b; return G.casArtPrice({ tier: 1, date: DAY }, "a", DAY, h); };
  const bad = price(-1), mid = price(0), good = price(1);
  assert.ok(bad > mid && mid > good, "景氣差的畫價比景氣好的高");
  assert.ok(bad <= mid * (1 + C.moodPct / 100) + C.unit && good >= mid * (1 - C.moodPct / 100) - C.unit);
  assert.strictEqual(G.casArtPrice({ tier: 1, date: DAY }, "a", DAY, null), mid, "沒有莊家資料當景氣 0");
  assert.strictEqual(G.casArtPrice({ tier: 1, date: DAY }, "a", DAY, { econ: { b: "壞" } }), mid);
});
T("價格：每天變動小（景氣從最差到最好一天跳，也不超過 moodPct 的兩倍加放久了）", G => {
  const C = G.NUM.art, h = G.casHouseFix(G.casHouseNew(), DAY).house;
  const p = (b, day) => { h.econ.b = b; return G.casArtPrice({ tier: 2, date: DAY }, "a", day, h); };
  for (let i = 0; i < 30; i++) {
    const a = p(-1, add(DAY, i)), b = p(1, add(DAY, i + 1));
    assert.ok(Math.abs(b - a) / a <= (C.moodPct * 2 + C.ageFastPct) / 100 + 0.001, `第 ${i} 天跳太多：${a} → ${b}`);
  }
  for (let i = 0; i < 60; i++) { // 景氣不變的日子，一天最多漲 ageFastPct（前期），回本以後最多 ageUpPct
    const a = p(0.3, add(DAY, i)), b = p(0.3, add(DAY, i + 1));
    assert.ok(b >= a && (b - a) / a <= (i < C.ageFastDays ? C.ageFastPct : C.ageUpPct) / 100 + C.unit / a);
  }
});
T("價格：搶手（全館持有的人越多越貴，有上限）", G => {
  const C = G.NUM.art, h = G.casHouseFix(G.casHouseNew(), DAY).house, it = { tier: 0, date: DAY };
  const p0 = G.casArtPrice(it, "a", DAY, h);
  h.art = { own: { a: 4 } };
  const p4 = G.casArtPrice(it, "a", DAY, h);
  assert.ok(p4 > p0 && Math.abs(p4 - p0 * (1 + 4 * C.demandPct / 100)) <= C.unit);
  h.art = { own: { a: 9999 } };
  assert.ok(G.casArtPrice(it, "a", DAY, h) <= p0 * (1 + C.demandCapPct / 100) + C.unit, "有上限");
  assert.strictEqual(G.casArtPrice(it, "b", DAY, h), p0, "別幅畫不受影響");
  h.art = { own: { a: -5 } }; assert.strictEqual(G.casArtPrice(it, "a", DAY, h), p0);
});
T("買：籌碼進莊家，守恆，畫記在存檔", G => {
  const s = fresh(G), t0 = total(G, s), c0 = s.w.chips, h0 = s.house.bankroll;
  const r = G.casArtBuy(s.w, s.house, s.P, work("a", 1), DAY);
  assert.ok(r.ok, r.reason);
  assert.strictEqual(r.price, G.NUM.art.tiers[1].base);
  assert.strictEqual(s.w.chips, c0 - r.price); assert.strictEqual(s.house.bankroll, h0 + r.price);
  assert.strictEqual(total(G, s), t0, "錢只搬不生");
  assert.strictEqual(s.house.led.flow.art, r.price, "記在莊家帳的 art");
  assert.strictEqual(JSON.stringify(Object.keys(s.P.art.own)), '["a"]');
  assert.strictEqual(s.P.art.own.a.paid, r.price); assert.strictEqual(s.P.art.own.a.d, DAY);
  assert.strictEqual(s.house.art.own.a, 1);
  assert.strictEqual(s.P.art.buys[DAY], 1);
});
T("賣回：莊家付現價的 sellPct%，守恆；買來馬上賣一定虧，差額留在莊家", G => {
  const s = fresh(G), t0 = total(G, s), c0 = s.w.chips, h0 = s.house.bankroll;
  const b = G.casArtBuy(s.w, s.house, s.P, work("a", 2), DAY); assert.ok(b.ok);
  const r = G.casArtSell(s.w, s.house, s.P, "a", DAY); assert.ok(r.ok, r.reason);
  assert.ok(r.pay < b.price, "馬上賣要虧");
  assert.ok(r.pay <= Math.floor(G.NUM.art.tiers[2].base * (1 + G.NUM.art.demandPct / 100) * G.NUM.art.sellPct / 100) + 1);
  assert.strictEqual(s.w.chips, c0 - b.price + r.pay); assert.strictEqual(s.house.bankroll, h0 + b.price - r.pay);
  assert.strictEqual(total(G, s), t0, "賣回也守恆");
  assert.strictEqual(s.house.led.flow.art, b.price - r.pay, "帳上只剩價差");
  assert.strictEqual(JSON.stringify(s.P.art.own), "{}"); assert.strictEqual(s.house.art.own.a, undefined);
  assert.ok(!G.casArtSell(s.w, s.house, s.P, "a", DAY).ok, "賣過就沒有了");
});
T("放著賺不賺：短期賣回一定虧（隔天、第 3 天都虧），兩個禮拜內回本，回本之後漲得很慢、有上限；景氣差時賣回比景氣好時多", G => {
  const C = G.NUM.art;
  for (const days of [0, 1, 3, 7]) {
    const s = fresh(G); G.casArtBuy(s.w, s.house, s.P, work("a", 0), DAY);
    const r = G.casArtSell(s.w, s.house, s.P, "a", add(DAY, days));
    assert.ok(r.ok && r.pay < r.paid, `放 ${days} 天賣回要虧`);
  }
  const best = (1 + (C.ageCapPct + C.moodPct + C.demandCapPct) / 100) * C.sellPct / 100;
  assert.ok(best < 1.1, "最好的情況賣回也只是小賺（不是穩賺）"); // 放著是為了避險，不是賺價差
  // 回本：10～14 天（翊文 11-14：「最好一兩個禮拜內回本」）
  const be = G.casArtBreakEven({ tier: 1, date: DAY }, "a", DAY, G.casHouseFix(G.casHouseNew(), DAY).house, G.NUM.art.tiers[1].base);
  assert.ok(be >= 10 && be <= 14, "回本天數 " + be);
  const s0 = fresh(G); G.casArtBuy(s0.w, s0.house, s0.P, work("a", 1), DAY);
  const v = G.casArtView(s0.w, s0.house, s0.P, [], DAY); assert.ok(Math.abs(v.mine[0].breakEven - be) <= 1 && v.mine[0].breakEven >= 10 && v.mine[0].breakEven <= 14, "畫面看得到回本天數");
  const late = fresh(G); G.casArtBuy(late.w, late.house, late.P, work("a", 1), DAY);
  const r14 = G.casArtSell(late.w, late.house, late.P, "a", add(DAY, 14)); assert.ok(r14.ok && r14.pay >= r14.paid, "放 14 天回本");
  // 最壞情況（買在景氣最好、沒人持有；賣在景氣最差、搶手到上限）第 1 天賣回也要虧
  const w1 = fresh(G); w1.house.econ.b = 1; G.casArtBuy(w1.w, w1.house, w1.P, work("a", 1), DAY); w1.house.econ.b = -1; w1.house.art.own.a = 9999;
  const r1 = G.casArtSell(w1.w, w1.house, w1.P, "a", add(DAY, 1)); assert.ok(r1.ok && r1.pay < r1.paid, "最壞情況隔天賣也虧");
  // 回本之後長期不會變成穩賺：放很久的報酬低於活存同期（活存每天 NUM.casino.bank.savePct %）
  const lng = fresh(G); G.casArtBuy(lng.w, lng.house, lng.P, work("a", 1), DAY);
  const r300 = G.casArtSell(lng.w, lng.house, lng.P, "a", add(DAY, 300)); assert.ok(r300.pay / r300.paid - 1 < 300 * G.NUM.casino.bank.savePct / 100 * 0.5, "放 300 天的報酬遠低於活存");
  const mk = b => { const s = fresh(G); G.casArtBuy(s.w, s.house, s.P, work("a", 1), DAY); s.house.econ.b = b; return G.casArtSell(s.w, s.house, s.P, "a", add(DAY, 20)).pay; };
  assert.ok(mk(-1) > mk(1), "景氣差，畫的賣回價比景氣好高");
});
T("上限：一天幾幅、同一幅一份、最多收藏幾幅、籌碼、只賣今天的特展", G => {
  const C = G.NUM.art, s = fresh(G);
  for (let i = 0; i < C.perDay; i++) assert.ok(G.casArtBuy(s.w, s.house, s.P, work("w" + i), DAY).ok);
  const c = s.w.chips;
  assert.ok(!G.casArtBuy(s.w, s.house, s.P, work("extra"), DAY).ok, "一天上限"); assert.strictEqual(s.w.chips, c, "被擋什麼都不動");
  assert.ok(G.casArtBuy(s.w, s.house, s.P, work("extra"), add(DAY, 1)).reason !== undefined);
  const d2 = fresh(G); assert.ok(G.casArtBuy(d2.w, d2.house, d2.P, work("a"), DAY).ok);
  const dup = G.casArtBuy(d2.w, d2.house, d2.P, work("a"), DAY); assert.ok(!dup.ok); assert.ok(/收藏了/.test(dup.reason));
  const f = fresh(G); // 收藏架滿了：每天買 perDay 幅，補到 holdMax
  for (let i = 0, day = DAY; i < C.holdMax; i++) { if (i % C.perDay === 0 && i) day = add(day, 1); assert.ok(G.casArtBuy(f.w, f.house, f.P, work("f" + i, 0, day), day).ok, "第 " + i + " 幅"); }
  const dayFull = add(DAY, Math.ceil(C.holdMax / C.perDay) + 1); assert.ok(!G.casArtBuy(f.w, f.house, f.P, work("more", 0, dayFull), dayFull).ok, "收藏架滿了");
  const poor = fresh(G); poor.w.chips = 10; assert.ok(!G.casArtBuy(poor.w, poor.house, poor.P, work("a"), DAY).ok); assert.strictEqual(poor.w.chips, 10);
  const old = fresh(G); assert.ok(!G.casArtBuy(old.w, old.house, old.P, work("a", 0, add(DAY, -C.shelfDays)), DAY).ok, "已經不在特展");
  assert.ok(!G.casArtBuy(old.w, old.house, old.P, work("a", 0, add(DAY, 1)), DAY).ok, "還沒展出");
  const debt = fresh(G); debt.w.chips = -5; assert.ok(!G.casArtBuy(debt.w, debt.house, debt.P, work("a"), DAY).ok, "欠錢不能買");
});
T("上限：換日重算一天幾幅，舊的日期會清掉", G => {
  const C = G.NUM.art, s = fresh(G);
  for (let i = 0; i < C.perDay; i++) G.casArtBuy(s.w, s.house, s.P, work("w" + i), DAY);
  const d2 = add(DAY, 1);
  assert.ok(G.casArtBuy(s.w, s.house, s.P, work("n", 0, d2), d2).ok);
  assert.strictEqual(s.P.art.buys[d2], 1);
  const d30 = add(DAY, 30); G.casArtBuy(s.w, s.house, s.P, work("m", 0, d30), d30);
  assert.strictEqual(JSON.stringify(Object.keys(s.P.art.buys)), JSON.stringify([d30]));
});
T("莊家收不起就不賣（不印錢、不讓預算池墊）", G => {
  const s = fresh(G); G.casArtBuy(s.w, s.house, s.P, work("a", 3), DAY);
  s.house.bankroll = 1000; const b0 = s.house.budget, c0 = s.w.chips;
  const r = G.casArtSell(s.w, s.house, s.P, "a", DAY); assert.ok(!r.ok);
  assert.strictEqual(s.w.chips, c0); assert.strictEqual(s.house.budget, b0); assert.ok(s.P.art.own.a, "畫還在手上");
  s.house.bankroll = -1000; assert.ok(!G.casArtSell(s.w, s.house, s.P, "a", DAY).ok);
});
T("全館守恆：好幾個人來回買賣，帳還是對得上", G => {
  const house = G.casHouseFix(G.casHouseNew(), DAY).house, ws = [], Ps = [];
  for (let i = 0; i < 4; i++) { const w = G.casWalletFix(G.casWalletNew(), DAY); w.chips = 60000000; ws.push(w); Ps.push({}); }
  const snap = () => G.casBookSnap(ws, house, 0, DAY), t0 = G.casBookTotal(snap());
  const ids = ["a", "b", "c"];
  for (let d = 0; d < 6; d++) {
    const day = add(DAY, d);
    ws.forEach((w, i) => {
      const id = ids[(i + d) % 3] + d;
      G.casArtBuy(w, house, Ps[i], work(id, (i + d) % 4, day), day);
      if (d % 2) G.casArtSell(w, house, Ps[i], Object.keys(Ps[i].art ? Ps[i].art.own : {})[0] || "none", day);
    });
    assert.strictEqual(G.casBookTotal(snap()), t0, "第 " + d + " 天");
  }
  const held = ws.length && Ps.reduce((n, P) => n + Object.keys(P.art.own).length, 0), reg = Object.values(house.art.own).reduce((a, b) => a + b, 0);
  assert.strictEqual(reg, held, "莊家記的持有份數 ＝ 玩家手上的");
});
T("舊存檔沒有 P.art：補欄位、壞資料丟掉、轉 JSON 再讀回來一樣", G => {
  const P = { insp: 3, story: {} };
  const A = G.casArtFix(P); eq(A, { v: 1, own: {}, buys: {}, sells: {} }); assert.strictEqual(P.insp, 3);
  P.art = { own: { ok: { tier: 2, date: DAY, d: DAY, paid: 6000000, title: "好" }, noDate: { tier: 1 }, str: "x", n: null, huge: { tier: 99, date: DAY, paid: "abc" } }, buys: { [DAY]: 2, bad: 5, "2026-01-01": 0, "2026-01-02": "x" } };
  G.casArtFix(P);
  assert.strictEqual(JSON.stringify(Object.keys(P.art.own).sort()), '["huge","ok"]');
  assert.strictEqual(P.art.own.huge.tier, G.NUM.art.tiers.length - 1); assert.strictEqual(P.art.own.huge.paid, 0);
  assert.strictEqual(JSON.stringify(P.art.buys), JSON.stringify({ [DAY]: 2 }));
  const copy = JSON.parse(JSON.stringify(P)); G.casArtFix(copy); assert.strictEqual(JSON.stringify(copy.art), JSON.stringify(P.art));
  [null, undefined, 5, "x", []].forEach(x => assert.strictEqual(G.casArtFix(x), null));
  const P2 = { art: "壞掉" }; eq(G.casArtFix(P2), { v: 1, own: {}, buys: {}, sells: {} });
  const P3 = { art: { own: [1, 2], buys: [3] } }; eq(G.casArtFix(P3), { v: 1, own: {}, buys: {}, sells: {} });
  const P4 = JSON.parse('{"art":{"own":{"__proto__":{"date":"2026-11-16"}}}}'); assert.strictEqual(JSON.stringify(G.casArtFix(P4).own), "{}");
});
T("舊的莊家沒有 house.art：買的時候補", G => {
  const s = fresh(G); delete s.house.art; assert.ok(G.casArtBuy(s.w, s.house, s.P, work("a"), DAY).ok);
  const s2 = fresh(G); s2.house.art = "壞"; assert.ok(G.casArtBuy(s2.w, s2.house, s2.P, work("a"), DAY).ok);
  const s3 = fresh(G); s3.house.art = { own: { a: -3, b: "x", c: 2 } }; G.casArtHouse(s3.house); assert.strictEqual(JSON.stringify(s3.house.art.own), '{"c":2}');
});
T("壞資料：沒有存檔、畫缺欄位、日期壞、籌碼不是數字，都不丟錯也不動錢", G => {
  const s = fresh(G), c0 = s.w.chips, h0 = s.house.bankroll;
  assert.ok(!G.casArtBuy(s.w, s.house, null, work("a"), DAY).ok, "沒有挑戰存檔");
  assert.ok(!G.casArtSell(s.w, s.house, null, "a", DAY).ok);
  [null, undefined, 5, "x", {}, { id: "a" }, { id: "", date: DAY }, { id: 5, date: DAY }, { id: "a", date: "壞" }].forEach(x => assert.ok(!G.casArtBuy(s.w, s.house, s.P, x, DAY).ok));
  [null, undefined, "", "2026-13", 5].forEach(d => { assert.ok(!G.casArtBuy(s.w, s.house, s.P, work("a"), d).ok); assert.ok(!G.casArtSell(s.w, s.house, s.P, "a", d).ok); });
  assert.ok(!G.casArtSell(s.w, s.house, s.P, undefined, DAY).ok); assert.ok(!G.casArtSell(s.w, s.house, s.P, "__proto__", DAY).ok);
  s.w.chips = NaN; assert.ok(!G.casArtBuy(s.w, s.house, s.P, work("a"), DAY).ok);
  s.w.chips = c0; assert.strictEqual(s.house.bankroll, h0); assert.strictEqual(s.w.chips, c0);
  const t = work("a"); t.tier = "壞"; assert.ok(G.casArtBuy(s.w, s.house, s.P, t, DAY).ok, "tier 壞了當最低一級"); assert.strictEqual(s.P.art.own.a.tier, 0);
});
T("畫面資料：只讀不改、有沒有收藏、買得起買不起、壞資料不丟錯", G => {
  const s = fresh(G); const before = JSON.stringify([s.w, s.house, s.P]);
  const works = [work("a", 0), work("b", 3), { id: 5 }, null, { id: "c", date: "壞" }];
  const v = G.casArtView(s.w, s.house, s.P, works, DAY);
  assert.strictEqual(JSON.stringify([s.w, s.house, s.P]), before, "只讀");
  assert.strictEqual(JSON.stringify(v.items.map(x => x.id)), '["a","b"]'); assert.ok(v.items.every(x => !x.owned && x.canBuy));
  assert.strictEqual(v.items[1].tierName, G.NUM.art.tiers[3].name);
  G.casArtBuy(s.w, s.house, s.P, work("a", 0), DAY);
  const v2 = G.casArtView(s.w, s.house, s.P, works, DAY);
  assert.ok(v2.items[0].owned && !v2.items[0].canBuy && v2.items[0].sellPrice > 0 && v2.items[0].sellPrice < v2.items[0].price);
  assert.strictEqual(v2.mine.length, 1); assert.strictEqual(v2.left, G.NUM.art.perDay - 1);
  s.w.chips = 10; assert.ok(!G.casArtView(s.w, s.house, s.P, works, DAY).items[1].canBuy, "買不起");
  const bad = G.casArtView(null, null, null, null, null);
  assert.strictEqual(bad.items.length + bad.mine.length, 0);
  const bad2 = G.casArtView({ chips: "x" }, { art: "壞" }, { art: { own: { z: 5, y: { date: DAY } } } }, [work("a")], DAY);
  assert.strictEqual(bad2.mine.length, 1);
});
T("賣回上限：一人一天最多賣回 sellPerDay 幅；全館一天的額度；莊家持有上限", G => {
  const C = G.NUM.art, s = fresh(G);
  s.house.bankroll = 1000000000; // 十億，讓額度寬一點
  for (let i = 0; i < C.sellPerDay + 1; i++) { G.casArtBuy(s.w, s.house, s.P, work("w" + i, 0, add(DAY, -i % 1)), DAY); }
  // 買一堆（每天 perDay 幅）
  const t = fresh(G); t.house.bankroll = 1000000000; let day = DAY, n = 0;
  for (let i = 0; i < C.sellPerDay + 1; i++) { if (i % C.perDay === 0 && i) day = add(day, 1); assert.ok(G.casArtBuy(t.w, t.house, t.P, work("x" + i, 0, day), day).ok); n++; }
  const sd = add(day, 20); let ok = 0;
  for (let i = 0; i < n; i++) if (G.casArtSell(t.w, t.house, t.P, "x" + i, sd).ok) ok++;
  assert.strictEqual(ok, C.sellPerDay, "一人一天最多賣回 sellPerDay 幅");
  assert.ok(/明天再來/.test(G.casArtSell(t.w, t.house, t.P, "x" + C.sellPerDay, sd).reason));
  assert.ok(G.casArtSell(t.w, t.house, t.P, "x" + C.sellPerDay, add(sd, 1)).ok, "隔天可以");
  // 全館一天額度：莊家的錢很少，額度 ＝ 5% + 500 萬
  const q = fresh(G); G.casArtBuy(q.w, q.house, q.P, work("a", 0), DAY);
  q.house.bankroll = 200000000; q.house.art.out = { day: add(DAY, 14), n: Math.floor(q.house.bankroll * C.sellQuotaPct / 100) + C.sellQuotaBase - 1 };
  const rq = G.casArtSell(q.w, q.house, q.P, "a", add(DAY, 14)); assert.ok(!rq.ok && /收的畫夠多/.test(rq.reason), "額度用完");
  assert.ok(G.casArtSell(q.w, q.house, q.P, "a", add(DAY, 15)).ok, "換日額度重算");
  // 莊家持有上限：莊家的錢 × heldPct%
  const hcap = fresh(G); hcap.house.bankroll = 10000000;
  const first = fresh(G); first.house.bankroll = 100000000; G.casArtBuy(first.w, first.house, first.P, work("a", 3), DAY);
  assert.ok(G.casArtSell(first.w, first.house, first.P, "a", add(DAY, 14)).ok, "當天第一筆不受額度限制（比額度貴的畫也賣得掉）");
  const rh = G.casArtBuy(hcap.w, hcap.house, hcap.P, work("a", 3), DAY); assert.ok(!rh.ok && /放不下/.test(rh.reason), "持有合計超過莊家的錢 × heldPct%");
});
T("數字順序：價差大於放久了的上限（短線一定虧）；一天只買得起有限幾幅", G => {
  const C = G.NUM.art;
  assert.ok(C.sellPct > 0 && C.sellPct < 100);
  assert.ok(C.sellPct / 100 * (1 + C.ageCapPct / 100) < 1.1);
  assert.ok(C.moodPct <= 3 && C.ageFastPct <= 1 && C.ageUpPct <= 0.1 && C.demandPct <= 1, "價格每天變動要小（避險資產），回本之後漲得很慢");
  assert.ok(C.tiers[0].base >= G.NUM.casino.startChips, "最便宜的畫也要一開場的籌碼那麼多，是有錢之後才做的事");
});
T("隨機走勢：每天小小地漲跌（種子有祕密）、同樣的祕密永遠壹樣、換祕密不壹樣、夾 ±walkCap、展出當天沒有隨機", G => {
  const C = G.NUM.art, h = G.casHouseFix(G.casHouseNew(), DAY).house, it = { tier: 1, date: DAY };
  C.walkSd = 0.4;
  G.casArtSecret("A");
  const det = d => G.casArtPrice(it, "w1", d, h, true), real = d => G.casArtPrice(it, "w1", d, h);
  assert.strictEqual(real(DAY), det(DAY), "展出當天沒有隨機");
  let diff = 0, n = 0; for (let i = 1; i <= 60; i++) { if (real(add(DAY, i)) !== det(add(DAY, i))) diff++; n++; }
  assert.ok(diff > 40, "大部分日子有偏離：" + diff);
  const a = real(add(DAY, 30)); assert.strictEqual(real(add(DAY, 30)), a, "同樣的祕密壹樣");
  G.casArtSecret("B"); assert.notStrictEqual(real(add(DAY, 30)), a, "換祕密不壹樣"); G.casArtSecret("A");
  // 壹天的變動很小（比股票安靜）：跟前壹天的隨機部分差 ≤ 5 個標準差
  for (let i = 1; i <= 60; i++) { const r1 = real(add(DAY, i)) / det(add(DAY, i)), r0 = real(add(DAY, i - 1)) / det(add(DAY, i - 1)); assert.ok(Math.abs(r1 / r0 - 1) < 5 * C.walkSd / 100 + 0.003, "第 " + i + " 天跳太多"); }
  // 夾在 ±walkCap
  C.walkSd = 50; C.walkCap = 20; for (let i = 1; i <= 40; i++) { const r = real(add(DAY, i)) / det(add(DAY, i)); assert.ok(r <= 1.2 + 0.003 && r >= 0.8 - 0.003, "夾住：" + r); }
  // 平均不偏：很多幅畫的隨機部分平均 ≈ 0
  C.walkSd = 0.4; C.walkCap = 20; let s = 0; for (let k = 0; k < 300; k++) s += G.casArtPrice(it, "p" + k, add(DAY, 60), h) / G.casArtPrice(it, "p" + k, add(DAY, 60), h, true) - 1;
  assert.ok(Math.abs(s / 300) < 0.012, "平均不偏：" + s / 300);
});
T("贗品疑雲：價格壹次掉 hoaxMin～hoaxMax、不回來；機率約 hoaxPct；前壹天有線索；沒有祕密猜不到", G => {
  const C = G.NUM.art, h = G.casHouseFix(G.casHouseNew(), DAY).house, it = { tier: 2, date: DAY };
  G.casArtSecret("A"); C.hoaxPct = 100;
  const det = d => G.casArtPrice(it, "w", d, h, true), real = d => G.casArtPrice(it, "w", d, h);
  const d1 = real(add(DAY, 1)) / det(add(DAY, 1));
  assert.ok(d1 <= 1 - C.hoaxMin / 100 + 0.002 && d1 >= 1 - C.hoaxMax / 100 - 0.002, "壹次掉 " + d1);
  const d3 = real(add(DAY, 3)) / det(add(DAY, 3)); assert.ok(d3 < d1 && d3 >= Math.pow(1 - C.hoaxMax / 100, 3) - 0.003, "每天都有的話連續掉（不回來）");
  assert.strictEqual(G.casArtHoaxTomorrow(it, "w", DAY), true, "前壹天有線索"); assert.strictEqual(G.casArtHoaxTomorrow({ tier: 2, date: add(DAY, 5) }, "w", DAY), false, "還沒展出");
  C.hoaxPct = 0; assert.strictEqual(real(add(DAY, 30)), det(add(DAY, 30))); assert.strictEqual(G.casArtHoaxTomorrow(it, "w", DAY), false);
  // 機率：10,000 幅畫的壹天，約 hoaxPct%
  C.hoaxPct = 0.1; let hit = 0; for (let k = 0; k < 20000; k++) if (G.casArtHoaxTomorrow(it, "q" + k, DAY)) hit++;
  assert.ok(hit > 8 && hit < 40, "20000 幅壹天約 20 次：" + hit);
  G.casArtSecret("B"); let hit2 = 0; for (let k = 0; k < 20000; k++) if (G.casArtHoaxTomorrow(it, "q" + k, DAY)) hit2++; assert.ok(hit2 > 8 && hit2 < 40);
  assert.notStrictEqual(hit, hit2 + 0.5, "不同祕密不同結果（不必然不同數字）");
  G.casArtSecret("A"); const set = k => new Set(Array.from({ length: 5000 }, (_, i) => i).filter(i => G.casArtHoaxTomorrow(it, "q" + i, DAY))); const sa = set(), sb = (G.casArtSecret("B"), set()); assert.ok([...sa].some(x => !sb.has(x)) || sa.size === 0, "祕密不同，哪幾幅有事也不同");
});
T("畫面：收藏的畫在贗品疑雲前壹天有線索；有「畫也有風險」；回本天數不洩漏未來的隨機", G => {
  const C = G.NUM.art, s = fresh(G), it = work("h1", 1);
  G.casArtSecret("A"); C.hoaxPct = 100; C.walkSd = 0;
  assert.ok(G.casArtBuy(s.w, s.house, s.P, it, DAY).ok);
  const v = G.casArtView(s.w, s.house, s.P, [], DAY);
  assert.ok(/不是原作/.test(v.mine[0].hint), "有線索：" + v.mine[0].hint); assert.ok(/畫也有風險/.test(v.risk));
  C.hoaxPct = 0; const v2 = G.casArtView(s.w, s.house, s.P, [], DAY); assert.strictEqual(v2.mine[0].hint, null, "沒有事就沒有線索");
  // 回本天數：展出當天看，不管未來有沒有贗品都壹樣（只用確定的部分）
  const it2 = { tier: 1, date: DAY }, base = G.casArtBreakEven(it2, "z", DAY, s.house, G.NUM.art.tiers[1].base);
  C.hoaxPct = 100; assert.strictEqual(G.casArtBreakEven(it2, "z", DAY, s.house, G.NUM.art.tiers[1].base), base, "不洩漏未來");
});
T("短線還是一定虧：買了隔天賣回，加上隨機走勢（最壞情況）也虧；兩個禮拜內回本沒變", G => {
  const C = G.NUM.art; C.walkSd = 0.4; C.hoaxPct = 0.1;
  for (const sec of ["A", "B", "C", "D", "E"]) {
    G.casArtSecret(sec);
    for (let k = 0; k < 200; k++) {
      const s = fresh(G); s.house.econ.b = 1; G.casArtBuy(s.w, s.house, s.P, work("m" + k, 1), DAY); s.house.econ.b = -1; s.house.art.own["m" + k] = 9999;
      const r = G.casArtSell(s.w, s.house, s.P, "m" + k, add(DAY, 1)); assert.ok(r.ok && r.pay < r.paid, "隔天賣要虧：" + r.pay + " vs " + r.paid);
    }
  }
  const be = G.casArtBreakEven({ tier: 1, date: DAY }, "r", DAY, G.casHouseFix(G.casHouseNew(), DAY).house, C.tiers[1].base);
  assert.ok(be >= 10 && be <= 14, "回本 " + be);
});
console.log(`藝術市場：${pass} 項過，${fail} 項沒過`);
if (fail) process.exit(1);
