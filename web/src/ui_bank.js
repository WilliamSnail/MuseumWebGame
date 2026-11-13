// ================================================================
//  Yuga Bot 銀行廳（11-13，美術統籌；版面草稿在 Design 畫布「Yuga Bot 銀行廳：版面草稿」）
//  翊文 11-13：「銀行功能多了可以直接開成另一個新大廳，賭場裡面的簡單銀行功能少點沒關係」「用現有的延伸」。
//  壹個畫面看得完（docs/介面整合規劃.md 第六步，onescreen 骨架）：標題壹行｜頁籤（存款、借款、館債、股票、財報）｜主區：頁籤的內容｜右欄：我的帳戶、景氣、今日新聞｜最下面：今日行情
//  資料：伺服器的 casino act "bankHall" 回 { bankHall }（格式：docs/經濟體系規劃.md 2.7；Yuga 主 session 定）。還沒接上的時候用示範資料（畫面上寫「示範資料」）。
//  動作：存款 act bank（op put／take／term／break）、借款 borrow、repay。還沒接上，按了只跳提示。
//  規則不寫在這裡：這個檔只畫畫面，數字都從 view 來。
// ================================================================
import { ADDONS, SCREENS, UI, btn, h, icon, navTo, note, rerender } from "./ui_core.js";
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
const view = () => UI.bankHall || fakeBankHall();
// 伺服器動作還沒接上：按了跳提示（接上之後這裡改成 NET.call("casino", { act: "bank", ... }) 然後 UI.bankHall = 回答）
const todo = what => note(`${what}：還沒接上伺服器（現在是示範畫面）。`);

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
    h("span", { class: "bank-r" }, btn("提早解約", () => todo("提早解約"), "small bank-btn"))));
  for (let i = 0; i < free; i++) termRows.push(h("div", { class: "bank-row empty", role: "row" }, h("span", null, pic("lock-open", "lock"), h("b", null, "空的"), h("small", null, "還可以開一筆")), h("span", null, "—"), h("span", { class: "bank-r" }, btn("＋ 新增", () => todo("新增定存"), "small bank-btn gold"))));
  return h("div", { class: "bank-cols" },
    panel("活存", "隨時可以領，每天 05:00 給利息",
      h("div", { class: "bank-big" }, pic("jar", "jar"), num("big", fmt(s.save))),
      h("p", { class: "bank-meta" }, "利率 ", h("b", { class: "good" }, `${pctText(s.savePct)}／天`), "　昨天利息 ", h("b", { class: "good" }, sign(s.earned))),
      h("div", { class: "bank-acts" }, btn("存入", () => todo("存入"), "primary big bank-btn gold"), btn("提出", () => todo("提出"), "big bank-btn")),
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
    h("span", { class: "bank-r" }, btn("還錢", () => todo("還錢"), "small bank-btn gold"))));
  if (!rows.length) rows.push(h("p", { class: "bank-empty" }, "沒有欠款。"));
  return h("div", { class: "bank-cols" },
    panel("借款", `${l.days} 天內還，利息 ${pctText(l.pct)}`,
      num("big", fmt(l.left)),
      h("p", { class: "bank-meta" }, "還可以借　上限 ", h("b", null, fmt(l.limit))),
      h("div", { class: "bank-acts" }, l.quick.map(q => btn(fmt(q), () => todo("借款"), "big bank-btn"))),
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
      h("div", { class: "bank-acts" }, btn("買 100,000", () => todo("買館債"), "primary big bank-btn gold"), btn("買 500,000", () => todo("買館債"), "big bank-btn")),
      h("p", { class: "bank-hint" }, "到期還本金加利息；不能提早贖回、不能轉讓。")),
    panel("我持有的", `共 ${fmt(i.mine)}`,
      ledger(["金額", "到期拿到", ""], b.held.map(x => h("div", { class: "bank-row", role: "row" }, h("span", null, h("b", null, fmt(x.amt))), h("span", { class: "bank-tab-num" }, `${fmt(x.amt + x.int)}（${x.due}）`), h("span", null)))) ));
}
function stockPane(v) {
  const S = v.stocks, list = S.list, cur = list[Math.min(UI.bankStock || 0, list.length - 1)];
  const rows = list.map((s, i) => h("button", { type: "button", class: "bank-row stock" + (s === cur ? " on" : ""), role: "row", onClick: () => { UI.bankStock = i; rerender(); } },
    h("span", null, h("b", null, s.name), h("small", { class: "ln" }, s.line)), h("span", { class: "bank-tab-num" }, fmt(s.price)), upDown(s.chg), h("span", { class: "bank-tab-num" }, s.mine ? `${fmt(s.mine)} 股` : "—")));
  const m = S.margin;
  return h("div", { class: "bank-cols stocks" },
    panel("行情", `手續費 ${pctText(S.fee)}`, ledger(["名稱", "股價", "今天", "持股"], rows, "stocks")),
    h("div", { class: "bank-stack" },
      panel(cur.name, cur.line, h("div", { class: "bank-quote" }, num("big", fmt(cur.price)), upDown(cur.chg)), spark(cur.hist),
        h("p", { class: "bank-hint" }, "股價每天 05:00 調一次。"),
        h("div", { class: "bank-acts" }, btn("買進", () => todo("買進"), "primary big bank-btn gold"), btn("賣出", () => todo("賣出"), "big bank-btn")),
        h("label", { class: "bank-check" }, h("input", { type: "checkbox", onClick: () => todo("借錢買") }), `借錢買（每天利息 ${pctText(m.pct)}，維持率低於 130% 會被強制賣出）`))));
}
function reportPane(v) {
  const e = v.econ;
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
  const stockVal = v.stocks ? v.stocks.list.reduce((n, s) => n + s.price * s.mine, 0) * 100 : 0;
  const termSum = v.save.terms.reduce((n, t) => n + t.amt, 0), owe = v.loan.list.reduce((n, x) => n + x.owe, 0) + (v.stocks && v.stocks.margin ? v.stocks.margin.owe : 0);
  const rows = [["現金", v.cash], ["活存", v.save.save], ["定存", termSum], ["持股市值", stockVal], ["借款", -owe]];
  const e = v.econ, gauge = e ? 50 + e.idx * 50 : 50;
  return h("aside", { class: "onescreen-side bank-side" },
    panel("我的帳戶", "", h("div", { class: "bank-acct" }, rows.map(([k, n]) => h("p", null, h("span", null, k), h("b", { class: n < 0 ? "bad" : "" }, n < 0 ? "−" + fmt(-n) : fmt(n)))), h("p", { class: "net" }, h("span", null, "淨值"), h("b", { class: "good" }, fmt(v.net))))),
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
  const v = view(), tab = UI.bankTab || "save";
  root.classList.add("onescreen-room", "bank-onescreen");
  const tabs = h("div", { class: "bank-tabs", role: "tablist" }, TABS.map(([id, name]) => h("button", { type: "button", role: "tab", "aria-selected": String(id === tab), class: "bank-tabbtn" + (id === tab ? " on" : ""), onClick: () => { UI.bankTab = id; rerender(); } },
    h("span", { class: "bank-ti", html: TAB_ICON[id] }), h("span", null, name), id === "bond" && v.bonds ? h("i", { class: "bank-dot", "aria-label": "有新的一期" }) : null)));
  root.append(roomHead("Yuga Bot 銀行", v.econ ? `存錢有利息，借錢要還，買股票看行情。今天景氣：${v.econ.idx > 0.3 ? "好 ▲" : v.econ.idx < -0.3 ? "差 ▼" : "普通"}` : "存錢有利息，借錢要還。"),
    tabs,
    h("div", { class: "onescreen-main" }, h("div", { class: "bank-stage" }, v.demo ? h("p", { class: "bank-demo" }, "示範資料：還沒接上伺服器，按鈕不會動錢。") : null, PANES[tab](v)), side(v)),
    ticker(v));
};
// 導覽圖上的「銀行」熱區要不要放：伺服器的 bankHall 接上之後，Yuga 主 session 把這個改成 true（現在是示範資料，不給玩家點進來）
ADDONS.bankOpen = false;
ADDONS.bankHall = { fake: fakeBankHall, open: () => navTo("bank") }; // 賭場那顆「去銀行」可以用（Yuga 主 session）
