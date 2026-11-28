---
日期: 2026-11-28 12:16:48
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 新功能
範圍: [shared/stock/text.js, shared/stock/in_text.js, web/src/rooms/bank/bank_emo.js, web/src/rooms/bank/ui_bank.js, web/src/rooms/bank/bank_trades.js, functions/stock/evening_post.js, functions/stock/us_close_public.js]
PR: 無
版本: 2026.11.11-1
測試: npm test 全過；ui:check 30 個畫面沒問題；bank:股票 手機、電腦截圖看過
狀態: 待合併
相關: []
---

## 為什麼要改

> 「翊文 11-28：「discord上股票有emoji，遊戲上也可以顯示嗎」「好，都配」」

## 改了什麼

- 館外 46 支、館內 5 支每支加 emo（不重複），存在股票名單
- 銀行畫面用 bank_emo.js 的 stNm 照 id 加 emoji：行情清單、個股標題、持倉、槓桿部位、掛單、交易紀錄、確認框
- Discord 晨間、傍晚行情的名字表改用 shared/stock/text.js 的 OUT_NAMES_EMO（名字前面有 emoji）
- 測試：每支都有 emoji、不重複；館方公告

## 怎麼確認的

- npm test 全過
- npm run ui:check 沒有發現問題
- bank:股票 手機 375 寬、電腦 2140×1440 截圖：清單、個股、手機下面的切換列都有 emoji，沒擠壞

## 還沒做、要注意

- 集團股沒有配（不在股票名單裡），照原名
- 假伺服器的錄製資料還是舊的 26 支美股，只影響本機看畫面

## 給下一個人

- 量子蛙籠沒用青蛙 emoji（界線：不碰佩佩的樣子），用 ⚛️
- 新加股票要配 emo，測試會擋沒配或重複的
