// 每個系統一組自動測試：node test/logic.test.cjs（或 npm test 一次跑全部）
// 規則在 shared/（ES 模組）；load() 每次都載入一份全新的（見 load_shared.cjs）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let G = load();
let pass = 0, fail = 0;
const T = (name, fn) => { try { G = load(); fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
// 讓下一次 d100 擲出 N
const d100 = N => { const t = N === 100 ? 0 : Math.floor(N / 10), u = N === 100 ? 0 : N % 10; return [(t + 0.5) / 10, (u + 0.5) / 10]; };
const dN = (v, n) => (v - 0.5) / n; // 讓 1Dn 擲出 v
function seq(...vals) { const q = vals.flat(); return () => q.length ? q.shift() : Math.random(); }
function fresh(mode = "challenge") { const P = G.newProfile(mode); G.ensureDay(P, "2026-11-08"); return P; }
const unlockAll = P => { G.CATS.forEach(c => G.PEPE_PARTS.find(p => p.name === c).options.forEach(o => { if (!o.forbidden && !o.mutant && !o.mix && !o.gift && !o.limited && !o.key && !P.unlocked[c].includes(o.name)) P.unlocked[c].push(o.name); })); };

// ---------- A 解鎖 ----------
T("A 一開始 32 種，解鎖巫師帽變 48", () => {
  const P = fresh();
  assert.strictEqual(G.possibilities(P), 32);
  assert.strictEqual(G.BASE_TOTAL, 4 * 4 * 4 * 4 * 5);
  P.insp = 100;
  const r = G.doUnlock(P, "帽子", "巫師帽");
  assert.ok(r.ok, r.reason);
  assert.strictEqual(r.events[0].from, 32); assert.strictEqual(r.events[0].to, 48);
  assert.strictEqual(P.insp, 100 - G.NUM.unlockCosts[0]);
});
T("A 越後面越貴", () => {
  const P = fresh(); P.insp = 999;
  const costs = [];
  [["帽子", "巫師帽"], ["姿勢", "躺平"], ["顏色", "黃"], ["心情", "生氣"]].forEach(([c, n]) => { costs.push(G.unlockCost(P)); assert.ok(G.doUnlock(P, c, n).ok); });
  for (let i = 1; i < costs.length; i++) assert.ok(costs[i] > costs[i - 1]);
});
T("A 條件：俄國8 要先看奇怪的畫、傳說級要先有超稀有、比讚要 2 張委託", () => {
  const P = fresh(); P.insp = 999;
  assert.strictEqual(G.unlockState(P, "心情", "俄國8+9").state, "req");
  P.seen.strange = 1;
  assert.strictEqual(G.unlockState(P, "心情", "俄國8+9").state, "buy");
  assert.strictEqual(G.unlockState(P, "稀有度", "傳說級稀有").state, "req");
  G.doUnlock(P, "稀有度", "超稀有");
  assert.strictEqual(G.unlockState(P, "稀有度", "傳說級稀有").state, "buy");
  assert.strictEqual(G.unlockState(P, "姿勢", "比讚").state, "req");
  P.done = 2;
  assert.strictEqual(G.unlockState(P, "姿勢", "比讚").state, "buy");
  assert.strictEqual(G.unlockState(P, "顏色", "黑").state, "req");
  assert.strictEqual(G.unlockState(P, "帽子", "觸手帽").state, "forbidden");
});
T("A 靈感不夠不能解鎖", () => {
  const P = fresh(); P.insp = 3;
  const r = G.doUnlock(P, "帽子", "巫師帽");
  assert.ok(!r.ok); assert.strictEqual(P.insp, 3); assert.strictEqual(G.possibilities(P), 32);
});
T("A 自由模式全開：1,600 種（含禁忌）", () => {
  const P = fresh("free");
  assert.strictEqual(G.possibilities(P), G.ALL_TOTAL);
  assert.ok(G.ALL_TOTAL > 1024);
});

// ---------- B 擲稀有度 ----------
T("B d100 對照表 01–02 傳說、03–12 超稀有、13–40 稀有、41–97 普通、98–100 失敗作", () => {
  const P = fresh(); unlockAll(P);
  const at = n => G.rarityOfRoll(P, n, n);
  assert.strictEqual(at(2).rarity, "傳說級稀有"); assert.strictEqual(at(3).rarity, "超稀有");
  assert.strictEqual(at(12).rarity, "超稀有"); assert.strictEqual(at(13).rarity, "稀有");
  assert.strictEqual(at(40).rarity, "稀有"); assert.strictEqual(at(41).rarity, "普通");
  assert.ok(at(1).perfect); assert.ok(at(100).failed);
  assert.ok(at(98).failed); assert.ok(at(99).failed); assert.ok(!at(97).failed); assert.strictEqual(at(97).rarity, "普通");
});
T("B 還沒解鎖的稀有度會降級", () => {
  const P = fresh();
  const r = G.rarityOfRoll(P, 2, 2);
  assert.strictEqual(r.rarity, "稀有"); assert.ok(r.capped); assert.strictEqual(r.want, "傳說級稀有");
});
T("B 花心情：最多壓到 02；100 和孤注一擲不能花", () => {
  const P = fresh(); P.mood = 50;
  assert.strictEqual(G.spendRange(P, 7, false), 5);
  assert.strictEqual(G.spendRange(P, 2, false), 0);
  assert.strictEqual(G.spendRange(P, 100, false), 0); assert.strictEqual(G.spendRange(P, 98, false), 0);
  assert.strictEqual(G.spendRange(P, 60, true), 0);
  P.mood = 3; assert.strictEqual(G.spendRange(P, 60, false), 3);
});
T("B 做一隻：花 NUM.costPepe 靈感、花心情、新收藏", () => {
  const P = fresh(); unlockAll(P); P.insp = G.NUM.costPepe + 4; P.mood = 50;
  const pick = { 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" };
  G.setRng(seq(d100(7)));
  const s = G.startMake(P, pick);
  assert.ok(s.ok); assert.strictEqual(s.roll.total, 7); assert.strictEqual(P.insp, 4);
  const res = G.finishMake(P, pick, { natural: 7, spent: 5, pushed: false });
  assert.strictEqual(res.pick.稀有度, "傳說級稀有"); assert.strictEqual(P.mood, 45); assert.ok(res.isNew);
  assert.ok(P.pepes[res.key]);
  G.setRng(null);
});
T("B 01 完美作品＋免費解鎖；100 失敗作", () => {
  const P = fresh(); P.insp = 10;
  const pick = { 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" };
  const before = G.possibilities(P);
  const res = G.finishMake(P, pick, { natural: 1, spent: 0 });
  assert.ok(res.perfect); assert.ok(P.pepes[res.key].perfect);
  assert.ok(res.events.some(e => e.type === "unlock" && e.how === "free"));
  assert.ok(G.possibilities(P) > before);
  const f = G.finishMake(P, pick, { natural: 100, spent: 0 });
  assert.ok(f.failed); assert.ok(P.failed[f.key]);
  assert.ok(f.events.some(e => e.type === "badge" && e.id === "failed"));
});
T("B 不可名狀：神話 10 以上、原本擲出 01 才會出現", () => {
  const P = fresh(); unlockAll(P);
  G.addMyth(P, 10);
  assert.ok(P.unlocked.稀有度.includes("不可名狀"));
  assert.strictEqual(G.rarityOfRoll(P, 1, 1).rarity, "不可名狀");
  assert.strictEqual(G.rarityOfRoll(P, 2, 7).rarity, "傳說級稀有");
  assert.strictEqual(G.rarityOfRoll(P, 2, 2).rarity, "不可名狀", "神話 10：01～02");
  assert.notStrictEqual(G.rarityOfRoll(P, 3, 3).rarity, "不可名狀");
  assert.strictEqual(G.rarityOfRoll(P, 2, 2).perfect, false, "02 不是完美作品");
  G.addMyth(P, 5); assert.strictEqual(G.eldritchUpTo(P), 3, "神話 15：01～03");
  G.addMyth(P, 50); assert.strictEqual(G.eldritchUpTo(P), 5, "最寬 01～05");
  const Q = fresh(); unlockAll(Q); Q.myth = 9; assert.strictEqual(G.eldritchUpTo(Q), 0);
});
T("B 靈感不夠不能做；收藏狂發作不能做重複的", () => {
  const P = fresh(); P.insp = 1;
  const pick = { 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" };
  assert.ok(!G.canMake(P, pick).ok);
  P.insp = 10;
  G.finishMake(P, pick, { natural: 50 });
  P.bout = { i: 9, left: 3 };
  assert.ok(!G.canMake(P, pick).ok);
  assert.ok(G.canMake(P, Object.assign({}, pick, { 顏色: "綠" })).ok);
});

// ---------- C 委託 ----------
T("C 同一天的委託都一樣、3 張、都做得到", () => {
  const P = fresh();
  const a = JSON.stringify(G.dailyCommissions(P, "2026-11-08"));
  P.daily = null;
  const b = JSON.stringify(G.dailyCommissions(P, "2026-11-08"));
  assert.strictEqual(a, b);
  const list = JSON.parse(a).filter(c => c.kind !== "line");
  assert.strictEqual(list.length, 3);
  list.forEach(c => assert.ok(c.kind === "precise" || G.needSatisfiable(P, c), c.id));
  P.daily = null;
  const c = JSON.stringify(G.dailyCommissions(P, "2026-11-09"));
  assert.notStrictEqual(a, c);
});
T("C 謎語「家在莫斯科」要先解鎖俄國8 才會出現", () => {
  const P = fresh();
  const r1 = G.COMMISSION_POOL.find(c => c.id === "r1");
  assert.ok(!G.needSatisfiable(P, r1));
  P.unlocked.心情.push("俄國8+9");
  assert.ok(G.needSatisfiable(P, r1));
});
T("C 交件：對的給靈感和理智，錯的彈回", () => {
  const P = fresh(); P.sanity = 50;
  const list = G.dailyCommissions(P, "2026-11-08");
  const c = list[0];
  const right = Object.assign({ 稀有度: "稀有" }, c.need);
  const wrongPick = Object.assign({}, right, { 顏色: right.顏色 === "紅" ? "綠" : "紅" });
  G.finishMake(P, right, { natural: 30 }); G.finishMake(P, wrongPick, { natural: 30 });
  const bad = G.deliver(P, 0, { kind: "pepe", key: G.pepeKey(wrongPick) });
  assert.ok(!bad.ok);
  const insp = P.insp;
  const ok = G.deliver(P, 0, { kind: "pepe", key: G.pepeKey(right) });
  assert.ok(ok.ok); assert.strictEqual(P.insp, insp + c.reward); assert.ok(P.sanity > 50); assert.strictEqual(P.done, 1);
  assert.ok(!G.deliver(P, 0, { kind: "pepe", key: G.pepeKey(right) }).ok);
  assert.strictEqual(P.comments.length, 1);
});
T("C 抱枕委託：要對的抱枕和印的佩佩", () => {
  const P = fresh(); unlockAll(P);
  const p1 = G.COMMISSION_POOL.find(c => c.id === "p1");
  const leg = { 稀有度: "傳說級稀有", 心情: "開心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" };
  G.finishMake(P, leg, { natural: 1 });
  const goodKey = G.pillowKeyOf({ 尺寸: "等身大", 材質: "絨毛", 填充: "剛剛好" }, "p:" + G.pepeKey(leg));
  const badKey = G.pillowKeyOf({ 尺寸: "標準", 材質: "絨毛", 填充: "剛剛好" }, "p:" + G.pepeKey(leg));
  P.pillows[goodKey] = 1; P.pillows[badKey] = 1;
  assert.ok(G.checkDelivery(P, p1, { kind: "pillow", key: goodKey }));
  assert.ok(!G.checkDelivery(P, p1, { kind: "pillow", key: badKey }));
  assert.ok(!G.checkDelivery(P, p1, { kind: "pepe", key: G.pepeKey(leg) }));
});
T("C 每一張委託的 need 都用得到合法選項", () => {
  const P = fresh("free");
  G.COMMISSION_POOL.forEach(c => { if (c.kind !== "pillow") assert.ok(G.needSatisfiable(P, c), c.id); });
});

// ---------- D 圖鑑、徽章 ----------
T("D 1,024 格編號來回一致", () => {
  for (let i = 0; i < G.BASE_TOTAL; i++) assert.strictEqual(G.codexIndex(G.codexPick(i)), i);
  assert.strictEqual(G.catalogNo(G.codexPick(236)), "No. 0237");
});
T("D 徽章：四種心情打開「黑」的條件", () => {
  const P = fresh(); P.unlocked.心情.push("生氣", "俄國8+9");
  ["開心", "傷心", "生氣", "俄國8+9"].forEach(m => G.finishMake(P, { 稀有度: "普通", 心情: m, 顏色: "紅", 帽子: "沒有", 姿勢: "站著" }, { natural: 50 }));
  assert.ok(P.badges.fourMoods); assert.ok(P.badges.first);
  assert.strictEqual(G.unlockState(P, "顏色", "黑").state, "buy");
});
T("D 某一類全收集 +2D6 理智（只給一次）", () => {
  const P = fresh(); unlockAll(P); P.sanity = 40;
  for (let i = 0; i < G.BASE_TOTAL; i++) { const p = G.codexPick(i); if (p.顏色 === "紅") P.pepes[G.pepeKey(p)] = { n: 1, s: i }; }
  const ev = G.progressEvents(P);
  const row = ev.find(e => e.type === "row" && e.opt === "紅");
  assert.ok(row); assert.ok(P.sanity > 40);
  assert.ok(!G.progressEvents(P).some(e => e.type === "row" && e.opt === "紅"));
});

// ---------- E 展廳 ----------
T("E 憤怒之廳、彩虹、分數上限 100", () => {
  const P = fresh(); unlockAll(P);
  const mk = (o, nat = 50) => G.finishMake(P, Object.assign({ 稀有度: "普通", 心情: "生氣", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" }, o), { natural: nat });
  const a = [mk({}), mk({ 顏色: "綠" }), mk({ 顏色: "黃" })];
  a.forEach((r, i) => G.placeInHall(P, i, { kind: "pepe", key: r.key }));
  assert.strictEqual(G.hallScore(P).theme, "angry");
  assert.ok(P.themesSeen.angry); assert.ok(P.badges.curator);
  const b = mk({ 顏色: "黑", 心情: "開心" });
  G.placeInHall(P, 3, { kind: "pepe", key: b.key });
  assert.ok(G.hallScore(P).themes.includes("rainbow"));
  for (let i = 0; i < 6; i++) { const r = mk({ 帽子: ["沒有", "棒球帽", "巫師帽", "皇冠"][i % 4], 姿勢: ["站著", "坐著", "躺平"][i % 3], 顏色: ["紅", "綠", "黃", "黑"][i % 4] }, 1); G.placeInHall(P, i, { kind: "pepe", key: r.key }); }
  assert.strictEqual(G.hallScore(P).score, 100);
  assert.strictEqual(G.endingDue(P), "museum");
});
T("E 主題展的進度跟 hallThemes 壹致", () => {
  const P = fresh(); unlockAll(P);
  const mk = o => G.finishMake(P, Object.assign({ 稀有度: "普通", 心情: "生氣", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" }, o), { natural: 50 });
  [mk({}), mk({ 顏色: "綠" })].forEach((r, i) => G.placeInHall(P, i, { kind: "pepe", key: r.key }));
  let tp = G.themeProgress(G.hallScore(P).items), a = tp.find(t => t.id === "angry");
  assert.deepStrictEqual([a.have, a.need, a.ok], [2, 3, false]);
  G.placeInHall(P, 2, { kind: "pepe", key: mk({ 顏色: "黃" }).key });
  tp = G.themeProgress(G.hallScore(P).items); a = tp.find(t => t.id === "angry");
  assert.deepStrictEqual([a.have, a.need, a.ok], [3, 3, true]);
  assert.strictEqual(tp.find(t => t.id === "rainbow").have, 3);
  tp.forEach(t => assert.strictEqual(t.ok, G.hallScore(P).themes.includes(t.id), t.id));
});
// ---------- 一天：台灣時間 05:00 換日、週一 05:00 換週（決定 0019，11-09 拿掉「壹天多長」） ----------
// 時間一律傳進去（台灣時間的字串轉成毫秒），不碰真的時鐘。台灣＝UTC+8：台灣 05:00 ＝ UTC 前一天 21:00
const TW = s => Date.parse(s + "+08:00"); // "2026-11-09T05:00:00" 當成台灣時間
T("台灣時間 04:59 和 05:00 是不同天；todayStr、realTodayStr、taipeiDay 一樣", () => {
  assert.strictEqual(G.taipeiDay(TW("2026-11-09T04:59:59")), "2026-11-08");
  assert.strictEqual(G.taipeiDay(TW("2026-11-09T05:00:00")), "2026-11-09");
  assert.strictEqual(G.taipeiDay(TW("2026-11-09T00:30:00")), "2026-11-08", "半夜 00:30 還算前一天");
  assert.strictEqual(G.taipeiDay(TW("2026-11-09T23:59:59")), "2026-11-09");
  assert.strictEqual(G.taipeiDay(TW("2027-01-01T05:00:00")), "2027-01-01");
  assert.strictEqual(G.taipeiDay(TW("2027-01-01T04:00:00")), "2026-12-31", "跨年要等到 05:00");
  [TW("2026-11-09T04:59:59"), TW("2026-11-09T05:00:00"), TW("2028-02-29T12:00:00")].forEach(ms => {
    assert.strictEqual(G.todayStr(ms), G.taipeiDay(ms));
    assert.strictEqual(G.realTodayStr(ms), G.taipeiDay(ms));
    assert.strictEqual(G.todayStr(new Date(ms)), G.taipeiDay(ms), "給 Date 也可以");
  });
  assert.throws(() => G.taipeiDay(), /毫秒/);
  assert.strictEqual(G.todayStr(), G.taipeiDay(Date.now()), "不給時間＝現在");
  assert.strictEqual(G.realTodayStr(), G.todayStr(), "公佈欄、信箱的日期跟 todayStr 一樣");
});
T("setDayClock 蓋掉「今天」：todayStr()、realTodayStr() 一起變；給了時間的不受影響；addDays 不受影響", () => {
  G.setDayClock(() => "2030-01-01");
  try {
    assert.strictEqual(G.todayStr(), "2030-01-01"); assert.strictEqual(G.realTodayStr(), "2030-01-01");
    assert.strictEqual(G.todayStr(TW("2026-11-09T05:00:00")), "2026-11-09");
    assert.strictEqual(G.addDays("2026-11-30", 1), "2026-12-01"); assert.strictEqual(G.addDays("2026-03-01", -1), "2026-02-28");
    assert.strictEqual(G.addDays("2028-02-28", 1), "2028-02-29"); assert.strictEqual(G.addDays("2026-12-31", 1), "2027-01-01");
  } finally { G.setDayClock(null); }
  assert.strictEqual(G.daysBetween("2026-11-08", "2026-12-01"), 23);
});
T("網路的時間：setNowClock 換掉「現在」，todayStr、secToNextDay、換日、每週活動都照它走（決定 0026）", () => {
  let now = TW("2026-11-15T23:00:00"); // 星期日晚上
  G.setNowClock(() => now);
  try {
    assert.strictEqual(G.nowMs(), now);
    assert.strictEqual(G.todayStr(), "2026-11-15"); assert.strictEqual(G.realTodayStr(), "2026-11-15");
    assert.strictEqual(G.secToNextDay(), 6 * 3600);
    const P = G.newProfile("challenge"); assert.strictEqual(P.created, "2026-11-15", "新的博物館：建立的日期也照網路的時間");
    G.ensureDay(P); assert.strictEqual(P.day.date, "2026-11-15");
    const w = G.weeklyState(P).w, nid = G.weeklyNotice(P).id;
    now = TW("2026-11-16T04:59:59"); // 週一 04:59：還是同一天、同一週
    assert.strictEqual(G.ensureDay(P), null); assert.strictEqual(G.secToNextDay(), 1);
    now = TW("2026-11-16T05:00:00"); // 週一 05:00：換日、換週
    const r = G.ensureDay(P);
    assert.ok(r && !r.firstEver); assert.strictEqual(P.day.date, "2026-11-16");
    assert.strictEqual(G.weeklyState(P).w, w + 1); assert.notStrictEqual(G.weeklyNotice(P).id, nid);
    assert.strictEqual(G.gameDayNo(P), 2);
    // 給了時間的不看「現在」；setDayClock 給的日期比「現在」優先
    assert.strictEqual(G.todayStr(TW("2026-12-01T12:00:00")), "2026-12-01");
    G.setDayClock(() => "2030-01-01"); assert.strictEqual(G.todayStr(), "2030-01-01"); G.setDayClock(null);
    // 換掉的時鐘壞了（不是數字）：照電腦的時間
    G.setNowClock(() => NaN); assert.ok(Math.abs(G.nowMs() - Date.now()) < 1000);
    G.setNowClock(() => undefined); assert.strictEqual(G.todayStr(), G.taipeiDay(Date.now()));
  } finally { G.setNowClock(null); G.setDayClock(null); }
  assert.ok(Math.abs(G.nowMs() - Date.now()) < 1000, "拿掉之後照電腦的時間");
});
T("secToNextDay：算到下一個台灣 05:00", () => {
  assert.strictEqual(G.secToNextDay(TW("2026-11-09T04:59:59")), 1);
  assert.strictEqual(G.secToNextDay(TW("2026-11-09T05:00:00")), 86400, "剛換日：還有一整天");
  assert.strictEqual(G.secToNextDay(TW("2026-11-09T23:00:00")), 6 * 3600);
  assert.strictEqual(G.secToNextDay(TW("2026-11-09T00:00:00")), 5 * 3600);
  assert.strictEqual(G.secToNextDay(TW("2026-11-09T12:34:56.500")), 16 * 3600 + 25 * 60 + 4, "不到一秒的算一秒");
  const s = G.secToNextDay();
  assert.ok(s >= 1 && s <= 86400);
});
T("換週：台灣時間週日 23:00 和週一 05:00 是不同週；週一 04:59 還是上一週", () => {
  assert.strictEqual(new Date(Date.UTC(2026, 10, 16)).getUTCDay(), 1, "2026-11-16 是星期一");
  const sun = G.todayStr(TW("2026-11-15T23:00:00")), mon459 = G.todayStr(TW("2026-11-16T04:59:00")), mon5 = G.todayStr(TW("2026-11-16T05:00:00"));
  assert.deepStrictEqual([sun, mon459, mon5], ["2026-11-15", "2026-11-15", "2026-11-16"]);
  assert.strictEqual(G.weekIndex(sun), G.weekIndex(mon459));
  assert.strictEqual(G.weekIndex(mon5), G.weekIndex(sun) + 1);
  assert.strictEqual(G.weekIndex(G.todayStr(TW("2026-11-23T04:59:00"))), G.weekIndex(mon5), "下個週一 04:59 還是同一週");
  assert.strictEqual(G.weekIndex(G.todayStr(TW("2026-11-23T05:00:00"))), G.weekIndex(mon5) + 1);
  assert.notStrictEqual(G.weeklyTheme(sun), G.weeklyTheme(mon5));
  // 每週特展、每週公告跟著換
  const P = fresh(); G.ensureDay(P, sun);
  const w1 = G.weeklyState(P).w, n1 = G.weeklyNotice(P).id;
  G.ensureDay(P, mon5);
  assert.strictEqual(G.weeklyState(P).w, w1 + 1); assert.notStrictEqual(G.weeklyNotice(P).id, n1);
  assert.strictEqual(G.weeklyState(P).theme, G.weeklyTheme(mon5));
});
T("第 N 天：從第一次進館那天算第 1 天", () => {
  const P = fresh(); P.created = "2026-11-08";
  assert.strictEqual(G.gameDayNo(P, "2026-11-08"), 1);
  assert.strictEqual(G.gameDayNo(P, "2026-11-10"), 3);
  assert.strictEqual(G.gameDayNo(P, "2026-12-08"), 31);
  assert.strictEqual(G.gameDayNo(P, "2026-11-01"), 1, "建立的日期比今天晚：不會變成 0 或負的");
  P.created = null; assert.strictEqual(G.gameDayNo(P, "2026-11-10"), 1);
  P.created = "壞掉"; assert.strictEqual(G.gameDayNo(P, "2026-11-10"), 1);
  const Q = G.newProfile("challenge"); assert.strictEqual(Q.created, G.todayStr()); assert.strictEqual(G.gameDayNo(Q), 1, "新的博物館是第 1 天");
  assert.strictEqual(G.newSave().settings.dayMin, 0, "新存檔：dayMin 留著、固定 0");
});
// 舊存檔：以前 15 分鐘一天，遊戲裡的日期跑到真的日期後面
function futureSave() {
  const P = G.newProfile("challenge"); P.created = "2026-11-10"; // 建立的那天也是遊戲裡的日期（在今天後面）
  G.ensureDay(P, "2026-11-13"); // 遊戲裡的「今天」：5 天後
  P.insp = 50;
  const a = G.finishMake(P, { 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" }, { natural: 50 }).key;
  const b = G.finishMake(P, { 稀有度: "普通", 心情: "傷心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" }, { natural: 50 }).key;
  P.injured[a] = "2026-11-15"; // 還要 2 天才好
  P.injured[b] = "2026-11-14"; // 還要 1 天
  P.quirks = [{ type: "phobia", cat: "顏色", opt: "黑" }];
  P.day.fusions = 9; P.day.mini = { memory: 99 }; P.day.reviews = { portrait: 99 }; P.day.lost = 7; P.day.quirkGiven = true;
  // 今天的委託停在「剛好等於真的今天」的那一天，而且都做完了（重抽之前要先作廢）
  G.dailyCommissions(P, "2026-11-08"); P.daily.list.forEach(c => { c.done = true; });
  P.keys.b3 = "2026-11-12"; P.recipes.r1 = "2026-11-11"; P.cellar.floorsDone[1] = "2026-11-11"; P.badges.first = "2026-11-10";
  // 第二位參觀者：連續抱了 1 天；收起來的 dayVis 剛好是真的今天
  G.setRng(G.mulberry32(22)); G.addVisitor(P, "小華", 1); G.chooseJob(P, "historian"); G.setRng(null); // 決定 0028：選職業再抽優缺點
  P.hugDays = ["2026-11-13"]; P.visit.from = "2026-11-12";
  G.switchVisitor(P, "v1"); // 回到第一位；小華收起來
  const v2 = P.visitors.find(v => v.vid === "v2");
  v2.dayVis = { date: "2026-11-08", startSan: 40, lost: 9, quirkGiven: true, exLoss: { statue: 9 }, views: { statue: 8 } };
  P.hugDays = ["2026-11-12", "2026-11-13"]; // 第一位連續抱了 2 天
  P.visit.from = "2026-11-13"; P.job = P.job || "detective"; // 第一位是遊戲裡「今天」才來的
  const save = G.newSave(); save.profiles.challenge = P; save.current = "challenge"; save.settings.dayMin = 15;
  return { save: JSON.parse(JSON.stringify(save)), a, b };
}
T("舊存檔（遊戲日期在 5 天後）：拉回今天，受傷剩的天數一樣、今天的次數照常、不會壞", () => {
  const { save, a, b } = futureSave();
  const S = G.migrateSave(save), P = S.profiles.challenge;
  assert.strictEqual(S.settings.dayMin, 0, "舊的 15 分鐘改成 0（不用了）");
  const r = G.ensureDay(P, "2026-11-08");
  assert.ok(r && !r.firstEver, "算新的一天（進館會擲心情恢復）"); assert.strictEqual(r.back, 5);
  assert.strictEqual(P.day.date, "2026-11-08");
  // 受傷：剩 2 天、1 天，照樣
  assert.strictEqual(P.injured[a], "2026-11-10"); assert.strictEqual(P.injured[b], "2026-11-09");
  assert.strictEqual(G.daysBetween(P.day.date, P.injured[a]), 2);
  // 今天的次數重新算
  assert.strictEqual(P.day.fusions, 0); assert.strictEqual(G.fusionLeft(P), G.fusionLimit(P));
  assert.strictEqual(G.miniLeft(P, "memory"), G.NUM.miniPerDay);
  assert.strictEqual(G.reviewsLeft(P, G.exhibitById("portrait")), G.galleryInsp(G.exhibitById("portrait")).perDay);
  assert.strictEqual(P.day.lost, 0); assert.strictEqual(P.day.quirkGiven, false); assert.strictEqual(P.day.startSan, P.sanity);
  // 今天的委託：重抽，沒有做完的
  const list = G.dailyCommissions(P, "2026-11-08");
  assert.ok(list.length >= 3); assert.ok(list.every(c => !c.done));
  // 第 N 天：建立的日期比今天晚 → 今天是第 1 天
  assert.strictEqual(P.created, "2026-11-08"); assert.strictEqual(G.gameDayNo(P, "2026-11-08"), 1); assert.strictEqual(G.gameDayNo(P, "2026-11-09"), 2);
  // hugDays：11-09 起不用了（連續抱抱枕治怪癖拿掉，決定 0027），舊存檔有的照樣往前移、不會壞
  assert.deepStrictEqual(JSON.parse(JSON.stringify(P.hugDays)), ["2026-11-06", "2026-11-07"]);
  // 怪癖：舊存檔沒有期限的，讀進來補上（決定 0027）
  assert.ok(P.quirks.every(q => typeof q.until === "number" && q.task), "怪癖補了期限和治法");
  // 不在場的那位：dayVis 作廢，換回來照新的一天；hugDays 也往前移
  const v2 = P.visitors.find(v => v.vid === "v2");
  assert.strictEqual(v2.dayVis, null); assert.deepStrictEqual(JSON.parse(JSON.stringify(v2.hugDays)), ["2026-11-07"]);
  G.switchVisitor(P, "v2");
  assert.strictEqual(P.day.lost, 0); assert.strictEqual(P.day.quirkGiven, false); assert.deepStrictEqual(JSON.parse(JSON.stringify(P.day.views)), {});
  G.switchVisitor(P, "v1");
  // 這一位哪天來的：舊的最後一天變成昨天，館長室退休不用等好幾天（決定 0025 要來了 1 天以上）
  assert.strictEqual(P.visit.from, "2026-11-07"); assert.strictEqual(v2.visit.from, "2026-11-06");
  if (typeof G.retireCheck === "function") { G.setDayClock(() => "2026-11-08"); try { const rc = G.retireCheck(P, "office"); assert.notStrictEqual(rc.reason, "new", "不會因為日期往回走變成「剛來」"); } finally { G.setDayClock(null); } }
  // 紀錄的日期不動
  assert.strictEqual(P.keys.b3, "2026-11-12"); assert.strictEqual(P.recipes.r1, "2026-11-11"); assert.strictEqual(P.cellar.floorsDone[1], "2026-11-11"); assert.strictEqual(P.badges.first, "2026-11-10");
  // 只拉一次；之後照常換日、受傷照常好
  assert.strictEqual(G.ensureDay(P, "2026-11-08"), null);
  const r2 = G.ensureDay(P, "2026-11-09"); assert.strictEqual(r2.back, 0);
  assert.ok(!P.injured[b], "剩 1 天的明天好了"); assert.ok(P.injured[a]);
  G.ensureDay(P, "2026-11-10"); assert.ok(!P.injured[a]);
  // 還是存得起來、讀得回來
  const again = G.migrateSave(JSON.parse(JSON.stringify(S)));
  assert.strictEqual(again.profiles.challenge.day.date, "2026-11-10");
  assert.ok(Object.keys(again.profiles.challenge.pepes).length >= 2);
});
T("舊存檔：遊戲日期沒有比今天晚的不動；自由模式也拉得回來", () => {
  const P = fresh(); P.created = "2026-11-01"; P.injured.x = "2026-11-12"; P.hugDays = ["2026-11-07"];
  const r = G.ensureDay(P, "2026-11-09");
  assert.strictEqual(r.back, 0); assert.strictEqual(P.injured.x, "2026-11-12"); assert.deepStrictEqual(JSON.parse(JSON.stringify(P.hugDays)), ["2026-11-07"]);
  assert.strictEqual(P.created, "2026-11-01"); assert.strictEqual(G.gameDayNo(P, "2026-11-09"), 9);
  assert.strictEqual(G.rewindDays(P, "2026-11-20"), 0); assert.strictEqual(G.rewindDays(null, "2026-11-20"), 0); assert.strictEqual(G.rewindDays({ day: null }, "2026-11-20"), 0);
  const F = G.newProfile("free"); G.ensureDay(F, "2026-12-01");
  const rf = G.ensureDay(F, "2026-11-08");
  assert.strictEqual(rf.back, 23); assert.strictEqual(F.day.date, "2026-11-08"); assert.ok(G.dailyCommissions(F, "2026-11-08").length >= 3);
});
T("起源室：第伍～捌章的打開條件", () => {
  const P = fresh();
  [5, 6, 7, 8].forEach(id => assert.ok(!G.chapterOpen(P, id), "ch" + id));
  P.seen.russia8 = 1; assert.ok(G.chapterOpen(P, 5));
  P.seen.hidden = 1; assert.ok(G.chapterOpen(P, 6));
  P.unlockCount = 10; assert.ok(G.chapterOpen(P, 7));
  ["a", "b", "c", "d", "e", "f"].forEach(k => { P.understood[k] = "x"; }); assert.ok(G.chapterOpen(P, 8));
  assert.strictEqual(JSON.stringify(G.allChapters().map(c => c.id)), "[1,2,3,4,5,6,7,8]");
  const ev = G.progressEvents(P).filter(e => e.type === "chapter").map(e => e.id);
  [5, 6, 7, 8].forEach(id => assert.ok(ev.includes(id), "event ch" + id));
});
T("看懂檢定：看懂了什麼，記進《看懂的事》", () => {
  const P = fresh();
  const a = G.understandLine(P, "strange");
  assert.ok(a.isNew && a.text && a.from); assert.strictEqual(a.id, "strange"); assert.strictEqual(a.n, 1);
  assert.ok(!G.understandLine(P, "strange").isNew);
  assert.strictEqual(G.understandLine(P, "book:book2").id, "book2");
  assert.strictEqual(G.understandLine(P, "cellar:3b").id, "cellar3");
  assert.strictEqual(G.understandLine(P, "push").id, "push");
  const f = G.understandLine(P, "beyond"); assert.strictEqual(f.id, null); assert.ok(f.text);
  assert.strictEqual(Object.keys(P.understood).length, 4);
  const ids = ["portrait", "strange", "rare", "statue", "hidden", "russia8"].filter(id => G.exhibitById(id).san).concat(["book1", "book2", "book3", "book4", "cellar1", "cellar5", "fusion"]);
  ids.forEach(id => assert.ok(G.understandLine(G.newProfile("challenge"), id).id, id));
});
T("E 分享碼來回一致", () => {
  const P = fresh();
  const r = G.finishMake(P, { 稀有度: "稀有", 心情: "傷心", 顏色: "綠", 帽子: "棒球帽", 姿勢: "坐著" }, { natural: 20 });
  G.placeInHall(P, 2, { kind: "pepe", key: r.key });
  const code = G.hallCode(P);
  const v = G.parseHallCode(code);
  assert.ok(v); assert.strictEqual(v.items[2].key, r.key);
  assert.strictEqual(G.scoreItems(v.items).score, G.hallScore(P).score);
  assert.strictEqual(G.parseHallCode("亂打的"), null);
});
T("E 老主顧：還沒開放、今天在櫃台、交過的段落、走完", () => {
  const P = fresh(); P.unlockCount = 0;
  let v = G.regularsView(P, []);
  assert.ok(v && !v.open && v.need === G.NUM.linesFrom && v.list.length === Object.keys(G.CLIENT_LINES).length);
  assert.ok(v.list.every(x => !x.met && x.step === 0 && x.said.length === 0));
  P.unlockCount = G.NUM.linesFrom;
  const id = Object.keys(G.CLIENT_LINES)[0], L = G.CLIENT_LINES[id];
  v = G.regularsView(P, [{ kind: "line", line: id, done: false }]);
  const a = v.list.find(x => x.id === id);
  assert.ok(v.open && a.met && a.today === "here" && !a.done);
  P.lines[id] = 2;
  v = G.regularsView(P, [{ kind: "line", line: id, done: true }]);
  const b = v.list.find(x => x.id === id);
  assert.strictEqual(b.today, "done"); assert.strictEqual(b.said.length, 2); assert.strictEqual(b.said[1].comment, L.steps[1].comment);
  assert.strictEqual(b.finale, null);
  P.lines[id] = L.steps.length + 3; // 壞資料：多出來的不算
  const c = G.regularsView(P, []).list.find(x => x.id === id);
  assert.ok(c.done && c.step === L.steps.length && c.finale === L.finale && c.said.length === L.steps.length);
  assert.strictEqual(G.regularsView(G.newProfile("free"), []), null, "自由模式沒有");
});
T("E 參觀者給靈感", () => {
  const P = fresh();
  assert.strictEqual(G.visitorArrive(P), null);
  const r = G.finishMake(P, { 稀有度: "稀有", 心情: "傷心", 顏色: "綠", 帽子: "棒球帽", 姿勢: "坐著" }, { natural: 20 });
  G.placeInHall(P, 0, { kind: "pepe", key: r.key });
  const before = P.insp;
  const v = G.visitorArrive(P);
  assert.ok(v && v.text); assert.ok(P.insp > before);
  for (let i = 0; i < 100; i++) G.visitorArrive(P);
  assert.strictEqual(G.visitorInspToday(P), G.NUM.visitorInspDay, "壹天最多 visitorInspDay");
  const b2 = P.insp, v2 = G.visitorArrive(P);
  assert.ok(v2.text && v2.gain === 0 && v2.full && P.insp === b2, "滿了還是會來，只是不給");
  P.hallInsp.day = "2000-01-01"; assert.strictEqual(G.visitorInspToday(P), 0, "換日歸零");
});

// ---------- F 理智與心情（CoC 第 7 版） ----------
T("F 理智檢定：擲 ≤ 理智成功，掉斜線前的數", () => {
  const P = fresh(); P.sanity = 50;
  G.setRng(seq(d100(50), dN(4, 6)));
  let r = G.sanCheck(P, "0/1D6", "strange");
  assert.ok(r.success); assert.strictEqual(r.loss, 0);
  G.setRng(seq(d100(51), dN(4, 6)));
  r = G.sanCheck(P, "0/1D6", "strange");
  assert.ok(!r.success); assert.strictEqual(r.loss, 4);
  G.setRng(null);
});
T("F 大失敗 100：掉最大值；習慣了：一天最多掉它的最大值", () => {
  const P = fresh(); P.sanity = 60;
  G.setRng(seq(d100(100), dN(1, 6)));
  const r = G.sanCheck(P, "0/1D6", "strange");
  assert.strictEqual(r.loss, 6);
  G.applySan(P, r.loss, "strange");
  G.setRng(seq(d100(99), dN(5, 6)));
  const r2 = G.sanCheck(P, "0/1D6", "strange");
  assert.strictEqual(r2.loss, 0); assert.ok(r2.habituated);
  G.setRng(null);
});
T("F 同一天看過 NUM.habituate 次以上變成 0/1", () => {
  const P = fresh();
  const ex = G.exhibitById("statue");
  for (let i = 0; i < G.NUM.habituate - 1; i++) G.viewExhibit(P, ex);
  assert.notStrictEqual(G.viewExhibit(P, ex).san, "0/1");
  assert.strictEqual(G.viewExhibit(P, ex).san, "0/1");
});
T("F 一次掉 5 點以上要看懂檢定；一天掉 1/5 以上得到怪癖", () => {
  const P = fresh(); G.ensureDay(P, "2026-11-09"); P.sanity = 70; P.day.startSan = 70; // 換日會自己恢復理智，所以換日之後才設
  const ev = G.applySan(P, 10, "statue");
  assert.ok(ev.temp); assert.ok(!ev.indef);
  const ev2 = G.applySan(P, 4, "strange");
  assert.ok(ev2.indef);
  assert.ok(!G.applySan(P, 1, "x").indef);
  P.myth = 7;
  assert.strictEqual(G.understandCheck(P).target, 57);
});
T("F 恐懼症讓可能性變少，治好跳回來", () => {
  const P = fresh(); unlockAll(P);
  assert.strictEqual(G.possibilities(P), G.BASE_TOTAL);
  P.quirks.push({ type: "phobia", cat: "帽子", opt: null });
  assert.strictEqual(G.possibilities(P), G.BASE_TOTAL / 4);
  const c = G.cureQuirk(P);
  assert.strictEqual(c.from, G.BASE_TOTAL / 4); assert.strictEqual(c.to, G.BASE_TOTAL);
});
T("F 狂躁症：做那個選項便宜、其他貴", () => {
  const P = fresh();
  P.quirks.push({ type: "mania", cat: "顏色", opt: "綠" });
  const base = { 稀有度: "普通", 心情: "開心", 帽子: "沒有", 姿勢: "站著" };
  assert.strictEqual(G.makeCost(P, Object.assign({ 顏色: "綠" }, base)), G.NUM.costPepe - 1);
  assert.strictEqual(G.makeCost(P, Object.assign({ 顏色: "紅" }, base)), G.NUM.costPepe + 1);
});
// 「連續 3 天抱抱枕治好怪癖」拿掉了（11-09，決定 0027）：怪癖的治法、時間到消失的測試在檔案最後面（要用到 P3、board）
T("F 佩佩神話：理智上限＝99－神話，5 開觸手帽、10 開不可名狀", () => {
  const P = fresh(); P.sanity = 99;
  let ev = G.addMyth(P, 5);
  assert.strictEqual(G.maxSan(P), 94); assert.strictEqual(P.sanity, 94);
  assert.ok(ev.some(e => e.name === "觸手帽"));
  ev = G.addMyth(P, 5);
  assert.ok(ev.some(e => e.name === "不可名狀"));
  assert.ok(P.badges.mythos);
  assert.ok(G.possibilities(P) > 32);
});
T("F 理智 0 進俄國8 的房間，下一位參觀者重來但收藏留著", () => {
  const P = fresh();
  const r = G.finishMake(P, { 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" }, { natural: 50 });
  P.sanity = 3; P.myth = 4;
  const ev = G.applySan(P, 9, null);
  assert.ok(ev.zero); assert.strictEqual(P.sanity, 0); assert.ok(P.dark);
  assert.strictEqual(G.endingDue(P), "russia8");
  G.nextVisitor(P);
  assert.strictEqual(P.visitor, 2); assert.strictEqual(P.sanity, G.NUM.startSanity); assert.strictEqual(P.myth, 0);
  assert.ok(P.mood >= 15 && P.mood <= 90); assert.ok(P.pepes[r.key]); assert.ok(!P.dark);
});
T("每天換日理智自己恢復：+5，最多到 75；比 75 高的不動；0 的不恢復", () => {
  const c = G.NUM.sanDayBack;
  const P = fresh(); P.sanity = 30;
  const r = G.ensureDay(P, "2026-11-09");
  assert.strictEqual(r.sanBack, c.n); assert.strictEqual(P.sanity, 30 + c.n); assert.strictEqual(P.day.sanBack, c.n);
  assert.strictEqual(G.ensureDay(P, "2026-11-09"), null, "同一天不再加");
  P.sanity = c.cap - 2; G.ensureDay(P, "2026-11-10");
  assert.strictEqual(P.sanity, c.cap, "最多到上限");
  P.sanity = c.cap + 10; G.ensureDay(P, "2026-11-11");
  assert.strictEqual(P.sanity, c.cap + 10, "已經比上限高的不扣");
  P.sanity = 0; G.ensureDay(P, "2026-11-12");
  assert.strictEqual(P.sanity, 0, "熄燈的不恢復");
  // 隔了幾天沒進館：每過一次 05:00 加一次；不在場的、沒在工作的也一起加
  const Q = fresh(); Q.sanity = 20; Q.visitors = [{ vid: "v2", sanity: 40, myth: 0 }, { vid: "v3", sanity: 40, work: { last: "2026-11-08" } }, { vid: "v4", sanity: 0 }, { vid: "v5", sanity: 70, myth: 10 }];
  G.ensureDay(Q, "2026-11-11");
  assert.strictEqual(Q.sanity, 20 + c.n * 3, "隔 3 天加 3 次");
  assert.strictEqual(Q.visitors[0].sanity, 40 + c.n * 3);
  assert.strictEqual(Q.visitors[1].sanity, 40, "在地下室工作的不加");
  assert.strictEqual(Q.visitors[2].sanity, 0, "熄燈的不加");
  assert.strictEqual(Q.visitors[3].sanity, c.cap, "70 加完停在上限");
  const N = G.newProfile("challenge");
  assert.strictEqual(G.ensureDay(N, "2026-11-08").sanBack, 0, "第一次進館不加");
});
T("F 每天的心情恢復：擲出比心情大才 +1D10", () => {
  const P = fresh(); P.mood = 40;
  G.setRng(seq(d100(30)));
  assert.ok(!G.moodRecovery(P).up); assert.strictEqual(P.mood, 40);
  G.setRng(seq(d100(77), dN(6, 10)));
  const r = G.moodRecovery(P);
  assert.ok(r.up); assert.strictEqual(P.mood, 46);
  G.setRng(null);
});
T("F 瘋狂發作 1D10 查表、倒數動作", () => {
  const P = fresh(); unlockAll(P);
  G.setRng(seq(dN(9, 10), dN(3, 10), 0.1));
  const b = G.startBout(P);
  assert.strictEqual(b.bout.i, 8); assert.strictEqual(b.bout.left, 3); assert.ok(b.bout.opt);
  assert.ok(G.isBlocked(P, b.bout.cat, b.bout.opt));
  G.tickAction(P); G.tickAction(P);
  assert.ok(G.tickAction(P).ended); assert.strictEqual(P.bout, null);
  G.setRng(null);
});
T("F 開場心情 3D6×5（15–90）", () => {
  for (let i = 0; i < 200; i++) { const P = G.newProfile("challenge"); assert.ok(P.mood >= 15 && P.mood <= 90 && P.mood % 5 === 0); assert.strictEqual(P.sanity, G.NUM.startSanity); }
});

// ---------- 畫廊、起源 ----------
T("畫廊：第一次、之後再看的靈感照危險度（每天有上限）；心情一天一次", () => {
  const P = fresh(); const ex = G.exhibitById("rare"); const m = P.mood, gi = G.galleryInsp(ex);
  let v = G.viewExhibit(P, ex);
  assert.strictEqual(v.insp, gi.first); assert.strictEqual(P.mood, Math.min(99, m + 10));
  let total = 0; for (let i = 0; i < 10; i++) total += G.viewExhibit(P, ex).insp;
  assert.strictEqual(total, gi.perDay * gi.review);
  assert.strictEqual(G.reviewsLeft(P, ex), 0); assert.ok(G.viewExhibit(P, ex).capped);
  assert.strictEqual(P.mood, Math.min(99, m + 10));
});
T("畫廊：越危險的畫靈感越多、越簡單的越少", () => {
  const d = ["portrait", "rare", "strange", "statue", "hidden", "russia8"].map(id => G.exhibitDanger(G.exhibitById(id)));
  assert.deepStrictEqual(d, [0, 0, 1, 2, 2, 3]);
  const gi = [0, 1, 2, 3].map(i => G.NUM.galleryInsp[i]);
  for (let i = 1; i < 4; i++) { assert.ok(gi[i].first > gi[i - 1].first); assert.ok(gi[i].review > gi[i - 1].review); }
});
T("畫廊：第 1 代的文字原樣保留", () => {
  assert.strictEqual(JSON.stringify(G.exhibitById("strange").lines), JSON.stringify(["你看到壹群祭司圍繞著乙輛賓士轎車。", "車中的那名祭司看起來莫名的眼熟。", "這才不是佩佩!"]));
  assert.strictEqual(G.exhibitById("statue").failAside, "(理智值扣拾)");
});
T("隱藏展品：要第 2 章打開、4 件都看過；俄國8 的房間：要俄國8、看過隱藏展品", () => {
  const P = fresh();
  const hid = G.exhibitById("hidden"), r8 = G.exhibitById("russia8");
  assert.ok(hid.title && hid.lines.length);
  assert.ok(!G.exhibitOpen(P, hid));
  ["portrait", "strange", "rare", "statue"].forEach(id => G.viewExhibit(P, G.exhibitById(id)));
  assert.ok(!G.exhibitOpen(P, hid));
  P.unlockCount = G.NUM.ch2;
  assert.ok(G.exhibitOpen(P, hid));
  assert.ok(!G.exhibitOpen(P, r8));
  P.unlocked.心情.push("俄國8+9"); G.viewExhibit(P, hid);
  assert.ok(G.exhibitOpen(P, r8));
});

// ---------- I 抱枕 ----------
T("I 抱枕要印一隻；可能性＝27 × 收藏數", () => {
  const P = fresh(); P.insp = 10;
  const pick = { 尺寸: "標準", 材質: "棉布", 填充: "剛剛好" };
  assert.ok(!G.makePillow(P, pick, "").ok);
  const r = G.finishMake(P, { 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" }, { natural: 50 });
  for (let i = 0; i < 9; i++) G.finishMake(P, { 稀有度: "普通", 心情: "傷心", 顏色: ["紅", "綠"][i % 2], 帽子: ["沒有", "棒球帽"][i % 2], 姿勢: "站著" }, { natural: 50 });
  const n = Object.keys(P.pepes).length;
  assert.strictEqual(G.pillowPossibilities(P), 27 * n);
  const before = P.insp;
  const m = G.makePillow(P, pick, "p:" + r.key);
  assert.ok(m.ok && m.isNew); assert.strictEqual(P.insp, before - G.NUM.costPillow);
});
T("I 抱開心佩佩的抱枕回 NUM.hugHappy，其他 NUM.hug；每個抱枕每天一次", () => {
  const P = fresh(); P.sanity = 20;
  const a = G.finishMake(P, { 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" }, { natural: 50 });
  const key = G.pillowKeyOf({ 尺寸: "標準", 材質: "棉布", 填充: "剛剛好" }, "p:" + a.key);
  P.pillows[key] = 1;
  const h = G.hug(P, key);
  assert.ok(h.happy); assert.strictEqual(h.roll.spec, G.NUM.hugHappy); assert.ok(P.sanity > 20);
  assert.ok(G.hug(P, key).already);
});

// ---------- 存檔 ----------
T("存檔：第 2 代的收藏搬進自由模式（俄國8 自動改名俄國8+9）", () => {
  const s = G.newSave();
  const n = G.migrateGen2(s, { pepe: ["傳說級稀有|開心|紅|巫師帽|躺平", "普通|傷心|綠|沒有|站著", "稀有|俄國8|黑|皇冠|比讚"], pillow: ["標準|絨毛|軟綿綿"] });
  assert.strictEqual(n, 4);
  assert.ok(s.profiles.free.pepes[G.normKey("稀有|俄國8+9|黑|皇冠|比讚")]);
  assert.ok(s.profiles.free.pepes[G.normKey("傳說級稀有|開心|紅|巫師帽|躺平")]);
  assert.ok(s.profiles.free.pillows["標準|絨毛|軟綿綿|"]);
  assert.strictEqual(G.migrateGen2(s, { pepe: ["普通|傷心|綠|沒有|站著"] }), 0);
});
T("存檔：匯出、匯入存檔碼來回一致；壞掉的欄位會補回來", () => {
  const s = G.newSave(); s.profiles.challenge = G.newProfile("challenge"); s.current = "challenge";
  G.finishMake(s.profiles.challenge, { 稀有度: "稀有", 心情: "傷心", 顏色: "綠", 帽子: "棒球帽", 姿勢: "坐著" }, { natural: 20 });
  const back = G.importCode(G.exportCode(s));
  assert.ok(back); assert.strictEqual(JSON.stringify(Object.keys(back.profiles.challenge.pepes)), JSON.stringify(Object.keys(s.profiles.challenge.pepes)));
  assert.strictEqual(G.importCode("PEPESAVE1.壞掉"), null);
  const m = G.migrateSave({ v: 0, profiles: { challenge: { mode: "challenge", unlocked: { 帽子: ["不存在的帽子"] } } } });
  assert.ok(m.profiles.challenge.unlocked.帽子.includes("沒有"));
  assert.ok(Array.isArray(m.profiles.challenge.hall) && m.profiles.challenge.hall.length === 6);
});

T("改名：舊存檔的俄國8 換成俄國8+9；斯拉夫蹲要先解鎖俄國8+9", () => {
  const m = G.migrateSave({ profiles: { challenge: { mode: "challenge", unlocked: { 心情: ["開心", "傷心", "俄國8"] }, pepes: { "普通|俄國8|紅|沒有|站著": { n: 1, s: 1 } }, hall: [{ kind: "pepe", key: "普通|俄國8|紅|沒有|站著" }] } } });
  const P = m.profiles.challenge;
  assert.ok(P.unlocked.心情.includes("俄國8+9")); assert.ok(!P.unlocked.心情.includes("俄國8"));
  const k9 = G.normKey("普通|俄國8+9|紅|沒有|站著");
  assert.ok(P.pepes[k9]); assert.strictEqual(P.hall[0].key, k9); assert.strictEqual(k9.split("|").length, G.CATS.length);
  const Q = fresh(); Q.insp = 99;
  assert.strictEqual(G.unlockState(Q, "姿勢", "斯拉夫蹲").state, "req");
  Q.unlocked.心情.push("俄國8+9");
  assert.strictEqual(G.unlockState(Q, "姿勢", "斯拉夫蹲").state, "buy");
});

// ================= 第 3 版 =================
const P3 = () => { const P = fresh(); unlockAll(P); P.insp = 500; return P; };
const mk = (P, o, nat = 50) => G.finishMake(P, Object.assign({ 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" }, o), { natural: nat });
T("調色盤：兩種顏色調出新顏色、記進配方、解鎖；配方先決定顏色時照配方；調出來的顏色在地下強度多", () => {
  const P = P3();
  const base = { 心情: "開心", 帽子: "沒有", 姿勢: "站著", 稀有度: "普通" };
  const a = mk(P, { 顏色: "紅" }).key, b = mk(P, { 顏色: "黃" }).key;
  const A = { key: a, pick: G.fromKey(a) }, B = { key: b, pick: G.fromKey(b) };
  assert.strictEqual(G.matchMix(A, B).id, "mixOrange"); assert.strictEqual(G.matchMix(B, A).id, "mixOrange");
  assert.strictEqual(G.matchRecipe(A, B), null, "調色不算壹般的配方");
  assert.strictEqual(G.isUnlocked(P, "顏色", "橘"), false);
  assert.strictEqual(G.fusionBlood(A, B), G.NUM.mixBlood);
  const pv = G.paletteView(P);
  assert.strictEqual(pv.length, G.RECIPES.filter(r => r.mix).length);
  assert.ok(pv.find(v => v.id === "mixOrange").ready && !pv.find(v => v.id === "mixOrange").got);
  assert.ok(!pv.find(v => v.id === "mixPurple").ready, "還沒有藍，紫不能提示");
  G.setRng(() => 0.99);
  const f = G.startFusion(P, { kind: "pepe", key: a }, { kind: "pepe", key: b });
  assert.ok(f.ok, f.reason);
  assert.strictEqual(f.child.顏色, "橘"); assert.strictEqual(f.mix, "mixOrange"); assert.strictEqual(f.blood, G.NUM.mixBlood);
  assert.ok(P.recipes.mixOrange); assert.strictEqual(G.isUnlocked(P, "顏色", "橘"), true);
  assert.ok(f.events.some(e => e.type === "recipe" && e.id === "mixOrange"));
  assert.ok(G.paletteView(P).find(v => v.id === "mixOrange").got);
  // 配方先決定顏色（開心紅＋開心綠＝虹彩）時不會被調色蓋掉；調色的顏色不會被突變抽到
  assert.ok(G.RECIPES.filter(r => r.mix).every(r => G.optOf("顏色", r.child.顏色).mix && !G.optOf("顏色", r.child.顏色).mutant && G.RECIPE_TEXT[r.id]));
  assert.ok(!G.baseOpts("顏色").includes("橘"));
  // 地下強度
  const it = c => ({ pick: { ...base, 顏色: c }, perfect: false });
  assert.strictEqual(G.memberPower(it("橘"), {}) - G.memberPower(it("紅"), {}), G.COLOR_POWER.橘);
});
T("融合加價：爸媽愈稀有愈貴、血統也愈多；不給爸媽就是基本價", () => {
  const P = fresh();
  const of = r => ({ pick: { 顏色: "紅", 心情: "開心", 帽子: "沒有", 姿勢: "站著", 稀有度: r } });
  const C = G.NUM.fusionRarityCost, R = G.RARITY_ORDER.filter(r => r !== G.FAILED);
  assert.strictEqual(G.fusionPrice(P), G.NUM.fusionCost);
  assert.strictEqual(G.fusionPrice(P, of(R[0]), of(R[0])), G.NUM.fusionCost + C[0] * 2);
  assert.strictEqual(G.fusionPrice(P, of(R[1]), of(R[2])), G.NUM.fusionCost + C[1] + C[2]);
  assert.strictEqual(G.fusionBlood(of(R[1]), of(R[1])), G.NUM.blood * 2);
  assert.strictEqual(G.fusionBlood(of(R[2]), of(R[0])), G.NUM.blood * 2);
  assert.strictEqual(G.fusionBlood(of(R[0]), of(R[0])), 0);
  assert.ok(C.every((v, i) => i === 0 || v >= C[i - 1]), "愈稀有不能愈便宜");
});
T("v3 新類別：一開始 ×1；拿到鑰匙組合 ×4；圖鑑還是 1,280 格", () => {
  const P = P3();
  assert.strictEqual(G.CORE_TOTAL, 1280); assert.strictEqual(G.BASE_TOTAL, 1280);
  assert.strictEqual(G.knownTotal(P), 1280); assert.strictEqual(G.possibilities(P), 1280);
  P.keys.bg = "d"; G.CATS.forEach(c => G.PEPE_PARTS.find(p => p.name === c).options.forEach(o => { if (o.key === "bg") P.unlocked[c].push(o.name); }));
  assert.strictEqual(G.knownTotal(P), 5120); assert.strictEqual(G.possibilities(P), 5120);
  const a = mk(P, { 背景: "星空" }), b = mk(P, {});
  assert.strictEqual(G.codexCount(P), 1); // 同一個核心組合只算一格
  assert.ok(G.describePepe(a.pick).extra.includes("星空背景"));
});
T("v3 存檔：進階版五類的 key 自動補成七類", () => {
  const m = G.migrateSave({ profiles: { challenge: { mode: "challenge", pepes: { "稀有|開心|紅|沒有|站著": { n: 1, s: 1 } }, pillows: { "標準|棉布|剛剛好|p:稀有|開心|紅|沒有|站著": 1 }, hall: [{ kind: "pepe", key: "稀有|開心|紅|沒有|站著" }, null, null, null, null, null] } } });
  const P = m.profiles.challenge;
  const k = Object.keys(P.pepes)[0];
  assert.strictEqual(k.split("|").length, 7);
  assert.ok(G.parsePillowKey(Object.keys(P.pillows)[0]).print.key === k);
  assert.strictEqual(P.hall[0].key, k); assert.strictEqual(P.hall.length, 6);
  assert.ok(P.cellar && P.upgrades && P.keys);
});
T("v3 J 融合：遺傳、花靈感、一天上限、同一對一天一次", () => {
  const P = P3();
  const a = mk(P, { 心情: "開心", 顏色: "紅" }), b = mk(P, { 心情: "傷心", 顏色: "綠", 帽子: "巫師帽" });
  const A = { kind: "pepe", key: a.key }, B = { kind: "pepe", key: b.key };
  const before = P.insp;
  G.setRng(seq(0.1, 0.5, 0.1, 0.5, 0.1, 0.1, 0.1));
  const f = G.startFusion(P, A, B);
  G.setRng(null);
  assert.ok(f.ok, f.reason);
  assert.strictEqual(f.child.心情, "開心"); assert.strictEqual(f.child.顏色, "綠");
  assert.strictEqual(P.insp, before - G.NUM.fusionCost);
  assert.ok(!G.canFuse(P, A, B).ok); // 同一對
  assert.ok(f.roll && f.roll.total >= 1);
});
T("v3 J 突變：出現就打開，手作坊也能用", () => {
  const P = P3();
  const a = mk(P, {}), b = mk(P, { 心情: "傷心" });
  G.setRng(seq(0.95, 0.1, 0.1, 0.1, 0.1, 0.1));
  const f = G.startFusion(P, { kind: "pepe", key: a.key }, { kind: "pepe", key: b.key });
  G.setRng(null);
  assert.strictEqual(f.child.心情, "微醺");
  assert.ok(P.unlocked.心情.includes("微醺"));
  assert.ok(f.events.some(e => e.type === "unlock" && e.how === "mutant"));
  const r = G.finishMake(P, f.child, { natural: 30, fusion: { blood: f.blood } });
  assert.ok(r.isNew); assert.ok(P.badges.mutant); assert.ok(P.badges.firstFusion);
});
T("v3 J 配方：雙子升一級、義氣佩佩、配方記錄", () => {
  const P = P3();
  const a = mk(P, {}, 30); mk(P, {}, 30); // 同一隻做兩次 → n=2
  const f = G.startFusion(P, { kind: "pepe", key: a.key }, { kind: "pepe", key: a.key });
  assert.strictEqual(f.recipe, "twins"); assert.strictEqual(f.fixed, "超稀有");
  const r = G.finishMake(P, f.child, { fusion: { fixed: f.fixed, title: f.title } });
  assert.strictEqual(r.pick.稀有度, "超稀有"); assert.ok(P.recipes.twins);
  const g = mk(P, { 心情: "俄國8+9", 姿勢: "斯拉夫蹲" }, 50), h = mk(P, { 心情: "俄國8+9", 姿勢: "斯拉夫蹲", 顏色: "黑" }, 50);
  const y = G.startFusion(P, { kind: "pepe", key: g.key }, { kind: "pepe", key: h.key });
  assert.strictEqual(y.recipe, "yiqi"); assert.strictEqual(y.child.帽子, "毛帽"); assert.ok(P.unlocked.帽子.includes("毛帽"));
  const yr = G.finishMake(P, y.child, { natural: 90, fusion: { minRarity: y.minRarity, title: y.title, blood: y.blood } });
  assert.strictEqual(yr.pick.稀有度, "超稀有"); assert.ok(P.pepes[yr.key].title);
});
T("v3 J 血統：爸媽稀有以上各 5 點，先用血統再用心情", () => {
  const P = P3(); P.mood = 10;
  const a = mk(P, {}, 30), b = mk(P, { 顏色: "綠" }, 30);
  const f = G.startFusion(P, { kind: "pepe", key: a.key }, { kind: "pepe", key: b.key });
  assert.strictEqual(f.blood, 10);
  assert.strictEqual(G.spendRange(P, 22, false, f.blood), 20);
  const r = G.finishMake(P, Object.assign({}, f.child, { 背景: "沒有" }), { natural: 14, spent: 12, fusion: { blood: f.blood } });
  assert.strictEqual(r.pick.稀有度, "傳說級稀有"); assert.strictEqual(P.mood, 8);
});
T("v3 K 升級：展台變多、委託板 4 張、重擲十位骰", () => {
  const P = P3();
  assert.ok(!G.buyUpgrade(P, "ped8").ok);
  assert.ok(G.buyUpgrade(P, "ped7").ok); assert.strictEqual(P.hall.length, 7);
  G.dailyCommissions(P, "2026-11-08");
  assert.ok(G.buyUpgrade(P, "board").ok);
  assert.strictEqual(P.daily.list.filter(c => c.kind !== "line").length, 4);
  assert.ok(G.buyUpgrade(P, "dice").ok);
  const r = G.rerollTens(P, { total: 57, faces: [5, 7] });
  assert.strictEqual(r.faces[1], 7); assert.strictEqual(G.rerollsLeft(P), 2);
  assert.ok(G.buyUpgrade(P, "fame").ok); assert.strictEqual(G.visitorEvery(P), G.NUM.visitorFame);
});
T("v3 L 職業：拿手技能 56–65、其他 16–25；成功打勾，隔天成長", () => {
  const P = P3();
  const j = G.assignJob(P, "historian");
  assert.strictEqual(j.main, "鑑賞"); assert.ok(P.skills.鑑賞 >= 56 && P.skills.鑑賞 <= 65); assert.ok(P.skills.說服 >= 16 && P.skills.說服 <= 25);
  assert.ok(G.hasTalent(P, "鑑賞")); assert.ok(!G.hasTalent(P, "說服"));
  G.setRng(seq(d100(5)));
  assert.ok(G.skillCheck(P, "鑑賞").success); assert.ok(P.skillTicks.鑑賞);
  G.setRng(seq(d100(99), dN(7, 10)));
  const g = G.skillGrowth(P);
  G.setRng(null);
  assert.strictEqual(g[0].gain, 7); assert.ok(!Object.keys(P.skillTicks).length);
});
T("v3 L 推銷員：說服成功賞金多 30%", () => {
  const P = P3(); G.assignJob(P, "salesman"); P.skills.說服 = 99;
  const c = G.dailyCommissions(P, "2026-11-08")[0];
  const r = mk(P, Object.assign({ 稀有度: "稀有" }, c.need), 30);
  const before = P.insp;
  G.setRng(seq(d100(5))); // 說服固定擲出 05（不然 100 會失敗）
  const d = G.deliver(P, 0, { kind: "pepe", key: r.key });
  G.setRng(null);
  assert.ok(d.ok); assert.ok(d.skill.success); assert.strictEqual(P.insp - before, Math.ceil(c.reward * 1.3));
});
T("v3 M 地下收藏庫：組隊、強度（相剋、顏色）、過關給鑰匙", () => {
  const P = P3();
  const team = [mk(P, { 心情: "開心", 顏色: "紅" }, 30), mk(P, { 心情: "生氣" }, 50), mk(P, { 姿勢: "斯拉夫蹲", 心情: "俄國8+9" }, 50)].map(r => r.key);
  assert.ok(!G.canStartCellar(P, 2, team).ok);
  assert.ok(G.startCellar(P, 1, team).ok);
  const items = team.map(k => ({ kind: "pepe", key: k, pick: G.fromKey(k) }));
  // 「傷心、紅」的房間：開心剋傷心 ×2、紅色 +1；生氣被開心剋 −1
  assert.strictEqual(G.memberPower(items[0], { mood: "傷心", color: "紅" }), 2 * 2 + 1);
  assert.strictEqual(G.memberPower(items[1], { mood: "傷心", color: null }), 0);
  assert.strictEqual(G.memberPower(items[2], { mood: "開心", color: null }), 1);
  for (let f = 1; f <= 3; f++) {
    for (let i = 0; i < G.cellarFloor(f).rooms.length; i++) {
      const room = G.currentRoom(P);
      const safe = Math.max(0, room.choices.findIndex(c => c.check.type === "none"));
      const r = G.cellarResolve(P, safe);
      G.cellarApply(P, r, true);
      const adv = G.cellarAdvance(P);
      if (adv.floorDone && f === 3) { assert.ok(adv.events.some(e => e.type === "key")); }
    }
  }
  assert.strictEqual(P.cellar.best, 3); assert.ok(P.keys.bg); assert.strictEqual(G.knownTotal(P), 5120);
  assert.ok(P.unlocked.帽子.includes("毛帽")); assert.ok(G.chapterOpen(P, 4));
});
T("v3 M 受傷：斯拉夫蹲擋一次、棒球帽擋一次，其他時候有一隻受傷", () => {
  const P = P3();
  const team = [mk(P, { 姿勢: "斯拉夫蹲" }, 50), mk(P, { 帽子: "棒球帽" }, 50), mk(P, { 顏色: "綠" }, 50)].map(r => r.key);
  G.startCellar(P, 1, team);
  const room = G.currentRoom(P);
  const res = { room, choice: { success: {}, fail: { injure: true } }, type: "power", success: false };
  let fx = G.cellarApply(P, res); assert.ok(fx.blocked.length && !fx.injured);
  fx = G.cellarApply(P, res); assert.ok(fx.blocked.length && !fx.injured);
  fx = G.cellarApply(P, res); assert.ok(fx.injured); assert.ok(P.injured[fx.injured.key]);
  assert.ok(!G.canStartCellar(P, 1, team).ok);
  P.day = null; G.ensureDay(P, G.addDays("2026-11-08", 3));
  assert.ok(!P.injured[fx.injured.key]);
});
T("v3 M 躺平、毛帽：每一層第一次走時各回一次理智，重走不回（不能刷理智）", () => {
  const P = P3();
  const team = [mk(P, { 姿勢: "躺平" }, 50), mk(P, { 帽子: "毛帽" }, 50), mk(P, { 顏色: "綠" }, 50)].map(r => r.key);
  P.sanity = 30;
  const walk = () => {
    assert.ok(G.startCellar(P, 1, team).ok);
    let gain = 0;
    for (let i = 0; i < G.cellarFloor(1).rooms.length; i++) {
      const room = G.currentRoom(P);
      const safe = room.choices.findIndex(c => c.check.type === "none");
      const r = G.cellarResolve(P, safe >= 0 ? safe : 0);
      gain += G.cellarApply(P, r, false).sanGain;
      G.cellarAdvance(P);
    }
    G.leaveCellar(P);
    return gain;
  };
  const first = walk();
  assert.ok(first >= 2 && first <= 6, "第一次走 B1：躺平、毛帽各回 1D3，實際 " + first);
  assert.strictEqual(walk(), 0);
});
T("v3 大廳導覽圖的進度：畫廊、手作坊、地下收藏庫（樓梯亮幾階）", () => {
  const P = fresh();
  let pr = G.roomProgress(P);
  assert.strictEqual(pr.gallery.text, "看過 0／6");
  assert.strictEqual(pr.workshop.text, "選項 10／28"); // 跟手作坊頁籤一樣：2/4＋2/6×4
  assert.strictEqual(pr.cellar.text, "還沒下去"); assert.strictEqual(pr.cellar.pct, null); assert.strictEqual(pr.cellar.steps, 0);
  assert.strictEqual(pr.fusion.text, `配方 0／${G.RECIPES.length}`);
  P.seen.portrait = 1; P.seen.strange = 3; P.cellar.best = 2;
  pr = G.roomProgress(P);
  assert.strictEqual(pr.gallery.text, "看過 2／6"); assert.ok(Math.abs(pr.gallery.pct - 2 / 6) < 1e-9); assert.ok(!pr.gallery.done);
  assert.strictEqual(pr.cellar.text, "走到 B2／B5"); assert.strictEqual(pr.cellar.steps, 2);
  ["portrait", "strange", "rare", "statue", "hidden", "russia8"].forEach(id => { P.seen[id] = 1; });
  P.cellar.best = 5;
  pr = G.roomProgress(P);
  assert.ok(pr.gallery.done); assert.strictEqual(pr.gallery.text, "✓ 看過 6／6");
  assert.ok(pr.cellar.done); assert.strictEqual(pr.cellar.text, "✓ 走到 B5／B5");
  const Q = P3(); // 買得到的都打開了，突變、送的還沒有
  assert.strictEqual(G.roomProgress(Q).workshop.text, "選項 21／28");
  G.CATS.forEach(c => G.PEPE_PARTS.find(p => p.name === c).options.forEach(o => { if ((o.mutant || o.gift) && !Q.unlocked[c].includes(o.name)) Q.unlocked[c].push(o.name); }));
  assert.strictEqual(G.roomProgress(Q).workshop.text, "✓ 選項 28／28");
});
T("v3 禁書續集：讀過上壹本才出現；做出蹲著的俄國8+9 → 第九年；展台全擺俄國8+9 → 第十年", () => {
  const P = P3();
  const s2b = G.bookSequels().find(s => s.id === "book2b");
  assert.ok(!G.sequelVisible(P, s2b));
  mk(P, { 心情: "俄國8+9", 姿勢: "斯拉夫蹲" }, 50);
  assert.strictEqual(G.sequelEvents(P).length, 0); // 還沒讀《莫斯科手記》
  P.mythFrom.book2 = true;
  assert.ok(G.sequelVisible(P, s2b) && !G.sequelOpen(P, s2b));
  const ev = G.sequelEvents(P);
  assert.strictEqual(ev.map(e => e.id).join(), "book2b"); assert.ok(G.sequelOpen(P, s2b));
  P.mythFrom.book2b = true;
  const keys = [];
  for (let i = 0; i < P.hall.length; i++) keys.push(mk(P, { 心情: "俄國8+9", 顏色: ["紅", "綠", "黃", "黑"][i % 4], 帽子: i < 4 ? "沒有" : "棒球帽" }, 50).key);
  keys.forEach((k, i) => G.placeInHall(P, i, { kind: "pepe", key: k }));
  assert.ok(P.keys.book2c, "展台全擺俄國8+9 之後，第十年要打開");
  assert.strictEqual(G.unlockSequel(P, "book1b").map(e => e.id).join(), "book1b");
  assert.strictEqual(G.unlockSequel(P, "book1b").length, 0); // 打開過就不再給
});
T("v3 委託人關係線：每天一張、走完送選項", () => {
  const P = P3();
  P.unlockCount = 4;
  for (let d = 0; d < 20; d++) {
    P.day = null; G.ensureDay(P, G.addDays("2026-11-08", d)); P.daily = null;
    const list = G.dailyCommissions(P, P.day.date);
    const i = list.findIndex(c => c.kind === "line");
    if (i < 0) continue;
    const c = list[i];
    const pk = {};
    G.CATS.forEach(k => { if (k in c.need) { const sp = c.need[k]; pk[k] = G.usable(P, k).find(v => typeof sp === "string" ? sp === v : Array.isArray(sp) ? sp.includes(v) : ![].concat(sp.not).includes(v)); } });
    const nat = { 普通: 60, 稀有: 30, 超稀有: 8, 傳說級稀有: 2 }[pk.稀有度] || 30;
    const r = mk(P, Object.assign({ 稀有度: "稀有" }, pk), nat);
    const dr = G.deliver(P, i, { kind: "pepe", key: r.key });
    assert.ok(dr.ok, JSON.stringify([c.need, r.pick, dr.reason]));
  }
  const done = Object.keys(P.lines).filter(id => P.lines[id] >= 5);
  assert.ok(done.length >= 1);
  assert.ok(P.badges.clientLine);
});
T("v3 每週特展：同一週同一個主題；不符合規定的放不上去", () => {
  assert.strictEqual(G.weeklyTheme("2026-11-09"), G.weeklyTheme("2026-11-15"));
  assert.notStrictEqual(G.weeklyTheme("2026-11-09"), G.weeklyTheme("2026-11-16"));
  const P = P3();
  const W = G.weeklyState(P);
  const ok = mk(P, { 顏色: "黑", 心情: "俄國8+9", 姿勢: "躺平" }, 30);
  const okItem = { kind: "pepe", key: ok.key };
  W.theme = "allBlack";
  assert.ok(G.placeWeekly(P, 0, okItem).ok);
  const bad = mk(P, { 顏色: "紅" }, 30);
  assert.ok(!G.placeWeekly(P, 1, { kind: "pepe", key: bad.key }).ok);
  const code = G.weeklyCode(P); const v = G.parseWeeklyCode(code);
  assert.ok(v && v.items[0].key === ok.key && v.best === W.best);
});
T("v3 交換碼：送出、收下一次，同一串不能收兩次", () => {
  const P = P3(), Q = P3();
  const r = mk(P, { 心情: "生氣", 帽子: "巫師帽" }, 1);
  const code = G.giftCode(P, { kind: "pepe", key: r.key });
  const got = G.receiveGift(Q, code);
  assert.ok(got.ok); assert.ok(Q.pepes[r.key] && Q.pepes[r.key].perfect);
  assert.strictEqual(G.receiveGift(Q, code).reason, "already");
  assert.strictEqual(G.receiveGift(Q, "PEPEGIFT1.壞掉").reason, "bad");
});
T("v3 修復台：失敗作修成修復品、受傷的治好", () => {
  const P = P3();
  const f = mk(P, {}, 100);
  assert.ok(!G.repairFailed(P, f.key).ok);
  G.buyUpgrade(P, "repair");
  G.setRng(seq(d100(1)));
  const r = G.repairFailed(P, f.key);
  G.setRng(null);
  assert.ok(r.fixed); assert.ok(P.repaired[f.key]); assert.ok(!P.failed[f.key]);
  const it = G.placeInHall(P, 0, { kind: "repaired", key: f.key });
  assert.ok(it.ok);
});

// ---------- 新解開的東西在哪裡（翊文 11-08：shared/fresh.js） ----------
// vm 裡做出來的物件、陣列跟這邊的不是同壹套 Object／Array，先轉成 JSON 再比
const same = (a, b, m) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b, m);
T("新 存檔：新的參觀者有 fresh＝{}；舊存檔沒有、或壞掉，讀進來補成 {}", () => {
  same(G.newProfile("challenge").fresh, {});
  same(G.newProfile("free").fresh, {});
  const old = JSON.parse(JSON.stringify(fresh())); delete old.fresh;
  same(G.fixProfile(old, "challenge").fresh, {});
  same(G.fixProfile(Object.assign({}, old, { fresh: [1, 2] }), "challenge").fresh, {});
  same(G.fixProfile(Object.assign({}, old, { fresh: null }), "challenge").fresh, {});
  const kept = G.fixProfile(Object.assign({}, old, { fresh: { gallery: { "ex:hidden": true } } }), "challenge");
  assert.strictEqual(kept.fresh.gallery["ex:hidden"], true);
  const s = G.migrateSave({ v: 2, profiles: { challenge: old } });
  same(s.profiles.challenge.fresh, {});
});
T("新 標記 → 進房間（導覽列的「新」消失、小牌子還在）→ 離開房間（小牌子拿掉）", () => {
  const P = fresh(), k = G.FRESH_KEY.opt("帽子", "毛帽");
  G.markFresh(P, "workshop", k, "cellar");
  assert.strictEqual(G.freshCount(P, "workshop"), 1);
  same(G.freshRooms(P), { workshop: 1 });
  assert.ok(G.isFresh(P, "workshop", k));
  assert.strictEqual(G.enterFreshRoom(P, "workshop"), 1);
  assert.strictEqual(G.freshCount(P, "workshop"), 0);
  same(G.freshRooms(P), {});
  assert.ok(G.isFresh(P, "workshop", k), "這次進來還看得到小牌子");
  assert.strictEqual(G.freshUnder(P, "workshop", G.FRESH_KEY.opt("帽子", "")), 1);
  assert.strictEqual(G.leaveFreshRoom(P, "workshop"), 1);
  assert.ok(!G.isFresh(P, "workshop", k), "離開之後就不再提示");
  assert.strictEqual(G.freshUnder(P, "workshop", "opt:"), 0);
  // 就在那個房間裡解開的：導覽列不亮，小牌子照樣有
  G.markFresh(P, "codex", G.FRESH_KEY.badge("first"), "codex");
  assert.strictEqual(G.freshCount(P, "codex"), 0);
  assert.ok(G.isFresh(P, "codex", G.FRESH_KEY.badge("first")));
  // 沒有 fresh 欄位的舊資料也不會壞
  const Q = fresh(); delete Q.fresh;
  assert.strictEqual(G.freshCount(Q, "workshop"), 0); assert.ok(!G.isFresh(Q, "workshop", k)); same(G.freshRooms(Q), {});
  G.markFresh(Q, "gallery", "ex:hidden", "lobby"); assert.strictEqual(G.freshCount(Q, "gallery"), 1);
});
T("新 解鎖事件之後有標記：地下收藏庫給的毛帽 → 手作坊的「帽子」頁", () => {
  const P = fresh();
  const ev = G.grantOption(P, "帽子", "毛帽", "cellar");
  assert.strictEqual(ev[0].type, "unlock");
  const marks = G.markFreshEvents(P, ev, "cellar");
  same(marks.map(m => [m.room, m.key, m.tab]), [["workshop", "opt:帽子:毛帽", "帽子"]]);
  assert.strictEqual(P.fresh.workshop["opt:帽子:毛帽"], true);
  same(G.freshRooms(P), { workshop: 1 });
});
T("新 每種事件都知道在哪個房間：鑰匙（整頁）、展品、章節、禁書、配方、徽章、樓層", () => {
  const where = e => G.freshOfEvent(e).map(f => f.room + "|" + f.key);
  const bg = where({ type: "key", key: "bg" });
  assert.ok(bg.includes("workshop|cat:背景")); assert.ok(bg.includes("workshop|opt:背景:星空")); assert.strictEqual(bg.length, 4);
  same(where({ type: "exhibit", id: "hidden" }), ["gallery|ex:hidden"]);
  same(where({ type: "chapter", id: 2 }), ["origin|ch:2"]);
  same(where({ type: "book", id: "book4" }), ["origin|book:book4"]);
  same(where({ type: "recipe", id: "twins", name: "雙胞胎" }), ["codex|recipe:twins"]);
  same(where({ type: "badge", id: "first" }), ["codex|badge:first"]);
  same(where({ type: "floor", floor: 2 }), ["cellar|floor:2"]);
  same(where({ type: "insp", gain: 10 }), []);
  same(where({ type: "row", opt: "紅" }), []);
  // 真的做出第一隻：徽章「第一隻」→ 圖鑑室
  const P = fresh();
  const r = G.finishMake(P, G.DEFAULT_PICK, { natural: 50 });
  G.markFreshEvents(P, r.events, "reveal");
  assert.ok(G.isFresh(P, "codex", G.FRESH_KEY.badge("first")));
  assert.strictEqual(G.freshRooms(P).codex, 1);
});
T("新 地下收藏庫：第壹次走完 B1，B2 開放（樓層牌子標新）；走完最底層沒有下壹層", () => {
  const P = P3();
  const team = [mk(P, { 心情: "開心" }, 30), mk(P, { 心情: "生氣" }, 30), mk(P, { 心情: "傷心" }, 30)].map(r => r.key);
  assert.ok(G.startCellar(P, 1, team).ok);
  let adv = null;
  for (let i = 0; i < G.cellarFloor(1).rooms.length; i++) {
    const room = G.currentRoom(P);
    const safe = Math.max(0, room.choices.findIndex(c => c.check.type === "none"));
    G.cellarApply(P, G.cellarResolve(P, safe), true);
    adv = G.cellarAdvance(P);
  }
  assert.ok(adv.floorDone && adv.first);
  assert.ok(adv.events.some(e => e.type === "floor" && e.floor === 2));
  G.markFreshEvents(P, adv.events, "cellar");
  assert.ok(G.isFresh(P, "cellar", G.FRESH_KEY.floor(2)));
  assert.strictEqual(G.freshCount(P, "cellar"), 0, "人就在地下收藏庫：導覽列不亮");
  assert.strictEqual(P.fresh.workshop["opt:帽子:毛帽"], true, "B1 的獎勵毛帽：手作坊標新");
  // 最底層：沒有下壹層，不給樓層事件
  P.cellar.best = 4; P.cellar.run = { floor: 5, idx: G.cellarFloor(5).rooms.length - 1, team, used: {}, log: [] };
  const last = G.cellarAdvance(P);
  assert.ok(last.floorDone && !last.next); assert.ok(!last.events.some(e => e.type === "floor"));
});
T("新 掃描：剛能解鎖的選項、第壹次買得起的升級，各標壹次；看過就不再標", () => {
  const P = fresh();
  same(G.scanFresh(P, "lobby"), [], "壹開始什麼都沒有");
  P.seen.strange = 1; // 看過奇怪的繪畫 → 俄國8+9 可以花靈感解鎖
  const s1 = G.scanFresh(P, "gallery");
  same(s1.map(f => f.key), ["opt:心情:俄國8+9"]);
  assert.strictEqual(G.freshCount(P, "workshop"), 1);
  same(G.scanFresh(P, "gallery"), [], "標過了不再標");
  G.enterFreshRoom(P, "workshop"); G.leaveFreshRoom(P, "workshop");
  same(G.scanFresh(P, "lobby"), [], "看過了不再標");
  P.insp = 30; // 夠買展台、修復台
  const s2 = G.scanFresh(P, "lobby");
  same(s2.map(f => f.key).sort(), ["up:ped7", "up:repair"]);
  assert.strictEqual(G.freshRooms(P).office, 2);
  P.insp = 5; G.scanFresh(P, "lobby"); // 還沒去看就又花掉了：先拿掉
  assert.strictEqual(G.freshCount(P, "office"), 0);
  P.insp = 30; G.scanFresh(P, "lobby");
  assert.strictEqual(G.freshCount(P, "office"), 2, "又買得起了，再標");
  G.enterFreshRoom(P, "office"); G.leaveFreshRoom(P, "office");
  P.insp = 5; G.scanFresh(P, "lobby"); P.insp = 30;
  same(G.scanFresh(P, "lobby"), [], "看過的升級不會再標");
  same(G.scanFresh(fresh("free"), "lobby"), [], "自由模式什麼都打開了，不用掃");
});
T("新 徽章打開的選項：四種心情 → 黑、四色同心情 → 皇冠（解鎖之後就不列）", () => {
  const P = fresh();
  same(G.badgeOpens(P, "fourMoods"), ["黑"]);
  same(G.badgeOpens(P, "fourColors"), ["皇冠"]);
  same(G.badgeOpens(P, "first"), []);
  P.unlocked.顏色.push("黑");
  same(G.badgeOpens(P, "fourMoods"), []);
});

// ---------- 壹鍵交件（翊文 11-08：shared/logic.js 的 autoDeliverables、keepRank、deliverAll） ----------
// 自己擺一張委託板（dailyCommissions 看到今天的 P.daily 就直接用）
const board = (P, needs) => { P.daily = { date: P.day.date, list: needs.map((need, i) => ({ id: `${P.day.date}#t${i}`, kind: need.kind || "vague", client: "測試的人" + i, text: "測試委託" + i, need: need.need || need, reward: 5 + i, comment: "評語" + i, done: false })) }; return P.daily.list; };
// 一個收藏很多、委託板有 5 張（加寬＋老主顧）的參觀者
const bigP = () => {
  const P = P3(); P.unlockCount = 8; P.upgrades.board = "2026-11-08";
  G.setRng(G.mulberry32(11));
  for (let i = 0; i < 160; i++) G.finishMake(P, G.codexPick(Math.floor(G.RNG() * G.BASE_TOTAL)), { natural: 1 + Math.floor(G.RNG() * 99) });
  G.setRng(null);
  return P;
};
T("壹鍵 挑出來的都真的符合；沒挑到的那幾張，收藏裡真的沒有符合的", () => {
  for (const day of ["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11"]) {
    const P = bigP(); P.day = null; G.ensureDay(P, day);
    const list = G.dailyCommissions(P, P.day.date);
    assert.ok(list.length >= 5, "委託板要有 5 張（加寬＋老主顧），實際 " + list.length);
    const plan = G.autoDeliverables(P);
    assert.ok(plan.length > 0);
    const all = ["pepe", "failed", "repaired", "pillow"].flatMap(k => G.ownedItems(P, k));
    plan.forEach((p, i) => {
      assert.ok(G.checkDelivery(P, list[p.idx], p.item), JSON.stringify([list[p.idx].need, p.item.key]));
      assert.strictEqual(p.id, list[p.idx].id);
      assert.strictEqual(p.of, all.filter(it => G.checkDelivery(P, list[p.idx], it)).length);
      if (i) assert.ok(p.idx > plan[i - 1].idx, "照委託板的順序");
    });
    list.forEach((c, idx) => { if (!plan.some(p => p.idx === idx)) assert.ok(!all.some(it => G.checkDelivery(P, c, it)), "第 " + idx + " 張其實有符合的"); });
  }
});
T("壹鍵 收藏的格式跟收藏列一樣：佩佩新的在前、有 perfect；失敗作、修復品、抱枕", () => {
  const P = P3();
  const a = mk(P, { 顏色: "紅" }, 60), b = mk(P, { 顏色: "綠" }, 1), f = mk(P, { 顏色: "黃" }, 100);
  P.repaired[f.key] = 1; P.pillows[G.pillowKeyOf({ 尺寸: "標準", 材質: "棉布", 填充: "剛剛好" }, "p:" + a.key)] = 1;
  same(G.ownedItems(P, "pepe").map(i => [i.key, i.perfect]), [[b.key, true], [a.key, false]]);
  same(G.ownedItems(P, "failed").map(i => [i.kind, i.key, i.pick.顏色]), [["failed", f.key, "黃"]]);
  same(G.ownedItems(P, "repaired").map(i => i.kind), ["repaired"]);
  same(G.ownedItems(P, "pillow").map(i => i.kind), ["pillow"]);
});
T("壹鍵 已完成的不會再挑；交完之後就沒有可以交的", () => {
  const P = bigP();
  const list = G.dailyCommissions(P, P.day.date);
  const plan = G.autoDeliverables(P);
  assert.ok(plan.length >= 2);
  list[plan[0].idx].done = true;
  const again = G.autoDeliverables(P);
  assert.ok(!again.some(p => p.idx === plan[0].idx));
  assert.strictEqual(again.length, plan.length - 1);
  const r = G.deliverAll(P, again);
  assert.strictEqual(r.results.length, again.length); assert.strictEqual(r.skipped, 0);
  again.forEach(p => assert.ok(list[p.idx].done));
  same(G.autoDeliverables(P), []);
});
T("壹鍵 普通和完美作品都符合時挑普通的：一般 → 失敗作 → 完美作品，同一層稀有度低的先", () => {
  const P = P3();
  board(P, [{ 心情: "開心" }]);
  const A = mk(P, { 顏色: "紅" }, 1);   // 完美作品（傳說級稀有），最先做的
  const C = mk(P, { 顏色: "黃" }, 30);  // 稀有
  const B = mk(P, { 顏色: "綠" }, 60);  // 普通
  const D = mk(P, { 顏色: "黑" }, 100); // 失敗作（委託沒指定稀有度，失敗作也可以交）
  mk(P, { 心情: "生氣", 顏色: "綠" }, 60); // 不符合
  assert.ok(P.pepes[A.key].perfect);
  const pickNow = () => { const p = G.autoDeliverables(P); assert.strictEqual(p.length, 1); return p[0].item; };
  assert.strictEqual(pickNow().key, B.key, "普通的先");
  assert.strictEqual(G.autoDeliverables(P)[0].of, 4);
  delete P.pepes[B.key];
  assert.strictEqual(pickNow().key, C.key, "再來稀有");
  delete P.pepes[C.key];
  const d = pickNow(); assert.strictEqual(d.kind, "failed"); assert.strictEqual(d.key, D.key, "失敗作在完美作品前面");
  delete P.failed[D.key];
  const a = pickNow(); assert.strictEqual(a.key, A.key, "只剩完美作品符合，才用它"); assert.ok(a.perfect);
  // 普通的佩佩被標成完美作品：一樣排到最後（層比稀有度先比）
  const E = mk(P, { 顏色: "綠", 帽子: "巫師帽" }, 60), F = mk(P, { 顏色: "綠", 帽子: "棒球帽" }, 60);
  P.pepes[E.key].perfect = true;
  assert.strictEqual(pickNow().key, F.key);
  // 同一層同稀有度：做過比較多個的先
  const H = mk(P, { 顏色: "黃", 帽子: "皇冠" }, 60); mk(P, { 顏色: "黃", 帽子: "皇冠" }, 60);
  assert.strictEqual(pickNow().key, H.key);
});
T("壹鍵 抱枕委託挑抱枕，印完美作品的最後", () => {
  const P = P3();
  board(P, [{ kind: "pillow", need: { 尺寸: "標準", print: { 心情: "開心" } } }]);
  const A = mk(P, { 顏色: "紅" }, 1), B = mk(P, { 顏色: "綠" }, 60);
  const ka = G.pillowKeyOf({ 尺寸: "標準", 材質: "棉布", 填充: "剛剛好" }, "p:" + A.key);
  const kb = G.pillowKeyOf({ 尺寸: "標準", 材質: "絨毛", 填充: "剛剛好" }, "p:" + B.key);
  const kx = G.pillowKeyOf({ 尺寸: "等身大", 材質: "棉布", 填充: "剛剛好" }, "p:" + B.key);
  P.pillows[ka] = 3; P.pillows[kb] = 1; P.pillows[kx] = 1;
  const p = G.autoDeliverables(P);
  assert.strictEqual(p.length, 1); assert.strictEqual(p[0].item.kind, "pillow"); assert.strictEqual(p[0].item.key, kb); assert.strictEqual(p[0].of, 2);
});
T("壹鍵 沒有符合的回傳空的", () => {
  same(G.autoDeliverables(fresh()), [], "收藏是空的");
  const P = P3();
  board(P, [{ 心情: "開心" }, { kind: "pillow", need: { 尺寸: "標準" } }]);
  mk(P, { 心情: "生氣" }, 60); mk(P, { 心情: "傷心" }, 100);
  same(G.autoDeliverables(P), [], "只有不開心的、沒有抱枕");
  same(G.deliverAll(P, []).results, []);
});
T("壹鍵 deliverAll：同一隻可以交好幾張；賞金、理智加總；換天了不會交錯張", () => {
  const P = P3(); P.sanity = 40;
  const list = board(P, [{ 心情: "開心" }, { 顏色: "紅" }, { 心情: "生氣" }]);
  const a = mk(P, { 心情: "開心", 顏色: "紅" }, 60);
  const plan = G.autoDeliverables(P);
  same(plan.map(p => [p.idx, p.item.key]), [[0, a.key], [1, a.key]]);
  const insp = P.insp, san = P.sanity;
  const r = G.deliverAll(P, plan);
  assert.strictEqual(r.results.length, 2); assert.strictEqual(P.done, 2);
  assert.strictEqual(r.reward, list[0].reward + list[1].reward); assert.strictEqual(P.insp - insp, r.reward);
  assert.strictEqual(P.sanity - san, r.gain); assert.ok(r.gain >= 2);
  assert.ok(!list[2].done); assert.strictEqual(P.comments.length, 2);
  assert.strictEqual(G.deliverAll(P, plan).skipped, 2, "交過的再交一次：跳過");
  // 換天：清單是昨天的，id 對不上，全部跳過
  const Q = P3(); board(Q, [{ 心情: "開心" }]); mk(Q, {}, 60);
  const old = G.autoDeliverables(Q);
  Q.day = null; G.ensureDay(Q, "2026-11-09");
  const s = G.deliverAll(Q, old);
  assert.strictEqual(s.results.length, 0); assert.strictEqual(s.skipped, 1); assert.strictEqual(Q.done, 0);
});
T("壹鍵 交件也算「交壹張委託」，治好怪癖；自由模式也能交（不給靈感）", () => {
  const P = P3();
  P.quirks.push({ type: "phobia", cat: "顏色", opt: "黑", task: "deliver", done: ["2000-01-01"] }); // 決定 0027：不用再標「治療委託」，治法是交委託的都算；決定 0046：要兩個遊戲日，這裡已經有 1 天了
  board(P, [{ 心情: "開心" }]);
  mk(P, {}, 60);
  const r = G.deliverAll(P, G.autoDeliverables(P));
  assert.strictEqual(r.cured.length, 1); assert.strictEqual(P.quirks.length, 0);
  const F = fresh("free");
  board(F, [{ 心情: "開心" }]);
  G.finishMake(F, { 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" });
  const fr = G.deliverAll(F, G.autoDeliverables(F));
  assert.strictEqual(fr.results.length, 1); assert.strictEqual(fr.reward, 0); assert.strictEqual(F.insp, 0); assert.strictEqual(F.comments.length, 1);
});

// 不敢碰的原因（11-08：看畫之後選項點不了，其實是恐懼症，要說清楚）
T("不敢碰：說得出是哪個怪癖、還是發作", () => {
  const P = fresh(); unlockAll(P);
  const base = G.baseOpts("帽子")[0], other = G.allOpts("帽子").find(n => n !== base);
  P.quirks.push({ type: "phobia", cat: "帽子", opt: null });
  assert.strictEqual(G.blockedWhy(P, "帽子", other).kind, "quirk", "整類的恐懼症");
  assert.strictEqual(G.blockedWhy(P, "帽子", base), null, "最基本的那個不擋");
  assert.strictEqual(G.isBlocked(P, "帽子", other), true, "跟 isBlocked 一致");
  P.quirks = [{ type: "phobia", cat: "顏色", opt: "黑" }];
  assert.strictEqual(G.blockedWhy(P, "顏色", "黑").quirk.opt, "黑");
  assert.strictEqual(G.blockedWhy(P, "顏色", "紅"), null);
  P.quirks = []; P.bout = { i: 8, left: 3, cat: "姿勢", opt: "倒立" };
  const b = G.blockedWhy(P, "姿勢", "倒立");
  assert.strictEqual(b.kind, "bout"); assert.strictEqual(b.left, 3);
  assert.strictEqual(G.blockedWhy(P, "姿勢", "站著"), null);
});

// ---------- 怪癖：在 NUM.quirkTaskDays 個不同的遊戲日做到治法那件事，不然 NUM.quirkDays 天後自己消失（決定 0046；0027 是做完一件事、20 分鐘） ----------
const T0 = Date.UTC(2026, 10, 9, 3, 0, 0); // 固定的「現在」＝台灣 2026-11-09 11:00（遊戲日 2026-11-09）（G.setNowClock）
const DAYMS = 86400000;
const D1 = "2026-11-09", D2 = "2026-11-10";
const withPillow = P => { const r = mk(P, {}); const key = G.pillowKeyOf({ 尺寸: "標準", 材質: "棉布", 填充: "剛剛好" }, "p:" + r.key); P.pillows[key] = 1; return key; };
const qk = (task, o = {}) => Object.assign({ type: "phobia", cat: "帽子", opt: null, since: D1, until: T0 + G.NUM.quirkDays * DAYMS, task, done: [] }, o);
T("怪癖 數字：先照 7 天、2 個遊戲日、最多 3 個", () => {
  assert.strictEqual(G.NUM.quirkDays, 7); assert.strictEqual(G.NUM.quirkTaskDays, 2); assert.strictEqual(G.NUM.quirkMax, 3);
  assert.strictEqual(G.NUM.quirkMinutes, undefined, "舊的設定拿掉了");
});
T("怪癖 得到時有一件治法（只抽現在做得到的）、7 天的期限、0 個日子的進度", () => {
  G.setNowClock(() => T0);
  const P = fresh(); P.insp = 0;
  same(G.QUIRK_TASKS.filter(k => G.quirkTaskOk(P, k)), ["calm"], "沒有抱枕、靈感不夠做一隻：只剩看不可怕的畫");
  G.setRng(seq(0.1, 0, 0.99)); // 恐懼症、第一個候選（整類的帽子）、治法抽最後一個
  const g = G.gainQuirk(P);
  G.setRng(null);
  assert.strictEqual(g.quirk.type, "phobia"); assert.strictEqual(g.quirk.cat, "帽子");
  assert.strictEqual(g.quirk.until, T0 + G.NUM.quirkDays * DAYMS);
  assert.strictEqual(g.quirk.task, "calm", "只有這件做得到");
  same(g.quirk.done, [], "一天都還沒做");
  assert.strictEqual(G.quirkNeedDays(g.quirk), G.NUM.quirkTaskDays); assert.ok(!G.quirkDoneToday(g.quirk));
  assert.strictEqual(G.quirkDaysLeft(g.quirk), G.NUM.quirkDays);
  assert.strictEqual(G.quirkDaysLeft(g.quirk, T0 + 3600000), G.NUM.quirkDays, "過了 1 小時還是寫 7 天（無條件進位）");
  assert.strictEqual(G.quirkDaysLeft(g.quirk, T0 + DAYMS + 1), G.NUM.quirkDays - 1);
  // 有抱枕、委託交得出去：三件都做得到
  withPillow(P); board(P, [{ 心情: "開心" }]);
  same(G.QUIRK_TASKS.filter(k => G.quirkTaskOk(P, k)), ["hug", "deliver", "calm"]);
  // 抱枕今天都抱過了、委託交完了：就不算
  Object.keys(P.pillows).forEach(k => { P.day.hugs[k] = true; });
  P.daily.list.forEach(c => { c.done = true; });
  same(G.QUIRK_TASKS.filter(k => G.quirkTaskOk(P, k)), ["calm"]);
  // 委託還沒交、收藏裡沒有符合的，但靈感夠做一隻：算（要稀有度的不算，那要靠運氣）
  const Q = fresh(); Q.insp = G.NUM.costPepe + 1;
  board(Q, [{ 心情: "開心" }]);
  assert.ok(G.quirkTaskOk(Q, "deliver"));
  board(Q, [{ 稀有度: "傳說級稀有" }]);
  assert.ok(!G.quirkTaskOk(Q, "deliver"));
  Q.insp = 0; board(Q, [{ 心情: "開心" }]);
  assert.ok(!G.quirkTaskOk(Q, "deliver"), "靈感不夠做一隻");
  // 跟別的怪癖不一樣的優先
  P.day.hugs = {};
  P.daily.list.forEach(c => { c.done = false; });
  P.quirks = [qk("hug", { type: "mania", cat: "顏色", opt: "紅" })];
  G.setRng(seq(0)); assert.strictEqual(G.pickQuirkTask(P), "deliver");
  G.setRng(seq(0.99)); assert.strictEqual(G.pickQuirkTask(P), "calm");
  G.setRng(null);
  // 自由模式（不會得到怪癖）：沒有做得到的
  assert.strictEqual(G.pickQuirkTask(fresh("free")), null);
  G.setNowClock(null);
});
T("怪癖 同時最多 NUM.quirkMax 個，滿了不再給（留一週不會越疊越多）；過期的不佔位子", () => {
  G.setNowClock(() => T0);
  const P = fresh(); unlockAll(P);
  P.quirks = [qk("calm", { cat: "帽子" }), qk("calm", { cat: "姿勢" }), qk("calm", { type: "mania", cat: "顏色", opt: "紅" })];
  assert.strictEqual(P.quirks.length, G.NUM.quirkMax);
  G.setRng(seq(0.1, 0, 0)); assert.strictEqual(G.gainQuirk(P), null, "已經 3 個"); G.setRng(null);
  assert.strictEqual(P.quirks.length, G.NUM.quirkMax);
  P.quirks[0].until = T0 - 1; // 1 個時間到了
  G.setRng(seq(0.1, 0, 0)); const g = G.gainQuirk(P); G.setRng(null);
  assert.ok(g, "時間到的不算在裡面");
  // 理智掉太多的那一天額度照樣用掉（不會下一次再補給）
  const R = fresh(); R.day.startSan = 40; R.quirks = P.quirks.slice(1).concat([qk("calm", { cat: "顏色", opt: "黃" })]);
  const ev = G.applySan(R, 9, "strange"); assert.ok(ev.indef); assert.ok(R.day.quirkGiven);
  G.setNowClock(null);
});
T("怪癖 兩個不同的遊戲日才治好：同一天做再多次只算一天，不用連續", () => {
  G.setNowClock(() => T0);
  const P = P3(); const key = withPillow(P); // 另外手動加第二個抱枕
  P.pillows["p:另一個"] = 1;
  P.quirks = [qk("hug"), qk("deliver", { opt: "皇冠" })];
  // 第 1 天：抱 → 算 1 天，沒好
  const h1 = G.hug(P, key);
  assert.strictEqual(h1.cured.length, 1); assert.strictEqual(h1.cured[0].step, true);
  assert.strictEqual(h1.cured[0].done, 1); assert.strictEqual(h1.cured[0].need, 1);
  same(P.quirks[0].done, [D1]); assert.ok(G.quirkDoneToday(P.quirks[0])); assert.strictEqual(G.quirkNeedDays(P.quirks[0]), 1);
  assert.strictEqual(P.quirks.length, 2, "還沒好");
  // 同一天再抱別的抱枕：不再算
  const h2 = G.hug(P, "p:另一個");
  assert.strictEqual(h2.cured.length, 0, "同一天只算一天"); same(P.quirks[0].done, [D1]); assert.strictEqual(P.quirks.length, 2);
  // 同一天抱的次數再多、治法是別件的怪癖也沒動
  same(P.quirks[1].done, []);
  // 隔 3 天（不用連續）：再抱 → 治好
  G.setNowClock(() => T0 + 3 * DAYMS);
  P.day.hugs = {};
  const h3 = G.hug(P, key);
  assert.strictEqual(h3.cured.length, 1); assert.ok(!h3.cured[0].step); assert.strictEqual(h3.cured[0].quirk.task, "hug");
  assert.ok(h3.cured[0].to > h3.cured[0].from, "可能性變回來");
  same(P.quirks.map(x => x.task), ["deliver"], "治法不是抱抱枕的留著");
  G.setNowClock(null);
});
T("怪癖 看不可怕的畫、交委託也一樣要兩個遊戲日；可怕的畫不算；過期的不算", () => {
  G.setNowClock(() => T0);
  const P = P3(); withPillow(P);
  P.quirks = [qk("calm")];
  assert.strictEqual(G.viewExhibit(P, G.exhibitById("strange")).cured.length, 0, "可怕的畫不算");
  same(P.quirks[0].done, []);
  const v1 = G.viewExhibit(P, G.exhibitById("portrait"));
  assert.strictEqual(v1.cured.length, 1); assert.strictEqual(v1.cured[0].step, true); assert.strictEqual(P.quirks.length, 1);
  assert.strictEqual(G.viewExhibit(P, G.exhibitById("portrait")).cured.length, 0, "同一天再看不算");
  G.setNowClock(() => T0 + DAYMS);
  const v2 = G.viewExhibit(P, G.exhibitById("portrait"));
  assert.strictEqual(v2.cured.length, 1); assert.ok(!v2.cured[0].step); assert.strictEqual(P.quirks.length, 0, "第二個遊戲日治好");
  // 交委託：哪一張都可以
  G.setNowClock(() => T0);
  P.quirks = [qk("deliver")];
  board(P, [{ 心情: "開心" }, { 心情: "開心" }]); mk(P, {}, 60);
  const plan = G.autoDeliverables(P);
  const d = G.deliver(P, plan[0].idx, plan[0].item);
  assert.ok(d.ok); assert.strictEqual(d.cured.length, 1); assert.strictEqual(d.cured[0].step, true); assert.strictEqual(P.quirks.length, 1);
  G.setNowClock(() => T0 + DAYMS);
  P.daily = null; board(P, [{ 心情: "開心" }]); mk(P, {}, 60);
  const plan2 = G.autoDeliverables(P);
  const d2 = G.deliver(P, plan2[0].idx, plan2[0].item);
  assert.ok(d2.ok); assert.ok(!d2.cured[0].step); assert.strictEqual(P.quirks.length, 0);
  // 過期的不算
  P.quirks = [qk("hug", { until: T0 + DAYMS - 1 })]; P.day.hugs = {};
  assert.strictEqual(G.hug(P, withPillow(P)).cured.length, 0);
  // 委託櫃台不再標「治療委託」
  P.quirks = [qk("deliver")]; P.daily = null;
  assert.ok(G.dailyCommissions(P).every(c => !("cure" in c)));
  G.setNowClock(null);
});
T("怪癖 台灣 05:00 前後算不同的遊戲日（cureByTask 直接給時間）", () => {
  const P = fresh();
  const tw = (m, d, h, mi) => Date.UTC(2026, m - 1, d, h - 8, mi, 0); // 台灣時間 → 毫秒
  P.quirks = [qk("hug", { until: tw(12, 31, 0, 0) })];
  // 11-10 04:58 和 04:59 都還是 11-09
  assert.strictEqual(G.cureByTask(P, "hug", tw(11, 10, 4, 58)).length, 1);
  assert.strictEqual(G.cureByTask(P, "hug", tw(11, 10, 4, 59)).length, 0, "同一個遊戲日");
  same(P.quirks[0].done, ["2026-11-09"]);
  // 05:00 整換日 → 第二天 → 治好
  const r = G.cureByTask(P, "hug", tw(11, 10, 5, 0));
  assert.strictEqual(r.length, 1); assert.ok(!r[0].step); assert.strictEqual(P.quirks.length, 0);
  // 反過來：00:30（還是前一天）和隔天 05:01 也是兩天
  P.quirks = [qk("hug", { until: tw(12, 31, 0, 0) })];
  G.cureByTask(P, "hug", tw(11, 12, 0, 30)); same(P.quirks[0].done, ["2026-11-11"]);
  assert.ok(!G.cureByTask(P, "hug", tw(11, 12, 5, 1))[0].step);
});
T("怪癖 7 天整：差 1 毫秒還在擋，到了就不擋；不在場的參觀者時間照走", () => {
  let now = T0; G.setNowClock(() => now);
  const P = fresh(); unlockAll(P);
  const other = G.allOpts("帽子").find(n => n !== G.baseOpts("帽子")[0]);
  const span = G.NUM.quirkDays * DAYMS;
  P.quirks = [qk("calm")];
  now = T0 + span - 1;
  assert.ok(G.isBlocked(P, "帽子", other), "還差 1 毫秒"); assert.strictEqual(G.quirkDaysLeft(P.quirks[0]), 1);
  assert.strictEqual(G.expireQuirks(P).length, 0);
  now = T0 + span;
  assert.ok(!G.isBlocked(P, "帽子", other), "7 天整就不擋了（還沒 expireQuirks 也一樣）");
  assert.strictEqual(G.quirkDaysLeft(P.quirks[0]), 0); assert.strictEqual(G.activeQuirks(P).length, 0);
  assert.strictEqual(G.expireQuirks(P).length, 1); assert.strictEqual(P.quirks.length, 0);
  same(G.expireQuirks(P), [], "拿過了不會再報");
  // 不在場的參觀者：換人、關遊戲都不停表
  now = T0;
  const A = fresh();
  const r = G.addVisitor(A, "阿明", 1); assert.ok(r);
  A.quirks = [qk("hug", { type: "mania", cat: "顏色", opt: "紅" })]; // 現在在場的是第 2 位；給牠一個怪癖
  const vid2 = A.vid;
  assert.ok(G.switchVisitor(A, A.visitors[0].vid), "換回第 1 位，第 2 位收起來");
  assert.strictEqual(A.visitors.find(v => v.vid === vid2).quirks[0].until, T0 + span, "收起來的 until 沒變");
  now = T0 + 6 * DAYMS; assert.strictEqual(G.activeQuirks(A.visitors.find(v => v.vid === vid2)).length, 1, "第 6 天還在");
  now = T0 + span; assert.strictEqual(G.activeQuirks(A.visitors.find(v => v.vid === vid2)).length, 0, "不在場，時間到也過期了");
  assert.ok(G.switchVisitor(A, vid2)); assert.strictEqual(G.expireQuirks(A).length, 1, "換回來就拿掉"); assert.strictEqual(A.quirks.length, 0);
  G.setNowClock(null);
});
T("怪癖 做不到的治法：換日時改抽一件做得到的（做過的日子留著）；沒有治法的補上", () => {
  G.setNowClock(() => T0);
  const P = fresh(); P.insp = 0; // 沒有抱枕、沒有靈感做一隻、也沒有收藏：只剩看畫
  P.quirks = [qk("deliver", { done: [D1] }), qk("hug", { cat: "姿勢" }), qk(null, { cat: "顏色", opt: "黑" }), qk("calm", { cat: "顏色", opt: "黃" })];
  same(G.retaskQuirks(P).map(r => [r.from, r.to]), [["deliver", "calm"], ["hug", "calm"], [null, "calm"]], "做得到的不動");
  same(P.quirks.map(q => q.task), ["calm", "calm", "calm", "calm"]);
  same(P.quirks[0].done, [D1], "做過的日子不重算");
  same(G.retaskQuirks(P), [], "再看一次沒有要改的");
  // 自由模式、沒有怪癖：不做事
  same(G.retaskQuirks(fresh("free")), []); same(G.retaskQuirks(fresh()), []);
  // 換日（ensureDay）會叫它
  const Q = fresh(); Q.insp = 0; Q.quirks = [qk("hug")];
  const d = G.ensureDay(Q, "2026-11-10");
  assert.strictEqual(d.retasked.length, 1); assert.strictEqual(Q.quirks[0].task, "calm");
  assert.strictEqual(G.ensureDay(Q, "2026-11-10"), null, "同一天不再看");
  // 做得到的不換：有抱枕
  const R = fresh(); R.insp = 0; withPillow(R); R.quirks = [qk("hug")];
  assert.strictEqual(G.ensureDay(R, "2026-11-10").retasked.length, 0);
  assert.strictEqual(R.quirks[0].task, "hug");
  G.setNowClock(null);
});
T("怪癖 時間到自己消失：isBlocked、blockedWhy、可能性、makeCost 都不算了；expireQuirks 拿掉並回報", () => {
  let now = T0; G.setNowClock(() => now);
  const P = fresh(); unlockAll(P);
  const other = G.allOpts("帽子").find(n => n !== G.baseOpts("帽子")[0]);
  const base = { 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" };
  P.quirks = [qk("calm", { until: T0 + 5 * DAYMS }), qk("hug", { type: "mania", cat: "顏色", opt: "綠", until: T0 + 6 * DAYMS })];
  assert.ok(G.isBlocked(P, "帽子", other)); assert.strictEqual(G.blockedWhy(P, "帽子", other).kind, "quirk");
  assert.strictEqual(G.possibilities(P), G.BASE_TOTAL / 4);
  assert.strictEqual(G.makeCost(P, base), G.NUM.costPepe + 1);
  now = T0 + 5 * DAYMS;
  assert.ok(!G.isBlocked(P, "帽子", other), "時間到就不擋了（還沒 expireQuirks 也一樣）");
  assert.strictEqual(G.blockedWhy(P, "帽子", other), null);
  assert.strictEqual(G.possibilities(P), G.BASE_TOTAL);
  assert.strictEqual(G.activeQuirks(P).length, 1);
  assert.strictEqual(G.makeCost(P, base), G.NUM.costPepe + 1, "狂熱還有 1 天");
  const gone = G.expireQuirks(P);
  assert.strictEqual(gone.length, 1); assert.strictEqual(gone[0].quirk.type, "phobia");
  assert.strictEqual(P.quirks.length, 1);
  now = T0 + 6 * DAYMS;
  assert.strictEqual(G.makeCost(P, base), G.NUM.costPepe);
  assert.strictEqual(G.expireQuirks(P).length, 1); assert.strictEqual(P.quirks.length, 0);
  // 過期的不佔位子：同一個怪癖可以再得到
  const R = fresh();
  R.quirks = [qk("calm", { until: now - 1 })];
  G.setRng(seq(0.1, 0, 0)); const g = G.gainQuirk(R); G.setRng(null);
  assert.ok(g); assert.strictEqual(g.quirk.cat, "帽子"); assert.strictEqual(g.quirk.opt, null); assert.strictEqual(g.quirk.until, now + G.NUM.quirkDays * DAYMS);
  G.setNowClock(null);
});
T("狂熱 3 天、恐懼症 7 天（翊文 11-09）；已經得到的狂熱載入時拉回 3 天；已經快到期的不延長", () => {
  assert.strictEqual(G.NUM.quirkManiaDays, 3);
  assert.strictEqual(G.quirkDaysOf("mania"), 3);
  assert.strictEqual(G.quirkDaysOf("phobia"), 7);
  const fixed = G.fixQuirks([
    { type: "mania", cat: "顏色", opt: "紅", until: T0 + 6 * DAYMS, task: "hug" },
    { type: "phobia", cat: "顏色", opt: "黃", until: T0 + 6 * DAYMS, task: "hug" },
    { type: "mania", cat: "顏色", opt: "藍", until: T0 + DAYMS, task: "hug" },
  ], T0);
  assert.deepStrictEqual(fixed.map(q => q.until), [T0 + 3 * DAYMS, T0 + 6 * DAYMS, T0 + DAYMS]);
  assert.strictEqual(G.quirkDaysLeft({ type: "mania" }), 3, "沒有 until");
  G.setNowClock(() => T0);
  const P = G.newProfile("challenge");
  for (let i = 0; i < 40; i++) { const g = G.gainQuirk(P); if (g) assert.strictEqual(g.quirk.until, T0 + G.quirkDaysOf(g.quirk.type) * DAYMS); P.quirks = []; }
  G.setNowClock(null);
});
T("心情的旁白要說實話：真的變了才說第 1 代的話，壹天第二次、滿了、到底、自由模式都說原因", () => {
  const P = fresh(), ex = G.exhibitById("rare"), bad = G.exhibitById("strange");
  P.mood = 50;
  const v1 = G.viewExhibit(P, ex);
  assert.strictEqual(v1.mood, 10); assert.strictEqual(v1.moodNote, "");
  const v2 = G.viewExhibit(P, ex);
  assert.strictEqual(v2.mood, 0); assert.ok(v2.moodNote.includes("今天已經看過"));
  assert.strictEqual(P.mood, 60);
  const Q = fresh(); Q.mood = 99;
  assert.ok(G.viewExhibit(Q, ex).moodNote.includes("滿了"));
  const R = fresh(); R.mood = 0;
  assert.ok(G.viewExhibit(R, bad).moodNote.includes("不能再低"));
  const F = G.newProfile("free");
  assert.ok(G.viewExhibit(F, ex).moodNote.includes("自由模式"));
  assert.strictEqual(G.viewExhibit(fresh(), G.exhibitById("statue")).moodNote, "", "沒有心情效果的展品不用說");
});
T("存檔：舊存檔的怪癖沒進度當 0 個日子、沒 until 從載入起算 7 天、有 until 的不延長；不在場的參觀者也補；讀回來一字不差", () => {
  G.setNowClock(() => T0);
  const span = G.NUM.quirkDays * DAYMS;
  const old = G.newProfile("challenge");
  old.quirks = [
    { type: "phobia", cat: "帽子", opt: null, since: "2026-11-01" },                       // 11-09 以前的：沒有 until、task
    { type: "mania", cat: "顏色", opt: "紅", until: T0 + 30 * DAYMS, task: "hug" },        // 電腦時鐘被往回調過：太晚了，拉回來
    { type: "phobia", cat: "姿勢", opt: "躺平", until: T0 + 5 * 60000, task: null },        // 20 分鐘版的格式：until 照舊（不延長）、沒有 done
    { type: "phobia", cat: "顏色", opt: "黃", until: T0 + 5 * 60000, task: "跳舞", done: ["2026-11-09", "2026-11-09", "壞的", 3, null] }, // 認不得的治法；進度只留不重複的日期
  ];
  old.visitors = [{ vid: "v2", visitor: 2, slot: 1, quirks: [{ type: "mania", cat: "帽子", opt: "皇冠" }] }];
  const save = G.newSave(); save.profiles.challenge = old;
  const P = G.migrateSave(JSON.parse(JSON.stringify(save))).profiles.challenge;
  same(P.quirks.map(q => [q.until - T0, q.task]), [[span, "deliver"], [3 * DAYMS, "hug"], [5 * 60000, null], [5 * 60000, "deliver"]]);
  same(P.quirks.map(q => q.done), [[], [], [], ["2026-11-09"]], "沒有進度就當 0 個日子");
  same(P.visitors[0].quirks.map(q => [q.until - T0, q.task, q.done]), [[G.quirkSpan(P.visitors[0].quirks[0].type), "deliver", []]], "不在場的參觀者");
  assert.ok(G.isBlocked(P, "帽子", "棒球帽"), "剛讀進來還在擋（從載入起算 7 天）");
  const s2 = G.newSave(); s2.profiles.challenge = P;
  same(G.migrateSave(JSON.parse(JSON.stringify(s2))).profiles.challenge.quirks, JSON.parse(JSON.stringify(P.quirks)));
  // 舊存檔的怪癖做一次事：算第 1 天（進度從 0 起）
  P.quirks = [P.quirks[1]]; P.pillows["p:x"] = 1; G.ensureDay(P, D1); P.day.hugs = {};
  const h = G.hug(P, "p:x"); assert.strictEqual(h.cured[0].step, true); assert.strictEqual(h.cured[0].done, 1);
  G.setNowClock(null);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
