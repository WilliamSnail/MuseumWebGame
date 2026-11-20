// 每日任務活躍積分的模擬（決定 0145 草稿）：node test/sim/task_points_sim.cjs [--days 90] [--seed 1]
// 看：幾天拿滿 120、一週到 500 的人有多少、靈感／心情跟現在比、籌碼比大禮包和簽到小多少、排程塞得下嗎、刷分最多拿多少。
// 只讀自己的參數，不碰 repo 的其他檔，不碰正式站。數字都在最上面的 CFG，改好直接跑。
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const DAYS = arg("--days", 91), SEED = arg("--seed", 1);
let s = SEED >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = a => a[Math.floor(rnd() * a.length)];

const CFG = {
  dayCap: 120, weekGoal: 500,
  // 種類：pts 積分、min 大約幾分鐘、chip 伺服器看得到才給籌碼（其他只給積分）、fixed ＝每天都有的（書、特展），不算進「同一種一週最多 2 次」
  kinds: {
    read: { pts: 25, min: 2.5, fixed: 1 }, show: { pts: 30, min: 3, fixed: 1 },
    sign: { pts: 10, min: 0.5 }, board: { pts: 10, min: 0.5 },
    hug: { pts: 15, min: 1 }, view: { pts: 15, min: 1 }, make: { pts: 25, min: 2 }, deliver: { pts: 20, min: 1.5 }, pillow: { pts: 20, min: 1.5 },
    fuse: { pts: 30, min: 2.5 }, cellar: { pts: 40, min: 4 }, lesson: { pts: 20, min: 1.5 }, stockLook: { pts: 15, min: 1 },
    casino: { pts: 20, min: 1.5, chip: 1 }, bank: { pts: 20, min: 1.5, chip: 1 }, food: { pts: 15, min: 1, chip: 1 }, visit: { pts: 25, min: 2, chip: 1 }, gift: { pts: 30, min: 2, chip: 1 },
  },
  perKindWeek: 2, flexPerDay: 4,            // 每天 2 個固定（書、特展）＋ 4 個挑的 ＝ 6 個
  // 一個任務自己的獎勵，照積分（現在每個任務平均 靈感 1.33、心情 1.67）
  reward: { 10: {}, 15: { mood: 1 }, 20: { mood: 2 }, 25: { insp: 1 }, 30: { insp: 1, mood: 1 }, 40: { insp: 2 } },
  taskChip: 30000, taskChipDay: 2,           // 伺服器看得到的任務各給 3 萬，一天最多算 2 個
  miles: [{ at: 100, mood: 5 }, { at: 200, insp: 3 }, { at: 300, chips: 100000 }, { at: 400, insp: 4, chips: 200000 }],
  big: { at: 500, stamps: 2, items: 1, boxes: [{ w: 50, chips: 600000 }, { w: 35, chips: 1200000 }, { w: 15, chips: 3000000 }] },
  // 現在的：每天 3 個任務（靈感 1.33、心情 1.67 平均）＋全做完多一份（物品：舊畫布、金線、金箔輪著，不算靈感）
  now: { tasksPerDay: 3, insp: 1.33, mood: 1.67 },
  packEV: 1691700, packsPerDay: 2, signWeek: 375000, worldGrow: { "-1": 4000000, 0: 5000000, 1: 6000000 },
};
const K = CFG.kinds, flexKinds = Object.keys(K).filter(k => !K[k].fixed);

// 排一週：每天 read、show ＋ 4 個挑的；同一種一週最多 2 次；同一天不重複
function planWeek() {
  const used = {}, week = []; flexKinds.forEach(k => { used[k] = 0; });
  for (let d = 0; d < 7; d++) {
    const day = ["read", "show"], today = new Set(day);
    let guard = 0;
    while (day.length < 2 + CFG.flexPerDay && guard++ < 500) {
      const lo = Math.min(...flexKinds.filter(x => !today.has(x)).map(x => used[x])); // 先挑用得最少的（排程工具照這個排）
      const k = pick(flexKinds.filter(x => !today.has(x) && used[x] === lo));
      if (used[k] >= CFG.perKindWeek) break;
      used[k] = (used[k] || 0) + 1; today.add(k); day.push(k);
    }
    week.push(day);
  }
  return { week, ok: week.every(x => x.length === 2 + CFG.flexPerDay) };
}

// 一天：給多少分鐘，從 offered 裡挑「每分鐘最多分」的，直到分鐘用完或滿 120
function playDay(tasks, minutes, cap) {
  const order = tasks.map(k => ({ k, v: K[k].pts / K[k].min })).sort((a, b) => b.v - a.v);
  let pts = 0, used = 0; const done = [];
  for (const o of order) {
    if (pts >= cap) break;
    const t = K[o.k]; if (used + t.min > minutes + 1e-9) continue;
    done.push(o.k); pts += t.pts; used += t.min;
  }
  return { done, pts: Math.min(cap, pts), raw: pts, used };
}
const rewardOf = pts => CFG.reward[pts] || {};

