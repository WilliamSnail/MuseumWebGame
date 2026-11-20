// 找 NPC 一起下地下：NPC 理智和「被邀請的負擔」的簡化模型（90 天）。node test/sim/sim_npc_cellar.cjs [天數 90]
// 用現在的 NPC 理智規則（NUM.casino.worldDoc.san：去地下每次 −2、一天最多 −4、去餐車 +1、完全沒來 +3、每天往 70 靠 1、低於 30 不去地下），
// 加上「陪玩家下去」：每趟 NPC 多扣 helpSan（隨層數），低於 minSan 不答應。館友每天 N 位、每位最多 perDayRuns 趟、有 pNpc 的機率帶 NPC。
// 簡化：不跑真的行程，在館的機率 pHere、NPC 自己去地下的機率照 route.cellar 權重。目的是看「哪些 NPC 被叫去最多、理智會不會掉到不能用」。
const { load } = require("../load_shared.cjs");
const G = load({ __realMoney: true }), S = G.NUM.casino.worldDoc.san;
const fs = require("fs"), path = require("path");
const dir = path.join(__dirname, "..", "..", "content", "npc");
const NPCS = fs.readdirSync(dir).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))).filter(n => n.kind !== "trace");
const DAYS = +process.argv[2] || 90;
const P = { pHere: 0.45, minSan: 40, helpSan: [1, 1, 2, 2, 3], maxRunsNpc: 2, pNpc: 0.4, runsPerPlayer: 1.5 };
const rng = (s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)(12345);
const weight = n => 1 + ((n.route && n.route.cellar) || 0) * 2; // 愛去地下的被邀得多（也比較肯去）
function sim(players, tag) {
  const san = {}; NPCS.forEach(n => { san[n.id] = S.start; });
  const inv = {}, low = { n: 0, tot: 0 }; NPCS.forEach(n => { inv[n.id] = 0; });
  let asked = 0, ok = 0, refusedLow = 0, refusedBusy = 0, refusedRoll = 0;
  for (let d = 0; d < DAYS; d++) {
    const today = {}; NPCS.forEach(n => { today[n.id] = { runs: 0, loss: 0, own: rng() < Math.min(0.9, 0.1 + 0.12 * ((n.route && n.route.cellar) || 0)), food: rng() < 0.3, came: rng() < 0.8 }; });
    const here = NPCS.filter(() => rng() < P.pHere);
    for (let i = 0; i < players; i++) {
      const runs = Math.floor(P.runsPerPlayer + rng());
      for (let r = 0; r < runs; r++) {
        if (rng() > P.pNpc || !here.length) continue;
        asked++;
        let tw = 0; here.forEach(n => { tw += weight(n); }); let x = rng() * tw, pick = here[0]; for (const n of here) { x -= weight(n); if (x <= 0) { pick = n; break; } }
        const t = today[pick.id];
        if (san[pick.id] < P.minSan) { refusedLow++; continue; }
        if (t.runs >= P.maxRunsNpc) { refusedBusy++; continue; }
        const pAcc = Math.min(0.95, 0.5 + 0.05 * ((pick.route && pick.route.cellar) || 0));
        if (rng() > pAcc) { refusedRoll++; continue; }
        ok++; t.runs++; inv[pick.id]++; t.loss += P.helpSan[Math.floor(rng() * P.helpSan.length)];
      }
    }
    NPCS.forEach(n => { const t = today[n.id]; let dv = 0;
      if (t.own || t.runs) dv += Math.max(S.cellarMax, S.cellar * (t.own ? 1 : 0) + (t.runs ? S.cellar : 0)); // 自己去或陪玩家去的地下站：−2、一天最多 −4
      dv -= t.loss; if (t.food && san[n.id] < S.start) dv += S.food; if (!t.came && !t.runs) dv += S.rest; else if (san[n.id] < S.start) dv += S.back; else if (san[n.id] > S.start) dv -= S.back;
      dv = Math.max(-S.daily, Math.min(S.daily, dv)); san[n.id] = Math.max(0, Math.min(100, san[n.id] + dv)); low.tot++; if (san[n.id] < S.lowRoute) low.n++; });
  }
  const arr = NPCS.map(n => ({ n, c: inv[n.id], s: san[n.id] })).sort((a, b) => b.c - a.c);
  const mean = arr.reduce((a, x) => a + x.s, 0) / arr.length;
  console.log(`${tag}：每天 ${players} 位館友（每位 ${P.runsPerPlayer} 趟、${P.pNpc * 100}% 帶 NPC）｜被問 ${asked}、答應 ${ok}（${(100 * ok / Math.max(1, asked)).toFixed(0)}%）；拒絕：理智低 ${refusedLow}、太累 ${refusedBusy}、不想去 ${refusedRoll}`);
  console.log(`   NPC 平均理智 ${mean.toFixed(1)}；有幾%的人天掉到 <${S.lowRoute}（不去地下）${(100 * low.n / low.tot).toFixed(1)}%；被邀最多的 3 位 ${arr.slice(0, 3).map(x => `${x.n.id} ${x.c} 次（理智 ${x.s.toFixed(0)}）`).join("、")}；90 天一次都沒被邀的 ${arr.filter(x => x.c === 0).length} 位`);
}
[0, 5, 15, 30].forEach(n => sim(n, n === 0 ? "沒有人邀（現況）" : "有人邀"));
