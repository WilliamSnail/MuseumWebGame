---
日期: 2026-11-22 15:18:57
作者: 翊文
AI: Claude Sonnet 5.5（Claude Code）
類型: 修正
範圍: [tools/release/ship.cjs, test/tools/ci_skip.test.cjs]
PR: 無
版本: 2026.11.11-1
測試: ci_skip 測試過
狀態: 待合併
相關: []
---

## 為什麼要改

> 「都完成後重新檢視一下用的腳本需不需要改進和優化」

## 改了什麼

- --brief 的過濾正規式壹個反斜線被吃掉，最後壹行沒印；改成純函式 briefLine 加測試

## 怎麼確認的

- briefLine 測試

## 還沒做、要注意

- 無。

## 給下一個人

- 無。
