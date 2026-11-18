// 集團之間的往來更熱絡（翊文 11-18）：node tools/world_trade_sim.cjs [天數 90] [--off]
// 設計預覽：現在只有兩條貨款（trade.goods），再加一張「往來表」（種類、付款方、收款方、占付款方池子的 %／天），照資料長、不寫死單位。
// 表的份量用最小二乘法調成「每個單位名目上收＝付」（單位不會被掏空或暴漲），再用真的換日（成長、健康值、狀態、借款利息…）跑 N 天，
// 付款額 ＝ 付款方池子 × pct% × 它的預算倍率（whMult：一般 1～1.1、減薪 0.8、緊縮 0.5、裁員 0.3）×（1 ＋ 0.5 × 景氣 b），最多付到它現有的。
// 景氣 −1／0／+1 各跑壹遍；--off ＝ 只有現在的兩條貨款（對照）。不碰正式站。
const LS = require("../test/load_shared.cjs"), vm = require("vm"), fs = require("fs"), path = require("path"), L = require("./world_lib.cjs");
// 載入 shared/，再把 wtWealth 換成「帳上的錢加上在銀行的存款」的版本（存款也是集團的資產，不然存進去健康值會掉；正式做時改 shared/world.js 的 wtWealth，原型用這個 hook）
const HOOK = "wtWealth = function (house, id) { const T = wtCfg(); if (!T || !T.on) return 0; const x = wuFix(house), base = wtBase(house, id); if (!x || !(base > 0)) return 0; const rec = id === WT_FIN && wuBox(house.wh) && wuBox(house.wh.loan) ? Object.values(house.wh.loan).reduce((a, L) => a + wdN(L && L.amt), 0) : 0; const dep = house.__gb && house.__gb.dep ? wdN(house.__gb.dep[id]) : 0; return whClamp((wdN(x.adj[id]) + rec + dep) / base, -T.dCap, T.dCap) * T.wealthW; };";
function load(extra) {
  const ctx = Object.assign({ console, Buffer, setTimeout, clearTimeout }, extra); vm.createContext(ctx);
  const rd = f => fs.readFileSync(path.join(LS.DIR, f), "utf8"), src = LS.ORDER.map(f => LS.strip(rd(f))).join("\n;\n"), names = [...new Set(LS.ORDER.flatMap(f => LS.exportsOf(rd(f))))];
  vm.runInContext(src + "\n;globalThis.__G = {\n" + names.map(n => "get " + n + "() { return " + n + "; }").join(",\n") + "\n};", ctx, { filename: "shared（接起來）.js" });
  vm.runInContext(HOOK, ctx);
  return ctx.__G;
}
const DAYS = +process.argv[2] || 90, OFF = process.argv.includes("--off"), BANK = process.argv.includes("--bank"), SC = +(process.argv[process.argv.indexOf("--scale") + 1]) || 1, BIG = process.argv.includes("--big"), fmt = n => Math.round(n).toLocaleString("en-US");
const add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const npcs = L.readNpcs().filter(n => n.kind !== "trace");
const D = "g-daily", F = "g-finance", I = "g-island", O = "g-overseas", A = "g-arts", S = "g-school", P = "g-public", C = "u-culture";
// 往來表（目標份量：萬／天，名目）。kind 是金流圖上的名字（shared/casino_report.js 的 CAS_FLOW_UNIT）
const FLOWS = [
  ["tradeDaily", "日用品採購", [[A, D, 150], [S, D, 250], [F, D, 250], [I, D, 400], [O, D, 500], [P, D, 300], [C, D, 50]]],
  ["tradeFee", "金融服務費", [[D, F, 500], [O, F, 300], [I, F, 250], [A, F, 60], [S, F, 60], [P, F, 100]]],
  ["tradeResearch", "研究委託", [[I, S, 350], [O, S, 300], [D, S, 150], [F, S, 100]]],
  ["tradeDesign", "展覽設計委託", [[D, A, 150], [F, A, 100], [I, A, 80], [O, A, 80], [S, A, 60], [C, A, 150]]],
  ["tradeTax", "稅與規費", [[D, P, 400], [F, P, 250], [I, P, 150], [O, P, 200], [A, P, 40], [S, P, 30]]],
  ["tradeSubsidy", "補助與公共採購", [[P, S, 300], [P, A, 150], [P, C, 100], [P, D, 200]]],
  ["tradeTech", "科技服務", [[F, I, 200], [A, I, 100], [S, I, 100], [P, I, 250], [I, O, 300], [P, O, 150]]],
];
const UN = [D, F, I, O, A, S, P, C];
// 現有兩條貨款每天大約多少（萬）：成長 g × 來源比例 × pct%（只拿來讓新表跟它們一起收支平衡，不改它們）
function solve(G, h) {
  const x = G.wuFix(h), world = h.world, base = id => Math.floor(world * x.r[id]), g = world * 0.1436 / 365;
  const fixed = [[D, O, g * x.r[D] * 0.20], [O, I, g * x.r[O] * 0.10]];
  const E = []; for (const [k, , list] of FLOWS) for (const [f, t, a] of list) E.push({ k, f, t, d: a * 1e4 });
  const n = UN.length, idx = Object.fromEntries(UN.map((u, i) => [u, i])), m = E.length;
  // 約束 A·a ＝ −（固定流的淨額）；最小化 Σ((a−d)/d)²  →  a ＝ d ＋ W Aᵀ μ，W ＝ diag(d²)
  const net0 = Array(n).fill(0); for (const [f, t, a] of fixed) { net0[idx[f]] -= a; net0[idx[t]] += a; }
  const Arow = UN.map(() => Array(m).fill(0)); E.forEach((e, j) => { Arow[idx[e.f]][j] -= 1; Arow[idx[e.t]][j] += 1; });
  const d = E.map(e => e.d), AD = Arow.map(r => r.reduce((s, v, j) => s + v * d[j], 0) + 0);
  const M = UN.map((_, i) => UN.map((_, k) => Arow[i].reduce((s, v, j) => s + v * Arow[k][j] * d[j] * d[j], 0) + (i === k ? 1e-3 : 0)));
  const rhs = UN.map((_, i) => -(AD[i] + net0[i]));
  const mu = gauss(M, rhs), a = d.map((dj, j) => Math.max(0, dj + dj * dj * UN.reduce((s, _, i) => s + Arow[i][j] * mu[i], 0)));
  E.forEach((e, j) => { e.a = a[j]; e.pct = a[j] / base(e.f) * 100 * SC; });
  const net = Array(n).fill(0); for (const [f, t, v] of fixed) { net[idx[f]] -= v; net[idx[t]] += v; } for (const e of E) { net[idx[e.f]] -= e.a; net[idx[e.t]] += e.a; }
  return { E, net, base, fixed };
}
function gauss(M, b) { const n = b.length, A = M.map((r, i) => r.concat(b[i])); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; } } return A.map((r, i) => r[n] / r[i]); }
// Yuga Bot 銀行當集團的銀行（翊文 11-18）：準備金帳 gb.cash 跟莊家分開（不進 bankroll，免得莊家暴增、各種「莊家的 %」上限跟著變）。
//   存款：狀態一般、帳上比應有的多（adj／池子 > depFloor）的集團，把「超過的部分的 depShare%」存進來，上限池子的 depCap%；狀態不好就慢慢領回（每天 1/3）。
//   放款：狀態不是一般、還沒向銀行借的集團，借池子的 loanPct%，銀行最多放出準備金的 (100 − reservePct)%；週一狀態變好、帳上夠就還。
//   利息：存款每天 depRate% 由銀行（博物館資金）付給集團；放款每天 loanRate% 集團付給銀行（進博物館資金）。
const BK = BIG ? { depFloor: 0, depShare: 80, depCap: 8, loanPct: 15, reservePct: 20, depRate: 0.012, loanRate: 0.02, budgetMax: 30, debtRate: 0.01 } : { depFloor: 0.002, depShare: 50, depCap: 1, loanPct: 2, reservePct: 20, depRate: 0.012, loanRate: 0.02, budgetMax: 0, debtRate: 0.01 }; // 放大版（--big）：存款上限池子 8%、放款 15%、博物館資金最多借給銀行自己的 30%（debt）
function bankDay(G, h, gb, S, day, isMon) {
  const x = G.wuFix(h), w = G.whFix(h), pay = (u, n, dir) => { if (!n) return; if (dir > 0) { x.adj[u] += n; h.world += n; h.budget -= n; S.intPaid += n; } else { const t = Math.min(n, Math.max(0, G.wuHave(h, u))); x.adj[u] -= t; h.world -= t; h.budget += t; S.intGot += t; } };
  for (const u of UN) {
    const st = w.st[u] ? w.st[u].s : "normal", base = Math.floor(h.world * x.r[u]), dep = gb.dep[u] || 0, loan = gb.loan[u] || 0;
    pay(u, Math.floor(dep * BK.depRate / 100), 1); pay(u, Math.floor(loan * BK.loanRate / 100), -1);
    if (st === "normal") { // 存：帳上超過 depFloor 的部分存一半；上限池子的 depCap%
      const ratio = x.adj[u] / Math.max(1, base), room = Math.floor(base * BK.depCap / 100) - dep, want = Math.floor((ratio - BK.depFloor) * base * BK.depShare / 100);
      const n = Math.max(0, Math.min(want, room, Math.max(0, G.wuHave(h, u)))); if (n > 0) { x.adj[u] -= n; gb.cash += n; gb.dep[u] = dep + n; S.depIn += n; }
      if (loan > 0 && isMon && x.adj[u] / Math.max(1, base) > 0) { const n2 = Math.min(loan, Math.max(0, G.wuHave(h, u))); x.adj[u] -= n2; gb.cash += n2; gb.loan[u] -= n2; S.repaid += n2; if (gb.loan[u] <= 0) delete gb.loan[u]; }
    } else { // 不好：把存款領回（每天 1/3，不夠付的擠兌：記下來）；還沒借的借
      if (dep > 0) { const want = Math.ceil(dep / 3); if (want > gb.cash && BK.budgetMax > 0) { const room = Math.max(0, Math.floor(h.budget * BK.budgetMax / 100) - gb.debt), b2 = Math.min(want - gb.cash, room); if (b2 > 0) { gb.debt += b2; gb.cash += b2; h.budget -= b2; S.borrowed += b2; } } const n = Math.min(want, gb.cash); if (n < want) { S.runDays++; S.short += want - n; } if (n > 0) { gb.cash -= n; gb.dep[u] = dep - n; x.adj[u] += n; S.depOut += n; if (gb.dep[u] <= 0) delete gb.dep[u]; } }
      if (!loan && u !== "u-culture") { const want = Math.floor(base * BK.loanPct / 100); let cap = Math.floor(gb.cash * (100 - BK.reservePct) / 100); if (want > cap && BK.budgetMax > 0) { const room = Math.max(0, Math.floor(h.budget * BK.budgetMax / 100) - gb.debt), b2 = Math.min(want - cap, room); if (b2 > 0) { gb.debt += b2; gb.cash += b2; h.budget -= b2; S.borrowed += b2; cap += b2; } } const n = Math.min(want, cap); if (n > 0) { gb.cash -= n; gb.loan[u] = n; x.adj[u] += n; S.lent += n; } }
    }
  }
  if (gb.debt > 0) { const iv = Math.floor(gb.debt * BK.debtRate / 100); S.debtInt += iv; h.budget += iv; h.world -= iv; const d0 = Object.values(gb.dep).reduce((a, v) => a + v, 0), back = Math.min(gb.debt, Math.max(0, gb.cash - Math.floor(d0 * BK.reservePct / 100))); if (back > 0) { gb.debt -= back; gb.cash -= back; h.budget += back; S.repaidBud += back; } }
  S.debtMax = Math.max(S.debtMax, gb.debt); S.cashMin = Math.min(S.cashMin, gb.cash); S.depMax = Math.max(S.depMax, Object.values(gb.dep).reduce((a, v) => a + v, 0)); S.loanMax = Math.max(S.loanMax, Object.values(gb.loan).reduce((a, v) => a + v, 0));
}
function run(b, E) {
  const G = load({ __realMoney: true }); G.NUM.casino.grants = []; G.NUM.casino.worldDoc.market.on = false;
  const start = "2026-11-16", h = G.casHouseFix(G.casHouseNew(), start).house; h.econ = { b, yoy: 14.36 }; h.extFix = true;
  h.__gb = null; const x = () => G.wuFix(h), a0 = G.wuAmounts(h), hs = {}, gross = { n: 0, byKind: {} }, st = {}; for (const u of UN) { hs[u] = []; st[u] = {}; }
  const pairNet = {}, gb = h.__gb = { cash: 0, dep: {}, loan: {}, debt: 0 }, S = { borrowed: 0, repaidBud: 0, debtInt: 0, debtMax: 0, intPaid: 0, intGot: 0, depIn: 0, depOut: 0, repaid: 0, lent: 0, runDays: 0, short: 0, cashMin: 0, depMax: 0, loanMax: 0 }, bud0 = h.budget, w0 = h.world;
  for (let i = 0; i < DAYS; i++) {
    const d = add(start, i); if (i > 0) { h.econ = { b, yoy: 14.36 }; G.casHouseFix(h, d); }
    G.wmWriteVisit(h, d, npcs); G.casNpcSpend(h, d, "sim" + i, npcs, G.npcCounters(h.npcc));
    if (E) { // 新的往來：今天一次搬完（真正做的時候會跟貨款壹樣分成每 15 分鐘壹格）
      for (const e of E) {
        const mult = G.whMult(h, e.f) * (1 + 0.5 * b), n = Math.floor(Math.floor(h.world * x().r[e.f]) * e.pct / 100 * mult), take = Math.min(n, Math.max(0, G.wuHave(h, e.f)));
        if (take > 0) { x().adj[e.f] -= take; x().adj[e.t] += take; G.wtLed(h, e.k, e.f, e.t, take); gross.n += take; gross.byKind[e.k] = (gross.byKind[e.k] || 0) + take; const key = [e.f, e.t].sort().join("|"); pairNet[key] = (pairNet[key] || 0) + (e.f < e.t ? -take : take); }
      }
    }
    if (BANK) bankDay(G, h, gb, S, d, new Date(d + "T00:00:00Z").getUTCDay() === 1);
    const w = G.whFix(h); for (const u of UN) { hs[u].push(+w.h[u] || 1); const s = w.st[u] ? w.st[u].s : "normal"; st[u][s] = (st[u][s] || 0) + 1; }
  }
  const a1 = G.wuAmounts(h), r = x().r, keys = Object.keys((h.led && h.led.units) || {}).length;
  const units = UN.map(u => ({ u, d0: a0[u], d1: a1[u], adjRatio: x().adj[u] / Math.max(1, Math.floor(h.world * r[u])), hMin: Math.min(...hs[u]), hAvg: hs[u].reduce((s, v) => s + v, 0) / hs[u].length, st: st[u] }));
  const ledTotal = Object.entries((h.led && h.led.units) || {}).reduce((s, [k, v]) => s + (k.startsWith("tradeGoods") ? v : 0), 0);
  return { units, gross, ledTotal, keys, size: JSON.stringify(h).length, world: h.world, gb, S, bud: h.budget - bud0 };
}
const G0 = load({ __realMoney: true }); G0.NUM.casino.grants = []; const h0 = G0.casHouseFix(G0.casHouseNew(), "2026-11-16").house, sol = solve(G0, h0);
console.log(`集團往來模擬 ${DAYS} 天${OFF ? "（只有現在的兩條貨款）" : ""}`);
console.log("往來表（調成名目上收支平衡後）：種類　付款方→收款方　每天（萬）　占付款方池子 %／天");
for (const e of sol.E) console.log(`  ${e.k.padEnd(14)} ${e.f} → ${e.t}　${(e.a / 1e4).toFixed(0).padStart(5)}　${e.pct.toFixed(4)}`);
console.log("名目上每個單位每天淨收（萬，含兩條貨款）：" + UN.map((u, i) => `${u} ${(sol.net[i] / 1e4).toFixed(1)}`).join("　"));
const totalNew = sol.E.reduce((s, e) => s + e.a, 0); console.log(`新往來名目合計 ${fmt(totalNew / 1e4)} 萬／天；現有兩條貨款約 ${fmt(sol.fixed.reduce((s, f) => s + f[2], 0) / 1e4)} 萬／天`);
for (const b of [-1, 0, 1]) {
  const r = run(b, OFF ? null : sol.E);
  console.log(`\n景氣 ${b}：世界 ${fmt(r.world)}　led.units 鍵數 ${r.keys}　house 文件 ${fmt(r.size)} 字元　新往來每天平均 ${fmt(r.gross.n / DAYS / 1e4)} 萬`);
  console.log("  單位　　　　　帳 開始→結束（億）　adj／池子　健康值 平均（最低）　各狀態天數");
  if (BANK) { const S = r.S, sum = o => Object.values(o).reduce((a, v) => a + v, 0); console.log(`  銀行：存款最多 ${fmt(S.depMax / 1e4)} 萬、放款最多 ${fmt(S.loanMax / 1e4)} 萬、準備金最低 ${fmt(S.cashMin / 1e4)} 萬；結束時存款 ${fmt(sum(r.gb.dep) / 1e4)} 萬、放款 ${fmt(sum(r.gb.loan) / 1e4)} 萬、準備金 ${fmt(r.gb.cash / 1e4)} 萬；存入 ${fmt(S.depIn / 1e4)}、領回 ${fmt(S.depOut / 1e4)}、借出 ${fmt(S.lent / 1e4)}、還 ${fmt(S.repaid / 1e4)}；付存款利息 ${fmt(S.intPaid)}、收放款利息 ${fmt(S.intGot)}（博物館資金淨 ${fmt(S.intGot - S.intPaid)}）；向博物館資金借最多 ${fmt(S.debtMax / 1e4)} 萬（借 ${fmt(S.borrowed / 1e4)}、還 ${fmt(S.repaidBud / 1e4)}、結束時還欠 ${fmt(r.gb.debt / 1e4)}、利息 ${fmt(S.debtInt)}）、博物館資金變化 ${fmt(r.bud / 1e4)} 萬；擠兌 ${S.runDays} 次、少付共 ${fmt(S.short / 1e4)} 萬`); }
  for (const u of r.units) console.log(`  ${u.u.padEnd(12)} ${(u.d0 / 1e8).toFixed(1).padStart(6)}→${(u.d1 / 1e8).toFixed(1).padStart(6)}　${(u.adjRatio * 100).toFixed(2).padStart(7)}%　${u.hAvg.toFixed(3)}（${u.hMin.toFixed(3)}）　${Object.entries(u.st).map(([k, v]) => k + v).join(" ")}`);
}
// 金流圖上看到的（兩個方向相抵取淨額）：有幾條線、最大最小多少
{ const net = {}; for (const e of sol.E) { const k = [e.f, e.t].sort().join("|"); net[k] = (net[k] || 0) + (e.f < e.t ? -e.a : e.a); } for (const [f, t, v] of sol.fixed) { const k = [f, t].sort().join("|"); net[k] = (net[k] || 0) + (f < t ? -v : v); }
  const rows = Object.entries(net).map(([k, v]) => [k, Math.abs(v)]).sort((a, b) => b[1] - a[1]); console.log(`\n金流圖上（相抵後）${rows.length} 條線（8 個單位最多 28 條）：最大 ${fmt(rows[0][1] / 1e4)} 萬、最小 ${fmt(rows[rows.length - 1][1] / 1e4)} 萬、小於 30 萬的 ${rows.filter(r => r[1] < 3e5).length} 條`); }
if (process.argv.includes("--emit")) { // 印成 config 要的格式（pct 已 × --scale，四位小數）
  const byK = {}; for (const e of sol.E) (byK[e.k] = byK[e.k] || []).push(`{ k: "${e.k}", from: "${e.f}", to: "${e.t}", pct: ${(e.pct).toFixed(4)} }`);
  console.log("EMIT\n" + Object.values(byK).map(a => "      " + a.join(", ")).join(",\n"));
}
