// 海外帳移出外面世界（翊文 11-18）的設計預覽：node test/sim/ext_split_sim.cjs [天數]
// A ＝ 現在（海外記在 house.wu.adj["u-ext"]，算在 house.world 裡）；B ＝ 並列（house.ext 另一個帳，不算在 house.world）。兩邊從同一個起點（館友先投 7.57 億到館外股），
// 之後 B 做一次搬出（原型寫在這支檔裡，不是正式程式），再每天跑真的換日（成長、NPC 花錢…），館友每天買賣館外股（情境 P0 進出相等、P1 館友賺：每天淨賣出 3 億、P2 館友賠：每天淨買進 1 億）。
// 看：搬出那一刻各集團帳有沒有變；兩邊的世界、每天成長差多少；A 在「吃緊」時賣股付不付得出；全館守恆（B 要把海外算進總和）。
const { load } = require("../load_shared.cjs"), L = require("../../tools/content/world_lib.cjs");
const DAYS = +process.argv[2] || 90, fmt = n => Math.round(n).toLocaleString("en-US");
const add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const npcs = L.readNpcs().filter(n => n.kind !== "trace");
function mk(G) { G.NUM.casino.grants = []; G.NUM.casino.worldDoc.market.on = false; const h = G.casHouseFix(G.casHouseNew(), "2026-11-16").house; h.econ = { b: 0, yoy: 14.36 }; h.extFix = true; return h; } // extFix：擋掉 0121 的舊資料搬移（新莊家不需要，不擋會重複算）
// 原型：搬出海外。各集團、家計、NPC 錢包的帳不變（調 adj 抵掉 world 變小造成的 floor 差），公共不變
function split(G, h) {
  const x = G.wuFix(h), E = x.adj["u-ext"] || 0, W = h.world, before = G.wuAmounts(h);
  for (const id of Object.keys(x.r)) { if (id === "pub" || id === "u-ext") continue; x.adj[id] += Math.floor(W * x.r[id]) - Math.floor((W - E) * x.r[id]); }
  h.world = W - E; h.ext = E; delete x.r["u-ext"]; delete x.adj["u-ext"];
  return { E, before };
}
const sameUnits = (a, b) => Object.keys(a).filter(k => k !== "u-ext").every(k => a[k] === b[k]) && Object.keys(b).every(k => k in a);
const gap = (G, h, w, withExt) => { const s = G.casBookSnap([w], h, 0, h.day); return G.casBookTotal(s) + (withExt ? (h.ext || 0) : 0) - G.casBookMinted(s) + G.casBookBurned(s); };
function run(b, scen, days) {
  const GA = load({ __realMoney: true }), GB = load({ __realMoney: true });
  const A = mk(GA), B = mk(GB), wA = GA.casWalletFix(GA.casWalletNew(), "2026-11-16"), wB = GB.casWalletFix(GB.casWalletNew(), "2026-11-16");
  wA.chips = wB.chips = 5e12; // 館友的錢（夠大，不受限）
  GA.casWorldIn(wA, A, "stockBuy", 757e6); GB.casWorldIn(wB, B, "stockBuy", 757e6); // 起點：館友投 7.57 億到館外股
  const r = split(GB, B), w0 = GB.wuAmounts(B);
  const ok0 = sameUnits(r.before, w0) && w0.pub === r.before.pub;
  const gap0A = gap(GA, A, wA, false), gap0B = gap(GB, B, wB, true), out = { b, scen, ok0, E: r.E, rows: [], failA: 0, lowA: 0 };
  for (let i = 1; i <= days; i++) {
    const d = add("2026-11-16", i);
    for (const [G, h, w, isB] of [[GA, A, wA, false], [GB, B, wB, true]]) {
      h.econ = { b, yoy: 14.36 }; G.casHouseFix(h, d); G.wmWriteVisit(h, d, npcs); G.casNpcSpend(h, d, "sim" + i, npcs, G.npcCounters(h.npcc));
      const buy = scen === "P2" ? 3e8 : 1e8, sell = scen === "P0" ? 1e8 : scen === "P1" ? 4e8 : 2e8; // 館友每天買、賣的錢
      if (!isB) { G.casWorldIn(w, h, "stockBuy", buy); const got = G.casWorldOut(w, h, "stockSell", sell, G.NUM.casino.world); if (got < sell) out.failA++; if (G.casWorldLow(h, G.NUM.casino.world)) out.lowA++; }
      else { w.chips -= buy; h.ext += buy; w.chips += sell; h.ext -= sell; } // 海外：沒有池子上限
    }
    if (i % 30 === 0 || i === days) out.rows.push({ d: i, worldA: A.world, worldB: B.world, extA: GA.wuAmounts(A)["u-ext"], extB: B.ext, growA: A.led && A.led.mint ? A.led.mint.worldGrow : 0, growB: B.led && B.led.mint ? B.led.mint.worldGrow : 0, gapA: gap(GA, A, wA, false) - gap0A, gapB: gap(GB, B, wB, true) - gap0B, pubA: GA.wuAmounts(A).pub, pubB: GB.wuAmounts(B).pub });
  }
  return out;
}
console.log(`海外帳移出外面世界：${DAYS} 天預覽（A 現在、B 並列；起點館友已投 7.57 億）`);
for (const scen of ["P0", "P1", "P2"]) for (const b of [-1, 0, 1]) {
  const r = run(b, scen, DAYS), last = r.rows[r.rows.length - 1];
  console.log(`\n情境 ${scen}${scen === "P0" ? "（進出相等）" : scen === "P1" ? "（館友賺，每天淨賣 3 億）" : "（館友賠，每天淨買 1 億）"} 景氣 ${b}：搬出時各集團帳不變 ${r.ok0 ? "是" : "否！"}（搬出 ${fmt(r.E)}）`);
  for (const x of r.rows) console.log(`  第 ${String(x.d).padStart(3)} 天  世界 A ${fmt(x.worldA)} / B ${fmt(x.worldB)}　海外 A ${fmt(x.extA)} / B ${fmt(x.extB)}　累計成長 A ${fmt(x.growA)} / B ${fmt(x.growB)}　公共 A ${fmt(x.pubA)} / B ${fmt(x.pubB)}　守恆差 A ${fmt(x.gapA)} / B ${fmt(x.gapB)}`);
  console.log(`  A 賣股付不出的天數 ${r.failA}　A 吃緊的天數 ${r.lowA}　最後世界差（A−B）${fmt(last.worldA - last.worldB)}　成長差 ${fmt(last.growA - last.growB)}`);
}
