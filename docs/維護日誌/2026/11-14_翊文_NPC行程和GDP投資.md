---
日期: 2026-11-14 04:00:00
作者: 翊文
AI: Claude Sonnet 5.5（Claude Code）
類型: 新功能
範圍: [shared/npc_trip.js, shared/casino_stock_in.js, shared/casino_job.js, shared/casino_ticket.js, shared/casino_book.js, shared/casino_report.js, shared/casino_gdp.js, shared/notices.js, functions/casino.js, test/npc_econ.test.cjs, test/run_all.cjs, test/load_shared.cjs]
PR: 無
版本: 2026.11.11-1
測試: npm test 全過（npc_econ 4 項）；npm run build 成功；正式站沒跑過
狀態: 待合併
相關: [docs/館內NPC規劃.md, docs/經濟體系規劃.md]
---

## 為什麼要改

Yuga 轉翊文：「不一定每天都要去五家店，有些隨機性」；故事線要看全館累計；日報用 npcNews；GDP 的投資 I 加股票淨流（玩家＋館方）。

## 改了什麼

- 新檔 `shared/npc_trip.js` 的 `npcTrips`：每位 NPC（劇情角色 trace 跳過）每天各抽壹次去哪幾家店，也可能哪裡都不去。route 權重當相對機率，每家店平均壓在 `npcLambda`（2）；種子含伺服器祕密。
- 館內股的 NPC 人數改用行程加總（`casInRoll`／`casInNpcFor` 多壹個 `npcCtx { list, counters }`，伺服器傳 `NPC_LIST`）；沒傳名單（舊測試）還是 Poisson；40% 上限、劇情日加成照舊。
- 全館計數 `house.npcc { comm, hall }`：交委託（`casJobChips`）加張數、收門票（`casTicketClaim`）加人次；伺服器傳給行程（故事線的新 route 才會生效）。日報 `館內近況：` 用 `npcNews`。
- GDP：`I` 加「股票淨流入外面世界」（玩家買−賣、館方投資買−賣，只算正的），`NX` 的門票改看外面世界的流向（PR 390 之後門票不在 mint 裡，原本的算法會變 0，順手修）。

## 怎麼確認的

`npm test`、`npm run build`。`test/npc_econ.test.cjs`：行程平均約 λ、有人哪裡都不去、trace 跳過、同輸入同輸出；人數用行程加總和 40% 上限；計數和日報；GDP 的 I 和門票。

## 還沒做、要注意

- 委託的計數是全館總張數（不分是哪位委託人：每位玩家的委託是誰是玩家端抽的，伺服器對不回去），`npcNeedMet` 支援這種數字。所以 `need.commissions` 是全館累計，故事線會比設計的「每位自己累計」快。
- 網頁（展廳留言、近況）還是只看日期：要把 `house.npcc` 傳到網頁需要新的 API，沒做。
- 「job」店的名單裡愛去的人少，每個人機率封頂 1，平均約 1.5 位（低於 λ），跟其他四家不同；要補在 content 的 route。
- NPC 買畫、突發大事件 C 還沒做。

## 給下一個人

- 行程不存「誰去了哪」，只存每家店的人數（`house.sin.npc`）；要日報寫名字再存。
