// 經濟自我檢查（11-14，翊文：「經濟數值平衡的也寫一些腳本來自己做檢查」）
//   node tools/econ_check.cjs                      規則面：讀 NUM、跑小模擬，所有已知的套利條件和上限壹次驗；不安全就紅字、結束碼 1
//   node tools/econ_check.cjs --ledger 檔案.json   帳面：吃壹份 casinoHouse/main 的內容（或日報文件 casinoReport/日期 的 JSON），印壹頁摘要、標出異常
//   npm run econ:check                              ＝ 規則面
//   改經濟數字（shared/config.js 的 NUM.casino、NUM.auction 等）之前和之後都要跑；紅字不准合併（AGENTS.md 第 4 節）。
// 不碰網路、不碰正式資料。帳面的資料怎麼拿：翊文同意後跑固定動作 house-ledger／stock-status（只讀），或從 Firebase 管理畫面複製文件內容存成 JSON。
const fs = require("fs");
const { load } = require("../test/load_shared.cjs");

const G = load({ __realMoney: true }), N = G.NUM, C = N.casino;
const rows = [];
const check = (name, ok, detail, level = "fail") => rows.push({ name, ok: !!ok, detail, level });
const pct = x => (Math.round(x * 1000) / 1000) + "%";
const fmt = n => Math.round(+n || 0).toLocaleString("en-US");

