// ================================================================
//  Yuga Bot 銀行廳（11-13，美術統籌；版面草稿在 Design 畫布「Yuga Bot 銀行廳：版面草稿」）
//  翊文 11-13：「銀行功能多了可以直接開成另一個新大廳，賭場裡面的簡單銀行功能少點沒關係」「用現有的延伸」。
//  壹個畫面看得完（docs/介面整合規劃.md 第六步，onescreen 骨架）：標題壹行｜頁籤（存款、借款、館債、股票、財報）｜主區：頁籤的內容｜右欄：我的帳戶、景氣、今日新聞｜最下面：今日行情
//  資料：伺服器的 casino act "bankHall" 回 { bankHall }（格式：docs/經濟體系規劃.md 2.7；Yuga 主 session 定）。還沒接上的時候用示範資料（畫面上寫「示範資料」）。
//  動作：存款 act bank（op put／take／term／break）、借款 borrow、repay。還沒接上，按了只跳提示。
//  規則不寫在這裡：這個檔只畫畫面，數字都從 view 來。
// ================================================================
import { ADDONS, SCREENS, UI, btn, closeOnOutside, h, icon, miniLayer, navTo, note, rerender, setChips } from "./ui_core.js";
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
  report: SVG('<path d="M5 4h13v16H5z"/><path d="M8 8h7M8 12h7M8 16h4"/><path d="M5 4v16"/>'), // 帳本
};
const TABS = [["save", "存款"], ["loan", "借款"], ["bond", "館債"], ["stock", "股票"], ["report", "財報"]];
const pctText = p => `${(p * 100).toFixed(p * 100 % 1 ? 1 : 0)}%`;

