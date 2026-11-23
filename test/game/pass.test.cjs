// 館友證和典藏冊的摘要（shared/social/pass.js）：node test/game/pass.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("../load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
const J = x => JSON.parse(JSON.stringify(x));
const fresh = (G, mode) => G.newProfile ? G.newProfile(mode || "challenge") : null;

T("新存檔：數字都是 0，頁籤和清單齊全，不改存檔的收藏", G => {
  const P = fresh(G); const before = JSON.stringify(P.pepes);
  const v = J(G.passView(P, { today: G.todayStr(), signins: 3 }));
  assert.strictEqual(v.free, false);
  assert.strictEqual(v.card.dayNo, 1); assert.strictEqual(v.card.stamps, 0); assert.strictEqual(v.card.title, null);
  assert.strictEqual(v.pepe.have, 0); assert.strictEqual(v.pepe.total, G.CORE_TOTAL);
  assert.strictEqual(v.pepe.byRarity.length, G.RARITY_ORDER.filter(r => r !== G.FAILED).length);
  assert.ok(v.pepe.byRarity.every(x => x.n === 0));
  assert.strictEqual(v.pepe.recipes[1], G.RECIPES.length);
  assert.strictEqual(v.books.understood[1], G.UNDERSTAND_TEXT.length);
  assert.strictEqual(v.deco.items.length, G.LIMITED_ITEMS.length); assert.ok(v.deco.items.every(x => !x.own && x.name));
  assert.strictEqual(v.ach.total, G.BADGES.length); assert.strictEqual(v.ach.have, 0);
  assert.ok(v.records.some(r => r[0] === "簽到" && r[1] === "3 天"));
  assert.strictEqual(JSON.stringify(P.pepes), before);
  assert.strictEqual(G.PASS_TABS[0][0], "card");
});
T("有收藏：稀有度分開算、最近收進來的排前面、徽章和紀念品照存檔", G => {
  const P = fresh(G);
  const base = Object.assign({}, G.DEFAULT_PICK);
  const k1 = G.pepeKey({ ...base, 稀有度: G.RARITY_ORDER[0] }), k2 = G.pepeKey({ ...base, 稀有度: G.RARITY_ORDER[1] });
  P.pepes[k1] = { count: 1, perfect: false, first: "2026-11-01" }; P.pepes[k2] = { count: 2, perfect: false, first: "2026-11-05" };
  P.badges[G.BADGES[0].id] = "2026-11-01"; P.created = "2026-11-01"; P.activeSec = 3 * 3600 + 20 * 60; P.stats.made = 3;
  P.hallSouvenirs = [{ id: "<b>", name: "壞的" }];
  const v = J(G.passView(P, { today: "2026-11-10" }));
  assert.strictEqual(v.card.dayNo, 10); assert.strictEqual(v.card.created, "2026-11-01");
  assert.strictEqual(v.pepe.kinds, 2); assert.strictEqual(v.pepe.have, G.codexCount(P));
  assert.strictEqual(v.pepe.byRarity[0].n, 1); assert.strictEqual(v.pepe.byRarity[1].n, 1);
  assert.strictEqual(v.pepe.recent[0], k2);
  assert.strictEqual(v.ach.have, 1); assert.ok(v.ach.list[0].got);
  assert.deepStrictEqual(v.souvenirs, [], "不在清單上的紀念品不收");
  assert.ok(v.records.some(r => r[1] === "3 小時 20 分")); assert.ok(!v.records.some(r => r[0] === "簽到"));
});
T("自由模式：沒有週章，限定的東西都算有", G => {
  const P = fresh(G, "free");
  const v = J(G.passView(P, {}));
  assert.strictEqual(v.free, true); assert.strictEqual(v.card.stamps, null); assert.strictEqual(v.books.week, null);
  assert.ok(v.deco.items.every(x => x.own));
});
T("材料剩幾份：材料有數字（每次簽到拿 3 份），不是材料和自由模式是 null", G => {
  const P = fresh(G); G.limitedBox(P).stock["星光絨"] = 5;
  const v = J(G.passView(P, {})), mat = v.deco.items.find(x => x.kind === "mat"), other = v.deco.items.find(x => x.kind !== "mat");
  assert.strictEqual(mat.n, 5); assert.strictEqual(other.n, null); assert.ok(J(G.passView(fresh(G, "free"), {})).deco.items.every(x => x.n === null));
});
T("玩了多久的字", G => {
  assert.strictEqual(G.passPlayText(0), "0 分"); assert.strictEqual(G.passPlayText(59 * 60), "59 分"); assert.strictEqual(G.passPlayText(3600), "1 小時 0 分"); assert.strictEqual(G.passPlayText(undefined), "0 分");
});
T("參觀者那一頁：職業、技能、穿著的裝備照存檔；自由模式和沒選職業是 null；不改存檔", G => {
  const P = fresh(G);
  if (!P.job) assert.strictEqual(G.passVisitor(P), null);
  P.job = G.JOBS[0].id; P.skills = P.skills || {}; P.skills[G.SKILLS[0]] = 40;
  G.storyState(P).stamps = 99;
  const gid = G.GEAR_ITEMS[0].id;
  assert.ok(G.buyGear(P, gid).ok); assert.ok(G.wearGear(P, gid).ok);
  const before = JSON.stringify(P);
  const x = J(G.passView(P, { today: G.todayStr() })).visitor;
  assert.strictEqual(JSON.stringify(P), before);
  assert.strictEqual(x.jobName, G.jobInfo(P.job).name);
  assert.strictEqual(x.skills.length, G.SKILLS.length);
  assert.strictEqual(x.skills.find(k => k.s === G.SKILLS[0]).v, G.skillOf(P, G.SKILLS[0]));
  assert.strictEqual(x.skills.filter(k => k.main).length, 1);
  assert.strictEqual(x.gear.length, 1); assert.strictEqual(x.gear[0].id, gid); assert.ok(x.gear[0].name && !x.gear[0].desc.includes("{"));
  assert.strictEqual(x.gearMax, G.NUM.shop.gearWorn);
  assert.strictEqual(x.stats.length, 6);
  assert.ok(G.PASS_TABS.some(t => t[0] === "visitor"));
  assert.strictEqual(G.passView(fresh(G, "free"), {}).visitor, null);
});

