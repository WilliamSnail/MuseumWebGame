// 經濟自我檢查（11-14，翊文：「經濟數值平衡的也寫一些腳本來自己做檢查」）
//   node tools/econ_check.cjs                      規則面：讀 NUM、跑小模擬，所有已知的套利條件和上限壹次驗；不安全就紅字、結束碼 1
//   node tools/econ_check.cjs --ledger 檔案.json   帳面：吃壹份 casinoHouse/main 的內容（或日報文件 casinoReport/日期 的 JSON），印壹頁摘要、標出異常
//   npm run econ:check                              ＝ 規則面
//   改經濟數字（shared/config.js 的 NUM.casino、NUM.auction 等）之前和之後都要跑；紅字不准合併（AGENTS.md 第 4 節）。
// 不碰網路、不碰正式資料。帳面的資料怎麼拿：翊文同意後跑固定動作 house-ledger／stock-status（只讀），或從 Firebase 管理畫面複製文件內容存成 JSON。
const fs = require("fs");
const { load } = require("../test/load_shared.cjs");

const G = load(), N = G.NUM, C = N.casino;
const rows = [];
const check = (name, ok, detail, level = "fail") => rows.push({ name, ok: !!ok, detail, level });
const pct = x => (Math.round(x * 1000) / 1000) + "%";
const fmt = n => Math.round(+n || 0).toLocaleString("en-US");

// ---------- 規則面 ----------
const round = 2 * C.stock.feePct + C.stock.holdPct; // 館外股票來回成本（%）：手續費 ×2 ＋ 持有成本
const S = C.stockIn, K = S.k * 100; // 跳空倍率（換成 % 的係數）
const margin = 0.8; // 期望報酬要小於來回成本的 80%（留餘裕）

check("館內股：預告活動預先進場的期望報酬 K×p×b ＜ 來回成本", K * S.festP * (S.festMin + S.festMax) / 2 < round * margin, `K×p×b ＝ ${pct(K * S.festP * (S.festMin + S.festMax) / 2)}；來回成本 ${pct(round)}（留 20% 餘裕）`);
check("館內股：劇情日（確定發生）最大跳空 K×b 上限 ＜ 來回成本", K * S.npcBoostMax < round, `K×${S.npcBoostMax} ＝ ${pct(K * S.npcBoostMax)}；來回成本 ${pct(round)}`);
check("館內股：突發大事件的期望 K×機率×b 遠小於成本", K * (S.npcBurstPct / 100) * S.npcBurstMax < round * 0.1, `${pct(K * (S.npcBurstPct / 100) * S.npcBurstMax)}`);
check("館內股：NPC 占壹家店人數的上限 ≤ 50%（不讓機器人決定股價）", S.npcShareMax <= 50, `${S.npcShareMax}%`);
check("館外股票：持有成本、手續費都 ＞ 0（抱著不賺長期漂移）", C.stock.holdPct > 0 && C.stock.feePct > 0, `手續費 ${C.stock.feePct}%、持有成本 ${C.stock.holdPct}%／天`);
if (!C.stock.direct) check("館外股票（舊模型）：開盤拉回每天上限 ＜ 來回成本", G.casStockPullMax() * 100 < round, `${pct(G.casStockPullMax() * 100)}`);
check("館外股票：真實價合理範圍 sane 夾得住（0.5～2 倍之內）", C.stock.sane && C.stock.sane[0] > 0 && C.stock.sane[1] < 3, JSON.stringify(C.stock.sane));
check("館外股票：超過幾分鐘沒新價暫停（staleMin）不超過槓桿的落後上限", C.stock.staleMin <= C.stockLev.maxLagMin, `staleMin ${C.stock.staleMin}、槓桿 ${C.stockLev.maxLagMin} 分鐘`);

// 利率順序：活存 < 定存 < 館債最低壹週 < 借款（都換成壹週）
const save7 = C.bank.savePct * 7, term7 = (C.bank.terms.find(t => t.days === 7) || C.bank.terms[C.bank.terms.length - 1]).pct, bondMin = Math.min(...C.bond.tiers.map(t => t.pct)), loan7 = C.loan.interestPct * 7 / C.loan.days;
check("利率順序：活存 ＜ 定存 ＜ 館債（最低壹週）＜ 借款", save7 < term7 && term7 <= bondMin && bondMin < loan7, `壹週：活存 ${pct(save7)}、定存 ${pct(term7)}、館債最低 ${pct(bondMin)}、借款 ${pct(loan7)}`);
check("文化部館債：利率（每天）＜ 外面世界貸款利率（每天）", C.houseLoan.cultureInterestPct < C.houseLoan.interestPct, `${C.houseLoan.cultureInterestPct}% ＜ ${C.houseLoan.interestPct}%`);

