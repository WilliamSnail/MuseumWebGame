import { NUM } from "./config.js";
// ================================================================
//  賭場的記帳（11-13，數值平衡；docs/經濟體系規劃.md 第 2.2 節 P0）
//  純函式，不碰資料庫，也不依賴別的檔（所以 casino_wallet、econ、find、job 都可以 import）。
//  規則：籌碼只有兩種動法。
//    搬：錢包 ↔ 莊家 ↔ 博物館資金 ↔ 海底 ↔ 另一個錢包，總量不變。
//    憑空（mint）、消失（burn）：一定要用下面的 casMint／casBurn／casHouseMint，並且寫上來源。
//  記在哪：
//    錢包 w.led = { mint: {來源: 累計}, burn: {來源: 累計} }（這個錢包自己憑空來的、消失的）
//    莊家 house.led = { mint: {來源: 累計}, flow: {來源: 累計} }
//      mint：莊家憑空多的（破產重開）。flow：莊家的錢因為這個來源變多少（正＝進莊家，負＝出莊家）
//  每天第一次有人看財報時，伺服器把全館加總存成一份快照（casBookSnap）；兩份快照相減就是那一天的帳（casBookDiff）。
//  守恆：錢包總和 ＋ 在路上的（借款被扣、還沒交給莊家）＋ 打到一半的注 ＋ 莊家 ＋ 博物館資金 ＋ 海底，
//        永遠等於 開場的總和 ＋ 全部 mint － 全部 burn。測試 test/casino_book.test.cjs 擋這個。
// ================================================================
const bkNz = n => (Number.isFinite(+n) ? Math.floor(+n) : 0);
const bkBox = o => !!o && typeof o === "object" && !Array.isArray(o);

// 補欄位（casWalletFix、casHouseFix 會叫）
// 文化部館債現在的到期日：展延過就是原本的到期日 ＋ cultureExtDays 天（只展延壹次）
export function casCultureDue(h) {
  const H = NUM.casino.houseLoan; if (!H.cultureDue) return null;
  return h && h.cultureExt ? new Date(Date.parse(H.cultureDue + "T00:00:00Z") + H.cultureExtDays * 86400000).toISOString().slice(0, 10) : H.cultureDue;
}
export function casLedFix(x, keys) {
  if (!bkBox(x.led)) x.led = {};
  for (const k of keys) if (!bkBox(x.led[k])) x.led[k] = {};
  return x.led;
}
const bkAdd = (obj, src, n) => { obj[src] = bkNz(obj[src]) + n; };

// 活動次數（景氣指數 shared/casino_gdp.js 要用，不是錢）：莊家的文件裡累計，每天快照相減
export function casCount(house, key, n = 1) {
  if (!bkBox(house.act)) house.act = {};
  house.act[key] = bkNz(house.act[key]) + bkNz(n);
}

// 博物館資金、修繕基金憑空多 n（pool："budget"｜"museum"，門票這類館外進來的錢）
export function casPoolMint(house, pool, src, n) {
  n = bkNz(n);
  if (n <= 0) return 0;
  house[pool] = bkNz(house[pool]) + n;
  bkAdd(casLedFix(house, ["mint", "flow"]).mint, src, n);
  return n;
}

// 錢從錢包搬進博物館資金／修繕基金／政府帳（手續費、稅）：呼叫的人先自己扣錢包的籌碼，這裡加池子，並在 house.led.flow 記「這個來源讓池子多了 n」（池子自己的角度：正＝進池子）。
// pool："budget"｜"museum"｜"gov"（政府帳，決定 0110：資本利得稅）。不是憑空，是搬
export function casPoolGain(house, pool, src, n) {
  n = bkNz(n);
  if (n <= 0) return 0;
  house[pool] = bkNz(house[pool]) + n;
  bkAdd(casLedFix(house, ["mint", "flow"]).flow, src, n);
  return n;
}