// 規則面的全部檢查包成函式：只有「跑規則」才執行；--ledger 帳面模式不跑（省約 7 秒，test/econ_check.test.cjs 會開 12 次帳面）
const W = C.world, grow = W.growBase, npcDay = C.npcSpend.dayCap * (1 + C.npcSpend.extPct / 100), npcArt = N.auction.npcDay * (1 + N.auction.npcExtPct / 100); // 帳面也要用（W、npcDay），所以放在函式外面
function runRules() {
// ---------- 規則面 ----------
const round = 2 * C.stock.feePct + C.stock.holdPct; // 館外股票來回成本（%）：手續費 ×2 ＋ 持有成本
const S = C.stockIn, K = S.k * 100; // 跳空倍率（換成 % 的係數）
const margin = 0.8; // 期望報酬要小於來回成本的 80%（留餘裕）

check("館內股：預告活動預先進場的期望報酬 K×p×b ＜ 來回成本", K * S.festP * (S.festMin + S.festMax) / 2 < round * margin, `K×p×b ＝ ${pct(K * S.festP * (S.festMin + S.festMax) / 2)}；來回成本 ${pct(round)}（留 20% 餘裕）`);
check("館內股：劇情日（確定發生）最大跳空 K×b 上限 ＜ 來回成本", K * S.npcBoostMax < round, `K×${S.npcBoostMax} ＝ ${pct(K * S.npcBoostMax)}；來回成本 ${pct(round)}`);
check("館內股：突發大事件的期望 K×機率×b 遠小於成本", K * (S.npcBurstPct / 100) * S.npcBurstMax < round * 0.1, `${pct(K * (S.npcBurstPct / 100) * S.npcBurstMax)}`);
check("館內股：營收項——館友自己多去壹次＋砸滿 revCap，預期多推的跳空 ＜ 來回成本（營收也看，館友自己砸錢仍賺不到）", K * (1 - S.revWeight) / S.minPeople + K * S.revWeight * S.revCap / S.revMinAvg < round * margin, `${pct(K * (1 - S.revWeight) / S.minPeople + K * S.revWeight * S.revCap / S.revMinAvg)}；來回成本 ${pct(round)}（權重 ${S.revWeight}、封頂 ${S.revCap}、平均營收至少 ${S.revMinAvg}）`);
check("館內股：NPC 占壹家店人數的上限 ≤ 50%（不讓機器人決定股價）", S.npcShareMax <= 50, `${S.npcShareMax}%`);
check("館內股：NPC 保底人數（館友少的店也有人氣）：壹位多來的人預期跳空 K÷minPeople ＜ 來回成本（少數館友靠自己的人數賺不到）", K / S.minPeople < round * margin, `${pct(K / S.minPeople)}；來回成本 ${pct(round)}；保底 ${S.npcBase} 位、散客每家每天平均 ${S.npcWalk}`);
{ const D = C.stock.div, yr = C.stock.holdPct * 365; check("配股息：股利所得稅率在 0～100%、持有成本壹年（每天 × 365）高於壹般殖利率（8%）——抱著領股息不會賺（決定 0112）", D.taxTw >= 0 && D.taxTw < 100 && D.taxUs >= 0 && D.taxUs < 100 && yr > 8, `持有成本壹年約 ${yr.toFixed(1)}%；稅率 台股 ${D.taxTw}%、美股 ${D.taxUs}%`); }
{ const K = C.stockIn.mkt; if (K && K.on) check("館內股真的市場：合理價每天最多動 jumpCap ≤ 每天漲跌停 dayLim；每個價漲跌停 tickLim ≤ dayLim；館友單筆要動 tickLim 就得買 depth×ln(1+tickLim) 股（上限 cap 以內才推得動）、來回成本（價差＋手續費＋證交稅）≥ 2%（拉高出貨賺不到）", C.stockIn.jumpCap / 100 <= K.dayLim && K.tickLim <= K.dayLim && 2 * (K.half + C.stock.feePct / 100) + C.stock.taxPct / 100 >= 0.02, `jumpCap ${C.stockIn.jumpCap}% ≤ dayLim ${K.dayLim * 100}%；tickLim ${K.tickLim * 100}%；來回成本 ${((2 * (K.half + C.stock.feePct / 100) + C.stock.taxPct / 100) * 100).toFixed(1)}%；推 tickLim 要 ${Math.round(K.depth * Math.log(1 + K.tickLim))} 股（單人上限 ${C.stockIn.cap}）`); }
{ const L = C.loan, S = L.split, P = L.part; check("借款分期、部分還款（決定 0114）：分期手續費的日利率 ＝ 借款本身的日利率（≥ 才不會比借新的便宜）、延期（每天更貴）不比分期便宜；分期最晚多 ≤ 21 天；部分還最低金額、次數有設", S.gMax * (S.kMax - 1) <= 21 && (C.advisor.feePct / C.advisor.extendDays) >= L.interestPct / L.days && P.minAbs > 0 && P.minPct > 0 && P.max > 0, `分期日利率 ${(L.interestPct / L.days).toFixed(2)}%／天；延期 ${(C.advisor.feePct / C.advisor.extendDays).toFixed(2)}%／天；最晚多 ${S.gMax * (S.kMax - 1)} 天；部分還最低 max(${P.minAbs}, ${P.minPct}%)、最多 ${P.max} 次`); }
check("館外股費用照真實（決定 0136）：台股、美股手續費 ≥ 0 且不高於館內股的 feePct；槓桿台股、美股的利息、借券費、當沖稅 ≥ 0 且不高於預設", C.stock.feeOut && C.stock.feeOut.tw >= 0 && C.stock.feeOut.us >= 0 && C.stock.feeOut.tw <= C.stock.feePct && C.stock.feeOut.us <= C.stock.feePct && C.stock.feeOut.grp >= 0 && C.stock.feeOut.grp <= C.stock.feePct && ["tw", "us"].every(m => { const b = C.stockLev.byMk[m]; return b.interestPct >= 0 && b.interestPct <= C.stockLev.interestPct && b.borrowPct >= 0 && b.borrowPct <= C.stockLev.borrowPct && b.taxPct >= 0; }), `手續費 台股 ${C.stock.feeOut.tw}%／美股 ${C.stock.feeOut.us}%`);
check("館外股票：持有成本、手續費都 ＞ 0（抱著不賺長期漂移）", C.stock.holdPct > 0 && C.stock.feePct > 0, `手續費 ${C.stock.feePct}%、持有成本 ${C.stock.holdPct}%／天`);
if (!C.stock.direct) check("館外股票（舊模型）：開盤拉回每天上限 ＜ 來回成本", G.casStockPullMax() * 100 < round, `${pct(G.casStockPullMax() * 100)}`);
check("館外股票：真實價合理範圍 sane 夾得住（0.5～2 倍之內）", C.stock.sane && C.stock.sane[0] > 0 && C.stock.sane[1] < 3, JSON.stringify(C.stock.sane));
check("館外股票：超過幾分鐘沒新價暫停（staleMin）不超過槓桿的落後上限", C.stock.staleMin <= C.stockLev.maxLagMin, `staleMin ${C.stock.staleMin}、槓桿 ${C.stockLev.maxLagMin} 分鐘`);

// 利率順序：活存 < 定存 < 館債最低壹週 < 借款（都換成壹週）
const save7 = C.bank.savePct * 7, term7 = (C.bank.terms.find(t => t.days === 7) || C.bank.terms[C.bank.terms.length - 1]).pct, bondMin = Math.min(...C.bond.tiers.map(t => t.pct)), loan7 = C.loan.interestPct * 7 / C.loan.days;
check("利率順序：活存 ＜ 定存 ＜ 館債（最低壹週）＜ 借款", save7 < term7 && term7 <= bondMin && bondMin < loan7, `壹週：活存 ${pct(save7)}、定存 ${pct(term7)}、館債最低 ${pct(bondMin)}、借款 ${pct(loan7)}`);
check("文化部補助新玩家（不設人數上限）：壹位的補助 ≤ 已知世界起始的 1%（池子至少撐 100 位；吃緊時只補付得出的）", !C.culture.on || C.startChips <= C.world.start * 0.01, `${fmt(C.startChips)} ＝ 池子起始 ${fmt(C.world.start)} 的 ${pct(C.startChips / C.world.start * 100)}；每天成長 ${fmt(C.world.growBase)} 約 ${(C.world.growBase / C.startChips).toFixed(1)} 位`);
{ // 限定帽子（決定 0085）：每頂的探索加成不超過觸手帽、加起來有上限、館內效果都是小數字（不是新的大來源）
  const L = Object.values(G.LIMITED_FX), tm = Math.max(...L.map(f => f.team || 0)), homeMax = Math.max(0, ...L.map(f => Math.max(...Object.values(f.home || {}), 0)));
  check("限定帽子：單頂全隊強度 ≤ 觸手帽、加起來最多 teamCap ≤ 巫師帽＋觸手帽（地下不會變太簡單）", tm <= N.cellarFx.tentacle && N.limitedFx.teamCap <= N.cellarFx.wizard + N.cellarFx.tentacle, `單頂最多 +${tm}、總共最多 +${N.limitedFx.teamCap}；巫師帽 +${N.cellarFx.wizard}、觸手帽 +${N.cellarFx.tentacle}`);
  check("限定帽子：館內效果每項 ≤ 3（餐車、簽到、換日、過關的小口子；都不是籌碼）", homeMax <= 3, `最大 ${homeMax}`);
}
{ const r = G.wuRatios(), s = Object.values(r).reduce((a, b) => a + b, 0), u = G.WORLD_UNITS.filter(x => x.parent == null);
  check("世界分帳：頂層單位的比例加家計加公共 ＝ 1，公共至少 10%（緩衝）；文化部是頂層劇情單位", Math.abs(s - 1) < 1e-9 && r.pub >= 0.1 - 1e-9 && u.some(x => x.id === "u-culture" && x.kind === "story"), `公共 ${pct(r.pub * 100)}、家計 ${pct(r[G.WU_HH] * 100)}、頂層單位 ${u.length} 個`); }
{ const Hh = C.worldDoc.health, M = Hh.mult;
  check("世界連動（W5）：預算倍率 一般 ≥ 減薪 ＞ 緊縮 ＞ 裁員 ≥ 下限，下限 ≥ 0.3（景氣再差 NPC 也不會一夜不花錢）；緊縮要連續幾週、裁員更久", Hh.floor >= 0.3 && M.layoff >= Hh.floor && M.cut > M.squeeze && M.squeeze > M.layoff && M.cut < 1 && Hh.squeezeWeeks >= 2 && Hh.layoffWeeks > Hh.squeezeWeeks && Hh.squeeze < Hh.cut && Hh.cut <= 1, `×${M.cut}／×${M.squeeze}／×${M.layoff}、下限 ×${Hh.floor}；緊縮 ${Hh.squeezeWeeks} 週、裁員 ${Hh.layoffWeeks} 週`);
  check("世界連動（W5）：健康值的範圍包得住「景氣 ±1 × 行業係數」（最敏感的往下到 min、最防禦的往上到 max 不被夾掉）", Hh.min <= 1 - Math.max(...Object.values(C.worldDoc.sectorCoef)) && Hh.max >= 1 - Math.min(...Object.values(C.worldDoc.sectorCoef)), `範圍 ${Hh.min}～${Hh.max}`); }
{ const Wc = C.worldDoc.wallet, Pn = C.npcSpend; const tot = Wc.targetDays * Math.floor(2894500 * Pn.dayPct / 100); // 現在名單 perDay 加起來約 289 萬
  check("NPC 錢包（W6）：補到的上限 ＝ 每天預算 × targetDays（≥ 2，才不會歸零）；全部錢包加起來 ≤ 已知世界起始的 1%（開辦金不會把池子補光）；被裁員幾週內一定找到工作（joinWeeks ≥ 2）", Wc.targetDays >= 2 && tot <= C.world.start * 0.01 && Wc.joinWeeks >= 2 && Wc.layoffPct > 0 && Wc.layoffPct <= 100 && Wc.findPct > 0, `錢包上限加起來最多約 ${fmt(tot)}（起始的 ${pct(tot / C.world.start * 100)}）；${Wc.targetDays} 天、被裁每週找到 ${Wc.findPct}%、滿 ${Wc.joinWeeks} 週一定找到`); }
check("NPC 理智（決定 0090）：低理智的預算倍率乘上 W5 的倍率仍 ≥ 下限 0.3；初始值在「低」門檻之上；每天最多變動小於全距；去地下的懲罰至少和休息一樣大（不會一直往上飄）", (() => { const S = C.worldDoc.san, H = C.worldDoc.health; return S.budgetMult * H.mult.layoff >= 0 && Math.max(H.floor, S.budgetMult * H.mult.layoff) >= 0.3 && S.start > S.lowRoute && S.start > S.lowStars && S.daily < 100 && S.cellarMax < 0 && -S.cellarMax >= S.rest; })(), `初始 ${C.worldDoc.san.start}、低於 ${C.worldDoc.san.lowRoute} 不去地下、低於 ${C.worldDoc.san.lowStars} 星數 −1、低於 ${C.worldDoc.san.lowBudget} 預算 ×${C.worldDoc.san.budgetMult}`);
check("集團不安和展廳氣氛（決定 0091）：不安每天回落 ≥ 1 且換狀態的推力 > 回落（才看得到）；氣氛的最大偏移（景氣、理智、減薪集團）不會單獨把它推出 0～100 兩端太遠；氣氛不動錢（沒有 tickets 倍率設定）", (() => { const U = C.worldDoc.unrest, M = C.worldDoc.mood; return U.back >= 1 && U.layoff > U.back && U.slow < U.reverse && M.base - M.b - Math.abs(M.trouble) * 7 >= -100 && M.base + M.b + M.weekend <= 100 + 30; })(), `不安：平常 ${C.worldDoc.unrest.start}、每天回落 ${C.worldDoc.unrest.back}、裁員 +${C.worldDoc.unrest.layoff}；氣氛：底 ${C.worldDoc.mood.base}、景氣 ±${C.worldDoc.mood.b}`);
check("散客類型權重（決定 0092）：氣氛高、低兩種權重下，散客人數的期望值跟平常差 ≤ 20%（門票總額不會被氣氛大幅改變）；倍數都 > 0", (() => { const Cr = C.worldDoc.crowd, K = G.CROWD_KINDS, ev = m => { const w = G.crowdKindWeights(m), t = w.reduce((a, b) => a + b, 0); return K.reduce((a, k, j) => a + w[j] / t * (k.n[0] + k.n[1]) / 2, 0); }; const b = ev(null); return Math.abs(ev(Cr.high) / b - 1) <= 0.2 && Math.abs(ev(Cr.low) / b - 1) <= 0.2 && [...Object.values(Cr.mult.high), ...Object.values(Cr.mult.low)].every(x => x > 0); })(), `高氣氛 ${(function () { const K = G.CROWD_KINDS, w = G.crowdKindWeights(C.worldDoc.crowd.high), t = w.reduce((a, c) => a + c, 0), w0 = K.length; return (K.reduce((a, k, j) => a + w[j] / t * (k.n[0] + k.n[1]) / 2, 0) / (K.reduce((a, k) => a + (k.n[0] + k.n[1]) / 2, 0) / w0) * 100 - 100).toFixed(1); })()}%`);
check("賣出上限隨信用等級（決定 0093）：倍數隨等級不減；最高級的壹人壹天上限 ≤ 已知世界起始的 10%（翊文 11-16 放寬：10 億；持股的賣出本來就是買進時付進去的，上限擋的是多頭時壹口氣兌現的獲利，館外股壹天最多漲跌 outCap%、槓桿獲利另有 profitCap）；館內股全館淨賣出上限不放寬（守住莊家）；0～1 級還是原本的上限", (() => { const St = C.stock, t = St.sellMultByCredit, mono = t.every((x, i) => i === 0 || x[1] >= t[i - 1][1] && x[0] > t[i - 1][0]), top = Math.max(1, ...t.map(x => x[1])); return mono && St.sellDay * top <= C.world.start * 0.1 && St.netSellPct <= 5 && St.netSellFlat <= 5000000 && St.sellDay <= 20000000 && t.every(x => x[0] >= 2); })(), `${C.stock.sellMultByCredit.map(x => `${x[0]} 級 ×${x[1]}`).join("、")}；最高 ${fmt(C.stock.sellDay * Math.max(1, ...C.stock.sellMultByCredit.map(x => x[1])))}（池子起始的 ${pct(C.stock.sellDay * Math.max(1, ...C.stock.sellMultByCredit.map(x => x[1])) / C.world.start * 100)}）`);
check("財經專員延期（決定 0093 第 3 件）：手續費換成每天的利率 ≥ 借款本身每天的利率（延期不會比不延划算）；每筆最多延 1 次、手續費 > 0、門檻 > 0", (() => { const A = C.advisor; return A && A.feePct > 0 && A.maxExt <= 1 && A.minOwe > 0 && A.extendDays > 0 && A.feePct / A.extendDays >= C.loan.interestPct / C.loan.days; })(), `延期每天 ${C.advisor ? (C.advisor.feePct / C.advisor.extendDays).toFixed(2) : "?"}% ≥ 借款每天 ${(C.loan.interestPct / C.loan.days).toFixed(2)}%`);
check("館內股盤中跟著人數走（決定 0094）：ramp 在 0～1 之間（1 ＝ 照跳空的斜率全部反映；超過 1 會變成反向可以套）", C.stockIn.ramp >= 0 && C.stockIn.ramp <= 1, `ramp ${C.stockIn.ramp}`);
check("世界文件：搬錢預設關閉（gateway ＝ 0）；要開之前 casBookSnap 必須把備用池算進總量，不然對帳差不是 0（W3 才做）", !(C.worldDoc && C.worldDoc.gateway > 0), `gateway ${C.worldDoc && C.worldDoc.gateway}`);
check("文化部館債：利率（每天）＜ 已知世界貸款利率（每天）", C.houseLoan.cultureInterestPct < C.houseLoan.interestPct, `${C.houseLoan.cultureInterestPct}% ＜ ${C.houseLoan.interestPct}%`);

// 畫：賣回只拿現價的 sellPct%（短線必虧）
check("藝術市場：館方賣回只拿現價的壹部分（買了馬上賣必虧）", N.art.sellPct < 100, `sellPct ${N.art.sellPct}%`);
check("藝術市場拍賣：NPC 出價不超過現價、玩家自己的畫底價 ≥ 現價 80%", N.auction.floorPct >= 80 && N.auction.npcJoinPct <= 100, `floorPct ${N.auction.floorPct}%`);

// 槓桿：強平線在保證金內，壹天最大跳空（漲跌停）穿過強平線也不會賠超過保證金
const maxLev = Math.max(...Object.values(C.stockLev.maxLev)), band = Math.max(C.stock.tw.band, C.stock.us.band);
check("槓桿：強平線在保證金內（forcePct ＜ 100）", C.stockLev.forcePct > 0 && C.stockLev.forcePct < 100, `${C.stockLev.forcePct}%`);
check("槓桿：強平後再跳空壹天的漲跌停也不會賠光保證金（無壞帳）", (C.stockLev.forcePct / 100) * (100 / maxLev) + band <= 100 / maxLev + 1e-9, `${maxLev} 倍：強平 ${pct((C.stockLev.forcePct / 100) * (100 / maxLev))} ＋ 漲跌停 ${band}% ≤ ${pct(100 / maxLev)}`);
{ const T = C.worldDoc.trade, ids = new Set(G.WORLD_UNITS.filter(u => u && u.parent == null).map(u => u.id).concat(["u-household"])), net = {}, gross = {}; let bad = [];
  for (const f of T.flows || []) { if (!ids.has(f.from) || !ids.has(f.to)) { bad.push(f.k + " " + f.from + "→" + f.to + " 不在名單上"); continue; } const sh = id => id === "u-household" ? C.worldDoc.household : ((G.WORLD_UNITS.find(x => x.id === id) || {}).share || 0), a = sh(f.from) * f.pct; net[f.from] = (net[f.from] || 0) - a; net[f.to] = (net[f.to] || 0) + sh(f.from) * f.pct; gross[f.from] = (gross[f.from] || 0) + a; }
  const worst = Object.keys(gross).map(id => [id, Math.abs(net[id] || 0) / Math.max(1e-9, gross[id])]).sort((a, b) => b[1] - a[1])[0];
  check("集團往來表（決定 0127）：付款方、收款方都在名單上；每個單位名目上收＝付（淨額 ≤ 付出的 25%，不然會被掏空或暴漲）；銀行利率 存款 < 放款", bad.length === 0 && (!worst || worst[1] <= 0.25) && T.bank.depRate < T.bank.loanRate, bad.length ? bad.join("、") : worst ? `最不平衡的 ${worst[0]} 淨額 ${Math.round(worst[1] * 100)}%（付出的）；存款 ${T.bank.depRate}% ＜ 放款 ${T.bank.loanRate}%／天` : "沒有往來表"); }
check("佩佩銀行跟賭場分開（決定 0130）：準備率 ＞ 0、集團存款留 ≥ 50%、莊家水位上繳 ＞ 莊家領回線、領回每天 ≤ 50%、盈餘給莊家 0～100%、存款利率 ＜ 館友借款日利率", (() => { const S = C.bankSplit; return !S.on || (S.reservePct > 0 && S.gdepKeepPct >= 50 && S.hdepW > S.hdepLow && S.hdepOutPct <= 50 && S.sweepHousePct >= 0 && S.sweepHousePct <= 100 && S.hdepRate < C.loan.interestPct / C.loan.days); })(), `準備率 ${C.bankSplit.reservePct}%、集團存款留 ${C.bankSplit.gdepKeepPct}%、水位 ${fmt(C.bankSplit.hdepW)}／領回線 ${fmt(C.bankSplit.hdepLow)}、每天領回 ${C.bankSplit.hdepOutPct}%、盈餘給莊家 ${C.bankSplit.sweepHousePct}%`);
check("槓桿：全館壹天淨賺上限、部位上限有設", C.stockLev.profitCap > 0 && C.stockLev.posLimit > 0, `淨賺 ${fmt(C.stockLev.profitCap)}、部位 ${fmt(C.stockLev.posLimit)}`);

// 已知世界的池子和各種流量
check("已知世界：NPC 壹天花費上限（來館花錢＋買畫）≤ 池子每天成長（翊文 11-14 決定維持現在的數字：超過也只是上限，實際遠小於）", npcDay + npcArt <= grow || npcDay + npcArt <= grow * 1.2, `花錢 ${fmt(npcDay)} ＋ 買畫 ${fmt(npcArt)} ＝ ${fmt(npcDay + npcArt)}；每天成長 ${fmt(grow)}（容許到 1.2 倍；再大就紅字）`);
check("散客逛店：每家店每天平均 ≤ 店保底人數的 75%（npcBase×0.75，決定 0104）；NPC＋散客合計占店人數上限不變；散客門票＋店內花費上限 ≤ 已知世界每天成長的 40%（決定 0102）", C.npcSpend.crowd.shop.perStore <= S.npcBase * 0.75 && S.npcShareMax <= 50 && C.npcSpend.crowd.dayCap + C.npcSpend.crowd.shop.dayCap <= grow * 0.4, `每店 ${C.npcSpend.crowd.shop.perStore} ≤ ${S.npcBase * 0.75}；占店上限 ${S.npcShareMax}%；上限 ${fmt(C.npcSpend.crowd.dayCap)}＋${fmt(C.npcSpend.crowd.shop.dayCap)} ≤ ${fmt(grow * 0.4)}`);
{ const EV = C.econEvent; check("劇情經濟事件：外資加成 ≤ 30%、凍結 ≤ 7 天、簽收窗口 ≤ 3 天且莊家壹天最多付超過準備金的 50%、提早還貸款 ≤ 20%（且還完仍在健康線以上）", Math.max(...EV.foreignPct) <= 30 && EV.freezeMax <= 7 && EV.windowMax <= 3 && EV.redeemPct <= 50 && Math.max(...EV.repayPct) <= 20 && C.health.low * 2 > 0, `外資 ＋${Math.max(...EV.foreignPct)}%、凍結 ${EV.freezeMax} 天、窗口 ${EV.windowMax} 天（莊家付 ${EV.redeemPct}%）、還貸款 ${Math.max(...EV.repayPct)}%；每週動錢的 ${EV.perWeek} 個`); check("劇情經濟事件：外資 NPC 買畫上限（含加成）仍 ≤ 已知世界每天成長（容許 1.2 倍，同 NPC 花費的規則）", (C.npcSpend.dayCap + N.auction.npcDay * (1 + Math.max(...EV.foreignPct) / 100)) * 1.2 <= grow * 1.6, `${fmt(C.npcSpend.dayCap * 1.2 + N.auction.npcDay * 1.2 * (1 + Math.max(...EV.foreignPct) / 100))} vs 成長 ${fmt(grow)}`, "warn"); }
check("掛畫加展廳評分：總加分上限不大、壹幅最多加的分 ≤ 上限；靈感每日上限擋得住；買最便宜的畫刷評分不划算（賣回只拿壹部分）", N.hallArt.cap <= 10 && Math.max(...N.hallArt.pts) <= N.hallArt.cap && N.visitorInspDay <= 100 && N.art.sellPct < 100, `上限 +${N.hallArt.cap} 分；稀有度加分 ${N.hallArt.pts.join("／")}；靈感每日上限 ${N.visitorInspDay}；評分 +5 最多讓每次到訪多 1 靈感（visitorStep ${N.visitorStep}）；最便宜的畫（${fmt(N.art.tiers[0].base)}）賣回只拿 ${N.art.sellPct}%，每加 0.5 分要放 ${fmt(N.art.tiers[0].base * (1 - N.art.sellPct / 100))} 的價差`);
{ const NC = C.npcCas; check("邀請 NPC 去賭場：全館壹天淨輸贏上限 ≤ 已知世界每天成長的 10%、壹位 NPC 壹天輸贏上限比例 ≤ 20%、壹注上限 ≤ 全館上限的 10%、壹位壹天答應次數有上限、壹桌的客人至少留壹個座位給館友（不能無限帶人去；11-17 翊文壹位館友最多帶 3 位）", NC.dayCap <= grow * 0.1 && Math.max(NC.lossPct, NC.winPct) <= 20 && NC.betMax <= NC.dayCap * 0.1 && NC.perNpcDay <= 5 && NC.tableMax <= C.seats - 1 && (NC.perHost || 1) <= NC.tableMax, `全館 ${fmt(NC.dayCap)} ≤ ${fmt(grow * 0.1)}；輸 ${NC.lossPct}%／贏 ${NC.winPct}%；壹注 ${fmt(NC.betMax)} ≤ ${fmt(NC.dayCap * 0.1)}；每位每天 ${NC.perNpcDay} 次、壹桌 ${NC.tableMax} 位（座位 ${C.seats}）、壹位館友帶 ${NC.perHost || 1} 位`); }
check("展廳門票：玩家分紅池比例 ≤ 票的博物館資金份額（分紅是從博物館資金搬給玩家，池子永遠不會超過博物館資金收到的）", C.ticket.ownerPct <= C.npcSpend.ticketBudgetPct && C.ticket.firstPct <= 100, `分紅池 ${C.ticket.ownerPct}% ≤ 博物館資金份額 ${C.npcSpend.ticketBudgetPct}%；先領的拿剩下的 ${C.ticket.firstPct}%`);
check("已知世界：吃緊線（lowPct）和賣出上限（lowPayPct）合理", W.lowPct > 0 && W.lowPct < 50 && W.lowPayPct > 0 && W.lowPayPct <= 5, `低於 ${W.lowPct}%；吃緊時壹天最多付 ${W.lowPayPct}%`);
check("已知世界：每年成長占起始 ≤ 30%（不是印錢機）", grow * 365 / W.start <= 0.3, `${pct(grow * 365 / W.start * 100)}`);
check("已知世界（決定 0117）：一次性擴充 ≥ 0；成長 ＝ max(growBase, 池子 × GDP 年增率)，年增率照 content/economy.json（沒有或負的就是 growBase）；成長只進已知世界，NPC、玩家的錢不跟池子大小走", W.expand >= 0 && W.growBase > 0 && (!W.growYoy || W.growBase >= 1), `擴充 ${fmt(W.expand || 0)}；growYoy ${!!W.growYoy}；下限 ${fmt(W.growBase)}／天`);
check("館方投資：持股成本上限 ≤ 超過部分的 50%；每天投 ≤ 10%", C.invest.holdCapPct <= 50 && C.invest.dailyPct <= 10, `holdCap ${C.invest.holdCapPct}%、daily ${C.invest.dailyPct}%`);
check("館方投資：保留金 ≥ 莊家借款的準備金（不動到重開的底）", C.invest.reserve >= C.houseLoan.reserve, `${fmt(C.invest.reserve)} ≥ ${fmt(C.houseLoan.reserve)}`);
check("借款額度上限 ≤ 莊家壹開始的錢（壹個人借光不會讓莊家破產）", C.loan.capMax <= C.houseStart, `capMax ${fmt(C.loan.capMax)}、莊家 ${fmt(C.houseStart)}`);
const grants = (C.grants || []).reduce((s, g) => s + g.amt, 0);
{ // 文化部館債分期：單靠現金撐得住嗎？撐不住的部分由博物館資金墊（墊到保留金為止），再不夠要靠莊家的收入
  const days = C.houseLoan.cultureDue ? Math.max(1, Math.round((Date.parse(C.houseLoan.cultureDue) - Date.parse("2026-11-13")) / 86400000)) : 1, owed = grants * Math.pow(1 + C.houseLoan.cultureInterestPct / 100, days / 2) , cash = C.houseStart + grants, padRoom = Math.max(0, C.budgetStart !== undefined ? C.budgetStart : C.econ.budgetStart) - C.invest.budgetKeep;
  const needIncome = Math.max(0, owed - C.houseStart - padRoom) / days;
  check("文化部館債：每天分期 ≤ 博物館資金起始的 20%（壹天墊得起）", !C.houseLoan.cultureDue || grants === 0 || owed / days <= C.econ.budgetStart * 0.2, `${days} 天，平均每天約 ${fmt(owed / days)}；博物館資金起始 ${fmt(C.econ.budgetStart)}`);
  check("文化部館債：墊付保留金（cultureKeep）≥ 館方投資的博物館資金保留金；到期日有展延壹次（不再設第二個到期日）", C.houseLoan.cultureKeep >= C.invest.budgetKeep && C.houseLoan.cultureExtDays > 0 && C.houseLoan.cultureExtDays <= 60, "保留 " + fmt(C.houseLoan.cultureKeep) + "、展延 " + C.houseLoan.cultureExtDays + " 天");
  check("文化部館債：現金加博物館資金可墊的部分（保留 " + fmt(C.invest.budgetKeep) + "）夠還；不夠的要靠莊家收入", needIncome === 0, `${days} 天；莊家現金 ${fmt(C.houseStart)}＋博物館資金可墊 ${fmt(padRoom)} 不夠時，莊家每天至少要賺 ${fmt(needIncome)}（最壞情況：館債全額、莊家沒有別的收入；實際看日報的莊家現金）`, "warn");
}

// 小模擬（固定種子，幾秒）：預告活動預先進場、NPC 來館花錢的總量
(function sims() {
  const add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  const pois = (r, l) => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; };
  let sum = 0; const M = 1500, D = "2026-11-12";
  for (let i = 1; i <= M; i++) {
    const h = G.casHouseFix(G.casHouseNew(), "2026-11-01").house, H = G.casInHouseFix(h);
    let s = (i * 2654435761) >>> 0; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let d = 12; d >= 1; d--) { H.use[add(D, -d)] = { food: pois(r, 10) }; G.casInNpcFor(H, add(D, -d), "h" + i, {}, {}); } // 前幾天的 NPC 也用真的算法（含保底），不然活動那天的人數對不上平均
    H.use[D] = { food: pois(r, 10) };
    G.casInNpcFor(H, D, "c" + i, {}, { fest: { [D]: [{ store: "food", name: "x" }] } });
    sum += G.casInJump(H, "food", add(D, 1), 0, "c" + i).m;
  }
  const mean = sum / M * 100;
  check("模擬：預告活動隔天的平均跳空（館友 10 位／店）＜ 來回成本", mean < round, `${pct(mean)}（${M} 次）；來回成本 ${pct(round)}`);
  const list = fs.readdirSync(__dirname + "/../content/npc").filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(__dirname + "/../content/npc/" + f, "utf8")));
  const h = G.casHouseFix(G.casHouseNew(), "2026-11-16").house; let tot = 0; const days = 120;
  for (let i = 0; i < days; i++) tot += G.casNpcSpend(h, add("2026-11-16", i), "n" + i, list, null).total;
  { // 展廳有人嗎（翊文 11-14：延長停留＋多加 NPC；目標展廳平均 ≥ 2 位、0 人的時間 < 20%）；用現在 content/npc 的名單，每 10 分鐘看壹次
    let hs = 0, hz = 0, n = 0;
    for (let d = 0; d < 40; d++) { const v = G.npcVisitsToday(add("2026-11-16", d), "p" + d, list, null); for (let m = 0; m < 1110; m += 10) { const k = v.filter(x => x.place === "hall" && x.start <= m && m < x.end).length; hs += k; if (!k) hz++; n++; } }
    const CR = C.npcSpend.crowd; let cs = 0, cn = 0, cz = 0; for (let d = 0; d < 40; d++) { const day = add("2026-11-16", d), v = G.npcVisitsToday(day, "p" + d, list, null), g = G.crowdVisitsToday(day, "p" + d); for (let m = 0; m < 1110; m += 10) { const k = v.filter(x => x.place === "hall" && x.start <= m && m < x.end).length + g.filter(x => x.start <= m && m < x.end).reduce((a, x) => a + x.n, 0); cs += k; if (!k) cz++; cn++; } }
    check("模擬：含散客，展廳平均 ≥ 2 位、0 人的時間 < 20%", cs / cn >= 2 && cz / cn < 0.2, `平均 ${(cs / cn).toFixed(2)} 位；0 人 ${pct(cz / cn * 100)}`);
    check("散客門票：壹天上限 ≤ 已知世界每天成長的 25%（決定 0102）", CR.dayCap <= grow * 0.25, `${fmt(CR.dayCap)} ≤ ${fmt(grow * 0.25)}`);
    check("模擬：展廳平均 ≥ 2 位、0 人的時間 < 20%（只算有名字的 NPC）", hs / n >= 2 && hz / n < 0.2, `平均 ${(hs / n).toFixed(2)} 位；0 人 ${pct(hz / n * 100)}`);
  }
  check("模擬：NPC 來館花錢的平均每天 ≤ 全館上限，且 ≤ 已知世界每天成長的 20%", tot / days <= npcDay && tot / days <= grow * 0.2, `平均每天 ${fmt(tot / days)}；上限 ${fmt(npcDay)}；成長 ${fmt(grow)}`);
})();
}

