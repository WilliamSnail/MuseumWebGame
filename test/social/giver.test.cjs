// 交代人互動的規則（shared/social/giver.js、shared/npc/givers.js，決定 0151）：node test/social/giver.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("../load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 6).join("\n    ")); } };
const D1 = "2026-11-21", D2 = "2026-11-22";
const mk = G => ({ w: G.casWalletFix(G.casWalletNew(), D1), P: null, house: G.casHouseFix(G.casHouseNew(), D1).house, day: D1, uid: "U1", saveDirty: false });
const run = (G, ctx, d, acts) => G.giverRun(ctx, d, acts);
const lvl = (ctx, id, xp) => { ctx.w.npcRel[id] = { xp, lv: xp >= 100 ? 3 : xp >= 40 ? 2 : xp >= 10 ? 1 : 0, day: null, today: { xp: 0 } }; };
// 挑戰模式的存檔：只放送禮會碰到的欄位
function withPepes(ctx) { const P = { mode: "challenge", pepes: {}, failed: {}, repaired: {}, hall: [], weekly: null, injured: {}, visitors: [], serial: 0, insp: 7 }; ctx.P = P; return P; }
const key = (G, o) => { const base = {}; G.CATS.forEach(c => { const o = G.allOpts(c); base[c] = o[o.length - 1]; }); const p = Object.assign(base, o); return G.CATS.map(c => p[c]).join("|"); };

