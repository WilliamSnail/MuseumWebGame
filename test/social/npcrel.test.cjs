// 交代人熟識度、旅客好感度（shared/social/npcrel.js，決定 0151、0150 補充二）：node test/social/npcrel.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("../load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 6).join("\n    ")); } };
const D1 = "2026-11-21", D2 = "2026-11-22";
const wal = G => G.casWalletFix(G.casWalletNew(), D1);

T("熟識度：門檻（交代人 10／50／140、旅客 8／30／70）、只增不減、每個來源壹天有次數上限", G => {
  const w = wal(G);
  assert.deepStrictEqual([G.npcRelLv("giver", 9), G.npcRelLv("giver", 10), G.npcRelLv("giver", 50), G.npcRelLv("giver", 140)], [0, 1, 2, 3]);
  assert.deepStrictEqual([G.npcRelLv("traveler", 7), G.npcRelLv("traveler", 8), G.npcRelLv("traveler", 30), G.npcRelLv("traveler", 70)], [0, 1, 2, 3]);
  for (let i = 0; i < 6; i++) G.npcRelAdd(w, "clerk", D1, "chat");
  assert.strictEqual(w.npcRel.clerk.xp, 3, "閒聊壹天只算前 3 次（每次 +1）");
  const r = G.npcRelAdd(w, "clerk", D1, "chat"); assert.strictEqual(r.gained, 0); assert.strictEqual(r.why, "src_max");
  G.npcRelAdd(w, "clerk", D2, "chat"); assert.strictEqual(w.npcRel.clerk.xp, 4, "隔天可以再加"); assert.strictEqual(w.npcRel.clerk.today.chat, 1, "換日 today 重設");
});
T("每天上限：交代人 12、旅客 8（所有來源加起來）；超過的不加、但來源照樣算次數", G => {
  const w = wal(G);
  G.npcRelAdd(w, "hall", D1, "task"); G.npcRelAdd(w, "hall", D1, "ask"); G.npcRelAdd(w, "hall", D1, "gift", { xp: 5 }); // 4 + 3 + 5 = 12
  const r = G.npcRelAdd(w, "hall", D1, "visit"); assert.strictEqual(w.npcRel.hall.xp, 12); assert.strictEqual(r.gained, 0); assert.strictEqual(r.why, "day_cap");
  G.npcRelAdd(w, "v-bai", D1, "cellar"); G.npcRelAdd(w, "v-bai", D1, "table"); G.npcRelAdd(w, "v-bai", D1, "gift", { xp: 5 }); // 4 + 2 + 5 → 8
  assert.strictEqual(w.npcRel["v-bai"].xp, 8); assert.strictEqual(w.npcRel["v-bai"].lv, 1);
});
T("升級回報 up、Lv3 才發稱號（壹次、名字短、進 w.ach 的 npc: 成就）、沒給 title 就不發", G => {
  const w = wal(G); w.npcRel = { postman: { xp: 138, lv: 2, day: null, today: { xp: 0 } } };
  const none = G.npcRelAdd(w, "postman", D1, "task"); assert.strictEqual(none.lv, 3); assert.ok(none.up); assert.strictEqual(none.title, null, "沒給稱號名字就不發"); assert.ok(!w.ach["npc:postman"]);
  const w2 = wal(G); w2.npcRel = { postman: { xp: 138, lv: 2, day: null, today: { xp: 0 } } };
  const r = G.npcRelAdd(w2, "postman", D1, "task", { title: "收信人" }); assert.strictEqual(r.title, "npc:postman"); assert.strictEqual(w2.ach["npc:postman"].name, "收信人");
  const again = G.npcRelAdd(w2, "postman", D2, "visit", { title: "收信人" }); assert.strictEqual(again.title, null, "只發壹次");
  const w3 = wal(G); w3.npcRel = { postman: { xp: 100, lv: 2, day: null, today: { xp: 0 } } }; assert.strictEqual(G.npcRelAdd(w3, "postman", D1, "task", { title: "收信人" }).title, null, "還沒 Lv3");
});
T("稱號進現有的稱號系統：casAchInfo 認得 npc: 成就、casCleanTitle 白名單收、亂寫的丟掉、casSetTitle 可以戴、pass 的 title 帶得出來", G => {
  const w = wal(G); w.npcRel = { clerk: { xp: 139, lv: 2, day: null, today: { xp: 0 } } };
  G.npcRelAdd(w, "clerk", D1, "task", { title: "大夜班的幫手" });
  const info = G.casAchInfo(w, "npc:clerk"); assert.ok(info && info.name === "大夜班的幫手" && !info.old);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(G.casCleanTitle({ id: "npc:clerk", name: "大夜班的幫手" }))), { id: "npc:clerk", name: "大夜班的幫手" });
  assert.strictEqual(G.casCleanTitle({ id: "npc:Clerk!", name: "x" }), null); assert.strictEqual(G.casCleanTitle({ id: "npc:../x", name: "x" }), null); assert.strictEqual(G.casCleanTitle({ id: "npc:clerk", name: "" }), null);
  assert.strictEqual(G.casAchInfo(w, "npc:nobody"), null, "沒拿到的不認");
  const P = G.newGame ? null : null; const set = G.casSetTitle(w, null, "npc:clerk"); assert.ok(set.ok); assert.strictEqual(w.title, "npc:clerk");
  assert.ok(!G.casSetTitle(w, null, "npc:nobody").ok);
});
T("好感度讓旅客邀請比較容易答應：每級 +5%（Lv1 5、Lv2 10、Lv3 15）；沒有紀錄是 0", G => {
  const w = wal(G); assert.strictEqual(G.npcRelBonus(w, "v-bai"), 0);
  w.npcRel["v-bai"] = { xp: 8, lv: 1, day: null, today: { xp: 0 } }; assert.strictEqual(G.npcRelBonus(w, "v-bai"), 5);
  w.npcRel["v-bai"].xp = 30; assert.strictEqual(G.npcRelBonus(w, "v-bai"), 10); w.npcRel["v-bai"].xp = 999; assert.strictEqual(G.npcRelBonus(w, "v-bai"), 15);
});
T("view：級、離下壹級還差多少、今天還能加多少；沒有紀錄是 Lv0", G => {
  const w = wal(G); let v = G.npcRelView(w, "scale", D1); assert.deepStrictEqual([v.lv, v.xp, v.next, v.left, v.dayLeft], [0, 0, 10, 10, 12]);
  G.npcRelAdd(w, "scale", D1, "task"); v = G.npcRelView(w, "scale", D1); assert.deepStrictEqual([v.xp, v.left, v.dayLeft], [4, 6, 8]);
  v = G.npcRelView(w, "scale", D2); assert.strictEqual(v.dayLeft, 12, "隔天今天的額度重算");
});
T("壞資料：id 不合格、不是物件的紀錄、太多筆都會被錢包整理掉；xp 不會變負或小數", G => {
  const w = wal(G); w.npcRel = { "../x": { xp: 5 }, ok1: 3, "v-a": { xp: -4.7, lv: 9 }, "v-b": { xp: 12.9 } };
  G.casWalletFix(w, D1); assert.deepStrictEqual(Object.keys(w.npcRel).sort(), ["v-a", "v-b"]); assert.strictEqual(w.npcRel["v-a"].xp, 0); assert.strictEqual(w.npcRel["v-b"].xp, 12); assert.strictEqual(w.npcRel["v-b"].lv, 1);
  const big = {}; for (let i = 0; i < 200; i++) big["v-" + i] = { xp: i }; w.npcRel = big; G.casWalletFix(w, D1); assert.strictEqual(Object.keys(w.npcRel).length, G.NUM.npcRel.maxEntries); assert.ok(w.npcRel["v-199"], "留 xp 高的");
  assert.ok(!G.npcRelAdd(w, "Bad Id", D1, "chat").ok); assert.ok(!G.npcRelAdd(w, "clerk", D1, "nosuch").ok);
});
T("熟識度不給錢：加滿壹位到 Lv3 前後，錢包的籌碼、靈感都不動", G => {
  const w = wal(G), chips = w.chips, led = JSON.stringify(w.led);
  for (let d = 1; d <= 30; d++) { const day = "2026-12-" + String(d).padStart(2, "0"); for (const s of ["chat", "chat", "chat", "visit", "task", "ask"]) G.npcRelAdd(w, "yuga", day, s, { title: "牌桌的熟面孔" }); }
  assert.strictEqual(w.npcRel.yuga.lv, 3); assert.strictEqual(w.chips, chips); assert.strictEqual(JSON.stringify(w.led), led, "沒有憑空多、沒有消失");
});
console.log(fail ? `熟識度和好感度：${fail} 項沒過` : `熟識度和好感度：${pass} 項都過`); process.exit(fail ? 1 : 0);
