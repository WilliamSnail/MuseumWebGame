// 佩佩轉盤、差壹畫（shared/casino/side_bets.js、wheel.js、miscount.js，決定 0150）：node test/casino/wheel.test.cjs（npm test 也會跑）
// 格子、賠率和優勢、不可能必賺、限額（單轉最多贏、總注、莊家吃緊）、守恆（錢包＋莊家不變）、押法檢查、長跑優勢、結果由 RNG 決定。
const assert = require("assert");
const { load } = require("../load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const t0 = Date.now(); const G = load({ __realMoney: true }); try { fn(G); pass++; if (process.env.T_TIME) console.log(Date.now() - t0, "ms", name.slice(0, 20)); } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 6).join("\n    ")); } finally { G.setRng(null); } };
const DAY = "2026-11-21";
const mk = G => { const w = G.casWalletFix(G.casWalletNew(), DAY), house = G.casHouseFix(G.casHouseNew(), DAY).house; w.chips = 50000000; return { w, house }; };
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const lcg = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

T("轉盤格子：25 格、4 色各 6、稀有度 普通 14／稀有 6／超稀有 3／傳說 1、最後是特別格", G => {
  assert.strictEqual(G.WHEEL_SLOTS.length, 25);
  ["紅", "綠", "黃", "黑"].forEach(c => assert.strictEqual(G.WHEEL_SLOTS.filter(s => s.color === c).length, 6));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(["普通", "稀有", "超稀有", "傳說"].map(r => G.WHEEL_SLOTS.filter(s => s.rar === r).length))), [14, 6, 3, 1]);
  assert.strictEqual(G.WHEEL_SLOTS[G.WHEEL_SPECIAL].color, "虹彩");
});
T("賠率：機率 × 賠率 ≤ 1 − 優勢（所有押法）；實際優勢不離譜；顏色 4 倍、傳說 24 倍、普通 1.7 倍", G => {
  const e = G.NUM.casino.wheel.edge;
  [G.casSbTypes(G.WHEEL_DEF, e), G.casSbTypes(G.casMiscountDef(), G.NUM.casino.miscount.edge)].forEach(L => L.forEach(t => {
    assert.ok(t.p * t.mult <= 1 - e + 1e-9, t.id); assert.ok(1 - t.p * t.mult <= 0.11, t.id + " 優勢不會離譜");
  }));
  const by = id => G.casSbTypes(G.WHEEL_DEF, e).find(t => t.id === id);
  assert.strictEqual(by("c:紅").mult, 4); assert.strictEqual(by("r:傳說").mult, 24); assert.strictEqual(by("r:普通").mult, 1.7); assert.strictEqual(by("n:3").mult, 24);
  const m = id => G.casSbTypes(G.casMiscountDef(), G.NUM.casino.miscount.edge).find(t => t.id === id).mult;
  assert.strictEqual(m("exact"), 1.6); assert.strictEqual(m("more"), 4.8); assert.strictEqual(m("at:3"), 12);
});
T("不可能必賺：隨機組合，最壞結果的淨賺永遠 ≤ 0（轉盤、差壹畫）", G => {
  const rnd = lcg(12345);
  for (const [def, cfg] of [[G.WHEEL_DEF, G.NUM.casino.wheel], [G.casMiscountDef(), G.NUM.casino.miscount]]) {
    const types = G.casSbTypes(def, cfg.edge);
    for (let k = 0; k < 4000; k++) {
      const st = types.map(() => (rnd() < 0.3 ? 100 * (1 + Math.floor(rnd() * 100)) : 0)), tot = st.reduce((a, b) => a + b, 0);
      if (!tot) continue;
      let minNet = Infinity;
      for (const o of def.outcomes) minNet = Math.min(minNet, types.reduce((a, t, i) => a + (st[i] && o.hit(t.id) ? G.casSbPay(st[i], t.mult) : 0), 0) - tot);
      assert.ok(minNet <= 0, `${def.id}：全部結果都賺 ${minNet}`);
    }
  }
});
T("結算：錢包＋莊家守恆；贏了拿 floor(注×賠率)；輸了注進莊家", G => {
  const { w, house } = mk(G), sum = () => w.chips + house.bankroll, before = sum();
  const r = G.casWheelSpin(w, house, DAY, [{ id: "c:紅", bet: 200000 }, { id: "r:普通", bet: 100000 }], seq(0)); // 第 0 格＝紅普通：兩個都中
  assert.ok(r.ok); assert.strictEqual(r.outcome.slot, 0);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.rows.map(x => x.pay))), [800000, 170000]); assert.strictEqual(r.net, 970000 - 300000); assert.strictEqual(sum(), before);
  const r2 = G.casWheelSpin(w, house, DAY, [{ id: "c:紅", bet: 200000 }], seq(0.99)); // 特別格：全輸
  assert.ok(r2.ok && r2.outcome.slot === 24 && r2.net === -200000 && sum() === before);
  assert.strictEqual(house.act.wheelSpins, 2);
});
T("押法檢查：壞的 id／重複／小數／太小／沒錢／太多種都擋；壹轉總注上限；壞的押法不動錢", G => {
  const { w, house } = mk(G), bad = b => { const r = G.casWheelSpin(w, house, DAY, b, seq(0.5)); assert.strictEqual(r.ok, false, JSON.stringify(b)); return r.reason; };
  bad([]); bad(null); bad([{ id: "zz", bet: 1000 }]); bad([{ id: "c:紅", bet: 1000 }, { id: "c:紅", bet: 1000 }]); bad([{ id: "c:紅", bet: 1000.5 }]); bad([{ id: "c:紅", bet: 1 }]); bad([{ id: "c:紅", bet: -5 }]);
  bad(G.WHEEL_DEF.types.slice(0, 13).map(t => ({ id: t.id, bet: 1000 })));
  w.chips = 5000; bad([{ id: "c:紅", bet: 100000 }]); w.chips = 50000000;
  bad([{ id: "r:普通", bet: G.NUM.casino.maxBet + 1 }]);
  assert.strictEqual(w.chips, 50000000);
});
T("單轉最多贏 500 萬：24 倍的押法押太多被擋、押得下的剛好過；多種押法同時中也算進去", G => {
  const { w, house } = mk(G), cap = G.NUM.casino.wheel.maxWin;
  assert.ok(!G.casWheelSpin(w, house, DAY, [{ id: "n:5", bet: 300000 }], seq(0)).ok, "24 倍 × 30 萬 ＝ 贏 690 萬");
  assert.ok(G.casWheelSpin(w, house, DAY, [{ id: "n:5", bet: 217000 }], seq(0.99)).ok, "21.7 萬 × 23 ＝ 499.1 萬");
  const r = G.casWheelSpin(w, house, DAY, [{ id: "n:4", bet: 100000 }, { id: "x:紅稀有", bet: 100000 }, { id: "r:稀有", bet: 400000 }, { id: "c:紅", bet: 400000 }], seq(0));
  assert.ok(!r.ok && /最多贏/.test(r.reason), "同一格中好幾種，加起來超過就擋");
  const info = G.casWheelInfo(house, DAY);
  assert.ok(info.types.every(t => t.max <= info.top) && info.types.find(t => t.id === "n:5").max === Math.floor(cap / 23) && info.maxWin === cap);
});
T("莊家吃緊：單注上限降、今天賠付上限用完就不能押", G => {
  const { w, house } = mk(G);
  house.bankroll = 2000000; // 吃緊（< health.low）
  const top = G.casSbTop(house, DAY); assert.ok(top < G.NUM.casino.maxBet);
  assert.ok(!G.casWheelSpin(w, house, DAY, [{ id: "r:普通", bet: top + 1 }], seq(0.5)).ok);
  house.pay = { day: DAY, n: 1e12 }; // 今天賠付用完
  const r = G.casWheelSpin(w, house, DAY, [{ id: "c:紅", bet: 100000 }], seq(0.5)); assert.ok(!r.ok && /賠不動/.test(r.reason));
});
T("on 關掉就不開；結果只由 rng 決定（同樣的 rng 同樣的格）", G => {
  const { w, house } = mk(G); G.NUM.casino.wheel.on = false;
  assert.ok(!G.casWheelSpin(w, house, DAY, [{ id: "c:紅", bet: 100000 }], seq(0.5)).ok); G.NUM.casino.wheel.on = true;
  const a = G.casWheelSpin(w, house, DAY, [{ id: "c:紅", bet: 100000 }], seq(0.37)), b = G.casWheelSpin(w, house, DAY, [{ id: "c:紅", bet: 100000 }], seq(0.37));
  assert.strictEqual(a.outcome.slot, b.outcome.slot); assert.strictEqual(a.outcome.slot, Math.floor(0.37 * 25));
});
T("差壹畫：結果分布（剛好 60%、多／少各 20%）；多／少都帶「第幾畫」；第幾畫的押法只有差壹畫才中；n 在 5～20", G => {
  const { w, house } = mk(G), cnt = { exact: 0, more: 0, less: 0 }, N = 20000, rnd = lcg(7);
  for (let i = 0; i < N; i++) {
    const r = G.casMiscountSpin(w, house, DAY, [{ id: "exact", bet: 100 }], rnd), o = r.outcome;
    cnt[o.kind]++; assert.ok(o.n >= 5 && o.n <= 20); assert.ok(o.kind === "exact" ? o.at === 0 : o.at >= 1 && o.at <= 5);
    w.chips = 50000000; house.bankroll = 150000000; house.pay = { day: DAY, n: 0 };
  }
  assert.ok(Math.abs(cnt.exact / N - 0.6) < 0.015 && Math.abs(cnt.more / N - 0.2) < 0.015 && Math.abs(cnt.less / N - 0.2) < 0.015, JSON.stringify(cnt));
  const hit = (kind, at, id) => G.casMiscountDef().outcomes.find(o => o.kind === kind && o.at === at).hit(id);
  assert.ok(hit("more", 3, "more") && hit("more", 3, "at:3") && !hit("more", 3, "at:2") && !hit("more", 3, "less") && !hit("exact", 0, "at:1") && hit("exact", 0, "exact"));
});
T("長跑優勢：轉盤押顏色、差壹畫押剛好，每轉 20 萬 × 4 萬轉（固定種子），莊家賺 ≈ 4%（±2.5%；精確的 EV 在上面的賠率那一項）", G => {
  const rnd = lcg(99);
  for (const [fn, id] of [[G.casWheelSpin, "c:紅"], [G.casMiscountSpin, "exact"]]) {
    const { w, house } = mk(G); let stake = 0, net = 0;
    for (let i = 0; i < 40000; i++) { w.chips = 5e7; house.bankroll = 1.5e8; house.pay = { day: DAY, n: 0 }; const r = fn(w, house, DAY, [{ id, bet: 200000 }], rnd); assert.ok(r.ok); stake += 200000; net += r.net; }
    assert.ok(Math.abs(-net / stake - 0.04) < 0.025, `${id}：${(-net / stake * 100).toFixed(2)}%`);
  }
});
T("對帳：玩了幾轉之後，全館的帳（錢包＋莊家）跟開場相等（casBookGap 不動）", G => {
  const { w, house } = mk(G), snap = () => G.casBookSnap([w], house, 0, DAY), op = G.casBookOpening(snap());
  for (let i = 0; i < 40; i++) { G.casWheelSpin(w, house, DAY, [{ id: "c:黑", bet: 100000 }, { id: "x:黑稀有", bet: 20000 }], seq((i * 0.137) % 1)); G.casMiscountSpin(w, house, DAY, [{ id: "more", bet: 50000 }, { id: "at:2", bet: 20000 }], seq((i * 0.291) % 1)); }
  assert.strictEqual(G.casBookGap(snap(), op), 0);
});
console.log(fail ? `轉盤、差壹畫：${fail} 項沒過` : `轉盤、差壹畫：${pass} 項都過`); process.exit(fail ? 1 : 0);
