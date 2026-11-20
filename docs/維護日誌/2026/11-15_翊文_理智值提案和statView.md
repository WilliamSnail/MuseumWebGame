---
日期: 2026-11-15 21:00:00
作者: 翊文
AI: Claude Sonnet 5.5（Claude Code）
類型: 文件
範圍: [docs/理智值提案.md, shared/stat_view.js, shared/world.js, tools/world_health.cjs, test/load_shared.cjs, test/world_split.test.cjs, docs/決定/0088-公用的 statView：數值的分級只寫一處.md]
PR: 無
版本: 2026.11.14-1
測試: npm test、test/world_split.test.cjs（statView 一項）；沒有改畫面、沒有改任何錢的數字
狀態: 待合併
相關: [docs/理智值提案.md, docs/決定/0088-公用的 statView：數值的分級只寫一處.md]
---

## 為什麼要改

翊文要給有名字的 NPC、集團、散客各一種理智值（先出提案），並且要一個公用的讀法讓各處叫。

## 改了什麼

- 新增 `docs/理智值提案.md`：三種值（NPC 理智＝累積型、集團集體不安＝慣性型、散客展廳氣氛＝無狀態）、存在哪、每天怎麼變、影響什麼、看得到的地方、`statView`、要配的腳本、要翊文定的 8 件事。
- 新增 `shared/stat_view.js`：`statView`、`statBandOf`；`unitHealth`、`unitState`、`budgetMult` 有資料，三個理智值的分級表先放著。`whCard`、`world:health` 改叫它。

## 怎麼確認的

- 測試：健康值的門檻用「小於」跟 W5 一致、沒有資料回 null、數字或莊家文件都能讀、財報卡的分布用同一個分級。`npm test` 全過。

## 還沒做、要注意

- 畫面元件交給美術統籌；三個理智值等翊文定。
- 新的頂層名字（`statView`、`statBandOf`、`STAT_*`）不能跟別的檔重複（`svN`、`svNum` 等加了前綴）。

## 給下一個人

要改分級：只改 `shared/stat_view.js`（健康值的門檻改 `NUM.casino.worldDoc.health`）。
