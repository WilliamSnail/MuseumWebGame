// 價格總表：從 NUM、CAS_MENU 印出玩家看得到的價格和上限，壹行壹項（名字、現在的值、設定的路徑）
// 翊文 11-15：「三支經濟腳本」之壹。改價格前後跑壹次，看哪些項要跟著動。
//   npm run econ:prices            純文字
//   npm run econ:prices -- --md    Markdown 表格
//   npm run econ:prices -- --json  JSON（給別的腳本用）
// 不碰網路、不碰正式資料。要加新項目：在下面的 GROUPS 加壹行 [名字, "NUM 的路徑"]（路徑找不到會報錯，不會默默跳過）。
const { load } = require("../test/load_shared.cjs");

const GROUPS = [
  ["起點", [["新玩家起始籌碼", "casino.startChips"], ["簽到壹週全勤送籌碼", "signin.weekChips"], ["每天免費大禮包", "casino.dailyPacks"]]],
  ["牌桌", [["最小注", "casino.minBet"], ["最大注", "casino.maxBet"], ["壹桌最多人", "casino.seats"]]],
  ["借款", [["壹開始額度", "casino.loan.limit"], ["額度上限", "casino.loan.capMax"], ["壹次最少借", "casino.loan.min"], ["利息 %（每筆）", "casino.loan.interestPct"], ["借幾天要還", "casino.loan.days"], ["快速按鈕", "casino.loan.quick"], ["Discord 借錢", "casino.loan.discord"]]],
  ["銀行", [["活存最少", "casino.bank.min"], ["活存利息本金上限", "casino.bank.saveCap"], ["定存最少", "casino.bank.termMin"], ["定存壹筆最多", "casino.bank.termCap"], ["定存期別", "casino.bank.terms"], ["館債壹單位", "casino.bond.unit"], ["館債每人上限", "casino.bond.perUser"]]],
  ["收入", [["地下撿籌碼（最少）", "casino.cellarFind.min"], ["地下撿籌碼（最多）", "casino.cellarFind.max"], ["地下工作（最少）", "casino.job.min"], ["地下工作（最多）", "casino.job.max"], ["地下工作每天最多還", "casino.work.payMax"], ["活動：地下多撿（最少）", "events.cellarChips.min"], ["活動：地下多撿（最多）", "events.cellarChips.max"], ["拚經濟成功壹次撥款（標準值）", "casino.gdp.econWin"]]],
  ["門票", [["旅客門票", "casino.npcSpend.ticket"], ["散客門票", "casino.npcSpend.crowd.ticket"], ["散客壹天上限", "casino.npcSpend.crowd.dayCap"]]],
  ["畫", [["尋常", "art.tiers.0.base"], ["少見", "art.tiers.1.base"], ["珍藏", "art.tiers.2.base"], ["孤品", "art.tiers.3.base"], ["價格進位", "art.unit"], ["拍賣溢價壹天上限", "auction.premiumDay"]]],
  ["股票", [["館內股起始價", "casino.stockIn.start"], ["台股倍數", "casino.stock.peg.tw"], ["美股倍數", "casino.stock.peg.us"], ["館外股壹天賣出上限", "casino.stock.sellDay"], ["槓桿部位上限", "casino.stockLev.posLimit"], ["槓桿壹天淨賺上限", "casino.stockLev.profitCap"]]],
  ["館方", [["莊家起始", "casino.houseStart"], ["預算池起始", "casino.econ.budgetStart"], ["外面世界起始", "casino.world.start"], ["外面世界每天成長", "casino.world.growBase"], ["文化部借款", "casino.grants.0.amt"]]],
];

function get(obj, path) { return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj); }
const fmtV = v => (typeof v === "number" ? v.toLocaleString("en-US") : JSON.stringify(v));

function table(G) {
  const rows = [], miss = [];
  for (const [group, items] of GROUPS) for (const [name, path] of items) {
    const v = get(G.NUM, path);
    if (v === undefined) miss.push(path); else rows.push({ group, name, value: v, path: "NUM." + path });
  }
  for (const m of G.CAS_MENU) rows.push({ group: "餐車", name: m.name + (m.redirect ? "（舊的，換成烤雞肉）" : ""), value: m.price, path: "CAS_MENU." + m.id + ".price" });
  G.CAS_PACKS.forEach((p, i) => rows.push({ group: "大禮包", name: p.name + " 起始", value: p.base, path: "CAS_PACKS." + i + ".base" }));
  G.NUM.casino.exchange.forEach((e, i) => rows.push({ group: "換小獎", name: e.id + "（每週 " + e.perWeek + " 次）", value: e.chips, path: "NUM.casino.exchange." + i + ".chips" }));
  return { rows, miss };
}
function render(rows, md) {
  const out = []; let last = null;
  for (const r of rows) {
    if (md) { if (r.group !== last) { out.push("", "### " + r.group, "", "| 名字 | 現在 | 路徑 |", "|---|---|---|"); last = r.group; } out.push(`| ${r.name} | ${fmtV(r.value)} | \`${r.path}\` |`); }
    else { if (r.group !== last) { out.push("", "【" + r.group + "】"); last = r.group; } out.push(`  ${r.name}　${fmtV(r.value)}　${r.path}`); }
  }
  return out.join("\n").trim();
}
module.exports = { GROUPS, table, render, get };
if (require.main === module) {
  const a = process.argv.slice(2), G = load({ __realMoney: true }), t = table(G);
  console.log(a.includes("--json") ? JSON.stringify(t.rows, null, 1) : render(t.rows, a.includes("--md")));
  if (t.miss.length) { console.error("\n✗ NUM 裡找不到：" + t.miss.join("、") + "（改了名字？更新 tools/econ_prices.cjs 的 GROUPS）"); process.exit(1); }
}
