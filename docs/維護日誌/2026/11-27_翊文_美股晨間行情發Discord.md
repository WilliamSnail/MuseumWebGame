---
日期: 2026-11-27 17:54:00
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 新功能
範圍: [shared/discord/us_close.js, functions/stock/us_close_public.js, functions/index.js, firebase.json, tools/content/announce.cjs, tools/content/week_check.cjs, content/排程說明.md, test/discord/us_close.test.cjs, test/load_shared.cjs, test/run_all.cjs]
PR: 無
版本: 2026.11.11-1
測試: 新測試 5 條；預約公告 22 條；npm test 全過；用 11-25 真實收盤做過範本
狀態: 待合併
相關: []
---

## 為什麼要改

> 「翊文 11-27：「能讓銀行每天早上時順便更新美股收盤價的漲跌資訊嗎」「我是說Discord上發布」「要實際數字，但是用遊戲風格發布」「就在那個時候順便發」「順便把英文代號也放上來」「這樣排版比較好」（每支壹行）「再後面加壹個遊戲風格的每日評語」「評語可以再長壹點嗎」「排程每天也會找新聞，可以配合這個做評語」」

## 改了什麼

- shared/discord/us_close.js：dcUsCloseText 組「Yuga Bot 銀行　晨間行情」：指數、漲跌各前 3 支（每支壹行，遊戲名＋代號、漲跌％、遊戲價）、家數、匯率、評語、下次開窗；dcUsCloseTalk 照指數分五種心情、各 4 句，單支 ±8% 另有句子，日期固定挑同壹句
- functions/stock/us_close_public.js（usClosePublic，Hosting /data/us_close.json）：讀 stocksUs/latest，台灣那天早上只給前壹天那場，代號由這裡傳
- announce.cjs：今日館訊同壹個時間、排在後面發 usclose-日期（11-28 起）；make 可以是非同步的、空字串不發；dN.json 有 usTalk 就換掉預設評語
- week_check：usTalk 20～140 字、壹、沒有英文字母；排程說明加寫 usTalk 的規矩

## 怎麼確認的

- npm test 全過

## 還沒做、要注意

- 上線後讀壹次 https://pepe-museum.web.app/data/us_close.json（今天美國休市，應該是空字串）
- 11-28 早上看第壹則有沒有發、排在今日館訊後面

## 給下一個人

- 評語在 US_CLOSE_TALK；要加句子直接加，壹種心情幾句都可以
