// 佩佩銀行跟賭場分開（翊文 11-19）：node test/sim/bank_split_sim.cjs [天數 90]
// 設計預覽（簡化模型，不是真的換日）：館友借款（每筆 7 天、利息 9%、到期後第 1 天直接從籌碼扣，扣到負的也扣，所以本金加利息一定回來）、館友存款（活存、定存）、館債，
// 還有集團存在佩佩銀行的錢（gb.cash 的主要來源）。三種做法：
//   V1 現在：借款都由莊家出、還給莊家。
//   V2 新借款走 gb，舊借款還給莊家（不轉債權）：gb 只有自己的準備金，放得出多少看準備金。
//   V3 新借款走 gb，舊借款的債權轉給 gb（還款進 gb，莊家不補錢也不拿錢）：gb 一個星期內收回舊借款的本息。
//   V4 ＝ V3 ＋ 放款前先留下準備：集團存款留 70%、館友存款和館債留 100%（會被領的錢不借出去），其餘照準備率放款。
// 情境：N 正常；M 大量不還（40% 的借款人到期被扣到負，之後額度鎖住、不再借）；R 擠兌（第 20 天集團要領回存款：3 天領光；第 30 天館友存款和館債一天全領）。
// 起點用 11-19 正式站的量級：館友借款沒還 9.85 億、莊家 6,961 萬、博物館資金 8.54 億、gb 現金 6.8 億（集團存款）、館友存款 346 萬、館債 200 萬（假設）。
const DAYS = +process.argv[2] || 90, fmt = n => Math.round(n).toLocaleString("en-US");
const P = { loanRate: 0.09, term: 7, reservePct: 20, outCapPct: 100, depRate: 0.001, gDepRate: 0.00012, budgetMaxPct: 30, bondRate: 0.06 };
function run(variant, scen) {
  const S = { bankroll: 69607590, budget: 854269942, gb: { cash: 680000000, debt: 0, gdep: 680000000, pdep: 3460000, bond: 2000000 }, loans: [], fixedLoanOld: 0 };
  // 舊借款 9.85 億，到期日平均分在未來 1～7 天
  for (let d = 1; d <= 7; d++) S.loans.push({ amt: 985000000 / 7 / 1.09, due: d, owner: "house", ded: false });
  const target = 985000000 / 1.09, st = { cashMin: 1e18, gbMin: 1e18, bankMax: 0, bankMin: 1e18, outAvg: 0, outMin: 1e18, intGb: 0, intHouse: 0, budgetBorrowMax: 0, unpaid: 0, runDays: 0 };
  let blocked = 0; // 被鎖住不能再借的比例（大量不還）
  for (let d = 1; d <= DAYS; d++) {
    // 到期的（第 due 天結束前要還，沒還第 due+1 天直接扣：本息一定回來）
    let defaultedNow = 0;
    for (const L of S.loans.filter(x => x.due <= d)) {
      const back = L.amt * (1 + P.loanRate); const toGb = L.owner === "gb" || (variant >= 3 && L.owner === "house");
      if (toGb) { S.gb.cash += back; st.intGb += back - L.amt; } else { S.bankroll += back; st.intHouse += back - L.amt; }
      if (scen === "M" && d === 10 && !L.ded) defaultedNow += L.amt;
    }
    S.loans = S.loans.filter(x => x.due > d);
    if (scen === "M" && d === 10) blocked = 0.4; // 第 10 天起 40% 的借款人被扣到負：額度鎖住，不再借
    // 新借款：要借到目標（照沒被鎖的比例），資金來源看做法
    const out = S.loans.reduce((a, x) => a + x.amt, 0), want = Math.max(0, target * (1 - blocked) - out);
    let give = 0;
    if (variant === 1) { give = Math.min(want, Math.max(0, S.bankroll * 0.3 * 100 - out), Math.max(0, S.bankroll)); S.bankroll -= give; S.loans.push({ amt: give, due: d + P.term + 1, owner: "house" }); }
    else { const room = Math.max(0, variant === 4 ? S.gb.cash * (100 - P.reservePct) / 100 - 0.7 * S.gb.gdep - S.gb.pdep - S.gb.bond : S.gb.cash * (100 - P.reservePct) / 100); give = Math.min(want, room); S.gb.cash -= give; S.loans.push({ amt: give, due: d + P.term + 1, owner: "gb" }); }
    // 利息（存款、集團存款、館債）
    const gpay = S.gb.gdep * P.gDepRate + S.gb.pdep * P.depRate + S.gb.bond * P.bondRate / 7; // 館債年期簡化成每天 1/7 的週息
    if (variant === 1) { S.bankroll -= S.gb.pdep * P.depRate + S.gb.bond * P.bondRate / 7; S.budget -= S.gb.gdep * P.gDepRate; } else { S.gb.cash -= gpay; }
    // 擠兌
    if (scen === "R") {
      if (d >= 20 && d < 23) { const w = Math.ceil(S.gb.gdep / (23 - d)); payout(S, w, variant, st, "gdep"); }
      if (d === 30) { payout(S, S.gb.pdep, variant, st, "pdep"); payout(S, S.gb.bond, variant, st, "bond"); }
    }
    // 準備金不夠：向博物館資金借（上限博物館資金 30%）
    if (S.gb.cash < 0 && variant !== 1) { const cap = S.budget * P.budgetMaxPct / 100 - S.gb.debt, b = Math.min(-S.gb.cash, Math.max(0, cap)); S.gb.cash += b; S.gb.debt += b; S.budget -= b; st.budgetBorrowMax = Math.max(st.budgetBorrowMax, S.gb.debt); if (S.gb.cash < 0) { st.unpaid = Math.max(st.unpaid, -S.gb.cash); } }
    else if (S.gb.debt > 0 && S.gb.cash > S.gb.pdep + S.gb.gdep * 0.2) { const back = Math.min(S.gb.debt, S.gb.cash - (S.gb.pdep + S.gb.gdep * 0.2)); S.gb.debt -= back; S.gb.cash -= back; S.budget += back; }
    const o2 = S.loans.reduce((a, x) => a + x.amt, 0); st.outAvg += o2 / DAYS; st.outMin = Math.min(st.outMin, o2);
    st.gbMin = Math.min(st.gbMin, S.gb.cash); st.bankMax = Math.max(st.bankMax, S.bankroll); st.bankMin = Math.min(st.bankMin, S.bankroll);
  }
  return { st, S };
}
function payout(S, n, variant, st, what) { n = Math.min(n, S.gb[what]); S.gb[what] -= n; if (variant === 1) { S.bankroll -= what === "gdep" ? 0 : n; S.budget -= what === "gdep" ? n : 0; } else S.gb.cash -= n; st.runDays++; }
console.log(`佩佩銀行跟賭場分開：${DAYS} 天預覽（簡化模型；起點 莊家 ${fmt(69607590)}、gb 現金 6.8 億、借款沒還 9.85 億）`);
for (const scen of ["N", "M", "R"]) {
  console.log(`\n情境 ${scen === "N" ? "N 正常" : scen === "M" ? "M 大量不還（第 10 天 40% 借款人被扣到負、額度鎖住）" : "R 擠兌（第 20～22 天集團領光存款；第 30 天館友存款和館債全領）"}`);
  console.log("做法　平均借款沒還（億）　最低（億）　gb 現金最低（億）　莊家最高／最低（億）　gb 借博物館資金最多（億）　利息：gb／莊家（億，90 天）　付不出（億）");
  for (const v of [1, 2, 3, 4]) { const { st } = run(v, scen); console.log(`V${v}　${(st.outAvg / 1e8).toFixed(2).padStart(6)}　${(st.outMin / 1e8).toFixed(2).padStart(6)}　${(st.gbMin / 1e8).toFixed(2).padStart(7)}　${(st.bankMax / 1e8).toFixed(2)}／${(st.bankMin / 1e8).toFixed(2)}　${(st.budgetBorrowMax / 1e8).toFixed(2).padStart(6)}　${(st.intGb / 1e8).toFixed(2)}／${(st.intHouse / 1e8).toFixed(2)}　${(st.unpaid / 1e8).toFixed(2)}`); }
}