// 錢包憑空多 n（n 要是正整數）。回傳 n
export function casMint(w, src, n) {
  n = bkNz(n);
  if (n <= 0) return 0;
  w.chips += n;
  bkAdd(casLedFix(w, ["mint", "burn"]).mint, src, n);
  return n;
}
// 錢包的籌碼消失 n
export function casBurn(w, src, n) {
  n = bkNz(n);
  if (n <= 0) return 0;
  w.chips -= n;
  bkAdd(casLedFix(w, ["mint", "burn"]).burn, src, n);
  return n;
}
// 莊家的錢因為 src 變動 n（正＝進莊家，負＝出莊家）。對面一定是錢包／博物館資金／海底，那邊自己動
export function casHouseMove(house, src, n) {
  n = bkNz(n);
  house.bankroll += n;
  bkAdd(casLedFix(house, ["mint", "flow"]).flow, src, n);
  return n;
}
// 莊家要付 need 但錢不夠時，跟博物館資金借（決定 0122，翊文 11-17）。借的是「博物館資金超過底線（起始的 budgetKeepPct%）的部分」的 coverPct%、壹次最多 coverMax；
// 記成莊家欠博物館資金（house.debt.budget，莊家賺了照舊先還這個），來源 budgetLoan（跟破產重開同壹條金流線）。回傳 { room: 最多借得到, take(n): 真的借 n 並回傳借到多少 }
// 壹支賣單、館內股、槓桿都用這壹個（不要各寫壹份）
export function casHouseCover(house, coverPct, coverMax) {
  const H = NUM.casino.houseLoan, spare = Math.max(0, (+house.budget || 0) - Math.floor(NUM.casino.econ.budgetStart * H.budgetKeepPct / 100));
  const room = Math.max(0, Math.min(Math.floor(spare * coverPct / 100), coverMax));
  return { room, take(n) { n = Math.min(Math.max(0, Math.floor(n)), room); if (n <= 0) return 0; house.budget -= n; casHouseMove(house, "budgetLoan", n); if (!house.debt || typeof house.debt !== "object") house.debt = {}; house.debt.budget = (+house.debt.budget || 0) + n; return n; } };
}
// 莊家的錢消失 n（還已知世界的貸款：本金加利息，流回館外）。house.led.burn 記來源
export function casHouseBurn(house, src, n) {
  n = bkNz(n);
  if (n <= 0) return 0;
  house.bankroll -= n;
  bkAdd(casLedFix(house, ["mint", "flow", "burn"]).burn, src, n);
  return n;
}
// ---------- 已知世界的池子（規劃 2.12）：house.world。錢進出已知世界是「搬」，不再憑空／消失；只有 casWorldGrow 是真正憑空的 ----------
// house.led.world[來源]：這個來源讓已知世界的池子變多少（正＝進已知世界，負＝出已知世界）
const bkW = house => { house.world = bkNz(house.world); return casLedFix(house, ["mint", "flow", "burn", "world"]).world; };
// 池子現在算吃緊嗎（低於起始的 lowPct%）。cfg 從呼叫的人給（這個檔不 import 別的檔）
export const casWorldLow = (house, cfg) => bkNz(house.world) < Math.floor(bkNz(cfg.start) * bkNz(cfg.lowPct) / 100);
// 今天池子還能付出多少（不吃緊＝池子全部；吃緊＝今天的上限 lowPayPct% 扣掉今天已經付的）。壹天的上限用「今天第壹次問的時候的池子」算
export function casWorldRoom(house, cfg) {
  const w = Math.max(0, bkNz(house.world));
  if (!casWorldLow(house, cfg)) return w;
  const day = house.day || null;
  if (!bkBox(house.wpay) || house.wpay.day !== day) house.wpay = { day, cap: Math.floor(w * bkNz(cfg.lowPayPct) / 100), n: 0 };
  return Math.max(0, Math.min(w, bkNz(house.wpay.cap) - bkNz(house.wpay.n)));
}
const bkWPaid = (house, cfg, n) => { if (casWorldLow(house, cfg) && bkBox(house.wpay)) house.wpay.n = bkNz(house.wpay.n) + n; };
// 館外股的錢（買賣、股利、換比例的零頭、槓桿損益）記在世界帳上的「海外（真實市場）」，不算本地的集團（決定 0121，shared/world.js 的 wuExt）
// 決定 0126：海外（真實市場）是跟已知世界（house.world）並列的壹個帳 house.ext（可以是負的：館友在真實市場賺回來的比投出去的多）。
//   這些來源的錢不碰 house.world，不受池子上限和「吃緊」限制，流水記在 house.led.ext[來源]（正＝進海外）。館方投資（博物館資金、莊家買賣館外股）也算（翊文 11-18，從搬出那天起）
export const BK_EXT = new Set(["stockBuy", "stockSell", "stockRebase", "stockLevWin", "stockLevLoss", "dividend", "houseInvestBuy", "houseInvestSell", "budgetInvestBuy", "budgetInvestSell", "houseInvFix", "budgetInvFix"]);
const bkX = house => { house.ext = bkNz(house.ext); return casLedFix(house, ["mint", "flow", "burn", "world", "ext"]).ext; };
const bkExtMove = (house, src, n) => { house.ext = bkNz(house.ext) + n; bkAdd(bkX(house), src, n); }; // n：進海外為正
// 錢包 → 已知世界；BK_EXT 的來源（買股、槓桿賠、換比例零頭）改進海外 house.ext（決定 0126）。回傳 n
export function casWorldIn(w, house, src, n) {
  n = bkNz(n);
  if (n <= 0) return 0;
  if (BK_EXT.has(src)) { w.chips -= n; bkExtMove(house, src, n); return n; }
  w.chips -= n; house.world = bkNz(house.world) + n;
  bkAdd(bkW(house), src, n);
  return n;
}
// 已知世界 → 錢包（門票等；賣股、槓桿賺、股利改由海外付）。池子不夠或吃緊的上限到了，只付得出的部分；回傳實際付的
export function casWorldOut(w, house, src, n, cfg) {
  if (BK_EXT.has(src)) { n = bkNz(n); if (n <= 0) return 0; w.chips += n; bkExtMove(house, src, -n); return n; } // 海外：沒有池子上限，付得出多少都付（決定 0126）
  n = Math.min(bkNz(n), casWorldRoom(house, cfg));
  if (n <= 0) return 0;
  bkWPaid(house, cfg, n);
  w.chips += n; house.world = bkNz(house.world) - n;
  bkAdd(bkW(house), src, -n);
  return n;
}
// 把錢包「憑空給的」開場籌碼改記成已知世界出的（決定 0082，新玩家的起始籌碼是文化部補助）：錢包的籌碼不動，
// 只是帳上「憑空 mint.start」減 n、已知世界池子減 n（來源 src 記 −n）。總量不變、憑空的也同步減，所以對帳差不變。回傳實際轉的 n
// （池子吃緊付不出就少轉，剩下的還是記憑空）
export function casWorldFund(w, house, src, n, cfg) {
  const led = bkBox(w.led) && bkBox(w.led.mint) ? w.led.mint : null;
  if (!led) return 0;
  n = Math.min(bkNz(n), bkNz(led.start), casWorldRoom(house, cfg));
  if (n <= 0) return 0;
  bkWPaid(house, cfg, n);
  led.start = bkNz(led.start) - n; house.world = bkNz(house.world) - n;
  bkAdd(bkW(house), src, -n);
  return n;
}
// 已知世界 → 莊家（撥款、貸款）
export function casHouseWorldOut(house, src, n, cfg) {
  if (BK_EXT.has(src)) { n = bkNz(n); if (n <= 0) return 0; house.bankroll += n; bkExtMove(house, src, -n); bkAdd(casLedFix(house, ["mint", "flow", "burn", "world", "ext"]).flow, src, n); return n; }
  n = Math.min(bkNz(n), Math.max(0, bkNz(house.world)));
  if (n <= 0) return 0;
  house.bankroll += n; house.world = bkNz(house.world) - n;
  bkAdd(casLedFix(house, ["mint", "flow", "burn", "world"]).flow, src, n); // 莊家這邊記成流入
  bkAdd(bkW(house), src, -n);
  return n;
}
// 莊家 → 已知世界（還款）。莊家這邊記成流出
export function casHouseWorldIn(house, src, n) {
  n = bkNz(n);
  if (n <= 0) return 0;
  if (BK_EXT.has(src)) { house.bankroll -= n; bkExtMove(house, src, n); bkAdd(casLedFix(house, ["mint", "flow", "burn", "world", "ext"]).flow, src, -n); return n; }
  house.bankroll -= n; house.world = bkNz(house.world) + n;
  bkAdd(casLedFix(house, ["mint", "flow", "burn", "world"]).flow, src, -n);
  bkAdd(bkW(house), src, n);
  return n;
}
// 博物館資金／修繕基金 → 已知世界（館方投資買股改進海外，見 BK_EXT）
export function casPoolWorldIn(house, pool, src, n) {
  n = Math.min(bkNz(n), Math.max(0, bkNz(house[pool])));
  if (n <= 0) return 0;
  if (BK_EXT.has(src)) { house[pool] = bkNz(house[pool]) - n; bkExtMove(house, src, n); bkAdd(casLedFix(house, ["mint", "flow", "burn", "world", "ext"]).flow, src, -n); return n; }
  house[pool] = bkNz(house[pool]) - n; house.world = bkNz(house.world) + n;
  bkAdd(casLedFix(house, ["mint", "flow", "burn", "world"]).flow, src, -n);
  bkAdd(bkW(house), src, n);
  return n;
}
// 已知世界 → 博物館資金／修繕基金（參觀者的門票）
export function casPoolWorldOut(house, pool, src, n) {
  if (BK_EXT.has(src)) { n = bkNz(n); if (n <= 0) return 0; house[pool] = bkNz(house[pool]) + n; bkExtMove(house, src, -n); bkAdd(casLedFix(house, ["mint", "flow", "burn", "world", "ext"]).flow, src, n); return n; }
  n = Math.min(bkNz(n), Math.max(0, bkNz(house.world)));
  if (n <= 0) return 0;
  house[pool] = bkNz(house[pool]) + n; house.world = bkNz(house.world) - n;
  bkAdd(casLedFix(house, ["mint", "flow", "burn", "world"]).flow, src, n);
  bkAdd(bkW(house), src, -n);
  return n;
}
// 已知世界每天成長（真正憑空，記 mint.worldGrow）
export function casWorldGrow(house, n) {
  n = bkNz(n);
  if (n <= 0) return 0;
  house.world = bkNz(house.world) + n;
  bkAdd(casLedFix(house, ["mint", "flow", "burn", "world"]).mint, "worldGrow", n);
  return n;
}

