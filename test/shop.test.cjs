// 兌換所和技能成長（shared/shop.js，決定 0032）：node test/shop.test.cjs（npm test 也會跑）
// 數字都讀 NUM；用到亂數的固定骰子（G.setRng）。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
const { readWeeks } = require("../tools/week_check.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 3).join("\n    ")); } finally { G.setNowClock(null); G.setRng(null); } };
const clone = o => JSON.parse(JSON.stringify(o));
const DAY = "2026-11-09"; // 週一
const fresh = (G, date = DAY, job = "detective") => {
  const P = G.newProfile("challenge");
  G.ensureDay(P, date);
  if (job) { G.assignJob(P, job); G.SKILLS.forEach(s => { P.skills[s] = 20; }); }
  return P;
};
const stamps = (G, P, n) => { G.storyState(P).stamps = n; };
const give = (G, P, pick = {}) => { const k = G.pepeKey(Object.assign({ 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" }, pick)); P.pepes[k] = { n: 1, perfect: false, s: ++P.serial, d: DAY }; return k; };
const team3 = (G, P) => ["紅", "綠", "黃"].map(c => give(G, P, { 顏色: c }));
const wear = (G, P, id) => { stamps(G, P, 99); assert.ok(G.buyGear(P, id, DAY).ok); assert.ok(G.wearGear(P, id).ok); };
const gear = (G, id) => G.GEAR_ITEMS.find(x => x.id === id);

// ---------- 裝備 ----------
T("買裝備：扣週章、記在博物館；週章不夠不能買、不扣；買過不能再買", G => {
  const P = fresh(G), it = gear(G, "magnifier"), price = G.NUM.shop.gearPrice[it.tier];
  stamps(G, P, price - 1);
  const no = G.buyGear(P, "magnifier", DAY);
  assert.strictEqual(no.ok, false); assert.ok(/週章不夠/.test(no.reason));
  assert.strictEqual(G.storyState(P).stamps, price - 1, "買不起不扣");
  assert.strictEqual(G.ownsGear(P, "magnifier"), false);
  stamps(G, P, price + 2);
  assert.ok(G.buyGear(P, "magnifier", DAY).ok);
  assert.strictEqual(G.storyState(P).stamps, 2);
  assert.strictEqual(P.shop.gear.magnifier, DAY);
  assert.strictEqual(G.buyGear(P, "magnifier", DAY).ok, false, "買過了");
  assert.strictEqual(G.buyGear(P, "沒有這件", DAY).ok, false);
});
T("等級越高越貴；每件都有名字和說明，說明裡的 {n} 換成數字", G => {
  const p = G.NUM.shop.gearPrice;
  assert.ok(p.common < p.fine && p.fine < p.rare);
  assert.ok(G.GEAR_ITEMS.length >= 6 && G.GEAR_ITEMS.length <= 8);
  G.GEAR_ITEMS.forEach(g => {
    const i = G.gearInfo(g.id);
    assert.ok(i.name && i.name !== g.id, g.id); assert.ok(i.desc && !/\{/.test(i.desc), g.id); assert.ok(i.price > 0, g.id);
    assert.ok(!/一/.test(i.name + i.desc), "畫面上的字用壹");
  });
  assert.ok(G.gearInfo("lamp").desc.includes(String(Math.abs(gear(G, "lamp").cellarSan))));
});
T("穿脫：沒買不能穿；最多穿 NUM.shop.gearWorn 件；脫下來可以換別件", G => {
  const P = fresh(G);
  assert.strictEqual(G.wearGear(P, "lamp").ok, false, "沒買");
  stamps(G, P, 999);
  G.GEAR_ITEMS.forEach(g => assert.ok(G.buyGear(P, g.id, DAY).ok));
  const ids = G.GEAR_ITEMS.map(g => g.id), max = G.NUM.shop.gearWorn;
  ids.slice(0, max).forEach(id => assert.ok(G.wearGear(P, id).ok));
  assert.strictEqual(G.wornGear(P).length, max);
  assert.strictEqual(G.wearGear(P, ids[max]).ok, false, "穿滿了");
  assert.ok(G.wearGear(P, ids[0]).already, "已經穿著");
  assert.ok(G.takeOffGear(P, ids[0]).ok);
  assert.ok(G.wearGear(P, ids[max]).ok);
  assert.strictEqual(G.isWorn(P, ids[0]), false);
  assert.strictEqual(G.takeOffGear(P, ids[0]).ok, false, "沒穿著");
});
T("效果：探險燈少扣理智（最少還是 1）；有扣才算；怕黑加探險燈抵銷", G => {
  const P = fresh(G), keys = team3(G, P);
  const hit = san => { P.cellar.run = { floor: 1, idx: 0, team: keys, used: {}, log: [] }; return G.cellarApply(P, { room: { id: "r" }, choice: { fail: { text: "x", san } }, type: "power", success: false, extraSan: null }); };
  assert.strictEqual(hit("3").sanLoss, 3, "沒穿");
  wear(G, P, "lamp");
  const fx = hit("3");
  assert.strictEqual(fx.sanLoss, 3 + gear(G, "lamp").cellarSan);
  assert.strictEqual(fx.dark, gear(G, "lamp").cellarSan);
  assert.strictEqual(hit("1").sanLoss, 1, "扣 1 點的照扣（理智要算容易歸零）");
  assert.strictEqual(G.cellarDarkLoss(P, 0), 0, "沒扣就不算");
  P.flaw = "darkfear";
  assert.strictEqual(G.cellarDarkLoss(P, 3), G.traitById("darkfear").cellarSan + gear(G, "lamp").cellarSan);
  assert.ok(G.traitHits(P, "cellarSan").some(t => t.name === "探險燈"), "畫面寫得出是誰");
});
T("效果：放大鏡加偵查檢定，不改技能本身、不影響成長和傳下去的", G => {
  const P = fresh(G), plus = gear(G, "magnifier")["skill:偵查"];
  const base = P.skills.偵查;
  wear(G, P, "magnifier");
  assert.strictEqual(G.skillOf(P, "偵查"), base + plus);
  assert.strictEqual(G.skillOf(P, "鑑賞"), 20);
  assert.strictEqual(G.skillCheck(P, "偵查").target, base + plus);
  assert.strictEqual(P.skills.偵查, base, "技能本身沒變");
  assert.strictEqual(G.bestSkill(P)[1], base, "最拿手的技能照本身算");
  P.skills.偵查 = 98;
  assert.strictEqual(G.skillOf(P, "偵查"), 99, "最多 99");
});
T("效果：護身符讓看懂檢定變難；搬運手套加隊伍強度；算盤、圍裙、學習筆記都照規則走", G => {
  const P = fresh(G), keys = team3(G, P);
  G.setRng(() => 0.5);
  const u0 = G.understandCheck(P).target, pw0 = G.teamPower(P, G.teamItems(P, keys), null).total;
  stamps(G, P, 999);
  ["amulet", "gloves", "abacus", "apron", "notebook"].forEach(id => assert.ok(G.buyGear(P, id, DAY).ok));
  G.wearGear(P, "amulet"); G.wearGear(P, "gloves");
  assert.strictEqual(G.understandCheck(P).target, u0 + gear(G, "amulet").understand);
  const tp = G.teamPower(P, G.teamItems(P, keys), null);
  assert.strictEqual(tp.total, pw0 + gear(G, "gloves").power);
  assert.ok(tp.notes.some(n => n.includes("搬運手套")), "寫得出是誰");
  G.takeOffGear(P, "amulet"); G.takeOffGear(P, "gloves");
  // 算盤：交委託多拿
  G.wearGear(P, "abacus");
  const list = G.dailyCommissions(P, DAY), c = list[0];
  c.kind = "pepe"; c.need = {}; c.reward = 10;
  const r = G.deliver(P, 0, { kind: "pepe", key: keys[0], pick: G.fromKey(keys[0]) });
  assert.ok(r.ok, r.reason);
  assert.strictEqual(r.reward, 10 + gear(G, "abacus").deal);
  G.takeOffGear(P, "abacus");
  // 圍裙：骰到就不花靈感
  G.wearGear(P, "apron");
  P.insp = G.NUM.costPillow + 3; G.setRng(() => 0);
  const pl = G.makePillow(P, { 尺寸: "標準", 材質: "棉布", 填充: "剛剛好" }, "p:" + keys[0]);
  assert.ok(pl.ok && pl.free); assert.strictEqual(P.insp, G.NUM.costPillow + 3);
  G.setRng(() => 0.999);
  assert.strictEqual(G.makePillow(P, { 尺寸: "小抱枕", 材質: "棉布", 填充: "剛剛好" }, "p:" + keys[0]).free, false);
  G.takeOffGear(P, "apron");
  // 學習筆記：換日的經驗檢定多長
  G.wearGear(P, "notebook");
  P.skillTicks = { 偵查: true };
  G.setRng(() => 0.95); // d100 擲高（比技能值大），1D10 擲 10
  const g = G.skillGrowth(P)[0];
  assert.ok(g.up);
  assert.strictEqual(g.gain, 10 + gear(G, "notebook").growth);
});
T("自由模式沒有裝備：買不了、穿不了，穿著的也不算", G => {
  const F = G.newProfile("free"); G.ensureDay(F, DAY);
  assert.strictEqual(G.buyGear(F, "lamp", DAY).ok, false);
  assert.strictEqual(G.wearGear(F, "lamp").ok, false);
  F.gear = ["lamp"]; F.shop.gear.lamp = DAY;
  assert.deepStrictEqual(clone(G.wornGear(F)), []);
  assert.strictEqual(G.traitSum(F, "cellarSan"), 0);
  assert.strictEqual(G.ownsGear(F, "lamp"), false);
});
T("換人：裝備還在；三位各穿各的，同一件可以都穿；換回來還穿著；換人不會多週章", G => {
  const P = fresh(G);
  wear(G, P, "abacus");
  const left = G.storyState(P).stamps;
  const a = P.vid;
  assert.ok(G.addVisitor(P, "第二位", 1));
  G.assignJob(P, "artisan");
  assert.deepStrictEqual(clone(P.gear), [], "新來的還沒穿");
  assert.strictEqual(G.ownsGear(P, "abacus"), true, "裝備是博物館的");
  assert.strictEqual(G.traitSum(P, "deal") - G.traitSum({ mode: "challenge", perk: P.perk, flaw: P.flaw, gear: [] }, "deal"), 0, "沒穿就沒有效果");
  assert.ok(G.wearGear(P, "abacus").ok, "第二位也可以穿同一件");
  assert.ok(G.buyGear(P, "coin", DAY).ok);
  assert.ok(G.wearGear(P, "coin").ok);
  const b = P.vid;
  assert.ok(G.switchVisitor(P, a));
  assert.deepStrictEqual(clone(P.gear), ["abacus"], "換回來還穿著自己的");
  assert.strictEqual(G.ownsGear(P, "coin"), true, "別人買的也是博物館的");
  assert.ok(G.switchVisitor(P, b));
  assert.deepStrictEqual(clone(P.gear), ["abacus", "coin"]);
  assert.strictEqual(G.storyState(P).stamps, left - G.NUM.shop.gearPrice[gear(G, "coin").tier], "週章是博物館的");
});
T("理智歸零、退休換下一位：裝備還在，同一個位子接著穿", G => {
  const P = fresh(G);
  wear(G, P, "lamp");
  G.setRng(() => 0.5);
  G.nextVisitor(P, "russia8");
  assert.strictEqual(P.job, null);
  assert.strictEqual(G.ownsGear(P, "lamp"), true);
  assert.deepStrictEqual(clone(P.gear), ["lamp"]);
  assert.strictEqual(G.traitSum(P, "cellarSan"), gear(G, "lamp").cellarSan);
});

// ---------- 提升技能 ----------
T("提升技能：花週章、指定技能 +骰子；越高越貴；週章不夠不扣", G => {
  const P = fresh(G), T0 = G.NUM.shop.skillUpPrice;
  assert.ok(T0[0].stamps < T0[1].stamps && T0[1].stamps < T0[2].stamps, "越高越貴");
  assert.strictEqual(G.skillUpPrice(T0[0].below - 1), T0[0].stamps);
  assert.strictEqual(G.skillUpPrice(T0[0].below), T0[1].stamps);
  P.skills.偵查 = T0[1].below; // 第三級
  const price = G.skillUpState(P, "偵查").price;
  assert.strictEqual(price, T0[2].stamps);
  stamps(G, P, price - 1);
  const no = G.buySkillUp(P, "偵查");
  assert.strictEqual(no.ok, false); assert.strictEqual(no.short, 1);
  assert.strictEqual(G.storyState(P).stamps, price - 1);
  stamps(G, P, price);
  G.setRng(() => 0.999);
  const r = G.buySkillUp(P, "偵查");
  assert.ok(r.ok);
  assert.strictEqual(r.after, r.before + G.parseDice(G.NUM.shop.skillUp).m);
  assert.strictEqual(G.storyState(P).stamps, 0);
});
T("提升技能：上限跟技能書一樣（NUM.story.skillCap），不會超過；已經超過的（經驗檢定長的）不會被拉回來", G => {
  const P = fresh(G), cap = G.NUM.story.skillCap;
  stamps(G, P, 999);
  P.skills.偵查 = cap - 1;
  G.setRng(() => 0.999);
  assert.strictEqual(G.buySkillUp(P, "偵查").after, cap);
  const full = G.skillUpState(P, "偵查");
  assert.strictEqual(full.ok, false); assert.ok(full.full);
  const left = G.storyState(P).stamps;
  assert.strictEqual(G.buySkillUp(P, "偵查").ok, false);
  assert.strictEqual(G.storyState(P).stamps, left, "到上限不扣");
  P.skills.偵查 = 90;
  assert.strictEqual(G.skillUpState(P, "偵查").ok, false);
  assert.strictEqual(P.skills.偵查, 90);
  const none = G.growSkill(P, "偵查", "1D5", cap);
  assert.strictEqual(none.after, 90, "growSkill 不會把高的拉回來");
});
T("提升技能：還沒選職業、自由模式不行", G => {
  const P = fresh(G, DAY, null);
  stamps(G, P, 99);
  assert.strictEqual(G.buySkillUp(P, "偵查").ok, false);
  const F = G.newProfile("free"); G.ensureDay(F, DAY);
  assert.strictEqual(G.buySkillUp(F, "偵查").ok, false);
});

// ---------- 上課 ----------
T("上課：一天一堂；花靈感；越高越貴；靈感不夠不扣；明天又可以", G => {
  const P = fresh(G), L = G.NUM.shop.lessonPrice;
  assert.ok(L[0].insp < L[1].insp && L[1].insp < L[2].insp);
  assert.strictEqual(G.lessonLeft(P), G.NUM.shop.lessonPerDay);
  P.skills.偵查 = 0; P.insp = L[0].insp - 1;
  const poor = G.takeLesson(P, "偵查");
  assert.strictEqual(poor.ok, false); assert.strictEqual(poor.short, 1);
  assert.strictEqual(P.insp, L[0].insp - 1);
  assert.strictEqual(G.lessonLeft(P), G.NUM.shop.lessonPerDay, "沒上成不算");
  P.insp = 100; P.skills.偵查 = L[0].below;
  assert.strictEqual(G.lessonState(P, "偵查").price, L[1].insp);
  G.setRng(() => 0.999);
  const r = G.takeLesson(P, "偵查");
  assert.ok(r.ok);
  assert.strictEqual(P.insp, 100 - L[1].insp);
  assert.strictEqual(r.after, L[0].below + G.parseDice(G.NUM.shop.lessonSkill).m);
  assert.strictEqual(G.lessonLeft(P), 0);
  const again = G.takeLesson(P, "鑑賞");
  assert.strictEqual(again.ok, false); assert.ok(again.used);
  G.ensureDay(P, G.addDays(DAY, 1));
  assert.strictEqual(G.lessonLeft(P), G.NUM.shop.lessonPerDay, "明天又可以");
  assert.ok(G.takeLesson(P, "鑑賞").ok);
});
T("上課：有上限（NUM.shop.lessonCap，比技能書低）；換人不會多一堂", G => {
  const P = fresh(G), cap = G.NUM.shop.lessonCap;
  assert.ok(cap < G.NUM.story.skillCap);
  P.insp = 100;
  P.skills.偵查 = cap;
  const full = G.lessonState(P, "偵查");
  assert.strictEqual(full.ok, false); assert.ok(full.full);
  P.skills.偵查 = cap - 1;
  G.setRng(() => 0.999);
  assert.strictEqual(G.takeLesson(P, "偵查").after, cap);
  G.addVisitor(P, "第二位", 1); G.assignJob(P, "artisan");
  assert.strictEqual(G.lessonLeft(P), 0, "今天這堂是博物館的");
  assert.strictEqual(G.takeLesson(P, "手工藝").ok, false);
});
T("上課：自由模式、還沒選職業不行", G => {
  const F = G.newProfile("free"); G.ensureDay(F, DAY); F.insp = 99;
  assert.strictEqual(G.lessonLeft(F), 0);
  assert.strictEqual(G.takeLesson(F, "偵查").ok, false);
  const P = fresh(G, DAY, null);
  assert.strictEqual(G.takeLesson(P, "偵查").ok, false);
});

// ---------- 試煉房間 ----------
T("試煉房間：格式跟 CELLAR 一樣；強度門檻照樓層；沒有不用挑戰的選項；每個技能都有一間", G => {
  const POWER = { 1: [11, 13], 2: [15, 16], 3: [17, 19], 4: [19, 21], 5: [20, 23] };
  const rooms = G.trialRooms();
  assert.ok(rooms.length >= 3);
  assert.deepStrictEqual(clone(G.SKILLS.filter(s => !rooms.some(r => r.skill === s))), [], "每個技能都有");
  assert.strictEqual(new Set(rooms.map(r => r.id)).size, rooms.length);
  rooms.forEach(r => {
    assert.ok(G.cellarFloor(r.floor), r.id);
    assert.ok(G.SKILLS.includes(r.skill), r.id);
    assert.ok(r.choices.length >= 2, r.id);
    assert.ok(!/一/.test(JSON.stringify([r.title, r.intro, r.lines, r.choices])), "畫面上的字用壹：" + r.id);
    r.choices.forEach(c => {
      assert.notStrictEqual(c.check.type, "none", r.id);
      if (c.check.type === "power") assert.ok(c.check.target >= POWER[r.floor][0] && c.check.target <= POWER[r.floor][1], r.id);
      if (c.check.type === "skill") assert.ok(G.SKILLS.includes(c.check.skill), r.id);
      assert.ok(!c.success.insp, "過了不給靈感：" + r.id);
      assert.ok(!String(c.success.san || "").startsWith("+"), "過了不回理智：" + r.id);
    });
  });
});
const firstTrial = G => G.trialRooms().find(r => r.floor === 1);
T("試煉房間：樓層沒走過進不去；走過才開；過了給指定技能成長", G => {
  const P = fresh(G), keys = team3(G, P), r = firstTrial(G);
  assert.strictEqual(G.trialState(P, r.id).state, "locked");
  assert.strictEqual(G.startTrial(P, r.id, keys).ok, false);
  P.cellar.best = r.floor;
  assert.strictEqual(G.trialState(P, r.id).state, "open");
  assert.strictEqual(G.startTrial(P, r.id, keys.slice(0, 2)).ok, false, "要 3 隻");
  assert.ok(G.startTrial(P, r.id, keys).ok);
  assert.strictEqual(G.currentRoom(P).id, r.id);
  const before = P.skills[r.skill], i0 = P.insp, s0 = P.sanity;
  G.setRng(() => 0.999);
  const fx = G.cellarApply(P, { room: G.currentRoom(P), choice: r.choices[0], type: "skill", success: true });
  assert.ok(fx.trial);
  assert.strictEqual(fx.trial.skill, r.skill);
  assert.strictEqual(P.skills[r.skill], before + G.parseDice(G.NUM.shop.trialSkill).m);
  assert.strictEqual(P.insp, i0, "不給靈感");
  assert.strictEqual(P.sanity, s0);
  const a = G.cellarAdvance(P);
  assert.ok(a.extra); assert.strictEqual(P.cellar.run, null, "只走這一間");
  assert.strictEqual(P.cellar.best, r.floor, "不算整層");
});
T("試煉房間：沒過不算次數，還可以再試；過了這週不能再來；下週一 05:00 又可以", G => {
  const P = fresh(G), keys = team3(G, P), r = firstTrial(G);
  P.cellar.best = r.floor;
  G.startTrial(P, r.id, keys);
  const lose = G.cellarApply(P, { room: G.currentRoom(P), choice: r.choices[0], type: "skill", success: false });
  assert.ok(!lose.trial);
  assert.strictEqual(P.skills[r.skill], 20);
  assert.ok(lose.sanLoss > 0, "沒過要付代價");
  G.cellarAdvance(P);
  assert.strictEqual(G.trialState(P, r.id).state, "open", "沒過不算");
  G.startTrial(P, r.id, keys);
  assert.ok(G.cellarApply(P, { room: G.currentRoom(P), choice: r.choices[0], type: "skill", success: true }).trial);
  G.cellarAdvance(P);
  const st = G.trialState(P, r.id);
  assert.strictEqual(st.state, "done"); assert.strictEqual(st.left, 0);
  assert.strictEqual(G.startTrial(P, r.id, keys).ok, false);
  const other = G.trialRooms().find(x => x.floor === 1 && x.id !== r.id);
  assert.strictEqual(G.trialState(P, other.id).state, "open", "別間不受影響");
  G.ensureDay(P, "2026-11-15"); // 週日
  assert.strictEqual(G.trialState(P, r.id).state, "done");
  G.ensureDay(P, "2026-11-16"); // 下週一
  assert.strictEqual(G.trialState(P, r.id).state, "open");
});
T("試煉房間：換人不會多拿；躺平、毛帽不回理智；技能到上限不用進去；自由模式、還沒有技能不行", G => {
  const P = fresh(G), r = firstTrial(G);
  const keys = [give(G, P, { 顏色: "紅", 姿勢: "躺平" }), give(G, P, { 顏色: "綠", 帽子: "毛帽" }), give(G, P, { 顏色: "黃" })];
  P.cellar.best = r.floor;
  P.sanity = 30;
  G.startTrial(P, r.id, keys);
  const fx = G.cellarApply(P, { room: G.currentRoom(P), choice: r.choices[0], type: "skill", success: true });
  assert.strictEqual(fx.sanGain, 0, "試煉房間不回理智");
  G.cellarAdvance(P);
  G.addVisitor(P, "第二位", 1); G.assignJob(P, "artisan");
  assert.strictEqual(G.trialState(P, r.id).state, "done", "這週的次數是博物館的");
  const other = G.trialRooms().find(x => x.floor === 1 && x.id !== r.id);
  P.skills[other.skill] = G.NUM.story.skillCap;
  assert.strictEqual(G.trialState(P, other.id).state, "full");
  const F = G.newProfile("free"); G.ensureDay(F, DAY);
  assert.strictEqual(G.startTrial(F, r.id, []).ok, false);
  assert.strictEqual(G.trialWin(F, { id: r.id, trial: r.skill }), null);
  const N = fresh(G, DAY, null); N.cellar.best = 5;
  assert.strictEqual(G.trialState(N, r.id).state, "nojob");
});

// ---------- 週包的房間 ----------
const LIB = G => G.storyLibrary(Object.fromEntries(Object.entries(readWeeks().files).filter(([k]) => k.startsWith("備用/"))));
T("週包的房間獎勵可以寫技能成長：找到時給現在這位；只給一次；rewardText 寫得出來", G => {
  const lib = LIB(G), files = clone(readWeeks().files);
  const wk = files["備用/常青1/week.json"]; wk.anomaly.room.reward = { insp: 2, skill: "鑑賞" };
  const W = G.storyWeek(G.storyLibrary(Object.fromEntries(Object.entries(files).filter(([k]) => k.startsWith("備用/")))), DAY);
  assert.ok(lib);
  const P = fresh(G), room = W.anomaly.room;
  assert.strictEqual(room.reward.skill, "鑑賞");
  assert.ok(G.rewardText(room.reward).includes("鑑賞"));
  G.setRng(() => 0.999);
  P.cellar.won[room.id] = true;
  G.syncStory(P, W, DAY);
  const before = P.skills.鑑賞;
  const r = G.claimSpot(P, W, room.id, DAY);
  assert.ok(r.ok);
  assert.strictEqual(r.grown.after, before + G.parseDice(G.NUM.shop.trialSkill).m);
  assert.strictEqual(G.claimSpot(P, W, room.id, DAY).ok, false, "領過了");
  assert.strictEqual(P.skills.鑑賞, r.grown.after);
  // 不認得的技能不給
  assert.strictEqual(G.storyWeek(LIB(G), DAY).anomaly.room.reward.skill, null, "原本的週包沒有技能成長");
});
T("週包的預算會算技能成長（dayRewardTotal、weekTaskTotal）", G => {
  const room = { reward: { skill: "偵查" }, choices: [] };
  assert.strictEqual(G.dayRewardTotal({ adds: [room] }).skills, 1);
  assert.strictEqual(G.weekTaskTotal({ anomaly: { room } }).skills, 1);
  assert.ok(G.NUM.story.dayBudget.skills >= 1 && G.NUM.story.weekTaskBudget.skills >= 1);
});

// ---------- 跟館友學 ----------
const buddy = (G, job, value) => { const B = fresh(G, DAY, job); const s = G.jobSkill(job); B.skills[s] = value; return B; };
T("跟館友學：對方拿手的技能比你高才有機會；機率 NUM.shop.learnChance；學會 +NUM.shop.learnGain", G => {
  const P = fresh(G), B = buddy(G, "occultist", 60), c = G.NUM.shop.learnChance;
  assert.deepStrictEqual(clone(G.friendTalent(B)), { skill: "神秘學", value: 60 });
  G.setRng(() => (c - 1) / 100); // 擲出 c：剛好過
  const yes = G.learnFromFriend(P, G.friendTalent(B));
  assert.ok(yes.gained);
  assert.strictEqual(yes.to, 20 + G.NUM.shop.learnGain);
  assert.strictEqual(P.skills.神秘學, yes.to);
  G.setRng(() => c / 100); // 擲出 c+1：沒過
  const no = G.learnFromFriend(P, G.friendTalent(B));
  assert.strictEqual(no.gained, false); assert.strictEqual(no.capped, false);
  assert.strictEqual(P.skills.神秘學, yes.to);
  P.skills.神秘學 = 60;
  assert.strictEqual(G.learnFromFriend(P, G.friendTalent(B)), null, "沒有比你高");
  P.skills.神秘學 = 70;
  assert.strictEqual(G.learnFromFriend(P, G.friendTalent(B)), null, "比你低");
  assert.strictEqual(G.friendTalent(fresh(G, DAY, null)), null, "對方還沒選職業");
  assert.strictEqual(G.learnFromFriend(P, null), null);
});
T("跟館友學：每天上限 NUM.shop.learnPerDay；隔天又可以；到上限（80）不用學；自由模式不行；擲骰只在有機會時", G => {
  const P = fresh(G), B = buddy(G, "occultist", 90), max = G.NUM.shop.learnPerDay;
  G.setRng(() => 0);
  for (let i = 0; i < max; i++) assert.ok(G.learnFromFriend(P, G.friendTalent(B)).gained);
  const v = P.skills.神秘學;
  let calls = 0; G.setRng(() => { calls++; return 0; });
  const cap = G.learnFromFriend(P, G.friendTalent(B));
  assert.ok(cap.capped); assert.strictEqual(cap.gained, false);
  assert.strictEqual(P.skills.神秘學, v);
  assert.strictEqual(calls, 0, "學夠了不擲骰");
  G.ensureDay(P, G.addDays(DAY, 1));
  assert.ok(G.learnFromFriend(P, G.friendTalent(B)).gained);
  P.skills.神秘學 = G.NUM.story.skillCap;
  assert.strictEqual(G.learnFromFriend(P, G.friendTalent(B)), null);
  const F = G.newProfile("free"); G.ensureDay(F, DAY);
  assert.strictEqual(G.learnFromFriend(F, G.friendTalent(B)), null);
});
const fusePair = (G, ja, va, jb, vb) => {
  const A = buddy(G, ja, va), Bb = buddy(G, jb, vb);
  A.insp = 100; Bb.insp = 100;
  return { A, B: Bb, ka: give(G, A, { 顏色: "紅" }), kb: give(G, Bb, { 顏色: "綠" }) };
};
T("一起融合：結果裡有 learn（各學對方的）；比的是融合之前的技能；兩個人都比對方高就都學", G => {
  const { A, B, ka, kb } = fusePair(G, "detective", 70, "occultist", 65);
  G.setRng(() => 0.01);
  const r = G.fuseTogether(A, { kind: "pepe", key: ka }, B, { kind: "pepe", key: kb });
  assert.ok(r.ok, r.reason);
  assert.strictEqual(r.a.learn.skill, "神秘學");
  assert.ok(r.a.learn.gained);
  assert.strictEqual(A.skills.神秘學, 20 + G.NUM.shop.learnGain);
  assert.strictEqual(r.b.learn.skill, "偵查");
  assert.ok(r.b.learn.gained);
  assert.ok(JSON.parse(JSON.stringify(r.a.learn)), "放得進資料庫（沒有 undefined）");
});
T("一起融合：對方沒有比你高就沒有 learn；學的骰子不影響做出來的佩佩", G => {
  const run = (hi) => {
    const { A, B, ka, kb } = fusePair(G, "detective", 70, "occultist", hi);
    A.skills.神秘學 = 70; B.skills.偵查 = 80; // hi 比 70 高才學得到
    let s = 7; G.setRng(() => (s = (s * 16807) % 2147483647) / 2147483647);
    const r = G.fuseTogether(A, { kind: "pepe", key: ka }, B, { kind: "pepe", key: kb });
    G.setRng(null);
    return r;
  };
  const no = run(60), yes = run(75);
  assert.strictEqual(no.a.learn, null);
  assert.strictEqual(no.b.learn, null);
  assert.ok(yes.a.learn, "對方比較高");
  assert.strictEqual(yes.a.made.key, no.a.made.key, "同一隻");
  assert.strictEqual(yes.a.san.roll, no.a.san.roll);
  assert.strictEqual(yes.b.san.roll, no.b.san.roll);
});
T("一起融合：理智用完的人學不到", G => {
  const { A, B, ka, kb } = fusePair(G, "detective", 70, "occultist", 90);
  A.sanity = 1;
  G.setRng(() => 0.999); // 理智檢定失敗
  const r = G.fuseTogether(A, { kind: "pepe", key: ka }, B, { kind: "pepe", key: kb });
  assert.ok(r.ok, r.reason);
  assert.ok(r.a.san.zero);
  assert.strictEqual(r.a.learn, null);
});

// ---------- 限定頭飾 ----------
T("限定頭飾：6～8 件；都有文字；不算進圖鑑、全部解鎖；每週全簽到不會輪到", G => {
  const ids = G.shopLimitedIds();
  assert.ok(ids.length >= 6 && ids.length <= 8);
  ids.forEach(id => {
    const it = G.limitedInfo(id);
    assert.strictEqual(it.kind, "part");
    assert.ok(G.optOf(it.cat, it.opt) && G.optOf(it.cat, it.opt).limited === "shop", id);
    assert.ok(G.LIMITED_TEXT[id], id); assert.ok(it.desc && it.price > 0, id);
    assert.ok(!/一/.test(it.name + it.desc), "畫面上的字用壹");
  });
  assert.strictEqual(G.CORE_TOTAL, 1280, "圖鑑格數不變（docs/界線.md：1,280 格）");
  const P = fresh(G);
  const known = G.knownTotal(P), poss = G.possibilities(P);
  stamps(G, P, 99);
  assert.ok(G.buyLimited(P, ids[0], [ids[0]], DAY).ok);
  assert.strictEqual(G.knownTotal(P), known, "全部解鎖的分母不變");
  assert.ok(G.possibilities(P) > poss, "手作坊選得到");
  for (let w = 2900; w < 2960; w++) assert.ok(!ids.includes((G.weeklyItem(w) || {}).id), "全簽到不會輪到");
});
T("上架：週包沒指定照週號輪流（大家同一週同一批，每週換）；週包指定就照週包", G => {
  const all = G.shopLimitedIds(), n = G.NUM.shop.limitedRotate;
  const a = G.shopOnSale(null, "2026-11-09"), a2 = G.shopOnSale(null, "2026-11-15"), b = G.shopOnSale(null, "2026-11-16");
  assert.strictEqual(a.length, n);
  assert.deepStrictEqual(clone(a), clone(a2), "同一週同一批");
  assert.notDeepStrictEqual(clone(a), clone(b), "下週換");
  assert.deepStrictEqual(clone(G.shopOnSale({ shop: [] }, "2026-11-09")), clone(a), "週包沒指定");
  const seen = new Set();
  for (let i = 0; i < all.length * 2; i++) G.shopOnSale(null, G.addDays("2026-11-09", 7 * i)).forEach(id => seen.add(id));
  assert.strictEqual(seen.size, all.length, "輪流下來每件都賣得到");
  assert.deepStrictEqual(clone(G.shopOnSale({ shop: ["hat-pot", "hat-rain"] }, "2026-11-09")), ["hat-pot", "hat-rain"]);
  assert.deepStrictEqual(clone(G.shopOnSale({ shop: ["沒有這件", "hat-rain", "hat-rain"] }, "2026-11-09")), ["hat-rain"], "壞的濾掉");
  assert.deepStrictEqual(clone(G.shopOnSale({ shop: ["沒有這件"] }, "2026-11-09")), clone(a), "都壞掉就照週號輪流");
  assert.strictEqual(G.shopOnSale({ shop: all }, "2026-11-09").length, G.NUM.shop.limitedMax);
});
T("週包的 shop 接得上 storyWeek：寫了就照週包；沒寫就輪流", G => {
  const files = clone(readWeeks().files);
  files["備用/常青1/week.json"].shop = ["hat-muff", "hat-bow"];
  const W = G.storyWeek(G.storyLibrary(Object.fromEntries(Object.entries(files).filter(([k]) => k.startsWith("備用/")))), DAY);
  assert.deepStrictEqual(clone(G.shopOnSale(W, DAY)), ["hat-muff", "hat-bow"]);
  const W0 = G.storyWeek(LIB(G), DAY);
  assert.deepStrictEqual(clone(G.shopOnSale(W0, DAY)), clone(G.shopOnSale(null, DAY)));
  const N = G.storyNotice(W, DAY, Date.parse(DAY + "T12:00:00+08:00"));
  assert.ok(N.sections.some(s => s[0] === "兌換所" && s[1][0].includes("毛耳罩")), "公告寫得出這週上架什麼");
});
T("買限定頭飾：只能買這週上架的；週章不夠不扣；買到打開選項、手作坊選得到；有「馬上使用」要去的地方；買過不能再買", G => {
  const P = fresh(G), id = "hat-rain", it = G.limitedInfo(id);
  assert.strictEqual(G.buyLimited(P, id, ["hat-bow"], DAY).ok, false, "沒上架");
  assert.strictEqual(G.buyLimited(P, "stand-velvet", ["stand-velvet"], DAY).ok, false, "不是兌換所賣的");
  stamps(G, P, it.price - 1);
  assert.strictEqual(G.buyLimited(P, id, [id], DAY).ok, false, "週章不夠");
  assert.strictEqual(G.storyState(P).stamps, it.price - 1);
  stamps(G, P, it.price);
  assert.strictEqual(G.unlockState(P, it.cat, it.opt).state, "limited");
  assert.ok(/兌換所/.test(G.unlockState(P, it.cat, it.opt).text));
  const r = G.buyLimited(P, id, [id], DAY);
  assert.ok(r.ok, r.reason);
  assert.strictEqual(G.storyState(P).stamps, 0);
  assert.ok(G.usable(P, it.cat).includes(it.opt));
  assert.strictEqual(G.ownsLimited(P, id), true);
  assert.deepStrictEqual(clone(G.useTarget(id)).room, "workshop");
  assert.strictEqual(clone(G.useTarget(id)).params.preset[it.cat], it.opt);
  stamps(G, P, 99);
  assert.strictEqual(G.buyLimited(P, id, [id], DAY).ok, false, "買過了");
  assert.strictEqual(G.storyState(P).stamps, 99);
  const F = G.newProfile("free"); G.ensureDay(F, DAY);
  assert.strictEqual(G.buyLimited(F, id, [id], DAY).ok, false);
});
T("買到的頭飾真的做得出來；舊的展廳、圖鑑算法不會壞", G => {
  const P = fresh(G);
  stamps(G, P, 99);
  G.buyLimited(P, "hat-chef", ["hat-chef"], DAY);
  P.insp = G.NUM.costPepe + 4;
  const pick = { 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "廚師帽", 姿勢: "站著" };
  assert.ok(G.startMake(P, pick).ok);
  const res = G.finishMake(P, pick, { natural: 50 });
  assert.ok(P.pepes[res.key]);
  assert.strictEqual(G.fromKey(res.key).帽子, "廚師帽");
  assert.strictEqual(G.codexCount(P), 0, "限定的不算進圖鑑");
});

// ---------- 材料換週章 ----------
T("金箔算 2 份：金箔加舊畫布剛好換壹枚；只剩金箔要 2 片不找零；有舊畫布就不多花金箔；說明寫得出份數", G => {
  const P = fresh(G), S = G.storyState(P);
  assert.strictEqual(G.NUM.shop.matToStamp, 3);
  S.bag = { "mat:金箔": 1 };
  assert.strictEqual(G.matCount(P), 2);
  assert.strictEqual(G.tradeMats(P).ok, false);
  assert.strictEqual(S.bag["mat:金箔"], 1, "不夠不能動");
  S.bag = { "mat:金箔": 1, "mat:畫布": 1 };
  assert.strictEqual(G.matCount(P), 3);
  assert.ok(G.tradeMats(P).ok);
  assert.strictEqual(G.matCount(P), 0);
  S.bag = { "mat:金箔": 3 };
  assert.ok(G.tradeMats(P).ok);
  assert.strictEqual(S.bag["mat:金箔"], 1, "只剩金箔用 2 片");
  S.bag = { "mat:金箔": 2, "mat:畫布": 5 };
  assert.ok(G.tradeMats(P).ok);
  assert.strictEqual(G.matCount(P), 6, "剛好用掉 3 份");
  assert.ok(G.itemDesc("mat:金箔").includes("算 2 份"));
  assert.ok(G.itemDesc("mat:畫布").includes("算 1 份"));
});
T("材料換週章：每 NUM.shop.matToStamp 份（哪一種都算）換一枚；不夠不能換；別的東西不會被用掉", G => {
  const P = fresh(G), S = G.storyState(P), need = G.NUM.shop.matToStamp;
  S.bag = { "mat:畫布": need - 1, firstAid: 2 };
  assert.strictEqual(G.matCount(P), need - 1);
  assert.strictEqual(G.tradeMats(P).ok, false);
  S.bag["mat:金線"] = 1;
  const r = G.tradeMats(P);
  assert.ok(r.ok);
  assert.strictEqual(S.stamps, 1);
  assert.strictEqual(G.matCount(P), 0);
  assert.strictEqual(S.bag.firstAid, 2);
  assert.ok(!("mat:畫布" in S.bag));
  assert.ok(G.itemUsable(P, "firstAid").reason || true);
  S.bag["mat:金箔"] = 1;
  assert.ok(/兌換所/.test(G.itemUsable(P, "mat:金箔").reason), "材料的說明不再寫「之後」");
  assert.ok(/兌換所/.test(G.itemDesc("mat:金箔")));
});

// ---------- 舊存檔 ----------
T("舊存檔：沒有 P.shop、P.gear（現在這位、不在場的）讀得進來，也可以買、穿", G => {
  const P = fresh(G);
  G.addVisitor(P, "第二位", 1);
  const raw = clone(P);
  delete raw.shop; delete raw.gear;
  raw.visitors.forEach(v => { delete v.gear; });
  const out = G.fixProfile(raw, "challenge");
  assert.deepStrictEqual(clone(out.shop), { gear: {}, trials: {} });
  assert.deepStrictEqual(clone(out.gear), []);
  assert.deepStrictEqual(clone(out.visitors[0].gear), []);
  stamps(G, out, 99);
  assert.ok(G.buyGear(out, "lamp", DAY).ok);
  assert.ok(G.wearGear(out, "lamp").ok);
  const s = G.migrateSave({ profiles: { challenge: raw, free: null } });
  assert.deepStrictEqual(clone(s.profiles.challenge.gear), []);
});
T("舊存檔：壞掉的欄位、不認得的裝備、沒買的、超過上限的都整理掉；存檔來回不變", G => {
  const P = fresh(G);
  stamps(G, P, 999);
  G.GEAR_ITEMS.forEach(g => G.buyGear(P, g.id, DAY));
  P.shop.gear.舊東西 = DAY;
  P.shop.trials = { "t:look": { w: 1, n: 1 }, 壞的: "x" };
  P.gear = ["lamp", "舊東西", "lamp", "coin", "abacus"];
  const out = G.fixProfile(clone(P), "challenge");
  assert.ok(!out.shop.gear.舊東西);
  assert.ok(!out.shop.trials.壞的);
  assert.deepStrictEqual(clone(out.gear).length, G.NUM.shop.gearWorn);
  assert.deepStrictEqual(clone(out.gear), ["lamp", "coin"]);
  const bad = G.fixProfile(Object.assign(clone(P), { shop: "壞掉", gear: "也壞掉" }), "challenge");
  assert.deepStrictEqual(clone(bad.shop), { gear: {}, trials: {} });
  assert.deepStrictEqual(clone(bad.gear), []);
  const a = JSON.stringify(G.fixProfile(clone(out), "challenge").shop), b = JSON.stringify(out.shop);
  assert.strictEqual(a, b);
});
T("穿的欄位在 VISITOR_KEYS 裡、買到的不在（博物館的）；P.day 的次數舊存檔沒有也沒關係", G => {
  assert.ok(G.VISITOR_KEYS.includes("gear"));
  assert.ok(!G.VISITOR_KEYS.includes("shop"));
  const P = fresh(G);
  delete P.day.lessons; delete P.day.learned;
  assert.strictEqual(G.lessonLeft(P), G.NUM.shop.lessonPerDay);
});

console.log(`${pass} passed, ${fail} failed（兌換所和技能成長）`);
process.exit(fail ? 1 : 0);
