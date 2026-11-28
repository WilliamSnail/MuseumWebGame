---
日期: 2026-11-28 09:42:36
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 新功能
範圍: [shared/stock/text.js, functions/stock/stock_us.js, shared/core/config.js, tools/content/stocks_fetch.cjs, content/stocks/daily.json, test/stock/stocks_us.test.cjs, test/stock/out_stocks_cat.test.cjs]
PR: 無
版本: 2026.11.11-1
測試: npm test 全過、econ:check 0 沒過、ui:check bank:股票 沒問題；daily.json 抓到 27 支；CNBC、Yahoo 都抓得到 GOOGL
狀態: 待合併
相關: []
---

## 為什麼要改

> 「翊文 11-28：「美股可以加入 GOOGL」」

## 改了什麼

- 館外美股加「彩字搜尋鋪」（id searchshop，GOOGL，科技、ext），27 支
- 伺服器代號 GOOGL、中文名 Alphabet（Google）
- sd15 0.35、minSd 0.09（Yahoo 過去壹個月 15 分鐘價算的，跟微軟差不多）
- daily.json 重抓（3 個月）；配股息清單自動帶到
- 測試支數 26 → 27；館方公告

## 怎麼確認的

- npm test 全過
- npm run econ:check 沒有沒過的
- ui:check bank:股票

## 還沒做、要注意

- 上線後下壹個美股開盤（台灣傍晚盤前）看 stock-status 有沒有 searchshop 的價

## 給下一個人

- 跨海科技集團（g-overseas）只綁最早 6 支，新加的都沒綁，GOOGL 照這樣
