// 股票成交紀錄（翊文 11-20；資料 stock.trades：最近 50 筆、新的在前，順序照陣列、不用 t／day 排；shared/casino/trade_log.js）。
// 畫在股票頁籤的下面：一般股（館外、館內）和集團股各一份，可以篩股票、篩現股／槓桿；手機預設收起，電腦展開。
// 這個檔不 import ui_bank.js（不准繞圈），樣式用 bank-panel 那套 class（css/bank.css 的 bt-）。
import { UI, h, rerender } from "../../core/ui_core.js";

const fmt = n => (n == null ? "—" : Number(n).toLocaleString("en-US"));
const px = n => (n == null ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const WHY = { close: "手動平倉", liq: "強平", stop: "停損", take: "停利", flat: "收盤自動平倉" };
const KIND = { buy: "買進", sell: "賣出", open: "開倉", close: "平倉" };
const MARKET = { out: "館外股", in: "館內股", grp: "集團股" };
const isPhone = () => window.innerWidth < 761 || window.innerHeight < 501;

function timeOf(r) {
  const day = String(r.day || "").slice(5).split("-").join("/");
  if (!r.t) return h("span", null, day, h("small", null, "掛單成交"));
  const d = new Date(r.t + 8 * 3600e3), hm = d.toISOString().slice(11, 16);
  return h("span", null, day, h("small", null, hm));
}
function actOf(r) {
  const word = r.lev ? (r.kind === "open" ? "開倉" : "平倉") + (r.side === "short" ? "放空" : "做多") + (r.mult ? ` ×${r.mult}` : "") : KIND[r.kind] || r.kind;
  const tail = r.lev && r.kind === "close" && r.why ? `（${WHY[r.why] || r.why}）` : r.debt ? "（賣股還債）" : r.order ? "（限價單）" : "";
  return h("span", { class: "bt-act " + (r.kind === "buy" || r.kind === "open" ? "in" : "out") }, word, tail ? h("small", null, tail) : null);
}
// trades：stock.trades；scope："std"（館外、館內）或 "grp"（集團股）
export function tradesPanel(trades, scope) {
  const all = (Array.isArray(trades) ? trades : []).filter(r => (scope === "grp" ? r.market === "grp" : r.market !== "grp"));
  const f = UI.bankTr || (UI.bankTr = {});
  if (f.scope !== scope) { f.scope = scope; f.kind = "all"; f.id = ""; }
  const names = []; all.forEach(r => { if (!names.some(x => x[0] === r.id)) names.push([r.id, r.name || r.id]); });
  if (f.id && !names.some(x => x[0] === f.id)) f.id = "";
  const rows = all.filter(r => (!f.id || r.id === f.id) && (f.kind === "all" || (f.kind === "lev") === !!r.lev));
  const chip = (k, t) => h("button", { type: "button", role: "tab", "aria-selected": String(f.kind === k), class: "bt-chip" + (f.kind === k ? " on" : ""), onClick: () => { f.kind = k; rerender(); } }, t);
  const sel = h("select", { class: "bt-sel", "aria-label": "篩股票", onChange: e => { f.id = e.target.value; rerender(); } }, h("option", { value: "" }, "全部股票"), ...names.map(([id, n]) => h("option", { value: id, selected: f.id === id ? true : null }, n)));
  const body = !all.length ? h("p", { class: "bank-empty-dark" }, "還沒有成交紀錄。從這次更新開始，買賣會記在這裡（最近 50 筆）。")
    : !rows.length ? h("p", { class: "bank-empty-dark" }, "這個條件沒有成交。")
    : h("div", { class: "bt-book", role: "table" }, rows.map(r => h("div", { class: "bt-row", role: "row" }, timeOf(r),
      h("span", { class: "bt-main" }, h("b", null, r.name || r.id, scope === "std" && MARKET[r.market] ? h("small", null, MARKET[r.market]) : null), h("span", null, actOf(r), "　", fmt(r.n), " 股 × ", px(r.price))),
      h("span", { class: "bt-end" }, h("b", { class: r.profit > 0 ? "up" : r.profit < 0 ? "down" : "" }, r.profit == null ? "—" : (r.profit > 0 ? "+" : "") + fmt(r.profit)), h("small", null, "手續費稅 " + fmt((r.fee || 0) + (r.tax || 0)))))));
  const open = f.open != null ? f.open : !isPhone();
  return h("details", { class: "bank-panel bt", open: open ? true : null, onToggle: e => { f.open = e.target.open; } },
    h("summary", { class: "bank-ph" }, h("b", null, "成交紀錄"), h("small", null, all.length ? `最近 ${all.length} 筆　▾` : "▾")),
    all.length ? h("div", { class: "bt-filter" }, h("div", { class: "bank-segs kind", role: "tablist" }, chip("all", "全部"), chip("spot", "現股"), chip("lev", "槓桿")), sel) : null, body);
}