// ---------- V2 的保護（翊文 11-19 選 V2：舊借款留在莊家，新借款走 gb；gb 盈餘 30% 給莊家、70% 給博物館資金）----------
// 保護 A：莊家水位上繳——莊家的錢超過 W，超過的部分存進 gb（house.gb.hdep，gb 欠莊家，付存款利息、可以領回；不算 bankroll，所以曝險上限不會暴增）
// 保護 B：擠兌時 gb 可以向莊家的存款借回（莊家存在 gb 的錢本來就是 gb 的準備，這裡只是不把它當「會被領的」）；莊家要領回時，gb 先付（付得出多少）
// 保護 C：曝險上限看 min(bankroll, 絕對上限 capAbs)（槓桿曝險 20%、集團股造市、借款上限、每天上限都用 effBank）
console.log("\n==== V2 的保護（舊借款留在莊家）====");
console.log("組合　情境　莊家最高（億）　有效莊家最高（億）　借款平均／最低（億）　gb 現金最低（億）　付不出（億）　莊家存在 gb 最後（億）　莊家利息收入／博物館資金（億，90 天）");
function run2(scen, opt) {
  const S = { bankroll: 69607590, budget: 854269942, gb: { cash: 680000000, debt: 0, gdep: 680000000, pdep: 3460000, bond: 2000000, hdep: 0 }, loans: [] };
  for (let d = 1; d <= 7; d++) S.loans.push({ amt: 985000000 / 7 / 1.09, due: d, owner: "house" });
  const target = 985000000 / 1.09, st = { bankMax: 0, effMax: 0, outAvg: 0, outMin: 1e18, gbMin: 1e18, unpaid: 0, houseInc: 0, budInc: 0 }; let blocked = 0;
  for (let d = 1; d <= DAYS; d++) {
    let incGb = 0;
    for (const L of S.loans.filter(x => x.due <= d)) { const back = L.amt * (1 + P.loanRate); if (L.owner === "gb") { S.gb.cash += back; incGb += back - L.amt; } else { S.bankroll += back; st.houseInc += back - L.amt; } }
    S.loans = S.loans.filter(x => x.due > d);
    if (scen === "M" && d === 10) blocked = 0.4;
    // 莊家水位上繳（保護 A）
    if (opt.W != null && S.bankroll > opt.W) { const x = S.bankroll - opt.W; S.bankroll -= x; S.gb.cash += x; S.gb.hdep += x; }
    // 新借款走 gb：可放 ＝ 現金 ×（1−準備率）− 會被領的存款（集團 70%、館友和館債 100%；莊家的存款：保護 B 不扣，沒有保護 B 扣 100%）
    const out = S.loans.reduce((a, x) => a + x.amt, 0), want = Math.max(0, target * (1 - blocked) - out);
    const room = Math.max(0, S.gb.cash * (100 - P.reservePct) / 100 - 0.7 * S.gb.gdep - S.gb.pdep - S.gb.bond - (opt.B ? 0 : S.gb.hdep));
    const give = Math.min(want, room); S.gb.cash -= give; S.loans.push({ amt: give, due: d + P.term + 1, owner: "gb" });
    // 利息：gb 付集團、館友、館債、莊家存款
    const pay = S.gb.gdep * P.gDepRate + S.gb.pdep * P.depRate + S.gb.bond * P.bondRate / 7, hpay = S.gb.hdep * P.gDepRate; S.gb.cash -= pay + hpay; S.bankroll += hpay; st.houseInc += hpay;
    // 盈餘：今天借款利息收入 − 付出的利息，30% 給莊家、70% 給博物館資金（現金要夠才分）
    const surplus = Math.max(0, incGb - pay - hpay); if (S.gb.cash > surplus) { S.gb.cash -= surplus; S.bankroll += 0.3 * surplus; S.budget += 0.7 * surplus; st.houseInc += 0.3 * surplus; st.budInc += 0.7 * surplus; }
    // 擠兌
    if (scen === "R") {
      const run = (key, n) => { n = Math.min(n, S.gb[key]); S.gb[key] -= n; S.gb.cash -= n; };
      if (d >= 20 && d < 23) run("gdep", Math.ceil(S.gb.gdep / (23 - d)));
      if (d === 30) { run("pdep", S.gb.pdep); run("bond", S.gb.bond); }
    }
    if (S.gb.cash < 0) { // 先向博物館資金借（上限 30%），再向莊家的存款借回（保護 B：莊家的存款讓出來），還不夠就付不出
      const cap = S.budget * P.budgetMaxPct / 100 - S.gb.debt, b = Math.min(-S.gb.cash, Math.max(0, cap)); S.gb.cash += b; S.gb.debt += b; S.budget -= b;
      if (S.gb.cash < 0 && opt.B && S.gb.hdep > 0) { const x = Math.min(-S.gb.cash, S.gb.hdep); S.gb.hdep -= x; S.gb.cash += x; S.bankroll += x; } // gb 把莊家存的錢還給莊家（但現金不夠就沒有，這裡 gb 現金是負的所以其實是把準備金讓給擠兌：莊家存款轉成 gb 的自有資金）
      if (S.gb.cash < 0) st.unpaid = Math.max(st.unpaid, -S.gb.cash);
    } else if (S.gb.debt > 0 && S.gb.cash > 0.2 * (S.gb.gdep + S.gb.pdep)) { const back = Math.min(S.gb.debt, S.gb.cash - 0.2 * (S.gb.gdep + S.gb.pdep)); S.gb.debt -= back; S.gb.cash -= back; S.budget += back; }
    const o2 = S.loans.reduce((a, x) => a + x.amt, 0); st.outAvg += o2 / DAYS; st.outMin = Math.min(st.outMin, o2); st.gbMin = Math.min(st.gbMin, S.gb.cash); st.bankMax = Math.max(st.bankMax, S.bankroll);
    st.effMax = Math.max(st.effMax, opt.capAbs ? Math.min(S.bankroll, opt.capAbs) : S.bankroll);
  }
  return { st, S };
}
const COMBOS = [["V2 沒保護", {}], ["V2＋A 水位上繳 1.5 億", { W: 150000000 }], ["V2＋A＋B 莊家存款讓出", { W: 150000000, B: 1 }], ["V2＋A＋B＋C 絕對上限 3 億", { W: 150000000, B: 1, capAbs: 300000000 }], ["V2＋C 只加絕對上限 3 億", { capAbs: 300000000 }]];
for (const scen of ["N", "M", "R"]) for (const [name, opt] of COMBOS) { const { st, S } = run2(scen, opt); console.log(`${name.padEnd(22)} ${scen}　${(st.bankMax / 1e8).toFixed(2)}　${(st.effMax / 1e8).toFixed(2)}　${(st.outAvg / 1e8).toFixed(2)}／${(st.outMin / 1e8).toFixed(2)}　${(st.gbMin / 1e8).toFixed(2)}　${(st.unpaid / 1e8).toFixed(2)}　${(S.gb.hdep / 1e8).toFixed(2)}　${(st.houseInc / 1e8).toFixed(2)}／${(st.budInc / 1e8).toFixed(2)}`); }
