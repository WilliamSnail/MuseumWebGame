// 模擬地下室改版的打怪物（shared/cellar_fight.js，決定 0067）：1～4 個人，每層的一般怪物和守門各打很多場
// node test/sim_fight.cjs [次數，預設 300]　　RANK=3 node test/sim_fight.cjs 200 看 3 級的怪物
//   SHOW=sum 只印「普通／等級 2／等級 3／守門」四類的平均勝率（調數值用）；SHOW=end 另外印結局和背包得失
//   POLICY=basic 回到舊選法（只看穿、推、擋），拿來對照
// 隊員的收藏照 sim_cellar.cjs 的 buildProfile（B1、B2 用 early，B3、B4 用 mid，B5 用 late）；每個人帶對這隻怪物最強的 2 隻，不滿 3 隻館方助手補。
// 選法（很單純，當成「普通會玩的人」，POLICY=full 預設）：
//   撤退　　自己理智剩 5 以下、而且怪物下一招會扣自己（嚇自己、或全體）：自己回地面（retreat）。
//   逃跑　　第 2 回合起，全隊站著的佩佩剩不到三分之一、或平均理智剩 8 以下，而且怪物的壓力還有一半以上：一半的人選逃跑（要過半才擲），其他人照常打。
//   看穿　　還沒找到弱點、自己看穿有五成以上：第一個這樣的人看穿。
//   安撫　　隊伍已經有人受傷（站著的佩佩剩七成以下、或平均理智低於 25），怪物下一招是打人（hit）或全體（all）、而且有夠多人（過半）安撫成功率有五成五以上：這些人安撫（過半成功才取消），其他人推。
//   擋　　　怪物要撲自己、自己只剩一隻：擋；理智剩不到 15、怪物要嚇自己：擋。
//   其他都推。招式（帽子、姿勢）不用、不按時機（所以實際會比這個好打一點）。
// 每一場都重新給膽量（壯膽）；真的一趟只給一次，所以多人的「每人扣理智」這裡會偏低。
// 背包：每個人帶 BAG 點靈感（預設 8）進來，算「這一場的背包得失」：贏＝合作多給的靈感（fightWinInsp）；全隊倒下＝背包剩一半（NUM.cellarMap.bagKeep）；逃跑、撤退、怪物走掉＝背包不扣
// 印出：贏的比例、平均幾回合、每個人平均扣多少理智、每個人平均倒下幾隻
// 別的工具也用這支：tools/new_level.cjs 用 simFoe 幫每天的新怪物調難度
const { G, buildProfile } = require("./sim_cellar.cjs");
// FIGHT='{"perPlayer":0.8}' 臨時改 NUM.fight 的數字；FOEHP='{"normal":1.2,"boss":1.1}' 臨時把普通怪物、守門的壓力乘幾倍（調數值時用，不會存）
if (process.env.FIGHT) Object.assign(G.NUM.fight, JSON.parse(process.env.FIGHT));
if (process.env.FOEHP) { const m = JSON.parse(process.env.FOEHP); G.CELLAR_FOES.forEach(f => { const k = f.boss ? m.boss : m.normal; if (k) { f.hp = Math.round(f.hp * k); if (f.hp2) f.hp2 = Math.round(f.hp2 * k); } }); }
const STAGE = { 1: "early", 2: "early", 3: "mid", 4: "mid", 5: "late" };
const POOL = 40, cache = new Map();
const POLICY = process.env.POLICY || "full", BAG = +process.env.BAG || 8;
function profile(floor, n) {
  const stage = STAGE[floor] || "late", id = stage + ":" + (n % POOL);
  if (!cache.has(id)) cache.set(id, JSON.stringify(buildProfile(G.mulberry32(1000 + (n % POOL) * 7919 + { early: 1, mid: 2, late: 3 }[stage] * 104729), stage)));
  return JSON.parse(cache.get(id));
}
function bestKeys(P, foe, k) {
  return Object.keys(P.pepes).filter(x => !P.injured[x]).map(x => [x, G.memberPower(G.teamItems(P, [x])[0], foe)]).sort((a, b) => b[1] - a[1]).slice(0, k).map(x => x[0]);
}
function pick(f, s) {
  const it = f.intent, mine = it && it.to === s.id;
  if (mine && it.kind === "hit" && G.fightUp(s).length === 1) return { act: "guard" };
  if (mine && it.kind === "scare" && s.san < 15) return { act: "guard" };
  return { act: "push" };
}
// 全隊這一回合的選法。st.pepes ＝開打時全隊帶幾隻
function pickAll(f, st) {
  const acts = G.fightActors(f), picks = {}, it = f.intent || {};
  if (POLICY === "basic") {
    let seer = false;
    acts.forEach(s => { if (!f.weak && !seer && G.fightSeeChance(s, f) >= 50) { picks[s.id] = { act: "see" }; seer = true; } else picks[s.id] = pick(f, s); });
    return picks;
  }
  const left = new Set(acts);
  // 撤退：理智快沒了、又還會被扣的人自己走
  acts.forEach(s => { if (s.san <= 5 && (it.kind === "all" || (it.kind === "scare" && it.to === s.id))) { picks[s.id] = { act: "retreat" }; left.delete(s); } });
  // 逃跑：快輸了（站著的佩佩太少、或理智太低），而且怪物還剩一半以上（不是快贏了）
  const up = acts.reduce((n, s) => n + G.fightUp(s).length, 0), avgSan = acts.length ? acts.reduce((n, s) => n + s.san, 0) / acts.length : 0;
  if (f.round >= 2 && left.size && (up < st.pepes / 3 || avgSan <= 8) && f.hp > f.hpMax * 0.5) {
    const need = Math.ceil(acts.length / 2);
    [...left].slice(0, Math.max(0, need - Object.values(picks).filter(p => p.act === "flee").length)).forEach(s => { picks[s.id] = { act: "flee" }; left.delete(s); });
  }
  // 看穿
  let seer = false;
  [...left].forEach(s => { if (!f.weak && !seer && G.fightSeeChance(s, f) >= 50) { picks[s.id] = { act: "see" }; left.delete(s); seer = true; } });
  // 安撫：這一招危險，而且過半的人有把握
  const hurt = up < st.pepes * 0.7 || avgSan < 25; // 趕時間的時候（沒人受傷）不安撫：每回合都要推，不然回合用完牠就走了
  if ((it.kind === "hit" || it.kind === "all") && hurt) {
    const need = Math.ceil(acts.length / 2), can = [...left].filter(s => G.fightCalmChance(s, f) >= 55).sort((a, b) => G.fightCalmChance(b, f) - G.fightCalmChance(a, f));
    if (can.length >= need) can.slice(0, need).forEach(s => { picks[s.id] = { act: "calm" }; left.delete(s); });
  }
  left.forEach(s => { picks[s.id] = pick(f, s); });
  return picks;
}
// 打一場。foe ＝內建的怪物（CELLAR_FOES 的一項）或每天的內容寫的整份怪物（要有 floor）
function one(foe, players, run, rank = 1) {
  G.setRng(G.mulberry32(run * 131 + players * 17 + foe.floor * 7 + (foe.boss ? 3 : 0)));
  const seats = [];
  for (let j = 0; j < players; j++) { const P = profile(foe.floor, run * 4 + j); seats.push(G.fightSeat(P, "p" + j, "p" + j, bestKeys(P, foe, 2))); }
  const n = seats.reduce((a, s) => a + s.pepes.length, 0);
  if (n < G.COOP.teamMin) seats.push(G.fightHelperSeat(Array.from({ length: G.COOP.teamMin - n }, (_, i) => G.coopHelperItem(i))));
  const f = G.fightStart(G.fightFoe(foe.id) ? foe.id : foe, seats, { rank });
  if (!f) throw new Error("開不了這一場（怪物沒過 fightFoeCheck？）");
  const st = { pepes: seats.reduce((a, s) => a + s.pepes.length, 0) };
  const o = { win: 0, rounds: 0, san: 0, downs: 0, bag: 0 };
  while (!f.over) {
    const r = G.fightRound(f, pickAll(f, st));
    Object.values(r.fx).forEach(x => { o.san += x.san; o.downs += x.downs.length; });
  }
  o.win = f.over === "win" ? 1 : 0; o.rounds = f.round; o.over = f.over;
  o.san /= players; o.downs /= players;
  // 背包得失（每個真人）：贏＝合作多給的靈感；全隊倒下＝背包剩一半；逃跑、撤退、走掉＝不扣
  o.bag = f.over === "win" ? G.fightWinInsp(players, rank) : f.over === "lose" ? -Math.floor(BAG / G.NUM.cellarMap.bagKeep) : 0;
  return o;
}
// 打很多場的平均：{ win（0～1）, rounds, san, downs, bag, ends（結局的比例）}
function simFoe(foe, players, runs = 200, rank = 1) {
  const t = { win: 0, rounds: 0, san: 0, downs: 0, bag: 0 }, ends = { win: 0, lose: 0, flee: 0, retreat: 0, away: 0 };
  for (let i = 0; i < runs; i++) { const o = one(foe, players, i, rank); t.win += o.win; t.rounds += o.rounds; t.san += o.san; t.downs += o.downs; t.bag += o.bag; ends[o.over] = (ends[o.over] || 0) + 1; }
  G.setRng(null);
  Object.keys(ends).forEach(k => { ends[k] /= runs; });
  return { win: t.win / runs, rounds: t.rounds / runs, san: t.san / runs, downs: t.downs / runs, bag: t.bag / runs, ends };
}
module.exports = { G, simFoe };