T("閒聊：前 3 次加熟識度（+1）、第 4 次起不耐煩、壹天最多 8 下、換日重來", G => {
  const ctx = mk(G), r = [];
  for (let i = 0; i < 9; i++) r.push(run(G, ctx, { op: "tap", id: "clerk" }));
  assert.deepStrictEqual(r.map(x => x.gained), [1, 1, 1, 0, 0, 0, 0, 0, undefined]); assert.deepStrictEqual(r.map(x => !!x.annoyed).slice(0, 5), [false, false, false, true, true]);
  assert.ok(r[8].over && r[8].ok); assert.strictEqual(ctx.w.npcRel.clerk.xp, 3);
  ctx.day = D2; assert.strictEqual(run(G, ctx, { op: "tap", id: "clerk" }).n, 1);
});
T("來訪壹天壹次 +1；不認得的人、不認得的動作被擋；info 不動熟識度", G => {
  const ctx = mk(G); assert.strictEqual(run(G, ctx, { op: "visit", id: "hall" }).gained, 1); assert.strictEqual(run(G, ctx, { op: "visit", id: "hall" }).gained, 0);
  assert.ok(!run(G, ctx, { op: "tap", id: "t-yuga" }).ok); assert.ok(!run(G, ctx, { op: "jump", id: "hall" }).ok);
  const before = JSON.stringify(ctx.w.npcRel), r = run(G, ctx, { op: "info" }); assert.ok(r.ok && r.givers.length === 6 && r.gifts.max === 3); assert.strictEqual(JSON.stringify(ctx.w.npcRel), before);
});
T("臨時拜託：Lv0 不出；六位合計 ≤ 2；同壹天結果穩定；接下後算數、做完 +3、不能重複", G => {
  const ctx = mk(G); assert.strictEqual(G.giverOffers(ctx.w, D1, "U1").length, 0, "Lv0 不出");
  for (const id of ["yuga", "hall", "postman", "clerk", "scale", "number"]) lvl(ctx, id, 20);
  let maxN = 0, total = 0; for (let i = 0; i < 400; i++) { const n = G.giverOffers(ctx.w, D1, "U" + i).length; maxN = Math.max(maxN, n); total += n; }
  assert.ok(maxN <= 2, "六位合計最多 2 件"); assert.ok(total > 100, "常常有");
  assert.deepStrictEqual(G.giverOffers(ctx.w, D1, "U7"), G.giverOffers(ctx.w, D1, "U7"), "同壹天結果穩定");
  const uid = Array.from({ length: 400 }, (_, i) => "U" + i).find(u => G.giverOffers(ctx.w, D1, u).some(o => ["visit", "eat", "read", "cellar", "casinoCollection", "lostbox", "spot", "sendPepe"].includes(o.kind))), o = G.giverOffers(ctx.w, D1, uid).find(x => x.kind !== "tell");
  ctx.uid = uid; const a = run(G, ctx, { op: "ask", id: o.id }); assert.ok(a.ok && a.k === o.k, JSON.stringify(a));
  const acts = { visit: true, food: true }, done = run(G, ctx, { op: "askDone", id: o.id }, acts); assert.ok(done.ok && done.gained === 3, JSON.stringify(done)); assert.ok(!run(G, ctx, { op: "askDone", id: o.id }, acts).ok, "不能重複");
  assert.ok(G.giverOffers(ctx.w, D1, uid).find(x => x.id === o.id).accepted, "接下的永遠留著");
});
T("要證據的拜託（吃東西）沒有伺服器紀錄就不算；有就算；傳話要先去找對方說話", G => {
  const ctx = mk(G); lvl(ctx, "hall", 20); const eat = G.GIVERS.hall.errands.findIndex(e => e.kind === "eat"); assert.ok(eat >= 0, "堂主有吃東西的拜託");
  ctx.w.npcRel.hall.day = D1; ctx.w.npcRel.hall.today = { xp: 0, errand: { k: eat, done: 0 } };
  assert.ok(!run(G, ctx, { op: "askDone", id: "hall" }, {}).ok); assert.ok(run(G, ctx, { op: "askDone", id: "hall" }, { food: true }).ok);
  const tell = G.GIVERS.yuga.errands.findIndex(e => e.kind === "tell"), to = G.GIVERS.yuga.errands[tell].to; lvl(ctx, "yuga", 20); ctx.w.npcRel.yuga.day = D1; ctx.w.npcRel.yuga.today = { xp: 0, errand: { k: tell, done: 0 } };
  assert.ok(!run(G, ctx, { op: "askDone", id: "yuga" }, {}).ok, "還沒去找他說話"); run(G, ctx, { op: "tap", id: to }); assert.ok(run(G, ctx, { op: "askDone", id: "yuga" }, {}).ok);
});
T("送禮：反應看五個欄位（喜歡 +5、普通 +3、不太對 +1）；從存檔拿走壹隻不退還；壹位壹天 1 隻；號碼機也收；他桌上記最近收到的", G => {
  const ctx = mk(G), P = withPepes(ctx), likes = G.GIVERS.yuga.gift.likes, dislikes = G.GIVERS.yuga.gift.dislikes;
  const like = key(G, { 稀有度: likes.稀有度[0] }), off = key(G, { 稀有度: dislikes.稀有度[0] });
  P.pepes[like] = { n: 2, perfect: false, s: 1, d: D1 }; P.pepes[off] = { n: 2, perfect: false, s: 2, d: D1 };
  assert.strictEqual(G.giverReact("yuga", { kind: "pepe", key: like }), "like"); assert.strictEqual(G.giverReact("yuga", { kind: "pepe", key: off }), "off");
  const a = run(G, ctx, { op: "gift", id: "yuga", item: { kind: "pepe", key: like } }); assert.ok(a.ok, JSON.stringify(a)); assert.strictEqual(a.react, "like"); assert.strictEqual(P.pepes[like].n, 1, "拿走壹隻"); assert.ok(ctx.saveDirty);
  assert.strictEqual(ctx.w.npcRel.yuga.xp, 5); assert.ok(!run(G, ctx, { op: "gift", id: "yuga", item: { kind: "pepe", key: off } }).ok, "壹位壹天 1 隻");
  const b = run(G, ctx, { op: "gift", id: "number", item: { kind: "pepe", key: off } }); assert.ok(b.ok, "號碼機也收");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.house.givers.yuga.recent)), [{ kind: "pepe", key: like }]);
});
T("送禮的限制：只有壹隻的完美作品或有名字的擋住、修復品不能送、沒有挑戰模式存檔不能送、壹天合計 3 隻、不給籌碼靈感", G => {
  const ctx = mk(G); assert.ok(!run(G, ctx, { op: "gift", id: "hall", item: { kind: "pepe", key: "x" } }).ok, "沒存檔");
  const P = withPepes(ctx), cols = G.allOpts("顏色"), ks = [0, 1, 2, 3].map(i => key(G, { 顏色: cols[i] }));
  P.pepes[ks[0]] = { n: 1, perfect: true, s: 1, d: D1 }; P.pepes[ks[1]] = { n: 1, perfect: false, title: "小綠", s: 2, d: D1 }; P.pepes[ks[2]] = { n: 1, perfect: false, s: 3, d: D1 }; P.pepes[ks[3]] = { n: 1, perfect: false, s: 4, d: D1 };
  assert.ok(!run(G, ctx, { op: "gift", id: "hall", item: { kind: "pepe", key: ks[0] } }).ok, "完美作品只有壹隻"); assert.ok(!run(G, ctx, { op: "gift", id: "hall", item: { kind: "pepe", key: ks[1] } }).ok, "取了名字只有壹隻");
  assert.ok(!run(G, ctx, { op: "gift", id: "hall", item: { kind: "repaired", key: ks[2] } }).ok, "修復品不能送");
  const chips = ctx.w.chips, insp = P.insp;
  for (const [id, k] of [["hall", ks[2]], ["postman", ks[3]]]) assert.ok(run(G, ctx, { op: "gift", id, item: { kind: "pepe", key: k } }).ok);
  P.pepes[ks[0]].n = 2; P.pepes[ks[1]].n = 2; assert.ok(run(G, ctx, { op: "gift", id: "scale", item: { kind: "pepe", key: ks[0] } }).ok); const r4 = run(G, ctx, { op: "gift", id: "clerk", item: { kind: "pepe", key: ks[1] } });
  assert.ok(!r4.ok && /送夠/.test(r4.reason), "壹天合計 3 隻"); assert.strictEqual(ctx.w.chips, chips); assert.strictEqual(P.insp, insp);
  ctx.day = D2; assert.ok(run(G, ctx, { op: "gift", id: "clerk", item: { kind: "pepe", key: ks[1] } }).ok, "隔天重算");
});
T("到 Lv3 發稱號（六位各壹個，id 是 npc:<交代人>:<title.id>，名字和說明用 content 的 title）；稱號進同壹份成就、挑得起來、說明查得到", G => {
  for (const id of Object.keys(G.GIVER_TITLES)) {
    const ctx = mk(G), t = G.GIVERS[id].title, aid = "npc:" + id + ":" + t.id; lvl(ctx, id, 99); run(G, ctx, { op: "tap", id });
    assert.strictEqual(ctx.w.ach[aid].name, t.name, id); assert.ok(!ctx.w.ach["npc:" + id], "不再發舊格式"); assert.ok(G.casSetTitle(ctx.w, null, aid).ok);
    const info = G.casAchInfo(ctx.w, aid); assert.ok(info.npc && info.desc === t.desc && info.name === t.name, id); assert.ok(G.casCleanTitle({ id: aid, name: t.name }), "清稱號認得");
    run(G, ctx, { op: "visit", id }); assert.strictEqual(Object.keys(ctx.w.ach).filter(k => k.startsWith("npc:" + id)).length, 1, "只發壹次");
  }
  const old = mk(G); old.w.ach["npc:clerk"] = { name: "舊稱號", d: D1 }; lvl(old, "clerk", 99); run(G, old, { op: "tap", id: "clerk" });
  assert.deepStrictEqual(Object.keys(old.w.ach).filter(k => k.startsWith("npc:")), ["npc:clerk"], "舊格式的人不會再領壹個"); assert.strictEqual(G.casAchInfo(old.w, "npc:clerk").desc, "跟這位熟了。");
});
T("chat.mention：只提到有檔的另壹位交代人、句子在內容裡（至少 1 句）", G => {
  for (const id of Object.keys(G.GIVER_TITLES)) { const m = G.GIVERS[id].chat.mention; assert.ok(m && Object.keys(m).length, id); for (const [o, a] of Object.entries(m)) { assert.ok(o !== id && G.GIVERS[o], id + "→" + o); assert.ok(Array.isArray(a) && a.length >= 1 && a.every(x => typeof x === "string" && x), id + "→" + o); } }
});
T("串門子：六組、兩位字母順序在前的檔寫；一個時段壹天壹組、同壹個人同壹天壹樣；週日限定只在週日；句子的人是那兩位", G => {
  const ps = G.giverPairs(); assert.strictEqual(ps.length, 6); assert.ok(ps.every(p => p.a < p.b && p.id === p.a + "-" + p.b && p.where && p.talks.every(t => t.length >= 2 && t.length <= 3 && t.every(l => l.by === p.a || l.by === p.b))));
  const sun = "2026-11-22", mon = "2026-11-23"; assert.strictEqual(G.giverWeekday(sun), "sun"); assert.strictEqual(G.giverWeekday(mon), "mon");
  const hy = ps.find(p => p.id === "hall-yuga"); assert.strictEqual(hy.day, "sun");
  assert.ok(G.giverPairAt("evening", sun, "U1")); assert.ok(!G.giverPairAt("evening", mon, "U1") || G.giverPairAt("evening", mon, "U1").id !== "hall-yuga", "平日不出週日組");
  const seen = new Set(); for (let i = 0; i < 80; i++) seen.add(G.giverPairAt("evening", sun, "U" + i).id); assert.ok(seen.has("hall-yuga") && seen.has("number-yuga") && seen.has("postman-scale"), "晚上週日三組都有人遇到");
  const x = G.giverPairAt("morning", D1, "U9"); assert.deepStrictEqual(JSON.parse(JSON.stringify(G.giverPairAt("morning", D1, "U9"))), JSON.parse(JSON.stringify(x))); assert.strictEqual(x.id, "clerk-postman"); assert.strictEqual(x.sid, "pair:clerk-postman:" + x.ti);
  assert.ok(!G.giverPairAt("night", D1, "U1") || G.giverPairAt("night", D1, "U1").id === "clerk-scale"); assert.strictEqual(G.giverPairAt("noon", D1, "U1").id, "hall-postman");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(G.giverPairTalk(x.sid))), JSON.parse(JSON.stringify(x.talk))); assert.strictEqual(G.giverPairTalk("pair:clerk-postman:99"), null); assert.strictEqual(G.giverPairTalk("pair:zzz-yyy:0"), null);
});
T("串門子的對話記在字母順序在前那位名下；記在後面那位名下的丟掉", G => {
  const p = G.giverPairAt("morning", D1, "U1"), ok = G.giverLogAdd(null, p.a, [p.sid, "clerk:chat.morning:0"], D1); assert.strictEqual(ok.added, 2);
  assert.strictEqual(G.giverLogAdd(null, p.b, [p.sid], D1).added, 0, "記在 b 名下不收"); assert.strictEqual(G.giverLogAdd(null, "scale", ["pair:clerk-scale:0"], D1).added, 0);
});
T("做完他交代的每日任務：領了獎勵才給 +4、壹位壹天壹次、今天領幾個任務最多算幾次、換日重算", G => {
  const ctx = mk(G); assert.ok(!run(G, ctx, { op: "taskDone", id: "yuga" }).ok, "沒有挑戰模式的參觀者");
  const P = withPepes(ctx); const S = G.storyState(P);
  assert.ok(!run(G, ctx, { op: "taskDone", id: "yuga" }).ok, "今天沒領任務");
  S.tasks.t1 = { done: D1, claimed: D1 }; const r = run(G, ctx, { op: "taskDone", id: "yuga" }); assert.ok(r.ok && r.gained === 4, JSON.stringify(r)); assert.strictEqual(ctx.w.npcRel.yuga.xp, 4);
  assert.ok(!run(G, ctx, { op: "taskDone", id: "yuga" }).ok, "壹天壹位壹次"); assert.ok(!run(G, ctx, { op: "taskDone", id: "hall" }).ok, "只領了 1 個任務，只算 1 次");
  S.tasks.t2 = { done: D1, claimed: D1 }; assert.ok(run(G, ctx, { op: "taskDone", id: "hall" }).ok); assert.strictEqual(ctx.w.npcRel.hall.xp, 4);
  S.tasks.t3 = { done: D1, claimed: D1 }; assert.ok(!run(G, ctx, { op: "taskDone", id: "yuga" }).ok, "同壹位今天算過了");
  ctx.day = D2; S.tasks.t4 = { done: D2, claimed: D2 }; assert.ok(run(G, ctx, { op: "taskDone", id: "yuga" }).ok, "隔天重算");
  assert.strictEqual(ctx.w.chips, G.casWalletFix(G.casWalletNew(), D1).chips, "不給籌碼");
});
T("交談紀錄：同壹句不重複、壹次最多 10 句、每位最多 200 句丟最舊、格式不對丟掉、不認得的人丟掉、沒新句子 added 是 0", G => {
  let r = G.giverLogAdd(null, "clerk", ["chat.morning:1", "chat.morning:1", "BAD ID", "task:2026-11-23:1:says", 5], D1); assert.strictEqual(r.added, 2); assert.deepStrictEqual(JSON.parse(JSON.stringify(r.doc.g.clerk.map(x => x[1]))), ["chat.morning:1", "task:2026-11-23:1:says"]);
  assert.strictEqual(G.giverLogAdd(r.doc, "clerk", ["chat.morning:1"], D2).added, 0); assert.strictEqual(G.giverLogAdd(r.doc, "t-yuga", ["a:1"], D1).added, 0);
  const many = Array.from({ length: 15 }, (_, i) => "s:" + i); r = G.giverLogAdd(null, "hall", many, D1); assert.strictEqual(r.added, 10);
  let d = null; for (let i = 0; i < 25; i++) d = G.giverLogAdd(d, "hall", Array.from({ length: 10 }, (_, j) => "n:" + i + "-" + j), D1).doc;
  assert.strictEqual(d.g.hall.length, 200); assert.strictEqual(d.g.hall[199][1], "n:24-9"); assert.ok(!d.g.hall.some(x => x[1] === "n:0-0"), "最舊的丟掉");
  assert.strictEqual(r.doc.g.hall[0][0], 324, "2026-11-21 是 2026-01-01 之後第 324 天");
  const bad = G.giverLogFix({ v: 1, g: { clerk: [[1, "ok:1"], ["x", "no"], [2, "ok:1"], [3, "A B"]], zzz: [[1, "q"]] } }); assert.deepStrictEqual(JSON.parse(JSON.stringify(bad.g.clerk)), [[1, "ok:1"]]); assert.ok(!bad.g.zzz);
});
T("旅客的交談本子：旅客 id（v-、c- 開頭）才收、每位最多 20 句丟最舊、最多 80 位、不影響交代人的本子；劇情角色 t- 不收", G => {
  let r = G.giverLogAdd(null, "v-bai", ["v-bai:chat:1", "v-bai:chat:1", "v-bai:chat:2"], D1); assert.strictEqual(r.added, 2); assert.deepStrictEqual(JSON.parse(JSON.stringify(r.doc.t["v-bai"].map(x => x[1]))), ["v-bai:chat:1", "v-bai:chat:2"]); assert.deepStrictEqual(JSON.parse(JSON.stringify(r.doc.g)), {});
  assert.strictEqual(G.giverLogAdd(r.doc, "t-yuga", ["a:1"], D1).added, 0, "劇情角色不收"); assert.strictEqual(G.giverLogAdd(r.doc, "V-BAI", ["a:1"], D1).added, 0); assert.strictEqual(G.giverLogAdd(r.doc, "bai", ["a:1"], D1).added, 0);
  let d = null; for (let i = 0; i < 5; i++) d = G.giverLogAdd(d, "c-first", Array.from({ length: 10 }, (_, j) => "n:" + i + "-" + j), D1).doc;
  assert.strictEqual(d.t["c-first"].length, 20); assert.strictEqual(d.t["c-first"][19][1], "n:4-9"); assert.ok(!d.t["c-first"].some(x => x[1] === "n:0-0"));
  let e = null; for (let i = 0; i < 90; i++) e = G.giverLogAdd(e, "v-n" + i, ["s:1"], D1).doc; assert.ok(Object.keys(e.t).length <= 80, "最多 80 本"); assert.ok(e.t["v-n89"]);
  const mixed = G.giverLogAdd(G.giverLogAdd(null, "clerk", ["x:1"], D1).doc, "v-bai", ["y:1"], D1).doc; assert.ok(mixed.g.clerk.length === 1 && mixed.t["v-bai"].length === 1);
});
console.log(fail ? `交代人互動：${fail} 項沒過` : `交代人互動：${pass} 項都過`); process.exit(fail ? 1 : 0);
