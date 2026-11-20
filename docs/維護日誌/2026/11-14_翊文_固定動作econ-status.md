---
日期: 2026-11-14 09:00:00
作者: 翊文
AI: Claude Sonnet 5.5（Claude Code）
類型: 文件
範圍: [tools/fb_task.cjs, tools/econ_check.cjs, .github/workflows/firebase-task.yml, test/fb_task.test.cjs, test/econ_check.test.cjs, docs/經濟自我檢查.md]
PR: 無
版本: 2026.11.11-1
測試: npm test 全過；沒在正式站按過（要翊文同意才按）
狀態: 待合併
相關: [docs/經濟自我檢查.md]
---

## 為什麼要改

翊文同意加只讀固定動作 `econ-status`，讓 `econ_check --ledger` 有正式站資料可吃；NPC 買畫上限「維持現在」。

## 改了什麼

- `tools/fb_task.cjs` 新動作 `econ-status`（只讀）：讀 `casinoHouse/main` 和最新壹份 `casinoReport/日期`，只印「經濟用到的欄位」白名單（錢、債、外面世界池子、文化部館債進度、NPC 花費、館方投資、各來源累計、對帳差），兩行 JSON：`ECON_HOUSE_JSON`、`ECON_REPORT_JSON`。不印名字、uid、email、亂數祕密、錢包、畫的持有人。`econPick` 是白名單函式，有測試擋。
- `firebase-task.yml` 選單、`ACTIONS` 清單、測試壹起改。
- `tools/econ_check.cjs --ledger` 可以直接吃整份 log（找那兩行）；對帳差 ≠ 0 紅字。
- `econ:check` 的 NPC 花費上限警告改成「翊文 11-14 決定維持」：容許到每天成長的 1.2 倍，再大才紅字（現在 1.08 倍）。

## 怎麼確認的

`npm test` 全過（fb_task 加白名單測試、econ_check 加 econ-status 格式測試）；`npm run econ:check` 23 項全過。

## 還沒做、要注意

- **沒按過**：要翊文同意才在 Actions 跑 `econ-status`（只讀）。第一次跑完把 log 裡那兩行存成檔：`node tools/econ_check.cjs --ledger 檔案.txt`。
- 白名單只有目前用到的欄位；新增的帳要用就加進 `econPick`（並補測試）。

## 給下一個人

- 不要把整份 house 文件印出來，只印白名單。
