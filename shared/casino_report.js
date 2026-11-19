// ================================================================
//  Yuga Bot 日報（11-13，數值平衡；docs/經濟體系規劃.md 玩法 1）
//  純函式：吃一份「快照加上跟上一份的差」（casinoReport/{day}，shared/casino_book.js 算的），做出給玩家看的幾段字。
//  只公告「結算過的」：快照是每天第一個來看的人觸發的，不是即時數字（免得有人算「現在去賭莊家最虛弱」）。
//  海底只給水位（公分），不給數字（規劃第五節問題 12 還沒決定）。博物館資金、莊家給數字。
//  介面上的字用「壹」。文字是草稿，Yuga 可以改。
// ================================================================
import { NUM } from "./config.js";
import { casBookSumObj } from "./casino_book.js";
import { CAS_FX_TEXT } from "./casino_gdp.js";
import { CAS_ECON, CAS_MENU } from "./casino_text.js";
import { WORLD_UNITS } from "./world_roster.js";
import { WU_HH, WU_PUB, WU_WAL, wuAmounts } from "./world.js";
import { statView } from "./stat_view.js";
import { NPC_ROSTER } from "./npc_roster.js";
import { npcCounters, npcNews } from "./npc.js";
import { CAS_ECON_EV, casEconUpText } from "./econ_events.js";
import { casFill } from "./casino.js";

export const CAS_REPORT = {
  title: "Yuga Bot 日報",
  intro: "館方的帳，Yuga Bot 每天算壹次。這是結算過的數字，不是現在的。",
  mint: { worldGrow: "已知世界每天成長（照 GDP 年增率）", worldExpand: "已知世界一次性擴充", cultureStart: "文化部補助（新玩家的起始籌碼）", stockRebase: "股票換成真實比例的零頭", start: "新館友的開場籌碼", signWeek: "全勤簽到", legacy: "認領舊錢包", ticket: "參觀者門票（展廳主分紅）", discord: "綁定 Discord", work: "欠款去地下工作補回", test: "測試" },
  houseMint: { reset: "莊家破產後重新開張", grant: "文化部借款（已知世界撥款，要還）", worldLoan: "已知世界貸款（莊家破產重開，要還）", ticketBudget: "參觀者門票（進博物館資金）", ticketMuseum: "參觀者門票（進修繕基金）" },
  // 已知世界的池子（規劃 2.12）：每個來源讓池子變多少（正＝進已知世界）
  world: { cultureGift: "文化部資助", pLoan: "新借款（佩佩銀行借出）", pLoanBack: "館友還款（還給佩佩銀行）", pBankInt: "存款利息（佩佩銀行付）", pBond: "館債（佩佩銀行）", bondMove: "舊館債本金（莊家搬給佩佩銀行）", hdepIn: "莊家水位上繳（存進佩佩銀行）", hdepOut: "莊家領回存款", hdepInt: "佩佩銀行付莊家的存款利息", gbSweepH: "佩佩銀行盈餘（給莊家）", gbSweepB: "佩佩銀行盈餘（給博物館資金）", groupDeposit: "集團存進佩佩銀行", groupWithdraw: "集團從佩佩銀行領回", groupLoan: "集團向佩佩銀行借款", groupRepay: "集團還佩佩銀行", groupIntDep: "佩佩銀行付集團的存款利息", groupIntLoan: "集團付佩佩銀行的放款利息", groupBankLoan: "佩佩銀行向博物館資金借", groupBankRepay: "佩佩銀行還博物館資金", groupBankInt: "佩佩銀行付博物館資金的利息", gRaise: "集團增資（莊家買新股，錢進集團）", gBuy: "集團庫藏股（集團買回，錢給莊家）", gDiv: "集團股息（集團付）", stockBuy: "買股票（錢給海外）", stockSell: "賣股票（海外付）", stockRebase: "股票換比例的零頭", houseInvFix: "館方投資換比例校正（補莊家）", budgetInvFix: "館方投資換比例校正（補博物館資金）", bizTax: "營業稅（政府先拿）", dividend: "股息（海外付）", inMarket: "館內股的旅客散客買賣、造市商回補（跟已知世界）", entTax: "娛樂稅（政府先拿）", stockLevWin: "槓桿賺的", stockLevLoss: "槓桿賠的", worldLoan: "貸款給莊家", worldRepay: "莊家還貸款", grant: "文化部借款撥款", cultureRepay: "莊家還文化部借款", ticket: "參觀者門票（展廳主）", ticketBudget: "參觀者門票（博物館資金）", ticketMuseum: "參觀者門票（修繕基金）", npcArt: "旅客買畫、賣畫", npcTicketBudget: "NPC 的門票（博物館資金）", npcTicketMuseum: "NPC 的門票（修繕基金）", npcCrowdBudget: "散客的門票（博物館資金）", npcCrowdMuseum: "散客的門票（修繕基金）", npcFood: "NPC 在餐車花的", npcBj: "NPC 在牌桌花的", npcJob: "NPC 在委託櫃台花的", npcCellar: "NPC 在地下收藏庫花的", npcCraft: "NPC 在手作坊花的", houseInvestBuy: "莊家投資（買）", houseInvestSell: "莊家投資（賣）", budgetInvestBuy: "博物館資金投資（買）", budgetInvestSell: "博物館資金投資（賣）" },
  burn: { exchange: "換小獎", cultureRepay: "莊家還文化部借款", worldRepay: "莊家還已知世界貸款" },
  flow: { gStock: "集團股票（莊家當造市商）", gRaise: "集團增資（莊家買新股）", gBuy: "集團庫藏股（莊家收到買回的錢）", stockIn: "館內股票（莊家當對手盤）", stockLev: "槓桿（莊家當對手盤）", gLev: "集團股槓桿（莊家當對手盤）", bond: "債券", art: "旅客買畫、賣畫（莊家）", artAuction: "畫的拍賣", bankInt: "銀行利息", investFee: "館方投資的手續費", stockFee: "股票手續費", artFee: "拍賣手續費", stockTax: "股票證交稅", divTax: "股利所得稅", bizTax: "營業稅（店裡的花費）", entTax: "娛樂稅（門票）", npcArtBuy: "旅客買畫（莊家收到）", tax: "莊家稅", budgetLoan: "跟博物館資金借（莊家破產重開）", budgetFix: "博物館資金補撥給莊家（11-17 館債那期照新規定該由博物館資金付，一次性）", budgetRepay: "還博物館資金", bj: "21 點", pack: "免費和買來的大禮包", food: "餐車", loan: "借出去的錢", loanBack: "借款還回來（含逾期被扣）", econWin: "拚經濟成功（博物館資金撥來）", econLoot: "拚經濟被撈走的油水", econSea: "拚經濟沉到海底", job: "交委託", find: "地下撿到的" },
  gag: "對帳：差 1 枚，原因不明。",
  seaNote: "水面底下有人在數東西。",
};
const rpN = n => Math.round(n).toLocaleString("en-US");
const rpSign = n => (n > 0 ? "＋" : n < 0 ? "－" : "") + rpN(Math.abs(n));
const rpDays = (a, b) => { const f = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((f(b) - f(a)) / 86400000); };
// 毫秒 → 台灣時間 "MM-DD HH:MM"
const rpTime = ms => { const d = new Date(ms + 8 * 3600000), p = n => String(n).padStart(2, "0"); return `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`; };
// 一組 { 來源: 數字 } → 「名字 數字」的幾行，大的在前。names 沒有的來源直接用代號
const rpList = (obj, names, signed) => Object.entries(obj || {}).filter(([, v]) => v).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
  .map(([k, v]) => `${names[k] || k}　${signed ? rpSign(v) : rpN(v)}`);

