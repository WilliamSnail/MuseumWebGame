// 地下室改版：打怪物的規則、每層的小地圖（決定 0067）：node test/cellar_fight.test.cjs（npm test 也會跑）
// 數字讀 NUM、CELLAR_FOES，不寫死。骰子固定（setRng）；怪物的下一招直接指定（fight.intent），不靠抽的。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } finally { G.setRng(null); } };
const LOW = () => 0, HIGH = () => 0.999999, MID = () => 0.3; // LOW：骰子最小（但 d100 的 00 是 100，檢定不會過）；HIGH：骰子最大；MID：d100 擲三十幾，技能高的會過
const JS = x => JSON.parse(JSON.stringify(x));
const same = (a, b, m) => assert.deepStrictEqual(JS(a), JS(b), m); // 規則在另一個 vm 裡跑，陣列要先轉過才比得了（docs/踩過的坑.md）
// 一個座位：picks ＝帶的佩佩（只寫要的欄位），skills ＝偵查、神秘學、說服
function seat(G, id, picks, skills = {}, san = 60) {
  const pepes = picks.map(p => { const key = G.pepeKey(G.fullPick(Object.assign({ 稀有度: "稀有", 心情: "俄國8+9", 顏色: "黃", 帽子: "沒有", 姿勢: "站著" }, p))); return { key, pick: G.fromKey(key), perfect: false, power: 0, down: false }; });
  return { id, name: id, helper: false, san, skills: Object.assign({ 偵查: 20, 神秘學: 20, 說服: 20 }, skills), pepes, used: {}, out: false, ghost: false };
}
const helper = (G, n = 1) => G.fightHelperSeat(Array.from({ length: n }, (_, i) => G.coopHelperItem(i)));
const FOE = "f1b"; // 沒有心情、顏色是紅：預設的佩佩（俄國8+9、黃）不剋也不被剋
const start = (G, seats, o) => G.fightStart(FOE, seats, o);
const aim = (G, f, moveId, to) => { const mv = G.fightFoe(f.foe).moves.concat(G.fightFoe(f.foe).moves2 || []).find(m => m.id === moveId); f.intent = { move: mv.id, kind: mv.kind, to: to || null }; return mv; };
const evOf = (r, t) => r.events.filter(e => e.t === t);