// 畫：賣回只拿現價的 sellPct%（短線必虧）
check("藝術市場：館方賣回只拿現價的壹部分（買了馬上賣必虧）", N.art.sellPct < 100, `sellPct ${N.art.sellPct}%`);
check("藝術市場拍賣：NPC 出價不超過現價、玩家自己的畫底價 ≥ 現價 80%", N.auction.floorPct >= 80 && N.auction.npcJoinPct <= 100, `floorPct ${N.auction.floorPct}%`);

// 槓桿：強平線在保證金內，壹天最大跳空（漲跌停）穿過強平線也不會賠超過保證金
const maxLev = Math.max(...Object.values(C.stockLev.maxLev)), band = Math.max(C.stock.tw.band, C.stock.us.band);
check("槓桿：強平線在保證金內（forcePct ＜ 100）", C.stockLev.forcePct > 0 && C.stockLev.forcePct < 100, `${C.stockLev.forcePct}%`);
check("槓桿：強平後再跳空壹天的漲跌停也不會賠光保證金（無壞帳）", (C.stockLev.forcePct / 100) * (100 / maxLev) + band <= 100 / maxLev + 1e-9, `${maxLev} 倍：強平 ${pct((C.stockLev.forcePct / 100) * (100 / maxLev))} ＋ 漲跌停 ${band}% ≤ ${pct(100 / maxLev)}`);
check("槓桿：全館壹天淨賺上限、部位上限有設", C.stockLev.profitCap > 0 && C.stockLev.posLimit > 0, `淨賺 ${fmt(C.stockLev.profitCap)}、部位 ${fmt(C.stockLev.posLimit)}`);

// 外面世界的池子和各種流量
const W = C.world, grow = W.growBase, npcDay = C.npcSpend.dayCap * (1 + C.npcSpend.extPct / 100), npcArt = N.auction.npcDay * (1 + N.auction.npcExtPct / 100);
check("外面世界：NPC 壹天花費上限（來館花錢＋買畫）≤ 池子每天成長（翊文 11-14 決定維持現在的數字：超過也只是上限，實際遠小於）", npcDay + npcArt <= grow || npcDay + npcArt <= grow * 1.2, `花錢 ${fmt(npcDay)} ＋ 買畫 ${fmt(npcArt)} ＝ ${fmt(npcDay + npcArt)}；每天成長 ${fmt(grow)}（容許到 1.2 倍；再大就紅字）`);
check("展廳門票：玩家分紅池比例 ≤ 票的預算池份額（分紅是從預算池搬給玩家，池子永遠不會超過預算池收到的）", C.ticket.ownerPct <= C.npcSpend.ticketBudgetPct && C.ticket.firstPct <= 100, `分紅池 ${C.ticket.ownerPct}% ≤ 預算池份額 ${C.npcSpend.ticketBudgetPct}%；先領的拿剩下的 ${C.ticket.firstPct}%`);
check("外面世界：吃緊線（lowPct）和賣出上限（lowPayPct）合理", W.lowPct > 0 && W.lowPct < 50 && W.lowPayPct > 0 && W.lowPayPct <= 5, `低於 ${W.lowPct}%；吃緊時壹天最多付 ${W.lowPayPct}%`);
check("外面世界：每年成長占起始 ≤ 30%（不是印錢機）", grow * 365 / W.start <= 0.3, `${pct(grow * 365 / W.start * 100)}`);
check("館方投資：持股成本上限 ≤ 超過部分的 50%；每天投 ≤ 10%", C.invest.holdCapPct <= 50 && C.invest.dailyPct <= 10, `holdCap ${C.invest.holdCapPct}%、daily ${C.invest.dailyPct}%`);
check("館方投資：保留金 ≥ 莊家借款的準備金（不動到重開的底）", C.invest.reserve >= C.houseLoan.reserve, `${fmt(C.invest.reserve)} ≥ ${fmt(C.houseLoan.reserve)}`);
check("借款額度上限 ≤ 莊家壹開始的錢（壹個人借光不會讓莊家破產）", C.loan.capMax <= C.houseStart, `capMax ${fmt(C.loan.capMax)}、莊家 ${fmt(C.houseStart)}`);
const grants = (C.grants || []).reduce((s, g) => s + g.amt, 0);
{ // 文化部館債分期：單靠現金撐得住嗎？撐不住的部分由預算池墊（墊到保留金為止），再不夠要靠莊家的收入
  const days = C.houseLoan.cultureDue ? Math.max(1, Math.round((Date.parse(C.houseLoan.cultureDue) - Date.parse("2026-11-13")) / 86400000)) : 1, owed = grants * Math.pow(1 + C.houseLoan.cultureInterestPct / 100, days / 2) , cash = C.houseStart + grants, padRoom = Math.max(0, C.budgetStart !== undefined ? C.budgetStart : C.econ.budgetStart) - C.invest.budgetKeep;
  const needIncome = Math.max(0, owed - C.houseStart - padRoom) / days;
  check("文化部館債：每天分期 ≤ 預算池起始的 20%（壹天墊得起）", !C.houseLoan.cultureDue || grants === 0 || owed / days <= C.econ.budgetStart * 0.2, `${days} 天，平均每天約 ${fmt(owed / days)}；預算池起始 ${fmt(C.econ.budgetStart)}`);
  check("文化部館債：現金加預算池可墊的部分（保留 " + fmt(C.invest.budgetKeep) + "）夠還；不夠的要靠莊家收入", needIncome === 0, `${days} 天；莊家現金 ${fmt(C.houseStart)}＋預算池可墊 ${fmt(padRoom)} 不夠時，莊家每天至少要賺 ${fmt(needIncome)}（最壞情況：館債全額、莊家沒有別的收入；實際看日報的莊家現金）`, "warn");
}

