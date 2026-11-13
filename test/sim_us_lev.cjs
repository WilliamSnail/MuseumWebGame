// 美股槓桿、放空、當沖的錢算一次（11-14，數值平衡；規劃 2.8m）
// node test/sim_us_lev.cjs [資料夾]     資料夾裡要有 <代號>_1m.json、<代號>_5m.json（Yahoo chart：interval=1m&range=7d、interval=5m&range=60d）
//   預設資料夾 .claude/scratch/usdata（不進 repo；抓法見 2.8m：query1.finance.yahoo.com/v8/finance/chart/<代號>?interval=..&range=..，User-Agent Mozilla/5.0）
// 假設：遊戲價 ＝ 倍數 × 真實價、每分鐘更新（設計 a）；所以只用報酬率，倍數不影響。外面世界（池子或 mint/burn）當對手盤：玩家賺的錢從那邊來。
// 規則照 NUM.casino.stockLev：手續費開平各 0.5%（算部位）、做多利息 0.15%（借的部分）、放空借券 0.3%、保證金剩 50% 強平、一天 3 筆、部位上限 2,000 萬、淨賺上限 1,000 萬。
const fs = require("fs"), path = require("path");
const DIR = process.argv[2] || path.join(__dirname, "..", ".claude", "scratch", "usdata");
const SYMS = ["NVDA", "AMD", "AAPL", "MSFT", "TSLA", "QQQ"];
const FEE = 0.005, INTL = 0.0015, BORROW = 0.003, FORCE = 0.5, POS = 20e6, PCAP = 10e6, OPENS = 3;
let seed = 20261114; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const pct = (x, d = 2) => (x * 100).toFixed(d) + "%";
const M = x => (x / 1e4).toFixed(0) + "萬";
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
const q = (a, p) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
const etf = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
function et(ts) { const o = {}; for (const p of etf.formatToParts(new Date(ts * 1000))) o[p.type] = p.value; return { day: `${o.year}-${o.month}-${o.day}`, min: (+o.hour % 24) * 60 + +o.minute }; }
// 讀一個檔 → { 日期: [K 棒 {m 分鐘, o,h,l,c}]（只留正常盤）}
function load(sym, iv) {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, `${sym}_${iv}.json`), "utf8")).chart.result[0], qt = j.indicators.quote[0], days = {};
  j.timestamp.forEach((t, i) => { if (qt.close[i] == null) return; const e = et(t); if (e.min < 570 || e.min >= 960) return; (days[e.day] = days[e.day] || []).push({ m: e.min, o: qt.open[i], h: qt.high[i], l: qt.low[i], c: qt.close[i] }); });
  for (const d of Object.keys(days)) if (days[d].length < (iv === "1m" ? 380 : 76)) delete days[d]; // 只留完整的日子（提早收盤、當天還沒收完的不算）
  return days;
}
const D1 = {}, D5 = {};
for (const s of SYMS) { D1[s] = load(s, "1m"); D5[s] = load(s, "5m"); }
const range = o => { const d = Object.keys(o).sort(); return d.length ? `${d[0]}～${d[d.length - 1]}（${d.length} 天）` : "無"; };
console.log("資料（美東日期，只算正常盤 09:30～16:00，不完整的日子不算）");
console.log("  1 分鐘：" + range(D1.NVDA) + "；5 分鐘：" + range(D5.NVDA));

