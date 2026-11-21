---
日期: 2026-11-21 22:30:00
作者: 數值平衡
AI: Claude Sonnet 5.5（Claude Code）
類型: 修正
範圍: [tools/fb/fb_task.cjs, test/tools/fb_task.test.cjs]
PR: 無
版本: 2026.11.21
測試: npm test 全過（fb_task 測試多一項：打牌中的錢、跳過 NPC、合計含打牌中；測試排隊跑，避免兩個測試同時換 console.log）
狀態: 待合併
相關: [docs/決定/0150-新牌桌遊戲：佩佩轉盤、差一畫先做，德州之後.md]
---

# house-ledger 把「打牌中」的錢另外印出來

## 為什麼要改
Yuga 存基準（德州多人桌前）發現全館合計比下午（德州 2 人桌前）少 290 萬。house-ledger 的「全館的錢合計」本來就寫「不含在路上的借款、打到一半的注」：德州的買入搬到桌上（`casinoHoldem` 的 stack）之後不在錢包、也不在莊家帳上，有人坐在桌上合計就會變少；21 點打到一半的注、牌桌上的注也一樣。日報（`reportSnap`）早就把這些算進去，ledger 沒有。

## 改了什麼
`tools/fb/fb_task.cjs` 的 `houseLedger` 多印一行「打牌中」：21 點打到一半的注（`casinoRounds`、`casinoTables`，跳過 NPC 和已結算的）＋ 德州撲克桌上的籌碼（`casinoHoldem` 每個座位的 stack＋put，跳過 NPC）和「含打牌中的全館合計」。原本那行合計不變（跟舊基準比得起來）。

## 怎麼確認的
測試：合計 1,100、21 點注 50、德州 700（NPC 和已結算的不算）、含打牌中的合計 1,850。**還沒對正式站跑**：請 Yuga 上線後再按一次 house-ledger，「打牌中」那行的德州籌碼應該約等於少掉的 290 萬；如果對不上，要另外找原因。

## 還沒做、要注意
- 這只是印出來，沒有改任何錢的流向。
- 上線後再按 house-ledger 比對：新基準的「不含打牌中」合計會比舊基準少，少的部分＝「打牌中」。

## 給下一個人
新增任何「錢離開錢包、也不在莊家帳上」的桌子，都要加進 `houseLedger` 的打牌中和 `reportSnap` 的 inplay（兩處同一套算法）。
