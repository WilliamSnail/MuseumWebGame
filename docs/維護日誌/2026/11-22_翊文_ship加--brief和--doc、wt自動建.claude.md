---
日期: 2026-11-22 15:10:11
作者: 翊文
AI: Claude Sonnet 5.5（Claude Code）
類型: 文件
範圍: [tools/release/ship.cjs, tools/dev/new_worktree.cjs, test/tools/ci_skip.test.cjs]
PR: 無
版本: 2026.11.11-1
測試: ci_skip 測試過；npm test 由 ship 跑
狀態: 待合併
相關: []
---

## 為什麼要改

> 「都完成後重新檢視一下用的腳本需不需要改進和優化」

## 改了什麼

- ship --brief：只印 ✓／✗ 和失敗行，背景跑不用再接 grep
- ship --doc spec.json：先寫維護日誌再上線，壹個指令做完
- wt 開的工作資料夾自動建 .claude/，不用手動 mkdir

## 怎麼確認的

- parseArgs 測試；ship 載入正常

## 還沒做、要注意

- 寫帳本的 node 腳本常因為跳脫字元出錯（反斜線被吃掉、換行被插進字串）：之後改用 ledger apply 的 JSON，或把腳本放檔案
- 測試裡寫死的帳本數字（揭露數 23、看懂 26）改成讀資料，免得改帳本就紅

## 給下一個人

- 無。