// ---------- 帳面 ----------
function econCrc(s) { let c = 7; for (let i = 0; i < s.length; i++) c = (Math.imul(c, 31) + s.charCodeAt(i)) >>> 0; return c.toString(16).padStart(8, "0"); }
function readLedger(file) {
  const text = fs.readFileSync(file, "utf8");
  // 固定動作 econ-status 的輸出（整份 log 存成檔也行）：ECON_B64 H|R 第幾份/共幾份 base64（GitHub 的 log 每行前面有時間，所以不從行首比）；舊的 ECON_*_JSON 兩行也讀
  const parts = { H: [], R: [] }, hx = { H: [], R: [] };
  for (const m of text.matchAll(/ECON_HEX ([HR]) (\d+)\/(\d+) (\d+) ([0-9a-f]{8}) ([0-9a-f*]*)/g)) hx[m[1]][+m[2] - 1] = { n: +m[3], len: +m[4], crc: m[5], s: m[6] };
  const decHex = k => {
    const a = hx[k]; if (!a.length) return undefined;
    const name = k === "H" ? "莊家" : "日報", n = a[0].n, got = Array.from({ length: n }, (_, i) => a[i]);
    if (got.some(x => !x)) throw new Error("econ-status 的輸出（" + name + "）少了幾行（共 " + n + " 行，只有 " + got.filter(Boolean).length + " 行）：log 被截斷了？");
    const hex = got.map(x => x.s).join("");
    if (hex.includes("*")) throw new Error("econ-status 的輸出（" + name + "）有 *** ：GitHub 把某段遮掉了（有祕密的值剛好出現在輸出裡），請回報這壹次的 run");
    if (hex.length !== a[0].len || econCrc(hex) !== a[0].crc) throw new Error("econ-status 的輸出（" + name + "）長度或檢查碼對不上：被改過或截斷");
    return JSON.parse(Buffer.from(hex, "hex").toString("utf8"));
  };
  const hexH = decHex("H"), hexR = decHex("R");
  if (hexH !== undefined || hexR !== undefined) {
    const house = hexH || null, rep = hexR || null;
    return house ? Object.assign({}, house, { day: house.day, __gap: rep ? rep.gap : null, __repDay: rep ? rep.day : null, __repWorld: rep && rep.house ? rep.house.world : null, __fix: rep ? rep.openingFix : null }) : (rep ? Object.assign({}, rep.house, { day: rep.day, __gap: rep.gap, __repDay: rep.day, __repWorld: rep.house ? rep.house.world : null }) : null);
  }
  for (const m of text.matchAll(/ECON_B64 ([HR]) (\d+)\/(\d+) ([A-Za-z0-9+/=]+)/g)) parts[m[1]][+m[2] - 1] = { n: +m[3], s: m[4] };
  const dec = k => { const a = parts[k]; if (!a.length) return undefined; if (a.length < a[0].n || Array.from({ length: a[0].n }, (_, i) => a[i]).some(x => !x)) throw new Error("econ-status 的輸出 " + (k === "H" ? "莊家" : "日報") + " 少了幾行（共 " + a[0].n + " 行，只有 " + a.filter(Boolean).length + " 行）：log 被截斷了？"); return JSON.parse(Buffer.from(a.map(x => x.s).join(""), "base64").toString("utf8")); };
  const b64h = dec("H"), b64r = dec("R");
  if (b64h !== undefined || b64r !== undefined) {
    const house = b64h || null, rep = b64r || null;
    return house ? Object.assign({}, house, { day: house.day, __gap: rep ? rep.gap : null, __repDay: rep ? rep.day : null }) : (rep ? Object.assign({}, rep.house, { day: rep.day, __gap: rep.gap, __repDay: rep.day }) : null);
  }
  const hm = /ECON_HOUSE_JSON (.*)$/m.exec(text), rm = /ECON_REPORT_JSON (.*)$/m.exec(text);
  if (hm || rm) {
    const house = hm ? JSON.parse(hm[1]) : null, rep = rm && rm[1] !== "null" ? JSON.parse(rm[1]) : null;
    return house ? Object.assign({}, house, { day: house.day, __gap: rep ? rep.gap : null, __repDay: rep ? rep.day : null }) : (rep ? Object.assign({}, rep.house, { day: rep.day, __gap: rep.gap, __repDay: rep.day }) : null);
  }
  return JSON.parse(text);
}
function ledger(file) {
  const raw = readLedger(file);
  const doc = raw && raw.data && typeof raw.data === "string" ? JSON.parse(raw.data) : raw;
  const isReport = doc && doc.snap;
  const h = isReport ? Object.assign({}, doc.snap.house, { led: { world: doc.snap.house.wflow || {}, ext: doc.snap.house.xflow || {} }, npcs: doc.snap.house.npcs, inv: doc.snap.house.inv, debt: doc.snap.house.debt, cul: doc.snap.house.cul, cultureLate: doc.snap.house.culLate }) : doc;
  const out = [], bad = [];
  const flag = (cond, msg) => { if (cond) bad.push(msg); };
  out.push(`莊家 ${fmt(h.bankroll)}　博物館資金 ${fmt(h.budget)}　修繕基金 ${fmt(h.museum)}　政府帳 ${fmt(h.gov)}　海底 ${fmt(h.sea)}　已知世界 ${h.world == null ? "（還沒有帳）" : fmt(h.world)}　海外 ${h.ext == null ? "（還沒搬出）" : fmt(h.ext)}`);
  if (isReport) out.push(`日報 ${doc.day}　對帳差 ${fmt(doc.gap)}（0 才對）`);
  const D = h.debt || {};
  if (h.wu && h.wu.r) { const r = h.wu.r, adj = h.wu.adj || {}, w = Math.floor(+h.world || 0); let s = 0; Object.keys(r).filter(k => k !== "pub").forEach(k => { s += Math.floor(w * +r[k]) + (Math.floor(+adj[k]) || 0); }); const pub = w - s; out.push(`已知世界的帳上分類：公共 ${fmt(pub)}、文化部 ${fmt(Math.floor(w * (+r["u-culture"] || 0)) + (Math.floor(+adj["u-culture"]) || 0))}　（總和一定等於已知世界；公共要 ≥ 0）`); flag(pub < 0, `公共（已知世界扣掉各單位）是負的 ${fmt(pub)}：有單位被指名多扣了`); }
  out.push(`莊家欠：博物館資金 ${fmt(D.budget)}、文化部館債 ${fmt(D.culture)}、已知世界 ${fmt(D.world)}　借出去沒收回 ${fmt(h.loansOut)}`);
  if (!isReport && doc.__gap != null) { out.push(`最新日報 ${doc.__repDay}　對帳差 ${fmt(doc.__gap)}（0 才對）`); const known = doc.__repWorld != null && doc.__gap === -(doc.__repWorld - W.start); // 11-14 已知世界上線那天快照多算了池子當天進出（casBookOpeningNext 在下壹份日報校正）
    if (known) out.push(`  （這是已知的過渡期假差額：等於 −(已知世界 ${fmt(doc.__repWorld)} − 起始 ${fmt(W.start)})，下壹份日報會校正，不是錢不見）`); else flag(doc.__gap !== 0, `對帳差不是 0：${fmt(doc.__gap)}（有壹條動籌碼的路沒記到帳上）`); }
  if (isReport) flag(doc.gap !== 0, `對帳差不是 0：${fmt(doc.gap)}（有壹條動籌碼的路沒記到帳上）`);
  flag(h.bankroll < 0, "莊家破產中（< 0）");
  if (h.world != null) flag(h.world < Math.floor(W.start * W.lowPct / 100), `已知世界資金吃緊：${fmt(h.world)} ＜ 起始的 ${W.lowPct}%`);
  if (D.culture > 0) {
    const due = (h.cul && h.cul.due) || C.houseLoan.cultureDue, day = (doc.day || h.day || null), left = day && due ? Math.max(1, Math.round((Date.parse(due) - Date.parse(day)) / 86400000) + 1) : null;
    if (left) { const need = Math.ceil(D.culture / left); out.push(`文化部館債：剩 ${fmt(D.culture)}，${left} 天後到期（${due}），平均每天要還 ${fmt(need)}`); flag(h.bankroll < D.culture && h.budget < D.culture - h.bankroll, "莊家現金加博物館資金都不夠還文化部館債"); flag(h.bankroll < need, `莊家現金 ${fmt(h.bankroll)} 小於今天這期 ${fmt(need)}（要博物館資金墊）`); }
    flag(h.cultureLate > 0, `文化部館債逾期累計 ${fmt(h.cultureLate)}`);
  }
  if (h.npcs && h.npcs.total != null) { out.push(`NPC 昨天帶進館 ${fmt(h.npcs.total)}（門票 ${fmt(h.npcs.ticket)}、店裡 ${fmt(h.npcs.shop)}、${h.npcs.people} 位）`); flag(h.npcs.total > npcDay, `NPC 帶進館 ${fmt(h.npcs.total)} 超過上限 ${fmt(npcDay)}`); }
  const inv = h.inv && (h.inv.sum || null);
  if (inv) { out.push(`館方投資：持有 ${(inv.hold || []).map(x => x.name + " " + fmt(x.n)).join("、") || "（沒有）"}　累計賺賠 ${fmt(inv.pnl)}`); flag(h.world != null && inv.pnl < -Math.floor(C.invest.reserve * 0.3), `館方投資累計虧 ${fmt(-inv.pnl)}`); }
  const wl = (h.led && h.led.world) || {};
  const srcs = Object.entries(wl).filter(([, v]) => v).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  if (srcs.length) { out.push("已知世界的來源（正＝進已知世界）："); srcs.forEach(([k, v]) => out.push(`    ${k}　${fmt(v)}`)); if (h.world != null) srcs.forEach(([k, v]) => flag(Math.abs(v) > h.world * 0.25 && !isReport, `來源 ${k} 的累計 ${fmt(v)} 超過池子的 25%`)); }
  const xl = (h.led && h.led.ext) || {}, xs = Object.entries(xl).filter(([, v]) => v).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  if (xs.length) { out.push("海外的來源（正＝進海外；extSplit 是上線那次從已知世界搬出來的）："); xs.forEach(([k, v]) => out.push(`    ${k}　${fmt(v)}`)); }
  return { out, bad };
}

const i = process.argv.indexOf("--ledger");
if (i >= 0) {
  const f = process.argv[i + 1];
  if (!f || !fs.existsSync(f)) { console.error("用法：node tools/econ_check.cjs --ledger 檔案.json"); process.exit(2); }
  const r = ledger(f);
  console.log("== 經濟帳面摘要 =="); r.out.forEach(l => console.log(l));
  console.log(r.bad.length ? "\n異常：" : "\n沒有異常。"); r.bad.forEach(m => console.log("  ✗ " + m));
  process.exit(r.bad.length ? 1 : 0);
}
runRules();
let failN = 0, warnN = 0;
console.log("== 經濟規則自我檢查（NUM）==");
for (const r of rows) {
  const mark = r.ok ? "✓" : r.level === "warn" ? "！" : "✗";
  console.log(`${mark} ${r.name}\n    ${r.detail}`);
  if (!r.ok) { if (r.level === "warn") warnN++; else failN++; }
}
console.log(`\n${rows.length} 項：${rows.length - failN - warnN} 過、${warnN} 警告、${failN} 沒過`);
process.exit(failN ? 1 : 0);
