// ================================================================
//  Yuga Bot 銀行廳（11-13，美術統籌；版面草稿在 Design 畫布「Yuga Bot 銀行廳：版面草稿」）
//  翊文 11-13：「銀行功能多了可以直接開成另一個新大廳，賭場裡面的簡單銀行功能少點沒關係」「用現有的延伸」。
//  壹個畫面看得完（docs/規劃/介面整合規劃.md 第六步，onescreen 骨架）：標題壹行｜頁籤（存款、借款、館債、股票、財報）｜主區：頁籤的內容｜右欄：我的帳戶、信用｜最下面：今日行情
//  資料：伺服器的 casino act "bankHall" 回 { bankHall }（格式：docs/規劃/經濟體系規劃.md 2.7；Yuga 主 session 定）。還沒接上的時候用示範資料（畫面上寫「示範資料」）。
//  動作：存款 act bank（op put／take／term／break）、借款 borrow、repay。還沒接上，按了只跳提示。
//  規則不寫在這裡：這個檔只畫畫面，數字都從 view 來。
// ================================================================
import { ADDONS, SCREENS, UI, btn, closeOnOutside, go, h, icon, miniLayer, navTo, note, rerender, setChips, snd, sndFile } from "../../core/ui_core.js";
import { NET } from "../../core/net_firebase.js";
import { bankSfx, keyBeep } from "../../fx/bank_sfx.js";
import { CAS_BOND } from "../../../../shared/casino/text.js";
import { roomHead } from "../../core/ui_room.js";
import { statBadge, statBands, statBar, statCounts, statLegend } from "../../core/ui_stat.js";
import { statView } from "../../../../shared/world/stat_view.js";
import { mountMood } from "../../fx/ui_mood.js";
import { NUM } from "../../../../shared/core/config.js";
import { addDays, mdShift, todayStr } from "../../../../shared/core/logic.js";
import { casNum, casPx } from "../../../../shared/casino/core.js";
import { casLevSizeOf } from "../../../../shared/casino/stock_lev.js";
import { flowPane } from "./bank_flow.js";
import { tradesPanel } from "./bank_trades.js"; import { amountBox, hasShares, setTradeMode, sharesText, tradeMode } from "./bank_amount.js"; // 零碎股照金額買賣（決定 0160）
import { CAS_FLOW_NODES, CAS_FLOW_ORGS } from "../../../../shared/casino/report.js";
import { actDone } from "../../panels/ui_story.js";

const fp = casPx; // 股價（小數兩位；決定 0108）
const fmt = n => (n == null ? "—" : Number(n).toLocaleString("en-US"));
const sign = n => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n));
// 頁籤的小圖示（自己畫的，24×24 的線稿，顏色跟字走）
const SVG = d => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const TAB_ICON = {
  save: SVG('<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>'), // 疊起來的錢幣
  loan: SVG('<path d="M4 8h13l-3-3M20 16H7l3 3"/><circle cx="12" cy="12" r="0.8"/>'), // 借出、還回的兩個箭頭
  bond: SVG('<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/>'), // 債券（壹張紙）
  stock: SVG('<path d="M3 20h18M5 16l4-5 4 3 6-8"/><path d="M15 6h4v4"/>'), // 往上的折線
  auction: SVG('<path d="M4 20h10M7 20v-3h4v3"/><path d="m5 11 6 6M8 6l6 6M13 4l5 5-3 3-5-5z"/><path d="M16 18h4"/>'), // 拍賣槌
  report: SVG('<path d="M5 4h13v16H5z"/><path d="M8 8h7M8 12h7M8 16h4"/><path d="M5 4v16"/>'), // 帳本
  flow: SVG('<circle cx="12" cy="12" r="2.2"/><circle cx="5" cy="6" r="1.6"/><circle cx="19" cy="6" r="1.6"/><circle cx="12" cy="20" r="1.6"/><path d="M6.4 7.2 10 10.6M17.6 7.2 14 10.6M12 14.2V18.2"/>'), // 中心往外的幾條線（金流 hub）
};
const TABS = [["report", "財報"], ["flow", "金流"], ["stock", "股票"], ["save", "存款"], ["loan", "借款"], ["bond", "館債"], ["auction", "拍賣"]]; // 拍賣不是這個廳的頁籤：按了直接進畫廊的「拍賣」頁籤（翊文 11-14） // 翊文 11-14：財報最左邊第一個，第二個是股票
const pctText = p => `${(p * 100).toFixed(p * 100 % 1 ? 1 : 0)}%`;

