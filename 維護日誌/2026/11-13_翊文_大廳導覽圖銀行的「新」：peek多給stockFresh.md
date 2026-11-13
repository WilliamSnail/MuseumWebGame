---
日期: 2026-11-13 23:37:48
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 伺服器
範圍: [shared/casino_stock.js, functions/casino.js, test/casino_stock.test.cjs]
PR: 無
版本: 2026.11.11-1
測試: npm test 全過
狀態: 待合併
相關: []
---

## 為什麼要改

> 「未來更新筆記：導覽圖上銀行的「新」。美術統籌查過：大廳只叫 casino peek，拿不到股票的 fresh，要伺服器在 peek 多給壹個數字」

## 改了什麼

- casStockFreshN(w, house)：館外有幾支股票的價自從上次「看過了」之後變過（跟 view 的 fresh 同算法）
- peek 多讀壹次莊家文件（只讀），回 stockFresh

## 怎麼確認的

- npm test 全過；新測試：沒看過全算新、看過歸零、壹支變了算 1

## 還沒做、要注意

- 畫面由美術統籌接（ui_today.js readCasino → 導覽圖銀行畫「新」，進股票頁送 seen 後清 0）
- 館內五家店的 fresh 沒算進來（要伺服器祕密算曲線），之後要的話再加

## 給下一個人

- 無。