T("館友證頭像：挑收藏的可以、沒收藏的不收、不用頭像就清掉", G => {
  const P = fresh(G); assert.strictEqual(P.avatar, "");
  const base = Object.assign({}, G.DEFAULT_PICK);
  const k1 = G.pepeKey({ ...base, 稀有度: G.RARITY_ORDER[0] }), k2 = G.pepeKey({ ...base, 稀有度: G.RARITY_ORDER[1] });
  P.pepes[k1] = { count: 1, perfect: false, first: "2026-11-01" }; P.pepes[k2] = { count: 1, perfect: false, first: "2026-11-05" };
  assert.deepStrictEqual(J(G.avatarChoices(P)), [k2, k1]);
  assert.strictEqual(G.passPhoto(P), k2); assert.strictEqual(J(G.passView(P, {})).card.avatar, null);
  assert.strictEqual(G.setPassAvatar(P, k1), true); assert.strictEqual(P.avatar, k1);
  assert.strictEqual(G.passPhoto(P), k1); assert.strictEqual(J(G.passView(P, {})).card.avatar, k1);
  assert.strictEqual(G.setPassAvatar(P, "不在|收藏|裡"), false); assert.strictEqual(P.avatar, k1);
  assert.strictEqual(G.setPassAvatar(P, ""), true); assert.strictEqual(P.avatar, ""); assert.strictEqual(G.passPhoto(P), k2);
});
T("館友證頭像：舊存檔沒有欄位能讀；選的那隻後來不在收藏就退回沒有", G => {
  const base = Object.assign({}, G.DEFAULT_PICK), k1 = G.pepeKey({ ...base, 稀有度: G.RARITY_ORDER[0] });
  const old = G.newProfile("challenge"); delete old.avatar; old.pepes[k1] = { count: 1, perfect: false, first: "2026-11-01" };
  const a = G.fixProfile(J(old), "challenge"); assert.strictEqual(a.avatar, ""); assert.strictEqual(G.passAvatar(a), "");
  old.avatar = k1; const b = G.fixProfile(J(old), "challenge"); assert.strictEqual(b.avatar, k1); assert.strictEqual(G.passAvatar(b), k1);
  const bad = J(b); bad.avatar = 123; assert.strictEqual(G.fixProfile(bad, "challenge").avatar, "");
  delete b.pepes[k1]; assert.strictEqual(G.passAvatar(b), ""); assert.strictEqual(G.passPhoto(b), "");
  const save = G.newSave(); save.profiles.challenge = J(old); assert.strictEqual(G.migrateSave(J(save)).profiles.challenge.avatar, k1);
});