// ---------- 示範資料（伺服器還沒給 bankHall 的時候用；格式照 Yuga 說的 bankHall） ----------
// 示範用的盤中價（每分鐘壹個）：固定種子的小隨機漫步
function demoSeries(start, n, seed) { let x = start, a = seed * 9301 + 49297; const out = []; for (let i = 0; i < n; i++) { a = (a * 9301 + 49297) % 233280; x += (a / 233280 - 0.45) * 1.6; out.push(Math.round(x * 10) / 10); } return out; }
export function fakeBankHall() {
  const stocks = [
    { id: "food", name: "餐車", line: "館內店", market: "in", halted: false, intraday: demoSeries(98, 30, 3), intradayFrom: 0, price: 102, chg: 0.021, hist: [96, 98, 97, 99, 100, 100, 102], mine: 20, kind: "in" },
    { id: "casino", name: "Hamachi 賭場", line: "館內店", price: 98, chg: -0.008, hist: [101, 100, 99, 99, 100, 99, 98], mine: 0, kind: "in" },
    { id: "board", name: "委託櫃台", line: "館內店", price: 110, chg: 0.004, hist: [105, 107, 108, 108, 109, 110, 110], mine: 5, kind: "in" },
    { id: "cellar", name: "地下收藏庫", line: "館內店", market: "in", halted: false, quiet: true, jump: true, intraday: demoSeries(90, 28, 5), intradayFrom: 0, price: 87, chg: -0.032, hist: [94, 93, 92, 91, 90, 90, 87], mine: 0, kind: "in" },
    { id: "work", name: "手作坊", line: "館內店", price: 120, chg: 0.05, hist: [100, 104, 103, 108, 110, 114, 120], mine: 10, kind: "in" },
    { id: "neon", cat: "tech", name: "霓虹顯卡", line: "館外・世界版", fresh: true, market: "us", price: 231, chg: 0.017, hist: [220, 224, 226, 225, 227, 227, 231], mine: 0, kind: "out" },
    { id: "sand", cat: "tech", name: "紅砂晶片", stale: "這幾分鐘抓不到新的真實價，先暫停買賣，價停在最後壹個價；新的價回來就恢復。", line: "館外・世界版", price: 64, chg: -0.011, hist: [66, 66, 65, 65, 66, 65, 64], mine: 0, kind: "out" },
    { id: "night", cat: "index", name: "夜市指數", line: "館外・世界版", price: 540, chg: 0.003, hist: [535, 537, 538, 538, 539, 538, 540], mine: 0, kind: "out" },
    { id: "handbrain", cat: "tech", name: "掌心晶片鋪", line: "手機晶片", real: { sym: "2454", name: "聯發科", px: 1235, chg: 0.012 }, mult: 24, price: 1250, chg: 0.012, mine: 0, kind: "out", market: "tw", twState: "open", halted: false, intraday: demoSeries(1235, 135, 7), intradayFrom: 0, fresh: true },
    { id: "appleshop", cat: "tech", name: "銀蘋果工坊", line: "美股・手機", real: { sym: "AAPL", name: "蘋果", px: 189.52, chg: -0.003 }, mult: 32, price: 6065, chg: -0.003, mine: 0, kind: "out", market: "us", usState: "pre", halted: true, intraday: [], intradayFrom: 0 },
    { id: "cuprum", cat: "res", name: "銅礦公司", line: "館外・世界版", market: "us", price: 40, chg: -0.014, hist: [38, 39, 40], mine: 0, kind: "out", usState: "pre", halted: true, intraday: [], intradayFrom: 0 },
    { id: "oilco", cat: "res", name: "北海石油", line: "館外・世界版", market: "us", price: 57, chg: -0.007, hist: [55, 56, 57], mine: 0, kind: "out", usState: "pre", halted: true, intraday: [], intradayFrom: 0 },
    { id: "goldmine", cat: "res", name: "金脈礦業", line: "館外・世界版", market: "us", price: 74, chg: 0, hist: [72, 73, 74], mine: 0, kind: "out", usState: "pre", halted: true, intraday: [], intradayFrom: 0 },
    { id: "pharma", cat: "med", name: "白衣製藥", line: "館外・世界版", market: "us", price: 91, chg: 0.007, hist: [89, 90, 91], mine: 3, kind: "out", usState: "pre", halted: true, intraday: [], intradayFrom: 0 },
    { id: "gene", cat: "med", name: "基因工坊", line: "館外・世界版", market: "us", price: 108, chg: 0.014, hist: [106, 107, 108], mine: 0, kind: "out", usState: "pre", halted: true, intraday: [], intradayFrom: 0 },
    { id: "stream", cat: "fun", name: "星幕串流", line: "館外・世界版", market: "us", price: 125, chg: -0.014, hist: [123, 124, 125], mine: 0, kind: "out", usState: "pre", halted: true, intraday: [], intradayFrom: 0 },
    { id: "toy", cat: "fun", name: "玩具大王", line: "館外・世界版", market: "us", price: 142, chg: -0.007, hist: [140, 141, 142], mine: 0, kind: "out", usState: "pre", halted: true, intraday: [], intradayFrom: 0 },
    { id: "bankus", cat: "fin", name: "北岸銀行", line: "館外・世界版", market: "us", price: 159, chg: 0, hist: [157, 158, 159], mine: 0, kind: "out", usState: "pre", halted: true, intraday: [], intradayFrom: 0 },
    { id: "payco", cat: "fin", name: "轉帳通", line: "館外・世界版", market: "us", price: 176, chg: 0.007, hist: [174, 175, 176], mine: 0, kind: "out", usState: "pre", halted: true, intraday: [], intradayFrom: 0 },
    { id: "airco", cat: "travel", name: "雲端航空", line: "館外・世界版", market: "us", price: 193, chg: 0.014, hist: [191, 192, 193], mine: 0, kind: "out", usState: "pre", halted: true, intraday: [], intradayFrom: 0 },
    { id: "cruise", cat: "travel", name: "遠洋郵輪", line: "館外・世界版", market: "us", price: 210, chg: -0.014, hist: [208, 209, 210], mine: 0, kind: "out", usState: "pre", halted: true, intraday: [], intradayFrom: 0 },
    { id: "arms", cat: "def", name: "鐵盾重工", line: "館外・世界版", market: "us", price: 227, chg: -0.007, hist: [225, 226, 227], mine: 0, kind: "out", usState: "pre", halted: true, intraday: [], intradayFrom: 0 },
    { id: "spyx", cat: "index", name: "大盤指數基金", line: "館外・世界版", market: "us", price: 244, chg: 0, hist: [242, 243, 244], mine: 0, kind: "out", usState: "pre", halted: true, intraday: [], intradayFrom: 0 },
    { id: "linetower", cat: "travel", name: "島線電話行", line: "電信", price: 118, chg: 0, mine: 0, kind: "out", market: "tw", twState: "closed", halted: true, intraday: [], intradayFrom: 0 },
  ];
  stocks.forEach(x => { x.value = x.price * x.mine; x.tax = x.market === "us" ? 0 : 0.003; if (x.mine > 0) { x.avgCost = Math.round(x.price * 0.93 * 100) / 100; x.costTotal = Math.round(x.avgCost * x.mine); x.dayChg = Math.round(x.value * x.chg / (1 + x.chg)); x.dayPct = x.chg; x.pnl = x.value - x.costTotal; x.pnlPct = x.pnl / x.costTotal; } });
  const stockVal = stocks.reduce((n, s) => n + s.price * s.mine, 0) * 100;
  return {
    demo: true,
    cash: 8200000,
    save: { save: 12500000, earned: 12500, savePct: 0.001, perDay: 12500, min: 100000, termMin: 1000000, termCap: 20000000, termMax: 3, quick: [1000000, 5000000, 10000000],
      terms: [{ id: "t1", amt: 5000000, days: 7, pct: 0.03, due: "11-17", int: 150000, left: 4 }, { id: "t2", amt: 2000000, days: 3, pct: 0.01, due: "11-14", int: 20000, left: 1 }],
      kinds: [{ i: 0, days: 3, pct: 0.01 }, { i: 1, days: 7, pct: 0.03 }] },
    debt: { owed: 6000000, neg: 0, loans: 2, can: true },
    advisor: { need: true, debt: { neg: 0, loan: 6000000, total: 6000000 }, loans: [{ id: "l1", owe: 2200000, due: "2026-11-18", canExtend: true, why: "", fee: 110000, newDue: "2026-11-21" }, { id: "l2", owe: 3800000, due: "2026-11-16", canExtend: false, why: "這筆已經延過期了，每筆只能延壹次。", fee: 0, newDue: "2026-11-19" }],
      sells: [{ id: "work", name: "手作坊", kind: "in", own: 10, px: 120, value: 1194000, n: 10, covers: 1194000 }, { id: "food", name: "餐車", kind: "in", own: 20, px: 102, value: 2030000, n: 20, covers: 2030000 }], sellTotal: 3224000, enough: false },
    loan: { left: 8000000, limit: 10000000, pct: 0.1, days: 3, quick: [1000000, 2000000, 5000000], min: 500000, why: "",
      list: [{ id: "l1", amt: 2000000, owe: 2200000, day: "11-12", due: "11-15", today: false, from: "莊家" }] },
    bonds: { issue: { name: "B2 修繕債", line: "這週 B2 的白布要換新，莊家向館友借錢。", pct: 0.02, left: 21500000, cap: 30000000, mine: 1000000, due: "11-17" }, held: [{ id: "b1", amt: 1000000, int: 6000, due: "11-17" }], window: { from: "2026-11-14", until: "2026-11-15" }, state: "健康" },
    stocks: { list: stocks, cats: [{ id: "tech", name: "科技" }, { id: "res", name: "自然資源" }, { id: "med", name: "醫療生技" }, { id: "fun", name: "消費娛樂" }, { id: "fin", name: "金融" }, { id: "travel", name: "觀光運輸" }, { id: "def", name: "國防重工" }, { id: "index", name: "指數基金" }], taxPct: 0.003, fee: 0.005, halt: false, sellCap: 20000000, sellTip: "信用升到 2 級可以賣到 5,000 萬。", inCap: 1000, inSellLeft: 2000000, inExposeLeft: 8000000, inRule: "館內五家店的股價跟店的生意走，每天 05:00～23:30 每 15 分鐘動壹次。", usOpenAt: Date.now() + 3 * 3600000, us: { state: "pre", from: 570, len: 390 }, tw: { state: "open", from: 540, len: 270 }, inDay: { from: 300, len: 75, step: 15 }, haltFrom: 22, haltTo: 5, sellLeft: 2000000, feePaid: 18400,
      lev: { max: 5, byMarket: { in: 2, tw: 3, us: 0, grp: 3 }, owed: 120000, owedText: "今天賺的超過館方當天能賠的上限，還有 120,000 記成欠條，明天補發。", usWhy: "美股槓桿還沒開放（美股盤中時間跟台灣晚上對不上，風險太大）。", opensLeft: 2, opensMax: 3, fee: 0.005, interest: 0.0015, borrow: 0.003, force: 0.5, rule: "" }, credit: { pts: 17, level: 3, name: "穩當", maxLev: 3, next: 3, nextText: "再 3 點信用升到 4 級，就能開到 5×。", nextUnlock: { level: 4, lev: 5, pts: 20 }, why: "準時還款、定存到期都會加信用點，等級越高部位上限越大。", posLimit: 32000000, posUsed: 11000000 },
      positions: [{ id: "p1", no: 1, sid: "handbrain", cat: "tech", name: "掌心晶片鋪", market: "tw", side: "long", lev: 5, qty: 4000, n: 4000, margin: 1000000, entry: 1250, now: 1230, ratio: 0.82, liqPx: 1125, liq: 1125, maintPct: 82, pnl: -80000, openedDay: "2026-11-14", dayTrade: true, stop: null, take: null }, { id: "p2", no: 2, sid: "cellar", name: "地下收藏庫", market: "in", side: "short", lev: 2, qty: 12000, n: 12000, margin: 600000, entry: 87, now: 91, ratio: 0.64, liqPx: 108, liq: 108, maintPct: 64, pnl: -48000, openedDay: "2026-11-14", dayTrade: true, stop: null, take: null }],
      orders: [{ no: 1, kind: "buy", kindName: "限價買", id: "sand", cat: "tech", name: "紅砂晶片", n: 5000, px: 60, now: 64, day: "2026-11-14", exp: "2026-11-16", lock: 301500, lockShares: 0 }, { no: 2, kind: "stop", kindName: "停損賣", id: "food", name: "餐車", n: 20, px: 95, now: 102, day: "2026-11-14", exp: "2026-11-16", lock: 0, lockShares: 20 }], orderLeft: 8, orderMax: 10, orderPerStock: 3, orderDays: 3, cancelLeft: 20, lockChips: 301500,  margin: { owe: 1200000, ratio: 1.84, limit: 2000000, pct: 0.005 }, maker: [{ who: "莊家", does: "霓虹顯卡 20 萬股、夜市指數 5 萬股" }, { who: "老會計", does: "餐車、委託櫃台" }, { who: "小學徒", does: "手作坊（追漲）" }, { who: "守夜人", does: "紅砂晶片（逆勢）" }] },
    econ: { books: { day: "2026-11-15", bankroll: 1100000000, budget: 620000000, museum: 48000000, gov: 5200000, sea: 3200000, world: null, d: { bankroll: -12000000, budget: 8000000, museum: 1400000, sea: 300000, world: 0 }, top: { bankroll: [{ label: "21 點贏家拿走", n: -18000000 }, { label: "賭場下注收入", n: 6000000 }], budget: [{ label: "拚經濟撥款", n: -5000000 }, { label: "館方投資買進", n: -3000000 }, { label: "還館債", n: -2000000 }], museum: [{ label: "門票七成", n: 1800000 }], sea: [], world: [] } }, gdp: 3520000, growth: 0.032, idx: 0.68, news: "昨天的烤雞肉多賣了 300 份，餐車股今天小漲。博物館資金充裕，利息照發。", ext: { day: "2026-11-14", ticket: { hall: 18400, crowd: 31200 }, shop: { food: 52300, bj: 128000, craft: 9600, cellar: 0, job: 14400 }, shopCrowd: { food: 31200, bj: 0, craft: 4800, cellar: 0, job: 14400 }, total: 253900, people: { npc: 14, crowd: 86 }, menu: [{ id: "chicken", name: "烤雞肉", npc: 40, crowd: 120 }, { id: "tea", name: "麥茶", npc: 22, crowd: 60 }], orders: [{ who: "鞋店老闆", item: "tea", name: "麥茶", n: 1 }, { who: "小明", item: "chicken", name: "烤雞肉", n: 2 }] }, world: { day: "2026-11-14", states: { normal: 7, cut: 3, squeeze: 2, layoff: 1 }, bands: [1, 3, 7, 2], avgMult: 0.82, unrestBands: [6, 3, 2, 1], mood: { v: 72, band: "warm" }, events: [{ day: "2026-11-14", text: "島上科技集團減薪了" }, { day: "2026-11-12", text: "銀蘋果集團恢復正常" }] }, report: [["餐車", "賣出 412 份"], ["21 點", "共 380 手"], ["拚經濟", "成功 9 次"], ["門票", "收入 62,000"]],
},
    today: { day: "2026-11-16", ticket: { hall: 120000, crowd: 200000 }, shop: 85000, total: 405000, people: { npc: 14, crowd: 520 } },
    houseInv: { asOf: "2026-11-13", hold: [{ id: "chipshop", name: "掌心晶片鋪", n: 2000, cost: 2400000, value: 2500000, pnl: 100000, pnlPct: 0.0417 }, { id: "applework", name: "銀蘋果工坊", n: 300, cost: 3000000, value: 2850000, pnl: -150000, pnlPct: -0.05 }, { id: "nightidx", name: "夜市指數", n: 800, cost: 420000, value: 432000, pnl: 12000, pnlPct: 0.0286 }],
      cost: 5820000, value: 5782000, pnl: -38000, pnlPct: -0.0065, pnlTotal: 64000, spent: 800000, yesterday: [{ side: "buy", id: "chipshop", name: "掌心晶片鋪", n: 400, px: 1230 }, { side: "sell", id: "applework", name: "銀蘋果工坊", n: 50, px: 9980 }], paused: { budget: "world" } },
    world: { days: [{ day: "2026-11-13", items: [{ title: "晶片股走強", line: "手機晶片帶頭，電子股壹起收紅。", tone: "up", refs: [{ id: "handbrain", cat: "tech", name: "掌心晶片鋪" }] }, { title: "科技股回檔", line: "獲利了結，美股科技股收黑。", tone: "down", refs: [{ id: "appleshop", cat: "tech", name: "銀蘋果工坊" }] }, { title: "航運持平", line: "運價沒有大消息，盤整。", tone: "flat", refs: [] }] }, { day: "2026-11-12", items: [{ title: "電信小漲", line: "穩定型的股票受到青睞。", tone: "up", refs: [{ id: "linetower", cat: "travel", name: "島線電話行" }] }] }] },
    net: 8200000 + 12500000 + 7000000 + stockVal - 2200000 - 1200000,
    trade: { since: "2026-11-16", loans: [{ name: "民生集團", amt: 3600000, day: "2026-11-17" }], rows: [
      { k: "tradeGoods", label: "貨款（集團之間）", fromName: "島嶼集團", toName: "民生集團", n: 1500000 }, { k: "tradeGoods", label: "貨款（集團之間）", fromName: "民生集團", toName: "跨海集團", n: 660000 }, { k: "tradeGoods", label: "貨款（集團之間）", fromName: "跨海集團", toName: "學校集團", n: 700000 }, { k: "tradeGoods", label: "貨款（集團之間）", fromName: "跨海集團", toName: "島嶼集團", n: 220000 },
      { k: "tradeLoan", label: "金融集團放款", fromName: "金融集團", toName: "民生集團", n: 3600000 }, { k: "tradeLoan", label: "金融集團放款", fromName: "學校集團", toName: "金融集團", n: 180000 },
      { k: "tradeInterest", label: "借款利息", fromName: "民生集團", toName: "金融集團", n: 260000 }, { k: "tradeRepay", label: "還款", fromName: "民生集團", toName: "金融集團", n: 400000 },
      { k: "tradeRev", label: "旗下股票營收（公共和集團）", fromName: "公共", toName: "島嶼集團", n: 450000 }, { k: "tradeRev", label: "旗下股票營收（公共和集團）", fromName: "家計", toName: "島嶼集團", n: 300000 }] },
    gs: { halt: false, orders: [{ no: 1, kind: "buy", kindName: "限價買", id: "g-culture", name: "文化藝術機構股", n: 100, px: 95, hold: 9548, day: "2026-11-17" }], rule: "示範：集團股的價格由這個世界的買賣和經濟決定。", notes: [], index: { v: 100.38 }, list: [
      { id: "g-culture", name: "文化藝術機構股", unit: "文化藝術機構", price: 100.66, open: 100, chg: 0.66, shares: 101213719, mcap: 10188034904, nav: 50, pb: 2.01, mine: 40, value: 4026, cost: 3900, limit: 5000000, hist: [98, 99.2, 97.5, 99, 100.1, 99.4, 100.9, 100.2, 101.3, 100.66] },
      { id: "g-daily", name: "民生集團股", unit: "民生集團", price: 100.09, open: 100, chg: 0.09, shares: 90000000, mcap: 9008100000, nav: 50, pb: 2, mine: 0, value: 0, cost: 0, limit: 4500000, hist: [100, 100.3, 99.8, 100.09] }] },
    flow: { day: "2026-11-17", orgs: CAS_FLOW_ORGS, nodes: CAS_FLOW_NODES.map(n => ({ id: n.id, name: n.name, tier: n.tier, org: n.org || null, note: n.note })).concat(["民生集團", "金融集團", "島嶼集團", "跨海集團", "學校集團", "家計", "公共"].map((nm, i) => ({ id: "w:d" + i, name: nm, tier: 1, parent: "world", bal: i === 3 ? -1.2e9 : 9e9 - i * 1e9 })).concat([{ id: "w:d0a", name: "民生超市", tier: 1, parent: "w:d0", bal: null }, { id: "w:d0b", name: "民生物流", tier: 1, parent: "w:d0", bal: null }])), bal: { gb: 61000000, ext: -240000000, house: 3180000000, budget: 912000000, museum: 5410000000, gov: 18700000, sea: 240000000, world: 98000000000 }, edges: [ // 示範：今天 05:00 起（開發時看畫面用）
      { from: "players", to: "house", amt: 2480000, srcs: [{ src: "bj", label: "21 點", amt: 3100000 }, { src: "pack", label: "免費和買來的大禮包", amt: -620000 }] },
      { from: "house", to: "ext", amt: 700000, srcs: [{ src: "houseInvestBuy", label: "館方投資買股票", amt: 700000 }] },
      { from: "world", to: "museum", amt: 6900000, srcs: [{ src: "npcCrowdMuseum", label: "散客的門票（修繕基金）", amt: 5600000 }, { src: "npcTicketMuseum", label: "NPC 的門票（修繕基金）", amt: 1300000 }] },
      { from: "world", to: "budget", amt: 3100000, srcs: [{ src: "npcCrowdBudget", label: "散客的門票（博物館資金）", amt: 2400000 }, { src: "npcJob", label: "NPC 在委託櫃台花的", amt: 700000 }] },
      { from: "players", to: "ext", amt: 1900000, srcs: [{ src: "stockBuy", label: "買股票（錢給海外）", amt: 2200000 }, { src: "dividend", label: "股息（海外付）", amt: -300000 }] },
      { from: "gen", to: "world", amt: 840000, srcs: [{ src: "worldGrow", label: "已知世界每天成長（照 GDP 年增率）", amt: 840000 }] },
      { from: "house", to: "budget", amt: 410000, srcs: [{ src: "investFee", label: "投資手續費", amt: 410000 }] },
      { from: "players", to: "gov", amt: 160000, srcs: [{ src: "stockTax", label: "股票證交稅", amt: 160000 }] },
      { from: "world", to: "gov", amt: 95000, srcs: [{ src: "bizTax", label: "營業稅（店裡的花費）", amt: 95000 }] },
      { from: "house", to: "sea", amt: 22000, srcs: [{ src: "econSea", label: "拚經濟沉到海底", amt: 22000 }] },
      { from: "w:d0a", to: "house", amt: 120000, srcs: [{ src: "demoA", label: "子公司付給莊家", amt: 120000 }] },
      { from: "w:d1", to: "w:d0", amt: 3200000, srcs: [{ src: "tradeLoan|w:d1|w:d0", label: "金融集團借給民生集團（示範）", amt: 3600000 }, { src: "tradeRepay|w:d0|w:d1", label: "民生集團還金融集團（示範）", amt: -400000 }] },
      { from: "w:d0", to: "w:d1", amt: 260000, srcs: [{ src: "tradeInterest|w:d0|w:d1", label: "借款利息", amt: 260000 }] },
      { from: "w:d2", to: "w:d0", amt: 1500000, srcs: [{ src: "tradeGoods|w:d2|w:d0", label: "貨款（集團之間）", amt: 1500000 }] },
      { from: "w:d3", to: "w:d2", amt: 220000, srcs: [{ src: "tradeGoods|w:d3|w:d2", label: "跨海集團賣貨給島嶼集團", amt: 220000 }] },
      { from: "w:d0", to: "w:d3", amt: 660000, srcs: [{ src: "tradeGoods|w:d0|w:d3", label: "民生集團付給跨海集團", amt: 660000 }] },
      { from: "w:d5", to: "w:d2", amt: 300000, srcs: [{ src: "tradeRev|w:d5|w:d2", label: "家計付給島嶼集團", amt: 300000 }] },
      { from: "w:d1", to: "w:d3", amt: 1019000, srcs: [{ src: "tradeDaily|w:d1|w:d3", label: "日用品採購", amt: 1019000 }] },
      { from: "w:d3", to: "w:d5", amt: 838000, srcs: [{ src: "tradeDaily|w:d3|w:d5", label: "日用品採購", amt: 838000 }] },
      { from: "w:d5", to: "w:d1", amt: 657000, srcs: [{ src: "tradeDaily|w:d5|w:d1", label: "日用品採購", amt: 657000 }] },
      { from: "w:d2", to: "w:d5", amt: 476000, srcs: [{ src: "tradeDaily|w:d2|w:d5", label: "日用品採購", amt: 476000 }] },
      { from: "w:d4", to: "w:d0", amt: 1195000, srcs: [{ src: "tradeDaily|w:d4|w:d0", label: "日用品採購", amt: 1195000 }] },
      { from: "w:d6", to: "w:d1", amt: 1014000, srcs: [{ src: "tradeFee|w:d6|w:d1", label: "金融服務費", amt: 1014000 }] },
      { from: "w:d1", to: "w:d3", amt: 833000, srcs: [{ src: "tradeFee|w:d1|w:d3", label: "金融服務費", amt: 833000 }] },
      { from: "w:d3", to: "w:d6", amt: 652000, srcs: [{ src: "tradeFee|w:d3|w:d6", label: "金融服務費", amt: 652000 }] },
      { from: "w:d0", to: "w:d3", amt: 471000, srcs: [{ src: "tradeFee|w:d0|w:d3", label: "金融服務費", amt: 471000 }] },
      { from: "w:d2", to: "w:d5", amt: 1190000, srcs: [{ src: "tradeFee|w:d2|w:d5", label: "金融服務費", amt: 1190000 }] },
      { from: "w:d4", to: "w:d6", amt: 1009000, srcs: [{ src: "tradeResearch|w:d4|w:d6", label: "研究委託", amt: 1009000 }] },
      { from: "w:d6", to: "w:d1", amt: 828000, srcs: [{ src: "tradeResearch|w:d6|w:d1", label: "研究委託", amt: 828000 }] },
      { from: "w:d1", to: "w:d4", amt: 647000, srcs: [{ src: "tradeResearch|w:d1|w:d4", label: "研究委託", amt: 647000 }] },
      { from: "w:d5", to: "w:d1", amt: 466000, srcs: [{ src: "tradeResearch|w:d5|w:d1", label: "研究委託", amt: 466000 }] },
      { from: "w:d0", to: "w:d3", amt: 1185000, srcs: [{ src: "tradeResearch|w:d0|w:d3", label: "研究委託", amt: 1185000 }] },
      { from: "w:d2", to: "w:d4", amt: 1004000, srcs: [{ src: "tradeDesign|w:d2|w:d4", label: "展覽設計委託", amt: 1004000 }] },
      { from: "w:d4", to: "w:d6", amt: 823000, srcs: [{ src: "tradeDesign|w:d4|w:d6", label: "展覽設計委託", amt: 823000 }] },
      { from: "w:d6", to: "w:d2", amt: 642000, srcs: [{ src: "tradeDesign|w:d6|w:d2", label: "展覽設計委託", amt: 642000 }] },
      { from: "w:d3", to: "w:d6", amt: 461000, srcs: [{ src: "tradeDesign|w:d3|w:d6", label: "展覽設計委託", amt: 461000 }] },
      { from: "w:d5", to: "w:d1", amt: 1180000, srcs: [{ src: "tradeDesign|w:d5|w:d1", label: "展覽設計委託", amt: 1180000 }] },
      { from: "w:d0", to: "w:d2", amt: 999000, srcs: [{ src: "tradeTax|w:d0|w:d2", label: "稅與規費", amt: 999000 }] },
      { from: "w:d2", to: "w:d4", amt: 818000, srcs: [{ src: "tradeTax|w:d2|w:d4", label: "稅與規費", amt: 818000 }] },
      { from: "w:d4", to: "w:d0", amt: 637000, srcs: [{ src: "tradeTax|w:d4|w:d0", label: "稅與規費", amt: 637000 }] },
      { from: "w:d1", to: "w:d4", amt: 456000, srcs: [{ src: "tradeTax|w:d1|w:d4", label: "稅與規費", amt: 456000 }] },
      { from: "w:d0", to: "w:d6", amt: 5200000, srcs: [{ src: "wageNpc|w:d0|w:d6", label: "發薪水給 NPC 錢包", amt: 5200000 }] },
      { from: "w:d6", to: "w:d0", amt: 2100000, srcs: [{ src: "wageBack|w:d6|w:d0", label: "NPC 薪水花回集團", amt: 2100000 }] },
      { from: "w:d5", to: "budget", amt: 3900000, srcs: [{ src: "npcCrowdBudget", label: "散客的門票（家計出的）", amt: 3900000 }] },
      { from: "w:d6", to: "museum", amt: 1700000, srcs: [{ src: "npcTicketMuseum", label: "NPC 的門票（NPC 錢包出的）", amt: 1700000 }] },
      { from: "w:d6", to: "house", amt: 900000, srcs: [{ src: "npcFood", label: "NPC 在餐車花的", amt: 900000 }] },
      { from: "w:d5", to: "w:d0", amt: 2400000, srcs: [{ src: "tradeHhGoods|w:d5|w:d0", label: "家計買日用品", amt: 2400000 }] },
      { from: "w:d5", to: "gov", amt: 800000, srcs: [{ src: "tradeHhTax|w:d5|gov", label: "家計繳稅", amt: 800000 }] },
      { from: "w:d5", to: "w:d1", amt: 600000, srcs: [{ src: "tradeHhFee|w:d5|w:d1", label: "家計付保險利息", amt: 600000 }] },
      { from: "w:d2", to: "w:d5", amt: 3100000, srcs: [{ src: "tradeWage|w:d2|w:d5", label: "集團付薪水給家計", amt: 3100000 }] },
      { from: "gb", to: "players", amt: 1250000, srcs: [{ src: "pLoan", label: "佩佩銀行借給館友", amt: 1500000 }, { src: "pLoanBack", label: "館友還款", amt: -250000 }] },
      { from: "gb", to: "players", amt: 90000, srcs: [{ src: "pBankInt", label: "存款利息（佩佩銀行付給館友）", amt: 90000 }] },
      { from: "players", to: "gb", amt: 420000, srcs: [{ src: "pBond", label: "館友買館債（錢進佩佩銀行）", amt: 420000 }] },
      { from: "house", to: "gb", amt: 3000000, srcs: [{ src: "hdepIn", label: "莊家存款進佩佩銀行", amt: 3300000 }, { src: "hdepOut", label: "莊家領回存款", amt: -300000 }] },
      { from: "gb", to: "house", amt: 110000, srcs: [{ src: "hdepInt", label: "莊家存款利息", amt: 110000 }, { src: "gbSweepH", label: "盈餘分給莊家 30%", amt: 0 }] },
      { from: "gb", to: "budget", amt: 260000, srcs: [{ src: "gbSweepB", label: "盈餘分給博物館資金 70%", amt: 260000 }] },
      { from: "w:d3", to: "w:d4", amt: 700000, srcs: [{ src: "tradeGoods|w:d3|w:d4", label: "跨海集團賣貨給學校集團", amt: 700000 }] },
      { from: "w:d6", to: "w:d2", amt: 450000, srcs: [{ src: "tradeRev|w:d6|w:d2", label: "公共付給島嶼集團的營收", amt: 450000 }] },
      { from: "w:d4", to: "w:d1", amt: 180000, srcs: [{ src: "tradeLoan|w:d4|w:d1", label: "學校集團存進金融集團", amt: 180000 }] },
      { from: "w:d0b", to: "w:d0a", amt: 80000, srcs: [{ src: "demoB", label: "物流費", amt: 80000 }] },
      { from: "world", to: "house", amt: 300000, srcs: [{ src: "npcFood", label: "NPC 在餐車花的", amt: 300000 }] },
    ] },
  };
}
// ---------- 接上伺服器（11-13，主 session）：casino act bankHall 的回答換成畫面要的格式 ----------
// 伺服器的 % 是「幾 %」（0.1 ＝ 0.1%），畫面的 pctText 吃小數（0.001），這裡換；還沒做的（股票、財報）給 null，頁籤寫「即將開放」
const P100 = x => (Number(x) || 0) / 100;
export function bankHallView(b) {
  if (!b) return null;
  const s = b.save, l = b.loan, d = b.bonds;
  const md = x => (x ? String(x).slice(5) : "");
  const bonds = d && d.issue && d.issue.open ? {
    issue: { name: d.issue.name, line: CAS_BOND.sub, pct: P100(d.issue.pct), left: Math.max(0, d.issue.cap - d.issue.sold), cap: d.issue.cap, mine: d.mine, due: md(d.due), unit: d.unit, perUser: d.perUser, young: d.young },
    held: d.list.map((x, i) => ({ id: i, amt: x.amt, int: x.int, due: md(x.due) })), iou: d.iou, window: d.window || null,
    state: d.issue.pct <= 4 ? "健康" : d.issue.pct <= 6 ? "吃緊" : "缺錢",
  } : null;
  return {
    demo: false, cash: b.cash, net: b.net,
    save: Object.assign({}, s, { savePct: P100(s.savePct), terms: s.terms.map(t => Object.assign({}, t, { pct: P100(t.pct), due: md(t.due) })), kinds: s.kinds.map(k => Object.assign({}, k, { pct: P100(k.pct) })) }),
    loan: Object.assign({}, l, { pct: P100(l.pct), list: l.list.map(x => Object.assign({}, x, { day: md(x.day), due: md(x.due), dueIso: x.due, at: x.from, from: "莊家" })) }),
    bonds, stocks: b.stocks, gs: b.gs || null, trade: b.trade || null, debt: b.debt || null, advisor: b.advisor || null, econ: b.econ, today: b.today || null, world: b.world || null, houseInv: b.houseInv || null, live: b.live || null, flow: b.flow || null, // live：全館的帳的即時餘額（11-17）
  };
}
const view = () => UI.bankHall || fakeBankHall();
// 跟伺服器拿壹次（進銀行廳時）。拿不到（沒登入、開發的 #bank）就留示範資料
async function bankLoad() {
  if (UI.bankLoading) return;
  UI.bankLoading = true; UI.bankAt = Date.now(); UI.bankErr = null;
  try { const r = await NET.call("casino", { act: "bankHall" }); if (r && r.bankHall) { UI.bankHall = bankHallView(r.bankHall); if (r.wallet) setChips(r.wallet.chips); } }
  catch (e) { UI.bankErr = (e && e.message) || "連不上銀行"; }
  finally { UI.bankLoading = false; if (UI.screen === "bank") rerender(); }
}
// 音效（11-15，翊文：「有些音效好像銀行也可以用，例如存錢」；檔案和來源在 shared/game/sfx_files.js）：錢放進去＝籌碼落下，錢回到手上＝吐硬幣（大筆＝壹串）；失敗＝原本的 error
// 銀行的聲音：bank_sfx.js（11-16 抽成共用，簡易銀行也用）
// 做壹件事：act 是 casino 的動作（bank、borrow、repay），回答有 bankHall 就換上
async function bankDo(act, data) {
  if (!UI.bankHall || UI.bankHall.demo) { note("示範資料：登入之後才能動錢。"); return; }
  if (UI.bankBusy) return;
  UI.bankBusy = true;
  try {
    const r = await NET.call("casino", Object.assign({ act }, data));
    if (!r || !r.ok) { snd("error"); note((r && r.reason) || "沒辦法", "bad"); return; }
    bankSfx(act, data);
    if (act === "bank" && data && data.op === "put") actDone("bank"); // 每日任務：存壹筆（決定 0146）
    if (r.bankHall) { UI.bankHall = bankHallView(r.bankHall); UI.bankAt = Date.now(); }
    if (r.wallet) setChips(r.wallet.chips);
    (r.lines || []).concat(r.bankNotes || []).forEach(t => note(t, "good"));
  } catch (e) { note((e && e.message) || "連不上銀行", "bad"); }
  finally { UI.bankBusy = false; if (UI.screen === "bank") rerender(); }
}
// 先看總價再確認（翊文 11-14：「按了股數後要再按個確認才能買」）：lines 是 [名稱, 數字, 樣式]，按「確認」才叫 onOk
function confirmTrade(title, lines, okText, onOk) {
  const m = miniLayer(title, "請看一下總價，沒問題再按確認。");
  m.card.append(h("div", { class: "bank-confirm" }, lines.filter(Boolean).map(([k, val, cls]) => h("p", { class: cls || null }, h("span", null, k), h("b", null, val)))),
    h("div", { class: "bank-acts bank-pick" }, btn(okText, () => { m.close(); onOk(); }, "big bank-btn gold"), btn("取消", () => m.close(), "big bank-btn")));
  closeOnOutside(m);
}
// 挑金額的小視窗：amts 是 [金額, 文字]，按了叫 then(金額)
// type：{ min, max, verb }＝下面多壹格自己輸入金額（11-15 翊文：「存錢應該也要能手動輸入數字」），範圍外不能按（伺服器也會擋）
function pickAmt(title, sub, amts, then, type) {
  const m = miniLayer(title, sub);
  const ok = amts.filter(([n]) => n > 0);
  m.card.append(h("div", { class: "bank-acts bank-pick" }, ok.length ? ok.map(([n, t]) => btn(t || fmt(n), () => { m.close(); then(n); }, "big bank-btn")) : h("p", { class: "bank-why" }, "金額不夠。")));
  if (type && type.max >= type.min) {
    let amt = "";
    const hint = h("p", { class: "bank-hint" }, `或自己輸入：${fmt(type.min)}～${fmt(type.max)}`);
    const okT = () => typeof amt === "number" && Number.isFinite(amt) && Math.floor(amt) >= type.min && Math.floor(amt) <= type.max;
    const go = btn(type.verb || "確定", () => { if (okT()) { m.close(); then(Math.floor(amt)); } }, "big bank-btn gold", { disabled: true });
    m.card.classList.add("bank-loan-pop"); // 小視窗在銀行版面外面：輸入框邊框照借款那個
    m.card.append(numField("金額", "", x => { amt = x; go.disabled = !okT(); hint.textContent = amt === "" ? `或自己輸入：${fmt(type.min)}～${fmt(type.max)}` : okT() ? `${type.verb || "確定"} ${fmt(Math.floor(amt))}` : `要在 ${fmt(type.min)} 到 ${fmt(type.max)} 之間。`; }, { min: type.min, step: 1 }), hint,
      h("div", { class: "bank-acts" }, go));
    const inp = m.card.querySelector("input"); if (inp) inp.addEventListener("keydown", e => { if (e.key === "Enter") go.click(); });
  }
  m.card.append(btn("取消", () => m.close(), "small"));
  closeOnOutside(m);
}
// 借款自己輸入金額（11-15）：打字時只更新下面那行「要還多少、幾號到期」，按「借」才送；超過還可以借的、不到最少的不能按（伺服器也會擋）
// 還壹部分（決定 0114）：先還利息、再還本金；一次最少 partMin，每筆最多 partMax 次；部分還不升額度
function partLoan(v, x) {
  const m = miniLayer("還多少？", `這筆要還 ${fmt(x.owe)}。先還利息、再還本金；壹次最少 ${fmt(x.partMin)}，這筆已經部分還了 ${x.parts}／${x.partMax} 次。部分還款不算準時還清，額度不會升；整筆還清才升。`);
  let amt = "";
  const hint = h("p", { class: "bank-hint" }, "輸入金額。");
  const ok = () => typeof amt === "number" && Number.isFinite(amt) && Math.floor(amt) >= Math.min(x.partMin, x.owe) && Math.floor(amt) <= Math.min(x.owe, v.cash) && x.parts < x.partMax;
  const go = btn("還", () => { if (ok()) { m.close(); bankDo("repay", { id: x.id, amt: Math.floor(amt) }); } }, "big bank-btn gold", { disabled: true });
  const upd = () => { go.disabled = !ok(); hint.textContent = x.parts >= x.partMax ? "這筆部分還的次數用完了，請壹次還清或轉分期。" : amt === "" ? "輸入金額。" : !ok() ? `要在 ${fmt(Math.min(x.partMin, x.owe))} 到 ${fmt(Math.min(x.owe, v.cash))} 之間。` : `還 ${fmt(Math.floor(amt))}，還剩 ${fmt(x.owe - Math.floor(amt))}。`; };
  m.card.classList.add("bank-loan-pop");
  m.card.append(numField("金額", "", z => { amt = z; upd(); }, { min: 1, step: 1 }), hint,
    h("div", { class: "bank-acts" }, ...[25, 50].map(p => btn(p + "%", () => { const n = Math.min(x.owe, v.cash, Math.max(x.partMin, Math.floor(x.owe * p / 100))); amt = n; const i = m.card.querySelector("input"); if (i) i.value = String(n); upd(); }, "small bank-btn")), go, btn("取消", () => m.close(), "small")));
  closeOnOutside(m);
  const inp = m.card.querySelector("input"); if (inp) { inp.focus(); inp.addEventListener("keydown", e => { if (e.key === "Enter") go.click(); }); }
}
// 轉分期（決定 0114）：2～4 期、每期隔 3～7 天；手續費 ＝ 延後那一期的本金 × 借款日利率 × 延後天數
function splitLoan(l, x) {
  const sp = l.split, m = miniLayer("轉分期", `把這筆分成 ${sp.kMin}～${sp.kMax} 期，每期隔 ${sp.gMin}～${sp.gMax} 天；第壹期就是原本的到期日。延後的部分照借款的日利率（每天 ${(sp.dayFeePct).toFixed(2)}%）收手續費，算進每期要還的錢。分期和延期只能選壹個，轉了不能再轉。`);
  let k = sp.kMin, g = sp.gMin;
  const info = h("div", { class: "bank-hint" });
  const plan = () => { const base = Math.floor(x.amt / k), baseO = Math.floor(x.owe / k), rate = sp.dayFeePct / 100, due = d => mdShift(x.dueIso, d); let fee = 0; const rows = []; for (let i = 0; i < k; i++) { const a = base + (i === 0 ? x.amt - base * k : 0), o = baseO + (i === 0 ? x.owe - baseO * k : 0), f = i === 0 ? 0 : Math.ceil(a * rate * g * i); fee += f; rows.push(`${due(g * i)} 還 ${fmt(o + f)}`); } return { rows, fee }; };
  const upd = () => { const p = plan(); info.textContent = `${p.rows.join("、")}；手續費共 ${fmt(p.fee)}`; };
  const seg = (label, vals, get, set) => h("div", { class: "bank-acts" }, h("small", null, label), ...vals.map(n => btn(String(n), () => { set(n); upd(); }, "small bank-btn")));
  const ks = []; for (let i = sp.kMin; i <= sp.kMax; i++) ks.push(i); const gs = []; for (let i = sp.gMin; i <= sp.gMax; i++) gs.push(i);
  m.card.classList.add("bank-loan-pop");
  m.card.append(seg("幾期", ks, () => k, n => { k = n; }), seg("每期隔幾天", gs, () => g, n => { g = n; }), info,
    h("div", { class: "bank-acts" }, btn("轉分期", () => { m.close(); bankDo("loanSplit", { id: x.id, k, g }); }, "big bank-btn gold"), btn("取消", () => m.close(), "small")));
  upd(); closeOnOutside(m);
}
function typeLoan(l) {
  const m = miniLayer("借多少？", `最少 ${fmt(l.min)}，最多 ${fmt(l.left)}。${l.days} 天內還，利息 ${pctText(l.pct)}。`);
  let amt = "";
  const hint = h("p", { class: "bank-hint" }, "輸入金額。");
  const go = btn("借", () => { if (ok()) { m.close(); bankDo("borrow", { amt: Math.floor(amt) }); } }, "big bank-btn gold", { disabled: true });
  const ok = () => typeof amt === "number" && Number.isFinite(amt) && Math.floor(amt) >= l.min && Math.floor(amt) <= l.left;
  const upd = () => {
    go.disabled = !ok();
    hint.textContent = amt === "" ? "輸入金額。" : !ok() ? `要在 ${fmt(l.min)} 到 ${fmt(l.left)} 之間。` : `借 ${fmt(Math.floor(amt))}，要還 ${fmt(Math.ceil(Math.floor(amt) * (100 + Math.round(l.pct * 100)) / 100))}。`;
  };
  m.card.classList.add("bank-loan-pop"); // 小視窗在銀行版面外面，bank 的顏色變數讀不到：bank.css 另外給輸入框邊框
  m.card.append(numField("金額", "", x => { amt = x; upd(); }, { min: l.min, step: 1 }), hint,
    h("div", { class: "bank-acts" }, go, btn("取消", () => m.close(), "small")));
  closeOnOutside(m);
  const inp = m.card.querySelector("input"); if (inp) { inp.focus(); inp.addEventListener("keydown", e => { if (e.key === "Enter") go.click(); }); }
}
const quickOf = (list, max, min = 1) => [...new Set(list)].filter(n => n >= min && n <= max).map(n => [n]);

// ---------- 小零件 ----------
const num = (cls, n) => h("b", { class: "bank-num " + (cls || "") }, n);
// tag：用翊文生的紅漲綠跌小牌（ui2-bank-tag-up／down，三角形在牌上），文字只寫百分比；平盤沒有牌
const upDown = (chg, tag) => tag && chg ? h("span", { class: "bank-chg tag " + (chg > 0 ? "up" : "down"), "aria-label": `${chg > 0 ? "漲" : "跌"} ${(Math.abs(chg) * 100).toFixed(1)}%` }, `${(Math.abs(chg) * 100).toFixed(1)}%`)
  : h("span", { class: "bank-chg " + (chg > 0 ? "up" : chg < 0 ? "down" : "") }, `${chg > 0 ? "▲" : chg < 0 ? "▼" : "－"} ${(Math.abs(chg) * 100).toFixed(1)}%`);
