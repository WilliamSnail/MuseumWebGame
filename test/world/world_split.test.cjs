// 世界經濟 W3 分帳（決定 0086，shared/world/core.js 的 wu*）：node test/world/world_split.test.cjs（npm test 也會跑）
// 已知世界的錢（house.world）在帳上分成各單位、家計、公共：總和永遠等於 house.world；成長按權重分；新玩家補助從文化部出；單位名單跟 shared/world/roster.js 一致。
const assert = require("assert"), fs = require("fs"), path = require("path");
const { load } = require("../load_shared.cjs");
const pack = require("../../tools/content/world_pack.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); G.NUM.casino.govSweep.on = false; /* 決定 0140：政府撥款另外在 gov_sweep.test 測 */ G.NUM.casino.worldDoc.market.on = false; /* 景氣分市場另外在 world_market.test 測（決定 0121） */ G.NUM.casino.grants = []; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 3).join("\n    ")); } };
const D = "2026-11-16";
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
const mk = G => { G.NUM.casino.worldDoc.trade.on = false; /* 決定 0119 的交易另外在 world_trade.test 測 */ return G.casHouseFix(G.casHouseNew(), D).house; };

T("單位名單打包跟 content/world/units 一致、頂層比例加家計不超過 1", G => {
  assert.strictEqual(fs.readFileSync(path.join(__dirname, "..", "..", "shared", "world", "roster.js"), "utf8"), pack.source(pack.roster()), "shared/world/roster.js 沒跟上（跑 node tools/content/world_pack.cjs）");
  const r = G.wuRatios(); assert.ok(r.pub >= 0.1 - 1e-9, "公共至少 10%：" + r.pub); assert.ok(Math.abs(sum(r) - 1) < 1e-9, "比例加起來 1"); assert.strictEqual(r["u-household"], G.NUM.casino.worldDoc.household);
  assert.ok("u-culture" in r && "g-island" in r);
});
T("第一次分帳：照比例分已知世界的錢，總和 ＝ house.world；莊家一建就有 wu", G => {
  const h = mk(G); assert.ok(h.wu && h.wu.r); const a = G.wuAmounts(h); assert.strictEqual(sum(a), h.world);
  assert.strictEqual(a["g-daily"], Math.floor(h.world * G.wuRatios()["g-daily"])); assert.ok(a.pub >= 0);
});
T("池子進出（不指名）：每個單位照比例跟著變，總和還是 house.world", G => {
  const h = mk(G), before = G.wuAmounts(h), w0 = h.world;
  G.casHouseWorldOut(h, "npcFood", 123456789, G.NUM.casino.world); G.casHouseWorldIn(h, "bj", 1000003);
  const a = G.wuAmounts(h); assert.strictEqual(sum(a), h.world); assert.ok(h.world < w0);
  for (const id of Object.keys(before)) if (id !== "pub") assert.ok(Math.abs(a[id] / h.world - before[id] / w0) < 1e-6, id + " 比例沒變");
});
T("每天成長按權重分：景氣好時科技多拿、公共機構少拿；總和 ＝ house.world；b＝0 照比例", G => {
  const h = mk(G), a0 = G.wuAmounts(h), w0 = h.world; h.econ = { b: 0 };
  G.casWorldGrow(h, 10000000); G.wuGrow(h, 10000000); const a1 = G.wuAmounts(h); assert.strictEqual(sum(a1), h.world);
  const r = G.wuRatios(); assert.ok(Math.abs((a1["g-island"] - a0["g-island"]) - 10000000 * r["g-island"]) <= 2, "b＝0：照比例");
  const h2 = mk(G), c0 = G.wuAmounts(h2); h2.econ = { b: 1 }; G.casWorldGrow(h2, 10000000); G.wuGrow(h2, 10000000); const c1 = G.wuAmounts(h2); assert.strictEqual(sum(c1), h2.world);
  const gain = id => c1[id] - c0[id]; assert.ok(gain("g-island") / r["g-island"] > gain("g-public") / r["g-public"], "景氣好：科技（敏感）每一分比例拿得比公共機構多");
  const h3 = mk(G); h3.econ = { b: -1 }; const d0 = G.wuAmounts(h3); G.casWorldGrow(h3, 10000000); G.wuGrow(h3, 10000000); const d1 = G.wuAmounts(h3); assert.strictEqual(sum(d1), h3.world);
  assert.ok((d1["g-island"] - d0["g-island"]) / r["g-island"] < (d1["g-public"] - d0["g-public"]) / r["g-public"], "景氣差：科技拿得少");
});
T("新玩家補助從文化部出：文化部出、別的單位不動；總和不變；casCultureFund 實際接上了", G => {
  const h = mk(G), w = G.casWalletFix(null, D), S = G.NUM.casino.startChips, before = G.wuAmounts(h);
  assert.strictEqual(G.casCultureFund(w, h), S); const a = G.wuAmounts(h); assert.strictEqual(sum(a), h.world);
  assert.ok(a["u-culture"] < before["u-culture"], "文化部變少"); assert.ok(before["u-culture"] - a["u-culture"] >= S - 2, "文化部出了壹整份（它夠）：" + (before["u-culture"] - a["u-culture"]));
  for (const id of ["g-island", "g-daily", "g-finance"]) assert.ok(Math.abs(a[id] - before[id]) <= 2, id + " 沒有被動到");
});
T("文化部不夠時：它有多少出多少（不會變負），剩下的由公共出；別的單位不動；總和不變", G => {
  const h = mk(G), c0 = G.wuAmounts(h)["u-culture"], b0 = G.wuAmounts(h); h.world -= c0 * 2; const t = G.wuDebit(h, "u-culture", c0 * 2);
  assert.ok(t <= c0 + 2 && t >= c0 - 2, "出它有的：" + t + " vs " + c0); const a = G.wuAmounts(h); assert.ok(a["u-culture"] >= -2 && a["u-culture"] <= 2, "剛好用完：" + a["u-culture"]); assert.strictEqual(sum(a), h.world);
  for (const id of ["g-island", "g-daily"]) assert.ok(Math.abs(a[id] - b0[id]) <= 2, id + " 沒動"); assert.ok(a.pub < b0.pub, "公共出了剩下的");
});
T("很多次進出、成長、補助之後：總和永遠 ＝ house.world（取整數也對得上）", G => {
  const h = mk(G); h.econ = { b: 0.4 }; G.setRng(() => 0.37);
  for (let i = 0; i < 200; i++) {
    const n = 1000 + i * 7919; if (i % 3 === 0) { G.casWorldGrow(h, n); G.wuGrow(h, n); } else if (i % 3 === 1) G.casHouseWorldOut(h, "npcBj", n, G.NUM.casino.world); else { const got = G.casHouseWorldOut(h, "cultureStart", n, G.NUM.casino.world); G.wuDebit(h, "u-culture", got); }
    const a = G.wuAmounts(h); assert.strictEqual(sum(a), h.world, "第 " + i + " 次"); assert.ok(a.pub > -1000000, "公共沒有大幅變負");
  }
  G.setRng(null);
});
T("壞資料：wu 不見、r 壞掉都變回預設；不改 house.world", G => {
  const h = mk(G), w = h.world; delete h.wu; assert.strictEqual(sum(G.wuAmounts(h)), w); h.wu = { r: "x" }; assert.strictEqual(sum(G.wuAmounts(h)), w); assert.strictEqual(h.world, w);
  h.wu = { r: { "g-a": "abc", pub: 0.5 }, adj: { "g-a": "x" } }; assert.strictEqual(sum(G.wuAmounts(h)), w);
});
const LIST = fs.readdirSync(path.join(__dirname, "..", "..", "content", "npc")).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "content", "npc", f), "utf8")));
T("W4 NPC 來館花的錢從所屬集團出：byUnit 加起來 ＝ 花的總額、集團減少、家計出散客的、總和還是 house.world", G => {
  const h = mk(G), b0 = G.wuAmounts(h), w0 = h.world; G.casNpcSpend(h, D, "sec", LIST, null);
  const N = h.npcs, by = N.byUnit; assert.ok(by && Object.keys(by).length > 0, "有記每個單位出多少");
  const total = N.ticket + N.shop + N.crowd.ticket + N.crowd.shop; assert.strictEqual(sum(by), total, "byUnit 加起來 ＝ 花的總額"); assert.ok(total > 0);
  const a = G.wuAmounts(h); assert.strictEqual(sum(a), h.world); assert.strictEqual(w0 - h.world, total, "已知世界少的 ＝ 花的");
  assert.strictEqual(a["u-wallets"], G.nwTotal(h), "錢包在帳上的錢 ＝ 每位 NPC 錢包加起來"); assert.ok(a["u-wallets"] > 0, "NPC 有錢包");
  assert.ok(by["u-household"] > 0, "散客從家計出");
});
T("W4 沒有單位的 NPC（學生、退休）算家計；有單位的對到頂層集團", G => {
  assert.strictEqual(G.wuUnitOf({ kind: "student" }), "u-household"); assert.strictEqual(G.wuUnitOf(undefined), "u-household"); assert.strictEqual(G.wuUnitOf({ unit: "g-daily", title: "x" }), "g-daily"); assert.strictEqual(G.wuUnitOf({ unit: "不存在", title: "x" }), "u-household");
});
T("W4 集團的錢不夠就當天不花：把集團的份額清空，那個集團的 NPC 不花錢", G => {
  const h = mk(G), x = G.wuFix(h); x.adj["g-daily"] = -Math.floor(h.world * x.r["g-daily"]); assert.strictEqual(G.wuHave(h, "g-daily"), 0);
  G.casNpcSpend(h, D, "sec", LIST, null); assert.ok(!h.npcs.byUnit["g-daily"], "民生集團沒錢：不花"); assert.strictEqual(sum(G.wuAmounts(h)), h.world);
});
T("W5 健康值：景氣好的時候高、差的時候低；文化部固定、家計沒有；夾在 min～max", G => {
  const C = G.NUM.casino.worldDoc.health, mk2 = b => { const h = mk(G); h.econ = { b }; G.whTick(h, "2026-11-17", {}); return h; };
  const good = mk2(1), bad = mk2(-1), mid = mk2(0);
  assert.strictEqual(mid.wh.h["g-island"], 1); assert.ok(good.wh.h["g-island"] > 1 && bad.wh.h["g-island"] < 1, "科技對景氣敏感");
  assert.ok(Math.abs((bad.wh.h["g-island"] - 1) + 0.3) < 1e-6, "b＝−1、行業係數 0.3 → 0.7");
  assert.ok(bad.wh.h["g-public"] > 1, "公共機構是防禦型：景氣差 h 反而高"); assert.ok(!("u-culture" in bad.wh.h) && !("u-household" in bad.wh.h), "文化部、家計沒有 h");
  for (const id of Object.keys(bad.wh.h)) assert.ok(bad.wh.h[id] >= C.min && bad.wh.h[id] <= C.max);
  assert.strictEqual(G.whMult(bad, "u-culture"), 1); assert.strictEqual(G.whMult(bad, "u-household"), 1); assert.strictEqual(G.whMult(mk(G), "g-island"), 1, "還沒算過：倍率 1");
  assert.ok(!G.whTick(bad, "2026-11-17", {}), "同一天不重複");
});
T("W5 狀態：每週一換；連續 2 週緊縮、4 週裁員；回到 0.9 以上立刻恢復；倍率照狀態、有下限", G => {
  const C = G.NUM.casino.worldDoc.health, h = mk(G); h.econ = { b: -1 };
  const mon = ["2026-11-16", "2026-11-23", "2026-11-30", "2026-12-07", "2026-12-14"];
  const stateOn = d => { G.whTick(h, d, {}); return h.wh.st["g-island"].s; };
  assert.strictEqual(stateOn(mon[0]), "cut", "第一次 h＝0.7 ＜ 0.75，累計 1 週：減薪");
  assert.strictEqual(stateOn("2026-11-17"), "cut", "不是週一不換"); assert.strictEqual(stateOn(mon[1]), "squeeze", "連續 2 週：緊縮");
  assert.strictEqual(G.whMult(h, "g-island"), C.mult.squeeze); assert.strictEqual(stateOn(mon[2]), "squeeze"); assert.strictEqual(stateOn(mon[3]), "layoff", "連續 4 週：裁員");
  assert.strictEqual(G.whMult(h, "g-island"), C.mult.layoff); assert.ok(G.whMult(h, "g-island") >= C.floor);
  h.econ = { b: 0 }; assert.strictEqual(stateOn(mon[4]), "normal", "回到 0.9 以上：下一個週一就恢復"); assert.strictEqual(G.whMult(h, "g-island"), 1);
  assert.ok(h.wh.ev.some(e => e.unit === "g-island" && e.to === "layoff") && h.wh.ev.some(e => e.to === "normal"), "換過的記在 ev");
  assert.ok(G.whNews(h, mon[4], 1).some(e => /島上科技集團恢復正常了/.test(e.text)), "新聞只寫已發生的");
});
T("W5 NPC 預算倍率：集團減薪／緊縮時，那個集團的 NPC 花的比較少；別的集團不受影響；總和和守恆不變", G => {
  const run = st => { const h = mk(G); G.wuFix(h); G.whTick(h, "2026-11-15", {}); h.wh.st["g-arts"].s = st; G.casNpcSpend(h, D, "secW", LIST, null); return h; };
  const a = run("normal"), b = run("layoff"); assert.ok((b.npcs.byUnit["g-arts"] || 0) < (a.npcs.byUnit["g-arts"] || 1), "裁員：文化藝術集團的 NPC 花得少");
  assert.strictEqual(b.npcs.byUnit["g-daily"] || 0, a.npcs.byUnit["g-daily"] || 0, "別的集團不變");
  assert.strictEqual(sum(G.wuAmounts(b)), b.world);
});
T("W5 財報卡和日報：狀態分布、h 的分布不列每家；日報只寫已經發生的", G => {
  const h = mk(G); h.econ = { b: -1 }; G.whTick(h, "2026-11-16", {}); G.whTick(h, "2026-11-23", {}); G.whTick(h, "2026-11-30", {});
  const c = G.whCard(h, "2026-11-30"); assert.ok(c.states.squeeze >= 1 && c.bands.length === 4); assert.strictEqual(c.bands.reduce((x, y) => x + y, 0), 7); assert.ok(!JSON.stringify(c).includes("g-island"), "不列每家的數字");
  assert.ok(c.avgMult < 1 && c.avgMult >= G.NUM.casino.worldDoc.health.floor);
  const s = G.casBookSnap([], h, 0, "2026-11-30"); assert.ok(s.house.wh && s.house.wh.st["g-island"]);
});
T("W5 週漲跌：旗下股票漲 → 健康值加分、跌 → 扣分（最多 chgCap×stockW）", G => {
  const C = G.NUM.casino.worldDoc.health, h = mk(G); h.econ = { b: 0 }; const px = v => ({ islandforge: v, handbrain: v, bigassembly: v, trianglepower: v, linetower: v });
  for (let i = 0; i < 8; i++) G.whTick(h, "2026-11-" + String(9 + i).padStart(2, "0"), px(10000));
  G.whTick(h, "2026-11-17", px(13000)); assert.ok(Math.abs(h.wh.h["g-island"] - (1 + C.chgCap * C.stockW)) < 1e-6, "漲 30% 以上夾在 chgCap：" + h.wh.h["g-island"]);
  const h2 = mk(G); h2.econ = { b: 0 }; for (let i = 0; i < 8; i++) G.whTick(h2, "2026-11-" + String(9 + i).padStart(2, "0"), px(10000)); G.whTick(h2, "2026-11-17", px(9000)); assert.ok(h2.wh.h["g-island"] < 1 && h2.wh.h["g-island"] > 1 - C.chgCap * C.stockW - 1e-9);
});
const PEOPLE = LIST.filter(n => n.kind !== "trace");
const MON = "2026-11-16";
T("W6 發薪：錢包補到（今天預算 × targetDays）、從所屬集團出、世界總和不變、同一天不重複", G => {
  const h = mk(G), P = G.NUM.casino.npcSpend, C = G.NUM.casino.worldDoc.wallet, b0 = G.wuAmounts(h), w0 = h.world;
  assert.ok(G.nwPayday(h, MON, PEOPLE)); assert.ok(!G.nwPayday(h, MON, PEOPLE), "同一天不重複"); assert.strictEqual(h.world, w0, "發薪不動已知世界");
  const a = G.wuAmounts(h), bus = PEOPLE.find(n => n.id === "c-bus"), want = Math.floor(bus.budget.perDay * P.dayPct / 100) * C.targetDays;
  assert.strictEqual(G.nwBal(h, "c-bus"), want, "公車司機的錢包 ＝ 今天預算 × 2"); assert.strictEqual(sum(a), h.world); assert.strictEqual(a["u-wallets"], G.nwTotal(h));
  assert.strictEqual(b0["g-daily"] - a["g-daily"], PEOPLE.filter(n => n.job && n.job.unit === "g-daily" && n.budget && n.budget.perDay > 0).reduce((x, n) => x + Math.floor(n.budget.perDay * P.dayPct / 100) * C.targetDays, 0), "民生集團出的 ＝ 它的 NPC 的錢包");
  const day2 = "2026-11-17"; const before = G.nwTotal(h); G.nwPayday(h, day2, PEOPLE); assert.strictEqual(G.nwTotal(h), before, "沒花就不用再補");
});
T("W6 來館花錢從錢包出；錢包不夠就當天不花；沒有錢包（舊資料）照 W4 從集團出", G => {
  const h = mk(G); G.casNpcSpend(h, D, "secW6", LIST, null); assert.ok(h.npcw && h.npcw.day === D); const t = h.npcs.ticket + h.npcs.shop;
  assert.ok(t > 0 && sum(h.npcs.byUnit) === t + h.npcs.crowd.ticket + h.npcs.crowd.shop); assert.strictEqual(sum(G.wuAmounts(h)), h.world);
  const h2 = mk(G); G.NUM.casino.worldDoc.wallet.on = false; G.casNpcSpend(h2, D, "secW6", LIST, null); assert.ok(!h2.npcw || !h2.npcw.day, "關掉錢包：不發薪"); assert.ok(h2.npcs.byUnit && sum(h2.npcs.byUnit) > 0, "照 W4 從集團出"); assert.strictEqual(sum(G.wuAmounts(h2)), h2.world);
});
T("W6 錢包不會無限長也不會歸零：連續 90 天，每位 NPC 的錢包都在 [target/2, target]，總和不變", G => {
  const h = mk(G), P = G.NUM.casino.npcSpend, C = G.NUM.casino.worldDoc.wallet; G.setRng(() => 0.4);
  for (let i = 0; i < 90; i++) { const d = new Date(Date.parse(D + "T00:00:00Z") + i * 86400000).toISOString().slice(0, 10); if (i > 0) G.casHouseFix(h, d); G.casNpcSpend(h, d, "sec" + i, LIST, null); assert.strictEqual(sum(G.wuAmounts(h)), h.world, "第 " + i + " 天守恆"); }
  G.setRng(null);
  for (const n of PEOPLE.filter(x => x.budget && x.budget.perDay > 0)) { const target = Math.floor(n.budget.perDay * P.dayPct / 100) * C.targetDays, bal = G.nwBal(h, n.id); assert.ok(bal <= target + 1, n.id + " 不超過上限"); assert.ok(bal >= Math.floor(target / 2) - 1, n.id + " 不歸零：" + bal + " vs " + target); }
  assert.ok(G.wuAmounts(h).pub >= 0);
});
T("W6 沒有 W5 資料（house.wh 不存在）：不換工作、倍率 1、發薪照常", G => {
  const h = mk(G); delete h.wh; G.nwPayday(h, MON, PEOPLE); assert.ok(!h.npcw.ev.length && !Object.keys(h.npcw.job).length); assert.strictEqual(G.whMult(h, "g-island"), 1); assert.ok(G.nwTotal(h) > 0);
});
T("W6 換工作：集團進入裁員 → 部分 NPC 被裁；被裁的每週找新工作（只找景氣一般的）；滿 joinWeeks 週一定找到；原本集團恢復就回去；日報只寫已發生的", G => {
  const h = mk(G); G.whFix(h); for (const u of ["g-island", "g-overseas", "g-daily", "g-finance", "g-arts", "g-school", "g-public"]) h.wh.st[u] = { s: "normal", low: 0 }; h.wh.st["g-daily"].s = "layoff";
  const nm = id => (PEOPLE.find(n => n.id === id) || {}).name || id;
  G.nwPayday(h, MON, PEOPLE); const lay = Object.keys(h.npcw.lay); assert.ok(lay.length > 0 && lay.length < PEOPLE.filter(n => n.job && n.job.unit === "g-daily").length + 1, "民生集團有人被裁、不是全部：" + lay.length); assert.ok(lay.every(id => PEOPLE.find(n => n.id === id).job.unit === "g-daily"));
  assert.ok(G.nwNews(h, MON, nm).some(e => /被民生集團裁員了/.test(e.text)));
  let day = MON; for (let k = 0; k < 5; k++) { day = new Date(Date.parse(day + "T00:00:00Z") + 7 * 86400000).toISOString().slice(0, 10); G.nwPayday(h, day, PEOPLE); }
  assert.ok(lay.every(id => !(id in h.npcw.lay)), "第一週被裁的，5 週之後都找到新工作（滿 4 週一定；之後新被裁的另外算）"); const moved = Object.keys(h.npcw.job); assert.ok(lay.every(id => moved.includes(id)) && moved.every(id => h.npcw.job[id].unit !== "g-daily" && h.wh.st[h.npcw.job[id].unit].s === "normal"), "新工作在景氣一般的集團");
  const id = moved[0], n = PEOPLE.find(x => x.id === id); assert.strictEqual(G.nwUnitOf(h, n), h.npcw.job[id].unit, "之後算新的集團"); assert.ok(G.nwNews(h, day, nm, 40).some(e => /工作了/.test(e.text)));
  const h2 = mk(G); G.whFix(h2); for (const u of Object.keys(h2.wh.st)) h2.wh.st[u] = { s: "normal", low: 0 }; h2.wh.st["g-daily"].s = "layoff"; G.nwPayday(h2, MON, PEOPLE); const x = Object.keys(h2.npcw.lay)[0]; h2.wh.st["g-daily"].s = "normal"; G.nwPayday(h2, "2026-11-23", PEOPLE); assert.ok(!(x in h2.npcw.lay) && !(x in h2.npcw.job), "原本集團恢復：直接回去");
  assert.strictEqual(sum(G.wuAmounts(h)), h.world);
});
T("statView：分級只寫一處；健康值用「小於」跟 W5 換檔一致；沒有資料回 null；數字或莊家文件都能讀；理智三種的分級表先放著", G => {
  const C = G.NUM.casino.worldDoc.health, v = (k, id, d) => G.statView(k, id, d);
  assert.strictEqual(v("unitHealth", "x", C.squeeze).band, "weak", "剛好 0.75 ＝ 偏弱（跟 h ＜ squeeze 才緊縮一致）"); assert.strictEqual(v("unitHealth", "x", C.squeeze - 0.001).band, "tight"); assert.strictEqual(v("unitHealth", "x", 1.1).band, "strong"); assert.strictEqual(v("unitHealth", "x", 1).label, "普通");
  assert.strictEqual(G.statBandOf("unitHealth", 0.8), "weak"); assert.strictEqual(v("unitHealth", "g-island", null), null, "沒有資料");
  const h = mk(G); h.econ = { b: -1 }; G.whTick(h, "2026-11-16", {}); assert.strictEqual(v("unitHealth", "g-island", h).band, "tight"); assert.strictEqual(v("unitState", "g-island", h).label, "減薪"); assert.ok(v("budgetMult", "g-island", h).value < 1);
  assert.strictEqual(v("budgetMult", "x", 1.1).label, "多一點"); assert.strictEqual(v("budgetMult", "x", 0.3).label, "很省");
  assert.strictEqual(v("npcSan", "x", 10).band, "edge"); assert.strictEqual(v("npcSan", "x", 70).label, "穩定"); assert.strictEqual(v("unitUnrest", "x", 80).band, "turmoil"); assert.strictEqual(v("crowdMood", null, 90).band, "buzz"); assert.strictEqual(v("npcSan", "x", { npcw: {} }).value, 70, "沒有紀錄 ＝ 初始值 70"); assert.strictEqual(v("npcSan", "x", { npcw: { san: { x: 25 } } }).band, "uneasy"); assert.strictEqual(v("npcSan", "x", {}), null, "還沒有 npcw：沒有資料");
  assert.strictEqual(v("不存在", "x", 1), null); assert.ok([v("npcSan", "x", 50), v("unitHealth", "x", 1)].every(x => x.pub === true && typeof x.hint === "string" && x.hint.length <= 20));
  const c = G.whCard(h, "2026-11-16"); assert.strictEqual(c.bands.reduce((a, b) => a + b, 0), 7, "財報卡的分布用同一個分級");
});
T("理智（決定 0090）：每天收盤照行程加減；去地下 −2（一天最多 −4）、去餐車 +1、沒來 +3；往 70 靠；被裁 −8、新工作 +5；夾 0～100、一天最多 ±10；同一天不重複", G => {
  const h = mk(G), S = G.NUM.casino.worldDoc.san, ppl = [{ id: "v-a" }, { id: "v-b" }, { id: "v-c" }, { id: "v-d" }]; G.nwFix(h);
  assert.strictEqual(G.nwSan(h, "v-a"), S.start, "預設 70");
  assert.ok(G.nwSanDay(h, "2026-11-16", [{ id: "v-a", place: "cellar" }, { id: "v-a", place: "cellar" }, { id: "v-a", place: "cellar" }, { id: "v-b", place: "food" }, { id: "v-c", place: "hall" }], ppl));
  assert.strictEqual(G.nwSan(h, "v-a"), 70 + S.cellarMax + S.back, "去 3 次地下：最多 −4，再往 70 靠 1"); assert.strictEqual(G.nwSan(h, "v-b"), 70, "去餐車：已經是初始值，不補過頭"); assert.strictEqual(G.nwSan(h, "v-c"), 70, "去展廳：不變"); assert.strictEqual(G.nwSan(h, "v-d"), 70, "沒來：已經是初始值，不補過頭");
  h.npcw.san["v-b"] = 50; h.npcw.san["v-d"] = 50; G.nwSanDay(h, "2026-11-16b".slice(0, 10), [], ppl); // 同一天不重複，所以不會動
  assert.strictEqual(G.nwSan(h, "v-b"), 50, "同一天不重複");
  assert.ok(!G.nwSanDay(h, "2026-11-16", [], ppl), "同一天不重複"); h.npcw.san["v-b"] = 60; h.npcw.san["v-d"] = 60; G.nwSanDay(h, "2026-11-20", [{ id: "v-b", place: "food" }], ppl); assert.strictEqual(G.nwSan(h, "v-b"), 62, "理智 60：去餐車 +1，再往 70 靠 1"); assert.strictEqual(G.nwSan(h, "v-d"), 64, "理智 60：沒來 +3，再往 70 靠 1");
  h.npcw.san["v-a"] = 67; h.npcw.ev.push({ day: "2026-11-21", npc: "v-a", from: "g-daily", to: null, t: "lay" }); G.nwSanDay(h, "2026-11-21", [{ id: "v-a", place: "hall" }], ppl); assert.strictEqual(G.nwSan(h, "v-a"), 67 + S.back + S.lay, "被裁 −8，再往 70 靠 1");
  h.npcw.san["v-b"] = 99; G.nwSanDay(h, "2026-11-22", [{ id: "v-b", place: "food" }], ppl); assert.ok(G.nwSan(h, "v-b") <= 100);
  h.npcw.san["v-d"] = 2; G.nwSanDay(h, "2026-11-23", [{ id: "v-d", place: "cellar" }, { id: "v-d", place: "cellar" }], ppl); assert.ok(G.nwSan(h, "v-d") >= 0, "不低於 0");
  const pubv = JSON.parse(JSON.stringify(G.nwSanPublic(h))); assert.deepStrictEqual(pubv["v-a"], [G.nwSan(h, "v-a"), G.statBandOf("npcSan", G.nwSan(h, "v-a"))]);
});
T("理智低的影響：不去地下、評價少 1 顆星、預算 ×0.9（不低於下限）；理智正常時什麼都不變", G => {
  const S = G.NUM.casino.worldDoc.san, add = d => new Date(Date.parse(D + "T00:00:00Z") + d * 86400000).toISOString().slice(0, 10);
  const run = san => { const h = mk(G); G.nwFix(h); let cellar = 0, spent = 0; for (let i = 0; i < 6; i++) { const d = add(i); for (const n of PEOPLE) h.npcw.san[n.id] = san; G.casNpcSpend(h, d, "secSan", LIST, null); const b = h.npcs.shopBy.cellar; cellar += b ? b.npc : 0; spent += h.npcs.shop + h.npcs.ticket; } h.__cellar = cellar; h.__spent = spent; return h; };
  const ok = run(70), low = run(10);
  assert.ok(low.__cellar === 0 && ok.__cellar > 0, "理智 10：地下收藏庫沒有 NPC 花錢；正常的有（" + low.__cellar + " vs " + ok.__cellar + "）");
  assert.ok(low.__spent < ok.__spent, "理智低：花的比較少");
  const me = { id: "c-bus", budget: { perDay: 100 } }; assert.strictEqual(G.nwBudgetMult(mk(G), me, "g-daily"), 1); const hl = mk(G); G.nwFix(hl); hl.npcw.san["c-bus"] = S.lowBudget - 1; assert.strictEqual(G.nwBudgetMult(hl, me, "g-daily"), S.budgetMult);
  const stars = h => (h.reviews || []).map(r => r.stars); assert.ok(Math.max(...stars(ok), 0) >= 1); if (stars(low).length && stars(ok).length) assert.ok(Math.min(...stars(low)) <= Math.min(...stars(ok)) && stars(low).every(x => x >= 1), "評價星數少一顆、不低於 1");
  assert.strictEqual(G.statView("npcSan", "c-bus", hl).band, "uneasy");
});
T("集體不安（決定 0091）：換狀態那天推一下、每天往 20 靠 2（慣性）、排程填的事件推得動、夾 0～100；沒有的單位擋掉", G => {
  const U = G.NUM.casino.worldDoc.unrest, h = mk(G); h.econ = { b: -1 };
  assert.strictEqual(G.whUnrest(h, "g-island"), U.start, "沒有紀錄 ＝ 平常的值");
  G.whTick(h, "2026-11-16", {}); G.whTick(h, "2026-11-23", {}); assert.strictEqual(h.wh.st["g-island"].s, "squeeze"); assert.ok(G.whUnrest(h, "g-island") > U.start, "進入緊縮：不安上升：" + G.whUnrest(h, "g-island"));
  const peak = G.whUnrest(h, "g-island"); h.econ = { b: 0 }; G.whTick(h, "2026-11-24", {}); assert.ok(G.whUnrest(h, "g-island") < peak, "隔天往平常靠一點（慣性：不是馬上回來）"); assert.ok(G.whUnrest(h, "g-island") > U.start);
  for (let d = 25; d < 30; d++) G.whTick(h, "2026-11-" + d, {}); assert.strictEqual(G.whUnrest(h, "g-island"), U.start, "幾天後回到平常");
  assert.strictEqual(G.whUnrestAdd(h, "g-daily", 50), U.start + 50); assert.strictEqual(G.whUnrestAdd(h, "g-daily", 999), 100, "夾 100"); assert.strictEqual(G.whUnrestAdd(h, "g-daily", -999), 0, "夾 0"); assert.strictEqual(G.whUnrestAdd(h, "u-culture", 5), null, "文化部、不存在的單位不放"); assert.strictEqual(G.whUnrestAdd(h, "g-zz", 5), null);
  assert.strictEqual(G.statView("unitUnrest", "g-island", h).band, "calm"); G.whUnrestAdd(h, "g-island", 40); assert.strictEqual(G.statView("unitUnrest", "g-island", h).band, "uneasy");
});
T("集體不安拖慢旗下 NPC 理智的回復：≥60 停下來、≥80 反過來每天 −1；平常照回", G => {
  const S = G.NUM.casino.worldDoc.san, run = unrest => { const h = mk(G); G.whFix(h); G.nwFix(h); h.wh.unrest["g-daily"] = unrest; h.npcw.san["c-bus"] = 50; G.nwSanDay(h, "2026-11-16", [{ id: "c-bus", place: "hall" }], [{ id: "c-bus", job: { unit: "g-daily", title: "x" }, budget: { perDay: 1 } }]); return G.nwSan(h, "c-bus"); };
  assert.strictEqual(run(20), 50 + S.back, "平常：往 70 靠 1"); assert.strictEqual(run(60), 50, "不安 60：不回復"); assert.strictEqual(run(85), 50 - S.back, "不安 85：反過來往下");
});
T("散客展廳氣氛（決定 0091）：每天重算、不動錢；景氣、NPC 平均理智、減薪集團、週末都會改變它；夾 0～100", G => {
  const M = G.NUM.casino.worldDoc.mood, h = mk(G); h.econ = { b: 0 }; G.whFix(h);
  assert.strictEqual(G.whMood(h, "2026-11-17"), M.base, "平日、景氣 0、沒有人不安：50"); assert.strictEqual(G.whMood(h, "2026-11-21"), M.base + M.weekend, "週末 +5");
  h.econ = { b: 1 }; assert.strictEqual(G.whMood(h, "2026-11-17"), M.base + M.b); h.econ = { b: 0 };
  G.nwFix(h); for (const id of ["a", "b", "c", "d"]) h.npcw.bal[id] = 1; h.npcw.san.a = 30; assert.strictEqual(G.whMood(h, "2026-11-17"), Math.round(M.base + M.san * (-40 / 4)), "NPC 平均理智低：氣氛低");
  const h2 = mk(G); h2.econ = { b: 0 }; G.whFix(h2); h2.wh.st["g-island"].s = "layoff"; h2.wh.st["g-daily"].s = "cut"; assert.strictEqual(G.whMood(h2, "2026-11-17"), M.base + 2 * M.trouble, "兩個集團減薪以上：−10");
  const h3 = mk(G); h3.econ = { b: -1 }; G.whFix(h3); for (const k of Object.keys(h3.wh.st)) h3.wh.st[k].s = "layoff"; assert.ok(G.whMood(h3, "2026-11-17") >= 0);
  const h4 = mk(G); h4.econ = { b: 0 }; G.whTick(h4, "2026-11-17", {}); assert.strictEqual(h4.wh.mood.v, M.base); assert.strictEqual(JSON.stringify(G.whMoodPublic(h4)), JSON.stringify([M.base, "plain"])); assert.strictEqual(G.whMoodPublic(mk(G)), null);
  assert.strictEqual(G.statView("crowdMood", null, h4).band, "plain");
  const c = G.whCard(h4, "2026-11-17"); assert.strictEqual(c.unrestBands.reduce((a, b) => a + b, 0), 7); assert.strictEqual(c.mood.band, "plain");
  const snap = G.casBookSnap([], h4, 0, "2026-11-17"); assert.strictEqual(snap.house.wh.mood, M.base); assert.ok("g-island" in snap.house.wh.un);
});
T("世界事件（決定 0092）：排程填的集團不安、NPC 理智、展廳氣氛；壞消息推不安（一個集團一天一次）；隔了幾天沒人來也不漏；上限夾住", G => {
  const EV = G.NUM.casino.worldDoc.events, U = G.NUM.casino.worldDoc.unrest;
  G.WORLD_EVENTS["2026-12-01"] = { unrest: { "g-daily": 10 }, mood: -10, san: { "c-bus": -6 } }; G.WORLD_EVENTS["2026-12-02"] = { unrest: { "g-finance": 99 }, down: ["islandforge", "handbrain"] };
  const h = mk(G); h.econ = { b: 0 }; G.whTick(h, "2026-11-30", {}); 
  G.whTick(h, "2026-12-01", {}); assert.strictEqual(G.whUnrest(h, "g-daily"), U.start + 10, "排程填的集團不安"); assert.strictEqual(h.wh.mood.v, G.NUM.casino.worldDoc.mood.base - 10, "氣氛含排程的 −10（平日、景氣 0）");
  G.whTick(h, "2026-12-02", {}); assert.strictEqual(G.whUnrest(h, "g-finance"), U.start + EV.unrestMax, "排程的 99 被夾到 unrestMax");
  assert.strictEqual(G.whUnrest(h, "g-island"), U.start + EV.downPush, "壞消息：旗下兩支股票都 down，這個集團只推一次");
  const h2 = mk(G); h2.econ = { b: 0 }; G.whTick(h2, "2026-11-30", {}); G.whTick(h2, "2026-12-03", {}); assert.ok(G.whUnrest(h2, "g-daily") > U.start - 1 && G.whUnrest(h2, "g-finance") >= U.start, "隔了 3 天才來：12-01、12-02 的事件也套用（再經過每天回落）"); assert.ok(G.whUnrest(h2, "g-island") >= U.start);
  const h3 = mk(G); G.nwFix(h3); G.nwSanDay(h3, "2026-12-01", [], [{ id: "c-bus" }]); assert.strictEqual(G.nwSan(h3, "c-bus"), 70 - 6, "NPC 理智套用排程的 −6");
  delete G.WORLD_EVENTS["2026-12-01"]; delete G.WORLD_EVENTS["2026-12-02"];
});
T("散客類型權重（決定 0092 第 3 件）：氣氛高多旅行團和家庭、低多獨自和朋友；組數、時間、停留不變；沒有氣氛或在中間 ＝ 跟以前一模一樣；人數期望值變動在 ±20% 內", G => {
  const C = G.NUM.casino.worldDoc.crowd, K = G.CROWD_KINDS, lab = l => K.findIndex(k => k.label === l);
  assert.ok(G.crowdKindWeights(null).every(x => x === 1) && G.crowdKindWeights(45).every(x => x === 1), "沒有或在中間：全是 1");
  assert.strictEqual(G.crowdKindWeights(C.high)[lab("旅行團")], 1.3); assert.strictEqual(G.crowdKindWeights(C.low)[lab("獨自看展的人")], 2); assert.strictEqual(G.crowdKindWeights(C.low)[lab("旅行團")], 0.7);
  const ev = m => { const w = G.crowdKindWeights(m), t = w.reduce((a, b) => a + b, 0); return K.reduce((a, k, j) => a + w[j] / t * (k.n[0] + k.n[1]) / 2, 0); }, base = ev(null);
  assert.ok(Math.abs(ev(80) / base - 1) <= 0.2 && Math.abs(ev(10) / base - 1) <= 0.2, "人數期望值 ±20% 內：" + (ev(80) / base).toFixed(3) + "、" + (ev(10) / base).toFixed(3));
  const day = "2026-12-05", sec = "cwsec", a = G.crowdVisitsToday(day, sec), b = G.crowdVisitsToday(day, sec, 45), hi = G.crowdVisitsToday(day, sec, 80), lo = G.crowdVisitsToday(day, sec, 10);
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b), "平常的氣氛：跟沒給壹模壹樣"); assert.strictEqual(a.length, hi.length); assert.strictEqual(JSON.stringify(a.map(x => [x.key, x.start, x.end])), JSON.stringify(hi.map(x => [x.key, x.start, x.end])), "組數、時間不變");
  let tour = [0, 0, 0], solo = [0, 0, 0], people = [0, 0, 0];
  for (let d = 0; d < 60; d++) { const dd = new Date(Date.parse(day + "T00:00:00Z") + d * 86400000).toISOString().slice(0, 10); [null, 80, 10].forEach((m, j) => { for (const g of G.crowdVisitsToday(dd, "s" + d, m)) { if (g.label === "旅行團") tour[j]++; if (g.label === "獨自看展的人") solo[j]++; people[j] += g.n; } }); }
  assert.ok(tour[1] > tour[0] && tour[2] < tour[0], "氣氛高：旅行團多；低：少（" + tour + "）"); assert.ok(solo[2] > solo[0], "氣氛低：獨自多（" + solo + "）"); assert.ok(Math.abs(people[1] / people[0] - 1) <= 0.2 && Math.abs(people[2] / people[0] - 1) <= 0.2, "實際人數也在 ±20%：" + people);
});
T("散客類型權重：展廳時刻表、現在誰在場、結算（casNpcLive）用同一份；換日前後同一個氣氛；人數多寡不破守恆、門票不超過上限", G => {
  const M = "2026-11-30", D1 = "2026-12-01", h = mk(G); h.econ = { b: 0 }; G.whTick(h, M, {});
  assert.strictEqual(G.whCrowdMood(h, D1), h.wh.mood.v, "還沒換日：用昨天的氣氛（現在的）"); const before = G.whCrowdMood(h, D1); G.whTick(h, D1, {}); assert.strictEqual(G.whCrowdMood(h, D1), before, "換日之後：用昨天的（prev），同一個數字");
  assert.strictEqual(G.whCrowdMood(h, "2026-12-09"), null, "隔太久：照平常"); assert.strictEqual(G.whCrowdMood(mk(G), D1), null, "還沒算過：照平常");
  const run = mood => { const x = mk(G); x.econ = { b: 0 }; G.whFix(x); x.wh.mood = { day: M, v: mood, prev: null }; const w0 = x.world; G.casNpcSpend(x, D1, "cwsec2", LIST, null); return { x, w0, feed: G.hallFeed(D1, "cwsec2", LIST, null, 0, Infinity, G.whCrowdMood(x, D1)) }; };
  const hi = run(90), lo = run(5), mid = run(50);
  const ppl = r => r.x.npcs.crowd.people; assert.ok(ppl(hi) !== ppl(lo) || ppl(hi) !== ppl(mid), "不同氣氛：實際來的人不一樣（" + [ppl(hi), ppl(mid), ppl(lo)] + "）");
  for (const r of [hi, lo, mid]) { assert.strictEqual(sum(G.wuAmounts(r.x)), r.x.world); assert.ok(r.x.npcs.crowd.ticket <= G.NUM.casino.npcSpend.crowd.dayCap, "散客門票不超過上限"); assert.strictEqual(r.feed.filter(e => e.kind === "crowd").reduce((a, e) => a + e.n, 0), ppl(r), "展廳時刻表的人數 ＝ 結算的人數"); }
});
console.log(`世界分帳：${pass} 過，${fail} 沒過`); process.exit(fail ? 1 : 0);
