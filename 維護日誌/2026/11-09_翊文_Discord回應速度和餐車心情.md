---
日期: 2026-11-09 21:37:32
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 修正
範圍: [functions/discord.js, shared/casino_wallet.js, shared/casino_text.js, .github/workflows/discord-log.yml]
PR: 無
版本: 2026.11.08-1
測試: npm test 全過
狀態: 待合併
相關: [docs/決定/0051-Discord聯動.md]
---

## 為什麼要改

> 「餐車指令剛剛試還是常常這樣」
>
> 「吃餐車恢復的心情應該也要再買之後說一下」

## 改了什麼

- `discordBot` 啟動時先連好資料庫才開始接請求：新機器第一次讀資料庫要 1.9～2.7 秒，加上網路會超過 Discord 的 3 秒，常駐的機器每 15～20 分鐘又會換一台。
- 買餐車顯示「心情 +N（現在 M）」；沒有挑戰模式參觀者時，說明心情不會變。遊戲和 Discord 同一份文字。
- 手動流程「Discord 指令耗時」改用 `gcloud logging read`：`firebase functions:log` 只回 15 行。

## 怎麼確認的

- 真實紀錄：`food 2097ms`、`board 1898ms`、`link 2714ms` 都是新機器第一次；之後 100～500ms。
- `npm test` 全過。

## 還沒做、要注意

- 部署後看紀錄的 `discordBot warm`，並在真的 Discord 再試。

## 給下一個人

- 並發的請求會多開機器（`concurrency: 1`）；新機器也會先預熱，但請求要等。常常發生再考慮換 1 顆 CPU，每月約 8 美元。
