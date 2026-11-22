// day:plan 底下多印的延伸世界段（11-22，Yuga 排程檢視第 3 項）：這週要放的掉落／禁書附頁（extend.items）、今天排到的四問、這週總表 collect 的每條線（四問直接印出來）。
// 純函式：不碰檔案。day_plan.cjs 的 main 在印完計畫後叫 extendTail；延伸週的主段（day_plan 裡的）不動。
const asList = v => (Array.isArray(v) ? v : []);
const Q = [["dread", "恐懼"], ["cost", "代價"], ["pepe", "佩佩"], ["horror", "嚇人的展品"]];
const resolve = (X, row, k) => { const v = row[k], m = typeof v === "string" && /^見 extend\.weeks\.([0-9]{4}-W[0-9]{2})\.([a-z]+)$/.exec(v), s = m && X.weeks && X.weeks[m[1]] && X.weeks[m[1]][m[2]]; return s ? `${s.what || ""}${s.day ? `（${s.day}）` : ""}${s.san ? ` san ${s.san}` : ""}` : String(v || ""); };
function extendTail(ledger, week, weekday) {
  const X = ledger && ledger.extend, xw = X && X.weeks && X.weeks[week];
  if (!xw) return "";
  const L = [], n = "d" + weekday;
  const items = asList(X.items).filter(it => it && it.week === week);
  L.push("", `【延伸世界 ${week}】`);
  const todayQ = Q.filter(([k]) => xw[k] && xw[k].day === n);
  L.push(todayQ.length ? "今天排到的四問：" : "今天沒有排到四問（看下面這週的）。");
  todayQ.forEach(([k, name]) => L.push(`  ${name}（${xw[k].where || ""}）：${xw[k].what || ""}${xw[k].san ? `　san ${xw[k].san}` : ""}`));
  if (items.length) { L.push("這週要放的掉落／禁書附頁（extend.items）："); items.forEach(it => L.push(`  ${it.id}「${it.name}」＝${it.book || ""}　線索：${it.clueKind || ""}　來歷：${it.lore || ""}　附頁：${it.extraPage || ""}${it.audit && it.audit.status ? `　（${it.audit.status}）` : ""}`)); }
  const rows = asList(X.collect && X.collect.rows).filter(r => r && (r.week === week || asList(xw.lines).includes(r.id)));
  if (rows.length) { L.push("這週在總表 collect 的線（四問）："); rows.forEach(r => { L.push(`  ${r.id} ${r.line || ""}（${r.kind || ""}，${r.week || ""}）`); Q.forEach(([k, name]) => L.push(`    ${name}：${resolve(X, r, k)}`)); }); }
  return L.join("\n");
}
module.exports = { extendTail };
