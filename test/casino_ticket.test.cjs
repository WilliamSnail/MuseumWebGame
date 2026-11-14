// 展廳參觀者門票（11-14 改版，決定 0079）：node test/casino_ticket.test.cjs（npm test 也會跑）
// 到訪的人（有名字的 NPC、散客）到的那刻自己付票（shared/npc_spend.js），玩家領的是「分紅池」：驗證 key、先領的拿壹半、總額不超過池子、每天 perDay 位、散客照人數、冪等、守恆、自由模式不領。
const assert = require("assert"), fs = require("fs"), path = require("path");
const { G, buildProfile } = require("./sim_cellar.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { try { G.setRng(G.mulberry32(5)); G.NUM.casino.grants = []; fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 5).join("\n    ")); } };
const D1 = "2026-11-16", D2 = "2026-11-17", SEC = "祕密";
const LIST = fs.readdirSync(path.join(__dirname, "..", "content", "npc")).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "content", "npc", f), "utf8")));
const C = () => G.NUM.casino.ticket;
const hallP = () => { const P = buildProfile(G.mulberry32(3), "mid"); Object.keys(P.pepes).slice(0, 6).forEach((k, i) => G.placeInHall(P, i, { kind: "pepe", key: k })); return P; };
const mk = () => ({ w: G.casWalletFix(G.casWalletNew(), D1), house: G.casHouseFix(G.casHouseNew(), D1).house });
const total = s => { const sn = G.casBookSnap([s.w], s.house, 0, D1); return G.casBookTotal(sn) - G.casBookMinted(sn) + G.casBookBurned(sn); };
const end = G.npcDayStartMs(D1) + 1110 * 60000;
const settle = s => G.casNpcLive(s.house, D1, end, SEC, LIST, null); // 整天的人都到了
const feed = () => G.hallFeed(D1, SEC, LIST, null, 0, end);
const claim = (s, P, keys, now = end) => G.casTicketClaimKeys(s.w, s.house, P, D1, keys, SEC, LIST, null, now);