// ---------- 1 波動 ----------
console.log("\n[1] 每檔：日報酬（開→收）標準差、日內最大不利（開盤價到當天最低／最高的較大者：平均/最大）、隔夜跳空標準差、單一 1 分鐘最大絕對漲跌、5 分鐘最大");
console.log("代號   日開收sd  日內最大(平均/最大)   隔夜跳空sd  1分鐘最大  5分鐘最大  |1分鐘|>1.15%  |5分鐘|>1.15%");
for (const s of SYMS) {
  const ds = Object.keys(D5[s]).sort(), oc = [], adv = [], gap = [];
  ds.forEach((d, i) => { const b = D5[s][d], o = b[0].o, c = b[b.length - 1].c; oc.push(c / o - 1); adv.push(Math.max(o / Math.min(...b.map(x => x.l)) - 1, Math.max(...b.map(x => x.h)) / o - 1)); if (i) { const p = D5[s][ds[i - 1]]; gap.push(o / p[p.length - 1].c - 1); } });
  const r1 = [], r5 = []; for (const d of Object.keys(D1[s])) { const b = D1[s][d]; for (let i = 1; i < b.length; i++) r1.push(b[i].c / b[i - 1].c - 1); }
  for (const d of ds) { const b = D5[s][d]; for (let i = 1; i < b.length; i++) r5.push(b[i].c / b[i - 1].c - 1); }
  const mx = a => Math.max(...a.map(Math.abs)), fr = (a, t) => a.filter(x => Math.abs(x) > t).length / a.length;
  console.log(`${s.padEnd(6)} ${pct(sd(oc)).padEnd(9)} ${(pct(mean(adv)) + "/" + pct(Math.max(...adv))).padEnd(21)} ${pct(sd(gap)).padEnd(11)} ${pct(mx(r1)).padEnd(10)} ${pct(mx(r5)).padEnd(10)} ${pct(fr(r1, 0.0115), 3).padEnd(13)} ${pct(fr(r5, 0.0115), 3)}`);
}
{ const all = []; for (const s of SYMS) { const ds = Object.keys(D5[s]).sort(); ds.forEach((d, i) => { if (i) { const p = D5[s][ds[i - 1]]; all.push(Math.abs(D5[s][d][0].o / p[p.length - 1].c - 1)); } }); }
  console.log(`  隔夜跳空 |gap| 平均 ${pct(mean(all))}、最大 ${pct(Math.max(...all))}：當沖在收盤自動平倉，這些不進損益（模擬的每一筆進出都在同一個美東日期內）。`); }

// ---------- 2 單筆損益 ----------
// 一筆：在 K 棒 i 開、j 平（或被強平）；dir ±1；L 倍。回傳相對保證金的損益、是否被強平、壞帳（相對保證金）
function trade(b, i, j, L, dir, useHL) {
  const notion = L, cost = notion * FEE * 2 + (dir > 0 ? (L - 1) * INTL : notion * BORROW), p0 = b[i].c;
  for (let k = i + 1; k <= j; k++) {
    const adv = useHL ? (dir > 0 ? b[k].l : b[k].h) : b[k].c, pnl = dir * notion * (adv / p0 - 1);
    if (1 + pnl <= FORCE) { const eq = 1 + pnl - cost; return { r: Math.max(eq, 0) - 1, liq: 1, bad: eq < 0 ? -eq : 0 }; }
  }
  const eq = 1 + dir * notion * (b[j].c / p0 - 1) - cost; return { r: Math.max(eq, 0) - 1, liq: 0, bad: eq < 0 ? -eq : 0 };
}
function stats(rs) { const r = rs.map(x => x.r); return { n: r.length, ev: mean(r), se: sd(r) / Math.sqrt(r.length), win: r.filter(x => x > 0).length / r.length, liq: mean(rs.map(x => x.liq)), bad: mean(rs.map(x => x.bad)), worst: Math.min(...r), p1: q(r, 0.01) }; }
function strat(name, L, dir, data, useHL) {
  const rs = [];
  for (const s of SYMS) for (const d of Object.keys(data[s])) {
    const b = data[s][d], n = b.length;
    if (name === "open2close") rs.push(trade(b, 0, n - 1, L, dir, useHL));
    else if (name === "random") for (let t = 0; t < 40; t++) { const i = Math.floor(rnd() * (n - 2)); const j = i + 1 + Math.floor(rnd() * (n - 1 - i)); rs.push(trade(b, i, j, L, dir, useHL)); }
    else { // 順勢／逆勢：看前 K 棒（約 15 分鐘）漲跌超過 th 才進，順著（或逆著）做；停利 4%、停損 2%（價格）、最晚收盤平
      const K = n > 100 ? 3 : 15, th = 0.004;
      for (let i = K; i < n - 2; i += n > 100 ? 1 : 5) {
        const mv = b[i].c / b[i - K].c - 1; if (Math.abs(mv) < th) continue;
        const dd = (name === "momentum" ? 1 : -1) * Math.sign(mv);
        let j = n - 1; for (let k = i + 1; k < n; k++) { const x = dd * (b[k].c / b[i].c - 1); if (x >= 0.04 || x <= -0.02) { j = k; break; } }
        rs.push(trade(b, i, j, L, dd, useHL));
      }
    }
  }
  return stats(rs);
}
console.log("\n[2] 一般玩家（看不到未來）每一筆，相對保證金（EV＝平均；±是 2 個標準誤；強平＝被強制平倉的比例；壞帳＝每筆平均欠的，單位保證金）");
console.log("資料    策略         倍數 方向 EV              贏的比例  強平     壞帳     最慘1%/最慘");
for (const [dname, data, hl] of [["5分", D5, false], ["5分高低", D5, true], ["1分", D1, false]]) for (const st of ["random", "open2close", "momentum", "contrarian"]) for (const L of [2, 3, 5]) for (const dir of st === "momentum" || st === "contrarian" ? [0] : [1, -1]) {
  if (dname === "5分高低" && st !== "random") continue;
  if ((st === "momentum" || st === "contrarian") && dname !== "5分") continue;
  const r = strat(st, L, dir, data, hl);
  console.log(`${dname.padEnd(7)}${st.padEnd(12)} ${String(L).padEnd(4)} ${(dir > 0 ? "多" : dir < 0 ? "空" : "順/逆").padEnd(4)} ${(pct(r.ev) + "±" + pct(2 * r.se, 1)).padEnd(15)} ${pct(r.win, 1).padEnd(9)} ${pct(r.liq, 2).padEnd(8)} ${pct(r.bad, 3).padEnd(8)} ${pct(r.p1, 0)}/${pct(r.worst, 0)}  (n=${r.n})`);
}

