// ================================================================
//  Yuga Bot 日報的畫面（11-13，數值平衡；規則和文字 shared/casino_report.js，數字是伺服器算的 act report）
//  放在賭場的「拚經濟」頁籤最下面。這個檔只畫伺服器給的、結算過的數字，什麼都不算。
//  沒登入、連不上就寫「要連上伺服器才看得到」。介面上的字用「壹」。
// ================================================================
import { NET } from "./net_firebase.js";
import { UI, h } from "./ui_core.js";

export const CAS_RPT = { view: null, at: 0, busy: false, failed: false };
// 向伺服器要日報。10 分鐘內拿過就直接用（日報壹天才換壹份）。回傳 view 或 null（不丟錯）
export async function loadReport() {
  if (!UI.net || !NET.loggedIn) return null;
  if (CAS_RPT.view && performance.now() - CAS_RPT.at < 600000) return CAS_RPT.view;
  if (CAS_RPT.busy) return null;
  CAS_RPT.busy = true;
  try {
    const r = await NET.call("casino", { act: "report" });
    if (r && r.ok && r.report) { CAS_RPT.view = r.report; CAS_RPT.at = performance.now(); CAS_RPT.failed = false; }
    else CAS_RPT.failed = true;
  } catch (e) { CAS_RPT.failed = true; }
  CAS_RPT.busy = false;
  return CAS_RPT.view;
}
// 日報的內容（要放進 sec 的幾個節點）
export function reportNodes() {
  const v = CAS_RPT.view;
  if (!v) return [h("p", { class: "cas-note" }, CAS_RPT.busy ? "Yuga Bot 在算帳……" : "日報要連上伺服器才看得到。")];
  return [
    h("p", { class: "cas-note" }, v.intro),
    h("p", { class: "cas-hint" }, v.stamp),
    ...v.secs.map(s => h("div", { class: "cas-rpt" }, h("h4", null, s.t), ...s.lines.map(l => h("p", { class: "cas-note" }, l)))),
  ];
}
