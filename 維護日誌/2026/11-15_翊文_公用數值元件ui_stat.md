---
日期: 2026-11-15 16:33:04
作者: 翊文
AI: Claude Sonnet 5.5（Claude Code）
類型: 新功能
範圍: [web/src/ui_stat.js, web/src/css/stat.css, web/src/ui_bank.js, docs/class名單.md]
PR: 無
版本: 2026.11.11-1
測試: npm test 全過
狀態: 待合併
相關: []
---

## 為什麼要改

> 「這些數值要在哪裡可以看得到也想一下，寫個公用的方式，這樣以後哪邊都好呼叫」

## 改了什麼

- 新增 web/src/ui_stat.js：statBadge（小牌）、statBar（長條）、statLegend（圖例）、statBands（四格分布）、statCounts（把各分級幾個轉成元件吃的項目，名字和 tone 都叫 statView）
- 新增 css/stat.css：tone 的顏色只寫這裡（sv-、tone- 前綴，已加進 class名單）
- 財報「外面世界」卡改用它：狀態名字改成 statView 的（一般／減薪／緊縮／裁員），預算倍率旁多一張小牌＋一句話（多一點／照常／保守／很省）

## 怎麼確認的

- 1920 用示範資料看過，顏色和排版正確
- 沒看手機 375 展開

## 還沒做、要注意

- npcSan、unitUnrest、crowdMood 等理智值接上資料後，statView 回 null 的就不顯示；元件已吃 statView 回傳

## 給下一個人

- statCounts 目前只認 unitState、unitHealth（沒有 id 時用代表值問 statView）；要加別的 kind 在 rep() 補
- tone 的 CSS 預設值用 :where()，不然會蓋掉 tone- 的顏色

## 補：玩家看得到數字（翊文定）

- statBadge 多了 kind 選項，小牌上多寫數字；格式只寫在 ui_stat.js 的 statNum：預算倍率「×0.82」、集團健康值兩位小數、三種理智值整數、集團狀態沒有數字就不寫。
- 外面世界卡的預算倍率小牌現在是「保守｜×0.82」加一句話。