T("數字和內容：五層各有至少兩隻一般的、一隻守門；每一招都有字；守門有第二階段", G => {
  const F = G.NUM.fight;
  assert.ok(F.baseTeam >= 1 && F.weakMult > 1 && F.maxRounds >= 6 && F.guardDodge > 0 && F.guardDodge < 1 && F.injure >= 0 && F.injure <= 1);
  G.cellarFloors().forEach(n => {
    assert.ok(G.fightFoesOf(n).length >= 2, `B${n} 一般的怪物不夠`);
    assert.strictEqual(G.fightFoesOf(n, true).length, 1, `B${n} 要剛好一隻守門`);
  });
  const ids = new Set();
  G.CELLAR_FOES.forEach(f => {
    assert.ok(!ids.has(f.id)); ids.add(f.id);
    const text = G.FOE_TEXT[f.id];
    assert.ok(text && text.name && text.intro, f.id + " 沒有名字");
    assert.ok(f.hp > 0 && f.moves.length >= 2);
    f.moves.concat(f.moves2 || []).forEach(m => {
      assert.ok(["hit", "scare", "all", "grow"].includes(m.kind), f.id + " 的招不認得");
      assert.ok(text.moves[m.id], `${f.id} 的 ${m.id} 沒有字`);
      if (m.kind === "scare" || m.kind === "all") assert.ok(G.maxExpr(m.san) >= 1);
      if (m.kind === "grow") assert.ok(m.n > 0);
      if (m.kind === "hit" || m.kind === "scare") assert.ok(text.moves[m.id].includes("{x}"), `${f.id} 的 ${m.id} 要寫點到誰`);
    });
    if (f.boss) assert.ok(f.hp2 > 0 && f.moves2.length >= 2 && text.phase2, f.id + " 守門要有第二階段");
    assert.ok(!/蛙|Pepe|pepe/.test(JSON.stringify(text)), "怪物不是青蛙（界線）");
  });
});
T("壓力照隊伍放大：3 隻 1 個人＝基本；隻數、人數、理智壓力越多越高", G => {
  const F = G.NUM.fight, base = G.fightFoe(FOE).hp;
  assert.strictEqual(G.fightHp(base, F.baseTeam, 1, 0), base);
  assert.ok(G.fightHp(base, 6, 1, 0) > G.fightHp(base, 3, 1, 0));
  assert.ok(G.fightHp(base, 4, 4, 0) > G.fightHp(base, 4, 2, 0));
  assert.strictEqual(G.fightHp(base, 3, 1, 2) - G.fightHp(base, 3, 1, 0), F.pressureHp * 2);
});
T("開打：沒有真人、不認得的怪物開不了；強度照相剋算（剋到怪物心情的兩倍）", G => {
  assert.strictEqual(G.fightStart("沒有這隻", [seat(G, "a", [{}])]), null);
  assert.strictEqual(G.fightStart(FOE, [helper(G)]), null);
  const foe = G.fightFoe("f1a"); // 傷心：開心剋傷心
  const f = G.fightStart("f1a", [seat(G, "a", [{ 心情: "開心" }, { 心情: "俄國8+9" }])]);
  assert.strictEqual(f.seats[0].pepes[0].power, G.memberPower(f.seats[0].pepes[0], foe));
  assert.ok(f.seats[0].pepes[0].power >= f.seats[0].pepes[1].power * 2 - 1);
  assert.ok(f.intent && f.hp === f.hpMax && f.round === 1 && !f.over);
});
T("推：扣的壓力＝自己還站著的佩佩的強度＋骰子；按鈕上寫的範圍包得住真的結果", G => {
  for (const rng of [LOW, HIGH]) {
    G.setRng(rng);
    const f = start(G, [seat(G, "a", [{}, {}])]);
    aim(G, f, "pile");
    const opt = G.fightOptions(f, "a").find(o => o.act === "push"), hp0 = f.hp;
    const r = G.fightRound(f, { a: { act: "push" } });
    const e = evOf(r, "push")[0];
    assert.strictEqual(e.n, G.fightPower(f.seats[0]) + e.die);
    assert.ok(e.n >= opt.lo && e.n <= opt.hi, "範圍要包住結果");
    assert.ok(f.hp <= hp0 - e.n + G.fightFoe(FOE).moves.find(m => m.id === "pile").n);
  }
});
T("看穿：成功之後「推」乘 weakMult，同一回合隊友的推就算；館方助手的不算；找到了不能再看穿", G => {
  const F = G.NUM.fight;
  G.setRng(MID);
  const f = start(G, [seat(G, "a", [{}], { 偵查: 99 }), seat(G, "b", [{}]), helper(G)]);
  aim(G, f, "pile");
  const r = G.fightRound(f, { a: { act: "see" }, b: { act: "push" } });
  assert.ok(evOf(r, "see")[0].ok && f.weak);
  const pb = evOf(r, "push").find(e => e.id === "b"), ph = evOf(r, "push").find(e => e.id === "helper");
  assert.strictEqual(pb.n, Math.round((G.fightPower(f.seats[1]) + pb.die) * F.weakMult));
  assert.ok(pb.weak && !ph.weak);
  assert.strictEqual(ph.n, G.fightPower(f.seats[2]) + ph.die);
  same(r.fx.a.ticks, ["偵查"]);
  assert.ok(!G.fightOptions(f, "a").find(o => o.act === "see").ok);
});
T("看穿沒過：沒有加成，也不記技能", G => {
  G.setRng(HIGH);
  const f = start(G, [seat(G, "a", [{}])]);
  aim(G, f, "pile");
  const r = G.fightRound(f, { a: { act: "see" } });
  assert.ok(!evOf(r, "see")[0].ok && !f.weak);
  assert.ok(!r.fx.a || !r.fx.a.ticks.length);
});
T("安撫：一個人成功，怪物這一招取消；四個人只有一個成功是變弱（理智減半、進位）", G => {
  G.setRng(MID);
  let f = start(G, [seat(G, "a", [{}], { 說服: 99 })]);
  const mv = aim(G, f, "cling", "a");
  let r = G.fightRound(f, { a: { act: "calm" } });
  assert.ok(evOf(r, "foe")[0].cancel);
  assert.ok(!r.fx.a.san);
  same(r.fx.a.ticks, ["說服"]);
  // 四個人
  f = start(G, ["a", "b", "c", "d"].map(id => seat(G, id, [{}], id === "a" ? { 說服: 99 } : {})));
  f.hp = f.hpMax = 9999;
  aim(G, f, "cling", "b");
  r = G.fightRound(f, { a: { act: "calm" }, b: { act: "push" }, c: { act: "push" }, d: { act: "push" } });
  const foe = evOf(r, "foe")[0];
  assert.ok(evOf(r, "calm")[0].ok && foe.soft && !foe.cancel);
  assert.ok(foe.san >= 1 && foe.san <= Math.ceil(G.maxExpr(mv.san) / 2));
  assert.strictEqual(r.fx.b.san, foe.san);
});
T("擋：理智類的招減半（進位）；幫隊友擋，招打到擋的人身上", G => {
  G.setRng(HIGH);
  let f = start(G, [seat(G, "a", [{}])]);
  const mv = aim(G, f, "cling", "a"), full = G.maxExpr(mv.san);
  let r = G.fightRound(f, { a: { act: "guard" } });
  assert.strictEqual(r.fx.a.san, Math.ceil(full / 2));
  f = start(G, [seat(G, "a", [{}]), seat(G, "b", [{}])]);
  aim(G, f, "cling", "a");
  r = G.fightRound(f, { a: { act: "push" }, b: { act: "guard", for: "a" } });
  const foe = evOf(r, "foe")[0];
  assert.strictEqual(foe.cover, "b"); assert.strictEqual(foe.hit, "b");
  assert.ok(!r.fx.a || !r.fx.a.san);
  assert.strictEqual(r.fx.b.san, Math.ceil(full / 2));
});
T("沒選、選了不能選的：都當「擋」，不會丟錯", G => {
  G.setRng(HIGH);
  const f = start(G, [seat(G, "a", [{}]), seat(G, "b", [{}])]);
  aim(G, f, "pile");
  const r = G.fightRound(f, { a: { act: "亂寫" }, b: { act: "cap" } }); // b 沒有棒球帽
  assert.strictEqual(evOf(r, "auto").length, 2);
  assert.strictEqual(evOf(r, "push").length, 0);
  assert.ok(G.fightRound(f, null).ok);
});
T("撲：倒下一隻，強度跟著少；帶的都倒了變幽靈，全隊都倒了算輸", G => {
  G.setRng(MID);
  const f = G.fightStart("f1a", [seat(G, "a", [{}, {}], { 說服: 99 })]);
  f.hp = f.hpMax = 9999;
  const p0 = G.fightPower(f.seats[0]);
  aim(G, f, "topple", "a");
  let r = G.fightRound(f, { a: { act: "see" } });
  assert.strictEqual(r.fx.a.downs.length, 1);
  assert.ok(G.fightPower(f.seats[0]) < p0 && !f.over);
  aim(G, f, "topple", "a");
  r = G.fightRound(f, { a: { act: "calm" } }); // 說服 99：安撫會過，取消
  assert.ok(evOf(r, "foe")[0].cancel);
  f.seats[0].skills.說服 = -999;
  aim(G, f, "topple", "a");
  r = G.fightRound(f, { a: { act: "calm" } }); // 說服掉到最低：成功率 5，擲三十幾不會過
  assert.ok(f.seats[0].ghost); assert.strictEqual(f.over, "lose");
  assert.ok(!G.fightRound(f, {}).ok);
});
T("理智用完也算倒下", G => {
  G.setRng(HIGH);
  const f = start(G, [seat(G, "a", [{}], {}, 1)]);
  aim(G, f, "cling", "a");
  const r = G.fightRound(f, { a: { act: "push" } });
  assert.ok(f.over === "lose" || f.over === "win");
  if (f.over === "lose") assert.strictEqual(evOf(r, "ghost")[0].why, "san");
});
T("撤：先走，怪物這回合打不到；有人撤、剩下的都倒了算「撤退」", G => {
  G.setRng(HIGH);
  const f = start(G, [seat(G, "a", [{}])]);
  aim(G, f, "cling", "a");
  const r = G.fightRound(f, { a: { act: "retreat" } });
  assert.ok(f.seats[0].out); assert.strictEqual(f.over, "retreat");
  assert.ok(evOf(r, "foe")[0].miss);
  assert.ok(!r.fx.a || !r.fx.a.san);
});
T("招式：棒球帽擋下、一場一次；斯拉夫蹲不會倒；皇冠骰子當最大；觸手帽扣自己的理智", G => {
  const F = G.NUM.fight;
  G.setRng(HIGH);
  let f = start(G, [seat(G, "a", [{ 帽子: "棒球帽" }, { 帽子: "皇冠" }, { 帽子: "觸手帽" }])]);
  aim(G, f, "cling", "a");
  let r = G.fightRound(f, { a: { act: "cap" } });
  assert.strictEqual(evOf(r, "foe")[0].blocked, "a");
  assert.ok(!r.fx.a || !r.fx.a.san);
  assert.ok(!G.fightOptions(f, "a").find(o => o.act === "cap").ok, "用過了");
  aim(G, f, "pile");
  const range = G.fightOptions(f, "a").find(o => o.act === "crown");
  G.setRng(LOW);
  r = G.fightRound(f, { a: { act: "crown" } });
  assert.strictEqual(evOf(r, "push")[0].die, G.maxExpr(F.die));
  assert.strictEqual(evOf(r, "push")[0].n, range.hi);
  aim(G, f, "pile");
  r = G.fightRound(f, { a: { act: "tentacle" } });
  const e = evOf(r, "push")[0];
  assert.strictEqual(e.n, G.fightPower(f.seats[0]) * F.tentacleMult + e.die);
  assert.ok(r.fx.a.san >= 1 && r.fx.a.san <= G.maxExpr(F.tentacleSan));
  // 斯拉夫蹲
  f = G.fightStart("f1a", [seat(G, "a", [{ 姿勢: "斯拉夫蹲" }])]);
  aim(G, f, "topple", "a");
  r = G.fightRound(f, { a: { act: "squat" } });
  assert.strictEqual(evOf(r, "foe")[0].blocked, "a");
  assert.ok(!f.seats[0].pepes[0].down);
});
T("招式：巫師帽這回合每個人的推都加；比讚是下一回合加，只加一回合", G => {
  const F = G.NUM.fight;
  G.setRng(LOW);
  const f = start(G, [seat(G, "a", [{ 帽子: "巫師帽" }, { 姿勢: "比讚" }]), seat(G, "b", [{}])]);
  f.hp = f.hpMax = 9999;
  aim(G, f, "pile");
  let r = G.fightRound(f, { a: { act: "wizard" }, b: { act: "push" } });
  let e = evOf(r, "push")[0];
  assert.strictEqual(e.n, G.fightPower(f.seats[1]) + e.die + F.wizard);
  aim(G, f, "pile");
  r = G.fightRound(f, { a: { act: "cheer" }, b: { act: "push" } });
  e = evOf(r, "push")[0];
  assert.strictEqual(e.n, G.fightPower(f.seats[1]) + e.die, "比讚當回合不加");
  aim(G, f, "pile");
  r = G.fightRound(f, { a: { act: "guard" }, b: { act: "push" } });
  e = evOf(r, "push")[0];
  assert.strictEqual(e.n, G.fightPower(f.seats[1]) + e.die + F.cheer);
  aim(G, f, "pile");
  r = G.fightRound(f, { a: { act: "guard" }, b: { act: "push" } });
  e = evOf(r, "push")[0];
  assert.strictEqual(e.n, G.fightPower(f.seats[1]) + e.die, "只加一回合");
});
T("躺平、毛帽回理智：只有這一層第一次走才能用（界線：不能下去一直刷）", G => {
  G.setRng(LOW);
  let f = start(G, [seat(G, "a", [{ 姿勢: "躺平" }, { 帽子: "毛帽" }])], { rest: false });
  assert.ok(!G.fightOptions(f, "a").find(o => o.act === "rest").ok);
  assert.ok(!G.fightOptions(f, "a").find(o => o.act === "beanie").ok);
  f = start(G, [seat(G, "a", [{ 姿勢: "躺平" }])], { rest: true });
  aim(G, f, "pile");
  const r = G.fightRound(f, { a: { act: "rest" } });
  assert.ok(r.fx.a.gain >= 1 && r.fx.a.gain <= G.maxExpr(G.NUM.fight.rest));
  assert.ok(!G.fightOptions(f, "a").find(o => o.act === "rest").ok);
});
T("守門：壓到零進第二階段（那回合怪物不出招、弱點重找），再壓到零才算過；記下誰補最後一下", G => {
  G.setRng(HIGH);
  const f = G.fightStart("f1g", [seat(G, "a", [{}]), seat(G, "b", [{}])]);
  assert.strictEqual(f.phases, 2);
  f.hp = 1; f.weak = true;
  aim(G, f, "dust", "a");
  let r = G.fightRound(f, { a: { act: "guard" }, b: { act: "push" } });
  assert.strictEqual(f.phase, 2); assert.ok(!f.over && !f.weak);
  assert.strictEqual(evOf(r, "foe").length, 0);
  const z = G.fightFoe("f1g");
  assert.strictEqual(f.hp, G.fightHp(z.hp2, 2, 2, 0));
  assert.ok(z.moves2.some(m => m.id === f.intent.move), "下一招從第二階段的招裡抽");
  f.hp = 1;
  r = G.fightRound(f, { a: { act: "push" }, b: { act: "guard" } });
  assert.strictEqual(f.over, "win"); assert.strictEqual(f.last, "a"); assert.strictEqual(f.hp, 0);
  assert.strictEqual(f.intent, null);
});
T("幽靈：只能指一次弱點，指了隊友的推就有加成", G => {
  G.setRng(LOW);
  const f = start(G, [seat(G, "a", [{}]), seat(G, "b", [{}])]);
  f.seats[0].pepes[0].down = true; f.seats[0].ghost = true;
  same(G.fightOptions(f, "a").map(o => o.act), ["point"]);
  aim(G, f, "pile");
  const r = G.fightRound(f, { a: { act: "point" }, b: { act: "push" } });
  assert.ok(evOf(r, "push")[0].weak);
  assert.ok(!G.fightOptions(f, "a")[0].ok);
});
T("拖太久：到 maxRounds 怪物自己走掉", G => {
  G.setRng(HIGH);
  const f = start(G, [seat(G, "a", [{}])]);
  f.hp = f.hpMax = 99999;
  for (let i = 0; i < G.NUM.fight.maxRounds && !f.over; i++) { aim(G, f, "pile"); G.fightRound(f, { a: { act: "guard" } }); }
  assert.strictEqual(f.over, "away");
});
T("打完：倒下的佩佩照 NUM.fight.injure 的機率受傷；沒倒的不會", G => {
  const f = start(G, [seat(G, "a", [{}, {}])]);
  f.seats[0].pepes[0].down = true;
  G.setRng(LOW);
  assert.strictEqual(G.fightAfter(f).a.injured.length, G.NUM.fight.injure > 0 ? 1 : 0);
  G.setRng(HIGH);
  const a = G.fightAfter(f).a;
  assert.strictEqual(a.injured.length, G.NUM.fight.injure >= 1 ? 1 : 0);
  assert.strictEqual(a.injured.length + a.fine.length, 1);
});
T("下一招的字：{x} 換成被點到的人的名字", G => {
  const f = start(G, [seat(G, "小明", [{}])]);
  aim(G, f, "cling", "小明");
  assert.ok(G.fightIntentText(f).includes("小明") && !G.fightIntentText(f).includes("{x}"));
});
T("fightSeat：從存檔做座位，只讀不改", G => {
  const P = G.newProfile("challenge");
  G.ensureDay(P, "2026-11-12");
  const key = G.pepeKey(G.fullPick({ 稀有度: "稀有" }));
  P.pepes[key] = { n: 1 };
  const before = JSON.stringify(P);
  const s = G.fightSeat(P, "u1", "小明", [key, "沒有這隻"]);
  assert.strictEqual(s.pepes.length, 1); assert.strictEqual(s.san, P.sanity);
  assert.strictEqual(s.skills.偵查, G.skillOf(P, "偵查"));
  assert.strictEqual(JSON.stringify(P), before);
});

