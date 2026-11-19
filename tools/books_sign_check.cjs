// 帳的正負號對帳（11-16，翊文：「還有什麼正負號弄有問題，有腳本嗎」）：node tools/books_sign_check.cjs（npm run books:sign；npm test 也會跑）
// 為什麼要有：銀行財報「館內經濟」、日報的各個帳，錢的方向有三種角度——
//   莊家（diff.flow、diff.houseMint）：進莊家是正；已知世界（diff.wflow）：進已知世界是正，所以付出去是負的；博物館資金、修繕基金：進這個池子是正。
//   顯示的人拿錯角度、少反壹次號，玩家就看到「博物館資金付門票給 NPC」。這支把壹整天會動到每種帳的事都做壹遍，對壹次帳：
//   (a) 對帳：每個帳列出來的全部來源加起來 ＝ 這個帳昨天的變化（莊家、已知世界、修繕基金一定對；博物館資金有幾項還沒記帳，只印差多少）
//   (b) 符號表：每個來源在每個帳應該是進來（＋）還是出去（－），照表；表裡沒有的來源（新加的）也會被擋
//   (c) 同壹筆錢在兩個帳的正負要相反（例如莊家還文化部借款：莊家 －、已知世界 ＋）
//   (d) 名字：列出來的每壹項都要有中文名字（不能露出 npcCrowdBudget 這種代號）；日報文字（casReportView）的進出、往來也照同壹套檢查
//   (e) 掃 shared/ 所有記帳的呼叫，每個來源代號都要在符號表裡、都要有名字
// 對不上就印出哪個帳、哪個來源、預期和實際，結束碼 1。
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const { load } = require(path.join(ROOT, "test", "load_shared.cjs"));