T("隨身物 passGear：全部裝備、穿著順序、三個位子各穿什麼、自由模式沒有、不改存檔", G => {
  const P = fresh(G); G.storyState(P).stamps = 99;
  const ids = G.GEAR_ITEMS.map(x => x.id);
  assert.ok(G.buyGear(P, ids[0]).ok); assert.ok(G.buyGear(P, ids[1]).ok);
  assert.ok(G.wearGear(P, ids[1]).ok); assert.ok(G.wearGear(P, ids[0]).ok);
  const before = JSON.stringify(P);
  const g = J(G.passView(P, { today: G.todayStr() })).gear;
  assert.strictEqual(JSON.stringify(P), before);
  assert.strictEqual(g.max, G.NUM.shop.gearWorn); assert.strictEqual(g.stamps, G.storyState(P).stamps);
  assert.strictEqual(g.items.length, G.GEAR_ITEMS.length);
  assert.deepStrictEqual(g.worn, [ids[1], ids[0]], "照穿的順序");
  assert.ok(g.items.every(x => x.name && !x.desc.includes("{") && x.price > 0));
  assert.deepStrictEqual(g.items.filter(x => x.own).map(x => x.id).sort(), [ids[0], ids[1]].sort());
  assert.strictEqual(g.items.filter(x => x.worn).length, 2);
  assert.strictEqual(g.seats.filter(Boolean).length, 1); assert.strictEqual(g.seats[0].current, true);
  // 加第二位：第一位收起來，還是看得到他穿什麼；現在這位沒穿
  assert.ok(G.addVisitor(P, "乙"));
  const g2 = J(G.passView(P, { today: G.todayStr() })).gear;
  const cur = g2.seats.find(s => s && s.current), other = g2.seats.find(s => s && !s.current);
  assert.deepStrictEqual(cur.gear, []); assert.deepStrictEqual(other.gear, [ids[1], ids[0]]);
  assert.deepStrictEqual(g2.worn, []); assert.ok(g2.items.every(x => !x.worn));
  assert.strictEqual(G.passView(fresh(G, "free"), {}).gear, null);
});

T("工坊升級和遺物歷任 passUpgrades／passLegacy：7 項狀態、買了變 owned、遺物和歷任照存檔、自由模式 null、不改存檔", G => {
  const P = fresh(G); P.insp = 999;
  G.passView(P, { today: G.todayStr() }); // 第壹次會補 P.story（storyState 的老習慣），之後才比不改存檔
  const before = JSON.stringify(P);
  const u0 = J(G.passView(P, { today: G.todayStr() })).upgrades;
  assert.strictEqual(JSON.stringify(P), before);
  assert.strictEqual(u0.list.length, G.UPGRADES.length); assert.strictEqual(u0.have, 0); assert.strictEqual(u0.insp, 999);
  assert.ok(u0.list.every(x => x.name && x.desc));
  assert.strictEqual(u0.list.find(x => x.id === "ped8").state, "req", "第八個展台要先買第七個");
  assert.ok(G.buyUpgrade(P, "ped7").ok);
  const u1 = J(G.passView(P, { today: G.todayStr() })).upgrades;
  assert.strictEqual(u1.have, 1); assert.strictEqual(u1.list.find(x => x.id === "ped7").state, "owned"); assert.strictEqual(u1.list.find(x => x.id === "ped8").state, "buy");
  assert.deepStrictEqual(J(G.passView(P, {})).relics, { relics: [], history: [] });
  P.relics = [{ n: 1, name: "甲", kind: "pepe", key: "k", perfect: true, title: null, d: "2026-11-01" }, { bad: 1 }];
  P.history = [{ n: 1, name: "甲", job: P.job, madeThis: 4, deepest: 2, understood: 3, endedBy: "retire", d: "2026-11-02" }];
  const L = J(G.passView(P, {})).relics;
  assert.strictEqual(L.relics.length, 1); assert.strictEqual(L.relics[0].name, "甲");
  assert.strictEqual(L.history.length, 1); assert.strictEqual(L.history[0].made, 4); assert.strictEqual(L.history[0].jobName, P.job ? G.jobInfo(P.job).name : "");
  const f = fresh(G, "free"); assert.strictEqual(G.passView(f, {}).upgrades, null); assert.strictEqual(G.passView(f, {}).relics, null);
});

