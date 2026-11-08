// 邀請、隊伍（shared/party.js）和兩個人一起融合（shared/logic3.js 的 fuseTogether）：node test/party.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0, G;
const T = (name, fn) => { try { G = load(); fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
const NOW = 1_800_000_000_000;

// ---------- 邀請 ----------
T("邀請：給對的人、60 秒內才能回", () => {
  const inv = G.newInvite({ iid: "i1", kind: "fusion", from: "a", fromNick: "小明", to: "b", toNick: "小華", now: NOW });
  assert.strictEqual(G.inviteProblem(inv, "b", NOW + 1000), null);
  assert.ok(G.inviteProblem(inv, "c", NOW), "別人不能回");
  assert.ok(G.inviteProblem(inv, "b", NOW + G.PARTY.inviteMs + 1), "過期");
  inv.state = "closed";
  assert.ok(G.inviteProblem(inv, "b", NOW), "結束了");
});

// ---------- 隊伍 ----------
const two = () => { const p = G.newParty({ pid: "p1", kind: "fusion", leader: "a", leaderNick: "小明", now: NOW }); G.partyJoin(p, "b", "小華", NOW + 1); return p; };
T("隊伍：一起融合最多兩個人", () => {
  const p = two();
  assert.strictEqual(G.partyMembers(p).length, 2);
  assert.strictEqual(G.partyJoin(p, "c", "小美", NOW + 2).ok, false);
});
T("隊伍：要選一隻才能準備；換了要重新準備", () => {
  const p = two();
  assert.strictEqual(G.partyReady(p, "a", true).ok, false);
  assert.ok(G.partyPick(p, "a", ["k1"]).ok);
  assert.ok(G.partyReady(p, "a", true).ok);
  assert.ok(G.partyPick(p, "a", ["k2"]).ok);
  assert.strictEqual(p.members.a.ready, false);
  assert.strictEqual(G.partyPick(p, "a", ["k1", "k2"]).ok, false, "一起融合每人 1 隻");
});
T("隊伍：隊長按開始，兩個人都準備好才行", () => {
  const p = two();
  G.partyPick(p, "a", ["k1"]); G.partyReady(p, "a", true);
  assert.strictEqual(G.canStartParty(p, "a").ok, false, "小華還沒準備");
  G.partyPick(p, "b", ["k9"]); G.partyReady(p, "b", true);
  assert.strictEqual(G.canStartParty(p, "b").ok, false, "不是隊長");
  assert.ok(G.canStartParty(p, "a").ok);
});
T("隊伍：隊長走了換人；沒人了就解散", () => {
  const p = two();
  G.partyPick(p, "b", ["k9"]); G.partyReady(p, "b", true);
  assert.ok(G.partyLeave(p, "a").ok);
  assert.strictEqual(p.leader, "b");
  assert.strictEqual(p.members.b.ready, false, "人變了重新準備");
  assert.strictEqual(G.partyLeave(p, "b").closed, true);
  assert.strictEqual(p.phase, "closed");
});
T("隊伍：Realtime Database 讀回來少了空陣列也能用", () => {
  const p = G.fixParty({ pid: "p", kind: "fusion", leader: "a", members: { a: { nick: "小明", joinedAt: 1 }, b: { nick: "小華", pick: { 0: "k1" }, ready: true, joinedAt: 2 } } });
  assert.strictEqual(JSON.stringify(p.members.a.pick), "[]"); // 測試的載入器在另一個環境，陣列要比 JSON
  assert.strictEqual(JSON.stringify(p.members.b.pick), "[\"k1\"]");
  assert.strictEqual(p.phase, "lobby");
});
T("說話：看不見的字拿掉、最多 50 字", () => {
  assert.strictEqual(G.cleanSay("  走這邊 \n 快點 "), "走這邊 快點");
  assert.strictEqual(G.cleanSay("a" + String.fromCharCode(0x200b) + "b"), "ab");
  assert.strictEqual([...G.cleanSay("呱".repeat(80))].length, G.PARTY.sayMax);
});

// ---------- 兩個人一起融合 ----------
const fresh = () => { const P = G.newProfile("challenge"); G.ensureDay(P, "2026-11-08"); P.insp = 100; return P; };
const give = (P, pick) => { const k = G.pepeKey(Object.assign({ 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" }, pick)); P.pepes[k] = { n: 1, perfect: false, s: 1, d: "2026-11-08" }; return k; };
T("一起融合：各扣各的靈感和次數，兩個人拿到同一隻", () => {
  const A = fresh(), B = fresh();
  const ka = give(A, { 顏色: "紅" }), kb = give(B, { 顏色: "藍" });
  const ia = A.insp, ib = B.insp;
  G.setRng(() => 0.3);
  const r = G.fuseTogether(A, { kind: "pepe", key: ka }, B, { kind: "pepe", key: kb });
  G.setRng(null);
  assert.ok(r.ok, r.reason);
  // 靈感：扣融合的錢之後，拿到新的佩佩可能又有獎勵（新收藏、徽章），所以比「兩個人一樣」，不直接算
  assert.strictEqual(A.day.fusions, 1); assert.strictEqual(B.day.fusions, 1);
  assert.ok(Object.keys(A.day.pairs).length === 1 && Object.keys(B.day.pairs).length === 1, "這一對兩邊都記下來");
  assert.strictEqual(A.insp, B.insp, "兩個人的靈感變化一樣");
  assert.ok(ia - A.insp !== 0 || ib - B.insp !== 0 || r.a.events.length > 0, "有扣錢或有獎勵");
  assert.ok(r.a.made && r.b.made, "兩個人都拿到");
  assert.strictEqual(r.a.made.key, r.b.made.key, "同一隻");
  assert.ok(A.pepes[ka] && B.pepes[kb], "爸媽不會被拿走");
});
T("一起融合：同一對今天不能再一次；不在收藏、自由模式、靈感不夠都擋", () => {
  const A = fresh(), B = fresh();
  const ka = give(A, {}), kb = give(B, { 顏色: "藍" });
  G.setRng(() => 0.3);
  assert.ok(G.fuseTogether(A, { kind: "pepe", key: ka }, B, { kind: "pepe", key: kb }).ok);
  assert.strictEqual(G.fuseTogether(A, { kind: "pepe", key: ka }, B, { kind: "pepe", key: kb }).ok, false, "同一對");
  assert.strictEqual(G.fuseTogether(A, { kind: "pepe", key: "沒有這隻" }, B, { kind: "pepe", key: kb }).who, "a");
  const F = G.newProfile("free"); G.ensureDay(F, "2026-11-08"); const kf = give(F, {});
  assert.strictEqual(G.fuseTogether(F, { kind: "pepe", key: kf }, B, { kind: "pepe", key: kb }).ok, false, "自由模式");
  const C = fresh(); C.insp = 0; const kc = give(C, { 顏色: "綠" });
  assert.strictEqual(G.fuseTogether(A, { kind: "pepe", key: ka }, C, { kind: "pepe", key: kc }).who, "b", "靈感不夠");
  G.setRng(null);
});
T("一起融合：同一個種子結果一樣（伺服器重算得出同一隻）", () => {
  const run = () => { const A = fresh(), B = fresh(); const ka = give(A, {}), kb = give(B, { 顏色: "藍" }); G.setRng((() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })()); const r = G.fuseTogether(A, { kind: "pepe", key: ka }, B, { kind: "pepe", key: kb }); G.setRng(null); return r.a.made ? r.a.made.key : "（理智用完）"; };
  assert.strictEqual(run(), run());
});

console.log(`${pass} passed, ${fail} failed（邀請、隊伍、一起融合）`);
process.exit(fail ? 1 : 0);