// 符號表：來源 → 在這個帳應該是 ＋ 還是 －（0＝兩個方向都可能，例如賭桌輸贏）。k 是帳上的來源代號。
const SIGN = {
  bankroll: { bondMove: -1, hdepIn: -1, hdepOut: 1, hdepInt: 1, gbSweepH: 1, cultureRepay: -1, worldRepay: -1, grant: 1, worldLoan: 1, budgetLoan: 1, budgetFix: 1, budgetRepay: -1, houseInvestBuy: -1, houseInvestSell: 1, houseInvFix: 1, investFee: -1, reset: 1,
    npcFood: 1, npcBj: 0, npcArtBuy: 1, pack: -1, job: -1, find: -1, loan: -1, loanBack: 1, food: 1, econWin: 1, econLoot: -1, econSea: -1, bankInt: -1,
    bj: 0, art: 0, artAuction: 0, bond: 0, stockIn: 0, stockLev: 0, gLev: 0, tax: -1, inMarket: 0, gStock: 0, gRaise: -1, gBuy: 1 },
  budget: { gbSweepB: 1, ticketBudget: 1, npcTicketBudget: 1, npcCrowdBudget: 1, npcJob: 1, npcCellar: 1, npcCraft: 1, npcArt: 1, budgetInvestBuy: -1, budgetInvestSell: 1, budgetInvFix: 1, investFee: 1, budgetLoan: -1, budgetFix: -1, budgetRepay: 1, econWin: -1, stockFee: 1, artFee: 1, groupIntDep: -1, groupIntLoan: 1, groupBankLoan: -1, groupBankRepay: 1, groupBankInt: 1 },
  gov: { stockTax: 1, bizTax: 1, entTax: 1, divTax: 1 },
  gb: { pLoan: -1, pLoanBack: 1, pBankInt: -1, pBond: 0, bondMove: 1, hdepIn: 1, hdepOut: -1, hdepInt: -1, gbSweepH: -1, gbSweepB: -1, groupDeposit: 1, groupWithdraw: -1, groupLoan: -1, groupRepay: 1, groupBankLoan: 1, groupBankRepay: -1, groupBankInt: -1 }, // 佩佩銀行準備金（決定 0127）：進準備金是正
  museum: { ticketMuseum: 1, npcTicketMuseum: 1, npcCrowdMuseum: 1 },
  ext: { stockBuy: 1, stockSell: -1, stockRebase: -1, stockLevWin: -1, stockLevLoss: 1, dividend: -1, houseInvestBuy: 1, houseInvestSell: -1, houseInvFix: -1, budgetInvestBuy: 1, budgetInvestSell: -1, budgetInvFix: -1 }, // 海外（決定 0126）：進海外是正
  world: { groupDeposit: -1, groupWithdraw: 1, groupLoan: 1, groupRepay: -1, groupIntDep: 1, groupIntLoan: -1, worldLoan: -1, worldRepay: 1, grant: -1, cultureRepay: 1, cultureStart: -1,
    npcFood: -1, npcBj: 0, npcJob: -1, npcCellar: -1, npcCraft: -1, npcArt: -1, npcArtBuy: -1, npcTicketBudget: -1, npcTicketMuseum: -1, npcCrowdBudget: -1, npcCrowdMuseum: -1,
    worldGrow: 1, worldExpand: 1, bizTax: -1, entTax: -1, inMarket: 0, gRaise: 1, gBuy: -1, gDiv: -1 },
};
const ACCT_NAME = { bankroll: "莊家", budget: "博物館資金", museum: "修繕基金", gov: "政府帳", world: "已知世界", ext: "海外", gb: "佩佩銀行準備金" };
// 同壹筆錢在兩個帳（已知世界 ↔ 莊家／博物館資金／修繕基金）：這些來源在兩邊的數字要剛好相反。npcArt 的已知世界那邊還包著賣家的錢包，不比
const PAIRED = { bankroll: ["bondMove", "hdepIn", "hdepOut", "hdepInt", "gbSweepH", "gRaise", "gBuy", "inMarket", "cultureRepay", "worldRepay", "grant", "worldLoan", "houseInvestBuy", "houseInvestSell", "houseInvFix", "npcFood", "npcBj", "npcArtBuy"], budget: ["gbSweepB", "npcTicketBudget", "npcCrowdBudget", "npcJob", "npcCellar", "npcCraft", "budgetInvestBuy", "budgetInvestSell", "budgetInvFix", "groupIntDep", "groupIntLoan", "groupBankLoan", "groupBankRepay", "groupBankInt"], museum: ["npcTicketMuseum", "npcCrowdMuseum"], gov: ["bizTax", "entTax"], gb: ["groupDeposit", "groupWithdraw", "groupLoan", "groupRepay"] };