// 玩家型：每天花幾分鐘、一週玩幾天、有沒有補做
const TYPES = [
  { name: "偷懶型（每天最便宜的拿滿 120）", min: 99, days: 7, cheapest: 1 },
  { name: "輕鬆（每天 6 分、一週 5 天）", min: 6, days: 5 },
  { name: "一般（每天 12 分、天天來）", min: 12, days: 7 },
  { name: "重度（每天 25 分、天天來）", min: 25, days: 7 },
  { name: "週末型（只有 2 天、每天 30 分，補做前面的）", min: 30, days: 2, late: 1 },
  { name: "隔天來（一週 3 天、每天 12 分）", min: 12, days: 3 },
];
function simType(T) {
  const weeks = Math.floor(DAYS / 7), out = { pts: 0, got500: 0, insp: 0, mood: 0, chips: 0, full: 0, days: 0, miles: 0, wk: [] };
  for (let w = 0; w < weeks; w++) {
    const { week } = planWeek(); let total = 0, chipTasks = {}, ins = 0, mo = 0, ch = 0;
    const buckets = week.map(() => 0);
    const dayIdx = T.days === 7 ? [0, 1, 2, 3, 4, 5, 6] : T.days === 5 ? [0, 1, 2, 3, 4].map(i => i + (rnd() < 0.4 ? 1 : 0)).slice(0, 5) : T.days === 3 ? [0, 2, 4] : [5, 6];
    for (const di of dayIdx) {
      const tasks = week[di];
      // 偷懶型：只選最便宜的幾個到 120
      let r;
      if (T.cheapest) { const ord = tasks.map(k => ({ k, c: K[k].min / K[k].pts })).sort((a, b) => a.c - b.c); let p = 0, u = 0; const done = []; for (const o of ord) { if (p >= CFG.dayCap) break; done.push(o.k); p += K[o.k].pts; u += K[o.k].min; } r = { done, pts: Math.min(CFG.dayCap, p), raw: p, used: u }; }
      else r = playDay(tasks, T.min, CFG.dayCap);
      // 補做前面的天（週末型）：用剩下的分鐘補，積分進那一天的桶子，每天封頂 120
      buckets[di] = Math.min(CFG.dayCap, buckets[di] + r.pts);
      let cd = 0; r.done.forEach(k => { const rw = rewardOf(K[k].pts); ins += rw.insp || 0; mo += rw.mood || 0; if (K[k].chip && cd < CFG.taskChipDay) { ch += CFG.taskChip; cd++; } });
      if (T.late) for (let dj = 0; dj < di; dj++) { const left = CFG.dayCap - buckets[dj]; if (left <= 0) continue; const rr = playDay(week[dj], T.min, left); buckets[dj] += rr.pts; rr.done.forEach(k => { const rw = rewardOf(K[k].pts); ins += rw.insp || 0; mo += rw.mood || 0; }); }
    }
    total = buckets.reduce((a, b) => a + b, 0);
    out.pts += total; out.days += dayIdx.length; out.full += buckets.filter(b => b >= CFG.dayCap).length;
    CFG.miles.forEach(m => { if (total >= m.at) { ins += m.insp || 0; mo += m.mood || 0; ch += m.chips || 0; out.miles++; } });
    if (total >= CFG.big.at) { out.got500++; const tot = CFG.big.boxes.reduce((a, b) => a + b.w, 0); let x = rnd() * tot, bx = CFG.big.boxes[0]; for (const b of CFG.big.boxes) { if ((x -= b.w) < 0) { bx = b; break; } } ch += bx.chips; }
    out.insp += ins; out.mood += mo; out.chips += ch; out.wk.push(total);
  }
  out.weeks = weeks; return out;
}