T("名牌框：戴著的名牌框出現在證件上（card.frame），沒戴是 null，自由模式 null", G => {
  const P = fresh(G);
  assert.strictEqual(G.passView(P, {}).card.frame, null);
  const id = G.LIMITED_ITEMS.find(x => x.kind === "deco" && x.slot === "frame").id;
  assert.ok(G.grantLimited(P, id, G.todayStr()));
  assert.ok(G.wearDeco(P, id));
  assert.strictEqual(G.passView(P, {}).card.frame, id);
  assert.strictEqual(G.passView(fresh(G, "free"), {}).card.frame, null);
});

T("收藏頁列表：失敗作、修復品、抱枕、配方、禁書（沒讀的不寫書名）", G => {
  const P = fresh(G);
  const base = Object.assign({}, G.DEFAULT_PICK), k1 = G.pepeKey({ ...base, 稀有度: G.RARITY_ORDER[0] }), k2 = G.pepeKey({ ...base, 稀有度: G.RARITY_ORDER[1] });
  P.failed[k1] = 2; P.failed.bad = 5; P.repaired[k2] = 1;
  P.recipes[G.RECIPES[0].id] = "2026-11-05";
  P.mythFrom.book1 = "2026-11-06";
  const v = J(G.passView(P, {})), p = v.pepe;
  assert.deepStrictEqual(p.failedList, [{ key: k1, n: 2 }], "認不得的 key 不列");
  assert.strictEqual(p.failedTotal, 7, "份數照存檔加起來（壞的 key 也算進總數，跟圖鑑壹樣不去改它）");
  assert.deepStrictEqual(p.repairedList, [{ key: k2, n: 1 }]); assert.strictEqual(p.repairedTotal, 1);
  assert.strictEqual(p.recipeList.length, G.RECIPES.length);
  const r0 = p.recipeList[0]; assert.ok(r0.found && r0.date === "2026-11-05" && r0.name !== "？？？");
  const r1 = p.recipeList[1]; assert.ok(!r1.found && r1.name === "？？？" && r1.hint, "沒找到的只給提示");
  const f = v.books.forbidden;
  assert.strictEqual(f.total, G.FORBIDDEN_BOOKS.length + 1 + G.BOOK_SEQUELS.length); assert.strictEqual(f.have, 1); assert.strictEqual(f.allSeats, 1);
  assert.strictEqual(f.list.find(x => x.id === "book1").read, "2026-11-06");
  assert.ok(f.list.filter(x => !x.read).every(x => x.title === "？？？"), "沒讀過的不寫書名");
  assert.strictEqual(G.passView(fresh(G, "free"), {}).books.forbidden, null);
});

T("裝飾頁的說明和來歷：拿到了才給，沒拿到不透露（desc、origin）", G => {
  const P = fresh(G); const it = G.LIMITED_ITEMS.find(x => x.from === "foe") || G.LIMITED_ITEMS[0];
  const x0 = J(G.passView(P, {})).deco.items.find(x => x.id === it.id);
  assert.strictEqual(x0.own, false); assert.strictEqual(x0.desc, ""); assert.strictEqual(x0.origin, "");
  assert.ok(G.grantLimited(P, it.id, G.todayStr()));
  const x1 = J(G.passView(P, {})).deco.items.find(x => x.id === it.id), info = G.limitedInfo(it.id);
  assert.strictEqual(x1.own, true); assert.strictEqual(x1.desc, info.desc); assert.strictEqual(x1.origin, info.origin);
});