function scanKeys() { // 掃 shared/ 的記帳呼叫，拿到每個來源代號
  const A = /\b(casHouseMove|casHouseWorldIn|casHouseWorldOut|casHouseMint|casHouseBurn|casMint|casBurn)\(\s*[\w.]+\s*,\s*"(\w+)"/g;
  const B = /\b(casWorldIn|casWorldOut|casWorldFund|casPoolMint|casPoolGain|casPoolWorldIn|casPoolWorldOut)\(\s*[\w.\[\]]+\s*,\s*(?:[\w.\[\]]+|"(?:budget|museum|gov)")\s*,\s*"(\w+)"/g;
  const out = {}, put = (k, kind) => (out[k] = out[k] || new Set()).add(kind);
  for (const f of fs.readdirSync(path.join(ROOT, "shared")).filter(x => x.endsWith(".js") && x !== "casino_book.js")) {
    const src = fs.readFileSync(path.join(ROOT, "shared", f), "utf8");
    for (const m of src.matchAll(A)) put(m[2], m[1]);
    for (const m of src.matchAll(B)) put(m[2], m[1]);
    for (const m of src.matchAll(/const SHOP = \{([^}]*)\}/g)) for (const x of m[1].matchAll(/\["(?:house|budget|museum)", "(\w+)"\]/g)) put(x[1], "SHOP");
    for (const m of src.matchAll(/\bpay\("(\w+)"/g)) put(m[1], "pay");
  }
  return out;
}

function run() {
  const G = load(); G.NUM.casino.bankSplit.on = true; // 決定 0130：佩佩銀行跟賭場分開（借款、館債、存款利息、莊家水位上繳、盈餘分配都走 gb）
  const probs = [], info = [], seen = {}, P = (where, msg) => probs.push(`${where}：${msg}`);
  const sgn = n => (n > 0 ? "＋" : n < 0 ? "－" : "0") + Math.abs(n).toLocaleString("en-US");
  const LIST = fs.readdirSync(path.join(ROOT, "content", "npc")).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(path.join(ROOT, "content", "npc", f), "utf8")));
  G.setRng(G.mulberry32(11));
  const C = G.NUM.casino, W = C.world, D0 = "2026-11-16", addD = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  const h = G.casHouseFix(G.casHouseNew(), D0).house; h.grants = {}; const w = G.casWalletFix(G.casWalletNew(), D0);
  w.chips = 1e9; h.budget = 5e9;
  let prev = G.casBookSnap([w], h, 0, D0);
  const days = [];
  for (let k = 1; k <= 4; k++) {
    const day = addD(D0, k);
    if (k === 2) G.casHouseMove(h, "bj", -3000000 - h.bankroll); // 破產，博物館資金有錢：先跟博物館資金借 // 破產：換日跟博物館資金借、跟已知世界貸款
    if (k === 4) { G.casHouseMove(h, "bj", -3000000 - h.bankroll); h.budget = 1000; } // 破產，博物館資金也沒錢：跟已知世界貸款
    if (k === 3) { G.casHouseMove(h, "bj", 4e11 - h.bankroll); h.budget = 5e9; h.debt.budget = Math.max(h.debt.budget, 1000000); h.debt.world = Math.max(h.debt.world, 1000000); } // 賺很多：換日還博物館資金、文化部、已知世界
    G.casHouseFix(h, day); // 換日：已知世界成長、撥款、還款、借款（真的規則）
    G.casNpcSpend(h, day, "s" + k, LIST, null); // NPC 和散客的門票、逛店（真的規則）
    G.casStockHouseFix(h); G.casStockRoll(h, day, {}); G.casInvestRun(h, G.casStockHouseFix(h), day, "s", 0); // 館方投資（真的規則）
    // 其餘的來源：用記帳的零件照真的來源名字各動壹次（錢的對面跟真的程式壹樣：博物館資金、海底、錢包）
    G.casWorldIn(w, h, "stockBuy", 5000); G.casWorldOut(w, h, "stockRebase", 10, W); G.casWorldOut(w, h, "stockSell", 3000, W); G.casWorldIn(w, h, "stockLevLoss", 700); G.casWorldOut(w, h, "stockLevWin", 400, W);
    G.casHouseWorldIn(h, "houseInvestBuy", 2000); G.casHouseMove(h, "investFee", -20); h.budget += 20; G.casHouseWorldOut(h, "houseInvestSell", 1500, W);
    G.casPoolWorldIn(h, "budget", "budgetInvestBuy", 900); G.casPoolWorldOut(h, "budget", "budgetInvestSell", 600);
    G.casHouseWorldOut(h, "npcArtBuy", 800, W); G.casPoolWorldOut(h, "budget", "npcArt", 40);
    G.casHouseMove(h, "bj", 3000); G.casHouseMove(h, "bj", -1000); w.chips -= 2000; G.casHouseMove(h, "food", 500); w.chips -= 500; G.casHouseMove(h, "pack", -700); w.chips += 700; G.casHouseMove(h, "job", -300); w.chips += 300;
    G.casHouseMove(h, "find", -200); w.chips += 200; G.casHouseMove(h, "loan", -400); w.chips += 400; G.casHouseMove(h, "loanBack", 450); w.chips -= 450; G.casHouseMove(h, "bankInt", -50); w.chips += 50;
    G.casHouseMove(h, "econWin", 1200); h.budget -= 1200; G.casHouseMove(h, "econLoot", -250); w.chips += 250; G.casHouseMove(h, "econSea", -150); h.sea += 150;
    w.chips -= 65; G.casPoolGain(h, "budget", "stockFee", 30); G.casPoolGain(h, "budget", "artFee", 10); G.casPoolGain(h, "gov", "stockTax", 20); G.casPoolGain(h, "gov", "divTax", 5); G.casWorldOut(w, h, "dividend", 50, W); G.casHouseWorldOut(h, "inMarket", 300, W); G.casHouseWorldIn(h, "inMarket", 100); // 手續費、拍賣手續費進博物館資金，資本利得稅進政府帳（決定 0110）
    { const rb = G.casBorrow(w, 5000, day, false, 1e12 + k * 3600000, h); if (rb.ok) { w.chips += rb.loan.owe; G.casRepay(w, rb.loan.id, day, false, 1e12 + k * 3600000 + 7200000, h); } G.casBankPut(w, 2000); G.casBankAccrue(w, h, addD(day, 2)); h.gb.inc += 50000; } // 新借款、還款、存款利息（走 gb）
    G.casPoolMint(h, "budget", "ticketBudget", 100); G.casPoolMint(h, "museum", "ticketMuseum", 300); G.casHouseMint(h, "reset", 123);
    const s = G.casBookSnap([w], h, 0, day), diff = G.casBookDiff(prev, s); prev = s;
    days.push({ day, doc: { day, at: Date.parse(day + "T05:00:00+08:00"), snap: s, diff } });
  }
  for (const { day, doc } of days) {
    const d = doc.diff, v = G.casBooksView(doc, true), tag = a => `${day} ${ACCT_NAME[a] || a}`;
    // 金流頁籤（casFlowEdges）：每個來源都要歸到一條線
    for (const k of G.casFlowEdges(v.all).lost) P(tag("金流"), `來源 ${k} 沒歸到金流的線（shared/casino_report.js 的 CAS_FLOW_LINE）`);
    // (a) 對帳
    for (const a of ["bankroll", "world", "museum", "gov"]) {
      const sum = v.all[a].reduce((x, y) => x + y.n, 0), real = v.d[a];
      if (Math.abs(sum - real) > v.all[a].length) P(tag(a), `列出來的來源加起來 ${sgn(sum)}，帳上這天變化 ${sgn(real)}（差 ${sgn(real - sum)}）。來源：${v.all[a].map(x => x.k + " " + sgn(x.n)).join("、")}`);
    }
    info.push(`${day} 博物館資金昨天變化 ${sgn(v.d.budget)}，列出來的來源合計 ${sgn(v.all.budget.reduce((x, y) => x + y.n, 0))}（博物館資金還有幾項沒進帳上：參觀者分紅池撥款、債券救助；腳本自己改過博物館資金餘額的那天也不準，只印出來看）`);
    for (const a of ["bankroll", "budget", "museum", "gov", "world", "ext", "gb"]) for (const x of v.all[a]) {
      seen[a + "." + x.k] = 1;
      // (b) 符號表
      const exp = SIGN[a][x.k];
      if (exp === undefined) P(tag(a), `來源 ${x.k}（${x.label}）不在符號表裡，不知道該是進還是出（實際 ${sgn(x.n)}）。新來源要加到 tools/books_sign_check.cjs 的 SIGN`);
      else if (exp && Math.sign(x.n) !== exp) P(tag(a), `「${x.label}」（${x.k}）應該是${exp > 0 ? "進來（＋）" : "出去（－）"}，實際 ${sgn(x.n)}`);
      // (d) 名字
      if (x.label === x.k || /^[A-Za-z0-9_]+$/.test(x.label)) P(tag(a), `來源 ${x.k} 沒有中文名字，玩家會看到「${x.label}」`);
    }
    // 莊家那塊不能有博物館資金、修繕基金的搬動
    for (const x of v.all.bankroll) if (G.CAS_BOOK_POOL[x.k]) P(tag("bankroll"), `「${x.label}」是博物館資金／修繕基金的錢，不該列在莊家`);
    // (c) 同壹筆錢兩邊相反
    for (const a of Object.keys(PAIRED)) for (const k of PAIRED[a]) {
      const x = v.all[a].find(y => y.k === k), y = ["ext", "world", "gb"].filter(o => o !== a).flatMap(o => v.all[o]).find(z => z.k === k);
      if (!x && !y) continue;
      if (!x || !y || x.n !== -y.n) P(`${day} ${ACCT_NAME[a]}↔已知世界／海外`, `同壹筆「${k}」兩邊要剛好相反：${ACCT_NAME[a]} ${x ? sgn(x.n) : "沒列"}、對面 ${y ? sgn(y.n) : "沒列"}`);
    }
    // 已知世界的池子對得上：每天成長＋各來源
    if (d.world !== (d.wflow ? Object.values(d.wflow).reduce((a, b) => a + b, 0) : 0) + ((d.houseMint || {}).worldGrow || 0) + ((d.houseMint || {}).worldExpand || 0)) P(tag("world"), `已知世界變化 ${sgn(d.world)} ≠ wflow 加成長`);
    // 佩佩銀行準備金的帳對得上（決定 0127）
    if (d.gb !== (d.gflow ? Object.values(d.gflow).reduce((a, b) => a + b, 0) : 0)) P(tag("gb"), `準備金變化 ${sgn(d.gb)} ≠ gflow 加起來`);
    // 海外的帳對得上（決定 0126）：變化 ＝ 各來源加起來（搬出那筆 extSplit 一起算）
    if (d.ext !== (d.xflow ? Object.values(d.xflow).reduce((a, b) => a + b, 0) : 0)) P(tag("ext"), `海外變化 ${sgn(d.ext)} ≠ xflow 加起來`);
    // (d) 日報的文字
    const rv = G.casReportView(doc);
    if (!rv) { P(day, "casReportView 沒回東西"); continue; }
    const sec = t => (rv.secs.find(x => x.t === t) || { lines: [] }).lines;
    const hl = sec("莊家"), flowAt = hl.indexOf("進出：");
    const flowLines = flowAt < 0 ? [] : hl.slice(flowAt + 1, flowAt + 1 + 40).filter(l => /　[＋－]\d/.test(l));
    for (const l of flowLines) {
      const m = /^(.*)　([＋－])([\d,]+)$/.exec(l); if (!m) continue;
      const n = (m[2] === "＋" ? 1 : -1) * Number(m[3].replace(/,/g, "")), key = Object.keys(d.flow || {}).find(k => !G.CAS_BOOK_POOL[k] && G.casReportLabel(k) === m[1] && d.flow[k] === n);
      if (!key) P(`${day} 日報「莊家」的進出`, `「${l}」對不上帳上的莊家進出（可能是博物館資金的錢被當成莊家的，或名字、正負號錯）`);
      else if (/^[A-Za-z0-9_]+$/.test(m[1])) P(`${day} 日報「莊家」的進出`, `露出代號「${m[1]}」`);
    }
    for (const k of Object.keys(d.flow || {})) if (!G.CAS_BOOK_POOL[k] && d.flow[k] && !flowLines.some(l => l.startsWith(G.casReportLabel(k) + "　"))) P(`${day} 日報「莊家」的進出`, `來源 ${k} 沒出現在進出裡`);
    for (const k of Object.keys(G.CAS_BOOK_POOL)) if (d.flow && d.flow[k] && flowLines.some(l => l.startsWith(G.casReportLabel(k) + "　"))) P(`${day} 日報「莊家」的進出`, `博物館資金／修繕基金的 ${k} 被列進莊家的進出`);
    const wl = sec("跟已知世界的往來"), inAt = wl.indexOf("進已知世界："), outAt = wl.indexOf("從已知世界出來：");
    const into = inAt < 0 ? [] : wl.slice(inAt + 1, outAt < 0 ? wl.length : outAt), outp = outAt < 0 ? [] : wl.slice(outAt + 1);
    const wf = d.wflow || {};
    for (const [lines, sign, nm] of [[into, 1, "進已知世界"], [outp, -1, "從已知世界出來"]]) for (const l of lines) {
      const m = /^(.*)　([\d,]+)$/.exec(l); if (!m) continue;
      const n = Number(m[2].replace(/,/g, "")), k = Object.keys(wf).find(k => G.casReportLabel(k, "world") === m[1] && wf[k] === sign * n);
      if (!k) P(`${day} 日報「跟已知世界的往來」`, `「${nm}」裡的「${l}」對不上帳（方向放反了？）`);
    }
    for (const k of Object.keys(wf)) if (wf[k] && ![...into, ...outp].some(l => l.startsWith(G.casReportLabel(k, "world") + "　"))) P(`${day} 日報「跟已知世界的往來」`, `來源 ${k} 沒出現`);
    const head = t => { const m = /這段時間 ([＋－])([\d,]+)/.exec(sec(t)[0] || ""); return m ? (m[1] === "＋" ? 1 : -1) * Number(m[2].replace(/,/g, "")) : null; };
    for (const [t, val, nm] of [["莊家", d.bankroll, "莊家"], ["博物館資金（館方）", d.budget, "博物館資金"], ["修繕基金", d.museum, "修繕基金"], ["政府帳", d.gov, "政府帳"], ["跟已知世界的往來", d.world, "已知世界"]]) {
      const got = head(t); if (got !== null && got !== val) P(`${day} 日報「${t}」開頭`, `${nm}這段時間應該是 ${sgn(val)}，文字寫 ${sgn(got)}`);
    }
  }
  // 沒測到的來源（符號表有、這回沒動到）：只印
  const miss = []; for (const a of Object.keys(SIGN)) for (const k of Object.keys(SIGN[a])) if (!seen[a + "." + k]) miss.push(a + "." + k);
  if (miss.length) info.push("這回沒動到的來源（沒對到）：" + miss.join("、"));
  // (e) 掃程式
  const keys = scanKeys(), known = new Set(Object.values(SIGN).flatMap(o => Object.keys(o)));
  const mintKinds = new Set(["casMint", "casBurn", "casHouseMint", "casHouseBurn", "casPoolMint"]);
  for (const [k, kinds] of Object.entries(keys)) {
    const onlyMint = [...kinds].every(x => mintKinds.has(x));
    if (!onlyMint && !known.has(k)) P("掃程式", `來源 ${k}（${[...kinds].join("、")}）不在符號表裡，新加的來源要想好它在每個帳是進還是出，加到 tools/books_sign_check.cjs 的 SIGN`);
    if (!G.CAS_FLOW_LINE[k]) P("掃程式", `來源 ${k}（${[...kinds].join("、")}）沒歸到金流的線（shared/casino_report.js 的 CAS_FLOW_LINE）`);
    if (G.casReportLabel(k) === k) P("掃程式", `來源 ${k}（${[...kinds].join("、")}）沒有中文名字（shared/casino_report.js 的 CAS_REPORT）`);
  }
  return { probs, info };
}
module.exports = { run, SIGN };
if (require.main === module) {
  const { probs, info } = run();
  for (const l of info) console.log("  " + l);
  if (probs.length) { console.log(`\n正負號對帳：${probs.length} 項有問題`); probs.forEach(p => console.log(" ✗ " + p)); process.exit(1); }
  console.log("\n正負號對帳：全部對得上");
}