// flow 裡「不是莊家的錢」的來源（記帳的人用 casPoolWorldIn／Out：錢在博物館資金或修繕基金跟已知世界之間搬，flow 記的是那個池子的角度：正＝進池子）。
// 莊家那塊（銀行財報的莊家、日報的「進出」）不能列它們，不然博物館資金收的門票會變成莊家的錢（11-16 對帳腳本 tools/books_sign_check.cjs 擋這個）
export const CAS_BOOK_POOL = { npcTicketBudget: "budget", npcCrowdBudget: "budget", npcJob: "budget", npcCellar: "budget", npcCraft: "budget", npcArt: "budget", budgetInvestBuy: "budget", budgetInvestSell: "budget", npcTicketMuseum: "museum", npcCrowdMuseum: "museum", gbSweepB: "budget", groupIntDep: "budget", groupIntLoan: "budget", groupBankLoan: "budget", groupBankRepay: "budget", groupBankInt: "budget", stockFee: "budget", artFee: "budget", stockTax: "gov", bizTax: "gov", entTax: "gov", divTax: "gov" };
// 帳上的來源代號 → 玩家看的名字（找不到才回代號，對帳腳本會擋沒有名字的）
// acct 是「已知世界」時，同壹個代號先用已知世界的名字（例如 grant：已知世界那塊叫「文化部借款撥款」，莊家那塊叫「文化部借款」）
export const casReportLabel = (k, acct) => (acct === "world" || acct === "ext" || acct === "gb" ? CAS_REPORT.world[k] : "") || CAS_REPORT.flow[k] || CAS_REPORT.houseMint[k] || CAS_REPORT.world[k] || CAS_REPORT.mint[k] || CAS_REPORT.burn[k] || k;

