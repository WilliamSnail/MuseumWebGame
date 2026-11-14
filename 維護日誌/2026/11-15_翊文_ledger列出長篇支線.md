---
日期: 2026-11-15 00:15:19
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 文件
範圍: [tools/ledger.cjs, test/day_plan.test.cjs]
PR: 無
版本: 2026.11.11-1
測試: npm test 全過
狀態: 待合併
相關: []
---

## 為什麼要改

> 「好，那每日排程可以很方便做劇情規劃對吧」

確認的時候發現：`npm run ledger -- today` 本來要列「提到這週的長篇支線」，但帳本的 sideArcs 是 { 說明, list }，那段直接被略過，排程看不到任何支線（包括剛加的文化部的補助）。

## 改了什麼

- ledger today 多壹段「長篇支線」：每條都列 id、名字、接哪個謎、走到第幾段（at）、下壹段要寫什麼（next）、有 note 就附上（例如收尾要問翊文）。
- 推完怎麼記：`npm run ledger -- set sideArcs.list.<id>.at <數字>`。
- 測試加壹項。

## 怎麼確認的

- npm test 全過；用真的帳本跑 today，五條支線（含 arc-culture）都列出來。

## 還沒做、要注意

- 沒有。

## 給下一個人

- 帳本某段的結構改了（例如包壹層 { 說明, list }），記得看 tools/ledger.cjs 的 today 有沒有跟著讀到。
