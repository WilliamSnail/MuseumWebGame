// 劇情經濟事件（11-14，shared/econ_events.js）：node test/econ_events.test.cjs（npm test 也會跑）
// 外資 NPC（出價機率、壹天總額加成）、館債簽收窗口（提早拿回、利息照比例、莊家付不出就不給）、畫價凍結（窗口內第壹次報的價）、莊家提早還貸款（只在那天、還完仍在健康線以上）、對帳日、預告。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); G.NUM.casino.grants = []; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const D = "2026-12-14", add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const ev = (...a) => { const o = {}; for (const [d, kind, level, name] of a) (o[d] = o[d] || []).push({ kind, level, name }); return o; };
const inv = (G, h, w) => { const s = G.casBookSnap(w ? [w] : [], h, 0, null); return G.casBookTotal(s) - G.casBookMinted(s) + G.casBookBurned(s); };

T("事件在哪幾天起作用：外資和對帳日只有當天、簽收窗口和凍結從 date 起 level 天（有上限）", G => {
  const E = G.NUM.casino.econEvent, e = ev([D, "foreign", 2, "外面的客人"], [D, "bondWindow", 2, "窗"], [D, "artFreeze", 9, "借展"], [D, "audit", 1, "對帳"], [D, "houseRepay", 3, ""]);
  const a0 = G.casEconActive(e, D); assert.strictEqual(a0.foreign.pct, E.foreignPct[1]); assert.ok(a0.bondWindow && a0.artFreeze && a0.audit && a0.houseRepay.pct === E.repayPct[2]);
  const a1 = G.casEconActive(e, add(D, 1)); assert.ok(!a1.foreign && !a1.audit && !a1.houseRepay && a1.bondWindow && a1.artFreeze);
  assert.ok(!G.casEconActive(e, add(D, 2)).bondWindow, "窗口 2 天"); assert.ok(G.casEconActive(e, add(D, E.freezeMax - 1)).artFreeze && !G.casEconActive(e, add(D, E.freezeMax)).artFreeze, "凍結最長 freezeMax 天（level 9 也只算 freezeMax）");
  assert.strictEqual(JSON.stringify(G.casEconActive(null, D)), "{}");
});
T("預告：foreign、artFreeze 提前 2 天、bondWindow 提前 3 天；houseRepay、audit 不預告；日報寫預告和對帳日", G => {
  const e = ev([add(D, 2), "foreign", 1, ""], [add(D, 3), "bondWindow", 2, ""], [add(D, 3), "artFreeze", 4, ""], [add(D, 1), "houseRepay", 1, ""], [add(D, 1), "audit", 1, ""]);
  const up = G.casEconUpcoming(e, D); assert.strictEqual(JSON.stringify(up.map(u => u.kind).sort()), JSON.stringify(["bondWindow", "foreign"]), "artFreeze 3 天後還不預告（提前 2 天）");
  const up2 = G.casEconUpcoming(e, add(D, 1)).map(u => u.kind).sort(); assert.strictEqual(JSON.stringify(up2), JSON.stringify(["artFreeze", "bondWindow", "foreign"]));
  const h = G.casHouseFix(G.casHouseNew(), D).house, s = G.casBookSnap([], h, 0, D); s.house.econUp = up;
  const txt = G.casReportView({ day: D, at: 0, snap: s, diff: G.casBookDiff(null, s), opening: 0, audit: true, gap: 0 }).secs.map(x => x.lines.join("|")).join("\n");
  assert.ok(/預告：.*外面來的客人會多壹些.*館債開簽收窗口/.test(txt) && txt.includes("核對本季差額"), txt.slice(0, 500));
});
T("館債簽收窗口：窗口內提早拿回本金加照比例的利息（不比到期多）、窗口外不行、莊家付不出不給、守恆", G => {
  const h = G.casHouseFix(G.casHouseNew(), D).house, w = G.casWalletFix(G.casWalletNew(), D); h.bankroll = 500000000;
  w.bond = { list: [{ mon: add(D, -3), amt: 1000000, day: add(D, -3), pct: 4, due: add(D, 4) }], iou: 0, earned: 0, born: add(D, -30), notes: [] };
  assert.ok(!G.casBondRedeem(w, h, D).ok, "窗口沒開");
  G.casEconRun(h, D, ev([D, "bondWindow", 2, "窗"])); const t0 = inv(G, h, w), c0 = w.chips;
  const r = G.casBondRedeem(w, h, D); assert.ok(r.ok && r.n === 1 && r.amt === 1000000);
  const full = Math.floor(1000000 * 4 / 100 * 7 / 7); assert.ok(r.int > 0 && r.int < full, `利息 ${r.int} ＜ 到期 ${full}`); assert.strictEqual(r.int, Math.floor(full * 3 / 7));
  assert.strictEqual(w.chips - c0, r.amt + r.int); assert.strictEqual(w.bond.list.length, 0); assert.strictEqual(inv(G, h, w), t0, "守恆");
  const h2 = G.casHouseFix(G.casHouseNew(), D).house, w2 = G.casWalletFix(G.casWalletNew(), D); h2.bankroll = G.NUM.casino.houseLoan.reserve + 100; w2.bond = JSON.parse(JSON.stringify(w.bond)); w2.bond.list = [{ mon: add(D, -3), amt: 1000000, day: add(D, -3), pct: 4, due: add(D, 4) }];
  G.casEconRun(h2, D, ev([D, "bondWindow", 1, ""])); assert.ok(!G.casBondRedeem(w2, h2, D).ok, "莊家超過準備金的部分太少：不給");
  assert.ok(G.casBondView(w, h, D).window, "畫面看得到窗口開著"); assert.ok(!G.casBondView(w, h, add(D, 5)).window);
});
T("畫價凍結：窗口內第壹次報的價記下來、窗口內都用它；窗口外照舊；det 不受影響", G => {
  const h = G.casHouseFix(G.casHouseNew(), D).house; G.casArtHouse(h); const item = { tier: 1, date: add(D, -10) }, id = "2026-W50/x";
  const before = G.casArtPrice(item, id, D, h); G.casEconRun(h, D, ev([D, "artFreeze", 3, "借展"]));
  const p1 = G.casArtPrice(item, id, D, h); h.art.own[id] = 40; h.econ.b = 1; assert.strictEqual(G.casArtPrice(item, id, add(D, 1), h), p1, "搶手度和景氣變了，窗口內價不變"); assert.strictEqual(G.casArtPrice(item, id, add(D, 2), h), p1);
  assert.notStrictEqual(G.casArtPrice(item, id, add(D, 3), h), p1, "窗口外照舊（跟著變）"); assert.ok(before > 0);
  assert.strictEqual(G.casArtPrice(item, id, D, h, true), G.casArtPrice(item, id, D, h, true), "det 不快取");
});
T("莊家提早還外面世界貸款：只在那天壹次、不超過上限、還完莊家仍在健康線以上；守恆", G => {
  const h = G.casHouseFix(G.casHouseNew(), D).house; h.bankroll = 500000000; h.debt.world = 300000000; const t0 = inv(G, h), w0 = h.world;
  G.casEconRun(h, D, ev([D, "houseRepay", 2, ""])); const room = Math.max(0, 500000000 - G.NUM.casino.health.low * 2), want = Math.min(300000000, Math.floor(room * G.NUM.casino.econEvent.repayPct[1] / 100));
  assert.strictEqual(h.ev.repaid, want); assert.strictEqual(h.debt.world, 300000000 - want); assert.strictEqual(h.world, w0 + want); assert.ok(h.bankroll >= G.NUM.casino.health.low); assert.strictEqual(inv(G, h), t0, "守恆");
  G.casEconRun(h, D, ev([D, "houseRepay", 2, ""])); assert.strictEqual(h.debt.world, 300000000 - want, "同壹天不重複");
  const poor = G.casHouseFix(G.casHouseNew(), D).house; poor.bankroll = G.NUM.casino.health.low; poor.debt.world = 5; G.casEconRun(poor, D, ev([D, "houseRepay", 3, ""])); assert.strictEqual(poor.debt.world, 5, "太少不還");
});
T("外資 NPC：出價機率和壹天總額乘（1＋pct%）", G => {
  const A = G.NUM.auction; A.npcJoinPct = 40; A.npcDay = 1e9;
  const h = G.casHouseFix(G.casHouseNew(), D).house; G.casArtHouse(h); const list = [{ id: "v", name: "白", kind: "visitor", route: { auction: 5 }, budget: { perDay: 9e9, max: 9e9 }, likes: [] }];
  let a = 0, b = 0; for (let i = 0; i < 400; i++) { const x = { id: "h~" + i, tier: 2, reserve: 1000, kind: "house" }; if (G.casAucNpcBid(x, 6000000, h, { npcList: list, secret: "s", day: D })) a++; if (G.casAucNpcBid(x, 6000000, h, { npcList: list, secret: "s", day: D, econ: { foreign: { pct: 30 } } })) b++; }
  assert.ok(b > a && b <= 400 * 0.4 * 1.3 + 40, `${a} → ${b}`);
});
console.log(`${pass} passed, ${fail} failed（劇情經濟事件）`);
process.exit(fail ? 1 : 0);