if (require.main === module) {
  const RUNS = +process.argv[2] || 300;
  const RANK = +process.env.RANK || 1; // RANK=3：怪物的等級（1～3，守門不分）
  const SHOW = process.env.SHOW || "";
  const pad = (s, n) => String(s).padEnd(n);
  const pct = x => Math.round(x * 100) + "%";
  if (SHOW === "sum") {
    // 四類怪物 × 1～4 人的平均勝率（每層每隻的平均）
    const kinds = [["普通（等級 1）", f => !f.boss, 1], ["菁英（等級 2）", f => !f.boss, 2], ["強（等級 3）", f => !f.boss, 3], ["守門", f => f.boss, 1]];
    console.log(`每格 ${RUNS} 場，選法 ${POLICY}。四類怪物的平均勝率（B1～B5 全部的平均）`);
    kinds.forEach(([name, pickF, rank]) => {
      const row = [1, 2, 3, 4].map(players => {
        const foes = G.CELLAR_FOES.filter(pickF), w = foes.map(f => simFoe(f, players, RUNS, rank).win);
        return pct(w.reduce((a, b) => a + b, 0) / w.length);
      });
      console.log(`${pad(name, 12)} ${row.map((x, i) => `${i + 1}人 ${pad(x, 5)}`).join(" ")}`);
    });
  } else {
    console.log(`打怪物的模擬，每格 ${RUNS} 場，等級 ${RANK}，選法 ${POLICY}。欄位：贏 %／平均回合／每人扣理智／每人倒下幾隻${SHOW === "end" ? "／結局 贏倒逃撤走（%）／每人背包得失" : ""}`);
    G.cellarFloors().forEach(floor => {
      G.CELLAR_FOES.filter(f => f.floor === floor).forEach(foe => {
        const cells = [1, 2, 3, 4].map(players => {
          const t = simFoe(foe, players, RUNS, RANK);
          let s = `${players}人 ${pad(pct(t.win), 5)}${pad(t.rounds.toFixed(1), 5)}${pad(t.san.toFixed(1), 5)}${pad(t.downs.toFixed(2), 5)}`;
          if (SHOW === "end") s += ["win", "lose", "flee", "retreat", "away"].map(k => Math.round(t.ends[k] * 100)).join("/") + " " + t.bag.toFixed(1);
          return s;
        });
        console.log(`B${floor} ${pad(G.fightFoeName(foe.id) + (foe.boss ? "（守門）" : ""), 14)} ${cells.join(" | ")}`);
      });
    });
  }
}