T("設定：分紅池比例、先領的拿幾成、每天幾位", () => { assert.ok(C().ownerPct > 0 && C().ownerPct <= 100 && C().firstPct > 0 && C().firstPct <= 100 && C().perDay > 0); });
T("時刻表：有名字的壹位 n＝1、散客壹組 n＝人數；key 唯一；只給時間窗口內的；結算後每個到訪都有分紅池", () => {
  const f = feed(); assert.ok(f.some(e => e.kind === "npc" && e.n === 1) && f.some(e => e.kind === "crowd" && e.n >= 1));
  assert.strictEqual(new Set(f.map(e => e.key)).size, f.length);
  const mid = f[Math.floor(f.length / 2)].at, w = G.hallFeed(D1, SEC, LIST, null, mid - 60000, mid + 60000); assert.ok(w.length >= 1 && w.length < f.length && w.every(e => e.at >= mid - 60000 && e.at <= mid + 60000));
  const s = mk(); settle(s); const pots = s.house.hallPot.keys; assert.ok(f.every(e => pots[e.key] ? pots[e.key].n === e.n : true)); assert.ok(Object.keys(pots).length >= 1);
});
T("領分紅：驗證 key（不在表裡、還沒到的不算）、先領的拿池子的壹半、同壹個 key 不能領兩次；錢從預算池搬給玩家，守恆", () => {
  const s = mk(), P = hallP(); settle(s); const t0 = total(s), f = feed().filter(e => s.house.hallPot.keys[e.key]), e = f[0], pot = s.house.hallPot.keys[e.key], left0 = pot.left, b0 = s.house.budget, c0 = s.w.chips;
  assert.strictEqual(claim(s, P, ["亂寫的 key"]).n, 0, "不在表裡不算"); assert.strictEqual(claim(s, P, [e.key], e.at - 1000).n, 0, "還沒到不算");
  const r = claim(s, P, [e.key, e.key]); assert.strictEqual(r.n, Math.min(e.n, C().perDay)); assert.strictEqual(r.total, Math.floor(left0 * C().firstPct / 100 * r.n / pot.n));
  assert.strictEqual(s.w.chips - c0, r.total); assert.strictEqual(b0 - s.house.budget, r.total); assert.strictEqual(pot.left, left0 - r.total);
  assert.strictEqual(claim(s, P, [e.key]).n, 0, "同壹個 key 不能領兩次"); assert.strictEqual(total(s), t0, "守恆");
});
T("池子總額不超過：很多位玩家領同壹個到訪，後來的拿再剩下的壹半", () => {
  const s = mk(); settle(s); const e = feed().find(x => x.kind === "npc" && s.house.hallPot.keys[x.key]), pot = s.house.hallPot.keys[e.key], total0 = pot.left; let got = 0;
  for (let i = 0; i < 12; i++) { const w = G.casWalletFix(G.casWalletNew(), D1), r = G.casTicketClaimKeys(w, s.house, hallP(), D1, [e.key], SEC, LIST, null, end); got += r.total; }
  assert.ok(got <= total0 && pot.left >= 0 && got + pot.left === total0, `${got} + ${pot.left} = ${total0}`);
});
T("每天最多 perDay 位的分紅；散客壹組照人數算（旅行團用掉很多），剩下的名額不夠就按比例；換日重算", () => {
  const s = mk(), P = hallP(); settle(s); const f = feed().filter(e => s.house.hallPot.keys[e.key]);
  const r = claim(s, P, f.map(e => e.key)); assert.ok(r.n <= C().perDay && r.n > 0, "n " + r.n); assert.strictEqual(G.casTicketLeft(s.w, D1), C().perDay - r.n);
  const s2 = mk(); const big = f.find(e => e.kind === "crowd" && e.n >= 8); if (big) { s2.house.hallPot = s.house.hallPot; s2.w.tix = { day: D1, n: C().perDay - 3, keys: [] }; const r2 = claim(s2, P, [big.key]); assert.strictEqual(r2.n, 3, "剩 3 個名額：只算 3 位"); }
  assert.strictEqual(G.casTicketLeft(s.w, D2), C().perDay);
});
T("自由模式、沒有挑戰存檔不領；舊錢包沒有 tix 補得起來；空的 keys 沒事", () => {
  const s = mk(); settle(s); assert.ok(!claim(s, null, ["x"]).ok); assert.ok(!claim(s, G.newProfile("free"), ["x"]).ok);
  const w = G.casWalletFix({ v: 1, chips: 5 }, D1); assert.ok(w.tix);
  assert.strictEqual(claim(s, hallP(), []).n, 0); assert.strictEqual(claim(s, hallP(), undefined).n, 0);
});
T("全館累計參觀展廳人次（故事線）在到訪那刻算：有名字壹位、散客照人數", () => {
  const s = mk(); settle(s); const f = feed(); assert.strictEqual(s.house.npcc.hall, f.reduce((a, e) => a + e.n, 0));
});
T("瀏覽器 visitorArrive(P, rng, entry)：有名字的 NPC 壹位算壹次、散客壹組 n 位算 n 次（靈感照人數、每日上限不動）；沒有展廳不來", () => {
  const P = hallP(), before = P.insp, hv = P.hallVisitors, step = G.NUM.visitorStep, score = G.hallScore(P).score, per = 1 + Math.floor(score / step);
  const a = G.visitorArrive(P, undefined, { kind: "npc", npc: "v-bai", who: "白伯", n: 1 }); assert.ok(a && a.gain === Math.min(per, G.NUM.visitorInspDay)); assert.strictEqual(P.hallVisitors, hv + 1);
  const P2 = hallP(), b = G.visitorArrive(P2, undefined, { kind: "crowd", label: "旅行團", n: 12 }); assert.strictEqual(b.who, "旅行團"); assert.strictEqual(P2.hallVisitors - 0, 12 + (hallP().hallVisitors || 0)); assert.strictEqual(b.gain, Math.min(per * 12, G.NUM.visitorInspDay));
  assert.strictEqual(b.crowd, 12, "散客那壹組的人數記在 crowd（展廳卡片標散客用）"); assert.strictEqual(a.crowd, undefined, "有名字的 NPC 沒有 crowd"); assert.strictEqual(P2.visitorLog[0].crowd, 12);
  const P3 = hallP(); for (let i = 0; i < 10; i++) G.visitorArrive(P3, undefined, { kind: "crowd", label: "旅行團", n: 12 }); assert.ok(P3.hallInsp.n <= G.NUM.visitorInspDay, "每日上限不動");
  const F = G.newProfile("challenge"); assert.strictEqual(G.visitorArrive(F, undefined, { kind: "crowd", label: "x", n: 2 }), null, "沒有展廳不來");
});
console.log(`展廳參觀者門票：${pass} 過，${fail} 沒過`);
process.exit(fail ? 1 : 0);