// 小模擬（固定種子，幾秒）：預告活動預先進場、NPC 來館花錢的總量
(function sims() {
  const add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  const pois = (r, l) => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; };
  let sum = 0; const M = 1500, D = "2026-11-12";
  for (let i = 1; i <= M; i++) {
    const h = G.casHouseFix(G.casHouseNew(), "2026-11-01").house, H = G.casInHouseFix(h);
    let s = (i * 2654435761) >>> 0; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let d = 12; d >= 1; d--) { H.use[add(D, -d)] = { food: pois(r, 10) }; H.npc[add(D, -d)] = { food: pois(r, 2) }; }
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
    check("散客門票：壹天上限 ≤ 外面世界每天成長的 10%", CR.dayCap <= grow * 0.1, `${fmt(CR.dayCap)} ≤ ${fmt(grow * 0.1)}`);
    check("模擬：展廳平均 ≥ 2 位、0 人的時間 < 20%（只算有名字的 NPC）", hs / n >= 2 && hz / n < 0.2, `平均 ${(hs / n).toFixed(2)} 位；0 人 ${pct(hz / n * 100)}`);
  }
  check("模擬：NPC 來館花錢的平均每天 ≤ 全館上限，且 ≤ 外面世界每天成長的 20%", tot / days <= npcDay && tot / days <= grow * 0.2, `平均每天 ${fmt(tot / days)}；上限 ${fmt(npcDay)}；成長 ${fmt(grow)}`);
})();

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
  const h = isReport ? Object.assign({}, doc.snap.house, { led: { world: doc.snap.house.wflow || {} }, npcs: doc.snap.house.npcs, inv: doc.snap.house.inv, debt: doc.snap.house.debt, cul: doc.snap.house.cul, cultureLate: doc.snap.house.culLate }) : doc;
  const out = [], bad = [];
  const flag = (cond, msg) => { if (cond) bad.push(msg); };
  out.push(`莊家 ${fmt(h.bankroll)}　預算池 ${fmt(h.budget)}　館方帳 ${fmt(h.museum)}　海底 ${fmt(h.sea)}　外面世界 ${h.world == null ? "（還沒有帳）" : fmt(h.world)}`);
  if (isReport) out.push(`日報 ${doc.day}　對帳差 ${fmt(doc.gap)}（0 才對）`);
  const D = h.debt || {};
  out.push(`莊家欠：預算池 ${fmt(D.budget)}、文化部館債 ${fmt(D.culture)}、外面世界 ${fmt(D.world)}　借出去沒收回 ${fmt(h.loansOut)}`);
  if (!isReport && doc.__gap != null) { out.push(`最新日報 ${doc.__repDay}　對帳差 ${fmt(doc.__gap)}（0 才對）`); const known = doc.__repWorld != null && doc.__gap === -(doc.__repWorld - W.start); // 11-14 外面世界上線那天快照多算了池子當天進出（casBookOpeningNext 在下壹份日報校正）
    if (known) out.push(`  （這是已知的過渡期假差額：等於 −(外面世界 ${fmt(doc.__repWorld)} − 起始 ${fmt(W.start)})，下壹份日報會校正，不是錢不見）`); else flag(doc.__gap !== 0, `對帳差不是 0：${fmt(doc.__gap)}（有壹條動籌碼的路沒記到帳上）`); }
  if (isReport) flag(doc.gap !== 0, `對帳差不是 0：${fmt(doc.gap)}（有壹條動籌碼的路沒記到帳上）`);
  flag(h.bankroll < 0, "莊家破產中（< 0）");
  if (h.world != null) flag(h.world < Math.floor(W.start * W.lowPct / 100), `外面世界資金吃緊：${fmt(h.world)} ＜ 起始的 ${W.lowPct}%`);
  if (D.culture > 0) {
    const due = C.houseLoan.cultureDue, day = (doc.day || h.day || null), left = day && due ? Math.max(1, Math.round((Date.parse(due) - Date.parse(day)) / 86400000) + 1) : null;
    if (left) { const need = Math.ceil(D.culture / left); out.push(`文化部館債：剩 ${fmt(D.culture)}，${left} 天後到期（${due}），平均每天要還 ${fmt(need)}`); flag(h.bankroll < D.culture && h.budget < D.culture - h.bankroll, "莊家現金加預算池都不夠還文化部館債"); flag(h.bankroll < need, `莊家現金 ${fmt(h.bankroll)} 小於今天這期 ${fmt(need)}（要預算池墊）`); }
    flag(h.cultureLate > 0, `文化部館債逾期累計 ${fmt(h.cultureLate)}`);
  }
  if (h.npcs && h.npcs.total != null) { out.push(`NPC 昨天帶進館 ${fmt(h.npcs.total)}（門票 ${fmt(h.npcs.ticket)}、店裡 ${fmt(h.npcs.shop)}、${h.npcs.people} 位）`); flag(h.npcs.total > npcDay, `NPC 帶進館 ${fmt(h.npcs.total)} 超過上限 ${fmt(npcDay)}`); }
  const inv = h.inv && (h.inv.sum || null);
  if (inv) { out.push(`館方投資：持有 ${(inv.hold || []).map(x => x.name + " " + fmt(x.n)).join("、") || "（沒有）"}　累計賺賠 ${fmt(inv.pnl)}`); flag(h.world != null && inv.pnl < -Math.floor(C.invest.reserve * 0.3), `館方投資累計虧 ${fmt(-inv.pnl)}`); }
  const wl = (h.led && h.led.world) || {};
  const srcs = Object.entries(wl).filter(([, v]) => v).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  if (srcs.length) { out.push("外面世界的來源（正＝進外面世界）："); srcs.forEach(([k, v]) => out.push(`    ${k}　${fmt(v)}`)); if (h.world != null) srcs.forEach(([k, v]) => flag(Math.abs(v) > h.world * 0.25 && !isReport, `來源 ${k} 的累計 ${fmt(v)} 超過池子的 25%`)); }
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
let failN = 0, warnN = 0;
console.log("== 經濟規則自我檢查（NUM）==");
for (const r of rows) {
  const mark = r.ok ? "✓" : r.level === "warn" ? "！" : "✗";
  console.log(`${mark} ${r.name}\n    ${r.detail}`);
  if (!r.ok) { if (r.level === "warn") warnN++; else failN++; }
}
console.log(`\n${rows.length} 項：${rows.length - failN - warnN} 過、${warnN} 警告、${failN} 沒過`);
process.exit(failN ? 1 : 0);
