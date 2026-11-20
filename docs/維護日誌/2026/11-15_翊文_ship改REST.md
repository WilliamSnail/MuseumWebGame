---
日期: 2026-11-15 14:20:40
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 伺服器
範圍: [tools/ship.cjs, test/tools.test.cjs, content/排程說明.md, docs/踩過的坑.md]
PR: 無
版本: 2026.11.11-1
測試: npm test 全過（ship 的 CI 判斷 4 種）；這壹包本身用新的 ship 上線（REST 開 PR、等 CI、合併）
狀態: 待合併
相關: []
---

## 為什麼要改

> 翊文轉貼今天每日排程的回報：「npm run ship 在開 PR 時失敗：gh pr create 用的 GraphQL 在這個環境被擋。我改用 GitHub MCP 開 PR、合併……」「我跑了 npm install，它改動了 package-lock.json。ship 把這個改動一起 commit 了」

## 改了什麼

- ship 的開 PR、找現有 PR、等 CI、合併都改成 REST（gh api）：POST pulls、GET pulls?head=、commits/<sha>/check-runs、PUT pulls/<n>/merge。CI 判斷抽成 checksState（none／wait／ok／fail）。部署照舊用 gh run（本來就是 REST）。
- commit 前：只有 package-lock.json 變、package.json 沒變，就還原它。
- 排程說明：壹開始用 npm ci、不要 npm install；ship 那段註明現在用 REST。踩過的坑加兩條。

## 怎麼確認的

- 這壹包用新的 ship 上線。

## 還沒做、要注意

- 雲端環境如果連 REST 也擋，ship 會在「開 PR」那步停，照舊改用 GitHub MCP；明天 08:00 的排程看結果。

## 給下一個人

- gh pr 系列指令在雲端排程不能用，寫新腳本時用 gh api。
