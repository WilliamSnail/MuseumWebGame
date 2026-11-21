// 找 NPC 一起下地下收藏庫（決定 0149）：node test/coop/coop_npc.test.cjs（npm test 也會跑）
// 誰邀得動、答應率、禮物的錢（守恆）、NPC 當隊員（投票、離隊、只剩 NPC 就結束）、趟結束後的理智和「壹起下去」紀錄。
const assert = require("assert");
const { load } = require("../load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const J = x => JSON.parse(JSON.stringify(x));
const D = "2026-11-21", SEC = "test-secret";
const mkHouse = G => G.casHouseFix(G.casHouseNew(), D).house;
// 找一個「有旅客在館」的時間
function findNow(G, house) {
  const list = G.NPC_ROSTER, counters = G.npcCounters(house.npcc), t0 = G.npcDayStartMs(D);
  for (let m = 0; m < 1440; m += 5) { const l = G.npcCoopInvitable(house, D, t0 + m * 60000, SEC, list, counters, "u1"); if (l.length) return { now: t0 + m * 60000, list: l }; }
  return null;
}

T("名單：cellar 欄位的才邀得動，劇情角色（t-）一個都沒有", G => {
  const ok = G.NPC_ROSTER.filter(n => G.npcCoopOk(n, D)).map(n => n.id).sort();
  assert.strictEqual(ok.length, 11, ok.join()); assert.ok(ok.every(id => !id.startsWith("t-")));
  assert.ok(["v-lantern", "v-ke", "c-guardday"].every(id => ok.includes(id)) && !ok.includes("v-scale") && !ok.includes("c-postman") && !ok.includes("v-qian"));
});
T("邀得動的人：在館裡、理智夠、今天陪的趟數沒滿；理智低、陪滿的不在名單", G => {
  const house = mkHouse(G), f = findNow(G, house); assert.ok(f, "一天裡總有人在");
  assert.ok(f.list.every(x => G.npcCoopOk(G.NPC_ROSTER.find(n => n.id === x.id), D)));
  const id = f.list[0].id, list = G.NPC_ROSTER, counters = G.npcCounters(house.npcc);
  house.npcw = { san: { [id]: G.NUM.casino.coopNpc.minSan - 1 } };
  assert.ok(!G.npcCoopInvitable(house, D, f.now, SEC, list, counters, "u1").some(x => x.id === id), "理智低不邀");
  house.npcw.san[id] = 70; const n = G.NPC_ROSTER.find(x => x.id === id);
  for (let i = 0; i < G.NUM.casino.coopNpc.perDay; i++) { G.npcCoopAccept(house, D, n, "p" + i, "u1", f.now); G.npcCoopFree(house, id); }
  assert.ok(!G.npcCoopInvitable(house, D, f.now, SEC, list, counters, "u1").some(x => x.id === id), "今天陪滿了不邀");
});
T("答應率：base ＋ route.cellar × routeP ＋ 禮物 giftP，夾 5～95", G => {
  const C = G.NUM.casino.coopNpc, n = G.NPC_ROSTER.find(x => x.id === "v-lantern");
  assert.strictEqual(G.npcCoopChance(n, false), Math.min(95, C.baseP + n.route.cellar * C.routeP));
  assert.strictEqual(G.npcCoopChance(n, true), Math.min(95, C.baseP + n.route.cellar * C.routeP + C.giftP));
  assert.ok(G.npcCoopChance({ route: {} }, false) >= 5);
});
T("禮物：玩家 → 已知世界，守恆，來源 npcGift", G => {
  const house = mkHouse(G), w = G.casWalletFix(G.casWalletNew(), D); w.chips = 100000;
  const snap = () => G.casBookSnap([w], house, 0, D), op = G.casBookOpening(snap());
  const got = G.npcCoopGift(w, house);
  assert.strictEqual(got, G.NUM.casino.coopNpc.gift); assert.strictEqual(w.chips, 100000 - got);
  assert.strictEqual(house.led.world.npcGift, got); assert.strictEqual(G.casBookGap(snap(), op), 0);
});
T("拒絕後同一位館友要等；被問次數會讓種子不同", G => {
  const house = mkHouse(G); G.npcCoopCool(house, D, "u1", "v-ke", 1000);
  assert.ok(G.npcCoopCoolLeft(house, D, "u1", "v-ke", 1000) > 0); assert.strictEqual(G.npcCoopCoolLeft(house, D, "u2", "v-ke", 1000), 0);
  assert.strictEqual(G.npcCoopCoolLeft(house, D, "u1", "v-ke", 1000 + G.NUM.casino.coopNpc.coolMs + 1), 0);
  assert.notStrictEqual(G.npcCoopRoll(SEC, D, "u1", "v-ke", 0), G.npcCoopRoll(SEC, D, "u1", "v-ke", 1));
});
T("隊伍：NPC 掛在 npcs、人加 NPC 不超過 4、最多 maxNpc、試煉和留守不能帶、請走", G => {
  const p = G.newParty({ pid: "p1", kind: "cellar", leader: "a", leaderNick: "甲", now: 1 }), info = { npc: "v-ke", name: "老柯", role: "carry", style: "careful" }, max = G.NUM.casino.coopNpc.maxNpc;
  assert.ok(G.partyNpcAdd(p, "a", info, max).ok); assert.ok(!G.partyNpcAdd(p, "a", info, max).ok, "不重複");
  assert.ok(!G.partyNpcAdd(p, "a", { npc: "v-photo", name: "阿岸" }, 1).ok, "超過 maxNpc");
  assert.ok(G.partyNpcRemove(p, "v-ke").ok); assert.ok(!G.partyNpcRemove(p, "v-ke").ok);
  p.trial = "t:x"; assert.ok(!G.partyNpcAdd(p, "a", info, max).ok); delete p.trial;
  assert.deepStrictEqual(J(G.fixParty({ pid: "x", kind: "cellar", members: {}, phase: "lobby" }).npcs), {});
});

// ---------- NPC 當隊員 ----------
const DATE = "2026-11-08";
function human(G, id) {
  const P = G.newProfile("challenge"); G.ensureDay(P, DATE); P.tutorialDone = true; P.insp = 100;
  const key = G.finishMake(P, { 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" }, { natural: 50 }).key;
  return { id, name: id, P, keys: [key], rewarded: true };
}
function startWithNpc(G, role = "carry", style = "basic", san = 70) {
  const h = human(G, "a"), n = G.coopNpcMember({ npc: "v-ke", name: "老柯", role, style }, 1, san, DATE);
  const s = G.coopBegin([h, n], 1, DATE, 1000, { id: "r1", fun: true });
  assert.ok(s.ok, s.reason);
  const Ps = { a: h.P, [n.id]: n.P };
  return { run: s.run, Ps, h, n };
}
T("NPC 是隊員：算人數（2 人）、不拿獎勵、不算每天 3 趟、帶 1 隻、P 是現做的", G => {
  const { run, Ps, h, n } = startWithNpc(G);
  const m = run.members.find(x => x.npc); assert.ok(m && m.npc === "v-ke" && m.rewarded === false && m.keys.length === 1);
  assert.strictEqual(run.members.length, 2); assert.strictEqual(h.P.coopDay && h.P.coopDay.n, 1, "只有真人算一趟");
  assert.ok(!n.P.coopDay || !n.P.coopDay.n, "NPC 不算趟");
  assert.ok(G.fromKey(m.keys[0]) && Ps[m.id].pepes[m.keys[0]]);
  assert.strictEqual(Ps[m.id].skills["手工藝"], 90, "搬運專長 ＝ 手工藝高");
});
T("NPC 自己投：只有一個真人在操作也能走完一趟", G => {
  const { run, Ps } = startWithNpc(G);
  let guard = 0;
  while (run.phase !== "over" && guard++ < 400) {
    const ph = run.phase, t = 2000 + guard * 1000;
    if (ph === "route") G.coopAct(run, Ps, "a", "route", { node: G.coopRouteOptions(run)[0] }, t);
    else if (ph === "vote") G.coopAct(run, Ps, "a", "vote", { choice: 0 }, t);
    else if (ph === "fight") G.coopAct(run, Ps, "a", "fight", { act: "push" }, t);
    else if (ph === "rest") G.coopAct(run, Ps, "a", "rest", { pick: "san" }, t);
    else if (ph === "floorDone") G.coopAct(run, Ps, "a", "floor", { go: "up" }, t);
    else if (ph === "guess") G.coopAct(run, Ps, "a", "guess", { id: G.COOP_RESIDENTS[0].id }, t);
    else if (ph === "carry") G.coopAct(run, Ps, "a", "carry", { side: "L" }, t);
    else G.coopAct(run, Ps, "a", "ack", {}, t);
  }
  assert.strictEqual(run.phase, "over", "NPC 自己投，人投完就結算");
});
T("NPC 理智太低：離隊，真人還能繼續", G => {
  const { run, Ps } = startWithNpc(G, "carry", "basic", 70);
  const m = run.members.find(x => x.npc); m.san = G.NUM.casino.coopNpc.leaveSan - 1; Ps[m.id].sanity = m.san;
  G.coopNpcTurn(run, Ps);
  assert.strictEqual(m.out, "left"); assert.ok(run.phase !== "over", "真人還在，這趟繼續");
});
T("人數加成：NPC 算 bonusWeight 個人（預設 1 ＝跟真人一樣；0.5 ＝半個人，壯膽和打贏的靈感少一些）", G => {
  const { run } = startWithNpc(G), ms = run.members;
  assert.strictEqual(G.NUM.casino.coopNpc.bonusWeight, 1); assert.strictEqual(G.coopBonusCount(ms), 2);
  assert.strictEqual(G.fightCourage(G.coopBonusCount(ms)), G.NUM.fight.courage);
  G.NUM.casino.coopNpc.bonusWeight = 0.5;
  assert.strictEqual(G.coopBonusCount(ms), 1.5); assert.strictEqual(G.fightCourage(G.coopBonusCount(ms)), 0, "壹個真人加半個 NPC 還不到第二個人");
  assert.strictEqual(G.fightWinInsp(G.coopBonusCount(ms), 1), G.fightWinInsp(1, 1));
  G.NUM.casino.coopNpc.bonusWeight = 1; assert.strictEqual(G.fightWinInsp(G.coopBonusCount(ms), 1), G.fightWinInsp(2, 1));
});
T("真人都離開：只剩 NPC 不算隊伍，這趟結束", G => {
  const { run, Ps } = startWithNpc(G);
  G.coopLeave(run, Ps, "a");
  assert.strictEqual(run.phase, "over");
});
T("趟結束後：NPC 的理智寫回、記壹次壹起下去（全館同壹份）、從隊裡拿掉；等級照 ties", G => {
  const house = mkHouse(G), C = G.NUM.casino.coopNpc;
  house.npcCoop = { day: D, by: { "v-ke": { n: 1, ask: 1 } }, at: { "v-ke": { pid: "p", host: "a", since: 1, until: 99999999999999 } }, cool: {} };
  assert.strictEqual(G.npcCoopDone(house, D, "v-ke", 61.6), 1);
  assert.strictEqual(G.nwSan(house, "v-ke"), 62); assert.ok(!house.npcCoop.at["v-ke"]);
  assert.strictEqual(G.npcTieLevel(house, "v-ke"), 0);
  for (let i = 1; i < C.ties[0]; i++) G.npcCoopDone(house, D, "v-ke", 70);
  assert.strictEqual(G.npcTieLevel(house, "v-ke"), 1); assert.strictEqual(house.npcTies["v-ke"].n, C.ties[0]);
});
T("每日任務 withNpc：40 分、靠「做過了」；P.cellar.coopNpc 是今天才算", G => {
  const P = G.newProfile("challenge"); G.ensureDay(P, "2026-11-23");
  assert.ok(G.STORY_TASKS.withNpc && G.STORY_TASKS.withNpc.act && G.STORY_TASKS.withNpc.pts === 40);
  G.storyAct(P, "withNpc", "2026-11-23"); assert.ok(G.storyState(P).acts["2026-11-23"].withNpc);
});
// ---------- 審查修正（11-21） ----------
T("審查 1：旅客也佔座位——3 位旅客＋1 真人，第 2 位館友加不進來", G => {
  const p = G.newParty({ pid: "p1", kind: "cellar", leader: "a", leaderNick: "甲", now: 1 });
  ["v-ke", "v-photo", "v-poet"].forEach(id => assert.ok(G.partyNpcAdd(p, "a", { npc: id, name: id }, 3).ok));
  assert.ok(!G.partyJoin(p, "b", "乙", 2).ok, "座位滿了，旅客也算");
  G.partyNpcRemove(p, "v-poet"); assert.ok(G.partyJoin(p, "b", "乙", 3).ok);
});
T("審查 1、3 備援：出發時人加旅客超過 4、或有人留守，canStartParty 擋下並說原因", G => {
  const p = G.newParty({ pid: "p1", kind: "cellar", leader: "a", leaderNick: "甲", now: 1 });
  G.partyJoin(p, "b", "乙", 2); Object.values(p.members).forEach(m => { m.ready = true; m.pick = ["k"]; });
  p.npcs = { "v-ke": { name: "a" }, "v-photo": { name: "b" }, "v-poet": { name: "c" } }; // 繞過 partyNpcAdd 的壞資料
  assert.ok(!G.canStartParty(p, "a").ok && /座位/.test(G.canStartParty(p, "a").reason));
  delete p.npcs["v-poet"]; assert.ok(G.canStartParty(p, "a").ok);
  p.members.b.guard = true; p.members.b.pick = []; assert.ok(!G.canStartParty(p, "a").ok && /留守/.test(G.canStartParty(p, "a").reason));
});
T("審查 2：出發時確認他還留給這一隊——被別隊請走就不行；沒人留（被清掉）就重新留給這一隊", G => {
  const house = mkHouse(G), n = G.NPC_ROSTER.find(x => x.id === "v-ke"), t = 1e12, C = G.NUM.casino.coopNpc;
  G.npcCoopAccept(house, D, n, "pA", "u1", t);
  assert.ok(G.npcCoopHold(house, D, "v-ke", "pA", "u1", t + 3600000), "過期了、但還沒別隊拿走：自己的，重新計時");
  assert.strictEqual(house.npcCoop.at["v-ke"].until, t + 3600000 + C.stayMin * 60000);
  G.npcCoopFree(house, "v-ke"); G.npcCoopAccept(house, D, n, "pB", "u2", t + 4000000);
  assert.ok(!G.npcCoopHold(house, D, "v-ke", "pA", "u1", t + 4000001), "別隊已經請走");
  assert.strictEqual(house.npcCoop.at["v-ke"].pid, "pB", "不動別隊的");
  G.npcCoopFree(house, "v-ke"); assert.ok(G.npcCoopHold(house, D, "v-ke", "pA", "u1", t + 5000000)); assert.strictEqual(house.npcCoop.at["v-ke"].pid, "pA");
});
T("審查 4：旅客這一趟受傷的佩佩，每一步重做 P 時還是受傷（不能上場）", G => {
  const info = { npc: "v-ke", role: "carry" }, key = G.coopNpcKey("v-ke");
  assert.ok(!G.coopNpcP(info, 1, 70, DATE).injured[key], "沒傷");
  assert.ok(G.coopNpcP(info, 1, 70, DATE, [key]).injured[key], "有傷");
});
T("審查 10：真人都走了、只剩旅客，趟結束（coopLeave 用 coopHumanVoters）", G => {
  const { run, Ps } = startWithNpc(G);
  G.coopLeave(run, Ps, "a"); assert.ok(run.phase === "over" || run.ended);
});

T("審查 5：floorDone 真人投完就結算（旅客不用等）；旅客理智低投回地面、其餘跟真人；平手領隊（真人）定", G => {
  const go = (san, vote) => { const { run, Ps } = startWithNpc(G, "carry", "basic", san); run.phase = "floorDone"; run.votes = {}; run.next = run.next || { floor: 2 }; run.members[1].san = san; const r = G.coopAct(run, Ps, "a", "floor", { go: vote }, 2000); assert.ok(r.ok); return run; };
  assert.strictEqual(go(70, "down").phase, "vote", "真人投下去、旅客不用等，直接下壹層");
  assert.ok(go(70, "up").ended, "真人投回地面就回地面");
  assert.strictEqual(go(30, "down").phase, "vote", "平手：領隊（真人）投下去");
  assert.ok(go(30, "up").ended);
});
T("審查 6：領隊只輪真人（旅客不當領隊）", G => {
  const { run } = startWithNpc(G);
  for (let i = 0; i < 4; i++) { G.coopNextLeader(run); assert.strictEqual(run.leader, "a"); }
});
console.log(fail ? `找 NPC 下地下：${fail} 項沒過` : `找 NPC 下地下：${pass} 項都過`); process.exit(fail ? 1 : 0);
