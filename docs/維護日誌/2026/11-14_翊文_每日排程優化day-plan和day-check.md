---
日期: 2026-11-14 10:27:01
作者: 翊文
AI: Claude Sonnet 5.5（Claude Code）
類型: 內容
範圍: [content/排程說明.md, tools/day_plan.cjs, tools/day_check.cjs, test/day_plan.test.cjs, test/run_all.cjs, test/funday.test.cjs, package.json]
PR: 無
版本: 2026.11.11-1
測試: npm test 全過
狀態: 待合併
相關: [docs/劇情揭露節奏.md]
---

## 為什麼要改

> 「稍微檢查一下每日排程要做的是，能不能優化，讓他方便做完事情，需要腳本也可以」
>
> 「能夠跟【今日冷知識】酸黃瓜日：罐子打開的那壹刻，整間休息室都醒了 這類型的也做合作嗎? 可以查有什麼特殊節日來有理由舉辦活動」

## 改了什麼

- 新指令 npm run day:plan：印出今天要做什麼（週幾、揭露週／回聲週／大揭曉週、週包缺 npc／fest、NPC 該補的段、market、要建立的檔、最後要跑的指令）；週一會列出這週 d3 以後的節日和趣味節日，建議 fest／npc 的店和活動名（照最近幾週用過的店輪流）；--week 看七天的日子；--json。
- 新指令 npm run day:check：週包、帳本、揭露節奏、NPC、名單打包、日誌、預約公告、趣味節日清單壹次跑完，印過／沒過清單，沒過結束碼 1。
- content/排程說明.md：最上面加壹頁清單（週一／每天各 10 步，指到詳細規矩）；週二到週日獨立成第二節；一之二～一之十一照順序排好（編號不改）；規矩壹條都沒刪，只改了過時的說法（地下室畫面已上線、early 已拿掉、三節的指令）；加上 fest 優先排在趣味節日、節日不夠時上網查並補進 FUN_INFO／FUN_TEXT 的規矩。
- test/funday.test.cjs：趣味節日數量上限放寬到 400（排程會補新的）。

## 怎麼確認的

- npm test 全過；test/day_plan.test.cjs 15 項。

## 還沒做、要注意

- claude.ai 的排程要翊文改：提示詞第壹步改成 npm run day:plan，最後改成 npm run day:check、npm run ship；環境要能跑 node 和 gh。

## 給下一個人

- 地下室畫面已上線，排程可以開始放 cellar 怪物（一之八）；如果翊文想暫緩，把那段「現在的狀態」改回去。
