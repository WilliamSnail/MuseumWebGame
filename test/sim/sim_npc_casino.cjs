// 邀請 NPC 去賭場的模擬（11-14，決定 0080；11-17 加「壹次帶好幾位」）：node test/sim/sim_npc_casino.cjs [天數 30] [每天幾位館友 12] [每人壹次帶幾位，預設照 config 的 perHost]
// 每天 P 位館友各開壹桌、在不同時間邀 NPC（壹次邀到 K 位）、打到 NPC 都走；看全館 NPC 壹天的淨輸贏有沒有超過 dayCap、壹位 NPC 的最大輸贏、莊家、守恆（莊家＋已知世界＋館友錢包，差要是 0）。
const fs = require("fs"), path = require("path"), repo = path.join(__dirname, "..", "..");
const { load } = require("../load_shared.cjs");
const G = load();
const days = +process.argv[2] || 30, P = +process.argv[3] || 12, K = +process.argv[4] || G.NUM.casino.npcCas.perHost || 1;
if (K > (G.NUM.casino.npcCas.perHost || 1)) G.NUM.casino.npcCas.perHost = K, G.NUM.casino.npcCas.tableMax = Math.max(G.NUM.casino.npcCas.tableMax, K);
const TM = G.NUM.casino.npcCas.tableMax;
const LIST = fs.readdirSync(path.join(repo, "content", "npc")).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(path.join(repo, "content", "npc", f), "utf8")));
const add = (s, n) => new Date(Date.parse(s + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
G.setRng(G.mulberry32(1));
const house = G.casHouseFix(G.casHouseNew(), "2026-11-16").house;
let pDelta = 0, worst = 0, maxNpc = 0, rows = [], invites = 0, accepted = 0, hands = 0, stake = 0, capDays = 0, maxAt = 0;
const W0 = house.bankroll + house.world;
for (let d = 0; d < days; d++) {
  const day = add("2026-11-16", d), sec = "sim" + d, base = G.npcDayStartMs(day), b0 = house.bankroll, w0 = house.world;
  for (let p = 0; p < P; p++) {
    const t = G.casTNew({ pid: "t" + d + "_" + p, now: base }), uid = "u" + p, w = G.casWalletFix(G.casWalletNew(), day); w.chips = 10 ** 9; G.casTSit(t, uid, uid); w.tablePid = t.pid;
    const ctx = { wallets: { [uid]: w }, house, day, secret: sec, npcList: LIST, counters: null, says: [] };
    let now = base + (60 + Math.floor(G.RNG() * 1000)) * 60000;
    for (let k = 0; k < 3; k++) {
      // 壹次邀到 K 位（每位試壹次）
      for (let j = 0; j < K; j++) {
        const who = G.casTNpcWho(ctx, now, uid); if (!who.length) break;
        const pick = who[Math.floor(G.RNG() * who.length)]; invites++;
        const r = G.casTNpcInvite(t, ctx, uid, pick.id, now); if (r.ok && r.accepted) accepted++;
      }
      const npcs = () => Object.values(t.seats).filter(s => s.npc).length;
      maxAt = Math.max(maxAt, npcs());
      if (!npcs()) { now += 31 * 60000; continue; }
      for (let i = 0; i < 300 && npcs(); i++) {
        now += 60000;
        if (t.phase === "bet") G.casTBet(t, uid, "1000", { san: 99, bonusPct: 0 }, ctx, now);
        if (t.phase === "play" && t.turn === uid) G.casTAct(t, uid, "stand", t.seq, ctx, now);
        if (t.phase === "result") { for (const s of Object.values(t.seats)) if (s.npc && s.out) { hands++; stake += s.bet; } G.casTAdvance(t, ctx, t.deadline + 1); }
        else G.casTAdvance(t, ctx, now);
      }
    }
    G.casTNpcDrop(t, ctx); pDelta += w.chips - 10 ** 9;
  }
  const c = house.npcCas; worst = Math.max(worst, Math.abs(c.net)); if (Math.abs(c.net) >= G.NUM.casino.npcCas.dayCap) capDays++;
  for (const id of Object.keys(c.by)) maxNpc = Math.max(maxNpc, Math.abs(c.by[id].net));
  rows.push({ net: c.net, bank: house.bankroll - b0, world: house.world - w0 });
}
const avg = a => a.reduce((x, y) => x + y, 0) / a.length, fmt = n => Math.round(n).toLocaleString();
console.log(`每人最多帶 ${K}、桌上最多 ${TM}｜邀 ${invites}、答應 ${accepted}、桌上同時最多 ${maxAt} 位、NPC 打 ${hands} 手、總下注 ${fmt(stake)}`);
console.log(`  全館 NPC 壹天淨輸贏：平均 ${fmt(avg(rows.map(r => r.net)))}，最大 ${fmt(worst)}（上限 ${fmt(G.NUM.casino.npcCas.dayCap)}，碰到上限 ${capDays} 天）；壹位 NPC 壹天最大 ${fmt(maxNpc)}`);
console.log(`  莊家每天平均 ${fmt(avg(rows.map(r => r.bank)))}；守恆差（莊家＋已知世界 前後差）：${fmt(house.bankroll + house.world + pDelta - W0)}（館友錢包也算進去）`);
