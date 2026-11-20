---
日期: 2026-11-09 18:15:10
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 文件
範圍: [docs/Discord聯動規劃.md, 規劃.md, docs/現況.md]
PR: 無
版本: 2026.11.08-1
測試: npm test 全過
狀態: 待合併
相關: [docs/Discord聯動規劃.md, docs/賭場規劃.md, docs/決定/0045-活動開跑通知和今日館訊八點半.md, docs/決定/0051-Discord聯動.md]
---

## 為什麼要改

> 「理想是Yuga bot可以在我們discord channel 跟玩家互動，內容也是跟我們數據庫即時同步的」
>
> 「Yuga Bot 接話：有人說「要不要」就回「不要」這個不用做」
>
> 「好，規劃一下」
>
> 「可以的話，能夠連線玩家相應的Discord 帳號，讓玩家可以在discord 直接玩賭場或是斗內等等的」

## 改了什麼

- 新增 `docs/Discord聯動規劃.md`：三步、架構、安全、技術風險、要翊文做和決定的事。
- `規劃.md` 第九節、`docs/現況.md` 指過去。

## 怎麼確認的

- 對過現有的程式：`functions/casino.js` 的 `play` 靠 `req.auth`、週榜是 `boards/{週}` 快照、bot token 只在 GitHub Secrets。
- `npm test` 全過。

## 還沒做、要注意

- 還沒動工，遊戲沒有改。
- 3 秒內回應的風險還沒量。
- 動工前要翊文決定的四題寫在文件最後。

## 給下一個人

- 第三步的 `/拚經濟`、`/實況`、`/斗內` 要等賭場那邊做好；`/21點`、`/大禮包`、`/餐車` 不用等。
