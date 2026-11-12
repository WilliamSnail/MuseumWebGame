// 打怪的新玩法（docs/打怪玩法規劃.md）：node test/cellar_traits.test.cjs（npm test 也會跑）
// 怪物的九種個性、佩佩的顏色和組合、完美的招式用兩次、合作的新行動（引開、鼓舞、分膽、安慰、看清）、你適合、館方助手補位。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { G.setRng(G.mulberry32(5)); fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const LOW = () => 0, HIGH = () => 0.999999, MID = () => 0.3;
function seat(G, id, picks, o = {}) {
  const pepes = picks.map(p => { const key = G.pepeKey(G.fullPick(Object.assign({ 稀有度: "稀有", 心情: "俄國8+9", 顏色: "黃", 帽子: "沒有", 姿勢: "站著" }, p))); return { key, pick: G.fromKey(key), perfect: !!p.perfect, power: 0, down: false }; });
  return { id, name: id, helper: false, san: o.san || 60, brave: o.brave != null ? o.brave : 0, skills: Object.assign({ 偵查: 20, 神秘學: 20, 說服: 20 }, o.skills), pepes, used: {}, out: false, ghost: false, job: o.job || null };
}
const evOf = (r, t) => r.events.filter(e => e.t === t);
const aim = (G, f, kind, to) => { const foe = G.fightFoe(f.foe); const mv = foe.moves.find(m => m.kind === kind) || foe.moves[0]; f.intent = { move: mv.id, kind: mv.kind, to: to || null }; return mv; };

