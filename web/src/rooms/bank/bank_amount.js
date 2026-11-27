// 零碎股：照金額買賣（決定 0160，翊文 11-27「輸入金額而非股數的零碎股交易」）。只有館外股（台股、美股）。
// 現股交易上面壹排「按股數｜按金額」（11-27 翊文：「照金額」那欄不夠明顯）：選按金額時，快捷鍵換成「1 萬、10 萬、100 萬、全部」，
// 下面是自訂金額；按了先跳確認，確認才送 op buyAmt／sellAmt。選哪壹種記在這台裝置（localStorage）。
// 這個檔不 import ui_bank.js（不准繞圈）：要用的小工具（確認框、送出、數字欄）由 ui_bank.js 傳進來。
import { btn, h } from "../../core/ui_core.js";

const FRAC = 10000; // 萬分之壹股（跟 shared/casino/stock.js 的 ST_FRAC 壹樣）
const MODE_KEY = "bankTradeMode";
const fmt = n => Number(n).toLocaleString("en-US");
const wan = n => `${fmt(n / 10000)} 萬`;
// 股數的字：整數股加零碎（最多四位小數，後面的 0 不寫）
export const sharesText = s => {
  const n = (+s.mine || 0) + (+s.frac || 0);
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 4 })} 股`;
};
export const hasShares = s => (+s.mine || 0) + (+s.frac || 0) > 0;
// 按股數（"n"）還是按金額（"amt"）：只有館外股有按金額
export const tradeMode = cur => {
  if (!cur || cur.kind !== "out") return "n";
  try { return localStorage.getItem(MODE_KEY) === "amt" ? "amt" : "n"; } catch (e) { return "n"; }
};
export const setTradeMode = m => { try { localStorage.setItem(MODE_KEY, m === "amt" ? "amt" : "n"); } catch (e) { /* 存不了就算了 */ } };

const STEPS = [10000, 100000, 1000000];
// o = { side: "buy"|"sell", cur, cash, sellLeft, feeRate, numField, confirmTrade, bankDo, state }
export function amountBox(o) {
  const { side, cur } = o, buy = side === "buy";
  if (cur.kind !== "out" || !(cur.price > 0)) return null;
  const c = Math.round(cur.price * 100), units = Math.round(((cur.free != null ? cur.free : +cur.mine || 0) + (+cur.frac || 0)) * FRAC);
  const worth = Math.floor(c * units / FRAC / 100), cap = buy ? o.cash : Math.min(worth, o.sellLeft != null ? o.sellLeft : Infinity);
  const st = o.state || (o.state = { amt: "" }), info = h("p", { class: "bank-meta sm bank-qinfo" });
  // 買：給的金額含手續費，算買得到幾個單位；賣：給的是賣出金額，算要賣幾個單位
  const calc = A => {
    if (buy) {
      let u = Math.floor(A * 100 * FRAC / (c * (1 + o.feeRate)));
      const tot = x => { const k = Math.ceil(c * x / FRAC / 100); return k + Math.ceil(k * o.feeRate); };
      while (u > 0 && tot(u) > A) u--;
      return { u };
    }
    const u = Math.min(units, Math.ceil(A * 100 * FRAC / c)), gross = Math.floor(c * u / FRAC / 100), fee = Math.ceil(gross * o.feeRate);
    const tax = cur.tax > 0 && gross > 0 ? Math.max(1, Math.ceil(gross * cur.tax)) : 0;
    return { u, gross, net: gross - fee - tax };
  };
  const nText = u => (u / FRAC).toLocaleString("en-US", { maximumFractionDigits: 4 });
  // all：賣光（連零碎）
  const ask = (A, all) => {
    const x = calc(A);
    if (!(x.u > 0)) return;
    o.confirmTrade(`${buy ? "買進" : "賣出"} ${cur.name}（按金額）`, buy
      ? [["金額（含手續費）", fmt(A)], ["約買到", `${nText(x.u)} 股`], ["股價", fmt(cur.price)]]
      : [["賣出金額", fmt(A)], ["約賣掉", `${nText(x.u)} 股`], ["拿回（約）", fmt(x.net), "total"]], buy ? "確認買進" : "確認賣出",
      () => o.bankDo("stock", { op: buy ? "buyAmt" : "sellAmt", id: cur.id, amt: all ? "max" : A }));
  };
  const steps = STEPS.map(n => btn(wan(n), () => ask(n), "big bank-btn", { disabled: n > cap ? true : null }));
  steps.push(btn(buy ? "全部籌碼" : "全賣", () => (buy ? ask(o.cash) : ask(worth, true)), "primary big bank-btn gold", { disabled: cap > 0 ? null : true }));
  const go = btn(buy ? "買這個金額" : "賣這個金額", () => ask(Math.floor(Number(st.amt))), "bank-btn gold");
  const redo = () => {
    const raw = st.amt, A = Math.floor(Number(raw));
    go.disabled = true;
    if (raw === "" || raw == null) { info.textContent = buy ? "打想花的金額（含手續費），不到壹股的也買得到。" : `能賣的約值 ${fmt(worth)}。`; return; }
    if (!(A > 0)) { info.textContent = "金額要是 1 以上的整數。"; return; }
    if (buy && A > o.cash) { info.textContent = `籌碼不夠，最多 ${fmt(o.cash)}。`; return; }
    const x = calc(A);
    if (!(x.u > 0)) { info.textContent = "金額太小，連萬分之壹股都買不到。"; return; }
    if (!buy && A > worth) { info.textContent = `你這支能賣的只值約 ${fmt(worth)}。`; return; }
    if (!buy && o.sellLeft != null && x.gross > o.sellLeft) { info.textContent = `今天還能賣約 ${fmt(o.sellLeft)}。`; return; }
    info.textContent = buy ? `約買到 ${nText(x.u)} 股（含手續費，花的不會超過 ${fmt(A)}）` : `約賣掉 ${nText(x.u)} 股，拿回約 ${fmt(x.net)}`;
    go.disabled = false;
  };
  const field = o.numField("自訂金額", st.amt, x => { st.amt = x === "" ? "" : Math.floor(Number(x)); redo(); }, { min: 1, step: 1, unit: "籌碼" });
  const inp = field.querySelector && field.querySelector("input"); if (inp) inp.placeholder = "打金額";
  redo();
  return [h("div", { class: "bank-acts" }, steps), h("div", { class: "bank-custom" }, field, go, info)];
}
