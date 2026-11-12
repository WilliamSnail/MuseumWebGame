// 合作地下收藏庫接上打怪物（shared/coop_fight.js，決定 0067、0068）：node test/coop_fight.test.cjs（npm test 也會跑）
// 房間探索完才打守門、沒開的時候跟以前一模一樣、大家選了才結算、時間到當擋、打贏才算走完這一層、
// 逃跑成功不算走完、全隊倒了這一趟結束、倒下的真的受傷、膽量一趟一份、看不到別人選什麼、讀回來（JSON）還能打。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let G = load();
let pass = 0, fail = 0;
const T = (name, fn) => { try { G = load(); G.setRng(G.mulberry32(11)); fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const DATE = "2026-11-12", NOW = 1_800_000_000_000;
const BASE = { 稀有度: "超稀有", 心情: "俄國8+9", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" };
const J = x => JSON.parse(JSON.stringify(x));
function person() {
  const P = G.newProfile("challenge"); G.ensureDay(P, DATE);
  P.tutorialDone = true; P.insp = 100; P.sanity = 60;
  G.assignJob(P, "detective");
  P.day.quirkGiven = true;
  return P;
}
const mk = (P, o = {}) => G.finishMake(P, Object.assign({}, BASE, o), { natural: 50 }).key;
function party(ids, opt = {}) {
  const Ps = {}, members = ids.map(id => { const P = person(); Ps[id] = P; return { id, name: id, P, keys: [mk(P), mk(P, { 顏色: "綠" })] }; });
  const s = G.coopBegin(members, opt.floor || 1, DATE, NOW, Object.assign({ gate: true }, opt));
  assert.ok(s.ok, s.reason);
  return { run: s.run, Ps, ids };
}
const safe = run => { const c = G.coopRoom(run).choices.findIndex(x => x.check.type === "none"); return c < 0 ? 0 : c; };
let clock = NOW;
// 把這一層的房間都走完（都選安全的），停在下一個不是 vote／result 的階段
function walkRooms(run, Ps, ids) {
  for (let i = 0; i < 40 && ["vote", "result", "carry", "carried", "route", "rest", "chest"].includes(run.phase); i++) {
    if (run.phase === "route") { // 地圖選路（coop_route.js）：壹路走探索房，最後壹排走休息，再來是守門
      const opts = G.coopRouteOptions(run), kindOf = id => G.cmapNode(run.cmap, id).kind;
      const pick = opts.find(id => kindOf(id) === "explore") || opts.find(id => kindOf(id) === "rest") || opts.find(id => kindOf(id) === "gate") || opts[0];
      ids.forEach(id => { if (run.phase === "route") G.coopAct(run, Ps, id, "route", { node: pick }, ++clock); });
    } else if (run.phase === "rest") ids.forEach(id => G.coopAct(run, Ps, id, "rest", { pick: "san" }, ++clock));
    else if (run.phase === "vote") { const c = safe(run); ids.forEach(id => G.coopAct(run, Ps, id, "vote", { choice: c }, ++clock)); }
    else if (run.phase === "carry") ids.forEach(id => G.coopAct(run, Ps, id, "carry", { side: "skip" }, ++clock));
    else ids.forEach(id => G.coopAct(run, Ps, id, "ack", {}, ++clock));
  }
}
const all = (ids, pick) => Object.fromEntries(ids.map(id => [id, pick]));
function fightUntilOver(run, Ps, ids, pick = { act: "push" }) {
  for (let i = 0; i < 40 && run.phase === "fight"; i++) ids.forEach(id => { if (run.phase === "fight") G.coopAct(run, Ps, id, "fight", pick, ++clock); });
}

T("沒開守門（舊的）：房間走完直接是 floorDone，跟以前一樣", () => {
  const { run, Ps, ids } = party(["a"], { gate: false });
  walkRooms(run, Ps, ids);
  assert.strictEqual(run.phase, "floorDone");
  assert.ok(!run.fight && !run.gate);
  assert.ok(Ps.a.cellar.floorsDone[1]);
});
T("開了守門：房間都探索完才開打，是這一層的守門；還沒打贏不算走完這一層", () => {
  const { run, Ps, ids } = party(["a", "b"]);
  assert.strictEqual(run.phase, "route", "壹開始先選路（地圖，coop_route.js）");
  walkRooms(run, Ps, ids);
  assert.strictEqual(run.phase, "fight");
  assert.strictEqual(run.fight.foe, G.fightFoesOf(1, true)[0].id);
  assert.ok(run.fight.boss && run.deadline === clock + G.COOP.fightMs);
  assert.ok(!Ps.a.cellar.floorsDone[1], "還沒打贏");
  assert.strictEqual(run.fight.seats.filter(s => !s.helper).length, 2);
  assert.strictEqual(Object.keys(Ps.a.cellar.cleared).length, G.cellarFloor(1).rooms.length, "四間房都走過了");
});
T("大家都選了才結算；選了可以改；看不到別人選什麼，只知道誰還沒選", () => {
  const { run, Ps, ids } = party(["a", "b"]);
  walkRooms(run, Ps, ids);
  const hp = run.fight.hp;
  let r = G.coopAct(run, Ps, "a", "fight", { act: "guard" }, ++clock);
  assert.ok(r.ok && !r.saves); assert.strictEqual(run.fight.hp, hp); assert.strictEqual(run.fight.round, 1);
  G.coopAct(run, Ps, "a", "fight", { act: "push" }, ++clock);
  const vb = G.viewFor(run, "b");
  assert.deepStrictEqual(J(vb.votes), { b: null }, "b 看不到 a 選了什麼");
  assert.deepStrictEqual(J(vb.fightView.waiting), ["b"]);
  assert.ok(vb.fightView.name && vb.fightView.options.some(o => o.act === "push" && o.lo > 0));
  assert.ok(typeof vb.fightView.intent === "string" && !vb.fightView.intent.includes("{x}"));
  r = G.coopAct(run, Ps, "b", "fight", { act: "push" }, ++clock);
  assert.ok(r.saves);
  assert.ok(run.fight.hp < hp && run.fight.round === 2);
  assert.deepStrictEqual(J(run.votes), {});
  assert.ok(run.fresh.a.some(e => e.type === "fightRound"));
});
T("時間到：沒選的當「擋」，不會被當掛機踢掉", () => {
  const { run, Ps, ids } = party(["a", "b"]);
  walkRooms(run, Ps, ids);
  for (let i = 0; i < 4 && run.phase === "fight"; i++) {
    G.coopAct(run, Ps, "a", "fight", { act: "push" }, ++clock);
    clock = run.deadline + 1;
    G.coopAct(run, Ps, "a", "tick", {}, clock);
  }
  assert.ok(!G.coopMember(run, "b").out, "b 沒選也還在隊伍裡");
  assert.ok(run.fight ? run.fight.round > 1 : true);
});
T("打贏守門：才算走完這一層，拿第一次過關的獎勵；合作多一點點靈感；可以往下", () => {
  const { run, Ps, ids } = party(["a", "b"]);
  walkRooms(run, Ps, ids);
  const insp0 = Ps.a.insp;
  run.fight.hp = 1; run.fight.phase = 2; // 直接到最後一下
  fightUntilOver(run, Ps, ids);
  assert.strictEqual(run.phase, "floorDone");
  assert.ok(Ps.a.cellar.floorsDone[1] && Ps.b.cellar.floorsDone[1]);
  assert.strictEqual(Ps.a.cellar.best, 1);
  assert.strictEqual(run.next, 2);
  assert.ok(run.gateDone[1] && !run.fight);
  assert.strictEqual(run.fightLast.over, "win");
  assert.ok(Ps.a.insp - insp0 >= G.CELLAR_REWARDS[1].insp + G.fightWinInsp(2, 1), "過關獎勵＋合作多的（另外可能有徽章的靈感）");
  assert.strictEqual(run.fresh.a.find(e => e.type === "fightWin").insp, G.fightWinInsp(2, 1));
  assert.strictEqual(run.fresh.a.find(e => e.type === "floorDone").reward.insp, G.CELLAR_REWARDS[1].insp);
  assert.strictEqual(G.fightWinInsp(1, 1), 0, "壹個人打壹般等級的沒有多的");
  assert.ok(G.isUnlocked(Ps.a, "帽子", "毛帽"), "第一層的獎勵照舊");
  // 往下一層：又是先探索，走完再打那一層的守門
  ids.forEach(id => G.coopAct(run, Ps, id, "floor", { go: "down" }, ++clock));
  assert.strictEqual(run.phase, "route"); assert.strictEqual(run.floor, 2); // 新的壹層也是先選路
  walkRooms(run, Ps, ids);
  assert.strictEqual(run.phase, "fight");
  assert.strictEqual(run.fight.foe, G.fightFoesOf(2, true)[0].id);
});
T("逃跑成功：這一層不算走完，沒有獎勵，只能回地面；下次再來要重打", () => {
  const { run, Ps, ids } = party(["a"]);
  walkRooms(run, Ps, ids);
  G.setRng(() => 0.3); // d100 擲三十幾：守門的逃跑機率 40 會過
  G.coopAct(run, Ps, "a", "fight", { act: "flee" }, ++clock);
  assert.strictEqual(run.phase, "floorDone");
  assert.strictEqual(run.next, null);
  assert.ok(!Ps.a.cellar.floorsDone[1] && !run.gateDone[1]);
  assert.strictEqual(run.fightLast.over, "flee");
  G.coopAct(run, Ps, "a", "floor", { go: "down" }, ++clock);
  assert.strictEqual(run.phase, "over", "不能往下，只能結束");
});
T("倒下的佩佩真的受傷（寫進存檔）；全隊都倒了這一趟結束", () => {
  const { run, Ps, ids } = party(["a"]);
  walkRooms(run, Ps, ids);
  const f = run.fight;
  f.hp = f.hpMax = 99999;
  const hit = G.fightFoe(f.foe).moves.find(m => m.kind === "hit");
  for (let i = 0; i < 6 && run.phase === "fight"; i++) {
    run.fight.intent = { move: hit.id, kind: "hit", to: "a" };
    G.coopAct(run, Ps, "a", "fight", { act: "push" }, ++clock);
  }
  assert.strictEqual(Object.keys(Ps.a.injured).length, 2, "兩隻都受傷了");
  assert.strictEqual(run.phase, "over"); assert.strictEqual(run.over, "lost");
  assert.ok(!Ps.a.cellar.floorsDone[1]);
});
T("膽量一趟一份：兩個人各有 courage，被扣的先扣它；用掉的不會在下一場補回來", () => {
  const { run, Ps, ids } = party(["a", "b"]);
  walkRooms(run, Ps, ids);
  const C = G.NUM.fight.courage, f = run.fight;
  assert.strictEqual(G.coopMember(run, "a").brave, C);
  f.hp = f.hpMax = 99999;
  const scare = G.fightFoe(f.foe).moves.find(m => m.kind === "scare");
  const san0 = Ps.a.sanity;
  G.setRng(() => 0.999);
  run.fight.intent = { move: scare.id, kind: "scare", to: "a" };
  ids.forEach(id => G.coopAct(run, Ps, id, "fight", { act: "push" }, ++clock));
  const full = G.maxExpr(scare.san);
  assert.strictEqual(G.coopMember(run, "a").brave, Math.max(0, C - full));
  assert.strictEqual(san0 - Ps.a.sanity, Math.max(0, full - C), "膽量擋掉的不扣理智");
  assert.ok(run.fresh.a.some(e => e.type === "brave"));
  // 再開一場：膽量照剩下的
  const left = G.coopMember(run, "a").brave;
  run.fight = null; run.phase = "result";
  G.coopFightStart(run, Ps, G.fightFoesOf(1)[0].id, "gate");
  assert.strictEqual(G.fightSeatOf(run.fight, "a").brave, left);
});
T("一個人：膽量是 0；館方助手補位、會自己推", () => {
  const { run, Ps, ids } = party(["a"]);
  walkRooms(run, Ps, ids);
  assert.strictEqual(G.coopMember(run, "a").brave, 0);
  assert.ok(run.fight.seats.some(s => s.helper));
  const hp = run.fight.hp;
  run.fight.intent = { move: G.fightFoe(run.fight.foe).moves.find(m => m.kind === "grow").id, kind: "grow", to: null };
  G.coopAct(run, Ps, "a", "fight", { act: "guard" }, ++clock);
  assert.ok(run.fresh.a.find(e => e.type === "fightRound").events.some(e => e.t === "push" && e.id === "helper"));
  assert.ok(run.fight.hp !== hp);
});
T("打到一半有人離隊：不用等他；選「撤」的人帶著拿到的回地面，剩下的人繼續", () => {
  const { run, Ps, ids } = party(["a", "b"]);
  walkRooms(run, Ps, ids);
  run.fight.hp = run.fight.hpMax = 99999;
  G.coopAct(run, Ps, "a", "fight", { act: "push" }, ++clock);
  const r = G.coopAct(run, Ps, "b", "leave", {}, ++clock);
  assert.ok(r.ok && r.dropped.includes("b"));
  assert.strictEqual(run.fight.round, 2, "b 走了就結算");
  assert.ok(G.fightSeatOf(run.fight, "b").out);
  // 撤
  const x = party(["c", "d"]);
  walkRooms(x.run, x.Ps, x.ids);
  x.run.fight.hp = x.run.fight.hpMax = 99999;
  G.coopAct(x.run, x.Ps, "c", "fight", { act: "retreat" }, ++clock);
  G.coopAct(x.run, x.Ps, "d", "fight", { act: "push" }, ++clock);
  assert.strictEqual(G.coopMember(x.run, "c").out, "left");
  assert.strictEqual(x.run.phase, "fight", "d 繼續打");
});
T("從資料庫讀回來（JSON、空的陣列和物件不見了）還能繼續打", () => {
  const { run, Ps, ids } = party(["a", "b"]);
  walkRooms(run, Ps, ids);
  G.coopAct(run, Ps, "a", "fight", { act: "push" }, ++clock);
  const strip = v => { if (Array.isArray(v)) { if (!v.length) return undefined; return v.map(strip); } if (v && typeof v === "object") { const o = {}; Object.keys(v).forEach(k => { const x = strip(v[k]); if (x !== undefined && x !== null) o[k] = x; }); return Object.keys(o).length ? o : undefined; } return v; };
  const back = strip(J(run));
  const r = G.coopAct(back, Ps, "b", "fight", { act: "see" }, ++clock);
  assert.ok(r.ok, r.reason);
  assert.strictEqual(back.fight.round, 2);
});
T("不在打的時候送 fight、亂送的行動：擋掉或當「擋」，不會丟錯", () => {
  const { run, Ps, ids } = party(["a"]);
  assert.ok(!G.coopAct(run, Ps, "a", "fight", { act: "push" }, ++clock).ok);
  walkRooms(run, Ps, ids);
  assert.ok(!G.coopAct(run, Ps, "a", "fight", {}, ++clock).ok);
  assert.ok(!G.coopAct(run, Ps, "z", "fight", { act: "push" }, ++clock).ok);
  const r = G.coopAct(run, Ps, "a", "fight", { act: "亂寫" }, ++clock);
  assert.ok(r.ok);
  assert.ok(run.fresh.a.find(e => e.type === "fightRound").events.some(e => e.t === "auto"));
});
T("試煉房間不打守門", () => {
  const tr = G.TRIAL_ROOMS.find(t => t.floor === 1);
  const P = person(); P.cellar.best = 1; P.cellar.floorsDone[1] = DATE;
  const s = G.coopBegin([{ id: "a", name: "a", P, keys: [mk(P)] }], 1, DATE, NOW, { gate: true, trial: { id: tr.id } });
  assert.ok(s.ok, s.reason);
  assert.ok(!s.run.gate);
});

console.log(`${pass} passed, ${fail} failed（合作地下接上打怪物）`);
process.exit(fail ? 1 : 0);