const pic = (name, cls) => h("img", { class: "bank-pic " + (cls || ""), src: `/ui2/ui2-bank-${name}.webp`, alt: "", draggable: "false" }); // P-12 的零件：錢罐、保險箱、鎖（翊文生的）
const panel = (title, aside, ...kids) => h("section", { class: "bank-panel" }, h("header", { class: "bank-ph" }, h("b", null, title), aside ? h("small", null, aside) : null), ...kids);
const ledger = (cols, rows, cls) => h("div", { class: "bank-book " + (cls || ""), role: "table" },
  h("div", { class: "bank-bh", role: "row" }, cols.map(c => h("span", { role: "columnheader" }, c))), ...rows);
const spark = hist => { const lo = Math.min(...hist), hi = Math.max(...hist), span = Math.max(1, hi - lo); return h("div", { class: "bank-spark", "aria-hidden": "true" }, hist.map((v, i) => h("i", { class: i === hist.length - 1 ? "last" : "", style: { height: 16 + (v - lo) / span * 36 + "px" } }))); };

// ---------- 頁籤的內容 ----------
function savePane(v) {
  const s = v.save, free = s.termMax - s.terms.length;
  const termRows = s.terms.map(t => h("div", { class: "bank-row", role: "row" },
    h("span", null, pic("lock", "lock"), h("b", null, `${t.days} 天・${pctText(t.pct)}`), h("small", { class: t.left <= 1 ? "bad" : "" }, t.left <= 1 ? "明天到期" : `還有 ${t.left} 天`)),
    h("span", { class: "bank-tab-num" }, `${fmt(t.amt)} → ${fmt(t.amt + t.int)}`),
    h("span", { class: "bank-r" }, btn("提早解約", () => bankDo("bank", { op: "break", id: t.id }), "small bank-btn", { title: "只拿回本金，利息沒有" }))));
  for (let i = 0; i < free; i++) termRows.push(h("div", { class: "bank-row empty", role: "row" }, h("span", null, pic("lock-open", "lock"), h("b", null, "空的"), h("small", null, "還可以開壹筆")), h("span", { class: "bank-r" }, btn("＋ 新增", () => pickAmt("開壹筆定存", `用手上的籌碼，壹筆 ${fmt(s.termMin)}～${fmt(s.termCap)}`, quickOf([s.termMin].concat(s.quick), Math.min(s.termCap, v.cash), s.termMin),
  amt => { const m = miniLayer(`定存 ${fmt(amt)}`, "存幾天？到期自動回到活存。"); m.card.append(h("div", { class: "bank-acts bank-pick" }, s.kinds.map(k => btn(`${k.days} 天 ${pctText(k.pct)}（+${fmt(Math.floor(amt * k.pct))}）`, () => { m.close(); bankDo("bank", { op: "term", amt, kind: k.i }); }, "big bank-btn gold"))), btn("取消", () => m.close(), "small")); closeOnOutside(m); }, { min: s.termMin, max: Math.min(s.termCap, v.cash), verb: "下壹步" }), "small bank-btn gold"))));
  return h("div", { class: "bank-cols" },
    panel("活存", "隨時可以領，每天 05:00 給利息",
      h("div", { class: "bank-big" }, pic("jar", "jar"), num("big", fmt(s.save))),
      h("p", { class: "bank-meta" }, "利率 ", h("b", null, `${pctText(s.savePct)}／天`), "　昨天利息 ", h("b", { class: s.earned > 0 ? "up" : "" }, sign(s.earned))),
      h("div", { class: "bank-acts" }, btn("存入", () => pickAmt("存進活存", "從手上的籌碼搬進活存", quickOf(s.quick, v.cash, s.min).concat(v.cash >= s.min ? [[v.cash, `全部 ${fmt(v.cash)}`]] : []), amt => bankDo("bank", { op: "put", amt }), { min: s.min, max: v.cash, verb: "存入" }), "primary big bank-btn gold"),
        btn("提出", () => pickAmt("從活存領出", "搬回手上的籌碼", quickOf(s.quick, s.save).concat(s.save > 0 ? [[s.save, `全部 ${fmt(s.save)}`]] : []), amt => bankDo("bank", { op: "take", amt }), { min: 1, max: s.save, verb: "領出" }), "big bank-btn")),
      h("p", { class: "bank-hint" }, "利息由莊家付。莊家缺錢的時候，利息會停發，這裡會寫「莊家吃緊」。")),
    panel("定存", `3 天 1%、7 天 3%，同時最多 ${s.termMax} 筆`,
      h("div", { class: "bank-safe" }, pic("safe", "safe"), h("small", null, `存了 ${s.terms.length} 筆，鎖到期才領得到利息`)),
      ledger(["期間", "本金 → 到期", ""], termRows)));
}
// 賣股還債（決定 0093 第 2 件）：有欠款（v.debt.can）才出現。賣的錢直接還債、不進錢包、不受每天賣出上限。
// 資料 v.debt：{ owed 欠多少, neg 錢包負數, loans 還得了的借款, can 能不能賣股還債 }；動作 bankDo("stock", { op: "sellDebt", id, n: 股數 | "max" })
function debtPanel(v) {
  const d = v.debt;
  if (!d || !d.can || !(d.owed > 0)) return null;
  const hold = v.stocks && Array.isArray(v.stocks.list) ? v.stocks.list.filter(x => x.mine > 0 && !x.halted && x.price > 0) : [];
  const rows = hold.map(x => {
    const need = Math.min(x.mine, Math.ceil(d.owed / x.price)), enough = need * x.price >= d.owed;
    return h("div", { class: "bank-row debt", role: "row" },
      h("span", null, h("b", null, x.name), h("small", null, `有 ${fmt(x.mine)} 股・現價 ${fp(x.price)}`)),
      h("span", { class: "bank-tab-num" }, `賣 ${fmt(need)} 股`, h("small", { class: enough ? "" : "bad" }, enough ? `約 ${fmt(need * x.price)}` : "賣光也不夠")),
      h("span", { class: "bank-r" }, btn(enough ? "賣到夠還" : "全賣", () => bankDo("stock", { op: "sellDebt", id: x.id, n: enough ? "max" : x.mine }), "small bank-btn gold")));
  });
  return panel("賣股還債", `你欠 ${fmt(d.owed)}`,
    h("p", { class: "bank-line" }, "賣的錢直接拿去還債，不進錢包，也不受每天賣出上限。"),
    rows.length ? ledger(["股票", "要賣", ""], rows) : h("p", { class: "bank-empty" }, "你手上沒有可以賣的股票。"));
}
// 財經專員（決定 0093 第 3 件）：欠了不少錢（v.advisor.need）才出現，代替「賣股還債」那張；每項都要按「同意」、跳確認才動。專員自己不動錢。
// 資料 v.advisor：{ need, debt{neg,loan,total}, loans[{id,owe,due,canExtend,why,fee,newDue}], sells[{id,name,kind,own,px,value,n,covers}], sellTotal, enough }
const md5 = s => (s ? String(s).slice(5) : "");
function advisorPanel(v) {
  const a = v.advisor;
  if (!a || !a.need || !a.debt) return null;
  const d = a.debt, parts = [d.neg > 0 ? `錢包欠 ${fmt(d.neg)}` : "", d.loan > 0 ? `借款共 ${fmt(d.loan)}` : ""].filter(Boolean).join("、");
  const ext = a.loans.filter(x => x.canExtend), blocked = a.loans.filter(x => !x.canExtend && x.why);
  const extRows = ext.map(x => h("div", { class: "bank-adv-row" },
    h("span", null, h("b", null, `借款 ${fmt(x.owe)}`), h("small", null, `${md5(x.due)} 到期 → 延到 ${md5(x.newDue)}，手續費 ${fmt(x.fee)}`)),
    btn("同意延期", () => confirmTrade("同意延期", [["這筆借款", fmt(x.owe)], ["改成到期", md5(x.newDue)], ["手續費（加進要還的）", fmt(x.fee), "bad"], ["延期後要還", fmt(x.owe + x.fee)]], "同意延期", () => bankDo("advisor", { op: "extend", id: x.id })), "small bank-btn gold")));
  const sellRows = a.sells.map(x => h("div", { class: "bank-adv-row" },
    h("span", null, h("b", null, `賣 ${x.name} ${fmt(x.n)} 股`), h("small", null, `${x.kind === "in" ? "館內股" : "館外股"}・手上 ${fmt(x.own)} 股・現價 ${fp(x.px)}・約還 ${fmt(x.covers)}`)),
    btn("同意賣出", () => confirmTrade("同意賣股還債", [["股票", x.name], ["賣", `${fmt(x.n)} 股`], ["約還債", fmt(x.covers), "good"]], "同意賣出", () => bankDo("stock", { op: "sellDebt", id: x.id, n: x.n })), "small bank-btn gold")));
  const verdict = !a.sells.length ? "手上沒有能賣的股票。" : a.enough ? `照這樣賣，大約還 ${fmt(a.sellTotal)}，夠還。` : `賣光也只能還約 ${fmt(a.sellTotal)}，還差 ${fmt(Math.max(0, (a.sellNeed != null ? a.sellNeed : d.total) - a.sellTotal))}。`;
  return panel("財經專員", `你欠 ${fmt(d.total)}`,
    h("div", { class: "bank-adv-who" }, h("div", { class: "bank-adv-face", "aria-hidden": "true" }, "梁"), h("div", null, h("b", null, "梁安（財經專員）"), h("small", null, "金融集團"))),
    h("p", { class: "bank-line" }, `「欠了不少，別慌，我排壹份計畫。每壹項都要你點頭才動。」現在欠 ${fmt(d.total)}（${parts}）。`),
    ext.length ? h("div", { class: "bank-adv-sec" }, h("b", null, "壹、借款延期"), ...extRows, h("small", { class: "bank-hint" }, "每筆只能延壹次、要在到期前。")) : null,
    blocked.length ? h("p", { class: "bank-hint" }, blocked.map(x => `借款 ${fmt(x.owe)}：${x.why}`).join(" ")) : null,
    h("div", { class: "bank-adv-sec" }, h("b", null, "二、賣股還債（館內股先賣）"), ...sellRows, h("p", { class: a.enough ? "bank-line good" : "bank-line bad" }, verdict),
      h("small", { class: "bank-hint" }, "賣的錢直接還債，不進錢包，也不受每天賣出上限。")));
}
function loanPane(v) {
  const l = v.loan;
  const rows = l.list.map(x => h("div", { class: "bank-row", role: "row" },
    h("span", null, h("b", null, `借 ${fmt(x.amt)}`), h("small", null, `${x.day} 借自${x.from}`)),
    h("span", { class: "bank-tab-num" }, `要還 ${fmt(x.owe)}`, h("small", { class: x.today ? "bad" : "" }, x.today ? "今天到期" : `${x.due} 到期`)),
    // 借了 15 分鐘內不能還：寫幾點起可以還，不要只把按鈕淡掉（測試 11-13）；籌碼不夠也寫出來
    h("span", { class: "bank-r" }, x.at && Date.now() < x.at
      ? h("small", { class: "bank-soon" }, `${new Date(x.at).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Taipei" })} 起可還`)
      : h("span", { class: "bank-acts" }, v.cash < x.owe ? h("small", { class: "bank-soon bad" }, "籌碼不夠還整筆") : btn("還錢", () => bankDo("repay", { id: x.id }), "small bank-btn gold"),
        v.cash >= Math.min(x.partMin, x.owe) && x.parts < x.partMax ? btn("還一部分", () => partLoan(v, x), "small bank-btn") : null,
        x.splitWhy ? null : btn("轉分期", () => splitLoan(l, x), "small bank-btn"))),
    x.plan ? h("small", { class: "bank-hint bank-plan" }, `分期：${x.plan.map(p => `${p.due.slice(5)} 要還 ${fmt(p.owe)}`).join("、")}`) : null));
  if (!rows.length) rows.push(h("p", { class: "bank-empty" }, "沒有欠款。"));
  return h("div", { class: "bank-cols" },
    panel("借款", `${l.days} 天內還，利息 ${pctText(l.pct)}`,
      num("big", fmt(l.left)),
      h("p", { class: "bank-meta" }, "還可以借　上限 ", h("b", null, fmt(l.limit))),
      h("div", { class: "bank-acts" }, l.why ? null : l.quick.filter(q => q <= l.left).map(q => btn(fmt(q), () => bankDo("borrow", { amt: q }), "big bank-btn"))),
      // 自己輸入、借滿（11-15，翊文：「借款應該也有一個手動輸入的」）
      l.why || l.left < l.min ? null : h("div", { class: "bank-acts" },
        btn("自己輸入金額", () => typeLoan(l), "bank-btn"),
        btn(`借滿 ${fmt(l.left)}`, () => bankDo("borrow", { amt: "max" }), "bank-btn")),
      l.why ? h("p", { class: "bank-why" }, l.why) : h("p", { class: "bank-hint" }, "借的錢從莊家出，到期沒還會被直接扣；借款利息比存款、館債都高。")),
    h("div", { class: "bank-stack" }, panel("欠的錢", "還的時候本金加利息", ledger(["借的", "要還", ""], rows)), advisorPanel(v) || debtPanel(v)));
}
function bondPane(v) {
  const b = v.bonds;
  if (!b) return panel("館債", "", h("p", { class: "bank-empty" }, "這週沒有發館債。"));
  const i = b.issue, used = 1 - i.left / i.cap;
  return h("div", { class: "bank-cols" },
    panel(i.name, `每週一期，到 ${i.due}`,
      h("p", { class: "bank-line" }, i.line),
      h("p", { class: "bank-meta" }, "這期利率 ", h("b", null, `${pctText(i.pct)}／週`), "　莊家", h("b", null, b.state || "健康")),
      h("div", { class: "bank-meter", role: "img", "aria-label": `已發 ${(used * 100).toFixed(0)}%` }, h("i", { style: { width: used * 100 + "%" } })),
      h("p", { class: "bank-meta" }, `還剩 ${fmt(i.left)} ／ 一共 ${fmt(i.cap)}`),
      h("div", { class: "bank-acts" }, i.young ? h("p", { class: "bank-why" }, `帳號開了 3 天以上才能買（還要 ${i.young} 天）。`) : null,
        btn("買 100,000", () => bankDo("bank", { op: "bond", amt: 100000 }), "primary big bank-btn gold", { disabled: i.young || v.cash < 100000 || i.left < 100000 ? true : null }),
        btn("買 500,000", () => bankDo("bank", { op: "bond", amt: 500000 }), "big bank-btn", { disabled: i.young || v.cash < 500000 || i.left < 500000 ? true : null })),
      h("p", { class: "bank-hint" }, "到期還本金加利息；" + (b.window ? "現在簽收窗口開著，可以到右邊「我持有的」提早贖回。" : "平常不能提早贖回、不能轉讓（簽收窗口開著的時候才可以）。"))),
    panel("我持有的", `共 ${fmt(i.mine)}`,
      ledger(["金額", "到期拿到", ""], b.held.map(x => h("div", { class: "bank-row", role: "row" }, h("span", null, h("b", null, fmt(x.amt))), h("span", { class: "bank-tab-num" }, `${fmt(x.amt + x.int)}（${x.due}）`), h("span", null)))), b.window ? h("div", { class: "bank-redeem" },
        h("p", { class: "bank-line" }, h("b", null, "現在可以提早贖回"), b.window.until ? `（到 ${String(b.window.until).slice(5).replace("-", () => "/")}）` : ""),
        h("p", { class: "bank-meta sm" }, "拿回本金，加上已經持有的天數照比例算的利息，不會比到期多。館方一天能付的有限，付不出就明天再試。"),
        btn("提早贖回", () => confirmTrade("提早贖回館債", [["持有", fmt(b.held.reduce((n, x) => n + x.amt, 0))], ["拿回", "本金＋照持有天數算的利息（以伺服器算的為準）"]], "確認贖回", () => bankDo("bank", { op: "bondRedeem" })), "primary big bank-btn gold", { disabled: b.held.length ? null : true }),
        b.held.length ? null : h("p", { class: "bank-why" }, "你還沒有買這一期的館債。")) : null));
}
// 還沒做的頁籤（股票、財報）：伺服器給 null 的時候
const soon = (title, what) => h("div", { class: "bank-cols" }, panel(title, "即將開放", h("p", { class: "bank-empty" }, what)));
// ---------- 股票頁（11-14 美術統籌重做；資料格式見 docs/規劃/經濟體系規劃.md 2.8） ----------
// 左：行情表，依來源分組（館內五家店、台股、館外）。右：選中的那支——走勢線、交易（現股／槓桿／掛單）、我的部位、掛著的單。
// 下面「假設」的欄位（伺服器還沒給，示範資料先照這個畫；實作好了再對齊）：
//   cur.session = { state: "open"|"closed"|"pre"|"noopen"|"holiday", from: "09:00", to: "13:30", step: 15, at: "10:15" }  cur.intraday = [價, …]（每 step 分鐘一個）
//   S.lev = { max: 5, opensLeft: 3, fee, interest: 0.0015, borrow: 0.003, force: 0.5 }（沒有就不畫「槓桿」頁籤）
//   S.positions = [{ id, sid, side: "long"|"short", lev, margin, n, entry, ratio, liq, pnl, stop, take }]   ratio＝剩下的保證金 ÷ 原本的（1＝100%；到 force 強平）
//   S.orders = [{ id, kind: "buy"|"sell"|"stop"|"cover", sid, px, n, lock, until, state }]（沒有就不畫「掛單」頁籤）  S.locked = { chips, shares: { sid: n } }
//   S.credit = { pts, level, next, posLimit, posUsed }  動作：op "open"、"close"、"order"、"cancel"（參數見下）
const STOCK_GROUPS = { out: "其他", us: "美股", in: "館內五家店", tw: "台股" };
const STOCK_GROUP_ORDER = ["in", "tw", "us", "out"];
const feeWord = v => (v > 0 ? pctText(v) : "免手續費"); // 手續費是 0 就寫「免手續費」，不寫「0%」（決定 0136）
const feeOf = (S, cur) => (cur && cur.fee != null ? cur.fee : S.fee); // 每支自己的手續費（館外台股、美股照真實，決定 0136）；沒有就用整體的
const unitCost = (s, fee) => Math.ceil(Math.ceil(s.price * 100) / 100 * (1 + fee)); // 買壹股要付的（含手續費）
// 真實行情的壹小段：代號、真實價（台股寫元、美股寫美元）、真實漲跌%。沒資料（null）就只寫代號
const realPx = (n, mk) => `${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${mk === "tw" ? "元" : "美元"}`;
// 美股：遊戲價旁邊同時寫美金（翊文 11-14：「美股換算台幣，那美股那邊同時顯示美金和台幣」）。倍數 ≥ 30 才算「台幣」（決定 0081 美股 ×32＝美元換台幣），之前的倍數只寫「籌碼」
const mulText = s => (s && s.market === "us" && Number(s.mult) >= 15 ? `${Number(s.mult).toFixed(2)}（今天的美元對台幣匯率）` : String(s && s.mult));
const usTwd = s => s && s.market === "us" && Number(s.mult) >= 30;
const usdText = s => (s && s.market === "us" && s.real && s.real.px != null ? `US$ ${Number(s.real.px).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "");
// 還沒抓到真實價的（新上架、還沒開過盤）：先寫代號和名字（11-16，翊文：「怎麼新的沒有股票號碼那些」）
const codeBit = s => h("span", { class: "bank-real" }, h("b", null, s.code.name ? `${s.code.sym} ${s.code.name}` : s.code.sym), h("span", null, "開盤後才有價"));
function realBit(s) {
  const r = s.real;
  if (!r) return null;
  const c = typeof r.chg === "number" ? r.chg : null;
  return h("span", { class: "bank-real" }, h("i", { class: "bank-realtag", title: "真實：外面那支股票現在的行情。遊戲價＝真實價 × 倍數，每分鐘跟著真實行情更新，漲跌幅一樣。" }, "真實"), h("b", null, r.name ? `${r.sym} ${r.name}` : r.sym), r.px != null ? h("span", null, realPx(r.px, s.market)) : null,
    c != null ? h("em", { class: c > 0 ? "up" : c < 0 ? "down" : "" }, `${c > 0 ? "▲" : c < 0 ? "▼" : "－"} ${(Math.abs(c) * 100).toFixed(1)}%`) : null);
}
const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = t => { const [a, b] = String(t).split(":").map(Number); return a * 60 + (b || 0); };
const MK_NAME = { tw: "台股", us: "美股", in: "館內店" };
const SESS_TEXT = { closed: s => `今天已收盤（${s.to}）。`, pre: s => (s.mk === "us" && s.reg ? `美股台灣時間 ${s.from} 開始盤前交易（正常盤 ${s.reg} 開始），拿到第壹個價才開放買賣。` : `${s.mk === "us" ? "美股台灣時間" : MK_NAME[s.mk] || ""} ${s.from} 開盤，拿到開盤價才開放買賣。`), pending: () => "已經開盤，還在等開盤價，拿到之前先不能買賣。", noopen: s => `今天${MK_NAME[s.mk] || ""}沒有開市。`, holiday: () => "今天休市。", halt: () => "停盤中（23:30～05:00），明天 05:00 開盤。" };
// 台股的場次（伺服器給 market "tw"、twState、intraday 每分鐘一個價、intradayFrom；外層 S.tw = { from: 540, len: 270 }）→ 畫面用的 session
const twClock = ms => { const t = new Date(ms + 8 * 3600000); return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`; }; // 毫秒 → 台灣時間 HH:MM
function twSess(S, s) {
  // 場次：台股 S.tw = { from: 540, len: 270 }（每分鐘一個價）；美股 S.us = { state, from: 570, len: 390 } 加 S.usOpenAt（開盤的毫秒，含夏令時間；intradayFrom 是距離開盤的分鐘）；館內店 S.inDay = { from: 300, len: 75, step: 15 }
  const tw = s.market === "tw", us = s.market === "us", n = (s.intraday || []).length, off = s.intradayFrom || 0;
  if (us) {
    const g = Object.assign({ from: 570, len: 390, reg: 0 }, S.us), open = S.usOpenAt, reg = g.reg > 0 ? twClock(open + g.reg * 60000) : ""; // reg：正常盤從第幾分鐘起（之前是盤前，決定 0159）
    const raw = s.usState || (S.us && S.us.state) || "closed", state = raw === "closed" && !n ? "noopen" : raw;
    if (!open) return { state, mk: "us", from: "", to: "", mid: "", slots: g.len, step: 1, offset: off, at: "" };
    return { state, mk: "us", from: twClock(open), to: twClock(open + g.len * 60000), mid: reg || twClock(open + g.len * 30000), reg, pre: !!reg && n > 0 && off + n - 1 < g.reg, slots: g.len, step: 1, offset: off, at: n ? twClock(open + (off + n - 1) * 60000) : "" };
  }
  const g = tw ? Object.assign({ from: 540, len: 270, step: 1 }, S.tw) : s.market === "in" ? Object.assign({ from: 300, len: 75, step: 15 }, S.inDay) : null;
  if (!g) return null;
  const step = g.step || 1;
  const state = tw ? (s.twState === "closed" && !n ? "noopen" : s.twState || "closed") : s.halted ? "halt" : "open";
  const to = g.from + (step === 1 ? g.len : (g.len - 1) * step);
  return { state, mk: s.market, from: hhmm(g.from), to: hhmm(to), mid: hhmm(Math.round((g.from + to) / 2)), slots: g.len, step, offset: off, at: n ? hhmm(g.from + (off + n - 1) * step) : "" };
}
// 這支現在能不能買賣：伺服器給的 halted 最準；沒有（示範資料）就看整個市場停盤或場次
const stockHalt = (S, s) => (s.halted != null ? !!s.halted : !!S.halt || !!(s.session && s.session.state !== "open"));
const haltText = (S, s) => (s.session && s.session.state !== "open" && SESS_TEXT[s.session.state] ? SESS_TEXT[s.session.state](s.session) : S.halt ? "停盤中，等開盤再買賣。" : "現在不能買賣。");
// 走勢線：台股照 09:00～13:30 的時間軸畫（每分鐘一個價，右邊還沒走到的留白）；其他有 hist 就畫 hist。底圖用 CSS 畫的深藍格線
// 虛線和紅綠（11-16 翊文：「改成昨天收盤」，照真實看盤軟體的「平盤／前收」）：盤中圖用昨天收盤（價 ÷（1＋今天漲跌））當基準，現在比昨收高畫紅、低畫綠，跟旁邊的漲跌％壹致；沒有漲跌資料才退回第壹點
function chart(s) {
  // 11-17 翊文：「這個圖應該保留昨天股市結束之後的摺線圖吧?」：今天還沒有盤中的價（開盤前、等開盤價、休市）就畫伺服器給的上壹場（lastSession），基準是那天的昨收
  const ss = s.session, ls = ss && ss.state !== "open" && !(s.intraday || []).length && s.lastSession && (s.lastSession.ser || []).length > 1 ? s.lastSession : null;
  const pts = (ls ? ls.ser : ss ? s.intraday : s.hist) || [];
  const W = 240, H = 56, pad = 4, slots = ss ? ss.slots : pts.length, off = ls ? ls.from : ss ? ss.offset : 0;
  let body = "";
  if (pts.length > 1 && (ls || !(ss && ss.state === "noopen"))) {
    const pc = ls ? (ls.base > 0 ? ls.base : null) : ss && typeof s.chg === "number" && s.price > 0 && s.chg > -1 ? s.price / (1 + s.chg) : null, base = pc != null ? pc : pts[0]; // 昨天收盤
    const lo = Math.min(base, ...pts), hi = Math.max(base, ...pts), span = Math.max(1e-9, hi - lo);
    const xy = pts.map((p, i) => [pad + (off + i) / Math.max(1, slots - 1) * (W - 2 * pad), H - pad - (p - lo) / span * (H - 2 * pad)]);
    const up = ls ? pts[pts.length - 1] >= base : pc != null ? s.chg >= 0 : pts[pts.length - 1] >= pts[0], col = up ? "#FF8A78" : "#7FD39B", line = xy.map(p => p.map(n => n.toFixed(1)).join(",")).join(" "), last = xy[xy.length - 1], first = xy[0];
    const oy = H - pad - (base - lo) / span * (H - 2 * pad); // 昨天收盤的虛線（沒有漲跌資料時是第壹點）
    body = `<line x1="${pad}" x2="${W - pad}" y1="${oy.toFixed(1)}" y2="${oy.toFixed(1)}" stroke="#A9B4C8" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/><polygon points="${first[0].toFixed(1)},${H} ${line} ${last[0].toFixed(1)},${H}" fill="${col}" opacity=".18"/><polyline points="${line}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3" fill="${col}"/>`;
  }
  const axis = ss ? h("div", { class: "bank-axis" }, h("span", null, ss.from), h("span", null, ss.mid), h("span", null, ss.to)) : null;
  const label = (ss ? (ss.state === "open" ? `${ss.pre ? `盤前（正常盤 ${ss.reg} 開始）` : "盤中"}，每${ss.step > 1 ? ` ${ss.step} ` : ""}分鐘更新壹次${ss.at ? `，最新 ${ss.at}` : ""}。` : SESS_TEXT[ss.state](ss)) : "") + (ls ? `圖是上壹場（${ls.day.slice(5)}）的走勢。` : "");
  if (!body && !ss) return null;
  return h("div", { class: "bank-chartbox" },
    h("div", { class: "bank-chart" + (ss && ss.state !== "open" ? " dim" : ""), role: "img", "aria-label": ss ? `走勢，${label}` : `走勢：從 ${fmt(pts[0])} 到 ${fmt(pts[pts.length - 1])}`, html: body ? `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${body}</svg>` : "" }, body ? null : h("p", { class: "bank-nochart" }, label)),
    axis, ss ? h("p", { class: "bank-sess " + ss.state }, label) : null);
}
// 買不了、賣不了的原因：壹次只講壹個（翊文 11-14：有錢卻壹直說「籌碼不夠」）
function whyNoBuy(v, S, cur) {
  if (stockHalt(S, cur)) return haltText(S, cur);
  if (v.cash < unitCost(cur, feeOf(S, cur))) return `錢不夠：壹股 ${fp(cur.price)}，加手續費要 ${fmt(unitCost(cur, feeOf(S, cur)))}，你現在有 ${fmt(v.cash)}。`;
  if (cur.market === "in" && S.inCap != null && cur.mine >= S.inCap) return `這家最多持有 ${fmt(S.inCap)} 股，你已經滿了。`;
  if ((cur.market === "in" ? S.inExposeLeft : S.exposeLeft) != null && (cur.market === "in" ? S.inExposeLeft : S.exposeLeft) < cur.price) return "全館持股今天到上限了，晚點再來買。";
  return "現在買不了。";
}
function whyNoSell(S, cur) {
  if (stockHalt(S, cur)) return haltText(S, cur);
  if (!cur.mine) return "你還沒有這支股票。";
  if ((cur.market === "in" ? S.inSellLeft : S.sellLeft) != null && (cur.market === "in" ? S.inSellLeft : S.sellLeft) < cur.price) return `今天賣出的額度用完了（壹天最多賣 ${fmt(S.sellDay || 0)}），明天再賣。`;
  return "現在賣不了。";
}
// 分組收折（11-16，翊文：「館內，台股，美股也可以多個收折功能嗎」）：按組名收起／打開，記在這台裝置（localStorage）
const FOLD_KEY = "pm-bank-fold";
const foldGet = () => { if (!UI.bankFold) { try { UI.bankFold = JSON.parse(localStorage.getItem(FOLD_KEY) || "{}") || {}; } catch (e) { UI.bankFold = {}; } } return UI.bankFold; };
const foldSet = (k, v) => { const F = foldGet(); if (v) F[k] = 1; else delete F[k]; try { localStorage.setItem(FOLD_KEY, JSON.stringify(F)); } catch (e) { /* ignore */ } };
function stockRows(list, cur, S) {
  const gk = s => (s.market === "tw" ? "tw" : s.market === "us" ? "us" : s.kind);
  const kinds = STOCK_GROUP_ORDER.filter(k => list.some(s => gk(s) === k)).concat([...new Set(list.map(gk))].filter(k => !STOCK_GROUP_ORDER.includes(k)));
  const rows = [], fresh = UI.bankFreshSnap || new Set();
  kinds.forEach(k => {
    const F = foldGet(), shut = kinds.length > 1 && !!F[k], mine = list.filter(s => gk(s) === k), held = mine.filter(s => s.mine > 0).length;
    if (kinds.length > 1) rows.push(h("button", { type: "button", class: "bank-grp bank-grp-btn" + (shut ? " shut" : ""), "aria-expanded": String(!shut), title: shut ? "點開這壹組" : "收起這壹組", onClick: () => { foldSet(k, !shut); rerender(); } },
      h("i", { class: "bank-grp-arrow", "aria-hidden": "true" }, shut ? "▸" : "▾"), h("span", null, STOCK_GROUPS[k] || "其他"),
      h("small", { class: "bank-grp-sum" }, `${mine.length} 支${held ? `・持有 ${held} 支` : ""}${shut ? "・點開" : ""}`)));
    if (shut) return;
    // 美股、台股照產業分小組（11-20，決定 0134：S.cats ＝ [{ id, name }]，每支 s.cat；小組也能收，記在同壹個 localStorage）
    const subs = (k === "us" || k === "tw") && S && Array.isArray(S.cats) && S.cats.length && mine.some(s => s.cat) ? S.cats.concat([{ id: "_", name: "其他" }]).map(c => ({ c, rows: mine.filter(s => (s.cat || "_") === c.id) })).filter(g => g.rows.length) : null;
    const rowFor = (s, i) => {
      const closed = s.session && s.session.state !== "open";
      rows.push(h("button", { type: "button", class: "bank-row stock" + (s === cur ? " on" : ""), role: "row", "aria-pressed": String(s === cur), onClick: () => { UI.bankStock = i; UI.bankPV = "trade"; rerender(); } },
        h("span", null, h("b", null, s.name), fresh.has(s.id) ? h("i", { class: "bank-new", title: "價格有變動" }, "新") : null, s.stale ? h("i", { class: "bank-stale-tag" }, "未更新") : null, closed ? h("i", { class: "bank-stale-tag" }, s.session.state === "closed" ? "收盤" : s.session.state === "pre" || s.session.state === "pending" ? "未開" : s.session.state === "halt" ? "停盤" : "休市") : null, s.real ? h("small", { class: "ln real" }, realBit(s)) : s.code ? h("small", { class: "ln real" }, codeBit(s)) : h("small", { class: "ln" }, s.line)),
        h("span", { class: "bank-tab-num" }, fp(s.price), usdText(s) ? h("small", { class: "bank-usd-sm" }, usdText(s)) : null), upDown(s.chg, true), h("span", { class: "bank-tab-num" }, hasShares(s) ? sharesText(s) : "—")));
    };
    if (!subs) { list.forEach((s, i) => { if (gk(s) === k) rowFor(s, i); }); return; }
    subs.forEach(({ c, rows: g }) => {
      const sk = k + "/" + c.id, off = !!F[sk], heldN = g.filter(s => s.mine > 0).length;
      rows.push(h("button", { type: "button", class: "bank-grp bank-grp-btn bank-sub" + (off ? " shut" : ""), "aria-expanded": String(!off), title: off ? "點開這壹小組" : "收起這壹小組", onClick: () => { foldSet(sk, !off); rerender(); } },
        h("i", { class: "bank-grp-arrow", "aria-hidden": "true" }, off ? "▸" : "▾"), h("span", null, c.name),
        h("small", { class: "bank-grp-sum" }, `${g.length} 支${heldN ? `・持有 ${heldN} 支` : ""}${off ? "・點開" : ""}`)));
      if (!off) g.forEach(s => rowFor(s, list.indexOf(s)));
    });
  });
  return rows;
}
// ---------- 小零件：頁籤、數字欄、選項 ----------
// 兩頁／三頁小切換鈕前面的圖示（翊文 11-14：「這兩個也做一個 Icon」）：行情＝K 線、持倉＝錢包裡的股票、交易＝兩個箭頭。沒有對到的鍵就不放圖示
const SEG_ICON = {
  market: SVG('<path d="M6 4v3M6 13v3M6 7h0M4 7h4v6H4zM12 6v3M12 15v3M10 9h4v6h-4zM18 3v3M18 11v3M16 6h4v5h-4z" transform="translate(0 2)"/>'),
  hold: SVG('<path d="M4 8h16v11H4z"/><path d="M4 8l2-3h12l2 3"/><path d="M8 13l2 2 2-3 3 3 1-2"/>'),
  trade: SVG('<path d="M4 8h13l-3-3M20 16H7l3 3"/>'),
};
const seg = (items, cur, onPick, cls) => h("div", { class: "bank-segs " + (cls || ""), role: "tablist" }, items.map(([k, t, dis]) => h("button", { type: "button", role: "tab", "aria-selected": String(k === cur), class: "bank-seg" + (k === cur ? " on" : ""), disabled: dis ? true : null, onClick: () => onPick(k) }, SEG_ICON[k] && cls === "kind" ? h("span", { class: "bank-segi", html: SEG_ICON[k], "aria-hidden": "true" }) : null, t)));
const form = () => (UI.bankForm || (UI.bankForm = { lev: 2, dir: "long", margin: 1000000, stopOn: true, stop: 3, takeOn: false, take: 5, okind: "buy", opx: "", on: "" }));
// 數字欄：打字的時候只更新旁邊的算式（不整頁重畫，不然游標會跑掉）
function numField(label, value, onChange, opts = {}) {
  const inp = h("input", { type: "number", inputmode: "decimal", class: "bank-in", value: value === "" ? "" : String(value), min: opts.min != null ? String(opts.min) : null, step: opts.step != null ? String(opts.step) : "any", "aria-label": label,
    onInput: e => onChange(e.target.value === "" ? "" : Number(e.target.value)),
    onKeydown: e => { if (/^[0-9.]$/.test(e.key) || e.key === "Backspace") keyBeep(); } }); // 按數字「嗶」（11-15，Pixabay「Number pad 1」）
  return h("label", { class: "bank-field" }, h("span", null, label), inp, opts.unit ? h("em", null, opts.unit) : null);
}
const chips = (list, cur, onPick, fmtFn, lockFn) => h("div", { class: "bank-chips" }, list.map(n => { const lk = lockFn ? lockFn(n) : ""; return h("button", { type: "button", class: "bank-chip" + (n === cur ? " on" : "") + (lk ? " locked" : ""), "aria-pressed": String(n === cur), disabled: lk ? true : null, title: lk || null, onClick: () => onPick(n) }, fmtFn ? fmtFn(n) : fmt(n)); }));
// ---------- 交易：現股 ----------
function spotTrade(v, S, cur) {
  const side = UI.bankSide === "sell" && ((cur.free != null ? cur.free : cur.mine) > 0 || cur.frac > 0) ? "sell" : "buy", mode = tradeMode(cur); // 買／賣 二選壹；mode 按股數 n／按金額 amt（館外股才有，bank_amount.js），按鈕那排只畫壹排
  const halt = stockHalt(S, cur), one = unitCost(cur, feeOf(S, cur));
  const inShop = cur.market === "in", expL = inShop ? S.inExposeLeft : S.exposeLeft, sellL = inShop ? S.inSellLeft : S.sellLeft, capL = inShop && S.inCap != null ? Math.max(0, S.inCap - cur.mine) : Infinity;
  const maxBuy = halt ? 0 : Math.max(0, Math.min(Math.floor(v.cash / one), capL, expL != null ? Math.floor(expL / Math.max(1, cur.price)) : Infinity));
  const maxSell = halt ? 0 : Math.max(0, Math.min(cur.free != null ? cur.free : cur.mine, sellL != null ? Math.floor(sellL / Math.max(1, cur.price)) : Infinity));
  const max = side === "buy" ? maxBuy : maxSell;
  // 總價（約）：買 ＝ 股價×股數＋手續費；賣 ＝ 股價×股數－手續費－證交稅（賣出金額 × 稅率，賺賠都收，進位、最少 1；美股 tax 是 0）
  const sumOf = n => {
    const cents = Math.round(cur.price * 100) * n, gross = side === "buy" ? Math.ceil(cents / 100) : Math.floor(cents / 100), fee = Math.ceil(gross * feeOf(S, cur));
    if (side === "buy") return { gross, fee, tax: 0, total: gross + fee };
    const tax = cur.tax > 0 && gross > 0 ? Math.min(Math.max(0, gross - fee), Math.max(1, Math.ceil(gross * Math.round(cur.tax * 10000) / 10000))) : 0;
    return { gross, fee, tax, total: gross - fee - tax };
  };
  // 按了先跳確認，按「確認」才送出（sendN：賣光時給 "max"）
  const ask = (n, sendN) => {
    const x = sumOf(n), buy = side === "buy";
    confirmTrade(`${buy ? "買進" : "賣出"} ${cur.name}`, [
      ["股數", `${fmt(n)} 股`], ["股價", fp(cur.price)], ["手續費（約）", fmt(x.fee)],
      !buy && cur.tax > 0 ? ["證交稅（約）", fmt(x.tax)] : null,
      [buy ? "合計要付（約）" : "拿回（約）", fmt(x.total), "total"]], buy ? "確認買進" : "確認賣出", () => bankDo("stock", { op: side, id: cur.id, n: sendN != null ? sendN : n }));
  };
  const steps = [1, 10, 100].map(n => btn(`${n} 股`, () => ask(n), "big bank-btn", { disabled: n > max ? true : null }));
  steps.push(btn(max > 0 ? `${side === "buy" ? "買滿" : "全賣"} ${fmt(max)}` : `${side === "buy" ? "買滿" : "全賣"}`, () => ask(max, side === "buy" ? max : "max"), "primary big bank-btn gold", { disabled: max > 0 ? null : true }));
  // 自訂股數：只收正整數，超過上限就擋，下面即時算總價
  const qf = UI.bankQty || (UI.bankQty = { n: "" }), qinfo = h("p", { class: "bank-meta sm bank-qinfo" }), qbtn = btn(side === "buy" ? "買這個數量" : "賣這個數量", () => { const n = qty(); if (n > 0 && n <= max) ask(n); }, "bank-btn gold");
  const qty = () => { const n = Number(qf.n); return Number.isInteger(n) && n > 0 ? n : 0; };
  const qcalc = () => {
    const raw = qf.n, n = qty();
    qbtn.disabled = true;
    if (raw === "" || raw == null) { qinfo.textContent = max > 0 ? `最多 ${fmt(max)} 股。` : ""; return; }
    if (!n) { qinfo.textContent = "股數要是 1 以上的整數。"; return; }
    if (n > max) { qinfo.textContent = `最多只能${side === "buy" ? "買" : "賣"} ${fmt(max)} 股。`; return; }
    const x = sumOf(n);
    qinfo.textContent = side === "buy" ? `${fmt(n)} 股 × ${fp(cur.price)} ＋手續費 ${fmt(x.fee)} ＝ 約 ${fmt(x.total)}` : `${fmt(n)} 股 × ${fp(cur.price)} －手續費 ${fmt(x.fee)}${cur.tax > 0 ? ` －稅 ${fmt(x.tax)}` : ""} ＝ 約拿回 ${fmt(x.total)}`;
    qbtn.disabled = false;
  };
  const custom = max > 0 ? h("div", { class: "bank-custom" }, numField("自訂股數", qf.n, x => { qf.n = x === "" ? "" : Math.floor(Number(x)); qcalc(); }, { min: 1, step: 1, unit: "股" }), qbtn, qinfo) : null;
  qcalc();
  const sellNote = ((inShop ? S.inSellLeft : S.sellLeft) != null ? `今天最多賣出約 ${S.sellCap != null ? fmt(S.sellCap) : "—"}，還能賣約 ${fmt(inShop ? S.inSellLeft : S.sellLeft)}。` : "") + (cur.tax > 0 ? `賣出賺到的部分要繳 ${Math.round(cur.tax * 100)}% 資本利得稅（虧的不用繳）。` : "");
  return [
    seg([["buy", "買進"], ["sell", "賣出", !((cur.free != null ? cur.free : cur.mine) || cur.frac)]], side, k => { UI.bankSide = k; rerender(); }),
    cur.kind === "out" ? seg([["n", "按股數"], ["amt", "按金額"]], mode, k => { setTradeMode(k); rerender(); }) : null, ...(mode === "amt" ? [] : [h("div", { class: "bank-acts" }, steps)]),
    ...(mode !== "amt" ? [custom] : halt ? [] : amountBox({ side, cur, cash: v.cash, sellLeft: sellL, feeRate: feeOf(S, cur), numField, confirmTrade, bankDo, state: UI.bankAmt || (UI.bankAmt = { amt: "" }) }) || []),
    max < 1 ? h("p", { class: "bank-why" }, side === "buy" ? whyNoBuy(v, S, cur) : whyNoSell(S, cur)) : null,
    h("p", { class: "bank-meta sm" }, side === "buy" ? `買 1 股要 ${fmt(one)}（含手續費）。` : sellNote),
    side === "sell" && S.sellTip ? h("p", { class: "bank-hint bank-selltip" }, S.sellTip) : null]; // 「信用升到 N 級可以賣到 X」（決定 0093，sellTip 伺服器寫好）
}
// ---------- 交易：槓桿、放空（當沖：當天平倉，23:30 前系統會自動平，台股 13:30 前） ----------
function levTrade(v, S, cur) {
  const L = S.lev, f = form(), halt = stockHalt(S, cur);
  const RT = (L.rates && L.rates[cur.market]) || { fee: L.fee, interest: L.interest, borrow: L.borrow, tax: 0 }; // 這個市場的費用（決定 0136）：手續費、利息、借券費、當沖證交稅
  const byM = L.byMarket && L.byMarket[cur.market], capCredit = S.credit && S.credit.maxLev != null ? S.credit.maxLev : Infinity, maxLev = Math.min(byM != null ? byM : L.max, capCredit), shownLev = Math.max(maxLev, Math.min(L.max || 0, 10)), lev = Math.max(1, Math.min(f.lev, maxLev)), long = f.dir === "long"; // 各市場最高幾倍（美股 0＝不能開，寫 usWhy）
  const roomMargin = S.credit ? Math.max(0, Math.floor(S.credit.posLimit - S.credit.posUsed)) : Infinity; // 本金上限還剩多少（決定 0157）
  const maxMargin = Math.max(0, Math.min(v.cash, roomMargin));
  const phone = window.innerWidth < 761 || window.innerHeight < 501;
  const sum = h("details", { class: "bank-sum", open: phone ? null : "" });
  // 整股（11-14 測試：以前畫面寫保證金 10 萬、部位 20 萬，伺服器股數要整股，實際只開 6 股、扣 8.64 萬）：股數 ＝ 保證金×倍數÷價 無條件捨去，部位 ＝ 股數×價，保證金 ＝ 部位÷倍數 進位（跟 shared/casino/stock_lev.js 的 casLevOpen 壹樣）
  const levSize = m0 => { const z = casLevSizeOf(m0, lev, cur.price); return { qty: z.qty, pos: z.notional, mg: z.margin }; };
  const calc = () => {
    const sz = levSize(Math.min(f.margin || 0, maxMargin)), m = sz.mg, pos = sz.pos, feeAmt = Math.ceil(pos * RT.fee), carry = Math.ceil((long ? pos - m : pos) * (long ? RT.interest : RT.borrow));
    const liq = cur.price * (long ? 1 - L.force / lev : 1 + L.force / lev);
    const stopPx = f.stopOn && f.stop > 0 ? Math.round(cur.price * (long ? 1 - f.stop / 100 : 1 + f.stop / 100) * 100) / 100 : null, takePx = f.takeOn && f.take > 0 ? Math.round(cur.price * (long ? 1 + f.take / 100 : 1 - f.take / 100) * 100) / 100 : null;
    sum.replaceChildren(
      h("summary", null, h("b", null, `部位 ${fmt(pos)}`), h("span", null, `強平價約 ${fp(liq)}`), h("span", { class: "bank-sum-open" }, "點開 ▾")),
      h("p", null, h("span", null, "部位"), h("b", null, `${fmt(pos)}`), h("small", null, ` ＝ ${fmt(sz.qty)} 股 × ${fp(cur.price)}（${lev}× 保證金 ${fmt(m)}）`)),
      h("p", null, h("span", null, "手續費＋" + (long ? "利息" : "借券費")), h("b", null, fmt(feeAmt + carry)), h("small", null, ` （${RT.fee > 0 ? "手續費 " + pctText(RT.fee) : "免手續費"}，${long ? "利息 " + pctText(RT.interest) : "借券費 " + pctText(RT.borrow)}${RT.tax > 0 ? "；平倉另扣當沖證交稅 " + pctText(RT.tax) : ""}）`)),
      h("p", { class: "warn" }, h("span", null, "強制平倉價"), h("b", null, `約 ${fp(liq)}`), h("small", null, ` （保證金剩 ${Math.round(L.force * 100)}% 就平倉）`)),
      stopPx ? h("p", null, h("span", null, "停損價"), h("b", null, fp(stopPx))) : null, takePx ? h("p", null, h("span", null, "停利價"), h("b", null, fp(takePx))) : null);
    return m;
  };
  const m0 = calc();
  const liqPct = L.force / lev * 100; // 強平價離現價幾 %：停損要比這個近
  const stopP = f.stopOn && f.stop > 0 ? Math.round(cur.price * (long ? 1 - f.stop / 100 : 1 + f.stop / 100) * 100) / 100 : null, takeP = f.takeOn && f.take > 0 ? Math.round(cur.price * (long ? 1 + f.take / 100 : 1 - f.take / 100) * 100) / 100 : null;
  const ocoBad = f.stopOn && f.stop >= liqPct ? `停損要比強平價更靠近現價：最多 ${(liqPct - 0.1).toFixed(1)}%。` : "";
  const doOpen = () => bankDo("stock", { op: "open", id: cur.id, dir: f.dir, lev, margin: Math.min(f.margin, maxMargin), stopPct: stopP ? f.stop : null, takePct: takeP ? f.take : null }); // 伺服器照成交價算停損停利價（11-19）
  const open = () => {
    const sz = levSize(Math.min(f.margin, maxMargin)), mg = sz.mg, pos = sz.pos, feeAmt = Math.ceil(pos * RT.fee), carry = Math.ceil((long ? pos - mg : pos) * (long ? RT.interest : RT.borrow)), liq = cur.price * (long ? 1 - L.force / lev : 1 + L.force / lev);
    if (sz.qty < 1) { note("保證金不夠買壹股，加壹點再開。", "bad"); return; }
    confirmTrade(`${long ? "開多單" : "開空單"} ${cur.name} ${lev}×`, [
      ["股數", `${fmt(sz.qty)} 股（每股 ${fp(cur.price)}）`], ["保證金（先扣）", fmt(mg)], ["部位", fmt(pos)], ["手續費＋" + (long ? "利息" : "借券費") + "（約）", fmt(feeAmt + carry)],
      ["強制平倉價（約）", fp(liq), "warn"], stopP ? ["停損價", fp(stopP)] : null, takeP ? ["停利價", fp(takeP)] : null,
      ["今天一定平倉", cur.market === "tw" ? "台股 13:30 前" : "23:30 前"]], long ? "確認開多單" : "確認開空單", doOpen);
  };
  const why = maxLev <= 0 ? (L.usWhy || "這個市場現在不能開槓桿。") : (L.lagWhy && L.lagWhy[cur.id]) ? L.lagWhy[cur.id] : halt ? haltText(S, cur) : L.opensLeft != null && L.opensLeft < 1 ? `今天開倉的筆數用完了（壹天最多 ${L.opensMax || 3} 筆），明天再來。` : maxMargin < 100000 ? (v.cash < 100000 ? "錢不夠付保證金。" : "本金上限到了，先平掉壹些。") : "";
  return [
    seg([["long", "做多 ▲"], ["short", "放空 ▼"]], f.dir, k => { f.dir = k; rerender(); }),
    h("div", { class: "bank-fld" }, h("span", { class: "bank-fl" }, "倍數"), chips(Array.from({ length: Math.max(0, Math.min(10, Math.floor(shownLev))) }, (_, i) => i + 1), lev, n => { f.lev = n; rerender(); }, n => `${n}×`, n => (n > maxLev ? (S.credit && S.credit.nextText) || "信用等級還沒解鎖這個倍數" : ""))),
    h("div", { class: "bank-fld" }, h("span", { class: "bank-fl" }, "保證金"), chips([100000, 500000, 1000000, 5000000].filter(n => n <= maxMargin), Math.min(f.margin, maxMargin), n => { f.margin = n; rerender(); }, n => fmt(n / 10000) + " 萬")),
    numField("自己輸入", f.margin || "", v => { f.margin = v === "" ? 0 : Math.max(0, Math.min(Math.floor(v), maxMargin)); calc(); }, { min: 1, step: 1000, unit: `最多 ${fmt(maxMargin)}` }), // 保證金也可以手動打（11-19 翊文）；打字時只更新算式，按快選才整頁重畫
    sum,
    h("div", { class: "bank-ocos" },
      h("label", { class: "bank-check" }, h("input", { type: "checkbox", checked: f.stopOn ? "" : null, onChange: e => { f.stopOn = e.target.checked; rerender(); } }), "順便設停損"), f.stopOn ? numField("虧", f.stop, x => { f.stop = x || 0; calc(); }, { unit: "% 就賣", min: 0.1, step: 0.5 }) : null,
      h("label", { class: "bank-check" }, h("input", { type: "checkbox", checked: f.takeOn ? "" : null, onChange: e => { f.takeOn = e.target.checked; rerender(); } }), "順便設停利"), f.takeOn ? numField("賺", f.take, x => { f.take = x || 0; calc(); }, { unit: "% 就賣", min: 0.1, step: 0.5 }) : null),
    h("div", { class: "bank-acts one" }, btn(`${long ? "開多單" : "開空單"} ${lev}×`, open, "primary big bank-btn gold", { disabled: why || ocoBad || m0 <= 0 ? true : null })),
    why || ocoBad ? h("p", { class: "bank-why" }, why || ocoBad) : null,
    S.credit ? h("p", { class: "bank-meta sm bank-creditline" }, `信用 ${S.credit.level} 級・最高 ${S.credit.maxLev}×・本金 ${fmt(Math.round(S.credit.posUsed / 10000))} 萬／${fmt(Math.round(S.credit.posLimit / 10000))} 萬`) : null,
    S.credit && S.credit.nextText ? h("p", { class: "bank-meta sm bank-nextunlock" }, S.credit.nextText) : null,
    L.owedText || L.owed > 0 ? h("p", { class: "bank-stale" }, h("b", null, "欠條　"), L.owedText || `今天賺的超過館方當天能賠的上限，還有 ${fmt(L.owed)} 記成欠條，明天補發。`) : null,
    h("p", { class: "bank-meta sm" }, `${L.opensLeft != null ? `今天還能開 ${L.opensLeft} 筆。` : ""}當天一定平倉：${cur.market === "tw" ? "台股 13:30" : "23:30"} 前沒平，系統會替你平。`)];
}
// ---------- 交易：掛單（限價買、限價賣、停損賣） ----------
const KIND_TEXT = { buy: "限價買", sell: "限價賣", stop: "停損賣" };
const expText = d => (d ? String(d).slice(5).replace("-", () => "/") : ""); // 2026-11-17 → 11/17
function orderTrade(v, S, cur) {
  const f = form(), k = f.okind, halt = stockHalt(S, cur);
  if (f.opx === "" || f.opxFor !== cur.id + k) { f.opx = Math.max(0.01, Math.round(cur.price * (k === "buy" ? 0.98 : k === "sell" ? 1.02 : 0.97) * 100) / 100); f.opxFor = cur.id + k; f.on = f.on || 1; }
  const info = h("p", { class: "bank-meta sm" });
  const calc = () => {
    const n = f.on || 0, px = f.opx || 0;
    info.textContent = k === "buy" ? `會先鎖住 ${fmt(Math.ceil(Math.ceil(px * n - 1e-9) * (1 + feeOf(S, cur))))} 籌碼（價格到 ${fmt(px)} 以下才買，成交價照當時的價，多的退回）。`
      : `會先鎖住這 ${fmt(n)} 股（價格到 ${fmt(px)} ${k === "sell" ? "以上" : "以下"}才賣，成交價照當時的價）。`;
    return n > 0 && px > 0;
  };
  const okNow = calc();
  const lockNow = k === "buy" ? Math.ceil(Math.ceil((f.opx || 0) * (f.on || 0) - 1e-9) * (1 + feeOf(S, cur))) : 0, free = k === "buy" ? v.cash : (cur.free != null ? cur.free : cur.mine); // 真資料的 cash 已經扣掉鎖在買單裡的
  const mineHere = (S.orders || []).filter(o => o.id === cur.id).length, px = f.opx || 0, n = f.on || 0;
  const why = halt ? haltText(S, cur) : (S.orderLeft != null ? S.orderLeft < 1 : (S.orders || []).length >= (S.orderMax || 10)) ? `掛著的單滿 ${S.orderMax || 10} 張了，先取消壹些。` : mineHere >= (S.orderPerStock || 3) ? `這支最多掛 ${S.orderPerStock || 3} 張，先取消壹張。`
    : k === "sell" && px <= cur.price ? `賣的價要比現價（${fp(cur.price)}）高，現在就想賣請用「現股」。` : k !== "sell" && px >= cur.price ? `${k === "buy" ? "買" : "停損"}的價要比現價（${fp(cur.price)}）低，現在就想買請用「現股」。`
    : (k === "buy" ? lockNow > free : n > free) ? (k === "buy" ? "錢不夠鎖。" : "你沒有那麼多股可以鎖。") : "";
  return [
    seg([["buy", "限價買"], ["sell", "限價賣", !(cur.free != null ? cur.free : cur.mine)], ["stop", "停損賣", !(cur.free != null ? cur.free : cur.mine)]], k, x => { f.okind = x; f.opx = ""; rerender(); }),
    h("div", { class: "bank-fields" }, numField("跌到", f.opx, x => { f.opx = x; calc(); }, { unit: "就" + (k === "buy" ? "買" : "賣"), min: 0.01, step: 0.01 }), numField("股數", f.on, x => { f.on = x; calc(); }, { unit: "股", min: 1, step: 1 })),
    info,
    h("div", { class: "bank-acts one" }, btn("掛單", () => confirmTrade(`掛單：${KIND_TEXT[k]} ${cur.name}`, [["價格", fp(f.opx)], ["股數", `${fmt(f.on)} 股`], k === "buy" ? ["先鎖住（約）", fmt(Math.ceil(Math.ceil(f.opx * f.on - 1e-9) * (1 + S.fee))), "total"] : ["先鎖住", `${fmt(f.on)} 股`, "total"], ["有效", cur.market === "tw" ? "當天 13:30 前" : cur.market === "in" ? "當天 23:30 前" : "到下一次價格變動"]], "確認掛單", () => bankDo("stock", { op: "order", id: cur.id, kind: k, px: f.opx, n: f.on })), "primary big bank-btn gold", { disabled: why || !okNow ? true : null })),
    why ? h("p", { class: "bank-why" }, why) : null,
    h("p", { class: "bank-meta sm" }, (cur.market === "tw" ? "台股的單當天 13:30 收盤沒成交就取消。" : cur.market === "in" ? "館內股的單當天 23:30 沒成交就取消。" : "") + (S.orderRule || `現股的單最多掛 ${S.orderDays || 3} 天；成交才收手續費，取消全額退回。停盤時不能掛、不能取消。`))];
}
// ---------- 我的部位、掛著的單 ----------
function positionCard(S, p, list) {
  const st = list.find(x => x.id === p.sid) || { name: p.name, price: p.now, market: p.market }, long = p.side === "long", force = S.lev ? S.lev.force : 0.5;
  const price = p.now != null ? p.now : st.price, liq = p.liqPx != null ? p.liqPx : p.liq, danger = p.ratio <= 0.7, meter = Math.max(0, Math.min(1, (p.ratio - force) / (1 - force)));
  // 看得懂賺賠（11-19 翊文：「我的部位可以顯示得更清楚，賺多少%之類的」）：報酬率＝賺賠÷保證金；股價漲跌＝現價對進場；離強平還差幾 %
  const roi = p.margin > 0 ? p.pnl / p.margin * 100 : 0, move = p.entry > 0 && price > 0 ? (price / p.entry - 1) * 100 : 0, toLiq = price > 0 && liq > 0 ? (liq / price - 1) * 100 : 0;
  const sg = v => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}%`;
  return h("div", { class: "bank-pos" + (danger ? " danger" : "") },
    h("div", { class: "bank-pos-h" }, h("b", null, p.name || st.name), h("i", { class: "bank-dir " + (long ? "long" : "short") }, `${long ? "做多" : "放空"} ${p.lev}×`), h("span", { class: "bank-pos-pnl " + (p.pnl > 0 ? "up" : p.pnl < 0 ? "down" : "") }, `${p.pnl > 0 ? "▲ +" : p.pnl < 0 ? "▼ −" : ""}${fmt(Math.abs(p.pnl))}`, h("small", { class: "bank-pos-pct", title: "賺賠占保證金的比例" }, ` ${roi > 0 ? "+" : roi < 0 ? "−" : ""}${Math.abs(roi).toFixed(1)}%`))),
    h("p", { class: "bank-pos-m" }, h("span", null, `保證金 ${fmt(p.margin)}`), h("span", null, `進場 ${fp(p.entry)}`), h("span", null, `現價 ${fp(price)}（`, h("b", { class: "bank-pos-mv " + (move > 0 ? "up" : move < 0 ? "down" : ""), title: "股價比進場價漲或跌（紅漲綠跌，不管做多放空）" }, sg(move)), "）"), h("span", { class: "warn" }, `強平價 ${fp(liq)}（還差 ${Math.abs(toLiq).toFixed(1)}%）`)),
    h("div", { class: "bank-ratio", role: "img", "aria-label": `維持率 ${Math.round(p.ratio * 100)}%` }, h("i", { style: { width: meter * 100 + "%" } }), h("span", null, `維持率 ${Math.round(p.ratio * 100)}%`)),
    danger ? h("p", { class: "bank-why" }, `保證金快不夠了：剩 ${Math.round(force * 100)}% 就會被強制平倉。`) : null,
    h("div", { class: "bank-pos-f" }, h("small", { class: p.stop || p.take ? "has-oco" : "" }, `${p.stop || p.take ? `停損 ${p.stop ? fp(p.stop) : "—"}・停利 ${p.take ? fp(p.take) : "—"}` : `${p.market === "tw" ? "台股 13:30" : "23:30"} 前沒平，系統會替你平`}`),
      btn("停損停利", () => editOco(S, p, price), "small bank-btn", { disabled: stockHalt(S, st) ? true : null }),
      btn("平倉", () => bankDo("stock", { op: "close", pid: p.id }), "small bank-btn gold", { disabled: stockHalt(S, st) ? true : null })));
}
// 改停損停利（op levset：pid、stop、take；沒給的不動，空值或 0 是清掉）。價格，不是百分比
function editOco(S, p, price) {
  const long = p.side === "long", m = miniLayer(`${p.name} 的停損停利`, long ? "做多：停損 < 現價 < 停利。停損要比強平價更靠近現價。" : "放空：停利 < 現價 < 停損。停損要比強平價更靠近現價。");
  const st = { stop: p.stop || "", take: p.take || "" };
  m.card.append(h("p", { class: "bank-meta sm" }, `現價 ${fp(price)}・強平價 ${fp(p.liqPx != null ? p.liqPx : p.liq)}　空著或寫 0 就是不設。`),
    h("div", { class: "bank-fields" }, numField("停損價", st.stop, x => { st.stop = x; }, { min: 0, step: 0.01 }), numField("停利價", st.take, x => { st.take = x; }, { min: 0, step: 0.01 })),
    h("div", { class: "bank-acts bank-pick" }, btn("設定", () => { m.close(); bankDo("stock", { op: "levset", pid: p.id, stop: Number(st.stop) || null, take: Number(st.take) || null }); }, "big bank-btn gold"), btn("取消", () => m.close(), "big bank-btn")));
  closeOnOutside(m);
}
function positionsPanel(S) {
  if (!S.lev) return null;
  const ps = S.positions || [];
  return panel("我的部位", ps.length ? `${ps.length} 筆・當天一定平倉` : "當沖：當天開、當天平", ps.length ? h("div", { class: "bank-poslist" }, ps.map(p => positionCard(S, p, S.list))) : h("p", { class: "bank-empty-dark" }, "目前沒有槓桿或放空的部位。"));
}
function ordersPanel(S) {
  if (!S.orders) return null;
  const os = S.orders, lockText = o => (o.kind === "buy" ? `鎖 ${fmt(o.lock)} 籌碼` : `鎖 ${fmt(o.lockShares != null ? o.lockShares : o.n)} 股`);
  return panel("掛著的單", os.length ? `${os.length}／${S.orderMax || 10} 張${S.cancelLeft != null ? `・今天還能取消 ${S.cancelLeft} 次` : ""}` : "沒有掛單",
    os.length ? h("div", { class: "bank-orders" }, os.map(o => h("div", { class: "bank-order " + (o.state || "") },
      h("span", null, h("i", { class: "bank-kind " + o.kind }, o.kindName || KIND_TEXT[o.kind] || o.kind), h("b", null, o.name || o.id)),
      h("span", { class: "bank-order-d" }, `${o.kind === "sell" ? "≥" : "≤"} ${fp(o.px)} × ${fmt(o.n)} 股`, h("small", null, `${lockText(o)}・現價 ${fp(o.now)}・到 ${expText(o.exp)}${o.market === "in" ? " 23:30" : o.market === "tw" ? " 13:30" : ""}`)),
      btn("取消", () => bankDo("stock", { op: "cancel", no: o.no }), "small bank-btn", { disabled: S.halt ? true : null })))) : h("p", { class: "bank-empty-dark" }, "價格到了你設的數字才會成交，掛好就可以關掉遊戲。"));
}
// 進股票頁：把「價格有變動」的那幾支記下來（畫「新」用），再叫伺服器說我看過了（op seen）。壹分鐘內不重複叫
function markSeen(v, list) {
  const now = Date.now();
  if (now - (UI.bankSeenAt || 0) < 60000) return;
  UI.bankSeenAt = now; UI.bankFreshSnap = new Set(list.filter(x => x.fresh).map(x => x.id));
  UI.bankFresh = 0; if (ADDONS.bankFresh) ADDONS.bankFresh(); // 看過了：導覽圖銀行的「新」清掉（回大廳時重畫）
  if (v.demo || !UI.bankFreshSnap.size) return;
  NET.call("casino", { act: "stock", op: "seen" }).then(r => { if (r && r.bankHall) UI.bankHall = bankHallView(r.bankHall); }).catch(() => {});
}
const dec2 = n => (n == null ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const plBit = (n, pct) => (n == null ? "—" : h("span", { class: "bank-pl " + (n > 0 ? "up" : n < 0 ? "down" : "") }, h("b", null, `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt(Math.abs(n))}`), pct != null ? h("small", null, `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${(Math.abs(pct) * 100).toFixed(2)}%`) : null));
// 持倉：市值／數量、單位成本／總成本、當日變更／總漲跌幅（表頭點壹下切換）
function holdPanel(v, S, list) {
  const hs = list.filter(hasShares), H = UI.bankHold || (UI.bankHold = { a: "total", b: "unit", c: "value" });
  const tog = (k, a, b, la, lb) => h("button", { type: "button", class: "bank-hh", onClick: () => { H[k] = H[k] === a ? b : a; rerender(); }, "aria-label": `切換：${la}、${lb}` }, h("span", null, H[k] === a ? la : lb), h("i", { "aria-hidden": "true" }, "⇄"));
  const sum = (key) => hs.reduce((n, x) => n + (Number(x[key]) || 0), 0), tv = sum("value"), tc = sum("costTotal"), tp = sum("pnl"), td = sum("dayChg");
  const rows = hs.map(s => h("button", { type: "button", class: "bank-row holdings", role: "row", onClick: () => { UI.bankLeft = "market"; UI.bankPV = "trade"; UI.bankStock = list.indexOf(s); rerender(); } },
    h("span", null, h("b", null, s.name), s.market ? h("i", { class: "bank-mk" }, s.market === "tw" ? "台股" : s.market === "us" ? "美股" : "館內") : null),
    h("span", { class: "bank-tab-num" }, H.c === "value" ? fmt(s.value) : sharesText(s)),
    h("span", { class: "bank-tab-num" }, H.b === "unit" ? dec2(s.avgCost) : fmt(s.costTotal)),
    H.a === "day" ? plBit(s.dayChg, s.dayPct) : plBit(s.pnl, s.pnlPct)));
  return panel("持倉", S.taxPct ? `賣出課 ${pctText(S.taxPct)} 證交稅（美股不收）` : "", h("div", { class: "bank-book holdings", role: "table" },
    h("div", { class: "bank-bh", role: "row" }, h("span", null, "名稱"), tog("c", "value", "qty", "市值", "數量"), tog("b", "unit", "total", "單位成本", "總成本"), tog("a", "day", "total", "當日變更", "總漲跌")),
    hs.length ? rows : h("div", { class: "bank-row empty", role: "row" }, h("span", null, "你還沒有持股"), h("span", null, "—")),
    hs.length ? h("div", { class: "bank-row holdings sum", role: "row" }, h("span", null, h("b", null, "合計")), h("span", { class: "bank-tab-num" }, fmt(tv)), h("span", { class: "bank-tab-num" }, fmt(tc)), H.a === "day" ? plBit(td) : plBit(tp, tc > 0 ? tp / tc : null)) : null));
}
function stockPane(v) {
  if (!v.stocks) return soon("股票", "館內五家店和館外股票（跟著真的漲跌）正在準備，開放時館方公告會說。");
  actDone("stockLook"); const S = v.stocks, list = S.list, cur = list[Math.min(UI.bankStock || 0, list.length - 1)];
  list.forEach(x => { if (x.market === "tw" || x.market === "in" || x.market === "us") x.session = twSess(S, x); });
  markSeen(v, list);
  const inShop = cur.market === "in"; // 館內股只有現股
  const tabs = [["spot", "現股"]].concat(S.lev ? [["lev", "槓桿・放空"]] : [], S.orders ? [["order", "掛單"]] : []);
  const tab = tabs.some(t => t[0] === UI.bankTrade) ? UI.bankTrade : "spot";
  const phone = window.innerWidth < 761 || window.innerHeight < 501;
  const left = UI.bankLeft === "hold" ? "hold" : "market";
  const marketPanel = panel("行情", `手續費 ${S.feeTw != null ? `台股 ${feeWord(S.feeTw)}、美股 ${feeWord(S.feeUs)}、館內股 ${feeWord(S.fee)}` : feeWord(S.fee)}${S.feePaid ? `・累計付過 ${fmt(S.feePaid)}` : ""}`, ledger(["名稱", "遊戲價", "今天", "持股"], stockRows(list, cur, S), "stocks"));
  const table = h("div", { class: "bank-leftcol" }, seg([["market", "行情"], ["hold", "持倉"]], left, k => { UI.bankLeft = k; rerender(); }, "kind"),
    left === "hold" ? holdPanel(v, S, list) : marketPanel);
  const stackEl = h("div", { class: "bank-stack" },
      panel(cur.name, cur.line,
        h("div", { class: "bank-quote" }, num("big", fp(cur.price)), cur.market === "us" ? h("small", { class: "bank-cur" }, usTwd(cur) ? "台幣" : "籌碼") : null, upDown(cur.chg, true),
          usdText(cur) ? h("span", { class: "bank-usd", title: "外面那支美股現在的美金價格" }, usdText(cur)) : null),
        cur.real ? h("p", { class: "bank-meta sm bank-realline" }, "真實：外面那支股票今天的漲跌。", realBit(cur), cur.mult ? h("small", null, `　遊戲價＝真實價 × ${mulText(cur)}，每分鐘跟著更新。`) : null) : null,
        cur.market === "in" && cur.cap ? h("p", { class: "bank-meta sm bank-mktline" }, `資本額 ${fmt(cur.cap)}（發行 ${fmt(cur.shares)} 股）・今天旅客散客成交 ${fmt(cur.vol || 0)} 股，淨${(cur.net || 0) >= 0 ? "買" : "賣"} ${fmt(Math.abs(cur.net || 0))} 股・旅客心裡的合理價 ${fmt(cur.fv)}（照昨天的人數、營收調；價格比它高，旅客就賣、比它低就買）`) : null,
        cur.div ? h("p", { class: "bank-meta sm bank-divline" }, `${cur.div.future ? "下次除息" : "最近除息"} ${String(cur.div.ex).slice(5)}，每股配 ${fp(cur.div.each)}（除息日開始時持有才領；股利所得稅 ${cur.market === "us" ? "30" : "30.11"}%）`) : null,
        chart(cur),
        cur.stale ? h("p", { class: "bank-stale" }, h("b", null, "未更新　"), cur.stale) : null,
        cur.market === "in" && cur.quiet ? h("p", { class: "bank-stale" }, h("b", null, "開盤沒跳空　"), "昨天來這家店的人太少，今天開盤價跟昨天收盤一樣（盤中照樣會小幅變動）。") : null,
        cur.market === "in" && cur.jump ? h("p", { class: "bank-stale" }, h("b", null, "開盤跳空　"), "今天開盤價跟昨天收盤差了壹截，是昨天的生意帶出來的。") : null,
        hasShares(cur) ? h("p", { class: "bank-meta" }, "你有 ", h("b", null, sharesText(cur)), "，現在值 ", h("b", null, fmt(cur.value)), cur.locked ? h("small", { class: "bank-lockn" }, `（${fmt(cur.locked)} 股鎖在賣單裡）`) : null) : h("p", { class: "bank-meta" }, "你還沒有這支。"),
        tabs.length > 1 ? seg(tabs, tab, k => { UI.bankTrade = k; rerender(); }, "kind") : null,
        tab === "lev" ? levTrade(v, S, cur) : tab === "order" ? orderTrade(v, S, cur) : spotTrade(v, S, cur),
        h("p", { class: "bank-hint" }, cur.real ? cur.mult ? `遊戲價＝真實價 × ${mulText(cur)}，每分鐘跟著真實行情更新，所以遊戲和真實的漲跌幅一樣。抓不到新價超過 3 分鐘會暫停買賣、標「未更新」。買賣各收手續費，進博物館資金。` : "遊戲價＝真實價 × 倍數，每分鐘跟著真實行情更新。買賣各收手續費，進博物館資金。" : "股價照真實市場的行情動。買賣各收手續費，進博物館資金。"),
        cur.market === "in" && S.inCap != null ? h("p", { class: "bank-hint" }, `每家最多持有 ${fmt(S.inCap)} 股。${S.inRule || ""}`) : null,
        S.soon ? h("p", { class: "bank-hint" }, S.soon) : null),
      debtPanel(v), positionsPanel(S), ordersPanel(S), tradesPanel(S.trades, "std"));
  if (phone) {
    const pv = UI.bankPV === "market" || UI.bankPV === "hold" ? UI.bankPV : "trade";
    return h("div", { class: "bank-cols stocks phone", dataset: { trade: tab, pv } }, seg([["trade", "交易"], ["market", "行情"], ["hold", "持倉"]], pv, k => { UI.bankPV = k; rerender(); }, "kind"), pv === "trade" ? stackEl : pv === "market" ? marketPanel : holdPanel(v, S, list));
  }
  return h("div", { class: "bank-cols stocks", dataset: { trade: tab } }, table, stackEl);
}
// 世界市場（遊戲內版本的世界股市新聞，每天由劇情排程寫；PR 339）。標題最多 14 字、壹句話最多 40 字、沒有數字；refs 是遊戲裡的股票名，點了跳去那支
const TONE_MARK = { up: ["▲", "up"], down: ["▼", "down"], flat: ["－", ""] };
function goStock(v, id) {
  const list = v.stocks ? v.stocks.list : [], i = list.findIndex(x => x.id === id);
  if (i < 0) return;
  UI.bankTab = "stock"; UI.bankGrp = "std"; UI.bankStock = i; UI.bankPV = "trade"; rerender();
}
const isPhone = () => window.innerWidth < 761 || window.innerHeight < 501;
// 手機：把壹塊收成壹行，點開才看（電腦照舊整塊畫）
const fold = (title, node) => (isPhone() && node ? h("details", { class: "bank-fold" }, h("summary", null, h("b", null, title), h("span", null, "點開 ▾")), node) : node);
// 電腦也要收折的（館方投資：表很長，世界市場要在上面）：預設收著，點開才看
const foldAlways = (title, node) => (node ? h("details", { class: "bank-fold" }, h("summary", null, h("b", null, title), h("span", null, "點開 ▾")), node) : node);
function worldPanel(v) {
  const W = v.world;
  if (!W) return null;
  const days = Array.isArray(W.days) ? W.days.filter(d => d && Array.isArray(d.items) && d.items.length) : [];
  if (!days.length) return panel("世界市場", "每天由館方整理", h("p", { class: "bank-empty-dark" }, "今天還沒有世界市場的消息。"));
  return panel("世界市場", "海外的股市消息，不寫數字",
    // 11-16 翊文：「世界市場寫今天的展開，其他天的收折」：電腦也收（原本只有手機收）
    h("div", { class: "bank-worlddays" }, days.map((d, di) => h(di > 0 ? "details" : "section", { class: "bank-wday" + (di > 0 ? " old" : "") },
      h(di > 0 ? "summary" : "h4", { class: "bank-wd" }, di === 0 ? `${String(d.day || "").slice(5)} 最新` : String(d.day || "").slice(5) + "　點開 ▾"),
      h("ul", { class: "bank-world" }, d.items.map(it => { const m = TONE_MARK[it.tone] || TONE_MARK.flat; return h("li", { class: "tone-" + (it.tone || "flat") },
        h("i", { class: "bank-tone " + m[1], "aria-hidden": "true" }, m[0]),
        h("span", null, h("b", null, it.title), h("small", null, it.line),
          it.refs && it.refs.length ? h("span", { class: "bank-refs" }, it.refs.map(r => h("button", { type: "button", class: "bank-ref", onClick: () => goStock(v, r.id), "aria-label": `看 ${r.name}` }, r.name))) : null)); }))))));
}
// 館方投資（翊文 11-14：「館方也有投資海外，銀行裡怎麼我們看不到」）：數值平衡 PR 445 的 houseInv。昨天的快照，不是現在，所以標「截至」
const PAUSE_TEXT = { stop: "館方虧太多，暫停買進", world: "已知世界資金吃緊，暫停買進" };
const POOL_TEXT = { house: "莊家", budget: "博物館資金" };
// 館方投資的「投資方式」告示（11-16 翊文：「館方投資的新策略寫在館方投資那欄裡做壹個小圖示可以點出來出現壹個告示讓玩家看」；決定 0099）：數字都讀 NUM.casino.invest，改設定告示跟著變
const wanText = n => (n >= 100000000 ? `${+(n / 100000000).toFixed(1)} 億` : `${fmt(Math.round(n / 10000))} 萬`);
function openInvestHow() {
  const C = NUM.casino.invest, m = miniLayer("館方怎麼投資", "館方拿閒錢買館外的股票。白話說明，數字照現在的設定。");
  m.card.classList.add("bank-how");
  closeOnOutside(m);
  const even = C.mode !== "chase", li = (...k) => h("li", null, ...k);
  m.card.append(h("ul", { class: "bank-how-l" },
    even ? li(h("b", null, "平均買全部　"), "每天把能動用的錢（莊家超過 ", wanText(C.reserve), "、博物館資金超過 ", wanText(C.budgetKeep), "的部分，每天約 ", String(C.dailyPct), "%）平均分給全部館外股票，不挑熱門、不追高。")
      : li(h("b", null, "追漲　"), "每天挑最近 ", String(C.lookback), " 天漲最多的 ", String(C.topN), " 支多買。"),
    even && C.dip ? li(h("b", null, "跌了多買　"), "某支的價格比館方自己最近 ", String(C.dip.days), " 次的平均成本低 ", String(C.dip.pct), "% 以上，那支這天多買 ", String(C.dip.mult), " 倍。") : null,
    li(h("b", null, C.stopLossPct > 0 || C.takeProfitPct > 0 ? "停損停利　" : "不停損、不停利　"), C.stopLossPct > 0 || C.takeProfitPct > 0 ? `比成本跌 ${C.stopLossPct}% 賣一半、漲 ${C.takeProfitPct}% 賣三分之一。` : "跌了不賣，漲了也不急著賣，抱著等。"),
    li(h("b", null, "虧太多才停手　"), "整體虧超過 ", String(C.stopPct), "%，暫停買進 ", String(C.stopDays), " 天；已知世界資金吃緊時也先暫停。"),
    li(h("b", null, "不押太重　"), "持股成本合計最多是能動用的錢的 ", String(C.holdCapPct), "%。"),
    li(h("b", null, "延遲壹天公開　"), "你看到的是昨天的快照，不是現在，所以不能用它跟著買賣套利。")),
    h("h4", null, "為什麼這樣投"),
    h("p", null, "長期平均買，不賭哪壹支會漲；比自己的平均成本便宜時多買壹點，不在高點追；不在低點賣出去，跌了也撐得住。"),
    h("p", { class: "bank-hint" }, "短期幾天看到帳面虧損是正常的，看的是壹段時間下來的結果。"),
    h("div", { class: "bank-how-acts" }, btn("知道了", () => m.close(), "primary")));
}
function houseInvPanel(v) {
  const I = v.houseInv;
  if (!I) return null; // 第一份日報產生前沒有快照
  const plc = n => (n > 0 ? "up" : n < 0 ? "down" : ""), money = n => (n < 0 ? "−" : n > 0 ? "+" : "") + fmt(Math.abs(Math.round(n))), pct = n => (n == null ? "" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${(Math.abs(n) * 100).toFixed(1)}%`);
  const hold = Array.isArray(I.hold) ? I.hold : [], ys = Array.isArray(I.yesterday) ? I.yesterday : [];
  const paused = Object.keys(I.paused || {}).map(k => `${POOL_TEXT[k] || k}：${PAUSE_TEXT[I.paused[k]] || "暫停買進"}`);
  const empty = !hold.length && !ys.length;
  return panel("館方投資", h("span", null, `截至 ${String(I.asOf || "").slice(5).replace("-", () => "/")}（昨天的資料，不是現在）`, btn([icon("scroll"), " 投資方式"], openInvestHow, "ghost small bank-howbtn", { title: "館方怎麼投資：白話說明" })),
    empty ? h("p", { class: "bank-empty" }, "館方還沒有投資。") : [
      h("div", { class: "bank-invsum" },
        h("p", null, h("span", null, "總成本"), h("b", null, fmt(I.cost))), h("p", null, h("span", null, "總市值"), h("b", null, fmt(I.value))),
        h("p", null, h("span", null, "帳面損益"), h("b", { class: plc(I.pnl) }, `${money(I.pnl)} ${pct(I.pnlPct)}`)),
        h("p", null, h("span", null, "累計賺賠"), h("b", { class: plc(I.pnlTotal) }, money(I.pnlTotal)))),
      paused.length ? h("p", { class: "bank-stale" }, h("b", null, "暫停　"), paused.join("；")) : null,
      hold.length ? ledger(["持有", "股數", "市值", "損益"], hold.map(x => h("div", { class: "bank-row inv", role: "row" },
        h("span", null, h("b", null, x.name)), h("span", { class: "bank-tab-num" }, `${fmt(x.n)} 股`), h("span", { class: "bank-tab-num" }, fmt(x.value)),
        h("span", { class: "bank-pl " + plc(x.pnl) }, h("b", null, money(x.pnl)), h("small", null, pct(x.pnlPct))))), "inv") : null,
      h("div", { class: "bank-invy" }, h("b", null, (I.spent > 0 ? `昨天買賣（用掉 ${fmt(I.spent)}）` : "昨天買賣")),
        ys.length ? h("ul", null, ys.map(y => h("li", null, h("i", { class: "bank-dir " + (y.side === "buy" ? "long" : "short") }, y.side === "buy" ? "買進" : "賣出"), ` ${y.name} ${fmt(y.n)} 股${y.px > 0 ? `・成交價 ${fp(y.px)}` : ""}`))) : h("p", { class: "bank-meta sm" }, "昨天沒有買賣。"))]);
}
// 昨天館外來客帶進多少錢（11-15，翊文：「可以銀行的財報之類的地方看到嗎？要分類一下」）
// 資料 e.ext（伺服器日報快照，昨天的）：{ ticket:{hall,crowd}, shop:{food,bj,craft,cellar,job}, shopCrowd:{同上}, total, people:{npc,crowd}, menu:[{id,name,npc,crowd}], orders:[{who,item,name,n}] }
// 沒有 ext（正式站要等下次 05:00 日報）：寫「明天早上才有」，不留空洞
const EXT_SHOP = [["food", "餐車"], ["bj", "21 點"], ["craft", "手作"], ["cellar", "地下"], ["job", "工作"]];
// 今天到目前館外來客花了多少（決定 0098）：伺服器結到現在；只有合計、不分店（各店的花費是隔天館內股跳空的壹部分）
function todayPanel(t) {
  if (!t) return panel("今天到目前", "每次打開重新算", h("p", { class: "bank-empty" }, "今天還沒有資料。"));
  const tk = t.ticket || {}, pe = t.people || {}, max = Math.max(1, tk.hall || 0, tk.crowd || 0, t.shop || 0);
  const row = (label, n) => h("div", { class: "bank-ext-row", role: "row" }, h("span", { class: "bank-ext-l" }, label), h("span", { class: "bank-ext-bar", "aria-hidden": "true" }, h("i", { style: { width: Math.round(((n || 0) / max) * 100) + "%" } })), h("span", { class: "bank-ext-n bank-tab-num" }, fmt(n || 0)));
  return panel("今天到目前", "有名字的旅客＋散客，每次打開重新算",
    h("div", { class: "bank-quote" }, num("big", fmt(t.total || 0)), h("small", null, `旅客 ${fmt(pe.npc || 0)} 位・散客 ${fmt(pe.crowd || 0)} 位`)),
    h("div", { class: "bank-ext-cols" }, h("div", { class: "bank-ext-g" }, h("div", { class: "bank-ext-gh" }, h("b", null, "門票"), h("span", { class: "bank-tab-num" }, fmt((tk.hall || 0) + (tk.crowd || 0)))), row("有名字的旅客", tk.hall), row("散客", tk.crowd)),
      h("div", { class: "bank-ext-g" }, h("div", { class: "bank-ext-gh" }, h("b", null, "店裡消費"), h("span", { class: "bank-tab-num" }, fmt(t.shop || 0))), row("全部店合計", t.shop))),
    h("p", { class: "bank-meta sm" }, "只算館外來客；館友自己的消費、每家店分開的數字不公開。"));
}
// 「這份是哪一天的帳」（11-16，翊文／數值平衡：財報停在前一天要看得出來）：日期不是昨天就用警告色
function dayTag(day, want) { // want：這份帳應該是哪壹天的（沒給＝昨天）
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(day || ""));
  if (!m) return null;
  const old = String(day) !== (want || addDays(todayStr(), -1));
  return h("span", { class: "bank-day" + (old ? " warn" : ""), title: old ? "這份帳不是昨天的，可能還沒更新" : "這份帳的日期" }, ` ${+m[2]}/${+m[3]} 的帳`, old ? "（舊的）" : "");
}