// 銀行「館內經濟」展開看的幾個帳（決定 0100）：{ day, bankroll, budget, museum, sea, world, d: { 各帳昨天的變化 }, top: { 各帳進出最大的最多 3 筆 [{ label, n }]（正＝進這個帳、負＝出這個帳）} }。
// 全部從日報已經算好的 snap 和 diff 拿（延遲壹天、整天不變）。每個帳的 n 都是「這個帳自己的角度」：進來是正、出去是負。
//   莊家＝flow（扣掉博物館資金、修繕基金的搬動）＋houseMint（扣掉門票、已知世界成長）－houseBurn；已知世界＝wflow（正＝進已知世界）＋每天成長；
//   博物館資金＝門票、投資買賣、NPC 在委託／地下／手作坊花的、莊家跟博物館資金借還、投資手續費；修繕基金＝門票進修繕基金；海底沒有記來源，不列。
// full＝true 時多回 all（每個帳的全部來源 [{ k, label, n }]，k 是帳上的來源代號），給 tools/books_sign_check.cjs 對帳用。
export function casBooksView(doc, full) {
  if (!doc || !doc.snap || !doc.snap.house || !doc.diff) return null;
  const H = doc.snap.house, d = doc.diff, R = CAS_REPORT, add = (m, k, label, v) => { if (v) m.push({ k, label, n: Math.round(v) }); };
  const sorted = m => m.slice().sort((a, b) => Math.abs(b.n) - Math.abs(a.n)), top = m => sorted(m).slice(0, 3).map(x => ({ label: x.label, n: x.n }));
  const bank = [], world = [], ext = [], gbk = [], budget = [], museum = [], gov = [];
  const hm = d.houseMint || {}, fl = d.flow || {}, hb = d.houseBurn || {};
  for (const [k, v] of Object.entries(fl)) if (!CAS_BOOK_POOL[k]) add(bank, k, casReportLabel(k), v);
  for (const [k, v] of Object.entries(hm)) if (k !== "ticketBudget" && k !== "ticketMuseum" && k !== "worldGrow" && k !== "worldExpand") add(bank, k, casReportLabel(k), v);
  for (const [k, v] of Object.entries(hb)) add(bank, k, casReportLabel(k), -v);
  for (const [k, v] of Object.entries(d.wflow || {})) add(world, k, casReportLabel(k, "world"), v); // 已知世界的角度：正＝進已知世界
  for (const [k, v] of Object.entries(d.gflow || {})) add(gbk, k, casReportLabel(k, "gb"), v); // 佩佩銀行準備金（決定 0127）的角度：正＝進準備金
  for (const [k, v] of Object.entries(d.xflow || {})) add(ext, k, casReportLabel(k, "ext"), v); // 海外（決定 0126）的角度：正＝進海外
  add(world, "worldGrow", casReportLabel("worldGrow", "world"), hm.worldGrow); add(world, "worldExpand", casReportLabel("worldExpand", "world"), hm.worldExpand);
  add(budget, "ticketBudget", R.houseMint.ticketBudget, hm.ticketBudget); add(museum, "ticketMuseum", R.houseMint.ticketMuseum, hm.ticketMuseum);
  for (const [k, pool] of Object.entries(CAS_BOOK_POOL)) add(pool === "budget" ? budget : pool === "gov" ? gov : museum, k, casReportLabel(k), fl[k]); // 池子自己的角度：flow 正＝進池子
  add(budget, "econWin", R.flow.econWin, -(fl.econWin || 0)); add(budget, "investFee", "投資手續費", -(fl.investFee || 0)); add(budget, "budgetLoan", R.flow.budgetLoan, -(fl.budgetLoan || 0)); add(budget, "budgetFix", R.flow.budgetFix, -(fl.budgetFix || 0)); add(budget, "budgetRepay", R.flow.budgetRepay, -(fl.budgetRepay || 0)); // 這幾個動的是莊家（拚經濟撥款、投資手續費、借還），博物館資金在對面：反號
  const N = v => Math.round(+v) || 0;
  const out = { day: doc.day || null, bankroll: N(H.bankroll), budget: N(H.budget), museum: N(H.museum), gov: N(H.gov), sea: N(H.sea), world: H.world == null ? null : N(H.world), ext: H.ext == null ? null : N(H.ext), gb: H.gb == null ? null : N(H.gb),
    d: { bankroll: N(d.bankroll), budget: N(d.budget), museum: N(d.museum), gov: N(d.gov), sea: N(d.sea), world: N(d.world), ext: N(d.ext), gb: N(d.gb) }, top: { bankroll: top(bank), budget: top(budget), museum: top(museum), gov: top(gov), sea: [], world: top(world), ext: top(ext), gb: top(gbk) } };
  if (full) out.all = { bankroll: sorted(bank), budget: sorted(budget), museum: sorted(museum), gov: sorted(gov), sea: [], world: sorted(world), ext: sorted(ext), gb: sorted(gbk) };
  return out;
}
// doc：{ day, at, snap, diff }（diff 是 casBookDiff 的樣子，第一天 from 是 null）。回傳 { day, at, span, secs: [{ t, lines }] }
export function casReportView(doc) {
  if (!doc || !doc.snap || !doc.diff) return null;
  const s = doc.snap, d = doc.diff, H = s.house, C = NUM.casino.report;
  const first = !d.from; // 第壹份快照：沒有上一份可以比，只有「現在多少」，不寫這段時間變多少
  const span = d.from && doc.day ? Math.max(1, rpDays(d.from, doc.day)) : 1;
  const secs = [];
  // 莊家
  const hl = [`莊家現在有 ${rpN(H.bankroll)} 籌碼${first ? "" : `（這段時間 ${rpSign(d.bankroll)}）`}。`];
  if (H.bankroll < 0) hl.push("莊家破產中，換日 Yuga 會借他壹筆重新開張。");
  const bankFlow = Object.fromEntries(Object.entries(d.flow || {}).filter(([k]) => !CAS_BOOK_POOL[k])), flow = rpList(bankFlow, Object.fromEntries(Object.keys(bankFlow).map(k => [k, casReportLabel(k)])), true); // 博物館資金、修繕基金的搬動不是莊家的進出
  if (flow.length) hl.push("進出：", ...flow);
  if (H.debt && H.debt.culture > 0 && NUM.casino.houseLoan.cultureDue) { // 文化部館債（30 天內還清）
    const dueD = (H.cul && H.cul.due) || NUM.casino.houseLoan.cultureDue, dl = doc.day ? Math.max(0, rpDays(doc.day, dueD)) : null, c = H.cul || {};
    hl.push(`文化部館債：剩 ${rpN(H.debt.culture)}，${dl === null ? "" : dl + " 天後"}到期（${dueD.slice(5)}）${dueD > NUM.casino.houseLoan.cultureDue ? "，回條來了：到期日已展延壹次" : ""}，今天還了 ${rpN(c.paid || 0)}${c.budget > 0 ? `（博物館資金先付 ${rpN(c.budget)}）` : ""}。` + (H.culLate > 0 ? `逾期累計 ${rpN(H.culLate)}。` : ""));
  }
  const DB = H.debt || {}, debts = [["博物館資金", DB.budget], ["文化部持有的館債", DB.culture], ["已知世界", DB.world]].filter(x => x[1] > 0);
  if (debts.length) hl.push("莊家欠的錢（賺了錢會先還）：" + debts.map(x => `${x[0]} ${rpN(x[1])}`).join("、") + "。");
  if (H.loansOut > 0) hl.push(`莊家借出去、還沒收回的本金 ${rpN(H.loansOut)}。`);
  // 莊家健康度：從玩家流進來的（21 點、餐車、借款還回）對流出給玩家的（大禮包、委託、地下撿、借出、拚經濟油水、利息）
  const fl = d.flow || {}, inn = Math.max(0, fl.bj || 0) + (fl.food || 0) + (fl.loanBack || 0), outg = -((fl.pack || 0) + (fl.job || 0) + (fl.find || 0) + (fl.loan || 0) + (fl.econLoot || 0) + (fl.bankInt || 0));
  if (!first && outg > 0) {
    const ratio = inn / outg;
    hl.push(`莊家健康度：玩家輸給莊家 ${rpN(inn)}，莊家發給玩家 ${rpN(outg)}（比值 ${ratio.toFixed(2)}，${ratio >= 1 ? "健康" : ratio >= 0.6 ? "吃緊" : "失血"}）。`);
    if (ratio < 0.6) hl.push("莊家在失血：錢少於 " + rpN(NUM.casino.health.low) + " 時，免費大禮包每天少發。");
  }
  if (H.npcc && doc.day) { const nw = npcNews(doc.day, npcCounters(H.npcc), 2); if (nw.length) hl.push("館內近況：" + nw.map(x => x.news).join(" ")); } // 館內 NPC 的故事（shared/npc.js）
  if (Array.isArray(H.econUp) && H.econUp.length) hl.push("預告：" + casEconUpText(H.econUp).join("")); // 劇情經濟事件的預告（shared/econ_events.js）
  if (doc.audit) hl.push(casFill(CAS_ECON_EV.audit, { gap: rpSign(doc.gap || 0) })); // 全館對帳日（E8）
  if (Array.isArray(H.festUp) && H.festUp.length) { // 預告的活動（規劃 2.8k）：可能辦成，也可能沒辦成，辦成才會多來壹批旅客
    const nm = { food: "餐車", bj: "牌桌", job: "委託櫃台", cellar: "地下收藏庫", craft: "手作坊" };
    hl.push("預告：" + H.festUp.map(f => `${+f.date.slice(5, 7)} 月 ${+f.date.slice(8, 10)} 日《${f.name}》可能在${nm[f.store] || f.store}舉辦`).join("；") + "。");
  }
  if (doc.openingFix) hl.push(`對帳基準校正了 ${rpSign(doc.openingFix)}（已知世界池子上線那天的快照多算了池子當天的進出，不是錢不見）。`);
  if (H.npcs && H.npcs.crowd && H.npcs.crowd.ticket > 0) hl.push(`昨天 ${rpN(H.npcs.crowd.people)} 位散客（${rpN(H.npcs.crowd.groups)} 組）逛了展廳，散客門票 ${rpN(H.npcs.crowd.ticket)}${H.npcs.crowd.shop > 0 ? `、散客在店裡花了 ${rpN(H.npcs.crowd.shop)}` : ""}。`);
  if (H.npcs && H.npcs.total > 0) hl.push(`昨天 ${rpN(H.npcs.people)} 位館外的旅客來館，付了門票、在店裡花了，帶進館 ${rpN(H.npcs.total)} 籌碼（門票 ${rpN(H.npcs.ticket)}、店裡 ${rpN(H.npcs.shop)}）。`);
  if (H.wh && H.wh.st) { // 已知世界各集團的景氣狀態（W5，決定 0086）：只寫已經發生的
    const names = { cut: "減薪", squeeze: "緊縮", layoff: "裁員" }, nm = id => (WORLD_UNITS.find(u => u.id === id) || {}).name || id, cnt = { cut: 0, squeeze: 0, layoff: 0 };
    Object.values(H.wh.st).forEach(s => { if (cnt[s] != null) cnt[s]++; });
    const uneasy = Object.values(H.wh.un || {}).filter(v => v >= 50).length; if (uneasy) hl.push(`已知世界：${uneasy} 個集團人心浮動。`); // 集體不安（決定 0091）
    if (H.wh.mood != null) hl.push(statView("crowdMood", null, H.wh.mood).hint); // 展廳氣氛
    const bad = Object.keys(cnt).filter(k => cnt[k] > 0).map(k => `${cnt[k]} 個集團${names[k]}`);
    if (bad.length) hl.push(`已知世界的景氣：${bad.join("、")}，來館的旅客花得比較保守。`);
    (H.wh.ev || []).filter(e => e.day === doc.day || e.day === (doc.snap && doc.snap.day)).forEach(e => hl.push(`${nm(e.unit)}${{ normal: "恢復正常了", cut: "減薪了", squeeze: "緊縮了", layoff: "裁員了" }[e.to] || ""}。`));
  }
  if (H.npcw && H.npcw.ev) { // NPC 被裁員、換工作（W6）：只寫已經發生的
    const unit = id => (WORLD_UNITS.find(u => u.id === id) || {}).name || id, who = id => (NPC_ROSTER.find(n => n.id === id) || {}).name;
    H.npcw.ev.filter(e => e.day === doc.day || e.day === (doc.snap && doc.snap.day)).slice(0, 2).forEach(e => { const n = who(e.npc); if (n) hl.push(e.t === "lay" ? `${n}被${unit(e.from)}裁員了。` : `${n}到${unit(e.to)}工作了。`); });
  }
  if (H.npcs && H.npcs.menu) { // 餐車賣給館外來客的（照菜單點，shared/npc_spend.js）
    const nm = id => (CAS_MENU.find(m => m.id === id) || {}).name || id, it = Object.keys(H.npcs.menu).map(k => ({ k, n: (H.npcs.menu[k].npc || 0) + (H.npcs.menu[k].crowd || 0) })).filter(x => x.n > 0).sort((x, y) => y.n - x.n);
    if (it.length) hl.push("昨天餐車賣給館外的客人：" + it.map(x => nm(x.k) + " ×" + rpN(x.n)).join("、") + "。");
    const o = Array.isArray(H.npcs.orders) ? H.npcs.orders[0] : null; if (o && o.who) hl.push(o.who + "在餐車點了" + (o.n > 1 ? " " + o.n + " 份" : "壹份") + nm(o.item) + "。");
  }
  if (H.npcLast && H.npcLast.fest && H.npcLast.fest.length) { // 昨天預告的活動辦成了沒
    const nm = { food: "餐車", bj: "牌桌", job: "委託櫃台", cellar: "地下收藏庫", craft: "手作坊" };
    for (const f of H.npcLast.fest) hl.push(f.ok ? `昨天《${f.name}》在${nm[f.store]}辦成了，館外來了 ${rpN(f.n)} 位旅客。` : `昨天預告的《${f.name}》最後沒在${nm[f.store]}辦成，一切照常。`);
  }
  if (H.npcLast && H.npcLast.n) { // 館內股的 NPC（規劃 2.8k）：昨天館外來了幾位旅客；劇情日那天寫活動
    const nm = { food: "餐車", bj: "牌桌", job: "委託櫃台", cellar: "地下收藏庫", craft: "手作坊" }, tot = Object.values(H.npcLast.n).reduce((a, b) => a + (+b || 0), 0), ev = H.npcLast.ev;
    if (ev && nm[ev.store] && ev.burst) hl.push(`昨天${nm[ev.store]}突然來了一大批旅客（${rpN(ev.n)} 位）。`);
    else if (ev && nm[ev.store]) hl.push(`昨天${ev.name ? "《" + ev.name + "》在" : ""}${nm[ev.store]}辦了活動，館外來了 ${rpN(ev.n)} 位旅客。`);
    else if (tot > 0) hl.push(`昨天館外來了 ${rpN(tot)} 位旅客逛各家店。`);
  }
  if (H.inv && (H.inv.last || (H.inv.sum && (H.inv.sum.hold || []).length))) { // 館方投資海外（規劃 2.8f，延遲壹天：寫昨天的）
    const L = H.inv.last, nm = x => x.name + " " + rpN(x.n) + " 股", sum = H.inv.sum || { hold: [], pnl: 0 };
    if (L && ((L.buy || []).length || (L.sell || []).length)) hl.push("昨天館方投資海外：" + [(L.buy || []).length ? "買 " + L.buy.map(nm).join("、") : "", (L.sell || []).length ? "賣 " + L.sell.map(nm).join("、") : ""].filter(Boolean).join("；") + "。");
    else if (L && L.paused && (L.paused.house || L.paused.budget)) hl.push("昨天館方沒有買股票（" + (L.paused.house === "world" || L.paused.budget === "world" ? "已知世界資金吃緊" : "暫停買進") + "）。");
    if ((sum.hold || []).length) hl.push("館方現在持有：" + sum.hold.map(nm).join("、") + "；累計賺賠 " + rpSign(sum.pnl) + "。");
  }
  hl.push(`${s.wallets} 位館友的錢包合計 ${rpN(s.chips)} 籌碼。`);
  secs.push({ t: "莊家", lines: hl });
  // 博物館資金
  const bl = [];
  if (H.budget <= 0) bl.push(`博物館資金剩 ${rpN(H.budget)}。預算凍結中：拚經濟成功只撥平常的 ${NUM.casino.econ.freezeKeep}%。`);
  else {
    bl.push(`博物館資金剩 ${rpN(H.budget)}${first ? "" : `（這段時間 ${rpSign(d.budget)}）`}。`);
    if (!first && d.budget < 0) { const days = Math.floor(H.budget / (-d.budget / span)); bl.push(`照這個速度，大約還撐 ${rpN(days)} 天。`); }
  }
  secs.push({ t: "博物館資金（館方）", lines: bl });
  secs.push({ t: "政府帳", lines: [`政府帳有 ${rpN(H.gov || 0)} 籌碼${first ? "" : `（這段時間 ${rpSign(d.gov || 0)}）`}。收證交稅（賣台股、館內股）、營業稅（NPC、散客在店裡花的錢）、娛樂稅（NPC、散客的門票），館方還沒決定怎麼用。`] });
  secs.push({ t: "修繕基金", lines: [`修繕基金有 ${rpN(H.museum || 0)} 籌碼${first ? "" : `（這段時間 ${rpSign(d.museum || 0)}）`}。來自參觀者的門票，之後用在修繕、捐款、預算公投。`] });
  // 海底：只給水位
  const cm = Math.floor(Math.max(0, H.sea) / C.seaPerCm), dcm = first ? 0 : Math.floor(Math.max(0, H.sea) / C.seaPerCm) - Math.floor(Math.max(0, H.sea - d.sea) / C.seaPerCm);
  secs.push({ t: "海底（B4 的水下）", lines: [`水位 ${rpN(cm)} 公分${dcm > 0 ? `，這段時間升了 ${rpN(dcm)} 公分` : ""}。`, !first && d.sea > 0 ? CAS_REPORT.seaNote : ""].filter(Boolean) });
  // 已知世界（規劃 2.12）：現在有多少、這段時間怎麼進出。有帳以前的日報沒有這一段
  if (H.world != null) {
    const wl = [`已知世界現在有 ${rpN(H.world)} 籌碼${first ? "" : `（這段時間 ${rpSign(d.world)}）`}。`];
    { const hm2 = d.houseMint || {}; if (hm2.worldExpand > 0) wl.push(`已知世界一次性擴充 ${rpN(hm2.worldExpand)}（憑空，只進已知世界）。`); if (hm2.worldGrow > 0) wl.push(`每天成長 ${rpN(hm2.worldGrow)}（照台灣 GDP 年增率，只進已知世界、不給玩家）。`); }
    if (H.world < Math.floor(NUM.casino.world.start * NUM.casino.world.lowPct / 100)) wl.push("已知世界資金吃緊：NPC 暫停花錢、賭場的 NPC 不下注，也暫停借錢給莊家。賣股和槓桿賺的錢從海外付，不受影響。");
    const into = {}, out = {}, wNames = Object.fromEntries(Object.keys(d.wflow || {}).map(k => [k, casReportLabel(k, "world")]));
    for (const [k, v] of Object.entries(d.wflow || {})) { if (v > 0) into[k] = v; else if (v < 0) out[k] = -v; }
    if (Object.keys(into).length) wl.push("進已知世界：", ...rpList(into, wNames, false));
    if (Object.keys(out).length) wl.push("從已知世界出來：", ...rpList(out, wNames, false));
    secs.push({ t: "跟已知世界的往來", lines: wl });
  }
  // 佩佩銀行當集團的銀行（決定 0127）：準備金、集團的存放款
  if (H.gb != null && (H.gb || (H.gbx && (H.gbx.dep || H.gbx.loan)) || (d.gflow && Object.keys(d.gflow).length))) {
    const bl = [`準備金 ${rpN(H.gb)} 籌碼${first ? "" : `（這段時間 ${rpSign(d.gb)}）`}；集團存在這裡 ${rpN((H.gbx || {}).dep || 0)}、借走 ${rpN((H.gbx || {}).loan || 0)}${(H.gbx || {}).debt > 0 ? `；銀行欠博物館資金 ${rpN(H.gbx.debt)}` : ""}。`];
    { const X = H.gbx || {}; if (X.loansOut || X.bond || X.hdep) bl.push(`借給館友（新借款）沒收回 ${rpN(X.loansOut || 0)}、館債 ${rpN(X.bond || 0)}、莊家存在這裡 ${rpN(X.hdep || 0)}。`); }
    const gin = {}, gout = {}, gNames = Object.fromEntries(Object.keys(d.gflow || {}).map(k => [k, casReportLabel(k, "gb")]));
    for (const [k, v] of Object.entries(d.gflow || {})) { if (v > 0) gin[k] = v; else if (v < 0) gout[k] = -v; }
    if (Object.keys(gin).length) bl.push("進準備金：", ...rpList(gin, gNames, false));
    if (Object.keys(gout).length) bl.push("從準備金出去：", ...rpList(gout, gNames, false));
    secs.push({ t: "佩佩銀行（集團的存放款）", lines: bl });
  }
  // 海外（決定 0126）：真實市場，跟已知世界並列的帳，可以是負的（館友在真實市場賺回來的比投出去的多）
  if (H.ext != null && (H.ext || (d.xflow && Object.keys(d.xflow).length))) {
    const xl = [`海外（真實市場）現在 ${H.ext < 0 ? "－" : ""}${rpN(Math.abs(H.ext))} 籌碼${first ? "" : `（這段時間 ${rpSign(d.ext)}）`}。${H.ext < 0 ? "負數＝館友在真實市場賺回來的，比投出去的多。" : ""}`];
    const xin = {}, xout = {}, xNames = Object.fromEntries(Object.keys(d.xflow || {}).map(k => [k, casReportLabel(k, "ext")]));
    for (const [k, v] of Object.entries(d.xflow || {})) { if (v > 0) xin[k] = v; else if (v < 0) xout[k] = -v; }
    if (Object.keys(xin).length) xl.push("進海外：", ...rpList(xin, xNames, false));
    if (Object.keys(xout).length) xl.push("從海外出來：", ...rpList(xout, xNames, false));
    secs.push({ t: "跟海外的往來", lines: xl });
  }
  // 憑空、消失
  const minted = Object.assign({}, d.mint, d.houseMint), mintNames = Object.assign({}, CAS_REPORT.mint, CAS_REPORT.houseMint);
  const ml = [];
  const burnAll = Object.assign({}, d.burn, d.houseBurn), mTotal = casBookSumObj(minted), bTotal = casBookSumObj(d.burn) + casBookSumObj(d.houseBurn);
  ml.push(mTotal ? `從館外進來 ${rpN(mTotal)} 籌碼：` : "這段時間沒有從館外進來的籌碼。", ...rpList(minted, mintNames, false));
  ml.push(bTotal ? `消失 ${rpN(bTotal)} 籌碼：` : "這段時間沒有消失的籌碼。", ...rpList(burnAll, CAS_REPORT.burn, false));
  secs.push({ t: H.world != null ? "真的憑空來的、真的消失的" : "館外進來的、消失的", lines: ml });
  if (doc.gdp && doc.index) {
    const x = doc.index, g = doc.gdp, per = x.perDay;
    const gl = [`今天的景氣：${x.label}（指數 ${x.b > 0 ? "＋" : x.b < 0 ? "－" : ""}${Math.abs(x.b).toFixed(2)}）。`];
    gl.push(`館內 GDP 平均每天 ${rpN(per)}。` + (x.g === null ? "資料還不夠 14 天，指數先維持原樣。" : `比前 7 天${x.g >= 0 ? "多" : "少"}了 ${Math.abs(x.g * 100).toFixed(1)}%。`));
    gl.push(`組成：消費 ${rpN(g.C)}、投資 ${rpN(g.I)}、政府支出 ${rpN(g.G)}、淨出口 ${rpN(g.NX)}（這段時間合計）。`);
    if (x.active < NUM.casino.gdp.minPeople) gl.push("最近來的人太少，館內的景氣先不算。");
    if (doc.ext && doc.ext.ok) gl.push(`海外的景氣：${x.bExt > 0.3 ? "比前幾季熱" : x.bExt < -0.3 ? "比前幾季冷" : "跟前幾季差不多"}（${doc.ext.quarter}）。`);
    else gl.push("海外的景氣：還沒有消息。");
    const K = NUM.casino.gdp, mul = 1 + K.fxPct / 100 * x.b, pct = v => `${v >= 1 ? "×" : "×"}${v.toFixed(2)}`;
    gl.push(`景氣的影響：拚經濟撥款 ${pct(mul)}、門票 ${pct(mul)}、存款利率 ${pct(mul)}。`);
    const pol = doc.snap && doc.snap.pol;
    if (pol && pol.fx && CAS_FX_TEXT[pol.fx] && doc.day && pol.day && rpDays(pol.day, doc.day) >= 0 && rpDays(pol.day, doc.day) <= K.polDays) gl.push(`有效的政策：「${CAS_ECON.policies[pol.idx] || "某項政策"}」，${CAS_FX_TEXT[pol.fx]}（${pol.day.slice(5)} 抽到，持續到隔天）。`);
    secs.push({ t: "景氣（館內 GDP）", lines: gl });
  }
  secs.push({ t: "對帳", lines: [CAS_REPORT.gag] });
  return { day: doc.day, at: doc.at, span, from: d.from, title: CAS_REPORT.title, intro: CAS_REPORT.intro, stamp: `結算到 ${rpTime(doc.at)}${d.from ? `（從 ${d.from.slice(5)} 算起）` : "（第壹份，從開始記帳算）"}`, secs };
}

