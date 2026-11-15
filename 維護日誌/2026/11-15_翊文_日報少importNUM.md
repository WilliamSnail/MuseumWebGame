---
日期: 2026-11-15 11:50:04
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 修正
範圍: [functions/casino.js, test/functions_imports.test.cjs, test/run_all.cjs, docs/伺服器除錯.md, docs/踩過的坑.md, AGENTS.md]
PR: 無
版本: 2026.11.11-1
測試: npm test 全過；新的 functions_imports 測試在沒修的版本會擋「casino.js 用了 NUM 卻沒 import」，修好的版本 20 支全過
狀態: 待合併
相關: []
---

## 為什麼要改

> 11-15 當天日報沒產生（house-size：最新是 11-14），財報「昨天發生的事」、景氣停在 11-14。翊文：「好，讀紀錄查」「查到後都好好歸類記好也讓其他可能來維護用的AI知道」

## 改了什麼

- functions/casino.js 補 `import { NUM } from "./shared/config.js"`。日報的對帳基準用到 `NUM.casino.world.start`（11-14 11:03 那次加的），沒 import，部署後每次產生日報都 ReferenceError。
- 新測試 test/functions_imports.test.cjs：acorn 解析 functions/*.js，用到 shared／functions 匯出的名字卻沒宣告、沒 import 就不過。
- 新文件 docs/伺服器除錯.md：查正式站問題的固定動作壹覽、查法、發生過的事；踩過的坑加四條；AGENTS.md 第 5 節加第 10 點指過去。

## 怎麼確認的

- fn-errors：「Unhandled error ReferenceError: NUM is not defined at casReport (casino.js:359)」。
- 新測試兩個方向都試過。

## 還沒做、要注意

- 上線後第壹個進館的人會產生 11-15 的日報；要用 house-size 確認最新日報變成 11-15。
- 11-14→11-15 這段的「昨天發生的事」會在這份日報補上；11-15 那天早上沒有的那份不會另外補。

## 給下一個人

- 正式站出問題先看 docs/伺服器除錯.md。
