// NPC 來館花錢（11-14）：node test/npc_spend.test.cjs（npm test 也會跑；node test/npc_spend.test.cjs sim 印出總量）
// 付門票（不分紅給玩家）、去的店花錢（餐車牌桌進莊家、其餘進預算池）、都從外面世界搬、每人每天和全館每天有上限、吃緊不花、守恆、GDP 算進消費和淨出口、日報有壹句。
const assert = require("assert"), fs = require("fs"), path = require("path");
const { load } = require("./load_shared.cjs");
const LIST = fs.readdirSync(path.join(__dirname, "..", "content", "npc")).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "content", "npc", f), "utf8")));
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.NUM.casino.grants = []; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const D0 = "2026-11-16", add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const inv = (G, h) => { const s = G.casBookSnap([], h, 0, null); return G.casBookTotal(s) - G.casBookMinted(s) + G.casBookBurned(s); };
const mk = G => G.casHouseFix(G.casHouseNew(), D0).house;

T("來館的 NPC 付門票、去的店花錢：預算池／莊家／館方帳收到、外面世界付、守恆、同壹天只算壹次", G => {
  const h = mk(G), t0 = inv(G, h), w0 = h.world, b0 = h.budget, k0 = h.bankroll, m0 = h.museum;
  const r = G.casNpcSpend(h, D0, "s", LIST, null);
  assert.ok(r.total > 0 && r.people > 0 && r.ticket > 0 && r.shop > 0, JSON.stringify(r));
  assert.strictEqual(h.world, w0 - r.total - r.crowd.ticket - r.crowd.shop); assert.strictEqual(inv(G, h), t0, "守恆");
  assert.strictEqual((h.budget - b0) + (h.bankroll - k0) + (h.museum - m0), r.total + r.crowd.ticket + r.crowd.shop, "錢進預算池／莊家／館方帳");
  assert.ok(h.museum > m0, "門票有進館方帳"); assert.strictEqual(G.casNpcSpend(h, D0, "s", LIST, null), h.npcs); assert.strictEqual(h.world, w0 - r.total - r.crowd.ticket - r.crowd.shop, "不重複");
});
T("上限：每位 NPC 壹天 ≤ perDay×dayPct%、全館壹天 ≤ dayCap；吃緊的池子不花；沒名單／關掉不花", G => {
  const C = G.NUM.casino.npcSpend; let h = mk(G);
  for (let i = 0; i < 40; i++) { const r = G.casNpcSpend(h, add(D0, i), "s" + i, LIST, null); assert.ok(r.total <= Math.floor(C.dayCap * 1.2) + 1, "全館 " + r.total); }
  C.dayCap = 50000; h = mk(G); assert.ok(G.casNpcSpend(h, D0, "s", LIST, null).total <= 50000, "dayCap");
  C.dayCap = 1500000; h = mk(G); h.world = 1000; assert.strictEqual(G.casNpcSpend(h, D0, "s", LIST, null).total, 0, "外面世界吃緊不花");
  h = mk(G); assert.strictEqual(G.casNpcSpend(h, D0, "s", [], null).total, 0, "沒名單：只剩散客"); C.on = false; h = mk(G); assert.strictEqual(G.casNpcSpend(h, D0, "s", LIST, null), null);
});
T("GDP：店裡花的算消費 C、門票算淨出口 NX；日報壹句「帶進館」", G => {
  const h = mk(G), s0 = G.casBookSnap([], h, 0, D0); const r = G.casNpcSpend(h, D0, "s", LIST, null);
  const s1 = G.casBookSnap([], h, 0, add(D0, 1)), d = G.casBookDiff(s0, s1), g = G.casGdpOf(d), z = G.casGdpOf({ act: {}, wflow: {} });
  assert.strictEqual(g.C - z.C, r.shop + r.crowd.shop); assert.strictEqual(g.NX - z.NX, r.ticket + r.crowd.ticket);
  const txt = G.casReportView({ day: add(D0, 1), at: 0, snap: s1, diff: d, opening: 0 }).secs.map(x => x.lines.join("|")).join("\n");
  assert.ok(txt.includes("帶進館"), txt.slice(0, 300));
});
T("即時在場：每位 NPC 的幾站排成壹串不重疊、在營業時間內、同輸入同輸出；現在在展廳的人數和名字看時間算得出來", G => {
  const V = G.npcVisitsToday(D0, "s", LIST, null);
  assert.ok(V.length >= 8, "來的人數 " + V.length); assert.strictEqual(JSON.stringify(V), JSON.stringify(G.npcVisitsToday(D0, "s", LIST, null))); assert.notStrictEqual(JSON.stringify(V), JSON.stringify(G.npcVisitsToday(D0, "乙", LIST, null)));
  const by = {}; for (const v of V) { assert.ok(v.start >= 0 && v.end <= G.NPC_DAY_MIN && v.end > v.start, JSON.stringify(v)); (by[v.id] = by[v.id] || []).push(v); }
  for (const id of Object.keys(by)) { const a = by[id].sort((p, q) => p.start - q.start); for (let i = 1; i < a.length; i++) assert.ok(a[i].start >= a[i - 1].end, "不重疊：" + id); }
  assert.ok(!V.some(v => v.id.startsWith("t-")), "劇情角色不會在場");
  const hv = V.find(v => v.place === "hall"), mid = G.npcDayStartMs(D0) + (hv.start + 1) * 60000, p = G.npcPresence(D0, mid, "s", LIST, null);
  assert.ok(p.hall >= 1 && p.names.includes(hv.name), JSON.stringify(p)); assert.strictEqual(G.npcPresence(D0, G.npcDayStartMs(D0) - 1000, "s", LIST, null).hall, 0, "05:00 以前沒人");
  assert.ok(!("shops" in p), "不給各家店現在的人數");
});
T("停留時間在設定的範圍內（展廳 60～180、店 30～120，除非碰到營業時間結束被截短）；05:00～23:30 展廳平均 ≥ 2 位（深夜另外看，人少）", G => {
  const SP = G.NUM.casino.npcSpend; let hs = 0, n = 0;
  for (let d = 0; d < 12; d++) { const V = G.npcVisitsToday(add(D0, d), "t" + d, LIST, null); for (const v of V) { const r = v.place === "hall" ? SP.hallStay : SP.shopStay, len = v.end - v.start; assert.ok(len <= r[1] && (len >= r[0] || v.end === G.NPC_DAY_MIN), JSON.stringify(v)); } for (let m = 0; m < 1110; m += 10) { hs += V.filter(x => x.place === "hall" && x.start <= m && m < x.end).length; n++; } }
  assert.ok(hs / n >= 2, "展廳平均 " + hs / n);
});
T("散客：每天幾組、類型、幾點到由種子決定；週末多、午後晚上多；只付門票（外面世界付，30% 預算池、其餘館方帳）、不留評價、不算館內股人數；每天有上限", G => {
  const C = G.NUM.casino.npcSpend.crowd, wk = d => new Date(d + "T00:00:00Z").getUTCDay(); let wkend = 0, wkday = 0, nE = 0, nD = 0, hrs = new Array(24).fill(0);
  for (let i = 0; i < 28; i++) { const d = add(D0, i), g = G.crowdVisitsToday(d, "s"); assert.strictEqual(JSON.stringify(g), JSON.stringify(G.crowdVisitsToday(d, "s"))); (wk(d) === 0 || wk(d) === 6 ? (wkend += g.length, nE++) : (wkday += g.length, nD++)); for (const x of g) { assert.ok(x.start >= 0 && x.end <= G.NPC_DAY_MIN && x.n >= 1 && x.label); hrs[Math.floor(x.start / 60)]++; } }
  assert.ok(wkend / nE > wkday / nD, "週末比較多"); assert.ok(hrs[9] + hrs[10] + hrs[14] + hrs[15] + hrs[16] > hrs[0] + hrs[1] + hrs[2] + hrs[3] + hrs[4] + hrs[5], "午後晚上比早上多");
  const h = mk(G), t0 = inv(G, h), m0 = h.museum, b0 = h.budget, w0 = h.world, nl = h.reviews ? h.reviews.length : 0;
  const first = G.crowdVisitsToday(D0, "s")[0], at = G.npcDayStartMs(D0) + first.start * 60000;
  G.casNpcLive(h, D0, at - 60000, "s", LIST, null); assert.strictEqual((h.npcLive.crowd || {}).ticket || 0, 0, "還沒到不收");
  G.casNpcLive(h, D0, at, "s", LIST, null); const paid = h.npcLive.crowd.ticket; assert.strictEqual(paid, first.n * C.ticket); G.casNpcLive(h, D0, at, "s", LIST, null); assert.strictEqual(h.npcLive.crowd.ticket, paid, "冪等");
  assert.ok(h.museum - m0 >= paid * 0.6 && h.budget - b0 >= Math.floor(paid * 0.3) - 1); assert.ok(w0 - h.world >= paid);
  G.casNpcLive(h, D0, Infinity, "s", LIST, null); assert.ok(h.npcs.crowd.ticket > 0 && h.npcs.crowd.ticket <= C.dayCap && h.npcs.crowd.people > 0); assert.strictEqual(inv(G, h), t0, "守恆");
  assert.ok(!h.reviews.some(r => /學生|情侶|家庭|旅行團|朋友|長輩|獨自/.test(r.who)), "散客不留評價");
  const a = G.casHouseFix(G.casHouseNew(), D0).house; G.NUM.casino.npcSpend.crowd.dayCap = 12345; G.casNpcLive(a, D0, Infinity, "s", LIST, null); assert.ok(a.npcs.crowd.ticket <= 12345, "上限");
  const p = G.npcPresence(D0, G.npcDayStartMs(D0) + (first.start + 1) * 60000, "s", LIST, null); assert.ok(p.crowd.n >= first.n && p.crowd.groups.some(x => x.label === first.label), JSON.stringify(p.crowd));
  const h2 = mk(G); G.casNpcLive(h2, D0, Infinity, "s", [], null); assert.ok(h2.npcs.crowd.ticket > 0, "沒有 NPC 名單散客也來");
});
T("惰性結算：到了才付錢和留評價、冪等、不重複；整天結完等於收進 house.npcs；評價最多 20 則、壹位壹天 ≤ reviewDay", G => {
  const h = mk(G), t0 = inv(G, h), V = G.npcVisitsToday(D0, "s", LIST, null), last = V[V.length - 1];
  const early = G.npcDayStartMs(D0) + (V[2].start) * 60000;
  const a = G.casNpcLive(h, D0, early, "s", LIST, null), n1 = Object.keys(a.done).length, w1 = h.world;
  assert.ok(n1 >= 3 && n1 < V.length, "只結到了的：" + n1); G.casNpcLive(h, D0, early, "s", LIST, null); assert.strictEqual(h.world, w1, "同壹刻再叫不重複付");
  G.casNpcLive(h, D0, G.npcDayStartMs(D0) + (last.start) * 60000, "s", LIST, null); assert.ok(Object.keys(h.npcLive.done).length > n1);
  const part = h.world; G.casNpcLive(h, D0, Infinity, "s", LIST, null); const tot = G.casNpcSpend(h, D0, "s", LIST, null);
  assert.strictEqual(Object.keys(h.npcLive.done).length, V.length + G.crowdVisitsToday(D0, "s").length + G.crowdShopToday(D0, "s").length); assert.ok(h.world <= part && tot.total === h.npcs.total && tot.day === D0);
  assert.strictEqual(inv(G, h), t0, "守恆"); G.casNpcLive(h, D0, Infinity, "s", LIST, null); assert.strictEqual(h.npcs.total, tot.total);
  const R = h.reviews; assert.ok(R.length >= 1 && R.length <= 20); for (const r of R) { assert.ok(r.who && r.text && r.stars >= 1 && r.stars <= 5); assert.ok(R.filter(x => x.npc === r.npc && x.day === r.day).length <= G.NUM.casino.npcSpend.reviewDay); }
  for (let i = 1; i < 12; i++) G.casNpcSpend(h, add(D0, i), "s" + i, LIST, null); assert.ok(h.reviews.length <= 20, "最多 20 則");
});
T("跨天：換日時前壹天剩下的結完收起來；沒人來好幾天只收最後壹天", G => {
  const h = mk(G); G.casNpcLive(h, D0, G.npcDayStartMs(D0) + 3600000, "s", LIST, null);
  G.casNpcLive(h, add(D0, 1), G.npcDayStartMs(add(D0, 1)) + 60000, "s", LIST, null);
  assert.strictEqual(h.npcs.day, D0, "前壹天收進 npcs"); assert.strictEqual(h.npcLive.day, add(D0, 1));
  G.casNpcLive(h, add(D0, 5), G.npcDayStartMs(add(D0, 5)) + 60000, "s", LIST, null); assert.strictEqual(h.npcs.day, add(D0, 1)); assert.strictEqual(h.npcLive.day, add(D0, 5));
});
T("評價完整歷史：新寫的評價取得走、合進當天文件（冪等、以 id 去重、照時間排）、留言簿可以篩人、最多 50 則", G => {
  const h = mk(G); G.casNpcLive(h, D0, Infinity, "s", LIST, null);
  const nw = G.casNpcTakeReviews(h); assert.ok(nw.length >= 1 && nw.every(r => r.id && r.day === D0 && r.who)); assert.strictEqual(G.casNpcTakeReviews(h).length, 0, "取走就沒了、也不在莊家文件裡"); assert.ok(!("reviewsOut" in h));
  let d = G.casReviewsMerge(null, nw, D0); assert.strictEqual(d.items.length, nw.length); const again = G.casReviewsMerge(d, nw, D0); assert.strictEqual(JSON.stringify(again), JSON.stringify(d), "重複合進去不變（冪等）");
  for (let i = 1; i < d.items.length; i++) assert.ok(d.items[i].at >= d.items[i - 1].at);
  const one = nw[0], p = G.casReviewsPick(d.items, one.who, 50); assert.ok(p.items.length >= 1 && p.items.every(r => r.who === one.who)); assert.strictEqual(G.casReviewsPick(d.items, one.npc, 50).total, p.total, "名字或 id 都可以");
  const many = Array.from({ length: 80 }, (_, i) => ({ id: "x" + i, at: i, day: D0, npc: "n", who: "甲", text: "t", stars: 5 })); assert.strictEqual(G.casReviewsPick(many, "", 999).items.length, 50); assert.strictEqual(G.casReviewsPick(many, "", 999).items[0].at, 79, "新的在前");
  assert.strictEqual(G.casReviewsMerge(null, [{ id: "a", at: 1, day: D0, who: "", text: "x" }, "壞", null], D0).items.length, 0, "壞資料不收");
});
if (process.argv[2] === "sim") {
  const G = load(); G.NUM.casino.grants = []; const h = mk(G); let tot = 0, tk = 0, shop = 0, ppl = 0; const N = 200;
  for (let i = 0; i < N; i++) { const r = G.casNpcSpend(h, add(D0, i), "x" + i, LIST, null); tot += r.total; tk += r.ticket; shop += r.shop; ppl += r.people; }
  console.log(`${LIST.filter(n => n.kind !== "trace").length} 位 NPC、${N} 天：平均每天 ${Math.round(tot / N)}（門票 ${Math.round(tk / N)}、店裡 ${Math.round(shop / N)}）、${(ppl / N).toFixed(1)} 位花錢；全館上限 ${G.NUM.casino.npcSpend.dayCap}；外面世界每天成長 ${G.NUM.casino.world.growBase}`);
}
T("散客逛店：每家店每天平均 perStore 位、類型照店的個性（餐車多學生/家庭/旅行團，地下收藏庫多退休長輩）、跟展廳那幾組分開（不顯示）；算進館內股「昨天不同的人」但合計不超過 40%；花錢進莊家或預算池、有上限", G => {
  const S = G.NUM.casino.npcSpend.crowd.shop, tot = { food: 0, bj: 0, job: 0, cellar: 0, craft: 0 }, kinds = { food: {}, cellar: {} };
  for (let i = 0; i < 200; i++) { for (const g of G.crowdShopToday(add(D0, i), "x" + i)) { tot[g.store] += g.n; if (kinds[g.store]) kinds[g.store][g.label] = (kinds[g.store][g.label] || 0) + 1; assert.ok(g.start >= 0 && g.end <= G.NPC_DAY_MIN); } }
  for (const s of Object.keys(tot)) assert.ok(Math.abs(tot[s] / 200 - S.perStore) < 0.6, s + " 平均 " + tot[s] / 200);
  assert.ok((kinds.cellar["退休的長輩們"] || 0) > (kinds.cellar["三位學生"] || 0), "地下收藏庫退休長輩多於學生"); assert.ok(!kinds.food["退休的長輩們"] || kinds.food["三位學生"] > 0);
  assert.ok(G.crowdVisitsToday(D0, "s").every(g => !g.key.startsWith("cshop")), "展廳的組不含逛店的組");
  const h = G.casHouseFix(G.casHouseNew(), D0).house, H = G.casInHouseFix(h); for (let i = 1; i <= 7; i++) H.use[add(D0, -i)] = { food: 10 };
  G.NUM.casino.stockIn.npcBurstPct = 0; const c0 = G.casInNpcFor(H, D0, "s", {}, { list: LIST, counters: null }).food; H.use[D0] = { food: 3 };
  const lim = Math.floor(3 * G.NUM.casino.stockIn.npcShareMax / (100 - G.NUM.casino.stockIn.npcShareMax)); delete H.npc[D0]; assert.ok(G.casInNpcFor(H, D0, "s", {}, { list: LIST, counters: null }).food <= lim, "合計不超過 40%");
  const h2 = mk(G), b0 = h2.bankroll, k0 = h2.budget; G.casNpcLive(h2, D0, Infinity, "s", LIST, null); assert.ok(h2.npcs.crowd.shop > 0 && h2.npcs.crowd.shop <= S.dayCap); assert.ok(c0 >= 0);
});
T("深夜也有人（翊文 11-14）：23:30 之後到隔天 05:00 有有名字的 NPC 在展廳、也有散客到；但深夜的散客比晚上少", G => {
  const late = 1110; let npcLate = 0, crowdLate = 0, crowdEve = 0;
  for (let d = 0; d < 60; d++) {
    const day = add(D0, d);
    npcLate += G.npcVisitsToday(day, "n" + d, LIST, null).filter(v => v.place === "hall" && v.end > late).length;
    for (const g of G.crowdVisitsToday(day, "c" + d)) { if (g.start >= late) crowdLate++; if (g.start >= 840 && g.start < 960) crowdEve++; }
  }
  assert.ok(npcLate > 0, "深夜有 NPC 在展廳"); assert.ok(crowdLate > 0, "深夜有散客到");
  assert.ok(crowdLate < crowdEve, `深夜（${crowdLate}）比晚上 19～21 點（${crowdEve}）少`);
  assert.strictEqual(G.NUM.casino.npcSpend.crowd.weights.length, 24, "每小時壹個比重，05:00 起 24 小時");
});
console.log(`${pass} passed, ${fail} failed（NPC 花錢）`);
process.exit(fail ? 1 : 0);
