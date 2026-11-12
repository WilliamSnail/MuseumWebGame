// 每天新關卡的工具（tools/new_level.cjs）：node test/new_level.test.cjs（npm test 也會跑）
// 每一種打法、每一層做出來的那一塊都過檢查；少寫預告會說；調難度會往目標靠；今天的點放得進地圖、看得到等級看不到是誰。
const assert = require("assert");
const L = require("../tools/new_level.cjs");
const { G } = require("./sim_fight.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } finally { G.setRng(null); } };
const JS = x => JSON.parse(JSON.stringify(x));
const spec = o => Object.assign({ week: "2026-W47", day: 2, floor: 1, name: "沒人領的冬衣", intro: "袖子自己舉了起來。", mood: "傷心", color: "紅", style: "混合", hard: 2,
  texts: { hit: "要倒向{x}的佩佩", scare: "要把{x}包起來", grow: "箱子裡還有壹件", all: "整箱要翻過來" }, phase2: "箱子自己打開了。", card: ["外套沒有標價牌。"], line: "w47-count" }, o);

T("每一種打法 × 每一層：做出來的那一塊都過檢查，數字在每天的內容可以用的範圍裡", () => {
  Object.keys(L.STYLES).forEach(style => G.cellarFloors().forEach(floor => {
    const b = L.build(spec({ style, floor }));
    assert.deepStrictEqual(JS(G.fightDailyCheck(b, ["w47-count"])), [], `${style} B${floor}`);
    assert.strictEqual(!!b.foe.boss, style === "守門");
    assert.ok(b.foe.hp >= G.FIGHT_CUSTOM.hp[0] && b.foe.hp <= G.FIGHT_CUSTOM.hp[1]);
    assert.ok(G.fightStart(b.foe, [G.fightHelperSeat([]), { id: "a", name: "a", helper: false, san: 60, brave: 0, skills: {}, pepes: [{ key: "k", pick: G.fromKey(G.pepeKey(G.fullPick({}))), perfect: false, power: 0, down: false }], used: {}, out: false, ghost: false }]), `${style} B${floor} 要開得了`);
  }));
});
T("id 照週和天：同一週每天不會撞；跟內建的不會撞", () => {
  assert.strictEqual(L.build(spec({})).foe.id, "w47-d2-foe");
  assert.notStrictEqual(L.build(spec({ day: 3 })).foe.id, L.build(spec({ day: 2 })).foe.id);
  assert.ok(!G.fightFoe(L.build(spec({})).foe.id));
});
T("打法各有各的招：嚇人不會弄倒佩佩；撲人會；越來越多會回壓力；守門有第二階段", () => {
  const kinds = style => L.build(spec({ style })).foe.moves.map(m => m.kind);
  assert.ok(!kinds("嚇人").includes("hit") && L.byRounds(L.build(spec({ style: "嚇人" })).foe));
  assert.ok(kinds("撲人").includes("hit") && !L.byRounds(L.build(spec({ style: "撲人" })).foe));
  assert.ok(kinds("越來越多").includes("grow"));
  const boss = L.build(spec({ style: "守門" })).foe;
  assert.ok(boss.hp2 > 0 && boss.moves2.length >= 2 && boss.phase2);
  Object.values(L.STYLES).forEach(s => assert.ok(s.what && s.what.length > 10, "每種打法要有一句給排程看的說明"));
});
T("規格寫錯會說清楚：沒有這種打法、少寫預告、週和天不對", () => {
  assert.throws(() => L.build(spec({ style: "沒有這種" })), /style/);
  assert.throws(() => L.build(spec({ style: "撲人", texts: { scare: "要嚇{x}" } })), /hit/);
  assert.throws(() => L.build(spec({ week: "W47" })), /week/);
  assert.throws(() => L.build(spec({ day: 8 })), /day/);
  assert.throws(() => L.build(spec({ floor: 9 })), /這一層/);
  assert.ok(G.fightDailyCheck(L.build(spec({ name: "很長很長很長很長很長很長的名字" }))).length > 0);
  assert.ok(G.fightDailyCheck(L.build(spec({ card: [] }))).length > 0);
  assert.ok(G.fightDailyCheck(L.build(spec({})), ["別條線"]).length > 0, "line 要是這週的劇情線");
});
T("調難度：太硬的會被調軟、太軟的會被調硬（看回合的那種）", () => {
  const hard = L.build(spec({ style: "嚇人", texts: { scare: "要嚇{x}", all: "要嚇大家" } }));
  hard.foe.hp = G.FIGHT_CUSTOM.hp[1];
  const a = L.tune(hard, 1, 40);
  assert.strictEqual(a.by, "rounds");
  assert.ok(hard.foe.hp < G.FIGHT_CUSTOM.hp[1], "太硬要調軟");
  const soft = L.build(spec({ style: "嚇人", texts: { scare: "要嚇{x}", all: "要嚇大家" } }));
  soft.foe.hp = G.FIGHT_CUSTOM.hp[0];
  L.tune(soft, 3, 40);
  assert.ok(soft.foe.hp > G.FIGHT_CUSTOM.hp[0], "太軟要調硬");
  assert.deepStrictEqual(JS(G.fightDailyCheck(soft)), [], "調完還是過檢查");
});
T("今天的點放進地圖：中間那一排、上一排都走得到、走得到下一排；地圖還是沒問題；看得到等級看不到是誰", () => {
  const b = L.build(spec({ rank: 2 }));
  G.cellarFloors().forEach(floor => {
    const map = G.cmapOfDay(floor, "2026-11-17"), before = JSON.stringify(map);
    const m = G.cmapAddDaily(map, Object.assign({}, b, { floor }));
    assert.strictEqual(JSON.stringify(map), before, "不改原本的地圖");
    const node = m.rows.flat().find(n => n.daily);
    assert.ok(node && node.foe === b.foe.id && node.rank === 2);
    assert.deepStrictEqual(JS(G.cmapCheck(m)), []);
    const r = m.rows.findIndex(row => row.includes(node));
    assert.ok(r > 0 && r < m.rows.length - 1, "放在中間");
    m.rows[r - 1].forEach(n => assert.ok(m.links[n.id].includes(node.id)));
    assert.deepStrictEqual(JS(m.links[node.id]), JS(m.rows[r + 1].map(n => n.id)));
    const peek = G.cmapPeek(m, node.id);
    assert.ok(peek.daily && peek.rank === 2 && peek.mood === b.foe.mood && !("foe" in peek));
    assert.strictEqual(JSON.stringify(G.cmapAddDaily(m, Object.assign({}, b, { floor }))), JSON.stringify(m), "加兩次不會多一個");
  });
  const map = G.cmapOfDay(2, "2026-11-17");
  assert.strictEqual(G.cmapAddDaily(map, b), map, "不是這一層的不放");
  assert.strictEqual(G.cmapAddDaily(map, null), map);
});
T("報告：寫得出玩家在地圖上會看到什麼、該帶哪種心情的佩佩", () => {
  const out = L.report(L.build(spec({})), 10).join("\n");
  assert.ok(out.includes("開心"), "傷心的怪物要提示帶開心的");
  assert.ok(out.includes("看不到是誰"));
  assert.ok(!out.includes("{x}"));
});

console.log(`${pass} passed, ${fail} failed（每天新關卡的工具）`);
process.exit(fail ? 1 : 0);
