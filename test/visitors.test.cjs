// 多位參觀者：一個帳號最多 3 位，同時在館裡、共用一間博物館（shared/visitors.js，決定 0018）：node test/visitors.test.cjs（npm test 也會跑）
// 換來換去欄位不會掉、博物館的不跟著換、每天的次數不會重算、dayVis、最多 3 位、號碼不重複、nextVisitor 在位子裡換人、舊存檔、名字、自由模式。
// 數字一律讀 NUM、LEGACY。
const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");
const { load } = require("./load_shared.cjs");
let G = load();
let pass = 0, fail = 0;
const T = (name, fn) => { try { G = load(); fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
const J = x => JSON.parse(JSON.stringify(x)); // vm 裡的物件拿出來比（見 docs/架構.md 第 6 節）
const S = x => JSON.stringify(x);
const DAY = "2026-11-08";
function fresh(mode = "challenge") { const P = G.newProfile(mode); G.ensureDay(P, DAY); return P; }
const mk = (P, o, nat = 50) => G.finishMake(P, Object.assign({ 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" }, o), { natural: nat });
// 只看「這一位的」欄位（加上正在走的地下）
const mine = P => { const o = {}; G.VISITOR_KEYS.forEach(k => { o[k] = P[k] === undefined ? null : P[k]; }); o.cellarRun = P.cellar.run || null; return J(o); };
// 博物館的一些欄位
const museum = P => J({ insp: P.insp, pepes: P.pepes, unlocked: P.unlocked, upgrades: P.upgrades, history: P.history, relics: P.relics, stats: P.stats, seen: P.seen, visitorCount: P.visitorCount,
  day: { date: P.day.date, fusions: P.day.fusions, reviews: P.day.reviews, mini: P.day.mini, hugs: P.day.hugs, moodFx: P.day.moodFx, pairs: P.day.pairs } });
// 第一位：偵探，身上有一堆東西
function withFirst() {
  const P = fresh(); P.insp = 100;
  G.setRng(G.mulberry32(11)); G.assignJob(P, "detective"); G.setRng(null);
  P.vname = "阿明"; P.myth = 4; P.mythFrom = { "book:b1": 4 }; P.quirks = [{ type: "mania", cat: "顏色", opt: "紅", since: DAY, until: G.nowMs() + 3 * 86400000, task: "hug", done: [] }]; P.sanity = 31; // 怪癖是 11-09 的格式（有 until、task，決定 0027），存檔讀回來才會一樣 P.mood = 62;
  P.skillTicks = { 觀察: true }; P.hugDays = ["2026-11-07"]; P.oddSeen = { talk: DAY }; P.swapNext = true; P.bout = { id: 3, left: 2 };
  P.cellar.run = { floor: 2, room: 1, team: ["x"] }; P.visit.deepest = 2;
  return P;
}
// 加第二位，選職業（藝術史學者）、抽小優缺點（決定 0028；以前是挑第 0 位候選人）
function addSecond(P, name = "小華") { G.setRng(G.mulberry32(22)); const r = G.addVisitor(P, name, 1); G.chooseJob(P, "historian"); G.setRng(null); return r; }

// ---------- 欄位清單 ----------
T("VISITOR_KEYS 包含欄位表「這一位的」那一欄，加上 vid、vname、hugDays；博物館的都不在裡面", () => {
  ["sanity", "mood", "moodRoll", "myth", "mythFrom", "quirks", "bout", "dark", "swapNext", "job", "skills", "skillTicks", "perk", "flaw", "legacy", "visit", "visitor", "vid", "vname", "hugDays"]
    .forEach(k => assert.ok(G.VISITOR_KEYS.includes(k), k));
  ["pepes", "failed", "pillows", "repaired", "serial", "insp", "unlocked", "unlockCount", "seen", "chaptersRead", "understood", "badges", "endings", "fullRows", "news", "fresh", "hall",
    "hallVisitors", "visitorLog", "themesSeen", "keys", "upgrades", "recipes", "injured", "cellar", "lines", "weekly", "giftsIn", "comments", "done", "daily", "stats", "activeSec", "created",
    "history", "relics", "day", "visitors", "visitorCount", "mail", "mailSeen"].forEach(k => assert.ok(!G.VISITOR_KEYS.includes(k), k));
  assert.deepStrictEqual(J(G.DAY_VIS_KEYS), ["startSan", "lost", "quirkGiven", "exLoss", "views"]);
});
T("新的挑戰模式：第一位在第一個位子、號碼 1、還沒有名字；newProfile 的欄位清單都有", () => {
  const P = fresh();
  assert.strictEqual(P.vid, "v1"); assert.strictEqual(P.vname, null); assert.strictEqual(P.slot, 0); assert.strictEqual(P.visitorCount, 1);
  assert.deepStrictEqual(J(P.visitors), []);
  G.VISITOR_KEYS.forEach(k => assert.ok(k in P, k));
  const s = G.visitorSlots(P);
  assert.strictEqual(s.length, G.LEGACY.slots);
  assert.strictEqual(s[0].vid, "v1"); assert.ok(s[0].current); assert.strictEqual(s[0].name, "第 1 位參觀者");
  assert.strictEqual(S(G.freeSlots(P)), S(Array.from({ length: G.LEGACY.slots - 1 }, (_, i) => i + 1)));
});

// ---------- 加一位 ----------
T("在空位子加一位：新號碼、擲心情、還沒選職業（沒有候選人、還沒抽優缺點）；第一位收進 P.visitors", () => {
  const P = withFirst();
  const before = mine(P);
  G.setRng(G.mulberry32(5));
  const r = G.addVisitor(P, "  小華  ", 2);
  G.setRng(null);
  assert.ok(r);
  assert.strictEqual(P.vname, "小華"); assert.strictEqual(P.visitor, 2); assert.strictEqual(P.vid, "v2"); assert.strictEqual(P.slot, 2); assert.strictEqual(r.slot, 2);
  assert.strictEqual(P.job, null); assert.strictEqual(P.cands, null); assert.ok(!("cands" in r)); assert.strictEqual(P.perk, null); assert.strictEqual(P.flaw, null);
  assert.strictEqual(P.sanity, G.NUM.startSanity); assert.strictEqual(P.myth, 0); assert.deepStrictEqual(J(P.quirks), []); assert.strictEqual(P.mood, r.total * 5);
  assert.strictEqual(P.cellar.run, null); assert.deepStrictEqual(J(P.hugDays), []); assert.deepStrictEqual(J(P.oddSeen), {});
  assert.strictEqual(P.visitors.length, 1);
  const a = P.visitors[0];
  G.VISITOR_KEYS.forEach(k => assert.strictEqual(S(a[k]), S(before[k]), k));
  assert.strictEqual(S(a.cellarRun), S(before.cellarRun));
  assert.strictEqual(a.dayVis.date, DAY);
  // 剛來的這位今天還沒掉理智
  assert.strictEqual(P.day.startSan, P.sanity); assert.strictEqual(P.day.lost, 0); assert.strictEqual(P.day.quirkGiven, false);
});
T("加一位：名字不合格、沒有空位子、自由模式都不加", () => {
  const P = fresh();
  assert.strictEqual(G.addVisitor(P, "   ", 1), null); assert.strictEqual(G.visitorTotal(P), 1);
  assert.ok(G.addVisitor(P, "二", 1)); assert.ok(G.addVisitor(P, "三", 2));
  assert.strictEqual(G.visitorTotal(P), G.LEGACY.slots);
  assert.deepStrictEqual(J(G.freeSlots(P)), []);
  assert.strictEqual(G.addVisitor(P, "四", 0), null);
  assert.strictEqual(G.visitorTotal(P), G.LEGACY.slots);
  // 指定的位子有人：放到空的那一個
  const Q = fresh(); G.addVisitor(Q, "二", 0);
  assert.strictEqual(Q.slot, 1);
});
T("號碼不重複：三個位子 1、2、3；還沒選職業的換來換去還是沒選，選了之後抽到的優缺點跟著那一位", () => {
  const P = fresh();
  G.setRng(G.mulberry32(3)); G.addVisitor(P, "二", 1); G.addVisitor(P, "三", 2); G.setRng(null);
  assert.strictEqual(S(G.visitorSlots(P).map(s => s.visitor)), S([1, 2, 3]));
  assert.strictEqual(new Set(G.visitorSlots(P).map(s => s.vid)).size, 3);
  assert.strictEqual(P.visitorCount, 3);
  G.switchVisitor(P, "v1"); G.switchVisitor(P, "v2");
  assert.strictEqual(P.job, null); assert.strictEqual(P.perk, null);
  assert.ok(G.chooseJob(P, "gambler")); assert.strictEqual(P.job, "gambler");
  const drawn = S([P.perk, P.flaw, P.skills]);
  G.switchVisitor(P, "v3"); assert.strictEqual(P.job, null); assert.strictEqual(P.perk, null);
  G.switchVisitor(P, "v2"); assert.strictEqual(S([P.perk, P.flaw, P.skills]), drawn);
  const slot = G.visitorSlots(P)[1];
  assert.strictEqual(slot.perk, P.perk); assert.strictEqual(slot.flaw, P.flaw); // 標題的位子卡片也有優缺點
  assert.strictEqual(G.visitorSlots(P)[2].perk, null); // 還沒選職業的沒有
});

// ---------- 換人 ----------
T("換來換去欄位不會掉：A ⇄ B 換 5 次，兩位各自的欄位都跟原本一樣，整個 P 也一樣", () => {
  const P = withFirst();
  addSecond(P);
  P.sanity = 44; P.quirks = [{ type: "phobia", cat: "帽子", opt: "皇冠" }]; P.cellar.run = { floor: 1, room: 0, team: ["y"] }; P.hugDays = [DAY];
  const b = mine(P);
  G.switchVisitor(P, "v1");
  const a = mine(P);
  assert.strictEqual(P.vname, "阿明"); assert.strictEqual(P.job, "detective"); assert.strictEqual(P.sanity, 31); assert.strictEqual(P.cellar.run.floor, 2);
  const whole = S(P);
  for (let i = 0; i < 5; i++) {
    assert.ok(G.switchVisitor(P, "v2")); assert.strictEqual(S(mine(P)), S(b));
    assert.ok(G.switchVisitor(P, "v1")); assert.strictEqual(S(mine(P)), S(a));
  }
  assert.strictEqual(S(P), whole);
  assert.strictEqual(G.switchVisitor(P, "v1"), true); // 本來就是這位
  assert.strictEqual(G.switchVisitor(P, "v9"), false); // 沒有這位
  assert.strictEqual(S(P), whole);
});
T("換來換去：存檔讀回來（migrateSave）兩位都還在，換人照樣對", () => {
  const P = withFirst(); addSecond(P);
  const save = G.newSave(); save.profiles.challenge = P; save.current = "challenge";
  const back = G.migrateSave(J(save)).profiles.challenge;
  assert.strictEqual(S(back.visitors), S(P.visitors));
  assert.strictEqual(back.vid, "v2"); assert.strictEqual(back.vname, "小華"); assert.strictEqual(back.visitorCount, 2);
  G.switchVisitor(back, "v1");
  assert.strictEqual(back.vname, "阿明"); assert.strictEqual(back.sanity, 31); assert.strictEqual(back.job, "detective");
});
T("博物館的欄位不跟著換：B 做的、花的、解鎖的，換回 A 還是一樣", () => {
  const P = withFirst(); addSecond(P);
  P.insp += 7; mk(P, { 顏色: "藍" }); P.upgrades.dice = true; P.day.fusions = 2; P.day.reviews.portrait = 1; P.day.mini.color = 1; P.day.hugs["k"] = true; P.seen.portrait = 3;
  const m = museum(P);
  G.switchVisitor(P, "v1");
  assert.strictEqual(S(museum(P)), S(m));
  G.switchVisitor(P, "v2");
  assert.strictEqual(S(museum(P)), S(m));
});
T("換人不會讓每天的次數重算：融合、小遊戲、畫廊的靈感次數照帳號算", () => {
  const P = withFirst(); addSecond(P);
  P.day.fusions = G.fusionLimit(P); P.day.mini.color = G.NUM.miniPerDay;
  const fl = G.fusionLeft(P), ml = G.miniLeft(P, "color");
  assert.strictEqual(fl, 0); assert.strictEqual(ml, 0);
  G.switchVisitor(P, "v1");
  assert.strictEqual(G.fusionLeft(P), 0); assert.strictEqual(G.miniLeft(P, "color"), 0);
  assert.strictEqual(P.day.date, DAY);
});
T("dayVis：同一天換回來，今天掉的理智、給過怪癖、看習慣了都放回去", () => {
  const P = withFirst();
  P.day.startSan = 40; G.applySan(P, 9, "strange"); // 40 的 1/5 ＝ 8，這次給怪癖
  P.day.views.strange = G.NUM.habituate + 1;
  assert.ok(P.day.quirkGiven); assert.strictEqual(P.day.lost, 9);
  const mineDay = S(G.DAY_VIS_KEYS.map(k => P.day[k]));
  addSecond(P);
  // 新的那位：今天還沒掉、沒看過
  assert.strictEqual(P.day.lost, 0); assert.strictEqual(P.day.quirkGiven, false); assert.strictEqual(P.day.startSan, P.sanity); assert.deepStrictEqual(J(P.day.exLoss), {});
  assert.strictEqual(G.sanSpecFor(P, G.exhibitById("strange")), G.exhibitById("strange").san);
  G.applySan(P, 2, "statue");
  G.switchVisitor(P, "v1");
  assert.strictEqual(S(G.DAY_VIS_KEYS.map(k => P.day[k])), mineDay);
  assert.strictEqual(G.sanSpecFor(P, G.exhibitById("strange")), "0/1");
  // 換回 B：B 今天掉的 2 點也還在
  G.switchVisitor(P, "v2");
  assert.strictEqual(P.day.lost, 2); assert.strictEqual(P.day.exLoss.statue, 2);
});
T("dayVis：不同天換回來，照新的一天重算（startSan ＝這位現在的理智）", () => {
  const P = withFirst();
  G.applySan(P, 9, "portrait");
  addSecond(P);
  const next = G.addDays(DAY, 1);
  G.ensureDay(P, next);
  G.switchVisitor(P, "v1");
  assert.strictEqual(P.day.date, next);
  assert.strictEqual(P.day.startSan, P.sanity); assert.strictEqual(P.day.lost, 0); assert.strictEqual(P.day.quirkGiven, false); assert.deepStrictEqual(J(P.day.views), {});
});
T("改名字：現在這位、不在場的都能改；名字不合格不改", () => {
  const P = withFirst(); addSecond(P);
  assert.strictEqual(G.renameVisitor(P, "v1", " 老明 "), "老明");
  assert.strictEqual(P.visitors[0].vname, "老明");
  assert.strictEqual(G.renameVisitor(P, "v2", "華華"), "華華"); assert.strictEqual(P.vname, "華華");
  assert.strictEqual(G.renameVisitor(P, "v2", "a​b"), null); assert.strictEqual(P.vname, "華華");
  assert.strictEqual(G.renameVisitor(P, "v7", "沒有"), null);
  assert.strictEqual(G.visitorSlots(P)[0].name, "老明");
});

// ---------- 理智歸零：在同一個位子換人 ----------
T("nextVisitor 在位子裡換人：同一個位子、新號碼、名字空著；別的位子不動；紀錄有名字；每天的次數留著", () => {
  const P = withFirst(); addSecond(P); // 現在是小華（第 2 位，位子 1）
  G.setRng(G.mulberry32(9)); G.addVisitor(P, "小美", 2); G.chooseJob(P, "artisan"); G.setRng(null); // 第 3 位，位子 2
  G.switchVisitor(P, "v2");
  const others = S(P.visitors);
  P.day.fusions = 1; P.day.hugs.k = true; P.day.lost = 6; P.day.quirkGiven = true; P.hugDays = [DAY]; P.oddSeen = { talk: DAY };
  P.sanity = 1; G.applySan(P, 5, "statue");
  assert.ok(P.dark);
  const r = G.nextVisitor(P, "russia8", null);
  assert.strictEqual(P.slot, 1); assert.strictEqual(P.visitor, 4); assert.strictEqual(P.vid, "v4"); assert.strictEqual(P.vname, null); assert.strictEqual(P.visitorCount, 4);
  assert.strictEqual(r.entry.n, 2); assert.strictEqual(r.entry.name, "小華"); assert.strictEqual(P.history[0].name, "小華");
  assert.strictEqual(S(P.visitors), others);
  assert.strictEqual(P.day.fusions, 1); assert.ok(P.day.hugs.k);
  assert.strictEqual(P.day.lost, 0); assert.strictEqual(P.day.quirkGiven, false); assert.strictEqual(P.day.startSan, G.NUM.startSanity);
  assert.deepStrictEqual(J(P.hugDays), []); assert.deepStrictEqual(J(P.oddSeen), {});
  assert.strictEqual(P.cands, null); assert.strictEqual(P.job, null); assert.strictEqual(P.perk, null); // 接著選職業、抽優缺點（決定 0028）
  assert.strictEqual(S(G.visitorSlots(P).map(s => s.visitor)), S([1, 4, 3]));
});
T("抽到「失眠」：今天的理智從加減之後算（startSan ＝開場理智）；第一位和換人之後都一樣", () => {
  // 固定骰子抽到「失眠」：偵探的優點抽第 0 個（不跟失眠同一類），缺點清單裡找失眠的位置
  const draw = () => { const perk = G.PERKS[0], flaws = G.FLAWS.filter(t => !G.traitsClash(t, perk)); const i = flaws.findIndex(t => t.id === "insomnia");
    const q = [0.5 / G.PERKS.length, (i + 0.5) / flaws.length]; return () => (q.length ? q.shift() : 0.5); };
  const first = fresh(); G.setRng(draw()); G.chooseJob(first, "detective"); G.setRng(null);
  assert.strictEqual(first.flaw, "insomnia"); assert.strictEqual(first.visitor, 1);
  assert.strictEqual(first.sanity, G.NUM.startSanity + G.traitById("insomnia").sanity); assert.strictEqual(first.day.startSan, first.sanity);
  const P = fresh(); G.nextVisitor(P);
  G.setRng(draw()); G.chooseJob(P, "detective"); G.setRng(null);
  assert.strictEqual(P.flaw, "insomnia");
  assert.strictEqual(P.sanity, G.NUM.startSanity + G.traitById("insomnia").sanity);
  assert.strictEqual(P.day.startSan, P.sanity);
});
T("nextVisitor：沒有 P.day 的也接得上（號碼從計數器拿）", () => {
  const P = G.newProfile("challenge");
  P.visitorCount = 6; P.visitor = 6;
  G.nextVisitor(P);
  assert.strictEqual(P.visitor, 7); assert.ok(P.day); assert.strictEqual(P.day.startSan, G.NUM.startSanity);
});

T("做了幾隻、玩了幾秒各記各的（stats.made、activeSec 是整間博物館的）", () => {
  const P = withFirst();
  mk(P, { 顏色: "藍" }); mk(P, { 顏色: "黃" });
  P.visit.sec = 120;
  addSecond(P);
  mk(P, { 顏色: "綠" }); mk(P, { 顏色: "紫" }); mk(P, { 顏色: "藍" });
  P.visit.sec += 60;
  assert.strictEqual(P.stats.made, 5);
  assert.strictEqual(G.visitorRecord(P, null).madeThis, 3); assert.strictEqual(G.visitorRecord(P, null).mins, 1);
  G.switchVisitor(P, "v1");
  assert.strictEqual(G.visitorRecord(P, null).madeThis, 2); assert.strictEqual(G.visitorRecord(P, null).mins, 2);
  assert.strictEqual(G.visitorRecord(P, null).name, "阿明");
});
T("舊存檔的 P.visit 沒有 made、sec：用到現在的累計相減補上（那時只有一位在館裡）", () => {
  const old = J(fresh()); old.stats.made = 7; old.activeSec = 600; old.visit = { from: DAY, sec0: 300, made0: 4, deepest: 0, understood: {}, where: null };
  const P = G.fixProfile(old, "challenge");
  assert.strictEqual(P.visit.made, 3); assert.strictEqual(P.visit.sec, 300);
  mk(P, {});
  assert.strictEqual(G.visitorRecord(P, null).madeThis, 4);
});

// ---------- 舊存檔 ----------
T("舊存檔：現在這位變成第一個位子，編號 v＋第幾位、名字空著、計數器用最大的號碼", () => {
  const old = J(fresh());
  ["vid", "vname", "slot", "visitors", "visitorCount", "oddSeen"].forEach(k => delete old[k]);
  old.visitor = 3; old.history = [{ n: 2, job: "detective", made: 9, endedBy: "russia8", d: DAY }, { n: 1, job: "gambler", made: 4, endedBy: "russia8", d: DAY }];
  const P = G.fixProfile(old, "challenge");
  assert.strictEqual(P.vid, "v3"); assert.strictEqual(P.vname, null); assert.strictEqual(P.slot, 0); assert.deepStrictEqual(J(P.visitors), []); assert.strictEqual(P.visitorCount, 3);
  assert.deepStrictEqual(J(P.oddSeen), {});
  assert.strictEqual(G.visitorSlots(P)[0].name, "第 3 位參觀者");
  G.addVisitor(P, "新來的", 1);
  assert.strictEqual(P.visitor, 4);
  // 歷任牆上的號碼比現在的大（亂掉的）：計數器也看牆
  const odd = J(fresh()); delete odd.visitorCount; odd.history = [{ n: 9 }];
  assert.strictEqual(G.fixProfile(odd, "challenge").visitorCount, 9);
});
T("舊存檔：壞掉的位子資料補好（重號、同一個位子、少欄位、名字不合格），坐不下的不刪", () => {
  const raw = J(fresh());
  raw.visitor = 2; raw.vid = "v2"; raw.slot = 1;
  raw.visitors = [{ vid: "v2", visitor: 2, slot: 1, vname: "a\u0007" }, null, "x", { visitor: 1, slot: 7, sanity: "壞" }, { vid: "v5", visitor: 5, slot: 2, vname: "好名字", quirks: "x", cands: [] }];
  const P = G.fixProfile(raw, "challenge");
  assert.strictEqual(P.visitors.length, 3); // null、"x" 不算人；三個物件都留著（加上現在這位共 4 位，比位子多一位）
  const all = [P].concat(P.visitors);
  assert.strictEqual(new Set(all.map(v => v.visitor)).size, 4);
  assert.strictEqual(new Set(all.map(v => v.vid)).size, 4);
  const seated = all.filter(v => v.slot != null);
  assert.strictEqual(seated.length, G.LEGACY.slots); assert.strictEqual(new Set(seated.map(v => v.slot)).size, G.LEGACY.slots);
  assert.strictEqual(P.slot, 1); // 現在這位先拿
  assert.strictEqual(G.visitorSlots(P).filter(Boolean).length, G.LEGACY.slots);
  all.forEach(v => { G.VISITOR_KEYS.forEach(k => assert.ok(k in v, k)); assert.ok(Array.isArray(v.quirks)); assert.strictEqual(typeof v.sanity, "number"); });
  assert.strictEqual(P.visitors[0].vname, null); assert.strictEqual(P.visitors[2].vname, "好名字"); assert.strictEqual(P.visitors[2].cands, null);
  assert.ok(P.visitorCount >= 5);
  // 補好之後換得過去
  assert.ok(G.switchVisitor(P, P.visitors[1].vid));
});

T("舊存檔（決定 0028 以前）：不在場、候選人還沒挑的那位，讀回來、換來換去候選人都原樣留著；換到他、選職業之後才清掉", () => {
  const P = withFirst();
  G.setRng(G.mulberry32(4)); G.addVisitor(P, "小華", 1); G.setRng(null);
  P.cands = [{ job: "detective", perk: "strong", flaw: "slow", skills: G.rollSkills("detective") }, { job: "artisan", perk: "quick", flaw: "gloomy", skills: G.rollSkills("artisan") }]; // 以前 addVisitor 擲的
  G.switchVisitor(P, "v1"); // 小華收進 P.visitors
  const cands = S(P.visitors[0].cands);
  const back = G.migrateSave(J((() => { const s = G.newSave(); s.profiles.challenge = P; s.current = "challenge"; return s; })())).profiles.challenge;
  assert.strictEqual(S(back.visitors[0].cands), cands);
  assert.strictEqual(back.job, "detective"); assert.strictEqual(back.perk, null); assert.strictEqual(back.flaw, null); // 阿明（第一位）不補抽
  G.switchVisitor(back, "v2");
  assert.strictEqual(S(back.cands), cands); assert.strictEqual(back.job, null);
  assert.ok(G.chooseJob(back, "salesman")); // 候選人裡沒有的職業也能選
  assert.strictEqual(back.cands, null); assert.ok(G.traitById(back.perk) && G.traitById(back.flaw));
  G.switchVisitor(back, "v1"); assert.strictEqual(back.perk, null); // 阿明還是沒有
});

// ---------- 名字 ----------
T("cleanName：去頭尾空白、1–12 個字、不能有控制字元和零寬空白", () => {
  assert.strictEqual(G.cleanName("  阿明  "), "阿明");
  assert.strictEqual(G.cleanName("阿   明"), "阿 明");
  assert.strictEqual(G.cleanName(""), null); assert.strictEqual(G.cleanName("    "), null);
  assert.strictEqual(G.cleanName("壹".repeat(G.LEGACY.nameMax)), "壹".repeat(G.LEGACY.nameMax));
  assert.strictEqual(G.cleanName("壹".repeat(G.LEGACY.nameMax + 1)), null);
  assert.strictEqual(G.cleanName("🐸".repeat(G.LEGACY.nameMax)), "🐸".repeat(G.LEGACY.nameMax)); // 照字算，不照 UTF-16 算
  ["a\u0007", "a​b", "‍", "a⁠b", "a‮b", "a\u0000"].forEach(s => assert.strictEqual(G.cleanName(s), null, JSON.stringify(s)));
  assert.strictEqual(G.cleanName(null), null); assert.strictEqual(G.cleanName(12), null);
  assert.strictEqual(G.cleanName("<b>x</b>"), "<b>x</b>"); // 不改字，畫面上當純文字
  assert.strictEqual(G.visitorName({ vname: null, visitor: 4 }), "第 4 位參觀者");
  assert.strictEqual(G.visitorName({ vname: "阿明", visitor: 4 }), "阿明");
});

// ---------- 自由模式 ----------
T("自由模式不受影響：沒有位子，這些函式都不做事", () => {
  const F = fresh("free");
  ["vid", "vname", "slot", "visitors", "visitorCount"].forEach(k => assert.ok(!(k in F), k));
  const before = S(F);
  assert.strictEqual(G.addVisitor(F, "阿明", 1), null);
  assert.strictEqual(G.switchVisitor(F, "v1"), false);
  assert.strictEqual(G.renameVisitor(F, "v1", "x"), null);
  assert.strictEqual(S(G.visitorSlots(F)), S(Array.from({ length: G.LEGACY.slots }, () => null)));
  assert.strictEqual(G.visitorTotal(F), 0);
  assert.strictEqual(S(F), before);
  const back = G.fixProfile(J(F), "free");
  ["vid", "visitors", "visitorCount"].forEach(k => assert.ok(!(k in back), k));
});

// ---------- 真正的 ES 模組也接得上（visitors ⇄ logic ⇄ legacy） ----------
(async () => {
  try {
    const url = f => pathToFileURL(path.join(__dirname, "..", "shared", f)).href;
    const logic = await import(url("logic.js"));
    const visitors = await import(url("visitors.js"));
    const P = logic.newProfile("challenge"); logic.ensureDay(P, DAY);
    assert.ok(visitors.addVisitor(P, "小華", 1));
    assert.ok(visitors.switchVisitor(P, "v1"));
    logic.nextVisitor(P, "russia8", null);
    assert.strictEqual(P.visitor, 3); assert.strictEqual(P.slot, 0);
    pass++;
  } catch (e) { fail++; console.log("FAIL ES 模組", "\n   ", e.message); }
  console.log(`${pass} passed, ${fail} failed（多位參觀者）`);
  process.exit(fail ? 1 : 0);
})();
