// 世界經濟 W3 分帳（決定 0086，shared/world.js 的 wu*）：node test/world_split.test.cjs（npm test 也會跑）
// 外面世界的錢（house.world）在帳上分成各單位、家計、公共：總和永遠等於 house.world；成長按權重分；新玩家補助從文化部出；單位名單跟 shared/world_roster.js 一致。
const assert = require("assert"), fs = require("fs"), path = require("path");
const { load } = require("./load_shared.cjs");
const pack = require("../tools/world_pack.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); G.NUM.casino.grants = []; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 3).join("\n    ")); } };
const D = "2026-11-16";
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
const mk = G => G.casHouseFix(G.casHouseNew(), D).house;

T("單位名單打包跟 content/world/units 一致、頂層比例加家計不超過 1", G => {
  assert.strictEqual(fs.readFileSync(path.join(__dirname, "..", "shared", "world_roster.js"), "utf8"), pack.source(pack.roster()), "shared/world_roster.js 沒跟上（跑 node tools/world_pack.cjs）");
  const r = G.wuRatios(); assert.ok(r.pub >= 0.1 - 1e-9, "公共至少 10%：" + r.pub); assert.ok(Math.abs(sum(r) - 1) < 1e-9, "比例加起來 1"); assert.strictEqual(r["u-household"], G.NUM.casino.worldDoc.household);
  assert.ok("u-culture" in r && "g-island" in r);
});
T("第一次分帳：照比例分外面世界的錢，總和 ＝ house.world；莊家一建就有 wu", G => {
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
const LIST = fs.readdirSync(path.join(__dirname, "..", "content", "npc")).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "content", "npc", f), "utf8")));
T("W4 NPC 來館花的錢從所屬集團出：byUnit 加起來 ＝ 花的總額、集團減少、家計出散客的、總和還是 house.world", G => {
  const h = mk(G), b0 = G.wuAmounts(h), w0 = h.world; G.casNpcSpend(h, D, "sec", LIST, null);
  const N = h.npcs, by = N.byUnit; assert.ok(by && Object.keys(by).length > 0, "有記每個單位出多少");
  const total = N.ticket + N.shop + N.crowd.ticket + N.crowd.shop; assert.strictEqual(sum(by), total, "byUnit 加起來 ＝ 花的總額"); assert.ok(total > 0);
  const a = G.wuAmounts(h); assert.strictEqual(sum(a), h.world); assert.strictEqual(w0 - h.world, total, "外面世界少的 ＝ 花的");
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
  assert.ok(G.nwPayday(h, MON, PEOPLE)); assert.ok(!G.nwPayday(h, MON, PEOPLE), "同一天不重複"); assert.strictEqual(h.world, w0, "發薪不動外面世界");
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
  assert.strictEqual(v("npcSan", "x", 10).band, "edge"); assert.strictEqual(v("npcSan", "x", 70).label, "穩定"); assert.strictEqual(v("unitUnrest", "x", 80).band, "turmoil"); assert.strictEqual(v("crowdMood", null, 90).band, "buzz"); assert.strictEqual(v("npcSan", "x", { npcw: {} }), null, "新的理智值還沒有資料");
  assert.strictEqual(v("不存在", "x", 1), null); assert.ok([v("npcSan", "x", 50), v("unitHealth", "x", 1)].every(x => x.pub === true && typeof x.hint === "string" && x.hint.length <= 20));
  const c = G.whCard(h, "2026-11-16"); assert.strictEqual(c.bands.reduce((a, b) => a + b, 0), 7, "財報卡的分布用同一個分級");
});
console.log(`世界分帳：${pass} 過，${fail} 沒過`); process.exit(fail ? 1 : 0);