// ================================================================
//  全世界金流總覽（11-17 翊文：銀行多一個「金流」頁籤，動態 hub 顯示錢往哪裡流）
//  每個記帳的來源代號歸到一條線：[X, Y] ＝ 這個來源在 X、Y 兩個地方之間搬錢。
//  節點：world 已知世界（含旅客、散客、各集團、文化部）、house 莊家、budget 博物館資金、museum 修繕基金、gov 政府帳、sea 海底、players 館友（全部合起來）、gen 憑空（成長、擴充、開場）。
//  新來源沒歸到線就過不了 test/flow_hub.test.cjs。只給合計和來源標籤，不給個別館友和 NPC。
// ================================================================
export const CAS_FLOW_NODES = [ // tier：第幾層（上到下）；org：屬於哪個框（佩佩博物館）；順序就是同一層從左到右
  { id: "gen", name: "增長", tier: 0, note: "成長、擴充、開場：不是從哪個帳搬來的" },
  { id: "world", name: "已知世界", tier: 1, note: "館外的旅客、散客、各集團、文化部" },
  { id: "gb", name: "佩佩銀行準備金", tier: 2, org: "museum", note: "集團存進來的錢、借出去之前的錢；跟莊家分開" },
  { id: "ext", name: "海外（真實市場）", tier: 1, note: "真實的股票、行情、股利。負數＝館友在真實市場賺回來的，比投出去的多" },
  { id: "players", name: "館友", tier: 2, note: "所有館友的錢包合起來" },
  { id: "house", name: "莊家", tier: 2, org: "museum", note: "Yuga Bot 的賭場錢" },
  { id: "gov", name: "政府帳", tier: 3, note: "證交稅、營業稅、娛樂稅" },
  { id: "sea", name: "海底", tier: 3, note: "B4 水面底下，沉掉的錢" },
  { id: "museum", name: "修繕基金", tier: 3, org: "museum", note: "門票七成，之後修繕和預算公投" },
  { id: "budget", name: "博物館資金", tier: 3, org: "museum", note: "館方行政、投資、還館債" },
];
export const CAS_FLOW_ORGS = { museum: "佩佩博物館" }; // 框的名字
// 已知世界展開的小節點（世界單位名單＋家計＋公共＋NPC 錢包）：id 是 "w:單位id"，會跟著 WORLD_UNITS 新增、拆分、改名；沒有帳（house.world 是 null）就沒有
export function casFlowWorldNodes(house) {
  if (!house || house.world == null) return [];
  const am = wuAmounts(house), nm = id => id === WU_HH ? "家計" : id === WU_PUB ? "公共" : id === WU_WAL ? "NPC 錢包" : ((WORLD_UNITS.find(u => u.id === id) || {}).name || id);
  const ids = new Set(Object.keys(am)); for (const u of WORLD_UNITS) if (u && u.parent == null) ids.add(u.id); // 名單上的每個頂層單位都有，就算帳上還沒有
  const top = [...ids].map(id => ({ id: "w:" + id, name: nm(id), tier: 1, parent: "world", bal: Math.max(0, Math.floor(+am[id] || 0)) })).sort((x, y) => y.bal - x.bal);
  const subs = WORLD_UNITS.filter(u => u && u.parent != null).map(u => ({ id: "w:" + u.id, name: u.name || u.id, tier: 1, parent: "w:" + u.parent, bal: null })); // 子公司：名單上有上級的；帳上只分到頂層，所以沒有各自的餘額
  return top.concat(subs);
}
export const CAS_FLOW_LINE = {
  bj: ["house", "players"], pack: ["house", "players"], food: ["house", "players"], loan: ["house", "players"], loanBack: ["house", "players"], job: ["house", "players"], find: ["house", "players"], econLoot: ["house", "players"], bankInt: ["house", "players"],
  gStock: ["house", "players"], gRaise: ["world", "house"], gBuy: ["world", "house"], gDiv: ["world", "players"], stockIn: ["house", "players"], stockLev: ["house", "players"], gLev: ["house", "players"], bond: ["house", "players"], art: ["house", "players"], artAuction: ["house", "players"], tax: ["house", "gov"], econSea: ["house", "sea"],
  investFee: ["house", "budget"], budgetLoan: ["house", "budget"], budgetFix: ["house", "budget"], budgetRepay: ["house", "budget"], econWin: ["house", "budget"],
  stockFee: ["players", "budget"], artFee: ["players", "budget"], stockTax: ["players", "gov"], divTax: ["players", "gov"],
  bizTax: ["world", "gov"], entTax: ["world", "gov"],
  npcFood: ["world", "house"], npcBj: ["world", "house"], npcArtBuy: ["world", "house"], inMarket: ["world", "house"], grant: ["world", "house"], worldLoan: ["world", "house"], worldRepay: ["world", "house"], cultureRepay: ["world", "house"],
  houseInvestBuy: ["ext", "house"], houseInvestSell: ["ext", "house"], houseInvFix: ["ext", "house"],
  budgetInvestBuy: ["ext", "budget"], budgetInvestSell: ["ext", "budget"], budgetInvFix: ["ext", "budget"], npcTicketBudget: ["world", "budget"], npcCrowdBudget: ["world", "budget"], npcJob: ["world", "budget"], npcCellar: ["world", "budget"], npcCraft: ["world", "budget"], npcArt: ["world", "budget"], ticketBudget: ["world", "budget"],
  npcTicketMuseum: ["world", "museum"], npcCrowdMuseum: ["world", "museum"], ticketMuseum: ["world", "museum"],
  stockBuy: ["ext", "players"], stockSell: ["ext", "players"], stockRebase: ["ext", "players"], stockLevWin: ["ext", "players"], stockLevLoss: ["ext", "players"], dividend: ["ext", "players"], ticket: ["world", "players"], cultureStart: ["world", "players"],
  pLoan: ["gb", "players"], pLoanBack: ["gb", "players"], pBankInt: ["gb", "players"], pBond: ["gb", "players"], bondMove: ["house", "gb"], hdepIn: ["house", "gb"], hdepOut: ["house", "gb"], hdepInt: ["house", "gb"], gbSweepH: ["house", "gb"], gbSweepB: ["gb", "budget"],
  cultureGift: ["world", "players"],
  groupDeposit: ["world", "gb"], groupWithdraw: ["world", "gb"], groupLoan: ["world", "gb"], groupRepay: ["world", "gb"], groupIntDep: ["world", "budget"], groupIntLoan: ["world", "budget"], groupBankLoan: ["gb", "budget"], groupBankRepay: ["gb", "budget"], groupBankInt: ["gb", "budget"],
  worldGrow: ["gen", "world"], worldExpand: ["gen", "world"], reset: ["gen", "house"],
  start: ["gen", "players"], signWeek: ["gen", "players"], legacy: ["gen", "players"], discord: ["gen", "players"], work: ["gen", "players"], test: ["gen", "players"], exchange: ["players", "gen"],
};
// 今天 05:00 起各條記帳的累計（跟日報快照同一份：led0 在換日寫財報時存，shared/casino_book.js 的 casBookSnap 同一套來源）
// 線從出錢的單位出發（決定 0128）的來源：有單位端點的記帳（house.led.units）取代同名來源整個已知世界的那條（同壹筆錢）
export const CAS_FLOW_GRP = new Set(["cultureGift", "gRaise", "gBuy", "gDiv", "npcFood", "npcJob", "npcCellar", "npcCraft", "npcTicketBudget", "npcTicketMuseum", "npcCrowdBudget", "npcCrowdMuseum", "entTax", "bizTax"]);
export const CAS_FLOW_UNIT = { tradeHhGoods: "家計買日用品", tradeHhTax: "家計繳稅", tradeHhFee: "家計付保險利息", tradeWage: "集團付薪水給家計", wageNpc: "發薪水（集團→NPC 錢包）", wageBack: "多的薪水退回（NPC 錢包→集團）", tradeDaily: "日用品採購", tradeFee: "金融服務費", tradeResearch: "研究委託", tradeDesign: "展覽設計委託", tradeTax: "稅與規費", tradeSubsidy: "補助與公共採購", tradeTech: "科技服務", tradeGoods: "貨款（集團之間）", tradeLoan: "金融集團放款", tradeInterest: "借款利息", tradeRepay: "還款", tradeRev: "旗下股票營收（公共和集團）", gRaise: "集團增資（莊家買新股）", gBuy: "集團庫藏股（莊家收到買回的錢）", gDiv: "集團股利（發給持股的館友）" }; // gRaise／gBuy／gDiv（決定 0123）：線的兩端是莊家或館友和那家集團，不是整個已知世界 // 集團之間的交易種類（shared/world.js 的 wtLed 記的）：線的兩端是帳上記的集團
export const casFlowLed0 = snap => { const H = snap.house; return { day: snap.day || null, u: Object.assign({}, H.units), w: Object.assign({}, H.wflow), x: Object.assign({}, H.xflow), g: Object.assign({}, H.gflow), m: Object.assign({}, H.mint), f: Object.assign({}, H.flow), b: Object.assign({}, H.burn) }; };
const cfDiff = (now, then) => { const o = {}; for (const k of new Set([...Object.keys(now || {}), ...Object.keys(then || {})])) { const d = Math.round((+(now || {})[k] || 0) - (+(then || {})[k] || 0)); if (d) o[k] = d; } return o; };
// all：casBooksView(doc, true).all（每個帳的 [{ k, label, n }]，n 是這個帳自己的角度）。回傳 { edges, lost }
//   edges：[{ from, to, amt, srcs: [{ src, label, amt }] }]，兩個地方之間的淨流向（amt 一定 > 0），srcs 的 amt 對 edge 的方向（反方向的是負的）
//   lost：沒歸到線的來源（要是 0；test 擋）
export function casFlowEdges(all) {
  const pair = {}, done = new Set(), lost = [];
  // all.units（以後集團之間的交易放這裡）：[{ k, label, n }]，n > 0 ＝ 線 [X, Y] 的 X 付給 Y
  const GRP = new Set((all.units || []).filter(x => x.grp).map(x => x.k)); for (const k of GRP) done.add(k); // 集團增資、庫藏股、股利：照集團分開的線取代整個已知世界的那條（同壹筆錢）
  for (const x of all.units || []) {
    const ln = x.from && x.to ? [x.from, x.to] : CAS_FLOW_LINE[x.k]; if (!ln || ln[0] === ln[1]) { if (!ln) lost.push("units." + x.k); continue; }
    const key = [ln[0], ln[1]].sort().join("|"), first = key.split("|")[0], p = pair[key] || (pair[key] = { a: first, b: key.split("|")[1], srcs: [] });
    p.srcs.push({ src: x.k, label: x.label, amt: ln[0] === first ? x.n : -x.n });
  }
  for (const [A, list] of [["world", all.world], ["ext", all.ext], ["gb", all.gb], ["bankroll", all.bankroll], ["budget", all.budget], ["museum", all.museum], ["gov", all.gov]]) for (const x of list || []) {
    const a0 = A === "bankroll" ? "house" : A, ln = CAS_FLOW_LINE[x.k];
    if (done.has(x.k)) continue; // 同壹筆錢在兩個帳（已知世界、莊家…）：先到的算，後面那個是對面的同壹筆
    const at = ln ? ln.findIndex(id => id === a0 || (a0 === "world" && id.startsWith("w:"))) : -1; // 線的兩端可以是 "w:單位id"（已知世界裡的某個集團），算在已知世界的帳上
    if (!ln || at < 0) { lost.push(`${a0}.${x.k}`); continue; }
    done.add(x.k);
    const a = ln[at], other = ln[1 - at], key = [a, other].sort().join("|");
    // 以字母序小的當「正向」：n > 0 ＝ 進 a（other → a）。存成 [第一個, 第二個] 的淨額（正＝第一個 → 第二個）
    const first = key.split("|")[0], signed = (a === first ? -x.n : x.n); // a 是第一個：進 a ＝ 第二個 → 第一個 ＝ 負；a 是第二個：進 a ＝ 第一個 → 第二個 ＝ 正
    const p = pair[key] || (pair[key] = { a: first, b: key.split("|")[1], srcs: [] });
    p.srcs.push({ src: x.k, label: x.label, amt: signed });
  }
  const edges = [];
  for (const p of Object.values(pair)) {
    const net = p.srcs.reduce((s, x) => s + x.amt, 0);
    if (!net) continue;
    const fwd = net >= 0, srcs = p.srcs.map(x => ({ src: x.src, label: x.label, amt: fwd ? x.amt : -x.amt })).sort((x, y) => Math.abs(y.amt) - Math.abs(x.amt));
    edges.push({ from: fwd ? p.a : p.b, to: fwd ? p.b : p.a, amt: Math.abs(net), srcs });
  }
  return { edges: edges.sort((x, y) => y.amt - x.amt), lost };
}
// 銀行「金流」頁籤的資料：{ since: 'MM-DD', edges, bal }；led0 不是今天的（還沒寫）就回 null
export function casFlowHub(house, day) {
  const e = house && house.econ, L0 = e && e.led0, led = house && house.led;
  if (!L0 || L0.day !== day || !led) return null;
  const diff = { flow: cfDiff(led.flow, L0.f), houseMint: cfDiff(led.mint, L0.m), houseBurn: cfDiff(led.burn, L0.b), wflow: cfDiff(led.world, L0.w), xflow: cfDiff(Object.assign({}, led.ext, { extSplit: 0 }), Object.assign({}, L0.x, { extSplit: 0 })), gflow: cfDiff(led.gb, L0.g) }; // 決定 0126：led0 沒有 x（上線前寫的）就當 0；搬出那筆 extSplit 不算今天的流動
  const N = v => Math.floor(+v) || 0, v = casBooksView({ day, snap: { house: { bankroll: 0, budget: 0, museum: 0, gov: 0, sea: 0, world: 0, ext: 0, gb: 0 } }, diff }, true);
  v.all.units = (L0.u ? Object.entries(cfDiff(led.units, L0.u)) : []).filter(([, n]) => n > 0).map(([k, n]) => { const [kind, from, to] = k.split("|"), E = s => s === "house" || s === "players" || s === "budget" || s === "museum" || s === "gov" ? s : "w:" + s; return { k: kind, label: CAS_FLOW_UNIT[kind] || casReportLabel(kind, "world"), n, from: E(from), to: E(to), grp: CAS_FLOW_GRP.has(kind) }; }); // 集團之間的交易（all.units）
  const r = casFlowEdges(v.all);
  return { day, nodes: CAS_FLOW_NODES.map(n => ({ id: n.id, name: n.name, tier: n.tier, org: n.org || null, note: n.note })).concat(casFlowWorldNodes(house)), orgs: CAS_FLOW_ORGS, edges: r.edges.slice(0, 40), bal: { house: N(house.bankroll), budget: N(house.budget), museum: N(house.museum), gov: N(house.gov), sea: N(house.sea), world: house.world == null ? null : N(house.world), ext: house.world == null ? null : N(house.ext), gb: house.gb ? N(house.gb.cash) : 0 } };
}