T("每天的內容寫的怪物：不用改程式就能打；名字、下一招的字用它自己的", G => {
  const def = { id: "w46-coat", name: "沒人領的冬衣", intro: "袖子自己舉了起來。", floor: 1, hp: 20, mood: "傷心", color: "紅", moves: [{ id: "wrap", kind: "scare", san: "1D3", text: "要把{x}包起來" }, { id: "pile", kind: "grow", n: 3, text: "箱子裡還有壹件" }] };
  same(G.fightFoeCheck(def), []);
  G.setRng(MID);
  const f = G.fightStart(def, [seat(G, "小明", [{ 心情: "開心" }])]);
  assert.ok(f && f.custom && G.fightNameOf(f) === def.name);
  assert.strictEqual(f.hpMax, G.fightHp(def.hp, 1, 1, 0));
  f.intent = { move: "wrap", kind: "scare", to: "小明" };
  assert.strictEqual(G.fightIntentText(f), "要把小明包起來");
  const r = G.fightRound(JSON.parse(JSON.stringify(f)), { 小明: { act: "push" } }); // 從資料庫讀回來（JSON）也能繼續打
  assert.ok(r.ok && evOf(r, "push").length === 1);
});
T("每天的內容寫的怪物：壞的擋得住（太硬、扣太多理智、沒寫點到誰、像青蛙、跟內建的撞 id）", G => {
  const ok = () => ({ id: "x1", name: "東西", intro: "它在。", floor: 1, hp: 20, moves: [{ id: "a", kind: "scare", san: "1D3", text: "要嚇{x}" }, { id: "b", kind: "grow", n: 3, text: "變多了" }] });
  const bad = fn => { const d = ok(); fn(d); return G.fightFoeCheck(d).length > 0; };
  same(G.fightFoeCheck(ok()), []);
  assert.ok(bad(d => { d.hp = G.FIGHT_CUSTOM.hp[1] + 1; }));
  assert.ok(bad(d => { d.hp = 12.5; }));
  assert.ok(bad(d => { d.moves[0].san = "2D6"; }));
  assert.ok(bad(d => { d.moves[0].text = "要嚇人"; }));
  assert.ok(bad(d => { d.moves[1].n = 99; }));
  assert.ok(bad(d => { d.moves = d.moves.slice(0, 1); }));
  assert.ok(bad(d => { d.moves[0].kind = "kill"; }));
  assert.ok(bad(d => { d.name = "佩佩蛙"; }));
  assert.ok(bad(d => { d.id = "f1a"; }));
  assert.ok(bad(d => { d.boss = true; }));
  assert.ok(bad(d => { delete d.name; }));
  assert.ok(G.fightFoeCheck(null).length > 0 && G.fightFoeCheck([]).length > 0);
  assert.strictEqual(G.fightStart(Object.assign(ok(), { hp: 9999 }), [seat(G, "a", [{}])]), null);
});

