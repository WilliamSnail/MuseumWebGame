// 再看收藏的畫（規劃 2.10b，11-14）和拍賣收標通知信：node test/art_review.test.cjs（npm test 也會跑）
// 擋的：壹幅壹天只領壹次靈感、收藏壹天合計 ≤ 6、今日特展和收藏同壹件不重複領、可怕的畫每次擲理智、上限滿了不擲不給、habituate、存檔整理、收標信
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const D1 = "2026-11-16", D2 = "2026-11-17";
// 壹週的畫：n0 不可怕、s1（1/1D8，危險度 1）、s3（1D4/1D20，危險度 3）、n1、n2、n3 都是不可怕的
const W = day => ({ past: false, works: [
  { id: "n0", date: day, day: 1 }, { id: "s1", date: day, day: 1, san: "1/1D8" }, { id: "s3", date: day, day: 1, san: "1D4/1D20" },
  { id: "n1", date: day, day: 1 }, { id: "n2", date: day, day: 1 }, { id: "n3", date: day, day: 1 }] });
const fresh = (G, day = D1) => { const P = G.newProfile("challenge"); G.ensureDay(P, day); G.assignJob(P, "detective"); return P; };
const view = (G, P, id, tier, day = D1) => { G.ensureDay(P, day); return G.viewCollectWork(P, W(day), id, tier, day); };
const GI = G => G.NUM.galleryInsp;