// 全館的帳（11-16 翊文：「把館內的這幾個帳都放在銀行館內經濟可以展開來看」）：資料 e.books（數值平衡，日報寫回時寫，延遲壹天、整天不變）
// { day, bankroll, budget, museum, sea, world（現在的餘額；world 沒有帳是 null）, d: { 各帳比前壹份日報多少 }, top: { 各帳昨天進出最大最多 3 筆 [{ label, n }] } }
const BOOK_LIST = [["bankroll", "莊家", "Yuga Bot 的賭場錢：牌桌、館內股、免費大禮包、借款"], ["budget", "博物館資金", "館方行政：拚經濟、投資、還館債"], ["museum", "修繕基金", "門票七成，之後修繕和預算公投"], ["gov", "稅收", "證交稅、營業稅、娛樂稅；館方還沒決定怎麼用"], ["sea", "海底", "B4 水面底下，沉掉的錢"], ["world", "已知世界", "旅客散客、各集團、文化部、館債；每天照台灣 GDP 年增率成長（只增加已知世界，不給玩家）"], ["ext", "海外（真實市場）", "館外股票的買賣、股利、館方投資；負數＝館友在真實市場賺回來的，比投出去的多"], ["gb", "佩佩銀行準備金", "集團存進來的錢、借出去之前的錢（跟莊家分開）；集團的存款和放款記在日報"]];
// live：現在的餘額（伺服器 casBooksLive）；有就把大數字換成即時的，下面寫「05:00 起」多了少了多少、「昨天」照日報
function booksPanel(b, live) {
  if (!b || typeof b !== "object") return null;
  const sgn = n => (n < 0 ? "−" : n > 0 ? "+" : "") + fmt(Math.abs(Math.round(n))), cls = n => (n > 0 ? "up" : n < 0 ? "down" : "");
  const L = live && typeof live === "object" ? live : null;
  return panel("全館的帳", h("span", null, L ? "每個帳壹列，餘額是現在的；點開看昨天最大的進出" : "每個帳壹列，點開看昨天最大的進出", dayTag(b.day, todayStr())), // 日報那份是今天 05:00 記的（11-17：以前拿去跟昨天比，每天都標「舊的」）
    h("div", { class: "bank-books" }, BOOK_LIST.map(([k, name, who]) => {
      const now = L && L[k] != null ? L[k] : null, bal0 = b[k], bal = now != null ? now : bal0, since = now != null && bal0 != null ? now - bal0 : 0, d = b.d && Number.isFinite(+b.d[k]) ? +b.d[k] : 0, top = b.top && Array.isArray(b.top[k]) ? b.top[k].slice(0, 3) : [];
      if (bal == null) return h("div", { class: "bank-book-row none" }, h("span", { class: "bank-book-n" }, h("b", null, name), h("small", null, who)), h("span", { class: "bank-book-v dim" }, "還沒有帳"));
      return h("details", { class: "bank-book-row" },
        h("summary", null, h("span", { class: "bank-book-n" }, h("b", null, name), h("small", null, who)), h("span", { class: "bank-book-v" }, h("b", { class: "bank-tab-num" }, bal < 0 ? "−" + fmt(-bal) : fmt(bal)), now != null && bal0 != null ? h("i", { class: "bank-tab-num " + cls(since) }, since ? "05:00 起 " + sgn(since) : "05:00 起持平") : null, h("i", { class: "bank-tab-num " + cls(d) }, d ? "昨天 " + sgn(d) : "昨天持平"), h("em", { "aria-hidden": "true" }, "▾"))),
        h("ul", { class: "bank-book-top" }, top.length ? top.map(x => h("li", null, h("span", null, String(x.label || "")), h("b", { class: "bank-tab-num " + cls(x.n) }, sgn(+x.n || 0)))) : [h("li", { class: "dim" }, "昨天沒有可列的進出")]));
    })));
}
function extPanel(e) {
  const x = e && e.ext;
  if (!x) return panel("昨天館外來客花了多少", "每天 05:00 結算", h("p", { class: "bank-empty" }, "這份帳明天早上 05:00 才有。"));
  const tk = x.ticket || {}, sh = x.shop || {}, sc = x.shopCrowd || {}, pe = x.people || {};
  const ticketSum = (tk.hall || 0) + (tk.crowd || 0), shopSum = EXT_SHOP.reduce((n, [k]) => n + (sh[k] || 0), 0);
  const max = Math.max(1, ...[tk.hall, tk.crowd, ...EXT_SHOP.map(([k]) => sh[k])].map(n => n || 0));
  const row = (label, n, sub) => h("div", { class: "bank-ext-row", role: "row" }, h("span", { class: "bank-ext-l" }, label), h("span", { class: "bank-ext-bar", "aria-hidden": "true" }, h("i", { style: { width: Math.round(((n || 0) / max) * 100) + "%" } })),
    h("span", { class: "bank-ext-n bank-tab-num" }, fmt(n || 0), sub ? h("small", null, sub) : null));
  const group = (title, sum, ...rows) => h("div", { class: "bank-ext-g" }, h("div", { class: "bank-ext-gh" }, h("b", null, title), h("span", { class: "bank-tab-num" }, fmt(sum))), ...rows);
  const menu = (x.menu || []).filter(m => (m.npc || 0) + (m.crowd || 0) > 0), orders = x.orders || [];
  return panel("昨天館外來客花了多少", h("span", null, "有名字的旅客＋散客，每天 05:00 結算", dayTag(x.day || e.day)),
    h("div", { class: "bank-quote" }, num("big", fmt(x.total || 0)), h("small", null, `旅客 ${fmt(pe.npc || 0)} 位・散客 ${fmt(pe.crowd || 0)} 位`)),
    h("div", { class: "bank-ext-cols" },
      group("門票", ticketSum, row("有名字的旅客", tk.hall), row("散客", tk.crowd)),
      group("店裡消費", shopSum, ...EXT_SHOP.filter(([k]) => sh[k]).map(([k, n]) => row(n, sh[k], sc[k] ? `散客 ${fmt(sc[k])}` : "")))),
    menu.length || orders.length ? h("details", { class: "bank-ext-more" }, h("summary", null, h("b", null, "餐車賣了什麼"), h("span", null, "點開 ▾")),
      menu.length ? h("ul", { class: "bank-who" }, menu.map(m => h("li", null, h("b", null, m.name), ` ${fmt((m.npc || 0) + (m.crowd || 0))} 份（旅客 ${fmt(m.npc || 0)}・散客 ${fmt(m.crowd || 0)}）`))) : null,
      orders.length ? h("ul", { class: "bank-who" }, orders.map(o => h("li", null, h("b", null, o.who), ` 點了 ${o.name}${o.n > 1 ? " ×" + o.n : ""}`))) : null) : null);
}
// 已知世界（世界經濟 W5，翊文同意第 8 題）：只看整體分布，不列每家的數字（免得洩漏股價方向）。資料 e.world（沒有＝下次換日才有）：
// { day, states: { normal, cut, squeeze, layoff 各幾個集團 }, bands: [4 格：<0.75、0.75～0.9、0.9～1.1、≥1.1 各幾個], avgMult: NPC 預算倍率平均（0.3～1.1）, events: [{ day, text }] }
const WLD_STATE = ["normal", "cut", "squeeze", "layoff"], WLD_BAND = ["tight", "weak", "normal", "strong"], WLD_UNREST = ["calm", "stir", "uneasy", "turmoil"];
// 集團之間的往來（決定 0120）：本週累計＋目前欠金融集團的。資料 v.bankHall.trade ＝ { since, rows: [{ k, label, from, to, n }], loans: [{ name, amt, day }] }
function tradeSec(t) {
  if (!t) return null;
  // 先照種類加總（貨款、放款、利息…壹行壹種、大的在前），點開才看那壹種是誰付給誰（翊文 11-18：往來變多，壹列列太長）
  const kinds = new Map(); for (const x of t.rows || []) { const g = kinds.get(x.k) || { k: x.k, label: x.label || x.k, n: 0, list: [] }; g.n += x.n; g.list.push(x); kinds.set(x.k, g); }
  const groups = [...kinds.values()].sort((a, b) => b.n - a.n), loans = t.loans || [], total = groups.reduce((n, g) => n + g.n, 0);
  return h("div", { class: "bank-wld-sec" }, h("b", null, "集團之間的往來"), h("small", { class: "bank-meta sm" }, `　本週（${String(t.since || "").slice(5).replace("-", () => "/")} 起）累計，整天陸續入帳`),
    groups.length ? h("div", { class: "bank-trade" }, groups.map(g => h("details", { class: "bank-trade-k" },
      h("summary", null, h("b", null, g.label), h("small", null, `${g.list.length} 筆`), h("span", { class: "bank-tab-num" }, fmt(g.n)), h("i", { class: "bank-trade-bar", "aria-hidden": "true" }, h("u", { style: { width: Math.max(3, Math.round(g.n / Math.max(1, total) * 100)) + "%" } })), h("em", { "aria-hidden": "true" }, "點開 ▾")),
      h("ul", { class: "bank-who" }, g.list.slice().sort((a, b) => b.n - a.n).map(x => h("li", null, `${x.fromName} → ${x.toName}　`, h("span", { class: "bank-tab-num" }, fmt(x.n)))))))) : h("p", { class: "bank-meta sm" }, "這週還沒有往來。"),
    h("p", { class: "bank-meta sm" }, loans.length ? "還欠金融集團：" + loans.map(l => `${l.name} ${fmt(l.amt)}（${String(l.day || "").slice(5).replace("-", () => "/")} 借）`).join("、") : "目前沒有集團欠金融集團的錢。"));
}
function outsidePanel(e, trade) {
  const w = e && e.world;
  if (!w) return panel("已知世界", "每天 05:00 結算", h("p", { class: "bank-empty" }, "這份帳明天早上 05:00 才有。"));
  const states = statCounts("unitState", w.states, WLD_STATE), bands = Array.isArray(w.bands) ? statCounts("unitHealth", Object.fromEntries(WLD_BAND.map((k, i) => [k, w.bands[i]])), WLD_BAND) : [];
  const unrest = Array.isArray(w.unrestBands) ? statCounts("unitUnrest", Object.fromEntries(WLD_UNREST.map((k, i) => [k, w.unrestBands[i]])), WLD_UNREST) : [];
  const mult = Math.max(0.3, Math.min(1.1, +w.avgMult || 0)), events = Array.isArray(w.events) ? w.events : [];
  return panel("已知世界", h("span", null, "整體的樣子，不列每家的數字", dayTag(w.day || e.day)),
    h("div", { class: "bank-wld-sec" }, h("b", null, "各集團現在的狀態"), statBar(states), statLegend(states)),
    bands.length ? h("div", { class: "bank-wld-sec" }, h("b", null, "集團景氣分布"), statBands(bands)) : null,
    unrest.length ? h("div", { class: "bank-wld-sec" }, h("b", null, "集團的人心"), statBands(unrest)) : null,
    Array.isArray(w.markets) && w.markets.length ? h("div", { class: "bank-wld-sec" }, h("b", null, "各行業的景氣"), Array.isArray(w.marketSummary) && w.marketSummary.length ? h("p", { class: "bank-mk-sum" }, w.marketSummary.join("")) : null, h("ul", { class: "bank-who" }, w.markets.map(m => h("li", null, h("b", null, m.name), " ", h("span", { class: "bank-mood " + (m.tone === "good" ? "up" : m.tone === "bad" || m.tone === "warn" ? "down" : "") }, m.label), m.prev && m.prev !== m.band ? h("small", { class: "bank-mk-tr" }, ["low", "cool", "plain", "warm", "hot"].indexOf(m.band) > ["low", "cool", "plain", "warm", "hot"].indexOf(m.prev) ? " ↑比上週熱" : " ↓比上週冷") : null)))) : null,
    w.mood ? h("div", { class: "bank-wld-sec" }, h("b", null, "展廳的散客氣氛", " ", statBadge(statView("crowdMood", null, +w.mood.v), { kind: "crowdMood", hint: true }))) : null,
    h("div", { class: "bank-wld-sec" }, h("b", null, "館外 NPC 的花錢力道", " ", statBadge(statView("budgetMult", null, mult), { kind: "budgetMult", hint: true })),
      h("div", { class: "bank-gauge", role: "img", "aria-label": `預算倍率 ${mult.toFixed(2)}` }, h("i", { style: { left: Math.round(((mult - 0.3) / 0.8) * 100) + "%" } })),
      h("div", { class: "bank-gl" }, h("span", null, "縮手 0.3"), h("span", { class: "bank-tab-num" }, `目前 ${mult.toFixed(2)} 倍`), h("span", null, "放手 1.1"))),
    tradeSec(trade),
    h("div", { class: "bank-wld-sec" }, h("b", null, "這週換了狀態的"),
      events.length ? h("ul", { class: "bank-who" }, events.slice(0, 6).map(x => h("li", null, h("small", { class: "bank-tab-num" }, String(x.day || "").slice(5).replace("-", () => "/") + "　"), String(x.text || "")))) : h("p", { class: "bank-meta sm" }, "這週沒有換狀態的。")));
}
function reportPane(v) {
  const e = v.econ, world = worldPanel(v);
  if (!e) return h("div", { class: "bank-cols" }, panel("館內經濟", "每天 05:00 結算昨天", h("p", { class: "bank-empty" }, "館內的帳每天 05:00 結算昨天，今天的還沒出來。")), h("div", { class: "bank-stack" }, world, fold("已知世界", outsidePanel(e, v.bankHall && v.bankHall.trade)), foldAlways("館方投資", houseInvPanel(v))));
  const tone = e.idx > 0.3 ? "好" : e.idx < -0.3 ? "差" : "普通";
  return h("div", { class: "bank-cols report" },
    h("div", { class: "bank-stack" },
      panel("今天的館內經濟", "每天 05:00 結算昨天",
        h("div", { class: "bank-quote" }, num("big", fmt(e.gdp)), upDown(e.growth, true), h("span", { class: "bank-mood " + (e.idx > 0.3 ? "up" : e.idx < -0.3 ? "down" : "") }, `景氣 ${tone}`)),
        h("div", { class: "bank-gauge", role: "img", "aria-label": `景氣 ${tone}` }, h("i", { style: { left: 50 + e.idx * 50 + "%" } })), h("div", { class: "bank-gl" }, h("span", null, "差"), h("span", null, "普通"), h("span", null, "好")),
        h("p", { class: "bank-meta sm" }, "館內 GDP（標準活動值）；成長是近 7 天對前 7 天；上面的條是景氣（差、普通、好）"),
        h("p", { class: "bank-line" }, e.news)),
      foldAlways("全館的帳", booksPanel(e.books, v.live)),
      fold("今天到目前", todayPanel(v.today)),
      fold("昨天館外來客花了多少", extPanel(e)),
      fold("昨天發生的事", panel("昨天發生的事", "", ledger(["項目", "數字"], e.report.length ? e.report.map(r => h("div", { class: "bank-row two", role: "row" }, h("span", null, r[0]), h("span", { class: "bank-tab-num" }, r[1]))) : [h("div", { class: "bank-row two", role: "row" }, h("span", null, "還沒有紀錄"), h("span", null, "—"))]))),
      foldAlways("館方投資", houseInvPanel(v))), // 館方投資在左邊（翊文 11-15：「館方投資移到左邊」），世界市場在中間
    h("div", { class: "bank-stack" }, world, fold("已知世界", outsidePanel(e, v.trade)),
      v.stocks && v.stocks.maker ? fold("莊家和投資人在買什麼", panel("莊家和投資人在買什麼", "他們的買賣大家都看得到", h("ul", { class: "bank-who" }, (v.stocks.maker || []).map(x => h("li", null, h("b", null, x.who), x.does))))) : null));
}
// 集團股的掛單（決定 0124）：限價買、限價賣、停損賣；單當天有效，買單鎖籌碼、賣單鎖股數。op order／cancel（取消要帶 id 和 no）
function gsOrderTrade(v, S, G, cur) {
  const f = form(), k = f.okind, halt = !!G.halt, fee = cur.fee != null ? cur.fee : S && S.fee != null ? S.fee : 0.005, free = cur.free != null ? cur.free : cur.mine;
  if (f.opx === "" || f.opxFor !== cur.id + k) { f.opx = Math.max(0.01, Math.round(cur.price * (k === "buy" ? 0.98 : k === "sell" ? 1.02 : 0.97) * 100) / 100); f.opxFor = cur.id + k; f.on = f.on || 1; }
  const info = h("p", { class: "bank-meta sm" }), lockOf = (px, n) => Math.ceil(Math.ceil(px * n - 1e-9) * (1 + fee));
  const calc = () => { const n = f.on || 0, px = f.opx || 0; info.textContent = k === "buy" ? "會先鎖住 " + fmt(lockOf(px, n)) + " 籌碼（價格到 " + fmt(px) + " 以下才買，成交價照當時的價，多的退回）。" : "會先鎖住這 " + fmt(n) + " 股（價格到 " + fmt(px) + (k === "sell" ? " 以上" : " 以下") + "才賣，成交價照當時的價）。"; };
  calc();
  const px = f.opx || 0, n = f.on || 0;
  const why = halt ? "停盤中，等開盤再掛單。" : !(n > 0 && px > 0) ? "價格和股數要填。" : k === "sell" && px <= cur.price ? "賣的價要比現價（" + fp(cur.price) + "）高，現在就想賣請用「現股」。" : k !== "sell" && px >= cur.price ? (k === "buy" ? "買" : "停損") + "的價要比現價（" + fp(cur.price) + "）低，現在就想買請用「現股」。"
    : k === "buy" ? (lockOf(px, n) > v.cash ? "錢不夠鎖。" : "") : n > free ? "你沒有那麼多股可以鎖。" : "";
  return [
    seg([["buy", "限價買"], ["sell", "限價賣", !free], ["stop", "停損賣", !free]], k, x => { f.okind = x; f.opx = ""; rerender(); }),
    h("div", { class: "bank-fields" }, numField("價格", f.opx, x => { f.opx = x; calc(); }, { unit: k === "buy" ? "以下就買" : "就賣", min: 0.01, step: 0.01 }), numField("股數", f.on, x => { f.on = x; calc(); }, { unit: "股", min: 1, step: 1 })),
    info,
    h("div", { class: "bank-acts one" }, btn("掛單", () => confirmTrade("掛單：" + KIND_TEXT[k] + " " + cur.name, [["價格", fp(f.opx)], ["股數", fmt(f.on) + " 股"], k === "buy" ? ["先鎖住（約）", fmt(lockOf(f.opx, f.on)), "total"] : ["先鎖住", fmt(f.on) + " 股", "total"], ["有效", "當天，收盤沒成交就取消退回"]], "確認掛單", () => bankDo("stock", { op: "order", id: cur.id, kind: k, n: f.on, px: f.opx })), "primary big bank-btn gold", { disabled: why ? true : null })),
    why && (n > 0 && px > 0) ? h("p", { class: "bank-why" }, why) : null,
    h("p", { class: "bank-meta sm" }, "集團股的單當天有效，收盤沒成交就取消，退回鎖住的籌碼或股數。成交才收手續費；停盤時不能掛、不能取消。")];
}
function gsOrdersPanel(G) {
  if (!G.orders) return null;
  const os = G.orders;
  return panel("掛著的單", os.length ? os.length + " 張" : "沒有掛單",
    os.length ? h("div", { class: "bank-orders" }, os.map(o => h("div", { class: "bank-order" },
      h("span", null, h("i", { class: "bank-kind " + o.kind }, o.kindName || KIND_TEXT[o.kind] || o.kind), h("b", null, o.name || o.id)),
      h("span", { class: "bank-order-d" }, (o.kind === "sell" ? "≥ " : "≤ ") + fp(o.px) + " × " + fmt(o.n) + " 股", h("small", null, "鎖 " + fmt(o.hold) + (o.kind === "buy" ? " 籌碼" : " 股") + "・" + String(o.day || "").slice(5).replace("-", () => "/") + " 收盤前有效")),
      btn("取消", () => bankDo("stock", { op: "cancel", id: o.id, no: o.no }), "small bank-btn", { disabled: G.halt ? true : null })))) : h("p", { class: "bank-empty-dark" }, "價格到了你設的數字才會成交，當天有效。"));
}
// 集團股（決定 0121）：世界集團的股票。資料 v.gs ＝ { list: [{ id, name, unit, price, open, chg, shares, mcap, nav, pb, mine, value, cost, limit }], index: { v }, halt, rule, notes }；動作 bankDo("stock", { op: "buy"|"sell", id, n })
function gstockPane(v) {
  actDone("stockLook"); // 每日任務：看股票的走勢（決定 0146；11-24 起壹般股頁 stockPane 也算，翊文）
  // 翊文 11-17：「這個應該要向其他頁籤可以直接輸入數字」「要有這些功能阿」：買／賣二選壹、1／10／100、買滿／全賣、自訂股數、走勢
  const G = v.gs; if (!G || !G.list || !G.list.length) return soon("集團股", "世界集團的股票正在準備，開放時館方公告會說。");
  const list = G.list, cur = list[Math.min(UI.bankGs || 0, list.length - 1)], tone = n => (n > 0 ? "up" : n < 0 ? "down" : "");
  const rows = list.map((x, i) => h("div", { class: "bank-row gs" + (x === cur ? " on" : ""), role: "row", tabindex: "0", onClick: () => { UI.bankGs = i; rerender(); } },
    h("span", null, h("b", null, x.name)), h("span", { class: "bank-tab-num" }, fmt(x.price)), h("span", { class: "bank-tab-num " + tone(x.chg) }, (x.chg > 0 ? "+" : "") + x.chg + "%"), h("span", { class: "bank-tab-num" }, x.pb != null ? "×" + x.pb : "—"), h("span", { class: "bank-tab-num" }, x.mine ? fmt(x.mine) + " 股" : "—")));
  const ask = (buy, n) => confirmTrade((buy ? "買進 " : "賣出 ") + cur.name, [["股數", fmt(n === "max" ? cur.mine : n) + " 股"], ["股價（約）", fmt(cur.price)]], buy ? "確認買進" : "確認賣出", () => bankDo("stock", { op: buy ? "buy" : "sell", id: cur.id, n }));
  const S0 = v.stocks, S = S0 ? Object.assign({}, S0, { halt: !!G.halt, positions: (S0.positions || []).filter(p => p.market === "grp") }) : null, curL = Object.assign({}, cur, { market: "grp" }); // 槓桿用股票頁籤那套（市場 grp），停盤照集團股的
  const gtabs = [["spot", "現股"]].concat(S && S.lev ? [["lev", "槓桿・放空"]] : [], G.orders ? [["order", "掛單"]] : []), gtab = gtabs.some(t => t[0] === UI.bankGsTrade) ? UI.bankGsTrade : "spot";
  const dis = G.halt ? true : null, sell = UI.bankGsSide === "sell" && cur.mine > 0, side = sell ? "sell" : "buy";
  const maxBuy = Math.max(0, Math.min(Math.floor((v.cash || 0) / Math.max(1, cur.price * 1.01)), cur.limit != null ? cur.limit - cur.mine : Infinity)), max = sell ? cur.mine : maxBuy;
  const qf = UI.bankGsQty || (UI.bankGsQty = { n: "" }), qinfo = h("p", { class: "bank-meta sm bank-qinfo" }), qty = () => { const n = Number(qf.n); return Number.isInteger(n) && n > 0 ? n : 0; };
  const qbtn = btn(sell ? "賣這個數量" : "買這個數量", () => { const n = qty(); if (n > 0 && n <= max) ask(!sell, n); }, "bank-btn gold");
  const qcalc = () => {
    const raw = qf.n, n = qty(); qbtn.disabled = true;
    if (raw === "" || raw == null) { qinfo.textContent = max > 0 ? "最多 " + fmt(max) + " 股。" : ""; return; }
    if (!n) { qinfo.textContent = "股數要是 1 以上的整數。"; return; }
    if (n > max) { qinfo.textContent = "最多只能" + (sell ? "賣 " : "買 ") + fmt(max) + " 股。"; return; }
    qinfo.textContent = fmt(n) + " 股 × " + fmt(cur.price) + " ＝ 約 " + fmt(n * cur.price) + "（手續費照成交算）"; qbtn.disabled = G.halt ? true : false;
  };
  qcalc();
  const steps = h("div", { class: "bank-acts" }, ...[1, 10, 100].map(n => btn(fmt(n) + " 股", () => ask(!sell, n), "big bank-btn", { disabled: dis || n > max ? true : null })),
    btn(sell ? "全賣" + (max > 0 ? " " + fmt(max) : "") : "買滿" + (max > 0 ? " " + fmt(max) : ""), () => (sell ? ask(false, "max") : ask(true, max)), "primary big bank-btn gold", { disabled: dis || max <= 0 ? true : null }));
  const custom = max > 0 ? h("div", { class: "bank-custom" }, numField("自訂股數", qf.n, x => { qf.n = x === "" ? "" : Math.floor(Number(x)); qcalc(); }, { min: 1, step: 1, unit: "股" }), qbtn, qinfo) : null;
  return h("div", { class: "bank-cols" },
    h("div", { class: "bank-stack" }, panel("世界集團的股票", G.index && G.index.v ? `集團指數 ${G.index.v}` : "", h("div", { class: "bank-ledger", role: "table" }, h("div", { class: "bank-row gs head", role: "row" }, h("span", null, "名稱"), h("span", null, "股價"), h("span", null, "今天"), h("span", null, "股價淨值比"), h("span", null, "持股")), ...rows)),
      h("p", { class: "bank-meta sm" }, G.rule || "")),
    h("div", { class: "bank-stack" }, panel(cur.name, `${cur.unit}・${G.halt ? "休市" : "營業中"}`,
      h("div", { class: "bank-quote" }, num("big", fmt(cur.price)), h("span", { class: "bank-mood " + tone(cur.chg) }, (cur.chg > 0 ? "+" : "") + cur.chg + "%")),
      h("p", { class: "bank-meta sm" }, `股本 ${fmt(cur.shares)} 股・市值 ${fmt(cur.mcap)}・每股淨值 ${fmt(cur.nav)}`),
      h("p", { class: "bank-meta sm" }, cur.mine ? `你有 ${fmt(cur.mine)} 股，市值 ${fmt(cur.value)}，成本 ${fmt(cur.cost)}` : "你還沒有這支。"),
      cur.hist && cur.hist.length > 1 ? h("div", null, spark(cur.hist), h("p", { class: "bank-meta sm" }, "近 " + cur.hist.length + " 天收盤")) : null,
      gtabs.length > 1 ? seg(gtabs, gtab, k => { UI.bankGsTrade = k; rerender(); }, "kind") : null,
      ...(gtab === "lev" ? levTrade(v, S, curL) : gtab === "order" ? gsOrderTrade(v, S0, G, cur) : [seg([["buy", "買進"], ["sell", "賣出", !cur.mine]], side, k => { UI.bankGsSide = k; rerender(); }), steps, custom]),
      (G.notes || []).length ? h("ul", { class: "bank-who" }, G.notes.map(t => h("li", null, t))) : null),
      S && S.lev ? positionsPanel(S) : null, gsOrdersPanel(G), tradesPanel(S0 && S0.trades, "grp")));
}
// 股票頁籤（翊文 11-20：集團股併進來）：上面一排切「台股・美股・館內股」和「集團股」；選集團股畫集團股那套，銀行說明預設跳「集團股」。成交紀錄之後放這裡
const stockHome = v => { const hasG = v.gs && v.gs.list && v.gs.list.length, grp = UI.bankGrp === "grp"; if (!hasG || !v.stocks) return hasG ? gstockPane(v) : stockPane(v); const fr = document.createDocumentFragment(); fr.append(seg([["std", "一般股"], ["grp", "集團股"]], grp ? "grp" : "std", k => { UI.bankGrp = k; rerender(); }, "kind bank-grpsw"), grp ? gstockPane(v) : stockPane(v)); return fr; };
const flowReload = () => { if (UI.screen === "bank" && UI.bankTab === "flow" && !UI.bankLoading) bankLoad(); }; // 金流頁籤開著：每 45 秒重拿（bank_flow.js 排）
const PANES = { save: savePane, loan: loanPane, bond: bondPane, stock: stockHome, report: reportPane, flow: v => flowPane(v, { panel, reload: flowReload }) };

