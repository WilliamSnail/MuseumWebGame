// ================================================================
//  Yuga Bot 銀行廳（11-13，美術統籌；版面草稿在 Design 畫布「Yuga Bot 銀行廳：版面草稿」）
//  翊文 11-13：「銀行功能多了可以直接開成另一個新大廳，賭場裡面的簡單銀行功能少點沒關係」「用現有的延伸」。
//  壹個畫面看得完（docs/介面整合規劃.md 第六步，onescreen 骨架）：標題壹行｜頁籤（存款、借款、館債、股票、財報）｜主區：頁籤的內容｜右欄：我的帳戶、景氣、今日新聞｜最下面：今日行情
//  資料：伺服器的 casino act "bankHall" 回 { bankHall }（格式：docs/經濟體系規劃.md 2.7；Yuga 主 session 定）。還沒接上的時候用示範資料（畫面上寫「示範資料」）。
//  動作：存款 act bank（op put／take／term／break）、借款 borrow、repay。還沒接上，按了只跳提示。
//  規則不寫在這裡：這個檔只畫畫面，數字都從 view 來。
// ================================================================
import { ADDONS, SCREENS, UI, btn, closeOnOutside, go, h, icon, miniLayer, navTo, note, rerender, setChips } from "./ui_core.js";
import { NET } from "./net_firebase.js";
import { CAS_BOND } from "../../shared/casino_text.js";
import { roomHead } from "./ui_screens1.js";

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
};
const TABS = [["report", "財報"], ["stock", "股票"], ["save", "存款"], ["loan", "借款"], ["bond", "館債"], ["auction", "拍賣"]]; // 拍賣不是這個廳的頁籤：按了直接進畫廊的「拍賣」頁籤（翊文 11-14） // 翊文 11-14：財報最左邊第一個，第二個是股票
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
    { id: "neon", name: "霓虹顯卡", line: "館外・世界版", fresh: true, market: "us", price: 231, chg: 0.017, hist: [220, 224, 226, 225, 227, 227, 231], mine: 0, kind: "out" },
    { id: "sand", name: "紅砂晶片", stale: "今天沒有新行情（外面的資料還沒到），股價先停著。", line: "館外・世界版", price: 64, chg: -0.011, hist: [66, 66, 65, 65, 66, 65, 64], mine: 0, kind: "out" },
    { id: "night", name: "夜市指數", line: "館外・世界版", price: 540, chg: 0.003, hist: [535, 537, 538, 538, 539, 538, 540], mine: 0, kind: "out" },
    { id: "handbrain", name: "掌心晶片鋪", line: "手機晶片", real: { sym: "2454", px: 1235, chg: 0.012 }, mult: 24, price: 1250, chg: 0.012, mine: 0, kind: "out", market: "tw", twState: "open", halted: false, intraday: demoSeries(1235, 135, 7), intradayFrom: 0, fresh: true },
    { id: "appleshop", name: "銀蘋果工坊", line: "美股・手機", real: { sym: "AAPL", px: 189.52, chg: -0.003 }, mult: 4, price: 9971, chg: -0.003, mine: 0, kind: "out", market: "us", usState: "pre", halted: true, intraday: [], intradayFrom: 0 },
    { id: "linetower", name: "島線電話行", line: "電信", price: 118, chg: 0, mine: 0, kind: "out", market: "tw", twState: "closed", halted: true, intraday: [], intradayFrom: 0 },
  ];
  stocks.forEach(x => { x.value = x.price * x.mine; x.tax = x.market === "in" ? 0 : 0.05; if (x.mine > 0) { x.avgCost = Math.round(x.price * 0.93 * 100) / 100; x.costTotal = Math.round(x.avgCost * x.mine); x.dayChg = Math.round(x.value * x.chg / (1 + x.chg)); x.dayPct = x.chg; x.pnl = x.value - x.costTotal; x.pnlPct = x.pnl / x.costTotal; } });
  const stockVal = stocks.reduce((n, s) => n + s.price * s.mine, 0) * 100;
  return {
    demo: true,
    cash: 8200000,
    save: { save: 12500000, earned: 12500, savePct: 0.001, perDay: 12500, min: 100000, termMin: 1000000, termCap: 20000000, termMax: 3, quick: [1000000, 5000000, 10000000],
      terms: [{ id: "t1", amt: 5000000, days: 7, pct: 0.03, due: "11-17", int: 150000, left: 4 }, { id: "t2", amt: 2000000, days: 3, pct: 0.01, due: "11-14", int: 20000, left: 1 }],
      kinds: [{ i: 0, days: 3, pct: 0.01 }, { i: 1, days: 7, pct: 0.03 }] },
    loan: { left: 8000000, limit: 10000000, pct: 0.1, days: 3, quick: [1000000, 2000000, 5000000], min: 500000, why: "",
      list: [{ id: "l1", amt: 2000000, owe: 2200000, day: "11-12", due: "11-15", today: false, from: "莊家" }] },
    bonds: { issue: { name: "B2 修繕債", line: "這週 B2 的白布要換新，莊家向館友借錢。", pct: 0.02, left: 21500000, cap: 30000000, mine: 1000000, due: "11-17" }, held: [{ id: "b1", amt: 1000000, int: 6000, due: "11-17" }], state: "健康" },
    stocks: { list: stocks, taxPct: 0.05, fee: 0.005, halt: false, inCap: 1000, inSellLeft: 2000000, inExposeLeft: 8000000, inRule: "館內五家店的股價跟店的生意走，每天 05:00～23:30 每 15 分鐘動壹次。", usOpenAt: Date.now() + 3 * 3600000, us: { state: "pre", from: 570, len: 390 }, tw: { state: "open", from: 540, len: 270 }, inDay: { from: 300, len: 75, step: 15 }, haltFrom: 22, haltTo: 5, sellLeft: 2000000, feePaid: 18400,
      lev: { max: 5, byMarket: { in: 2, tw: 5, us: 0 }, owed: 120000, owedText: "館內股今天賺的超過館方當天能賠的上限，還有 120,000 記成欠條，明天補發。", usWhy: "美股槓桿還沒開放（美股盤中時間跟台灣晚上對不上，風險太大）。", opensLeft: 2, opensMax: 3, fee: 0.005, interest: 0.0015, borrow: 0.003, force: 0.5, rule: "" }, credit: { pts: 17, level: 3, name: "穩當", maxLev: 3, next: 3, nextText: "再 3 點信用升到 4 級，就能開到 5×。", nextUnlock: { level: 4, lev: 5, pts: 20 }, why: "準時還款、定存到期都會加信用點，等級越高部位上限越大。", posLimit: 32000000, posUsed: 11000000 },
      positions: [{ id: "p1", no: 1, sid: "handbrain", name: "掌心晶片鋪", market: "tw", side: "long", lev: 5, qty: 4000, n: 4000, margin: 1000000, entry: 1250, now: 1230, ratio: 0.82, liqPx: 1125, liq: 1125, maintPct: 82, pnl: -80000, openedDay: "2026-11-14", dayTrade: true, stop: null, take: null }, { id: "p2", no: 2, sid: "cellar", name: "地下收藏庫", market: "in", side: "short", lev: 2, qty: 12000, n: 12000, margin: 600000, entry: 87, now: 91, ratio: 0.64, liqPx: 108, liq: 108, maintPct: 64, pnl: -48000, openedDay: "2026-11-14", dayTrade: true, stop: null, take: null }],
      orders: [{ no: 1, kind: "buy", kindName: "限價買", id: "sand", name: "紅砂晶片", n: 5000, px: 60, now: 64, day: "2026-11-14", exp: "2026-11-16", lock: 301500, lockShares: 0 }, { no: 2, kind: "stop", kindName: "停損賣", id: "food", name: "餐車", n: 20, px: 95, now: 102, day: "2026-11-14", exp: "2026-11-16", lock: 0, lockShares: 20 }], orderLeft: 8, orderMax: 10, orderPerStock: 3, orderDays: 3, cancelLeft: 20, lockChips: 301500,  margin: { owe: 1200000, ratio: 1.84, limit: 2000000, pct: 0.005 }, maker: [{ who: "莊家", does: "霓虹顯卡 20 萬股、夜市指數 5 萬股" }, { who: "老會計", does: "餐車、委託櫃台" }, { who: "小學徒", does: "手作坊（追漲）" }, { who: "守夜人", does: "紅砂晶片（逆勢）" }] },
    econ: { gdp: 3520000, growth: 0.032, idx: 0.68, news: "昨天的烤雞肉多賣了 300 份，餐車股今天小漲。館方預算池充裕，利息照發。", report: [["餐車", "賣出 412 份"], ["21 點", "共 380 手"], ["拚經濟", "成功 9 次"], ["門票", "收入 62,000"]],
},
    world: { days: [{ day: "2026-11-13", items: [{ title: "晶片股走強", line: "手機晶片帶頭，電子股壹起收紅。", tone: "up", refs: [{ id: "handbrain", name: "掌心晶片鋪" }] }, { title: "科技股回檔", line: "獲利了結，美股科技股收黑。", tone: "down", refs: [{ id: "appleshop", name: "銀蘋果工坊" }] }, { title: "航運持平", line: "運價沒有大消息，盤整。", tone: "flat", refs: [] }] }, { day: "2026-11-12", items: [{ title: "電信小漲", line: "穩定型的股票受到青睞。", tone: "up", refs: [{ id: "linetower", name: "島線電話行" }] }] }] },
    net: 8200000 + 12500000 + 7000000 + stockVal - 2200000 - 1200000,
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
    held: d.list.map((x, i) => ({ id: i, amt: x.amt, int: x.int, due: md(x.due) })), iou: d.iou,
    state: d.issue.pct <= 4 ? "健康" : d.issue.pct <= 6 ? "吃緊" : "缺錢",
  } : null;
  return {
    demo: false, cash: b.cash, net: b.net,
    save: Object.assign({}, s, { savePct: P100(s.savePct), terms: s.terms.map(t => Object.assign({}, t, { pct: P100(t.pct), due: md(t.due) })), kinds: s.kinds.map(k => Object.assign({}, k, { pct: P100(k.pct) })) }),
    loan: Object.assign({}, l, { pct: P100(l.pct), list: l.list.map(x => Object.assign({}, x, { day: md(x.day), due: md(x.due), at: x.from, from: "莊家" })) }),
    bonds, stocks: b.stocks, econ: b.econ, world: b.world || null,
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
// 做壹件事：act 是 casino 的動作（bank、borrow、repay），回答有 bankHall 就換上
async function bankDo(act, data) {
  if (!UI.bankHall || UI.bankHall.demo) { note("示範資料：登入之後才能動錢。"); return; }
  if (UI.bankBusy) return;
  UI.bankBusy = true;
  try {
    const r = await NET.call("casino", Object.assign({ act }, data));
    if (!r || !r.ok) { note((r && r.reason) || "沒辦法", "bad"); return; }
    if (r.bankHall) { UI.bankHall = bankHallView(r.bankHall); UI.bankAt = Date.now(); }
    if (r.wallet) setChips(r.wallet.chips);
    (r.lines || []).concat(r.bankNotes || []).forEach(t => note(t, "good"));
  } catch (e) { note((e && e.message) || "連不上銀行", "bad"); }
  finally { UI.bankBusy = false; if (UI.screen === "bank") rerender(); }
}
// 挑金額的小視窗：amts 是 [金額, 文字]，按了叫 then(金額)
function pickAmt(title, sub, amts, then) {
  const m = miniLayer(title, sub);
  const ok = amts.filter(([n]) => n > 0);
  m.card.append(h("div", { class: "bank-acts bank-pick" }, ok.length ? ok.map(([n, t]) => btn(t || fmt(n), () => { m.close(); then(n); }, "big bank-btn")) : h("p", { class: "bank-why" }, "金額不夠。")),
    btn("取消", () => m.close(), "small"));
  closeOnOutside(m);
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
  amt => { const m = miniLayer(`定存 ${fmt(amt)}`, "存幾天？到期自動回到活存。"); m.card.append(h("div", { class: "bank-acts bank-pick" }, s.kinds.map(k => btn(`${k.days} 天 ${pctText(k.pct)}（+${fmt(Math.floor(amt * k.pct))}）`, () => { m.close(); bankDo("bank", { op: "term", amt, kind: k.i }); }, "big bank-btn gold"))), btn("取消", () => m.close(), "small")); closeOnOutside(m); }), "small bank-btn gold"))));
  return h("div", { class: "bank-cols" },
    panel("活存", "隨時可以領，每天 05:00 給利息",
      h("div", { class: "bank-big" }, pic("jar", "jar"), num("big", fmt(s.save))),
      h("p", { class: "bank-meta" }, "利率 ", h("b", { class: "good" }, `${pctText(s.savePct)}／天`), "　昨天利息 ", h("b", { class: "good" }, sign(s.earned))),
      h("div", { class: "bank-acts" }, btn("存入", () => pickAmt("存進活存", "從手上的籌碼搬進活存", quickOf(s.quick, v.cash, s.min).concat(v.cash >= s.min ? [[v.cash, `全部 ${fmt(v.cash)}`]] : []), amt => bankDo("bank", { op: "put", amt })), "primary big bank-btn gold"),
        btn("提出", () => pickAmt("從活存領出", "搬回手上的籌碼", quickOf(s.quick, s.save).concat(s.save > 0 ? [[s.save, `全部 ${fmt(s.save)}`]] : []), amt => bankDo("bank", { op: "take", amt })), "big bank-btn")),
      h("p", { class: "bank-hint" }, "利息由莊家付。莊家缺錢的時候，利息會停發，這裡會寫「莊家吃緊」。")),
    panel("定存", `3 天 1%、7 天 3%，同時最多 ${s.termMax} 筆`,
      h("div", { class: "bank-safe" }, pic("safe", "safe"), h("small", null, `存了 ${s.terms.length} 筆，鎖到期才領得到利息`)),
      ledger(["期間", "本金 → 到期", ""], termRows)));
}
function loanPane(v) {
  const l = v.loan;
  const rows = l.list.map(x => h("div", { class: "bank-row", role: "row" },
    h("span", null, h("b", null, `借 ${fmt(x.amt)}`), h("small", null, `${x.day} 借自${x.from}`)),
    h("span", { class: "bank-tab-num" }, `要還 ${fmt(x.owe)}`, h("small", { class: x.today ? "bad" : "" }, x.today ? "今天到期" : `${x.due} 到期`)),
    // 借了 15 分鐘內不能還：寫幾點起可以還，不要只把按鈕淡掉（測試 11-13）；籌碼不夠也寫出來
    h("span", { class: "bank-r" }, x.at && Date.now() < x.at
      ? h("small", { class: "bank-soon" }, `${new Date(x.at).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Taipei" })} 起可還`)
      : v.cash < x.owe ? h("small", { class: "bank-soon bad" }, "籌碼不夠還") : btn("還錢", () => bankDo("repay", { id: x.id }), "small bank-btn gold"))));
  if (!rows.length) rows.push(h("p", { class: "bank-empty" }, "沒有欠款。"));
  return h("div", { class: "bank-cols" },
    panel("借款", `${l.days} 天內還，利息 ${pctText(l.pct)}`,
      num("big", fmt(l.left)),
      h("p", { class: "bank-meta" }, "還可以借　上限 ", h("b", null, fmt(l.limit))),
      h("div", { class: "bank-acts" }, l.why ? null : l.quick.filter(q => q <= l.left).map(q => btn(fmt(q), () => bankDo("borrow", { amt: q }), "big bank-btn"))),
      l.why ? h("p", { class: "bank-why" }, l.why) : h("p", { class: "bank-hint" }, "借的錢從莊家出，到期沒還會被直接扣；借款利息比存款、館債都高。")),
    panel("欠的錢", "還的時候本金加利息", ledger(["借的", "要還", ""], rows)));
}
function bondPane(v) {
  const b = v.bonds;
  if (!b) return panel("館債", "", h("p", { class: "bank-empty" }, "這週沒有發館債。"));
  const i = b.issue, used = 1 - i.left / i.cap;
  return h("div", { class: "bank-cols" },
    panel(i.name, `每週一期，到 ${i.due}`,
      h("p", { class: "bank-line" }, i.line),
      h("p", { class: "bank-meta" }, "這期利率 ", h("b", { class: "good" }, `${pctText(i.pct)}／週`), "　莊家", h("b", null, b.state || "健康")),
      h("div", { class: "bank-meter", role: "img", "aria-label": `已發 ${(used * 100).toFixed(0)}%` }, h("i", { style: { width: used * 100 + "%" } })),
      h("p", { class: "bank-meta" }, `還剩 ${fmt(i.left)} ／ 一共 ${fmt(i.cap)}`),
      h("div", { class: "bank-acts" }, i.young ? h("p", { class: "bank-why" }, `帳號開了 3 天以上才能買（還要 ${i.young} 天）。`) : null,
        btn("買 100,000", () => bankDo("bank", { op: "bond", amt: 100000 }), "primary big bank-btn gold", { disabled: i.young || v.cash < 100000 || i.left < 100000 ? true : null }),
        btn("買 500,000", () => bankDo("bank", { op: "bond", amt: 500000 }), "big bank-btn", { disabled: i.young || v.cash < 500000 || i.left < 500000 ? true : null })),
      h("p", { class: "bank-hint" }, "到期還本金加利息；不能提早贖回、不能轉讓。")),
    panel("我持有的", `共 ${fmt(i.mine)}`,
      ledger(["金額", "到期拿到", ""], b.held.map(x => h("div", { class: "bank-row", role: "row" }, h("span", null, h("b", null, fmt(x.amt))), h("span", { class: "bank-tab-num" }, `${fmt(x.amt + x.int)}（${x.due}）`), h("span", null)))) ));
}
// 還沒做的頁籤（股票、財報）：伺服器給 null 的時候
const soon = (title, what) => h("div", { class: "bank-cols" }, panel(title, "即將開放", h("p", { class: "bank-empty" }, what)));
// ---------- 股票頁（11-14 美術統籌重做；資料格式見 docs/經濟體系規劃.md 2.8） ----------
// 左：行情表，依來源分組（館內五家店、台股、館外）。右：選中的那支——走勢線、交易（現股／槓桿／掛單）、我的部位、掛著的單。
// 下面「假設」的欄位（伺服器還沒給，示範資料先照這個畫；實作好了再對齊）：
//   cur.session = { state: "open"|"closed"|"pre"|"noopen"|"holiday", from: "09:00", to: "13:30", step: 15, at: "10:15" }  cur.intraday = [價, …]（每 step 分鐘一個）
//   S.lev = { max: 5, opensLeft: 3, fee, interest: 0.0015, borrow: 0.003, force: 0.5 }（沒有就不畫「槓桿」頁籤）
//   S.positions = [{ id, sid, side: "long"|"short", lev, margin, n, entry, ratio, liq, pnl, stop, take }]   ratio＝剩下的保證金 ÷ 原本的（1＝100%；到 force 強平）
//   S.orders = [{ id, kind: "buy"|"sell"|"stop"|"cover", sid, px, n, lock, until, state }]（沒有就不畫「掛單」頁籤）  S.locked = { chips, shares: { sid: n } }
//   S.credit = { pts, level, next, posLimit, posUsed }  動作：op "open"、"close"、"order"、"cancel"（參數見下）
const STOCK_GROUPS = { out: "其他", us: "美股", in: "館內五家店", tw: "台股" };
const STOCK_GROUP_ORDER = ["in", "tw", "us", "out"];
const unitCost = (s, fee) => Math.ceil(s.price * (1 + fee)); // 買壹股要付的（含手續費）
// 真實行情的壹小段：代號、真實價（台股寫元、美股寫美元）、真實漲跌%。沒資料（null）就只寫代號
const realPx = (n, mk) => `${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${mk === "tw" ? "元" : "美元"}`;
function realBit(s) {
  const r = s.real;
  if (!r) return null;
  const c = typeof r.chg === "number" ? r.chg : null;
  return h("span", { class: "bank-real" }, h("i", { class: "bank-realtag", title: "真實：外面那支股票今天的漲跌。遊戲價只跟著真實漲跌的一部分，再加上館裡自己的小波動，每天開盤會往真實價拉回一點，所以兩個數字不會一樣。" }, "真實"), h("b", null, r.sym), r.px != null ? h("span", null, realPx(r.px, s.market)) : null,
    c != null ? h("em", { class: c > 0 ? "up" : c < 0 ? "down" : "" }, `${c > 0 ? "▲" : c < 0 ? "▼" : "－"} ${(Math.abs(c) * 100).toFixed(1)}%`) : null);
}
const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = t => { const [a, b] = String(t).split(":").map(Number); return a * 60 + (b || 0); };
const MK_NAME = { tw: "台股", us: "美股", in: "館內店" };
const SESS_TEXT = { closed: s => `今天已收盤（${s.to}）。`, pre: s => `${s.mk === "us" ? "美股台灣時間" : MK_NAME[s.mk] || ""} ${s.from} 開盤，拿到開盤價才開放買賣。`, pending: () => "已經開盤，還在等開盤價，拿到之前先不能買賣。", noopen: s => `今天${MK_NAME[s.mk] || ""}沒有開市。`, holiday: () => "今天休市。", halt: () => "停盤中（23:30～05:00），明天 05:00 開盤。" };
// 台股的場次（伺服器給 market "tw"、twState、intraday 每分鐘一個價、intradayFrom；外層 S.tw = { from: 540, len: 270 }）→ 畫面用的 session
const twClock = ms => { const t = new Date(ms + 8 * 3600000); return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`; }; // 毫秒 → 台灣時間 HH:MM
function twSess(S, s) {
  // 場次：台股 S.tw = { from: 540, len: 270 }（每分鐘一個價）；美股 S.us = { state, from: 570, len: 390 } 加 S.usOpenAt（開盤的毫秒，含夏令時間；intradayFrom 是距離開盤的分鐘）；館內店 S.inDay = { from: 300, len: 75, step: 15 }
  const tw = s.market === "tw", us = s.market === "us", n = (s.intraday || []).length, off = s.intradayFrom || 0;
  if (us) {
    const g = Object.assign({ from: 570, len: 390 }, S.us), open = S.usOpenAt;
    const raw = s.usState || (S.us && S.us.state) || "closed", state = raw === "closed" && !n ? "noopen" : raw;
    if (!open) return { state, mk: "us", from: "", to: "", mid: "", slots: g.len, step: 1, offset: off, at: "" };
    return { state, mk: "us", from: twClock(open), to: twClock(open + g.len * 60000), mid: twClock(open + g.len * 30000), slots: g.len, step: 1, offset: off, at: n ? twClock(open + (off + n - 1) * 60000) : "" };
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
// 走勢線：台股照 09:00～13:30 的時間軸畫（每分鐘一個價，右邊還沒走到的留白）；其他有 hist 就畫 hist。紅漲綠跌：整體比第壹點高畫紅。底圖用 CSS 畫的深藍格線
function chart(s) {
  const ss = s.session, pts = (ss ? s.intraday : s.hist) || [];
  const W = 240, H = 56, pad = 4, slots = ss ? ss.slots : pts.length, off = ss ? ss.offset : 0;
  let body = "";
  if (pts.length > 1 && !(ss && ss.state === "noopen")) {
    const lo = Math.min(...pts), hi = Math.max(...pts), span = Math.max(1e-9, hi - lo);
    const xy = pts.map((p, i) => [pad + (off + i) / Math.max(1, slots - 1) * (W - 2 * pad), H - pad - (p - lo) / span * (H - 2 * pad)]);
    const up = pts[pts.length - 1] >= pts[0], col = up ? "#FF8A78" : "#7FD39B", line = xy.map(p => p.map(n => n.toFixed(1)).join(",")).join(" "), last = xy[xy.length - 1], first = xy[0];
    const oy = H - pad - (pts[0] - lo) / span * (H - 2 * pad); // 開盤價的虛線
    body = `<line x1="${pad}" x2="${W - pad}" y1="${oy.toFixed(1)}" y2="${oy.toFixed(1)}" stroke="#A9B4C8" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/><polygon points="${first[0].toFixed(1)},${H} ${line} ${last[0].toFixed(1)},${H}" fill="${col}" opacity=".18"/><polyline points="${line}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3" fill="${col}"/>`;
  }
  const axis = ss ? h("div", { class: "bank-axis" }, h("span", null, ss.from), h("span", null, ss.mid), h("span", null, ss.to)) : null;
  const label = ss ? (ss.state === "open" ? `盤中，每${ss.step > 1 ? ` ${ss.step} ` : ""}分鐘更新一次${ss.at ? `，最新 ${ss.at}` : ""}。` : SESS_TEXT[ss.state](ss)) : "";
  if (!body && !ss) return null;
  return h("div", { class: "bank-chartbox" },
    h("div", { class: "bank-chart" + (ss && ss.state !== "open" ? " dim" : ""), role: "img", "aria-label": ss ? `走勢，${label}` : `走勢：從 ${fmt(pts[0])} 到 ${fmt(pts[pts.length - 1])}`, html: body ? `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${body}</svg>` : "" }, body ? null : h("p", { class: "bank-nochart" }, label)),
    axis, ss ? h("p", { class: "bank-sess " + ss.state }, label) : null);
}
// 買不了、賣不了的原因：壹次只講壹個（翊文 11-14：有錢卻壹直說「籌碼不夠」）
function whyNoBuy(v, S, cur) {
  if (stockHalt(S, cur)) return haltText(S, cur);
  if (v.cash < unitCost(cur, S.fee)) return `錢不夠：壹股 ${fmt(cur.price)}，加手續費要 ${fmt(unitCost(cur, S.fee))}，你現在有 ${fmt(v.cash)}。`;
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
function stockRows(list, cur, S) {
  const gk = s => (s.market === "tw" ? "tw" : s.market === "us" ? "us" : s.kind);
  const kinds = STOCK_GROUP_ORDER.filter(k => list.some(s => gk(s) === k)).concat([...new Set(list.map(gk))].filter(k => !STOCK_GROUP_ORDER.includes(k)));
  const rows = [], fresh = UI.bankFreshSnap || new Set();
  kinds.forEach(k => {
    if (kinds.length > 1) rows.push(h("div", { class: "bank-grp" }, STOCK_GROUPS[k] || "其他"));
    list.forEach((s, i) => {
      if (gk(s) !== k) return;
      const closed = s.session && s.session.state !== "open";
      rows.push(h("button", { type: "button", class: "bank-row stock" + (s === cur ? " on" : ""), role: "row", "aria-pressed": String(s === cur), onClick: () => { UI.bankStock = i; rerender(); } },
        h("span", null, h("b", null, s.name), fresh.has(s.id) ? h("i", { class: "bank-new", title: "價格有變動" }, "新") : null, s.stale ? h("i", { class: "bank-stale-tag" }, "未更新") : null, closed ? h("i", { class: "bank-stale-tag" }, s.session.state === "closed" ? "收盤" : s.session.state === "pre" || s.session.state === "pending" ? "未開" : s.session.state === "halt" ? "停盤" : "休市") : null, s.real ? h("small", { class: "ln real" }, realBit(s)) : h("small", { class: "ln" }, s.line)),
        h("span", { class: "bank-tab-num" }, fmt(s.price)), upDown(s.chg, true), h("span", { class: "bank-tab-num" }, s.mine ? `${fmt(s.mine)} 股` : "—")));
    });
  });
  return rows;
}
// ---------- 小零件：頁籤、數字欄、選項 ----------
const seg = (items, cur, onPick, cls) => h("div", { class: "bank-segs " + (cls || ""), role: "tablist" }, items.map(([k, t, dis]) => h("button", { type: "button", role: "tab", "aria-selected": String(k === cur), class: "bank-seg" + (k === cur ? " on" : ""), disabled: dis ? true : null, onClick: () => onPick(k) }, t)));
const form = () => (UI.bankForm || (UI.bankForm = { lev: 2, dir: "long", margin: 1000000, stopOn: true, stop: 3, takeOn: false, take: 5, okind: "buy", opx: "", on: "" }));
// 數字欄：打字的時候只更新旁邊的算式（不整頁重畫，不然游標會跑掉）
function numField(label, value, onChange, opts = {}) {
  const inp = h("input", { type: "number", inputmode: "decimal", class: "bank-in", value: value === "" ? "" : String(value), min: opts.min != null ? String(opts.min) : null, step: opts.step != null ? String(opts.step) : "any", "aria-label": label,
    onInput: e => onChange(e.target.value === "" ? "" : Number(e.target.value)) });
  return h("label", { class: "bank-field" }, h("span", null, label), inp, opts.unit ? h("em", null, opts.unit) : null);
}
const chips = (list, cur, onPick, fmtFn) => h("div", { class: "bank-chips" }, list.map(n => h("button", { type: "button", class: "bank-chip" + (n === cur ? " on" : ""), "aria-pressed": String(n === cur), onClick: () => onPick(n) }, fmtFn ? fmtFn(n) : fmt(n))));
// ---------- 交易：現股 ----------
function spotTrade(v, S, cur) {
  const side = UI.bankSide === "sell" && (cur.free != null ? cur.free : cur.mine) > 0 ? "sell" : "buy"; // 買／賣 二選壹，按鈕那排只畫壹排
  const trade = (op, n) => bankDo("stock", { op, id: cur.id, n });
  const halt = stockHalt(S, cur), one = unitCost(cur, S.fee);
  const inShop = cur.market === "in", expL = inShop ? S.inExposeLeft : S.exposeLeft, sellL = inShop ? S.inSellLeft : S.sellLeft, capL = inShop && S.inCap != null ? Math.max(0, S.inCap - cur.mine) : Infinity;
  const maxBuy = halt ? 0 : Math.max(0, Math.min(Math.floor(v.cash / one), capL, expL != null ? Math.floor(expL / Math.max(1, cur.price)) : Infinity));
  const maxSell = halt ? 0 : Math.max(0, Math.min(cur.free != null ? cur.free : cur.mine, sellL != null ? Math.floor(sellL / Math.max(1, cur.price)) : Infinity));
  const max = side === "buy" ? maxBuy : maxSell;
  const steps = [1, 10, 100].map(n => btn(`${n} 股`, () => trade(side, n), "big bank-btn", { disabled: n > max ? true : null }));
  steps.push(btn(max > 0 ? `${side === "buy" ? "買滿" : "全賣"} ${fmt(max)}` : `${side === "buy" ? "買滿" : "全賣"}`, () => trade(side, side === "buy" ? max : "max"), "primary big bank-btn gold", { disabled: max > 0 ? null : true }));
  const sellNote = ((inShop ? S.inSellLeft : S.sellLeft) != null ? `今天還能賣出約 ${fmt(inShop ? S.inSellLeft : S.sellLeft)} 的股票。` : "") + (cur.tax > 0 ? `賣出賺到的部分要繳 ${Math.round(cur.tax * 100)}% 資本利得稅（虧的不用繳）。` : "");
  return [
    seg([["buy", "買進"], ["sell", "賣出", !(cur.free != null ? cur.free : cur.mine)]], side, k => { UI.bankSide = k; rerender(); }),
    h("div", { class: "bank-acts" }, steps),
    max < 1 ? h("p", { class: "bank-why" }, side === "buy" ? whyNoBuy(v, S, cur) : whyNoSell(S, cur)) : null,
    h("p", { class: "bank-meta sm" }, side === "buy" ? `買 1 股要 ${fmt(one)}（含手續費）。` : sellNote)];
}
// ---------- 交易：槓桿、放空（當沖：當天平倉，23:30 前系統會自動平，台股 13:30 前） ----------
function levTrade(v, S, cur) {
  const L = S.lev, f = form(), halt = stockHalt(S, cur);
  const byM = L.byMarket && L.byMarket[cur.market], maxLev = byM != null ? byM : L.max, lev = Math.max(1, Math.min(f.lev, maxLev)), long = f.dir === "long"; // 各市場最高幾倍（美股 0＝不能開，寫 usWhy）
  const roomMargin = S.credit ? Math.max(0, Math.floor((S.credit.posLimit - S.credit.posUsed) / Math.max(1, lev))) : Infinity;
  const maxMargin = Math.max(0, Math.min(v.cash, roomMargin));
  const phone = window.innerWidth < 761 || window.innerHeight < 501;
  const sum = h("details", { class: "bank-sum", open: phone ? null : "" });
  const calc = () => {
    const m = Math.min(f.margin || 0, maxMargin), pos = m * lev, feeAmt = Math.ceil(pos * L.fee), carry = Math.ceil((long ? pos - m : pos) * (long ? L.interest : L.borrow));
    const liq = cur.price * (long ? 1 - L.force / lev : 1 + L.force / lev);
    const stopPx = f.stopOn && f.stop > 0 ? Math.round(cur.price * (long ? 1 - f.stop / 100 : 1 + f.stop / 100)) : null, takePx = f.takeOn && f.take > 0 ? Math.round(cur.price * (long ? 1 + f.take / 100 : 1 - f.take / 100)) : null;
    sum.replaceChildren(
      h("summary", null, h("b", null, `部位 ${fmt(pos)}`), h("span", null, `強平價約 ${fmt(Math.round(liq))}`), h("span", { class: "bank-sum-open" }, "點開 ▾")),
      h("p", null, h("span", null, "部位"), h("b", null, `${fmt(pos)}`), h("small", null, ` ＝ ${lev}× 保證金 ${fmt(m)}`)),
      h("p", null, h("span", null, "手續費＋" + (long ? "利息" : "借券費")), h("b", null, fmt(feeAmt + carry)), h("small", null, ` （手續費 ${pctText(L.fee)}，${long ? "利息 " + pctText(L.interest) : "借券費 " + pctText(L.borrow)}）`)),
      h("p", { class: "warn" }, h("span", null, "強制平倉價"), h("b", null, `約 ${fmt(Math.round(liq))}`), h("small", null, ` （保證金剩 ${Math.round(L.force * 100)}% 就平倉）`)),
      stopPx ? h("p", null, h("span", null, "停損價"), h("b", null, fmt(stopPx))) : null, takePx ? h("p", null, h("span", null, "停利價"), h("b", null, fmt(takePx))) : null);
    return m;
  };
  const m0 = calc();
  const liqPct = L.force / lev * 100; // 強平價離現價幾 %：停損要比這個近
  const stopP = f.stopOn && f.stop > 0 ? Math.round(cur.price * (long ? 1 - f.stop / 100 : 1 + f.stop / 100)) : null, takeP = f.takeOn && f.take > 0 ? Math.round(cur.price * (long ? 1 + f.take / 100 : 1 - f.take / 100)) : null;
  const ocoBad = f.stopOn && f.stop >= liqPct ? `停損要比強平價更靠近現價：最多 ${(liqPct - 0.1).toFixed(1)}%。` : "";
  const open = () => bankDo("stock", { op: "open", id: cur.id, dir: f.dir, lev, margin: Math.min(f.margin, maxMargin), stop: stopP, take: takeP });
  const why = maxLev <= 0 ? (L.usWhy || "這個市場現在不能開槓桿。") : halt ? haltText(S, cur) : L.opensLeft < 1 ? `今天開倉的筆數用完了（壹天最多 ${L.opensMax || 3} 筆），明天再來。` : maxMargin < 100000 ? (v.cash < 100000 ? "錢不夠付保證金。" : "部位上限到了，先平掉壹些。") : "";
  return [
    seg([["long", "做多 ▲"], ["short", "放空 ▼"]], f.dir, k => { f.dir = k; rerender(); }),
    h("div", { class: "bank-fld" }, h("span", { class: "bank-fl" }, "倍數"), chips([1, 2, 3, 5].filter(n => n <= maxLev), lev, n => { f.lev = n; rerender(); }, n => `${n}×`)),
    h("div", { class: "bank-fld" }, h("span", { class: "bank-fl" }, "保證金"), chips([100000, 500000, 1000000, 5000000].filter(n => n <= maxMargin), Math.min(f.margin, maxMargin), n => { f.margin = n; rerender(); }, n => fmt(n / 10000) + " 萬")),
    sum,
    h("div", { class: "bank-ocos" },
      h("label", { class: "bank-check" }, h("input", { type: "checkbox", checked: f.stopOn ? "" : null, onChange: e => { f.stopOn = e.target.checked; rerender(); } }), "順便設停損"), f.stopOn ? numField("虧", f.stop, x => { f.stop = x || 0; calc(); }, { unit: "% 就賣", min: 0.1, step: 0.5 }) : null,
      h("label", { class: "bank-check" }, h("input", { type: "checkbox", checked: f.takeOn ? "" : null, onChange: e => { f.takeOn = e.target.checked; rerender(); } }), "順便設停利"), f.takeOn ? numField("賺", f.take, x => { f.take = x || 0; calc(); }, { unit: "% 就賣", min: 0.1, step: 0.5 }) : null),
    h("div", { class: "bank-acts one" }, btn(`${long ? "開多單" : "開空單"} ${lev}×`, open, "primary big bank-btn gold", { disabled: why || ocoBad || m0 <= 0 ? true : null })),
    why || ocoBad ? h("p", { class: "bank-why" }, why || ocoBad) : null,
    S.credit ? h("p", { class: "bank-meta sm bank-creditline" }, `信用 ${S.credit.level} 級・最高 ${S.credit.maxLev}×・部位 ${fmt(Math.round(S.credit.posUsed / 10000))} 萬／${fmt(Math.round(S.credit.posLimit / 10000))} 萬`) : null,
    S.credit && S.credit.nextText ? h("p", { class: "bank-meta sm bank-nextunlock" }, S.credit.nextText) : null,
    L.owedText ? h("p", { class: "bank-stale" }, h("b", null, "欠條　"), L.owedText) : null,
    h("p", { class: "bank-meta sm" }, `今天還能開 ${L.opensLeft} 筆。當天一定平倉：${cur.market === "tw" ? "台股 13:30" : "23:30"} 前沒平，系統會替你平。`)];
}
// ---------- 交易：掛單（限價買、限價賣、停損賣） ----------
const KIND_TEXT = { buy: "限價買", sell: "限價賣", stop: "停損賣" };
const expText = d => (d ? String(d).slice(5).replace("-", "/") : ""); // 2026-11-17 → 11/17
function orderTrade(v, S, cur) {
  const f = form(), k = f.okind, halt = stockHalt(S, cur);
  if (f.opx === "" || f.opxFor !== cur.id + k) { f.opx = Math.max(1, Math.round(cur.price * (k === "buy" ? 0.98 : k === "sell" ? 1.02 : 0.97))); f.opxFor = cur.id + k; f.on = f.on || 1; }
  const info = h("p", { class: "bank-meta sm" });
  const calc = () => {
    const n = f.on || 0, px = f.opx || 0;
    info.textContent = k === "buy" ? `會先鎖住 ${fmt(Math.ceil(px * n * (1 + S.fee)))} 籌碼（價格到 ${fmt(px)} 以下才買，成交價照當時的價，多的退回）。`
      : `會先鎖住這 ${fmt(n)} 股（價格到 ${fmt(px)} ${k === "sell" ? "以上" : "以下"}才賣，成交價照當時的價）。`;
    return n > 0 && px > 0;
  };
  const okNow = calc();
  const lockNow = k === "buy" ? Math.ceil((f.opx || 0) * (f.on || 0) * (1 + S.fee)) : 0, free = k === "buy" ? v.cash : (cur.free != null ? cur.free : cur.mine); // 真資料的 cash 已經扣掉鎖在買單裡的
  const mineHere = (S.orders || []).filter(o => o.id === cur.id).length, px = f.opx || 0, n = f.on || 0;
  const why = halt ? haltText(S, cur) : (S.orderLeft != null ? S.orderLeft < 1 : (S.orders || []).length >= (S.orderMax || 10)) ? `掛著的單滿 ${S.orderMax || 10} 張了，先取消壹些。` : mineHere >= (S.orderPerStock || 3) ? `這支最多掛 ${S.orderPerStock || 3} 張，先取消壹張。`
    : k === "sell" && px <= cur.price ? `賣的價要比現價（${fmt(cur.price)}）高，現在就想賣請用「現股」。` : k !== "sell" && px >= cur.price ? `${k === "buy" ? "買" : "停損"}的價要比現價（${fmt(cur.price)}）低，現在就想買請用「現股」。`
    : (k === "buy" ? lockNow > free : n > free) ? (k === "buy" ? "錢不夠鎖。" : "你沒有那麼多股可以鎖。") : "";
  return [
    seg([["buy", "限價買"], ["sell", "限價賣", !(cur.free != null ? cur.free : cur.mine)], ["stop", "停損賣", !(cur.free != null ? cur.free : cur.mine)]], k, x => { f.okind = x; f.opx = ""; rerender(); }),
    h("div", { class: "bank-fields" }, numField("跌到", f.opx, x => { f.opx = x; calc(); }, { unit: "就" + (k === "buy" ? "買" : "賣"), min: 1, step: 1 }), numField("股數", f.on, x => { f.on = x; calc(); }, { unit: "股", min: 1, step: 1 })),
    info,
    h("div", { class: "bank-acts one" }, btn("掛單", () => bankDo("stock", { op: "order", id: cur.id, kind: k, px: f.opx, n: f.on }), "primary big bank-btn gold", { disabled: why || !okNow ? true : null })),
    why ? h("p", { class: "bank-why" }, why) : null,
    h("p", { class: "bank-meta sm" }, (cur.market === "tw" ? "台股的單當天 13:30 收盤沒成交就取消。" : cur.market === "in" ? "館內股的單當天 23:30 沒成交就取消。" : "") + (S.orderRule || `現股的單最多掛 ${S.orderDays || 3} 天；成交才收手續費，取消全額退回。停盤時不能掛、不能取消。`))];
}
// ---------- 我的部位、掛著的單 ----------
function positionCard(S, p, list) {
  const st = list.find(x => x.id === p.sid) || { name: p.name, price: p.now, market: p.market }, long = p.side === "long", force = S.lev ? S.lev.force : 0.5;
  const price = p.now != null ? p.now : st.price, liq = p.liqPx != null ? p.liqPx : p.liq, danger = p.ratio <= 0.7, meter = Math.max(0, Math.min(1, (p.ratio - force) / (1 - force)));
  return h("div", { class: "bank-pos" + (danger ? " danger" : "") },
    h("div", { class: "bank-pos-h" }, h("b", null, p.name || st.name), h("i", { class: "bank-dir " + (long ? "long" : "short") }, `${long ? "做多" : "放空"} ${p.lev}×`), h("span", { class: "bank-pos-pnl " + (p.pnl > 0 ? "up" : p.pnl < 0 ? "down" : "") }, `${p.pnl > 0 ? "▲ +" : p.pnl < 0 ? "▼ −" : ""}${fmt(Math.abs(p.pnl))}`)),
    h("p", { class: "bank-pos-m" }, h("span", null, `保證金 ${fmt(p.margin)}`), h("span", null, `進場 ${fmt(p.entry)}`), h("span", null, `現價 ${fmt(price)}`), h("span", { class: "warn" }, `強平價 ${fmt(liq)}`)),
    h("div", { class: "bank-ratio", role: "img", "aria-label": `維持率 ${Math.round(p.ratio * 100)}%` }, h("i", { style: { width: meter * 100 + "%" } }), h("span", null, `維持率 ${Math.round(p.ratio * 100)}%`)),
    danger ? h("p", { class: "bank-why" }, `保證金快不夠了：剩 ${Math.round(force * 100)}% 就會被強制平倉。`) : null,
    h("div", { class: "bank-pos-f" }, h("small", { class: p.stop || p.take ? "has-oco" : "" }, `${p.stop || p.take ? `停損 ${p.stop ? fmt(p.stop) : "—"}・停利 ${p.take ? fmt(p.take) : "—"}` : `${p.market === "tw" ? "台股 13:30" : "23:30"} 前沒平，系統會替你平`}`),
      btn("停損停利", () => editOco(S, p, price), "small bank-btn", { disabled: stockHalt(S, st) ? true : null }),
      btn("平倉", () => bankDo("stock", { op: "close", pid: p.id }), "small bank-btn gold", { disabled: stockHalt(S, st) ? true : null })));
}
// 改停損停利（op levset：pid、stop、take；沒給的不動，空值或 0 是清掉）。價格，不是百分比
function editOco(S, p, price) {
  const long = p.side === "long", m = miniLayer(`${p.name} 的停損停利`, long ? "做多：停損 < 現價 < 停利。停損要比強平價更靠近現價。" : "放空：停利 < 現價 < 停損。停損要比強平價更靠近現價。");
  const st = { stop: p.stop || "", take: p.take || "" };
  m.card.append(h("p", { class: "bank-meta sm" }, `現價 ${fmt(price)}・強平價 ${fmt(p.liqPx != null ? p.liqPx : p.liq)}　空著或寫 0 就是不設。`),
    h("div", { class: "bank-fields" }, numField("停損價", st.stop, x => { st.stop = x; }, { min: 0, step: 1 }), numField("停利價", st.take, x => { st.take = x; }, { min: 0, step: 1 })),
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
      h("span", { class: "bank-order-d" }, `${o.kind === "sell" ? "≥" : "≤"} ${fmt(o.px)} × ${fmt(o.n)} 股`, h("small", null, `${lockText(o)}・現價 ${fmt(o.now)}・到 ${expText(o.exp)}${o.market === "in" ? " 23:30" : o.market === "tw" ? " 13:30" : ""}`)),
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
  const hs = list.filter(x => x.mine > 0), H = UI.bankHold || (UI.bankHold = { a: "total", b: "unit", c: "value" });
  const tog = (k, a, b, la, lb) => h("button", { type: "button", class: "bank-hh", onClick: () => { H[k] = H[k] === a ? b : a; rerender(); }, "aria-label": `切換：${la}、${lb}` }, h("span", null, H[k] === a ? la : lb), h("i", { "aria-hidden": "true" }, "⇄"));
  const sum = (key) => hs.reduce((n, x) => n + (Number(x[key]) || 0), 0), tv = sum("value"), tc = sum("costTotal"), tp = sum("pnl"), td = sum("dayChg");
  const rows = hs.map(s => h("button", { type: "button", class: "bank-row hold", role: "row", onClick: () => { UI.bankLeft = "market"; UI.bankStock = list.indexOf(s); rerender(); } },
    h("span", null, h("b", null, s.name), s.market ? h("i", { class: "bank-mk" }, s.market === "tw" ? "台股" : s.market === "us" ? "美股" : "館內") : null),
    h("span", { class: "bank-tab-num" }, H.c === "value" ? fmt(s.value) : `${fmt(s.mine)} 股`),
    h("span", { class: "bank-tab-num" }, H.b === "unit" ? dec2(s.avgCost) : fmt(s.costTotal)),
    H.a === "day" ? plBit(s.dayChg, s.dayPct) : plBit(s.pnl, s.pnlPct)));
  return panel("持倉", S.taxPct ? `賣出賺的部分課 ${Math.round(S.taxPct * 100)}% 資本利得稅` : "", h("div", { class: "bank-book hold", role: "table" },
    h("div", { class: "bank-bh", role: "row" }, h("span", null, "名稱"), tog("c", "value", "qty", "市值", "數量"), tog("b", "unit", "total", "單位成本", "總成本"), tog("a", "day", "total", "當日變更", "總漲跌")),
    hs.length ? rows : h("div", { class: "bank-row empty", role: "row" }, h("span", null, "你還沒有持股"), h("span", null, "—")),
    hs.length ? h("div", { class: "bank-row hold sum", role: "row" }, h("span", null, h("b", null, "合計")), h("span", { class: "bank-tab-num" }, fmt(tv)), h("span", { class: "bank-tab-num" }, fmt(tc)), H.a === "day" ? plBit(td) : plBit(tp, tc > 0 ? tp / tc : null)) : null));
}
function stockPane(v) {
  if (!v.stocks) return soon("股票", "館內五家店和館外股票（跟著真的漲跌）正在準備，開放時館方公告會說。");
  const S = v.stocks, list = S.list, cur = list[Math.min(UI.bankStock || 0, list.length - 1)];
  list.forEach(x => { if (x.market === "tw" || x.market === "in" || x.market === "us") x.session = twSess(S, x); });
  markSeen(v, list);
  const inShop = cur.market === "in"; // 館內股只有現股
  const tabs = [["spot", "現股"]].concat(S.lev ? [["lev", "槓桿・放空"]] : [], S.orders ? [["order", "掛單"]] : []);
  const tab = tabs.some(t => t[0] === UI.bankTrade) ? UI.bankTrade : "spot";
  const phone = window.innerWidth < 761 || window.innerHeight < 501;
  const left = UI.bankLeft === "hold" ? "hold" : "market";
  const table = h("div", { class: "bank-leftcol" }, seg([["market", "行情"], ["hold", "持倉"]], left, k => { UI.bankLeft = k; rerender(); }, "kind"),
    left === "hold" ? holdPanel(v, S, list) : panel("行情", `手續費 ${pctText(S.fee)}${S.feePaid ? `・累計付過 ${fmt(S.feePaid)}` : ""}`, ledger(["名稱", "遊戲價", "今天（遊戲）", "持股"], stockRows(list, cur, S), "stocks")));
  return h("div", { class: "bank-cols stocks", dataset: { trade: tab } },
    phone ? h("details", { class: "bank-allstocks" }, h("summary", null, h("b", null, "行情・持倉"), h("span", null, "點開 ▾")), table) : table,
    h("div", { class: "bank-stack" },
      panel(cur.name, cur.line,
        h("div", { class: "bank-quote" }, num("big", fmt(cur.price)), upDown(cur.chg, true)),
        cur.real ? h("p", { class: "bank-meta sm bank-realline" }, "真實：外面那支股票今天的漲跌。", realBit(cur), cur.mult ? h("small", null, `　遊戲價大約是真實價的 ${cur.mult} 倍。`) : null) : null,
        chart(cur),
        cur.stale ? h("p", { class: "bank-stale" }, h("b", null, "未更新　"), cur.stale) : null,
        cur.market === "in" && cur.quiet ? h("p", { class: "bank-stale" }, h("b", null, "沒調價　"), "昨天來這家店的人太少，今天價格先不動。") : null,
        cur.market === "in" && cur.jump ? h("p", { class: "bank-stale" }, h("b", null, "開盤跳空　"), "今天開盤價跟昨天收盤差了壹截，是昨天的生意帶出來的。") : null,
        cur.mine ? h("p", { class: "bank-meta" }, "你有 ", h("b", null, `${fmt(cur.mine)} 股`), "，現在值 ", h("b", null, fmt(cur.value)), cur.locked ? h("small", { class: "bank-lockn" }, `（${fmt(cur.locked)} 股鎖在賣單裡）`) : null) : h("p", { class: "bank-meta" }, "你還沒有這支。"),
        tabs.length > 1 ? seg(tabs, tab, k => { UI.bankTrade = k; rerender(); }, "kind") : null,
        tab === "lev" ? levTrade(v, S, cur) : tab === "order" ? orderTrade(v, S, cur) : spotTrade(v, S, cur),
        h("p", { class: "bank-hint" }, cur.real ? "遊戲價只跟著真實漲跌的一部分，再加上館裡自己的小波動，每天開盤會往真實價拉回一點，所以遊戲的漲跌和真實的不會一樣。買賣各收手續費，進館方的預算池。" : "股價照外面世界的行情動。買賣各收手續費，進館方的預算池。"),
        cur.market === "in" && S.inCap != null ? h("p", { class: "bank-hint" }, `每家最多持有 ${fmt(S.inCap)} 股。${S.inRule || ""}`) : null,
        S.soon ? h("p", { class: "bank-hint" }, S.soon) : null),
      positionsPanel(S), ordersPanel(S)));
}
// 世界市場（遊戲內版本的世界股市新聞，每天由劇情排程寫；PR 339）。標題最多 14 字、壹句話最多 40 字、沒有數字；refs 是遊戲裡的股票名，點了跳去那支
const TONE_MARK = { up: ["▲", "up"], down: ["▼", "down"], flat: ["－", ""] };
function goStock(v, id) {
  const list = v.stocks ? v.stocks.list : [], i = list.findIndex(x => x.id === id);
  if (i < 0) return;
  UI.bankTab = "stock"; UI.bankStock = i; rerender();
}
function worldPanel(v) {
  const W = v.world;
  if (!W) return null;
  const days = Array.isArray(W.days) ? W.days.filter(d => d && Array.isArray(d.items) && d.items.length) : [];
  if (!days.length) return panel("世界市場", "每天由館方整理", h("p", { class: "bank-empty-dark" }, "今天還沒有世界市場的消息。"));
  return panel("世界市場", "外面世界的股市消息，不寫數字",
    h("div", { class: "bank-worlddays" }, days.map((d, di) => h("section", { class: "bank-wday" },
      h("h4", { class: "bank-wd" }, di === 0 ? `${String(d.day || "").slice(5)} 最新` : String(d.day || "").slice(5)),
      h("ul", { class: "bank-world" }, d.items.map(it => { const m = TONE_MARK[it.tone] || TONE_MARK.flat; return h("li", { class: "tone-" + (it.tone || "flat") },
        h("i", { class: "bank-tone " + m[1], "aria-hidden": "true" }, m[0]),
        h("span", null, h("b", null, it.title), h("small", null, it.line),
          it.refs && it.refs.length ? h("span", { class: "bank-refs" }, it.refs.map(r => h("button", { type: "button", class: "bank-ref", onClick: () => goStock(v, r.id), "aria-label": `看 ${r.name}` }, r.name))) : null)); }))))));
}
function reportPane(v) {
  const e = v.econ, world = worldPanel(v);
  if (!e) return h("div", { class: "bank-cols" }, panel("館內經濟", "每天 05:00 結算昨天", h("p", { class: "bank-empty" }, "館內的帳每天 05:00 結算昨天，今天的還沒出來。")), world);
  const tone = e.idx > 0.3 ? "好" : e.idx < -0.3 ? "差" : "普通";
  return h("div", { class: "bank-cols report" },
    h("div", { class: "bank-stack" },
      panel("今天的館內經濟", "每天 05:00 結算昨天",
        h("div", { class: "bank-quote" }, num("big", fmt(e.gdp)), upDown(e.growth, true), h("span", { class: "bank-mood " + (e.idx > 0.3 ? "up" : e.idx < -0.3 ? "down" : "") }, `景氣 ${tone}`)),
        h("p", { class: "bank-meta sm" }, "館內 GDP（標準活動值）；成長是近 7 天對前 7 天"),
        h("p", { class: "bank-line" }, e.news)),
      panel("昨天發生的事", "", ledger(["項目", "數字"], e.report.length ? e.report.map(r => h("div", { class: "bank-row two", role: "row" }, h("span", null, r[0]), h("span", { class: "bank-tab-num" }, r[1]))) : [h("div", { class: "bank-row two", role: "row" }, h("span", null, "還沒有紀錄"), h("span", null, "—"))]))),
    h("div", { class: "bank-stack" }, world,
      v.stocks && v.stocks.maker ? panel("莊家和投資人在買什麼", "他們的買賣大家都看得到", h("ul", { class: "bank-who" }, (v.stocks.maker || []).map(x => h("li", null, h("b", null, x.who), x.does)))) : null));
}
const PANES = { save: savePane, loan: loanPane, bond: bondPane, stock: stockPane, report: reportPane };

// ---------- 右欄 ----------
function side(v) {
  const stockVal = v.stocks ? (v.stocks.total != null ? v.stocks.total : v.stocks.list.reduce((n, s) => n + s.price * s.mine, 0)) : 0; // 伺服器給 total；示範資料沒有就自己算
  const termSum = v.save.terms.reduce((n, t) => n + t.amt, 0), owe = v.loan.list.reduce((n, x) => n + x.owe, 0) + (v.stocks && v.stocks.margin ? v.stocks.margin.owe : 0);
  const rows = [["現金", v.cash], ["活存", v.save.save], ["定存", termSum], ["館債", v.bonds ? v.bonds.held.reduce((n, x) => n + x.amt, 0) + (v.bonds.iou || 0) : 0], ["持股市值", stockVal], ["借款", owe ? -owe : 0]];
  // 館債：本金加債權憑證（測試 11-13：買了看不出錢去哪）；借款沒欠寫 0，不寫「−0」（測試 11-13）
  const e = v.econ, gauge = e ? 50 + e.idx * 50 : 50;
  return h("aside", { class: "onescreen-side bank-side" },
    panel("我的帳戶", "", h("div", { class: "bank-acct" }, rows.map(([k, n]) => h("p", null, h("span", null, k), h("b", { class: n < 0 ? "bad" : "" }, n < 0 ? "−" + fmt(-n) : fmt(n || 0)))), h("p", { class: "net" }, h("span", null, "淨值"), h("b", { class: "good" }, fmt(v.net))))),
    v.stocks && v.stocks.credit ? creditPanel(v.stocks.credit) : null,
    e ? panel("館內景氣", "", h("div", { class: "bank-quote" }, num("", sign(e.growth * 100).replace(/^([+−])0*/, "$1") + "%"), h("small", null, "近 7 天 GDP 成長")),
      h("div", { class: "bank-gauge", role: "img", "aria-label": `景氣 ${e.idx > 0.3 ? "好" : e.idx < -0.3 ? "差" : "普通"}` }, h("i", { style: { left: gauge + "%" } })), h("div", { class: "bank-gl" }, h("span", null, "差"), h("span", null, "普通"), h("span", null, "好"))) : null,
    e ? panel("今日新聞", "", h("p", { class: "bank-news" }, e.news)) : null);
}
// 信用等級（只有自己看得到，不排行）：準時還款、定存到期換點數，每 5 點 1 級；等級放大槓桿部位上限
function creditPanel(c) {
  return panel("信用", `${c.level} 級${c.name ? "・" + c.name : ""}`,
    h("p", { class: "bank-meta sm" }, c.nextText || (c.next > 0 ? `再 ${c.next} 點升 ${c.level + 1} 級（信用點 ${c.pts}）。` : `已經是最高級（信用點 ${c.pts}）。`), c.nextText ? `（信用點 ${c.pts}）` : ""),
    h("p", { class: "bank-meta sm" }, `槓桿最高 ${c.maxLev}×・部位 ${fmt(Math.round(c.posUsed / 10000))} 萬／${fmt(Math.round(c.posLimit / 10000))} 萬`),
    c.why ? h("p", { class: "bank-hint" }, c.why) : null);
}
function ticker(v, dup) { // dup：在股票頁籤，行情表已經有了，只有手機直拿才留這條（拿來換股）
  const list = v.stocks ? v.stocks.list : [];
  return h("div", { class: "bank-ticker" + (dup ? " dup" : ""), "aria-label": "今日行情" }, h("span", { class: "bank-tl" }, "今日行情"),
    list.map((s, i) => h("button", { type: "button", class: "bank-tk" + (UI.bankTab === "stock" && s === list[UI.bankStock || 0] ? " on" : ""), onClick: () => { UI.bankTab = "stock"; UI.bankStock = i; rerender(); } },
      h("small", null, s.name), h("b", null, fmt(s.price)), upDown(s.chg))));
}

// ---------- 整個畫面 ----------
SCREENS.bank = root => {
  if (!UI.localPlay && !UI.bankLoading && Date.now() - (UI.bankAt || 0) > 20000) bankLoad(); // 進來先跟伺服器拿；拿到前畫示範資料（上面寫著）
  root.classList.add("onescreen-room", "bank-onescreen");
  // 登入了、第壹次還沒拿到：只寫「正在拿」，不先畫示範數字（測試 11-13：會先閃壹組假數字）
  if (!UI.bankHall && !UI.localPlay && !UI.bankErr) {
    root.append(roomHead("Yuga Bot 銀行", "存錢有利息，借錢要還。"), h("div", { class: "onescreen-main" }, h("div", { class: "bank-stage" }, h("p", { class: "bank-demo" }, "正在跟銀行拿資料……"))));
    return;
  }
  const v = view(), tab = UI.bankTab || "report";
  const tabs = h("div", { class: "bank-tabs", role: "tablist" }, TABS.map(([id, name]) => h("button", { type: "button", role: "tab", "aria-selected": String(id === tab), class: "bank-tabbtn" + (id === tab ? " on" : ""), onClick: () => { if (id === "auction") { go("gallery", { tab: "auction" }, { action: false }); return; } UI.bankTab = id; rerender(); } },
    h("span", { class: "bank-ti", html: TAB_ICON[id] }), h("span", null, name), id === "bond" && v.bonds ? h("i", { class: "bank-dot", "aria-label": "有新的一期" }) : null)));
  root.append(roomHead("Yuga Bot 銀行", v.econ ? `存錢有利息，借錢要還，買股票看行情。今天景氣：${v.econ.idx > 0.3 ? "好 ▲" : v.econ.idx < -0.3 ? "差 ▼" : "普通"}` : "存錢有利息，借錢要還。"),
    tabs,
    h("div", { class: "onescreen-main" }, h("div", { class: "bank-stage" }, v.demo ? h("p", { class: "bank-demo" }, UI.bankLoading ? "正在跟銀行拿資料……" : UI.bankErr ? `連不上銀行（${UI.bankErr}），下面是示範資料。` : "示範資料：登入之後才看得到自己的帳戶。") : null, PANES[tab](v)), side(v)),
    v.stocks ? ticker(v, tab === "stock") : null); // 股票還沒開：不畫今日行情（測試 11-13：空的行情條被切）
};
// 導覽圖上的「銀行」熱區要不要放：伺服器的 bankHall 接上之後，Yuga 主 session 把這個改成 true（現在是示範資料，不給玩家點進來）
ADDONS.bankOpen = true; // 11-13 接上伺服器了（存款、借款、館債）；股票、財報寫「即將開放」
ADDONS.bankHall = { fake: fakeBankHall, open: () => navTo("bank") }; // 賭場那顆「去銀行」可以用（Yuga 主 session）