// ---------- 地圖 ----------
T("地圖：同一天同一層每個人都一樣；換一天不一樣", G => {
  const a = JSON.stringify(G.cmapOfDay(1, "2026-11-12")), b = JSON.stringify(G.cmapOfDay(1, "2026-11-12"));
  assert.strictEqual(a, b);
  const days = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(G.cmapOfDay(1, "2026-12-" + (i + 1)))));
  assert.ok(days.size > 10, "20 天至少要有 10 種");
  G.setRng(() => { throw new Error("cmapOfDay 不可以用到全域的骰子"); });
  G.cmapOfDay(2, "2026-11-12");
});
T("地圖：五層 × 200 天都沒有問題（每個點走得到、有路往下、最後一排有休息、守門是這層的守門）", G => {
  G.cellarFloors().forEach(n => {
    for (let d = 0; d < 200; d++) {
      const m = G.cmapOfDay(n, "day" + d);
      same(G.cmapCheck(m), [], `B${n} day${d}`);
      assert.strictEqual(m.gate.foe, G.fightFoesOf(n, true)[0].id);
      assert.ok(m.rows.length >= G.NUM.cellarMap.rows);
      m.rows.forEach(r => assert.ok(r.length >= 2 && r.length <= 3));
      m.rows.flat().filter(x => x.kind === "foe").forEach(x => assert.ok(G.fightFoesOf(n).some(f => f.id === x.foe)));
    }
  });
});
T("房間探索是重點：這一層的房間每一間都在地圖上，而且一趟可以全部走完", G => {
  G.cellarFloors().forEach(n => {
    for (let d = 0; d < 50; d++) {
      const m = G.cmapOfDay(n, "x" + d), rooms = G.cellarFloor(n).rooms.map(r => r.id);
      const ex = m.rows.map(r => r.find(x => x.kind === "explore")).filter(Boolean);
      same(ex.map(x => x.room).sort(), rooms.slice().sort());
      const rest = m.rows[m.rows.length - 1].find(x => x.kind === "rest");
      assert.ok(G.cmapPathOk(m, ex.map(x => x.id).concat([rest.id, m.gate.id])), `B${n} x${d} 探索房要一路連到守門`);
    }
  });
});
T("地圖：下一步只能走連得到的點；亂走不行；壞的地圖檢查得出來", G => {
  const m = G.cmapOfDay(1, "2026-11-12");
  same(G.cmapNext(m, null), m.rows[0].map(x => x.id));
  same(G.cmapNext(m, m.gate.id), []);
  assert.ok(!G.cmapPathOk(m, [m.gate.id]));
  assert.ok(!G.cmapPathOk(m, [m.rows[0][0].id, m.rows[0][1].id]));
  assert.strictEqual(G.cmapNode(m, m.gate.id).kind, "gate");
  assert.strictEqual(G.cmapMake(99), null);
  const bad = JSON.parse(JSON.stringify(m));
  bad.links[bad.rows[0][0].id] = [];
  assert.ok(G.cmapCheck(bad).length > 0);
  assert.ok(G.cmapCheck({}).length > 0);
});

console.log(`${pass} passed, ${fail} failed（地下室改版：打怪物、地圖）`);
process.exit(fail ? 1 : 0);