// ---------- 示範資料（伺服器還沒給 bankHall 的時候用；格式照 Yuga 說的 bankHall） ----------
export function fakeBankHall() {
  const stocks = [
    { id: "food", name: "餐車", line: "館內店", price: 102, chg: 0.021, hist: [96, 98, 97, 99, 100, 100, 102], mine: 20, kind: "in" },
    { id: "casino", name: "Hamachi 賭場", line: "館內店", price: 98, chg: -0.008, hist: [101, 100, 99, 99, 100, 99, 98], mine: 0, kind: "in" },
    { id: "board", name: "委託櫃台", line: "館內店", price: 110, chg: 0.004, hist: [105, 107, 108, 108, 109, 110, 110], mine: 5, kind: "in" },
    { id: "cellar", name: "地下收藏庫", line: "館內店", price: 87, chg: -0.032, hist: [94, 93, 92, 91, 90, 90, 87], mine: 0, kind: "in" },
    { id: "work", name: "手作坊", line: "館內店", price: 120, chg: 0.05, hist: [100, 104, 103, 108, 110, 114, 120], mine: 10, kind: "in" },
    { id: "neon", name: "霓虹顯卡", line: "館外・世界版", price: 231, chg: 0.017, hist: [220, 224, 226, 225, 227, 227, 231], mine: 0, kind: "out" },
    { id: "sand", name: "紅砂晶片", line: "館外・世界版", price: 64, chg: -0.011, hist: [66, 66, 65, 65, 66, 65, 64], mine: 0, kind: "out" },
    { id: "night", name: "夜市指數", line: "館外・世界版", price: 540, chg: 0.003, hist: [535, 537, 538, 538, 539, 538, 540], mine: 0, kind: "out" },
  ];
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
    stocks: { list: stocks, fee: 0.005, margin: { owe: 1200000, ratio: 1.84, limit: 2000000, pct: 0.005 }, maker: [{ who: "莊家", does: "霓虹顯卡 20 萬股、夜市指數 5 萬股" }, { who: "老會計", does: "餐車、委託櫃台" }, { who: "小學徒", does: "手作坊（追漲）" }, { who: "守夜人", does: "紅砂晶片（逆勢）" }] },
    econ: { gdp: 3520000, growth: 0.032, idx: 0.68, news: "昨天的烤雞肉多賣了 300 份，餐車股今天小漲。館方預算池充裕，利息照發。", report: [["餐車", "賣出 412 份"], ["21 點", "共 380 手"], ["拚經濟", "成功 9 次"], ["門票", "收入 62,000"]] },
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
    bonds, stocks: b.stocks, econ: b.econ,
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
const upDown = chg => h("span", { class: "bank-chg " + (chg > 0 ? "up" : chg < 0 ? "down" : "") }, `${chg > 0 ? "▲" : chg < 0 ? "▼" : "－"} ${(Math.abs(chg) * 100).toFixed(1)}%`);
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
// 壹股都買不了的原因：分開講，不要把兩種混在壹起（翊文 11-14）
function whyNoBuy(v, S, cur) {
  if (S.houseBroke) return `莊家現在破產中（剩 ${fmt(S.bankroll)}），暫停買進。賣出照常。`;
  if (S.exposeLeft != null && S.exposeLeft < cur.price) return `莊家的錢不夠接更多股票了：全館持股最多是莊家的壹半，莊家現在有 ${fmt(S.bankroll)}，今天還能接 ${fmt(S.exposeLeft)}。莊家賺回來就能再買。`;
  if (v.cash < Math.ceil(cur.price * (1 + S.fee))) return `籌碼不夠：壹股 ${fmt(cur.price)}，加手續費要 ${fmt(Math.ceil(cur.price * (1 + S.fee)))}。`;
  return "現在買不了。";
}
function stockPane(v) {
  if (!v.stocks) return soon("股票", "館內五家店和館外股票（跟著真的漲跌）正在準備，開放時館方公告會說。");
  const S = v.stocks, list = S.list, cur = list[Math.min(UI.bankStock || 0, list.length - 1)];
  const rows = list.map((s, i) => h("button", { type: "button", class: "bank-row stock" + (s === cur ? " on" : ""), role: "row", onClick: () => { UI.bankStock = i; rerender(); } },
    h("span", null, h("b", null, s.name), h("small", { class: "ln" }, s.line)), h("span", { class: "bank-tab-num" }, fmt(s.price)), upDown(s.chg), h("span", { class: "bank-tab-num" }, s.mine ? `${fmt(s.mine)} 股` : "—")));
  const trade = (op, n) => bankDo("stock", { op, id: cur.id, n });
  // 買幾股：照手上的籌碼和曝險算得出來的最大值，給幾顆好按的
  const max = Math.max(0, Math.min(Math.floor(v.cash / Math.ceil(cur.price * (1 + S.fee))), S.exposeLeft == null ? Infinity : Math.floor(S.exposeLeft / Math.max(1, cur.price)))); // exposeLeft null＝跟外面世界買，沒有莊家上限（11-14）
  const buys = [1, 10, 100].filter(n => n <= max).map(n => btn(`買 ${n} 股`, () => trade("buy", n), "big bank-btn"))
    .concat(max > 0 ? [btn(`買滿 ${fmt(max)} 股`, () => trade("buy", max), "primary big bank-btn gold")] : []);
  const sells = cur.mine > 0 ? [1, 10, 100].filter(n => n <= cur.mine).map(n => btn(`賣 ${n} 股`, () => trade("sell", n), "big bank-btn"))
    .concat([btn(`全賣 ${fmt(cur.mine)} 股`, () => trade("sell", "max"), "big bank-btn")]) : [];
  return h("div", { class: "bank-cols stocks" },
    panel("行情", `手續費 ${pctText(S.fee)}`, ledger(["名稱", "股價", "今天", "持股"], rows, "stocks")),
    h("div", { class: "bank-stack" },
      panel(cur.name, cur.line, h("div", { class: "bank-quote" }, num("big", fmt(cur.price)), upDown(cur.chg)),
        cur.mine ? h("p", { class: "bank-meta" }, "你有 ", h("b", null, `${fmt(cur.mine)} 股`), "，現在值 ", h("b", null, fmt(cur.value))) : null,
        cur.stale ? h("p", { class: "bank-why" }, cur.stale) : null,
        S.halt ? h("p", { class: "bank-why" }, `停盤中（台灣時間 ${S.haltFrom}:00～${S.haltTo}:00），明天開盤再買賣。`)
          : h("div", { class: "bank-acts" }, buys.length ? buys : h("small", { class: "bank-why" }, whyNoBuy(v, S, cur)), sells),
        h("p", { class: "bank-hint" }, "股價每天 05:00 動壹次，照外面世界前壹天的行情。買賣各收手續費，進館方的預算池。"),
        h("p", { class: "bank-hint" }, S.soon)))); 
}
function reportPane(v) {
  const e = v.econ;
  if (!e) return soon("財報", "館內 GDP、景氣和每天的新聞正在準備，開放時館方公告會說。");
  return h("div", { class: "bank-cols" },
    panel("今天的館內經濟", "每天 05:00 結算昨天",
      h("div", { class: "bank-quote" }, num("big", fmt(e.gdp)), upDown(e.growth)), h("p", { class: "bank-meta" }, "館內 GDP（標準活動值）　成長是近 7 天對前 7 天"),
      h("p", { class: "bank-line" }, e.news)),
    h("div", { class: "bank-stack" },
      panel("昨天發生的事", "", ledger(["項目", "數字"], e.report.map(r => h("div", { class: "bank-row two", role: "row" }, h("span", null, r[0]), h("span", { class: "bank-tab-num" }, r[1]))))),
      v.stocks ? panel("莊家和投資人在買什麼", "他們的買賣大家都看得到", h("ul", { class: "bank-who" }, v.stocks.maker.map(x => h("li", null, h("b", null, x.who), x.does)))) : null));
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
    e ? panel("館內景氣", "", h("div", { class: "bank-quote" }, num("", sign(e.growth * 100).replace(/^([+−])0*/, "$1") + "%"), h("small", null, "近 7 天 GDP 成長")),
      h("div", { class: "bank-gauge", role: "img", "aria-label": `景氣 ${e.idx > 0.3 ? "好" : e.idx < -0.3 ? "差" : "普通"}` }, h("i", { style: { left: gauge + "%" } })), h("div", { class: "bank-gl" }, h("span", null, "差"), h("span", null, "普通"), h("span", null, "好"))) : null,
    e ? panel("今日新聞", "", h("p", { class: "bank-news" }, e.news)) : null);
}
function ticker(v) {
  const list = v.stocks ? v.stocks.list : [];
  return h("div", { class: "bank-ticker", "aria-label": "今日行情" }, h("span", { class: "bank-tl" }, "今日行情"),
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
  const v = view(), tab = UI.bankTab || "save";
  const tabs = h("div", { class: "bank-tabs", role: "tablist" }, TABS.map(([id, name]) => h("button", { type: "button", role: "tab", "aria-selected": String(id === tab), class: "bank-tabbtn" + (id === tab ? " on" : ""), onClick: () => { UI.bankTab = id; rerender(); } },
    h("span", { class: "bank-ti", html: TAB_ICON[id] }), h("span", null, name), id === "bond" && v.bonds ? h("i", { class: "bank-dot", "aria-label": "有新的一期" }) : null)));
  root.append(roomHead("Yuga Bot 銀行", v.econ ? `存錢有利息，借錢要還，買股票看行情。今天景氣：${v.econ.idx > 0.3 ? "好 ▲" : v.econ.idx < -0.3 ? "差 ▼" : "普通"}` : "存錢有利息，借錢要還。"),
    tabs,
    h("div", { class: "onescreen-main" }, h("div", { class: "bank-stage" }, v.demo ? h("p", { class: "bank-demo" }, UI.bankLoading ? "正在跟銀行拿資料……" : UI.bankErr ? `連不上銀行（${UI.bankErr}），下面是示範資料。` : "示範資料：登入之後才看得到自己的帳戶。") : null, PANES[tab](v)), side(v)),
    v.stocks ? ticker(v) : null); // 股票還沒開：不畫今日行情（測試 11-13：空的行情條被切）
};
// 導覽圖上的「銀行」熱區要不要放：伺服器的 bankHall 接上之後，Yuga 主 session 把這個改成 true（現在是示範資料，不給玩家點進來）
ADDONS.bankOpen = true; // 11-13 接上伺服器了（存款、借款、館債）；股票、財報寫「即將開放」
ADDONS.bankHall = { fake: fakeBankHall, open: () => navTo("bank") }; // 賭場那顆「去銀行」可以用（Yuga 主 session）