// 已知世界一次性擴充（決定 0117，真正憑空，記 mint.worldExpand；每個莊家文件壹次，由呼叫的人用 house.wExp 擋）
export function casWorldExpand(house, n) {
  n = bkNz(n);
  if (n <= 0) return 0;
  house.world = bkNz(house.world) + n;
  bkAdd(casLedFix(house, ["mint", "flow", "burn", "world"]).mint, "worldExpand", n);
  return n;
}

// 莊家憑空多 n（破產重開）
export function casHouseMint(house, src, n) {
  n = bkNz(n);
  if (n <= 0) return 0;
  house.bankroll += n;
  bkAdd(casLedFix(house, ["mint", "flow"]).mint, src, n);
  return n;
}

// 存在銀行的（跟 casino_bank.js 的 casBankHeld 壹樣；這個檔不 import 別的檔，所以自己算）
const bkHeld = w => bkNz(bkBox(w.stk) ? w.stk.hold : 0) + bkNz(bkBox(w.auc) ? w.auc.hold : 0) + bkNz(bkBox(w.lev) ? w.lev.hold : 0) + bkNz(bkBox(w.gs) ? w.gs.hold : 0) + (bkBox(w.bank) ? bkNz(w.bank.save) + (Array.isArray(w.bank.terms) ? w.bank.terms.reduce((s, x) => s + bkNz(x && x.amt), 0) : 0) : 0);
const bkDaysBetween = (a, b) => { const f = s => { const [y, m, d] = String(s).split("-").map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((f(b) - f(a)) / 86400000); };
const bkSumObj = o => Object.values(bkBox(o) ? o : {}).reduce((s, x) => s + bkNz(x), 0);
export const casBookSumObj = bkSumObj;
const bkMerge = (into, o) => { for (const [k, v] of Object.entries(bkBox(o) ? o : {})) bkAdd(into, k, bkNz(v)); };

// 全館加總。wallets：錢包的陣列（沒有的不用給）；house：莊家；inplay：打到一半、還沒結算的注（單人的局、牌桌的座位）
// 回傳快照：{ day, wallets: n 個錢包, chips 錢包籌碼總和, transit 在路上的, inplay, mint {來源}, burn {來源},
//            house: { bankroll, budget, sea, mint {來源}, flow {來源} } }
export function casBookSnap(wallets, house, inplay, day) {
  const s = { day: day || null, wallets: 0, active7: 0, chips: 0, transit: 0, bank: 0, inplay: bkNz(inplay), mint: {}, burn: {},
    house: { bankroll: bkNz(house.bankroll), budget: bkNz(house.budget), sea: bkNz(house.sea), museum: bkNz(house.museum), gov: bkNz(house.gov), world: house.world == null ? null : bkNz(house.world), ext: bkNz(house.ext), gb: bkBox(house.gb) ? bkNz(house.gb.cash) : 0, gbx: bkBox(house.gb) ? { debt: bkNz(house.gb.debt), dep: bkSumObj(house.gb.dep), loan: bkSumObj(house.gb.loan) } : { debt: 0, dep: 0, loan: 0 }, wflow: {}, xflow: {}, gflow: {}, mint: {}, flow: {}, burn: {}, act: {}, debt: bkBox(house.debt) ? { budget: bkNz(house.debt.budget), culture: bkNz(house.debt.culture), world: bkNz(house.debt.world) } : { budget: 0, culture: 0, world: 0 }, loansOut: bkNz(house.loansOut), cul: bkBox(house.cul) ? { paid: bkNz(house.cul.paid), late: bkNz(house.cul.late), budget: bkNz(house.cul.budget), day: house.cul.day || null, due: casCultureDue(house) } : null, culLate: bkNz(house.cultureLate) } };
  for (const w of wallets) {
    if (!bkBox(w)) continue;
    s.wallets++;
    if (day && typeof w.seen === "string" && bkDaysBetween(w.seen, day) <= 6) s.active7++; // 過去 7 天（含今天）來過的人
    s.chips += bkNz(w.chips);
    s.transit += bkNz(w.loan && w.loan.toHouse);
    s.bank += bkHeld(w); // 存在 Yuga Bot 銀行的（活存＋定存，shared/casino_bank.js）：還是玩家的錢
    if (bkBox(w.led)) { bkMerge(s.mint, w.led.mint); bkMerge(s.burn, w.led.burn); }
  }
  // 館內股的 NPC（規劃 2.8k）：最近壹天每家店有幾位旅客，和劇情日那天的事。日報寫「昨天館外來了 N 位旅客」用
  if (bkBox(house.sin) && bkBox(house.sin.npc)) { const ds = Object.keys(house.sin.npc).sort(), d = ds[ds.length - 1]; if (d) s.house.npcLast = { day: d, n: Object.assign({}, house.sin.npc[d]), ev: bkBox(house.sin.npcEv) && bkBox(house.sin.npcEv[d]) ? Object.assign({}, house.sin.npcEv[d]) : null, fest: bkBox(house.sin.npcFest) && Array.isArray(house.sin.npcFest[d]) ? house.sin.npcFest[d].map(e => Object.assign({}, e)) : [] }; }
  if (bkBox(house.npcw) && Array.isArray(house.npcw.ev)) s.house.npcw = { ev: house.npcw.ev.slice(-5).map(e => ({ day: e.day, npc: String(e.npc || "").slice(0, 40), from: e.from || null, to: e.to || null, t: e.t === "lay" ? "lay" : "move" })) }; // NPC 換工作（W6）
  if (bkBox(house.wh) && bkBox(house.wh.st)) { const st = {}; Object.keys(house.wh.st).forEach(k => { if (bkBox(house.wh.st[k])) st[k] = String(house.wh.st[k].s || "normal"); }); const un = {}; if (bkBox(house.wh.unrest)) Object.keys(house.wh.unrest).forEach(k => { un[k] = bkNz(house.wh.unrest[k]); }); s.house.wh = { day: house.wh.day || null, un, mood: bkBox(house.wh.mood) ? bkNz(house.wh.mood.v) : null, st, ev: Array.isArray(house.wh.ev) ? house.wh.ev.slice(-5).map(e => ({ day: e.day, unit: e.unit, to: e.to })) : [] }; } // 已知世界各單位的狀態（W5）
  if (bkBox(house.npcc)) { s.house.npcc = { comm: bkNz(house.npcc.comm), hall: bkNz(house.npcc.hall) }; if (bkBox(house.npcc.cl)) { s.house.npcc.cl = {}; Object.keys(house.npcc.cl).forEach(k => { s.house.npcc.cl[k] = bkNz(house.npcc.cl[k]); }); } }
  if (Array.isArray(house.reviews)) s.house.reviewsN = house.reviews.length;
  if (bkBox(house.npcs)) s.house.npcs = { day: house.npcs.day || null, ticket: bkNz(house.npcs.ticket), shop: bkNz(house.npcs.shop), total: bkNz(house.npcs.total), people: bkNz(house.npcs.people), crowd: bkBox(house.npcs.crowd) ? { ticket: bkNz(house.npcs.crowd.ticket), people: bkNz(house.npcs.crowd.people), groups: bkNz(house.npcs.crowd.groups), shop: bkNz(house.npcs.crowd.shop) } : null, byUnit: bkBox(house.npcs.byUnit) ? Object.assign({}, house.npcs.byUnit) : null, shopBy: bkBox(house.npcs.shopBy) ? JSON.parse(JSON.stringify(house.npcs.shopBy)) : null, menu: bkBox(house.npcs.menu) ? JSON.parse(JSON.stringify(house.npcs.menu)) : null, orders: Array.isArray(house.npcs.orders) ? house.npcs.orders.slice(0, 10).map(o => ({ who: String(o.who || "").slice(0, 20), item: String(o.item || ""), n: bkNz(o.n) })) : [] }; // NPC 來館花的錢（shared/npc_spend.js）
  if (bkBox(house.inv) && (bkBox(house.inv.last) || bkBox(house.inv.sum))) s.house.inv = { last: bkBox(house.inv.last) ? house.inv.last : null, sum: bkBox(house.inv.sum) ? house.inv.sum : null }; // 館方投資（shared/casino_invest.js）：昨天買賣了什麼、現在持有
  if (bkBox(house.led)) { bkMerge(s.house.wflow, house.led.world); bkMerge(s.house.xflow, house.led.ext); bkMerge(s.house.gflow, house.led.gb); bkMerge(s.house.mint, house.led.mint); bkMerge(s.house.flow, house.led.flow); bkMerge(s.house.burn, house.led.burn); }
  if (bkBox(house.led) && bkBox(house.led.units)) s.house.units = Object.assign({}, house.led.units); // 集團之間的交易（shared/world.js 的 wtLed）：金流頁籤算今天的線
  if (bkBox(house.act)) bkMerge(s.house.act, house.act);
  return s;
}
// 全館的錢（含莊家、博物館資金、海底）
export const casBookTotal = s => s.chips + s.transit + bkNz(s.bank) + s.inplay + s.house.bankroll + s.house.budget + s.house.sea + bkNz(s.house.museum) + bkNz(s.house.gov) + bkNz(s.house.world) + bkNz(s.house.ext) + bkNz(s.house.gb);
// 全部憑空的、消失的累計
export const casBookMinted = s => bkSumObj(s.mint) + bkSumObj(s.house.mint);
export const casBookBurned = s => bkSumObj(s.burn) + bkSumObj(s.house && s.house.burn);
// 守恆：total － minted ＋ burned 應該等於開場的總和（budgetStart ＋ houseStart；各錢包的開場籌碼也算 mint，所以不用另外加）。回傳差多少（0＝對）
export const casBookGap = (s, opening) => casBookTotal(s) - casBookMinted(s) + casBookBurned(s) - opening;

const bkDiffObj = (a, b) => {
  const out = {};
  for (const k of new Set([...Object.keys(bkBox(a) ? a : {}), ...Object.keys(bkBox(b) ? b : {})])) {
    const d = bkNz(b && b[k]) - bkNz(a && a[k]);
    if (d) out[k] = d;
  }
  return out;
};
// 兩份快照相減（a 較早，b 較晚）＝這段時間的帳。a 沒有（第一天）就從 0 算
export function casBookDiff(a, b) {
  const z = { chips: 0, transit: 0, bank: 0, inplay: 0, wallets: 0, mint: {}, burn: {}, house: { bankroll: 0, budget: 0, sea: 0, mint: {}, flow: {}, act: {} } };
  a = a || z;
  return {
    from: a.day || null, to: b.day || null,
    wallets: bkNz(b.wallets) - bkNz(a.wallets),
    chips: bkNz(b.chips) - bkNz(a.chips),
    bank: bkNz(b.bank) - bkNz(a.bank),
    bankroll: bkNz(b.house.bankroll) - bkNz(a.house.bankroll),
    budget: bkNz(b.house.budget) - bkNz(a.house.budget),
    sea: bkNz(b.house.sea) - bkNz(a.house.sea),
    museum: bkNz(b.house.museum) - bkNz(a.house.museum),
    gov: bkNz(b.house.gov) - bkNz(a.house.gov),
    world: bkNz(b.house.world) - bkNz(a.house.world), wflow: bkDiffObj(a.house.wflow, b.house.wflow), ext: bkNz(b.house.ext) - bkNz(a.house.ext), xflow: bkDiffObj(a.house.xflow, b.house.xflow), gb: bkNz(b.house.gb) - bkNz(a.house.gb), gflow: bkDiffObj(a.house.gflow, b.house.gflow),
    mint: bkDiffObj(a.mint, b.mint), burn: bkDiffObj(a.burn, b.burn),
    houseMint: bkDiffObj(a.house.mint, b.house.mint), houseBurn: bkDiffObj(a.house.burn, b.house.burn), flow: bkDiffObj(a.house.flow, b.house.flow),
    act: bkDiffObj(a.house.act, b.house.act), active7: bkNz(b.active7),
  };
}
// 第一份快照當起點：開場總和 ＝ 現在的總和 － 憑空 ＋ 消失（開始記帳以前的籌碼不補記）
export const casBookOpening = s => casBookTotal(s) - casBookMinted(s) + casBookBurned(s);
// 新壹天的日報要用哪個「開場總和」（對帳基準）。prev：前壹份日報（{ opening, gap, wfix, snap }）；snap：今天的快照；worldStart：已知世界池子的起始（NUM.casino.world.start）。回傳 { opening, fix, wfix }
//   已知世界有帳的那壹天（前壹份快照還沒有 world）：基準加「起始」（不是現在的餘額——餘額已經含了當天買賣股票搬進搬出的錢，11-14 加成餘額多算了 7.6 億的假差額）。
//   已經加錯的（前壹份有 world、沒有 wfix 記號、對帳差 ≠ 0）：壹次把前壹份的差額校正掉（fix），並記下來（日報寫），之後差額要是 0；再有差就是真的有路沒記帳。
export function casBookOpeningNext(prev, snap, worldStart) {
  if (!prev) return { opening: casBookOpening(snap), fix: 0, wfix: true };
  const pw = prev.snap && prev.snap.house ? prev.snap.house.world : null;
  if (pw == null) return { opening: bkNz(prev.opening) + bkNz(worldStart), fix: 0, wfix: true };
  if (!prev.wfix && Number.isFinite(+prev.gap) && +prev.gap !== 0) return { opening: bkNz(prev.opening) + Math.floor(+prev.gap), fix: Math.floor(+prev.gap), wfix: true };
  return { opening: bkNz(prev.opening), fix: 0, wfix: true };
}