// ---------- 右欄 ----------
// 我的帳戶的幾行（銀行右欄、賭場和同桌賭桌的小塊共用，11-16）
function acctRows(v) {
  const stockVal = v.stocks ? (v.stocks.total != null ? v.stocks.total : v.stocks.list.reduce((n, s) => n + s.price * s.mine, 0)) : 0; // 伺服器給 total；示範資料沒有就自己算
  const termSum = v.save.terms.reduce((n, t) => n + t.amt, 0), owe = v.loan.list.reduce((n, x) => n + x.owe, 0) + (v.stocks && v.stocks.margin ? v.stocks.margin.owe : 0);
  // 館債：本金加債權憑證（測試 11-13：買了看不出錢去哪）；借款沒欠寫 0，不寫「−0」（測試 11-13）
  return [["現金", v.cash], ["活存", v.save.save], ["定存", termSum], ["館債", v.bonds ? v.bonds.held.reduce((n, x) => n + x.amt, 0) + (v.bonds.iou || 0) : 0], ["持股市值", stockVal], ["借款", owe ? -owe : 0]];
}
const acctBody = v => h("div", { class: "bank-acct" }, acctRows(v).map(([k, n]) => h("p", null, h("span", null, k), h("b", { class: n < 0 ? "down" : "" }, n < 0 ? "−" + fmt(-n) : fmt(n || 0)))), h("p", { class: "net" }, h("span", null, "淨值"), h("b", null, fmt(v.net))));
// 賭場、同桌賭桌右欄的「我的帳戶」（11-16，翊文：「賭場的賭桌也可以看到簡易銀行嗎，以及自己的帳戶，依樣可以收折」）：
// 標題那條點了收起／打開（記在 localStorage pm-acct-fold）；資料跟銀行廳同壹份（act bankHall），打開時讀壹次、之後 60 秒內不重讀
const ACCT_FOLD = "pm-acct-fold";
export function bankAcctBox() {
  const box = h("section", { class: "cas-acct" });
  let shut = false; try { shut = localStorage.getItem(ACCT_FOLD) === "1"; } catch (e) { /* ignore */ }
  const draw = () => {
    const v0 = UI.bankHall && !UI.bankHall.demo ? UI.bankHall : null;
    const v = v0 && typeof UI.chips === "number" ? Object.assign({}, v0, { cash: UI.chips, net: v0.net + UI.chips - v0.cash }) : v0; // 現金照最新的籌碼（牌桌上每手都在變），其他照帳本
    const head = h("button", { type: "button", class: "cas-acct-h", "aria-expanded": String(!shut), onClick: () => { shut = !shut; try { localStorage.setItem(ACCT_FOLD, shut ? "1" : "0"); } catch (e) { /* ignore */ } if (!shut) load(); draw(); } },
      h("i", { "aria-hidden": "true" }, shut ? "▸" : "▾"), h("b", null, "我的帳戶"), v ? h("small", null, `淨值 ${fmt(v.net)}`) : null);
    box.replaceChildren(head, shut ? null : v ? acctBody(v) : h("p", { class: "cas-bank-wait" }, UI.bankErr ? "讀不到帳戶。" : "翻帳本中……"));
  };
  const load = () => { if (UI.bankLoading || (UI.bankHall && !UI.bankHall.demo && Date.now() - (UI.bankAt || 0) < 60000)) return; bankLoad().then(() => { if (box.isConnected) draw(); }); };
  draw(); if (!shut && NET.loggedIn) load();
  return box;
}
ADDONS.bankAcctBox = bankAcctBox;
function side(v) {
  return h("aside", { class: "onescreen-side bank-side" },
    panel("我的帳戶", "", acctBody(v)),
    v.stocks && v.stocks.credit ? creditPanel(v.stocks.credit) : null); // 11-15：「今日新聞」拿掉（跟財報卡裡的新聞是同壹句）
}
// 信用等級（只有自己看得到，不排行）：準時還款、定存到期、開槓桿換點數，每 5 點 1 級；等級放大槓桿的本金上限（決定 0157）
function creditPanel(c) {
  return panel("信用", "",
    // 等級放大成壹枚金色徽章（翊文 11-14：「信用的等級數字可以明顯一點嗎」）
    h("div", { class: "bank-lv" }, h("span", { class: "bank-lv-seal", "aria-hidden": "true" }, h("b", null, String(c.level)), h("i", null, "級")),
      h("span", { class: "bank-lv-t" }, h("b", null, `信用 ${c.level} 級`), c.name ? h("em", null, c.name) : null, h("small", null, `信用點 ${c.pts}`))),
    h("p", { class: "bank-meta sm" }, c.nextText || (c.next > 0 ? `再 ${c.next} 點升 ${c.level + 1} 級（信用點 ${c.pts}）。` : `已經是最高級（信用點 ${c.pts}）。`), c.nextText ? `（信用點 ${c.pts}）` : ""),
    h("p", { class: "bank-meta sm" }, `槓桿最高 ${c.maxLev}×・本金 ${fmt(Math.round(c.posUsed / 10000))} 萬／${fmt(Math.round(c.posLimit / 10000))} 萬`),
    c.why ? h("p", { class: "bank-hint" }, c.why) : null);
}
function ticker(v, dup) { // dup：在股票頁籤，行情表已經有了，只有手機直拿才留這條（拿來換股）
  if (dup && (UI.bankPV === "market" || UI.bankPV === "hold")) return null; // 手機在看「行情」「持倉」那頁，底下不用再秀一條（交易頁留著拿來換股）
  const list = v.stocks ? v.stocks.list : [];
  // 股票多了（美股 24 支＋台股…）整條拉不完：只放我持有的和今天漲跌最大的，最多 TICKER_MAX 支；全部在股票頁籤的行情表
  const TICKER_MAX = 12, picks = list.length <= TICKER_MAX ? list.map((s, i) => i) : [...new Set(list.map((s, i) => i).filter(i => list[i].mine > 0).concat(list.map((s, i) => i).filter(i => !(list[i].mine > 0)).sort((a, b) => Math.abs(list[b].chg || 0) - Math.abs(list[a].chg || 0))))].slice(0, TICKER_MAX).sort((a, b) => a - b);
  return h("div", { class: "bank-ticker" + (dup ? " dup" : ""), "aria-label": "今日行情" }, h("span", { class: "bank-tl" }, "今日行情", picks.length < list.length ? h("small", { class: "bank-tl-sub" }, "漲跌最大") : null),
    picks.map(i => [list[i], i]).map(([s, i]) => h("button", { type: "button", class: "bank-tk" + (UI.bankTab === "stock" && s === list[UI.bankStock || 0] ? " on" : ""), onClick: () => { UI.bankTab = "stock"; UI.bankStock = i; UI.bankPV = "trade"; rerender(); } },
      h("small", null, s.name), h("b", null, fp(s.price)), upDown(s.chg))));
}

