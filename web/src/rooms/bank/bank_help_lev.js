// 說明頁「槓桿」那頁的信用等級表（翊文 11-27：「好，加那張表」）：每壹級最多幾倍、本金上限、開滿倍數時部位最多。
// 數字現讀 NUM.casino.stockLev（levByCredit、posLimit、stepPct、credit.maxLevel），改設定表就跟著變。不 import ui_bank.js（不准繞圈）。
import { h } from "../../core/ui_core.js";

const yi = n => `${+(n / 100000000).toFixed(1)} 億`;
export function levTable(L) {
  const top = (L.credit && L.credit.maxLevel) || 10, rows = [];
  for (let lv = 0; lv <= top; lv++) {
    const lev = L.levByCredit.filter(([at]) => lv >= at).map(([, n]) => n).pop() || 1, cap = Math.floor(L.posLimit * (1 + L.stepPct * lv / 100));
    rows.push(h("tr", null, h("td", null, `${lv} 級`), h("td", null, `${lev} 倍`), h("td", null, yi(cap)), h("td", null, yi(cap * lev))));
  }
  return h("table", { class: "bank-help-tbl" }, h("thead", null, h("tr", null, ["信用", "最多", "本金上限", "部位最多"].map(t => h("th", null, t)))), h("tbody", null, rows));
}
