---
日期: 2026-11-23 12:50:44
作者: 翊文
AI: Claude Sonnet 5.5（Claude Code）
類型: 文件
範圍: [shared/core/systems_text.js, shared/cellar/text.js, tools/check/code_rules.cjs, test/content/check_systems.cjs]
PR: 無
版本: 2026.11.11-1
測試: npm test 全過
狀態: 待合併
相關: []
---

## 為什麼要改

> 「這個看怎麼重新安排比較正確（翊文 11-23，指 systems_text.js 快滿了、只壓成兩行不是正解）」

## 改了什麼

- 地下收藏庫的字（CELLAR、CHAPTER4、BOOK4、ENDING_CELLAR、FOE_TEXT，約 400 行）從 shared/core/systems_text.js 搬到 shared/cellar/text.js（資料夾名＝系統名），內容和順序沒動；systems_text.js 1196 → 800 行。
- 12 個用到的檔改 import；load_shared 加檔；check_systems 把兩個檔當成壹份檢查；pass_sources 的掃描加這個檔；esm_smoke 改讀新檔。
- 舊的 5 本禁書續集還原成 4 行壹本，新的 5 本也展開（11-23 壓成兩行是暫時的）。
- code_rules 第 4 條（畫面文字用壹）：同壹次 diff 裡被刪掉又出現的行是搬家，不算新加（附測試）。
- ui_core.js 因為多壹行 import 少壹個空行，BIG 改 1349。AGENTS.md、架構.md 加壹句指向新檔。

## 怎麼確認的

- npm test 全過
- esm_smoke、check_systems 單跑過

## 還沒做、要注意

- 沒在瀏覽器打開過地下收藏庫和圖書館；import 路徑由 check_imports 和 esm_smoke 擋

## 給下一個人

- systems_text.js 現在 800 行，還有 400 行空間；下壹個該拆的是 CLIENT_LINES、LEGACY_TEXT／TRAIT_TEXT（參觀者繼承）或 FUN_TEXT／HOLIDAY_TEXT（節日）
- 舊文件裡的行號（docs/規劃/延伸世界展品整理）是 11-22 的，沒更新