T("第一次看：照危險度的 first，再加稀有度（尋常 0、少見 0、珍藏 1、孤品 2）", G => {
  [0, 1, 2, 3].forEach((tier, i) => {
    const P = fresh(G), before = P.insp, r = view(G, P, "n" + (i % 4 === 0 ? 0 : i), tier);
    assert.strictEqual(r.insp, GI(G)[0].first + G.NUM.art.viewRarityBonus[tier], "tier " + tier);
    assert.strictEqual(P.insp - before, r.insp);
  });
  const P = fresh(G); assert.strictEqual(view(G, P, "s1", 0).insp, GI(G)[1].first);
});
T("同壹幅壹天只領壹次：第二次沒有靈感（但記得看過）", G => {
  const P = fresh(G), a = view(G, P, "n0", 2), b = view(G, P, "n0", 2);
  assert.ok(a.insp > 0);
  assert.strictEqual(b.insp, 0); assert.ok(b.again); assert.ok(!b.capped);
  assert.strictEqual(P.art.viewed.n0, D1);
});
T("隔天再看用 review，加稀有度", G => {
  const P = fresh(G); view(G, P, "n0", 2);
  const r = view(G, P, "n0", 2, D2);
  assert.ok(!r.first);
  assert.strictEqual(r.insp, GI(G)[0].review + G.NUM.art.viewRarityBonus[2]);
  const P2 = fresh(G); view(G, P2, "s3", 3);
  assert.strictEqual(view(G, P2, "s3", 3, D2).insp, GI(G)[3].review + G.NUM.art.viewRarityBonus[3]);
});
T("全部收藏壹天合計最多 6 點，換日歸零", G => {
  const P = fresh(G), before = P.insp;
  const gains = ["s3", "s1", "n0", "n1", "n2", "n3"].map(id => view(G, P, id, 3).insp);
  assert.ok(P.insp - before <= G.NUM.art.viewInspDay, "合計 " + (P.insp - before));
  assert.strictEqual(P.insp - before, G.NUM.art.viewInspDay, "拿得到就拿到 6");
  assert.strictEqual(gains[0], G.NUM.art.viewInspDay, "第壹幅（7+2）被上限切成 6");
  assert.deepStrictEqual(gains.slice(1), [0, 0, 0, 0, 0]);
  assert.strictEqual(P.art.inspDay.n, 6);
  assert.ok(view(G, P, "n0", 3, D2).insp > 0, "隔天又有");
  assert.strictEqual(P.art.inspDay.day, D2);
});
T("上限滿了：可怕的畫不擲理智也沒有靈感，只剩文字", G => {
  const P = fresh(G); view(G, P, "n0", 3); view(G, P, "n1", 3); view(G, P, "n2", 3);
  assert.strictEqual(P.art.inspDay.n, 6);
  const r = view(G, P, "s3", 3);
  assert.ok(r.capped); assert.strictEqual(r.insp, 0); assert.strictEqual(r.san, null);
});
T("可怕的畫每次看都擲理智（沒滿上限時，第二次也擲）；habituate 次以上同壹天變 0/1", G => {
  const P = fresh(G);
  assert.strictEqual(view(G, P, "s1", 0).san, "1/1D8");
  const r2 = view(G, P, "s1", 0); assert.strictEqual(r2.san, "1/1D8"); assert.ok(r2.again);
  for (let i = 0; i < G.NUM.habituate - 2; i++) assert.strictEqual(view(G, P, "s1", 0).san, "1/1D8");
  assert.strictEqual(view(G, P, "s1", 0).san, "0/1", "第 " + (G.NUM.habituate + 1) + " 次");
  assert.strictEqual(view(G, P, "s1", 0, D2).san, "1/1D8", "隔天又會怕");
});
T("不可怕的畫看了治好怪癖；自由模式不給靈感", G => {
  const P = fresh(G);
  P.quirks = [{ type: "phobia", cat: "帽子", opt: null, since: D1, until: Date.now() + 600000, task: "calm" }];
  assert.strictEqual(view(G, P, "n0", 0).cured.length, 1);
  const F = G.newProfile("free"); G.ensureDay(F, D1);
  const r = G.viewCollectWork(F, W(D1), "n0", 3, D1);
  assert.strictEqual(r.insp, 0);
});
T("不重複領：先在今日特展領過，同壹天收藏再看沒有靈感（還是擲理智）", G => {
  const P = fresh(G), w = W(D1);
  const a = G.viewShowWork(P, w, "s1", D1);
  assert.ok(a.insp > 0);
  const b = G.viewCollectWork(P, w, "s1", 3, D1);
  assert.strictEqual(b.insp, 0); assert.ok(b.again); assert.strictEqual(b.san, "1/1D8");
  assert.strictEqual((P.art.inspDay && P.art.inspDay.n) || 0, 0, "沒有佔收藏的額度");
});
T("不重複領：先在收藏看（第壹次），同壹天今日特展不再當第壹次", G => {
  const P = fresh(G), w = W(D1);
  const a = G.viewCollectWork(P, w, "n0", 0, D1);
  assert.ok(a.insp > 0);
  const b = G.viewShowWork(P, w, "n0", D1);
  assert.strictEqual(b.insp, 0);
});
T("今日特展那邊拿滿了也不影響收藏的額度；兩邊合計同壹幅壹天只有壹次", G => {
  const P = fresh(G), w = W(D1), before = P.insp;
  G.viewShowWork(P, w, "n0", D1); G.viewCollectWork(P, w, "n0", 3, D1); G.viewCollectWork(P, w, "n0", 3, D1);
  assert.strictEqual(P.insp - before, G.NUM.story.showInsp[0]);
});
T("存檔整理：viewed、inspDay 留著，壞的丟掉", G => {
  const P = fresh(G);
  P.art = { viewed: { a: "2026-11-16", b: "壞的", __proto__x: 1 }, inspDay: { day: "2026-11-16", n: 4.7 } };
  const A = G.casArtFix(P);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(A.viewed)), { a: "2026-11-16" });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(A.inspDay)), { day: "2026-11-16", n: 4 });
  P.art = { inspDay: { day: "x", n: 3 } };
  assert.ok(!("inspDay" in G.casArtFix(P)));
});
T("拍賣收標信：得標、賣家、沒拍到的各壹封；沒句子的沒有；編號乾淨、30 天後過期", G => {
  const a = { title: "歪頭的佩佩" };
  const out = G.casAucMails("p~12", a, { u1: ["拍到「歪頭的佩佩」，付 1。"], u2: ["沒拍到"], u3: [] }, "2026-11-19", 30);
  assert.strictEqual(JSON.stringify(out.map(x => x.uid)), JSON.stringify(["u1", "u2"]));
  const m = out[0].mail;
  assert.ok(/^[A-Za-z0-9_-]{1,128}$/.test(m.id), m.id);
  assert.strictEqual(m.expire, "2026-12-19"); assert.strictEqual(m.claimed, false);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(m.gift)), { insp: 0, mood: 0 });
  assert.ok(m.title.includes("歪頭的佩佩"));
});
T("收標信接得上 casAucSettle 的 notes（館方拍：得標者和輸家各壹封）", G => {
  const DAY = "2026-11-16", WORK = "2026-W47/r1", T0 = Date.UTC(2026, 10, 16, 2, 0, 0);
  const house = G.casHouseFix(G.casHouseNew(), DAY).house, doc = G.casAucDocFix({}), wallets = {}, saves = {};
  for (const u of ["u1", "u2"]) { const w = G.casWalletFix(G.casWalletNew(), DAY); w.chips = 50000000; G.casBondFix(w, DAY).born = "2026-01-01"; wallets[u] = w; saves[u] = {}; }
  G.casAucOpenHouse(doc, [{ id: WORK, date: DAY, tier: 2, title: "珍藏的畫" }], DAY, T0, house);
  const a = doc.open[0];
  assert.ok(G.casAucBid(doc, wallets.u1, saves.u1, "u1", a.id, a.reserve * 2, DAY, T0 + 1000).ok);
  assert.ok(G.casAucBid(doc, wallets.u2, saves.u2, "u2", a.id, a.reserve + 1000, DAY, T0 + 2000).ok);
  const r = G.casAucSettle(doc, a.id, { house, wallets, saves, day: "2026-11-19", nowMs: T0 + 4 * 86400000 });
  const mails = G.casAucMails(a.id, a, r.notes, "2026-11-19", 30);
  assert.strictEqual(JSON.stringify(mails.map(x => x.uid).sort()), JSON.stringify(["u1", "u2"]));
  assert.ok(mails.find(x => x.uid === "u1").mail.note.includes("拍到"));
  assert.ok(mails.find(x => x.uid === "u2").mail.note.includes("沒有拍到"));
});

console.log(`art_review：${pass} 過，${fail} 失敗`);
process.exit(fail ? 1 : 0);
