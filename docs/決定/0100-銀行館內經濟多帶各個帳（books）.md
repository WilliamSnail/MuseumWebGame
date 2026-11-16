# 0100 銀行館內經濟多帶各個帳（books）

- 日期：2026-11-16 14:00:00
- 誰決定：翊文（「把館內的這幾個帳都放在銀行館內經濟可以展開來看」）
- 狀態：有效

## 決定

- 日報寫回 `h.econ` 時多帶 `books`（`casBooksView(doc)`，`shared/casino_report.js`）：`{ day, bankroll, budget, museum, sea, world, d: { 各帳昨天的變化 }, top: { 各帳昨天進出最大的最多 3 筆 [{ label, n }]（正＝進、負＝出）} }`。銀行畫面資料的 `econ.books` 帶過去。
- 全部從日報已經算好的 snap 和 diff 拿，延遲壹天、整天不變，不即時（跟 `invPub` 壹樣）。
- 只列「對得上來源」的：莊家 ＝ flow ＋ houseMint；外面世界 ＝ wflow；預算池 ＝ 門票進預算池（旅客、NPC、散客）、投資買賣、投資手續費、莊家跟預算池借還；館方帳 ＝ 門票進館方帳。**海底沒有記來源，`top.sea` 固定空**（不亂湊）。
- 今天已經寫好但還沒有 `books` 的 `h.econ`，部署後第壹個進館的人會補寫。