// ---------- 3 看得到未來 L 分鐘的人 ----------
// 玩家看真實行情，比遊戲領先 L 分鐘（遊戲價每分鐘才更新、真實是即時的，所以 L 至少約 1）。
// 進場：預知 |未來 L 分鐘漲跌| 超過門檻 th 才開，順著預知的方向，H 分鐘後平（H＝最短持有；H＝L 就是最快）。
const costOf = (lev, dir) => 2 * FEE + (dir > 0 ? (lev - 1) / lev * INTL : BORROW);   // 算部位的比例
function foresight(data, step, Lmin, H, th, blockMin, lev) {
  const out = [];
  for (const s of SYMS) for (const d of Object.keys(data[s])) {
    const b = data[s][d], n = b.length, kL = Math.round(Lmin / step), kH = Math.max(kL, Math.round(H / step));
    for (let i = 0; i + kH < n; i++) {
      if ((b[i].m - 570) < blockMin) continue;
      const rL = b[i + kL].c / b[i].c - 1; if (Math.abs(rL) < th) continue;
      const dir = Math.sign(rL), rH = b[i + kH].c / b[i].c - 1;
      out.push({ day: d, sym: s, i, m: b[i].m, gain: dir * rH - costOf(lev, dir) });
    }
  }
  return out;
}
// 一個人一天最多 3 筆：同一檔 15 分鐘內不能再開，每天挑淨報酬最高的（貪心）
function perDay(opps, ndays, minGap, posLimit, cap) {
  const byDay = {}; for (const o of opps) (byDay[o.day] = byDay[o.day] || []).push(o);
  const res = [];
  for (const d of Object.keys(byDay)) {
    const a = byDay[d].filter(o => o.gain > 0).sort((x, y) => y.gain - x.gain), pick = [];
    for (const o of a) { if (pick.length >= OPENS) break; if (pick.some(p => p.sym === o.sym && Math.abs(p.m - o.m) < minGap)) continue; pick.push(o); }
    res.push(Math.min(cap || PCAP, pick.reduce((s, o) => s + o.gain * posLimit, 0)));
  }
  return { mean: res.reduce((s, x) => s + x, 0) / Math.max(1, ndays), max: Math.max(0, ...res), daysWith: res.filter(x => x > 0).length / Math.max(1, ndays) };
}
const ND1 = Object.keys(D1.NVDA).length, ND5 = Object.keys(D5.NVDA).length;
console.log("\n[3] 看得到未來的人（比遊戲領先 L 分鐘）。每個機會＝預知漲跌超過門檻才進，順方向，L 分鐘後平；損益算部位（跟倍數無關，利息用 5× 算，最嚴）");
console.log("資料   L分  門檻   每天機會數(6檔)  每機會平均淨賺(部位)  部位2,000萬：一人一天(最多3筆)平均賺／最大   有賺的天數比例");
for (const [dn, data, step, ND, Ls] of [["1分", D1, 1, ND1, [1, 2, 3]], ["5分", D5, 5, ND5, [5, 10]]]) for (const Lm of Ls) for (const th of [0.0115, 0.015, 0.02]) {
  const o = foresight(data, step, Lm, Lm, th, 0, 5), pd = perDay(o, ND, 15, POS), pos = o.filter(x => x.gain > 0);
  console.log(`${dn.padEnd(5)} ${String(Lm).padEnd(4)} ${pct(th, 2).padEnd(6)} ${(pos.length / ND).toFixed(2).padEnd(16)} ${pct(mean(pos.map(x => x.gain)), 2).padEnd(21)} ${(M(pd.mean) + " / " + M(pd.max)).padEnd(38)} ${pct(pd.daysWith, 0)}`);
}
console.log("\n[3b] 領先 2 分鐘（1 分鐘資料），門檻 1.15%：這些機會發生在開盤後第幾分鐘（09:30＝0）");
{ const o = foresight(D1, 1, 2, 2, 0.0115, 0, 5).filter(x => x.gain > 0), b = [[0, 5], [5, 15], [15, 30], [30, 390]];
  console.log("  " + b.map(([a, c]) => `${a}～${c}分：${o.filter(x => x.m - 570 >= a && x.m - 570 < c).length} 次`).join("　") + `（共 ${o.length} 次，${ND1} 天×6 檔）`);
  console.log("  最大 5 個：" + [...o].sort((x, y) => y.gain - x.gain).slice(0, 5).map(x => `${x.day} ${x.sym} 開盤後${x.m - 570}分 +${pct(x.gain)}`).join("；")); }