// ---------- 規則與小提示（翊文 11-14：「這個銀行裡面有沒有一個按鈕可以把這些小tip給玩家參考」）----------
// 數字都從 shared/core/config.js 的 NUM 讀；伺服器 view 有給的（開收盤、倍數上限）優先用 view 的
const clock = m => { const t = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
const pc = n => `${Number(n)}%`;
const feeT = v => (v > 0 ? pc(v) : "免手續費"); // 手續費 0 寫「免手續費」（決定 0136）
function helpSections(v) {
  const C = NUM.casino, S = C.stock, L = C.stockLev, I = C.stockIn, B = C.bank, LN = C.loan, W = C.work, BD = C.bond, A = NUM.auction, G = C.gstock, BS = C.bankSplit, TR = (C.worldDoc && C.worldDoc.trade) || {}, TB = TR.bank || {};
  const sv = (v && v.stocks) || {}, inDt = sv.inDay || { from: I.from, len: I.ticks, step: I.step }, inD = { from: inDt.from, len: (inDt.len - 1) * (inDt.step || I.step) }, tw = sv.tw || { from: S.tw.from, len: S.tw.len };
  const usLen = (sv.us && sv.us.len) || S.us.len;
  // 美股：美東 S.us.open 分鐘開盤；台灣時間冬令 +13 小時、夏令 +12 小時
  const usTime = off => `${clock(S.us.open + off * 60)}～${clock(S.us.open + usLen + off * 60)}`;
  const lev = L.levByCredit.map(([lv, n]) => `信用 ${lv} 級起 ${n} 倍`).join("、");
  // 賣出上限隨信用（決定 0093）：0 級是 sellDay，之後照 sellMultByCredit
  const sellCaps = [`信用 0 級 ${casNum(S.sellDay)}`].concat((S.sellMultByCredit || []).map(([lv, m]) => `${lv} 級起 ${casNum(Math.round(S.sellDay * m))}`)).join("、");
  const AD = C.advisor || {};
  const twNoOpen = clock(tw.from + S.tw.noOpenIdx), twClose = clock(tw.from + tw.len);
  return [
    { id: "stock", name: "股票", blocks: [
      ["什麼時候能買賣", [
        `館內五家店：每天 ${clock(inD.from)}～${clock(inD.from + inD.len)}。`,
        `台股：${clock(tw.from)}～${twClose}。`,
        `美股（台灣時間）：冬令 ${usTime(13)}，夏令 ${usTime(12)}${S.us.reg ? `；正常盤從冬令 ${clock(S.us.open + S.us.reg + 13 * 60)}、夏令 ${clock(S.us.open + S.us.reg + 12 * 60)} 開始，之前是盤前（價照真實的盤前價，買賣、槓桿、掛單、停損都能用）` : ""}。`,
        "沒開盤的時候看得到價，但不能買賣。",
        "行情表的組名、美股和台股底下的產業小組，點壹下就能收起來，下次進來還記得。",
        `館外的價錢超過 ${S.staleMin} 分鐘沒更新，這一支會暫停買賣，標「未更新」；等新價來了才能動。`]],
      ["價錢怎麼來", [
        `館外股票：遊戲價 ＝ 真實價 × 倍數（美股 × 當天的美元對台幣匯率（約 ×${S.peg.us}）、台股 ×${S.peg.tw}），所以真實股市漲 1%，這裡也漲 1%。館外股也能「照金額」買賣：打金額就好，買得到不到壹股的零碎股（最小萬分之壹股）；配息、掛單、還債賣股只算整數股，零碎股在換比例時照換之前的價換成籌碼。`,
        "館內股：看昨天來了多少不同的人，見「館內股」那一頁。"]],
      ["要付的錢", [
        `手續費：台股 ${feeT(S.feeOut.tw)}、美股 ${feeT(S.feeOut.us)}（買和賣各收一次）；館內股 ${feeT(S.feePct)}、集團股 ${feeT(S.feeOut.grp)}。`,
        `持有成本：每天從持股市值扣 ${pc(S.holdPct)}。`,
        `證交稅 ${pc(S.taxPct)}：賣台股和館內股要繳賣出金額的 ${pc(S.taxPct)}（賺賠都收，不到 1 籌碼也算 1）；美股不收。稅進公共機構的稅收。`,
        S.sellDay > 0 ? `壹個人壹天最多賣出：${sellCaps}（館外股和館內股合算；信用跟槓桿是同壹個等級）。` : "壹個人壹天賣多少都可以，沒有上限（館內股還有全館壹天的淨賣出上限，全館賣太多要等隔天）。"]],
      ["館內五家店的價格", [
        "館內股是真的市場：每家發行 10 萬股，旅客、散客照那家店每 15 分鐘到店的人數下單，價格由買賣推出來；你的買賣也會推動價格。",
        "每個價最多動 3%、壹天最多動 10%，一次想買賣太多會被擋，並告訴你現在最多還能買賣幾股。買賣各有半個價差（1%），加上手續費、證交稅，拉高出貨賺不到。",
        "「合理價」是旅客心裡的價，照昨天的人數、營收、景氣調：價格比它高旅客傾向賣，比它低傾向買。人多的店成交多、價格追合理價追得快；人少的店價格幾乎不動。"]],
      ["借款：部分還、分期", [
        "借款可以「還一部分」：先還利息、再還本金（壹次最少 5%、最少 1,000，每筆最多 8 次）；部分還款不算準時還清，額度不會升，整筆還清才升。",
        "借了壹天以上、本金 10 萬以上、沒延過期的，可以「轉分期」：分 2～4 期、每期隔 3～7 天（最晚多 21 天），每期到期只扣那壹期；延後的部分照借款日利率收手續費，算進每期要還的錢。分期和延期只能選壹個。",
        "賣股還債可以只還壹部分：賣的錢先補負數、還前面的整筆，最後壹筆還不完就先還它的利息和本金的壹部分。"]],
      ["股息和配股", [
        "館外股有配息的，除息日開始時你手上有的股數，每股領真實的現金股利（照遊戲價的倍數、美股照當天匯率換算），錢由海外付，扣股利所得稅：台股 30.11%（分離課稅 28% ＋ 二代健保 2.11%）、美股 30%，稅進公共機構的稅收。",
        "除息當天才買的不領，也買在掉完股利的價。除權（配股）：除權前持有的人多配股數，零股用現金補。",
        "槓桿部位當天結束，不會跨過除息日，所以沒有股息。"]],
      ["賣股還債", [
        "有欠款（錢包是負的，或有可以還的借款）時，可以選「賣股還債」：賣的錢直接拿去補負數、照到期順序還借款，不進錢包。",
        "賣股還債不受每天賣出的上限、也不算進今天的額度；手續費和稅照收。按「賣到夠還」會算好要賣幾股。"]],
    ] },
    { id: "order", name: "掛單", blocks: [
      ["限價單、停損單", [
        "掛一個價錢，價到了才成交，不用一直盯著看。",
        `同時最多 ${S.order.max} 張，同一支最多 ${S.order.perStock} 張；一天最多取消 ${S.order.cancelDay} 次。`]],
      ["什麼時候作廢", [
        `美股和台股的單：當天收盤沒成交就取消（台股 ${twClose}）。`,
        `館內股的單：當天 ${clock(inD.from + inD.len)} 沒成交就取消。`,
        "取消的單，鎖住的錢或股票會還給你。"]],
    ] },
    { id: "lev", name: "槓桿", blocks: [
      ["開之前", [
        `倍數看信用等級：${lev}。信用在財報頁看。`,
        `信用升級：每 ${L.credit.ptsPerLevel} 點升壹級；還款準時、定存或館債到期那天加 ${L.credit.dayGain} 點，每開壹筆本金 ${casNum(L.credit.openMin)} 以上的槓桿加 ${L.credit.openGain} 點，壹天合計最多 ${L.credit.dayMax} 點（壹天最多升壹級）；借款逾期壹次扣 ${L.credit.lateLoss} 點。`,
        (L.opensDay > 0 ? `一天最多開 ${L.opensDay} 筆；` : "一天開幾筆不限；") + (L.coolMin > 0 ? `同一支平倉後要等 ${L.coolMin} 分鐘才能再開。` : "平倉後馬上可以再開。"),
        `放進槓桿的本金（做多加放空的保證金合計）上限 ${casNum(L.posLimit)}、壹天當沖淨賺最多算 ${casNum(L.profitCap)}，信用每高壹級再多 ${L.stepPct}%。`,
        `台股、美股行情落後超過 ${L.maxLagMin} 分鐘，暫停「新開」；已經開的、平倉、強平照常。`,
        `台股 ${twNoOpen} 起不能新開（收盤前最後五分鐘是集合競價）。`]],
      ["集團股也能開", [
        `世界集團的股票也能開槓桿、放空，最多 ${L.maxLev.grp} 倍（一樣看信用等級）。部位當天結束一定平倉。`,
        "開倉、平倉、被強平都會像現股一樣推價；你推的價可能讓別人的部位碰到強平價。",
        `莊家是對手盤，接的部位合計有上限（莊家的錢的 ${pc(L.houseExposePct)}，最少 ${casNum(L.houseFloor)}），滿了就暫時開不了新的。`]],
      ["會發生什麼事", [
        `借的錢（部位減保證金）每天收利息：台股、美股 ${pc(L.byMk.tw.interestPct)}，館內股、集團股 ${pc(L.interestPct)}；放空另外收借券費：台股、美股 ${pc(L.byMk.tw.borrowPct)}，館內股、集團股 ${pc(L.borrowPct)}。`,
        `手續費：台股 ${feeT(S.feeOut.tw)}、美股 ${feeT(S.feeOut.us)}，館內股 ${feeT(S.feePct)}、集團股 ${feeT(S.feeOut.grp)}；台股平倉另收當沖證交稅 ${pc(L.byMk.tw.taxPct)}（進公共機構的稅收），美股、館內股、集團股沒有。`,
        `保證金剩下不到一半（${L.forcePct}%）就強制平倉，錢拿不回來。`,
        "當沖：收盤前沒平，系統自動幫你平倉。",
        `台股收盤（${twClose}）用官方收盤價平倉，可能跟你看到的最後一個價不一樣。`,
        "停損、停利要比強平價更靠近現價才有用；放空的方向相反。"]],
    ] },
    { id: "inshop", name: "館內股", blocks: [
      ["價錢怎麼動", [
        `每天看這家店「昨天」的人氣，跟平常比：人數和營收各佔壹半（${pc((I.revWeight || 0.5) * 100)}），比平常多會漲、比較少會跌。`,
        `人數：館友、有名字的旅客、逛店的散客都算；館友少的店也有旅客和散客撐著（至少算 ${I.npcBase || 12} 位）。`,
        `營收：館友在這家店花的錢（每人每天最多算 ${casNum(I.revCap || 3000)}），加上旅客和散客花的錢；營收太少或剛上線的幾天只看人數。`,
        `昨天不到 ${I.minPeople} 位不同的人，這家就不調價。`,
        `每次最多跳 ${pc(I.jumpCap)}；盤中每 ${I.step} 分鐘一個價，整天走動大約 ${pc(I.daySd)}。`]],
      ["限制", [
        `每人每家最多持有 ${fmt(I.cap)} 股。`,
        "館內股的對手盤是莊家，莊家接得下的量有上限，滿了就暫時買不到。",
        "館內股賣出收證交稅，跟台股一樣。"]],
    ] },
    { id: "gstock", name: "集團股", blocks: [
      ["是什麼", [
        "已知世界裡名單上標「上市」的集團都發股票，在「股票」頁籤上面切到「集團股」買賣。每家的資本額是它的池子的 " + G.capMult + " 倍，股數固定、每週一才會增資、庫藏股、配股或分割。",
        `營業時間每天 ${clock(300)}～${clock(300 + (G.ticks - 1) * 15)}，每 15 分鐘一個價。`]],
      ["價錢怎麼動", [
        "基本價看這家集團每股的淨值、健康值（景氣、旗下股票）、所屬市場的景氣；價格會慢慢往基本價靠。",
        `你買賣會推價：買進股本的 1% 大約漲 ${Math.round(100 / G.depthPct)}%；買賣各有半個價差 ${pc(G.half * 100)}。每 15 分鐘最多動 ${G.tickLim}%、壹天最多動 ${G.dayLim}%，想買賣太多會被擋並告訴你現在最多還能買賣幾股。`,
        "別人推價也會讓你的持股漲跌；拉高出貨要付價差、手續費、證交稅，賺不到。"]],
      ["要付的錢和限制", [
        `手續費 ${feeT(S.feeOut.grp)}、賣出證交稅 ${pc(S.taxPct)}（跟台股一樣），進博物館資金和稅收。`,
        `沒有持股上限；一個人一天最多買賣股本的 ${G.dayVolPct}%，不跟館外股的每天賣出上限合算。`,
        `莊家是對手盤，手上的庫存最多股本的 ${G.makerCapPct}%（買賣都算）；莊家的錢不夠付你的賣單時，先向博物館資金借（最多 ${casNum(G.cover.max)}），再不夠就只賣掉付得出的部分，其餘退回給你。`]],
      ["每週一的事", [
        `現金股利：集團池子成長的 ${G.payoutPct}% 發給持股的人（扣所得稅）；增資：吃緊的集團發新股給莊家（價格比基本價低 ${G.raise.discPct}%）；庫藏股：健康的集團買回股票。`,
        `股票股利：價格 ≥ ${G.stockDivPx} 時配 ${G.stockDivPct}%；分割：價格 ≥ ${G.splitPx} 時 1 股變 ${G.splitK} 股，持股和成本照比例換，市值不變。`]],
      ["掛單、槓桿", [
        "掛單（限價買、限價賣、停損賣）照現股推價成交，當天有效；買單鎖錢、賣單鎖股，收盤沒成交就取消退回。",
        `槓桿、放空最多 ${L.maxLev.grp} 倍（看信用等級），部位當天平倉，見「槓桿」那一頁。`]],
    ] },
    { id: "flow", name: "金流", blocks: [
      ["怎麼看", [
        "從今天 05:00 起，錢在各個地方之間流動的方向和量（兩個地方之間相抵取淨額）。金色小圓片沿著線跑，線越粗流得越多；點線或方塊，下面列出是哪些來源。",
        "只有合計和來源的名字，沒有個別館友和 NPC 的名字。每 45 秒自己更新壹次。"]],
      ["縮放層級", [
        "全景：已知世界、佩佩博物館各是壹塊。點「已知世界」放大，看各集團之間的往來；再點某個集團，看它的子公司和它所有的進出；點「佩佩博物館」看館裡的莊家、博物館資金、修繕基金、佩佩銀行準備金。",
        "上面的往來種類按鈕可以只看某壹種（日用品採購、金融服務費、研究委託、展覽設計委託、稅與規費、補助與公共採購、科技服務、薪水、館內消費…）。"]],
      ["每個地方是什麼", [
        "已知世界：旅客、散客、各集團、家計、NPC 錢包、文化部、公共機構。海外：真實市場（館外股票的買賣、股利）；可以是負的：館友從真實市場賺回來的比投進去的多。",
        "莊家：賭場和股票的錢。博物館資金：館方行政、投資、墊款。修繕基金：門票的壹部分。稅收：證交稅、營業稅、娛樂稅，每天搬進公共機構。海底：沉掉的錢。佩佩銀行準備金：見下壹頁。增長：每天成長、擴充，不是從哪個帳搬來的。"],
      ],
      ["集團之間", [
        "各集團每天互相買賣：日用品採購（付給民生集團）、金融服務費、研究委託、展覽設計委託、稅與規費（付給公共機構）、補助與公共採購、科技服務；家計也買日用品、繳稅、付保險利息，集團付薪水給家計；集團付薪水給 NPC 錢包。",
        `往來的量看付款方的狀態和景氣：減薪、緊縮、裁員的集團付得少，景氣好往來變多（景氣每 ±1 變 ${pc(Math.round((TR.bK || 0.5) * 100))}）。`]],
    ] },
    { id: "gbank", name: "佩佩銀行", blocks: [
      ["是什麼", [
        "佩佩銀行有自己的準備金，跟莊家（賭場和股票）分開：借款、館債、存款利息由它處理，賭場輸贏不會讓銀行缺錢。",
        "錢從哪裡來：集團存進來的錢（帳上有餘裕的集團會存、領利息）、館債賣出收的錢、莊家超過 " + casNum(BS.hdepW) + " 的部分（存進來當資本）、還款和利息。"]],
      ["怎麼用這些錢", [
        `借給館友（新的借款）和狀態不好的集團，每次最多放出準備金扣掉 ${pc(BS.reservePct)} 準備、集團存款的 ${pc(BS.gdepKeepPct)} 和館債本金之後的錢。`,
        `集團存款利息每天 ${pc(TB.depRate || 0)}、借款每天 ${pc(TB.loanRate || 0)}，銀行賺利差。賺的利息（扣掉付出去的）每天分：${BS.sweepHousePct}% 給莊家、${100 - BS.sweepHousePct}% 給博物館資金。`]],
      ["不夠的時候", [
        `準備金不夠付集團領回時，先向博物館資金借（最多博物館資金的 ${TB.budgetMax || 30}%），有錢就還；再不夠先付得出的部分。`,
        `莊家存在這裡的錢，莊家的錢低於 ${casNum(BS.hdepLow)} 才能領回，壹天最多銀行多餘現金的 ${BS.hdepOutPct}%。`,
        "你的存款本金還是在你的錢包裡，銀行只負責付利息。"]],
    ] },
    { id: "save", name: "存款", blocks: [
      ["活存", [
        `每天利息 ${pc(B.savePct)}，本金最多算到 ${casNum(B.saveCap)}。想領隨時領。`,
        "利息由佩佩銀行付（以前是莊家），佩佩銀行的準備金沒錢的時候不給。本金還是你的錢，一直在你的錢包裡算。"]],
      ["定存", [
        B.terms.map(t => `${t.days} 天 ${pc(t.pct)}`).join("、") + `；最少 ${casNum(B.termMin)}，一筆最多 ${casNum(B.termCap)}，同時最多 ${B.termMax} 筆。`,
        "到期自動回到活存。提早解約只拿回本金，沒有利息。"]],
    ] },
    { id: "loan", name: "借款", blocks: [
      ["錢從哪裡來", [
        "新的借款由佩佩銀行的準備金出，還款、到期被扣的錢也還給佩佩銀行；以前借的舊款還是還給莊家。賭場和股票的錢跟借款分開，賭場輸贏不會影響能不能借。",
        `佩佩銀行放得出的錢有上限：準備金扣掉 ${pc(BS.reservePct)} 準備、再扣集團存款的 ${pc(BS.gdepKeepPct)} 和館債本金，剩下才能借。不夠的時候借款會暫停，畫面說「佩佩銀行的錢暫時不夠借」，過一陣子再來。`]],
      ["額度", [
        `一開始最多借 ${casNum(LN.limit)}，每次最少 ${casNum(LN.min)}，同時最多 ${LN.maxOpen} 筆沒還。`,
        `準時還清一筆，額度多 ${pc(LN.limitPct)}，最多到 ${casNum(LN.capMax)}；一個人一天最多升 ${LN.levelPerDay} 級（當天借當天還的不算）。`,
        `到期沒還，額度降 ${pc(LN.latePct)}，信用也會被扣。`]],
      ["怎麼還", [
        `每筆固定利息 ${pc(LN.interestPct)}（借 10 萬還 ${casNum(100000 * (1 + LN.interestPct / 100))}），提早還也一樣。`,
        `借了 ${LN.repayAfterMin} 分鐘以後才能還；第 ${LN.days} 天結束前要還，過了就直接從錢包扣，扣成負的也扣。`,
        `錢包變負的（欠款）：額度鎖住，換日派參觀者去地下工作還，一天最多還 ${casNum(W.payMax)}（或欠款的 ${pc(W.payPct)}，取小的）。`,
        "借多少：快速按鈕照你的額度算（額度的壹成、四分之壹、壹半），也可以按「自己輸入金額」或「借滿」。"]],
      ["欠很多錢的時候", [
        `財經專員梁安：錢包是負的，或沒還的借款加起來有 ${casNum(AD.minOwe || 1000000)} 以上，他會寄信給你、在借款頁給還款計畫。`,
        `延期：每筆借款最多延 ${AD.maxExt || 1} 次，要在到期前，多 ${AD.extendDays || 3} 天，手續費 ${pc(AD.feePct || 5)} 加進要還的錢。`,
        "他也會建議先賣哪幾支股票來還（館內股先），每壹項都要你按「同意」才會動。"]],
    ] },
    { id: "bond", name: "館債", blocks: [
      ["怎麼買", [
        `每週一期，一張 ${casNum(BD.unit)}；一個人每期最多 ${casNum(BD.perUser)}，帳號要開了 ${BD.minAge} 天。`,
        "不能提早贖回、不能轉讓。利息照持有天數算，越早買越多。"]],
      ["利率", [
        "買館債的錢進佩佩銀行，到期的本金和利息也由佩佩銀行付。利率照莊家有多少錢分級：莊家越有錢，利率越低；莊家越缺錢，利率越高、能買的越多。",
        BD.tiers.map((t, i) => `${t.fromPct > 0 ? `莊家的錢有起始的 ${t.fromPct}% 以上` : `莊家的錢不到起始的 ${BD.tiers[i - 1].fromPct}%`}：利率 ${pc(t.pct)}（全館最多賣 ${casNum(t.cap)}）`).join("；") + "。",
        `佩佩銀行付不出來時，館方（博物館資金）先墊；再不夠就開債權憑證，佩佩銀行有錢了就補付。`]],
    ] },
    { id: "report", name: "財報", blocks: [
      ["怎麼看", [
        "景氣：好、普通、差，會帶動館內股一點點漲跌。",
        "昨天發生的事：館內昨天進出的錢和今天的數字。",
        "莊家和投資人在買什麼：看大家的動向，只能當參考。",
        "世界市場：海外（真實市場）每天發生的股市消息，跟館外的股票有關。有附相關股票的，就是會影響它。",
        "已知世界：各集團現在好不好（正常、減薪、緊縮、裁員各幾個）、旅客的預算打幾折、這週誰換了狀態、集團之間的往來。集團差，旅客來館花的錢就少。",
        "昨天館外來客花了多少：有名字的旅客和散客付的門票、在每家店花的錢、餐車賣了什麼。"]],
      ["小提示", [
        "股票那一頁的紅點代表有股票的價錢變了。",
        "財報的數字是昨天的，今天要用行情頁的價錢。"]],
    ] },
    { id: "auction", name: "拍賣", blocks: [
      ["規則", [
        "封閉式：每人寫一個價，沒有人看得到別人出多少。",
        `從展出那天起算 ${A.closeDays} 天後，台灣時間 ${A.closeHour}:00 收標；最高價得標，付「第二高」的價；只有一人出價就付底價。`,
        `出價時錢會先鎖住，收標後退回；得標的才付款，成交要抽 ${pc(A.feePct)}。`]],
      ["拍自己的畫", [
        `底價要在這幅畫館方現價的 ${pc(A.floorPct)}～${pc(A.ceilPct)} 之間；同時最多拍 ${A.listPerSeller} 幅，帳號要開了 ${A.minAge} 天。`,
        "沒人出價就是流標，畫還是你的。"]],
    ] },
  ];
}
function openHelp(v) {
  const secs = helpSections(v), cur = { id: UI.bankHelp && secs.some(x => x.id === UI.bankHelp) ? UI.bankHelp : ({ stock: UI.bankGrp === "grp" ? "gstock" : "stock", flow: "flow", save: "save", loan: "loan", bond: "bond", report: "report" }[UI.bankTab] || "stock") };
  const m = miniLayer("規則與小提示", "數字是現在的設定，改了這裡會跟著變。");
  m.card.classList.add("bank-help");
  const chips = h("div", { class: "bank-help-tabs", role: "tablist" });
  const body = h("div", { class: "bank-help-body" });
  const draw = () => {
    UI.bankHelp = cur.id;
    const sec = secs.find(x => x.id === cur.id);
    chips.replaceChildren(...secs.map(x => h("button", { type: "button", role: "tab", "aria-selected": String(x.id === cur.id), class: "bank-help-chip" + (x.id === cur.id ? " on" : ""), onClick: () => { cur.id = x.id; draw(); } }, x.name)));
    body.replaceChildren(...sec.blocks.map(([title, items]) => h("section", { class: "bank-help-sec" }, h("h3", null, title), h("ul", null, items.map(t => h("li", null, t))))));
    body.scrollTop = 0;
  };
  draw();
  m.card.append(chips, body, h("div", { class: "bank-acts" }, btn("知道了", () => m.close(), "big bank-btn gold")));
  closeOnOutside(m);
}
const helpBtn = v => btn([h("span", { class: "bank-help-q", "aria-hidden": "true" }, "？"), "規則與小提示"], () => openHelp(v), "small bank-btn gold bank-helpbtn");
// ---------- 整個畫面 ----------
SCREENS.bank = root => {
  if (!UI.localPlay && !UI.bankLoading && Date.now() - (UI.bankAt || 0) > 20000) bankLoad(); // 進來先跟伺服器拿；拿到前畫示範資料（上面寫著）
  root.classList.add("onescreen-room", "bank-onescreen"); root.classList.toggle("bank-tab-flow", (UI.bankTab || "report") === "flow");
  // 登入了、第壹次還沒拿到：只寫「正在拿」，不先畫示範數字（測試 11-13：會先閃壹組假數字）
  if (!UI.bankHall && !UI.localPlay && !UI.bankErr) {
    root.append(roomHead("Yuga Bot 銀行", "存錢有利息，借錢要還。"), h("div", { class: "onescreen-main" }, h("div", { class: "bank-stage" }, h("p", { class: "bank-demo" }, "正在跟銀行拿資料……"))));
    return;
  }
  const v = view(), tab = UI.bankTab || "report";
  const tabs = h("div", { class: "bank-tabs", role: "tablist" }, TABS.map(([id, name]) => h("button", { type: "button", role: "tab", "aria-selected": String(id === tab), class: "bank-tabbtn" + (id === tab ? " on" : ""), onClick: () => { if (id === "auction") { go("gallery", { tab: "auction" }, { action: false }); return; } UI.bankTab = id; rerender(); } },
    h("span", { class: "bank-ti", html: TAB_ICON[id] }), h("span", null, name), id === "stock" && tab !== "stock" && v.stocks && v.stocks.list.some(x => x.fresh) ? h("i", { class: "bank-dot", "aria-label": "有股票的價格變了" }) : null)));
  root.append(roomHead("Yuga Bot 銀行", v.econ ? `存錢有利息，借錢要還，買股票看行情。今天景氣：${v.econ.idx > 0.3 ? "好 ▲" : v.econ.idx < -0.3 ? "差 ▼" : "普通"}` : "存錢有利息，借錢要還。", helpBtn(v)),
    tabs, // 店員、阿秤在銀行：頭像在房間頂上「這裡現在 N 人」那顆鈕，點開才看（11-22，ui_roomnow.js；原本兩張大卡插在這裡，手機上把財報推到螢幕外）
    // 示範資料要壹眼看得出來（11-15 玩家：「進到銀行好像持倉變成官方還是別人的了」——其實是連不上時的示範資料，手機版又把那行藏起來了）：
    //   上面壹條紅色橫幅（手機也顯示）＋整頁斜的「示範資料」浮水印（.bank-stage.is-demo）
    h("div", { class: "onescreen-main" }, h("div", { class: "bank-stage" + (v.demo && !UI.bankLoading ? " is-demo" : "") }, v.demo ? h("p", { class: "bank-demo" + (UI.bankLoading ? "" : " warn"), role: UI.bankLoading ? null : "alert" }, UI.bankLoading ? "正在跟銀行拿資料……" : UI.bankErr ? `示範資料，不是你的帳戶：連不上銀行（${UI.bankErr}）。你的錢和股票都還在，等壹下再進來。` : "示範資料，不是你的帳戶：登入之後才看得到自己的錢和股票。") : null, PANES[tab](v)), side(v)),
    v.stocks ? ticker(v, tab === "stock") : null); // 股票還沒開：不畫今日行情（測試 11-13：空的行情條被切）
  mountMood(root, "bank"); // 房間效果：吊燈、景氣的冷暖、看板的光
};
// 導覽圖上的「銀行」熱區要不要放：伺服器的 bankHall 接上之後，Yuga 主 session 把這個改成 true（現在是示範資料，不給玩家點進來）
ADDONS.bankOpen = true; // 11-13 接上伺服器了（存款、借款、館債）；股票、財報寫「即將開放」
ADDONS.bankHall = { fake: fakeBankHall, open: () => navTo("bank") }; // 賭場那顆「去銀行」可以用（Yuga 主 session）