T("展廳頁：新存檔空展台、自由模式 null、擺上去後排列和評分照存檔，不改存檔", G => {
  assert.strictEqual(G.passView(fresh(G, "free"), {}).hall, null);
  const P = fresh(G), h0 = J(G.passView(P, {})).hall;
  assert.strictEqual(h0.size, 6); assert.strictEqual(h0.have, 0); assert.strictEqual(h0.slots.length, 6); assert.ok(h0.slots.every(x => x === null));
  assert.strictEqual(h0.score, 0); assert.strictEqual(h0.theme, null); assert.strictEqual(h0.visitors, 0);
  assert.strictEqual(h0.themesTotal, Object.keys(G.HALL_THEME_TEXT).length); assert.ok(G.PASS_TABS.some(t => t[0] === "hall"));
  const k = G.pepeKey(Object.assign({}, G.DEFAULT_PICK));
  P.pepes[k] = { count: 1, perfect: true, first: "2026-11-01", title: "小明" }; P.hall[1] = { kind: "pepe", key: k }; P.hallVisitors = 7;
  P.visitorLog.unshift({ who: "老派收藏家", text: "逛了壹圈。", gain: 3, full: false });
  const before = JSON.stringify(P), h1 = J(G.passView(P, {})).hall;
  assert.strictEqual(JSON.stringify(P), before, "不改存檔");
  assert.strictEqual(h1.have, 1); assert.strictEqual(h1.slots[0], null); assert.strictEqual(h1.slots[1].key, k); assert.strictEqual(h1.slots[1].title, "小明"); assert.ok(h1.slots[1].perfect);
  assert.ok(h1.score > 0); assert.strictEqual(h1.visitors, 7); assert.strictEqual(h1.log[0].gain, 3); assert.strictEqual(h1.logInsp, 3);
  P.upgrades.ped7 = true; assert.strictEqual(J(G.passView(P, {})).hall.size, 7);
});

T("地下和簽到：怪物圖鑑沒打贏的不寫名字、結局照存檔、簽到摘要要給了才有", G => {
  assert.strictEqual(G.passView(fresh(G, "free"), {}).cellar, null);
  const P = fresh(G), c0 = J(G.passView(P, {})).cellar;
  assert.strictEqual(c0.foesGot, 0); assert.ok(c0.foes.length > 0 && c0.foes.every(f => f.name === "？？？" && !f.d));
  assert.ok(c0.endings.every(e => !e.d && e.name === "？？？")); assert.strictEqual(c0.floorList.length, c0.floors);
  const id = G.CELLAR_FOES[0].id; P.cellar.foes = { [id]: "2026-11-22" }; P.cellar.floorsDone[1] = "2026-11-20"; P.endings.cellar = "2026-11-21";
  const c1 = J(G.passView(P, {})).cellar;
  assert.strictEqual(c1.foesGot, 1); assert.ok(c1.foes[0].name !== "？？？" && c1.foes[0].d === "2026-11-22");
  assert.strictEqual(c1.floorList[0].d, "2026-11-20"); assert.ok(c1.endings.find(e => e.id === "cellar").name !== "？？？");
  assert.strictEqual(G.passView(P, {}).sign, null);
  assert.deepStrictEqual(J(G.passView(P, { signins: 5, streak: { cur: 2, best: 4, makeups: 1 } }).sign), { count: 5, cur: 2, best: 4, makeups: 1 });
});

