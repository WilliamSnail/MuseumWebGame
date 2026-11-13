// 拚經濟（決定 0052）：node test/casino_econ.test.cjs（npm test 也會跑）
// 成功／失敗／油水的機率邊界、每日上限、換日、莊家和錢包金額對得上、莊家拚回正、舊錢包、壞資料、文字界線。數字讀 NUM。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } finally { G.setRng(null); } };
const D1 = "2026-11-09", D2 = "2026-11-10";
const fresh = (G, day = D1) => ({ w: G.casWalletFix(G.casWalletNew(), day), house: G.casHouseFix(G.casHouseNew(), day).house });
const seq = (...xs) => { let i = 0; return () => xs[Math.min(i++, xs.length - 1)]; };
// 讓 r 剛好是某個整數：floor(x * (rMax+1)) === r
const atR = (G, r) => (r + 0.5) / (G.NUM.casino.econ.rMax + 1);
const JS = x => JSON.parse(JSON.stringify(x));

T("數字照舊：一天 3 次、r 0～100、30 以上才成功、成功 ×30000、失敗 ×10000", G => {
  const C = G.NUM.casino.econ;
  assert.deepStrictEqual([C.perDay, C.rMax, C.winAbove, C.winPer, C.losePer, C.ticketPct, C.lootPct], [3, 100, 30, 30000, 10000, 8, 55]);
  assert.ok((C.winAbove + 1) * C.winPer >= 930000 && C.rMax * C.winPer === 3000000, "成功約 93 萬～300 萬");
});
T("預算凍結：預算池 ≤ 0 時成功只撥 freezeKeep%，加起來還是守恆；> 0 時照舊；100 ＝ 不凍結", G => {
  const C = G.NUM.casino.econ, sum = s => s.house.budget + s.house.sea + s.house.bankroll + s.w.chips;
  assert.strictEqual(C.freezeKeep, 20);
  let s = fresh(G); s.house.budget = 0; let t0 = sum(s), b0 = s.house.bankroll;
  let r = G.casEconPlay(s.w, s.house, D1, seq(atR(G, 50), 0.3, 0.99));
  assert.ok(r.win && r.frozen); assert.strictEqual(r.amount, Math.floor(50 * C.winPer * C.freezeKeep / 100));
  assert.strictEqual(s.house.bankroll, b0 + r.amount); assert.strictEqual(s.house.budget, -r.amount); assert.strictEqual(sum(s), t0);
  assert.ok(r.lines.some(l => l.includes("預算凍結")));
  s = fresh(G); s.house.budget = 1; r = G.casEconPlay(s.w, s.house, D1, seq(atR(G, 50), 0.3, 0.99));
  assert.ok(r.win && !r.frozen && r.amount === 50 * C.winPer, "預算池還有壹點就照舊");
  s = fresh(G); s.house.budget = -5; r = G.casEconPlay(s.w, s.house, D1, seq(atR(G, 20), 0));
  assert.ok(!r.win && !r.frozen && s.house.budget === -5, "失敗不受凍結影響");
  G.NUM.casino.econ.freezeKeep = 100; s = fresh(G); s.house.budget = -5; r = G.casEconPlay(s.w, s.house, D1, seq(atR(G, 50), 0.3, 0.99));
  assert.ok(r.win && !r.frozen && r.amount === 50 * C.winPer, "freezeKeep 100 ＝ 不凍結");
});
T("預算池、海底（決定 0056、0057）：成功從預算池扣、沒撈到沉到海底；預算池＋海底＋莊家＋錢包加起來不變", G => {
  const C = G.NUM.casino.econ;
  const sum = s => s.house.budget + s.house.sea + s.house.bankroll + s.w.chips;
  let s = fresh(G); assert.strictEqual(s.house.budget, C.budgetStart);
  let t0 = sum(s), b0 = s.house.budget;
  let r = G.casEconPlay(s.w, s.house, D1, seq(atR(G, 50), 0.3, 0.99));
  assert.ok(r.win); assert.strictEqual(s.house.budget, b0 - 50 * C.winPer); assert.strictEqual(sum(s), t0);
  assert.strictEqual(r.budgetBefore, b0); assert.strictEqual(r.budgetAfter, s.house.budget);
  s = fresh(G); t0 = sum(s); b0 = s.house.budget;
  r = G.casEconPlay(s.w, s.house, D1, seq(atR(G, 20), C.lootPct / 100)); // 沒撈到
  assert.ok(!r.win && !r.loot); assert.strictEqual(s.house.budget, b0, "不回預算池"); assert.strictEqual(s.house.sea, 20 * C.losePer); assert.strictEqual(sum(s), t0);
  assert.strictEqual(r.seaBefore, 0); assert.strictEqual(r.seaAfter, 20 * C.losePer);
  s = fresh(G); t0 = sum(s); b0 = s.house.budget;
  r = G.casEconPlay(s.w, s.house, D1, seq(atR(G, 20), 0)); // 撈到：預算池、海底都不動
  assert.ok(r.loot); assert.strictEqual(s.house.budget, b0); assert.strictEqual(s.house.sea, 0); assert.strictEqual(sum(s), t0);
  s = fresh(G); r = G.casEconPlay(s.w, s.house, D1, seq(atR(G, 50), 0.3, 0.99)); // 成功：海底不動
  assert.ok(r.win && s.house.sea === 0);
  // 不夠也照拚，變成負的（只記帳，先不擋）
  s = fresh(G); s.house.budget = 100;
  r = G.casEconPlay(s.w, s.house, D1, seq(atR(G, 40), 0, 0.99));
  assert.ok(r.ok && r.win && s.house.budget === 100 - 40 * C.winPer);
  // 舊的莊家沒有 budget：補上；壞資料也補；破產重開不動預算池
  assert.strictEqual(G.casHouseFix({ v: 1, bankroll: 5 }, D1).house.budget, C.budgetStart);
  assert.strictEqual(G.casHouseFix({ v: 1, bankroll: 5, budget: "壞" }, D1).house.budget, C.budgetStart);
  assert.strictEqual(G.casHouseFix({ v: 1, bankroll: 5 }, D1).house.sea, 0);
  assert.strictEqual(G.casHouseFix({ v: 1, bankroll: 5, sea: "壞" }, D1).house.sea, 0);
  const h = G.casHouseFix({ v: 1, bankroll: -9, budget: 123, sea: 45, day: D1 }, D2).house;
  assert.ok(h.bankroll === G.NUM.casino.houseReset && h.budget === 123 && h.sea === 45);
});
T("成功邊界：r = 31 成功、r = 30 失敗", G => {
  const C = G.NUM.casino.econ;
  assert.strictEqual(G.casEconRoll(seq(atR(G, C.winAbove + 1), 0, 0.99)).win, true);
  assert.strictEqual(G.casEconRoll(seq(atR(G, C.winAbove), 0)).win, false);
  assert.strictEqual(G.casEconRoll(seq(0.9999999)).r, C.rMax);
  assert.strictEqual(G.casEconRoll(seq(0)).r, 0);
});
T("成功：莊家 +r×30000，錢包不動，次數 +1，統計對得上", G => {
  const C = G.NUM.casino.econ, { w, house } = fresh(G), c0 = w.chips, h0 = house.bankroll;
  const r = G.casEconPlay(w, house, D1, seq(atR(G, 50), 0.3, 0.99));
  assert.ok(r.ok && r.win && r.r === 50 && r.amount === 50 * C.winPer && r.policy === Math.floor(0.3 * G.CAS_ECON.policies.length));
  assert.strictEqual(house.bankroll, h0 + 50 * C.winPer); assert.strictEqual(w.chips, c0);
  assert.strictEqual(r.houseBefore, h0); assert.strictEqual(r.houseAfter, house.bankroll);
  assert.strictEqual(w.ec.n, 1); assert.strictEqual(w.ec.wins, 1); assert.strictEqual(r.left, C.perDay - 1);
  assert.ok(r.lines.some(l => l.includes(G.CAS_ECON.policies[r.policy])));
});
T("大禮包券：機率邊界（8% 以內有、剛好 8% 沒有），要先開過今天的大禮包", G => {
  const C = G.NUM.casino.econ;
  let s = fresh(G); s.w.pk.opened = 1; const t0 = s.w.tickets;
  let r = G.casEconPlay(s.w, s.house, D1, seq(atR(G, 60), 0, (C.ticketPct - 0.01) / 100));
  assert.ok(r.ticket && s.w.tickets === t0 + 1);
  s = fresh(G); s.w.pk.opened = 1;
  r = G.casEconPlay(s.w, s.house, D1, seq(atR(G, 60), 0, C.ticketPct / 100));
  assert.ok(!r.ticket && s.w.tickets === 0);
  s = fresh(G); assert.strictEqual(s.w.pk.opened, 0); // 沒開過：就算骰到也沒有
  r = G.casEconPlay(s.w, s.house, D1, seq(atR(G, 60), 0, 0));
  assert.ok(!r.ticket && s.w.tickets === 0);
  s = fresh(G); s.w.pk.opened = 1; // 失敗不給券
  r = G.casEconPlay(s.w, s.house, D1, seq(atR(G, 10), 0.99));
  assert.ok(!r.win && !r.ticket && s.w.tickets === 0);
});
T("失敗、沒撈到：莊家 -r×10000，錢包不動", G => {
  const C = G.NUM.casino.econ, { w, house } = fresh(G), c0 = w.chips, h0 = house.bankroll;
  const r = G.casEconPlay(w, house, D1, seq(atR(G, 20), C.lootPct / 100)); // 剛好 55% 算沒撈到
  assert.ok(r.ok && !r.win && r.amount === 20 * C.losePer && r.loot === 0 && r.policy === null);
  assert.strictEqual(house.bankroll, h0 - 20 * C.losePer); assert.strictEqual(w.chips, c0);
  assert.strictEqual(w.ec.fails, 1); assert.strictEqual(w.ec.loot, 0);
});
T("失敗、撈到油水：莊家 -x，按的人 +x（同額），兩邊加起來不變", G => {
  const C = G.NUM.casino.econ, { w, house } = fresh(G), c0 = w.chips, h0 = house.bankroll;
  const r = G.casEconPlay(w, house, D1, seq(atR(G, 30), (C.lootPct - 0.01) / 100)); // r = 30 還是失敗
  assert.ok(r.ok && !r.win && r.amount === 30 * C.losePer && r.loot === 30 * C.losePer);
  assert.strictEqual(house.bankroll, h0 - r.amount); assert.strictEqual(w.chips, c0 + r.amount);
  assert.strictEqual(w.chips + house.bankroll, c0 + h0, "守恆");
  assert.strictEqual(w.ec.loot, r.amount); assert.ok(w.st.chipsMax >= w.chips);
});
T("r = 0 的失敗：沒有石沉大海，也不撈油水", G => {
  const { w, house } = fresh(G), c0 = w.chips, h0 = house.bankroll;
  const r = G.casEconPlay(w, house, D1, seq(0, 0));
  assert.ok(r.ok && !r.win && r.amount === 0 && r.loot === 0);
  assert.strictEqual(house.bankroll, h0); assert.strictEqual(w.chips, c0);
  assert.ok(!r.lines.some(l => l.includes("共有") && l.includes("石沉大海")), "沒有數字的石沉大海");
});
T("每日上限：第 4 次被擋，什麼都不改；換日重算", G => {
  const C = G.NUM.casino.econ, { w, house } = fresh(G);
  for (let i = 0; i < C.perDay; i++) assert.ok(G.casEconPlay(w, house, D1, seq(atR(G, 50), 0, 0.99)).ok);
  const h = house.bankroll, c = w.chips;
  const r = G.casEconPlay(w, house, D1, seq(atR(G, 50), 0, 0.99));
  assert.ok(!r.ok && r.reason); assert.strictEqual(house.bankroll, h); assert.strictEqual(w.chips, c);
  assert.strictEqual(w.ec.n, C.perDay); assert.strictEqual(G.casEconLeft(w, D1), 0);
  assert.strictEqual(G.casEconLeft(w, D2), C.perDay, "換日重算");
  assert.ok(G.casEconPlay(w, house, D2, seq(atR(G, 50), 0, 0.99)).ok);
  assert.strictEqual(w.ec.n, 1); assert.strictEqual(w.ec.wins, C.perDay + 1, "累計不歸零");
});
T("連點：同一個錢包連叫很多次，只有 perDay 次算數", G => {
  const C = G.NUM.casino.econ, { w, house } = fresh(G);
  let okN = 0;
  for (let i = 0; i < 20; i++) if (G.casEconPlay(w, house, D1, seq(atR(G, 40), 0, 0.99)).ok) okN++;
  assert.strictEqual(okN, C.perDay);
});
T("莊家破產中拚回正：rescued、有提示；沒拚回正就沒有", G => {
  const C = G.NUM.casino.econ;
  let { w, house } = fresh(G);
  house.bankroll = -100000; // 破產中
  let r = G.casEconPlay(w, house, D1, seq(atR(G, 31), 0, 0.99)); // +930000
  assert.ok(r.win && r.rescued && house.bankroll === -100000 + 31 * C.winPer && house.bankroll >= 0);
  assert.ok(r.lines.some(l => l.includes("把莊家拚回來了")));
  assert.strictEqual(w.ec.rescues, 1);
  ({ w, house } = fresh(G)); house.bankroll = -5000000;
  r = G.casEconPlay(w, house, D1, seq(atR(G, 31), 0, 0.99));
  assert.ok(r.win && !r.rescued && house.bankroll < 0 && !r.lines.some(l => l.includes("拚回來")));
  ({ w, house } = fresh(G)); // 本來就是正的：不是「拚回來」
  r = G.casEconPlay(w, house, D1, seq(atR(G, 90), 0, 0.99));
  assert.ok(r.win && !r.rescued);
});
T("跟 houseReopen 不打架：拚回正之後換日不會再被借；沒拚回正照舊被借", G => {
  const { w, house } = fresh(G, D1);
  house.bankroll = -100000;
  G.casEconPlay(w, house, D1, seq(atR(G, 90), 0, 0.99));
  const b = house.bankroll, rs = house.reopened;
  const fix = G.casHouseFix(house, D2);
  assert.strictEqual(fix.reopen, null); assert.strictEqual(fix.house.bankroll, b); assert.strictEqual(fix.house.reopened, rs);
  const h2 = G.casHouseFix(Object.assign(G.casHouseNew(), { bankroll: -1, day: D1 }), D2);
  assert.ok(h2.reopen && h2.house.bankroll === G.NUM.casino.houseReset);
});
T("失敗讓莊家掉到負的：下一次成功才算拚回來", G => {
  const { w, house } = fresh(G);
  house.bankroll = 100000;
  let r = G.casEconPlay(w, house, D1, seq(atR(G, 30), 0.99)); // -300000 → -200000
  assert.ok(!r.win && house.bankroll === -200000);
  r = G.casEconPlay(w, house, D1, seq(atR(G, 100), 0, 0.99)); // +3000000
  assert.ok(r.rescued && house.bankroll === 2800000);
});
T("舊錢包沒有 ec、壞資料：補起來不丟錯", G => {
  const { w, house } = fresh(G);
  delete w.ec; assert.ok(G.casEconPlay(w, house, D1, seq(0.5, 0, 0)).ok && w.ec.n === 1);
  for (const bad of [null, 5, "x", [], { n: "abc", day: 7, wins: -3, loot: NaN }]) {
    const x = fresh(G); x.w.ec = bad;
    const e = G.casEconFix(x.w, D1);
    assert.ok(e.n === 0 && e.wins === 0 && e.loot === 0, JSON.stringify(bad));
    assert.ok(G.casEconPlay(x.w, x.house, D1, seq(0.5, 0, 0)).ok);
  }
  const y = fresh(G); y.w.ec = { day: D1, n: 99 };
  assert.ok(!G.casEconPlay(y.w, y.house, D1, seq(0.5)).ok, "次數壞成很大也擋");
});
T("看得到的次數：casEconView", G => {
  const C = G.NUM.casino.econ, { w, house } = fresh(G);
  assert.deepStrictEqual(JS(G.casEconView(w, D1)), { left: C.perDay, perDay: C.perDay });
  G.casEconPlay(w, house, D1, seq(0.5, 0, 0));
  assert.strictEqual(G.casEconView(w, D1).left, C.perDay - 1);
});
T("亂數沒給就用 RNG（可固定）；不是函式就不做", G => {
  const { w, house } = fresh(G);
  G.setRng(G.mulberry32(7));
  const a = G.casEconPlay(w, house, D1);
  const f2 = fresh(G); G.setRng(G.mulberry32(7));
  const b = G.casEconPlay(f2.w, f2.house, D1);
  assert.deepStrictEqual(JS(a), JS(b));
  assert.ok(!G.casEconPlay(w, house, D1, "不是函式").ok);
});
T("兩萬次模擬：成功率約 70%、撈到約 55%（失敗裡）、守恆", G => {
  const C = G.NUM.casino.econ;
  G.setRng(G.mulberry32(12345));
  let wins = 0, fails = 0, loot = 0, tix = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const { w, house } = fresh(G); w.pk.opened = 1;
    const c0 = w.chips, h0 = house.bankroll, r = G.casEconPlay(w, house, D1);
    if (r.win) { wins++; assert.strictEqual(house.bankroll - h0, r.r * C.winPer); assert.strictEqual(w.chips, c0); if (r.ticket) tix++; }
    else { fails++; assert.strictEqual(h0 - house.bankroll, r.r * C.losePer); assert.strictEqual(w.chips - c0, r.loot); if (r.loot) loot++; }
  }
  const pw = wins / N, pl = loot / fails, pt = tix / wins;
  assert.ok(Math.abs(pw - 70 / 101) < 0.02, "成功率 " + pw);
  assert.ok(Math.abs(pl - C.lootPct / 100) < 0.03, "撈到 " + pl);
  assert.ok(Math.abs(pt - C.ticketPct / 100) < 0.015, "券 " + pt);
});
// ---------- 文字界線（決定 0048） ----------
T("文字：8 個政策口號、七大策略都在", G => {
  assert.strictEqual(G.CAS_ECON.policies.length, 8); assert.strictEqual(G.CAS_ECON.how.length, 7);
  for (const k of ["兩岸服務業", "自由經濟示範區", "新鄭和計畫", "三業四化", "合宜住宅", "LED路燈"]) assert.ok(G.CAS_ECON.policies.join().includes(k), k);
  assert.ok(G.CAS_ECON.why.startsWith("鑒於面臨歐債危機"));
  assert.ok(G.CAS_ECON.slogan.includes("拚") && G.CAS_ECON.slogan.includes("做 就對了"));
});
T("文字：油水和政策名字不在同一句，失敗的每一句都不含政策名字（每個政策、每種結果都試）", G => {
  const pol = G.CAS_ECON.policies;
  for (let p = 0; p < pol.length; p++) for (const lootOn of [0, 1]) for (const win of [true, false]) {
    const { w, house } = fresh(G); w.pk.opened = 1;
    const r = G.casEconPlay(w, house, D1, win ? seq(atR(G, 70), (p + 0.5) / pol.length, 0) : seq(atR(G, 25), lootOn ? 0 : 0.99));
    if (!win && lootOn) assert.ok(r.loot > 0);
    for (const l of r.lines) {
      assert.ok(!(l.includes("油水") && pol.some(x => l.includes(x))), "油水和政策同一句：" + l);
      if (!r.win) assert.ok(!pol.some(x => l.includes(x)), "失敗的句子有政策名字：" + l);
      if (r.win) assert.ok(!l.includes("油水"), "成功不撈油水：" + l);
    }
  }
  assert.ok(G.CAS_ECON.chat.every(l => !(l.includes("油水") && pol.some(x => l.includes(x)))));
});
T("文字：沒有真人名字、頭銜、政黨、Pepe；介面文字用「壹」不用「一」", G => {
  const all = JSON.stringify(G.CAS_ECON);
  for (const bad of ["總統", "院長", "部長", "市長", "立委", "委員", "國民黨", "民進黨", "民眾黨", "共產黨", "馬英九", "蔡英文", "賴清德", "柯文哲", "韓國瑜", "貪污", "貪腐", "收賄", "Pepe", "佩佩蛙"]) assert.ok(!all.includes(bad), bad);
  const ui = [G.CAS_ECON.intro, G.CAS_ECON.rule, ...G.CAS_ECON.chat, ...G.CAS_ECON.cheer, G.CAS_ECON.okRescue, G.CAS_ECON.okRescueSub, G.CAS_ECON.failLoot, G.CAS_ECON.failNone, G.CAS_ECON.okTicket];
  for (const l of ui) assert.ok(!/一[張個次點下起]/.test(l), "該用壹：" + l);
});
console.log(`拚經濟：${pass} 過，${fail} 失敗`);
process.exit(fail ? 1 : 0);
