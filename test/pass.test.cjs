// 館友證和典藏冊的摘要（shared/pass.js）：node test/pass.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
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

console.log(`pass.test：${pass} 過，${fail} 沒過`);
if (fail) process.exit(1);
