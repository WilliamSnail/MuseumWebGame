// ================================================================
//  Yuga Bot 日報（11-13，數值平衡；docs/經濟體系規劃.md 玩法 1）
//  純函式：吃一份「快照加上跟上一份的差」（casinoReport/{day}，shared/casino_book.js 算的），做出給玩家看的幾段字。
//  只公告「結算過的」：快照是每天第一個來看的人觸發的，不是即時數字（免得有人算「現在去賭莊家最虛弱」）。
//  海底只給水位（公分），不給數字（規劃第五節問題 12 還沒決定）。預算池、莊家給數字。
//  介面上的字用「壹」。文字是草稿，Yuga 可以改。
// ================================================================
import { NUM } from "./config.js";
import { casBookSumObj } from "./casino_book.js";
import { CAS_FX_TEXT } from "./casino_gdp.js";
import { CAS_ECON, CAS_MENU } from "./casino_text.js";
import { WORLD_UNITS } from "./world_roster.js";
import { statView } from "./stat_view.js";
import { NPC_ROSTER } from "./npc_roster.js";
import { npcCounters, npcNews } from "./npc.js";
import { CAS_ECON_EV, casEconUpText } from "./econ_events.js";
import { casFill } from "./casino.js";

export const CAS_REPORT = {
  title: "Yuga Bot 日報",
  intro: "館方的帳，Yuga Bot 每天算壹次。這是結算過的數字，不是現在的。",
  mint: { worldGrow: "外面世界每天成長", cultureStart: "文化部補助（新玩家的起始籌碼）", stockRebase: "股票換成真實比例的零頭", start: "新館友的開場籌碼", signWeek: "全勤簽到", legacy: "認領舊錢包", ticket: "參觀者門票（展廳主分紅）", discord: "綁定 Discord", work: "欠款去地下工作補回", test: "測試" },
  houseMint: { reset: "莊家破產後重新開張", grant: "文化部借款（外面世界撥款，要還）", worldLoan: "外面世界貸款（莊家破產重開，要還）", ticketBudget: "參觀者門票（進預算池）", ticketMuseum: "參觀者門票（進館方帳）" },
  // 外面世界的池子（規劃 2.12）：每個來源讓池子變多少（正＝進外面世界）
  world: { stockBuy: "買股票（錢給外面世界）", stockSell: "賣股票（外面世界付）", stockRebase: "股票換比例的零頭", stockLevWin: "槓桿賺的", stockLevLoss: "槓桿賠的", worldLoan: "貸款給莊家", worldRepay: "莊家還貸款", grant: "文化部借款撥款", cultureRepay: "莊家還文化部借款", ticket: "參觀者門票（展廳主）", ticketBudget: "參觀者門票（預算池）", ticketMuseum: "參觀者門票（館方帳）", npcArt: "旅客買畫、賣畫", npcTicketBudget: "NPC 的門票（預算池）", npcTicketMuseum: "NPC 的門票（館方帳）", npcCrowdBudget: "散客的門票（預算池）", npcCrowdMuseum: "散客的門票（館方帳）", npcFood: "NPC 在餐車花的", npcBj: "NPC 在牌桌花的", npcJob: "NPC 在委託櫃台花的", npcCellar: "NPC 在地下收藏庫花的", npcCraft: "NPC 在手作坊花的", houseInvestBuy: "莊家投資（買）", houseInvestSell: "莊家投資（賣）", budgetInvestBuy: "預算池投資（買）", budgetInvestSell: "預算池投資（賣）" },
  burn: { exchange: "換小獎", cultureRepay: "莊家還文化部借款", worldRepay: "莊家還外面世界貸款" },
  flow: { stockIn: "館內股票（莊家當對手盤）", stockLev: "槓桿（莊家當對手盤）", bond: "債券", art: "旅客買畫、賣畫（莊家）", artAuction: "畫的拍賣", bankInt: "銀行利息", investFee: "館方投資的手續費", npcArtBuy: "旅客買畫（莊家收到）", tax: "莊家稅", budgetLoan: "跟預算池借（莊家破產重開）", budgetRepay: "還預算池", bj: "21 點", pack: "免費和買來的大禮包", food: "餐車", loan: "借出去的錢", loanBack: "借款還回來（含逾期被扣）", econWin: "拚經濟成功（預算池撥來）", econLoot: "拚經濟被撈走的油水", econSea: "拚經濟沉到海底", job: "交委託", find: "地下撿到的" },
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

// flow 裡「不是莊家的錢」的來源（記帳的人用 casPoolWorldIn／Out：錢在預算池或館方帳跟外面世界之間搬，flow 記的是那個池子的角度：正＝進池子）。
// 莊家那塊（銀行財報的莊家、日報的「進出」）不能列它們，不然預算池收的門票會變成莊家的錢（11-16 對帳腳本 tools/books_sign_check.cjs 擋這個）
export const CAS_BOOK_POOL = { npcTicketBudget: "budget", npcCrowdBudget: "budget", npcJob: "budget", npcCellar: "budget", npcCraft: "budget", npcArt: "budget", budgetInvestBuy: "budget", budgetInvestSell: "budget", npcTicketMuseum: "museum", npcCrowdMuseum: "museum" };
// 帳上的來源代號 → 玩家看的名字（找不到才回代號，對帳腳本會擋沒有名字的）
// acct 是「外面世界」時，同壹個代號先用外面世界的名字（例如 grant：外面世界那塊叫「文化部借款撥款」，莊家那塊叫「文化部借款」）
export const casReportLabel = (k, acct) => (acct === "world" ? CAS_REPORT.world[k] : "") || CAS_REPORT.flow[k] || CAS_REPORT.houseMint[k] || CAS_REPORT.world[k] || CAS_REPORT.mint[k] || CAS_REPORT.burn[k] || k;

// 銀行「館內經濟」展開看的幾個帳（決定 0100）：{ day, bankroll, budget, museum, sea, world, d: { 各帳昨天的變化 }, top: { 各帳進出最大的最多 3 筆 [{ label, n }]（正＝進這個帳、負＝出這個帳）} }。
// 全部從日報已經算好的 snap 和 diff 拿（延遲壹天、整天不變）。每個帳的 n 都是「這個帳自己的角度」：進來是正、出去是負。
//   莊家＝flow（扣掉預算池、館方帳的搬動）＋houseMint（扣掉門票、外面世界成長）－houseBurn；外面世界＝wflow（正＝進外面世界）＋每天成長；
//   預算池＝門票、投資買賣、NPC 在委託／地下／手作坊花的、莊家跟預算池借還、投資手續費；館方帳＝門票進館方帳；海底沒有記來源，不列。
// full＝true 時多回 all（每個帳的全部來源 [{ k, label, n }]，k 是帳上的來源代號），給 tools/books_sign_check.cjs 對帳用。
export function casBooksView(doc, full) {
  if (!doc || !doc.snap || !doc.snap.house || !doc.diff) return null;
  const H = doc.snap.house, d = doc.diff, R = CAS_REPORT, add = (m, k, label, v) => { if (v) m.push({ k, label, n: Math.round(v) }); };
  const sorted = m => m.slice().sort((a, b) => Math.abs(b.n) - Math.abs(a.n)), top = m => sorted(m).slice(0, 3).map(x => ({ label: x.label, n: x.n }));
  const bank = [], world = [], budget = [], museum = [];
  const hm = d.houseMint || {}, fl = d.flow || {}, hb = d.houseBurn || {};
  for (const [k, v] of Object.entries(fl)) if (!CAS_BOOK_POOL[k]) add(bank, k, casReportLabel(k), v);
  for (const [k, v] of Object.entries(hm)) if (k !== "ticketBudget" && k !== "ticketMuseum" && k !== "worldGrow") add(bank, k, casReportLabel(k), v);
  for (const [k, v] of Object.entries(hb)) add(bank, k, casReportLabel(k), -v);
  for (const [k, v] of Object.entries(d.wflow || {})) add(world, k, casReportLabel(k, "world"), v); // 外面世界的角度：正＝進外面世界
  add(world, "worldGrow", casReportLabel("worldGrow", "world"), hm.worldGrow);
  add(budget, "ticketBudget", R.houseMint.ticketBudget, hm.ticketBudget); add(museum, "ticketMuseum", R.houseMint.ticketMuseum, hm.ticketMuseum);
  for (const [k, pool] of Object.entries(CAS_BOOK_POOL)) add(pool === "budget" ? budget : museum, k, casReportLabel(k), fl[k]); // 池子自己的角度：flow 正＝進池子
  add(budget, "econWin", R.flow.econWin, -(fl.econWin || 0)); add(budget, "investFee", "投資手續費", -(fl.investFee || 0)); add(budget, "budgetLoan", R.flow.budgetLoan, -(fl.budgetLoan || 0)); add(budget, "budgetRepay", R.flow.budgetRepay, -(fl.budgetRepay || 0)); // 這幾個動的是莊家（拚經濟撥款、投資手續費、借還），預算池在對面：反號
  const N = v => Math.round(+v) || 0;
  const out = { day: doc.day || null, bankroll: N(H.bankroll), budget: N(H.budget), museum: N(H.museum), sea: N(H.sea), world: H.world == null ? null : N(H.world),
    d: { bankroll: N(d.bankroll), budget: N(d.budget), museum: N(d.museum), sea: N(d.sea), world: N(d.world) }, top: { bankroll: top(bank), budget: top(budget), museum: top(museum), sea: [], world: top(world) } };
  if (full) out.all = { bankroll: sorted(bank), budget: sorted(budget), museum: sorted(museum), sea: [], world: sorted(world) };
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
  const bankFlow = Object.fromEntries(Object.entries(d.flow || {}).filter(([k]) => !CAS_BOOK_POOL[k])), flow = rpList(bankFlow, Object.fromEntries(Object.keys(bankFlow).map(k => [k, casReportLabel(k)])), true); // 預算池、館方帳的搬動不是莊家的進出
  if (flow.length) hl.push("進出：", ...flow);
  if (H.debt && H.debt.culture > 0 && NUM.casino.houseLoan.cultureDue) { // 文化部館債（30 天內還清）
    const dueD = (H.cul && H.cul.due) || NUM.casino.houseLoan.cultureDue, dl = doc.day ? Math.max(0, rpDays(doc.day, dueD)) : null, c = H.cul || {};
    hl.push(`文化部館債：剩 ${rpN(H.debt.culture)}，${dl === null ? "" : dl + " 天後"}到期（${dueD.slice(5)}）${dueD > NUM.casino.houseLoan.cultureDue ? "，回條來了：到期日已展延壹次" : ""}，今天還了 ${rpN(c.paid || 0)}。` + (H.culLate > 0 ? `逾期累計 ${rpN(H.culLate)}。` : ""));
  }
  const DB = H.debt || {}, debts = [["預算池", DB.budget], ["文化部持有的館債", DB.culture], ["外面世界", DB.world]].filter(x => x[1] > 0);
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
  if (doc.openingFix) hl.push(`對帳基準校正了 ${rpSign(doc.openingFix)}（外面世界池子上線那天的快照多算了池子當天的進出，不是錢不見）。`);
  if (H.npcs && H.npcs.crowd && H.npcs.crowd.ticket > 0) hl.push(`昨天 ${rpN(H.npcs.crowd.people)} 位散客（${rpN(H.npcs.crowd.groups)} 組）逛了展廳，散客門票 ${rpN(H.npcs.crowd.ticket)}${H.npcs.crowd.shop > 0 ? `、散客在店裡花了 ${rpN(H.npcs.crowd.shop)}` : ""}。`);
  if (H.npcs && H.npcs.total > 0) hl.push(`昨天 ${rpN(H.npcs.people)} 位館外的旅客來館，付了門票、在店裡花了，帶進館 ${rpN(H.npcs.total)} 籌碼（門票 ${rpN(H.npcs.ticket)}、店裡 ${rpN(H.npcs.shop)}）。`);
  if (H.wh && H.wh.st) { // 外面世界各集團的景氣狀態（W5，決定 0086）：只寫已經發生的
    const names = { cut: "減薪", squeeze: "緊縮", layoff: "裁員" }, nm = id => (WORLD_UNITS.find(u => u.id === id) || {}).name || id, cnt = { cut: 0, squeeze: 0, layoff: 0 };
    Object.values(H.wh.st).forEach(s => { if (cnt[s] != null) cnt[s]++; });
    const uneasy = Object.values(H.wh.un || {}).filter(v => v >= 50).length; if (uneasy) hl.push(`外面世界：${uneasy} 個集團人心浮動。`); // 集體不安（決定 0091）
    if (H.wh.mood != null) hl.push(statView("crowdMood", null, H.wh.mood).hint); // 展廳氣氛
    const bad = Object.keys(cnt).filter(k => cnt[k] > 0).map(k => `${cnt[k]} 個集團${names[k]}`);
    if (bad.length) hl.push(`外面世界的景氣：${bad.join("、")}，來館的旅客花得比較保守。`);
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
  if (H.inv && (H.inv.last || (H.inv.sum && (H.inv.sum.hold || []).length))) { // 館方投資外面世界（規劃 2.8f，延遲壹天：寫昨天的）
    const L = H.inv.last, nm = x => x.name + " " + rpN(x.n) + " 股", sum = H.inv.sum || { hold: [], pnl: 0 };
    if (L && ((L.buy || []).length || (L.sell || []).length)) hl.push("昨天館方投資外面世界：" + [(L.buy || []).length ? "買 " + L.buy.map(nm).join("、") : "", (L.sell || []).length ? "賣 " + L.sell.map(nm).join("、") : ""].filter(Boolean).join("；") + "。");
    else if (L && L.paused && (L.paused.house || L.paused.budget)) hl.push("昨天館方沒有買股票（" + (L.paused.house === "world" || L.paused.budget === "world" ? "外面世界資金吃緊" : "暫停買進") + "）。");
    if ((sum.hold || []).length) hl.push("館方現在持有：" + sum.hold.map(nm).join("、") + "；累計賺賠 " + rpSign(sum.pnl) + "。");
  }
  hl.push(`${s.wallets} 位館友的錢包合計 ${rpN(s.chips)} 籌碼。`);
  secs.push({ t: "莊家", lines: hl });
  // 預算池
  const bl = [];
  if (H.budget <= 0) bl.push(`預算池剩 ${rpN(H.budget)}。預算凍結中：拚經濟成功只撥平常的 ${NUM.casino.econ.freezeKeep}%。`);
  else {
    bl.push(`預算池剩 ${rpN(H.budget)}${first ? "" : `（這段時間 ${rpSign(d.budget)}）`}。`);
    if (!first && d.budget < 0) { const days = Math.floor(H.budget / (-d.budget / span)); bl.push(`照這個速度，大約還撐 ${rpN(days)} 天。`); }
  }
  secs.push({ t: "預算池（館方）", lines: bl });
  secs.push({ t: "館方帳", lines: [`館方帳有 ${rpN(H.museum || 0)} 籌碼${first ? "" : `（這段時間 ${rpSign(d.museum || 0)}）`}。來自參觀者的門票，之後用在修繕、捐款、預算公投。`] });
  // 海底：只給水位
  const cm = Math.floor(Math.max(0, H.sea) / C.seaPerCm), dcm = first ? 0 : Math.floor(Math.max(0, H.sea) / C.seaPerCm) - Math.floor(Math.max(0, H.sea - d.sea) / C.seaPerCm);
  secs.push({ t: "海底（B4 的水下）", lines: [`水位 ${rpN(cm)} 公分${dcm > 0 ? `，這段時間升了 ${rpN(dcm)} 公分` : ""}。`, !first && d.sea > 0 ? CAS_REPORT.seaNote : ""].filter(Boolean) });
  // 外面世界（規劃 2.12）：現在有多少、這段時間怎麼進出。有帳以前的日報沒有這一段
  if (H.world != null) {
    const wl = [`外面世界現在有 ${rpN(H.world)} 籌碼${first ? "" : `（這段時間 ${rpSign(d.world)}）`}。`];
    if (H.world < Math.floor(NUM.casino.world.start * NUM.casino.world.lowPct / 100)) wl.push("外面世界資金吃緊：賣股、槓桿賺的錢壹天只付得出壹部分，也暫停借錢給莊家。");
    const into = {}, out = {}, wNames = Object.fromEntries(Object.keys(d.wflow || {}).map(k => [k, casReportLabel(k, "world")]));
    for (const [k, v] of Object.entries(d.wflow || {})) { if (v > 0) into[k] = v; else if (v < 0) out[k] = -v; }
    if (Object.keys(into).length) wl.push("進外面世界：", ...rpList(into, wNames, false));
    if (Object.keys(out).length) wl.push("從外面世界出來：", ...rpList(out, wNames, false));
    secs.push({ t: "跟外面世界的往來", lines: wl });
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
    if (doc.ext && doc.ext.ok) gl.push(`外面世界的景氣：${x.bExt > 0.3 ? "比前幾季熱" : x.bExt < -0.3 ? "比前幾季冷" : "跟前幾季差不多"}（${doc.ext.quarter}）。`);
    else gl.push("外面世界的景氣：還沒有消息。");
    const K = NUM.casino.gdp, mul = 1 + K.fxPct / 100 * x.b, pct = v => `${v >= 1 ? "×" : "×"}${v.toFixed(2)}`;
    gl.push(`景氣的影響：拚經濟撥款 ${pct(mul)}、門票 ${pct(mul)}、存款利率 ${pct(mul)}。`);
    const pol = doc.snap && doc.snap.pol;
    if (pol && pol.fx && CAS_FX_TEXT[pol.fx] && doc.day && pol.day && rpDays(pol.day, doc.day) >= 0 && rpDays(pol.day, doc.day) <= K.polDays) gl.push(`有效的政策：「${CAS_ECON.policies[pol.idx] || "某項政策"}」，${CAS_FX_TEXT[pol.fx]}（${pol.day.slice(5)} 抽到，持續到隔天）。`);
    secs.push({ t: "景氣（館內 GDP）", lines: gl });
  }
  secs.push({ t: "對帳", lines: [CAS_REPORT.gag] });
  return { day: doc.day, at: doc.at, span, from: d.from, title: CAS_REPORT.title, intro: CAS_REPORT.intro, stamp: `結算到 ${rpTime(doc.at)}${d.from ? `（從 ${d.from.slice(5)} 算起）` : "（第壹份，從開始記帳算）"}`, secs };
}
