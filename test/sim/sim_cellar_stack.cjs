// 地下收藏庫的加成疊加評估（11-16，翊文：「地城原本所有加成都只能套用一份，現在還是這樣嗎」）：
//   node test/sim/sim_cellar_stack.cjs [人數，預設 150]
// 比較「比讚（全隊 + 隊伍人數）、巫師帽（+wizard）、觸手帽（+tentacle）」的疊法：
//   現行＝同壹種只算壹份；上限 2／3 份（3 ＝ 全部都疊，隊伍只有 3 隻）；另外看觸手帽理智代價「只付壹次」還是「每頂都付」。
// 指標：最好的隊伍每層的強度、強度檢定平均過關率（1D10 ＋ 強度 ≥ 目標）、最好的隊伍是不是「全隊戴同壹種」（單壹最優解）、
//   以及「不靠這三種的隊伍」跟最好的差多少（其他配件有沒有被淘汰）。
const { G, CELLAR, buildProfile } = require("./sim_cellar.cjs");
const N = +process.argv[2] || 150, NUMFX = G.NUM.cellarFx;
// like 比讚、wiz 巫師帽、ten 觸手帽 各最多算幾份
const VARIANTS = [
  { name: "現行（各只算壹份）", like: 1, wiz: 1, ten: 1 },
  { name: "比讚疊到 2", like: 2, wiz: 1, ten: 1 },
  { name: "比讚＋巫師疊到 2", like: 2, wiz: 2, ten: 1 },
  { name: "比讚＋巫師全疊(3)", like: 3, wiz: 3, ten: 1 },
  { name: "三種都疊到 2", like: 2, wiz: 2, ten: 2 },
  { name: "全都疊（3 份）", like: 3, wiz: 3, ten: 3 },
];
// TENT=1：收藏裡另外補 12 隻戴觸手帽的（觸手帽是禁忌配件，平常的收藏模擬不帶；要看「觸手帽也能疊」就開）
const TENT = !!process.env.TENT;
const SHIFT = process.env.SHIFT ? +process.env.SHIFT : 0; // 目標加幾（看「門檻要加多少才維持現在的難度」）
const cnt = (items, f) => items.filter(f).length;
// 隊伍強度（照 shared/logic3.js teamPower，只把「比讚、巫師帽、觸手帽」換成可以疊的版本）
function power(P, items, room, v) {
  let t = items.reduce((n, it) => n + G.memberPower(it, room), 0);
  const like = cnt(items, it => it.pick.姿勢 === "比讚"), wiz = cnt(items, it => it.pick.帽子 === "巫師帽"), ten = cnt(items, it => it.pick.帽子 === "觸手帽");
  t += Math.min(like, v.like) * items.length + Math.min(wiz, v.wiz) * NUMFX.wizard + Math.min(ten, v.ten) * NUMFX.tentacle;
  const lf = G.limitedFx(items); if (lf.team) t = Math.max(0, t + lf.team);
  return t;
}
const pass = (tot, target) => Math.min(1, Math.max(0, (11 - Math.max(1, target - tot)) / 10));
function floorRooms(f) { return CELLAR.find(x => x.floor === f).rooms.filter(r => r.choices.some(c => c.check.type === "power")).map(r => ({ room: r, target: Math.min(...r.choices.filter(c => c.check.type === "power").map(c => c.check.target)) })); }
const ROOMS = [1, 2, 3, 4, 5].map(floorRooms);
function evalTeam(P, items, f, v) { let p = 0, tot = 0; ROOMS[f - 1].forEach(x => { const t = power(P, items, x.room, v); tot += t; p += pass(t, x.target + SHIFT); }); const n = ROOMS[f - 1].length || 1; return { p: p / n, tot: tot / n }; }
const kinds = it => (it.pick.姿勢 === "比讚" ? "比讚" : it.pick.帽子 === "巫師帽" ? "巫師帽" : it.pick.帽子 === "觸手帽" ? "觸手帽" : "");
const out = {};
for (const stage of ["early", "mid", "late"]) {
  const R = VARIANTS.map(() => ({ tot: [0, 0, 0, 0, 0], p: [0, 0, 0, 0, 0], mono: 0, sameKind: 0, nBoost: 0, noBoostGap: 0, rows: 0, noBoostP: [0, 0, 0, 0, 0] }));
  for (let i = 0; i < N; i++) {
    const rng = G.mulberry32(1000 + i * 7919), P = buildProfile(rng, stage);
    if (TENT && stage !== "early") { if (!P.unlocked.帽子.includes("觸手帽")) P.unlocked.帽子.push("觸手帽"); for (let k = 0; k < 12; k++) { const pick = {}; G.CATS.forEach(c => { const u = G.usable(P, c); pick[c] = u[Math.floor(rng() * u.length)]; }); pick.帽子 = "觸手帽"; G.finishMake(P, pick, { natural: 1 + Math.floor(rng() * 100) }); } }
    const keys = Object.keys(P.pepes);
    if (keys.length < 3) continue;
    const all = G.teamItems(P, keys);
    // 候選：個別強度最高的 14 隻 ＋ 有比讚／巫師帽／觸手帽的全部
    const base = all.map((it, k) => ({ it, k, s: G.memberPower(it, { mood: null }) })).sort((a, b) => b.s - a.s);
    const pool = new Set(base.slice(0, 14).map(x => x.k)); base.forEach(x => { if (kinds(x.it)) pool.add(x.k); });
    const idx = [...pool];
    VARIANTS.forEach((v, vi) => {
      for (let f = 1; f <= 5; f++) {
        let best = null, bestNo = null;
        for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) for (let c = b + 1; c < idx.length; c++) {
          const items = [all[idx[a]], all[idx[b]], all[idx[c]]], e = evalTeam(P, items, f, v);
          if (!best || e.p > best.e.p || (e.p === best.e.p && e.tot > best.e.tot)) best = { e, items };
          if (!items.some(kinds) && (!bestNo || e.p > bestNo.p || (e.p === bestNo.p && e.tot > bestNo.tot))) bestNo = e;
        }
        R[vi].tot[f - 1] += best.e.tot; R[vi].p[f - 1] += best.e.p; R[vi].noBoostP[f - 1] += bestNo ? bestNo.p : 0;
        const ks = best.items.map(kinds).filter(Boolean);
        R[vi].rows++; R[vi].nBoost += ks.length;
        if (ks.length >= 2 && new Set(ks).size === 1) R[vi].sameKind++;
        if (ks.length === 3) R[vi].mono++;
      }
    });
  }
  out[stage] = R;
}
const per = (x, n) => (x / n * 100).toFixed(0) + "%";
console.log(`人數 ${N}；每個人、每層找最好的 3 隻隊伍（候選：強度前 14 ＋ 所有有比讚／巫師帽／觸手帽的）。強度檢定過關率＝1D10 ＋強度 ≥ 該房最低目標（不含皇冠重擲）。`);
for (const stage of ["early", "mid", "late"]) {
  console.log(`\n== 收藏 ${stage} ==`);
  out[stage].forEach((r, vi) => {
    const n = r.rows / 5;
    console.log(`${VARIANTS[vi].name.padEnd(16, "　")} 強度 B1..B5 ${r.tot.map(x => (x / n).toFixed(1)).join(" ")}｜過關率 ${r.p.map(x => per(x, n)).join(" ")}｜不靠這三種的最好隊伍過關率 ${r.noBoostP.map(x => per(x, n)).join(" ")}｜最好的隊伍裡有這三種的平均 ${(r.nBoost / r.rows).toFixed(2)} 隻、其中同壹種 ≥2 隻的占 ${per(r.sameKind, r.rows)}、三隻全是 ${per(r.mono, r.rows)}`);
  });
}
