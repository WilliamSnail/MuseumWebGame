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
const unlockAll = P => { G.CATS.forEach(c => G.PEPE_PARTS.find(p => p.name === c).options.forEach(o => { if (!o.forbidden && !o.mutant && !o.gift && !o.key && !P.unlocked[c].includes(o.name)) P.unlocked[c].push(o.name); })); };

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
T("B 做一隻：花 2 靈感、花心情、新收藏", () => {
  const P = fresh(); unlockAll(P); P.insp = 10; P.mood = 50;
  const pick = { 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" };
  G.setRng(seq(d100(7)));
  const s = G.startMake(P, pick);
  assert.ok(s.ok); assert.strictEqual(s.roll.total, 7); assert.strictEqual(P.insp, 8);
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
T("遊戲裡的壹天：玩 15 分鐘算壹天；todayStr 跟著走", () => {
  const P = fresh(); P.created = "2026-11-08"; P.activeSec = 0;
  assert.strictEqual(G.gameDayNo(P, 15), 1); assert.strictEqual(G.gameDateStr(P, 15), "2026-11-08");
  P.activeSec = 15 * 60 - 1; assert.strictEqual(G.gameDayNo(P, 15), 1); assert.strictEqual(G.secToNextDay(P, 15), 1);
  P.activeSec = 15 * 60; assert.strictEqual(G.gameDayNo(P, 15), 2); assert.strictEqual(G.gameDateStr(P, 15), "2026-11-09");
  P.activeSec = 40 * 60; assert.strictEqual(G.gameDayNo(P, 30), 2); assert.strictEqual(G.gameDayNo(P, 15), 3);
  G.setDayClock(() => G.gameDateStr(P, 15));
  try { assert.strictEqual(G.todayStr(), "2026-11-10"); assert.strictEqual(G.addDays("2026-11-30", 1), "2026-12-01"); }
  finally { G.setDayClock(null); }
  assert.strictEqual(G.todayStr(), G.realTodayStr());
  assert.strictEqual(G.daysBetween("2026-11-08", "2026-12-01"), 23);
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
T("E 參觀者給靈感", () => {
  const P = fresh();
  assert.strictEqual(G.visitorArrive(P), null);
  const r = G.finishMake(P, { 稀有度: "稀有", 心情: "傷心", 顏色: "綠", 帽子: "棒球帽", 姿勢: "坐著" }, { natural: 20 });
  G.placeInHall(P, 0, { kind: "pepe", key: r.key });
  const before = P.insp;
  const v = G.visitorArrive(P);
  assert.ok(v && v.text); assert.ok(P.insp > before);
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
  const P = fresh(); P.sanity = 70; G.ensureDay(P, "2026-11-09");
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
T("F 連續 3 天抱抱枕治好怪癖", () => {
  const P = fresh();
  const r = G.finishMake(P, { 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" }, { natural: 50 });
  const key = G.pillowKeyOf({ 尺寸: "標準", 材質: "棉布", 填充: "剛剛好" }, "p:" + r.key);
  P.pillows[key] = 1;
  P.quirks.push({ type: "phobia", cat: "帽子", opt: null });
  ["2026-11-08", "2026-11-09"].forEach(d => { P.day = null; G.ensureDay(P, d); assert.ok(!G.hug(P, key).cured); });
  P.day = null; G.ensureDay(P, "2026-11-10");
  const h = G.hug(P, key);
  assert.ok(h.cured); assert.strictEqual(P.quirks.length, 0);
  assert.ok(!G.hug(P, key).ok);
});
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
  assert.strictEqual(pr.fusion.text, "配方 0／6");
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
T("壹鍵 治療委託會治好怪癖；自由模式也能交（不給靈感）", () => {
  const P = P3();
  P.quirks.push({ type: "phobia", cat: "顏色", opt: "黑" });
  const list = board(P, [{ 心情: "開心" }]); list[0].cure = true;
  mk(P, {}, 60);
  const r = G.deliverAll(P, G.autoDeliverables(P));
  assert.strictEqual(r.cured.length, 1); assert.strictEqual(P.quirks.length, 0);
  const F = fresh("free");
  board(F, [{ 心情: "開心" }]);
  G.finishMake(F, { 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" });
  const fr = G.deliverAll(F, G.autoDeliverables(F));
  assert.strictEqual(fr.results.length, 1); assert.strictEqual(fr.reward, 0); assert.strictEqual(F.insp, 0); assert.strictEqual(F.comments.length, 1);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
