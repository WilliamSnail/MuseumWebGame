// 旅客理智分岔（決定 0097）：node test/npc_branch.test.cjs（npm test 也會跑）
// 互動的上限、收盤進理智、7 天均線、每段週結算（先有預兆、恢復要連兩次）、variants 的選法（beat 不能暫停）、賭場邀請和委託有接上
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const D = "2026-11-16"; // 第 1 段第 1 個週一
const STEP = { step: 1, from: "2026-11-01", text: "原句", news: "原新聞", variants: { steady: { text: "有精神" }, tired: { text: "話變少", news: "慢了", delay: 3 }, uneasy: { action: "hold", text: "最近少來" } } };
const NPC = { id: "t-bell", name: "測試", kind: "visitor", budget: { perDay: 1000 }, arc: [STEP] };
const mk = G => G.casHouseFix(G.casHouseNew(), D).house;
const san = (G, h, id, v) => { G.nwFix(h).san[id] = v; };

T("互動上限：同一位玩家對同一位旅客一天最多 3 件、淨額夾 ±3；連輸算 −2；同一位玩家一天全館最多 10 件；全館對同一位旅客一天最多 ±6", G => {
  const h = mk(G), B = G.NUM.casino.worldDoc.branch;
  assert.deepStrictEqual([1, 2, 3].map(() => G.nwPoke(h, D, "u1", "a", "lose")), [-1, -2, 0], "輸 −1，連輸 −2（淨額 −3 到頂），第 3 件夾住 0");
  assert.strictEqual(G.nwPoke(h, D, "u1", "a", "lose"), 0, "第 4 件（超過每人每天每位旅客 3 件）不算");
  assert.strictEqual(G.nwPokeNet(G.nwFix(h), D, "a"), -3);
  assert.strictEqual(G.nwPoke(h, D, "u2", "a", "bust"), -2); assert.strictEqual(G.nwPoke(h, D, "u3", "a", "bust"), -1, "全館 ±6 夾住（−3 −2 −1）"); assert.strictEqual(G.nwPoke(h, D, "u4", "a", "bust"), 0);
  assert.strictEqual(G.nwPokeNet(G.nwFix(h), D, "a"), -B.perNpc);
  const h2 = mk(G); let got = 0; for (let i = 0; i < 12; i++) { G.nwPoke(h2, D, "u9", "p" + i, "win"); } for (let i = 0; i < 12; i++) got += G.nwPokeNet(G.nwFix(h2), D, "p" + i);
  assert.strictEqual(got, B.perUid, "同一位玩家一天全館 10 件");
  assert.strictEqual(G.nwPoke(mk(G), D, "u1", "a", "tie"), 0, "不認得的種類不算"); assert.strictEqual(G.nwPoke(mk(G), D, "", "a", "win"), 0); assert.strictEqual(G.nwPoke(mk(G), D, "u1", "__proto__", "win"), 0);
  assert.strictEqual(G.nwPokeKind({ kind: "lose", why: "bust" }), "bust"); assert.strictEqual(G.nwPokeKind({ kind: "lose", why: "lower" }), "lose"); assert.strictEqual(G.nwPokeKind({ kind: "push" }), null); assert.strictEqual(G.nwPokeKind({ kind: "charlie" }), "win");
});
T("單一玩家就能把旅客推下去（沒有人數門檻）：連續好幾天輸，收盤理智每天往下，7 天均線進 edge", G => {
  const h = mk(G); let day = D;
  for (let i = 0; i < 8; i++) { for (const k of ["lose", "lose", "bust"]) G.nwPoke(h, day, "solo", "t-bell", k); G.nwSanDay(h, day, [], [NPC], {}); day = add(day, 1); }
  assert.ok(G.nwSan(h, "t-bell") <= 70 - 3 * 8 + 8 * 4, "每天最多 −3（單人淨額上限）：" + G.nwSan(h, "t-bell"));
  assert.ok(G.nwSan(h, "t-bell") < 70, "往下");
  const hist = G.nwFix(h).hist["t-bell"]; assert.ok(Array.isArray(hist) && hist.length === 7, "只存最近 7 天");
});
T("所有有名字的旅客都追蹤（排程可以對任何旅客觸發 edge，不預先指定）：沒有 variants 也存 7 天均線；劇情角色（trace）不存；互動仍算進理智；舊的互動紀錄隔兩天清掉", G => {
  const h = mk(G), plain = { id: "p1", name: "沒分岔", kind: "visitor", budget: { perDay: 1000 }, arc: [{ step: 1, from: D, text: "a", news: "b" }] }, tr = { id: "tr1", name: "劇情", kind: "trace", budget: { perDay: 1000 }, arc: [] };
  G.nwPoke(h, D, "u", "p1", "lose"); G.nwSanDay(h, D, [], [plain, tr], {}); assert.deepStrictEqual(JSON.parse(JSON.stringify(G.nwFix(h).hist.p1)), [69], "沒有 variants 也存（收盤 69）"); assert.ok(!G.nwFix(h).hist.tr1, "trace 不存");
  G.nwPoke(h, add(D, 3), "u", "p1", "win"); assert.ok(!G.nwFix(h).poke[D], "舊的互動紀錄清掉");
});
T("給排程讀的公開資料：asOf 是最近一次結算的段首日期、每位的 now／st／prev／since、edge 是還沒走結局的、newEdge 是前一次 uneasy 以上這次 edge；不含玩家名字", G => {
  const h = mk(G), w = G.nwFix(h); assert.deepStrictEqual(JSON.parse(JSON.stringify(G.nwArcPublic(h))), { asOf: null, seg: null, levels: {}, edge: [], newEdge: [] }); assert.strictEqual(G.nwArcPublic(null).seg, null);
  const N2 = { id: "t-two", name: "二", kind: "visitor", budget: { perDay: 1 }, arc: [] };
  w.hist["t-bell"] = [10, 10, 10, 10, 10, 10, 10]; w.hist["t-two"] = [50, 50, 50, 50, 50, 50, 50]; G.nwArcWeek(h, add(D, 13), [NPC, N2]);
  let p = G.nwArcPublic(h); assert.strictEqual(p.asOf, add(D, 14)); assert.strictEqual(p.seg, 1); assert.strictEqual(p.edge.length, 0); assert.strictEqual(p.newEdge.length, 0);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(p.levels["t-bell"])), { now: "edge", st: "uneasy", prev: "steady", since: add(D, 14) }); assert.strictEqual(p.levels["t-two"].st, "tired", "平均 50 ＝ 有點累");
  G.nwArcWeek(h, add(D, 27), [NPC, N2]); p = G.nwArcPublic(h); assert.strictEqual(p.edge.join(), "t-bell"); assert.strictEqual(p.newEdge.join(), "t-bell", "前一次 uneasy、這次 edge");
  G.nwArcEnd(h, "t-bell", add(D, 30)); p = G.nwArcPublic(h); assert.strictEqual(p.edge.length, 0, "走完結局不再列"); assert.ok(p.levels["t-bell"].end);
  assert.ok(!/uid|u1|solo/.test(JSON.stringify(p)), "沒有玩家");
});
T("週結算：只在每段第 1 週的週一（前一天收盤時）算一次；資料少於 3 天不算；edge 要前一次已經是 uneasy 以上（先有預兆）", G => {
  const h = mk(G), w = G.nwFix(h), B = G.NUM.casino.worldDoc.branch;
  const closeSun = d => JSON.parse(JSON.stringify(G.nwArcWeek(h, d, [NPC]))); // d 是收盤那天
  assert.deepStrictEqual(closeSun(add(D, 3)), [], "週四收盤：不是新的一段");
  w.hist["t-bell"] = [10, 10]; assert.deepStrictEqual(closeSun(add(D, 13)), [], "只有 2 天資料：不算（而且這段標記過了）");
  assert.strictEqual(w.arcSeg, 1);
  w.hist["t-bell"] = [10, 12, 8, 10, 9, 11, 10];
  assert.deepStrictEqual(closeSun(add(D, 27)), [{ id: "t-bell", from: "steady", to: "uneasy" }], "平均 10 ＝ edge，但前一次是 steady：先到 uneasy（先有預兆）");
  assert.strictEqual(G.nwArcState(h, "t-bell"), "uneasy"); assert.deepStrictEqual(closeSun(add(D, 27)), [], "同一段不重複");
  assert.deepStrictEqual(closeSun(add(D, 41)), [{ id: "t-bell", from: "uneasy", to: "edge" }], "下一段還是很低：edge");
  assert.strictEqual(G.nwArcSeg("2026-11-15"), -1); assert.strictEqual(G.nwArcSeg(D), 0); assert.strictEqual(G.nwArcSeg(add(D, 14)), 1); assert.ok(B.recoverN === 2);
});
T("恢復：平均回到有點累以上，要連續 2 次結算才回；中間又掉下去就重新算；有結局之後不再恢復", G => {
  const h = mk(G), w = G.nwFix(h), cl = d => G.nwArcWeek(h, d, [NPC]).map(x => x.from + ">" + x.to).join();
  w.hist["t-bell"] = [30, 30, 30, 30, 30, 30, 30]; assert.strictEqual(cl(add(D, 13)), "steady>uneasy");
  w.hist["t-bell"] = [60, 60, 60, 60, 60, 60, 60]; assert.strictEqual(cl(add(D, 27)), "", "第 1 次回到穩定：還沒恢復"); assert.strictEqual(G.nwArcState(h, "t-bell"), "uneasy");
  w.hist["t-bell"] = [30, 30, 30, 30, 30, 30, 30]; assert.strictEqual(cl(add(D, 41)), "", "又掉下去：恢復計數歸零"); assert.strictEqual(w.arc["t-bell"].rec, 0);
  w.hist["t-bell"] = [60, 60, 60, 60, 60, 60, 60]; cl(add(D, 55)); assert.strictEqual(cl(add(D, 69)), "uneasy>steady", "連續 2 次");
  const h2 = mk(G), w2 = G.nwFix(h2); w2.hist["t-bell"] = [10, 10, 10, 10, 10, 10, 10]; G.nwArcWeek(h2, add(D, 13), [NPC]); G.nwArcWeek(h2, add(D, 27), [NPC]); assert.ok(G.nwArcEnd(h2, "t-bell", add(D, 28)));
  w2.hist["t-bell"] = [90, 90, 90, 90, 90, 90, 90]; assert.strictEqual(G.nwArcWeek(h2, add(D, 41), [NPC]).length, 0); assert.strictEqual(G.nwArcState(h2, "t-bell"), "edge");
});
T("variants：steady 可換句、tired 換句（delay 最多 1 週）、uneasy hold／skip／alt；有 beat 的步只能換句（不暫停、不延後）；edge 當 uneasy 並標 edge", G => {
  assert.strictEqual(G.nwArcVariant(STEP, "steady").text, "有精神"); assert.strictEqual(G.nwArcVariant({ text: "x", news: "y" }, "steady").text, "x");
  const t = G.nwArcVariant(STEP, "tired"); assert.deepStrictEqual([t.text, t.news, t.delay, t.action], ["話變少", "慢了", 1, null]);
  const u = G.nwArcVariant(STEP, "uneasy"); assert.deepStrictEqual([u.action, u.text, u.news], ["hold", "最近少來", "原新聞"]);
  const e = G.nwArcVariant(STEP, "edge"); assert.ok(e.edge && e.action === "hold");
  const b = Object.assign({}, STEP, { beat: "e1" }); for (const st of ["tired", "uneasy", "edge"]) { const r = G.nwArcVariant(b, st); assert.strictEqual(r.action, null, "beat 不暫停：" + st); assert.strictEqual(r.delay, 0); assert.strictEqual(r.text, st === "steady" ? "有精神" : "話變少"); }
  assert.strictEqual(G.nwArcVariant(Object.assign({}, STEP, { variants: { uneasy: { action: "skip" } } }), "uneasy").action, "skip");
  assert.strictEqual(G.nwArcVariant(STEP, "亂寫").state, "steady");
});
T("接上了：賭場邀請的牌桌結算和交委託都會記互動；收盤時 npcSpendDay 會在新一段的前一天結算", G => {
  const fs = require("fs"), path = require("path");
  const tab = fs.readFileSync(path.join(__dirname, "..", "shared", "casino_table.js"), "utf8"), job = fs.readFileSync(path.join(__dirname, "..", "shared", "casino_job.js"), "utf8"), sp = fs.readFileSync(path.join(__dirname, "..", "shared", "npc_spend.js"), "utf8");
  assert.ok(/nwPoke\(ctx\.house, ctx\.day, s\.npc\.host, s\.npc\.id, nwPokeKind\(s\.out\)\)/.test(tab)); assert.ok(/nwPoke\(house, day, uid, nm\.id, "jobDone"\)/.test(job)); assert.ok(/nwArcWeek\(house, day,/.test(sp));
  const h = mk(G), w = { chips: 0, st: {}, cj: null }, c = G.CLIENTS[0], who = G.npcByName(c.name); const r = G.casJobChips(w, h, ["0"], D, () => 0.5, [c.name], "u1"); assert.ok(r.ok && r.n === 1, JSON.stringify(r)); assert.strictEqual(G.nwPokeNet(G.nwFix(h), D, who.id), 1, "交委託：委託人 +1");
});
console.log(`旅客理智分岔：${pass} 過，${fail} 沒過`); process.exit(fail ? 1 : 0);
