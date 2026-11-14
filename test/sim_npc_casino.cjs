// 邀請 NPC 去賭場的模擬（11-14，決定 0080）：node test/sim_npc_casino.cjs [天數 30] [每天幾位館友 12]
// 每天 P 位館友各開壹桌、在不同時間邀 NPC、打到 NPC 走；看全館 NPC 壹天的淨輸贏、壹位 NPC 的最大輸贏、莊家有沒有受傷、守恆。
const fs = require("fs"), path = require("path");
const { load } = require("./load_shared.cjs");
const G = load();
const LIST = fs.readdirSync(path.join(__dirname, "..", "content", "npc")).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "content", "npc", f), "utf8")));
const days = +process.argv[2] || 30, P = +process.argv[3] || 12, add = (s, n) => new Date(Date.parse(s + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
G.setRng(G.mulberry32(1));
const house = G.casHouseFix(G.casHouseNew(), "2026-11-16").house;
let worst = 0, maxNpc = 0, rows = [], invites = 0, accepted = 0, hands = 0, stake = 0;
for (let d = 0; d < days; d++) {
  const day = add("2026-11-16", d), sec = "sim" + d, base = G.npcDayStartMs(day), b0 = house.bankroll, w0 = house.world;
  for (let p = 0; p < P; p++) {
    const t = G.casTNew({ pid: "t" + d + "_" + p, now: base }), uid = "u" + p, w = G.casWalletFix(G.casWalletNew(), day); w.chips = 10 ** 9; G.casTSit(t, uid, uid); w.tablePid = t.pid;
    const ctx = { wallets: { [uid]: w }, house, day, secret: sec, npcList: LIST, counters: null, says: [] };
    let now = base + (60 + Math.floor(G.RNG() * 1000)) * 60000;
    for (let k = 0; k < 3; k++) {
      const who = G.casTNpcWho(ctx, now); if (!who.length) { now += 20 * 60000; continue; }
      const pick = who[Math.floor(G.RNG() * who.length)]; invites++;
      const r = G.casTNpcInvite(t, ctx, uid, pick.id, now); if (!r.ok || !r.accepted) { now += 31 * 60000; continue; }
      accepted++;
      for (let i = 0; i < 200 && t.seats["n~" + pick.id]; i++) {
        now += 60000;
        if (t.phase === "bet") G.casTBet(t, uid, "1000", { san: 99, bonusPct: 0 }, ctx, now);
        if (t.phase === "play" && t.turn === uid) G.casTAct(t, uid, "stand", t.seq, ctx, now);
        if (t.phase === "result") { for (const s of Object.values(t.seats)) if (s.npc && s.out) { hands++; stake += s.bet; } G.casTAdvance(t, ctx, t.deadline + 1); }
      }
    }
    G.casTNpcDrop(t, ctx);
  }
  const c = house.npcCas; worst = Math.max(worst, Math.abs(c.net)); for (const id of Object.keys(c.by)) maxNpc = Math.max(maxNpc, Math.abs(c.by[id].net));
  rows.push({ day, net: c.net, bank: house.bankroll - b0, world: house.world - w0 });
}
const avg = a => a.reduce((x, y) => x + y, 0) / a.length, fmt = n => Math.round(n).toLocaleString();
console.log(`模擬 ${days} 天、每天 ${P} 位館友各開壹桌邀 NPC：邀 ${invites} 次、答應 ${accepted} 次、NPC 打了 ${hands} 手、總下注 ${fmt(stake)}`);
console.log(`NPC 全館壹天淨輸贏（正＝NPC 贏）：平均 ${fmt(avg(rows.map(r => r.net)))}，最大 ${fmt(worst)}（上限 ${fmt(G.NUM.casino.npcCas.dayCap)}）；壹位 NPC 壹天最大 ${fmt(maxNpc)}`);
console.log(`莊家每天平均 ${fmt(avg(rows.map(r => r.bank)))}（正＝莊家賺）；外面世界每天平均 ${fmt(avg(rows.map(r => r.world)))}`);
const sn = G.casBookSnap([], house, 0, "2026-12-30"); console.log("外面世界池 + 莊家 變化總和（淨進出 = 0 代表錢只是在兩邊搬）：", fmt(rows.reduce((a, r) => a + r.bank + r.world, 0)));