T("三個座位 passSeats：現在是第幾位／共幾位、別位的職業心情理智、自由模式沒有、不改存檔", G => {
  const P = fresh(G); G.passView(P, {}); const before0 = JSON.stringify(P); // 先看過壹次（passView 會補出 story 欄位），再比對
  const s0 = J(G.passView(P, {})).visitors;
  assert.strictEqual(JSON.stringify(P), before0);
  assert.strictEqual(s0.count, 1); assert.strictEqual(s0.seats.length, G.LEGACY.slots); assert.strictEqual(s0.cur, P.slot);
  P.job = G.JOBS[0].id; P.skills = P.skills || {}; // 第壹位選過職業，第二位還沒
  assert.ok(G.addVisitor(P, "乙"));
  const s1 = J(G.passView(P, {})).visitors, cur = s1.seats.find(s => s && s.current), other = s1.seats.find(s => s && !s.current);
  assert.strictEqual(s1.count, 2); assert.strictEqual(s1.cur, cur.slot); assert.ok(cur.picking && other && !other.picking);
  assert.strictEqual(other.jobName, G.jobInfo(G.visitorSlots(P).find(s => s && !s.current).job).name);
  assert.strictEqual(other.mood, G.visitorSlots(P).find(s => s && !s.current).mood); assert.ok(other.sanity > 0 && other.maxSan > 0);
  assert.strictEqual(G.passView(fresh(G, "free"), {}).visitors, null);
});
T("技能的裝備加成：只標穿著的裝備給的點數，數值本來就含加成；脫下來就沒有標", G => {
  const P = fresh(G); G.storyState(P).stamps = 99; P.job = G.JOBS[0].id; P.skills = P.skills || {}; G.SKILLS.forEach(k => { P.skills[k] = 20; });
  const g = G.GEAR_ITEMS.find(x => Object.keys(x).some(k => k.startsWith("skill:"))), key = Object.keys(g).find(k => k.startsWith("skill:")), sk = key.slice(6);
  assert.ok(G.buyGear(P, g.id).ok);
  const base = J(G.passView(P, {})).visitor.skills.find(k => k.s === sk);
  assert.deepStrictEqual(base.gear, []);
  assert.ok(G.wearGear(P, g.id).ok);
  const on = J(G.passView(P, {})).visitor.skills.find(k => k.s === sk);
  assert.strictEqual(on.gear.length, 1); assert.strictEqual(on.gear[0].v, g[key]); assert.ok(on.gear[0].name);
  assert.strictEqual(on.v, G.skillOf(P, sk)); assert.strictEqual(on.v, Math.min(99, base.v + g[key]));
  assert.ok(J(G.passView(P, {})).visitor.skills.filter(k => k.s !== sk).every(k => k.gear.every(x => x.v)));
});
T("看懂的事分四組：每組 have／total、沒看懂寫？？？、總數對得上、每週的 u- 不混進來", G => {
  const P = fresh(G), b0 = J(G.passView(P, {})).books, L = b0.understoodLayers;
  assert.deepStrictEqual(L.map(x => x.layer), ["物", "人", "規矩", "你"]);
  assert.strictEqual(L.reduce((a, x) => a + x.total, 0), G.UNDERSTAND_TEXT.length); assert.strictEqual(b0.understood[1], G.UNDERSTAND_TEXT.length);
  assert.ok(L.every(x => x.have === 0 && x.list.every(y => !y.got && y.name === "？？？" && y.where === "")));
  const t = G.UNDERSTAND_TEXT[0]; P.understood = { [t.id]: "2026-11-22", "u-test-week": "2026-11-22" };
  const b1 = J(G.passView(P, {})).books, grp = b1.understoodLayers.find(x => x.layer === t.layer), it = grp.list.find(y => y.id === t.id);
  assert.strictEqual(grp.have, 1); assert.ok(it.got && it.name === t.from && it.name !== "？？？");
  assert.strictEqual(b1.understood[0], 1); assert.strictEqual(b1.understoodLayers.reduce((a, x) => a + x.have, 0), 1, "u- 開頭的每週那份不算");
});
T("材料剩幾份：deco.items 的 n（材料才有，其他是 null，自由模式 null）", G => {
  const P = fresh(G), mat = G.LIMITED_ITEMS.find(x => x.kind === "mat"), other = G.LIMITED_ITEMS.find(x => x.kind !== "mat");
  const it = id => J(G.passView(P, {})).deco.items.find(x => x.id === id);
  assert.strictEqual(it(mat.id).n, 0); assert.strictEqual(it(other.id).n, null);
  assert.ok(J(G.passView(fresh(G, "free"), {}).deco.items).every(x => x.n === null));
});

T("換週章的材料：份數照兌換所的算法（金箔 2 份）、自由模式 null", G => {
  assert.strictEqual(G.passView(fresh(G, "free"), {}).mats, null);
  const P = fresh(G), m0 = J(G.passView(P, {})).mats;
  assert.strictEqual(m0.total, 0); assert.strictEqual(m0.need, G.NUM.shop.matToStamp); assert.strictEqual(m0.list.length, 3); assert.ok(m0.list.every(x => x.n === 0));
  const bag = G.storyState(P).bag; bag["mat:畫布"] = 2; bag["mat:金箔"] = 2;
  const m1 = J(G.passView(P, {})).mats;
  assert.strictEqual(m1.total, G.matCount(P)); assert.strictEqual(m1.total, 6); assert.strictEqual(m1.stamps, Math.floor(6 / G.NUM.shop.matToStamp));
  assert.strictEqual(m1.list.find(x => x.id === "mat:金箔").worth, 2);
});

T("讀懂 u-m-count 之後館友證多壹格空白（W48 d7）；不算進看懂的件數", G => {
  const P = fresh(G);
  const n0 = J(G.passView(P, {})).books;
  assert.strictEqual(n0.blank, false);
  P.understood = Object.assign({}, P.understood, { [G.PASS_BLANK_AFTER]: "2026-11-29" });
  const n1 = J(G.passView(P, {})).books;
  assert.strictEqual(n1.blank, true); assert.deepStrictEqual(n1.understood, n0.understood);
  assert.strictEqual(G.PASS_BLANK_AFTER, "u-m-count");
});

console.log(`pass.test：${pass} 過，${fail} 沒過`);
if (fail) process.exit(1);