const fmt = n => Math.round(n).toLocaleString("en-US"), f1 = n => (Math.round(n * 10) / 10).toFixed(1);
console.log(`=== 活躍積分模擬：${DAYS} 天（${Math.floor(DAYS / 7)} 週）、種子 ${SEED} ===`);
console.log(`每天 ${2 + CFG.flexPerDay} 個任務（書、特展＋${CFG.flexPerDay} 個挑的）、每天封頂 ${CFG.dayCap}、每週 ${CFG.weekGoal} 領大獎`);
// 排程塞得下嗎
let bad = 0, N = 2000; for (let i = 0; i < N; i++) if (!planWeek().ok) bad++;
console.log(`\n【排程】${flexKinds.length} 種可挑的 × 每週最多 ${CFG.perKindWeek} 次 ＝ ${flexKinds.length * CFG.perKindWeek} 格，一週要 ${7 * CFG.flexPerDay} 格；亂排 ${N} 次，排不滿的 ${bad} 次（${f1(bad / N * 100)}%）`);
// 最短路
const cheapest = Object.keys(K).map(k => ({ k, c: K[k].min / K[k].pts })).sort((a, b) => a.c - b.c); let p = 0, u = 0, ks = [];
for (const o of cheapest) { if (p >= CFG.dayCap) break; p += K[o.k].pts; u += K[o.k].min; ks.push(o.k); }
console.log(`【最快拿滿 120】${ks.join("＋")}＝${p} 分、約 ${f1(u)} 分鐘（現在 3 個任務算滿約 ${f1(2 + 1.5 + 0.5)}～${f1(2 + 3 + 1.5)} 分鐘）`);
const slow = Object.keys(K).map(k => ({ k, c: K[k].min / K[k].pts })).sort((a, b) => b.c - a.c); p = 0; u = 0; ks = [];
for (const o of slow) { if (p >= CFG.dayCap) break; p += K[o.k].pts; u += K[o.k].min; ks.push(o.k); }
console.log(`【最慢拿滿 120】${ks.join("＋")}＝${p} 分、約 ${f1(u)} 分鐘`);
console.log(`【一週 500 要幾個滿天】${f1(CFG.weekGoal / CFG.dayCap)} 天（每天滿 120 的話 4 天多一點；7 天最多 ${7 * CFG.dayCap}）`);
console.log("\n【玩家型】每週平均積分／拿 500 的週比例／每週滿 120 的天數／每週靈感、心情、籌碼");
const res = {};
for (const T of TYPES) {
  const r = simType(T), wk = r.weeks; res[T.name] = r;
  console.log(`${T.name}\n   積分 ${f1(r.pts / wk)}　拿大獎 ${f1(r.got500 / wk * 100)}%　滿天 ${f1(r.full / wk)}/週　靈感 ${f1(r.insp / wk)}　心情 ${f1(r.mood / wk)}　籌碼 ${fmt(r.chips / wk)}`);
}
// 跟現在比
const n = CFG.now, nowIns = n.tasksPerDay * n.insp * 7, nowMood = n.tasksPerDay * n.mood * 7;
console.log(`\n【跟現在比】現在天天做完 3 個：每週靈感 ${f1(nowIns)}、心情 ${f1(nowMood)}（不含「全做完多一份」的物品）`);
const ri = res[TYPES[2].name]; console.log(`新的「一般（天天 12 分）」每週靈感 ${f1(ri.insp / ri.weeks)}（${f1(ri.insp / ri.weeks / nowIns * 100)}%）、心情 ${f1(ri.mood / ri.weeks)}（${f1(ri.mood / ri.weeks / nowMood * 100)}%）`);
// 籌碼
console.log("\n【籌碼】跟大禮包、簽到比（每人每週）");
const heavy = res[TYPES[3].name].chips / res[TYPES[3].name].weeks;
console.log(`免費大禮包 ${fmt(CFG.packEV * CFG.packsPerDay * 7)}、全勤簽到 ${fmt(CFG.signWeek)}、任務最多（重度）約 ${fmt(heavy)}（大禮包的 ${f1(heavy / (CFG.packEV * CFG.packsPerDay * 7) * 100)}%）`);
console.log("來源：已知世界池子（跟文化部起始補助、門票同一種：搬，不憑空）。每天世界自己成長（景氣 −1／0／+1）：" + [-1, 0, 1].map(b => `${b >= 0 ? "+" : ""}${b}：${fmt(CFG.worldGrow[b])}`).join("　"));
for (const pl of [10, 30, 100]) {
  console.log(`  ${pl} 位館友都是重度：每天 ${fmt(heavy / 7 * pl)}（世界每天成長的 ${f1(heavy / 7 * pl / CFG.worldGrow[0] * 100)}%）`);
}
// 刷分
const free = CFG.taskChip * CFG.taskChipDay;
console.log(`\n【刷分】分身互送佩佩／互相參觀：每個帳號每天最多算 ${CFG.taskChipDay} 個有籌碼的任務＝${fmt(free)}，一週最多 ${fmt(free * 7)} ＋ 大獎；一個分身（要開 3 天）一週最多多拿 ${fmt(free * 7 + CFG.big.boxes.reduce((a, b) => a + b.w * b.chips, 0) / 100 + 300000)}。比它每天領的 2 包免費大禮包（${fmt(CFG.packEV * 2)}）小很多，不值得。`);
console.log("【大獎期望值】" + fmt(CFG.big.boxes.reduce((a, b) => a + b.w * b.chips, 0) / CFG.big.boxes.reduce((a, b) => a + b.w, 0)) + " 籌碼 ＋ 週章 " + CFG.big.stamps + " 枚 ＋ 1 個物品");