console.log("\n[3c] 如果真的要壓住領先的人（參考，翊文已說不用擋）：最短持有 H 分鐘、擋開盤前 B 分鐘（5 倍，部位 2,000 萬）");
console.log("資料   領先  最短持有H  擋開盤B分   每天機會數   每機會平均淨賺   一人一天平均賺");
for (const [dn, data, step, ND, Lm, th] of [["1分", D1, 1, ND1, 2, 0.0115], ["5分", D5, 5, ND5, 5, 0.0115]]) for (const H of [Lm, 10, 15, 30]) for (const B of [0, 15]) {
  if (H < Lm) continue; const o = foresight(data, step, Lm, H, th, B, 5), pos = o.filter(x => x.gain > 0), pd = perDay(o, ND, 15, POS);
  console.log(`${dn.padEnd(5)} ${String(Lm).padEnd(5)} ${String(H).padEnd(10)} ${String(B).padEnd(10)} ${(pos.length / ND).toFixed(2).padEnd(12)} ${pct(mean(pos.map(x => x.gain)), 2).padEnd(16)} ${M(pd.mean)}`);
}

// ---------- 4 錢的流量 ----------
console.log("\n[4a] 事後諸葛的天花板（完全知道整天走勢，一天最多 3 筆、同檔段不重疊，部位 2,000 萬，5 分鐘線）：一人一天最多賺（已套淨賺上限 1,000 萬）");
{ const res = [], raw = [];
  for (const d of Object.keys(D5.NVDA)) {
    const segs = []; for (const s of SYMS) { const b = D5[s][d], n = b.length; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const r = b[j].c / b[i].c - 1; segs.push({ s, i, j, g: Math.abs(r) - 2 * FEE - (r > 0 ? 0.0012 : BORROW) }); } }
    segs.sort((a, b) => b.g - a.g); const pick = []; for (const x of segs) { if (pick.length >= OPENS) break; if (x.g <= 0) break; if (pick.some(p => p.s === x.s && !(x.j <= p.i || x.i >= p.j))) continue; pick.push(x); }
    const g = pick.reduce((a, x) => a + x.g * POS, 0); raw.push(g); res.push(Math.min(PCAP, g));
  }
  console.log(`  ${ND5} 天：平均 ${M(mean(res))}、中位 ${M(q(res, 0.5))}、p90 ${M(q(res, 0.9))}、最大 ${M(Math.max(...res))}（未套上限前最大 ${M(Math.max(...raw))}；上限 ${M(PCAP)}）`);
  const r3 = raw.map(x => Math.min(PCAP * 3, x * 3));
  console.log(`  信用滿級（部位 6,000 萬、上限 3,000 萬）：平均 ${M(mean(r3))}、p90 ${M(q(r3, 0.9))}、最大 ${M(Math.max(...r3))}`); }