T("十五隻都有個性，個性的種類都認得、有字", G => {
  G.CELLAR_FOES.forEach(f => {
    assert.ok(f.trait && G.FIGHT_TRAIT_KINDS.includes(f.trait.kind), f.id);
    const t = G.fightTraitText(f.trait);
    assert.ok(t && t.name && t.text && !/undefined/.test(t.text), f.id + " 的字");
  });
});
T("殼很硬（f1a）：沒看穿之前推只有壹半；看穿之後恢復；按鈕上寫的範圍也是壹半", G => {
  const f = G.fightStart("f1a", [seat(G, "a", [{}, {}])]);
  const range = G.fightOptions(f, "a").find(o => o.act === "push");
  aim(G, f, "hit", "a"); G.setRng(LOW);
  let r = G.fightRound(f, { a: { act: "push" } });
  const e = evOf(r, "push")[0];
  assert.ok(e.shell, "有標殼");
  assert.ok(e.n >= range[0] || e.n >= range.lo);
  assert.ok(e.n <= range.hi);
  f.weak = true; aim(G, f, "hit", "a");
  r = G.fightRound(f, { a: { act: "push" } });
  assert.ok(!evOf(r, "push")[0].shell);
});
T("很硬（f2g）：每回合第壹下推少 n，第二下不少", G => {
  const f = G.fightStart("f2g", [seat(G, "a", [{}]), seat(G, "b", [{}])]);
  f.hp = f.hpMax = 999; aim(G, f, "hit", "a"); G.setRng(MID);
  const r = G.fightRound(f, { a: { act: "push" }, b: { act: "push" } });
  const ps = evOf(r, "push");
  assert.strictEqual(ps[0].thick, G.fightFoe("f2g").trait.n);
  assert.ok(!ps[1].thick);
});
T("看不出弱點（f2b）、很固執（f3a）：看穿、安撫的成功率比較低", G => {
  const s = seat(G, "a", [{ 顏色: "紅" }]);
  const f1 = G.fightStart("f2b", [s]);
  assert.strictEqual(G.fightSeeChance(f1.seats[0], f1), G.fightSeeChance(f1.seats[0]) - G.fightFoe("f2b").trait.mod);
  const f2 = G.fightStart("f3a", [seat(G, "a", [{ 顏色: "紅" }])]);
  assert.strictEqual(G.fightCalmChance(f2.seats[0], f2), G.fightCalmChance(f2.seats[0]) - G.fightFoe("f3a").trait.mod);
});
T("越來越多（f1g）：每 every 回合自己多 n（不超過上限）", G => {
  const f = G.fightStart("f1g", [seat(G, "a", [{}])]);
  const t = G.fightFoe("f1g").trait;
  f.hp = 50; f.hpMax = 100;
  let grew = 0;
  for (let i = 0; i < t.every; i++) { aim(G, f, "grow"); const r = G.fightRound(f, { a: { act: "guard" } }); grew += evOf(r, "trait").filter(e => e.kind === "grow").length; }
  assert.strictEqual(grew, 1);
});
T("會拿東西（f1b）：每 every 回合拿走壹個人還沒用的招式；按鈕寫「被拿走了」", G => {
  const f = G.fightStart("f1b", [seat(G, "a", [{ 帽子: "棒球帽" }])]);
  f.hp = f.hpMax = 999;
  let stole = null;
  for (let i = 0; i < 2; i++) { aim(G, f, "grow"); const r = G.fightRound(f, { a: { act: "guard" } }); stole = stole || evOf(r, "trait").find(e => e.kind === "steal"); }
  assert.ok(stole && stole.move === "cap");
  const o = G.fightOptions(f, "a").find(x => x.act === "cap");
  assert.ok(!o.ok && o.why === "被拿走了");
});
T("會記帳（f4g）：寫上壹個人，every 回合後重重打他；安撫成功塗掉", G => {
  let f = G.fightStart("f4g", [seat(G, "a", [{}, {}], { san: 60 })]);
  f.hp = f.hpMax = 999;
  aim(G, f, "grow");
  let r = G.fightRound(f, { a: { act: "guard" } });
  assert.ok(evOf(r, "trait").some(e => e.kind === "mark" && e.id === "a"));
  assert.ok(f.mark);
  let hit = null;
  for (let i = 0; i < 3 && !hit; i++) { aim(G, f, "grow"); r = G.fightRound(f, { a: { act: "guard" } }); hit = evOf(r, "trait").find(e => e.kind === "markHit"); }
  assert.ok(hit && hit.id === "a" && hit.san >= 2, "時間到重重打");
  // 安撫成功塗掉
  f = G.fightStart("f4g", [seat(G, "a", [{}], { skills: { 說服: 90 } })]);
  f.hp = f.hpMax = 999; f.mark = { id: "a", left: 2 };
  aim(G, f, "grow"); G.setRng(() => 0.15); // 0.05 會擲出 00（＝100，檢定不會過）
  r = G.fightRound(f, { a: { act: "calm" } });
  assert.ok(evOf(r, "trait").some(e => e.kind === "unmark"));
});
T("蓋著布（f2a）：只說要對誰；看不清楚（f5a）：前 n 回合什麼都不說；看清成功就看得到", G => {
  let f = G.fightStart("f2a", [seat(G, "a", [{}])]);
  aim(G, f, "hit", "a");
  assert.strictEqual(G.fightIntentHidden(f), "veil");
  assert.strictEqual(G.fightIntentText(f), "要對a做壹件事");
  assert.deepStrictEqual([G.fightIntentRisk(f).to, G.fightIntentRisk(f).san], ["a", null], "蓋著布：預告只給要對誰，不給扣多少");
  f = G.fightStart("f5a", [seat(G, "a", [{}], { skills: { 偵查: 90 } })]);
  aim(G, f, "hit", "a");
  assert.strictEqual(G.fightIntentHidden(f), "blur");
  assert.strictEqual(G.fightIntentText(f), "看不清楚牠要做什麼");
  assert.strictEqual(G.fightIntentRisk(f), null, "看不清楚：什麼都不預告");
  assert.ok(G.fightOptions(f, "a").find(o => o.act === "reveal").ok);
  f.hp = f.hpMax = 999; G.setRng(() => 0.15);
  const r = G.fightRound(f, { a: { act: "reveal" } });
  assert.ok(evOf(r, "reveal")[0].ok);
  assert.strictEqual(G.fightIntentHidden(f), null, "看清了：這回合看得到");
  // 看得到的時候不能看清
  const g = G.fightStart("f1a", [seat(G, "a", [{}])]);
  assert.ok(!G.fightOptions(g, "a").find(o => o.act === "reveal").ok);
});
T("顏色：紅推 +1、黃看穿 +10、黑被嚇少扣、綠回合結束回理智；全隊兩隻同色大家都有", G => {
  const F = G.NUM.fight;
  const red = G.fightStart("f2b", [seat(G, "a", [{ 顏色: "紅" }])], { noTrait: true }); // f2b 沒有顏色：佩佩的顏色不會跟牠同色多 1
  const yel = G.fightStart("f2b", [seat(G, "a", [{ 顏色: "黃" }])], { noTrait: true });
  assert.strictEqual(G.fightOptions(red, "a").find(o => o.act === "push").lo, G.fightOptions(yel, "a").find(o => o.act === "push").lo + F.color.red);
  assert.strictEqual(G.fightSeeChance(yel.seats[0], yel), G.fightSeeChance(yel.seats[0]) + F.color.yellow);
  // 綠
  const grn = G.fightStart("f1b", [seat(G, "a", [{ 顏色: "綠" }], { san: 40 })], { noTrait: true });
  grn.hp = grn.hpMax = 999; aim(G, grn, "grow");
  const r = G.fightRound(grn, { a: { act: "guard" } });
  assert.ok(evOf(r, "green").length && r.fx.a.gain >= F.color.green);
  // 全隊兩隻黑色：沒帶黑色的人也有
  const team = G.fightStart("f1a", [seat(G, "a", [{ 顏色: "黑" }]), seat(G, "b", [{ 顏色: "黑" }]), seat(G, "c", [{ 顏色: "紅" }])], { noTrait: true });
  assert.ok(G.fightHasColor(team, team.seats[2], "黑"));
  const solo = G.fightStart("f1a", [seat(G, "a", [{ 顏色: "黑" }]), seat(G, "c", [{ 顏色: "紅" }])], { noTrait: true });
  assert.ok(!G.fightHasColor(solo, solo.seats[1], "黑"), "只有壹隻：別人沒有");
});
T("湊到三種心情：全隊推 +1；完美的佩佩：招式可以用兩次", G => {
  const f = G.fightStart("f1a", [seat(G, "a", [{ 心情: "開心" }, { 心情: "傷心" }]), seat(G, "b", [{ 心情: "生氣" }])], { noTrait: true });
  assert.ok(f.moodCombo);
  const p = G.fightStart("f1a", [seat(G, "a", [{ 帽子: "棒球帽", perfect: true }])], { noTrait: true });
  p.hp = p.hpMax = 999;
  aim(G, p, "hit", "a"); G.fightRound(p, { a: { act: "cap" } });
  const o = G.fightOptions(p, "a").find(x => x.act === "cap");
  assert.ok(o.ok && o.left === 1, "還有壹次");
});
T("引開：牠點別人，改打引開的人，他算有擋", G => {
  const f = G.fightStart("f1b", [seat(G, "a", [{}, {}]), seat(G, "b", [{}])], { noTrait: true });
  f.hp = f.hpMax = 999; aim(G, f, "scare", "b"); G.setRng(HIGH);
  const r = G.fightRound(f, { a: { act: "taunt" }, b: { act: "push" } });
  const e = evOf(r, "foe")[0];
  assert.strictEqual(e.taunt, "a");
  assert.strictEqual(e.hit, "a");
  assert.ok(!r.fx.b || !r.fx.b.san, "b 沒被嚇");
  // 牠這招不是打壹個人：不能引開
  aim(G, f, "grow");
  assert.ok(!G.fightOptions(f, "a").find(o => o.act === "taunt").ok);
});
T("鼓舞：隊友這回合推 +inspire；分膽：膽量分壹半；安慰：隊友回理智", G => {
  const F = G.NUM.fight;
  const f = G.fightStart("f1b", [seat(G, "a", [{}], { brave: 6 }), seat(G, "b", [{}], { san: 30, brave: 0 })], { noTrait: true });
  f.hp = f.hpMax = 999; aim(G, f, "grow");
  const opt = G.fightOptions(f, "a");
  assert.strictEqual(opt.find(o => o.act === "inspire").for, "b");
  let r = G.fightRound(f, { a: { act: "inspire", for: "b" }, b: { act: "push" } });
  assert.strictEqual(evOf(r, "push").find(e => e.id === "b").inspired, F.inspire);
  aim(G, f, "grow");
  r = G.fightRound(f, { a: { act: "share", for: "b" }, b: { act: "guard" } });
  assert.strictEqual(evOf(r, "share")[0].n, 3);
  assert.strictEqual(f.seats[1].brave, 3);
  aim(G, f, "grow");
  const before = f.seats[1].san;
  r = G.fightRound(f, { a: { act: "comfort", for: "b" }, b: { act: "guard" } });
  assert.ok(f.seats[1].san > before && r.fx.b.gain >= 1);
});
T("你適合：黑色、斯拉夫蹲、抱枕職人是坦；綠色、毛帽是治療；什麼都沒有算輸出", G => {
  const f = G.fightStart("f1a", [seat(G, "a", [{ 顏色: "黑", 姿勢: "斯拉夫蹲" }], { job: "artisan" }), seat(G, "b", [{ 顏色: "綠", 帽子: "毛帽" }]), seat(G, "c", [{ 顏色: "白" }])], { noTrait: true });
  assert.strictEqual(f.seats[0].roles[0], "tank");
  assert.strictEqual(f.seats[1].roles[0], "healer");
  assert.ok(f.seats[2].roles.length >= 1);
});
T("館方助手補位：隊伍沒有坦、牠要打人的時候，助手引開", G => {
  const f = G.fightStart("f1a", [seat(G, "a", [{ 顏色: "紅" }]), G.fightHelperSeat([G.coopHelperItem(0), G.coopHelperItem(1)])], { noTrait: true });
  f.hp = f.hpMax = 999; aim(G, f, "hit", "a"); G.setRng(HIGH);
  const r = G.fightRound(f, { a: { act: "push" } });
  assert.strictEqual(evOf(r, "foe")[0].taunt, "helper");
});
T("每天的內容寫的怪物可以帶個性；個性寫錯會被擋", G => {
  const base = { id: "t1", name: "測試的箱子", intro: "測試用", floor: 1, hp: 30, moves: [{ id: "a", kind: "hit", text: "撲向{x}" }, { id: "b", kind: "grow", n: 3, text: "多壹點" }] };
  assert.deepStrictEqual(G.fightFoeCheck(Object.assign({}, base, { trait: { kind: "shell" } })).length, 0);
  assert.ok(G.fightFoeCheck(Object.assign({}, base, { trait: { kind: "飛天" } })).length > 0);
});

console.log(`cellar_traits：${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
