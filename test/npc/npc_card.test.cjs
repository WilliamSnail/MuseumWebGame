// 旅客卡的資料（決定 0096，shared/npc/card.js）：node test/npc/npc_card.test.cjs（npm test 也會跑）
const assert = require("assert");
const fs = require("fs"), path = require("path");
const { load } = require("../load_shared.cjs");
const LIST = fs.readdirSync(path.join(__dirname, "..", "..", "content", "npc")).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "content", "npc", f), "utf8")));
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const D = "2026-12-01", SEC = "sec-card", J = x => JSON.parse(JSON.stringify(x));
const mk = G => G.casHouseFix(G.casHouseNew(), "2026-11-01").house;
const live = (G, h, hour, extra) => Object.assign({ day: D, nowMs: G.npcDayStartMs(D) + hour * 3600000, secret: SEC, list: LIST, counters: null, house: h }, extra || {});
const visitor = LIST.find(n => n.kind === "visitor" && n.budget && n.budget.perDay > 0), client = LIST.find(n => n.kind === "client");

T("欄位齊全：旅客、委託人都有；劇情角色、查無此人給 null", G => {
  const h = mk(G), c = G.npcCardView(visitor.id, live(G, h, 12)), d = G.npcCardView(client.id, live(G, h, 12));
  for (const x of [c, d]) for (const k of ["id", "name", "kind", "kindLabel", "note", "story", "job", "likes", "san", "money", "where", "today", "arc", "arcDone", "mood"]) assert.ok(k in x, "有 " + k);
  assert.strictEqual(c.kindLabel, "旅客"); assert.strictEqual(d.kindLabel, "委託人"); assert.ok(Array.isArray(c.likes) && Array.isArray(c.today) && Array.isArray(c.arcDone));
  const trace = LIST.find(n => n.kind === "trace"); if (trace) assert.strictEqual(G.npcCardView(trace.id, live(G, h, 12)), null, "劇情角色不給卡");
  assert.strictEqual(G.npcCardView("沒這個人", live(G, h, 12)), null); assert.strictEqual(G.npcCardView(visitor.id, null), null);
});
T("喜歡的東西換成人看得懂的字：地方、展廳主題、稀有度", G => {
  const r = G.npcCardLikes(["hall", "bank", "rainbow", "孤品", "auction", "", 5]);
  assert.deepStrictEqual(J(r), [{ type: "place", key: "hall", label: "展廳" }, { type: "place", key: "bank", label: "銀行" }, { type: "theme", key: "rainbow", label: G.HALL_THEME_TEXT.rainbow.name }, { type: "rarity", key: "孤品", label: "孤品" }, { type: "place", key: "auction", label: "拍賣廳" }]);
  for (const n of LIST) for (const x of G.npcCardLikes(n.likes)) assert.ok(x.label && x.label !== "undefined", n.id + " " + x.key);
});
T("今天的行程只給已經開始的站：越晚越多、早的是晚的前綴、沒有未來的站；現在在哪跟 npcPresence 對得上", G => {
  const h = mk(G); let seen = 0, prev = null;
  for (const hour of [1, 6, 11, 16, 21, 25.5]) {
    const L = live(G, h, hour), now = L.nowMs, ids = G.npcVisitsToday(D, SEC, LIST, null).map(v => v.id).filter((x, i, a) => a.indexOf(x) === i);
    for (const id of ids.slice(0, 8)) {
      const c = G.npcCardView(id, L); if (!c) continue;
      assert.ok(c.today.every(s => s.at <= now), "沒有還沒開始的站"); seen += c.today.length;
      const cur = c.today.filter(s => s.now); assert.ok(cur.length <= 1); if (cur.length) { assert.ok(c.where && c.where.at === cur[0].place && c.where.until === cur[0].until && c.where.room === G.NPC_ROOM[cur[0].place]); } else assert.strictEqual(c.where, null);
      const p = G.npcPresence(D, now, SEC, LIST, null, new Set(), null); if (c.where && c.where.at === "hall") assert.ok(p.ids.includes(id), "在展廳的，npcPresence 也在展廳");
    }
  }
  assert.ok(seen > 0, "整天看得到行程");
  const id = G.npcVisitsToday(D, SEC, LIST, null).find(v => v.place).id, a = G.npcCardView(id, live(G, h, 8)).today, b = G.npcCardView(id, live(G, h, 20)).today;
  assert.deepStrictEqual(J(b.slice(0, a.length).map(s => [s.place, s.at, s.until])), J(a.map(s => [s.place, s.at, s.until])));
});
T("被館友邀去賭場：where ＝ 賭場、invited、不再有「現在」的站", G => {
  const h = mk(G), id = visitor.id, L = live(G, h, 12);
  h.npcCas = { day: D, by: {}, net: 0, at: { [id]: { until: L.nowMs + 600000 } }, cool: {} };
  const c = G.npcCardView(id, L); assert.strictEqual(c.where.room, "casino"); assert.strictEqual(c.where.invited, true); assert.strictEqual(c.where.until, L.nowMs + 600000); assert.ok(c.today.every(s => !s.now));
});
T("理智只給分級（沒有數字）；錢：壹天最多花 ＝ 預算 × dayPct，spentToday、left 對得上，錢包只給分級", G => {
  const h = mk(G); G.nwFix(h); h.npcw.day = D; h.npcw.san[visitor.id] = 30;
  const c = G.npcCardView(visitor.id, live(G, h, 12));
  assert.ok(c.san && c.san.band === "uneasy" && c.san.label && !("value" in c.san));
  const cap = Math.floor(Math.floor(visitor.budget.perDay * G.nwBudgetMult(h, visitor, G.nwUnitOf(h, visitor))) * G.NUM.casino.npcSpend.dayPct / 100);
  assert.strictEqual(c.money.perDay, cap); assert.strictEqual(c.money.spentToday, 0); assert.strictEqual(c.money.left, cap); assert.strictEqual(c.money.tier, visitor.budget.tier); assert.ok(c.money.tierLabel);
  h.npcLive = { day: D, byNpc: { [visitor.id]: Math.floor(cap / 4) } }; const d = G.npcCardView(visitor.id, live(G, h, 12)); assert.strictEqual(d.money.spentToday, Math.floor(cap / 4)); assert.strictEqual(d.money.left, cap - Math.floor(cap / 4));
  h.npcLive.day = "2026-11-30"; assert.strictEqual(G.npcCardView(visitor.id, live(G, h, 12)).money.spentToday, 0, "昨天的不算");
  h.npcw.bal[visitor.id] = cap * G.NUM.casino.worldDoc.wallet.targetDays; assert.strictEqual(G.npcCardView(visitor.id, live(G, h, 12)).money.wallet.band, "rich");
  h.npcw.bal[visitor.id] = 1; assert.strictEqual(G.npcCardView(visitor.id, live(G, h, 12)).money.wallet.band, "thin");
  assert.ok(!JSON.stringify(c.money).includes("bal"), "不給錢包的精確餘額");
});
T("沒有預算的 NPC：money 是 null；沒有世界資料：san、wallet 是 null，不丟錯", G => {
  const none = LIST.find(n => n.kind !== "trace" && !(n.budget && n.budget.perDay > 0));
  if (none) assert.strictEqual(G.npcCardView(none.id, live(G, {}, 12)).money, null);
  const c = G.npcCardView(visitor.id, live(G, {}, 12)); assert.strictEqual(c.san, null); assert.strictEqual(c.money.wallet, null); assert.strictEqual(c.mood, "");
});
T("故事線：只給解鎖到的段落；沒到第壹段 arc ＝ null", G => {
  const h = mk(G), v = LIST.find(n => n.arc && n.arc.length >= 2 && n.kind !== "trace"), a1 = v.arc[0].from, a2 = v.arc[1].from;
  assert.strictEqual(G.npcCardView(v.id, Object.assign(live(G, h, 12), { day: "2026-01-01", nowMs: G.npcDayStartMs("2026-01-01") + 3600000 })).arc, null);
  const c1 = G.npcCardView(v.id, Object.assign(live(G, h, 12), { day: a1, nowMs: G.npcDayStartMs(a1) + 3600000 })); assert.strictEqual(c1.arc.step, v.arc[0].step); assert.deepStrictEqual(c1.arcDone, []);
  const c2 = G.npcCardView(v.id, Object.assign(live(G, h, 12), { day: "2028-01-01", nowMs: G.npcDayStartMs("2028-01-01") + 3600000 })); assert.ok(c2.arc.step >= v.arc[0].step); assert.ok(c2.arcDone.every(x => x.step < c2.arc.step));
  assert.ok(!JSON.stringify(c1).includes(v.arc[v.arc.length - 1].text) || v.arc.length === 1 || c1.arc.text === v.arc[v.arc.length - 1].text, "沒到的段落不給");
});
console.log(`旅客卡的資料：${pass} 過，${fail} 沒過`); process.exit(fail ? 1 : 0);
