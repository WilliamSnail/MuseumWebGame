---
日期: 2026-11-22 16:27:24
作者: 翊文
AI: Claude Sonnet 5.5（Claude Code）
類型: 內容
範圍: [content/story/帳本.json, content/排程說明.md, tools/content/day_plan.cjs, tools/content/extend_check.cjs, test/tools/extend_check.test.cjs]
PR: 無
版本: 2026.11.11-1
測試: extend_check 16 項、day:check 過；npm test 由 ship 跑
狀態: 待合併
相關: []
---

## 為什麼要改

> 「W48 沒有 dayPlan，明天排程看不到每天該放什麼」
>
> 「說明和 day:plan 自相矛盾（回聲週、大揭曉週舊節奏）」

## 改了什麼

- extend.weeks 的 W48、W50～W53 補 dayPlan（d1 到 d7），extend_check 擋缺了或太短
- day:plan 在延伸週印「延伸週」，不印回聲週、大揭曉週舊說法；兩週壹段那行改成只有週日進展照做；收線列出這週收哪些謎；過時的 2027-W43 那句拿掉
- 排程說明最前面加 5 行：W48 到 W53 以 extend 為準；舊的揭露週檢查、兩週壹段標「W48～W53 不適用」；0aa 寫每天照 dayPlan

## 怎麼確認的

- day:plan 看 W48 d1、d2：不再印回聲週和大揭曉週

## 還沒做、要注意

- 無。

## 給下一個人

- 無。
