---
日期: 2026-11-15 14:32:38
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 伺服器
範圍: [tools/gh_lib.cjs, tools/say.cjs, tools/wf_run.cjs, tools/fb_run.cjs, tools/ship.cjs, tools/README.md, AGENTS.md]
PR: 無
版本: 2026.11.11-1
測試: npm test 全過；say --dry、wf_run 參數錯都照舊
狀態: 待合併
相關: []
---

## 為什麼要改

> 「記得有什麼腳本要寫都要寫，如果腳本需要合併也記得」

## 改了什麼

- 新 tools/gh_lib.cjs：gh 的路徑、跑 gh、觸發流程並認出新的那壹次、等跑完、讀紀錄。wf_run、fb_run、say、ship 原本各寫壹份，改成都叫它（順便修好 fb_run 裡壞掉的 Windows gh 路徑）。
- tools/README.md 表格加 npm run fb、Discord 彙整、gh_lib；加「腳本要寫就寫、重複的要合併」的規矩。AGENTS.md 指令那行也加壹句。

## 怎麼確認的

- npm test 全過；這壹包用合併後的 ship 上線。

## 還沒做、要注意

- 其他重複的（例如好幾支各自算台灣日期）之後遇到再合併。

## 給下一個人

- 寫新腳本要叫 GitHub，用 gh_lib，不要再自己寫。