console.log("\n[4b] 一般玩家（沒有未來資訊）整體：N 人，每人每天 3 筆隨機 5×（部位 2,000 萬），90 天總損益（玩家賺為正；中位／最好5%／最差5%）；同一天大家同一個行情（從 5 分鐘線的真實日子取樣）");
{ const days = Object.keys(D5.NVDA);
  const ret = N => { const r = []; for (let d = 0; d < 90; d++) { const day = days[Math.floor(rnd() * days.length)]; let tot = 0;
      for (let p = 0; p < N * OPENS; p++) { const s = SYMS[Math.floor(rnd() * 6)], b = D5[s][day], n = b.length, i = Math.floor(rnd() * (n - 2)), j = i + 1 + Math.floor(rnd() * (n - 1 - i)); const t = trade(b, i, j, 5, rnd() < 0.5 ? 1 : -1, false); tot += t.r * (POS / 5); } r.push(tot); } return r; };
  for (const N of [10, 50]) { const tots = [], dd = []; for (let k = 0; k < 400; k++) { const r = ret(N); tots.push(r.reduce((a, x) => a + x, 0)); dd.push(...r); }
    console.log(`  ${N} 人：${M(q(tots, 0.5))}／${M(q(tots, 0.95))}／${M(q(tots, 0.05))}；單日最好1% ${M(q(dd, 0.99))}、最差1% ${M(q(dd, 0.01))}（負＝玩家虧、外面世界賺）`); } }

console.log("\n[4c] 有「領先 L 分鐘」的玩家（每人每天 3 筆、部位 2,000 萬、5×，沒有任何緩解）：池子被拿走的錢");
for (const [dn, data, step, ND, Lm] of [["1分資料 領先2分", D1, 1, ND1, 2], ["5分資料 領先5分（很嚴）", D5, 5, ND5, 5]]) {
  const o = foresight(data, step, Lm, Lm, 0.0115, 0, 5), pd = perDay(o, ND, 15, POS), pc = perDay(o, ND, 15, POS * 3, PCAP * 3);
  console.log(`  ${dn}：每人每天平均 ${M(pd.mean)}（滿級 ${M(pc.mean)}）；90 天 1 人 ${M(pd.mean * 90)}、10 人 ${(pd.mean * 900 / 1e8).toFixed(2)} 億、50 人 ${(pd.mean * 4500 / 1e8).toFixed(2)} 億`);
}
console.log("\n（說明：1 分鐘資料只有 " + ND1 + " 個交易日，樣本小；5 分鐘資料有 " + ND5 + " 天。結果當成量級，不當精確數字。）");

// ---------- 5 開盤到當天極值：多少天會碰到強平線（從開盤就抱到那一刻的最糟情況）----------
console.log("\n[5] 從開盤價就開倉的人，當天碰到強平線（逆向 50%/倍數）的天數比例（5 分鐘高低點；6 檔 × " + ND5 + " 天；強平價＝倍數 2×:±25%、3×:±16.7%、5×:±10%）");
for (const L of [2, 3, 5]) { let hit = 0, tot = 0; for (const s of SYMS) for (const d of Object.keys(D5[s])) { const b = D5[s][d], o = b[0].o; tot += 2; if (Math.min(...b.map(x => x.l)) / o - 1 <= -FORCE / L) hit++; if (Math.max(...b.map(x => x.h)) / o - 1 >= FORCE / L) hit++; }
  console.log(`  ${L}×：${hit} / ${tot}（${pct(hit / tot, 2)}）`); }
